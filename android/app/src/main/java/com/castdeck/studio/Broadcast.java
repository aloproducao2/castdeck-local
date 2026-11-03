// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaScannerConnection;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Surface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Motor de transmissão do Android (substitui o FFmpeg do PC):
 *
 *   WebView (canvas + mixer) --MediaRecorder/webm--> WebSocket /ingest
 *     --> WebmDemuxer --> decodificador MediaCodec (H.264/VP8/VP9) --Surface--> encoder H.264 (hardware)
 *                     --> decodificador Opus --PCM--> encoder AAC
 *         |--> RTMP/RTMPS destino 1, destino 2... (cada um com reconexão própria)
 *         '--> MP4 (MediaMuxer) em Filmes/CastDeck
 */
public class Broadcast {
    private static final String TAG = "CastDeck.Broadcast";
    static final int MAX_RESTARTS = 20;
    static final long MAX_OUTPUT_BUFFER = 24L * 1024 * 1024;

    public static final JSONObject PRESETS = new JSONObject();

    static {
        try {
            PRESETS.put("720p30", preset(1280, 720, 30, 4500, 160, false));
            PRESETS.put("720p60", preset(1280, 720, 60, 6000, 160, false));
            PRESETS.put("1080p30", preset(1920, 1080, 30, 6000, 160, false));
            PRESETS.put("1080p60", preset(1920, 1080, 60, 9000, 192, false));
            PRESETS.put("480p30", preset(854, 480, 30, 2000, 128, false));
            PRESETS.put("v720p30", preset(720, 1280, 30, 3500, 128, true));
            PRESETS.put("v1080p30", preset(1080, 1920, 30, 5500, 160, true));
        } catch (Exception ignored) {
        }
    }

    private static JSONObject preset(int w, int h, int fps, int v, int a, boolean vert) throws Exception {
        JSONObject p = new JSONObject();
        p.put("width", w).put("height", h).put("fps", fps).put("videoKbps", v).put("audioKbps", a);
        if (vert) p.put("vertical", true);
        return p;
    }

    public interface Events {
        void onStatus();

        void onError(String message);

        void onEnded();
    }

    static class Packet {
        final boolean video, key;
        final byte[] data;
        final long ptsUs;

        Packet(boolean video, byte[] data, long ptsUs, boolean key) {
            this.video = video;
            this.data = data;
            this.ptsUs = ptsUs;
            this.key = key;
        }
    }

    // ---------- configuração ----------
    final Context ctx;
    final JSONObject studio;
    final String presetId;
    final int width, height, fps, vkbps, akbps;
    final boolean vertical;
    final File recDir;
    final List<Output> outputs = new ArrayList<>();
    final long startedAt = System.currentTimeMillis();
    Events events;
    String error;

    // ---------- pipeline (tudo roda na thread do handler) ----------
    private HandlerThread thread;
    private Handler h;
    private final WebmDemuxer demux;
    private WebmDemuxer.Track vTrack, aTrack;
    private int avcLengthSize;
    private MediaCodec vdec, venc, adec, aenc;
    private Surface encSurface;
    private final ArrayDeque<Packet> vIn = new ArrayDeque<>(), aIn = new ArrayDeque<>();
    private final ArrayDeque<Integer> vdecFree = new ArrayDeque<>(), adecFree = new ArrayDeque<>(), aencFree = new ArrayDeque<>();
    private final ArrayDeque<byte[]> pcm = new ArrayDeque<>();
    private int pcmHeadOff;
    private boolean pcmEos, aacEosQueued, vEosPending, aEosPending, vEosQueued, aEosQueued;
    private long audioBaseUs = -1, samplesIn, samplesDecoded;
    private int aRate = 48000, aCh = 2;
    private long lastRenderPts = -1;
    volatile MediaFormat videoFormat, audioFormat;
    volatile byte[] sps, pps, asc;
    volatile boolean hasAudio;
    private boolean videoDone, audioDone, stopping, finished;

    // ---------- estatísticas ----------
    final AtomicLong inBytes = new AtomicLong(), outBytes = new AtomicLong(), framesOut = new AtomicLong();
    private long lastStatAt = System.currentTimeMillis(), lastStatFrames, lastStatBytes;
    private double fpsNow, kbpsNow;

