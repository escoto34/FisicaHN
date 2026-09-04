/**
 * @fileoverview Lentes delgadas — diagrama de rayos (convergente / divergente).
 *
 * Migrado a `SimModule` + `draw(scene)`. La lente está en x = 0 (su centro
 * óptico es el `anchor`), el objeto a la izquierda y la luz viaja hacia la
 * derecha. La misma ecuación 1/f = 1/d₀ + 1/dᵢ vale para las seis siluetas
 * de libro (biconvexa/bicóncava, plano-convexa/plano-cóncava, menisco ±):
 * `forma` elige el dibujo con `scene.lens` y la excentricidad se deriva de
 * |f| con `lensBulgeFromFocal` (lente fuerte → caras muy curvas).
 *
 * Los tres rayos principales se prolongan hasta el borde del encuadre con
 * `rayExitToRect`; las prolongaciones virtuales van discontinuas. La gráfica
 * dᵢ(d₀) del HUD enseña la asíntota en d₀ = f: por qué el objeto «en el foco»
 * no forma imagen.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo, clamp, rayExitToRect } from '../core/geometry.js';
import { lensBulgeFromFocal } from '../core/draw-primitives.js';

/** Recuadro (mundo) al que se recortan los rayos: cabe con margen en el viewbox. */
const BOX = { left: -10.6, right: 10.6, top: 6.4, bottom: -6.4 };
/** Semialtura de la lente dibujada. */
const LENS_H = 3.4;
/** Silueta por forma y tipo. */
const LENS_TYPE = {
  bi: { convergente: 'biconvex', divergente: 'biconcave' },
  plano: { convergente: 'plano-convex', divergente: 'plano-concave' },
  menisco: { convergente: 'meniscus-convex', divergente: 'meniscus-concave' }
};
const FORMA_LABEL = {
  bi: { convergente: 'Biconvexa', divergente: 'Bicóncava' },
  plano: { convergente: 'Plano-convexa', divergente: 'Plano-cóncava' },
  menisco: { convergente: 'Menisco convergente', divergente: 'Menisco divergente' }
};
/** Rango de d₀ del esquema, compartido con la gráfica dᵢ(d₀). */
const DO_MIN = 1.2;
const DO_MAX = 10;
const DI_CLAMP = 14;

export default class LensesModule extends SimModule {
  static viewport = { width: 22, height: 13 };

  /** Centro óptico de la lente: fijo en el origen (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'tipo',
      type: 'select',
      label: 'Tipo de lente',
      value: 'convergente',
      options: [
        { value: 'convergente', label: 'Convergente (+f) — concentra' },
        { value: 'divergente', label: 'Divergente (−f) — dispersa' }
      ]
    },
    {
      id: 'forma',
      type: 'select',
      label: 'Forma de la lente',
      value: 'bi',
      options: [
        { value: 'bi', label: 'Biconvexa / bicóncava' },
        { value: 'plano', label: 'Plano-convexa / plano-cóncava' },
        { value: 'menisco', label: 'Menisco (gafas)' }
      ]
    },
    { id: 'f', label: 'Distancia focal', latex: '|f|', unit: 'u', min: 1, max: 6, step: 0.1, value: 2.5 },
    { id: 'do', label: 'Distancia del objeto', latex: 'd_0', unit: 'u', min: DO_MIN, max: DO_MAX, step: 0.1, value: 5 },
    { id: 'ho', label: 'Altura del objeto', latex: 'h_0', unit: 'u', min: 0.4, max: 3, step: 0.1, value: 1.5 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { tipo: 'convergente', forma: 'bi', f: 2.5, do: 5, ho: 1.5 };
    this.t = 0;
    /** Imagen para el estado actual (se reescribe en `_recompute`). */
    this.im = { f: 2.5, di: 0, M: 0, hi: 0, real: true, atFocus: false };
    /** Curva dᵢ(d₀) en dos ramas (antes y después de la asíntota d₀ = f). */
    this.curveA = [];
    this.curveB = [];
    this._curveKey = null;
    this._dot = [{ x: 0, y: 0 }];
    this._asymptote = [
      { x: 0, y: -DI_CLAMP },
      { x: 0, y: DI_CLAMP }
    ];
    /** Punto de trabajo para recortar rayos sin allocar. */
    this._p = { x: 0, y: 0 };
    this.dragging = null;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Lentes delgadas',
      blurb:
        meta?.blurb ||
        'Formación de imagen con lente delgada: 1/f = 1/d₀ + 1/dᵢ y los tres rayos principales.',
      story:
        'La lente está en x = 0. El objeto (flecha azul) está a la izquierda; puedes arrastrar su punta. Los rayos se refractan en la lente y forman una imagen real (al otro lado, trazo continuo) o virtual (mismo lado, trazo discontinuo). Convergente concentra; divergente dispersa.',
      cases: [
        'Lupa: objeto entre lente y F → imagen virtual ampliada (mismo lado).',
        'Proyector: objeto fuera de 2F → imagen real invertida al otro lado.',
        'Miopía: lente divergente (f < 0) para alejar el foco.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Lente delgada', formula: '1/f = 1/d₀ + 1/dᵢ' },
        { name: 'Aumento lateral', formula: 'M = hᵢ/h₀ = −dᵢ/d₀' },
        { name: 'Potencia (dioptrías)', formula: 'P = 1/f', note: 'f en metros en la fórmula SI.' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this._recompute();
    this.engine?.reset?.();
  }

