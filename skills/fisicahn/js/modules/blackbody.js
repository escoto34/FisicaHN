/**
 * @fileoverview Cuerpo negro y espectro térmico — ley de Planck, Wien y
 * Stefan–Boltzmann.
 *
 * Todo cuerpo caliente emite luz; **cuánta** y de **qué color** depende
 * solo de su temperatura. El módulo dibuja la radiancia espectral de Planck
 * B(λ, T) sobre un eje λ de 100 nm a 3 µm con la banda visible coloreada
 * (violeta → rojo) y las zonas UV e IR, marca el pico de Wien λ_max = b/T,
 * calcula la potencia radiada P = σ·A·T⁴ y pinta el «objeto» con el color
 * aproximado de un cuerpo negro a esa temperatura (rojo oscuro → naranja →
 * blanco → azulado) con un halo proporcional a su intensidad.
 *
 * Modos:
 * - `espectro`: la curva de Planck con presets (brasa, bombilla, Sol, Sirio…).
 * - `clasico-vs-planck`: añade la curva clásica de Rayleigh–Jeans, que se
 *   dispara hacia el ultravioleta (la «catástrofe ultravioleta» de 1900).
 * - `estrellas`: clasificación espectral O-B-A-F-G-K-M con estrellas de
 *   ejemplo sobre una escala de temperatura.
 *
 * Los colores del espectro y del objeto son literales CSS calculados de la
 * física (longitud de onda y temperatura), no tokens del tema: aquí el color
 * ES la magnitud que se enseña, y siempre va acompañado de etiquetas y cotas.
 */

import { SimModule } from '../core/sim-module.js';
import { clamp, roundTo } from '../core/geometry.js';

/* ---------- constantes físicas (SI) ---------- */
const H = 6.62607015e-34;
const C = 2.99792458e8;
const KB = 1.380649e-23;
const WIEN_B = 2.897771955e-3;
const SIGMA = 5.670374419e-8;

/** Eje λ del espectro (nm). */
const LAM_MIN = 100;
const LAM_MAX = 3000;
const VIS_MIN = 380;
const VIS_MAX = 750;
/** Muestras de la curva. */
const N_CURVE = 140;

/** Marco del espectro en unidades de mundo. */
const PX0 = -10;
const PX1 = 4.5;
const PY0 = -4.5;
const PY1 = 4.2;
/** Esfera («el objeto»). */
const STAR = { x: 7.9, y: 1.2, r: 1.5 };
/** Partículas de luz emitidas (reciclado, sin asignaciones por frame). */
const N_PHOTONS = 22;

const PRESETS = {
  personalizado: null,
  brasa: { T: 1000, label: 'Brasa de leña' },
  bombilla: { T: 2700, label: 'Bombilla incandescente' },
  betelgeuse: { T: 3500, label: 'Betelgeuse' },
  sol: { T: 5778, label: 'Sol' },
  sirio: { T: 9940, label: 'Sirio A' },
  rigel: { T: 12000, label: 'Rigel' }
};

/** Clases espectrales (límite inferior de T en K, de más fría a más caliente). */
const SPECTRAL = [
  { cls: 'M', tMin: 2500, desc: 'roja, fría' },
  { cls: 'K', tMin: 3700, desc: 'naranja' },
  { cls: 'G', tMin: 5200, desc: 'amarilla (como el Sol)' },
  { cls: 'F', tMin: 6000, desc: 'blanco-amarillenta' },
  { cls: 'A', tMin: 7500, desc: 'blanca' },
  { cls: 'B', tMin: 10000, desc: 'blanco-azulada' },
  { cls: 'O', tMin: 30000, desc: 'azul, muy caliente' }
];
/** Escala de la franja de clasificación (K, logarítmica). */
const STRIP_TMIN = 2500;
const STRIP_TMAX = 40000;
const EXAMPLE_STARS = [
  { name: 'Próxima Cen', T: 3050 },
  { name: 'Betelgeuse', T: 3500 },
  { name: 'Arturo', T: 4290 },
  { name: 'Sol', T: 5778 },
  { name: 'Proción', T: 6530 },
  { name: 'Sirio', T: 9940 },
  { name: 'Rigel', T: 12100 },
  { name: 'Spica', T: 25000 }
];

