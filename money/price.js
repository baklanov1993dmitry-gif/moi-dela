/* Личная инфляция: справочник цен по товарам из чеков. Без ИИ, только правила. */
(function (root) {
  "use strict";
  const STOP = new Set("для без над под при про или как все это его она они пак уп шт кг мл бзмж пнд ст/б м/у гот охл зам вес упак пачка новый вкус проц озон быстрик вкусный вкусно вкусная хорошая хорошо хороший плохой плохая средний средние сегодня сразу еще акция акции свежий большой".split(" "));
  const nn = s => String(s || "").toLowerCase().replace(/ё/g, "е");
  // ключ товара: слова без размеров/процентов/упаковки, первые 4 значимых слова, обрезка окончаний
  function key(name) {
    const s = nn(name).replace(/\d+(?:[.,]\d+)?\s*(?:%|проц|кг|гр|г|мл|л|шт|уп|упак|см|мм|м)(?![а-яёa-z])\.?/g, " ").replace(/[^a-zа-я\s]/g, " ");
    return s.split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)).slice(0, 3).map(w => w.length > 7 ? w.slice(0, 7) : w).join(" ");
  }
  // цена за единицу (кг/л/шт): берём цену из чека, если она сходится с суммой, иначе сумма/кол-во
  function unitPrice(price, qty, amount) {
    const p = +price, q = +qty, a = +amount;
    if (q > 0 && a > 0) { if (p > 0 && Math.abs(p * q - a) <= Math.max(0.05, a * 0.01)) return Math.round(p * 100) / 100; return Math.round(a / q * 100) / 100; }
    return a > 0 ? Math.round(a * 100) / 100 : 0;
  }
  const t = r => new Date(r.ts).getTime();
  // группировка записей в товары: [{key, name, rows(по возрастанию даты), first, last, prev, count, pct, pctPrev}]
  function groups(rows, alias) {
    alias = alias || {};
    const m = new Map();
    (rows || []).forEach(r => { if (!(r.price > 0)) return; const k0 = r.pkey || key(r.name), k = alias[k0] || k0; if (!k) return; (m.get(k) || m.set(k, []).get(k)).push(r); });
    const out = [];
    m.forEach((L, k) => {
      L.sort((a, b) => t(a) - t(b));
      const first = L[0], last = L[L.length - 1], prev = L.length > 1 ? L[L.length - 2] : null;
      out.push({ key: k, name: last.name, rows: L, first, last, prev, count: L.length,
        pct: L.length > 1 && first.price > 0 ? (last.price / first.price - 1) * 100 : null,
        pctPrev: prev && prev.price > 0 ? (last.price / prev.price - 1) * 100 : null });
    });
    return out;
  }
  // личная инфляция по всем товарам с ≥2 покупками: медиана изменений и годовая оценка
  function summary(gs) {
    const L = gs.filter(g => g.pct != null && g.last && g.first && t(g.last) - t(g.first) > 7 * 864e5);
    if (!L.length) return null;
    const ch = L.map(g => g.pct).sort((a, b) => a - b), med = ch[Math.floor(ch.length / 2)];
    const yr = L.map(g => (Math.pow(g.last.price / g.first.price, 365 * 864e5 / (t(g.last) - t(g.first))) - 1) * 100).sort((a, b) => a - b);
    return { n: L.length, med, year: yr[Math.floor(yr.length / 2)] };
  }
  // цены из старых ручных заметок. Реальные форматы: «Дыня по 100» (цена за кг), «Шницель 2шт» (сумма записи на 2 шт),
  // «Молоко 1.4л» (упаковка), «Рёбрышки 1.7кг» (цена за кг = сумма/вес), «Тушёнка 3шт акция»
  const NOISE = /(?<![а-яёa-z])(?:по\s+акции|акция|акции|акц\.?|скидка|скидке|распродажа)(?![а-яёa-z])/gi;
  const NUM = "(\\d+(?:[.,]\\d+)?)", END = "(?![а-яёa-z])";
  const RE_PO = new RegExp("(?<![а-яёa-z])по\\s+" + NUM + "(?!\\s*(?:кг|гр|г|мл|л|шт)" + END + ")(?![.,]?\\d)", "i");
  const RE_N = new RegExp("(?<![а-яёa-z]по\\s)" + NUM + "\\s*(?:штук|шт|пачек|пачки|пачка|банки|банок|банка|пар|упак|уп)" + END, "i");
  const RE_SZ = new RegExp(NUM + "\\s*(кг|гр|г|мл|л)" + END, "i");
  const RE_TRAIL = /\s(\d{1,2})$/;
  const num = x => parseFloat(String(x).replace(",", "."));
  const r2 = x => Math.round(x * 100) / 100;
  function nm(p, idx) {   // название: текст до первого признака цены/количества
    let h = p.slice(0, idx).replace(/[\s,;:.\-—]+$/g, "").replace(/\s+по$/i, "").trim();
    if (h.length < 3) h = p.replace(/\d+(?:[.,]\d+)?\s*[а-яёa-z]*/gi, " ").replace(/\s+/g, " ").trim();
    return h;
  }
  function fromNote(note, amount) {
    let n = String(note || "").trim();
    n = n.replace(/^[^:·,\d]{2,30}?\s*[:·]\s+/, "").replace(NOISE, " ").replace(/\s+/g, " ").trim();
    const a = +amount, parts = [];
    n.split(/\s*,\s+|\s+,\s*|;\s*|\n+/).map(x => x.trim()).filter(Boolean).forEach(x => parts.push(x));
    const single = parts.length === 1, out = [];
    parts.forEach(p => {
      if (/\d{1,2}[.,]\d{1,2}[.,]\d{2,4}/.test(p)) return;                       // даты
      let m;
      if ((m = RE_PO.exec(p))) {                                                      // «Дыня по 100»: цена за кг/шт
        const price = num(m[1]), name = nm(p, m.index);
        if (price >= 10 && name.length >= 3 && key(name)) { let q = single && a > 0 ? a / price : 1; if (!(q >= 0.05 && q <= 50)) q = 1; out.push({ name, price, qty: Math.round(q * 1000) / 1000 }); }
        return;
      }
      if (!single || !(a > 0)) return;                                                // дальше цена берётся из суммы записи
      if ((m = RE_N.exec(p))) {                                                       // «Шницель 2шт»
        const N = num(m[1]), name = nm(p, m.index);
        if (N >= 1 && N <= 30 && name.length >= 3 && key(name)) out.push({ name, price: r2(a / N), qty: N });
        return;
      }
      if ((m = RE_SZ.exec(p))) {                                                      // «Молоко 1.4л», «Ребрышки 1.7кг»
        const sz = num(m[1]), kg = /^кг$/i.test(m[2]), name = nm(p, m.index);
        if (sz <= 30 && name.length >= 3 && key(name)) out.push(kg && sz > 0 ? { name, price: r2(a / sz), qty: sz } : { name, price: a, qty: 1 });
        return;
      }
      if ((m = RE_TRAIL.exec(p)) && !/\d[.,]\d/.test(p)) {                            // «Макароны 3»
        const N = num(m[1]), name = nm(p, m.index);
        if (N >= 2 && name.length >= 3 && key(name)) out.push({ name, price: r2(a / N), qty: N });
      }
    });
    return out;
  }
  const api = { key, unitPrice, groups, summary, fromNote };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PRC = api;
})(typeof self !== "undefined" ? self : this);
