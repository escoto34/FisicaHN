/**
 * Fricción — muñeco empuja una caja: estática (no se mueve) vs cinética (desliza).
 * f_s ≤ μ_s N · f_k = μ_k N · arranque cuando F > f_s,max
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  paramControl,
  bindParamControls,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;
let t = 0;
/** Posición del borde izquierdo de la caja (m). */
let boxX = -1.2;
let v = 0;
/** 'static' | 'kinetic' */
let mode = 'static';
/** Fase de animación de piernas al caminar (0…1). */
let walkPhase = 0;
/** Inclinación del torso al empujar (rad). */
let lean = 0.25;

const params = {
  m: 5,
  F: 15,
  mu_s: 0.45,
  mu_k: 0.3,
  g: 9.81
};

const BOX_W = 1.4;
const BOX_H = 1.1;
const GROUND_Y = -0.55;

function N() {
  return params.m * params.g;
}

function fsMax() {
  return params.mu_s * N();
}

function fk() {
  return params.mu_k * N();
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  resetState();
  renderer?.resetCamera?.();

  setModuleInfo(ui, {
    title: meta?.title || 'Fricción',
    blurb:
      meta?.blurb ||
      'Un muñeco empuja una caja: fricción estática (reposo) y cinética (deslizamiento).',
    story:
      'Mientras la caja no se mueve, la fricción estática se ajusta para equilibrar el empuje (hasta μ_s N). ' +
      'Si empujas más fuerte que ese máximo, la caja arranca y actúa la fricción cinética f_k = μ_k N, ' +
      'casi siempre menor que el máximo estático. Por eso cuesta más arrancar un mueble que deslizarlo.',
    cases: [
      'Empujar un armario o un cajón pesado en el suelo.',
      'Frenar un coche: bloqueo de ruedas → fricción cinética (menor control).',
      'Caminar: la fricción estática del zapato te impulsa hacia adelante.'
    ]
  });

  setModuleFormulas(ui, {
    items: [
      { name: 'Normal', formula: 'N = m g', note: 'Superficie horizontal.' },
      {
        name: 'Estática (máx.)',
        formula: 'f_{s,\\max} = \\mu_s N',
        note: 'En reposo: f_s ≤ f_{s,max} y se opone al empuje.'
      },
      {
        name: 'Cinética',
        formula: 'f_k = \\mu_k N',
        note: 'Al deslizar; suele ser μ_k < μ_s.'
      },
      {
        name: 'Segunda ley (deslizando)',
        formula: 'F - f_k = m a'
      }
    ]
  });
  clearChallenges(ui);
  renderParams();
  updateData();
}

function resetState() {
  t = 0;
  boxX = -1.2;
  v = 0;
  mode = 'static';
  walkPhase = 0;
  lean = 0.2;
}

export function destroy() {
  _engine = _renderer = _ui = null;
}

export function reset(engine) {
  resetState();
  engine?.reset?.();
  updateData();
}

export function setTool() {}

export function update(dt) {
  t += dt;
  const F = params.F;
  const fMax = fsMax();
  const fKin = fk();

  if (mode === 'static') {
    // Aún no arranca
    if (F > fMax + 1e-6) {
      mode = 'kinetic';
      v = 0.01;
    } else {
      v = 0;
      // lean proportional to effort
      lean = 0.12 + 0.35 * Math.min(1, F / Math.max(fMax, 0.5));
    }
  }

  if (mode === 'kinetic') {
    const Fnet = F - fKin;
    const a = Fnet / params.m;
    v += a * dt;
    if (v < 0) {
      v = 0;
      // Si F ≤ f_s,max puede volver a estático al parar
      if (F <= fMax) mode = 'static';
    }
    boxX += v * dt;
    walkPhase = (walkPhase + Math.min(Math.abs(v), 4) * dt * 1.2) % 1;
    lean = 0.18 + 0.12 * Math.min(1, F / 30);

    // Bucle de pista: reaparece a la izquierda
    if (boxX > 7) {
      boxX = -6;
    }
  }

  updateData();
}

function frictionForceDisplay() {
  if (mode === 'static') {
    // En estático f_s = F (si F ≤ f_max), se opone
    return Math.min(params.F, fsMax());
  }
  return fk();
}

