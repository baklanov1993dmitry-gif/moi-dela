package com.moidela.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Полноэкранное напоминание: крупный текст дела и большие кнопки. Поверх экрана блокировки. */
public class AlarmActivity extends Activity {
    private String id;
    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        id = getIntent().getStringExtra("id");
        String title = getIntent().getStringExtra("title");
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(Color.parseColor("#0F0F14")); root.setPadding(dp(24), dp(48), dp(24), dp(32));
        TextView ic = new TextView(this); ic.setText("⏰"); ic.setTextSize(56); ic.setGravity(Gravity.CENTER); root.addView(ic);
        TextView t = new TextView(this); t.setText(title == null || title.length() == 0 ? "Напоминание" : title); t.setTextSize(28); t.setTextColor(Color.WHITE);
        t.setTypeface(null, android.graphics.Typeface.BOLD); t.setGravity(Gravity.CENTER); t.setPadding(0, dp(16), 0, dp(24)); root.addView(t, new LinearLayout.LayoutParams(-1, 0, 1f));
        root.addView(btn("Выключить звук", "stop", "#8FA8FF", "#101018", false));
        root.addView(btn("✓ Готово", "done", "#3AA76D", "#FFFFFF", true));
        LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(btn("+1 час", "snooze", "#26262F", "#FFFFFF", true), new LinearLayout.LayoutParams(0, -2, 1f));
        row.addView(btn("Завтра", "tom", "#26262F", "#FFFFFF", true), new LinearLayout.LayoutParams(0, -2, 1f));
        root.addView(row);
        setContentView(root);
    }

    private Button btn(String text, final String a, String bg, String fg, final boolean closes) {
        Button bt = new Button(this); bt.setText(text); bt.setAllCaps(false); bt.setTextSize(20); bt.setTextColor(Color.parseColor(fg));
        GradientDrawable g = new GradientDrawable(); g.setColor(Color.parseColor(bg)); g.setCornerRadius(dp(18)); bt.setBackground(g);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(72)); p.setMargins(dp(4), dp(6), dp(4), dp(6)); bt.setLayoutParams(p);
        bt.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            try { AlarmReceiver.act(AlarmActivity.this, id, a).send(); } catch (Exception e) { }
            if (closes || a.equals("stop")) finish();
        } });
        return bt;
    }

    @Override protected void onDestroy() {
        super.onDestroy();
    }
}
