/**
 * Termodinámica: gas ideal (diagrama PV), ciclo de Carnot y conducción de calor.
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;
let phase = 0; // 0..1 along process / cycle
let Trod = []; // temperature along rod for diffusion

const params = {
  mode: 'isotherm', // isotherm | isochoric | isobaric | carnot | diffusion
  n: 1,
  T: 300,
  V: 2,
  P: null,
  Th: 400,
  Tc: 280,
  k: 0.8, // conductivity-ish for diffusion
  steps: 40
};

function gasP(V, T) {
  // P V = n R T with R=1 in sim units
  return (params.n * T) / Math.max(V, 0.05);
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  resetState();
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Termodinámica',
    blurb:
      meta?.blurb ||
      'Gas ideal en diagrama P–V, eficiencia de Carnot y difusión/conducción de calor.',
    story:
      'Las leyes de la termodinámica limitan motores térmicos. El ciclo de Carnot da la eficiencia máxima η = 1 − Tc/Th.',
    cases: [
      'Pistón con gas a temperatura fija (isoterma).',
      'Motor térmico entre dos focos (Carnot).',
      'Calor que se propaga por una barra (conducción).'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Gas ideal', formula: 'P V = n R T', note: 'Aquí R = 1 (unidades de simulación).' },
      { name: '1.ª ley', formula: 'ΔU = Q − W', note: 'Convención: W trabajo del sistema.' },
      { name: 'Carnot', formula: 'η = 1 − T<sub>c</sub>/T<sub>h</sub>' },
      { name: 'Conducción (1D)', formula: '∂T/∂t = κ ∂²T/∂x²' }
    ]
  });
  clearChallenges(ui);
  renderParams();
}

function resetState() {
  t = 0;
  phase = 0;
  params.P = gasP(params.V, params.T);
  const n = params.steps;
  Trod = new Array(n).fill(params.Tc);
  for (let i = 0; i < n * 0.15; i++) Trod[i] = params.Th;
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
  phase = (phase + dt * 0.15) % 1;

  if (params.mode === 'diffusion') {
    const n = Trod.length;
    const next = Trod.slice();
    const kappa = params.k * dt * 8;
    for (let i = 1; i < n - 1; i++) {
      next[i] = Trod[i] + kappa * (Trod[i - 1] - 2 * Trod[i] + Trod[i + 1]);
    }
    next[0] = params.Th;
    next[n - 1] = params.Tc;
    Trod = next;
  } else if (params.mode === 'carnot') {
    // four legs: 0-0.25 isothermal expand, 0.25-0.5 adiabatic expand,
    // 0.5-0.75 isothermal compress, 0.75-1 adiabatic compress (schematic)
    const s = phase;
    const Vmin = 1.2;
    const Vmax = 3.5;
    if (s < 0.25) {
      params.T = params.Th;
      params.V = Vmin + (Vmax - Vmin) * (s / 0.25);
    } else if (s < 0.5) {
      const u = (s - 0.25) / 0.25;
      params.T = params.Th + (params.Tc - params.Th) * u;
      params.V = Vmax;
    } else if (s < 0.75) {
      const u = (s - 0.5) / 0.25;
      params.T = params.Tc;
      params.V = Vmax + (Vmin - Vmax) * u;
    } else {
      const u = (s - 0.75) / 0.25;
      params.T = params.Tc + (params.Th - params.Tc) * u;
      params.V = Vmin;
    }
    params.P = gasP(params.V, params.T);
  } else if (params.mode === 'isotherm') {
    params.T = params.T; // fixed T from slider base
    params.V = 1.2 + 2.5 * (0.5 + 0.5 * Math.sin(t * 0.7));
    params.P = gasP(params.V, params.T);
  } else if (params.mode === 'isochoric') {
    params.V = 2;
    params.T = 250 + 120 * (0.5 + 0.5 * Math.sin(t * 0.6));
    params.P = gasP(params.V, params.T);
  } else if (params.mode === 'isobaric') {
    params.P = 120;
    params.T = 250 + 120 * (0.5 + 0.5 * Math.sin(t * 0.6));
    params.V = (params.n * params.T) / params.P;
  }

  updateData();
}

function updateData() {
  const eta = 1 - params.Tc / Math.max(params.Th, 1);
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>modo = ${params.mode}</div>
      ${
        params.mode !== 'diffusion'
          ? `<div>P ≈ ${roundTo(params.P, 2)} · V ≈ ${roundTo(params.V, 2)} · T ≈ ${roundTo(params.T, 1)} K</div>
             <div>n = ${params.n} · R = 1 (sim)</div>`
          : `<div>T_caliente = ${params.Th} K · T_frío = ${params.Tc} K</div>
             <div>κ (difusión) = ${params.k}</div>`
      }
      ${params.mode === 'carnot' ? `<div>η_Carnot = ${roundTo(eta * 100, 1)} %</div>` : ''}
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  if (params.mode === 'diffusion') {
    // rod as heat map
    const n = Trod.length;
    const x0 = -6;
    const x1 = 6;
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / (n - 1);
      const u = (Trod[i] - params.Tc) / Math.max(params.Th - params.Tc, 1);
      const c = Math.round(40 + 200 * Math.max(0, Math.min(1, u)));
      r.drawObject(x, 0, {
        shape: 'rect',
        size: 0.35,
        color: `rgb(${c},${80},${255 - c})`,
        label: ''
      });
    }
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '12px sans-serif';
    ctx.fillText('Conducción 1D: rojo = caliente, azul = frío', 12, 20);
    ctx.restore();
    return;
  }

  // PV diagram in world coords
  const ox = -5;
  const oy = -3.5;
  const sx = 2.2;
  const sy = 0.02;

  // axes
  const a0 = r.worldToCanvas(ox, oy);
  const aV = r.worldToCanvas(ox + 5 * sx, oy);
  const aP = r.worldToCanvas(ox, oy + 250 * sy);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a0.x, a0.y);
  ctx.lineTo(aV.x, aV.y);
  ctx.moveTo(a0.x, a0.y);
  ctx.lineTo(aP.x, aP.y);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '12px sans-serif';
  ctx.fillText('V', aV.x + 4, aV.y + 4);
  ctx.fillText('P', aP.x - 14, aP.y);
  ctx.restore();

  // isotherms guide
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  for (const T of [params.Tc, params.Th, 340]) {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const V = 1 + (i / 40) * 4;
      const P = (params.n * T) / V;
      const p = r.worldToCanvas(ox + V * sx, oy + P * sy);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // current state point
  const pt = r.worldToCanvas(ox + params.V * sx, oy + params.P * sy);
  ctx.save();
  ctx.fillStyle = '#ffb74d';
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '11px monospace';
  ctx.fillText(`(${roundTo(params.V, 2)}, ${roundTo(params.P, 1)})`, pt.x + 10, pt.y - 8);
  ctx.restore();

  // piston schematic right side
  r.drawObject(5, 0, { shape: 'rect', size: 1.2, color: 'rgba(79,195,247,0.25)', label: 'gas' });
  const pistonY = 1.2 + (params.V - 1.5) * 0.35;
  r.drawObject(5, pistonY, { shape: 'rect', size: 0.9, color: '#90a4ae', label: 'pistón' });
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Modo</label>
      <select id="th_mode" class="custom-select" style="width:100%;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px">
        <option value="isotherm" ${params.mode === 'isotherm' ? 'selected' : ''}>Isoterma (P–V)</option>
        <option value="isochoric" ${params.mode === 'isochoric' ? 'selected' : ''}>Isocora (V fijo)</option>
        <option value="isobaric" ${params.mode === 'isobaric' ? 'selected' : ''}>Isóbara (P fijo)</option>
        <option value="carnot" ${params.mode === 'carnot' ? 'selected' : ''}>Ciclo de Carnot</option>
        <option value="diffusion" ${params.mode === 'diffusion' ? 'selected' : ''}>Conducción / difusión</option>
      </select>
    </div>
    <div class="control-group"><label class="control-label">$n$ (moles sim)</label>
      <div class="slider-row"><input type="range" id="th_n" class="custom-slider" min="0.5" max="3" step="0.1" value="${params.n}"><span id="th_nd">${params.n}</span></div></div>
    <div class="control-group"><label class="control-label">$T$ base (K)</label>
      <div class="slider-row"><input type="range" id="th_T" class="custom-slider" min="200" max="500" step="5" value="${params.T}"><span id="th_Td">${params.T}</span></div></div>
    <div class="control-group"><label class="control-label">$T_h$ (K)</label>
      <div class="slider-row"><input type="range" id="th_Th" class="custom-slider" min="320" max="600" step="5" value="${params.Th}"><span id="th_Thd">${params.Th}</span></div></div>
    <div class="control-group"><label class="control-label">$T_c$ (K)</label>
      <div class="slider-row"><input type="range" id="th_Tc" class="custom-slider" min="200" max="350" step="5" value="${params.Tc}"><span id="th_Tcd">${params.Tc}</span></div></div>
    <div class="control-group"><label class="control-label">$\kappa$ difusión</label>
      <div class="slider-row"><input type="range" id="th_k" class="custom-slider" min="0.1" max="2" step="0.05" value="${params.k}"><span id="th_kd">${params.k}</span></div></div>
  `);
  setTimeout(() => {
    const re = () => {
      resetState();
      _engine?.reset?.();
    };
    document.getElementById('th_mode')?.addEventListener('change', (e) => {
      params.mode = e.target.value;
      re();
    });
    const bind = (id, key, d) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
        if (key === 'T' && params.mode === 'isotherm') params.T = params.T;
        re();
      });
    };
    bind('th_n', 'n', 'th_nd');
    bind('th_T', 'T', 'th_Td');
    bind('th_Th', 'Th', 'th_Thd');
    bind('th_Tc', 'Tc', 'th_Tcd');
    bind('th_k', 'k', 'th_kd');
  }, 0);
}

export function getState() {
  return { t, phase, params: { ...params }, Trod: Trod.slice() };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  if (s.phase != null) phase = s.phase;
  if (Array.isArray(s.Trod)) Trod = s.Trod.slice();
  renderParams();
}
