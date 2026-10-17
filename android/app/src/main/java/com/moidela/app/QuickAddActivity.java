package com.moidela.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.ImageView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
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
    byte[] imgBytes = null;
    String imgType = "image/jpeg", imgName = "Картинка";
    Bitmap imgBmp = null;

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
        if (Intent.ACTION_SEND.equals(in.getAction()) && in.getType() != null && in.getType().startsWith("image/")) {
            Uri u = (Uri) in.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) loadImage(u, in.getType());
            if (imgBytes == null) {
                Toast.makeText(this, "Не удалось прочитать картинку", Toast.LENGTH_LONG).show();
                finish();
                return;
            }
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
        if (imgBmp != null) {
            ImageView iv = new ImageView(this);
            iv.setImageBitmap(imgBmp);
            iv.setAdjustViewBounds(true);
            iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
            iv.setMaxHeight((int) (180 * getResources().getDisplayMetrics().density));
            LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            ip.setMargins(0, pd / 2, 0, pd / 2);
            l.addView(iv, ip);
            et.setHint("Что с этой картинкой сделать? (можно пусто)");
        }
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

    // читаем картинку из «Поделиться»: ужимаем до 1600 px по длинной стороне, учитываем поворот из EXIF
    void loadImage(Uri u, String mime) {
        try {
            InputStream is = getContentResolver().openInputStream(u);
            if (is == null) return;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) > 0) {
                bo.write(buf, 0, n);
                if (bo.size() > 40 * 1024 * 1024) { is.close(); return; }
            }
            is.close();
            byte[] raw = bo.toByteArray();
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(raw, 0, raw.length, o);
            if (o.outWidth <= 0) return;
            int big = Math.max(o.outWidth, o.outHeight), ss = 1;
            while (big / (ss * 2) >= 1600) ss *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = ss;
            Bitmap b = BitmapFactory.decodeByteArray(raw, 0, raw.length, o);
            if (b == null) return;
            int rot = 0;
            if (Build.VERSION.SDK_INT >= 24) {
                try {
                    android.media.ExifInterface ex = new android.media.ExifInterface(new java.io.ByteArrayInputStream(raw));
                    int or = ex.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1);
                    rot = or == 6 ? 90 : or == 3 ? 180 : or == 8 ? 270 : 0;
                } catch (Exception e) { /* без поворота */ }
            }
            float k = Math.min(1f, 1600f / Math.max(b.getWidth(), b.getHeight()));
            if (k < 1f || rot != 0) {
                Matrix m = new Matrix();
                if (k < 1f) m.postScale(k, k);
                if (rot != 0) m.postRotate(rot);
                b = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
            }
            boolean png = "image/png".equals(mime);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, png ? 100 : 88, out);
            if (png && out.size() > 2500 * 1024) { out.reset(); b.compress(Bitmap.CompressFormat.JPEG, 88, out); png = false; }
            imgBytes = out.toByteArray();
            imgType = png ? "image/png" : "image/jpeg";
            java.util.Calendar cc = java.util.Calendar.getInstance();
            imgName = String.format(java.util.Locale.US, "Снимок %02d.%02d %02d-%02d", cc.get(java.util.Calendar.DAY_OF_MONTH), cc.get(java.util.Calendar.MONTH) + 1, cc.get(java.util.Calendar.HOUR_OF_DAY), cc.get(java.util.Calendar.MINUTE));
            imgBmp = b;
        } catch (Throwable e) { imgBytes = null; }
    }

    String dueFor(int i) {
        if (i == 0) return null;
        if (i == 4) return pickedDate;
        java.util.Calendar c = java.util.Calendar.getInstance();
        c.add(java.util.Calendar.DAY_OF_MONTH, i == 1 ? 0 : i == 2 ? 1 : 7);
        return String.format(java.util.Locale.US, "%04d-%02d-%02d", c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH) + 1, c.get(java.util.Calendar.DAY_OF_MONTH));
    }

    void submit() {
        String tx = et.getText().toString().trim();
        if (tx.length() == 0 && imgBytes != null) {
            java.util.Calendar cc = java.util.Calendar.getInstance();
            tx = String.format(java.util.Locale.US, "Картинка %02d.%02d %02d:%02d", cc.get(java.util.Calendar.DAY_OF_MONTH), cc.get(java.util.Calendar.MONTH) + 1, cc.get(java.util.Calendar.HOUR_OF_DAY), cc.get(java.util.Calendar.MINUTE));
        }
        final String text = tx;
        if (text.length() == 0) return;
        final String lid = listIds.get(spList.getSelectedItemPosition());
        final String due = dueFor(spDue.getSelectedItemPosition());
        Store.p(this).edit().putString("lastlist", lid).apply();
        final android.content.Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() {
            String res = null;
            boolean imgFail = false;
            try {
                String first = text.split("\n", 2)[0], note = text.contains("\n") ? text.split("\n", 2)[1] : null;
                JSONObject j = new JSONObject().put("title", first);
                if (due != null) j.put("due", due);
                if (note != null) j.put("note", note);
                if (lid.length() > 0) j.put("list_id", lid);
                res = Net.post(Store.api(c, "add", ""), j.toString());
                if (res != null && imgBytes != null) {   // картинка — вложением к только что созданной задаче
                    String id = new JSONObject(res).optString("id");
                    String up = id.length() > 0 ? Net.postBytes(Store.api(c, "up", "&id=" + id + "&name=" + java.net.URLEncoder.encode(imgName, "UTF-8")), imgBytes, imgType) : null;
                    if (up == null) imgFail = true;
                }
            } catch (Exception e) { /* ниже покажем ошибку */ }
            final boolean good = res != null, fail = imgFail;
            new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() { public void run() { Toast.makeText(c, !good ? "Нет связи — не добавилось" : fail ? "Дело добавлено, но картинка не загрузилась" : "Добавлено ✓", Toast.LENGTH_SHORT).show(); } });
            if (good) Sync.run(c);
        } }).start();
        finish();
    }
}
