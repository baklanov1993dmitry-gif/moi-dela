package com.moidela.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsCallback;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Нейроголос Piper (офлайн, sherpa-onnx). Голос качается один раз (~65 МБ) с релиза «voices» и лежит в памяти приложения. */
final class Neural {
    static final String[] IDS = {"", "y:filipp", "y:ermil", "y:madirus", "y:zahar", "y:alexander", "y:alena", "y:marina", "denis", "dmitri", "ruslan", "irina"};
    static final String[] NAMES = {"Выключен (системный голос)", "☁ Яндекс: Филипп (муж.)", "☁ Яндекс: Ермил (муж.)", "☁ Яндекс: Мадирус (муж.)", "☁ Яндекс: Захар (муж.)", "☁ Яндекс: Александр (муж.)", "☁ Яндекс: Алёна (жен.)", "☁ Яндекс: Марина (жен.)",
        "Офлайн Piper: Денис", "Офлайн Piper: Дмитрий", "Офлайн Piper: Руслан", "Офлайн Piper: Ирина (жен.)"};
    static boolean isCloud(String v) { return v.startsWith("y:"); }
    static final String BASE = "https://github.com/baklanov1993dmitry-gif/moi-dela/releases/download/voices/voice-";

    static volatile String status = "";      // для экрана настроек
    static volatile boolean busy = false;
    private static OfflineTts eng; private static String engVoice = ""; private static float engSpeed = 0;

    static String selected(SharedPreferences sp) { int i = sp.getInt("v_neural", 0); return i > 0 && i < IDS.length ? IDS[i] : ""; }
    static File dir(Context c, String v) { return new File(c.getFilesDir(), "piper/" + v); }
    static boolean ready(Context c, String v) { if (isCloud(v)) return true; File d = dir(c, v); return v.length() > 0 && new File(d, "model.onnx").exists() && new File(d, "tokens.txt").exists() && new File(d, "espeak-ng-data").isDirectory() && new File(d, ".ok").exists(); }

