/**
 * @fileoverview Fluidos — Arquímedes (flotación) y Bernoulli (tubo de
 * Venturi), tanda 5.2. Ejercita la primitiva `fill` de la escena.
 *
 * En el modo Arquímedes un cubo de densidad ρb y volumen V se suelta sobre un
 * líquido de densidad ρf: flota con fracción ρb/ρf sumergida o se hunde con
 * aceleración g·(1 − ρf/ρb). El módulo dibuja el tanque con su superficie
 * ondulada, el cubo en equilibrio (o cayendo), y los vectores W y empuje.
 *
 * El modo Bernoulli muestra un tubo de sección variable: por continuidad
 * A₁v₁ = A₂v₂, y por Bernoulli (horizontal) la presión baja donde la
 * velocidad sube. El módulo dibuja el Venturi con flechas de velocidad
 * proporcionales y el manómetro de la diferencia de presión.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const G = 9.8;
const P_ATM = 101325;

export default class Fluids extends SimModule {
  static viewport = { width: 24, height: 16 };

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
    { id: 'rf', label: 'Densidad del líquido', latex: '\\rho_f', unit: 'kg/m³', min: 100, max: 2500, step: 50, value: 1000 },
    { id: 'rb', label: 'Densidad del cuerpo', latex: '\\rho_b', unit: 'kg/m³', min: 100, max: 9000, step: 50, value: 800 },
    { id: 'V', label: 'Volumen del cubo', latex: 'V', unit: 'm³', min: 0.05, max: 2, step: 0.05, value: 1 },
    { id: 'rho', label: 'Densidad del fluido', latex: '\\rho', unit: 'kg/m³', min: 100, max: 2000, step: 50, value: 1000 },
    { id: 'A1', label: 'Sección ancha', latex: 'A_1', unit: 'cm²', min: 2, max: 50, step: 1, value: 20 },
    { id: 'A2', label: 'Sección estrecha', latex: 'A_2', unit: 'cm²', min: 0.5, max: 25, step: 0.5, value: 8 },
    { id: 'v1', label: 'Velocidad entrada', latex: 'v_1', unit: 'm/s', min: 0.5, max: 10, step: 0.5, value: 2 }
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
    /** Posición vertical del cubo en modo arquimedes (mitad del cubo, m). */
    this.y = 0;
    this.vy = 0;
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
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
    setModuleFormulas(this.ui, {
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
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.y = this._equilibriumY();
    this.vy = 0;
    this.engine?.reset?.();
  }

  weight() {
    return this.params.rb * this.params.V * G;
  }

  /** Empuje con la fracción sumergida actual (0..1). */
  buoyant() {
    return this.params.rf * G * this.params.V * this._submergedFraction();
  }

  _submergedFraction() {
    const { rf, rb } = this.params;
    if (rb <= rf) return rb / rf; // flota: el nivel de equilibrio es estático
    return 1; // se hunde: totalmente sumergido
  }

  /** Aceleración vertical del cubo (negativa = se hunde). */
  acceleration() {
    const { rf, rb } = this.params;
    if (rb <= rf) return 0; // en equilibrio de flotación
    return G * (1 - rf / rb);
  }

  /** Altura (y) de la mitad del cubo en equilibrio de flotación. */
  _equilibriumY() {
    return -(this.params.V ** (1 / 3)) * (1 - this._submergedFraction()) + 0.5;
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
    const { rb, rf } = this.params;
    if (rb > rf) {
      // Se hunde hasta el fondo del tanque.
      this.vy += this.acceleration() * dt;
      this.y += this.vy * dt;
      if (this.y < -2.2) {
        this.y = -2.2;
        this.vy = 0;
      }
    } else {
      // Flota: oscila ligeramente alrededor del equilibrio (boya).
      this.y += (this._equilibriumY() - this.y) * Math.min(1, dt * 3);
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
    const { rf, rb, V } = this.params;
    const side = V ** (1 / 3); // lado del cubo (m³ → m, cubo perfecto)
    const cx = 0; // centro del tanque en coordenadas de mundo
    const tx = 5.5; // mitad del ancho del tanque
    const tankTop = 1.6;
    const tankBottom = -2.6;
    const level = 0.4; // superficie del agua

    // Paredes del tanque.
    scene.rect(cx, (tankTop + tankBottom) / 2, tx * 2, tankTop - tankBottom, {
      color: 'textDim',
      width: 2,
      fill: 'transparent'
    });
    // Líquido: primitiva fill (tanda 5.2) con superficie ondulada.
    scene.fill(cx, level, tx * 2 - 0.3, level - tankBottom + 0.15, {
      color: 'field',
      alpha: 0.3,
      waves: true
    });
    scene.label(cx, level + 0.5, `Líquido ρf = ${rf} kg/m³`, { avoid: true, color: 'field' });

    // Cubo en su posición (equilibrio o cayendo).
    const cy = this.y;
    scene.body(cx, cy, {
      shape: 'rect',
      r: side / 2,
      color: rb <= rf ? 'energy' : 'mass',
      label: `Cubo ρb = ${rb} kg/m³`,
      labelColor: rb <= rf ? 'energy' : 'mass'
    });
    // Línea de flotación sobre el cubo cuando flota.
    if (rb <= rf) {
      scene.line(cx - side / 2, level, cx + side / 2, level, { color: 'field', width: 2 });
    }

    // Vectores W (abajo) y E (arriba) desde el centro del cubo.
    const W = this.weight();
    const E = this.buoyant();
    // Longitud acotada (0.6..3.2 u de mundo) para cualquier par de densidades.
    const vlen = (F) => Math.min(3.2, Math.max(0.6, F * 4e-4));
    scene.vector(cx, cy - side / 2 - 0.15, 0, -vlen(W), { color: 'force', label: `W = ${roundTo(W, 1)} N`, labelSide: -1 });
    if (E > 0.01) {
      scene.vector(cx, cy + side / 2 + 0.15, 0, vlen(E), { color: 'field', label: `E = ${roundTo(E, 1)} N`, labelSide: 1 });
    }

    const hud = scene.hud;
    const floating = rb <= rf;
    hud.chip(floating ? 'Flota (equilibrio estático)' : 'Se hunde (a = g·(1 − ρf/ρb))', 'top-left');
    const frac = this._submergedFraction();
    const rows = [
      { label: 'W', value: roundTo(W, 1), unit: 'N' },
      { label: 'E', value: roundTo(E, 1), unit: 'N' },
      { label: 'Fracción sumergida', value: roundTo(frac * 100, 1), unit: '%' },
      { label: 'a', value: roundTo(this.acceleration(), 2), unit: 'm/s²' }
    ];
    hud.readout(rows, 'bottom-left');
  }

  _drawBernoulli(scene) {
    const { rho, A1, A2, v1 } = this.params;
    const v2 = this.velocity2();
    const cx = 0; // centro del tubo en coordenadas de mundo
    const cy = 0;
    const half = 9;

    // Tubo de Venturi: rectángulos de pared (ancho proporcional a la sección).
    const w1 = Math.sqrt(A1) * 0.28; // escala visual: lado ∝ √A
    const w2 = Math.sqrt(A2) * 0.28;
    const neckHalf = 2.2; // longitud del estrechamiento
    // Tramos: ancho → estrecho → ancho.
    const seg = [
      { x0: cx - half, x1: cx - neckHalf, w: w1 },
      { x0: cx - neckHalf, x1: cx + neckHalf, w: w2 },
      { x0: cx + neckHalf, x1: cx + half, w: w1 }
    ];
    for (const s of seg) {
      scene.rect((s.x0 + s.x1) / 2, cy, s.x1 - s.x0, s.w * 2, { color: 'textDim', width: 2 });
    }
    scene.label(cx - half + 0.6, cy - w1 - 0.5, `A₁ = ${A1} cm²`, { avoid: true, color: 'textDim' });
    scene.label(cx, cy - w2 - 0.5, `A₂ = ${A2} cm²`, { avoid: true, color: 'textDim' });

    // Flechas de velocidad: más largas donde el tubo es más estrecho.
    const kv = 0.9;
    for (const s of seg) {
      const v = s.w >= w2 + 0.001 ? v1 : v2;
      const steps = Math.max(2, Math.floor((s.x1 - s.x0) / 2.2));
      for (let i = 0; i <= steps; i++) {
        const x = s.x0 + ((s.x1 - s.x0) * i) / steps;
        scene.vector(x, cy, v * kv, 0, { color: 'velocity', width: 2.2, alpha: 0.85 });
      }
    }

    // Manómetro: P₂ relativa a la atmosférica (columna de fluido).
    const dP = 0.5 * rho * (v1 * v1 - v2 * v2); // Pa
    const colH = Math.min(2.4, Math.abs(dP) / (rho * G));
    const gaugeX = cx + half + 1.2;
    scene.line(gaugeX - 0.5, cy - 3, gaugeX - 0.5, cy + 3, { color: 'textDim', width: 2 });
    scene.line(gaugeX + 0.5, cy - 3, gaugeX + 0.5, cy + 3, { color: 'textDim', width: 2 });
    scene.rect(gaugeX, cy + 3 - colH / 2, 0.7, colH, {
      color: 'field',
      fill: 'field',
      alpha: 0.8
    });
    scene.label(gaugeX, cy + 3.6, `ΔP = ${roundTo(dP / 1000, 1)} kPa`, { avoid: true, color: 'field' });

    const hud = scene.hud;
    hud.chip('Continuidad y Bernoulli en el tubo de Venturi', 'top-left');
    const P2 = this.pressure2();
    hud.readout(
      [
        { label: 'Q', value: roundTo(this.flowRate(), 3), unit: 'm³/s' },
        { label: 'v₁', value: roundTo(v1, 2), unit: 'm/s' },
        { label: 'v₂', value: roundTo(v2, 2), unit: 'm/s' },
        { label: 'P₂ − P₁', value: roundTo(dP / 1000, 1), unit: 'kPa' },
        { label: 'P₂ (abs.)', value: roundTo(P2 / 1000, 1), unit: 'kPa' }
      ],
      'bottom-left'
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
      'Fracción sumergida': { value: roundTo(this._submergedFraction() * 100, 1), unit: '%' },
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
