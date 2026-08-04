/**
 * @fileoverview camera — cámara 2D con escala isotrópica, zoom y viewports (§2.2).
 *
 * La cámara anterior era `{x, y}` en `renderer.js:33`: pan sin zoom, sin
 * límites y con `follow()` de salto duro. Peor aún, la escala se derivaba por
 * eje (`scaleX = cssW/worldW`, `scaleY = cssH/worldH`), de modo que **el mundo
 * se deformaba con la ventana**: una órbita circular de `kepler` se veía
 * elíptica en pantalla ancha y un ángulo de 45° en `optics` no medía 45°.
 *
 * Aquí la escala es una sola (`min` de ambas), con letterboxing: los ángulos y
 * las circunferencias se conservan en cualquier relación de aspecto.
 *
 * Un `viewport` rectangular en píxeles CSS permite dividir el lienzo sin crear
 * un segundo `<canvas>`, que es lo que habilita la comparación lado a lado de
 * §2.9 manteniendo una sola superficie y un solo bucle RAF.
 */

import { clamp, lerp } from './geometry.js';

/** Punto reutilizable para los métodos que no reciben `out` (evita allocar). */
const _tmp = { x: 0, y: 0 };

export class Camera {
  /**
   * @param {object} [opts]
   * @param {number} [opts.worldWidth=20]  - Ancho del encuadre base en unidades de mundo.
   * @param {number} [opts.worldHeight=15] - Alto del encuadre base.
   * @param {number} [opts.minZoom=0.2]
   * @param {number} [opts.maxZoom=12]
   */
  constructor(opts = {}) {
    /** Centro de la vista, en unidades de mundo. */
    this.x = 0;
    this.y = 0;
    /** Factor multiplicativo sobre la escala de encuadre. */
    this.zoom = 1;

    this.minZoom = opts.minZoom ?? 0.2;
    this.maxZoom = opts.maxZoom ?? 12;

    this.worldWidth = opts.worldWidth ?? 20;
    this.worldHeight = opts.worldHeight ?? 15;

    /** Rectángulo de dibujo en px CSS: {x, y, w, h}. */
    this.viewport = { x: 0, y: 0, w: 800, h: 600 };

    /** px CSS por unidad de mundo con zoom = 1. */
    this._baseScale = 40;

    /** Destino de `follow()`; null si no se está siguiendo nada. */
    this._target = null;
    this._smooth = 0.15;

    /** Límites opcionales del pan: {minX, maxX, minY, maxY}. */
    this._bounds = null;

    /**
     * Contador que cambia con cualquier transformación. La capa de fondo lo
     * compara para saber si debe redibujar la rejilla (§2.1).
     */
    this.version = 0;
  }

  /** Marca la cámara como modificada (invalida la capa de fondo). */
  _touch() {
    this.version = (this.version + 1) | 0;
  }

  /**
   * Fija el rectángulo de dibujo y recalcula la escala de encuadre.
   * @param {number} x - Origen del viewport en px CSS.
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  setViewport(x, y, w, h) {
    const vp = this.viewport;
    if (vp.x === x && vp.y === y && vp.w === w && vp.h === h) return this;
    vp.x = x;
    vp.y = y;
    vp.w = Math.max(1, w);
    vp.h = Math.max(1, h);
    this._recomputeBaseScale();
    this._touch();
    return this;
  }

  /**
   * Declara el encuadre base del módulo (`static viewport = {width, height}`),
   * en vez del 20×15 global que la app imponía a los 27 motores.
   * @param {number} worldW
   * @param {number} worldH
   */
  setWorldSize(worldW, worldH) {
    const w = worldW > 0 ? worldW : this.worldWidth;
    const h = worldH > 0 ? worldH : this.worldHeight;
    if (w === this.worldWidth && h === this.worldHeight) return this;
    this.worldWidth = w;
    this.worldHeight = h;
    this._recomputeBaseScale();
    this._touch();
    return this;
  }

