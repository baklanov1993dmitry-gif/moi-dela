package com.moidela.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(final Context c, Intent i) {
        JournalNotif.update(c);
        try { VoiceWindow.refresh(c.getApplicationContext()); } catch (Throwable e) {}
        final PendingResult r = goAsync();
        new Thread(new Runnable() { public void run() { try { Sync.run(c.getApplicationContext()); } finally { r.finish(); } } }).start();
    }
}
