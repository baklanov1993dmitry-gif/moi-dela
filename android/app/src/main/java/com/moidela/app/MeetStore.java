package com.moidela.app;

import android.content.ContentValues;
import android.content.Context;
import android.graphics.Paint;
import android.graphics.pdf.PdfDocument;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Импорт аудио (m4a/mp3/amr/ogg…) → WAV 16 кГц моно; экспорт аудио+текст+PDF в «Документы/Совещания». */
public class MeetStore {
    static final String REL = "Documents/Совещания";

    /** Перекодирует выбранный файл в WAV 16 кГц моно. Возвращает длительность в секундах. */
    static long decodeToWav(Context c, Uri src, File out) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        ex.setDataSource(c, src, null);
        int tr = -1; MediaFormat fmt = null;
        for (int i = 0; i < ex.getTrackCount(); i++) { MediaFormat f = ex.getTrackFormat(i); String m = f.getString(MediaFormat.KEY_MIME); if (m != null && m.startsWith("audio/")) { tr = i; fmt = f; break; } }
        if (tr < 0) throw new Exception("в файле нет звука");
        ex.selectTrack(tr);
        MediaCodec dec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
        dec.configure(fmt, null, null, 0); dec.start();
        long totalUs = fmt.containsKey(MediaFormat.KEY_DURATION) ? fmt.getLong(MediaFormat.KEY_DURATION) : 0;
        int ch = fmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT) ? fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 1;
        int sr = fmt.containsKey(MediaFormat.KEY_SAMPLE_RATE) ? fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE) : 16000;
        boolean flt = false;
        RandomAccessFile raf = new RandomAccessFile(out, "rw"); raf.setLength(0); raf.write(new byte[44]);
        MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();
        boolean inDone = false, outDone = false;
        double pos = 0, step = 0; long idx = 0; double prev = 0; long written = 0;
        byte[] ob = new byte[1 << 16]; int on = 0;
        step = sr / 16000.0;
        try {
            while (!outDone) {
                if (!inDone) {
                    int ii = dec.dequeueInputBuffer(10000);
                    if (ii >= 0) {
                        ByteBuffer ib = dec.getInputBuffer(ii); int n = ex.readSampleData(ib, 0);
                        if (n < 0) { dec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inDone = true; }
                        else { dec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0); ex.advance(); }
                    }
                }
                int oi = dec.dequeueOutputBuffer(bi, 10000);
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = dec.getOutputFormat();
                    if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) { sr = of.getInteger(MediaFormat.KEY_SAMPLE_RATE); step = sr / 16000.0; }
                    flt = of.containsKey("pcm-encoding") && of.getInteger("pcm-encoding") == 4;
                } else if (oi >= 0) {
                    ByteBuffer b = dec.getOutputBuffer(oi); b.position(bi.offset); b.limit(bi.offset + bi.size); b.order(ByteOrder.LITTLE_ENDIAN);
                    int bps = flt ? 4 : 2, frames = bi.size / (bps * Math.max(1, ch));
                    for (int f = 0; f < frames; f++) {
                        double s = 0;
                        for (int k = 0; k < ch; k++) s += flt ? b.getFloat() * 32768.0 : b.getShort();
                        s /= Math.max(1, ch);
                        while (pos <= idx) {
                            double fr = pos - (idx - 1); double v = prev + (s - prev) * fr;
                            if (v > 32767) v = 32767; if (v < -32768) v = -32768;
                            int q = (int) v; ob[on++] = (byte) (q & 0xff); ob[on++] = (byte) ((q >> 8) & 0xff); written += 2;
                            if (on >= ob.length) { raf.write(ob, 0, on); on = 0; }
                            pos += step;
                        }
                        prev = s; idx++;
                    }
                    if (totalUs > 0) MeetService.prog = (int) Math.min(99, bi.presentationTimeUs * 100 / totalUs);
                    dec.releaseOutputBuffer(oi, false);
                    if ((bi.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outDone = true;
                }
                if (MeetService.stop) throw new Exception("прервано");
            }
            if (on > 0) raf.write(ob, 0, on);
            MeetService.header(raf, written);
        } finally {
            try { raf.close(); } catch (Throwable e) { } try { dec.stop(); dec.release(); } catch (Throwable e) { } try { ex.release(); } catch (Throwable e) { }
        }
        return written / 32000;
    }

    /** Сохраняет аудио (WAV), текст и PDF в Документы/Совещания. Возвращает uri PDF (для «Поделиться») или null. */
    static Uri export(Context c, File wav, File txt) throws Exception {
        String base = wav.getName().replace(".wav", "");
        File mark = new File(wav.getPath().replace(".wav", ".exp"));
        Uri pdfUri = null;
        if (Build.VERSION.SDK_INT >= 29) {
            put(c, base + ".wav", "audio/wav", wav, null);
            if (txt != null && txt.exists()) {
                put(c, base + ".txt", "text/plain", txt, null);
                pdfUri = put(c, base + ".pdf", "application/pdf", null, pdf(c, wav.getName(), read(txt)));
            }
            mark.createNewFile();
            if (pdfUri != null) { FileOutputStream o = new FileOutputStream(new File(wav.getPath().replace(".wav", ".pdfuri"))); o.write(pdfUri.toString().getBytes("UTF-8")); o.close(); }
        } else throw new Exception("нужен Android 10+");
        return pdfUri;
    }

    private static Uri put(Context c, String name, String mime, File file, byte[] data) throws Exception {
        Uri u = null;
        String[] mimes = {mime, "application/octet-stream"};
        Exception last = null;
        for (String m : mimes) {
            try {
                ContentValues cv = new ContentValues(); cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name); cv.put(MediaStore.MediaColumns.MIME_TYPE, m); cv.put(MediaStore.MediaColumns.RELATIVE_PATH, REL);
                u = c.getContentResolver().insert(MediaStore.Files.getContentUri("external"), cv);
                if (u == null) throw new Exception("не создан файл " + name);
                OutputStream o = c.getContentResolver().openOutputStream(u);
                if (file != null) { InputStream in = new FileInputStream(file); byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n); in.close(); } else o.write(data);
                o.close(); return u;
            } catch (Exception e) { last = e; }
        }
        throw last;
    }

    static String read(File f) throws Exception { FileInputStream in = new FileInputStream(f); java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); byte[] x = new byte[8192]; int n; while ((n = in.read(x)) > 0) b.write(x, 0, n); in.close(); return b.toString("UTF-8"); }

    /** PDF A4: заголовок + текст с переносами и страницами. */
    static byte[] pdf(Context c, String title, String text) throws Exception {
        PdfDocument d = new PdfDocument();
        int W = 595, H = 842, M = 48, cw = W - 2 * M, ph = H - 2 * M;
        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG); tp.setTextSize(11);
        TextPaint hp = new TextPaint(Paint.ANTI_ALIAS_FLAG); hp.setTextSize(15); hp.setFakeBoldText(true);
        String name = title.replace("meet-imp-", "Импорт ").replace("meet-", "Совещание ").replace(".wav", "");
        String full = text.trim();
        StaticLayout hl = new StaticLayout(name, hp, cw, Layout.Alignment.ALIGN_NORMAL, 1f, 0f, false);
        StaticLayout bl = new StaticLayout(full, tp, cw, Layout.Alignment.ALIGN_NORMAL, 1.15f, 2f, false);
        int hh = hl.getHeight() + 14, y = 0, page = 1;
        while (y < bl.getHeight() || page == 1) {
            PdfDocument.Page p = d.startPage(new PdfDocument.PageInfo.Builder(W, H, page).create());
            android.graphics.Canvas cv = p.getCanvas();
            int avail = ph - (page == 1 ? hh : 0);
            int top = bl.getLineForVertical(y), bot = bl.getLineForVertical(y + avail);
            if (bl.getLineBottom(bot) > y + avail && bot > top) bot--;
            int yEnd = bl.getLineBottom(bot);
            cv.save(); cv.translate(M, M);
            if (page == 1) { hl.draw(cv); cv.translate(0, hh); }
            cv.clipRect(0, 0, cw, yEnd - y); cv.translate(0, -y); bl.draw(cv); cv.restore();
            d.finishPage(p); y = yEnd; page++;
            if (y >= bl.getHeight()) break;
        }
        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); d.writeTo(bo); d.close(); return bo.toByteArray();
    }
}
