/**
 * @fileoverview Unidades y errores — conversión de unidades, cifras
 * significativas y propagación de errores (tanda 5.1).
 *
 * Módulo ligero: sin integración ni canvas pesado. El foco está en el
 * formulario (validación de entrada, selección de dimensiones) y en la
 * conversión correcta con su incertidumbre. La escena muestra la equivalencia
 * como dos barras proporcionales y el resultado con la precisión pedida.
 *
 * Conversiones lineales (factor × base SI): se evitan las que necesitan
 * desplazamiento (temperatura) para que «convertir» sea siempre
 * `resultado = cantidad × (factor_origen / factor_destino)`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';

/** Unidades por dimensión, todas con factor × unidad SI base. */
const DIMENSIONS = {
  longitud: { si: 'm', units: { m: 1, cm: 0.01, mm: 0.001, km: 1000, pulg: 0.0254, ft: 0.3048, mi: 1609.344 } },
  masa: { si: 'kg', units: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125 } },
  tiempo: { si: 's', units: { s: 1, ms: 0.001, min: 60, h: 3600, dia: 86400, anio: 31557600 } },
  velocidad: {
    si: 'm/s',
    units: { 'm/s': 1, 'km/h': 1000 / 3600, 'mi/h': 1609.344 / 3600, 'ft/s': 0.3048, nudos: 1852 / 3600 }
  },
  energia: { si: 'J', units: { J: 1, kJ: 1000, MJ: 1e6, cal: 4.184, kcal: 4184, kWh: 3.6e6, eV: 1.602176634e-19 } }
};

const DIM_LABELS = {
  longitud: 'Longitud',
  masa: 'Masa',
  tiempo: 'Tiempo',
  velocidad: 'Velocidad',
  energia: 'Energía'
};

/** Prefijos SI para presentar resultados grandes/pequeños con cifras pedidas. */
const PREFIXES = [
  { p: 1e15, s: 'P' }, { p: 1e12, s: 'T' }, { p: 1e9, s: 'G' }, { p: 1e6, s: 'M' },
  { p: 1e3, s: 'k' }, { p: 1, s: '' }, { p: 1e-3, s: 'm' }, { p: 1e-6, s: 'µ' },
  { p: 1e-9, s: 'n' }, { p: 1e-12, s: 'p' }, { p: 1e-15, s: 'f' }
];

export default class UnitsError extends SimModule {
  static viewport = { width: 20, height: 12 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'convertir',
      options: [
        { value: 'convertir', label: 'Conversión' },
        { value: 'errores', label: 'Cifras y errores' }
      ]
    },
    {
      id: 'dimension',
      type: 'select',
      label: 'Dimensión',
      value: 'longitud',
      options: [
        { value: 'longitud', label: 'Longitud' },
        { value: 'masa', label: 'Masa' },
        { value: 'tiempo', label: 'Tiempo' },
        { value: 'velocidad', label: 'Velocidad' },
        { value: 'energia', label: 'Energía' }
      ]
    },
    { id: 'cantidad', label: 'Cantidad medida', latex: 'q', min: 0.0001, max: 10000, step: 0.01, value: 12 },
    { id: 'cifras', label: 'Cifras significativas', latex: 'n', min: 1, max: 6, step: 1, value: 3 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { modo: 'convertir', dimension: 'longitud', cantidad: 12, cifras: 3 };
    this.errorAbs = 0.5;
  }

  /** Unidades de origen y destino: primera y segunda de la dimensión actual. */
  unitPair() {
    const keys = Object.keys(DIMENSIONS[this.params.dimension].units);
    return [keys[0], keys[1] || keys[0]];
  }

  /** Factor a SI de la unidad dada. */
  factor(unit) {
    return DIMENSIONS[this.params.dimension].units[unit] ?? 1;
  }

  /** Valor convertido: cantidad × (factor_origen / factor_destino). */
  convert(cantidad, from, to) {
    return cantidad * (this.factor(from) / this.factor(to));
  }

  /** Formatea `v` con `n` cifras significativas, en notación limpia. */
  sig(v, n) {
    if (!Number.isFinite(v) || v === 0) return { text: '0', value: 0 };
    const out = Number(v.toPrecision(n));
    const exp = Math.floor(Math.log10(Math.abs(out)));
    // Prefijo SI solo si el exponente sale del rango cómodo.
    if (exp >= 6 || exp <= -4) {
      const pre = PREFIXES.find((p) => exp >= Math.log10(p.p)) || PREFIXES[PREFIXES.length - 1];
      return { text: `${roundTo(out / pre.p, Math.max(0, n - 1))} ${pre.s}`, value: out };
    }
    return { text: String(out), value: out };
  }

