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

use std::io::{Read, Write};
use std::net::{IpAddr, Ipv6Addr, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use muda::{Menu, MenuItem, MenuEvent};
use tray_icon::{TrayIconBuilder, TrayIconEvent, Icon, MouseButton, MouseButtonState};

// PIDs para encerrar explicitamente no "Sair" (além do Job Object, que pode não pegar
// processos já dentro de outro Job, ex.: iniciado por terminal/IDE).
static SERVER_PID: AtomicU32 = AtomicU32::new(0);
static BROWSER_PID: AtomicU32 = AtomicU32::new(0);

const DEFAULT_PORT: u16 = 3000;
static ACTIVE_PORT: AtomicU16 = AtomicU16::new(DEFAULT_PORT);

fn studio_url() -> String {
    format!("http://localhost:{}/", ACTIVE_PORT.load(Ordering::SeqCst))
}

fn check_health_on(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(300)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(350)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(350)));
    if stream
        .write_all(b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut buf = [0u8; 1024];
    let mut total = 0;
    while total < buf.len() {
        match stream.read(&mut buf[total..]) {
            Ok(0) => break,
            Ok(n) => total += n,
            Err(_) => break,
        }
    }
    let resp = String::from_utf8_lossy(&buf[..total]);
    resp.contains("\"app\":\"castdeck\"") && resp.contains("\"exe\":")
}

fn check_health() -> bool {
    check_health_on(ACTIVE_PORT.load(Ordering::SeqCst))
}

fn is_port_busy_anywhere(port: u16) -> bool {
    let v4 = SocketAddr::from(([127, 0, 0, 1], port));
    if TcpStream::connect_timeout(&v4, Duration::from_millis(180)).is_ok() {
        return true;
    }
    let v6 = SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), port);
    if TcpStream::connect_timeout(&v6, Duration::from_millis(180)).is_ok() {
        return true;
    }
    TcpListener::bind(("0.0.0.0", port)).is_err()
}

