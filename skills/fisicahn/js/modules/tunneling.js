/**
 * @fileoverview Túnel cuántico — barrera rectangular de altura V₀ y ancho L.
 *
 * Unidades pedagógicas con ħ = 1: k = √(2mE) fuera de la barrera y, si
 * E < V₀, κ = √(2m(V₀ − E)) dentro, donde la función de onda decae como
 * e^(−κx) en vez de anularse. Dos coeficientes de transmisión conviven:
 *
 *  - la aproximación de barrera gruesa del libro, T ≈ e^(−2κL) (la fórmula
 *    que se muestra y que usaba la versión anterior del módulo), y
 *  - la solución exacta de la barrera rectangular,
 *    T = 1 / [1 + V₀²·sinh²(κL) / (4E(V₀ − E))] para E < V₀ y
 *    T = 1 / [1 + V₀²·sin²(k₂L) / (4E(E − V₀))] para E > V₀ (resonancias),
 *    que es la que decide el destino de cada partícula y la curva T(E).
 *
 * Dos vistas (`modo`): `particulas` lanza paquetes contra la barrera y cuenta
 * transmitidos/reflejados (Monte Carlo sobre T) para comparar la fracción
 * medida con la teórica; `onda` dibuja la función de onda estacionaria con su
 * envolvente: interferencia incidente+reflejada a la izquierda, decaimiento
 * exponencial dentro y onda transmitida de amplitud √T a la derecha.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo, clamp } from '../core/geometry.js';

/** Eje x del montaje (unidades de mundo). */
const X_MIN = -10;
const X_MAX = 10;
/** Suelo del potencial (V = 0) y escala vertical de energía (u por unidad de E). */
const Y0 = -3.2;
const SY = 0.42;
/** Amplitud visual de ψ (unidades de mundo) y puntos de la polilínea. */
const PSI_AMP = 1.05;
const WAVE_N = 260;
const DECAY_N = 30;
/** Paquetes por segundo y rapidez. */
const SPAWN_RATE = 2.5;
const PACKET_SPEED = 2.2;
const MAX_PACKETS = 40;
/** Rango del control de E (dominio de la gráfica T(E)). */
const E_MIN = 0.5;
const E_MAX = 12;

export default class TunnelingModule extends SimModule {
  static viewport = { width: 22, height: 14 };

