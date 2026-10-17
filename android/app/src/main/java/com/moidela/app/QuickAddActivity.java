package com.moidela.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import org.json.JSONObject;

public class QuickAddActivity extends Activity {
    EditText et;
    CheckBox cb;
    String listId;

    @Override protected void onCreate(Bundle s) {
        super.onCreate(s);
        if (!Store.linked(this)) {
            Toast.makeText(this, "Сначала подключите телефон: Настройки → Уведомления → «Подключить Android»", Toast.LENGTH_LONG).show();
            startActivity(W.openApp(this));
            finish();
            return;
        }
        Intent in = getIntent();
        listId = in.getStringExtra("list");
        et = new EditText(this);
        et.setHint("Что сделать?");
        et.setMinLines(2);
        if (Intent.ACTION_SEND.equals(in.getAction())) {
            String t = in.getStringExtra(Intent.EXTRA_TEXT), sub = in.getStringExtra(Intent.EXTRA_SUBJECT);
            et.setText(sub != null && sub.length() > 0 && (t == null || !t.startsWith(sub)) ? sub + (t == null ? "" : "\n" + t) : (t == null ? "" : t));
        }
        cb = new CheckBox(this);
        cb.setText("На сегодня");
        cb.setChecked(in.getBooleanExtra("today", false));
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

    void submit() {
        final String text = et.getText().toString().trim();
        if (text.length() == 0) return;
        final boolean today = cb.isChecked();
        final String lid = listId;
        final android.content.Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() {
            String res = null;
            try {
                String first = text.split("\n", 2)[0], note = text.contains("\n") ? text.split("\n", 2)[1] : null;
                JSONObject j = new JSONObject().put("title", first).put("today", today);
                if (note != null) j.put("note", note);
                if (lid != null) j.put("list_id", lid);
                res = Net.post(Store.api(c, "add", ""), j.toString());
            } catch (Exception e) { /* ниже покажем ошибку */ }
            final boolean good = res != null;
            new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() { public void run() { Toast.makeText(c, good ? "Добавлено ✓" : "Нет связи — не добавилось", Toast.LENGTH_SHORT).show(); } });
            if (good) Sync.run(c);
        } }).start();
        finish();
    }
}
