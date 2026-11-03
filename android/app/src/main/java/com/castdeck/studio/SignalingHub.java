// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

/**
 * Porta fiel de server/signaling.js: sinalização WebRTC em estrela (host <-> convidados),
 * chat, estado do estúdio e co-host. Mesmo protocolo JSON, então o front-end é o mesmo do PC.
 */
public class SignalingHub {
    private static final String TAG = "CastDeck.Signal";

    /** Conexão WebSocket abstrata (implementada pelo servidor HTTP). */
    public interface Peer {
        void sendText(String s);

        void close(int code, String reason);

        void ping();
    }

    public static class Client {
        final String id = Store.uuid(8);
        final Peer ws;
        final boolean isLocal;
        String room, role, name = "", key, src = "";
        boolean alive = true, cohost, view, audio;
        JSONObject state = new JSONObject();
        final List<Long> chatTimes = new ArrayList<>(), cmdTimes = new ArrayList<>();

        Client(Peer ws, boolean isLocal) {
            this.ws = ws;
            this.isLocal = isLocal;
        }
    }

    static class Room {
        final String id;
        Client host;
        final Map<String, Client> clients = new LinkedHashMap<>();
        boolean live;
        Object studioState = JSONObject.NULL, cohostState = JSONObject.NULL, remoteState = JSONObject.NULL;
        final Set<String> cohostKeys = new HashSet<>();

        Room(String id) {
            this.id = id;
        }
    }

    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private final Predicate<String> studioExists;
    private final java.util.function.Function<String, String> outKey; // chave dos links de saída (OBS/vMix)
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();

    public SignalingHub(Predicate<String> studioExists, java.util.function.Function<String, String> outKey) {
        this.studioExists = studioExists;
        this.outKey = outKey;
        timer.scheduleWithFixedDelay(this::heartbeat, 15, 15, TimeUnit.SECONDS);
    }

    static String clean(Object s, int n) {
        String v = Store.str(s).replaceAll("[\\u0000-\\u001f]", "").trim();
        return v.length() > n ? v.substring(0, n) : v;
    }

    private static final String[] CAM_CAPS = {
            "zoom", "focusDistance", "exposureCompensation", "exposureTime", "iso",
            "brightness", "contrast", "saturation", "sharpness", "colorTemperature", "pan", "tilt"
    };
    private static final String[] CAM_MODES = {"focusMode", "exposureMode", "whiteBalanceMode"};

    private static JSONObject cleanRange(JSONObject v) {
        if (v == null) return null;
        double min = v.optDouble("min", Double.NaN);
        double max = v.optDouble("max", Double.NaN);
        if (!Double.isFinite(min) || !Double.isFinite(max) || max <= min) return null;
        double step = v.optDouble("step", 0);
        JSONObject out = new JSONObject();
        try {
            out.put("min", min);
            out.put("max", max);
            out.put("step", Double.isFinite(step) && step > 0 ? step : 0);
        } catch (Exception ignored) {
        }
        return out;
    }

    // Mesmos campos e limites do cleanCamCaps/cleanCamCtl/cleanDevices do servidor Node.
    static JSONObject cleanCamCaps(JSONObject caps) {
        JSONObject out = new JSONObject();
        if (caps == null) return out;
        try {
            for (String k : CAM_CAPS) {
                JSONObject r = cleanRange(caps.optJSONObject(k));
                if (r != null) out.put(k, r);
            }
            for (String k : CAM_MODES) {
                JSONArray src = caps.optJSONArray(k);
                if (src == null) continue;
                JSONArray dst = new JSONArray();
                for (int i = 0; i < src.length() && dst.length() < 12; i++) {
                    if (src.opt(i) instanceof String) dst.put(clean(src.opt(i), 24));
                }
                out.put(k, dst);
            }
            if (caps.opt("torch") instanceof Boolean) out.put("torch", caps.optBoolean("torch"));
        } catch (Exception ignored) {
        }
        return out;
    }