  /** La barrera está centrada en el origen (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Vista',
      value: 'particulas',
      options: [
        { value: 'particulas', label: 'Partículas (Monte Carlo)' },
        { value: 'onda', label: 'Función de onda ψ' }
      ]
    },
    { id: 'E', label: 'Energía de la partícula', latex: 'E', min: E_MIN, max: E_MAX, step: 0.1, value: 4 },
    { id: 'V0', label: 'Altura de la barrera', latex: 'V_0', min: 1, max: 15, step: 0.1, value: 8 },
    { id: 'L', label: 'Ancho de la barrera', latex: 'L', min: 0.3, max: 3, step: 0.05, value: 1.2 },
    { id: 'm', label: 'Masa', latex: 'm', min: 0.5, max: 3, step: 0.1, value: 1 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { modo: 'particulas', E: 4, V0: 8, L: 1.2, m: 1 };
    this.t = 0;
    /** Paquetes en vuelo: { x, vx, phase, decided, tunnel }. */
    this.packets = [];
    this.spawnAcc = 0;
    this.nTransmitted = 0;
    this.nReflected = 0;
    /** Buffers reutilizados para ψ y su envolvente (sin asignar por frame). */
    this._wave = new Array(WAVE_N + 1);
    this._envTop = new Array(WAVE_N + 1);
    this._envBot = new Array(WAVE_N + 1);
    for (let i = 0; i <= WAVE_N; i++) {
      this._wave[i] = { x: 0, y: 0 };
      this._envTop[i] = { x: 0, y: 0 };
      this._envBot[i] = { x: 0, y: 0 };
    }
    /** Boceto del decaimiento dentro de la barrera (vista partículas). */
    this._decay = new Array(DECAY_N + 1);
    for (let i = 0; i <= DECAY_N; i++) this._decay[i] = { x: 0, y: 0 };
    /** Curvas T(E) cacheadas por (V0, L, m). */
    this._curveKey = '';
    this._curveExact = [];
    this._curveApprox = [];
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Túnel cuántico',
      blurb: meta?.blurb || 'Barrera de potencial: probabilidad de transmisión aunque E < V₀.',
      story:
        'En mecánica clásica una partícula con E < V₀ rebota siempre. En cuántica la función de onda no se anula dentro de la barrera: decae como e^(−κx) y sale por el otro lado con amplitud reducida, así que hay una probabilidad finita T de atravesarla. T cae exponencialmente con el ancho L y con √(V₀ − E): por eso el efecto solo cuenta a escala atómica y nuclear.',
      cases: [
        'Microscopio de efecto túnel (STM): la corriente cae 10× por cada 0,1 nm.',
        'Fusión nuclear en el Sol: los protones atraviesan la barrera de Coulomb.',
        'Decaimiento alfa (Gamow, 1928) y diodos túnel.',
        'Memoria flash: los electrones cruzan un óxido aislante por túnel.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'κ (E < V₀)', formula: '\\kappa = \\dfrac{\\sqrt{2m(V_0 - E)}}{\\hbar}' },
        { name: 'Transmisión (barrera gruesa)', formula: 'T \\approx e^{-2\\kappa L}', note: 'Válida cuando κL ≫ 1.' },
        {
          name: 'Transmisión exacta',
          formula: 'T = \\left[1 + \\dfrac{V_0^2\\,\\sinh^2(\\kappa L)}{4E(V_0 - E)}\\right]^{-1}',
          note: 'Para E > V₀ cambia sinh por sin y κ por k₂: aparecen resonancias con T = 1.'
        },
        { name: 'Reflexión', formula: 'R = 1 - T' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this._normalizeParams();
    this.t = 0;
    this.packets.length = 0;
    this.spawnAcc = 0;
    this.nTransmitted = 0;
    this.nReflected = 0;
    this.engine?.reset?.();
  }

  _normalizeParams() {
    const p = this.params;
    p.E = clamp(Number(p.E) || E_MIN, 0.05, 50);
    p.V0 = clamp(Number(p.V0) || 1, 0.05, 50);
    p.L = clamp(Number(p.L) || 0.3, 0.05, 6);
    p.m = clamp(Number(p.m) || 1, 0.05, 10);
    if (p.modo !== 'onda') p.modo = 'particulas';
  }

  /* ---------- física (ħ = 1) ---------- */

  /** Número de onda fuera de la barrera. */
  k(E = this.params.E) {
    return Math.sqrt(2 * this.params.m * E);
  }

  /** Constante de decaimiento dentro de la barrera (0 si E ≥ V₀). */
  kappa(E = this.params.E) {
    const d = this.params.V0 - E;
    return d <= 0 ? 0 : Math.sqrt(2 * this.params.m * d);
  }

  /** T ≈ e^(−2κL): aproximación de barrera gruesa del libro. */
  tApprox(E = this.params.E) {
    if (E >= this.params.V0) return 1;
    return Math.exp(-2 * this.kappa(E) * this.params.L);
  }

  /** T exacta de la barrera rectangular (incluye resonancias para E > V₀). */
  tExact(E = this.params.E) {
    const { V0, L, m } = this.params;
    const d = V0 - E;
    if (Math.abs(d) < 1e-9) return 1 / (1 + (m * V0 * L * L) / 2);
    if (d > 0) {
      const s = Math.sinh(this.kappa(E) * L);
      return 1 / (1 + (V0 * V0 * s * s) / (4 * E * d));
    }
    const k2 = Math.sqrt(2 * m * (E - V0));
    const s = Math.sin(k2 * L);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
  }

  /** Fracción medida de transmitidos (0 si aún no hay datos). */
  tMeasured() {
    const n = this.nTransmitted + this.nReflected;
    return n ? this.nTransmitted / n : 0;
  }

  update(dt) {
    this.t += dt;
    if (this.params.modo !== 'particulas') return;

    this.spawnAcc += SPAWN_RATE * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.packets.length < MAX_PACKETS) {
        this.packets.push({ x: X_MIN + 1, vx: PACKET_SPEED, phase: Math.random() * Math.PI * 2, decided: false, tunnel: false });
      }
    }

