/**
 * @fileoverview Ondas estacionarias en cuerdas y batidos (tanda 5.3).
 *
 * Modo `cuerda`: cuerda tensa entre dos nodos fijos. v = √(T/μ), armónicos
 * fₙ = n·v/(2L) con n fijado libremente, nodos y vientres marcados sobre la
 * cuerda, y un espectro fₙ en miniatura. La cuerda anima con
 * y(x,t) = A·sin(nπx/L)·cos(2πfₙt).
 *
 * Modo `batidos`: dos ondas de frecuencias parecidas se suman; la envolvente
 * late a |f₁ − f₂|. Normalmente se oyen "pulsa-pulsa" — aquí se ven: las dos
 * ondas componentes, la suma y la envolvente ±2A·cos(πΔf·t).
 *
 * Ejercita `polyline`, `plot`, `chip` y `readout`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';

export default class StandingWaves extends SimModule {
  static viewport = { width: 24, height: 15 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'cuerda',
      options: [
        { value: 'cuerda', label: 'Cuerda fija' },
        { value: 'batidos', label: 'Batidos' }
      ]
    },
    { id: 'T', label: 'Tensión', latex: 'T', unit: 'N', min: 5, max: 500, step: 5, value: 120 },
    { id: 'mu', label: 'Densidad lineal', latex: '\\mu', unit: 'kg/m', min: 0.01, max: 0.5, step: 0.01, value: 0.02 },
    { id: 'L', label: 'Longitud', latex: 'L', unit: 'm', min: 0.5, max: 5, step: 0.1, value: 2 },
    { id: 'n', label: 'Armónico', latex: 'n', min: 1, max: 8, step: 1, value: 3 },
    { id: 'A', label: 'Amplitud', latex: 'A', unit: 'm', min: 0.05, max: 0.8, step: 0.05, value: 0.3 },
    { id: 'f1', label: 'Frecuencia 1', latex: 'f_1', unit: 'Hz', min: 2, max: 12, step: 0.2, value: 6 },
    { id: 'f2', label: 'Frecuencia 2', latex: 'f_2', unit: 'Hz', min: 2, max: 12, step: 0.2, value: 7 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'cuerda',
      T: 120,
      mu: 0.02,
      L: 2,
      n: 3,
      A: 0.3,
      f1: 6,
      f2: 7
    };
    this.t = 0;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: 'Ondas estacionarias',
      blurb: 'Modos normales de una cuerda fija, nodos, armónicos y batidos por superposición.',
      story:
        'Cuando una onda viaja por una cuerda y se refleja en el extremo fijo, sólo algunas frecuencias exactas pueden vivir ahí: son los armónicos. Por eso una cuerda de guitarra suena limpia (y no con todas las frecuencias posibles). Y cuando llegan dos ondas casi iguales, sus crestas a veces construyen y a veces anulan: el "pulca-pulca" de los batidos es la suma de y₁ + y₂ ondeando entre esos dos límites.',
      cases: [
        'n = 4: cuatro media ondas, cuatro nodos y tres vientres (además de los fijos).',
        'Subir la tensión T: v y todos los fₙ crecen.',
        'En batidos con f₁ = 6 y f₂ = 7 Hz, el período de la envolvente es 1 s.',
        'La envolvente 2A·|cos(πΔf·t)| limita la onda sumada como una vaina.'
      ]
    });
    this.setModuleFormulas({
      title: 'Ondas estacionarias',
      items: [
        {
          name: 'Velocidad de fase',
          formula: 'v = \\sqrt{T/\\mu}',
          note: 'T en newtons, μ en kg/m.'
        },
        {
          name: 'Frecuencia del armónico n',
          formula: 'f_n = \\dfrac{n v}{2 L}',
          note: 'n = 1 fundamental; cada nodo fijo añade un semiona.'
        },
        {
          name: 'Longitud de onda',
          formula: '\\lambda = 2L / n',
          note: 'Sólo las L = nλ/2 sobreviven en la cuerda.'
        },
        {
          name: 'Batidos',
          formula: 'f_{batido} = |f_1 - f_2|',
          note: 'La envolvente late a la diferencia, no a la suma.'
        }
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

  vPhase() {
    return Math.sqrt(this.params.T / this.params.mu);
  }

  fN() {
    return (this.params.n * this.vPhase()) / (2 * this.params.L);
  }

  lambdaN() {
    return (2 * this.params.L) / this.params.n;
  }

  fM(m) {
    return (m * this.vPhase()) / (2 * this.params.L);
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    if (this.params.modo === 'cuerda') this._drawCuerda(scene);
    else this._drawBatidos(scene);
  }

  _drawCuerda(scene) {
    const { L, A, n } = this.params;
    const f = this.fN();
    const x0 = -L / 2;
    const k = (2 * Math.PI * f * this.t) % (2 * Math.PI);
    const cosK = Math.cos(k);
    // Poste izquierdo y derecho (extremos fijos).
    scene.rect(x0 - 0.3, -0.9, 0.3, 1.8, { color: 'textDim', width: 2 });
    scene.rect(x0 + L - 0.0, -0.9, 0.3, 1.8, { color: 'textDim', width: 2 });

    // y(x) = A·sin(nπ·x/L)·cos(ωt), muestreada por la escena.
    scene.curve((x) => A * Math.sin(((x - x0) / L) * Math.PI * n) * cosK, x0, x0 + L, { samples: 90, color: 'spring', width: 3 });

    // Nodos (fijos) y vientres (máximo movimiento).
    for (let m = 0; m <= n; m++) {
      const xn = x0 + (m * L) / n;
      scene.body(xn, 0, { shape: 'circle', r: 0.12, color: 'textDim' });
    }
    for (let m = 0; m < n; m++) {
      const xa = x0 + ((m + 0.5) * L) / n;
      const ya = A * Math.abs(Math.cos(k));
      scene.body(xa, ya, { shape: 'circle', r: 0.12, color: 'energy' });
      scene.body(xa, -ya, { shape: 'circle', r: 0.12, color: 'energy' });
    }

    scene.hud.chip(`Armónico n = ${n}`, 'top-left');
    scene.hud.readout(
      [
        { label: 'v', value: roundTo(this.vPhase(), 1), unit: 'm/s' },
        { label: 'fₙ', value: roundTo(this.fN(), 2), unit: 'Hz' },
        { label: 'λ', value: roundTo(this.lambdaN(), 2), unit: 'm' }
      ],
      'bottom-left'
    );

    // Espectro de armónicos: barras f₁..f₈ y el actual resaltado.
    const vp = scene.viewport();
    if (vp.w > 430) {
      const series = [];
      for (let m = 1; m <= 8; m++) {
        series.push({
          points: [{ x: m, y: 0 }, { x: m, y: this.fM(m) }],
          color: m === n ? 'force' : 'textDim'
        });
      }
      scene.hud.plot(
        { x: vp.x + vp.w - 220, y: vp.y + vp.h - 110, w: 205, h: 100 },
        {
          title: 'Espectro fₙ = n·f₁',
          series,
          xRange: [0.6, 8.4],
          yRange: [0, this.fM(8) * 1.15],
          xLabel: 'n',
          yLabel: 'Hz'
        }
      );
    }
  }

  _drawBatidos(scene) {
    const { f1, f2 } = this.params;
    const A = 0.5;
    const window = 3; // s de historia visibles
    const x0 = -9;
    const x1 = 9;

    const tStart = this.t - window;
    const N = 120;
    const dF = Math.abs(f1 - f2);
    // El eje x del lienzo es el tiempo de la ventana: t(x) lineal.
    const tOf = (x) => tStart + (window * (x - x0)) / (x1 - x0);
    const y1 = (x) => A * Math.sin(2 * Math.PI * f1 * tOf(x));
    const y2 = (x) => A * Math.sin(2 * Math.PI * f2 * tOf(x));
    const env = (x) => 2 * A * Math.abs(Math.cos(Math.PI * dF * tOf(x)));

    // Envolvente (contorno del batido), suma y componentes — muestreadas por la escena.
    scene.curve(env, x0, x1, { samples: N, color: 'energy', dash: [4, 3], width: 1.6 });
    scene.curve((x) => -env(x), x0, x1, { samples: N, color: 'energy', dash: [4, 3], width: 1.6 });
    scene.curve((x) => y1(x) + y2(x), x0, x1, { samples: N, color: 'spring', width: 2 });
    scene.curve(y1, x0, x1, { samples: N, color: 'textDim', width: 1.5, alpha: 0.5 });
    scene.curve(y2, x0, x1, { samples: N, color: 'textDim', width: 1.5, alpha: 0.5 });

    scene.label(-0.2, 3.2, 'y₁ + y₂ con envolvente', { avoid: true, color: 'spring' });
    scene.label(-9.2, -2.2, `f₁ = ${f1} Hz · f₂ = ${f2} Hz`, { avoid: true, color: 'textDim' });

    scene.hud.chip('Batidos: la envolvente marca el período', 'top-left');
    scene.hud.readout(
      [
        { label: 'f_batido', value: roundTo(dF, 2), unit: 'Hz' },
        { label: 'T_batido', value: roundTo(1 / Math.max(dF, 1e-9), 3), unit: 's' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    if (this.params.modo === 'batidos') {
      const dF = Math.abs(this.params.f1 - this.params.f2);
      return {
        'f₁': { value: roundTo(this.params.f1, 2), unit: 'Hz' },
        'f₂': { value: roundTo(this.params.f2, 2), unit: 'Hz' },
        'f_batido': { value: roundTo(dF, 2), unit: 'Hz' },
        'T_batido': { value: roundTo(1 / Math.max(dF, 1e-9), 3), unit: 's' }
      };
    }
    return {
      'v': { value: roundTo(this.vPhase(), 1), unit: 'm/s' },
      'fₙ': { value: roundTo(this.fN(), 2), unit: 'Hz' },
      'λ': { value: roundTo(this.lambdaN(), 2), unit: 'm' }
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