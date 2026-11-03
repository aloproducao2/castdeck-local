// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Cliente RTMP/RTMPS de publicação (sem dependências): handshake simples, connect/createStream/publish,
 * onMetaData, H.264 (AVC) + AAC em tags FLV. Compatível com YouTube, Twitch, Facebook/Instagram (rtmps).
 */
public class RtmpPublisher {
    private static final int OUT_CHUNK = 4096;
    private Socket socket;
    private OutputStream out;
    private DataInputStream in;
    private final Object writeLock = new Object();
    private int inChunk = 128;
    private long inBytes, lastAck, ackWindow = 2_500_000;
    private int streamId = 1;
    private String streamKey;
    private volatile boolean closed;
    private volatile String fatal;
    private Thread reader;
    public long bytesOut;

    // ---------- conexão ----------
    public void connect(String url, int timeoutMs) throws IOException {
        URI u;
        try {
            u = new URI(url.replace(" ", "%20"));
        } catch (Exception e) {
            throw new IOException("URL RTMP inválida");
        }
        String scheme = String.valueOf(u.getScheme()).toLowerCase();
        boolean tls = scheme.equals("rtmps");
        if (!tls && !scheme.equals("rtmp")) throw new IOException("Só rtmp:// e rtmps:// são suportados no Android");
        String host = u.getHost();
        if (host == null) throw new IOException("URL RTMP sem servidor");
        int port = u.getPort() > 0 ? u.getPort() : (tls ? 443 : 1935);
        // app = 1º segmento do caminho; o resto (inclusive ?query) é a chave
        String raw = url.substring(url.indexOf("//") + 2);
        int slash = raw.indexOf('/');
        String path = slash >= 0 ? raw.substring(slash + 1) : "";
        int s2 = path.indexOf('/');
        String app = s2 >= 0 ? path.substring(0, s2) : path;
        streamKey = s2 >= 0 ? path.substring(s2 + 1) : "";
        if (app.isEmpty() || streamKey.isEmpty()) throw new IOException("URL RTMP precisa de aplicativo e chave (rtmp://servidor/app/chave)");
        String tcUrl = scheme + "://" + host + (u.getPort() > 0 ? ":" + port : "") + "/" + app;

        Socket s = new Socket();
        s.setTcpNoDelay(true);
        s.setSendBufferSize(512 * 1024);
        s.connect(new InetSocketAddress(host, port), timeoutMs);
        if (tls) {
            SSLSocket ssl = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(s, host, port, true);
            ssl.setSoTimeout(timeoutMs);
            ssl.startHandshake();
            s = ssl;
        }
        s.setSoTimeout(timeoutMs);
        socket = s;
        out = new BufferedOutputStream(s.getOutputStream(), 64 * 1024);
        in = new DataInputStream(new BufferedInputStream(s.getInputStream(), 64 * 1024));
        handshake();

        // chunk size de saída
        sendMessage(2, 1, 0, 0, u32(OUT_CHUNK));
        Amf a = new Amf().str("connect").num(1).obj(map(
                "app", app, "type", "nonprivate", "flashVer", "FMLE/3.0 (compatible; CastDeck)", "swfUrl", tcUrl, "tcUrl", tcUrl));
        sendMessage(3, 20, 0, 0, a.bytes());
        awaitResult(1, timeoutMs);
        sendMessage(3, 20, 0, 0, new Amf().str("releaseStream").num(2).nul().str(streamKey).bytes());
        sendMessage(3, 20, 0, 0, new Amf().str("FCPublish").num(3).nul().str(streamKey).bytes());
        sendMessage(3, 20, 0, 0, new Amf().str("createStream").num(4).nul().bytes());
        List<Object> res = awaitResult(4, timeoutMs);
        if (res.size() > 3 && res.get(3) instanceof Double) streamId = ((Double) res.get(3)).intValue();
        sendMessage(5, 20, streamId, 0, new Amf().str("publish").num(5).nul().str(streamKey).str("live").bytes());
        awaitPublishStart(timeoutMs);
        s.setSoTimeout(0);
        reader = new Thread(this::readLoop, "rtmp-reader");
        reader.setDaemon(true);
        reader.start();
    }

