/**
 * @fileoverview Termodinámica — gas ideal en un cilindro con pistón, diagrama
 * P–V, ciclo de Carnot y conducción de calor en una barra.
 *
 * Migrado a `SimModule` + `draw(scene)`. Unidades de simulación con R = 1:
 * P·V = n·T. El objeto de estudio es el cilindro (eje en el origen, `anchor`):
 * el pistón sube y baja con V, el gas cambia de tono y sus partículas de
 * velocidad con T, y las flechas Q y W hacen visible la primera ley
 * ΔU = Q − W en cada instante. A la derecha, el diagrama P–V con isotermas de
 * guía, la traza del proceso y el estado actual.
 *
 * Procesos (`modo`):
 *  - `isoterma`    T fija, V oscila → P = nT/V (hipérbola).
 *  - `isocora`     V fijo, T oscila → P ∝ T (segmento vertical).
 *  - `isobara`     P fija, T oscila → V ∝ T (segmento horizontal).
 *  - `adiabatica`  Q = 0: T·V^(γ−1) = cte, curva más empinada que la isoterma.
 *  - `carnot`      dos isotermas (Th, Tc) + dos adiabáticas; η = 1 − Tc/Th.
 *  - `difusion`    barra 1D entre dos focos: ∂T/∂t = κ ∂²T/∂x² (explícito).
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo, clamp } from '../core/geometry.js';
import { thermalColor } from '../core/draw-primitives.js';

/* ---------- geometría del cilindro (unidades de mundo) ---------- */
const HW = 1.6; // semiancho interior
const BASE_Y = -3.5; // fondo del cilindro
const GAS_H_MAX = 6.2; // altura del gas cuando V = Vref
const WALL_TOP = 3.6;
/* ---------- proceso ---------- */
const V_LO = 1.2;
const V_HI = 3.7;
const V0 = V_LO + (V_HI - V_LO) / 2; // V inicial de isoterma/adiabática
const CARNOT_V1 = 1;
const CARNOT_V2 = 1.8;
const CARNOT_R_MAX = 4; // razón máxima de expansión adiabática dibujable
const ROD_N = 40;
const N_PART = 40;
const T_COLD_REF = 200;
const T_HOT_REF = 600;

const MODE_LABEL = {
  isoterma: 'Proceso isotermo (T constante)',
  isocora: 'Proceso isócoro (V constante)',
  isobara: 'Proceso isóbaro (P constante)',
  adiabatica: 'Proceso adiabático (Q = 0)',
  carnot: 'Ciclo de Carnot',
  difusion: 'Conducción de calor en una barra'
};
const CARNOT_LEGS = [
  '1 · Expansión isoterma a Th (recibe Qh)',
  '2 · Expansión adiabática (Q = 0, T baja)',
  '3 · Compresión isoterma a Tc (cede Qc)',
  '4 · Compresión adiabática (Q = 0, T sube)'
];

