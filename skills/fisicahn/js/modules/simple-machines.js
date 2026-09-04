/**
 * @fileoverview Máquinas simples — palanca, poleas, plano inclinado y torno.
 *
 * Una máquina simple no ahorra trabajo: cambia la **fuerza** que hay que
 * hacer a costa de la **distancia** que hay que recorrer. Ese es el hilo
 * conductor de los tres modos:
 *
 * - `palanca`: 1.ª, 2.ª o 3.ª clase; brazos arrastrables; el torque neto
 *   decide si la carga sube, baja o queda en equilibrio (VM = d_e / d_c).
 * - `poleas`: polea fija (cambia la dirección), móvil (n = 2) y polipasto
 *   de n cuerdas (F = P / n; hay que recoger n·h de cuerda).
 * - `plano-torno`: plano inclinado (VM = L / h = 1 / sin θ) y torno o rueda
 *   con eje (VM = R / r).
 *
 * En todos: ventaja mecánica ideal frente a real con eficiencia η, fuerza
 * necesaria, trabajo de entrada y de salida (gráfica W(t)) y `readout()` con
 * números, no HTML. El modelo de movimiento es cinemático y didáctico: si la
 * fuerza aplicada supera a la necesaria, la carga sube a velocidad
 * proporcional al exceso; si no llega, baja (o se queda en el suelo).
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { clamp, roundTo, toRad } from '../core/geometry.js';

/** Unidades de mundo por metro en cada escena. */
const LEVER_SCALE = 2.0;
const ROPE_SCALE = 1.5;
const PLANE_SCALE = 2.0;
const WHEEL_SCALE = 3.0;
/** Longitud fija del plano inclinado (m). */
const PLANE_LEN = 4;
/** Inclinación máxima de la palanca antes de tocar el suelo (°). */
const MAX_LEVER_DEG = 25;
/** Velocidad del lado del esfuerzo cuando F supera claramente a la necesaria (m/s). */
const V_IN = 0.6;
/** Banda muerta relativa que se considera equilibrio. */
const DEADBAND = 0.02;
/** Metros de mundo por newton al dibujar vectores de fuerza. */
const KF = 0.0045;

const MODE_LABEL = { palanca: 'Palanca', poleas: 'Poleas', 'plano-torno': 'Plano inclinado y torno' };
const PULLEY_LABEL = { fija: 'Polea fija', movil: 'Polea móvil', polipasto: 'Polipasto' };

export default class SimpleMachines extends SimModule {
  static viewport = { width: 22, height: 13 };

