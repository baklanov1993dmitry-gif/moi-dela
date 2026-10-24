package com.moidela.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

/** Громкость и мелодия напоминания-будильника. */
public class AlarmSettingsActivity extends Activity {
    private TextView melody, volTx;
    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }
    private TextView tv(String s, int sz, String col) { TextView t = new TextView(this); t.setText(s); t.setTextSize(sz); t.setTextColor(Color.parseColor(col)); return t; }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        setTitle("Будильник · настройки");
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(20), dp(24), dp(20), dp(24));
        root.setBackgroundColor(Color.parseColor("#0F0F14"));
        root.addView(tv("Громкость", 16, "#F2F2F7"));
        volTx = tv("", 14, "#8FA8FF"); root.addView(volTx);
        SeekBar sb = new SeekBar(this); sb.setMax(100); sb.setProgress(Store.p(this).getInt("al_vol", 80)); root.addView(sb);
        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar s, int v, boolean u) { Store.p(AlarmSettingsActivity.this).edit().putInt("al_vol", Math.max(5, v)).apply(); volTx.setText(Math.max(5, v) + "%"); }
            public void onStartTrackingTouch(SeekBar s) { }
            public void onStopTrackingTouch(SeekBar s) { }
        });
        volTx.setText(Store.p(this).getInt("al_vol", 80) + "%");
        TextView mh = tv("Мелодия", 16, "#F2F2F7"); mh.setPadding(0, dp(24), 0, 0); root.addView(mh);
        melody = tv("", 14, "#8FA8FF"); root.addView(melody); showMelody();
        Button pick = new Button(this); pick.setText("Выбрать мелодию"); pick.setAllCaps(false);
        pick.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            Intent i = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
            i.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM | RingtoneManager.TYPE_RINGTONE | RingtoneManager.TYPE_NOTIFICATION);
            i.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
            String u = Store.p(AlarmSettingsActivity.this).getString("al_uri", "");
            if (u.length() > 0) i.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(u));
            startActivityForResult(i, 7);
        } });
        root.addView(pick);
        Button test = new Button(this); test.setText("▶ Проверить звук"); test.setAllCaps(false);
        test.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { AlarmSound.start(AlarmSettingsActivity.this); } });
        root.addView(test);
        Button stop = new Button(this); stop.setText("■ Стоп"); stop.setAllCaps(false);
        stop.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { AlarmSound.stop(); } });
        root.addView(stop);
        TextView note = tv("Так звучит напоминание-будильник. Окно с текстом дела откроется поверх экрана; в Android-настройках для «Мои дела» разреши показ поверх блокировки и полноэкранные уведомления, если они выключены.", 13, "#8E8E99"); note.setPadding(0, dp(20), 0, 0); root.addView(note);
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(Color.parseColor("#0F0F14")); sv.addView(root); setContentView(sv);
    }

    private void showMelody() {
        String u = Store.p(this).getString("al_uri", "");
        String name = "по умолчанию (будильник)";
        if (u.length() > 0) try { android.media.Ringtone r = RingtoneManager.getRingtone(this, Uri.parse(u)); if (r != null) name = r.getTitle(this); } catch (Exception e) { }
        melody.setText(name);
    }

    @Override protected void onActivityResult(int rq, int rs, Intent d) {
        if (rq == 7 && rs == RESULT_OK && d != null) {
            Uri u = d.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            Store.p(this).edit().putString("al_uri", u == null ? "" : u.toString()).apply(); showMelody();
        }
    }

    @Override protected void onPause() { super.onPause(); AlarmSound.stop(); }
}
