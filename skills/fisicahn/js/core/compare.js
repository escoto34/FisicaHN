/**
 * @fileoverview compare — comparación lado a lado (§2.9).
 *
 * Es el mayor salto pedagógico del plan: pasar de «mira esta simulación» a
 * **«compara estas dos»**, que es el experimento controlado — la forma en que
 * realmente se enseña física. Caída con y sin resistencia del aire, choque
 * elástico frente a inelástico, la misma órbita con dos valores de GM, lente
 * convergente frente a divergente, dos metales en el efecto fotoeléctrico.
 *
 * Antes era **estructuralmente imposible**: los módulos eran singletons con el
 * estado en variables de nivel de módulo y la caché ESM devolvía siempre el
 * mismo namespace, así que instanciar el módulo dos veces daba dos vistas del
 * *mismo* estado. La fábrica `SimModule` de la WAVE 1 lo desbloquea; aquí se
 * añade lo que faltaba:
 *
 * 1. Dos paneles con divisoria arrastrable.
 * 2. Dos escenas independientes sobre **el mismo lienzo**, mediante viewports
 *    de la cámara: una sola superficie y un solo bucle RAF.
 * 3. Enlace de controles, salvo la variable declarada independiente. Sin esto
 *    no habría experimento controlado, sino dos simulaciones sueltas.
 * 4. Lectura comparada con la diferencia calculada.
 */

import { SimModule, implementsMethod } from './sim-module.js';
import { getTheme } from './theme.js';

/** Ancho en px CSS de la zona sensible de la divisoria. */
const DIVIDER_GRAB = 10;

export class ComparisonController {
  /**
   * @param {object} opts
   * @param {object} opts.mod - Namespace del módulo (resultado de `import()`).
   * @param {import('./camera.js').Camera} opts.camera
   * @param {import('./scene.js').Scene} opts.scene
   * @param {HTMLCanvasElement} opts.canvas
   * @param {object} opts.hostCtx - Contexto que reciben las instancias ({engine, renderer, ui, …}).
   * @param {[string,string]} [opts.labels]
   * @param {() => void} [opts.onChange]
   */
  constructor(opts) {
    this.mod = opts.mod;
    this.camera = opts.camera;
    this.scene = opts.scene;
    this.canvas = opts.canvas;
    this.hostCtx = opts.hostCtx || {};
    this.labels = opts.labels || ['A', 'B'];
    this.onChange = opts.onChange || (() => {});

    /** Fracción del ancho que ocupa el lado A. */
    this.split = 0.5;
    /** Con el enlace activo, un cambio en A se propaga a B. */
    this.linked = true;
    /** Parámetros que NO se propagan: son la variable independiente. */
    this.independent = new Set();

    /** @type {object|null} */
    this.a = null;
    /** @type {object|null} */
    this.b = null;
    this.active = false;

    this._draggingDivider = false;
    this._bindDivider();
  }

  /**
   * Un módulo sólo es comparable si expone una clase instanciable: un
   * namespace legacy comparte estado entre «instancias» y produciría dos
   * vistas idénticas, que es peor que no ofrecer la función.
   * @param {object} mod
   * @returns {boolean}
   */
  static supports(mod) {
    const Ctor = mod?.default;
    if (!(Ctor instanceof Function) || !(Ctor.prototype instanceof SimModule)) return false;
    // Además de ser instanciable, debe dibujar con la escena: un módulo que
    // aún usa `render(ctx)` heredaría el `draw` vacío y daría dos paneles en
    // blanco, que es peor que no ofrecer la comparación.
    return Ctor.prototype.draw !== SimModule.prototype.draw;
  }

  /** Crea las dos instancias y arranca la comparación. */
  start(meta = null) {
    if (!ComparisonController.supports(this.mod)) return false;
    const Ctor = this.mod.default;
    this.a = new Ctor({ ...this.hostCtx, scene: this.scene, compareSide: 'a' });
    this.b = new Ctor({ ...this.hostCtx, scene: this.scene, compareSide: 'b' });
    for (const inst of [this.a, this.b]) {
      try {
        inst.init(meta);
      } catch (err) {
        console.error('Error iniciando una instancia de comparación:', err);
      }
    }
    this.active = true;
    return true;
  }

