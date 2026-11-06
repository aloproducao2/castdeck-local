// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
//
// castdeck-ndi (Rust): ponte NDI de alta performance, sem SDK linkado.
// O runtime é carregado dinamicamente; o SDK não é distribuído no repositório.
//
// Fase 0: list/version/receive/send-test. A integração com servidor, MediaMTX
// e UI virá nas próximas fases. O caminho quente evita alocações por quadro:
// buffers de vídeo pré-alocados, envio assíncrono do NDI e áudio planar.

use std::env;
use std::ffi::{c_void, CStr, CString};
use std::io::{Read, Write};
use std::os::raw::c_char;
use std::path::PathBuf;
use std::process::ExitCode;
use std::ptr;
use std::thread;
use std::time::{Duration, Instant};

const NDI_FOURCC_BGRA: u32 = u32::from_le_bytes(*b"BGRA");
const NDI_FOURCC_UYVY: u32 = u32::from_le_bytes(*b"UYVY");
const NDI_FOURCC_FLTP: u32 = u32::from_le_bytes(*b"FLTp");
const NDI_FRAME_PROGRESSIVE: i32 = 1;
const NDI_SEND_TIMECODE_SYNTHESIZE: i64 = i64::MAX;
const NDI_RECV_BANDWIDTH_HIGHEST: i32 = 100;
const NDI_RECV_COLOR_UYVY_BGRA: i32 = 1;
const NDI_FRAME_VIDEO: i32 = 1;
const NDI_FRAME_AUDIO: i32 = 2;

#[repr(C)]
#[derive(Clone, Copy)]
struct NdiSource {
    p_ndi_name: *const c_char,
    p_url_address: *const c_char,
}

#[repr(C)]
struct NdiFindCreate {
    show_local_sources: u8,
    p_groups: *const c_char,
    p_extra_ips: *const c_char,
}

#[repr(C)]
struct NdiSendCreate {
    p_ndi_name: *const c_char,
    p_groups: *const c_char,
    clock_video: u8,
    clock_audio: u8,
}

