package com.moidela.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Vibrator;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Gravity;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Locale;

/** Голосовое добавление дела без рук: касание наушника → «Что использовать?» → Мои дела (Всегда).
 *  Слушает фразу, кладёт задачу через device?a=add и говорит «Записано. …». Работает и с заблокированного экрана. */
public class VoiceAddActivity extends Activity {
    private SpeechRecognizer sr;
    private TextToSpeech tts;
    private boolean ttsReady, done, started;
    private String pendingSpeak;
    private TextView tv;
    private final Handler h = new Handler(Looper.getMainLooper());

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        tv = new TextView(this); tv.setTextSize(22); tv.setGravity(Gravity.CENTER); tv.setPadding(60, 60, 60, 60); tv.setText("🎤 Говорите…");
        android.widget.LinearLayout box = new android.widget.LinearLayout(this); box.setOrientation(android.widget.LinearLayout.VERTICAL); box.addView(tv);
        android.widget.Button gear = new android.widget.Button(this); gear.setText("⚙ Настройки"); box.addView(gear);
        gear.setOnClickListener(new android.view.View.OnClickListener() { public void onClick(android.view.View v) { startActivity(new Intent(VoiceAddActivity.this, VoiceSettingsActivity.class)); finish(); } });
        setContentView(box);
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() { public void onInit(int s) {
            if (s == TextToSpeech.SUCCESS) { applyVoice(tts, Store.p(VoiceAddActivity.this)); ttsReady = true; if (pendingSpeak != null) say(pendingSpeak); }
            else if (pendingSpeak != null) finishSoon();
        } });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            public void onStart(String id) {}
            public void onDone(String id) { h.post(new Runnable() { public void run() { endSpeech(); } }); }
            public void onError(String id) { h.post(new Runnable() { public void run() { endSpeech(); } }); }
        });
        if (!Store.linked(this)) { speakAndEnd("Приложение не привязано к аккаунту. Откройте Мои дела."); return; }
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 7); return;
        }
        startListen();
    }

    @Override public void onRequestPermissionsResult(int rc, String[] p, int[] r) {
        if (rc == 8) { Runnable x = pendingPerm; pendingPerm = null; if (x != null) x.run(); return; }
        if (rc == 7 && r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) startListen();
        else speakAndEnd("Нет доступа к микрофону. Разрешите его в настройках приложения.");
    }

    // --- микрофон и звук именно наушников (Bluetooth-гарнитура), если она подключена ---
    interface Cb { void on(String t); }
    private Cb confirmCb; private Runnable afterSpeech, pendingPerm; private int sayGen = 0;
    private boolean btRoute; private int prevMode = -1; private android.content.BroadcastReceiver scoRx;
    private void routeBt(final Runnable next) {
        final boolean[] fired = {false};
        final Runnable once = new Runnable() { public void run() { if (!fired[0]) { fired[0] = true; next.run(); } } };
        try {
            final AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (!Store.p(this).getBoolean("v_bt", true)) { once.run(); return; }
            if (Build.VERSION.SDK_INT >= 31) {
                android.media.AudioDeviceInfo dev = null;
                for (android.media.AudioDeviceInfo d : am.getAvailableCommunicationDevices()) { int t = d.getType(); if (t == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == android.media.AudioDeviceInfo.TYPE_BLE_HEADSET) { dev = d; break; } }
                if (dev == null) { once.run(); return; }
                prevMode = am.getMode(); am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                btRoute = am.setCommunicationDevice(dev);
                h.postDelayed(once, btRoute ? 700 : 0); return;
            }
            if (!am.isBluetoothScoAvailableOffCall()) { once.run(); return; }
            scoRx = new android.content.BroadcastReceiver() { public void onReceive(Context c, Intent in) {
                if (in.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1) == AudioManager.SCO_AUDIO_STATE_CONNECTED) { btRoute = true; h.post(once); }
            } };
            registerReceiver(scoRx, new android.content.IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED));
            prevMode = am.getMode(); am.setMode(AudioManager.MODE_IN_COMMUNICATION); am.startBluetoothSco(); am.setBluetoothScoOn(true);
            h.postDelayed(once, 2500);
        } catch (Exception e) { once.run(); }
    }
    private void releaseBt() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (scoRx != null) { try { unregisterReceiver(scoRx); } catch (Exception e) {} scoRx = null; }
            if (btRoute || prevMode >= 0) {
                if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice(); else { am.stopBluetoothSco(); am.setBluetoothScoOn(false); }
                if (prevMode >= 0) am.setMode(prevMode);
            }
        } catch (Exception e) {}
    }

    private void startListen() {
        if (started) return; started = true;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { speakAndEnd("Распознавание речи недоступно на телефоне."); return; }
        routeBt(new Runnable() { public void run() {
            // уверенный сигнал «запись пошла»: громко, двойной, в наушники; вибро на телефоне
            try { Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE); if (v != null) v.vibrate(80); } catch (Exception e) {}
            long wait = 0;
            if (Store.p(VoiceAddActivity.this).getBoolean("v_beep", true)) try { new ToneGenerator(btRoute ? AudioManager.STREAM_VOICE_CALL : AudioManager.STREAM_MUSIC, 100).startTone(ToneGenerator.TONE_PROP_BEEP2, 350); wait = 600; } catch (Exception e) {}
            h.postDelayed(new Runnable() { public void run() { if (!done) beginRecognize(); } }, wait);
        } });
    }

    private int confirmRetry = 0, recSeq = 0;
    private void listenOnce(final Cb cb) {   // второй вопрос (подтверждение): снова через наушники, короткий сигнал
        confirmCb = cb; done = false; confirmRetry = 0;
        routeBt(new Runnable() { public void run() {
            try { new ToneGenerator(btRoute ? AudioManager.STREAM_VOICE_CALL : AudioManager.STREAM_MUSIC, 100).startTone(ToneGenerator.TONE_PROP_BEEP2, 250); } catch (Exception e) {}
            h.postDelayed(new Runnable() { public void run() { if (!done) beginRecognize(); } }, 800);
        } });
    }

    private void beginRecognize() {
        try { if (sr != null) { sr.cancel(); sr.destroy(); } } catch (Exception e) {}
        sr = SpeechRecognizer.createSpeechRecognizer(this); final SpeechRecognizer me = sr;
        sr.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle p) {}
            public void onBeginningOfSpeech() {}
            public void onRmsChanged(float v) {}
            public void onBufferReceived(byte[] b) {}
            public void onEndOfSpeech() { tv.setText("…"); }
            public void onPartialResults(Bundle p) { ArrayList<String> a = p.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if (a != null && a.size() > 0) tv.setText(a.get(0)); }
            public void onEvent(int t, Bundle p) {}
            public void onError(int e) { if (me != sr || done) return; if (confirmCb != null) { if (confirmRetry++ < 1) { try { new ToneGenerator(AudioManager.STREAM_MUSIC, 100).startTone(ToneGenerator.TONE_PROP_BEEP2, 250); } catch (Exception x) {} h.postDelayed(new Runnable() { public void run() { if (!done && confirmCb != null) beginRecognize(); } }, 600); return; } confirmCb = null; speakAndEnd("Не расслышал, код " + e + ". Отменяю."); return; } speakAndEnd(e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? "Не расслышал. Повторите." : "Не получилось записать голос."); }
            public void onResults(Bundle r) {
                if (me != sr || done) return;
                ArrayList<String> a = r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String t = a != null && a.size() > 0 ? a.get(0).trim() : "";
                if (confirmCb != null) { Cb c = confirmCb; confirmCb = null; done = true; c.on(t.length() == 0 ? "нет" : t); return; }
                if (t.length() == 0) { speakAndEnd("Не расслышал. Повторите."); return; }
                save(t);
            }
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L);
        sr.startListening(i);
        final int seq = ++recSeq; h.postDelayed(new Runnable() { public void run() { if (!done && sr != null && seq == recSeq) sr.stopListening(); } }, 20000);
    }

    static void applyVoice(TextToSpeech t, android.content.SharedPreferences sp) {
        try {
            t.setLanguage(new Locale("ru", "RU"));
            float[] r = {0.8f, 1.0f, 1.25f, 1.5f}; t.setSpeechRate(r[Math.max(0, Math.min(3, sp.getInt("v_rate", 1)))]);
            String vn = sp.getString("v_voice", "");
            if (vn.length() > 0) for (android.speech.tts.Voice v : t.getVoices()) if (vn.equals(v.getName())) { t.setVoice(v); break; }
        } catch (Exception e) {}
    }

    /** срок из фразы: сегодня / завтра / послезавтра / через N дней / в понедельник… (только день, без времени) */
    private static String[] parseDue(String raw) {
        String s = raw.toLowerCase(Locale.ROOT);
        Calendar c = Calendar.getInstance(); int add = -1; String cut = null;
        String[][] w = {{"послезавтра", "2"}, {"завтра", "1"}, {"сегодня", "0"}};
        for (String[] x : w) if (s.contains(x[0])) { add = Integer.parseInt(x[1]); cut = x[0]; break; }
        if (add < 0) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("через (\\d+) (дн|день|дня|дней|недел)").matcher(s);
            if (m.find()) { int n = Integer.parseInt(m.group(1)); add = m.group(2).startsWith("недел") ? n * 7 : n; cut = m.group(0); }
        }
        if (add < 0) {
            String[] dn = {"воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"};
            String[] dn2 = {"воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"};
            for (int d = 0; d < 7 && add < 0; d++) if (s.contains(dn[d]) || s.contains(dn2[d])) {
                int cur = c.get(Calendar.DAY_OF_WEEK) - 1; add = (d - cur + 7) % 7; if (add == 0) add = 7; cut = s.contains(dn[d]) ? dn[d] : dn2[d];
            }
        }
        if (add < 0) return new String[]{raw, null};
        c.add(Calendar.DAY_OF_MONTH, add);
        String due = String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
        String title = raw.replaceFirst("(?iu)\\s*(на|в|во|к)?\\s*" + java.util.regex.Pattern.quote(cut), "").trim();
        if (title.length() == 0) title = raw;
        return new String[]{title, due};
    }

    /** «бортовой компьютер»: фразу разбирает ИИ на сервере (device?a=cmd) — запись, вопросы о делах, время, погода, готово/отложить/отмена */
    private void save(final String raw) {
        final Context c = getApplicationContext();
        final android.content.SharedPreferences sp = Store.p(c);
        if (!sp.getBoolean("v_smart", true)) { saveSimple(raw); return; }
        done = true; tv.setText(raw);
        new Thread(new Runnable() { public void run() {
            String res = null;
            try {
                long now = System.currentTimeMillis();
                JSONObject j = new JSONObject().put("text", raw);
                if (now - sp.getLong("v_last_ts", 0) < 10 * 60000 && sp.getString("v_last_id", "").length() > 0)
                    j.put("last", new JSONObject().put("id", sp.getString("v_last_id", "")).put("title", sp.getString("v_last_title", "")));
                if (now - sp.getLong("v_added_ts", 0) < 15 * 60000 && sp.getString("v_added_id", "").length() > 0)
                    j.put("added", new JSONObject().put("id", sp.getString("v_added_id", "")));
                String lid = sp.getString("v_list", "");
                if (!sp.contains("v_list")) { try { JSONArray la = new JSONObject(sp.getString("data", "{}")).optJSONArray("lists"); if (la != null) for (int i = 0; i < la.length(); i++) if (la.optJSONObject(i).optString("name").toLowerCase(Locale.ROOT).contains("свои дела")) { lid = la.optJSONObject(i).optString("id"); break; } } catch (Exception e) {} }
                if (lid.length() > 0) j.put("list_id", lid);
                j.put("dm", sp.getInt("v_due", 1)).put("myday", sp.getBoolean("v_myday", false));
                res = Net.post(Store.api(c, "cmd", ""), j.toString());
            } catch (Exception e) {}
            final String r = res;
            h.post(new Runnable() { public void run() {
                if (r == null) { speakAndEnd("Нет связи. Не получилось."); return; }
                try {
                    JSONObject o = new JSONObject(r); String sayTxt = o.optString("speak", "Готово."); String it = o.optString("intent", "");
                    long now = System.currentTimeMillis();
                    android.content.SharedPreferences.Editor ed = sp.edit();
                    if (o.optString("id").length() > 0) ed.putString("v_last_id", o.optString("id")).putString("v_last_title", o.optString("title")).putLong("v_last_ts", now);
                    if (o.optBoolean("added", false)) ed.putString("v_added_id", o.optString("id")).putLong("v_added_ts", now);
                    if (o.optBoolean("undone", false)) ed.remove("v_added_id");
                    ed.apply();
                    if ("call".equals(it)) { doCall(o.optString("name")); return; }
                    if ("sms".equals(it)) { doSms(o.optString("name"), o.optString("text")); return; }
                    if ("tg".equals(it) && o.optString("pid").length() > 0) { doTg(o.optString("pid"), o.optString("name"), o.optString("text")); return; }
                    if ("add".equals(it)) { int sm = sp.getInt("v_say", 0); sayTxt = sm == 0 ? sayTxt : sm == 1 ? "Записано." : ""; Sync.run(c); }
                    else if ("done".equals(it) || "snooze".equals(it) || "tomorrow".equals(it) || "undo".equals(it)) Sync.run(c);
                    speakAndEnd(sayTxt);
                } catch (Exception e) { speakAndEnd("Не понял ответ сервера."); }
            } });
        } }).start();
    }

    // ---------- управление телефоном: звонок и SMS по имени из контактов ----------
    private static String stem(String w) { w = w.toLowerCase(Locale.ROOT); return w.length() > 5 ? w.substring(0, w.length() - 2) : w.length() > 3 ? w.substring(0, w.length() - 1) : w; }
    /** все контакты, подходящие под произнесённое имя: список {имя, номер} */
    private java.util.ArrayList<String[]> findAll(String spoken) {
        java.util.ArrayList<String[]> res = new java.util.ArrayList<String[]>();
        String[] tk = spoken.toLowerCase(Locale.ROOT).replaceAll("[^а-яa-z0-9ё ]", " ").trim().split("\\s+"); if (tk.length == 0 || tk[0].length() == 0) return res;
        java.util.LinkedHashMap<String, String> hit = new java.util.LinkedHashMap<String, String>(), allN = new java.util.LinkedHashMap<String, String>();
        android.database.Cursor cu = null;
        try {
            cu = getContentResolver().query(android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI, new String[]{android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER, android.provider.ContactsContract.CommonDataKinds.Phone.TYPE}, null, null, null);
            while (cu != null && cu.moveToNext()) {
                String nm = cu.getString(0) == null ? "" : cu.getString(0), low = nm.toLowerCase(Locale.ROOT).replace('ё', 'е'); boolean all = true;
                for (String t : tk) { String st = stem(t).replace('ё', 'е'); if (!(low.startsWith(st) || low.contains(" " + st))) { all = false; break; } }
                if (!all) continue;
                boolean mob = cu.getInt(2) == android.provider.ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE;
                if (!hit.containsKey(nm) || mob) hit.put(nm, cu.getString(1));
                allN.put(nm, (allN.containsKey(nm) ? allN.get(nm) + "|" : "") + cu.getString(1));
            }
        } catch (Exception e) { return res; } finally { if (cu != null) cu.close(); }
        for (String k : hit.keySet()) res.add(new String[]{k, hit.get(k), allN.get(k)});
        return res;
    }
    private static String digits(String n) { String d = n == null ? "" : n.replaceAll("\\D", ""); return d.length() > 10 ? d.substring(d.length() - 10) : d; }
    /** кому из списка звонили/писали последним (по журналу звонков) — индекс или -1 */
    private int lastCalled(java.util.ArrayList<String[]> l) {
        if (!hasPerm(Manifest.permission.READ_CALL_LOG)) return -1;
        android.database.Cursor cu = null;
        try {
            cu = getContentResolver().query(android.provider.CallLog.Calls.CONTENT_URI, new String[]{android.provider.CallLog.Calls.NUMBER, android.provider.CallLog.Calls.CACHED_NAME}, null, null, android.provider.CallLog.Calls.DATE + " DESC LIMIT 500");
            while (cu != null && cu.moveToNext()) {
                String d = digits(cu.getString(0)), cn = cu.getString(1) == null ? "" : cu.getString(1).trim();
                for (int i = 0; i < l.size(); i++) {
                    if (cn.length() > 0 && cn.equalsIgnoreCase(l.get(i)[0])) return i;
                    if (d.length() >= 6) for (String n : l.get(i)[2].split("\\|")) if (digits(n).equals(d)) return i;
                }
            }
        } catch (Exception e) {} finally { if (cu != null) cu.close(); }
        return -1;
    }
    private boolean logAsked = false;
    private interface Pick { void on(String[] c); }
    /** подбирает контакт: один — сразу; несколько — тот, кому звонили последним; иначе переспрашивает голосом (до двух попыток) */
    private void resolve(final String name, final Pick cb) {
        final java.util.ArrayList<String[]> l = findAll(name);
        if (l.size() == 0) { speakAndEnd("Не нашёл контакт " + name + "."); return; }
        if (l.size() == 1) { cb.on(l.get(0)); return; }
        if (!hasPerm(Manifest.permission.READ_CALL_LOG) && !logAsked && Build.VERSION.SDK_INT >= 23) { logAsked = true; pendingPerm = new Runnable() { public void run() { resolve(name, cb); } }; done = false; tv.setText("Разрешите доступ к журналу звонков — чтобы звонить тому, кому звонили последним."); requestPermissions(new String[]{Manifest.permission.READ_CALL_LOG}, 8); return; }
        int last = lastCalled(l);
        if (last >= 0) { cb.on(l.get(last)); return; }
        ask(l, 0, cb);
    }
    private static final String[] ORD = {"перв", "втор", "трет", "четвёрт", "пят"};
    private void ask(final java.util.ArrayList<String[]> l, final int attempt, final Pick cb) {
        final int n = Math.min(l.size(), 4); StringBuilder sb = new StringBuilder("Нашёл нескольких: ");
        for (int i = 0; i < n; i++) { if (i > 0) sb.append(", "); sb.append(i + 1).append(" — ").append(l.get(i)[0]); }
        sb.append(". Кому?");
        afterSpeech = new Runnable() { public void run() {
            listenOnce(new Cb() { public void on(String ans) {
                final String heard = ans; String a = ans.toLowerCase(Locale.ROOT).replace('ё', 'е'); int pick = -1; tv.setText(ans);
                if (a.matches(".*(отмен|не надо|стоп|ничего).*")) { speakAndEnd("Отменил."); return; }
                java.util.regex.Matcher dm = java.util.regex.Pattern.compile("(?:^|[^0-9])([1-4])(?:[^0-9]|$)").matcher(a); if (dm.find()) { int q = Integer.parseInt(dm.group(1)) - 1; if (q < n) pick = q; }
                String[] W = {"один", "два", "три", "четыр"}; for (int i = 0; i < n && pick < 0; i++) if (a.matches(".*(^|[^а-я])" + W[i] + ".*")) pick = i;
                for (int i = 0; i < n && pick < 0; i++) if (a.contains(ORD[i].replace('ё', 'е'))) pick = i;
                if (pick < 0) { int bestN = 0; for (int i = 0; i < n; i++) { int m = 0; for (String t : l.get(i)[0].toLowerCase(Locale.ROOT).replace('ё', 'е').split("\\s+")) if (t.length() > 1 && a.contains(stem(t))) m++; if (m > bestN) { bestN = m; pick = i; } else if (m == bestN && m > 0) pick = -2 - i; } if (pick <= -2) pick = -1; }
                if (pick >= 0) { cb.on(l.get(pick)); return; }
                if (attempt < 1) { ask(l, attempt + 1, cb); return; }
                speakAndEnd("Не разобрал: " + heard + ". Отменил.");
            } });
        } };
        speakAndEnd(sb.toString());
    }
    private boolean permAsked = false;
    private boolean need(final String[] perms, final Runnable again) {
        if (Build.VERSION.SDK_INT < 23) return true;
        java.util.ArrayList<String> miss = new java.util.ArrayList<String>();
        for (String p : perms) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) miss.add(p);
        if (miss.isEmpty() || permAsked) return true;
        permAsked = true;
        pendingPerm = again; done = false; tv.setText("Нужен доступ к контактам/звонкам — разрешите на экране.");
        requestPermissions(miss.toArray(new String[0]), 8); return false;
    }
    private void doCall(final String name) {
        if (!need(new String[]{Manifest.permission.READ_CONTACTS, Manifest.permission.CALL_PHONE, Manifest.permission.READ_CALL_LOG}, new Runnable() { public void run() { doCall(name); } })) return;
        if (!hasPerm(Manifest.permission.READ_CONTACTS)) { speakAndEnd("Нет доступа к контактам."); return; }
        resolve(name, new Pick() { public void on(final String[] c) {
        afterSpeech = new Runnable() { public void run() {
            try {
                Intent i = new Intent(hasPerm(Manifest.permission.CALL_PHONE) ? Intent.ACTION_CALL : Intent.ACTION_DIAL, android.net.Uri.parse("tel:" + android.net.Uri.encode(c[1])));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(i);
            } catch (Exception e) {}
            finish();
        } };
        speakAndEnd("Звоню: " + c[0] + ".");
        } });
    }
    private void doTg(final String pid, final String name, final String text) {   // сообщение сотруднику через Telegram-бота, с подтверждением
        afterSpeech = new Runnable() { public void run() {
            listenOnce(new Cb() { public void on(String ans) {
                if (!ans.toLowerCase(Locale.ROOT).matches("^(да|давай|отправ|ага|угу|верно|конечно|подтверждаю|ок).*")) { speakAndEnd("Отменил."); return; }
                final Context c = getApplicationContext();
                new Thread(new Runnable() { public void run() {
                    String r = null; try { r = Net.post(Store.api(c, "tgsend", ""), new JSONObject().put("pid", pid).put("text", text).toString()); } catch (Exception e) {}
                    final boolean ok = r != null && r.contains("\"ok\":true");
                    h.post(new Runnable() { public void run() { speakAndEnd(ok ? "Отправлено." : "Не получилось отправить."); } });
                } }).start();
            } });
        } };
        speakAndEnd("Сообщение для " + name + " в Телеграм: " + text + ". Отправить?");
    }
    private boolean hasPerm(String p) { return Build.VERSION.SDK_INT < 23 || checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private void doSms(final String name, final String text) {
        if (!need(new String[]{Manifest.permission.READ_CONTACTS, Manifest.permission.SEND_SMS, Manifest.permission.READ_CALL_LOG}, new Runnable() { public void run() { doSms(name, text); } })) return;
        if (!hasPerm(Manifest.permission.READ_CONTACTS)) { speakAndEnd("Нет доступа к контактам."); return; }
        resolve(name, new Pick() { public void on(final String[] c) {
        afterSpeech = new Runnable() { public void run() {
            listenOnce(new Cb() { public void on(String ans) {
                if (!ans.toLowerCase(Locale.ROOT).matches("^(да|давай|отправ|ага|угу|верно|конечно|подтверждаю|ок).*")) { speakAndEnd("Отменил."); return; }
                try {
                    if (hasPerm(Manifest.permission.SEND_SMS)) {
                        android.telephony.SmsManager sm = android.telephony.SmsManager.getDefault();
                        sm.sendMultipartTextMessage(c[1], null, sm.divideMessage(text), null, null);
                        speakAndEnd("Отправлено.");
                    } else {   // нет права на отправку — открываем SMS с готовым текстом
                        Intent i = new Intent(Intent.ACTION_SENDTO, android.net.Uri.parse("smsto:" + android.net.Uri.encode(c[1]))); i.putExtra("sms_body", text); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(i); finish();
                    }
                } catch (Exception e) { speakAndEnd("Не получилось отправить."); }
            } });
        } };
        speakAndEnd("Сообщение для " + c[0] + ": " + text + ". Отправить?");
        } });
    }

    private void saveSimple(final String raw) {
        done = true; final String[] pd = new String[]{raw, null}; final Context c = getApplicationContext();
        String t0 = pd[0]; if (t0.length() > 0) t0 = t0.substring(0, 1).toUpperCase(Locale.ROOT) + t0.substring(1);
        final String title = t0; tv.setText(title);
        new Thread(new Runnable() { public void run() {
            String res = null;
            try {
                JSONObject j = new JSONObject().put("title", title);
                android.content.SharedPreferences sp = Store.p(c);
                String lid = sp.getString("v_list", "");
                if (!sp.contains("v_list")) { try { JSONArray la = new JSONObject(sp.getString("data", "{}")).optJSONArray("lists"); if (la != null) for (int i = 0; i < la.length(); i++) if (la.optJSONObject(i).optString("name").toLowerCase(Locale.ROOT).contains("свои дела")) { lid = la.optJSONObject(i).optString("id"); break; } } catch (Exception e) {} }
                if (lid.length() > 0) j.put("list_id", lid);
                int dm = sp.getInt("v_due", 1);
                if (dm == 1) j.put("today", true);
                else if (dm == 2) { Calendar cc = Calendar.getInstance(); cc.add(Calendar.DAY_OF_MONTH, 1); j.put("due", String.format(Locale.US, "%04d-%02d-%02d", cc.get(Calendar.YEAR), cc.get(Calendar.MONTH) + 1, cc.get(Calendar.DAY_OF_MONTH))); }
                if (sp.getBoolean("v_myday", false)) j.put("myday", true);
                res = Net.post(Store.api(c, "add", ""), j.toString());
            } catch (Exception e) {}
            final boolean ok = res != null;
            if (ok) Sync.run(c);
            h.post(new Runnable() { public void run() {
                int sm = Store.p(c).getInt("v_say", 0); speakAndEnd(!ok ? "Нет связи. Не записалось." : sm == 0 ? "Записано. " + title : sm == 1 ? "Записано." : "");
            } });
        } }).start();
    }

    private void speakAndEnd(String t) { done = true; if (tv != null && t.length() > 0) tv.setText(t); if (t.length() == 0) { try { Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE); if (v != null) v.vibrate(new long[]{0, 60, 60, 60}, -1); } catch (Exception e) {} h.postDelayed(new Runnable() { public void run() { finish(); } }, 700); return; } if (ttsReady) say(t); else { pendingSpeak = t; h.postDelayed(new Runnable() { public void run() { finish(); } }, 4000); } }
    private void endSpeech() { Runnable r = afterSpeech; afterSpeech = null; if (r != null) r.run(); else finish(); }
    private void say(final String t) {
        if (tts == null) { finish(); return; }
        final int gen = ++sayGen;
        try { if (sr != null) { sr.cancel(); } } catch (Exception e) {}
        try { tts.stop(); } catch (Exception e) {}
        Neural.stopAll();
        long d = 0;
        if (btRoute || prevMode >= 0) { releaseBt(); btRoute = false; prevMode = -1; d = 700; }   // ответ читаем в обычном (чистом, стерео) режиме наушников — без перескоков звука из «телефонного» канала
        final String nv = Neural.selected(Store.p(this));
        final boolean neural = nv.length() > 0 && Neural.ready(this, nv);
        final float[] rr = {0.85f, 1.0f, 1.2f, 1.4f};
        final float spd = rr[Math.max(0, Math.min(3, Store.p(this).getInt("v_rate", 1)))];
        h.postDelayed(new Runnable() { public void run() {
            if (neural) Neural.speak(VoiceAddActivity.this, nv, t, spd, new Neural.Done() { public void end(boolean ok) {
                h.post(new Runnable() { public void run() { if (gen != sayGen) return; if (ok) endSpeech(); else tts.speak(t, TextToSpeech.QUEUE_FLUSH, null, "ok"); } });   // облако/нейро не вышли (нет сети) — читает системный голос
            } });
            else tts.speak(t, TextToSpeech.QUEUE_FLUSH, null, "ok");
        } }, d);
        h.postDelayed(new Runnable() { public void run() { if (gen == sayGen) finish(); } }, 30000);
    }
    private void finishSoon() { h.postDelayed(new Runnable() { public void run() { finish(); } }, 500); }

    @Override protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        releaseBt();
        try { if (sr != null) { sr.cancel(); sr.destroy(); } } catch (Exception e) {}
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) {}
        super.onDestroy();
    }
}