  /**
   * Escala isotrópica: la dimensión más restrictiva manda y la otra sobra
   * (letterboxing). Es la línea que corrige la deformación del mundo.
   */
  _recomputeBaseScale() {
    const sx = this.viewport.w / this.worldWidth;
    const sy = this.viewport.h / this.worldHeight;
    this._baseScale = Math.min(sx, sy);
  }

  /**
   * Encuadra un mundo dentro de un viewport preservando la relación de aspecto.
   * @param {number} worldW
   * @param {number} worldH
   * @param {number} viewW
   * @param {number} viewH
   * @param {{mode?: 'contain'|'cover'}} [opts]
   */
  fit(worldW, worldH, viewW, viewH, opts = {}) {
    this.worldWidth = worldW > 0 ? worldW : this.worldWidth;
    this.worldHeight = worldH > 0 ? worldH : this.worldHeight;
    this.viewport.w = Math.max(1, viewW);
    this.viewport.h = Math.max(1, viewH);
    const sx = this.viewport.w / this.worldWidth;
    const sy = this.viewport.h / this.worldHeight;
    this._baseScale = opts.mode === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    this._touch();
    return this;
  }

  /** px CSS por unidad de mundo, incluido el zoom. */
  get scale() {
    return this._baseScale * this.zoom;
  }

  /** Centro del viewport en px CSS. */
  get centerX() {
    return this.viewport.x + this.viewport.w / 2;
  }

  get centerY() {
    return this.viewport.y + this.viewport.h / 2;
  }

  /**
   * Mundo → pantalla. Escribe en `out` para no allocar en el bucle caliente:
   * la versión anterior creaba un objeto por llamada y `drawVector` la invoca
   * cuatro veces por vector (§3.2).
   * @param {number} wx
   * @param {number} wy
   * @param {{x:number,y:number}} [out]
   * @returns {{x:number,y:number}}
   */
  worldToScreen(wx, wy, out = { x: 0, y: 0 }) {
    const s = this.scale;
    out.x = this.centerX + (wx - this.x) * s;
    out.y = this.centerY - (wy - this.y) * s;
    return out;
  }

  /**
   * Pantalla → mundo (px CSS relativos al lienzo, no al viewport).
   * @param {number} sx
   * @param {number} sy
   * @param {{x:number,y:number}} [out]
   * @returns {{x:number,y:number}}
   */
  screenToWorld(sx, sy, out = { x: 0, y: 0 }) {
    const s = this.scale;
    out.x = this.x + (sx - this.centerX) / s;
    out.y = this.y - (sy - this.centerY) / s;
    return out;
  }

  /** Convierte una longitud de mundo a px CSS. */
  toPixels(worldLength) {
    return worldLength * this.scale;
  }

  /** Convierte una longitud en px CSS a unidades de mundo. */
  toWorld(pixelLength) {
    return pixelLength / this.scale;
  }

  /**
   * Rectángulo de mundo visible en el viewport actual.
   * @param {object} [out]
   * @returns {{left:number,right:number,top:number,bottom:number,minX:number,maxX:number,minY:number,maxY:number}}
   */
  bounds(out = {}) {
    const halfW = this.viewport.w / 2 / this.scale;
    const halfH = this.viewport.h / 2 / this.scale;
    out.left = out.minX = this.x - halfW;
    out.right = out.maxX = this.x + halfW;
    out.bottom = out.minY = this.y - halfH;
    out.top = out.maxY = this.y + halfH;
    return out;
  }

  /** Coloca el centro de la cámara sin interpolar. */
  setPosition(x, y) {
    if (this.x === x && this.y === y) return this;
    this.x = x;
    this.y = y;
    this._target = null;
    this._applyBounds();
    this._touch();
    return this;
  }

  /**
   * Sigue un punto del mundo. A diferencia del salto duro anterior
   * (`renderer.js:102`, visible en `gravity` y `kepler`), aquí se interpola en
   * `update()`; con `smooth = 0` el comportamiento vuelve a ser instantáneo.
   * @param {number} wx
   * @param {number} wy
   * @param {{smooth?: number}} [opts]
   */
  follow(wx, wy, opts = {}) {
    const smooth = opts.smooth ?? this._smooth;
    if (smooth <= 0) return this.setPosition(wx, wy);
    if (!this._target) this._target = { x: wx, y: wy };
    else {
      this._target.x = wx;
      this._target.y = wy;
    }
    this._smooth = smooth;
    return this;
  }

