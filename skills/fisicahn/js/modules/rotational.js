/**
 * @fileoverview Circular y rotacional — torque (τ = Iα), movimiento circular
 * uniforme, precesión simple de peonza y momento angular (L = Iω), tanda 5.2.
 *
 * Migrado al contrato `SimModule`. El modo **momento angular** es la novedad de
 * la tanda: dos masas en una varilla rígida de longitud 2·r giran sin fricción
 * y el momento angular se conserva. Al mover el deslizador de r, la varilla
 * recluta (I = 2m r² cambia) y ω se ajusta a L/I al instante: L permanece
 * constante mientras la energía rotacional E = L²/2I cambia — la figura del
 * patinador que encoge los brazos. `reset()` distingue qué parámetro cambió
 * para preservar L sólo ante cambios de `r`.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const DEG = Math.PI / 180;

export default class Rotational extends SimModule {
  static viewport = { width: 22, height: 14 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'torque',
      options: [
        { value: 'torque', label: 'Torque y momento de inercia' },
        { value: 'circular', label: 'Movimiento circular uniforme' },
        { value: 'momentum', label: 'Momento angular (L se conserva)' },
        { value: 'precession', label: 'Precesión (peonza)' }
      ]
    },
    { id: 'I', label: 'Momento de inercia', latex: 'I', unit: 'kg·m²', min: 0.5, max: 8, step: 0.1, value: 2 },
    { id: 'tau', label: 'Torque aplicado', latex: '\\tau', unit: 'N·m', min: 0, max: 5, step: 0.1, value: 1.5 },
    { id: 'R', label: 'Radio (circular)', latex: 'R', unit: 'm', min: 0.8, max: 5, step: 0.1, value: 2 },
    { id: 'v', label: 'Velocidad (circular)', latex: 'v', unit: 'm/s', min: 0.5, max: 8, step: 0.1, value: 3 },
    { id: 'm', label: 'Masa de cada masa', latex: 'm', unit: 'kg', min: 0.2, max: 3, step: 0.2, value: 1 },
    { id: 'r', label: 'Brazo (mitad de la varilla)', latex: 'r', unit: 'm', min: 0.4, max: 5, step: 0.2, value: 2 },
    { id: 'omega0', label: 'ω inicial', latex: '\\omega_0', unit: 'rad/s', min: 0.5, max: 10, step: 0.5, value: 3 },
    { id: 'spin', label: 'Spin de la peonza', latex: '\\omega', unit: 'rad/s', min: 2, max: 20, step: 0.5, value: 10 },
    { id: 'Ltilt', label: 'Inclinación de la peonza', latex: '\\alpha', unit: '°', min: 5, max: 60, step: 1, value: 25 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'torque',
      I: 2,
      tau: 1.5,
      R: 2,
      v: 3,
      m: 1,
      r: 2,
      omega0: 3,
      spin: 10,
      Ltilt: 25
    };
    this.t = 0;
    this.theta = 0;
    this.omega = 0;
    this.precess = 0;
    /** Momento angular conservado (modo momentum). */
    this.L = 0;
    /** Snapshot de parámetros del último reset (para detectar qué cambió). */
    this._prevParams = null;
    this.orbit1 = new TrailBuffer(900);
    this.orbit2 = new TrailBuffer(900);
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Circular y rotacional',
      blurb: 'Torque τ = Iα, movimiento circular, momento angular L = Iω y precesión.',
      story:
        'La rotación se describe con la misma intención que la traslación: el torque es la fuerza angular (τ = Iα), y el momento angular L = Iω se conserva cuando no hay torques externos, igual que el momento lineal. Por eso un patinador encoge los brazos y gira más rápido: L no cambia, I baja, y ω sube. La peonza que no cae es la misma ley aplicada en tres dimensiones: el torque de la gravedad cambia la dirección de L, no su módulo, y el eje precesa en lugar de caer.',
      cases: [
        'Disco: τ = Iα → ω y θ crecen con el tiempo.',
        'MCU: v = ωR y a_c = v²/R apunta al centro.',
        'Momento angular: encoger el brazo sube ω con L constante.',
        'Peonza: Ω = τ/(Iω), más rapidez de giro = menos precesión.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Rotacional',
      items: [
        { name: 'Segunda ley rotacional', formula: '\\tau = I \\cdot \\alpha', note: 'Análoga a F = m·a.' },
        { name: 'Momento de inercia (varilla + 2 masas)', formula: 'I_{varilla} = 2 m r^2' },
        { name: 'Momento angular', formula: 'L = I \\cdot \\omega', note: 'Se conserva si τ_ext = 0.' },
        { name: 'Energía rotacional', formula: 'E = \\tfrac{1}{2} I \\omega^2 = L^2 / (2I)', note: 'No se conserva al cambiar I.' },
        { name: 'Aceleración centrípeta', formula: 'a_c = v^2 / R = \\omega^2 R' },
        { name: 'Precesión (aprox.)', formula: '\\Omega = \\tau / (I\\omega)', note: 'Peonza con L ≈ Iω.' }
      ]
    });
    clearChallenges(this.ui);
  }

  /** Momento de inercia de la varilla + dos masas (modo momentum). */
  Ivarilla() {
    return 2 * this.params.m * this.params.r * this.params.r;
  }

  reset() {
    const prev = this._prevParams ? { ...this._prevParams } : null;
    this._prevParams = { ...this.params };
    this.t = 0;
    this.precess = 0;
    this.orbit1.clear();
    this.orbit2.clear();

    const mode = this.params.modo;
    if (mode === 'momentum') {
      this._resetMomentum(prev);
    } else if (mode === 'circular') {
      this.theta = 0;
      this.omega = this.params.v / Math.max(this.params.R, 0.1);
    } else if (mode === 'precession') {
      this.theta = 0;
      this.omega = this.params.spin;
    } else {
      this.theta = 0;
      this.omega = 0;
    }
    this.engine?.reset?.();
  }

  /** Conserva L ante cambios de `r`; re-siembra con ω₀ si cambió m/ω₀. */
  _resetMomentum(prev) {
    const hadPrev = !!prev && prev.modo === 'momentum';
    const spinReinit = hadPrev && (prev.m !== this.params.m || prev.omega0 !== this.params.omega0);
    const radiusChanged = hadPrev && prev.r !== this.params.r;
    if (!hadPrev) {
      this.L = this.Ivarilla() * this.params.omega0;
      this.omega = this.params.omega0;
    } else if (radiusChanged) {
      // El patinador encoje/estira los brazos: L se conserva.
      this.omega = this.L / this.Ivarilla();
    } else if (spinReinit) {
      this.L = this.Ivarilla() * this.params.omega0;
      this.omega = this.params.omega0;
    }
    // Fallback por si cambió el modo recién o params extraños.
    if (!hadPrev) return;
    this.theta = 0;
  }

  update(dt) {
    this.t += dt;
    const mode = this.params.modo;
    if (mode === 'torque') {
      const alpha = this.params.tau / Math.max(this.params.I, 1e-6);
      this.omega += alpha * dt;
      this.theta += this.omega * dt;
    } else if (mode === 'circular') {
      this.omega = this.params.v / Math.max(this.params.R, 0.1);
      this.theta += this.omega * dt;
    } else if (mode === 'momentum') {
      this.omega = this.L / Math.max(this.Ivarilla(), 1e-9);
      this.theta += this.omega * dt;
      // Estelas de las dos masas para leer la velocidad angular.
      const r = this.params.r;
      this.orbit1.push({ x: r * Math.cos(this.theta), y: r * Math.sin(this.theta) });
      this.orbit2.push({ x: -r * Math.cos(this.theta), y: -r * Math.sin(this.theta) });
    } else {
      this.omega = this.params.spin;
      this.theta += this.omega * dt;
      const tilt = this.params.Ltilt * DEG;
      const tauG = this.params.m * 9.8 * 0.4 * Math.sin(tilt);
      const Lmag = Math.max(this.Ivarilla() * this.params.spin, this.params.I * this.params.spin, 1e-9);
      const Omega = tauG / Lmag;
      this.precess += Omega * dt;
    }
  }

  alpha() {
    return this.params.modo === 'torque' ? this.params.tau / Math.max(this.params.I, 1e-6) : 0;
  }

  momentL() {
    if (this.params.modo === 'momentum') return this.L;
    if (this.params.modo === 'precession') return this.Ivarilla() * this.params.spin;
    return this.params.I * this.omega;
  }

  /** Energía rotacional actual (modo momentum: usa L e I en vivo). */
  ERot() {
    if (this.params.modo === 'momentum') return (this.L * this.L) / (2 * Math.max(this.Ivarilla(), 1e-9));
    if (this.params.modo === 'torque') return 0.5 * this.params.I * this.omega * this.omega;
    return 0;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    switch (this.params.modo) {
      case 'circular':
        this._drawCircular(scene);
        break;
      case 'momentum':
        this._drawMomentum(scene);
        break;
      case 'precession':
        this._drawPrecession(scene);
        break;
      default:
        this._drawTorque(scene);
    }
  }

  _drawTorque(scene) {
    const { I, tau } = this.params;
    const cx = 0;
    const cy = 0;
    const R = 2.4;
    const hud = scene.hud;

    // Disco con sus radios para ver girar.
    scene.circle(cx, cy, R, { color: 'mass', stroke: true });
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = this.theta + (i * Math.PI * 2) / n;
      const x = R * Math.cos(a);
      const y = R * Math.sin(a);
      scene.line(cx, cy, x, y, { color: i === 0 ? 'mass2' : 'textDim', width: i === 0 ? 3 : 1.5 });
    }
    scene.body(cx, cy, { shape: 'circle', r: 0.25, color: 'textDim', label: `I = ${I} kg·m²`, labelColor: 'textDim' });

    // Torque tangencial en la periferia.
    const tx = -Math.sin(this.theta) * 1.1;
    const ty = Math.cos(this.theta) * 1.1;
    scene.vector(R * Math.cos(this.theta), R * Math.sin(this.theta), tx, ty, {
      color: 'accel',
      label: `τ = ${tau} N·m`
    });

    hud.chip(this.alpha() > 0 ? 'τ = Iα: ω crece linealmente' : 'Sin torque: ω constante', 'top-left');
    hud.readout(
      [
        { label: 'θ', value: roundTo(this.theta, 2), unit: 'rad' },
        { label: 'ω', value: roundTo(this.omega, 3), unit: 'rad/s' },
        { label: 'α', value: roundTo(this.alpha(), 3), unit: 'rad/s²' },
        { label: 'L', value: roundTo(this.momentL(), 2), unit: 'kg·m²/s' },
        { label: 'E_rot', value: roundTo(this.ERot(), 2), unit: 'J' }
      ],
      'bottom-left'
    );
  }

  _drawCircular(scene) {
    const { R, v, m } = this.params;
    const cx = 0;
    const cy = 0.5;
    const hud = scene.hud;
    const axc = R * Math.cos(this.theta);
    const ayc = R * Math.sin(this.theta);

    scene.circle(cx, cy, R, { color: 'textDim', stroke: true, width: 2, dash: [4, 4] });
    scene.body(cx + axc, cy + ayc, { shape: 'circle', r: 0.35, color: 'mass2', label: 'm' });
    // Velocidad tangencial y aceleración centrípeta.
    scene.vector(cx + axc, cy + ayc, -ayc * 0.3, axc * 0.3, { color: 'velocity', label: 'v' });
    scene.vector(cx + axc, cy + ayc, -axc * 0.45, -ayc * 0.45, { color: 'force', label: 'a_c', labelSide: -1 });

    hud.chip('MCU: v = ωR, a_c = v²/R hacia el centro', 'top-left');
    const ac = (this.omega * this.omega) * R;
    hud.readout(
      [
        { label: 'ω', value: roundTo(this.omega, 3), unit: 'rad/s' },
        { label: 'v', value: roundTo(R * this.omega, 3), unit: 'm/s' },
        { label: 'a_c', value: roundTo(ac, 3), unit: 'm/s²' },
        { label: 'F_c', value: roundTo(m * ac, 2), unit: 'N' },
        { label: 'T', value: roundTo((2 * Math.PI) / this.omega, 3), unit: 's' }
      ],
      'bottom-left'
    );
  }

  _drawMomentum(scene) {
    const { m, r, omega0 } = this.params;
    const I = this.Ivarilla();
    const L = this.momentL();
    const E = this.ERot();
    const hud = scene.hud;
    const cx = 0;
    const cy = 0;

    // Estelas de las dos masas.
    scene.trail(this.orbit1, { color: 'mass', width: 2 });
    scene.trail(this.orbit2, { color: 'mass2', width: 2 });

    // Varilla rígida con las dos masas.
    const x1 = r * Math.cos(this.theta);
    const y1 = r * Math.sin(this.theta);
    const x2 = -x1;
    const y2 = -y1;
    scene.line(cx, cy, x1, y1, { color: 'spring', width: 3 });
    scene.line(cx, cy, x2, y2, { color: 'spring', width: 3 });
    scene.body(cx, cy, { shape: 'circle', r: 0.22, color: 'textDim' });
    scene.body(x1, y1, { shape: 'circle', r: 0.22 + m * 0.12, color: 'mass', label: 'm' });
    scene.body(x2, y2, { shape: 'circle', r: 0.22 + m * 0.12, color: 'mass2', label: 'm' });
    // Círculos de órbita de las masas.
    scene.circle(cx, cy, r, { color: 'textDim', stroke: true, dash: [3, 4], alpha: 0.5 });

    // Flecha de ω arqueada y vector L a lo largo del eje.
    scene.angleArc(cx, cy, Math.atan2(y1, x1) - 0.5, Math.atan2(y1, x1) + 0.5, r * 0.7, { color: 'velocity' });
    scene.vector(cx, cy, 0, 2.6, { color: 'energy', label: `L = ${roundTo(L, 2)} kg·m²/s`, labelSide: 1, width: 3 });

    hud.chip('Momento angular conservado: encoge el brazo (r) y ω sube', 'top-left');
    hud.readout(
      [
        { label: 'I = 2mr²', value: roundTo(I, 2), unit: 'kg·m²' },
        { label: 'ω', value: roundTo(this.omega % (2 * Math.PI), 4), unit: 'rad/s' },
        { label: 'L', value: roundTo(L, 3), unit: 'kg·m²/s' },
        { label: 'E_rot', value: roundTo(E, 2), unit: 'J' },
        { label: 'ω₀ (re-siembra)', value: roundTo(omega0, 2), unit: 'rad/s' }
      ],
      'bottom-left'
    );
  }

  _drawPrecession(scene) {
    const { Ltilt, spin, m } = this.params;
    const tilt = Ltilt * DEG;
    const Lmag = this.Ivarilla() * spin;
    const tauG = m * 9.8 * 0.4 * Math.sin(tilt);
    const Omega = tauG / Lmag;
    const hud = scene.hud;
    const topX = 0;
    const topY = -1.5;

    // Cono de precesión: el eje del top traza un círculo proyectado.
    const probeR = Math.sin(tilt) * 2.5;
    scene.circle(topX, topY + 0.2, probeR, { color: 'textDim', stroke: true, dash: [3, 4], alpha: 0.5 });
    const px = probeR * Math.cos(this.precess);
    const py = probeR * Math.sin(this.precess);
    const pz = Math.cos(tilt) * 2.5;

    // Eje inclinado: base → punta (proyección 2.5D).
    const tipX = topX + px;
    const tipY = topY + pz * 0.5 + py * 0.3;
    scene.line(topX, topY, tipX, tipY, { color: 'mass2', width: 4 });
    scene.body(topX, topY, { shape: 'circle', r: 0.3, color: 'mass2' });
    scene.body(tipX, tipY, { shape: 'circle', r: 0.35, color: 'energy', label: 'L' });

    // Marca de spin en la punta.
    const spinMark = this.theta;
    scene.body(tipX + 0.35 * Math.cos(spinMark), tipY + 0.35 * Math.sin(spinMark), {
      shape: 'circle',
      r: 0.1,
      color: 'velocity'
    });

    hud.chip(`Ω = τ/(Iω) = ${roundTo(Omega, 3)} rad/s (precesión)`, 'top-left');
    hud.readout(
      [
        { label: 'ω spin', value: roundTo(spin, 2), unit: 'rad/s' },
        { label: 'L', value: roundTo(Lmag, 2), unit: 'kg·m²/s' },
        { label: 'τ_g', value: roundTo(tauG, 2), unit: 'N·m' },
        { label: 'Ω precesión', value: roundTo(Omega, 4), unit: 'rad/s' },
        { label: 'φ precesión', value: roundTo(this.precess, 2), unit: 'rad' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const mode = this.params.modo;
    const out = {
      'ω': { value: roundTo(this.omega, 3), unit: 'rad/s' },
      'θ': { value: roundTo(this.theta, 2), unit: 'rad' }
    };
    if (mode === 'torque') {
      out['α'] = { value: roundTo(this.alpha(), 3), unit: 'rad/s²' };
      out['L'] = { value: roundTo(this.momentL(), 2), unit: 'kg·m²/s' };
      out['E_rot'] = { value: roundTo(this.ERot(), 2), unit: 'J' };
    } else if (mode === 'circular') {
      out['v'] = { value: roundTo(this.params.R * this.omega, 3), unit: 'm/s' };
      out['a_c'] = { value: roundTo(this.omega * this.omega * this.params.R, 3), unit: 'm/s²' };
    } else if (mode === 'momentum') {
      out['I'] = { value: roundTo(this.Ivarilla(), 3), unit: 'kg·m²' };
      out['L (cons.)'] = { value: roundTo(this.L, 3), unit: 'kg·m²/s' };
      out['E_rot'] = { value: roundTo(this.ERot(), 2), unit: 'J' };
    } else {
      const Lmag = this.Ivarilla() * this.params.spin;
      const tauG = this.params.m * 9.8 * 0.4 * Math.sin(this.params.Ltilt * DEG);
      out['L'] = { value: roundTo(Lmag, 2), unit: 'kg·m²/s' };
      out['Ω precesión'] = { value: roundTo(tauG / Lmag, 4), unit: 'rad/s' };
    }
    return out;
  }

  getState() {
    return {
      t: this.t,
      theta: this.theta,
      omega: this.omega,
      precess: this.precess,
      L: this.L,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.theta)) this.theta = s.theta;
    if (Number.isFinite(s.omega)) this.omega = s.omega;
    if (Number.isFinite(s.precess)) this.precess = s.precess;
    if (Number.isFinite(s.L)) this.L = s.L;
    this._prevParams = { ...this.params };
    this.orbit1.clear();
    this.orbit2.clear();
  }

  destroy() {
    this.orbit1.clear();
    this.orbit2.clear();
  }
}