/**
 * @fileoverview Estática — equilibrio de una partícula (ΣF = 0), tanda 5.1.
 *
 * Masa colgada de dos cuerdas con ángulos ajustables: T1, T2 y peso. Migrado
 * a `draw(scene)` en la WAVE 13 (§13.0/§13.3): la viga fija usa `scene.hatch`
 * (símbolo estándar de apoyo fijo, §13.2) en vez del rectángulo relleno a
 * mano, y las etiquetas de ángulo usan `opts.avoid` para no pisar las
 * etiquetas de tensión cuando las cuerdas quedan muy verticales (§13.1).
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

export default class Statics extends SimModule {
  static viewport = { width: 16, height: 12 };

  /** Punto fijo del techo (donde cuelgan las cuerdas), al origen del mundo (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'm', label: 'Masa', latex: 'm', unit: 'kg', min: 0.5, max: 20, step: 0.5, value: 3 },
    { id: 'theta1', label: 'Cuerda izq.', latex: '\\theta_1', unit: '°', min: 15, max: 80, step: 1, value: 40 },
    { id: 'theta2', label: 'Cuerda der.', latex: '\\theta_2', unit: '°', min: 15, max: 80, step: 1, value: 50 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { m: 3, theta1: 40, theta2: 50 };
    this.g = 9.81;
    this.t = 0;
    /** Oscilación visual si está desequilibrado (no es dinámica completa). */
    this.wobble = 0;
    this.unbalanced = false;
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: meta?.title || 'Estática',
      blurb: meta?.blurb || 'Equilibrio de fuerzas: una masa colgada de dos cuerdas. ΣFₓ = 0 y ΣFᵧ = 0.',
      story:
        'La estática estudia cuerpos en reposo (o velocidad constante) bajo fuerzas equilibradas. ' +
        'Para una partícula: la suma vectorial de fuerzas es cero. Aquí una lámpara o letrero ' +
        'cuelga de dos cables: las tensiones horizontales se cancelan y las verticales sostienen el peso.',
      cases: [
        'Letrero de tienda colgado de dos cables en la fachada.',
        'Hamaca o tirolina con un peso en el centro.',
        'Puente colgante: cables principales en equilibrio con el tablero.'
      ]
    });
    setModuleFormulas(this.ui, {
      items: [
        { name: 'Equilibrio', formula: '\\sum \\vec F = 0' },
        { name: 'Componentes', formula: '\\sum F_x = 0,\\quad \\sum F_y = 0' },
        { name: 'Horizontal', formula: 'T_1\\cos\\theta_1 = T_2\\cos\\theta_2' },
        { name: 'Vertical', formula: 'T_1\\sin\\theta_1 + T_2\\sin\\theta_2 = mg' }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.wobble = 0;
    this.engine?.reset?.();
  }

  update(dt) {
    this.t += dt;
    const sol = this.solveTensions();
    this.unbalanced = !sol.ok;
    this.wobble = this.unbalanced ? this.wobble + dt * 6 : this.wobble * 0.9;
  }

  /**
   * Tensiones en equilibrio horizontal y vertical:
   * T1 cos θ1 = T2 cos θ2
   * T1 sin θ1 + T2 sin θ2 = mg
   */
  solveTensions() {
    const { m, theta1, theta2 } = this.params;
    const th1 = (theta1 * Math.PI) / 180;
    const th2 = (theta2 * Math.PI) / 180;
    const c1 = Math.cos(th1);
    const s1 = Math.sin(th1);
    const c2 = Math.cos(th2);
    const s2 = Math.sin(th2);
    const W = m * this.g;

    // Matriz: [c1  -c2] [T1] = [0]
    //         [s1   s2] [T2]   [W]
    const det = c1 * s2 + c2 * s1;
    if (Math.abs(det) < 1e-9) return { T1: NaN, T2: NaN, ok: false, W, th1, th2 };
    const T1 = (W * c2) / det;
    const T2 = (W * c1) / det;
    const ok = T1 > 0 && T2 > 0 && theta1 > 5 && theta2 > 5;
    return { T1, T2, ok, W, th1, th2 };
  }

  /** Anclajes fijos y posición de la masa, con el techo en el origen (§17.1). */
  layout() {
    const roofY = 0;
    const left = { x: -5.5, y: roofY };
    const right = { x: 5.5, y: roofY };
    const span = right.x - left.x;
    const sol = this.solveTensions();
    let mx;
    if (sol.ok) {
      const w1 = Math.cos(sol.th2);
      const w2 = Math.cos(sol.th1);
      mx = left.x + (span * w1) / (w1 + w2);
    } else {
      mx = 0;
    }
    const drop1 = Math.tan(sol.th1) > 0.05 ? (mx - left.x) * Math.tan(sol.th1) : 2;
    const drop2 = Math.tan(sol.th2) > 0.05 ? (right.x - mx) * Math.tan(sol.th2) : 2;
    const my = left.y - Math.min(drop1, drop2, 4.5);
    const shake = this.unbalanced ? Math.sin(this.wobble) * 0.12 : 0;
    return {
      left,
      right,
      mass: { x: mx + shake, y: Math.max(my, -1.5) + (this.unbalanced ? Math.cos(this.wobble * 1.3) * 0.05 : 0) },
      sol
    };
  }

  /* ---------- dibujo declarativo (§2.4, migrado en WAVE 13) ---------- */

  draw(scene) {
    const { m } = this.params;
    const { left, right, mass, sol } = this.layout();

    // Viga fija: rayado de apoyo (§13.2) bajo la línea de techo — reemplaza
    // el rectángulo relleno a mano de la versión legacy.
    scene.line(left.x - 1, 0.35, right.x + 1, 0.35, { color: 'textDim', width: 2 });
    scene.hatch(left.x - 1, 0.35, right.x + 1, 0.35, { spacing: 9, length: 11, side: 1 });

    // Anclajes
    scene.body(left.x, left.y, { shape: 'circle', r: 0.16, color: 'textDim', glow: false });
    scene.body(right.x, right.y, { shape: 'circle', r: 0.16, color: 'textDim', glow: false });

    // Cuerdas
    scene.line(left.x, left.y, mass.x, mass.y, { color: this.unbalanced ? 'force' : 'text', width: 2.5 });
    scene.line(mass.x, mass.y, right.x, right.y, { color: this.unbalanced ? 'force' : 'text', width: 2.5 });

    // Masa
    const size = Math.min(0.28 + m * 0.04, 0.7);
    scene.body(mass.x, mass.y, {
      shape: 'circle',
      r: size,
      color: this.unbalanced ? 'force' : 'mass',
      label: `${m} kg`
    });

    // Ángulos anotados: `avoid` los aparta si una cuerda muy vertical los
    // acerca a la etiqueta de la tensión correspondiente (§13.1).
    scene.label(left.x, left.y - 0.5, `θ₁ = ${this.params.theta1}°`, {
      color: 'textDim', size: 11, align: 'left', baseline: 'bottom', offsetX: 6, avoid: true
    });
    scene.label(right.x, right.y - 0.5, `θ₂ = ${this.params.theta2}°`, {
      color: 'textDim', size: 11, align: 'right', baseline: 'bottom', offsetX: -6, avoid: true
    });

    // Vectores en el nudo (fuerzas sobre la masa)
    if (sol.ok) {
      const sc = 0.08;
      const dx1 = left.x - mass.x;
      const dy1 = left.y - mass.y;
      const len1 = Math.hypot(dx1, dy1) || 1;
      scene.vector(mass.x, mass.y, (dx1 / len1) * sol.T1 * sc, (dy1 / len1) * sol.T1 * sc, {
        color: 'energy', width: 2.5, label: `T₁=${roundTo(sol.T1, 1)} N`, labelSide: 1
      });
      const dx2 = right.x - mass.x;
      const dy2 = right.y - mass.y;
      const len2 = Math.hypot(dx2, dy2) || 1;
      scene.vector(mass.x, mass.y, (dx2 / len2) * sol.T2 * sc, (dy2 / len2) * sol.T2 * sc, {
        color: 'field', width: 2.5, label: `T₂=${roundTo(sol.T2, 1)} N`, labelSide: -1
      });
      scene.vector(mass.x, mass.y, 0, -sol.W * sc, {
        color: 'force', width: 2.5, label: `mg=${roundTo(sol.W, 1)} N`, labelSide: 1
      });
    }

    const hud = scene.hud;
    hud.chip(
      this.unbalanced ? 'Configuración inestable — sube los ángulos' : 'ΣF = 0 · equilibrio estático',
      'top-left',
      { color: this.unbalanced ? 'force' : 'energy' }
    );
    if (sol.ok) {
      hud.readout(
        [
          { label: 'T₁', value: roundTo(sol.T1, 1), unit: 'N' },
          { label: 'T₂', value: roundTo(sol.T2, 1), unit: 'N' },
          { label: 'mg', value: roundTo(sol.W, 1), unit: 'N' }
        ],
        'top-left'
      );
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const sol = this.solveTensions();
    if (!sol.ok) {
      return {
        estado: { value: 'sin equilibrio estable', unit: '' },
        mg: { value: roundTo(sol.W, 2), unit: 'N' }
      };
    }
    const Fx1 = sol.T1 * Math.cos(sol.th1);
    const Fy1 = sol.T1 * Math.sin(sol.th1);
    const Fx2 = sol.T2 * Math.cos(sol.th2);
    const Fy2 = sol.T2 * Math.sin(sol.th2);
    return {
      T1: { value: roundTo(sol.T1, 2), unit: 'N' },
      T2: { value: roundTo(sol.T2, 2), unit: 'N' },
      mg: { value: roundTo(sol.W, 2), unit: 'N' },
      'ΣFx': { value: roundTo(Fx1 - Fx2, 3), unit: 'N' },
      'ΣFy': { value: roundTo(Fy1 + Fy2 - sol.W, 3), unit: 'N' }
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
