// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Diferenças entre Windows, macOS e Linux concentradas num só lugar.
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export const PLAT = process.platform; // win32 | darwin | linux
export const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
export const IS_WIN = PLAT === 'win32';
export const IS_MAC = PLAT === 'darwin';
// nome da pasta de binários embutidos neste executável (ver build/build-exe.mjs)
export const TARGET = `${IS_WIN ? 'win' : IS_MAC ? 'macos' : 'linux'}-${ARCH}`;
export const NULL_DEVICE = IS_WIN ? 'NUL' : '/dev/null';

export function dataDir() {
  const home = os.homedir();
  if (IS_WIN) return path.join(process.env.LOCALAPPDATA || home, 'CastDeck');
  if (IS_MAC) return path.join(home, 'Library', 'Application Support', 'CastDeck');
  return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'CastDeck');
}

export const recordingsDir = () => path.join(os.homedir(), IS_MAC ? 'Movies' : 'Videos', 'CastDeck');

const detached = (cmd, args, onFail) => {
  const p = spawn(cmd, args, { windowsHide: true, detached: true, stdio: 'ignore' });
  p.on('error', (e) => onFail?.(e));
  p.unref();
  return p;
};

// Windows: abre/mostra no Explorer por um PowerShell oculto. Motivos:
// - spawn('explorer.exe', { windowsHide: true }) passa SW_HIDE para o Explorer e a pasta abria INVISÍVEL
//   (era o "botão da bandeja não faz nada"). Start-Process pede janela normal explicitamente.
// - se a pasta já está aberta (até numa janela escondida por versões antigas), reaproveita em vez de abrir outra;
// - o servidor roda em segundo plano e o Windows não deixa ele trazer janelas para a frente: o truque da tecla Alt
//   libera o SetForegroundWindow. O Add-Type (lento, ~1 s) só roda depois que a janela já foi pedida.
// O caminho vai por variável de ambiente (nada do usuário entra na linha de comando).
const WIN_SHOW = `
$ErrorActionPreference='SilentlyContinue'
if($env:CD_SHOW_LOG){ Start-Transcript -Path $env:CD_SHOW_LOG -Append | Out-Null; $ErrorActionPreference='Continue' }
$t=$env:CD_PATH; $mode=$env:CD_MODE
if($mode -eq 'file'){ Start-Process -FilePath $t -WindowStyle Normal; exit 0 }
$dir = if($mode -eq 'select'){ Split-Path -LiteralPath $t } else { $t }
$dir = $dir.TrimEnd('\\')
$sh = New-Object -ComObject Shell.Application
function Find { foreach($w in @($sh.Windows())){ try { if(($w.Document.Folder.Self.Path).TrimEnd('\\') -eq $dir){ return $w } } catch {} } return $null }
$w = Find
if($w -and $mode -eq 'select'){ try { $w.Document.SelectItem($w.Document.Folder.ParseName((Split-Path -Leaf $t)), 29) } catch {} }
if(-not $w){
  if($mode -eq 'select'){ Start-Process explorer.exe -WindowStyle Normal -ArgumentList ('/select,"' + $t + '"') } else { Start-Process explorer.exe -WindowStyle Normal -ArgumentList ('"' + $dir + '"') }
}
Add-Type 'using System;using System.Runtime.InteropServices;public static class CDW{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);[DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,int f,int e);}'
for($i=0; $i -lt 40 -and -not $w; $i++){ Start-Sleep -Milliseconds 150; $w = Find }
if($w){
  $h=[IntPtr]([int64]$w.HWND)
  # o 1º ShowWindow deste processo herda o SW_HIDE do windowsHide e é engolido: repete até ficar visível
  for($k=0; $k -lt 3 -and -not [CDW]::IsWindowVisible($h); $k++){ [CDW]::ShowWindow($h,5) | Out-Null }
  if([CDW]::IsIconic($h)){ [CDW]::ShowWindow($h,9) | Out-Null }
  [CDW]::keybd_event(0x12,0,0,0); [CDW]::SetForegroundWindow($h) | Out-Null; [CDW]::keybd_event(0x12,0,2,0)
}
`;
function winShow(mode, target) {
  // -EncodedCommand (UTF-16LE em base64): com -Command o Node reescapa as aspas do script e o PowerShell não roda nada
  const enc = Buffer.from(WIN_SHOW, 'utf16le').toString('base64');
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], {
    windowsHide: true, // esconde só o PowerShell; a janela do Explorer é pedida com estilo normal pelo Start-Process
    // SEM detached: com detached (DETACHED_PROCESS) + stdio 'ignore' o PowerShell fica sem console e sai com
    // código 0 sem executar nada (testado). O script termina em poucos segundos, não precisa sobreviver ao servidor.
    stdio: 'ignore',
    env: { ...process.env, CD_PATH: target, CD_MODE: mode },
  });
  p.on('error', (e) => {
    console.warn('[pasta] PowerShell indisponível, abrindo o Explorer direto:', e.message);
    // sem windowsHide: com ele o Explorer abre a pasta escondida
    const x = spawn('explorer.exe', [mode === 'select' ? `/select,${target}` : target], { detached: true, stdio: 'ignore' });
    x.on('error', () => {});
    x.unref();
  });
  p.unref();
  return p;
}

