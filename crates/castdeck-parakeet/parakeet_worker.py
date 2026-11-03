#!/usr/bin/env python3
# Worker de legenda ao vivo com Parakeet-TDT pt-BR (ONNX) — protocolo igual ao worker Rust (whisper).
#   entrada (stdin): PCM s16le, mono, 16 kHz, contínuo
#   saída (stdout):  uma linha JSON por evento ({"type":"ready"|"partial"|"final"|"error", ...})
#   args: --model <repo-id-ou-dir> --lang pt|en|es
#
# Estratégia simples e robusta: acumula o áudio e reconhece o buffer crescente a cada ~2 s (parcial);
# ao fim do stdin, reconhece tudo e emite a frase final. Não usa VAD (o VAD por energia quebrava frases
# com pausas). A latência fica ~2 s, aceitável para legenda; o tipo "palavra a palavra" suaviza na UI.
import sys, json, wave, struct, tempfile, os, time

SR = 16000
PARTIAL_EVERY = int(SR * 2.0)

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()

def main():
    argv = sys.argv[1:]
    i = 0
    model_id = "calneymgp/parakeet-tdt-0.6b-v3-ptBR-TAGARELA-onnx-int8"
    lang = "pt"
    while i < len(argv):
        if argv[i] == "--model":
            model_id = argv[i + 1]; i += 2
        elif argv[i] == "--lang":
            lang = argv[i + 1]; i += 2
        else:
            i += 1

    import onnx_asr
    emit({"type": "ready", "lang": lang})
    t0 = time.time()
    model = onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3", model_id)
    emit({"type": "status", "loaded_ms": int((time.time() - t0) * 1000)})

    tmpdir = tempfile.mkdtemp(prefix="cd-parakeet-")
    seg_path = os.path.join(tmpdir, "live.wav")

    def recognize(samples):
        with wave.open(seg_path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(b"".join(struct.pack("<h", max(-32768, min(32767, int(s * 32767)))) for s in samples))
        return (model.recognize(seg_path, language=lang) or "").strip()

    samples = []
    last_partial = ""
    since_partial = 0
    stdin = sys.stdin.buffer
    buf = bytearray()
    while True:
        chunk = stdin.read(FRAME := SR * 2 * 4)
        if not chunk:
            break
        buf.extend(chunk)
        while len(buf) >= 2:
            # lê o máximo de pares completos
            n = len(buf) // 2
            raw = bytes(buf[:n * 2])
            del buf[:n * 2]
            for j in range(0, len(raw), 2):
                samples.append(struct.unpack("<h", raw[j:j + 2])[0] / 32768.0)
            since_partial += n
            if since_partial >= PARTIAL_EVERY and len(samples) >= SR:
                since_partial = 0
                try:
                    text = recognize(samples)
                except Exception as e:
                    emit({"type": "error", "error": str(e)})
                    text = ""
                if text and text != last_partial:
                    last_partial = text
                    emit({"type": "partial", "id": 1, "text": text})

    # fim: frase final com o áudio completo
    if len(samples) >= SR:
        try:
            text = recognize(samples)
        except Exception as e:
            emit({"type": "error", "error": str(e)})
            text = ""
        if text:
            emit({"type": "final", "id": 1, "text": text})

if __name__ == "__main__":
    main()
