/**
 * @fileoverview Física de partículas — trayectorias de cargas en campo B
 * (espectro/detección), tanda 5.4. Pedagogía: q, m, v y radio de curvatura
 * r = mv / |q|B. Migrado a `draw(scene)` en la WAVE 13 (§13.0/§13.3).
 *
 * Nota de alcance: la versión legacy tenía botones «Disparar e⁻/p⁺/α/μ⁻» para
 * forzar una especie. El panel declarativo (§2.7) resetea la simulación en
 * cada cambio de parámetro (`app.js: mountDeclarativeParams`), así que un
 * botón ahí borraría las trayectorias en vuelo — un regresión, no una mejora
 * de legibilidad. Se deja fuera de esta WAVE (es asunto de controles,
 * WAVE 14) y las 4 especies siguen apareciendo por el disparo automático.
 */

import { SimModule } from '../core/sim-module.js';
import { Vector2D } from '../utils/vector2d.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../utils/math-helpers.js';

const SPECIES = [
  { name: 'e⁻', q: -1, m: 0.3, color: 'field' },
  { name: 'p⁺', q: 1, m: 1.2, color: 'force' },
  { name: 'α', q: 2, m: 2.4, color: 'mass2' },
  { name: 'μ⁻', q: -1, m: 0.7, color: 'accel' }
];

export default class Particles extends SimModule {
  static viewport = { width: 20, height: 15 };

  /** El centro de la región de campo B es el origen del mundo (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'B', label: 'Campo', latex: 'B', unit: 'T', min: 0.2, max: 3, step: 0.1, value: 1.2 },
    { id: 'v0', label: 'Velocidad inicial', latex: 'v_0', unit: 'm/s', min: 1, max: 8, step: 0.5, value: 4 },
    { id: 'm', label: 'Factor de masa', latex: 'm', unit: '×', min: 0.5, max: 2, step: 0.1, value: 1 },
    { id: 'q', label: 'Factor de carga', latex: 'q', unit: '×', min: 0.5, max: 2, step: 0.1, value: 1 },
    { id: 'autoFire', type: 'checkbox', label: 'Disparo automático', value: true }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { B: 1.2, v0: 4, m: 1, q: 1, autoFire: true };
    /** @type {Array<{name:string, pos:Vector2D, vel:Vector2D, q:number, m:number, color:string, trail:TrailBuffer, life:number}>} */
    this.particles = [];
    this.fireCooldown = 0;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Cargas en campo B (partículas)',
      blurb: meta?.blurb || 'Varias especies (e⁻, p⁺, α…) en B: curvatura y r = mv/|q|B.',
      story:
        'Mismo principio que "Campos magnéticos" (Lorentz), pero aquí se lanzan varias especies con distinta m y q para comparar radios — enfoque de espectrómetro/detector. El módulo de campos magnéticos es la intro con una sola carga.',
      cases: [
        'Espectrómetro de masas: separar iones por m/q.',
        'Detectores en colisionadores (curvatura → momento).',
        'Comparar e⁻ vs p⁺: mismo |q| pero distinta masa → distinto r.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Fuerza de Lorentz', formula: 'F = q \\cdot (v \\times B)', note: 'Perpendicular a v y a B; no cambia |v| (solo dirección).' },
        { name: 'Radio de Larmor', formula: 'r = m v_\\perp / |q| B', note: 'Mayor momento o menor |q|B → curva más abierta.' },
        { name: 'Periodo ciclotrón', formula: 'T = 2\\pi m / |q| B', note: 'Independiente de la velocidad (no relativista).' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.particles = [];
    this.fireCooldown = 0;
    this.engine?.reset?.();
    this.spawn(0);
  }

  spawn(kindIndex) {
    const sp = SPECIES[kindIndex % SPECIES.length];
    const q = this.params.q * Math.sign(sp.q) * Math.abs(sp.q);
    const m = Math.max(0.15, this.params.m * sp.m);
    this.particles.push({
      name: sp.name,
      pos: new Vector2D(-7.5, (Math.random() - 0.5) * 1.2),
      vel: new Vector2D(this.params.v0, 0),
      q,
      m,
      color: sp.color,
      trail: new TrailBuffer(80),
      life: 12
    });
    while (this.particles.length > 12) this.particles.shift();
  }

  update(dt) {
    const { B, autoFire } = this.params;

    if (autoFire) {
      this.fireCooldown -= dt;
      if (this.fireCooldown <= 0) {
        this.spawn(Math.floor(Math.random() * SPECIES.length));
        this.fireCooldown = 1.6;
      }
    }

    for (const p of this.particles) {
      // F = q v × B  →  a = (q/m) v × Bẑ  → ax = (qB/m) vy, ay = -(qB/m) vx  (2D)
      const k = (p.q * B) / p.m;
      const ax = k * p.vel.y;
      const ay = -k * p.vel.x;
      p.vel.set(p.vel.x + ax * dt, p.vel.y + ay * dt);
      p.pos.addScaled(p.vel, dt);
      p.trail.push({ x: p.pos.x, y: p.pos.y });
      p.life -= dt;
    }
    let write = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0 && Math.abs(p.pos.x) < 14 && Math.abs(p.pos.y) < 12) {
        if (write !== i) this.particles[write] = p;
        write++;
      }
    }
    this.particles.length = write;
  }

  /* ---------- dibujo declarativo (§2.4, migrado en WAVE 13) ---------- */

  draw(scene) {
    // Región de campo B, centrada en el origen (§17.1).
    scene.rect(0, 0, 16, 12, { color: 'field', fill: 'field', alpha: 0.06, stroke: true });
    scene.label(0, 6.6, `B = ${roundTo(this.params.B, 2)} T (⊙ o ⊗ según convención 2D)`, {
      color: 'field', size: 11
    });

    for (const p of this.particles) {
      if (p.trail.length > 1) scene.trail(p.trail, { color: p.color, width: 2, fade: true });
      scene.body(p.pos.x, p.pos.y, { shape: 'circle', r: 0.2 + p.m * 0.05, color: p.color, label: p.name });
    }

    // Emisor
    scene.body(-8.2, 0, { shape: 'rect', r: 0.25, color: 'textDim', glow: false, label: 'fuente' });

    const last = this.particles[this.particles.length - 1];
    const rLar =
      last && Math.abs(last.q * this.params.B) > 1e-6
        ? (last.m * last.vel.magnitude()) / Math.abs(last.q * this.params.B)
        : 0;
    scene.hud.readout(
      [
        { label: 'partículas', value: this.particles.length, unit: '' },
        { label: 'B', value: roundTo(this.params.B, 2), unit: 'T' },
        { label: 'última', value: last ? last.name : '—', unit: '' },
        { label: 'r', value: last ? roundTo(rLar, 2) : 0, unit: 'm' }
      ],
      'top-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const last = this.particles[this.particles.length - 1];
    const rLar =
      last && Math.abs(last.q * this.params.B) > 1e-6
        ? (last.m * last.vel.magnitude()) / Math.abs(last.q * this.params.B)
        : 0;
    return {
      partículas: { value: this.particles.length, unit: '' },
      B: { value: roundTo(this.params.B, 2), unit: 'T' },
      última: { value: last ? last.name : '—', unit: '' },
      r: { value: last ? roundTo(rLar, 2) : 0, unit: 'm' }
    };
  }

  getState() {
    return { params: { ...this.params } };
  }

  setState(s) {
    if (!s?.params) return;
    Object.assign(this.params, s.params);
  }
}
