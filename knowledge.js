/* «Знания» — личная база знаний: выжимка всегда видна, подробности раскрываются. Грузится после index.html и knowledge-data.js.
   Хранение: user_settings (ключ kn:<id>, по строке на карточку; мета kn:_meta) — миграция не нужна; кэш в localStorage. */
window.KNOW_INIT = function (X) {
  const { S, ic, esc, $, render, toast, mtopHTML, uid, nowISO, acts } = X;
  const sbg = () => X.sb(), viewg = () => X.view();
  const KEY = "mytasks_know", KPEND = "mytasks_know_p";
  const K = { items: {}, loaded: false, busy: false, uid: null, q: "", tag: "", open: {}, edit: null, fail: false };
  const jg = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const js = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const LV = { new: ["🆕", "Новое"], learn: ["📖", "Изучаю"], known: ["✅", "Усвоил"] };
  const saveLocal = () => { if (K.uid) js(KEY, { u: K.uid, items: K.items }); };
  const pend = () => jg(KPEND, {});
  const setPend = (id, op) => { const p = pend(); if (op) p[id] = op; else delete p[id]; js(KPEND, p); };

  async function pushOne(id, op) {
    const sb = sbg(); if (!sb || !S.user) return false;
    try {
      if (op === "del") { const r = await sb.from("user_settings").delete().eq("user_id", S.user.id).eq("key", "kn:" + id); if (r.error) throw r.error; }
      else { const c = K.items[id]; if (!c) return true; const r = await sb.from("user_settings").upsert({ user_id: S.user.id, key: "kn:" + id, data: c, updated_at: nowISO() }, { onConflict: "user_id,key" }); if (r.error) throw r.error; }
      setPend(id, null); return true;
    } catch (e) { setPend(id, op); return false; }
  }
  async function flush() { const p = pend(); for (const id of Object.keys(p)) await pushOne(id, p[id]); }
  const put = c => { c.updated = nowISO(); K.items[c.id] = c; saveLocal(); setPend(c.id, "set"); pushOne(c.id, "set"); };

  function boot() {
    if (!S.user || K.uid === S.user.id) return;
    K.uid = S.user.id; const c = jg(KEY, null); K.items = c && c.u === K.uid ? c.items || {} : {};
  }
  async function load() {
    const sb = sbg(); if (!sb || !S.user || K.busy) return; K.busy = true;
    try {
      await flush();
      const r = await sb.from("user_settings").select("key,data").eq("user_id", S.user.id).like("key", "kn:%");
      if (r.error) throw r.error;
      const rows = r.data || [], meta = rows.find(x => x.key === "kn:_meta"), p = pend(), items = {};
      rows.forEach(x => { if (x.key !== "kn:_meta" && x.data && x.data.id && !(p[x.data.id] === "del")) items[x.data.id] = x.data; });
      Object.keys(K.items).forEach(id => { if (p[id] === "set" && K.items[id]) items[id] = K.items[id]; });
      if (!meta && !Object.keys(items).length && window.KNOW_SEED) {
        const t0 = Date.now();
        window.KNOW_SEED.forEach((s, i) => { items[s.id] = Object.assign({ level: "new", lastOpened: null, created: new Date(t0 + i).toISOString(), n: i + 1 }, JSON.parse(JSON.stringify(s))); });
        for (const id of Object.keys(items)) { K.items[id] = items[id]; await pushOne(id, "set"); }
        await sb.from("user_settings").upsert({ user_id: S.user.id, key: "kn:_meta", data: { seeded: nowISO() }, updated_at: nowISO() }, { onConflict: "user_id,key" });
      }
      K.items = items; K.loaded = true; K.fail = false; saveLocal();
    } catch (e) { K.fail = true; K.loaded = true; }
    K.busy = false; if (viewg() === "know") render();
  }

  // ---- мини-markdown ----
  const inl = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])[_*]([^_*]+)[_*](?=[\s).,:;!?]|$)/g, "$1<i>$2</i>").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  function md(src) {
    const out = []; let ul = false;
    String(src || "").split("\n").forEach(l => {
      const t = l.trim();
      if (/^[-*] /.test(t)) { if (!ul) { out.push("<ul>"); ul = true; } out.push("<li>" + inl(t.slice(2)) + "</li>"); return; }
      if (/^\d+\. /.test(t)) { if (!ul) { out.push("<ul>"); ul = true; } out.push("<li>" + inl(t.replace(/^\d+\.\s*/, "")) + "</li>"); return; }
      if (ul) { out.push("</ul>"); ul = false; }
      if (!t) return;
      if (/^###? /.test(t)) out.push("<h4>" + inl(t.replace(/^#+\s*/, "")) + "</h4>"); else out.push("<p>" + inl(t) + "</p>");
    });
    if (ul) out.push("</ul>"); return out.join("");
  }

  const ago = iso => { if (!iso) return "не открывал"; const d = Math.floor((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? "открыто сегодня" : d === 1 ? "открыто вчера" : "открыто " + d + " дн. назад"; };
  const cards = () => Object.values(K.items).sort((a, b) => (a.n || 999) - (b.n || 999) || String(a.created).localeCompare(String(b.created)));
  const hay = c => (c.title + " " + c.short + " " + c.details + " " + (c.tags || []).join(" ")).toLowerCase();
  const vis = () => { const q = K.q.trim().toLowerCase(); return cards().filter(c => (!K.tag || (c.tags || []).indexOf(K.tag) >= 0) && (!q || hay(c).indexOf(q) >= 0)); };
  const allTags = () => { const m = {}; cards().forEach(c => (c.tags || []).forEach(t => { m[t] = (m[t] || 0) + 1; })); return Object.keys(m).sort((a, b) => m[b] - m[a] || a.localeCompare(b)); };

  function cardHTML(c) {
    const o = !!K.open[c.id], lv = LV[c.level] || LV.new;
    if (K.edit === c.id) return editHTML(c);
    const src = (c.sources || []).map(s => '<a href="' + esc(s.u) + '" target="_blank" rel="noopener">🔗 ' + esc(s.t || s.u) + "</a>").join("");
    return '<div class="kn-c' + (o ? " open" : "") + '" data-id="' + esc(c.id) + '"><div class="kn-h" data-a="knopen" data-id="' + esc(c.id) + '"><div class="kn-t"><b>' + esc(c.title) + '</b><span class="kn-lv">' + lv[0] + " " + lv[1] + '</span><span class="kn-ch">' + ic("chevd", 18) + '</span></div><div class="kn-s">' + esc(c.short) + '</div><div class="kn-m">' + (c.tags || []).map(t => '<span class="kn-tg">#' + esc(t) + "</span>").join("") + '<span class="kn-ago">' + ago(c.lastOpened) + '</span></div></div><div class="kn-dw"><div class="kn-d"><div class="kn-md">' + md(c.details) + "</div>" + (src ? '<div class="kn-src">' + src + "</div>" : "") + '<div class="kn-bt"><button class="kn-b" data-a="knlv" data-id="' + esc(c.id) + '">' + lv[0] + " " + lv[1] + ' → дальше</button><button class="kn-b" data-a="knedit" data-id="' + esc(c.id) + '">' + ic("pen", 15) + ' Править</button><button class="kn-b kn-x" data-a="kndel" data-id="' + esc(c.id) + '">' + ic("trash", 15) + " Удалить</button></div></div></div></div>";
  }
  function editHTML(c) {
    const n = c.id === "new";
    return '<div class="kn-c open kn-ed"><input id="kn-et" class="kn-in" placeholder="Название" value="' + esc(c.title || "") + '"><input id="kn-eg" class="kn-in" placeholder="Теги через запятую" value="' + esc((c.tags || []).join(", ")) + '"><label>Кратко (1–3 строки, видно всегда)</label><textarea id="kn-es" class="kn-in" rows="3">' + esc(c.short || "") + '</textarea><label>Подробно (markdown: ### заголовок, - список, **жирный**)</label><textarea id="kn-ed" class="kn-in" rows="12">' + esc(c.details || "") + '</textarea><label>Источники (по строке: название | ссылка)</label><textarea id="kn-er" class="kn-in" rows="3">' + esc((c.sources || []).map(s => (s.t ? s.t + " | " : "") + s.u).join("\n")) + '</textarea><div class="kn-bt"><button class="kn-b kn-ok" data-a="knsave" data-id="' + esc(c.id) + '">Сохранить</button><button class="kn-b" data-a="kncancel">Отмена</button></div></div>';
  }
  const listHTML = () => {
    if (!K.loaded && !Object.keys(K.items).length) return '<div class="kn-e">Загружаю «Знания»…</div>';
    const v = vis(), nw = K.edit === "new" ? editHTML({ id: "new", tags: [], sources: [] }) : "";
    if (!v.length && !nw) return '<div class="kn-e">' + (K.fail && !Object.keys(K.items).length ? "Нет связи с базой. Попробуй позже." : "Ничего не найдено") + "</div>";
    return nw + v.map(cardHTML).join("");
  };
  const chipsHTML = () => '<button class="kn-chip' + (K.tag ? "" : " on") + '" data-a="kntag" data-t="">Все <i>' + Object.keys(K.items).length + "</i></button>" + allTags().map(t => '<button class="kn-chip' + (K.tag === t ? " on" : "") + '" data-a="kntag" data-t="' + esc(t) + '">#' + esc(t) + "</button>").join("");

  function html(vi) {
    boot(); if (!K.loaded && !K.busy) setTimeout(load, 0);
    styles();
    return '<div id="main" class="pane" style="flex:1">' + mtopHTML(vi, 1, "") + '<div class="scroll" id="list"><div class="kn"><div class="kn-sheet"><div class="kn-title"><h1>Знания</h1><span>выжимки видны всегда, подробности по клику</span></div><div class="kn-bar"><div class="kn-sw">' + ic("search", 16) + '<input id="kn-q" class="kn-q" placeholder="Поиск по тексту…" value="' + esc(K.q) + '" autocomplete="off"></div><button class="kn-b kn-ok" data-a="knnew">' + ic("plus", 15) + ' Добавить</button><button class="kn-b" data-a="knexp">' + ic("dl", 15) + ' .md</button></div><div class="kn-chips" id="kn-chips">' + chipsHTML() + '</div><div id="kn-list">' + listHTML() + "</div></div></div></div></div>";
  }
  const relist = () => { const l = $("kn-list"); if (l) l.innerHTML = listHTML(); const c = $("kn-chips"); if (c) c.innerHTML = chipsHTML(); };

  function exportMd() {
    const t = cards().map(c => "# " + c.title + "\n\n" + (c.tags || []).map(x => "#" + x).join(" ") + "\n\n> " + c.short + "\n\n" + c.details + "\n" + ((c.sources || []).length ? "\n" + c.sources.map(s => "- [" + (s.t || s.u) + "](" + s.u + ")").join("\n") + "\n" : "")).join("\n---\n\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/markdown" })); a.download = "znaniya.md"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  const A = {
    knopen(a) {
      if (K.edit) return; const id = a.dataset.id, c = K.items[id]; if (!c) return;
      K.open[id] = !K.open[id]; const el = a.closest(".kn-c"); if (el) el.classList.toggle("open", !!K.open[id]);
      if (K.open[id] && (!c.lastOpened || Date.now() - new Date(c.lastOpened) > 36e5)) { c.lastOpened = nowISO(); saveLocal(); setPend(id, "set"); pushOne(id, "set"); const g = el && el.querySelector(".kn-ago"); if (g) g.textContent = ago(c.lastOpened); }
    },
    kntag(a) { K.tag = a.dataset.t || ""; relist(); },
    knnew() { K.edit = "new"; relist(); const e = $("kn-et"); if (e) e.focus(); },
    knedit(a) { K.edit = a.dataset.id; relist(); const el = document.querySelector(".kn-ed"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" }); },
    kncancel() { K.edit = null; relist(); },
    knsave(a) {
      const id = a.dataset.id, g = x => ($(x) ? $(x).value : ""), title = g("kn-et").trim(); if (!title) { toast("Нужно название"); return; }
      const src = g("kn-er").split("\n").map(l => l.trim()).filter(Boolean).map(l => { const p = l.split("|"); const u = (p.pop() || "").trim(); return { t: p.join("|").trim(), u }; }).filter(s => /^https?:\/\//.test(s.u));
      const tags = g("kn-eg").split(",").map(t => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);
      const base = id === "new" ? { id: uid(), level: "new", lastOpened: null, created: nowISO(), n: Math.max(0, ...cards().map(c => c.n || 0)) + 1 } : K.items[id];
      put(Object.assign({}, base, { title, tags, short: g("kn-es").trim(), details: g("kn-ed"), sources: src })); K.edit = null; if (id !== "new") K.open[id] = true; relist(); toast("Сохранено");
    },
    kndel(a) { const id = a.dataset.id, c = K.items[id]; if (!c || !confirm("Удалить «" + c.title + "»? Копия останется только в экспорте .md, если ты его делал.")) return; delete K.items[id]; saveLocal(); setPend(id, "del"); pushOne(id, "del"); relist(); },
    knlv(a) { const c = K.items[a.dataset.id]; if (!c) return; const o = ["new", "learn", "known"]; c.level = o[(o.indexOf(c.level || "new") + 1) % 3]; put(c); const el = a.closest(".kn-c"), lv = LV[c.level]; if (el) { const p = el.querySelector(".kn-lv"); if (p) p.textContent = lv[0] + " " + lv[1]; a.textContent = lv[0] + " " + lv[1] + " → дальше"; } },
    knexp() { exportMd(); }
  };
  Object.assign(acts, A);

  document.addEventListener("input", e => { if (e.target && e.target.id === "kn-q") { K.q = e.target.value; relist(); } });
  window.addEventListener("online", () => { flush(); });

  let st = false;
  function styles() {
    if (st) return; st = true; const s = document.createElement("style");
    s.textContent = ".kn{width:100%;max-width:900px;margin:0 auto;padding:4px 0 90px}.kn-sheet{background:var(--solid);border:1px solid var(--ln);border-radius:22px;padding:2px 24px 28px;color:var(--tx);box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 34px rgba(0,0,0,.06)}"
      + ".kn-title{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding:20px 2px 10px}.kn-title h1{font-size:30px;font-weight:700;letter-spacing:-.01em}.kn-title span{color:var(--sub);font-size:13px}"
      + ".kn-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 10px}.kn-sw{flex:1 1 220px;display:flex;align-items:center;gap:8px;background:var(--hov);border-radius:12px;padding:0 12px;color:var(--sub)}.kn-q{flex:1;border:0;background:transparent;color:var(--tx);font:inherit;padding:10px 0;outline:none;min-width:0}"
      + ".kn-b{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ln);background:var(--hov);color:var(--tx);border-radius:11px;padding:8px 13px;font:inherit;font-size:13.5px;cursor:pointer;transition:transform .15s,background .15s}.kn-b:active{transform:scale(.96)}.kn-ok{background:var(--acc);color:#fff;border-color:transparent}.kn-x{color:#d9534f}"
      + ".kn-chips{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 14px}.kn-chip{border:1px solid var(--ln);background:transparent;color:var(--sub);border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}.kn-chip i{font-style:normal;opacity:.7;margin-left:3px}.kn-chip.on{background:var(--acc);color:#fff;border-color:transparent}"
      + ".kn-c{border:1px solid var(--ln);border-radius:16px;margin:0 0 10px;background:var(--solid);transition:box-shadow .2s,border-color .2s}.kn-c.open{border-color:var(--acc);box-shadow:0 6px 22px rgba(0,0,0,.08)}.kn-h{padding:13px 16px;cursor:pointer}"
      + ".kn-t{display:flex;align-items:center;gap:10px}.kn-t b{font-size:16.5px;flex:1;min-width:0}.kn-lv{font-size:12px;color:var(--sub);white-space:nowrap}.kn-ch{display:flex;color:var(--sub);transition:transform .25s}.kn-c.open .kn-ch{transform:rotate(180deg)}"
      + ".kn-s{margin:6px 0 8px;color:var(--tx);opacity:.88;line-height:1.45;font-size:14.5px}.kn-m{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px}.kn-tg{color:var(--acc)}.kn-ago{margin-left:auto;color:var(--sub)}"
      + ".kn-dw{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s ease}.kn-c.open .kn-dw{grid-template-rows:1fr}.kn-d{overflow:hidden;min-height:0;padding:0 16px}.kn-c.open .kn-d{padding:2px 16px 14px}"
      + ".kn-md{line-height:1.55;font-size:14.5px}.kn-md h4{font-size:15px;margin:14px 0 4px}.kn-md p{margin:6px 0}.kn-md ul{margin:6px 0;padding-left:20px}.kn-md li{margin:3px 0}.kn-md code{background:var(--hov);border-radius:5px;padding:1px 5px;font-size:.92em}.kn-md a,.kn-src a{color:var(--acc)}"
      + ".kn-src{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0 4px;font-size:13px}.kn-bt{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}"
      + ".kn-ed{padding:14px 16px;display:flex;flex-direction:column;gap:6px}.kn-ed label{font-size:12px;color:var(--sub);margin-top:6px}.kn-in{width:100%;box-sizing:border-box;border:1px solid var(--ln);background:var(--hov);color:var(--tx);border-radius:11px;padding:9px 12px;font:inherit;font-size:14px;resize:vertical}"
      + ".kn-e{padding:50px 10px;text-align:center;color:var(--sub)}@media(max-width:700px){.kn-sheet{padding:2px 12px 22px;border-radius:16px}.kn-title h1{font-size:25px}}";
    document.head.appendChild(s);
  }
  return { html };
};
