package com.moidela.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Невидимый «перевалочный» экран: клик по строке виджета — открыть приложение или отметить задачу. */
public class WidgetActivity extends Activity {
    @Override protected void onCreate(Bundle s) {
        super.onCreate(s);
        Intent i = getIntent();
        String a = i.getStringExtra("a"), id = i.getStringExtra("id");
        try {
            if ("done".equals(a) && id != null) W.done(this, id);
            else startActivity(W.openApp(this));
        } catch (Throwable e) { /* не падаем */ }
        finish();
    }
}
