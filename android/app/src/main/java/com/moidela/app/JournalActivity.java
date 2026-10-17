package com.moidela.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

/** Таймер журнала: нет таймера → «Начать»; идёт → форма (что делал, тема, 🟢⚪🔴, минуты) → запись. */
public class JournalActivity extends Activity {
    EditText et, emin;
    Spinner spCat;
    String val = "";
    Button[] vb = new Button[3];
    final String[] VK = {"u", "n", "x"}, VL = {"🟢 Полезное", "⚪ Нейтрально", "🔴 Зря"};
    ArrayList<String> cats = new ArrayList<>();
    ArrayAdapter<String> ad;
    long start;

    int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }

    @Override protected void onCreate(Bundle s) {
        super.onCreate(s);
        if (!Store.linked(this)) {
            Toast.makeText(this, "Сначала подключите телефон: Настройки → Уведомления → «Подключить Android»", Toast.LENGTH_LONG).show();
            startActivity(W.openApp(this));
            finish();
            return;
        }
        final SharedPreferences sp = Store.p(this);
        start = sp.getLong("jt_start", 0);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(14), dp(18), dp(8));
        TextView h = new TextView(this);
        h.setTextSize(17);
        root.addView(h);
        et = new EditText(this);
        et.setHint("Что делаешь?");
        et.setMinLines(1);
        et.setText(sp.getString("jt_title", ""));
        root.addView(et);
        if (start <= 0) {   // таймера нет — запускаем
            h.setText("⏱ Журнал: начать дело");
            LinearLayout row = new LinearLayout(this);
            Button go = new Button(this); go.setText("▶ Начать");
            go.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
                sp.edit().putLong("jt_start", System.currentTimeMillis()).putString("jt_title", et.getText().toString().trim()).apply();
                done("Таймер запущен");
            } });
            Button no = new Button(this); no.setText("Отмена");
            no.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { finish(); } });
            row.addView(go); row.addView(no);
            root.addView(row);
            setContentView(root);
            return;
        }
        long mins = Math.max(1, (System.currentTimeMillis() - start) / 60000);
        h.setText("⏱ Идёт " + mins + " мин — записать в журнал");
        TextView t1 = new TextView(this); t1.setText("Тема"); t1.setPadding(0, dp(8), 0, 0); root.addView(t1);
        spCat = new Spinner(this);
        cats.add("— без темы —");
        ad = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, cats);
        spCat.setAdapter(ad);
        root.addView(spCat);
        final Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() {   // темы из журнала (самые частые)
            try {
                String r = Net.get(Store.api(c, "jrc", ""));
                if (r == null) return;
                final JSONArray a = new JSONObject(r).optJSONArray("cats");
                if (a == null) return;
                runOnUiThread(new Runnable() { public void run() { for (int i = 0; i < a.length(); i++) cats.add(a.optString(i)); ad.notifyDataSetChanged(); } });
            } catch (Exception e) { /* без тем — не страшно */ }
        } }).start();
        TextView t2 = new TextView(this); t2.setText("Оценка"); t2.setPadding(0, dp(8), 0, 0); root.addView(t2);
        LinearLayout vr = new LinearLayout(this);
        for (int i = 0; i < 3; i++) {
            final int k = i;
            vb[i] = new Button(this); vb[i].setText(VL[i]); vb[i].setTextSize(12); vb[i].setAllCaps(false);
            vb[i].setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
            vb[i].setOnClickListener(new View.OnClickListener() { public void onClick(View v) { val = val.equals(VK[k]) ? "" : VK[k]; paintVal(); } });
            vr.addView(vb[i]);
        }
        root.addView(vr);
        paintVal();
        TextView t3 = new TextView(this); t3.setText("Минут (можно поправить)"); t3.setPadding(0, dp(8), 0, 0); root.addView(t3);
        emin = new EditText(this);
        emin.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        emin.setText(String.valueOf(mins));
        root.addView(emin);
        LinearLayout row = new LinearLayout(this);
        Button save = new Button(this); save.setText("■ Записать");
        save.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { save(); } });
        Button drop = new Button(this); drop.setText("Сбросить");
        drop.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            sp.edit().remove("jt_start").remove("jt_title").apply(); done("Таймер сброшен");
        } });
        row.addView(save); row.addView(drop);
        root.addView(row);
        android.widget.ScrollView sv = new android.widget.ScrollView(this);
        sv.addView(root);
        setContentView(sv);
    }

    void paintVal() {
        for (int i = 0; i < 3; i++) vb[i].setAlpha(val.length() == 0 || val.equals(VK[i]) ? 1f : 0.35f);
    }

    void done(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
        JournalWidget.refreshAll(getApplicationContext());
        finish();
    }

    void save() {
        final String title = et.getText().toString().trim();
        if (title.length() == 0) { Toast.makeText(this, "Напиши, что делал", Toast.LENGTH_SHORT).show(); return; }
        int m = 0;
        try { m = Integer.parseInt(emin.getText().toString().trim()); } catch (Exception e) { /* ниже */ }
        if (m < 1 || m > 1440) { Toast.makeText(this, "Минут: от 1 до 1440", Toast.LENGTH_SHORT).show(); return; }
        final long end = System.currentTimeMillis(), st = end - m * 60000L;
        final String cat = spCat.getSelectedItemPosition() > 0 ? cats.get(spCat.getSelectedItemPosition()) : "", v = val;
        final Context c = getApplicationContext();
        final Activity me = this;
        new Thread(new Runnable() { public void run() {
            String res = null;
            try {
                JSONObject j = new JSONObject().put("title", title).put("start", st).put("end", end);
                if (cat.length() > 0) j.put("cat", cat);
                if (v.length() > 0) j.put("val", v);
                res = Net.post(Store.api(c, "jr", ""), j.toString());
            } catch (Exception e) { /* ниже */ }
            final boolean good = res != null;
            final boolean noval = good && res.contains("\"noval\"");
            runOnUiThread(new Runnable() { public void run() {
                if (!good) { Toast.makeText(c, "Нет связи — таймер сохранён, повтори позже", Toast.LENGTH_LONG).show(); return; }
                Store.p(c).edit().remove("jt_start").remove("jt_title").apply();
                Toast.makeText(c, noval ? "В журнале ✓ (оценка не сохранилась: включи колонку val в приложении)" : "В журнале ✓", Toast.LENGTH_SHORT).show();
                JournalWidget.refreshAll(c);
                me.finish();
            } });
        } }).start();
    }
}