    const T = this.tExact();
    const bl = -this.params.L / 2;
    const br = this.params.L / 2;
    let w = 0;
    for (let i = 0; i < this.packets.length; i++) {
      const p = this.packets[i];
      p.x += p.vx * dt;
      if (!p.decided && p.x >= bl) {
        p.decided = true;
        if (Math.random() < T) {
          p.x = br + 0.05;
          p.tunnel = true;
          this.nTransmitted++;
        } else {
          p.vx = -Math.abs(p.vx);
          this.nReflected++;
        }
      }
      if (p.x < X_MAX - 0.5 && p.x > X_MIN + 0.5) {
        if (w !== i) this.packets[w] = p;
        w++;
      }
    }
    this.packets.length = w;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { E, V0, L } = this.params;
    const yE = Y0 + E * SY;
    const hB = V0 * SY;
    const tunnelRegime = E < V0;

    // Suelo del potencial y barrera.
    scene.line(X_MIN, Y0, X_MAX, Y0, { color: 'axis', width: 1.5 });
    scene.label(X_MIN + 0.1, Y0 - 0.15, 'V = 0', { color: 'textDim', size: 11, align: 'left', baseline: 'top', avoid: true });
    scene.rect(0, Y0 + hB / 2, L, hB, { color: 'force', fill: 'force', alpha: 0.28, width: 2.2 });
    scene.line(-L / 2, Y0, -L / 2, Y0 + hB, { color: 'force', width: 2.2 });
    scene.line(L / 2, Y0, L / 2, Y0 + hB, { color: 'force', width: 2.2 });
    scene.line(-L / 2, Y0 + hB, L / 2, Y0 + hB, { color: 'force', width: 2.2 });
    scene.label(0, Y0 + hB + 0.2, `V₀ = ${roundTo(V0, 1)}`, { color: 'force', size: 12, weight: '600', avoid: true });
    scene.dimension(-L / 2, Y0 - 0.55, L / 2, Y0 - 0.55, `L = ${roundTo(L, 2)}`, { color: 'textDim' });

    // Línea de energía E.
    scene.line(X_MIN, yE, X_MAX, yE, { color: 'energy', width: 1.6, dash: [7, 5] });
    scene.label(X_MIN + 0.1, yE + 0.12, `E = ${roundTo(E, 1)}`, { color: 'energy', size: 12, align: 'left', avoid: true });

    if (this.params.modo === 'onda') this._drawWave(scene, yE, tunnelRegime);
    else this._drawPackets(scene, yE, tunnelRegime);

