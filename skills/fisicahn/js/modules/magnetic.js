/**
 * Campos magnéticos — carga con velocidad en B uniforme (F = q v × B).
 * B sale de la página (+z); movimiento en plano xy.
 *
 * Importante (pedagogía): la órbita es circular, pero el centro NO es una masa.
 * A diferencia de gravedad/Kepler, no hay cuerpo en el centro: el “centro” es
 * solo el centro geométrico de la trayectoria (fuerza siempre ⊥ a v).
 */

import { Vector2D } from '../utils/vector2d.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';
import { roundTo } from '../utils/math-helpers.js';

let _engine, _renderer, _ui;
let pos, vel;
let trail = [];
/** Cámara fija en el centro de órbita (recomendado en clase). */
let unbounded = false;

const params = {
  q: 1,
  m: 1,
  B: 1.2,
  v0: 3
};

/** Radio ciclotrón r = m v / |q| B */
function orbitRadius() {
  return (params.m * params.v0) / (Math.abs(params.q * params.B) || 1e-9);
}

/**
 * Centro geométrico de la órbita (no es un objeto físico).
 * r_c = r + (m / (q B)) (v × ẑ),  v×ẑ = (vy, −vx).
 */
function orbitCenter() {
  const qB = params.q * params.B;
  if (Math.abs(qB) < 1e-12) {
    return { x: pos.x, y: pos.y, defined: false };
  }
  const factor = params.m / qB;
  // v × ẑ = (vy, −vx)
  return {
    x: pos.x + factor * vel.y,
    y: pos.y + factor * (-vel.x),
    defined: true
  };
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  resetState();
  renderer.resetCamera();
  setModuleInfo(ui, {
    title: meta?.title || 'Campos magnéticos',
    blurb:
      meta?.blurb ||
      'Carga en B uniforme: F = q(v × B). Órbita circular sin masa en el centro.',
    story:
      'La fuerza de Lorentz es siempre perpendicular a la velocidad: curva la trayectoria pero no cambia |v|. ' +
      'El círculo tiene un centro geométrico (marcador discontinuo), no un planeta ni una carga fija. ' +
      'Eso lo distingue de Gravedad universal y de Kepler (atracción 1/r² hacia una masa central). ' +
      'Ejemplo real: electrones en un tubo de rayos catódicos o iones en un ciclotrón.',
    cases: [
      'Tubo CRT / haz de electrones curvado por B.',
      'Ciclotrón: órbitas con r = mv/|q|B (mayor v → mayor radio).',
      'Cambia el signo de q: la órbita gira al revés (regla de la mano derecha).'
    ]
  });

  setModuleFormulas(ui, {
    items: [
      {
        name: 'Fuerza de Lorentz (B ⊥ v)',
        formula: 'F = |q| · v · B',
        note: 'Dirección: v × B (mano derecha). |v| no cambia.'
      },
      {
        name: 'Radio de órbita',
        formula: 'r = m·v / (|q|·B)',
        note: 'Mayor B o |q| → círculo más chico. No hay masa en el centro.'
      },
      {
        name: 'Periodo ciclotrón',
        formula: 'T = 2π m / (|q| B)',
        note: 'En B uniforme, T no depende de v.'
      }
    ]
  });

  clearChallenges(ui);
  renderParams();
  updateData();
}

/**
 * Coloca la carga de modo que el centro geométrico quede en el origen.
 * Así se ve la órbita completa y no parece “orbitar un objeto invisible en (0,0)”.
 */
function resetState() {
  const R = orbitRadius();
  const speed = Math.max(0.05, params.v0);
  // Sentido de giro: k = qB/m > 0 → a = k(vy, −vx) → sentido horario en pantalla
  // (y canvas hacia abajo no aplica al mundo; en coords mundo y↑).
  // Centro en (0,0), partícula en (R, 0):
  //   a debe apuntar a −x → a_x < 0 → k·vy < 0.
  //   Si k>0 → vy < 0; si k<0 → vy > 0. vx = 0.
  const sense = params.q * params.B >= 0 ? -1 : 1;
  pos = new Vector2D(R, 0);
  vel = new Vector2D(0, sense * speed);
  trail = [];
  if (_renderer) {
    _renderer.resetCamera?.();
    // Encuadrar el círculo (radio + margen)
    try {
      if (typeof _renderer.setZoom === 'function') {
        /* optional */
      }
    } catch {
      /* ignore */
    }
  }
}

export function destroy() {
  if (_renderer) _renderer.resetCamera();
  _engine = _renderer = _ui = null;
}
export function reset(engine, renderer) {
  resetState();
  if (renderer) renderer.resetCamera();
  engine.reset();
  updateData();
}
export function setTool(id) {
  if (id === 'unbounded') setUnbounded(!unbounded);
}
export function setUnbounded(on) {
  unbounded = !!on;
  const btn = document.getElementById('param_unbounded');
  if (btn) {
    btn.textContent = unbounded ? 'Seguir carga: ON' : 'Seguir carga: OFF';
    btn.classList.toggle('active', unbounded);
  }
  if (!unbounded) _renderer?.resetCamera();
}
export function getUnbounded() {
  return unbounded;
}

