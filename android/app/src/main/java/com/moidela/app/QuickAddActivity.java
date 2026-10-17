package com.moidela.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.WindowManager;
import android.app.DatePickerDialog;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.DatePicker;
import android.widget.Spinner;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

public class QuickAddActivity extends Activity {
    EditText et;
    Spinner spList, spDue;
    ArrayList<String> listIds = new ArrayList<>(), listNames = new ArrayList<>(), dueNames = new ArrayList<>();
    String pickedDate = null;

    @Override protected void onCreate(Bundle s) {
        super.onCreate(s);
        if (!Store.linked(this)) {
            Toast.makeText(this, "Сначала подключите телефон: Настройки → Уведомления → «Подключить Android»", Toast.LENGTH_LONG).show();
            startActivity(W.openApp(this));
            finish();
            return;
        }
        Intent in = getIntent();
        String presetList = in.getStringExtra("list");
        et = new EditText(this);
        et.setHint("Что сделать?");
        et.setMinLines(2);
        if (Intent.ACTION_SEND.equals(in.getAction())) {
            String t = in.getStringExtra(Intent.EXTRA_TEXT), sub = in.getStringExtra(Intent.EXTRA_SUBJECT);
            et.setText(sub != null && sub.length() > 0 && (t == null || !t.startsWith(sub)) ? sub + (t == null ? "" : "\n" + t) : (t == null ? "" : t));
        }
        listIds.add(""); listNames.add("📥 Без списка");
        try {
            JSONArray a = new JSONObject(Store.p(this).getString("data", "{}")).optJSONArray("lists");
            if (a != null) for (int i = 0; i < a.length(); i++) {
                JSONObject l = a.optJSONObject(i);
                listIds.add(l.optString("id")); listNames.add((l.isNull("icon") ? "" : l.optString("icon") + " ") + l.optString("name"));
            }
        } catch (Exception e) { /* только «без списка» */ }
        spList = new Spinner(this);
        spList.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, listNames));
        String want = presetList != null ? presetList : Store.p(this).getString("lastlist", "");
        int pos = listIds.indexOf(want);
        spList.setSelection(pos < 0 ? 0 : pos);
        dueNames.add("Без срока"); dueNames.add("Сегодня"); dueNames.add("Завтра"); dueNames.add("Через неделю"); dueNames.add("Выбрать дату…");
        spDue = new Spinner(this);
        spDue.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, dueNames));
        spDue.setSelection(in.getBooleanExtra("today", false) ? 1 : 0);
        spDue.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            public void onItemSelected(AdapterView<?> p, View v, int i, long id) {
                if (i != 4) return;
                java.util.Calendar c = java.util.Calendar.getInstance();
                new DatePickerDialog(QuickAddActivity.this, new DatePickerDialog.OnDateSetListener() {
                    public void onDateSet(DatePicker dp, int y, int m, int d) {
                        pickedDate = String.format(java.util.Locale.US, "%04d-%02d-%02d", y, m + 1, d);
                        dueNames.set(4, "📅 " + String.format(java.util.Locale.US, "%02d.%02d.%04d", d, m + 1, y));
                        ((ArrayAdapter) spDue.getAdapter()).notifyDataSetChanged();
                    }
                }, c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH), c.get(java.util.Calendar.DAY_OF_MONTH)).show();
            }
            public void onNothingSelected(AdapterView<?> p) {}
        });
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
        TextView l1 = new TextView(this); l1.setText("Список"); l1.setPadding(0, pd / 2, 0, 0); l.addView(l1);
        l.addView(spList);
        TextView l2 = new TextView(this); l2.setText("Срок"); l2.setPadding(0, pd / 2, 0, 0); l.addView(l2);
        l.addView(spDue);
        l.addView(ok);
        setContentView(l);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        ok.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { submit(); } });
        if (in.getBooleanExtra("voice", false)) {
            try {
                Intent r = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
                    .putExtra(RecognizerIntent.EXTRA_PROMPT, "Что записать?");
                startActivityForResult(r, 7);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(this, "На телефоне нет голосового ввода — пишите текстом", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override protected void onActivityResult(int rq, int rc, Intent d) {
        super.onActivityResult(rq, rc, d);
        if (rq != 7) return;
        ArrayList<String> r = rc == RESULT_OK && d != null ? d.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
        if (r != null && r.size() > 0 && r.get(0).length() > 0) {
            String t = r.get(0);
            et.setText(t.substring(0, 1).toUpperCase() + t.substring(1));
            submit();
        } else finish();
    }

    String dueFor(int i) {
        if (i == 0) return null;
        if (i == 4) return pickedDate;
        java.util.Calendar c = java.util.Calendar.getInstance();
        c.add(java.util.Calendar.DAY_OF_MONTH, i == 1 ? 0 : i == 2 ? 1 : 7);
        return String.format(java.util.Locale.US, "%04d-%02d-%02d", c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH) + 1, c.get(java.util.Calendar.DAY_OF_MONTH));
    }

    void submit() {
        final String text = et.getText().toString().trim();
        if (text.length() == 0) return;
        final String lid = listIds.get(spList.getSelectedItemPosition());
        final String due = dueFor(spDue.getSelectedItemPosition());
        Store.p(this).edit().putString("lastlist", lid).apply();
        final android.content.Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() {
            String res = null;
            try {
                String first = text.split("\n", 2)[0], note = text.contains("\n") ? text.split("\n", 2)[1] : null;
                JSONObject j = new JSONObject().put("title", first);
                if (due != null) j.put("due", due);
                if (note != null) j.put("note", note);
                if (lid.length() > 0) j.put("list_id", lid);
                res = Net.post(Store.api(c, "add", ""), j.toString());
            } catch (Exception e) { /* ниже покажем ошибку */ }
            final boolean good = res != null;
            new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() { public void run() { Toast.makeText(c, good ? "Добавлено ✓" : "Нет связи — не добавилось", Toast.LENGTH_SHORT).show(); } });
            if (good) Sync.run(c);
        } }).start();
        finish();
    }
}
