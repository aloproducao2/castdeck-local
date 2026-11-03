#!/usr/bin/env bash
# Gera AppImages do CastDeck para Linux (x86_64 e aarch64) a partir dos executáveis de dist/.
# Roda no Linux ou no WSL (o build/build-appimage.ps1 chama este script pelo WSL).
#   pré-requisito: npm run build:all (gera dist/CastDeck-linux-x64 e dist/CastDeck-linux-arm64)
set -euo pipefail
ROOT="${CASTDECK_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DIST="$ROOT/dist"
TOOLS="${XDG_CACHE_HOME:-$HOME/.cache}/castdeck-appimage" # cache fora do /mnt (permissões de execução)
WORK="$(mktemp -d /tmp/castdeck-appimage.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
VER="$(sed -n 's/^\s*"version":\s*"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -n1)"
mkdir -p "$TOOLS"

fetch() { # url destino
  [ -s "$2" ] && return 0
  echo "  baixando $(basename "$2")…"
  if command -v curl >/dev/null; then curl -fsSL --retry 3 -o "$2.part" "$1"; else wget -qO "$2.part" "$1"; fi
  mv "$2.part" "$2"
}
fetch https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage "$TOOLS/appimagetool"
fetch https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-x86_64 "$TOOLS/runtime-x86_64"
fetch https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-aarch64 "$TOOLS/runtime-aarch64"
chmod +x "$TOOLS/appimagetool"

build() { # arch-do-pkg arch-do-appimage
  local src="$DIST/CastDeck-linux-$1" arch="$2"
  if [ ! -f "$src" ]; then echo "  (pulando $arch: $src não existe — rode npm run build:all)"; return 0; fi
  echo "=== AppImage $arch ==="
  local app="$WORK/CastDeck-$arch.AppDir"
  mkdir -p "$app/usr/bin"
  # `cp` de arquivo grande via /mnt (9p) às vezes dá I/O error; `dd` contorna.
  dd if="$src" of="$app/usr/bin/castdeck" bs=1M conv=noerror,sync status=none
  chmod 755 "$app/usr/bin/castdeck"
  cp "$ROOT/build/assets/icon-256.png" "$app/castdeck.png"
  ln -s castdeck.png "$app/.DirIcon"
  cat >"$app/castdeck.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=CastDeck
GenericName=Estúdio de transmissão ao vivo
Comment=Estúdio de lives local: convidados, cenas e multistream RTMP
Exec=castdeck
Icon=castdeck
Terminal=false
Categories=AudioVideo;Video;
Keywords=live;stream;rtmp;studio;transmissão;
StartupNotify=true
X-AppImage-Version=$VER
EOF
  cat >"$app/AppRun" <<'EOF'
#!/bin/sh
# CastDeck: sobe o servidor local e abre o estúdio no navegador. Se já estiver aberto, só abre a janela.
HERE="$(dirname "$(readlink -f "$0")")"
PORT="${PORT:-3000}"
if command -v curl >/dev/null 2>&1 && curl -fs -m 2 "http://localhost:$PORT/api/health" 2>/dev/null | grep -q castdeck; then
  curl -fs -m 2 -X POST -H 'Content-Type: application/json' -d '{}' "http://localhost:$PORT/api/open" >/dev/null 2>&1 && exit 0
fi
exec "$HERE/usr/bin/castdeck" "$@"
EOF
  chmod 755 "$app/AppRun"
  local out="$DIST/CastDeck-$arch.AppImage"
  local tmpout="$WORK/CastDeck-$arch.AppImage"
  rm -f "$out" "$DIST/CastDeck-$VER-$arch.AppImage"
  ARCH="$arch" APPIMAGE_EXTRACT_AND_RUN=1 NO_CLEANUP=1 "$TOOLS/appimagetool" --mksquashfs-opt -processors --mksquashfs-opt 1 --no-appstream --runtime-file "$TOOLS/runtime-$arch" "$app" "$tmpout" >"$WORK/log-$arch.txt" 2>&1 || {
    cat "$WORK/log-$arch.txt"
    exit 1
  }
  dd if="$tmpout" of="$out" bs=1M conv=noerror,sync status=none
  chmod 755 "$out"
  echo "  -> $(basename "$out") ($(du -m "$out" | cut -f1) MB)"
}
build x64 x86_64
build arm64 aarch64
echo "Concluído."