// abre uma pasta no gerenciador de arquivos (e traz para a frente)
export function openFolder(dir) {
  if (IS_WIN) return winShow('folder', dir);
  return detached(IS_MAC ? 'open' : 'xdg-open', [dir]);
}

// abre a pasta do arquivo com ele selecionado ("Mostrar na pasta")
export function revealFile(file) {
  if (IS_WIN) return winShow('select', file);
  if (IS_MAC) return detached('open', ['-R', file]);
  const dir = path.dirname(file);
  const uri = pathToFileURL(path.resolve(file)).href;
  const p = spawn('dbus-send', [
    '--session', '--print-reply', '--dest=org.freedesktop.FileManager1',
    '/org/freedesktop/FileManager1', 'org.freedesktop.FileManager1.ShowItems',
    `array:string:${uri}`, 'string:',
  ], { detached: true, stdio: 'ignore' });
  let fellBack = false;
  const fb = () => { if (fellBack) return; fellBack = true; detached('xdg-open', [dir]); };
  p.on('error', fb);
  p.on('close', (code) => { if (code !== 0) fb(); });
  p.unref();
  return p;
}

// abre o arquivo no programa padrão do sistema (ex.: o player de vídeo)
export function openFile(file) {
  if (IS_WIN) return winShow('file', file);
  return detached(IS_MAC ? 'open' : 'xdg-open', [file]);
}

// abre uma URL no navegador padrão
export function openBrowser(url) {
  if (IS_WIN) return detached('cmd', ['/c', 'start', '', url]);
  return detached(IS_MAC ? 'open' : 'xdg-open', [url]);
}

