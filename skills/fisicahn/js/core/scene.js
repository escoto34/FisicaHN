/**
 * @fileoverview scene — API de dibujo declarativa (§2.3 y §2.4).
 *
 * El módulo deja de recibir un `CanvasRenderingContext2D` crudo y recibe una
 * **escena**. Dos consecuencias:
 *
 * 1. **Un único espacio de coordenadas.** Regla dura: los módulos nunca acceden
 *    a `ctx.canvas`. En su lugar `scene.viewport()` devuelve SIEMPRE px CSS y
 *    `scene.world()` los límites en unidades de mundo. Eso elimina de raíz los
 *    ocho bugs de DPR de §2.0 (leer `canvas.width`, que en móvil es 1,75× el
 *    ancho CSS, y dibujar la leyenda fuera de pantalla) y los dos parches
 *    divergentes que los tapaban a medias.
 *
 * 2. **El backend queda oculto.** Las 856 llamadas crudas auditadas se
 *    expresan con un vocabulario cerrado, así que la misma escena puede
 *    reproducirse en SVG (§2.8) o, más adelante, sobre WebGL, sin tocar un solo
 *    módulo.
 *
 * Los colores son tokens del tema (§2.5): `theme.velocity`, no `'#39d98a'`.
 * `resolveColor` acepta ambos para que los módulos aún sin migrar sigan
 * funcionando durante la transición.
 */

import { getTheme, resolveColor, seriesColor, seriesDash } from './theme.js';
import { roundRect, arrowHead, hatchLine, thermalColor, ripplePattern, halo, lensPath, photonPath } from './draw-primitives.js';

/** Puntos de trabajo reutilizados: dibujar no debe allocar (§3.2). */
const _a = { x: 0, y: 0 };
const _b = { x: 0, y: 0 };
const _c = { x: 0, y: 0 };

/**
 * Patrón de guiones vacío compartido: `_style` se llama en cada primitiva y
 * antes creaba un `[]` nuevo por llamada (≈ 100 asignaciones/frame en los
 * módulos con muchas líneas).
 */
const EMPTY_DASH = Object.freeze([]);

/** Caja de trabajo para `findFreeBox`: prueba candidatos sin allocar. */
const _scratchBox = { x: 0, y: 0, w: 0, h: 0 };

/** AABB en px CSS: ¿se solapan `a` y `b`? (§13.1) */
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** @param {{x:number,y:number,w:number,h:number}} b @param {Array} boxes */
function overlapsAny(b, boxes) {
  for (let i = 0; i < boxes.length; i++) if (rectsOverlap(b, boxes[i])) return true;
  return false;
}

/*
 * Adaptadores de `pointList`, reutilizados entre llamadas: antes cada
 * `polyline`/`trail`/`plot` creaba un objeto y una clausura, y el caso
 * `TrailBuffer` copiaba el anillo entero con `toArray()` cada frame.
 */
const EMPTY_LIST = { length: 0, at: (_, out) => out };
const _ringList = {
  src: /** @type {any} */ (null),
  length: 0,
  at(i, out) {
    const p = this.src.get(i);
    out.x = p.x;
    out.y = p.y;
    return out;
  }
};
const _flatList = {
  src: /** @type {any} */ (null),
  length: 0,
  at(i, out) {
    const s = this.src;
    out.x = s[i * 2];
    out.y = s[i * 2 + 1];
    return out;
  }
};
const _objList = {
  src: /** @type {any} */ (null),
  length: 0,
  at(i, out) {
    const p = this.src[i] || _a;
    out.x = p.x;
    out.y = p.y;
    return out;
  }
};

/**
 * Normaliza las formas en las que un módulo puede pasar una secuencia de
 * puntos: array de `{x, y}`, array plano `[x0, y0, x1, y1, …]`, un array
 * tipado plano (`Float64Array`) o un `TrailBuffer`.
 *
 * Devuelve un adaptador **compartido** (válido hasta la siguiente llamada):
 * las primitivas lo consumen de inmediato, así que no allocan por frame.
 * @param {Array|object} points
 * @returns {{length: number, at: (i: number, out: {x:number,y:number}) => {x:number,y:number}}}
 */
function pointList(points) {
  if (!points) return EMPTY_LIST;
  // TrailBuffer: expone `size` y `get(i)` en orden cronológico.
  if (typeof points.size === 'number' && typeof points.get === 'function') {
    _ringList.src = points;
    _ringList.length = points.size;
    return _ringList;
  }
  if (typeof points.size === 'number' && typeof points.toArray === 'function') {
    _objList.src = points.toArray();
    _objList.length = _objList.src.length;
    return _objList;
  }
  if (ArrayBuffer.isView(points)) {
    _flatList.src = points;
    _flatList.length = /** @type {any} */ (points).length >> 1;
    return _flatList;
  }
  if (!Array.isArray(points)) return EMPTY_LIST;
  if (points.length && typeof points[0] === 'number') {
    _flatList.src = points;
    _flatList.length = points.length >> 1;
    return _flatList;
  }
  _objList.src = points;
  _objList.length = points.length;
  return _objList;
}

/**
 * Superficie de dibujo: todo el vocabulario de primitivas sobre un contexto y
 * una cámara. La escena instancia una por capa (mundo, fondo, HUD) y les
 * intercambia el `ctx` en cada frame.
 */
export class Surface {
  /**
   * @param {import('./camera.js').Camera} camera
   * @param {object} [opts]
   * @param {boolean} [opts.screenSpace=false] - Si true, las coordenadas ya son px CSS.
   */
  constructor(camera, opts = {}) {
    this.camera = camera;
    /** @type {CanvasRenderingContext2D|null} */
    this.ctx = null;
    this.theme = getTheme();
    this.screenSpace = opts.screenSpace === true;
    this._fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    /** Segundos desde el arranque del módulo; la escena lo sincroniza en `beginFrame`. */
    this.elapsed = 0;
    /** Caché de cadenas `font` por (tamaño, peso, escala del tema). */
    this._fontCache = { scale: -1, map: new Map() };
    /** Caché de degradados radiales de `body` por (color, radio), ligada al `ctx`. */
    this._gradCache = new Map();
    /** Búferes planos reutilizables para series muestreadas (`plot` con `fn`, `curve`). */
    this._fnBufs = [];
  }

  /** @param {CanvasRenderingContext2D} ctx */
  bind(ctx, theme) {
    // Un degradado pertenece al contexto que lo creó: al cambiar de capa o
    // de grabador (SVG) la caché deja de valer.
    if (ctx !== this.ctx) this._gradCache.clear();
    this.ctx = ctx;
    this.theme = theme || getTheme();
    return this;
  }

  /* ---------- conversiones y consultas ---------- */

  /**
   * Tamaño del área de dibujo, **siempre en píxeles CSS**. Sustituye a
   * `ctx.canvas.width`, que devuelve píxeles de dispositivo.
   * @returns {{w:number,h:number,x:number,y:number}}
   */
  viewport() {
    const vp = this.camera.viewport;
    return { x: vp.x, y: vp.y, w: vp.w, h: vp.h };
  }

  /**
   * Límites visibles en unidades de mundo.
   * @returns {{left:number,right:number,top:number,bottom:number}}
   */
  world() {
    return this.camera.bounds();
  }

  /** Longitud de mundo → px CSS. */
  px(worldLength) {
    return this.camera.toPixels(worldLength);
  }

  /** px CSS → longitud de mundo. */
  units(pixelLength) {
    return this.camera.toWorld(pixelLength);
  }

  /** Proyecta un punto según el espacio de la superficie. */
  project(x, y, out = { x: 0, y: 0 }) {
    if (this.screenSpace) {
      out.x = x;
      out.y = y;
      return out;
    }
    return this.camera.worldToScreen(x, y, out);
  }

  /** Grosor de trazo con el multiplicador del tema aplicado (modo proyector). */
  lineWidth(w = 1) {
    return Math.max(0.5, w * this.theme.lineScale);
  }

  /** Tamaño de fuente con el multiplicador del tema aplicado. */
  fontSize(size = 12) {
    return size * this.theme.fontScale;
  }

  /**
   * Construye la cadena `font` con la escala del tema. Cacheada: `label` y
   * `chip` la pedían dos veces por etiqueta y la concatenación era una de las
   * pocas asignaciones de cadena que quedaban en el bucle caliente.
   */
  font(size = 12, weight = '') {
    const cache = this._fontCache;
    const scale = this.theme.fontScale;
    if (cache.scale !== scale) {
      cache.map.clear();
      cache.scale = scale;
    }
    const key = weight ? `${size}|${weight}` : size;
    let f = cache.map.get(key);
    if (f === undefined) {
      const s = Math.round(this.fontSize(size));
      f = `${weight ? weight + ' ' : ''}${s}px ${this._fontFamily}`;
      cache.map.set(key, f);
    }
    return f;
  }

  /** Resuelve un token del tema o devuelve el literal CSS tal cual. */
  color(value, fallback = 'text') {
    return resolveColor(value, fallback);
  }

  /**
   * Aplica trazo, relleno y patrón de guiones comunes a todas las primitivas.
   * @param {object} opts
   * @param {string} [defaultToken]
   */
  _style(opts, defaultToken = 'text') {
    const ctx = this.ctx;
    const stroke = this.color(opts.color, defaultToken);
    ctx.strokeStyle = stroke;
    ctx.fillStyle = this.color(opts.fill || opts.color, defaultToken);
    ctx.lineWidth = this.lineWidth(opts.width ?? 2);
    ctx.lineCap = opts.cap || 'round';
    ctx.lineJoin = opts.join || 'round';
    ctx.globalAlpha = opts.alpha ?? 1;
    // `dash` es la señal redundante que exige el perfil accesible: el color
    // nunca debe ser el único canal que distingue dos magnitudes.
    ctx.setLineDash(opts.dash || EMPTY_DASH);
    if (opts.glow && this.theme.glow) {
      ctx.shadowColor = stroke;
      ctx.shadowBlur = opts.glow === true ? 8 : opts.glow;
    } else {
      ctx.shadowBlur = 0;
    }
    return ctx;
  }

  /* ---------- geometría ---------- */

