/**
 * @fileoverview Módulo de Electricidad — Carga eléctrica, campo y potencial.
 */

import { Vector2D } from '../utils/vector2d.js';
import {
  setModuleInfo,
  setModuleFormulas,
  paramControl,
  bindParamControls,
  clearChallenges
} from '../module-ui.js';
import { roundTo } from '../utils/math-helpers.js';

const K = 8.99e9;
const charges = [];
let isRunning = false;
let _engine = null;
let _renderer = null;
let _ui = null;

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  charges.length = 0;
  charges.push({ pos: new Vector2D(-3, 0), charge: 1e-6, color: '#ef5350' });
  charges.push({ pos: new Vector2D(3, 0), charge: -1e-6, color: '#4fc3f7' });
  isRunning = true;

  setModuleInfo(ui, {
    title: 'Electricidad',
    blurb: 'Interacción entre cargas: Coulomb, campo y potencial.',
    story: 'Coulomb midió la fuerza entre cargas; Faraday y Maxwell construyeron la visión de campo que usamos hoy en circuitos y telecomunicaciones.',
    cases: [
      'Dos cargas del mismo signo se repelen.',
      'Un pararrayos concentra el campo en la punta.',
      'Medir resistencia de un bombillo con multímetro.'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Ley de Coulomb', formula: 'F = k · |q₁·q₂| / r²', note: 'k ≈ 8.99×10⁹ N·m²/C²' },
      { name: 'Campo eléctrico', formula: 'E = k · q / r²' },
      { name: 'Potencial', formula: 'V = k · q / r' }
    ]
  });
  ui.setData('<p class="tab-text">Las cargas se muestran en el canvas.</p>');
  clearChallenges(ui);

  renderParams();
}

export function destroy() {
  isRunning = false;
  _engine = _renderer = _ui = null;
}

export function reset(engine, renderer, ui) {
  init(engine, renderer, ui);
}

export function setTool(toolId) {}

export function update(dt) {
  if (!isRunning) return;
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;
  const r = _renderer;

  // Dibujar líneas de campo (simplificado)
  ctx.save();
  for (let step = 0; step < 60; step++) {
    const angle = (step / 60) * Math.PI * 2;
    const startX = 4 * Math.cos(angle);
    const startY = 4 * Math.sin(angle);

    // Calcular campo en ese punto
    let ex = 0, ey = 0;
    for (const c of charges) {
      const dx = startX - c.pos.x;
      const dy = startY - c.pos.y;
      const r2 = dx * dx + dy * dy;
      if (r2 < 0.01) continue;
      const eMag = K * c.charge / (r2);
      ex += eMag * dx / Math.sqrt(r2);
      ey += eMag * dy / Math.sqrt(r2);
    }
    const eTotal = Math.sqrt(ex * ex + ey * ey);
    if (eTotal < 0.01) continue;
    const normX = ex / eTotal;
    const normY = ey / eTotal;

    const p1 = r.worldToCanvas(startX, startY);
    const p2 = r.worldToCanvas(startX + normX * 0.8, startY + normY * 0.8);

    ctx.strokeStyle = 'rgba(79, 195, 247, 0.12)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();

  // Dibujar cargas
  for (const c of charges) {
    const label = `${c.charge > 0 ? '+' : ''}${c.charge.toExponential(1)} C`;
    r.drawObject(c.pos.x, c.pos.y, {
      shape: 'circle',
      size: 0.5,
      color: c.color,
      label
    });
  }

  // Info
  ctx.save();
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Cargas: ' + charges.length, 10, 10);
  charges.forEach((c, i) => {
    ctx.fillText(`q${i+1} = ${c.charge.toExponential(2)} C`, 10, 30 + i * 18);
  });
  ctx.restore();
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    <p class="placeholder-text" style="margin-bottom:8px">Haz clic en el canvas para colocar una carga. Usa los botones abajo.</p>
    <div class="btn-row">
      <button class="ctrl-btn" id="addPositiveBtn" style="color:var(--danger)">+ Carga +</button>
      <button class="ctrl-btn" id="addNegativeBtn" style="color:var(--accent)">+ Carga −</button>
      <button class="ctrl-btn" id="clearChargesBtn">Limpiar</button>
    </div>
  `);

  setTimeout(() => {
    const addPos = document.getElementById('addPositiveBtn');
    const addNeg = document.getElementById('addNegativeBtn');
    const clear = document.getElementById('clearChargesBtn');

    addPos?.addEventListener('click', () => {
      addCharge(1e-6, '#ef5350');
    });
    addNeg?.addEventListener('click', () => {
      addCharge(-1e-6, '#4fc3f7');
    });
    clear?.addEventListener('click', () => {
      charges.length = 0;
    });
  }, 50);
}

function addCharge(q, color) {
  charges.push({
    pos: new Vector2D((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6),
    charge: q,
    color
  });
}
