/**
 * @fileoverview Gravedad universal — satélite alrededor de una masa central
 * fija (F = GM·m / r²).
 *
 * Migrado al contrato `SimModule` + `draw(scene)`: el estado vive en la
 * instancia, los parámetros son un esquema declarativo y el dibujo usa el
 * vocabulario de la escena (nada de `ctx` ni de `worldToCanvas`).
 *
 * Pedagogía visual: la masa central grande en el origen (hay un cuerpo ahí,
 * a diferencia de `magnetic`), la órbita circular de referencia para el
 * mismo r₀ (dibujada a trazos) y los vectores v y F etiquetados. La gráfica
 * r(t) muestra si la órbita es circular (recta), elíptica (oscila) o de
 * escape (crece sin volver).
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../core/geometry.js';

/** Radio dibujado de la masa central (unidades de mundo). */
const R_CENTRAL = 0.7;
/** Radio dibujado del satélite. */
const R_SAT = 0.3;
/** Límites del «espacio con paredes»: al salir, la simulación reinicia. */
const BOUND_X = 12;
const BOUND_Y = 9;

export default class GravityModule extends SimModule {
  /** Encuadre 24 × 18: cabe una órbita con r₀ = 9 con margen. */
  static viewport = { width: 24, height: 18 };

  /** Punto fijo: la masa central está en el origen (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'GM', label: 'Producto G·M', latex: 'GM', unit: 'm³/s²', min: 10, max: 80, step: 1, value: 40 },
    { id: 'r0', label: 'Radio inicial', latex: 'r_0', unit: 'm', min: 2, max: 9, step: 0.2, value: 5 },
    { id: 'v0', label: 'Velocidad tangencial', latex: 'v_0', unit: 'm/s', min: 0.5, max: 6, step: 0.1, value: 2.8 },
    { id: 'm', label: 'Masa del satélite', latex: 'm', unit: 'kg', min: 0.1, max: 5, step: 0.1, value: 1 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { GM: 40, r0: 5, v0: 2.8, m: 1 };
    this.t = 0;
    this.x = 5;
    this.y = 0;
    this.vx = 0;
    this.vy = 2.8;
    /** Espacio infinito: la cámara sigue parcialmente al satélite. */
    this.unbounded = true;
    /** Estela del satélite (anillo, sin `shift()` por frame). */
    this.trail = new TrailBuffer(400);
    /** Historial r(t) para la gráfica del HUD. */
    this.history = new TrailBuffer(240);
    /** Acumulador de muestreo de la gráfica (~20 Hz). */
    this._sampleAcc = 0;
    /** Puntos de la órbita circular de referencia (array plano reutilizado). */
    this._ring = new Array(2 * 65).fill(0);
  }

  init(meta = null) {
    this.reset();
    this.renderer?.resetCamera?.();

    this.setModuleInfo({
      title: meta?.title || 'Gravedad universal',
      blurb: meta?.blurb || 'Órbita 2D de un satélite alrededor de una masa central fija (GM).',
      story:
        'Newton unificó la caída de una manzana y el movimiento de la Luna con una sola ley: toda masa atrae a toda otra con una fuerza que decae con el cuadrado de la distancia. Con la velocidad justa la trayectoria es un círculo; con menos, una elipse que se acerca; con más, una elipse que se aleja o una hipérbola de escape.',
      cases: [
        'Satélite en órbita circular: v = √(GM/r).',
        'Menos velocidad que la circular: órbita elíptica que cae hacia la masa.',
        'Más de √2 veces la circular: la nave escapa (E ≥ 0).',
        'Aumentar GM (planeta más masivo) encoge la órbita para la misma v₀.'
      ]
    });

    this.setModuleFormulas({
      items: [
        { name: 'Gravedad (magnitud)', formula: 'F = G·M·m / r²' },
        { name: 'Velocidad circular', formula: 'v_c = √(GM / r)' },
        { name: 'Velocidad de escape', formula: 'v_e = √(2GM / r)' },
        {
          name: 'Energía específica',
          formula: 'E/m = ½v² − GM/r',
          note: 'Negativa → órbita ligada (elipse); ≥ 0 → escape.'
        }
      ]
    });

    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.x = this.params.r0;
    this.y = 0;
    this.vx = 0;
    this.vy = this.params.v0;
    this.trail.clear();
    this.history.clear();
    this._sampleAcc = 0;
    if (!this.unbounded) this.renderer?.resetCamera?.();
    this.engine?.reset?.();
  }

  destroy() {
    this.trail.clear();
    this.history.clear();
    this.renderer?.resetCamera?.();
  }

  /* ---------- espacio infinito (§17.3) ---------- */

  setTool(id) {
    if (id === 'unbounded') this.setUnbounded(!this.unbounded);
  }

  setUnbounded(on) {
    this.unbounded = !!on;
    if (!this.unbounded) this.renderer?.resetCamera?.();
  }

  getUnbounded() {
    return this.unbounded;
  }

  /* ---------- física ---------- */

  r() {
    return Math.hypot(this.x, this.y) || 1e-6;
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** Energía mecánica por unidad de masa. */
  specificEnergy() {
    const v = this.speed();
    return 0.5 * v * v - this.params.GM / this.r();
  }

  /** Fuerza gravitatoria sobre el satélite (N). */
  force() {
    const r = this.r();
    return (this.params.GM * this.params.m) / (r * r);
  }

  /** Periodo de la órbita ligada (vis-viva), o null si es de escape. */
  period() {
    const E = this.specificEnergy();
    if (E >= 0) return null;
    const a = -this.params.GM / (2 * E);
    return 2 * Math.PI * Math.sqrt((a * a * a) / this.params.GM);
  }

  update(dt) {
    this.t += dt;
    const r = this.r();
    const aMag = this.params.GM / (r * r);
    const ax = (-aMag * this.x) / r;
    const ay = (-aMag * this.y) / r;
    // Euler semi-implícito: estable para órbitas ligadas a 60 Hz.
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (!this.unbounded) {
      // Paredes suaves: al salir del encuadre la simulación vuelve a empezar.
      if (Math.abs(this.x) > BOUND_X || Math.abs(this.y) > BOUND_Y) {
        this.reset();
        return;
      }
    } else {
      // Seguimiento parcial al punto medio M–m: ambos cuerpos siguen a la vista.
      this.renderer?.follow?.(this.x * 0.5, this.y * 0.5);
    }

    this.trail.push({ x: this.x, y: this.y });
    this._sampleAcc += dt;
    if (this._sampleAcc >= 0.05) {
      this._sampleAcc = 0;
      this.history.push({ x: this.t, y: this.r() });
    }
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { GM, r0, m } = this.params;
    const r = this.r();
    const v = this.speed();
    const E = this.specificEnergy();

    // Órbita circular de referencia para r₀: si el satélite la sigue, v₀ era
    // exactamente √(GM/r₀). Se ve de un vistazo cuánto se aparta.
    const ring = this._ring;
    const n = ring.length / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1)) * Math.PI * 2;
      ring[2 * i] = r0 * Math.cos(a);
      ring[2 * i + 1] = r0 * Math.sin(a);
    }
    scene.polyline(ring, { color: 'textDim', dash: [4, 5], width: 1, alpha: 0.6 });

    // Estela del satélite.
    if (this.trail.length > 1) scene.trail(this.trail, { color: 'trail', width: 1.8, alpha: 0.6 });

    // Radio vector: línea a trazos M → m con su medida.
    scene.line(0, 0, this.x, this.y, { color: 'textDim', dash: [3, 4], width: 1, alpha: 0.8 });
    scene.label(this.x / 2, this.y / 2, `r = ${roundTo(r, 2)} m`, { color: 'textDim', size: 11, avoid: true });

    // Masa central: cuerpo grande en el origen (hay un objeto físico ahí).
    scene.body(0, 0, { shape: 'circle', r: R_CENTRAL, color: 'mass2', label: `M (GM = ${GM})`, labelColor: 'mass2' });

    // Satélite con sus vectores.
    scene.body(this.x, this.y, { shape: 'circle', r: R_SAT, color: 'mass', label: `m = ${m} kg`, labelColor: 'mass', id: 'sat' });
    if (v > 0.01) {
      scene.vector(this.x, this.y, this.vx * 0.3, this.vy * 0.3, {
        color: 'velocity',
        label: `v = ${roundTo(v, 2)} m/s`
      });
    }
    // Fuerza hacia la masa central; longitud visual saturada.
    const F = this.force();
    const fLen = Math.min(2.2, 0.35 + F * 0.15);
    scene.vector(this.x, this.y, (-this.x / r) * fLen, (-this.y / r) * fLen, {
      color: 'force',
      label: `F = ${roundTo(F, 2)} N`,
      labelSide: -1
    });

    // HUD.
    const hud = scene.hud;
    const vc = Math.sqrt(GM / r);
    hud.chip(
      E < 0 ? 'Órbita ligada (E < 0)' : 'Trayectoria de escape (E ≥ 0)',
      'top-left'
    );
    hud.chip(this.unbounded ? 'Espacio infinito: cámara sigue al satélite' : 'Con paredes: reinicia al salir', 'top-left');
    const T = this.period();
    hud.readout(
      [
        { label: 'r', value: r, unit: 'm' },
        { label: '|v|', value: v, unit: 'm/s' },
        { label: 'v_circ', value: vc, unit: 'm/s' },
        { label: 'E/m', value: E, unit: 'J/kg' },
        ...(T ? [{ label: 'T', value: T, unit: 's' }] : [])
      ],
      'bottom-left'
    );
    hud.legend(
      [
        { color: 'velocity', label: 'Velocidad v' },
        { color: 'force', label: 'Fuerza gravitatoria F' },
        { color: 'textDim', label: 'Órbita circular de referencia', dash: [4, 5] },
        { color: 'trail', label: 'Trayectoria real' }
      ],
      'top-right'
    );

    const vp = scene.viewport();
    if (vp.w > 420) {
      const points = this.history.length > 1 ? this.history : [{ x: 0, y: r }, { x: 1, y: r }];
      const span = Math.max(r0 * 2, r * 1.1, 1);
      hud.plot(
        { x: vp.x + vp.w - 215, y: vp.y + vp.h - 128, w: 200, h: 116 },
        {
          title: 'Distancia r(t)',
          series: [{ points, color: 'mass', label: 'r' }],
          yRange: [0, span]
        }
      );
    }
  }

  /* ---------- manipulación directa ---------- */

  /** Arrastrar el satélite reposiciona la órbita manteniendo la rapidez tangencial. */
  onDrag(id, world) {
    if (id !== 'sat') return;
    const rr = Math.hypot(world.x, world.y);
    if (rr < R_CENTRAL + R_SAT) return;
    this.x = world.x;
    this.y = world.y;
    const v = this.speed() || this.params.v0;
    // Velocidad tangencial en sentido antihorario.
    this.vx = (-world.y / rr) * v;
    this.vy = (world.x / rr) * v;
    this.trail.clear();
    this.history.clear();
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const r = this.r();
    const v = this.speed();
    const T = this.period();
    return {
      r: { value: roundTo(r, 3), unit: 'm' },
      '|v|': { value: roundTo(v, 3), unit: 'm/s' },
      'v_circ': { value: roundTo(Math.sqrt(this.params.GM / r), 3), unit: 'm/s' },
      'v_escape': { value: roundTo(Math.sqrt((2 * this.params.GM) / r), 3), unit: 'm/s' },
      'F': { value: roundTo(this.force(), 3), unit: 'N' },
      'E/m': { value: roundTo(this.specificEnergy(), 3), unit: 'J/kg' },
      'T (órbita ligada)': { value: T ? roundTo(T, 2) : 0, unit: 's' }
    };
  }

  getState() {
    return {
      t: this.t,
      pos: { x: this.x, y: this.y },
      vel: { x: this.vx, y: this.vy },
      unbounded: this.unbounded,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (s.pos) {
      this.x = s.pos.x;
      this.y = s.pos.y;
    }
    if (s.vel) {
      this.vx = s.vel.x;
      this.vy = s.vel.y;
    }
    if (typeof s.unbounded === 'boolean') this.setUnbounded(s.unbounded);
    this.trail.clear();
    this.history.clear();
  }
}
