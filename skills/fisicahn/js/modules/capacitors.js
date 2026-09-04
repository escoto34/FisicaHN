/**
 * @fileoverview Condensadores y dieléctricos — placas paralelas, carga y
 * descarga RC, y asociación serie/paralelo.
 *
 * Tres modos sobre un mismo motor (§3.2: un modo, no un módulo duplicado):
 *
 *  - `placas`: C = κ·ε₀·A/d con el dieléctrico insertándose de forma animada.
 *    Con la fuente conectada V es constante y la carga crece; con la fuente
 *    desconectada Q es constante y es el campo E el que baja a E₀/κ. Las
 *    líneas de campo y las cargas ± dibujadas son proporcionales a E y a Q.
 *  - `carga-rc`: q(t) = Q(1 − e^(−t/τ)) o q(t) = Q·e^(−t/τ) con τ = R·C,
 *    interruptor animado, corriente animada y gráfica V_C(t) e i(t).
 *  - `asociacion`: 2 ó 3 condensadores en serie o en paralelo, C equivalente
 *    y reparto de Q y V con barras comparativas.
 *
 * Todo el dibujo es declarativo (`draw(scene)`): `line`, `rect`, `circle`,
 * `vector`, `label`, `chip`, `dimension`, `hud.plot`, `hud.legend`,
 * `hud.readout`. Sin `ctx`, sin DOM.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo, clamp } from '../core/geometry.js';

/** Permitividad del vacío, F/m. */
const EPS0 = 8.854e-12;

/** Dieléctricos con su constante κ (adimensional). */
const DIELECTRICS = {
  vacio: { k: 1, label: 'Vacío / aire (κ = 1)', name: 'vacío' },
  papel: { k: 3.7, label: 'Papel (κ = 3.7)', name: 'papel' },
  vidrio: { k: 6, label: 'Vidrio (κ = 6)', name: 'vidrio' },
  mica: { k: 7, label: 'Mica (κ = 7)', name: 'mica' },
  agua: { k: 80, label: 'Agua (κ = 80)', name: 'agua' }
};

/** Velocidad con la que entra/sale el dieléctrico (fracción por segundo). */
const INSERT_SPEED = 1.1;
/** Tiempo que tarda el interruptor RC en cerrarse (s), sólo visual. */
const SWITCH_TIME = 0.4;
/** Puntos de la curva analítica RC (buffer fijo: sin asignar por frame). */
const CURVE_N = 120;
/** Constante de tiempo visual de la carga en modo asociación (s). */
const TAU_VIS = 0.5;

