/* «Здоровье» — личный дневник: симптомы, лекарства, болезни, визиты, самочувствие. Грузится лениво (только при открытии раздела), своих зависимостей нет.
   Таблица health_log (migration_v29.sql, RLS только владелец). Локальный кэш + очередь отправки, как у «Заметок». Не диагноз — только подсказки «стоит показать врачу». */
window.HEALTH_INIT = function (X) {
  const { S, ic, esc, $, render, toast, mtopHTML, uid, todayISO, addDays, parseISO, pad2, WDS, acts } = X;
  const sbg = () => X.sb(), viewg = () => X.view(), anim = () => { try { return !!X.mdOk(); } catch (e) { return false; } };
  const KEY = "mytasks_health", KP = "mytasks_health_p";
  const H = { items: {}, pend: {}, loaded: false, busy: false, missing: false, uid: null, tab: "feed", flt: null, form: null, open: null, per: 90, fresh: null };
  const jg = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const js = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const save = () => { if (H.uid) { js(KEY, { u: H.uid, items: H.items }); js(KP, H.pend); } };
  const K = {
    sym: { e: "🤒", n: "Симптом", c: "#ff6b6b" }, med: { e: "💊", n: "Лекарство", c: "#14b8a6" }, ill: { e: "🦠", n: "Болезнь", c: "#8b5cf6" },
    doc: { e: "🩺", n: "Врач", c: "#3b82f6" }, test: { e: "🧪", n: "Анализ", c: "#f59e0b" }, mood: { e: "🙂", n: "Самочувствие", c: "#22c55e" }, bp: { e: "🫀", n: "Давление и пульс", c: "#ef4444" }, sleep: { e: "😴", n: "Сон", c: "#6366f1" }
  };
  const FACES = ["😖", "😕", "😐", "🙂", "😄"], FCOL = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"], SEVN = ["слабо", "терпимо", "заметно", "сильно", "очень сильно"];
  const SUG = {
    sym: ["голова", "горло", "температура", "насморк", "кашель", "живот", "спина", "слабость", "тошнота", "давление"],
    ill: ["Простуда", "ОРВИ", "Грипп", "Аллергия", "Отравление"], doc: ["Терапевт", "Невролог", "Стоматолог", "ЛОР", "Окулист"],
    test: ["Общий анализ крови", "Биохимия", "Витамин D", "ЭКГ", "Флюорография"], med: []
  };

  /* ---------- данные ---------- */
  function boot() {
    if (!S.user || H.uid === S.user.id) return;
    H.uid = S.user.id; const c = jg(KEY, null); H.items = c && c.u === H.uid ? c.items || {} : {}; H.pend = jg(KP, {}); H.loaded = false; H.missing = false;
  }
  async function flush() {
    if (!sbg() || !S.user || H.missing) return; const ids = Object.keys(H.pend); if (!ids.length) return;
    for (const id of ids) {
      const op = H.pend[id], n = H.items[id];
      try {
        let r;
        if (op === "d") r = await sbg().from("health_log").delete().eq("id", id);
        else if (n) r = await sbg().from("health_log").upsert({ id: n.id, user_id: S.user.id, kind: n.kind, name: n.name || "", note: n.note || null, sev: n.sev || null, at: n.at, until: n.until || null, ep_id: n.ep || null });
        else { delete H.pend[id]; continue; }
        if (r.error) { if (/relation|does not exist|schema cache/i.test(r.error.message || "")) H.missing = true; break; }
        delete H.pend[id];
      } catch (e) { break; }
    }
    save();
  }
  async function load() {
    boot(); if (H.busy || !sbg() || !S.user) return; H.busy = true;
    try {
      await flush();
      const r = await sbg().from("health_log").select("*").order("at", { ascending: false }).limit(3000);
      if (r.error) { if (/relation|does not exist|schema cache/i.test(r.error.message || "")) H.missing = true; }
      else {
        H.missing = false; const m = {}; r.data.forEach(n => { m[n.id] = { id: n.id, kind: n.kind, name: n.name, note: n.note, sev: n.sev, at: n.at, until: n.until, ep: n.ep_id }; });
        Object.keys(H.pend).forEach(id => { if (H.pend[id] === "u" && H.items[id]) m[id] = H.items[id]; if (H.pend[id] === "d") delete m[id]; });
        H.items = m; H.loaded = true; save();
      }
    } catch (e) {}
    H.busy = false; if (viewg() === "health") render();
  }
  function put(n, op) { H.items[n.id] = n; H.pend[n.id] = op || "u"; save(); flush(); }
  function del(id) { delete H.items[id]; H.pend[id] = "d"; Object.values(H.items).forEach(x => { if (x.ep === id) { x.ep = null; H.pend[x.id] = "u"; } }); save(); flush(); }

  /* ---------- помощники ---------- */
  const dayKey = iso => { const d = new Date(iso); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
  const hhmm = iso => { const d = new Date(iso); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const dayLabel = k => { const t = todayISO(); if (k === t) return "Сегодня"; if (k === addDays(t, -1)) return "Вчера"; const d = parseISO(k); return WDS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()]; };
  const shortD = k => { const d = parseISO(k); return d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) + (MONTHS[d.getMonth()].length > 3 ? "" : ""); };
  const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return m > 10 && m < 15 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
  const norm = s => String(s || "").trim().toLowerCase();
  const all = () => Object.values(H.items).sort((a, b) => b.at.localeCompare(a.at));
  const active = () => all().filter(n => n.kind === "ill" && !n.until).sort((a, b) => b.at.localeCompare(a.at));
  const localNow = () => { const d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
  const toISO = local => { const d = new Date(local); return isNaN(d) ? new Date().toISOString() : d.toISOString(); };
  const toLocal = iso => { const d = new Date(iso); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
  const recent = (kind, n) => { const c = {}; all().filter(x => x.kind === kind).forEach(x => { const k = norm(x.name); if (k) c[k] = c[k] || { name: x.name, n: 0 }, c[k].n++; }); return Object.values(c).sort((a, b) => b.n - a.n).slice(0, n).map(x => x.name); };

  /* ---------- аналитика: закономерности ---------- */
  function stats(days) {
    const t = todayISO(), from = addDays(t, -days + 1), items = all().filter(n => dayKey(n.at) >= from);
    const sym = {}, med = {}; const symDays = new Set(), medDays = new Set();
    items.forEach(n => {
      const k = norm(n.name);
      if (n.kind === "sym") { symDays.add(dayKey(n.at)); const o = sym[k] || (sym[k] = { name: n.name, n: 0, days: new Set(), max: 0 }); o.n++; o.days.add(dayKey(n.at)); o.max = Math.max(o.max, n.sev || 0); }
      if (n.kind === "med") { medDays.add(dayKey(n.at)); const o = med[k] || (med[k] = { name: n.name, n: 0, days: new Set() }); o.n++; o.days.add(dayKey(n.at)); }
    });
    return { items, sym, med, symDays: symDays.size, medDays: medDays.size, from };
  }
  function insights() {
    const out = [], t = todayISO(), s30 = stats(30), s7 = stats(7), prev = stats(60), cut = addDays(t, -30);
    active().forEach(a => { const d = daysBetween(dayKey(a.at), t) + 1; if (d > 10) out.push({ e: "⏳", c: "#8b5cf6", t: a.name + " длится уже " + d + " " + plural(d, "день", "дня", "дней"), x: "Обычно ОРВИ проходит за 7–10 дней. Если нет улучшения — стоит показаться врачу.", f: { ep: a.id } }); });
    Object.values(s30.sym).sort((a, b) => b.n - a.n).forEach(o => {
      const k = norm(o.name), before = Object.values(prev.sym).find(x => norm(x.name) === k), pr = before ? before.n - o.n : 0;
      const recentN = s7.sym[k] ? s7.sym[k].days.size : 0;
      if (o.days.size >= 4) out.push({ e: "🔁", c: "#ff6b6b", t: "«" + o.name + "» повторяется: " + o.days.size + " " + plural(o.days.size, "день", "дня", "дней") + " за месяц", x: pr > 0 && pr < o.n ? "Чаще, чем в прошлом месяце." : "Если это регулярно — полезно обсудить с врачом.", f: { name: k } });
      else if (recentN >= 3) out.push({ e: "📈", c: "#ff6b6b", t: "«" + o.name + "» — " + recentN + " " + plural(recentN, "день", "дня", "дней") + " за неделю", x: "Следи, не нарастает ли.", f: { name: k } });
      if (o.max >= 4) out.push({ e: "⚠️", c: "#ef4444", t: "Сильный симптом: «" + o.name + "»", x: "Оценка: «" + SEVN[o.max - 1] + "». Если повторяется или не проходит — к врачу.", f: { name: k } });
    });
    Object.values(stats(14).med).forEach(o => { if (o.days.size >= 5) out.push({ e: "💊", c: "#14b8a6", t: "«" + o.name + "» — " + o.days.size + " " + plural(o.days.size, "день", "дня", "дней") + " из 14", x: "Долгий приём «от симптома» — повод выяснить причину.", f: { name: norm(o.name) } }); });
    const seen = new Set(); return out.filter(i => { const k = i.t; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  }
  function dayScore() {   // для тепловой карты
    const m = {}; all().forEach(n => { const d = dayKey(n.at); const o = m[d] || (m[d] = { s: 0, med: 0, doc: 0, mood: 0, n: 0 }); o.n++; if (n.kind === "sym") o.s = Math.max(o.s, n.sev || 2); if (n.kind === "med") o.med++; if (n.kind === "doc" || n.kind === "test") o.doc++; if (n.kind === "mood") o.mood = n.sev; });
    return m;
  }
  function illDays() { const s = new Set(); all().filter(n => n.kind === "ill").forEach(n => { const a = dayKey(n.at), b = n.until ? dayKey(n.until) : todayISO(); for (let d = a, i = 0; d <= b && i < 400; d = addDays(d, 1), i++) s.add(d); }); return s; }

  /* ---------- экран ---------- */
  const dots = n => '<span class="hl-sv">' + [1, 2, 3, 4, 5].map(i => '<i class="' + (i <= n ? "on" : "") + '"></i>').join("") + "</span>";
  function hero() {
    const hr = new Date().getHours(), greet = hr < 5 ? "Доброй ночи" : hr < 12 ? "Доброе утро" : hr < 18 ? "Добрый день" : "Добрый вечер", today = todayISO();
    const mood = all().find(n => n.kind === "mood" && dayKey(n.at) === today), act = active();
    const bp = all().find(n => n.kind === "bp" && dayKey(n.at) === today), sl = all().find(n => n.kind === "sleep" && dayKey(n.at) === today), pm = bp ? /^(\d+)\/(\d+)(?:\D+(\d+))?/.exec(bp.name) : null;
    const faces = '<div class="hl-vit"><div class="hl-vc"><b>🫀 Давление и пульс</b><div class="hl-vr"><input id="hl-bs" type="number" inputmode="numeric" placeholder="верх" value="' + (pm ? pm[1] : "") + '"><span>/</span><input id="hl-bd" type="number" inputmode="numeric" placeholder="низ" value="' + (pm ? pm[2] : "") + '"><input id="hl-bpl" type="number" inputmode="numeric" placeholder="пульс" value="' + (pm && pm[3] ? pm[3] : "") + '"><button data-a="hlbp">OK</button></div></div>' +
      '<div class="hl-vc"><b>😴 Сон (часов)</b><div class="hl-vr"><input id="hl-sl" type="number" step="0.5" inputmode="decimal" placeholder="7.5" value="' + (sl ? esc(sl.name) : "") + '"><button data-a="hlsleep">OK</button></div></div></div>';
    const ill = act.map(a => { const d = daysBetween(dayKey(a.at), today) + 1; return '<div class="hl-ill"><span class="hl-pul"></span><div><b>' + esc(a.name) + "</b><small>день " + d + " · с " + shortD(dayKey(a.at)) + '</small></div><button class="hl-sm" data-a="hlcure" data-id="' + a.id + '">Выздоровел 🎉</button></div>'; }).join("");
    return '<div class="hl-hero"><i class="b1"></i><i class="b2"></i><i class="b3"></i><div class="hl-hi">' + greet + '</div><h2>Замеры сегодня</h2><div class="hl-faces">' + faces + "</div>" + (bp || sl ? '<div class="hl-ms">записано: ' + [bp && ("давление " + esc(bp.name)), sl && ("сон " + esc(sl.name) + " ч")].filter(Boolean).join(" · ") + "</div>" : '<div class="hl-ms">Давление и пульс — утром после пробуждения, раз в 1–3 дня или при самочувствии «не то»; сон — по утрам.</div>') + ill + "</div>";
  }
  function tiles() {
    const s = stats(30), itm = s.items.filter(n => n.kind !== "mood" && n.kind !== "bp" && n.kind !== "sleep").length;
    const t = (n, l, c) => '<div class="hl-t" style="--c:' + c + '"><b>' + n + "</b><span>" + l + "</span></div>";
    return '<div class="hl-tiles">' + t(itm, "записей за 30 дней", "#3b82f6") + t(s.symDays, plural(s.symDays, "день", "дня", "дней") + " с симптомами", "#ff6b6b") + t(s.medDays, plural(s.medDays, "день", "дня", "дней") + " с лекарствами", "#14b8a6") + "</div>";
  }
  function seg() { return '<div class="hl-seg">' + [["feed", "Лента"], ["map", "Обзор"], ["doc", "Врачу"]].map(x => '<button class="' + (H.tab === x[0] ? "on" : "") + '" data-a="hltab" data-v="' + x[0] + '">' + x[1] + "</button>").join("") + "</div>"; }
  function entry(n) {
    const k = K[n.kind] || K.sym, ep = n.ep && H.items[n.ep], isOpen = H.open === n.id, fresh = H.fresh === n.id;
    let title = esc(n.name || k.n), meta = hhmm(n.at);
    if (n.kind === "bp") { const m = /^(\d+)\/(\d+)(?:\D+(\d+))?/.exec(n.name || ""); title = "Давление " + (m ? m[1] + "/" + m[2] : esc(n.name)) + (m && m[3] ? " · пульс " + m[3] : ""); }
    if (n.kind === "sleep") title = "Сон " + esc(n.name) + " ч";
    if (n.kind === "mood") { title = FACES[(n.sev || 3) - 1] + " Самочувствие: " + SEVN[(n.sev || 3) - 1]; }
    if (n.kind === "ill") { const a = dayKey(n.at), b = n.until ? dayKey(n.until) : todayISO(), d = daysBetween(a, b) + 1; meta = n.until ? "прошла за " + d + " " + plural(d, "день", "дня", "дней") + " · до " + shortD(b) : "идёт " + d + "-й день"; }
    if (ep) meta += " · " + esc(ep.name);
    return '<div class="hl-e' + (isOpen ? " open" : "") + (fresh ? " fresh" : "") + '" style="--c:' + (n.kind === "mood" ? FCOL[(n.sev || 3) - 1] : k.c) + '" data-id="' + n.id + '"><div class="hl-ed" data-a="hlopen" data-id="' + n.id + '"><div class="hl-dot">' + (n.kind === "mood" ? FACES[(n.sev || 3) - 1] : k.e) + '</div><div class="hl-eb"><div class="hl-et"><b>' + title + "</b>" + (n.kind === "sym" && n.sev ? dots(n.sev) : "") + '</div><div class="hl-em">' + meta + "</div>" + (n.note ? '<div class="hl-en">' + esc(n.note).replace(/\n/g, "<br>") + "</div>" : "") + "</div></div>" +
      (isOpen ? '<div class="hl-ea">' + (n.kind === "med" || n.kind === "sym" ? '<button data-a="hlagain" data-id="' + n.id + '">' + (n.kind === "med" ? "💊 Принял ещё" : "＋ Снова") + "</button>" : "") + (n.kind === "ill" && !n.until ? '<button data-a="hlcure" data-id="' + n.id + '">Выздоровел</button>' : "") + (n.kind !== "mood" ? '<button data-a="hledit" data-id="' + n.id + '">Изменить</button>' : "") + '<button class="dg" data-a="hldel" data-id="' + n.id + '">Удалить</button></div>' : "") + "</div>";
  }
  function feed() {
    let items = all();
    if (H.flt) {
      const f = H.flt; items = items.filter(n => (f.name ? norm(n.name) === f.name : true) && (f.ep ? (n.id === f.ep || n.ep === f.ep) : true) && (f.day ? dayKey(n.at) === f.day : true));
    }
    const chip = H.flt ? '<div class="hl-fl">Фильтр: <b>' + esc(H.flt.name ? "«" + (items[0] ? items[0].name : H.flt.name) + "»" : H.flt.day ? dayLabel(H.flt.day) : (H.items[H.flt.ep] ? H.items[H.flt.ep].name : "болезнь")) + '</b><button data-a="hlflt" data-v="">Показать всё ✕</button></div>' : "";
    if (!items.length) return chip + '<div class="hl-empty"><div class="em">🌿</div><b>' + (H.flt ? "Ничего не найдено" : "Пока пусто") + "</b><span>" + (H.flt ? "Сбрось фильтр." : "Запиши симптом, лекарство или как прошёл день — по истории потом видно закономерности.") + "</span>" + (H.flt ? "" : '<button class="hl-pri" data-a="hlnew" data-v="sym">＋ Записать</button>') + "</div>";
    let h = chip, last = "", i = 0;
    items.slice(0, 220).forEach(n => { const d = dayKey(n.at); if (d !== last) { last = d; const cnt = items.filter(x => dayKey(x.at) === d).length; h += '<div class="hl-day"><b>' + dayLabel(d) + "</b><span>" + cnt + "</span></div>"; } h += entry(n); i++; });
    return h;
  }
  function heat() {
    const sc = dayScore(), ill = illDays(), t = todayISO(), d0 = parseISO(t), dow = (d0.getDay() + 6) % 7, W = 15, start = addDays(t, -((W - 1) * 7 + dow));
    let cells = "";
    for (let w = 0; w < W; w++) for (let r = 0; r < 7; r++) {
      const d = addDays(start, w * 7 + r); if (d > t) { cells += "<i class='x'></i>"; continue; }
      const o = sc[d], lvl = o ? (o.s || (o.med ? 1 : 0)) : 0, c = o && o.s ? ["", "#ffc9c9", "#ff9e9e", "#ff6b6b", "#e03131", "#a51111"][o.s] || "#ff6b6b" : o && o.med ? "#99e6d8" : "";
      cells += '<i class="' + (ill.has(d) ? "ill " : "") + (d === t ? "td " : "") + (lvl ? "v" : "") + '" data-a="hlday" data-d="' + d + '" style="' + (c ? "background:" + c + ";" : "") + 'animation-delay:' + (w * 18 + r * 6) + 'ms" title="' + dayLabel(d) + (o ? " · записей: " + o.n : "") + '"></i>';
    }
    const mon = []; for (let w = 0; w < W; w += 4) { const d = parseISO(addDays(start, w * 7)); mon.push('<span style="grid-column:' + (w + 1) + '">' + MONTHS[d.getMonth()].slice(0, 3) + "</span>"); }
    return '<div class="hl-card"><div class="hl-ct">Последние 15 недель</div><div class="hl-hm" style="--w:' + W + '">' + cells + '</div><div class="hl-lg"><span><i style="background:#99e6d8"></i>лекарство</span><span><i style="background:#ffc9c9"></i>слабый</span><span><i style="background:#ff6b6b"></i>заметный</span><span><i style="background:#a51111"></i>сильный</span><span><i class="ill"></i>болезнь</span></div></div>';
  }
  function topBars() {
    const s = stats(H.per), arr = Object.values(s.sym).sort((a, b) => b.days.size - a.days.size).slice(0, 6), mx = Math.max(1, ...arr.map(x => x.days.size));
    const med = Object.values(s.med).sort((a, b) => b.days.size - a.days.size).slice(0, 6);
    const per = '<div class="hl-per">' + [30, 90, 365].map(p => '<button class="' + (H.per === p ? "on" : "") + '" data-a="hlper" data-v="' + p + '">' + (p === 365 ? "год" : p + " дн") + "</button>").join("") + "</div>";
    const bar = (o, c, a) => '<div class="hl-b" data-a="hlflt" data-v="' + esc(norm(o.name)) + '"><span>' + esc(o.name) + '</span><div><i style="width:' + Math.max(6, 100 * o.days.size / mx) + "%;background:" + c + '"></i></div><em>' + o.days.size + " " + plural(o.days.size, "день", "дня", "дней") + "</em></div>";
    return '<div class="hl-card"><div class="hl-ct">Частота' + per + "</div>" + (arr.length ? arr.map(o => bar(o, "linear-gradient(90deg,#ff9e9e,#ff6b6b)")).join("") : '<div class="hl-hint">Симптомов за период нет — отлично.</div>') + (med.length ? '<div class="hl-ct" style="margin-top:14px">Лекарства</div>' + med.map(o => bar(o, "linear-gradient(90deg,#99e6d8,#14b8a6)")).join("") : "") + "</div>";
  }
  function overview() {
    const ins = insights();
    const cards = ins.length ? ins.map(i => '<div class="hl-in" style="--c:' + i.c + '" data-a="hlfltx" data-f=\'' + esc(JSON.stringify(i.f)) + '\'><div class="e">' + i.e + "</div><div><b>" + esc(i.t) + "</b><span>" + esc(i.x) + "</span></div></div>").join("") : '<div class="hl-in ok" style="--c:#22c55e"><div class="e">✅</div><div><b>Тревожных закономерностей нет</b><span>Продолжай записывать — по истории они становятся заметны.</span></div></div>';
    return '<div class="hl-sec">На что обратить внимание</div>' + cards + '<div class="hl-fine">Это подсказки по частоте записей, а не диагноз.</div>' + heat() + topBars();
  }
  function summaryData() {
    const t = todayISO(), from = addDays(t, -H.per + 1), items = all().filter(n => dayKey(n.at) >= from || (n.kind === "ill" && (!n.until || dayKey(n.until) >= from)));
    const ill = items.filter(n => n.kind === "ill").sort((a, b) => a.at.localeCompare(b.at)), s = stats(H.per);
    const L = []; L.push("Сводка о самочувствии за " + H.per + " " + plural(H.per, "день", "дня", "дней") + " (" + shortD(from) + " — " + shortD(t) + ")");
    if (ill.length) { L.push(""); L.push("Болезни:"); ill.forEach(n => { const a = dayKey(n.at), b = n.until ? dayKey(n.until) : t, d = daysBetween(a, b) + 1; L.push("• " + n.name + ": с " + shortD(a) + (n.until ? " по " + shortD(b) : " (продолжается)") + ", " + d + " " + plural(d, "день", "дня", "дней") + (n.note ? ". " + n.note : "")); const inside = items.filter(x => x.ep === n.id && x.kind === "med"); if (inside.length) { const u = {}; inside.forEach(x => { u[x.name] = (u[x.name] || 0) + 1; }); L.push("   лечение: " + Object.keys(u).map(k => k + " ×" + u[k]).join(", ")); } }); }
    const sy = Object.values(s.sym).sort((a, b) => b.days.size - a.days.size); if (sy.length) { L.push(""); L.push("Симптомы (в скольких днях отмечены, макс. сила):"); sy.forEach(o => L.push("• " + o.name + ": " + o.days.size + " " + plural(o.days.size, "день", "дня", "дней") + ", макс. " + (o.max ? SEVN[o.max - 1] : "—"))); }
    const me = Object.values(s.med).sort((a, b) => b.days.size - a.days.size); if (me.length) { L.push(""); L.push("Лекарства (дней приёма / всего раз):"); me.forEach(o => L.push("• " + o.name + ": " + o.days.size + " / " + o.n)); }
    const dv = items.filter(n => n.kind === "doc" || n.kind === "test").sort((a, b) => a.at.localeCompare(b.at)); if (dv.length) { L.push(""); L.push("Визиты и анализы:"); dv.forEach(n => L.push("• " + shortD(dayKey(n.at)) + " — " + n.name + (n.note ? ": " + n.note : ""))); }
    if (L.length === 1) L.push("", "Записей за период нет.");
    return L;
  }
  function doctor() {
    const L = summaryData(), body = L.slice(1).map(l => l === "" ? "<br>" : /^•|^ {3}/.test(l) ? '<div class="li">' + esc(l.replace(/^•\s*/, "")) + "</div>" : '<div class="hh">' + esc(l) + "</div>").join("");
    const per = '<div class="hl-per">' + [30, 90, 365].map(p => '<button class="' + (H.per === p ? "on" : "") + '" data-a="hlper" data-v="' + p + '">' + (p === 365 ? "год" : p + " дн") + "</button>").join("") + "</div>";
    return '<div class="hl-sec">Сводка для врача ' + per + '</div><div class="hl-paper"><div class="pt">' + esc(L[0]) + "</div>" + body + '</div><div class="hl-acts"><button class="hl-pri" data-a="hlcopy">📋 Скопировать текст</button><button class="hl-ghost" data-a="hlprint">🖨️ Открыть для печати / PDF</button></div><div class="hl-fine">Для PDF: «Открыть для печати» → печать → «Сохранить как PDF».</div>';
  }
  function formHTML() {
    const f = H.form; if (!f) return "";
    const k = K[f.kind], sug = f.kind === "med" ? recent("med", 8) : SUG[f.kind].concat(f.kind === "sym" ? recent("sym", 6).filter(x => SUG.sym.indexOf(x) < 0) : []);
    const tabs = ["sym", "med", "ill", "doc", "test"].map(x => '<button class="' + (f.kind === x ? "on" : "") + '" style="--c:' + K[x].c + '" data-a="hlkind" data-v="' + x + '"><span>' + K[x].e + "</span>" + K[x].n + "</button>").join("");
    const chips = sug.length ? '<div class="hl-chips">' + sug.map(x => '<button class="' + (norm(f.name) === norm(x) ? "on" : "") + '" data-a="hlpick" data-v="' + esc(x) + '">' + esc(x) + "</button>").join("") + "</div>" : "";
    const sev = f.kind === "sym" ? '<div class="hl-lab">Насколько сильно</div><div class="hl-sevp">' + [1, 2, 3, 4, 5].map(i => '<button class="' + (f.sev === i ? "on" : "") + '" data-a="hlsev" data-v="' + i + '" style="--fc:' + FCOL[4 - (i - 1)] + '"><b>' + i + "</b><small>" + SEVN[i - 1] + "</small></button>").join("") + "</div>" : "";
    const act = active(), ep = f.kind !== "ill" && f.kind !== "doc" && act.length ? '<label class="hl-ck"><input type="checkbox" id="hl-ep"' + (f.ep ? " checked" : "") + "><span>в рамках болезни: <b>" + esc(act[0].name) + "</b></span></label>" : "";
    const when = f.kind === "ill" ? '<div class="hl-row2"><div><div class="hl-lab">Началась</div><input type="date" id="hl-dt" value="' + esc((f.when || localNow()).slice(0, 10)) + '"></div><div><div class="hl-lab">Закончилась (если уже)</div><input type="date" id="hl-un" value="' + esc(f.until || "") + '"></div></div>' : '<div class="hl-lab">Когда</div><input type="datetime-local" id="hl-dt" value="' + esc(f.when || localNow()) + '">';
    const ph = { sym: "Что беспокоит? (голова, горло…)", med: "Название лекарства", ill: "Название (простуда, ОРВИ…)", doc: "К какому врачу / зачем", test: "Какой анализ" }[f.kind];
    return '<div class="hl-ov" data-a="hlclose"></div><div class="hl-sheet ' + (anim() ? "an" : "") + '" style="--c:' + k.c + '"><div class="hl-grab"></div><div class="hl-kt">' + tabs + '</div><div class="hl-fb"><input id="hl-nm" class="hl-in1" autocomplete="off" placeholder="' + ph + '" value="' + esc(f.name || "") + '">' + chips + sev +
      '<textarea id="hl-note" rows="2" placeholder="' + (f.kind === "med" ? "Доза, от чего (необязательно)" : "Подробности (необязательно)") + '">' + esc(f.note || "") + "</textarea>" + when + ep +
      '</div><div class="hl-fa">' + (f.id ? '<button class="hl-ghost dg" data-a="hldel" data-id="' + f.id + '">Удалить</button>' : "") + '<span class="sp"></span><button class="hl-ghost" data-a="hlclose">Отмена</button><button class="hl-pri" data-a="hlsave">' + (f.id ? "Сохранить" : "Записать") + "</button></div></div>";
  }
  function html(vi) {
    boot(); if (!H.loaded && !H.busy) setTimeout(load, 0);
    const head = '<div id="main" class="pane" style="flex:1">' + mtopHTML(vi, 1, "");
    if (H.missing) return head + '<div class="scroll" id="list"><div class="hl"><div class="hl-sheetp"><div class="hl-empty"><div class="em">🛠️</div><b>Нужна настройка базы</b><span>Выполни <code>migration_v29.sql</code> в Supabase → SQL Editor, потом нажми «Проверить».</span><button class="hl-pri" data-a="hlretry">Проверить</button></div></div></div></div></div>';
    const body = H.tab === "map" ? overview() : H.tab === "doc" ? doctor() : feed();
    return head + '<div class="scroll" id="list"><div class="hl' + (anim() ? " an" : "") + '"><div class="hl-sheetp"><div class="hl-title"><h1>Здоровье</h1><span>только для тебя</span><button class="hl-add" data-a="hlnew" data-v="sym">＋ Записать</button></div>' + hero() + tiles() + seg() + '<div class="hl-view" id="hl-view">' + body + "</div></div></div>" + (H.form ? "" : '<button class="hl-fab" data-a="hlnew" data-v="sym" title="Записать">＋</button>') + formHTML() + "</div></div>";
  }

  /* ---------- действия ---------- */
  const readForm = () => { const f = H.form; if (!f) return; const n = $("hl-nm"), no = $("hl-note"), dt = $("hl-dt"), un = $("hl-un"), ep = $("hl-ep"); if (n) f.name = n.value; if (no) f.note = no.value; if (dt) f.when = dt.value; if (un) f.until = un.value; if (ep) f.ep = ep.checked; };
  const focusName = () => setTimeout(() => { const n = $("hl-nm"); if (n && !/Mobi|Android/i.test(navigator.userAgent)) n.focus(); }, 60);
  const A = {
    hlnew(a) { const act = active(); H.form = { kind: a.dataset.v || "sym", name: "", note: "", sev: 3, when: localNow(), until: "", ep: !!act.length }; H.open = null; render(); focusName(); },
    hlkind(a) { readForm(); H.form.kind = a.dataset.v; if (H.form.kind !== "sym") H.form.sev = H.form.sev || 3; render(); focusName(); },
    hlpick(a) { readForm(); H.form.name = a.dataset.v; render(); },
    hlsev(a) { readForm(); H.form.sev = +a.dataset.v; render(); },
    hlclose() { H.form = null; render(); },
    hlsave() {
      readForm(); const f = H.form; if (!f) return; const name = (f.name || "").trim();
      if (!name) { toast("Впиши, что именно"); const n = $("hl-nm"); if (n) n.focus(); return; }
      const at = f.kind === "ill" ? toISO((f.when || localNow()).slice(0, 10) + "T12:00") : toISO(f.when || localNow()), act = active();
      const old = f.id && H.items[f.id], o = { id: f.id || uid(), kind: f.kind, name: name, note: (f.note || "").trim() || null, sev: f.kind === "sym" ? f.sev || 3 : null, at: at, until: f.kind === "ill" && f.until ? toISO(f.until + "T12:00") : null, ep: f.kind !== "ill" && f.kind !== "doc" && f.ep && act.length ? (old && old.ep ? old.ep : act[0].id) : null };
      put(o, "u"); H.form = null; H.fresh = o.id; H.tab = "feed"; render(); setTimeout(() => { H.fresh = null; }, 1500); toast(K[o.kind].e + " Записано");
    },
    hlbp() { const g = id => $(id) && $(id).value.trim(), sy = +g("hl-bs"), di = +g("hl-bd"), pl = +g("hl-bpl"); if (!(sy >= 60 && sy <= 260 && di >= 30 && di <= 160)) { toast("Впиши верхнее и нижнее давление"); return; }
      const today = todayISO(), ex = all().find(n => n.kind === "bp" && dayKey(n.at) === today); put({ id: ex ? ex.id : uid(), kind: "bp", name: sy + "/" + di + (pl ? " · " + pl : ""), note: ex ? ex.note : null, sev: null, at: ex ? ex.at : new Date().toISOString(), until: null, ep: null }, "u"); H.fresh = ex ? ex.id : null; render(); },
    hlsleep() { const v = +(($("hl-sl") || {}).value || "").replace(",", "."); if (!(v > 0 && v <= 20)) { toast("Впиши часы сна, например 7.5"); return; }
      const today = todayISO(), ex = all().find(n => n.kind === "sleep" && dayKey(n.at) === today); put({ id: ex ? ex.id : uid(), kind: "sleep", name: String(v), note: null, sev: null, at: ex ? ex.at : new Date().toISOString(), until: null, ep: null }, "u"); H.fresh = ex ? ex.id : null; render(); },
    hlmood(a) { const v = +a.dataset.v, today = todayISO(), ex = all().find(n => n.kind === "mood" && dayKey(n.at) === today); put({ id: ex ? ex.id : uid(), kind: "mood", name: "", note: null, sev: v, at: ex ? ex.at : new Date().toISOString(), until: null, ep: null }, "u"); H.fresh = ex ? ex.id : null; render(); },
    hlcure(a) { const n = H.items[a.dataset.id]; if (!n) return; n.until = new Date().toISOString(); put(n, "u"); render(); toast("Рад, что прошло 🎉"); },
    hlopen(a) { H.open = H.open === a.dataset.id ? null : a.dataset.id; render(); },
    hledit(a) { const n = H.items[a.dataset.id]; if (!n) return; H.form = { id: n.id, kind: n.kind, name: n.name, note: n.note || "", sev: n.sev || 3, when: n.kind === "ill" ? toLocal(n.at) : toLocal(n.at), until: n.until ? dayKey(n.until) : "", ep: !!n.ep }; render(); focusName(); },
    hlagain(a) { const n = H.items[a.dataset.id]; if (!n) return; const id = uid(); put({ id, kind: n.kind, name: n.name, note: n.note || null, sev: n.sev || null, at: new Date().toISOString(), until: null, ep: active()[0] ? active()[0].id : n.ep || null }, "u"); H.open = null; H.fresh = id; render(); setTimeout(() => { H.fresh = null; }, 1500); toast(n.kind === "med" ? "💊 Отмечено" : "Записано"); },
    hldel(a) { const id = a.dataset.id; if (!id || !confirm("Удалить запись?")) return; del(id); H.form = null; H.open = null; render(); },
    hltab(a) { H.tab = a.dataset.v; H.open = null; render(); },
    hlper(a) { H.per = +a.dataset.v; render(); },
    hlflt(a) { H.flt = a.dataset.v ? { name: a.dataset.v } : null; H.tab = "feed"; render(); },
    hlfltx(a) { try { H.flt = JSON.parse(a.dataset.f); } catch (e) { H.flt = null; } H.tab = "feed"; render(); const sc = $("list"); if (sc) sc.scrollTop = 0; },
    hlday(a) { H.flt = { day: a.dataset.d }; H.tab = "feed"; render(); },
    hlretry() { H.missing = false; H.loaded = false; render(); },
    hlcopy() { const tx = summaryData().join("\n"); try { navigator.clipboard.writeText(tx).then(() => toast("Скопировано"), () => toast("Не удалось скопировать")); } catch (e) { toast("Не удалось скопировать"); } },
    hlprint() {
      const L = summaryData(), b = L.slice(1).map(l => l === "" ? "<br>" : /^•|^ {3}/.test(l) ? "<div class=li>" + esc(l) + "</div>" : "<h3>" + esc(l) + "</h3>").join("");
      const doc = "<!doctype html><meta charset=utf-8><title>Сводка о самочувствии</title><style>body{font:14pt/1.5 Arial,sans-serif;max-width:720px;margin:24px auto;padding:0 18px;color:#222}h1{font-size:18pt}h3{margin:16px 0 4px}.li{margin:2px 0 2px 14px}small{color:#777}</style><h1>" + esc(L[0]) + "</h1>" + b + "<p><small>Сформировано в «Мои дела» " + new Date().toLocaleDateString("ru-RU") + ". Это личные записи, а не медицинское заключение.</small></p>";
      try { const u = URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" })); const w = window.open(u, "_blank"); if (!w) toast("Браузер заблокировал окно — разреши всплывающие"); } catch (e) { toast("Не удалось открыть"); }
    }
  };
  Object.assign(acts, A);
  document.addEventListener("keydown", e => { if (viewg() !== "health" || !H.form) return; if (e.key === "Escape") { e.preventDefault(); A.hlclose(); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); A.hlsave(); } else if (e.key === "Enter" && e.target && e.target.id === "hl-nm") { e.preventDefault(); A.hlsave(); } });
  window.addEventListener("online", () => { flush(); });

  /* ---------- оформление (свой CSS, подключается один раз) ---------- */
  const css = document.createElement("style"); css.textContent = `
.hl{--ink:var(--tx);width:100%;max-width:1000px;margin:0 auto;padding:4px 0 110px}
.hl-sheetp{background:var(--solid);border:1px solid var(--ln);border-radius:22px;padding:6px 26px 30px;box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 34px rgba(0,0,0,.06);color:var(--tx)}
.hl-title{display:flex;align-items:baseline;gap:12px;padding:20px 0 14px}.hl-title h1{margin:0;font:700 calc(30px*var(--z,1)) Charter,Georgia,serif;letter-spacing:-.3px}.hl-title span{color:var(--sub);font-size:calc(13px*var(--z,1))}
.hl-add{margin-left:auto;border:0;border-radius:999px;padding:9px 18px;font-weight:600;font-size:calc(14px*var(--z,1));font-family:inherit;color:#fff;background:linear-gradient(135deg,#ff7a59,#e8508a);box-shadow:0 6px 18px -6px rgba(232,80,138,.7);cursor:pointer;transition:transform .2s cubic-bezier(.3,1.6,.5,1)}.hl-add:active{transform:scale(.94)}
@media(hover:hover){.hl-add:hover{transform:translateY(-1px) scale(1.03)}}
.hl-hero{position:relative;overflow:hidden;border-radius:22px;padding:22px 22px 20px;color:#fff;background:linear-gradient(135deg,#7c5cff 0%,#e8508a 55%,#ff9a62 100%);isolation:isolate}
.hl-hero i{position:absolute;border-radius:50%;filter:blur(30px);opacity:.55;z-index:-1}
.hl-hero .b1{width:170px;height:170px;background:#22d3ee;left:-40px;top:-60px}.hl-hero .b2{width:200px;height:200px;background:#ffd166;right:-60px;bottom:-90px}.hl-hero .b3{width:120px;height:120px;background:#fff;right:30%;top:-50px;opacity:.25}
.hl.an .hl-hero .b1{animation:hlb 9s ease-in-out infinite alternate}.hl.an .hl-hero .b2{animation:hlb 11s ease-in-out infinite alternate-reverse}
@keyframes hlb{from{transform:translate(0,0)}to{transform:translate(30px,18px)}}
.hl-hi{font-size:calc(13px*var(--z,1));opacity:.9}.hl-hero h2{margin:2px 0 14px;font-weight:700;font-size:calc(22px*var(--z,1));font-family:inherit;letter-spacing:-.2px}
.hl-faces{display:flex;gap:8px;flex-wrap:wrap}.hl-vit{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.hl-vc{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);border-radius:16px;padding:10px 12px;backdrop-filter:blur(8px)}.hl-vc b{font-size:13px;display:block;margin-bottom:6px}.hl-vr{display:flex;gap:6px;align-items:center}.hl-vr input{width:100%;min-width:0;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.85);color:#222;font-size:15px}.hl-vr button{padding:8px 14px;border-radius:10px;border:0;background:#fff;color:#222;font-weight:600;cursor:pointer}
.hl-f{width:58px;height:58px;border-radius:18px;border:1.5px solid rgba(255,255,255,.35);background:rgba(255,255,255,.16);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:30px;cursor:pointer;transition:transform .25s cubic-bezier(.3,1.6,.5,1),background .2s,box-shadow .2s;padding:0}
.hl-f span{display:block;transition:transform .25s cubic-bezier(.3,1.6,.5,1)}
@media(hover:hover){.hl-f:hover{transform:translateY(-3px) scale(1.08)}.hl-f:hover span{transform:scale(1.12) rotate(-4deg)}}
.hl-f:active{transform:scale(.92)}
.hl-f.on{background:#fff;border-color:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.28),0 8px 22px -6px var(--fc);transform:translateY(-3px) scale(1.1)}
.hl-ms{margin-top:10px;font-size:calc(12.5px*var(--z,1));opacity:.9}
.hl-ill{margin-top:14px;display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:16px;padding:10px 12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.hl-ill b{display:block;font-size:calc(15px*var(--z,1))}.hl-ill small{opacity:.9}.hl-ill>div:nth-child(2){flex:1;min-width:0}
.hl-pul{width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 0 0 rgba(255,255,255,.7);flex-shrink:0}.hl.an .hl-pul{animation:hlp 1.8s infinite}
@keyframes hlp{0%{box-shadow:0 0 0 0 rgba(255,255,255,.7)}100%{box-shadow:0 0 0 14px rgba(255,255,255,0)}}
.hl-sm{border:0;border-radius:999px;padding:8px 14px;background:#fff;color:#c2255c;font-weight:600;font-size:calc(13px*var(--z,1));font-family:inherit;cursor:pointer;flex-shrink:0}
.hl-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
.hl-t{border-radius:18px;padding:14px 14px 12px;background:var(--hov);position:relative;overflow:hidden}.hl-t:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c);border-radius:4px}
.hl-t b{display:block;font-weight:700;font-size:calc(28px*var(--z,1));font-family:inherit;color:var(--c);line-height:1.1}.hl-t span{font-size:calc(12px*var(--z,1));color:var(--sub);line-height:1.25;display:block;margin-top:2px}
.hl-seg{display:inline-flex;background:var(--hov);border-radius:999px;padding:4px;gap:2px;margin:6px 0 10px}
.hl-seg button{border:0;background:none;color:var(--sub);padding:8px 18px;border-radius:999px;font-weight:600;font-size:calc(14px*var(--z,1));font-family:inherit;cursor:pointer;transition:all .22s cubic-bezier(.3,1.4,.5,1)}
.hl-seg button.on{background:var(--solid);color:var(--tx);box-shadow:0 2px 8px rgba(0,0,0,.12)}
.hl-day{display:flex;align-items:baseline;gap:8px;margin:20px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--ln)}.hl-day b{font:700 calc(17px*var(--z,1)) Charter,Georgia,serif}.hl-day span{font-size:calc(12px*var(--z,1));color:var(--sub);background:var(--hov);border-radius:999px;padding:1px 8px}
.hl-e{position:relative;margin:8px 0;border-radius:18px;background:var(--hov);border:1px solid transparent;transition:background .2s,transform .2s,border-color .2s}
.hl-e:before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:4px;border-radius:0 4px 4px 0;background:var(--c)}
@media(hover:hover){.hl-e:hover{border-color:var(--ln)}}
.hl-ed{display:flex;gap:12px;padding:12px 14px 12px 16px;cursor:pointer}
.hl-dot{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;background:linear-gradient(135deg,color-mix(in srgb,var(--c) 22%,transparent),color-mix(in srgb,var(--c) 8%,transparent))}
.hl-eb{flex:1;min-width:0}.hl-et{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.hl-et b{font-size:calc(16px*var(--z,1))}.hl-em{font-size:calc(12.5px*var(--z,1));color:var(--sub);margin-top:1px}.hl-en{margin-top:6px;font:calc(15px*var(--z,1))/1.45 Charter,Georgia,serif;color:var(--tx);opacity:.9}
.hl-sv{display:inline-flex;gap:3px}.hl-sv i{width:7px;height:7px;border-radius:50%;background:var(--ln)}.hl-sv i.on{background:var(--c)}
.hl-ea{display:flex;gap:6px;flex-wrap:wrap;padding:0 14px 12px 70px}.hl-ea button{border:0;border-radius:999px;padding:7px 14px;background:var(--solid);color:var(--tx);font-weight:600;font-size:calc(13px*var(--z,1));font-family:inherit;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.1)}.hl-ea .dg,.hl-ghost.dg{color:#e03131}
.hl.an .hl-e.fresh{animation:hlin .5s cubic-bezier(.3,1.5,.5,1)}.hl.an .hl-e.open .hl-ea{animation:hlin .25s ease-out}
@keyframes hlin{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.hl-fl{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:calc(14px*var(--z,1));color:var(--sub)}.hl-fl button{border:0;background:var(--hov);border-radius:999px;padding:5px 12px;color:var(--tx);cursor:pointer;margin-left:auto}
.hl-empty{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:48px 16px;color:var(--sub)}.hl-empty .em{font-size:54px}.hl-empty b{color:var(--tx);font-size:calc(18px*var(--z,1))}
.hl-pri{border:0;border-radius:999px;padding:11px 22px;color:#fff;font-weight:600;font-size:calc(15px*var(--z,1));font-family:inherit;background:linear-gradient(135deg,#7c5cff,#e8508a);box-shadow:0 8px 20px -8px rgba(232,80,138,.7);cursor:pointer;transition:transform .2s cubic-bezier(.3,1.6,.5,1)}.hl-pri:active{transform:scale(.95)}
.hl-ghost{border:0;background:var(--hov);color:var(--tx);border-radius:999px;padding:11px 18px;font-weight:600;font-size:calc(15px*var(--z,1));font-family:inherit;cursor:pointer}
.hl-sec{font:700 calc(19px*var(--z,1)) Charter,Georgia,serif;margin:16px 0 10px;display:flex;align-items:center;gap:12px}
.hl-in{display:flex;gap:14px;align-items:flex-start;border-radius:18px;padding:14px 16px;margin:8px 0;background:color-mix(in srgb,var(--c) 10%,var(--hov));border:1px solid color-mix(in srgb,var(--c) 28%,transparent);cursor:pointer;transition:transform .2s}
@media(hover:hover){.hl-in:hover{transform:translateX(3px)}}
.hl-in .e{font-size:26px;line-height:1}.hl-in b{display:block;font-size:calc(15.5px*var(--z,1))}.hl-in span{display:block;color:var(--sub);font-size:calc(13.5px*var(--z,1));margin-top:2px;line-height:1.4}.hl-in.ok{cursor:default}
.hl-fine{font-size:calc(12px*var(--z,1));color:var(--sub);margin:6px 2px 14px}
.hl-card{background:var(--hov);border-radius:20px;padding:16px 16px 14px;margin:12px 0}.hl-ct{font-weight:700;font-size:calc(15px*var(--z,1));margin-bottom:10px;display:flex;align-items:center;gap:10px}
.hl-per{display:inline-flex;background:var(--solid);border-radius:999px;padding:3px;margin-left:auto}.hl-per button{border:0;background:none;color:var(--sub);padding:5px 12px;border-radius:999px;font-weight:600;font-size:calc(12.5px*var(--z,1));font-family:inherit;cursor:pointer}.hl-per button.on{background:var(--tx);color:var(--solid)}
.hl-hm{max-width:560px;margin:0 auto;display:grid;grid-template-columns:repeat(var(--w),1fr);grid-template-rows:repeat(7,1fr);grid-auto-flow:column;gap:4px}
.hl-hm i{aspect-ratio:1;border-radius:6px;background:color-mix(in srgb,var(--sub) 14%,transparent);cursor:pointer;min-width:0}.hl-hm i.x{background:none;cursor:default}
.hl-hm i.v{box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}.hl-hm i.ill{outline:2px solid #8b5cf6;outline-offset:-2px}.hl-hm i.td{box-shadow:0 0 0 2px var(--tx)}
.hl.an .hl-hm i{animation:hlpop .45s cubic-bezier(.3,1.6,.5,1) backwards}@keyframes hlpop{from{transform:scale(0);opacity:0}to{transform:none;opacity:1}}
@media(hover:hover){.hl-hm i:not(.x):hover{transform:scale(1.25);position:relative;z-index:1}}
.hl-lg{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:calc(11.5px*var(--z,1));color:var(--sub)}.hl-lg span{display:inline-flex;align-items:center;gap:5px}.hl-lg i{width:11px;height:11px;border-radius:4px;display:inline-block}.hl-lg i.ill{outline:2px solid #8b5cf6;outline-offset:-2px}
.hl-b{display:grid;grid-template-columns:minmax(70px,26%) 1fr auto;gap:10px;align-items:center;margin:8px 0;cursor:pointer;font-size:calc(14px*var(--z,1))}.hl-b>div{height:12px;background:var(--solid);border-radius:99px;overflow:hidden}.hl-b i{display:block;height:100%;border-radius:99px}.hl-b em{font-style:normal;color:var(--sub);font-size:calc(12.5px*var(--z,1));white-space:nowrap}
.hl.an .hl-b i{animation:hlw .8s cubic-bezier(.2,.8,.2,1) backwards}@keyframes hlw{from{width:0!important}}
.hl-hint{color:var(--sub);font-size:calc(14px*var(--z,1))}
.hl-paper{background:#fff;color:#222;border-radius:16px;padding:22px 24px;box-shadow:0 10px 30px -12px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.05);font:calc(15px*var(--z,1))/1.5 Charter,Georgia,serif}.hl-paper .pt{font-weight:700;font-size:calc(17px*var(--z,1));margin-bottom:8px}.hl-paper .hh{font-weight:700;margin-top:12px}.hl-paper .li{margin:2px 0 2px 14px}
.hl-acts{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 4px}
.hl-fab{position:fixed;right:max(22px,env(safe-area-inset-right));bottom:max(24px,env(safe-area-inset-bottom));z-index:40;width:60px;height:60px;border-radius:50%;border:0;color:#fff;font-size:32px;line-height:1;background:linear-gradient(135deg,#7c5cff,#e8508a,#ff9a62);box-shadow:0 12px 28px -8px rgba(232,80,138,.8);cursor:pointer;transition:transform .25s cubic-bezier(.3,1.6,.5,1)}.hl-fab:active{transform:scale(.9)}@media(hover:hover){.hl-fab:hover{transform:scale(1.08) rotate(90deg)}}
.hl-ov{position:fixed;inset:0;z-index:70;background:rgba(10,14,32,.45);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.hl-sheet{position:fixed;z-index:71;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 40px);overflow:auto;background:var(--solid);color:var(--tx);border-radius:26px;box-shadow:0 30px 80px -20px rgba(0,0,0,.5);padding:14px 20px 18px;border-top:4px solid var(--c)}
.hl-sheet.an{animation:hls .35s cubic-bezier(.3,1.4,.5,1)}@keyframes hls{from{opacity:0;transform:translate(-50%,-46%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%)}}
.hl-grab{display:none}
.hl-kt{display:flex;gap:6px;overflow-x:auto;padding:4px 0 10px;scrollbar-width:none}.hl-kt::-webkit-scrollbar{display:none}
.hl-kt button{border:1.5px solid var(--ln);background:none;color:var(--tx);border-radius:999px;padding:7px 13px;white-space:nowrap;font-weight:600;font-size:calc(13.5px*var(--z,1));font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .2s}.hl-kt button span{font-size:16px}
.hl-kt button.on{background:var(--c);border-color:var(--c);color:#fff;box-shadow:0 6px 14px -6px var(--c)}
.hl-fb input[type=text],.hl-in1,.hl-fb input[type=date],.hl-fb input[type=datetime-local],.hl-fb textarea{width:100%;box-sizing:border-box;border:1.5px solid var(--ln);background:var(--hov);color:var(--tx);border-radius:14px;padding:12px 14px;font-size:calc(16px*var(--z,1));font-family:inherit;outline:0;transition:border-color .2s,box-shadow .2s}
.hl-fb input:focus,.hl-fb textarea:focus{border-color:var(--c);box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 18%,transparent)}.hl-fb textarea{margin-top:10px;resize:vertical;min-height:64px}
.hl-chips{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 2px}.hl-chips button{border:0;border-radius:999px;padding:6px 12px;background:var(--hov);color:var(--tx);font-size:calc(13.5px*var(--z,1));font-family:inherit;cursor:pointer;transition:transform .15s}.hl-chips button:active{transform:scale(.93)}.hl-chips button.on{background:var(--c);color:#fff}
.hl-lab{font-size:calc(12px*var(--z,1));color:var(--sub);margin:12px 0 5px;font-weight:600}
.hl-sevp{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.hl-sevp button{border:1.5px solid var(--ln);background:none;color:var(--tx);border-radius:14px;padding:8px 2px 6px;cursor:pointer;transition:all .2s cubic-bezier(.3,1.5,.5,1)}.hl-sevp b{display:block;font-size:calc(18px*var(--z,1))}.hl-sevp small{font-size:calc(10px*var(--z,1));color:var(--sub);display:block;line-height:1.1;margin-top:2px}
.hl-sevp button.on{background:var(--fc);border-color:var(--fc);color:#fff;transform:translateY(-2px) scale(1.06);box-shadow:0 8px 16px -8px var(--fc)}.hl-sevp button.on small{color:#fff}
.hl-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hl-ck{display:flex;align-items:center;gap:10px;margin-top:12px;font-size:calc(14px*var(--z,1))}.hl-ck input{width:20px;height:20px;accent-color:var(--c)}
.hl-fa{display:flex;align-items:center;gap:8px;margin-top:16px}.hl-fa .sp{flex:1}
@media(max-width:760px){
 .hl{padding-top:0}.hl-sheetp{border-radius:0;border-left:0;border-right:0;box-shadow:none;padding:2px 14px 30px;min-height:calc(100dvh - 120px)}
 .hl-title{padding:12px 0 10px}.hl-title h1{font-size:calc(26px*var(--z,1))}.hl-add{display:none}
 .hl-hero{padding:18px 16px 16px;border-radius:20px}.hl-f{width:calc((100% - 32px)/5);height:54px;font-size:27px}.hl-faces{flex-wrap:nowrap;gap:8px}
 .hl-tiles{gap:8px}.hl-t{padding:12px 10px 10px}.hl-t b{font-size:calc(24px*var(--z,1))}
 .hl-ea{padding-left:16px}
 .hl-sheet{left:0;right:0;top:auto;bottom:0;width:100%;max-width:none;transform:none;border-radius:26px 26px 0 0;max-height:92dvh;padding:8px 16px calc(16px + env(safe-area-inset-bottom))}
 .hl-sheet.an{animation:hlsm .35s cubic-bezier(.2,.9,.3,1)}@keyframes hlsm{from{transform:translateY(100%)}to{transform:none}}
 .hl-grab{display:block;width:44px;height:5px;border-radius:3px;background:var(--ln);margin:2px auto 8px}
 .hl-fab{bottom:max(20px,env(safe-area-inset-bottom))}
}
@media(prefers-reduced-motion:reduce){.hl *{animation:none!important;transition:none!important}}
`; document.head.appendChild(css);
  return { html };
};
