/**
 * @fileoverview Trabajo, energía y potencia con fuerza aplicada y rozamiento
 * cinético. Distinto del resorte MHS (`oscillatory`): aquí hay un bloque
 * sobre una superficie, W y P.
 *
 * Migrado al contrato `SimModule` con `draw(scene)`. Las barras de energía
 * pasan a una gráfica Ec(t), W_ap(t) y W_fric(t) en el HUD, que hace visible
 * el teorema trabajo–energía: W_neto = W_ap + W_fric = ΔEc.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo, toRad } from '../core/geometry.js';

const G = 9.81;
const X0 = -5;
const WRAP_X = 8;
const TRACK_HALF = 8;
const GROUND_Y = -0.6;
/** Escalas de dibujo de los vectores. */
const K_FORCE = 0.12;
const K_VEL = 0.25;

export default class WorkEnergyModule extends SimModule {
  static viewport = { width: 22, height: 12 };
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'm', label: 'Masa', latex: 'm', unit: 'kg', min: 0.5, max: 10, step: 0.5, value: 2 },
    { id: 'F', label: 'Fuerza aplicada', latex: 'F', unit: 'N', min: 0, max: 40, step: 0.5, value: 12 },
    { id: 'mu_k', label: 'Coef. de rozamiento', latex: '\\mu_k', min: 0, max: 1, step: 0.02, value: 0.2 },
    { id: 'theta', label: 'Ángulo de F', latex: '\\theta', unit: '°', min: -30, max: 60, step: 1, value: 0 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { m: 2, F: 12, mu_k: 0.2, theta: 0 };
    this.t = 0;
    this.x = X0;
    this.v = 0;
    this.Wnet = 0;
    this.Wfric = 0;
    this.Wapp = 0;
    /** Historiales para la gráfica del HUD. */
    this.histEc = new TrailBuffer(240);
    this.histWapp = new TrailBuffer(240);
    this.histWfric = new TrailBuffer(240);
    this.dragging = null;
  }

  init(meta = null) {
    this.reset();
    this.renderer?.resetCamera?.();
    this.setModuleInfo({
      title: meta?.title || 'Trabajo, energía y potencia',
      blurb:
        meta?.blurb ||
        'Bloque con fuerza y rozamiento: W = F·d cosθ, teorema trabajo-energía y P = F·v.',
      story:
        'El trabajo de la fuerza neta cambia la energía cinética. El rozamiento disipa energía mecánica en calor.',
      cases: [
        'Empujar un cajón con fricción en el suelo.',
        'Remolcar un trineo con cuerda inclinada.',
        'Potencia del motor al arrancar un vehículo.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Trabajo', formula: 'W = F · d · cosθ' },
        { name: 'Teorema trabajo–energía', formula: 'W<sub>neto</sub> = ΔE<sub>c</sub>' },
        { name: 'Rozamiento cinético', formula: 'f<sub>k</sub> = μ<sub>k</sub> N = μ<sub>k</sub> m g' },
        { name: 'Potencia', formula: 'P = F · v · cosθ', note: 'También P = dW/dt.' }
      ]
    });
    this.clearChallenges();
  }

  _restart() {
    this.x = X0;
    this.v = 0;
    this.Wnet = 0;
    this.Wfric = 0;
    this.Wapp = 0;
    this.histEc.clear();
    this.histWapp.clear();
    this.histWfric.clear();
  }

  reset() {
    this.t = 0;
    this._restart();
    this.engine?.reset?.();
  }

  destroy() {
    this.histEc.clear();
    this.histWapp.clear();
    this.histWfric.clear();
  }

  setTool() {}

  theta() {
    return toRad(this.params.theta);
  }

  /** Normal: el peso menos la componente vertical de F (nunca negativa). */
  normal() {
    return Math.max(this.params.m * G - this.params.F * Math.sin(this.theta()), 0);
  }

  fk() {
    return this.params.mu_k * this.normal();
  }

  Ec() {
    return 0.5 * this.params.m * this.v * this.v;
  }

  power() {
    return this.params.F * this.v * Math.cos(this.theta());
  }

  /** ¿El bloque está retenido por el rozamiento? */
  isStuck() {
    return Math.abs(this.v) < 1e-4 && Math.abs(this.params.F * Math.cos(this.theta())) <= this.fk();
  }

  radius() {
    return Math.min(0.5 + this.params.m * 0.08, 1.3);
  }

  update(dt) {
    if (this.dragging) return;
    this.t += dt;
    const Fx = this.params.F * Math.cos(this.theta());
    const fk = this.fk();
    const Fnet = Fx - (this.v >= 0 ? fk : -fk);
    // En reposo, si F·cosθ no supera al rozamiento (≈ estático), no arranca.
    if (Math.abs(this.v) < 1e-4 && Math.abs(Fx) <= fk) {
      this.v = 0;
    } else {
      const a = Fnet / this.params.m;
      this.v += a * dt;
      const dx = this.v * dt;
      this.x += dx;
      this.Wapp += Fx * dx;
      this.Wfric += -fk * Math.abs(dx);
      this.Wnet += Fnet * dx;
    }
    this.histEc.push({ x: this.t, y: this.Ec() });
    this.histWapp.push({ x: this.t, y: this.Wapp });
    this.histWfric.push({ x: this.t, y: this.Wfric });
    // Pista en bucle: vuelve al inicio con los contadores a cero, para que
    // W_neto ≈ ΔEc siga siendo cierto en cada vuelta.
    if (this.x > WRAP_X) this._restart();
  }

  /* ---------- interacción directa (§2.6) ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    this.x = Math.max(-TRACK_HALF + 1, Math.min(WRAP_X - 0.5, world.x));
    this.v = 0;
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const r = this.radius();
    const th = this.theta();
    const F = this.params.F;
    const fk = this.fk();
    const ec = this.Ec();
    const cy = GROUND_Y + r; // centro del bloque apoyado en el suelo

    // Suelo con rayado (superficie con rozamiento).
    scene.line(-TRACK_HALF, GROUND_Y, TRACK_HALF, GROUND_Y, { color: 'textDim', width: 3 });
    scene.hatch(-TRACK_HALF, GROUND_Y, TRACK_HALF, GROUND_Y, { color: 'textDim', side: 1, spacing: 14, length: 9 });

    // Punto de partida y cota del desplazamiento d.
    scene.line(X0, GROUND_Y, X0, GROUND_Y + 0.35, { color: 'textDim', width: 1.5 });
    const d = this.x - X0;
    if (d > 0.4) {
      scene.dimension(X0, GROUND_Y - 0.6, this.x, GROUND_Y - 0.6, `d = ${roundTo(d, 2)} m`, { color: 'textDim' });
    }

    scene.body(this.x, cy, {
      shape: 'rect',
      r,
      color: 'mass',
      id: 'bloque',
      label: `m = ${this.params.m} kg`,
      labelColor: 'mass'
    });

    // F aplicada con su ángulo θ respecto a la horizontal.
    if (F > 0.05) {
      scene.vector(this.x, cy, Math.cos(th) * F * K_FORCE, Math.sin(th) * F * K_FORCE, {
        color: 'force',
        width: 2.5,
        label: `F = ${F} N`,
        labelSide: th >= 0 ? -1 : 1
      });
      if (Math.abs(this.params.theta) >= 1) {
        scene.line(this.x, cy, this.x + r + 0.8, cy, { color: 'textDim', dash: [3, 3], width: 1 });
        scene.angleArc(this.x, cy, 0, th, r + 0.45, { color: 'force', label: `θ = ${this.params.theta}°` });
      }
    }
    // Rozamiento cinético: se opone al movimiento, en la base del bloque.
    if (fk > 0.05) {
      scene.vector(this.x, GROUND_Y + 0.12, -Math.sign(this.v || 1) * fk * K_FORCE, 0, {
        color: 'accel',
        width: 2.5,
        dash: this.isStuck() ? [4, 3] : [],
        label: `f_k = ${roundTo(fk, 1)} N`,
        labelSide: -1
      });
    }
    // Normal y peso.
    const nLen = Math.min(this.normal() * 0.03, 1.2);
    if (nLen > 0.05) {
      scene.vector(this.x, cy + r, 0, nLen, { color: 'field', width: 2, label: 'N', labelSide: 1 });
    }
    scene.vector(this.x, cy - r * 0.3, 0, -Math.min(this.params.m * G * 0.03, 1.2), {
      color: 'ray',
      width: 2,
      label: 'mg',
      labelSide: -1
    });
    // Velocidad: sale por la derecha del bloque.
    if (Math.abs(this.v) > 0.05) {
      scene.vector(this.x + r + 0.1, cy + r * 0.5, this.v * K_VEL, 0, {
        color: 'velocity',
        width: 2.5,
        dash: [6, 3],
        label: `v = ${roundTo(this.v, 2)} m/s`,
        labelSide: 1
      });
    }

    // HUD
    const hud = scene.hud;
    hud.chip(
      this.isStuck() ? 'En reposo: F·cosθ ≤ f_k, no arranca' : `Deslizando: P = F·v·cosθ = ${roundTo(this.power(), 1)} W`,
      'top-left'
    );
    hud.readout(
      [
        { label: 'Ec', value: ec, unit: 'J' },
        { label: 'W_ap', value: this.Wapp, unit: 'J' },
        { label: 'W_fric', value: this.Wfric, unit: 'J' },
        { label: 'W_neto', value: this.Wnet, unit: 'J' },
        { label: 'P', value: this.power(), unit: 'W' }
      ],
      'bottom-left'
    );

    const vp = scene.viewport();
    if (vp.w > 420) {
      hud.legend(
        [
          { color: 'energy', label: 'Ec' },
          { color: 'force', label: 'W aplicado', dash: [6, 3] },
          { color: 'accel', label: 'W rozamiento', dash: [2, 3] }
        ],
        'top-right'
      );
      const pts = (h, y) => (h.length > 1 ? h : [{ x: 0, y }, { x: 1, y }]);
      hud.plot(
        { x: vp.x + vp.w - 210, y: vp.y + vp.h - 128, w: 195, h: 116 },
        {
          title: 'Energía y trabajo (J) frente a t (s)',
          series: [
            { points: pts(this.histEc, ec), color: 'energy' },
            { points: pts(this.histWapp, this.Wapp), color: 'force', dash: [6, 3] },
            { points: pts(this.histWfric, this.Wfric), color: 'accel', dash: [2, 3] }
          ]
        }
      );
    }
  }

  /* ---------- datos numéricos (§1.1) ---------- */

  readout() {
    return {
      v: { value: roundTo(this.v, 3), unit: 'm/s' },
      x: { value: roundTo(this.x, 2), unit: 'm' },
      'Ec': { value: roundTo(this.Ec(), 2), unit: 'J' },
      'W aplicado': { value: roundTo(this.Wapp, 2), unit: 'J' },
      'W fricción': { value: roundTo(this.Wfric, 2), unit: 'J' },
      'W neto': { value: roundTo(this.Wnet, 2), unit: 'J' },
      'f_k': { value: roundTo(this.fk(), 2), unit: 'N' },
      P: { value: roundTo(this.power(), 2), unit: 'W' },
      θ: { value: this.params.theta, unit: '°' }
    };
  }

  getState() {
    return {
      t: this.t,
      x: this.x,
      v: this.v,
      Wnet: this.Wnet,
      Wfric: this.Wfric,
      Wapp: this.Wapp,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.x)) this.x = s.x;
    if (Number.isFinite(s.v)) this.v = s.v;
    if (Number.isFinite(s.Wnet)) this.Wnet = s.Wnet;
    if (Number.isFinite(s.Wfric)) this.Wfric = s.Wfric;
    if (Number.isFinite(s.Wapp)) this.Wapp = s.Wapp;
    this.histEc.clear();
    this.histWapp.clear();
    this.histWfric.clear();
  }
}
