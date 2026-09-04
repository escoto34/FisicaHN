/**
 * @fileoverview Dinámica — F = m·a + espacio infinito.
 *
 * Migrado al contrato `SimModule` con `draw(scene)`: el estado vive en la
 * instancia, los parámetros son un esquema declarativo (§2.7) y el dibujo usa
 * el vocabulario de la escena (§2.4). La cámara libre («espacio infinito»)
 * sigue al cuerpo vía `renderer.follow()`, igual que `kinematics`; con paredes
 * el cuerpo rebota perdiendo un 20 % de velocidad en cada choque.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../core/geometry.js';

/** Semiancho / semialto del recinto con paredes (unidades de mundo). */
const WALL_X = 9.5;
const WALL_Y = 7;
/** Posición inicial del cuerpo. */
const X0 = -6;
const Y0 = 0;
/** Escalas de dibujo de los vectores (unidades de mundo por N, m/s y m/s²). */
const K_FORCE = 0.15;
const K_VEL = 0.2;
const K_ACC = 0.35;

export default class DynamicsModule extends SimModule {
  /** Encuadre: el recinto de paredes (19 × 14) cabe con margen. */
  static viewport = { width: 22, height: 14 };
  /** Punto fijo: el centro del recinto. */
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'mass', label: 'Masa', latex: 'm', unit: 'kg', min: 0.5, max: 10, step: 0.5, value: 2 },
    { id: 'fx', label: 'Fuerza horizontal', latex: 'F_x', unit: 'N', min: -20, max: 20, step: 0.5, value: 5 },
    { id: 'fy', label: 'Fuerza vertical', latex: 'F_y', unit: 'N', min: -20, max: 20, step: 0.5, value: 0 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { mass: 2, fx: 5, fy: 0 };
    this.t = 0;
    this.x = X0;
    this.y = Y0;
    this.vx = 0;
    this.vy = 0;
    /** Aceleración y fuerza derivadas de los params (se recalculan por paso). */
    this.ax = 0;
    this.ay = 0;
    this.isRunning = false;
    /** Espacio infinito: la cámara sigue al cuerpo. Empieza activo (§5.5). */
    this.unbounded = true;
    /** Estela en anillo: sin `shift()` por frame (§3.2). */
    this.trail = new TrailBuffer(120);
    /** Historial |v|(t) para la gráfica del HUD. */
    this.history = new TrailBuffer(240);
    this.dragging = null;
  }

  init(meta = null) {
    this.isRunning = true;
    this.unbounded = true;
    this.reset();
    this.renderer?.resetCamera?.();

    this.setModuleInfo({
      title: meta?.title || 'Fuerzas y movimiento',
      blurb:
        meta?.blurb ||
        'Segunda ley de Newton: la fuerza neta determina la aceleración (F = m·a).',
      story:
        'Newton relacionó fuerza, masa y aceleración. Distinto de cinemática: aquí la causa del movimiento es F. Distinto de energía en el resorte: aquí se aplica una fuerza constante y se ve a = F/m.',
      cases: [
        'Empujar un carrito de supermercado (más masa → menos aceleración).',
        'Frenar un camión vs una bicicleta con la misma fuerza de freno.',
        'Cohete: empuje del motor menos el peso.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Segunda ley', formula: 'F = m · a', note: 'Fuerza neta en newtons (N), masa en kg, a en m/s².' },
        { name: 'Aceleración', formula: 'a = F / m', note: 'A mayor masa, menor aceleración para la misma F.' },
        { name: 'Velocidad con a constante', formula: 'v = v<sub>0</sub> + a · t' }
      ]
    });
    this.clearChallenges();
  }

  destroy() {
    this.isRunning = false;
    this.trail.clear();
    this.history.clear();
    this.renderer?.resetCamera?.();
  }

  reset() {
    this.t = 0;
    this.x = X0;
    this.y = Y0;
    this.vx = 0;
    this.vy = 0;
    this.trail.clear();
    this.history.clear();
    this._applyForce();
    if (this.unbounded) this.renderer?.follow?.(this.x, this.y);
    else this.renderer?.resetCamera?.();
    this.engine?.reset?.();
  }

  setTool(toolId) {
    if (toolId === 'unbounded') this.setUnbounded(!this.unbounded);
  }

  /** Espacio infinito ON/OFF. Sin DOM: el anfitrión refleja el estado en el botón. */
  setUnbounded(on) {
    this.unbounded = !!on;
    if (this.unbounded) this.renderer?.follow?.(this.x, this.y);
    else this.renderer?.resetCamera?.();
  }

  getUnbounded() {
    return this.unbounded;
  }

  _applyForce() {
    const m = this.params.mass;
    this.ax = this.params.fx / m;
    this.ay = this.params.fy / m;
  }

  forceMagnitude() {
    return Math.hypot(this.params.fx, this.params.fy);
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }

  accelMagnitude() {
    return Math.hypot(this.ax, this.ay);
  }

  /** Radio del cuerpo, creciente con la masa (tope 0.8). */
  radius() {
    return Math.min(0.3 + this.params.mass * 0.06, 0.8);
  }

  update(dt) {
    if (!this.isRunning || this.dragging) return;
    this.t += dt;
    this._applyForce();
    this.vx += this.ax * dt;
    this.vy += this.ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.trail.push({ x: this.x, y: this.y });
    this.history.push({ x: this.t, y: this.speed() });

    if (!this.unbounded) {
      // Rebote con pérdida del 20 % de velocidad en cada pared.
      if (this.x > WALL_X) {
        this.x = WALL_X;
        this.vx *= -0.8;
      }
      if (this.x < -WALL_X) {
        this.x = -WALL_X;
        this.vx *= -0.8;
      }
      if (this.y > WALL_Y) {
        this.y = WALL_Y;
        this.vy *= -0.8;
      }
      if (this.y < -WALL_Y) {
        this.y = -WALL_Y;
        this.vy *= -0.8;
      }
    } else {
      this.renderer?.follow?.(this.x, this.y);
    }
  }

  /* ---------- interacción directa (§2.6) ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    this.x = world.x;
    this.y = world.y;
    this.vx = 0;
    this.vy = 0;
    this.trail.clear();
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const r = this.radius();
    const F = this.forceMagnitude();
    const v = this.speed();
    const a = this.accelMagnitude();

    // Recinto con paredes: sólo cuando el espacio no es infinito.
    if (!this.unbounded) {
      scene.rect(0, 0, WALL_X * 2, WALL_Y * 2, { color: 'textDim', width: 2, dash: [6, 4], alpha: 0.7 });
      scene.hatch(-WALL_X, -WALL_Y, WALL_X, -WALL_Y, { color: 'textDim', side: 1, spacing: 14 });
    }

    // Marca del punto de partida: hace visible el desplazamiento acumulado.
    scene.circle(X0, Y0, 0.12, { color: 'textDim', dash: [2, 2], width: 1 });

    if (this.trail.length > 1) {
      scene.trail(this.trail, { color: 'trail', width: 1.5, dash: [4, 4], fade: true });
    }

    scene.body(this.x, this.y, {
      shape: 'circle',
      r,
      color: 'mass',
      id: 'cuerpo',
      label: `m = ${this.params.mass} kg`,
      labelColor: 'mass'
    });

    // Fuerza (sólida) y velocidad (a trazos): etiquetas en lados opuestos.
    if (F > 0.01) {
      scene.vector(this.x, this.y, this.params.fx * K_FORCE, this.params.fy * K_FORCE, {
        color: 'force',
        width: 2.5,
        label: `F = ${roundTo(F, 1)} N`,
        labelSide: 1,
        labelPad: 16
      });
      // Aceleración: misma dirección que F, más corta y punteada, para que se
      // lea «a = F/m» sin tapar a la fuerza.
      scene.vector(this.x, this.y, this.ax * K_ACC, this.ay * K_ACC, {
        color: 'accel',
        width: 2,
        dash: [3, 3],
        label: `a = ${roundTo(a, 2)} m/s²`,
        labelSide: 1,
        labelPad: 34
      });
    }
    if (v > 0.01) {
      scene.vector(this.x, this.y, this.vx * K_VEL, this.vy * K_VEL, {
        color: 'velocity',
        width: 2.5,
        dash: [6, 3],
        label: `v = ${roundTo(v, 2)} m/s`,
        labelSide: -1,
        labelPad: 16
      });
    }

    // HUD: estado, lecturas y gráfica |v|(t).
    const hud = scene.hud;
    hud.chip(this.unbounded ? 'Espacio infinito: la cámara sigue al cuerpo' : 'Con paredes: rebote (−20 % de v)', 'top-left');
    hud.readout(
      [
        { label: 'm', value: this.params.mass, unit: 'kg' },
        { label: 'F', value: F, unit: 'N' },
        { label: 'a', value: a, unit: 'm/s²' },
        { label: 'v', value: v, unit: 'm/s' },
        { label: 't', value: this.t, unit: 's' }
      ],
      'bottom-left'
    );

    const vp = scene.viewport();
    if (vp.w > 420) {
      const points = this.history.length > 1 ? this.history : [{ x: 0, y: v }, { x: 1, y: v }];
      hud.plot(
        { x: vp.x + vp.w - 210, y: vp.y + vp.h - 128, w: 195, h: 116 },
        {
          title: 'Rapidez |v| (m/s) frente a t (s)',
          series: [{ points, color: 'velocity', label: '|v|' }]
        }
      );
    }
  }

  /* ---------- datos numéricos (§1.1) ---------- */

  readout() {
    return {
      m: { value: this.params.mass, unit: 'kg' },
      'F_x': { value: this.params.fx, unit: 'N' },
      'F_y': { value: this.params.fy, unit: 'N' },
      a: { value: roundTo(this.accelMagnitude(), 3), unit: 'm/s²' },
      v: { value: roundTo(this.speed(), 3), unit: 'm/s' },
      x: { value: roundTo(this.x, 2), unit: 'm' },
      y: { value: roundTo(this.y, 2), unit: 'm' },
      t: { value: roundTo(this.t, 2), unit: 's' },
      modo: { value: this.unbounded ? 'Espacio infinito ON' : 'Con paredes', unit: '' }
    };
  }

  getState() {
    return {
      pos: { x: this.x, y: this.y },
      vel: { x: this.vx, y: this.vy },
      accel: { x: this.ax, y: this.ay },
      force: { x: this.params.fx, y: this.params.fy },
      t: this.t,
      unbounded: this.unbounded,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    this._applyForce();
    if (s.pos) {
      this.x = s.pos.x;
      this.y = s.pos.y;
    }
    if (s.vel) {
      this.vx = s.vel.x;
      this.vy = s.vel.y;
    }
    if (Number.isFinite(s.t)) this.t = s.t;
    if (typeof s.unbounded === 'boolean') this.setUnbounded(s.unbounded);
    this.trail.clear();
    this.history.clear();
  }
}
