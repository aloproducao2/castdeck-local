// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.math.BigInteger;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocketFactory;

/**
 * Porta de server/certs.js sem dependências: monta um X.509 autoassinado (DER) com os IPs da rede
 * no subjectAltName. Convidados na LAN precisam de HTTPS para liberar câmera/microfone.
 */
public final class SelfSignedCert {
    private static final char[] PASS = "castdeck".toCharArray();

    private SelfSignedCert() {
    }

    public static SSLServerSocketFactory serverSocketFactory(File dir, List<String> ips) throws Exception {
        dir.mkdirs();
        File ks = new File(dir, "lan.p12");
        File meta = new File(dir, "lan.meta");
        java.util.TreeSet<String> wanted = new java.util.TreeSet<>(ips);
        wanted.add("127.0.0.1");
        String want = String.join(",", wanted);
        KeyStore store = KeyStore.getInstance("PKCS12");
        boolean ok = false;
        if (ks.exists() && meta.exists()) {
            try (FileInputStream in = new FileInputStream(ks)) {
                String m = new String(java.nio.file.Files.readAllBytes(meta.toPath()), StandardCharsets.UTF_8);
                store.load(in, PASS);
                X509Certificate c = (X509Certificate) store.getCertificate("castdeck");
                ok = m.equals(want) && c != null && c.getNotAfter().getTime() > System.currentTimeMillis() + 7L * 86400000L;
            } catch (Exception ignored) {
            }
        }
        if (!ok) {
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048, new SecureRandom());
            KeyPair kp = g.generateKeyPair();
            X509Certificate cert = build(kp, wanted);
            store = KeyStore.getInstance("PKCS12");
            store.load(null, null);
            store.setKeyEntry("castdeck", kp.getPrivate(), PASS, new Certificate[]{cert});
            try (FileOutputStream out = new FileOutputStream(ks)) {
                store.store(out, PASS);
            }
            try (FileOutputStream out = new FileOutputStream(meta)) {
                out.write(want.getBytes(StandardCharsets.UTF_8));
            }
        }
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(store, PASS);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(kmf.getKeyManagers(), null, null);
        return ctx.getServerSocketFactory();
    }

    // ---------- DER mínimo ----------
    private static byte[] tlv(int tag, byte[]... parts) {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        for (byte[] p : parts) body.write(p, 0, p.length);
        byte[] b = body.toByteArray();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(tag);
        int n = b.length;
        if (n < 0x80) out.write(n);
        else if (n < 0x100) {
            out.write(0x81);
            out.write(n);
        } else if (n < 0x10000) {
            out.write(0x82);
            out.write(n >> 8);
            out.write(n & 0xff);
        } else {
            out.write(0x83);
            out.write(n >> 16);
            out.write((n >> 8) & 0xff);
            out.write(n & 0xff);
        }
        out.write(b, 0, b.length);
        return out.toByteArray();
    }

    private static byte[] seq(byte[]... p) {
        return tlv(0x30, p);
    }

    private static byte[] oid(String dotted) {
        String[] s = dotted.split("\\.");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(Integer.parseInt(s[0]) * 40 + Integer.parseInt(s[1]));
        for (int i = 2; i < s.length; i++) {
            long v = Long.parseLong(s[i]);
            byte[] tmp = new byte[10];
            int k = 0;
            do {
                tmp[k++] = (byte) (v & 0x7f);
                v >>= 7;
            } while (v > 0);
            for (int j = k - 1; j >= 0; j--) out.write(tmp[j] | (j > 0 ? 0x80 : 0));
        }
        return tlv(0x06, out.toByteArray());
    }

    private static byte[] integer(BigInteger v) {
        return tlv(0x02, v.toByteArray());
    }

    private static byte[] utf8(String s) {
        return tlv(0x0c, s.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] time(Date d) {
        SimpleDateFormat f = new SimpleDateFormat("yyMMddHHmmss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return tlv(0x17, f.format(d).getBytes(StandardCharsets.US_ASCII));
    }

    private static byte[] name(String cn) {
        return seq(tlv(0x31, seq(oid("2.5.4.3"), utf8(cn))));
    }

    private static X509Certificate build(KeyPair kp, java.util.Collection<String> ips) throws Exception {
        byte[] sigAlg = seq(oid("1.2.840.113549.1.1.11"), new byte[]{0x05, 0x00});
        ByteArrayOutputStream san = new ByteArrayOutputStream();
        byte[] dns = tlv(0x82, "localhost".getBytes(StandardCharsets.US_ASCII));
        san.write(dns, 0, dns.length);
        for (String ip : ips) {
            byte[] a = InetAddress.getByName(ip).getAddress();
            byte[] e = tlv(0x87, a);
            san.write(e, 0, e.length);
        }
        byte[] extSan = seq(oid("2.5.29.17"), tlv(0x04, tlv(0x30, san.toByteArray())));
        byte[] extBasic = seq(oid("2.5.29.19"), tlv(0x04, seq()));
        // keyUsage: digitalSignature + keyEncipherment
        byte[] extKu = seq(oid("2.5.29.15"), new byte[]{0x01, 0x01, (byte) 0xff}, tlv(0x04, tlv(0x03, new byte[]{0x05, (byte) 0xa0})));
        byte[] extEku = seq(oid("2.5.29.37"), tlv(0x04, seq(oid("1.3.6.1.5.5.7.3.1"))));
        long now = System.currentTimeMillis();
        byte[] tbs = seq(
                tlv(0xa0, integer(BigInteger.valueOf(2))),
                integer(new BigInteger(63, new SecureRandom()).add(BigInteger.ONE)),
                sigAlg,
                name("CastDeck Android"),
                seq(time(new Date(now - 86400000L)), time(new Date(now + 825L * 86400000L))),
                name("CastDeck Android"),
                kp.getPublic().getEncoded(),
                tlv(0xa3, seq(extBasic, extKu, extEku, extSan)));
        Signature s = Signature.getInstance("SHA256withRSA");
        s.initSign(kp.getPrivate());
        s.update(tbs);
        byte[] sig = s.sign();
        byte[] bits = new byte[sig.length + 1];
        System.arraycopy(sig, 0, bits, 1, sig.length);
        byte[] der = seq(tbs, sigAlg, tlv(0x03, bits));
        return (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(der));
    }
}