    public Broadcast(Context ctx, JSONObject studio, List<JSONObject> destinations, boolean record, String presetIdIn, boolean vertical, File recDir) throws Exception {
        this.ctx = ctx;
        this.studio = studio;
        this.vertical = vertical;
        this.recDir = recDir;
        JSONObject p = PRESETS.optJSONObject(presetIdIn == null ? "" : presetIdIn);
        boolean ok = p != null && p.optBoolean("vertical") == vertical;
        this.presetId = ok ? presetIdIn : (vertical ? "v720p30" : "720p30");
        p = PRESETS.getJSONObject(presetId);
        width = p.getInt("width");
        height = p.getInt("height");
        fps = p.getInt("fps");
        vkbps = p.getInt("videoKbps");
        akbps = p.getInt("audioKbps");

        for (JSONObject d : destinations) {
            String url = buildRtmpUrl(d);
            if (!url.toLowerCase(Locale.ROOT).matches("^rtmps?://.*")) continue;
            outputs.add(new RtmpOutput(d.optString("id"), d.optString("name", "Destino"), url));
        }
        if (record) {
            recDir.mkdirs();
            String safe = studio.optString("name", "estudio").replaceAll("[^\\w\\- ]+", "").trim().replaceAll("\\s+", "-");
            if (safe.isEmpty()) safe = "estudio";
            String ts = new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(new Date());
            File f = new File(recDir, safe + "_" + ts + (vertical ? "_vertical" : "") + ".mp4");
            outputs.add(new RecordOutput(vertical ? "Gravação local (vertical)" : "Gravação local", f));
        }
        if (outputs.isEmpty()) throw new Exception("Nenhum destino válido nem gravação selecionados.");
        demux = new WebmDemuxer(new WebmDemuxer.Listener() {
            @Override
            public void onTracks(List<WebmDemuxer.Track> tracks) {
                setupCodecs(tracks);
            }

            @Override
            public void onFrame(WebmDemuxer.Track t, long ptsUs, boolean key, byte[] data, int off, int len) {
                onDemuxedFrame(t, ptsUs, key, data, off, len);
            }
        });
    }

    static String buildRtmpUrl(JSONObject d) {
        String base = d.optString("url", "").trim();
        String key = d.optString("key", "").trim();
        if (key.isEmpty()) return base;
        return base.replaceAll("/+$", "") + "/" + key.replaceAll("^/+", "");
    }

    public void start() {
        thread = new HandlerThread("ingest-" + studio.optString("id"));
        thread.start();
        h = new Handler(thread.getLooper());
        for (Output o : outputs) o.start();
    }

    public void feed(byte[] chunk) {
        inBytes.addAndGet(chunk.length);
        h.post(() -> {
            if (finished) return;
            try {
                demux.feed(chunk, 0, chunk.length);
            } catch (Exception e) {
                fail("Falha ao ler o vídeo do estúdio: " + e.getMessage());
            }
        });
    }

    public void stop() {
        if (h == null) return;
        h.post(this::beginStop);
    }

    public void addRecord() {
        if (h == null) return;
        h.post(() -> {
            for (Output o : outputs) {
                if (o instanceof RecordOutput && !"stopped".equals(o.state) && !"failed".equals(o.state)) return;
            }
            try {
                if (recDir != null) recDir.mkdirs();
                String safe = studio.optString("name", "estudio").replaceAll("[^\\w\\- ]+", "").trim().replaceAll("\\s+", "-");
                if (safe.isEmpty()) safe = "estudio";
                String ts = new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(new Date());
                File f = new File(recDir, safe + "_" + ts + (vertical ? "_vertical" : "") + ".mp4");
                RecordOutput ro = new RecordOutput(vertical ? "Gravação local (vertical)" : "Gravação local", f);
                outputs.add(ro);
                ro.start();
                Log.i(TAG, "gravação iniciada dinamicamente: " + f.getName());
                emitStatus();
            } catch (Exception e) {
                Log.e(TAG, "erro ao iniciar gravação dinâmica: " + e.getMessage());
            }
        });
    }

    public void stopRecord() {
        if (h == null) return;
        h.post(() -> {
            Iterator<Output> it = outputs.iterator();
            while (it.hasNext()) {
                Output o = it.next();
                if (o instanceof RecordOutput) {
                    o.end();
                    it.remove();
                }
            }
            emitStatus();
            if (outputs.isEmpty()) beginStop();
        });
    }

    public void addDestinations(List<JSONObject> destinations) {
        if (h == null) return;
        h.post(() -> {
            int added = 0;
            for (JSONObject d : destinations) {
                String id = d.optString("id");
                boolean exists = false;
                for (Output o : outputs) {
                    if (o.id.equals(id) && !"stopped".equals(o.state)) { exists = true; break; }
                }
                if (exists) continue;
                String url = buildRtmpUrl(d);
                if (!url.toLowerCase(Locale.ROOT).matches("^rtmps?://.*")) continue;
                RtmpOutput ro = new RtmpOutput(id, d.optString("name", "Destino"), url);
                outputs.add(ro);
                ro.start();
                added++;
            }
            if (added > 0) {
                Log.i(TAG, added + " destino(s) iniciado(s) dinamicamente");
                emitStatus();
            }
        });
    }

