// SPDX-License-Identifier: AGPL-3.0-only
// Worker de legenda ao vivo com Parakeet-TDT (ONNX), mesmo protocolo do worker Whisper:
//   entrada (stdin): PCM s16le, mono, 16 kHz
//   saída (stdout):  JSON por linha (ready/partial/final/error)
//   args: --model <dir-onnx> --lang pt|en|es
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process::exit;
use transcribe_rs::engines::parakeet::{ParakeetEngine, ParakeetModelParams};
use transcribe_rs::TranscriptionEngine;

const SR: usize = 16_000;
const PARTIAL_EVERY: usize = SR * 2;

fn emit(v: serde_json::Value) {
    println!("{}", v);
    let _ = io::stdout().flush();
}

fn main() {
    let mut model_dir: Option<String> = None;
    let mut lang = "pt".to_string();
    let a: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < a.len() {
        match a[i].as_str() {
            "--model" => { model_dir = a.get(i + 1).cloned(); i += 2; }
            "--lang" => { lang = a.get(i + 1).cloned().unwrap_or_else(|| "pt".into()); i += 2; }
            _ => { i += 1; }
        }
    }
    let dir = match model_dir {
        Some(d) => d,
        None => { emit(serde_json::json!({"type":"error","error":"--model <dir> obrigatório"})); exit(2); }
    };
    emit(serde_json::json!({"type":"ready","lang":lang}));
    let mut engine = ParakeetEngine::new();
    if let Err(e) = engine.load_model_with_params(&PathBuf::from(&dir), ParakeetModelParams::int8()) {
        emit(serde_json::json!({"type":"error","error":format!("falha ao carregar modelo: {e}")}));
        exit(3);
    }

    let mut samples: Vec<f32> = Vec::new();
    let mut last_partial = String::new();
    let mut since_partial = 0usize;
    let mut buf = Vec::<u8>::with_capacity(8192);
    let mut raw = [0u8; 8192];

    loop {
        let n = match io::stdin().read(&mut raw) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        buf.extend_from_slice(&raw[..n]);
        let usable = buf.len() / 2 * 2;
        for j in (0..usable).step_by(2) {
            let v = i16::from_le_bytes([buf[j], buf[j + 1]]) as f32 / 32768.0;
            samples.push(v);
            since_partial += 1;
        }
        buf.drain(..usable);

        if since_partial >= PARTIAL_EVERY && samples.len() >= SR {
            since_partial = 0;
            if let Some(text) = transcribe(&mut engine, &samples) {
                if !text.is_empty() && text != last_partial {
                    last_partial = text.clone();
                    emit(serde_json::json!({"type":"partial","id":1,"text":text}));
                }
            }
        }
    }
    if samples.len() >= SR {
        if let Some(text) = transcribe(&mut engine, &samples) {
            if !text.is_empty() {
                emit(serde_json::json!({"type":"final","id":1,"text":text}));
            }
        }
    }
}

fn transcribe(engine: &mut ParakeetEngine, samples: &[f32]) -> Option<String> {
    let mut path = std::env::temp_dir();
    path.push(format!("cd-parakeet-{}.wav", std::process::id()));
    let spec = hound::WavSpec { channels: 1, sample_rate: SR as u32, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut w = hound::WavWriter::create(&path, spec).ok()?;
    for s in samples {
        let v = (s * 32767.0).clamp(-32768.0, 32767.0) as i16;
        w.write_sample(v).ok()?;
    }
    drop(w);
    let result = engine.transcribe_file(&path, None).ok()?;
    let _ = std::fs::remove_file(&path);
    Some(result.text.trim().to_string())
}
