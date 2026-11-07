package com.moidela.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.HttpURLConnection;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.util.Arrays;
import java.util.Comparator;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Совещания: запись (с экраном «живой» службы), скачивание модели, расшифровка, текст/поделиться/сохранить в Загрузки. */
public class MeetActivity extends Activity {
    static final String URL_MODEL = "https://github.com/baklanov1993dmitry-gif/moi-dela/releases/download/asr/asr-ru.zip";
    static volatile String dlStatus = ""; static volatile boolean dlBusy = false;
    private LinearLayout box;
    private final Handler h = new Handler(Looper.getMainLooper());
    private String sig = "";

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + .5f); }
    private TextView tv(String s, int sp, String col, boolean bold) { TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(Color.parseColor(col)); t.setTypeface(null, bold ? Typeface.BOLD : Typeface.NORMAL); t.setPadding(0, dp(5), 0, dp(5)); return t; }
    private Button bt(String s, View.OnClickListener l) { Button b = new Button(this); b.setText(s); b.setOnClickListener(l); return b; }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(Color.parseColor("#14121f"));
        box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(18), dp(22), dp(18), dp(40)); sv.addView(box); setContentView(sv);
    }
    @Override protected void onResume() { super.onResume(); tick.run(); }
    @Override protected void onPause() { super.onPause(); h.removeCallbacks(tick); }

    private final Runnable tick = new Runnable() { public void run() { build(); h.postDelayed(this, 1000); } };

    private File[] wavs() {
        File[] a = MeetService.dir(this).listFiles(); if (a == null) return new File[0];
        java.util.ArrayList<File> r = new java.util.ArrayList<>(); for (File f : a) if (f.getName().endsWith(".wav")) r.add(f);
        File[] x = r.toArray(new File[0]); Arrays.sort(x, new Comparator<File>() { public int compare(File p, File q) { return Long.compare(q.lastModified(), p.lastModified()); } }); return x;
    }

    private void build() {
        String s = MeetService.rec + "|" + MeetService.tr + "|" + (MeetService.rec ? (System.currentTimeMillis() - MeetService.recStart) / 1000 : 0) + "|" + MeetService.prog + "|" + MeetService.status + "|" + dlStatus + "|" + dlBusy + "|" + wavs().length + "|" + MeetService.modelReady(this);
        for (File f : wavs()) s += f.getName() + f.lastModified() + new File(f.getPath().replace(".wav", ".txt")).exists();
        if (s.equals(sig)) return; sig = s;
        box.removeAllViews();
        box.addView(tv("Совещания", 22, "#ffffff", true));
        box.addView(tv("Запись → расшифровка на самом телефоне, без интернета. Текст никуда не отправляется.", 13, "#9a93b8", false));
        if (!MeetService.modelReady(this)) {
            box.addView(tv(dlBusy ? dlStatus : "Для расшифровки нужна модель распознавания русской речи (≈230 МБ, скачивается один раз; GigaAM, лицензия для личного использования).", 14, "#e6e1ff", false));
            if (!dlBusy) box.addView(bt("Скачать модель", new View.OnClickListener() { public void onClick(View v) { download(); } }));
        }
        if (MeetService.rec) {
            long sec = (System.currentTimeMillis() - MeetService.recStart) / 1000;
            box.addView(tv("● Идёт запись: " + String.format("%d:%02d:%02d", sec / 3600, (sec / 60) % 60, sec % 60), 18, "#ff6b6b", true));
            box.addView(bt("■ Остановить запись", new View.OnClickListener() { public void onClick(View v) { startService(new Intent(MeetActivity.this, MeetService.class).setAction("stop")); } }));
        } else if (!MeetService.tr) {
            box.addView(bt("● Начать запись совещания", new View.OnClickListener() { public void onClick(View v) { startRec(); } }));
        }
        if (MeetService.tr) {
            box.addView(tv("Расшифровка: " + MeetService.trName + " — " + MeetService.prog + "%", 15, "#a99bff", true));
            box.addView(tv("Можно закрыть экран и убрать телефон: идёт в фоне, в шторке видно прогресс.", 12, "#9a93b8", false));
            box.addView(bt("■ Прервать", new View.OnClickListener() { public void onClick(View v) { startService(new Intent(MeetActivity.this, MeetService.class).setAction("stop")); } }));
        }
        if (MeetService.status.length() > 0) box.addView(tv(MeetService.status, 13, "#9a93b8", false));
        box.addView(tv("Записи", 17, "#ffffff", true));
        File[] ws = wavs();
        if (ws.length == 0) box.addView(tv("Пока нет записей.", 13, "#9a93b8", false));
        for (final File f : ws) {
            final File txt = new File(f.getPath().replace(".wav", ".txt"));
            long sec = Math.max(0, (f.length() - 44) / 32000);
            box.addView(tv(f.getName().replace("meet-", "").replace(".wav", "") + " · " + sec / 60 + " мин · " + (f.length() >> 20) + " МБ" + (txt.exists() ? " · ✓ текст готов" : ""), 14, "#e6e1ff", false));
            LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL);
            if (!txt.exists() && !MeetService.tr && !MeetService.rec && MeetService.modelReady(this)) row.addView(bt("Расшифровать", new View.OnClickListener() { public void onClick(View v) { startForegroundSvc(new Intent(MeetActivity.this, MeetService.class).setAction("tr").putExtra("wav", f.getAbsolutePath())); } }));
            if (txt.exists()) {
                row.addView(bt("Текст", new View.OnClickListener() { public void onClick(View v) { showText(txt); } }));
                row.addView(bt("Поделиться", new View.OnClickListener() { public void onClick(View v) { share(txt); } }));
                row.addView(bt("В «Загрузки»", new View.OnClickListener() { public void onClick(View v) { toDownloads(txt); } }));
            }
            if (!MeetService.tr && !MeetService.rec) row.addView(bt("Удалить", new View.OnClickListener() { public void onClick(View v) { confirmDel(f, txt); } }));
            box.addView(row);
        }
    }

    private void startForegroundSvc(Intent i) { if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i); }

    private void startRec() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 1); return; }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 2);
        startForegroundSvc(new Intent(this, MeetService.class).setAction("rec"));
    }
    @Override public void onRequestPermissionsResult(int rc, String[] p, int[] r) { if (rc == 1 && r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) startRec(); }

    private String read(File f) { try { FileInputStream in = new FileInputStream(f); ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] x = new byte[8192]; int n; while ((n = in.read(x)) > 0) b.write(x, 0, n); in.close(); return b.toString("UTF-8"); } catch (Throwable e) { return ""; } }

    private void showText(File txt) {
        ScrollView sv = new ScrollView(this); TextView t = new TextView(this); t.setText(read(txt)); t.setTextIsSelectable(true); t.setTextSize(15); t.setPadding(dp(16), dp(10), dp(16), dp(10)); sv.addView(t);
        new AlertDialog.Builder(this).setTitle(txt.getName()).setView(sv).setPositiveButton("Закрыть", null).show();
    }
    private void share(File txt) { Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, "Совещание " + txt.getName()).putExtra(Intent.EXTRA_TEXT, read(txt)); startActivity(Intent.createChooser(i, "Отправить текст")); }
    private void toDownloads(File txt) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues(); cv.put(MediaStore.Downloads.DISPLAY_NAME, txt.getName()); cv.put(MediaStore.Downloads.MIME_TYPE, "text/plain"); cv.put(MediaStore.Downloads.RELATIVE_PATH, "Download");
                Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv); OutputStream o = getContentResolver().openOutputStream(u); o.write(read(txt).getBytes("UTF-8")); o.close();
                Toast.makeText(this, "Сохранено в Загрузки: " + txt.getName(), Toast.LENGTH_LONG).show();
            } else Toast.makeText(this, "Используйте «Поделиться»", Toast.LENGTH_LONG).show();
        } catch (Throwable e) { Toast.makeText(this, "Не получилось сохранить: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
    }
    private void confirmDel(final File wav, final File txt) {
        new AlertDialog.Builder(this).setTitle("Удалить запись?").setMessage(txt.exists() ? "Будет удалено аудио и расшифровка. Если текст нужен, сначала сохраните его в «Загрузки» или поделитесь." : "Будет удалено аудио. Расшифровки нет.")
            .setPositiveButton("Удалить", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int w) { wav.delete(); txt.delete(); sig = ""; build(); } }).setNegativeButton("Отмена", null).show();
    }

    private void download() {
        if (dlBusy) return; dlBusy = true; dlStatus = "Загрузка…"; final File dst = MeetService.modelDir(this); final File tmp = new File(getFilesDir(), "asr.tmp"); final File zip = new File(getCacheDir(), "asr-ru.zip");
        new Thread(new Runnable() { public void run() {
            try {
                HttpURLConnection cn = (HttpURLConnection) new URL(URL_MODEL).openConnection(); cn.setConnectTimeout(20000); cn.setReadTimeout(30000); cn.setInstanceFollowRedirects(true);
                int code = cn.getResponseCode(); if (code != 200) throw new Exception("HTTP " + code + " (модель ещё не опубликована?)");
                long total = cn.getContentLengthLong(), got = 0, last = 0; byte[] buf = new byte[65536]; int n;
                InputStream in = cn.getInputStream(); FileOutputStream out = new FileOutputStream(zip);
                while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); got += n; if (System.currentTimeMillis() - last > 500) { last = System.currentTimeMillis(); dlStatus = "Загрузка: " + (got >> 20) + (total > 0 ? " из " + (total >> 20) : "") + " МБ"; } }
                out.close(); in.close(); dlStatus = "Распаковка…";
                rec(tmp); tmp.mkdirs();
                ZipInputStream zi = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip))); ZipEntry e;
                while ((e = zi.getNextEntry()) != null) { if (e.isDirectory()) continue; File f = new File(tmp, new File(e.getName()).getName()); FileOutputStream fo = new FileOutputStream(f); while ((n = zi.read(buf)) > 0) fo.write(buf, 0, n); fo.close(); }
                zi.close(); new File(tmp, ".ok").createNewFile(); rec(dst); tmp.renameTo(dst); zip.delete(); dlStatus = "Модель готова";
            } catch (Throwable e) { dlStatus = "Ошибка загрузки: " + e.getMessage(); }
            dlBusy = false;
        } }).start();
    }
    private static void rec(File f) { if (f.isDirectory()) { File[] a = f.listFiles(); if (a != null) for (File x : a) rec(x); } f.delete(); }
}
