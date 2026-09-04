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
import { lensBulgeFromFocal } from '../core/draw-primitives.js';

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
    this.setModuleInfo({
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
    this.setModuleFormulas({
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
    this.clearChallenges();
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
    // La intermedia se forma un poco por dentro del foco del ocular, de modo
    // que la imagen final virtual cae en el punto próximo (dᵢ₂ = −25 cm), que
    // es como se define el aumento M = (L/f_o)·(N/f_e).
    const do2 = (fe * NP) / (NP + fe);
    const di1 = L - do2;
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

  /**
   * Símbolo de lente delgada como silueta de libro de texto. El tipo de lente
   * y la excentricidad dependen del contexto del instrumento:
   *   - cristalino ............. biconvexa; se abomba al acomodar (f menor)
   *   - lupa / ocular telesc. .. biconvexa, curvatura según f
   *   - objetivo microscopio ... biconvexa muy curvada (f de milímetros)
   *   - ocular microscopio ..... plano-convexa, cara plana hacia el ojo
   *   - objetivo telescopio .... plano-convexa, cara curva hacia el objeto
   * A menor |f|, más abombada la lente (más potente); a mayor |f|, más plana.
   * @param {object} spec - { type, fRef, flip, bulge? }
   */
  _lens(scene, x, fCm, color, label, spec = {}) {
    const type = spec.type || 'biconvex';
    const bulge = spec.bulge ?? lensBulgeFromFocal(fCm, spec.fRef ?? 5);
    scene.lens(x, 0, 3, { type, bulge, flip: !!spec.flip, color, fill: color, fillAlpha: 0.22, width: 2.4 });
    if (label) scene.label(x, 1.9, `${label} (f=${roundTo(fCm, 1)} cm)`, { avoid: true, color });
  }

  _drawOjo(scene) {
    const L = 2.5;
    const f = this.ojoF();
    const presbicia = this.params.do < NP;

    // Retina (pantalla fija) y cristalino (lente que acomoda).
    scene.line(6.4, -1.6, 6.4, 1.6, { color: 'textDim', width: 3 });
    scene.label(7, 1.9, 'retina', { avoid: true, color: 'textDim', size: 11 });
    // El cristalino se abomba al acomodar: la excentricidad sigue la fracción
    // de acomodación entre "relajado" (objeto en ∞) y "al límite" (punto próximo).
    const powRelax = 1 / L;
    const powMax = 1 / NP + 1 / L;
    const accom = Math.max(0, Math.min(1, (1 / f - powRelax) / (powMax - powRelax)));
    this._lens(scene, 3.2, roundTo(f, 2), 'mass', 'cristalino', { type: 'biconvex', bulge: 0.3 + 0.62 * accom });

    // Objeto lejos (posición de dibujo comprimida).
    const xObj = -6.2;
    const h = 0.5;
    scene.vector(xObj, 0, 0, h, { color: 'mass', width: 2 });
    scene.label(xObj - 0.4, h / 2, 'O', { avoid: true, color: 'mass' });
    scene.label(xObj, -0.7, `${this.params.do} cm`, { avoid: true, color: 'textDim', size: 11 });

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

    this._lens(scene, 0, fLupa, 'mass', 'lupa', { type: 'biconvex', fRef: 8 });

    // Objeto entre F y la lente (x = −dLupa).
    const h = 1.1;
    scene.vector(-dLupa, 0, 0, h, { color: 'mass', width: 2.2 });
    scene.label(-dLupa - 0.4, h / 2, 'O', { avoid: true, color: 'mass' });

    // Foco e imagen virtual (detrás del objeto, discontinua).
    scene.body(-fLupa, 0, { shape: 'circle', r: 0.1, color: 'textDim' });
    scene.label(-fLupa, -0.5, 'F', { avoid: true, color: 'textDim' });
    const xImg = -di; // di < 0 → imagen a la izquierda
    const hImg = h * (-di / dLupa);
    scene.vector(xImg, 0, 0, hImg, { color: 'force', width: 2.2, dash: [5, 3] });
    scene.label(xImg + 0.4, hImg / 2, 'I (virtual)', { avoid: true, color: 'force' });

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
    const h = 0.16;
    // Escala de dibujo: el tubo L (cm) ocupa 15 unidades; así el ocular
    // siempre entra en el lienzo aunque L cambie.
    const S = 15 / L;
    const xO = -6.5; // objetivo
    const xE = xO + L * S; // ocular

    this._lens(scene, xO, fo, 'mass', 'objetivo', { type: 'biconvex', fRef: 1.6 });
    this._lens(scene, xE, fe, 'spring', 'ocular', { type: 'plano-convex', flip: true, fRef: 2.5 });
    scene.dimension(xO, -3.4, xE, -3.4, `L = ${roundTo(L, 1)} cm`, { color: 'textDim' });

    // Objeto muy cerca del foco del objetivo.
    const xObj = xO - do1 * S;
    scene.vector(xObj, 0, 0, h, { color: 'mass', width: 2 });
    scene.label(xObj - 0.4, h / 2, 'O', { avoid: true, color: 'mass' });

    // Imagen intermedia real en x = di1 (desde el objetivo).
    const h1 = h * Math.abs(mObj);
    const xI1 = xO + di1 * S;
    scene.vector(xI1, 0, 0, -h1, { color: 'energy', width: 2.2 });
    scene.label(xI1 + 0.35, -h1 / 2 - 0.3, 'intermedia', { avoid: true, color: 'energy', size: 11 });

    // Final virtual (punto próximo) desde el ocular: objeto a do2 = L − di1.
    const do2 = L - di1;
    const di2 = this.thinLens(do2, fe);
    const h2 = -h1 * (-di2 / do2);
    const x2 = xE + di2 * S; // di2 < 0 → la imagen está a la izquierda del ocular
    const x2Vis = Math.max(x2, -11.2); // la final está a −25 cm: se recorta al lienzo
    scene.vector(x2Vis, 0, 0, Math.max(-6.2, Math.min(6.2, h2)), { color: 'force', width: 2.2, dash: [5, 3] });
    scene.label(x2Vis + 0.5, Math.max(-6.2, Math.min(6.2, h2)) / 2, 'I (virtual, 25 cm)', { avoid: true, color: 'force' });

    // Rayos: objetivo (de O a la intermedia) y ocular (de la intermedia a la final).
    this._twoRays(scene, xObj, h, xO, fo * S, xI1, -h1, 'energy', true);
    this._twoRays(scene, xI1, -h1, xE, fe * S, x2Vis, Math.max(-6.2, Math.min(6.2, h2)), 'force', false);

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
    // Escala: objetivo + ocular (f_o + f_e cm) ocupan 14 unidades.
    const S = 14 / (foT + feT);
    const xO = -5;
    const xE = xO + (foT + feT) * S;

    this._lens(scene, xO, foT, 'mass', 'objetivo', { type: 'plano-convex', flip: true, fRef: 40 });
    this._lens(scene, xE, feT, 'spring', 'ocular', { type: 'biconvex', fRef: 5 });
    scene.dimension(xO, -2.3, xO + foT * S, -2.3, `f_o = ${roundTo(foT, 0)} cm`, { color: 'mass' });
    scene.dimension(xO + foT * S, -2.6, xE, -2.6, `f_e = ${roundTo(feT, 0)} cm`, { color: 'spring' });

    // Haz paralelo desde la izquierda (objeto en el infinito).
    const yTop = 1.3;
    scene.label(-9.5, yTop + 0.5, 'objeto en ∞', { avoid: true, color: 'textDim', size: 11 });
    const xF = xO + foT * S;
    for (let i = 0; i < 3; i++) {
      const yIn = yTop * (1 - i * 0.4);
      scene.line(-11, yIn, xO, yIn, { color: 'mass', width: 1.6, alpha: 0.8 });
      // Refracción hacia el plano focal del objetivo y de ahí al ocular.
      scene.line(xO, yIn, xF, 0, { color: 'mass', width: 1.6, alpha: 0.8 });
      const yOut = -yIn * (feT / foT);
      scene.line(xF, 0, xE, yOut, { color: 'mass', width: 1.6, alpha: 0.8 });
      // Ocular: recollima hacia la derecha (paralelas más juntas e invertidas).
      scene.line(xE, yOut, 11.5, yOut, { color: 'spring', width: 1.6, alpha: 0.9 });
    }
    scene.label(10.4, -1.05, `haz de salida · M = ${roundTo(M, 1)}×`, { avoid: true, color: 'spring', size: 12 });

    // Plano focal común marcado.
    scene.body(xF, 0, { shape: 'circle', r: 0.12, color: 'textDim' });
    scene.label(xF - 1.2, -0.75, 'plano focal común', { avoid: true, color: 'textDim', size: 11 });

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
    // Rayo paralelo: incide en (xL, y0) y se refracta hacia la imagen
    // (sólido si es real; sólido + prolongación punteada si es virtual).
    scene.line(x0, y0, xL, y0, { color, width: 1.5, alpha: 0.8 });
    scene.rayTo(xL, y0, ix, iy, { color, virtual: !solid, width: 1.6, overshoot: 1.6, solid: 1.6, back: 5, dashAlpha: 0.85 });

    // Rayo por el centro: pasa sin desviarse (línea recta de O a la imagen).
    scene.line(x0, y0, ix, iy, { color, width: 1.5, alpha: 0.75 });
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