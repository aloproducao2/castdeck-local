// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;

/**
 * Idioma dos textos nativos (splash, avisos, notificação): o mesmo escolhido no app
 * (settings.lang no db.json, salvo pela interface web), senão o idioma do aparelho.
 * A interface web é traduzida por public/js/i18n.js.
 */
final class I18n {
    private I18n() {}

    static String lang(Context ctx) {
        try {
            File f = new File(new File(ctx.getFilesDir(), "data"), "db.json");
            if (f.exists()) {
                JSONObject s = new JSONObject(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8)).optJSONObject("settings");
                String l = s == null ? "" : s.optString("lang", "");
                if (l.equals("pt") || l.equals("en") || l.equals("es")) return l;
            }
        } catch (Exception ignored) { /* usa o idioma do aparelho */ }
        String d = Locale.getDefault().getLanguage();
        return d.equals("pt") ? "pt" : d.equals("es") ? "es" : "en";
    }

    /** Escolhe o texto em português, inglês ou espanhol. */
    static String t(Context ctx, String pt, String en, String es) {
        String l = lang(ctx);
        return l.equals("en") ? en : l.equals("es") ? es : pt;
    }
}