  /** Punto fijo: el apoyo de la palanca / la polea fija / el eje del torno (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Máquina',
      value: 'palanca',
      options: [
        { value: 'palanca', label: 'Palanca' },
        { value: 'poleas', label: 'Poleas' },
        { value: 'plano-torno', label: 'Plano inclinado y torno' }
      ]
    },
    {
      id: 'clase',
      type: 'select',
      label: 'Clase de palanca',
      value: '1',
      options: [
        { value: '1', label: '1.ª clase (apoyo en medio)' },
        { value: '2', label: '2.ª clase (carga en medio)' },
        { value: '3', label: '3.ª clase (esfuerzo en medio)' }
      ]
    },
    {
      id: 'tipoPolea',
      type: 'select',
      label: 'Sistema de poleas',
      value: 'movil',
      options: [
        { value: 'fija', label: 'Polea fija' },
        { value: 'movil', label: 'Polea móvil' },
        { value: 'polipasto', label: 'Polipasto (n cuerdas)' }
      ]
    },
    {
      id: 'dispositivo',
      type: 'select',
      label: 'Dispositivo',
      value: 'plano',
      options: [
        { value: 'plano', label: 'Plano inclinado' },
        { value: 'torno', label: 'Torno (rueda y eje)' }
      ]
    },
    { id: 'P', label: 'Peso de la carga', latex: 'P', unit: 'N', min: 20, max: 500, step: 10, value: 200 },
    { id: 'F', label: 'Fuerza aplicada', latex: 'F', unit: 'N', min: 0, max: 500, step: 5, value: 100 },
    { id: 'dCarga', label: 'Brazo de la carga', latex: 'd_c', unit: 'm', min: 0.2, max: 3, step: 0.1, value: 1 },
    { id: 'dEsfuerzo', label: 'Brazo del esfuerzo', latex: 'd_e', unit: 'm', min: 0.2, max: 3, step: 0.1, value: 2 },
    { id: 'n', label: 'Cuerdas del polipasto', latex: 'n', min: 2, max: 6, step: 1, value: 4 },
    { id: 'angulo', label: 'Ángulo del plano', latex: '\\theta', unit: '°', min: 10, max: 60, step: 1, value: 30 },
    { id: 'R', label: 'Radio de la rueda', latex: 'R', unit: 'm', min: 0.2, max: 1, step: 0.05, value: 0.6 },
    { id: 'r', label: 'Radio del eje', latex: 'r', unit: 'm', min: 0.05, max: 0.4, step: 0.01, value: 0.15 },
    { id: 'eta', label: 'Eficiencia', latex: '\\eta', min: 0.3, max: 1, step: 0.05, value: 0.8 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'palanca',
      clase: '1',
      tipoPolea: 'movil',
      dispositivo: 'plano',
      P: 200,
      F: 100,
      dCarga: 1,
      dEsfuerzo: 2,
      n: 4,
      angulo: 30,
      R: 0.6,
      r: 0.15,
      eta: 0.8
    };
    this.t = 0;
    /** Altura ganada por la carga (m). En la palanca puede ser negativa (la carga baja). */
    this.h = 0;
    /** Velocidad vertical actual de la carga (m/s), para el chip de estado. */
    this.vOut = 0;
    /** Trabajo de entrada y de salida frente al tiempo (gráfica en lienzo). */
    this.histIn = new TrailBuffer(240);
    this.histOut = new TrailBuffer(240);
    this._sampleTick = 0;
    /** Cuerpo arrastrado (brazos de la palanca), o null. */
    this.dragging = null;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Máquinas simples',
      blurb:
        meta?.blurb ||
        'Palanca, poleas, plano inclinado y torno: menos fuerza a cambio de más distancia. Ventaja mecánica, eficiencia y trabajo.',
      story:
        'Arquímedes decía que con una palanca lo bastante larga movería el mundo. Ninguna máquina simple regala trabajo: ' +
        'multiplica la fuerza en la misma proporción en que alarga el recorrido (VM = d_esfuerzo / d_carga), y el rozamiento ' +
        'se cobra su parte: el trabajo útil es η veces el que entra.',
      cases: [
        'Carretilla (2.ª clase): la carga entre la rueda y las manos.',
        'Pinzas o caña de pescar (3.ª clase): más recorrido, menos fuerza multiplicada.',
        'Polipasto de un taller mecánico: seis cuerdas, un sexto de la fuerza.',
        'Rampa para subir una carga a un camión: cuanto más larga, menos empuje.',
        'Pozo con manivela: la rueda grande gira el eje pequeño que enrolla la cuerda.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Ventaja mecánica ideal', formula: 'VM_i = \\dfrac{d_{esfuerzo}}{d_{carga}} = \\dfrac{P}{F_{ideal}}' },
        { name: 'Palanca (equilibrio)', formula: 'F \\cdot d_e = P \\cdot d_c', note: 'Torque neto nulo respecto al apoyo.' },
        { name: 'Poleas', formula: 'F = \\dfrac{P}{n},\\quad d_{cuerda} = n \\cdot h', note: 'n = número de cuerdas que sostienen la carga.' },
        { name: 'Plano inclinado', formula: 'VM = \\dfrac{L}{h} = \\dfrac{1}{\\sin\\theta}' },
        { name: 'Torno', formula: 'VM = \\dfrac{R}{r}' },
        { name: 'Eficiencia', formula: '\\eta = \\dfrac{W_{salida}}{W_{entrada}},\\quad VM_{real} = \\eta \\cdot VM_i' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.h = 0;
    this.vOut = 0;
    this.histIn.clear();
    this.histOut.clear();
    this._sampleTick = 0;
    this.engine?.reset?.();
  }

  /* ---------- física ---------- */

