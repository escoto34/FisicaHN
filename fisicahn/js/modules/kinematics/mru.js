/**
 * @fileoverview Sub-módulo: Movimiento Rectilíneo Uniforme (MRU)
 * Ecuación: x(t) = x₀ + v₀·t
 */

import { Vector2D } from '../../utils/vector2d.js';
import { roundTo } from '../../utils/math-helpers.js';

let _engine = null;
let _renderer = null;
let _ui = null;

// Parámetros
let x0 = 0;
let v0 = 5;

// Estado
let x = 0;
let t = 0;
let trail = [];
const MAX_TRAIL = 100;

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  // Ajustar dimensiones del mundo para que quepa el rango físico [-100, 100]
  _renderer.worldWidth = 240;
  _renderer.worldHeight = 180;

  x = x0;
  t = 0;
  trail = [];

  _ui.setInfo(`
    <strong>Movimiento Rectilíneo Uniforme (MRU)</strong><br>
    Un objeto se desplaza en línea recta con <strong>velocidad constante</strong>. 
    Esto significa que recorre distancias iguales en tiempos iguales. La aceleración es cero.
  `);

  _ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>Posición:</strong> x(t) = x₀ + v₀ · t</li>
      <li><strong>Velocidad:</strong> v(t) = v₀ (constante)</li>
      <li><strong>Aceleración:</strong> a = 0</li>
      <li><strong>Distancia:</strong> d = |v₀| · t</li>
    </ul>
  `);

  updateData();
  renderParams();
}

export function reset(engine, renderer, ui) {
  x = x0;
  t = 0;
  trail = [];
  updateData();
}

export function destroy() {
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function setTool(toolId) {
  // Sin herramientas especiales por ahora
}

export function update(dt, elapsed) {
  t = elapsed;
  x = x0 + v0 * t;

  // Guardar en trayectoria
  trail.push(x);
  if (trail.length > MAX_TRAIL) trail.shift();

  updateData();

  // Actualizar gráficas (cada ~3 frames para rendimiento)
  const app = window.app || {};
  if (app.chart && Math.round(t * 60) % 3 === 0) {
    app.chart.addDataPoint('Posición x(t)', t, x);
    app.chart.addDataPoint('Velocidad v(t)', t, v0);
  }
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;

  // 1. Dibujar suelo (Y = -20)
  const sueloP1 = r.worldToCanvas(-120, -20);
  const sueloP2 = r.worldToCanvas(120, -20);
  ctx.save();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sueloP1.x, sueloP1.y);
  ctx.lineTo(sueloP2.x, sueloP2.y);
  ctx.stroke();
  ctx.restore();

  // 2. Dibujar regla métrica sobre el suelo
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  for (let m = -100; m <= 100; m += 20) {
    const tickPos = r.worldToCanvas(m, -20);
    ctx.beginPath();
    ctx.moveTo(tickPos.x, tickPos.y);
    ctx.lineTo(tickPos.x, tickPos.y + 8);
    ctx.stroke();
    ctx.fillText(`${m}m`, tickPos.x, tickPos.y + 20);
  }
  ctx.restore();

  // 3. Dibujar trail
  ctx.save();
  ctx.fillStyle = 'rgba(79, 195, 247, 0.3)';
  for (let i = 0; i < trail.length; i++) {
    const opacity = (i / trail.length) * 0.4;
    ctx.fillStyle = `rgba(79, 195, 247, ${opacity})`;
    const p = r.worldToCanvas(trail[i], -10);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Dibujar auto/objeto (un rectángulo azul)
  r.drawObject(x, -10, {
    shape: 'rect',
    size: 6,
    color: '#4fc3f7',
    label: `x = ${roundTo(x, 2)}m`
  });

  // 5. Dibujar vector velocidad
  if (Math.abs(v0) > 0.1) {
    // Escalar la flecha de velocidad para que sea visible
    r.drawVector(x, -10, v0 * 1.5, 0, {
      color: '#ffb74d',
      label: `v = ${roundTo(v0, 1)} m/s`
    });
  }

  // 6. Indicador de tiempo en el canvas
  ctx.save();
  ctx.font = '14px monospace';
  ctx.fillStyle = '#e0e0e0';
  ctx.fillText(`Tiempo: ${roundTo(t, 2)}s`, 20, 30);
  ctx.restore();
}

function updateData() {
  if (!_ui) return;
  const dist = Math.abs(v0) * t;
  const disp = x - x0;
  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.8">
      <div>Posición Inicial (x₀): ${x0} m</div>
      <div>Velocidad (v₀): ${v0} m/s</div>
      <div>Aceleración (a): 0 m/s²</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div>Tiempo (t): ${roundTo(t, 2)} s</div>
      <div>Posición (x): ${roundTo(x, 2)} m</div>
      <div>Desplazamiento (Δx): ${roundTo(disp, 2)} m</div>
      <div>Distancia Recorrida (d): ${roundTo(dist, 2)} m</div>
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Posición Inicial x₀ (m)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_x0" min="-100" max="100" step="5" value="${x0}">
        <span class="slider-value" id="val_x0">${x0} m</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Velocidad v₀ (m/s)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_v0" min="-50" max="50" step="1" value="${v0}">
        <span class="slider-value" id="val_v0">${v0} m/s</span>
      </div>
    </div>
  `);

  // Configurar listeners de sliders
  const s_x0 = document.getElementById('param_x0');
  const s_v0 = document.getElementById('param_v0');

  s_x0?.addEventListener('input', (e) => {
    x0 = parseFloat(e.target.value);
    document.getElementById('val_x0').textContent = `${x0} m`;
    reset();
  });

  s_v0?.addEventListener('input', (e) => {
    v0 = parseFloat(e.target.value);
    document.getElementById('val_v0').textContent = `${v0} m/s`;
    // Las velocidades en MRU se pueden aplicar en vivo sin reiniciar
    x = x0 + v0 * t;
    updateData();
  });
}
