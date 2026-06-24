/**
 * @fileoverview Sub-módulo: Ley de Ohm y Circuito Simple
 * Tipos: Serie, Paralelo, Mixto. Animación de flujo de electrones.
 */

import { Vector2D } from '../../utils/vector2d.js';
import { roundTo } from '../../utils/math-helpers.js';

let _engine = null;
let _renderer = null;
let _ui = null;

// Parámetros
let V = 12; // Voltaje (V)
let R1 = 100; // Ω
let R2 = 200; // Ω
let R3 = 300; // Ω
let associationType = 'serie'; // serie, paralelo, mixto

// Estado
let Req = 0;
let Itotal = 0;
let Ptotal = 0;
let componentsData = []; // { id, R, V, I, P }
let t = 0;

// Electrones
let electrons = [];
const N_ELECTRONS = 60;

// Hovers for measurement
let hoveredResistorId = null;

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  // Ajustar dimensiones del mundo
  _renderer.worldWidth = 20;
  _renderer.worldHeight = 15;

  reset();

  _ui.setInfo(`
    <strong>Ley de Ohm y Asociación de Resistencias</strong><br>
    Configura el circuito en <strong>serie</strong>, <strong>paralelo</strong> o <strong>mixto</strong>. 
    Observa el flujo de los electrones (azul): su velocidad es proporcional a la corriente. 
    Las resistencias brillan en proporción a la potencia que disipan.
  `);

  _ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>Ley de Ohm:</strong> V = I · R</li>
      <li><strong>Potencia Disipada:</strong> P = I² · R = V² / R</li>
      <li><strong>Resistencias Serie:</strong> Req = R₁ + R₂ + R₃</li>
      <li><strong>Resistencias Paralelo:</strong> 1/Req = 1/R₁ + 1/R₂ + 1/R₃</li>
    </ul>
  `);

  updateData();
  renderParams();

  // Escuchar mouse para hover de multímetro
  _renderer.canvas.addEventListener('mousemove', onMouseMove);
}

function onMouseMove(e) {
  if (!_renderer) return;
  const mousePos = _renderer.getMousePos(e);

  // Verificar si el mouse está sobre alguna resistencia
  hoveredResistorId = null;
  const resistors = getResistorPositions();
  for (const r of resistors) {
    if (Math.abs(mousePos.x - r.x) < 1.5 && Math.abs(mousePos.y - r.y) < 1) {
      hoveredResistorId = r.id;
      break;
    }
  }
}

function getResistorPositions() {
  if (associationType === 'serie') {
    return [
      { id: 'R1', x: 0, y: 4 },
      { id: 'R2', x: 6, y: 0 },
      { id: 'R3', x: 0, y: -4 }
    ];
  } else if (associationType === 'paralelo') {
    return [
      { id: 'R1', x: -2, y: 0 },
      { id: 'R2', x: 2, y: 0 },
      { id: 'R3', x: 6, y: 0 }
    ];
  } else {
    // mixto
    return [
      { id: 'R1', x: 0, y: 4 },
      { id: 'R2', x: 3, y: 0 },
      { id: 'R3', x: 6, y: 0 }
    ];
  }
}

function recalc() {
  const rList = [R1, R2, R3];

  if (associationType === 'serie') {
    Req = R1 + R2 + R3;
    Itotal = Req > 0 ? V / Req : 0;
    Ptotal = V * Itotal;

    componentsData = rList.map((rVal, idx) => {
      const vVal = Itotal * rVal;
      const pVal = Itotal * Itotal * rVal;
      return { id: `R${idx + 1}`, R: rVal, V: vVal, I: Itotal, P: pVal };
    });
  } else if (associationType === 'paralelo') {
    const invReq = (R1 > 0 ? 1/R1 : 0) + (R2 > 0 ? 1/R2 : 0) + (R3 > 0 ? 1/R3 : 0);
    Req = invReq > 0 ? 1 / invReq : 0;
    Itotal = Req > 0 ? V / Req : 0;
    Ptotal = V * Itotal;

    componentsData = rList.map((rVal, idx) => {
      const iVal = rVal > 0 ? V / rVal : 0;
      const pVal = V * iVal;
      return { id: `R${idx + 1}`, R: rVal, V: V, I: iVal, P: pVal };
    });
  } else {
    // mixto: R1 + (R2 || R3)
    const invReqPar = (R2 > 0 ? 1/R2 : 0) + (R3 > 0 ? 1/R3 : 0);
    const ReqPar = invReqPar > 0 ? 1 / invReqPar : 0;
    Req = R1 + ReqPar;
    Itotal = Req > 0 ? V / Req : 0;
    Ptotal = V * Itotal;

    const vR1 = Itotal * R1;
    const vPar = V - vR1; // Divisor de tensión

    const iR2 = R2 > 0 ? vPar / R2 : 0;
    const iR3 = R3 > 0 ? vPar / R3 : 0;

    componentsData = [
      { id: 'R1', R: R1, V: vR1, I: Itotal, P: Itotal * vR1 },
      { id: 'R2', R: R2, V: vPar, I: iR2, P: iR2 * vPar },
      { id: 'R3', R: R3, V: vPar, I: iR3, P: iR3 * vPar }
    ];
  }
}

export function reset(engine, renderer, ui) {
  t = 0;
  recalc();
  electrons = [];
  for (let i = 0; i < N_ELECTRONS; i++) {
    electrons.push({
      progress: i / N_ELECTRONS,
      loopId: i % 3 // distribuir entre 3 lazos ficticios
    });
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

  // Mover electrones. La velocidad de flujo es proporcional a la corriente.
  // En serie, un solo lazo. En paralelo/mixto, 3 lazos independientes.
  const flowScale = 0.3; // ajuste de velocidad visual
  if (associationType === 'serie') {
    const speed = Itotal * flowScale;
    for (const e of electrons) {
      e.progress = (e.progress + speed * dt) % 1;
    }
  } else if (associationType === 'paralelo') {
    for (const e of electrons) {
      const iBranch = componentsData[e.loopId].I;
      const speed = iBranch * flowScale;
      e.progress = (e.progress + speed * dt) % 1;
    }
  } else {
    // mixto
    for (const e of electrons) {
      // Loop 0 es a través de R1 y R2
      // Loop 1 es a través de R1 y R3
      // Loop 2 es secundario a través de R2
      const loopIdx = e.loopId === 2 ? 0 : e.loopId; // mapear a loop 0 o 1
      const iBranch = loopIdx === 0 ? componentsData[1].I : componentsData[2].I;
      const speed = iBranch * flowScale;
      e.progress = (e.progress + speed * dt) % 1;
    }
  }

  updateData();

  // Actualizar gráficas (cada ~3 frames)
  const app = window.app || {};
  if (app.chart && Math.round(t * 60) % 3 === 0) {
    app.chart.addDataPoint('Corriente Total (A)', t, Itotal);
    app.chart.addDataPoint('Resistencia Eq (Ω)', t, Req / 100); // escalado para visibilidad
  }
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;

  // 1. Dibujar cables de fondo (líneas grises)
  ctx.save();
  ctx.strokeStyle = '#374151'; // cable apagado
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const marginX = 6;
  const marginY = 4;

  if (associationType === 'serie') {
    // Lazo rectangular simple
    ctx.strokeRect(r.worldToCanvas(-marginX, -marginY).x, r.worldToCanvas(-marginX, marginY).y, r.worldWidth * (2 * marginX) / 20 * 12, r.worldHeight * (2 * marginY) / 15 * 12);
  } else if (associationType === 'paralelo') {
    // Riel superior e inferior
    const pTopLeft = r.worldToCanvas(-marginX, marginY);
    const pTopRight = r.worldToCanvas(marginX, marginY);
    const pBottomLeft = r.worldToCanvas(-marginX, -marginY);
    const pBottomRight = r.worldToCanvas(marginX, -marginY);

    ctx.beginPath();
    ctx.moveTo(pTopLeft.x, pTopLeft.y);
    ctx.lineTo(pTopRight.x, pTopRight.y);
    ctx.moveTo(pBottomLeft.x, pBottomLeft.y);
    ctx.lineTo(pBottomRight.x, pBottomRight.y);
    ctx.stroke();

    // 4 cables verticales (1 batería, 3 resistencias)
    const xs = [-marginX, -2, 2, marginX];
    for (const xVal of xs) {
      const pt = r.worldToCanvas(xVal, marginY);
      const pb = r.worldToCanvas(xVal, -marginY);
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  } else {
    // mixto: R1 en serie en el cable superior.
    // Lazo izquierdo va a R1. Luego se divide en X=3 y X=6 para R2 y R3 en paralelo.
    const pTopLeft = r.worldToCanvas(-6, 4);
    const pTopMid = r.worldToCanvas(3, 4);
    const pTopRight = r.worldToCanvas(6, 4);
    const pBottomLeft = r.worldToCanvas(-6, -4);
    const pBottomMid = r.worldToCanvas(3, -4);
    const pBottomRight = r.worldToCanvas(6, -4);

    ctx.beginPath();
    // Cable izquierdo y superior
    ctx.moveTo(pBottomLeft.x, pBottomLeft.y);
    ctx.lineTo(pTopLeft.x, pTopLeft.y);
    ctx.lineTo(pTopRight.x, pTopRight.y);
    // Cable inferior
    ctx.moveTo(pBottomLeft.x, pBottomLeft.y);
    ctx.lineTo(pBottomRight.x, pBottomRight.y);
    // Cable vertical de R2
    ctx.moveTo(pTopMid.x, pTopMid.y);
    ctx.lineTo(pBottomMid.x, pBottomMid.y);
    // Cable vertical de R3
    ctx.moveTo(pTopRight.x, pTopRight.y);
    ctx.lineTo(pBottomRight.x, pBottomRight.y);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Dibujar batería (X = -6, Y = 0)
  drawBattery(ctx, -6, 0);

  // 3. Dibujar electrones fluyendo
  ctx.save();
  ctx.fillStyle = '#00e5ff'; // electrones cian brillante
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 4;

  const perim = 2 * (12 + 8); // perímetro del lazo serie en unidades mundo

  for (const e of electrons) {
    let ePos = { x: 0, y: 0 };
    if (associationType === 'serie') {
      const d = e.progress * perim;
      ePos = getSerieXY(d, -6, 6, -4, 4);
    } else if (associationType === 'paralelo') {
      // e.loopId nos dice por cuál rama va
      const xBranch = e.loopId === 0 ? -2 : (e.loopId === 1 ? 2 : 6);
      const branchPerim = 2 * ( (xBranch - (-6)) + 8 );
      const d = e.progress * branchPerim;
      ePos = getSerieXY(d, -6, xBranch, -4, 4);
    } else {
      // mixto
      // Loop 0 va por R1 y R2
      // Loop 1 va por R1 y R3
      const loopIdx = e.loopId === 2 ? 0 : e.loopId;
      const xBranch = loopIdx === 0 ? 3 : 6;
      const branchPerim = 2 * ( (xBranch - (-6)) + 8 );
      const d = e.progress * branchPerim;
      ePos = getSerieXY(d, -6, xBranch, -4, 4);
    }

    const cp = r.worldToCanvas(ePos.x, ePos.y);
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Dibujar resistencias (rectángulos con zig-zag o cajas brillantes)
  const resPos = getResistorPositions();
  resPos.forEach((rp, idx) => {
    const data = componentsData[idx];
    const power = data ? data.P : 0;
    // El brillo/color depende de la potencia disipada (efecto calor Joule)
    // Escalar brillo: 0 a 2 Watts
    const heatRatio = Math.min(1, power / 1.5);
    const boxColor = interpolateColor('#555566', '#ff4444', heatRatio);

    // Caja
    ctx.save();
    const cp = r.worldToCanvas(rp.x, rp.y);
    ctx.fillStyle = boxColor;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.fillRect(cp.x - 24, cp.y - 12, 48, 24);
    ctx.strokeRect(cp.x - 24, cp.y - 12, 48, 24);

    // Etiqueta
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${rp.id}`, cp.x, cp.y - 1);
    ctx.font = '9px monospace';
    ctx.fillText(`${Math.round(data.R)} Ω`, cp.x, cp.y + 20);
    ctx.restore();
  });

  // 5. Dibujar multímetro flotante si se hace hover sobre una resistencia
  if (hoveredResistorId) {
    const idx = hoveredResistorId === 'R1' ? 0 : (hoveredResistorId === 'R2' ? 1 : 2);
    const data = componentsData[idx];
    if (data) {
      const rp = resPos[idx];
      r.drawTooltip(rp.x, rp.y + 2.5, `Multímetro [${hoveredResistorId}]: ${roundTo(data.V, 2)}V | ${roundTo(data.I, 3)}A | ${roundTo(data.P, 2)}W`);
    }
  }
}

