// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Porta de server/messages.js: mensagens do público pelo celular (QR Code → /msg/&lt;estúdio&gt;).
 * O estúdio publica a caixa a cada ~1,5 s e leva as mensagens (texto curto ou áudio) que chegaram.
 */
public class MsgHub {
    static final long STALE_MS = 8000, COOLDOWN_MS = 8000;
    static final int MAX_TEXT = 200, MAX_NAME = 30, MAX_AUDIO_SEC = 30, MAX_AUDIO_B64 = 1_200_000;
    static final int MAX_PER_IP = 60, MAX_QUEUE = 300;
    static final Pattern AUDIO_HEAD = Pattern.compile("^data:audio/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)(;[\\w=.-]+)*;base64,", Pattern.CASE_INSENSITIVE);

    static class Room {
        JSONObject box;
        long at;
        String session = "";
        final Map<String, Long> senders = new HashMap<>();
        final Map<String, Integer> ips = new HashMap<>();
        List<JSONObject> queue = new ArrayList<>();
    }

    private final Map<String, Room> rooms = new HashMap<>();

    private Room room(String id) {
        Room r = rooms.get(id);
        if (r == null) rooms.put(id, r = new Room());
        return r;
    }

    private static JSONObject live(Room r) {
        return r != null && r.box != null && System.currentTimeMillis() - r.at < STALE_MS ? r.box : null;
    }

    static String cleanText(String s, int n) {
        if (s == null) return "";
        String t = s.replaceAll("[\\u0000-\\u0008\\u000b-\\u001f\\u007f\\u200b-\\u200f\\u202a-\\u202e]", "")
                .replaceAll("[ \\t]+", " ")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
        return t.length() > n ? t.substring(0, n) : t;
    }

    /** confere o data URL do áudio sem regex sobre o corpo inteiro (strings grandes) */
    static boolean validAudio(String a) {
        if (a == null || a.length() > MAX_AUDIO_B64) return false;
        Matcher m = AUDIO_HEAD.matcher(a.substring(0, Math.min(120, a.length())));
        if (!m.find()) return false;
        int start = m.end();
        for (int i = start; i < a.length(); i++) {
            char c = a.charAt(i);
            boolean ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '+' || c == '/' || c == '=';
            if (!ok) return false;
        }
        return a.length() - start > 200;
    }

    /** estúdio → servidor: publica a caixa (ou null) e devolve as mensagens pendentes */
    public synchronized JSONArray sync(String id, Object raw) throws Exception {
        Room r = room(id);
        JSONArray out = new JSONArray();
        if (!(raw instanceof JSONObject) || ((JSONObject) raw).optString("session").isEmpty()) {
            r.box = null;
            r.queue = new ArrayList<>();
            return out;
        }
        JSONObject b = (JSONObject) raw;
        String session = b.optString("session");
        if (session.length() > 40) session = session.substring(0, 40);
        if (!session.equals(r.session)) {
            r.session = session;
            r.senders.clear();
            r.ips.clear();
            r.queue = new ArrayList<>();
        }
        String title = cleanText(b.optString("title", ""), 80);
        r.box = new JSONObject()
                .put("session", session)
                .put("open", b.optBoolean("open", false))
                .put("title", title.isEmpty() ? "Mande sua mensagem" : title)
                .put("audio", b.optBoolean("audio", true))
                .put("maxSec", MAX_AUDIO_SEC)
                .put("maxText", MAX_TEXT);
        r.at = System.currentTimeMillis();
        for (JSONObject m : r.queue) out.put(m);
        r.queue = new ArrayList<>();
        return out;
    }

    /** página pública: o que mostrar */
    public synchronized Object view(String id) throws Exception {
        JSONObject b = live(rooms.get(id));
        return b == null ? JSONObject.NULL : new JSONObject(b.toString());
    }

    private static PollHub.Result fail(int status, String msg) throws Exception {
        return new PollHub.Result(status, new JSONObject().put("error", msg));
    }

    public synchronized PollHub.Result send(String id, JSONObject body, String ip) throws Exception {
        Room r = rooms.get(id);
        JSONObject b = live(r);
        if (b == null || !b.optBoolean("open")) return fail(409, "O recebimento de mensagens está fechado agora.");
        if (!b.optString("session").equals(body.optString("session"))) return fail(409, "A caixa de mensagens mudou. Atualize a página.");
        String sender = body.optString("sender", "").replaceAll("[^\\w-]", "");
        if (sender.length() > 64) sender = sender.substring(0, 64);
        if (sender.length() < 8) return fail(400, "Identificação inválida.");
        long now = System.currentTimeMillis();
        Long last = r.senders.get(sender);
        if (last != null && now - last < COOLDOWN_MS) {
            long wait = COOLDOWN_MS - (now - last);
            return new PollHub.Result(429, new JSONObject().put("error", "Aguarde " + (long) Math.ceil(wait / 1000.0) + " s para mandar outra.").put("wait", wait));
        }
        String text = cleanText(body.optString("text", ""), MAX_TEXT);
        String name = cleanText(body.optString("name", ""), MAX_NAME).replace('\n', ' ');
        Object audio = JSONObject.NULL;
        double dur = 0;
        String a = body.optString("audio", "");
        if (!a.isEmpty()) {
            if (!b.optBoolean("audio", true)) return fail(400, "Esta transmissão não está aceitando áudio.");
            if (!validAudio(a)) return fail(400, "Áudio inválido ou grande demais.");
            dur = Math.max(0, Math.min(MAX_AUDIO_SEC + 1, body.optDouble("dur", 0)));
            if (Double.isNaN(dur)) dur = 0;
            audio = a;
        }
        if (text.isEmpty() && audio == JSONObject.NULL) return fail(400, "Escreva uma mensagem ou grave um áudio.");
        int n = r.ips.containsKey(ip) ? r.ips.get(ip) : 0;
        if (n >= MAX_PER_IP) return fail(429, "Muitas mensagens vindas desta rede.");
        if (r.queue.size() >= MAX_QUEUE) return fail(503, "Muitas mensagens ao mesmo tempo, tente de novo.");
        r.ips.put(ip, n + 1);
        r.senders.put(sender, now);
        r.queue.add(new JSONObject()
                .put("id", UUID.randomUUID().toString().substring(0, 12))
                .put("sender", sender)
                .put("name", name)
                .put("text", text)
                .put("audio", audio)
                .put("dur", dur)
                .put("at", now));
        return new PollHub.Result(200, new JSONObject().put("ok", true).put("wait", COOLDOWN_MS));
    }
}
