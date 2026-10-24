package com.moidela.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;

/** Сигналы начала записи и подтверждения: синтез на лету, набор мелодий на выбор. Нота: {частота от, частота до, мс, громкость}. */
final class Cues {
    static final String[] NAMES = {"Классика", "Капля", "Колокольчик", "Космос", "Тик-так", "Без звука"};
    private static final double[][][] START = {
        {{880, 880, 160, .6}},
        {{1568, 1568, 90, .6}, {2093, 2093, 200, .6}},
        {{1047, 1047, 500, .7}},
        {{400, 1400, 320, .6}},
        {{2000, 2000, 35, .6}, {1500, 1500, 60, .6}},
        {}};
    private static final double[][][] OK = {
        {{880, 880, 120, .6}, {1320, 1320, 260, .6}},
        {{1319, 1319, 120, .6}, {1568, 1568, 120, .6}, {2093, 2093, 420, .6}},
        {{1047, 1047, 200, .7}, {1319, 1319, 200, .7}, {1568, 1568, 200, .7}, {2093, 2093, 700, .7}},
        {{500, 1800, 300, .6}, {1568, 1568, 120, .5}, {2349, 2349, 500, .6}},
        {{1500, 1500, 55, .6}, {2000, 2000, 55, .6}, {2500, 2500, 160, .6}},
        {}};

    /** Играет сигнал; возвращает длительность в мс (0 — тишина). key: cue_start / cue_ok. */
    static int play(Context c, String key, boolean voiceCall) {
        int idx = Math.max(0, Math.min(NAMES.length - 1, Store.p(c).getInt(key, 0)));
        return playIdx(key.equals("cue_ok") ? OK[idx] : START[idx], voiceCall);
    }

    static int preview(Context c, boolean ok, int idx) { return playIdx(ok ? OK[idx] : START[idx], false); }

    private static int playIdx(double[][] notes, boolean voiceCall) {
        if (notes.length == 0) return 0;
        final int sr = 22050; int total = 0; for (double[] n : notes) total += (int) (sr * n[2] / 1000);
        final short[] pcm = new short[total]; int pos = 0;
        for (double[] n : notes) {
            int len = (int) (sr * n[2] / 1000); double ph = 0;
            for (int i = 0; i < len; i++) {
                double t = i / (double) len, f = n[0] + (n[1] - n[0]) * t;
                ph += 2 * Math.PI * f / sr;
                double env = Math.min(1, i / (sr * 0.008)) * Math.exp(-3.2 * t);   // быстрая атака и затухание
                double v = (Math.sin(ph) + 0.28 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph)) * env * n[3];
                pcm[pos + i] = (short) (Math.max(-1, Math.min(1, v)) * 30000);
            }
            pos += len;
        }
        try {
            AudioAttributes at = new AudioAttributes.Builder().setUsage(voiceCall ? AudioAttributes.USAGE_VOICE_COMMUNICATION : AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
            AudioFormat af = new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build();
            final AudioTrack tr = new AudioTrack(at, af, pcm.length * 2, AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE);
            tr.write(pcm, 0, pcm.length); tr.play();
            final int ms = (int) (pcm.length * 1000L / sr);
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() { public void run() { try { tr.release(); } catch (Exception e) { } } }, ms + 300);
            return ms;
        } catch (Exception e) { return 0; }
    }
}