function updateData() {
  if (!_ui) return;
  const fMax = fsMax();
  const f = frictionForceDisplay();
  const a = mode === 'kinetic' ? (params.F - fk()) / params.m : 0;
  const status =
    mode === 'static'
      ? params.F > fMax
        ? 'arrancando…'
        : 'en reposo (estática)'
      : 'deslizando (cinética)';

  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.75">
      <div><strong>Estado:</strong> ${status}</div>
      <div>N = ${roundTo(N(), 2)} N</div>
      <div>f<sub>s,max</sub> = μ<sub>s</sub>N = ${roundTo(fMax, 2)} N</div>
      <div>f<sub>k</sub> = μ<sub>k</sub>N = ${roundTo(fk(), 2)} N</div>
      <div>f (actual) ≈ ${roundTo(f, 2)} N</div>
      <div>F<sub>empuje</sub> = ${roundTo(params.F, 1)} N</div>
      <div>v = ${roundTo(v, 3)} m/s · a = ${roundTo(a, 3)} m/s²</div>
      <div>μ<sub>s</sub> = ${params.mu_s} · μ<sub>k</sub> = ${params.mu_k}</div>
    </div>
  `);
}

/* ---------- dibujo ---------- */

function drawGround(ctx, r) {
  const a = r.worldToCanvas(-9, GROUND_Y);
  const b = r.worldToCanvas(9, GROUND_Y);
  ctx.save();
  ctx.strokeStyle = 'rgba(180, 190, 200, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  // textura de suelo
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let x = -8; x <= 8; x += 0.7) {
    const p = r.worldToCanvas(x, GROUND_Y);
    const q = r.worldToCanvas(x + 0.25, GROUND_Y + 0.15);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBox(ctx, r) {
  const cx = boxX + BOX_W / 2;
  const cy = GROUND_Y + BOX_H / 2;
  const tl = r.worldToCanvas(boxX, GROUND_Y + BOX_H);
  const br = r.worldToCanvas(boxX + BOX_W, GROUND_Y);
  const w = br.x - tl.x;
  const h = br.y - tl.y;

  ctx.save();
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(tl.x + w / 2, br.y + 4, w * 0.45, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // caja de madera
  const g = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y);
  g.addColorStop(0, '#c48a4a');
  g.addColorStop(0.5, '#a56a32');
  g.addColorStop(1, '#7a4a1e');
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(255,230,180,0.35)';
  ctx.lineWidth = 2;
  const rr = 6;
  roundRect(ctx, tl.x, tl.y, w, h, rr);
  ctx.fill();
  ctx.stroke();

  // listones
  ctx.strokeStyle = 'rgba(60,30,10,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= 2; i++) {
    const yy = tl.y + (h * i) / 3;
    ctx.beginPath();
    ctx.moveTo(tl.x + 4, yy);
    ctx.lineTo(tl.x + w - 4, yy);
    ctx.stroke();
  }
  // etiqueta masa
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 12px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${params.m} kg`, tl.x + w / 2, tl.y + h / 2);

  ctx.restore();
  return { cx, cy };
}

/**
 * Muñeco tipo stick figure que empuja la caja desde la izquierda.
 */
