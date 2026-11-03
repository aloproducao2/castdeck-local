// SPDX-License-Identifier: AGPL-3.0-only
// Worker de legenda ao vivo streaming com sherpa-onnx (Kroko pt-BR, Zipformer2+Transducer).
//   entrada (stdin): PCM s16le, mono, 16 kHz
//   saída (stdout):  JSON por linha (ready/partial/final/error)
//   args: --model <dir> (contém encoder/decoder/joiner .int8.onnx + tokens.txt) --lang pt|en|es
use std::io::{self, Read, Write};
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig};

const SR: usize = 16_000;
const FRAME: usize = SR * 30 / 1000; // 30 ms

fn emit(v: serde_json::Value) {
    println!("{}", v);
    let _ = io::stdout().flush();
}

fn main() {
    let mut dir: Option<String> = None;
    let mut lang = "pt".to_string();
    let a: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < a.len() {
        match a[i].as_str() {
            "--model" => { dir = a.get(i + 1).cloned(); i += 2; }
            "--lang" => { lang = a.get(i + 1).cloned().unwrap_or_else(|| "pt".into()); i += 2; }
            _ => { i += 1; }
        }
    }
    let dir = match dir {
        Some(d) => d,
        None => { emit(serde_json::json!({"type":"error","error":"--model <dir> obrigatório"})); std::process::exit(2); }
    };
    emit(serde_json::json!({"type":"ready","lang":lang}));

    let mut cfg = OnlineRecognizerConfig::default();
    cfg.model_config.transducer.encoder = Some(format!("{dir}/encoder.int8.onnx"));
    cfg.model_config.transducer.decoder = Some(format!("{dir}/decoder.int8.onnx"));
    cfg.model_config.transducer.joiner = Some(format!("{dir}/joiner.int8.onnx"));
    cfg.model_config.tokens = Some(format!("{dir}/tokens.txt"));
    cfg.model_config.num_threads = 4;
    cfg.decoding_method = Some("greedy_search".into());
    cfg.enable_endpoint = true;
    cfg.rule1_min_trailing_silence = 1.2;
    cfg.rule2_min_trailing_silence = 0.5;
    cfg.rule3_min_utterance_length = 6.0;

    let rec = match OnlineRecognizer::create(&cfg) {
        Some(r) => r,
        None => { emit(serde_json::json!({"type":"error","error":"falha ao criar reconhecedor sherpa-onnx"})); std::process::exit(3); }
    };

    let stream = rec.create_stream();
    let mut raw = [0u8; FRAME * 2];
    let mut last_partial = String::new();
    loop {
        let n = match io::stdin().read(&mut raw) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        let usable = n / 2 * 2;
        let mut samples = Vec::with_capacity(usable / 2);
        for j in (0..usable).step_by(2) {
            samples.push(i16::from_le_bytes([raw[j], raw[j + 1]]) as f32 / 32768.0);
        }
        stream.accept_waveform(SR as i32, &samples);
        while rec.is_ready(&stream) {
            rec.decode(&stream);
        }
        if rec.is_endpoint(&stream) {
            if let Some(r) = rec.get_result(&stream) {
                let text = r.text.trim().to_string();
                if !text.is_empty() {
                    emit(serde_json::json!({"type":"final","id":1,"text":text}));
                    last_partial = String::new();
                }
            }
            rec.reset(&stream);
        } else if let Some(r) = rec.get_result(&stream) {
            let text = r.text.trim().to_string();
            if !text.is_empty() && text != last_partial {
                last_partial = text.clone();
                emit(serde_json::json!({"type":"partial","id":1,"text":text}));
            }
        }
    }
    stream.input_finished();
    while rec.is_ready(&stream) {
        rec.decode(&stream);
    }
    if let Some(r) = rec.get_result(&stream) {
        let text = r.text.trim().to_string();
        if !text.is_empty() {
            emit(serde_json::json!({"type":"final","id":1,"text":text}));
        }
    }
}
