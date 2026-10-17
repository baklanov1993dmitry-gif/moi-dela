package com.moidela.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

public class QsJournal extends TileService {
    @Override public void onStartListening() {
        Tile t = getQsTile(); if (t == null) return;
        boolean run = Store.p(this).getLong("jt_start", 0) > 0;
        t.setLabel(run ? "Журнал: стоп" : "Журнал: старт");
        t.setState(run ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        t.updateTile();
    }
    @Override public void onClick() {
        JournalNotif.enable(this);
        Intent i = new Intent(this, JournalActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(PendingIntent.getActivity(this, 1, i, PendingIntent.FLAG_IMMUTABLE));
        else startActivityAndCollapse(i);
    }
}
