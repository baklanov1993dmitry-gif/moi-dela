package com.moidela.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/** Постоянное уведомление журнала: «▶ Начать» / идущий таймер с часиками в строке состояния и «■ Стоп». */
final class JournalNotif {
    static final String CH_RUN = "jr_run", CH_IDLE = "jr_idle";
    static final int ID = 7701;

    static void enable(Context c) {
        SharedPreferences sp = Store.p(c);
        if (!sp.getBoolean("jn_on", false)) { sp.edit().putBoolean("jn_on", true).apply(); }
        update(c);
    }

    static void update(Context c) {
        Context a = c.getApplicationContext();
        SharedPreferences sp = Store.p(a);
        NotificationManager nm = (NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE);
        long st = sp.getLong("jt_start", 0);
        if (st <= 0) { try { nm.cancel(ID); } catch (Throwable e) {} return; }   // постоянную кнопку «Начать» в шторке больше не показываем — только пока идёт таймер
        String title = sp.getString("jt_title", "");
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CH_RUN) == null) {
                NotificationChannel r = new NotificationChannel(CH_RUN, "Журнал: таймер идёт", NotificationManager.IMPORTANCE_LOW);
                r.setShowBadge(false);
                nm.createNotificationChannel(r);
            }
            if (nm.getNotificationChannel(CH_IDLE) == null) {
                NotificationChannel i = new NotificationChannel(CH_IDLE, "Журнал: кнопка «Начать»", NotificationManager.IMPORTANCE_MIN);
                i.setShowBadge(false);
                nm.createNotificationChannel(i);
            }
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(a, st > 0 ? CH_RUN : CH_IDLE) : new Notification.Builder(a);
        int fl = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent open = PendingIntent.getActivity(a, 61, new Intent(a, JournalActivity.class), fl);
        b.setSmallIcon(R.drawable.ic_tile_jr).setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open);
        if (st > 0) {
            b.setContentTitle(title.length() > 0 ? title : "Идёт дело")
             .setContentText("Нажми «Стоп», чтобы записать в журнал")
             .setUsesChronometer(true).setWhen(st).setShowWhen(true)
             .addAction(R.drawable.ic_tile_jr, "■ Стоп и записать", open);
        } else {
            PendingIntent go = PendingIntent.getBroadcast(a, 62, new Intent(a, JournalNotifReceiver.class).setAction("start"), fl);
            b.setContentTitle("Журнал").setContentText("Нажми — запиши, что сделал. «Старт» — засечь новое").setShowWhen(false)
             .addAction(R.drawable.ic_tile_jr, "▶ Старт", go);
        }
        try { nm.notify(ID, b.build()); } catch (Exception e) { /* нет разрешения на уведомления */ }
    }
}
