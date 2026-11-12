/* «Расшифровка» — запись совещания → текст прямо в браузере (GigaAM v3 RNNT на onnxruntime-web). Звук не уходит с компьютера.
   Грузится лениво (как «Здоровье»). Тяжёлая часть — воркеры asr/asr-worker.js; модель (≈225 МБ) хранится в Cache Storage «moidela-asr». */
window.ASR_INIT = function (X) {
  const { ic, esc, $, render, toast, mtopHTML, acts } = X;
  const V = 2;                                                   // версия библиотек в asr/ (поднимать при их замене — сбрасывает кэш)
  const BASE = new URL("asr/", location.href).href, KEY = new URL("asr-model/encoder.int8.onnx", location.href).href, MSIZE = 224570820,
    OLD = new URL("asr-model/model.int8.onnx", location.href).href;   // прежняя CTC-модель: удаляем, чтобы не занимала 225 МБ
  const HF = "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-transducer-punct-giga-am-v3-russian-2025-12-16/resolve/main/encoder.int8.onnx";
  const REL = "https://github.com/baklanov1993dmitry-gif/moi-dela/releases/download/asr/encoder.int8.onnx";
  const LS = { hist: "mytasks_asr_hist", dict: "mytasks_asr_dict", thr: "mytasks_asr_thr" };
  const jg = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const js = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("Не хватило места в браузере — старые расшифровки лучше удалить"); } };
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const autoThr = Math.max(1, Math.min(mem >= 8 ? 3 : 2, Math.floor(cores / 3)));
  const A0 = { model: "unk", pct: 0, msg: "", job: null, hist: jg(LS.hist, []), cur: null, dict: jg(LS.dict, ""), dictOpen: false, thr: jg(LS.thr, 0) || autoThr, busy: false };
  const hms = s => { s = Math.floor(s); const p = n => String(n).padStart(2, "0"); return p(Math.floor(s / 3600)) + ":" + p(Math.floor(s / 60) % 60) + ":" + p(s % 60); };
  const dur = s => s < 90 ? Math.round(s) + " с" : s < 5400 ? Math.round(s / 60) + " мин" : (s / 3600).toFixed(1).replace(".", ",") + " ч";
  const mb = n => Math.round(n / 1e6);
  const isMob = () => /Android|iPhone|iPad/i.test(navigator.userAgent);

  const css = document.createElement("style");
  css.textContent = ".asr{max-width:860px;margin:0 auto;padding:18px 18px 70px}.asr h1{font-size:1.5em;margin:0 0 2px}.asr .sub{color:var(--sub);font-size:.9em;margin-bottom:16px}" +
    ".asr .cardx{background:var(--card);border:1px solid var(--ln);border-radius:14px;padding:16px;margin-bottom:14px}.asr .drop{border:2px dashed var(--ln);border-radius:14px;padding:26px 16px;text-align:center;color:var(--sub);cursor:pointer}" +
    ".asr .drop:hover{border-color:var(--acc);color:var(--tx)}.asr .bar{height:8px;border-radius:5px;background:var(--hov);overflow:hidden;margin:10px 0 6px}.asr .bar i{display:block;height:100%;width:0;background:var(--acc);transition:width .4s}" +
    ".asr .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.asr .btnx{font:inherit;padding:7px 13px;border-radius:18px;border:1px solid var(--ln);background:var(--card);color:var(--tx);cursor:pointer}.asr .btnx:hover{background:var(--hov)}" +
    ".asr .btnx.p{background:var(--acc);border-color:var(--acc);color:#fff}.asr .txt{white-space:pre-wrap;line-height:1.55;font-size:.95em;max-height:58vh;overflow:auto;user-select:text;padding:4px 2px}.asr .txt b{color:var(--sub);font-weight:500;font-variant-numeric:tabular-nums}" +
    ".asr .hi{display:flex;gap:8px;align-items:center;padding:8px 6px;border-radius:9px;cursor:pointer}.asr .hi:hover{background:var(--hov)}.asr .hi span.n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".asr .mut{color:var(--sub);font-size:.85em}.asr textarea{width:100%;min-height:90px;font:inherit;font-size:.9em;border:1px solid var(--ln);border-radius:10px;padding:8px;background:var(--card);color:var(--tx);box-sizing:border-box}";
  document.head.appendChild(css);

  /* ---------- модель ---------- */
  async function checkModel() { try { const c = await caches.open("moidela-asr"); try { await c.delete(OLD); } catch (e) {} A0.model = (await c.match(KEY)) ? "ok" : "no"; } catch (e) { A0.model = "no"; A0.msg = "Браузер не даёт хранить большие файлы (режим инкогнито?)"; } render(); }
  async function putModel(blob) { const c = await caches.open("moidela-asr"); await c.put(KEY, new Response(blob, { headers: { "Content-Type": "application/octet-stream" } })); A0.model = "ok"; A0.msg = ""; render(); toast("Модель готова — можно расшифровывать"); }
  async function download() {
    if (A0.model === "dl") return; A0.model = "dl"; A0.pct = 0; A0.msg = "Подключаюсь…"; render();
    const errs = [];
    for (const url of [KEY, HF]) {
      try {
        const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status);
        const total = +r.headers.get("content-length") || MSIZE, rd = r.body.getReader(), parts = []; let got = 0, last = 0;
        for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; if (Date.now() - last > 400) { last = Date.now(); A0.pct = got / total; A0.msg = "Скачано " + mb(got) + " из " + mb(total) + " МБ"; barUpd(); } }
        if (got < MSIZE * 0.98) throw new Error("файл неполный (" + mb(got) + " МБ)");
        return await putModel(new Blob(parts));
      } catch (e) { errs.push((url === KEY ? "с сайта" : "с Hugging Face") + ": " + (e.message || e)); }
    }
    A0.model = "no"; A0.msg = "Не скачалось автоматически (" + errs.join("; ") + "). Скачай файл вручную по ссылке ниже и выбери его здесь."; render();
  }
  async function modelFile(f) {
    if (!f) return; if (Math.abs(f.size - MSIZE) > 2e6) { A0.msg = "Это не тот файл: нужен encoder.int8.onnx размером около " + mb(MSIZE) + " МБ (у выбранного " + mb(f.size) + " МБ)."; render(); return; }
    try { await putModel(f); } catch (e) { A0.msg = "Не удалось сохранить: " + (e.message || e); render(); }
  }

  /* ---------- звук ---------- */
  async function decode(file) {
    const ab = await file.arrayBuffer(), AC = window.AudioContext || window.webkitAudioContext, ac = new AC({ sampleRate: 16000 });
    let buf; try { buf = await ac.decodeAudioData(ab); } finally { try { ac.close(); } catch (e) {} }
    const ch = buf.numberOfChannels, n = buf.length, out = new Float32Array(n);
    for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / ch; }
    return out;
  }
  function splitPoints(pcm, N) {   // N кусков, границы — в самых тихих местах (±20 с от ровной нарезки)
    const SR = 16000, pts = [0], F = SR / 4;
    for (let k = 1; k < N; k++) {
      const tg = Math.floor(pcm.length * k / N), a = Math.max(pts[pts.length - 1] + 30 * SR, tg - 20 * SR), b = Math.min(pcm.length - 30 * SR, tg + 20 * SR);
      let best = tg, bv = 1e9; for (let s = a; s + F < b; s += F) { let e = 0; for (let i = s; i < s + F; i += 8) e += pcm[i] * pcm[i]; if (e < bv) { bv = e; best = s + (F >> 1); } }
      pts.push(best);
    }
    pts.push(pcm.length); return pts;
  }
  const dictPairs = () => A0.dict.split("\n").map(l => l.split(/=|→|->/)).filter(p => p.length >= 2 && p[0].trim() && p[1].trim()).map(p => [p[0].trim(), p.slice(1).join("=").trim()]);

  /* ---------- задача ---------- */
  let wake = null, tick = null;
  function barUpd() {
    const j = A0.job, b = $("asr-bar"), s = $("asr-st"), p = j ? j.pct : A0.pct;
    if (b) b.style.width = Math.round(p * 100) + "%";
    if (s) s.textContent = j ? stText(j) : A0.msg;
  }
  function stText(j) {
    if (j.stage !== "run") return j.msg;
    const el = (Date.now() - j.t0run) / 1000, eta = j.pct > 0.04 ? el / j.pct * (1 - j.pct) : 0;
    return "Расшифровка " + Math.round(j.pct * 100) + "%" + (eta ? " · осталось около " + dur(eta) : "") + " · абзацев: " + j.lines.length;
  }
  function liveUpd() { const j = A0.job, e = $("asr-live"); if (!j || !e) return; const L = j.lines.slice().sort((a, b) => a.t - b.t); e.innerHTML = L.slice(-400).map(l => "<b>[" + hms(l.t) + "]</b> " + esc(l.text)).join("\n"); e.scrollTop = e.scrollHeight; }
  function finish(j, state) {
    clearInterval(tick); tick = null; try { j.ws.forEach(w => w.terminate()); } catch (e) {} j.ws = []; try { if (wake) wake.release(); } catch (e) {} wake = null;
    const L = j.lines.slice().sort((a, b) => a.t - b.t);
    j.stage = state; j.pct = state === "done" ? 1 : j.pct;
    if (L.length) {
      const it = { id: String(Date.now()), name: j.name, at: new Date().toISOString(), dur: j.dur, partial: state !== "done", text: L.map(l => "[" + hms(l.t) + "] " + l.text).join("\n") };
      A0.hist.unshift(it); A0.hist = A0.hist.slice(0, 15); js(LS.hist, A0.hist); A0.cur = it;
    } else if (state === "done") { j.msg = "Речь не найдена — проверь, что запись не пустая и звук не слишком тихий."; j.stage = "err"; }
    if (state === "done" && L.length) { toast("Расшифровка готова: " + j.name); try { new Notification("Расшифровка готова", { body: j.name }); } catch (e) {} }
    A0.job = state === "done" && L.length ? null : j; render();
  }
  async function start(file) {
    if (A0.job && A0.job.stage !== "err") { toast("Сейчас уже идёт расшифровка"); return; }
    if (A0.model !== "ok") { toast("Сначала скачай модель"); return; }
    const j = A0.job = { name: file.name, size: file.size, stage: "decode", pct: 0, lines: [], ws: [], msg: "Читаю и декодирую звук…", t0run: 0, dur: 0 }; A0.cur = null; render();
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (e) {}
    try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
    let pcm;
    try { pcm = await decode(file); } catch (e) { j.stage = "err"; j.msg = "Не удалось прочитать звук: " + (e && e.message || e) + ". Для очень длинных записей попробуй формат mp3 или разрежь запись пополам."; try { if (wake) wake.release(); } catch (x) {} render(); return; }
    j.dur = pcm.length / 16000;
    const N = j.dur < 180 ? 1 : A0.thr, pts = splitPoints(pcm, N), parts = [];
    for (let k = 0; k < N; k++) { const sl = pcm.slice(pts[k], pts[k + 1]); parts.push({ off: pts[k] / 16000, pcm: sl, len: sl.length, p: 0 }); }
    pcm = null;
    j.stage = "init"; j.msg = "Запускаю распознавание (" + N + " " + (N === 1 ? "поток" : "потока") + "), загружаю модель…"; j.parts = parts; render();
    const extra = dictPairs(); let ready = 0, ended = 0, failed = false;
    parts.forEach((pt, k) => {
      const w = new Worker(BASE + "asr-worker.js?v=" + V); j.ws.push(w);
      w.onmessage = e => {
        const m = e.data;
        if (m.type === "ready") {
          pt.ready = true; if (++ready === N) { j.stage = "run"; j.t0run = Date.now(); render(); tick = setInterval(() => { j.pct = parts.reduce((s, q) => s + q.p * q.len, 0) / parts.reduce((s, q) => s + q.len, 0); barUpd(); liveUpd(); }, 700); }
          const cp = pt.pcm; w.postMessage({ type: "run", pcm: cp, off: pt.off, extra }, [cp.buffer]);
        } else if (m.type === "prog") { pt.p = m.p; }
        else if (m.type === "line") { j.lines.push({ t: m.t, text: m.text }); }
        else if (m.type === "done") { pt.p = 1; if (++ended === N && !failed) finish(j, j.cancel ? "cancel" : "done"); }
        else if (m.type === "error") { if (failed) return; failed = true; clearInterval(tick); try { j.ws.forEach(x => x.terminate()); } catch (x) {} j.stage = "err"; j.msg = "Ошибка расшифровки: " + m.msg + (/memory|alloc/i.test(m.msg) ? ". Не хватило памяти — поставь меньше потоков." : ""); try { if (wake) wake.release(); } catch (x) {} render(); }
      };
      w.onerror = e => { if (failed) return; failed = true; j.stage = "err"; j.msg = "Не запустился воркер: " + (e.message || "ошибка загрузки скриптов (нет связи?)"); render(); };
      w.postMessage({ type: "init", base: BASE, v: V, modelKey: KEY });
    });
  }
  function cancel() { const j = A0.job; if (!j) return; if (j.stage === "run") { j.cancel = true; j.msg = "Останавливаю…"; j.ws.forEach(w => w.postMessage({ type: "cancel" })); } else { finish(j, "cancel"); } }

  /* ---------- результат ---------- */
  const textOf = () => A0.cur ? A0.cur.text : "";
  const safeName = () => (A0.cur ? A0.cur.name : "расшифровка").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_");
  const A = {
    asrdl() { download(); },
    asrpick() { const e = $("asr-file"); if (e) e.click(); },
    asrmpick(a, e) { if (e && e.preventDefault) e.preventDefault(); const f = $("asr-mfile"); if (f) f.click(); },
    asrcancel() { cancel(); },
    asrcopy() { const t = textOf(); if (!t) return; try { navigator.clipboard.writeText(t).then(() => toast("Скопировано"), () => toast("Не удалось скопировать")); } catch (e) { toast("Не удалось скопировать"); } },
    asrtxt() { const t = textOf(); if (!t) return; const u = URL.createObjectURL(new Blob(["\ufeff" + t.replace(/\n/g, "\r\n")], { type: "text/plain;charset=utf-8" })), a = document.createElement("a"); a.href = u; a.download = safeName() + ".txt"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 1500); },
    asrprint() {
      const t = textOf(); if (!t) return;
      const body = t.split("\n").map(l => { const m = l.match(/^\[(\d\d:\d\d:\d\d)\]\s*(.*)$/); return m ? "<p><span class=t>" + m[1] + "</span> " + esc(m[2]) + "</p>" : "<p>" + esc(l) + "</p>"; }).join("");
      const doc = "<!doctype html><meta charset=utf-8><title>" + esc(safeName()) + "</title><style>body{font:12pt/1.5 Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 18px}h2{font-size:15pt}p{margin:0 0 7px}.t{color:#777;font-size:10pt;margin-right:6px}</style><h2>" + esc(A0.cur.name) + "</h2>" + body + "<script>setTimeout(function(){print()},300)<\/script>";
      try { const u = URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" })); if (!window.open(u, "_blank")) toast("Браузер заблокировал окно — разреши всплывающие окна для сайта"); } catch (e) { toast("Не получилось открыть печать"); }
    },
    asropen(a) { const it = A0.hist.find(x => x.id === a.dataset.id); if (it) { A0.cur = it; A0.job = A0.job && A0.job.stage === "err" ? null : A0.job; render(); } },
    asrdel(a, e) { if (e && e.stopPropagation) e.stopPropagation(); const id = a.dataset.id; if (!confirm("Удалить эту расшифровку из браузера?")) return; A0.hist = A0.hist.filter(x => x.id !== id); js(LS.hist, A0.hist); if (A0.cur && A0.cur.id === id) A0.cur = null; render(); },
    asrdict() { A0.dictOpen = !A0.dictOpen; render(); },
    asrclose() { A0.cur = null; if (A0.job && A0.job.stage === "err") A0.job = null; render(); },
    asrdelmodel(a, e) { if (e && e.preventDefault) e.preventDefault(); if (!confirm("Удалить модель из браузера (≈" + mb(MSIZE) + " МБ)? Потом её можно скачать снова.")) return; caches.delete("moidela-asr").then(() => { A0.model = "no"; render(); }); }
  };
  Object.assign(acts, A);
  document.addEventListener("change", e => {
    const t = e.target; if (!t || !t.id) return;
    if (t.id === "asr-file") { const f = t.files && t.files[0]; t.value = ""; if (f) start(f); }
    else if (t.id === "asr-mfile") { const f = t.files && t.files[0]; t.value = ""; modelFile(f); }
    else if (t.id === "asr-dict") { A0.dict = t.value; js(LS.dict, A0.dict); }
    else if (t.id === "asr-thr") { A0.thr = +t.value || autoThr; js(LS.thr, A0.thr); }
  });

  /* ---------- экран ---------- */
  function modelHTML() {
    if (A0.model === "unk") return '<div class="cardx mut">Проверяю, есть ли модель…</div>';
    if (A0.model === "dl") return '<div class="cardx"><b>Скачиваю модель распознавания</b><div class="bar"><i id="asr-bar" style="width:' + Math.round(A0.pct * 100) + '%"></i></div><div class="mut" id="asr-st">' + esc(A0.msg) + "</div></div>";
    if (A0.model === "no") return '<div class="cardx"><b>Нужна модель распознавания русской речи</b><div class="mut" style="margin:6px 0 12px">GigaAM v3 (≈' + mb(MSIZE) + ' МБ). Скачивается один раз и хранится в браузере. Дальше всё работает без интернета и звук никуда не уходит.</div>' +
      '<div class="row"><button class="btnx p" data-a="asrdl">Скачать модель</button></div>' +
      (A0.msg ? '<div class="mut" style="margin-top:10px;color:#dc2626">' + esc(A0.msg) + "</div>" : "") +
      '<div class="mut" style="margin-top:12px">Не качается? <a href="' + REL + '" target="_blank" rel="noopener">Скачай файл вручную</a> и <a href="#" data-a="asrmpick">выбери его здесь</a>.</div></div>';
    return "";
  }
  function jobHTML(j) {
    const wait = j.stage === "decode" || j.stage === "init";
    if (j.stage === "err") return '<div class="cardx"><b style="color:#dc2626">Не получилось</b><div style="margin:8px 0">' + esc(j.msg) + '</div><button class="btnx" data-a="asrclose">Понятно</button></div>';
    return '<div class="cardx"><div class="row"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(j.name) + '</b><span class="mut">' + mb(j.size) + ' МБ' + (j.dur ? " · " + dur(j.dur) : "") + '</span><button class="btnx" data-a="asrcancel">' + (wait ? "Отмена" : "Остановить") + "</button></div>" +
      '<div class="bar"><i id="asr-bar" style="width:' + Math.round(j.pct * 100) + '%' + (wait ? ";width:100%;opacity:.25" : "") + '"></i></div><div class="mut" id="asr-st">' + esc(stText(j)) + '</div>' +
      '<div class="mut" style="margin-top:6px">Вкладку можно оставить в фоне, но не закрывай. Компьютер не уснёт, пока идёт расшифровка.</div>' +
      (j.stage === "run" ? '<div class="txt" id="asr-live" style="margin-top:12px;border-top:1px solid var(--ln);padding-top:10px"></div>' : "") + "</div>";
  }
  function curHTML() {
    const c = A0.cur; if (!c) return "";
    const lines = c.text.split("\n").map(l => { const m = l.match(/^(\[\d\d:\d\d:\d\d\])\s*(.*)$/); return m ? "<b>" + m[1] + "</b> " + esc(m[2]) : esc(l); }).join("\n");
    return '<div class="cardx"><div class="row" style="margin-bottom:8px"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.name) + (c.partial ? " (неполная)" : "") + '</b><span class="mut">' + dur(c.dur || 0) + "</span></div>" +
      '<div class="row" style="margin-bottom:10px"><button class="btnx p" data-a="asrcopy">Копировать</button><button class="btnx" data-a="asrtxt">Скачать .txt</button><button class="btnx" data-a="asrprint">Печать / PDF</button><button class="btnx" data-a="asrclose">Закрыть</button></div>' +
      '<div class="txt">' + lines + "</div></div>";
  }
  function html(vi) {
    if (A0.model === "unk") setTimeout(checkModel, 0);
    const j = A0.job, busy = j && j.stage !== "err", ok = A0.model === "ok";
    let h = '<div id="main" class="pane" style="flex:1">' + mtopHTML(vi, 1, "") + '<div class="scroll" id="list"><div class="asr">' +
      "<h1>Расшифровка</h1><div class='sub'>Запись совещания → текст с метками времени. Всё считается на этом компьютере, звук никуда не отправляется.</div>" +
      (isMob() ? '<div class="cardx mut">На телефоне удобнее приложение «Мои дела» для Android (раздел «Совещание»): оно считает быстрее и не греет браузер.</div>' : "") +
      modelHTML() +
      '<input type="file" id="asr-file" hidden accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.opus,.aac,.amr,.flac"><input type="file" id="asr-mfile" hidden accept=".onnx">';
    if (j) h += jobHTML(j);
    if (ok && !busy) h += '<div class="drop" data-a="asrpick"><div style="font-size:1.1em;color:var(--tx)">Перетащи запись сюда или нажми, чтобы выбрать файл</div><div class="mut" style="margin-top:6px">m4a, mp3, wav, ogg… до 100 МБ. Запись с телефона подойдёт как есть.</div></div>';
    h += curHTML();
    if (ok) {
      h += '<div class="cardx"><div class="row"><span class="mut" style="flex:1">Потоков: <select id="asr-thr" style="font:inherit">' + [1, 2, 3, 4].map(n => '<option value="' + n + '"' + (n === A0.thr ? " selected" : "") + ">" + n + (n === autoThr ? " (авто)" : "") + "</option>").join("") + '</select> <span>— больше потоков быстрее, но каждый занимает ≈0,8 ГБ памяти</span></span>' +
        '<button class="btnx" data-a="asrdict">Словарь замен ' + (A0.dictOpen ? "▲" : "▼") + '</button></div>' +
        (A0.dictOpen ? '<div class="mut" style="margin:10px 0 6px">По одной замене в строке: «как услышал = как надо». Например: <code>эй би би = ABB</code>. Аббревиатуры НКУ, ВРУ, АВР, УЗО, ТКП, ТЗ, ГОСТ и другие исправляются сами.</div><textarea id="asr-dict" placeholder="иванов = Иванов И. И.">' + esc(A0.dict) + "</textarea>" : "") + "</div>";
    }
    if (A0.hist.length) h += '<div class="cardx"><b>Мои расшифровки</b><div class="mut" style="margin:2px 0 8px">Хранятся только в этом браузере</div>' + A0.hist.map(it => '<div class="hi" data-a="asropen" data-id="' + it.id + '"><span class="n">' + esc(it.name) + (it.partial ? " (неполная)" : "") + '</span><span class="mut">' + new Date(it.at).toLocaleDateString("ru-RU") + " · " + dur(it.dur || 0) + '</span><button class="btnx" data-a="asrdel" data-id="' + it.id + '" title="Удалить">✕</button></div>').join("") + "</div>";
    if (ok && !busy) h += '<div class="mut" style="text-align:center"><a href="#" data-a="asrdelmodel">Удалить модель из браузера</a></div>';
    return h + "</div></div></div>";
  }
  return { html, add(files) { const f = files && files[0]; if (f) start(f); }, busy: () => !!(A0.job && A0.job.stage !== "err") };
};
