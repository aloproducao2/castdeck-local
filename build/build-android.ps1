# Gera o APK do CastDeck para Android (pasta android/) e copia para dist/CastDeck.apk
#   powershell -ExecutionPolicy Bypass -File build\build-android.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $env:JAVA_HOME) {
  foreach ($j in @("$env:ProgramFiles\Android\Android Studio\jbr", "$env:ProgramFiles\Android\Android Studio\jre")) {
    if (Test-Path "$j\bin\java.exe") { $env:JAVA_HOME = $j; break }
  }
}
if (-not $env:JAVA_HOME) { throw 'JDK 17+ não encontrado. Instale o Android Studio ou defina JAVA_HOME.' }
$android = Join-Path $root 'android'
if (-not (Test-Path "$android\local.properties")) {
  $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
  "sdk.dir=$($sdk -replace '\\','\\' -replace ':','\:')" | Set-Content "$android\local.properties" -Encoding ASCII
}
Push-Location $android
try {
  & .\gradlew.bat assembleRelease --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) { throw "Gradle falhou ($LASTEXITCODE)" }
} finally { Pop-Location }
New-Item -ItemType Directory -Force (Join-Path $root 'dist') | Out-Null
Copy-Item "$android\app\build\outputs\apk\release\app-release.apk" (Join-Path $root 'dist\CastDeck.apk') -Force
Write-Host "OK -> dist\CastDeck.apk"
& node (Join-Path $root 'build\version.mjs') stamp CastDeck.apk
