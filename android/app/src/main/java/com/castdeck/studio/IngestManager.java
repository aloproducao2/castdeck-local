// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/** Porta do BroadcastManager (server/broadcast.js): cada conexão em /ingest é uma transmissão. */
public class IngestManager {
    public interface Conn {
        void sendText(String s);

        void close();
    }

    private final Context ctx;
    private final Store store;
    private final Supplier<File> recDir;
    private final Map<String, Broadcast> active = new ConcurrentHashMap<>();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    public Runnable onChange;

    public IngestManager(Context ctx, Store store, Supplier<File> recDir) {
        this.ctx = ctx;
        this.store = store;
        this.recDir = recDir;
    }

    private static String msg(String type, String message) {
        try {
            return new JSONObject().put("type", type).put("message", message).toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** estado por conexão */
    public class Session {
        final Conn ws;
        Broadcast bc;
        String key;
        ScheduledFuture<?> statusTimer;

        Session(Conn ws) {
            this.ws = ws;
        }

        public synchronized void onText(String raw) {
            JSONObject m;
            try {
                m = new JSONObject(raw);
            } catch (Exception e) {
                return;
            }
            String type = m.optString("type");
            if (type.equals("start") && bc == null) {
                JSONObject studio = store.getStudio(m.optString("studioId"));
                if (studio == null) {
                    ws.sendText(msg("error", "Estúdio não encontrado"));
                    return;
                }
                if (bc != null) {
                    if (m.optBoolean("record")) bc.addRecord();
                    JSONArray ids = m.optJSONArray("destinationIds");
                    if (ids != null && ids.length() > 0) {
                        List<JSONObject> dests = new ArrayList<>();
                        for (int i = 0; i < ids.length(); i++) {
                            JSONObject d = store.getDestination(ids.optString(i));
                            if (d != null) dests.add(d);
                        }
                        bc.addDestinations(dests);
                    }
                    ws.sendText(bc.status("status").toString());
                    return;
                }
                boolean vertical = m.optBoolean("vertical");
                String k = studio.optString("id") + (vertical ? ":v" : "");
                if (active.containsKey(k)) {
                    ws.sendText(msg("error", vertical ? "A saída vertical deste estúdio já está ativa." : "Este estúdio já está transmitindo."));
                    return;
                }
                List<JSONObject> dests = new ArrayList<>();
                JSONArray ids = m.optJSONArray("destinationIds");
                if (ids != null) for (int i = 0; i < ids.length(); i++) {
                    JSONObject d = store.getDestination(ids.optString(i));
                    if (d != null) dests.add(d);
                }
                Broadcast b;
                try {
                    b = new Broadcast(ctx, studio, dests, m.optBoolean("record"), m.optString("preset"), vertical, recDir.get());
                } catch (Exception e) {
                    ws.sendText(msg("error", e.getMessage()));
                    return;
                }
                bc = b;
                key = k;
                active.put(k, b);
                b.events = new Broadcast.Events() {
                    @Override
                    public void onStatus() {
                    }

                    @Override
                    public void onError(String message) {
                        ws.sendText(msg("error", message));
                    }

                    @Override
                    public void onEnded() {
                        if (statusTimer != null) statusTimer.cancel(false);
                        active.remove(k, b);
                        ws.sendText(b.status("ended").toString());
                        timer.schedule(ws::close, 200, TimeUnit.MILLISECONDS);
                        if (onChange != null) onChange.run();
                    }
                };
                b.start();
                statusTimer = timer.scheduleWithFixedDelay(() -> ws.sendText(b.status("status").toString()), 1, 1, TimeUnit.SECONDS);
                ws.sendText(b.status("started").toString());
                if (onChange != null) onChange.run();
            } else if (type.equals("start-record")) {
                if (bc != null) bc.addRecord();
            } else if (type.equals("stop-record")) {
                if (bc != null) bc.stopRecord();
            } else if (type.equals("start-destinations")) {
                if (bc != null) {
                    List<JSONObject> dests = new ArrayList<>();
                    JSONArray ids = m.optJSONArray("destinationIds");
                    if (ids != null) for (int i = 0; i < ids.length(); i++) {
                        JSONObject d = store.getDestination(ids.optString(i));
                        if (d != null) dests.add(d);
                    }
                    bc.addDestinations(dests);
                }
            } else if (type.equals("stop-destinations")) {
                if (bc != null) bc.stopDestinations();
            } else if (type.equals("stop")) {
                if (bc != null) bc.stop();
            }
        }

        public void onBinary(byte[] data) {
            Broadcast b = bc;
            if (b != null) b.feed(data);
        }

        public void onClose() {
            Broadcast b = bc;
            if (b != null) b.stop();
        }
    }

    public Session open(Conn ws) {
        return new Session(ws);
    }

    public JSONArray list() {
        JSONArray a = new JSONArray();
        for (Broadcast b : active.values()) a.put(b.status("status"));
        return a;
    }

    public int count() {
        return active.size();
    }

    public void stopAll() {
        for (Broadcast b : active.values()) b.stop();
    }
}