  /** Brazos efectivos de la palanca: en 2.ª y 3.ª clase el orden sobre la barra está fijado por la clase. */
  leverArms() {
    const { clase, dCarga, dEsfuerzo } = this.params;
    let dc = dCarga;
    let de = dEsfuerzo;
    if (clase === '2') de = Math.max(de, dc + 0.1);
    else if (clase === '3') de = Math.min(de, Math.max(0.1, dc - 0.1));
    return { dc, de, limited: de !== dEsfuerzo };
  }

  /** Número de cuerdas que sostienen la carga en el sistema de poleas. */
  ropeCount() {
    const { tipoPolea, n } = this.params;
    if (tipoPolea === 'fija') return 1;
    if (tipoPolea === 'movil') return 2;
    return Math.round(clamp(n, 2, 6));
  }

  /** Radios efectivos del torno (u de mundo y m): el eje siempre más pequeño que la rueda. */
  wheelRadii() {
    const R = this.params.R;
    const r = Math.min(this.params.r, R * 0.8);
    return { R, r };
  }

  /** Ventaja mecánica ideal de la máquina activa. */
  idealAdvantage() {
    const { modo, dispositivo, angulo } = this.params;
    if (modo === 'palanca') {
      const { dc, de } = this.leverArms();
      return de / dc;
    }
    if (modo === 'poleas') return this.ropeCount();
    if (dispositivo === 'torno') {
      const { R, r } = this.wheelRadii();
      return R / r;
    }
    return 1 / Math.sin(toRad(angulo));
  }

  /** Altura máxima que la carga puede ganar en la escena (m). */
  maxLift() {
    const { modo, dispositivo, angulo } = this.params;
    if (modo === 'palanca') return this.leverArms().dc * Math.sin(toRad(MAX_LEVER_DEG));
    if (modo === 'poleas') return Math.min(2.5, 4 / this.ropeCount());
    if (dispositivo === 'torno') {
      const { R, r } = this.wheelRadii();
      // El recorrido de la mano se limita a 2.5 u de mundo para no salir del encuadre.
      return (2.5 / WHEEL_SCALE) * (r / R);
    }
    return PLANE_LEN * Math.sin(toRad(angulo));
  }

  /** Magnitudes de la máquina: VM ideal/real, fuerzas, distancias y trabajos. */
  machine() {
    const { P, F, eta } = this.params;
    const vmI = this.idealAdvantage();
    const vmR = vmI * eta;
    const fIdeal = P / vmI;
    const fReal = P / vmR;
    const hUtil = Math.max(this.h, 0);
    const dIn = vmI * hUtil;
    const wOut = P * hUtil;
    const wIn = fReal * dIn;
    return { vmI, vmR, fIdeal, fReal, dIn, hUtil, wOut, wIn, exceso: (F - fReal) / Math.max(fReal, 1e-6) };
  }

  update(dt) {
    this.t += dt;
    const m = this.machine();
    const hMin = this.params.modo === 'palanca' ? -this.maxLift() : 0;
    const hMax = this.maxLift();
    let vIn = 0;
    if (Math.abs(m.exceso) > DEADBAND) vIn = V_IN * clamp(m.exceso, -1, 1);
    this.vOut = vIn / m.vmI;
    const next = clamp(this.h + this.vOut * dt, hMin, hMax);
    if (next === this.h) this.vOut = 0;
    this.h = next;

    // Muestra W(t) cada ~4 pasos: 240 puntos cubren ~16 s de historia.
    if (++this._sampleTick >= 4) {
      this._sampleTick = 0;
      const mm = this.machine();
      this.histIn.push({ x: this.t, y: mm.wIn });
      this.histOut.push({ x: this.t, y: mm.wOut });
    }
  }

  /* ---------- manipulación directa: brazos de la palanca ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    if (this.params.modo !== 'palanca') return;
    const metros = clamp(Math.abs(world.x) / LEVER_SCALE, 0.2, 3);
    const v = Math.round(metros * 10) / 10;
    if (id === 'carga') this.params.dCarga = v;
    else if (id === 'esfuerzo') this.params.dEsfuerzo = v;
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { modo, dispositivo } = this.params;
    if (modo === 'palanca') this.drawLever(scene);
    else if (modo === 'poleas') this.drawPulleys(scene);
    else if (dispositivo === 'torno') this.drawWheel(scene);
    else this.drawPlane(scene);
    this.drawHud(scene);
  }

  /** Estado de movimiento para el chip principal. */
  statusText() {
    const m = this.machine();
    if (Math.abs(m.exceso) <= DEADBAND) return { text: 'Equilibrio: F = P / VM', color: 'energy' };
    if (this.vOut > 0) return { text: 'La carga sube: F > F necesaria', color: 'velocity' };
    if (this.vOut < 0) return { text: 'La carga baja: F < F necesaria', color: 'force' };
    if (m.exceso > 0) return { text: 'Tope alcanzado: la carga llegó arriba', color: 'energy' };
    return { text: 'F insuficiente: la carga no se mueve', color: 'force' };
  }

