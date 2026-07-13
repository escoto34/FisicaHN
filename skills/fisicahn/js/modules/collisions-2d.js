/**
 * Colisiones multi-cuerpo en 2D (discos elásticos / inelásticos).
 * Complementa momentum 1D de dos cuerpos.
 */

import { Vector2D } from '../utils/vector2d.js';
import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let bodies = [];
let t = 0;

const params = {
  n: 4,
  e: 1,
  speed: 2.5,
  size: 0.45
};

const COLORS = ['#4fc3f7', '#ffb74d', '#66bb6a', '#ce93d8', '#ef5350', '#90caf9'];

function spawn() {
  bodies = [];
  const n = Math.max(2, Math.min(8, Math.round(params.n)));
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + 0.3;
    const r = 2.5 + (i % 2) * 0.8;
    const m = 1 + (i % 3) * 0.5;
    const vx = params.speed * Math.cos(ang + 1.2);
    const vy = params.speed * Math.sin(ang + 1.2);
    bodies.push({
      id: i,
      m,
      r: params.size * (0.85 + m * 0.15),
      pos: new Vector2D(r * Math.cos(ang), r * Math.sin(ang)),
      vel: new Vector2D(vx * (0.6 + 0.2 * (i % 3)), vy * (0.6 + 0.2 * ((i + 1) % 3))),
      color: COLORS[i % COLORS.length]
    });
  }
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  spawn();
  t = 0;
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Colisiones multi-cuerpo (2D)',
    blurb:
      meta?.blurb ||
      'Varios discos en el plano: conservación de p y choques con coeficiente e.',
    story:
      'En 2D el momento se conserva por componentes. Con e = 1 el choque es elástico; e = 0 es perfectamente inelástico a lo largo de la normal.',
    cases: [
      'Billar y bolas de gas ideal (modelo de discos duros).',
      'Choque oblicuo: solo cambia la componente normal.',
      'Sistema de N cuerpos sin fuerzas externas: p total constante.'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Momento 2D', formula: 'p⃗ = m v⃗ · Σp⃗ = const' },
      { name: 'Coeficiente de restitución', formula: 'e = −(v<sub>rel,n</sub>′) / v<sub>rel,n</sub>' },
      { name: 'Impulso normal', formula: 'J n̂ separa las velocidades a lo largo de la línea de centros' }
    ]
  });
  clearChallenges(ui);
  renderParams();
}

export function destroy() {
  _engine = _renderer = _ui = null;
  bodies = [];
}
export function reset(engine) {
  spawn();
  t = 0;
  engine?.reset?.();
}
export function setTool() {}

function resolvePair(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const dist = Math.hypot(dx, dy) || 1e-9;
  const minD = a.r + b.r;
  if (dist >= minD) return;
  const nx = dx / dist;
  const ny = dy / dist;
  // separate
  const overlap = minD - dist;
  const inv = 1 / a.m + 1 / b.m;
  a.pos = a.pos.add(new Vector2D(-nx, -ny).scale((overlap * (1 / a.m)) / inv));
  b.pos = b.pos.add(new Vector2D(nx, ny).scale((overlap * (1 / b.m)) / inv));

  const rvx = b.vel.x - a.vel.x;
  const rvy = b.vel.y - a.vel.y;
  const velN = rvx * nx + rvy * ny;
  if (velN > 0) return; // separating
  const e = params.e;
  const j = (-(1 + e) * velN) / inv;
  const jx = j * nx;
  const jy = j * ny;
  a.vel = new Vector2D(a.vel.x - jx / a.m, a.vel.y - jy / a.m);
  b.vel = new Vector2D(b.vel.x + jx / b.m, b.vel.y + jy / b.m);
}

