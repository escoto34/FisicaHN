/**
 * @fileoverview Instrumentos ópticos: ojo, lupa, microscopio y telescopio
 * (tanda 5.4).
 *
 * Encadena lentes delgadas con 1/f = 1/d₀ + 1/dᵢ: la imagen de un elemento es
 * el objeto del siguiente. Un solucionador `_thinLens(do, f)` devuelve dᵢ y el
 * aumento M = −dᵢ/d₀, y dos rayos (paralelo al eje y por el centro) trazan
 * cada etapa. La imagen final virtual se dibuja en línea de puntos.
 *
 * Modos:
 *  - `ojo`: el cristalino acomoda para que la imagen caiga siempre en la
 *    retina (dᵢ = L fijo): f = do·L/(do+L). Cerca del punto próximo la
 *    acomodación se agota (hipermetropía de lectura: presbicia).
 *  - `lupa`: objeto entre F y la lente → imagen virtual derecha y aumentada;
 *    M = 1 + N/f con el punto próximo N = 25 cm.
 *  - `microscopio`: objetivo de fo corta forma una imagen real intermedia que
 *    el ocular (fe) vuelve a ampliar hasta el punto próximo;
 *    M = (L/fo)·(N/fe).
 *  - `telescopio`: haz paralelo → plano focal del objetivo → el ocular lo
 *    recollima; aumento angular M = fo/fe.
 *
 * Ejercita `line`, `vector`, `label`, `chip`, `readout`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const NP = 25; // punto próximo (cm)

export default class OpticalInstruments extends SimModule {
  static viewport = { width: 24, height: 15 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'ojo',
      options: [
        { value: 'ojo', label: 'Ojo (acomodación)' },
        { value: 'lupa', label: 'Lupa' },
        { value: 'microscopio', label: 'Microscopio' },
        { value: 'telescopio', label: 'Telescopio' }
      ]
    },
    { id: 'do', label: 'Distancia del objeto', latex: 'd_o', unit: 'cm', min: 20, max: 1000, step: 5, value: 50 },
    { id: 'fLupa', label: 'Focal de la lupa', latex: 'f', unit: 'cm', min: 2, max: 20, step: 0.5, value: 5 },
    { id: 'dLupa', label: 'Objeto–lente', latex: 'd_o', unit: 'cm', min: 0.2, max: 19, step: 0.2, value: 4 },
    { id: 'fo', label: 'Focal del objetivo', latex: 'f_o', unit: 'cm', min: 0.5, max: 4, step: 0.1, value: 1 },
    { id: 'fe', label: 'Focal del ocular', latex: 'f_e', unit: 'cm', min: 0.5, max: 6, step: 0.1, value: 2 },
    { id: 'L', label: 'Longitud del tubo', latex: 'L', unit: 'cm', min: 10, max: 24, step: 0.5, value: 16 },
    { id: 'foT', label: 'Focal del objetivo', latex: 'f_o', unit: 'cm', min: 10, max: 80, step: 1, value: 50 },
    { id: 'feT', label: 'Focal del ocular', latex: 'f_e', unit: 'cm', min: 2, max: 10, step: 0.5, value: 5 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'ojo',
      do: 50,
      fLupa: 5,
      dLupa: 4,
      fo: 1,
      fe: 2,
      L: 16,
      foT: 50,
      feT: 5
    };
    this.t = 0;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Instrumentos ópticos',
      blurb: 'Ojo, lupa, microscopio y telescopio: lentes encadenadas.',
      story:
        'Todo instrumento óptico es una cadena de lentes delgadas: la imagen de la primera es el objeto de la siguiente. El ojo acomoda su cristalino para que la imagen caiga siempre en la retina; la lupa fabrica una imagen virtual derecha y grande; el microscopio encadena dos aumentos (objetivo y ocular); el telescopio comprime el ángulo de un objeto lejano. Al final, la cuenta es de una línea: 1/f = 1/d₀ + 1/dᵢ, repetida.',
      cases: [
        'Ojo: mirando a 25 cm, la acomodación está al límite (f ≈ 2.27 cm con L = 2.5).',
        'Lupa: con f = 5 cm, el aumento es 1 + 25/5 = 6×.',
        'Microscopio con fo = 1, fe = 2, L = 16 cm: 200×.',
        'Telescopio: la razón fo/fe es el aumento: 50/5 = 10×.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Instrumentos ópticos',
      items: [
        { name: 'Lente delgada', formula: '\\dfrac{1}{f} = \\dfrac{1}{d_o} + \\dfrac{1}{d_i}' },
        { name: 'Aumento de la lupa', formula: 'M = 1 + \\dfrac{N}{f}', note: 'N = 25 cm, punto próximo.' },
        {
          name: 'Aumento del microscopio',
          formula: 'M = \\dfrac{L}{f_o}\\cdot\\dfrac{N}{f_e}'
        },
        { name: 'Aumento del telescopio', formula: 'M = \\dfrac{f_o}{f_e}' }
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

  /** Lente delgada: dᵢ (cm) dado d₀ y f (cm); null si d₀ = f. */
  thinLens(do_, f) {
    const denom = do_ - f;
    if (Math.abs(denom) < 1e-9) return null;
    return (f * do_) / denom;
  }

  /* Cálculos por modo */

  ojoF() {
    const L = 2.5;
    const doCm = this.params.do;
    return (doCm * L) / (doCm + L);
  }

  lupaDi() {
    return this.thinLens(this.params.dLupa, this.params.fLupa);
  }

  lupaM() {
    return 1 + NP / this.params.fLupa;
  }

  microscopio() {
    const { fo, fe, L } = this.params;
    const di1 = L - fe; // imagen intermedia en el foco del ocular
    const do1 = fo === di1 ? null : (fo * di1) / (di1 - fo);
    const mObj = -di1 / (do1 ?? 1);
    const mEye = NP / fe;
    const mTotal = (L / fo) * (NP / fe);
    return { di1, do1, mObj, mEye, mTotal };
  }

  telescopioM() {
    return this.params.foT / this.params.feT;
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    scene.line(-11.5, 0, 11.5, 0, { color: 'textDim', width: 1.4 });
    switch (this.params.modo) {
      case 'lupa':
        this._drawLupa(scene);
        break;
      case 'microscopio':
        this._drawMicroscopio(scene);
        break;
      case 'telescopio':
        this._drawTelescopio(scene);
        break;
      default:
        this._drawOjo(scene);
    }
  }

  /** Símbolo de lente delgada: doble flecha vertical. */
  _lens(scene, x, fCm, color, label) {
    scene.line(x, -1.5, x, 1.5, { color, width: 2.4 });
    scene.polyline(
      [
        { x: x - 0.18, y: 1.5 },
        { x: x, y: 1.15 },
        { x: x + 0.18, y: 1.5 }
      ],
      { color, width: 1.8 }
    );
    scene.polyline(
      [
        { x: x - 0.18, y: -1.5 },
        { x: x, y: -1.15 },
        { x: x + 0.18, y: -1.5 }
      ],
      { color, width: 1.8 }
    );
    if (label) scene.label(x, 2, `${label} (f=${fCm} cm)`, { color });
  }

  _drawOjo(scene) {
    const L = 2.5;
    const f = this.ojoF();
    const presbicia = this.params.do < NP;

    // Retina (pantalla fija) y cristalino (lente que acomoda).
    scene.line(6.4, -1.6, 6.4, 1.6, { color: 'textDim', width: 3 });
    scene.label(7, 1.9, 'retina', { color: 'textDim', size: 11 });
    this._lens(scene, 3.2, roundTo(f, 2), 'mass', 'cristalino');

    // Objeto lejos (posición de dibujo comprimida).
    const xObj = -6.2;
    const h = 0.5;
    scene.vector(xObj, 0, 0, h, { color: 'mass', width: 2 });
    scene.label(xObj - 0.4, h / 2, 'O', { color: 'mass' });
    scene.label(xObj, -0.7, `${this.params.do} cm`, { color: 'textDim', size: 11 });

    // Rayos que acomodan: paralelo + por el centro, convergiendo en la retina.
    const hImg = h * (-L / this.params.do); // M = −di/do con di = L
    const yL = 3.2; // plano del cristalino
    this._twoRays(scene, xObj, h, yL, f, 6.4, hImg, 'energy', true);

    scene.hud.chip(
      presbicia ? 'Demasiado cerca: acomodación agotada' : 'El ojo acomoda: imagen en la retina',
      'top-left',
      { color: presbicia ? 'amber' : '' }
    );
    scene.hud.readout(
      [
        { label: 'd₀', value: roundTo(this.params.do, 0), unit: 'cm' },
        { label: 'f acomodada', value: roundTo(f, 2), unit: 'cm' },
        { label: 'dᵢ', value: roundTo(L, 2), unit: 'cm' },
        { label: 'Punto próximo', value: NP, unit: 'cm' }
      ],
      'bottom-left'
    );
  }

  _drawLupa(scene) {
    const { fLupa, dLupa } = this.params;
    const di = this.lupaDi();
    const M = this.lupaM();

    this._lens(scene, 0, fLupa, 'mass', 'lupa');

    // Objeto entre F y la lente (x = −dLupa).
    const h = 1.1;
    scene.vector(-dLupa, 0, 0, h, { color: 'mass', width: 2.2 });
    scene.label(-dLupa - 0.4, h / 2, 'O', { color: 'mass' });

    // Foco e imagen virtual (detrás del objeto, discontinua).
    scene.body(-fLupa, 0, { shape: 'circle', r: 0.1, color: 'textDim' });
    scene.label(-fLupa, -0.5, 'F', { color: 'textDim' });
    const xImg = -di; // di < 0 → imagen a la izquierda
    const hImg = h * (-di / dLupa);
    scene.vector(xImg, 0, 0, hImg, { color: 'force', width: 2.2, dash: [5, 3] });
    scene.label(xImg + 0.4, hImg / 2, 'I (virtual)', { color: 'force' });

    this._twoRays(scene, -dLupa, h, 0, fLupa, xImg, hImg, 'energy', false);

    scene.hud.chip(`Lupa: M = 1 + N/f = ${roundTo(M, 1)}×`, 'top-left');
    scene.hud.readout(
      [
        { label: 'f', value: roundTo(fLupa, 2), unit: 'cm' },
        { label: 'd₀', value: roundTo(dLupa, 2), unit: 'cm' },
        { label: 'dᵢ', value: roundTo(di, 2), unit: 'cm' },
        { label: 'M (ángulo)', value: roundTo(M, 2), unit: '×' }
      ],
      'bottom-left'
    );
  }

  _drawMicroscopio(scene) {
    const { fo, fe, L } = this.params;
    const { di1, do1, mObj, mEye, mTotal } = this.microscopio();
    const h = 0.5;

    // Objetivo en x = 0, ocular en x = L.
    this._lens(scene, 0, fo, 'mass', 'objetivo');
    this._lens(scene, L, fe, 'spring', 'ocular');

    // Objeto muy cerca del foco del objetivo.
    const xObj = -do1;
    scene.vector(xObj, 0, 0, h, { color: 'mass', width: 2 });
    scene.label(xObj - 0.4, h / 2, 'O', { color: 'mass' });

    // Imagen intermedia real en x = di1.
    const h1 = h * Math.abs(mObj);
    scene.vector(di1, 0, 0, -h1, { color: 'energy', width: 2.2 });
    scene.label(di1 + 0.35, -h1 / 2 - 0.3, 'intermedia', { color: 'energy', size: 11 });

    // Final virtual (punto próximo) desde el ocular: objeto a do2 = L − di1.
    const do2 = L - di1;
    const di2 = this.thinLens(do2, fe);
    const h2 = -h1 * (-di2 / do2);
    const x2 = L + di2; // di2 < 0 → la imagen está a la izquierda del ocular
    scene.vector(x2, 0, 0, h2, { color: 'force', width: 2.2, dash: [5, 3] });
    scene.label(x2 + 0.4, h2 / 2, 'I (virtual)', { color: 'force' });

    // Rayos: objetivo (de O a la intermedia) y ocular (de la intermedia a la final).
    this._twoRays(scene, xObj, h, 0, fo, di1, -h1, 'energy', true);
    this._twoRays(scene, di1, -h1, L, fe, x2, h2, 'force', false);

    scene.hud.chip(`Microscopio: ${roundTo(mTotal, 0)}×`, 'top-left');
    scene.hud.readout(
      [
        { label: 'M_total', value: roundTo(mTotal, 0), unit: '×' },
        { label: 'M objetivo', value: roundTo(Math.abs(mObj), 1), unit: '×' },
        { label: 'M ocular', value: roundTo(mEye, 1), unit: '×' },
        { label: 'd₀ objeto', value: roundTo(do1, 3), unit: 'cm' }
      ],
      'bottom-left'
    );
  }

  _drawTelescopio(scene) {
    const { foT, feT } = this.params;
    const M = this.telescopioM();

    this._lens(scene, 0, foT, 'mass', 'objetivo');
    this._lens(scene, foT + feT, feT, 'spring', 'ocular');

    // Haz paralelo desde la izquierda (objeto en el infinito).
    const yTop = 1.3;
    scene.label(-8, yTop + 0.4, 'objeto en ∞', { color: 'textDim', size: 11 });
    for (let i = 0; i < 3; i++) {
      const yIn = yTop * (1 - i * 0.4);
      scene.line(-8, yIn, 0, yIn, { color: 'mass', width: 1.6, alpha: 0.8 });
      // Refracción hacia el plano focal del objetivo.
      scene.line(0, yIn, foT, 0, { color: 'mass', width: 1.6, alpha: 0.8 });
      // Ocular: recollima hacia la derecha (paralelas más juntas).
      const yOut = yIn * (feT / foT);
      scene.line(foT + feT, yOut, 12, yOut, { color: 'spring', width: 1.6, alpha: 0.9 });
      scene.label(11.5, yOut + 0.3, `M = ${roundTo(M, 1)}×`, { color: 'spring', size: 12 });
    }

    // Plano focal del objetivo marcado.
    scene.body(foT, 0, { shape: 'circle', r: 0.12, color: 'textDim' });
    scene.label(foT, -0.55, 'plano focal', { color: 'textDim', size: 11 });

    scene.hud.chip(`Telescopio: M = f_o/f_e = ${roundTo(M, 2)}×`, 'top-left');
    scene.hud.readout(
      [
        { label: 'f_o', value: roundTo(foT, 1), unit: 'cm' },
        { label: 'f_e', value: roundTo(feT, 1), unit: 'cm' },
        { label: 'M', value: roundTo(M, 2), unit: '×' }
      ],
      'bottom-left'
    );
  }

  /**
   * Dos rayos desde (x0, y0) a través de la lente en x = xL con focal f:
   * paralelo → foco, y por el centro. Refracción convergiendo en la imagen
   * (ix, iy); el tramo de puntos marca la prolongación virtual.
   */
  _twoRays(scene, x0, y0, xL, f, ix, iy, color, solid) {
    // Rayo paralelo: incide en (xL, y0) y va al foco (xL+f, 0) → imagen.
    scene.line(x0, y0, xL, y0, { color, width: 1.5, alpha: 0.8 });
    const fx = xL + f;
    const denom = fx - xL;
    if (Math.abs(denom) > 1e-9) {
      const tI = (ix - xL) / denom;
      const yI = y0 * (1 - tI);
      const viaF = { x: xL, y: y0, tx: fx, ty: 0 };
      this._segToImage(scene, xL, y0, ix, iy, color, solid);
    } else {
      this._segToImage(scene, xL, y0, ix, iy, color, solid);
    }

    // Rayo por el centro: pasa sin desviarse (línea recta de O a la imagen).
    scene.line(x0, y0, ix, iy, { color, width: 1.5, alpha: 0.75 });
  }

  /** Segmento refractado hacia la imagen; si es virtual, de puntos. */
  _segToImage(scene, xL, yL, ix, iy, color, solid) {
    const dx = ix - xL;
    const dy = iy - yL;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const ux = dx / len;
    const uy = dy / len;
    if (solid) {
      scene.line(xL, yL, xL + ux * (len + 1.6), yL + uy * (len + 1.6), { color, width: 1.6 });
    } else {
      const seg = Math.min(len, 1.6);
      scene.line(xL, yL, xL + ux * seg, yL + uy * seg, { color, width: 1.6 });
      scene.line(xL + ux * (seg - 5), yL + uy * (seg - 5), ix, iy, {
        color,
        width: 1.4,
        dash: [4, 3],
        alpha: 0.85
      });
    }
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    switch (this.params.modo) {
      case 'lupa':
        return {
          'f': { value: roundTo(this.params.fLupa, 2), unit: 'cm' },
          'd₀': { value: roundTo(this.params.dLupa, 2), unit: 'cm' },
          'dᵢ': { value: roundTo(this.lupaDi(), 2), unit: 'cm' },
          'M = 1+N/f': { value: roundTo(this.lupaM(), 2), unit: '×' }
        };
      case 'microscopio': {
        const { mTotal, mObj, mEye } = this.microscopio();
        return {
          'M total': { value: roundTo(mTotal, 0), unit: '×' },
          'M objetivo': { value: roundTo(Math.abs(mObj), 1), unit: '×' },
          'M ocular': { value: roundTo(mEye, 1), unit: '×' }
        };
      }
      case 'telescopio':
        return {
          'M = fo/fe': { value: roundTo(this.telescopioM(), 2), unit: '×' }
        };
      default:
        return {
          'd₀': { value: roundTo(this.params.do, 0), unit: 'cm' },
          'f acomodada': { value: roundTo(this.ojoF(), 2), unit: 'cm' },
          'dᵢ': { value: 2.5, unit: 'cm' },
          'Punto próximo': { value: NP, unit: 'cm' }
        };
    }
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