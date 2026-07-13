/**
 * Circuitos: DC serie/paralelo (Ohm) y RLC forzado en AC (resonancia).
 * Distinto del mapa de Coulomb (campo eléctrico de cargas).
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;
let q = 0;
let i = 0;

const params = {
  mode: 'series', // series | parallel | rlc
  V: 12,
  R1: 100,
  R2: 200,
  R: 40,
  L: 0.5,
  C: 200e-6,
  f: 50,
  Vac: 10
};

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  resetState();
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Circuitos DC / AC',
    blurb:
      meta?.blurb ||
      'Resistencias en serie/paralelo e impedancia RLC con corriente i(t).',
    story:
      'Ohm y Kirchhoff rigen circuitos de corriente. En AC, L y C aportan reactancia y hay resonancia cuando XL = XC.',
    cases: [
      'Divisor de tensión con dos resistencias.',
      'Bombillas en paralelo en casa (misma V).',
      'Sintonizar un radio (resonancia LC).'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Ohm', formula: 'V = I R' },
      { name: 'Serie', formula: 'R<sub>eq</sub> = R₁ + R₂' },
      { name: 'Paralelo', formula: '1/R<sub>eq</sub> = 1/R₁ + 1/R₂' },
      { name: 'Impedancia RLC serie', formula: 'Z = √[R² + (X<sub>L</sub> − X<sub>C</sub>)²]' },
      { name: 'Resonancia', formula: 'f₀ = 1 / (2π √(LC))' }
    ]
  });
  clearChallenges(ui);
  renderParams();
}

function resetState() {
  t = 0;
  q = 0;
  i = 0;
}

export function destroy() {
  _engine = _renderer = _ui = null;
}
export function reset(engine) {
  resetState();
  engine?.reset?.();
}
export function setTool() {}

function dcResults() {
  if (params.mode === 'series') {
    const Req = params.R1 + params.R2;
    const I = params.V / Req;
    return {
      Req,
      I,
      V1: I * params.R1,
      V2: I * params.R2,
      P: params.V * I
    };
  }
  const Req = 1 / (1 / params.R1 + 1 / params.R2);
  const I1 = params.V / params.R1;
  const I2 = params.V / params.R2;
  return {
    Req,
    I: I1 + I2,
    I1,
    I2,
    V1: params.V,
    V2: params.V,
    P: params.V * (I1 + I2)
  };
}

function rlcZ() {
  const w = 2 * Math.PI * params.f;
  const XL = w * params.L;
  const XC = 1 / (w * Math.max(params.C, 1e-12));
  const Z = Math.hypot(params.R, XL - XC);
  const I0 = params.Vac / Math.max(Z, 1e-9);
  const phi = Math.atan2(XL - XC, params.R);
  const f0 = 1 / (2 * Math.PI * Math.sqrt(params.L * params.C));
  return { w, XL, XC, Z, I0, phi, f0 };
}

export function update(dt) {
  t += dt;
  if (params.mode === 'rlc') {
    const { w, I0, phi } = rlcZ();
    i = I0 * Math.sin(w * t - phi);
    q += i * dt;
  }
  updateData();
}

function updateData() {
  if (params.mode === 'rlc') {
    const z = rlcZ();
    _ui?.setData(`
      <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
        <div>RLC serie · f = ${params.f} Hz · f₀ ≈ ${roundTo(z.f0, 2)} Hz</div>
        <div>X<sub>L</sub> = ${roundTo(z.XL, 2)} Ω · X<sub>C</sub> = ${roundTo(z.XC, 2)} Ω</div>
        <div>Z = ${roundTo(z.Z, 2)} Ω · I₀ = ${roundTo(z.I0, 4)} A</div>
        <div>φ = ${roundTo((z.phi * 180) / Math.PI, 1)}° · i(t) = ${roundTo(i, 4)} A</div>
      </div>
    `);
  } else {
    const r = dcResults();
    _ui?.setData(`
      <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
        <div>modo = ${params.mode}</div>
        <div>R<sub>eq</sub> = ${roundTo(r.Req, 2)} Ω · I = ${roundTo(r.I, 4)} A</div>
        <div>V₁ = ${roundTo(r.V1, 3)} V · V₂ = ${roundTo(r.V2, 3)} V</div>
        ${params.mode === 'parallel' ? `<div>I₁ = ${roundTo(r.I1, 4)} A · I₂ = ${roundTo(r.I2, 4)} A</div>` : ''}
        <div>P = ${roundTo(r.P, 3)} W</div>
      </div>
    `);
  }
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;

  // simple schematic
  const drawWire = (x0, y0, x1, y1) => {
    const p0 = r.worldToCanvas(x0, y0);
    const p1 = r.worldToCanvas(x1, y1);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  };

  if (params.mode === 'rlc') {
    drawWire(-4, 2, 4, 2);
    drawWire(4, 2, 4, -2);
    drawWire(4, -2, -4, -2);
    drawWire(-4, -2, -4, 2);
    r.drawObject(-2, 2, { shape: 'rect', size: 0.5, color: '#ef5350', label: 'R' });
    r.drawObject(0, 2, { shape: 'rect', size: 0.5, color: '#4fc3f7', label: 'L' });
    r.drawObject(2, 2, { shape: 'rect', size: 0.5, color: '#ffb74d', label: 'C' });
    r.drawObject(-4, 0, { shape: 'circle', size: 0.45, color: '#66bb6a', label: '~V' });
    // i(t) wave
    const z = rlcZ();
    ctx.save();
    ctx.strokeStyle = '#ce93d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 80; k++) {
      const u = k / 80;
      const tt = t - 0.4 + u * 0.8;
      const ii = z.I0 * Math.sin(z.w * tt - z.phi);
      const p = r.worldToCanvas(-3 + u * 6, -3.5 + ii * 2.5);
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    drawWire(-3, 2, 3, 2);
    drawWire(3, 2, 3, -2);
    drawWire(3, -2, -3, -2);
    drawWire(-3, -2, -3, 2);
    r.drawObject(-3, 0, { shape: 'rect', size: 0.55, color: '#66bb6a', label: `${params.V}V` });
    if (params.mode === 'series') {
      r.drawObject(0, 2, { shape: 'rect', size: 0.5, color: '#ef5350', label: `R1` });
      r.drawObject(0, -2, { shape: 'rect', size: 0.5, color: '#ffb74d', label: `R2` });
    } else {
      r.drawObject(-0.8, 0.5, { shape: 'rect', size: 0.45, color: '#ef5350', label: 'R1' });
      r.drawObject(0.8, 0.5, { shape: 'rect', size: 0.45, color: '#ffb74d', label: 'R2' });
      drawWire(-0.8, 2, -0.8, -2);
      drawWire(0.8, 2, 0.8, -2);
    }
    const res = dcResults();
    // current glow
    const glow = Math.min(1, res.I * 20);
    ctx.save();
    ctx.fillStyle = `rgba(255,235,59,${0.15 + 0.35 * glow})`;
    const p = r.worldToCanvas(0, 0);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 40 + glow * 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Modo</label>
      <select id="ci_mode" class="custom-select" style="width:100%;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px">
        <option value="series" ${params.mode === 'series' ? 'selected' : ''}>DC serie</option>
        <option value="parallel" ${params.mode === 'parallel' ? 'selected' : ''}>DC paralelo</option>
        <option value="rlc" ${params.mode === 'rlc' ? 'selected' : ''}>AC RLC serie</option>
      </select>
    </div>
    <div class="control-group"><label class="control-label">$V$ DC (V)</label>
      <div class="slider-row"><input type="range" id="ci_V" class="custom-slider" min="1" max="24" step="0.5" value="${params.V}"><span id="ci_Vd">${params.V}</span></div></div>
    <div class="control-group"><label class="control-label">$R_1$ ($\Omega$)</label>
      <div class="slider-row"><input type="range" id="ci_R1" class="custom-slider" min="10" max="500" step="5" value="${params.R1}"><span id="ci_R1d">${params.R1}</span></div></div>
    <div class="control-group"><label class="control-label">$R_2$ ($\Omega$)</label>
      <div class="slider-row"><input type="range" id="ci_R2" class="custom-slider" min="10" max="500" step="5" value="${params.R2}"><span id="ci_R2d">${params.R2}</span></div></div>
    <div class="control-group"><label class="control-label">$R$ RLC ($\Omega$)</label>
      <div class="slider-row"><input type="range" id="ci_R" class="custom-slider" min="5" max="200" step="1" value="${params.R}"><span id="ci_Rd">${params.R}</span></div></div>
    <div class="control-group"><label class="control-label">$L$ (H)</label>
      <div class="slider-row"><input type="range" id="ci_L" class="custom-slider" min="0.05" max="2" step="0.05" value="${params.L}"><span id="ci_Ld">${params.L}</span></div></div>
    <div class="control-group"><label class="control-label">$C$ ($\mu$F)</label>
      <div class="slider-row"><input type="range" id="ci_C" class="custom-slider" min="10" max="1000" step="10" value="${params.C * 1e6}"><span id="ci_Cd">${roundTo(params.C * 1e6, 0)}</span></div></div>
    <div class="control-group"><label class="control-label">$f$ (Hz)</label>
      <div class="slider-row"><input type="range" id="ci_f" class="custom-slider" min="10" max="200" step="1" value="${params.f}"><span id="ci_fd">${params.f}</span></div></div>
    <div class="control-group"><label class="control-label">$V_{\mathrm{ac}}$ pico (V)</label>
      <div class="slider-row"><input type="range" id="ci_Vac" class="custom-slider" min="1" max="20" step="0.5" value="${params.Vac}"><span id="ci_Vacd">${params.Vac}</span></div></div>
  `);
  setTimeout(() => {
    document.getElementById('ci_mode')?.addEventListener('change', (e) => {
      params.mode = e.target.value;
      resetState();
    });
    const bind = (id, key, d, scale = 1) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value) * scale;
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(scale !== 1 ? roundTo(params[key] / scale, 0) : params[key]);
      });
    };
    bind('ci_V', 'V', 'ci_Vd');
    bind('ci_R1', 'R1', 'ci_R1d');
    bind('ci_R2', 'R2', 'ci_R2d');
    bind('ci_R', 'R', 'ci_Rd');
    bind('ci_L', 'L', 'ci_Ld');
    document.getElementById('ci_C')?.addEventListener('input', (e) => {
      params.C = parseFloat(e.target.value) * 1e-6;
      const d = document.getElementById('ci_Cd');
      if (d) d.textContent = e.target.value;
    });
    bind('ci_f', 'f', 'ci_fd');
    bind('ci_Vac', 'Vac', 'ci_Vacd');
  }, 0);
}

export function getState() {
  return { t, q, i, params: { ...params } };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  if (s.q != null) q = s.q;
  if (s.i != null) i = s.i;
  renderParams();
}
