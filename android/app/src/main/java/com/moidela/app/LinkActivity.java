package com.moidela.app;

import android.Manifest;
import android.app.Activity;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

public class LinkActivity extends Activity {
    @Override protected void onCreate(Bundle s) {
        super.onCreate(s);
        try { init(); } catch (Throwable e) { Toast.makeText(this, "Ошибка подключения: " + e, Toast.LENGTH_LONG).show(); finish(); }
    }

    private void init() {
        Uri d = getIntent().getData();
        String k = d == null ? null : d.getQueryParameter("k"), b = d == null ? null : d.getQueryParameter("b");
        if (k == null || k.length() < 32 || b == null || !b.startsWith("https://")) { Toast.makeText(this, "Ссылка подключения не подошла", Toast.LENGTH_LONG).show(); finish(); return; }
        Store.p(this).edit().putString("key", k).putString("base", b).apply();
        try { Sync.ensureJob(this); } catch (Throwable e) { Toast.makeText(this, "Фоновая синхронизация: " + e, Toast.LENGTH_LONG).show(); }
        final android.content.Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() { Sync.run(c); } }).start();
        Toast.makeText(this, "Телефон подключён ✓ будильники, виджет и плитка работают", Toast.LENGTH_LONG).show();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        } else finish();
    }
    @Override public void onRequestPermissionsResult(int rc, String[] p, int[] r) { finish(); }
}
