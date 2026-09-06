/**
 * @fileoverview Fluidos — Arquímedes (flotación) y Bernoulli (tubo de
 * Venturi), tanda 5.2. Ejercita la primitiva `fill` de la escena.
 *
 * En el modo Arquímedes un cubo de densidad ρb y volumen V se suelta sobre un
 * líquido de densidad ρf. El empuje **se integra de verdad**: E = ρf·g·A·d con
 * `d` la profundidad realmente sumergida en cada instante, más un rozamiento
 * viscoso. Antes el dibujo colocaba el cubo con una fórmula de equilibrio que
 * no correspondía a la fracción sumergida (`−lado·(1−f) + 0.5`), de modo que
 * con volúmenes pequeños o densidades extremas el cubo aparecía flotando en
 * el aire por encima de la superficie. Ahora el bloque no puede salir del
 * líquido: sube hasta que el empuje iguala al peso y se posa en el fondo si
 * pesa más de lo que desplaza.
 *
 * El modo Bernoulli muestra un tubo de sección variable: por continuidad
 * A₁v₁ = A₂v₂, y por Bernoulli (horizontal) la presión baja donde la
 * velocidad sube. Se dibuja con dos tubos piezométricos —la lectura real de
 * un Venturi de laboratorio— cuya diferencia de altura es la caída de presión.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo, clamp } from '../utils/math-helpers.js';

const G = 9.8;
const P_ATM = 101325;

/* ---------- geometría del tanque de Arquímedes (unidades de mundo) ---------- */
/** Semiancho del tanque. */
const TANK_HALF = 4.0;
/** Centro horizontal del tanque (el resto del ancho lo ocupan las barras W/E). */
const TANK_CX = -2.6;
/** Fondo y borde del tanque. */
const TANK_BOTTOM = -4.4;
const TANK_TOP = 3.6;
/** Superficie del líquido en reposo. */
const LEVEL = 1.2;
/** Encuadre del modo Arquímedes / del modo Bernoulli. */
const VIEW_ARQ = { width: 15, height: 10 };
const VIEW_BER = { width: 19.5, height: 11 };
/** Eje del tubo de Venturi y semilongitud. */
const TUBE_Y = -1.6;
const TUBE_HALF = 8.6;
/** Metros de columna → unidades de mundo en los piezómetros. */
const PIEZO_K = 1.2;
/** Altura de la columna de referencia (entrada) en el piezómetro. */
const PIEZO_H1 = 4.3;

