package com.castdeck.studio;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.graphics.YuvImage;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.util.Log;

import com.jiangdg.ausbc.MultiCameraClient;
import com.jiangdg.ausbc.callback.ICameraStateCallBack;
import com.jiangdg.ausbc.callback.IDeviceConnectCallBack;
import com.jiangdg.ausbc.callback.IPreviewDataCallBack;
import com.jiangdg.ausbc.camera.CameraUVC;
import com.jiangdg.ausbc.camera.bean.CameraRequest;
import com.jiangdg.ausbc.encode.audio.AudioStrategyUAC;
import com.jiangdg.ausbc.encode.bean.RawData;
import com.jiangdg.usb.USBMonitor;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Ponte UVC nativa para o WebView.
 *
 * O WebView do Android não enxerga webcams USB pelo getUserMedia. A AUSBC abre o
 * dispositivo UVC, recebe NV21 e esta classe publica JPEGs em um stream MJPEG local.
 * O áudio UAC fica para a fase seguinte; no MVP o microfone do aparelho continua no mixer.
 */
public class UvcManager {
    private static final String TAG = "CastDeckUVC";
    private static final int DEFAULT_W = 1280;
    private static final int DEFAULT_H = 720;
    private static final int JPEG_QUALITY = 68;

    private final Context ctx;
    private final UsbManager usbManager;
    private final MultiCameraClient client;
    private final Map<String, UsbDevice> devices = new LinkedHashMap<>();
    private final ExecutorService encoder = Executors.newSingleThreadExecutor();
    private final Object frameLock = new Object();

    private CameraUVC camera;
    private SurfaceTexture surfaceTexture;
    private USBMonitor.UsbControlBlock pendingBlock;
    private UsbDevice pendingDevice;
    private String state = "idle";
    private String error = "";
    private String openedId = "";
    private String openedName = "";
    private int previewWidth = DEFAULT_W;
    private int previewHeight = DEFAULT_H;
    private volatile int fps;
    private volatile long lastFrameNs;
    private volatile byte[] latestJpeg;
    private long frameId;
    private boolean encoding;
    private boolean registered;
    private AudioStrategyUAC uac;
    private Thread audioThread;
    private final Object audioLock = new Object();
    private final ArrayDeque<byte[]> audioQueue = new ArrayDeque<>();
    private volatile boolean audioRun;
    private volatile int audioRate = 48000;
    private volatile int audioChannels = 2;
    private volatile int audioBits = 16;
    private USBMonitor.UsbControlBlock currentBlock;
    private volatile boolean autoOffer;
    private volatile String offeredId;
    private int offerSeq;
    private UsbDevice currentDevice;
    private int retryCount;

    public UvcManager(Context context) {
        this.ctx = context.getApplicationContext();
        this.usbManager = (UsbManager) this.ctx.getSystemService(Context.USB_SERVICE);
        this.client = new MultiCameraClient(this.ctx, new IDeviceConnectCallBack() {
            @Override
            public void onAttachDev(UsbDevice device) {
                refresh();
                maybeOffer(device);
            }

            @Override
            public void onDetachDec(UsbDevice device) {
                if (device != null && device.getDeviceName().equals(openedId)) {
                    autoOffer = false;
                    offeredId = null;
                    closeCamera();
                    state = "disconnected";
                    error = "Câmera USB desconectada";
                }
                refresh();
            }

            @Override
            public void onConnectDev(UsbDevice device, USBMonitor.UsbControlBlock ctrlBlock) {
                if (device == null || ctrlBlock == null) return;
                pendingBlock = ctrlBlock;
                pendingDevice = device;
                currentBlock = ctrlBlock;
                openWithBlock(device, ctrlBlock);
            }

            @Override
            public void onDisConnectDec(UsbDevice device, USBMonitor.UsbControlBlock ctrlBlock) {
                if (device != null && device.getDeviceName().equals(openedId)) {
                    closeCamera();
                    state = "disconnected";
                    error = "Câmera USB desconectada";
                }
            }

            @Override
            public void onCancelDev(UsbDevice device) {
                autoOffer = false;
                offeredId = null;
                state = "error";
                error = "Permissão USB não concedida";
            }
        });
    }

    public synchronized void start() {
        if (registered) return;
        try {
            prepareUsbMonitor();
            client.register();
            registered = true;
            refresh();
        } catch (Exception e) {
            error = e.getMessage() == null ? "USB indisponível" : e.getMessage();
            state = "error";
            Log.w(TAG, "start", e);
        }
    }

