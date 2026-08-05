/**
 * @fileoverview Proyectil — tiro parabólico con estela, trayectoria y cota del
 * alcance (tanda 5.1). Ejercita `trail`, `plot` y `dimension`.
 *
 * El proyectil sale del origen con v₀ y ángulo θ; se integra la mecánica
 * (sin resistencia del aire) y al tocar el suelo se anota alcance, tiempo de
 * vuelo y altura máxima. Una gráfica y(t) registra los datos para comparar con
 * el resultado de vaciado (sin v₀y horizontal: lanzamiento desde una altura).
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const G = 9.8;
const DEG = Math.PI / 180;

export default class ProjectileModule extends SimModule {
  static viewport = { width: 24, height: 14 };

  static params = [
    { id: 'v0', label: 'Velocidad inicial', latex: 'v_0', unit: 'm/s', min: 2, max: 40, step: 0.5, value: 18 },
    { id: 'ang', label: 'Ángulo', latex: '\\theta', unit: '°', min: 0, max: 90, step: 1, value: 45 },
    { id: 'h0', label: 'Altura inicial', latex: 'h_0', unit: 'm', min: 0, max: 8, step: 0.5, value: 0 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { v0: 18, ang: 45, h0: 0 };
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.t = 0;
    this.launched = false;
    this.landed = false;
    this.trail = new TrailBuffer(400);
    this.samples = [];
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Proyectil',
      blurb: 'Tiro parabólico: alcance, altura máxima y tiempo de vuelo.',
      story:
        'Un proyectil es el caso más puro de movimiento en dos dimensiones: la componente horizontal no sufre fuerza y la vertical responde a la gravedad. Las dos se componen en una parábola. Sin resistencia del aire, la física es exacta y medible: el alcance máximo se da a 45°.',
      cases: [
        'Lanzar al ángulo óptimo (45°) y comparar el alcance con 30° y 60°.',
        'Cortar un problema de MRU + caída libre: la horizontal y la vertical no se mezclan.',
        'Lanzar desde un acantilado (h₀ > 0): alargar la parábola y medir el tiempo.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Tiro parabólico',
      items: [
        {
          name: 'Posición',
          formula: 'x = v_0x·t,  y = y_0 + v_0y·t − ½·g·t²',
          note: 'v_0x = v₀·cos θ, v_0y = v₀·sin θ.'
        },
        {
          name: 'Tiempo de vuelo (desde el suelo)',
          formula: 't_v = 2·v₀·sin θ / g',
          note: 'Para h₀ = 0. Con altura inicial, es la solución de la cuadrática.'
        },
        {
          name: 'Alcance',
          formula: 'R = v₀²·sin 2θ / g',
          note: 'Máximo en θ = 45° (sin resistencia).'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    const { v0, ang, h0 } = this.params;
    this.x = 0;
    this.y = h0;
    this.vx = v0 * Math.cos(ang * DEG);
    this.vy = v0 * Math.sin(ang * DEG);
    this.t = 0;
    this.launched = true;
    this.landed = false;
    this.trail.clear();
    this.samples = [];
    this.engine?.reset?.();
  }

  update(dt) {
    if (!this.launched || this.landed) return;
    const prevX = this.x;
    const prevY = this.y;
    this.vy -= G * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.t += dt;
    this.trail.push({ x: this.x, y: this.y });
    this.samples.push({ t: this.t, x: this.x, y: this.y });

    if (this.y <= 0) {
      this.landed = true;
      // Alcance exacto por interpolación lineal del último paso.
      const frac = prevY / (prevY - this.y || 1e-9);
      this.x = prevX + (this.x - prevX) * Math.min(1, Math.max(0, frac));
      this.y = 0;
      this.t = this.t - dt + dt * Math.min(1, Math.max(0, frac));
    }
  }

  maxHeight() {
    const { h0 } = this.params;
    return h0 + (this.vy ** 2) / (2 * G);
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const vp = scene.viewport();

    // Suelo.
    scene.rect(vp.x + 0.2, 0.05, vp.w - 0.4, 0.12, { color: 'textDim', fill: true });
    scene.label(vp.x + vp.w - 0.3, -0.5, 'suelo (y = 0)', { color: 'textDim' });

    // Ejes.
    scene.line(vp.x + 0.2, 0, vp.x + vp.w - 0.2, 0, { color: 'textDim', width: 1.5 });
    scene.line(vp.x + 0.2, 0, vp.x + 0.2, 0.5, { color: 'textDim', width: 1.5 });

    // Trayectoria (estela) + puntos muestreados para el plot.
    if (this.trail.length > 1) {
      scene.trail(this.trail, { color: 'velocity', width: 2.5 });
    }

    // Cuerpo del proyectil.
    scene.body(this.x, this.y, { shape: 'circle', r: 0.28, color: 'mass' });

    // Vectores de velocidad en vuelo.
    if (this.launched && !this.landed && this.t > 0.02) {
      scene.vector(this.x, this.y, this.vx * 0.12, this.vy * 0.12, { color: 'velocity', width: 2 });
    }

    // Cota del alcance al aterrizar, y líneas de altura máxima.
    if (this.landed) {
      scene.dimension(0, -1.3, this.x, -1.3, `R = ${roundTo(this.x, 2)} m`, { color: 'energy' });
      scene.line(this.x, 0, this.x, -0.15, { color: 'energy', dash: [3, 3] });
    }
    const hMax = this.maxHeight();
    if (hMax > this.params.h0 && this.landed) {
      scene.line(this.samplesReducedX(hMax), 0, this.samplesReducedX(hMax), hMax, {
        color: 'mass2',
        dash: [4, 4],
        alpha: 0.6
      });
      scene.label(this.samplesReducedX(hMax) - 0.25, hMax / 2, `h_max = ${roundTo(hMax, 2)} m`, {
        color: 'mass2',
        offsetX: -8
      });
    }

    const hud = scene.hud;
    hud.chip('Proyectil', 'top-left');
    hud.readout(
      [
        { label: 't', value: roundTo(this.t, 2), unit: 's' },
        { label: 'x', value: roundTo(this.x, 2), unit: 'm' },
        { label: 'y', value: roundTo(this.y, 2), unit: 'm' },
        ...(this.landed
          ? [
              { label: 'R', value: roundTo(this.x, 2), unit: 'm' },
              { label: 'h_max', value: roundTo(hMax, 2), unit: 'm' }
            ]
          : [])
      ],
      'bottom-left'
    );

    // Gráfica y(t) en el lienzo (primitiva `plot`).
    if (this.samples.length > 1 && vp.w > 460) {
      hud.plot(
        { x: vp.x + vp.w - 225, y: vp.y + vp.h - 140, w: 205, h: 124 },
        {
          title: 'y (m) frente a t (s)',
          series: [{ points: this.samples.map((s) => ({ x: s.t, y: s.y })), color: 'velocity', label: 'y' }]
        }
      );
    }
  }

  /** x en el que la trayectoria alcanza su altura máxima (sonda en samples). */
  samplesReducedX(hMax) {
    // El máximo de la parábola está en t = v0y/g; x en ese instante:
    return this.vx * (this.params.v0 * Math.sin(this.params.ang * DEG)) / G;
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const out = {
      t: { value: roundTo(this.t, 2), unit: 's' },
      x: { value: roundTo(this.x, 2), unit: 'm' },
      y: { value: roundTo(this.y, 2), unit: 'm' },
      vx: { value: roundTo(this.vx, 2), unit: 'm/s' },
      vy: { value: roundTo(this.vy, 2), unit: 'm/s' },
      'h_max': { value: roundTo(this.maxHeight(), 2), unit: 'm' }
    };
    if (this.landed) {
      out['alcance'] = { value: roundTo(this.x, 2), unit: 'm' };
      out['t_vuelo'] = { value: roundTo(this.t, 2), unit: 's' };
    }
    return out;
  }

  getState() {
    return {
      x: this.x, y: this.y, vx: this.vx, vy: this.vy, t: this.t,
      landed: this.landed, launched: this.launched,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.x)) this.x = s.x;
    if (Number.isFinite(s.y)) this.y = s.y;
    if (Number.isFinite(s.vx)) this.vx = s.vx;
    if (Number.isFinite(s.vy)) this.vy = s.vy;
    if (Number.isFinite(s.t)) this.t = s.t;
    if (typeof s.landed === 'boolean') this.landed = s.landed;
    if (typeof s.launched === 'boolean') this.launched = s.launched;
    this.trail.clear();
    this.samples = [];
  }

  destroy() {
    this.trail.clear();
  }
}