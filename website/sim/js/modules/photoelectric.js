/**
 * Efecto fotoeléctrico: umbral de frecuencia, Kmax = hf − φ.
 * Visual: fotones chocan con la superficie del metal; gráfica K_max vs f
 * con caja acotada (marcador naranja y recta no salen del área).
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
/** Fotones animados que viajan hasta la superficie del metal. */
let photons = [];

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

/** Superficie del metal (cara derecha de la placa) en coords mundo. */
const METAL = {
  left: -3.4,
  right: -1.7, // superficie iluminada
  top: 2.2,
  bottom: -2.2
};

/** Dominio de la gráfica embebida (coincide con sliders). */
const GRAPH = {
  // mundo: esquina inferior-izquierda y tamaño del área de dibujo
  x0: 1.0,
  y0: -3.35,
  w: 5.4,
  h: 3.1,
  fMin: 0,
  fMax: 15, // igual que el slider de f
  kMin: 0,
  kMax: 6.5 // cubre hf_max − φ_min ≈ 0.414*15 − 1
};

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
      'Einstein explicó el efecto fotoeléctrico con cuantos de luz. La intensidad cambia el número de electrones, no K_max. Los fotones se absorben en la superficie del metal (no la atraviesan).',
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
  updateData();
}

function resetState() {
  t = 0;
  electrons = [];
  photons = [];
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

function photonE() {
  return H_EFF * params.f;
}

function kMax() {
  return photonE() - params.phi;
}

function f0() {
  return params.phi / H_EFF;
}

/** Mapea (f, K) del dominio de la gráfica → coords mundo (acotado al rectángulo). */
function graphToWorld(f, k) {
  const g = GRAPH;
  const fu = Math.max(g.fMin, Math.min(g.fMax, f));
  const ku = Math.max(g.kMin, Math.min(g.kMax, k));
  const nx = (fu - g.fMin) / (g.fMax - g.fMin);
  const ny = (ku - g.kMin) / (g.kMax - g.kMin);
  return {
    x: g.x0 + nx * g.w,
    y: g.y0 + ny * g.h,
    clamped: fu !== f || ku !== k
  };
}

export function update(dt) {
  t += dt;
  const E = photonE();
  const K = E - params.phi;
  const above = K > 0;

  // Spawn fotones (viajan hacia la superficie del metal)
  const photonRate = params.intensity * 10 * dt;
  if (Math.random() < photonRate) {
    photons.push({
      x: -7.2,
      y: (Math.random() - 0.5) * (METAL.top - METAL.bottom) * 0.85,
      vx: 4.2 + params.intensity * 1.5,
      life: 4,
      absorbed: false
    });
  }

  // Mover fotones; al tocar la superficie se absorben (no atraviesan la placa)
  for (const p of photons) {
    if (p.absorbed) {
      p.life -= dt * 3;
      continue;
    }
    p.x += p.vx * dt;
    if (p.x >= METAL.right - 0.05) {
      p.x = METAL.right - 0.05;
      p.absorbed = true;
      p.life = 0.25;
      // Emisión de e⁻ solo si hf > φ, desde la superficie
      if (above) {
        const speed = Math.sqrt(2 * Math.max(K, 0)) * 0.9;
        electrons.push({
          x: METAL.right + 0.08,
          y: p.y + (Math.random() - 0.5) * 0.15,
          vx: 1.2 + speed,
          vy: (Math.random() - 0.5) * 0.9,
          life: 2.5
        });
      }
    }
  }
  photons = photons.filter((p) => p.life > 0 && p.x < 8);

  for (const e of electrons) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.life -= dt;
    // No reentrar en el metal
    if (e.x < METAL.right) {
      e.x = METAL.right;
      e.vx = Math.abs(e.vx);
    }
  }
  electrons = electrons.filter(
    (e) => e.life > 0 && e.x < 8 && e.y < 5 && e.y > -5
  );
  updateData();
}