  /** ¿La cantidad es válida para esta dimensión? */
  validation() {
    const { cantidad, dimension } = this.params;
    if (!Number.isFinite(cantidad)) return 'Introduce un número válido.';
    if (cantidad <= 0) return 'La cantidad debe ser mayor que 0.';
    if (dimension === 'masa' && cantidad > 1000000) return 'Esa masa excede el rango útil (1000 t).';
    return null;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: 'Unidades y errores',
      blurb: 'Conversión de unidades, cifras significativas y propagación de errores.',
      story:
        'La conversión de unidades es la primera disciplina del laboratorio: un error de factor 1000 (km vs m) vale una misión. Aquí se convierten longitudes, masas, tiempos, velocidades y energías con las cifras significativas que pidas, y en modo «Cifras y errores» se arrastra la incertidumbre de la medida a la unidad convertida.',
      cases: [
        '12 km → m, con 3 cifras significativas.',
        'Una medida de 2.5 ± 0.1 s pasada a milisegundos: ¿cuánto vale la incertidumbre?',
        'Velocidad en km/h convertida a m/s para un problema de MRU.'
      ]
    });
    this.setModuleFormulas({
      title: 'Conversión y errores',
      items: [
        {
          name: 'Conversión por factor',
          formula: 'x₂ = x₁ · (factor₁ / factor₂)',
          note: 'Todas estas unidades son lineales respecto a la base SI.'
        },
        {
          name: 'Error relativo',
          formula: 'ε = Δx / x',
          note: 'Suele expresarse en %: ε% = 100·Δx / x.'
        },
        {
          name: 'Cifras significativas',
          formula: 'x = (m ± 0.5) × 10ᵏ',
          note: 'Con n cifras, la incertidumbre cae en la última.'
        }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.engine?.reset?.();
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { cantidad, dimension, cifras, modo } = this.params;
    const [from, to] = this.unitPair();
    const valid = this.validation();
    const result = valid === null ? this.convert(cantidad, from, to) : NaN;

    // Barras proporcionales: el largo es ∝ log del valor en esa unidad, con la
    // equivalencia anotada en los extremos.
    const w = scene.world();
    const cx = 0;
    const baseY = 1.3;
    const maxLen = (w.right - w.left) * 0.55;
    const x0 = cx - maxLen / 2;
    const L1 = Math.max(0.2, Math.min(maxLen, ((Math.log10(cantidad) + 3) / 10) * maxLen));
    const L2 = Number.isFinite(result) ? Math.max(0.2, Math.min(maxLen, ((Math.log10(result) + 3) / 10) * maxLen)) : 0.2;

    scene.chip(cx, baseY - 2.2, `${DIM_LABELS[dimension]} · ${from} → ${to}`, { avoid: true });

    scene.rect(x0, baseY, L1, 0.7, { color: 'mass', radius: 0.2, fill: true });
    scene.label(x0 + L1 + 0.15, baseY + 0.35, `${cantidad} ${from}`, { avoid: true, color: 'mass' });

    scene.rect(x0, baseY - 1.5, L2, 0.7, { color: 'energy', radius: 0.2, fill: true });
    scene.label(x0 + L2 + 0.15, baseY - 1.15, `${Number.isFinite(result) ? result.toPrecision(4) : '—'} ${to}`, { avoid: true,
      color: 'energy'
    });

    scene.dimension(
      x0,
      baseY - 2.9,
      x0 + maxLen,
      baseY - 2.9,
      `1 ${from} = ${this.factor(from) / this.factor(to)} ${to}`,
      { color: 'textDim' }
    );

    // Resultado principal con la precisión pedida, en el HUD.
    const hud = scene.hud;
    const invalid = valid !== null;
    hud.chip(invalid ? valid || 'Dato inválido' : modo === 'errores' ? 'Modo cifras y errores' : 'Conversión', 'top-left');
    const rows = [];
    if (!invalid) {
      const sig = this.sig(result, cifras);
      rows.push({ label: 'Resultado', value: sig.text, unit: to });
      if (modo === 'errores') {
        const rel = this.errorAbs / Math.max(cantidad, 1e-12);
        rows.push({ label: `Δ (en ${to})`, value: roundTo(this.convert(this.errorAbs, from, to), cifras - 1), unit: '' });
        rows.push({ label: 'ε relativo', value: (rel * 100).toPrecision(cifras - 1) + ' %', unit: '' });
      } else {
        rows.push({ label: 'Factor', value: (this.factor(from) / this.factor(to)).toPrecision(6), unit: `${from}/${to}` });
      }
    } else {
      rows.push({ label: 'Estado', value: 'Corrige la entrada', unit: '' });
    }
    hud.readout(rows, 'bottom-left');
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const { cantidad, dimension, cifras, modo } = this.params;
    const [from, to] = this.unitPair();
    const valid = this.validation();
    const result = valid === null ? this.convert(cantidad, from, to) : NaN;
    if (valid !== null) return { estado: { value: 'Entrada inválida', unit: '' } };
    const out = {
      entrada: { value: cantidad, unit: from },
      convertido: { value: roundTo(result, cifras), unit: to },
      factor: { value: roundTo(this.factor(from) / this.factor(to), 6), unit: `${from}/${to}` }
    };
    if (modo === 'errores') {
      const rel = this.errorAbs / Math.max(cantidad, 1e-12);
      out['Δ convertido'] = { value: roundTo(this.convert(this.errorAbs, from, to), cifras - 1), unit: to };
      out['ε relativo'] = { value: roundTo(rel * 100, 3), unit: '%' };
    }
    return out;
  }

  getState() {
    return { params: { ...this.params }, errorAbs: this.errorAbs };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.errorAbs)) this.errorAbs = s.errorAbs;
  }
}
