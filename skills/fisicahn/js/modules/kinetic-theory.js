/**
 * @fileoverview Teoría cinética de gases — N moléculas en una caja con
 * termostato y distribución de Maxwell-Boltzmann (tanda 5.3).
 *
 * Modos:
 * - `caja`: una especie con termostato hacia T. El histograma de rapidez que se
 *   construye sobre la marcha se compara contra la curva teórica 2D de
 *   Maxwell-Boltzmann, y T medida (de ⟨½mv²⟩ = k_B·T) sigue la temperatura fijada.
 * - `binaria`: dos especies de distinta masa a la misma T: la ligera se mueve
 *   más rápido (misma Eₖ media) — se ve en la nube y en el doble histograma.
 *
 * Física honesta con muestras visuales: las rapideces están en m/s reales y la
 * distribución es la 2D f(v) ∝ v·e^{−mv²/2k_BT}; lo único escalado es la posición
 * en pantalla (KVIS m/s ↔ unidad/s), para que los cruces de la caja sean
 * visibles a escala humana.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const KB = 1.380649e-23; // J/K
const AMU = 1.660539e-27; // kg
/** Rapidez real ↔ unidades de pantalla por segundo (animación, no física). */
const KVIS = 90;
/** Radio de partícula en el mundo. */
const R = 0.22;

/** Velocidad (rapidez, m/s) muestreada de la CDF 2D de Maxwell-Boltzmann. */
function sampleSpeed(m, T, rng = Math.random) {
  const a = Math.sqrt(m / (2 * KB * T));
  return Math.sqrt(-Math.log(1 - rng())) / a;
}

