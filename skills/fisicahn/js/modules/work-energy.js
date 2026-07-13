/**
 * Trabajo, energía y potencia con fuerza aplicada y rozamiento cinético.
 * Distinto del resorte MHS (oscilatory): aquí hay bloque en superficie + W y P.
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;
let x = -5;
let v = 0;
let Wnet = 0;
let Wfric = 0;
let Wapp = 0;

const params = {
  m: 2,
  F: 12,
  mu_k: 0.2,
  theta: 0, // degrees of F relative to horizontal
  g: 9.81
};

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  resetState();
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Trabajo, energía y potencia',
    blurb:
      meta?.blurb ||
      'Bloque con fuerza y rozamiento: W = F·d cosθ, teorema trabajo-energía y P = F·v.',
    story:
      'El trabajo de la fuerza neta cambia la energía cinética. El rozamiento disipa energía mecánica en calor.',
    cases: [
      'Empujar un cajón con fricción en el suelo.',
      'Remolcar un trineo con cuerda inclinada.',
      'Potencia del motor al arrancar un vehículo.'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Trabajo', formula: 'W = F · d · cosθ' },
      { name: 'Teorema trabajo–energía', formula: 'W<sub>neto</sub> = ΔE<sub>c</sub>' },
      { name: 'Rozamiento cinético', formula: 'f<sub>k</sub> = μ<sub>k</sub> N = μ<sub>k</sub> m g' },
      { name: 'Potencia', formula: 'P = F · v · cosθ', note: 'También P = dW/dt.' }
    ]
  });
  clearChallenges(ui);
  renderParams();
}

function resetState() {
  t = 0;
  x = -5;
  v = 0;
  Wnet = 0;
  Wfric = 0;
  Wapp = 0;
}

export function destroy() {
  _engine = _renderer = _ui = null;
}
export function reset(engine) {
  resetState();
  engine?.reset?.();
}
export function setTool() {}

export function update(dt) {
  t += dt;
  const th = (params.theta * Math.PI) / 180;
  const Fx = params.F * Math.cos(th);
  const N = Math.max(params.m * params.g - params.F * Math.sin(th), 0);
  const fk = params.mu_k * N;
  const Fnet = Fx - (v >= 0 ? fk : -fk);
  // if at rest and Fnet can't overcome static ~ kinetic for simplicity
  if (Math.abs(v) < 1e-4 && Math.abs(Fx) <= fk) {
    v = 0;
  } else {
    const a = Fnet / params.m;
    v += a * dt;
    const dx = v * dt;
    x += dx;
    Wapp += Fx * dx;
    Wfric += -fk * Math.abs(dx);
    Wnet += Fnet * dx;
  }
  if (x > 8) {
    x = -5;
    v = 0;
  }
  updateData();
}

function updateData() {
  const th = (params.theta * Math.PI) / 180;
  const Ec = 0.5 * params.m * v * v;
  const P = params.F * v * Math.cos(th);
  const fk = params.mu_k * Math.max(params.m * params.g - params.F * Math.sin(th), 0);
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>v = ${roundTo(v, 3)} m/s · x = ${roundTo(x, 2)} m</div>
      <div>E<sub>c</sub> = ${roundTo(Ec, 2)} J</div>
      <div>W<sub>aplicado</sub> = ${roundTo(Wapp, 2)} J</div>
      <div>W<sub>fricción</sub> = ${roundTo(Wfric, 2)} J</div>
      <div>W<sub>neto</sub> = ${roundTo(Wnet, 2)} J ≈ ΔE<sub>c</sub></div>
      <div>f<sub>k</sub> = ${roundTo(fk, 2)} N · P = ${roundTo(P, 2)} W</div>
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  // ground
  const a = r.worldToCanvas(-8, -0.6);
  const b = r.worldToCanvas(8, -0.6);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();

  r.drawObject(x, 0, { shape: 'rect', size: 0.5 + params.m * 0.08, color: '#4fc3f7', label: `m=${params.m}` });
  const th = (params.theta * Math.PI) / 180;
  r.drawVector(x, 0.4, Math.cos(th) * params.F * 0.12, Math.sin(th) * params.F * 0.12, {
    color: '#66bb6a',
    label: 'F'
  });
  r.drawVector(x, -0.15, -Math.sign(v || 1) * params.mu_k * params.m * 0.35, 0, {
    color: '#ef5350',
    label: 'f_k'
  });
  r.drawVector(x, 0.55, v * 0.25, 0, { color: '#ffb74d', label: 'v' });

  // energy bars
  const Ec = 0.5 * params.m * v * v;
  const maxE = Math.max(Math.abs(Wapp), Math.abs(Wfric), Ec, 20);
  const bar = (label, val, color, i) => {
    const h = (Math.abs(val) / maxE) * 100;
    const bx = ctx.canvas.width - 50 - i * 36;
    ctx.fillStyle = color;
    ctx.fillRect(bx, 120 - h, 22, h);
    ctx.fillStyle = '#ccc';
    ctx.font = '10px sans-serif';
    ctx.fillText(label, bx, 134);
  };
  bar('Ec', Ec, 'rgba(102,187,106,0.7)', 0);
  bar('Wa', Wapp, 'rgba(79,195,247,0.7)', 1);
  bar('Wf', Wfric, 'rgba(239,83,80,0.7)', 2);
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group"><label class="control-label">$m$ (kg)</label>
      <div class="slider-row"><input type="range" id="we_m" class="custom-slider" min="0.5" max="10" step="0.5" value="${params.m}"><span id="we_md">${params.m}</span></div></div>
    <div class="control-group"><label class="control-label">$F$ (N)</label>
      <div class="slider-row"><input type="range" id="we_F" class="custom-slider" min="0" max="40" step="0.5" value="${params.F}"><span id="we_Fd">${params.F}</span></div></div>
    <div class="control-group"><label class="control-label">$\mu_k$</label>
      <div class="slider-row"><input type="range" id="we_mu" class="custom-slider" min="0" max="1" step="0.02" value="${params.mu_k}"><span id="we_mud">${params.mu_k}</span></div></div>
    <div class="control-group"><label class="control-label">$\theta$ de $F$ (°)</label>
      <div class="slider-row"><input type="range" id="we_th" class="custom-slider" min="-30" max="60" step="1" value="${params.theta}"><span id="we_thd">${params.theta}</span></div></div>
  `);
  setTimeout(() => {
    const re = () => {
      resetState();
      _engine?.reset?.();
    };
    const bind = (id, key, d) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
        re();
      });
    };
    bind('we_m', 'm', 'we_md');
    bind('we_F', 'F', 'we_Fd');
    bind('we_mu', 'mu_k', 'we_mud');
    bind('we_th', 'theta', 'we_thd');
  }, 0);
}

export function getState() {
  return { t, x, v, Wnet, Wfric, Wapp, params: { ...params } };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  if (s.x != null) x = s.x;
  if (s.v != null) v = s.v;
  if (s.Wnet != null) Wnet = s.Wnet;
  if (s.Wfric != null) Wfric = s.Wfric;
  if (s.Wapp != null) Wapp = s.Wapp;
  renderParams();
}
