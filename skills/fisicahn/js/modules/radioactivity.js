/**
 * @fileoverview Decaimiento radiactivo — N(t) = N₀·e^(−λt), vida media T½,
 * actividad A = λN y los tres tipos de emisión (α, β⁻, γ).
 *
 * Cada núcleo de la muestra es un proceso de Poisson: en cada paso decae con
 * probabilidad 1 − e^(−λ·dt), independiente de su edad. Con pocos núcleos la
 * curva medida se aparta de la exponencial teórica (fluctuaciones ∝ √N); con
 * muchos, la sigue de cerca — eso es lo que enseña la gráfica N(t) del HUD,
 * donde la curva medida (sólida) y la teórica (a trazos) se superponen.
 *
 * El tipo de decaimiento cambia qué partícula sale del núcleo (α pesada y
 * lenta, β⁻ ligera y rápida, γ un fotón sin masa), la ecuación nuclear que se
 * muestra y el aspecto del núcleo hijo; no cambia la ley exponencial, que es
 * la misma para los tres.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo, clamp } from '../core/geometry.js';

/** Región del lienzo ocupada por la muestra (centrada en el origen, §17.1). */
const SAMPLE_W = 8.4;
const SAMPLE_H = 9;
/** Partículas emitidas simultáneas como máximo (pool fijo, §3.2). */
const MAX_PARTICLES = 48;
/** Muestreo de la gráfica N(t): un punto cada 0,1 s. */
const SAMPLE_DT = 0.1;
const HISTORY_CAP = 600;

/** Propiedades visuales y físicas de cada tipo de emisión. */
const DECAY = {
  alfa: {
    label: 'α',
    name: 'alfa (α)',
    equation: 'α: ᴬZ X → ᴬ⁻⁴(Z−2) Y + ⁴₂He',
    change: 'el núcleo pierde 2 protones y 2 neutrones',
    speed: 1.6,
    life: 0.9,
    r: 0.16,
    color: 'mass2'
  },
  beta: {
    label: 'β⁻',
    name: 'beta (β⁻)',
    equation: 'β⁻: ᴬZ X → ᴬ(Z+1) Y + e⁻ + ν̄',
    change: 'un neutrón se convierte en protón',
    speed: 4.5,
    life: 1.1,
    r: 0.08,
    color: 'field'
  },
  gamma: {
    label: 'γ',
    name: 'gamma (γ)',
    equation: 'γ: ᴬZ X* → ᴬZ X + γ',
    change: 'mismo núcleo, pierde energía de excitación',
    speed: 6,
    life: 1.0,
    r: 0.1,
    color: 'ray'
  }
};

export default class RadioactivityModule extends SimModule {
  static viewport = { width: 24, height: 13 };

