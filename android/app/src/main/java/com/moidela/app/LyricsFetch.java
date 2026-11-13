package com.moidela.app;

import android.content.Context;
import android.text.Html;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Текст песни: Амальгама (текст + перевод) → LRCLIB (только оригинал) → перевод через Gemini (функция device?a=lyrtr). Результат кэшируется в файле. */
final class LyricsFetch {
    static final class Res { String[] o = new String[0], t = new String[0]; String src = ""; boolean hasT() { for (String x : t) if (x != null && x.trim().length() > 0) return true; return false; } }

    static String clean(String s) {
        if (s == null) return "";
        s = s.replaceAll("(?i)\\s*[\\(\\[][^\\)\\]]*(feat|ft\\.|remaster|remix|live|version|edit|from )[^\\)\\]]*[\\)\\]]", "");
        s = s.replaceAll("(?i)\\s+[-–—]\\s+(remaster(ed)?|\\d{4}|live|single|radio|album|original|bonus|mono|stereo).*$", "");
        return s.replaceAll("(?i)\\s+(feat\\.?|ft\\.?|featuring)\\s+.*$", "").trim();
    }
    static String firstArtist(String a) {
        if (a == null) return "";
        String x = a.split("\\s*(,|&|;| feat\\.? | ft\\.? | x )\\s*")[0];
        return x.trim();
    }
    private static String slug(String s) {
        s = s.toLowerCase().replace("&", " and ").replaceAll("[^a-z0-9 ]", " ").trim().replaceAll("\\s+", "_");
        return s;
    }
    /** Перевод нормальный, если это русский текст: без «кракозябр» (U+FFFD, Ð/Ñ-мойибаке, значков) и не копия оригинала. Иначе — пустая строка. */
    static String goodT(String t, String o) {
        if (t == null) return "";
        t = t.replace('\u00a0', ' ').trim();
        if (t.length() == 0) return "";
        int cyr = 0, lat = 0, bad = 0, other = 0;
        for (int i = 0; i < t.length(); i++) {
            char ch = t.charAt(i);
            if (ch >= 0x0400 && ch <= 0x04FF) cyr++;
            else if (ch < 0x80 && Character.isLetter(ch)) lat++;
            else if (ch == 0xFFFD || (ch >= 0x80 && ch <= 0xBF) || ch == 0xD0 || ch == 0xD1 || ch == 0xC3 || ch == 0xC2) bad++;
            else if (!Character.isWhitespace(ch) && !Character.isLetterOrDigit(ch) && ".,!?:;—–-…'\"«»()[]/".indexOf(ch) < 0) other++;
        }
        if (bad > 0 || cyr == 0 || other * 3 > Math.max(cyr + lat, 1) || t.equalsIgnoreCase(o == null ? "" : o.trim())) return "";
        return t;
    }
    static void sanitize(Res r) { for (int i = 0; i < r.t.length; i++) r.t[i] = goodT(r.t[i], i < r.o.length ? r.o[i] : ""); }

    static boolean mostlyCyr(String[] lines) {
        int c = 0, l = 0;
        for (String x : lines) for (int i = 0; i < x.length(); i++) { char ch = x.charAt(i); if (Character.isLetter(ch)) { l++; if (ch >= 0x0400 && ch <= 0x04FF) c++; } }
        return l > 0 && c * 2 > l;
    }

    static File cacheFile(Context c, String artist, String title) {
        File d = new File(c.getApplicationContext().getCacheDir(), "lyrics"); d.mkdirs();
        return new File(d, Integer.toHexString((artist.toLowerCase() + "|" + title.toLowerCase()).hashCode()) + ".json");
    }

