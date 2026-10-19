package com.moidela.app;

import android.app.Activity;
import android.app.TimePickerDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.AutoCompleteTextView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Таймер журнала: нет таймера → «Начать»; идёт → карточка (что делал, тема, 🟢⚪🔴, минуты) → запись. */
public class JournalActivity extends Activity {
    static final int ACC = Color.parseColor("#4F46E5");
    boolean night;
    int cBg, cTx, cMut, cFld;
    EditText et, emin;
    String val = "";
    TextView[] vb = new TextView[3];
    AutoCompleteTextView[] tf = new AutoCompleteTextView[3];
    ArrayList<ArrayAdapter<String>> ads = new ArrayList<>();
    ArrayList<String> allCats = new ArrayList<>();
    final String[] VK = {"u", "n", "x"}, VL = {"🟢 Польза", "⚪ Норм", "🔴 Зря"};
    final int[] VC = {Color.parseColor("#16A34A"), Color.parseColor("#64748B"), Color.parseColor("#DC2626")};
    long start;

    int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }

    GradientDrawable rr(int color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color); g.setCornerRadius(dp(radiusDp));
        return g;
    }

    TextView tv(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    TextView label(String s) {
        TextView t = tv(s.toUpperCase(Locale.getDefault()), 12, cMut, true);
        t.setLetterSpacing(0.08f);
        t.setPadding(dp(2), dp(18), 0, dp(8));
        return t;
    }

    TextView btn(String s, int bg, int fg, int sp) {
        TextView t = tv(s, sp, fg, true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(rr(bg, 16));
        return t;
    }

    EditText field(String hint, String text) {
        EditText e = new EditText(this);
        e.setHint(hint); e.setText(text); e.setTextSize(19);
        e.setTextColor(cTx); e.setHintTextColor(cMut);
        e.setBackground(rr(cFld, 16));
        e.setPadding(dp(16), dp(14), dp(16), dp(14));
        return e;
    }

    @Override protected void onCreate(Bundle s) {
        super.onCreate(s);
        if (!Store.linked(this)) {
            Toast.makeText(this, "Сначала подключите телефон: Настройки → Уведомления → «Подключить Android»", Toast.LENGTH_LONG).show();
            startActivity(W.openApp(this));
            finish();
            return;
        }
        night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        cBg = night ? Color.parseColor("#1E2330") : Color.WHITE;
        cTx = night ? Color.parseColor("#F1F5F9") : Color.parseColor("#0F172A");
        cMut = night ? Color.parseColor("#94A3B8") : Color.parseColor("#64748B");
        cFld = night ? Color.parseColor("#2A3142") : Color.parseColor("#F1F5F9");
        final SharedPreferences sp = Store.p(this);
        JournalNotif.enable(this);
        start = sp.getLong("jt_start", 0);

        FrameLayout shade = new FrameLayout(this);
        shade.setBackgroundColor(Color.parseColor("#99000000"));
        shade.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { finish(); } });
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(22), dp(20), dp(20));
        GradientDrawable cg = rr(cBg, 28);
        cg.setCornerRadii(new float[]{dp(28), dp(28), dp(28), dp(28), 0, 0, 0, 0});
        card.setBackground(cg);
        card.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { /* не закрывать */ } });
        ScrollView sv = new ScrollView(this);
        sv.addView(card);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        shade.addView(sv, lp);
        setContentView(shade);

        buildStop(card, sp);   // сразу «что уже сделал»: начало = конец последней записи, конец = сейчас
    }

    void buildStart(LinearLayout card, final SharedPreferences sp) {
        card.addView(tv("▶  Начать дело", 22, cTx, true));
        TextView sub = tv("Таймер пойдёт в фоне. Потом нажми на виджет и запиши.", 14, cMut, false);
        sub.setPadding(0, dp(4), 0, dp(16));
        card.addView(sub);
        et = field("Что будешь делать? (можно позже)", sp.getString("jt_title", ""));
        card.addView(et);
        TextView go = btn("▶  Начать", ACC, Color.WHITE, 18);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        lp.topMargin = dp(18);
        card.addView(go, lp);
        go.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            sp.edit().putLong("jt_start", System.currentTimeMillis()).putString("jt_title", et.getText().toString().trim()).apply();
            done("Таймер запущен");
        } });
    }

    boolean timer, minEdited, startPicked;
    long endT;   // 0 = «сейчас»
    TextView sinceTv, stB, enB;
    static boolean sameDay(long a, long b) { java.util.Calendar x = java.util.Calendar.getInstance(), y = java.util.Calendar.getInstance(); x.setTimeInMillis(a); y.setTimeInMillis(b); return x.get(java.util.Calendar.YEAR) == y.get(java.util.Calendar.YEAR) && x.get(java.util.Calendar.DAY_OF_YEAR) == y.get(java.util.Calendar.DAY_OF_YEAR); }
    /** начало дела: запущенный таймер → конец последней записи сегодня → 30 минут назад */
    void pickStart(long last) {
        long now = System.currentTimeMillis();
        if (timer || startPicked) return;
        if (last > 0 && last < now && sameDay(last, now) && now - last <= 12 * 3600e3) start = last; else if (start <= 0) start = now - 30 * 60000L;
    }
    static String hm(long t) { return new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(t)); }
    void showStart() {
        long e = endT > 0 ? endT : System.currentTimeMillis();
        long mins = Math.max(1, (e - start) / 60000);
        if (sinceTv != null) sinceTv.setText("с " + hm(start) + " до " + (endT > 0 ? hm(endT) : "сейчас"));
        if (stB != null) stB.setText("Начало  " + hm(start));
        if (enB != null) enB.setText("Конец  " + (endT > 0 ? hm(endT) : "сейчас"));
        if (emin != null && !minEdited) emin.setText(String.valueOf(Math.min(1440, mins)));
    }
    /** время ЧЧ:мм → сегодня; если вышло в будущем — вчера (дело через полночь) */
    long resolve(int h, int m) {
        java.util.Calendar c = java.util.Calendar.getInstance();
        long now = c.getTimeInMillis();
        c.set(java.util.Calendar.HOUR_OF_DAY, h); c.set(java.util.Calendar.MINUTE, m); c.set(java.util.Calendar.SECOND, 0); c.set(java.util.Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() > now + 60000) c.add(java.util.Calendar.DAY_OF_YEAR, -1);
        return c.getTimeInMillis();
    }
    void pickTime(final boolean isStart) {
        long cur = isStart ? start : (endT > 0 ? endT : System.currentTimeMillis());
        java.util.Calendar c = java.util.Calendar.getInstance(); c.setTimeInMillis(cur);
        new TimePickerDialog(this, new TimePickerDialog.OnTimeSetListener() { public void onTimeSet(android.widget.TimePicker v, int h, int m) {
            long t = resolve(h, m);
            long other = isStart ? (endT > 0 ? endT : System.currentTimeMillis()) : start;
            if (isStart ? t >= other : t <= other) { Toast.makeText(JournalActivity.this, "Начало должно быть раньше конца", Toast.LENGTH_SHORT).show(); return; }
            if (isStart) { start = t; startPicked = true; } else endT = t;
            minEdited = false;
            showStart();
        } }, c.get(java.util.Calendar.HOUR_OF_DAY), c.get(java.util.Calendar.MINUTE), true).show();
    }

    void buildStop(LinearLayout card, final SharedPreferences sp) {
        timer = start > 0;
        if (!timer) { start = 0; pickStart(sp.getLong("jt_last", 0)); }
        long mins = Math.max(1, (System.currentTimeMillis() - start) / 60000);
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(tv("⏱  Записать в журнал", 20, cTx, true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        sinceTv = tv("", 14, cMut, false);
        top.addView(sinceTv);
        card.addView(top);
        et = field("Что делал?", sp.getString("jt_title", ""));
        LinearLayout.LayoutParams fl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        fl.topMargin = dp(14);
        card.addView(et, fl);

        card.addView(label("Темы (выбери или впиши новую)"));
        LinearLayout tr = new LinearLayout(this);
        for (int i = 0; i < 3; i++) {
            final AutoCompleteTextView a = new AutoCompleteTextView(this);
            final ArrayAdapter<String> ad = new ArrayAdapter<String>(this, android.R.layout.simple_dropdown_item_1line, new ArrayList<String>()) {
                @Override public View getView(int pos, View cv, ViewGroup par) {
                    TextView t = (TextView) super.getView(pos, cv, par);
                    t.setTextColor(cTx); t.setTextSize(16); t.setBackgroundColor(Color.TRANSPARENT); t.setPadding(dp(14), dp(12), dp(14), dp(12));
                    return t;
                }
            };
            ads.add(ad);
            a.setAdapter(ad);
            a.setHint("тема " + (i + 1)); a.setSingleLine(); a.setTextSize(16);
            a.setTextColor(cTx); a.setHintTextColor(cMut);
            a.setBackground(rr(cFld, 14)); a.setPadding(dp(12), dp(14), dp(12), dp(14));
            a.setThreshold(0); a.setDropDownBackgroundDrawable(rr(cFld, 12)); a.setDropDownHeight(dp(260));
            a.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { a.showDropDown(); } });
            a.setOnFocusChangeListener(new View.OnFocusChangeListener() { public void onFocusChange(View v, boolean f) { if (f) a.showDropDown(); } });
            tf[i] = a;
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
            if (i > 0) p.leftMargin = dp(8);
            tr.addView(a, p);
        }
        card.addView(tr);
        final Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() {   // темы из журнала (по частоте)
            JSONArray arr = null; long lst = 0;
            try { String r = Net.get(Store.api(c, "jrc", "")); if (r != null) { JSONObject o = new JSONObject(r); arr = o.optJSONArray("cats"); lst = o.optLong("last", 0); } } catch (Exception e) { /* без подсказок — можно вписать */ }
            final JSONArray fa = arr; final long fl2 = lst;
            runOnUiThread(new Runnable() { public void run() {
                if (fl2 > 0) { pickStart(fl2); showStart(); }
                if (fa == null) return;
                for (ArrayAdapter<String> ad : ads) { ad.clear(); for (int i = 0; i < fa.length(); i++) ad.add(fa.optString(i)); ad.notifyDataSetChanged(); }
            } });
        } }).start();

        card.addView(label("Оценка"));
        LinearLayout vr = new LinearLayout(this);
        for (int i = 0; i < 3; i++) {
            final int k = i;
            vb[i] = btn(VL[i], cFld, cTx, 14); vb[i].setSingleLine(); vb[i].setPadding(0, 0, 0, 0);
            vb[i].setOnClickListener(new View.OnClickListener() { public void onClick(View v) { val = val.equals(VK[k]) ? "" : VK[k]; paintVal(); } });
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(52), 1);
            if (i > 0) p.leftMargin = dp(8);
            vr.addView(vb[i], p);
        }
        card.addView(vr);
        paintVal();

        card.addView(label("Когда"));
        LinearLayout tr2 = new LinearLayout(this);
        stB = btn("", cFld, cTx, 16); enB = btn("", cFld, cTx, 16);
        stB.setSingleLine(); enB.setSingleLine();
        stB.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { pickTime(true); } });
        enB.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { pickTime(false); } });
        tr2.addView(stB, new LinearLayout.LayoutParams(0, dp(52), 1));
        LinearLayout.LayoutParams ep2 = new LinearLayout.LayoutParams(0, dp(52), 1); ep2.leftMargin = dp(8);
        tr2.addView(enB, ep2);
        card.addView(tr2);

        card.addView(label("Сколько минут"));
        LinearLayout mr = new LinearLayout(this);
        mr.setGravity(Gravity.CENTER_VERTICAL);
        TextView minus = btn("−", cFld, cTx, 24), plus = btn("+", cFld, cTx, 24);
        emin = field("", String.valueOf(mins));
        emin.setInputType(InputType.TYPE_CLASS_NUMBER);
        emin.setOnFocusChangeListener(new View.OnFocusChangeListener() { public void onFocusChange(View v, boolean f) { if (f) minEdited = true; } });
        emin.setGravity(Gravity.CENTER);
        emin.setTextSize(24);
        emin.setTypeface(Typeface.DEFAULT_BOLD);
        mr.addView(minus, new LinearLayout.LayoutParams(dp(60), dp(56)));
        LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(0, dp(56), 1);
        ep.leftMargin = dp(8); ep.rightMargin = dp(8);
        mr.addView(emin, ep);
        mr.addView(plus, new LinearLayout.LayoutParams(dp(60), dp(56)));
        card.addView(mr);
        showStart();
        minus.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { step(-5); } });
        plus.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { step(5); } });

        TextView save = btn("■  Записать", ACC, Color.WHITE, 18);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        sl.topMargin = dp(22);
        card.addView(save, sl);
        save.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { save(); } });
        if (!timer) return;
        TextView drop = tv("Сбросить таймер", 15, cMut, false);
        drop.setGravity(Gravity.CENTER);
        drop.setPadding(0, dp(14), 0, dp(6));
        card.addView(drop);
        drop.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            sp.edit().remove("jt_start").remove("jt_title").apply(); done("Таймер сброшен");
        } });
    }

    void paintVal() {
        for (int i = 0; i < 3; i++) {
            boolean on = val.equals(VK[i]);
            vb[i].setBackground(rr(on ? VC[i] : cFld, 16));
            vb[i].setTextColor(on ? Color.WHITE : cTx);
        }
    }

    void step(int d) {
        minEdited = true;
        int m = 0;
        try { m = Integer.parseInt(emin.getText().toString().trim()); } catch (Exception e) { /* 0 */ }
        m = Math.max(1, Math.min(1440, m + d));
        emin.setText(String.valueOf(m));
        endT = start + m * 60000L;
        showStart();
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
        final long st = start, end = minEdited ? start + m * 60000L : (endT > 0 ? endT : System.currentTimeMillis());
        StringBuilder sbc = new StringBuilder();
        for (AutoCompleteTextView a : tf) { String t = a.getText().toString().trim().replace(",", " "); if (t.length() > 0 && sbc.indexOf(t) < 0) sbc.append(sbc.length() > 0 ? ", " : "").append(t); }
        final String ct = sbc.toString(), v = val;
        final Context c = getApplicationContext();
        final Activity me = this;
        new Thread(new Runnable() { public void run() {
            String res = null;
            try {
                JSONObject j = new JSONObject().put("title", title).put("start", st).put("end", end);
                if (ct.length() > 0) j.put("cat", ct);
                if (v.length() > 0) j.put("val", v);
                res = Net.post(Store.api(c, "jr", ""), j.toString());
            } catch (Exception e) { /* ниже */ }
            final boolean good = res != null;
            final boolean noval = good && res.contains("\"noval\"");
            runOnUiThread(new Runnable() { public void run() {
                if (!good) { Toast.makeText(c, "Нет связи — таймер сохранён, повтори позже", Toast.LENGTH_LONG).show(); return; }
                Store.p(c).edit().remove("jt_start").remove("jt_title").putLong("jt_last", end).apply();
                Toast.makeText(c, noval ? "В журнале ✓ (оценка не сохранилась: включи колонку val в приложении)" : "В журнале ✓", Toast.LENGTH_SHORT).show();
                JournalWidget.refreshAll(c);
                me.finish();
            } });
        } }).start();
    }
}
