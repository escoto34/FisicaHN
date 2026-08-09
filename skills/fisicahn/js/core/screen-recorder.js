/**
 * WAVE 9 §9.2 — Grabación de vídeo del canvas (WebM) y secuencia PNG.
 *
 * - `recordWebm(canvas, {fps, mime, durationMs, onProgress})` → usa
 *   `canvas.captureStream` + `MediaRecorder` (ambos nativos). No se empaquetó
 *   un encoder GIF en el runtime (principio de cero dependencias del
 *   artefacto, §7.2): WebM + PNG cubren la exportación completa.
 * - `exportPngSequence(canvas, ...)` → frames PNG descargados.
 *
 * GIF futuro: generarlo en dev con un encoder servido desde scripts/ (no en
 * el bundle publicado) — está anotado en mejoras.md §9.2.
 */

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Graba el canvas a WebM con MediaRecorder (sin dependencias).
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @param {number} [opts.fps=30]
 * @param {string} [opts.mime='video/webm']
 * @param {number} [opts.durationMs=0]  parada automática (0 = manual)
 * @param {(pct: number) => void} [opts.onProgress]
 * @returns {object} control con start/stop/pause/resume/isRecording
 */
export function recordWebm(canvas, opts = {}) {
  const { fps = 30, mime = 'video/webm', durationMs = 0, onProgress } = opts;
  const stream = canvas.captureStream(fps);
  const chunks = [];
  let recorder = null;
  let timer = null;
  let autoStop = null;

  const supported =
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime);
  recorder = new MediaRecorder(stream, supported ? { mime } : {});
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = () => stream.getTracks().forEach((t) => t.stop());

  const started = { t: 0 };

  /** @type {object} */
  const ctl = {
    async start() {
      chunks.length = 0;
      started.t = performance.now();
      if (durationMs > 0 && typeof onProgress === 'function') {
        timer = setInterval(() => {
          const pct = Math.min(100, ((performance.now() - started.t) / durationMs) * 100);
          onProgress(pct);
        }, 200);
      }
      recorder.start(1000);
      if (durationMs > 0) autoStop = setTimeout(() => ctl.stop(), durationMs);
      return ctl;
    },
    pause() {
      if (recorder.state === 'recording') recorder.pause();
    },
    resume() {
      if (recorder.state === 'paused') recorder.resume();
    },
    get isRecording() {
      return recorder.state === 'recording';
    },
    async stop() {
      if (recorder.state === 'inactive') return null;
      if (autoStop) clearTimeout(autoStop);
      if (timer) clearInterval(timer);
      const done = new Promise((res) =>
        recorder.addEventListener('stop', () =>
          res(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }))
        )
      );
      recorder.stop();
      const blob = await done;
      return { blob, mime: blob.type };
    },
  };
  return ctl;
}

/**
 * Secuencia de frames PNG (se descargan uno a uno al disco).
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @param {number} [opts.count=10]
 * @param {number} [opts.scale=1]     escala lineal (PNG grande)
 * @param {number} [opts.frameMs=80]  espera entre capturas
 * @param {(i: number, total: number) => void} [opts.onFrame]
 */
export async function exportPngSequence(canvas, opts = {}) {
  const { count = 10, scale = 1, frameMs = 80, onFrame } = opts;
  const out = [];
  for (let i = 0; i < count; i++) {
    const snap = document.createElement('canvas');
    snap.width = Math.round(canvas.width * scale);
    snap.height = Math.round(canvas.height * scale);
    const ctx = snap.getContext('2d');
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.drawImage(canvas, 0, 0);
    const blob = await new Promise((res) => snap.toBlob((b) => res(b), 'image/png'));
    downloadBlob(blob, `fisicahn-${String(i + 1).padStart(3, '0')}.png`);
    out.push(blob);
    onFrame?.(i + 1, count);
    if (i < count - 1) await sleepMs(frameMs);
  }
  return out;
}