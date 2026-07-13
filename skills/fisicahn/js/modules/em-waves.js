/**
 * Ondas electromagnéticas: E y B transversales, c = f λ, polarización lineal.
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;

const params = {
  f: 0.4, // sim frequency
  ampE: 1.5,
  ampB: 1.2,
  c: 3 // sim wave speed
};

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  t = 0;
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Ondas electromagnéticas',
    blurb:
      meta?.blurb ||
      'Onda plana: E ⊥ B ⊥ dirección de propagación; c = f·λ.',
    story:
      'Maxwell unificó electricidad y magnetismo: la luz es una onda EM. E y B oscilan en fase en el vacío.',
    cases: [
      'Luz visible, radio y microondas: misma c, distinta f.',
      'Antena dipolo: E oscilante genera B y onda radiada.',
      'Polarización lineal: dirección de E.'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Velocidad', formula: 'c = f · λ' },
      { name: 'Campos', formula: 'E = E₀ cos(kx − ωt) · B = B₀ cos(kx − ωt)' },
      { name: 'Relación E–B', formula: 'E₀ / B₀ = c', note: 'En el vacío (unidades SI).' },
      { name: 'Vector de Poynting', formula: 'S⃗ = (1/μ₀) E⃗ × B⃗' }
    ]
  });
  clearChallenges(ui);
  renderParams();
}

export function destroy() {
  _engine = _renderer = _ui = null;
}
export function reset(engine) {
  t = 0;
  engine?.reset?.();
}
export function setTool() {}
export function update(dt) {
  t += dt;
  updateData();
}

function updateData() {
  const lambda = params.c / Math.max(params.f, 0.05);
  const omega = 2 * Math.PI * params.f;
  const k = (2 * Math.PI) / lambda;
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>f = ${params.f} · c = ${params.c} · λ = ${roundTo(lambda, 3)}</div>
      <div>ω = ${roundTo(omega, 3)} · k = ${roundTo(k, 3)}</div>
      <div>E₀ = ${params.ampE} · B₀ = ${params.ampB}</div>
      <div>Propagación +x · E en y · B en z (simulado en plano)</div>
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  const lambda = params.c / Math.max(params.f, 0.05);
  const k = (2 * Math.PI) / lambda;
  const omega = 2 * Math.PI * params.f;

  // axis
  const a = r.worldToCanvas(-7, 0);
  const b = r.worldToCanvas(7, 0);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();

  // E wave (vertical)
  ctx.save();
  ctx.strokeStyle = '#ef5350';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const x = -6 + (12 * i) / 120;
    const Ey = params.ampE * Math.cos(k * x - omega * t);
    const p = r.worldToCanvas(x, Ey);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();

  // B wave drawn as horizontal offset "into page" using secondary axis (z->y small)
  ctx.save();
  ctx.strokeStyle = '#4fc3f7';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const x = -6 + (12 * i) / 120;
    const Bz = params.ampB * Math.cos(k * x - omega * t);
    // represent B as secondary oscillation with dashed look via phase shift visual: use y small negative base
    const p = r.worldToCanvas(x, -3.2 + Bz * 0.55);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();

  // vectors at a sample x
  const x0 = 1.5;
  const Ey = params.ampE * Math.cos(k * x0 - omega * t);
  const Bz = params.ampB * Math.cos(k * x0 - omega * t);
  r.drawVector(x0, 0, 0, Ey, { color: '#ef5350', label: 'E' });
  r.drawVector(x0, 0, Bz * 0.8, 0, { color: '#4fc3f7', label: 'B' });
  r.drawVector(x0, 0, 1.2, 0, { color: '#66bb6a', label: 'c' });

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '12px sans-serif';
  ctx.fillText('Rojo: E(y) · Azul: B (representado) · Verde: propagación', 12, 20);
  ctx.restore();
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group"><label class="control-label">$f$ (sim)</label>
      <div class="slider-row"><input type="range" id="em_f" class="custom-slider" min="0.15" max="1.2" step="0.02" value="${params.f}"><span id="em_fd">${params.f}</span></div></div>
    <div class="control-group"><label class="control-label">$c$ (sim)</label>
      <div class="slider-row"><input type="range" id="em_c" class="custom-slider" min="1" max="6" step="0.1" value="${params.c}"><span id="em_cd">${params.c}</span></div></div>
    <div class="control-group"><label class="control-label">$E_0$</label>
      <div class="slider-row"><input type="range" id="em_E" class="custom-slider" min="0.3" max="3" step="0.1" value="${params.ampE}"><span id="em_Ed">${params.ampE}</span></div></div>
    <div class="control-group"><label class="control-label">$B_0$</label>
      <div class="slider-row"><input type="range" id="em_B" class="custom-slider" min="0.3" max="2.5" step="0.1" value="${params.ampB}"><span id="em_Bd">${params.ampB}</span></div></div>
  `);
  setTimeout(() => {
    const bind = (id, key, d) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
        updateData();
      });
    };
    bind('em_f', 'f', 'em_fd');
    bind('em_c', 'c', 'em_cd');
    bind('em_E', 'ampE', 'em_Ed');
    bind('em_B', 'ampB', 'em_Bd');
  }, 0);
}

export function getState() {
  return { t, params: { ...params } };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  renderParams();
}