function updateData() {
  const E = photonE();
  const K = E - params.phi;
  const thr = f0();
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>metal ${params.metal} · φ = ${params.phi} eV</div>
      <div>f = ${params.f}×10¹⁴ Hz · hf ≈ ${roundTo(E, 2)} eV</div>
      <div>f₀ ≈ ${roundTo(thr, 2)}×10¹⁴ Hz</div>
      <div>K<sub>max</sub> = ${K > 0 ? roundTo(K, 2) + ' eV' : '0 (bajo umbral)'}</div>
      <div>${K > 0 ? 'Emisión activa (fotones se absorben en la superficie)' : 'Sin emisión: hf ≤ φ'}</div>
    </div>
  `);
}

function drawMetalPlate(ctx, r) {
  const tl = r.worldToCanvas(METAL.left, METAL.top);
  const br = r.worldToCanvas(METAL.right, METAL.bottom);
  const x = Math.min(tl.x, br.x);
  const y = Math.min(tl.y, br.y);
  const w = Math.abs(br.x - tl.x);
  const h = Math.abs(br.y - tl.y);

  ctx.save();
  // cuerpo del metal
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, '#546e7a');
  g.addColorStop(0.7, '#78909c');
  g.addColorStop(1, '#90a4ae');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  // superficie iluminada (cara derecha)
  ctx.strokeStyle = 'rgba(255, 236, 179, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();

  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#eceff1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(params.metal, x + w / 2, y + h / 2 - 8);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`φ = ${params.phi} eV`, x + w / 2, y + h / 2 + 10);

  // etiqueta superficie
  ctx.save();
  ctx.translate(x + w + 8, y + 14);
  ctx.fillStyle = 'rgba(255, 236, 179, 0.9)';
  ctx.textAlign = 'left';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('superficie', 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawGraph(ctx, r) {
  const g = GRAPH;
  const bl = r.worldToCanvas(g.x0, g.y0);
  const tr = r.worldToCanvas(g.x0 + g.w, g.y0 + g.h);
  const left = Math.min(bl.x, tr.x);
  const right = Math.max(bl.x, tr.x);
  const top = Math.min(bl.y, tr.y);
  const bottom = Math.max(bl.y, tr.y);
  const boxW = right - left;
  const boxH = bottom - top;

  ctx.save();

  // Fondo / caja de la gráfica
  ctx.fillStyle = 'rgba(12, 15, 20, 0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(left - 6, top - 6, boxW + 12, boxH + 22, 8);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(left - 6, top - 6, boxW + 12, boxH + 22);
    ctx.strokeRect(left - 6, top - 6, boxW + 12, boxH + 22);
  }

  // Clip estricto al interior de la gráfica (nada atraviesa el borde)
  ctx.beginPath();
  ctx.rect(left, top, boxW, boxH);
  ctx.clip();

  // Cuadrícula suave
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const yy = top + (boxH * i) / 4;
    const xx = left + (boxW * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.moveTo(xx, top);
    ctx.lineTo(xx, bottom);
    ctx.stroke();
  }

  // Ejes (borde inferior e izquierdo del área)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.moveTo(left, bottom);
  ctx.lineTo(left, top);
  ctx.stroke();

  // Recta K = h f − φ, dibujada solo dentro del dominio y recortada por clip
  const thr = f0();
  const fStart = Math.max(g.fMin, thr);
  const fEnd = g.fMax;
  if (fStart < fEnd) {
    const pA = graphToWorld(fStart, Math.max(0, H_EFF * fStart - params.phi));
    const pB = graphToWorld(fEnd, Math.max(0, H_EFF * fEnd - params.phi));
    const cA = r.worldToCanvas(pA.x, pA.y);
    const cB = r.worldToCanvas(pB.x, pB.y);
    ctx.strokeStyle = '#66bb6a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cA.x, cA.y);
    ctx.lineTo(cB.x, cB.y);
    ctx.stroke();
  }

  // Segmento bajo umbral (K=0) en el eje f
  if (thr > g.fMin) {
    const z0 = graphToWorld(g.fMin, 0);
    const z1 = graphToWorld(Math.min(thr, g.fMax), 0);
    const c0 = r.worldToCanvas(z0.x, z0.y);
    const c1 = r.worldToCanvas(z1.x, z1.y);
    ctx.strokeStyle = 'rgba(239, 154, 154, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.stroke();
  }

  // Marca vertical f₀ (si cae dentro del eje)
  if (thr >= g.fMin && thr <= g.fMax) {
    const t0 = graphToWorld(thr, 0);
    const t1 = graphToWorld(thr, g.kMax * 0.12);
    const ct0 = r.worldToCanvas(t0.x, t0.y);
    const ct1 = r.worldToCanvas(t1.x, t1.y);
    ctx.strokeStyle = 'rgba(255,183,77,0.7)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(ct0.x, ct0.y);
    ctx.lineTo(ct1.x, ct1.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Marcador naranja (f, K_max) — SIEMPRE dentro de la caja
  const K = kMax();
  const km = Math.max(0, K);
  const pm = graphToWorld(params.f, km);
  const cMark = r.worldToCanvas(pm.x, pm.y);
  ctx.fillStyle = '#ffb74d';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cMark.x, cMark.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Punto guía en el eje f (proyección) para leer f actual
  const pBase = graphToWorld(params.f, 0);
  const cBase = r.worldToCanvas(pBase.x, pBase.y);
  ctx.strokeStyle = 'rgba(255,183,77,0.45)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cMark.x, cMark.y);
  ctx.lineTo(cBase.x, cBase.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore(); // sale del clip

  // Etiquetas fuera del clip (no se cortan)
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('K_max vs f', left, bottom + 4);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'right';
  ctx.fillText('f →', right, bottom + 4);
  ctx.textAlign = 'left';
  ctx.save();
  ctx.translate(left - 4, top + 4);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('K →', 0, 0);
  ctx.restore();

  // Leyenda del punto
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#ffb74d';
  ctx.textAlign = 'left';
  const legend =
    km > 0
      ? `● f=${params.f} · K=${roundTo(km, 2)} eV`
      : `● f=${params.f} · bajo umbral (K=0)`;
  ctx.fillText(legend, left, top - 18);
  ctx.restore();
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  const E = photonE();
  const K = E - params.phi;
  const above = K > 0;
  const photonColor = above ? '#fff59d' : '#ef9a9a';

  // Metal (placa sólida — los fotones no la cruzan)
  drawMetalPlate(ctx, r);

  // Fotones
  for (const p of photons) {
    const alpha = p.absorbed ? Math.max(0, p.life / 0.25) : 1;
    const size = p.absorbed ? 0.08 + (1 - alpha) * 0.1 : 0.14;
    ctx.save();
    ctx.globalAlpha = alpha;
    r.drawObject(p.x, p.y, {
      shape: 'circle',
      size,
      color: photonColor,
      label: '',
      glow: !p.absorbed
    });
    ctx.restore();
  }

  // Electrones emitidos (solo a la derecha de la superficie)
  for (const e of electrons) {
    r.drawObject(e.x, e.y, {
      shape: 'circle',
      size: 0.16,
      color: '#4fc3f7',
      label: 'e⁻'
    });
  }

  // Gráfica acotada (caja + clip: el punto naranja y la recta no salen)
  drawGraph(ctx, r);
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
      updateData();
    });
    const bind = (id, key, d) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        params[key] = parseFloat(el.value);
        const disp = document.getElementById(d);
        if (disp) disp.textContent = String(params[key]);
        updateData();
      });
    };
    bind('ph_f', 'f', 'ph_fd');
    bind('ph_I', 'intensity', 'ph_Id');
    bind('ph_phi', 'phi', 'ph_phid');
  }, 0);
}

export function getState() {
  return {
    t,
    params: { ...params },
    electrons: electrons.map((e) => ({ ...e })),
    photons: photons.map((p) => ({ ...p }))
  };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  if (s.t != null) t = s.t;
  if (Array.isArray(s.electrons)) electrons = s.electrons;
  if (Array.isArray(s.photons)) photons = s.photons;
  else photons = [];
  renderParams();
  updateData();
}
