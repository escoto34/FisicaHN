/**
 * @fileoverview Plano inclinado — descomposición del peso, fricción y polea
 * (tanda 5.1). Ejercita `polygon`, `vector`, `pulley`, `angleArc` y `dimension`.
 *
 * Un bloque de masa m₁ se desliza por un plano de ángulo θ con coeficiente de
 * fricción μ; opcionalmente, una cuerda que pasa por una polea lo une a una
 * masa colgante m₂. El módulo muestra el triángulo de fuerzas — W, N y W‖ —
 * y resuelve la aceleración, deteniéndose en el estado de equilibrio estático
 * cuando el rozamiento alcanza a sostenerlo.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const G = 9.8;
const DEG = Math.PI / 180;
const L = 8; // longitud del plano (m)

export default class InclinedPlane extends SimModule {
  static viewport = { width: 24, height: 14 };

  static params = [
    { id: 'ang', label: 'Ángulo', latex: '\\theta', unit: '°', min: 0, max: 60, step: 1, value: 30 },
    { id: 'm1', label: 'Masa del bloque', latex: 'm_1', unit: 'kg', min: 0.5, max: 20, step: 0.5, value: 5 },
    { id: 'mu', label: 'Coef. de fricción', latex: '\\mu', min: 0, max: 0.9, step: 0.05, value: 0.2 },
    { id: 'polea', type: 'checkbox', label: 'Con polea y contrapeso', value: true },
    { id: 'm2', label: 'Masa colgante', latex: 'm_2', unit: 'kg', min: 0.5, max: 20, step: 0.5, value: 5 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { ang: 30, m1: 5, mu: 0.2, polea: true, m2: 5 };
    this.s = 0; // posición del bloque a lo largo del plano (0 = base)
    this.v = 0; // rapidez a lo largo del plano (pos = hacia la cima)
    this.t = 0;
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Plano inclinado',
      blurb: 'Descomposición del peso, fricción y polea con contrapeso.',
      story:
        'El plano inclinado es la máquina simple que convierte la dirección de la gravedad. La clave es descomponer el peso en una componente paralela al plano (la que mueve al bloque) y otra normal (la que equilibra a N). Con polea y contrapeso, el problema se vuelve dos cuerpos unidos por una cuerda tensa.',
      cases: [
        'Un bloque a 30° sin rozamiento: a = g·sin 30° = 4.9 m/s².',
        'Aumentar μ hasta que el bloque quede en reposo: ángulo crítico.',
        'Contrapeso que sube al bloque: comparar la aceleración de dos cuerpos.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Plano inclinado',
      items: [
        {
          name: 'Peso descompuesto',
          formula: 'W_∥ = m·g·sin θ,  W_⊥ = m·g·cos θ',
          note: 'Los ejes se rotan para que uno quede paralelo al plano.'
        },
        {
          name: 'Normal',
          formula: 'N = m·g·cos θ',
          note: 'La normal compensa la componente perpendicular del peso.'
        },
        {
          name: 'Aceleración (sin polea)',
          formula: 'a = g·(sin θ − μ·cos θ)',
          note: 'Si el resultado es ≤ 0, el rozamiento estático lo sostiene.'
        },
        {
          name: 'Aceleración (con polea)',
          formula: 'a = (m₂·g − m₁·g·sin θ − F_r)/(m₁ + m₂)',
          note: 'F_r = μ·m₁·g·cos θ en la dirección del movimiento.'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.s = 0;
    this.v = 0;
    this.t = 0;
    this.engine?.reset?.();
  }

  /** Gravedad medida sobre el plano: W∥ = m₁·g·sin θ (positivo hacia la base). */
  WParallel() {
    return this.params.m1 * G * Math.sin(this.params.ang * DEG);
  }

  normal() {
    return this.params.m1 * G * Math.cos(this.params.ang * DEG);
  }

  frictionMax() {
    return this.params.mu * this.normal();
  }

  /** Aceleración (a lo largo del plano, + hacia la cima). */
  acceleration() {
    const { m1, mu, m2, polea, ang } = this.params;
    const th = ang * DEG;
    const Wp = m1 * G * Math.sin(th);
    const fMax = mu * m1 * G * Math.cos(th);

    if (!polea) {
      // El bloque tiende a bajar con g·(sin θ − μ·cos θ). En reposo y sin
      // tendencia neta (sin θ ≤ μ·cos θ), la estática lo sostiene: a = 0.
      const slip = Math.sin(th) - mu * Math.cos(th);
      if (Math.abs(this.v) < 0.01 && slip <= 1e-9) return 0;
      return -G * slip; // + = hacia la cima
    }

    // Con polea: la fricción se opone al movimiento relativo.
    const Fnet = m2 * G - Wp;
    const dir = Math.abs(Fnet) > 1e-9 ? Math.sign(Fnet) : Math.sign(this.v);
    if (Math.abs(Fnet) <= fMax && Math.abs(this.v) < 0.01) return 0; // estática
    return (Fnet - dir * fMax) / (m1 + m2);
  }

  /** Estado físico actual para el HUD. */
  motionState(a) {
    if (this.s >= L - 0.01) return 'En la cima (choque suave)';
    if (this.s <= 0.01 && this.v <= 0.001 && Math.abs(a) < 1e-9) {
      return Math.abs(this.WParallel()) <= this.frictionMax() + 1e-9 ? 'Equilibrio (estática)' : 'Equilibrio';
    }
    if (Math.abs(this.v) < 0.01 && Math.abs(a) < 1e-9) return 'Equilibrio';
    return a > 0 ? 'Sube' : 'Baja';
  }

  update(dt) {
    const a = this.acceleration();
    // Integración sencilla (Euler). Parar al llegar a los extremos.
    this.s += this.v * dt + 0.5 * a * dt * dt;
    this.v += a * dt;
    this.t += dt;
    if (this.s >= L) {
      this.s = L;
      this.v = 0;
    }
    if (this.s <= 0) {
      // Si la tendencia es bajar y no hay polea, la pared de la base lo detiene
      // igual que en un carril.
      this.s = 0;
      this.v = 0;
    }
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { ang, m1, mu, polea, m2 } = this.params;
    const th = ang * DEG;
    const w = scene.world();
    const x0 = w.left + 1.4;
    const yb = w.bottom + 1.55;
    const baseEndX = x0 + L * Math.cos(th);
    const topX = baseEndX;
    const topY = yb + L * Math.sin(th);

    // Triángulo del plano (polígonos: el plano y la masa de apoyo).
    scene.polygon(
      [
        { x: x0, y: yb },
        { x: baseEndX, y: yb },
        { x: topX, y: topY }
      ],
      { color: 'spring', fill: true, alpha: 0.12, width: 2 }
    );
    // Suelo horizontal y pared vertical del triángulo.
    scene.line(Math.max(x0 - 1, w.left + 0.05), yb, Math.min(baseEndX + 1, w.right - 0.05), yb, { color: 'textDim', width: 2 });
    scene.polyline([{ x: baseEndX, y: yb }, { x: topX, y: topY }], { color: 'textDim', dash: [3, 4], alpha: 0.6 });

    // Ángulo en la base.
    scene.angleArc(x0, yb, 0, th, Math.min(2.2, L * 0.3), { color: 'energy', label: `${ang}°`, fill: true });

    // Uso de `dimension` para la base y la altura.
    scene.dimension(x0 - 0.6, yb, baseEndX - 0.6, yb, `L·cos ${ang}°`, { color: 'textDim' });
    scene.dimension(baseEndX + 0.35, yb, baseEndX + 0.35, topY, `h`, { color: 'textDim', labelSide: -1 });

    // Bloque sobre el plano.
    const bx = x0 + this.s * Math.cos(th);
    const by = yb + this.s * Math.sin(th);
    const blockSize = 1.0;
    const px = blockSize * Math.cos(th);
    const py = blockSize * Math.sin(th);
    scene.body(bx - px / 2, by + py / 2, {
      shape: 'rect',
      r: blockSize / 2,
      color: 'mass',
      label: `m₁ = ${m1} kg`,
      rotation: th,
      labelColor: 'mass'
    });

    // Fuerzas: peso (vertical), normal (perpendicular al plano) y W∥.
    const W = m1 * G;
    const N = this.normal();
    const Wp = this.WParallel();
    // Escala común de fuerzas: 0.028 u/N (se leen las direcciones sin salir del mundo).
    const k = 0.028;
    scene.vector(bx, by + 0.55, 0, -W * k, { color: 'force', label: `W = ${roundTo(W, 1)} N`, labelSide: -1 });
    scene.vector(bx + 1.1, by, -Math.sin(th) * N * k, Math.cos(th) * N * k, {
      color: 'mass2',
      label: `N = ${roundTo(N, 1)} N`,
      labelSide: 1
    });
    scene.vector(bx, by - 0.6, -Math.cos(th) * Wp * k, -Math.sin(th) * Wp * k, {
      color: 'energy',
      label: `W∥ = ${roundTo(Wp, 1)} N`,
      labelSide: 1
    });

    // Polea y contrapeso.
    if (polea) {
      const pulleyX = topX + 0.4;
      const pulleyY = topY + 0.4;
      scene.pulley(pulleyX, pulleyY, 0.5, { color: 'spring' });
      // Cuerda: del bloque a la polea y vertical hasta m₂, sin salir del mundo.
      const ropeEndY = Math.max(pulleyY - 4.5, w.bottom + 1.35);
      scene.line(bx, by + 0.2, pulleyX, pulleyY, { color: 'spring', width: 2 });
      scene.line(pulleyX, pulleyY, pulleyX, ropeEndY, { color: 'spring', width: 2 });
      scene.body(pulleyX, ropeEndY - 0.35, {
        shape: 'rect',
        r: 0.55,
        color: 'mass2',
        label: `m₂ = ${m2} kg`,
        labelColor: 'mass2'
      });
      scene.vector(pulleyX, ropeEndY, 0, -Math.min(m2 * G * 0.028, 0.85), {
        color: 'force',
        label: `W₂ = ${roundTo(m2 * G, 1)} N`,
        labelSide: -1
      });
    }

    // HUD: aceleración y estado.
    const a = this.acceleration();
    const hud = scene.hud;
    hud.chip(this.motionState(a), 'top-left');
    hud.readout(
      [
        { label: 'a', value: roundTo(a, 2), unit: 'm/s²' },
        { label: 'W∥', value: roundTo(Wp, 1), unit: 'N' },
        { label: 'N', value: roundTo(N, 1), unit: 'N' },
        { label: 'F_r,max', value: roundTo(this.frictionMax(), 1), unit: 'N' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const a = this.acceleration();
    const out = {
      a: { value: roundTo(a, 2), unit: 'm/s²' },
      s: { value: roundTo(this.s, 2), unit: 'm' },
      v: { value: roundTo(this.v, 2), unit: 'm/s' },
      'W∥': { value: roundTo(this.WParallel(), 1), unit: 'N' },
      N: { value: roundTo(this.normal(), 1), unit: 'N' },
      'F_r,max': { value: roundTo(this.frictionMax(), 1), unit: 'N' }
    };
    if (this.params.polea) {
      out['T (≈ W₂)'] = { value: roundTo(this.params.m2 * G, 1), unit: 'N' };
    }
    return out;
  }

  getState() {
    return { s: this.s, v: this.v, t: this.t, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.s)) this.s = s.s;
    if (Number.isFinite(s.v)) this.v = s.v;
    if (Number.isFinite(s.t)) this.t = s.t;
  }
}