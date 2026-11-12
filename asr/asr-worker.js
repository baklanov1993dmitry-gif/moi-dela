/* Воркер расшифровки: свой экземпляр ONNX Runtime (1 поток) + GigaAM v3 RNNT. Энкодер (≈225 МБ) читает из Cache Storage «moidela-asr», предсказатель/joiner/токены — из asr/.
   Сообщения: init {base, v, modelKey} → ready; run {pcm, off} → prog / line / done; cancel. */
let ORT, CORE, M, id2, cancelled = false;
self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === "init") {
      importScripts(m.base + "ort.wasm.min.js?v=" + m.v, m.base + "asr-core.js?v=" + m.v);
      ORT = self.ort; CORE = self.ASRCORE;
      ORT.env.wasm.numThreads = 1; ORT.env.wasm.proxy = false; ORT.env.wasm.wasmPaths = m.base;
      const c = await caches.open("moidela-asr"), r = await c.match(m.modelKey);
      if (!r) throw new Error("модель не найдена в кэше браузера");
      const opt = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
      let buf = new Uint8Array(await r.arrayBuffer());
      const enc = await ORT.InferenceSession.create(buf, opt);
      buf = null;
      const get = async f => new Uint8Array(await (await fetch(m.base + f + "?v=" + m.v)).arrayBuffer());
      M = { enc, dec: await ORT.InferenceSession.create(await get("rnnt-decoder.onnx"), opt), join: await ORT.InferenceSession.create(await get("rnnt-joiner.onnx"), opt) };
      id2 = CORE.parseTokens(await (await fetch(m.base + "rnnt-tokens.txt?v=" + m.v)).text());
      postMessage({ type: "ready" });
    } else if (m.type === "run") {
      cancelled = false;
      const out = await CORE.transcribe(ORT, M, id2, m.pcm, {
        extra: (m.extra || []).map(p => { try { return [new RegExp("(?<![\\p{L}\\p{N}])" + p[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}])", "giu"), p[1]]; } catch (x) { return null; } }).filter(Boolean),
        cancel: () => cancelled,
        onProgress: (p, st) => postMessage({ type: "prog", p, st }),
        onLine: l => postMessage({ type: "line", t: l.t + m.off, text: l.text })
      });
      postMessage({ type: "done", n: out.length, cancelled });
    } else if (m.type === "cancel") cancelled = true;
  } catch (err) { postMessage({ type: "error", msg: String(err && err.message || err) }); }
};