  /** Focal con signo: + convergente, − divergente. */
  fSigned() {
    return this.params.tipo === 'convergente' ? this.params.f : -this.params.f;
  }

  lensType() {
    return LENS_TYPE[this.params.forma]?.[this.params.tipo] || 'biconvex';
  }

  /** Imagen para (f, d₀); escribe en `this.im`. */
  _recompute() {
    const f = this.fSigned();
    const d0 = this.params.do;
    const im = this.im;
    im.f = f;
    if (Math.abs(d0 - f) < 1e-6) {
      im.di = Infinity;
      im.M = Infinity;
      im.hi = Infinity;
      im.real = false;
      im.atFocus = true;
    } else {
      im.di = 1 / (1 / f - 1 / d0);
      im.M = -im.di / d0;
      im.hi = im.M * this.params.ho;
      im.real = im.di > 0;
      im.atFocus = false;
    }
    if (f !== this._curveKey) {
      this._curveKey = f;
      this.curveA = [];
      this.curveB = [];
      const N = 80;
      for (let i = 0; i <= N; i++) {
        const d = DO_MIN + ((DO_MAX - DO_MIN) * i) / N;
        if (Math.abs(d - f) < 1e-9) continue;
        const di = clamp(1 / (1 / f - 1 / d), -DI_CLAMP, DI_CLAMP);
        (d < f ? this.curveA : this.curveB).push({ x: d, y: di });
      }
      this._asymptote[0].x = f;
      this._asymptote[1].x = f;
    }
    this._dot[0].x = d0;
    this._dot[0].y = im.atFocus ? DI_CLAMP : clamp(im.di, -DI_CLAMP, DI_CLAMP);
  }

  update(dt) {
    this.t += dt;
    this._recompute();
  }