    public void stopDestinations() {
        if (h == null) return;
        h.post(() -> {
            Iterator<Output> it = outputs.iterator();
            while (it.hasNext()) {
                Output o = it.next();
                if (o instanceof RtmpOutput) {
                    o.end();
                    it.remove();
                }
            }
            emitStatus();
            if (outputs.isEmpty()) beginStop();
        });
    }

    // ---------- codecs ----------
    private static String videoMime(String codec) {
        if (codec.startsWith("V_MPEG4/ISO/AVC")) return MediaFormat.MIMETYPE_VIDEO_AVC;
        if (codec.equals("V_VP8")) return MediaFormat.MIMETYPE_VIDEO_VP8;
        if (codec.equals("V_VP9")) return MediaFormat.MIMETYPE_VIDEO_VP9;
        if (codec.equals("V_AV1")) return "video/av01";
        if (codec.startsWith("V_MPEGH/ISO/HEVC")) return MediaFormat.MIMETYPE_VIDEO_HEVC;
        return null;
    }

    private void setupCodecs(List<WebmDemuxer.Track> tracks) {
        for (WebmDemuxer.Track t : tracks) {
            if (vTrack == null && t.isVideo()) vTrack = t;
            else if (aTrack == null && t.isAudio()) aTrack = t;
        }
        try {
            if (vTrack == null) throw new Exception("o estúdio não enviou vídeo");
            setupVideo(vTrack);
            if (aTrack != null && aTrack.codec.equals("A_OPUS")) {
                hasAudio = true;
                setupAudioDecoder(aTrack);
            } else if (aTrack != null) {
                Log.w(TAG, "áudio não suportado: " + aTrack.codec);
            }
            Log.i(TAG, "pipeline: " + vTrack.codec + " " + vTrack.width + "x" + vTrack.height + (aTrack != null ? " + " + aTrack.codec : ""));
        } catch (Exception e) {
            fail("Falha ao preparar o codificador: " + e.getMessage());
        }
    }

