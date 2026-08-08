/**
 * @fileoverview Calorimetría y cambios de fase — mezclas, meseta de fusión y
 * los tres mecanismos de transferencia de calor (tanda 5.3).
 *
 * Modos:
 * - `mezcla`: dos cuerpos (agua + metal) alcanzan T_eq; la gráfica T(t) muestra
 *   el relajamiento exponencial y el calor cedido/absorbido Q.
 * - `fase`: hielo calentado a potencia constante P. La curva T vs Q muestra la
 *   meseta de fusión: T se queda clavada en 0 °C mientras llega el calor latente.
 * - `conduccion`: barra entre focos T₁/T₂ con P = k·A·ΔT/L y perfil lineal T(x).
 * - `conveccion`: ley de enfriamiento de Newton P = h·A·ΔT con lazo de fluido.
 * - `radiacion`: Stefan-Boltzmann P = ε·σ·A·(T⁴ − Tₐ⁴); el cuerpo brilla más
 *   con la temperatura (desplazamiento del pico de emisión).
 *
 * Ejercita `plot` (con `fill`), `fill`, `chip` y `readout`. La mezcla tiene
 * solución analítica (no hay integración temporal); la fase y la transferencia
 * avanzan con el tiempo acumulado.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const C_WATER = 4186; // J/(kg·K)
const C_ICE = 2090; // J/(kg·K)
const L_FUSION = 334000; // J/kg
const SIGMA = 5.67e-8; // Stefan-Boltzmann

export default class Calorimetry extends SimModule {
  static viewport = { width: 24, height: 16 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'mezcla',
      options: [
        { value: 'mezcla', label: 'Mezcla y equilibrio' },
        { value: 'fase', label: 'Cambios de fase' },
        { value: 'conduccion', label: 'Conducción' },
        { value: 'conveccion', label: 'Convección' },
        { value: 'radiacion', label: 'Radiación' }
      ]
    },
    { id: 'm1', label: 'Masa de agua', latex: 'm_1', unit: 'kg', min: 0.1, max: 4, step: 0.1, value: 1 },
    { id: 'T1', label: 'T agua', latex: 'T_1', unit: '°C', min: -20, max: 90, step: 1, value: 20 },
    { id: 'm2', label: 'Masa del metal', latex: 'm_2', unit: 'kg', min: 0.1, max: 4, step: 0.1, value: 1 },
    { id: 'c2', label: 'c del metal', latex: 'c_2', unit: 'J/(kg·K)', min: 100, max: 2000, step: 50, value: 450 },
    { id: 'T2', label: 'T del metal', latex: 'T_2', unit: '°C', min: -20, max: 300, step: 5, value: 150 },
    { id: 'mIce', label: 'Masa de hielo', latex: 'm', unit: 'kg', min: 0.05, max: 2, step: 0.05, value: 0.5 },
    { id: 'P', label: 'Potencia del foco', latex: 'P', unit: 'W', min: 20, max: 600, step: 20, value: 200 },
    { id: 'k', label: 'Conductividad k', latex: 'k', unit: 'W/(m·K)', min: 0.1, max: 400, step: 5, value: 50 },
    { id: 'h', label: 'Coef. convección', latex: 'h', unit: 'W/(m²·K)', min: 5, max: 500, step: 5, value: 50 },
    { id: 'A', label: 'Sección', latex: 'A', unit: 'm²', min: 0.01, max: 2, step: 0.01, value: 0.05 },
    { id: 'L', label: 'Longitud', latex: 'L', unit: 'm', min: 0.2, max: 4, step: 0.1, value: 1 },
    { id: 'eps', label: 'Emisividad ε', latex: '\\varepsilon', min: 0.05, max: 1, step: 0.05, value: 0.9 },
    { id: 'Tamb', label: 'T ambiente', latex: 'T_a', unit: '°C', min: -20, max: 40, step: 1, value: 20 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'mezcla',
      m1: 1,
      T1: 20,
      m2: 1,
      c2: 450,
      T2: 150,
      mIce: 0.5,
      P: 200,
      k: 50,
      h: 50,
      A: 0.05,
      L: 1,
      eps: 0.9,
      Tamb: 20
    };
    /** Tiempo acumulado del proceso en curso (fase y transferencia). */
    this.t = 0;
    /** Calor acumulado entregado al hielo (modo fase). */
    this.Q = 0;
    this.history = [];
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Calorimetría',
      blurb: 'Equilibrio térmico, calor latente con meseta de fusión y los tres modos de transferencia.',
      story:
        'El calor es energía en tránsito. Cuando dos cuerpos se tocan, el calor fluye hasta igualar temperaturas; cuando un sólido funde, la temperatura se detiene mientras el calor latente rompe los enlaces. Y hay tres caminos para transferir calor: conducción (contacto), convección (fluido que se mueve) y radiación (ondas que viajan en el vacío).',
      cases: [
        'Metal caliente en agua: T_eq entre ambos, la gráfica muestra el relajamiento exponencial.',
        'Hielo a 0 °C: la curva T–Q se queda horizontal mientras funde: esa meseta es el calor latente.',
        'Conducción: a mayor k (cobre vs madera), más potencia fluye.',
        'Radiación: la potencia depende de T⁴: el cuerpo brillante pierde mucho más que el tibio.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Calorimetría',
      items: [
        {
          name: 'Calor sensible',
          formula: 'Q = m \\cdot c \\cdot \\Delta T',
          note: 'Calor necesario para cambiar la temperatura sin cambiar de fase.'
        },
        {
          name: 'Calor latente',
          formula: 'Q = m \\cdot L_f',
          note: 'Temperatura constante durante la fusión/solidificación.'
        },
        {
          name: 'Equilibrio térmico',
          formula: 'm_1 c_1 (T_f - T_1) + m_2 c_2 (T_f - T_2) = 0',
          note: 'La suma del calor cedido y absorbido es cero.'
        },
        {
          name: 'Conducción (Fourier)',
          formula: 'P = k\\, A\\, \\frac{T_1 - T_2}{L}',
          note: 'Proporcional al gradiente de temperatura.'
        },
        {
          name: 'Convección (Newton)',
          formula: 'P = h\\, A\\, \\Delta T',
          note: 'Coeficiente h según fluido y geometría.'
        },
        {
          name: 'Radiación (Stefan-Boltzmann)',
          formula: 'P = \\varepsilon \\sigma A (T^4 - T_a^4)',
          note: 'T en kelvin; la potencia crece con T⁴.'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.Q = 0;
    this.history.length = 0;
    this.engine?.reset?.();
  }

  /** Temperatura de equilibrio de la mezcla (análitica, con C = m·c). */
  tEq() {
    const C1 = this.params.m1 * C_WATER;
    const C2 = this.params.m2 * this.params.c2;
    return (C1 * this.params.T1 + C2 * this.params.T2) / (C1 + C2);
  }

  /** Constante de tiempo del relajamiento térmico (s, arbitraria pero coherente). */
  tauMix() {
    const C1 = this.params.m1 * C_WATER;
    const C2 = this.params.m2 * this.params.c2;
    return 6 / (1 + (C1 + C2) / 5000);
  }

  /** Temperatura del hielo según el calor acumulado (segmentos con meseta). */
  phaseTemp(Q) {
    const m = this.params.mIce;
    const Q1 = m * C_ICE * 20; // −20 → 0 °C
    if (Q <= Q1) return -20 + (Q / Q1) * 20;
    const Q2 = Q1 + m * L_FUSION;
    if (Q <= Q2) return 0; // meseta: fusión
    return (Q - Q2) / (m * C_WATER); // 0 → T
  }

  /** Potencia transferida según el canal activo (en W). */
  transferPower() {
    const { modo, k, h, A, L, T1, T2, eps, Tamb } = this.params;
    const dT = T1 - T2;
    if (modo === 'conduccion') return k * A * dT / Math.max(L, 0.01);
    if (modo === 'conveccion') return h * A * dT;
    const Tk = T1 + 273.15;
    const Tak = Tamb + 273.15;
    return Math.max(0, eps * SIGMA * A * (Math.pow(Tk, 4) - Math.pow(Tak, 4)));
  }

  /** Temperatura del cuerpo caliente (K→°C) en el modo radiación. */
  radC() {
    return this.params.T1;
  }

  update(dt) {
    this.t += dt;
    const modo = this.params.modo;

    if (modo === 'fase') {
      this.Q += this.params.P * dt;
      this.history.push({ x: this.Q, y: this.phaseTemp(this.Q) });
      if (this.history.length > 400) this.history.shift();
      return;
    }

    if (modo === 'mezcla' || modo === 'conduccion' || modo === 'conveccion' || modo === 'radiacion') {
      // Solución analítica: se graba la serie T(t) solo en la mezcla.
      if (modo === 'mezcla' && this.history.length <= 400) {
        this.history.push({ x: this.t, y: this.tEq() });
      }
      if (modo === 'mezcla' && this.history.length > 400) this.history.shift();
    }
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const hud = scene.hud;
    const vp = scene.viewport();

    if (this.params.modo === 'mezcla') this._drawMix(scene, hud, vp);
    else if (this.params.modo === 'fase') this._drawPhase(scene, hud, vp);
    else this._drawTransfer(scene, hud, vp);
  }

  /** Modo mezcla: dos recipientes, termómetros y T(t). */
  _drawMix(scene, hud, vp) {
    const { m1, T1, m2, c2, T2 } = this.params;
    const Teq = this.tEq();
    const tau = this.tauMix();

    // Agua (izquierda) y metal (derecha): altura del nivel térmico = temperatura.
    scene.rect(-8, 2, 5, 6, { color: 'textDim', width: 2, fill: 'rgba(79,195,247,0.12)' });
    scene.rect(3, 2, 5, 6, { color: 'textDim', width: 2, fill: 'rgba(255,171,64,0.12)' });
    scene.fill(-8, 2, 5, (T1 + 30) / 120 * 6, { color: 'mass', alpha: 0.25, waves: false });
    scene.fill(3, 2, 5, (T2 + 30) / 120 * 6, { color: 'force', alpha: 0.25, waves: false });
    scene.label(-8, 8.6, `Agua ${m1} kg · ${roundTo(T1, 1)} °C`, { avoid: true, color: 'mass' });
    scene.label(3, 8.6, `Metal ${m2} kg · ${roundTo(T2, 1)} °C`, { avoid: true, color: 'force' });

    // Termómetros de ambos lados y hacia dónde fluye Q.
    scene.label(-1.4, 5, 'Q →', { avoid: true, color: 'energy', size: 15 });
    scene.vector(0.5, 5, 1.6, 0, { color: 'energy' });
    scene.chip(-1.4, 1.4, `T_eq = ${roundTo(Teq, 1)} °C`, { avoid: true, color: 'energy' });

    const rows = [
      { label: 'T_eq', value: roundTo(Teq, 2), unit: '°C' },
      { label: 'Q agua', value: roundTo(m1 * C_WATER * (Teq - T1), 0), unit: 'J' },
      { label: 'Q metal', value: roundTo(m2 * c2 * (T2 - Teq), 0), unit: 'J' }
    ];
    hud.readout(rows, 'bottom-left');

    if (vp.w > 430) {
      // T(t) con relajamiento exponencial: la mezcla tiende a T_eq.
      const horizon = Math.max(this.t, 1);
      const mk = (T0) => {
        const pts = [];
        const N = 60;
        for (let i = 0; i <= N; i++) {
          const tt = (horizon * i) / N;
          pts.push({ x: tt, y: Teq + (T0 - Teq) * Math.exp(-tt / tau) });
        }
        return pts;
      };
      hud.plot(
        { x: vp.x + vp.w - 250, y: vp.y + vp.h - 128, w: 235, h: 116 },
        {
          title: 'Temperatura T(t)',
          series: [
            { points: mk(T1), color: 'mass', label: 'agua' },
            { points: mk(T2), color: 'force', label: 'metal' },
            { points: [{ x: 0, y: Teq }, { x: horizon, y: Teq }], color: 'energy', dash: [3, 3], label: 'T_eq' }
          ],
          xRange: [0, horizon],
          yRange: [Math.min(T1, T2, Teq) - 10, Math.max(T1, T2, Teq) + 10]
        }
      );
    }
  }

  /** Modo fase: T vs Q con la meseta de fusión bien visible. */
  _drawPhase(scene, hud, vp) {
    const { mIce, P } = this.params;
    const Q1 = mIce * C_ICE * 20;
    const Q2 = Q1 + mIce * L_FUSION;
    const T = this.phaseTemp(this.Q);
    const fase = this.Q < Q1 ? 'hielo' : this.Q < Q2 ? 'fusión' : 'agua';

    // Bloque de hielo / agua con el nivel proporcional al estado.
    const level = this.Q < Q1 ? 0.35 : this.Q < Q2 ? 0.35 + 0.5 * (this.Q - Q1) / (Q2 - Q1) : 1;
    scene.rect(-3, 2, 6, 7, { color: 'textDim', width: 2, fill: 'rgba(79,195,247,0.10)' });
    scene.fill(-3, 2, 6, 7 * level, { color: this.Q < Q2 ? 'mass' : 'energy', alpha: 0.3, waves: level < 1 && this.Q >= Q1 });
    scene.label(-3, 9.4, `Hielo → agua: ${mIce} kg`, { avoid: true, color: 'mass' });
    scene.label(1.6, 9.4, `P = ${P} W`, { avoid: true, color: 'energy' });

    scene.chip(-2.4, 1.2, `Fase: ${fase}`, { avoid: true, color: 'energy' });
    scene.chip(2.2, 1.2, `T = ${roundTo(T, 1)} °C`, { avoid: true, color: 'mass' });

    hud.readout(
      [
        { label: 'T', value: roundTo(T, 2), unit: '°C' },
        { label: 'Q aportado', value: roundTo(this.Q / 1000, 1), unit: 'kJ' },
        { label: 'Q hasta fusión', value: roundTo(Q2 / 1000, 0), unit: 'kJ' }
      ],
      'bottom-left'
    );

    if (vp.w > 430) {
      // Curva T vs Q completa (analítica) con el punto vivo y la meseta.
      const pts = [];
      const Qmax = Q2 + mIce * C_WATER * 60;
      const N = 120;
      for (let i = 0; i <= N; i++) pts.push({ x: (Qmax * i) / N, y: this.phaseTemp((Qmax * i) / N) });
      hud.plot(
        { x: vp.x + vp.w - 250, y: vp.y + vp.h - 128, w: 235, h: 116 },
        {
          title: 'Curva de calentamiento T(Q)',
          series: [
            { points: pts, color: 'energy', label: 'T(Q)' },
            { points: [{ x: this.Q, y: T }, { x: this.Q, y: T }], color: 'force' }
          ],
          xRange: [0, Qmax],
          yRange: [-25, 65]
        }
      );
    }
  }

  /** Modos de transferencia: barra entre focos con el canal activo. */
  _drawTransfer(scene, hud, vp) {
    const { modo } = this.params;
    const P = this.transferPower();
    const T1 = modo === 'radiacion' ? this.radC() : this.params.T1;
    const T2 = modo === 'radiacion' ? this.params.Tamb : this.params.T2;

    // Focos y barra.
    scene.rect(-10.5, 4.5, 2, 4, { color: 'force', width: 2, fill: 'rgba(255,107,107,0.15)' });
    scene.rect(8.5, 4.5, 2, 4, { color: 'mass', width: 2, fill: 'rgba(78,161,255,0.15)' });
    scene.label(-9.5, 9, `${roundTo(T1, 1)} °C`, { avoid: true, color: 'force' });
    scene.label(9.5, 9, `${roundTo(T2, 1)} °C`, { avoid: true, color: 'mass' });

    if (modo === 'conduccion') {
      scene.rect(-8.5, 5.6, 17, 2.2, { color: 'textDim', width: 2, fill: 'rgba(255,171,64,0.25)' });
      scene.label(0, 5.4, `P = k·A·ΔT/L = ${roundTo(P, 1)} W`, { avoid: true, color: 'energy' });
      // Perfil lineal T(x) sobre la barra.
      for (let i = 1; i <= 6; i++) {
        const x = -8.5 + (17 * i) / 7;
        scene.body(x, 8.4, { shape: 'circle', r: 0.14, color: i % 2 ? 'force' : 'mass' });
      }
      scene.label(0, 8.9, 'Perfil lineal T(x): mismo gradiente en toda la barra', { avoid: true, color: 'textDim' });
    } else if (modo === 'conveccion') {
      // Lazo de fluido: sube caliente junto al foco, baja frío al otro lado.
      scene.polyline(
        [
          { x: -7, y: 6.7 }, { x: 7, y: 6.7 }, { x: 7, y: 4.4 },
          { x: -7, y: 4.4 }, { x: -7, y: 6.7 }
        ],
        { color: 'force', width: 2.5 }
      );
      scene.vector(0, 6.7, 0, 0.7, { color: 'force' });
      scene.vector(0, 4.4, 0, -0.7, { color: 'mass' });
      scene.label(0, 2.4, `P = h·A·ΔT = ${roundTo(P, 1)} W`, { avoid: true, color: 'energy' });
    } else {
      // Radiación: círculo que brilla según T (color → temperatura).
      const Tk = T1 + 273.15;
      const glow = Math.min(1, Math.max(0, (Tk - 273) / 1200));
      scene.body(-3.5, 6.7, { shape: 'circle', r: 1.1 + glow * 0.5, color: glow > 0.5 ? 'force' : 'mass2' });
      scene.arc(-3.5, 6.7, 1.9, 0, Math.PI * 2, { color: 'force', dash: [3, 3], alpha: 0.6 });
      scene.arc(-3.5, 6.7, 3.2, 0, Math.PI * 2, { color: 'force', dash: [3, 3], alpha: 0.35 });
      scene.label(-3.5, 10.2, `P = εσA(T⁴−Tₐ⁴) = ${roundTo(P, 2)} W`, { avoid: true, color: 'energy' });
      scene.label(5.5, 4, 'Calor radiado en todas direcciones', { avoid: true, color: 'textDim' });
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        scene.vector(-3.5 + Math.cos(a) * 1.1, 6.7 + Math.sin(a) * 1.1, Math.cos(a) * 1.6, Math.sin(a) * 1.6, {
          color: 'force',
          alpha: 0.4
        });
      }
    }

    hud.readout(
      [
        { label: 'P transferida', value: roundTo(P, 2), unit: 'W' },
        { label: 'ΔT', value: roundTo(T1 - T2, 1), unit: 'K' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const modo = this.params.modo;
    if (modo === 'mezcla') {
      const Teq = this.tEq();
      return {
        'T_eq': { value: roundTo(Teq, 2), unit: '°C' },
        'Q agua': { value: roundTo(this.params.m1 * C_WATER * (Teq - this.params.T1), 0), unit: 'J' },
        'Q metal': { value: roundTo(this.params.m2 * this.params.c2 * (this.params.T2 - Teq), 0), unit: 'J' }
      };
    }
    if (modo === 'fase') {
      return {
        'T': { value: roundTo(this.phaseTemp(this.Q), 2), unit: '°C' },
        'Q aportado': { value: roundTo(this.Q / 1000, 1), unit: 'kJ' },
        'Calor latente': { value: roundTo(this.params.mIce * L_FUSION / 1000, 0), unit: 'kJ' }
      };
    }
    return {
      'P transferida': { value: roundTo(this.transferPower(), 2), unit: 'W' },
      'ΔT': { value: roundTo(this.params.T1 - (modo === 'radiacion' ? this.params.Tamb : this.params.T2), 1), unit: 'K' }
    };
  }

  getState() {
    return { t: this.t, Q: this.Q, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.Q)) this.Q = s.Q;
    this.history.length = 0;
  }

  destroy() {
    this.history.length = 0;
  }
}
