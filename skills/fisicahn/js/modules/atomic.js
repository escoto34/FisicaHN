/**
 * @fileoverview Física atómica — modelo de Bohr: órbitas cuantizadas, niveles
 * de energía, transiciones con emisión/absorción de fotones y espectro de
 * líneas de átomos hidrogenoides (Z = 1…3).
 *
 * Física: Eₙ = −13,6·Z²/n² eV; en un salto nᵢ → n_f se emite (nᵢ > n_f) o
 * absorbe (nᵢ < n_f) un fotón con ΔE = |E_f − Eᵢ| = hc/λ, λ[nm] = 1240/ΔE[eV].
 * El módulo anima el ciclo completo: el electrón parte de `n`, salta a `nf`
 * emitiendo/absorbiendo el fotón y, pasado un tiempo, vuelve con el proceso
 * inverso. Así un mismo par de niveles enseña emisión y absorción.
 *
 * Tres vistas del mismo estado (`modo`):
 *  - `orbitas`  — átomo de Bohr con las órbitas permitidas y una escalera de
 *                 niveles compacta al lado.
 *  - `niveles`  — diagrama de niveles grande con la flecha de transición.
 *  - `espectro` — serie espectral que termina en `nf` (Lyman, Balmer,
 *                 Paschen…) sobre una tira de λ en escala logarítmica.
 *
 * Escalas visuales declaradas: los radios de órbita crecen ∝ n² pero no a
 * escala del radio de Bohr real, y la escalera de niveles comprime el eje de
 * energía (log) para que n = 4, 5, 6 no se pisen — la etiqueta de cada nivel
 * lleva su energía exacta.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo, clamp, lerp } from '../core/geometry.js';
import { wavelengthColor } from '../core/draw-primitives.js';

/** Constante de Rydberg en eV para el hidrógeno: Eₙ = −13,6·Z²/n². */
const RYDBERG_EV = 13.6;
/** hc en eV·nm: λ = 1240 / ΔE. */
const HC_EV_NM = 1240;
/** h en eV·s / 10¹⁴: f[10¹⁴ Hz] = ΔE[eV] / 0,4136. */
const H_EV_PER_1E14HZ = 0.4136;
const N_MAX = 6;
/** Instante del primer salto tras reset y semiperiodo del ciclo ida/vuelta (s). */
const T_JUMP = 1.2;
const T_HALF_CYCLE = 2.4;
/** Duración del fotón en pantalla y distancia que recorre (unidades de mundo). */
const PHOTON_LIFE = 2.0;
const PHOTON_RANGE = 3.2;
/** Radio máximo al que puede llegar un fotón sin salirse del encuadre. */
const PHOTON_REACH = 9.4;

const SERIES_NAMES = { 1: 'Lyman', 2: 'Balmer', 3: 'Paschen', 4: 'Brackett', 5: 'Pfund', 6: 'Humphreys' };

/** Energía del nivel n para carga nuclear Z (eV). */
function energyEv(n, Z = 1) {
  return (-RYDBERG_EV * Z * Z) / (n * n);
}

/** Radio visual de la órbita n (∝ n² más un margen para el núcleo; no a escala real). */
function radiusWorld(n) {
  return 0.55 + 0.2 * n * n;
}

/** Región del espectro a la que pertenece λ. */
function spectralRegion(nm) {
  if (nm < 380) return 'UV';
  if (nm <= 750) return 'visible';
  return 'IR';
}

export default class AtomicModule extends SimModule {
  /** Las órbitas de n = 6 piden altura; la escalera va a la derecha. */
  static viewport = { width: 26, height: 17 };

