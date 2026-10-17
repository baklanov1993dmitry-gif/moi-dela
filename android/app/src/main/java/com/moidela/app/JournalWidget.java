package com.moidela.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class JournalWidget extends AppWidgetProvider {
    static String label(Context c) {
        long st = Store.p(c).getLong("jt_start", 0);
        if (st <= 0) return "▶  Журнал: начать";
        return "⏱  с " + new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(st)) + " · остановить";
    }
    static void update(Context c, AppWidgetManager m, int id) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_journal);
        v.setTextViewText(R.id.j_text, label(c));
        int fl = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        v.setOnClickPendingIntent(R.id.j_text, PendingIntent.getActivity(c, 5000 + id, new Intent(c, JournalActivity.class), fl));
        m.updateAppWidget(id, v);
    }
    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, JournalWidget.class))) update(c, m, id);
    }
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
    }
}
