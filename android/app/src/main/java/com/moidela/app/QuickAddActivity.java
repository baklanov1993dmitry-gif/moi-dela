package com.moidela.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;

public class QuickAddActivity extends Activity {
    @Override protected void onCreate(Bundle s) {
        super.onCreate(s);
        if (!Store.linked(this)) {
            Toast.makeText(this, "Сначала подключите телефон: Настройки → Уведомления → «Подключить Android»", Toast.LENGTH_LONG).show();
            startActivity(TodayWidget.openApp(this));
            finish();
            return;
        }
        final EditText et = new EditText(this);
        et.setHint("Что сделать?");
        et.setMinLines(2);
        Intent in = getIntent();
        if (Intent.ACTION_SEND.equals(in.getAction())) {
            String t = in.getStringExtra(Intent.EXTRA_TEXT), sub = in.getStringExtra(Intent.EXTRA_SUBJECT);
            et.setText(sub != null && sub.length() > 0 && (t == null || !t.startsWith(sub)) ? sub + (t == null ? "" : "\n" + t) : (t == null ? "" : t));
        }
        final CheckBox cb = new CheckBox(this);
        cb.setText("На сегодня");
        Button ok = new Button(this);
        ok.setText("Добавить");
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        int pd = (int) (16 * getResources().getDisplayMetrics().density);
        l.setPadding(pd, pd, pd, pd);
        TextView h = new TextView(this);
        h.setText("Новое дело");
        h.setTextSize(18);
        l.addView(h);
        l.addView(et);
        l.addView(cb);
        l.addView(ok);
        setContentView(l);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        final Activity me = this;
        ok.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            final String text = et.getText().toString().trim();
            if (text.length() == 0) return;
            final boolean today = cb.isChecked();
            final android.content.Context c = getApplicationContext();
            new Thread(new Runnable() { public void run() {
                String res = null;
                try {
                    String first = text.split("\n", 2)[0], note = text.contains("\n") ? text.split("\n", 2)[1] : null;
                    JSONObject j = new JSONObject().put("title", first).put("today", today);
                    if (note != null) j.put("note", note);
                    res = Net.post(Store.api(c, "add", ""), j.toString());
                } catch (Exception e) { /* ниже покажем ошибку */ }
                final boolean good = res != null;
                new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() { public void run() { Toast.makeText(c, good ? "Добавлено ✓" : "Нет связи — не добавилось", Toast.LENGTH_SHORT).show(); } });
                if (good) Sync.run(c);
            } }).start();
            me.finish();
        } });
    }
}