function drawPerson(ctx, r) {
  const handX = boxX - 0.05;
  const standX = handX - 0.55;
  const footY = GROUND_Y;

  const head = r.worldToCanvas(standX, footY + 1.55);
  const hip = r.worldToCanvas(standX + lean * 0.15, footY + 0.75);
  const shoulder = r.worldToCanvas(standX + lean * 0.35, footY + 1.25);
  const hand = r.worldToCanvas(handX, footY + BOX_H * 0.55);

  // animación de piernas
  const stride = mode === 'kinetic' && v > 0.05 ? 0.22 : 0.06;
  const ph = walkPhase * Math.PI * 2;
  const legSwing = Math.sin(ph) * stride;
  const legSwing2 = Math.sin(ph + Math.PI) * stride;

  const knee1 = r.worldToCanvas(standX + legSwing, footY + 0.38);
  const foot1 = r.worldToCanvas(standX + legSwing * 1.4, footY);
  const knee2 = r.worldToCanvas(standX + legSwing2, footY + 0.38);
  const foot2 = r.worldToCanvas(standX + legSwing2 * 1.4, footY);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#90caf9';
  ctx.fillStyle = '#90caf9';
  ctx.lineWidth = 3.2;

  // piernas
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee1.x, knee1.y);
  ctx.lineTo(foot1.x, foot1.y);
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee2.x, knee2.y);
  ctx.lineTo(foot2.x, foot2.y);
  ctx.stroke();

  // torso
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(shoulder.x, shoulder.y);
  ctx.stroke();

  // brazo empujando (hombro → mano en la caja)
  ctx.strokeStyle = '#ffb74d';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  // codo un poco abajo
  const elbow = r.worldToCanvas(
    (standX + handX) / 2 + lean * 0.1,
    footY + BOX_H * 0.72
  );
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(hand.x, hand.y);
  ctx.stroke();

  // otro brazo (atrás, balanceo)
  const armBack = r.worldToCanvas(standX - 0.25 - legSwing * 0.5, footY + 0.95);
  ctx.strokeStyle = '#90caf9';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(armBack.x, armBack.y);
  ctx.stroke();

  // cabeza
  const headR = Math.abs(r.worldToCanvas(0, 0).y - r.worldToCanvas(0, 0.22).y);
  ctx.fillStyle = '#ffe0b2';
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(head.x, head.y, Math.max(headR, 8), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // esfuerzo: gotas de sudor si empuja fuerte en estático
  if (mode === 'static' && params.F > fsMax() * 0.7) {
    ctx.fillStyle = 'rgba(120,200,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(head.x + headR + 4, head.y - 2, 2.5, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawForceVectors(ctx, r, boxCenter) {
  const scale = 0.1;
  const cy = GROUND_Y + BOX_H * 0.55;
  const cx = boxCenter.cx;

  // F empuje (desde la izquierda hacia la caja)
  if (params.F > 0.05) {
    r.drawVector(boxX - 0.05, cy, params.F * scale, 0, {
      color: '#66bb6a',
      width: 2.5,
      label: `F = ${roundTo(params.F, 1)} N`,
      labelSide: 1
    });
  }

  const f = frictionForceDisplay();
  if (f > 0.05) {
    const dir = mode === 'kinetic' && v < -0.01 ? 1 : -1;
    // fricción se opone al deslizamiento / al empuje (empujamos a +x → f a -x)
    r.drawVector(cx, GROUND_Y + 0.12, dir * f * scale, 0, {
      color: mode === 'static' ? '#ab47bc' : '#ef5350',
      width: 2.5,
      label: mode === 'static' ? `f_s ≈ ${roundTo(f, 1)} N` : `f_k = ${roundTo(f, 1)} N`,
      labelSide: -1
    });
  }

  // Normal y peso (verticales cortos)
  r.drawVector(cx, GROUND_Y + BOX_H, 0, Math.min(N() * 0.02, 0.9), {
    color: '#4fc3f7',
    width: 2,
    label: 'N',
    labelSide: 1
  });
  r.drawVector(cx, GROUND_Y + BOX_H * 0.35, 0, -Math.min(N() * 0.02, 0.9), {
    color: '#ffee58',
    width: 2,
    label: 'mg',
    labelSide: -1
  });
}

function drawHud(ctx) {
  const fMax = fsMax();
  const lines = [
    mode === 'static' ? 'REPOSO — fricción estática' : 'DESLIZA — fricción cinética',
    `F ${params.F > fMax ? '>' : '≤'} f_s,max (${roundTo(fMax, 1)} N) → ${
      params.F > fMax ? 'arranca' : 'no arranca'
    }`,
    `μ_s=${params.mu_s}  μ_k=${params.mu_k}`
  ];
  ctx.save();
  ctx.font = '12px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? (mode === 'static' ? '#ce93d8' : '#ef9a9a') : 'rgba(255,255,255,0.65)';
    ctx.fillText(line, 12, 10 + i * 17);
  });
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  drawGround(ctx, r);
  const boxCenter = drawBox(ctx, r);
  drawPerson(ctx, r);
  drawForceVectors(ctx, r, boxCenter);
  drawHud(ctx);
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    ${paramControl({ id: 'm', labelTex: 'm', labelRest: 'masa caja', min: 1, max: 20, step: 0.5, value: params.m, unit: 'kg' })}
    ${paramControl({ id: 'F', labelTex: 'F', labelRest: 'empuje', min: 0, max: 80, step: 0.5, value: params.F, unit: 'N' })}
    ${paramControl({ id: 'mu_s', labelTex: '\\mu_s', labelRest: 'estático', min: 0.05, max: 1.2, step: 0.01, value: params.mu_s })}
    ${paramControl({ id: 'mu_k', labelTex: '\\mu_k', labelRest: 'cinético', min: 0, max: 1, step: 0.01, value: params.mu_k })}
    <p class="tab-text" style="opacity:0.7;font-size:0.8rem;margin-top:0.5rem">
      Sube F por encima de μ<sub>s</sub>N para que el muñeco mueva la caja. μ<sub>k</sub> suele ser menor que μ<sub>s</sub>.
    </p>
  `);

  setTimeout(() => {
    bindParamControls(['m', 'F', 'mu_s', 'mu_k'], (id, val) => {
      params[id] = val;
      // Si bajan F o suben μ, puede volver a estático al reiniciar movimiento suave
      if (id === 'mu_s' || id === 'mu_k' || id === 'm') {
        // clamp mu_k <= mu_s visual hint only — allow free values for experiment
      }
      if (mode === 'kinetic' && params.F <= fsMax() && Math.abs(v) < 0.05) {
        mode = 'static';
        v = 0;
      }
      updateData();
    });
  }, 0);
}

export function getState() {
  return { t, boxX, v, mode, walkPhase, lean, params: { ...params } };
}

export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.boxX != null) boxX = s.boxX;
  if (s.v != null) v = s.v;
  if (s.mode) mode = s.mode;
  if (s.walkPhase != null) walkPhase = s.walkPhase;
  if (s.lean != null) lean = s.lean;
  if (s.t != null) t = s.t;
  renderParams();
  updateData();
}