  drawLever(scene) {
    const { P, F, clase } = this.params;
    const { dc, de, limited } = this.leverArms();
    const S = LEVER_SCALE;
    const sinT = clamp(this.h / dc, -1, 1);
    const theta = Math.asin(sinT);
    const cosT = Math.cos(theta);

    // Posiciones de carga y esfuerzo sobre la barra (mundo).
    let xl, yl, xe, ye, x0, y0, x1, y1;
    if (clase === '1') {
      xl = -dc * S * cosT;
      yl = dc * S * sinT;
      xe = de * S * cosT;
      ye = -de * S * sinT;
      x0 = xl;
      y0 = yl;
      x1 = xe;
      y1 = ye;
    } else {
      xl = dc * S * cosT;
      yl = dc * S * sinT;
      xe = de * S * cosT;
      ye = de * S * sinT;
      const L = Math.max(dc, de) * S + 0.3;
      x0 = 0;
      y0 = 0;
      x1 = L * cosT;
      y1 = L * sinT;
    }

    // Suelo y apoyo (rayado de apoyo fijo, §13.2).
    const groundY = -1.15;
    scene.line(-8, groundY, 8, groundY, { color: 'textDim', width: 2 });
    scene.hatch(-8, groundY, 8, groundY, { spacing: 10, length: 10, side: 1 });
    scene.polygon(
      [
        { x: 0, y: -0.12 },
        { x: -0.6, y: groundY },
        { x: 0.6, y: groundY }
      ],
      { color: 'textDim', fill: 'textDim', fillAlpha: 0.7, width: 1.5 }
    );

    // Barra: polígono grueso girado θ alrededor del apoyo.
    const nx = -Math.sin(theta) * 0.13;
    const ny = Math.cos(theta) * 0.13;
    scene.polygon(
      [
        { x: x0 + nx, y: y0 + ny },
        { x: x1 + nx, y: y1 + ny },
        { x: x1 - nx, y: y1 - ny },
        { x: x0 - nx, y: y0 - ny }
      ],
      { color: 'spring', fill: 'spring', fillAlpha: 0.85, width: 1.5 }
    );
    scene.circle(0, 0, 0.14, { color: 'text', fill: 'text', width: 1 });

    // Carga: caja apoyada sobre la barra, arrastrable por su brazo.
    const size = 0.3 + (P / 500) * 0.35;
    const boxY = yl + 0.13 + size;
    scene.body(xl, boxY, {
      shape: 'rect',
      r: size,
      color: this.dragging === 'carga' ? 'mass2' : 'mass',
      id: 'carga',
      label: `P = ${P} N`
    });
    scene.vector(xl, boxY, 0, -P * KF, { color: 'force', width: 2, label: 'P', labelSide: -1 });

    // Esfuerzo: en 1.ª clase se empuja hacia abajo; en 2.ª y 3.ª se tira hacia arriba.
    const up = clase !== '1';
    const fLen = Math.max(F * KF, 0.001);
    scene.body(xe, ye, { shape: 'circle', r: 0.22, color: this.dragging === 'esfuerzo' ? 'mass2' : 'force', id: 'esfuerzo' });
    if (F > 0) {
      if (up) scene.vector(xe, ye + 0.22, 0, fLen, { color: 'force', label: `F = ${F} N`, labelSide: -1 });
      else scene.vector(xe, ye + 0.22 + fLen, 0, -fLen, { color: 'force', label: `F = ${F} N`, labelSide: -1 });
    }

    // Cotas de los brazos bajo el suelo (dos alturas para que no se pisen).
    const yd1 = groundY - 0.55;
    const yd2 = groundY - 1.15;
    scene.dimension(0, yd1, xl, yd1, `d_c = ${roundTo(dc, 2)} m`, { color: 'mass' });
    scene.dimension(0, yd2, xe, yd2, `d_e = ${roundTo(de, 2)} m${limited ? ' (limitado)' : ''}`, { color: 'force' });
    scene.line(xl, groundY, xl, yd1, { color: 'mass', width: 1, dash: [3, 3] });
    scene.line(xe, groundY, xe, yd2, { color: 'force', width: 1, dash: [3, 3] });

    // Sentido de giro cuando hay torque neto.
    if (this.vOut !== 0) {
      const ccw = clase === '1' ? this.vOut > 0 : this.vOut < 0;
      scene.arc(0, 0, 0.8, ccw ? -0.6 : 0.6, ccw ? 2.2 : -2.2, { color: 'accel', width: 1.5, dash: [4, 3] });
    }
  }

