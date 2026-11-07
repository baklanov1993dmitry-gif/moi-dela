package com.moidela.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Build;
import android.service.notification.NotificationListenerService;
import java.util.List;

/** Следит за плеером (Яндекс Музыка), ищет текст песни и показывает его уведомлением под плеером. Нужен «Доступ к уведомлениям». */
public class LyricsListener extends NotificationListenerService {
    static final String CH = "lyrics";
    static final int NID = 7790;
    static final String[] PKGS = { "ru.yandex.music" };

    private MediaSessionManager msm;
    private ComponentName cn;
    private MediaController cur;
    private String lastKey = "";
    private volatile String wantKey = "";

    private final MediaSessionManager.OnActiveSessionsChangedListener sl = new MediaSessionManager.OnActiveSessionsChangedListener() {
        @Override public void onActiveSessionsChanged(List<MediaController> l) { attach(l); }
    };
    private final MediaController.Callback cb = new MediaController.Callback() {
        @Override public void onMetadataChanged(MediaMetadata m) { handle(m); }
        @Override public void onPlaybackStateChanged(PlaybackState s) { if (s != null && (s.getState() == PlaybackState.STATE_STOPPED || s.getState() == PlaybackState.STATE_NONE)) cancel(); }
    };

    @Override public void onListenerConnected() {
        try {
            cn = new ComponentName(this, LyricsListener.class);
            msm = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
            msm.addOnActiveSessionsChangedListener(sl, cn);
            attach(msm.getActiveSessions(cn));
        } catch (Throwable e) { }
    }
    @Override public void onListenerDisconnected() {
        try { if (msm != null) msm.removeOnActiveSessionsChangedListener(sl); if (cur != null) cur.unregisterCallback(cb); } catch (Throwable e) { }
        cur = null;
    }

    private void attach(List<MediaController> l) {
        try {
            MediaController pick = null;
            if (l != null) for (MediaController c : l) for (String p : PKGS) if (p.equals(c.getPackageName())) { pick = c; break; }
            if (pick == null) { if (cur != null) { cur.unregisterCallback(cb); cur = null; } cancel(); return; }
            if (cur != null && cur.getSessionToken().equals(pick.getSessionToken())) return;
            if (cur != null) cur.unregisterCallback(cb);
            cur = pick; cur.registerCallback(cb);
            handle(cur.getMetadata());
        } catch (Throwable e) { }
    }

    private void cancel() { try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(NID); } catch (Throwable e) { } lastKey = ""; wantKey = ""; }

    private void handle(MediaMetadata m) {
        if (m == null) return;
        final String title = m.getString(MediaMetadata.METADATA_KEY_TITLE);
        String ar = m.getString(MediaMetadata.METADATA_KEY_ARTIST);
        if (ar == null || ar.length() == 0) ar = m.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
        final String artist = ar == null ? "" : ar;
        if (title == null || title.length() == 0) return;
        final String key = artist + "|" + title;
        if (key.equals(lastKey)) return;
        lastKey = key; wantKey = key;
        Store.p(this).edit().putString("lyr_artist", artist).putString("lyr_title", title).apply();
        final Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() {
            LyricsFetch.Res r = null;
            try { r = LyricsFetch.get(c, artist, title); } catch (Throwable e) { }
            if (!key.equals(wantKey)) return;   // за это время переключили трек
            if (r == null) { try { ((NotificationManager) c.getSystemService(NOTIFICATION_SERVICE)).cancel(NID); } catch (Throwable e) { } return; }
            post(c, artist, title, r);
        } }).start();
    }

    static void post(Context c, String artist, String title, LyricsFetch.Res r) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
                NotificationChannel ch = new NotificationChannel(CH, "Тексты песен", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false); ch.setSound(null, null); nm.createNotificationChannel(ch);
            }
            StringBuilder sb = new StringBuilder(); int shown = 0;
            for (int i = 0; i < r.o.length && shown < 12; i++) {
                String o = r.o[i] == null ? "" : r.o[i].trim(); if (o.length() == 0) continue;
                String t = i < r.t.length && r.t[i] != null ? r.t[i].trim() : "";
                if (sb.length() > 0) sb.append('\n');
                sb.append(o); if (t.length() > 0) sb.append("\n   ").append(t);
                shown++;
            }
            Intent in = new Intent(c, LyricsActivity.class).putExtra("artist", artist).putExtra("title", title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(c, 7790, in, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
            b.setSmallIcon(R.drawable.ic_tile).setContentTitle("♪ " + (artist.length() > 0 ? artist + " — " : "") + title)
                .setContentText(r.o.length > 0 ? r.o[0] : "").setStyle(new Notification.BigTextStyle().bigText(sb.toString()).setSummaryText(r.src + " · нажмите, чтобы открыть полностью"))
                .addAction(0, "🔔 На звонок", PendingIntent.getBroadcast(c, 7791, new Intent(c, RingMark.class).putExtra("artist", artist).putExtra("title", title), PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)))
                .setContentIntent(pi).setOngoing(false).setOnlyAlertOnce(true).setShowWhen(false);
            nm.notify(NID, b.build());
        } catch (Throwable e) { }
    }
}
