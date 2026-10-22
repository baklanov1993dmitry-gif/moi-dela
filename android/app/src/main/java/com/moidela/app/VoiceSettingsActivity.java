package com.moidela.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Настройки голосового добавления: куда класть, срок, как подтверждать, какой голос. Всё хранится на телефоне (SharedPreferences md). */
public class VoiceSettingsActivity extends Activity {
    private SharedPreferences sp;
    private TextToSpeech tts;
    private final List<String> listIds = new ArrayList<String>(), listNames = new ArrayList<String>();
    private final List<String> voiceIds = new ArrayList<String>(), voiceNames = new ArrayList<String>();
    private Spinner spVoice;

    private TextView label(String t) { TextView v = new TextView(this); v.setText(t); v.setTextSize(15); v.setPadding(0, 28, 0, 6); return v; }
    private Spinner spin(List<String> items, int sel) {
        Spinner s = new Spinner(this); s.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, items)); s.setSelection(Math.max(0, sel)); return s;
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = Store.p(this);
        ScrollView sv = new ScrollView(this); LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(48, 36, 48, 60); sv.addView(root);
        TextView h = new TextView(this); h.setText("🎤 Голосовое добавление"); h.setTextSize(22); root.addView(h);

        // список
        listIds.add(""); listNames.add("📥 Без списка");
        try {
            JSONArray a = new JSONObject(sp.getString("data", "{}")).optJSONArray("lists");
            if (a != null) for (int i = 0; i < a.length(); i++) { JSONObject l = a.optJSONObject(i); listIds.add(l.optString("id")); listNames.add((l.isNull("icon") ? "" : l.optString("icon") + " ") + l.optString("name")); }
        } catch (Exception e) {}
        String curList = sp.getString("v_list", "");
        if (!sp.contains("v_list")) for (int i = 0; i < listNames.size(); i++) if (listNames.get(i).toLowerCase(Locale.ROOT).contains("свои дела")) { curList = listIds.get(i); break; }
        root.addView(label("Куда класть голосовые задачи"));
        final Spinner spList = spin(listNames, listIds.indexOf(curList)); root.addView(spList);

        // срок
        List<String> dues = new ArrayList<String>(); dues.add("Без срока"); dues.add("Сегодня"); dues.add("Завтра");
        root.addView(label("Срок"));
        final Spinner spDue = spin(dues, sp.getInt("v_due", 1)); root.addView(spDue);

        final CheckBox cbMy = new CheckBox(this); cbMy.setText("Ещё и в «Мой день»"); cbMy.setChecked(sp.getBoolean("v_myday", false)); root.addView(cbMy);

        // подтверждение
        List<String> says = new ArrayList<String>(); says.add("Повторять задачу целиком"); says.add("Только «Записано»"); says.add("Молча (сигнал и вибрация)");
        root.addView(label("Подтверждение голосом"));
        final Spinner spSay = spin(says, sp.getInt("v_say", 0)); root.addView(spSay);

        List<String> rates = new ArrayList<String>(); rates.add("Медленно"); rates.add("Обычно"); rates.add("Быстро"); rates.add("Очень быстро");
        root.addView(label("Скорость речи"));
        final Spinner spRate = spin(rates, sp.getInt("v_rate", 1)); root.addView(spRate);

        root.addView(label("Голос"));
        voiceIds.add(""); voiceNames.add("По умолчанию (системный)");
        spVoice = spin(voiceNames, 0); root.addView(spVoice);

        final CheckBox cbBeep = new CheckBox(this); cbBeep.setText("Сигнал перед записью"); cbBeep.setChecked(sp.getBoolean("v_beep", true)); root.addView(cbBeep);

        Button test = new Button(this); test.setText("▶ Проверить голос"); root.addView(test);
        TextView note = new TextView(this); note.setText("Быстрые способы запуска: двойное касание наушника, двойное нажатие боковой кнопки (Настройки → Дополнительные функции → Боковая кнопка → «Мои дела · Голосом»), иконка «Мои дела · Голосом» на экране."); note.setTextSize(13); note.setTextColor(Color.GRAY); note.setPadding(0, 28, 0, 0); root.addView(note);
        setContentView(sv);

        final int[] firstVoice = {0};
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() { public void onInit(int s) {
            if (s != TextToSpeech.SUCCESS) return;
            try {
                for (Voice v : tts.getVoices()) if ("ru".equalsIgnoreCase(v.getLocale().getLanguage())) { voiceIds.add(v.getName()); voiceNames.add(v.getName() + (v.isNetworkConnectionRequired() ? " (онлайн)" : "")); }
                spVoice.setAdapter(new ArrayAdapter<String>(VoiceSettingsActivity.this, android.R.layout.simple_spinner_dropdown_item, voiceNames));
                spVoice.setSelection(Math.max(0, voiceIds.indexOf(sp.getString("v_voice", ""))));
            } catch (Exception e) {}
        } });

        final Runnable save = new Runnable() { public void run() {
            sp.edit().putString("v_list", listIds.get(Math.max(0, spList.getSelectedItemPosition()))).putInt("v_due", spDue.getSelectedItemPosition())
                .putBoolean("v_myday", cbMy.isChecked()).putInt("v_say", spSay.getSelectedItemPosition()).putInt("v_rate", spRate.getSelectedItemPosition())
                .putString("v_voice", voiceIds.get(Math.max(0, Math.min(voiceIds.size() - 1, spVoice.getSelectedItemPosition())))).putBoolean("v_beep", cbBeep.isChecked()).putLong("v_ts", System.currentTimeMillis()).apply();
            final android.content.Context c = getApplicationContext();
            new Thread(new Runnable() { public void run() { try {   // отправляем на сервер, чтобы настройки были видны и на сайте
                JSONObject j = new JSONObject().put("list", sp.getString("v_list", "")).put("due", sp.getInt("v_due", 1)).put("myday", sp.getBoolean("v_myday", false))
                    .put("say", sp.getInt("v_say", 0)).put("rate", sp.getInt("v_rate", 1)).put("beep", sp.getBoolean("v_beep", true)).put("ts", sp.getLong("v_ts", 0));
                Net.post(Store.api(c, "vset", ""), j.toString());
            } catch (Exception e) {} } }).start();
        } };
        AdapterView.OnItemSelectedListener ch = new AdapterView.OnItemSelectedListener() {
            public void onItemSelected(AdapterView<?> p, View v, int i, long id) { save.run(); }
            public void onNothingSelected(AdapterView<?> p) {}
        };
        spList.setOnItemSelectedListener(ch); spDue.setOnItemSelectedListener(ch); spSay.setOnItemSelectedListener(ch); spRate.setOnItemSelectedListener(ch); spVoice.setOnItemSelectedListener(ch);
        CompoundButton.OnCheckedChangeListener cc = new CompoundButton.OnCheckedChangeListener() { public void onCheckedChanged(CompoundButton v, boolean c) { save.run(); } };
        cbMy.setOnCheckedChangeListener(cc); cbBeep.setOnCheckedChangeListener(cc);
        test.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            save.run(); VoiceAddActivity.applyVoice(tts, sp);
            tts.speak("Записано. Позвонить Иванову по поводу щита.", TextToSpeech.QUEUE_FLUSH, null, "t");
        } });
    }

    @Override protected void onDestroy() { try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) {} super.onDestroy(); }
}
