// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

/**
 * Serviço em primeiro plano que mantém o servidor local vivo (convidados, gravação e transmissão
 * continuam mesmo com a tela apagando). Equivale ao processo do servidor no PC.
 */
public class ServerService extends Service {
    private static final String TAG = "CastDeck.Service";
    static final String CHANNEL = "castdeck-server";
    static final String ACTION_QUIT = "com.castdeck.studio.QUIT";
    static volatile LocalServer server;
    static volatile boolean running;
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;

    public static void start(Context c) {
        Intent i = new Intent(c, ServerService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, I18n.t(ServerService.this, "Servidor do estúdio", "Studio server", "Servidor del estudio"), NotificationManager.IMPORTANCE_LOW));
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            // câmera/mic: sem esses tipos o Android corta a captura do host quando o app sai da tela
            int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            if (checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED)
                types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED)
                types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            try {
                startForeground(1, n, types);
            } catch (Exception e) { // ex.: reiniciado pelo sistema em segundo plano
                Log.w(TAG, "startForeground câmera/mic recusado: " + e);
                startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            }
        } else if (Build.VERSION.SDK_INT >= 30) {
            int types = 0;
            if (checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED)
                types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED)
                types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            try {
                startForeground(1, n, types);
            } catch (Exception e) {
                startForeground(1, n);
            }
        } else startForeground(1, n);

        PowerManager pm = getSystemService(PowerManager.class);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CastDeck:server");
        wake.acquire();
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            wifi = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "CastDeck:wifi");
            wifi.acquire();
        }
        try {
            LocalServer s = new LocalServer(this);
            s.onQuit = () -> {
                sendBroadcast(new Intent(ACTION_QUIT).setPackage(getPackageName()));
                stopSelf();
            };
            s.start();
            server = s;
            running = true;
        } catch (Exception e) {
            Log.e(TAG, "falha ao iniciar o servidor", e);
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent quit = new Intent(this, ServerService.class).setAction(ACTION_QUIT);
        PendingIntent qi = PendingIntent.getService(this, 1, quit, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_live)
                .setContentTitle(I18n.t(ServerService.this, "CastDeck está ativo", "CastDeck is running", "CastDeck está activo"))
                .setContentText(I18n.t(ServerService.this, "Estúdio, convidados e transmissão rodando neste aparelho", "Studio, guests and streaming running on this device", "Estudio, invitados y transmisión funcionando en este dispositivo"))
                .setContentIntent(pi)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, I18n.t(ServerService.this, "Encerrar", "Quit", "Cerrar"), qi).build())
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_QUIT.equals(intent.getAction())) {
            sendBroadcast(new Intent(ACTION_QUIT).setPackage(getPackageName()));
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        LocalServer s = server;
        server = null;
        if (s != null) s.stop();
        if (wake != null && wake.isHeld()) wake.release();
        if (wifi != null && wifi.isHeld()) wifi.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
