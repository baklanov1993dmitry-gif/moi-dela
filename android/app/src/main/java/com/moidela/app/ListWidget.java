package com.moidela.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class ListWidget extends AppWidgetProvider {
    static void update(Context c, AppWidgetManager m, int id) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        String key = Store.p(c).getString("wl_" + id, "today");
        v.setTextViewText(R.id.w_title, Store.p(c).getString("wt_" + id, "Сегодня"));
        int n = ListService.rows(c, key).size();
        v.setTextViewText(R.id.w_count, Store.linked(c) ? (n == 0 ? "" : String.valueOf(n)) : "");
        v.setTextViewText(R.id.w_empty, Store.linked(c) ? "Тут чисто 🎉" : "Откройте «Мои дела» → ⚙️ → Уведомления → «Подключить Android»");
        Intent si = new Intent(c, ListService.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        si.setData(Uri.parse(si.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.w_list, si);
        v.setEmptyView(R.id.w_list, R.id.w_empty);
        v.setPendingIntentTemplate(R.id.w_list, PendingIntent.getActivity(c, id, new Intent(c, WidgetActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));
        v.setOnClickPendingIntent(R.id.w_title, PendingIntent.getActivity(c, 1000 + id, W.openApp(c), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        Intent add = new Intent(c, QuickAddActivity.class).putExtra("today", key.equals("today"));
        if (key.length() == 36) add.putExtra("list", key);
        v.setOnClickPendingIntent(R.id.w_add, PendingIntent.getActivity(c, 2000 + id, add, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        m.updateAppWidget(id, v);
    }

    @Override public void onUpdate(final Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
        m.notifyAppWidgetViewDataChanged(ids, R.id.w_list);
        final PendingResult r = goAsync();
        new Thread(new Runnable() { public void run() { try { Sync.run(c.getApplicationContext()); } finally { r.finish(); } } }).start();
    }

    @Override public void onDeleted(Context c, int[] ids) {
        android.content.SharedPreferences.Editor e = Store.p(c).edit();
        for (int id : ids) e.remove("wl_" + id).remove("wt_" + id);
        e.apply();
    }
}
