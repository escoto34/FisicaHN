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
import {
  setModuleInfo,
  setModuleFormulas,
  paramControl,
  bindParamControls,
  clearChallenges
} from '../module-ui.js';

/** Punto de trabajo para worldToCanvas (no allocar en bucles, §3.2). */
const _to = { x: 0, y: 0 };

export default class Kinematics extends SimModule {
  constructor(ctx) {
    super(ctx);
    this.params = { vx: 2, vy: 0, ax: 0, ay: 0 };
    this.pos = new Vector2D(0, 0);
    this.vel = new Vector2D(0, 0);
    this.accel = new Vector2D(0, 0);
    this.trail = new TrailBuffer(160);
    this.tSamples = [];
    this.isRunning = false;
    this.unbounded = false;
    this.useCharts = true;
  }

  init(meta = null) {
    this.pos = new Vector2D(-8, 0);
    this.vel = new Vector2D(this.params.vx, this.params.vy);
    this.accel = new Vector2D(this.params.ax, this.params.ay);
    this.trail.clear();
    this.tSamples = [];
    this.unbounded = false;
    this.isRunning = true;
    this.renderer?.resetCamera?.();
    this.ui.showCharts?.(true);

    setModuleInfo(this.ui, {
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

    setModuleFormulas(this.ui, {
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
    clearChallenges(this.ui);
    this.ui.setData('<p class="tab-text">Los datos apareceran al iniciar la simulacion.</p>');
    this.renderParams();
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
    this.tSamples = [];
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
    const btn = document.getElementById('param_unbounded');
    if (btn) {
      btn.setAttribute('aria-pressed', this.unbounded ? 'true' : 'false');
      btn.classList.toggle('active', this.unbounded);
      btn.textContent = this.unbounded ? 'Espacio infinito: ON' : 'Espacio infinito: OFF';
    }
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
    this.tSamples = [];
    try {
      this.renderParams();
    } catch {
      /* ignore */
    }
  }

  update(dt) {
    if (!this.isRunning) return;
    // Mutables en el hot path (§3.2): `addScaled` evita 4 Vector2D por tick.
    this.vel.addScaled(this.accel, dt);
    this.pos.addScaled(this.vel, dt);
    this.trail.push({ x: this.pos.x, y: this.pos.y });
    this.tSamples.push({
      t: this.engine?._elapsed ?? this.tSamples.length * dt,
      x: this.pos.x,
      y: this.pos.y,
      v: this.vel.magnitude()
    });
    if (this.tSamples.length > 120) this.tSamples.shift();

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

  render(ctx, alpha, elapsed) {
    if (!this.renderer) return;
    const r = this.renderer;
    if (this.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      this.trail.forEach((p, i) => {
        const s = r.worldToCanvas(p.x, p.y, _to);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      ctx.restore();
    }
    r.drawObject(this.pos.x, this.pos.y, {
      shape: 'circle',
      size: 0.4,
      color: '#4fc3f7',
      label: `t = ${roundTo(elapsed, 2)} s`
    });
    if (this.vel.magnitude() > 0.01) {
      r.drawVector(this.pos.x, this.pos.y, this.vel.x * 0.3, this.vel.y * 0.3, {
        color: '#66bb6a',
        label: `v = ${roundTo(this.vel.magnitude(), 2)} m/s`
      });
    }
    if (this.accel.magnitude() > 0.01) {
      r.drawVector(this.pos.x, this.pos.y, this.accel.x * 0.5, this.accel.y * 0.5, {
        color: '#ef5350',
        label: `a = ${roundTo(this.accel.magnitude(), 2)} m/s²`
      });
    }
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

  getCharts() {
    const points = this.tSamples.map((s) => ({ x: s.t, y: s.x }));
    if (points.length < 2) {
      return {
        title: 'x (m) frente al tiempo (s)',
        series: [{ label: 'x', points: [{ x: 0, y: this.pos.x }, { x: 1, y: this.pos.x }] }]
      };
    }
    return {
      title: 'x (m) frente al tiempo (s)',
      series: [{ label: 'x', points }]
    };
  }

  renderParams() {
    if (!this.ui) return;
    this.ui.setParams(`
      <div class="control-group">
        <button type="button" class="ctrl-btn unbounded-btn" id="param_unbounded" aria-pressed="false">
          Espacio infinito: OFF
        </button>
      </div>
      ${paramControl({ id: 'vx', labelTex: 'v_x', labelRest: 'velocidad', min: -5, max: 5, step: 0.1, value: this.params.vx, unit: 'm/s' })}
      ${paramControl({ id: 'vy', labelTex: 'v_y', labelRest: 'velocidad', min: -5, max: 5, step: 0.1, value: this.params.vy, unit: 'm/s' })}
      ${paramControl({ id: 'ax', labelTex: 'a_x', labelRest: 'aceleración', min: -2, max: 2, step: 0.1, value: this.params.ax, unit: 'm/s²' })}
      ${paramControl({ id: 'ay', labelTex: 'a_y', labelRest: 'aceleración', min: -2, max: 2, step: 0.1, value: this.params.ay, unit: 'm/s²' })}
    `);
    setTimeout(() => {
      document.getElementById('param_unbounded')?.addEventListener('click', () =>
        this.setUnbounded(!this.unbounded)
      );
      bindParamControls(['vx', 'vy', 'ax', 'ay'], (id, val) => {
        this.params[id] = val;
        this.reset();
      });
    }, 0);
  }
}
