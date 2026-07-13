/**
 * Leyes de Kepler + asistencia gravitacional (flyby).
 * Complementa gravedad universal (órbita libre) con foco en T²∝a³ y slings.
 */

import { Vector2D } from '../utils/vector2d.js';
import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let pos, vel;
let trail = [];
let t = 0;
let periodSamples = [];
let lastTheta = 0;
let periodEst = null;
let planet; // for flyby

const params = {
  mode: 'kepler', // kepler | flyby
  a: 5,
  e: 0.35,
  GM: 40,
  planetGM: 12,
  planetR: 8,
  planetV: 1.2
};

function mu() {
  return params.GM;
}

function resetKepler() {
  // start at periapsis
  const a = params.a;
  const e = Math.min(0.9, Math.max(0, params.e));
  const rp = a * (1 - e);
  pos = new Vector2D(rp, 0);
  const vp = Math.sqrt(mu() * (1 + e) / Math.max(rp, 0.1));
  vel = new Vector2D(0, vp);
  trail = [];
  t = 0;
  periodSamples = [];
  lastTheta = 0;
  periodEst = null;
}

function resetFlyby() {
  pos = new Vector2D(-10, 2.5);
  vel = new Vector2D(3.2, 0);
  planet = { pos: new Vector2D(params.planetR, 0), vel: new Vector2D(0, params.planetV) };
  trail = [];
  t = 0;
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  if (params.mode === 'flyby') resetFlyby();
  else resetKepler();
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Kepler y asistencia gravitacional',
    blurb:
      meta?.blurb ||
      'Elipses con T² ∝ a³ y sobrevuelo (slingshot) que cambia la velocidad.',
    story:
      'Kepler describió las órbitas planetarias; Newton las explicó con gravitación. Las sondas usan asistencia gravitacional para ganar o perder energía respecto al Sol.',
    cases: [
      'Planetas: más semieje a → mayor periodo T.',
      'Áreas iguales en tiempos iguales (2.ª ley).',
      'Voyager / Juno: flyby para cambiar rumbo y energía.'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: '1.ª ley', formula: 'Órbitas elípticas; Sol en un foco' },
      { name: '2.ª ley', formula: 'dA/dt = const', note: 'Más rápido en perihelio.' },
      { name: '3.ª ley', formula: 'T² = (4π²/GM) a³' },
      { name: 'Vis-viva', formula: 'v² = GM (2/r − 1/a)' }
    ]
  });
  clearChallenges(ui);
  renderParams();
}

export function destroy() {
  if (_renderer) _renderer.resetCamera?.();
  _engine = _renderer = _ui = null;
}
export function reset(engine) {
  if (params.mode === 'flyby') resetFlyby();
  else resetKepler();
  engine?.reset?.();
}
export function setTool() {}

export function update(dt) {
  t += dt;
  if (params.mode === 'kepler') {
    const r = Math.hypot(pos.x, pos.y) || 1e-6;
    const aMag = mu() / (r * r);
    vel = vel.add(new Vector2D((-aMag * pos.x) / r, (-aMag * pos.y) / r).scale(dt));
    pos = pos.add(vel.scale(dt));
    // period estimate via angle wrapping
    const th = Math.atan2(pos.y, pos.x);
    let dth = th - lastTheta;
    if (dth < -Math.PI) dth += Math.PI * 2;
    if (dth > Math.PI) dth -= Math.PI * 2;
    periodSamples.push({ t, dth });
    let acc = 0;
    for (let i = periodSamples.length - 1; i >= 0; i--) {
      acc += periodSamples[i].dth;
      if (acc >= Math.PI * 2) {
        periodEst = t - periodSamples[i].t;
        periodSamples = periodSamples.slice(i);
        break;
      }
    }
    lastTheta = th;
    if (trail.length > 500) trail.shift();
    trail.push(pos.clone());
  } else {
    // flyby: sun fixed optional weak + planet
    planet.pos = planet.pos.add(planet.vel.scale(dt));
    // gravity from planet
    const dx = pos.x - planet.pos.x;
    const dy = pos.y - planet.pos.y;
    const rp = Math.hypot(dx, dy) || 1e-6;
    const ap = params.planetGM / (rp * rp);
    vel = vel.add(new Vector2D((-ap * dx) / rp, (-ap * dy) / rp).scale(dt));
    // weak central sun for context
    const rs = Math.hypot(pos.x, pos.y) || 1e-6;
    const asun = (params.GM * 0.15) / (rs * rs);
    vel = vel.add(new Vector2D((-asun * pos.x) / rs, (-asun * pos.y) / rs).scale(dt));
    pos = pos.add(vel.scale(dt));
    trail.push(pos.clone());
    if (trail.length > 400) trail.shift();
    if (pos.x > 14 || pos.x < -14 || Math.abs(pos.y) > 12) resetFlyby();
  }
  if (_renderer) _renderer.follow?.(pos.x * 0.2, pos.y * 0.2);
  updateData();
}

