/**
 * @fileoverview Sub-módulo: Caída Libre
 * Ecuación: y(t) = h₀ + v₀·t - ½·g·t²
 */

import { Vector2D } from '../../utils/vector2d.js';
import { roundTo } from '../../utils/math-helpers.js';

let _engine = null;
let _renderer = null;
let _ui = null;

// Parámetros
let h0 = 20;
let v0 = 0;
let g = 9.81;

// Estado
let h = 20;
let v = 0;
let t = 0;
let hasLanded = false;
let impactTime = 0;
let impactVelocity = 0;
let maxHeight = 20;
let timeOfMaxHeight = 0;
let trail = [];
const MAX_TRAIL = 15;
let impactEffect = null;

const G_PRESETS = [
  { value: 9.81, label: 'Tierra 🌍 (9.81 m/s²)' },
  { value: 1.62, label: 'Luna 🌙 (1.62 m/s²)' },
  { value: 3.72, label: 'Marte 🔴 (3.72 m/s²)' },
  { value: 24.79, label: 'Júpiter 🟤 (24.79 m/s²)' },
  { value: 8.87, label: 'Venus 🟡 (8.87 m/s²)' },
  { value: 3.70, label: 'Mercurio ⚫ (3.70 m/s²)' }
];

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  // Ajustar dimensiones del mundo
  _renderer.worldWidth = 100;
  _renderer.worldHeight = 115; // 100m + margen

  recalcLimits();
  reset();

  _ui.setInfo(`
    <strong>Caída Libre</strong><br>
    Un objeto se desplaza verticalmente bajo la influencia de la <strong>gravedad</strong>. 
    Se ignora la resistencia del aire. Todos los objetos caen con la misma aceleración, independientemente de su masa.
  `);

  _ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>Altura:</strong> y(t) = h₀ + v₀·t - ½·g·t²</li>
      <li><strong>Velocidad:</strong> v(t) = v₀ - g · t</li>
      <li><strong>Velocidad de impacto:</strong> v_imp = √(v₀² + 2g·h₀)</li>
      <li><strong>Tiempo de impacto:</strong> t_imp = (v₀ + √(v₀² + 2g·h₀)) / g</li>
    </ul>
  `);

  updateData();
  renderParams();
}

function recalcLimits() {
  const discriminant = v0 * v0 + 2 * g * h0;
  if (discriminant >= 0) {
    impactTime = (v0 + Math.sqrt(discriminant)) / g;
    impactVelocity = Math.sqrt(v0 * v0 + 2 * g * h0);
  } else {
    impactTime = 0;
    impactVelocity = 0;
  }

  if (v0 > 0) {
    timeOfMaxHeight = v0 / g;
    maxHeight = h0 + (v0 * v0) / (2 * g);
  } else {
    timeOfMaxHeight = 0;
    maxHeight = h0;
  }
}

export function reset(engine, renderer, ui) {
  h = h0;
  v = v0;
  t = 0;
  hasLanded = false;
  trail = [];
  impactEffect = null;
  recalcLimits();
  updateData();
}

export function destroy() {
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function setTool(toolId) {
  // Sin herramientas
}

export function update(dt, elapsed) {
  if (hasLanded) return;

  t = elapsed;
  h = h0 + v0 * t - 0.5 * g * t * t;
  v = v0 - g * t;

  if (h <= 0) {
    h = 0;
    v = 0;
    hasLanded = true;
    impactEffect = {
      t: 0,
      duration: 0.5
    };
  }

  // Guardar en trayectoria
  if (Math.round(t * 60) % 5 === 0) {
    trail.push(h);
    if (trail.length > MAX_TRAIL) trail.shift();
  }

  updateData();

  // Actualizar gráficas (cada ~3 frames)
  const app = window.app || {};
  if (app.chart && Math.round(t * 60) % 3 === 0) {
    app.chart.addDataPoint('Altura y(t)', t, h);
    app.chart.addDataPoint('Velocidad v(t)', t, hasLanded ? -impactVelocity : v);
  }
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;
  const groundY = 8; // Suelo en coordenadas del mundo
  const ballX = 0;   // Centrada

  // 1. Dibujar suelo
  const sueloP1 = r.worldToCanvas(-50, groundY);
  const sueloP2 = r.worldToCanvas(50, groundY);
  ctx.save();
  ctx.strokeStyle = '#3e2723';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sueloP1.x, sueloP1.y);
  ctx.lineTo(sueloP2.x, sueloP2.y);
  ctx.stroke();
  ctx.restore();

  // 2. Dibujar regla métrica vertical
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let m = 0; m <= 100; m += 10) {
    const tickPos = r.worldToCanvas(-20, groundY + m);
    ctx.beginPath();
    ctx.moveTo(tickPos.x, tickPos.y);
    ctx.lineTo(tickPos.x + 8, tickPos.y);
    ctx.stroke();
    ctx.fillText(`${m}m`, tickPos.x - 4, tickPos.y);
  }
  ctx.restore();

  // 3. Dibujar marca de altura máxima (si v₀ > 0)
  if (v0 > 0) {
    const lineY = r.worldToCanvas(ballX, groundY + maxHeight).y;
    ctx.save();
    ctx.strokeStyle = '#aa66ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(r.worldToCanvas(-15, 0).x, lineY);
    ctx.lineTo(r.worldToCanvas(15, 0).x, lineY);
    ctx.stroke();
    ctx.restore();

    r.drawLabel(ballX + 18, groundY + maxHeight + 1, `h_max = ${roundTo(maxHeight, 1)} m`, { color: '#aa66ff' });
  }

  // 4. Dibujar trail (fantasmas)
  ctx.save();
  for (let i = 0; i < trail.length; i++) {
    const opacity = (i / trail.length) * 0.3;
    const p = r.worldToCanvas(ballX, groundY + trail[i]);
    ctx.fillStyle = `rgba(79, 195, 247, ${opacity})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 5. Dibujar bola principal
  r.drawObject(ballX, groundY + h, {
    shape: 'circle',
    size: 2.5,
    color: hasLanded ? '#ef5350' : '#4fc3f7',
    label: `h = ${roundTo(h, 1)}m`
  });

  // 6. Dibujar vector velocidad
  const currentV = hasLanded ? 0 : v;
  if (Math.abs(currentV) > 0.1) {
    r.drawVector(ballX, groundY + h, 0, currentV * 0.5, {
      color: '#ffb74d',
      label: `v = ${roundTo(currentV, 1)} m/s`
    });
  }

  // 7. Dibujar efecto de impacto
  if (impactEffect) {
    impactEffect.t += _engine?.isPaused() ? 0 : 0.016; // Aumentar frame
    if (impactEffect.t < impactEffect.duration) {
      const radius = (impactEffect.t / impactEffect.duration) * 35;
      const opacity = 1 - (impactEffect.t / impactEffect.duration);
      const groundPos = r.worldToCanvas(ballX, groundY);
      ctx.save();
      ctx.fillStyle = `rgba(239, 83, 80, ${opacity})`;
      ctx.beginPath();
      ctx.arc(groundPos.x, groundPos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 8. Info de impacto en el canvas
  if (hasLanded) {
    ctx.save();
    ctx.fillStyle = '#ffb74d';
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    const msgPos = r.worldToCanvas(ballX, groundY + 40);
    ctx.fillText(`¡IMPACTO!`, msgPos.x, msgPos.y);
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(`Tiempo de vuelo: ${roundTo(impactTime, 2)} s`, msgPos.x, msgPos.y + 20);
    ctx.fillText(`Velocidad de impacto: ${roundTo(impactVelocity, 1)} m/s`, msgPos.x, msgPos.y + 36);
    ctx.restore();
  }

  // 9. Indicador de tiempo en el canvas
  ctx.save();
  ctx.font = '14px monospace';
  ctx.fillStyle = '#e0e0e0';
  ctx.fillText(`Tiempo: ${roundTo(t, 2)}s`, 20, 30);
  ctx.restore();
}

function updateData() {
  if (!_ui) return;
  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.8">
      <div>Altura Inicial (h₀): ${h0} m</div>
      <div>Velocidad Inicial (v₀): ${v0} m/s</div>
      <div>Gravedad (g): ${g} m/s²</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div>Tiempo (t): ${roundTo(t, 2)} s</div>
      <div>Altura (h): ${roundTo(h, 2)} m</div>
      <div>Velocidad (v): ${roundTo(hasLanded ? 0 : v, 2)} m/s</div>
      <div>Altura Máxima (h_max): ${roundTo(maxHeight, 2)} m</div>
      <div>Tiempo de Impacto (t_imp): ${roundTo(impactTime, 2)} s</div>
      <div>Velocidad de Impacto (v_imp): ${roundTo(impactVelocity, 2)} m/s</div>
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;

  const presetOptions = G_PRESETS.map((p, idx) => 
    `<option value="${idx}">${p.label}</option>`
  ).join('');

  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Ajuste de Gravedad</label>
      <div class="slider-row">
        <select class="select-input" id="param_g_preset" style="width:100%">
          ${presetOptions}
        </select>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Altura Inicial h₀ (m)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_h0" min="5" max="100" step="5" value="${h0}">
        <span class="slider-value" id="val_h0">${h0} m</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Velocidad Inicial v₀ (m/s)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_v0" min="-20" max="20" step="1" value="${v0}">
        <span class="slider-value" id="val_v0">${v0} m/s</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Gravedad g (m/s²)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_g" min="1" max="25" step="0.1" value="${g}">
        <span class="slider-value" id="val_g">${g} m/s²</span>
      </div>
    </div>
  `);

  const s_h0 = document.getElementById('param_h0');
  const s_v0 = document.getElementById('param_v0');
  const s_g = document.getElementById('param_g');
  const s_preset = document.getElementById('param_g_preset');

  s_h0?.addEventListener('input', (e) => {
    h0 = parseFloat(e.target.value);
    document.getElementById('val_h0').textContent = `${h0} m`;
    reset();
  });

  s_v0?.addEventListener('input', (e) => {
    v0 = parseFloat(e.target.value);
    document.getElementById('val_v0').textContent = `${v0} m/s`;
    reset();
  });

  s_g?.addEventListener('input', (e) => {
    g = parseFloat(e.target.value);
    document.getElementById('val_g').textContent = `${g} m/s²`;
    reset();
  });

  s_preset?.addEventListener('change', (e) => {
    const p = G_PRESETS[parseInt(e.target.value)];
    g = p.value;
    s_g.value = g;
    document.getElementById('val_g').textContent = `${g} m/s²`;
    reset();
  });
}
