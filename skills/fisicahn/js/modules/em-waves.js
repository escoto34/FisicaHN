/**
 * @fileoverview Ondas electromagnéticas: onda plana y polarización (tanda 5.4).
 *
 * Modo `plana`: E ⊥ B ⊥ propagación, c = f·λ, con los campos dibujados como
 * polilíneas en fases y un vector de Poynting.
 *
 * Modo `polarizacion`: luz polarizada vertical (I₁) atraviesa un segundo
 * polarizador girado θ; la componente que pasa vale E·cosθ y la intensidad
 * sigue la ley de Malus I = I₁·cos²θ. Se dibuja la curva cos²θ con el punto
 * actual marcado: a 45° cae a la mitad, a 90° se apaga.
 *
 * Ejercita `polyline`, `vector`, `line`, `label`, `chip`, `plot`, `readout`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';

export default class EMWaves extends SimModule {
  static viewport = { width: 24, height: 15 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'plana',
      options: [
        { value: 'plana', label: 'Onda plana (E·B)' },
        { value: 'polarizacion', label: 'Polarización y ley de Malus' }
      ]
    },
    { id: 'f', label: 'Frecuencia', latex: 'f', unit: 'Hz', min: 0.15, max: 1.2, step: 0.02, value: 0.4 },
    { id: 'c', label: 'Velocidad', latex: 'c', unit: 'u/s', min: 1, max: 6, step: 0.1, value: 3 },
    { id: 'ampE', label: 'Amplitud E', latex: 'E_0', unit: '', min: 0.3, max: 3, step: 0.1, value: 1.5 },
    { id: 'ampB', label: 'Amplitud B', latex: 'B_0', unit: '', min: 0.3, max: 2.5, step: 0.1, value: 1.2 },
    { id: 'theta', label: 'Ángulo del polarizador', latex: '\\theta', unit: '°', min: 0, max: 90, step: 1, value: 45 },
    { id: 'I1', label: 'Intensidad incidente', latex: 'I_1', unit: '%', min: 10, max: 100, step: 5, value: 100 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'plana',
      f: 0.4,
      c: 3,
      ampE: 1.5,
      ampB: 1.2,
      theta: 45,
      I1: 100
    };
    this.t = 0;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: 'Ondas electromagnéticas',
      blurb: 'E ⊥ B ⊥ propagación con c = f·λ, y polarización con la ley de Malus.',
      story:
        'Maxwell unificó electricidad y magnetismo: la luz es una onda EM donde E y B oscilan en fase y perpendiculares. Y una antena polarizada solo deja pasar la componente de E que coincide con su dirección: por eso dos gafas polarizadas giradas 90° se oscurecen. La del tercero es la ley de Malus: I = I₁·cos²θ, un coseno al cuadrado que a 45° divide la luz por dos y a 90° la apaga.',
      cases: [
        'Baja la frecuencia f: λ = c/f crece y la onda se estira.',
        'Plana: E va en y, B representado perpendicular, luz avanza por +x.',
        'Polarización: sube I₁ y la onda entre P₁ y P₂ crece (E ∝ √I); gira θ y la onda tras P₂ se inclina y se apaga como cos²θ.',
        'Malus a 45°: la intensidad cae a la mitad (cos²45° = 0.5).',
        'Malus a 90°: I = 0: dos polarizadores cruzados apagan la luz.'
      ]
    });
    this.setModuleFormulas({
      title: 'Ondas electromagnéticas',
      items: [
        { name: 'Velocidad', formula: 'c = f \\cdot \\lambda' },
        { name: 'Campos en la onda', formula: 'E = E_0 \\cos(kx - \\omega t)' },
        { name: 'Relación E–B', formula: '\\dfrac{E_0}{B_0} = c', note: 'En el vacío (SI).' },
        { name: 'Ley de Malus', formula: 'I = I_1 \\cos^2\\theta' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.engine?.reset?.();
  }

  update(dt) {
    this.t += dt;
  }

  lambda() {
    return this.params.c / Math.max(this.params.f, 0.05);
  }

  omega() {
    return 2 * Math.PI * this.params.f;
  }

  k() {
    return (2 * Math.PI) / this.lambda();
  }

  /** Intensidad después del segundo polarizador (ley de Malus, en %). */
  i2() {
    return this.params.I1 * Math.pow(Math.cos((this.params.theta * Math.PI) / 180), 2);
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    if (this.params.modo === 'polarizacion') this._drawPolarizacion(scene);
    else this._drawPlana(scene);
  }

  _drawPlana(scene) {
    const { ampE, ampB, c, f } = this.params;
    const k = this.k();
    const w = this.omega();
    const wt = w * this.t;
    scene.line(-7, 0, 7, 0, { color: 'textDim', width: 1.2 });
    // Ondas E y B muestreadas por la escena (sin arrays de puntos por frame).
    scene.curve((x) => ampE * Math.cos(k * x - wt), -6, 6, { samples: 120, color: 'force', width: 2.5 });
    scene.curve((x) => -3.4 + ampB * 0.55 * Math.cos(k * x - wt), -6, 6, { samples: 120, color: 'spring', width: 2.5 });

    // Vectores en una muestra de x.
    const x0 = 1.5;
    const Ey = ampE * Math.cos(k * x0 - w * this.t);
    const Bz = ampB * Math.cos(k * x0 - w * this.t);
    scene.vector(x0, 0, 0, Ey, { color: 'force', label: 'E' });
    scene.vector(x0, 0, Bz * 0.8, 0, { color: 'spring', label: 'B' });
    scene.vector(x0, 0, 1.2, 0, { color: 'energy', label: 'c' });

    scene.hud.chip(`c = f·λ → ${roundTo(c, 1)} = ${roundTo(f, 2)} × ${roundTo(this.lambda(), 2)}`, 'top-left');
    scene.hud.readout(
      [
        { label: 'f', value: roundTo(f, 2), unit: 'Hz' },
        { label: 'λ', value: roundTo(this.lambda(), 3), unit: 'm' },
        { label: 'c', value: roundTo(c, 1), unit: 'u/s' },
        { label: 'E₀/B₀', value: roundTo(ampE / ampB, 2), unit: '·' }
      ],
      'bottom-left'
    );
  }

  /**
   * Polarización y ley de Malus. Todo lo dibujado sale de los parámetros:
   *  - `I1` fija la amplitud de la onda entre polarizadores (E ∝ √I₁) y el
   *    brillo del haz;
   *  - `theta` gira el eje de P₂ (medido desde la vertical de P₁), inclina la
   *    onda transmitida y reduce su amplitud a E₁·cosθ (intensidad I₁·cos²θ);
   *  - `f` y `c` animan la onda viajera: λ = c/f y fase kx − ωt.
   * Los ángulos de los polarizadores y de la onda se miden todos desde la
   * vertical, así P₁ (0°) se ve vertical y P₂ a 90° queda cruzado.
   */
  _drawPolarizacion(scene) {
    const { theta, I1 } = this.params;
    const rad = (theta * Math.PI) / 180;
    const cosT = Math.cos(rad);
    const sinT = Math.sin(rad);
    const I2 = this.i2();
    const ratio = I1 > 0 ? I2 / I1 : 0; // cos²θ
    const k = this.k();
    const w = this.omega();
    // Amplitud de E ∝ √I₁: el dibujo refleja el parámetro de intensidad.
    const A1 = 1.7 * Math.sqrt(Math.max(I1, 0) / 100);
    const A2 = A1 * Math.abs(cosT);

    const xP1 = -4.5;
    const xP2 = 2.5;
    const xScreen = 9.5;

    // Eje del haz.
    scene.line(-10.5, 0, xScreen, 0, { color: 'textDim', width: 1.2, alpha: 0.6 });

    // Fuente de luz natural (no polarizada): vibra en todas direcciones.
    const xS = -9.2;
    scene.body(xS, 0, { shape: 'circle', r: 0.42, color: 'energy', glow: true });
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 6 + this.t * 0.6;
      scene.line(xS - Math.cos(a) * 0.95, -Math.sin(a) * 0.95, xS + Math.cos(a) * 0.95, Math.sin(a) * 0.95, {
        color: 'energy',
        width: 1.2,
        alpha: 0.7
      });
    }
    scene.label(xS, -1.6, 'luz natural', { color: 'textDim', size: 11, avoid: true });
    // Tramo no polarizado: trazos en direcciones aleatorias fijas.
    for (let x = xS + 1.2; x < xP1 - 0.5; x += 0.7) {
      const a = ((x * 7.3) % Math.PI) + this.t * 0.3;
      scene.line(x - Math.cos(a) * 0.35, -Math.sin(a) * 0.35, x + Math.cos(a) * 0.35, Math.sin(a) * 0.35, {
        color: 'energy',
        width: 1.3,
        alpha: 0.55
      });
    }

    // P₁ vertical.
    this._polarizer(scene, xP1, 0, 'mass', 0);
    scene.label(xP1, -2.3, 'P₁ (vertical)', { color: 'mass', size: 11, avoid: true });

    // Entre P₁ y P₂: onda viajera polarizada vertical, amplitud A₁ ∝ √I₁.
    const N = 48;
    const wt = w * this.t;
    scene.curve((x) => A1 * Math.cos(k * x - wt), xP1 + 0.25, xP2 - 0.25, { samples: N, color: 'force', width: 2.4 });
    // Envolvente ±A₁ (punteada) para que la amplitud se lea aunque la onda viaje.
    scene.line(xP1 + 0.25, A1, xP2 - 0.25, A1, { color: 'force', width: 1, dash: [3, 4], alpha: 0.5 });
    scene.line(xP1 + 0.25, -A1, xP2 - 0.25, -A1, { color: 'force', width: 1, dash: [3, 4], alpha: 0.5 });
    scene.label((xP1 + xP2) / 2, A1 + 0.35, `I₁ = ${roundTo(I1, 0)} % · E₁ ∝ √I₁`, { color: 'force', size: 11, avoid: true });

    // P₂ girado θ respecto a P₁.
    this._polarizer(scene, xP2, 0, 'spring', theta);
    scene.label(xP2, -2.3, `P₂ a θ = ${theta}°`, { color: 'spring', size: 11, avoid: true });
    if (theta > 0) {
      scene.angleArc(xP2, 0, Math.PI / 2 - rad, Math.PI / 2, 1.05, { color: 'energy', label: `θ = ${theta}°` });
    }

    // Descomposición de E₁ en el plano de P₂ (vista frontal, a la derecha de
    // P₂): la componente paralela al eje (E₁·cosθ) pasa; la perpendicular
    // (E₁·sinθ) se absorbe. Es la ley de Malus dibujada.
    const xV = xP2 + 1.2;
    const yV = 3.6;
    const Lv = 1.7;
    scene.vector(xV, yV, 0, Lv, { color: 'force', width: 2 });
    scene.label(xV - 0.45, yV + Lv, 'E₁', { color: 'force', size: 12, avoid: true });
    const tx = xV + sinT * Lv * cosT;
    const ty = yV + cosT * Lv * cosT;
    scene.vector(xV, yV, sinT * Lv * cosT, cosT * Lv * cosT, { color: 'spring', width: 2.4 });
    scene.label(tx + 0.75, ty + 0.15, 'E₁cosθ', { color: 'spring', size: 12, avoid: true });
    if (theta > 0 && theta < 90) {
      const bx = xV - cosT * Lv * sinT;
      const by = yV + sinT * Lv * sinT;
      scene.vector(xV, yV, bx - xV, by - yV, { color: 'textDim', width: 1.4, dash: [3, 3] });
      scene.label(bx - 0.75, by + 0.1, 'E₁sinθ (absorbida)', { color: 'textDim', size: 11, avoid: true });
      scene.line(tx, ty, xV, yV + Lv, { color: 'textDim', width: 1, dash: [2, 3], alpha: 0.7 });
      scene.line(bx, by, xV, yV + Lv, { color: 'textDim', width: 1, dash: [2, 3], alpha: 0.7 });
    }
    scene.label(xV, yV - 0.55, 'plano de P₂', { color: 'textDim', size: 10, avoid: true });

    // Tras P₂: onda inclinada θ con amplitud A₂ = A₁·cosθ y brillo ∝ cos²θ.
    const alpha2 = Math.max(0.12, ratio);
    if (A2 > 0.02) {
      // Oscilación a lo largo de la dirección del eje de P₂ (sinθ, cosθ):
      // curva paramétrica, la escena la muestrea.
      scene.curve(
        (x, o) => {
          const e = A2 * Math.cos(k * x - wt);
          o.x = x + sinT * e;
          o.y = cosT * e;
        },
        xP2 + 0.25,
        xScreen - 0.4,
        { samples: N, color: 'spring', width: 2.4, alpha: alpha2 }
      );
      scene.label((xP2 + xScreen) / 2, A2 + 0.45, `I₂ = I₁cos²θ = ${roundTo(I2, 0)} %`, {
        color: 'spring',
        size: 11,
        avoid: true
      });
    } else {
      scene.label((xP2 + xScreen) / 2, 0.55, 'polarizadores cruzados: nada pasa', { color: 'textDim', size: 11, avoid: true });
    }

    // Pantalla/detector: su brillo es la intensidad transmitida.
    scene.rect(xScreen, 0, 0.35, 4.4, { color: 'textDim', width: 1.5, fill: 'textDim' });
    scene.circle(xScreen + 0.6, 0, 0.75, { color: 'spring', fill: 'spring', alpha: 0.1 + 0.9 * (I2 / 100), width: 1.5 });
    scene.label(xScreen + 0.4, -2.85, `detector · ${roundTo(I2, 0)} %`, { color: 'textDim', size: 11, avoid: true });

    // Barras de intensidad I₁ → I₂ (primitiva `bars`, con marco de escala).
    scene.bars(
      -1.4,
      -4.9,
      [
        { value: I1, color: 'force', label: `I₁ ${roundTo(I1, 0)} %` },
        { value: I2, color: 'spring', label: `I₂ ${roundTo(I2, 0)} %` }
      ],
      { max: 100, hMax: 2.6, barW: 0.7, gap: 0.5, frame: true, labelSize: 10, labelOffset: 0.45, minH: 0.01 }
    );

    // Curva cos²θ con el punto actual.
    const vp = scene.viewport();
    if (vp.w > 460) {
      scene.hud.plot(
        { x: vp.x + vp.w - 250, y: vp.y + vp.h - 128, w: 240, h: 118 },
        {
          title: 'cos²θ (Malus)',
          series: [
            { fn: (a) => Math.cos((a * Math.PI) / 180) ** 2, samples: 90, color: 'textDim', width: 1.6 },
            {
              points: [{ x: theta, y: 0 }, { x: theta, y: Math.cos(rad) ** 2 }],
              color: 'energy',
              width: 2
            },
            { points: [{ x: theta - 3, y: Math.cos(rad) ** 2 }, { x: theta + 3, y: Math.cos(rad) ** 2 }], color: 'energy', width: 2 }
          ],
          xRange: [0, 90],
          yRange: [0, 1.05],
          xLabel: 'θ (°)',
          yLabel: 'I/I₁'
        }
      );
    }

    scene.hud.chip(
      theta >= 90
        ? `Malus con θ = 90°: polarizadores cruzados → luz apagada (I₂ = 0)`
        : `Malus: I₂ = ${roundTo(I2, 0)}% = ${roundTo(I1, 0)}·cos²${theta}°`,
      'top-left'
    );
    scene.hud.readout(
      [
        { label: 'θ', value: theta, unit: '°' },
        { label: 'cos²θ', value: roundTo(Math.cos(rad) ** 2, 4), unit: '' },
        { label: 'I₂', value: roundTo(I2, 1), unit: '%' }
      ],
      'bottom-left'
    );
  }

  /**
   * Símbolo de un polarizador en (x, y): disco con su eje de transmisión y
   * una rejilla de líneas paralelas a él. `degrees` se mide desde la
   * VERTICAL (0° = eje vertical, igual que P₁), de modo que coincide con el
   * θ de Malus y con la inclinación de la onda transmitida.
   */
  _polarizer(scene, x, y, color, degrees = 0) {
    const rad = (degrees * Math.PI) / 180;
    const R = 1.7;
    // Dirección del eje de transmisión (desde la vertical) y su perpendicular.
    const ax = Math.sin(rad);
    const ay = Math.cos(rad);
    const px = Math.cos(rad);
    const py = -Math.sin(rad);
    scene.circle(x, y, R, { color, width: 2, fill: color, alpha: 0.14, stroke: false });
    scene.circle(x, y, R, { color, width: 2 });
    // Rejilla: líneas paralelas al eje, repartidas a lo ancho del disco.
    const n = 7;
    for (let i = -(n - 1) / 2; i <= (n - 1) / 2; i++) {
      const d = (R * 0.82 * i) / ((n - 1) / 2);
      const half = Math.sqrt(Math.max(0, R * R - d * d)) * 0.92;
      scene.line(x + px * d - ax * half, y + py * d - ay * half, x + px * d + ax * half, y + py * d + ay * half, {
        color,
        width: i === 0 ? 3 : 1.1,
        alpha: i === 0 ? 1 : 0.55
      });
    }
    // Flecha doble del eje de transmisión, ligeramente fuera del disco.
    scene.line(x - ax * (R + 0.35), y - ay * (R + 0.35), x + ax * (R + 0.35), y + ay * (R + 0.35), {
      color,
      width: 1.2,
      alpha: 0.8
    });
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    if (this.params.modo === 'polarizacion') {
      const r = (this.params.theta * Math.PI) / 180;
      return {
        'θ': { value: this.params.theta, unit: '°' },
        'cos²θ': { value: roundTo(Math.cos(r) ** 2, 4), unit: '' },
        'I₂': { value: roundTo(this.i2(), 1), unit: '%' }
      };
    }
    return {
      'f': { value: roundTo(this.params.f, 2), unit: 'Hz' },
      'λ': { value: roundTo(this.lambda(), 3), unit: 'm' },
      'c': { value: roundTo(this.params.c, 1), unit: 'u/s' },
      'E₀/B₀': { value: roundTo(this.params.ampE / this.params.ampB, 2), unit: '·' }
    };
  }

  getState() {
    return { t: this.t, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
  }

  destroy() {}
}