  /** La muestra vive centrada en el origen. */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'tipo',
      type: 'select',
      label: 'Tipo de decaimiento',
      value: 'alfa',
      options: [
        { value: 'alfa', label: 'Alfa (α): núcleo de He' },
        { value: 'beta', label: 'Beta (β⁻): electrón' },
        { value: 'gamma', label: 'Gamma (γ): fotón' }
      ]
    },
    { id: 'N0', label: 'Núcleos iniciales', latex: 'N_0', min: 20, max: 300, step: 10, value: 120 },
    { id: 'halfLife', label: 'Vida media', latex: 'T_{1/2}', unit: 's', min: 2, max: 30, step: 0.5, value: 8 },
    { id: 'showCurve', type: 'checkbox', label: 'Mostrar curva teórica N₀·e^(−λt)', value: true }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { tipo: 'alfa', N0: 120, halfLife: 8, showCurve: true };
    this.t = 0;
    /** 1 = intacto, 0 = decaído; índice = posición en la rejilla. */
    this.alive = [];
    this.aliveCount = 0;
    /** Rejilla de la muestra (se recalcula en reset). */
    this.cols = 1;
    this.rows = 1;
    this.spacing = 0.5;
    /** Historial N(t) medido para la gráfica. */
    this.history = new TrailBuffer(HISTORY_CAP);
    this.sampleAcc = 0;
    /** Pool de partículas emitidas: { x, y, vx, vy, life }. */
    this.particles = [];
    /** Decaimientos totales (para la actividad medida). */
    this.decays = 0;
    this.decaysWindow = 0;
    this.windowT = 0;
    this.activityMeasured = 0;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Decaimiento radiactivo',
      blurb: meta?.blurb || 'Núcleos que decaen al azar: ley exponencial, vida media T½ y actividad A = λN.',
      story:
        'El decaimiento es un proceso de Poisson: cada núcleo tiene probabilidad λ·dt de desintegrarse en el siguiente instante, independiente de su edad. Nadie puede predecir cuándo decaerá un núcleo concreto, pero con muchos núcleos la fracción que queda sigue la exponencial N = N₀·e^(−λt) con precisión creciente. En cada vida media T½ la mitad de los núcleos intactos desaparece, sea cual sea el tipo de emisión (α, β o γ).',
      cases: [
        'Datación con carbono-14 (β⁻, T½ = 5730 años).',
        'Isótopos médicos de vida media corta (Tc-99m: γ, 6 h).',
        'Detectores de humo (americio-241: α).',
        'Actividad A = λN: por qué una muestra joven «cuenta» más en el Geiger.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Ley de decaimiento', formula: 'N(t) = N_0\\,e^{-\\lambda t}' },
        { name: 'Vida media', formula: 'T_{1/2} = \\dfrac{\\ln 2}{\\lambda}' },
        { name: 'Actividad', formula: 'A = \\lambda N = -\\dfrac{dN}{dt}' },
        { name: 'Probabilidad por paso', formula: 'p = 1 - e^{-\\lambda\\,\\Delta t}', note: 'La que usa la simulación para cada núcleo.' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this._normalizeParams();
    this.t = 0;
    this._spawn();
    this.history.clear();
    this.sampleAcc = 0;
    this.particles.length = 0;
    this.decays = 0;
    this.decaysWindow = 0;
    this.windowT = 0;
    this.activityMeasured = 0;
    this.history.push({ x: 0, y: this.aliveCount });
    this.engine?.reset?.();
  }

  _normalizeParams() {
    const p = this.params;
    p.N0 = clamp(Math.round(Number(p.N0) || 20), 1, 600);
    p.halfLife = Math.max(0.1, Number(p.halfLife) || 8);
    if (!(p.tipo in DECAY)) p.tipo = 'alfa';
    p.showCurve = p.showCurve !== false && p.showCurve !== 'false';
  }

  /** Rejilla regular que llena la región de la muestra según N₀. */
  _layout() {
    const N0 = this.params.N0;
    this.cols = Math.max(1, Math.ceil(Math.sqrt(N0 * (SAMPLE_W / SAMPLE_H))));
    this.rows = Math.max(1, Math.ceil(N0 / this.cols));
    this.spacing = Math.min(SAMPLE_W / this.cols, SAMPLE_H / this.rows);
  }

  _spawn() {
    this._layout();
    const N0 = this.params.N0;
    this.alive.length = N0;
    for (let i = 0; i < N0; i++) this.alive[i] = 1;
    this.aliveCount = N0;
  }

  /** Posición del núcleo i en la rejilla (escribe en `out`). */
  atomPos(i, out) {
    const c = i % this.cols;
    const r = Math.floor(i / this.cols);
    out.x = (c - (this.cols - 1) / 2) * this.spacing;
    out.y = ((this.rows - 1) / 2 - r) * this.spacing;
    return out;
  }

  /* ---------- física ---------- */

  lambda() {
    return Math.LN2 / Math.max(this.params.halfLife, 0.1);
  }

  theoreticalN(t = this.t) {
    return this.params.N0 * Math.exp(-this.lambda() * t);
  }

  activity() {
    return this.lambda() * this.aliveCount;
  }

  update(dt) {
    this.t += dt;
    const lam = this.lambda();
    const p = 1 - Math.exp(-lam * dt);
    const kind = DECAY[this.params.tipo];
    const alive = this.alive;
    for (let i = 0; i < alive.length; i++) {
      if (alive[i] && Math.random() < p) {
        alive[i] = 0;
        this.aliveCount--;
        this.decays++;
        this.decaysWindow++;
        this._emit(i, kind);
      }
    }

    // Partículas emitidas: vuelo rectilíneo con vida limitada, pool compacto.
    let w = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const q = this.particles[i];
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.life -= dt;
      if (q.life > 0) {
        if (w !== i) this.particles[w] = q;
        w++;
      }
    }
    this.particles.length = w;

    // Actividad medida: decaimientos por segundo en ventanas de 1 s.
    this.windowT += dt;
    if (this.windowT >= 1) {
      this.activityMeasured = this.decaysWindow / this.windowT;
      this.decaysWindow = 0;
      this.windowT = 0;
    }

    this.sampleAcc += dt;
    if (this.sampleAcc >= SAMPLE_DT) {
      this.sampleAcc -= SAMPLE_DT;
      this.history.push({ x: this.t, y: this.aliveCount });
    }
  }

  /** Lanza la partícula del decaimiento del núcleo i en dirección aleatoria. */
  _emit(i, kind) {
    if (this.particles.length >= MAX_PARTICLES) return;
    const pos = this.atomPos(i, { x: 0, y: 0 });
    const ang = Math.random() * Math.PI * 2;
    this.particles.push({
      x: pos.x,
      y: pos.y,
      vx: Math.cos(ang) * kind.speed,
      vy: Math.sin(ang) * kind.speed,
      life: kind.life
    });
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const kind = DECAY[this.params.tipo];
    const r = Math.max(0.06, this.spacing * 0.3);
    const pos = { x: 0, y: 0 };

    // Marco de la muestra.
    scene.rect(0, 0, SAMPLE_W + 0.8, SAMPLE_H + 0.8, { color: 'textDim', width: 1, dash: [6, 4], alpha: 0.6 });
    scene.label(0, SAMPLE_H / 2 + 0.6, `Muestra: ${this.aliveCount} de ${this.params.N0} núcleos intactos`, {
      color: 'text',
      size: 12,
      avoid: true
    });

    // Núcleos: intacto = disco relleno; decaído = anillo hueco (forma, no solo color).
    const alive = this.alive;
    for (let i = 0; i < alive.length; i++) {
      this.atomPos(i, pos);
      if (alive[i]) scene.circle(pos.x, pos.y, r, { color: 'mass', fill: 'mass', width: 1 });
      else scene.circle(pos.x, pos.y, r * 0.8, { color: 'textDim', width: 1, alpha: 0.55 });
    }

    // Partículas emitidas: α disco, β⁻ punto, γ garabato de fotón.
    for (let i = 0; i < this.particles.length; i++) {
      const q = this.particles[i];
      const a = Math.min(1, q.life / kind.life + 0.2);
      if (this.params.tipo === 'gamma') {
        const ang = Math.atan2(q.vy, q.vx);
        scene.photon(q.x - Math.cos(ang) * 0.5, q.y - Math.sin(ang) * 0.5, ang, 0.6, {
          color: 'ray',
          width: 1.6,
          amplitude: 0.07,
          waves: 2,
          alpha: a,
          phase: -this.t * 14
        });
      } else {
        scene.circle(q.x, q.y, kind.r, { color: kind.color, fill: kind.color, alpha: a, width: 1 });
      }
    }

    // Ecuación nuclear del tipo elegido, bajo la muestra.
    scene.label(0, -SAMPLE_H / 2 - 0.7, kind.equation, { color: kind.color, size: 12, avoid: true });
    scene.label(0, -SAMPLE_H / 2 - 1.25, kind.change, { color: 'textDim', size: 10, avoid: true });

    this._drawHud(scene, kind);
  }

  _drawHud(scene, kind) {
    const hud = scene.hud;
    const { N0, halfLife } = this.params;
    const halfLives = this.t / halfLife;
    hud.chip(`t = ${roundTo(this.t, 1)} s · ${roundTo(halfLives, 2)} vidas medias`, 'top-left', { color: 'text' });
    hud.readout(
      [
        { label: 'N', value: this.aliveCount, unit: '' },
        { label: 'N teórica', value: this.theoreticalN(), unit: '' },
        { label: 'λ', value: this.lambda(), unit: '1/s' },
        { label: 'A = λN', value: this.activity(), unit: '1/s' },
        { label: 'A medida', value: this.activityMeasured, unit: '1/s' }
      ],
      'top-left'
    );
    hud.legend(
      [
        { color: 'mass', label: 'núcleo intacto (disco)', dash: [] },
        { color: 'textDim', label: 'núcleo decaído (anillo)', dash: [2, 3] },
        { color: kind.color, label: `partícula ${kind.label}`, dash: [1, 2] }
      ],
      'bottom-left'
    );

    // Gráfica N(t): medida (sólida) frente a teórica (a trazos) y marca de T½.
    const vp = scene.viewport();
    if (vp.w > 420) {
      const tMax = Math.max(this.t, halfLife * 3);
      const series = [{ points: this.history, color: 'mass', label: 'N medida', dash: [], width: 2.2 }];
      if (this.params.showCurve) {
        const pts = [];
        const M = 60;
        for (let i = 0; i <= M; i++) {
          const tt = (tMax * i) / M;
          pts.push({ x: tt, y: this.theoreticalN(tt) });
        }
        series.push({ points: pts, color: 'warn', dash: [6, 4], width: 1.8 });
        // Marca de T½: N₀/2 en t = T½.
        series.push({
          points: [
            { x: 0, y: N0 / 2 },
            { x: halfLife, y: N0 / 2 },
            { x: halfLife, y: 0 }
          ],
          color: 'textDim',
          dash: [2, 3],
          width: 1
        });
      }
      hud.plot(
        { x: vp.x + vp.w - 292, y: vp.y + vp.h - 186, w: 278, h: 172 },
        {
          title: this.params.showCurve ? `N(t): medida — · teórica ╌ · T½ = ${halfLife} s` : 'N(t) medida',
          series,
          xRange: [0, tMax],
          yRange: [0, N0]
        }
      );
      hud.legend(
        this.params.showCurve
          ? [
              { color: 'mass', label: 'N medida', dash: [] },
              { color: 'warn', label: 'N₀·e^(−λt)', dash: [6, 4] }
            ]
          : [{ color: 'mass', label: 'N medida', dash: [] }],
        'top-right'
      );
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const { N0, halfLife, tipo } = this.params;
    return {
      t: { value: roundTo(this.t, 2), unit: 's' },
      'T½': { value: halfLife, unit: 's' },
      'vidas medias': { value: roundTo(this.t / halfLife, 3), unit: '' },
      N: { value: this.aliveCount, unit: '' },
      'N₀': { value: N0, unit: '' },
      'N teórica': { value: roundTo(this.theoreticalN(), 1), unit: '' },
      λ: { value: roundTo(this.lambda(), 4), unit: '1/s' },
      'A = λN': { value: roundTo(this.activity(), 2), unit: '1/s' },
      'A medida': { value: roundTo(this.activityMeasured, 2), unit: '1/s' },
      decaimientos: { value: this.decays, unit: '' },
      tipo: { value: DECAY[tipo].name, unit: '' },
      partícula: { value: DECAY[tipo].label, unit: '' }
    };
  }

  getState() {
    return {
      t: this.t,
      params: { ...this.params },
      alive: this.alive.slice(),
      decays: this.decays,
      activityMeasured: this.activityMeasured,
      history: this.history.toArray().map((p) => ({ x: p.x, y: p.y }))
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    this._normalizeParams();
    this._layout();
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Array.isArray(s.alive) && s.alive.length) {
      this.alive = s.alive.map((v) => (v ? 1 : 0));
      this.params.N0 = this.alive.length;
      this._layout();
    } else {
      this._spawn();
    }
    this.aliveCount = 0;
    for (let i = 0; i < this.alive.length; i++) this.aliveCount += this.alive[i];
    if (Number.isFinite(s.decays)) this.decays = s.decays;
    if (Number.isFinite(s.activityMeasured)) this.activityMeasured = s.activityMeasured;
    this.history.clear();
    if (Array.isArray(s.history)) for (const p of s.history) this.history.push({ x: p.x, y: p.y });
    this.particles.length = 0;
    this.sampleAcc = 0;
    this.decaysWindow = 0;
    this.windowT = 0;
  }

  destroy() {
    this.alive.length = 0;
    this.particles.length = 0;
    this.history.clear();
  }
}