function updateData() {
  const r = Math.hypot(pos.x, pos.y);
  const speed = vel.magnitude();
  if (params.mode === 'kepler') {
    const a = params.a;
    const Tth = 2 * Math.PI * Math.sqrt((a * a * a) / mu());
    const E = 0.5 * speed * speed - mu() / r;
    _ui?.setData(`
      <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
        <div>a = ${params.a} · e = ${params.e}</div>
        <div>r = ${roundTo(r, 3)} · |v| = ${roundTo(speed, 3)}</div>
        <div>T<sub>teoría</sub> = ${roundTo(Tth, 2)} (3.ª ley)</div>
        <div>T<sub>medido</sub> ≈ ${periodEst != null ? roundTo(periodEst, 2) : '…'}</div>
        <div>E/m ≈ ${roundTo(E, 3)} (elipse si &lt; 0)</div>
      </div>
    `);
  } else {
    _ui?.setData(`
      <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
        <div>Flyby / slingshot</div>
        <div>|v| sonda = ${roundTo(speed, 3)}</div>
        <div>planeta GM = ${params.planetGM}</div>
        <div>Observa cómo |v| cambia tras el sobrevuelo</div>
      </div>
    `);
  }
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  r.drawObject(0, 0, { shape: 'circle', size: 0.65, color: '#ffb74d', label: 'M' });

  if (params.mode === 'kepler') {
    // draw ideal ellipse guide
    const a = params.a;
    const e = params.e;
    const b = a * Math.sqrt(Math.max(0, 1 - e * e));
    const c = a * e;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const ang = (i / 80) * Math.PI * 2;
      // focus at origin: center shifted by -c
      const x = -c + a * Math.cos(ang);
      const y = b * Math.sin(ang);
      const p = r.worldToCanvas(x, y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if (planet) {
    r.drawObject(planet.pos.x, planet.pos.y, {
      shape: 'circle',
      size: 0.55,
      color: '#90caf9',
      label: 'planeta'
    });
  }

  if (trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(79,195,247,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const p = r.worldToCanvas(trail[i].x, trail[i].y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  r.drawObject(pos.x, pos.y, { shape: 'circle', size: 0.28, color: '#4fc3f7', label: 'm' });
  r.drawVector(pos.x, pos.y, vel.x * 0.25, vel.y * 0.25, { color: '#66bb6a', label: 'v' });
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Modo</label>
      <select id="kp_mode" class="custom-select" style="width:100%;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px">
        <option value="kepler" ${params.mode === 'kepler' ? 'selected' : ''}>Leyes de Kepler (elipse)</option>
        <option value="flyby" ${params.mode === 'flyby' ? 'selected' : ''}>Asistencia gravitacional</option>
      </select>
    </div>
    <div class="control-group"><label class="control-label">$a$ (semieje)</label>
      <div class="slider-row"><input type="range" id="kp_a" class="custom-slider" min="3" max="9" step="0.1" value="${params.a}"><span id="kp_ad">${params.a}</span></div></div>
    <div class="control-group"><label class="control-label">$e$ (excentricidad)</label>
      <div class="slider-row"><input type="range" id="kp_e" class="custom-slider" min="0" max="0.85" step="0.01" value="${params.e}"><span id="kp_ed">${params.e}</span></div></div>
    <div class="control-group"><label class="control-label">$GM$ central</label>
      <div class="slider-row"><input type="range" id="kp_GM" class="custom-slider" min="15" max="80" step="1" value="${params.GM}"><span id="kp_GMd">${params.GM}</span></div></div>
    <div class="control-group"><label class="control-label">$GM$ planeta (flyby)</label>
      <div class="slider-row"><input type="range" id="kp_pGM" class="custom-slider" min="4" max="30" step="0.5" value="${params.planetGM}"><span id="kp_pGMd">${params.planetGM}</span></div></div>
  `);
  setTimeout(() => {
    const re = () => {
      if (params.mode === 'flyby') resetFlyby();
      else resetKepler();
      _engine?.reset?.();
    };
    document.getElementById('kp_mode')?.addEventListener('change', (e) => {
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
    bind('kp_a', 'a', 'kp_ad');
    bind('kp_e', 'e', 'kp_ed');
    bind('kp_GM', 'GM', 'kp_GMd');
    bind('kp_pGM', 'planetGM', 'kp_pGMd');
  }, 0);
}

export function getState() {
  return {
    t,
    params: { ...params },
    pos: pos ? { x: pos.x, y: pos.y } : null,
    vel: vel ? { x: vel.x, y: vel.y } : null,
    periodEst
  };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  if (s.pos) pos = new Vector2D(s.pos.x, s.pos.y);
  if (s.vel) vel = new Vector2D(s.vel.x, s.vel.y);
  if (s.periodEst != null) periodEst = s.periodEst;
  renderParams();
}