    this._drawHud(scene, tunnelRegime);
  }

  /** Vista partículas: paquetes que rebotan o cruzan; boceto de ψ dentro. */
  _drawPackets(scene, yE, tunnelRegime) {
    const { L } = this.params;
    if (tunnelRegime) {
      // Decaimiento exponencial de ψ dentro de la barrera (mecanismo).
      const kap = this.kappa();
      const pts = this._decay;
      for (let i = 0; i <= DECAY_N; i++) {
        const u = i / DECAY_N;
        const x = -L / 2 + u * L;
        const amp = Math.exp(-kap * u * L) * 0.9;
        pts[i].x = x;
        pts[i].y = yE + amp * Math.sin(this.t * 6 + u * 8);
      }
      scene.polyline(pts, { color: 'field', width: 1.6, alpha: 0.8 });
      scene.label(0, yE - 1.15, 'ψ ∝ e^(−κx)', { color: 'field', size: 11, avoid: true });
    }

    for (let i = 0; i < this.packets.length; i++) {
      const p = this.packets[i];
      const y = yE + 0.18 * Math.sin(this.t * 8 + p.phase);
      if (p.tunnel) scene.body(p.x, y, { shape: 'triangle', r: 0.24, color: 'energy', glow: false });
      else scene.body(p.x, y, { shape: 'circle', r: 0.2, color: 'mass', glow: false });
    }
    scene.label(X_MIN + 0.1, yE + 0.75, 'partículas incidentes →', { color: 'mass', size: 11, align: 'left', avoid: true });
    scene.label(X_MAX - 0.1, yE + 0.75, '→ transmitidas', { color: 'energy', size: 11, align: 'right', avoid: true });
  }

  /** Vista onda: ψ estacionaria (parte real animada) con su envolvente. */
  _drawWave(scene, yE, tunnelRegime) {
    const { E, V0, L } = this.params;
    const k = this.k();
    const T = this.tExact();
    const R = Math.max(0, 1 - T);
    const sqrtR = Math.sqrt(R);
    const sqrtT = Math.sqrt(T);
    const kap = this.kappa();
    const k2 = tunnelRegime ? 0 : Math.sqrt(2 * this.params.m * Math.max(1e-9, E - V0));
    const omega = 2.5 + E * 0.35;
    const wt = omega * this.t;
    const bl = -L / 2;
    const br = L / 2;
    // Amplitud dentro justo tras la barrera: continuidad aproximada con √T.
    const wave = this._wave;
    const top = this._envTop;
    const bot = this._envBot;
    for (let i = 0; i <= WAVE_N; i++) {
      const x = X_MIN + ((X_MAX - X_MIN) * i) / WAVE_N;
      let psi;
      let env;
      if (x < bl) {
        const xi = x - bl;
        const inc = Math.cos(k * xi - wt);
        const ref = sqrtR * Math.cos(-k * xi - wt);
        psi = inc + ref;
        env = Math.sqrt(1 + R + 2 * sqrtR * Math.cos(2 * k * xi));
      } else if (x <= br) {
        const xi = x - bl;
        if (tunnelRegime) {
          // Decaimiento de 1 (borde izquierdo) hasta √T (borde derecho).
          const a = Math.exp(-kap * xi);
          env = Math.max(sqrtT, a);
          psi = env * Math.cos(-wt);
        } else {
          env = 1;
          psi = Math.cos(k2 * xi - wt);
        }
      } else {
        const xi = x - br;
        env = sqrtT;
        psi = sqrtT * Math.cos(k * xi - wt);
      }
      wave[i].x = x;
      wave[i].y = yE + psi * PSI_AMP * 0.7;
      top[i].x = x;
      top[i].y = yE + env * PSI_AMP * 0.7;
      bot[i].x = x;
      bot[i].y = yE - env * PSI_AMP * 0.7;
    }
    scene.polyline(top, { color: 'field', width: 1.2, dash: [4, 4], alpha: 0.7 });
    scene.polyline(bot, { color: 'field', width: 1.2, dash: [4, 4], alpha: 0.7 });
    scene.polyline(wave, { color: 'mass', width: 2.2 });

    scene.label(X_MIN + 0.1, yE + 1.05, 'I: incidente + reflejada', { color: 'mass', size: 11, align: 'left', avoid: true });
    scene.label(X_MAX - 0.1, yE + 1.05, `III: transmitida, amplitud √T = ${roundTo(sqrtT, 3)}`, {
      color: 'mass',
      size: 11,
      align: 'right',
      avoid: true
    });
    scene.label(0, yE - 1.15, tunnelRegime ? 'II: ψ ∝ e^(−κx)' : 'II: oscila con k₂', { color: 'field', size: 11, avoid: true });
  }

  /** Curvas T(E) exacta y aproximada, recalculadas solo si cambian V₀, L o m. */
  _curves() {
    const { V0, L, m } = this.params;
    const key = `${V0}|${L}|${m}`;
    if (key !== this._curveKey) {
      this._curveKey = key;
      const N = 80;
      this._curveExact = new Array(N + 1);
      this._curveApprox = new Array(N + 1);
      for (let i = 0; i <= N; i++) {
        const E = E_MIN + ((E_MAX - E_MIN) * i) / N;
        this._curveExact[i] = { x: E, y: this.tExact(E) };
        this._curveApprox[i] = { x: E, y: this.tApprox(E) };
      }
    }
    return { exact: this._curveExact, approx: this._curveApprox };
  }

  _drawHud(scene, tunnelRegime) {
    const hud = scene.hud;
    const { E, V0 } = this.params;
    const T = this.tExact();
    const Ta = this.tApprox();
    hud.chip(
      tunnelRegime ? `E < V₀: régimen túnel · T = ${roundTo(T * 100, 3)} %` : `E ≥ V₀: sobre la barrera · T = ${roundTo(T * 100, 2)} %`,
      'top-left',
      { color: tunnelRegime ? 'energy' : 'warn' }
    );
    if (this.params.modo === 'particulas') {
      const n = this.nTransmitted + this.nReflected;
      hud.chip(
        n ? `Medido: ${this.nTransmitted} de ${n} cruzan → ${roundTo(this.tMeasured() * 100, 1)} %` : 'Lanzando partículas…',
        'top-left',
        { color: 'text' }
      );
    }
    hud.readout(
      [
        { label: 'k', value: this.k(), unit: '' },
        { label: 'κ', value: this.kappa(), unit: '' },
        { label: 'T exacta', value: T, unit: '' },
        { label: 'T ≈ e^(−2κL)', value: Ta, unit: '' },
        { label: 'R', value: 1 - T, unit: '' }
      ],
      'bottom-left',
      { decimals: 4 }
    );
    hud.legend(
      this.params.modo === 'onda'
        ? [
            { color: 'mass', label: 'Re ψ(x, t)', dash: [] },
            { color: 'field', label: 'envolvente |ψ|', dash: [4, 4] },
            { color: 'force', label: `barrera V₀ = ${roundTo(V0, 1)}`, dash: [1, 3] }
          ]
        : [
            { color: 'mass', label: 'reflejada (círculo)', dash: [] },
            { color: 'energy', label: 'transmitida (triángulo)', dash: [4, 4] },
            { color: 'force', label: `barrera V₀ = ${roundTo(V0, 1)}`, dash: [1, 3] }
          ],
      'top-right'
    );

    const vp = scene.viewport();
    if (vp.w > 420) {
      const curves = this._curves();
      hud.plot(
        { x: vp.x + vp.w - 232, y: vp.y + vp.h - 150, w: 218, h: 138 },
        {
          title: 'T(E): exacta — · e^(−2κL) ╌ · punto = E actual',
          series: [
            { points: curves.exact, color: 'energy', dash: [], width: 2 },
            { points: curves.approx, color: 'warn', dash: [5, 4], width: 1.6 },
            { points: [{ x: E, y: T }], color: 'mass', pointSize: 4 }
          ],
          xRange: [E_MIN, E_MAX],
          yRange: [0, 1]
        }
      );
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const { E, V0, L, m } = this.params;
    const T = this.tExact();
    const Ta = this.tApprox();
    const n = this.nTransmitted + this.nReflected;
    return {
      E: { value: E, unit: '' },
      'V₀': { value: V0, unit: '' },
      L: { value: L, unit: '' },
      m: { value: m, unit: '' },
      k: { value: roundTo(this.k(), 3), unit: '' },
      κ: { value: roundTo(this.kappa(), 3), unit: '' },
      'T exacta': { value: roundTo(T, 5), unit: '' },
      'T ≈ e^(−2κL)': { value: roundTo(Ta, 5), unit: '' },
      'T (%)': { value: roundTo(T * 100, 3), unit: '%' },
      R: { value: roundTo(1 - T, 5), unit: '' },
      régimen: { value: E >= V0 ? 'E ≥ V₀: sobre la barrera' : 'E < V₀: túnel', unit: '' },
      transmitidas: { value: this.nTransmitted, unit: '' },
      reflejadas: { value: this.nReflected, unit: '' },
      'T medida': { value: n ? roundTo(this.tMeasured(), 4) : 0, unit: '' }
    };
  }

  getState() {
    return {
      t: this.t,
      spawnAcc: this.spawnAcc,
      nTransmitted: this.nTransmitted,
      nReflected: this.nReflected,
      params: { ...this.params },
      packets: this.packets.map((p) => ({ ...p }))
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    this._normalizeParams();
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.spawnAcc)) this.spawnAcc = s.spawnAcc;
    if (Number.isFinite(s.nTransmitted)) this.nTransmitted = s.nTransmitted;
    if (Number.isFinite(s.nReflected)) this.nReflected = s.nReflected;
    this.packets = Array.isArray(s.packets) ? s.packets.map((p) => ({ ...p })) : [];
  }

  destroy() {
    this.packets.length = 0;
  }
}