    /**
     * A AUSBC 3.3.3 é antiga para o Android 14+: ela cria PendingIntent mutável e
     * registra receiver sem flag. Preparamos o monitor com as APIs atuais e deixamos
     * o register() da biblioteca apenas concluir o estado.
     */
    private void prepareUsbMonitor() throws Exception {
        Field mf = MultiCameraClient.class.getDeclaredField("mUsbMonitor");
        mf.setAccessible(true);
        Object monitor = mf.get(client);
        if (monitor == null) return;
        Field af = monitor.getClass().getDeclaredField("ACTION_USB_PERMISSION");
        af.setAccessible(true);
        String action = (String) af.get(monitor);
        Field pf = monitor.getClass().getDeclaredField("mPermissionIntent");
        pf.setAccessible(true);
        // MUTABLE + Intent explícito: o Android precisa anexar o UsbDevice ao resultado.
        // AUSBC usava MUTABLE com Intent implícito, proibido no Android 14+.
        Intent pi = new Intent(action).setPackage(ctx.getPackageName());
        int flags = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent pending = PendingIntent.getBroadcast(ctx, 0, pi, flags);
        pf.set(monitor, pending);
        Field rf = monitor.getClass().getDeclaredField("mUsbReceiver");
        rf.setAccessible(true);
        BroadcastReceiver receiver = (BroadcastReceiver) rf.get(monitor);
        IntentFilter filter = new IntentFilter(action);
        filter.addAction("android.hardware.usb.action.USB_DEVICE_ATTACHED");
        filter.addAction("android.hardware.usb.action.USB_DEVICE_DETACHED");
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        else ctx.registerReceiver(receiver, filter);
        // register() da AUSBC não posta a checagem se o PendingIntent já existe; fazemos aqui.
        Field hf = monitor.getClass().getDeclaredField("mAsyncHandler");
        hf.setAccessible(true);
        Handler handler = (Handler) hf.get(monitor);
        Field cf = monitor.getClass().getDeclaredField("mDeviceCheckRunnable");
        cf.setAccessible(true);
        Runnable check = (Runnable) cf.get(monitor);
        handler.postDelayed(check, 1000);
        Log.i(TAG, "USBMonitor preparado para Android 14+");
    }

    public synchronized void stop() {
        closeCamera();
        if (registered) {
            try { client.unRegister(); } catch (Exception ignored) {}
            registered = false;
        }
        try { client.destroy(); } catch (Exception ignored) {}
        encoder.shutdownNow();
    }

