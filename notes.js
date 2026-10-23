/* «Заметки» — личный раздел мыслей. Грузится после index.html, использует его глобалы (sb, S, ic, esc, $, render, toast, addTask, micToggle…). Данные только владельца (RLS). */
window.NOTES_INIT = function (X) {
  const { S, ic, esc, $, render, toast, addTask, micToggle, micOK, mtopHTML, uid, nowISO, todayISO, addDays, parseISO, pad2, WDS, goView, acts } = X;
  const sbg = () => X.sb(), viewg = () => X.view();
  const KEY = "mytasks_notes", KP = "mytasks_notes_p";
  const NT = { items: {}, pend: {}, loaded: false, busy: false, missing: false, q: "", tag: "", edit: null, uid: null, tx: "" };
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
    return Object.values(NT.items).filter(n => (!NT.tag || (n.tags || []).indexOf(NT.tag) >= 0) && (!q || n.text.toLowerCase().indexOf(q) >= 0))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created_at.localeCompare(a.created_at));
  };
  const topTags = () => { const c = {}; Object.values(NT.items).forEach(n => (n.tags || []).forEach(t => { c[t] = (c[t] || 0) + 1; })); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 14); };

  function card(n) {
    if (NT.edit === n.id) return '<div class="nt-card edit"><textarea id="nt-ed" class="inp nt-ta" rows="4">' + esc(n.text) + '</textarea><div class="nt-row"><button class="btn" data-a="ntedsave" data-id="' + n.id + '">Сохранить</button><button class="linkbtn" data-a="ntedcancel">Отмена</button></div></div>';
    const tm = new Date(n.created_at), hh = pad2(tm.getHours()) + ":" + pad2(tm.getMinutes());
    const task = n.task_id && S.tasks[n.task_id];
    return '<div class="nt-card' + (n.pinned ? " pin" : "") + '"><div class="nt-tx">' + fmtText(n.text) + '</div><div class="nt-meta"><span>' + (n.pinned ? "📌 " : "") + hh + '</span>' +
      (task ? '<span class="nt-lnk' + (task.done ? " done" : "") + '" title="Связанная задача">' + (task.done ? "✓ " : "→ ") + "задача" + "</span>" : "") +
      '<span style="flex:1"></span>' +
      (task ? "" : '<button class="nt-b" data-a="nttask" data-id="' + n.id + '" title="Сделать задачей">' + ic("ccheck", 16) + " в задачу</button>") +
      '<button class="nt-b" data-a="ntpin" data-id="' + n.id + '" title="Закрепить">' + ic("pin", 16) + '</button><button class="nt-b" data-a="ntedit" data-id="' + n.id + '" title="Править">' + ic("pen", 16) + '</button><button class="nt-b" data-a="ntdel" data-id="' + n.id + '" title="Удалить">' + ic("trash", 16) + "</button></div></div>";
  }

  function html(vi) {
    boot(); if (!NT.loaded && !NT.busy) setTimeout(load, 0);
    const head = '<div id="main" class="pane" style="flex:1">' + mtopHTML(vi, 1, "") + '<div class="mhead mhide"><h1><span style="color:#2b88d8">' + ic("bulb", 26) + "</span> " + esc(vi.name) + '</h1></div><div class="msub">' + esc(vi.sub) + "</div>";
    if (NT.missing) return head + '<div class="scroll" id="list"><div class="jr-box"><b>Одноразовая настройка базы</b><div class="jr-hint">Нужна миграция <code>migration_v28.sql</code> (Supabase → SQL Editor → Run), потом «Проверить».</div><button class="btn" data-a="ntretry">Проверить</button></div></div></div>';
    const items = list(), tags = topTags();
    let body = "", last = "";
    items.forEach(n => { const k = n.pinned ? "pin" : dayKey(n.created_at); if (k !== last) { last = k; body += '<div class="nt-day">' + (k === "pin" ? "Закреплено" : dayLabel(k)) + "</div>"; } body += card(n); });
    if (!items.length) body = '<div class="jr-empty">' + (NT.loaded ? (NT.q || NT.tag ? "Ничего не нашлось." : "Пока пусто. Запиши первую мысль — хоть про то, что давно хотел сделать.") : "Загружаю…") + "</div>";
    return head + '<div class="scroll" id="list"><div class="nt-comp"><textarea id="nt-tx" class="inp nt-ta" rows="3" placeholder="О чём думаешь? Теги — через #" enterkeyhint="enter">' + esc(NT.tx) + '</textarea><div class="nt-row">' +
      (micOK() ? '<button type="button" class="micb" data-a="ntmic" title="Надиктовать">🎤</button>' : "") + '<span class="nt-hint">Ctrl+Enter — записать</span><span style="flex:1"></span><button class="btn" data-a="ntadd">Записать</button></div></div>' +
      '<div class="nt-find"><input id="nt-q" class="inp" placeholder="Поиск по заметкам" autocomplete="off" value="' + esc(NT.q) + '"></div>' +
      (tags.length ? '<div class="nt-tags">' + (NT.tag ? '<a class="nt-tag on" data-a="nttag" data-t="">✕ #' + esc(NT.tag) + "</a>" : "") + tags.filter(t => t[0] !== NT.tag).map(t => '<a class="nt-tag" data-a="nttag" data-t="' + esc(t[0]) + '">#' + esc(t[0]) + " <i>" + t[1] + "</i></a>").join("") + "</div>" : "") +
      body + "</div></div>";
  }

  const A = {
    ntadd() { const el = $("nt-tx"), t = (el ? el.value : NT.tx).trim(); if (!t) { toast("Пусто"); return; } boot(); const now = nowISO(); put({ id: uid(), text: t, tags: tagsOf(t), task_id: null, pinned: false, created_at: now, updated_at: now }, "u"); NT.tx = ""; render(); setTimeout(() => { const x = $("nt-tx"); if (x) x.focus(); }, 0); },
    ntmic() { micToggle("nt-tx"); },
    nttag(a) { NT.tag = a.dataset.t || ""; render(); },
    ntpin(a) { const n = NT.items[a.dataset.id]; if (!n) return; n.pinned = !n.pinned; put(n); render(); },
    ntedit(a) { NT.edit = a.dataset.id; render(); setTimeout(() => { const x = $("nt-ed"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0); },
    ntedcancel() { NT.edit = null; render(); },
    ntedsave(a) { const n = NT.items[a.dataset.id], x = $("nt-ed"); if (!n || !x) return; const t = x.value.trim(); if (!t) { toast("Пусто"); return; } n.text = t; n.tags = tagsOf(t); n.updated_at = nowISO(); NT.edit = null; put(n); render(); },
    ntdel(a) { const id = a.dataset.id, n = NT.items[id]; if (!n) return; delete NT.items[id]; NT.pend[id] = "d"; save(); render(); toast("Заметка удалена", { buttons: [["Вернуть", () => { NT.items[id] = n; NT.pend[id] = "u"; save(); flush(); render(); }]] }); setTimeout(() => { if (NT.pend[id] === "d") flush(); }, 6500); },
    nttask(a) { const n = NT.items[a.dataset.id]; if (!n || n.task_id) return; const lines = n.text.split("\n"), title = lines[0].replace(/#[\p{L}\d_-]+/gu, "").trim().slice(0, 120) || "Из заметки", rest = lines.slice(1).join("\n").trim(); const t = addTask({ title, note: rest }); n.task_id = t.id; put(n); render(); toast("Задача создана", { buttons: [["Открыть", () => { goView("all"); X.sel(t.id); render(); }]] }); },
    ntretry() { NT.missing = false; NT.loaded = false; load(); render(); }
  };
  Object.assign(acts, A);
  document.addEventListener("input", e => {
    const id = e.target && e.target.id; if (id === "nt-tx") NT.tx = e.target.value;
    else if (id === "nt-q") { NT.q = e.target.value; const pos = e.target.selectionStart; render(); const x = $("nt-q"); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (er) {} } }
  });
  document.addEventListener("keydown", e => { if (e.target && e.target.id === "nt-tx" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); A.ntadd(); } });
  window.addEventListener("online", () => { flush(); });
  return { html };
};
