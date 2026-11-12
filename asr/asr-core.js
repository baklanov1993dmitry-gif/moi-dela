/* Расшифровка речи в браузере: GigaAM v3 RNNT (пунктуация), резка по тихим местам на onnxruntime-web.
   Ядро без интерфейса: работает и в браузере (window.ASRCORE), и в Node (для тестов). */
(function (root) {
  "use strict";
  const SR = 16000, FL = 400, FS = 160, NB = 64;

  // ---------- БПФ любой длины, где N раскладывается на малые простые (400 = 2^4 * 5^2) ----------
  function makeFFT(N) {
    const cos = new Float64Array(N), sin = new Float64Array(N);
    for (let i = 0; i < N; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = -Math.sin(2 * Math.PI * i / N); }
    const fac = []; { let n = N; for (let p = 2; n > 1;) { if (n % p === 0) { fac.push(p); n /= p; } else p++; } }
    const bre = new Float64Array(N), bim = new Float64Array(N);
    function rec(xr, xi, off, str, n, k, or, oi, oo) {   // смешанное основание, прореживание по времени
      if (n === 1) { or[oo] = xr[off]; oi[oo] = xi[off]; return; }
      const p = fac[k], m = n / p;
      for (let r = 0; r < p; r++) rec(xr, xi, off + r * str, str * p, m, k + 1, or, oi, oo + r * m);
      const step = N / n;
      const tr = new Float64Array(p), ti = new Float64Array(p);
      for (let q = 0; q < m; q++) {
        for (let r = 0; r < p; r++) {
          const a = or[oo + r * m + q], b = oi[oo + r * m + q], w = ((r * q) * step) % N;
          tr[r] = a * cos[w] - b * sin[w]; ti[r] = a * sin[w] + b * cos[w];
        }
        for (let s = 0; s < p; s++) {
          let sr = 0, si = 0;
          for (let r = 0; r < p; r++) { const w = ((r * s * m) * step) % N; sr += tr[r] * cos[w] - ti[r] * sin[w]; si += tr[r] * sin[w] + ti[r] * cos[w]; }
          bre[s * m + q] = sr; bim[s * m + q] = si;
        }
        for (let s = 0; s < p; s++) { or[oo + s * m + q] = bre[s * m + q]; oi[oo + s * m + q] = bim[s * m + q]; }
      }
    }
    return function (xr, xi, or, oi) { rec(xr, xi, 0, 1, N, 0, or, oi, 0); };
  }

  // ---------- признаки: как kaldi-native-fbank в экспорте GigaAM (64 mel, окно Ханна 25 мс, без dither/preemph) ----------
  let FB = null;
  function fbInit() {
    if (FB) return FB;
    const win = new Float64Array(FL), a = 2 * Math.PI / FL;   /* периодическое окно Ханна: так считает kaldi-native-fbank */
    for (let i = 0; i < FL; i++) win[i] = 0.5 - 0.5 * Math.cos(a * i);
    const mel = f => 1127 * Math.log(1 + f / 700), nfft = FL / 2, binw = SR / FL;
    const lo = mel(0), hi = mel(SR / 2), d = (hi - lo) / (NB + 1), banks = [];
    for (let b = 0; b < NB; b++) {
      const l = lo + b * d, c = lo + (b + 1) * d, r = lo + (b + 2) * d, idx = [], wt = [];
      for (let k = 0; k < nfft; k++) { const m = mel(binw * k); if (m > l && m < r) { idx.push(k); wt.push(m <= c ? (m - l) / (c - l) : (r - m) / (r - c)); } }
      banks.push({ idx: Int32Array.from(idx), wt: Float64Array.from(wt) });
    }
    FB = { win, banks, fft: makeFFT(FL) };
    return FB;
  }
  // x: Float32Array (16 кГц) → { data: Float32Array [NB * T] (канал-основной, как ждёт модель), T }
  function fbank(x) {
    const F = fbInit(), nf = x.length < FL ? 0 : 1 + Math.floor((x.length - FL) / FS);
    const out = new Float32Array(NB * nf), xr = new Float64Array(FL), xi = new Float64Array(FL), or = new Float64Array(FL), oi = new Float64Array(FL);
    const EPS = 1.1920929e-7;
    for (let t = 0; t < nf; t++) {
      const o = t * FS;
      for (let i = 0; i < FL; i++) { xr[i] = x[o + i] * F.win[i]; xi[i] = 0; }
      F.fft(xr, xi, or, oi);
      for (let b = 0; b < NB; b++) {
        const bk = F.banks[b]; let e = 0;
        for (let j = 0; j < bk.idx.length; j++) { const k = bk.idx[j]; e += bk.wt[j] * (or[k] * or[k] + oi[k] * oi[k]); }
        out[b * nf + t] = Math.log(e > EPS ? e : EPS);
      }
    }
    return { data: out, T: nf };
  }

  // ---------- токены и CTC ----------
  function parseTokens(txt) {
    const id2 = []; for (const line of txt.split("\n")) { if (!line) continue; const f = line.split(" "); if (f.length === 1) { continue; } const idx = +f[f.length - 1]; id2[idx] = f.slice(0, -1).join(" "); }
    return id2;
  }
  function ctcText(lp, T, V, id2) {   // lp: Float32Array [T*V], blank = V-1
    let prev = -1, s = "";
    for (let t = 0; t < T; t++) {
      let bi = 0, bv = -1e30; for (let v = 0; v < V; v++) { const x = lp[t * V + v]; if (x > bv) { bv = x; bi = v; } }
      if (bi !== V - 1 && bi !== prev) s += id2[bi] != null ? id2[bi] : "";
      prev = bi;
    }
    return s.replace(/▁/g, " ").replace(/\s+/g, " ").trim();
  }

  // ---------- подготовка звука (как в приложении для телефона) ----------
  function highpass(x, st) {   // срез гула ~90 Гц; st = {x,y} переносится между кусками
    const a = 0.9658; let px = st.x, py = st.y;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = a * (py + v - px); px = v; py = y; x[i] = y; }
    st.x = px; st.y = py;
  }
  function levelUp(x) {   // подтягиваем тихий кусок по среднему уровню (RMS), не по пику
    let pk = 0, sq = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; sq += x[i] * x[i]; }
    if (pk <= 0.002) return;
    const rms = Math.sqrt(sq / Math.max(1, x.length));
    if (rms > 0.0005 && rms < 0.06) { let g = Math.min(20, 0.08 / rms); g = Math.min(g, 0.95 / pk); if (g > 1.05) for (let i = 0; i < x.length; i++) x[i] *= g; }
  }

  // ---------- словарь аббревиатур (тот же, что в приложении) ----------
  const DICT = [["н\\s?к\\s?у|эн\\s?ку", "НКУ"], ["в\\s?р\\s?у", "ВРУ"], ["а\\s?в\\s?р", "АВР"], ["у\\s?з\\s?о", "УЗО"], ["т\\s?к\\s?п", "ТКП"], ["т\\s?з", "ТЗ"], ["к\\s?з", "КЗ"],
    ["о\\s?т\\s?р", "ОТР"], ["р\\s?у\\s?н\\s?н", "РУНН"], ["гост", "ГОСТ"], ["ср\\s?н\\s?к\\s?у\\s?(?:1|один)", "СРНКУ1"], ["ш\\s?о\\s?т", "ШОТ"], ["с\\s?о\\s?п\\s?т", "СОПТ"]];
  const DP = DICT.map(d => new RegExp("(?<![\\p{L}\\p{N}])(?:" + d[0] + ")(?![\\p{L}\\p{N}])", "giu"));
  function fixTerms(s, extra) {
    for (let i = 0; i < DICT.length; i++) s = s.replace(DP[i], DICT[i][1]);
    if (extra) for (const [re, to] of extra) s = s.replace(re, to);
    return s;
  }

  // ---------- Silero VAD v4 (16 кГц, окно 512) + нарезка на фразы ----------
  async function vadSegments(ort, sess, pcm, opt, onProg) {
    const th = opt.th || 0.45, nth = th - 0.15, minSil = Math.round((opt.minSil || 0.6) * SR), minSp = Math.round((opt.minSp || 0.3) * SR),
      maxSp = Math.round((opt.maxSp || 20) * SR), pad = Math.round(0.2 * SR), W = 512;
    let h = new Float32Array(128), c = new Float32Array(128);
    const segs = []; let st = -1, lastSp = 0;
    const n = Math.floor(pcm.length / W);
    for (let i = 0; i < n; i++) {
      const x = pcm.subarray(i * W, i * W + W);
      const r = await sess.run({ x: new ort.Tensor("float32", x, [1, W]), h: new ort.Tensor("float32", h, [2, 1, 64]), c: new ort.Tensor("float32", c, [2, 1, 64]) });
      h = r.new_h.data.slice(); c = r.new_c.data.slice();   // копии: тензоры ORT переиспользуются
      const p = r.prob.data[0], pos = i * W;
      if (st < 0) { if (p >= th) { st = Math.max(0, pos - pad); lastSp = pos + W; } }
      else {
        if (p >= nth) lastSp = pos + W;
        if (pos + W - lastSp >= minSil) { if (lastSp - st >= minSp) segs.push([st, Math.min(pcm.length, lastSp + pad)]); st = -1; }
        else if (pos + W - st >= maxSp) { segs.push([st, pos + W]); st = -1; }
      }
      if (onProg && (i & 0x3ff) === 0) onProg(i / n);
    }
    if (st >= 0 && pcm.length - st >= minSp) segs.push([st, pcm.length]);
    return segs;
  }

  // ---------- распознавание одного куска (CTC — старая модель, оставлено для сравнения) ----------
  async function recognize(ort, sess, id2, x) {
    const f = fbank(x); if (!f.T) return "";
    const feat = new ort.Tensor("float32", f.data, [1, NB, f.T]), len = new ort.Tensor("int64", BigInt64Array.from([BigInt(f.T)]), [1]);
    const r = await sess.run({ features: feat, feature_lengths: len });
    const o = r.log_probs; return ctcText(o.data, o.dims[1], o.dims[2], id2);
  }

  // ---------- GigaAM v3 RNNT: энкодер + предсказатель (LSTM) + joiner, жадный поиск ----------
  // m = { enc, dec, join } — сессии ORT. Точнее CTC: меньше «мусорных» слов (замер 12.11: сходство 0,81 → 0,86).
  async function recognizeRnnt(ort, m, id2, x) {
    const f = fbank(x); if (!f.T) return "";
    const er = await m.enc.run({ audio_signal: new ort.Tensor("float32", f.data, [1, NB, f.T]), length: new ort.Tensor("int64", BigInt64Array.from([BigInt(f.T)]), [1]) });
    const E = er.encoded, D = E.dims[1], T = E.dims[2], ed = E.data;
    const H = 320, ONE = new ort.Tensor("int32", Int32Array.from([1]), [1]);
    let h = new Float32Array(H), c = new Float32Array(H);
    async function step(tok) {
      const r = await m.dec.run({ x: new ort.Tensor("int32", Int32Array.from([tok]), [1, 1]), "unused_x_len.1": ONE, "h.1": new ort.Tensor("float32", h, [1, 1, H]), "c.1": new ort.Tensor("float32", c, [1, 1, H]) });
      return { dec: r.dec.data.slice(), h: r.h.data.slice(), c: r.c.data.slice() };
    }
    const blank = id2.length - 1;   // <blk> — последний токен словаря
    let s = await step(blank), dec = s.dec; const out = [];
    const et = new Float32Array(D);
    for (let t = 0; t < T; t++) {
      for (let k = 0; k < D; k++) et[k] = ed[k * T + t];
      for (let sym = 0; sym < 5; sym++) {
        const jr = await m.join.run({ enc: new ort.Tensor("float32", et, [1, D, 1]), dec: new ort.Tensor("float32", dec, [1, 320, 1]) });
        const lg = jr.joint.data, V = lg.length;
        let bi = 0, bv = -1e30; for (let v = 0; v < V; v++) if (lg[v] > bv) { bv = lg[v]; bi = v; }
        if (bi === blank) break;
        out.push(bi); h = s.h; c = s.c; s = await step(bi); dec = s.dec;
      }
    }
    return out.map(i => id2[i] != null ? id2[i] : "").join("").replace(/▁/g, " ").replace(/\s+/g, " ").trim();
  }

  // ---------- резка без детектора речи: куски ~L секунд, граница — в самом тихом месте ±3 с ----------
  function chunkCuts(x, L) {
    const W = Math.round((L || 25) * SR), A = 3 * SR, win = 3200, hop = 1600, cuts = [0];
    let pos = 0;
    while (x.length - pos > W + A) {
      const tg = pos + W; let best = tg, bv = Infinity;
      for (let c0 = tg - A; c0 + win <= tg + A && c0 + win <= x.length; c0 += hop) { let e = 0; for (let k = 0; k < win; k++) { const v = x[c0 + k]; e += v * v; } if (e < bv) { bv = e; best = c0 + win / 2; } }
      cuts.push(best); pos = best;
    }
    cuts.push(x.length); return cuts;
  }
  function gain(x) {   // тихий кусок подтягиваем к RMS 0.1 (до ×20); числа float — «перегруза» нет
    let sq = 0; for (let i = 0; i < x.length; i++) sq += x[i] * x[i];
    const rms = Math.sqrt(sq / Math.max(1, x.length)); if (rms <= 1e-5) return false;
    const g = Math.min(20, 0.1 / rms); for (let i = 0; i < x.length; i++) x[i] *= g; return true;
  }
  // «э-э», «а-а-а», «м-м» и т.п. — убираем, расставленные вокруг них запятые чиним
  const FILL = /(^|[\s,.;:—(«"-])(?:[эЭ]+(?:-[эЭ]+)*|[аА]+(?:-[аА]+)+|[аА]{3,}|[мМ]+(?:-[мМ]+)+|[мМ]{2,}|[ыЫ]+(?:-[ыЫ]+)+)(?=[\s,.!?;:…»")]|$)/g;
  function clean(t) {
    let s = t; for (let i = 0; i < 2; i++) s = s.replace(FILL, "$1");
    s = s.replace(/\s+([,.!?;:…])/g, "$1").replace(/([,;:])(?:\s*[,;:])+/g, "$1").replace(/,\s*([.!?…])/g, "$1").replace(/([.!?…])\s*[,;:]+/g, "$1")
      .replace(/\s{2,}/g, " ").replace(/^[\s,.;:—-]+/, "").trim();
    s = s.replace(/([.!?…]\s+)([а-яё])/g, (q, a, b) => a + b.toUpperCase());
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const T2 = t => String(t).padStart(2, "0");
  const stamp = sec => T2(Math.floor(sec / 3600)) + ":" + T2(Math.floor(sec / 60) % 60) + ":" + T2(Math.floor(sec) % 60);

  // Полная расшифровка: pcm — Float32Array 16 кГц моно, m = {enc, dec, join}. Возвращает [{t, text}] — абзацы ~25 с.
  async function transcribe(ort, m, id2, pcm, o) {
    o = o || {}; const out = [], st = { x: 0, y: 0 };
    const x = Float32Array.from(pcm); highpass(x, st);
    const cuts = chunkCuts(x, o.len || 25), n = cuts.length - 1;
    for (let i = 0; i < n; i++) {
      if (o.cancel && o.cancel()) break;
      const part = x.slice(cuts[i], cuts[i + 1]);
      if (part.length < SR * 0.3 || !gain(part)) continue;
      let t = await recognizeRnnt(ort, m, id2, part); if (t) t = clean(fixTerms(t, o.extra));
      if (o.onProgress) o.onProgress((i + 1) / n, "расшифровка");
      if (!t) continue;
      t = t.charAt(0).toUpperCase() + t.slice(1);
      if (!/[.!?…]$/.test(t)) t += ".";
      out.push({ t: Math.floor(cuts[i] / SR), text: t });
      if (o.onLine) o.onLine(out[out.length - 1]);
    }
    return out;
  }

  const API = { fbank, parseTokens, ctcText, fixTerms, vadSegments, recognize, recognizeRnnt, chunkCuts, gain, clean, transcribe, stamp, SR };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ASRCORE = API;
})(typeof self !== "undefined" ? self : this);
