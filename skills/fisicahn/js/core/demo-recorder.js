/**
 * WAVE 9 §9.1 — Grabación y reproducción de demos (tiempo real de simulación).
 *
 * Modelo: una demo es una secuencia de **muestras** espaciadas en el tiempo
 * de SIMULACIÓN (por defecto 15 muestras/s), cada una con el estado completo
 * del módulo (`getState()` si existe) y los parámetros. La reproducción avanza
 * por tiempo-consulta consultando el reloj: el mismo t siempre muestra el
 * mismo estado — «en tiempo, no según FPS» (§9.1).
 *
 * Los módulos legacy sin `getState/setState` se graban igualmente (solo
 * parámetros + reset): reproducción visual, no determinista.
 *
 * API:
 *   const rec = new DemoRecorder({ getTime, sample, moduleId })
 *   rec.start(); (por tick anfitrión) rec.tick(); rec.stop() → demo
 *   DemoStore.save(demo) / .list() / .get(id) / .delete(id)
 *   validateDemo(json) → demo válido o null (import de archivos)
 *   replayDemo(demo, adapter, {speed, onDone, onProgress}) → {pause,resume,progress}
 *   demoToJson(demo) / demoFromJson(text)   (serialización estable)
 */
// descarga JSON con Blob+URL nativos (sin dependencias)
export const DEMO_FORMAT = 'fisicahn-demo-v1';
export const DEFAULT_SAMPLE_RATE = 15;

/**
 * @typedef {object} DemoSample
 * @property {number} t                tiempo simulado (engine._elapsed)
 * @property {object} params           parámetros del módulo
 * @property {object|null} moduleState getState() si existe
 *
 * @typedef {object} Demo
 * @property {string} format
 * @property {string} moduleId
 * @property {number} createdAt
 * @property {number} sampleRate
 * @property {number} duration          segundos simulados grabados
 * @property {Array<DemoSample>} samples
 */

const sanitize = (value) =>
  JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === 'number' && !Number.isFinite(v) ? null : v
    )
  );

export class DemoRecorder {
  /**
   * @param {object} opts
   * @param {() => number} opts.getTime        tiempo simulado actual
   * @param {() => {params: object, moduleState?: object|null}} opts.sample
   * @param {number} [opts.sampleRate=15]
   * @param {string|null} [opts.moduleId=null]
   */
  constructor({ getTime, sample, sampleRate = DEFAULT_SAMPLE_RATE, moduleId = null }) {
    if (typeof getTime !== 'function' || typeof sample !== 'function') {
      throw new TypeError('DemoRecorder requiere getTime y sample');
    }
    this.getTime = getTime;
    this.sample = sample;
    this.sampleRate = sampleRate;
    this.moduleId = moduleId;
    this.samples = [];
    this.startedAt = 0;
    this.last = -1;
    this.recording = false;
  }

  get isRecording() {
    return this.recording;
  }

  start() {
    this.samples = [];
    this._t0 = this.getTime();
    this.startedAt = this._t0;
    this.last = 0;
    this.recording = true;
    // muestra inicial en t=0 (el estado que se ve al pulsar grabar)
    try {
      const s = this.sample();
      this.samples.push({
        t: 0,
        params: sanitize(s?.params || {}),
        moduleState: s?.moduleState ? sanitize(s.moduleState) : null,
      });
    } catch {
      this.samples.push({ t: 0, params: {}, moduleState: null });
    }
  }

  /** Llama por cada tick del bucle del anfitrión (rAF o update). */
  tick() {
    if (!this.recording) return;
    // Cuantiza al grid de muestreo: la marca de tiempo queda en múltiplos
    // exactos de 1/rate, determinista aunque el reloj avance a saltos.
    const q = Math.round((this.getTime() - this._t0) * this.sampleRate) / this.sampleRate;
    if (q <= this.last) return;
    let params = {};
    let moduleState = null;
    try {
      const s = this.sample();
      params = s?.params || {};
      moduleState = s?.moduleState ?? null;
    } catch {
      // módulo sin contexto de muestra seguro: se registran solo params
      try {
        params = this.sample()?.params || {};
      } catch {
        params = {};
      }
    }
    this.samples.push({
      t: q,
      params: sanitize(params),
      moduleState: moduleState ? sanitize(moduleState) : null,
    });
    this.last = q;
  }

  /** Finaliza: devuelve la demo o null si estaba parada. */
  stop() {
    if (!this.recording) return null;
    this.recording = false;
    this.tick(); // muestra final para cubrir el último fragmento
    const last = this.samples[this.samples.length - 1];
    return {
      format: DEMO_FORMAT,
      moduleId: this.moduleId,
      createdAt: Date.now(),
      sampleRate: this.sampleRate,
      duration: last ? Math.max(0, last.t - this.startedAt) : 0,
      samples: this.samples,
    };
  }
}