  drawPulleys(scene) {
    const { P, F, tipoPolea } = this.params;
    const n = this.ropeCount();
    const S = ROPE_SCALE;
    const hU = this.h * S;
    const dIn = this.machine().dIn * S;
    const rFix = 0.6;
    const ropeAngle = dIn / rFix;
    const boxHalf = 0.35 + (P / 500) * 0.3;

    // Techo con rayado (§13.2) y soporte de la polea fija en el origen.
    const roofY = 0.8;
    scene.line(-7, roofY, 7, roofY, { color: 'textDim', width: 2 });
    scene.hatch(-7, roofY, 7, roofY, { spacing: 10, length: 10, side: -1 });

    let handX;
    let handY0;
    let boxX;
    let boxY;
    if (tipoPolea === 'fija') {
      scene.line(0, rFix, 0, roofY, { color: 'textDim', width: 3 });
      scene.pulley(0, 0, rFix, { color: 'spring', angle: ropeAngle });
      boxX = -rFix;
      boxY = -5.6 + hU;
      handX = rFix;
      handY0 = -2.4;
      scene.line(-rFix, 0, -rFix, boxY + boxHalf, { color: 'spring', width: 2 });
      scene.arc(0, 0, rFix, 0, Math.PI, { color: 'spring', width: 2 });
      scene.line(rFix, 0, rFix, handY0 - dIn, { color: 'spring', width: 2 });
    } else if (tipoPolea === 'movil') {
      scene.line(0, rFix, 0, roofY, { color: 'textDim', width: 3 });
      scene.pulley(0, 0, rFix, { color: 'spring', angle: ropeAngle });
      const rMov = 0.5;
      // La tangente derecha de la polea móvil coincide con la izquierda de la fija.
      const mx = -rFix - rMov;
      const my = -3.4 + hU;
      scene.pulley(mx, my, rMov, { color: 'spring', angle: -ropeAngle * (rFix / rMov) });
      // Cuerda: anclaje en el techo → polea móvil → polea fija → mano.
      scene.line(mx - rMov, roofY, mx - rMov, my, { color: 'spring', width: 2 });
      scene.circle(mx - rMov, roofY, 0.12, { color: 'textDim', fill: 'textDim' });
      scene.arc(mx, my, rMov, Math.PI, 2 * Math.PI, { color: 'spring', width: 2 });
      scene.line(-rFix, my, -rFix, 0, { color: 'spring', width: 2 });
      scene.arc(0, 0, rFix, 0, Math.PI, { color: 'spring', width: 2 });
      boxX = mx;
      boxY = my - rMov - 0.25 - boxHalf;
      scene.line(mx, my - rMov, mx, boxY + boxHalf, { color: 'textDim', width: 3 });
      handX = rFix;
      handY0 = -2.4;
      scene.line(rFix, 0, rFix, handY0 - dIn, { color: 'spring', width: 2 });
    } else {
      // Polipasto: n tramos verticales entre el bloque superior y el inferior.
      const gap = 0.7;
      const rB = 0.32;
      const xs = [];
      for (let i = 0; i < n; i++) xs.push(-((n - 1) * gap) / 2 + i * gap);
      const topY = 0;
      const botY = -3.2 + hU;
      scene.line(0, rB, 0, roofY, { color: 'textDim', width: 3 });
      scene.rect(0, topY + rB * 0.5, (n - 1) * gap + 1.0, 0.36, { color: 'textDim', fill: 'textDim', width: 1 });
      scene.rect(0, botY - rB * 0.5, (n - 1) * gap + 1.0, 0.36, { color: 'textDim', fill: 'textDim', width: 1 });
      // Tramos rectos.
      for (let i = 0; i < n; i++) scene.line(xs[i], topY, xs[i], botY, { color: 'spring', width: 2 });
      // Extremo muerto y poleas: el último tramo debe subir hacia la polea de
      // salida, así que con n par la cuerda empieza arriba y con n impar, abajo.
      const startTop = n % 2 === 0;
      if (startTop) scene.circle(xs[0], topY, 0.1, { color: 'textDim', fill: 'textDim' });
      else scene.circle(xs[0], botY, 0.1, { color: 'textDim', fill: 'textDim' });
      for (let i = 0; i < n - 1; i++) {
        const cx = (xs[i] + xs[i + 1]) / 2;
        const upPair = startTop ? i % 2 === 1 : i % 2 === 0;
        if (upPair) {
          scene.pulley(cx, topY, rB, { color: 'spring', angle: ropeAngle * (rFix / rB) });
          scene.arc(cx, topY, rB + 0.03, 0, Math.PI, { color: 'spring', width: 2 });
        } else {
          scene.pulley(cx, botY, rB, { color: 'spring', angle: -ropeAngle * (rFix / rB) });
          scene.arc(cx, botY, rB + 0.03, Math.PI, 2 * Math.PI, { color: 'spring', width: 2 });
        }
      }
      // Salida hacia la mano: polea superior derecha.
      const lastX = xs[n - 1];
      const exitX = lastX + rB * 2;
      scene.pulley(lastX + rB, topY, rB, { color: 'spring', angle: ropeAngle * (rFix / rB) });
      scene.arc(lastX + rB, topY, rB + 0.03, 0, Math.PI, { color: 'spring', width: 2 });
      handX = exitX;
      handY0 = -1.6;
      scene.line(exitX, topY, exitX, handY0 - dIn, { color: 'spring', width: 2 });
      boxX = 0;
      boxY = botY - 0.5 - boxHalf;
      scene.line(0, botY - 0.18, 0, boxY + boxHalf, { color: 'textDim', width: 3 });
    }

    // Carga y su peso.
    scene.body(boxX, boxY, { shape: 'rect', r: boxHalf, color: 'mass', label: `P = ${P} N` });
    scene.vector(boxX, boxY, 0, -P * KF, { color: 'force', width: 2, label: 'P', labelSide: 1 });

    // Mano y fuerza aplicada (tira hacia abajo).
    const handY = handY0 - dIn;
    scene.body(handX, handY, { shape: 'circle', r: 0.22, color: 'force' });
    if (F > 0) scene.vector(handX, handY - 0.22, 0, -F * KF, { color: 'force', label: `F = ${F} N`, labelSide: -1 });

    // Cotas: altura ganada por la carga y cuerda recogida.
    if (this.h > 0.02) {
      const yBase = boxY - hU;
      scene.dimension(boxX - boxHalf - 0.5, yBase, boxX - boxHalf - 0.5, boxY, `h = ${roundTo(this.h, 2)} m`, { color: 'velocity' });
      scene.dimension(handX + 0.5, handY0, handX + 0.5, handY, `${n}·h = ${roundTo(this.machine().dIn, 2)} m`, { color: 'force' });
    }
    scene.label(0, roofY + 0.35, `${PULLEY_LABEL[tipoPolea]} · n = ${n} cuerda${n > 1 ? 's' : ''}`, {
      color: 'textDim', size: 12, baseline: 'bottom', avoid: true
    });
  }

