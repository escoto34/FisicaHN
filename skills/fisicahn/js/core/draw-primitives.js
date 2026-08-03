/**
 * @fileoverview draw-primitives — primitivas de dibujo reutilizables.
 *
 * Consolida el `roundRect`, la punta de flecha, el badge `chip` y la `legend`
 * que estaban duplicados en 5–6 módulos y en `renderer.js`. Todas operan sobre
 * un `CanvasRenderingContext2D` en el mismo sistema de coordenadas que el
 * llamador, sin estado global.
 */

/**
 * Dibuja un rectángulo con esquinas redondeadas (fallback si `ctx.roundRect`
 * no existe). Reemplaza 6 polyfills/guards privados.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r - Radio de las esquinas.
 */
export function roundRect(ctx, x, y, w, h, r = 6) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * Dibuja una punta de flecha al final de un vector. Apunta a `(tx, ty)`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} tx
 * @param {number} ty
 * @param {number} angle - Ángulo de la dirección de la flecha (rad).
 * @param {number} size - Longitud de cada ala de la punta.
 */
export function arrowHead(ctx, tx, ty, angle, size = 10) {
  const a1 = angle + Math.PI * 0.85;
  const a2 = angle - Math.PI * 0.85;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + Math.cos(a1) * size, ty + Math.sin(a1) * size);
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + Math.cos(a2) * size, ty + Math.sin(a2) * size);
  ctx.stroke();
}

/**
 * Dibuja una etiqueta «chip» sobre un fondo redondeado. Replica la función
 * `chip()` duplicada en lenses/magnetic/optics.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Centro x del chip.
 * @param {number} y
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.fill] - Color de fondo (default translúcido).
 * @param {string} [opts.color] - Color del texto (default #fff).
 * @param {string} [opts.font]
 * @param {number} [opts.padding=8]
 * @returns {{width:number,height:number}} Dimensiones dibujadas.
 */
export function chip(ctx, x, y, text, opts = {}) {
  const font = opts.font || '12px sans-serif';
  const padding = opts.padding ?? 8;
  ctx.save();
  ctx.font = font;
  const w = ctx.measureText(text).width + padding * 2 + 6;
  const h = 22;
  const left = x - w / 2;
  const top = y - h / 2;
  ctx.fillStyle = opts.fill || 'rgba(15,15,26,0.75)';
  ctx.strokeStyle = opts.color || 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  roundRect(ctx, left, top, w, h, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
  return { width: w, y };
}

/**
 * Dibuja una leyenda horizontal con varios elementos (color + etiqueta).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{color:string, label:string}>} items
 * @param {number} x - Esquina superior izquierda.
 * @param {number} y
 * @param {number} [lineLength=14]
 * @returns {number} Altura total ocupada.
 */
export function legend(ctx, items, x, y, lineLength = 14) {
  let cursorX = x;
  const lineHeight = 16;
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  items.forEach((item, i) => {
    ctx.fillStyle = item.color;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursorX, y + lineHeight - 5);
    ctx.lineTo(cursorX + lineLength, y + lineHeight - 5);
    ctx.stroke();
    ctx.fillStyle = item.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, cursorX + lineLength + 5, y + lineHeight - 3);
    cursorX += lineLength + 5 + ctx.measureText(item.label).width + 14;
  });
  ctx.restore();
  return lineHeight;
}