function updateData() {
  const R = orbitRadius();
  const c = orbitCenter();
  const T =
    (2 * Math.PI * params.m) / (Math.abs(params.q * params.B) || 1e-9);
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>q = ${params.q} · m = ${params.m} · B = ${params.B} (⊙ sale de la página)</div>
      <div>|v| = ${roundTo(vel?.magnitude?.() ?? params.v0, 3)} · r = ${roundTo(R, 3)}</div>
      <div>T ≈ ${roundTo(T, 3)} (periodo ciclotrón)</div>
      <div>Centro geométrico ≈ (${roundTo(c.x, 2)}, ${roundTo(c.y, 2)}) — <em>no hay objeto ahí</em></div>
      <div style="margin-top:4px;color:var(--accent)">F ⊥ v · |v| constante · ≠ gravedad (no hay masa central)</div>
    </div>
  `);
}

export function update(dt) {
  // F = q (v × Bẑ) → a = (qB/m)(vy, −vx)
  const k = (params.q * params.B) / params.m;
  const ax = k * vel.y;
  const ay = -k * vel.x;
  vel = vel.add(new Vector2D(ax, ay).scale(dt));
  // Renorm suave: |v| debe ser constante (F magnética no hace trabajo)
  const speed = vel.magnitude();
  if (speed > 1e-6) {
    vel = vel.scale(params.v0 / speed);
  }
  pos = pos.add(vel.scale(dt));
  trail.push(pos.clone());
  if (trail.length > 400) trail.shift();

  if (unbounded && _renderer) _renderer.follow(pos.x, pos.y);

  updateData();
}

function drawBField(ctx, r, w, h) {
  // B uniforme saliendo de la página: símbolos ⊙ en rejilla
  const camX = r.camera?.x ?? 0;
  const camY = r.camera?.y ?? 0;
  const step = 1.6;
  const x0 = Math.floor((camX - 12) / step) * step;
  const y0 = Math.floor((camY - 9) / step) * step;

  ctx.save();
  for (let x = x0; x <= camX + 12; x += step) {
    for (let y = y0; y <= camY + 9; y += step) {
      const p = r.worldToCanvas(x, y);
      if (p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) continue;
      // círculo con punto = B hacia nosotros
      ctx.strokeStyle = 'rgba(129, 212, 250, 0.35)';
      ctx.fillStyle = 'rgba(129, 212, 250, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function chip(ctx, text, x, y, fill) {
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const padX = 10;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(12, 15, 20, 0.62)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y - 12, tw + padX * 2, 24, 8);
    ctx.fill();
  } else {
    ctx.fillRect(x, y - 12, tw + padX * 2, 24);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x + padX, y);
}

export function render(ctx) {
  if (!_renderer || !pos || !vel) return;
  const r = _renderer;
  const w = ctx.canvas?.clientWidth || ctx.canvas?.width || 800;
  const h = ctx.canvas?.clientHeight || ctx.canvas?.height || 500;
  const R = orbitRadius();
  const c = orbitCenter();

  // Campo B (uniforme en todo el plano)
  drawBField(ctx, r, w, h);

  // Título de escena
  chip(
    ctx,
    'B uniforme ⊙ (sale de la página) · F = q(v × B)',
    14,
    22,
    '#81d4fa'
  );
  chip(ctx, 'No hay masa ni imán en el centro del círculo', 14, 50, '#ffb74d');

  // Círculo de órbita ideal + centro geométrico
  if (c.defined && Number.isFinite(R) && R < 40) {
    const pc = r.worldToCanvas(c.x, c.y);
    const pEdge = r.worldToCanvas(c.x + R, c.y);
    const radPx = Math.abs(pEdge.x - pc.x);

    ctx.save();
    // órbita guía
    ctx.strokeStyle = 'rgba(206, 147, 216, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(pc.x, pc.y, radPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // radio r
    const pPart = r.worldToCanvas(pos.x, pos.y);
    ctx.strokeStyle = 'rgba(255, 183, 77, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pc.x, pc.y);
    ctx.lineTo(pPart.x, pPart.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 183, 77, 0.9)';
    ctx.textAlign = 'center';
    ctx.fillText('r', (pc.x + pPart.x) / 2, (pc.y + pPart.y) / 2 - 8);

    // marcador del centro (cruz + etiqueta) — deja claro que NO es un objeto
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pc.x - 10, pc.y);
    ctx.lineTo(pc.x + 10, pc.y);
    ctx.moveTo(pc.x, pc.y - 10);
    ctx.lineTo(pc.x, pc.y + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pc.x, pc.y, 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const label = 'centro de órbita (geométrico)';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(12,15,20,0.55)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(pc.x + 12, pc.y - 22, tw + 12, 18, 6);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(label, pc.x + 18, pc.y - 8);
    ctx.restore();
  }

  // Trail
  if (trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(206,147,216,0.55)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const p = r.worldToCanvas(trail[i].x, trail[i].y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Carga
  const chargeColor = params.q >= 0 ? '#ef5350' : '#4fc3f7';
  const chargeLabel = params.q >= 0 ? `+q` : `−q`;
  r.drawObject(pos.x, pos.y, {
    shape: 'circle',
    size: 0.38,
    color: chargeColor,
    label: chargeLabel
  });

  // Vectores v y F en la carga
  r.drawVector(pos.x, pos.y, vel.x * 0.28, vel.y * 0.28, {
    color: '#66bb6a',
    label: 'v'
  });
  // F = q (v × Bẑ) = q B (vy, −vx) → dirección de a * m
  const Fx = params.q * params.B * vel.y;
  const Fy = -params.q * params.B * vel.x;
  const Fmag = Math.hypot(Fx, Fy) || 1;
  const fScale = 0.9 / Fmag; // longitud visual ~0.9
  r.drawVector(pos.x, pos.y, Fx * fScale, Fy * fScale, {
    color: '#ff7043',
    label: 'F'
  });

  // Leyenda
  const legend = [
    { c: '#81d4fa', t: 'B ⊙ (uniforme)' },
    { c: chargeColor, t: 'Carga en movimiento' },
    { c: '#66bb6a', t: 'Velocidad v' },
    { c: '#ff7043', t: 'Fuerza F ⊥ v' },
    { c: 'rgba(255,255,255,0.7)', t: 'Centro (no es un objeto)' }
  ];
  ctx.save();
  let lx = w - 14;
  const ly0 = 18;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  legend.forEach((item, i) => {
    const y = ly0 + i * 22;
    const tw = ctx.measureText(item.t).width;
    ctx.fillStyle = 'rgba(12,15,20,0.55)';
    ctx.fillRect(lx - tw - 28, y - 10, tw + 24, 20);
    ctx.strokeStyle = item.c;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx - tw - 20, y);
    ctx.lineTo(lx - tw - 6, y);
    ctx.stroke();
    ctx.fillStyle = item.c;
    ctx.fillText(item.t, lx - 4, y);
  });
  ctx.restore();
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group">
      <button type="button" class="ctrl-btn unbounded-btn ${unbounded ? 'active' : ''}" id="param_unbounded">${
        unbounded ? 'Seguir carga: ON' : 'Seguir carga: OFF'
      }</button>
      <p class="control-hint" style="margin:6px 0 0;font-size:0.75rem;color:var(--text-secondary);line-height:1.35">
        Por defecto la cámara está fija en el centro geométrico. Activa “Seguir” solo si quieres ir con la carga.
      </p>
    </div>
    <div class="control-group"><label class="control-label">$q$ carga (signo / magnitud)</label>
      <div class="slider-row"><input type="range" id="m_q" class="custom-slider" min="-3" max="3" step="0.5" value="${params.q}"><span id="md_q">${params.q}</span></div></div>
    <div class="control-group"><label class="control-label">$m$ masa</label>
      <div class="slider-row"><input type="range" id="m_m" class="custom-slider" min="0.4" max="3" step="0.1" value="${params.m}"><span id="md_m">${params.m}</span></div></div>
    <div class="control-group"><label class="control-label">$B$ campo magnético (T)</label>
      <div class="slider-row"><input type="range" id="m_B" class="custom-slider" min="0.2" max="3" step="0.1" value="${params.B}"><span id="md_B">${params.B}</span></div></div>
    <div class="control-group"><label class="control-label">$v_0$ velocidad (m/s)</label>
      <div class="slider-row"><input type="range" id="m_v" class="custom-slider" min="0.5" max="6" step="0.1" value="${params.v0}"><span id="md_v">${params.v0}</span></div></div>
  `);
  setTimeout(() => {
    document.getElementById('param_unbounded')?.addEventListener('click', () =>
      setUnbounded(!unbounded)
    );
    const bind = (id, key, d) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        // q = 0 rompe la órbita; evitar exactamente 0 en el slider
        if (key === 'q' && Math.abs(params.q) < 0.25) {
          params.q = params.q >= 0 ? 0.5 : -0.5;
          el.value = String(params.q);
        }
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
        resetState();
        _engine?.reset();
        updateData();
      });
    };
    bind('m_q', 'q', 'md_q');
    bind('m_m', 'm', 'md_m');
    bind('m_B', 'B', 'md_B');
    bind('m_v', 'v0', 'md_v');
  }, 0);
}

export function getState() {
  return {
    pos: pos ? { x: pos.x, y: pos.y } : null,
    vel: vel ? { x: vel.x, y: vel.y } : null,
    unbounded,
    params: { ...params }
  };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.pos) pos = new Vector2D(s.pos.x, s.pos.y);
  if (s.vel) vel = new Vector2D(s.vel.x, s.vel.y);
  if (typeof s.unbounded === 'boolean') setUnbounded(s.unbounded);
  // Si no hay estado de posición válido, re-centrar órbita
  if (!s.pos || !s.vel) resetState();
  trail = [];
  renderParams();
  updateData();
}
