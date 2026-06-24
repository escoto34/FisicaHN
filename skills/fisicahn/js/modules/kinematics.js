/**
 * @fileoverview Módulo de Cinemática — MRU y MRUV.
 */

import { Vector2D } from '../utils/vector2d.js';
import { roundTo } from '../utils/math-helpers.js';

let pos = new Vector2D(0, 0);
let vel = new Vector2D(2, 0);
let accel = new Vector2D(0, 0);

let trail = [];
const MAX_TRAIL = 100;

let isRunning = false;
let _engine = null;
let _renderer = null;
let _ui = null;

/** Parámetros configurables por el usuario */
const params = {
  vx: 2,
  vy: 0,
  ax: 0,
  ay: 0
};

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  pos = new Vector2D(-8, 0);
  vel = new Vector2D(params.vx, params.vy);
  accel = new Vector2D(params.ax, params.ay);
  trail = [];
  isRunning = true;

  ui.setInfo(`
    <strong>Cinemática</strong> — Movimiento Rectilíneo Uniforme (MRU) y Uniformemente Acelerado (MRUV).<br>
    Observa la posición, velocidad y aceleración del objeto en tiempo real.<br>
    Ajusta los parámetros en el panel derecho.
  `);

  ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>MRU:</strong> x = x₀ + v·t</li>
      <li><strong>MRUV:</strong> x = x₀ + v₀·t + ½·a·t²</li>
      <li><strong>v = v₀ + a·t</strong></li>
    </ul>
  `);

  ui.setData('<p class="tab-text">Los datos aparecerán al iniciar la simulación.</p>');

  ui.setChallenges(`
    <p class="tab-text">
      🎯 <strong>Desafío 1:</strong> Ajusta la velocidad para que el objeto llegue a x=10 en exactamente 5 segundos.<br>
      🎯 <strong>Desafío 2:</strong> Con aceleración 0.5 m/s², ¿cuánto tiempo tarda en alcanzar v=4 m/s?
    </p>
  `);

  renderParams();
}

export function destroy() {
  isRunning = false;
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function reset(engine, renderer, ui) {
  pos = new Vector2D(-8, 0);
  vel = new Vector2D(params.vx, params.vy);
  accel = new Vector2D(params.ax, params.ay);
  trail = [];
  engine.reset();
}

export function setTool(toolId) {
  // Sin implementación específica para cinemática
}

export function update(dt) {
  if (!isRunning) return;

  // Integración simple (Euler)
  vel = vel.add(accel.scale(dt));
  pos = pos.add(vel.scale(dt));

  // Guardar trayectoria
  trail.push(pos.clone());
  if (trail.length > MAX_TRAIL) trail.shift();

  // Rebote simple en los bordes (mundo: ±10 en X, ±7.5 en Y)
  if (pos.x > 9.5) { pos.x = 9.5; vel.x *= -1; }
  if (pos.x < -9.5) { pos.x = -9.5; vel.x *= -1; }
  if (pos.y > 7) { pos.y = 7; vel.y *= -1; }
  if (pos.y < -7) { pos.y = -7; vel.y *= -1; }

  // Actualizar panel de datos
  updateData();
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;

  // Dibujar trayectoria
  if (trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const p = r.worldToCanvas(trail[i].x, trail[i].y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Dibujar objeto
  r.drawObject(pos.x, pos.y, {
    shape: 'circle',
    size: 0.4,
    color: '#4fc3f7',
    label: `t = ${roundTo(elapsed, 2)}s`
  });

  // Dibujar vector velocidad (si no es cero)
  if (vel.magnitude() > 0.01) {
    r.drawVector(pos.x, pos.y, vel.x * 0.3, vel.y * 0.3, {
      color: '#66bb6a',
      label: `v = ${roundTo(vel.magnitude(), 2)} m/s`
    });
  }

  // Dibujar vector aceleración (si no es cero)
  if (accel.magnitude() > 0.01) {
    r.drawVector(pos.x, pos.y, accel.x * 0.5, accel.y * 0.5, {
      color: '#ef5350',
      label: `a = ${roundTo(accel.magnitude(), 2)} m/s²`
    });
  }

  // Información en la parte superior derecha del canvas
  ctx.save();
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const info = [
    `x = ${roundTo(pos.x, 2)} m`,
    `v = ${roundTo(vel.magnitude(), 2)} m/s`,
    `a = ${roundTo(accel.magnitude(), 2)} m/s²`
  ];
  info.forEach((line, i) => {
    ctx.fillText(line, 10, 10 + i * 18);
  });
  ctx.restore();
}

function updateData() {
  if (!_ui) return;
  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.8">
      <div>x = ${roundTo(pos.x, 2)} m</div>
      <div>y = ${roundTo(pos.y, 2)} m</div>
      <div>v<sub>x</sub> = ${roundTo(vel.x, 2)} m/s</div>
      <div>v<sub>y</sub> = ${roundTo(vel.y, 2)} m/s</div>
      <div>|v| = ${roundTo(vel.magnitude(), 2)} m/s</div>
      <div>a<sub>x</sub> = ${roundTo(accel.x, 2)} m/s²</div>
      <div>a<sub>y</sub> = ${roundTo(accel.y, 2)} m/s²</div>
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Velocidad inicial X (m/s)</label>
      <input type="range" class="custom-slider" id="param_vx" min="-5" max="5" step="0.1" value="${params.vx}">
      <span class="slider-value" style="display:inline-block;width:auto">${params.vx} m/s</span>
    </div>
    <div class="control-group">
      <label class="control-label">Velocidad inicial Y (m/s)</label>
      <input type="range" class="custom-slider" id="param_vy" min="-5" max="5" step="0.1" value="${params.vy}">
      <span class="slider-value" style="display:inline-block;width:auto">${params.vy} m/s</span>
    </div>
    <div class="control-group">
      <label class="control-label">Aceleración X (m/s²)</label>
      <input type="range" class="custom-slider" id="param_ax" min="-2" max="2" step="0.1" value="${params.ax}">
      <span class="slider-value" style="display:inline-block;width:auto">${params.ax} m/s²</span>
    </div>
    <div class="control-group">
      <label class="control-label">Aceleración Y (m/s²)</label>
      <input type="range" class="custom-slider" id="param_ay" min="-2" max="2" step="0.1" value="${params.ay}">
      <span class="slider-value" style="display:inline-block;width:auto">${params.ay} m/s²</span>
    </div>
  `);

  // Vincular eventos después de inyectar HTML
  setTimeout(() => {
    ['vx', 'vy', 'ax', 'ay'].forEach(id => {
      const el = document.getElementById(`param_${id}`);
      if (!el) return;
      const display = el.nextElementSibling;
      el.addEventListener('input', () => {
        const val = parseFloat(el.value);
        params[id] = val;
        if (display) display.textContent = val + (id.includes('a') ? ' m/s²' : ' m/s');
        // Reiniciar con nuevos parámetros
        reset(_engine, _renderer, _ui);
      });
    });
  }, 50);
}