  drawPlane(scene) {
    const { P, F, angulo } = this.params;
    const th = toRad(angulo);
    const Lu = PLANE_LEN * PLANE_SCALE;
    const A = { x: -4.5, y: -3 };
    const B = { x: A.x + Lu * Math.cos(th), y: A.y };
    const C = { x: B.x, y: A.y + Lu * Math.sin(th) };

    scene.line(A.x - 1.5, A.y, B.x + 1.5, A.y, { color: 'textDim', width: 2 });
    scene.hatch(A.x - 1.5, A.y, B.x + 1.5, A.y, { spacing: 10, length: 10, side: 1 });
    scene.polygon([A, B, C], { color: 'spring', fill: 'spring', fillAlpha: 0.25, width: 2 });
    scene.angleArc(A.x, A.y, 0, th, 1.3, { color: 'accel', label: `θ = ${angulo}°` });

    // Bloque sobre el plano, a distancia d_in del pie.
    const s = this.machine().dIn * PLANE_SCALE;
    const half = 0.36;
    const bx = A.x + s * Math.cos(th) - half * Math.sin(th);
    const by = A.y + s * Math.sin(th) + half * Math.cos(th);
    scene.body(bx, by, { shape: 'rect', r: half, color: 'mass', rotation: th, label: `P = ${P} N` });
    scene.vector(bx, by, 0, -P * KF, { color: 'force', width: 2, label: 'P', labelSide: 1 });
    if (F > 0) {
      scene.vector(bx, by, F * KF * Math.cos(th), F * KF * Math.sin(th), { color: 'force', label: `F = ${F} N`, labelSide: -1 });
    }

    // Cotas: L a lo largo del plano (por encima) y h en el lado vertical.
    const off = 0.9;
    scene.dimension(
      A.x - off * Math.sin(th), A.y + off * Math.cos(th),
      C.x - off * Math.sin(th), C.y + off * Math.cos(th),
      `L = ${PLANE_LEN} m`, { color: 'textDim' }
    );
    scene.dimension(B.x + 0.6, B.y, C.x + 0.6, C.y, `h = ${roundTo(PLANE_LEN * Math.sin(th), 2)} m`, { color: 'velocity' });
  }