  /** Segmento entre dos puntos del mundo. */
  line(x1, y1, x2, y2, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x1, y1, _a);
    const ax = p.x;
    const ay = p.y;
    const q = this.project(x2, y2, _b);
    ctx.save();
    this._style(opts, 'axis');
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.restore();
    return this;
  }

  /**
   * Polilínea abierta. Acepta `[{x,y}…]`, `[x0,y0,x1,y1…]` o un `TrailBuffer`.
   * @param {Array|object} points
   * @param {object} [opts]
   */
  polyline(points, opts = {}) {
    const ctx = this.ctx;
    const list = pointList(points);
    if (!ctx || list.length < 2) return this;
    ctx.save();
    this._style(opts, 'text');
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      list.at(i, _a);
      const p = this.project(_a.x, _a.y, _b);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
    return this;
  }

  /**
   * Camino cerrado, relleno y/o contorneado.
   * @param {Array|object} points
   * @param {object} [opts]
   */
  path(points, opts = {}) {
    const ctx = this.ctx;
    const list = pointList(points);
    if (!ctx || list.length < 2) return this;
    ctx.save();
    this._style(opts, 'text');
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      list.at(i, _a);
      const p = this.project(_a.x, _a.y, _b);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    if (opts.close !== false) ctx.closePath();
    if (opts.fill) {
      ctx.fillStyle = this.color(opts.fill, 'text');
      ctx.globalAlpha = opts.fillAlpha ?? opts.alpha ?? 0.3;
      ctx.fill();
      ctx.globalAlpha = opts.alpha ?? 1;
    }
    if (opts.stroke !== false) ctx.stroke();
    ctx.restore();
    return this;
  }

  /** Circunferencia de radio en unidades de mundo (isotrópica). */
  circle(x, y, r, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const rp = this.screenSpace ? r : this.px(r);
    ctx.save();
    this._style(opts, 'mass');
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, rp), 0, Math.PI * 2);
    if (opts.fill) {
      ctx.fillStyle = this.color(opts.fill, 'mass');
      ctx.fill();
    }
    if (opts.stroke !== false) ctx.stroke();
    ctx.restore();
    return this;
  }

  /**
   * Rectángulo **centrado** en (x, y), con ancho y alto en unidades de mundo.
   * @param {number} x - Centro.
   * @param {number} y - Centro.
   */
  rect(x, y, w, h, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const wp = this.screenSpace ? w : this.px(w);
    const hp = this.screenSpace ? h : this.px(h);
    ctx.save();
    this._style(opts, 'mass');
    if (opts.rotation) {
      ctx.translate(p.x, p.y);
      ctx.rotate(-opts.rotation);
      ctx.translate(-p.x, -p.y);
    }
    const left = p.x - wp / 2;
    const top = p.y - hp / 2;
    if (opts.radius) roundRect(ctx, left, top, wp, hp, opts.radius);
    else {
      ctx.beginPath();
      ctx.rect(left, top, wp, hp);
    }
    if (opts.fill) {
      ctx.fillStyle = this.color(opts.fill, 'mass');
      ctx.fill();
    }
    if (opts.stroke !== false) ctx.stroke();
    ctx.restore();
    return this;
  }

  /** Arco de circunferencia. Ángulos en radianes, sentido matemático. */
  arc(x, y, r, startAngle, endAngle, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const rp = this.screenSpace ? r : this.px(r);
    ctx.save();
    this._style(opts, 'accel');
    ctx.beginPath();
    // El eje Y del lienzo crece hacia abajo: se invierten los ángulos.
    ctx.arc(p.x, p.y, Math.max(0.5, rp), -startAngle, -endAngle, true);
    if (opts.fill) {
      ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = this.color(opts.fill, 'accel');
      ctx.globalAlpha = opts.fillAlpha ?? 0.2;
      ctx.fill();
      ctx.globalAlpha = opts.alpha ?? 1;
    } else if (opts.stroke !== false) {
      ctx.stroke();
    }
    ctx.restore();
    return this;
  }

  /** Polígono cerrado (alias explícito de `path` con cierre obligatorio). */
  polygon(points, opts = {}) {
    return this.path(points, { ...opts, close: true });
  }

  /**
   * Lente delgada como óvalo de libro de texto (§2.4, WAVE 5.4 → lentes).
   * La excentricidad visual se deriva de la focal del módulo: a menor |f| (lente
   * más fuerte) más abombada; a mayor |f| más plana.
   * @param {number} x - Centro óptico.
   * @param {number} y - Centro óptico.
   * @param {number} h - Altura total de la lente (unidades de mundo).
   * @param {object} [opts]
   * @param {string} [opts.type='biconvex'] - biconvex | plano-convex | meniscus-convex | biconcave | plano-concave | meniscus-concave.
   * @param {number} [opts.bulge=0.6] - Excentricidad visual de la curvatura en [0,1] (ver `lensBulgeFromFocal`).
   * @param {boolean} [opts.flip=false] - Espeja la lente (cara curva hacia el otro lado).
   * @param {number} [opts.halfWidth] - Semiancho máximo (mundo); por defecto h × 0.16.
   * @param {string|number} [opts.color='mass'] - Color del contorno.
   * @param {string|number} [opts.fill] - Relleno del cristal (ej. translúcido).
   * @param {number} [opts.fillAlpha=0.25] - Opacidad del relleno.
   * @param {boolean} [opts.ticks=true] - Marcas horizontales en los extremos (estilo libro).
   * @param {number} [opts.width=2.4] - Grosor del contorno.
   */
  lens(x, y, h, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const hp = this.screenSpace ? h / 2 : this.px(h) / 2; // hp = semialto en px
    const half = opts.halfWidth ?? h * 0.16;
    const rxp = this.screenSpace ? half : this.px(half);
    const bulge = Math.max(0.02, Math.min(1, opts.bulge ?? 0.6));
    const ry = Math.max(0.5, hp);
    const rx = Math.max(0.5, rxp);
    ctx.save();
    this._style(opts, 'mass');
    lensPath(ctx, p.x, p.y, rx, ry, opts.type || 'biconvex', bulge, !!opts.flip);
    if (opts.fill) {
      // Brillo de cristal: más denso en el eje óptico, tenue en los bordes.
      const fillColor = this.color(opts.fill, 'mass');
      const alpha = opts.fillAlpha ?? 0.25;
      ctx.globalAlpha = alpha;
      try {
        const g = ctx.createLinearGradient(p.x - rx, p.y, p.x + rx, p.y);
        g.addColorStop(0, fillColor);
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, fillColor);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.globalAlpha = alpha * 0.6;
      } catch {
        /* el grabador SVG no expone gradientes */
      }
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (opts.stroke !== false) ctx.stroke();
    if (opts.ticks !== false) {
      // Marcas de libro en los vértices superior e inferior.
      const tick = Math.max(4, rx * 0.9);
      ctx.beginPath();
      ctx.moveTo(p.x - tick, p.y - ry);
      ctx.lineTo(p.x + tick, p.y - ry);
      ctx.moveTo(p.x - tick, p.y + ry);
      ctx.lineTo(p.x + tick, p.y + ry);
      ctx.stroke();
    }
    ctx.restore();
    return this;
  }

  /**
   * Elipse centrada en (x, y) — óvalo genérico con `rx`/`ry` en unidades de
   * mundo (útil también para etiquetar óvalos simbólicos de lentes).
   */
  ellipse(x, y, rx, ry, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const rxp = this.screenSpace ? rx : this.px(rx);
    const ryp = this.screenSpace ? ry : this.px(ry);
    ctx.save();
    this._style(opts, 'mass');
    // Elipse exacta con 4 Bézier (constante kappa), válida en canvas y SVG.
    const ex = Math.max(0.5, rxp);
    const ey = Math.max(0.5, ryp);
    const k = 0.5522847498;
    ctx.beginPath();
    ctx.moveTo(p.x + ex, p.y);
    ctx.bezierCurveTo(p.x + ex, p.y + k * ey, p.x + k * ex, p.y + ey, p.x, p.y + ey);
    ctx.bezierCurveTo(p.x - k * ex, p.y + ey, p.x - ex, p.y + k * ey, p.x - ex, p.y);
    ctx.bezierCurveTo(p.x - ex, p.y - k * ey, p.x - k * ex, p.y - ey, p.x, p.y - ey);
    ctx.bezierCurveTo(p.x + k * ex, p.y - ey, p.x + ex, p.y - k * ey, p.x + ex, p.y);
    ctx.closePath();
    if (opts.fill) {
      ctx.fillStyle = this.color(opts.fill, 'mass');
      ctx.globalAlpha = opts.fillAlpha ?? 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (opts.stroke !== false) ctx.stroke();
    ctx.restore();
    return this;
  }

  /**
   * Relleno de líquido con superficie horizontal (tanda 5.2, `fluids`).
   * `(x, y)` es la **esquina superior izquierda** del líquido; la superficie
   * se dibuja como una línea en `y` y el cuerpo del fluido baja hasta `y + h`.
   * @param {number} x
   * @param {number} y
   * @param {number} w - Ancho en unidades de mundo.
   * @param {number} h - Altura en unidades de mundo.
   * @param {object} [opts]
   * @param {string} [opts.color='field']
   * @param {number} [opts.alpha=0.35]
   * @param {boolean} [opts.level=true] - Dibujar la línea de superficie.
   * @param {boolean} [opts.waves] - Pequeña ondulación en la superficie.
   */
  fill(x, y, w, h, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const color = this.color(opts.color, 'field');
    const p = this.project(x, y, _a);
    const wp = this.screenSpace ? w : this.px(w);
    const hp = this.screenSpace ? h : this.px(h);
    ctx.save();
    ctx.globalAlpha = opts.alpha ?? 0.35;
    ctx.fillStyle = color;
    ctx.fillRect(p.x - wp / 2, p.y, wp, hp);
    ctx.restore();

    if (opts.level !== false) {
      const amp = opts.waves ? 1.5 : 0;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = this.lineWidth(opts.width ?? 1.6);
      ctx.beginPath();
      const n = Math.max(3, Math.round(wp / 14));
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const px0 = p.x - wp / 2 + wp * u;
        const py0 = p.y + amp * Math.sin(u * Math.PI * 2 + (this.elapsed || 0) * 6);
        if (i === 0) ctx.moveTo(px0, py0);
        else ctx.lineTo(px0, py0);
      }
      ctx.stroke();
      ctx.restore();
    }
    return this;
  }

  /* ---------- física ---------- */

  /**
   * Cuerpo físico: la primitiva más usada. Radio/lado en unidades de mundo,
   * de modo que el zoom lo escala como al resto de la escena.
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {'circle'|'rect'|'triangle'} [opts.shape='circle']
   * @param {number} [opts.r=0.3] - Radio (círculo) o semilado (resto).
   * @param {string} [opts.color] - Token del tema.
   * @param {string} [opts.label]
   * @param {number} [opts.rotation] - Radianes.
   */
  body(x, y, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const shape = opts.shape || 'circle';
    const color = this.color(opts.color, 'mass');
    const r = opts.r ?? opts.size ?? 0.3;
    const p = this.project(x, y, _a);
    const rp = Math.max(3, this.screenSpace ? r : this.px(r));

    ctx.save();
    ctx.translate(p.x, p.y);
    if (opts.rotation) ctx.rotate(-opts.rotation);
    ctx.globalAlpha = opts.alpha ?? 1;
    if (this.theme.glow && opts.glow !== false) {
      ctx.shadowColor = color;
      ctx.shadowBlur = Math.min(18, rp * 0.9);
    }
    ctx.fillStyle = color;

    if (shape === 'circle') {
      // El degradado da volumen sin coste apreciable; en proyector se omite
      // porque el brillo se pierde y sólo baja el contraste.
      if (this.theme.glow) ctx.fillStyle = this._bodyGradient(color, rp);
      ctx.beginPath();
      ctx.arc(0, 0, rp, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'rect') {
      const w = opts.w != null ? (this.screenSpace ? opts.w : this.px(opts.w)) : rp * 2;
      const h = opts.h != null ? (this.screenSpace ? opts.h : this.px(opts.h)) : rp * 2;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    } else if (shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(rp, 0);
      ctx.lineTo(-rp * 0.5, -rp * 0.866);
      ctx.lineTo(-rp * 0.5, rp * 0.866);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = this.lineWidth(1.5);
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, rp, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'rect') {
      const w = opts.w != null ? (this.screenSpace ? opts.w : this.px(opts.w)) : rp * 2;
      const h = opts.h != null ? (this.screenSpace ? opts.h : this.px(opts.h)) : rp * 2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();

    if (opts.label) {
      // `avoid` por defecto (§13.1): con varios cuerpos cerca — partículas,
      // proyectiles — sus etiquetas se pisan sin esto. `opts.avoidLabel: false`
      // lo desactiva para el caso puntual que lo necesite.
      this.label(x, y, opts.label, {
        color: opts.labelColor || opts.color,
        offsetY: -(rp + 8),
        avoid: opts.avoidLabel !== false
      });
    }
    if (opts.id) this.pickable(opts.id, { x, y, r });
    return this;
  }

  /**
   * Degradado radial de `body`, cacheado por color y radio (a ½ px). Es
   * relativo al origen trasladado, así que vale para cualquier posición: un
   * gas de 300 moléculas pasaba de 300 `createRadialGradient` por frame a 0.
   * @param {string} color @param {number} rp - Radio en px.
   */
  _bodyGradient(color, rp) {
    const r = Math.round(rp * 2) / 2;
    const key = color + '|' + r;
    const cache = this._gradCache;
    let g = cache.get(key);
    if (g === undefined) {
      if (cache.size > 512) cache.clear();
      g = this.ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.18, color);
      g.addColorStop(0.85, color);
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      cache.set(key, g);
    }
    return g;
  }

  /**
   * Vector con punta de flecha. `(dx, dy)` en unidades de mundo.
   * @param {object} [opts]
   * @param {number} [opts.labelSide=1] - Desplaza la etiqueta perpendicular (evita solapes F/v).
   */
  vector(x, y, dx, dy, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const color = this.color(opts.color, 'velocity');
    const from = this.project(x, y, _a);
    const fx = from.x;
    const fy = from.y;
    const to = this.project(x + dx, y + dy, _b);
    const len = Math.hypot(to.x - fx, to.y - fy);
    if (len < 0.5) return this;
    const angle = Math.atan2(to.y - fy, to.x - fx);
    const head = Math.min(14 * this.theme.lineScale, Math.max(6, len * 0.28));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = this.lineWidth(opts.width ?? 2.5);
    ctx.lineCap = 'round';
    ctx.setLineDash(opts.dash || []);
    ctx.globalAlpha = opts.alpha ?? 1;
    if (this.theme.glow) {
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
    ctx.lineTo(to.x - head * Math.cos(angle - 0.4), to.y - head * Math.sin(angle - 0.4));
    ctx.lineTo(to.x - head * Math.cos(angle + 0.4), to.y - head * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (opts.label) {
      const side = opts.labelSide ?? 1;
      const pad = (opts.labelPad ?? 14) * this.theme.fontScale;
      const mx = (fx + to.x) / 2 - Math.sin(angle) * side * pad;
      const my = (fy + to.y) / 2 + Math.cos(angle) * side * pad;
      const text = opts.unit ? `${opts.label} ${opts.unit}` : opts.label;
      this._screenText(mx, my, text, { color, size: 12, align: 'center', baseline: 'middle' });
    }
    return this;
  }

  /**
   * Estela con desvanecido. Acepta `TrailBuffer` directamente, que es la
   * estructura de anillo que sustituyó al `push`+`shift()` de 6 módulos.
   */
  trail(points, opts = {}) {
    const ctx = this.ctx;
    const list = pointList(points);
    if (!ctx || list.length < 2) return this;
    const color = this.color(opts.color, 'trail');
    const fade = opts.fade !== false;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = this.lineWidth(opts.width ?? 2);
    ctx.lineCap = 'round';
    ctx.setLineDash(opts.dash || []);
    if (!fade) {
      ctx.globalAlpha = opts.alpha ?? 0.6;
      ctx.beginPath();
      for (let i = 0; i < list.length; i++) {
        list.at(i, _a);
        const p = this.project(_a.x, _a.y, _b);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    } else {
      // Desvanecido por segmento: el trazo antiguo se apaga sin necesidad de
      // recortar el buffer, que es lo que antes forzaba un `shift()` por frame.
      let px = 0;
      let py = 0;
      for (let i = 0; i < list.length; i++) {
        list.at(i, _a);
        const p = this.project(_a.x, _a.y, _b);
        if (i > 0) {
          ctx.globalAlpha = (i / list.length) * (opts.alpha ?? 0.75);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        px = p.x;
        py = p.y;
      }
    }
    ctx.restore();
    return this;
  }

  /**
   * Muelle helicoidal entre dos puntos del mundo.
   * @param {object} [opts]
   * @param {number} [opts.coils=10]
   * @param {number} [opts.amplitude=0.2] - Semiancho en unidades de mundo.
   */
  spring(ax, ay, bx, by, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const coils = opts.coils ?? 10;
    const amp = this.px(opts.amplitude ?? 0.2);
    const from = this.project(ax, ay, _a);
    const fx = from.x;
    const fy = from.y;
    const to = this.project(bx, by, _b);
    const dx = to.x - fx;
    const dy = to.y - fy;
    const len = Math.hypot(dx, dy);
    if (len < 1) return this;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    // 15 % de cada extremo son tramos rectos: así el muelle «engancha».
    const lead = len * 0.15;
    const body = len - lead * 2;
    const steps = Math.max(2, coils * 2);

    ctx.save();
    ctx.strokeStyle = this.color(opts.color, 'spring');
    ctx.lineWidth = this.lineWidth(opts.width ?? 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + ux * lead, fy + uy * lead);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const along = lead + body * t;
      const side = i % 2 === 0 ? -1 : 1;
      ctx.lineTo(fx + ux * along + nx * amp * side, fy + uy * along + ny * amp * side);
    }
    ctx.lineTo(to.x - ux * lead, to.y - uy * lead);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
    return this;
  }

  /** Polea: rueda con eje y, opcionalmente, la cuerda tangente. */
  pulley(x, y, r, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const rp = this.px(r);
    const color = this.color(opts.color, 'spring');
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = this.lineWidth(opts.width ?? 2);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rp, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, rp * 0.18), 0, Math.PI * 2);
    ctx.fill();
    if (opts.angle != null) {
      // Marca radial: hace visible el giro, que con un círculo liso se pierde.
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(-opts.angle) * rp, p.y + Math.sin(-opts.angle) * rp);
      ctx.stroke();
    }
    ctx.restore();
    return this;
  }

  /**
   * Rayo óptico: segmento con flecha intermedia y guiones opcionales.
   * @param {number} angle - Radianes.
   * @param {number} length - Unidades de mundo.
   */
  ray(x, y, angle, length, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const color = this.color(opts.color, 'ray');
    const from = this.project(x, y, _a);
    const fx = from.x;
    const fy = from.y;
    const to = this.project(x + Math.cos(angle) * length, y + Math.sin(angle) * length, _b);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = this.lineWidth(opts.width ?? 2);
    ctx.setLineDash(opts.dash || []);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    if (opts.arrow !== false) {
      ctx.setLineDash([]);
      const mx = (fx + to.x) / 2;
      const my = (fy + to.y) / 2;
      const sa = Math.atan2(to.y - fy, to.x - fx);
      arrowHead(ctx, mx, my, sa, 9 * this.theme.lineScale);
    }
    ctx.restore();
    if (opts.label) {
      const lx = x + Math.cos(angle) * length;
      const ly = y + Math.sin(angle) * length;
      this.label(lx, ly, opts.label, { color: opts.color });
    }
    return this;
  }

  /** Frente de onda: circunferencia que se desvanece con el radio. */
  wavefront(x, y, r, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || r <= 0) return this;
    const p = this.project(x, y, _a);
    ctx.save();
    ctx.strokeStyle = this.color(opts.color, 'field');
    ctx.lineWidth = this.lineWidth(opts.width ?? 1.5);
    ctx.globalAlpha = opts.alpha ?? Math.max(0.05, 1 - r / (opts.maxR || 20));
    ctx.setLineDash(opts.dash || []);
    ctx.beginPath();
    ctx.arc(p.x, p.y, this.px(r), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return this;
  }

  /**
   * Campo vectorial muestreado en una rejilla. El muestreador recibe las
   * coordenadas de mundo y escribe la componente en `out`.
   * @param {(x:number, y:number, out:{x:number,y:number}) => {x:number,y:number}} sample
   * @param {object} [opts]
   * @param {number} [opts.density=12] - Muestras a lo ancho del viewport.
   * @param {number} [opts.scale=1] - Multiplicador de la longitud dibujada.
   */
  field(sample, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || typeof sample !== 'function') return this;
    const density = Math.max(2, Math.min(40, opts.density ?? 12));
    const b = this.world();
    const stepX = (b.right - b.left) / density;
    const stepY = stepX; // isotrópico: la rejilla del campo no se deforma
    const color = this.color(opts.color, 'field');
    const maxLen = opts.maxLength ?? stepX * 0.8;
    const scale = opts.scale ?? 1;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = this.lineWidth(opts.width ?? 1.2);
    ctx.globalAlpha = opts.alpha ?? 0.75;
    for (let gx = b.left + stepX / 2; gx < b.right; gx += stepX) {
      for (let gy = b.bottom + stepY / 2; gy < b.top; gy += stepY) {
        _c.x = 0;
        _c.y = 0;
        const v = sample(gx, gy, _c) || _c;
        const mag = Math.hypot(v.x, v.y);
        if (!Number.isFinite(mag) || mag < 1e-9) continue;
        // Longitud saturada: sin esto, cerca de una carga puntual las flechas
        // se disparan y tapan la escena.
        const len = Math.min(maxLen, mag * scale);
        const ux = (v.x / mag) * len;
        const uy = (v.y / mag) * len;
        const from = this.project(gx - ux / 2, gy - uy / 2, _a);
        const fx = from.x;
        const fy = from.y;
        const to = this.project(gx + ux / 2, gy + uy / 2, _b);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        arrowHead(ctx, to.x, to.y, Math.atan2(to.y - fy, to.x - fx), 5 * this.theme.lineScale);
      }
    }
    ctx.restore();
    return this;
  }

  /**
   * Punta de flecha suelta sobre un punto del mundo, orientada según un
   * ángulo en sentido matemático (radianes, mundo). Sirve para marcar el
   * sentido de una curva ya trazada — líneas de campo, corrientes, flujos —
   * sin dibujar un vector completo. Tamaño en px CSS (escala con el tema).
   * @param {number} x @param {number} y
   * @param {number} angle - Dirección en el mundo (rad, y hacia arriba).
   * @param {object} [opts]
   * @param {string} [opts.color='field']
   * @param {number} [opts.size=7] - Longitud de la punta, px CSS.
   * @param {number} [opts.alpha=0.9]
   */
  arrowMark(x, y, angle, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    // Ángulo de pantalla: el eje Y del lienzo crece hacia abajo.
    const sa = this.screenSpace ? angle : -angle;
    const size = (opts.size ?? 7) * this.theme.lineScale;
    const color = this.color(opts.color, 'field');
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = opts.alpha ?? 0.9;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(sa) * size * 0.5, p.y + Math.sin(sa) * size * 0.5);
    ctx.lineTo(p.x - size * Math.cos(sa - 0.45), p.y - size * Math.sin(sa - 0.45));
    ctx.lineTo(p.x - size * Math.cos(sa + 0.45), p.y - size * Math.sin(sa + 0.45));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return this;
  }

  /* ---------- anotación ---------- */

  /** Texto en coordenadas de pantalla (uso interno de las primitivas). */
  _screenText(sx, sy, text, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    ctx.save();
    ctx.font = this.font(opts.size ?? 13, opts.weight);
    this._fillText(sx, sy, text, opts);
    ctx.restore();
    return this;
  }

  /**
   * Núcleo de `_screenText` sin `save/restore` ni `font`: para las primitivas
   * que ya han medido el texto con la fuente puesta (`label`, `chip`) y no
   * necesitan un segundo par `save/restore` por etiqueta.
   */
  _fillText(sx, sy, text, opts) {
    const ctx = this.ctx;
    ctx.fillStyle = this.color(opts.color, 'text');
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'bottom';
    if (this.theme.dark) {
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
    }
    ctx.fillText(text, sx, sy);
  }

  /**
   * Caja AABB de un texto en px CSS, según su punto de anclaje, alineación y
   * línea base (§13.1) — para registrar el espacio ocupado y detectar
   * solapes, sin depender de cómo `_screenText` interpreta esos mismos ejes.
   */
  _textBox(px, py, w, h, align = 'center', baseline = 'bottom') {
    const x = align === 'left' ? px : align === 'right' ? px - w : px - w / 2;
    const y = baseline === 'top' ? py : baseline === 'middle' ? py - h / 2 : py - h;
    return { x, y, w, h };
  }

  /**
   * Busca dónde colocar `box` sin pisar otra etiqueta ya registrada este
   * frame (§13.1). Si `opts.avoid` no está activo, o no hay escena, registra
   * la caja tal cual y no la mueve.
   */
  _placeBox(box, opts) {
    if (!opts.avoid || !this._scene) {
      if (this._scene) this._scene.registerBox(box);
      return box;
    }
    return this._scene.findFreeBox(box);
  }

  /** Etiqueta anclada a un punto del mundo. Con `opts.avoid` evita pisar otras etiquetas del frame (§13.1). */
  label(x, y, text, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    let sx = p.x + (opts.offsetX || 0);
    let sy = p.y + (opts.offsetY || 0);
    const size = opts.size ?? 13;
    // Un solo `save/restore`: medir y pintar con la misma fuente puesta.
    ctx.save();
    ctx.font = this.font(size, opts.weight);
    const w = ctx.measureText(text).width;
    const h = this.fontSize(size * 1.35);
    const align = opts.align || 'center';
    const baseline = opts.baseline || 'bottom';
    const box = this._textBox(sx, sy, w, h, align, baseline);
    const placed = this._placeBox(box, opts);
    sx += placed.x - box.x;
    sy += placed.y - box.y;
    this._fillText(sx, sy, text, opts);
    ctx.restore();
    return this;
  }

  /**
   * Etiqueta con línea guía: para objetos pequeños donde el texto no cabe
   * encima (§13.1). Se aparta con el mismo registro de cajas que `label` y
   * `chip`, así que nunca pisa una etiqueta ya colocada este frame.
   * @param {number} x @param {number} y @param {string} text
   * @param {object} [opts]
   * @param {number} [opts.angle=-Math.PI/4] - Dirección de la guía, radianes.
   * @param {number} [opts.distance=26] - Longitud de la guía, px CSS.
   */
  callout(x, y, text, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const size = opts.size ?? 11;
    ctx.save();
    ctx.font = this.font(size);
    const w = ctx.measureText(text).width;
    ctx.restore();
    const h = this.fontSize(size * 1.6);
    const angle = opts.angle ?? -Math.PI / 4;
    const dist = opts.distance ?? 26;
    const tx = p.x + Math.cos(angle) * dist;
    const ty = p.y + Math.sin(angle) * dist;
    const align = Math.cos(angle) >= 0 ? 'left' : 'right';
    const box = { x: align === 'left' ? tx : tx - w, y: ty - h / 2, w, h };
    const placed = opts.avoid === false ? (this._scene ? this._scene.registerBox(box) : box) : this._placeBox(box, { avoid: true });
    const anchorX = align === 'left' ? placed.x : placed.x + placed.w;
    const midY = placed.y + placed.h / 2;
    ctx.save();
    ctx.strokeStyle = this.color(opts.lineColor || opts.color, 'textDim');
    ctx.lineWidth = this.lineWidth(1);
    ctx.setLineDash(opts.dash || [2, 2]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(anchorX, midY);
    ctx.stroke();
    ctx.restore();
    return this._screenText(anchorX, midY, text, { ...opts, align, baseline: 'middle' });
  }

  /** Insignia con fondo: legible sobre cualquier parte de la escena. Con `opts.avoid` evita pisar otras etiquetas del frame (§13.1). */
  chip(x, y, text, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    let px = p.x + (opts.offsetX || 0);
    let py = p.y + (opts.offsetY || 0);
    ctx.save();
    ctx.font = this.font(opts.size ?? 12);
    const padX = 8 * this.theme.fontScale;
    const w = ctx.measureText(text).width + padX * 2;
    const h = this.fontSize(22);
    const box = this._textBox(px, py, w, h, 'center', 'middle');
    const placed = this._placeBox(box, opts);
    px += placed.x - box.x;
    py += placed.y - box.y;
    ctx.fillStyle = opts.background || this.theme.hudBg;
    ctx.strokeStyle = this.color(opts.color, 'hudBorder');
    ctx.lineWidth = this.lineWidth(1);
    roundRect(ctx, px - w / 2, py - h / 2, w, h, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.color(opts.color, 'text');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px, py);
    ctx.restore();
    return this;
  }

  /**
   * Cota acotada entre dos puntos, con líneas de extensión y flechas: la
   * notación estándar de un diagrama de física.
   */
  dimension(x1, y1, x2, y2, text, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const color = this.color(opts.color, 'textDim');
    const from = this.project(x1, y1, _a);
    const fx = from.x;
    const fy = from.y;
    const to = this.project(x2, y2, _b);
    const angle = Math.atan2(to.y - fy, to.x - fx);
    const off = opts.offset ?? 0;
    const nx = -Math.sin(angle) * off;
    const ny = Math.cos(angle) * off;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = this.lineWidth(1.2);
    ctx.setLineDash(opts.dash || []);
    ctx.beginPath();
    ctx.moveTo(fx + nx, fy + ny);
    ctx.lineTo(to.x + nx, to.y + ny);
    ctx.stroke();
    arrowHead(ctx, fx + nx, fy + ny, angle + Math.PI, 7 * this.theme.lineScale);
    arrowHead(ctx, to.x + nx, to.y + ny, angle, 7 * this.theme.lineScale);
    if (off) {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + nx, fy + ny);
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x + nx, to.y + ny);
      ctx.stroke();
    }
    ctx.restore();
    if (text) {
      this._screenText((fx + to.x) / 2 + nx, (fy + to.y) / 2 + ny - 6, text, {
        color: opts.color,
        size: 11
      });
    }
    return this;
  }

  /** Arco de ángulo con su medida en grados. */
  angleArc(cx, cy, startAngle, endAngle, r, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    this.arc(cx, cy, r, startAngle, endAngle, {
      color: opts.color || 'accel',
      width: opts.width ?? 1.5,
      fill: opts.fill,
      fillAlpha: opts.fillAlpha
    });
    if (opts.label !== false) {
      let deg = Math.abs(((endAngle - startAngle) * 180) / Math.PI);
      if (deg > 180) deg = 360 - deg;
      const mid = (startAngle + endAngle) / 2;
      const text = opts.label || `${deg.toFixed(1)}°`;
      this.label(cx + Math.cos(mid) * r * 1.4, cy + Math.sin(mid) * r * 1.4, text, {
        color: opts.color || 'accel',
        size: 11,
        baseline: 'middle'
      });
    }
    return this;
  }

  /** Globo de información anclado sobre un punto del mundo. */
  tooltip(x, y, text, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    ctx.save();
    ctx.font = this.font(12);
    const pad = 6 * this.theme.fontScale;
    const w = ctx.measureText(text).width + pad * 2;
    const h = this.fontSize(22);
    const top = p.y - h - 8;
    ctx.fillStyle = this.theme.hudBg;
    ctx.strokeStyle = this.theme.hudBorder;
    ctx.lineWidth = this.lineWidth(1);
    roundRect(ctx, p.x - w / 2, top, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.color(opts.color, 'text');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, p.x, top + h / 2);
    ctx.restore();
    return this;
  }

  /* ---------- vocabulario visual (§13.2): forma y textura, no sólo color ---------- */

  /**
   * Rayado diagonal entre dos puntos del mundo: símbolo estándar de apoyo
   * fijo o sección sólida en los diagramas de estática (`statics`), también
   * útil como textura de pared/suelo en otros módulos.
   * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
   * @param {object} [opts]
   * @param {number} [opts.side=1] - 1 o -1: a qué lado de la línea caen los trazos.
   */
  hatch(x1, y1, x2, y2, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const from = this.project(x1, y1, _a);
    const to = this.project(x2, y2, _b);
    ctx.save();
    ctx.strokeStyle = this.color(opts.color, 'textDim');
    ctx.lineWidth = this.lineWidth(opts.width ?? 1.5);
    hatchLine(ctx, from.x, from.y, to.x, to.y, {
      spacing: (opts.spacing ?? 8) * this.theme.lineScale,
      length: (opts.length ?? 10) * this.theme.lineScale,
      side: opts.side ?? 1
    });
    ctx.restore();
    return this;
  }

  /**
   * Círculo relleno con el color interpolado entre dos extremos según una
   * magnitud continua `t` en [0,1] — degradado de temperatura para
   * `calorimetry` y `thermal-expansion` sin depender de un tercer color
   * "semántico" nuevo: por defecto interpola entre `theme.field` (frío) y
   * `theme.force` (caliente), ya reservados para campo y fuerza.
   * @param {number} x @param {number} y @param {number} r - Radio, unidades de mundo.
   * @param {number} t - [0,1], 0 = frío, 1 = caliente.
   */
  thermal(x, y, r, t, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const cold = this.color(opts.cold, 'field');
    const hot = this.color(opts.hot, 'force');
    const fill = thermalColor(cold, hot, t);
    return this.circle(x, y, r, { ...opts, fill, stroke: opts.stroke !== false, color: opts.color || fill });
  }

  /**
   * Anillos concéntricos ondulados: patrón de fluido/viscosidad para
   * `fluids`, ondas de superficie o cualquier textura de "medio continuo"
   * que no debe leerse como un cuerpo sólido.
   * @param {number} x @param {number} y @param {number} r - Radio máximo, unidades de mundo.
   */
  fluidPattern(x, y, r, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const rp = this.screenSpace ? r : this.px(r);
    ctx.save();
    ctx.strokeStyle = this.color(opts.color, 'field');
    ctx.lineWidth = this.lineWidth(opts.width ?? 1);
    ctx.globalAlpha = opts.alpha ?? 0.5;
    ripplePattern(ctx, p.x, p.y, Math.max(1, rp), {
      rings: opts.rings ?? 3,
      amplitude: (opts.amplitude ?? 2) * this.theme.lineScale,
      waves: opts.waves ?? 10
    });
    ctx.restore();
    return this;
  }

  /**
   * Halo de énfasis: resplandor radial alrededor de un objeto interactivo o
   * seleccionado. Es forma/brillo, no un color semántico nuevo — respeta la
   * regla de la WAVE 12 de no tocar la paleta vectorial.
   * @param {number} x @param {number} y @param {number} r - Radio del cuerpo, unidades de mundo.
   */
  emphasisHalo(x, y, r, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const rp = this.screenSpace ? r : this.px(r);
    halo(ctx, p.x, p.y, Math.max(1, rp), { color: this.color(opts.color, 'mass'), blend: opts.blend });
    return this;
  }

  /**
   * Fotón / onda viajera: garabato sinusoidal con punta de flecha, el símbolo
   * de libro de texto para γ (`atomic`, `photoelectric`, `radioactivity`).
   * `(x, y)` es la cola y `angle`/`length` la dirección y longitud en unidades
   * de mundo. El color suele ser el de la longitud de onda
   * (`wavelengthColor`): acompáñalo siempre de una etiqueta con λ o hf.
   * @param {number} x @param {number} y
   * @param {number} angle - Radianes, sentido matemático.
   * @param {number} length - Unidades de mundo.
   * @param {object} [opts]
   * @param {string} [opts.color='ray']
   * @param {number} [opts.amplitude=0.12] - Semiamplitud, unidades de mundo.
   * @param {number} [opts.waves=3]
   * @param {number} [opts.phase=0] - Fase inicial (anima el garabato).
   * @param {boolean} [opts.arrow=true]
   * @param {string} [opts.label] - Etiqueta en la punta.
   */
  photon(x, y, angle, length, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || !(length > 0)) return this;
    const p = this.project(x, y, _a);
    const lenPx = this.screenSpace ? length : this.px(length);
    const ampPx = this.screenSpace ? (opts.amplitude ?? 4) : this.px(opts.amplitude ?? 0.12);
    ctx.save();
    this._style(opts, 'ray');
    ctx.setLineDash([]);
    // El eje Y del lienzo crece hacia abajo: se invierte el ángulo.
    photonPath(ctx, p.x, p.y, -angle, lenPx, {
      amplitude: ampPx,
      waves: opts.waves ?? 3,
      head: opts.arrow === false ? 0 : 7 * this.theme.lineScale,
      phase: opts.phase ?? 0
    });
    ctx.restore();
    if (opts.label) {
      this.label(x + Math.cos(angle) * length, y + Math.sin(angle) * length, opts.label, {
        color: opts.color,
        size: opts.size ?? 11,
        offsetY: -10,
        avoid: opts.avoid !== false
      });
    }
    return this;
  }

  /* ---------- curvas muestreadas ---------- */

  /**
   * Muestrea `fn` en `n + 1` puntos de `[t0, t1]` sobre el búfer plano
   * `_fnBufs[slot]` (se crea o redimensiona sólo si hace falta). `fn(t, out)`
   * puede devolver `y` (curva y = f(t), con x = t) o escribir `out.x/out.y`
   * (curva paramétrica). Sin asignaciones por frame en régimen estacionario.
   * @param {number} slot @param {(t:number, out:{x:number,y:number}) => (number|void|object)} fn
   * @param {number} t0 @param {number} t1 @param {number} n
   * @returns {Float64Array} Búfer plano `[x0, y0, x1, y1, …]`.
   */
  _sampleFn(slot, fn, t0, t1, n) {
    const len = (n + 1) * 2;
    let buf = this._fnBufs[slot];
    if (!buf || buf.length !== len) {
      buf = new Float64Array(len);
      this._fnBufs[slot] = buf;
    }
    const span = t1 - t0;
    for (let i = 0; i <= n; i++) {
      const t = t0 + (span * i) / n;
      _c.x = t;
      _c.y = 0;
      const r = fn(t, _c);
      if (typeof r === 'number') {
        buf[i * 2] = t;
        buf[i * 2 + 1] = r;
      } else {
        buf[i * 2] = _c.x;
        buf[i * 2 + 1] = _c.y;
      }
    }
    return buf;
  }

  /**
   * Curva definida por una función, sin construir arrays de puntos por frame:
   * ondas, envolventes, curvas analíticas. `fn(t, out)` devuelve `y` para
   * una curva `y = f(t)` (x = t) o escribe `out.x/out.y` para una curva
   * paramétrica (ramas de hipérbola, ondas inclinadas).
   * @param {(t:number, out:{x:number,y:number}) => (number|void|object)} fn
   * @param {number} t0 @param {number} t1 - Rango del parámetro (mundo).
   * @param {object} [opts] - Mismas opciones de estilo que `polyline`.
   * @param {number} [opts.samples=64]
   * @param {boolean} [opts.close=false] - Cierra el camino (y rellena si `opts.fill`).
   */
  curve(fn, t0, t1, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || typeof fn !== 'function') return this;
    const n = Math.max(1, Math.round(opts.samples ?? 64));
    const span = t1 - t0;
    ctx.save();
    this._style(opts, 'text');
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = t0 + (span * i) / n;
      _c.x = t;
      _c.y = 0;
      const r = fn(t, _c);
      if (typeof r === 'number') {
        _c.x = t;
        _c.y = r;
      }
      const p = this.project(_c.x, _c.y, _b);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    if (opts.close) ctx.closePath();
    if (opts.fill) {
      ctx.fillStyle = this.color(opts.fill === true ? opts.color : opts.fill, 'text');
      ctx.globalAlpha = opts.fillAlpha ?? opts.alpha ?? 0.3;
      ctx.fill();
      ctx.globalAlpha = opts.alpha ?? 1;
    }
    if (opts.stroke !== false) ctx.stroke();
    ctx.restore();
    return this;
  }

  /* ---------- entorno: suelo, techo, pared, ejes y rejilla ---------- */

  /**
   * Núcleo de `ground`/`ceiling`/`wall`: línea de apoyo más rayado a un lado,
   * en un único `save/restore`. `sideSign` ya viene resuelto en el sistema de
   * `hatchLine` (pantalla).
   */
  _support(x1, y1, x2, y2, opts, sideSign) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const from = this.project(x1, y1, _a);
    const fx = from.x;
    const fy = from.y;
    const to = this.project(x2, y2, _b);
    const alpha = opts.alpha ?? 1;
    ctx.save();
    ctx.strokeStyle = this.color(opts.color, 'textDim');
    ctx.lineCap = 'butt';
    ctx.setLineDash(EMPTY_DASH);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = this.lineWidth(opts.width ?? 2);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    if (opts.hatch !== false) {
      ctx.lineWidth = this.lineWidth(opts.hatchWidth ?? 1.2);
      ctx.globalAlpha = alpha * (opts.hatchAlpha ?? 0.8);
      hatchLine(ctx, fx, fy, to.x, to.y, {
        spacing: (opts.spacing ?? 9) * this.theme.lineScale,
        length: (opts.length ?? 10) * this.theme.lineScale,
        side: sideSign
      });
    }
    ctx.restore();
    return this;
  }

  /**
   * Suelo: línea horizontal de `x1` a `x2` a la altura `y` con el rayado de
   * apoyo por debajo (notación de libro de texto). Sustituye a las variantes
   * "línea + rectángulo relleno" y "línea + dos trazos" de los módulos.
   * @param {number} x1 @param {number} x2 @param {number} y
   * @param {object} [opts]
   * @param {string} [opts.color='textDim']
   * @param {number} [opts.width=2] - Grosor de la línea.
   * @param {boolean} [opts.hatch=true] - Rayado de apoyo.
   * @param {number} [opts.spacing=9] @param {number} [opts.length=10] - Rayado, px CSS.
   */
  ground(x1, x2, y, opts = {}) {
    return this._support(Math.min(x1, x2), y, Math.max(x1, x2), y, opts, -1);
  }

  /** Techo: como `ground`, con el rayado por encima (soporte de un péndulo, viga de `statics`). */
  ceiling(x1, x2, y, opts = {}) {
    return this._support(Math.min(x1, x2), y, Math.max(x1, x2), y, opts, 1);
  }

  /**
   * Pared vertical en `x` entre `y1` e `y2`, con el rayado hacia el lado
   * sólido (`opts.side`: `'left'` por defecto, o `'right'`).
   */
  wall(x, y1, y2, opts = {}) {
    const side = opts.side === 'right' ? -1 : 1;
    return this._support(x, Math.min(y1, y2), x, Math.max(y1, y2), opts, side);
  }

  /**
   * Ejes cartesianos que cruzan el encuadre por `(opts.x, opts.y)` con marcas
   * cada `opts.tick` unidades, en dos trazos (uno para los ejes y otro para
   * las marcas) en vez de una línea por marca.
   * @param {object} [opts]
   * @param {number} [opts.x=0] @param {number} [opts.y=0] - Origen.
   * @param {string} [opts.color='textDim'] @param {number} [opts.width=1.5]
   * @param {number} [opts.tick=1] - Paso de las marcas (mundo); 0 las omite.
   * @param {number} [opts.tickSize=0.12] - Semilongitud de la marca (mundo).
   * @param {string} [opts.tickColor='axisLabel']
   */
  axes(opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const b = this.world();
    const ox = opts.x ?? 0;
    const oy = opts.y ?? 0;
    ctx.save();
    ctx.setLineDash(EMPTY_DASH);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.strokeStyle = this.color(opts.color, 'textDim');
    ctx.lineWidth = this.lineWidth(opts.width ?? 1.5);
    ctx.beginPath();
    let p = this.project(b.left, oy, _a);
    ctx.moveTo(p.x, p.y);
    p = this.project(b.right, oy, _a);
    ctx.lineTo(p.x, p.y);
    p = this.project(ox, b.bottom, _a);
    ctx.moveTo(p.x, p.y);
    p = this.project(ox, b.top, _a);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    const tick = opts.tick ?? 1;
    if (tick > 0) {
      const ts = opts.tickSize ?? 0.12;
      ctx.strokeStyle = this.color(opts.tickColor, 'axisLabel');
      ctx.lineWidth = this.lineWidth(opts.tickWidth ?? 1);
      ctx.beginPath();
      for (let x = Math.ceil((b.left - ox) / tick) * tick + ox; x <= b.right; x += tick) {
        p = this.project(x, oy - ts, _a);
        ctx.moveTo(p.x, p.y);
        p = this.project(x, oy + ts, _a);
        ctx.lineTo(p.x, p.y);
      }
      for (let y = Math.ceil((b.bottom - oy) / tick) * tick + oy; y <= b.top; y += tick) {
        p = this.project(ox - ts, y, _a);
        ctx.moveTo(p.x, p.y);
        p = this.project(ox + ts, y, _a);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
    return this;
  }

  /**
   * Rejilla de mundo con paso `step`, en un solo trazo (antes: una `line` —
   * con su `save/restore` — por cada una de las ~100 líneas).
   * @param {number} step - Paso en unidades de mundo.
   * @param {object} [opts]
   * @param {string} [opts.color='textDim'] @param {number} [opts.width=0.5] @param {number} [opts.alpha=0.12]
   */
  grid(step, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || !(step > 0)) return this;
    const b = this.world();
    ctx.save();
    ctx.setLineDash(EMPTY_DASH);
    ctx.strokeStyle = this.color(opts.color, 'textDim');
    ctx.lineWidth = this.lineWidth(opts.width ?? 0.5);
    ctx.globalAlpha = opts.alpha ?? 0.12;
    ctx.beginPath();
    let p;
    for (let x = Math.ceil(b.left / step) * step; x <= b.right; x += step) {
      p = this.project(x, b.bottom, _a);
      ctx.moveTo(p.x, p.y);
      p = this.project(x, b.top, _a);
      ctx.lineTo(p.x, p.y);
    }
    for (let y = Math.ceil(b.bottom / step) * step; y <= b.top; y += step) {
      p = this.project(b.left, y, _a);
      ctx.moveTo(p.x, p.y);
      p = this.project(b.right, y, _a);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
    return this;
  }

  /* ---------- instrumentos y aparatos ---------- */

  /**
   * Termómetro de columna: tubo vertical que arranca en `y` (base del tubo,
   * mundo) y sube `h`, bulbo justo debajo y columna llena en la fracción
   * `t` ∈ [0,1]. La escala se declara en fracciones para que el módulo decida
   * el mapeo físico (°C, K…).
   * @param {number} x @param {number} y @param {number} h @param {number} t
   * @param {object} [opts]
   * @param {string} [opts.color='force'] - Columna y bulbo.
   * @param {string} [opts.tube='textDim'] - Contorno del tubo y marcas.
   * @param {number} [opts.width=0.5] - Ancho del tubo (mundo); el resto escala con él.
   * @param {Array<{t:number, label?:string, major?:boolean}>} [opts.ticks] - Marcas a la izquierda.
   * @param {Array<{t:number, label?:string, color?:string}>} [opts.marks] - Líneas de referencia a la derecha (p. ej. T_eq).
   * @param {number} [opts.labelSize=9]
   */
  thermometer(x, y, h, t, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const wT = opts.width ?? 0.5;
    const k = wT / 0.5;
    const tube = opts.tube || 'textDim';
    const color = opts.color || 'force';
    const inset = 0.15 * k;
    const span = Math.max(1e-6, h - 2 * inset);
    const frac = Math.max(0, Math.min(1, t));
    this.rect(x, y + h / 2, wT, h, { color: tube, width: 1.4, fill: 'rgba(255,255,255,0.06)', radius: 4 });
    const colH = span * frac;
    if (colH > 0.02) this.rect(x, y + inset + colH / 2, wT * 0.48, colH, { fill: color, stroke: false, alpha: 0.95 });
    this.circle(x, y - 0.05 * k, 0.38 * k, { color, fill: color, alpha: 0.95, width: 1 });
    const size = opts.labelSize ?? 9;
    if (opts.ticks) {
      for (const tk of opts.ticks) {
        const yy = y + inset + span * Math.max(0, Math.min(1, tk.t));
        this.line(x + wT * 0.5, yy, x + (tk.major ? 1.2 : 0.84) * wT, yy, { color: tube, width: 1 });
        if (tk.label != null) this.label(x - 1.5 * wT, yy, String(tk.label), { color: tube, size, avoid: false });
      }
    }
    if (opts.marks) {
      for (const mk of opts.marks) {
        const yy = y + inset + span * Math.max(0, Math.min(1, mk.t));
        const c = mk.color || 'energy';
        this.line(x + wT * 0.5, yy, x + 1.9 * wT, yy, { color: c, width: 2, dash: [3, 2] });
        if (mk.label != null) this.label(x + 2.1 * wT, yy, mk.label, { color: c, size: size + 1, align: 'left', avoid: false });
      }
    }
    return this;
  }

  /**
   * Barras verticales comparativas sobre la línea base `y`, creciendo hacia
   * arriba; `x` es el centro de la primera barra. Reemplaza los diagramas de
   * barras a mano de `mass-weight` (peso por astro) y `em-waves` (I₁ → I₂).
   * @param {number} x @param {number} y
   * @param {Array<{value:number, color?:string, label?:string, alpha?:number}>} items
   * @param {object} [opts]
   * @param {number} [opts.max] - Escala común; por defecto el mayor `value`.
   * @param {number} [opts.hMax=3] - Altura de la barra de valor `max` (mundo).
   * @param {number} [opts.barW=0.5] @param {number} [opts.gap=0.32] - Anchura y separación (mundo).
   * @param {boolean} [opts.frame=false] - Marco vacío de la escala completa tras cada barra.
   * @param {number} [opts.labelSize=9] @param {number} [opts.labelOffset=0.45] - Etiquetas bajo la base.
   * @param {string} [opts.frameColor='textDim']
   */
  bars(x, y, items, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || !items?.length) return this;
    let max = opts.max;
    if (!(max > 0)) {
      max = 0;
      for (const it of items) if (it.value > max) max = it.value;
      if (!(max > 0)) max = 1;
    }
    const hMax = opts.hMax ?? 3;
    const barW = opts.barW ?? 0.5;
    const gap = opts.gap ?? 0.32;
    const minH = opts.minH ?? 0.02;
    const size = opts.labelSize ?? 9;
    const off = opts.labelOffset ?? 0.45;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const cx = x + i * (barW + gap);
      if (opts.frame) this.rect(cx, y + hMax / 2, barW, hMax, { color: opts.frameColor || 'textDim', width: 1 });
      const hh = Math.max(minH, (hMax * Math.max(0, it.value)) / max);
      const color = it.color || (i % 2 ? 'mass2' : 'energy');
      this.rect(cx, y + hh / 2, barW, hh, { color, fill: color, alpha: it.alpha ?? (opts.frame ? 0.75 : 1), stroke: !opts.frame });
      if (it.label != null) this.label(cx, y - off, it.label, { color: opts.frame ? color : 'textDim', size, avoid: true });
    }
    return this;
  }

  /**
   * Rectángulo centrado en (x, y) relleno con un degradado lineal: fondo
   * frío → caliente, sombreado cilíndrico… Un solo `fillRect` en vez de N
   * bandas. Si el backend no expone degradados cae a `opts.bands` bandas
   * interpoladas (y el grabador SVG aplana al color medio).
   * @param {number} x @param {number} y @param {number} w @param {number} h - Mundo.
   * @param {object} [opts]
   * @param {string} [opts.from='field'] @param {string} [opts.to='force'] - Extremos (token o CSS).
   * @param {Array<[number,string]>} [opts.stops] - Paradas `[offset, color]` que sustituyen a from/to.
   * @param {'horizontal'|'vertical'} [opts.direction='horizontal'] - izquierda→derecha o abajo→arriba.
   * @param {number} [opts.alpha=1]
   * @param {number} [opts.bands=24] - Bandas del fallback sin degradados.
   */
  gradientRect(x, y, w, h, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const wp = this.screenSpace ? w : this.px(w);
    const hp = this.screenSpace ? h : this.px(h);
    const left = p.x - wp / 2;
    const top = p.y - hp / 2;
    const vertical = opts.direction === 'vertical';
    const stops = opts.stops || [
      [0, this.color(opts.from, 'field')],
      [1, this.color(opts.to, 'force')]
    ];
    ctx.save();
    ctx.globalAlpha = opts.alpha ?? 1;
    let done = false;
    if (typeof ctx.createLinearGradient === 'function') {
      try {
        // Vertical: de abajo (offset 0) a arriba (offset 1), como el eje y del mundo.
        const g = vertical ? ctx.createLinearGradient(left, top + hp, left, top) : ctx.createLinearGradient(left, top, left + wp, top);
        for (const [o, c] of stops) g.addColorStop(Math.max(0, Math.min(1, o)), this.color(c, 'text'));
        ctx.fillStyle = g;
        ctx.fillRect(left, top, wp, hp);
        done = true;
      } catch {
        /* backend sin degradados: bandas */
      }
    }
    if (!done) {
      const n = Math.max(2, opts.bands ?? 24);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        let j = 0;
        while (j < stops.length - 2 && stops[j + 1][0] < u) j++;
        const [o0, c0] = stops[j];
        const [o1, c1] = stops[Math.min(j + 1, stops.length - 1)];
        const tt = o1 > o0 ? (u - o0) / (o1 - o0) : 0;
        ctx.fillStyle = thermalColor(this.color(c0, 'text'), this.color(c1, 'text'), tt);
        if (vertical) ctx.fillRect(left, top + hp - ((i + 1) * hp) / n - 0.5, wp, hp / n + 1);
        else ctx.fillRect(left + (i * wp) / n - 0.5, top, wp / n + 1, hp);
      }
    }
    ctx.restore();
    return this;
  }

  /**
   * Llama animada con base en (x, y): tres capas (exterior, media, núcleo)
   * que parpadean con `opts.t` (por defecto el reloj de la escena) y un halo
   * cálido. Es la fuente de calor de `thermal-expansion` y de los módulos de
   * calor en general.
   * @param {number} x @param {number} y - Base de la llama (mundo).
   * @param {object} [opts]
   * @param {number} [opts.h=2.6] @param {number} [opts.w=1.5] - Alto y ancho máximos (mundo).
   * @param {number} [opts.t] - Tiempo (s) para el parpadeo.
   * @param {string} [opts.outer='ray'] @param {string} [opts.mid='force'] @param {string} [opts.core='#fff3c4']
   * @param {boolean} [opts.halo=true]
   */
  flame(x, y, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const t = opts.t ?? this.elapsed ?? 0;
    const h = opts.h ?? 2.6;
    const w = opts.w ?? 1.5;
    const p = this.project(x, y, _a);
    const bx = p.x;
    const by = p.y;
    const hp = this.screenSpace ? h : this.px(h);
    const halfW = (this.screenSpace ? w : this.px(w)) / 2;
    const flick = 1 + 0.12 * Math.sin(t * 9) + 0.06 * Math.sin(t * 17);
    if (opts.halo !== false) {
      halo(ctx, bx, by - hp * 0.38, Math.max(1, halfW * 2.1), { color: opts.haloColor || 'rgba(255,140,80,0.35)' });
    }
    ctx.save();
    ctx.setLineDash(EMPTY_DASH);
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.lineWidth(1);
    const N = 18;
    const layer = (scale, hgt, token, fallback, alpha) => {
      const c = this.color(token, fallback);
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const wobble = 1 + 0.08 * Math.sin(t * 11 + u * 6);
        const sx = bx + Math.sin(u * Math.PI) * halfW * scale * wobble;
        const sy = by - u * hp * hgt * flick;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      for (let i = N; i >= 0; i--) {
        const u = i / N;
        const wobble = 1 + 0.08 * Math.sin(t * 13 + u * 5);
        ctx.lineTo(bx - Math.sin(u * Math.PI) * halfW * scale * wobble, by - u * hp * hgt * flick);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    layer(1, 1, opts.outer, 'ray', 0.75);
    layer(0.55, 0.65, opts.mid, 'force', 0.9);
    layer(0.25, 0.35, opts.core || '#fff3c4', 'text', 0.9);
    ctx.restore();
    return this;
  }

  /**
   * Bobina vista de lado: `loops` espiras apiladas en vertical (o en
   * horizontal con `opts.horizontal`) alrededor de (cx, cy), en un solo
   * trazo. Símbolo de `induction` (Faraday, transformador) y de cualquier
   * solenoide.
   * @param {number} cx @param {number} cy @param {number} loops @param {number} r - Radio de cada espira (mundo).
   * @param {object} [opts]
   * @param {string} [opts.color='energy'] @param {number} [opts.width=2]
   * @param {number} [opts.spacing] - Paso entre espiras (mundo); por defecto 1.15·r.
   * @param {boolean} [opts.horizontal=false]
   */
  coil(cx, cy, loops, r, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || !(loops > 0)) return this;
    const spacing = opts.spacing ?? r * 1.15;
    const rp = Math.max(0.5, this.screenSpace ? r : this.px(r));
    const start = -((loops - 1) * spacing) / 2;
    ctx.save();
    ctx.setLineDash(EMPTY_DASH);
    ctx.strokeStyle = this.color(opts.color, 'energy');
    ctx.lineWidth = this.lineWidth(opts.width ?? 2);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.beginPath();
    for (let i = 0; i < loops; i++) {
      const off = start + i * spacing;
      const p = opts.horizontal ? this.project(cx + off, cy, _a) : this.project(cx, cy + off, _a);
      ctx.moveTo(p.x + rp, p.y);
      ctx.arc(p.x, p.y, rp, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
    return this;
  }

  /**
   * Puntos de corriente que recorren el tramo (x0, y0) → (x1, y1): densidad y
   * velocidad crecen con |amps|, el signo invierte el sentido. Puntos planos
   * (sin degradado) en un solo `save/restore`: `circuits` pasaba de 16
   * `body` con degradado por tramo a una llamada.
   * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
   * @param {object} [opts]
   * @param {number} [opts.amps=1] - Intensidad (A); 0 no dibuja nada.
   * @param {string} [opts.color='ray'] @param {number} [opts.r=0.09] - Radio de cada punto (mundo).
   * @param {number} [opts.t] - Tiempo (s), por defecto el reloj de la escena.
   * @param {number} [opts.alpha=0.85]
   */
  flow(x0, y0, x1, y1, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const amps = opts.amps ?? 1;
    const mag = Math.abs(amps);
    if (mag < 1e-9) return this;
    const t = opts.t ?? this.elapsed ?? 0;
    const n = opts.n ?? Math.max(3, Math.min(12, Math.round(3 + mag * 30)));
    const speed = opts.speed ?? 0.15 + Math.min(2.5, mag * 20);
    const phase = (t * speed) % 1;
    const rp = Math.max(1, this.screenSpace ? opts.r ?? 3 : this.px(opts.r ?? 0.09));
    const from = this.project(x0, y0, _a);
    const fx = from.x;
    const fy = from.y;
    const to = this.project(x1, y1, _b);
    const dx = to.x - fx;
    const dy = to.y - fy;
    ctx.save();
    ctx.fillStyle = this.color(opts.color, 'ray');
    ctx.globalAlpha = opts.alpha ?? 0.85;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      let u = (k / n + phase) % 1;
      if (amps < 0) u = 1 - u;
      const sx = fx + dx * u;
      const sy = fy + dy * u;
      ctx.moveTo(sx + rp, sy);
      ctx.arc(sx, sy, rp, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
    return this;
  }

  /**
   * Rayo óptico desde (x0, y0) hacia una imagen (ix, iy). Real: trazo
   * sólido que cruza la imagen y sigue `overshoot`. Virtual: tramo sólido de
   * longitud `solid` y prolongación punteada hasta la imagen, que arranca
   * `back` unidades antes para que se lea como extensión del rayo. Reúne
   * `_rayToImage` (mirrors) y `_segToImage` (optical-instruments).
   * @param {number} x0 @param {number} y0 @param {number} ix @param {number} iy
   * @param {object} [opts]
   * @param {boolean} [opts.virtual=false]
   * @param {string} [opts.color='ray'] @param {number} [opts.width=1.7]
   * @param {number} [opts.overshoot=2.2] @param {number} [opts.solid=2.4] @param {number} [opts.back=4] - Mundo.
   * @param {number[]} [opts.dash=[4,3]] @param {number} [opts.dashWidth=1.4] @param {number} [opts.dashAlpha=0.8]
   */
  rayTo(x0, y0, ix, iy, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const dx = ix - x0;
    const dy = iy - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return this;
    const ux = dx / len;
    const uy = dy / len;
    const color = this.color(opts.color, 'ray');
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.setLineDash(EMPTY_DASH);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.lineWidth = this.lineWidth(opts.width ?? 1.7);
    const from = this.project(x0, y0, _a);
    const fx = from.x;
    const fy = from.y;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    if (!opts.virtual) {
      const reach = len + (opts.overshoot ?? 2.2);
      const to = this.project(x0 + ux * reach, y0 + uy * reach, _b);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else {
      const seg = Math.min(len, opts.solid ?? 2.4);
      const to = this.project(x0 + ux * seg, y0 + uy * seg, _b);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      const back = seg - (opts.back ?? 4);
      const s = this.project(x0 + ux * back, y0 + uy * back, _a);
      const e = this.project(ix, iy, _b);
      ctx.setLineDash(opts.dash || [4, 3]);
      ctx.lineWidth = this.lineWidth(opts.dashWidth ?? 1.4);
      ctx.globalAlpha = (opts.alpha ?? 1) * (opts.dashAlpha ?? 0.8);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }
    ctx.restore();
    return this;
  }

  /**
   * Franja de intensidad: columna vertical en `x` de `y0` a `y1` (mundo),
   * ancho `w`, dividida en tantas celdas como `values` (intensidades en
   * [0,1], de `y0` a `y1`). Es la pantalla de franjas de `wave-optics`:
   * N `fillRect` en un solo `save/restore`, sin una primitiva por celda.
   * @param {number} x @param {number} y0 @param {number} y1 @param {number} w
   * @param {ArrayLike<number>} values
   * @param {object} [opts]
   * @param {number} [opts.gamma=0.7] - Compresión perceptual del brillo.
   * @param {(I:number) => string} [opts.colorAt] - Color por intensidad; por defecto gris azulado.
   * @param {number} [opts.alpha=1]
   */
  intensityStrip(x, y0, y1, w, values, opts = {}) {
    const ctx = this.ctx;
    const n = values ? values.length : 0;
    if (!ctx || n < 1) return this;
    const wp = this.screenSpace ? w : this.px(w);
    const p0 = this.project(x, y0, _a);
    const p1 = this.project(x, y1, _b);
    const cell = Math.abs(p1.y - p0.y) / n;
    const hh = cell * 1.2 + 0.5;
    const gamma = opts.gamma ?? 0.7;
    const colorAt = opts.colorAt;
    const left = p0.x - wp / 2;
    ctx.save();
    ctx.globalAlpha = opts.alpha ?? 1;
    for (let i = 0; i < n; i++) {
      const I = Math.max(0, Math.min(1, values[i]));
      if (colorAt) ctx.fillStyle = colorAt(I);
      else {
        const g = Math.round(255 * Math.pow(I, gamma));
        ctx.fillStyle = `rgb(${g}, ${g}, ${Math.min(255, g + 40)})`;
      }
      const cy = p0.y + ((p1.y - p0.y) * (i + 0.5)) / n;
      ctx.fillRect(left, cy - hh / 2, wp, hh);
    }
    ctx.restore();
    return this;
  }

  /**
   * Nube de partículas: muchos discos iguales (mismo radio y color) en un
   * solo camino y un solo `save/restore`. Es la versión de bucle caliente de
   * `body` para gases, electrones en vuelo o cargas: `kinetic-theory` pasaba
   * de 120 `body()` (cada uno con `save`, `translate`, sombra y `restore`) a
   * una llamada. Acepta los mismos formatos de puntos que `polyline`, más un
   * filtro opcional para dibujar sólo una especie de un array mixto.
   * @param {Array|object} points - `[{x,y}…]`, plano `[x0,y0,…]`, tipado o `TrailBuffer`.
   * @param {number} r - Radio (mundo; px CSS en el HUD).
   * @param {object} [opts]
   * @param {string} [opts.color='mass']
   * @param {number} [opts.alpha=1]
   * @param {boolean} [opts.outline=true] - Contorno sutil, como en `body`.
   * @param {(p:object, i:number) => boolean} [opts.filter] - Sólo para arrays de objetos.
   */
  dots(points, r, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const list = pointList(points);
    if (list.length < 1) return this;
    const rp = Math.max(1, this.screenSpace ? r : this.px(r));
    const filter = typeof opts.filter === 'function' && Array.isArray(points) ? opts.filter : null;
    ctx.save();
    ctx.setLineDash(EMPTY_DASH);
    ctx.fillStyle = this.color(opts.color, 'mass');
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      if (filter && !filter(points[i], i)) continue;
      list.at(i, _a);
      const p = this.project(_a.x, _a.y, _b);
      ctx.moveTo(p.x + rp, p.y);
      ctx.arc(p.x, p.y, rp, 0, Math.PI * 2);
    }
    ctx.fill();
    if (opts.outline !== false) {
      ctx.strokeStyle = this.theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
      ctx.lineWidth = this.lineWidth(1);
      ctx.stroke();
    }
    ctx.restore();
    return this;
  }

  /* ---------- registro para picking ---------- */

  /**
   * Declara que lo dibujado en `bounds` responde al puntero. La escena resuelve
   * el hit testing por todos, en vez de que cada módulo lo repita — cuando lo
   * hacía (§2.6).
   * @param {string} id
   * @param {{x:number,y:number,r?:number,w?:number,h?:number}} bounds - Mundo.
   */
  pickable(id, bounds) {
    const scene = this._scene;
    if (scene) scene.registerPickable(id, bounds);
    return this;
  }
}

/**
 * Superficie del HUD: mismo vocabulario, más anclajes a los bordes del
 * viewport y una primitiva de gráfica.
 *
 * `plot` merece mención aparte: hoy `photoelectric` y `thermodynamics` dibujan
 * sus propios ejes a mano y `kinematics` es el único módulo con gráficas (vía
 * SVG externo). Con esto, dar gráficas a cualquier módulo cuesta una llamada.
 */
export class HudSurface extends Surface {
  constructor(camera) {
    super(camera, { screenSpace: true });
    /** Desplazamiento acumulado por ancla este frame, px CSS (§13.1). */
    this._anchorOffsets = {};
  }

  /** Se reenlaza cada frame (`Scene.beginHud`): reinicia la cola por ancla. */
  bind(ctx, theme) {
    super.bind(ctx, theme);
    this._anchorOffsets = {};
    return this;
  }

  /**
   * Desplazamiento a lo largo del eje del ancla para el próximo elemento:
   * si `opts.line` viene explícito respeta el comportamiento histórico
   * (múltiplo de `height`); si no, encola tras lo último dibujado en esa
   * ancla — así `hud.chip('top-left')` seguido de `hud.readout(…,'top-left')`
   * ya no parten del mismo punto y se pisan (§13.1).
   * @param {string} anchor @param {number} height @param {object} opts
   */
  _nextOffset(anchor, height, opts) {
    if (opts.line != null) return height * opts.line;
    const cur = this._anchorOffsets[anchor] || 0;
    this._anchorOffsets[anchor] = cur + height + (opts.gap ?? 4);
    return cur;
  }

  /**
   * Convierte un anclaje simbólico en coordenadas de pantalla dentro del
   * viewport actual (no del lienzo: en comparación lado a lado cada mitad
   * tiene su propio HUD).
   * @param {'top-left'|'top-right'|'bottom-left'|'bottom-right'|'top'|'bottom'} anchor
   * @param {number} [padX=12]
   * @param {number} [padY=12]
   */
  anchorPoint(anchor = 'top-left', padX = 12, padY = 12) {
    const vp = this.camera.viewport;
    const px = padX * this.theme.fontScale;
    const py = padY * this.theme.fontScale;
    switch (anchor) {
      case 'top-right':
        return { x: vp.x + vp.w - px, y: vp.y + py, align: 'right', dir: 1 };
      case 'bottom-left':
        return { x: vp.x + px, y: vp.y + vp.h - py, align: 'left', dir: -1 };
      case 'bottom-right':
        return { x: vp.x + vp.w - px, y: vp.y + vp.h - py, align: 'right', dir: -1 };
      case 'top':
        return { x: vp.x + vp.w / 2, y: vp.y + py, align: 'center', dir: 1 };
      case 'bottom':
        return { x: vp.x + vp.w / 2, y: vp.y + vp.h - py, align: 'center', dir: -1 };
      default:
        return { x: vp.x + px, y: vp.y + py, align: 'left', dir: 1 };
    }
  }

  /**
   * Texto anclado a un borde. `line` apila varias líneas en el mismo anclaje.
   * @param {string} text
   * @param {string} [anchor='top-left']
   * @param {object} [opts]
   * @param {number} [opts.line=0]
   */
  text(text, anchor = 'top-left', opts = {}) {
    const a = this.anchorPoint(anchor, opts.padX, opts.padY);
    const lh = this.fontSize(opts.lineHeight ?? 18);
    const off = this._nextOffset(anchor, lh, opts);
    const y = a.y + a.dir * off + (a.dir > 0 ? lh * 0.8 : 0);
    return this._screenText(a.x, y, text, {
      ...opts,
      align: opts.align || a.align,
      baseline: 'alphabetic'
    });
  }

  /**
   * Insignia anclada a un borde: `scene.hud.chip('Ec = 12.4 J', 'top-right')`.
   * @param {string} text
   * @param {string} [anchor='top-right']
   * @param {object} [opts]
   */
  chip(text, anchor = 'top-right', opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const a = this.anchorPoint(anchor, opts.padX, opts.padY);
    ctx.save();
    ctx.font = this.font(opts.size ?? 12);
    const padX = 8 * this.theme.fontScale;
    const w = ctx.measureText(text).width + padX * 2;
    const h = this.fontSize(22);
    const lh = h + 6;
    const off = this._nextOffset(anchor, lh, opts);
    const cx = a.align === 'right' ? a.x - w / 2 : a.align === 'center' ? a.x : a.x + w / 2;
    const cy = a.y + a.dir * (h / 2 + off);
    ctx.restore();
    return super.chip(cx, cy, text, { ...opts, offsetX: 0, offsetY: 0, avoid: false });
  }

  /**
   * Leyenda con muestra de color, patrón de línea y etiqueta. El patrón es
   * obligatorio en los perfiles accesibles: sin él, la leyenda dejaría de ser
   * legible para quien no distingue los colores.
   * @param {Array<{color?: string, label: string, dash?: number[]}>} items
   * @param {string} [anchor='bottom-left']
   */
  legend(items, anchor = 'bottom-left', opts = {}) {
    const ctx = this.ctx;
    if (!ctx || !items?.length) return this;
    const a = this.anchorPoint(anchor, opts.padX, opts.padY);
    const lh = this.fontSize(opts.lineHeight ?? 18);
    const sample = 16 * this.theme.lineScale;
    const vertical = opts.vertical !== false;

    ctx.save();
    ctx.font = this.font(opts.size ?? 12);
    ctx.textBaseline = 'middle';

    let cursorX = a.align === 'right' ? a.x : a.x;
    items.forEach((item, i) => {
      const color = this.color(item.color, 'text');
      const dash = item.dash || seriesDash(i);
      const y = vertical ? a.y + a.dir * (lh * (i + 0.5)) : a.y + a.dir * lh * 0.5;
      let x0;
      if (vertical) {
        x0 = a.align === 'right' ? a.x - sample - 6 - ctx.measureText(item.label).width : a.x;
      } else {
        x0 = cursorX;
      }
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = this.lineWidth(2.5);
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + sample, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = this.theme.text;
      ctx.textAlign = 'left';
      ctx.fillText(item.label, x0 + sample + 6, y);
      cursorX = x0 + sample + 6 + ctx.measureText(item.label).width + 16;
    });
    ctx.restore();
    return this;
  }

  /**
   * Panel de lectura: filas `etiqueta = valor unidad`, tipografía monoespaciada.
   * Es el equivalente en lienzo de `readout()`, útil al exportar una imagen.
   * @param {Array<{label: string, value: (string|number), unit?: string}>} rows
   */
  readout(rows, anchor = 'top-left', opts = {}) {
    const ctx = this.ctx;
    if (!ctx || !rows?.length) return this;
    const a = this.anchorPoint(anchor, opts.padX, opts.padY);
    const lh = this.fontSize(opts.lineHeight ?? 17);
    ctx.save();
    ctx.font = `${Math.round(this.fontSize(12))}px ui-monospace, "SFMono-Regular", monospace`;
    const decimals = opts.decimals ?? 2;
    const lines = new Array(rows.length);
    let wMax = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const l = `${r.label} = ${typeof r.value === 'number' ? r.value.toFixed(decimals) : r.value}${r.unit ? ' ' + r.unit : ''}`;
      lines[i] = l;
      const lw = ctx.measureText(l).width;
      if (lw > wMax) wMax = lw;
    }
    const w = wMax + 20;
    const h = lh * lines.length + 14;
    const off = this._nextOffset(anchor, h + 6, opts);
    const left = a.align === 'right' ? a.x - w : a.x;
    const top = a.dir > 0 ? a.y + off : a.y - h - off;
    if (this._scene) this._scene.registerBox({ x: left, y: top, w, h });
    ctx.fillStyle = this.theme.hudBg;
    ctx.strokeStyle = this.theme.hudBorder;
    ctx.lineWidth = this.lineWidth(1);
    roundRect(ctx, left, top, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, left + 10, top + 10 + lh * (i + 0.4)));
    ctx.restore();
    return this;
  }

  /**
   * Gráfica con ejes dentro del lienzo.
   * @param {{x:number,y:number,w:number,h:number}} rect - Región en px CSS.
   * @param {object} spec
   * @param {Array<{points: Array, label?: string, color?: string, dash?: number[]}>} spec.series
   * @param {string} [spec.xLabel]
   * @param {string} [spec.yLabel]
   * @param {[number,number]} [spec.xRange] - Autoescala si se omite.
   * @param {[number,number]} [spec.yRange]
   *
   * Una serie puede ser **muestreada**: `{ fn: (x) => y, samples?: 80 }` en
   * vez de `points`. La función se evalúa sobre el rango X (el de `xRange` o
   * el autoescalado de las series con puntos) y se vuelca a un búfer plano
   * reutilizado entre frames: las curvas analíticas (i(t), V_c(t), cos²θ…)
   * dejan de construir un array de objetos por frame.
   */
  plot(rect, spec = {}) {
    const ctx = this.ctx;
    if (!ctx || !rect) return this;
    const series = spec.series || [];
    const padL = 34 * this.theme.fontScale;
    const padB = 20 * this.theme.fontScale;
    const padT = spec.title ? 18 * this.theme.fontScale : 8;
    const padR = 8;
    const px = rect.x + padL;
    const py = rect.y + padT;
    const pw = Math.max(10, rect.w - padL - padR);
    const ph = Math.max(10, rect.h - padT - padB);

    // Autoescala sobre todas las series a la vez, para que sean comparables.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let hasFn = false;
    for (let k = 0; k < series.length; k++) {
      const s = series[k];
      if (typeof s.fn === 'function') {
        hasFn = true;
        continue;
      }
      const list = pointList(s.points);
      for (let i = 0; i < list.length; i++) {
        list.at(i, _a);
        if (_a.x < minX) minX = _a.x;
        if (_a.x > maxX) maxX = _a.x;
        if (_a.y < minY) minY = _a.y;
        if (_a.y > maxY) maxY = _a.y;
      }
    }
    if (spec.xRange) [minX, maxX] = spec.xRange;
    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 1;
    } else if (minX === maxX) {
      // Rango degenerado (una sola muestra o serie constante): centrar en el
      // valor en vez de forzar 0..1, que mandaba el punto fuera del recuadro.
      minX -= 1;
      maxX += 1;
    }
    if (hasFn) {
      // Las series por función se muestrean ya con el rango X resuelto y
      // participan en la autoescala Y como cualquier otra.
      for (let k = 0; k < series.length; k++) {
        const s = series[k];
        if (typeof s.fn !== 'function') continue;
        const buf = this._sampleFn(k, s.fn, minX, maxX, s.samples ?? 80);
        if (spec.yRange) continue;
        for (let i = 1; i < buf.length; i += 2) {
          const v = buf[i];
          if (v < minY) minY = v;
          if (v > maxY) maxY = v;
        }
      }
    }
    if (spec.yRange) [minY, maxY] = spec.yRange;
    if (!Number.isFinite(minY)) {
      minY = 0;
      maxY = 1;
    } else if (minY === maxY) {
      const pad = Math.max(1, Math.abs(minY) * 0.1);
      minY -= pad;
      maxY += pad;
    }

    const sx = (v) => px + ((v - minX) / (maxX - minX)) * pw;
    const sy = (v) => py + ph - ((v - minY) / (maxY - minY)) * ph;

    ctx.save();
    if (spec.background !== false) {
      ctx.fillStyle = this.theme.hudBg;
      ctx.strokeStyle = this.theme.hudBorder;
      ctx.lineWidth = this.lineWidth(1);
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 6);
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = this.theme.axis;
    ctx.lineWidth = this.lineWidth(1);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + ph);
    ctx.lineTo(px + pw, py + ph);
    ctx.stroke();

    ctx.font = this.font(10);
    ctx.fillStyle = this.theme.textDim;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(maxY.toFixed(1), px - 4, py);
    ctx.fillText(minY.toFixed(1), px - 4, py + ph);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(minX.toFixed(1), px, py + ph + 3);
    ctx.fillText(maxX.toFixed(1), px + pw, py + ph + 3);
    if (spec.title) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = this.theme.textDim;
      ctx.fillText(spec.title, rect.x + rect.w / 2, rect.y + 4);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    series.forEach((s, i) => {
      const list = pointList(typeof s.fn === 'function' ? this._fnBufs[i] : s.points);
      if (list.length < 1) return;
      ctx.strokeStyle = this.color(s.color, 'text') || seriesColor(i);
      ctx.lineWidth = this.lineWidth(s.width ?? 1.8);
      ctx.setLineDash(s.dash || seriesDash(i));
      if (list.length === 1) {
        // Marcador puntual (módulo de elasticidad: estado actual sobre σ–ε).
        const p = list.at(0, _a);
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), Math.max(1, (s.pointSize ?? 3) * this.theme.lineScale), 0, Math.PI * 2);
        ctx.fillStyle = this.color(s.color, 'text') || seriesColor(i);
        ctx.globalAlpha = s.alpha ?? 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
        return;
      }
      ctx.beginPath();
      for (let k = 0; k < list.length; k++) {
        list.at(k, _a);
        const X = sx(_a.x);
        const Y = sy(_a.y);
        if (k === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      if (s.fill) {
        // Área bajo la curva hasta el eje inferior (tanda 5.2): resaltado del
        // impulso J = ∫F·dt y de la resiliencia (área elástica de σ–ε).
        const last = list.at(list.length - 1, _b);
        ctx.lineTo(sx(last.x), py + ph);
        ctx.lineTo(sx(list.at(0, _a).x), py + ph);
        ctx.closePath();
        ctx.fillStyle = this.color(s.fill === true ? s.color : s.fill, 'text') || seriesColor(i);
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      ctx.stroke();
    });
    ctx.restore();
    ctx.restore();
    return this;
  }
}

