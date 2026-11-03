// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Porta de server/polls.js: votação do público pelo celular (QR Code da enquete → /vote/&lt;estúdio&gt;).
 * O estúdio publica a enquete a cada ~1 s e leva os votos que chegaram pela página externa.
 */
public class PollHub {
    static final long STALE_MS = 8000;
    static final int MAX_PER_IP = 40, MAX_QUEUE = 5000;

    static class Room {
        String key = "";
        JSONObject poll;
        long at;
        final Map<String, Integer> voters = new HashMap<>();
        final Map<String, Integer> ips = new HashMap<>();
        List<JSONObject> queue = new ArrayList<>();
    }

    static class Result {
        final int status;
        final JSONObject body;

        Result(int status, JSONObject body) {
            this.status = status;
            this.body = body;
        }
    }

    private final Map<String, Room> rooms = new HashMap<>();

    private Room room(String id) {
        Room r = rooms.get(id);
        if (r == null) rooms.put(id, r = new Room());
        return r;
    }

    private static JSONObject live(Room r) {
        return r != null && r.poll != null && System.currentTimeMillis() - r.at < STALE_MS ? r.poll : null;
    }

    private static String cut(String s, int n) {
        return s.length() > n ? s.substring(0, n) : s;
    }

    private static JSONObject clean(JSONObject p) throws Exception {
        JSONArray in = p.optJSONArray("options");
        JSONArray opts = new JSONArray();
        if (in != null) for (int i = 0; i < Math.min(6, in.length()); i++) {
            JSONObject o = in.optJSONObject(i);
            opts.put(new JSONObject().put("text", cut(o == null ? "" : o.optString("text", ""), 60))
                    .put("votes", Math.max(0, o == null ? 0 : (long) Math.floor(o.optDouble("votes", 0)))));
        }
        String st = p.optString("state", "closed");
        if (!st.equals("ready") && !st.equals("open") && !st.equals("closed")) st = "closed";
        return new JSONObject()
                .put("id", cut(p.optString("id"), 40))
                .put("round", (long) Math.floor(p.optDouble("round", 0)))
                .put("question", cut(p.optString("question", ""), 140))
                .put("options", opts)
                .put("state", st)
                .put("endsAt", (long) p.optDouble("endsAt", 0));
    }

    /** estúdio → servidor: publica a enquete (ou null) e devolve os votos pendentes */
    public synchronized JSONArray sync(String id, Object raw) throws Exception {
        Room r = room(id);
        JSONArray out = new JSONArray();
        if (!(raw instanceof JSONObject) || ((JSONObject) raw).optString("id").isEmpty()) {
            r.poll = null;
            r.queue = new ArrayList<>();
            return out;
        }
        JSONObject p = clean((JSONObject) raw);
        String key = p.getString("id") + ":" + p.getLong("round");
        if (!key.equals(r.key)) {
            r.key = key;
            r.voters.clear();
            r.ips.clear();
            r.queue = new ArrayList<>();
        }
        JSONArray opts = p.getJSONArray("options");
        for (JSONObject v : r.queue) {
            out.put(v);
            JSONObject o = opts.optJSONObject(v.getInt("opt"));
            if (o != null) o.put("votes", o.getLong("votes") + 1);
        }
        r.queue = new ArrayList<>();
        r.poll = p;
        r.at = System.currentTimeMillis();
        return out;
    }

    /** página de votação: o que mostrar */
    public synchronized Object view(String id, String voter) throws Exception {
        Room r = rooms.get(id);
        JSONObject p = live(r);
        if (p == null) return JSONObject.NULL;
        long now = System.currentTimeMillis(), endsAt = p.optLong("endsAt", 0);
        String st = p.getString("state");
        if (st.equals("open") && endsAt > 0 && now > endsAt) st = "closed";
        Integer v = voter == null || voter.isEmpty() ? null : r.voters.get(voter);
        return new JSONObject()
                .put("id", p.get("id"))
                .put("round", p.get("round"))
                .put("question", p.get("question"))
                .put("options", p.get("options"))
                .put("state", st)
                .put("endsIn", endsAt > 0 ? Math.max(0, endsAt - now) : 0)
                .put("voted", v == null ? JSONObject.NULL : v);
    }

    private static Result fail(int status, String msg) throws Exception {
        return new Result(status, new JSONObject().put("error", msg));
    }

    public synchronized Result vote(String id, JSONObject b, String ip) throws Exception {
        Room r = rooms.get(id);
        JSONObject p = live(r);
        if (p == null) return fail(409, "Nenhuma enquete no ar agora.");
        if (!p.getString("id").equals(b.optString("pollId")) || p.getLong("round") != (long) b.optDouble("round", -1))
            return fail(409, "A enquete mudou. Atualize a página.");
        long endsAt = p.optLong("endsAt", 0);
        if (!p.getString("state").equals("open") || (endsAt > 0 && System.currentTimeMillis() > endsAt))
            return fail(409, "A votação já foi encerrada.");
        String voter = cut(b.optString("voter", "").replaceAll("[^\\w-]", ""), 64);
        if (voter.length() < 8) return fail(400, "Identificação inválida.");
        JSONArray opts = p.getJSONArray("options");
        double od = b.optDouble("opt", -1);
        int opt = (int) od;
        if (od != opt || opt < 0 || opt >= opts.length()) return fail(400, "Opção inválida.");
        if (r.voters.containsKey(voter))
            return new Result(200, new JSONObject().put("ok", false).put("already", true).put("voted", r.voters.get(voter)));
        int n = r.ips.containsKey(ip) ? r.ips.get(ip) : 0;
        if (n >= MAX_PER_IP) return fail(429, "Muitos votos vindos desta rede.");
        if (r.queue.size() >= MAX_QUEUE) return fail(503, "Muitos votos ao mesmo tempo, tente de novo.");
        r.ips.put(ip, n + 1);
        r.voters.put(voter, opt);
        r.queue.add(new JSONObject().put("key", "web:" + voter).put("opt", opt));
        JSONObject o = opts.getJSONObject(opt);
        o.put("votes", o.getLong("votes") + 1);
        return new Result(200, new JSONObject().put("ok", true).put("voted", opt));
    }
}