    /** Скачать и распаковать голос (в фоне). onEnd — в потоке загрузки. */
    static synchronized void download(final Context ctx, final String v, final Runnable onEnd) {
        if (busy) return; busy = true; status = "Загрузка…";
        new Thread(new Runnable() { public void run() {
            File zip = new File(ctx.getCacheDir(), "voice-" + v + ".zip");
            try {
                HttpURLConnection cn = (HttpURLConnection) new URL(BASE + v + ".zip").openConnection();
                cn.setConnectTimeout(20000); cn.setReadTimeout(30000); cn.setInstanceFollowRedirects(true);
                int code = cn.getResponseCode(); if (code != 200) throw new Exception("HTTP " + code + " (голос ещё не опубликован?)");
                long total = cn.getContentLengthLong(), got = 0; byte[] buf = new byte[65536]; int n; long last = 0;
                InputStream in = cn.getInputStream(); FileOutputStream out = new FileOutputStream(zip);
                while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); got += n; if (System.currentTimeMillis() - last > 400) { last = System.currentTimeMillis(); status = "Загрузка: " + (got >> 20) + (total > 0 ? " из " + (total >> 20) : "") + " МБ"; } }
                out.close(); in.close();
                status = "Распаковка…";
                File d = dir(ctx, v), tmp = new File(d.getParentFile(), v + ".tmp"); deleteRec(tmp); tmp.mkdirs();
                ZipInputStream zi = new ZipInputStream(new java.io.BufferedInputStream(new java.io.FileInputStream(zip))); ZipEntry e;
                while ((e = zi.getNextEntry()) != null) {
                    File f = new File(tmp, e.getName()); if (!f.getCanonicalPath().startsWith(tmp.getCanonicalPath())) continue;
                    if (e.isDirectory()) { f.mkdirs(); continue; }
                    f.getParentFile().mkdirs(); FileOutputStream fo = new FileOutputStream(f); while ((n = zi.read(buf)) > 0) fo.write(buf, 0, n); fo.close();
                }
                zi.close(); new File(tmp, ".ok").createNewFile();
                deleteRec(d); tmp.renameTo(d); status = "Готово ✓ (" + dirSize(d) / 1048576 + " МБ)";
            } catch (Throwable t) { status = "Не получилось: " + t.getMessage(); }
            finally { zip.delete(); busy = false; if (onEnd != null) onEnd.run(); }
        } }).start();
    }
    private static long dirSize(File f) { if (f.isFile()) return f.length(); long s = 0; File[] a = f.listFiles(); if (a != null) for (File x : a) s += dirSize(x); return s; }
    static void deleteRec(File f) { if (f.isDirectory()) { File[] a = f.listFiles(); if (a != null) for (File x : a) deleteRec(x); } f.delete(); }

    private static synchronized OfflineTts engine(Context c, String v, float speed) {
        if (eng != null && v.equals(engVoice) && speed == engSpeed) return eng;
        try { if (eng != null) eng.release(); } catch (Throwable t) {} eng = null;
        File d = dir(c, v);
        OfflineTtsVitsModelConfig vits = OfflineTtsVitsModelConfig.builder().setModel(new File(d, "model.onnx").getPath()).setTokens(new File(d, "tokens.txt").getPath())
            .setDataDir(new File(d, "espeak-ng-data").getPath()).setLengthScale(1f / speed).build();
        OfflineTtsModelConfig m = OfflineTtsModelConfig.builder().setVits(vits).setNumThreads(2).setDebug(false).build();
        eng = new OfflineTts(OfflineTtsConfig.builder().setModel(m).build()); engVoice = v; engSpeed = speed; return eng;
    }

    /** Озвучить текст (в фоне, потоково). onEnd вызывается всегда; ok=false — не вышло (можно прочитать системным голосом). */
    interface Done { void end(boolean ok); }
    private static volatile int token = 0; private static volatile android.media.MediaPlayer curMp = null; private static volatile AudioTrack curAt = null;
    /** прервать любую текущую озвучку (чтобы голоса не накладывались) */
    static void stopAll() { token++; try { if (curMp != null) curMp.stop(); } catch (Throwable e) {} try { if (curAt != null) { curAt.pause(); curAt.flush(); } } catch (Throwable e) {} }
    private static void cloud(final Context ctx, final String v, final String text, final float speed, final Done end) {
        final int my = ++token;
        new Thread(new Runnable() { public void run() {
            boolean ok = false; File f = null;
            try {
                String r = Net.post(Store.api(ctx.getApplicationContext(), "tts", ""), new org.json.JSONObject().put("text", text).put("voice", v.substring(2)).put("speed", speed).toString());
                String b64 = r == null ? "" : new org.json.JSONObject(r).optString("audio", "");
                if (b64.length() == 0) throw new Exception("no audio");
                f = new File(ctx.getCacheDir(), "tts.mp3"); FileOutputStream o = new FileOutputStream(f); o.write(android.util.Base64.decode(b64, android.util.Base64.DEFAULT)); o.close();
                final Object lock = new Object(); final boolean[] fin = {false};
                android.media.MediaPlayer mp = new android.media.MediaPlayer();
                mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                mp.setDataSource(f.getPath()); mp.prepare(); if (my != token) { try { mp.release(); } catch (Throwable e) {} return; } curMp = mp;
                mp.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener() { public void onCompletion(android.media.MediaPlayer m) { synchronized (lock) { fin[0] = true; lock.notifyAll(); } } });
                mp.start();
                synchronized (lock) { long t0 = System.currentTimeMillis(); while (!fin[0] && System.currentTimeMillis() - t0 < 25000) lock.wait(500); }
                try { mp.release(); } catch (Throwable e) {}
                if (curMp == mp) curMp = null; ok = my == token;
            } catch (Throwable e) { ok = false; }
            finally { end.end(ok); }
        } }).start();
    }
    static void speak(final Context ctx, final String v, final String text, final float speed, final Done end) {
        if (isCloud(v)) { cloud(ctx, v, text, speed, end); return; }
        new Thread(new Runnable() { public void run() {
            boolean ok = false; AudioTrack at = null;
            try {
                final OfflineTts t = engine(ctx.getApplicationContext(), v, speed);
                final int sr = t.getSampleRate();
                int min = AudioTrack.getMinBufferSize(sr, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT);
                at = new AudioTrack.Builder().setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setBufferSizeInBytes(Math.max(min, sr * 4)).setTransferMode(AudioTrack.MODE_STREAM).build();
                final AudioTrack tr = at; tr.play();
                t.generateWithCallback(text, 0, 1.0f, new OfflineTtsCallback() { public Integer invoke(float[] s) { tr.write(s, 0, s.length, AudioTrack.WRITE_BLOCKING); return 1; } });
                // дожидаемся, пока доиграет хвост
                Thread.sleep(250); at.stop(); ok = true;
            } catch (Throwable e) { ok = false; }
            finally { try { if (at != null) at.release(); } catch (Throwable e) {} end.end(ok); }
        } }).start();
    }
}