    private void handshake() throws IOException {
        byte[] c1 = new byte[1536];
        new Random().nextBytes(c1);
        int t = (int) (System.currentTimeMillis() / 1000);
        c1[0] = (byte) (t >> 24);
        c1[1] = (byte) (t >> 16);
        c1[2] = (byte) (t >> 8);
        c1[3] = (byte) t;
        c1[4] = c1[5] = c1[6] = c1[7] = 0;
        out.write(3);
        out.write(c1);
        out.flush();
        int v = in.read();
        if (v < 0) throw new EOFException("servidor RTMP fechou a conexão");
        byte[] s1 = new byte[1536];
        in.readFully(s1);
        out.write(s1); // C2 = eco do S1
        out.flush();
        byte[] s2 = new byte[1536];
        in.readFully(s2);
    }

    // ---------- leitura de mensagens ----------
    private static class ChunkState {
        int ts, len, type, sid;
        boolean ext;
        ByteArrayOutputStream body;
    }

    private final Map<Integer, ChunkState> chunks = new HashMap<>();

    private static class Msg {
        int type, sid;
        byte[] body;
    }

    private int rd() throws IOException {
        int b = in.read();
        if (b < 0) throw new EOFException("conexão RTMP encerrada");
        inBytes++;
        return b;
    }

    private int rdN(int n) throws IOException {
        int v = 0;
        for (int i = 0; i < n; i++) v = (v << 8) | rd();
        return v;
    }

    private Msg readMessage() throws IOException {
        while (true) {
            int b0 = rd();
            int fmt = b0 >> 6;
            int csid = b0 & 0x3f;
            if (csid == 0) csid = 64 + rd();
            else if (csid == 1) csid = 64 + rd() + rd() * 256;
            ChunkState st = chunks.get(csid);
            if (st == null) {
                st = new ChunkState();
                chunks.put(csid, st);
            }
            if (fmt <= 2) {
                int ts = rdN(3);
                if (fmt <= 1) {
                    st.len = rdN(3);
                    st.type = rd();
                    if (fmt == 0) {
                        st.sid = rd() | (rd() << 8) | (rd() << 16) | (rd() << 24);
                    }
                }
                st.ext = ts == 0xffffff;
                if (st.ext) ts = rdN(4);
                st.ts = ts;
            } else if (st.ext) {
                rdN(4);
            }
            if (st.body == null) st.body = new ByteArrayOutputStream(Math.max(16, st.len));
            int remaining = st.len - st.body.size();
            int n = Math.min(remaining, inChunk);
            byte[] tmp = new byte[n];
            in.readFully(tmp);
            inBytes += n;
            st.body.write(tmp, 0, n);
            maybeAck();
            if (st.body.size() >= st.len) {
                Msg m = new Msg();
                m.type = st.type;
                m.sid = st.sid;
                m.body = st.body.toByteArray();
                st.body = null;
                if (handleControl(m)) continue;
                return m;
            }
        }
    }

    private void maybeAck() throws IOException {
        if (inBytes - lastAck >= ackWindow / 2) {
            lastAck = inBytes;
            sendMessage(2, 3, 0, 0, u32((int) inBytes));
        }
    }

    /** trata mensagens de controle; true = consumida */
    private boolean handleControl(Msg m) throws IOException {
        byte[] b = m.body;
        switch (m.type) {
            case 1: // set chunk size
                inChunk = Math.max(1, ((b[0] & 0x7f) << 24) | ((b[1] & 0xff) << 16) | ((b[2] & 0xff) << 8) | (b[3] & 0xff));
                return true;
            case 5: // window ack size
                ackWindow = Math.max(4096, ((b[0] & 0xffL) << 24) | ((b[1] & 0xff) << 16) | ((b[2] & 0xff) << 8) | (b[3] & 0xff));
                return true;
            case 6: // set peer bandwidth -> responde com window ack size
                sendMessage(2, 5, 0, 0, u32(2_500_000));
                return true;
            case 4: // user control
                if (b.length >= 6 && b[1] == 6) { // ping request -> pong
                    byte[] pong = new byte[6];
                    pong[1] = 7;
                    System.arraycopy(b, 2, pong, 2, 4);
                    sendMessage(2, 4, 0, 0, pong);
                }
                return true;
            case 3: // ack
                return true;
        }
        return false;
    }

