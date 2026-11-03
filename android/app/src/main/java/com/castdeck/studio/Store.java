// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** Porta de server/store.js: persistência em JSON (db.json) com escrita atômica e debounce. */
public class Store {
    private static final String TAG = "CastDeck.Store";
    private final File dir;
    private final File file;
    private final File bak;
    private final Object writeLock = new Object();
    private long lastBak = 0;
    private JSONObject data;
    private final ScheduledExecutorService io = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> pending;

    public Store(File dir) {
        this.dir = dir;
        this.file = new File(dir, "db.json");
        this.bak = new File(dir, "db.json.bak");
    }

    private static JSONObject defaults() {
        try {
            return new JSONObject("{\"studios\":[],\"destinations\":[],\"settings\":{\"autoTunnel\":true,\"tunnelProvider\":\"cloudflare\",\"tunnelV2\":true,\"turn\":{\"urls\":\"\",\"username\":\"\",\"credential\":\"\"}}}");
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
    }

    private JSONObject readFile(File f) throws Exception {
        String raw = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
        if (raw.trim().isEmpty()) throw new Exception("arquivo vazio");
        return new JSONObject(raw);
    }

    public synchronized void load() {
        dir.mkdirs();
        data = defaults();
        JSONObject raw = null;
        if (file.exists()) {
            try {
                raw = readFile(file);
            } catch (Exception e) {
                // nunca sobrescreve um banco ilegível: guarda uma cópia e tenta o backup
                File keep = new File(dir, "db.json.corrupt-" + System.currentTimeMillis());
                try {
                    Files.copy(file.toPath(), keep.toPath());
                } catch (Exception ignored) {
                }
                Log.w(TAG, "db.json inválido; cópia em " + keep.getName(), e);
            }
        }
        if (raw == null && bak.exists()) {
            try {
                raw = readFile(bak);
                Log.w(TAG, "dados restaurados de db.json.bak");
            } catch (Exception e) {
                Log.w(TAG, "backup inválido", e);
            }
        }
        try {
            if (raw != null) {
                if (raw.optJSONArray("studios") != null) data.put("studios", raw.getJSONArray("studios"));
                if (raw.optJSONArray("destinations") != null) data.put("destinations", raw.getJSONArray("destinations"));
                JSONObject s = data.getJSONObject("settings");
                JSONObject rs = raw.optJSONObject("settings");
                if (rs != null) {
                    for (java.util.Iterator<String> it = rs.keys(); it.hasNext(); ) {
                        String k = it.next();
                        s.put(k, rs.get(k));
                    }
                }
                // versões antigas do app gravavam autoTunnel=false à força (não havia túnel): religa uma vez
                if (rs == null || !rs.optBoolean("tunnelV2", false)) {
                    s.put("autoTunnel", true);
                    s.put("tunnelV2", true);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "db.json com estrutura inesperada", e);
            data = defaults();
        }
        flushNow();
    }

    private void save() {
        if (pending != null) pending.cancel(false);
        pending = io.schedule(this::flushNow, 150, TimeUnit.MILLISECONDS);
    }

    public void flushNow() {
        String json;
        synchronized (this) {
            try {
                json = data.toString(2);
            } catch (JSONException e) {
                return;
            }
        }
        synchronized (writeLock) {
            File tmp = new File(dir, "db.json.tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } catch (Exception e) {
                Log.e(TAG, "flush", e);
                return;
            }
            // cópia de segurança a cada 5 min (só de um arquivo ainda válido)
            long now = System.currentTimeMillis();
            if (now - lastBak > 5 * 60 * 1000 && file.exists()) {
                try {
                    readFile(file);
                    Files.copy(file.toPath(), bak.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } catch (Exception ignored) {
                }
                lastBak = now;
            }
            if (!tmp.renameTo(file)) {
                try {
                    Files.move(tmp.toPath(), file.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } catch (Exception e) {
                    Log.e(TAG, "rename", e);
                }
            }
        }
    }

    static String uuid(int n) {
        return UUID.randomUUID().toString().replace("-", "").substring(0, n);
    }

    static String str(Object o) {
        return o == null || o == JSONObject.NULL ? "" : String.valueOf(o);
    }

    static String cut(String s, int n) {
        return s.length() > n ? s.substring(0, n) : s;
    }

    // ---------- Settings ----------
    public synchronized JSONObject getSettings() {
        return data.optJSONObject("settings");
    }

    public synchronized JSONObject updateSettings(JSONObject patch) throws JSONException {
        JSONObject s = getSettings();
        if (patch.has("autoTunnel") && patch.get("autoTunnel") instanceof Boolean) s.put("autoTunnel", patch.getBoolean("autoTunnel"));
        String tp = patch.optString("tunnelProvider", "");
        if (tp.equals("auto") || tp.equals("localhostrun") || tp.equals("cloudflare")) s.put("tunnelProvider", tp);
        String om = patch.optString("openMode", "");
        if (om.equals("app") || om.equals("browser") || om.equals("none")) s.put("openMode", om);
        String lg = patch.optString("lang", "");
        if (lg.equals("pt") || lg.equals("en") || lg.equals("es")) s.put("lang", lg);
        if (patch.has("recordingsDir") && patch.get("recordingsDir") instanceof String) {
            String d = patch.getString("recordingsDir").trim();
            if (!d.isEmpty()) s.put("recordingsDir", cut(d, 500));
            else s.remove("recordingsDir");
        }
        JSONObject turn = patch.optJSONObject("turn");
        if (turn != null) {
            JSONObject t = new JSONObject();
            t.put("urls", cut(turn.optString("urls", "").trim(), 600));
            t.put("username", cut(turn.optString("username", "").trim(), 200));
            t.put("credential", cut(turn.optString("credential", "").trim(), 300));
            s.put("turn", t);
        }
        save();
        return s;
    }

    // ---------- Studios ----------
    public synchronized JSONArray listStudios() throws JSONException {
        JSONArray src = data.getJSONArray("studios");
        JSONArray out = new JSONArray();
        for (int i = 0; i < src.length(); i++) {
            JSONObject s = new JSONObject(src.getJSONObject(i).toString());
            s.remove("brand");
            s.remove("banners");
            s.remove("session");
            out.put(s);
        }
        return out;
    }

    public synchronized JSONObject getStudio(String id) {
        JSONArray a = data.optJSONArray("studios");
        if (a == null || id == null) return null;
        for (int i = 0; i < a.length(); i++) {
            JSONObject s = a.optJSONObject(i);
            if (s != null && id.equals(s.optString("id"))) return s;
        }
        return null;
    }

    // chave dos links de saída (OBS/vMix em outro computador): criada uma vez e mantida
    public synchronized String studioOutKey(String id) {
        JSONObject s = getStudio(id);
        if (s == null) return "";
        String k = s.optString("outKey", "");
        if (k.isEmpty()) {
            k = uuid(16);
            try {
                s.put("outKey", k);
            } catch (JSONException ignored) {
            }
            save();
        }
        return k;
    }

    public synchronized JSONObject createStudio(String name) throws JSONException {
        JSONObject s = new JSONObject();
        s.put("id", uuid(10));
        s.put("name", cut(name == null || name.isEmpty() ? "Meu estúdio" : name, 80));
        s.put("createdAt", System.currentTimeMillis());
        s.put("brand", JSONObject.NULL);
        s.put("banners", new JSONArray());
        JSONArray a = data.getJSONArray("studios");
        JSONArray n = new JSONArray();
        n.put(s);
        for (int i = 0; i < a.length(); i++) n.put(a.get(i));
        data.put("studios", n);
        save();
        return s;
    }

    public synchronized JSONObject updateStudio(String id, JSONObject patch) throws JSONException {
        JSONObject s = getStudio(id);
        if (s == null) return null;
        boolean content = false;
        if (patch.has("name") && patch.get("name") instanceof String) s.put("name", cut(patch.getString("name"), 80));
        if (patch.has("brand") && (patch.get("brand") instanceof JSONObject || patch.get("brand") == JSONObject.NULL)) {
            s.put("brand", patch.get("brand"));
            content = true;
        }
        JSONArray banners = patch.optJSONArray("banners");
        if (banners != null) {
            JSONArray b = new JSONArray();
            for (int i = 0; i < Math.min(100, banners.length()); i++) b.put(banners.get(i));
            s.put("banners", b);
            content = true;
        }
        // revisão do conteúdo: recusa gravações de janelas desatualizadas (ver conflictFor)
        if (content) s.put("rev", s.optInt("rev", 0) + 1);
        if (patch.has("session")) {
            Object ses = patch.get("session");
            if (ses == JSONObject.NULL) s.remove("session");
            else if (ses instanceof JSONObject && ses.toString().length() < 200_000) s.put("session", ses);
        }
        s.put("updatedAt", System.currentTimeMillis());
        save();
        return s;
    }

    /** Revisão atual se a gravação vier de uma versão antiga do estúdio; -1 se pode gravar. */
    public synchronized int conflictFor(String id, JSONObject patch) {
        JSONObject s = getStudio(id);
        if (s == null || !patch.has("baseRev") || patch.optBoolean("force", false)) return -1;
        int cur = s.optInt("rev", 0);
        return patch.optInt("baseRev", -2) != cur ? cur : -1;
    }

    public synchronized boolean deleteStudio(String id) throws JSONException {
        return removeById("studios", id);
    }

    private boolean removeById(String key, String id) throws JSONException {
        JSONArray a = data.getJSONArray(key);
        JSONArray n = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.getJSONObject(i);
            if (!o.optString("id").equals(id)) n.put(o);
        }
        data.put(key, n);
        save();
        return n.length() != a.length();
    }

    // ---------- Destinations ----------
    public synchronized JSONArray listDestinations() {
        return data.optJSONArray("destinations");
    }

    public synchronized JSONObject getDestination(String id) {
        JSONArray a = listDestinations();
        for (int i = 0; i < a.length(); i++) {
            JSONObject d = a.optJSONObject(i);
            if (d != null && d.optString("id").equals(id)) return d;
        }
        return null;
    }

    public synchronized JSONObject upsertDestination(JSONObject in, String id) throws JSONException {
        JSONObject target;
        if (id != null) {
            target = getDestination(id);
            if (target == null) return null;
        } else {
            target = new JSONObject();
            target.put("id", uuid(8));
            target.put("createdAt", System.currentTimeMillis());
            data.getJSONArray("destinations").put(target);
        }
        target.put("name", cut(in.has("name") && !str(in.opt("name")).isEmpty() ? str(in.opt("name")) : "Destino", 80));
        target.put("platform", cut(in.has("platform") && !str(in.opt("platform")).isEmpty() ? str(in.opt("platform")) : "custom", 30));
        // formato da chave: "h" = horizontal 16:9, "v" = vertical 9:16 (Instagram/TikTok por padrão)
        String fmt = str(in.opt("format"));
        String plat = target.optString("platform");
        target.put("format", "v".equals(fmt) || "h".equals(fmt) ? fmt : ("instagram".equals(plat) || "tiktok".equals(plat) ? "v" : "h"));
        target.put("url", cut(str(in.opt("url")).trim(), 500));
        target.put("key", cut(str(in.opt("key")).trim(), 500));
        target.put("enabled", !(in.opt("enabled") instanceof Boolean) || in.getBoolean("enabled"));
        save();
        return target;
    }

    public synchronized boolean deleteDestination(String id) throws JSONException {
        return removeById("destinations", id);
    }
}
