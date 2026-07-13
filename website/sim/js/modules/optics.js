/**
 * Luz y óptica geométrica — reflexión, refracción (Snell) y RTI.
 * Visual pensada para clase: medios coloreados, normal, ángulos y leyenda.
 */

import { Vector2D } from '../utils/vector2d.js';
import {
  setModuleInfo,
  setModuleFormulas,
  paramControl,
  bindParamControls,
  clearChallenges
} from '../module-ui.js';
import { toRad, toDeg, roundTo } from '../utils/math-helpers.js';

let isRunning = false;
let _engine = null;
let _renderer = null;
let _ui = null;

/** Materiales típicos (índice de refracción aprox.) */
const MATERIALS = [
  { id: 'air', label: 'Aire', n: 1.0, tint: 'rgba(79, 195, 247, 0.08)' },
  { id: 'water', label: 'Agua', n: 1.33, tint: 'rgba(41, 121, 255, 0.14)' },
  { id: 'glass', label: 'Vidrio', n: 1.5, tint: 'rgba(100, 181, 246, 0.18)' },
  { id: 'diamond', label: 'Diamante', n: 2.42, tint: 'rgba(186, 104, 200, 0.16)' }
];

const PRESETS = [
  { id: 'air-water', label: 'Aire → agua', n1: 1.0, n2: 1.33, angle: 40 },
  { id: 'air-glass', label: 'Aire → vidrio', n1: 1.0, n2: 1.5, angle: 35 },
  { id: 'water-air', label: 'Agua → aire', n1: 1.33, n2: 1.0, angle: 40 },
  { id: 'glass-air', label: 'Vidrio → aire', n1: 1.5, n2: 1.0, angle: 50 },
  { id: 'diamond-air', label: 'Diamante → aire', n1: 2.42, n2: 1.0, angle: 30 }
];

const params = {
  angle: 40,
  n1: 1.0,
  n2: 1.33
};

/** @type {ReturnType<typeof computeOptics>|null} */
let lastOptics = null;

function materialFor(n) {
  let best = MATERIALS[0];
  let d = Infinity;
  for (const m of MATERIALS) {
    const dd = Math.abs(m.n - n);
    if (dd < d) {
      d = dd;
      best = m;
    }
  }
  // Si no coincide casi exacto, genérico
  if (d > 0.08) {
    return { id: 'custom', label: `n = ${roundTo(n, 2)}`, n, tint: 'rgba(158, 158, 158, 0.12)' };
  }
  return best;
}

/**
 * Geometría estándar:
 * - Interfaz horizontal y = 0
 * - Medio 1 arriba (y > 0), medio 2 abajo (y < 0)
 * - Normal vertical (+y)
 * - θ medido desde la normal
 */
function computeOptics() {
  const theta1 = Math.max(0, Math.min(89.5, params.angle));
  const n1 = Math.max(1, params.n1);
  const n2 = Math.max(1, params.n2);
  const th1 = toRad(theta1);

  const hit = new Vector2D(0, 0);
  const L = 6.2;

  // Incidente: desde arriba-izquierda hacia el punto de impacto
  const incidentDir = new Vector2D(Math.sin(th1), -Math.cos(th1));
  const incidentStart = hit.subtract(incidentDir.scale(L));

  // Reflejado: espejo respecto a la normal → (sin θ, +cos θ)
  const reflectedDir = new Vector2D(Math.sin(th1), Math.cos(th1));
  const reflectedEnd = hit.add(reflectedDir.scale(L));

  let criticalDeg = null;
  if (n1 > n2) {
    criticalDeg = toDeg(Math.asin(n2 / n1));
  }

  const sin2 = (n1 / n2) * Math.sin(th1);
  let isTIR = false;
  let theta2Deg = null;
  let refractedEnd = null;

  if (sin2 > 1 + 1e-9) {
    isTIR = true;
  } else {
    const th2 = Math.asin(Math.min(1, Math.max(-1, sin2)));
    theta2Deg = toDeg(th2);
    const refractedDir = new Vector2D(Math.sin(th2), -Math.cos(th2));
    refractedEnd = hit.add(refractedDir.scale(L));
  }

  return {
    theta1,
    theta2Deg,
    n1,
    n2,
    hit,
    incidentStart,
    reflectedEnd,
    refractedEnd,
    isTIR,
    criticalDeg,
    m1: materialFor(n1),
    m2: materialFor(n2)
  };
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  isRunning = true;
  lastOptics = computeOptics();

  setModuleInfo(ui, {
    title: meta?.title || 'Luz y óptica geométrica',
    blurb:
      meta?.blurb ||
      'La luz como rayos: al chocar con una frontera se refleja y, si puede, se refracta (cambia de dirección).',
    story:
      'Óptica geométrica = dibujar rayos (no ondas con interferencia). Snell: n₁ sen θ₁ = n₂ sen θ₂. Si vas de un medio “denso” a uno “raro” con mucho ángulo, el rayo no sale: reflexión total interna (fibra óptica).',
    cases: [
      'Espejo: el rayo rebota con el mismo ángulo (θi = θr).',
      'Lápiz en un vaso: el rayo se “quiebra” al pasar aire ↔ agua.',
      'Fibra óptica: luz atrapada por reflexión total interna.'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      {
        name: 'Reflexión',
        formula: 'θ<sub>i</sub> = θ<sub>r</sub>',
        note: 'Ángulos medidos desde la normal (línea punteada vertical).'
      },
      {
        name: 'Ley de Snell',
        formula: 'n₁ · sen θ₁ = n₂ · sen θ₂',
        note: 'n grande = medio ópticamente más denso (la luz “va más lenta”).'
      },
      {
        name: 'Ángulo crítico',
        formula: 'θ<sub>c</sub> = arcsen(n₂ / n₁)',
        note: 'Solo si n₁ > n₂. Si θ₁ ≥ θc → reflexión total interna.'
      }
    ]
  });
  clearChallenges(ui);
  renderParams();
  updateDataPanel();
}