// abre como "app" (janela sem abas) num navegador Chromium; se não houver, cai para o navegador padrão
export function openAppWindow(url) {
  const fallback = () => openBrowser(url);
  // aberto pelo CastDeck.exe: mesma janela/perfil que o lançador usa (CD_BROWSER / CD_PROFILE)
  if (process.env.CD_BROWSER) {
    const args = [`--app=${url}`, '--no-first-run', '--no-default-browser-check'];
    if (process.env.CD_PROFILE) args.push(`--user-data-dir=${process.env.CD_PROFILE}`);
    return detached(process.env.CD_BROWSER, args, fallback);
  }
  if (IS_WIN) {
    const p = detached('cmd', ['/c', 'start', '', 'msedge', `--app=${url}`], fallback);
    return p;
  }
  const tryNext = (list) => {
    const [first, ...rest] = list;
    if (!first) return fallback();
    const p = spawn(first.cmd, first.args, { detached: true, stdio: 'ignore' });
    let failed = false;
    const next = () => {
      if (failed) return;
      failed = true;
      tryNext(rest);
    };
    p.on('error', next);
    if (IS_MAC) p.on('close', (code) => code !== 0 && next()); // `open -a` devolve erro se o app não existe
    p.unref();
  };
  const appProfile = path.join(os.tmpdir(), 'castdeck-app-window');
  const appFlags = [`--app=${url}`, `--user-data-dir=${appProfile}`, '--no-first-run', '--no-default-browser-check'];
  if (IS_MAC) {
    const apps = ['Google Chrome', 'Microsoft Edge', 'Chromium', 'Brave Browser', 'Vivaldi'];
    return tryNext(apps.map((a) => ({ cmd: 'open', args: ['-na', a, '--args', ...appFlags] })));
  }
  const bins = ['google-chrome', 'google-chrome-stable', 'microsoft-edge', 'microsoft-edge-stable', 'chromium', 'chromium-browser', 'brave-browser', 'vivaldi'];
  return tryNext(bins.map((b) => ({ cmd: b, args: appFlags })));
}

// Janela nativa "escolher pasta". Resolve com o caminho, ou null se o usuário cancelar.
// O caminho inicial e o título vão por variável de ambiente (nada do usuário entra na linha de comando).
export function pickFolder(start, title = 'Escolha a pasta') {
  const run = (cmd, args, env = {}) =>
    new Promise((resolve, reject) => {
      const p = spawn(cmd, args, { windowsHide: true, env: { ...process.env, CD_START: start || '', CD_TITLE: title, ...env } });
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('error', reject);
      p.on('close', (code) => {
        const dir = out.trim().split(/\r?\n/).pop()?.trim();
        if (code === 0 && dir) resolve(dir);
        else if (code === 0 || code === 1) resolve(null); // cancelado
        else reject(new Error(err.trim() || `código ${code}`));
      });
    });
  if (IS_WIN) {
    const ps = [
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Windows.Forms',
      '$f=New-Object System.Windows.Forms.Form -Property @{TopMost=$true;ShowInTaskbar=$false;Opacity=0;StartPosition="CenterScreen"}',
      '$f.Show(); $f.Hide(); $f.Show(); $f.Activate()', // 1º ShowWindow é engolido quando o console está oculto
      '$d=New-Object System.Windows.Forms.FolderBrowserDialog',
      '$d.Description=$env:CD_TITLE; $d.ShowNewFolderButton=$true',
      'if($env:CD_START -and (Test-Path -LiteralPath $env:CD_START)){$d.SelectedPath=$env:CD_START}',
      "if($d.ShowDialog($f) -eq 'OK'){ [Console]::Out.Write($d.SelectedPath) }",
    ].join('; ');
    return run('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
  }
  if (IS_MAC) {
    const js = "var a=Application.currentApplication();a.includeStandardAdditions=true;var e=$.NSProcessInfo.processInfo.environment;var t=ObjC.unwrap(e.objectForKey('CD_TITLE'));var s=ObjC.unwrap(e.objectForKey('CD_START'));var o={withPrompt:t};try{if(s)o.defaultLocation=Path(s)}catch(x){}try{a.chooseFolder(o).toString()}catch(x){''}";
    return run('osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("Foundation");' + js]);
  }
  // Linux: zenity (GNOME), kdialog (KDE), yad ou qarma
  const dirArg = (start || os.homedir()).replace(/\/?$/, '/');
  return run('zenity', ['--file-selection', '--directory', `--title=${title}`, `--filename=${dirArg}`]).catch(() =>
    run('kdialog', ['--getexistingdirectory', start || os.homedir(), '--title', title]).catch(() =>
      run('yad', ['--file', '--directory', `--title=${title}`, `--filename=${dirArg}`]).catch(() =>
        run('qarma', ['--file-selection', '--directory', `--title=${title}`, `--filename=${dirArg}`]).catch(() => {
          throw new Error('Nenhum seletor de pastas disponível (instale zenity, kdialog, yad ou qarma). Digite o caminho.');
        }),
      ),
    ),
  );
}

