@echo off
chcp 65001 >nul
title CastDeck Local
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
node server\index.js --open
pause
