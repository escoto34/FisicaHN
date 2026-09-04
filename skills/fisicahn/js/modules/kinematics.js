/**
 * Cinemática — MRU / MRUV + espacio infinito.
 *
 * Primer modulo migrado al contrato `SimModule`: el estado vive en la instancia
 * (no en `let` de nivel de modulo), y la estela usa el `TrailBuffer` compartido.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../utils/math-helpers.js';
import { Vector2D } from '../utils/vector2d.js';

export default class Kinematics extends SimModule {
  /** Esquema declarativo (§2.7): el anfitrión construye y enlaza el panel. */
  static params = [
    { id: 'vx', label: 'Velocidad x', latex: 'v_x', unit: 'm/s', min: -5, max: 5, step: 0.1, value: 2 },
    { id: 'vy', label: 'Velocidad y', latex: 'v_y', unit: 'm/s', min: -5, max: 5, step: 0.1, value: 0 },
    { id: 'ax', label: 'Aceleración x', latex: 'a_x', unit: 'm/s²', min: -2, max: 2, step: 0.1, value: 0 },
    { id: 'ay', label: 'Aceleración y', latex: 'a_y', unit: 'm/s²', min: -2, max: 2, step: 0.1, value: 0 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { vx: 2, vy: 0, ax: 0, ay: 0 };
    this.pos = new Vector2D(0, 0);
    this.vel = new Vector2D(0, 0);
    this.accel = new Vector2D(0, 0);
    this.trail = new TrailBuffer(160);
    /** Muestras (t, x) para la gráfica x(t): anillo de 120, listo para `hud.plot`. */
    this.tSamples = new TrailBuffer(120);
    this.isRunning = false;
    this.unbounded = true;
  }

  init(meta = null) {
    this.pos = new Vector2D(-8, 0);
    this.vel = new Vector2D(this.params.vx, this.params.vy);
    this.accel = new Vector2D(this.params.ax, this.params.ay);
    this.trail.clear();
    this.tSamples.clear();
    this.unbounded = true;
    this.isRunning = true;
    this.renderer?.resetCamera?.();

    this.setModuleInfo({
      title: meta?.title || 'Cinemática',
      blurb:
        meta?.blurb ||
        'MRU y MRUV en 1D o en el plano: posición, velocidad y aceleración (sin fuerzas).',
      story:
        'Galileo estudió la caída de cuerpos y el movimiento en planos inclinados; Newton unificó estas ideas en leyes del movimiento. Hoy la cinemática describe trayectorias en vehículos, satélites y animaciones. Aquí unificamos el movimiento unidimensional y bidimensional: usa vx, vy, ax, ay (pon vy=ay=0 para 1D).',
      cases: [
        '1D: auto en carretera a velocidad casi constante (MRU, solo vx).',
        '1D: avión acelerando en la pista (MRUV, ax distinto de 0).',
        '2D: proyectil o cohete con vx y vy (trayectoria en el plano).'
      ]
    });

    this.setModuleFormulas({
      title: 'Ecuaciones del movimiento',
      items: [
        {
          name: 'MRU (velocidad constante)',
          formula: 'x = x<sub>0</sub> + v · t',
          note: 'La posición cambia de forma proporcional al tiempo.'
        },
        {
          name: 'MRUV (aceleración constante)',
          formula: 'x = x<sub>0</sub> + v<sub>0</sub>·t + ½·a·t²',
          note: 'La velocidad tambien cambia: v = v<sub>0</sub> + a·t'
        },
        {
          name: 'Velocidad media',
          formula: 'v<sub>med</sub> = Δx / Δt',
          note: 'Desplazamiento sobre el intervalo de tiempo.'
        }
      ]
    });
    this.clearChallenges();
  }

  destroy() {
    this.isRunning = false;
    this.renderer?.resetCamera?.();
  }

  reset() {
    this.pos = new Vector2D(-8, 0);
    this.vel = new Vector2D(this.params.vx, this.params.vy);
    this.accel = new Vector2D(this.params.ax, this.params.ay);
    this.trail.clear();
    this.tSamples.clear();
    if (this.unbounded) this.renderer?.follow?.(this.pos.x, this.pos.y);
    else this.renderer?.resetCamera?.();
    this.engine?.reset?.();
  }

  setTool(toolId) {
    if (toolId === 'unbounded') this.setUnbounded(!this.unbounded);
  }

  setUnbounded(on) {
    this.unbounded = !!on;
    if (this.unbounded) this.renderer?.follow?.(this.pos.x, this.pos.y);
    else this.renderer?.resetCamera?.();
  }

  getUnbounded() {
    return this.unbounded;
  }

  getState() {
    return {
      pos: { x: this.pos.x, y: this.pos.y },
      vel: { x: this.vel.x, y: this.vel.y },
      accel: { x: this.accel.x, y: this.accel.y },
      unbounded: this.unbounded,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (s.pos) this.pos = new Vector2D(s.pos.x, s.pos.y);
    if (s.vel) this.vel = new Vector2D(s.vel.x, s.vel.y);
    if (s.accel) this.accel = new Vector2D(s.accel.x, s.accel.y);
    if (typeof s.unbounded === 'boolean') this.setUnbounded(s.unbounded);
    this.trail.clear();
    this.tSamples.clear();
  }

  update(dt) {
    if (!this.isRunning) return;
    // Mutables en el hot path (§3.2): `addScaled` evita 4 Vector2D por tick.
    this.vel.addScaled(this.accel, dt);
    this.pos.addScaled(this.vel, dt);
    this.trail.push({ x: this.pos.x, y: this.pos.y });
    this.tSamples.push({ x: this.engine?._elapsed ?? this.tSamples.length * dt, y: this.pos.x });

    if (!this.unbounded) {
      if (this.pos.x > 9.5) {
        this.pos.x = 9.5;
        this.vel.x *= -1;
      }
      if (this.pos.x < -9.5) {
        this.pos.x = -9.5;
        this.vel.x *= -1;
      }
      if (this.pos.y > 7) {
        this.pos.y = 7;
        this.vel.y *= -1;
      }
      if (this.pos.y < -7) {
        this.pos.y = -7;
        this.vel.y *= -1;
      }
    } else if (this.renderer) {
      this.renderer.follow(this.pos.x, this.pos.y);
    }
  }

  /* ---------- dibujo declarativo (§2.4, migrado en WAVE 15 para la gráfica en canvas) ---------- */

  draw(scene) {
    if (this.trail.length > 1) {
      scene.trail(this.trail, { color: 'field', dash: [4, 4], fade: false, alpha: 0.25, width: 1.5 });
    }
    scene.body(this.pos.x, this.pos.y, {
      shape: 'circle',
      r: 0.4,
      color: 'field',
      label: `t = ${roundTo(scene.elapsed, 2)} s`
    });
    if (this.vel.magnitude() > 0.01) {
      scene.vector(this.pos.x, this.pos.y, this.vel.x * 0.3, this.vel.y * 0.3, {
        color: 'velocity',
        label: `v = ${roundTo(this.vel.magnitude(), 2)} m/s`
      });
    }
    if (this.accel.magnitude() > 0.01) {
      scene.vector(this.pos.x, this.pos.y, this.accel.x * 0.5, this.accel.y * 0.5, {
        color: 'force',
        label: `a = ${roundTo(this.accel.magnitude(), 2)} m/s²`
      });
    }

    // Gráfica x(t) en el propio lienzo (§15.1): sustituye el SVG lateral.
    const vp = scene.viewport();
    const points = this.tSamples.length > 1
      ? this.tSamples
      : [{ x: 0, y: this.pos.x }, { x: 1, y: this.pos.x }];
    scene.hud.plot(
      { x: vp.x + vp.w - 220, y: vp.y + vp.h - 150, w: 200, h: 130 },
      { title: 'x (m) frente al tiempo (s)', series: [{ label: 'x', points, color: 'field' }] }
    );
  }

  /** Datos numericos separados de la presentacion (contrato readout, §3.1). */
  readout() {
    return {
      x: { value: roundTo(this.pos.x, 2), unit: 'm' },
      y: { value: roundTo(this.pos.y, 2), unit: 'm' },
      vx: { value: roundTo(this.vel.x, 2), unit: 'm/s' },
      vy: { value: roundTo(this.vel.y, 2), unit: 'm/s' },
      v: { value: roundTo(this.vel.magnitude(), 2), unit: 'm/s' },
      ax: { value: roundTo(this.accel.x, 2), unit: 'm/s²' },
      ay: { value: roundTo(this.accel.y, 2), unit: 'm/s²' },
      modo: { value: this.unbounded ? 'Espacio infinito ON' : 'Con paredes', unit: '' }
    };
  }
}
