// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Lançador Desktop nativo do CastDeck em Rust.
// Substitui o antigo lançador C# (.NET Framework 4), oferecendo:
//   - Janela nativa em modo App dedicada (sem barras do navegador);
//   - Ícone oficial do CastDeck no executável e na bandeja;
//   - Notificação ao fechar a janela avisando que continua na bandeja;
//   - Menor consumo de RAM (~8 MB vs ~60 MB do runtime .NET);
//   - Gerenciamento de ciclo de vida seguro com Job Object no Windows.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod job;

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use muda::{Menu, MenuItem, MenuEvent};
use tray_icon::{TrayIconBuilder, TrayIconEvent, Icon, MouseButton, MouseButtonState};

// PIDs para encerrar explicitamente no "Sair" (além do Job Object, que pode não pegar
// processos já dentro de outro Job, ex.: iniciado por terminal/IDE).
static SERVER_PID: AtomicU32 = AtomicU32::new(0);
static BROWSER_PID: AtomicU32 = AtomicU32::new(0);

const SERVER_PORT: u16 = 3000;
const STUDIO_URL: &str = "http://localhost:3000/";

fn check_health() -> bool {
    let client = std::net::TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", SERVER_PORT).parse().unwrap(),
        Duration::from_millis(300),
    );
    client.is_ok()
}

fn get_app_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local_app_data).join("CastDeck");
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".castdeck");
    }
    PathBuf::from(".").join("CastDeck")
}

fn get_recordings_dir() -> PathBuf {
    let data = get_app_dir();
    let rec = data.join("recordings");
    if !rec.exists() {
        let _ = std::fs::create_dir_all(&rec);
    }
    rec
}

fn get_logs_dir() -> PathBuf {
    let data = get_app_dir();
    let logs = data.join("logs");
    if !logs.exists() {
        let _ = std::fs::create_dir_all(&logs);
    }
    logs
}

fn get_embedded_server_path() -> Option<PathBuf> {
    #[cfg(feature = "embedded-server")]
    {
        static SERVER_BYTES: &[u8] = include_bytes!("../server.bin");
        let app_dir = get_app_dir().join("app");
        let _ = std::fs::create_dir_all(&app_dir);
        let target_exe = app_dir.join("castdeck-server-embedded.exe");

        let needs_write = match std::fs::metadata(&target_exe) {
            Ok(meta) => meta.len() != SERVER_BYTES.len() as u64,
            Err(_) => true,
        };

        if needs_write {
            if let Ok(_) = std::fs::write(&target_exe, SERVER_BYTES) {
                return Some(target_exe);
            }
        } else {
            return Some(target_exe);
        }
    }
    None
}

fn spawn_server(job: &Option<job::ProcessJob>) -> Option<Child> {
    if check_health() {
        println!("CastDeck Server já está ativo na porta {}.", SERVER_PORT);
        return None;
    }

    let current_exe = std::env::current_exe().unwrap_or_default();
    let base_dir = current_exe.parent().unwrap_or(std::path::Path::new("."));
    
    let mut candidates = Vec::new();
    if let Some(embedded) = get_embedded_server_path() {
        candidates.push(embedded);
    }
    candidates.push(base_dir.join("castdeck-server.exe"));
    candidates.push(base_dir.join("castdeck-server"));
    candidates.push(base_dir.join("server.exe"));
    candidates.push(base_dir.join("server/index.js"));
    candidates.push(PathBuf::from("server/index.js"));

    for candidate in &candidates {
        if candidate.exists() {
            let mut cmd = if candidate.extension().map_or(false, |ext| ext == "js") {
                let mut c = Command::new("node");
                c.arg(candidate);
                c
            } else {
                Command::new(candidate)
            };

            cmd.env("NO_OPEN", "1");
            cmd.env("CASTDECK_LAUNCHER", "1");
            cmd.env("PORT", SERVER_PORT.to_string());
            if let Ok(exe) = std::env::current_exe() {
                cmd.env("CASTDECK_EXE", exe);
            }

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            if let Ok(child) = cmd.spawn() {
                SERVER_PID.store(child.id(), Ordering::SeqCst);
                #[cfg(windows)]
                {
                    if let Some(j) = job {
                        use std::os::windows::io::AsRawHandle;
                        j.assign_process(child.as_raw_handle() as _);
                    }
                }
                return Some(child);
            }
        }
    }

    None
}