  /* ---------- manipulación directa: arrastrar la punta del objeto ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    if (id !== 'objeto') return;
    this.params.do = roundTo(clamp(-world.x, DO_MIN, DO_MAX), 1);
    this.params.ho = roundTo(clamp(world.y, 0.4, 3), 1);
    this._recompute();
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    const { do: d0, ho, f: fAbs } = this.params;
    const f = this.fSigned();
    const conv = f > 0;
    const im = this.im;
    const b = scene.world();
    const ox = -d0;
    const oy = ho;

    // Lado del objeto / lado de la imagen: dos tintes muy suaves (la información
    // la llevan las etiquetas F, F', O y las flechas, no el color).
    scene.rect(b.left / 2, 0, -b.left, b.top - b.bottom, { fill: 'rayAlt', stroke: false, alpha: 0.035 });
    scene.rect(b.right / 2, 0, b.right, b.top - b.bottom, { fill: 'force', stroke: false, alpha: 0.035 });

    // Eje óptico con sentido de la luz.
    scene.line(b.left, 0, b.right, 0, { color: 'axis', width: 1.4, dash: [7, 5] });
    scene.vector(b.right - 1.6, 0, 1.1, 0, { color: 'textDim', width: 1.4 });
    scene.label(b.right - 0.3, -0.2, 'eje óptico', { align: 'right', baseline: 'top', size: 11, color: 'textDim', avoid: true });

    // Lente: silueta según forma/tipo, curvatura según |f|.
    scene.lens(0, 0, 2 * LENS_H, {
      type: this.lensType(),
      bulge: lensBulgeFromFocal(fAbs, 3),
      halfWidth: 0.9,
      color: 'mass',
      fill: 'mass',
      fillAlpha: 0.2,
      width: 2.6
    });

    // Focos, 2F y centro óptico.
    this._focus(scene, f, 'F');
    this._focus(scene, -f, "F'");
    if (conv && 2 * fAbs < BOX.right) {
      scene.circle(2 * f, 0, 0.08, { fill: 'mass2', color: 'mass2', alpha: 0.7 });
      scene.circle(-2 * f, 0, 0.08, { fill: 'mass2', color: 'mass2', alpha: 0.7 });
      scene.label(2 * f, 0.2, '2F', { color: 'mass2', size: 10, avoid: true });
      scene.label(-2 * f, 0.2, "2F'", { color: 'mass2', size: 10, avoid: true });
    }
    scene.circle(0, 0, 0.1, { fill: 'text', color: 'text' });
    scene.label(0.25, -0.2, 'O', { align: 'left', baseline: 'top', size: 11, color: 'textDim', avoid: true });

    // —— Rayos principales (prolongaciones virtuales primero, debajo).
    // R1: paralelo al eje → sale por F (convergente) o como si viniera de F.
    if (conv) {
      // Objeto dentro de F: la prolongación hacia atrás pasa por la imagen virtual.
      if (!im.real && !im.atFocus) this._dashed(scene, 0, oy, im.di, im.hi, 'energy');
    } else {
      // Divergente: el rayo emerge como si viniera de F (a la izquierda).
      this._dashed(scene, 0, oy, f, 0, 'energy');
    }
    this._solid(scene, ox, oy, 0, oy, 'energy');
    this._emerge(scene, 0, oy, conv ? f : -f, conv ? -oy : oy, 'energy');

    // R2: por el centro óptico, sin desviarse.
    this._solid(scene, ox, oy, 0, 0, 'accel');
    this._emerge(scene, 0, 0, d0, -oy, 'accel');
    if (!im.real && !im.atFocus && im.di < ox && Math.abs(im.hi) < 40) {
      // Imagen virtual más lejos que el objeto: prolongación hacia atrás.
      this._dashed(scene, ox, oy, im.di, im.hi, 'accel');
    }

    // R3: por F' antes de la lente → sale paralelo (sólo convergente, objeto fuera de F).
    let r3 = false;
    if (conv && d0 > fAbs + 0.15) {
      const yL = (-oy * f) / (d0 - f);
      if (Math.abs(yL) < LENS_H - 0.2) {
        r3 = true;
        this._solid(scene, ox, oy, 0, yL, 'warn');
        this._emerge(scene, 0, yL, 1, 0, 'warn');
      }
    }

    // —— Objeto (arrastrable) e imagen.
    scene.vector(ox, 0, 0, oy, { color: 'rayAlt', width: 3.2 });
    scene.body(ox, oy, { shape: 'circle', r: 0.16, color: 'rayAlt', id: 'objeto', glow: false });
    scene.label(ox, oy + 0.3, 'Objeto', { color: 'rayAlt', weight: '700', avoid: true });

    const imgVisible =
      Number.isFinite(im.di) && Math.abs(im.di) < BOX.right && Math.abs(im.hi) < BOX.top;
    if (imgVisible) {
      scene.vector(im.di, 0, 0, im.hi, { color: 'force', width: 3.2, dash: im.real ? undefined : [5, 4] });
      const up = im.hi >= 0;
      scene.label(im.di, im.hi + (up ? 0.3 : -0.3), im.real ? 'Imagen real' : 'Imagen virtual', {
        color: 'force',
        weight: '700',
        baseline: up ? 'bottom' : 'top',
        avoid: true
      });
    }

    // —— HUD.
    const hud = scene.hud;
    const formaLabel = FORMA_LABEL[this.params.forma]?.[this.params.tipo] || '';
    hud.chip(`${formaLabel} · ${conv ? 'CONVERGENTE (+f)' : 'DIVERGENTE (−f)'}`, 'top-left', { color: 'mass' });
    if (im.atFocus) hud.chip('Objeto en F: rayos paralelos, sin imagen finita', 'top-left', { color: 'warn' });
    else if (!imgVisible) hud.chip(`Imagen fuera del encuadre (dᵢ = ${roundTo(im.di, 1)} u)`, 'top-left', { color: 'warn' });
    else
      hud.chip(
        `${im.real ? 'Imagen real' : 'Imagen virtual'} · ${im.M < 0 ? 'invertida' : 'derecha'} · ${Math.abs(im.M) >= 1 ? 'mayor' : 'menor'} (M = ${roundTo(im.M, 2)})`,
        'top-left',
        { color: 'force' }
      );

    hud.readout(
      [
        { label: 'f', value: f, unit: 'u' },
        { label: 'd₀', value: d0, unit: 'u' },
        { label: 'dᵢ', value: Number.isFinite(im.di) ? im.di : '∞', unit: Number.isFinite(im.di) ? 'u' : '' },
        { label: 'M', value: Number.isFinite(im.M) ? im.M : '∞', unit: '' }
      ],
      'bottom-left'
    );

    const legend = [
      { color: 'energy', label: '∥ al eje → por F', dash: [] },
      { color: 'accel', label: 'Por el centro O', dash: [] }
    ];
    if (r3) legend.push({ color: 'warn', label: "Por F' → sale ∥", dash: [] });
    legend.push({ color: 'rayAlt', label: 'Objeto', dash: [] });
    legend.push({ color: 'force', label: im.real || im.atFocus ? 'Imagen' : 'Imagen (virtual)', dash: im.real ? [] : [5, 4] });
    hud.legend(legend, 'bottom-right');

    // Gráfica dᵢ(d₀): la asíntota en d₀ = f es el «objeto en el foco».
    const vp = scene.viewport();
    if (vp.w > 420) {
      const series = [
        { points: this.curveA, color: 'force', dash: [] },
        { points: this.curveB, color: 'force', dash: [] }
      ];
      if (conv) series.push({ points: this._asymptote, color: 'mass2', dash: [4, 3], width: 1.2 });
      series.push({ points: this._dot, color: 'rayAlt', pointSize: 4 });
      hud.plot(
        { x: vp.x + vp.w - 210, y: vp.y + 12, w: 195, h: 116 },
        { title: 'dᵢ frente a d₀', series, xRange: [DO_MIN, DO_MAX], yRange: [-DI_CLAMP, DI_CLAMP] }
      );
    }
  }

  /** Marca de foco (rombo) con etiqueta debajo. */
  _focus(scene, x, text) {
    const d = 0.17;
    scene.polygon(
      [
        { x, y: d },
        { x: x + d, y: 0 },
        { x, y: -d },
        { x: x - d, y: 0 }
      ],
      { fill: 'mass2', fillAlpha: 1, color: 'mass2', width: 1 }
    );
    scene.label(x, -0.22, text, { color: 'mass2', weight: '700', size: 12, baseline: 'top', avoid: true });
  }

