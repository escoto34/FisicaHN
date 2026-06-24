/**
 * @fileoverview Sub-módulo: Tiro Parabólico
 * Composición: MRU (X) + Caída Libre (Y)
 */

import { Vector2D } from '../../utils/vector2d.js';
import { roundTo } from '../../utils/math-helpers.js';

let _engine = null;
let _renderer = null;
let _ui = null;

// Parámetros
let v0 = 30;
let angle = 45;
let h0 = 0;
let g = 9.81;

// Estado
let x = 0;
let y = 0;
let vx = 0;
let vy = 0;
let t = 0;
let hasLanded = false;
let trajectoryPoints = [];
let comparisonTrajectory = null; // { angle, points }

// Resultados teóricos
let flightTime = 0;
let range = 0;
let maxHeight = 0;
let timeOfMaxHeight = 0;

// Mouse drag state for cannon
let isDraggingCannon = false;

// Event listeners to clean up
const listeners = {};

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  // Ajustar dimensiones del mundo
  _renderer.worldWidth = 240;
  _renderer.worldHeight = 180;

  recalcTheoretical();
  reset();

  _ui.setInfo(`
    <strong>Tiro Parabólico (Movimiento de Proyectiles)</strong><br>
    La composición de un movimiento horizontal con <strong>velocidad constante (MRU)</strong> 
    y un movimiento vertical bajo la acción de la <strong>gravedad (caída libre)</strong>.
  `);

  _ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>Posición X:</strong> x(t) = v₀ · cos(θ) · t</li>
      <li><strong>Posición Y:</strong> y(t) = h₀ + v₀ · sen(θ) · t - ½·g·t²</li>
      <li><strong>Velocidad:</strong> vₓ = v₀·cos(θ)  |  vᵧ = v₀·sen(θ) - g·t</li>
      <li><strong>Alcance (h₀=0):</strong> R = v₀² · sen(2θ) / g</li>
      <li><strong>Altura Máxima:</strong> H = h₀ + v₀² · sen²(θ) / (2g)</li>
    </ul>
  `);

  updateData();
  renderParams();

  // Registrar eventos táctiles/ratón para rotar el cañón
  setupCannonInteraction();
}

function recalcTheoretical() {
  const rad = (angle * Math.PI) / 180;
  const v0x = v0 * Math.cos(rad);
  const v0y = v0 * Math.sin(rad);

  // Cuadrática para tiempo de vuelo: ½gt² - v₀y·t - h₀ = 0
  const disc = v0y * v0y + 2 * g * h0;
  if (disc >= 0) {
    flightTime = (v0y + Math.sqrt(disc)) / g;
  } else {
    flightTime = 0;
  }

  range = v0x * flightTime;
  timeOfMaxHeight = v0y / g;
  maxHeight = h0 + (v0y * v0y) / (2 * g);
}

export function reset(engine, renderer, ui) {
  x = 0;
  y = h0;
  const rad = (angle * Math.PI) / 180;
  vx = v0 * Math.cos(rad);
  vy = v0 * Math.sin(rad);
  t = 0;
  hasLanded = false;
  trajectoryPoints = [{ x, y }];
  comparisonTrajectory = null;
  recalcTheoretical();
  updateData();
}

export function destroy() {
  const canvas = _renderer?.canvas;
  if (canvas) {
    canvas.removeEventListener('mousedown', listeners.onMouseDown);
    canvas.removeEventListener('mousemove', listeners.onMouseMove);
    window.removeEventListener('mouseup', listeners.onMouseUp);
    canvas.removeEventListener('touchstart', listeners.onTouchStart);
    canvas.removeEventListener('touchmove', listeners.onTouchMove);
    window.removeEventListener('touchend', listeners.onTouchEnd);
  }
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function setTool(toolId) {
  // Sin herramientas especiales
}

export function update(dt, elapsed) {
  if (hasLanded) return;

  t = elapsed;
  const rad = (angle * Math.PI) / 180;
  const v0x = v0 * Math.cos(rad);
  const v0y = v0 * Math.sin(rad);

  x = v0x * t;
  y = h0 + v0y * t - 0.5 * g * t * t;
  vx = v0x;
  vy = v0y - g * t;

  if (y <= 0) {
    y = 0;
    vx = 0;
    vy = 0;
    hasLanded = true;
  }

  // Guardar puntos de trayectoria
  if (!hasLanded) {
    trajectoryPoints.push({ x, y });
  }

  updateData();

  // Actualizar gráficas (cada ~3 frames)
  const app = window.app || {};
  if (app.chart && Math.round(t * 60) % 3 === 0) {
    app.chart.addDataPoint('Altura y(t)', t, y);
    app.chart.addDataPoint('Alcance x(t)', t, x);
  }
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;
  const groundY = -40; // Suelo en coordenadas del mundo
  const startX = -100; // Cañón en X = -100

  // 1. Dibujar suelo
  const sueloP1 = r.worldToCanvas(-120, groundY);
  const sueloP2 = r.worldToCanvas(120, groundY);
  ctx.save();
  ctx.strokeStyle = '#2e7d32'; // Suelo verde
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sueloP1.x, sueloP1.y);
  ctx.lineTo(sueloP2.x, sueloP2.y);
  ctx.stroke();
  ctx.restore();

  // 2. Dibujar marcas de alcance en el suelo
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  for (let m = 0; m <= 200; m += 20) {
    const tickPos = r.worldToCanvas(startX + m, groundY);
    ctx.beginPath();
    ctx.moveTo(tickPos.x, tickPos.y);
    ctx.lineTo(tickPos.x, tickPos.y + 6);
    ctx.stroke();
    ctx.fillText(`${m}m`, tickPos.x, tickPos.y + 18);
  }
  ctx.restore();

  // 3. Dibujar trayectoria de comparación (si existe)
  if (comparisonTrajectory) {
    ctx.save();
    ctx.strokeStyle = 'rgba(170, 102, 255, 0.5)'; // púrpura
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i < comparisonTrajectory.points.length; i++) {
      const pt = comparisonTrajectory.points[i];
      const p = r.worldToCanvas(startX + pt.x, groundY + pt.y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 4. Dibujar trayectoria principal
  ctx.save();
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < trajectoryPoints.length; i++) {
    const pt = trajectoryPoints[i];
    const p = r.worldToCanvas(startX + pt.x, groundY + pt.y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();

  // 5. Dibujar marcas teóricas de altura máxima y alcance
  ctx.save();
  ctx.fillStyle = '#aa66ff';
  const hmX = startX + (v0 * v0 * Math.sin(2 * (angle * Math.PI) / 180)) / (2 * g); // punto medio aprox
  const hmY = groundY + maxHeight;
  const hmPos = r.worldToCanvas(hmX, hmY);
  ctx.beginPath();
  ctx.arc(hmPos.x, hmPos.y, 3, 0, Math.PI * 2);
  ctx.fill();
  r.drawLabel(hmX, maxHeight - 36, `H_max = ${roundTo(maxHeight, 1)} m`, { color: '#aa66ff', fontSize: 11 });

  ctx.fillStyle = '#66bb6a';
  const rangePos = r.worldToCanvas(startX + range, groundY);
  ctx.beginPath();
  ctx.arc(rangePos.x, rangePos.y, 4, 0, Math.PI * 2);
  ctx.fill();
  r.drawLabel(startX + range, -36, `R = ${roundTo(range, 1)} m`, { color: '#66bb6a', fontSize: 11 });
  ctx.restore();

  // 6. Dibujar cañón/lanzador
  drawCannon(ctx, startX, groundY);

  // 7. Dibujar proyectil (bola de fuego)
  if (!hasLanded) {
    const projX = startX + x;
    const projY = groundY + y;
    r.drawObject(projX, projY, {
      shape: 'circle',
      size: 2.2,
      color: '#ff8c00'
    });

    // 8. Dibujar vectores de velocidad descompuestos
    const rad = (angle * Math.PI) / 180;
    const speedScale = 0.5; // escala visual
    r.drawVector(projX, projY, vx * speedScale, 0, {
      color: '#ef5350', // vx horizontal rojo
      width: 1.5
    });
    r.drawVector(projX, projY, 0, vy * speedScale, {
      color: '#3498db', // vy vertical azul
      width: 1.5
    });
    r.drawVector(projX, projY, vx * speedScale, vy * speedScale, {
      color: '#ffffff', // v resultante blanco
      width: 2,
      label: `v = ${roundTo(Math.hypot(vx, vy), 1)} m/s`
    });
  }

  // 9. Indicador de tiempo en el canvas
  ctx.save();
  ctx.font = '14px monospace';
  ctx.fillStyle = '#e0e0e0';
  ctx.fillText(`Tiempo: ${roundTo(t, 2)}s`, 20, 30);
  ctx.restore();
}

function drawCannon(ctx, startX, groundY) {
  const r = _renderer;
  const pBase = r.worldToCanvas(startX, groundY + h0);
  const rad = (angle * Math.PI) / 180;
  const len = 30; // largo visual del cañón
  const endX = pBase.x + len * Math.cos(rad);
  const endY = pBase.y - len * Math.sin(rad); // en canvas Y apunta abajo

  ctx.save();
  // Cañón tubo
  ctx.strokeStyle = '#78909c';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pBase.x, pBase.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Base circular
  ctx.fillStyle = '#455a64';
  ctx.beginPath();
  ctx.arc(pBase.x, pBase.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function setupCannonInteraction() {
  const canvas = _renderer.canvas;
  const startX = -100;
  const groundY = -40;

  listeners.onMouseDown = (e) => {
    const mousePos = _renderer.getMousePos(e);
    const rad = (angle * Math.PI) / 180;
    const pBase = { x: startX, y: groundY + h0 };
    // Distancia al cañón base
    const d = Math.hypot(mousePos.x - pBase.x, mousePos.y - pBase.y);
    if (d < 15) { // Cerca del cañón
      isDraggingCannon = true;
      _engine.pause();
    }
  };

  listeners.onMouseMove = (e) => {
    if (!isDraggingCannon) return;
    const mousePos = _renderer.getMousePos(e);
    const pBase = { x: startX, y: groundY + h0 };
    let newAngle = Math.atan2(mousePos.y - pBase.y, mousePos.x - pBase.x) * 180 / Math.PI;
    // Ajustar ángulo a rango [0, 90]
    if (newAngle < 0) newAngle = 0;
    if (newAngle > 90) newAngle = 90;
    angle = Math.round(newAngle);
    document.getElementById('param_angle').value = angle;
    document.getElementById('val_angle').textContent = `${angle}°`;
    reset();
  };

  listeners.onMouseUp = () => {
    isDraggingCannon = false;
  };

  // Touch support
  listeners.onTouchStart = (e) => {
    if (e.touches.length > 0) {
      listeners.onMouseDown(e.touches[0]);
    }
  };

  listeners.onTouchMove = (e) => {
    if (e.touches.length > 0) {
      listeners.onMouseMove(e.touches[0]);
    }
  };

  listeners.onTouchEnd = () => {
    listeners.onMouseUp();
  };

  canvas.addEventListener('mousedown', listeners.onMouseDown);
  canvas.addEventListener('mousemove', listeners.onMouseMove);
  window.addEventListener('mouseup', listeners.onMouseUp);
  canvas.addEventListener('touchstart', listeners.onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', listeners.onTouchMove, { passive: true });
  window.addEventListener('touchend', listeners.onTouchEnd);
}

function updateData() {
  if (!_ui) return;
  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.8">
      <div>Velocidad Inicial (v₀): ${v0} m/s</div>
      <div>Ángulo de Lanzamiento (θ): ${angle}°</div>
      <div>Altura de Lanzamiento (h₀): ${h0} m</div>
      <div>Gravedad (g): ${g} m/s²</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div>Tiempo (t): ${roundTo(t, 2)} s</div>
      <div>Posición X (x): ${roundTo(x, 2)} m</div>
      <div>Posición Y (y): ${roundTo(y, 2)} m</div>
      <div>Velocidad X (vx): ${roundTo(vx, 2)} m/s</div>
      <div>Velocidad Y (vy): ${roundTo(vy, 2)} m/s</div>
      <div>Altura Máxima (H_max): ${roundTo(maxHeight, 2)} m</div>
      <div>Tiempo de Vuelo (t_vuelo): ${roundTo(flightTime, 2)} s</div>
      <div>Alcance Horizontal (R): ${roundTo(range, 2)} m</div>
    </div>
  `);
}

