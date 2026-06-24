/**
 * @fileoverview Sub-módulo: Leyes de Kirchhoff (Malla de 2 Lazos)
 * Resolución de malla de dos lazos con Cramer, con sentido y velocidad de corriente.
 */

import { Vector2D } from '../../utils/vector2d.js';
import { roundTo } from '../../utils/math-helpers.js';

let _engine = null;
let _renderer = null;
let _ui = null;

// Parámetros
let V1 = 12; // V (Lazo izquierdo)
let V2 = 6;  // V (Lazo derecho)
let R1 = 100; // Ω (Lazo izquierdo)
let R2 = 50;  // Ω (Compartida central)
let R3 = 200; // Ω (Lazo derecho)

// Estado
let I1 = 0; // A
let I2 = 0; // A
let IR2 = 0; // A
let VR1 = 0, VR2 = 0, VR3 = 0; // Caídas de tensión (V)
let PR1 = 0, PR2 = 0, PR3 = 0; // Potencias disipadas (W)
let loopCheck1 = 0, loopCheck2 = 0;
let t = 0;

// Electrones
let electronsL1 = [];
let electronsL2 = [];
const N_ELECTRONS = 30;

// Hover
let hoveredResistorId = null;

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  _renderer.worldWidth = 20;
  _renderer.worldHeight = 15;

  reset();

  _ui.setInfo(`
    <strong>Leyes de Kirchhoff — Malla de 2 Lazos</strong><br>
    Un circuito con dos fuentes de tensión y tres resistencias. 
    Resolvemos el sistema de ecuaciones 2×2 mediante la <strong>Regla de Cramer</strong>. 
    Pasa el mouse sobre los componentes para medir con el multímetro.
  `);

  _ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>Lazo 1:</strong> V₁ - I₁·R₁ - (I₁ - I₂)·R₂ = 0</li>
      <li><strong>Lazo 2:</strong> -V₂ - I₂·R₃ - (I₂ - I₁)·R₂ = 0</li>
      <li><strong>Matriz Malla:</strong><br>
        (R₁+R₂)·I₁ - R₂·I₂ = V₁<br>
        -R₂·I₁ + (R₂+R₃)·I₂ = -V₂
      </li>
    </ul>
  `);

  updateData();
  renderParams();

  _renderer.canvas.addEventListener('mousemove', onMouseMove);
}

function onMouseMove(e) {
  if (!_renderer) return;
  const mousePos = _renderer.getMousePos(e);

  hoveredResistorId = null;
  const resistors = [
    { id: 'R1', x: -3, y: 4 },
    { id: 'R2', x: 0, y: 0 },
    { id: 'R3', x: 3, y: 4 }
  ];

  for (const r of resistors) {
    if (Math.abs(mousePos.x - r.x) < 1.5 && Math.abs(mousePos.y - r.y) < 1) {
      hoveredResistorId = r.id;
      break;
    }
  }
}

function recalc() {
  // Matriz de coeficientes del sistema
  const a11 = R1 + R2;
  const a12 = -R2;
  const a21 = -R2;
  const a22 = R2 + R3;
  const b1 = V1;
  const b2 = -V2;

  const det = a11 * a22 - a12 * a21;

  if (Math.abs(det) < 1e-6) {
    // Singular
    I1 = I2 = IR2 = 0;
    VR1 = VR2 = VR3 = 0;
    PR1 = PR2 = PR3 = 0;
    loopCheck1 = loopCheck2 = 0;
    return;
  }

  // Resolver por Cramer
  I1 = (b1 * a22 - b2 * a12) / det;
  I2 = (a11 * b2 - a21 * b1) / det;
  IR2 = I1 - I2;

  // Caídas de voltaje
  VR1 = I1 * R1;
  VR2 = IR2 * R2;
  VR3 = I2 * R3;

  // Potencias
  PR1 = I1 * I1 * R1;
  PR2 = IR2 * IR2 * R2;
  PR3 = I2 * I2 * R3;

  // Verificación de Kirchhoff (debe ser muy cercano a 0)
  loopCheck1 = V1 - VR1 - VR2;
  loopCheck2 = -V2 - VR3 + VR2; // lazo derecho va en contra de la caída en R2 si I2 va en sentido de las manecillas
}

export function reset(engine, renderer, ui) {
  t = 0;
  recalc();
  electronsL1 = [];
  electronsL2 = [];
  for (let i = 0; i < N_ELECTRONS; i++) {
    electronsL1.push({ progress: i / N_ELECTRONS });
    electronsL2.push({ progress: i / N_ELECTRONS });
  }
  updateData();
}

export function destroy() {
  const canvas = _renderer?.canvas;
  if (canvas) {
    canvas.removeEventListener('mousemove', onMouseMove);
  }
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function setTool(toolId) {
  // Sin herramientas
}

export function update(dt, elapsed) {
  t = elapsed;
  recalc();

  // Mover electrones. Lazo 1 (horario), Lazo 2 (horario)
  // I1 e I2 pueden ser negativos, invirtiendo la dirección de flujo
  const speedScale = 0.5;
  const speed1 = I1 * speedScale;
  const speed2 = I2 * speedScale;

  for (const e of electronsL1) {
    e.progress = (e.progress + speed1 * dt) % 1;
    if (e.progress < 0) e.progress += 1;
  }
  for (const e of electronsL2) {
    e.progress = (e.progress + speed2 * dt) % 1;
    if (e.progress < 0) e.progress += 1;
  }

  updateData();

  // Actualizar gráficas (cada ~3 frames)
  const app = window.app || {};
  if (app.chart && Math.round(t * 60) % 3 === 0) {
    app.chart.addDataPoint('Corriente I1 (A)', t, I1);
    app.chart.addDataPoint('Corriente I2 (A)', t, I2);
    app.chart.addDataPoint('Corriente Compartida IR2 (A)', t, IR2);
  }
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;

  // 1. Dibujar malla de fondo
  ctx.save();
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const wLazo = 5;
  const hLazo = 4;

  // Lazo izquierdo rectangular
  ctx.strokeRect(r.worldToCanvas(-wLazo, -hLazo).x, r.worldToCanvas(-wLazo, hLazo).y, r.worldWidth * wLazo / 20 * 12, r.worldHeight * (2 * hLazo) / 15 * 12);
  // Lazo derecho rectangular
  ctx.strokeRect(r.worldToCanvas(0, -hLazo).x, r.worldToCanvas(0, hLazo).y, r.worldWidth * wLazo / 20 * 12, r.worldHeight * (2 * hLazo) / 15 * 12);
  ctx.restore();

  // 2. Dibujar baterías
  // Lazo 1 izquierda (X = -5, Y = 0)
  drawBattery(ctx, -5, 0, V1, true);
  // Lazo 2 derecha (X = 5, Y = 0)
  drawBattery(ctx, 5, 0, V2, false); // invertida para que empuje contra lazo 2

  // 3. Dibujar electrones del Lazo 1 (izquierdo)
  ctx.save();
  ctx.fillStyle = '#00e5ff'; // azul cian
  const perim1 = 2 * (wLazo + 2 * hLazo);
  for (const e of electronsL1) {
    const d = e.progress * perim1;
    const ePos = getLazoXY(d, -5, 0, -4, 4);
    const cp = r.worldToCanvas(ePos.x, ePos.y);
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Dibujar electrones del Lazo 2 (derecho)
  ctx.fillStyle = '#aa66ff'; // púrpura
  const perim2 = 2 * (wLazo + 2 * hLazo);
  for (const e of electronsL2) {
    const d = e.progress * perim2;
    const ePos = getLazoXY(d, 0, 5, -4, 4);
    const cp = r.worldToCanvas(ePos.x, ePos.y);
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 5. Dibujar resistencias
  const resistors = [
    { id: 'R1', x: -2.5, y: 4, R: R1, P: PR1 },
    { id: 'R2', x: 0, y: 0, R: R2, P: PR2 },
    { id: 'R3', x: 2.5, y: 4, R: R3, P: PR3 }
  ];

  resistors.forEach(rp => {
    const heatRatio = Math.min(1, rp.P / 1.5);
    const boxColor = interpolateColor('#555566', '#ff4444', heatRatio);

    ctx.save();
    const cp = r.worldToCanvas(rp.x, rp.y);
    ctx.fillStyle = boxColor;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.fillRect(cp.x - 24, cp.y - 12, 48, 24);
    ctx.strokeRect(cp.x - 24, cp.y - 12, 48, 24);

    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rp.id, cp.x, cp.y - 1);
    ctx.font = '9px monospace';
    ctx.fillText(`${Math.round(rp.R)} Ω`, cp.x, cp.y + 20);
    ctx.restore();
  });

  // 6. Multímetro hover
  if (hoveredResistorId) {
    let dataVal = null;
    let rp = null;
    if (hoveredResistorId === 'R1') { dataVal = { V: VR1, I: I1, P: PR1 }; rp = resistors[0]; }
    else if (hoveredResistorId === 'R2') { dataVal = { V: VR2, I: IR2, P: PR2 }; rp = resistors[1]; }
    else { dataVal = { V: VR3, I: I2, P: PR3 }; rp = resistors[2]; }

    r.drawTooltip(rp.x, rp.y + 2.5, `Multímetro [${hoveredResistorId}]: ${roundTo(dataVal.V, 2)}V | ${roundTo(dataVal.I, 3)}A | ${roundTo(dataVal.P, 2)}W`);
  }
}

function drawBattery(ctx, x, y, val, positiveUp) {
  const r = _renderer;
  const p = r.worldToCanvas(x, y);

  ctx.save();
  ctx.strokeStyle = '#ffb74d';
  ctx.lineWidth = 3.5;

  const size = 18;
  if (positiveUp) {
    // Línea larga arriba
    ctx.beginPath();
    ctx.moveTo(p.x - size, p.y - 8);
    ctx.lineTo(p.x + size, p.y - 8);
    ctx.stroke();

    // Línea corta abajo
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x - size/2, p.y + 8);
    ctx.lineTo(p.x + size/2, p.y + 8);
    ctx.stroke();
  } else {
    // Lazo derecho V2 tiene positivo abajo (opuesta)
    ctx.beginPath();
    ctx.moveTo(p.x - size, p.y + 8);
    ctx.lineTo(p.x + size, p.y + 8);
    ctx.stroke();

    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x - size/2, p.y - 8);
    ctx.lineTo(p.x + size/2, p.y - 8);
    ctx.stroke();
  }

  ctx.fillStyle = '#ffb74d';
  ctx.font = '11px system-ui';
  ctx.fillText(`${val.toFixed(1)} V`, p.x - 45, p.y + 4);
  ctx.restore();
}

/**
 * Trayecto por lazo rectangular cerrado
 */
function getLazoXY(d, x0, x1, y0, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const p = 2 * (w + h);
  d = ((d % p) + p) % p;

  if (d < h) {
    return { x: x0, y: y0 + d };
  }
  d -= h;
  if (d < w) {
    return { x: x0 + d, y: y1 };
  }
  d -= w;
  if (d < h) {
    return { x: x1, y: y1 - d };
  }
  d -= h;
  return { x: x1 - d, y: y0 };
}

function interpolateColor(color1, color2, factor) {
  const c1 = parseHex(color1);
  const c2 = parseHex(color2);

  const r = Math.round(c1.r + factor * (c2.r - c1.r));
  const g = Math.round(c1.g + factor * (c2.g - c1.g));
  const b = Math.round(c1.b + factor * (c2.b - c1.b));

  return `rgb(${r}, ${g}, ${b})`;
}

function parseHex(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  return {
    r: parseInt(c.substring(0, 2), 16),
    g: parseInt(c.substring(2, 4), 16),
    b: parseInt(c.substring(4, 6), 16)
  };
}

function updateData() {
  if (!_ui) return;
  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.6">
      <div>Corriente Lazo 1 (I₁): ${roundTo(I1, 3)} A</div>
      <div>Corriente Lazo 2 (I₂): ${roundTo(I2, 3)} A</div>
      <div>Corriente Central (IR₂): ${roundTo(IR2, 3)} A</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div>Caída R₁ (VR₁): ${roundTo(VR1, 2)} V</div>
      <div>Caída R₂ (VR₂): ${roundTo(VR2, 2)} V</div>
      <div>Caída R₃ (VR₃): ${roundTo(VR3, 2)} V</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div>Potencia R₁: ${roundTo(PR1, 2)} W</div>
      <div>Potencia R₂: ${roundTo(PR2, 2)} W</div>
      <div>Potencia R₃: ${roundTo(PR3, 2)} W</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div>Verificación lazo 1 (LVK): ${roundTo(loopCheck1, 4)} V</div>
      <div>Verificación lazo 2 (LVK): ${roundTo(loopCheck2, 4)} V</div>
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Voltaje Fuente V₁ (V)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_V1" min="0" max="24" step="0.5" value="${V1}">
        <span class="slider-value" id="val_V1">${V1} V</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Voltaje Fuente V₂ (V)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_V2" min="0" max="24" step="0.5" value="${V2}">
        <span class="slider-value" id="val_V2">${V2} V</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Resistencia R₁ (Ω)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_R1" min="10" max="1000" step="10" value="${R1}">
        <span class="slider-value" id="val_R1">${R1} Ω</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Resistencia R₂ (Ω)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_R2" min="10" max="1000" step="10" value="${R2}">
        <span class="slider-value" id="val_R2">${R2} Ω</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Resistencia R₃ (Ω)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_R3" min="10" max="1000" step="10" value="${R3}">
        <span class="slider-value" id="val_R3">${R3} Ω</span>
      </div>
    </div>
  `);

  const s_V1 = document.getElementById('param_V1');
  const s_V2 = document.getElementById('param_V2');
  const s_R1 = document.getElementById('param_R1');
  const s_R2 = document.getElementById('param_R2');
  const s_R3 = document.getElementById('param_R3');

  s_V1?.addEventListener('input', (e) => {
    V1 = parseFloat(e.target.value);
    document.getElementById('val_V1').textContent = `${V1} V`;
  });

  s_V2?.addEventListener('input', (e) => {
    V2 = parseFloat(e.target.value);
    document.getElementById('val_V2').textContent = `${V2} V`;
  });

  s_R1?.addEventListener('input', (e) => {
    R1 = parseFloat(e.target.value);
    document.getElementById('val_R1').textContent = `${R1} Ω`;
  });

  s_R2?.addEventListener('input', (e) => {
    R2 = parseFloat(e.target.value);
    document.getElementById('val_R2').textContent = `${R2} Ω`;
  });

  s_R3?.addEventListener('input', (e) => {
    R3 = parseFloat(e.target.value);
    document.getElementById('val_R3').textContent = `${R3} Ω`;
  });
}
