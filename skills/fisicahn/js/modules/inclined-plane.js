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

const G = 9.8;
const DEG = Math.PI / 180;
const L = 8; // longitud del plano (m)
/** Margen alrededor del mecanismo al reencuadrar (fracción). */
const FRAME_PAD = 1.14;

export default class InclinedPlane extends SimModule {
  /** Encuadre de partida; `reset()` lo ajusta al triángulo del ángulo actual. */
  static viewport = { width: 14, height: 11 };

  // Sin `static anchor`: el triángulo cambia de tamaño con θ, así que lo que se
  // mantiene fijo es el **centro del mecanismo** (ver `layout()`), no un vértice.

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
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
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
    this.setModuleFormulas({
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
    this.clearChallenges();
  }

  reset() {
    this.s = 0;
    this.v = 0;
    this.t = 0;
    const box = this.layout();
    this.frameWorld(box.w * FRAME_PAD, box.h * FRAME_PAD);
    this.engine?.reset?.();
  }

  /**
   * Encuadre del mecanismo para el ángulo actual.
   *
   * El módulo dibujaba anclado a `w.left`/`w.bottom` — la esquina inferior
   * izquierda del lienzo —, así que el triángulo se iba a una esquina y dejaba
   * media pantalla vacía. Aquí se calcula la caja del conjunto (triángulo +
   * polea + contrapeso + cotas) y se centra en el origen, de modo que el mismo
   * dibujo llena el encuadre a 5° y a 60°.
   *
   * @returns {{x0:number, yb:number, w:number, h:number, base:number, alto:number}}
   */
  layout() {
    const th = this.params.ang * DEG;
    const base = L * Math.cos(th);
    const alto = L * Math.sin(th);
    // Caja en coordenadas locales con el vértice de la base en (0, 0).
    const left = -2.0; // cota de la base y arco del ángulo
    const right = base + 2.1; // cara vertical, polea, contrapeso y cota h
    const bottom = -2.0; // suelo con rayado, cota de la base y flecha del peso
    const top = alto + 3.4; // vértice, polea, contrapeso y flechas de fuerza
    const w = right - left;
    const h = top - bottom;
    return {
      x0: -(left + right) / 2,
      yb: -(bottom + top) / 2,
      w,
      h,
      base,
      alto
    };
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

  /**
   * Fricción real ejercida ahora (+ hacia la cima del plano).
   *
   * En reposo es la estática, que sólo iguala a la fuerza que intenta mover el
   * bloque; en movimiento es la cinética completa, opuesta a la velocidad. Es
   * lo que dibuja el vector F_r: un rozamiento que se ve crecer con μ y con N.
   * @param {number} [a] - Aceleración ya calculada, para no repetirla.
   */
  frictionActual(a = this.acceleration()) {
    const fMax = this.frictionMax();
    const moving = Math.abs(this.v) > 0.01;
    if (moving) return this.v > 0 ? -fMax : fMax;
    // En reposo: equilibra la fuerza motriz hasta el tope estático.
    const drive = this.params.polea ? this.params.m2 * G - this.WParallel() : -this.WParallel();
    if (Math.abs(a) < 1e-9) return Math.max(-fMax, Math.min(fMax, -drive));
    return drive > 0 ? -fMax : fMax;
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
    const box = this.layout();
    const x0 = box.x0;
    const yb = box.yb;
    const baseEndX = x0 + box.base;
    const topX = baseEndX;
    const topY = yb + box.alto;

    // Triángulo del plano (polígonos: el plano y la masa de apoyo).
    scene.polygon(
      [
        { x: x0, y: yb },
        { x: baseEndX, y: yb },
        { x: topX, y: topY }
      ],
      { color: 'spring', fill: 'spring', fillAlpha: 0.16, width: 2 }
    );
    // Suelo horizontal (con rayado de apoyo) y cara vertical del triángulo.
    scene.ground(x0 - 1.2, baseEndX, yb, { width: 2 });
    scene.polyline([{ x: baseEndX, y: yb }, { x: topX, y: topY }], { color: 'textDim', dash: [3, 4], alpha: 0.6 });

    // Ángulo en la base.
    scene.angleArc(x0, yb, 0, th, Math.min(2.0, L * 0.28), { color: 'energy', label: `${ang}°`, fill: true });

    // Cotas de la base y la altura.
    scene.dimension(x0, yb - 0.85, baseEndX, yb - 0.85, `L·cos ${ang}° = ${roundTo(box.base, 2)} m`, { color: 'textDim' });
    if (box.alto > 0.4) {
      // La cota de altura va por dentro del triángulo: fuera chocaba con la
      // cuerda vertical del contrapeso.
      scene.dimension(baseEndX - 0.45, yb, baseEndX - 0.45, topY, `h = ${roundTo(box.alto, 2)} m`, { color: 'textDim' });
    }

    // Bloque sobre el plano.
    const bx = x0 + this.s * Math.cos(th);
    const by = yb + this.s * Math.sin(th);
    const blockSize = 1.0;
    // Centro del bloque = punto del plano + medio lado en la dirección NORMAL.
    // Antes se desplazaba (−cos θ, sen θ)·lado/2, que no es la normal: el
    // bloque flotaba junto al plano en vez de apoyarse en él.
    const px = blockSize * Math.sin(th);
    const py = blockSize * Math.cos(th);
    scene.body(bx - px / 2, by + py / 2, {
      shape: 'rect',
      r: blockSize / 2,
      color: 'mass',
      label: `m₁ = ${m1} kg`,
      rotation: th,
      labelColor: 'mass'
    });

    // Fuerzas: peso (vertical), normal (perpendicular al plano), W∥ y fricción.
    const W = m1 * G;
    const N = this.normal();
    const Wp = this.WParallel();
    const a = this.acceleration();
    // Escala común de fuerzas: se ajusta al mayor módulo para no salir del encuadre.
    const k = Math.min(0.035, 2.1 / Math.max(W, N, 1));
    const cbx = bx - px / 2;
    const cby = by + py / 2;
    scene.vector(cbx, cby, 0, -W * k, { color: 'force', label: `W = ${roundTo(W, 1)} N`, labelSide: -1, avoidLabel: true });
    scene.vector(cbx, cby, -Math.sin(th) * N * k, Math.cos(th) * N * k, {
      color: 'mass2',
      label: `N = ${roundTo(N, 1)} N`,
      labelSide: 1,
      avoidLabel: true
    });
    scene.vector(cbx, cby, -Math.cos(th) * Wp * k, -Math.sin(th) * Wp * k, {
      color: 'energy',
      label: `W∥ = ${roundTo(Wp, 1)} N`,
      labelSide: 1,
      avoidLabel: true
    });
    // Fricción: se opone al movimiento (o a la tendencia si está en reposo).
    const Fr = this.frictionActual(a);
    if (Math.abs(Fr) > 0.05) {
      const dir = Math.sign(Fr);
      scene.vector(bx, by, dir * Math.cos(th) * Math.abs(Fr) * k, dir * Math.sin(th) * Math.abs(Fr) * k, {
        color: 'warn',
        width: 2.4,
        label: `F_r = ${roundTo(Math.abs(Fr), 1)} N`,
        labelSide: -1,
        avoidLabel: true
      });
    }

    // Polea y contrapeso: al subir el bloque, m₂ baja (la cuerda es inextensible).
    if (polea) {
      const pulleyX = topX + 0.55;
      const pulleyY = topY + 0.45;
      scene.pulley(pulleyX, pulleyY, 0.45, { color: 'spring' });
      const span = Math.max(0.9, pulleyY - (yb - 0.9));
      const drop = 1.0 + (this.s / L) * (span - 1.6);
      const ropeEndY = pulleyY - drop;
      scene.line(bx, by + 0.2, pulleyX, pulleyY, { color: 'spring', width: 2 });
      scene.line(pulleyX, pulleyY, pulleyX, ropeEndY, { color: 'spring', width: 2 });
      scene.body(pulleyX, ropeEndY - 0.4, {
        shape: 'rect',
        r: 0.4,
        color: 'mass2',
        label: `m₂ = ${m2} kg`,
        labelColor: 'mass2'
      });
      scene.vector(pulleyX, ropeEndY - 0.8, 0, -Math.min(m2 * G * k, 1.1), {
        color: 'force',
        label: `W₂ = ${roundTo(m2 * G, 1)} N`,
        labelSide: -1,
        avoidLabel: true
      });
    }

    // HUD.
    const hud = scene.hud;
    hud.chip(this.motionState(a), 'top-left');
    hud.chip(`μ = ${mu} · F_r,max = ${roundTo(this.frictionMax(), 1)} N`, 'top-left');
    hud.readout(
      [
        { label: 'a', value: roundTo(a, 2), unit: 'm/s²' },
        { label: 's', value: roundTo(this.s, 2), unit: 'm' },
        { label: 'W∥', value: roundTo(Wp, 1), unit: 'N' },
        { label: 'N', value: roundTo(N, 1), unit: 'N' },
        { label: 'F_r,max', value: roundTo(this.frictionMax(), 1), unit: 'N' }
      ],
      'bottom-left'
    );
    hud.legend(
      [
        { color: 'force', label: 'Peso W' },
        { color: 'mass2', label: 'Normal N' },
        { color: 'energy', label: 'Componente W∥' },
        { color: 'warn', label: 'Fricción F_r' }
      ],
      'top-right'
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