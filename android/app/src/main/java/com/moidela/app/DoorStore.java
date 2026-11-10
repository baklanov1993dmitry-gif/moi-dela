package com.moidela.app;

import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.RemoteViews;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Виджеты домофона («Мой дом» и др.): несколько штук с именами для голоса; «нажатие» кнопки виджета без экрана. */
public class DoorStore {
    static final int HOST_ID = 7797;

    // ---- общий хост: живёт, пока жив процесс (вид виджета хранится у нас, а не запрашивается заново) ----
    static AppWidgetHost sHost; static boolean sListening; static final Map<Integer, AppWidgetHostView> sViews = new HashMap<Integer, AppWidgetHostView>();
    static final ArrayList<String> sLog = new ArrayList<String>(); static int sFlip = 0;
    static synchronized void log(String m) { sLog.add(new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date()) + " " + m); while (sLog.size() > 40) sLog.remove(0); }
    static String logText() { StringBuilder b = new StringBuilder(); synchronized (DoorStore.class) { for (String x : sLog) b.append(x).append('\n'); } return b.toString(); }
    static class DoorView extends AppWidgetHostView {
        int wid = -1;
        DoorView(Context c) { super(c); }
        @Override public void updateAppWidget(RemoteViews rv) { log("виджет " + wid + ": " + (rv == null ? "заготовка (null)" : "пришёл вид, layout " + rv.getLayoutId())); super.updateAppWidget(rv); }
    }
    static class DoorHost extends AppWidgetHost {
        DoorHost(Context c) { super(c, HOST_ID); }
        @Override protected AppWidgetHostView onCreateView(Context c, int id, AppWidgetProviderInfo info) { DoorView v = new DoorView(c); v.wid = id; return v; }
    }
    static synchronized AppWidgetHost host(Context c) {
        if (sHost == null) sHost = new DoorHost(c.getApplicationContext());
        if (!sListening) { try { sHost.startListening(); sListening = true; log("слушатель включён"); } catch (Throwable t) { log("startListening: " + t); } }
        return sHost;
    }
    static synchronized AppWidgetHostView view(Context c, int wid, AppWidgetProviderInfo pi) {
        AppWidgetHostView v = sViews.get(wid);
        if (v == null) { v = host(c).createView(c.getApplicationContext(), wid, pi); sViews.put(wid, v); log("создан вид виджета " + wid); }
        return v;
    }
    static void forget(int wid) { sViews.remove(wid); }
    /** разные способы заставить провайдера прислать свежий вид */
    static void nudge(Context c, AppWidgetProviderInfo pi, int wid, AppWidgetHostView hv, int kind) {
        if (kind == 0) {
            try { float d = c.getResources().getDisplayMetrics().density; int w = (int) (pi.minWidth / d) + 40 + (sFlip++ % 2), hh = (int) (pi.minHeight / d) + 40; hv.updateAppWidgetSize(null, w, hh, w, hh); log("толчок: смена размера " + w + "x" + hh); } catch (Throwable t) { log("толчок размера: " + t); }
        } else { refresh(c, pi, wid); log("толчок: широковещательный UPDATE"); }
    }

    static class E { int wid; String name = "", provider = "", key = ""; int idx = -1; }
    interface Cb { void end(boolean ok, String msg); }

    static List<E> load(Context c) {
        List<E> l = new ArrayList<E>(); SharedPreferences p = c.getSharedPreferences("door", Context.MODE_PRIVATE);
        try {
            JSONArray a = new JSONArray(p.getString("list", "[]"));
            for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); E e = new E(); e.wid = o.getInt("wid"); e.name = o.optString("name"); e.provider = o.optString("provider"); e.key = o.optString("key"); e.idx = o.optInt("idx", -1); l.add(e); }
        } catch (Exception x) { }
        int old = p.getInt("wid", -1);   // привязка из первой тестовой версии
        if (old >= 0) { boolean have = false; for (E e : l) if (e.wid == old) have = true; if (!have) { E e = new E(); e.wid = old; e.name = "домофон"; l.add(e); } p.edit().remove("wid").apply(); save(c, l); }
        return l;
    }

    static void save(Context c, List<E> l) {
        JSONArray a = new JSONArray();
        try { for (E e : l) a.put(new JSONObject().put("wid", e.wid).put("name", e.name).put("provider", e.provider).put("key", e.key).put("idx", e.idx)); } catch (Exception x) { }
        c.getSharedPreferences("door", Context.MODE_PRIVATE).edit().putString("list", a.toString()).apply();
    }

    /** нормализация для сравнения: нижний регистр, ё→е, числа словами → цифры, без знаков препинания */
    static String norm(String s) {
        s = s == null ? "" : s.toLowerCase().replace('ё', 'е').replaceAll("[^a-zа-я0-9]+", " ").trim();
        String[][] w = {{"один", "1"}, {"первая", "1"}, {"первый", "1"}, {"первое", "1"}, {"два", "2"}, {"вторая", "2"}, {"второй", "2"}, {"три", "3"}, {"третья", "3"}, {"третий", "3"}, {"четыре", "4"}, {"пять", "5"}};
        String[] t = s.split(" "); StringBuilder b = new StringBuilder();
        for (String x : t) { for (String[] q : w) if (q[0].equals(x)) { x = q[1]; break; } if (b.length() > 0) b.append(' '); b.append(x); }
        return b.toString();
    }

    /** «открой калитку 1» → запись или null. Нужен глагол «откр…», иначе обычная голосовая команда. */
    static E match(Context c, String raw) {
        String n = " " + norm(raw) + " ";
        if (!(n.contains(" открой ") || n.contains(" открыть ") || n.contains(" откройте ") || n.contains(" открывай "))) return null;
        List<E> l = load(c); if (l.isEmpty()) return null;
        Collections.sort(l, new Comparator<E>() { public int compare(E a, E b) { return norm(b.name).length() - norm(a.name).length(); } });
        for (E e : l) { String nn = norm(e.name); if (nn.length() > 0 && n.contains(" " + nn + " ")) return e; }
        for (E e : l) {   // «калитку» ≈ «калитка»: сравнение по основе слова
            String[] nt = norm(e.name).split(" "); boolean ok = nt.length > 0 && nt[0].length() > 0;
            for (String tk : nt) { String stem = tk.length() > 4 ? tk.substring(0, tk.length() - 1) : tk; if (!n.contains(" " + stem)) { ok = false; break; } }
            if (ok) return e;
        }
        if (l.size() == 1 && n.contains(" домофон ")) return l.get(0);
        return null;
    }

    static String keyOf(View v) {
        try { if (v.getId() != View.NO_ID) return v.getContext().getResources().getResourceEntryName(v.getId()); } catch (Throwable t) { }
        return "";
    }

    static void walk(View v, List<View> out) {
        if (v.hasOnClickListeners() && v.isEnabled()) out.add(v);
        if (v instanceof ViewGroup) { ViewGroup g = (ViewGroup) v; for (int i = 0; i < g.getChildCount(); i++) walk(g.getChildAt(i), out); }
    }

    /** кнопка не выбрана вручную: ищем по имени (open/unlock/door/открыть) */
    static View guess(List<View> l) {
        String[] w = {"open", "unlock", "door", "gate", "lock", "откр"};
        for (String k : w) for (View v : l) if (keyOf(v).toLowerCase().contains(k)) return v;
        return null;
    }

    static View pick(List<View> l, E e) {
        if (l.isEmpty()) return null;
        if (e.key.length() > 0) for (View v : l) if (e.key.equals(keyOf(v))) return v;
        if (e.idx >= 0 && e.idx < l.size()) return l.get(e.idx);
        if (l.size() == 1) return l.get(0);
        return guess(l);
    }

    /** попросить провайдера прислать свежий вид (после перезапуска кэш виджета у нас может быть пуст) */
    static void refresh(Context c, AppWidgetProviderInfo pi, int wid) {
        try { c.sendBroadcast(new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).setComponent(pi.provider).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, new int[]{wid})); } catch (Throwable t) { }
    }

    /** «нажать» виджет без экрана: подключаемся хостом, ждём пока придёт вид, жмём выбранную кнопку. Вызывать на главном потоке. */
    static void press(final Context c, final E e, final Cb cb) {
        final Context a = c.getApplicationContext();
        final AppWidgetManager m = AppWidgetManager.getInstance(a);
        final AppWidgetProviderInfo pi = m.getAppWidgetInfo(e.wid);
        if (pi == null) { cb.end(false, "Виджет «" + e.name + "» не привязан. Откройте тест домофона в настройках."); return; }
        final AppWidgetHostView hv = view(a, e.wid, pi);
        refresh(a, pi, e.wid);
        final Handler h = new Handler(Looper.getMainLooper()); final long t0 = SystemClock.uptimeMillis();
        final Runnable stop = new Runnable() { public void run() { } };
        h.post(new Runnable() { int tries = 0; public void run() {
            List<View> l = new ArrayList<View>(); walk(hv, l); View t = pick(l, e);
            if (t != null) { boolean ok = t.performClick(); h.postDelayed(stop, 1200); cb.end(ok, ok ? "Открываю " + e.name : "Кнопка «" + e.name + "» не нажалась"); return; }
            if (!l.isEmpty() && SystemClock.uptimeMillis() - t0 > 2500) { h.post(stop); cb.end(false, "Не выбрана кнопка открытия для «" + e.name + "». Отметьте её в настройках домофона."); return; }
            if (SystemClock.uptimeMillis() - t0 > 8000) { h.post(stop); cb.end(false, "Не удалось нажать «" + e.name + "»: виджет не прислал кнопок"); return; }
            if (tries == 4) nudge(a, pi, e.wid, hv, 0); if (tries == 12) nudge(a, pi, e.wid, hv, 1); if (tries == 22) nudge(a, pi, e.wid, hv, 0);
            tries++;
            h.postDelayed(this, 250);
        } });
    }
}
