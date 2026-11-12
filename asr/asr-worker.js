/* Воркер расшифровки: свой экземпляр ONNX Runtime (1 поток) + GigaAM v3 + Silero VAD. Модель читает из Cache Storage «moidela-asr».
   Сообщения: init {base, v, modelKey} → ready; run {pcm, off} → prog / line / done; cancel. */
let ORT, CORE, asr, vad, id2, cancelled = false;
self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === "init") {
      importScripts(m.base + "ort.wasm.min.js?v=" + m.v, m.base + "asr-core.js?v=" + m.v);
      ORT = self.ort; CORE = self.ASRCORE;
      ORT.env.wasm.numThreads = 1; ORT.env.wasm.proxy = false; ORT.env.wasm.wasmPaths = m.base;
      const c = await caches.open("moidela-asr"), r = await c.match(m.modelKey);
      if (!r) throw new Error("модель не найдена в кэше браузера");
      let buf = new Uint8Array(await r.arrayBuffer());
      asr = await ORT.InferenceSession.create(buf, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      buf = null;
      const vb = new Uint8Array(await (await fetch(m.base + "silero_vad.onnx?v=" + m.v)).arrayBuffer());
      vad = await ORT.InferenceSession.create(vb, { executionProviders: ["wasm"] });
      id2 = CORE.parseTokens(await (await fetch(m.base + "tokens.txt?v=" + m.v)).text());
      postMessage({ type: "ready" });
    } else if (m.type === "run") {
      cancelled = false;
      const out = await CORE.transcribe(ORT, asr, vad, id2, m.pcm, {
        extra: (m.extra || []).map(p => { try { return [new RegExp("(?<![\\p{L}\\p{N}])" + p[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}])", "giu"), p[1]]; } catch (x) { return null; } }).filter(Boolean),
        cancel: () => cancelled,
        onProgress: (p, st) => postMessage({ type: "prog", p, st }),
        onLine: l => postMessage({ type: "line", t: l.t + m.off, text: l.text })
      });
      postMessage({ type: "done", n: out.length, cancelled });
    } else if (m.type === "cancel") cancelled = true;
  } catch (err) { postMessage({ type: "error", msg: String(err && err.message || err) }); }
};
