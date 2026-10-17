package com.moidela.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;

final class W {
    static Intent openApp(Context c) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://moi-dela.pages.dev/?app=tasks")).setPackage(c.getPackageName());
        return i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, ListWidget.class));
        for (int id : ids) ListWidget.update(c, m, id);
        if (ids.length > 0) m.notifyAppWidgetViewDataChanged(ids, R.id.w_list);
        int[] q = m.getAppWidgetIds(new ComponentName(c, QuickWidget.class));
        for (int id : q) QuickWidget.update(c, m, id);
    }

    /** Отметить выполненной прямо из виджета: сразу убираем из кэша, затем сообщаем серверу. */
    static void done(final Context ctx, final String id) {
        final Context c = ctx.getApplicationContext();
        try {
            JSONObject o = new JSONObject(Store.p(c).getString("data", "{}"));
            JSONArray a = o.optJSONArray("tasks"), n = new JSONArray();
            if (a != null) for (int i = 0; i < a.length(); i++) if (!id.equals(a.optJSONObject(i).optString("id"))) n.put(a.optJSONObject(i));
            o.put("tasks", n);
            Store.p(c).edit().putString("data", o.toString()).apply();
        } catch (Exception e) { /* кэш не тронули */ }
        refreshAll(c);
        new Thread(new Runnable() { public void run() {
            final String res = Net.get(Store.api(c, "done", "&id=" + id));
            new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() { public void run() {
                android.widget.Toast.makeText(c, res == null ? "Нет связи — не отметилось" : "Готово ✓", android.widget.Toast.LENGTH_SHORT).show(); } });
            Sync.run(c);
        } }).start();
    }
}
