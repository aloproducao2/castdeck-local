// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

/** Utilidades H.264: separar NALs Annex-B, converter AVCC <-> Annex-B e ler o avcC. */
public final class H264 {
    private H264() {
    }

    /** lista de {início, tamanho} de cada NAL (sem o start code) */
    public static List<int[]> nals(byte[] d) {
        return nals(d, 0, d.length);
    }

    public static List<int[]> nals(byte[] d, int off, int len) {
        List<int[]> out = new ArrayList<>();
        int end = off + len;
        int i = off;
        int start = -1;
        while (i + 2 < end) {
            if (d[i] == 0 && d[i + 1] == 0 && (d[i + 2] == 1 || (i + 3 < end && d[i + 2] == 0 && d[i + 3] == 1))) {
                int sc = d[i + 2] == 1 ? 3 : 4;
                if (start >= 0) {
                    int e = i;
                    while (e > start && d[e - 1] == 0) e--; // zeros de preenchimento
                    out.add(new int[]{start, e - start});
                }
                i += sc;
                start = i;
            } else {
                i++;
            }
        }
        if (start >= 0 && start < end) out.add(new int[]{start, end - start});
        return out;
    }

    public static boolean isAnnexB(byte[] d, int off, int len) {
        return len >= 4 && d[off] == 0 && d[off + 1] == 0 && (d[off + 2] == 1 || (d[off + 2] == 0 && d[off + 3] == 1));
    }

    /** AVCC (prefixo de tamanho) -> Annex-B */
    public static byte[] avccToAnnexB(byte[] d, int off, int len, int lengthSize) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(len + 16);
        int p = off, end = off + len;
        while (p + lengthSize <= end) {
            int n = 0;
            for (int i = 0; i < lengthSize; i++) n = (n << 8) | (d[p + i] & 0xff);
            p += lengthSize;
            if (n <= 0 || p + n > end) break;
            out.write(0);
            out.write(0);
            out.write(0);
            out.write(1);
            out.write(d, p, n);
            p += n;
        }
        return out.toByteArray();
    }

    /** avcC -> {sps, pps, lengthSize} (sps/pps em Annex-B com start code) */
    public static Object[] parseAvcC(byte[] c) {
        if (c == null || c.length < 7 || c[0] != 1) return null;
        int lengthSize = (c[4] & 3) + 1;
        int p = 5;
        int nSps = c[p++] & 0x1f;
        ByteArrayOutputStream sps = new ByteArrayOutputStream();
        for (int i = 0; i < nSps && p + 2 <= c.length; i++) {
            int n = ((c[p] & 0xff) << 8) | (c[p + 1] & 0xff);
            p += 2;
            sps.write(0);
            sps.write(0);
            sps.write(0);
            sps.write(1);
            sps.write(c, p, Math.min(n, c.length - p));
            p += n;
        }
        ByteArrayOutputStream pps = new ByteArrayOutputStream();
        if (p < c.length) {
            int nPps = c[p++] & 0xff;
            for (int i = 0; i < nPps && p + 2 <= c.length; i++) {
                int n = ((c[p] & 0xff) << 8) | (c[p + 1] & 0xff);
                p += 2;
                pps.write(0);
                pps.write(0);
                pps.write(0);
                pps.write(1);
                pps.write(c, p, Math.min(n, c.length - p));
                p += n;
            }
        }
        return new Object[]{sps.toByteArray(), pps.toByteArray(), lengthSize};
    }

    /** primeira NAL de um tipo, sem start code */
    public static byte[] find(byte[] annexB, int type) {
        for (int[] n : nals(annexB)) {
            if ((annexB[n[0]] & 0x1f) == type) return java.util.Arrays.copyOfRange(annexB, n[0], n[0] + n[1]);
        }
        return null;
    }
}
