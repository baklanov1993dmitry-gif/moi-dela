package com.moidela.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public class ListService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent i) {
        return new F(getApplicationContext(), i.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0));
    }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new java.util.Date()); }

    /** Задачи для выбранного списка: today | all | star | none | <uuid списка>. */
    static List<JSONObject> rows(Context c, String key) {
        List<JSONObject> out = new ArrayList<>();
        try {
            JSONArray a = new JSONObject(Store.p(c).getString("data", "{}")).optJSONArray("tasks");
            String td = today();
            if (a != null) for (int i = 0; i < a.length(); i++) {
                JSONObject t = a.optJSONObject(i);
                if (t == null) continue;
                String due = t.isNull("due") ? "" : t.optString("due");
                boolean ok;
                if (key.equals("all")) ok = true;
                else if (key.equals("star")) ok = t.optBoolean("starred");
                else if (key.equals("none")) ok = t.isNull("list_id");
                else if (key.equals("today")) ok = (due.length() > 0 && due.compareTo(td) <= 0) || (t.optBoolean("my_day") && td.equals(t.optString("my_day_date")));
                else ok = key.equals(t.isNull("list_id") ? "" : t.optString("list_id"));
                if (ok) out.add(t);
            }
        } catch (Exception e) { /* пусто */ }
        Collections.sort(out, new Comparator<JSONObject>() {
            public int compare(JSONObject x, JSONObject y) {
                String a = x.isNull("due") ? "9999" : x.optString("due"), b = y.isNull("due") ? "9999" : y.optString("due");
                return a.compareTo(b);
            }
        });
        return out;
    }

    static class F implements RemoteViewsFactory {
        final Context c; final int wid; List<JSONObject> rows = new ArrayList<>();
        F(Context c, int wid) { this.c = c; this.wid = wid; }
        public void onCreate() {}
        public void onDataSetChanged() { rows = rows(c, Store.p(c).getString("wl_" + wid, "today")); }
        public void onDestroy() {}
        public int getCount() { return rows.size(); }
        public long getItemId(int i) { return i; }
        public boolean hasStableIds() { return false; }
        public int getViewTypeCount() { return 1; }
        public RemoteViews getLoadingView() { return null; }
        public RemoteViews getViewAt(int i) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_item);
            if (i >= rows.size()) return v;
            JSONObject t = rows.get(i);
            String id = t.optString("id"), due = t.isNull("due") ? "" : t.optString("due"), td = today();
            v.setTextViewText(R.id.w_txt, (t.optBoolean("starred") ? "★ " : "") + t.optString("title"));
            String lab = ""; int col = 0xFF94A3B8;
            if (due.length() >= 10) {
                if (due.compareTo(td) < 0) { lab = "просрочено"; col = 0xFFEF4444; }
                else if (due.equals(td)) { lab = "сегодня"; col = 0xFF3B82F6; }
                else lab = due.substring(8, 10) + "." + due.substring(5, 7);
            }
            v.setTextViewText(R.id.w_due, lab);
            v.setTextColor(R.id.w_due, col);
            v.setViewVisibility(R.id.w_due, lab.length() == 0 ? View.GONE : View.VISIBLE);
            Intent done = new Intent().putExtra("a", "done").putExtra("id", id);
            Intent open = new Intent().putExtra("a", "open").putExtra("id", id);
            v.setOnClickFillInIntent(R.id.w_chk, done);
            v.setOnClickFillInIntent(R.id.w_txt, open);
            v.setOnClickFillInIntent(R.id.w_due, open);
            return v;
        }
    }
}
