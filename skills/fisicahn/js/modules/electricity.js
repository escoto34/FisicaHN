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
  const R_CHARGE = 0.5; // radio dibujado de cada carga (unidades de mundo)

  // Líneas de campo trazadas DESDE EL CENTRO de cada carga (streamlines):
  // nacen en el centro, atraviesan el disco de la carga y siguen la dirección
  // de E (positivas) o la contraria (negativas) integrando paso a paso, hasta
  // entrar en otra carga o salir del área visible. Su número es proporcional
  // a |q|, como manda el criterio de Faraday.
  const step = 0.12;
  const maxSteps = 420;
  const wb = r.camera?.bounds?.() || { minX: -12, maxX: 12, minY: -9, maxY: 9 };
  const bounds = { minX: wb.minX - 1, maxX: wb.maxX + 1, minY: wb.minY - 1, maxY: wb.maxY + 1 };

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

  /** Traza una línea desde el centro de `origin` en la dirección inicial `ang`. */
  const traceLine = (origin, ang, dir) => {
    const pts = [];
    // Primer tramo radial: del centro al borde del disco (dentro de la carga
    // el campo es formalmente singular; se sale en línea recta).
    let px = origin.pos.x;
    let py = origin.pos.y;
    const e = { x: Math.cos(ang), y: Math.sin(ang) };
    pts.push(px, py);
    px += e.x * R_CHARGE;
    py += e.y * R_CHARGE;
    for (let i = 0; i < maxSteps; i++) {
      pts.push(px, py);
      let entered = false;
      for (const c of charges) {
        if (c === origin) continue;
        if (Math.hypot(px - c.pos.x, py - c.pos.y) < R_CHARGE * 0.9) {
          // Termina en el centro de la carga de llegada.
          pts.push(c.pos.x, c.pos.y);
          entered = true;
          break;
        }
      }
      if (entered) break;
      if (px < bounds.minX || px > bounds.maxX || py < bounds.minY || py > bounds.maxY) break;
      eField(px, py, e);
      px += e.x * step * dir;
      py += e.y * step * dir;
    }
    return pts;
  };

  const lines = [];
  for (const c of charges) {
    const dir = Math.sign(c.charge) || 1;
    const seeds = Math.max(8, Math.round(16 * Math.sqrt(Math.abs(c.charge) * 1e6)));
    for (let k = 0; k < seeds; k++) {
      const a = ((k + 0.5) / seeds) * Math.PI * 2;
      const pts = traceLine(c, a, dir);
      if (pts.length >= 6) lines.push({ pts, dir });
    }
  }

  // 1) Discos de las cargas (debajo de las líneas, para que éstas se vean
  //    salir del centro).
  for (const c of charges) {
    r.drawObject(c.pos.x, c.pos.y, { shape: 'circle', size: R_CHARGE, color: c.color, glow: false });
  }

  // 2) Líneas de campo con puntas de flecha a lo largo del recorrido.
  ctx.save();
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  for (const { pts, dir } of lines) {
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.62)';
    ctx.fillStyle = 'rgba(79, 195, 247, 0.85)';
    const p0 = r.worldToCanvas(pts[0], pts[1], _e1);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 2; i < pts.length; i += 2) {
      const qi = r.worldToCanvas(pts[i], pts[i + 1], _e2);
      ctx.lineTo(qi.x, qi.y);
    }
    ctx.stroke();
    // Flechas: sentido de E (de + hacia −). Para una carga negativa la línea
    // se recorre al revés, así que la flecha apunta hacia el origen.
    const n = pts.length / 2;
    const marks = n > 60 ? [Math.floor(n * 0.3), Math.floor(n * 0.7)] : [Math.floor(n * 0.5)];
    for (const idx of marks) {
      if (idx < 2 || idx >= n - 1) continue;
      const a = r.worldToCanvas(pts[(idx - 1) * 2], pts[(idx - 1) * 2 + 1], _e1);
      const b = r.worldToCanvas(pts[idx * 2], pts[idx * 2 + 1], _e2);
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + (dir > 0 ? 0 : Math.PI);
      const size = 7;
      ctx.beginPath();
      ctx.moveTo(b.x + Math.cos(ang) * size * 0.5, b.y + Math.sin(ang) * size * 0.5);
      ctx.lineTo(b.x - size * Math.cos(ang - 0.45), b.y - size * Math.sin(ang - 0.45));
      ctx.lineTo(b.x - size * Math.cos(ang + 0.45), b.y - size * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // 3) Signo y etiqueta de cada carga encima de las líneas.
  ctx.save();
  for (const c of charges) {
    const p = r.worldToCanvas(c.pos.x, c.pos.y, _e1);
    const rp = Math.max(6, r.camera?.toPixels?.(R_CHARGE) ?? 14);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `700 ${Math.max(11, rp * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.charge > 0 ? '+' : '−', p.x, p.y + 1);
    const label = `${c.charge > 0 ? '+' : ''}${c.charge.toExponential(1)} C`;
    ctx.font = '600 12px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(12,15,20,0.65)';
    ctx.fillRect(p.x - tw / 2 - 6, p.y + rp + 6, tw + 12, 18);
    ctx.fillStyle = c.color;
    ctx.fillText(label, p.x, p.y + rp + 15);
  }
  ctx.restore();

  // Info
  ctx.save();
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Cargas: ' + charges.length + ' · líneas ∝ |q|, salen de + y entran en −', 10, 10);
  charges.forEach((c, i) => {
    ctx.fillText(`q${i + 1} = ${c.charge.toExponential(2)} C`, 10, 30 + i * 18);
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
