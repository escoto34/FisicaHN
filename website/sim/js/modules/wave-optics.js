/**
 * Óptica ondulatoria: interferencia de doble rendija y difracción de una rendija.
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
  mode: 'double', // double | single
  lambda: 0.55, // visual scale (µm-like)
  d: 2.0, // slit separation (sim units)
  a: 0.6, // single slit width
  L: 6 // screen distance
};

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  t = 0;
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Interferencia y difracción',
    blurb:
      meta?.blurb ||
      'Patrón de Young (doble rendija) e intensidad de difracción de una rendija.',
    story:
      'La luz como onda interfiere. Young midió λ con franjas; la difracción limita la resolución de instrumentos.',
    cases: [
      'Experimento de Young con láser y rendijas.',
      'Anillos/ franjas en películas delgadas (idea de camino óptico).',
      'Límite de difracción de un telescopio (apertura).'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Young (máximos)', formula: 'd sinθ = m λ', note: 'm = 0, ±1, ±2…' },
      { name: 'Intensidad (2 rendijas, ideal)', formula: 'I ∝ cos²(δ/2)', note: 'δ = (2π/λ) d sinθ' },
      { name: 'Difracción 1 rendija (mínimos)', formula: 'a sinθ = m λ', note: 'm = ±1, ±2…' },
      { name: 'sinc', formula: 'I ∝ [sinβ/β]²', note: 'β = (π a sinθ)/λ' }
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

function intensity(y) {
  const theta = Math.atan2(y, params.L);
  const s = Math.sin(theta);
  const k = (2 * Math.PI) / Math.max(params.lambda, 0.05);
  if (params.mode === 'double') {
    const delta = k * params.d * s;
    const beta = (k * params.a * s) / 2;
    const env = Math.abs(beta) < 1e-6 ? 1 : (Math.sin(beta) / beta) ** 2;
    return env * Math.cos(delta / 2) ** 2;
  }
  const beta = (Math.PI * params.a * s) / Math.max(params.lambda, 0.05);
  return Math.abs(beta) < 1e-6 ? 1 : (Math.sin(beta) / beta) ** 2;
}

function updateData() {
  const fringe = (params.lambda * params.L) / Math.max(params.d, 0.05);
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>modo = ${params.mode === 'double' ? 'doble rendija' : 'una rendija'}</div>
      <div>λ = ${params.lambda} · d = ${params.d} · a = ${params.a}</div>
      <div>L pantalla = ${params.L}</div>
      <div>Δy ≈ λL/d = ${roundTo(fringe, 3)} (espacio franjas)</div>
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;

  // source
  r.drawObject(-7, 0, { shape: 'circle', size: 0.25, color: '#fff59d', label: 'fuente' });
  // slits plate
  const plate = r.worldToCanvas(-3, 0);
  ctx.save();
  ctx.strokeStyle = '#90a4ae';
  ctx.lineWidth = 6;
  ctx.beginPath();
  const pTop = r.worldToCanvas(-3, 4);
  const pBot = r.worldToCanvas(-3, -4);
  ctx.moveTo(pTop.x, pTop.y);
  ctx.lineTo(pBot.x, pBot.y);
  ctx.stroke();
  // slit marks
  if (params.mode === 'double') {
    r.drawObject(-3, params.d / 2, { shape: 'circle', size: 0.12, color: '#4fc3f7', label: '' });
    r.drawObject(-3, -params.d / 2, { shape: 'circle', size: 0.12, color: '#4fc3f7', label: '' });
  } else {
    r.drawObject(-3, 0, { shape: 'rect', size: 0.15, color: '#4fc3f7', label: 'a' });
  }
  ctx.restore();

  // screen at x = L - 3? put screen at x=4
  const screenX = 4;
  const ys = [];
  for (let i = 0; i <= 120; i++) {
    const y = -4 + (8 * i) / 120;
    ys.push({ y, I: intensity(y) });
  }
  // intensity as brightness bars on screen
  for (const s of ys) {
    const p = r.worldToCanvas(screenX, s.y);
    const g = Math.round(255 * Math.pow(s.I, 0.7));
    ctx.fillStyle = `rgb(${g},${g},${Math.min(255, g + 40)})`;
    ctx.fillRect(p.x - 4, p.y - 2, 14, 4);
  }
  // graph of I(y) to the right
  ctx.save();
  ctx.strokeStyle = 'rgba(79,195,247,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < ys.length; i++) {
    const p = r.worldToCanvas(screenX + 0.8 + ys[i].I * 2.5, ys[i].y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();

  // animated wave crests hint
  const phase = t * 3;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,245,157,0.25)';
  for (let k = 0; k < 5; k++) {
    const x = -6.5 + ((phase + k) % 3.5);
    const p0 = r.worldToCanvas(x, -1.2);
    const p1 = r.worldToCanvas(x, 1.2);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.restore();
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Modo</label>
      <select id="wo_mode" class="custom-select" style="width:100%;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px">
        <option value="double" ${params.mode === 'double' ? 'selected' : ''}>Doble rendija (Young)</option>
        <option value="single" ${params.mode === 'single' ? 'selected' : ''}>Difracción 1 rendija</option>
      </select>
    </div>
    <div class="control-group"><label class="control-label">$\lambda$</label>
      <div class="slider-row"><input type="range" id="wo_l" class="custom-slider" min="0.3" max="1.2" step="0.02" value="${params.lambda}"><span id="wo_ld">${params.lambda}</span></div></div>
    <div class="control-group"><label class="control-label">$d$ (separación)</label>
      <div class="slider-row"><input type="range" id="wo_d" class="custom-slider" min="0.5" max="4" step="0.05" value="${params.d}"><span id="wo_dd">${params.d}</span></div></div>
    <div class="control-group"><label class="control-label">$a$ (ancho)</label>
      <div class="slider-row"><input type="range" id="wo_a" class="custom-slider" min="0.2" max="2" step="0.05" value="${params.a}"><span id="wo_ad">${params.a}</span></div></div>
    <div class="control-group"><label class="control-label">$L$ (pantalla)</label>
      <div class="slider-row"><input type="range" id="wo_L" class="custom-slider" min="3" max="10" step="0.2" value="${params.L}"><span id="wo_Ld">${params.L}</span></div></div>
  `);
  setTimeout(() => {
    document.getElementById('wo_mode')?.addEventListener('change', (e) => {
      params.mode = e.target.value;
      updateData();
    });
    const bind = (id, key, d) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
        updateData();
      });
    };
    bind('wo_l', 'lambda', 'wo_ld');
    bind('wo_d', 'd', 'wo_dd');
    bind('wo_a', 'a', 'wo_ad');
    bind('wo_L', 'L', 'wo_Ld');
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
