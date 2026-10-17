package com.moidela.app;

import android.content.Context;
import android.content.SharedPreferences;

final class Store {
    static SharedPreferences p(Context c) { return c.getApplicationContext().getSharedPreferences("md", 0); }
    static String key(Context c) { return p(c).getString("key", ""); }
    static boolean linked(Context c) { return key(c).length() >= 32; }
    static String api(Context c, String a, String extra) {
        return p(c).getString("base", "") + "/functions/v1/device?a=" + a + "&k=" + key(c) + (extra == null ? "" : extra);
    }
}
