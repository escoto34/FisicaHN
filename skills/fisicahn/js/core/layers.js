/**
 * @fileoverview layers — capas con invalidación independiente (§2.1).
 *
 * Hasta ahora el bucle borraba el lienzo entero y lo redibujaba 60 veces por
 * segundo, incluida una rejilla estática de ~35 trazos y ~33 `fillText`
 * (`renderer.js:151-264`) que casi nunca cambia. Aquí se separan tres capas:
 *
 * | Capa         | Contenido                              | Se redibuja cuando          |
 * |--------------|----------------------------------------|-----------------------------|
 * | `background` | Rejilla, ejes, escala, fondo del tema   | Tamaño, cámara, zoom o tema |
 * | `world`      | La simulación                           | Cada frame                  |
 * | `hud`        | Leyendas, chips, medidas, selección     | Cambia el estado de UI      |
 *
 * `background` y `hud` viven en un `OffscreenCanvas` (con reserva a un
 * `<canvas>` desconectado del DOM) y se componen sobre el lienzo visible con
 * `drawImage`. **Sigue habiendo un único elemento en el DOM**, que es lo que
 * importa para el rendimiento táctil y para que `whiteboard` no cambie de
 * superficie.
 *
 * En régimen estacionario la rejilla pasa de ~68 operaciones por frame a 0.
 */

/**
 * Crea una superficie fuera de pantalla. `OffscreenCanvas` cuando existe;
 * si no, un `<canvas>` que nunca se inserta en el documento.
 * @param {number} w - Ancho en píxeles de dispositivo.
 * @param {number} h
 * @returns {{canvas: OffscreenCanvas|HTMLCanvasElement, ctx: CanvasRenderingContext2D}|null}
 */
function createSurface(w, h) {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  try {
    if (typeof OffscreenCanvas === 'function') {
      const c = new OffscreenCanvas(width, height);
      const ctx = c.getContext('2d');
      if (ctx) return { canvas: c, ctx };
    }
  } catch {
    /* Safari antiguo y algunos WebView de Android: usar el fallback */
  }
  try {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    if (ctx) return { canvas: c, ctx };
  } catch {
    /* sin DOM */
  }
  return null;
}

/** Una capa fuera de pantalla con su marca de suciedad. */
class Layer {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
    this.canvas = null;
    this.ctx = null;
    this.dirty = true;
    /** Señal arbitraria (versión de cámara + tema) que provocó el último dibujo. */
    this.signature = null;
    this.available = false;
  }

  /**
   * Ajusta el búfer al tamaño CSS × DPR. Redimensionar limpia el contenido,
   * así que siempre marca la capa como sucia.
   */
  resize(cssW, cssH, dpr) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas && this.canvas.width === w && this.canvas.height === h) return;
    if (!this.canvas) {
      const surface = createSurface(w, h);
      if (!surface) {
        this.available = false;
        return;
      }
      this.canvas = surface.canvas;
      this.ctx = surface.ctx;
      this.available = true;
    } else {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dirty = true;
    this.signature = null;
  }

  /** Prepara el contexto: limpia y deja la transformación en px CSS. */
  begin(dpr) {
    const ctx = this.ctx;
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
}

export class LayerStack {
  /**
   * @param {HTMLCanvasElement} canvas - El único lienzo del DOM.
   * @param {object} [opts]
   * @param {CanvasRenderingContext2D} [opts.ctx] - Contexto ya creado por el motor.
   * @param {number} [opts.dpr=1]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = opts.ctx || canvas.getContext('2d');
    this.dpr = Math.max(opts.dpr || 1, 1);
    this.cssW = 1;
    this.cssH = 1;

    this.background = new Layer('background');
    this.hud = new Layer('hud');
    /** @type {Object<string, Layer>} */
    this.layers = { background: this.background, hud: this.hud };
  }

  /**
   * Sincroniza el tamaño de las capas con el del lienzo visible.
   * @param {number} cssW
   * @param {number} cssH
   * @param {number} dpr
   */
  resize(cssW, cssH, dpr) {
    const changed = cssW !== this.cssW || cssH !== this.cssH || dpr !== this.dpr;
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = Math.max(dpr || 1, 1);
    if (!changed) return;
    this.background.resize(this.cssW, this.cssH, this.dpr);
    this.hud.resize(this.cssW, this.cssH, this.dpr);
  }

  /** Marca una capa para redibujar en el próximo frame. */
  invalidate(name) {
    const layer = this.layers[name];
    if (layer) {
      layer.dirty = true;
      layer.signature = null;
    }
    return this;
  }

  /** Marca todas las capas fuera de pantalla. */
  invalidateAll() {
    this.invalidate('background');
    this.invalidate('hud');
    return this;
  }

  /**
   * Redibuja la capa sólo si su firma cambió, y la compone sobre el lienzo.
   *
   * `signature` es cualquier valor comparable con `!==` — la app pasa
   * `camera.version + ':' + theme.name`, así que mover la cámara o cambiar de
   * tema fuerza el redibujo y un frame normal no cuesta nada.
   *
   * @param {'background'|'hud'} name
   * @param {*} signature
   * @param {(ctx: CanvasRenderingContext2D) => void} paint
   */
  paint(name, signature, paint) {
    const layer = this.layers[name];
    if (!layer) return this;

    // Sin OffscreenCanvas ni <canvas> disponible: dibujar directo, sin caché.
    if (!layer.available) {
      try {
        paint(this.ctx);
      } catch (err) {
        console.error(`Error dibujando la capa ${name}:`, err);
      }
      return this;
    }

    if (layer.dirty || layer.signature !== signature) {
      const ctx = layer.begin(this.dpr);
      if (ctx) {
        try {
          paint(ctx);
        } catch (err) {
          console.error(`Error dibujando la capa ${name}:`, err);
        }
        layer.dirty = false;
        layer.signature = signature;
      }
    }
    this.composite(name);
    return this;
  }

  /**
   * Vuelca una capa sobre el lienzo visible. El búfer está en píxeles de
   * dispositivo y el destino en px CSS, de ahí las dimensiones explícitas.
   * @param {'background'|'hud'} name
   */
  composite(name) {
    const layer = this.layers[name];
    if (!layer || !layer.available || !layer.canvas) return this;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(layer.canvas, 0, 0, this.cssW, this.cssH);
    ctx.restore();
    return this;
  }

  /**
   * Rellena el lienzo visible con el color de fondo del tema y deja la
   * transformación lista para dibujar en px CSS.
   * @param {string} bg
   */
  beginFrame(bg) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.canvas.width || 1, this.canvas.height || 1);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return ctx;
  }

  /** Libera las superficies fuera de pantalla. */
  destroy() {
    for (const layer of Object.values(this.layers)) {
      layer.canvas = null;
      layer.ctx = null;
      layer.available = false;
    }
  }
}