/**
 * Función extra especial para comparar ángulos complementarios
 */
export function toggleComplementary() {
  if (comparisonTrajectory) {
    comparisonTrajectory = null;
  } else {
    const compAngle = 90 - angle;
    if (compAngle === angle) return; // 45° no tiene complementario distinto

    const rad = (compAngle * Math.PI) / 180;
    const v0x = v0 * Math.cos(rad);
    const v0y = v0 * Math.sin(rad);

    // Calcular trayectoria completa
    const points = [];
    const step = 0.05;
    let compT = 0;
    let compY = h0;
    while (compY >= 0 && compT < 100) {
      const compX = v0x * compT;
      compY = h0 + v0y * compT - 0.5 * g * compT * compT;
      if (compY >= 0) points.push({ x: compX, y: compY });
      compT += step;
    }

    comparisonTrajectory = {
      angle: compAngle,
      points
    };
  }
  _engine?.reset();
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Velocidad Inicial v₀ (m/s)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_v0" min="5" max="100" step="1" value="${v0}">
        <span class="slider-value" id="val_v0">${v0} m/s</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Ángulo de Lanzamiento θ (°)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_angle" min="0" max="90" step="1" value="${angle}">
        <span class="slider-value" id="val_angle">${angle}°</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Altura de Lanzamiento h₀ (m)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_h0" min="0" max="50" step="1" value="${h0}">
        <span class="slider-value" id="val_h0">${h0} m</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Gravedad g (m/s²)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_g" min="1" max="25" step="0.1" value="${g}">
        <span class="slider-value" id="val_g">${g} m/s²</span>
      </div>
    </div>
    <div class="control-group">
      <button class="ctrl-btn primary" id="btn_comp" style="width:100%">Comparar Complementario</button>
    </div>
  `);

  const s_v0 = document.getElementById('param_v0');
  const s_angle = document.getElementById('param_angle');
  const s_h0 = document.getElementById('param_h0');
  const s_g = document.getElementById('param_g');
  const b_comp = document.getElementById('btn_comp');

  s_v0?.addEventListener('input', (e) => {
    v0 = parseFloat(e.target.value);
    document.getElementById('val_v0').textContent = `${v0} m/s`;
    reset();
  });

  s_angle?.addEventListener('input', (e) => {
    angle = parseFloat(e.target.value);
    document.getElementById('val_angle').textContent = `${angle}°`;
    reset();
  });

  s_h0?.addEventListener('input', (e) => {
    h0 = parseFloat(e.target.value);
    document.getElementById('val_h0').textContent = `${h0} m`;
    reset();
  });

  s_g?.addEventListener('input', (e) => {
    g = parseFloat(e.target.value);
    document.getElementById('val_g').textContent = `${g} m/s²`;
    reset();
  });

  b_comp?.addEventListener('click', () => {
    toggleComplementary();
  });
}
