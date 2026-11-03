// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import java.util.ArrayList;
import java.util.List;

/**
 * Demuxer WebM/Matroska incremental (streaming) para o que o MediaRecorder do Chromium produz:
 * Segment/Cluster com tamanho desconhecido, SimpleBlocks, Opus + H.264/VP8/VP9/AV1.
 * Recebe pedaços de bytes em qualquer tamanho via {@link #feed(byte[], int, int)}.
 */
public class WebmDemuxer {
    public static class Track {
        public int number, type; // 1 = vídeo, 2 = áudio
        public String codec = "";
        public byte[] codecPrivate;
        public int width, height, channels = 1;
        public double sampleRate = 8000;
        public long codecDelayNs, seekPreRollNs;

        public boolean isVideo() {
            return type == 1 || codec.startsWith("V_");
        }

        public boolean isAudio() {
            return type == 2 || codec.startsWith("A_");
        }
    }

    public interface Listener {
        void onTracks(List<Track> tracks);

        void onFrame(Track track, long ptsUs, boolean key, byte[] data, int off, int len);
    }

    // IDs
    private static final int EBML = 0x1A45DFA3, SEGMENT = 0x18538067, INFO = 0x1549A966, TIMECODE_SCALE = 0x2AD7B1,
            TRACKS = 0x1654AE6B, TRACK_ENTRY = 0xAE, TRACK_NUMBER = 0xD7, TRACK_TYPE = 0x83, CODEC_ID = 0x86,
            CODEC_PRIVATE = 0x63A2, VIDEO = 0xE0, AUDIO = 0xE1, PIXEL_W = 0xB0, PIXEL_H = 0xBA, SAMPLING = 0xB5,
            CHANNELS = 0x9F, CODEC_DELAY = 0x56AA, SEEK_PREROLL = 0x56BB, CLUSTER = 0x1F43B675, TIMECODE = 0xE7,
            SIMPLE_BLOCK = 0xA3, BLOCK_GROUP = 0xA0, BLOCK = 0xA1;

    private final Listener listener;
    private byte[] buf = new byte[1 << 20];
    private int start, end;
    private long skip;
    private long timecodeScale = 1_000_000L;
    private long clusterTc;
    private final List<Track> tracks = new ArrayList<>();
    private Track cur;
    private boolean tracksDone;

    public WebmDemuxer(Listener l) {
        this.listener = l;
    }

    public List<Track> tracks() {
        return tracks;
    }

    public void feed(byte[] data, int off, int len) {
        // pula o restante de elementos ignorados sem copiar
        if (skip > 0) {
            int n = (int) Math.min(skip, len);
            skip -= n;
            off += n;
            len -= n;
            if (len == 0) return;
        }
        // Compacta o buffer quando mais da metade já foi consumida, mantendo o buffer estável sem realocações
        if (start > 0 && (start >= buf.length / 2 || end + len > buf.length)) {
            int live = end - start;
            if (live + len > buf.length) {
                byte[] nb = new byte[Math.max(buf.length * 2, live + len + 65536)];
                System.arraycopy(buf, start, nb, 0, live);
                buf = nb;
            } else if (live > 0) {
                System.arraycopy(buf, start, buf, 0, live);
            }
            start = 0;
            end = live;
        }
        System.arraycopy(data, off, buf, end, len);
        end += len;
        parse();
    }

    private int vintLen(int first) {
        for (int i = 0; i < 8; i++) if ((first & (0x80 >> i)) != 0) return i + 1;
        return -1;
    }

    private void parse() {
        while (true) {
            if (skip > 0) {
                int n = (int) Math.min(skip, end - start);
                skip -= n;
                start += n;
                if (skip > 0) return;
            }
            int p = start;
            if (p >= end) return;
            int idLen = vintLen(buf[p] & 0xff);
            if (idLen < 1 || idLen > 4) { // lixo: avança 1 byte para ressincronizar
                start++;
                continue;
            }
            if (p + idLen > end) return;
            int id = 0;
            for (int i = 0; i < idLen; i++) id = (id << 8) | (buf[p + i] & 0xff);
            p += idLen;
            if (p >= end) return;
            int sLen = vintLen(buf[p] & 0xff);
            if (sLen < 1) {
                start++;
                continue;
            }
            if (p + sLen > end) return;
            long size = buf[p] & (0xff >> sLen);
            boolean allOnes = size == (0xff >> sLen);
            for (int i = 1; i < sLen; i++) {
                int b = buf[p + i] & 0xff;
                if (b != 0xff) allOnes = false;
                size = (size << 8) | b;
            }
            if (allOnes) size = -1; // tamanho desconhecido
            p += sLen;

            switch (id) {
                case SEGMENT:
                case TRACKS:
                case VIDEO:
                case AUDIO:
                case BLOCK_GROUP:
                case INFO:
                    start = p; // entra no elemento (filhos vêm em seguida)
                    continue;
                case CLUSTER:
                    finishTracks();
                    start = p;
                    continue;
                case TRACK_ENTRY:
                    cur = new Track();
                    tracks.add(cur);
                    start = p;
                    continue;
                default:
                    break;
            }
            boolean wanted = id == TIMECODE_SCALE || id == TRACK_NUMBER || id == TRACK_TYPE || id == CODEC_ID || id == CODEC_PRIVATE
                    || id == PIXEL_W || id == PIXEL_H || id == SAMPLING || id == CHANNELS || id == CODEC_DELAY || id == SEEK_PREROLL
                    || id == TIMECODE || id == SIMPLE_BLOCK || id == BLOCK;
            if (size < 0) { // elemento desconhecido sem tamanho: trata como contêiner
                start = p;
                continue;
            }
            if (!wanted || id == EBML) {
                start = p;
                skip = size;
                continue;
            }
            if (size > 64L * 1024 * 1024) { // corrompido
                start = p;
                skip = size;
                continue;
            }
            if (p + size > end) return; // espera mais dados
            handle(id, p, (int) size);
            start = p + (int) size;
        }
    }

