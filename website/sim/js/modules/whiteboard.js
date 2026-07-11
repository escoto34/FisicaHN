/**
 * Pizarra docente — dibujo libre sobre el canvas (sin física).
 */

/** El app no dibuja la grilla del mundo cuando es pizarra */
export const skipWorldGrid = true;

let _engine = null;
let _renderer = null;
let _ui = null;
let canvas = null;
let ctx = null;

let tool = 'pen'; // pen | eraser | line | rect | circle | arrow
let color = '#e8eef6';
let lineWidth = 3;
let lightBg = false;

/** @type {Array<object>} */
let strokes = [];
/** @type {object|null} */
let current = null;
let undoStack = [];

const COLORS = ['#e8eef6', '#4fc3f7', '#66bb6a', '#ffb74d', '#ef5350', '#ce93d8', '#111827'];

function onPointerDown(e) {
  if (!canvas) return;
  canvas.setPointerCapture?.(e.pointerId);
  const p = pointer(e);
  if (tool === 'pen' || tool === 'eraser') {
    current = {
      type: tool === 'eraser' ? 'eraser' : 'pen',
      color: tool === 'eraser' ? (lightBg ? '#f4f6f8' : '#0f0f1a') : color,
      width: tool === 'eraser' ? lineWidth * 4 : lineWidth,
      points: [p]
    };
  } else {
    current = {
      type: tool,
      color,
      width: lineWidth,
      from: p,
      to: p
    };
  }
}

function onPointerMove(e) {
  if (!current) return;
  const p = pointer(e);
  if (current.points) {
    current.points.push(p);
  } else {
    current.to = p;
  }
}

function onPointerUp() {
  if (!current) return;
  strokes.push(current);
  if (strokes.length > 200) strokes.shift();
  undoStack = [];
  current = null;
}