    static Res cached(Context c, String artist, String title) {
        try {
            File f = cacheFile(c, artist, title); if (!f.exists()) return null;
            FileInputStream in = new FileInputStream(f); ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) b.write(buf, 0, n); in.close();
            JSONObject j = new JSONObject(b.toString("UTF-8")); Res r = new Res(); r.src = j.optString("s"); r.o = arr(j.optJSONArray("o")); r.t = arr(j.optJSONArray("t")); sanitize(r);
            return r.o.length > 0 ? r : null;
        } catch (Throwable e) { return null; }
    }
    private static String[] arr(JSONArray a) { if (a == null) return new String[0]; String[] r = new String[a.length()]; for (int i = 0; i < r.length; i++) r[i] = a.optString(i, ""); return r; }
    private static void save(Context c, String artist, String title, Res r) {
        try {
            JSONObject j = new JSONObject(); j.put("s", r.src); JSONArray o = new JSONArray(), t = new JSONArray();
            for (String x : r.o) o.put(x); for (String x : r.t) t.put(x); j.put("o", o); j.put("t", t);
            FileOutputStream out = new FileOutputStream(cacheFile(c, artist, title)); out.write(j.toString().getBytes("UTF-8")); out.close();
        } catch (Throwable e) { }
    }

    /** Блокирующий вызов (вызывать не из главного потока). null — ничего не нашли. */
    static Res get(Context c, String artist0, String title0) {
        String artist = firstArtist(clean(artist0)), title = clean(title0);
        if (title.length() == 0) return null;
        Res r = cached(c, artist, title); if (r != null) return r;
        r = amalgama(artist, title);
        if (r == null) r = lrclib(artist, title);
        if (r == null) return null;
        if (!r.hasT() && !mostlyCyr(r.o) && Store.linked(c)) {   // перевода нет — просим Gemini
            try {
                JSONArray la = new JSONArray(); for (String x : r.o) la.put(x);
                String resp = Net.post(Store.api(c, "lyrtr", null), new JSONObject().put("lines", la).toString());
                if (resp != null) { JSONObject j = new JSONObject(resp); JSONArray t = j.optJSONArray("t"); if (t != null && t.length() == r.o.length) { r.t = arr(t); sanitize(r); r.src += " + перевод Gemini"; } }
            } catch (Throwable e) { }
        }
        save(c, artist, title, r);
        return r;
    }

    private static String http(String u) {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(u).openConnection();
            h.setConnectTimeout(8000); h.setReadTimeout(12000); h.setInstanceFollowRedirects(true);
            h.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 MoiDela/1.0");
            h.setRequestProperty("Accept-Language", "ru,en;q=0.8");
            if (h.getResponseCode() != 200) return null;
            InputStream in = h.getInputStream(); ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) b.write(buf, 0, n); in.close();
            return b.toString("UTF-8");
        } catch (Throwable e) { return null; } finally { if (h != null) h.disconnect(); }
    }

    private static String strip(String x) { return Html.fromHtml(x.replaceAll("(?i)<br\\s*/?>", "\n")).toString().trim(); }

    static Res amalgama(String artist, String title) {
        String as = slug(artist), ts = slug(title); if (as.length() == 0 || ts.length() == 0) return null;
        List<String> arts = new ArrayList<>(); arts.add(as); if (as.startsWith("the_")) arts.add(as.substring(4));
        for (String a : arts) {
            char f = a.charAt(0); String dir = Character.isDigit(f) ? "0" : String.valueOf(f);
            String html = http("https://www.amalgama-lab.com/songs/" + dir + "/" + a + "/" + ts + ".html");
            if (html == null) continue;
            List<String> o = new ArrayList<>(), t = new ArrayList<>();
            Matcher m = Pattern.compile("class=\"original\"[^>]*>(.*?)</div>\\s*<div[^>]*class=\"translate\"[^>]*>(.*?)</div>", Pattern.DOTALL).matcher(html);
            while (m.find()) { o.add(strip(m.group(1))); t.add(strip(m.group(2))); }
            if (o.size() < 3) continue;
            Res r = new Res(); r.o = o.toArray(new String[0]); r.t = t.toArray(new String[0]); r.src = "Амальгама"; sanitize(r);
            return r;
        }
        return null;
    }

    static Res lrclib(String artist, String title) {
        try {
            String q = "artist_name=" + URLEncoder.encode(artist, "UTF-8") + "&track_name=" + URLEncoder.encode(title, "UTF-8");
            String body = http("https://lrclib.net/api/get?" + q);
            String plain = null;
            if (body != null) plain = new JSONObject(body).optString("plainLyrics", "");
            if (plain == null || plain.trim().length() == 0) {
                String sr = http("https://lrclib.net/api/search?q=" + URLEncoder.encode(artist + " " + title, "UTF-8"));
                if (sr != null) { JSONArray a = new JSONArray(sr); for (int i = 0; i < a.length() && i < 5; i++) { String p = a.getJSONObject(i).optString("plainLyrics", ""); if (p.trim().length() > 0) { plain = p; break; } } }
            }
            if (plain == null || plain.trim().length() == 0) return null;
            String[] ls = plain.replace("\r", "").split("\n"); if (ls.length > 200) ls = java.util.Arrays.copyOf(ls, 200);
            Res r = new Res(); r.o = ls; r.t = new String[ls.length]; for (int i = 0; i < ls.length; i++) r.t[i] = ""; r.src = "LRCLIB";
            return r;
        } catch (Throwable e) { return null; }
    }
}