    public synchronized void refresh() {
        devices.clear();
        try {
            // Enumera o UsbManager direto. A lista da AUSBC pode ficar vazia em alguns
            // aparelhos/hubs mesmo com a placa UVC presente.
            Map<String, UsbDevice> raw = usbManager.getDeviceList();
            if (raw != null) {
                for (UsbDevice d : raw.values()) {
                    if (isVideoDevice(d)) devices.put(d.getDeviceName(), d);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "refresh", e);
        }
    }

    /** UVC conectado: pede a autorização Android e marca a oferta para o WebView perguntar. */
    private synchronized void maybeOffer(UsbDevice device) {
        if (device == null || camera != null || !isVideoDevice(device)) return;
        // Apenas marca a oferta. A permissão é pedida quando o usuário confirma no WebView
        // (UsbManager.requestPermission funciona melhor a partir do gesto/UI do que do attach).
        autoOffer = true;
        offerSeq++;
        offeredId = device.getDeviceName() + "#" + offerSeq;
    }

    public synchronized void dismissOffer() {
        autoOffer = false;
        offeredId = null;
    }

    private static boolean isVideoDevice(UsbDevice d) {
        try {
            if (d.getDeviceClass() == UsbConstants.USB_CLASS_VIDEO) return true;
            for (int i = 0; i < d.getInterfaceCount(); i++) {
                UsbInterface it = d.getInterface(i);
                if (it != null && it.getInterfaceClass() == UsbConstants.USB_CLASS_VIDEO) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    public synchronized Map<String, Object> status() {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("available", registered);
        o.put("state", state);
        o.put("error", error);
        o.put("open", camera != null && "streaming".equals(state));
        o.put("device", openedName);
        o.put("width", previewWidth);
        o.put("height", previewHeight);
        o.put("fps", fps);
        o.put("offer", offeredId != null);
        o.put("offerId", offeredId == null ? "" : offeredId);
        o.put("frame", frameId);
        List<Map<String, Object>> list = new ArrayList<>();
        for (UsbDevice d : devices.values()) {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", d.getDeviceName());
            x.put("name", safeProduct(d));
            x.put("vendorId", d.getVendorId());
            x.put("productId", d.getProductId());
            list.add(x);
        }
        o.put("devices", list);
        return o;
    }

    public synchronized Map<String, Object> diagnostics() {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> all = new ArrayList<>();
        try {
            Map<String, UsbDevice> raw = usbManager.getDeviceList();
            if (raw != null) {
                for (UsbDevice d : raw.values()) {
                    Map<String, Object> x = new LinkedHashMap<>();
                    x.put("id", d.getDeviceName());
                    x.put("name", safeProduct(d));
                    x.put("vendorId", d.getVendorId());
                    x.put("productId", d.getProductId());
                    x.put("deviceClass", d.getDeviceClass());
                    List<Integer> classes = new ArrayList<>();
                    try {
                        for (int i = 0; i < d.getInterfaceCount(); i++) {
                            UsbInterface it = d.getInterface(i);
                            if (it != null) classes.add(it.getInterfaceClass());
                        }
                    } catch (Exception ignored) {}
                    x.put("interfaces", classes);
                    x.put("video", isVideoDevice(d));
                    all.add(x);
                }
            }
        } catch (Exception e) {
            out.put("error", e.getMessage() == null ? "USB indisponível" : e.getMessage());
        }
        out.put("usbDevices", all.size());
        out.put("devices", all);
        return out;
    }

    public synchronized List<Map<String, Object>> deviceList() {
        refresh();
        List<Map<String, Object>> list = new ArrayList<>();
        for (UsbDevice d : devices.values()) {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", d.getDeviceName());
            x.put("name", safeProduct(d));
            x.put("vendorId", d.getVendorId());
            x.put("productId", d.getProductId());
            list.add(x);
        }
        return list;
    }

    private static String safeProduct(UsbDevice d) {
        try {
            String p = d.getProductName();
            return p == null || p.isEmpty() ? "Câmera USB" : p;
        } catch (Exception e) {
            return "Câmera USB";
        }
    }

    public synchronized String open(String id, int width, int height, int fps) {
        if (id == null || id.isEmpty()) return "missing";
        refresh();
        UsbDevice device = devices.get(id);
        if (device == null) {
            state = "error";
            error = "Câmera USB não encontrada";
            return "missing";
        }
        // Abertura manual: não dispara a pergunta de "adicionar como fonte".
        autoOffer = false;
        offeredId = null;
        retryCount = 0;
        // Reabre para aplicar nova resolução/FPS sem derrubar o app.
        if (camera != null) closeCamera();
        openedId = id;
        openedName = safeProduct(device);
        previewWidth = width > 0 ? width : DEFAULT_W;
        previewHeight = height > 0 ? height : DEFAULT_H;
        this.fps = fps > 0 ? fps : 0;
        lastFrameNs = 0;
        error = "";
        state = "opening";
        try {
            if (!client.hasPermission(device)) {
                state = "permission";
                client.requestPermission(device);
                return "permission";
            }
            state = "opening";
            // Já autorizado: abre direto.
            // O ctrlBlock é entregue pelo callback onConnectDev.
            client.requestPermission(device);
            return "opening";
        } catch (Exception e) {
            state = "error";
            error = e.getMessage() == null ? "Falha ao abrir USB" : e.getMessage();
            Log.w(TAG, "open", e);
            return "error";
        }
    }

    private synchronized void openWithBlock(UsbDevice device, USBMonitor.UsbControlBlock block) {
        if (device == null || block == null) return;
        currentDevice = device;
        try {
            closeCamera();
            currentBlock = block; // closeCamera limpa o bloco; reata para o áudio UAC
            surfaceTexture = new SurfaceTexture(0);
            surfaceTexture.setDefaultBufferSize(previewWidth, previewHeight);
            camera = new CameraUVC(ctx, device);
            camera.setUsbControlBlock(block);
            camera.setCameraStateCallBack(new ICameraStateCallBack() {
                @Override
                public void onCameraState(MultiCameraClient.ICamera self, State code, String msg) {
                    if (code == State.OPENED) {
                        state = "streaming";
                        error = "";
                        retryCount = 0;
                        Log.i(TAG, "UVC streaming " + openedName + " " + previewWidth + "x" + previewHeight);
                    } else if (code == State.CLOSED) {
                        if (!"error".equals(state)) state = "closed";
                    } else if (code == State.ERROR) {
                        state = "error";
                        error = msg == null ? "Falha na câmera USB" : msg;
                        if (msg != null && msg.toLowerCase().contains("preview size") && retryCount < 3) {
                            final int[][] c = {{1280, 720}, {640, 480}, {1920, 1080}};
                            final int idx = Math.min(retryCount, c.length - 1);
                            retryCount++;
                            final UsbDevice dev = currentDevice;
                            final USBMonitor.UsbControlBlock blk = currentBlock;
                            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                                previewWidth = c[idx][0];
                                previewHeight = c[idx][1];
                                Log.i(TAG, "Reabrindo UVC com " + previewWidth + "x" + previewHeight);
                                openWithBlock(dev, blk);
                            }, 1000);
                        }
                    }
                }
            });
            camera.addPreviewDataCallBack(new IPreviewDataCallBack() {
                @Override
                public void onPreviewData(byte[] data, int width, int height, DataFormat format) {
                    encodeFrame(data, width, height);
                }
            });
            CameraRequest request = new CameraRequest.Builder()
                    .setPreviewWidth(previewWidth)
                    .setPreviewHeight(previewHeight)
                    .setRenderMode(CameraRequest.RenderMode.NORMAL)
                    .setRawPreviewData(true)
                    .setCaptureRawImage(true)
                    .setAudioSource(CameraRequest.AudioSource.NONE)
                    .create();
            camera.openCamera(surfaceTexture, request);
            state = "opening";
            error = "";
        } catch (Exception e) {
            state = "error";
            error = e.getMessage() == null ? "Falha ao abrir câmera USB" : e.getMessage();
            Log.w(TAG, "openWithBlock", e);
            closeCamera();
        }
    }

    private void encodeFrame(byte[] data, int width, int height) {
        if (data == null || width <= 0 || height <= 0) return;
        if (fps > 0) {
            long now = System.nanoTime();
            long gap = 1_000_000_000L / fps;
            if (now - lastFrameNs < gap) return;
            lastFrameNs = now;
        }
        synchronized (this) {
            if (encoding) return;
            encoding = true;
        }
        final byte[] copy = data.clone();
        encoder.execute(() -> {
            try {
                YuvImage yuv = new YuvImage(copy, ImageFormat.NV21, width, height, null);
                ByteArrayOutputStream out = new ByteArrayOutputStream(copy.length / 4);
                yuv.compressToJpeg(new Rect(0, 0, width, height), JPEG_QUALITY, out);
                byte[] jpeg = out.toByteArray();
                if (jpeg.length > 0) {
                    synchronized (frameLock) {
                        latestJpeg = jpeg;
                        previewWidth = width;
                        previewHeight = height;
                        frameId++;
                        frameLock.notifyAll();
                    }
                }
            } catch (Throwable e) {
                Log.w(TAG, "encodeFrame", e);
            } finally {
                synchronized (UvcManager.this) {
                    encoding = false;
                }
            }
        });
    }

    public synchronized void closeCamera() {
        stopAudio();
        currentBlock = null;
        CameraUVC c = camera;
        camera = null;
        if (c != null) {
            try { c.closeCamera(); } catch (Exception ignored) {}
        }
        SurfaceTexture st = surfaceTexture;
        surfaceTexture = null;
        if (st != null) {
            try { st.release(); } catch (Exception ignored) {}
        }
        pendingBlock = null;
        pendingDevice = null;
        openedId = "";
        openedName = "";
        latestJpeg = null;
        state = "idle";
        synchronized (frameLock) {
            frameLock.notifyAll();
        }
    }

    public byte[] awaitFrame(long after) throws IOException {
        synchronized (frameLock) {
            long deadline = System.currentTimeMillis() + 8000;
            while (true) {
                if (latestJpeg != null && frameId > after) return latestJpeg;
                if (camera == null && "idle".equals(state)) throw new IOException("Câmera USB fechada");
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) throw new IOException("Sem quadro da câmera USB");
                try { frameLock.wait(Math.min(left, 1000)); } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("interrompido");
                }
            }
        }
    }

