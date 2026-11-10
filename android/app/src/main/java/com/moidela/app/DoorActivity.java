package com.moidela.app;

import android.app.Activity;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

/** «Домофон»: несколько виджетов с именами для голоса («калитка 1», «подъезд»). Каждый привязывается к нашему хосту, выбирается кнопка открытия. */
public class DoorActivity extends Activity {
    static final int REQ_BIND = 71, REQ_CFG = 72;
    private AppWidgetHost host; private AppWidgetManager mgr;
    private LinearLayout cards, list, addBox; private EditText flt, nameIn;
    private final Handler h = new Handler(Looper.getMainLooper());
    private List<DoorStore.E> doors; private int pendWid = -1; private String pendName = "", pendProv = "";
    private boolean listening = false; private int gen = 0;

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + .5f); }
    private TextView tv(String s, int sp, String col, boolean bold) { TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(Color.parseColor(col)); t.setTypeface(null, bold ? Typeface.BOLD : Typeface.NORMAL); t.setPadding(0, dp(4), 0, dp(4)); return t; }
    private Button bt(String s, View.OnClickListener l) { Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setOnClickListener(l); return b; }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        mgr = AppWidgetManager.getInstance(this); host = new AppWidgetHost(this, DoorStore.HOST_ID);
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(Color.parseColor("#14121f"));
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(18), dp(22), dp(18), dp(40)); sv.addView(box); setContentView(sv);
        box.addView(tv("Домофон: виджеты для голоса", 22, "#ffffff", true));
        box.addView(tv("Привяжите виджеты домофона (каждый на свою калитку/подъезд), дайте имена и отметьте кнопку открытия. Потом голосом: «открой калитку 1».", 13, "#9a93b8", false));
        cards = new LinearLayout(this); cards.setOrientation(LinearLayout.VERTICAL); box.addView(cards);
        box.addView(bt("＋ Добавить виджет", new View.OnClickListener() { public void onClick(View v) { addBox.setVisibility(addBox.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE); if (addBox.getVisibility() == View.VISIBLE) fill(); } }));
        addBox = new LinearLayout(this); addBox.setOrientation(LinearLayout.VERTICAL); addBox.setVisibility(View.GONE); box.addView(addBox);
        addBox.addView(tv("1) введите имя, как будете говорить; 2) выберите виджет ниже", 13, "#a99bff", false));
        nameIn = new EditText(this); nameIn.setHint("Имя: калитка 1"); nameIn.setTextColor(Color.WHITE); nameIn.setHintTextColor(Color.GRAY); addBox.addView(nameIn);
        flt = new EditText(this); flt.setHint("фильтр по названию (например: дом)"); flt.setTextColor(Color.WHITE); flt.setHintTextColor(Color.GRAY); addBox.addView(flt);
        flt.addTextChangedListener(new TextWatcher() { public void beforeTextChanged(CharSequence s, int a, int c, int d) { } public void onTextChanged(CharSequence s, int a, int c, int d) { } public void afterTextChanged(Editable e) { fill(); } });
        list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL); addBox.addView(list);
        doors = DoorStore.load(this);
        build();
    }
    @Override protected void onStart() { super.onStart(); try { host.startListening(); listening = true; } catch (Throwable e) { } for (DoorStore.E e : doors) { AppWidgetProviderInfo pi = mgr.getAppWidgetInfo(e.wid); if (pi != null) DoorStore.refresh(this, pi, e.wid); } }
    @Override protected void onStop() { super.onStop(); gen++; try { host.stopListening(); } catch (Throwable e) { } listening = false; }

    // ---------- сохранённые виджеты ----------
    private void build() {
        gen++; cards.removeAllViews();
        if (doors.isEmpty()) cards.addView(tv("Пока нет виджетов. Нажмите «＋ Добавить виджет».", 14, "#9a93b8", false));
        for (final DoorStore.E e : doors) {
            final AppWidgetProviderInfo pi = mgr.getAppWidgetInfo(e.wid);
            LinearLayout c = new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL); c.setPadding(dp(12), dp(10), dp(12), dp(10)); c.setBackgroundColor(Color.parseColor("#201c33"));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); lp.setMargins(0, dp(10), 0, 0); c.setLayoutParams(lp);
            EditText nm = new EditText(this); nm.setText(e.name); nm.setTextColor(Color.WHITE); nm.setTextSize(18); nm.setHint("имя для голоса");
            nm.addTextChangedListener(new TextWatcher() { public void beforeTextChanged(CharSequence s, int a, int b, int d) { } public void onTextChanged(CharSequence s, int a, int b, int d) { } public void afterTextChanged(Editable x) { e.name = x.toString().trim(); DoorStore.save(DoorActivity.this, doors); } });
            c.addView(nm);
            if (pi == null) { c.addView(tv("Виджет не привязан (удалён системой). Забудьте и добавьте заново.", 12, "#ff8a80", false)); }
            else {
                c.addView(tv(pi.provider.flattenToShortString(), 11, "#7d7699", false));
                final AppWidgetHostView hv = host.createView(getApplicationContext(), e.wid, pi);
                c.addView(hv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(Math.max(90, pi.minHeight > 0 ? (int) (pi.minHeight / getResources().getDisplayMetrics().density) : 100))));
                final LinearLayout btns = new LinearLayout(this); btns.setOrientation(LinearLayout.VERTICAL); c.addView(btns);
                poll(e, hv, btns, gen, 0);
            }
            c.addView(bt("Забыть этот виджет", new View.OnClickListener() { public void onClick(View v) { try { host.deleteAppWidgetId(e.wid); } catch (Throwable x) { } doors.remove(e); DoorStore.save(DoorActivity.this, doors); build(); } }));
            cards.addView(c);
        }
    }

    /** вид приходит от провайдера не сразу (и после перезапуска тоже) — опрашиваем, пока не появятся кнопки */
    private void poll(final DoorStore.E e, final AppWidgetHostView hv, final LinearLayout btns, final int g, final int n) {
        if (g != gen) return;
        final List<View> found = new ArrayList<View>(); DoorStore.walk(hv, found);
        if (found.size() > 0 || n >= 20) { showBtns(e, found, btns); if (found.size() > 0 || n >= 20) return; }
        h.postDelayed(new Runnable() { public void run() { poll(e, hv, btns, g, n + 1); } }, 500);
    }

    private void showBtns(final DoorStore.E e, final List<View> found, final LinearLayout btns) {
        btns.removeAllViews();
        if (e.key.length() == 0 && e.idx < 0 && !found.isEmpty()) {   // кнопка ещё не выбрана: одна — берём её, несколько — ищем «open…»
            View g = found.size() == 1 ? found.get(0) : DoorStore.guess(found);
            if (g != null) { e.key = DoorStore.keyOf(g); e.idx = found.indexOf(g); DoorStore.save(this, doors); }
        }
        btns.addView(tv(found.isEmpty() ? "Кнопок не найдено: виджет не прислал содержимое. Нажмите «Обновить»." : "Кликабельных элементов: " + found.size() + ". Отметьте кнопку открытия (✔) — голос будет жать её.", 12, "#ffffff", false));
        for (int i = 0; i < found.size(); i++) {
            final View v = found.get(i); final int ix = i; final String key = DoorStore.keyOf(v);
            String tx = v instanceof TextView ? " «" + ((TextView) v).getText() + "»" : (v.getContentDescription() != null ? " [" + v.getContentDescription() + "]" : "");
            boolean sel = key.length() > 0 ? key.equals(e.key) : ix == e.idx;
            LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL);
            Button t = bt("▶ " + (key.length() > 0 ? key : "#" + ix) + tx, new View.OnClickListener() { public void onClick(View x) { boolean r = v.performClick(); Toast.makeText(DoorActivity.this, r ? "Нажато" : "Нет обработчика", Toast.LENGTH_SHORT).show(); } });
            row.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            Button s = bt(sel ? "✔" : "выбрать", new View.OnClickListener() { public void onClick(View x) { e.key = key; e.idx = ix; DoorStore.save(DoorActivity.this, doors); showBtns(e, found, btns); } });
            row.addView(s);
            btns.addView(row);
        }
    }

    // ---------- добавление ----------
    private void fill() {
        list.removeAllViews(); String q = flt.getText().toString().trim().toLowerCase();
        List<AppWidgetProviderInfo> all = new ArrayList<AppWidgetProviderInfo>(); final java.util.Map<AppWidgetProviderInfo, String> lab = new java.util.HashMap<AppWidgetProviderInfo, String>();
        for (AppWidgetProviderInfo pi : mgr.getInstalledProviders()) {
            if (pi.provider.getPackageName().equals(getPackageName())) continue;
            String l; try { l = pi.loadLabel(getPackageManager()); } catch (Throwable e) { l = pi.provider.getClassName(); }
            lab.put(pi, l + " · " + pi.provider.getPackageName());
            all.add(pi);
        }
        final String[] hot = {"дом", "dom", "home", "door", "intercom", "домофон", "ситилинк", "ufanet", "ростелеком", "дом.ру", "мой"};
        java.util.Collections.sort(all, new java.util.Comparator<AppWidgetProviderInfo>() { public int compare(AppWidgetProviderInfo a, AppWidgetProviderInfo b) {
            int x = score(lab.get(a), hot), y = score(lab.get(b), hot); if (x != y) return y - x; return lab.get(a).compareToIgnoreCase(lab.get(b)); } });
        int n = 0;
        for (final AppWidgetProviderInfo pi : all) {
            String ln = lab.get(pi);
            if (q.length() > 0 && !ln.toLowerCase().contains(q)) continue;
            n++; list.addView(bt(ln, new View.OnClickListener() { public void onClick(View v) { choose(pi); } }));
        }
        list.addView(tv("Показано " + n + " из " + all.size() + " виджетов в системе" + (n == 0 ? ". Если нужного нет — Android его не отдаёт: проверьте, что виджет есть в выборе виджетов на рабочем столе." : "."), 12, "#9a93b8", false), 0);
    }
    private int score(String s, String[] hot) { s = s.toLowerCase(); int k = 0; for (String h : hot) if (s.contains(h)) k++; return k; }

    private void choose(AppWidgetProviderInfo pi) {
        String nm = nameIn.getText().toString().trim();
        if (nm.length() == 0) { Toast.makeText(this, "Сначала введите имя (например: калитка 1)", Toast.LENGTH_LONG).show(); return; }
        pendName = nm; pendProv = pi.provider.flattenToShortString(); pendWid = host.allocateAppWidgetId();
        boolean ok = false; try { ok = mgr.bindAppWidgetIdIfAllowed(pendWid, pi.provider); } catch (Throwable e) { }
        if (ok) afterBind();
        else { Intent i = new Intent(AppWidgetManager.ACTION_APPWIDGET_BIND).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, pendWid).putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, pi.provider); try { startActivityForResult(i, REQ_BIND); } catch (Throwable e) { Toast.makeText(this, "Не удалось запросить привязку: " + e, Toast.LENGTH_LONG).show(); } }
    }
    private void afterBind() {
        AppWidgetProviderInfo pi = mgr.getAppWidgetInfo(pendWid);
        if (pi != null && pi.configure != null) { try { host.startAppWidgetConfigureActivityForResult(this, pendWid, 0, REQ_CFG, null); return; } catch (Throwable e) { Toast.makeText(this, "Настройка виджета не открылась: " + e, Toast.LENGTH_LONG).show(); } }
        finishAdd();
    }
    @Override protected void onActivityResult(int rq, int rs, Intent d) {
        super.onActivityResult(rq, rs, d);
        if (rq == REQ_BIND) { if (rs == RESULT_OK) afterBind(); else cancelAdd("Привязка отклонена"); }
        else if (rq == REQ_CFG) { if (rs == RESULT_OK) finishAdd(); else cancelAdd("Настройка виджета отменена"); }
    }
    private void cancelAdd(String m) { try { if (pendWid >= 0) host.deleteAppWidgetId(pendWid); } catch (Throwable e) { } pendWid = -1; Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); }
    private void finishAdd() {
        DoorStore.E e = new DoorStore.E(); e.wid = pendWid; e.name = pendName; e.provider = pendProv; doors.add(e); DoorStore.save(this, doors); pendWid = -1;
        nameIn.setText(""); addBox.setVisibility(View.GONE); build();
    }
}