// Fixa uma janela no topo (Always-on-Top / HWND_TOPMOST no Windows, _NET_WM_STATE_ABOVE no Linux, raise no macOS)
export function setWindowTopmost(searchTitle, isTop = true) {
  const env = { ...process.env, CD_WIN_TITLE: String(searchTitle || ''), CD_WIN_TOP: isTop ? '1' : '0' };
  if (IS_MAC) {
    const script = [
      'ObjC.import("Foundation");',
      'var env = $.NSProcessInfo.processInfo.environment;',
      'var search = (ObjC.unwrap(env.objectForKey("CD_WIN_TITLE")) || "").toLowerCase();',
      'var top = ObjC.unwrap(env.objectForKey("CD_WIN_TOP")) === "1";',
      'var se = Application("System Events");',
      'var procs = se.processes.whose({ backgroundOnly: false })();',
      'for (var i = 0; i < procs.length; i++) {',
      '  try {',
      '    var wins = procs[i].windows();',
      '    for (var j = 0; j < wins.length; j++) {',
      '      var name = String(wins[j].name() || "").toLowerCase();',
      '      if (search && name.indexOf(search) !== -1 && top) {',
      '        procs[i].frontmost = true;',
      '        try { wins[j].actions["AXRaise"].perform(); } catch (e2) {}',
      '      }',
      '    }',
      '  } catch (e) {}',
      '}',
    ].join('\n');
    const p = spawn('osascript', ['-l', 'JavaScript', '-e', script], { detached: true, stdio: 'ignore', env });
    p.on('error', () => {});
    p.unref();
    return true;
  }
  if (!IS_WIN) {
    const sh = [
      'op="remove"; [ "$CD_WIN_TOP" = "1" ] && op="add"',
      'if command -v wmctrl >/dev/null 2>&1; then wmctrl -r "$CD_WIN_TITLE" -b "$op,above" 2>/dev/null && exit 0; fi',
      'if command -v xdotool >/dev/null 2>&1; then',
      '  for id in $(xdotool search --name "$CD_WIN_TITLE" 2>/dev/null); do',
      '    if [ "$CD_WIN_TOP" = "1" ]; then xdotool windowactivate "$id" 2>/dev/null || true; xprop -id "$id" -f _NET_WM_STATE 32a -set _NET_WM_STATE _NET_WM_STATE_ABOVE 2>/dev/null || true;',
      '    else xprop -id "$id" -remove _NET_WM_STATE 2>/dev/null || true; fi',
      '  done',
      'fi',
    ].join('\n');
    const p = spawn('/bin/sh', ['-c', sh], { detached: true, stdio: 'ignore', env });
    p.on('error', () => {});
    p.unref();
    return true;
  }
  const ps = `
    $ErrorActionPreference = 'SilentlyContinue';
    Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class TopHelper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    public static int Apply(string search, bool top) {
        IntPtr insertAfter = top ? new IntPtr(-1) : new IntPtr(-2); // -1 = HWND_TOPMOST, -2 = HWND_NOTOPMOST
        uint flags = 0x0001 | 0x0002; // SWP_NOSIZE | SWP_NOMOVE
        int count = 0;
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                var sb = new StringBuilder(512);
                GetWindowText(hWnd, sb, 512);
                string t = sb.ToString();
                if (!string.IsNullOrEmpty(t) && t.IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0) {
                    SetWindowPos(hWnd, insertAfter, 0, 0, 0, 0, flags);
                    count++;
                }
            }
            return true;
        }, IntPtr.Zero);
        return count;
    }
}
"@
    [TopHelper]::Apply($env:CD_WIN_TITLE, [bool]($env:CD_WIN_TOP -eq '1'))
  `;
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
    env,
  });
  p.unref();
  return true;
}

