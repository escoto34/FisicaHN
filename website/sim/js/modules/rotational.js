/**
 * Movimiento circular y rotacional: torque, I, α, ω; precesión simple de peonza.
 * Distinto de “carga en B” (Lorentz): aquí hay cuerpo rígido / cinemática angular.
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;
let theta = 0;
let omega = 0;
let precess = 0;

const params = {
  mode: 'torque', // torque | circular | precession
  I: 2,
  tau: 1.5,
  R: 2,
  m: 1,
  v: 3,
  spin: 8,
  Ltilt: 25
};

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  resetState();
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Circular y rotacional',
    blurb:
      meta?.blurb ||
      'Torque τ = Iα, momento de inercia y precesión simple. No es órbita de carga en B.',
    story:
      'La rotación de cuerpos rígidos se describe con momento de inercia I y torque τ. La precesión de una peonza es τ = Ω × L.',
    cases: [
      'Volante de inercia y arranque de motor.',
      'Puerta que gira al empujar lejos del eje (más torque).',
      'Peonza que no cae mientras gira (precesión).'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Segunda ley rotacional', formula: 'τ = I · α', note: 'Análogo a F = m·a.' },
      { name: 'Momento de inercia (disco)', formula: 'I = ½ m R²' },
      { name: 'Aceleración centrípeta', formula: 'a<sub>c</sub> = v² / R = ω² R' },
      { name: 'Precesión (aprox.)', formula: 'Ω = τ / (Iω)', note: 'Peonza con L ≈ Iω vertical inclinado.' }
    ]
  });
  clearChallenges(ui);
  renderParams();
}

function resetState() {
  t = 0;
  theta = 0;
  omega = params.mode === 'circular' ? params.v / Math.max(params.R, 0.1) : 0;
  precess = 0;
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
  if (params.mode === 'torque') {
    const alpha = params.tau / Math.max(params.I, 1e-6);
    omega += alpha * dt;
    theta += omega * dt;
  } else if (params.mode === 'circular') {
    omega = params.v / Math.max(params.R, 0.1);
    theta += omega * dt;
  } else {
    // precession: spin fast, slow azimuthal precession
    omega = params.spin;
    theta += omega * dt;
    const L = params.I * Math.abs(params.spin);
    const tauG = params.m * 9.81 * 0.4 * Math.sin((params.Ltilt * Math.PI) / 180);
    const Omega = L > 1e-6 ? tauG / L : 0;
    precess += Omega * dt;
  }
  updateData();
}

function updateData() {
  const alpha = params.mode === 'torque' ? params.tau / Math.max(params.I, 1e-6) : 0;
  const ac = (omega * omega) * params.R;
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>modo = ${params.mode}</div>
      <div>θ = ${roundTo(theta, 2)} rad · ω = ${roundTo(omega, 3)} rad/s</div>
      <div>α = ${roundTo(alpha, 3)} rad/s² · I = ${params.I}</div>
      ${params.mode === 'circular' ? `<div>a<sub>c</sub> = ${roundTo(ac, 2)} m/s²</div>` : ''}
      ${params.mode === 'precession' ? `<div>φ precesión = ${roundTo(precess, 2)} rad</div>` : ''}
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  const cx = 0;
  const cy = 0;

  if (params.mode === 'circular') {
    // path circle
    const steps = 64;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const p = r.worldToCanvas(params.R * Math.cos(a), params.R * Math.sin(a));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
    const x = params.R * Math.cos(theta);
    const y = params.R * Math.sin(theta);
    r.drawObject(x, y, { shape: 'circle', size: 0.35, color: '#4fc3f7', label: 'm' });
    // centripetal accel toward center
    r.drawVector(x, y, -x * 0.4, -y * 0.4, { color: '#ef5350', label: 'a_c' });
    r.drawVector(x, y, -y * 0.25, x * 0.25, { color: '#66bb6a', label: 'v' });
  } else if (params.mode === 'torque') {
    // rotating disk
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = theta + (i * Math.PI * 2) / n;
      const x = 2.2 * Math.cos(a);
      const y = 2.2 * Math.sin(a);
      const p0 = r.worldToCanvas(0, 0);
      const p1 = r.worldToCanvas(x, y);
      ctx.save();
      ctx.strokeStyle = i === 0 ? '#ffb74d' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = i === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.restore();
    }
    r.drawObject(0, 0, { shape: 'circle', size: 2.2, color: 'rgba(79,195,247,0.15)', label: 'I' });
    // torque arrow tangent
    const tx = -Math.sin(theta) * 1.2;
    const ty = Math.cos(theta) * 1.2;
    r.drawVector(2.2 * Math.cos(theta), 2.2 * Math.sin(theta), tx, ty, {
      color: '#ce93d8',
      label: 'τ'
    });
  } else {
    // precessing top: axis tip traces circle
    const tilt = (params.Ltilt * Math.PI) / 180;
    const ax = Math.sin(tilt) * Math.cos(precess) * 2.5;
    const ay = Math.sin(tilt) * Math.sin(precess) * 2.5;
    const az = Math.cos(tilt) * 2.5; // visual only as length scale
    const p0 = r.worldToCanvas(0, -1.5);
    const p1 = r.worldToCanvas(ax, -1.5 + ay * 0.3 + az * 0.5);
    ctx.save();
    ctx.strokeStyle = '#ffb74d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
    r.drawObject(0, -1.5, { shape: 'circle', size: 0.25, color: '#fff', label: 'base' });
    r.drawObject(ax, -1.5 + ay * 0.3 + az * 0.5, {
      shape: 'circle',
      size: 0.35,
      color: '#ef5350',
      label: 'L'
    });
    // spin mark
    const spinA = theta;
    const sx = ax + 0.4 * Math.cos(spinA);
    const sy = -1.5 + ay * 0.3 + az * 0.5 + 0.4 * Math.sin(spinA);
    r.drawObject(sx, sy, { shape: 'circle', size: 0.12, color: '#4fc3f7', label: '' });
  }
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Modo</label>
      <select id="rot_mode" class="custom-select" style="width:100%;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px">
        <option value="torque" ${params.mode === 'torque' ? 'selected' : ''}>Torque e I (disco)</option>
        <option value="circular" ${params.mode === 'circular' ? 'selected' : ''}>Mov. circular uniforme</option>
        <option value="precession" ${params.mode === 'precession' ? 'selected' : ''}>Precesión (peonza)</option>
      </select>
    </div>
    <div class="control-group"><label class="control-label">$I$ (kg·m²)</label>
      <div class="slider-row"><input type="range" id="rot_I" class="custom-slider" min="0.5" max="8" step="0.1" value="${params.I}"><span id="rot_Id">${params.I}</span></div></div>
    <div class="control-group"><label class="control-label">$\tau$ (N·m)</label>
      <div class="slider-row"><input type="range" id="rot_tau" class="custom-slider" min="0" max="5" step="0.1" value="${params.tau}"><span id="rot_taud">${params.tau}</span></div></div>
    <div class="control-group"><label class="control-label">$R$ (m) circular</label>
      <div class="slider-row"><input type="range" id="rot_R" class="custom-slider" min="0.8" max="5" step="0.1" value="${params.R}"><span id="rot_Rd">${params.R}</span></div></div>
    <div class="control-group"><label class="control-label">$v$ (m/s) circular</label>
      <div class="slider-row"><input type="range" id="rot_v" class="custom-slider" min="0.5" max="8" step="0.1" value="${params.v}"><span id="rot_vd">${params.v}</span></div></div>
    <div class="control-group"><label class="control-label">$\omega$ spin peonza</label>
      <div class="slider-row"><input type="range" id="rot_spin" class="custom-slider" min="2" max="20" step="0.5" value="${params.spin}"><span id="rot_spind">${params.spin}</span></div></div>
    <div class="control-group"><label class="control-label">Inclinación (°)</label>
      <div class="slider-row"><input type="range" id="rot_tilt" class="custom-slider" min="5" max="60" step="1" value="${params.Ltilt}"><span id="rot_tiltd">${params.Ltilt}</span></div></div>
  `);
  setTimeout(() => {
    const re = () => {
      resetState();
      _engine?.reset?.();
    };
    document.getElementById('rot_mode')?.addEventListener('change', (e) => {
      params.mode = e.target.value;
      re();
    });
    const bind = (id, key, d) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
        re();
      });
    };
    bind('rot_I', 'I', 'rot_Id');
    bind('rot_tau', 'tau', 'rot_taud');
    bind('rot_R', 'R', 'rot_Rd');
    bind('rot_v', 'v', 'rot_vd');
    bind('rot_spin', 'spin', 'rot_spind');
    bind('rot_tilt', 'Ltilt', 'rot_tiltd');
  }, 0);
}

export function getState() {
  return { t, theta, omega, precess, params: { ...params } };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  if (s.theta != null) theta = s.theta;
  if (s.omega != null) omega = s.omega;
  if (s.precess != null) precess = s.precess;
  renderParams();
}
