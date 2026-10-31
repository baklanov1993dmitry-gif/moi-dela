// «Траты»: разбор электронных чеков из писем без нейронки. Вход — текст/HTML/.eml, выход — {merchant,date,total,items[],key,note}.
(function (root) {
  "use strict";
  const ENT = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", laquo: "«", raquo: "»", ndash: "–", mdash: "—", rub: "₽", ordm: "º", numero: "№" };
  function decEnt(s) {
    return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") { const c = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return c ? String.fromCodePoint(c) : m; } catch (x) { return m; } }
      const v = ENT[e.toLowerCase()]; return v == null ? m : v;
    });
  }
  function htmlToText(h) {
    h = h.replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "");
    h = h.replace(/<\s*br\s*\/?>|<\/(p|div|tr|td|th|li|h\d|table|span)>/gi, "\n").replace(/<[^>]+>/g, "");
    return decEnt(h);
  }

  // ---------- MIME (.eml) ----------
  function mdec(bytes, cs) { try { return new TextDecoder(cs || "utf-8").decode(bytes); } catch (e) { return new TextDecoder("utf-8").decode(bytes); } }
  function unq(s) { return s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (m, x) => String.fromCharCode(parseInt(x, 16))); }
  function b2bytes(bin) { const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i) & 255; return u; }
  function ew(s) {   // RFC2047 =?utf-8?B?...?=
    return (s || "").replace(/=\?([\w-]+)\?([BQ])\?([^?]*)\?=/gi, (m, cs, e, t) => {
      try { return e.toUpperCase() === "B" ? mdec(b2bytes(atob(t)), cs) : mdec(b2bytes(unq(t.replace(/_/g, " "))), cs); } catch (x) { return m; }
    }).replace(/\?=\s+=\?/g, "");
  }
  function hdrs(h) { const o = {}; h.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/).forEach(l => { const k = l.indexOf(":"); if (k > 0) o[l.slice(0, k).toLowerCase()] = l.slice(k + 1).trim(); }); return o; }
  function splitHB(s) { const m = /\r?\n\r?\n/.exec(s); return m ? [s.slice(0, m.index), s.slice(m.index + m[0].length)] : [s, ""]; }
  function walk(raw, out) {
    const [hh, body] = splitHB(raw), h = hdrs(hh), ct = (h["content-type"] || "text/plain").toLowerCase();
    if (ct.startsWith("multipart/")) {
      const b = /boundary="?([^";\s]+)"?/i.exec(h["content-type"]); if (!b) return h;
      body.split("--" + b[1]).slice(1).forEach(p => { if (/^--/.test(p)) return; walk(p.replace(/^\r?\n/, ""), out); });
      return h;
    }
    if (!/^text\/(plain|html)/.test(ct)) return h;
    const enc = (h["content-transfer-encoding"] || "").toLowerCase(), cs = (/charset="?([\w-]+)/i.exec(h["content-type"]) || [])[1];
    let txt;
    try { txt = enc === "base64" ? mdec(b2bytes(atob(body.replace(/\s+/g, ""))), cs) : enc === "quoted-printable" ? mdec(b2bytes(unq(body)), cs) : body; } catch (e) { txt = body; }
    out.push({ type: ct.startsWith("text/html") ? "html" : "plain", text: txt });
    return h;
  }
  function isEml(s) { return /^\s*(Received|Return-Path|Delivered-To|MIME-Version|From|Date|Subject|Message-ID|X-[\w-]+):/i.test(s.slice(0, 600)) && /Content-Type:/i.test(s.slice(0, 20000)); }
  function readEml(raw) {
    const parts = [], [hh] = splitHB(raw), h = hdrs(hh); walk(raw, parts);
    return { from: ew(h.from || ""), subject: ew(h.subject || ""), date: h.date || "", parts };
  }

  // ---------- числа/даты ----------
  const num = s => { const v = parseFloat(String(s).replace(/\s/g, "").replace(",", ".")); return isFinite(v) ? v : NaN; };
  const R2 = v => Math.round(v * 100) / 100;
  const NUMLINE = /^-?\d[\d ]*(?:[.,]\d+)?$/;
  const isNum = s => NUMLINE.test(s);
  const pad = n => String(n).padStart(2, "0");
  function findDate(lines) {
    for (const l of lines) {
      let m = /(\d{2})\.(\d{2})\.(\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/.exec(l); if (m) return m[3] + "-" + m[2] + "-" + m[1];
      m = /(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(l); if (m) return m[1] + "-" + m[2] + "-" + m[3];
      m = /\b(\d{2})\.(\d{2})\.(\d{2})\s+\d{1,2}:\d{2}/.exec(l); if (m) return "20" + m[3] + "-" + m[2] + "-" + m[1];
    }
    return "";
  }
  function normLines(t) {
    return t.replace(/[​-‏⁠⠀͏­﻿]/g, "").replace(/[   ]/g, " ").split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  // ---------- позиции ----------
  // А: «1.» / имя / цена / кол-во / сумма (1-ОФД и подобные табличные)
  function stratBlock(L) {
    const items = [];
    for (let i = 0; i < L.length; i++) {
      let name = "", j;
      const m1 = /^(\d{1,3})[.)]$/.exec(L[i]), m2 = /^(\d{1,3})[.)]\s+(\D.*)$/.exec(L[i]);
      if (m1) { j = i + 1; } else if (m2) { name = m2[2]; j = i + 1; } else continue;
      let guard = 0; while (j < L.length && !isNum(L[j]) && guard < 3) { name += (name ? " " : "") + L[j]; j++; guard++; }
      if (!name || j + 2 >= L.length + 0 || !(isNum(L[j]) && isNum(L[j + 1]) && isNum(L[j + 2]))) continue;
      const p = num(L[j]), q = num(L[j + 1]), s = num(L[j + 2]);
      if (!(s >= 0) || !(q > 0)) continue;
      items.push({ name, amount: R2(s), price: p, qty: q }); i = j + 2;
    }
    return items;
  }
  // Б: всё в одной строке: «Имя 175.49 x 2 = 350.98» / «Имя 2 x 175.49 350.98»
  function stratInline(L) {
    const items = [], X = "[xх×*]";
    const re1 = new RegExp("^(?:\\d{1,3}[.)]\\s*)?(.+?)\\s+(-?\\d[\\d ]*[.,]\\d{2})\\s*(?:руб\\.?|₽|р\\.?)?\\s*" + X + "\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:шт|кг|г|л|уп)?\\.?\\s*(?:=|—|-)?\\s*(-?\\d[\\d ]*[.,]\\d{2})", "i");
    const re2 = new RegExp("^(?:\\d{1,3}[.)]\\s*)?(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:шт|кг|г|л|уп)?\\.?\\s*" + X + "\\s*(-?\\d[\\d ]*[.,]\\d{2})\\s*(?:руб\\.?|₽|р\\.?)?\\s*(?:=|—|-)?\\s*(-?\\d[\\d ]*[.,]\\d{2})", "i");
    for (const l of L) {
      let m = re1.exec(l); if (m && isNaN(num(m[1]))) { items.push({ name: m[1], amount: R2(num(m[4])), price: num(m[2]), qty: num(m[3]) }); continue; }
      m = re2.exec(l); if (m && isNaN(num(m[1]))) items.push({ name: m[1], amount: R2(num(m[4])), price: num(m[3]), qty: num(m[2]) });
    }
    return items;
  }
  // В: имя / «N шт» / «X руб» (Ашан и подобные письма магазина)
  function stratTriple(L) {
    const items = [];
    for (let i = 0; i + 2 < L.length; i++) {
      const q = /^(\d+(?:[.,]\d+)?)\s*(шт|кг|г|л|уп)\.?$/i.exec(L[i + 1]), p = /^(\d[\d ]*(?:[.,]\d+)?)\s*(?:руб\.?|₽|р\.?)$/i.exec(L[i + 2]);
      if (q && p && !isNum(L[i]) && !/руб|₽/i.test(L[i])) { items.push({ name: L[i], amount: R2(num(p[1])), price: num(p[1]), qty: num(q[1]), amb: true }); i += 2; }
    }
    return items;
  }

  // Г: «плоский» текст — когда копирование склеило ячейки таблицы в одну строку. Ищем «имя цена кол-во сумма», проверяя цена×кол-во≈сумма.
  function cleanName(n) {
    n = n.replace(/^.*(?:Наименование|Цена за ед\.?|Кол\.?|Сумма)\s+(?=\d{1,3}[.)]\s)/i, "");
    n = n.replace(/^.*(?:НДС\s*\d+\s*%?\s*[\d.,]+|Полный расчет|Код товара\s*\S+|\[M\+\]|\bТМ\b|Товар)\s+/i, "");
    n = n.replace(/^[\d.,% ]+?(?=\d{1,3}[.)]\s+\S)/, "").replace(/^\d{1,3}[.)]\s+/, "");
    return n.replace(/\s+/g, " ").trim();
  }
  function stratFlat(L) {
    const flat = L.join(" "), P = "(\\d{1,3}(?: \\d{3})+[.,]\\d{2}|\\d+[.,]\\d{2})", C = "\\s*(?:₽|руб\\.?|р\\.?)?";
    const re = new RegExp("(?:^|\\s)(\\S.{1,160}?)\\s+" + P + C + "\\s+(\\d+(?:[.,]\\d{1,3})?)\\s*(?:шт|кг|г|л|уп|упак)?\\.?\\s+" + P + C + "(?=\\s|$)", "gi"), items = [];
    let m;
    while ((m = re.exec(flat))) {
      const p = num(m[2]), q = num(m[3]), sm = num(m[4]);
      if (!(q > 0) || !(sm > 0) || Math.abs(p * q - sm) > Math.max(0.02, sm * 0.006)) { re.lastIndex = m.index + 1; continue; }
      const name = cleanName(m[1]); if (name.length < 2 || !/[A-Za-zА-Яа-яЁё]/.test(name)) { continue; }
      items.push({ name, amount: R2(sm), price: p, qty: q });
    }
    return items;
  }

  function stratFlatTriple(L) {
    const flat = L.join(" "), re = /(\S.{1,140}?)\s+(\d+(?:[.,]\d+)?)\s*(?:шт|кг|г|л|уп)\.?\s+(\d[\d ]*(?:[.,]\d+)?)\s*(?:руб\.?|₽|р\.?)(?=\s|$)/gi, items = [];
    let m, first = true;
    while ((m = re.exec(flat))) {
      let name = m[1]; if (first) { first = false; if (name.length > 50 && name.includes(":")) name = name.slice(name.lastIndexOf(":") + 1).replace(/^\s*\(\d+\)\s*\S+\s+/, ""); }
      name = name.replace(/\s+/g, " ").trim(); const a = num(m[3]);
      if (name.length >= 2 && a > 0) items.push({ name, amount: R2(a), price: a, qty: num(m[2]), amb: true });
    }
    return items;
  }
  // Д: заказ маркетплейса/аптеки (Ютека): «N товар(а)» / [ПО РЕЦЕПТУ] / название / производитель / «614 Р» ... «Итого» / «613.7 Р»
  function stratOrder(L) {
    const h = L.findIndex(l => /^\d+\s+товар(?:а|ов)?$/i.test(l)); if (h < 0) return [];
    let e = L.findIndex((l, i) => i > h && /^итого(?![а-яё])/i.test(l)); if (e < 0) e = L.length;
    const items = [], tag = /^(?:по рецепту|рецепт|акция|хит|скидка|новинка|в наличии)$/i, price = /^(\d[\d ]*(?:[.,]\d+)?)\s*(?:р|руб\.?|₽)$/i;
    let seg = [];
    for (let i = h + 1; i < e; i++) {
      const l = L[i], pm = price.exec(l);
      if (!pm) { if (!tag.test(l)) seg.push(l); continue; }
      let q = 1, nm = seg.filter(x => { const m = /^(?:(\d+)\s*(?:шт|уп)\.?|[xх×]\s*(\d+))$/i.exec(x); if (m) { q = +(m[1] || m[2]); return false; } return true; });
      seg = [];
      if (!nm.length) continue;
      const pr = num(pm[1]); items.push({ name: nm[0], amount: R2(pr * q), price: pr, qty: q, ord: true });
    }
    return items;
  }
  function findTotal(L) {
    { const f = L.join(" "), m = /(?:итого|общая сумма(?: покупки| чека)?|сумма чека|к оплате)\s*:?\s*(\d{1,3}(?: \d{3})+[.,]\d{2}|\d+[.,]\d{2})/i.exec(f); if (m && !L.some(l => /^(?:итого|итог|общая сумма|сумма чека|к оплате)/i.test(l))) return R2(num(m[1])); }
    const re = /^(?:итого|итог|общая сумма(?: покупки| чека)?|сумма чека|к оплате|всего(?: к оплате)?)(?![а-яё])\s*[:=]?\s*(.*)$/i;
    for (let i = 0; i < L.length; i++) {
      const m = re.exec(L[i]); if (!m) continue;
      let t = m[1]; if (!/\d/.test(t) && L[i + 1]) t = L[i + 1];
      const n = /(-?\d[\d ]*(?:[.,]\d{1,2})?)/.exec(t); if (n) { const v = num(n[1]); if (v > 0) return R2(v); }
    }
    return 0;
  }
  function titleCase(s) { return s === s.toUpperCase() && /[А-ЯЁA-Z]/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s; }
  function findMerchant(L, from) {
    { const f = L.join(" "), m = /Магазин\s*[«"“](.+?)[»"”]/i.exec(f); if (m && m[1].length < 50) return m[1].trim(); }
    { const f = L.slice(0, 120).join(" "), m = /(?:ООО|АО|ПАО|ЗАО|ОАО)\s+[«"“](.+?)[»"”]/.exec(f); if (m && m[1].length < 50) return m[1].trim(); }
    for (const l of L.slice(0, 80)) {
      const m = /^(?:ООО|АО|ПАО|ЗАО|ОАО|ИП)\s+[«"“]?(.+?)[»"”]?$/i.exec(l);
      if (m && l.length < 70) return m[1].replace(/[«»"“”]/g, "").trim();
    }
    const f = (from || "").replace(/<.*?>/g, "").replace(/["«»]/g, "").trim();
    if (f && !/чек|ofd|офд|noreply|no-reply/i.test(f)) return titleCase(f);
    return "";
  }

  function parseLines(L, meta) {
    meta = meta || {};
    const total = findTotal(L), cands = [stratBlock(L), stratInline(L), stratTriple(L), stratFlat(L), stratFlatTriple(L), stratOrder(L)];
    const sum = a => R2(a.reduce((t, x) => t + x.amount, 0));
    let best = null;
    cands.forEach(a => {
      if (!a.length) return;
      const ok = total && Math.abs(sum(a) - total) < 0.011;
      if (!best || (ok && !best.ok) || (ok === best.ok && a.length > best.a.length)) best = { a, ok };
    });
    let items = best ? best.a : [];
    // цены в заказах округлены до рубля, а итог — с копейками: разницу в пределах рубля на позицию относим на самую дорогую
    if (total && items.length && items.every(x => x.ord)) { const d = R2(total - sum(items)); if (Math.abs(d) > 0.001 && Math.abs(d) <= items.length) { const mx = items.reduce((a, b) => b.amount > a.amount ? b : a); mx.amount = R2(mx.amount + d); mx.price = R2(mx.amount / mx.qty); } }
    // «неоднозначные» строки (Ашан): если сумма цен*кол-во сходится с итогом лучше — берём её
    if (items.some(x => x.amb && x.qty !== 1) && total) {
      const alt = items.map(x => R2(x.price * x.qty));
      if (Math.abs(alt.reduce((a, b) => a + b, 0) - total) < Math.abs(sum(items) - total)) items.forEach((x, i) => { x.amount = alt[i]; });
    }
    items = items.filter(x => x.amount > 0).map(x => ({ name: x.name.replace(/\s+/g, " ").slice(0, 80), amount: x.amount, price: x.price, qty: x.qty, cat: "" }));
    const date = findDate(L) || (meta.date ? (() => { const d = new Date(meta.date); return isNaN(d) ? "" : d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); })() : "");
    const merchant = findMerchant(L, meta.from), got = sum(items);
    const j = L.join("\n");
    const ordNo = items.length && L.some(l => /^\d+\s+товар/i.test(l)) ? ((/(?:заказ\s*)?№\s*(\d{6,})/i.exec(L.join(" ")) || [])[1] || "") : "";
    const fd = ordNo || (/№\s*ФД\s*:?\s*(\d+)/i.exec(j) || /Кассовый чек\s*№\s*(\d+)/i.exec(j) || /Чек\s*№\s*:?\s*(\d+)/i.exec(j) || [])[1] || "";
    const refund = /возврат\s+(?:прихода|расхода|покупки)/i.test(j) || /признак расчета\s*:?\s*возврат/i.test(j);
    return { merchant, date, total: total || got, items, ok: !!total && Math.abs(got - total) < 0.011, key: [merchant, date, total || got, fd].join("|"), refund };
  }

  function parse(input, meta) {
    meta = Object.assign({}, meta || {});
    let variants = [];
    if (typeof input !== "string") input = "";
    if (isEml(input)) {
      const e = readEml(input); meta.from = meta.from || e.from; meta.date = meta.date || e.date; meta.subject = meta.subject || e.subject;
      variants = e.parts.map(p => p.type === "html" ? htmlToText(p.text) : p.text);
    } else variants = [/<(html|body|table|div|td|br)\b/i.test(input) ? htmlToText(input) : input];
    let best = null;
    variants.forEach(t => { const r = parseLines(normLines(t), meta); if (!best || (r.ok && !best.ok) || (r.ok === best.ok && r.items.length > best.items.length)) best = r; });
    return best || { merchant: "", date: "", total: 0, items: [], ok: false, key: "", refund: false };
  }

  // ---------- автокатегории из истории трат (без ИИ) ----------
  const STOP = new Set("для без над под при про или как все это его она они пак уп шт кг мл бзмж пнд ст/б м/у д/пак гот охл зам вес".split(" "));
  const nn = s => String(s || "").toLowerCase().replace(/ё/g, "е");
  const toks = s => nn(s).replace(/[^a-zа-я\s]/g, " ").split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)).map(w => w.length > 6 ? w.slice(0, 6) : w);
  function vote(m, k, c, w) { const o = m[k] || (m[k] = {}); o[c] = (o[c] || 0) + (w || 1); }
  function top(o) { let b = "", bv = 0, t = 0; for (const c in o) { t += o[c]; if (o[c] > bv) { bv = o[c]; b = c; } } return { cat: b, v: bv, t }; }
  function learn(txs, validCats) {
    const names = {}, words = {}, merch = {};
    (txs || []).forEach(t => {
      if (t.kind !== "exp" || !t.note || !t.category_id || (validCats && !validCats.has(t.category_id))) return;
      let note = t.note.trim(), mer = "";
      const m = /^([^:·]{2,30}?)\s*(?::|·)\s+(.+)$/.exec(note); if (m) { mer = nn(m[1]).trim(); note = m[2]; }
      if (mer) vote(merch, mer, t.category_id);
      note.split(/,\s+/).forEach(p => { const k = nn(p).replace(/\s+/g, " ").trim(); if (!k) return; vote(names, k, t.category_id); toks(k).forEach(w => vote(words, w, t.category_id)); });
    });
    return { names, words, merch };
  }
  function suggest(L, name, merchant) {
    const k = nn(name).replace(/\s+/g, " ").trim(), ex = L.names[k]; if (ex) return top(ex).cat;
    const sc = {};
    toks(name).forEach(w => { const o = L.words[w]; if (!o) return; const t = top(o); if (t.t < 2) return; for (const c in o) sc[c] = (sc[c] || 0) + o[c] / t.t * Math.min(1, t.t / 4); });
    const s = top(sc); if (s.cat && s.v >= 0.6) return s.cat;
    const mm = L.merch[nn(merchant).trim()]; if (mm) { const t = top(mm); if (t.t >= 3 && t.v / t.t >= 0.6) return t.cat; }
    return "";
  }

  const api = { parse, htmlToText, readEml, isEml, learn, suggest };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RCP = api;
})(typeof self !== "undefined" ? self : this);
