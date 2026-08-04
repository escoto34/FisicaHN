/**
 * @fileoverview Renderer — puente entre los 27 módulos legacy y el núcleo de la WAVE 2.
 *
 * Conserva íntegra la API que los módulos ya usan (`worldToCanvas`, `drawGrid`,
 * `drawObject`, `drawVector`, `drawLabel`, `drawTooltip`, `follow`,
 * `resetCamera`, `getViewBounds`…) pero por dentro delega en `core/camera.js` y
 * en los tokens de `core/theme.js`. Así los tres arreglos estructurales llegan
 * a los módulos sin tocarlos:
 *
 * - **Escala isotrópica.** Antes `scaleX`/`scaleY` se calculaban por eje y el
 *   mundo se deformaba con la ventana: una órbita circular se veía elíptica en
 *   pantalla ancha. Ahora la escala es única, con letterboxing.
 * - **Zoom y pan.** La cámara ya no es `{x, y}`; `follow()` interpola en vez de
 *   saltar, que era el tirón visible en `gravity` y `kepler`.
 * - **Tema.** El `#0f0f1a` que estaba escrito a mano en `clear()` pasa a ser
 *   `theme.bg`, de modo que el modo proyector y la paleta accesible funcionan
 *   también en los módulos aún sin migrar.
 *
 * `viewport()` es la vía de escape para los módulos que hoy leen
 * `ctx.canvas.width` (píxeles de dispositivo) creyendo leer píxeles CSS: ese
 * es el bug de DPR de §2.0, y ésta es su sustitución.
 */

import { Camera } from './core/camera.js';
import { getTheme } from './core/theme.js';
import { clamp } from './core/geometry.js';

const GRID_LABEL_OFFSET = 4;
const AXIS_PAD = 28;
/** Espaciados «bonitos» de rejilla, en la secuencia 1–2–5 por década. */
const NICE_STEPS = [1, 2, 5];

