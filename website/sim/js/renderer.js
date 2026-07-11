/**
 * @fileoverview Renderer — Canvas 2D con cámara y ejes que se pegan al borde.
 *
 * El origen del mundo (0,0) se dibuja en pantalla vía worldToCanvas.
 * Con cámara, el viewport se centra en camera; si el origen sale de vista,
 * los ejes se clampa al borde opuesto al movimiento.
 */

const GRID_LABEL_OFFSET = 4;
const AXIS_PAD = 28;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.worldWidth = opts.worldWidth || 20;
    this.worldHeight = opts.worldHeight || 15;

    /** Centro de la vista en coordenadas mundo */
    this.camera = { x: 0, y: 0 };

    /** @type {Array<function(CanvasRenderingContext2D, Renderer): void>} */
    this._overlays = [];
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setCamera(x, y) {
    this.camera.x = x;
    this.camera.y = y;
  }

  /** Centra la cámara en un punto del mundo (seguir objeto). */
  follow(wx, wy) {
    this.camera.x = wx;
    this.camera.y = wy;
  }

  resetCamera() {
    this.camera.x = 0;
    this.camera.y = 0;
  }

  /** Rango visible en mundo */
  getViewBounds() {
    const halfW = this.worldWidth / 2;
    const halfH = this.worldHeight / 2;
    return {
      minX: this.camera.x - halfW,
      maxX: this.camera.x + halfW,
      minY: this.camera.y - halfH,
      maxY: this.camera.y + halfH
    };
  }

  worldToCanvas(wx, wy) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scaleX = w / this.worldWidth;
    const scaleY = h / this.worldHeight;
    const cx = w / 2;
    const cy = h / 2;
    return {
      x: cx + (wx - this.camera.x) * scaleX,
      y: cy - (wy - this.camera.y) * scaleY
    };
  }

  canvasToWorld(px, py) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scaleX = w / this.worldWidth;
    const scaleY = h / this.worldHeight;
    const cx = w / 2;
    const cy = h / 2;
    return {
      x: this.camera.x + (px - cx) / scaleX,
      y: this.camera.y + (cy - py) / scaleY
    };
  }

  /**
   * Dibuja cuadrícula + ejes. Los ejes se pegan al borde si el origen sale del viewport.
   */
  drawGrid(opts = {}) {
    const ctx = this.ctx;
    const color = opts.color || 'rgba(255,255,255,0.06)';
    const labelColor = opts.labelColor || 'rgba(255,255,255,0.2)';
    const axisColor = opts.axisColor || 'rgba(255,255,255,0.28)';
    const spacing = opts.spacing || 1;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const bounds = this.getViewBounds();

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.font = '10px ' + (getComputedStyle(this.canvas).fontFamily || 'monospace');
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Líneas verticales (x = k)
    let x = Math.ceil(bounds.minX / spacing) * spacing;
    for (; x <= bounds.maxX + 1e-9; x += spacing) {
      const p = this.worldToCanvas(x, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, h);
      ctx.stroke();
      if (Math.abs(x) > 1e-9) {
        const label = Number.isInteger(x) ? String(x) : x.toFixed(1);
        ctx.fillText(label, p.x, GRID_LABEL_OFFSET);
      }
    }

    // Líneas horizontales (y = k)
    let y = Math.ceil(bounds.minY / spacing) * spacing;
    for (; y <= bounds.maxY + 1e-9; y += spacing) {
      const p = this.worldToCanvas(0, y);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(w, p.y);
      ctx.stroke();
      if (Math.abs(y) > 1e-9) {
        const label = Number.isInteger(y) ? String(y) : y.toFixed(1);
        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        // etiqueta cerca del eje Y clamped
        const originScreen = this.worldToCanvas(0, 0);
        const ax = clamp(originScreen.x, AXIS_PAD, w - AXIS_PAD);
        ctx.fillText(label, ax - 6, p.y);
        ctx.restore();
      }
    }

    // Ejes con clamp al borde del viewport
    const origin = this.worldToCanvas(0, 0);
    const axisYx = clamp(origin.x, AXIS_PAD, w - AXIS_PAD);
    const axisXy = clamp(origin.y, AXIS_PAD, h - AXIS_PAD);

    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.75;

    // Eje X (horizontal)
    ctx.beginPath();
    ctx.moveTo(0, axisXy);
    ctx.lineTo(w, axisXy);
    ctx.stroke();

    // Eje Y (vertical)
    ctx.beginPath();
    ctx.moveTo(axisYx, 0);
    ctx.lineTo(axisYx, h);
    ctx.stroke();

    // Flechas simples en extremos de ejes visibles
    ctx.fillStyle = axisColor;
    ctx.beginPath();
    ctx.moveTo(w - 2, axisXy);
    ctx.lineTo(w - 10, axisXy - 4);
    ctx.lineTo(w - 10, axisXy + 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(axisYx, 2);
    ctx.lineTo(axisYx - 4, 10);
    ctx.lineTo(axisYx + 4, 10);
    ctx.fill();

    // Etiqueta O solo si el origen está en pantalla
    const originInView =
      origin.x >= 0 && origin.x <= w && origin.y >= 0 && origin.y <= h;
    if (originInView) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('O', origin.x - 4, origin.y + 4);
    } else {
      // Indicar que el origen quedó fuera
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('eje x', w - 36, axisXy - 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('eje y', axisYx + 6, 4);
    }

    ctx.restore();
  }

  drawObject(wx, wy, opts = {}) {
    const ctx = this.ctx;
    const shape = opts.shape || 'circle';
    const size = opts.size || 0.5;
    const color = opts.color || '#4fc3f7';
    const label = opts.label || '';
    const rotation = opts.rotation || 0;

    const p = this.worldToCanvas(wx, wy);
    const radiusPx = size * (this.canvas.width / this.worldWidth);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-rotation);

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;

    switch (shape) {
      case 'circle': {
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(radiusPx, 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        break;
      }
      case 'rect': {
        const half = Math.max(radiusPx, 4);
        ctx.fillRect(-half, -half, half * 2, half * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.strokeRect(-half, -half, half * 2, half * 2);
        break;
      }
      case 'triangle': {
        const r = Math.max(radiusPx, 5);
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(-r * 0.5, -r * 0.866);
        ctx.lineTo(-r * 0.5, r * 0.866);
        ctx.closePath();
        ctx.fill();
        break;
      }
    }

    ctx.restore();

    if (label) {
      this.drawLabel(wx, wy - size * 0.8, label, { color });
    }
  }

  drawVector(ox, oy, dx, dy, opts = {}) {
    const ctx = this.ctx;
    const color = opts.color || '#ffb74d';
    const width = opts.width || 2;
    const label = opts.label || '';

    const from = this.worldToCanvas(ox, oy);
    const to = this.worldToCanvas(ox + dx, oy + dy);

    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLen = Math.min(12, Math.hypot(to.x - from.x, to.y - from.y) * 0.3);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLen * Math.cos(angle - 0.4),
      to.y - headLen * Math.sin(angle - 0.4)
    );
    ctx.lineTo(
      to.x - headLen * Math.cos(angle + 0.4),
      to.y - headLen * Math.sin(angle + 0.4)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    if (label) {
      const midX = (from.x + to.x) / 2 + 10;
      const midY = (from.y + to.y) / 2 - 10;
      const mid = this.canvasToWorld(midX, midY);
      this.drawLabel(mid.x, mid.y, label, { color, fontSize: 12 });
    }
  }

  drawLabel(wx, wy, text, opts = {}) {
    const ctx = this.ctx;
    const color = opts.color || '#e0e0e0';
    const fontSize = opts.fontSize || 13;
    const align = opts.align || 'center';

    const p = this.worldToCanvas(wx, wy);

    ctx.save();
    ctx.font = `${fontSize}px ${getComputedStyle(this.canvas).fontFamily || 'sans-serif'}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  }

  drawTooltip(wx, wy, text) {
    const ctx = this.ctx;
    const p = this.worldToCanvas(wx, wy);

    ctx.save();
    ctx.font = '12px ' + (getComputedStyle(this.canvas).fontFamily || 'sans-serif');
    const metrics = ctx.measureText(text);
    const pad = 6;
    const bw = metrics.width + pad * 2;
    const bh = 22;

    ctx.fillStyle = 'rgba(15,15,26,0.9)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(p.x - bw / 2, p.y - bh - 8, bw, bh, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e0e0e0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, p.x, p.y - bh / 2 - 8);

    ctx.restore();
  }

  addOverlay(fn) {
    this._overlays.push(fn);
  }

  clearOverlays() {
    this._overlays = [];
  }

  drawOverlays() {
    for (const fn of this._overlays) {
      try {
        fn(this.ctx, this);
      } catch {
        /* ignore overlay errors */
      }
    }
  }

  getMousePos(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;
    return this.canvasToWorld(px, py);
  }

  getPointerPos(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY ?? 0;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;
    return { px, py, world: this.canvasToWorld(px, py) };
  }
}
