// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Atualização dentro do app: baixa o APK da versão nova do site oficial (releases.json),
 * confere o SHA-256 e abre a tela "Atualizar" do Android (a confirmação é sempre do usuário).
 */
final class Updater {
    private static final String TAG = "CastDeck.Update";
    private static final String BASE = "https://cast.flue.live";
    private static final String TARGET = "android-arm64";

    private final Context ctx;
    private final File dir;
    private volatile String state = "idle", version, error;
    private volatile long got, total;
    private volatile File file;

    Updater(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.dir = new File(this.ctx.getCacheDir(), UpdateProvider.DIR);
    }

    String current() {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "dev";
        }
    }

    JSONObject status() {
        JSONObject j = new JSONObject();
        try {
            j.put("state", state).put("version", version == null ? JSONObject.NULL : version)
                    .put("got", got).put("total", total).put("error", error == null ? JSONObject.NULL : error)
                    .put("canInstall", true);
        } catch (Exception ignored) {
        }
        return j;
    }

    synchronized JSONObject download() {
        if ("downloading".equals(state) || "ready".equals(state)) return status();
        state = "downloading";
        version = null;
        error = null;
        got = 0;
        total = 0;
        new Thread(() -> {
            try {
                run();
            } catch (Exception e) {
                error = e.getMessage() == null ? e.toString() : e.getMessage();
                state = "error";
                Log.w(TAG, "falha: " + error);
            }
        }, "update-download").start();
        return status();
    }

    static int cmp(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < 3; i++) {
            int p = i < x.length ? parse(x[i]) : 0, q = i < y.length ? parse(y[i]) : 0;
            if (p != q) return p - q;
        }
        return 0;
    }

    private static int parse(String s) {
        try {
            return Integer.parseInt(s.replaceAll("\\D.*$", ""));
        } catch (Exception e) {
            return 0;
        }
    }

    private void run() throws Exception {
        JSONObject data = new JSONObject(get(BASE + "/releases.json?t=" + System.currentTimeMillis()));
        JSONArray rels = data.optJSONArray("releases");
        JSONObject rel = null, art = null;
        if (rels != null) for (int i = 0; i < rels.length(); i++) {
            JSONObject r = rels.getJSONObject(i);
            JSONArray arts = r.optJSONArray("artifacts");
            if (arts == null) continue;
            for (int k = 0; k < arts.length(); k++) {
                JSONObject a = arts.getJSONObject(k);
                if (TARGET.equals(a.optString("platform")) && a.optBoolean("available")
                        && (rel == null || cmp(r.optString("version"), rel.optString("version")) > 0)) {
                    rel = r;
                    art = a;
                }
            }
        }
        if (art == null) throw new IOException("Nenhuma versão para Android encontrada no site.");
        String cur = current();
        if (!"dev".equals(cur) && cmp(rel.optString("version"), cur) <= 0) throw new IOException("Você já está na versão mais recente.");
        String path = art.optString("file");
        if (!path.matches("^downloads/[\\w.\\-/]+\\.apk$")) throw new IOException("Arquivo de atualização inválido.");

        version = rel.optString("version");
        total = art.optLong("size");
        deleteAll(dir);
        dir.mkdirs();
        File out = new File(dir, "CastDeck-" + version + ".apk");
        File part = new File(dir, out.getName() + ".part");

        // /dl/ conta o download no site e redireciona para o arquivo
        HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/" + path.replaceFirst("^downloads/", "dl/")).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        try {
            if (c.getResponseCode() != 200) throw new IOException("Falha no download (HTTP " + c.getResponseCode() + ")");
            if (total <= 0) total = c.getContentLengthLong();
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = c.getInputStream(); FileOutputStream o = new FileOutputStream(part)) {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) {
                    md.update(buf, 0, n);
                    o.write(buf, 0, n);
                    got += n;
                }
            }
            String sha = art.optString("sha256");
            if (!sha.isEmpty() && !sha.equalsIgnoreCase(hex(md.digest()))) {
                part.delete();
                throw new IOException("O arquivo baixado está corrompido (SHA-256 não confere). Tente de novo.");
            }
        } finally {
            c.disconnect();
        }
        if (!part.renameTo(out)) throw new IOException("Não foi possível salvar a atualização.");
        file = out;
        state = "ready";
        Log.i(TAG, "v" + version + " pronta para instalar");
    }

    /** abre o instalador do Android; antes, se preciso, a permissão "instalar apps desconhecidos" */
    JSONObject install() throws Exception {
        if (!"ready".equals(state) || file == null || !file.exists()) throw new IOException("A atualização ainda não foi baixada.");
        JSONObject res = LocalServer.ok();
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(s);
            return res.put("permission", true);
        }
        Uri uri = Uri.parse("content://" + UpdateProvider.authority(ctx) + "/" + file.getName());
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        return res.put("installer", true);
    }

    private static String get(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setUseCaches(false);
        try {
            if (c.getResponseCode() != 200) throw new IOException("Site indisponível (HTTP " + c.getResponseCode() + ")");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    private static void deleteAll(File d) {
        File[] fs = d.listFiles();
        if (fs != null) for (File f : fs) f.delete();
    }
}