fn wait_for_server(max_attempts: usize) -> bool {
    for _ in 0..max_attempts {
        if check_health() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

fn find_app_browser() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let pf86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();
        let pf = std::env::var("ProgramFiles").unwrap_or_default();
        let lad = std::env::var("LOCALAPPDATA").unwrap_or_default();

        let candidates = [
            PathBuf::from(&pf86).join(r"Microsoft\Edge\Application\msedge.exe"),
            PathBuf::from(&pf).join(r"Microsoft\Edge\Application\msedge.exe"),
            PathBuf::from(&lad).join(r"Microsoft\Edge\Application\msedge.exe"),
            PathBuf::from(&pf).join(r"Google\Chrome\Application\chrome.exe"),
            PathBuf::from(&pf86).join(r"Google\Chrome\Application\chrome.exe"),
            PathBuf::from(&lad).join(r"Google\Chrome\Application\chrome.exe"),
            PathBuf::from(&pf).join(r"BraveSoftware\Brave-Browser\Application\brave.exe"),
        ];

        for c in &candidates {
            if c.exists() {
                return Some(c.clone());
            }
        }
    }
    None
}

fn open_studio_window(job: &Option<job::ProcessJob>, quitting: Arc<AtomicBool>) -> Option<Child> {
    if let Some(browser_exe) = find_app_browser() {
        let profile_dir = get_app_dir().join("window");
        let _ = std::fs::create_dir_all(&profile_dir);

        let mut cmd = Command::new(browser_exe);
        cmd.arg(format!("--app={}", STUDIO_URL));
        cmd.arg(format!("--user-data-dir={}", profile_dir.display()));
        cmd.arg("--no-first-run");
        cmd.arg("--no-default-browser-check");
        cmd.arg("--disable-background-mode");
        cmd.arg("--disable-features=Translate,msEdgeStartupBoost");
        cmd.arg("--window-size=1440,900");
        cmd.arg("--window-position=60,40");

        if let Ok(mut child) = cmd.spawn() {
            let browser_pid = child.id();
            BROWSER_PID.store(browser_pid, Ordering::SeqCst);
            #[cfg(windows)]
            {
                if let Some(j) = job {
                    use std::os::windows::io::AsRawHandle;
                    j.assign_process(child.as_raw_handle() as _);
                }
            }

            // Monitora quando a janela for fechada para emitir aviso na bandeja
            let q = quitting.clone();
            std::thread::spawn(move || {
                let _ = child.wait();
                // Só limpa se ainda for este navegador (evita zerar o PID de uma janela nova)
                let _ = BROWSER_PID.compare_exchange(browser_pid, 0, Ordering::SeqCst, Ordering::SeqCst);
                if !q.load(Ordering::SeqCst) {
                    notify_tray_running();
                }
            });

            return None;
        }
    }

    // Fallback caso navegador não suporte modo app
    let _ = open::that(STUDIO_URL);
    None
}

// Encerra um PID e a árvore dele (Edge/Chromium + servidor Node/FFmpeg). Silencioso se já morreu.
fn kill_pid(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
    }
}

fn notify_tray_running() {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.Visible = $true
$n.ShowBalloonTip(5000, "CastDeck em segundo plano", "O aplicativo continua ativo na bandeja do sistema. Use 'Sair' pelo menu da bandeja para encerrar.", [System.Windows.Forms.ToolTipIcon]::Info)
Start-Sleep -Seconds 6
$n.Dispose()
"#;
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.spawn();
    }
}

fn get_app_icon() -> Icon {
    // Gerado de build/assets/icon-256.png em 32x32 RGBA (não é para editar este binário à mão).
    static ICON_BYTES: &[u8] = include_bytes!("../icon_32.rgba");
    Icon::from_rgba(ICON_BYTES.to_vec(), 32, 32).unwrap()
}

