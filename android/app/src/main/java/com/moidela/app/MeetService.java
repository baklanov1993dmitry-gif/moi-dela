package com.moidela.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import com.k2fsa.sherpa.onnx.OfflineModelConfig;
import com.k2fsa.sherpa.onnx.OfflineNemoEncDecCtcModelConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineStream;
import com.k2fsa.sherpa.onnx.SileroVadModelConfig;
import com.k2fsa.sherpa.onnx.SpeechSegment;
import com.k2fsa.sherpa.onnx.Vad;
import com.k2fsa.sherpa.onnx.VadModelConfig;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.RandomAccessFile;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Запись совещания в WAV (16 кГц, моно) и офлайн-расшифровка (GigaAM v2 + Silero VAD через sherpa-onnx). Работает как служба переднего плана. */
public class MeetService extends Service {
    static final String CH = "meet";
    static final int NID = 7795;
    static volatile boolean rec = false, tr = false, stop = false;
    static volatile long recStart = 0;
    static volatile int prog = 0;          // 0..100 расшифровки
    static volatile String status = "", trName = "";
    static volatile int segs = 0, lines = 0; static volatile float peakAll = 0;

    static File dir(Context c) { File d = new File(c.getApplicationContext().getFilesDir(), "meet"); d.mkdirs(); return d; }
    static synchronized void log(Context c, String m) {   // журнал шагов в файл: переживает падение процесса
        try {
            File f = new File(dir(c), "log.txt"); if (f.length() > 40000) f.delete();
            FileOutputStream o = new FileOutputStream(f, true); o.write((new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date()) + " " + m + "\n").getBytes("UTF-8")); o.close();
        } catch (Throwable e) { }
    }
    static File modelDir(Context c) { return new File(c.getApplicationContext().getFilesDir(), "asr"); }
    static boolean modelReady(Context c) { File d = modelDir(c); return new File(d, "model.int8.onnx").exists() && new File(d, "tokens.txt").exists() && new File(d, "silero_vad.onnx").exists() && new File(d, ".ok").exists(); }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent in, int flags, int id) {
        String a = in == null ? "" : in.getAction();
        log(this, "команда: " + a + " rec=" + rec + " tr=" + tr);
        if ("rec".equals(a) && !rec && !tr) { go("Идёт запись совещания", "Нажмите, чтобы открыть", true); startRec(); }
        else if ("tr".equals(a) && !rec && !tr) { final String p = in.getStringExtra("wav"); go("Расшифровка…", "0%", false); startTr(p); }
        else if ("stop".equals(a)) { stop = true; }
        else if (!rec && !tr) stopSelf();
        return START_NOT_STICKY;
    }

    private void go(String title, String text, boolean mic) {
        Notification n = notif(title, text, -1);
        if (Build.VERSION.SDK_INT >= 29) startForeground(NID, n, mic ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NID, n);
    }

    private Notification notif(String title, String text, int pct) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) { NotificationChannel c = new NotificationChannel(CH, "Совещания: запись и расшифровка", NotificationManager.IMPORTANCE_LOW); c.setShowBadge(false); nm.createNotificationChannel(c); }
        PendingIntent pi = PendingIntent.getActivity(this, 7795, new Intent(this, MeetActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        PendingIntent ps = PendingIntent.getService(this, 7796, new Intent(this, MeetService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_tile).setContentTitle(title).setContentText(text).setContentIntent(pi).setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false);
        b.addAction(0, rec ? "■ Остановить запись" : "■ Прервать", ps);
        if (pct >= 0) b.setProgress(100, pct, false);
        return b.build();
    }
    private void upd(String title, String text, int pct) { try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NID, notif(title, text, pct)); } catch (Throwable e) { } }

    // ---------------- запись ----------------
    private void startRec() {
        rec = true; stop = false; recStart = System.currentTimeMillis(); status = "Идёт запись";
        final File f = new File(dir(this), "meet-" + new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(new Date()) + ".wav");
        new Thread(new Runnable() { public void run() {
            AudioRecord ar = null; RandomAccessFile raf = null; long total = 0;
            try {
                int sr = 16000, bs = Math.max(AudioRecord.getMinBufferSize(sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), sr * 2);
                ar = new AudioRecord(MediaRecorder.AudioSource.MIC, sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bs);
                raf = new RandomAccessFile(f, "rw"); raf.write(new byte[44]);
                ar.startRecording();
                short[] sb = new short[4096]; byte[] bb = new byte[8192]; long lastN = 0;
                while (!stop) {
                    int n = ar.read(sb, 0, sb.length); if (n <= 0) break;
                    for (int i = 0; i < n; i++) { bb[2 * i] = (byte) (sb[i] & 0xff); bb[2 * i + 1] = (byte) ((sb[i] >> 8) & 0xff); }
                    raf.write(bb, 0, n * 2); total += n * 2L;
                    if (System.currentTimeMillis() - lastN > 15000) { lastN = System.currentTimeMillis(); upd("Идёт запись совещания", ((System.currentTimeMillis() - recStart) / 60000) + " мин", -1); }
                }
                ar.stop();
                header(raf, total);
            } catch (Throwable e) { status = "Ошибка записи: " + e.getMessage(); }
            finally { try { if (ar != null) ar.release(); } catch (Throwable e) { } try { if (raf != null) raf.close(); } catch (Throwable e) { } }
            rec = false; stop = false; if (total > 0) status = "Запись сохранена"; stopForeground(true); stopSelf();
        } }).start();
    }
    private static void header(RandomAccessFile r, long data) throws Exception {
        long rate = 16000, byteRate = rate * 2; r.seek(0);
        r.writeBytes("RIFF"); w32(r, 36 + data); r.writeBytes("WAVEfmt "); w32(r, 16); w16(r, 1); w16(r, 1); w32(r, rate); w32(r, byteRate); w16(r, 2); w16(r, 16); r.writeBytes("data"); w32(r, data);
    }
    private static void w32(RandomAccessFile r, long v) throws Exception { r.write((int) (v & 0xff)); r.write((int) ((v >> 8) & 0xff)); r.write((int) ((v >> 16) & 0xff)); r.write((int) ((v >> 24) & 0xff)); }
    private static void w16(RandomAccessFile r, int v) throws Exception { r.write(v & 0xff); r.write((v >> 8) & 0xff); }

    // ---------------- расшифровка ----------------
    private void startTr(final String wav) {
        log(this, "расшифровка: старт " + wav); tr = true; stop = false; prog = 0; segs = 0; lines = 0; peakAll = 0; trName = new File(wav).getName(); status = "Расшифровка…";
        new Thread(new Runnable() { public void run() {
            File txt = new File(wav.replace(".wav", ".txt")), part = new File(wav.replace(".wav", ".part"));
            OfflineRecognizer rc = null; Vad vad = null; java.io.Writer w = null; FileInputStream in = null;
            try {
                File md = modelDir(MeetService.this); log(MeetService.this, "модель: " + new File(md, "model.int8.onnx").length() + " байт; создаю распознаватель");
                rc = new OfflineRecognizer(OfflineRecognizerConfig.builder().setOfflineModelConfig(OfflineModelConfig.builder()
                    .setNemo(OfflineNemoEncDecCtcModelConfig.builder().setModel(new File(md, "model.int8.onnx").getAbsolutePath()).build())
                    .setTokens(new File(md, "tokens.txt").getAbsolutePath()).setNumThreads(4).setDebug(false).build()).build());
                log(MeetService.this, "распознаватель создан; создаю детектор речи");
                SileroVadModelConfig sv = SileroVadModelConfig.builder().setModel(new File(md, "silero_vad.onnx").getAbsolutePath()).setThreshold(0.45f).setMinSilenceDuration(0.6f).setMinSpeechDuration(0.3f).setMaxSpeechDuration(20f).build();
                vad = new Vad(VadModelConfig.builder().setSileroVadModelConfig(sv).setSampleRate(16000).setNumThreads(1).setDebug(false).build());
                log(MeetService.this, "детектор создан; читаю запись");
                File wf = new File(wav); long len = wf.length(), done = 44;
                in = new FileInputStream(wf); in.skip(44);
                w = new OutputStreamWriter(new FileOutputStream(part), "UTF-8");
                byte[] bb = new byte[16000 * 2]; int n; long lastU = 0;
                while (!stop && (n = in.read(bb)) > 0) {
                    float[] fs = new float[n / 2];
                    for (int i = 0; i < fs.length; i++) { fs[i] = (short) ((bb[2 * i] & 0xff) | (bb[2 * i + 1] << 8)) / 32768f; float av = Math.abs(fs[i]); if (av > peakAll) peakAll = av; }
                    vad.acceptWaveform(fs); done += n;
                    drain(rc, vad, w);
                    prog = (int) (done * 100 / Math.max(1, len));
                    if (System.currentTimeMillis() - lastU > 3000) { lastU = System.currentTimeMillis(); upd("Расшифровка " + prog + "%", trName, prog); }
                }
                log(MeetService.this, "чтение закончено: сегментов " + segs + ", фраз " + lines + ", пик " + Math.round(peakAll * 100) + "%");
                if (!stop) { vad.flush(); drain(rc, vad, w); }
                log(MeetService.this, "после flush: сегментов " + segs + ", фраз " + lines);
                if (!stop && lines == 0) { status = "Детектор речи ничего не нашёл, пробую без него…"; fallback(rc, wav, w); }   // короткие/тихие записи: режем на куски по 15 с
                w.close(); w = null;
                int pk = Math.round(peakAll * 100);
                if (stop) { status = "Расшифровка прервана" + (lines > 0 ? " (частичный текст сохранён)" : ""); if (lines > 0) part.renameTo(txt); else part.delete(); }
                else if (lines == 0) { part.delete(); status = "Речь не распознана. Пик сигнала записи: " + pk + "% (меньше 2% — микрофон почти не писал; тогда проверьте разрешение и поднесите телефон ближе)."; prog = 100; }
                else { part.renameTo(txt); status = "Готово: " + lines + " фраз, пик сигнала " + pk + "%"; prog = 100; }
            } catch (Throwable e) { status = "Ошибка расшифровки: " + e; log(MeetService.this, "ОШИБКА: " + e); }
            finally {
                try { if (w != null) w.close(); } catch (Throwable e) { } try { if (in != null) in.close(); } catch (Throwable e) { }
                try { if (vad != null) vad.release(); } catch (Throwable e) { } try { if (rc != null) rc.release(); } catch (Throwable e) { }
            }
            tr = false; stop = false; stopForeground(true); stopSelf();
        } }).start();
    }

    private void drain(OfflineRecognizer rc, Vad vad, java.io.Writer w) throws Exception {
        while (!vad.empty()) {
            SpeechSegment s = vad.front(); float[] x = s.getSamples(); int t = s.getStart() / 16000; vad.pop(); segs++;
            decodeOut(rc, x, t, w);
        }
    }

    private void fallback(OfflineRecognizer rc, String wav, java.io.Writer w) throws Exception {
        FileInputStream in = new FileInputStream(wav); in.skip(44); byte[] bb = new byte[16000 * 2 * 15]; int n, t = 0;
        while (!stop && (n = in.read(bb)) > 0) { float[] x = new float[n / 2]; for (int i = 0; i < x.length; i++) x[i] = (short) ((bb[2 * i] & 0xff) | (bb[2 * i + 1] << 8)) / 32768f; decodeOut(rc, x, t, w); t += 15; }
        in.close();
    }

    private void decodeOut(OfflineRecognizer rc, float[] x, int t, java.io.Writer w) throws Exception {
        {
            float pk = 0; for (float v : x) { float a = Math.abs(v); if (a > pk) pk = a; }
            if (pk > 0.002f && pk < 0.5f) { float g = Math.min(20f, 0.7f / pk); for (int i = 0; i < x.length; i++) x[i] *= g; }   // тихая запись с телефона на столе: подтягиваем громкость
            log(this, "декодирую кусок " + x.length / 16000 + " с"); OfflineStream st = rc.createStream(); st.acceptWaveform(x, 16000); rc.decode(st);
            String txt = rc.getResult(st).getText().trim(); st.release();
            if (txt.length() == 0) return;
            txt = Character.toUpperCase(txt.charAt(0)) + txt.substring(1) + ".";
            w.write(String.format(Locale.US, "[%02d:%02d:%02d] %s\n", t / 3600, (t / 60) % 60, t % 60, txt)); w.flush(); lines++;
        }
    }
}
