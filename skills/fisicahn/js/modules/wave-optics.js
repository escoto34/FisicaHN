/**
 * @fileoverview Óptica ondulatoria — interferencia de doble rendija y
 * difracción de una rendija (tanda 5.4). Migrado a `draw(scene)` en la
 * WAVE 13 (§13.0/§13.3).
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const N_SAMPLES = 120;

export default class WaveOptics extends SimModule {
  static viewport = { width: 20, height: 12 };

  /** La rendija (punto fijo del montaje) queda en el origen del mundo (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'mode',
      type: 'select',
      label: 'Modo',
      value: 'double',
      options: [
        { value: 'double', label: 'Doble rendija (Young)' },
        { value: 'single', label: 'Difracción 1 rendija' }
      ]
    },
    { id: 'lambda', label: 'Longitud de onda', latex: '\\lambda', min: 0.3, max: 1.2, step: 0.02, value: 0.55 },
    { id: 'd', label: 'Separación', latex: 'd', min: 0.5, max: 4, step: 0.05, value: 2.0 },
    { id: 'a', label: 'Ancho de rendija', latex: 'a', min: 0.2, max: 2, step: 0.05, value: 0.6 },
    { id: 'L', label: 'Distancia a pantalla', latex: 'L', min: 3, max: 10, step: 0.2, value: 6 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { mode: 'double', lambda: 0.55, d: 2.0, a: 0.6, L: 6 };
    this.t = 0;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: meta?.title || 'Interferencia y difracción',
      blurb: meta?.blurb || 'Patrón de Young (doble rendija) e intensidad de difracción de una rendija.',
      story: 'La luz como onda interfiere. Young midió λ con franjas; la difracción limita la resolución de instrumentos.',
      cases: [
        'Experimento de Young con láser y rendijas.',
        'Anillos/ franjas en películas delgadas (idea de camino óptico).',
        'Límite de difracción de un telescopio (apertura).'
      ]
    });
    setModuleFormulas(this.ui, {
      items: [
        { name: 'Young (máximos)', formula: 'd \\sin\\theta = m \\lambda', note: 'm = 0, ±1, ±2…' },
        { name: 'Intensidad (2 rendijas, ideal)', formula: 'I \\propto \\cos^2(\\delta/2)', note: 'δ = (2π/λ) d senθ' },
        { name: 'Difracción 1 rendija (mínimos)', formula: 'a \\sin\\theta = m \\lambda', note: 'm = ±1, ±2…' },
        { name: 'sinc', formula: 'I \\propto [\\sin\\beta/\\beta]^2', note: 'β = (π a senθ)/λ' }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.engine?.reset?.();
  }

  update(dt) {
    this.t += dt;
  }

  intensity(y) {
    const { L, lambda, mode, d, a } = this.params;
    const theta = Math.atan2(y, L);
    const s = Math.sin(theta);
    const k = (2 * Math.PI) / Math.max(lambda, 0.05);
    if (mode === 'double') {
      const delta = k * d * s;
      const beta = (k * a * s) / 2;
      const env = Math.abs(beta) < 1e-6 ? 1 : (Math.sin(beta) / beta) ** 2;
      return env * Math.cos(delta / 2) ** 2;
    }
    const beta = (Math.PI * a * s) / Math.max(lambda, 0.05);
    return Math.abs(beta) < 1e-6 ? 1 : (Math.sin(beta) / beta) ** 2;
  }

  /* ---------- dibujo declarativo (§2.4, migrado en WAVE 13) ---------- */

  draw(scene) {
    const { mode, d, L } = this.params;

    // Fuente
    scene.body(-4, 0, { shape: 'circle', r: 0.25, color: 'ray', label: 'fuente' });

    // Placa de rendijas: centrada en el origen (punto fijo del montaje, §17.1).
    scene.line(0, 4, 0, -4, { color: 'textDim', width: 6 });
    if (mode === 'double') {
      scene.body(0, d / 2, { shape: 'circle', r: 0.12, color: 'field', glow: false });
      scene.body(0, -d / 2, { shape: 'circle', r: 0.12, color: 'field', glow: false });
    } else {
      scene.body(0, 0, { shape: 'rect', r: 0.15, color: 'field', glow: false, label: 'a' });
    }

    // Pantalla: barras de brillo según intensidad, más la curva I(y) a la derecha.
    const screenX = 7;
    const samples = [];
    for (let i = 0; i <= N_SAMPLES; i++) {
      const y = -4 + (8 * i) / N_SAMPLES;
      samples.push({ y, I: this.intensity(y) });
    }
    for (const s of samples) {
      const g = Math.round(255 * Math.pow(s.I, 0.7));
      scene.rect(screenX, s.y, 0.22, 0.08, { fill: `rgb(${g}, ${g}, ${Math.min(255, g + 40)})`, stroke: false });
    }
    scene.polyline(
      samples.map((s) => ({ x: screenX + 0.8 + s.I * 2.5, y: s.y })),
      { color: 'field', width: 2 }
    );

    // Animación de crestas cerca de la fuente (indicativa, no propagación real).
    const phase = this.t * 3;
    for (let k = 0; k < 5; k++) {
      const x = -3.5 + ((phase + k) % 3.5);
      scene.line(x, -1.2, x, 1.2, { color: 'ray', alpha: 0.22, width: 1 });
    }

    const fringe = (this.params.lambda * L) / Math.max(d, 0.05);
    scene.hud.readout(
      [
        { label: 'modo', value: mode === 'double' ? 'doble rendija' : 'una rendija', unit: '' },
        { label: 'λ', value: this.params.lambda, unit: '' },
        { label: 'd', value: d, unit: '' },
        { label: 'a', value: this.params.a, unit: '' },
        { label: 'Δy', value: roundTo(fringe, 3), unit: '(franjas)' }
      ],
      'top-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const { mode, lambda, d, a, L } = this.params;
    const fringe = (lambda * L) / Math.max(d, 0.05);
    return {
      modo: { value: mode === 'double' ? 'doble rendija' : 'una rendija', unit: '' },
      lambda: { value: lambda, unit: '' },
      d: { value: d, unit: '' },
      a: { value: a, unit: '' },
      L: { value: L, unit: '' },
      'Δy': { value: roundTo(fringe, 3), unit: '' }
    };
  }

  getState() {
    return { t: this.t, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (s.t != null) this.t = s.t;
  }
}
