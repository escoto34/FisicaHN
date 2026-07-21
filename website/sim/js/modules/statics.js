/**
 * Estática — equilibrio de una partícula (ΣF = 0).
 * Masa colgada de dos cuerdas con ángulos ajustables: T1, T2 y peso.
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
/** Oscilación visual si está desequilibrado (no es dinámica completa). */
let wobble = 0;
let unbalanced = false;

const params = {
  m: 3,
  theta1: 40, // ángulo de la cuerda izquierda con la horizontal (°)
  theta2: 50, // ángulo de la cuerda derecha con la horizontal (°)
  g: 9.81
};

/**
 * Tensiones en equilibrio horizontal y vertical:
 * T1 cos θ1 = T2 cos θ2
 * T1 sin θ1 + T2 sin θ2 = mg
 */
function solveTensions() {
  const th1 = (params.theta1 * Math.PI) / 180;
  const th2 = (params.theta2 * Math.PI) / 180;
  const c1 = Math.cos(th1);
  const s1 = Math.sin(th1);
  const c2 = Math.cos(th2);
  const s2 = Math.sin(th2);
  const W = params.m * params.g;

  // Matriz: [c1  -c2] [T1] = [0]
  //         [s1   s2] [T2]   [W]
  const det = c1 * s2 + c2 * s1;
  if (Math.abs(det) < 1e-9) {
    return { T1: NaN, T2: NaN, ok: false, W, th1, th2 };
  }
  const T1 = (W * c2) / det;
  const T2 = (W * c1) / det;
  const ok = T1 > 0 && T2 > 0 && params.theta1 > 5 && params.theta2 > 5;
  return { T1, T2, ok, W, th1, th2, det };
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  t = 0;
  wobble = 0;
  renderer?.resetCamera?.();

  setModuleInfo(ui, {
    title: meta?.title || 'Estática',
    blurb:
      meta?.blurb ||
      'Equilibrio de fuerzas: una masa colgada de dos cuerdas. ΣFₓ = 0 y ΣFᵧ = 0.',
    story:
      'La estática estudia cuerpos en reposo (o velocidad constante) bajo fuerzas equilibradas. ' +
      'Para una partícula: la suma vectorial de fuerzas es cero. Aquí una lámpara o letrero ' +
      'cuelga de dos cables: las tensiones horizontales se cancelan y las verticales sostienen el peso.',
    cases: [
      'Letrero de tienda colgado de dos cables en la fachada.',
      'Hamaca o tirolina con un peso en el centro.',
      'Puente colgante: cables principales en equilibrio con el tablero.'
    ]
  });

  setModuleFormulas(ui, {
    items: [
      { name: 'Equilibrio', formula: '\\sum \\vec F = 0' },
      { name: 'Componentes', formula: '\\sum F_x = 0,\\quad \\sum F_y = 0' },
      {
        name: 'Horizontal',
        formula: 'T_1\\cos\\theta_1 = T_2\\cos\\theta_2'
      },
      {
        name: 'Vertical',
        formula: 'T_1\\sin\\theta_1 + T_2\\sin\\theta_2 = mg'
      }
    ]
  });
  clearChallenges(ui);
  renderParams();
  updateData();
}

export function destroy() {
  _engine = _renderer = _ui = null;
}

export function reset(engine) {
  t = 0;
  wobble = 0;
  engine?.reset?.();
  updateData();
}

export function setTool() {}

export function update(dt) {
  t += dt;
  const sol = solveTensions();
  unbalanced = !sol.ok;
  if (unbalanced) {
    wobble += dt * 6;
  } else {
    wobble *= 0.9;
  }
  updateData();
}