#[repr(C)]
struct NdiRecvCreate {
    source_to_connect_to: NdiSource,
    color_format: i32,
    bandwidth: i32,
    allow_video_fields: u8,
    p_ndi_recv_name: *const c_char,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct NdiVideoFrame {
    xres: i32,
    yres: i32,
    fourcc: u32,
    frame_rate_n: i32,
    frame_rate_d: i32,
    picture_aspect_ratio: f32,
    frame_format_type: i32,
    timecode: i64,
    p_data: *mut u8,
    line_stride_in_bytes: i32,
    p_metadata: *const c_char,
    timestamp: i64,
}

#[repr(C)]
struct NdiAudioFrame {
    sample_rate: i32,
    no_channels: i32,
    no_samples: i32,
    timecode: i64,
    fourcc: u32,
    p_data: *mut u8,
    channel_stride_in_bytes: i32,
    p_metadata: *const c_char,
    timestamp: i64,
}

type InitFn = unsafe extern "C" fn() -> u8;
type VersionFn = unsafe extern "C" fn() -> *const c_char;
type FindCreateFn = unsafe extern "C" fn(*const NdiFindCreate) -> *mut c_void;
type FindDestroyFn = unsafe extern "C" fn(*mut c_void);
type FindWaitFn = unsafe extern "C" fn(*mut c_void, u32) -> u8;
type FindGetFn = unsafe extern "C" fn(*mut c_void, *mut u32) -> *const NdiSource;
type RecvCreateFn = unsafe extern "C" fn(*const NdiRecvCreate) -> *mut c_void;
type RecvDestroyFn = unsafe extern "C" fn(*mut c_void);
type RecvCaptureFn = unsafe extern "C" fn(*mut c_void, *mut NdiVideoFrame, *mut NdiAudioFrame, *mut c_void, u32) -> i32;
type RecvFreeVideoFn = unsafe extern "C" fn(*mut c_void, *const NdiVideoFrame);
type RecvFreeAudioFn = unsafe extern "C" fn(*mut c_void, *const NdiAudioFrame);
type SendCreateFn = unsafe extern "C" fn(*const NdiSendCreate) -> *mut c_void;
type SendDestroyFn = unsafe extern "C" fn(*mut c_void);
type SendVideoAsyncFn = unsafe extern "C" fn(*mut c_void, *const NdiVideoFrame);
type SendAudioFn = unsafe extern "C" fn(*mut c_void, *const NdiAudioFrame);

struct NdiApi {
    initialize: InitFn,
    version: VersionFn,
    find_create: FindCreateFn,
    find_destroy: FindDestroyFn,
    find_wait: FindWaitFn,
    find_get: FindGetFn,
    recv_create: RecvCreateFn,
    recv_destroy: RecvDestroyFn,
    recv_capture: RecvCaptureFn,
    recv_free_video: RecvFreeVideoFn,
    recv_free_audio: RecvFreeAudioFn,
    send_create: SendCreateFn,
    send_destroy: SendDestroyFn,
    send_video_async: SendVideoAsyncFn,
    send_audio: SendAudioFn,
    _lib: Library,
}

#[cfg(windows)]
struct Library(*mut c_void);

#[cfg(windows)]
impl Drop for Library {
    fn drop(&mut self) {
        unsafe {
            if !self.0.is_null() {
                FreeLibrary(self.0);
            }
        }
    }
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryW(name: *const u16) -> *mut c_void;
    fn GetProcAddress(lib: *mut c_void, name: *const c_char) -> *mut c_void;
    fn FreeLibrary(lib: *mut c_void) -> i32;
    fn GetModuleFileNameW(module: *mut c_void, name: *mut u16, size: u32) -> u32;
}

#[cfg(windows)]
fn wide(path: &std::path::Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    path.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn load_library(path: &std::path::Path) -> Option<Library> {
    let w = wide(path);
    let h = unsafe { LoadLibraryW(w.as_ptr()) };
    if h.is_null() { None } else { Some(Library(h)) }
}

#[cfg(windows)]
fn exe_dir() -> Option<PathBuf> {
    let mut buf = vec![0u16; 32768];
    let n = unsafe { GetModuleFileNameW(ptr::null_mut(), buf.as_mut_ptr(), buf.len() as u32) };
    if n == 0 || n as usize >= buf.len() { return None; }
    let s = String::from_utf16_lossy(&buf[..n as usize]);
    PathBuf::from(s).parent().map(|p| p.to_path_buf())
}

fn runtime_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(dir) = exe_dir() {
        out.push(dir.join("Processing.NDI.Lib.x64.dll"));
    }
    if let Ok(dir) = env::var("NDI_RUNTIME_DIR") {
        out.push(PathBuf::from(dir).join("Processing.NDI.Lib.x64.dll"));
    }
    out.push(PathBuf::from(
        r"C:\Program Files\NDI\NDI 6 Tools\Runtime\Processing.NDI.Lib.x64.dll",
    ));
    out.push(PathBuf::from(
        r"C:\Program Files\NDI\NDI 6 Tools\Bridge\Processing.NDI.Lib.Advanced.x64.dll",
    ));
    out
}

unsafe fn symbol<T: Copy>(lib: &Library, name: &str) -> Option<T> {
    let c = CString::new(name).ok()?;
    let p = GetProcAddress(lib.0, c.as_ptr());
    if p.is_null() { None } else { Some(std::mem::transmute_copy::<*mut c_void, T>(&p)) }
}

#[cfg(windows)]
fn load_ndi() -> Result<NdiApi, String> {
    for path in runtime_candidates() {
        if !path.is_file() { continue; }
        let Some(lib) = load_library(&path) else { continue };
        unsafe {
            macro_rules! sym {
                ($name:literal) => {
                    match symbol::<_>(&lib, $name) {
                        Some(f) => f,
                        None => continue,
                    }
                };
            }
            let api = NdiApi {
                initialize: sym!("NDIlib_initialize"),
                version: sym!("NDIlib_version"),
                find_create: sym!("NDIlib_find_create_v2"),
                find_destroy: sym!("NDIlib_find_destroy"),
                find_wait: sym!("NDIlib_find_wait_for_sources"),
                find_get: sym!("NDIlib_find_get_current_sources"),
                recv_create: sym!("NDIlib_recv_create_v3"),
                recv_destroy: sym!("NDIlib_recv_destroy"),
                recv_capture: sym!("NDIlib_recv_capture_v3"),
                recv_free_video: sym!("NDIlib_recv_free_video_v2"),
                recv_free_audio: sym!("NDIlib_recv_free_audio_v3"),
                send_create: sym!("NDIlib_send_create"),
                send_destroy: sym!("NDIlib_send_destroy"),
                send_video_async: sym!("NDIlib_send_send_video_async_v2"),
                send_audio: sym!("NDIlib_send_send_audio_v3"),
                _lib: lib,
            };
            if (api.initialize)() == 0 {
                return Err(format!("NDI Runtime encontrado em {}, mas initialize() falhou", path.display()));
            }
            return Ok(api);
        }
    }
    Err("NDI Runtime não encontrado. Instale o NDI Runtime 6.3+ (https://ndi.video/tools/) ou coloque Processing.NDI.Lib.x64.dll na pasta do castdeck-ndi.".into())
}

#[cfg(not(windows))]
fn load_ndi() -> Result<NdiApi, String> {
    Err("castdeck-ndi Rust está disponível primeiro para Windows; Linux/macOS entram na Fase 3.".into())
}

fn json(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

unsafe fn cstr(p: *const c_char) -> String {
    if p.is_null() { String::new() } else { CStr::from_ptr(p).to_string_lossy().into_owned() }
}

unsafe fn list_sources(api: &NdiApi) -> Result<Vec<(String, String)>, String> {
    let fc = NdiFindCreate { show_local_sources: 1, p_groups: ptr::null(), p_extra_ips: ptr::null() };
    let finder = (api.find_create)(&fc);
    if finder.is_null() { return Err("Finder NDI indisponível".into()); }
    (api.find_wait)(finder, 1000);
    let mut n = 0u32;
    let p = (api.find_get)(finder, &mut n);
    let mut out = Vec::with_capacity(n as usize);
    if !p.is_null() {
        for i in 0..n as usize {
            let s = &*p.add(i);
            out.push((cstr(s.p_ndi_name), cstr(s.p_url_address)));
        }
    }
    (api.find_destroy)(finder);
    Ok(out)
}

unsafe fn receive(api: &NdiApi, name: &str, seconds: u32) -> Result<(), String> {
    let sources = list_sources(api)?;
    let (found_name, found_url) = sources
        .into_iter()
        .find(|(n, _)| n == name)
        .ok_or_else(|| format!("Fonte NDI não encontrada: {name}"))?;
    let cname = CString::new(found_name).map_err(|_| "Nome NDI inválido".to_string())?;
    let curl = CString::new(found_url).map_err(|_| "URL NDI inválida".to_string())?;
    let source = NdiSource { p_ndi_name: cname.as_ptr(), p_url_address: curl.as_ptr() };
    let rc = NdiRecvCreate {
        source_to_connect_to: source,
        color_format: NDI_RECV_COLOR_UYVY_BGRA,
        bandwidth: NDI_RECV_BANDWIDTH_HIGHEST,
        allow_video_fields: 0,
        p_ndi_recv_name: b"CastDeck NDI Bridge\0".as_ptr() as *const c_char,
    };
    let recv = (api.recv_create)(&rc);
    if recv.is_null() { return Err("Não foi possível criar o receiver NDI".into()); }
    let until = Instant::now() + Duration::from_secs(seconds.max(1) as u64);
    let mut video = 0u64;
    let mut audio = 0u64;
    while Instant::now() < until {
        let mut vf = std::mem::zeroed::<NdiVideoFrame>();
        let mut af = std::mem::zeroed::<NdiAudioFrame>();
        let t = (api.recv_capture)(recv, &mut vf, &mut af, ptr::null_mut(), 500);
        if t == NDI_FRAME_VIDEO {
            video += 1;
            if video == 1 {
                println!("{{\"video\":true,\"width\":{},\"height\":{},\"fourcc\":{},\"fps\":\"{}/{}\"}}", vf.xres, vf.yres, vf.fourcc, vf.frame_rate_n, vf.frame_rate_d);
            }
            (api.recv_free_video)(recv, &vf);
        } else if t == NDI_FRAME_AUDIO {
            audio += 1;
            (api.recv_free_audio)(recv, &af);
        }
    }
    (api.recv_destroy)(recv);
    println!("{{\"ok\":true,\"video_frames\":{},\"audio_frames\":{}}}", video, audio);
    Ok(())
}

unsafe fn send_test(api: &NdiApi, name: &str, seconds: u32) -> Result<(), String> {
    let cname = CString::new(name).map_err(|_| "Nome NDI inválido".to_string())?;
    let sc = NdiSendCreate { p_ndi_name: cname.as_ptr(), p_groups: ptr::null(), clock_video: 1, clock_audio: 0 };
    let send = (api.send_create)(&sc);
    if send.is_null() { return Err("Não foi possível criar o sender NDI".into()); }

    const W: usize = 1280;
    const H: usize = 720;
    const SAMPLES: usize = 1600;
    let mut video_bufs = [vec![0u8; W * H * 4], vec![0u8; W * H * 4]];
    let mut audio = vec![0f32; 2 * SAMPLES];
    let mut video = [NdiVideoFrame {
        xres: W as i32, yres: H as i32, fourcc: NDI_FOURCC_BGRA,
        frame_rate_n: 30000, frame_rate_d: 1001, picture_aspect_ratio: 16.0 / 9.0,
        frame_format_type: NDI_FRAME_PROGRESSIVE, timecode: NDI_SEND_TIMECODE_SYNTHESIZE,
        p_data: ptr::null_mut(), line_stride_in_bytes: (W * 4) as i32,
        p_metadata: ptr::null(), timestamp: 0,
    }; 2];
    let mut audio_frame = NdiAudioFrame {
        sample_rate: 48000, no_channels: 2, no_samples: SAMPLES as i32,
        timecode: NDI_SEND_TIMECODE_SYNTHESIZE, fourcc: NDI_FOURCC_FLTP,
        p_data: ptr::null_mut(), channel_stride_in_bytes: (SAMPLES * 4) as i32,
        p_metadata: ptr::null(), timestamp: 0,
    };

    println!("READY {}", name);
    let until = Instant::now() + Duration::from_secs(seconds.max(1) as u64);
    let start = Instant::now();
    let mut frame = 0u64;
    while Instant::now() < until {
        let b = &mut video_bufs[(frame as usize) & 1];
        // Padrão de teste BGRA, sem alocação por quadro.
        for y in 0..H {
            let gy = (y * 255 / (H - 1)) as u8;
            for x in 0..W {
                let i = (y * W + x) * 4;
                b[i] = ((frame as usize * 3 + x / 8 + y / 8) & 0xff) as u8;
                b[i + 1] = gy;
                b[i + 2] = (x * 255 / (W - 1)) as u8;
                b[i + 3] = 255;
            }
        }
        video[(frame as usize) & 1].p_data = b.as_mut_ptr();
        (api.send_video_async)(send, &video[(frame as usize) & 1]);

        let t0 = frame as f64 / 30.0;
        for i in 0..SAMPLES {
            let s = (0.06 * (2.0 * std::f64::consts::PI * 440.0 * (t0 + i as f64 / 48000.0)).sin()) as f32;
            audio[i] = s;
            audio[SAMPLES + i] = s;
        }
        audio_frame.p_data = audio.as_mut_ptr() as *mut u8;
        (api.send_audio)(send, &audio_frame);

        frame += 1;
        let target = start + Duration::from_secs_f64(frame as f64 / 30.0);
        let now = Instant::now();
        if target > now {
            thread::sleep(target - now);
        }
    }
    (api.send_destroy)(send);
    println!("{{\"ok\":true,\"frames\":{}}}", frame);
    Ok(())
}

unsafe fn extract(api: &NdiApi, name: &str, url: Option<&str>) -> Result<(), String> {
    // Com a URL que a descoberta já entregou, o servidor evita um finder de ~1 s no caminho crítico.
    let cname = CString::new(name).map_err(|_| "Nome NDI inválido")?;
    let curl = if let Some(u) = url {
        CString::new(u).map_err(|_| "URL NDI inválida")?
    } else {
        let source = list_sources(api)?
            .into_iter()
            .find(|(n, _)| n == name)
            .ok_or_else(|| format!("Fonte NDI não encontrada: {name}"))?;
        CString::new(source.1).map_err(|_| "URL NDI inválida")?
    };
    let rc = NdiRecvCreate {
        source_to_connect_to: NdiSource { p_ndi_name: cname.as_ptr(), p_url_address: curl.as_ptr() },
        color_format: NDI_RECV_COLOR_UYVY_BGRA,
        bandwidth: NDI_RECV_BANDWIDTH_HIGHEST,
        allow_video_fields: 0,
        p_ndi_recv_name: b"CastDeck NDI Extract\0".as_ptr() as *const c_char,
    };
    let recv = (api.recv_create)(&rc);
    if recv.is_null() { return Err("Não foi possível criar o receiver NDI".into()); }
    let mut stdout = std::io::stdout().lock();
    let mut meta_sent = false;
    let mut last_meta: Option<(i32, i32, i32, i32, u32)> = None;
    loop {
        let mut vf = std::mem::zeroed::<NdiVideoFrame>();
        let mut af = std::mem::zeroed::<NdiAudioFrame>();
        let t = (api.recv_capture)(recv, &mut vf, &mut af, ptr::null_mut(), 500);
        if t == NDI_FRAME_VIDEO {
            let cur = (vf.xres, vf.yres, vf.frame_rate_n, vf.frame_rate_d, vf.fourcc);
            if !meta_sent {
                let _ = write!(stdout, "META {} {} {} {} {}\n", vf.xres, vf.yres, vf.frame_rate_n, vf.frame_rate_d, vf.fourcc);
                let _ = stdout.flush();
                meta_sent = true;
                last_meta = Some(cur);
            } else if last_meta != Some(cur) {
                // Resolução/FourCC mudou (comum em NDI Webcam/Test Patterns redimensionado).
                // Envia um registro M para o servidor reiniciar o FFmpeg com o novo formato.
                let text = format!("{} {} {} {} {}\n", vf.xres, vf.yres, vf.frame_rate_n, vf.frame_rate_d, vf.fourcc);
                let mut mhead = [0u8; 5];
                mhead[0] = b'M';
                mhead[1..].copy_from_slice(&(text.len() as u32).to_le_bytes());
                let _ = stdout.write_all(&mhead);
                let _ = stdout.write_all(text.as_bytes());
                last_meta = Some(cur);
            }
            let bpp = if vf.fourcc == NDI_FOURCC_UYVY { 2 } else { 4 };
            let row = vf.xres as usize * bpp;
            // Alguns senders devolvem line_stride 0 (usar a largura) ou stride negativo
            // (imagem bottom-up). Sem esse ajuste o stream desalinha e a imagem quebra.
            let raw_stride = vf.line_stride_in_bytes;
            let stride = if raw_stride == 0 { row } else { (raw_stride.unsigned_abs() as usize).max(row) };
            let data = std::slice::from_raw_parts(vf.p_data, stride * vf.yres as usize);
            let mut head = [0u8; 5];
            head[0] = b'V';
            head[1..].copy_from_slice(&(row * vf.yres as usize).to_le_bytes()[..4]);
            if stdout.write_all(&head).is_err() { break; }
            if stride == row && raw_stride >= 0 {
                if stdout.write_all(data).is_err() { break; }
            } else {
                for y in 0..vf.yres as usize {
                    let src = if raw_stride < 0 { vf.yres as usize - 1 - y } else { y };
                    if stdout.write_all(&data[src * stride..src * stride + row]).is_err() { return Ok(()); }
                }
            }
            (api.recv_free_video)(recv, &vf);
        } else if t == NDI_FRAME_AUDIO {
            if !meta_sent {
                (api.recv_free_audio)(recv, &af);
                continue;
            }
            let ch = af.no_channels.max(1) as usize;
            let n = af.no_samples.max(0) as usize;
            let stride = af.channel_stride_in_bytes.max(0) as usize;
            if n > 0 && stride >= n * 4 {
                let mut inter = vec![0f32; n * 2];
                for c in 0..ch.min(2) {
                    let plane = std::slice::from_raw_parts(af.p_data.add(c * stride) as *const f32, n);
                    for i in 0..n { inter[i * 2 + c] = plane[i]; }
                }
                if ch == 1 { for i in 0..n { inter[i * 2 + 1] = inter[i * 2]; } }
                let mut head = [0u8; 5];
                head[0] = b'A';
                head[1..].copy_from_slice(&(inter.len() * 4).to_le_bytes()[..4]);
                if stdout.write_all(&head).is_err() { break; }
                if stdout.write_all(std::slice::from_raw_parts(inter.as_ptr() as *const u8, inter.len() * 4)).is_err() { break; }
            }
            (api.recv_free_audio)(recv, &af);
        }
        let _ = stdout.flush();
    }
    (api.recv_destroy)(recv);
    Ok(())
}


unsafe fn send_raw(api: &NdiApi, name: &str, width: u32, height: u32, fps: u32) -> Result<(), String> {
    let cname = CString::new(name).map_err(|_| "Nome NDI inválido".to_string())?;
    // clock_video=false: o FFmpeg já entrega a 30 fps; o relógio do NDI só adicionaria buffer.
    let sc = NdiSendCreate { p_ndi_name: cname.as_ptr(), p_groups: ptr::null(), clock_video: 0, clock_audio: 0 };
    let send = (api.send_create)(&sc);
    if send.is_null() { return Err("Não foi possível criar o sender NDI".into()); }
    let frame_bytes = width as usize * height as usize * 2;
    let mut bufs = [vec![0u8; frame_bytes], vec![0u8; frame_bytes]];
    let mut video = [NdiVideoFrame {
        xres: width as i32, yres: height as i32, fourcc: NDI_FOURCC_UYVY,
        frame_rate_n: fps as i32, frame_rate_d: 1, picture_aspect_ratio: 16.0 / 9.0,
        frame_format_type: NDI_FRAME_PROGRESSIVE, timecode: NDI_SEND_TIMECODE_SYNTHESIZE,
        p_data: ptr::null_mut(), line_stride_in_bytes: width as i32 * 2,
        p_metadata: ptr::null(), timestamp: 0,
    }; 2];
    let mut audio_acc: Vec<f32> = Vec::with_capacity(8192);
    let mut planar: Vec<f32> = vec![0.0; 2 * 1600];
    let mut stdin = std::io::stdin().lock();
    let mut header = [0u8; 5];
    let mut frame = 0u64;
    println!("NDI_READY {name} {width}x{height}@{fps}");
    let _ = std::io::stdout().flush();
    loop {
        if stdin.read_exact(&mut header).is_err() { break; }
        let len = u32::from_le_bytes([header[1], header[2], header[3], header[4]]) as usize;
        if len == 0 || len > 64 * 1024 * 1024 { return Err("frame inválido".into()); }
        if header[0] == b'V' {
            if len != frame_bytes { return Err(format!("vídeo {len} != {frame_bytes}")); }
            let b = &mut bufs[(frame as usize) & 1];
            stdin.read_exact(b).map_err(|e| format!("vídeo: {e}"))?;
            video[(frame as usize) & 1].p_data = b.as_mut_ptr();
            (api.send_video_async)(send, &video[(frame as usize) & 1]);
            frame += 1;
        } else if header[0] == b'A' {
            let mut raw = vec![0u8; len];
            stdin.read_exact(&mut raw).map_err(|e| format!("áudio: {e}"))?;
            audio_acc.extend(raw.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])));
            while audio_acc.len() >= 3200 {
                for i in 0..1600 {
                    planar[i] = audio_acc[i * 2];
                    planar[1600 + i] = audio_acc[i * 2 + 1];
                }
                audio_acc.drain(..3200);
                let af = NdiAudioFrame {
                    sample_rate: 48000, no_channels: 2, no_samples: 1600,
                    timecode: NDI_SEND_TIMECODE_SYNTHESIZE, fourcc: NDI_FOURCC_FLTP,
                    p_data: planar.as_mut_ptr() as *mut u8,
                    channel_stride_in_bytes: 1600 * 4,
                    p_metadata: ptr::null(), timestamp: 0,
                };
                (api.send_audio)(send, &af);
            }
        } else {
            return Err("tipo de frame desconhecido".into());
        }
    }
    (api.send_destroy)(send);
    println!("{{\"ok\":true,\"video_frames\":{}}}", frame);
    Ok(())
}


fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("version");
    let api = match load_ndi() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };
    let result = unsafe {
        match cmd {
            "version" => {
                let p = (api.version)();
                let v = if p.is_null() { "unknown".to_string() } else { CStr::from_ptr(p).to_string_lossy().into_owned() };
                println!("{{\"ndi\":\"{}\"}}", json(&v));
                Ok(())
            }
            "list" => match list_sources(&api) {
                Ok(v) => {
                    let body = v.iter().map(|(n, u)| format!("{{\"name\":\"{}\",\"url\":\"{}\"}}", json(n), json(u))).collect::<Vec<_>>().join(",");
                    println!("{{\"sources\":[{body}]}}");
                    Ok(())
                }
                Err(e) => Err(e),
            },
            "receive" => {
                let name = match args.get(2) { Some(n) => n, None => { eprintln!("Uso: castdeck-ndi receive \"NOME\" [segundos]"); return ExitCode::from(1); } };
                let secs = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(5);
                receive(&api, name, secs)
            }
            "send-test" => {
                let name = match args.get(2) { Some(n) => n, None => { eprintln!("Uso: castdeck-ndi send-test \"NOME\" [segundos]"); return ExitCode::from(1); } };
                let secs = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(10);
                send_test(&api, name, secs)
            }
            "send-raw" => {
                let name = match args.get(2) { Some(n) => n, None => { eprintln!("Uso: castdeck-ndi send-raw \"NOME\" LARGURA ALTURA FPS"); return ExitCode::from(1); } };
                let width = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1280u32);
                let height = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(720u32);
                let fps = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(30u32);
                send_raw(&api, name, width, height, fps)
            }
            "extract" => {
                let name = match args.get(2) { Some(n) => n, None => { eprintln!("Uso: castdeck-ndi extract \"NOME\" [URL]"); return ExitCode::from(1); } };
                extract(&api, name, args.get(3).map(String::as_str))
            }
            _ => Err("Comando desconhecido. Use version, list, receive, send-test, send-raw ou extract.".into()),
        }
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::from(1)
        }
    }
}
