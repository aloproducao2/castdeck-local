// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Porta de server/raffles.js: sorteio ao vivo pelo celular (QR Code → /raffle/&lt;estúdio&gt;).
 * O estúdio publica o sorteio e recebe as inscrições feitas pela página pública.
 */
public class RaffleHub {
    static final long STALE_MS = 10000;
    static final int MAX_PER_IP = 40, MAX_QUEUE = 5000;
    private static final Set<String> STATES = new HashSet<>(Arrays.asList("ready", "open", "spinning", "winner", "closed"));

    static class Room {
        String key = "";
        JSONObject raffle;
        long at;
        final Map<String, JSONObject> entries = new HashMap<>();
        final Map<String, Integer> ips = new HashMap<>();
        List<JSONObject> queue = new ArrayList<>();
        long seq = 0;
    }

    private final Map<String, Room> rooms = new HashMap<>();

    private Room room(String id) {
        Room r = rooms.get(id);
        if (r == null) rooms.put(id, r = new Room());
        return r;
    }

    private static JSONObject live(Room r) {
        return r != null && r.raffle != null && System.currentTimeMillis() - r.at < STALE_MS ? r.raffle : null;
    }

    private static String cut(String s, int n) {
        return s.length() > n ? s.substring(0, n) : s;
    }

    private static String str(JSONObject o, String key, String fallback, int max) {
        if (o == null || o.isNull(key)) return cut(fallback, max);
        return cut(o.optString(key, fallback), max);
    }

    private static long floorLong(JSONObject o, String key) {
        if (o == null || o.isNull(key)) return 0;
        double d = o.optDouble(key, 0);
        return Double.isNaN(d) || Double.isInfinite(d) ? 0 : (long) Math.floor(d);
    }

    private static JSONObject clean(JSONObject r) throws Exception {
        String st = str(r, "state", "ready", 16);
        if (!STATES.contains(st)) st = "ready";
        JSONObject w = r.optJSONObject("winner");
        Object winnerObj = JSONObject.NULL;
        if (w != null) {
            String wName = str(w, "name", "", 60);
            if (!wName.isEmpty()) {
                double tn = w.optDouble("ticketNo", 0);
                long ticketNo = Double.isNaN(tn) || Double.isInfinite(tn) ? 0 : (long) tn;
                String src = str(w, "source", "QR", 16);
                if (src.isEmpty()) src = "QR";
                winnerObj = new JSONObject()
                        .put("name", wName)
                        .put("ticketNo", ticketNo)
                        .put("source", src);
            }
        }
        return new JSONObject()
                .put("id", str(r, "id", "", 40))
                .put("round", floorLong(r, "round"))
                .put("title", str(r, "title", "Sorteio ao vivo", 120))
                .put("keyword", str(r, "keyword", "", 32))
                .put("state", st)
                .put("askContact", r.optBoolean("askContact", false))
                .put("contactLabel", str(r, "contactLabel", "@Instagram ou WhatsApp", 40))
                .put("count", Math.max(0L, floorLong(r, "count")))
                .put("spinName", str(r, "spinName", "", 60))
                .put("winner", winnerObj);
    }

    /** estúdio → servidor: publica o estado do sorteio (ou null) e devolve inscrições pendentes */
    public synchronized JSONArray sync(String id, Object raw) throws Exception {
        Room r = room(id);
        JSONArray out = new JSONArray();
        if (!(raw instanceof JSONObject) || ((JSONObject) raw).optString("id").isEmpty()) {
            r.raffle = null;
            r.queue = new ArrayList<>();
            return out;
        }
        JSONObject cleanR = clean((JSONObject) raw);
        String key = cleanR.getString("id") + ":" + cleanR.getLong("round");
        if (!key.equals(r.key)) {
            r.key = key;
            r.entries.clear();
            r.ips.clear();
            r.queue = new ArrayList<>();
            r.seq = 0;
        }
        for (JSONObject item : r.queue) out.put(item);
        r.queue = new ArrayList<>();
        r.raffle = cleanR;
        r.at = System.currentTimeMillis();
        return out;
    }

    /** página pública /raffle/:id: o que mostrar */
    public synchronized Object view(String id, String participant) throws Exception {
        Room r = rooms.get(id);
        JSONObject rf = live(r);
        if (rf == null) return JSONObject.NULL;
        JSONObject joined = (participant != null && !participant.isEmpty()) ? r.entries.get(participant) : null;
        JSONObject res = new JSONObject(rf.toString());
        res.put("joined", joined != null
                ? new JSONObject().put("name", joined.getString("name")).put("ticketNo", joined.getLong("ticketNo"))
                : JSONObject.NULL);
        return res;
    }

    private static PollHub.Result fail(int status, String msg) throws Exception {
        return new PollHub.Result(status, new JSONObject().put("error", msg));
    }

    public synchronized PollHub.Result enter(String id, JSONObject body, String ip) throws Exception {
        Room r = rooms.get(id);
        JSONObject rf = live(r);
        if (rf == null) return fail(409, "Nenhum sorteio aberto agora.");
        JSONObject b = body != null ? body : new JSONObject();
        double reqRound = b.optDouble("round", Double.NaN);
        if (!rf.getString("id").equals(b.optString("raffleId")) || Double.isNaN(reqRound) || (long) reqRound != rf.getLong("round")) {
            return fail(409, "O sorteio foi reiniciado. Atualize a página.");
        }
        if (!"open".equals(rf.optString("state"))) return fail(409, "As inscrições para este sorteio estão fechadas.");
        String participant = cut(b.optString("participant", "").replaceAll("[^\\w-]", ""), 64);
        if (participant.length() < 8) return fail(400, "Identificação inválida.");
        if (r.entries.containsKey(participant)) {
            JSONObject prev = r.entries.get(participant);
            return new PollHub.Result(200, new JSONObject()
                    .put("ok", false)
                    .put("already", true)
                    .put("ticketNo", prev.getLong("ticketNo"))
                    .put("name", prev.getString("name")));
        }
        String name = cut(b.optString("name", "").trim().replaceAll("\\s+", " "), 60);
        if (name.length() < 2) return fail(400, "Digite seu nome para participar.");
        boolean askContact = rf.optBoolean("askContact", false);
        String contact = askContact ? cut(b.optString("contact", "").trim(), 60) : "";
        if (askContact && contact.length() < 2) {
            String lbl = rf.optString("contactLabel", "seu contato");
            return fail(400, "Informe " + (lbl.isEmpty() ? "seu contato" : lbl) + ".");
        }
        int ipHits = r.ips.containsKey(ip) ? r.ips.get(ip) : 0;
        if (ipHits >= MAX_PER_IP) return fail(429, "Muitas inscrições vindas desta rede.");
        if (r.queue.size() >= MAX_QUEUE) return fail(503, "Fila cheia, tente novamente.");

        long ticketNo = Math.max(rf.optLong("count", 0), r.seq) + 1;
        r.seq = ticketNo;
        r.ips.put(ip, ipHits + 1);
        JSONObject entry = new JSONObject()
                .put("key", "web:" + participant)
                .put("name", name)
                .put("contact", contact)
                .put("ticketNo", ticketNo)
                .put("source", "QR")
                .put("at", System.currentTimeMillis());
        r.entries.put(participant, entry);
        r.queue.add(entry);
        rf.put("count", rf.optLong("count", 0) + 1);
        return new PollHub.Result(200, new JSONObject()
                .put("ok", true)
                .put("ticketNo", ticketNo)
                .put("name", name));
    }
}
