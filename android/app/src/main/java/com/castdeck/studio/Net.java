// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
package com.castdeck.studio;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Rede: IPs da LAN, download seguro (anti-SSRF) e leitura de feeds RSS/Atom (porta de feeds.js). */
public final class Net {
    private Net() {
    }

    public static List<String[]> lanIps() {
        List<String[]> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && !a.isLinkLocalAddress()) {
                        String ip = a.getHostAddress();
                        String name = ni.getName();
                        // Wi-Fi primeiro (wlan), dados móveis (rmnet/ccmni) por último
                        if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan")) out.add(0, new String[]{name, ip});
                        else if (!name.startsWith("rmnet") && !name.startsWith("ccmni") && !name.startsWith("dummy")) out.add(new String[]{name, ip});
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    static boolean isPrivate(InetAddress a) {
        if (a.isLoopbackAddress() || a.isAnyLocalAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress() || a.isMulticastAddress()) return true;
        byte[] b = a.getAddress();
        if (a instanceof Inet4Address) {
            int x = b[0] & 0xff, y = b[1] & 0xff;
            return x == 0 || x == 10 || x == 127 || (x == 100 && y >= 64 && y <= 127) || (x == 169 && y == 254) || (x == 172 && y >= 16 && y <= 31) || (x == 192 && y == 168);
        }
        if (a instanceof Inet6Address) return (b[0] & 0xfe) == 0xfc;
        return false;
    }

    public static class Fetched {
        public String type, url;
        public byte[] body;
    }

    public static Fetched fetchPublic(String raw, int maxBytes, Pattern okType, String notOk) throws Exception {
        String cur = raw;
        for (int hop = 0; hop <= 3; hop++) {
            URL u = new URL(cur);
            String proto = u.getProtocol().toLowerCase(Locale.ROOT);
            if (!proto.equals("http") && !proto.equals("https")) throw new Exception("protocolo inválido");
            InetAddress[] addrs = InetAddress.getAllByName(u.getHost());
            if (addrs.length == 0) throw new Exception("endereço não permitido");
            for (InetAddress a : addrs) if (isPrivate(a)) throw new Exception("endereço não permitido");
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            c.setRequestProperty("User-Agent", "Mozilla/5.0 CastDeck/1.0");
            c.setRequestProperty("Accept", "*/*");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                cur = new URL(u, c.getHeaderField("Location")).toString();
                c.disconnect();
                continue;
            }
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
            String type = c.getContentType() == null ? "" : c.getContentType();
            if (okType != null && !okType.matcher(type).find()) throw new Exception(notOk != null ? notOk : "tipo de conteúdo não permitido");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    if (out.size() > maxBytes) throw new Exception("conteúdo grande demais");
                }
            }
            Fetched f = new Fetched();
            f.type = type;
            f.body = out.toByteArray();
            f.url = u.toString();
            return f;
        }
        throw new Exception("redirecionamentos demais");
    }

    // ---------- feeds ----------
    static String decodeBody(byte[] buf, String type) {
        String head = new String(buf, 0, Math.min(1024, buf.length), StandardCharsets.ISO_8859_1);
        String enc = null;
        Matcher m = Pattern.compile("charset=([\\w-]+)", Pattern.CASE_INSENSITIVE).matcher(type == null ? "" : type);
        if (m.find()) enc = m.group(1);
        if (enc == null) {
            m = Pattern.compile("^\\s*<\\?xml[^>]*encoding=[\"']([\\w-]+)[\"']", Pattern.CASE_INSENSITIVE).matcher(head);
            if (m.find()) enc = m.group(1);
        }
        if (enc == null) {
            m = Pattern.compile("<meta[^>]+charset=[\"']?([\\w-]+)", Pattern.CASE_INSENSITIVE).matcher(head);
            if (m.find()) enc = m.group(1);
        }
        if (enc != null) enc = enc.toLowerCase(Locale.ROOT);
        if ("iso-8859-1".equals(enc) || "latin1".equals(enc) || "iso-8859-15".equals(enc)) enc = "windows-1252";
        if (enc != null && !enc.matches("utf-?8")) {
            try {
                return new String(buf, Charset.forName(enc));
            } catch (Exception ignored) {
            }
        }
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(buf)).toString();
        } catch (CharacterCodingException e) {
            return new String(buf, Charset.forName("windows-1252"));
        }
    }

    static String decodeXml(String s) {
        s = s.replaceAll("<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>", "$1");
        s = s.replaceAll("(?i)</?[a-z][^>]*>", " ");
        StringBuffer sb = new StringBuffer();
        Matcher m = Pattern.compile("&#x([0-9a-fA-F]+);").matcher(s);
        while (m.find()) {
            int cp;
            try {
                cp = Integer.parseInt(m.group(1), 16);
            } catch (Exception e) {
                cp = 32;
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(new String(Character.toChars(cp == 0 ? 32 : cp))));
        }
        m.appendTail(sb);
        s = sb.toString();
        sb = new StringBuffer();
        m = Pattern.compile("&#(\\d+);").matcher(s);
        while (m.find()) {
            int cp;
            try {
                cp = Integer.parseInt(m.group(1));
            } catch (Exception e) {
                cp = 32;
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(new String(Character.toChars(cp == 0 ? 32 : cp))));
        }
        m.appendTail(sb);
        s = sb.toString().replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&nbsp;", " ");
        s = s.replaceAll("(?i)</?[a-z][^>]*>", " ").replace("&amp;", "&");
        return s.replaceAll("\\s+", " ").trim();
    }

    static String tagText(String block, String tag) {
        Matcher m = Pattern.compile("<" + Pattern.quote(tag) + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + Pattern.quote(tag) + ">", Pattern.CASE_INSENSITIVE).matcher(block);
        return m.find() ? decodeXml(m.group(1)) : "";
    }

    public static JSONObject parseFeed(String xml) throws Exception {
        String head = xml.substring(0, Math.min(20000, xml.length()));
        if (!Pattern.compile("<(rss|feed|rdf:rdf)\\b", Pattern.CASE_INSENSITIVE).matcher(head).find()) throw new Exception("não é um feed RSS/Atom válido");
        Matcher bm = Pattern.compile("<(item|entry)\\b[\\s\\S]*?</\\1>", Pattern.CASE_INSENSITIVE).matcher(xml);
        Matcher fm = Pattern.compile("<(item|entry)\\b", Pattern.CASE_INSENSITIVE).matcher(xml);
        String channel = fm.find() && fm.start() > 0 ? xml.substring(0, fm.start()) : xml;
        JSONArray items = new JSONArray();
        while (bm.find() && items.length() < 50) {
            String b = bm.group();
            String title = tagText(b, "title");
            if (title.isEmpty()) continue;
            Matcher lm = Pattern.compile("<link[^>]*href=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE).matcher(b);
            String link = lm.find() ? lm.group(1) : tagText(b, "link");
            String date = tagText(b, "pubDate");
            if (date.isEmpty()) date = tagText(b, "updated");
            if (date.isEmpty()) date = tagText(b, "published");
            if (date.isEmpty()) date = tagText(b, "dc:date");
            items.put(new JSONObject().put("title", title).put("link", link).put("date", date));
        }
        return new JSONObject().put("title", tagText(channel, "title")).put("items", items);
    }

    public static JSONObject loadFeed(String raw) throws Exception {
        int max = 3 * 1024 * 1024;
        Fetched r = fetchPublic(raw, max, null, null);
        String text = decodeBody(r.body, r.type);
        String start = text.substring(0, Math.min(3000, text.length()));
        if (Pattern.compile("<html[\\s>]", Pattern.CASE_INSENSITIVE).matcher(start).find()
                && !Pattern.compile("<(rss|feed|rdf:rdf)\\b", Pattern.CASE_INSENSITIVE).matcher(start).find()) {
            Matcher lm = Pattern.compile("<link[^>]+type=[\"']application/(?:rss|atom)\\+xml[\"'][^>]*>", Pattern.CASE_INSENSITIVE).matcher(text);
            String href = null;
            if (lm.find()) {
                Matcher hm = Pattern.compile("href=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE).matcher(lm.group());
                if (hm.find()) href = hm.group(1);
            }
            if (href == null) throw new Exception("nenhum feed RSS encontrado nessa página");
            r = fetchPublic(new URL(new URL(r.url), href).toString(), max, null, null);
            text = decodeBody(r.body, r.type);
        }
        return parseFeed(text).put("url", r.url);
    }
}
