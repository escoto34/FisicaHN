/**
 * Túnel cuántico: barrera rectangular, T ≈ e^(−2κL) (E < V0).
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;
let packets = [];

const params = {
  E: 4,
  V0: 8,
  L: 1.2,
  m: 1
};

function kappa() {
  // κ = sqrt(2m(V0-E))/ħ with ħ=1
  const d = params.V0 - params.E;
  if (d <= 0) return 0;
  return Math.sqrt(2 * params.m * d);
}

function Tapprox() {
  if (params.E >= params.V0) return 1;
  const k = kappa();
  return Math.exp(-2 * k * params.L);
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  t = 0;
  packets = [];
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Túnel cuántico',
    blurb:
      meta?.blurb ||
      'Barrera de potencial: probabilidad de transmisión aunque E < V₀.',
    story:
      'En mecánica clásica una partícula no cruza una barrera si E < V. En cuántica la función de onda penetra y hay probabilidad finita de transmisión (túnel).',
    cases: [
      'Microscopio de efecto túnel (STM).',
      'Fusión nuclear en el Sol (efecto túnel coulombiano).',
      'Diodos túnel y electrónica cuántica.'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'κ (E &lt; V₀)', formula: 'κ = √[2m(V₀−E)] / ℏ' },
      { name: 'Transmisión (aprox. gruesa)', formula: 'T ≈ e<sup>−2κL</sup>' },
      { name: 'Reflexión', formula: 'R ≈ 1 − T', note: 'Aprox. sin resonancias.' }
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
  packets = [];
  engine?.reset?.();
}
export function setTool() {}

export function update(dt) {
  t += dt;
  // emit wave packets from left
  if (Math.random() < 2.5 * dt) {
    packets.push({ x: -6, y: 0, vx: 2.2, phase: Math.random() * Math.PI * 2, gone: false });
  }
  const T = Tapprox();
  const barrierLeft = -params.L / 2;
  const barrierRight = params.L / 2;
  for (const p of packets) {
    if (p.gone) continue;
    p.x += p.vx * dt;
    // at barrier decision
    if (!p.decided && p.x >= barrierLeft) {
      p.decided = true;
      if (Math.random() < T) {
        p.x = barrierRight + 0.05;
        p.tunnel = true;
      } else {
        p.vx = -Math.abs(p.vx);
        p.tunnel = false;
      }
    }
    if (p.x > 7 || p.x < -7) p.gone = true;
  }
  packets = packets.filter((p) => !p.gone);
  updateData();
}

function updateData() {
  const k = kappa();
  const T = Tapprox();
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>E = ${params.E} · V₀ = ${params.V0} · L = ${params.L}</div>
      <div>κ ≈ ${roundTo(k, 3)}</div>
      <div>T ≈ ${roundTo(T, 5)} (${roundTo(T * 100, 3)} %)</div>
      <div>R ≈ ${roundTo(1 - T, 5)}</div>
      <div>${params.E >= params.V0 ? 'E ≥ V₀: sobrebarrera (clásico OK)' : 'E < V₀: régimen túnel'}</div>
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  // potential barrier
  const L = params.L;
  const h = Math.min(4, params.V0 * 0.35);
  const corners = [
    [-L / 2, 0],
    [-L / 2, h],
    [L / 2, h],
    [L / 2, 0]
  ];
  ctx.save();
  ctx.fillStyle = 'rgba(239,83,80,0.25)';
  ctx.strokeStyle = '#ef5350';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < corners.length; i++) {
    const p = r.worldToCanvas(corners[i][0], corners[i][1]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // E line
  const Ey = Math.min(h * 0.95, params.E * 0.35);
  const e0 = r.worldToCanvas(-6, Ey);
  const e1 = r.worldToCanvas(6, Ey);
  ctx.save();
  ctx.strokeStyle = '#ffb74d';
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(e0.x, e0.y);
  ctx.lineTo(e1.x, e1.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffb74d';
  ctx.font = '12px sans-serif';
  ctx.fillText('E', e0.x, e0.y - 6);
  ctx.restore();

  // exponential decay sketch inside barrier
  if (params.E < params.V0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(79,195,247,0.6)';
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const u = i / 30;
      const x = -L / 2 + u * L;
      const amp = Math.exp(-kappa() * u * L) * 1.2;
      const p = r.worldToCanvas(x, Ey + amp * Math.sin(t * 6 + u * 8));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  for (const p of packets) {
    r.drawObject(p.x, p.y + 0.2 * Math.sin(t * 8 + p.phase), {
      shape: 'circle',
      size: 0.2,
      color: p.tunnel ? '#66bb6a' : '#4fc3f7',
      label: ''
    });
  }
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group"><label class="control-label">$E$ (energía)</label>
      <div class="slider-row"><input type="range" id="tu_E" class="custom-slider" min="0.5" max="12" step="0.1" value="${params.E}"><span id="tu_Ed">${params.E}</span></div></div>
    <div class="control-group"><label class="control-label">$V_0$ (altura)</label>
      <div class="slider-row"><input type="range" id="tu_V" class="custom-slider" min="1" max="15" step="0.1" value="${params.V0}"><span id="tu_Vd">${params.V0}</span></div></div>
    <div class="control-group"><label class="control-label">$L$ (ancho)</label>
      <div class="slider-row"><input type="range" id="tu_L" class="custom-slider" min="0.3" max="3" step="0.05" value="${params.L}"><span id="tu_Ld">${params.L}</span></div></div>
    <div class="control-group"><label class="control-label">$m$</label>
      <div class="slider-row"><input type="range" id="tu_m" class="custom-slider" min="0.5" max="3" step="0.1" value="${params.m}"><span id="tu_md">${params.m}</span></div></div>
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
    bind('tu_E', 'E', 'tu_Ed');
    bind('tu_V', 'V0', 'tu_Vd');
    bind('tu_L', 'L', 'tu_Ld');
    bind('tu_m', 'm', 'tu_md');
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
