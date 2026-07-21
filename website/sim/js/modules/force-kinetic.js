/**
 * Fuerza cinética — cómo una fuerza neta genera aceleración y energía cinética.
 * Ec = ½ m v² · W_neto = ΔEc · F = m a
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  paramControl,
  bindParamControls,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;
let x = -6;
let v = 0;
let Wnet = 0;
let trail = [];
const MAX_TRAIL = 80;

const params = {
  m: 2,
  F: 8,
  v0: 0,
  g: 9.81 // solo referencia; movimiento horizontal
};

function Ec() {
  return 0.5 * params.m * v * v;
}

function a() {
  return params.F / params.m;
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  resetState();
  renderer?.resetCamera?.();

  setModuleInfo(ui, {
    title: meta?.title || 'Fuerza cinética',
    blurb:
      meta?.blurb ||
      'Una fuerza neta acelera la masa: a = F/m y la energía cinética crece Ec = ½mv².',
    story:
      '“Cinético” se refiere al movimiento. Una fuerza neta distinta de cero produce aceleración ' +
      'y por tanto cambia la velocidad y la energía cinética. El teorema trabajo–energía dice que ' +
      'el trabajo de la fuerza neta es igual al cambio de Ec. Aquí no hay fricción: toda F va a aumentar Ec.',
    cases: [
      'Acelerar un carrito con un empuje constante en el laboratorio.',
      'Un cohete en el vacío (empuje ≈ fuerza neta).',
      'Comparar dos masas con la misma F: la más liviana gana más Ec en el mismo tiempo.'
    ]
  });

  setModuleFormulas(ui, {
    items: [
      { name: 'Segunda ley', formula: 'F = m a \\Rightarrow a = F/m' },
      { name: 'Energía cinética', formula: 'E_c = \\tfrac{1}{2} m v^2' },
      { name: 'Trabajo–energía', formula: 'W_{\\mathrm{neto}} = \\Delta E_c' },
      { name: 'Velocidad (a const.)', formula: 'v = v_0 + a t' }
    ]
  });
  clearChallenges(ui);
  renderParams();
  updateData();
}

function resetState() {
  t = 0;
  x = -6;
  v = params.v0;
  Wnet = 0;
  trail = [];
}

export function destroy() {
  _engine = _renderer = _ui = null;
}

export function reset(engine) {
  resetState();
  engine?.reset?.();
  updateData();
}

export function setTool() {}

export function update(dt) {
  t += dt;
  const acc = a();
  const vPrev = v;
  v += acc * dt;
  const dx = ((v + vPrev) / 2) * dt;
  x += dx;
  Wnet += params.F * dx;

  trail.push({ x, y: 0 });
  if (trail.length > MAX_TRAIL) trail.shift();

  if (x > 8) {
    x = -6;
    v = params.v0;
    Wnet = 0;
    trail = [];
  }
  updateData();
}

function updateData() {
  if (!_ui) return;
  const ec = Ec();
  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.75">
      <div>t = ${roundTo(t, 2)} s</div>
      <div>F = ${params.F} N · m = ${params.m} kg</div>
      <div>a = F/m = ${roundTo(a(), 3)} m/s²</div>
      <div>v = ${roundTo(v, 3)} m/s · x = ${roundTo(x, 2)} m</div>
      <div>E<sub>c</sub> = ½mv² = ${roundTo(ec, 2)} J</div>
      <div>W<sub>neto</sub> = ${roundTo(Wnet, 2)} J ≈ ΔE<sub>c</sub></div>
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;

  // suelo
  const g0 = r.worldToCanvas(-9, -0.5);
  const g1 = r.worldToCanvas(9, -0.5);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.stroke();
  ctx.restore();

  // estela
  if (trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 183, 77, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    trail.forEach((p, i) => {
      const c = r.worldToCanvas(p.x, 0);
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // masa
  const size = 0.35 + params.m * 0.06;
  r.drawObject(x, 0, {
    shape: 'circle',
    size: Math.min(size, 0.85),
    color: '#ffb74d',
    label: `m=${params.m} kg`
  });

  // vectores
  if (Math.abs(params.F) > 0.05) {
    r.drawVector(x, 0.15, params.F * 0.12, 0, {
      color: '#ef5350',
      width: 2.5,
      label: `F=${params.F} N`,
      labelSide: 1
    });
  }
  if (Math.abs(v) > 0.05) {
    r.drawVector(x, -0.2, v * 0.22, 0, {
      color: '#66bb6a',
      width: 2.5,
      label: `v=${roundTo(v, 2)}`,
      labelSide: -1
    });
  }
  r.drawVector(x, 0.45, a() * 0.35, 0, {
    color: '#4fc3f7',
    width: 2,
    label: `a=${roundTo(a(), 2)}`,
    labelSide: 1
  });

  // barras Ec / W
  const ec = Ec();
  const maxE = Math.max(ec, Math.abs(Wnet), 15);
  const barH = (val, color, i, label) => {
    const h = (Math.abs(val) / maxE) * 110;
    const bx = ctx.canvas.width - 48 - i * 40;
    ctx.fillStyle = color;
    ctx.fillRect(bx, 130 - h, 26, h);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '11px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, bx + 13, 144);
    ctx.fillText(`${roundTo(val, 0)}`, bx + 13, 130 - h - 12);
  };
  ctx.save();
  barH(ec, 'rgba(255,183,77,0.85)', 0, 'Ec');
  barH(Wnet, 'rgba(102,187,106,0.75)', 1, 'W');
  ctx.restore();

  // HUD
  ctx.save();
  ctx.font = '12px system-ui,sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'left';
  [
    'Sin fricción: toda F aumenta Ec',
    `a = ${roundTo(a(), 2)} m/s² · Ec = ${roundTo(ec, 1)} J`
  ].forEach((line, i) => ctx.fillText(line, 12, 12 + i * 17));
  ctx.restore();
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    ${paramControl({ id: 'm', labelTex: 'm', labelRest: 'masa', min: 0.5, max: 15, step: 0.5, value: params.m, unit: 'kg' })}
    ${paramControl({ id: 'F', labelTex: 'F', labelRest: 'fuerza neta', min: -20, max: 40, step: 0.5, value: params.F, unit: 'N' })}
    ${paramControl({ id: 'v0', labelTex: 'v_0', labelRest: 'inicial', min: -5, max: 10, step: 0.5, value: params.v0, unit: 'm/s' })}
  `);
  setTimeout(() => {
    bindParamControls(['m', 'F', 'v0'], (id, val) => {
      params[id] = val;
      resetState();
      _engine?.reset?.();
      updateData();
    });
  }, 0);
}

export function getState() {
  return { t, x, v, Wnet, params: { ...params } };
}

export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.x != null) x = s.x;
  if (s.v != null) v = s.v;
  if (s.Wnet != null) Wnet = s.Wnet;
  if (s.t != null) t = s.t;
  trail = [];
  renderParams();
  updateData();
}
