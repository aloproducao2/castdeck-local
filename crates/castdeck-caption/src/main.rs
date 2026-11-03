// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
//
// Worker de legenda ao vivo do CastDeck.
//  - entrada (stdin): PCM s16le, mono, 16 kHz, contínuo (o servidor Node repassa o que vem do estúdio)
//  - saída (stdout): uma linha JSON por evento ({"type":"ready"|"partial"|"final"|"vad"|"error", ...})
//  - argumentos: --model <arquivo.bin> --lang pt|auto|en... --translate 0|1 --threads N --partials 0|1 --prompt "..."
//
// Roda como processo separado (embutido no CastDeck.exe e extraído para a pasta do app): se travar,
// só a legenda cai e o servidor reinicia. O servidor também baixa a prioridade do processo no sistema,
// para o encoder e o WebRTC terem preferência quando a CPU apertar.
//
// Segmentação: VAD por energia com piso de ruído adaptativo (leve, sem modelo extra). Corta a frase
// numa pausa de ~0,5 s ou aos 8 s de fala contínua; enquanto a pessoa fala, solta "parciais" a cada ~1 s
// (só se o reconhecedor estiver livre, para nunca formar fila).

use serde_json::json;
use std::io::{self, BufWriter, Read, Write};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const SR: usize = 16_000;
const FRAME: usize = 480; // 30 ms
const PREROLL_FRAMES: usize = 10; // 300 ms antes do início da fala (não corta a primeira sílaba)
const START_FRAMES: usize = 3; // 90 ms de fala para abrir a frase
const END_SILENCE_FRAMES: usize = 17; // ~510 ms de silêncio fecha a frase
const MAX_SEGMENT: usize = SR * 8; // corta frases longas aos 8 s (a legenda não pode esperar o fim do discurso)
const PARTIAL_EVERY: usize = SR; // parcial a cada ~1 s de fala nova

struct Opts {
    model: String,
    lang: String,
    translate: bool,
    threads: i32,
    partials: bool,
    dual: bool,
    prompt: String,
    beam: i32,
    ctx_min: i32,
}

fn parse_args() -> Opts {
    let mut o = Opts { model: String::new(), lang: "pt".into(), translate: false, threads: 4, partials: true, dual: false, prompt: String::new(), beam: 1, ctx_min: 512 };
    let a: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < a.len() {
        let v = a.get(i + 1).cloned().unwrap_or_default();
        match a[i].as_str() {
            "--model" => o.model = v,
            "--lang" => o.lang = v,
            "--translate" => o.translate = v == "1",
            "--threads" => o.threads = v.parse().unwrap_or(4).clamp(1, 16),
            "--partials" => o.partials = v != "0",
            "--dual" => o.dual = v == "1",
            "--beam" => o.beam = v.parse().unwrap_or(1).clamp(1, 5),
            "--ctx-min" => o.ctx_min = v.parse().unwrap_or(512).clamp(256, 1500),
            "--prompt" => o.prompt = v,
            _ => {
                i += 1;
                continue;
            }
        }
        i += 2;
    }
    o
}

// stdout é compartilhado entre a thread de áudio (vad) e a de reconhecimento (textos)
type Out = Arc<Mutex<BufWriter<io::Stdout>>>;
fn emit(out: &Out, v: serde_json::Value) {
    if let Ok(mut w) = out.lock() {
        let _ = writeln!(w, "{}", v);
        let _ = w.flush();
    }
}

enum Job {
    Partial { id: u64, samples: Vec<f32> },
    Final { id: u64, samples: Vec<f32>, t0: f64, t1: f64 },
}

// Whisper inventa frases conhecidas em trechos sem fala ("Legendas pela comunidade...", "[Música]"):
// remove o que estiver entre colchetes/parênteses e descarta as frases-fantasma mais comuns.
fn clean(text: &str) -> String {
    let mut s = String::with_capacity(text.len());
    let mut depth = 0i32;
    for c in text.chars() {
        match c {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = (depth - 1).max(0),
            '♪' | '♫' | '*' => {}
            _ if depth == 0 => s.push(c),
            _ => {}
        }
    }
    let t = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let low = t.to_lowercase();
    const GHOSTS: [&str; 10] = [
        "legendas pela comunidade",
        "amara.org",
        "obrigado por assistir",
        "inscreva-se no canal",
        "legendado por",
        "tradução e legendas",
        "thanks for watching",
        "subtitles by",
        "e aí, pessoal",
        "transcrição por",
    ];
    if GHOSTS.iter().any(|g| low.contains(g)) {
        return String::new();
    }
    // só pontuação/reticências não é legenda
    if !t.chars().any(|c| c.is_alphanumeric()) {
        return String::new();
    }
    t
}