/**
 * Escena: lo que un módulo recibe en `draw(scene)`.
 *
 * Compone las tres superficies (fondo, mundo, HUD) y resuelve el picking. El
 * módulo dibuja el mundo directamente sobre la escena (`scene.body(…)`) y usa
 * `scene.hud` para lo anclado a los bordes.
 */
export class Scene {
  /**
   * @param {object} opts
   * @param {import('./camera.js').Camera} opts.camera
   * @param {import('./layers.js').LayerStack} [opts.layers]
   * @param {HTMLCanvasElement} [opts.canvas]
   */
  constructor(opts) {
    this.camera = opts.camera;
    this.layers = opts.layers || null;
    this.canvas = opts.canvas || null;

    this.world$ = new Surface(this.camera);
    this.bg = new Surface(this.camera);
    this.hud = new HudSurface(this.camera);
    this.world$._scene = this;
    this.bg._scene = this;
    this.hud._scene = this;

    /** @type {Array<{id:string, bounds:object}>} */
    this._pickables = [];
    this._collectPickables = false;

    /** Cajas de texto ocupadas este frame, en px CSS (§13.1). */
    this._labelBoxes = [];

    this.theme = getTheme();
    /** Segundos del frame en curso (para animaciones dependientes del tiempo). */
    this.dt = 1 / 60;
    /** Segundos desde el arranque del módulo. */
    this.elapsed = 0;
    /** Interpolación del subpaso de física [0,1). */
    this.alpha = 0;

    // El módulo llama `scene.body(…)`: la escena delega en la superficie de
    // mundo sin que haya que escribir `scene.world.body(…)`.
    this._delegate();
  }

