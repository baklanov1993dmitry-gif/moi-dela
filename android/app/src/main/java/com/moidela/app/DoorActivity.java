package com.moidela.app;

import android.app.Activity;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.content.SharedPreferences;
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

/** Тест «Домофон»: привязываем виджет стороннего приложения («Мой дом») к нашему хосту и пробуем «нажать» его кнопку программно. */
public class DoorActivity extends Activity {
    static final int HOST_ID = 7797, REQ_BIND = 71, REQ_CFG = 72;
    private AppWidgetHost host; private AppWidgetManager mgr;
    private LinearLayout list, view; private TextView info; private EditText flt;
    private final Handler h = new Handler(Looper.getMainLooper());
    private int wid = -1; private AppWidgetProviderInfo pend;

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + .5f); }
    private TextView tv(String s, int sp, String col, boolean bold) { TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(Color.parseColor(col)); t.setTypeface(null, bold ? Typeface.BOLD : Typeface.NORMAL); t.setPadding(0, dp(4), 0, dp(4)); return t; }
    private Button bt(String s, View.OnClickListener l) { Button b = new Button(this); b.setText(s); b.setOnClickListener(l); return b; }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        mgr = AppWidgetManager.getInstance(this); host = new AppWidgetHost(this, HOST_ID);
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(Color.parseColor("#14121f"));
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(18), dp(22), dp(18), dp(40)); sv.addView(box); setContentView(sv);
        box.addView(tv("Домофон: тест виджета", 22, "#ffffff", true));
        box.addView(tv("1) выберите виджет домофона из «Мой дом» ниже; 2) разрешите привязку; 3) ниже появятся его кнопки — нажмите «▶ нажать» у нужной. Если дверь открылась — голосовая команда будет работать без экрана.", 13, "#9a93b8", false));
        info = tv("", 13, "#a99bff", false); box.addView(info);
        view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); box.addView(view);
        flt = new EditText(this); flt.setHint("фильтр по названию (например: дом)"); flt.setTextColor(Color.WHITE); flt.setHintTextColor(Color.GRAY); box.addView(flt);
        flt.addTextChangedListener(new TextWatcher() { public void beforeTextChanged(CharSequence s, int a, int c, int d) { } public void onTextChanged(CharSequence s, int a, int c, int d) { } public void afterTextChanged(Editable e) { fill(); } });
        list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL); box.addView(list);
        fill();
        SharedPreferences p = getSharedPreferences("door", MODE_PRIVATE); int w = p.getInt("wid", -1);
        if (w >= 0) { AppWidgetProviderInfo pi = mgr.getAppWidgetInfo(w); if (pi != null) { wid = w; show(); } }
    }
    @Override protected void onStart() { super.onStart(); try { host.startListening(); } catch (Throwable e) { } }
    @Override protected void onStop() { super.onStop(); try { host.stopListening(); } catch (Throwable e) { } }

    private void fill() {
        list.removeAllViews(); String q = flt.getText().toString().trim().toLowerCase(); int n = 0;
        List<AppWidgetProviderInfo> all = mgr.getInstalledProviders();
        for (final AppWidgetProviderInfo pi : all) {
            if (pi.provider.getPackageName().equals(getPackageName())) continue;
            String lab; try { lab = pi.loadLabel(getPackageManager()); } catch (Throwable e) { lab = pi.provider.getClassName(); }
            String pk = pi.provider.getPackageName(); String ln = lab + " · " + pk;
            if (q.length() > 0 && !ln.toLowerCase().contains(q)) continue;
            if (++n > 40) { list.addView(tv("… уточните фильтр", 12, "#9a93b8", false)); break; }
            list.addView(bt(ln, new View.OnClickListener() { public void onClick(View v) { choose(pi); } }));
        }
        if (n == 0) list.addView(tv("Виджетов не найдено", 13, "#9a93b8", false));
    }

    private void choose(AppWidgetProviderInfo pi) {
        try { if (wid >= 0) host.deleteAppWidgetId(wid); } catch (Throwable e) { }
        wid = host.allocateAppWidgetId(); pend = pi;
        boolean ok = false; try { ok = mgr.bindAppWidgetIdIfAllowed(wid, pi.provider); } catch (Throwable e) { }
        if (ok) afterBind();
        else { Intent i = new Intent(AppWidgetManager.ACTION_APPWIDGET_BIND).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid).putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, pi.provider); try { startActivityForResult(i, REQ_BIND); } catch (Throwable e) { info.setText("Не удалось запросить привязку: " + e); } }
    }
    private void afterBind() {
        AppWidgetProviderInfo pi = mgr.getAppWidgetInfo(wid);
        if (pi != null && pi.configure != null) { try { host.startAppWidgetConfigureActivityForResult(this, wid, 0, REQ_CFG, null); return; } catch (Throwable e) { info.setText("Настройка виджета не открылась: " + e); } }
        saveShow();
    }
    @Override protected void onActivityResult(int rq, int rs, Intent d) {
        super.onActivityResult(rq, rs, d);
        if (rq == REQ_BIND) { if (rs == RESULT_OK) afterBind(); else info.setText("Привязка отклонена"); }
        else if (rq == REQ_CFG) { if (rs == RESULT_OK) saveShow(); else info.setText("Настройка виджета отменена"); }
    }
    private void saveShow() { getSharedPreferences("door", MODE_PRIVATE).edit().putInt("wid", wid).apply(); show(); }

    private void show() {
        view.removeAllViews();
        final AppWidgetProviderInfo pi = mgr.getAppWidgetInfo(wid);
        if (pi == null) { info.setText("Виджет не привязан"); return; }
        info.setText("Привязан: " + pi.provider.flattenToShortString() + " (id " + wid + ")");
        final AppWidgetHostView hv = host.createView(getApplicationContext(), wid, pi);
        hv.setAppWidget(wid, pi);
        view.addView(hv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(Math.max(100, pi.minHeight > 0 ? (int) (pi.minHeight / getResources().getDisplayMetrics().density) : 110))));
        final LinearLayout btns = new LinearLayout(this); btns.setOrientation(LinearLayout.VERTICAL); view.addView(btns);
        view.addView(bt("Обновить список кнопок", new View.OnClickListener() { public void onClick(View v) { scan(hv, btns); } }));
        view.addView(bt("Забыть этот виджет", new View.OnClickListener() { public void onClick(View v) { try { host.deleteAppWidgetId(wid); } catch (Throwable e) { } wid = -1; getSharedPreferences("door", MODE_PRIVATE).edit().remove("wid").apply(); show(); info.setText("Привязка удалена"); } }));
        h.postDelayed(new Runnable() { public void run() { scan(hv, btns); } }, 1500);
    }

    private void scan(AppWidgetHostView hv, LinearLayout btns) {
        btns.removeAllViews(); final ArrayList<View> found = new ArrayList<>(); walk(hv, found);
        btns.addView(tv("Кликабельных элементов: " + found.size(), 14, "#ffffff", true));
        for (final View v : found) {
            String nm = "?"; try { if (v.getId() != View.NO_ID) nm = v.getContext().getResources().getResourceEntryName(v.getId()); } catch (Throwable e) { nm = "#" + v.getId(); }
            String tx = v instanceof TextView ? " «" + ((TextView) v).getText() + "»" : (v.getContentDescription() != null ? " [" + v.getContentDescription() + "]" : "");
            btns.addView(bt("▶ нажать: " + nm + " (" + v.getClass().getSimpleName() + ")" + tx, new View.OnClickListener() { public void onClick(View x) { boolean r = v.performClick(); Toast.makeText(DoorActivity.this, r ? "Нажато" : "Не нажалось (нет обработчика)", Toast.LENGTH_SHORT).show(); } }));
        }
        if (found.size() == 0) btns.addView(tv("Пока пусто: виджет ещё не прислал содержимое. Подождите пару секунд и нажмите «Обновить».", 12, "#9a93b8", false));
    }
    private void walk(View v, List<View> out) {
        if (v.hasOnClickListeners() && v.isEnabled()) out.add(v);
        if (v instanceof ViewGroup) { ViewGroup g = (ViewGroup) v; for (int i = 0; i < g.getChildCount(); i++) walk(g.getChildAt(i), out); }
    }
}
