package com.moidela.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.util.Calendar;

/** «Окно голоса»: по расписанию (например 18:00–23:00) в шторке висит закреплённое уведомление — один тап и запись голосом. */
public class VoiceWindow extends BroadcastReceiver {
    static final String CH = "voice_win";
    @Override public void onReceive(Context c, Intent i) { refresh(c.getApplicationContext()); }

    static boolean inWindow(SharedPreferences sp) {
        if (!sp.getBoolean("v_win", false)) return false;
        Calendar n = Calendar.getInstance(); int now = n.get(Calendar.HOUR_OF_DAY) * 60 + n.get(Calendar.MINUTE);
        int a = sp.getInt("v_win_from", 18 * 60), b = sp.getInt("v_win_to", 23 * 60);
        if (sp.getBoolean("v_win_wd", true)) { int d = n.get(Calendar.DAY_OF_WEEK); if (d == Calendar.SATURDAY || d == Calendar.SUNDAY) return false; }
        return a <= b ? now >= a && now < b : now >= a || now < b;
    }

    /** показать/убрать уведомление по текущему времени и поставить будильники на ближайшие границы окна */
    static void refresh(Context c) {
        SharedPreferences sp = Store.p(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (inWindow(sp)) show(c, nm); else try { nm.cancel(7100); } catch (Throwable e) {}
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        for (int k = 0; k < 2; k++) {
            Intent in = new Intent(c, VoiceWindow.class).setAction("w" + k);
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = PendingIntent.getBroadcast(c, 7101 + k, in, fl);
            try { am.cancel(pi); } catch (Throwable e) {}
            if (!sp.getBoolean("v_win", false)) continue;
            int mins = sp.getInt(k == 0 ? "v_win_from" : "v_win_to", k == 0 ? 18 * 60 : 23 * 60);
            Calendar t = Calendar.getInstance(); t.set(Calendar.HOUR_OF_DAY, mins / 60); t.set(Calendar.MINUTE, mins % 60); t.set(Calendar.SECOND, 5); t.set(Calendar.MILLISECOND, 0);
            if (t.getTimeInMillis() <= System.currentTimeMillis()) t.add(Calendar.DAY_OF_YEAR, 1);
            try { am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t.getTimeInMillis(), pi); }
            catch (Throwable e) { try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t.getTimeInMillis(), pi); } catch (Throwable e2) {} }
        }
    }

    private static void show(Context c, NotificationManager nm) {
        try {
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
                NotificationChannel ch = new NotificationChannel(CH, "Окно голоса", NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("Закреплённая кнопка «Сказать» на время, которое вы выбрали"); ch.setShowBadge(false); nm.createNotificationChannel(ch);
            }
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent go = PendingIntent.getActivity(c, 7103, new Intent(c, VoiceAddActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), fl);
            android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new android.app.Notification.Builder(c, CH) : new android.app.Notification.Builder(c);
            b.setSmallIcon(R.drawable.ic_tile_jr).setContentTitle("🎤 Мои дела слушают").setContentText("Тапните и скажите дело, вопрос или «позвони …»")
                .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(go);
            if (Build.VERSION.SDK_INT >= 20) b.addAction(new android.app.Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_tile_jr), "🎤 Сказать", go).build());
            nm.notify(7100, b.build());
        } catch (Throwable e) {}
    }
}
