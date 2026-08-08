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
import { roundRect, arrowHead } from './draw-primitives.js';

/** Puntos de trabajo reutilizados: dibujar no debe allocar (§3.2). */
const _a = { x: 0, y: 0 };
const _b = { x: 0, y: 0 };
const _c = { x: 0, y: 0 };

/**
 * Normaliza las tres formas en las que un módulo puede pasar una secuencia de
 * puntos: array de `{x, y}`, array plano `[x0, y0, x1, y1, …]` o un
 * `TrailBuffer`.
 * @param {Array|object} points
 * @returns {{length: number, at: (i: number, out: {x:number,y:number}) => {x:number,y:number}}}
 */
function pointList(points) {
  if (!points) return { length: 0, at: (_, out) => out };
  // TrailBuffer: expone `size` y `forEach` en orden cronológico.
  if (typeof points.forEach === 'function' && typeof points.size === 'number') {
    const arr = points.toArray();
    return {
      length: arr.length,
      at: (i, out) => {
        const p = arr[i];
        out.x = p.x;
        out.y = p.y;
        return out;
      }
    };
  }
  if (!Array.isArray(points)) return { length: 0, at: (_, out) => out };
  if (points.length && typeof points[0] === 'number') {
    return {
      length: points.length >> 1,
      at: (i, out) => {
        out.x = points[i * 2];
        out.y = points[i * 2 + 1];
        return out;
      }
    };
  }
  return {
    length: points.length,
    at: (i, out) => {
      const p = points[i] || _a;
      out.x = p.x;
      out.y = p.y;
      return out;
    }
  };
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
  }

  /** @param {CanvasRenderingContext2D} ctx */
  bind(ctx, theme) {
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

  /** Construye la cadena `font` con la escala del tema. */
  font(size = 12, weight = '') {
    const s = Math.round(this.fontSize(size));
    return `${weight ? weight + ' ' : ''}${s}px ${this._fontFamily}`;
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
    ctx.setLineDash(opts.dash || []);
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
      if (this.theme.glow) {
        const g = ctx.createRadialGradient(-rp * 0.35, -rp * 0.4, rp * 0.05, 0, 0, rp);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.18, color);
        g.addColorStop(0.85, color);
        g.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = g;
      }
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
      this.label(x, y, opts.label, {
        color: opts.labelColor || opts.color,
        offsetY: -(rp + 8)
      });
    }
    if (opts.id) this.pickable(opts.id, { x, y, r });
    return this;
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

  /* ---------- anotación ---------- */

  /** Texto en coordenadas de pantalla (uso interno de las primitivas). */
  _screenText(sx, sy, text, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    ctx.save();
    ctx.font = this.font(opts.size ?? 13, opts.weight);
    ctx.fillStyle = this.color(opts.color, 'text');
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'bottom';
    if (this.theme.dark) {
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
    }
    ctx.fillText(text, sx, sy);
    ctx.restore();
    return this;
  }

  /** Etiqueta anclada a un punto del mundo. */
  label(x, y, text, opts = {}) {
    const p = this.project(x, y, _a);
    return this._screenText(p.x + (opts.offsetX || 0), p.y + (opts.offsetY || 0), text, opts);
  }

  /** Insignia con fondo: legible sobre cualquier parte de la escena. */
  chip(x, y, text, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return this;
    const p = this.project(x, y, _a);
    const px = p.x + (opts.offsetX || 0);
    const py = p.y + (opts.offsetY || 0);
    ctx.save();
    ctx.font = this.font(opts.size ?? 12);
    const padX = 8 * this.theme.fontScale;
    const w = ctx.measureText(text).width + padX * 2;
    const h = this.fontSize(22);
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
    ctx.setLineDash([]);
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
    const y = a.y + a.dir * lh * (opts.line || 0) + (a.dir > 0 ? lh * 0.8 : 0);
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
    const cx = a.align === 'right' ? a.x - w / 2 : a.align === 'center' ? a.x : a.x + w / 2;
    const cy = a.y + a.dir * (h / 2 + lh * (opts.line || 0));
    ctx.restore();
    return super.chip(cx, cy, text, { ...opts, offsetX: 0, offsetY: 0 });
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
    const lines = rows.map(
      (r) => `${r.label} = ${typeof r.value === 'number' ? r.value.toFixed(opts.decimals ?? 2) : r.value}${r.unit ? ' ' + r.unit : ''}`
    );
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
    const h = lh * lines.length + 14;
    const left = a.align === 'right' ? a.x - w : a.x;
    const top = a.dir > 0 ? a.y : a.y - h;
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
    for (const s of series) {
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
    if (spec.yRange) [minY, maxY] = spec.yRange;
    if (!Number.isFinite(minX) || minX === maxX) {
      minX = 0;
      maxX = 1;
    }
    if (!Number.isFinite(minY) || minY === maxY) {
      minY = 0;
      maxY = 1;
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
      const list = pointList(s.points);
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
    this.world$.bind(worldCtx, this.theme);
    this._pickables.length = 0;
    this._collectPickables = true;
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
