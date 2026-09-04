/**
 * @fileoverview Efecto fotoeléctrico — K_max = hf − φ y frecuencia umbral.
 *
 * Fotones de energía hf (f en 10¹⁴ Hz; h·10¹⁴ Hz = 0,414 eV) viajan desde la
 * fuente hasta la superficie de un metal con función de trabajo φ. Cada fotón
 * se absorbe en la superficie: si hf > φ arranca un electrón con energía
 * cinética máxima K_max = hf − φ (rapidez ∝ √K); si hf ≤ φ no sale nada por
 * intensa que sea la luz. La intensidad solo cambia el número de fotones por
 * segundo (y por tanto de electrones), nunca K_max — el argumento de
 * Einstein de 1905.
 *
 * El color de cada fotón es el de su longitud de onda λ = c/f (rojo → violeta
 * → UV), acompañado por la etiqueta hf en el HUD para que el color no sea el
 * único portador de la información. La gráfica K_max–f del lienzo muestra la
 * recta de Einstein con pendiente h y corte f₀ = φ/h, y el punto de trabajo.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../core/geometry.js';
import { wavelengthColor } from '../core/draw-primitives.js';

/** Función de trabajo (eV) de metales de referencia. */
const METALS = { Na: 2.3, K: 2.0, Cu: 4.7, Zn: 4.3 };
/** h·10¹⁴ Hz en eV: E[eV] = 0,414 · f[10¹⁴ Hz]. */
const H_EFF = 0.414;
/** λ[nm] = c/f = 3000 / f[10¹⁴ Hz]. */
const C_NM_PER_1E14HZ = 3000;
/** Rango del slider de f (también el dominio de la gráfica). */
const F_MIN = 2;
const F_MAX = 15;

/** Placa metálica: su superficie iluminada (cara derecha) está en x = 0 (§17.1). */
const METAL = { left: -1.8, right: 0, top: 2.4, bottom: -2.4 };
/** Fuente de luz y rapidez de los fotones (todos a c: la intensidad no la cambia). */
const SOURCE_X = -8.6;
const PHOTON_SPEED = 5.5;
/** Límite de vuelo de los electrones (unidades de mundo). */
const X_LIMIT = 9.5;
const Y_LIMIT = 5.5;

export default class PhotoelectricModule extends SimModule {
  static viewport = { width: 22, height: 13 };