export default class Capacitors extends SimModule {
  static viewport = { width: 24, height: 16 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'placas',
      options: [
        { value: 'placas', label: 'Placas paralelas y dieléctrico' },
        { value: 'carga-rc', label: 'Carga y descarga RC' },
        { value: 'asociacion', label: 'Asociación serie / paralelo' }
      ]
    },
    { id: 'V', label: 'Voltaje de la fuente', latex: 'V', unit: 'V', min: 1, max: 24, step: 0.5, value: 12 },
    { id: 'A', label: 'Área de las placas', latex: 'A', unit: 'cm²', min: 50, max: 500, step: 10, value: 200 },
    { id: 'd', label: 'Separación', latex: 'd', unit: 'mm', min: 0.5, max: 10, step: 0.5, value: 2 },
    {
      id: 'diel',
      type: 'select',
      label: 'Dieléctrico',
      value: 'papel',
      options: Object.entries(DIELECTRICS).map(([v, m]) => ({ value: v, label: m.label }))
    },
    { id: 'insertado', type: 'checkbox', label: 'Dieléctrico insertado', value: true },
    {
      id: 'fuente',
      type: 'select',
      label: 'Fuente durante la inserción',
      value: 'conectada',
      options: [
        { value: 'conectada', label: 'Conectada (V constante)' },
        { value: 'desconectada', label: 'Desconectada (Q constante)' }
      ]
    },
    { id: 'R', label: 'Resistencia (RC)', latex: 'R', unit: 'kΩ', min: 1, max: 100, step: 1, value: 10 },
    { id: 'C', label: 'Capacidad (RC)', latex: 'C', unit: 'µF', min: 1, max: 100, step: 1, value: 47 },
    {
      id: 'accion',
      type: 'select',
      label: 'Acción RC',
      value: 'carga',
      options: [
        { value: 'carga', label: 'Cargar (con la fuente)' },
        { value: 'descarga', label: 'Descargar (sin fuente)' }
      ]
    },
    {
      id: 'config',
      type: 'select',
      label: 'Asociación',
      value: 'serie',
      options: [
        { value: 'serie', label: 'Serie' },
        { value: 'paralelo', label: 'Paralelo' }
      ]
    },
    {
      id: 'n',
      type: 'select',
      label: 'Número de condensadores',
      value: '2',
      options: [
        { value: '2', label: 'Dos' },
        { value: '3', label: 'Tres' }
      ]
    },
    { id: 'C1', label: 'C₁', latex: 'C_1', unit: 'µF', min: 1, max: 50, step: 1, value: 10 },
    { id: 'C2', label: 'C₂', latex: 'C_2', unit: 'µF', min: 1, max: 50, step: 1, value: 20 },
    { id: 'C3', label: 'C₃', latex: 'C_3', unit: 'µF', min: 1, max: 50, step: 1, value: 30 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'placas',
      V: 12,
      A: 200,
      d: 2,
      diel: 'papel',
      insertado: true,
      fuente: 'conectada',
      R: 10,
      C: 47,
      accion: 'carga',
      config: 'serie',
      n: '2',
      C1: 10,
      C2: 20,
      C3: 30
    };
    this.t = 0;
    /** Fracción del área cubierta por el dieléctrico (0..1), animada. */
    this.f = 1;
    /** Carga instantánea del condensador RC (C). */
    this.q = 0;
    /** Corriente instantánea RC (A). */
    this.i = 0;
    /** Curvas analíticas RC reutilizadas cada frame (sin asignar). */
    this._curveV = Array.from({ length: CURVE_N + 1 }, () => ({ x: 0, y: 0 }));
    this._curveI = Array.from({ length: CURVE_N + 1 }, () => ({ x: 0, y: 0 }));
    this._marker = [{ x: 0, y: 0 }];
    this._tauLine = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    this.dragging = null;
  }

  init() {
    this.reset();
    this.setModuleInfo({
      title: 'Condensadores y dieléctricos',
      blurb: 'Placas paralelas con dieléctrico, carga y descarga RC, y asociación serie/paralelo.',
      story:
        'Un condensador guarda energía separando cargas: dos placas enfrentadas con un aislante en medio. Faraday descubrió que ese aislante —el dieléctrico— multiplica la capacidad por un factor κ: sus moléculas se polarizan y debilitan el campo interior. Cada flash de cámara, cada teclado y cada memoria de tu teléfono funcionan con esta idea.',
      cases: [
        'Flash fotográfico: se carga despacio a través de R y se descarga de golpe.',
        'Insertar un dieléctrico con la fuente conectada: la carga sube, el campo no cambia.',
        'Insertar el dieléctrico desconectado: la carga se conserva y el campo baja a E₀/κ.',
        'En serie la carga es la misma en todos; en paralelo lo es el voltaje.'
      ]
    });
    this.setModuleFormulas({
      title: 'Condensadores',
      items: [
        { name: 'Capacidad de placas paralelas', formula: 'C = \\kappa\\,\\varepsilon_0\\,\\dfrac{A}{d}', note: 'ε₀ = 8.854×10⁻¹² F/m; κ = 1 en el vacío.' },
        { name: 'Carga y voltaje', formula: 'Q = C\\,V' },
        { name: 'Campo entre las placas', formula: 'E = \\dfrac{V}{d}', note: 'Uniforme lejos de los bordes.' },
        { name: 'Energía almacenada', formula: 'U = \\tfrac{1}{2} C V^2 = \\dfrac{Q^2}{2C}' },
        { name: 'Carga RC', formula: 'q(t) = C V\\,(1 - e^{-t/\\tau}) \\quad \\tau = R C' },
        { name: 'Descarga RC', formula: 'q(t) = Q_0\\,e^{-t/\\tau} \\qquad i(t) = \\dfrac{V}{R}\\,e^{-t/\\tau}' },
        { name: 'Serie', formula: '\\dfrac{1}{C_{eq}} = \\dfrac{1}{C_1} + \\dfrac{1}{C_2} + \\cdots', note: 'Misma Q en todos; los voltajes se suman.' },
        { name: 'Paralelo', formula: 'C_{eq} = C_1 + C_2 + \\cdots', note: 'Mismo V en todos; las cargas se suman.' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    // `f` no se reinicia: la inserción es la animación que el usuario ve al
    // marcar la casilla, y el anfitrión llama reset() tras cada cambio.
    this.q = this.params.accion === 'descarga' ? this.cRc() * this.params.V : 0;
    this.i = 0;
    this.engine?.reset?.();
  }

  /* ---------- física: placas ---------- */

  kappa() {
    return DIELECTRICS[this.params.diel]?.k ?? 1;
  }

  /** Capacidad en vacío (F). */
  c0() {
    return (EPS0 * this.params.A * 1e-4) / (this.params.d * 1e-3);
  }

  /** Capacidad con el dieléctrico insertado una fracción f (dos condensadores en paralelo). */
  cPlates() {
    return this.c0() * (1 + (this.kappa() - 1) * this.f);
  }

  /** Estado eléctrico de las placas: {C, Q, Vc, E, U}. */
  plates() {
    const C = this.cPlates();
    let Q;
    let Vc;
    if (this.params.fuente === 'conectada') {
      Vc = this.params.V;
      Q = C * Vc;
    } else {
      // Se cargó en vacío a V y se desconectó: Q se conserva.
      Q = this.c0() * this.params.V;
      Vc = Q / C;
    }
    return { C, Q, Vc, E: Vc / (this.params.d * 1e-3), U: 0.5 * C * Vc * Vc };
  }

  /* ---------- física: RC ---------- */

  cRc() {
    return this.params.C * 1e-6;
  }

  tau() {
    return this.params.R * 1e3 * this.cRc();
  }

  /** Tiempo eléctrico: la física arranca cuando el interruptor termina de cerrar. */
  tq() {
    return Math.max(0, this.t - SWITCH_TIME);
  }

  qAt(t) {
    const Q = this.cRc() * this.params.V;
    const e = Math.exp(-t / this.tau());
    return this.params.accion === 'carga' ? Q * (1 - e) : Q * e;
  }

  iAt(t) {
    const I0 = this.params.V / (this.params.R * 1e3);
    const e = Math.exp(-t / this.tau());
    return this.params.accion === 'carga' ? I0 * e : -I0 * e;
  }

  /* ---------- física: asociación ---------- */

  caps() {
    const n = Number(this.params.n) === 3 ? 3 : 2;
    const list = [this.params.C1, this.params.C2, this.params.C3].slice(0, n).map((c) => c * 1e-6);
    return list;
  }

  /** Reparto de carga y voltaje: {Ceq, items:[{C,Q,V}], Qtot, U}. */
  network() {
    const Cs = this.caps();
    const V = this.params.V;
    let Ceq;
    let items;
    if (this.params.config === 'serie') {
      Ceq = 1 / Cs.reduce((s, c) => s + 1 / c, 0);
      const Q = Ceq * V;
      items = Cs.map((C) => ({ C, Q, V: Q / C }));
    } else {
      Ceq = Cs.reduce((s, c) => s + c, 0);
      items = Cs.map((C) => ({ C, Q: C * V, V }));
    }
    return { Ceq, items, Qtot: Ceq * V, U: 0.5 * Ceq * V * V };
  }

  /* ---------- integración ---------- */

  update(dt) {
    this.t += dt;
    const target = this.params.insertado ? 1 : 0;
    if (this.f !== target) {
      const step = INSERT_SPEED * dt;
      this.f = this.f < target ? Math.min(target, this.f + step) : Math.max(target, this.f - step);
    }
    if (this.params.modo === 'carga-rc') {
      const t = this.tq();
      this.q = this.qAt(t);
      this.i = t > 0 ? this.iAt(t) : 0;
    }
  }

  /* ---------- interacción directa (§2.6): arrastrar la placa inferior cambia d ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    if (id !== 'placa' || this.params.modo !== 'placas') return;
    // La placa superior es fija: la separación dibujada es 2·|y|.
    const gap = clamp(-world.y * 2, 1.31, 3.4);
    const d = (gap - 1.2) / 0.22;
    this.params.d = roundTo(clamp(d, 0.5, 10) * 2, 0) / 2;
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    if (this.params.modo === 'carga-rc') this._drawRc(scene);
    else if (this.params.modo === 'asociacion') this._drawNetwork(scene);
    else this._drawPlates(scene);
  }

  /** Marca de carga puntual: disco con «+» o «−» trazado en líneas (sin texto). */
  _charge(scene, x, y, sign, r = 0.13) {
    scene.circle(x, y, r, { color: sign > 0 ? 'force' : 'mass', fill: sign > 0 ? 'force' : 'mass', width: 1 });
    scene.line(x - r * 0.6, y, x + r * 0.6, y, { color: 'text', width: 1.4 });
    if (sign > 0) scene.line(x, y - r * 0.6, x, y + r * 0.6, { color: 'text', width: 1.4 });
  }

  /** Símbolo de batería vertical centrado en (x, y): placa larga (+) arriba. */
  _battery(scene, x, y, label, active = true) {
    const c = active ? 'energy' : 'textDim';
    scene.line(x - 0.55, y + 0.18, x + 0.55, y + 0.18, { color: c, width: 3 });
    scene.line(x - 0.28, y - 0.18, x + 0.28, y - 0.18, { color: c, width: 3 });
    if (label) scene.label(x - 0.8, y, label, { color: c, align: 'right', baseline: 'middle', avoid: true });
  }

  _wire(scene, x0, y0, x1, y1, color = 'textDim') {
    scene.line(x0, y0, x1, y1, { color, width: 2 });
  }

  /** Puntos de corriente animados a lo largo de un tramo, densidad ∝ |i|/I0. */
  _flow(scene, x0, y0, x1, y1, ratio) {
    const mag = Math.abs(ratio);
    if (mag < 0.02) return;
    const n = Math.max(2, Math.round(2 + mag * 7));
    const speed = 0.2 + mag * 1.3;
    const phase = (this.t * speed) % 1;
    for (let k = 0; k < n; k++) {
      let u = (k / n + phase) % 1;
      if (ratio < 0) u = 1 - u;
      scene.circle(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0.1, { color: 'ray', fill: 'ray', width: 1, alpha: 0.9 });
    }
  }

  _drawPlates(scene) {
    const { A, d, V, fuente } = this.params;
    const st = this.plates();
    const k = this.kappa();
    const gap = 1.2 + d * 0.22; // separación dibujada (u)
    const pw = 2.5 + Math.sqrt(A / 500) * 3.5; // semiancho de la placa (u)
    const cx = -1.5;
    const yTop = gap / 2;
    const yBot = -gap / 2;
    const conectada = fuente === 'conectada';

    // Dieléctrico deslizante: cubre la fracción f desde la derecha.
    if (k > 1 && this.f > 0.001) {
      const left = cx + pw - 2 * pw * this.f;
      const right = Math.min(cx + pw + 2 * pw * (1 - this.f), 10.5);
      if (right > left + 0.05) {
        const w = right - left;
        scene.rect(left + w / 2, 0, w, gap - 0.16, { color: 'accel', fill: 'accel', alpha: 0.28, width: 1.2 });
        // Cargas de polarización ligadas: − en la cara de arriba (frente a +Q), + abajo.
        const nb = Math.max(1, Math.round((w / (2 * pw)) * 5));
        for (let j = 0; j < nb; j++) {
          const x = left + (w * (j + 0.5)) / nb;
          if (x > cx + pw) continue; // sólo la parte que ya está entre placas
          scene.line(x - 0.12, yTop - 0.3, x + 0.12, yTop - 0.3, { color: 'mass', width: 2 });
          scene.line(x - 0.12, yBot + 0.3, x + 0.12, yBot + 0.3, { color: 'force', width: 2 });
          scene.line(x, yBot + 0.18, x, yBot + 0.42, { color: 'force', width: 2 });
        }
        scene.chip(left + Math.min(w, cx + pw - left) / 2, 0, `κ = ${k} (${DIELECTRICS[this.params.diel].name})`, {
          color: 'accel',
          avoid: true
        });
      }
    } else if (k === 1) {
      scene.label(cx, 0, 'vacío (κ = 1)', { color: 'textDim', size: 11, baseline: 'middle', avoid: true });
    }

    // Líneas de campo: número ∝ E (de + arriba hacia − abajo).
    const nE = clamp(Math.round(2 + 10 * Math.sqrt(st.E / 6000)), 2, 26);
    for (let j = 0; j < nE; j++) {
      const x = cx - pw + 0.4 + ((2 * pw - 0.8) * (j + 0.5)) / nE;
      scene.vector(x, yTop - 0.12, 0, -(gap - 0.36), { color: 'field', width: 1.4, alpha: 0.75 });
    }

    // Placas (la inferior es arrastrable: cambia d).
    scene.rect(cx, yTop, 2 * pw, 0.16, { color: 'spring', fill: 'spring', width: 1 });
    scene.rect(cx, yBot, 2 * pw, 0.16, { color: 'spring', fill: 'spring', width: 1 });
    scene.pickable('placa', { x: cx, y: yBot, w: 2 * pw, h: 0.6 });

    // Cargas libres: número ∝ Q.
    const qRef = this.c0() * 12 * 3.7; // Q de referencia (defaults) → 12 marcas
    const nQ = clamp(Math.round(12 * Math.sqrt(st.Q / qRef)), 1, 30);
    for (let j = 0; j < nQ; j++) {
      const x = cx - pw + 0.3 + ((2 * pw - 0.6) * (j + 0.5)) / nQ;
      this._charge(scene, x, yTop + 0.28, +1);
      this._charge(scene, x, yBot - 0.28, -1);
    }
    scene.label(cx - pw - 0.3, yTop + 0.3, '+Q', { color: 'force', align: 'right', baseline: 'middle', avoid: true });
    scene.label(cx - pw - 0.3, yBot - 0.3, '−Q', { color: 'mass', align: 'right', baseline: 'middle', avoid: true });

    // Cotas: separación d y área A.
    scene.dimension(cx + pw + 0.5, yTop, cx + pw + 0.5, yBot, `d = ${d} mm`, { color: 'textDim' });
    scene.label(cx, yTop + 0.95, `A = ${A} cm²`, { color: 'spring', avoid: true });
    scene.label(cx + pw + 1.3, 0, `E = ${fmtField(st.E)}`, { color: 'field', align: 'left', baseline: 'middle', avoid: true });

    // Fuente: batería a la izquierda, o interruptor abierto si está desconectada.
    const bx = cx - pw - 2.2;
    this._wire(scene, cx - pw, yTop, bx, yTop);
    this._wire(scene, cx - pw, yBot, bx, yBot);
    this._wire(scene, bx, yBot, bx, -0.5);
    if (conectada) {
      this._wire(scene, bx, yTop, bx, 0.5);
      this._battery(scene, bx, 0, `${V} V`);
    } else {
      this._wire(scene, bx, yTop, bx, 1.1);
      scene.line(bx, -0.5, bx + 0.55, 0.45, { color: 'warn', width: 2.4 });
      scene.circle(bx, -0.5, 0.09, { color: 'warn', fill: 'warn', width: 1 });
      scene.circle(bx, 1.1, 0.09, { color: 'warn', fill: 'warn', width: 1 });
      scene.label(bx - 0.4, 0.3, 'abierto', { color: 'warn', size: 11, align: 'right', baseline: 'middle', avoid: true });
    }

    // Barra de energía U = ½CV² a la derecha, relativa al valor en vacío.
    const uVac = 0.5 * this.c0() * V * V;
    const uMax = conectada ? uVac * Math.max(k, 1) : uVac;
    const barH = 5 * clamp(st.U / uMax, 0, 1);
    const bxE = 8.6;
    scene.rect(bxE, 0, 0.9, 5, { color: 'textDim', width: 1.2 });
    if (barH > 0.02) scene.rect(bxE, -2.5 + barH / 2, 0.8, barH, { color: 'energy', fill: 'energy', alpha: 0.85, width: 1 });
    scene.label(bxE, 3, `U = ${fmtEnergy(st.U)}`, { color: 'energy', avoid: true });
    scene.label(bxE, -3.1, conectada ? `escala: κ·U₀` : `escala: U₀ (vacío)`, { color: 'textDim', size: 10, baseline: 'top', avoid: true });

    // HUD.
    const hud = scene.hud;
    const moving = this.f !== (this.params.insertado ? 1 : 0);
    hud.chip(
      conectada
        ? `Fuente conectada: V = ${V} V constante`
        : `Fuente desconectada: Q = ${fmtCharge(st.Q)} constante`,
      'top-left'
    );
    hud.chip(
      moving
        ? `${this.params.insertado ? 'Insertando' : 'Retirando'} dieléctrico… ${Math.round(this.f * 100)} %`
        : `C = ${fmtCap(st.C)} · ×${roundTo(st.C / this.c0(), 2)} respecto al vacío`,
      'top-left'
    );
    hud.readout(
      [
        { label: 'C', value: roundTo(st.C * 1e12, 2), unit: 'pF' },
        { label: 'Q', value: roundTo(st.Q * 1e9, 3), unit: 'nC' },
        { label: 'V', value: roundTo(st.Vc, 2), unit: 'V' },
        { label: 'E', value: roundTo(st.E / 1000, 3), unit: 'kV/m' },
        { label: 'U', value: roundTo(st.U * 1e9, 3), unit: 'nJ' }
      ],
      'bottom-left'
    );
  }

  _drawRc(scene) {
    const { V, R, C, accion } = this.params;
    const tau = this.tau();
    const Qmax = this.cRc() * V;
    const I0 = V / (R * 1e3);
    const vc = this.q / this.cRc();
    const cargando = accion === 'carga';
    const t = this.tq();
    const closed = this.t >= SWITCH_TIME;
    const ratio = this.i / I0;

    // Lazo: fuente a la izquierda, interruptor y R arriba, C a la derecha.
    const L = -7.5;
    const Rr = 1.5;
    const T = 3.2;
    const B = -3.2;
    this._wire(scene, L, B, L, -0.5);
    this._wire(scene, L, 0.5, L, T);
    this._wire(scene, L, T, -5.2, T);
    // Interruptor animado entre x = -5.2 y -4.2.
    const swAng = (1 - clamp(this.t / SWITCH_TIME, 0, 1)) * 0.75;
    scene.circle(-5.2, T, 0.09, { color: 'warn', fill: 'warn', width: 1 });
    scene.circle(-4.2, T, 0.09, { color: 'warn', fill: 'warn', width: 1 });
    scene.line(-5.2, T, -5.2 + Math.cos(swAng) * 1.0, T + Math.sin(swAng) * 1.0, { color: closed ? 'ok' : 'warn', width: 2.6 });
    this._wire(scene, -4.2, T, -2.3, T);
    scene.rect(-1.3, T, 2, 0.6, { color: 'force', fill: 'force', alpha: 0.9, width: 1 });
    this._wire(scene, -0.3, T, Rr, T);
    this._wire(scene, Rr, T, Rr, 0.45);
    this._wire(scene, Rr, -0.45, Rr, B);
    this._wire(scene, Rr, B, L, B);
    // Condensador: dos placas horizontales en la rama derecha.
    scene.line(Rr - 0.8, 0.28, Rr + 0.8, 0.28, { color: 'spring', width: 4 });
    scene.line(Rr - 0.8, -0.28, Rr + 0.8, -0.28, { color: 'spring', width: 4 });
    const nQ = Math.round(6 * clamp(this.q / Qmax, 0, 1));
    for (let j = 0; j < nQ; j++) {
      const x = Rr - 0.6 + (1.2 * (j + 0.5)) / 6;
      this._charge(scene, x, 0.58, +1, 0.11);
      this._charge(scene, x, -0.58, -1, 0.11);
    }
    if (cargando) this._battery(scene, L, 0, `${V} V`);
    else this._battery(scene, L, 0, 'sin fuente', false);

    // Corriente animada (∝ i/I₀): sentido horario al cargar, inverso al descargar.
    this._flow(scene, L, 0.5, L, T, ratio);
    this._flow(scene, -4.2, T, -2.3, T, ratio);
    this._flow(scene, -0.3, T, Rr, T, ratio);
    this._flow(scene, Rr, T, Rr, 0.45, ratio);
    this._flow(scene, Rr, -0.45, Rr, B, ratio);
    this._flow(scene, Rr, B, L, B, ratio);
    this._flow(scene, L, B, L, -0.5, ratio);

    // Etiquetas de componentes.
    scene.label(-1.3, T + 0.55, `R = ${R} kΩ`, { color: 'force', avoid: true });
    scene.label(Rr + 1.1, 0, `C = ${C} µF`, { color: 'spring', align: 'left', baseline: 'middle', avoid: true });
    scene.label(-4.7, T + 0.9, closed ? 'cerrado' : 'cerrando…', { color: closed ? 'ok' : 'warn', size: 11, avoid: true });
    scene.label(Rr + 1.1, -1.0, `V_C = ${roundTo(vc, 2)} V`, { color: 'energy', align: 'left', baseline: 'middle', avoid: true });
    scene.label(Rr + 1.1, 1.0, `q = ${roundTo(this.q * 1e6, 1)} µC`, { color: 'mass', align: 'left', baseline: 'middle', avoid: true });
    scene.label(-3, B - 0.7, `i = ${fmtCurrent(this.i)}`, { color: 'ray', avoid: true });

    // Gráfica V_C(t) e i(t) normalizadas, con la marca de τ.
    const vp = scene.viewport();
    const tMax = Math.max(6 * tau, t + 0.05);
    if (vp.w > 430) {
      for (let k = 0; k <= CURVE_N; k++) {
        const tt = (tMax * k) / CURVE_N;
        const shown = Math.min(tt, t);
        const e = Math.exp(-shown / tau);
        this._curveV[k].x = shown;
        this._curveV[k].y = (cargando ? 1 - e : e) * 100;
        this._curveI[k].x = shown;
        this._curveI[k].y = e * 100;
      }
      this._marker[0].x = t;
      this._marker[0].y = (vc / V) * 100;
      this._tauLine[0].x = tau;
      this._tauLine[0].y = 0;
      this._tauLine[1].x = tau;
      this._tauLine[1].y = 100;
      scene.hud.plot(
        { x: vp.x + vp.w - 300, y: vp.y + vp.h - 150, w: 288, h: 138 },
        {
          title: `V_C(t) e i(t) · τ = ${roundTo(tau, 2)} s`,
          series: [
            { points: this._curveV, color: 'energy', width: 2, dash: [] },
            { points: this._curveI, color: 'ray', width: 2, dash: [5, 4] },
            { points: this._tauLine, color: 'textDim', width: 1, dash: [2, 3] },
            { points: this._marker, color: 'energy', pointSize: 4 }
          ],
          xRange: [0, tMax],
          yRange: [0, 105],
          xLabel: 't (s)',
          yLabel: '%'
        }
      );
      scene.hud.legend(
        [
          { color: 'energy', label: 'V_C / V (%)', dash: [] },
          { color: 'ray', label: '|i| / I₀ (%)', dash: [5, 4] },
          { color: 'textDim', label: 't = τ (63.2 %)', dash: [2, 3] }
        ],
        'top-right'
      );
    }

    const hud = scene.hud;
    hud.chip(`${cargando ? 'Cargando' : 'Descargando'} · τ = RC = ${roundTo(tau, 3)} s`, 'top-left');
    hud.chip(`t = ${roundTo(t, 2)} s = ${roundTo(t / tau, 2)} τ → V_C al ${roundTo((vc / V) * 100, 1)} %`, 'top-left');
    hud.readout(
      [
        { label: 'τ', value: roundTo(tau, 3), unit: 's' },
        { label: 'q', value: roundTo(this.q * 1e6, 2), unit: 'µC' },
        { label: 'V_C', value: roundTo(vc, 2), unit: 'V' },
        { label: 'i', value: roundTo(this.i * 1e3, 3), unit: 'mA' },
        { label: 'U', value: roundTo((0.5 * this.q * this.q) / this.cRc() * 1e6, 2), unit: 'µJ' }
      ],
      'bottom-left'
    );
  }

  _drawNetwork(scene) {
    const { V, config } = this.params;
    const net = this.network();
    const n = net.items.length;
    const serie = config === 'serie';
    const a = 1 - Math.exp(-this.t / TAU_VIS); // animación de carga (0→1)
    const flowing = a < 0.985;
    const Qmax = Math.max(...net.items.map((it) => it.Q), 1e-12);
    const L = -8.5;
    const Rr = 7;
    const T = 3.2;
    const B = -2.8;

    // Lazo exterior y fuente.
    this._wire(scene, L, B, L, -0.5);
    this._wire(scene, L, 0.5, L, T);
    this._wire(scene, Rr, T, Rr, B);
    this._wire(scene, Rr, B, L, B);
    this._battery(scene, L, 0, `${V} V`);

    const drawCapH = (x, y, Q, i) => {
      // Placas verticales (en el hilo horizontal), cargas ∝ Q.
      scene.line(x - 0.28, y - 0.7, x - 0.28, y + 0.7, { color: 'spring', width: 4 });
      scene.line(x + 0.28, y - 0.7, x + 0.28, y + 0.7, { color: 'spring', width: 4 });
      const m = Math.round(4 * clamp((a * Q) / Qmax, 0, 1));
      for (let j = 0; j < m; j++) {
        const yy = y - 0.45 + (0.9 * (j + 0.5)) / 4;
        this._charge(scene, x - 0.55, yy, +1, 0.1);
        this._charge(scene, x + 0.55, yy, -1, 0.1);
      }
      scene.label(x, y + 1.05, `C${sub(i)} = ${roundTo(net.items[i].C * 1e6, 1)} µF`, { color: 'spring', avoid: true });
      scene.label(x, y - 1.15, `V${sub(i)} = ${roundTo(net.items[i].V, 2)} V`, { color: 'energy', avoid: true });
    };
    const drawCapV = (x, y, Q, i) => {
      // Placas horizontales (en una rama vertical), cargas ∝ Q.
      scene.line(x - 0.7, y + 0.28, x + 0.7, y + 0.28, { color: 'spring', width: 4 });
      scene.line(x - 0.7, y - 0.28, x + 0.7, y - 0.28, { color: 'spring', width: 4 });
      const m = Math.round(4 * clamp((a * Q) / Qmax, 0, 1));
      for (let j = 0; j < m; j++) {
        const xx = x - 0.45 + (0.9 * (j + 0.5)) / 4;
        this._charge(scene, xx, y + 0.55, +1, 0.1);
        this._charge(scene, xx, y - 0.55, -1, 0.1);
      }
      scene.label(x + 0.95, y + 0.55, `C${sub(i)} = ${roundTo(net.items[i].C * 1e6, 1)} µF`, { color: 'spring', align: 'left', baseline: 'middle', avoid: true });
      scene.label(x + 0.95, y - 0.55, `Q${sub(i)} = ${roundTo(net.items[i].Q * 1e6, 1)} µC`, { color: 'mass', align: 'left', baseline: 'middle', avoid: true });
    };

    if (serie) {
      const xs = n === 3 ? [-4.5, 0, 4.5] : [-2.5, 2.5];
      let prev = L;
      xs.forEach((x, i) => {
        this._wire(scene, prev, T, x - 0.28, T);
        if (flowing) this._flow(scene, prev, T, x - 0.28, T, 1 - a);
        drawCapH(x, T, net.items[i].Q, i);
        prev = x + 0.28;
      });
      this._wire(scene, prev, T, Rr, T);
      if (flowing) {
        this._flow(scene, prev, T, Rr, T, 1 - a);
        this._flow(scene, Rr, T, Rr, B, 1 - a);
        this._flow(scene, Rr, B, L, B, 1 - a);
        this._flow(scene, L, B, L, -0.5, 1 - a);
        this._flow(scene, L, 0.5, L, T, 1 - a);
      }
      scene.label(-1, B - 0.6, `Misma carga en todos: Q = ${roundTo(net.Qtot * 1e6, 1)} µC · ΣV = ${roundTo(net.items.reduce((s, it) => s + it.V, 0), 2)} V`, {
        color: 'mass',
        size: 11,
        avoid: true
      });
    } else {
      this._wire(scene, L, T, Rr, T);
      const xs = n === 3 ? [-4.5, -0.5, 3.5] : [-3, 2];
      xs.forEach((x, i) => {
        this._wire(scene, x, T, x, 0.28);
        this._wire(scene, x, -0.28, x, B);
        if (flowing) {
          this._flow(scene, x, T, x, 0.28, (1 - a) * (net.items[i].Q / Qmax));
          this._flow(scene, x, -0.28, x, B, (1 - a) * (net.items[i].Q / Qmax));
        }
        drawCapV(x, 0, net.items[i].Q, i);
      });
      if (flowing) {
        this._flow(scene, L, 0.5, L, T, 1 - a);
        this._flow(scene, L, T, xs[0], T, 1 - a);
        this._flow(scene, xs[0], B, L, B, 1 - a);
        this._flow(scene, L, B, L, -0.5, 1 - a);
      }
      scene.label(-1, B - 0.6, `Mismo voltaje en todos: V = ${V} V · ΣQ = ${roundTo(net.Qtot * 1e6, 1)} µC`, {
        color: 'energy',
        size: 11,
        avoid: true
      });
    }

    // Barras comparativas de Q y V por condensador (parte inferior).
    const baseY = -7.6;
    const maxH = 2.6;
    const Vmax = Math.max(...net.items.map((it) => it.V), 1e-9);
    const x0 = -3.5;
    const groupW = 3.4;
    net.items.forEach((it, i) => {
      const gx = x0 + i * groupW;
      const hQ = maxH * (it.Q / Qmax) * a;
      const hV = maxH * (it.V / Vmax) * a;
      if (hQ > 0.02) scene.rect(gx - 0.55, baseY + hQ / 2, 0.9, hQ, { color: 'mass', fill: 'mass', alpha: 0.85, width: 1 });
      if (hV > 0.02) scene.rect(gx + 0.55, baseY + hV / 2, 0.9, hV, { color: 'energy', fill: 'energy', alpha: 0.85, width: 1, dash: [3, 2] });
      scene.label(gx, baseY - 0.25, `C${sub(i)}`, { color: 'spring', size: 11, baseline: 'top', avoid: true });
      scene.label(gx - 0.55, baseY + hQ + 0.15, `${roundTo(it.Q * 1e6, 1)}`, { color: 'mass', size: 10, avoid: true });
      scene.label(gx + 0.55, baseY + hV + 0.15, `${roundTo(it.V, 1)}`, { color: 'energy', size: 10, avoid: true });
    });
    scene.line(x0 - 1.4, baseY, x0 + (n - 1) * groupW + 1.4, baseY, { color: 'axis', width: 1.2 });

    const hud = scene.hud;
    hud.chip(`${serie ? 'Serie' : 'Paralelo'} (${n}) · C_eq = ${roundTo(net.Ceq * 1e6, 2)} µF`, 'top-left');
    hud.chip(flowing ? `Cargando… ${Math.round(a * 100)} %` : 'Carga completa (equilibrio)', 'top-left');
    hud.legend(
      [
        { color: 'mass', label: 'Q (µC)', dash: [] },
        { color: 'energy', label: 'V (V)', dash: [3, 2] }
      ],
      'bottom-right'
    );
    hud.readout(
      [
        { label: 'C_eq', value: roundTo(net.Ceq * 1e6, 2), unit: 'µF' },
        { label: 'Q total', value: roundTo(net.Qtot * 1e6, 2), unit: 'µC' },
        { label: 'U', value: roundTo(net.U * 1e6, 2), unit: 'µJ' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    if (this.params.modo === 'carga-rc') {
      const vc = this.q / this.cRc();
      return {
        'τ = RC': { value: roundTo(this.tau(), 4), unit: 's' },
        q: { value: roundTo(this.q * 1e6, 3), unit: 'µC' },
        'V_C': { value: roundTo(vc, 3), unit: 'V' },
        i: { value: roundTo(this.i * 1e3, 4), unit: 'mA' },
        U: { value: roundTo((0.5 * this.q * this.q) / this.cRc() * 1e6, 3), unit: 'µJ' }
      };
    }
    if (this.params.modo === 'asociacion') {
      const net = this.network();
      const out = {
        'C_eq': { value: roundTo(net.Ceq * 1e6, 3), unit: 'µF' },
        'Q total': { value: roundTo(net.Qtot * 1e6, 3), unit: 'µC' },
        U: { value: roundTo(net.U * 1e6, 3), unit: 'µJ' }
      };
      net.items.forEach((it, i) => {
        out[`Q${sub(i)}`] = { value: roundTo(it.Q * 1e6, 3), unit: 'µC' };
        out[`V${sub(i)}`] = { value: roundTo(it.V, 3), unit: 'V' };
      });
      return out;
    }
    const st = this.plates();
    return {
      κ: { value: this.kappa(), unit: '' },
      C: { value: roundTo(st.C * 1e12, 3), unit: 'pF' },
      Q: { value: roundTo(st.Q * 1e9, 4), unit: 'nC' },
      V: { value: roundTo(st.Vc, 3), unit: 'V' },
      E: { value: roundTo(st.E / 1000, 4), unit: 'kV/m' },
      U: { value: roundTo(st.U * 1e9, 4), unit: 'nJ' },
      'Inserción': { value: roundTo(this.f * 100, 1), unit: '%' }
    };
  }

  getState() {
    return { t: this.t, f: this.f, q: this.q, i: this.i, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.f)) this.f = clamp(s.f, 0, 1);
    if (Number.isFinite(s.q)) this.q = s.q;
    if (Number.isFinite(s.i)) this.i = s.i;
  }

  destroy() {
    this.dragging = null;
  }
}

/* ---------- formato ---------- */

const SUBS = ['₁', '₂', '₃'];
function sub(i) {
  return SUBS[i] || String(i + 1);
}

function fmtCap(F) {
  if (F < 1e-9) return `${roundTo(F * 1e12, 2)} pF`;
  if (F < 1e-6) return `${roundTo(F * 1e9, 2)} nF`;
  return `${roundTo(F * 1e6, 2)} µF`;
}

function fmtCharge(Cq) {
  if (Cq < 1e-9) return `${roundTo(Cq * 1e12, 2)} pC`;
  if (Cq < 1e-6) return `${roundTo(Cq * 1e9, 2)} nC`;
  return `${roundTo(Cq * 1e6, 2)} µC`;
}

function fmtEnergy(J) {
  if (J < 1e-9) return `${roundTo(J * 1e12, 2)} pJ`;
  if (J < 1e-6) return `${roundTo(J * 1e9, 2)} nJ`;
  if (J < 1e-3) return `${roundTo(J * 1e6, 2)} µJ`;
  return `${roundTo(J * 1e3, 2)} mJ`;
}

function fmtField(E) {
  return E >= 1000 ? `${roundTo(E / 1000, 2)} kV/m` : `${roundTo(E, 1)} V/m`;
}

function fmtCurrent(A) {
  const a = Math.abs(A);
  if (a < 1e-3) return `${roundTo(A * 1e6, 1)} µA`;
  return `${roundTo(A * 1e3, 2)} mA`;
}