/** Radiancia espectral de Planck, W·sr⁻¹·m⁻³ (λ en m). */
function planck(lam, T) {
  const x = (H * C) / (lam * KB * T);
  if (x > 700) return 0;
  return (2 * H * C * C) / (lam ** 5 * Math.expm1(x));
}

/** Ley clásica de Rayleigh–Jeans (λ en m). */
function rayleighJeans(lam, T) {
  return (2 * C * KB * T) / lam ** 4;
}

/**
 * Color aproximado de un cuerpo negro (algoritmo de Tanner Helland, válido
 * de 1000 K a 40 000 K). Por debajo de 1000 K se oscurece el rojo profundo.
 * @param {number} T @param {number[]} out - [r, g, b] en 0..255
 */
function blackbodyRGB(T, out) {
  const t = clamp(T, 1000, 40000) / 100;
  let r;
  let g;
  let b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const dim = T < 1000 ? clamp((T - 450) / 550, 0.08, 1) : 1;
  out[0] = Math.round(clamp(r, 0, 255) * dim);
  out[1] = Math.round(clamp(g, 0, 255) * dim);
  out[2] = Math.round(clamp(b, 0, 255) * dim);
  return out;
}

/** Nombre del color aproximado para las etiquetas y el readout. */
function colorName(T) {
  if (T < 800) return 'casi invisible (solo IR)';
  if (T < 1500) return 'rojo oscuro';
  if (T < 2500) return 'rojo-anaranjado';
  if (T < 3800) return 'naranja';
  if (T < 5000) return 'amarillo-anaranjado';
  if (T < 6500) return 'blanco-amarillento';
  if (T < 8000) return 'blanco';
  if (T < 11000) return 'blanco-azulado';
  return 'azul-blanco';
}

/** Color aproximado de una longitud de onda visible (nm) → 'rgb(r,g,b)'. */
function wavelengthColor(nm) {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) {
    r = -(nm - 440) / 60;
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / 65;
  } else {
    r = 1;
  }
  // Atenuación en los extremos de la banda visible.
  let f = 1;
  if (nm < 420) f = 0.35 + (0.65 * (nm - 380)) / 40;
  else if (nm > 700) f = 0.35 + (0.65 * (750 - nm)) / 50;
  return `rgb(${Math.round(255 * r * f)},${Math.round(255 * g * f)},${Math.round(255 * b * f)})`;
}

function spectralClass(T) {
  let cur = SPECTRAL[0];
  for (const s of SPECTRAL) if (T >= s.tMin) cur = s;
  return cur;
}

export default class Blackbody extends SimModule {
  static viewport = { width: 22, height: 13 };

