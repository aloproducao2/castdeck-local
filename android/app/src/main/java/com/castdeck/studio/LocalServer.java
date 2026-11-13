// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.content.Context;
import android.content.res.AssetManager;
import android.os.Build;
import android.os.Environment;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoWSD;

/**
 * Porta de server/index.js para Android: o mesmo painel/estúdio (pasta public/ embutida no APK),
 * a mesma API REST e os mesmos WebSockets (/ws sinalização, /ingest transmissão).
 *  http://127.0.0.1:3000   -> WebView do app (host)
 *  https://<ip-wifi>:3443  -> convidados na mesma rede
 */
public class LocalServer {
    private static final String TAG = "CastDeck.Server";
    public static final int HTTP_PORT = 3000, HTTPS_PORT = 3443;
    static final long BUSY_MS = 2 * 60 * 1000;

    // TURN oficial do CastDeck (turn.flue.live): credenciais temporárias, renovadas antes de expirar
    private static final String OFFICIAL_TURN = "https://cast.flue.live/api/turn";
    private static JSONArray officialTurnServers;
    private static long officialTurnUntil;

    static synchronized JSONArray officialTurn() {
        long now = System.currentTimeMillis();
        if (now < officialTurnUntil) return officialTurnServers;
        java.net.HttpURLConnection c = null;
        try {
            c = (java.net.HttpURLConnection) new java.net.URL(OFFICIAL_TURN).openConnection();
            c.setConnectTimeout(4000);
            c.setReadTimeout(4000);
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            JSONObject j = new JSONObject(out.toString("UTF-8"));
            officialTurnServers = j.getJSONArray("iceServers");
            officialTurnUntil = now + Math.max(60, j.optLong("ttl", 3600) / 2) * 1000;
        } catch (Exception e) {
            Log.w(TAG, "TURN oficial indisponível: " + e.getMessage());
            // tenta de novo em 1 min (mantém as últimas credenciais se ainda valerem)
            if (officialTurnServers == null || now >= officialTurnUntil) officialTurnUntil = now + 60_000;
        } finally {
            if (c != null) c.disconnect();
        }
        return officialTurnServers;
    }

    final Context ctx;
    final Store store;
    final SignalingHub hub;
    final IngestManager ingest;
    final File dataDir, cacheDir;
    final File defaultRecDir;
    private final AssetManager assets;
    private Http http, https;
    final AndroidTunnel tunnel;
    final PollHub polls = new PollHub();
    final MsgHub msgs = new MsgHub();
    final Updater updater;
    final UvcManager uvc;
    public Runnable onQuit;

    public LocalServer(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.assets = ctx.getAssets();
        dataDir = new File(ctx.getFilesDir(), "data");
        cacheDir = new File(dataDir, "media-cache");
        store = new Store(dataDir);
        store.load();
        hub = new SignalingHub(id -> store.getStudio(id) != null, store::studioOutKey);
        defaultRecDir = pickDefaultRecDir();
        ingest = new IngestManager(this.ctx, store, this::recDir);
        tunnel = new AndroidTunnel(this.ctx, () -> store.getSettings().optString("tunnelProvider", "cloudflare"), HTTP_PORT);
        updater = new Updater(this.ctx);
        uvc = new UvcManager(this.ctx);
    }