    private List<Object> awaitResult(int txn, int timeoutMs) throws IOException {
        long until = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < until) {
            Msg m = readMessage();
            if (m.type != 20 && m.type != 17) continue;
            List<Object> v = Amf.decodeAll(m.type == 17 ? java.util.Arrays.copyOfRange(m.body, 1, m.body.length) : m.body);
            if (v.isEmpty()) continue;
            String name = String.valueOf(v.get(0));
            double id = v.size() > 1 && v.get(1) instanceof Double ? (Double) v.get(1) : -1;
            if (name.equals("_result") && id == txn) return v;
            if (name.equals("_error") && id == txn) throw new IOException("Servidor recusou: " + describe(v));
            if (name.equals("onStatus") && describe(v).toLowerCase().contains("error")) throw new IOException(describe(v));
        }
        throw new IOException("Tempo esgotado esperando o servidor RTMP");
    }

    private void awaitPublishStart(int timeoutMs) throws IOException {
        long until = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < until) {
            Msg m = readMessage();
            if (m.type != 20 && m.type != 17) continue;
            List<Object> v = Amf.decodeAll(m.type == 17 ? java.util.Arrays.copyOfRange(m.body, 1, m.body.length) : m.body);
            if (v.isEmpty()) continue;
            String name = String.valueOf(v.get(0));
            String code = describe(v);
            if (name.equals("onStatus")) {
                if (code.contains("Publish.Start")) return;
                if (code.contains("Error") || code.contains("BadName") || code.contains("Failed") || code.contains("Rejected"))
                    throw new IOException("Publicação recusada: " + code);
            }
            if (name.equals("_error")) throw new IOException("Publicação recusada: " + code);
        }
        throw new IOException("Servidor não confirmou a publicação (chave inválida?)");
    }

    private static String describe(List<Object> v) {
        for (Object o : v) {
            if (o instanceof Map) {
                Object code = ((Map<?, ?>) o).get("code");
                Object desc = ((Map<?, ?>) o).get("description");
                if (code != null) return code + (desc != null ? " — " + desc : "");
            }
        }
        return v.toString();
    }

    private void readLoop() {
        try {
            while (!closed) {
                Msg m = readMessage();
                if (m.type == 20 || m.type == 17) {
                    List<Object> v = Amf.decodeAll(m.type == 17 ? java.util.Arrays.copyOfRange(m.body, 1, m.body.length) : m.body);
                    String code = describe(v);
                    if (!v.isEmpty() && "onStatus".equals(v.get(0)) && (code.contains("Error") || code.contains("Failed") || code.contains("UnpublishNotify")))
                        fatal = code;
                }
            }
        } catch (IOException e) {
            if (!closed) fatal = e.getMessage();
        }
    }

    public String fatalError() {
        return fatal;
    }

    static class FastByteArrayOutputStream extends ByteArrayOutputStream {
        FastByteArrayOutputStream(int size) {
            super(size);
        }

        byte[] getBuf() {
            return buf;
        }
    }

    private final FastByteArrayOutputStream videoBuf = new FastByteArrayOutputStream(128 * 1024);

    // ---------- envio ----------
    private void sendMessage(int csid, int type, int sid, long tsMs, byte[] body) throws IOException {
        sendMessage(csid, type, sid, tsMs, body, 0, body.length);
    }

    private void sendMessage(int csid, int type, int sid, long tsMs, byte[] body, int off, int len) throws IOException {
        synchronized (writeLock) {
            int ts = (int) (tsMs & 0xffffffffL);
            boolean ext = tsMs >= 0xffffff;
            int pos = off;
            int end = off + len;
            boolean first = true;
            do {
                if (first) {
                    out.write(csid & 0x3f);
                    int t3 = ext ? 0xffffff : ts;
                    out.write(t3 >> 16);
                    out.write(t3 >> 8);
                    out.write(t3);
                    out.write(len >> 16);
                    out.write(len >> 8);
                    out.write(len);
                    out.write(type);
                    out.write(sid);
                    out.write(sid >> 8);
                    out.write(sid >> 16);
                    out.write(sid >> 24);
                    first = false;
                } else {
                    out.write(0xC0 | (csid & 0x3f));
                }
                if (ext) {
                    out.write(ts >> 24);
                    out.write(ts >> 16);
                    out.write(ts >> 8);
                    out.write(ts);
                }
                int n = Math.min(OUT_CHUNK, end - pos);
                out.write(body, pos, n);
                pos += n;
            } while (pos < end);
            out.flush();
            bytesOut += len;
        }
    }

    public void sendMetadata(int w, int h, int fps, int vkbps, int akbps, int rate, int channels) throws IOException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("width", (double) w);
        m.put("height", (double) h);
        m.put("videodatarate", (double) vkbps);
        m.put("framerate", (double) fps);
        m.put("videocodecid", 7.0);
        m.put("audiodatarate", (double) akbps);
        m.put("audiosamplerate", (double) rate);
        m.put("audiosamplesize", 16.0);
        m.put("stereo", channels > 1);
        m.put("audiocodecid", 10.0);
        m.put("encoder", "CastDeck Android");
        sendMessage(5, 18, streamId, 0, new Amf().str("@setDataFrame").str("onMetaData").ecma(m).bytes());
    }

    public void sendVideoConfig(byte[] sps, byte[] pps) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        b.write(new byte[]{0x17, 0, 0, 0, 0}, 0, 5);
        b.write(1);
        b.write(sps[1]);
        b.write(sps[2]);
        b.write(sps[3]);
        b.write(0xff);
        b.write(0xe1);
        b.write(sps.length >> 8);
        b.write(sps.length);
        b.write(sps, 0, sps.length);
        b.write(1);
        b.write(pps.length >> 8);
        b.write(pps.length);
        b.write(pps, 0, pps.length);
        sendMessage(6, 9, streamId, 0, b.toByteArray());
    }

    public void sendAudioConfig(byte[] asc) throws IOException {
        byte[] b = new byte[2 + asc.length];
        b[0] = (byte) 0xAF;
        b[1] = 0;
        System.arraycopy(asc, 0, b, 2, asc.length);
        sendMessage(4, 8, streamId, 0, b);
    }

    /** dados em Annex-B (como saem do MediaCodec) -> AVCC em tag FLV (buffer reutilizado sem alocação por quadro) */
    public synchronized void sendVideo(byte[] annexB, long tsMs, boolean key) throws IOException {
        videoBuf.reset();
        videoBuf.write(key ? 0x17 : 0x27);
        videoBuf.write(1);
        videoBuf.write(0);
        videoBuf.write(0);
        videoBuf.write(0);
        for (int[] nal : H264.nals(annexB)) {
            int type = annexB[nal[0]] & 0x1f;
            if (type == 7 || type == 8 || type == 9) continue; // SPS/PPS vão no cabeçalho; AUD é dispensável
            int len = nal[1];
            videoBuf.write(len >>> 24);
            videoBuf.write(len >> 16);
            videoBuf.write(len >> 8);
            videoBuf.write(len);
            videoBuf.write(annexB, nal[0], len);
        }
        int total = videoBuf.size();
        if (total <= 5) return;
        sendMessage(6, 9, streamId, tsMs, videoBuf.getBuf(), 0, total);
    }

    public void sendAudio(byte[] aac, long tsMs) throws IOException {
        byte[] b = new byte[2 + aac.length];
        b[0] = (byte) 0xAF;
        b[1] = 1;
        System.arraycopy(aac, 0, b, 2, aac.length);
        sendMessage(4, 8, streamId, tsMs, b);
    }

    public void close() {
        closed = true;
        try {
            if (out != null && streamKey != null) {
                sendMessage(3, 20, 0, 0, new Amf().str("FCUnpublish").num(6).nul().str(streamKey).bytes());
                sendMessage(3, 20, 0, 0, new Amf().str("deleteStream").num(7).nul().num(streamId).bytes());
            }
        } catch (Exception ignored) {
        }
        try {
            if (socket != null) socket.close();
        } catch (Exception ignored) {
        }
    }

    // ---------- util ----------
    private static byte[] u32(int v) {
        return new byte[]{(byte) (v >>> 24), (byte) (v >> 16), (byte) (v >> 8), (byte) v};
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    /** AMF0 mínimo (encoder + decoder). */
    static class Amf {
        private final ByteArrayOutputStream b = new ByteArrayOutputStream();

        Amf num(double v) {
            b.write(0);
            long l = Double.doubleToLongBits(v);
            for (int i = 7; i >= 0; i--) b.write((int) (l >> (i * 8)));
            return this;
        }

        Amf bool(boolean v) {
            b.write(1);
            b.write(v ? 1 : 0);
            return this;
        }

        private void rawStr(String s) {
            byte[] d = s.getBytes(StandardCharsets.UTF_8);
            b.write(d.length >> 8);
            b.write(d.length);
            b.write(d, 0, d.length);
        }

        Amf str(String s) {
            b.write(2);
            rawStr(s);
            return this;
        }

        Amf nul() {
            b.write(5);
            return this;
        }

        private void value(Object v) {
            if (v instanceof Double) num((Double) v);
            else if (v instanceof Number) num(((Number) v).doubleValue());
            else if (v instanceof Boolean) bool((Boolean) v);
            else if (v == null) nul();
            else str(String.valueOf(v));
        }

        Amf obj(Map<String, Object> m) {
            b.write(3);
            for (Map.Entry<String, Object> e : m.entrySet()) {
                rawStr(e.getKey());
                value(e.getValue());
            }
            b.write(0);
            b.write(0);
            b.write(9);
            return this;
        }

        Amf ecma(Map<String, Object> m) {
            b.write(8);
            int n = m.size();
            b.write(n >>> 24);
            b.write(n >> 16);
            b.write(n >> 8);
            b.write(n);
            for (Map.Entry<String, Object> e : m.entrySet()) {
                rawStr(e.getKey());
                value(e.getValue());
            }
            b.write(0);
            b.write(0);
            b.write(9);
            return this;
        }

        byte[] bytes() {
            return b.toByteArray();
        }

        static List<Object> decodeAll(byte[] d) {
            List<Object> out = new ArrayList<>();
            int[] p = {0};
            try {
                while (p[0] < d.length) out.add(read(d, p));
            } catch (Exception ignored) {
            }
            return out;
        }

        private static int u16(byte[] d, int[] p) {
            int v = ((d[p[0]] & 0xff) << 8) | (d[p[0] + 1] & 0xff);
            p[0] += 2;
            return v;
        }

        private static String s16(byte[] d, int[] p) {
            int n = u16(d, p);
            String s = new String(d, p[0], n, StandardCharsets.UTF_8);
            p[0] += n;
            return s;
        }

        private static Map<String, Object> props(byte[] d, int[] p) {
            Map<String, Object> m = new LinkedHashMap<>();
            while (p[0] + 3 <= d.length) {
                if (d[p[0]] == 0 && d[p[0] + 1] == 0 && d[p[0] + 2] == 9) {
                    p[0] += 3;
                    break;
                }
                String k = s16(d, p);
                m.put(k, read(d, p));
            }
            return m;
        }

        private static Object read(byte[] d, int[] p) {
            int t = d[p[0]++] & 0xff;
            switch (t) {
                case 0: {
                    long l = 0;
                    for (int i = 0; i < 8; i++) l = (l << 8) | (d[p[0]++] & 0xff);
                    return Double.longBitsToDouble(l);
                }
                case 1:
                    return d[p[0]++] != 0;
                case 2:
                    return s16(d, p);
                case 3:
                    return props(d, p);
                case 5:
                case 6:
                    return null;
                case 8:
                    p[0] += 4;
                    return props(d, p);
                case 10: {
                    int n = ((d[p[0]] & 0xff) << 24) | ((d[p[0] + 1] & 0xff) << 16) | ((d[p[0] + 2] & 0xff) << 8) | (d[p[0] + 3] & 0xff);
                    p[0] += 4;
                    List<Object> l = new ArrayList<>();
                    for (int i = 0; i < n; i++) l.add(read(d, p));
                    return l;
                }
                case 11:
                    p[0] += 10;
                    return null;
                case 12: {
                    int n = ((d[p[0]] & 0xff) << 24) | ((d[p[0] + 1] & 0xff) << 16) | ((d[p[0] + 2] & 0xff) << 8) | (d[p[0] + 3] & 0xff);
                    p[0] += 4;
                    String s = new String(d, p[0], n, StandardCharsets.UTF_8);
                    p[0] += n;
                    return s;
                }
                default:
                    throw new IllegalStateException("AMF tipo " + t);
            }
        }
    }
}
