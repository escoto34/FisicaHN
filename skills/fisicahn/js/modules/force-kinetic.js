/**
 * @fileoverview Fuerza cinética — cómo una fuerza neta genera aceleración y
 * energía cinética. Ec = ½ m v² · W_neto = ΔEc · F = m a
 *
 * Migrado al contrato `SimModule` con `draw(scene)`. Sin fricción: todo el
 * trabajo de F se convierte en energía cinética, y la gráfica del HUD muestra
 * Ec(t) y W_neto(t) superpuestas para que se vea el teorema trabajo–energía.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../core/geometry.js';

/** Posición de partida y límites de la pista (unidades de mundo). */
const X0 = -6;
const TRACK_HALF = 9;
const WRAP_X = 8;
const GROUND_Y = -0.5;
/** Escalas de dibujo de los vectores. */
const K_FORCE = 0.12;
const K_VEL = 0.22;
const K_ACC = 0.35;

export default class ForceKineticModule extends SimModule {
  static viewport = { width: 22, height: 12 };
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'm', label: 'Masa', latex: 'm', unit: 'kg', min: 0.5, max: 15, step: 0.5, value: 2 },
    { id: 'F', label: 'Fuerza neta', latex: 'F', unit: 'N', min: -20, max: 40, step: 0.5, value: 8 },
    { id: 'v0', label: 'Velocidad inicial', latex: 'v_0', unit: 'm/s', min: -5, max: 10, step: 0.5, value: 0 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { m: 2, F: 8, v0: 0 };
    this.t = 0;
    this.x = X0;
    this.v = 0;
    /** Trabajo neto acumulado desde la última partida. */
    this.Wnet = 0;
    /** Ec en la partida: W_neto = Ec − Ec0. */
    this.Ec0 = 0;
    this.trail = new TrailBuffer(80);
    /** Historiales Ec(t) y W(t) para la gráfica del HUD. */
    this.histEc = new TrailBuffer(240);
    this.histW = new TrailBuffer(240);
    this.dragging = null;
  }

  init(meta = null) {
    this.reset();
    this.renderer?.resetCamera?.();

    this.setModuleInfo({
      title: meta?.title || 'Fuerza cinética',
      blurb:
        meta?.blurb ||
        'Una fuerza neta acelera la masa: a = F/m y la energía cinética crece Ec = ½mv².',
      story:
        '“Cinético” se refiere al movimiento. Una fuerza neta distinta de cero produce aceleración ' +
        'y por tanto cambia la velocidad y la energía cinética. El teorema trabajo–energía dice que ' +
        'el trabajo de la fuerza neta es igual al cambio de Ec. Aquí no hay fricción: toda F va a aumentar Ec.',
      cases: [
        'Acelerar un carrito con un empuje constante en el laboratorio.',
        'Un cohete en el vacío (empuje ≈ fuerza neta).',
        'Comparar dos masas con la misma F: la más liviana gana más Ec en el mismo tiempo.'
      ]
    });

    this.setModuleFormulas({
      items: [
        { name: 'Segunda ley', formula: 'F = m a \\Rightarrow a = F/m' },
        { name: 'Energía cinética', formula: 'E_c = \\tfrac{1}{2} m v^2' },
        { name: 'Trabajo–energía', formula: 'W_{\\mathrm{neto}} = \\Delta E_c' },
        { name: 'Velocidad (a const.)', formula: 'v = v_0 + a t' }
      ]
    });
    this.clearChallenges();
  }

  _restart(x = X0) {
    this.x = x;
    this.v = this.params.v0;
    this.Wnet = 0;
    this.Ec0 = this.Ec();
    this.trail.clear();
  }

  reset() {
    this.t = 0;
    this._restart();
    this.histEc.clear();
    this.histW.clear();
    this.engine?.reset?.();
  }

  destroy() {
    this.trail.clear();
    this.histEc.clear();
    this.histW.clear();
  }

  setTool() {}

  Ec() {
    return 0.5 * this.params.m * this.v * this.v;
  }

  a() {
    return this.params.F / this.params.m;
  }

  radius() {
    return Math.min(0.35 + this.params.m * 0.06, 0.85);
  }

  update(dt) {
    if (this.dragging) return;
    this.t += dt;
    const acc = this.a();
    const vPrev = this.v;
    this.v += acc * dt;
    const dx = ((this.v + vPrev) / 2) * dt;
    this.x += dx;
    this.Wnet += this.params.F * dx;

    this.trail.push({ x: this.x, y: 0 });
    this.histEc.push({ x: this.t, y: this.Ec() });
    this.histW.push({ x: this.t, y: this.Wnet });

    // Pista en bucle: al salir por un extremo vuelve a empezar por el otro
    // lado, con la velocidad inicial y el contador de trabajo a cero.
    if (this.x > WRAP_X) this._restart(X0);
    else if (this.x < -WRAP_X) this._restart(WRAP_X - 2);
  }

  /* ---------- interacción directa (§2.6) ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    this.x = Math.max(-TRACK_HALF + 0.5, Math.min(TRACK_HALF - 0.5, world.x));
    this.v = this.params.v0;
    this.Wnet = 0;
    this.Ec0 = this.Ec();
    this.trail.clear();
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const r = this.radius();
    const acc = this.a();
    const ec = this.Ec();
    const F = this.params.F;

    // Suelo con rayado: pista sin fricción, pero con referencia visual.
    scene.line(-TRACK_HALF, GROUND_Y, TRACK_HALF, GROUND_Y, { color: 'textDim', width: 2.5 });
    scene.hatch(-TRACK_HALF, GROUND_Y, TRACK_HALF, GROUND_Y, { color: 'textDim', side: 1, spacing: 16, length: 8 });

    // Punto de partida y cota del desplazamiento d: W = F·d.
    scene.line(X0, GROUND_Y, X0, GROUND_Y + 0.35, { color: 'textDim', width: 1.5 });
    const d = this.x - X0;
    if (Math.abs(d) > 0.4) {
      scene.dimension(X0, GROUND_Y - 0.55, this.x, GROUND_Y - 0.55, `d = ${roundTo(d, 2)} m`, { color: 'textDim' });
    }

    if (this.trail.length > 1) {
      scene.trail(this.trail, { color: 'trail', width: 2, dash: [5, 5], fade: true });
    }

    scene.body(this.x, 0, {
      shape: 'circle',
      r,
      color: 'mass',
      id: 'masa',
      label: `m = ${this.params.m} kg`,
      labelColor: 'mass'
    });

    // Vectores: F (sólido, arriba), a (punteado, más arriba) y v (a trazos, abajo).
    if (Math.abs(F) > 0.05) {
      scene.vector(this.x, 0.15, F * K_FORCE, 0, {
        color: 'force',
        width: 2.5,
        label: `F = ${F} N`,
        labelSide: 1
      });
    }
    if (Math.abs(acc) > 0.01) {
      scene.vector(this.x, r + 0.9, acc * K_ACC, 0, {
        color: 'accel',
        width: 2,
        dash: [3, 3],
        label: `a = ${roundTo(acc, 2)} m/s²`,
        labelSide: 1
      });
    }
    if (Math.abs(this.v) > 0.05) {
      scene.vector(this.x, -0.2, this.v * K_VEL, 0, {
        color: 'velocity',
        width: 2.5,
        dash: [6, 3],
        label: `v = ${roundTo(this.v, 2)} m/s`,
        labelSide: -1
      });
    }

    // HUD
    const hud = scene.hud;
    hud.chip('Sin fricción: todo el trabajo de F va a Ec', 'top-left');
    hud.readout(
      [
        { label: 't', value: this.t, unit: 's' },
        { label: 'a', value: acc, unit: 'm/s²' },
        { label: 'v', value: this.v, unit: 'm/s' },
        { label: 'Ec', value: ec, unit: 'J' },
        { label: 'W', value: this.Wnet, unit: 'J' }
      ],
      'bottom-left'
    );

    const vp = scene.viewport();
    if (vp.w > 420) {
      hud.legend(
        [
          { color: 'energy', label: 'Ec = ½mv²' },
          { color: 'force', label: 'W neto = F·d', dash: [6, 3] }
        ],
        'top-right'
      );
      const ecPts = this.histEc.length > 1 ? this.histEc : [{ x: 0, y: ec }, { x: 1, y: ec }];
      const wPts = this.histW.length > 1 ? this.histW : [{ x: 0, y: this.Wnet }, { x: 1, y: this.Wnet }];
      hud.plot(
        { x: vp.x + vp.w - 210, y: vp.y + vp.h - 128, w: 195, h: 116 },
        {
          title: 'Energía (J) frente a t (s)',
          series: [
            { points: ecPts, color: 'energy', label: 'Ec' },
            { points: wPts, color: 'force', label: 'W', dash: [6, 3] }
          ]
        }
      );
    }
  }

  /* ---------- datos numéricos (§1.1) ---------- */

  readout() {
    return {
      t: { value: roundTo(this.t, 2), unit: 's' },
      F: { value: this.params.F, unit: 'N' },
      m: { value: this.params.m, unit: 'kg' },
      a: { value: roundTo(this.a(), 3), unit: 'm/s²' },
      v: { value: roundTo(this.v, 3), unit: 'm/s' },
      x: { value: roundTo(this.x, 2), unit: 'm' },
      'Ec': { value: roundTo(this.Ec(), 2), unit: 'J' },
      'W neto': { value: roundTo(this.Wnet, 2), unit: 'J' },
      'ΔEc': { value: roundTo(this.Ec() - this.Ec0, 2), unit: 'J' }
    };
  }

  getState() {
    return { t: this.t, x: this.x, v: this.v, Wnet: this.Wnet, Ec0: this.Ec0, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.x)) this.x = s.x;
    if (Number.isFinite(s.v)) this.v = s.v;
    if (Number.isFinite(s.Wnet)) this.Wnet = s.Wnet;
    if (Number.isFinite(s.Ec0)) this.Ec0 = s.Ec0;
    if (Number.isFinite(s.t)) this.t = s.t;
    this.trail.clear();
    this.histEc.clear();
    this.histW.clear();
  }
}