    private File pickDefaultRecDir() {
        File pub = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "CastDeck");
        if (probeDir(pub)) return pub;
        File own = ctx.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        if (own != null) return own;
        return new File(dataDir, "recordings");
    }

    static boolean probeDir(File dir) {
        try {
            dir.mkdirs();
            File probe = new File(dir, "castdeck-teste.mp4");
            try (FileOutputStream o = new FileOutputStream(probe)) {
                o.write(1);
            }
            return probe.delete() || true;
        } catch (Exception e) {
            return false;
        }
    }

    File recDir() {
        String d = store.getSettings().optString("recordingsDir", "");
        return d.isEmpty() ? defaultRecDir : new File(d);
    }

    public void start() throws IOException {
        uvc.start();
        http = new Http("127.0.0.1", HTTP_PORT);
        http.start(0, false); // timeout 0: WebSockets ficam abertos
        List<String> ips = new ArrayList<>();
        for (String[] i : Net.lanIps()) ips.add(i[1]);
        new Thread(() -> {
            try {
                Http s = new Http(null, HTTPS_PORT);
                s.makeSecure(SelfSignedCert.serverSocketFactory(new File(dataDir, "certs"), ips), null);
                s.start(0, false);
                https = s;
                for (String ip : ips) Log.i(TAG, "Convidados (LAN): https://" + ip + ":" + HTTPS_PORT);
            } catch (Exception e) {
                Log.w(TAG, "HTTPS para convidados indisponível", e);
            }
        }, "https-boot").start();
        Log.i(TAG, "CastDeck pronto em http://127.0.0.1:" + HTTP_PORT);
        if (store.getSettings().optBoolean("autoTunnel", false)) tunnel.start();
    }

    public void stop() {
        uvc.stop();
        tunnel.stop();
        ingest.stopAll();
        store.flushNow();
        if (http != null) http.stop();
        if (https != null) https.stop();
    }

    // ---------- helpers ----------
    static NanoHTTPD.Response.IStatus status(int code) {
        for (NanoHTTPD.Response.Status s : NanoHTTPD.Response.Status.values()) if (s.getRequestStatus() == code) return s;
        return new NanoHTTPD.Response.IStatus() {
            @Override
            public String getDescription() {
                return code + " Status";
            }

            @Override
            public int getRequestStatus() {
                return code;
            }
        };
    }

    static NanoHTTPD.Response json(int code, Object body) {
        Object out = body;
        try {
            if (body instanceof Map) out = new JSONObject((Map<?, ?>) body);
            else if (body instanceof List) out = new JSONArray((List<?>) body);
        } catch (Exception ignored) {}
        String text = (out instanceof JSONObject || out instanceof JSONArray) ? out.toString() : String.valueOf(body);
        NanoHTTPD.Response r = NanoHTTPD.newFixedLengthResponse(status(code), "application/json; charset=utf-8", text);
        r.addHeader("Cache-Control", "no-store");
        return r;
    }

    static NanoHTTPD.Response err(int code, String message) {
        try {
            return json(code, new JSONObject().put("error", message));
        } catch (Exception e) {
            return json(code, "{}");
        }
    }

    static JSONObject ok() {
        try {
            return new JSONObject().put("ok", true);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static boolean isLoopback(String ip) {
        return ip != null && (ip.equals("127.0.0.1") || ip.equals("::1") || ip.equals("0:0:0:0:0:0:0:1") || ip.equals("::ffff:127.0.0.1"));
    }

    static boolean isLocal(NanoHTTPD.IHTTPSession s) {
        Map<String, String> h = s.getHeaders();
        if (!isLoopback(s.getRemoteIpAddress())) return false;
        if (h.containsKey("cf-connecting-ip") || h.containsKey("cf-ray") || h.containsKey("x-forwarded-for") || h.containsKey("x-forwarded-host")) return false;
        String host = h.get("host");
        if (host == null || !host.matches("(?i)^(localhost|127\\.0\\.0\\.1|\\[::1\\])(:\\d+)?$")) return false;
        // CSRF: uma página externa pode fazer POST para 127.0.0.1; exige que a origem seja o próprio painel.
        String site = h.get("sec-fetch-site");
        if (site != null && site.equalsIgnoreCase("cross-site")) return false;
        String origin = h.get("origin");
        if (origin != null && !origin.isEmpty()) {
            try {
                String authority = java.net.URI.create(origin).getAuthority();
                if (authority == null || !authority.equalsIgnoreCase(host)) return false;
            } catch (Exception e) {
                return false;
            }
        }
        return true;
    }

    static String mime(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".json")) return "application/json; charset=utf-8";
        if (n.endsWith(".wasm")) return "application/wasm";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".ico")) return "image/x-icon";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".woff")) return "font/woff";
        if (n.endsWith(".mp4")) return "video/mp4";
        if (n.endsWith(".webm")) return "video/webm";
        if (n.endsWith(".mkv")) return "video/x-matroska";
        if (n.endsWith(".mp3")) return "audio/mpeg";
        if (n.endsWith(".wav")) return "audio/wav";
        if (n.endsWith(".pdf")) return "application/pdf";
        return "application/octet-stream";
    }

    // Cache em memória dos assets embutidos no APK: evita descompactar o ZIP e alocar buffers na Heap a cada requisição
    private final Map<String, byte[]> assetCache = new java.util.concurrent.ConcurrentHashMap<>();

    private byte[] readAsset(String path) {
        byte[] cached = assetCache.get(path);
        if (cached != null) return cached;
        try (InputStream in = assets.open("web/" + path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            byte[] res = out.toByteArray();
            if (res.length <= 2 * 1024 * 1024) assetCache.put(path, res);
            return res;
        } catch (IOException e) {
            return null;
        }
    }

    private NanoHTTPD.Response page(String file, boolean hostPage) {
        byte[] b = readAsset(file);
        if (b == null) return err(404, "not found");
        NanoHTTPD.Response r = NanoHTTPD.newFixedLengthResponse(status(200), "text/html; charset=utf-8", new ByteArrayInputStream(b), b.length);
        r.addHeader("Cache-Control", "no-cache");
        return r;
    }

    private NanoHTTPD.Response staticAsset(String uri) {
        String p = uri.replaceFirst("^/+", "");
        if (p.isEmpty() || p.contains("..")) return null;
        byte[] b = readAsset(p);
        if (b == null && !p.contains(".")) {
            b = readAsset(p + ".html");
            if (b != null) p = p + ".html";
        }
        if (b == null) return null;
        boolean isHtml = p.endsWith(".html");
        boolean isCode = p.endsWith(".js") || p.endsWith(".css");
        NanoHTTPD.Response r = NanoHTTPD.newFixedLengthResponse(status(200), mime(p), new ByteArrayInputStream(b), b.length);
        // HTML, JS e CSS nunca podem ficar presos no cache do WebView depois de uma atualização do APK.
        // Imagens, fontes e mídia estática continuam em cache para velocidade.
        r.addHeader("Cache-Control", (isHtml || isCode) ? "no-cache" : "public, max-age=86400");
        return r;
    }

    /** arquivo com suporte a Range (players de vídeo pedem pedaços) */
    static NanoHTTPD.Response file(File f, NanoHTTPD.IHTTPSession s) {
        if (!f.isFile()) return err(404, "not found");
        try {
            long len = f.length();
            String range = s.getHeaders().get("range");
            String type = mime(f.getName());
            if (range != null && range.startsWith("bytes=")) {
                String[] p = range.substring(6).split("-", 2);
                long start = p[0].isEmpty() ? Math.max(0, len - Long.parseLong(p[1])) : Long.parseLong(p[0]);
                long end = p[0].isEmpty() || p.length < 2 || p[1].isEmpty() ? len - 1 : Math.min(len - 1, Long.parseLong(p[1]));
                if (start >= len) {
                    NanoHTTPD.Response r = NanoHTTPD.newFixedLengthResponse(status(416), "text/plain", "");
                    r.addHeader("Content-Range", "bytes */" + len);
                    return r;
                }
                FileInputStream in = new FileInputStream(f);
                long skipped = 0;
                while (skipped < start) skipped += in.skip(start - skipped);
                NanoHTTPD.Response r = NanoHTTPD.newFixedLengthResponse(status(206), type, in, end - start + 1);
                r.addHeader("Content-Range", "bytes " + start + "-" + end + "/" + len);
                r.addHeader("Accept-Ranges", "bytes");
                return r;
            }
            NanoHTTPD.Response r = NanoHTTPD.newFixedLengthResponse(status(200), type, new FileInputStream(f), len);
            r.addHeader("Accept-Ranges", "bytes");
            return r;
        } catch (Exception e) {
            return err(500, e.getMessage());
        }
    }

    static byte[] body(NanoHTTPD.IHTTPSession s, int max) throws IOException {
        String cl = s.getHeaders().get("content-length");
        long n = cl == null ? 0 : Long.parseLong(cl.trim());
        if (n > max) {
            // descarta para manter a conexão íntegra
            long left = n;
            byte[] tmp = new byte[65536];
            InputStream in = s.getInputStream();
            while (left > 0) {
                int r = in.read(tmp, 0, (int) Math.min(tmp.length, left));
                if (r <= 0) break;
                left -= r;
            }
            return null;
        }
        byte[] b = new byte[(int) n];
        int off = 0;
        InputStream in = s.getInputStream();
        while (off < n) {
            int r = in.read(b, off, (int) n - off);
            if (r <= 0) break;
            off += r;
        }
        return b;
    }

    static JSONObject jsonBody(NanoHTTPD.IHTTPSession s) {
        try {
            byte[] b = body(s, 25 * 1024 * 1024);
            if (b == null || b.length == 0) return new JSONObject();
            return new JSONObject(new String(b, StandardCharsets.UTF_8));
        } catch (Exception e) {
            return new JSONObject();
        }
    }


    static JSONObject maskKey(JSONObject d) throws Exception {
        JSONObject o = new JSONObject(d.toString());
        String k = d.optString("key", "");
        StringBuilder m = new StringBuilder();
        if (!k.isEmpty()) {
            m.append(k, 0, Math.min(4, k.length()));
            for (int i = 0; i < Math.max(4, k.length() - 4); i++) m.append('•');
        }
        o.put("key", m.toString());
        o.put("hasKey", !k.isEmpty());
        return o;
    }

    // ---------- API ----------
    private JSONObject system() throws Exception {
        JSONObject ff = new JSONObject();
        ff.put("path", "mediacodec").put("available", true).put("version", "Android-MediaCodec").put("installing", false).put("download", JSONObject.NULL);
        ff.put("encoders", new JSONArray().put(new JSONObject().put("id", "mediacodec").put("label", "Hardware do aparelho (MediaCodec)").put("hw", true)));
        JSONArray lan = new JSONArray();
        for (String[] i : Net.lanIps())
            lan.put(new JSONObject().put("name", i[0].startsWith("wlan") ? "Wi-Fi" : i[0]).put("address", i[1]).put("url", "https://" + i[1] + ":" + HTTPS_PORT));
        JSONObject j = new JSONObject();
        j.put("ffmpeg", ff);
        j.put("presets", Broadcast.PRESETS);
        j.put("httpPort", HTTP_PORT);
        j.put("httpsPort", HTTPS_PORT);
        j.put("lan", lan);
        j.put("tunnel", tunnel.info());
        j.put("settings", store.getSettings());
        j.put("rooms", hub.roomStats());
        j.put("broadcasts", ingest.list());
        j.put("recordingsDir", recDir().getAbsolutePath());
        j.put("recordingsDefault", defaultRecDir.getAbsolutePath());
        j.put("platform", "android");
        j.put("updateTarget", "android-arm64");
        j.put("version", updater.current());
        j.put("device", Build.MANUFACTURER + " " + Build.MODEL + " · Android " + Build.VERSION.RELEASE);
        return j;
    }

    static final Pattern REC = Pattern.compile("(?i).*\\.(mp4|mkv|webm|flv|ts)$");

    private List<File> scan(File dir, boolean recOnly) {
        List<File> out = new ArrayList<>();
        File[] fs = dir.listFiles();
        if (fs == null) return out;
        for (File f : fs) if (f.isFile() && (!recOnly || REC.matcher(f.getName()).matches())) out.add(f);
        return out;
    }

    private static long sum(List<File> l) {
        long s = 0;
        for (File f : l) s += f.length();
        return s;
    }

    private NanoHTTPD.Response api(NanoHTTPD.IHTTPSession s, String path, NanoHTTPD.Method m) throws Exception {
        // ---- público ----
        Matcher pm = Pattern.compile("^/public/studios/([^/]+)$").matcher(path);
        if (m == NanoHTTPD.Method.GET && pm.matches()) {
            JSONObject st = store.getStudio(pm.group(1));
            if (st == null) return err(404, "Estúdio não encontrado");
            JSONObject brand = st.optJSONObject("brand");
            return json(200, new JSONObject().put("id", st.optString("id")).put("name", st.optString("name"))
                    .put("color", brand != null && brand.has("color") ? brand.get("color") : JSONObject.NULL));
        }
        // votação do público pelo celular (QR Code da enquete)
        pm = Pattern.compile("^/public/vote/([^/]+)$").matcher(path);
        if (pm.matches()) {
            JSONObject st = store.getStudio(pm.group(1));
            if (st == null) return err(404, "Estúdio não encontrado");
            if (m == NanoHTTPD.Method.GET) {
                JSONObject brand = st.optJSONObject("brand");
                JSONObject studio = new JSONObject().put("name", st.optString("name"))
                        .put("color", brand != null && brand.has("color") ? brand.get("color") : JSONObject.NULL);
                return json(200, new JSONObject().put("studio", studio).put("poll", polls.view(st.optString("id"), param(s, "voter"))));
            }
            if (m == NanoHTTPD.Method.POST) {
                String ip = s.getRemoteIpAddress();
                String cf = s.getHeaders().get("cf-connecting-ip");
                if (isLoopback(ip) && cf != null && !cf.isEmpty()) ip = cf;
                PollHub.Result r = polls.vote(st.optString("id"), jsonBody(s), ip == null ? "" : ip);
                return json(r.status, r.body);
            }
        }
        // mensagens do público pelo celular (QR Code da caixa de mensagens: texto curto ou áudio)
        pm = Pattern.compile("^/public/msg/([^/]+)$").matcher(path);
        if (pm.matches()) {
            JSONObject st = store.getStudio(pm.group(1));
            if (st == null) return err(404, "Estúdio não encontrado");
            if (m == NanoHTTPD.Method.GET) {
                JSONObject brand = st.optJSONObject("brand");
                JSONObject studio = new JSONObject().put("name", st.optString("name"))
                        .put("color", brand != null && brand.has("color") ? brand.get("color") : JSONObject.NULL);
                return json(200, new JSONObject().put("studio", studio).put("box", msgs.view(st.optString("id"))));
            }
            if (m == NanoHTTPD.Method.POST) {
                String ip = s.getRemoteIpAddress();
                String cf = s.getHeaders().get("cf-connecting-ip");
                if (isLoopback(ip) && cf != null && !cf.isEmpty()) ip = cf;
                PollHub.Result r = msgs.send(st.optString("id"), jsonBody(s), ip == null ? "" : ip);
                return json(r.status, r.body);
            }
        }
        if (m == NanoHTTPD.Method.GET && path.equals("/public/ice")) {
            JSONArray servers = new JSONArray();
            servers.put(new JSONObject().put("urls", new JSONArray(Arrays.asList("stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"))));
            JSONObject t = store.getSettings().optJSONObject("turn");
            if (t != null && !t.optString("urls").isEmpty()) {
                JSONObject ts = new JSONObject().put("urls", new JSONArray(Arrays.asList(t.optString("urls").trim().split("[\\s,]+"))));
                if (!t.optString("username").isEmpty()) ts.put("username", t.optString("username"));
                if (!t.optString("credential").isEmpty()) ts.put("credential", t.optString("credential"));
                servers.put(ts);
            } else {
                // sem TURN próprio: relay oficial do CastDeck e, como reserva, relays públicos gratuitos (melhor esforço)
                JSONArray official = officialTurn();
                if (official != null) for (int i = 0; i < official.length(); i++) servers.put(official.get(i));
                servers.put(new JSONObject().put("urls", new JSONArray(Arrays.asList("turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443",
                        "turns:openrelay.metered.ca:443?transport=tcp", "turn:openrelay.metered.ca:443?transport=tcp")))
                        .put("username", "openrelayproject").put("credential", "openrelayproject"));
            }
            return json(200, new JSONObject().put("iceServers", servers));
        }

        // ---- administrativo: só no próprio aparelho ----
        if (!isLocal(s)) return err(403, "Disponível apenas no aparelho do estúdio.");

        if (path.equals("/system")) return json(200, system());
        if (path.equals("/health")) return json(200, new JSONObject().put("ok", true).put("app", "castdeck").put("live", ingest.count()));
        // atualização dentro do app: baixa o APK novo (com progresso) e abre o instalador do Android
        if (path.equals("/update/status")) return json(200, updater.status());
        if (path.equals("/update/download") && m == NanoHTTPD.Method.POST) {
            jsonBody(s);
            return json(200, updater.download());
        }
        if (path.equals("/update/install") && m == NanoHTTPD.Method.POST) {
            jsonBody(s);
            if (ingest.count() > 0) return err(409, "Encerre a transmissão/gravação antes de atualizar.");
            try {
                return json(200, updater.install());
            } catch (Exception e) {
                return err(400, e.getMessage());
            }
        }
        if (path.equals("/quit") && m == NanoHTTPD.Method.POST) {
            if (onQuit != null) new Thread(() -> {
                try {
                    Thread.sleep(80);
                } catch (InterruptedException ignored) {
                }
                onQuit.run();
            }).start();
            return json(200, ok());
        }
        if (path.equals("/settings")) {
            if (m == NanoHTTPD.Method.GET) return json(200, store.getSettings());
            if (m == NanoHTTPD.Method.PUT) {
                JSONObject b = jsonBody(s);
                if (b.opt("recordingsDir") instanceof String) {
                    String dir = b.getString("recordingsDir").trim();
                    if (!dir.isEmpty()) {
                        File f = new File(dir);
                        if (!f.isAbsolute()) return err(400, "Use o caminho completo da pasta (ex.: /storage/emulated/0/Movies/Lives).");
                        if (!probeDir(f)) return err(400, "Não foi possível gravar nessa pasta. No Android use uma pasta dentro de Movies ou DCIM (ex.: " + defaultRecDir.getAbsolutePath() + ").");
                        b.put("recordingsDir", f.getAbsolutePath());
                    }
                }
                return json(200, store.updateSettings(b));
            }
        }
        if (path.equals("/pick-folder")) {
            jsonBody(s);
            return err(501, "No Android digite o caminho da pasta.");
        }
        // entradas RTMP/SRT (server/ingest.js): o MediaMTX embutido só existe nas versões para computador
        if (path.startsWith("/ingest")) {
            if (m != NanoHTTPD.Method.GET || !path.equals("/ingest")) {
                if (m == NanoHTTPD.Method.POST && !path.startsWith("/ingest/whep")) jsonBody(s);
                return err(501, "Disponível só na versão para computador.");
            }
            return json(200, new JSONObject().put("available", false).put("enabled", false).put("status", "off")
                    .put("sources", new JSONArray()).put("lan", new JSONArray())
                    .put("error", "Disponível só na versão para computador."));
        }
        if (path.startsWith("/tunnel")) {
            if (m == NanoHTTPD.Method.POST) {
                jsonBody(s);
                if (path.equals("/tunnel/start")) tunnel.start();
                else if (path.equals("/tunnel/restart")) tunnel.restart();
                else if (path.equals("/tunnel/stop")) tunnel.stop();
            }
            return json(200, tunnel.info());
        }
        if (path.equals("/open")) {
            jsonBody(s);
            return json(200, ok().put("mode", "app").put("url", "http://127.0.0.1:" + HTTP_PORT));
        }

        // estúdios
        if (path.equals("/studios")) {
            if (m == NanoHTTPD.Method.GET) return json(200, store.listStudios());
            if (m == NanoHTTPD.Method.POST) return json(201, store.createStudio(jsonBody(s).optString("name", "")));
        }
        pm = Pattern.compile("^/studios/([^/]+)$").matcher(path);
        if (pm.matches()) {
            String id = pm.group(1);
            if (m == NanoHTTPD.Method.GET) {
                JSONObject st = store.getStudio(id);
                return st != null ? json(200, st) : err(404, "not found");
            }
            if (m == NanoHTTPD.Method.PUT) {
                JSONObject patch;
                try {
                    byte[] b = body(s, 25 * 1024 * 1024);
                    if (b == null) return err(413, "conteúdo grande demais");
                    patch = new JSONObject(new String(b, StandardCharsets.UTF_8));
                } catch (Exception e) {
                    return err(400, "corpo inválido");
                }
                int cur = store.conflictFor(id, patch);
                if (cur >= 0) return json(409, new JSONObject().put("error", "O estúdio foi alterado em outra janela").put("rev", cur));
                JSONObject st = store.updateStudio(id, patch);
                if (st == null) return err(404, "not found");
                return json(200, new JSONObject().put("id", st.optString("id")).put("name", st.optString("name")).put("rev", st.optInt("rev", 0)).put("updatedAt", st.optLong("updatedAt")));
            }
            if (m == NanoHTTPD.Method.DELETE) return json(200, ok().put("ok", store.deleteStudio(id)));
        }
        // o estúdio publica a enquete no ar e recebe os votos que chegaram pela página /vote
        pm = Pattern.compile("^/studios/([^/]+)/poll$").matcher(path);
        if (pm.matches() && m == NanoHTTPD.Method.POST) {
            return json(200, new JSONObject().put("votes", polls.sync(pm.group(1), jsonBody(s).opt("poll"))));
        }
        // o estúdio publica a caixa de mensagens e recebe as que chegaram pela página /msg
        pm = Pattern.compile("^/studios/([^/]+)/msgs$").matcher(path);
        if (pm.matches() && m == NanoHTTPD.Method.POST) {
            return json(200, new JSONObject().put("msgs", msgs.sync(pm.group(1), jsonBody(s).opt("box"))));
        }

        // destinos
        if (path.equals("/destinations")) {
            if (m == NanoHTTPD.Method.GET) {
                JSONArray a = store.listDestinations(), out = new JSONArray();
                for (int i = 0; i < a.length(); i++) out.put(maskKey(a.getJSONObject(i)));
                return json(200, out);
            }
            if (m == NanoHTTPD.Method.POST) return json(201, maskKey(store.upsertDestination(jsonBody(s), null)));
        }
        pm = Pattern.compile("^/destinations/([^/]+)$").matcher(path);
        if (pm.matches()) {
            String id = pm.group(1);
            if (m == NanoHTTPD.Method.PUT) {
                JSONObject b = jsonBody(s);
                JSONObject cur = store.getDestination(id);
                if (cur == null) return err(404, "not found");
                Object k = b.opt("key");
                if (k == null || k == JSONObject.NULL || String.valueOf(k).contains("•")) b.put("key", cur.optString("key"));
                return json(200, maskKey(store.upsertDestination(b, id)));
            }
            if (m == NanoHTTPD.Method.DELETE) return json(200, ok().put("ok", store.deleteDestination(id)));
        }

        // gravações
        if (path.equals("/recordings") && m == NanoHTTPD.Method.GET) {
            File dir = recDir();
            dir.mkdirs();
            List<File> l = new ArrayList<>();
            for (File f : scan(dir, false)) if (f.getName().matches("(?i).*\\.(mp4|mkv|webm)$")) l.add(f);
            l.sort((a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            JSONArray out = new JSONArray();
            for (File f : l)
                out.put(new JSONObject().put("name", f.getName()).put("size", f.length()).put("mtime", f.lastModified())
                        .put("url", "/recordings/" + URLEncoder.encode(f.getName(), "UTF-8").replace("+", "%20")));
            return json(200, out);
        }
        if (path.equals("/recordings/open-folder")) {
            jsonBody(s);
            return json(200, ok().put("path", recDir().getAbsolutePath()).put("hint", "Abra o app Arquivos/Galeria: " + recDir().getAbsolutePath()));
        }
        // player de gravações: no Android não há Explorer nem pós-processamento; só devolve o caminho
        if (path.equals("/recordings/prepare") || path.equals("/recordings/reveal") || path.equals("/recordings/open")) {
            jsonBody(s);
            return json(200, ok().put("path", recDir().getAbsolutePath()).put("hint", "Abra o app Arquivos/Galeria: " + recDir().getAbsolutePath()));
        }
        pm = Pattern.compile("^/recordings/([^/]+)$").matcher(path);
        if (pm.matches() && m == NanoHTTPD.Method.DELETE) {
            File f = new File(recDir(), new File(pm.group(1)).getName());
            return f.delete() ? json(200, ok()) : err(404, "arquivo não encontrado");
        }

        // armazenamento e limpeza
        if (path.equals("/storage") && m == NanoHTTPD.Method.GET) {
            List<File> recs = scan(recDir(), true);
            List<File> cache = scan(cacheDir, false);
            long day = 86400000L, now = System.currentTimeMillis();
            JSONObject r = new JSONObject().put("dir", recDir().getAbsolutePath()).put("count", recs.size()).put("bytes", sum(recs));
            for (int d : new int[]{7, 30, 90}) {
                List<File> older = new ArrayList<>();
                for (File f : recs) if (now - f.lastModified() > d * day) older.add(f);
                r.put("older" + d, sum(older)).put("n" + d, older.size());
            }
            return json(200, new JSONObject().put("recordings", r).put("cache", new JSONObject().put("count", cache.size()).put("bytes", sum(cache))));
        }
        if (path.equals("/storage/clean") && m == NanoHTTPD.Method.POST) {
            JSONObject b = jsonBody(s);
            long[] freed = {0};
            int[] removed = {0}, skipped = {0};
            long now = System.currentTimeMillis();
            Object rec = b.opt("recordings");
            boolean all = "all".equals(rec);
            double days = rec instanceof Number ? ((Number) rec).doubleValue() : (rec instanceof String && !all ? parse(rec) : 0);
            List<File> kill = new ArrayList<>();
            if (all || days > 0) for (File f : scan(recDir(), true)) if (now - f.lastModified() >= (all ? 0 : days * 86400000L)) kill.add(f);
            if (b.optBoolean("cache")) kill.addAll(scan(cacheDir, false));
            for (File f : kill) {
                if (now - f.lastModified() < BUSY_MS) {
                    skipped[0]++;
                    continue;
                }
                long len = f.length();
                if (f.delete()) {
                    freed[0] += len;
                    removed[0]++;
                } else skipped[0]++;
            }
            return json(200, ok().put("freed", freed[0]).put("removed", removed[0]).put("skipped", skipped[0]));
        }

        // proxy de imagens e notícias
        if (path.equals("/img-proxy")) {
            try {
                Net.Fetched f = Net.fetchPublic(param(s, "u"), 3 * 1024 * 1024, Pattern.compile("(?i)^image/"), "não é imagem");
                NanoHTTPD.Response r = NanoHTTPD.newFixedLengthResponse(status(200), f.type, new ByteArrayInputStream(f.body), f.body.length);
                r.addHeader("Cache-Control", "public, max-age=3600");
                r.addHeader("X-Content-Type-Options", "nosniff");
                r.addHeader("Content-Security-Policy", "default-src 'none'; sandbox");
                return r;
            } catch (Exception e) {
                return err(400, e.getMessage());
            }
        }
        if (path.equals("/rss")) {
            try {
                return json(200, Net.loadFeed(param(s, "u")));
            } catch (Exception e) {
                return err(400, e.getMessage());
            }
        }
        if (path.equals("/media/convert") && m == NanoHTTPD.Method.POST) {
            body(s, 0); // descarta o envio
            return err(501, "a conversão de áudio (AC3/DTS/HEVC) não está disponível no Android; use arquivos MP4 com áudio AAC");
        }
        return err(404, "not found");
    }

    private static double parse(Object o) {
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (Exception e) {
            return 0;
        }
    }

    @SuppressWarnings("deprecation")
    static String param(NanoHTTPD.IHTTPSession s, String k) {
        String v = s.getParms().get(k);
        return v == null ? "" : v;
    }

    private NanoHTTPD.Response uvcHttp(NanoHTTPD.IHTTPSession s) throws IOException, NanoHTTPD.ResponseException {
        String uri = s.getUri();
        if (uri.equals("/uvc/devices")) return json(200, uvc.deviceList());
        if (uri.equals("/uvc/diag")) return json(200, uvc.diagnostics());
        if (uri.equals("/uvc/status")) return json(200, uvc.status());
        if (uri.equals("/uvc/close")) { uvc.closeCamera(); return json(200, uvc.status()); }
        if (uri.equals("/uvc/dismiss")) { uvc.dismissOffer(); return json(200, uvc.status()); }
        if (uri.equals("/uvc/open")) {
            Map<String, String> p = s.getParms();
            int w = 640, h = 480, fps = 0;
            try { w = Integer.parseInt(p.getOrDefault("w", "640")); } catch (Exception ignored) {}
            try { h = Integer.parseInt(p.getOrDefault("h", "480")); } catch (Exception ignored) {}
            try { fps = Integer.parseInt(p.getOrDefault("fps", "0")); } catch (Exception ignored) {}
            String r = uvc.open(p.getOrDefault("id", ""), w, h, fps);
            Map<String, Object> out = uvc.status();
            out.put("result", r);
            return json(200, out);
        }
        if (uri.equals("/uvc/frame.jpg")) {
            byte[] jpg = uvc.latestJpeg();
            if (jpg == null) return err(503, "Aguardando o primeiro quadro da câmera USB");
            NanoHTTPD.Response fr = NanoHTTPD.newFixedLengthResponse(status(200), "image/jpeg", new java.io.ByteArrayInputStream(jpg), jpg.length);
            fr.addHeader("Cache-Control", "no-store");
            return fr;
        }
        if (uri.equals("/uvc/audio")) {
            NanoHTTPD.Response r = NanoHTTPD.newChunkedResponse(status(200), "application/octet-stream", uvc.audioStream());
            r.addHeader("Cache-Control", "no-store");
            r.addHeader("X-Audio-Rate", String.valueOf(uvc.audioRate()));
            r.addHeader("X-Audio-Channels", String.valueOf(uvc.audioChannels()));
            r.addHeader("X-Audio-Bits", String.valueOf(uvc.audioBits()));
            return r;
        }
        if (uri.equals("/uvc/stream")) {
            NanoHTTPD.Response r = NanoHTTPD.newChunkedResponse(status(200), "multipart/x-mixed-replace; boundary=frame", uvc.mjpegStream());
            r.addHeader("Cache-Control", "no-store");
            r.addHeader("Pragma", "no-cache");
            r.addHeader("Connection", "close");
            return r;
        }
        return err(404, "UVC desconhecido");
    }

    private NanoHTTPD.Response route(NanoHTTPD.IHTTPSession s) {
        String uri = s.getUri();
        NanoHTTPD.Method m = s.getMethod();
        try {
            if (uri.startsWith("/api/")) return api(s, uri.substring(4), m);
            boolean local = isLocal(s);
            if (uri.startsWith("/uvc/")) {
                if (!local) return err(403, "Câmera USB disponível apenas no aparelho do estúdio.");
                return uvcHttp(s);
            }
            if (uri.equals("/") || uri.equals("/index.html")) return local ? page("index.html", true) : err(403, "Disponível apenas no aparelho do estúdio.");
            if (uri.matches("^/studio/[^/]+/?$")) return local ? page("studio.html", true) : err(403, "Disponível apenas no aparelho do estúdio.");
            if (uri.matches("^/join/[^/]+/?$")) return page("join.html", false);
            if (uri.matches("^/cam/[^/]+/?$")) return page("cam.html", false); // câmera remota (celular pelo QR)
            if (uri.matches("^/vote/[^/]+/?$")) return page("vote.html", false);
            if (uri.matches("^/msg/[^/]+/?$")) return page("msg.html", false); // mensagens do público (QR Code)
            if (uri.matches("^/out/[^/]+/?$")) return page("out.html", false); // saídas para OBS/vMix (chave conferida na sinalização)
            if (uri.matches("(?i)^/(index|studio)(\\.html)?/?$")) return local ? page(uri.toLowerCase(Locale.ROOT).contains("studio") ? "studio.html" : "index.html", true) : err(403, "Disponível apenas no aparelho do estúdio.");
            if (uri.startsWith("/recordings/")) {
                if (!local) return err(403, "Disponível apenas no aparelho do estúdio.");
                return file(new File(recDir(), new File(uri.substring(12)).getName()), s);
            }
            if (uri.startsWith("/media-cache/")) {
                if (!local) return err(403, "Disponível apenas no aparelho do estúdio.");
                return file(new File(cacheDir, new File(uri.substring(13)).getName()), s);
            }
            NanoHTTPD.Response r = staticAsset(uri);
            return r != null ? r : NanoHTTPD.newFixedLengthResponse(status(404), "text/plain", "Cannot GET " + uri);
        } catch (Exception e) {
            Log.e(TAG, "route " + uri, e);
            return err(500, String.valueOf(e.getMessage()));
        }
    }

    // ---------- WebSockets ----------
    class Socket extends NanoWSD.WebSocket implements SignalingHub.Peer, IngestManager.Conn {
        final boolean ingestMode, local;
        SignalingHub.Client client;
        IngestManager.Session session;
        final ExecutorService out = Executors.newSingleThreadExecutor();
        volatile boolean closed;

        Socket(NanoHTTPD.IHTTPSession hs, boolean ingestMode, boolean local) {
            super(hs);
            this.ingestMode = ingestMode;
            this.local = local;
            if (ingestMode) session = ingest.open(this);
            else client = hub.connect(this, local);
        }

        @Override
        protected void onOpen() {
        }

        @Override
        protected void onClose(NanoWSD.WebSocketFrame.CloseCode code, String reason, boolean remote) {
            Log.i(TAG, "ws close id=" + (client != null ? client.id : "-") + " code=" + code + " reason=" + reason + " remote=" + remote + " local=" + local);
            closed = true;
            if (client != null) hub.leave(client);
            if (session != null) session.onClose();
            out.shutdown();
        }

        @Override
        protected void onMessage(NanoWSD.WebSocketFrame f) {
            if (f.getOpCode() == NanoWSD.WebSocketFrame.OpCode.Binary) {
                if (session != null) session.onBinary(f.getBinaryPayload());
            } else if (f.getOpCode() == NanoWSD.WebSocketFrame.OpCode.Text) {
                String t = f.getTextPayload();
                if (client != null) hub.onText(client, t);
                else if (session != null) session.onText(t);
            }
        }

        @Override
        protected void onPong(NanoWSD.WebSocketFrame pong) {
            if (client != null) hub.pong(client);
        }

        @Override
        protected void onException(IOException e) {
            Log.w(TAG, "ws exception id=" + (client != null ? client.id : "-") + " " + e);
        }

        // envio assíncrono: nunca trava o hub por causa de um convidado lento
        @Override
        public void sendText(String s) {
            if (closed) return;
            try {
                out.execute(() -> {
                    try {
                        if (isOpen()) send(s);
                    } catch (Exception ignored) {
                    }
                });
            } catch (Exception ignored) {
            }
        }

        @Override
        public void ping() {
            if (closed) return;
            try {
                out.execute(() -> {
                    try {
                        if (isOpen()) Socket.this.ping(new byte[]{1});
                    } catch (Exception ignored) {
                    }
                });
            } catch (Exception ignored) {
            }
        }

        @Override
        public void close() {
            close(1000, "ended");
        }

        /** fecha com código próprio (4001 removido, 4003 só local...), que o front-end interpreta */
        @Override
        public void close(int code, String reason) {
            if (closed) return;
            try {
                out.execute(() -> {
                    try {
                        byte[] r = reason.getBytes(StandardCharsets.UTF_8);
                        byte[] p = new byte[2 + r.length];
                        p[0] = (byte) (code >> 8);
                        p[1] = (byte) code;
                        System.arraycopy(r, 0, p, 2, r.length);
                        sendFrame(new NanoWSD.WebSocketFrame(NanoWSD.WebSocketFrame.OpCode.Close, true, p));
                    } catch (Exception ignored) {
                    }
                    try {
                        Thread.sleep(300);
                        if (isOpen()) close(NanoWSD.WebSocketFrame.CloseCode.NormalClosure, reason, false);
                    } catch (Exception ignored) {
                    }
                });
            } catch (Exception ignored) {
            }
        }
    }

    class Http extends NanoWSD {
        Http(String host, int port) {
            super(host, port);
        }

        @Override
        public Response serve(IHTTPSession s) {
            String up = s.getHeaders().get("upgrade");
            if (up != null && up.equalsIgnoreCase("websocket")) {
                String p = s.getUri();
                boolean local = isLocal(s);
                if (p.equals("/ws") || (p.equals("/ingest") && local)) return withoutContentLength(super.serve(s));
                return err(403, "forbidden");
            }
            return route(s);
        }

        /** O 101 do NanoHTTPD traz "Content-Length: 0"; proxies estritos (Cloudflare) cancelam o WebSocket por isso. */
        private Response withoutContentLength(final Response inner) {
            if (inner == null || inner.getStatus() != Response.Status.SWITCH_PROTOCOL) return inner;
            return new Response(inner.getStatus(), inner.getMimeType(), (InputStream) null, 0) {
                @Override
                protected void send(final java.io.OutputStream out) {
                    java.io.OutputStream filter = new java.io.OutputStream() {
                        final ByteArrayOutputStream head = new ByteArrayOutputStream();
                        boolean done;

                        @Override
                        public void write(int b) throws IOException {
                            write(new byte[]{(byte) b}, 0, 1);
                        }

                        @Override
                        public void write(byte[] b, int off, int len) throws IOException {
                            if (done) {
                                out.write(b, off, len);
                                return;
                            }
                            head.write(b, off, len);
                            byte[] all = head.toByteArray();
                            for (int i = 3; i < all.length; i++) {
                                if (all[i - 3] == '\r' && all[i - 2] == '\n' && all[i - 1] == '\r' && all[i] == '\n') {
                                    String h = new String(all, 0, i + 1, StandardCharsets.ISO_8859_1).replaceAll("(?i)content-length:\\s*0\r\n", "");
                                    out.write(h.getBytes(StandardCharsets.ISO_8859_1));
                                    out.write(all, i + 1, all.length - i - 1);
                                    done = true;
                                    return;
                                }
                            }
                        }

                        @Override
                        public void flush() throws IOException {
                            if (done) out.flush();
                        }
                    };
                    try {
                        Class<?> c = inner.getClass();
                        java.lang.reflect.Method m = null;
                        while (c != null && m == null) {
                            try {
                                m = c.getDeclaredMethod("send", java.io.OutputStream.class);
                            } catch (NoSuchMethodException e) {
                                c = c.getSuperclass();
                            }
                        }
                        if (m == null) throw new NoSuchMethodException("send");
                        m.setAccessible(true);
                        m.invoke(inner, filter);
                    } catch (Exception e) {
                        Log.w(TAG, "ws handshake", e);
                    }
                }
            };
        }

        @Override
        protected WebSocket openWebSocket(IHTTPSession hs) {
            boolean local = isLocal(hs);
            return new Socket(hs, hs.getUri().equals("/ingest") && local, local);
        }
    }
}