export function destroy() {
  isRunning = false;
  _engine = _renderer = _ui = null;
  lastOptics = null;
}

export function reset(engine) {
  params.angle = 40;
  params.n1 = 1.0;
  params.n2 = 1.33;
  lastOptics = computeOptics();
  engine?.reset?.();
  renderParams();
  updateDataPanel();
}

export function setTool() {}

export function update() {
  if (!isRunning) return;
  lastOptics = computeOptics();
  updateDataPanel();
}

function drawArrow(ctx, from, to, color, width = 2.5) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ah = 11;
  const aw = 6;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x - ux * ah * 0.6, to.y - uy * ah * 0.6);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ux * ah - uy * aw, to.y - uy * ah + ux * aw);
  ctx.lineTo(to.x - ux * ah + uy * aw, to.y - uy * ah - ux * aw);
  ctx.closePath();
  ctx.fill();
}

function drawAngleArc(ctx, cx, cy, radius, fromA, toA, color, label) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, fromA, toA, fromA > toA);
  ctx.stroke();

  const mid = (fromA + toA) / 2;
  const lx = cx + Math.cos(mid) * (radius + 14);
  const ly = cy + Math.sin(mid) * (radius + 14);
  ctx.globalAlpha = 1;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(12, 15, 20, 0.72)';
  ctx.fillRect(lx - tw / 2 - 5, ly - 9, tw + 10, 18);
  ctx.fillStyle = color;
  ctx.fillText(label, lx, ly);
  ctx.restore();
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  const o = lastOptics || computeOptics();
  const w = r.canvas.width;
  const h = r.canvas.height;

  const left = r.worldToCanvas(-10, 0);
  const right = r.worldToCanvas(10, 0);
  const top = r.worldToCanvas(0, 7);
  const bottom = r.worldToCanvas(0, -7);
  const interfaceY = left.y;

  // —— Medios (mitades de color) ——
  ctx.save();
  // Medio 1 (arriba)
  ctx.fillStyle = o.m1.tint;
  ctx.fillRect(0, 0, w, interfaceY);
  // Medio 2 (abajo)
  ctx.fillStyle = o.m2.tint;
  ctx.fillRect(0, interfaceY, w, h - interfaceY);

  // Interfaz
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, interfaceY);
  ctx.lineTo(w, interfaceY);
  ctx.stroke();

  // Etiquetas de medios
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const chip = (text, x, y, fill) => {
    const padX = 10;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(12, 15, 20, 0.55)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y - 12, tw + padX * 2, 24, 8);
      ctx.fill();
    } else {
      ctx.fillRect(x, y - 12, tw + padX * 2, 24);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x + padX, y);
  };
  chip(`Medio 1 · ${o.m1.label} · n₁ = ${roundTo(o.n1, 2)}`, 16, Math.max(28, interfaceY * 0.35), '#81d4fa');
  chip(`Medio 2 · ${o.m2.label} · n₂ = ${roundTo(o.n2, 2)}`, 16, Math.min(h - 28, interfaceY + (h - interfaceY) * 0.55), '#a5d6a7');

  const pHit = r.worldToCanvas(o.hit.x, o.hit.y);
  const pInc = r.worldToCanvas(o.incidentStart.x, o.incidentStart.y);
  const pRefl = r.worldToCanvas(o.reflectedEnd.x, o.reflectedEnd.y);

  // —— Normal (perpendicular a la interfaz) ——
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pHit.x, pHit.y - 90);
  ctx.lineTo(pHit.x, pHit.y + 90);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('normal', pHit.x + 8, pHit.y - 78);

  // Punto de impacto
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(pHit.x, pHit.y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // —— Rayos ——
  // Incidente
  drawArrow(ctx, pInc, pHit, '#4fc3f7', 3);

  // Reflejado
  ctx.save();
  if (o.isTIR) {
    drawArrow(ctx, pHit, pRefl, '#ff7043', 3);
  } else {
    ctx.globalAlpha = 0.75;
    ctx.setLineDash([7, 5]);
    drawArrow(ctx, pHit, pRefl, '#ffb74d', 2.2);
    ctx.setLineDash([]);
  }
  ctx.restore();

  // Refractado
  if (!o.isTIR && o.refractedEnd) {
    const pRefr = r.worldToCanvas(o.refractedEnd.x, o.refractedEnd.y);
    drawArrow(ctx, pHit, pRefr, '#66bb6a', 3);
  }

  // —— Arcos de ángulo (desde la normal) ——
  // En canvas, el eje Y crece hacia abajo; la normal “hacia arriba” es ángulo -π/2 en sentido canvas.
  // Incidente: desde normal hacia el rayo (lado izquierdo-arriba)
  const th1 = toRad(o.theta1);
  // Ángulo del rayo incidente en pantalla: atan2 de (pInc - pHit)
  const angInc = Math.atan2(pInc.y - pHit.y, pInc.x - pHit.x);
  const angNormalUp = -Math.PI / 2;
  drawAngleArc(
    ctx,
    pHit.x,
    pHit.y,
    38,
    angNormalUp,
    angInc,
    '#4fc3f7',
    `θ₁ ${roundTo(o.theta1, 0)}°`
  );

  if (!o.isTIR && o.theta2Deg != null && o.refractedEnd) {
    const pRefr = r.worldToCanvas(o.refractedEnd.x, o.refractedEnd.y);
    const angRefr = Math.atan2(pRefr.y - pHit.y, pRefr.x - pHit.x);
    const angNormalDown = Math.PI / 2;
    drawAngleArc(
      ctx,
      pHit.x,
      pHit.y,
      38,
      angNormalDown,
      angRefr,
      '#66bb6a',
      `θ₂ ${roundTo(o.theta2Deg, 1)}°`
    );
  }

  // —— Banner de estado ——
  const banner = o.isTIR
    ? {
        text: 'Reflexión total interna — el rayo no entra al medio 2',
        bg: 'rgba(239, 83, 80, 0.92)',
        fg: '#fff'
      }
    : {
        text: 'Refracción activa — el rayo se desvía al cambiar de medio',
        bg: 'rgba(46, 125, 50, 0.88)',
        fg: '#e8f5e9'
      };
  if (o.isTIR && o.criticalDeg != null) {
    banner.text += `  ·  θc ≈ ${roundTo(o.criticalDeg, 1)}°`;
  }

  ctx.font = '600 13px system-ui, sans-serif';
  const bw = Math.min(w - 24, ctx.measureText(banner.text).width + 28);
  const bx = (w - bw) / 2;
  const by = h - 42;
  ctx.fillStyle = banner.bg;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(bx, by, bw, 30, 10);
    ctx.fill();
  } else {
    ctx.fillRect(bx, by, bw, 30);
  }
  ctx.fillStyle = banner.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(banner.text, w / 2, by + 15);

  // —— Leyenda ——
  const legend = [
    { c: '#4fc3f7', t: 'Incidente' },
    { c: o.isTIR ? '#ff7043' : '#ffb74d', t: o.isTIR ? 'Reflejado (total)' : 'Reflejado' },
    { c: '#66bb6a', t: 'Refractado', hide: o.isTIR }
  ].filter((x) => !x.hide);

  let lx = w - 16;
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