  /** Reexpone el vocabulario de la superficie de mundo en la propia escena. */
  _delegate() {
    const proto = Object.getPrototypeOf(this.world$);
    const skip = new Set(['constructor', 'bind', 'pickable', 'viewport', 'world']);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (skip.has(key) || key.startsWith('_')) continue;
      const fn = this.world$[key];
      if (typeof fn !== 'function' || this[key]) continue;
      this[key] = (...args) => {
        const r = fn.apply(this.world$, args);
        return r === this.world$ ? this : r;
      };
    }
  }

  /** Tamaño del viewport activo, **siempre en px CSS**. */
  viewport() {
    return this.world$.viewport();
  }

  /** Límites visibles en unidades de mundo. */
  world() {
    return this.world$.world();
  }

  /** Contexto crudo — sólo para módulos aún sin migrar. */
  get ctx() {
    return this.world$.ctx;
  }

  /**
   * Prepara la escena para un frame.
   * @param {CanvasRenderingContext2D} worldCtx
   * @param {object} info
   */
  beginFrame(worldCtx, info = {}) {
    this.theme = info.theme || getTheme();
    this.dt = info.dt ?? 1 / 60;
    this.elapsed = info.elapsed ?? 0;
    this.alpha = info.alpha ?? 0;
    // Las superficies animan por tiempo (`fill` con olas, `flame`, `flow`):
    // reciben el reloj de la escena en vez de leer un `elapsed` inexistente.
    this.world$.elapsed = this.bg.elapsed = this.hud.elapsed = this.elapsed;
    this.world$.bind(worldCtx, this.theme);
    this._pickables.length = 0;
    this._collectPickables = true;
    this._labelBoxes.length = 0;
    return this;
  }

  /** Enlaza la superficie del HUD a su capa antes de que el módulo dibuje. */
  beginHud(hudCtx) {
    this.hud.bind(hudCtx, this.theme);
    return this;
  }

  /** Enlaza la superficie de fondo a su capa. */
  beginBackground(bgCtx) {
    this.bg.bind(bgCtx, this.theme);
    return this;
  }

  endFrame() {
    this._collectPickables = false;
    return this;
  }

  /** @param {string} id @param {object} bounds */
  registerPickable(id, bounds) {
    if (!this._collectPickables) return;
    this._pickables.push({ id, bounds });
  }

  /** Igual que `Surface.pickable`, reexpuesto en la escena (véase `_delegate`). */
  pickable(id, bounds) {
    return this.world$.pickable(id, bounds);
  }

  /**
   * Ocupa `box` en el registro de este frame (§13.1), sin buscar sitio libre.
   * @param {{x:number,y:number,w:number,h:number}} box
   * @returns {{x:number,y:number,w:number,h:number}} el mismo `box`.
   */
  registerBox(box) {
    this._labelBoxes.push(box);
    return box;
  }

  /**
   * Busca el primer sitio libre para `box` entre los candidatos
   * arriba → abajo → derecha → izquierda (§13.1). Si ninguno está libre, se
   * queda con el original: mejor una etiqueta superpuesta que una que
   * desaparece silenciosamente.
   * @param {{x:number,y:number,w:number,h:number}} box
   * @returns {{x:number,y:number,w:number,h:number}}
   */
  findFreeBox(box) {
    const boxes = this._labelBoxes;
    if (!overlapsAny(box, boxes)) return this.registerBox(box);
    // Los cuatro candidatos se prueban sobre una caja de trabajo: sólo se
    // alloca la que finalmente se registra (antes: 4 copias + 1 clausura por
    // etiqueta, en un bucle O(n) por candidato).
    const dx = box.w + 4;
    const dy = box.h + 4;
    const s = _scratchBox;
    s.w = box.w;
    s.h = box.h;
    for (let k = 0; k < 4; k++) {
      s.x = box.x + (k === 2 ? dx : k === 3 ? -dx : 0);
      s.y = box.y + (k === 0 ? -dy : k === 1 ? dy : 0);
      if (!overlapsAny(s, boxes)) return this.registerBox({ x: s.x, y: s.y, w: s.w, h: s.h });
    }
    return this.registerBox(box);
  }

  /**
   * Resuelve qué elemento hay bajo un punto del mundo. El último dibujado gana:
   * es el que está visualmente encima.
   * @param {number} wx
   * @param {number} wy
   * @param {number} [tolerancePx=6]
   * @returns {string|null}
   */
  pickAt(wx, wy, tolerancePx = 6) {
    const tol = this.camera.toWorld(tolerancePx);
    for (let i = this._pickables.length - 1; i >= 0; i--) {
      const { id, bounds } = this._pickables[i];
      if (bounds.r != null) {
        if (Math.hypot(wx - bounds.x, wy - bounds.y) <= bounds.r + tol) return id;
      } else if (bounds.w != null) {
        const hw = bounds.w / 2 + tol;
        const hh = (bounds.h ?? bounds.w) / 2 + tol;
        if (Math.abs(wx - bounds.x) <= hw && Math.abs(wy - bounds.y) <= hh) return id;
      }
    }
    return null;
  }

  /** @returns {Array<{id:string,bounds:object}>} Lista viva del último frame. */
  pickables() {
    return this._pickables;
  }
}
