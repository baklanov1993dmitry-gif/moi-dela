/* «Заметки» — личный раздел мыслей. Грузится после index.html, использует его глобалы (sb, S, ic, esc, $, render, toast, addTask, micToggle…). Данные только владельца (RLS). */
window.NOTES_INIT = function (X) {
  const { S, ic, esc, $, render, toast, addTask, micToggle, micOK, mtopHTML, uid, nowISO, todayISO, addDays, parseISO, pad2, WDS, goView, acts, zipStore, utf8 } = X;
  const sbg = () => X.sb(), viewg = () => X.view();
  const KEY = "mytasks_notes", KP = "mytasks_notes_p";
  const NT = { items: {}, pend: {}, loaded: false, busy: false, missing: false, q: "", tag: "", edit: null, uid: null, tx: "", mode: "feed", cl: null, focus: null, rel: {} };
  const jg = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const js = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const tagsOf = t => { const r = []; String(t).replace(/(^|\s)#([\p{L}\d_-]{2,30})/gu, (m, a, b) => { b = b.toLowerCase(); if (r.indexOf(b) < 0) r.push(b); return m; }); return r; };
  const save = () => { if (NT.uid) { js(KEY, { u: NT.uid, items: NT.items }); js(KP, NT.pend); } };
  function boot() {
    if (!S.user) return; if (NT.uid === S.user.id) return;
    NT.uid = S.user.id; const c = jg(KEY, null); NT.items = c && c.u === NT.uid ? c.items || {} : {}; NT.pend = jg(KP, {}); NT.loaded = false; NT.missing = false;
  }
  async function flush() {
    if (!sbg() || !S.user || NT.missing) return; const ids = Object.keys(NT.pend); if (!ids.length) return;
    for (const id of ids) {
      const op = NT.pend[id], n = NT.items[id];
      try {
        let r;
        if (op === "d") r = await sbg().from("notes").delete().eq("id", id);
        else if (n) r = await sbg().from("notes").upsert({ id: n.id, user_id: S.user.id, text: n.text, tags: n.tags, task_id: n.task_id || null, pinned: !!n.pinned, created_at: n.created_at });
        else { delete NT.pend[id]; continue; }
        if (r.error) { if (/relation|does not exist|schema cache/i.test(r.error.message || "")) NT.missing = true; break; }
        delete NT.pend[id];
      } catch (e) { break; }
    }
    save();
  }
  async function load() {
    boot(); if (NT.busy || !sbg() || !S.user) return; NT.busy = true;
    try {
      await flush();
      const r = await sbg().from("notes").select("*").order("created_at", { ascending: false }).limit(2000);
      if (r.error) { if (/relation|does not exist|schema cache/i.test(r.error.message || "")) NT.missing = true; }
      else { NT.missing = false; const m = {}; r.data.forEach(n => { m[n.id] = n; }); Object.keys(NT.pend).forEach(id => { if (NT.pend[id] === "u" && NT.items[id]) m[id] = NT.items[id]; if (NT.pend[id] === "d") delete m[id]; }); NT.items = m; NT.loaded = true; save(); }
    } catch (e) {}
    NT.busy = false; if (viewg() === "notes") render();
  }
  function put(n, op) { NT.items[n.id] = n; NT.pend[n.id] = op || "u"; save(); flush(); }
  const dayKey = iso => { const d = new Date(iso); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
  const dayLabel = k => { const t = todayISO(); if (k === t) return "Сегодня"; if (k === addDays(t, -1)) return "Вчера"; const d = parseISO(k); return WDS[d.getDay()] + ", " + d.getDate() + " " + ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"][d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""); };
  const fmtText = t => esc(t).replace(/(^|\s)#([\p{L}\d_-]{2,30})/gu, (m, a, b) => a + '<a class="nt-tag" data-a="nttag" data-t="' + b.toLowerCase() + '">#' + b + "</a>").replace(/\n/g, "<br>");
  const list = () => {
    const q = NT.q.trim().toLowerCase();
    return Object.values(NT.items).filter(n => (!NT.focus || n.id === NT.focus) && (!NT.cl || NT.cl.indexOf(n.id) >= 0) && (!NT.tag || (n.tags || []).indexOf(NT.tag) >= 0) && (!q || n.text.toLowerCase().indexOf(q) >= 0))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created_at.localeCompare(a.created_at));
  };
  const topTags = () => { const c = {}; Object.values(NT.items).forEach(n => (n.tags || []).forEach(t => { c[t] = (c[t] || 0) + 1; })); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 14); };


  /* ---------- смысловая близость (словарная, без ИИ): TF-IDF по корням слов ---------- */
  const STOP = new Set("это как что так для или при его она они мне было быть надо нужно очень если когда чтобы только есть уже еще тоже просто можно будет также этот эта эти там тут сделать хочу думаю опять снова вообще который которые свой себя нас вас них тебя меня мой моя мои".split(" "));
  const stemOf = w => w.length >= 6 ? w.slice(0, 5) : w.slice(0, w.length - 1);
  const toks = n => { const body = n.text.toLowerCase().replace(/#[\p{L}\d_-]+/gu, " "), out = []; (body.match(/[\p{L}]{4,}/gu) || []).forEach(w => { if (!STOP.has(w)) out.push(stemOf(w)); }); (n.tags || []).forEach(t => out.push("#" + t, "#" + t)); return out; };
  let EN = null;
  function engine() {
    const all = Object.values(NT.items), sig = all.length + ":" + all.reduce((m, n) => (n.updated_at > m ? n.updated_at : m), "") + ":" + all.reduce((a, n) => a + n.text.length, 0);
    if (EN && EN.sig === sig) return EN;
    const docs = all.map(n => ({ n, tf: {} })), df = {}, word = {};
    docs.forEach(d => { toks(d.n).forEach(t => { d.tf[t] = (d.tf[t] || 0) + 1; }); Object.keys(d.tf).forEach(t => { df[t] = (df[t] || 0) + 1; }); (d.n.text.toLowerCase().match(/[\p{L}]{4,}/gu) || []).forEach(w => { const k = stemOf(w); (word[k] = word[k] || {})[w] = (word[k][w] || 0) + 1; }); });
    const N = all.length || 1;
    docs.forEach(d => { let nn = 0; d.v = {}; Object.keys(d.tf).forEach(t => { const w = d.tf[t] * Math.log(1 + N / df[t]); d.v[t] = w; nn += w * w; }); d.norm = Math.sqrt(nn) || 1; });
    const sim = (a, b) => { let s = 0; const [x, y] = Object.keys(a.v).length < Object.keys(b.v).length ? [a, b] : [b, a]; for (const t in x.v) if (y.v[t]) s += x.v[t] * y.v[t]; return s / (a.norm * b.norm); };
    const edges = [], nb = {}; docs.forEach(d => { nb[d.n.id] = []; });
    for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) { const s = sim(docs[i], docs[j]); if (s >= 0.2) { edges.push([docs[i].n.id, docs[j].n.id, s]); nb[docs[i].n.id].push([docs[j].n.id, s]); nb[docs[j].n.id].push([docs[i].n.id, s]); } }
    Object.keys(nb).forEach(k => nb[k].sort((a, b) => b[1] - a[1]));
    const par = {}; const f = x => (par[x] === x ? x : (par[x] = f(par[x]))); docs.forEach(d => { par[d.n.id] = d.n.id; }); edges.forEach(e => { par[f(e[0])] = f(e[1]); });
    const grp = {}; docs.forEach(d => { (grp[f(d.n.id)] = grp[f(d.n.id)] || []).push(d); });
    const clusters = Object.values(grp).filter(g => g.length >= 2).map(g => {
      const w = {}; g.forEach(d => { for (const t in d.v) if (t[0] !== "#") w[t] = (w[t] || 0) + d.v[t]; });
      const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => { const o = word[e[0]] || {}; return Object.keys(o).sort((a, b) => o[b] - o[a])[0] || e[0]; });
      const notes = g.map(d => d.n).sort((a, b) => a.created_at.localeCompare(b.created_at));
      return { key: notes[0].id, label: top.join(" · "), notes, first: notes[0].created_at, last: notes[notes.length - 1].created_at, linked: notes.some(n => n.task_id) };
    }).sort((a, b) => b.notes.length - a.notes.length || b.last.localeCompare(a.last));
    return (EN = { sig, nb, edges, clusters });
  }
  const dismissed = () => jg("mytasks_notes_dis", {});
  const days = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 864e5));
  const shortD = iso => { const d = new Date(iso); return d.getDate() + "." + pad2(d.getMonth() + 1); };
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 15 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
  function returnCard() {
    const E = engine(), dis = dismissed(), now = Date.now();
    const c = E.clusters.find(c => c.notes.length >= 3 && !c.linked && !dis[c.key] && now - new Date(c.last) < 21 * 864e5);
    if (!c) return "";
    return '<div class="nt-ret"><div class="nt-ret-h">🔁 Возвращаешься к теме</div><div class="nt-ret-t"><b>' + esc(c.label) + '</b></div><div class="nt-ret-s">' + c.notes.length + " " + plural(c.notes.length, "заметка", "заметки", "заметок") + " за " + days(c.first, c.last) + " " + plural(days(c.first, c.last), "день", "дня", "дней") + ", первая — " + shortD(c.first) + '. Может, пора уже сделать?</div><div class="nt-row"><button class="btn" data-a="ntcltask" data-k="' + c.key + '">Сделать задачей</button><button class="linkbtn" data-a="ntclshow" data-k="' + c.key + '">Показать</button><button class="linkbtn" data-a="ntcldis" data-k="' + c.key + '">Не напоминать</button></div></div>';
  }
  function relHTML(n) {
    const nb = engine().nb[n.id] || []; if (!nb.length) return "";
    if (!NT.rel[n.id]) return "";
    return '<div class="nt-rel">' + nb.slice(0, 4).map(e => { const m = NT.items[e[0]]; return m ? '<div class="nt-rl" data-a="ntfocus" data-id="' + m.id + '"><i>' + shortD(m.created_at) + "</i> " + esc(m.text.replace(/\s+/g, " ").slice(0, 90)) + "</div>" : ""; }).join("") + "</div>";
  }
  function tabs() {
    const t = (k, n) => '<button class="nt-tab' + (NT.mode === k ? " on" : "") + '" data-a="ntmode" data-v="' + k + '">' + n + "</button>";
    return '<div class="nt-tabs">' + t("feed", "Лента") + t("themes", "Темы") + t("graph", "Граф") + '<span style="flex:1"></span><button class="nt-b" data-a="ntexp" data-v="zip" title="Папка .md-файлов (для Obsidian)">⬇ .md</button><button class="nt-b" data-a="ntexp" data-v="one" title="Один файл">⬇ 1 файл</button></div>';
  }
  function themesHTML() {
    const E = engine(), items = Object.values(NT.items), now = Date.now(), wk = items.filter(n => now - new Date(n.created_at) < 7 * 864e5), pw = items.filter(n => { const d = now - new Date(n.created_at); return d >= 7 * 864e5 && d < 14 * 864e5; });
    const tg = {}; wk.forEach(n => (n.tags || []).forEach(t => { tg[t] = (tg[t] || 0) + 1; }));
    const ptg = {}; pw.forEach(n => (n.tags || []).forEach(t => { ptg[t] = (ptg[t] || 0) + 1; }));
    const grow = Object.keys(tg).filter(t => tg[t] > (ptg[t] || 0)).sort((a, b) => tg[b] - (ptg[b] || 0) - (tg[a] - (ptg[a] || 0))).slice(0, 3);
    const fade = Object.keys(ptg).filter(t => !tg[t]).slice(0, 3), made = items.filter(n => n.task_id && wk.indexOf(n) >= 0).length;
    let h = '<div class="nt-wk"><b>Неделя</b><div>' + wk.length + " " + plural(wk.length, "заметка", "заметки", "заметок") + " (на прошлой — " + pw.length + ")" + (made ? ", " + made + " стали задачами" : "") + "." + (grow.length ? "<br>Растёт: " + grow.map(t => '<a class="nt-tag" data-a="nttag" data-t="' + esc(t) + '">#' + esc(t) + "</a>").join(" ") : "") + (fade.length ? "<br>Затихло: " + fade.map(t => '<a class="nt-tag" data-a="nttag" data-t="' + esc(t) + '">#' + esc(t) + "</a>").join(" ") : "") + "</div></div>";
    h += '<div class="nt-day">Связанные мысли</div>';
    if (!E.clusters.length) h += '<div class="jr-empty">Пока нет повторяющихся тем. Пиши — они проявятся сами.</div>';
    E.clusters.slice(0, 20).forEach(c => { h += '<div class="nt-card"><div class="nt-tx"><b>' + esc(c.label) + '</b></div><div class="nt-meta"><span>' + c.notes.length + " " + plural(c.notes.length, "заметка", "заметки", "заметок") + " · " + shortD(c.first) + " → " + shortD(c.last) + (c.linked ? " · есть задача" : "") + '</span><span style="flex:1"></span>' + (c.linked ? "" : '<button class="nt-b" data-a="ntcltask" data-k="' + c.key + '">' + ic("ccheck", 16) + ' в задачу</button>') + '<button class="nt-b" data-a="ntclshow" data-k="' + c.key + '">Показать</button></div></div>'; });
    const all = {}; items.forEach(n => (n.tags || []).forEach(t => { all[t] = (all[t] || 0) + 1; }));
    const tl = Object.entries(all).sort((a, b) => b[1] - a[1]);
    h += '<div class="nt-day">Теги</div><div class="nt-tags">' + (tl.length ? tl.map(t => '<a class="nt-tag" data-a="nttag" data-t="' + esc(t[0]) + '">#' + esc(t[0]) + " <i>" + t[1] + "</i></a>").join("") : '<span class="nt-hint">Добавляй #теги в текст — они соберутся здесь.</span>') + "</div>";
    return h;
  }
  /* ---------- граф ---------- */
  let G = null;
  function buildGraph() {
    const E = engine(), notes = Object.values(NT.items).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 140), ids = new Set(notes.map(n => n.id)), nodes = [], idx = {}, links = [];
    notes.forEach(n => { idx[n.id] = nodes.length; nodes.push({ t: "n", id: n.id, x: Math.random() * 400, y: Math.random() * 300, vx: 0, vy: 0, d: 0 }); });
    const tc = {}; notes.forEach(n => (n.tags || []).forEach(t => { tc[t] = (tc[t] || 0) + 1; }));
    Object.keys(tc).filter(t => tc[t] >= 1).slice(0, 40).forEach(t => { idx["#" + t] = nodes.length; nodes.push({ t: "g", id: t, x: Math.random() * 400, y: Math.random() * 300, vx: 0, vy: 0, d: tc[t] }); });
    notes.forEach(n => (n.tags || []).forEach(t => { if (idx["#" + t] != null) { links.push([idx[n.id], idx["#" + t], 1]); nodes[idx[n.id]].d++; } }));
    E.edges.forEach(e => { if (ids.has(e[0]) && ids.has(e[1])) { links.push([idx[e[0]], idx[e[1]], 0.6]); nodes[idx[e[0]]].d++; nodes[idx[e[1]]].d++; } });
    const W = 700, H = 440;
    for (let it = 0; it < 260; it++) {
      const k = 1 - it / 260;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01; if (d2 > 40000) continue; const f = 900 / d2, d = Math.sqrt(d2); dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; }
      links.forEach(l => { const a = nodes[l[0]], b = nodes[l[1]]; let dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - 55) * 0.02 * l[2]; dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; });
      nodes.forEach(n => { n.vx += (W / 2 - n.x) * 0.004; n.vy += (H / 2 - n.y) * 0.004; n.x += Math.max(-8, Math.min(8, n.vx)) * k; n.y += Math.max(-8, Math.min(8, n.vy)) * k; n.vx *= 0.6; n.vy *= 0.6; });
    }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; nodes.forEach(n => { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
    const sx = (W - 60) / Math.max(1, x1 - x0), sy = (H - 60) / Math.max(1, y1 - y0), sc = Math.min(sx, sy, 2.2);
    nodes.forEach(n => { n.x = (n.x - (x0 + x1) / 2) * sc + W / 2; n.y = (n.y - (y0 + y1) / 2) * sc + H / 2; });
    G = { nodes, links, W, H, sel: -1 };
  }
  function drawGraph() {
    const cv = $("nt-cv"); if (!cv || !G) return; const r = window.devicePixelRatio || 1, wcss = cv.clientWidth || 700, hcss = Math.round(wcss * G.H / G.W);
    cv.width = wcss * r; cv.height = hcss * r; cv.style.height = hcss + "px"; const c = cv.getContext("2d"), k = wcss / G.W * r; c.setTransform(k, 0, 0, k, 0, 0);
    const dark = matchMedia("(prefers-color-scheme: dark)").matches || document.documentElement.classList.contains("dark");
    c.clearRect(0, 0, G.W, G.H); c.lineWidth = 1;
    G.links.forEach(l => { const a = G.nodes[l[0]], b = G.nodes[l[1]], hi = G.sel >= 0 && (l[0] === G.sel || l[1] === G.sel); c.strokeStyle = hi ? "rgba(43,136,216,.9)" : (dark ? "rgba(200,200,200,.18)" : "rgba(80,80,80,.18)"); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); });
    G.nodes.forEach((n, i) => { const rad = n.t === "g" ? 6 + Math.min(10, n.d * 1.4) : 3.5 + Math.min(6, n.d * 0.8); c.beginPath(); c.arc(n.x, n.y, rad, 0, 7); c.fillStyle = n.t === "g" ? "#e3680c" : (NT.items[n.id] && NT.items[n.id].task_id ? "#107c10" : "#2b88d8"); c.globalAlpha = G.sel >= 0 && i !== G.sel ? 0.55 : 1; c.fill(); c.globalAlpha = 1; if (i === G.sel) { c.strokeStyle = dark ? "#fff" : "#000"; c.lineWidth = 2; c.stroke(); c.lineWidth = 1; } });
    c.font = "12px sans-serif"; c.fillStyle = dark ? "#ddd" : "#333"; G.nodes.forEach(n => { if (n.t === "g") c.fillText("#" + n.id, n.x + 9, n.y + 4); });
  }
  function graphHTML() {
    if (Object.keys(NT.items).length < 2) return '<div class="jr-empty">Граф появится, когда будет хотя бы пара заметок.</div>';
    buildGraph(); setTimeout(drawGraph, 0);
    return '<div class="nt-gw"><canvas id="nt-cv" style="width:100%;display:block;touch-action:manipulation"></canvas></div><div class="nt-hint" style="margin:6px 2px">🟠 теги · 🔵 заметки · 🟢 уже стали задачей. Тапни по точке.</div><div id="nt-gsel"></div>';
  }
  const slug = t => t.toLowerCase().replace(/#[\p{L}\d_-]+/gu, "").replace(/[^\p{L}\d]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "zametka";
  const mdOf = n => { const d = new Date(n.created_at), task = n.task_id && S.tasks[n.task_id]; return "---\ndate: " + d.toISOString() + "\ntags: [" + (n.tags || []).join(", ") + "]\n" + (task ? "task: " + JSON.stringify(task.title) + (task.done ? "\ndone: true" : "") + "\n" : "") + (n.pinned ? "pinned: true\n" : "") + "---\n\n" + n.text + "\n"; };
  function dl(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  const stamp = n => { const d = new Date(n.created_at); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "-" + pad2(d.getHours()) + pad2(d.getMinutes()); };

  function card(n) {
    if (NT.edit === n.id) return '<div class="nt-card edit"><textarea id="nt-ed" class="inp nt-ta" rows="4">' + esc(n.text) + '</textarea><div class="nt-row"><button class="btn" data-a="ntedsave" data-id="' + n.id + '">Сохранить</button><button class="linkbtn" data-a="ntedcancel">Отмена</button></div></div>';
    const tm = new Date(n.created_at), hh = pad2(tm.getHours()) + ":" + pad2(tm.getMinutes());
    const task = n.task_id && S.tasks[n.task_id];
    return '<div class="nt-card' + (n.pinned ? " pin" : "") + '"><div class="nt-tx">' + fmtText(n.text) + '</div><div class="nt-meta"><span>' + (n.pinned ? "📌 " : "") + hh + '</span>' +
      (task ? '<span class="nt-lnk' + (task.done ? " done" : "") + '" title="Связанная задача">' + (task.done ? "✓ " : "→ ") + "задача" + "</span>" : "") +
      '<span style="flex:1"></span>' + ((engine().nb[n.id] || []).length ? '<button class="nt-b" data-a="ntrel" data-id="' + n.id + '" title="Похожие мысли">🔗 ' + engine().nb[n.id].length + "</button>" : "") +
      (task ? "" : '<button class="nt-b" data-a="nttask" data-id="' + n.id + '" title="Сделать задачей">' + ic("ccheck", 16) + " в задачу</button>") +
      '<button class="nt-b" data-a="ntpin" data-id="' + n.id + '" title="Закрепить">' + ic("pin", 16) + '</button><button class="nt-b" data-a="ntedit" data-id="' + n.id + '" title="Править">' + ic("pen", 16) + '</button><button class="nt-b" data-a="ntdel" data-id="' + n.id + '" title="Удалить">' + ic("trash", 16) + "</button></div>" + relHTML(n) + "</div>";
  }

  function html(vi) {
    boot(); if (!NT.loaded && !NT.busy) setTimeout(load, 0);
    const head = '<div id="main" class="pane" style="flex:1">' + mtopHTML(vi, 1, "") + '<div class="mhead mhide"><h1><span style="color:#2b88d8">' + ic("bulb", 26) + "</span> " + esc(vi.name) + '</h1></div><div class="msub">' + esc(vi.sub) + "</div>";
    if (NT.missing) return head + '<div class="scroll" id="list"><div class="jr-box"><b>Одноразовая настройка базы</b><div class="jr-hint">Нужна миграция <code>migration_v28.sql</code> (Supabase → SQL Editor → Run), потом «Проверить».</div><button class="btn" data-a="ntretry">Проверить</button></div></div></div>';
    const items = list(), tags = topTags();
    const filt = NT.focus || NT.cl ? '<div class="nt-tags"><a class="nt-tag on" data-a="ntclear">✕ показан отбор · вернуть всё</a></div>' : "";
    let body = "", last = "";
    items.forEach(n => { const k = n.pinned ? "pin" : dayKey(n.created_at); if (k !== last) { last = k; body += '<div class="nt-day">' + (k === "pin" ? "Закреплено" : dayLabel(k)) + "</div>"; } body += card(n); });
    if (!items.length) body = '<div class="jr-empty">' + (NT.loaded ? (NT.q || NT.tag ? "Ничего не нашлось." : "Пока пусто. Запиши первую мысль — хоть про то, что давно хотел сделать.") : "Загружаю…") + "</div>";
    if (NT.mode === "themes") return head + '<div class="scroll" id="list">' + tabs() + themesHTML() + "</div></div>";
    if (NT.mode === "graph") return head + '<div class="scroll" id="list">' + tabs() + graphHTML() + "</div></div>";
    return head + '<div class="scroll" id="list">' + tabs() + '<div class="nt-comp"><textarea id="nt-tx" class="inp nt-ta" rows="3" placeholder="О чём думаешь? Теги — через #" enterkeyhint="enter">' + esc(NT.tx) + '</textarea><div class="nt-row">' +
      (micOK() ? '<button type="button" class="micb" data-a="ntmic" title="Надиктовать">🎤</button>' : "") + '<span class="nt-hint">Ctrl+Enter — записать</span><span style="flex:1"></span><button class="btn" data-a="ntadd">Записать</button></div></div>' +
      returnCard() + '<div class="nt-find"><input id="nt-q" class="inp" placeholder="Поиск по заметкам" autocomplete="off" value="' + esc(NT.q) + '"></div>' +
      (tags.length ? '<div class="nt-tags">' + (NT.tag ? '<a class="nt-tag on" data-a="nttag" data-t="">✕ #' + esc(NT.tag) + "</a>" : "") + tags.filter(t => t[0] !== NT.tag).map(t => '<a class="nt-tag" data-a="nttag" data-t="' + esc(t[0]) + '">#' + esc(t[0]) + " <i>" + t[1] + "</i></a>").join("") + "</div>" : "") +
      filt + body + "</div></div>";
  }

  const A = {
    ntadd() { const el = $("nt-tx"), t = (el ? el.value : NT.tx).trim(); if (!t) { toast("Пусто"); return; } boot(); const now = nowISO(); put({ id: uid(), text: t, tags: tagsOf(t), task_id: null, pinned: false, created_at: now, updated_at: now }, "u"); NT.tx = ""; render(); setTimeout(() => { const x = $("nt-tx"); if (x) x.focus(); }, 0); },
    ntmic() { micToggle("nt-tx"); },
    nttag(a) { NT.tag = a.dataset.t || ""; NT.mode = "feed"; NT.focus = null; NT.cl = null; render(); },
    ntpin(a) { const n = NT.items[a.dataset.id]; if (!n) return; n.pinned = !n.pinned; put(n); render(); },
    ntedit(a) { NT.edit = a.dataset.id; render(); setTimeout(() => { const x = $("nt-ed"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0); },
    ntedcancel() { NT.edit = null; render(); },
    ntedsave(a) { const n = NT.items[a.dataset.id], x = $("nt-ed"); if (!n || !x) return; const t = x.value.trim(); if (!t) { toast("Пусто"); return; } n.text = t; n.tags = tagsOf(t); n.updated_at = nowISO(); NT.edit = null; put(n); render(); },
    ntdel(a) { const id = a.dataset.id, n = NT.items[id]; if (!n) return; delete NT.items[id]; NT.pend[id] = "d"; save(); render(); toast("Заметка удалена", { buttons: [["Вернуть", () => { NT.items[id] = n; NT.pend[id] = "u"; save(); flush(); render(); }]] }); setTimeout(() => { if (NT.pend[id] === "d") flush(); }, 6500); },
    nttask(a) { const n = NT.items[a.dataset.id]; if (!n || n.task_id) return; const lines = n.text.split("\n"), title = lines[0].replace(/#[\p{L}\d_-]+/gu, "").trim().slice(0, 120) || "Из заметки", rest = lines.slice(1).join("\n").trim(); const t = addTask({ title, note: rest }); n.task_id = t.id; put(n); render(); toast("Задача создана", { buttons: [["Открыть", () => { goView("all"); X.sel(t.id); render(); }]] }); },
    ntmode(a) { NT.mode = a.dataset.v; NT.focus = null; render(); },
    ntrel(a) { NT.rel[a.dataset.id] = !NT.rel[a.dataset.id]; render(); },
    ntfocus(a) { NT.focus = a.dataset.id; NT.cl = null; NT.q = ""; NT.tag = ""; NT.mode = "feed"; render(); const sc = $("list"); if (sc) sc.scrollTop = 0; },
    ntclear() { NT.focus = null; NT.cl = null; render(); },
    ntclshow(a) { const c = engine().clusters.find(x => x.key === a.dataset.k); if (!c) return; NT.cl = c.notes.map(n => n.id); NT.focus = null; NT.tag = ""; NT.q = ""; NT.mode = "feed"; render(); },
    ntcldis(a) { const d = dismissed(); d[a.dataset.k] = 1; js("mytasks_notes_dis", d); render(); },
    ntcltask(a) { const c = engine().clusters.find(x => x.key === a.dataset.k); if (!c) return; const t = addTask({ title: "Заняться: " + c.label, note: c.notes.map(n => "• " + n.text.replace(/\s+/g, " ").slice(0, 160)).join("\n") }); c.notes.forEach(n => { n.task_id = t.id; put(n); }); render(); toast("Задача создана из " + c.notes.length + " заметок", { buttons: [["Открыть", () => { goView("all"); X.sel(t.id); render(); }]] }); },
    ntexp(a) { const all = Object.values(NT.items).sort((x, y) => x.created_at.localeCompare(y.created_at)); if (!all.length) { toast("Нечего выгружать"); return; }
      if (a.dataset.v === "one") { dl(new Blob([all.map(n => "## " + new Date(n.created_at).toLocaleString("ru-RU") + (n.tags.length ? "  " + n.tags.map(t => "#" + t).join(" ") : "") + "\n\n" + n.text + "\n").join("\n---\n\n")], { type: "text/markdown" }), "zametki.md"); toast("Выгружено: " + all.length); return; }
      const used = {}, files = all.map(n => { let nm = stamp(n) + "-" + slug(n.text); if (used[nm]) nm += "-" + (++used[nm]); else used[nm] = 1; return { name: "zametki/" + nm + ".md", data: utf8(mdOf(n)) }; });
      dl(new Blob([zipStore(files)], { type: "application/zip" }), "zametki.zip"); toast("Папка .md: " + all.length + " файлов — открой в Obsidian или дай Claude"); },
    ntretry() { NT.missing = false; NT.loaded = false; load(); render(); }
  };
  Object.assign(acts, A);
  document.addEventListener("input", e => {
    const id = e.target && e.target.id; if (id === "nt-tx") NT.tx = e.target.value;
    else if (id === "nt-q") { NT.q = e.target.value; const pos = e.target.selectionStart; render(); const x = $("nt-q"); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (er) {} } }
  });
  document.addEventListener("keydown", e => { if (e.target && e.target.id === "nt-tx" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); A.ntadd(); } });
  document.addEventListener("click", e => {
    const cv = e.target && e.target.id === "nt-cv" ? e.target : null; if (!cv || !G) return; const r = cv.getBoundingClientRect(), k = G.W / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k; let best = -1, bd = 22 * 22;
    G.nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = i; } }); G.sel = best; drawGraph(); const box = $("nt-gsel"); if (!box) return;
    if (best < 0) { box.innerHTML = ""; return; } const n = G.nodes[best];
    if (n.t === "g") box.innerHTML = '<div class="nt-card"><b>#' + esc(n.id) + '</b> · ' + n.d + ' <button class="nt-b" data-a="nttag" data-t="' + esc(n.id) + '">Показать заметки</button></div>';
    else { const m = NT.items[n.id]; box.innerHTML = m ? '<div class="nt-card"><div class="nt-tx">' + fmtText(m.text) + '</div><div class="nt-meta"><span>' + shortD(m.created_at) + '</span><span style="flex:1"></span><button class="nt-b" data-a="ntfocus" data-id="' + m.id + '">Открыть в ленте</button></div></div>' : ""; }
  });
  window.addEventListener("online", () => { flush(); });
  return { html };
};
