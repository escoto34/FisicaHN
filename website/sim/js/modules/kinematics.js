/**
 * @fileoverview Módulo de Cinemática — MRU y MRUV + modo espacio infinito.
 */

import { Vector2D } from '../utils/vector2d.js';
import { roundTo } from '../utils/math-helpers.js';

let pos = new Vector2D(0, 0);
let vel = new Vector2D(2, 0);
let accel = new Vector2D(0, 0);

let trail = [];
const MAX_TRAIL = 200;

let isRunning = false;
let unbounded = false;
let _engine = null;
let _renderer = null;
let _ui = null;

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
  unbounded = false;
  isRunning = true;
  renderer.resetCamera();

  ui.setInfo(`
    <strong>Cinemática</strong> — MRU y MRUV.<br>
    Usa <strong>Espacio infinito</strong> para que el móvil no rebote: la cámara lo sigue y los ejes se pegan al borde cuando el origen queda atrás.
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
      <strong>Desafío 1:</strong> Con espacio infinito, alcanza x = 50 sin rebotar.<br>
      <strong>Desafío 2:</strong> Con a_x = 0.5, ¿cuánto tarda en v = 4 m/s?
    </p>
  `);

  renderParams();
}

export function destroy() {
  isRunning = false;
  if (_renderer) _renderer.resetCamera();
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function reset(engine, renderer, ui) {
  pos = new Vector2D(-8, 0);
  vel = new Vector2D(params.vx, params.vy);
  accel = new Vector2D(params.ax, params.ay);
  trail = [];
  if (renderer) {
    if (unbounded) renderer.follow(pos.x, pos.y);
    else renderer.resetCamera();
  }
  engine.reset();
}

export function setTool(toolId) {
  if (toolId === 'unbounded') setUnbounded(!unbounded);
}

export function setUnbounded(on) {
  unbounded = !!on;
  if (_renderer) {
    if (unbounded) _renderer.follow(pos.x, pos.y);
    else _renderer.resetCamera();
  }
  const btn = document.getElementById('param_unbounded');
  if (btn) {
    btn.setAttribute('aria-pressed', unbounded ? 'true' : 'false');
    btn.classList.toggle('active', unbounded);
    btn.textContent = unbounded ? 'Espacio infinito: ON' : 'Espacio infinito: OFF';
  }
}

export function getUnbounded() {
  return unbounded;
}

export function getState() {
  return { pos, vel, accel, unbounded };
}

export function update(dt) {
  if (!isRunning) return;

  vel = vel.add(accel.scale(dt));
  pos = pos.add(vel.scale(dt));

  trail.push(pos.clone());
  if (trail.length > MAX_TRAIL) trail.shift();

  if (!unbounded) {
    if (pos.x > 9.5) {
      pos.x = 9.5;
      vel.x *= -1;
    }
    if (pos.x < -9.5) {
      pos.x = -9.5;
      vel.x *= -1;
    }
    if (pos.y > 7) {
      pos.y = 7;
      vel.y *= -1;
    }
    if (pos.y < -7) {
      pos.y = -7;
      vel.y *= -1;
    }
  } else if (_renderer) {
    _renderer.follow(pos.x, pos.y);
  }

  updateData();
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;
  const r = _renderer;

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

  r.drawObject(pos.x, pos.y, {
    shape: 'circle',
    size: 0.4,
    color: '#4fc3f7',
    label: `t = ${roundTo(elapsed, 2)}s`
  });

  if (vel.magnitude() > 0.01) {
    r.drawVector(pos.x, pos.y, vel.x * 0.3, vel.y * 0.3, {
      color: '#66bb6a',
      label: `v = ${roundTo(vel.magnitude(), 2)} m/s`
    });
  }

  if (accel.magnitude() > 0.01) {
    r.drawVector(pos.x, pos.y, accel.x * 0.5, accel.y * 0.5, {
      color: '#ef5350',
      label: `a = ${roundTo(accel.magnitude(), 2)} m/s²`
    });
  }

  ctx.save();
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const info = [
    `x = ${roundTo(pos.x, 2)} m`,
    `y = ${roundTo(pos.y, 2)} m`,
    `v = ${roundTo(vel.magnitude(), 2)} m/s`,
    unbounded ? 'modo: espacio infinito' : 'modo: con paredes'
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
      <div>${unbounded ? 'Espacio infinito ON' : 'Paredes ON'}</div>
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    <div class="control-group">
      <button type="button" class="ctrl-btn unbounded-btn" id="param_unbounded" aria-pressed="false">
        Espacio infinito: OFF
      </button>
      <p class="placeholder-text" style="margin-top:6px;font-size:0.75rem">Sin rebote; la cámara sigue al objeto y los ejes se pegan al borde.</p>
    </div>
    <div class="control-group">
      <label class="control-label" for="param_vx">Velocidad X (m/s)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_vx" min="-5" max="5" step="0.1" value="${params.vx}">
        <span class="slider-value" id="disp_vx">${params.vx}</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label" for="param_vy">Velocidad Y (m/s)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_vy" min="-5" max="5" step="0.1" value="${params.vy}">
        <span class="slider-value" id="disp_vy">${params.vy}</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label" for="param_ax">Aceleración X (m/s²)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_ax" min="-2" max="2" step="0.1" value="${params.ax}">
        <span class="slider-value" id="disp_ax">${params.ax}</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label" for="param_ay">Aceleración Y (m/s²)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_ay" min="-2" max="2" step="0.1" value="${params.ay}">
        <span class="slider-value" id="disp_ay">${params.ay}</span>
      </div>
    </div>
  `);

  setTimeout(() => {
    const ub = document.getElementById('param_unbounded');
    if (ub) {
      ub.addEventListener('click', () => setUnbounded(!unbounded));
    }
    ['vx', 'vy', 'ax', 'ay'].forEach((id) => {
      const el = document.getElementById(`param_${id}`);
      const display = document.getElementById(`disp_${id}`);
      if (!el) return;
      el.addEventListener('input', () => {
        const val = parseFloat(el.value);
        params[id] = val;
        if (display) display.textContent = String(val);
        reset(_engine, _renderer, _ui);
      });
    });
  }, 0);
}
