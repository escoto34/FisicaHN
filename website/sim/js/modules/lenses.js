/**
 * Lentes delgadas: diagrama de rayos (convergente / divergente).
 * Complementa óptica geométrica de interfaz plana (Snell).
 */

import { roundTo } from '../utils/math-helpers.js';
import {
  setModuleInfo,
  setModuleFormulas,
  clearChallenges
} from '../module-ui.js';

let _engine, _renderer, _ui;

const params = {
  tipo: 'convergente', // convergente | divergente
  f: 2.5,
  do_: 5,
  ho: 1.5
};

function image() {
  const f = params.tipo === 'convergente' ? params.f : -params.f;
  const d0 = params.do_;
  if (Math.abs(d0 - f) < 1e-6) {
    return { di: Infinity, M: Infinity, hi: Infinity, real: false };
  }
  const di = 1 / (1 / f - 1 / d0);
  const M = -di / d0;
  const hi = M * params.ho;
  return { di, M, hi, real: di > 0, f };
}

export function init(engine, renderer, ui, meta = null) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  renderer?.resetCamera?.();
  setModuleInfo(ui, {
    title: meta?.title || 'Lentes delgadas',
    blurb:
      meta?.blurb ||
      'Ecuación de lentes 1/f = 1/d₀ + 1/dᵢ y rayos principales (objeto → imagen).',
    story:
      'Las lentes delgadas concentran o dispersan rayos. El signo de f distingue convergente (+) y divergente (−) en convención cartesiana habitual.',
    cases: [
      'Lupa (objeto dentro del foco → imagen virtual ampliada).',
      'Proyector (objeto fuera de 2f → imagen real invertida).',
      'Gafas para miopía (lente divergente).'
    ]
  });
  setModuleFormulas(ui, {
    items: [
      { name: 'Lente delgada', formula: '1/f = 1/d₀ + 1/dᵢ' },
      { name: 'Aumento lateral', formula: 'M = hᵢ/h₀ = −dᵢ/d₀' },
      { name: 'Potencia (dioptrías)', formula: 'P = 1/f', note: 'f en metros en la fórmula SI.' }
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
  engine?.reset?.();
  updateData();
}
export function setTool() {}
export function update() {
  updateData();
}

function updateData() {
  const im = image();
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div>tipo = ${params.tipo} · f = ${params.tipo === 'divergente' ? -params.f : params.f} (signo)</div>
      <div>d₀ = ${params.do_} · h₀ = ${params.ho}</div>
      <div>dᵢ = ${Number.isFinite(im.di) ? roundTo(im.di, 3) : '∞'}</div>
      <div>M = ${Number.isFinite(im.M) ? roundTo(im.M, 3) : '∞'} · hᵢ = ${Number.isFinite(im.hi) ? roundTo(im.hi, 3) : '∞'}</div>
      <div>${!Number.isFinite(im.di) ? 'Rayos salen paralelos (objeto en F)' : im.real ? 'Imagen REAL (invertida si M&lt;0)' : 'Imagen VIRTUAL'}</div>
    </div>
  `);
}

export function render(ctx) {
  if (!_renderer) return;
  const r = _renderer;
  const im = image();
  const fSigned = params.tipo === 'convergente' ? params.f : -params.f;

  // optical axis
  const a = r.worldToCanvas(-9, 0);
  const b = r.worldToCanvas(9, 0);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // lens at x=0
  const top = r.worldToCanvas(0, 3.2);
  const bot = r.worldToCanvas(0, -3.2);
  ctx.save();
  ctx.strokeStyle = '#90caf9';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (params.tipo === 'convergente') {
    ctx.moveTo(top.x - 8, top.y);
    ctx.quadraticCurveTo(top.x + 14, (top.y + bot.y) / 2, bot.x - 8, bot.y);
    ctx.moveTo(top.x + 8, top.y);
    ctx.quadraticCurveTo(top.x - 14, (top.y + bot.y) / 2, bot.x + 8, bot.y);
  } else {
    ctx.moveTo(top.x + 10, top.y);
    ctx.quadraticCurveTo(top.x - 6, (top.y + bot.y) / 2, bot.x + 10, bot.y);
    ctx.moveTo(top.x - 10, top.y);
    ctx.quadraticCurveTo(top.x + 6, (top.y + bot.y) / 2, bot.x - 10, bot.y);
  }
  ctx.stroke();
  ctx.restore();

  // foci
  r.drawObject(fSigned, 0, { shape: 'circle', size: 0.12, color: '#ffb74d', label: 'F' });
  r.drawObject(-fSigned, 0, { shape: 'circle', size: 0.12, color: '#ffb74d', label: "F'" });

  // object at x = -do
  const ox = -params.do_;
  const oy = params.ho;
  const oBase = r.worldToCanvas(ox, 0);
  const oTip = r.worldToCanvas(ox, oy);
  ctx.save();
  ctx.strokeStyle = '#4fc3f7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(oBase.x, oBase.y);
  ctx.lineTo(oTip.x, oTip.y);
  ctx.stroke();
  // arrow head
  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.moveTo(oTip.x, oTip.y);
  ctx.lineTo(oTip.x - 5, oTip.y + 10);
  ctx.lineTo(oTip.x + 5, oTip.y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // principal rays
  const drawRay = (x0, y0, x1, y1, color, dash = false) => {
    const p0 = r.worldToCanvas(x0, y0);
    const p1 = r.worldToCanvas(x1, y1);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    if (dash) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  };

  // Ray 1: parallel to axis → through F (conv) or from F (div)
  drawRay(ox, oy, 0, oy, 'rgba(102,187,106,0.9)');
  if (params.tipo === 'convergente') {
    drawRay(0, oy, fSigned * 3, 0, 'rgba(102,187,106,0.9)');
  } else {
    // emerges as if from F' on left
    drawRay(0, oy, 6, oy + ((oy - 0) * 6) / Math.abs(fSigned), 'rgba(102,187,106,0.9)');
    drawRay(0, oy, fSigned, 0, 'rgba(102,187,106,0.35)', true);
  }

  // Ray 2: through optical center
  drawRay(ox, oy, 0, 0, 'rgba(206,147,216,0.9)');
  if (Number.isFinite(im.di) && Math.abs(im.di) < 20) {
    drawRay(0, 0, im.di, im.hi, 'rgba(206,147,216,0.9)');
  } else {
    drawRay(0, 0, 6, (oy / ox) * 6, 'rgba(206,147,216,0.9)');
  }

  // image
  if (Number.isFinite(im.di) && Math.abs(im.di) < 12 && Number.isFinite(im.hi)) {
    const ix = im.di;
    const iy = im.hi;
    const iBase = r.worldToCanvas(ix, 0);
    const iTip = r.worldToCanvas(ix, iy);
    ctx.save();
    ctx.strokeStyle = im.real ? '#ff9800' : 'rgba(255,152,0,0.7)';
    ctx.lineWidth = 3;
    if (!im.real) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(iBase.x, iBase.y);
    ctx.lineTo(iTip.x, iTip.y);
    ctx.stroke();
    ctx.restore();
  }
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Tipo de lente</label>
      <select id="ln_tipo" class="custom-select" style="width:100%;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px">
        <option value="convergente" ${params.tipo === 'convergente' ? 'selected' : ''}>Convergente (+f)</option>
        <option value="divergente" ${params.tipo === 'divergente' ? 'selected' : ''}>Divergente (−f)</option>
      </select>
    </div>
    <div class="control-group"><label class="control-label">$|f|$ (u)</label>
      <div class="slider-row"><input type="range" id="ln_f" class="custom-slider" min="1" max="6" step="0.1" value="${params.f}"><span id="ln_fd">${params.f}</span></div></div>
    <div class="control-group"><label class="control-label">$$d_0$$ (u)</label>
      <div class="slider-row"><input type="range" id="ln_do" class="custom-slider" min="1.2" max="10" step="0.1" value="${params.do_}"><span id="ln_dod">${params.do_}</span></div></div>
    <div class="control-group"><label class="control-label">$$h_0$$ (u)</label>
      <div class="slider-row"><input type="range" id="ln_ho" class="custom-slider" min="0.4" max="3" step="0.1" value="${params.ho}"><span id="ln_hod">${params.ho}</span></div></div>
  `);
  setTimeout(() => {
    document.getElementById('ln_tipo')?.addEventListener('change', (e) => {
      params.tipo = e.target.value;
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
    bind('ln_f', 'f', 'ln_fd');
    bind('ln_do', 'do_', 'ln_dod');
    bind('ln_ho', 'ho', 'ln_hod');
  }, 0);
}

export function getState() {
  return { params: { ...params } };
}
export function setState(s) {
  if (!s || typeof s !== 'object') return;
  if (s.params) Object.assign(params, s.params);
  renderParams();
  updateData();
}