/** Generador determinista (LCG): el reset siembra siempre igual. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export default class ThermodynamicsModule extends SimModule {
  static viewport = { width: 24, height: 14 };

  /** Eje del cilindro (y de la barra) en el origen (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Proceso',
      value: 'isoterma',
      options: [
        { value: 'isoterma', label: 'Isoterma (T fija)' },
        { value: 'isocora', label: 'Isócora (V fijo)' },
        { value: 'isobara', label: 'Isóbara (P fija)' },
        { value: 'adiabatica', label: 'Adiabática (Q = 0)' },
        { value: 'carnot', label: 'Ciclo de Carnot' },
        { value: 'difusion', label: 'Conducción / difusión' }
      ]
    },
    { id: 'n', label: 'Cantidad de gas', latex: 'n', unit: 'mol (sim)', min: 0.5, max: 3, step: 0.1, value: 1 },
    { id: 'T', label: 'Temperatura base', latex: 'T', unit: 'K', min: 200, max: 500, step: 5, value: 300 },
    { id: 'gamma', label: 'Índice adiabático', latex: '\\gamma', min: 1.1, max: 1.67, step: 0.01, value: 1.4 },
    { id: 'Th', label: 'Foco caliente', latex: 'T_h', unit: 'K', min: 320, max: 600, step: 5, value: 400 },
    { id: 'Tc', label: 'Foco frío', latex: 'T_c', unit: 'K', min: 200, max: 350, step: 5, value: 280 },
    { id: 'k', label: 'Difusividad', latex: '\\kappa', min: 0.1, max: 2, step: 0.05, value: 0.8 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { modo: 'isoterma', n: 1, T: 300, gamma: 1.4, Th: 400, Tc: 280, k: 0.8 };
    this.t = 0;
    this.phase = 0;
    /* estado del gas */
    this.V = V0;
    this.T = 300;
    this.P = 300 / V0;
    this.W = 0; // trabajo hecho por el gas desde el reset
    this.Q = 0; // calor recibido desde el reset
    this.U0 = 0;
    this.qRate = 0; // dQ/dt suavizado (para la flecha Q)
    this.vRate = 0; // dV/dt suavizado (para la flecha W)
    this.Vref = V_HI; // V que llena el cilindro dibujado
    this.carnot = { V1: CARNOT_V1, V2: CARNOT_V2, V3: 1, V4: 1, gEff: 1.4 };
    /* barra de conducción: doble buffer sin allocar por paso */
    this.Trod = new Float64Array(ROD_N);
    this._rodNext = new Float64Array(ROD_N);
    /* partículas del gas (sólo visual, no se serializan) */
    this._px = new Float64Array(N_PART);
    this._py = new Float64Array(N_PART);
    this._dx = new Float64Array(N_PART);
    this._dy = new Float64Array(N_PART);
    /* trazas y guías para el diagrama P–V */
    this.trace = new TrailBuffer(420);
    this.guides = [];
    this.cycle = [];
    this._dot = [{ x: 0, y: 0 }];
    this._profile = Array.from({ length: ROD_N }, () => ({ x: 0, y: 0 }));
    this._plotX = [0.5, 4];
    this._plotY = [0, 400];
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Termodinámica',
      blurb:
        meta?.blurb ||
        'Gas ideal en diagrama P–V, procesos isotermo/isócoro/isóbaro/adiabático, ciclo de Carnot y conducción de calor.',
      story:
        'Las leyes de la termodinámica limitan lo que una máquina térmica puede hacer. La primera ley lleva la cuenta: ΔU = Q − W. La segunda pone el techo: ningún motor entre dos focos supera la eficiencia de Carnot, η = 1 − Tc/Th.',
      cases: [
        'Pistón con gas a temperatura fija (isoterma): el gas absorbe calor para empujar.',
        'Bomba de bicicleta: compresión casi adiabática, el aire se calienta.',
        'Motor térmico entre dos focos (Carnot).',
        'Calor que se propaga por una barra metálica (conducción).'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Gas ideal', formula: 'P V = n R T', note: 'Aquí R = 1 (unidades de simulación).' },
        { name: '1.ª ley', formula: 'ΔU = Q − W', note: 'W es el trabajo que hace el gas; U = nRT/(γ − 1).' },
        { name: 'Adiabática', formula: 'T V^{γ−1} = cte', note: 'Equivale a P V^γ = cte.' },
        { name: 'Carnot', formula: 'η = 1 − T<sub>c</sub>/T<sub>h</sub>' },
        { name: 'Conducción (1D)', formula: '∂T/∂t = κ ∂²T/∂x²' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.phase = 0;
    this.W = 0;
    this.Q = 0;
    this.qRate = 0;
    this.vRate = 0;
    this.trace.clear();
    this._setupCarnot();
    this.Vref = this.params.modo === 'carnot' ? this.carnot.V3 : V_HI;
    this._evalProcess();
    this.U0 = this.internalEnergy();
    this._rebuildGuides();
    this._seedRod();
    this._seedParticles();
    this.engine?.reset?.();
  }

  /* ---------- física ---------- */

  gasP(V, T) {
    return (this.params.n * T) / Math.max(V, 0.05);
  }

  /** U = nRT/(γ − 1), con R = 1. */
  internalEnergy() {
    return (this.params.n * this.T) / (this.params.gamma - 1);
  }

  /**
   * Vértices del ciclo: V1 → V2 isoterma a Th; V2 → V3 adiabática hasta Tc.
   * Si la razón de expansión adiabática real no cabe en el dibujo, se usa un
   * γ efectivo que cierra el ciclo con la razón máxima dibujable.
   */
  _setupCarnot() {
    const { Th, Tc, gamma } = this.params;
    const ratio = Math.max(Th / Tc, 1.001);
    const ideal = Math.pow(ratio, 1 / (gamma - 1));
    const r = Math.min(ideal, CARNOT_R_MAX);
    const c = this.carnot;
    c.V1 = CARNOT_V1;
    c.V2 = CARNOT_V2;
    c.V3 = CARNOT_V2 * r;
    c.V4 = CARNOT_V1 * r;
    c.gEff = 1 + Math.log(ratio) / Math.log(r);
  }

  /** V y T del proceso en el instante actual (escribe V, T, P). */
  _evalProcess() {
    const p = this.params;
    const t = this.t;
    switch (p.modo) {
      case 'isocora':
        this.V = 2;
        this.T = p.T * (1 + 0.25 * Math.sin(t * 0.6));
        this.P = this.gasP(this.V, this.T);
        return;
      case 'isobara': {
        const P0 = this.gasP(2, p.T);
        this.T = p.T * (1 + 0.25 * Math.sin(t * 0.6));
        this.V = (p.n * this.T) / P0;
        this.P = P0;
        return;
      }
      case 'adiabatica':
        this.V = V_LO + (V_HI - V_LO) * (0.5 + 0.5 * Math.sin(t * 0.7));
        this.T = p.T * Math.pow(V0 / this.V, p.gamma - 1);
        this.P = this.gasP(this.V, this.T);
        return;
      case 'carnot': {
        const { V1, V2, V3, V4, gEff } = this.carnot;
        const s = this.phase;
        if (s < 0.25) {
          const u = s / 0.25;
          this.T = p.Th;
          this.V = V1 + (V2 - V1) * u;
        } else if (s < 0.5) {
          const u = (s - 0.25) / 0.25;
          this.V = V2 + (V3 - V2) * u;
          this.T = p.Th * Math.pow(V2 / this.V, gEff - 1);
        } else if (s < 0.75) {
          const u = (s - 0.5) / 0.25;
          this.T = p.Tc;
          this.V = V3 + (V4 - V3) * u;
        } else {
          const u = (s - 0.75) / 0.25;
          this.V = V4 + (V1 - V4) * u;
          this.T = p.Tc * Math.pow(V4 / this.V, gEff - 1);
        }
        this.P = this.gasP(this.V, this.T);
        return;
      }
      case 'difusion':
        this.V = 2;
        this.T = p.T;
        this.P = this.gasP(this.V, this.T);
        return;
      default: // isoterma
        this.V = V_LO + (V_HI - V_LO) * (0.5 + 0.5 * Math.sin(t * 0.7));
        this.T = p.T;
        this.P = this.gasP(this.V, this.T);
    }
  }

  /** Tramo del ciclo de Carnot en curso (0–3). */
  carnotLeg() {
    return Math.min(3, Math.floor(this.phase * 4));
  }

  carnotEfficiency() {
    return 1 - this.params.Tc / Math.max(this.params.Th, 1);
  }

  _seedRod() {
    const { Th, Tc } = this.params;
    for (let i = 0; i < ROD_N; i++) this.Trod[i] = i < ROD_N * 0.15 ? Th : Tc;
  }

  _seedParticles() {
    const rnd = lcg(12345);
    const h = this.gasHeight();
    for (let i = 0; i < N_PART; i++) {
      this._px[i] = -HW + 0.15 + rnd() * (2 * HW - 0.3);
      this._py[i] = BASE_Y + 0.15 + rnd() * Math.max(0.1, h - 0.3);
      const a = rnd() * Math.PI * 2;
      this._dx[i] = Math.cos(a);
      this._dy[i] = Math.sin(a);
    }
  }

  /** Altura del gas en el cilindro dibujado. */
  gasHeight() {
    return clamp((GAS_H_MAX * this.V) / this.Vref, 0.4, GAS_H_MAX);
  }

  /** Isotermas de guía (y adiabática en su modo) para el diagrama P–V. */
  _rebuildGuides() {
    const p = this.params;
    const guides = [];
    const Vmax = this.Vref * 1.15;
    // Rango del diagrama antes de generar las guías: los puntos por encima de
    // Pmax se descartan (las curvas son decrecientes, así que queda un tramo
    // contiguo) para no depender del recorte del lienzo.
    let Tmax;
    if (p.modo === 'carnot') Tmax = p.Th;
    else if (p.modo === 'adiabatica') Tmax = p.T * Math.pow(V0 / V_LO, p.gamma - 1);
    else Tmax = p.T * 1.25;
    this._plotX[0] = 0.5;
    this._plotX[1] = Vmax;
    this._plotY[0] = 0;
    this._plotY[1] = this.gasP(p.modo === 'carnot' ? CARNOT_V1 * 0.85 : V_LO * 0.85, Tmax);
    const Pmax = this._plotY[1];
    const curve = (fn, color, dash) => {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const V = 0.5 + ((Vmax - 0.5) * i) / 60;
        const P = fn(V);
        if (P <= Pmax) pts.push({ x: V, y: P });
      }
      guides.push({ points: pts, color, dash, width: 1.1 });
    };
    if (p.modo === 'carnot') {
      curve((V) => this.gasP(V, p.Th), 'force', [4, 3]);
      curve((V) => this.gasP(V, p.Tc), 'field', [4, 3]);
      this.cycle = [];
      const savedT = this.t;
      const savedPhase = this.phase;
      for (let i = 0; i <= 120; i++) {
        this.phase = Math.min(0.99999, i / 120);
        this._evalProcess();
        this.cycle.push({ x: this.V, y: this.P });
      }
      this.t = savedT;
      this.phase = savedPhase;
      this._evalProcess();
    } else if (p.modo === 'adiabatica') {
      curve((V) => this.gasP(V, p.T), 'textDim', [4, 3]);
      curve((V) => this.gasP(V, p.T * Math.pow(V0 / V, p.gamma - 1)), 'warn', [2, 3]);
      this.cycle = [];
    } else {
      curve((V) => this.gasP(V, p.T * 0.75), 'textDim', [4, 3]);
      curve((V) => this.gasP(V, p.T), 'textDim', [4, 3]);
      curve((V) => this.gasP(V, p.T * 1.25), 'textDim', [4, 3]);
      this.cycle = [];
    }
    this.guides = guides;
  }

  update(dt) {
    this.t += dt;
    this.phase = (this.phase + dt * 0.15) % 1;

    if (this.params.modo === 'difusion') {
      this._diffuse(dt);
      return;
    }

    const Vprev = this.V;
    const Tprev = this.T;
    const Pprev = this.P;
    this._evalProcess();
    // Primera ley paso a paso: W por el gas (trapecio) y Q = ΔU + W.
    const dW = 0.5 * (this.P + Pprev) * (this.V - Vprev);
    const dU = (this.params.n * (this.T - Tprev)) / (this.params.gamma - 1);
    this.W += dW;
    this.Q += dU + dW;
    if (dt > 0) {
      this.qRate = 0.85 * this.qRate + 0.15 * ((dU + dW) / dt);
      this.vRate = 0.85 * this.vRate + 0.15 * ((this.V - Vprev) / dt);
    }
    this.trace.push({ x: this.V, y: this.P });
    this._moveParticles(dt);
  }

  /** Esquema explícito con subpasos para mantener κ·dt/dx² ≤ 0.4 (estable). */
  _diffuse(dt) {
    const kappa = this.params.k * dt * 8;
    const sub = Math.max(1, Math.ceil(kappa / 0.4));
    const ks = kappa / sub;
    let cur = this.Trod;
    let nxt = this._rodNext;
    for (let s = 0; s < sub; s++) {
      for (let i = 1; i < ROD_N - 1; i++) {
        nxt[i] = cur[i] + ks * (cur[i - 1] - 2 * cur[i] + cur[i + 1]);
      }
      nxt[0] = this.params.Th;
      nxt[ROD_N - 1] = this.params.Tc;
      const tmp = cur;
      cur = nxt;
      nxt = tmp;
    }
    if (cur !== this.Trod) {
      this.Trod.set(cur);
    }
  }

  /** Partículas: rapidez ∝ √T, rebotan en paredes y pistón. */
  _moveParticles(dt) {
    const speed = 2.4 * Math.sqrt(this.T / 300);
    const top = BASE_Y + this.gasHeight() - 0.12;
    const bottom = BASE_Y + 0.12;
    const left = -HW + 0.12;
    const right = HW - 0.12;
    const px = this._px;
    const py = this._py;
    const dx = this._dx;
    const dy = this._dy;
    for (let i = 0; i < N_PART; i++) {
      px[i] += dx[i] * speed * dt;
      py[i] += dy[i] * speed * dt;
      if (px[i] < left) {
        px[i] = left;
        dx[i] = Math.abs(dx[i]);
      } else if (px[i] > right) {
        px[i] = right;
        dx[i] = -Math.abs(dx[i]);
      }
      if (py[i] < bottom) {
        py[i] = bottom;
        dy[i] = Math.abs(dy[i]);
      } else if (py[i] > top) {
        py[i] = top;
        dy[i] = -Math.abs(dy[i]);
      }
    }
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    if (this.params.modo === 'difusion') this._drawRod(scene);
    else this._drawGas(scene);
  }

  /** Color de temperatura entre los tokens frío (`field`) y caliente (`force`). */
  _tempColor(scene, T) {
    const u = clamp((T - T_COLD_REF) / (T_HOT_REF - T_COLD_REF), 0, 1);
    return thermalColor(scene.color('field'), scene.color('force'), u);
  }

  _drawGas(scene) {
    const p = this.params;
    const carnot = p.modo === 'carnot';
    const h = this.gasHeight();
    const gasTop = BASE_Y + h;
    const pistonY = gasTop + 0.2;

    // Cilindro: paredes gruesas y base rayada (sección sólida).
    scene.line(-HW - 0.12, BASE_Y, -HW - 0.12, WALL_TOP, { color: 'spring', width: 5 });
    scene.line(HW + 0.12, BASE_Y, HW + 0.12, WALL_TOP, { color: 'spring', width: 5 });
    scene.hatch(-HW - 0.3, BASE_Y - 0.06, HW + 0.3, BASE_Y - 0.06, { color: 'spring', side: 1, spacing: 9, length: 9 });

    // Gas: tono según T; partículas más rápidas cuanto más caliente.
    scene.rect(0, BASE_Y + h / 2, 2 * HW, h, { fill: this._tempColor(scene, this.T), stroke: false, alpha: 0.28 });
    for (let i = 0; i < N_PART; i++) {
      scene.circle(this._px[i], this._py[i], 0.09, { fill: 'text', color: 'text', stroke: false, alpha: 0.75 });
    }
    scene.chip(0, BASE_Y + h / 2, `T = ${roundTo(this.T, 0)} K`, { color: 'text', avoid: true });

    // Pistón y vástago.
    scene.rect(0, pistonY, 2 * HW + 0.2, 0.4, { fill: 'spring', color: 'spring', width: 1.5 });
    scene.line(0, pistonY + 0.2, 0, WALL_TOP + 1.2, { color: 'spring', width: 6 });
    scene.label(HW + 0.45, pistonY, 'pistón', { align: 'left', baseline: 'middle', size: 11, color: 'textDim', avoid: true });
    scene.dimension(-HW - 0.9, BASE_Y, -HW - 0.9, gasTop, `V = ${roundTo(this.V, 2)}`, { color: 'textDim' });

    // Trabajo: flecha sobre el pistón en el sentido del movimiento.
    if (Math.abs(this.vRate) > 0.02) {
      const up = this.vRate > 0;
      scene.vector(HW + 1.7, pistonY + (up ? 0.3 : 1.5), 0, up ? 1.2 : -1.2, {
        color: 'energy',
        label: up ? 'W (gas empuja)' : 'W (sobre el gas)',
        labelSide: -1
      });
    }

    // Calor: entra por la base (caliente) o sale (frío). Adiabática: nada.
    const foco = carnot ? (this.carnotLeg() === 0 ? 'hot' : this.carnotLeg() === 2 ? 'cold' : 'none') : null;
    if (foco === 'hot' || foco === 'cold') {
      scene.rect(0, BASE_Y - 0.75, 2 * HW + 0.6, 0.8, { fill: foco === 'hot' ? 'force' : 'field', color: foco === 'hot' ? 'force' : 'field', alpha: 0.85 });
      scene.label(0, BASE_Y - 0.75, foco === 'hot' ? `Foco caliente · Th = ${p.Th} K` : `Foco frío · Tc = ${p.Tc} K`, {
        baseline: 'middle',
        size: 11,
        weight: '600',
        color: 'text',
        avoid: true
      });
    } else if (carnot) {
      scene.hatch(-HW - 0.3, BASE_Y - 0.45, HW + 0.3, BASE_Y - 0.45, { color: 'textDim', side: 1, spacing: 7, length: 6 });
      scene.label(0, BASE_Y - 0.75, 'aislado (Q = 0)', { baseline: 'top', size: 11, color: 'textDim', avoid: true });
    }
    if (p.modo === 'adiabatica') {
      scene.hatch(-HW - 0.3, BASE_Y - 0.45, HW + 0.3, BASE_Y - 0.45, { color: 'textDim', side: 1, spacing: 7, length: 6 });
      scene.label(0, BASE_Y - 0.75, 'paredes aislantes · Q = 0', { baseline: 'top', size: 11, color: 'textDim', avoid: true });
    } else if (Math.abs(this.qRate) > 2) {
      const entra = this.qRate > 0;
      const y0 = carnot ? BASE_Y - 1.3 : BASE_Y - 0.15;
      scene.vector(-HW - 1.9, entra ? y0 - 1.4 : y0, 0, entra ? 1.2 : -1.2, {
        color: entra ? 'force' : 'field',
        width: 3,
        label: entra ? 'Q entra' : 'Q sale',
        labelSide: 1
      });
    }

    // —— HUD: estado, primera ley y diagrama P–V.
    const hud = scene.hud;
    hud.chip(MODE_LABEL[p.modo] || p.modo, 'top-left', { color: 'mass' });
    if (carnot) hud.chip(CARNOT_LEGS[this.carnotLeg()], 'top-left', { color: this.carnotLeg() % 2 === 0 ? 'force' : 'textDim' });
    else if (p.modo === 'adiabatica') hud.chip('Sin intercambio de calor: ΔU = −W', 'top-left', { color: 'warn' });
    else if (p.modo === 'isoterma') hud.chip('ΔU = 0 → todo el calor se convierte en trabajo', 'top-left', { color: 'textDim' });
    else if (p.modo === 'isocora') hud.chip('W = 0 → todo el calor va a energía interna', 'top-left', { color: 'textDim' });
    else hud.chip('P fija: el gas se expande al calentarse', 'top-left', { color: 'textDim' });

    const rows = [
      { label: 'P', value: this.P, unit: '' },
      { label: 'V', value: this.V, unit: '' },
      { label: 'T', value: roundTo(this.T, 0), unit: 'K' },
      { label: 'ΔU', value: this.internalEnergy() - this.U0, unit: '' },
      { label: 'Q', value: this.Q, unit: '' },
      { label: 'W', value: this.W, unit: '' }
    ];
    if (carnot) rows.push({ label: 'η', value: roundTo(this.carnotEfficiency() * 100, 1), unit: '%' });
    hud.readout(rows, 'bottom-left', { decimals: 1 });

    const vp = scene.viewport();
    if (vp.w > 420) {
      this._dot[0].x = this.V;
      this._dot[0].y = this.P;
      const series = [...this.guides];
      if (carnot && this.cycle.length) series.push({ points: this.cycle, color: 'ray', dash: [], width: 1.6 });
      series.push({ points: this.trace, color: 'energy', dash: [], width: 2.2 });
      series.push({ points: this._dot, color: 'mass2', pointSize: 5 });
      hud.plot(
        { x: vp.x + vp.w * 0.56, y: vp.y + 14, w: vp.w * 0.42, h: vp.h * 0.62 },
        { title: 'Diagrama P–V  (V →, P ↑)', series, xRange: this._plotX, yRange: this._plotY }
      );
      const legend = [{ color: 'mass2', label: 'Estado actual (P, V)', dash: [] }, { color: 'energy', label: 'Trayectoria del proceso', dash: [] }];
      if (carnot) {
        legend.push({ color: 'ray', label: 'Ciclo completo', dash: [] });
        legend.push({ color: 'force', label: 'Isoterma Th', dash: [4, 3] });
        legend.push({ color: 'field', label: 'Isoterma Tc', dash: [4, 3] });
      } else if (p.modo === 'adiabatica') {
        legend.push({ color: 'warn', label: 'Adiabática T·V^(γ−1) = cte', dash: [2, 3] });
        legend.push({ color: 'textDim', label: 'Isoterma de referencia', dash: [4, 3] });
      } else {
        legend.push({ color: 'textDim', label: 'Isotermas de guía', dash: [4, 3] });
      }
      hud.legend(legend, 'bottom-right');
    }
  }

  _drawRod(scene) {
    const p = this.params;
    const x0 = -6;
    const x1 = 6;
    const cell = (x1 - x0) / (ROD_N - 1);

    // Focos en los extremos.
    scene.rect(x0 - 1.0, 0, 1.4, 2.2, { fill: 'force', color: 'force', alpha: 0.75 });
    scene.rect(x1 + 1.0, 0, 1.4, 2.2, { fill: 'field', color: 'field', alpha: 0.75 });
    scene.label(x0 - 1.0, 1.35, `Th = ${p.Th} K`, { color: 'force', weight: '700', avoid: true });
    scene.label(x1 + 1.0, 1.35, `Tc = ${p.Tc} K`, { color: 'field', weight: '700', avoid: true });

    // Barra: una celda por nodo, tono según T; la forma (barra continua) la
    // da el contorno, y la lectura numérica la gráfica T(x).
    for (let i = 0; i < ROD_N; i++) {
      const x = x0 + cell * i;
      scene.rect(x, 0, cell + 0.02, 0.9, { fill: this._tempColor(scene, this.Trod[i]), stroke: false, alpha: 0.9 });
      this._profile[i].x = x;
      this._profile[i].y = this.Trod[i];
    }
    scene.rect(0, 0, x1 - x0 + cell, 0.9, { color: 'spring', width: 1.5 });
    scene.vector(x0 + 0.5, 1.0, 4, 0, { color: 'force', width: 2.2, label: 'flujo de calor', labelSide: -1 });
    scene.label(0, -0.7, 'barra conductora', { baseline: 'top', size: 11, color: 'textDim', avoid: true });

    // Perfil T(x) y lectura.
    const mid = this.Trod[ROD_N >> 1];
    const hud = scene.hud;
    hud.chip(MODE_LABEL.difusion, 'top-left', { color: 'mass' });
    hud.chip(`κ = ${roundTo(p.k, 2)} · el perfil tiende a una recta`, 'top-left', { color: 'textDim' });
    hud.readout(
      [
        { label: 'T centro', value: roundTo(mid, 1), unit: 'K' },
        { label: 'ΔT extremos', value: p.Th - p.Tc, unit: 'K' },
        { label: 'flujo ∝ κ·dT/dx', value: roundTo(p.k * (this.Trod[0] - this.Trod[1]) / cell, 1), unit: '' }
      ],
      'bottom-left'
    );
    hud.legend(
      [
        { color: 'force', label: 'Caliente (Th)', dash: [] },
        { color: 'field', label: 'Frío (Tc)', dash: [] },
        { color: 'energy', label: 'Perfil T(x)', dash: [] }
      ],
      'bottom-left'
    );
    const vp = scene.viewport();
    if (vp.w > 420) {
      hud.plot(
        { x: vp.x + vp.w * 0.52, y: vp.y + vp.h * 0.56, w: vp.w * 0.45, h: vp.h * 0.4 },
        {
          title: 'Perfil de temperatura T(x)',
          series: [{ points: this._profile, color: 'energy', dash: [], width: 2 }],
          xRange: [x0, x1],
          yRange: [Math.min(p.Tc, p.Th) - 10, Math.max(p.Tc, p.Th) + 10]
        }
      );
    }
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    const p = this.params;
    if (p.modo === 'difusion') {
      return {
        'Th': { value: p.Th, unit: 'K' },
        'Tc': { value: p.Tc, unit: 'K' },
        'κ': { value: p.k, unit: '' },
        'T centro barra': { value: roundTo(this.Trod[ROD_N >> 1], 2), unit: 'K' },
        't': { value: roundTo(this.t, 2), unit: 's' }
      };
    }
    const out = {
      'P': { value: roundTo(this.P, 2), unit: '(sim)' },
      'V': { value: roundTo(this.V, 3), unit: '(sim)' },
      'T': { value: roundTo(this.T, 1), unit: 'K' },
      'n': { value: p.n, unit: 'mol (sim)' },
      'U = nRT/(γ−1)': { value: roundTo(this.internalEnergy(), 2), unit: '' },
      'ΔU desde reinicio': { value: roundTo(this.internalEnergy() - this.U0, 2), unit: '' },
      'Q recibido': { value: roundTo(this.Q, 2), unit: '' },
      'W hecho por el gas': { value: roundTo(this.W, 2), unit: '' }
    };
    if (p.modo === 'carnot') {
      const { V1, V2 } = this.carnot;
      out['η Carnot'] = { value: roundTo(this.carnotEfficiency() * 100, 2), unit: '%' };
      out['W por ciclo'] = { value: roundTo(p.n * (p.Th - p.Tc) * Math.log(V2 / V1), 2), unit: '' };
      out['Tramo'] = { value: this.carnotLeg() + 1, unit: 'de 4' };
    }
    return out;
  }

  getState() {
    return {
      t: this.t,
      phase: this.phase,
      V: this.V,
      T: this.T,
      P: this.P,
      W: this.W,
      Q: this.Q,
      U0: this.U0,
      params: { ...this.params },
      Trod: Array.from(this.Trod)
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.phase)) this.phase = s.phase;
    if (Number.isFinite(s.V)) this.V = s.V;
    if (Number.isFinite(s.T)) this.T = s.T;
    if (Number.isFinite(s.P)) this.P = s.P;
    if (Number.isFinite(s.W)) this.W = s.W;
    if (Number.isFinite(s.Q)) this.Q = s.Q;
    if (Number.isFinite(s.U0)) this.U0 = s.U0;
    if (Array.isArray(s.Trod)) {
      for (let i = 0; i < ROD_N; i++) this.Trod[i] = Number.isFinite(s.Trod[i]) ? s.Trod[i] : this.params.Tc;
    }
    this._setupCarnot();
    this.Vref = this.params.modo === 'carnot' ? this.carnot.V3 : V_HI;
    this._rebuildGuides();
    this.trace.clear();
  }

  destroy() {
    this.trace.clear();
    this.guides = [];
    this.cycle = [];
  }
}