export default class KineticTheory extends SimModule {
  static viewport = { width: 24, height: 15 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'caja',
      options: [
        { value: 'caja', label: 'Un gas' },
        { value: 'binaria', label: 'Dos gases' }
      ]
    },
    { id: 'T', label: 'Temperatura', latex: 'T', unit: 'K', min: 80, max: 1500, step: 20, value: 300 },
    { id: 'M', label: 'Masa (u)', latex: 'm', unit: 'u', min: 2, max: 131, step: 1, value: 28 },
    { id: 'N', label: 'Moléculas', latex: 'N', min: 30, max: 180, step: 10, value: 120 },
    { id: 'M1', label: 'Masa gas ligero (u)', latex: 'm_1', unit: 'u', min: 2, max: 60, step: 1, value: 4 },
    { id: 'M2', label: 'Masa gas pesado (u)', latex: 'm_2', unit: 'u', min: 16, max: 200, step: 2, value: 48 },
    { id: 'N1', label: 'Moléculas gas 1', latex: 'N_1', min: 15, max: 100, step: 5, value: 60 },
    { id: 'N2', label: 'Moléculas gas 2', latex: 'N_2', min: 15, max: 100, step: 5, value: 60 },
    { id: 'choque', type: 'checkbox', label: 'Choques entre moléculas', value: true }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'caja',
      T: 300,
      M: 28,
      N: 120,
      M1: 4,
      M2: 48,
      N1: 60,
      N2: 60,
      choque: true
    };
    this.box = { xmin: -10, xmax: 10, ymin: -6, ymax: 6 };
    this.p = [];
    this.Tmeas = 0;
    this.t = 0;
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Teoría cinética',
      blurb: 'Moléculas en movimiento: temperatura como energía cinética media y Maxwell-Boltzmann.',
      story:
        'El termómetro no mide el calor de una molécula: mide la energía cinética media de miles de millones de ellas. Aquí cada punto es una molécula con su rapidez; la temperatura decide cuánto se mueven, y la distribución de rapideces que se forma es exactamente la curva que dedujo James Clerk Maxwell: nadie está parado, la mayoría corre a la velocidad típica y una cola se escapa hacia arriba.',
      cases: [
        'Subir T: la nube se acelera y la curva se ensancha sin cambiar su forma.',
        'En modo “Dos gases”, la misma energía (½kT por grado de libertad) pero distinta masa: el ligero va más rápido.',
        'Con el choque desactivado, la cola de la curva deja de rellenarse.',
        'T medida (de ⟨½mv²⟩) sigue a T ajustada gracias al termostato.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Teoría cinética',
      items: [
        {
          name: 'Temperatura y energía cinética',
          formula: '\\overline{\\tfrac{1}{2} m v^2} = k_B T',
          note: 'Por partícula y gradiente 2D; en 3D el factor es 3/2.'
        },
        {
          name: 'Velocidad eficaz',
          formula: 'v_{rms} = \\sqrt{2 k_B T / m}',
          note: 'En esta caja 2D. En 3D: √(3k_BT/m).'
        },
        {
          name: 'Maxwell–Boltzmann (2D)',
          formula: 'f(v)\\,dv \\propto v\\, e^{- m v^2 / (2 k_B T)}\\, dv',
          note: 'Fracción de moléculas con rapidez entre v y v+dv.'
        },
        {
          name: 'Misma energía, distinta velocidad',
          formula: 'v_{rms} \\propto 1/\\sqrt{m}',
          note: 'A la misma T, la especie ligera se mueve más rápido.'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.Tmeas = 0;
    this.p = this._seedSpec();
    this.engine?.reset?.();
  }

  /** Molécula con posición aleatoria y velocidad de Maxwell 2D. */
  _seed(m, rng = Math.random) {
    const b = this.box;
    const sp = sampleSpeed(m, this.params.T, rng);
    const th = rng() * Math.PI * 2;
    return {
      x: b.xmin + R + rng() * (b.xmax - b.xmin - 2 * R),
      y: b.ymin + R + rng() * (b.ymax - b.ymin - 2 * R),
      vx: Math.cos(th) * sp,
      vy: Math.sin(th) * sp,
      v: sp,
      m,
      id: 0
    };
  }

  _seedSpec() {
    const { modo } = this.params;
    const out = [];
    if (modo === 'binaria') {
      const m1 = this.params.M1 * AMU;
      const m2 = this.params.M2 * AMU;
      for (let i = 0; i < this.params.N1; i++) {
        const q = this._seed(m1);
        q.id = 0;
        out.push(q);
      }
      for (let i = 0; i < this.params.N2; i++) {
        const q = this._seed(m2);
        q.id = 1;
        out.push(q);
      }
    } else {
      const m = this.params.M * AMU;
      for (let i = 0; i < this.params.N; i++) {
        const q = this._seed(m);
        q.id = 0;
        out.push(q);
      }
    }
    return out;
  }

  update(dt) {
    this.t += dt;
    const b = this.box;
    const dtv = dt * KVIS;

    for (const q of this.p) {
      q.x += (q.vx / KVIS) * dtv;
      q.y += (q.vy / KVIS) * dtv;
      // Paredes: rebote elástico.
      if (q.x < b.xmin + R) {
        q.x = b.xmin + R;
        q.vx = Math.abs(q.vx);
      } else if (q.x > b.xmax - R) {
        q.x = b.xmax - R;
        q.vx = -Math.abs(q.vx);
      }
      if (q.y < b.ymin + R) {
        q.y = b.ymin + R;
        q.vy = Math.abs(q.vy);
      } else if (q.y > b.ymax - R) {
        q.y = b.ymax - R;
        q.vy = -Math.abs(q.vy);
      }
    }

    if (this.params.choque && this.p.length <= 320) this._collide(b);

    this._thermostat(dt);
  }

  /** Choques elásticos (masas distintas permitidas) con rejilla espacial. */
  _collide(b) {
    const NC = 6;
    const cw = (b.xmax - b.xmin) / NC;
    const ch = (b.ymax - b.ymin) / NC;
    const grid = Array.from({ length: NC * NC }, () => []);
    for (const q of this.p) {
      const cx = Math.max(0, Math.min(NC - 1, Math.floor((q.x - b.xmin) / cw)));
      const cy = Math.max(0, Math.min(NC - 1, Math.floor((q.y - b.ymin) / ch)));
      grid[cy * NC + cx].push(q);
    }
    const rr = 2 * R + 0.015;
    for (let ci = 0; ci < NC; ci++) {
      for (let cj = 0; cj < NC; cj++) {
        const cell = grid[cj * NC + ci];
        for (let i = 0; i < cell.length; i++) {
          for (let j = i + 1; j < cell.length; j++) {
            const a = cell[i];
            const b0 = cell[j];
            const dx = b0.x - a.x;
            const dy = b0.y - a.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > rr * rr) continue;
            const d = Math.sqrt(d2) || 1e-6;
            const nx = dx / d;
            const ny = dy / d;
            // ¿se acercan?
            const rvx = a.vx - b0.vx;
            const rvy = a.vy - b0.vy;
            if (rvx * nx + rvy * ny >= 0) continue;
            const m1 = a.m;
            const m2 = b0.m;
            const mt = m1 + m2;
            const rn = (2 * m2 / mt) * (rvx * nx + rvy * ny);
            const rn2 = (2 * m1 / mt) * (rvx * nx + rvy * ny);
            a.vx -= rn * nx;
            a.vy -= rn * ny;
            b0.vx += rn2 * nx;
            b0.vy += rn2 * ny;
            // Separación dura para no dejar sólidos encajados.
            a.x = b0.x - nx * rr;
            a.y = b0.y - ny * rr;
          }
        }
      }
    }
  }

  /** Termostato de Berendsen global: ⟨K⟩ tiende a k_B·T con τ = 1.2 s. */
  _thermostat(dt) {
    const arr = this.p;
    if (!arr.length) return;
    let KE = 0;
    for (const q of arr) KE += 0.5 * q.m * (q.vx * q.vx + q.vy * q.vy);
    this.Tmeas = KE / (arr.length * KB);
    const tau = 1.2;
    const ratio = this.params.T / Math.max(this.Tmeas, 1e-9);
    const lambda = Math.sqrt(Math.max(0.1, 1 + (dt / tau) * (ratio - 1)));
    for (const q of arr) {
      q.vx *= lambda;
      q.vy *= lambda;
      q.v = Math.hypot(q.vx, q.vy);
    }
  }

  vRms(m_kg) {
    return Math.sqrt((2 * KB * this.params.T) / m_kg);
  }

  /**
   * Histograma de rapidez por especie y curva teórica normalizada.
   * @returns {{dx: number, max: number, hist: Array<{id:number,counts:number[],n:number}>, theory: Array<Array<{x:number,y:number}>>}}
   */
  _bins() {
    const spec = new Map();
    for (const q of this.p) {
      if (!spec.has(q.id)) spec.set(q.id, []);
      spec.get(q.id).push(q);
    }
    const BINS = 30;
    let vmax = 1;
    for (const q of this.p) if (q.v > vmax) vmax = q.v;
    const dx = (vmax * 1.06) / BINS;
    const series = [];
    const theory = [];
    for (const [id, arr] of spec) {
      const counts = new Array(BINS).fill(0);
      let m = 0;
      for (const q of arr) {
        m = q.m;
        if (q.v <= 0) continue;
        const idx = Math.min(BINS - 1, Math.floor(q.v / dx));
        counts[idx]++;
      }
      series.push({ id, counts, n: arr.length, m });
      const a2 = m / (2 * KB * this.params.T);
      const pts = [];
      for (let i = 0; i <= BINS; i++) {
        const v = i * dx;
        // f(v)·Δv normalizada a N: N·2a²·v·e^{−a²v²}·dv
        pts.push({ x: v, y: arr.length * 2 * a2 * v * Math.exp(-a2 * v * v) * dx });
      }
      theory.push(pts);
    }
    return { dx, vmax, series, theory };
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    const b = this.box;
    const bin = this.params.modo === 'binaria';

    // Paredes.
    scene.rect((b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2, b.xmax - b.xmin + 1.2, b.ymax - b.ymin + 1.2, {
      color: 'textDim',
      width: 2,
      dash: [4, 4]
    });

    for (const q of this.p) {
      scene.body(q.x, q.y, {
        shape: 'circle',
        r: R,
        color: bin && q.id === 1 ? 'force' : 'mass'
      });
    }

    const hud = scene.hud;
    hud.chip(bin ? 'Dos gases a la misma temperatura' : 'Gas con termostato', 'top-left');
    const rows = [
      { label: 'T fijada', value: roundTo(this.params.T, 0), unit: 'K' },
      { label: 'T medida', value: roundTo(this.Tmeas, 0), unit: 'K' },
      { label: 'v_rms (2D)', value: roundTo(this.vRms(this.p[0]?.m || AMU * 28), 0), unit: 'm/s' }
    ];
    if (bin && this.p.length) {
      const slow = Math.min(...new Set(this.p.map((q) => q.m)));
      const fast = Math.max(...new Set(this.p.map((q) => q.m)));
      rows.push({ label: '⟨v⟩ ligero', value: roundTo(this.vRms(slow), 0), unit: 'm/s' });
      rows.push({ label: '⟨v⟩ pesado', value: roundTo(this.vRms(fast), 0), unit: 'm/s' });
    }
    hud.readout(rows, 'bottom-left');

    // Histograma de rapidez versus la curva teórica.
    const vp = scene.viewport();
    if (vp.w > 430) {
      const { dx, series, theory, vmax } = this._bins();
      const serieList = series.map((s) => {
        const pts = [];
        for (let k = 0; k < s.counts.length; k++) {
          pts.push({ x: k * dx, y: s.counts[k] });
          pts.push({ x: (k + 1) * dx, y: s.counts[k] });
        }
        return {
          points: pts,
          color: s.id === 1 ? 'force' : 'mass',
          fill: true,
          label: s.id === 1 && bin ? 'pesado' : 'gas'
        };
      });
      const theorySeries = theory.map((pts, i) => ({
        points: pts,
        color: i === 1 ? 'force' : 'energy',
        dash: [3, 3],
        width: 2
      }));
      let ymax = 1;
      for (const s of series) {
        for (const c of s.counts) if (c > ymax) ymax = c;
      }
      hud.plot(
        { x: vp.x + vp.w - 270, y: vp.y + vp.h - 140, w: 255, h: 126 },
        {
          title: 'Rapidez de las moléculas f(v)',
          series: [...serieList, ...theorySeries],
          xRange: [0, vmax * 1.06],
          yRange: [0, ymax * 1.2],
          xLabel: 'v (m/s)',
          yLabel: 'N'
        }
      );
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const first = this.p[0];
    const m = first ? first.m : AMU * 28;
    return {
      'T fija': { value: roundTo(this.params.T, 0), unit: 'K' },
      'T medida': { value: roundTo(this.Tmeas, 0), unit: 'K' },
      'v_rms (2D)': { value: roundTo(this.vRms(m), 0), unit: 'm/s' },
      'Moléculas': { value: this.p.length, unit: '' }
    };
  }

  getState() {
    return {
      t: this.t,
      Tmeas: this.Tmeas,
      params: { ...this.params },
      // La posición/velocidad por partícula la resiembra reset(); se guarda el
      // estado agregado para no inflar trabajos con 160 vectores.
      n: this.p.length
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.Tmeas)) this.Tmeas = s.Tmeas;
    if (Number.isFinite(s.n) && s.n !== this.p.length) {
      this.p = this._seedSpec();
    }
  }

  destroy() {
    this.p.length = 0;
  }
}