// Texto composto só por palavras do dicionário/prompt (e curto ou repetido) = eco do prompt em ruído/música.
fn echoes_prompt(text: &str, prompt: &str) -> bool {
    let words = |s: &str| -> Vec<String> {
        s.to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| !w.is_empty())
            .map(|w| w.to_string())
            .collect()
    };
    let tw = words(text);
    if tw.is_empty() {
        return false;
    }
    let pw = words(prompt);
    if pw.is_empty() || !tw.iter().all(|w| pw.contains(w)) {
        return false;
    }
    let repeated = tw.windows(2).any(|w| w[0] == w[1]);
    repeated || tw.len() <= 8
}

// parâmetros comuns do reconhecimento. audio_ctx encolhe a janela do codificador para o tamanho real da frase
// (o Whisper sempre processa 30 s; numa frase de 3 s isso é quase tudo desperdício de CPU).
// Ajustes por modelo (vindos do servidor): busca em feixe só nas frases finais (mais precisa, as parciais ficam
// rápidas) e janela mínima do codificador maior para modelos grandes (encolher demais derruba a precisão deles).
static TUNE: std::sync::OnceLock<(i32, i32)> = std::sync::OnceLock::new();

fn params<'a, 'b>(threads: i32, samples: usize, fin: bool) -> FullParams<'a, 'b> {
    let (beam, ctx_min) = *TUNE.get().unwrap_or(&(1, 512));
    let mut p = if fin && beam > 1 {
        FullParams::new(SamplingStrategy::BeamSearch { beam_size: beam, patience: -1.0 })
    } else {
        FullParams::new(SamplingStrategy::Greedy { best_of: 1 })
    };
    p.set_n_threads(threads);
    p.set_no_context(true);
    p.set_single_segment(true);
    p.set_print_special(false);
    p.set_print_progress(false);
    p.set_print_realtime(false);
    p.set_print_timestamps(false);
    p.set_suppress_blank(true);
    p.set_suppress_nst(true);
    p.set_temperature(0.0);
    // música/ruído: sem fallback de amostragem e mais rígido para "sem fala" e baixa confiança
    p.set_temperature_inc(0.0);
    p.set_no_speech_thold(0.75);
    p.set_logprob_thold(-0.9);
    p.set_entropy_thold(2.2);
    let secs = samples as f32 / SR as f32;
    let ctx = ((secs + 1.0) * 50.0) as i32;
    // parciais podem usar janela menor (mais rápidas); a frase final usa a janela mínima do modelo
    let min = if fin { ctx_min } else { ctx_min.min(512) };
    p.set_audio_ctx(ctx.clamp(min, 1500));
    p
}

fn collect(state: &whisper_rs::WhisperState) -> String {
    let mut text = String::new();
    for i in 0..state.full_n_segments() {
        if let Some(seg) = state.get_segment(i) {
            if let Ok(t) = seg.to_str_lossy() {
                text.push_str(&t);
            }
        }
    }
    text
}

