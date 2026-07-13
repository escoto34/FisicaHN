/**
 * Efecto fotoeléctrico: umbral de frecuencia, Kmax = hf − φ.
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;
let electrons = [];

// h in eV·s style using f in 10^14 Hz scale for teaching
const params = {
  f: 8, // ×10^14 Hz visual
  intensity: 0.6,
  phi: 2.3, // eV work function
  metal: 'Na'
};

const METALS = {
  Na: 2.3,
  K: 2.0,
  Cu: 4.7,
  Zn: 4.3
};

// h_eff so that E(eV) = h_eff * f with f in 10^14 Hz → roughly E = 0.414 * f
const H_EFF = 0.414;

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  resetState();
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Efecto fotoeléctrico',
    blurb:
      meta?.blurb ||
      'Fotones sobre un metal: emisión solo si hf > φ; K_max = hf − φ.',
    story:
      'Einstein explicó el efecto fotoeléctrico con cuantos de luz. La intensidad cambia el número de electrones, no K_max.',
    cases: [
      'Células fotoeléctricas y sensores de luz.',
      'Por qué la luz roja no arranca electrones en ciertos metales y la violeta sí.',
      'Gráfica K_max vs f: pendiente h, corte f₀ = φ/h.'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Einstein', formula: 'K<sub>max</sub> = h f − φ' },
      { name: 'Frecuencia umbral', formula: 'f₀ = φ / h' },
      { name: 'Potencial de frenado', formula: 'e V₀ = K<sub>max</sub>' }
    ]
  });
  clearChallenges(ui);
  renderParams();
}

function resetState() {
  t = 0;
  electrons = [];
}

export function destroy() {
  _engine = _renderer = _ui = null;
}
export function reset(engine) {
  resetState();
  engine?.reset?.();
}
export function setTool() {}

function photonE() {
  return H_EFF * params.f;
}

export function update(dt) {
  t += dt;
  const E = photonE();
  const K = E - params.phi;
  // emission rate ~ intensity if above threshold
  if (K > 0) {
    const rate = params.intensity * 12 * dt;
    if (Math.random() < rate) {
      const speed = Math.sqrt(2 * Math.max(K, 0)) * 0.9;
      electrons.push({
        x: -1.5,
        y: (Math.random() - 0.5) * 2,
        vx: 1.5 + speed,
        vy: (Math.random() - 0.5) * 0.8,
        life: 2.5
      });
    }
  }
  for (const e of electrons) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.life -= dt;
  }
  electrons = electrons.filter((e) => e.life > 0 && e.x < 8);
  updateData();
}

function updateData() {
  const E = photonE();
  const K = E - params.phi;
  const f0 = params.phi / H_EFF;
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>metal ≈ φ = ${params.phi} eV</div>
      <div>f = ${params.f}×10¹⁴ Hz · hf ≈ ${roundTo(E, 2)} eV</div>
      <div>f₀ ≈ ${roundTo(f0, 2)}×10¹⁴ Hz</div>
      <div>K<sub>max</sub> = ${K > 0 ? roundTo(K, 2) + ' eV' : '0 (bajo umbral)'}</div>
      <div>electrones activos: ${electrons.length}</div>
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  // metal plate
  r.drawObject(-2.5, 0, { shape: 'rect', size: 1.8, color: '#78909c', label: params.metal });
  // incoming photons
  const E = photonE();
  const K = E - params.phi;
  const col = K > 0 ? '#fff59d' : '#ef9a9a';
  for (let i = 0; i < 5; i++) {
    const x = -7 + ((t * 3 + i * 1.2) % 5);
    r.drawObject(x, 1.2 - i * 0.15, { shape: 'circle', size: 0.12, color: col, label: '' });
  }
  // electrons
  for (const e of electrons) {
    r.drawObject(e.x, e.y, { shape: 'circle', size: 0.15, color: '#4fc3f7', label: 'e⁻' });
  }
  // graph K vs f sketch
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  const o = r.worldToCanvas(1, -3);
  const fx = r.worldToCanvas(6, -3);
  const fy = r.worldToCanvas(1, 0);
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(fx.x, fx.y);
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(fy.x, fy.y);
  ctx.stroke();
  ctx.strokeStyle = '#66bb6a';
  ctx.lineWidth = 2;
  const f0 = params.phi / H_EFF;
  const p0 = r.worldToCanvas(1 + (f0 / 12) * 5, -3);
  const p1 = r.worldToCanvas(6, -3 + ((H_EFF * 12 - params.phi) / 6) * 3);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
  // current f marker
  const km = Math.max(0, K);
  const pm = r.worldToCanvas(1 + (params.f / 12) * 5, -3 + (km / 6) * 3);
  ctx.fillStyle = '#ffb74d';
  ctx.beginPath();
  ctx.arc(pm.x, pm.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px sans-serif';
  ctx.fillText('K_max vs f', o.x, o.y + 16);
  ctx.restore();
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Metal</label>
      <select id="ph_metal" class="custom-select" style="width:100%;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px">
        ${Object.keys(METALS)
          .map(
            (m) =>
              `<option value="${m}" ${params.metal === m ? 'selected' : ''}>${m} (φ=${METALS[m]} eV)</option>`
          )
          .join('')}
      </select>
    </div>
    <div class="control-group"><label class="control-label">$f$ ($\times 10^{14}$ Hz)</label>
      <div class="slider-row"><input type="range" id="ph_f" class="custom-slider" min="2" max="15" step="0.1" value="${params.f}"><span id="ph_fd">${params.f}</span></div></div>
    <div class="control-group"><label class="control-label">Intensidad</label>
      <div class="slider-row"><input type="range" id="ph_I" class="custom-slider" min="0.05" max="1" step="0.05" value="${params.intensity}"><span id="ph_Id">${params.intensity}</span></div></div>
    <div class="control-group"><label class="control-label">$\varphi$ (eV) manual</label>
      <div class="slider-row"><input type="range" id="ph_phi" class="custom-slider" min="1" max="6" step="0.1" value="${params.phi}"><span id="ph_phid">${params.phi}</span></div></div>
  `);
  setTimeout(() => {
    document.getElementById('ph_metal')?.addEventListener('change', (e) => {
      params.metal = e.target.value;
      params.phi = METALS[params.metal];
      renderParams();
    });
    const bind = (id, key, d) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
      });
    };
    bind('ph_f', 'f', 'ph_fd');
    bind('ph_I', 'intensity', 'ph_Id');
    bind('ph_phi', 'phi', 'ph_phid');
  }, 0);
}

export function getState() {
  return { t, params: { ...params }, electrons: electrons.map((e) => ({ ...e })) };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  if (Array.isArray(s.electrons)) electrons = s.electrons;
  renderParams();
}
