package com.moidela.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Полный текст песни: строка оригинала и под ней перевод. Без аргументов — последняя песня и включение доступа к уведомлениям. */
public class LyricsActivity extends Activity {
    private LinearLayout box;
    private TextView head, st;

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + .5f); }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(Color.parseColor("#14121f"));
        box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(18), dp(22), dp(18), dp(40)); sv.addView(box);
        setContentView(sv);
        head = tv("", 20, "#ffffff", true); box.addView(head);
        st = tv("", 13, "#9a93b8", false); box.addView(st);
        load(getIntent());
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); load(i); }
    @Override protected void onResume() { super.onResume(); }

    private TextView tv(String s, int sp, String col, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(Color.parseColor(col)); t.setTypeface(null, bold ? Typeface.BOLD : Typeface.NORMAL);
        t.setPadding(0, dp(4), 0, dp(4)); t.setTextIsSelectable(true); return t;
    }
    private boolean accessOn() {
        String s = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return s != null && s.contains(getPackageName());
    }

    private void load(Intent in) {
        while (box.getChildCount() > 2) box.removeViewAt(2);
        String a = in.getStringExtra("artist"), t = in.getStringExtra("title");
        if (a == null || t == null) { a = Store.p(this).getString("lyr_artist", ""); t = Store.p(this).getString("lyr_title", ""); }
        if (!accessOn()) {
            st.setText("Чтобы тексты появлялись под плеером, включите «Мои дела» в списке доступа к уведомлениям. Если Android пишет «Ограниченная настройка» — откройте «О приложении» → ⋮ → «Разрешить ограниченные настройки».");
            Button bt = new Button(this); bt.setText("Открыть настройки доступа");
            bt.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")); } });
            box.addView(bt);
        }
        if (t == null || t.length() == 0) { head.setText("Тексты песен"); if (accessOn()) st.setText("Включите песню в Яндекс Музыке — текст появится в шторке под плеером."); return; }
        head.setText(a + (a.length() > 0 ? " — " : "") + t);
        final String ra = a, rt = t;
        Button rb = new Button(this); rb.setText("🔔 На звонок (в список)");
        rb.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { new Thread(new Runnable() { public void run() { RingMark.mark(getApplicationContext(), ra, rt); } }).start(); } });
        box.addView(rb);
        if (accessOn()) st.setText("Ищу текст…");
        final String fa = a, ft = t;
        new Thread(new Runnable() { public void run() {
            final LyricsFetch.Res r = LyricsFetch.get(getApplicationContext(), fa, ft);
            runOnUiThread(new Runnable() { public void run() { show(r); } });
        } }).start();
    }

    private void show(LyricsFetch.Res r) {
        if (r == null) { st.setText("Текст не найден (Амальгама и LRCLIB)."); return; }
        if (accessOn()) st.setText("Источник: " + r.src);
        for (int i = 0; i < r.o.length; i++) {
            String o = r.o[i] == null ? "" : r.o[i].trim();
            if (o.length() == 0) { View sp = new View(this); sp.setLayoutParams(new LinearLayout.LayoutParams(1, dp(10))); box.addView(sp); continue; }
            TextView a = tv(o, 17, "#ffffff", false); a.setPadding(0, dp(6), 0, 0); box.addView(a);
            String t = i < r.t.length && r.t[i] != null ? r.t[i].trim() : "";
            if (t.length() > 0) { TextView b = tv(t, 15, "#a99bff", false); b.setPadding(0, 0, 0, dp(2)); box.addView(b); }
        }
    }
}
