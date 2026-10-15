/* Личная инфляция: справочник цен по товарам из чеков. Без ИИ, только правила. */
(function (root) {
  "use strict";
  const STOP = new Set("для без над под при про или как все это его она они пак уп шт кг мл бзмж пнд ст/б м/у гот охл зам вес упак пачка новый вкус".split(" "));
  const nn = s => String(s || "").toLowerCase().replace(/ё/g, "е");
  // ключ товара: слова без размеров/процентов/упаковки, первые 4 значимых слова, обрезка окончаний
  function key(name) {
    const s = nn(name).replace(/\d+(?:[.,]\d+)?\s*(?:%|кг|гр|г|мл|л|шт|уп|упак|см|мм|м)\b\.?/g, " ").replace(/[^a-zа-я\s]/g, " ");
    return s.split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)).slice(0, 4).map(w => w.length > 7 ? w.slice(0, 7) : w).join(" ");
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
  // цены из старых ручных заметок: «тунец 450», «Тунец по 520 р/кг», «Ашан: молоко 95, хлеб 60»
  function fromNote(note, amount) {
    let n = String(note || "").trim();
    n = n.replace(/^[^:·,\d]{2,30}?\s*[:·]\s+/, "");              // префикс «Магазин: » / «Магазин · »
    n = n.replace(/(?<![а-яёa-z])(?:по\s+акции|акция|акции|акц\.?|скидка|скидке|распродажа|по\s+цене|цена|цены)(?![а-яёa-z])/gi, " ").replace(/\s+/g, " ").trim();
    const parts = [];
    n.split(/\s*,\s+|\s+,\s*|;\s*|\n+/).map(x => x.trim()).filter(Boolean).forEach(x => {
      if (parts.length && /^\d+(?:[.,]\d+)?\s*(?:₽|р\.?|руб\.?)?$/.test(x)) parts[parts.length - 1] += " " + x; else parts.push(x);   // «тунец 3шт , 450»
    });
    const out = [];
    parts.forEach(p00 => {
      if (/\d{1,2}[.,]\d{1,2}[.,]\d{2,4}/.test(p00)) return;      // даты не цены
      const p0 = p00;
      const qm = /(\d+(?:[.,]\d+)?)\s*шт(?![а-яёa-z])/i.exec(p0), N = qm ? parseFloat(qm[1].replace(",", ".")) : 0;
      const p = p0.replace(/\d+(?:[.,]\d+)?\s*(?:%|кг|гр|г|мл|л|шт|уп|упак)(?![а-яёa-z])\.?/gi, " ").replace(/\s+/g, " ").trim();
      const m = /^([^\d]*[а-яёa-z][^\d]*?)\s*(?:по|-|—|:|=|x|х)?\s*(\d+(?:[.,]\d+)?)\s*(?:₽|р\.?|руб\.?|рублей)?\s*(?:\/\s*(?:кг|шт|л|г))?\.?$/i.exec(p);
      if (!m) return;
      const name = m[1].replace(/\s*(?:по|-|—|:|=)\s*$/i, "").trim(), price = parseFloat(m[2].replace(",", "."));
      if (name.length < 3 || !(price >= 10) || !key(name)) return;
      if (/^\d{1,2}[.,](?:0\d|1[0-2])$/.test(m[2]) && Math.abs(+amount - price) > 0.5) return;   // похоже на дату 12.05
      const a = +amount;
      if (N > 1) {   // «3шт, цена 450» = 450 за все три; «3шт по 150» = 150 за штуку
        const perPiece = /(?<![а-яёa-z])по\s+\d/i.test(p0) || (a > 0 && Math.abs(a - price * N) <= 1);
        out.push({ name, price: Math.round((perPiece ? price : price / N) * 100) / 100, qty: N });
        return;
      }
      let qty = 1;
      if (parts.length === 1 && a > 0 && Math.abs(a - price) > 0.5) { const q = a / price; if (q >= 0.05 && q <= 50) qty = Math.round(q * 1000) / 1000; }
      out.push({ name, price, qty });
    });
    return out;
  }
  const api = { key, unitPrice, groups, summary, fromNote };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PRC = api;
})(typeof self !== "undefined" ? self : this);