/** Punto de trabajo: dibujar no debe allocar en el bucle caliente (§3.2). */
const _p = { x: 0, y: 0 };
const _q = { x: 0, y: 0 };

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    // Reutilizar el mismo contexto del motor (nunca un segundo getContext con flags distintos)
    this.ctx =
      opts.ctx ||
      canvas.getContext('2d', { alpha: false }) ||
      canvas.getContext('2d');

    /**
     * La cámara real. Expone `.x` y `.y`, que es lo único que leían los
     * módulos (`magnetic.js:195`), más `zoom`, viewport y límites.
     * @type {Camera}
     */
    this.camera =
      opts.camera ||
      new Camera({
        worldWidth: opts.worldWidth || 20,
        worldHeight: opts.worldHeight || 15
      });

    /** @type {Array<function(CanvasRenderingContext2D, Renderer): void>} */
    this._overlays = [];

    /** Caché de tamaño CSS (se invalida 1× por frame en clear/invalidate) */
    this._cssW = 800;
    this._cssH = 600;
    this._cssDirty = true;
    this._gridFont = null;
    /** DPR lógico (sincronizado con PhysicsEngine) */
    this._dpr = opts.dpr || 1;
  }

  /** Ancho del encuadre base, en unidades de mundo. */
  get worldWidth() {
    return this.camera.worldWidth;
  }

  set worldWidth(v) {
    this.camera.setWorldSize(v, this.camera.worldHeight);
  }

  /** Alto del encuadre base, en unidades de mundo. */
  get worldHeight() {
    return this.camera.worldHeight;
  }

  set worldHeight(v) {
    this.camera.setWorldSize(this.camera.worldWidth, v);
  }

  /** Marca tamaño CSS como sucio (resize). */
  invalidateCssSize() {
    this._cssDirty = true;
  }

  setDpr(dpr) {
    this._dpr = Math.max(dpr || 1, 1);
  }

  /** Tamaño lógico CSS (tras HiDPI el buffer puede ser mayor). */
  cssSize() {
    if (this._cssDirty) {
      const c = this.canvas;
      // Preferir client* (CSS px). Si buffer/dpr es la única pista, usarlo.
      const dpr = this._dpr || 1;
      let w = c.clientWidth;
      let h = c.clientHeight;
      if (!w || !h) {
        const rect = c.getBoundingClientRect();
        w = rect.width;
        h = rect.height;
      }
      if (!w || !h) {
        w = (c.width || 800) / dpr;
        h = (c.height || 600) / dpr;
      }
      this._cssW = Math.max(1, w);
      this._cssH = Math.max(1, h);
      this._cssDirty = false;
      this.camera.setViewport(0, 0, this._cssW, this._cssH);
    }
    return { w: this._cssW, h: this._cssH };
  }

  /**
   * Área de dibujo **siempre en píxeles CSS**. Es lo que un módulo debe usar
   * en lugar de `ctx.canvas.width`, que en un móvil con DPR 1,75 devuelve un
   * valor 1,75× mayor y manda las leyendas fuera de pantalla (§2.0).
   * @returns {{w:number,h:number}}
   */
  viewport() {
    return this.cssSize();
  }

  clear() {
    // Una lectura de tamaño por frame; worldToCanvas reutiliza la caché
    this._cssDirty = true;
    this.cssSize();
    const ctx = this.ctx;
    const dpr = this._dpr || 1;
    const bw = this.canvas.width || 1;
    const bh = this.canvas.height || 1;
    // Relleno en píxeles de dispositivo (cubre todo el buffer; evita basura GPU)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = getTheme().bg;
    ctx.fillRect(0, 0, bw, bh);
    // Volver a coordenadas CSS para el resto del frame
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setCamera(x, y) {
    this.camera.setPosition(x, y);
  }

  /**
   * Centra la cámara en un punto del mundo. A diferencia del salto duro
   * anterior, la cámara interpola: la app llama `camera.update(dt)` una vez
   * por frame.
   */
  follow(wx, wy, opts) {
    this.camera.follow(wx, wy, opts);
  }

  resetCamera() {
    this.camera.reset();
  }

  /** Rango visible en mundo (incluye el zoom). */
  getViewBounds() {
    return this.camera.bounds();
  }

  /**
   * Mundo → lienzo, en píxeles CSS.
   * @param {number} wx
   * @param {number} wy
   * @param {{x:number,y:number}} [out] - Para evitar allocar en bucles.
   */
  worldToCanvas(wx, wy, out) {
    this.cssSize();
    return this.camera.worldToScreen(wx, wy, out || { x: 0, y: 0 });
  }

  /** Lienzo (px CSS) → mundo. */
  canvasToWorld(px, py, out) {
    this.cssSize();
    return this.camera.screenToWorld(px, py, out || { x: 0, y: 0 });
  }

  /**
   * Espaciado de rejilla adaptado al zoom. Sin esto, acercarse dejaba una sola
   * línea en pantalla y alejarse producía cientos de trazos y `fillText`.
   * @param {number} [target=1] - Espaciado deseado a zoom 1.
   * @returns {number}
   */
  gridSpacing(target = 1) {
    const scale = this.camera.scale;
    if (!Number.isFinite(scale) || scale <= 0) return target;
    // Buscar el paso 1-2-5 cuyo tamaño en pantalla ronde los 64 px.
    const ideal = 64 / scale;
    const decade = Math.pow(10, Math.floor(Math.log10(Math.max(ideal, 1e-9))));
    for (const s of NICE_STEPS) {
      if (decade * s >= ideal) return decade * s;
    }
    return decade * 10;
  }

  /**
   * Dibuja la rejilla sobre **otro** contexto (la capa de fondo de §2.1).
   *
   * Sin esto la rejilla se pintaría siempre en el lienzo visible y la capa
   * cacheada quedaría vacía: al dejar de estar sucia, la rejilla desaparecería.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} [opts]
   */
  drawGridTo(ctx, opts = {}) {
    const prev = this.ctx;
    this.ctx = ctx;
    try {
      this.drawGrid(opts);
    } finally {
      this.ctx = prev;
    }
  }

  /**
   * Dibuja cuadrícula + ejes. Los ejes se pegan al borde si el origen sale del viewport.
   *
   * Trabaja sobre el rectángulo de la cámara, no sobre el lienzo entero: así
   * cada mitad de la comparación lado a lado tiene sus propios ejes (§2.9).
   *
   * En modo proyector (`gridDetail === 'axes'`) se omiten las líneas menores:
   * un proyector las convierte en ruido gris que compite con la simulación.
   */
  drawGrid(opts = {}) {
    const ctx = this.ctx;
    const theme = getTheme();
    const color = opts.color || theme.grid;
    const labelColor = opts.labelColor || theme.axisLabel;
    const axisColor = opts.axisColor || theme.axis;
    const spacing = opts.spacing ? this.gridSpacing(opts.spacing) : this.gridSpacing(1);
    const minorLines = theme.gridDetail !== 'axes';

    this.cssSize();
    const vp = this.camera.viewport;
    const x0 = vp.x;
    const y0 = vp.y;
    const w = vp.w;
    const h = vp.h;
    const bounds = this.getViewBounds();

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    if (!this._gridFont) {
      try {
        this._gridFont = getComputedStyle(this.canvas).fontFamily || 'monospace';
      } catch {
        this._gridFont = 'monospace';
      }
    }
    ctx.font = `${Math.round(10 * theme.fontScale)}px ${this._gridFont}`;
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const origin = this.worldToCanvas(0, 0, _q);
    const originX = origin.x;
    const originY = origin.y;
    const axisYx = clamp(originX, x0 + AXIS_PAD, x0 + w - AXIS_PAD);
    const axisXy = clamp(originY, y0 + AXIS_PAD, y0 + h - AXIS_PAD);
    const decimals = spacing < 1 ? Math.min(3, Math.ceil(-Math.log10(spacing))) : 0;
    const fmt = (v) => (decimals ? v.toFixed(decimals) : String(Math.round(v)));

    // Líneas verticales (x = k)
    let x = Math.ceil(bounds.minX / spacing) * spacing;
    for (; x <= bounds.maxX + 1e-9; x += spacing) {
      const p = this.worldToCanvas(x, 0, _p);
      if (minorLines) {
        ctx.beginPath();
        ctx.moveTo(p.x, y0);
        ctx.lineTo(p.x, y0 + h);
        ctx.stroke();
      }
      if (Math.abs(x) > spacing * 1e-6) {
        ctx.fillText(fmt(x), p.x, y0 + GRID_LABEL_OFFSET);
      }
    }

    // Líneas horizontales (y = k)
    let y = Math.ceil(bounds.minY / spacing) * spacing;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (; y <= bounds.maxY + 1e-9; y += spacing) {
      const p = this.worldToCanvas(0, y, _p);
      if (minorLines) {
        ctx.beginPath();
        ctx.moveTo(x0, p.y);
        ctx.lineTo(x0 + w, p.y);
        ctx.stroke();
      }
      if (Math.abs(y) > spacing * 1e-6) {
        ctx.fillText(fmt(y), axisYx - 6, p.y);
      }
    }

    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.75 * theme.lineScale;

    // Eje X (horizontal)
    ctx.beginPath();
    ctx.moveTo(x0, axisXy);
    ctx.lineTo(x0 + w, axisXy);
    ctx.stroke();

    // Eje Y (vertical)
    ctx.beginPath();
    ctx.moveTo(axisYx, y0);
    ctx.lineTo(axisYx, y0 + h);
    ctx.stroke();

    // Flechas simples en extremos de ejes visibles
    ctx.fillStyle = axisColor;
    ctx.beginPath();
    ctx.moveTo(x0 + w - 2, axisXy);
    ctx.lineTo(x0 + w - 10, axisXy - 4);
    ctx.lineTo(x0 + w - 10, axisXy + 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(axisYx, y0 + 2);
    ctx.lineTo(axisYx - 4, y0 + 10);
    ctx.lineTo(axisYx + 4, y0 + 10);
    ctx.fill();

    // Etiqueta O solo si el origen está en pantalla
    const originInView =
      originX >= x0 && originX <= x0 + w && originY >= y0 && originY <= y0 + h;
    ctx.fillStyle = labelColor;
    if (originInView) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('O', originX - 4, originY + 4);
    } else {
      // Indicar que el origen quedó fuera
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('eje x', x0 + w - 36, axisXy - 4);
      ctx.textBaseline = 'top';
      ctx.fillText('eje y', axisYx + 6, y0 + 4);
    }

    // Escala: con zoom libre, saber cuánto mide un cuadro deja de ser obvio.
    if (opts.showScale !== false) {
      const barWorld = spacing;
      const barPx = this.camera.toPixels(barWorld);
      if (barPx > 12 && barPx < w * 0.6) {
        const bx = x0 + 14;
        const by = y0 + h - 14;
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 2 * theme.lineScale;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + barPx, by);
        ctx.moveTo(bx, by - 4);
        ctx.lineTo(bx, by + 4);
        ctx.moveTo(bx + barPx, by - 4);
        ctx.lineTo(bx + barPx, by + 4);
        ctx.stroke();
        ctx.fillStyle = labelColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${fmt(barWorld)} m`, bx, by - 6);
      }
    }

    ctx.restore();
  }

  drawObject(wx, wy, opts = {}) {
    const ctx = this.ctx;
    const theme = getTheme();
    const shape = opts.shape || 'circle';
    const size = opts.size || 0.5;
    const color = opts.color || theme.mass;
    const label = opts.label || '';
    const rotation = opts.rotation || 0;
    const glow = opts.glow !== false && theme.glow;

    const p = this.worldToCanvas(wx, wy, _p);
    const radiusPx = Math.max(this.camera.toPixels(size), 4);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-rotation);
    ctx.setLineDash([]);

    switch (shape) {
      case 'circle': {
        if (glow) {
          ctx.shadowColor = color;
          ctx.shadowBlur = Math.min(18, radiusPx * 0.9);
        }
        if (theme.glow) {
          // Esfera con gradiente (highlight)
          const g = ctx.createRadialGradient(
            -radiusPx * 0.35,
            -radiusPx * 0.4,
            radiusPx * 0.05,
            0,
            0,
            radiusPx
          );
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.18, color);
          g.addColorStop(0.85, color);
          g.addColorStop(1, 'rgba(0,0,0,0.35)');
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = color;
        }
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5 * theme.lineScale;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        break;
      }
      case 'rect': {
        const half = radiusPx;
        if (glow) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
        }
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-half, -half, half * 2, half * 2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5 * theme.lineScale;
        ctx.strokeRect(-half, -half, half * 2, half * 2);
        break;
      }
      case 'triangle': {
        const r = radiusPx;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
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
      this.drawLabel(wx, wy - size * 0.95, label, { color });
    }
  }

  /**
   * @param {number} ox
   * @param {number} oy
   * @param {number} dx
   * @param {number} dy
   * @param {{ color?: string, width?: number, label?: string, labelSide?: number, labelPad?: number }} [opts]
   * labelSide: +1 / -1 desplaza la etiqueta perpendicular al vector (evita solapes F/v)
   */
  drawVector(ox, oy, dx, dy, opts = {}) {
    const ctx = this.ctx;
    const theme = getTheme();
    const color = opts.color || theme.force;
    const width = (opts.width || 2.5) * theme.lineScale;
    const label = opts.label || '';
    const labelSide = opts.labelSide != null ? opts.labelSide : 1;
    const labelPad = (opts.labelPad != null ? opts.labelPad : 14) * theme.fontScale;

    const from = this.worldToCanvas(ox, oy, _p);
    const fx = from.x;
    const fy = from.y;
    const to = this.worldToCanvas(ox + dx, oy + dy, _q);

    const angle = Math.atan2(to.y - fy, to.x - fx);
    const len = Math.hypot(to.x - fx, to.y - fy);
    const headLen = Math.min(14 * theme.lineScale, Math.max(8, len * 0.28));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(opts.dash || []);
    if (theme.glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
    }

    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLen * Math.cos(angle - 0.4), to.y - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(to.x - headLen * Math.cos(angle + 0.4), to.y - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    if (label && len > 4) {
      // Etiqueta a mitad del vector, desplazada perpendicular (no se superpone con otra flecha)
      const lx = (fx + to.x) / 2 - Math.sin(angle) * labelSide * labelPad;
      const ly = (fy + to.y) / 2 + Math.cos(angle) * labelSide * labelPad;
      this._text(lx, ly, label, { color, fontSize: 12, baseline: 'middle' });
    }
  }

  drawLabel(wx, wy, text, opts = {}) {
    const p = this.worldToCanvas(wx, wy, _p);
    this._text(p.x, p.y, text, opts);
  }

  /** Texto en coordenadas de lienzo (px CSS). Evita el ida y vuelta mundo↔pantalla. */
  _text(px, py, text, opts = {}) {
    const ctx = this.ctx;
    const theme = getTheme();
    const color = opts.color || theme.text;
    const fontSize = (opts.fontSize || 13) * theme.fontScale;

    ctx.save();
    ctx.font = `${Math.round(fontSize)}px ${this._fontFamily()}`;
    ctx.fillStyle = color;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'bottom';
    if (theme.dark) {
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
    }
    ctx.fillText(text, px, py);
    ctx.restore();
  }

  /** Familia tipográfica del lienzo, cacheada: `getComputedStyle` no es gratis. */
  _fontFamily() {
    if (!this._gridFont) {
      try {
        this._gridFont = getComputedStyle(this.canvas).fontFamily || 'sans-serif';
      } catch {
        this._gridFont = 'sans-serif';
      }
    }
    return this._gridFont;
  }

  drawTooltip(wx, wy, text) {
    const ctx = this.ctx;
    const theme = getTheme();
    const p = this.worldToCanvas(wx, wy, _p);

    ctx.save();
    ctx.font = `${Math.round(12 * theme.fontScale)}px ${this._fontFamily()}`;
    const metrics = ctx.measureText(text);
    const pad = 6;
    const bw = metrics.width + pad * 2;
    const bh = 22 * theme.fontScale;

    ctx.fillStyle = theme.hudBg;
    ctx.strokeStyle = theme.hudBorder;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.roundRect(p.x - bw / 2, p.y - bh - 8, bw, bh, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = theme.text;
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

  /** Posición del puntero en px CSS, robusta ante escalados CSS del lienzo. */
  _pointerCss(event) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY ?? 0;
    const sx = rect.width ? this.canvas.clientWidth / rect.width : 1;
    const sy = rect.height ? this.canvas.clientHeight / rect.height : 1;
    return { px: (clientX - rect.left) * sx, py: (clientY - rect.top) * sy };
  }

  getMousePos(event) {
    const { px, py } = this._pointerCss(event);
    return this.canvasToWorld(px, py);
  }

  getPointerPos(event) {
    const { px, py } = this._pointerCss(event);
    return { px, py, world: this.canvasToWorld(px, py) };
  }
}
