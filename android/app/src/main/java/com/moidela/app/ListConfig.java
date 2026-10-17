package com.moidela.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Bundle;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

public class ListConfig extends Activity {
    int wid;

    @Override protected void onCreate(Bundle s) {
        super.onCreate(s);
        setResult(RESULT_CANCELED);
        wid = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0);
        if (wid == 0) { finish(); return; }
        final ArrayList<String> keys = new ArrayList<>(), names = new ArrayList<>();
        keys.add("today"); names.add("📅 Сегодня и просрочено");
        keys.add("all"); names.add("📋 Все задачи");
        keys.add("star"); names.add("⭐ Избранные");
        keys.add("none"); names.add("📥 Без списка");
        try {
            JSONArray a = new JSONObject(Store.p(this).getString("data", "{}")).optJSONArray("lists");
            if (a != null) for (int i = 0; i < a.length(); i++) {
                JSONObject l = a.optJSONObject(i);
                keys.add(l.optString("id")); names.add((l.isNull("icon") ? "" : l.optString("icon") + " ") + l.optString("name"));
            }
        } catch (Exception e) { /* только базовые */ }
        new AlertDialog.Builder(this).setTitle("Что показывать в виджете?")
            .setItems(names.toArray(new String[0]), new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int w) {
                String nm = names.get(w);
                Store.p(ListConfig.this).edit().putString("wl_" + wid, keys.get(w)).putString("wt_" + wid, nm.replaceFirst("^\\S+\\s", "")).apply();
                AppWidgetManager m = AppWidgetManager.getInstance(ListConfig.this);
                ListWidget.update(ListConfig.this, m, wid);
                m.notifyAppWidgetViewDataChanged(wid, R.id.w_list);
                setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid));
                finish();
            } })
            .setOnCancelListener(new DialogInterface.OnCancelListener() { public void onCancel(DialogInterface d) { finish(); } })
            .show();
    }
}
