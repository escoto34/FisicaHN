/**
 * @fileoverview Presión y prensa hidráulica — hidrostática, principio de
 * Pascal y vasos comunicantes.
 *
 * Tres modos sobre un mismo motor (§3.2):
 *
 *  - `hidrostatica`: tanque con un líquido de densidad ρ y una sonda
 *    arrastrable a profundidad h → P = P₀ + ρ·g·h. Manómetro de aguja,
 *    flechas de presión que crecen con la profundidad y gráfica P(h).
 *  - `pascal`: prensa hidráulica con dos pistones de áreas A₁ y A₂. Una
 *    fuerza F₁ sobre el pistón pequeño produce F₂ = F₁·A₂/A₁ en el grande;
 *    los desplazamientos cumplen A₁·d₁ = A₂·d₂ (conservación de volumen).
 *    La pulsación se anima al cambiar cualquier parámetro o en bombeo continuo.
 *  - `vasos`: tubo en U con dos líquidos inmiscibles: en el nivel de la
 *    interfaz la presión es la misma por ambos lados → ρ₁·h₁ = ρ₂·h₂.
 *
 * Dibujo declarativo (`draw(scene)`): `fill`, `rect`, `line`, `vector`,
 * `dimension`, `label`, `chip`, `body`, `arc`, `hud.plot`, `hud.readout`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo, clamp } from '../core/geometry.js';

const G = 9.8;

/** Líquidos disponibles: densidad en kg/m³ y token de color del tema. */
const LIQUIDS = {
  agua: { rho: 1000, label: 'Agua (1000 kg/m³)', name: 'agua', color: 'field' },
  mar: { rho: 1025, label: 'Agua de mar (1025 kg/m³)', name: 'agua de mar', color: 'mass' },
  aceite: { rho: 920, label: 'Aceite (920 kg/m³)', name: 'aceite', color: 'ray' },
  alcohol: { rho: 790, label: 'Alcohol (790 kg/m³)', name: 'alcohol', color: 'rayAlt' },
  glicerina: { rho: 1260, label: 'Glicerina (1260 kg/m³)', name: 'glicerina', color: 'accel' },
  mercurio: { rho: 13600, label: 'Mercurio (13600 kg/m³)', name: 'mercurio', color: 'spring' }
};

/** Altura dibujada del tanque de hidrostática (u de mundo) para la altura H del líquido. */
const TANK_H = 12;
/** Escala de la prensa: u de mundo por cm de carrera. */
const PRESS_K = 0.12;
/** Escala de los vasos comunicantes: u de mundo por cm de columna. */
const VESSEL_K = 0.2;
/** Duración de la pulsación de la prensa (s). */
const PRESS_TIME = 1.2;
/** Periodo del bombeo continuo (s). */
const PUMP_PERIOD = 2.6;
/** Puntos de la curva P(h). */
const CURVE_N = 40;