function pointer(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function drawStroke(s) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.type === 'pen' || s.type === 'eraser') {
    const pts = s.points || [];
    if (pts.length < 2) {
      if (pts[0]) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  } else if (s.type === 'line' || s.type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(s.from.x, s.from.y);
    ctx.lineTo(s.to.x, s.to.y);
    ctx.stroke();
    if (s.type === 'arrow') {
      const ang = Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x);
      const hl = 14;
      ctx.beginPath();
      ctx.moveTo(s.to.x, s.to.y);
      ctx.lineTo(s.to.x - hl * Math.cos(ang - 0.4), s.to.y - hl * Math.sin(ang - 0.4));
      ctx.lineTo(s.to.x - hl * Math.cos(ang + 0.4), s.to.y - hl * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
    }
  } else if (s.type === 'rect') {
    ctx.strokeRect(
      s.from.x,
      s.from.y,
      s.to.x - s.from.x,
      s.to.y - s.from.y
    );
  } else if (s.type === 'circle') {
    const rx = (s.to.x - s.from.x) / 2;
    const ry = (s.to.y - s.from.y) / 2;
    const cx = s.from.x + rx;
    const cy = s.from.y + ry;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function clearBoard() {
  if (strokes.length) undoStack.push(strokes.slice());
  strokes = [];
  current = null;
}

function undo() {
  if (!strokes.length) return;
  strokes.pop();
}

function exportPng() {
  if (!canvas) return;
  const a = document.createElement('a');
  a.download = `pizarra-fisicahn-${Date.now()}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

function addText() {
  const text = prompt('Texto para la pizarra:');
  if (!text) return;
  const w = canvas.width;
  const h = canvas.height;
  strokes.push({
    type: 'text',
    color,
    width: lineWidth,
    text,
    x: w * 0.15,
    y: h * 0.2 + strokes.filter((s) => s.type === 'text').length * 28
  });
}

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;
  canvas = engine.canvas;
  ctx = canvas.getContext('2d');
  strokes = [];
  current = null;
  tool = 'pen';
  color = '#e8eef6';
  lightBg = false;
  renderer.resetCamera();

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  ui.setInfo(`
    <strong>Pizarra</strong> — Espacio libre para ejemplos del docente.<br>
    Lápiz, formas, flechas, deshacer, limpiar y exportar PNG.
  `);
  ui.setFormulas('<p class="tab-text">Sin fórmulas: herramienta de enseñanza.</p>');
  ui.setData('<p class="tab-text">Dibuja sobre el canvas central.</p>');
  ui.setChallenges('<p class="tab-text">Propón un problema en la pizarra y resuélvelo con la clase.</p>');
  ui.setChart('<text x="150" y="90" text-anchor="middle" fill="var(--text-secondary)" font-size="11">Pizarra</text>');

  renderParams();
  // Pausar física del motor no es crítico; no hay update físico
  engine.pause(true);
}

export function destroy() {
  if (canvas) {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.style.touchAction = '';
  }
  strokes = [];
  current = null;
  _engine = _renderer = _ui = null;
  canvas = ctx = null;
}

export function reset() {
  clearBoard();
}

export function setTool(toolId) {
  if (['pen', 'eraser', 'line', 'rect', 'circle', 'arrow'].includes(toolId)) {
    tool = toolId;
    highlightTool();
  }
}

export function update() {}

export function render(ctxDraw) {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;

  // Fondo pizarra (sin grid del app: lo tapamos)
  ctxDraw.save();
  ctxDraw.setTransform(1, 0, 0, 1, 0, 0);
  ctxDraw.fillStyle = lightBg ? '#f4f6f8' : '#0f0f1a';
  ctxDraw.fillRect(0, 0, w, h);

  // Cuadrícula suave opcional
  ctxDraw.strokeStyle = lightBg ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
  ctxDraw.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < w; x += step) {
    ctxDraw.beginPath();
    ctxDraw.moveTo(x, 0);
    ctxDraw.lineTo(x, h);
    ctxDraw.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctxDraw.beginPath();
    ctxDraw.moveTo(0, y);
    ctxDraw.lineTo(w, y);
    ctxDraw.stroke();
  }

  for (const s of strokes) {
    if (s.type === 'text') {
      ctxDraw.fillStyle = s.color;
      ctxDraw.font = '20px system-ui, sans-serif';
      ctxDraw.fillText(s.text, s.x, s.y);
    } else {
      drawStroke(s);
    }
  }
  if (current) drawStroke(current);

  ctxDraw.fillStyle = lightBg ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.4)';
  ctxDraw.font = '12px system-ui';
  ctxDraw.textAlign = 'left';
  ctxDraw.fillText(`Herramienta: ${tool} · ${strokes.length} trazos`, 12, h - 12);
  ctxDraw.restore();
}

function highlightTool() {
  document.querySelectorAll('[data-wb-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.wbTool === tool);
  });
}

function renderParams() {
  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Herramienta</label>
      <div class="btn-row" style="flex-wrap:wrap;gap:6px">
        ${['pen', 'eraser', 'line', 'arrow', 'rect', 'circle']
          .map(
            (t) =>
              `<button type="button" class="ctrl-btn ${t === tool ? 'active' : ''}" data-wb-tool="${t}">${labelTool(t)}</button>`
          )
          .join('')}
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Color</label>
      <div class="btn-row" style="flex-wrap:wrap;gap:6px">
        ${COLORS.map(
          (c) =>
            `<button type="button" class="color-swatch" data-color="${c}" style="background:${c};width:28px;height:28px;border-radius:6px;border:2px solid ${c === color ? 'var(--accent)' : 'transparent'}" aria-label="Color ${c}"></button>`
        ).join('')}
      </div>
    </div>
    <div class="control-group">
      <label class="control-label" for="wb_width">Grosor</label>
      <div class="slider-row">
        <input type="range" id="wb_width" class="custom-slider" min="1" max="16" step="1" value="${lineWidth}">
        <span class="slider-value" id="wb_width_v">${lineWidth}</span>
      </div>
    </div>
    <div class="control-group btn-row" style="flex-wrap:wrap;gap:6px">
      <button type="button" class="ctrl-btn" id="wb_undo">Deshacer</button>
      <button type="button" class="ctrl-btn" id="wb_text">Texto</button>
      <button type="button" class="ctrl-btn" id="wb_theme">${lightBg ? 'Fondo oscuro' : 'Fondo claro'}</button>
      <button type="button" class="ctrl-btn" id="wb_export">Exportar PNG</button>
      <button type="button" class="ctrl-btn" id="wb_clear" style="color:var(--danger)">Limpiar</button>
    </div>
  `);

  setTimeout(() => {
    document.querySelectorAll('[data-wb-tool]').forEach((b) => {
      b.addEventListener('click', () => {
        tool = b.dataset.wbTool;
        highlightTool();
      });
    });
    document.querySelectorAll('[data-color]').forEach((b) => {
      b.addEventListener('click', () => {
        color = b.dataset.color;
        renderParams();
      });
    });
    const wEl = document.getElementById('wb_width');
    const wV = document.getElementById('wb_width_v');
    wEl?.addEventListener('input', () => {
      lineWidth = parseInt(wEl.value, 10);
      if (wV) wV.textContent = String(lineWidth);
    });
    document.getElementById('wb_undo')?.addEventListener('click', undo);
    document.getElementById('wb_text')?.addEventListener('click', addText);
    document.getElementById('wb_clear')?.addEventListener('click', clearBoard);
    document.getElementById('wb_export')?.addEventListener('click', exportPng);
    document.getElementById('wb_theme')?.addEventListener('click', () => {
      lightBg = !lightBg;
      renderParams();
    });
  }, 0);
}

function labelTool(t) {
  return (
    {
      pen: 'Lápiz',
      eraser: 'Borrar',
      line: 'Línea',
      arrow: 'Flecha',
      rect: 'Rect',
      circle: 'Círculo'
    }[t] || t
  );
}