function updateData() {
  if (!_ui) return;
  const sol = solveTensions();
  if (!sol.ok) {
    _ui.setData(`
      <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.75">
        <div style="color:#ef9a9a"><strong>Sin equilibrio estable</strong> con estos ángulos
        (cuerdas demasiado planas o configuración inválida).</div>
        <div>mg = ${roundTo(sol.W, 2)} N</div>
        <div>θ₁ = ${params.theta1}° · θ₂ = ${params.theta2}°</div>
      </div>
    `);
    return;
  }
  const Fx1 = sol.T1 * Math.cos(sol.th1);
  const Fy1 = sol.T1 * Math.sin(sol.th1);
  const Fx2 = sol.T2 * Math.cos(sol.th2);
  const Fy2 = sol.T2 * Math.sin(sol.th2);
  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.75">
      <div style="color:#a5d6a7"><strong>Equilibrio</strong> · ΣF ≈ 0</div>
      <div>m = ${params.m} kg · mg = ${roundTo(sol.W, 2)} N</div>
      <div>T₁ = ${roundTo(sol.T1, 2)} N · θ₁ = ${params.theta1}°</div>
      <div>T₂ = ${roundTo(sol.T2, 2)} N · θ₂ = ${params.theta2}°</div>
      <div>ΣF<sub>x</sub> = ${roundTo(Fx1 - Fx2, 3)} N</div>
      <div>ΣF<sub>y</sub> = ${roundTo(Fy1 + Fy2 - sol.W, 3)} N</div>
    </div>
  `);
}

/** Anclajes fijos y posición de la masa. */
function layout() {
  const left = { x: -5.5, y: 3.2 };
  const right = { x: 5.5, y: 3.2 };
  // La masa cuelga; altura según ángulos (intersección geométrica simple)
  const th1 = (params.theta1 * Math.PI) / 180;
  const th2 = (params.theta2 * Math.PI) / 180;
  // Aproximación: span total L, posición horizontal por equilibrio de cosenos
  const span = right.x - left.x;
  const sol = solveTensions();
  let mx;
  if (sol.ok) {
    // proporción de distancias horizontales ∝ T cos / o simple: d1/(d1+d2)
    const d1 = Math.cos(th1);
    const d2 = Math.cos(th2);
    // better: horizontal distances from force balance ratio T1 cos = T2 cos already
    // geometric: mass lower; place at weighted center
    const w1 = Math.cos(th2);
    const w2 = Math.cos(th1);
    mx = left.x + (span * w1) / (w1 + w2);
  } else {
    mx = 0;
  }
  // altura: desde anclajes con pendientes
  const drop1 = Math.tan(th1) > 0.05 ? (mx - left.x) * Math.tan(th1) : 2;
  const drop2 = Math.tan(th2) > 0.05 ? (right.x - mx) * Math.tan(th2) : 2;
  // usar promedio de caídas para un nudo único
  const my = left.y - Math.min(drop1, drop2, 4.5);
  const shake = unbalanced ? Math.sin(wobble) * 0.12 : 0;
  return {
    left,
    right,
    mass: { x: mx + shake, y: Math.max(my, -1.5) + (unbalanced ? Math.cos(wobble * 1.3) * 0.05 : 0) },
    sol
  };
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  const L = layout();
  const { left, right, mass, sol } = L;

  // techo / viga
  const roofA = r.worldToCanvas(-6.5, 3.35);
  const roofB = r.worldToCanvas(6.5, 3.35);
  ctx.save();
  ctx.fillStyle = 'rgba(100, 120, 140, 0.45)';
  ctx.fillRect(roofA.x, roofA.y - 18, roofB.x - roofA.x, 22);
  ctx.strokeStyle = 'rgba(200,210,220,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(roofA.x, roofA.y - 18, roofB.x - roofA.x, 22);

  // anclajes
  const drawAnchor = (p) => {
    const c = r.worldToCanvas(p.x, p.y);
    ctx.fillStyle = '#78909c';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  drawAnchor(left);
  drawAnchor(right);

  // cuerdas
  const mC = r.worldToCanvas(mass.x, mass.y);
  const lC = r.worldToCanvas(left.x, left.y);
  const rC = r.worldToCanvas(right.x, right.y);
  ctx.strokeStyle = unbalanced ? 'rgba(239,83,80,0.85)' : 'rgba(224,224,224,0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(lC.x, lC.y);
  ctx.lineTo(mC.x, mC.y);
  ctx.lineTo(rC.x, rC.y);
  ctx.stroke();

  // masa (esfera + etiqueta)
  const size = 0.28 + params.m * 0.04;
  r.drawObject(mass.x, mass.y, {
    shape: 'circle',
    size: Math.min(size, 0.7),
    color: unbalanced ? '#ef5350' : '#4fc3f7',
    label: `${params.m} kg`
  });

  // vectores en el nudo (fuerzas sobre la masa)
  if (sol.ok) {
    const sc = 0.08;
    // T1 hacia ancla izq
    const dx1 = left.x - mass.x;
    const dy1 = left.y - mass.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    r.drawVector(mass.x, mass.y, (dx1 / len1) * sol.T1 * sc, (dy1 / len1) * sol.T1 * sc, {
      color: '#66bb6a',
      width: 2.5,
      label: `T₁=${roundTo(sol.T1, 1)} N`,
      labelSide: 1
    });
    const dx2 = right.x - mass.x;
    const dy2 = right.y - mass.y;
    const len2 = Math.hypot(dx2, dy2) || 1;
    r.drawVector(mass.x, mass.y, (dx2 / len2) * sol.T2 * sc, (dy2 / len2) * sol.T2 * sc, {
      color: '#ab47bc',
      width: 2.5,
      label: `T₂=${roundTo(sol.T2, 1)} N`,
      labelSide: -1
    });
    r.drawVector(mass.x, mass.y, 0, -sol.W * sc, {
      color: '#ffb74d',
      width: 2.5,
      label: `mg=${roundTo(sol.W, 1)} N`,
      labelSide: 1
    });
  }

  // ángulos anotados
  ctx.font = '12px system-ui,sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.textAlign = 'left';
  ctx.fillText(`θ₁ = ${params.theta1}°`, lC.x + 8, lC.y + 28);
  ctx.textAlign = 'right';
  ctx.fillText(`θ₂ = ${params.theta2}°`, rC.x - 8, rC.y + 28);

  // HUD
  ctx.textAlign = 'left';
  ctx.fillStyle = unbalanced ? '#ef9a9a' : '#a5d6a7';
  ctx.fillText(
    unbalanced ? 'Configuración inestable — sube los ángulos' : 'ΣF = 0 · equilibrio estático',
    12,
    14
  );
  if (sol.ok) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(
      `T₁=${roundTo(sol.T1, 1)} N  T₂=${roundTo(sol.T2, 1)} N  mg=${roundTo(sol.W, 1)} N`,
      12,
      32
    );
  }
  ctx.restore();
}

function renderParams() {
  if (!_ui) return;
  _ui.setParams(`
    ${paramControl({ id: 'm', labelTex: 'm', labelRest: 'masa', min: 0.5, max: 20, step: 0.5, value: params.m, unit: 'kg' })}
    ${paramControl({ id: 'theta1', labelTex: '\\theta_1', labelRest: 'cuerda izq.', min: 15, max: 80, step: 1, value: params.theta1, unit: '°' })}
    ${paramControl({ id: 'theta2', labelTex: '\\theta_2', labelRest: 'cuerda der.', min: 15, max: 80, step: 1, value: params.theta2, unit: '°' })}
    <p class="tab-text" style="opacity:0.7;font-size:0.8rem;margin-top:0.5rem">
      Ángulos medidos respecto a la horizontal. Si una cuerda queda casi horizontal, la tensión crece mucho.
    </p>
  `);
  setTimeout(() => {
    bindParamControls(['m', 'theta1', 'theta2'], (id, val) => {
      params[id] = val;
      updateData();
    });
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
  updateData();
}
