package com.moidela.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

public class TodayWidget extends AppWidgetProvider {
    static Intent openApp(Context c) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://moi-dela.pages.dev/?app=tasks")).setPackage(c.getPackageName());
        return i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, TodayWidget.class));
        if (ids.length > 0) for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        int[] rows = {R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4, R.id.w_r5, R.id.w_r6};
        JSONArray a = null;
        try { a = new JSONObject(Store.p(c).getString("data", "{}")).optJSONArray("today"); } catch (Exception e) { /* пусто */ }
        int n = a == null ? 0 : a.length();
        String hd = !Store.linked(c) ? "Мои дела · не подключено" : "Сегодня · " + n;
        v.setTextViewText(R.id.w_title, hd);
        for (int i = 0; i < rows.length; i++) {
            String s = "";
            if (!Store.linked(c)) s = i == 0 ? "Настройки → Уведомления → «Подключить Android»" : "";
            else if (n == 0) s = i == 0 ? "На сегодня пусто 🎉" : "";
            else if (i < n && (i < 5 || n == 6)) s = "• " + a.optJSONObject(i).optString("title");
            else if (i == 5 && n > 6) s = "… и ещё " + (n - 5);
            v.setTextViewText(rows[i], s);
        }
        PendingIntent open = PendingIntent.getActivity(c, 1, openApp(c), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.w_root, open);
        v.setOnClickPendingIntent(R.id.w_add, PendingIntent.getActivity(c, 2, new Intent(c, QuickAddActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    @Override public void onUpdate(final Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
        final PendingResult r = goAsync();
        new Thread(new Runnable() { public void run() { try { Sync.run(c.getApplicationContext()); } finally { r.finish(); } } }).start();
    }
}