  drawWheel(scene) {
    const { P, F } = this.params;
    const { R, r } = this.wheelRadii();
    const Ru = R * WHEEL_SCALE;
    const ru = r * WHEEL_SCALE;
    const dInU = this.machine().dIn * WHEEL_SCALE;
    const phi = dInU / Ru;
    const hU = this.h * WHEEL_SCALE;

    // Soporte del eje.
    const roofY = Ru + 0.9;
    scene.line(-2.5, roofY, 2.5, roofY, { color: 'textDim', width: 2 });
    scene.hatch(-2.5, roofY, 2.5, roofY, { spacing: 10, length: 10, side: -1 });
    scene.line(0, 0, 0, roofY, { color: 'textDim', width: 3 });

    // Rueda con radios (el giro se ve) y eje.
    scene.circle(0, 0, Ru, { color: 'spring', fill: 'spring', alpha: 0.18, stroke: false });
    for (let k = 0; k < 6; k++) {
      const a = -phi + (k * Math.PI) / 3;
      scene.line(0, 0, Ru * Math.cos(a), Ru * Math.sin(a), { color: 'spring', width: 1.2, alpha: 0.7 });
    }
    scene.pulley(0, 0, Ru, { color: 'spring', width: 2.5 });
    scene.circle(0, 0, ru, { color: 'mass', fill: 'mass', alpha: 0.35 });
    scene.pulley(0, 0, ru, { color: 'mass', angle: -phi, width: 2 });

    // Cuerda de la carga en el eje (izquierda) y del esfuerzo en la rueda (derecha).
    const boxHalf = 0.35 + (P / 500) * 0.3;
    const boxY = -5.3 + hU;
    scene.line(-ru, 0, -ru, boxY + boxHalf, { color: 'spring', width: 2 });
    scene.body(-ru, boxY, { shape: 'rect', r: boxHalf, color: 'mass', label: `P = ${P} N` });
    scene.vector(-ru, boxY, 0, -P * KF, { color: 'force', width: 2, label: 'P', labelSide: 1 });

    const handY0 = -Ru - 0.6;
    const handY = handY0 - dInU;
    scene.line(Ru, 0, Ru, handY, { color: 'force', width: 2 });
    scene.body(Ru, handY, { shape: 'circle', r: 0.22, color: 'force' });
    if (F > 0) scene.vector(Ru, handY - 0.22, 0, -F * KF, { color: 'force', label: `F = ${F} N`, labelSide: -1 });

    // Cotas de radios.
    scene.dimension(0, 0.25, Ru * Math.cos(0.6), Ru * Math.sin(0.6) + 0.25, `R = ${R} m`, { color: 'textDim' });
    scene.dimension(0, -0.2, -ru, -0.2, `r = ${roundTo(r, 2)} m`, { color: 'mass' });
  }