    private void setupVideo(WebmDemuxer.Track t) throws Exception {
        String mime = videoMime(t.codec);
        if (mime == null) throw new Exception("codec de vídeo não suportado: " + t.codec);
        int w = (t.width > 0 ? t.width : width) & ~1;
        int hgt = (t.height > 0 ? t.height : height) & ~1;

        venc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
        MediaFormat f = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, hgt);
        f.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        f.setInteger(MediaFormat.KEY_BIT_RATE, vkbps * 1000);
        f.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
        f.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2); // GOP de 2 s (recomendado por YouTube/Twitch)
        f.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000L); // cena parada continua gerando quadros
        f.setInteger(MediaFormat.KEY_PRIORITY, 0); // tempo real: prioridade máxima no escalonador de hardware
        try {
            MediaCodecInfo.EncoderCapabilities caps = venc.getCodecInfo().getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC).getEncoderCapabilities();
            if (caps.isBitrateModeSupported(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR))
                f.setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR);
        } catch (Exception ignored) {
        }
        venc.setCallback(new MediaCodec.Callback() {
            @Override
            public void onInputBufferAvailable(MediaCodec c, int i) {
            }

            @Override
            public void onOutputBufferAvailable(MediaCodec c, int i, MediaCodec.BufferInfo info) {
                onVideoEncoded(c, i, info);
            }

            @Override
            public void onError(MediaCodec c, MediaCodec.CodecException e) {
                fail("Encoder de vídeo: " + e.getDiagnosticInfo());
            }

            @Override
            public void onOutputFormatChanged(MediaCodec c, MediaFormat fmt) {
                videoFormat = fmt;
                ByteBuffer c0 = fmt.getByteBuffer("csd-0"), c1 = fmt.getByteBuffer("csd-1");
                if (c0 != null) sps = stripStart(toBytes(c0));
                if (c1 != null) pps = stripStart(toBytes(c1));
            }
        }, h);
        venc.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        encSurface = venc.createInputSurface();
        venc.start();

        vdec = MediaCodec.createDecoderByType(mime);
        MediaFormat df = MediaFormat.createVideoFormat(mime, w, hgt);
        df.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, Math.max(w * hgt * 3 / 2, 2 * 1024 * 1024));
        df.setInteger(MediaFormat.KEY_PRIORITY, 0); // tempo real
        if (mime.equals(MediaFormat.MIMETYPE_VIDEO_AVC)) {
            Object[] avc = H264.parseAvcC(t.codecPrivate);
            if (avc != null) {
                avcLengthSize = (Integer) avc[2];
                if (((byte[]) avc[0]).length > 0) df.setByteBuffer("csd-0", ByteBuffer.wrap((byte[]) avc[0]));
                if (((byte[]) avc[1]).length > 0) df.setByteBuffer("csd-1", ByteBuffer.wrap((byte[]) avc[1]));
            }
        }
        vdec.setCallback(new MediaCodec.Callback() {
            @Override
            public void onInputBufferAvailable(MediaCodec c, int i) {
                vdecFree.add(i);
                feedVideo();
            }

            @Override
            public void onOutputBufferAvailable(MediaCodec c, int i, MediaCodec.BufferInfo info) {
                boolean eos = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                try {
                    long pts = info.presentationTimeUs;
                    if ((info.size > 0 || !eos) && pts > lastRenderPts) {
                        lastRenderPts = pts;
                        c.releaseOutputBuffer(i, true); // timestamp do quadro = presentationTimeUs
                    } else {
                        c.releaseOutputBuffer(i, false);
                    }
                    if (eos) venc.signalEndOfInputStream();
                } catch (Exception e) {
                    Log.w(TAG, "render", e);
                }
            }

            @Override
            public void onError(MediaCodec c, MediaCodec.CodecException e) {
                fail("Decodificador de vídeo: " + e.getDiagnosticInfo());
            }

            @Override
            public void onOutputFormatChanged(MediaCodec c, MediaFormat fmt) {
            }
        }, h);
        vdec.configure(df, encSurface, null, 0);
        vdec.start();
    }

    private void setupAudioDecoder(WebmDemuxer.Track t) throws Exception {
        aCh = Math.max(1, Math.min(2, t.channels));
        aRate = 48000;
        adec = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS);
        MediaFormat f = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, 48000, t.channels);
        f.setInteger(MediaFormat.KEY_PRIORITY, 0); // tempo real
        byte[] head = t.codecPrivate;
        if (head == null || head.length < 19) {
            head = new byte[19];
            System.arraycopy("OpusHead".getBytes(), 0, head, 0, 8);
            head[8] = 1;
            head[9] = (byte) t.channels;
            head[10] = (byte) 0x38; // pre-skip 312
            head[11] = 0x01;
            head[12] = (byte) 0x80; // 48000
            head[13] = (byte) 0xBB;
        }
        long preskip = (head[10] & 0xff) | ((head[11] & 0xff) << 8);
        long delayNs = t.codecDelayNs > 0 ? t.codecDelayNs : preskip * 1_000_000_000L / 48000;
        long prerollNs = t.seekPreRollNs > 0 ? t.seekPreRollNs : 80_000_000L;
        f.setByteBuffer("csd-0", ByteBuffer.wrap(head));
        f.setByteBuffer("csd-1", ByteBuffer.allocate(8).order(ByteOrder.nativeOrder()).putLong(0, delayNs));
        f.setByteBuffer("csd-2", ByteBuffer.allocate(8).order(ByteOrder.nativeOrder()).putLong(0, prerollNs));
        adec.setCallback(new MediaCodec.Callback() {
            @Override
            public void onInputBufferAvailable(MediaCodec c, int i) {
                adecFree.add(i);
                feedAudio();
            }

            @Override
            public void onOutputBufferAvailable(MediaCodec c, int i, MediaCodec.BufferInfo info) {
                try {
                    if (info.size > 0) {
                        ByteBuffer b = c.getOutputBuffer(i);
                        byte[] d = new byte[info.size];
                        b.position(info.offset);
                        b.get(d);
                        int frameBytes = 2 * aCh;
                        long expected = audioBaseUs + samplesDecoded * 1_000_000L / aRate;
                        if (audioBaseUs < 0) audioBaseUs = info.presentationTimeUs;
                        else if (info.presentationTimeUs - expected > 250_000) audioBaseUs += info.presentationTimeUs - expected; // buraco no áudio
                        samplesDecoded += d.length / frameBytes;
                        pcm.add(d);
                    }
                    c.releaseOutputBuffer(i, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) pcmEos = true;
                    feedAac();
                } catch (Exception e) {
                    Log.w(TAG, "pcm", e);
                }
            }

            @Override
            public void onError(MediaCodec c, MediaCodec.CodecException e) {
                fail("Decodificador de áudio: " + e.getDiagnosticInfo());
            }

            @Override
            public void onOutputFormatChanged(MediaCodec c, MediaFormat fmt) {
                if (fmt.containsKey(MediaFormat.KEY_SAMPLE_RATE)) aRate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                if (fmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) aCh = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                if (aenc == null) {
                    try {
                        setupAac();
                    } catch (Exception e) {
                        fail("Encoder AAC: " + e.getMessage());
                    }
                }
            }
        }, h);
        adec.configure(f, null, null, 0);
        adec.start();
    }

    private void setupAac() throws Exception {
        aenc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
        MediaFormat f = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, aRate, aCh);
        f.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        f.setInteger(MediaFormat.KEY_BIT_RATE, akbps * 1000);
        f.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 64 * 1024);
        f.setInteger(MediaFormat.KEY_PRIORITY, 0); // tempo real
        aenc.setCallback(new MediaCodec.Callback() {
            @Override
            public void onInputBufferAvailable(MediaCodec c, int i) {
                aencFree.add(i);
                feedAac();
            }

            @Override
            public void onOutputBufferAvailable(MediaCodec c, int i, MediaCodec.BufferInfo info) {
                try {
                    ByteBuffer b = c.getOutputBuffer(i);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                        if (asc == null && info.size > 0) {
                            byte[] d = new byte[info.size];
                            b.position(info.offset);
                            b.get(d);
                            asc = d;
                        }
                    } else if (info.size > 0) {
                        byte[] d = new byte[info.size];
                        b.position(info.offset);
                        b.get(d);
                        dispatch(new Packet(false, d, info.presentationTimeUs, true));
                    }
                    c.releaseOutputBuffer(i, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        audioDone = true;
                        checkDone();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "aac", e);
                }
            }

            @Override
            public void onError(MediaCodec c, MediaCodec.CodecException e) {
                fail("Encoder AAC: " + e.getDiagnosticInfo());
            }

            @Override
            public void onOutputFormatChanged(MediaCodec c, MediaFormat fmt) {
                audioFormat = fmt;
                ByteBuffer c0 = fmt.getByteBuffer("csd-0");
                if (c0 != null) asc = toBytes(c0);
            }
        }, h);
        aenc.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        aenc.start();
    }

    private void onDemuxedFrame(WebmDemuxer.Track t, long ptsUs, boolean key, byte[] data, int off, int len) {
        if (stopping) return;
        if (t == vTrack && vdec != null) {
            byte[] d;
            if (MediaFormat.MIMETYPE_VIDEO_AVC.equals(videoMime(t.codec)) && !H264.isAnnexB(data, off, len)) {
                d = H264.avccToAnnexB(data, off, len, avcLengthSize > 0 ? avcLengthSize : 4);
            } else {
                d = java.util.Arrays.copyOfRange(data, off, off + len);
            }
            if (vIn.size() > 240) vIn.poll(); // decodificador travado: não acumula memória
            vIn.add(new Packet(true, d, ptsUs, key));
            feedVideo();
        } else if (t == aTrack && adec != null) {
            if (aIn.size() > 500) aIn.poll();
            aIn.add(new Packet(false, java.util.Arrays.copyOfRange(data, off, off + len), ptsUs, true));
            feedAudio();
        }
    }

    private void feedVideo() {
        if (vdec == null) return;
        try {
            while (!vdecFree.isEmpty() && !vIn.isEmpty()) {
                int i = vdecFree.poll();
                Packet p = vIn.poll();
                ByteBuffer b = vdec.getInputBuffer(i);
                b.clear();
                int n = Math.min(b.remaining(), p.data.length);
                b.put(p.data, 0, n);
                vdec.queueInputBuffer(i, 0, n, p.ptsUs, 0);
            }
            if (vEosPending && !vEosQueued && vIn.isEmpty() && !vdecFree.isEmpty()) {
                vEosQueued = true;
                vdec.queueInputBuffer(vdecFree.poll(), 0, 0, Math.max(0, lastRenderPts + 1), MediaCodec.BUFFER_FLAG_END_OF_STREAM);
            }
        } catch (Exception e) {
            Log.w(TAG, "feedVideo", e);
        }
    }

    private void feedAudio() {
        if (adec == null) return;
        try {
            while (!adecFree.isEmpty() && !aIn.isEmpty()) {
                int i = adecFree.poll();
                Packet p = aIn.poll();
                ByteBuffer b = adec.getInputBuffer(i);
                b.clear();
                int n = Math.min(b.remaining(), p.data.length);
                b.put(p.data, 0, n);
                adec.queueInputBuffer(i, 0, n, p.ptsUs, 0);
            }
            if (aEosPending && !aEosQueued && aIn.isEmpty() && !adecFree.isEmpty()) {
                aEosQueued = true;
                adec.queueInputBuffer(adecFree.poll(), 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
            }
        } catch (Exception e) {
            Log.w(TAG, "feedAudio", e);
        }
    }

    private void feedAac() {
        if (aenc == null) return;
        try {
            int frameBytes = 2 * aCh;
            while (!aencFree.isEmpty()) {
                if (pcm.isEmpty()) {
                    if (pcmEos && !aacEosQueued) {
                        aacEosQueued = true;
                        long pts = audioBaseUs + samplesIn * 1_000_000L / aRate;
                        aenc.queueInputBuffer(aencFree.poll(), 0, 0, Math.max(0, pts), MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                    }
                    return;
                }
                int i = aencFree.poll();
                ByteBuffer b = aenc.getInputBuffer(i);
                b.clear();
                int cap = b.remaining() / frameBytes * frameBytes;
                int n = 0;
                while (n < cap && !pcm.isEmpty()) {
                    byte[] head = pcm.peek();
                    int take = Math.min(cap - n, head.length - pcmHeadOff);
                    b.put(head, pcmHeadOff, take);
                    n += take;
                    pcmHeadOff += take;
                    if (pcmHeadOff >= head.length) {
                        pcm.poll();
                        pcmHeadOff = 0;
                    }
                }
                long pts = audioBaseUs + samplesIn * 1_000_000L / aRate;
                samplesIn += n / frameBytes;
                aenc.queueInputBuffer(i, 0, n, pts, 0);
            }
        } catch (Exception e) {
            Log.w(TAG, "feedAac", e);
        }
    }

    private void onVideoEncoded(MediaCodec c, int i, MediaCodec.BufferInfo info) {
        try {
            ByteBuffer b = c.getOutputBuffer(i);
            if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                if (info.size > 0 && (sps == null || pps == null)) {
                    byte[] d = new byte[info.size];
                    b.position(info.offset);
                    b.get(d);
                    byte[] s = H264.find(d, 7), p = H264.find(d, 8);
                    if (s != null) sps = s;
                    if (p != null) pps = p;
                }
            } else if (info.size > 0) {
                byte[] d = new byte[info.size];
                b.position(info.offset);
                b.get(d);
                framesOut.incrementAndGet();
                dispatch(new Packet(true, d, info.presentationTimeUs, (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0));
            }
            c.releaseOutputBuffer(i, false);
            if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                videoDone = true;
                checkDone();
            }
        } catch (Exception e) {
            Log.w(TAG, "venc", e);
        }
    }

    private void dispatch(Packet p) {
        outBytes.addAndGet(p.data.length);
        for (Output o : outputs) {
            try {
                o.write(p);
            } catch (Exception e) {
                Log.w(TAG, "output " + o.name, e);
            }
        }
    }

    boolean configReady() {
        return sps != null && pps != null && (!hasAudio || asc != null);
    }

    // ---------- encerramento ----------
    private void beginStop() {
        if (stopping || finished) return;
        stopping = true;
        vEosPending = true;
        aEosPending = true;
        vIn.clear();
        aIn.clear();
        if (vdec == null) {
            finish();
            return;
        }
        feedVideo();
        feedAudio();
        if (adec == null) audioDone = true;
        h.postDelayed(this::finish, 6000); // garante término mesmo se um codec não devolver o EOS
    }

    private void checkDone() {
        if (videoDone && (audioDone || aenc == null)) finish();
    }

    void fail(String message) {
        if (finished) return;
        error = message;
        Log.e(TAG, message);
        if (events != null) events.onError(message);
        finish();
    }

    private void finish() {
        if (finished) return;
        finished = true;
        for (Output o : outputs) o.end();
        for (MediaCodec c : new MediaCodec[]{vdec, venc, adec, aenc}) {
            if (c == null) continue;
            try {
                c.stop();
            } catch (Exception ignored) {
            }
            try {
                c.release();
            } catch (Exception ignored) {
            }
        }
        if (encSurface != null) encSurface.release();
        Handler hh = h;
        hh.postDelayed(() -> {
            if (events != null) events.onEnded();
            thread.quitSafely();
        }, 300);
    }

    public boolean isFinished() {
        return finished;
    }

    // ---------- status (mesmo formato do PC) ----------
    public synchronized JSONObject status(String type) {
        JSONObject s = new JSONObject();
        try {
            long now = System.currentTimeMillis();
            double dt = (now - lastStatAt) / 1000.0;
            if (dt >= 0.8) {
                fpsNow = (framesOut.get() - lastStatFrames) / dt;
                kbpsNow = (outBytes.get() - lastStatBytes) * 8 / 1000.0 / dt;
                lastStatAt = now;
                lastStatFrames = framesOut.get();
                lastStatBytes = outBytes.get();
            }
            s.put("type", type);
            s.put("vertical", vertical);
            s.put("uptime", now - startedAt);
            s.put("preset", presetId);
            s.put("encoder", "mediacodec");
            s.put("fps", Math.round(fpsNow));
            s.put("bitrate", framesOut.get() > 0 ? String.format(Locale.US, "%.1fkbits/s", kbpsNow) : JSONObject.NULL);
            s.put("speed", framesOut.get() > 0 ? "1x" : JSONObject.NULL);
            s.put("dropFrames", 0);
            s.put("backlog", vIn.size() * 50_000);
            boolean isRec = false, isLive = false;
            for (Output o : outputs) {
                if (!"stopped".equals(o.state)) {
                    if (o instanceof RecordOutput) isRec = true;
                    if (o instanceof RtmpOutput) isLive = true;
                }
            }
            s.put("isRecording", isRec);
            s.put("isStreaming", isLive);
            JSONArray outs = new JSONArray();
            for (Output o : outputs) outs.put(o.status());
            s.put("outputs", outs);
            s.put("studioId", studio.optString("id"));
        } catch (Exception ignored) {
        }
        return s;
    }

    void emitStatus() {
        if (events != null) events.onStatus();
    }

    // ---------- util ----------
    static byte[] toBytes(ByteBuffer b) {
        ByteBuffer d = b.duplicate();
        d.rewind();
        byte[] out = new byte[d.remaining()];
        d.get(out);
        return out;
    }

    static byte[] stripStart(byte[] d) {
        if (d.length > 4 && d[0] == 0 && d[1] == 0 && d[2] == 0 && d[3] == 1) return java.util.Arrays.copyOfRange(d, 4, d.length);
        if (d.length > 3 && d[0] == 0 && d[1] == 0 && d[2] == 1) return java.util.Arrays.copyOfRange(d, 3, d.length);
        return d;
    }

    // =====================================================================
    abstract class Output {
        final String id, name, kind;
        volatile String state = "idle", error;
        volatile int restarts;
        final AtomicLong bytes = new AtomicLong();
        File file;

        Output(String id, String name, String kind) {
            this.id = id;
            this.name = name;
            this.kind = kind;
        }

        abstract void start();

        abstract void write(Packet p);

        abstract void end();

        void set(String st) {
            state = st;
            emitStatus();
        }

        JSONObject status() {
            JSONObject o = new JSONObject();
            try {
                o.put("id", id).put("name", name).put("kind", kind).put("state", state)
                        .put("error", error == null ? JSONObject.NULL : error).put("restarts", restarts).put("bytes", bytes.get());
                if (file != null) o.put("file", file.getName());
            } catch (Exception ignored) {
            }
            return o;
        }
    }

    /** Saída RTMP/RTMPS com reconexão automática (até 20 vezes, igual ao PC). */
    class RtmpOutput extends Output {
        final String url;
        private final LinkedBlockingQueue<Packet> queue = new LinkedBlockingQueue<>();
        private final AtomicLong queued = new AtomicLong();
        private volatile boolean stopped, connected;
        private volatile RtmpPublisher pub;
        private Thread worker;

        RtmpOutput(String id, String name, String url) {
            super(id, name, "rtmp");
            this.url = url;
        }

        @Override
        void start() {
            worker = new Thread(this::run, "rtmp-" + name);
            worker.start();
        }

        private String redacted(String msg) {
            if (msg == null) return null;
            return msg.replace(url, "[url]");
        }

        private void run() {
            while (!stopped) {
                set(restarts > 0 ? "reconnecting" : "connecting");
                error = null;
                RtmpPublisher p = new RtmpPublisher();
                try {
                    p.connect(url, 10_000);
                    pub = p;
                    long until = System.currentTimeMillis() + 15_000;
                    while (!configReady() && !stopped && System.currentTimeMillis() < until) Thread.sleep(50);
                    if (stopped) break;
                    if (sps == null || pps == null) throw new Exception("o vídeo ainda não começou");
                    p.sendMetadata(width, height, fps, vkbps, akbps, aRate, aCh);
                    p.sendVideoConfig(sps, pps);
                    boolean audioCfg = false;
                    if (asc != null) {
                        p.sendAudioConfig(asc);
                        audioCfg = true;
                    }
                    queue.clear();
                    queued.set(0);
                    connected = true;
                    long connectedAt = System.currentTimeMillis();
                    long base = -1, lastV = -1, lastA = -1;
                    boolean waitKey = true;
                    while (true) {
                        String fatal = p.fatalError();
                        if (fatal != null) throw new Exception(fatal);
                        Packet pk = queue.poll(500, TimeUnit.MILLISECONDS);
                        if (pk == null) {
                            if (stopped) break;
                            continue;
                        }
                        queued.addAndGet(-pk.data.length);
                        if (pk.video) {
                            if (waitKey && !pk.key) continue;
                            waitKey = false;
                            if (base < 0) base = pk.ptsUs;
                            long ts = Math.max(0, (pk.ptsUs - base) / 1000);
                            if (ts < lastV) ts = lastV;
                            lastV = ts;
                            p.sendVideo(pk.data, ts, pk.key);
                        } else {
                            if (base < 0 || pk.ptsUs < base) continue;
                            if (!audioCfg && asc != null) {
                                p.sendAudioConfig(asc);
                                audioCfg = true;
                            }
                            long ts = (pk.ptsUs - base) / 1000;
                            if (ts < lastA) ts = lastA;
                            lastA = ts;
                            p.sendAudio(pk.data, ts);
                        }
                        bytes.addAndGet(pk.data.length);
                        if (!"live".equals(state) && System.currentTimeMillis() - connectedAt > 2500) set("live");
                    }
                    connected = false;
                    p.close();
                    break;
                } catch (Exception e) {
                    connected = false;
                    p.close();
                    pub = null;
                    if (stopped) break;
                    String m = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                    if (e instanceof java.net.UnknownHostException) m = "Servidor não encontrado (sem internet?): " + m;
                    error = redacted(m);
                    Log.w(TAG, "rtmp " + name + ": " + error);
                    if (restarts >= MAX_RESTARTS) {
                        set("failed");
                        return;
                    }
                    restarts++;
                    set("error");
                    try {
                        Thread.sleep(3000);
                    } catch (InterruptedException ie) {
                        break;
                    }
                }
            }
            set("stopped");
        }

        @Override
        void write(Packet p) {
            if (!connected || stopped) return;
            if (queued.get() > MAX_OUTPUT_BUFFER) {
                error = "Destino não está acompanhando (rede lenta). Reiniciando…";
                connected = false;
                RtmpPublisher pp = pub;
                if (pp != null) pp.close();
                return;
            }
            queue.offer(p);
            queued.addAndGet(p.data.length);
        }

        @Override
        void end() {
            stopped = true;
            Thread w = worker;
            new Thread(() -> {
                try {
                    if (w != null) w.join(8000);
                } catch (InterruptedException ignored) {
                }
                RtmpPublisher pp = pub;
                if (pp != null) pp.close();
                if (w != null) w.interrupt();
            }).start();
        }
    }

    /** Gravação MP4 local (MediaMuxer). Escrita na thread do pipeline. */
    class RecordOutput extends Output {
        private MediaMuxer muxer;
        private int vt = -1, at = -1;
        private long lastV = -1, lastA = -1;
        private boolean gotKey;
        private final ArrayDeque<Packet> pending = new ArrayDeque<>();
        private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();

        RecordOutput(String name, File f) {
            super("rec", name, "record");
            this.file = f;
        }

        @Override
        void start() {
            set("connecting");
        }

        @Override
        void write(Packet p) {
            if ("stopped".equals(state) || "failed".equals(state)) return;
            if (muxer == null) {
                if (videoFormat == null || (hasAudio && audioFormat == null)) {
                    if (pending.size() < 600) pending.add(p);
                    return;
                }
                try {
                    muxer = new MediaMuxer(file.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
                    vt = muxer.addTrack(videoFormat);
                    if (hasAudio && audioFormat != null) at = muxer.addTrack(audioFormat);
                    muxer.start();
                    set("live");
                } catch (Exception e) {
                    error = "Não foi possível gravar: " + e.getMessage();
                    muxer = null;
                    set("failed");
                    return;
                }
                while (!pending.isEmpty()) put(pending.poll());
            }
            put(p);
        }

        private void put(Packet p) {
            if (p.video) {
                if (!gotKey && !p.key) return;
                gotKey = true;
            } else if (!gotKey || at < 0) return;
            long pts = p.ptsUs;
            if (p.video) {
                if (pts <= lastV) pts = lastV + 1;
                lastV = pts;
            } else {
                if (pts <= lastA) pts = lastA + 1;
                lastA = pts;
            }
            info.set(0, p.data.length, pts, p.key && p.video ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0);
            try {
                muxer.writeSampleData(p.video ? vt : at, ByteBuffer.wrap(p.data), info);
                bytes.addAndGet(p.data.length);
            } catch (Exception e) {
                error = e.getMessage();
            }
        }

        @Override
        void end() {
            if (muxer != null) {
                try {
                    muxer.stop();
                } catch (Exception e) {
                    error = "Arquivo pode estar incompleto: " + e.getMessage();
                }
                try {
                    muxer.release();
                } catch (Exception ignored) {
                }
                muxer = null;
                MediaScannerConnection.scanFile(ctx, new String[]{file.getAbsolutePath()}, new String[]{"video/mp4"}, null);
            } else if (file.exists() && file.length() == 0) {
                file.delete();
            }
            if (!"failed".equals(state)) set("stopped");
        }
    }
}
