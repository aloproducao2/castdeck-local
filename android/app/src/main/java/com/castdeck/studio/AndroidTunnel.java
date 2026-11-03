// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.content.Context;
import android.util.Log;

import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.UserInfo;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Porta de server/tunnel.js: link público para convidados, sem conta e sem abrir portas no roteador.
 *  - cloudflare:   cloudflared embutido no APK (libcloudflared.so). O resolvedor DNS do Go não funciona no
 *                  Android (não há /etc/resolv.conf), então a criação do quick tunnel e a resolução dos
 *                  servidores de borda são feitas aqui em Java e o binário só mantém a conexão.
 *  - localhostrun: SSH puro em Java (JSch), equivalente a "ssh -R 80:127.0.0.1:3000 nokey@localhost.run".
 * Em "auto" começa pelo Cloudflare e troca para o outro se falhar. Só o tráfego de convidados atravessa
 * o túnel; painel, estúdio e ingest continuam restritos ao próprio aparelho (LocalServer.isLocal).
 */
public class AndroidTunnel {
    private static final String TAG = "CastDeck.Tunnel";
    static final Pattern CF_RE = Pattern.compile("https://[a-z0-9-]+\\.trycloudflare\\.com", Pattern.CASE_INSENSITIVE);
    static final Pattern LHR_RE = Pattern.compile("https://[a-z0-9-]+\\.lhr\\.life", Pattern.CASE_INSENSITIVE);
    static final long STARTUP_TIMEOUT = 60000, HEALTH_EVERY = 45000;
    static final String CF_UA = "cloudflared/2026.10.0";

    private final Context ctx;
    private final Supplier<String> getProvider;
    private final int port;

    private String status = "off", url, error, provider;
    private boolean wanted;
    private int idx, attempts, gen;
    private long cfBlockedUntil;
    private Process proc;
    private Session ssh;

    public AndroidTunnel(Context ctx, Supplier<String> getProvider, int port) {
        this.ctx = ctx.getApplicationContext();
        this.getProvider = getProvider;
        this.port = port;
    }

    static String label(String p) {
        if ("cloudflare".equals(p)) return "Cloudflare";
        if ("localhostrun".equals(p)) return "localhost.run (SSH)";
        return null;
    }