/** El objeto es una demo v1 válida (para imports y cargas). */
export function validateDemo(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.format !== DEMO_FORMAT) return null;
  if (typeof json.moduleId !== 'string' || !json.moduleId) return null;
  if (!Array.isArray(json.samples) || json.samples.length === 0) return null;
  let last = -Infinity;
  for (const s of json.samples) {
    if (typeof s.t !== 'number' || !Number.isFinite(s.t)) return null;
    if (s.t < last) return null; // debe ser cronológico
    last = s.t;
    if (!s.params || typeof s.params !== 'object') return null;
  }
  return json;
}

export const DEMO_STORE_KEY = 'fisicahn_demos_v1';
const DEMO_STORE_MAX = 50;

/** Persistencia local de demos (mismo patrón que ScenarioStore). */
export class DemoStore {
  static list() {
    try {
      const raw = localStorage.getItem(DEMO_STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((e) => validateDemo(e.demo)) : [];
    } catch {
      return [];
    }
  }

  /** @returns {string|null} id asignado */
  static save(demo) {
    if (!validateDemo(demo)) return null;
    const id = `${demo.moduleId}__${demo.createdAt}`;
    const list = DemoStore.list().filter((e) => e.id !== id);
    list.unshift({ id, savedAt: demo.createdAt, moduleId: demo.moduleId, demo });
    try {
      localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(list.slice(0, DEMO_STORE_MAX)));
    } catch {
      return null;
    }
    return id;
  }

  static get(id) {
    return DemoStore.list().find((e) => e.id === id)?.demo || null;
  }

  static delete(id) {
    try {
      localStorage.setItem(
        DEMO_STORE_KEY,
        JSON.stringify(DemoStore.list().filter((e) => e.id !== id))
      );
    } catch {
      /* sin almacenamiento */
    }
  }
}

/**
 * Reproduce una demo sobre un adapter del host.
 *
 * @param {Demo} demo
 * @param {object} adapter
 * @param {() => void} adapter.resetSample — estado inicial del módulo
 * @param {(params: object, moduleState: object|null) => void} adapter.applySample
 * @param {object} [opts]
 * @param {number} [opts.speed=1]
 * @param {() => void} [opts.onDone]
 * @param {(pct: number) => void} [opts.onProgress]
 * @returns {{ pause(): void, resume(): void, progress: number, playing: boolean }}
 */
export function replayDemo(demo, adapter, opts = {}) {
  const v = validateDemo(demo);
  if (!v) throw new TypeError('Demo inválida (formato v1)');
  if (!adapter || typeof adapter.applySample !== 'function') {
    throw new TypeError('replayDemo requiere adapter.applySample');
  }
  const { speed = 1, onDone = () => {}, onProgress } = opts;
  let playing = true;
  let curT = 0;
  let i = 0;
  let lastTs = 0;
  let handle = null;

  adapter.resetSample?.();

  const step = (ts) => {
    if (!playing) return;
    if (lastTs === 0) lastTs = ts;
    const dt = Math.min(0.25, (ts - lastTs) / 1000) * speed;
    lastTs = ts;
    curT += dt;

    if (i < v.samples.length && v.samples[i].t <= curT) {
      // aplico todas las muestras cuyo instante ya pasó (puede haber varias
      // en un mismo frame con el reloj de simulación y poco sampleRate)
      while (i < v.samples.length && v.samples[i].t <= curT) {
        const s = v.samples[i];
        adapter.applySample(s.params, s.moduleState);
        i++;
        onProgress?.((i / v.samples.length) * 100);
      }
    }

    if (i >= v.samples.length) {
      playing = false;
      onDone();
      return;
    }
    handle =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(step)
        : setTimeout(() => step(performance.now()), 16);
  };

  handle =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(step)
      : setTimeout(() => step(performance.now()), 16);

  return {
    pause() {
      playing = false;
      if (handle && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle);
      } else if (handle) {
        clearTimeout(handle);
      }
    },
    resume() {
      if (playing) return;
      playing = true;
      lastTs = 0;
      handle =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(step)
          : setTimeout(() => step(performance.now()), 16);
    },
    get progress() {
      return v.samples.length ? (i / v.samples.length) * 100 : 0;
    },
    get playing() {
      return playing;
    },
  };
}

/** Descarga la demo como JSON (archivo). */
export function downloadDemo(demo, filename = 'fisicahn-demo.json') {
  if (!validateDemo(demo)) throw new TypeError('Demo inválida');
  const blob = new Blob([demoToJson(demo)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Serializa de forma estable (submit a archivo / copiar-paste). */
export function demoToJson(demo) {
  return JSON.stringify(validateDemo(demo), null, 2);
}

export function demoFromJson(text) {
  try {
    return validateDemo(JSON.parse(text));
  } catch {
    return null;
  }
}