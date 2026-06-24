/**
 * @fileoverview Módulo de Dinámica — Fuerzas, masa y aceleración (Leyes de Newton).
 */

import { Vector2D } from '../utils/vector2d.js';
import { roundTo } from '../utils/math-helpers.js';

let pos = new Vector2D(0, 0);
let vel = new Vector2D(0, 0);
let accel = new Vector2D(0, 0);
let force = new Vector2D(0, 0);

let trail = [];
const MAX_TRAIL = 80;
let isRunning = false;
let _engine = null;
let _renderer = null;
let _ui = null;

const params = {
  mass: 2,
  fx: 5,
  fy: 0
};

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  pos = new Vector2D(-6, 0);
  vel = new Vector2D(0, 0);
  isRunning = true;
  trail = [];
  applyForce();

  ui.setInfo(`
    <strong>Dinámica</strong> — Segunda Ley de Newton: F = m·a.<br>
    Aplica una fuerza a un objeto y observa cómo la masa afecta la aceleración resultante.
  `);

  ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>F = m · a</strong></li>
      <li><strong>a = F / m</strong></li>
      <li><strong>v = v₀ + a·t</strong></li>
    </ul>
  `);

  ui.setData('<p class="tab-text">Ajusta los parámetros para ver los datos.</p>');

  ui.setChallenges(`
    <p class="tab-text">
      🎯 <strong>Desafío 1:</strong> Con m=5 kg y F=10 N, ¿cuál es la aceleración?<br>
      🎯 <strong>Desafío 2:</strong> ¿Qué fuerza se necesita para acelerar 3 kg a 4 m/s²?
    </p>
  `);

  renderParams();
}

export function destroy() {
  isRunning = false;
  _engine = _renderer = _ui = null;
}

export function reset(engine, renderer, ui) {
  pos = new Vector2D(-6, 0);
  vel = new Vector2D(0, 0);
  trail = [];
  applyForce();
  engine.reset();
}

export function setTool(toolId) {}

function applyForce() {
  const m = params.mass;
  force = new Vector2D(params.fx, params.fy);
  accel = new Vector2D(force.x / m, force.y / m);
}

export function update(dt) {
  if (!isRunning) return;
  applyForce();
  vel = vel.add(accel.scale(dt));
  pos = pos.add(vel.scale(dt));

  trail.push(pos.clone());
  if (trail.length > MAX_TRAIL) trail.shift();

  if (pos.x > 9.5) { pos.x = 9.5; vel.x *= -0.8; }
  if (pos.x < -9.5) { pos.x = -9.5; vel.x *= -0.8; }
  if (pos.y > 7) { pos.y = 7; vel.y *= -0.8; }
  if (pos.y < -7) { pos.y = -7; vel.y *= -0.8; }

  updateData();
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;
  const r = _renderer;

  if (trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 183, 77, 0.2)';
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

  const size = 0.3 + (params.mass * 0.06);
  r.drawObject(pos.x, pos.y, {
    shape: 'circle',
    size: Math.min(size, 0.8),
    color: '#ffb74d',
    label: `m = ${params.mass} kg`
  });

  if (force.magnitude() > 0.01) {
    r.drawVector(pos.x, pos.y, force.x * 0.15, force.y * 0.15, {
      color: '#ef5350',
      label: `F = ${roundTo(force.magnitude(), 1)} N`
    });
  }

  if (vel.magnitude() > 0.01) {
    r.drawVector(pos.x, pos.y, vel.x * 0.2, vel.y * 0.2, {
      color: '#66bb6a',
      label: `v = ${roundTo(vel.magnitude(), 2)} m/s`
    });
  }

  ctx.save();
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const info = [
    `m = ${params.mass} kg`,
    `F = ${roundTo(force.magnitude(), 1)} N`,
    `a = ${roundTo(accel.magnitude(), 2)} m/s²`,
    `v = ${roundTo(vel.magnitude(), 2)} m/s`
  ];
  info.forEach((line, i) => ctx.fillText(line, 10, 10 + i * 18));
  ctx.restore();
}

function updateData() {
  if (!_ui) return;
  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.8">
      <div>Masa = ${params.mass} kg</div>
      <div>Fuerza X = ${params.fx} N</div>
      <div>Fuerza Y = ${params.fy} N</div>
      <div>|F| = ${roundTo(force.magnitude(), 2)} N</div>
      <div>a<sub>x</sub> = ${roundTo(accel.x, 2)} m/s²</div>
      <div>a<sub>y</sub> = ${roundTo(accel.y, 2)} m/s²</div>
      <div>|v| = ${roundTo(vel.magnitude(), 2)} m/s</div>
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Masa (kg)</label>
      <input type="range" class="custom-slider" id="param_mass" min="0.5" max="10" step="0.5" value="${params.mass}">
      <span class="slider-value" style="display:inline-block;width:auto">${params.mass} kg</span>
    </div>
    <div class="control-group">
      <label class="control-label">Fuerza X (N)</label>
      <input type="range" class="custom-slider" id="param_fx" min="-10" max="10" step="0.5" value="${params.fx}">
      <span class="slider-value" style="display:inline-block;width:auto">${params.fx} N</span>
    </div>
    <div class="control-group">
      <label class="control-label">Fuerza Y (N)</label>
      <input type="range" class="custom-slider" id="param_fy" min="-10" max="10" step="0.5" value="${params.fy}">
      <span class="slider-value" style="display:inline-block;width:auto">${params.fy} N</span>
    </div>
  `);

  setTimeout(() => {
    ['mass', 'fx', 'fy'].forEach(id => {
      const el = document.getElementById(`param_${id}`);
      if (!el) return;
      const display = el.nextElementSibling;
      el.addEventListener('input', () => {
        params[id] = parseFloat(el.value);
        if (display) display.textContent = params[id] + (id === 'mass' ? ' kg' : ' N');
        reset(_engine, _renderer, _ui);
      });
    });
  }, 50);
}
