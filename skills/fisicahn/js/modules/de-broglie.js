/**
 * @fileoverview Dualidad onda-partícula — de Broglie (tanda 5.5).
 *
 * λ = h/p para electrones acelerados por un voltaje V:
 * λ[nm] = 1.226 / √V[voltios] — fórmula real, no un valor de juguete. Se
 * disparan electrones uno a uno hacia una doble rendija; cada uno llega a un
 * punto aleatorio de la pantalla muestreado con la misma distribución de
 * intensidad de Young que usa `wave-optics` (rechazo de Monte Carlo), y el
 * patrón de interferencia sólo se reconoce tras acumular muchos impactos —
 * la demostración histórica de que la interferencia es una propiedad
 * estadística de partícula individual, no de un haz clásico.
 *
 * Nota de escala: λ real (fracciones de nm) se reescala visualmente para que
 * el montaje de rendijas quepa en el lienzo — igual que `atomic.js` no dibuja
 * radios de Bohr a escala real. `readout()`/`λ` siempre muestra el valor
 * físico correcto en nm.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo, lerp } from '../utils/math-helpers.js';

/** λ[nm] ≈ 1.226 / √V[V] — de Broglie para electrones no relativistas acelerados por V. */
const H_NM_V = 1.226;
/** nm → unidades de mundo del montaje (no a escala; ver nota de cabecera). */
const VIS_SCALE = 5.5;
const SCREEN_L = 6;
const FLIGHT_TIME = 0.7;
const MAX_HITS = 500;
const BINS = 44;

export default class DeBroglie extends SimModule {
  static viewport = { width: 20, height: 12 };