export default class Hydraulics extends SimModule {
  static viewport = { width: 24, height: 16 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'hidrostatica',
      options: [
        { value: 'hidrostatica', label: 'Presión hidrostática' },
        { value: 'pascal', label: 'Prensa hidráulica (Pascal)' },
        { value: 'vasos', label: 'Vasos comunicantes' }
      ]
    },
    {
      id: 'liquido',
      type: 'select',
      label: 'Líquido (ρ₁)',
      value: 'agua',
      options: Object.entries(LIQUIDS).map(([v, l]) => ({ value: v, label: l.label }))
    },
    { id: 'H', label: 'Altura del líquido', latex: 'H', unit: 'm', min: 0.5, max: 5, step: 0.1, value: 3 },
    { id: 'h', label: 'Profundidad de la sonda', latex: 'h', unit: 'm', min: 0, max: 5, step: 0.05, value: 1.5 },
    { id: 'P0', label: 'Presión en la superficie', latex: 'P_0', unit: 'kPa', min: 0, max: 200, step: 0.5, value: 101.3 },
    { id: 'A1', label: 'Área del pistón pequeño', latex: 'A_1', unit: 'cm²', min: 1, max: 50, step: 1, value: 5 },
    { id: 'A2', label: 'Área del pistón grande', latex: 'A_2', unit: 'cm²', min: 10, max: 1000, step: 10, value: 100 },
    { id: 'F1', label: 'Fuerza aplicada', latex: 'F_1', unit: 'N', min: 0, max: 500, step: 5, value: 50 },
    { id: 'd1', label: 'Carrera del pistón pequeño', latex: 'd_1', unit: 'cm', min: 0, max: 30, step: 1, value: 10 },
    { id: 'bombeo', type: 'checkbox', label: 'Bombeo continuo', value: false },
    {
      id: 'liquido2',
      type: 'select',
      label: 'Segundo líquido (ρ₂)',
      value: 'aceite',
      options: Object.entries(LIQUIDS).map(([v, l]) => ({ value: v, label: l.label }))
    },
    { id: 'h2', label: 'Columna del segundo líquido', latex: 'h_2', unit: 'cm', min: 2, max: 30, step: 1, value: 10 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'hidrostatica',
      liquido: 'agua',
      H: 3,
      h: 1.5,
      P0: 101.3,
      A1: 5,
      A2: 100,
      F1: 50,
      d1: 10,
      bombeo: false,
      liquido2: 'aceite',
      h2: 10
    };
    this.t = 0;
    /** Progreso de la pulsación de la prensa (0 = arriba, 1 = carrera completa). */
    this.press = 0;
    /** Progreso del vertido en los vasos comunicantes (0..1). */
    this.pour = 0;
    /** Curva P(h) reutilizada por frame. */
    this._curve = Array.from({ length: CURVE_N + 1 }, () => ({ x: 0, y: 0 }));
    this._marker = [{ x: 0, y: 0 }];
    this.dragging = null;
  }

  init() {
    this.reset();
    this.setModuleInfo({
      title: 'Presión y prensa hidráulica',
      blurb: 'Presión hidrostática con sonda arrastrable, prensa de Pascal y vasos comunicantes.',
      story:
        'Blaise Pascal demostró en 1647 que la presión aplicada a un líquido encerrado se transmite íntegra a todos sus puntos. Con un tubo delgado y un barril reventó las duelas con apenas un vaso de agua. De esa idea salen el gato hidráulico, los frenos del carro y las prensas de los talleres; y de la hidrostática, el porqué los oídos duelen al bucear y por qué las represas son más gruesas abajo.',
      cases: [
        'A 10 m bajo el agua la presión casi se duplica respecto a la superficie.',
        'Gato hidráulico: 50 N en el pistón pequeño levantan 1000 N en el grande (A₂/A₁ = 20).',
        'La prensa no regala trabajo: el pistón grande sube 20 veces menos que lo que baja el pequeño.',
        'Aceite sobre agua en un tubo en U: la columna de aceite es más alta porque es menos densa.'
      ]
    });
    this.setModuleFormulas({
      title: 'Presión en fluidos',
      items: [
        { name: 'Presión', formula: 'P = \\dfrac{F}{A}', note: '1 Pa = 1 N/m²; 1 atm ≈ 101.3 kPa.' },
        { name: 'Presión hidrostática', formula: 'P = P_0 + \\rho\\,g\\,h', note: 'Crece linealmente con la profundidad.' },
        { name: 'Principio de Pascal', formula: '\\dfrac{F_1}{A_1} = \\dfrac{F_2}{A_2}', note: 'La presión se transmite íntegra a todo el líquido.' },
        { name: 'Ventaja mecánica', formula: 'F_2 = F_1\\,\\dfrac{A_2}{A_1}' },
        { name: 'Conservación de volumen', formula: 'A_1\\,d_1 = A_2\\,d_2', note: 'Trabajo igual: F₁·d₁ = F₂·d₂.' },
        { name: 'Vasos comunicantes', formula: '\\rho_1\\,h_1 = \\rho_2\\,h_2', note: 'Misma presión en el nivel de la interfaz.' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.press = 0;
    this.pour = 0;
    this.engine?.reset?.();
  }

  /* ---------- física ---------- */

  liquid(which = 1) {
    const key = which === 2 ? this.params.liquido2 : this.params.liquido;
    return LIQUIDS[key] || LIQUIDS.agua;
  }

  /** Profundidad efectiva de la sonda (no puede pasar del fondo). */
  depth() {
    return clamp(this.params.h, 0, this.params.H);
  }

  /** Presión absoluta a la profundidad h (Pa). */
  pressureAt(h) {
    return this.params.P0 * 1000 + this.liquid().rho * G * h;
  }

  /** Prensa: {P, F2, d2, MA, W}. */
  press_() {
    const { A1, A2, F1, d1 } = this.params;
    const P = F1 / (A1 * 1e-4);
    const F2 = F1 * (A2 / A1);
    const d2 = d1 * (A1 / A2);
    return { P, F2, d2, MA: A2 / A1, W: F1 * d1 * 1e-2 };
  }

  /** Vasos: {rho1, rho2, h1, h2, Pint, estable}. */
  vessels() {
    const rho1 = this.liquid(1).rho;
    const rho2 = this.liquid(2).rho;
    const h2 = this.params.h2;
    const h1 = (h2 * rho2) / rho1;
    return { rho1, rho2, h1, h2, Pint: rho2 * G * h2 * 1e-2, estable: rho2 < rho1 };
  }

  update(dt) {
    this.t += dt;
    if (this.params.bombeo) {
      this.press = (1 - Math.cos((2 * Math.PI * this.t) / PUMP_PERIOD)) / 2;
    } else {
      const u = clamp(this.t / PRESS_TIME, 0, 1);
      this.press = u * u * (3 - 2 * u); // suavizado
    }
    const p = clamp(this.t / 1.5, 0, 1);
    this.pour = p * p * (3 - 2 * p);
  }

  /* ---------- interacción directa: arrastrar la sonda ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    if (id !== 'sonda' || this.params.modo !== 'hidrostatica') return;
    const top = this._tankTop();
    const k = TANK_H / this.params.H;
    const h = clamp((top - world.y) / k, 0, this.params.H);
    this.params.h = Math.round(h * 20) / 20;
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    if (this.params.modo === 'pascal') this._drawPress(scene);
    else if (this.params.modo === 'vasos') this._drawVessels(scene);
    else this._drawHydrostatic(scene);
  }

  _tankTop() {
    return -5.5 + TANK_H;
  }

  /** Manómetro de aguja centrado en (x, y): `frac` en [0,1] sobre `max`. */
  _gauge(scene, x, y, r, frac, text) {
    scene.circle(x, y, r, { color: 'textDim', fill: 'hudBg', width: 2 });
    const a0 = Math.PI * 1.2;
    const a1 = -Math.PI * 0.2;
    scene.arc(x, y, r * 0.8, a1, a0, { color: 'textDim', width: 2 });
    for (let k = 0; k <= 8; k++) {
      const ang = a0 + ((a1 - a0) * k) / 8;
      const len = k % 4 === 0 ? 0.22 : 0.12;
      scene.line(x + Math.cos(ang) * r * 0.8, y + Math.sin(ang) * r * 0.8, x + Math.cos(ang) * (r * 0.8 - len), y + Math.sin(ang) * (r * 0.8 - len), {
        color: 'textDim',
        width: 1.2
      });
    }
    const ang = a0 + (a1 - a0) * clamp(frac, 0, 1);
    scene.line(x, y, x + Math.cos(ang) * r * 0.72, y + Math.sin(ang) * r * 0.72, { color: 'force', width: 2.6 });
    scene.circle(x, y, r * 0.09, { color: 'force', fill: 'force', width: 1 });
    scene.label(x, y - r - 0.15, text, { color: 'force', baseline: 'top', avoid: true });
  }

  _drawHydrostatic(scene) {
    const { H, P0 } = this.params;
    const liq = this.liquid();
    const h = this.depth();
    const P = this.pressureAt(h);
    const Pgauge = liq.rho * G * h;
    const k = TANK_H / H; // u por metro
    const cx = -5.5;
    const halfW = 4;
    const bottom = -5.5;
    const top = this._tankTop();
    const wallTop = top + 0.8;

    // Paredes del tanque y líquido.
    scene.line(cx - halfW, wallTop, cx - halfW, bottom, { color: 'textDim', width: 3 });
    scene.line(cx + halfW, wallTop, cx + halfW, bottom, { color: 'textDim', width: 3 });
    scene.line(cx - halfW, bottom, cx + halfW, bottom, { color: 'textDim', width: 3 });
    scene.hatch(cx - halfW, bottom, cx + halfW, bottom, { side: -1, color: 'textDim' });
    scene.fill(cx, top, halfW * 2 - 0.12, TANK_H - 0.06, { color: liq.color, alpha: 0.32, waves: true });
    scene.label(cx, wallTop + 0.55, `${liq.name} · ρ = ${liq.rho} kg/m³ · P₀ = ${P0} kPa`, { color: liq.color, size: 11, avoid: true });

    // Flechas de presión sobre la pared derecha: crecen con la profundidad.
    const nArrows = 6;
    const Pmax = this.pressureAt(H);
    for (let j = 1; j <= nArrows; j++) {
      const hj = (H * j) / nArrows;
      const yj = top - hj * k;
      const len = 0.35 + 2.4 * (this.pressureAt(hj) / Pmax);
      scene.vector(cx + halfW - 0.15 - len, yj, len, 0, { color: 'force', width: 1.8, alpha: 0.8 });
      scene.vector(cx - halfW + 0.15 + len, yj, -len, 0, { color: 'force', width: 1.8, alpha: 0.8 });
    }
    // Flechas en el fondo (presión máxima).
    for (let j = 0; j < 4; j++) {
      const xj = cx - halfW + 1 + ((halfW * 2 - 2) * j) / 3;
      scene.vector(xj, bottom + 0.3 + 1.6, 0, -1.6, { color: 'force', width: 1.8, alpha: 0.8 });
    }

    // Sonda arrastrable y cota de profundidad.
    const ys = top - h * k;
    scene.line(cx - halfW, ys, cx + halfW, ys, { color: 'accent', width: 1, dash: [4, 4], alpha: 0.7 });
    scene.body(cx, ys, { shape: 'circle', r: 0.32, color: 'accent', id: 'sonda' });
    scene.dimension(cx - halfW - 0.9, top, cx - halfW - 0.9, ys, h > 0.05 ? `h = ${roundTo(h, 2)} m` : '', { color: 'accent' });
    scene.dimension(cx + halfW + 0.9, top, cx + halfW + 0.9, bottom, `H = ${H} m`, { color: 'textDim' });
    scene.label(cx + 0.5, ys, `P = ${roundTo(P / 1000, 1)} kPa`, { color: 'accent', align: 'left', baseline: 'middle', avoid: true, offsetY: -12 });

    // Tubo al manómetro y manómetro de aguja (escala 0 … P(H)).
    const gx = 6.2;
    const gy = 3.6;
    scene.line(cx + 0.32, ys, gx - 2.2, ys, { color: 'accent', width: 1.2, dash: [3, 3] });
    scene.line(gx - 2.2, ys, gx - 2.2, gy, { color: 'accent', width: 1.2, dash: [3, 3] });
    scene.line(gx - 2.2, gy, gx - 2.1, gy, { color: 'accent', width: 1.2 });
    this._gauge(scene, gx, gy, 2.1, P / Pmax, `${roundTo(P / 1000, 1)} kPa`);
    scene.label(gx, gy - 2.35, `escala 0 … ${roundTo(Pmax / 1000, 0)} kPa`, { color: 'textDim', size: 10, avoid: true });

    // Gráfica P(h) con la sonda marcada.
    const vp = scene.viewport();
    if (vp.w > 430) {
      for (let j = 0; j <= CURVE_N; j++) {
        const hj = (H * j) / CURVE_N;
        this._curve[j].x = hj;
        this._curve[j].y = this.pressureAt(hj) / 1000;
      }
      this._marker[0].x = h;
      this._marker[0].y = P / 1000;
      scene.hud.plot(
        { x: vp.x + vp.w - 300, y: vp.y + vp.h - 150, w: 288, h: 138 },
        {
          title: 'P(h) = P₀ + ρgh  (kPa vs m)',
          series: [
            { points: this._curve, color: 'force', width: 2, dash: [] },
            { points: this._marker, color: 'accent', pointSize: 4 }
          ],
          xRange: [0, H],
          yRange: [P0, Math.max(Pmax / 1000, P0 + 1)],
          xLabel: 'h (m)',
          yLabel: 'kPa'
        }
      );
    }

    const hud = scene.hud;
    hud.chip(`Hidrostática · ${liq.name} · arrastra la sonda`, 'top-left');
    hud.readout(
      [
        { label: 'h', value: roundTo(h, 2), unit: 'm' },
        { label: 'P', value: roundTo(P / 1000, 2), unit: 'kPa' },
        { label: 'ρgh', value: roundTo(Pgauge / 1000, 2), unit: 'kPa' },
        { label: 'P/P₀', value: P0 > 0 ? roundTo(P / (P0 * 1000), 2) : 0, unit: '' }
      ],
      'bottom-left'
    );
  }

  _drawPress(scene) {
    const { A1, A2, F1, d1 } = this.params;
    const liq = this.liquid();
    const pr = this.press_();
    const s = this.press;
    const r1 = 0.35 + Math.sqrt(A1 / 50) * 1.0;
    const r2 = 0.8 + Math.sqrt(A2 / 1000) * 2.6;
    const x1 = -6;
    const x2 = 4;
    const floor = -6;
    const chanTop = -4.9;
    const level0 = -1;
    const wallTop = 3.6;
    const D1 = d1 * PRESS_K * s;
    const D2 = pr.d2 * PRESS_K * s;
    const y1 = level0 - D1; // cara inferior del pistón pequeño
    const y2 = level0 + D2; // cara inferior del pistón grande

    // Líquido: canal inferior y dos columnas.
    scene.fill((x1 + x2) / 2, chanTop, x2 - x1, chanTop - floor, { color: liq.color, alpha: 0.32, level: false });
    scene.fill(x1, y1, r1 * 2, y1 - floor, { color: liq.color, alpha: 0.32, level: false });
    scene.fill(x2, y2, r2 * 2, y2 - floor, { color: liq.color, alpha: 0.32, level: false });

    // Paredes (cilindros y canal).
    const wall = { color: 'textDim', width: 3 };
    scene.line(x1 - r1, wallTop, x1 - r1, floor, wall);
    scene.line(x1 + r1, wallTop, x1 + r1, chanTop, wall);
    scene.line(x2 - r2, wallTop, x2 - r2, chanTop, wall);
    scene.line(x2 + r2, wallTop, x2 + r2, floor, wall);
    scene.line(x1 - r1, floor, x2 + r2, floor, wall);
    scene.line(x1 + r1, chanTop, x2 - r2, chanTop, wall);
    scene.hatch(x1 - r1, floor, x2 + r2, floor, { side: -1, color: 'textDim' });

    // Pistones.
    scene.rect(x1, y1 + 0.2, r1 * 2 - 0.08, 0.4, { color: 'spring', fill: 'spring', width: 1 });
    scene.line(x1, y1 + 0.4, x1, y1 + 2.2, { color: 'spring', width: 5 });
    scene.rect(x2, y2 + 0.2, r2 * 2 - 0.08, 0.4, { color: 'spring', fill: 'spring', width: 1 });
    // Carga sobre el pistón grande (tamaño ∝ log F₂).
    const loadH = 0.6 + 0.35 * Math.log10(1 + pr.F2);
    scene.rect(x2, y2 + 0.4 + loadH / 2, Math.min(r2 * 2 - 0.3, 3.2), loadH, { color: 'mass', fill: 'mass', alpha: 0.9, width: 1 });
    scene.label(x2, y2 + 0.4 + loadH / 2, 'carga', { color: 'text', size: 11, baseline: 'middle', avoid: true });

    // Fuerzas.
    const len1 = 0.6 + 2.2 * (F1 / 500);
    const len2 = 0.6 + 0.8 * Math.log10(1 + pr.F2);
    if (F1 > 0) {
      scene.vector(x1, y1 + 2.3 + len1, 0, -len1, { color: 'force', width: 2.6, label: `F₁ = ${F1} N`, labelSide: -1 });
      scene.vector(x2, y2 + 0.5 + loadH, 0, len2, { color: 'force', width: 2.6, label: `F₂ = ${roundTo(pr.F2, 0)} N`, labelSide: 1 });
    }

    // Cotas de desplazamiento y áreas.
    if (s > 0.02 && d1 > 0) {
      scene.dimension(x1 - r1 - 0.7, level0, x1 - r1 - 0.7, y1, `d₁ = ${roundTo(d1 * s, 1)} cm`, { color: 'velocity' });
      scene.dimension(x2 + r2 + 0.7, level0, x2 + r2 + 0.7, y2, `d₂ = ${roundTo(pr.d2 * s, 2)} cm`, { color: 'velocity' });
    }
    scene.line(x1 - r1, level0, x2 + r2, level0, { color: 'velocity', width: 1, dash: [3, 4], alpha: 0.6 });
    scene.label(x1, floor + 0.5, `A₁ = ${A1} cm²`, { color: 'textDim', size: 11, avoid: true });
    scene.label(x2, floor + 0.5, `A₂ = ${A2} cm²`, { color: 'textDim', size: 11, avoid: true });
    scene.label((x1 + x2) / 2, (chanTop + floor) / 2, `P = F₁/A₁ = ${roundTo(pr.P / 1000, 1)} kPa en todo el líquido`, {
      color: liq.color,
      size: 11,
      baseline: 'middle',
      avoid: true
    });

    const hud = scene.hud;
    hud.chip(`Pascal · ventaja mecánica A₂/A₁ = ${roundTo(pr.MA, 1)}×`, 'top-left');
    hud.chip(this.params.bombeo ? 'Bombeo continuo' : s < 0.999 ? `Pulsando… ${Math.round(s * 100)} %` : 'Carrera completa', 'top-left');
    hud.readout(
      [
        { label: 'F₂', value: roundTo(pr.F2, 1), unit: 'N' },
        { label: 'd₂', value: roundTo(pr.d2, 3), unit: 'cm' },
        { label: 'P', value: roundTo(pr.P / 1000, 2), unit: 'kPa' },
        { label: 'W = F₁d₁ = F₂d₂', value: roundTo(pr.W, 2), unit: 'J' }
      ],
      'bottom-left'
    );
  }

  _drawVessels(scene) {
    const l1 = this.liquid(1);
    const l2 = this.liquid(2);
    const v = this.vessels();
    const p = this.pour;
    const xL = -4.5;
    const xR = 1.5;
    const arm = 0.9; // semiancho interior
    const bottom = -5.5;
    const chanTop = -3.7;
    const armTop = 6.2;
    const yInt = -1.2; // nivel de la interfaz (brazo derecho)
    const H2 = Math.min(v.h2 * VESSEL_K * p, armTop - yInt - 0.3);
    const H1 = Math.min(v.h1 * VESSEL_K * p, armTop - yInt - 0.3);

    // Líquido 1 (denso): canal, brazo izquierdo hasta yInt + H1, brazo derecho hasta yInt.
    scene.fill((xL + xR) / 2, chanTop, xR - xL, chanTop - bottom, { color: l1.color, alpha: 0.35, level: false });
    scene.fill(xL, yInt + H1, arm * 2, yInt + H1 - bottom, { color: l1.color, alpha: 0.35 });
    scene.fill(xR, yInt, arm * 2, yInt - bottom, { color: l1.color, alpha: 0.35, level: false });
    // Líquido 2 (ligero): columna en el brazo derecho.
    if (H2 > 0.02) scene.fill(xR, yInt + H2, arm * 2, H2, { color: l2.color, alpha: 0.4 });
    scene.line(xR - arm, yInt, xR + arm, yInt, { color: l2.color, width: 2 });

    // Paredes del tubo en U.
    const wall = { color: 'textDim', width: 3 };
    scene.line(xL - arm, armTop, xL - arm, bottom, wall);
    scene.line(xL + arm, armTop, xL + arm, chanTop, wall);
    scene.line(xR - arm, armTop, xR - arm, chanTop, wall);
    scene.line(xR + arm, armTop, xR + arm, bottom, wall);
    scene.line(xL - arm, bottom, xR + arm, bottom, wall);
    scene.line(xL + arm, chanTop, xR - arm, chanTop, wall);

    // Nivel de referencia de la interfaz y puntos A / B.
    scene.line(xL - arm - 2.2, yInt, xR + arm + 2.2, yInt, { color: 'accent', width: 1, dash: [4, 4], alpha: 0.8 });
    scene.circle(xL, yInt, 0.16, { color: 'accent', fill: 'accent', width: 1 });
    scene.circle(xR, yInt, 0.16, { color: 'accent', fill: 'accent', width: 1 });
    scene.label(xL + 0.3, yInt - 0.2, 'A', { color: 'accent', align: 'left', baseline: 'top', avoid: true });
    scene.label(xR + 0.3, yInt - 0.2, 'B', { color: 'accent', align: 'left', baseline: 'top', avoid: true });
    scene.label(xR + arm + 2.3, yInt, 'P_A = P_B', { color: 'accent', align: 'left', baseline: 'middle', avoid: true });

    // Cotas de las columnas.
    if (H1 > 0.05) scene.dimension(xL - arm - 0.9, yInt, xL - arm - 0.9, yInt + H1, `h₁ = ${roundTo(v.h1 * p, 1)} cm`, { color: l1.color });
    if (H2 > 0.05) scene.dimension(xR + arm + 0.9, yInt, xR + arm + 0.9, yInt + H2, `h₂ = ${roundTo(v.h2 * p, 1)} cm`, { color: l2.color });
    scene.label(xL, armTop + 0.5, `${l1.name} · ρ₁ = ${v.rho1}`, { color: l1.color, size: 11, avoid: true });
    scene.label(xR, armTop + 0.5, `${l2.name} · ρ₂ = ${v.rho2}`, { color: l2.color, size: 11, avoid: true });

    // Ecuación con números a la derecha.
    scene.label(7, 2.4, 'ρ₁ · h₁ = ρ₂ · h₂', { color: 'text', avoid: true });
    scene.label(7, 1.5, `${v.rho1} · ${roundTo(v.h1, 1)} = ${v.rho2} · ${v.h2}`, { color: 'textDim', size: 11, avoid: true });
    scene.label(7, 0.6, `h₁/h₂ = ρ₂/ρ₁ = ${roundTo(v.rho2 / v.rho1, 3)}`, { color: 'textDim', size: 11, avoid: true });

    const hud = scene.hud;
    hud.chip(v.estable ? `Vasos comunicantes · ${l2.name} sobre ${l1.name}` : `¡ρ₂ ≥ ρ₁! El segundo líquido se hundiría`, 'top-left', {
      color: v.estable ? undefined : 'warn'
    });
    hud.chip(p < 0.999 ? `Vertiendo… ${Math.round(p * 100)} %` : 'Equilibrio hidrostático', 'top-left');
    hud.readout(
      [
        { label: 'h₁', value: roundTo(v.h1, 2), unit: 'cm' },
        { label: 'h₂', value: roundTo(v.h2, 2), unit: 'cm' },
        { label: 'Δh = h₁ − h₂', value: roundTo(v.h1 - v.h2, 2), unit: 'cm' },
        { label: 'P_int − P₀', value: roundTo(v.Pint, 1), unit: 'Pa' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    if (this.params.modo === 'pascal') {
      const pr = this.press_();
      return {
        'F₂': { value: roundTo(pr.F2, 2), unit: 'N' },
        'd₂': { value: roundTo(pr.d2, 4), unit: 'cm' },
        'P': { value: roundTo(pr.P / 1000, 3), unit: 'kPa' },
        'Ventaja mecánica': { value: roundTo(pr.MA, 3), unit: '' },
        'W': { value: roundTo(pr.W, 3), unit: 'J' },
        'Carrera': { value: roundTo(this.press * 100, 1), unit: '%' }
      };
    }
    if (this.params.modo === 'vasos') {
      const v = this.vessels();
      return {
        'ρ₁': { value: v.rho1, unit: 'kg/m³' },
        'ρ₂': { value: v.rho2, unit: 'kg/m³' },
        'h₁': { value: roundTo(v.h1, 3), unit: 'cm' },
        'h₂': { value: roundTo(v.h2, 3), unit: 'cm' },
        'P_int − P₀': { value: roundTo(v.Pint, 2), unit: 'Pa' },
        'Estable': { value: v.estable ? 'Sí' : 'No', unit: '' }
      };
    }
    const h = this.depth();
    const P = this.pressureAt(h);
    return {
      'ρ': { value: this.liquid().rho, unit: 'kg/m³' },
      'h': { value: roundTo(h, 3), unit: 'm' },
      'P': { value: roundTo(P / 1000, 3), unit: 'kPa' },
      'ρgh': { value: roundTo((this.liquid().rho * G * h) / 1000, 3), unit: 'kPa' },
      'P fondo': { value: roundTo(this.pressureAt(this.params.H) / 1000, 3), unit: 'kPa' }
    };
  }

  getState() {
    return { t: this.t, press: this.press, pour: this.pour, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.press)) this.press = clamp(s.press, 0, 1);
    if (Number.isFinite(s.pour)) this.pour = clamp(s.pour, 0, 1);
  }

  destroy() {
    this.dragging = null;
  }
}