  /** La superficie del metal (donde se absorben los fotones) es el punto fijo. */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'metal',
      type: 'select',
      label: 'Metal',
      value: 'Na',
      options: [
        ...Object.entries(METALS).map(([m, phi]) => ({ value: m, label: `${m} (φ = ${phi} eV)` })),
        { value: 'manual', label: 'Manual (usar φ del control)' }
      ]
    },
    { id: 'f', label: 'Frecuencia', latex: 'f', unit: '×10¹⁴ Hz', min: F_MIN, max: F_MAX, step: 0.1, value: 8 },
    { id: 'intensidad', label: 'Intensidad', latex: 'I', min: 0.05, max: 1, step: 0.05, value: 0.6 },
    { id: 'phi', label: 'Función de trabajo (manual)', latex: '\\varphi', unit: 'eV', min: 1, max: 6, step: 0.1, value: 3 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { metal: 'Na', f: 8, intensidad: 0.6, phi: 3 };
    this.t = 0;
    /** Fotones en vuelo: { x, y, absorbed, life }. */
    this.photons = [];
    /** Electrones emitidos: { x, y, vx, vy, life }. */
    this.electrons = [];
    /** Acumulador de emisión de fotones (tasa = 10·I por segundo). */
    this.spawnAcc = 0;
    /** Contadores desde el último reset. */
    this.photonsAbsorbed = 0;
    this.electronsEmitted = 0;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Efecto fotoeléctrico',
      blurb: meta?.blurb || 'Fotones sobre un metal: emisión solo si hf > φ; K_max = hf − φ.',
      story:
        'Einstein explicó el efecto fotoeléctrico con cuantos de luz: cada fotón entrega toda su energía hf a un solo electrón. Por eso existe una frecuencia umbral f₀ = φ/h por debajo de la cual no sale ningún electrón, por intensa que sea la luz; y por eso la intensidad cambia cuántos electrones salen, pero no su energía máxima. Los fotones se absorben en la superficie del metal, no lo atraviesan.',
      cases: [
        'Células fotoeléctricas y sensores de luz.',
        'Por qué la luz roja no arranca electrones en ciertos metales y la violeta sí.',
        'Gráfica K_max vs f: pendiente h, corte f₀ = φ/h (medida de Millikan, 1916).'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Einstein', formula: 'K_{max} = h f - \\varphi' },
        { name: 'Frecuencia umbral', formula: 'f_0 = \\varphi / h', note: 'Con f en 10¹⁴ Hz: h ≈ 0,414 eV por unidad.' },
        { name: 'Potencial de frenado', formula: 'e V_0 = K_{max}' },
        { name: 'Longitud de onda', formula: '\\lambda = c / f' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.photons.length = 0;
    this.electrons.length = 0;
    this.spawnAcc = 0;
    this.photonsAbsorbed = 0;
    this.electronsEmitted = 0;
    this.engine?.reset?.();
  }

  /* ---------- física ---------- */

  /** φ efectiva: la del metal elegido, o la manual. */
  phi() {
    const m = this.params.metal;
    return m === 'manual' || !(m in METALS) ? Number(this.params.phi) : METALS[m];
  }

  photonE() {
    return H_EFF * this.params.f;
  }

  kMax() {
    return this.photonE() - this.phi();
  }

  f0() {
    return this.phi() / H_EFF;
  }

  lambdaNm() {
    return C_NM_PER_1E14HZ / Math.max(this.params.f, 1e-6);
  }

  /** Fotones por segundo que llegan a la placa. */
  photonRate() {
    return this.params.intensidad * 10;
  }

  update(dt) {
    this.t += dt;
    const K = this.kMax();
    const above = K > 0;
    const spread = (METAL.top - METAL.bottom) * 0.85;

    // Emisión de fotones a tasa fija (∝ intensidad), altura aleatoria.
    this.spawnAcc += dt * this.photonRate();
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.photons.push({ x: SOURCE_X + 0.6, y: (Math.random() - 0.5) * spread, absorbed: false, life: 4 });
    }

    // Vuelo y absorción en la superficie (no atraviesan la placa).
    for (let i = 0; i < this.photons.length; i++) {
      const p = this.photons[i];
      if (p.absorbed) {
        p.life -= dt * 3;
        continue;
      }
      p.x += PHOTON_SPEED * dt;
      if (p.x >= METAL.right - 0.05) {
        p.x = METAL.right - 0.05;
        p.absorbed = true;
        p.life = 0.25;
        this.photonsAbsorbed++;
        if (above) {
          const speed = Math.sqrt(2 * K) * 0.9;
          this.electrons.push({
            x: METAL.right + 0.08,
            y: p.y + (Math.random() - 0.5) * 0.15,
            vx: 1.2 + speed,
            vy: (Math.random() - 0.5) * 0.9,
            life: 2.5
          });
          this.electronsEmitted++;
        }
      }
    }
    // Compactación in situ (§3.2): sin `filter()` por frame.
    let pw = 0;
    for (let i = 0; i < this.photons.length; i++) {
      const p = this.photons[i];
      if (p.life > 0) {
        if (pw !== i) this.photons[pw] = p;
        pw++;
      }
    }
    this.photons.length = pw;

    for (let i = 0; i < this.electrons.length; i++) {
      const e = this.electrons[i];
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.life -= dt;
      if (e.x < METAL.right) {
        e.x = METAL.right;
        e.vx = Math.abs(e.vx);
      }
    }
    let ew = 0;
    for (let i = 0; i < this.electrons.length; i++) {
      const e = this.electrons[i];
      if (e.life > 0 && e.x < X_LIMIT && e.y < Y_LIMIT && e.y > -Y_LIMIT) {
        if (ew !== i) this.electrons[ew] = e;
        ew++;
      }
    }
    this.electrons.length = ew;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const phi = this.phi();
    const E = this.photonE();
    const K = E - phi;
    const above = K > 0;
    const lam = this.lambdaNm();
    const photonColor = wavelengthColor(lam);
    const metalName = this.params.metal === 'manual' ? 'metal (φ manual)' : this.params.metal;

    // Fuente de luz y cono del haz.
    scene.polygon(
      [
        { x: SOURCE_X + 0.4, y: 0.5 },
        { x: METAL.right - 0.1, y: METAL.top * 0.9 },
        { x: METAL.right - 0.1, y: METAL.bottom * 0.9 },
        { x: SOURCE_X + 0.4, y: -0.5 }
      ],
      { fill: photonColor, fillAlpha: 0.08, stroke: false }
    );
    scene.body(SOURCE_X, 0, { shape: 'rect', r: 0.45, w: 0.8, h: 1.4, color: 'spring', label: 'fuente de luz' });
    scene.label(SOURCE_X, -1.15, `λ = ${roundTo(lam, 0)} nm`, { color: photonColor, size: 11, avoid: true });

    // Placa metálica: cuerpo rayado (sólido) y superficie iluminada resaltada.
    const cx = (METAL.left + METAL.right) / 2;
    const w = METAL.right - METAL.left;
    const h = METAL.top - METAL.bottom;
    scene.rect(cx, 0, w, h, { color: 'spring', fill: 'spring', alpha: 0.45, width: 1.5 });
    scene.hatch(METAL.left, METAL.top, METAL.left, METAL.bottom, { color: 'spring', side: -1, spacing: 10, length: 8 });
    scene.line(METAL.right, METAL.top, METAL.right, METAL.bottom, { color: 'ray', width: 3.5 });
    scene.label(cx, 0.15, metalName, { color: 'text', size: 13, weight: '600', avoid: true });
    scene.label(cx, -0.45, `φ = ${roundTo(phi, 2)} eV`, { color: 'text', size: 11, avoid: true });
    scene.label(METAL.right + 0.15, METAL.top + 0.15, 'superficie', { color: 'ray', size: 10, align: 'left', avoid: true });

    // Fotones: garabato del color de λ; al absorberse se encogen y apagan.
    for (let i = 0; i < this.photons.length; i++) {
      const p = this.photons[i];
      if (p.absorbed) {
        const a = Math.max(0, p.life / 0.25);
        scene.circle(p.x, p.y, 0.08 + (1 - a) * 0.18, { color: photonColor, fill: photonColor, alpha: a * 0.8, stroke: false });
      } else {
        scene.photon(p.x - 0.8, p.y, 0, 0.8, {
          color: photonColor,
          width: 2,
          amplitude: 0.1,
          waves: 2.5,
          phase: -this.t * 14
        });
      }
    }

    // Electrones emitidos (solo a la derecha de la superficie).
    for (let i = 0; i < this.electrons.length; i++) {
      const e = this.electrons[i];
      scene.body(e.x, e.y, { shape: 'circle', r: 0.14, color: 'field', glow: false });
    }
    // Vector K_max de referencia junto a la superficie: crece con f, no con I.
    if (above) {
      const len = Math.min(3.2, 0.9 + Math.sqrt(2 * K) * 0.55);
      scene.vector(METAL.right + 0.2, METAL.bottom - 0.6, len, 0, {
        color: 'field',
        width: 2,
        label: `K_max = ${roundTo(K, 2)} eV`,
        labelSide: 1
      });
    } else {
      scene.label(METAL.right + 0.3, METAL.bottom - 0.9, 'hf ≤ φ: ningún electrón sale', {
        color: 'danger',
        size: 11,
        align: 'left',
        avoid: true
      });
    }

    this._drawHud(scene, { phi, E, K, above, photonColor });
  }

  _drawHud(scene, s) {
    const hud = scene.hud;
    const f = this.params.f;
    hud.chip(
      s.above
        ? `Emisión: hf = ${roundTo(s.E, 2)} eV > φ = ${roundTo(s.phi, 2)} eV`
        : `Sin emisión: hf = ${roundTo(s.E, 2)} eV ≤ φ = ${roundTo(s.phi, 2)} eV`,
      'top-left',
      { color: s.above ? 'energy' : 'danger' }
    );
    hud.readout(
      [
        { label: 'f', value: f, unit: '×10¹⁴ Hz' },
        { label: 'f₀', value: this.f0(), unit: '×10¹⁴ Hz' },
        { label: 'K_max', value: Math.max(0, s.K), unit: 'eV' },
        { label: 'V₀', value: Math.max(0, s.K), unit: 'V' },
        { label: 'e⁻', value: this.electronsEmitted, unit: '' }
      ],
      'bottom-left'
    );
    hud.legend(
      [
        { color: s.photonColor, label: `fotón, hf = ${roundTo(s.E, 2)} eV`, dash: [] },
        { color: 'field', label: 'electrón e⁻ (rapidez ∝ √K)', dash: [1, 3] }
      ],
      'top-right'
    );

    // Gráfica K_max–f: recta de Einstein y punto de trabajo.
    const vp = scene.viewport();
    if (vp.w > 420) {
      const thr = this.f0();
      const kTop = Math.max(1, H_EFF * F_MAX - 1);
      const series = [];
      if (thr < F_MAX) {
        series.push({
          points: [
            { x: Math.max(F_MIN, thr), y: Math.max(0, H_EFF * Math.max(F_MIN, thr) - s.phi) },
            { x: F_MAX, y: H_EFF * F_MAX - s.phi }
          ],
          color: 'energy',
          width: 2.2,
          dash: []
        });
      }
      if (thr > F_MIN) {
        series.push({
          points: [
            { x: F_MIN, y: 0 },
            { x: Math.min(thr, F_MAX), y: 0 }
          ],
          color: 'danger',
          width: 2.2,
          dash: [4, 3]
        });
      }
      series.push({ points: [{ x: f, y: Math.max(0, s.K) }], color: 'warn', pointSize: 4 });
      hud.plot(
        { x: vp.x + vp.w - 232, y: vp.y + vp.h - 150, w: 218, h: 138 },
        {
          title: `K_max (eV) vs f (10¹⁴ Hz) · f₀ = ${roundTo(thr, 2)}`,
          series,
          xRange: [F_MIN, F_MAX],
          yRange: [0, kTop]
        }
      );
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const phi = this.phi();
    const E = this.photonE();
    const K = E - phi;
    return {
      metal: { value: this.params.metal === 'manual' ? 'manual' : this.params.metal, unit: '' },
      φ: { value: roundTo(phi, 2), unit: 'eV' },
      f: { value: this.params.f, unit: '×10¹⁴ Hz' },
      λ: { value: roundTo(this.lambdaNm(), 0), unit: 'nm' },
      hf: { value: roundTo(E, 3), unit: 'eV' },
      'f₀': { value: roundTo(this.f0(), 3), unit: '×10¹⁴ Hz' },
      'K_max': { value: roundTo(Math.max(0, K), 3), unit: 'eV' },
      'V₀': { value: roundTo(Math.max(0, K), 3), unit: 'V' },
      'fotones/s': { value: roundTo(this.photonRate(), 2), unit: '' },
      'e⁻ emitidos': { value: this.electronsEmitted, unit: '' },
      emisión: { value: K > 0 ? 'sí' : 'no (hf ≤ φ)', unit: '' }
    };
  }

  getState() {
    return {
      t: this.t,
      spawnAcc: this.spawnAcc,
      photonsAbsorbed: this.photonsAbsorbed,
      electronsEmitted: this.electronsEmitted,
      params: { ...this.params },
      electrons: this.electrons.map((e) => ({ ...e })),
      photons: this.photons.map((p) => ({ ...p }))
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.spawnAcc)) this.spawnAcc = s.spawnAcc;
    if (Number.isFinite(s.photonsAbsorbed)) this.photonsAbsorbed = s.photonsAbsorbed;
    if (Number.isFinite(s.electronsEmitted)) this.electronsEmitted = s.electronsEmitted;
    this.electrons = Array.isArray(s.electrons) ? s.electrons.map((e) => ({ ...e })) : [];
    this.photons = Array.isArray(s.photons) ? s.photons.map((p) => ({ ...p })) : [];
  }

  destroy() {
    this.photons.length = 0;
    this.electrons.length = 0;
  }
}