  drawHud(scene) {
    const { modo, clase, tipoPolea, dispositivo, eta } = this.params;
    const m = this.machine();
    const hud = scene.hud;
    const st = this.statusText();

    let titulo;
    if (modo === 'palanca') titulo = `Palanca de ${clase}.ª clase`;
    else if (modo === 'poleas') titulo = PULLEY_LABEL[tipoPolea];
    else titulo = dispositivo === 'torno' ? 'Torno (rueda y eje)' : 'Plano inclinado';

    hud.chip(`${titulo} · VM ideal = ${roundTo(m.vmI, 2)}`, 'top-right', { color: 'accent' });
    hud.chip(st.text, 'top-left', { color: st.color });
    hud.readout(
      [
        { label: 'F necesaria', value: roundTo(m.fReal, 1), unit: 'N' },
        { label: 'F ideal', value: roundTo(m.fIdeal, 1), unit: 'N' },
        { label: 'VM real', value: roundTo(m.vmR, 2), unit: '' },
        { label: 'η', value: roundTo(eta * 100, 0), unit: '%' }
      ],
      'top-left'
    );

    const vp = scene.viewport();
    if (vp.w > 420 && this.histIn.size > 1) {
      const wMax = Math.max(m.wIn, 1);
      hud.plot(
        { x: vp.x + vp.w - 220, y: vp.y + vp.h - 132, w: 205, h: 120 },
        {
          title: 'Trabajo W(t): entrada vs salida',
          series: [
            { points: this.histIn, color: 'force', label: 'W entrada' },
            { points: this.histOut, color: 'energy', label: 'W salida', dash: [5, 4] }
          ],
          yRange: [0, wMax * 1.2]
        }
      );
      hud.legend(
        [
          { color: 'force', label: `W entrada = ${roundTo(m.wIn, 1)} J`, dash: [] },
          { color: 'energy', label: `W salida = ${roundTo(m.wOut, 1)} J`, dash: [5, 4] }
        ],
        'bottom-left'
      );
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const { modo, dispositivo, P, F, eta } = this.params;
    const m = this.machine();
    const out = {
      'VM ideal': { value: roundTo(m.vmI, 3), unit: '' },
      'VM real': { value: roundTo(m.vmR, 3), unit: '' },
      'F necesaria': { value: roundTo(m.fReal, 2), unit: 'N' },
      'F aplicada': { value: F, unit: 'N' },
      'W entrada': { value: roundTo(m.wIn, 2), unit: 'J' },
      'W salida': { value: roundTo(m.wOut, 2), unit: 'J' },
      'η': { value: roundTo(eta * 100, 1), unit: '%' },
      h: { value: roundTo(this.h, 3), unit: 'm' }
    };
    if (modo === 'palanca') {
      const { dc, de } = this.leverArms();
      out['τ esfuerzo'] = { value: roundTo(F * de, 2), unit: 'N·m' };
      out['τ carga'] = { value: roundTo(P * dc, 2), unit: 'N·m' };
      out['τ neto'] = { value: roundTo(F * de - P * dc, 2), unit: 'N·m' };
    } else if (modo === 'poleas') {
      out['n cuerdas'] = { value: this.ropeCount(), unit: '' };
      out['cuerda recogida'] = { value: roundTo(m.dIn, 3), unit: 'm' };
    } else if (dispositivo === 'torno') {
      out['giro'] = { value: roundTo((m.dIn / this.wheelRadii().R) * (180 / Math.PI), 1), unit: '°' };
    } else {
      out['recorrido L'] = { value: roundTo(m.dIn, 3), unit: 'm' };
    }
    return out;
  }

  getState() {
    return { t: this.t, h: this.h, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.h)) this.h = s.h;
    this.vOut = 0;
    this.histIn.clear();
    this.histOut.clear();
  }

  destroy() {
    this.histIn.clear();
    this.histOut.clear();
    this.dragging = null;
  }
}
