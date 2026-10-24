package com.moidela.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

/** Звук напоминания-будильника: своя мелодия и громкость из настроек, зациклен, сам замолкает через 90 секунд. */
final class AlarmSound {
    private static MediaPlayer mp;
    private static final Handler H = new Handler(Looper.getMainLooper());
    private static final Runnable AUTO = new Runnable() { public void run() { stop(); } };

    static synchronized void start(Context c) {
        stop();
        try {
            android.content.SharedPreferences sp = Store.p(c);
            float vol = Math.max(0.05f, Math.min(1f, sp.getInt("al_vol", 80) / 100f));
            String u = sp.getString("al_uri", "");
            Uri uri = u.length() > 0 ? Uri.parse(u) : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            MediaPlayer m = new MediaPlayer();
            m.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            m.setDataSource(c.getApplicationContext(), uri);
            m.setLooping(true); m.setVolume(vol, vol); m.prepare(); m.start();
            mp = m;
            H.removeCallbacks(AUTO); H.postDelayed(AUTO, 90000);
        } catch (Exception e) { mp = null; }
    }

    static synchronized void stop() {
        H.removeCallbacks(AUTO);
        if (mp != null) { try { mp.stop(); } catch (Exception e) { } try { mp.release(); } catch (Exception e) { } mp = null; }
    }
}
