/**
 * Lentes delgadas: diagrama de rayos (convergente / divergente).
 * Visual de clase: lente reconocible, etiquetas O/I/F y leyenda de rayos.
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
    return { di: Infinity, M: Infinity, hi: Infinity, real: false, atFocus: true, f };
  }
  const di = 1 / (1 / f - 1 / d0);
  const M = -di / d0;
  const hi = M * params.ho;
  return { di, M, hi, real: di > 0, atFocus: false, f };
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
      'Formación de imagen con lente delgada: 1/f = 1/d₀ + 1/dᵢ y los tres rayos principales.',
    story:
      'La lente está en x = 0. El objeto (flecha azul) está a la izquierda. Los rayos se refractan en la lente y forman una imagen real (naranja, derecha) o virtual (discontinua, izquierda). Convergente concentra; divergente dispersa.',
    cases: [
      'Lupa: objeto entre lente y F → imagen virtual ampliada (mismo lado).',
      'Proyector: objeto fuera de 2F → imagen real invertida al otro lado.',
      'Miopía: lente divergente (f < 0) para alejar el foco.'
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
  const fSigned = params.tipo === 'convergente' ? params.f : -params.f;
  const tipoLabel = params.tipo === 'convergente' ? 'Convergente (+f)' : 'Divergente (−f)';
  const imgLabel = im.atFocus
    ? 'Sin imagen finita (objeto en F → rayos paralelos)'
    : im.real
      ? 'Imagen REAL (lado opuesto; invertida si M&lt;0)'
      : 'Imagen VIRTUAL (mismo lado; rayos prolongados)';
  _ui?.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
      <div><strong>${tipoLabel}</strong></div>
      <div>f = ${roundTo(fSigned, 2)} · |f| = ${roundTo(params.f, 2)}</div>
      <div>d₀ = ${roundTo(params.do_, 2)} · h₀ = ${roundTo(params.ho, 2)}</div>
      <div>dᵢ = ${Number.isFinite(im.di) ? roundTo(im.di, 3) : '∞'}</div>
      <div>M = ${Number.isFinite(im.M) ? roundTo(im.M, 3) : '∞'} · hᵢ = ${Number.isFinite(im.hi) ? roundTo(im.hi, 3) : '∞'}</div>
      <div style="margin-top:4px;color:var(--accent)">${imgLabel}</div>
    </div>
  `);
}

function drawArrowHead(ctx, fromX, fromY, toX, toY, size = 9) {
  const ang = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(ang - 0.4), toY - size * Math.sin(ang - 0.4));
  ctx.lineTo(toX - size * Math.cos(ang + 0.4), toY - size * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawRay(ctx, r, x0, y0, x1, y1, color, opts = {}) {
  const { dash = false, width = 2.2, arrow = true } = opts;
  const p0 = r.worldToCanvas(x0, y0);
  const p1 = r.worldToCanvas(x1, y1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
  if (arrow && !dash) drawArrowHead(ctx, p0.x, p0.y, p1.x, p1.y, 8);
  ctx.restore();
}

function drawVerticalArrow(ctx, r, x, y, color, label, dashed = false) {
  const base = r.worldToCanvas(x, 0);
  const tip = r.worldToCanvas(x, y);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3.2;
  if (dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // flecha en la punta
  const up = y >= 0;
  ctx.beginPath();
  if (up) {
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - 6, tip.y + 11);
    ctx.lineTo(tip.x + 6, tip.y + 11);
  } else {
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - 6, tip.y - 11);
    ctx.lineTo(tip.x + 6, tip.y - 11);
  }
  ctx.closePath();
  ctx.fill();
  // base pequeña
  ctx.beginPath();
  ctx.arc(base.x, base.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  if (label) {
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = y >= 0 ? 'bottom' : 'top';
    const ly = y >= 0 ? tip.y - 8 : tip.y + 8;
    ctx.fillStyle = 'rgba(12,15,20,0.65)';
    const tw = ctx.measureText(label).width;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(tip.x - tw / 2 - 6, ly - (y >= 0 ? 16 : 0), tw + 12, 18, 6);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.fillText(label, tip.x, ly + (y >= 0 ? -2 : 14));
  }
  ctx.restore();
}

function drawLensShape(ctx, r, tipo) {
  const top = r.worldToCanvas(0, 3.4);
  const bot = r.worldToCanvas(0, -3.4);
  const midY = (top.y + bot.y) / 2;
  const cx = top.x;
  const h = bot.y - top.y;

  ctx.save();
  ctx.beginPath();
  if (tipo === 'convergente') {
    // Biconvexa: gruesa en el centro (caras abombadas hacia fuera)
    ctx.moveTo(cx - 9, top.y);
    ctx.quadraticCurveTo(cx - 22, midY, cx - 9, bot.y);
    ctx.lineTo(cx + 9, bot.y);
    ctx.quadraticCurveTo(cx + 22, midY, cx + 9, top.y);
    ctx.closePath();
  } else {
    // Bicóncava: delgada en el centro (caras hundidas)
    ctx.moveTo(cx - 16, top.y);
    ctx.quadraticCurveTo(cx - 3, midY, cx - 16, bot.y);
    ctx.lineTo(cx + 16, bot.y);
    ctx.quadraticCurveTo(cx + 3, midY, cx + 16, top.y);
    ctx.closePath();
  }
  ctx.fillStyle = 'rgba(144, 202, 249, 0.22)';
  ctx.fill();
  ctx.strokeStyle = '#90caf9';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Marcas en extremos (estilo lente de libro)
  ctx.strokeStyle = 'rgba(144, 202, 249, 0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 14, top.y);
  ctx.lineTo(cx + 14, top.y);
  ctx.moveTo(cx - 14, bot.y);
  ctx.lineTo(cx + 14, bot.y);
  ctx.stroke();
  ctx.restore();

  return { cx, midY, top, bot, h };
}

function chip(ctx, text, x, y, fill) {
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const padX = 10;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(12, 15, 20, 0.6)';
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
  if (!_renderer) return;
  const r = _renderer;
  const im = image();
  const fSigned = params.tipo === 'convergente' ? params.f : -params.f;
  const conv = params.tipo === 'convergente';
  const w = ctx.canvas?.clientWidth || ctx.canvas?.width || 800;
  const h = ctx.canvas?.clientHeight || ctx.canvas?.height || 500;

  // Fondo sutil: zona objeto (izq) / imagen potencial (der)
  ctx.save();
  const origin = r.worldToCanvas(0, 0);
  ctx.fillStyle = 'rgba(79, 195, 247, 0.04)';
  ctx.fillRect(0, 0, origin.x, h);
  ctx.fillStyle = 'rgba(255, 152, 0, 0.04)';
  ctx.fillRect(origin.x, 0, w - origin.x, h);
  ctx.restore();

  // Eje óptico
  const a = r.worldToCanvas(-10, 0);
  const b = r.worldToCanvas(10, 0);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // flecha del eje (sentido de la luz)
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  drawArrowHead(ctx, b.x - 40, b.y, b.x - 4, b.y, 7);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('eje óptico →', a.x + 8, a.y + 8);
  ctx.restore();

  // Lente
  const lens = drawLensShape(ctx, r, params.tipo);
  chip(
    ctx,
    conv ? 'Lente CONVERGENTE (+f)' : 'Lente DIVERGENTE (−f)',
    lens.cx - 90,
    Math.max(22, lens.top.y - 28),
    conv ? '#81d4fa' : '#ce93d8'
  );

  // Focos F y F'
  const markFocus = (wx, label) => {
    const p = r.worldToCanvas(wx, 0);
    ctx.save();
    ctx.fillStyle = '#ffb74d';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 7);
    ctx.lineTo(p.x + 6, p.y);
    ctx.lineTo(p.x, p.y + 7);
    ctx.lineTo(p.x - 6, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillStyle = '#ffb74d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, p.x, p.y + 10);
    ctx.restore();
  };
  markFocus(fSigned, 'F');
  markFocus(-fSigned, "F'");

  // 2F (solo convergente, útil en clase)
  if (conv && Math.abs(2 * fSigned) < 11) {
    const p2 = r.worldToCanvas(2 * fSigned, 0);
    const p2L = r.worldToCanvas(-2 * fSigned, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(255, 183, 77, 0.55)';
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 3, 0, Math.PI * 2);
    ctx.arc(p2L.x, p2L.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 183, 77, 0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('2F', p2.x, p2.y - 8);
    ctx.fillText("2F'", p2L.x, p2L.y - 8);
    ctx.restore();
  }

  // Centro óptico O
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(lens.cx, lens.midY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', lens.cx + 8, lens.midY + 14);
  ctx.restore();

  // Objeto
  const ox = -params.do_;
  const oy = params.ho;
  drawVerticalArrow(ctx, r, ox, oy, '#4fc3f7', 'Objeto');

  // Rayos principales
  // R1: paralelo al eje → pasa por F (conv) o parece venir de F (div)
  drawRay(ctx, r, ox, oy, 0, oy, 'rgba(102,187,106,0.95)', { width: 2.4 });
  if (conv) {
    // hacia F y más allá
    const t = 3.2;
    const xEnd = fSigned * t;
    // línea por F: desde (0, oy) por (f, 0)
    // y = oy + (0-oy)/(f-0) * (x - 0) = oy (1 - x/f)
    const yEnd = oy * (1 - xEnd / fSigned);
    drawRay(ctx, r, 0, oy, xEnd, yEnd, 'rgba(102,187,106,0.95)', { width: 2.4 });
  } else {
    // emerge divergiendo como si viniera de F (en el lado del objeto, fSigned < 0)
    const xEnd = 7;
    // prolongación virtual hacia F
    drawRay(ctx, r, 0, oy, fSigned, 0, 'rgba(102,187,106,0.4)', {
      dash: true,
      width: 1.8,
      arrow: false
    });
    // rayo real saliente: pendiente desde F a través de (0, oy)
    // línea: de (fSigned, 0) a (0, oy): y = oy * (1 - x/fSigned) wait fSigned neg
    // y - 0 = (oy - 0)/(0 - fSigned) * (x - fSigned)
    // at x=0, y=oy OK; at x=xEnd: y = oy/( -fSigned) * (xEnd - fSigned) ... 
    const slope = (oy - 0) / (0 - fSigned);
    const yEnd = 0 + slope * (xEnd - fSigned);
    drawRay(ctx, r, 0, oy, xEnd, yEnd, 'rgba(102,187,106,0.95)', { width: 2.4 });
  }

  // R2: por el centro óptico (no se desvía)
  if (Number.isFinite(im.di) && Math.abs(im.di) < 14 && Number.isFinite(im.hi)) {
    drawRay(ctx, r, ox, oy, 0, 0, 'rgba(206,147,216,0.95)', { width: 2.2 });
    if (im.real) {
      drawRay(ctx, r, 0, 0, im.di, im.hi, 'rgba(206,147,216,0.95)', { width: 2.2 });
    } else {
      // real sale a la derecha prolongando la dirección; virtual a la izquierda en discontinua
      const scale = 6 / Math.hypot(ox, oy);
      drawRay(ctx, r, 0, 0, -ox * scale, -oy * scale, 'rgba(206,147,216,0.95)', {
        width: 2.2
      });
      drawRay(ctx, r, 0, 0, im.di, im.hi, 'rgba(206,147,216,0.4)', {
        dash: true,
        width: 1.8,
        arrow: false
      });
    }
  } else {
    // objeto en F u imagen lejana
    drawRay(ctx, r, ox, oy, 0, 0, 'rgba(206,147,216,0.95)', { width: 2.2 });
    const scale = 7 / Math.hypot(ox, oy || 0.01);
    drawRay(ctx, r, 0, 0, -ox * scale, -oy * scale, 'rgba(206,147,216,0.95)', {
      width: 2.2
    });
  }

  // R3 (opcional pedagogía): por F' del lado del objeto → sale paralelo (solo conv, objeto fuera de F)
  if (conv && params.do_ > params.f + 0.15) {
    // de objeto a F' (-f, 0) no siempre es útil si F' no está en el segmento;
    // rayo que pasa por F' antes de la lente: si do > f, el objeto está a la izq de F'?
    // F' está en -f. Si do > f, ox = -do < -f, so object is left of F'.
    // Ray object → F' extended to lens at y_intersect
    // Line from (ox,oy) to (-f, 0): at x=0, y = ?
    const fPrime = -fSigned;
    const tLens = (0 - ox) / (fPrime - ox);
    const yLens = oy + tLens * (0 - oy);
    if (Math.abs(yLens) < 3.2) {
      drawRay(ctx, r, ox, oy, 0, yLens, 'rgba(255,183,77,0.85)', { width: 1.9 });
      drawRay(ctx, r, 0, yLens, 7, yLens, 'rgba(255,183,77,0.85)', { width: 1.9 });
    }
  }

  // Imagen
  if (Number.isFinite(im.di) && Math.abs(im.di) < 12 && Number.isFinite(im.hi)) {
    const imgColor = im.real ? '#ff9800' : 'rgba(255,152,0,0.85)';
    const imgLabel = im.real ? 'Imagen real' : 'Imagen virtual';
    drawVerticalArrow(ctx, r, im.di, im.hi, imgColor, imgLabel, !im.real);
  }

  // Leyenda de rayos
  const legend = [
    { c: '#66bb6a', t: '∥ eje → por F' },
    { c: '#ce93d8', t: 'Por el centro C' }
  ];
  if (conv && params.do_ > params.f + 0.15) {
    legend.push({ c: '#ffb74d', t: 'Por F′ → sale ∥' });
  }
  legend.push({ c: '#4fc3f7', t: 'Objeto' });
  legend.push({ c: '#ff9800', t: im.real || im.atFocus ? 'Imagen' : 'Imagen (virtual)' });

  ctx.save();
  let lx = w - 14;
  const ly0 = 16;
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
      <label class="control-label">Tipo de lente</label>
      <select id="ln_tipo" class="custom-select" style="width:100%;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px">
        <option value="convergente" ${params.tipo === 'convergente' ? 'selected' : ''}>Convergente (+f) — concentra</option>
        <option value="divergente" ${params.tipo === 'divergente' ? 'selected' : ''}>Divergente (−f) — dispersa</option>
      </select>
    </div>
    <div class="control-group"><label class="control-label">$|f|$ (u)</label>
      <div class="slider-row"><input type="range" id="ln_f" class="custom-slider" min="1" max="6" step="0.1" value="${params.f}"><span id="ln_fd">${params.f}</span></div></div>
    <div class="control-group"><label class="control-label">$$d_0$$ distancia objeto (u)</label>
      <div class="slider-row"><input type="range" id="ln_do" class="custom-slider" min="1.2" max="10" step="0.1" value="${params.do_}"><span id="ln_dod">${params.do_}</span></div></div>
    <div class="control-group"><label class="control-label">$$h_0$$ altura objeto (u)</label>
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