// Instância única: se o usuário abrir o atalho de novo com o app já na bandeja, NÃO cria
// um segundo lançador/ícone (o "Sair" de um deixava o outro vivo e a janela parecia reabrir).
#[cfg(windows)]
fn acquire_single_instance() -> Option<windows_sys::Win32::Foundation::HANDLE> {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    unsafe {
        let name: Vec<u16> = "Local\\CastDeckLauncher\0".encode_utf16().collect();
        let handle = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
        if handle.is_null() {
            return Some(handle); // falha ao criar: segue sem trava (melhor abrir que travar)
        }
        if GetLastError() == ERROR_ALREADY_EXISTS {
            CloseHandle(handle);
            return None;
        }
        Some(handle)
    }
}

fn main() {
    // O handle fica vivo até o processo terminar (não fechar).
    #[cfg(windows)]
    let _single_instance = match acquire_single_instance() {
        Some(h) => h,
        None => {
            // Já existe uma instância: pede para abrir/focar o estúdio e sai sem criar bandeja.
            let no_job: Option<job::ProcessJob> = None;
            open_studio_window(&no_job, Arc::new(AtomicBool::new(true)));
            return;
        }
    };

    let job = Arc::new(job::ProcessJob::new());
    let _server_child = spawn_server(&job);
    let quitting = Arc::new(AtomicBool::new(false));

    // Inicializa Menu da Bandeja
    let menu = Menu::new();
    let item_studio = MenuItem::with_id("open_studio", "Abrir Estúdio", true, None);
    let item_recordings = MenuItem::with_id("recordings", "Pasta de Gravações", true, None);
    let item_logs = MenuItem::with_id("logs", "Ver Logs", true, None);
    let item_quit = MenuItem::with_id("quit", "Sair do CastDeck", true, None);

    let _ = menu.append_items(&[
        &item_studio,
        &item_recordings,
        &item_logs,
        &item_quit,
    ]);

    let _tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("CastDeck Local — Estúdio ao Vivo")
        .with_icon(get_app_icon())
        .build()
        .expect("Falha ao inicializar ícone da bandeja");

    // Aguarda o servidor subir em segundo plano e abre a janela dedicada do estúdio
    {
        let q = quitting.clone();
        let j = job.clone();
        std::thread::spawn(move || {
            if wait_for_server(30) {
                open_studio_window(&j, q);
            }
        });
    }

    let menu_channel = MenuEvent::receiver();
    let tray_channel = TrayIconEvent::receiver();

    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::*;
        let mut msg: MSG = std::mem::zeroed();

        loop {
            while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                if msg.message == WM_QUIT {
                    return;
                }
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            if let Ok(event) = menu_channel.try_recv() {
                match event.id.0.as_str() {
                    "open_studio" => {
                        open_studio_window(&job, quitting.clone());
                    }
                    "recordings" => {
                        let _ = open::that(get_recordings_dir());
                    }
                    "logs" => {
                        let _ = open::that(get_logs_dir());
                    }
                    "quit" => {
                        quitting.store(true, Ordering::SeqCst);
                        // Encerra janela e servidor antes de sair: sem isto o Edge/servidor
                        // podiam sobreviver e a janela parecia "reabrir" ao clicar na bandeja.
                        kill_pid(BROWSER_PID.swap(0, Ordering::SeqCst));
                        kill_pid(SERVER_PID.swap(0, Ordering::SeqCst));
                        PostQuitMessage(0);
                        return;
                    }
                    _ => {}
                }
            }

            if let Ok(event) = tray_channel.try_recv() {
                // Só o clique ESQUERDO (soltar) abre o estúdio. O clique direito é o que abre
                // o menu da bandeja — antes ele também abria uma janela, o que dava a impressão
                // de o app "reabrir" na hora de escolher Sair.
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    if !quitting.load(Ordering::SeqCst) {
                        open_studio_window(&job, quitting.clone());
                    }
                }
            }

            std::thread::sleep(Duration::from_millis(16));
        }
    }

    #[cfg(not(windows))]
    loop {
        std::thread::sleep(Duration::from_secs(1));
    }
}