function updateDataPanel() {
  if (!_ui) return;
  const o = lastOptics || computeOptics();
  const rows = [
    ['Ángulo de incidencia θ₁', `${roundTo(o.theta1, 1)}°`],
    ['Ángulo reflejado θr', `${roundTo(o.theta1, 1)}°  (= θ₁)`],
    [
      'Ángulo refractado θ₂',
      o.isTIR ? '— (no hay refracción)' : `${roundTo(o.theta2Deg, 2)}°`
    ],
    ['n₁ · sen θ₁', `${roundTo(o.n1 * Math.sin(toRad(o.theta1)), 4)}`],
    [
      'n₂ · sen θ₂',
      o.isTIR ? '—' : `${roundTo(o.n2 * Math.sin(toRad(o.theta2Deg)), 4)}`
    ],
    [
      'Ángulo crítico θc',
      o.criticalDeg != null ? `${roundTo(o.criticalDeg, 2)}°` : 'No aplica (n₁ ≤ n₂)'
    ],
    ['Estado', o.isTIR ? 'Reflexión total interna' : 'Hay rayo refractado']
  ];

  _ui.setData(`
    <div class="optics-data">
      <p class="tab-text optics-data-lead">
        ${
          o.isTIR
            ? 'El rayo intenta pasar a un medio menos denso con un ángulo demasiado grande: <strong>rebota por completo</strong>.'
            : 'Parte de la luz se <strong>refleja</strong> y parte se <strong>refracta</strong> (cambia de dirección al entrar al medio 2).'
        }
      </p>
      <table class="optics-table">
        <tbody>
          ${rows
            .map(
              ([k, v]) => `
            <tr>
              <th>${k}</th>
              <td>${v}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `);
}

function applyPreset(presetId) {
  const p = PRESETS.find((x) => x.id === presetId);
  if (!p) return;
  params.n1 = p.n1;
  params.n2 = p.n2;
  params.angle = p.angle;
  lastOptics = computeOptics();
  renderParams();
  updateDataPanel();
}

function renderParams() {
  if (!_ui) return;
  const o = lastOptics || computeOptics();
  const critHint =
    o.criticalDeg != null
      ? `<p class="optics-hint">Con n₁ &gt; n₂ el ángulo crítico es <strong>θc ≈ ${roundTo(o.criticalDeg, 1)}°</strong>. Si subes θ₁ por encima, verás reflexión total.</p>`
      : `<p class="optics-hint">Aquí n₁ ≤ n₂: la luz siempre puede refractarse (no hay ángulo crítico).</p>`;

  _ui.setParams(`
    <div class="optics-params">
      <p class="optics-guide">
        <strong>Cómo leer el dibujo</strong><br>
        Azul = rayo que llega · Naranja = rebote · Verde = se mete al otro medio · Línea vertical = normal
      </p>

      <div class="optics-presets" role="group" aria-label="Ejemplos">
        ${PRESETS.map(
          (p) => `
          <button type="button" class="optics-preset-btn" data-preset="${p.id}">
            ${p.label}
          </button>`
        ).join('')}
      </div>

      ${paramControl({
        id: 'angle',
        labelTex: '\\theta_1',
        labelRest: 'ángulo de incidencia (desde la normal)',
        min: 0,
        max: 89,
        step: 1,
        value: params.angle,
        unit: '°'
      })}
      ${paramControl({
        id: 'n1',
        labelTex: 'n_1',
        labelRest: `índice (arriba · ${o.m1.label})`,
        min: 1,
        max: 2.5,
        step: 0.01,
        value: params.n1
      })}
      ${paramControl({
        id: 'n2',
        labelTex: 'n_2',
        labelRest: `índice (abajo · ${o.m2.label})`,
        min: 1,
        max: 2.5,
        step: 0.01,
        value: params.n2
      })}

      ${critHint}

      <div class="optics-status ${o.isTIR ? 'is-tir' : 'is-ok'}">
        ${
          o.isTIR
            ? '⚡ Reflexión total interna'
            : `✓ Refracta · θ₂ ≈ ${roundTo(o.theta2Deg, 1)}°`
        }
      </div>
    </div>
  `);

  setTimeout(() => {
    bindParamControls(['angle', 'n1', 'n2'], (id, value) => {
      params[id] = value;
      lastOptics = computeOptics();
      updateDataPanel();
      // refrescar etiquetas de material / estado sin reescribir todo el panel si no hace falta
      const status = document.querySelector('.optics-status');
      if (status) {
        const o2 = lastOptics;
        status.className = 'optics-status ' + (o2.isTIR ? 'is-tir' : 'is-ok');
        status.textContent = o2.isTIR
          ? '⚡ Reflexión total interna'
          : `✓ Refracta · θ₂ ≈ ${roundTo(o2.theta2Deg, 1)}°`;
      }
    });

    document.querySelectorAll('.optics-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
  }, 0);
}

export function getState() {
  return { params: { ...params } };
}

export function setState(s) {
  if (!s?.params) return;
  Object.assign(params, s.params);
  lastOptics = computeOptics();
  renderParams();
  updateDataPanel();
}