  /**
   * Propaga un cambio de parámetro al otro lado si el enlace está activo y el
   * parámetro no es la variable independiente.
   * @param {string} id
   * @param {*} value
   * @param {'a'|'b'} [from='a']
   */
  syncParam(id, value, from = 'a') {
    const target = from === 'a' ? this.b : this.a;
    if (!this.linked || !target || this.independent.has(id)) return;
    if (!target.params) return;
    target.params[id] = value;
    try {
      target.reset?.();
    } catch (err) {
      console.error('Error al reiniciar el lado enlazado:', err);
    }
  }

  /** Marca (o desmarca) un parámetro como variable independiente. */
  setIndependent(id, on = true) {
    if (on) this.independent.add(id);
    else this.independent.delete(id);
    return this;
  }

  setLinked(on) {
    this.linked = on !== false;
    return this;
  }

  /** Avanza la física de ambos lados con el mismo paso. */
  update(dt) {
    for (const inst of [this.a, this.b]) {
      if (!inst) continue;
      try {
        inst.update(dt);
      } catch (err) {
        console.error('Error en update de una instancia de comparación:', err);
      }
    }
  }

  reset() {
    for (const inst of [this.a, this.b]) {
      try {
        inst?.reset?.();
      } catch (err) {
        console.error('Error al reiniciar una instancia de comparación:', err);
      }
    }
  }

  /** Rectángulos en px CSS de cada mitad y de la divisoria. */
  rects(cssW, cssH) {
    const x = Math.round(cssW * this.split);
    return {
      a: { x: 0, y: 0, w: x - 1, h: cssH },
      b: { x: x + 1, y: 0, w: cssW - x - 1, h: cssH },
      divider: x
    };
  }