function drawBattery(ctx, x, y) {
  const r = _renderer;
  const p = r.worldToCanvas(x, y);

  ctx.save();
  // Líneas del símbolo de batería (alternando largas y cortas)
  ctx.strokeStyle = '#ffb74d'; // naranja/oro para fuente
  ctx.lineWidth = 3.5;

  const size = 18;
  // Línea larga positiva (superior)
  ctx.beginPath();
  ctx.moveTo(p.x - size, p.y - 8);
  ctx.lineTo(p.x + size, p.y - 8);
  ctx.stroke();

  // Línea corta negativa (inferior)
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(p.x - size/2, p.y + 8);
  ctx.lineTo(p.x + size/2, p.y + 8);
  ctx.stroke();

  // Signos
  ctx.fillStyle = '#ffb74d';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('+', p.x + size + 4, p.y - 6);
  ctx.fillText('-', p.x + size/2 + 6, p.y + 12);
  ctx.restore();
}

/**
 * Retorna coordenadas X,Y a lo largo de un lazo rectangular
 * @param {number} d - distancia recorrida
 */
function getSerieXY(d, x0, x1, y0, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const p = 2 * (w + h);
  d = ((d % p) + p) % p;

  // Empezamos en la esquina inferior izquierda (x0, y0), subiendo
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

/**
 * Interpola linealmente entre dos colores hex
 */
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

  let compHTML = '';
  componentsData.forEach(c => {
    compHTML += `
      <div style="margin-top:6px;border-top:1px dashed var(--border-color);padding-top:4px">
        <strong>Resistencia ${c.id}:</strong><br>
        R = ${c.R} Ω | V = ${roundTo(c.V, 2)} V | I = ${roundTo(c.I, 3)} A | P = ${roundTo(c.P, 2)} W
      </div>
    `;
  });

  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.6">
      <div>Voltaje Fuente (V): ${V} V</div>
      <div>Resistencia Eq (Req): ${roundTo(Req, 1)} Ω</div>
      <div>Corriente Total (Itotal): ${roundTo(Itotal, 3)} A</div>
      <div>Potencia Total (Ptotal): ${roundTo(Ptotal, 2)} W</div>
      ${compHTML}
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;

  const typeOptions = [
    { value: 'serie', label: 'Conexión Serie ──[R1]──[R2]──[R3]──' },
    { value: 'paralelo', label: 'Conexión Paralela ⇉ [R1] || [R2] || [R3]' },
    { value: 'mixto', label: 'Conexión Mixta ──[R1]──([R2]||[R3])──' }
  ].map(t => `<option value="${t.value}" ${t.value === associationType ? 'selected' : ''}>${t.label}</option>`).join('');

  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Asociación de Circuitos</label>
      <select class="select-input" id="param_assoc_type" style="width:100%">
        ${typeOptions}
      </select>
    </div>
    <div class="control-group">
      <label class="control-label">Voltaje Fuente V (V)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_V" min="1" max="24" step="0.5" value="${V}">
        <span class="slider-value" id="val_V">${V} V</span>
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

  const s_assoc = document.getElementById('param_assoc_type');
  const s_V = document.getElementById('param_V');
  const s_R1 = document.getElementById('param_R1');
  const s_R2 = document.getElementById('param_R2');
  const s_R3 = document.getElementById('param_R3');

  s_assoc?.addEventListener('change', (e) => {
    associationType = e.target.value;
    reset();
  });

  s_V?.addEventListener('input', (e) => {
    V = parseFloat(e.target.value);
    document.getElementById('val_V').textContent = `${V} V`;
    // La variación de V actualiza todo en vivo
  });

  const bindR = (el, valId, index) => {
    el?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById(valId).textContent = `${val} Ω`;
      if (index === 0) R1 = val;
      if (index === 1) R2 = val;
      if (index === 2) R3 = val;
    });
  };

  bindR(s_R1, 'val_R1', 0);
  bindR(s_R2, 'val_R2', 1);
  bindR(s_R3, 'val_R3', 2);
}
