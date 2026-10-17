package com.moidela.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Кнопка «Старт» в уведомлении журнала: запускает таймер без открытия приложения. */
public class JournalNotifReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        if (!"start".equals(i.getAction())) return;
        if (Store.p(c).getLong("jt_start", 0) <= 0) Store.p(c).edit().putLong("jt_start", System.currentTimeMillis()).putString("jt_title", "").apply();
        JournalWidget.refreshAll(c.getApplicationContext());
    }
}