  /**
   * Dibuja los dos lados moviendo el viewport de la cámara. El zoom y el
   * centro son los mismos a propósito: si las escalas no coinciden, la
   * comparación visual deja de significar nada.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cssW
   * @param {number} cssH
   * @param {(scene: object) => void} [drawBackground]
   */
  draw(ctx, cssW, cssH, drawBackground) {
    if (!this.active) return;
    const theme = getTheme();
    const { a, b, divider } = this.rects(cssW, cssH);

    this._drawSide(ctx, this.a, a, this.labels[0], theme, drawBackground);
    this._drawSide(ctx, this.b, b, this.labels[1], theme, drawBackground);

    // Divisoria: se dibuja al final para que ningún lado la pise.
    ctx.save();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.hudBorder;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(divider, 0);
    ctx.lineTo(divider, cssH);
    ctx.stroke();
    // Asidero visible: sin él, nadie descubre que la divisoria se arrastra.
    ctx.fillStyle = theme.hudBg;
    ctx.strokeStyle = theme.hudBorder;
    ctx.beginPath();
    ctx.roundRect?.(divider - 3, cssH / 2 - 16, 6, 32, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawSide(ctx, inst, rect, label, theme, drawBackground) {
    if (!inst) return;
    const cam = this.camera;
    const prev = { ...cam.viewport };
    cam.setViewport(rect.x, rect.y, rect.w, rect.h);

    ctx.save();
    // Recortar impide que un lado invada al otro con una estela larga o una
    // etiqueta anclada al borde.
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    this.scene.beginFrame(ctx, { theme, dt: this.scene.dt, elapsed: this.scene.elapsed });
    this.scene.beginHud(ctx);
    this.scene.beginBackground(ctx);
    try {
      if (typeof drawBackground === 'function') drawBackground(this.scene);
      inst.draw(this.scene);
      // Centrado arriba: la esquina superior izquierda suele estar ocupada por
      // los chips de estado del propio módulo.
      this.scene.hud.chip(label, 'top', { size: 13 });
    } catch (err) {
      console.error('Error dibujando un lado de la comparación:', err);
    }
    this.scene.endFrame();

    ctx.restore();
    cam.setViewport(prev.x, prev.y, prev.w, prev.h);
  }

  /**
   * Tabla comparada a partir de `readout()` de ambas instancias, con la
   * diferencia B − A. Es lo que convierte la vista doble en una medida.
   * @returns {string} HTML.
   */
  readoutTable() {
    const ra = this._safeReadout(this.a);
    const rb = this._safeReadout(this.b);
    const keys = [...new Set([...Object.keys(ra), ...Object.keys(rb)])];
    if (!keys.length) return '<p class="placeholder-text">Sin datos comparables.</p>';

    const rows = keys
      .map((k) => {
        const va = ra[k];
        const vb = rb[k];
        const na = Number(va?.value);
        const nb = Number(vb?.value);
        const unit = va?.unit || vb?.unit || '';
        const diff =
          Number.isFinite(na) && Number.isFinite(nb) ? (nb - na).toFixed(3) : '—';
        const fmt = (v) => (Number.isFinite(Number(v?.value)) ? Number(v.value).toFixed(3) : '—');
        return `<tr><th scope="row">${k}</th><td>${fmt(va)}</td><td>${fmt(vb)}</td><td>${diff}</td><td>${unit}</td></tr>`;
      })
      .join('');

    return `<table class="compare-table">
      <thead><tr><th scope="col">Magnitud</th><th scope="col">${this.labels[0]}</th><th scope="col">${this.labels[1]}</th><th scope="col">Δ</th><th scope="col">Unidad</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  _safeReadout(inst) {
    if (!implementsMethod(inst, 'readout')) return {};
    try {
      return inst.readout() || {};
    } catch (err) {
      console.error('Error en readout de una instancia de comparación:', err);
      return {};
    }
  }

  /**
   * Arrastre de la divisoria. Se registra en fase de captura para llegar antes
   * que `CanvasInteraction`, pero sólo consume el evento si el puntero está
   * sobre la divisoria: el resto del lienzo sigue con su zoom y su pan.
   */
  _bindDivider() {
    const c = this.canvas;
    if (!c) return;

    const cssX = (e) => {
      const rect = c.getBoundingClientRect();
      const sx = rect.width ? c.clientWidth / rect.width : 1;
      return (e.clientX - rect.left) * sx;
    };

    this._onDown = (e) => {
      if (!this.active) return;
      const w = c.clientWidth || 1;
      if (Math.abs(cssX(e) - w * this.split) > DIVIDER_GRAB) return;
      this._draggingDivider = true;
      c.setPointerCapture?.(e.pointerId);
      e.stopPropagation();
      e.preventDefault();
    };
    this._onMove = (e) => {
      if (!this._draggingDivider) return;
      const w = c.clientWidth || 1;
      this.split = Math.min(0.85, Math.max(0.15, cssX(e) / w));
      this.onChange();
      e.stopPropagation();
    };
    this._onUp = (e) => {
      if (!this._draggingDivider) return;
      this._draggingDivider = false;
      c.releasePointerCapture?.(e.pointerId);
      e.stopPropagation();
    };

    c.addEventListener('pointerdown', this._onDown, true);
    c.addEventListener('pointermove', this._onMove, true);
    c.addEventListener('pointerup', this._onUp, true);
    c.addEventListener('pointercancel', this._onUp, true);
  }

  destroy() {
    const c = this.canvas;
    if (c) {
      c.removeEventListener('pointerdown', this._onDown, true);
      c.removeEventListener('pointermove', this._onMove, true);
      c.removeEventListener('pointerup', this._onUp, true);
      c.removeEventListener('pointercancel', this._onUp, true);
    }
    for (const inst of [this.a, this.b]) {
      try {
        inst?.destroy?.();
      } catch {
        /* la instancia ya no importa: se descarta igualmente */
      }
    }
    this.a = null;
    this.b = null;
    this.active = false;
  }
}
