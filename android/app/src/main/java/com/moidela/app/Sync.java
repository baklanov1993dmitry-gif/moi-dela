package com.moidela.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;

final class Sync {
    /** Блокирующий: вызывать из фонового потока. Тянет задачи, ставит будильники, обновляет виджет. */
    /** Цепочка пробуждений раз в ~5 минут: подхватывает напоминания, созданные в приложении. */
    static void chain(Context c) {
        if (!Store.linked(c)) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, new Intent(c, BootReceiver.class).setAction("md.chain"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long at = System.currentTimeMillis() + 5 * 60 * 1000L;
        try { am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); }
        catch (Throwable e) { try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); } catch (Throwable e2) { /* остаётся 15-минутная задача */ } }
    }

    static void run(final Context c) {
        try { chain(c); } catch (Throwable e) { /* не критично */ }
        try { run0(c); } catch (final Throwable e) {
            Store.p(c).edit().putString("err", String.valueOf(e)).apply();
            new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() { public void run() {
                android.widget.Toast.makeText(c, "Синхронизация: " + e, android.widget.Toast.LENGTH_LONG).show(); } });
        }
    }

    private static void run0(Context c) {
        if (!Store.linked(c)) return;
        String body = Net.get(Store.api(c, "list", ""));
        if (body == null) return;
        try {
            JSONObject o = new JSONObject(body);
            Store.p(c).edit().putString("data", body).apply();
            schedule(c, o.optJSONArray("rem"));
            JSONObject vc = o.optJSONObject("vcfg");   // настройки голоса с сайта: берём, если они новее локальных
            if (vc != null && vc.optLong("ts", 0) > Store.p(c).getLong("v_ts", 0)) {
                Store.p(c).edit().putString("v_list", vc.optString("list", "")).putInt("v_due", vc.optInt("due", 1)).putBoolean("v_myday", vc.optBoolean("myday", false))
                    .putInt("v_say", vc.optInt("say", 0)).putInt("v_rate", vc.optInt("rate", 1)).putBoolean("v_beep", vc.optBoolean("beep", true)).putBoolean("v_smart", vc.optBoolean("smart", true)).putLong("v_ts", vc.optLong("ts", 0)).apply();
            }
        } catch (Exception e) { /* кривой ответ — оставляем прежнее */ }
        W.refreshAll(c);
    }

    static PendingIntent alarmPi(Context c, String id, String title, long at, int flags) {
        Intent i = new Intent(c, AlarmReceiver.class).setData(Uri.parse("md://t/" + id));
        i.putExtra("id", id).putExtra("title", title).putExtra("at", at);
        return PendingIntent.getBroadcast(c, 0, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c, JSONArray rem) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        String prev = Store.p(c).getString("alarms", "");
        StringBuilder now = new StringBuilder();
        long t = System.currentTimeMillis();
        java.util.HashSet<String> keep = new java.util.HashSet<>();
        if (rem != null) for (int i = 0; i < rem.length(); i++) {
            JSONObject x = rem.optJSONObject(i);
            if (x == null) continue;
            long at = x.optLong("at", 0);
            String id = x.optString("id");
            if (at <= t + 2000 || id.length() < 8) continue;
            PendingIntent pi = alarmPi(c, id, x.optString("title"), at, PendingIntent.FLAG_UPDATE_CURRENT);
            PendingIntent show = PendingIntent.getActivity(c, 0, W.openApp(c), PendingIntent.FLAG_IMMUTABLE);
            try { am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), pi); } catch (Exception e) { continue; }
            keep.add(id);
            if (now.length() > 0) now.append(',');
            now.append(id);
        }
        for (String id : prev.split(",")) {   // убрать будильники задач, у которых напоминание пропало/перенесено
            if (id.length() < 8 || keep.contains(id)) continue;
            PendingIntent pi = alarmPi(c, id, "", 0, PendingIntent.FLAG_NO_CREATE);
            if (pi != null) { am.cancel(pi); pi.cancel(); }
        }
        Store.p(c).edit().putString("alarms", now.toString()).apply();
    }

    static void ensureJob(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        JobInfo.Builder b = new JobInfo.Builder(1, new ComponentName(c, SyncJob.class))
            .setPeriodic(15 * 60 * 1000L).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true);
        js.schedule(b.build());
    }
}
