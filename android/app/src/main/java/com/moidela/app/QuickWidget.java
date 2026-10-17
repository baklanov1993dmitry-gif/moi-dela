package com.moidela.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

public class QuickWidget extends AppWidgetProvider {
    static void update(Context c, AppWidgetManager m, int id) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_quick);
        int fl = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        v.setOnClickPendingIntent(R.id.q_text, PendingIntent.getActivity(c, 3000 + id, new Intent(c, QuickAddActivity.class), fl));
        v.setOnClickPendingIntent(R.id.q_mic, PendingIntent.getActivity(c, 4000 + id, new Intent(c, QuickAddActivity.class).putExtra("voice", true), fl));
        m.updateAppWidget(id, v);
    }

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
    }
}