    public long frameId() {
        return frameId;
    }

    public byte[] latestJpeg() {
        return latestJpeg;
    }

    // ---- áudio UAC ---------------------------------------------------------
    public synchronized void startAudio() throws IOException {
        if (audioRun) return;
        if (currentBlock == null) throw new IOException("Câmera USB não conectada para áudio");
        try {
            uac = new AudioStrategyUAC(currentBlock);
            uac.initAudioRecord();
            audioRate = uac.getSampleRate();
            audioChannels = Math.max(1, uac.getChannelCount());
            audioBits = uac.getAudioFormat() == AudioFormat.ENCODING_PCM_8BIT ? 8 : 16;
            uac.startRecording();
            Log.i(TAG, "UAC audio " + audioRate + "Hz " + audioChannels + "ch " + audioBits + "bit");
            audioRun = true;
            synchronized (audioLock) { audioQueue.clear(); }
            audioThread = new Thread(() -> {
                while (audioRun) {
                    try {
                        RawData r = uac == null ? null : uac.read();
                        if (r != null && r.getData() != null && r.getSize() > 0) {
                            byte[] d = Arrays.copyOf(r.getData(), r.getSize());
                            synchronized (audioLock) {
                                if (audioQueue.size() > 80) audioQueue.pollFirst();
                                audioQueue.offerLast(d);
                                audioLock.notifyAll();
                            }
                        } else {
                            Thread.sleep(5);
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    } catch (Throwable e) {
                        Log.w(TAG, "audio read", e);
                        try { Thread.sleep(20); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                    }
                }
            }, "uvc-uac-audio");
            audioThread.start();
        } catch (Exception e) {
            stopAudio();
            throw new IOException("Áudio USB (UAC) indisponível: " + (e.getMessage() == null ? "dispositivo não expõe microfone" : e.getMessage()));
        }
    }

    public synchronized void stopAudio() {
        audioRun = false;
        AudioStrategyUAC a = uac;
        uac = null;
        if (a != null) {
            try { a.stopRecording(); } catch (Exception ignored) {}
            try { a.releaseAudioRecord(); } catch (Exception ignored) {}
        }
        if (audioThread != null) {
            audioThread.interrupt();
            audioThread = null;
        }
        synchronized (audioLock) {
            audioQueue.clear();
            audioLock.notifyAll();
        }
    }

    public int audioRate() { return audioRate; }
    public int audioChannels() { return audioChannels; }
    public int audioBits() { return audioBits; }

    public InputStream audioStream() throws IOException {
        startAudio();
        return new InputStream() {
            private byte[] buf;
            private int pos;
            private boolean closed;

            private boolean next() {
                synchronized (audioLock) {
                    long deadline = System.currentTimeMillis() + 10_000;
                    while (audioQueue.isEmpty()) {
                        if (!audioRun) return false;
                        long left = deadline - System.currentTimeMillis();
                        if (left <= 0) return false;
                        try { audioLock.wait(Math.min(left, 500)); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return false; }
                    }
                    buf = audioQueue.pollFirst();
                    pos = 0;
                    return buf != null;
                }
            }

            @Override
            public int read() throws IOException {
                if (pos >= (buf == null ? 0 : buf.length)) {
                    if (!next()) return -1;
                }
                return buf[pos++] & 0xff;
            }

            @Override
            public int read(byte[] b, int off, int len) throws IOException {
                if (pos >= (buf == null ? 0 : buf.length)) {
                    if (!next()) return -1;
                }
                int n = Math.min(len, buf.length - pos);
                System.arraycopy(buf, pos, b, off, n);
                pos += n;
                return n;
            }

            @Override
            public void close() {
                if (closed) return;
                closed = true;
                stopAudio();
            }
        };
    }

    /**
     * Stream multipart MJPEG consumido pelo <img> do WebView.
     */
    public InputStream mjpegStream() {
        return new InputStream() {
            private byte[] buf = new byte[0];
            private int pos;
            private long last = frameId();

            private void next() throws IOException {
                byte[] jpeg = awaitFrame(last);
                last = frameId();
                byte[] head = ("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + jpeg.length + "\r\n\r\n").getBytes("UTF-8");
                byte[] end = "\r\n".getBytes("UTF-8");
                buf = new byte[head.length + jpeg.length + end.length];
                System.arraycopy(head, 0, buf, 0, head.length);
                System.arraycopy(jpeg, 0, buf, head.length, jpeg.length);
                System.arraycopy(end, 0, buf, head.length + jpeg.length, end.length);
                pos = 0;
            }

            @Override
            public int read() throws IOException {
                if (pos >= buf.length) next();
                return buf[pos++] & 0xff;
            }

            @Override
            public int read(byte[] b, int off, int len) throws IOException {
                if (pos >= buf.length) next();
                int n = Math.min(len, buf.length - pos);
                System.arraycopy(buf, pos, b, off, n);
                pos += n;
                return n;
            }
        };
    }
}
