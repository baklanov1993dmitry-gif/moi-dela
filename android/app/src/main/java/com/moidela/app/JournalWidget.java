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
    static void update(Context c, AppWidgetManager m, int id) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_journal);
        long st = Store.p(c).getLong("jt_start", 0);
        String t = Store.p(c).getString("jt_title", "");
        if (st <= 0) {
            v.setInt(R.id.j_root, "setBackgroundResource", R.drawable.jw_idle);
            v.setTextViewText(R.id.j_icon, "▶");
            v.setTextViewText(R.id.j_text, "Журнал");
            v.setTextViewText(R.id.j_sub, "Нажми, чтобы начать дело");
        } else {
            v.setInt(R.id.j_root, "setBackgroundResource", R.drawable.jw_run);
            v.setTextViewText(R.id.j_icon, "■");
            v.setTextViewText(R.id.j_text, t.length() > 0 ? t : "Идёт дело");
            v.setTextViewText(R.id.j_sub, "с " + new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(st)) + " · нажми, чтобы записать");
        }
        int fl = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        v.setOnClickPendingIntent(R.id.j_root, PendingIntent.getActivity(c, 5000 + id, new Intent(c, JournalActivity.class), fl));
        m.updateAppWidget(id, v);
    }
    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, JournalWidget.class))) update(c, m, id);
        JournalNotif.update(c);
    }
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
        JournalNotif.enable(c);
    }
}
