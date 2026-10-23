/* «Заметки» — личный раздел мыслей. Грузится после index.html, использует его глобалы (sb, S, ic, esc, $, render, toast, addTask, micToggle…). Данные только владельца (RLS). */
window.NOTES_INIT = function (X) {
  const { S, ic, esc, $, render, toast, addTask, micToggle, micOK, mtopHTML, uid, nowISO, todayISO, addDays, parseISO, pad2, WDS, goView, acts, zipStore, utf8 } = X;
  const sbg = () => X.sb(), viewg = () => X.view();
  const KEY = "mytasks_notes", KP = "mytasks_notes_p";
  const NT = { items: {}, pend: {}, loaded: false, busy: false, missing: false, q: "", tag: "", edit: null, uid: null, tx: "", mode: "feed", cl: null, focus: null, rel: {}, menu: false, sOpen: false, open: null, fresh: null, grow: null, cx: false, thumb: null, fadeIn: false };
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
  /* ---------- авто-теги ---------- */
  const aiOn = () => { try { return localStorage.getItem("mytasks_nt_ai") !== "0"; } catch (e) { return true; } };
  const allTags = () => { const c = {}; Object.values(NT.items).forEach(n => (n.tags || []).forEach(t => { c[t] = (c[t] || 0) + 1; })); return c; };
  function localTags(text) {   // существующие теги, чьи слова встречаются в тексте
    const ws = (text.toLowerCase().match(/[\p{L}]{4,}/gu) || []).map(w => stemOf(w)), out = [];
    Object.keys(allTags()).forEach(t => { const ts = t.split("_").map(w => stemOf(w)); if (ts.every(x => ws.indexOf(x) >= 0) && out.length < 3) out.push(t); });
    return out;
  }
  const union = (a, b) => { const r = (a || []).slice(); (b || []).forEach(x => { if (r.indexOf(x) < 0) r.push(x); }); return r; };
  async function aiTags(n) {
    const sb = sbg(); if (!sb || !S.user) return [];
    try { const ss = (await sb.auth.getSession()).data.session; if (!ss) return []; const ctl = new AbortController(); setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(sb.supabaseUrl + "/functions/v1/device?a=ntag", { method: "POST", signal: ctl.signal, headers: { Authorization: "Bearer " + ss.access_token, apikey: sb.supabaseKey, "content-type": "application/json" }, body: JSON.stringify({ text: n.text, tags: Object.keys(allTags()) }) });
      const j = await r.json(); return Array.isArray(j.tags) ? j.tags : []; } catch (e) { return []; }
  }
  async function autoTag(n) { const t = await aiTags(n); if (t.length && NT.items[n.id]) { n.tags = union(n.tags, t); n.updated_at = nowISO(); put(n); const el = $("nt-tx"); if (viewg() === "notes" && !NT.edit && (!el || !el.value)) render(); } return t.length; }
  const slug = t => t.toLowerCase().replace(/#[\p{L}\d_-]+/gu, "").replace(/[^\p{L}\d]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "zametka";
  const mdOf = n => { const d = new Date(n.created_at), task = n.task_id && S.tasks[n.task_id]; return "---\ndate: " + d.toISOString() + "\ntags: [" + (n.tags || []).join(", ") + "]\n" + (task ? "task: " + JSON.stringify(task.title) + (task.done ? "\ndone: true" : "") + "\n" : "") + (n.pinned ? "pinned: true\n" : "") + "---\n\n" + n.text + "\n"; };
  function dl(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  const stamp = n => { const d = new Date(n.created_at); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "-" + pad2(d.getHours()) + pad2(d.getMinutes()); };

  /* ============ ИНТЕРФЕЙС: «блокнот-поток» ============ */
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const WDF = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const anim = () => { try { return !!X.mdOk(); } catch (e) { return false; } };
  const EASE = "cubic-bezier(.2,.8,.2,1)", EASE_OUT = "cubic-bezier(.3,0,.2,1)";
  const fine = () => { try { return matchMedia("(hover:hover) and (pointer:fine)").matches; } catch (e) { return true; } };
  function growEl(el, ms, slide) {   // раскрытие по высоте (после render, на новом элементе)
    if (!el || !anim()) return; const h = el.offsetHeight; if (!h) return; el.style.overflow = "hidden";
    const a = el.animate([{ height: "0px", opacity: 0, transform: slide ? "translateY(-10px)" : "none" }, { height: h + "px", opacity: 1, transform: "none" }], { duration: ms || 260, easing: EASE });
    a.onfinish = a.oncancel = () => { el.style.overflow = ""; };
  }
  function shrinkEl(el, cb) {   // схлопывание на существующем элементе, потом cb (удаление + render)
    if (!el || !anim()) { cb(); return; } const h = el.offsetHeight; el.style.overflow = "hidden";
    const a = el.animate([{ height: h + "px", opacity: 1 }, { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px" }], { duration: 220, easing: EASE_OUT, fill: "forwards" });
    a.onfinish = a.oncancel = cb;
  }
  const dayParts = k => { const t = todayISO(), d = parseISO(k), full = d.getDate() + " " + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""); if (k === t) return ["Сегодня", WDF[d.getDay()] + ", " + full]; if (k === addDays(t, -1)) return ["Вчера", WDF[d.getDay()] + ", " + full]; return [full, WDF[d.getDay()]]; };
  const hhmm = iso => { const d = new Date(iso); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
  const hashLink = (t, cls) => '<a class="' + (cls || "nt-h") + '" data-a="nttag" data-t="' + esc(t) + '">#' + esc(t) + "</a>";
  const fmtBody = t => esc(t).replace(/(^|\s)#([\p{L}\d_-]{2,30})/gu, (m, a, b) => a + hashLink(b.toLowerCase())).replace(/\n/g, "<br>");
  const micSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const mi = (n, s) => ic(n, s || 18);
  const pinSvg = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 14v7"/></svg>';

  function autoTagsRow(n) { const inTx = tagsOf(n.text), extra = (n.tags || []).filter(t => inTx.indexOf(t) < 0); return extra.length ? '<div class="nt-tg">' + extra.map(t => hashLink(t, "nt-h2")).join("") + "</div>" : ""; }
  function relBlock(n) {
    if (!NT.rel[n.id]) return ""; const nb = engine().nb[n.id] || []; if (!nb.length) return "";
    return '<div class="nt-rel">' + nb.slice(0, 4).map(e => { const m = NT.items[e[0]]; return m ? '<a class="nt-rl" data-a="ntfocus" data-id="' + m.id + '"><i>' + shortD(m.created_at) + "</i>" + esc(m.text.replace(/\s+/g, " ").slice(0, 110)) + "</a>" : ""; }).join("") + "</div>";
  }
  function actsRow(n) {
    const task = n.task_id && S.tasks[n.task_id], rel = (engine().nb[n.id] || []).length;
    return '<div class="nt-acts">' +
      (task ? '<button class="nt-a ok" data-a="ntopentask" data-id="' + n.id + '" title="Открыть задачу">' + mi("check", 17) + "<span>" + (task.done ? "Задача сделана" : "Есть задача") + "</span></button>" : '<button class="nt-a" data-a="nttask" data-id="' + n.id + '" title="Сделать задачей">' + mi("ccheck", 17) + "<span>В задачу</span></button>") +
      (rel ? '<button class="nt-a' + (NT.rel[n.id] ? " on" : "") + '" data-a="ntrel" data-id="' + n.id + '" title="Похожие мысли">' + mi("link", 17) + "<span>Похожие " + rel + "</span></button>" : "") +
      '<button class="nt-a ico' + (n.pinned ? " on" : "") + '" data-a="ntpin" data-id="' + n.id + '" title="' + (n.pinned ? "Открепить" : "Закрепить") + '">' + pinSvg + "<span>" + (n.pinned ? "Открепить" : "Закрепить") + "</span></button>" +
      '<button class="nt-a ico" data-a="ntedit" data-id="' + n.id + '" title="Править">' + mi("pen", 17) + "<span>Править</span></button>" +
      '<button class="nt-a ico del" data-a="ntdel" data-id="' + n.id + '" title="Удалить">' + mi("trash", 17) + "<span>Удалить</span></button></div>";
  }
  function noteHTML(n) {
    const task = n.task_id && S.tasks[n.task_id], cls = "nt-n" + (n.pinned ? " pin" : "") + (task ? " task" + (task.done ? " done" : "") : "") + (NT.open === n.id ? " open" : "");
    if (NT.edit === n.id) return '<article class="nt-n edit" data-id="' + n.id + '"><time>' + hhmm(n.created_at) + '</time><div class="nt-bd"><textarea id="nt-ed" class="nt-ta" rows="3">' + esc(n.text) + '</textarea><div class="nt-er"><button class="nt-pri" data-a="ntedsave" data-id="' + n.id + '">Сохранить</button><button class="nt-ghost" data-a="ntedcancel">Отмена</button><span class="nt-hint">Ctrl+Enter — сохранить, Esc — отмена</span></div></div></article>';
    return '<article class="' + cls + '" data-id="' + n.id + '"><time>' + hhmm(n.created_at) + '</time><div class="nt-bd" data-a="ntopen" data-id="' + n.id + '"><div class="nt-tx">' + fmtBody(n.text) + "</div>" + autoTagsRow(n) + relBlock(n) + "</div>" + actsRow(n) + "</article>";
  }
  function composerHTML() {
    const tg = topTags().slice(0, 6);
    return '<div class="nt-comp' + (NT.cx || NT.tx ? " open" : "") + '" id="nt-comp"><textarea id="nt-tx" class="nt-ta" rows="1" placeholder="Что на уме?" enterkeyhint="enter">' + esc(NT.tx) + "</textarea>" +
      (micOK() ? '<button type="button" class="nt-mic' + (X.rec() ? " rec" : "") + '" data-a="ntmic" title="Надиктовать">' + micSvg + "</button>" : "") +
      '<div class="nt-tools"><div class="nt-tin">' + (tg.length ? '<div class="nt-sug">' + tg.map(t => '<a class="nt-chip s" data-a="ntins" data-t="' + esc(t[0]) + '">#' + esc(t[0]) + "</a>").join("") + "</div>" : '<span class="nt-hint">Теги — через #, подберутся и сами</span>') + '<span style="flex:1"></span>' + (fine() ? '<span class="nt-hint kb">Ctrl+Enter</span>' : "") + '<button class="nt-pri" data-a="ntadd">Записать</button></div></div></div>';
  }
  function barHTML() {
    const seg = (k, n) => '<button class="' + (NT.mode === k ? "on" : "") + '" data-a="ntmode" data-v="' + k + '">' + n + "</button>";
    return '<div class="nt-top"><div class="nt-seg" id="nt-seg"><i class="nt-thumb" id="nt-thumb"></i>' + seg("feed", "Лента") + seg("themes", "Темы") + seg("graph", "Граф") + '</div><span style="flex:1"></span>' +
      '<button class="nt-ic' + (NT.sOpen || NT.q ? " on" : "") + '" data-a="ntsearch" title="Поиск">' + mi("search", 19) + '</button><button class="nt-ic' + (NT.menu ? " on" : "") + '" data-a="ntmenu" title="Ещё">' + mi("dots", 19) + "</button>" +
      (NT.menu ? '<div class="nt-menu"><button data-a="ntai"><span>Теги от ИИ</span><b class="nt-sw' + (aiOn() ? " on" : "") + '"></b></button><button data-a="ntretag"><span>Расставить теги в старых</span></button><div class="nt-sep"></div><button data-a="ntexp" data-v="zip"><span>Экспорт: папка .md</span></button><button data-a="ntexp" data-v="one"><span>Экспорт: один файл</span></button></div>' : "") + "</div>" +
      (NT.sOpen || NT.q ? '<div class="nt-search"><input id="nt-q" placeholder="Поиск по заметкам" autocomplete="off" value="' + esc(NT.q) + '"></div>' : "");
  }
  function stripHTML() {
    const tags = topTags(); if (!tags.length && !NT.tag) return "";
    return '<div class="nt-strip">' + tags.map(t => '<a class="nt-chip' + (NT.tag === t[0] ? " on" : "") + '" data-a="nttag" data-t="' + (NT.tag === t[0] ? "" : esc(t[0])) + '">#' + esc(t[0]) + " <i>" + t[1] + "</i></a>").join("") + (NT.tag && !tags.some(t => t[0] === NT.tag) ? '<a class="nt-chip on" data-a="nttag" data-t="">#' + esc(NT.tag) + " ✕</a>" : "") + "</div>";
  }
  function returnCard() {
    const E = engine(), dis = dismissed(), now = Date.now();
    const c = E.clusters.find(c => c.notes.length >= 3 && !c.linked && !dis[c.key] && now - new Date(c.last) < 21 * 864e5); if (!c) return "";
    const dd = days(c.first, c.last);
    return '<div class="nt-ret"><div class="nt-ret-h">Ты возвращаешься к этой мысли</div><div class="nt-ret-t">' + esc(c.label) + '</div><div class="nt-ret-s">' + c.notes.length + " " + plural(c.notes.length, "заметка", "заметки", "заметок") + " за " + dd + " " + plural(dd, "день", "дня", "дней") + ", первая — " + shortD(c.first) + '. Может, пора превратить её в дело?</div><div class="nt-ret-b"><button class="nt-pri" data-a="ntcltask" data-k="' + c.key + '">В задачу</button><button class="nt-ghost" data-a="ntclshow" data-k="' + c.key + '">Показать</button><span style="flex:1"></span><button class="nt-ghost ico" data-a="ntcldis" data-k="' + c.key + '" title="Не напоминать об этой теме">Не надо</button></div></div>';
  }
  function feedHTML() {
    const items = list();
    const filt = NT.focus || NT.cl ? '<div class="nt-filt"><span>Показан отбор заметок</span><a data-a="ntclear">Показать все</a></div>' : "";
    if (!items.length) return filt + '<div class="nt-empty">' + (NT.loaded || Object.keys(NT.items).length ? (NT.q || NT.tag ? "<b>Ничего не нашлось</b><span>Попробуй другое слово или сними тег.</span>" : "<b>Пока пусто</b><span>Запиши первую мысль — хоть про то, что давно хочешь сделать.</span>") : "<b>Загружаю…</b>") + "</div>";
    let body = "", last = "";
    items.forEach(n => { const k = n.pinned ? "pin" : dayKey(n.created_at); if (k !== last) { if (last) body += "</section>"; last = k; const p = k === "pin" ? ["Закреплено", ""] : dayParts(k); body += '<section class="nt-d"><h3 class="nt-dh"><b>' + p[0] + "</b>" + (p[1] ? "<span>" + p[1] + "</span>" : "") + "</h3>"; } body += noteHTML(n); });
    return filt + body + "</section>";
  }
  function spark(c) {   // нить времени кластера: точка на каждую заметку
    const t0 = new Date(c.first).getTime(), t1 = new Date(c.last).getTime(), sp = Math.max(1, t1 - t0);
    return '<div class="nt-spark">' + c.notes.map(n => '<i style="left:' + (100 * (new Date(n.created_at).getTime() - t0) / sp).toFixed(1) + '%"></i>').join("") + "</div>";
  }
  function themesHTML() {
    const E = engine(), items = Object.values(NT.items), now = Date.now(), wk = items.filter(n => now - new Date(n.created_at) < 7 * 864e5), pw = items.filter(n => { const d = now - new Date(n.created_at); return d >= 7 * 864e5 && d < 14 * 864e5; });
    const tg = {}, ptg = {}; wk.forEach(n => (n.tags || []).forEach(t => { tg[t] = (tg[t] || 0) + 1; })); pw.forEach(n => (n.tags || []).forEach(t => { ptg[t] = (ptg[t] || 0) + 1; }));
    const grow = Object.keys(tg).filter(t => tg[t] > (ptg[t] || 0)).sort((a, b) => (tg[b] - (ptg[b] || 0)) - (tg[a] - (ptg[a] || 0))).slice(0, 3), fade = Object.keys(ptg).filter(t => !tg[t]).slice(0, 3), made = wk.filter(n => n.task_id).length;
    let h = '<div class="nt-week"><div class="nt-h1">Неделя</div><p>' + (wk.length ? "Записано <b>" + wk.length + "</b> " + plural(wk.length, "мысль", "мысли", "мыслей") + (pw.length ? ", неделей раньше — " + pw.length : "") + "." : "На этой неделе пока тихо.") + (made ? " <b>" + made + "</b> уже " + plural(made, "стала задачей", "стали задачами", "стали задачами") + "." : "") + "</p>" +
      (grow.length ? "<p>Растёт: " + grow.map(t => hashLink(t)).join(" ") + "</p>" : "") + (fade.length ? "<p>Затихло: " + fade.map(t => hashLink(t)).join(" ") + "</p>" : "") + "</div>";
    h += '<div class="nt-h1">Связанные мысли</div>';
    if (!E.clusters.length) h += '<div class="nt-empty sm"><span>Пока нет повторяющихся тем. Пиши — они проявятся сами.</span></div>';
    E.clusters.slice(0, 20).forEach(c => { h += '<div class="nt-th"><div class="nt-th-t">' + esc(c.label) + "</div>" + spark(c) + '<div class="nt-th-m">' + c.notes.length + " " + plural(c.notes.length, "заметка", "заметки", "заметок") + " · " + shortD(c.first) + " → " + shortD(c.last) + (c.linked ? " · есть задача" : "") + '</div><div class="nt-th-b">' + (c.linked ? "" : '<button class="nt-a" data-a="ntcltask" data-k="' + c.key + '">' + mi("ccheck", 17) + "<span>В задачу</span></button>") + '<button class="nt-a" data-a="ntclshow" data-k="' + c.key + '"><span>Показать заметки</span></button></div></div>'; });
    const all = allTags(), tl = Object.entries(all).sort((a, b) => b[1] - a[1]);
    h += '<div class="nt-h1">Теги</div><div class="nt-tagcloud">' + (tl.length ? tl.map(t => '<a class="nt-chip" data-a="nttag" data-t="' + esc(t[0]) + '">#' + esc(t[0]) + " <i>" + t[1] + "</i></a>").join("") : '<span class="nt-hint">Добавляй #теги в текст — они соберутся здесь.</span>') + "</div>";
    return h;
  }

  /* ---------- граф: узлы «оседают» на глазах ---------- */
  let G = null, GRAF = 0;
  function buildGraph() {
    const E = engine(), notes = Object.values(NT.items).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 140), ids = new Set(notes.map(n => n.id)), nodes = [], idx = {}, links = [];
    const R = 60, ang = i => i * 2.399963;
    notes.forEach(n => { const i = nodes.length; idx[n.id] = i; nodes.push({ t: "n", id: n.id, x: Math.cos(ang(i)) * R * Math.sqrt(i + 1) * 0.4, y: Math.sin(ang(i)) * R * Math.sqrt(i + 1) * 0.4, vx: 0, vy: 0, d: 0 }); });
    const tc = {}; notes.forEach(n => (n.tags || []).forEach(t => { tc[t] = (tc[t] || 0) + 1; }));
    Object.keys(tc).slice(0, 40).forEach(t => { const i = nodes.length; idx["#" + t] = i; nodes.push({ t: "g", id: t, x: Math.cos(ang(i)) * R * 0.5, y: Math.sin(ang(i)) * R * 0.5, vx: 0, vy: 0, d: tc[t] }); });
    notes.forEach(n => (n.tags || []).forEach(t => { if (idx["#" + t] != null) { links.push([idx[n.id], idx["#" + t], 1]); nodes[idx[n.id]].d++; } }));
    E.edges.forEach(e => { if (ids.has(e[0]) && ids.has(e[1])) { links.push([idx[e[0]], idx[e[1]], 0.6]); nodes[idx[e[0]]].d++; nodes[idx[e[1]]].d++; } });
    G = { nodes, links, step: 0, sel: -1, sc: 1, ox: 0, oy: 0, W: 700, H: 440 };
  }
  function stepGraph(n) {
    const nodes = G.nodes, links = G.links;
    for (let s = 0; s < n && G.step < 280; s++, G.step++) {
      const k = Math.max(0.04, 1 - G.step / 280);
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01; if (d2 > 40000) continue; const f = 900 / d2, d = Math.sqrt(d2); dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; }
      links.forEach(l => { const a = nodes[l[0]], b = nodes[l[1]]; let dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - 55) * 0.02 * l[2]; dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; });
      nodes.forEach(nd => { nd.vx -= nd.x * 0.004; nd.vy -= nd.y * 0.004; nd.x += Math.max(-8, Math.min(8, nd.vx)) * k; nd.y += Math.max(-8, Math.min(8, nd.vy)) * k; nd.vx *= 0.6; nd.vy *= 0.6; });
    }
  }
  function fitGraph(snap) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; G.nodes.forEach(n => { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
    const sc = Math.min((G.W - 90) / Math.max(1, x1 - x0), (G.H - 70) / Math.max(1, y1 - y0), 2.2), ox = G.W / 2 - (x0 + x1) / 2 * sc, oy = G.H / 2 - (y0 + y1) / 2 * sc, e = snap ? 1 : 0.18;
    G.sc += (sc - G.sc) * e; G.ox += (ox - G.ox) * e; G.oy += (oy - G.oy) * e;
  }
  function drawGraph() {
    const cv = $("nt-cv"); if (!cv || !G) return false; const r = window.devicePixelRatio || 1, wcss = G.W, hcss = G.H;
    if (cv.width !== Math.round(wcss * r) || cv.height !== Math.round(hcss * r)) { cv.width = Math.round(wcss * r); cv.height = Math.round(hcss * r); cv.style.height = hcss + "px"; }
    const c = cv.getContext("2d"), k = r, cs = getComputedStyle(cv), ink = cs.color, acc = (getComputedStyle($("app")).getPropertyValue("--acc") || "#2b88d8").trim() || "#2b88d8";
    c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, G.W, G.H);
    const P = n => [n.x * G.sc + G.ox, n.y * G.sc + G.oy];
    G.links.forEach(l => { const a = P(G.nodes[l[0]]), b = P(G.nodes[l[1]]), hi = G.sel >= 0 && (l[0] === G.sel || l[1] === G.sel); c.globalAlpha = hi ? 0.9 : 0.22; c.strokeStyle = hi ? acc : ink; c.lineWidth = hi ? 1.6 : 1; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); });
    G.nodes.forEach((n, i) => { const p = P(n), rad = n.t === "g" ? 6 + Math.min(10, n.d * 1.4) : 4 + Math.min(6, n.d * 0.8); n.p = p; n.r = rad; c.beginPath(); c.arc(p[0], p[1], rad, 0, 7); c.fillStyle = n.t === "g" ? "#e3680c" : (NT.items[n.id] && NT.items[n.id].task_id ? "#2f9e44" : acc); c.globalAlpha = G.sel >= 0 && i !== G.sel ? 0.5 : 1; c.fill(); if (i === G.sel) { c.globalAlpha = 1; c.strokeStyle = ink; c.lineWidth = 2; c.stroke(); } });
    c.globalAlpha = 1; c.font = "600 12.5px system-ui,sans-serif"; c.fillStyle = ink; G.nodes.forEach(n => { if (n.t === "g") c.fillText("#" + n.id, n.p[0] + n.r + 4, n.p[1] + 4); });
    return true;
  }
  function sizeGraph() { const cv = $("nt-cv"); if (!cv || !G) return; const w = Math.max(280, cv.parentNode.clientWidth || cv.clientWidth || 700); G.W = w; G.H = w < 600 ? Math.round(w * 1.15) : Math.round(w * 0.58); }
  function runGraph() {
    const my = ++GRAF; if (!G) return; sizeGraph(); if (!anim()) { stepGraph(280); fitGraph(true); drawGraph(); return; }
    fitGraph(true); const tick = () => { if (my !== GRAF || !$("nt-cv")) return; stepGraph(3); fitGraph(false); drawGraph(); if (G.step < 280 || Math.abs(G.sc) < 0.01) requestAnimationFrame(tick); else { fitGraph(true); drawGraph(); } }; requestAnimationFrame(tick);
  }
  function graphHTML() {
    if (Object.keys(NT.items).length < 2) return '<div class="nt-empty"><b>Граф появится позже</b><span>Когда будет хотя бы пара заметок.</span></div>';
    buildGraph();
    return '<div class="nt-gw"><canvas id="nt-cv"></canvas></div><div class="nt-legend"><i style="background:#e3680c"></i>теги<i style="background:var(--acc)"></i>заметки<i style="background:#2f9e44"></i>стали задачей<span>Тапни по точке</span></div><div id="nt-gsel"></div>';
  }

  /* ---------- сборка экрана ---------- */
  function html(vi) {
    boot(); if (!NT.loaded && !NT.busy) setTimeout(load, 0);
    const head = '<div id="main" class="pane" style="flex:1">' + mtopHTML(vi, 1, "");
    if (NT.missing) return head + '<div class="scroll" id="list"><div class="nt"><div class="nt-sheet"><div class="nt-empty"><b>Нужна настройка базы</b><span>Выполни <code>migration_v28.sql</code> в Supabase → SQL Editor, потом нажми «Проверить».</span><button class="nt-pri" data-a="ntretry">Проверить</button></div></div></div></div></div>';
    let content = NT.mode === "themes" ? themesHTML() : NT.mode === "graph" ? graphHTML() : returnCard() + stripHTML() + feedHTML();
    const main = head + '<div class="scroll" id="list"><div class="nt"><div class="nt-sheet"><div class="nt-title"><h1>Заметки</h1><span>только для тебя</span></div>' + barHTML() + (NT.mode === "feed" ? composerHTML() : "") + '<div class="nt-view' + (NT.fadeIn ? " in" : "") + '" id="nt-view">' + content + "</div></div></div></div></div>";
    Promise.resolve().then(after);
    return main;
  }
  function placeThumb() {
    const seg = $("nt-seg"), th = $("nt-thumb"); if (!seg || !th) return; const b = seg.querySelector("button.on"); if (!b) return;
    const x = b.offsetLeft, w = b.offsetWidth; th.style.width = w + "px"; th.style.transform = "translateX(" + x + "px)";
    if (NT.thumb && NT.thumb.x !== x && anim()) th.animate([{ transform: "translateX(" + NT.thumb.x + "px)", width: NT.thumb.w + "px" }, { transform: "translateX(" + x + "px)", width: w + "px" }], { duration: 280, easing: EASE });
    NT.thumb = { x, w };
  }
  function autosize(el) { if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight + 2, Math.round(innerHeight * 0.45)) + "px"; }
  function after() {
    placeThumb(); autosize($("nt-tx")); autosize($("nt-ed"));
    if (NT.mode === "graph") runGraph();
    if (NT.fresh) { const el = document.querySelector('.nt-n[data-id="' + NT.fresh + '"]'); NT.fresh = null; growEl(el, 380, true); }
    if (NT.grow) { const el = document.querySelector('.nt-n[data-id="' + NT.grow + '"] .nt-acts'); NT.grow = null; growEl(el, 200); }
    NT.fadeIn = false; NT.slide = null;
  }
  const rerenderKeep = () => { const sc = $("list"), y = sc ? sc.scrollTop : 0; render(); const s2 = $("list"); if (s2) s2.scrollTop = y; };

  const closeMenu = () => { NT.menu = false; };
  const A = {
    ntadd() { const el = $("nt-tx"), t = (el ? el.value : NT.tx).trim(); if (!t) { toast("Пусто — напиши хоть слово"); return; } boot(); const now = nowISO(), own = tagsOf(t), nn = { id: uid(), text: t, tags: own.length ? own : localTags(t), task_id: null, pinned: false, created_at: now, updated_at: now }; put(nn, "u"); if (!own.length && aiOn()) autoTag(nn); NT.tx = ""; NT.fresh = nn.id; NT.q = ""; NT.tag = ""; NT.focus = null; NT.cl = null; render(); setTimeout(() => { const x = $("nt-tx"); if (x) x.focus(); }, 0); },
    ntmic() { micToggle("nt-tx"); },
    ntins(a) { const el = $("nt-tx"); if (!el) return; const tag = "#" + a.dataset.t + " ", p = el.selectionStart == null ? el.value.length : el.selectionStart, b = el.value.slice(0, p), pre = b && !/\s$/.test(b) ? " " : ""; el.value = b + pre + tag + el.value.slice(el.selectionEnd == null ? p : el.selectionEnd); NT.tx = el.value; const q = (b + pre + tag).length; el.focus(); el.setSelectionRange(q, q); autosize(el); },
    nttag(a) { NT.tag = a.dataset.t || ""; NT.mode = "feed"; NT.focus = null; NT.cl = null; closeMenu(); render(); },
    ntpin(a) { const n = NT.items[a.dataset.id]; if (!n) return; n.pinned = !n.pinned; put(n); rerenderKeep(); },
    ntopen(a) { if (fine() || NT.edit) return; const id = a.dataset.id; NT.open = NT.open === id ? null : id; if (NT.open) NT.grow = id; rerenderKeep(); },
    ntedit(a) { NT.edit = a.dataset.id; NT.open = null; render(); setTimeout(() => { const x = $("nt-ed"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0); },
    ntedcancel() { NT.edit = null; rerenderKeep(); },
    ntedsave(a) { const n = NT.items[a.dataset.id], x = $("nt-ed"); if (!n || !x) return; const t = x.value.trim(); if (!t) { toast("Пусто — чтобы убрать заметку, нажми «Удалить»"); return; } const oldIn = tagsOf(n.text), keep = (n.tags || []).filter(z => oldIn.indexOf(z) < 0); n.text = t; n.tags = union(tagsOf(t), keep); n.updated_at = nowISO(); NT.edit = null; put(n); rerenderKeep(); },
    ntdel(a) { const id = a.dataset.id, n = NT.items[id]; if (!n) return; const el = document.querySelector('.nt-n[data-id="' + id + '"]'); shrinkEl(el, () => { delete NT.items[id]; NT.pend[id] = "d"; save(); NT.open = null; rerenderKeep(); toast("Заметка удалена", { buttons: [["Вернуть", () => { NT.items[id] = n; NT.pend[id] = "u"; save(); flush(); NT.fresh = id; rerenderKeep(); }]] }); setTimeout(() => { if (NT.pend[id] === "d") flush(); }, 6500); }); },
    nttask(a) { const n = NT.items[a.dataset.id]; if (!n || n.task_id) return; const lines = n.text.split("\n"), title = lines[0].replace(/#[\p{L}\d_-]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 120) || "Из заметки", rest = lines.slice(1).join("\n").trim(); const t = addTask({ title, note: rest }); n.task_id = t.id; put(n); rerenderKeep(); toast("Задача создана", { buttons: [["Открыть", () => { goView("all"); X.sel(t.id); render(); }]] }); },
    ntopentask(a) { const n = NT.items[a.dataset.id]; if (!n || !n.task_id || !S.tasks[n.task_id]) return; goView("all"); X.sel(n.task_id); render(); },
    ntrel(a) { NT.rel[a.dataset.id] = !NT.rel[a.dataset.id]; NT.grow = null; rerenderKeep(); },
    ntfocus(a) { NT.focus = a.dataset.id; NT.cl = null; NT.q = ""; NT.tag = ""; NT.mode = "feed"; NT.fadeIn = true; render(); const sc = $("list"); if (sc) sc.scrollTop = 0; },
    ntclear() { NT.focus = null; NT.cl = null; render(); },
    ntclshow(a) { const c = engine().clusters.find(x => x.key === a.dataset.k); if (!c) return; NT.cl = c.notes.map(n => n.id); NT.focus = null; NT.tag = ""; NT.q = ""; NT.mode = "feed"; NT.fadeIn = true; render(); const sc = $("list"); if (sc) sc.scrollTop = 0; },
    ntcldis(a) { const d = dismissed(); d[a.dataset.k] = 1; js("mytasks_notes_dis", d); rerenderKeep(); },
    ntcltask(a) { const c = engine().clusters.find(x => x.key === a.dataset.k); if (!c) return; const t = addTask({ title: "Заняться: " + c.label, note: c.notes.map(n => "• " + n.text.replace(/\s+/g, " ").slice(0, 160)).join("\n") }); c.notes.forEach(n => { n.task_id = t.id; put(n); }); rerenderKeep(); toast("Задача создана из " + c.notes.length + " заметок", { buttons: [["Открыть", () => { goView("all"); X.sel(t.id); render(); }]] }); },
    ntmode(a) { const m = a.dataset.v; if (m === NT.mode) return; NT.mode = m; NT.focus = null; NT.cl = null; NT.open = null; NT.edit = null; NT.fadeIn = true; closeMenu(); render(); const sc = $("list"); if (sc) sc.scrollTop = 0; },
    ntsearch() { if (NT.sOpen && !NT.q) { NT.sOpen = false; render(); return; } NT.sOpen = true; NT.mode = "feed"; render(); setTimeout(() => { const x = $("nt-q"); if (x) x.focus(); }, 0); },
    ntmenu() { NT.menu = !NT.menu; rerenderKeep(); },
    ntai() { try { localStorage.setItem("mytasks_nt_ai", aiOn() ? "0" : "1"); } catch (e) {} toast(aiOn() ? "ИИ-теги включены: текст новой заметки уходит ИИ только для подбора тегов" : "ИИ-теги выключены: остаются совпадения со старыми тегами"); rerenderKeep(); },
    async ntretag() { closeMenu(); const todo = Object.values(NT.items).filter(n => !(n.tags || []).length).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40); render(); if (!todo.length) { toast("Во всех заметках уже есть теги"); return; } toast("Размечаю " + todo.length + " заметок…"); let k = 0; for (const n of todo) { const l = localTags(n.text); if (l.length) { n.tags = l; put(n); k++; } else if (await autoTag(n)) k++; } rerenderKeep(); toast("Теги проставлены: " + k + " из " + todo.length); },
    ntexp(a) { closeMenu(); render(); const all = Object.values(NT.items).sort((x, y) => x.created_at.localeCompare(y.created_at)); if (!all.length) { toast("Пока нечего выгружать"); return; }
      if (a.dataset.v === "one") { dl(new Blob([all.map(n => "## " + new Date(n.created_at).toLocaleString("ru-RU") + ((n.tags || []).length ? "  " + n.tags.map(t => "#" + t).join(" ") : "") + "\n\n" + n.text + "\n").join("\n---\n\n")], { type: "text/markdown" }), "zametki.md"); toast("Выгружено заметок: " + all.length); return; }
      const used = {}, files = all.map(n => { let nm = stamp(n) + "-" + slug(n.text); if (used[nm]) nm += "-" + (++used[nm]); else used[nm] = 1; return { name: "zametki/" + nm + ".md", data: utf8(mdOf(n)) }; });
      dl(new Blob([zipStore(files)], { type: "application/zip" }), "zametki.zip"); toast("Папка .md: " + all.length + " файлов — открой в Obsidian или дай Claude"); },
    ntretry() { NT.missing = false; NT.loaded = false; load(); render(); }
  };
  Object.assign(acts, A);

  let qT = 0;
  document.addEventListener("input", e => {
    const id = e.target && e.target.id;
    if (id === "nt-tx") { NT.tx = e.target.value; autosize(e.target); }
    else if (id === "nt-ed") autosize(e.target);
    else if (id === "nt-q") { NT.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => { const el = $("nt-q"), pos = el ? el.selectionStart : 0; rerenderKeep(); const x = $("nt-q"); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (er) {} } }, 140); }
  });
  document.addEventListener("keydown", e => {
    const id = e.target && e.target.id;
    if (id === "nt-tx") { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); A.ntadd(); } else if (e.key === "Escape") e.target.blur(); }
    else if (id === "nt-ed") { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const b = document.querySelector('[data-a="ntedsave"]'); if (b) A.ntedsave(b); } else if (e.key === "Escape") A.ntedcancel(); }
    else if (id === "nt-q" && e.key === "Escape") { NT.q = ""; NT.sOpen = false; render(); }
  });
  document.addEventListener("focusin", e => { if (e.target && e.target.id === "nt-tx") { NT.cx = true; const c = $("nt-comp"); if (c) c.classList.add("open"); } });
  document.addEventListener("focusout", e => { if (!e.target || e.target.id !== "nt-tx") return; setTimeout(() => { const c = $("nt-comp"), ta = $("nt-tx"); if (c && !c.contains(document.activeElement) && !(ta && ta.value.trim())) { c.classList.remove("open"); NT.cx = false; } }, 140); });
  document.addEventListener("mousedown", e => { const t = e.target && e.target.closest && e.target.closest("#nt-comp .nt-chip, #nt-comp .nt-mic, #nt-comp .nt-pri"); if (t) e.preventDefault(); });
  document.addEventListener("dblclick", e => { if (!fine()) return; const b = e.target && e.target.closest && e.target.closest(".nt-bd[data-id]"); if (b && !e.target.closest("a")) { window.getSelection && window.getSelection().removeAllRanges(); A.ntedit({ dataset: { id: b.dataset.id } }); } });
  document.addEventListener("click", e => {
    if (NT.menu && !(e.target.closest && e.target.closest(".nt-menu, [data-a=ntmenu]"))) { NT.menu = false; const m = document.querySelector(".nt-menu"); if (m) m.remove(); const bb = document.querySelector("[data-a=ntmenu]"); if (bb) bb.classList.remove("on"); }
    const cv = e.target && e.target.id === "nt-cv" ? e.target : null; if (!cv || !G) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = -1, bd = 24 * 24;
    G.nodes.forEach((n, i) => { if (!n.p) return; const d = (n.p[0] - x) ** 2 + (n.p[1] - y) ** 2; if (d < bd) { bd = d; best = i; } }); G.sel = best; drawGraph(); const box = $("nt-gsel"); if (!box) return;
    if (best < 0) { box.innerHTML = ""; return; } const n = G.nodes[best];
    if (n.t === "g") box.innerHTML = '<div class="nt-gcard"><div class="nt-tx">' + hashLink(n.id) + " · " + n.d + " " + plural(n.d, "заметка", "заметки", "заметок") + '</div><div class="nt-acts show"><button class="nt-a" data-a="nttag" data-t="' + esc(n.id) + '"><span>Показать заметки</span></button></div></div>';
    else { const m = NT.items[n.id]; box.innerHTML = m ? '<div class="nt-gcard"><div class="nt-meta">' + dayParts(dayKey(m.created_at))[0] + ", " + hhmm(m.created_at) + '</div><div class="nt-tx">' + fmtBody(m.text) + '</div><div class="nt-acts show"><button class="nt-a" data-a="ntfocus" data-id="' + m.id + '"><span>Открыть в ленте</span></button></div></div>' : ""; }
  });
  window.addEventListener("online", () => { flush(); });
  window.addEventListener("resize", () => { if (G && $("nt-cv")) { sizeGraph(); fitGraph(true); drawGraph(); } });
  return { html };
};