  /** El núcleo es el punto fijo del sistema y vive en el origen (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Vista',
      value: 'orbitas',
      options: [
        { value: 'orbitas', label: 'Órbitas de Bohr' },
        { value: 'niveles', label: 'Diagrama de niveles' },
        { value: 'espectro', label: 'Espectro de líneas' }
      ]
    },
    { id: 'n', label: 'Nivel inicial', latex: 'n_i', min: 1, max: N_MAX, step: 1, value: 3 },
    { id: 'nf', label: 'Nivel final', latex: 'n_f', min: 1, max: N_MAX, step: 1, value: 2 },
    { id: 'Z', label: 'Carga nuclear', latex: 'Z', min: 1, max: 3, step: 1, value: 1 },
    { id: 'showPhoton', type: 'checkbox', label: 'Mostrar fotón en los saltos', value: true }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { modo: 'orbitas', n: 3, nf: 2, Z: 1, showPhoton: true };
    this.t = 0;
    /** Reloj del ciclo de transiciones. */
    this.phaseT = 0;
    /** ¿El electrón está en `nf` (ya saltó) o en `n`? */
    this.jumped = false;
    /** Nivel ocupado ahora mismo. */
    this.level = 3;
    this.electronAngle = 0;
    /** Destello del salto (s restantes). */
    this.flashT = 0;
    /** Fotón en vuelo: { t, lambdaNm, deEv, outward, x0, y0, x1, y1 } o null. */
    this.photon = null;
    /** Saltos realizados desde el último reset. */
    this.jumps = 0;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Física atómica',
      blurb:
        meta?.blurb ||
        'Modelo de Bohr: el electrón en órbitas cuantizadas; al cambiar de nivel emite o absorbe un fotón.',
      story:
        'En 1913 Niels Bohr propuso que el electrón del hidrógeno solo puede ocupar órbitas con momento angular cuantizado. Cada salto entre niveles emite o absorbe un fotón de energía exacta, y eso explica las líneas del espectro del hidrógeno: la serie de Balmer (n_f = 2) cae en el visible, Lyman (n_f = 1) en el ultravioleta y Paschen (n_f = 3) en el infrarrojo.',
      cases: [
        'Lámparas de vapor de sodio / mercurio (emisión en longitudes fijas).',
        'Espectro de absorción en la atmósfera solar (líneas de Fraunhofer).',
        'Láseres: transición entre niveles de energía definidos.',
        'Iones hidrogenoides (He⁺, Li²⁺): mismas fórmulas con Z².'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Energía del nivel', formula: 'E_n = -\\dfrac{13{,}6\\,Z^2}{n^2}\\ \\text{eV}', note: 'n = 1, 2, 3… número cuántico principal.' },
        { name: 'Fotón', formula: '\\Delta E = |E_f - E_i| = h f = \\dfrac{hc}{\\lambda}', note: 'Emisión si baja de nivel; absorción si sube.' },
        { name: 'Longitud de onda', formula: '\\lambda[\\text{nm}] = \\dfrac{1240}{\\Delta E[\\text{eV}]}' },
        { name: 'Radio de Bohr', formula: 'r_n \\propto n^2', note: 'Escala visual en la simulación (no a escala real).' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this._normalizeParams();
    this.t = 0;
    this.phaseT = 0;
    this.jumped = false;
    this.level = this.params.n;
    this.electronAngle = 0;
    this.flashT = 0;
    this.photon = null;
    this.jumps = 0;
    this.engine?.reset?.();
  }

  _normalizeParams() {
    const p = this.params;
    p.n = clamp(Math.round(Number(p.n) || 1), 1, N_MAX);
    p.nf = clamp(Math.round(Number(p.nf) || 1), 1, N_MAX);
    p.Z = clamp(Math.round(Number(p.Z) || 1), 1, 3);
    p.showPhoton = p.showPhoton !== false && p.showPhoton !== 'false';
  }

  /* ---------- física ---------- */

  energy(n) {
    return energyEv(n, this.params.Z);
  }

  /** Transición configurada n → nf: ΔE, λ, f y tipo. */
  transition() {
    const { n, nf } = this.params;
    const de = this.energy(nf) - this.energy(n);
    const abs = Math.abs(de);
    const lambda = abs < 1e-9 ? null : HC_EV_NM / abs;
    return {
      deEv: abs,
      lambdaNm: lambda,
      f14: abs / H_EV_PER_1E14HZ,
      outward: de < 0, // emisión
      none: n === nf
    };
  }

  /** Salto del electrón al nivel `to`, con el fotón que corresponde. */
  _jump(to) {
    const from = this.level;
    const de = this.energy(to) - this.energy(from);
    const lambda = HC_EV_NM / Math.max(1e-9, Math.abs(de));
    const rFrom = radiusWorld(from);
    const ux = Math.cos(this.electronAngle);
    const uy = Math.sin(this.electronAngle);
    // El fotón sale (o llega) en dirección radial; se acorta para que no
    // abandone el encuadre en las órbitas exteriores.
    const range = Math.max(1.2, Math.min(PHOTON_RANGE, PHOTON_REACH - rFrom));
    this.level = to;
    this.flashT = 0.5;
    this.jumps++;
    if (this.params.showPhoton) {
      this.photon = {
        t: 0,
        lambdaNm: lambda,
        deEv: Math.abs(de),
        outward: de < 0,
        x0: rFrom * ux,
        y0: rFrom * uy,
        x1: (rFrom + range) * ux,
        y1: (rFrom + range) * uy
      };
    }
  }

  update(dt) {
    this.t += dt;
    const { n, nf } = this.params;
    // Periodo visual más rápido en las órbitas internas (T ∝ n³ en Bohr; aquí ∝ n).
    const omega = 1.2 / Math.max(1, this.level);
    this.electronAngle += omega * dt * 2 * Math.PI;
    if (this.electronAngle > Math.PI * 2) this.electronAngle -= Math.PI * 2;

    if (n !== nf) {
      this.phaseT += dt;
      if (!this.jumped && this.phaseT >= T_JUMP) {
        this._jump(nf);
        this.jumped = true;
      } else if (this.jumped && this.phaseT >= T_JUMP + T_HALF_CYCLE) {
        this._jump(n);
        this.jumped = false;
        this.phaseT -= 2 * T_HALF_CYCLE;
      }
    } else if (this.level !== n) {
      this.level = n;
    }

    if (this.flashT > 0) this.flashT -= dt;
    if (this.photon) {
      this.photon.t += dt;
      if (this.photon.t > PHOTON_LIFE) this.photon = null;
    }
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const modo = this.params.modo;
    if (modo === 'niveles') this._drawLevelsView(scene);
    else if (modo === 'espectro') this._drawSpectrumView(scene);
    else this._drawOrbitsView(scene);
    this._drawHud(scene);
  }

  /** Vista 1: átomo de Bohr con escalera compacta. */
  _drawOrbitsView(scene) {
    const { Z } = this.params;
    const level = this.level;

    for (let n = 1; n <= N_MAX; n++) {
      const r = radiusWorld(n);
      const active = n === level;
      scene.circle(0, 0, r, {
        color: active ? 'mass' : 'textDim',
        width: active ? 2.2 : 1,
        dash: active ? [] : [4, 6],
        alpha: active ? 0.95 : 0.6
      });
      // Etiquetas arriba-izquierda: lejos de la escalera y del rótulo del
      // núcleo (que va debajo), así el anticolisión siempre tiene sitio.
      scene.label(-r * 0.707, r * 0.707, `n=${n}`, {
        color: active ? 'mass' : 'textDim',
        size: 11,
        offsetX: -6,
        offsetY: -4,
        align: 'right',
        avoid: true
      });
    }

    // Núcleo: crece con Z (más protones). Rótulo debajo, para no competir
    // con el del electrón cuando ocupa n = 1.
    const rN = 0.26 + 0.06 * Z;
    scene.body(0, 0, { shape: 'circle', r: rN, color: 'force' });
    scene.label(0, -rN - 0.15, Z === 1 ? 'p⁺' : `núcleo Z=${Z}`, { color: 'force', size: 12, baseline: 'top', avoid: true });

    // Electrón en la órbita ocupada.
    const re = radiusWorld(level);
    const ex = re * Math.cos(this.electronAngle);
    const ey = re * Math.sin(this.electronAngle);
    if (this.flashT > 0) {
      const k = this.flashT / 0.5;
      scene.circle(ex, ey, 0.3 + (1 - k) * 1.2, { color: 'ray', fill: 'ray', alpha: k * 0.5, stroke: false });
    }
    scene.body(ex, ey, { shape: 'circle', r: 0.18, color: 'mass', label: 'e⁻' });

    // Fotón en vuelo (radial): sale en la emisión, llega en la absorción.
    const ph = this.photon;
    if (ph) {
      const k = ph.t / PHOTON_LIFE;
      const u = ph.outward ? k : 1 - k;
      const px = lerp(ph.x0, ph.x1, u);
      const py = lerp(ph.y0, ph.y1, u);
      const ang = Math.atan2(ph.y1 - ph.y0, ph.x1 - ph.x0) + (ph.outward ? 0 : Math.PI);
      const len = 1.1;
      scene.photon(px - Math.cos(ang) * len, py - Math.sin(ang) * len, ang, len, {
        color: wavelengthColor(ph.lambdaNm),
        width: 2.2,
        phase: -ph.t * 12,
        label: `γ ${ph.outward ? 'emitido' : 'absorbido'} · λ = ${roundTo(ph.lambdaNm, 0)} nm`
      });
    }

    this._drawLadder(scene, 8.6, 11.4, -6.5, 6.5, { compact: true });
  }

  /** Vista 2: diagrama de niveles grande. */
  _drawLevelsView(scene) {
    const x0 = -3.5;
    const x1 = 3.5;
    const yBot = -7;
    const yTop = 7;
    this._drawLadder(scene, x0, x1, yBot, yTop, { compact: false });

    const ph = this.photon;
    if (ph) {
      const tr = this.transition();
      const yFrom = this._levelY(this.jumped ? this.params.n : this.params.nf, yBot, yTop);
      const yTo = this._levelY(this.level, yBot, yTop);
      const yMid = (yFrom + yTo) / 2;
      const k = ph.t / PHOTON_LIFE;
      const xStart = x1 + 0.8;
      const travel = 3.8;
      const len = 1.4;
      const x = ph.outward ? xStart + k * travel : xStart + travel - k * travel;
      const ang = ph.outward ? 0 : Math.PI;
      scene.photon(ph.outward ? x : x + len, yMid, ang, len, {
        color: wavelengthColor(ph.lambdaNm),
        width: 2.4,
        amplitude: 0.16,
        phase: -ph.t * 12,
        label: `hf = ${roundTo(ph.deEv, 2)} eV · λ = ${roundTo(ph.lambdaNm, 0)} nm${tr.lambdaNm ? ` (${spectralRegion(ph.lambdaNm)})` : ''}`
      });
    }
  }

  /** Vista 3: serie espectral con n_f como nivel final. */
  _drawSpectrumView(scene) {
    const { nf, n } = this.params;
    // Escalera a la izquierda, con hueco para sus etiquetas (≈3 u) hasta el borde.
    const x0 = -7.6;
    const x1 = -4.2;
    const yBot = -1.5;
    const yTop = 7;
    this._drawLadder(scene, x0, x1, yBot, yTop, { compact: true, seriesTo: nf });

    // Tira de longitudes de onda en escala logarítmica.
    const sx0 = -10.5;
    const sx1 = 10.5;
    const yb = -6.4;
    const yt = -4.8;
    const lamMin = 80;
    const lamMax = 2500;
    const xOf = (lam) => sx0 + ((sx1 - sx0) * Math.log(lam / lamMin)) / Math.log(lamMax / lamMin);
    const cy = (yb + yt) / 2;
    const h = yt - yb;
    scene.rect((sx0 + sx1) / 2, cy, sx1 - sx0, h, { color: 'textDim', fill: 'textDim', alpha: 0.18, width: 1 });
    // Banda visible coloreada por tramos (el color lleva λ; los ticks dan el número).
    const SLICES = 30;
    for (let i = 0; i < SLICES; i++) {
      const la = 380 + ((750 - 380) * i) / SLICES;
      const lb = 380 + ((750 - 380) * (i + 1)) / SLICES;
      const xa = xOf(la);
      const xb = xOf(lb);
      scene.rect((xa + xb) / 2, cy, xb - xa + 0.02, h * 0.92, {
        fill: wavelengthColor((la + lb) / 2),
        color: wavelengthColor((la + lb) / 2),
        stroke: false,
        alpha: 0.8
      });
    }
    scene.label(xOf(190), cy, 'UV', { color: 'text', size: 10, baseline: 'middle', avoid: true });
    scene.label(xOf(540), cy, 'visible', { color: 'text', size: 10, baseline: 'middle', avoid: true });
    scene.label(xOf(1500), cy, 'IR', { color: 'text', size: 10, baseline: 'middle', avoid: true });
    for (const tick of [100, 200, 400, 700, 1000, 2000]) {
      const x = xOf(tick);
      scene.line(x, yb, x, yb - 0.25, { color: 'axis', width: 1 });
      scene.label(x, yb - 0.35, `${tick}`, { color: 'textDim', size: 10, baseline: 'top', avoid: true });
    }
    scene.label(0, yb - 1.25, 'λ (nm) — escala logarítmica', { color: 'textDim', size: 11, baseline: 'top', avoid: true });

    // Líneas de la serie n_i → n_f (n_i = n_f+1 … 7).
    let row = 0;
    for (let ni = nf + 1; ni <= N_MAX + 1; ni++) {
      const de = Math.abs(this.energy(nf) - this.energy(ni));
      const lam = HC_EV_NM / de;
      if (lam < lamMin || lam > lamMax) continue;
      const x = xOf(lam);
      const current = ni === n;
      const color = wavelengthColor(lam);
      scene.line(x, yb - 0.05, x, yt + 0.05, { color, width: current ? 3.5 : 2 });
      if (ni <= N_MAX) {
        scene.label(x, yt + 0.15 + (row % 2) * 0.45, `${ni}→${nf}: ${roundTo(lam, 0)} nm`, {
          color: current ? 'text' : 'textDim',
          size: 10,
          weight: current ? '600' : '',
          avoid: true
        });
        row++;
      }
      if (current) {
        // Triángulo apuntando a la línea (polígono en mundo: sin rotaciones).
        scene.polygon(
          [
            { x, y: yb - 0.3 },
            { x: x - 0.22, y: yb - 0.7 },
            { x: x + 0.22, y: yb - 0.7 }
          ],
          { color: 'mass', fill: 'mass', fillAlpha: 0.9, width: 1 }
        );
      }
    }
    scene.label(xOf(lamMax) - 0.2, yTop - 0.2, `Serie de ${SERIES_NAMES[nf]} (n_f = ${nf})`, {
      color: 'text',
      size: 13,
      weight: '600',
      align: 'right',
      avoid: true
    });
    scene.label(xOf(lamMax) - 0.2, yTop - 1.0, 'Cada línea es un salto n_i → n_f; el triángulo marca n_i = n', {
      color: 'textDim',
      size: 11,
      align: 'right',
      avoid: true
    });
  }

  /** Altura de un nivel en la escalera (eje de energía comprimido en log). */
  _levelY(n, yBot, yTop) {
    if (!Number.isFinite(n)) return yTop;
    const f = Math.log(n) / Math.log(N_MAX + 1.5);
    return yBot + (yTop - yBot) * f;
  }

  /**
   * Escalera de niveles Eₙ entre x0..x1 e yBot..yTop. `compact` pone una sola
   * etiqueta por nivel a la izquierda; `seriesTo` dibuja las flechas de la
   * serie que termina en ese nivel (vista espectro).
   */
  _drawLadder(scene, x0, x1, yBot, yTop, opts = {}) {
    const { n, nf } = this.params;
    const level = this.level;
    const compact = opts.compact !== false;
    const xm = (x0 + x1) / 2;
    const tr = this.transition();

    for (let k = 1; k <= N_MAX + 1; k++) {
      const nn = k > N_MAX ? Infinity : k;
      const y = this._levelY(nn, yBot, yTop);
      const isCur = nn === level;
      const isPair = nn === n || nn === nf;
      const E = nn === Infinity ? 0 : this.energy(nn);
      scene.line(x0, y, x1, y, {
        color: isCur ? 'mass' : isPair ? 'energy' : 'textDim',
        width: isCur ? 2.6 : isPair ? 2 : 1.2,
        dash: isCur || isPair ? [] : [5, 4]
      });
      const nText = nn === Infinity ? 'n=∞' : `n=${nn}`;
      const eText = nn === Infinity ? '0 eV (ionizado)' : `${roundTo(E, 2)} eV`;
      if (compact) {
        scene.label(x0 - 0.2, y, `${nText} · ${eText}`, {
          color: isCur ? 'mass' : isPair ? 'energy' : 'textDim',
          size: 10,
          align: 'right',
          baseline: 'middle',
          avoid: true
        });
      } else {
        scene.label(x0 - 0.2, y, nText, {
          color: isCur ? 'mass' : isPair ? 'energy' : 'textDim',
          size: 12,
          align: 'right',
          baseline: 'middle',
          avoid: true
        });
        scene.label(x1 + 0.2, y, eText, {
          color: isCur ? 'mass' : 'textDim',
          size: 11,
          align: 'left',
          baseline: 'middle',
          avoid: true
        });
      }
    }

    // Flechas de la serie espectral (todas terminan en seriesTo).
    if (opts.seriesTo) {
      const yf = this._levelY(opts.seriesTo, yBot, yTop);
      let j = 0;
      for (let ni = opts.seriesTo + 1; ni <= N_MAX; ni++) {
        const yi = this._levelY(ni, yBot, yTop);
        const lam = HC_EV_NM / Math.abs(this.energy(opts.seriesTo) - this.energy(ni));
        const xa = x0 + (x1 - x0) * (0.2 + 0.13 * j);
        scene.vector(xa, yi, 0, yf - yi, { color: wavelengthColor(lam), width: ni === n ? 2.4 : 1.3 });
        j++;
      }
    }

    // Flecha de la transición configurada n → nf (en la vista espectro ya va en la serie).
    if (!tr.none && !opts.seriesTo) {
      const ya = this._levelY(n, yBot, yTop);
      const yb = this._levelY(nf, yBot, yTop);
      const xa = x0 + (x1 - x0) * 0.72;
      scene.vector(xa, ya, 0, yb - ya, {
        color: 'energy',
        width: 2.2,
        label: `ΔE = ${roundTo(tr.deEv, 2)} eV`,
        labelSide: tr.outward ? -1 : 1
      });
    }

    // Electrón sobre el nivel ocupado.
    const ye = this._levelY(level, yBot, yTop);
    const xe = x0 + (x1 - x0) * 0.35;
    if (this.flashT > 0) {
      const k = this.flashT / 0.5;
      scene.circle(xe, ye, 0.25 + (1 - k) * 0.8, { color: 'ray', fill: 'ray', alpha: k * 0.5, stroke: false });
    }
    scene.body(xe, ye, { shape: 'circle', r: compact ? 0.16 : 0.22, color: 'mass', label: compact ? '' : 'e⁻' });
    scene.label(xm, yTop + 0.55, compact ? 'Niveles Eₙ (eje comprimido)' : 'Energía Eₙ (eje comprimido)', {
      color: 'textDim',
      size: compact ? 10 : 11,
      avoid: true
    });
  }

  _drawHud(scene) {
    const hud = scene.hud;
    const { n, nf } = this.params;
    const tr = this.transition();
    const E = this.energy(this.level);
    hud.chip(`Electrón en n = ${this.level} · E = ${roundTo(E, 2)} eV`, 'top-left', { color: 'mass' });
    if (tr.none) {
      hud.chip('Elige n_i ≠ n_f para ver una transición', 'top-left', { color: 'textDim' });
    } else {
      const kind = tr.outward ? 'Emisión' : 'Absorción';
      hud.chip(`${kind} ${n} → ${nf}: λ = ${roundTo(tr.lambdaNm, 0)} nm (${spectralRegion(tr.lambdaNm)})`, 'top-left', {
        color: 'energy'
      });
    }
    hud.readout(
      [
        { label: 'E(nᵢ)', value: this.energy(n), unit: 'eV' },
        { label: 'E(n_f)', value: this.energy(nf), unit: 'eV' },
        { label: 'ΔE', value: tr.deEv, unit: 'eV' },
        { label: 'λ', value: tr.lambdaNm == null ? '—' : roundTo(tr.lambdaNm, 0), unit: 'nm' }
      ],
      'bottom-left'
    );
    if (this.params.modo === 'orbitas') {
      hud.legend(
        [
          { color: 'mass', label: 'órbita ocupada', dash: [] },
          { color: 'textDim', label: 'órbitas permitidas', dash: [4, 6] },
          { color: 'ray', label: 'fotón (γ), color = λ', dash: [2, 2] }
        ],
        'bottom-right'
      );
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const { n, nf, Z } = this.params;
    const tr = this.transition();
    return {
      'n inicial': { value: n, unit: '' },
      'n final': { value: nf, unit: '' },
      'nivel actual': { value: this.level, unit: '' },
      Z: { value: Z, unit: '' },
      'E(nᵢ)': { value: roundTo(this.energy(n), 3), unit: 'eV' },
      'E(n_f)': { value: roundTo(this.energy(nf), 3), unit: 'eV' },
      ΔE: { value: roundTo(tr.deEv, 3), unit: 'eV' },
      λ: { value: tr.lambdaNm == null ? 0 : roundTo(tr.lambdaNm, 1), unit: 'nm' },
      f: { value: roundTo(tr.f14, 3), unit: '×10¹⁴ Hz' },
      tipo: { value: tr.none ? '—' : tr.outward ? 'emisión' : 'absorción', unit: '' },
      saltos: { value: this.jumps, unit: '' }
    };
  }

  getState() {
    return {
      t: this.t,
      phaseT: this.phaseT,
      jumped: this.jumped,
      level: this.level,
      electronAngle: this.electronAngle,
      flashT: this.flashT,
      jumps: this.jumps,
      photon: this.photon ? { ...this.photon } : null,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    this._normalizeParams();
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.phaseT)) this.phaseT = s.phaseT;
    if (typeof s.jumped === 'boolean') this.jumped = s.jumped;
    this.level = Number.isFinite(s.level) ? clamp(Math.round(s.level), 1, N_MAX) : this.params.n;
    if (Number.isFinite(s.electronAngle)) this.electronAngle = s.electronAngle;
    if (Number.isFinite(s.flashT)) this.flashT = s.flashT;
    if (Number.isFinite(s.jumps)) this.jumps = s.jumps;
    this.photon = s.photon && typeof s.photon === 'object' ? { ...s.photon } : null;
  }

  destroy() {
    this.photon = null;
  }
}
