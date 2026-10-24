package com.moidela.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {
    static final String CH = "alarm2";

    static void channel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CH) != null) return;
        NotificationChannel ch = new NotificationChannel(CH, "Напоминания (будильник)", NotificationManager.IMPORTANCE_HIGH);
        ch.setSound(null, null);   // звук играет AlarmSound (своя мелодия и громкость)
        ch.setBypassDnd(true);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 500, 300, 500, 300, 800});
        nm.createNotificationChannel(ch);
    }

    static PendingIntent act(Context c, String id, String a) {
        Intent i = new Intent(c, ActionReceiver.class).setData(Uri.parse("md://a/" + a + "/" + id));
        i.putExtra("id", id).putExtra("a", a);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override public void onReceive(Context c, Intent i) {
        String id = i.getStringExtra("id"), title = i.getStringExtra("title");
        if (id == null) return;
        channel(c);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
        Intent ai = new Intent(c, AlarmActivity.class).putExtra("id", id).putExtra("title", title == null ? "" : title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent full = PendingIntent.getActivity(c, id.hashCode(), ai, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmSound.start(c);
        b.setSmallIcon(R.drawable.ic_tile).setContentTitle(title == null || title.length() == 0 ? "⏰ Напоминание" : "⏰ " + title).setContentText("Напоминание")
            .setFullScreenIntent(full, true).setOngoing(true).setDeleteIntent(act(c, id, "stop"))
            .setStyle(new Notification.BigTextStyle().bigText(title == null ? "" : title))
            .setAutoCancel(true).setCategory(Notification.CATEGORY_ALARM).setPriority(Notification.PRIORITY_MAX)
            .setContentIntent(full)
            .addAction(0, "Выключить", act(c, id, "stop"))
            .addAction(0, "Готово", act(c, id, "done"))
            .addAction(0, "+1 час", act(c, id, "snooze"))
            .addAction(0, "Завтра", act(c, id, "tom"));
        if (Build.VERSION.SDK_INT < 26) {
            b.setVibrate(new long[]{0, 500, 300, 500});
        }
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id.hashCode(), b.build());
    }
}
