/**
 * @fileoverview Oscilaciones — resorte (Hooke) y MHS, libre y amortiguado
 * (tanda 5.2, «Modo Hooke en oscillatory»). Ejercita la primitiva `spring`.
 *
 * Migrado al contrato `SimModule` de la WAVE 2. La posición sigue la solución
 * exacta: x = A·cos(ωt) en el MHS ideal, y x = A·e^{−γt}·cos(ω′t) con
 * ω′ = √(ω₀² − γ²) al encender el roce. El módulo dibuja el muelle real entre
 * la pared y la masa, la energía en el HUD y la historia x(t). En el modo
 * amortiguado la década de la amplitud (−γt) se lee directamente de la estela.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

export default class Oscillatory extends SimModule {
  static viewport = { width: 24, height: 10 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'mhs',
      options: [
        { value: 'mhs', label: 'MHS sin roce (Em se conserva)' },
        { value: 'amortiguado', label: 'Amortiguado (x = A·e⁻ᵞᵗ·cos ω′t)' }
      ]
    },
    { id: 'A', label: 'Amplitud', latex: 'A', unit: 'm', min: 0.5, max: 7, step: 0.1, value: 5 },
    { id: 'k', label: 'Constante del muelle', latex: 'k', unit: 'N/m', min: 5, max: 200, step: 5, value: 60 },
    { id: 'm', label: 'Masa', latex: 'm', unit: 'kg', min: 0.2, max: 5, step: 0.2, value: 1 },
    { id: 'g', label: 'Coef. de amortiguación', latex: '\\gamma', unit: '1/s', min: 0, max: 0.8, step: 0.05, value: 0.15 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { modo: 'mhs', A: 5, k: 60, m: 1, g: 0.15 };
    this.t = 0;
    this.history = new TrailBuffer(480);
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Oscilaciones y energía',
      blurb: 'MHS en un resorte: la ley de Hooke, el periodo y Em = Ec + Ep.',
      story:
        'En un resorte ideal sin fricción la energía mecánica se intercambia entre cinética y potencial elástica, pero Em se conserva: v es máxima en el equilibrio y nula en los extremos, mientras que Ep hace lo contrario. Encender el roce añade el factor e^{−γt}: la amplitud y la energía decaen con el tiempo, y en vez de oscilar para siempre la masa termina en reposo. Un mismo objeto —el muelle— explica el pendulero de un reloj y el amortiguador de un coche.',
      cases: [
        'En los extremos: v = 0, Ep máxima, Ec = 0.',
        'En el equilibrio: |v| máxima, Ep = 0.',
        'Em = ½ k A² constante si γ = 0.',
        'Con roce: la envolvente A·e^{−γt} envuelve la estela.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Oscilaciones',
      items: [
        { name: 'Ley de Hooke', formula: 'F = −k·x' },
        { name: 'Pulsación angular', formula: '\\omega_0 = \\sqrt{k/m}', note: 'T = 2π/ω₀' },
        { name: 'Posición de equilibrio', formula: 'x = A·cos(ω₀ t)' },
        {
          name: 'Amortiguado',
          formula: 'x = A\\,e^{-\\gamma t}\\cos(\\omega\' t),\\quad \\omega\' = \\sqrt{\\omega_0^2 - \\gamma^2}',
          note: 'Valida para γ < ω₀ (subamortiguado).'
        },
        { name: 'Energía mecánica', formula: 'E_m = \\tfrac{1}{2} k A^2', note: 'Se conserva solo si γ = 0.' }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.history.clear();
    this.engine?.reset?.();
  }

  omega0() {
    return Math.sqrt(this.params.k / this.params.m);
  }

  /** Posición actual según el modo. */
  x() {
    const { modo, A, g } = this.params;
    const w0 = this.omega0();
    if (modo === 'mhs') return A * Math.cos(w0 * this.t);
    const w = Math.sqrt(Math.max(w0 * w0 - g * g, 1e-9));
    return A * Math.exp(-g * this.t) * Math.cos(w * this.t);
  }

  v() {
    const { modo, A, g } = this.params;
    const w0 = this.omega0();
    if (modo === 'mhs') return -A * w0 * Math.sin(w0 * this.t);
    const w = Math.sqrt(Math.max(w0 * w0 - g * g, 1e-9));
    return A * Math.exp(-g * this.t) * (-g * Math.cos(w * this.t) - w * Math.sin(w * this.t));
  }

  a() {
    const { modo, A, g } = this.params;
    const w0 = this.omega0();
    const x = this.x();
    const v = this.v();
    if (modo === 'mhs') return -w0 * w0 * x;
    // a = −ω₀²·x − 2γ·v (oscilador amortiguado con fuerza −kx − 2mγv).
    return -w0 * w0 * x - 2 * g * v;
  }

  Ep() {
    return 0.5 * this.params.k * this.x() ** 2;
  }

  Ec() {
    return 0.5 * this.params.m * this.v() ** 2;
  }

  Em() {
    return this.Ep() + this.Ec();
  }

  period() {
    const { modo, g } = this.params;
    const w0 = this.omega0();
    if (modo === 'mhs') return (2 * Math.PI) / w0;
    return (2 * Math.PI) / Math.sqrt(Math.max(w0 * w0 - g * g, 1e-9));
  }

  update(dt) {
    this.t += dt;
    this.history.push({ x: this.t, y: this.x() });
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { A, m } = this.params;
    const x = this.x();
    const wall = -7.5;
    const vp = scene.viewport();

    // Piso de apoyo.
    scene.line(wall - 0.5, -0.9, vp.x + vp.w - 0.8, -0.9, { color: 'textDim', width: 3 });
    scene.line(-0.5, -0.9, 0.5, -1.4, { color: 'textDim', width: 3 });
    scene.line(7.0, -0.9, 7.6, -1.4, { color: 'textDim', width: 3 });

    // Muelle real entre la pared y la masa (primitiva spring, tanda 5.2).
    scene.line(wall, 0.5, wall, -0.5, { color: 'textDim', width: 4 });
    scene.spring(wall, 0, x - m * 0.35, 0, { color: 'spring', width: 2, coils: 14, amplitude: 0.35 });

    // Equilibrio (x = 0) punteado.
    scene.line(0, -0.8, 0, 0.8, { color: 'textDim', dash: [3, 4], alpha: 0.6 });
    scene.label(0.5, 0.75, 'equilibrio x = 0', { color: 'textDim' });

    // Masa con su dirección de movimiento.
    scene.body(x, 0, { shape: 'rect', r: m * 0.28, color: 'mass', label: `m = ${m} kg`, labelColor: 'mass' });
    const vEl = this.v();
    scene.vector(x, 0.6, vEl * 0.25, 0, { color: 'velocity', label: `v = ${roundTo(vEl, 2)} m/s` });
    const F = -this.params.k * x;
    scene.vector(x, -0.7, F * 0.03, 0, { color: 'force', label: `F = ${roundTo(F, 1)} N`, labelSide: -1 });

    // HUD: energía y periodo.
    const hud = scene.hud;
    const amort = this.params.modo === 'amortiguado';
    hud.chip(amort ? 'Amortiguado: Em decae con e^{−2γt}' : 'MHS: Em se conserva', 'top-left');
    hud.readout(
      [
        { label: 'x', value: roundTo(x, 3), unit: 'm' },
        { label: 'Ec', value: roundTo(this.Ec(), 2), unit: 'J' },
        { label: 'Ep', value: roundTo(this.Ep(), 2), unit: 'J' },
        { label: 'Em', value: roundTo(this.Em(), 2), unit: 'J' },
        { label: 'T', value: roundTo(this.period(), 3), unit: 's' }
      ],
      'bottom-left'
    );

    // Historia x(t).
    if (vp.w > 440 && this.history.length > 1) {
      const yRange = [-this.params.A * 1.2, this.params.A * 1.2];
      hud.plot(
        { x: vp.x + vp.w - 215, y: vp.y + vp.h - 118, w: 200, h: 106 },
        {
          title: 'Posición x(t)',
          series: [{ points: this.history, color: 'mass', label: 'x' }],
          yRange
        }
      );
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    return {
      'x': { value: roundTo(this.x(), 3), unit: 'm' },
      'v': { value: roundTo(this.v(), 3), unit: 'm/s' },
      'a': { value: roundTo(this.a(), 3), unit: 'm/s²' },
      'Ec': { value: roundTo(this.Ec(), 3), unit: 'J' },
      'Ep': { value: roundTo(this.Ep(), 3), unit: 'J' },
      'Em': { value: roundTo(this.Em(), 3), unit: 'J' },
      'ω₀': { value: roundTo(this.omega0(), 3), unit: 'rad/s' },
      'T': { value: roundTo(this.period(), 3), unit: 's' }
    };
  }

  getState() {
    return { t: this.t, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    this.history.clear();
  }

  destroy() {
    this.history.clear();
  }
}