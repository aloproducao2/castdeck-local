// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/** Janela do app: o mesmo painel/estúdio do PC rodando num WebView apontado para o servidor embutido. */
public class MainActivity extends Activity {
    private static final int REQ_PERMS = 10, REQ_FILE = 11;
    static final String HOME = "http://127.0.0.1:" + LocalServer.HTTP_PORT + "/";
    private WebView web;
    private View splash;
    private TextView splashMsg;
    private ValueCallback<Uri[]> fileCb;
    private PermissionRequest pendingWebPerm;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean loaded;

    private final BroadcastReceiver quitReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            finishAndRemoveTask();
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "UnspecifiedRegisterReceiverFlag"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setTheme(R.style.AppTheme);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B0D17"));
        web = new StudioWebView(this);
        // limpa cache de disco do WebView para não servir CSS/JS antigos após atualização do APK
        web.clearCache(true);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        // o renderer do WebView é outro processo: sem isso o Android o rebaixa/congela quando o app sai da tela
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // splash enquanto o servidor sobe
        FrameLayout sp = new FrameLayout(this);
        sp.setBackgroundColor(Color.parseColor("#0B0D17"));
        ImageView img = new ImageView(this);
        img.setImageResource(R.drawable.splash);
        img.setScaleType(ImageView.ScaleType.FIT_CENTER);
        sp.addView(img, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        splashMsg = new TextView(this);
        splashMsg.setTextColor(Color.parseColor("#B8B5D6"));
        splashMsg.setTextSize(13);
        splashMsg.setText(I18n.t(MainActivity.this, "Iniciando o estúdio…", "Starting the studio…", "Iniciando el estudio…"));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = android.view.Gravity.BOTTOM | android.view.Gravity.CENTER_HORIZONTAL;
        lp.bottomMargin = (int) (36 * getResources().getDisplayMetrics().density);
        sp.addView(splashMsg, lp);
        splash = sp;
        root.addView(sp, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        immersive();

        WebView.setWebContentsDebuggingEnabled(true); // chrome://inspect para diagnóstico
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(false); // tráfego 100% loopback dispensa IPC com Play Services
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100); // o layout responsivo já se ajusta; a escala de fonte do sistema quebraria as barras
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " CastDeckAndroid/1.0");
        web.setBackgroundColor(Color.parseColor("#0B0D17"));
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String host = u.getHost();
                if ("127.0.0.1".equals(host) || "localhost".equals(host)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (splash.getVisibility() == View.VISIBLE) {
                    splash.animate().alpha(0f).setDuration(350).withEndAction(() -> splash.setVisibility(View.GONE)).start();
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest req) {
                runOnUiThread(() -> {
                    String host = req.getOrigin() != null ? req.getOrigin().getHost() : "";
                    if (!"127.0.0.1".equals(host) && !"localhost".equals(host)) {
                        req.deny();
                        return;
                    }
                    if (hasMediaPerms()) req.grant(req.getResources());
                    else {
                        pendingWebPerm = req;
                        requestPermissions(new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, REQ_PERMS);
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    Intent i = p.createIntent();
                    if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(i, REQ_FILE);
                } catch (Exception e) {
                    fileCb = null;
                    Toast.makeText(MainActivity.this, I18n.t(MainActivity.this, "Nenhum seletor de arquivos disponível", "No file picker available", "No hay selector de archivos disponible"), Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("CastDeck.Web", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        web.setDownloadListener((url, ua, cd, mime, len) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
        });

        IntentFilter f = new IntentFilter(ServerService.ACTION_QUIT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(quitReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(quitReceiver, f);

        askPermissionsThenStart();
    }

    private boolean hasMediaPerms() {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void askPermissionsThenStart() {
        List<String> want = new ArrayList<>();
        want.add(Manifest.permission.CAMERA);
        want.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33) want.add(Manifest.permission.POST_NOTIFICATIONS);
        if (Build.VERSION.SDK_INT <= 28) want.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        List<String> missing = new ArrayList<>();
        for (String p : want) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        if (missing.isEmpty()) startServerAndLoad();
        else requestPermissions(missing.toArray(new String[0]), REQ_PERMS);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code != REQ_PERMS) return;
        if (pendingWebPerm != null) {
            PermissionRequest r = pendingWebPerm;
            pendingWebPerm = null;
            if (hasMediaPerms()) r.grant(r.getResources());
            else r.deny();
        }
        if (!hasMediaPerms()) Toast.makeText(this, I18n.t(this, "Sem câmera/microfone o estúdio funciona só com mídias e convidados.", "Without camera/microphone the studio works only with media and guests.", "Sin cámara/micrófono el estudio funciona solo con medios e invitados."), Toast.LENGTH_LONG).show();
        startServerAndLoad();
    }

    private void startServerAndLoad() {
        if (loaded) return;
        loaded = true;
        ServerService.start(this);
        new Thread(() -> {
            long until = System.currentTimeMillis() + 20000;
            boolean up = false;
            while (System.currentTimeMillis() < until) {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(HOME + "api/health").openConnection();
                    c.setConnectTimeout(500);
                    c.setReadTimeout(1000);
                    if (c.getResponseCode() == 200) {
                        up = true;
                        c.disconnect();
                        break;
                    }
                    c.disconnect();
                } catch (Exception ignored) {
                }
                try {
                    Thread.sleep(150);
                } catch (InterruptedException e) {
                    return;
                }
            }
            boolean ok = up;
            ui.post(() -> {
                if (ok) web.loadUrl(HOME);
                else splashMsg.setText(I18n.t(MainActivity.this, "Não foi possível iniciar o servidor local (porta " + LocalServer.HTTP_PORT + " ocupada?). Feche e abra o app.", "Could not start the local server (port " + LocalServer.HTTP_PORT + " in use?). Close and reopen the app.", "No se pudo iniciar el servidor local (¿puerto " + LocalServer.HTTP_PORT + " ocupado?). Cierra y abre la app."));
            });
        }, "wait-server").start();
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);
        if (req == REQ_FILE && fileCb != null) {
            Uri[] uris = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    uris = new Uri[n];
                    for (int i = 0; i < n; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    uris = new Uri[]{data.getData()};
                }
            }
            fileCb.onReceiveValue(uris);
            fileCb = null;
        }
    }

    /** Samsung DeX (modo desktop) */
    private boolean isDex() {
        try {
            Configuration cfg = getResources().getConfiguration();
            Class<?> c = cfg.getClass();
            return c.getField("SEM_DESKTOP_MODE_ENABLED").getInt(c) == c.getField("semDesktopModeEnabled").getInt(cfg);
        } catch (Throwable e) {
            return false;
        }
    }

    /** tela cheia só no celular; no DeX e em janelas (multi-janela/janela livre) as barras do sistema ficam visíveis */
    private void immersive() {
        boolean windowed = isDex() || isInMultiWindowMode()
                || (getResources().getConfiguration().uiMode & Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_DESK;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                if (windowed) {
                    c.show(WindowInsets.Type.systemBars());
                } else {
                    c.hide(WindowInsets.Type.systemBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(windowed ? View.SYSTEM_UI_FLAG_VISIBLE
                    : View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration cfg) {
        super.onConfigurationChanged(cfg); // girar, redimensionar ou entrar no DeX: o WebView só relayouta
        immersive();
    }

    @Override
    public void onMultiWindowModeChanged(boolean inMultiWindow, Configuration cfg) {
        super.onMultiWindowModeChanged(inMultiWindow, cfg);
        immersive();
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) immersive();
    }

    @Override
    public void onBackPressed() {
        // 1º fecha a gaveta do painel (celular); depois volta a página; por fim só minimiza
        web.evaluateJavascript("(function(){var s=document.querySelector('.studio.panel-open');if(s){s.classList.remove('panel-open');return 1}return 0})()", r -> {
            if ("1".equals(r)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true); // mantém o estúdio e as transmissões rodando
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        // não pausa o WebView: a composição e a transmissão continuam enquanto possível
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(quitReceiver);
        } catch (Exception ignored) {
        }
        web.destroy();
        super.onDestroy();
    }

    /**
     * WebView que nunca se declara oculto ao Chromium: com o app em segundo plano (Home, outro app,
     * tela apagada) a página do estúdio continua com timers, WebRTC, mixagem e composição rodando.
     * Sem isso o host congela, não responde ao convidado e o watchdog de 15s fica reconectando em loop.
     */
    static class StudioWebView extends WebView {
        StudioWebView(Context c) {
            super(c);
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }

        @Override
        protected void onVisibilityChanged(View changed, int visibility) {
            super.onVisibilityChanged(changed, View.VISIBLE);
        }
    }
}
