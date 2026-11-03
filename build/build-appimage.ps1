# Gera os AppImages do Linux pelo WSL (Windows). Uso: npm run build:appimage
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) { throw 'WSL não encontrado. Instale com: wsl --install -d Ubuntu' }
$wslRoot = "/mnt/" + $root.Substring(0,1).ToLower() + $root.Substring(2).Replace('\', '/')
# o script pode ter vindo com CRLF do Windows: roda uma cópia limpa a partir do /tmp
wsl -e bash -c "cd '$wslRoot' && export CASTDECK_ROOT='$wslRoot' && tr -d '\r' < build/build-appimage.sh > /tmp/cd-appimage.sh && bash /tmp/cd-appimage.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node (Join-Path $root 'build\version.mjs') stamp CastDeck-x86_64.AppImage CastDeck-aarch64.AppImage
