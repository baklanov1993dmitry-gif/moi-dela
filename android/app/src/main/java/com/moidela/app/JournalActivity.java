package com.moidela.app;

import android.app.Activity;
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
    String val = "", cat = "";
    TextView[] vb = new TextView[3];
    ArrayList<TextView> chips = new ArrayList<>();
    Flow flow;
    TextView noCats;
    final String[] VK = {"u", "n", "x"}, VL = {"🟢  Полезное", "⚪  Нейтрально", "🔴  Зря"};
    final int[] VC = {Color.parseColor("#16A34A"), Color.parseColor("#64748B"), Color.parseColor("#DC2626")};
    long start;

    /** Простая «переносящая» раскладка для чипов тем. */
    static class Flow extends ViewGroup {
        int gap;
        Flow(Context c, int gap) { super(c); this.gap = gap; }
        @Override protected void onMeasure(int wS, int hS) {
            int w = MeasureSpec.getSize(wS), x = 0, y = 0, rowH = 0;
            for (int i = 0; i < getChildCount(); i++) {
                View v = getChildAt(i);
                v.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED);
                if (x > 0 && x + v.getMeasuredWidth() > w) { x = 0; y += rowH + gap; rowH = 0; }
                x += v.getMeasuredWidth() + gap; rowH = Math.max(rowH, v.getMeasuredHeight());
            }
            setMeasuredDimension(w, y + rowH);
        }
        @Override protected void onLayout(boolean ch, int l, int t, int r, int b) {
            int w = r - l, x = 0, y = 0, rowH = 0;
            for (int i = 0; i < getChildCount(); i++) {
                View v = getChildAt(i);
                if (x > 0 && x + v.getMeasuredWidth() > w) { x = 0; y += rowH + gap; rowH = 0; }
                v.layout(x, y, x + v.getMeasuredWidth(), y + v.getMeasuredHeight());
                x += v.getMeasuredWidth() + gap; rowH = Math.max(rowH, v.getMeasuredHeight());
            }
        }
    }

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

        if (start <= 0) { buildStart(card, sp); return; }
        buildStop(card, sp);
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

    void buildStop(LinearLayout card, final SharedPreferences sp) {
        long mins = Math.max(1, (System.currentTimeMillis() - start) / 60000);
        String since = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(start));
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(tv("⏱  Записать в журнал", 20, cTx, true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        top.addView(tv("с " + since, 14, cMut, false));
        card.addView(top);
        et = field("Что делал?", sp.getString("jt_title", ""));
        LinearLayout.LayoutParams fl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        fl.topMargin = dp(14);
        card.addView(et, fl);

        card.addView(label("Тема"));
        flow = new Flow(this, dp(8));
        card.addView(flow);
        noCats = tv("Загружаю темы…", 14, cMut, false);
        flow.addView(noCats);
        final Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() {
            JSONArray a = null;
            try { String r = Net.get(Store.api(c, "jrc", "")); if (r != null) a = new JSONObject(r).optJSONArray("cats"); } catch (Exception e) { /* без тем */ }
            final JSONArray arr = a;
            runOnUiThread(new Runnable() { public void run() {
                flow.removeAllViews();
                if (arr == null || arr.length() == 0) { noCats.setText("Тем пока нет — появятся после записей с темой"); flow.addView(noCats); return; }
                for (int i = 0; i < arr.length(); i++) addChip(arr.optString(i));
            } });
        } }).start();

        card.addView(label("Оценка"));
        LinearLayout vr = new LinearLayout(this);
        for (int i = 0; i < 3; i++) {
            final int k = i;
            vb[i] = btn(VL[i], cFld, cTx, 15);
            vb[i].setOnClickListener(new View.OnClickListener() { public void onClick(View v) { val = val.equals(VK[k]) ? "" : VK[k]; paintVal(); } });
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(52), 1);
            if (i > 0) p.leftMargin = dp(8);
            vr.addView(vb[i], p);
        }
        card.addView(vr);
        paintVal();

        card.addView(label("Сколько минут"));
        LinearLayout mr = new LinearLayout(this);
        mr.setGravity(Gravity.CENTER_VERTICAL);
        TextView minus = btn("−", cFld, cTx, 24), plus = btn("+", cFld, cTx, 24);
        emin = field("", String.valueOf(mins));
        emin.setInputType(InputType.TYPE_CLASS_NUMBER);
        emin.setGravity(Gravity.CENTER);
        emin.setTextSize(24);
        emin.setTypeface(Typeface.DEFAULT_BOLD);
        mr.addView(minus, new LinearLayout.LayoutParams(dp(60), dp(56)));
        LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(0, dp(56), 1);
        ep.leftMargin = dp(8); ep.rightMargin = dp(8);
        mr.addView(emin, ep);
        mr.addView(plus, new LinearLayout.LayoutParams(dp(60), dp(56)));
        card.addView(mr);
        minus.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { step(-5); } });
        plus.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { step(5); } });

        TextView save = btn("■  Записать", ACC, Color.WHITE, 18);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        sl.topMargin = dp(22);
        card.addView(save, sl);
        save.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { save(); } });
        TextView drop = tv("Сбросить таймер", 15, cMut, false);
        drop.setGravity(Gravity.CENTER);
        drop.setPadding(0, dp(14), 0, dp(6));
        card.addView(drop);
        drop.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            sp.edit().remove("jt_start").remove("jt_title").apply(); done("Таймер сброшен");
        } });
    }

    void addChip(final String name) {
        final TextView t = tv(name, 16, cTx, false);
        t.setPadding(dp(16), dp(10), dp(16), dp(10));
        t.setBackground(rr(cFld, 20));
        t.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { cat = cat.equals(name) ? "" : name; paintChips(); } });
        chips.add(t); flow.addView(t);
    }

    void paintChips() {
        for (TextView t : chips) {
            boolean on = t.getText().toString().equals(cat);
            t.setBackground(rr(on ? ACC : cFld, 20));
            t.setTextColor(on ? Color.WHITE : cTx);
        }
    }

    void paintVal() {
        for (int i = 0; i < 3; i++) {
            boolean on = val.equals(VK[i]);
            vb[i].setBackground(rr(on ? VC[i] : cFld, 16));
            vb[i].setTextColor(on ? Color.WHITE : cTx);
        }
    }

    void step(int d) {
        int m = 0;
        try { m = Integer.parseInt(emin.getText().toString().trim()); } catch (Exception e) { /* 0 */ }
        m = Math.max(1, Math.min(1440, m + d));
        emin.setText(String.valueOf(m));
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
        final String ct = cat, v = val;
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
                Store.p(c).edit().remove("jt_start").remove("jt_title").apply();
                Toast.makeText(c, noval ? "В журнале ✓ (оценка не сохранилась: включи колонку val в приложении)" : "В журнале ✓", Toast.LENGTH_SHORT).show();
                JournalWidget.refreshAll(c);
                me.finish();
            } });
        } }).start();
    }
}
