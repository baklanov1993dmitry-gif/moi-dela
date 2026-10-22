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
        setContentView(tv);
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() { public void onInit(int s) {
            if (s == TextToSpeech.SUCCESS) { tts.setLanguage(new Locale("ru", "RU")); ttsReady = true; if (pendingSpeak != null) say(pendingSpeak); }
            else if (pendingSpeak != null) finishSoon();
        } });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            public void onStart(String id) {}
            public void onDone(String id) { h.post(new Runnable() { public void run() { finish(); } }); }
            public void onError(String id) { h.post(new Runnable() { public void run() { finish(); } }); }
        });
        if (!Store.linked(this)) { speakAndEnd("Приложение не привязано к аккаунту. Откройте Мои дела."); return; }
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 7); return;
        }
        startListen();
    }

    @Override public void onRequestPermissionsResult(int rc, String[] p, int[] r) {
        if (rc == 7 && r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) startListen();
        else speakAndEnd("Нет доступа к микрофону. Разрешите его в настройках приложения.");
    }

    private void startListen() {
        if (started) return; started = true;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { speakAndEnd("Распознавание речи недоступно на телефоне."); return; }
        try { new ToneGenerator(AudioManager.STREAM_MUSIC, 80).startTone(ToneGenerator.TONE_PROP_BEEP, 150); } catch (Exception e) {}
        try { Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE); if (v != null) v.vibrate(60); } catch (Exception e) {}
        sr = SpeechRecognizer.createSpeechRecognizer(this);
        sr.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle p) {}
            public void onBeginningOfSpeech() {}
            public void onRmsChanged(float v) {}
            public void onBufferReceived(byte[] b) {}
            public void onEndOfSpeech() { tv.setText("…"); }
            public void onPartialResults(Bundle p) { ArrayList<String> a = p.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if (a != null && a.size() > 0) tv.setText(a.get(0)); }
            public void onEvent(int t, Bundle p) {}
            public void onError(int e) { speakAndEnd(e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? "Не расслышал. Повторите." : "Не получилось записать голос."); }
            public void onResults(Bundle r) {
                ArrayList<String> a = r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String t = a != null && a.size() > 0 ? a.get(0).trim() : "";
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
        h.postDelayed(new Runnable() { public void run() { if (!done && sr != null) sr.stopListening(); } }, 20000);
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

    private void save(final String raw) {
        done = true; final String[] pd = parseDue(raw); final Context c = getApplicationContext();
        String t0 = pd[0]; if (t0.length() > 0) t0 = t0.substring(0, 1).toUpperCase(Locale.ROOT) + t0.substring(1);
        final String title = t0; tv.setText(title);
        new Thread(new Runnable() { public void run() {
            String res = null;
            try {
                JSONObject j = new JSONObject().put("title", title);
                if (pd[1] != null) j.put("due", pd[1]);
                res = Net.post(Store.api(c, "add", ""), j.toString());
            } catch (Exception e) {}
            final boolean ok = res != null;
            if (ok) Sync.run(c);
            h.post(new Runnable() { public void run() {
                speakAndEnd(ok ? "Записано. " + title + (pd[1] != null ? ". Срок поставлен." : "") : "Нет связи. Не записалось.");
            } });
        } }).start();
    }

    private void speakAndEnd(String t) { done = true; if (tv != null) tv.setText(t); if (ttsReady) say(t); else { pendingSpeak = t; h.postDelayed(new Runnable() { public void run() { finish(); } }, 4000); } }
    private void say(String t) { if (tts == null) { finish(); return; } tts.speak(t, TextToSpeech.QUEUE_FLUSH, null, "ok"); h.postDelayed(new Runnable() { public void run() { finish(); } }, 12000); }
    private void finishSoon() { h.postDelayed(new Runnable() { public void run() { finish(); } }, 500); }

    @Override protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        try { if (sr != null) { sr.cancel(); sr.destroy(); } } catch (Exception e) {}
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) {}
        super.onDestroy();
    }
}