  /**
   * Avanza la interpolación de `follow()`. La app la llama una vez por frame.
   * @param {number} [dt=1/60] - Segundos del frame; normaliza el suavizado.
   */
  update(dt = 1 / 60) {
    if (!this._target) return this;
    // Suavizado independiente de la tasa de refresco (60 Hz de referencia).
    const k = 1 - Math.pow(1 - clamp(this._smooth, 0, 1), Math.max(dt, 1e-4) * 60);
    const nx = lerp(this.x, this._target.x, k);
    const ny = lerp(this.y, this._target.y, k);
    if (Math.abs(nx - this.x) > 1e-6 || Math.abs(ny - this.y) > 1e-6) {
      this.x = nx;
      this.y = ny;
      this._applyBounds();
      this._touch();
    }
    return this;
  }

  /** Cancela el seguimiento sin mover la cámara. */
  stopFollow() {
    this._target = null;
    return this;
  }

  /**
   * Zoom anclado a un punto de pantalla: el punto del mundo bajo el cursor no
   * se mueve. Es lo que hace natural la rueda y el pellizco.
   * @param {number} sx - px CSS.
   * @param {number} sy
   * @param {number} factor - >1 acerca, <1 aleja.
   */
  zoomAt(sx, sy, factor) {
    const next = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    if (next === this.zoom) return this;
    const before = this.screenToWorld(sx, sy, _tmp);
    const ax = before.x;
    const ay = before.y;
    this.zoom = next;
    const after = this.screenToWorld(sx, sy, _tmp);
    this.x += ax - after.x;
    this.y += ay - after.y;
    this._target = null;
    this._applyBounds();
    this._touch();
    return this;
  }

  /**
   * Zoom sobre el centro del viewport (botones ±).
   * @param {number} factor
   */
  zoomBy(factor) {
    return this.zoomAt(this.centerX, this.centerY, factor);
  }

  /**
   * Desplaza la cámara una distancia dada en píxeles de pantalla.
   * @param {number} dxPx
   * @param {number} dyPx
   */
  panByScreen(dxPx, dyPx) {
    if (!dxPx && !dyPx) return this;
    const s = this.scale;
    this.x -= dxPx / s;
    this.y += dyPx / s;
    this._target = null;
    this._applyBounds();
    this._touch();
    return this;
  }

  /**
   * Limita el pan a un rectángulo de mundo. `null` lo desactiva.
   * @param {{minX:number,maxX:number,minY:number,maxY:number}|null} bounds
   */
  clampTo(bounds) {
    this._bounds = bounds;
    if (bounds) {
      this._applyBounds();
      this._touch();
    }
    return this;
  }

  _applyBounds() {
    const b = this._bounds;
    if (!b) return;
    this.x = clamp(this.x, b.minX, b.maxX);
    this.y = clamp(this.y, b.minY, b.maxY);
  }

  /** Vuelve al encuadre inicial: centrada, sin zoom y sin seguimiento. */
  reset() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this._target = null;
    this._recomputeBaseScale();
    this._touch();
    return this;
  }

  /**
   * Instantánea serializable de la cámara (para «Mis trabajos» y la repetición
   * de la WAVE 9).
   * @returns {{x:number,y:number,zoom:number}}
   */
  getState() {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  /** @param {{x?:number,y?:number,zoom?:number}} s */
  setState(s) {
    if (!s) return this;
    if (Number.isFinite(s.x)) this.x = s.x;
    if (Number.isFinite(s.y)) this.y = s.y;
    if (Number.isFinite(s.zoom)) this.zoom = clamp(s.zoom, this.minZoom, this.maxZoom);
    this._target = null;
    this._touch();
    return this;
  }
}
