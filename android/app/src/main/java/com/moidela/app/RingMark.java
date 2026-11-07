package com.moidela.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;
import org.json.JSONObject;

/** «🔔 На звонок»: заносит «Артист — Название» задачей в список «Мелодии на звонок» (создаётся сам). */
public class RingMark extends BroadcastReceiver {
    @Override public void onReceive(final Context c0, Intent in) {
        final Context c = c0.getApplicationContext();
        final String a = in.getStringExtra("artist"), t = in.getStringExtra("title");
        final PendingResult pr = goAsync();
        new Thread(new Runnable() { public void run() { try { mark(c, a == null ? "" : a, t == null ? "" : t); } finally { pr.finish(); } } }).start();
    }

    static void mark(final Context c, String artist, String title) {
        String msg;
        try {
            String key = "ring_" + Integer.toHexString((artist + "|" + title).toLowerCase().hashCode());
            if (Store.p(c).getBoolean(key, false)) msg = "Уже в списке «Мелодии на звонок»";
            else if (!Store.linked(c)) msg = "Приложение не привязано к аккаунту";
            else {
                String name = (artist.length() > 0 ? artist + " — " : "") + title;
                String res = Net.post(Store.api(c, "add", ""), new JSONObject().put("title", "🔔 " + name).put("list_name", "Мелодии на звонок").put("list_icon", "🔔").toString());
                if (res != null && res.contains("\"ok\"")) { Store.p(c).edit().putBoolean(key, true).apply(); Sync.run(c); msg = "🔔 Добавлено в «Мелодии на звонок»"; }
                else msg = "Не получилось добавить — проверьте связь";
            }
        } catch (Throwable e) { msg = "Не получилось добавить"; }
        final String m = msg;
        new Handler(Looper.getMainLooper()).post(new Runnable() { public void run() { Toast.makeText(c, m, Toast.LENGTH_LONG).show(); } });
    }
}
