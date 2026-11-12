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
import com.k2fsa.sherpa.onnx.OfflineTransducerModelConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.RandomAccessFile;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Запись совещания в WAV (16 кГц, моно) и офлайн-расшифровка (GigaAM v3 RNNT через sherpa-onnx, резка по тихим местам). Работает как служба переднего плана. */
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
    static boolean modelReady(Context c) { File d = modelDir(c); return new File(d, "encoder.int8.onnx").exists() && new File(d, "decoder.onnx").exists() && new File(d, "joiner.onnx").exists() && new File(d, "tokens.txt").exists() && new File(d, "ver4").exists() && new File(d, ".ok").exists(); }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent in, int flags, int id) {
        String a = in == null ? "" : in.getAction();
        log(this, "команда: " + a + " rec=" + rec + " tr=" + tr);
        if ("rec".equals(a) && !rec && !tr) { go("Идёт запись совещания", "Нажмите, чтобы открыть", true); startRec(); }
        else if ("tr".equals(a) && !rec && !tr) { final String p = in.getStringExtra("wav"); go("Расшифровка…", "0%", false); startTr(p); }
        else if ("imp".equals(a) && !rec && !tr) { go("Импорт записи…", "Подготовка звука", false); startImp(android.net.Uri.parse(in.getStringExtra("uri")), in.getStringExtra("name")); }
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
    static void header(RandomAccessFile r, long data) throws Exception {
        long rate = 16000, byteRate = rate * 2; r.seek(0);
        r.writeBytes("RIFF"); w32(r, 36 + data); r.writeBytes("WAVEfmt "); w32(r, 16); w16(r, 1); w16(r, 1); w32(r, rate); w32(r, byteRate); w16(r, 2); w16(r, 16); r.writeBytes("data"); w32(r, data);
    }
    private static void w32(RandomAccessFile r, long v) throws Exception { r.write((int) (v & 0xff)); r.write((int) ((v >> 8) & 0xff)); r.write((int) ((v >> 16) & 0xff)); r.write((int) ((v >> 24) & 0xff)); }
    private static void w16(RandomAccessFile r, int v) throws Exception { r.write(v & 0xff); r.write((v >> 8) & 0xff); }

    // ---------------- импорт из файла ----------------
    private void startImp(final android.net.Uri u, final String nm) {
        tr = true; stop = false; prog = 0; trName = nm; status = "Импорт: перекодирую звук…"; log(this, "импорт: " + nm);
        final File wf = new File(dir(this), "meet-imp-" + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date()) + ".wav");
        new Thread(new Runnable() { public void run() {
            boolean ok = false;
            try { long sec = MeetStore.decodeToWav(MeetService.this, u, wf); log(MeetService.this, "импорт готов: " + sec + " с"); status = "Импорт готов: " + (sec / 60) + " мин " + (sec % 60) + " с"; ok = sec > 0; }
            catch (Throwable e) { status = "Не удалось прочитать файл: " + e.getMessage(); log(MeetService.this, "импорт ОШИБКА: " + e); wf.delete(); }
            tr = false; stop = false;
            if (ok && modelReady(MeetService.this)) { go("Расшифровка…", "0%", false); startTr(wf.getAbsolutePath()); }
            else { if (ok) status += ". Скачайте модель, чтобы расшифровать"; stopForeground(true); stopSelf(); }
        } }).start();
    }

    // ---------------- расшифровка ----------------
    private void startTr(final String wav) {
        log(this, "расшифровка: старт " + wav); hpX = 0; hpY = 0; tr = true; stop = false; prog = 0; segs = 0; lines = 0; peakAll = 0; trName = new File(wav).getName(); status = "Расшифровка…";
        new Thread(new Runnable() { public void run() {
            File txt = new File(wav.replace(".wav", ".txt")), part = new File(wav.replace(".wav", ".part"));
            OfflineRecognizer rc = null; java.io.Writer w = null; FileInputStream in = null;
            try {
                File md = modelDir(MeetService.this); log(MeetService.this, "модель RNNT: " + new File(md, "encoder.int8.onnx").length() + " байт; создаю распознаватель");
                rc = new OfflineRecognizer(OfflineRecognizerConfig.builder().setOfflineModelConfig(OfflineModelConfig.builder()
                    .setTransducer(OfflineTransducerModelConfig.builder().setEncoder(new File(md, "encoder.int8.onnx").getAbsolutePath())
                        .setDecoder(new File(md, "decoder.onnx").getAbsolutePath()).setJoiner(new File(md, "joiner.onnx").getAbsolutePath()).build())
                    .setModelType("nemo_transducer").setTokens(new File(md, "tokens.txt").getAbsolutePath()).setNumThreads(4).setDebug(false).build()).build());
                log(MeetService.this, "распознаватель создан; читаю запись");
                File wf = new File(wav); long len = wf.length(), done = 44;
                in = new FileInputStream(wf); in.skip(44);
                w = new OutputStreamWriter(new FileOutputStream(part), "UTF-8");
                // Без детектора речи (он выкидывал до 40% речи): копим звук и режем куски ~25 с в самом тихом месте ±3 с
                final int SR = 16000, L = 25 * SR, A = 3 * SR;
                float[] buf = new float[L + 2 * A + SR]; int bn = 0; long t0 = 0;   // t0 — начало буфера в отсчётах
                byte[] bb = new byte[SR * 2]; int n; long lastU = 0;
                while (!stop && (n = in.read(bb)) > 0) {
                    int k = n / 2;
                    if (bn + k > buf.length) buf = java.util.Arrays.copyOf(buf, bn + k + SR);
                    float[] fs = new float[k];
                    for (int i = 0; i < k; i++) { fs[i] = (short) ((bb[2 * i] & 0xff) | (bb[2 * i + 1] << 8)) / 32768f; float av = Math.abs(fs[i]); if (av > peakAll) peakAll = av; }
                    hp(fs); System.arraycopy(fs, 0, buf, bn, k); bn += k; done += n;
                    if (bn >= L + A) {
                        int cut = quiet(buf, L - A, L + A);
                        decodeOut(rc, java.util.Arrays.copyOf(buf, cut), (int) (t0 / SR), w); segs++;
                        System.arraycopy(buf, cut, buf, 0, bn - cut); bn -= cut; t0 += cut;
                    }
                    prog = (int) (done * 100 / Math.max(1, len));
                    if (System.currentTimeMillis() - lastU > 3000) { lastU = System.currentTimeMillis(); upd("Расшифровка " + prog + "%", trName, prog); }
                }
                if (!stop && bn > SR / 3) { decodeOut(rc, java.util.Arrays.copyOf(buf, bn), (int) (t0 / SR), w); segs++; }
                log(MeetService.this, "чтение закончено: кусков " + segs + ", абзацев " + lines + ", пик " + Math.round(peakAll * 100) + "%");
                w.close(); w = null;
                int pk = Math.round(peakAll * 100);
                if (stop) { status = "Расшифровка прервана" + (lines > 0 ? " (частичный текст сохранён)" : ""); if (lines > 0) part.renameTo(txt); else part.delete(); }
                else if (lines == 0) { part.delete(); status = "Речь не распознана. Пик сигнала записи: " + pk + "% (меньше 2% — микрофон почти не писал; тогда проверьте разрешение и поднесите телефон ближе)."; prog = 100; }
                else { part.renameTo(txt); status = "Готово: " + lines + " абзацев, пик сигнала " + pk + "%"; prog = 100;
                    try { MeetStore.export(MeetService.this, new File(wav), txt); status += ". Сохранено в Документы/Совещания (аудио, текст, PDF)"; } catch (Throwable ee) { log(MeetService.this, "экспорт: " + ee); status += ". В Документы не сохранилось: " + ee.getMessage(); } }
            } catch (Throwable e) { status = "Ошибка расшифровки: " + e; log(MeetService.this, "ОШИБКА: " + e); }
            finally {
                try { if (w != null) w.close(); } catch (Throwable e) { } try { if (in != null) in.close(); } catch (Throwable e) { }
                try { if (rc != null) rc.release(); } catch (Throwable e) { }
            }
            tr = false; stop = false; stopForeground(true); stopSelf();
        } }).start();
    }

    // ---- подготовка звука: срез низкого гула (кондиционер, стук по столу, ветер) — 1-го порядка, ~90 Гц; состояние переносится между кусками ----
    private float hpX = 0, hpY = 0;
    private void hp(float[] x) {
        final float a = 0.9658f;   // exp(-2*pi*90/16000)
        for (int i = 0; i < x.length; i++) { float v = x[i]; float y = a * (hpY + v - hpX); hpX = v; hpY = y; x[i] = y; }
    }

    // ---- словарь автозамены: типичные аббревиатуры, которые распознаются буквами/строчными ----
    private static final String[][] DICT = {
        {"н\\s?к\\s?у|эн\\s?ку", "НКУ"}, {"в\\s?р\\s?у", "ВРУ"}, {"а\\s?в\\s?р", "АВР"}, {"у\\s?з\\s?о", "УЗО"},
        {"т\\s?к\\s?п", "ТКП"}, {"т\\s?з", "ТЗ"}, {"к\\s?з", "КЗ"}, {"о\\s?т\\s?р", "ОТР"}, {"р\\s?у\\s?н\\s?н", "РУНН"},
        {"гост", "ГОСТ"}, {"ср\\s?н\\s?к\\s?у\\s?(?:1|один)", "СРНКУ1"}, {"ш\\s?о\\s?т", "ШОТ"}, {"с\\s?о\\s?п\\s?т", "СОПТ"},
    };
    private static java.util.regex.Pattern[] DP;
    private static String fixTerms(String s) {
        if (DP == null) { java.util.regex.Pattern[] p = new java.util.regex.Pattern[DICT.length];
            for (int i = 0; i < DICT.length; i++) p[i] = java.util.regex.Pattern.compile("(?<![\\p{L}\\p{N}])(?:" + DICT[i][0] + ")(?![\\p{L}\\p{N}])", java.util.regex.Pattern.CASE_INSENSITIVE | java.util.regex.Pattern.UNICODE_CASE);
            DP = p; }
        for (int i = 0; i < DICT.length; i++) s = DP[i].matcher(s).replaceAll(DICT[i][1]);
        return s;
    }

    /** Самое тихое место (окно 0,2 с, шаг 0,1 с) в отрезке [from, to) — там режем, чтобы не рвать слова. */
    private static int quiet(float[] x, int from, int to) {
        int win = 3200, hop = 1600, best = (from + to) / 2; double bv = Double.MAX_VALUE;
        for (int c = from; c + win <= to; c += hop) { double e = 0; for (int k = 0; k < win; k++) { float v = x[c + k]; e += v * v; } if (e < bv) { bv = e; best = c + win / 2; } }
        return best;
    }

    // «э-э», «а-а-а», «м-м» — убираем; хвосты запятых и пробелы чиним
    private static final java.util.regex.Pattern FILL = java.util.regex.Pattern.compile("(^|[\\s,.;:—(«\"-])(?:[эЭ]+(?:-[эЭ]+)*|[аА]+(?:-[аА]+)+|[аА]{3,}|[мМ]+(?:-[мМ]+)+|[мМ]{2,}|[ыЫ]+(?:-[ыЫ]+)+)(?=[\\s,.!?;:…»\")]|$)");
    static String clean(String t) {
        String s = t; for (int i = 0; i < 2; i++) s = FILL.matcher(s).replaceAll("$1");
        s = s.replaceAll("\\s+([,.!?;:…])", "$1").replaceAll("([,;:])(?:\\s*[,;:])+", "$1").replaceAll(",\\s*([.!?…])", "$1").replaceAll("([.!?…])\\s*[,;:]+", "$1")
             .replaceAll("\\s{2,}", " ").replaceAll("^[\\s,.;:—-]+", "").trim();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("([.!?…]\\s+)([а-яё])").matcher(s); StringBuffer sb = new StringBuffer();
        while (m.find()) m.appendReplacement(sb, m.group(1) + m.group(2).toUpperCase());
        m.appendTail(sb); s = sb.toString();
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private void decodeOut(OfflineRecognizer rc, float[] x, int t, java.io.Writer w) throws Exception {
        {
            float pk = 0; for (float v : x) { float a = Math.abs(v); if (a > pk) pk = a; }
            {   // громкость куска — к среднему уровню (RMS 0,1, до ×20); числа float, поэтому «перегруза» нет (так измерено 12.11)
                double sq = 0; for (float v : x) sq += v * v; float rms = (float) Math.sqrt(sq / Math.max(1, x.length));
                if (rms <= 1e-5f) return;
                float g = Math.min(20f, 0.1f / rms); for (int i = 0; i < x.length; i++) x[i] *= g;
            }
            log(this, "декодирую кусок " + x.length / 16000 + " с, пик " + Math.round(pk * 100) + "%");
            OfflineStream st = rc.createStream(); log(this, "  поток создан");
            st.acceptWaveform(x, 16000); log(this, "  звук передан");
            rc.decode(st); log(this, "  декодирование выполнено");
            com.k2fsa.sherpa.onnx.OfflineRecognizerResult rr = rc.getResult(st); log(this, "  результат получен");
            String txt = rr.getText().trim(); log(this, "  текст: «" + txt + "»"); st.release();
            if (txt.length() == 0) return;
            txt = clean(fixTerms(txt)); if (txt.length() == 0) return; txt = Character.toUpperCase(txt.charAt(0)) + txt.substring(1);
            char lc = txt.charAt(txt.length() - 1); if (lc != '.' && lc != '!' && lc != '?' && lc != '…') txt += ".";   // у GigaAM v3 пунктуация уже есть — не дублируем
            w.write(String.format(Locale.US, "[%02d:%02d:%02d] %s\n", t / 3600, (t / 60) % 60, t % 60, txt)); w.flush(); lines++;
        }
    }
}
