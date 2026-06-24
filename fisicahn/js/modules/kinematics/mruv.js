/**
 * @fileoverview Sub-módulo: Movimiento Rectilíneo Uniformemente Variado (MRUV)
 * Ecuación: x(t) = x₀ + v₀·t + ½·a·t²
 */

import { Vector2D } from '../../utils/vector2d.js';
import { roundTo } from '../../utils/math-helpers.js';

let _engine = null;
let _renderer = null;
let _ui = null;

// Parámetros
let x0 = 0;
let v0 = 0;
let a = 2;

// Estado
let x = 0;
let v = 0;
let t = 0;
let trail = [];
const MAX_TRAIL = 100;
let directionChanged = false;

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  // Ajustar dimensiones del mundo
  _renderer.worldWidth = 240;
  _renderer.worldHeight = 180;

  x = x0;
  v = v0;
  t = 0;
  trail = [];
  directionChanged = false;

  _ui.setInfo(`
    <strong>Movimiento Rectilíneo Uniformemente Variado (MRUV)</strong><br>
    Un objeto se desplaza en línea recta con <strong>aceleración constante</strong>. 
    Esto significa que la velocidad cambia de manera uniforme con el tiempo.
  `);

  _ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>Posición:</strong> x(t) = x₀ + v₀·t + ½·a·t²</li>
      <li><strong>Velocidad:</strong> v(t) = v₀ + a · t</li>
      <li><strong>Ecuación sin tiempo:</strong> v² = v₀² + 2·a·(x - x₀)</li>
      <li><strong>Aceleración:</strong> a = constante</li>
    </ul>
  `);

  updateData();
  renderParams();
}

export function reset(engine, renderer, ui) {
  x = x0;
  v = v0;
  t = 0;
  trail = [];
  directionChanged = false;
  updateData();
}

export function destroy() {
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function setTool(toolId) {
  // Sin herramientas especiales
}

export function update(dt, elapsed) {
  t = elapsed;
  x = x0 + v0 * t + 0.5 * a * t * t;
  v = v0 + a * t;

  // Guardar en trayectoria
  trail.push({ x, v });
  if (trail.length > MAX_TRAIL) trail.shift();

  // Detectar cambio de dirección (v cruza por cero)
  const prevV = v0 + a * (t - dt);
  if (Math.sign(prevV) !== Math.sign(v) && Math.abs(v) > 0.05 && t > dt) {
    directionChanged = true;
  }

  updateData();

  // Actualizar gráficas (cada ~3 frames)
  const app = window.app || {};
  if (app.chart && Math.round(t * 60) % 3 === 0) {
    app.chart.addDataPoint('Posición x(t)', t, x);
    app.chart.addDataPoint('Velocidad v(t)', t, v);
    app.chart.addDataPoint('Aceleración a(t)', t, a);
  }
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;

  // 1. Dibujar suelo
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

  // 2. Dibujar regla métrica
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

  // 3. Dibujar trail (con color según dirección)
  ctx.save();
  for (let i = 0; i < trail.length; i++) {
    const opacity = (i / trail.length) * 0.4;
    const pt = trail[i];
    // Azul si avanza, rojo si retrocede
    ctx.fillStyle = pt.v >= 0 ? `rgba(79, 195, 247, ${opacity})` : `rgba(239, 83, 80, ${opacity})`;
    const p = r.worldToCanvas(pt.x, -10);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Dibujar objeto
  r.drawObject(x, -10, {
    shape: 'rect',
    size: 6,
    color: v >= 0 ? '#4fc3f7' : '#ef5350',
    label: `x = ${roundTo(x, 2)}m`
  });

  // 5. Dibujar vector velocidad (naranja)
  if (Math.abs(v) > 0.1) {
    r.drawVector(x, -10, v * 1.5, 0, {
      color: '#ffb74d',
      label: `v = ${roundTo(v, 1)} m/s`
    });
  }

  // 6. Dibujar vector aceleración (verde, debajo del auto)
  if (Math.abs(a) > 0.1) {
    r.drawVector(x, -15, a * 2.5, 0, {
      color: '#66bb6a',
      label: `a = ${roundTo(a, 1)} m/s²`
    });
  }

  // 7. Efecto visual si cambió de dirección
  if (directionChanged) {
    const p = r.worldToCanvas(x, -10);
    ctx.save();
    ctx.strokeStyle = '#ef5350';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 8. Indicador de tiempo en el canvas
  ctx.save();
  ctx.font = '14px monospace';
  ctx.fillStyle = '#e0e0e0';
  ctx.fillText(`Tiempo: ${roundTo(t, 2)}s`, 20, 30);
  ctx.restore();
}

function updateData() {
  if (!_ui) return;
  const disp = x - x0;
  // Distancia recorrida exacta
  let dist = Math.abs(disp);
  const t_stop = -v0 / a;
  if (a !== 0 && t_stop > 0 && t > t_stop) {
    const x_stop = x0 + v0 * t_stop + 0.5 * a * t_stop * t_stop;
    const tramo1 = Math.abs(x_stop - x0);
    const tramo2 = Math.abs(x - x_stop);
    dist = tramo1 + tramo2;
  }

  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.8">
      <div>Posición Inicial (x₀): ${x0} m</div>
      <div>Velocidad Inicial (v₀): ${v0} m/s</div>
      <div>Aceleración (a): ${a} m/s²</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div>Tiempo (t): ${roundTo(t, 2)} s</div>
      <div>Posición (x): ${roundTo(x, 2)} m</div>
      <div>Velocidad (v): ${roundTo(v, 2)} m/s</div>
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
      <label class="control-label">Velocidad Inicial v₀ (m/s)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_v0" min="-30" max="30" step="2" value="${v0}">
        <span class="slider-value" id="val_v0">${v0} m/s</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Aceleración a (m/s²)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_a" min="-10" max="10" step="0.5" value="${a}">
        <span class="slider-value" id="val_a">${a} m/s²</span>
      </div>
    </div>
  `);

  // Configurar listeners de sliders
  const s_x0 = document.getElementById('param_x0');
  const s_v0 = document.getElementById('param_v0');
  const s_a = document.getElementById('param_a');

  s_x0?.addEventListener('input', (e) => {
    x0 = parseFloat(e.target.value);
    document.getElementById('val_x0').textContent = `${x0} m`;
    reset();
  });

  s_v0?.addEventListener('input', (e) => {
    v0 = parseFloat(e.target.value);
    document.getElementById('val_v0').textContent = `${v0} m/s`;
    reset();
  });

  s_a?.addEventListener('input', (e) => {
    a = parseFloat(e.target.value);
    document.getElementById('val_a').textContent = `${a} m/s²`;
    reset();
  });
}