    static JSONObject cleanCamCtl(JSONObject ctl) {
        JSONObject out = new JSONObject();
        if (ctl == null) return out;
        try {
            for (String k : CAM_CAPS) {
                Object v = ctl.opt(k);
                if (v instanceof Number) {
                    double d = ((Number) v).doubleValue();
                    if (Double.isFinite(d)) out.put(k, d);
                }
            }
            for (String k : CAM_MODES) {
                if (ctl.opt(k) instanceof String) out.put(k, clean(ctl.opt(k), 24));
            }
            if (ctl.opt("torch") instanceof Boolean) out.put("torch", ctl.optBoolean("torch"));
        } catch (Exception ignored) {
        }
        return out;
    }

    static JSONArray cleanDevices(JSONArray list) {
        JSONArray out = new JSONArray();
        if (list == null) return out;
        for (int i = 0; i < list.length() && out.length() < 12; i++) {
            JSONObject d = list.optJSONObject(i);
            if (d == null || !(d.opt("id") instanceof String)) continue;
            try {
                out.put(new JSONObject()
                        .put("id", clean(d.opt("id"), 120))
                        .put("label", clean(d.opt("label"), 60)));
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    static JSONObject cleanState(JSONObject s) {
        JSONObject out = new JSONObject();
        if (s == null) return out;
        try {
            if (s.opt("name") instanceof String) out.put("name", clean(s.get("name"), 60));
            if (s.opt("camOn") instanceof Boolean) out.put("camOn", s.getBoolean("camOn"));
            if (s.opt("micOn") instanceof Boolean) out.put("micOn", s.getBoolean("micOn"));
            // câmera remota (celular pelo QR /cam): o host não monta retorno nem mix-minus para ela
            if (s.opt("cam") instanceof Boolean) out.put("cam", s.getBoolean("cam"));
            for (String k : new String[]{"camStreamId", "screenStreamId"}) {
                if (s.has(k)) {
                    Object v = s.get(k);
                    if (v == JSONObject.NULL) out.put(k, JSONObject.NULL);
                    else if (v instanceof String) out.put(k, ((String) v).isEmpty() ? v : clean(v, 80));
                }
            }
            // Painel Câmeras (1.2.54+): controles e interfaces que o aparelho informa.
            JSONObject caps = s.optJSONObject("camCaps");
            if (caps != null) out.put("camCaps", cleanCamCaps(caps));
            JSONObject ctl = s.optJSONObject("camCtl");
            if (ctl != null) out.put("camCtl", cleanCamCtl(ctl));
            JSONArray vids = s.optJSONArray("camVideoDevices");
            if (vids != null) out.put("camVideoDevices", cleanDevices(vids));
            JSONArray auds = s.optJSONArray("camAudioDevices");
            if (auds != null) out.put("camAudioDevices", cleanDevices(auds));
            if (s.opt("camVideoId") instanceof String) out.put("camVideoId", clean(s.opt("camVideoId"), 120));
            if (s.opt("camAudioId") instanceof String) out.put("camAudioId", clean(s.opt("camAudioId"), 120));
        } catch (Exception ignored) {
        }
        return out;
    }

    private Room room(String id) {
        Room r = rooms.get(id);
        if (r == null) {
            r = new Room(id);
            rooms.put(id, r);
        }
        return r;
    }

    private void send(Client c, JSONObject msg) {
        if (c != null) c.ws.sendText(msg.toString());
    }

    private static JSONObject o(Object... kv) {
        JSONObject j = new JSONObject();
        try {
            for (int i = 0; i < kv.length; i += 2) j.put((String) kv[i], kv[i + 1] == null ? JSONObject.NULL : kv[i + 1]);
        } catch (Exception ignored) {
        }
        return j;
    }

    public Client connect(Peer ws, boolean isLocal) {
        return new Client(ws, isLocal);
    }

    public synchronized void pong(Client c) {
        c.alive = true;
    }

    public synchronized void onText(Client c, String raw) {
        JSONObject msg;
        try {
            msg = new JSONObject(raw);
        } catch (Exception e) {
            return;
        }
        try {
            onMessage(c, msg);
        } catch (Exception e) {
            Log.e(TAG, "signal", e);
        }
    }

    private synchronized void heartbeat() {
        for (Room r : new ArrayList<>(rooms.values())) {
            for (Client c : new ArrayList<>(r.clients.values())) {
                if (!c.alive) {
                    c.ws.close(1001, "timeout");
                    leave(c);
                    continue;
                }
                c.alive = false;
                try {
                    c.ws.ping();
                } catch (Exception ignored) {
                }
            }
        }
    }

    private JSONObject publicInfo(Client c) {
        return o("id", c.id, "name", c.name, "role", c.role, "state", c.state, "cohost", c.cohost);
    }

    private JSONObject cleanCmd(JSONObject cmd) {
        if (cmd == null) return null;
        String op = cmd.optString("op");
        switch (op) {
            case "layout": {
                String l = Store.str(cmd.opt("layout"));
                boolean ok = l.matches("grid|solo|leader|sidebar|pip|split") || l.matches("^c-[a-z0-9]{3,12}$");
                return ok ? o("op", "layout", "layout", l) : null;
            }
            case "stage":
                return cmd.has("id") && !Store.str(cmd.opt("id")).isEmpty() ? o("op", "stage", "id", clean(cmd.opt("id"), 80), "on", cmd.optBoolean("on")) : null;
            case "solo":
                return o("op", "solo", "id", Store.str(cmd.opt("id")).isEmpty() ? null : clean(cmd.opt("id"), 80));
            case "banner":
                return !Store.str(cmd.opt("id")).isEmpty() ? o("op", "banner", "id", clean(cmd.opt("id"), 80)) : null;
            case "hide-banner":
                return o("op", "hide-banner");
            case "quick-banner": {
                String title = clean(cmd.opt("title"), 90);
                return title.isEmpty() ? null : o("op", "quick-banner", "title", title, "subtitle", clean(cmd.opt("subtitle"), 120));
            }
            case "mic": {
                String a = cmd.optString("action");
                return !Store.str(cmd.opt("to")).isEmpty() && (a.equals("mute") || a.equals("unmute-request")) ? o("op", "mic", "to", clean(cmd.opt("to"), 20), "action", a) : null;
            }
        }
        return null;
    }

    private static boolean rate(List<Long> times, long windowMs, int max) {
        long now = System.currentTimeMillis();
        times.removeIf(t -> now - t >= windowMs);
        if (times.size() >= max) return false;
        times.add(now);
        return true;
    }

    private void onMessage(Client c, JSONObject msg) throws Exception {
        String type = msg.optString("type");
        if (type.equals("join")) {
            join(c, msg);
            return;
        }
        if (c.room == null) return;
        Room r = rooms.get(c.room);
        if (r == null) return;
        // saída (OBS/vMix) só negocia a conexão com o host
        if ("output".equals(c.role) && !type.equals("signal")) return;
        // controle remoto só envia comandos, chat, sinal WebRTC e pede/para o vídeo ou áudio de prévia
        if ("remote".equals(c.role) && !type.equals("remote-cmd") && !type.equals("remote-view") && !type.equals("remote-audio") && !type.equals("chat") && !type.equals("signal")) return;
        switch (type) {
            case "remote-audio": {
                c.audio = msg.optBoolean("on", false);
                if (r.host != null) send(r.host, o("type", "remote-audio", "from", c.id, "on", c.audio));
                break;
            }
            case "signal": {
                Client target = r.clients.get(msg.optString("to"));
                if (target == null || (!"host".equals(c.role) && !"host".equals(target.role))) return;
                send(target, o("type", "signal", "from", c.id, "data", msg.opt("data")));
                break;
            }
            case "chat": {
                String text = clean(msg.opt("text"), 500);
                if (text.isEmpty()) return;
                if (!rate(c.chatTimes, 4000, 6)) {
                    send(c, o("type", "error", "code", "rate", "message", "Muitas mensagens. Aguarde um instante."));
                    return;
                }
                JSONObject out = o("type", "chat", "id", Store.uuid(8), "from", c.id, "name", c.name, "role", c.role, "text", text, "ts", System.currentTimeMillis());
                for (Client other : r.clients.values()) send(other, out);
                break;
            }
            case "state": {
                JSONObject st = cleanState(msg.optJSONObject("state"));
                if (!st.optString("name").isEmpty()) c.name = st.optString("name");
                for (java.util.Iterator<String> it = st.keys(); it.hasNext(); ) {
                    String k = it.next();
                    c.state.put(k, st.get(k));
                }
                c.state.put("name", c.name);
                if ("guest".equals(c.role) && r.host != null) send(r.host, o("type", "guest-state", "id", c.id, "state", c.state));
                break;
            }
            case "control": {
                if (!"host".equals(c.role)) return;
                Client target = r.clients.get(msg.optString("to"));
                if (target == null) return;
                String action = clean(msg.opt("action"), 30);
                send(target, o("type", "control", "action", action, "data", msg.has("data") ? msg.get("data") : null));
                if ("kick".equals(msg.optString("action"))) {
                    timer.schedule(() -> target.ws.close(4001, "kicked"), 300, TimeUnit.MILLISECONDS);
                }
                break;
            }
            case "studio-state": {
                if (!"host".equals(c.role)) return;
                JSONObject st = msg.optJSONObject("state");
                r.live = st != null && st.optBoolean("live");
                r.studioState = st != null ? st : JSONObject.NULL;
                for (Client other : r.clients.values()) {
                    if (other != c) send(other, o("type", "studio-state", "state", msg.opt("state")));
                }
                break;
            }
            case "set-cohost": {
                if (!"host".equals(c.role)) return;
                Client target = r.clients.get(msg.optString("id"));
                if (target == null || !"guest".equals(target.role)) return;
                boolean on = msg.optBoolean("on");
                target.cohost = on;
                if (target.key != null && !target.key.isEmpty()) {
                    if (on) r.cohostKeys.add(target.key);
                    else r.cohostKeys.remove(target.key);
                }
                send(target, o("type", "role", "cohost", on));
                if (on && r.cohostState != JSONObject.NULL) send(target, o("type", "cohost-state", "state", r.cohostState));
                break;
            }
            case "cohost-state": {
                if (!"host".equals(c.role)) return;
                r.cohostState = msg.has("state") && msg.get("state") != null ? msg.get("state") : JSONObject.NULL;
                for (Client x : r.clients.values()) if (x.cohost) send(x, o("type", "cohost-state", "state", r.cohostState));
                break;
            }
            case "remote-state": {
                if (!"host".equals(c.role)) return;
                r.remoteState = msg.has("state") && msg.get("state") != null ? msg.get("state") : JSONObject.NULL;
                for (Client x : r.clients.values()) if ("remote".equals(x.role)) send(x, o("type", "remote-state", "state", r.remoteState));
                break;
            }
            case "remote-frame": {
                // quadro JPEG do programa: só vai a quem ligou o vídeo
                String data = msg.optString("data", "");
                if (!"host".equals(c.role) || data.isEmpty() || data.length() > 200000) return;
                for (Client x : r.clients.values()) if ("remote".equals(x.role) && x.view) send(x, o("type", "remote-frame", "data", data));
                break;
            }
            case "remote-view": {
                if (!"remote".equals(c.role)) return;
                c.view = msg.optBoolean("on", false);
                if (r.host != null) send(r.host, remoteStats(r));
                break;
            }
            case "remote-cmd": {
                if (!"remote".equals(c.role) || r.host == null) return;
                if (!rate(c.cmdTimes, 1000, 30)) return;
                JSONObject rc = cleanRemoteCmd(msg.optJSONObject("cmd"));
                if (rc == null) return;
                send(r.host, o("type", "remote-cmd", "from", c.id, "name", c.name, "cmd", rc));
                break;
            }
            case "cohost-cmd": {
                if (!c.cohost || r.host == null) return;
                if (!rate(c.cmdTimes, 1000, 20)) return;
                JSONObject cmd = cleanCmd(msg.optJSONObject("cmd"));
                if (cmd == null) return;
                send(r.host, o("type", "cohost-cmd", "from", c.id, "name", c.name, "cmd", cmd));
                break;
            }
        }
    }

    // comandos do controle remoto (celular via QR): mesa de corte completa. O host valida de novo antes de executar.
    private JSONObject cleanRemoteCmd(JSONObject cmd) {
        if (cmd == null) return null;
        JSONObject base = cleanCmd(cmd);
        if (base != null) return base;
        String id = cmd.has("id") && !cmd.isNull("id") ? clean(cmd.opt("id"), 80) : "";
        switch (cmd.optString("op")) {
            case "pvw": return id.isEmpty() ? null : o("op", "pvw", "id", id);
            case "cut-to": return id.isEmpty() ? null : o("op", "cut-to", "id", id);
            case "take": return o("op", "take", "kind", "mix".equals(cmd.optString("kind")) ? "mix" : "cut");
            case "ftb": return o("op", "ftb", "on", cmd.optBoolean("on", false));
            case "switcher": return o("op", "switcher", "on", cmd.optBoolean("on", false));
            case "mute": return id.isEmpty() ? null : o("op", "mute", "id", id, "on", cmd.optBoolean("on", false));
            case "director": return o("op", "director", "on", cmd.optBoolean("on", false));
            case "ducking": return o("op", "ducking", "on", cmd.optBoolean("on", false));
            case "media-play": return o("op", "media-play", "id", id);
            case "media-pause": return o("op", "media-pause", "id", id);
            case "media-step": return o("op", "media-step", "dir", cmd.optInt("dir", 1) < 0 ? -1 : 1);
            case "media-seek": return o("op", "media-seek", "id", id, "time", cmd.optDouble("time", 0));
            case "media-vol": return id.isEmpty() ? null : o("op", "media-vol", "id", id, "vol", Math.max(0, Math.min(1, cmd.optDouble("vol", 1))));
            case "master-vol": return o("op", "master-vol", "vol", Math.max(0, Math.min(1, cmd.optDouble("vol", 1))));
            case "src-vol": return id.isEmpty() ? null : o("op", "src-vol", "id", id, "vol", Math.max(0, Math.min(1, cmd.optDouble("vol", 1))));
        }
        return null;
    }

    private JSONObject remoteStats(Room r) {
        int n = 0, v = 0;
        for (Client x : r.clients.values()) if ("remote".equals(x.role)) { n++; if (x.view) v++; }
        return o("type", "remote-count", "n", n, "viewers", v);
    }

    private void join(Client c, JSONObject msg) throws Exception {
        if (c.room != null) return;
        String roomId = clean(msg.opt("room"), 64);
        if (roomId.isEmpty() || !studioExists.test(roomId)) {
            send(c, o("type", "error", "code", "no-studio", "message", "Estúdio não encontrado."));
            c.ws.close(4004, "no-studio");
            return;
        }
        boolean wantsHost = "host".equals(msg.optString("role"));
        boolean wantsOutput = "output".equals(msg.optString("role"));
        boolean wantsRemote = "remote".equals(msg.optString("role"));
        if (wantsHost && !c.isLocal) {
            send(c, o("type", "error", "code", "host-local-only", "message", "O estúdio só pode ser aberto no próprio aparelho."));
            c.ws.close(4003, "host-local-only");
            return;
        }
        // saída para OBS/vMix: livre neste aparelho; de outro computador só com a chave do link
        if (wantsOutput && !c.isLocal && !clean(msg.opt("key"), 40).equals(outKey.apply(roomId))) {
            send(c, o("type", "error", "code", "bad-key", "message", "Link de saída inválido. Copie o link de novo no painel Sinais do estúdio."));
            c.ws.close(4005, "bad-key");
            return;
        }
        // controle remoto: sempre exige a chave do link (mesmo na rede local), pois comanda a live
        if (wantsRemote && !clean(msg.opt("key"), 40).equals(outKey.apply(roomId))) {
            send(c, o("type", "error", "code", "bad-key", "message", "Link do controle remoto inválido. Gere o QR de novo no painel Diretor do estúdio."));
            c.ws.close(4005, "bad-key");
            return;
        }
        Room r = room(roomId);
        c.room = roomId;
        c.role = wantsHost ? "host" : wantsOutput ? "output" : wantsRemote ? "remote" : "guest";
        String nm = clean(msg.opt("name"), 60);
        c.name = !nm.isEmpty() ? nm : (wantsHost ? "Host" : wantsOutput ? "Saída" : wantsRemote ? "Controle" : "Convidado");
        c.state = cleanState(msg.optJSONObject("state"));
        c.state.put("name", c.name);
        if (wantsOutput) c.src = clean(msg.opt("src"), 100);
        if (!wantsHost && !wantsOutput && !wantsRemote) {
            c.key = clean(msg.opt("key"), 40);
            c.cohost = !c.key.isEmpty() && r.cohostKeys.contains(c.key);
        }
        if (wantsHost && r.host != null && r.host != c) {
            Client old = r.host;
            send(old, o("type", "error", "code", "replaced", "message", "O estúdio foi aberto em outra janela."));
            r.clients.remove(old.id);
            old.room = null;
            old.ws.close(4002, "replaced");
        }
        r.clients.put(c.id, c);
        if (wantsHost) r.host = c;

        JSONArray guests = new JSONArray();
        JSONArray outputs = new JSONArray();
        if (wantsHost) for (Client x : r.clients.values()) {
            if ("guest".equals(x.role)) guests.put(publicInfo(x));
            else if ("output".equals(x.role)) outputs.put(o("id", x.id, "src", x.src));
        }
        JSONObject welcome = o("type", "welcome", "id", c.id, "role", c.role, "hostId", r.host != null ? r.host.id : null, "guests", guests, "outputs", outputs, "live", r.live, "cohost", c.cohost);
        if (wantsHost) welcome.put("outKey", outKey.apply(roomId));
        send(c, welcome);
        if (c.cohost && r.cohostState != JSONObject.NULL) send(c, o("type", "cohost-state", "state", r.cohostState));
        if (wantsRemote && r.remoteState != JSONObject.NULL) send(c, o("type", "remote-state", "state", r.remoteState));

        if (wantsHost) {
            for (Client g : r.clients.values()) if ("guest".equals(g.role) || "output".equals(g.role) || "remote".equals(g.role)) send(g, o("type", "host-online", "hostId", c.id));
            send(c, remoteStats(r));
        } else if (wantsRemote) {
            if (r.host != null) send(r.host, remoteStats(r));
        } else if (wantsOutput) {
            if (r.host != null) send(r.host, o("type", "output-joined", "id", c.id, "src", c.src));
        } else if (r.host != null) {
            send(r.host, o("type", "guest-joined", "guest", publicInfo(c)));
            if (r.studioState != JSONObject.NULL) send(c, o("type", "studio-state", "state", r.studioState));
        }
    }

    public synchronized void leave(Client c) {
        if (c.room == null) return;
        Room r = rooms.get(c.room);
        c.room = null;
        if (r == null) return;
        r.clients.remove(c.id);
        if (r.host == c) {
            r.host = null;
            r.live = false;
            r.studioState = JSONObject.NULL;
            r.remoteState = JSONObject.NULL;
            for (Client g : r.clients.values()) send(g, o("type", "host-offline"));
        } else if (r.host != null) {
            send(r.host, "output".equals(c.role) ? o("type", "output-left", "id", c.id) : "remote".equals(c.role) ? remoteStats(r) : o("type", "guest-left", "id", c.id));
        }
        if (r.clients.isEmpty()) rooms.remove(r.id);
    }

    public synchronized JSONArray roomStats() {
        JSONArray a = new JSONArray();
        for (Room r : rooms.values()) a.put(o("id", r.id, "hostOnline", r.host != null, "participants", r.clients.size(), "live", r.live));
        return a;
    }
}
