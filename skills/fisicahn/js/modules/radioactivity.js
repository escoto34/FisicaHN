/**
 * Decaimiento radiactivo: N(t) = N0 e^(−λt), vida media.
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;
let atoms = []; // {alive, x, y}

const params = {
  N0: 120,
  halfLife: 8, // seconds sim
  showCurve: true
};

function lambda() {
  return Math.LN2 / Math.max(params.halfLife, 0.1);
}

function spawn() {
  atoms = [];
  for (let i = 0; i < params.N0; i++) {
    atoms.push({
      alive: true,
      x: -5 + Math.random() * 10,
      y: -3.5 + Math.random() * 7
    });
  }
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  t = 0;
  spawn();
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Decaimiento radiactivo',
    blurb:
      meta?.blurb ||
      'Núcleos que decaen al azar: ley exponencial y vida media T½.',
    story:
      'El decaimiento es un proceso de Poisson: cada núcleo tiene probabilidad λ dt de desintegrarse, independiente de la edad.',
    cases: [
      'Datación con carbono-14.',
      'Isótopos médicos (vida media corta).',
      'Cadena de desintegración (idea de actividad A = λN).'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Ley de decaimiento', formula: 'N(t) = N₀ e<sup>−λt</sup>' },
      { name: 'Vida media', formula: 'T<sub>½</sub> = ln2 / λ' },
      { name: 'Actividad', formula: 'A = λ N = (−dN/dt)' }
    ]
  });
  clearChallenges(ui);
  renderParams();
}

export function destroy() {
  _engine = _renderer = _ui = null;
  atoms = [];
}
export function reset(engine) {
  t = 0;
  spawn();
  engine?.reset?.();
}
export function setTool() {}

export function update(dt) {
  t += dt;
  const lam = lambda();
  const p = 1 - Math.exp(-lam * dt);
  for (const a of atoms) {
    if (a.alive && Math.random() < p) a.alive = false;
  }
  updateData();
}

function aliveCount() {
  return atoms.reduce((s, a) => s + (a.alive ? 1 : 0), 0);
}

function updateData() {
  const N = aliveCount();
  const Nth = params.N0 * Math.exp(-lambda() * t);
  const A = lambda() * N;
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>t = ${roundTo(t, 2)} s · T½ = ${params.halfLife} s</div>
      <div>N = ${N} / ${params.N0}</div>
      <div>N<sub>teoría</sub> = ${roundTo(Nth, 1)}</div>
      <div>λ = ${roundTo(lambda(), 4)} · A ≈ ${roundTo(A, 2)}</div>
      <div>vidas medias: ${roundTo(t / params.halfLife, 2)}</div>
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  for (const a of atoms) {
    r.drawObject(a.x, a.y, {
      shape: 'circle',
      size: 0.12,
      color: a.alive ? '#66bb6a' : 'rgba(239,83,80,0.35)',
      label: ''
    });
  }

  // exponential curve overlay
  if (params.showCurve) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,183,77,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const tt = (i / 60) * Math.max(t, params.halfLife * 3);
      const Nn = params.N0 * Math.exp(-lambda() * tt);
      const x = -6 + (tt / Math.max(t, params.halfLife * 3)) * 12;
      const y = -4 + (Nn / params.N0) * 6;
      const p = r.worldToCanvas(x, y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    // current point
    const Nc = aliveCount();
    const pc = r.worldToCanvas(
      -6 + (t / Math.max(t, params.halfLife * 3)) * 12,
      -4 + (Nc / params.N0) * 6
    );
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pc.x, pc.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '12px sans-serif';
  ctx.fillText('Verde = intacto · Rojo tenue = decaído · curva = N(t)', 12, 20);
  ctx.restore();
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group"><label class="control-label">$N_0$</label>
      <div class="slider-row"><input type="range" id="ra_N0" class="custom-slider" min="20" max="300" step="10" value="${params.N0}"><span id="ra_N0d">${params.N0}</span></div></div>
    <div class="control-group"><label class="control-label">$T_{1/2}$ (s sim)</label>
      <div class="slider-row"><input type="range" id="ra_hl" class="custom-slider" min="2" max="30" step="0.5" value="${params.halfLife}"><span id="ra_hld">${params.halfLife}</span></div></div>
    <button type="button" class="ctrl-btn" id="ra_reset" style="width:100%;margin-top:8px">Reiniciar muestra</button>
  `);
  setTimeout(() => {
    document.getElementById('ra_reset')?.addEventListener('click', () => {
      t = 0;
      spawn();
    });
    const bind = (id, key, d, respawn = false) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
        if (respawn) {
          t = 0;
          spawn();
        }
      });
    };
    bind('ra_N0', 'N0', 'ra_N0d', true);
    bind('ra_hl', 'halfLife', 'ra_hld', false);
  }, 0);
}

export function getState() {
  return { t, params: { ...params }, atoms: atoms.map((a) => ({ ...a })) };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  if (Array.isArray(s.atoms)) atoms = s.atoms;
  renderParams();
}
