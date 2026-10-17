package com.moidela.app;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

final class Net {
    static String get(String u) { return call(u, null); }
    static String post(String u, String json) { return call(u, json); }
    static String postBytes(String u, byte[] body, String type) {   // загрузка картинки (сырые байты)
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(u).openConnection();
            h.setConnectTimeout(15000);
            h.setReadTimeout(60000);
            h.setRequestMethod("POST");
            h.setDoOutput(true);
            h.setFixedLengthStreamingMode(body.length);
            h.setRequestProperty("Content-Type", type);
            OutputStream o = h.getOutputStream();
            o.write(body);
            o.close();
            int code = h.getResponseCode();
            InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
            if (in == null) return code >= 400 ? null : "";
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            in.close();
            return code >= 400 ? null : b.toString("UTF-8");
        } catch (Exception e) {
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }
    private static String call(String u, String json) {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(u).openConnection();
            h.setConnectTimeout(15000);
            h.setReadTimeout(20000);
            if (json != null) {
                h.setRequestMethod("POST");
                h.setDoOutput(true);
                h.setRequestProperty("Content-Type", "application/json");
                OutputStream o = h.getOutputStream();
                o.write(json.getBytes("UTF-8"));
                o.close();
            }
            int code = h.getResponseCode();
            InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
            if (in == null) return null;
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            in.close();
            return code >= 400 ? null : b.toString("UTF-8");
        } catch (Exception e) {
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }
}