fn select_server_port() -> u16 {
    const CANDIDATES: [u16; 7] = [3000, 3480, 3001, 3002, 3003, 3004, 3005];
    for p in CANDIDATES {
        if check_health_on(p) {
            ACTIVE_PORT.store(p, Ordering::SeqCst);
            return p;
        }
    }
    for p in CANDIDATES {
        if !is_port_busy_anywhere(p) {
            ACTIVE_PORT.store(p, Ordering::SeqCst);
            return p;
        }
    }
    ACTIVE_PORT.store(DEFAULT_PORT, Ordering::SeqCst);
    DEFAULT_PORT
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

#[cfg(windows)]
fn kill_orphan_servers() {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut cmd = Command::new("taskkill");
    cmd.args(["/F", "/T", "/IM", "castdeck-server-embedded.exe"]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.status();
}

#[cfg(windows)]
fn kill_other_castdeck_processes() {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let my_pid = std::process::id();
    let filter = format!("PID ne {}", my_pid);
    let mut cmd = Command::new("taskkill");
    cmd.args(["/F", "/T", "/FI", &filter, "/IM", "CastDeck.exe"]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.status();

    let mut cmd2 = Command::new("taskkill");
    cmd2.args(["/F", "/T", "/FI", &filter, "/IM", "castdeck-launcher.exe"]);
    cmd2.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd2.status();

    kill_orphan_servers();
}

#[cfg(windows)]
fn ensure_studio_window_visible() -> bool {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetWindowTextW, IsIconic, IsWindowVisible, SetForegroundWindow,
        ShowWindow, SW_RESTORE, SW_SHOW,
    };

    unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let mut cls_buf = [0u16; 128];
        let cls_len = GetClassNameW(hwnd, cls_buf.as_mut_ptr(), cls_buf.len() as i32);
        if cls_len <= 0 {
            return 1;
        }
        let cls = std::ffi::OsString::from_wide(&cls_buf[..cls_len as usize])
            .to_string_lossy()
            .to_string();
        if !cls.starts_with("Chrome_WidgetWin") {
            return 1;
        }
        let mut buf = [0u16; 256];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if len > 0 {
            let title = std::ffi::OsString::from_wide(&buf[..len as usize])
                .to_string_lossy()
                .to_string();
            if title.contains("CastDeck") {
                if IsIconic(hwnd) != 0 {
                    ShowWindow(hwnd, SW_RESTORE);
                } else {
                    ShowWindow(hwnd, SW_SHOW);
                }
                SetForegroundWindow(hwnd);
                let found = &mut *(lparam as *mut bool);
                *found = true;
            }
        }
        1
    }

    let mut found = false;
    unsafe {
        EnumWindows(Some(enum_cb), &mut found as *mut bool as LPARAM);
    }
    found
}

fn get_embedded_server_path() -> Option<PathBuf> {
    #[cfg(feature = "embedded-server")]
    {
        static SERVER_BYTES: &[u8] = include_bytes!("../server.bin");
        let app_dir = get_app_dir().join("app");
        let _ = std::fs::create_dir_all(&app_dir);
        let target_exe = app_dir.join("castdeck-server-embedded.exe");
        let sig_file = app_dir.join("castdeck-server-embedded.sig");

        // Assinatura simples (tamanho + versão + amostra distribuída) para garantir regravação em builds novos
        let sig = {
            let n = SERVER_BYTES.len();
            let mut h: u64 = 0xcbf29ce484222325;
            let step = (n / 1024).max(1);
            let mut i = 0;
            while i < n {
                h ^= SERVER_BYTES[i] as u64;
                h = h.wrapping_mul(0x100000001b3);
                i += step;
            }
            format!("{}:{}:{}", env!("CARGO_PKG_VERSION"), n, h)
        };

        let same_size = std::fs::metadata(&target_exe).map_or(false, |m| m.len() == SERVER_BYTES.len() as u64);
        let same_sig = std::fs::read_to_string(&sig_file).map_or(false, |s| s.trim() == sig);
        let needs_write = !(same_size && same_sig);

        if needs_write {
            if std::fs::write(&target_exe, SERVER_BYTES).is_err() {
                #[cfg(windows)]
                {
                    kill_orphan_servers();
                    std::thread::sleep(Duration::from_millis(400));
                }
                if std::fs::write(&target_exe, SERVER_BYTES).is_ok() {
                    let _ = std::fs::write(&sig_file, &sig);
                }
            } else {
                let _ = std::fs::write(&sig_file, &sig);
            }
        }
        if target_exe.exists() {
            return Some(target_exe);
        }
    }
    None
}

fn spawn_server(job: &Option<job::ProcessJob>) -> Option<Child> {
    let port = select_server_port();
    if check_health_on(port) {
        println!("CastDeck Server já está ativo na porta {}.", port);
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
            cmd.env("PORT", port.to_string());
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
    let url = studio_url();
    if let Some(browser_exe) = find_app_browser() {
        let profile_dir = get_app_dir().join("window");
        let _ = std::fs::create_dir_all(&profile_dir);

        let mut cmd = Command::new(browser_exe);
        cmd.arg(format!("--app={}", url));
        cmd.arg(format!("--user-data-dir={}", profile_dir.display()));
        cmd.arg("--new-window");
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

            // Monitora quando a janela for fechada para emitir aviso na bandeja e garante visibilidade inicial
            std::thread::spawn(move || {
                for _ in 0..20 {
                    std::thread::sleep(Duration::from_millis(200));
                    #[cfg(windows)]
                    if ensure_studio_window_visible() {
                        break;
                    }
                }
            });
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
    let _ = open::that(url);
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
        Some(h) => Some(h),
        None => {
            // Se o servidor está no ar e já existe janela visível do estúdio, apenas traz para frente.
            let port = select_server_port();
            if check_health_on(port) && ensure_studio_window_visible() {
                return;
            }
            // Processo antigo ficou preso em segundo plano sem janela visível ou servidor caiu:
            // limpa as instâncias travadas e inicia uma nova sessão completa (bandeja + servidor + janela).
            kill_other_castdeck_processes();
            std::thread::sleep(Duration::from_millis(450));
            acquire_single_instance()
        }
    };

    // Sem outro lançador na bandeja, qualquer castdeck-server-embedded.exe rodando ficou órfão de execução anterior.
    #[cfg(windows)]
    kill_orphan_servers();

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
            if wait_for_server(100) {
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
                        #[cfg(windows)]
                        {
                            if !ensure_studio_window_visible() {
                                open_studio_window(&job, quitting.clone());
                            }
                        }
                        #[cfg(not(windows))]
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
                        #[cfg(windows)]
                        kill_orphan_servers();
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
                        #[cfg(windows)]
                        {
                            if !ensure_studio_window_visible() {
                                open_studio_window(&job, quitting.clone());
                            }
                        }
                        #[cfg(not(windows))]
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