  /** El plano de rendijas (punto fijo del montaje) queda en el origen (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'V', label: 'Voltaje de aceleración', latex: 'V', unit: 'V', min: 20, max: 600, step: 10, value: 150 },
    { id: 'd', label: 'Separación de rendijas', latex: 'd', min: 0.5, max: 4, step: 0.05, value: 2.0 },
    { id: 'a', label: 'Ancho de rendija', latex: 'a', min: 0.2, max: 2, step: 0.05, value: 0.6 },
    { id: 'rate', label: 'Tasa de disparo', latex: 'r', unit: 'e⁻/s', min: 1, max: 40, step: 1, value: 14 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { V: 150, d: 2.0, a: 0.6, rate: 14 };
    this.t = 0;
    /** Electrones en vuelo: {y0, yTarget, t}. */
    this.flying = [];
    /** Impactos acumulados en la pantalla (coordenada y de mundo): anillo de MAX_HITS. */
    this.hits = new TrailBuffer(MAX_HITS);
    /** Histograma y posiciones en vuelo, reutilizados entre frames. */
    this._bins = new Int32Array(BINS);
    this._flyBuf = new Float64Array(64);
    this.spawnAcc = 0;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Dualidad onda-partícula',
      blurb: meta?.blurb || 'Electrones uno a uno que forman un patrón de interferencia: λ = h/p.',
      story:
        'De Broglie propuso en 1924 que toda partícula tiene una longitud de onda asociada λ = h/p. El experimento decisivo no es enviar un haz de electrones, sino dispararlos de uno en uno: cada impacto en la pantalla es un punto aleatorio individual, pero tras acumular miles aparece el mismo patrón de franjas que la luz — la interferencia no necesita un "haz", es una propiedad de cada partícula sola.',
      cases: [
        'Difracción de electrones en un cristal (Davisson-Germer, 1927).',
        'Microscopio electrónico: λ mucho menor que la luz visible → más resolución.',
        'Doble rendija con fotones, neutrones o incluso moléculas grandes: mismo patrón.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'de Broglie', formula: '\\lambda = h / p', note: 'Toda partícula con momento p tiene una onda asociada.' },
        {
          name: 'Electrón acelerado',
          formula: '\\lambda[\\text{nm}] \\approx \\dfrac{1{,}226}{\\sqrt{V[\\text{V}]}}',
          note: 'De p = √(2mₑeV), no relativista.'
        },
        { name: 'Interferencia (Young)', formula: 'I \\propto \\cos^2(\\delta/2)', note: 'Misma fórmula que la luz — la partícula interfiere consigo misma.' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.flying = [];
    this.hits.clear();
    this.spawnAcc = 0;
    this.engine?.reset?.();
  }

  /** λ real en nanómetros (fórmula de de Broglie para el voltaje elegido). */
  lambdaNm() {
    return H_NM_V / Math.sqrt(Math.max(this.params.V, 1));
  }

  /** λ reescalada a unidades de mundo para que la difracción sea visible (ver nota de cabecera). */
  lambdaVis() {
    return this.lambdaNm() * VIS_SCALE;
  }

  /** Intensidad de Young normalizada a [0,1] — misma forma que `wave-optics`. */
  intensity(y) {
    const { d, a } = this.params;
    const lambda = Math.max(this.lambdaVis(), 0.02);
    const theta = Math.atan2(y, SCREEN_L);
    const s = Math.sin(theta);
    const k = (2 * Math.PI) / lambda;
    const delta = k * d * s;
    const beta = (k * a * s) / 2;
    const env = Math.abs(beta) < 1e-6 ? 1 : (Math.sin(beta) / beta) ** 2;
    return env * Math.cos(delta / 2) ** 2;
  }

  /** Muestra un punto de impacto por rechazo de Monte Carlo sobre `intensity`. */
  sampleY() {
    for (let i = 0; i < 60; i++) {
      const y = Math.random() * 8 - 4;
      if (Math.random() < this.intensity(y)) return y;
    }
    return 0;
  }

  update(dt) {
    this.t += dt;
    this.spawnAcc += dt * this.params.rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.flying.push({ y0: (Math.random() - 0.5) * 0.5, yTarget: this.sampleY(), t: 0 });
    }
    let write = 0;
    for (let i = 0; i < this.flying.length; i++) {
      const f = this.flying[i];
      f.t += dt;
      if (f.t >= FLIGHT_TIME) {
        this.hits.push(f.yTarget);
      } else {
        if (write !== i) this.flying[write] = f;
        write++;
      }
    }
    this.flying.length = write;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { d, a } = this.params;

    // Fuente y placa de rendijas, centrada en el origen (§17.1).
    scene.body(-4, 0, { shape: 'circle', r: 0.22, color: 'ray', label: 'cañón e⁻' });
    scene.line(0, 4, 0, -4, { color: 'textDim', width: 6 });
    scene.body(0, d / 2, { shape: 'circle', r: 0.1, color: 'field', glow: false });
    scene.body(0, -d / 2, { shape: 'circle', r: 0.1, color: 'field', glow: false });

    // Histograma de impactos acumulados — el patrón emerge tras muchos disparos.
    const bins = this._bins;
    bins.fill(0);
    this.hits.forEach((y) => {
      const idx = Math.min(BINS - 1, Math.max(0, Math.floor(((y + 4) / 8) * BINS)));
      bins[idx]++;
    });
    let maxBin = 1;
    for (let i = 0; i < BINS; i++) if (bins[i] > maxBin) maxBin = bins[i];
    const binH = (8 / BINS) * 0.85;
    for (let i = 0; i < BINS; i++) {
      if (!bins[i]) continue;
      const y = -4 + (8 * (i + 0.5)) / BINS;
      const w = Math.max(0.06, (bins[i] / maxBin) * 2.4);
      scene.rect(SCREEN_L + w / 2, y, w, binH, { color: 'field', fill: 'field', stroke: false, alpha: 0.85 });
    }

    // Electrones en vuelo: puntos que viajan del plano de rendijas a la
    // pantalla, en una sola nube (`dots`) sobre un búfer plano reutilizado.
    const n = this.flying.length;
    if (n) {
      if (this._flyBuf.length < n * 2) this._flyBuf = new Float64Array(n * 4);
      const buf = this._flyBuf;
      for (let i = 0; i < n; i++) {
        const f = this.flying[i];
        const u = Math.min(1, f.t / FLIGHT_TIME);
        buf[i * 2] = lerp(0, SCREEN_L, u);
        buf[i * 2 + 1] = lerp(f.y0, f.yTarget, u);
      }
      scene.dots(buf.subarray(0, n * 2), 0.07, { color: 'ray' });
    }

    scene.hud.readout(
      [
        { label: 'V', value: this.params.V, unit: 'V' },
        { label: 'λ', value: roundTo(this.lambdaNm(), 4), unit: 'nm' },
        { label: 'electrones', value: this.hits.length, unit: '' }
      ],
      'top-left'
    );
    if (this.hits.length < 40) {
      scene.hud.chip('Cada punto es un electrón individual — el patrón tarda en aparecer', 'bottom-left', { color: 'textDim' });
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    return {
      V: { value: this.params.V, unit: 'V' },
      lambda: { value: roundTo(this.lambdaNm(), 4), unit: 'nm' },
      electrones: { value: this.hits.length, unit: '' },
      'tasa': { value: this.params.rate, unit: 'e⁻/s' }
    };
  }

  getState() {
    return { t: this.t, params: { ...this.params }, hits: this.hits.toArray().slice(-100) };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Array.isArray(s.hits)) {
      this.hits.clear();
      for (const y of s.hits) this.hits.push(y);
    }
    if (s.t != null) this.t = s.t;
  }
}