fn main() {
    let o = parse_args();
    let _ = TUNE.set((o.beam, o.ctx_min));
    let out: Out = Arc::new(Mutex::new(BufWriter::new(io::stdout())));
    if o.model.is_empty() {
        emit(&out, json!({"type":"error","error":"modelo não informado (--model)"}));
        std::process::exit(2);
    }
    // silencia o log do whisper.cpp no stderr (o servidor guarda o stderr só para diagnóstico)
    whisper_rs::install_logging_hooks();
    let ctx = match WhisperContext::new_with_params(&o.model, WhisperContextParameters::default()) {
        Ok(c) => c,
        Err(e) => {
            emit(&out, json!({"type":"error","error":format!("falha ao carregar o modelo: {e}")}));
            std::process::exit(3);
        }
    };
    let mut state = match ctx.create_state() {
        Ok(s) => s,
        Err(e) => {
            emit(&out, json!({"type":"error","error":format!("falha ao preparar o reconhecedor: {e}")}));
            std::process::exit(3);
        }
    };

    // trabalhos na fila do reconhecedor: parcial só sai com a fila vazia (nunca atrasa uma frase final)
    let busy = Arc::new(AtomicUsize::new(0));
    let (tx, rx) = mpsc::channel::<Job>();

    // ---------- thread de reconhecimento ----------
    let out_r = out.clone();
    let busy_r = busy.clone();
    let lang = o.lang.clone();
    let prompt = o.prompt.clone();
    let translate = o.translate;
    let threads = o.threads;
    let dual = o.dual && !o.translate;
    let recog = thread::spawn(move || {
        let mut last_final = String::new();
        for job in rx {
            let (id, mut samples, fin, t0, t1) = match job {
                Job::Partial { id, samples } => (id, samples, false, 0.0, 0.0),
                Job::Final { id, samples, t0, t1 } => (id, samples, true, t0, t1),
            };
            let real_len = samples.len();
            // o whisper.cpp exige pelo menos 1 s de áudio: completa com silêncio
            if samples.len() < SR + SR / 20 {
                samples.resize(SR + SR / 20, 0.0);
            }
            let mut p = params(threads, real_len, fin);
            p.set_translate(translate);
            p.set_language(if lang == "auto" { None } else { Some(lang.as_str()) });
            // contexto: usa SÓ as palavras do programa quando existem (o dicionário já basta para grafia);
            // misturar o fim da frase anterior fazia o Whisper repetir o próprio prompt em música/ruído.
            let ctxp = if prompt.is_empty() {
                let t = last_final.trim();
                let cut = t.char_indices().rev().nth(160).map(|(i, _)| i).unwrap_or(0);
                t[cut..].to_string()
            } else {
                let t = prompt.trim();
                let cut = t.char_indices().nth(300).map(|(i, _)| i).unwrap_or(t.len());
                t[..cut].to_string()
            };
            if !ctxp.trim().is_empty() {
                p.set_initial_prompt(ctxp.trim());
            }
            let started = std::time::Instant::now();
            let res = state.full(p, &samples);
            let ms = started.elapsed().as_millis() as u64;
            busy_r.fetch_sub(1, Ordering::SeqCst);
            if let Err(e) = res {
                emit(&out_r, json!({"type":"error","error":format!("reconhecimento falhou: {e}")}));
                continue;
            }
            let mut text = clean(&collect(&state));
            // música/ruído: o Whisper devolve palavras do próprio dicionário em loop. Se TODO o texto veio
            // do prompt (e é curto ou repetido), descarta em vez de mostrar "Instagram Instagram..."
            if !prompt.is_empty() && echoes_prompt(&text, &prompt) {
                text.clear();
            }
            if text.is_empty() {
                if fin {
                    emit(&out_r, json!({"type":"final","id":id,"text":"","t0":t0,"t1":t1,"ms":ms}));
                }
                continue;
            }
            if fin {
                // guarda só o finalzinho como contexto (prompt longo deixa o reconhecimento mais lento)
                let tail: Vec<&str> = text.split_whitespace().rev().take(12).collect();
                last_final = tail.into_iter().rev().collect::<Vec<_>>().join(" ");
                emit(&out_r, json!({"type":"final","id":id,"text":text,"t0":t0,"t1":t1,"ms":ms}));
                // modo duplo: a mesma frase também em inglês (só nas finais, para não dobrar o custo das parciais)
                if dual {
                    let mut p2 = params(threads, real_len, true);
                    p2.set_translate(true);
                    p2.set_language(if lang == "auto" { None } else { Some(lang.as_str()) });
                    let st2 = std::time::Instant::now();
                    if state.full(p2, &samples).is_ok() {
                        let en = clean(&collect(&state));
                        if !en.is_empty() {
                            emit(&out_r, json!({"type":"final","id":id,"text":en,"lang":"en","t0":t0,"t1":t1,"ms":st2.elapsed().as_millis() as u64}));
                        }
                    }
                }
            } else {
                emit(&out_r, json!({"type":"partial","id":id,"text":text,"ms":ms}));
            }
        }
    });

    emit(&out, json!({"type":"ready","translate":o.translate,"lang":o.lang}));

    // ---------- leitura do áudio + VAD (thread principal) ----------
    let mut stdin = io::stdin().lock();
    let mut raw = vec![0u8; FRAME * 2 * 8];
    let mut carry: Vec<u8> = Vec::new();
    let mut frame: Vec<f32> = Vec::with_capacity(FRAME);
    let mut preroll: std::collections::VecDeque<Vec<f32>> = std::collections::VecDeque::new();
    let mut seg: Vec<f32> = Vec::new();
    let mut speaking = false;
    let mut hot = 0usize; // quadros seguidos com fala
    let mut quiet = 0usize; // quadros seguidos sem fala
    let mut noise = 0.004f32; // piso de ruído (RMS) adaptativo
    let mut since_partial = 0usize;
    let mut seg_id: u64 = 0;
    let mut pos: usize = 0; // amostras recebidas desde o início (tempo da frase)
    let mut seg_start: usize = 0;

    let finish = |seg: &mut Vec<f32>, id: u64, start: usize, end: usize, tx: &mpsc::Sender<Job>, busy: &AtomicUsize| {
        if seg.len() > SR / 3 {
            busy.fetch_add(1, Ordering::SeqCst);
            let _ = tx.send(Job::Final { id, samples: std::mem::take(seg), t0: start as f64 / SR as f64, t1: end as f64 / SR as f64 });
        } else {
            seg.clear();
        }
    };

    loop {
        let n = match stdin.read(&mut raw) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        carry.extend_from_slice(&raw[..n]);
        let usable = carry.len() / 2 * 2;
        let mut i = 0;
        while i + 1 < usable {
            let v = i16::from_le_bytes([carry[i], carry[i + 1]]) as f32 / 32768.0;
            frame.push(v);
            i += 2;
            if frame.len() < FRAME {
                continue;
            }
            pos += FRAME;
            let rms = (frame.iter().map(|x| x * x).sum::<f32>() / FRAME as f32).sqrt();
            let is_speech = rms > (noise * 3.0).max(0.006);
            if !speaking {
                // piso de ruído só aprende no silêncio (sobe devagar, desce rápido)
                noise = if rms < noise { noise * 0.9 + rms * 0.1 } else { noise * 0.995 + rms * 0.005 };
                preroll.push_back(frame.clone());
                if preroll.len() > PREROLL_FRAMES {
                    preroll.pop_front();
                }
                hot = if is_speech { hot + 1 } else { 0 };
                if hot >= START_FRAMES {
                    speaking = true;
                    quiet = 0;
                    since_partial = 0;
                    seg_id += 1;
                    seg_start = pos.saturating_sub(preroll.len() * FRAME);
                    for f in preroll.drain(..) {
                        seg.extend_from_slice(&f);
                    }
                    emit(&out, json!({"type":"vad","speech":true,"id":seg_id}));
                }
            } else {
                seg.extend_from_slice(&frame);
                since_partial += FRAME;
                quiet = if is_speech { 0 } else { quiet + 1 };
                let end = quiet >= END_SILENCE_FRAMES;
                let too_long = seg.len() >= MAX_SEGMENT;
                if end || too_long {
                    // descarta o silêncio do fim (só atrasa e às vezes vira texto-fantasma)
                    if end {
                        let cut = seg.len().saturating_sub((END_SILENCE_FRAMES - 3) * FRAME);
                        seg.truncate(cut);
                    }
                    finish(&mut seg, seg_id, seg_start, pos, &tx, &busy);
                    emit(&out, json!({"type":"vad","speech":false,"id":seg_id}));
                    if too_long && !end {
                        // continua falando: abre a próxima frase na sequência
                        seg_id += 1;
                        seg_start = pos;
                        since_partial = 0;
                        emit(&out, json!({"type":"vad","speech":true,"id":seg_id}));
                    } else {
                        speaking = false;
                        hot = 0;
                    }
                } else if o.partials && quiet < 6 && since_partial >= PARTIAL_EVERY && seg.len() >= SR && busy.load(Ordering::SeqCst) == 0 {
                    since_partial = 0;
                    busy.fetch_add(1, Ordering::SeqCst);
                    let _ = tx.send(Job::Partial { id: seg_id, samples: seg.clone() });
                }
            }
            frame.clear();
        }
        carry.drain(..usable);
    }
    // fim do stdin: fecha a frase pendente e espera o reconhecimento terminar
    if speaking {
        finish(&mut seg, seg_id, seg_start, pos, &tx, &busy);
    }
    drop(tx);
    let _ = recog.join();
}
