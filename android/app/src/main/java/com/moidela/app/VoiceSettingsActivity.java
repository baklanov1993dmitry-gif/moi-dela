package com.moidela.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/** Настройки голосового добавления. Хранится на телефоне (SharedPreferences md) и уходит на сервер (видно на сайте). */
public class VoiceSettingsActivity extends Activity {
    private static final int BG = Color.parseColor("#0F0F14"), CARD = Color.parseColor("#1A1A22"), TX = Color.parseColor("#F2F2F7"), DIM = Color.parseColor("#8E8E99"), AC = Color.parseColor("#8FA8FF");
    private SharedPreferences sp;
    private TextToSpeech tts;
    private final List<String> listIds = new ArrayList<String>(), listNames = new ArrayList<String>();
    private final List<String> sysIds = new ArrayList<String>(), sysNames = new ArrayList<String>();
    private final List<Runnable> refresh = new ArrayList<Runnable>();
    private Runnable saveAll;

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }
    private LinearLayout card(LinearLayout root, String title) {
        TextView h = new TextView(this); h.setText(title.toUpperCase(Locale.ROOT)); h.setTextSize(12); h.setTextColor(DIM); h.setLetterSpacing(0.08f); h.setPadding(dp(8), dp(22), 0, dp(8)); root.addView(h);
        LinearLayout c = new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable g = new GradientDrawable(); g.setColor(CARD); g.setCornerRadius(dp(16)); c.setBackground(g); root.addView(c);
        return c;
    }
    private void divider(LinearLayout c) { View v = new View(this); v.setBackgroundColor(Color.parseColor("#26262F")); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, 1); p.leftMargin = dp(16); c.addView(v, p); }

    /** Строка «подпись — значение ›»: по тапу открывается список выбора. */
    private interface Pick { void on(int i); }
    private void row(LinearLayout c, final String label, final List<String> items, final int[] sel, final Pick pick) {
        LinearLayout r = new LinearLayout(this); r.setOrientation(LinearLayout.HORIZONTAL); r.setGravity(Gravity.CENTER_VERTICAL); r.setPadding(dp(16), dp(14), dp(16), dp(14));
        TextView l = new TextView(this); l.setText(label); l.setTextSize(16); l.setTextColor(TX); r.addView(l, new LinearLayout.LayoutParams(0, -2, 1f));
        final TextView v = new TextView(this); v.setTextSize(15); v.setTextColor(AC); v.setGravity(Gravity.END); v.setMaxLines(2); v.setMaxWidth(dp(190)); r.addView(v);
        TextView ch = new TextView(this); ch.setText("  ›"); ch.setTextSize(18); ch.setTextColor(DIM); r.addView(ch);
        final Runnable show = new Runnable() { public void run() { v.setText(items.size() > 0 ? items.get(Math.max(0, Math.min(items.size() - 1, sel[0]))) : "—"); } };
        show.run(); refresh.add(show);
        r.setOnClickListener(new View.OnClickListener() { public void onClick(View x) {
            if (items.size() == 0) return;
            new AlertDialog.Builder(VoiceSettingsActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert).setTitle(label)
                .setSingleChoiceItems(items.toArray(new String[0]), sel[0], new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int i) { sel[0] = i; d.dismiss(); show.run(); pick.on(i); saveAll.run(); } })
                .setNegativeButton("Отмена", null).show();
        } });
        c.addView(r);
    }
    private void timeRow(LinearLayout c, final String label, final String key, final int def) {
        final TextView r = new TextView(this); r.setTextSize(16); r.setTextColor(TX); r.setPadding(dp(16), dp(14), dp(16), dp(14));
        final Runnable show = new Runnable() { public void run() { int m = sp.getInt(key, def); r.setText(label + "   " + String.format(Locale.ROOT, "%02d:%02d", m / 60, m % 60) + "  ›"); } };
        show.run();
        r.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            int m = sp.getInt(key, def);
            new android.app.TimePickerDialog(VoiceSettingsActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert, new android.app.TimePickerDialog.OnTimeSetListener() { public void onTimeSet(android.widget.TimePicker p, int h, int mi) { sp.edit().putInt(key, h * 60 + mi).apply(); show.run(); VoiceWindow.refresh(getApplicationContext()); } }, m / 60, m % 60, true).show();
        } });
        c.addView(r);
    }
    private Switch sw(LinearLayout c, String text, boolean on, final String key) {
        Switch s = new Switch(this); s.setText(text); s.setTextSize(16); s.setTextColor(TX); s.setChecked(on); s.setPadding(dp(16), dp(14), dp(16), dp(14));
        s.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() { public void onCheckedChanged(CompoundButton b, boolean v) { sp.edit().putBoolean(key, v).apply(); saveAll.run(); } });
        c.addView(s); return s;
    }
    private TextView note(LinearLayout c, String t) { TextView n = new TextView(this); n.setText(t); n.setTextSize(13); n.setTextColor(DIM); n.setPadding(dp(16), dp(4), dp(16), dp(12)); c.addView(n); return n; }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = Store.p(this);
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(BG); sv.setFillViewport(true);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(16), dp(20), dp(16), dp(40)); sv.addView(root);
        TextView h = new TextView(this); h.setText("🎤 Голос"); h.setTextSize(26); h.setTextColor(TX); h.setPadding(dp(8), 0, 0, 0); root.addView(h);
        TextView hs = new TextView(this); hs.setText("Как «Мои дела» слушает и отвечает"); hs.setTextSize(14); hs.setTextColor(DIM); hs.setPadding(dp(8), dp(2), 0, 0); root.addView(hs);

        // --- данные списков
        listIds.add(""); listNames.add("📥 Без списка");
        try {
            JSONArray a = new JSONObject(sp.getString("data", "{}")).optJSONArray("lists");
            if (a != null) for (int i = 0; i < a.length(); i++) { JSONObject l = a.optJSONObject(i); listIds.add(l.optString("id")); listNames.add((l.isNull("icon") ? "" : l.optString("icon") + " ") + l.optString("name")); }
        } catch (Exception e) {}
        String curList = sp.getString("v_list", "");
        if (!sp.contains("v_list")) for (int i = 0; i < listNames.size(); i++) if (listNames.get(i).toLowerCase(Locale.ROOT).contains("свои дела")) { curList = listIds.get(i); break; }
        final int[] sList = {Math.max(0, listIds.indexOf(curList))}, sDue = {sp.getInt("v_due", 1)}, sSay = {sp.getInt("v_say", 0)}, sRate = {sp.getInt("v_rate", 1)}, sNeu = {Math.max(0, Math.min(Neural.IDS.length - 1, sp.getInt("v_neural", 0)))}, sSys = {0};
        final List<String> dues = Arrays.asList("Без срока", "Сегодня", "Завтра"), says = Arrays.asList("Повторять задачу", "Только «Записано»", "Молча"), rates = Arrays.asList("Медленно", "Обычно", "Быстро", "Очень быстро");
        final List<String> voiceNames = new ArrayList<String>(Arrays.asList(Neural.NAMES));
        for (int i = 0; i < voiceNames.size(); i++) if (i == 0) voiceNames.set(0, "Системный (Google)");

        // --- 1. задачи
        LinearLayout c1 = card(root, "Новая задача");
        row(c1, "Куда класть", listNames, sList, new Pick() { public void on(int i) {} }); divider(c1);
        row(c1, "Срок", dues, sDue, new Pick() { public void on(int i) {} }); divider(c1);
        sw(c1, "Ещё и в «Мой день»", sp.getBoolean("v_myday", false), "v_myday");

        // --- 2. ответ
        LinearLayout c2 = card(root, "Ответ голосом");
        row(c2, "Что говорить", says, sSay, new Pick() { public void on(int i) {} }); divider(c2);
        row(c2, "Скорость", rates, sRate, new Pick() { public void on(int i) {} }); divider(c2);
        final LinearLayout sysBox = new LinearLayout(this); sysBox.setOrientation(LinearLayout.VERTICAL);
        row(c2, "Голос", voiceNames, sNeu, new Pick() { public void on(int i) { sp.edit().putInt("v_neural", i).apply(); Neural.status = ""; } });
        sysIds.add(""); sysNames.add("Авто");
        row(sysBox, "Системный голос", sysNames, sSys, new Pick() { public void on(int i) {} });
        c2.addView(sysBox);
        final TextView st = note(c2, "");
        final Button dl = new Button(this); dl.setText("⬇ Скачать голос (~65 МБ, лучше по Wi-Fi)"); dl.setAllCaps(false);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(-1, -2); dlp.setMargins(dp(12), 0, dp(12), dp(10)); c2.addView(dl, dlp);
        dl.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { String id = Neural.selected(sp); if (id.length() > 0 && !Neural.isCloud(id)) Neural.download(getApplicationContext(), id, null); } });
        final Button test = new Button(this); test.setText("▶ Проверить голос"); test.setAllCaps(false);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1, -2); tp.setMargins(dp(12), 0, dp(12), dp(12)); c2.addView(test, tp);
        final Handler hh = new Handler();
        final Runnable upd = new Runnable() { public void run() {
            for (Runnable r : refresh) r.run();
            String v = Neural.selected(sp);
            sysBox.setVisibility(v.length() == 0 ? View.VISIBLE : View.GONE);
            dl.setVisibility(v.length() == 0 || Neural.isCloud(v) ? View.GONE : View.VISIBLE);
            st.setText(v.length() == 0 ? "Читает голос телефона." : Neural.isCloud(v) ? "Яндекс SpeechKit: самый живой, нужен интернет (≈0,16 ₽ за ответ). Без связи прочитает голос телефона."
                : Neural.busy ? Neural.status : Neural.ready(VoiceSettingsActivity.this, v) ? "Голос скачан ✓ работает без интернета." : (Neural.status.length() > 0 ? Neural.status : "Голос не скачан, пока читает голос телефона."));
        } };
        hh.post(new Runnable() { public void run() { upd.run(); hh.postDelayed(this, 500); } });

        // --- 3. запись
        LinearLayout c3 = card(root, "Запись");
        sw(c3, "Сигнал перед записью", sp.getBoolean("v_beep", true), "v_beep"); divider(c3);
        sw(c3, "Микрофон наушников (если подключены)", sp.getBoolean("v_bt", true), "v_bt"); divider(c3);
        sw(c3, "Умные команды (ИИ)", sp.getBoolean("v_smart", true), "v_smart");
        note(c3, "Спросить время, погоду, «что на сегодня», «готово», «отложи», «в журнал …, 40 минут».");

        // --- 4. окно голоса по расписанию
        LinearLayout c4 = card(root, "Окно голоса по расписанию");
        Switch wsw = sw(c4, "Кнопка «Сказать» в шторке по расписанию", sp.getBoolean("v_win", false), "v_win");
        wsw.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() { public void onCheckedChanged(CompoundButton b2, boolean on) {
            sp.edit().putBoolean("v_win", on).apply(); VoiceWindow.refresh(getApplicationContext());
            if (on && Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 31);
        } });
        divider(c4);
        timeRow(c4, "С", "v_win_from", 18 * 60); divider(c4);
        timeRow(c4, "До", "v_win_to", 23 * 60); divider(c4);
        Switch wd = sw(c4, "Только по будням", sp.getBoolean("v_win_wd", true), "v_win_wd");
        wd.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() { public void onCheckedChanged(CompoundButton b2, boolean on) { sp.edit().putBoolean("v_win_wd", on).apply(); VoiceWindow.refresh(getApplicationContext()); } });
        note(c4, "В это время в шторке висит закреплённая кнопка: один тап — и сразу запись голосом. Вне окна уведомления нет, микрофон сам ничего не слушает.");

        TextView tip = new TextView(this); tip.setText("Как запускать: двойное касание наушника (если назначено «Мои дела · Голосом» в Huawei AI Life), иконка «Мои дела · Голосом» на экране или ярлык при долгом нажатии на значок приложения.");
        tip.setTextSize(13); tip.setTextColor(DIM); tip.setPadding(dp(8), dp(20), dp(8), 0); root.addView(tip);
        setContentView(sv);

        saveAll = new Runnable() { public void run() {
            sp.edit().putString("v_list", listIds.get(Math.max(0, Math.min(listIds.size() - 1, sList[0])))).putInt("v_due", sDue[0]).putInt("v_say", sSay[0]).putInt("v_rate", sRate[0])
                .putString("v_voice", sSys[0] > 0 && sSys[0] < sysIds.size() ? sysIds.get(sSys[0]) : "").putInt("v_neural", sNeu[0]).putLong("v_ts", System.currentTimeMillis()).apply();
            hh.post(upd);
            final android.content.Context ctx = getApplicationContext();
            new Thread(new Runnable() { public void run() { try {   // на сервер — чтобы настройки были видны и на сайте
                JSONObject j = new JSONObject().put("list", sp.getString("v_list", "")).put("due", sp.getInt("v_due", 1)).put("myday", sp.getBoolean("v_myday", false))
                    .put("say", sp.getInt("v_say", 0)).put("rate", sp.getInt("v_rate", 1)).put("beep", sp.getBoolean("v_beep", true)).put("smart", sp.getBoolean("v_smart", true)).put("ts", sp.getLong("v_ts", 0));
                Net.post(Store.api(ctx, "vset", ""), j.toString());
            } catch (Exception e) {} } }).start();
        } };

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() { public void onInit(int s) {
            if (s != TextToSpeech.SUCCESS) return;
            try {
                int n = 0;
                for (Voice v : tts.getVoices()) if ("ru".equalsIgnoreCase(v.getLocale().getLanguage())) { n++; sysIds.add(v.getName()); sysNames.add("Голос " + n + (v.isNetworkConnectionRequired() ? " · онлайн" : " · офлайн")); }
                sSys[0] = Math.max(0, sysIds.indexOf(sp.getString("v_voice", "")));
                hh.post(upd);
            } catch (Exception e) {}
        } });

        test.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            saveAll.run(); VoiceAddActivity.applyVoice(tts, sp);
            final String nv = Neural.selected(sp), tt = "Записано. Позвонить Иванову по поводу щита."; final float[] rr = {0.85f, 1.0f, 1.2f, 1.4f};
            if (nv.length() > 0 && Neural.ready(VoiceSettingsActivity.this, nv)) Neural.speak(VoiceSettingsActivity.this, nv, tt, rr[Math.max(0, Math.min(3, sp.getInt("v_rate", 1)))], new Neural.Done() { public void end(final boolean ok) {
                if (!ok) runOnUiThread(new Runnable() { public void run() { st.setText("Не вышло (" + (Neural.isCloud(nv) ? "нет ключей или связи" : "голос не загружен") + ") — читаю голосом телефона."); tts.speak(tt, TextToSpeech.QUEUE_FLUSH, null, "t"); } });
            } });
            else tts.speak(tt, TextToSpeech.QUEUE_FLUSH, null, "t");
        } });
    }

    @Override protected void onDestroy() { try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) {} super.onDestroy(); }
}
