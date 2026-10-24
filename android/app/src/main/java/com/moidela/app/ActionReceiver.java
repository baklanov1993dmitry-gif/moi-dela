package com.moidela.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

public class ActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(final Context c, Intent i) {
        final String id = i.getStringExtra("id"), a = i.getStringExtra("a");
        if (id == null || a == null) return;
        AlarmSound.stop();
        if (a.equals("stop")) { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(id.hashCode()); return; }
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(id.hashCode());
        final PendingResult r = goAsync();
        new Thread(new Runnable() { public void run() {
            try {
                String res = Net.get(Store.api(c, a, "&id=" + id));
                final String msg = res == null ? "Нет связи — не получилось" : a.equals("done") ? "Готово ✓" : a.equals("snooze") ? "Отложено на час" : "Перенесено на завтра";
                new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() { public void run() { Toast.makeText(c, msg, Toast.LENGTH_SHORT).show(); } });
                Sync.run(c.getApplicationContext());
            } finally { r.finish(); }
        } }).start();
    }
}