    private long uint(int p, int n) {
        long v = 0;
        for (int i = 0; i < n; i++) v = (v << 8) | (buf[p + i] & 0xff);
        return v;
    }

    private void handle(int id, int p, int n) {
        switch (id) {
            case TIMECODE_SCALE:
                timecodeScale = Math.max(1, uint(p, n));
                return;
            case TIMECODE:
                clusterTc = uint(p, n);
                return;
            case SIMPLE_BLOCK:
            case BLOCK:
                block(p, n, id == SIMPLE_BLOCK);
                return;
        }
        if (cur == null) return;
        switch (id) {
            case TRACK_NUMBER:
                cur.number = (int) uint(p, n);
                break;
            case TRACK_TYPE:
                cur.type = (int) uint(p, n);
                break;
            case CODEC_ID:
                cur.codec = new String(buf, p, n, java.nio.charset.StandardCharsets.US_ASCII).trim().replace("\u0000", "");
                break;
            case CODEC_PRIVATE:
                cur.codecPrivate = java.util.Arrays.copyOfRange(buf, p, p + n);
                break;
            case PIXEL_W:
                cur.width = (int) uint(p, n);
                break;
            case PIXEL_H:
                cur.height = (int) uint(p, n);
                break;
            case CHANNELS:
                cur.channels = (int) uint(p, n);
                break;
            case CODEC_DELAY:
                cur.codecDelayNs = uint(p, n);
                break;
            case SEEK_PREROLL:
                cur.seekPreRollNs = uint(p, n);
                break;
            case SAMPLING:
                if (n == 4) cur.sampleRate = Float.intBitsToFloat((int) uint(p, 4));
                else if (n == 8) cur.sampleRate = Double.longBitsToDouble(uint(p, 8));
                break;
        }
    }

    private void finishTracks() {
        if (tracksDone) return;
        tracksDone = true;
        cur = null;
        listener.onTracks(tracks);
    }

    private Track track(int num) {
        for (Track t : tracks) if (t.number == num) return t;
        return null;
    }

    private void block(int p, int n, boolean simple) {
        finishTracks();
        int endp = p + n;
        int l = vintLen(buf[p] & 0xff);
        if (l < 1 || p + l + 3 > endp) return;
        int num = (int) (buf[p] & (0xff >> l));
        for (int i = 1; i < l; i++) num = (num << 8) | (buf[p + i] & 0xff);
        p += l;
        short rel = (short) (((buf[p] & 0xff) << 8) | (buf[p + 1] & 0xff));
        int flags = buf[p + 2] & 0xff;
        p += 3;
        Track t = track(num);
        if (t == null) return;
        boolean key = simple ? (flags & 0x80) != 0 : false;
        long ptsUs = (clusterTc + rel) * timecodeScale / 1000L;
        int lacing = (flags >> 1) & 3;
        if (lacing == 0) {
            listener.onFrame(t, ptsUs, key, buf, p, endp - p);
            return;
        }
        // lacing (raro no Chromium, mas suportado)
        int count = (buf[p] & 0xff) + 1;
        p++;
        int[] sizes = new int[count];
        if (lacing == 2) { // fixo
            int each = (endp - p) / count;
            for (int i = 0; i < count; i++) sizes[i] = each;
        } else if (lacing == 1) { // Xiph
            int total = 0;
            for (int i = 0; i < count - 1; i++) {
                int s = 0, b;
                do {
                    b = buf[p++] & 0xff;
                    s += b;
                } while (b == 255 && p < endp);
                sizes[i] = s;
                total += s;
            }
            sizes[count - 1] = endp - p - total;
        } else { // EBML
            int fl = vintLen(buf[p] & 0xff);
            long s = buf[p] & (0xff >> fl);
            for (int i = 1; i < fl; i++) s = (s << 8) | (buf[p + i] & 0xff);
            p += fl;
            sizes[0] = (int) s;
            int total = sizes[0];
            for (int i = 1; i < count - 1; i++) {
                int dl = vintLen(buf[p] & 0xff);
                long raw = buf[p] & (0xff >> dl);
                for (int k = 1; k < dl; k++) raw = (raw << 8) | (buf[p + k] & 0xff);
                p += dl;
                long bias = (1L << (7 * dl - 1)) - 1;
                sizes[i] = (int) (sizes[i - 1] + (raw - bias));
                total += sizes[i];
            }
            sizes[count - 1] = endp - p - total;
        }
        long dur = t.isAudio() ? 20_000 : 0; // Opus: 20 ms por quadro
        for (int i = 0; i < count; i++) {
            if (sizes[i] <= 0 || p + sizes[i] > endp) return;
            listener.onFrame(t, ptsUs + i * dur, key, buf, p, sizes[i]);
            p += sizes[i];
        }
    }
}
