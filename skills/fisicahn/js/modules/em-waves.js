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
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

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
    setModuleInfo(this.ui, {
      title: 'Ondas electromagnéticas',
      blurb: 'E ⊥ B ⊥ propagación con c = f·λ, y polarización con la ley de Malus.',
      story:
        'Maxwell unificó electricidad y magnetismo: la luz es una onda EM donde E y B oscilan en fase y perpendiculares. Y una antena polarizada solo deja pasar la componente de E que coincide con su dirección: por eso dos gafas polarizadas giradas 90° se oscurecen. La del tercero es la ley de Malus: I = I₁·cos²θ, un coseno al cuadrado que a 45° divide la luz por dos y a 90° la apaga.',
      cases: [
        'Boja la frecuencia f: λ = c/f crece y la onda se estira.',
        'Plana: E va en y, B representado perpendicular, luz avanza por +x.',
        'Malus a 45°: la intensidad cae a la mitad (cos²45° = 0.5).',
        'Malus a 90°: I = 0: dos polarizadores cruzados apagan la luz.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Ondas electromagnéticas',
      items: [
        { name: 'Velocidad', formula: 'c = f \\cdot \\lambda' },
        { name: 'Campos en la onda', formula: 'E = E_0 \\cos(kx - \\omega t)' },
        { name: 'Relación E–B', formula: '\\dfrac{E_0}{B_0} = c', note: 'En el vacío (SI).' },
        { name: 'Ley de Malus', formula: 'I = I_1 \\cos^2\\theta' }
      ]
    });
    clearChallenges(this.ui);
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
    const N = 120;
    const ptsE = [];
    const ptsB = [];
    for (let i = 0; i <= N; i++) {
      const x = -6 + (12 * i) / N;
      const phase = k * x - w * this.t;
      ptsE.push({ x, y: ampE * Math.cos(phase) });
      ptsB.push({ x, y: -3.4 + ampB * 0.55 * Math.cos(phase) });
    }
    scene.line(-7, 0, 7, 0, { color: 'textDim', width: 1.2 });
    scene.polyline(ptsE, { color: 'force', width: 2.5 });
    scene.polyline(ptsB, { color: 'spring', width: 2.5 });

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

  _drawPolarizacion(scene) {
    const { theta, I1 } = this.params;
    const rad = (theta * Math.PI) / 180;
    const I2 = this.i2();
    // Amplitud de E ∝ √I₁: el dibujo refleja el parámetro de intensidad.
    const amp = 1.5 * Math.sqrt(Math.max(I1, 0) / 100);

    // Haz a lo largo del eje.
    scene.line(-8, 0, 8, 0, { color: 'textDim', width: 1.2 });

    // Antes del primer polarizador: campo vertical (luz ya polarizada), I₁.
    scene.line(-8, 0, 0, 0, { color: 'textDim', alpha: 0.4 });
    for (let x = -7; x <= -1; x += 0.9) {
      scene.line(x, -amp, x, amp, { color: 'mass', width: 1.6 });
    }

    // Primer polarizador (vertical) en x = 0.
    this._polarizer(scene, 0, 0, 'mass');
    scene.label(0, -2.1, 'P₁ vertical', { color: 'mass', size: 11 });

    // Entre polarizadores: E vertical con I₁ completa.
    for (let x = 0.8; x <= 3.2; x += 0.9) {
      scene.line(x, -amp, x, amp, { color: 'force', width: 1.6 });
    }

    // Segundo polarizador a θ en x = 4.
    this._polarizer(scene, 4, 0, 'force', theta);
    scene.label(4, -2.1, `P₂ a ${theta}°`, { color: 'force', size: 11 });

    // Después: E sigue la dirección de P₂ con amplitud E·cosθ (ley de Malus).
    // Las franjas se dibujan GIradas según θ con longitud 2·E₂, no verticales.
    const E2 = amp * Math.cos(rad);
    const sx = Math.sin(rad);
    const cy2 = Math.cos(rad);
    for (let x = 4.9; x <= 7.4; x += 0.9) {
      scene.polyline(
        [
          { x: x - sx * E2, y: -cy2 * E2 },
          { x: x + sx * E2, y: cy2 * E2 }
        ],
        { color: 'spring', width: 1.6 }
      );
    }
    scene.vector(7.6, 0, Math.cos(rad) * 1.2, Math.sin(rad) * 1.2, {
      color: 'spring',
      label: `E·cos${theta}° = ${E2.toFixed(2)}`
    });

    // Curva cos²θ con el punto actual.
    const vp = scene.viewport();
    if (vp.w > 460) {
      const series = [];
      for (let a = 0; a <= 90; a++) {
        const rr = (a * Math.PI) / 180;
        series.push({ x: a, y: Math.cos(rr) ** 2 });
      }
      scene.hud.plot(
        { x: vp.x + vp.w - 250, y: vp.y + vp.h - 128, w: 240, h: 118 },
        {
          title: 'cos²θ (Malus)',
          series: [
            { points: series, color: 'textDim', width: 1.6 },
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

  /** Símbolo de un polarizador en (x, y); orientación θ en grados. */
  _polarizer(scene, x, y, color, degrees = 0) {
    const rad = (degrees * Math.PI) / 180;
    const R = 1.6;
    // Anillo del polarizador y eje de transmisión (θ) marcado con rejilla.
    scene.circle(x, y, R, { color, width: 2 });
    const cx = Math.cos(rad);
    const sy = Math.sin(rad);
    scene.line(x - cx * R, y - sy * R, x + cx * R, y + sy * R, { color, width: 3 });
    // Rejilla de alambres paralelos a la dirección permitida.
    const n = 5;
    for (let i = 1; i < n; i++) {
      const t = -R + (2 * R * i) / n;
      scene.line(x + cx * t - sy * 0.35, y + sy * t + cx * 0.35, x + cx * t + sy * 0.35, y + sy * t - cx * 0.35, {
        color,
        width: 1,
        alpha: 0.7
      });
    }
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