  /** Tramo real de rayo entre dos puntos, con flecha intermedia. */
  _solid(scene, x0, y0, x1, y1, color) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    scene.ray(x0, y0, Math.atan2(dy, dx), len, { color, width: 2.2 });
  }

  /** Rayo que emerge de la lente en (x, y) con dirección (dx, dy) hasta el borde. */
  _emerge(scene, x, y, dx, dy, color) {
    const end = rayExitToRect(x, y, dx, dy, BOX, this._p);
    this._solid(scene, x, y, end.x, end.y, color);
  }

  /** Prolongación virtual (discontinua, sin flecha), recortada al encuadre. */
  _dashed(scene, x0, y0, x1, y1, color) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const end = rayExitToRect(x0, y0, dx, dy, BOX, this._p);
    const lenBox = Math.hypot(end.x - x0, end.y - y0);
    const len = Math.min(Math.hypot(dx, dy), lenBox);
    if (len < 1e-6) return;
    const a = Math.atan2(dy, dx);
    scene.line(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, { color, width: 1.6, dash: [6, 5], alpha: 0.6 });
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    const im = this.im;
    const fin = (v, d) => (Number.isFinite(v) ? roundTo(v, d) : null);
    return {
      'f (con signo)': { value: roundTo(im.f, 2), unit: 'u' },
      'd₀': { value: roundTo(this.params.do, 2), unit: 'u' },
      'h₀': { value: roundTo(this.params.ho, 2), unit: 'u' },
      'dᵢ': { value: fin(im.di, 3), unit: 'u' },
      'M': { value: fin(im.M, 3), unit: '' },
      'hᵢ': { value: fin(im.hi, 3), unit: 'u' },
      'P = 1/f': { value: roundTo(1 / im.f, 3), unit: '1/u' },
      'Imagen real': { value: im.real ? 1 : 0, unit: '(1 = sí)' }
    };
  }

  getState() {
    return { t: this.t, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    this._recompute();
  }

  destroy() {
    this.curveA = [];
    this.curveB = [];
    this.dragging = null;
  }
}
