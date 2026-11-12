// Прокси для модели расшифровки: GitHub не отдаёт файлы релиза в браузер напрямую (нет CORS), поэтому сайт тянет их сам и стримит дальше.
const OK = { "model.int8.onnx": 1, "tokens.txt": 1 };
export async function onRequestGet({ params }) {
  const f = String(params.file || "");
  if (!OK[f]) return new Response("not found", { status: 404 });
  const r = await fetch("https://github.com/baklanov1993dmitry-gif/moi-dela/releases/download/asr/" + f, { redirect: "follow", headers: { "User-Agent": "moi-dela" } });
  if (!r.ok) return new Response("upstream " + r.status, { status: 502 });
  const h = new Headers({ "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=86400" });
  const n = r.headers.get("content-length"); if (n) h.set("Content-Length", n);
  return new Response(r.body, { status: 200, headers: h });
}