  /** Punto fijo: el centro del marco del espectro, que no se mueve (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'espectro',
      options: [
        { value: 'espectro', label: 'Espectro de Planck' },
        { value: 'clasico-vs-planck', label: 'Clásico vs Planck (catástrofe UV)' },
        { value: 'estrellas', label: 'Estrellas y clase espectral' }
      ]
    },
    {
      id: 'preset',
      type: 'select',
      label: 'Objeto',
      value: 'personalizado',
      options: [
        { value: 'personalizado', label: 'Personalizado (usar T)' },
        { value: 'brasa', label: 'Brasa de leña (1000 K)' },
        { value: 'bombilla', label: 'Bombilla incandescente (2700 K)' },
        { value: 'betelgeuse', label: 'Betelgeuse (3500 K)' },
        { value: 'sol', label: 'Sol (5778 K)' },
        { value: 'sirio', label: 'Sirio A (9940 K)' },
        { value: 'rigel', label: 'Rigel (12 000 K)' }
      ]
    },
    { id: 'T', label: 'Temperatura', latex: 'T', unit: 'K', min: 300, max: 12000, step: 10, value: 5778 },
    { id: 'A', label: 'Área emisora', latex: 'A', unit: 'm²', min: 0.01, max: 10, step: 0.01, value: 1 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { modo: 'espectro', preset: 'personalizado', T: 5778, A: 1 };
    this.t = 0;
    /** Temperatura animada: sigue suavemente a la objetivo para que color y curva no salten. */
    this.Tanim = 5778;
    this.pulse = 0;
    /** Curvas en coordenadas de mundo (arrays planos reutilizados). */
    this.curve = new Array(N_CURVE * 2).fill(0);
    this.curveRJ = new Array(N_CURVE * 2).fill(0);
    /** Altura relativa (0..1) de la curva de Planck en cada muestra. */
    this.rel = new Float64Array(N_CURVE);
    this._curveT = -1;
    this._rgb = [255, 255, 255];
    this._visCacheT = -1;
    this._visFrac = 0;
    /** Puntos para `hud.plot` (reutilizados). */
    this.plotPts = Array.from({ length: N_CURVE }, () => ({ x: 0, y: 0 }));
    this.photons = Array.from({ length: N_PHOTONS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
    this._spawnAcc = 0;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Cuerpo negro y espectro térmico',
      blurb:
        meta?.blurb ||
        'Espectro de Planck B(λ,T), ley de Wien λ_max = b/T y ley de Stefan–Boltzmann P = σAT⁴. El objeto cambia de color con T.',
      story:
        'Un hierro al rojo, el filamento de una bombilla y la superficie del Sol emiten luz por estar calientes. En 1900 Planck ' +
        'explicó la forma exacta de ese espectro proponiendo que la energía se intercambia en paquetes E = hf: fue el nacimiento ' +
        'de la física cuántica. La física clásica (Rayleigh–Jeans) predecía energía infinita en el ultravioleta, la «catástrofe ' +
        'ultravioleta», y la medida la desmentía.',
      cases: [
        'Termómetros infrarrojos y cámaras térmicas: miden T por la radiación emitida.',
        'Color de las estrellas: las rojas son frías (≈3000 K) y las azules, muy calientes (>10 000 K).',
        'Bombilla incandescente (2700 K): la mayor parte de su energía se va en infrarrojo, por eso calienta más que ilumina.',
        'Fondo cósmico de microondas: un cuerpo negro casi perfecto a 2,7 K.'
      ]
    });
    this.setModuleFormulas({
      items: [
        {
          name: 'Ley de Planck',
          formula: 'B(\\lambda, T) = \\dfrac{2hc^2}{\\lambda^5}\\,\\dfrac{1}{e^{hc/(\\lambda k_B T)} - 1}'
        },
        { name: 'Ley de Wien', formula: '\\lambda_{max} = \\dfrac{b}{T},\\quad b = 2{,}898\\times10^{-3}\\ \\text{m·K}' },
        { name: 'Stefan–Boltzmann', formula: 'P = \\sigma A T^4,\\quad \\sigma = 5{,}67\\times10^{-8}\\ \\text{W·m}^{-2}\\text{K}^{-4}' },
        { name: 'Rayleigh–Jeans (clásica)', formula: 'B_{RJ}(\\lambda, T) = \\dfrac{2 c k_B T}{\\lambda^4}', note: 'Diverge cuando λ → 0.' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.pulse = 0;
    this.Tanim = this.targetT();
    this._curveT = -1;
    for (const p of this.photons) p.life = 0;
    this._spawnAcc = 0;
    this.engine?.reset?.();
  }

  /* ---------- física ---------- */

  /** Temperatura objetivo: la del preset elegido o la del control T. */
  targetT() {
    const p = PRESETS[this.params.preset];
    return p ? p.T : clamp(this.params.T, 300, 12000);
  }

  /** λ_max de Wien en nm. */
  wienPeakNm(T = this.Tanim) {
    return (WIEN_B / T) * 1e9;
  }

  /** Potencia radiada P = σAT⁴ (W). */
  power(T = this.Tanim) {
    return SIGMA * this.params.A * T ** 4;
  }

  /** Fracción de la potencia emitida dentro de la banda visible (380–750 nm). */
  visibleFraction(T = this.Tanim) {
    const key = Math.round(T);
    if (key === this._visCacheT) return this._visFrac;
    const steps = 74;
    const dl = ((VIS_MAX - VIS_MIN) / steps) * 1e-9;
    let sum = 0;
    for (let i = 0; i <= steps; i++) {
      const lam = (VIS_MIN + ((VIS_MAX - VIS_MIN) * i) / steps) * 1e-9;
      const w = i === 0 || i === steps ? 0.5 : 1;
      sum += w * planck(lam, T);
    }
    const total = (SIGMA * T ** 4) / Math.PI;
    this._visCacheT = key;
    this._visFrac = total > 0 ? clamp((sum * dl) / total, 0, 1) : 0;
    return this._visFrac;
  }

  /** Mundo ← λ (nm) dentro del marco del espectro. */
  lamToX(nm) {
    return PX0 + ((nm - LAM_MIN) / (LAM_MAX - LAM_MIN)) * (PX1 - PX0);
  }

  /** Recalcula las curvas si la temperatura animada cambió. */
  _recompute(T) {
    if (Math.abs(T - this._curveT) < 0.5) return;
    this._curveT = T;
    const peakNm = this.wienPeakNm(T);
    let peak = 0;
    const tmp = this.rel;
    for (let i = 0; i < N_CURVE; i++) {
      const nm = LAM_MIN + ((LAM_MAX - LAM_MIN) * i) / (N_CURVE - 1);
      const v = planck(nm * 1e-9, T);
      tmp[i] = v;
      if (v > peak) peak = v;
    }
    // Normaliza al pico real (dentro del eje) o al máximo muestreado.
    if (peakNm >= LAM_MIN && peakNm <= LAM_MAX) peak = Math.max(peak, planck(peakNm * 1e-9, T));
    const scale = peak > 0 ? 1 / peak : 0;
    const top = PY1 - PY0 - 0.5;
    for (let i = 0; i < N_CURVE; i++) {
      const nm = LAM_MIN + ((LAM_MAX - LAM_MIN) * i) / (N_CURVE - 1);
      const r = tmp[i] * scale;
      tmp[i] = r;
      const x = this.lamToX(nm);
      this.curve[i * 2] = x;
      this.curve[i * 2 + 1] = PY0 + r * top;
      const rj = Math.min(rayleighJeans(nm * 1e-9, T) * scale, 1.15);
      this.curveRJ[i * 2] = x;
      this.curveRJ[i * 2 + 1] = PY0 + rj * top;
      this.plotPts[i].x = nm;
      this.plotPts[i].y = r;
    }
    blackbodyRGB(T, this._rgb);
  }

  /** Factor 0..1 de «brillo» perceptual para halos y fotones (escala logarítmica en T). */
  intensity(T = this.Tanim) {
    return clamp((Math.log10(T) - Math.log10(300)) / (Math.log10(12000) - Math.log10(300)), 0, 1);
  }

  update(dt) {
    this.t += dt;
    this.pulse += dt;
    const target = this.targetT();
    this.Tanim += (target - this.Tanim) * Math.min(1, dt * 4);
    if (Math.abs(target - this.Tanim) < 0.5) this.Tanim = target;
    this._recompute(this.Tanim);

    // Fotones emitidos: más frecuentes cuanto más caliente; reciclado en sitio.
    const i = this.intensity();
    this._spawnAcc += dt * (1 + 11 * i);
    for (const p of this.photons) {
      if (p.life > 0) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (Math.hypot(p.x - STAR.x, p.y - STAR.y) > STAR.r * 1.9) p.life = 0;
      } else if (this._spawnAcc >= 1 && i > 0.05) {
        this._spawnAcc -= 1;
        // Ángulo determinista a partir del tiempo: sin Math.random en física.
        const a = (this.t * 7.3 + p.x * 3.1) % (Math.PI * 2);
        p.x = STAR.x + Math.cos(a) * STAR.r;
        p.y = STAR.y + Math.sin(a) * STAR.r;
        p.vx = Math.cos(a) * 2.2;
        p.vy = Math.sin(a) * 2.2;
        p.life = 1.2;
      }
    }
    if (this._spawnAcc > 3) this._spawnAcc = 3;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    this._recompute(this.Tanim);
    if (this.params.modo === 'estrellas') this.drawStrip(scene);
    else this.drawSpectrum(scene);
    this.drawStar(scene);
    this.drawHud(scene);
  }

  drawSpectrum(scene) {
    const T = this.Tanim;
    const classic = this.params.modo === 'clasico-vs-planck';
    const top = PY1 - PY0 - 0.5;
    const rel = this.rel;
    const nmAt = (i) => LAM_MIN + ((LAM_MAX - LAM_MIN) * i) / (N_CURVE - 1);
    const relAt = (nm) => {
      const u = ((nm - LAM_MIN) / (LAM_MAX - LAM_MIN)) * (N_CURVE - 1);
      const i0 = clamp(Math.floor(u), 0, N_CURVE - 1);
      const i1 = Math.min(i0 + 1, N_CURVE - 1);
      const f = u - i0;
      return rel[i0] * (1 - f) + rel[i1] * f;
    };

    // Marco y ejes.
    scene.rect((PX0 + PX1) / 2, (PY0 + PY1) / 2, PX1 - PX0, PY1 - PY0, { color: 'hudBorder', width: 1, stroke: true });
    scene.line(PX0, PY0, PX1, PY0, { color: 'axis', width: 1.5 });
    scene.line(PX0, PY0, PX0, PY1, { color: 'axis', width: 1.5 });

    // Área bajo la curva: UV (violeta tenue), visible (colores reales), IR (rojo tenue).
    const slice = (nm0, nm1, count, fillFn, alpha) => {
      const w = (nm1 - nm0) / count;
      for (let k = 0; k < count; k++) {
        const nm = nm0 + w * (k + 0.5);
        const hgt = relAt(nm) * top;
        if (hgt < 0.01) continue;
        const x = this.lamToX(nm);
        const wu = (w / (LAM_MAX - LAM_MIN)) * (PX1 - PX0);
        scene.rect(x, PY0 + hgt / 2, wu * 1.02, hgt, { fill: fillFn(nm), color: fillFn(nm), stroke: false, alpha });
      }
    };
    slice(LAM_MIN, VIS_MIN, 14, () => 'accel', 0.16);
    slice(VIS_MIN, VIS_MAX, 30, wavelengthColor, 0.85);
    slice(VIS_MAX, LAM_MAX, 44, () => 'force', 0.12);

    // Banda visible marcada también en el eje (forma, no solo color).
    scene.line(this.lamToX(VIS_MIN), PY0, this.lamToX(VIS_MIN), PY1, { color: 'textDim', width: 1, dash: [3, 4] });
    scene.line(this.lamToX(VIS_MAX), PY0, this.lamToX(VIS_MAX), PY1, { color: 'textDim', width: 1, dash: [3, 4] });
    scene.label((this.lamToX(LAM_MIN) + this.lamToX(VIS_MIN)) / 2, PY1 - 0.25, 'UV', { color: 'accel', size: 11, avoid: true });
    scene.label((this.lamToX(VIS_MIN) + this.lamToX(VIS_MAX)) / 2, PY1 - 0.25, 'visible', { color: 'text', size: 11, avoid: true });
    scene.label((this.lamToX(VIS_MAX) + this.lamToX(LAM_MAX)) / 2, PY1 - 0.25, 'infrarrojo', { color: 'force', size: 11, avoid: true });

    // Curvas.
    if (classic) scene.polyline(this.curveRJ, { color: 'danger', width: 2, dash: [7, 5] });
    scene.polyline(this.curve, { color: 'ray', width: 2.6, glow: true });

    // Marcas del eje λ.
    for (let nm = 500; nm <= LAM_MAX; nm += 500) {
      const x = this.lamToX(nm);
      scene.line(x, PY0, x, PY0 - 0.18, { color: 'axis', width: 1 });
      scene.label(x, PY0 - 0.28, `${nm}`, { color: 'textDim', size: 10, baseline: 'top' });
    }
    scene.label(PX1 + 1.0, PY0 - 0.28, 'λ (nm)', { color: 'textDim', size: 10, baseline: 'top', align: 'left', avoid: true });
    scene.label(PX0 + 0.15, PY1 + 0.2, 'Radiancia espectral B(λ,T), normalizada al pico', {
      color: 'textDim', size: 11, align: 'left', baseline: 'bottom', avoid: true
    });

    // Pico de Wien: marcador móvil sobre la curva.
    const peakNm = this.wienPeakNm(T);
    if (peakNm <= LAM_MAX) {
      const px = this.lamToX(Math.max(peakNm, LAM_MIN));
      const py = PY0 + relAt(peakNm) * top;
      scene.line(px, PY0, px, py, { color: 'ray', width: 1.2, dash: [4, 4] });
      scene.body(px, py, { shape: 'circle', r: 0.14, color: 'ray', glow: true, label: `λ_max = ${roundTo(peakNm, 0)} nm` });
    } else {
      scene.vector(PX1 - 1.6, PY0 + 0.7, 1.3, 0, { color: 'ray', width: 2 });
      scene.label(PX1 - 0.4, PY0 + 1.0, `λ_max = ${roundTo(peakNm / 1000, 2)} µm (IR, fuera del eje)`, {
        color: 'ray', size: 11, align: 'right', baseline: 'bottom', avoid: true
      });
    }

    if (classic) {
      // Dónde se sale la curva clásica por arriba: la «catástrofe».
      let iExit = -1;
      for (let i = N_CURVE - 1; i >= 0; i--) {
        if (this.curveRJ[i * 2 + 1] >= PY0 + top * 1.1) {
          iExit = i;
          break;
        }
      }
      if (iExit >= 0) {
        scene.label(this.curveRJ[iExit * 2] + 0.3, PY1 - 0.9, 'Rayleigh–Jeans → ∞', {
          color: 'danger', size: 11, align: 'left', baseline: 'top', avoid: true
        });
      }
      const nmMark = nmAt(Math.round(N_CURVE * 0.55));
      scene.label(this.lamToX(nmMark), PY0 + relAt(nmMark) * top + 0.35, 'Planck (medida real)', {
        color: 'ray', size: 11, avoid: true
      });
    }
  }

  drawStrip(scene) {
    const T = this.Tanim;
    const y0 = 1.4;
    const y1 = 2.4;
    const logSpan = Math.log10(STRIP_TMAX) - Math.log10(STRIP_TMIN);
    const xOf = (t) => PX0 + ((Math.log10(clamp(t, STRIP_TMIN, STRIP_TMAX)) - Math.log10(STRIP_TMIN)) / logSpan) * (PX1 - PX0);
    const rgb = [0, 0, 0];

    // Franja coloreada por clase (color de cuerpo negro a su T típica).
    for (let i = 0; i < SPECTRAL.length; i++) {
      const s = SPECTRAL[i];
      const tHi = i + 1 < SPECTRAL.length ? SPECTRAL[i + 1].tMin : STRIP_TMAX;
      const xa = xOf(s.tMin);
      const xb = xOf(tHi);
      blackbodyRGB(Math.sqrt(s.tMin * tHi), rgb);
      const col = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      scene.rect((xa + xb) / 2, (y0 + y1) / 2, xb - xa, y1 - y0, { fill: col, color: col, stroke: false, alpha: 0.9 });
      scene.line(xa, y0, xa, y1, { color: 'text', width: 1 });
      scene.label((xa + xb) / 2, y1 + 0.2, s.cls, { color: 'text', size: 14, weight: 'bold', baseline: 'bottom', avoid: true });
      if (i > 0) {
        scene.label(xa, y0 - 0.15, `${s.tMin}`, { color: 'textDim', size: 10, baseline: 'top', avoid: true });
      }
    }
    scene.rect((PX0 + PX1) / 2, (y0 + y1) / 2, PX1 - PX0, y1 - y0, { color: 'text', width: 1.2 });
    scene.label(PX0, y1 + 1.75, 'Clase espectral (T en K, escala logarítmica) ← fría · caliente →', {
      color: 'textDim', size: 11, align: 'left', baseline: 'bottom', avoid: true
    });

    // Estrellas de ejemplo bajo la franja, alternando altura para no pisarse.
    EXAMPLE_STARS.forEach((s, i) => {
      const x = xOf(s.T);
      const yy = i % 2 === 0 ? y0 - 0.85 : y0 - 1.55;
      scene.line(x, y0, x, yy + 0.15, { color: 'textDim', width: 1, dash: [2, 3] });
      scene.label(x, yy, s.name, { color: 'text', size: 10, baseline: 'top', avoid: true });
    });

    // Marcador de la temperatura actual.
    const xT = xOf(T);
    const cls = spectralClass(T);
    scene.polygon(
      [
        { x: xT, y: y0 - 0.05 },
        { x: xT - 0.28, y: y0 - 0.5 },
        { x: xT + 0.28, y: y0 - 0.5 }
      ],
      { color: 'ray', fill: 'ray', fillAlpha: 0.9, width: 1.5 }
    );
    scene.line(xT, y0, xT, y1, { color: 'ray', width: 2 });
    // Cerca de los bordes de la franja la etiqueta se alinea hacia dentro.
    const align = xT < PX0 + 3 ? 'left' : xT > PX1 - 3 ? 'right' : 'center';
    scene.label(xT, y1 + 0.85, `T = ${roundTo(T, 0)} K → clase ${cls.cls}`, {
      color: 'ray', size: 12, weight: 'bold', baseline: 'bottom', align, avoid: true
    });

    // Espectro reducido en el HUD (para no perder la curva en este modo).
    const vp = scene.viewport();
    if (vp.w > 420) {
      scene.hud.plot(
        { x: vp.x + vp.w - 250, y: vp.y + vp.h - 150, w: 238, h: 138 },
        {
          title: `Planck a ${roundTo(T, 0)} K (λ en nm)`,
          series: [{ points: this.plotPts, color: 'ray', label: 'B(λ,T)' }],
          xRange: [LAM_MIN, LAM_MAX],
          yRange: [0, 1.05]
        }
      );
    }
  }

  drawStar(scene) {
    const T = this.Tanim;
    const [r, g, b] = this._rgb;
    const col = `rgb(${r},${g},${b})`;
    const i = this.intensity(T);
    const breathe = 1 + 0.04 * Math.sin(this.pulse * 2.4);

    // Halo de intensidad: tres anillos cuya opacidad crece con T (escala log).
    scene.circle(STAR.x, STAR.y, STAR.r * 1.9 * breathe, { fill: col, color: col, stroke: false, alpha: 0.10 * i });
    scene.circle(STAR.x, STAR.y, STAR.r * 1.55 * breathe, { fill: col, color: col, stroke: false, alpha: 0.22 * i });
    scene.circle(STAR.x, STAR.y, STAR.r * 1.22 * breathe, { fill: col, color: col, stroke: false, alpha: 0.4 * i });
    scene.circle(STAR.x, STAR.y, STAR.r, { fill: col, color: 'textDim', width: 1.5 });

    // Fotones emitidos.
    for (const p of this.photons) {
      if (p.life <= 0) continue;
      scene.circle(p.x, p.y, 0.09, { fill: col, color: col, alpha: clamp(p.life, 0, 1) * 0.9 });
    }

    const cls = spectralClass(T);
    scene.label(STAR.x, STAR.y - STAR.r - 0.35, `T = ${roundTo(T, 0)} K`, { color: 'text', size: 13, weight: 'bold', baseline: 'top', avoid: true });
    scene.label(STAR.x, STAR.y - STAR.r - 0.95, `color: ${colorName(T)}`, { color: 'textDim', size: 11, baseline: 'top', avoid: true });
    if (this.params.modo === 'estrellas') {
      scene.label(STAR.x, STAR.y - STAR.r - 1.5, `clase ${cls.cls}: ${cls.desc}`, { color: 'ray', size: 11, baseline: 'top', avoid: true });
    }
  }

  drawHud(scene) {
    const T = this.Tanim;
    const hud = scene.hud;
    const preset = PRESETS[this.params.preset];
    const modo = this.params.modo;
    const P = this.power(T);
    const vis = this.visibleFraction(T);

    hud.chip(preset ? `${preset.label} · ${preset.T} K` : `Personalizado · ${roundTo(T, 0)} K`, 'top-left', { color: 'ray' });
    if (modo === 'clasico-vs-planck') {
      hud.chip('Catástrofe UV: la teoría clásica predice energía infinita', 'top-left', { color: 'danger' });
    }
    hud.readout(
      [
        { label: 'λ_max', value: this.wienPeakNm(T) > LAM_MAX ? `${roundTo(this.wienPeakNm(T) / 1000, 2)} µm` : `${roundTo(this.wienPeakNm(T), 0)} nm`, unit: '' },
        { label: 'P = σAT⁴', value: this.formatPower(P), unit: '' },
        { label: 'visible', value: roundTo(vis * 100, 1), unit: '%' }
      ],
      'top-left'
    );
    hud.chip(`A = ${this.params.A} m²`, 'top-right', { color: 'textDim' });

    if (modo === 'clasico-vs-planck') {
      hud.legend(
        [
          { color: 'ray', label: 'Planck (cuántico)', dash: [] },
          { color: 'danger', label: 'Rayleigh–Jeans (clásico)', dash: [7, 5] }
        ],
        'bottom-left'
      );
    } else if (modo === 'espectro') {
      hud.legend(
        [
          { color: 'ray', label: 'B(λ,T) de Planck', dash: [] },
          { color: 'accel', label: 'zona UV', dash: [2, 3] },
          { color: 'force', label: 'zona IR', dash: [2, 3] }
        ],
        'bottom-left'
      );
    }
  }

  /** Potencia con prefijo legible (W, kW, MW…). */
  formatPower(P) {
    if (P >= 1e9) return `${roundTo(P / 1e9, 2)} GW`;
    if (P >= 1e6) return `${roundTo(P / 1e6, 2)} MW`;
    if (P >= 1e3) return `${roundTo(P / 1e3, 2)} kW`;
    return `${roundTo(P, 1)} W`;
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const T = this.Tanim;
    const out = {
      T: { value: roundTo(T, 0), unit: 'K' },
      'λ_max': { value: roundTo(this.wienPeakNm(T), 1), unit: 'nm' },
      'P': { value: roundTo(this.power(T), 1), unit: 'W' },
      'B_max': { value: roundTo(planck(WIEN_B / T, T) / 1e9, 3), unit: 'GW·sr⁻¹·m⁻³' },
      'fracción visible': { value: roundTo(this.visibleFraction(T) * 100, 2), unit: '%' },
      color: { value: colorName(T), unit: '' }
    };
    if (this.params.modo === 'estrellas') {
      out['clase espectral'] = { value: spectralClass(T).cls, unit: '' };
    }
    if (this.params.modo === 'clasico-vs-planck') {
      // Cociente clásico/cuántico a 200 nm, en log₁₀: cuantifica la catástrofe
      // sin desbordar (RJ/Planck = (e^x − 1)/x con x = hc/(λk_BT)).
      const x = (H * C) / (200e-9 * KB * T);
      const log10Ratio = x > 50 ? (x - Math.log(x)) / Math.LN10 : Math.log10(Math.expm1(x) / x);
      out['log₁₀(RJ/Planck) a 200 nm'] = { value: roundTo(log10Ratio, 2), unit: '' };
    }
    return out;
  }

  getState() {
    return { t: this.t, Tanim: this.Tanim, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.Tanim)) this.Tanim = s.Tanim;
    this._curveT = -1;
    for (const p of this.photons) p.life = 0;
  }

  destroy() {
    for (const p of this.photons) p.life = 0;
  }
}
