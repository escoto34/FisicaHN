/**
 * @fileoverview Renderer — Capa de dibujo sobre canvas 2D.
 *
 * Transformaciones: mundo ↔ canvas (coordenadas).
 * El mundo tiene origen (0,0) en el centro del canvas.
 * Eje Y apunta hacia arriba (invertido respecto a canvas).
 */

const GRID_SPACING_MIN = 40;
const GRID_LABEL_OFFSET = 4;

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {number} [opts.worldWidth=20] - Ancho del mundo en unidades
   * @param {number} [opts.worldHeight=15] - Alto del mundo en unidades
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.worldWidth = opts.worldWidth || 20;
    this.worldHeight = opts.worldHeight || 15;

    /** @type {Array<function(CanvasRenderingContext2D): void>} */
    this._overlays = [];
  }

  /**
   * Limpia todo el canvas.
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Transforma coordenadas del mundo a píxeles del canvas.
   * @param {number} wx - Coordenada X en el mundo
   * @param {number} wy - Coordenada Y en el mundo
   * @returns {{ x: number, y: number }}
   */
  worldToCanvas(wx, wy) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scaleX = w / this.worldWidth;
    const scaleY = h / this.worldHeight;
    const cx = w / 2;
    const cy = h / 2;
    return {
      x: cx + wx * scaleX,
      y: cy - wy * scaleY
    };
  }

  /**
   * Transforma coordenadas de píxeles a mundo.
   * @param {number} px - Pixel X
   * @param {number} py - Pixel Y
   * @returns {{ x: number, y: number }}
   */
  canvasToWorld(px, py) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scaleX = w / this.worldWidth;
    const scaleY = h / this.worldHeight;
    const cx = w / 2;
    const cy = h / 2;
    return {
      x: (px - cx) / scaleX,
      y: (cy - py) / scaleY
    };
  }

  /**
   * Dibuja la cuadrícula de fondo con etiquetas.
   * @param {object} [opts]
   * @param {string} [opts.color='rgba(255,255,255,0.06)']
   * @param {string} [opts.labelColor='rgba(255,255,255,0.2)']
   * @param {number} [opts.spacing=1] - Espaciado en unidades mundo
   */
  drawGrid(opts = {}) {
    const ctx = this.ctx;
    const color = opts.color || 'rgba(255,255,255,0.06)';
    const labelColor = opts.labelColor || 'rgba(255,255,255,0.2)';
    const spacing = opts.spacing || 1;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const scaleX = w / this.worldWidth;
    const scaleY = h / this.worldHeight;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.font = '10px ' + getComputedStyle(this.canvas).fontFamily || 'monospace';
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Calcular bounds del mundo
    const halfW = this.worldWidth / 2;
    const halfH = this.worldHeight / 2;

    // Líneas verticales
    let x = -halfW + (Math.ceil(-halfW / spacing) * spacing);
    while (x <= halfW) {
      const p = this.worldToCanvas(x, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, h);
      ctx.stroke();
      // Etiqueta
      if (x !== 0) {
        ctx.fillText(x.toFixed(x % 1 === 0 ? 0 : 1), p.x, 0 + GRID_LABEL_OFFSET);
      }
      x += spacing;
    }

    // Líneas horizontales
    let y = -halfH + (Math.ceil(-halfH / spacing) * spacing);
    while (y <= halfH) {
      const p = this.worldToCanvas(0, y);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(w, p.y);
      ctx.stroke();
      if (y !== 0) {
        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(y.toFixed(y % 1 === 0 ? 0 : 1), p.x - 6, p.y);
        ctx.restore();
      }
      y += spacing;
    }

    // Ejes X e Y (más visibles)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    const origin = this.worldToCanvas(0, 0);
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(w, origin.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, h);
    ctx.stroke();

    // Etiqueta origen
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('O', origin.x - 4, origin.y + 4);

    ctx.restore();
  }

  /**
   * Dibuja un objeto con forma y color configurables.
   * @param {number} wx - Posición X en mundo
   * @param {number} wy - Posición Y en mundo
   * @param {object} [opts]
   * @param {'circle'|'rect'|'triangle'} [opts.shape='circle']
   * @param {number} [opts.size=0.5] - Tamaño en unidades mundo
   * @param {string} [opts.color='#4fc3f7']
   * @param {string} [opts.label='']
   * @param {number} [opts.rotation=0] - Rotación en radianes
   */
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

    // Etiqueta
    if (label) {
      this.drawLabel(wx, wy - size * 0.8, label, { color });
    }
  }

  /**
   * Dibuja un vector como flecha.
   * @param {number} ox - Origen X en mundo
   * @param {number} oy - Origen Y en mundo
   * @param {number} dx - Componente X del vector
   * @param {number} dy - Componente Y del vector
   * @param {object} [opts]
   * @param {string} [opts.color='#ffb74d']
   * @param {number} [opts.width=2]
   * @param {string} [opts.label='']
   */
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

    // Línea
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Punta de flecha
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
      this.drawLabel(
        this.canvasToWorld(midX, midY).x,
        this.canvasToWorld(midX, midY).y,
        label,
        { color, fontSize: 12 }
      );
    }
  }

  /**
   * Dibuja una etiqueta de texto en coordenadas del mundo.
   * @param {number} wx
   * @param {number} wy
   * @param {string} text
   * @param {object} [opts]
   * @param {string} [opts.color='#e0e0e0']
   * @param {number} [opts.fontSize=13]
   * @param {string} [opts.align='center']
   */
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

    // Sombra para legibilidad
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;

    ctx.fillText(text, p.x, p.y);

    ctx.restore();
  }

  /**
   * Dibuja un tooltip o marcador temporal.
   * @param {number} wx
   * @param {number} wy
   * @param {string} text
   */
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

  /**
   * Obtiene la posición del mouse en coordenadas del mundo.
   * @param {MouseEvent} event
   * @returns {{ x: number, y: number }}
   */
  getMousePos(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;
    return this.canvasToWorld(px, py);
  }
}