export function update(dt) {
  t += dt;
  const sub = 2;
  const h = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (const b of bodies) {
      b.pos = b.pos.add(b.vel.scale(h));
      // soft walls box
      const lim = 6.5;
      if (b.pos.x < -lim + b.r) {
        b.pos.x = -lim + b.r;
        b.vel.x = Math.abs(b.vel.x) * params.e;
      }
      if (b.pos.x > lim - b.r) {
        b.pos.x = lim - b.r;
        b.vel.x = -Math.abs(b.vel.x) * params.e;
      }
      if (b.pos.y < -lim + b.r) {
        b.pos.y = -lim + b.r;
        b.vel.y = Math.abs(b.vel.y) * params.e;
      }
      if (b.pos.y > lim - b.r) {
        b.pos.y = lim - b.r;
        b.vel.y = -Math.abs(b.vel.y) * params.e;
      }
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) resolvePair(bodies[i], bodies[j]);
    }
  }
  updateData();
}

function totals() {
  let px = 0;
  let py = 0;
  let Ec = 0;
  for (const b of bodies) {
    px += b.m * b.vel.x;
    py += b.m * b.vel.y;
    Ec += 0.5 * b.m * (b.vel.x ** 2 + b.vel.y ** 2);
  }
  return { px, py, Ec };
}

function updateData() {
  const { px, py, Ec } = totals();
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>N = ${bodies.length} · e = ${params.e}</div>
      <div>p<sub>x</sub> = ${roundTo(px, 3)} · p<sub>y</sub> = ${roundTo(py, 3)}</div>
      <div>|p| = ${roundTo(Math.hypot(px, py), 3)}</div>
      <div>E<sub>c</sub> total = ${roundTo(Ec, 3)} J</div>
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  // box
  const corners = [
    [-6.5, -6.5],
    [6.5, -6.5],
    [6.5, 6.5],
    [-6.5, 6.5]
  ];
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const c = corners[i % 4];
    const p = r.worldToCanvas(c[0], c[1]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();

  for (const b of bodies) {
    r.drawObject(b.pos.x, b.pos.y, {
      shape: 'circle',
      size: b.r,
      color: b.color,
      label: `m${b.id + 1}`
    });
    r.drawVector(b.pos.x, b.pos.y, b.vel.x * 0.2, b.vel.y * 0.2, {
      color: 'rgba(255,255,255,0.5)',
      label: ''
    });
  }
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group"><label class="control-label">$N$ cuerpos</label>
      <div class="slider-row"><input type="range" id="c2_n" class="custom-slider" min="2" max="8" step="1" value="${params.n}"><span id="c2_nd">${params.n}</span></div></div>
    <div class="control-group"><label class="control-label">$e$ (restitución)</label>
      <div class="slider-row"><input type="range" id="c2_e" class="custom-slider" min="0" max="1" step="0.05" value="${params.e}"><span id="c2_ed">${params.e}</span></div></div>
    <div class="control-group"><label class="control-label">rapidez típica</label>
      <div class="slider-row"><input type="range" id="c2_v" class="custom-slider" min="0.5" max="5" step="0.1" value="${params.speed}"><span id="c2_vd">${params.speed}</span></div></div>
    <button type="button" class="ctrl-btn" id="c2_respawn" style="width:100%;margin-top:8px">Reiniciar posiciones</button>
  `);
  setTimeout(() => {
    const re = () => {
      spawn();
      t = 0;
      _engine?.reset?.();
    };
    document.getElementById('c2_respawn')?.addEventListener('click', re);
    const bind = (id, key, d) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
        re();
      });
    };
    bind('c2_n', 'n', 'c2_nd');
    bind('c2_e', 'e', 'c2_ed');
    bind('c2_v', 'speed', 'c2_vd');
  }, 0);
}

export function getState() {
  return {
    t,
    params: { ...params },
    bodies: bodies.map((b) => ({
      id: b.id,
      m: b.m,
      r: b.r,
      color: b.color,
      pos: { x: b.pos.x, y: b.pos.y },
      vel: { x: b.vel.x, y: b.vel.y }
    }))
  };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  if (Array.isArray(s.bodies)) {
    bodies = s.bodies.map((b) => ({
      ...b,
      pos: new Vector2D(b.pos.x, b.pos.y),
      vel: new Vector2D(b.vel.x, b.vel.y)
    }));
  }
  renderParams();
}
