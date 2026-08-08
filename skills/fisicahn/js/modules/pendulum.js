/**
 * @fileoverview Péndulo — integración angular exacta frente a aproximación
 * de ángulo pequeño, y doble péndulo caótico (tanda 5.2).
 *
 * Ejercita `angleArc`, `trail`, `vector` y `plot`. En el modo simple se
 * compara el periodo real (medido por cruce por cero) con el de la fórmula
 * lineal T = 2π√(L/g), y un «péndulo fantasma» dibuja la solución lineal
 * superpuesta para que el contraste se vea sin leer nada. El modo doble
 * resuelve el sistema no lineal con RK4 y, con la perturbación ε activada,
 * corre una segunda copia con θ₂₀ + ε·μrad para mostrar la sensibilidad a
 * las condiciones iniciales (dos estelas que divergen).
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const G = 9.8;
const DEG = Math.PI / 180;

export default class Pendulum extends SimModule {
  static viewport = { width: 24, height: 16 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'simple',
      options: [
        { value: 'simple', label: 'Péndulo simple' },
        { value: 'doble', label: 'Doble péndulo' }
      ]
    },
    { id: 'L', label: 'Longitud', latex: 'L', unit: 'm', min: 0.5, max: 4, step: 0.1, value: 2.5 },
    { id: 'th0', label: 'Ángulo inicial', latex: '\\theta_0', unit: '°', min: 5, max: 170, step: 5, value: 60 },
    { id: 'm', label: 'Masa', latex: 'm', unit: 'kg', min: 0.2, max: 5, step: 0.2, value: 1 },
    { id: 'roce', label: 'Coef. de roce', latex: '\\gamma', min: 0, max: 0.8, step: 0.05, value: 0 },
    { id: 'lineal', type: 'checkbox', label: 'Superponer aproximación lineal', value: true },
    { id: 'l1', label: 'Largo varilla 1', latex: 'l_1', unit: 'm', min: 0.5, max: 4, step: 0.1, value: 2 },
    { id: 'l2', label: 'Largo varilla 2', latex: 'l_2', unit: 'm', min: 0.5, max: 4, step: 0.1, value: 2 },
    { id: 'm1', label: 'Masa 1', latex: 'm_1', unit: 'kg', min: 0.2, max: 5, step: 0.2, value: 1 },
    { id: 'm2', label: 'Masa 2', latex: 'm_2', unit: 'kg', min: 0.2, max: 5, step: 0.2, value: 1 },
    { id: 'th1', label: 'θ₁ inicial', latex: '\\theta_1', unit: '°', min: 5, max: 170, step: 5, value: 90 },
    { id: 'th2', label: 'θ₂ inicial', latex: '\\theta_2', unit: '°', min: -170, max: 170, step: 5, value: -90 },
    { id: 'eps', label: 'Perturbación ε', latex: '\\varepsilon', unit: 'μrad', min: 0, max: 500, step: 10, value: 0 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'simple',
      L: 2.5,
      th0: 60,
      m: 1,
      roce: 0,
      lineal: true,
      l1: 2,
      l2: 2,
      m1: 1,
      m2: 1,
      th1: 90,
      th2: -90,
      eps: 0
    };
    /** Pivote del péndulo en el mundo (ambos modos). Centrado en el origen por la regla §17.1. */
    this.pivot = { x: 0, y: 0 };
    this.t = 0;
    // Simple: θ, ω, periodo medido, historia de cruces.
    this.th = 0;
    this.om = 0;
    this.Tmeasured = 0;
    this._lastCross = 0;
    this._prevTh = 0;
    this.trail = new TrailBuffer(600);
    // Lineal (fantasma): ángulo de la solución x = θ₀·cos(ωt).
    this.linTrail = new TrailBuffer(600);
    // Doble: estado [θ1, θ2, ω1, ω2] y copia perturbada (si ε > 0).
    this.st = [0, 0, 0, 0];
    this.ghost = null;
    this.ghostTrail = new TrailBuffer(600);
    this.trail2 = new TrailBuffer(600);
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Péndulo',
      blurb: 'Integración angular: periodo real frente a T = 2π√(L/g), y doble péndulo caótico.',
      story:
        'Para ángulos pequeños el péndulo se comporta casi como un oscilador lineal y el periodo no depende de la amplitud. Con θ₀ grande la aproximación falla y el periodo crece. El doble péndulo lleva esa no linealidad al extremo: dos varillas acopladas producen movimiento caótico, donde una diferencia de una millonésima de grado se convierte en trayectorias completamente distintas.',
      cases: [
        'θ₀ < 15°: el fantasma lineal coincide con la estela real.',
        'θ₀ = 150°: el periodo real supera en ~30 % a 2π√(L/g).',
        'Activar ε en el doble péndulo: dos estelas idénticas que divergen.',
        'Roce γ: la amplitud decae y la energía se disipa en cada oscilación.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Péndulo',
      items: [
        {
          name: 'Periodo (ángulo pequeño)',
          formula: 'T = 2\\pi \\sqrt{L/g}',
          note: 'Válida solo cuando θ₀ es pequeño; independiente de la masa.'
        },
        {
          name: 'Ecuación exacta',
          formula: '\\ddot{\\theta} = -\\frac{g}{L}\\sin\\theta - \\gamma\\,\\dot{\\theta}',
          note: 'Con γ = 0 la energía mecánica se conserva.'
        },
        {
          name: 'Energía del péndulo',
          formula: 'E = \\tfrac{1}{2} m L^2 \\dot{\\theta}^2 + m g L (1 - \\cos\\theta)',
          note: 'Referida al punto más bajo de la trayectoria.'
        },
        {
          name: 'Sensibilidad (doble péndulo)',
          formula: '\\Delta\\theta(t) \\sim \\delta_0 \\, e^{\\lambda t}',
          note: 'El exponente de Lyapunov λ > 0 marca el caos determinista.'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.Tmeasured = 0;
    this._lastCross = 0;
    this.trail.clear();
    this.linTrail.clear();
    this.trail2.clear();
    this.ghostTrail.clear();
    if (this.params.modo === 'doble') {
      const a1 = this.params.th1 * DEG;
      const a2 = this.params.th2 * DEG;
      this.st = [a1, a2, 0, 0];
      this.ghost = this.params.eps > 0 ? [a1, a2 + this.params.eps * 1e-6, 0, 0] : null;
    } else {
      this.th = this.params.th0 * DEG;
      this.om = 0;
      this._prevTh = this.th;
    }
    this.engine?.reset?.();
  }

  /** Aceleraciones del doble péndulo (formulación estándar, sin fricción). */
  _acc(th1, th2, om1, om2) {
    const { l1, l2, m1, m2 } = this.params;
    const d = th1 - th2;
    const c = Math.cos(d);
    const s = Math.sin(d);
    const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
    const a1 =
      (-G * (2 * m1 + m2) * Math.sin(th1) -
        m2 * G * Math.sin(th1 - 2 * th2) -
        2 * s * m2 * (om2 * om2 * l2 + om1 * om1 * l1 * c)) /
      (l1 * den);
    const a2 =
      (2 * s * (om1 * om1 * l1 * (m1 + m2) + G * (m1 + m2) * Math.cos(th1) + om2 * om2 * l2 * m2 * c)) /
      (l2 * den);
    return [a1, a2];
  }

  /** Paso RK4 sobre el vector [θ1, θ2, ω1, ω2]. */
  _rk4(st, dt) {
    const f = (s) => {
      const [a1, a2] = this._acc(s[0], s[1], s[2], s[3]);
      return [s[2], s[3], a1, a2];
    };
    const k1 = f(st);
    const k2 = f([st[0] + (dt / 2) * k1[0], st[1] + (dt / 2) * k1[1], st[2] + (dt / 2) * k1[2], st[3] + (dt / 2) * k1[3]]);
    const k3 = f([st[0] + (dt / 2) * k2[0], st[1] + (dt / 2) * k2[1], st[2] + (dt / 2) * k2[2], st[3] + (dt / 2) * k2[3]]);
    const k4 = f([st[0] + dt * k3[0], st[1] + dt * k3[1], st[2] + dt * k3[2], st[3] + dt * k3[3]]);
    return [
      st[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      st[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      st[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
      st[3] + (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])
    ];
  }

  update(dt) {
    this.t += dt;
    const sub = 4; // subpasos: RK4 con 1/240 s es estable para L ≥ 0.5 m
    const h = dt / sub;

    if (this.params.modo === 'doble') {
      for (let i = 0; i < sub; i++) this.st = this._rk4(this.st, h);
      if (this.ghost) {
        for (let i = 0; i < sub; i++) this.ghost = this._rk4(this.ghost, h);
      }
      const b1 = this._bobPos(this.st[0], this.st[1]);
      this.trail2.push({ x: b1.x, y: b1.y });
      const b2 = this._bobPos2(this.st[0], this.st[1]);
      this.trail.push({ x: b2.x, y: b2.y });
      if (this.ghost) {
        const g2 = this._bobPos2(this.ghost[0], this.ghost[1]);
        this.ghostTrail.push({ x: g2.x, y: g2.y });
      }
      return;
    }

    // Simple: Euler-Cromer, estable y con el roce del plan.
    const { L, roce } = this.params;
    for (let i = 0; i < sub; i++) {
      const alpha = -(G / L) * Math.sin(this.th) - roce * this.om;
      this.om += alpha * h;
      this.th += this.om * h;
    }
    // Periodo medido: cruce de θ = 0 subiendo (ω > 0).
    if (this.om > 0 && this._prevTh < 0 && this.th >= 0 && this._lastCross > 0) {
      this.Tmeasured = this.t - this._lastCross;
    }
    if (this.om > 0 && this._prevTh < 0 && this.th >= 0) this._lastCross = this.t;
    this._prevTh = this.th;

    const p = this.pivot;
    const bob = { x: p.x + this.params.L * Math.sin(this.th), y: p.y - this.params.L * Math.cos(this.th) };
    this.trail.push({ x: bob.x, y: bob.y });

    if (this.params.lineal) {
      const om0 = Math.sqrt(G / this.params.L);
      const thl = this.params.th0 * DEG * Math.cos(om0 * this.t);
      const linBob = { x: p.x + this.params.L * Math.sin(thl), y: p.y - this.params.L * Math.cos(thl) };
      this.linTrail.push({ x: linBob.x, y: linBob.y });
    }
  }

  /** Posición del bob 1 en el doble péndulo. */
  _bobPos(th1, th2) {
    const p = this.pivot;
    return { x: p.x + this.params.l1 * Math.sin(th1), y: p.y - this.params.l1 * Math.cos(th1) };
  }

  /** Posición del bob 2 en el doble péndulo. */
  _bobPos2(th1, th2) {
    const b1 = this._bobPos(th1, th2);
    return { x: b1.x + this.params.l2 * Math.sin(th2), y: b1.y - this.params.l2 * Math.cos(th2) };
  }

  /** Energía total del péndulo simple (referida al punto más bajo). */
  energy() {
    const { m, L } = this.params;
    return 0.5 * m * L * L * this.om * this.om + m * G * L * (1 - Math.cos(this.th));
  }

  Tapprox() {
    return 2 * Math.PI * Math.sqrt(this.params.L / G);
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const p = this.pivot;
    const doble = this.params.modo === 'doble';

    // Soporte del techo.
    scene.line(p.x - 1.6, p.y + 0.5, p.x + 1.6, p.y + 0.5, { color: 'textDim', width: 3 });
    scene.line(p.x - 1.2, p.y + 0.5, p.x - 1.2, p.y + 0.8, { color: 'textDim', width: 2 });
    scene.line(p.x + 1.2, p.y + 0.5, p.x + 1.2, p.y + 0.8, { color: 'textDim', width: 2 });

    if (doble) {
      const b1 = this._bobPos(this.st[0], this.st[1]);
      const b2 = this._bobPos2(this.st[0], this.st[1]);

      scene.trail(this.trail, { color: 'mass', width: 2 });
      if (this.ghost) scene.trail(this.ghostTrail, { color: 'danger', width: 1.5, dash: [3, 3] });
      scene.trail(this.trail2, { color: 'textDim', width: 1.5 });

      scene.line(p.x, p.y, b1.x, b1.y, { color: 'spring', width: 2.5 });
      scene.line(b1.x, b1.y, b2.x, b2.y, { color: 'spring', width: 2.5 });
      scene.body(p.x, p.y, { shape: 'circle', r: 0.12, color: 'textDim' });
      scene.body(b1.x, b1.y, { shape: 'circle', r: 0.18 + this.params.m1 * 0.07, color: 'mass' });
      scene.body(b2.x, b2.y, { shape: 'circle', r: 0.18 + this.params.m2 * 0.07, color: 'mass2' });
      scene.label(b1.x, b1.y, `m₁ = ${this.params.m1} kg`, { color: 'mass' });
      scene.label(b2.x, b2.y, `m₂ = ${this.params.m2} kg`, { color: 'mass2' });

      // Desviación de la vertical para cada varilla.
      scene.line(p.x, p.y, p.x, p.y - this.params.l1 - 1, { color: 'textDim', dash: [2, 4], alpha: 0.5 });
      scene.line(b1.x, b1.y, b1.x, b1.y - this.params.l2 - 1, { color: 'textDim', dash: [2, 4], alpha: 0.5 });
      scene.angleArc(p.x, p.y, Math.PI / 2, Math.PI / 2 - this.st[0], 0.6, { color: 'energy' });
      scene.angleArc(b1.x, b1.y, Math.PI / 2, Math.PI / 2 - this.st[1], 0.6, { color: 'energy' });

      const hud = scene.hud;
      hud.chip('Doble péndulo (caos determinista)', 'top-left');
      const rows = [
        { label: 'θ₁', value: roundTo(this.st[0] / DEG, 2), unit: '°' },
        { label: 'θ₂', value: roundTo(this.st[1] / DEG, 2), unit: '°' },
        { label: 'E', value: roundTo(this._doubleEnergy(), 2), unit: 'J' }
      ];
      if (this.ghost) {
        const d1 = Math.abs(this.st[0] - this.ghost[0]) / DEG;
        const d2 = Math.abs(this.st[1] - this.ghost[1]) / DEG;
        rows.push({ label: 'Δθ₁ (ε)', value: d1, unit: '°' });
        rows.push({ label: 'Δθ₂ (ε)', value: d2, unit: '°' });
      }
      hud.readout(rows, 'bottom-left');
      return;
    }

    // Péndulo simple.
    const { L, m, th0 } = this.params;
    const bob = { x: p.x + L * Math.sin(this.th), y: p.y - L * Math.cos(this.th) };

    scene.trail(this.trail, { color: 'mass', width: 2 });
    if (this.params.lineal) scene.trail(this.linTrail, { color: 'energy', width: 1.5, dash: [3, 3] });

    scene.line(p.x, p.y, bob.x, bob.y, { color: 'spring', width: 2.5 });
    scene.body(p.x, p.y, { shape: 'circle', r: 0.12, color: 'textDim' });
    scene.body(bob.x, bob.y, { shape: 'circle', r: 0.2 + m * 0.08, color: 'mass', label: `m = ${m} kg`, labelColor: 'mass' });

    // Vertical de referencia y arco del ángulo actual.
    scene.line(p.x, p.y, p.x, p.y - L - 0.8, { color: 'textDim', dash: [2, 4], alpha: 0.5 });
    scene.angleArc(p.x, p.y, Math.PI / 2, Math.PI / 2 - this.th, Math.min(1.4, L * 0.45), {
      color: 'energy',
      label: `${roundTo(this.th / DEG, 1)}°`
    });

    // Peso y su componente tangencial.
    const W = m * G;
    const k = 0.05;
    scene.vector(bob.x, bob.y - 0.1, 0, -W * k, { color: 'force', label: `W = ${roundTo(W, 1)} N`, labelSide: -1 });
    const wt = W * Math.sin(this.th);
    const dir = Math.sign(Math.sin(this.th)) || 1;
    scene.vector(bob.x, bob.y - 0.5, dir * wt * k * Math.cos(this.th), -dir * wt * k * Math.sin(this.th), {
      color: 'velocity',
      label: `W·sin θ = ${roundTo(wt, 1)} N`,
      labelSide: 1
    });

    const hud = scene.hud;
    hud.chip(this.params.roce > 0 ? 'Con roce: amplitud decreciente' : 'Sin roce: E se conserva', 'top-left');
    const rows = [
      { label: 'T (medido)', value: roundTo(this.Tmeasured || this.Tapprox(), 3), unit: 's' },
      { label: 'T = 2π√(L/g)', value: roundTo(this.Tapprox(), 3), unit: 's' },
      { label: 'θ', value: roundTo(this.th / DEG, 1), unit: '°' },
      { label: 'E', value: roundTo(this.energy(), 2), unit: 'J' }
    ];
    hud.readout(rows, 'bottom-left');

    // Diferencia de periodos visible: desviación relativa.
    const vp = scene.viewport();
    if (vp.w > 460 && this.t > 0.5) {
      const dev = Math.abs(this.Tmeasured / this.Tapprox() - 1) * 100;
      const rows2 = [{ label: 'T_real − T_aprox', value: roundTo(this.Tmeasured - this.Tapprox(), 3), unit: 's' }];
      if (dev > 0.05) rows2.push({ label: 'Desviación', value: roundTo(dev, 1), unit: '%' });
      hud.readout(rows2, 'bottom-right');
    }
  }

  /** Energía del doble péndulo (referida al pivote). */
  _doubleEnergy() {
    const { l1, l2, m1, m2 } = this.params;
    const [t1, t2, w1, w2] = this.st;
    const c12 = Math.cos(t1 - t2);
    const T =
      0.5 * (m1 + m2) * l1 * l1 * w1 * w1 +
      0.5 * m2 * l2 * l2 * w2 * w2 +
      m2 * l1 * l2 * w1 * w2 * c12;
    const V = -(m1 + m2) * G * l1 * Math.cos(t1) - m2 * G * l2 * Math.cos(t2);
    return T + V + (m1 + m2) * G * l1 + m2 * G * l2;
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    if (this.params.modo === 'doble') {
      const out = {
        'θ₁': { value: roundTo(this.st[0] / DEG, 2), unit: '°' },
        'θ₂': { value: roundTo(this.st[1] / DEG, 2), unit: '°' },
        'ω₁': { value: roundTo(this.st[2], 3), unit: 'rad/s' },
        'ω₂': { value: roundTo(this.st[3], 3), unit: 'rad/s' },
        'E': { value: roundTo(this._doubleEnergy(), 2), unit: 'J' }
      };
      if (this.ghost) {
        out['Δθ₂ (ε)'] = { value: roundTo(Math.abs(this.st[1] - this.ghost[1]) / DEG, 6), unit: '°' };
      }
      return out;
    }
    return {
      'θ': { value: roundTo(this.th / DEG, 2), unit: '°' },
      'ω': { value: roundTo(this.om, 3), unit: 'rad/s' },
      'T medido': { value: roundTo(this.Tmeasured || this.Tapprox(), 3), unit: 's' },
      'T = 2π√(L/g)': { value: roundTo(this.Tapprox(), 3), unit: 's' },
      'E': { value: roundTo(this.energy(), 2), unit: 'J' }
    };
  }

  getState() {
    return {
      t: this.t,
      th: this.th,
      om: this.om,
      st: [...this.st],
      ghost: this.ghost ? [...this.ghost] : null,
      Tmeasured: this.Tmeasured,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.th)) this.th = s.th;
    if (Number.isFinite(s.om)) this.om = s.om;
    if (Array.isArray(s.st)) this.st = [...s.st];
    if (Array.isArray(s.ghost)) this.ghost = [...s.ghost];
    if (Number.isFinite(s.Tmeasured)) this.Tmeasured = s.Tmeasured;
    this.trail.clear();
    this.linTrail.clear();
    this.trail2.clear();
    this.ghostTrail.clear();
  }

  destroy() {
    this.trail.clear();
    this.linTrail.clear();
    this.trail2.clear();
    this.ghostTrail.clear();
  }
}