export default class Fluids extends SimModule {
  /** Encuadre por defecto = el del modo más ancho; `reset()` lo ajusta al modo. */
  static viewport = { width: VIEW_BER.width, height: VIEW_BER.height };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'arquimedes',
      options: [
        { value: 'arquimedes', label: 'Arquímedes (flotación)' },
        { value: 'bernoulli', label: 'Bernoulli (Venturi)' }
      ]
    },
    // `showIf`: cada deslizador se muestra sólo en el modo donde actúa. Antes
    // los siete salían siempre y cuatro de ellos no movían nada en pantalla.
    { id: 'rf', label: 'Densidad del líquido', latex: '\\rho_f', unit: 'kg/m³', min: 100, max: 2500, step: 50, value: 1000, showIf: { modo: 'arquimedes' } },
    { id: 'rb', label: 'Densidad del cuerpo', latex: '\\rho_b', unit: 'kg/m³', min: 100, max: 9000, step: 50, value: 800, showIf: { modo: 'arquimedes' } },
    { id: 'V', label: 'Volumen del cubo', latex: 'V', unit: 'm³', min: 0.05, max: 2, step: 0.05, value: 1, showIf: { modo: 'arquimedes' } },
    { id: 'rho', label: 'Densidad del fluido', latex: '\\rho', unit: 'kg/m³', min: 100, max: 2000, step: 50, value: 1000, showIf: { modo: 'bernoulli' } },
    { id: 'A1', label: 'Sección ancha', latex: 'A_1', unit: 'cm²', min: 2, max: 50, step: 1, value: 20, showIf: { modo: 'bernoulli' } },
    { id: 'A2', label: 'Sección estrecha', latex: 'A_2', unit: 'cm²', min: 0.5, max: 25, step: 0.5, value: 8, showIf: { modo: 'bernoulli' } },
    { id: 'v1', label: 'Velocidad entrada', latex: 'v_1', unit: 'm/s', min: 0.5, max: 10, step: 0.5, value: 2, showIf: { modo: 'bernoulli' } }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'arquimedes',
      rf: 1000,
      rb: 800,
      V: 1,
      rho: 1000,
      A1: 20,
      A2: 8,
      v1: 2
    };
    this.t = 0;
    /** Altura del centro del cubo en modo Arquímedes (u de mundo = m). */
    this.y = 0;
    /** Velocidad vertical del cubo (m/s). */
    this.vy = 0;
    /** Barras W vs E reutilizadas por frame (sin allocar en `draw`). */
    this._bars = [
      { label: 'W', value: 0, color: 'force' },
      { label: 'E', value: 0, color: 'field' }
    ];
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: 'Fluidos',
      blurb: 'Principio de Arquímedes y ecuación de Bernoulli con tubo de Venturi.',
      story:
        'Arquímedes descubrió el empuje bañándose: el fluido desplazado empuja al cuerpo hacia arriba con fuerza igual al peso del volumen desplazado. Dos siglos después, Bernoulli convirtió ese mismo pensamiento en la primera ecuación que unía presión y velocidad: donde el tubo se estrecha, la velocidad sube y la presión baja. Las dos caras del mismo libro: estática y dinámica de fluidos.',
      cases: [
        'Cuerpo menos denso que el líquido: flota con fracción ρb/ρf sumergida.',
        'Cuerpo más denso: se hunde con a = g·(1 − ρf/ρb).',
        'Estrechar el Venturi: v₂ sube y P₂ baja (el teorema explica el ala de avión).',
        'El caudal Q = A·v se conserva a lo largo del tubo.'
      ]
    });
    this.setModuleFormulas({
      title: 'Fluidos',
      items: [
        {
          name: 'Empuje de Arquímedes',
          formula: 'E = \\rho_f \\cdot g \\cdot V_{sumergido}',
          note: 'Igual al peso del volumen de fluido desplazado.'
        },
        {
          name: 'Fracción sumergida',
          formula: 'f = \\rho_b / \\rho_f',
          note: 'Si f ≤ 1 flota; si f > 1 se hunde.'
        },
        {
          name: 'Continuidad',
          formula: 'Q = A_1 v_1 = A_2 v_2',
          note: 'El caudal volumétrico se conserva en un tubo rígido.'
        },
        {
          name: 'Bernoulli (horizontal)',
          formula: 'P_1 + \\tfrac{1}{2}\\rho v_1^2 = P_2 + \\tfrac{1}{2}\\rho v_2^2',
          note: 'Para el tubo horizontal: ΔP = ½ρ(v₁² − v₂²).'
        }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.y = this._equilibriumY();
    this.vy = 0;
    const v = this.params.modo === 'bernoulli' ? VIEW_BER : VIEW_ARQ;
    this.frameWorld(v.width, v.height);
    this.engine?.reset?.();
  }

  /** Lado del cubo (m³ → m; cubo perfecto). */
  side() {
    return this.params.V ** (1 / 3);
  }

  /** Profundidad realmente sumergida del cubo, en metros (0 … lado). */
  submergedDepth(y = this.y) {
    const side = this.side();
    return clamp(LEVEL - (y - side / 2), 0, side);
  }

  /** Fracción del cubo bajo la superficie ahora mismo (0 … 1). */
  submergedNow() {
    return this.submergedDepth() / this.side();
  }

  weight() {
    return this.params.rb * this.params.V * G;
  }

  /**
   * Empuje instantáneo: ρf·g·(área de la base × profundidad sumergida). Es la
   * misma ley de Arquímedes, pero evaluada en la posición real del cubo, no en
   * la de equilibrio: por eso el bloque puede oscilar y no puede quedar
   * suspendido en el aire.
   */
  buoyant() {
    const side = this.side();
    return this.params.rf * G * side * side * this.submergedDepth();
  }

  /** Fracción sumergida de equilibrio, ρb/ρf (1 si se hunde). */
  _submergedFraction() {
    const { rf, rb } = this.params;
    return rb <= rf ? rb / rf : 1;
  }

  /**
   * Aceleración vertical teórica del cuerpo totalmente sumergido:
   * a = g·(1 − ρf/ρb) — positiva hacia abajo cuando se hunde. Es el número que
   * pide el libro; la integración usa la fuerza neta instantánea.
   */
  acceleration() {
    const { rf, rb } = this.params;
    if (rb <= rf) return 0; // flota: acaba en equilibrio
    return G * (1 - rf / rb);
  }

  /** Aceleración neta ahora mismo (empuje − peso − rozamiento), + hacia arriba. */
  netAcceleration() {
    const m = this.params.rb * this.params.V;
    const drag = 6 * this.submergedNow() * this.vy; // viscosidad del líquido
    return (this.buoyant() - this.weight()) / m - drag;
  }

  /** Altura del centro del cubo en equilibrio de flotación (fracción ρb/ρf). */
  _equilibriumY() {
    const side = this.side();
    // El cubo flota con `f·lado` bajo la superficie: su centro queda en
    // LEVEL + lado·(1/2 − f). Con f = 1 (se hunde) el cubo arranca justo
    // enrasado con la superficie y desde ahí cae.
    const y = LEVEL + side * (0.5 - this._submergedFraction());
    return Math.max(TANK_BOTTOM + side / 2, y);
  }

  /* ---------- modo Bernoulli ---------- */

  velocity2() {
    return (this.params.A1 * this.params.v1) / this.params.A2;
  }

  flowRate() {
    return this.params.A1 * 1e-4 * this.params.v1; // cm² → m²
  }

  pressure2() {
    const { rho, v1 } = this.params;
    const v2 = this.velocity2();
    return P_ATM + 0.5 * rho * (v1 * v1 - v2 * v2);
  }

  update(dt) {
    this.t += dt;
    if (this.params.modo !== 'arquimedes') return;
    // Integración semi-implícita del balance E − W − rozamiento. Con el empuje
    // evaluado en la profundidad real, un cuerpo ligero sube hasta enrasar su
    // fracción ρb/ρf y se queda ahí: no hay forma de que salga despedido.
    this.vy += this.netAcceleration() * dt;
    this.y += this.vy * dt;

    const side = this.side();
    const floor = TANK_BOTTOM + side / 2;
    if (this.y <= floor) {
      // Reposa en el fondo: el fondo aporta la normal que falta.
      this.y = floor;
      if (this.vy < 0) this.vy = 0;
    }
    // Techo del tanque: ningún cuerpo puede saltar fuera del recipiente.
    const ceil = TANK_TOP - side / 2;
    if (this.y >= ceil) {
      this.y = ceil;
      if (this.vy > 0) this.vy = 0;
    }
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    if (this.params.modo === 'bernoulli') {
      this._drawBernoulli(scene);
      return;
    }
    this._drawArchimedes(scene);
  }

  _drawArchimedes(scene) {
    const { rf, rb } = this.params;
    const side = this.side();
    const cx = TANK_CX;
    const tx = TANK_HALF;
    const d = this.submergedDepth();
    const fracNow = d / side;
    const cy = this.y;
    const floating = rb <= rf;
    const resting = cy <= TANK_BOTTOM + side / 2 + 1e-3;

    // Paredes del tanque (con rayado bajo el fondo: es un recipiente apoyado).
    scene.line(cx - tx, TANK_TOP, cx - tx, TANK_BOTTOM, { color: 'textDim', width: 3 });
    scene.line(cx + tx, TANK_TOP, cx + tx, TANK_BOTTOM, { color: 'textDim', width: 3 });
    scene.line(cx - tx, TANK_BOTTOM, cx + tx, TANK_BOTTOM, { color: 'textDim', width: 3 });
    scene.hatch(cx - tx, TANK_BOTTOM, cx + tx, TANK_BOTTOM, { side: -1, color: 'textDim' });

    // Líquido con superficie ondulada + textura de medio continuo.
    scene.fill(cx, LEVEL, tx * 2 - 0.12, LEVEL - TANK_BOTTOM, { color: 'field', alpha: 0.3, waves: true });
    scene.fluidPattern(cx - tx * 0.55, (LEVEL + TANK_BOTTOM) / 2, 1.5, { color: 'field', alpha: 0.25 });
    scene.fluidPattern(cx + tx * 0.55, (LEVEL + TANK_BOTTOM) / 2 - 0.6, 1.2, { color: 'field', alpha: 0.25 });
    scene.label(cx - tx + 0.25, LEVEL + 0.45, `Líquido ρf = ${rf} kg/m³`, {
      color: 'field', align: 'left', avoid: true
    });
    // Línea de flotación: referencia de toda la lectura.
    scene.line(cx - tx, LEVEL, cx + tx, LEVEL, { color: 'field', width: 1.6, dash: [6, 4], alpha: 0.85 });

    // Cubo. La parte hundida se sombrea: la fracción sumergida se *ve*.
    scene.body(cx, cy, {
      shape: 'rect',
      r: side / 2,
      color: floating ? 'energy' : 'mass',
      label: `Cubo ρb = ${rb} kg/m³`,
      labelColor: floating ? 'energy' : 'mass'
    });
    if (d > 0.01) {
      scene.rect(cx, cy - side / 2 + d / 2, side, d, {
        color: 'field', fill: 'field', alpha: 0.45, width: 1
      });
      scene.dimension(cx - side / 2 - 0.55, cy - side / 2, cx - side / 2 - 0.55, cy - side / 2 + d,
        `${Math.round(fracNow * 100)} % sumergido`, { color: 'field' });
    }

    // Vectores W (abajo) y E (arriba) desde las caras del cubo.
    const W = this.weight();
    const E = this.buoyant();
    const vlen = (F) => Math.min(2.6, Math.max(0.55, F * 4e-4));
    scene.vector(cx, cy - side / 2 - 0.12, 0, -vlen(W), {
      color: 'force', label: `W = ${roundTo(W, 1)} N`, labelSide: -1
    });
    if (E > 0.01) {
      scene.vector(cx, cy + side / 2 + 0.12, 0, vlen(E), {
        color: 'field', label: `E = ${roundTo(E, 1)} N`, labelSide: 1
      });
    }
    if (resting && !floating) {
      // Normal del fondo: el cuerpo hundido no está en caída libre.
      scene.vector(cx + side / 2 + 0.35, TANK_BOTTOM, 0, Math.min(2.2, vlen(W - E)), {
        color: 'mass2', label: 'N (fondo)', labelSide: 1
      });
    }

    // Balanza visual W frente a E: la comparación es el corazón del principio.
    this._bars[0].value = W;
    this._bars[1].value = E;
    scene.bars(cx + tx + 2.5, TANK_BOTTOM, this._bars, {
      max: Math.max(W, E, 1),
      hMax: 5.4,
      barW: 0.9,
      gap: 1.1,
      frame: true
    });
    scene.label(cx + tx + 3.5, TANK_BOTTOM - 0.55, floating ? 'E = W · equilibrio' : 'W > E · se hunde', {
      color: floating ? 'field' : 'force', size: 11, baseline: 'top', avoid: true
    });

    const hud = scene.hud;
    hud.chip(floating ? 'Flota: E iguala a W' : `Se hunde · a = g·(1 − ρf/ρb) = ${roundTo(this.acceleration(), 2)} m/s²`, 'top-left');
    hud.chip(`ρb/ρf = ${roundTo(rb / rf, 2)}`, 'top-left');
    hud.readout(
      [
        { label: 'W', value: roundTo(W, 1), unit: 'N' },
        { label: 'E', value: roundTo(E, 1), unit: 'N' },
        { label: 'Sumergido', value: roundTo(fracNow * 100, 1), unit: '%' },
        { label: 'Teórico ρb/ρf', value: roundTo(this._submergedFraction() * 100, 1), unit: '%' },
        { label: 'v', value: roundTo(this.vy, 2), unit: 'm/s' }
      ],
      'bottom-left'
    );
    hud.legend(
      [
        { color: 'force', label: 'Peso W' },
        { color: 'field', label: 'Empuje E = ρf·g·V_sum' }
      ],
      'top-right'
    );
  }

  _drawBernoulli(scene) {
    const { rho, A1, A2, v1 } = this.params;
    const v2 = this.velocity2();
    const cy = TUBE_Y;
    const half = TUBE_HALF;

    // Tubo de Venturi: paredes continuas (ancho ∝ √A) con el estrechamiento
    // unido por tramos cónicos, como el aparato real.
    const w1 = Math.min(2.1, Math.sqrt(A1) * 0.28);
    const w2 = Math.min(w1 - 0.12, Math.sqrt(A2) * 0.28);
    const neck = 2.2;
    const cone = 1.5;
    const profile = [
      { x: -half, w: w1 },
      { x: -neck - cone, w: w1 },
      { x: -neck, w: w2 },
      { x: neck, w: w2 },
      { x: neck + cone, w: w1 },
      { x: half, w: w1 }
    ];
    const top = [];
    const bot = [];
    for (const q of profile) {
      top.push({ x: q.x, y: cy + q.w });
      bot.push({ x: q.x, y: cy - q.w });
    }
    // Líquido dentro del tubo (polígono cerrado) y paredes por encima.
    scene.polygon([...top, ...bot.slice().reverse()], { fill: 'field', fillAlpha: 0.18, stroke: false });
    scene.polyline(top, { color: 'textDim', width: 3 });
    scene.polyline(bot, { color: 'textDim', width: 3 });

    // Líneas de corriente animadas: la densidad y la rapidez de los puntos
    // cambian con v, así que el estrechamiento «se ve» más rápido.
    for (const [x0, x1, w, v] of [
      [-half, -neck - cone, w1, v1],
      [-neck, neck, w2, v2],
      [neck + cone, half, w1, v1]
    ]) {
      for (const fy of [-0.5, 0, 0.5]) {
        scene.flow(x0, cy + fy * w * 1.1, x1, cy + fy * w * 1.1, {
          amps: v / 50, color: 'velocity', r: 0.09, t: this.t
        });
      }
    }
    // Vectores de velocidad en los dos tramos característicos.
    const kv = Math.min(0.9, 3.2 / Math.max(v1, v2));
    scene.vector(-neck - cone - 2.4, cy, v1 * kv, 0, {
      color: 'velocity', width: 2.6, label: `v₁ = ${roundTo(v1, 2)} m/s`, labelSide: 1
    });
    scene.vector(-0.6, cy, v2 * kv, 0, {
      color: 'velocity', width: 2.6, label: `v₂ = ${roundTo(v2, 2)} m/s`, labelSide: -1
    });
    scene.label(-half + 0.4, cy - w1 - 0.5, `A₁ = ${A1} cm²`, { color: 'textDim', align: 'left', avoid: true });
    scene.label(0, cy - w2 - 0.5, `A₂ = ${A2} cm²`, { color: 'textDim', avoid: true });

    // Piezómetros: dos tubos verticales abiertos. La altura de cada columna es
    // la presión estática; su diferencia, la caída de Bernoulli.
    const dP = 0.5 * rho * (v1 * v1 - v2 * v2); // P₂ − P₁ (negativo al estrechar)
    const dhM = Math.abs(dP) / (rho * G); // metros de columna
    const dh = Math.min(PIEZO_H1 - 0.4, dhM * PIEZO_K);
    const clipped = dhM * PIEZO_K > PIEZO_H1 - 0.4;
    const h2col = PIEZO_H1 - dh;
    const tubes = [
      { x: -neck - cone - 2.4, h: PIEZO_H1, w: w1, label: 'P₁' },
      { x: 0, h: h2col, w: w2, label: 'P₂' }
    ];
    for (const tb of tubes) {
      const base = cy + tb.w;
      scene.line(tb.x - 0.3, base, tb.x - 0.3, base + PIEZO_H1 + 0.6, { color: 'textDim', width: 2 });
      scene.line(tb.x + 0.3, base, tb.x + 0.3, base + PIEZO_H1 + 0.6, { color: 'textDim', width: 2 });
      scene.fill(tb.x, base + tb.h, 0.56, tb.h, { color: 'field', alpha: 0.5 });
      scene.label(tb.x, base + tb.h + 0.35, tb.label, { color: 'field', size: 11, avoid: true });
    }
    // Cota de la diferencia de altura entre las dos columnas.
    const yA = cy + w1 + PIEZO_H1;
    const yB = cy + w2 + h2col;
    scene.line(tubes[0].x + 0.3, yA, tubes[1].x - 0.3, yA, { color: 'force', width: 1, dash: [4, 4], alpha: 0.7 });
    scene.dimension(tubes[1].x + 0.75, yB, tubes[1].x + 0.75, yA,
      `Δh = ${clipped ? '>' : ''}${roundTo(dhM, 2)} m`, { color: 'force' });

    scene.label(half - 0.3, cy + w1 + 1.2, `ΔP = ${roundTo(dP / 1000, 1)} kPa`, {
      color: 'force', align: 'right', avoid: true
    });

    const hud = scene.hud;
    hud.chip('Venturi · al estrecharse sube v y baja P', 'top-left');
    hud.chip(`Q = A₁v₁ = A₂v₂ = ${roundTo(this.flowRate() * 1000, 2)} L/s`, 'top-left');
    const P2 = this.pressure2();
    hud.readout(
      [
        { label: 'Q', value: roundTo(this.flowRate() * 1000, 2), unit: 'L/s' },
        { label: 'v₁', value: roundTo(v1, 2), unit: 'm/s' },
        { label: 'v₂', value: roundTo(v2, 2), unit: 'm/s' },
        { label: 'P₂ − P₁', value: roundTo(dP / 1000, 1), unit: 'kPa' },
        { label: 'P₂ (abs.)', value: roundTo(P2 / 1000, 1), unit: 'kPa' }
      ],
      'bottom-left'
    );
    hud.legend(
      [
        { color: 'velocity', label: 'Velocidad del fluido' },
        { color: 'field', label: 'Columna piezométrica (presión)' },
        { color: 'force', label: 'Caída de presión Δh' }
      ],
      'top-right'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    if (this.params.modo === 'bernoulli') {
      const v2 = this.velocity2();
      const dP = 0.5 * this.params.rho * (this.params.v1 * this.params.v1 - v2 * v2);
      return {
        Q: { value: roundTo(this.flowRate(), 4), unit: 'm³/s' },
        'v₁': { value: roundTo(this.params.v1, 2), unit: 'm/s' },
        'v₂': { value: roundTo(v2, 2), unit: 'm/s' },
        'P₂ − P₁': { value: roundTo(dP / 1000, 2), unit: 'kPa' },
        'P₂': { value: roundTo(this.pressure2() / 1000, 2), unit: 'kPa' }
      };
    }
    const W = this.weight();
    const E = this.buoyant();
    const out = {
      W: { value: roundTo(W, 2), unit: 'N' },
      E: { value: roundTo(E, 2), unit: 'N' },
      'Fracción sumergida': { value: roundTo(this.submergedNow() * 100, 1), unit: '%' },
      'Teórica ρb/ρf': { value: roundTo(this._submergedFraction() * 100, 1), unit: '%' },
      'v del cubo': { value: roundTo(this.vy, 3), unit: 'm/s' },
      a: { value: roundTo(this.acceleration(), 3), unit: 'm/s²' }
    };
    if (this.params.rb > this.params.rf) {
      out['Estado'] = { value: 'Se hunde', unit: '' };
    } else {
      out['Estado'] = { value: 'Flota', unit: '' };
    }
    return out;
  }

  getState() {
    return { t: this.t, y: this.y, vy: this.vy, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.y)) this.y = s.y;
    if (Number.isFinite(s.vy)) this.vy = s.vy;
  }
}