    public synchronized JSONObject info() {
        try {
            return new JSONObject().put("status", status).put("url", url == null ? JSONObject.NULL : url)
                    .put("error", error == null ? JSONObject.NULL : error)
                    .put("provider", provider == null ? JSONObject.NULL : provider)
                    .put("providerLabel", provider == null ? JSONObject.NULL : label(provider))
                    .put("download", JSONObject.NULL);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private synchronized String[] order() {
        String p = getProvider.get();
        if (System.currentTimeMillis() < cfBlockedUntil) return new String[]{"localhostrun", "cloudflare"};
        if ("cloudflare".equals(p) || "localhostrun".equals(p)) return new String[]{p};
        return new String[]{"cloudflare", "localhostrun"};
    }

    private synchronized boolean alive(int g) {
        return wanted && gen == g;
    }

    private synchronized void set(int g, String st, String u, String err) {
        if (g != gen) return;
        status = st;
        url = u;
        error = err;
    }

    public synchronized void start() {
        if (wanted && (status.equals("starting") || status.equals("on"))) return;
        wanted = true;
        launch(0);
    }

    public synchronized void stop() {
        wanted = false;
        gen++;
        kill();
        status = "off";
        url = null;
        error = null;
    }

    public synchronized void restart() {
        stop();
        idx = 0;
        attempts = 0;
        wanted = true;
        launch(300);
    }

    private synchronized void kill() {
        if (proc != null) proc.destroy();
        proc = null;
        if (ssh != null) {
            Session s = ssh;
            new Thread(s::disconnect).start();
        }
        ssh = null;
    }

    private synchronized void launch(long delay) {
        final int g = ++gen;
        kill();
        String[] o = order();
        final String p = o[Math.floorMod(idx, o.length)];
        provider = p;
        status = "starting";
        url = null;
        Thread t = new Thread(() -> {
            try {
                if (delay > 0) Thread.sleep(delay);
            } catch (InterruptedException ignored) {
            }
            synchronized (this) {
                if (gen != g || !wanted) return;
                status = "starting";
                error = null;
            }
            boolean wasOn = false;
            try {
                wasOn = "cloudflare".equals(p) ? runCloudflare(g) : runLocalhostRun(g);
            } catch (RateLimited e) {
                synchronized (this) {
                    cfBlockedUntil = System.currentTimeMillis() + 10 * 60000;
                    idx = -1; // failover() avança para localhost.run
                    attempts = 0;
                }
                set(g, "error", null, "O Cloudflare limitou links temporários desta rede (muitos pedidos). Trocando automaticamente para localhost.run…");
                failover(g, false);
                return;
            } catch (Exception e) {
                Log.w(TAG, p + " falhou", e);
                synchronized (this) {
                    if (gen == g && (error == null || status.equals("on"))) error = label(p) + ": " + msg(e);
                }
            }
            if (!alive(g)) return;
            String err;
            synchronized (this) {
                err = wasOn ? "Túnel caiu. Reconectando…" : (error != null ? error : label(p) + " encerrou.");
            }
            set(g, "error", null, err);
            failover(g, wasOn);
        }, "tunnel-" + p);
        t.setDaemon(true);
        t.start();
    }

    private void failover(int g, boolean wasOn) {
        synchronized (this) {
            if (!alive(g)) return;
            if (!wasOn && order().length > 1) idx++;
            if (attempts++ >= 20) return;
            long delay = Math.min(20000, 2000L * attempts);
            String keepErr = error;
            launch(delay);
            status = "error"; // continua mostrando o motivo até a próxima tentativa começar
            error = keepErr;
        }
    }

    static String msg(Throwable e) {
        String m = e.getMessage();
        return m == null || m.isEmpty() ? e.getClass().getSimpleName() : m;
    }

    static class RateLimited extends Exception {
    }

    // ---------------- Cloudflare ----------------
    private boolean runCloudflare(int g) throws Exception {
        File exe = new File(ctx.getApplicationInfo().nativeLibraryDir, "libcloudflared.so");
        if (!exe.isFile()) throw new Exception("cloudflared não está incluído para o processador deste aparelho.");

        // 1) cria o quick tunnel (o que o cloudflared faria com --url)
        HttpURLConnection c = (HttpURLConnection) new URL("https://api.trycloudflare.com/tunnel").openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", CF_UA);
        c.setRequestProperty("Content-Type", "application/json");
        c.setDoOutput(true);
        c.getOutputStream().close();
        int code = c.getResponseCode();
        if (code == 429) throw new RateLimited();
        if (code != 200) throw new Exception("api.trycloudflare.com respondeu " + code);
        JSONObject res = new JSONObject(readAll(c.getInputStream())).getJSONObject("result");
        String id = res.getString("id");
        String publicUrl = "https://" + res.getString("hostname");
        if (!alive(g)) return false;

        // 2) credenciais do túnel
        File dir = new File(ctx.getFilesDir(), "tunnel");
        dir.mkdirs();
        File cred = new File(dir, "quick-tunnel.json");
        try (OutputStream o = new FileOutputStream(cred)) {
            o.write(new JSONObject().put("AccountTag", res.getString("account_tag")).put("TunnelSecret", res.getString("secret"))
                    .put("TunnelID", id).toString().getBytes(StandardCharsets.UTF_8));
        }

        // 3) servidores de borda resolvidos pelo Android
        List<String> edges = new ArrayList<>();
        for (String host : new String[]{"region1.v2.argotunnel.com", "region2.v2.argotunnel.com"}) {
            int n = 0;
            try {
                for (InetAddress a : InetAddress.getAllByName(host)) {
                    if (a instanceof Inet4Address && n < 2) {
                        edges.add(a.getHostAddress() + ":7844");
                        n++;
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "DNS " + host, e);
            }
        }
        if (edges.isEmpty()) throw new Exception("sem acesso à internet (não foi possível resolver os servidores do Cloudflare).");

        List<String> cmd = new ArrayList<>();
        cmd.add(exe.getAbsolutePath());
        cmd.add("tunnel");
        cmd.add("--no-autoupdate");
        cmd.add("--protocol");
        cmd.add("http2"); // funciona em redes que bloqueiam UDP/QUIC
        for (String e : edges) {
            cmd.add("--edge");
            cmd.add(e);
        }
        cmd.add("--credentials-file");
        cmd.add(cred.getAbsolutePath());
        cmd.add("run");
        cmd.add("--url");
        cmd.add("http://127.0.0.1:" + port);
        cmd.add(id);
        ProcessBuilder pb = new ProcessBuilder(cmd).redirectErrorStream(true).directory(dir);
        pb.environment().put("HOME", dir.getAbsolutePath());
        Process p = pb.start();
        synchronized (this) {
            if (gen != g || !wanted) {
                p.destroy();
                return false;
            }
            proc = p;
        }
        Log.i(TAG, "cloudflared iniciado, " + publicUrl);
        final boolean[] on = {false};
        LinkedList<String> tail = new LinkedList<>();
        watchdog(g, () -> p.destroy());
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            boolean verifying = false;
            while ((line = r.readLine()) != null) {
                tail.add(line);
                Log.i(TAG, "cf: " + line);
                if (tail.size() > 6) tail.removeFirst();
                if (!verifying && line.contains("Registered tunnel connection")) {
                    verifying = true;
                    verifyAsync(g, publicUrl, on, p::destroy);
                }
            }
        }
        p.waitFor();
        synchronized (this) {
            if (proc == p) proc = null;
        }
        if (!on[0] && alive(g)) {
            String last = tail.isEmpty() ? "" : tail.getLast().replaceAll("^\\S+\\s+(ERR|INF|WRN)\\s+", "");
            synchronized (this) {
                if (error == null) error = "Cloudflare encerrou (código " + p.exitValue() + "). " + last;
            }
        }
        return on[0];
    }

    // ---------------- localhost.run ----------------
    private boolean runLocalhostRun(int g) throws Exception {
        JSch jsch = new JSch();
        Session s = jsch.getSession("nokey", "localhost.run", 22);
        s.setConfig("StrictHostKeyChecking", "no");
        s.setConfig("PreferredAuthentications", "none,keyboard-interactive,password");
        s.setUserInfo(new UserInfo() {
            public String getPassphrase() { return null; }
            public String getPassword() { return ""; }
            public boolean promptPassword(String m) { return true; }
            public boolean promptPassphrase(String m) { return false; }
            public boolean promptYesNo(String m) { return true; }
            public void showMessage(String m) { }
        });
        s.setServerAliveInterval(20000);
        s.setServerAliveCountMax(3);
        synchronized (this) {
            if (gen != g) return false;
            ssh = s;
        }
        s.connect(20000);
        s.setPortForwardingR(null, 80, "127.0.0.1", port);
        ChannelShell ch = (ChannelShell) s.openChannel("shell");
        ch.setPty(false);
        InputStream in = ch.getInputStream();
        // o localhost.run só confirma o pedido de shell depois de mandar o banner/QR code:
        // conecta o canal em paralelo e já vai lendo a saída (senão o JSch estoura o tempo)
        Thread opener = new Thread(() -> {
            try {
                ch.connect(0);
            } catch (Exception e) {
                Log.w(TAG, "canal localhost.run", e);
                s.disconnect();
            }
        }, "lhr-channel");
        opener.setDaemon(true);
        opener.start();
        final boolean[] on = {false};
        watchdog(g, s::disconnect);
        StringBuilder buf = new StringBuilder();
        byte[] b = new byte[4096];
        int n;
        boolean verifying = false;
        try {
            while ((n = in.read(b)) > 0) {
                if (verifying) continue;
                buf.append(new String(b, 0, n, StandardCharsets.UTF_8));
                Matcher m = LHR_RE.matcher(buf);
                if (m.find()) {
                    verifying = true;
                    verifyAsync(g, m.group(), on, s::disconnect);
                } else if (buf.length() > 8000) buf.delete(0, buf.length() - 4000);
            }
        } catch (Exception e) {
            if (alive(g) && !on[0]) throw e;
        } finally {
            s.disconnect();
            synchronized (this) {
                if (ssh == s) ssh = null;
            }
        }
        if (!on[0] && alive(g)) {
            synchronized (this) {
                if (error == null) error = "localhost.run encerrou a conexão.";
            }
        }
        return on[0];
    }

    // ---------------- verificação ----------------
    /** derruba se não ficar "on" a tempo */
    private void watchdog(int g, Runnable killer) {
        Thread t = new Thread(() -> {
            try {
                Thread.sleep(STARTUP_TIMEOUT);
            } catch (InterruptedException ignored) {
            }
            boolean kill;
            synchronized (this) {
                kill = gen == g && !status.equals("on");
                if (kill && error == null) error = label(provider) + " não respondeu a tempo.";
            }
            if (kill) killer.run();
        });
        t.setDaemon(true);
        t.start();
    }

    /** só marca "on" depois que o link público responde de fora (evita mostrar link morto) */
    private void verifyAsync(int g, String publicUrl, boolean[] on, Runnable killer) {
        Thread t = new Thread(() -> {
            for (int i = 0; i < 20 && alive(g); i++) {
                if (probe(publicUrl)) {
                    synchronized (this) {
                        if (gen != g) return;
                        attempts = 0;
                        on[0] = true;
                        status = "on";
                        url = publicUrl;
                        error = null;
                    }
                    Log.i(TAG, "link público (" + provider + "): " + publicUrl);
                    health(g, publicUrl, killer);
                    return;
                }
                sleep(3000);
            }
            boolean kill;
            synchronized (this) {
                kill = gen == g && !status.equals("on");
                if (kill) error = label(provider) + ": o link não ficou acessível.";
            }
            if (kill) killer.run();
        }, "tunnel-verify");
        t.setDaemon(true);
        t.start();
    }

    private void health(int g, String publicUrl, Runnable killer) {
        while (alive(g)) {
            sleep(HEALTH_EVERY);
            if (!alive(g)) return;
            boolean ok = false;
            for (int i = 0; i < 3 && !ok; i++) {
                ok = probe(publicUrl);
                if (!ok) sleep(4000);
            }
            if (!ok && alive(g)) {
                killer.run(); // o encerramento dispara a reconexão
                return;
            }
        }
    }

    static boolean probe(String u) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(u + "/api/public/ice").openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setUseCaches(false);
            int code = c.getResponseCode();
            try (InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream()) {
                if (in != null) while (in.read() != -1) ;
            }
            return code == 200;
        } catch (Exception e) {
            return false;
        }
    }

    static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
        }
    }

    static String readAll(InputStream in) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String l;
            while ((l = r.readLine()) != null) sb.append(l).append('\n');
        }
        return sb.toString();
    }
}
