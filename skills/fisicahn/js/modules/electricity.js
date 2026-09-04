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
/** Puntos de trabajo para worldToCanvas en el bucle de líneas de campo (§3.2).
 *  p1 y p2 conviven, por eso son dos. */
const _e1 = { x: 0, y: 0 };
const _e2 = { x: 0, y: 0 };

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  charges.length = 0;
  charges.push({ pos: new Vector2D(-3, 0), charge: 1e-6, color: '#ef5350' });
  charges.push({ pos: new Vector2D(3, 0), charge: -1e-6, color: '#4fc3f7' });
  isRunning = true;

  setModuleInfo(ui, {
    title: meta?.title || 'Campo eléctrico y cargas',
    blurb:
      meta?.blurb ||
      'Electrostática: Coulomb, campo E y potencial entre cargas puntuales.',
    story:
      'Coulomb midió la fuerza entre cargas; Faraday introdujo la idea de campo. Este módulo NO es un circuito (Ohm/Kirchhoff): es el campo de cargas en reposo. Los antiguos menús “Circuitos” y “Electrodinámica” apuntaban aquí por error de nombre.',
    cases: [
      'Dos cargas del mismo signo se repelen (Coulomb).',
      'Líneas de campo salen de + y entran en −.',
      'Potencial más alto cerca de una carga positiva.'
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
  ctx.save();
  // Líneas de campo trazadas desde el CENTRO de cada carga (streamlines):
  // arrancan en la superficie de la carga y siguen la dirección de E (o la
  // contraria) integrando paso a paso. Sale de las positivas y entra en las
  // negativas, llenando todo el plano a partir del centro de las cargas.
  const step = 0.13;
  const maxSteps = 320;
  const bounds = { minX: -10.5, maxX: 10.5, minY: -8, maxY: 8 };
  const r0 = 0.55;

  const eField = (px, py, out) => {
    let ex = 0;
    let ey = 0;
    for (const c of charges) {
      const dx = px - c.pos.x;
      const dy = py - c.pos.y;
      const r2 = dx * dx + dy * dy + 1e-6;
      const eMag = K * c.charge / r2;
      const inv = 1 / Math.sqrt(r2);
      ex += eMag * dx * inv;
      ey += eMag * dy * inv;
    }
    const m = Math.hypot(ex, ey) || 1e-9;
    out.x = ex / m;
    out.y = ey / m;
  };

  const drawLine = (seedPos, dir) => {
    const pts = [];
    let px = seedPos.x;
    let py = seedPos.y;
    const e = { x: 0, y: 0 };
    for (let i = 0; i < maxSteps; i++) {
      pts.push(px, py);
      let enteredCharge = false;
      for (const c of charges) {
        if (Math.hypot(px - c.pos.x, py - c.pos.y) < 0.45 && i > 2) {
          enteredCharge = true;
          break;
        }
      }
      if (enteredCharge) break;
      if (px < bounds.minX || px > bounds.maxX || py < bounds.minY || py > bounds.maxY) break;
      eField(px, py, e);
      px += e.x * step * dir;
      py += e.y * step * dir;
    }
    if (pts.length < 8) return;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)';
    const p0 = r.worldToCanvas(pts[0], pts[1], _e1);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 2; i < pts.length; i += 2) {
      const qi = r.worldToCanvas(pts[i], pts[i + 1], _e2);
      ctx.lineTo(qi.x, qi.y);
    }
    ctx.stroke();
  };

  for (const c of charges) {
    const dir = Math.sign(c.charge) || 1;
    const seeds = Math.max(20, Math.round(26 * Math.sqrt(Math.abs(c.charge) * 1e6)));
    for (let k = 0; k < seeds; k++) {
      const a = (k / seeds) * Math.PI * 2;
      drawLine({ x: c.pos.x + Math.cos(a) * r0, y: c.pos.y + Math.sin(a) * r0 }, dir);
    }
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
