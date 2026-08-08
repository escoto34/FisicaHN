/**
 * @fileoverview interaction — zoom, pan y manipulación directa (§2.6).
 *
 * Hasta ahora la interacción se agotaba en `getMousePos` / `getPointerPos` y
 * cada módulo resolvía su propio *hit testing* — cuando lo hacía. Aquí la
 * escena registra qué es seleccionable mientras dibuja (`scene.pickable`) y
 * este controlador resuelve el resto: rueda, pellizco, arrastre de cámara y
 * arrastre de objetos.
 *
 * El salto pedagógico está en lo último: pasar de «mover un deslizador» a
 * **manipular el sistema** — arrastrar una carga en `electric-field`, el foco
 * en `thin-lenses`, el bloque en `friction`.
 */

import { clamp } from './geometry.js';

/** Zoom por muesca de rueda. Suave a propósito: el trackpad emite muchas. */
const WHEEL_STEP = 1.0015;
/** Umbral en px para distinguir un clic de un arrastre. */
const DRAG_THRESHOLD = 4;

export class CanvasInteraction {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   * @param {import('./camera.js').Camera} opts.camera
   * @param {import('./scene.js').Scene} opts.scene
   * @param {() => void} [opts.onChange] - Se llama cuando la vista cambia (repintar en pausa).
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.camera = opts.camera;
    this.scene = opts.scene;
    this.onChange = opts.onChange || (() => {});
    /** Empieza el usuario a manipular un objeto: la app suelta el encuadre manual. */
    this.onPickStart = opts.onPickStart || (() => {});

    /** Módulo activo: recibe onPick/onDrag si los implementa. */
    this.target = null;
    /** Desactiva zoom/pan (la pizarra necesita el puntero para dibujar). */
    this.enabled = true;
    /** Herramienta activa de la barra (`pointer`, `ruler`, …). */
    this.tool = 'pointer';

    this._spaceDown = false;
    this._panning = false;
    this._dragId = null;
    this._downAt = null;
    this._moved = false;
    this._pointers = new Map();
    this._pinchDist = 0;
    this._hoverId = null;
    this._world = { x: 0, y: 0 };

    this._bind();
  }

  /** Punto del puntero en px CSS relativos al lienzo. */
  _screenPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    // El rectángulo puede estar escalado por CSS: normalizar a px de layout.
    const sx = rect.width ? this.canvas.clientWidth / rect.width : 1;
    const sy = rect.height ? this.canvas.clientHeight / rect.height : 1;
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
  }

  _bind() {
    const c = this.canvas;

    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const p = this._screenPos(e);
      // `deltaMode` 1 = líneas (Firefox): se normaliza a píxeles.
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.camera.zoomAt(p.x, p.y, Math.pow(WHEEL_STEP, -delta));
      this.onChange();
    };
    c.addEventListener('wheel', this._onWheel, { passive: false });

    this._onPointerDown = (e) => {
      if (!this.enabled) return;
      this._pointers.set(e.pointerId, this._screenPos(e));
      const p = this._screenPos(e);
      this._downAt = p;
      this._moved = false;

      if (this._pointers.size === 2) {
        // Dos dedos: pellizco. Se cancela cualquier arrastre en curso.
        this._pinchDist = this._pinchDistance();
        this._dragId = null;
        this._panning = false;
        return;
      }

      const middle = e.button === 1;
      const world = this.camera.screenToWorld(p.x, p.y, this._world);

      // Botón central o espacio+arrastre: pan. Es el gesto estándar y no
      // compite con el arrastre de objetos ni con las herramientas de medida.
      if (middle || this._spaceDown) {
        this._panning = true;
        c.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        return;
      }

      if (this.tool !== 'pointer') return;

      const id = this.scene.pickAt(world.x, world.y);
      if (id && this._canDrag()) {
        this._dragId = id;
        c.setPointerCapture?.(e.pointerId);
        this._emit('onPickStart', id, world);
        this.onPickStart(id, world);
        e.preventDefault();
      }
    };
    c.addEventListener('pointerdown', this._onPointerDown);

    this._onPointerMove = (e) => {
      if (!this.enabled) return;
      const p = this._screenPos(e);
      const prev = this._pointers.get(e.pointerId);
      if (prev) this._pointers.set(e.pointerId, p);

      if (this._pointers.size === 2) {
        const d = this._pinchDistance();
        if (this._pinchDist > 0 && d > 0) {
          const mid = this._pinchMidpoint();
          this.camera.zoomAt(mid.x, mid.y, d / this._pinchDist);
          this.onChange();
        }
        this._pinchDist = d;
        e.preventDefault();
        return;
      }

      if (this._downAt && !this._moved) {
        const dx = p.x - this._downAt.x;
        const dy = p.y - this._downAt.y;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this._moved = true;
      }

      if (this._panning && prev) {
        this.camera.panByScreen(p.x - prev.x, p.y - prev.y);
        this.onChange();
        return;
      }

      const world = this.camera.screenToWorld(p.x, p.y, this._world);

      if (this._dragId) {
        this._emit('onDrag', this._dragId, world);
        this.onChange();
        return;
      }

      // Hover: alimenta la inspección (tooltip con magnitudes en vivo) y
      // cambia el cursor para que se note qué es manipulable.
      if (this.tool === 'pointer') {
        const id = this.scene.pickAt(world.x, world.y);
        if (id !== this._hoverId) {
          this._hoverId = id;
          c.style.cursor = id ? 'grab' : '';
          this._emit('onHover', id, world);
          this.onChange();
        }
      }
    };
    c.addEventListener('pointermove', this._onPointerMove);

    this._onPointerUp = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchDist = 0;
      const p = this._screenPos(e);
      const world = this.camera.screenToWorld(p.x, p.y, this._world);

      if (this._dragId) {
        this._emit('onDragEnd', this._dragId, world);
        this._dragId = null;
      } else if (this._panning) {
        this._panning = false;
      } else if (!this._moved && this.tool === 'pointer' && this.enabled) {
        const id = this.scene.pickAt(world.x, world.y);
        if (id) this._emit('onPick', id, world);
      }
      this._downAt = null;
      c.releasePointerCapture?.(e.pointerId);
    };
    c.addEventListener('pointerup', this._onPointerUp);
    c.addEventListener('pointercancel', this._onPointerUp);

    // El espacio activa el pan sólo si el foco no está en un control de texto.
    this._onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      const tag = document.activeElement?.tagName || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      this._spaceDown = true;
      if (this.enabled) this.canvas.style.cursor = 'grab';
    };
    this._onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      this._spaceDown = false;
      this.canvas.style.cursor = '';
    };
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  /** Sólo se arrastra si el módulo declara qué hacer con el arrastre. */
  _canDrag() {
    const t = this.target;
    return !!(t && (typeof t.onDrag === 'function' || typeof t.onPickStart === 'function'));
  }

  _emit(method, id, world) {
    const t = this.target;
    if (!t || typeof t[method] !== 'function') return;
    try {
      t[method](id, world);
    } catch (err) {
      console.error(`Error en ${method} del módulo:`, err);
    }
  }

  _pinchDistance() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  _pinchMidpoint() {
    const pts = [...this._pointers.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  /** Cambia el módulo que recibe los eventos de picking. */
  setTarget(instance) {
    this.target = instance || null;
    this._dragId = null;
    this._hoverId = null;
    this.canvas.style.cursor = '';
    return this;
  }

  /** Activa o desactiva el zoom/pan (la pizarra lo desactiva). */
  setEnabled(on) {
    this.enabled = on !== false;
    if (!this.enabled) {
      this._panning = false;
      this._dragId = null;
      this.canvas.style.cursor = '';
    }
    return this;
  }

  /** Sincroniza la herramienta activa de la barra lateral. */
  setTool(tool) {
    this.tool = tool || 'pointer';
    return this;
  }

  /** Elemento bajo el cursor en el último movimiento, o null. */
  get hovered() {
    return this._hoverId;
  }

  destroy() {
    const c = this.canvas;
    c.removeEventListener('wheel', this._onWheel);
    c.removeEventListener('pointerdown', this._onPointerDown);
    c.removeEventListener('pointermove', this._onPointerMove);
    c.removeEventListener('pointerup', this._onPointerUp);
    c.removeEventListener('pointercancel', this._onPointerUp);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this._pointers.clear();
    this.target = null;
  }
}

/**
 * Herramientas de medida reutilizables en todos los módulos (§2.6). Antes
 * vivían dentro de `app.js` y sólo servían al módulo activo; aquí son estado
 * puro que la escena dibuja en la capa HUD.
 */
export class MeasureTools {
  constructor() {
    this.tool = 'pointer';
    /** @type {Array<{x:number,y:number}>} */
    this.rulerPoints = [];
    /** @type {Array<{x:number,y:number}>} */
    this.anglePoints = [];
    /** @type {{x:number,y:number}|null} */
    this.probe = null;
  }

  /** @returns {boolean} true si el clic fue consumido por una herramienta. */
  handleClick(world) {
    if (this.tool === 'probe') {
      this.probe = { x: world.x, y: world.y };
      return true;
    }
    if (this.tool === 'ruler') {
      this.rulerPoints.push({ x: world.x, y: world.y });
      if (this.rulerPoints.length > 2) this.rulerPoints = [{ x: world.x, y: world.y }];
      return true;
    }
    if (this.tool === 'angle') {
      this.anglePoints.push({ x: world.x, y: world.y });
      if (this.anglePoints.length > 3) this.anglePoints = [{ x: world.x, y: world.y }];
      return true;
    }
    return false;
  }

  setTool(tool) {
    this.tool = tool || 'pointer';
    if (this.tool !== 'ruler') this.rulerPoints = [];
    if (this.tool !== 'angle') this.anglePoints = [];
    return this;
  }

  clear() {
    this.rulerPoints = [];
    this.anglePoints = [];
    this.probe = null;
    return this;
  }

  /** @returns {boolean} true si hay algo que dibujar. */
  get active() {
    return !!(this.probe || this.rulerPoints.length || this.anglePoints.length);
  }

  /**
   * Dibuja las medidas sobre la capa de mundo, después del módulo: siguen a la
   * cámara y no obligan a invalidar el HUD en cada desplazamiento.
   * @param {import('./scene.js').Scene} scene
   */
  draw(scene) {
    const world = scene.world$;
    if (this.probe) {
      world.tooltip(
        this.probe.x,
        this.probe.y,
        `x=${this.probe.x.toFixed(2)}  y=${this.probe.y.toFixed(2)}`
      );
    }
    if (this.rulerPoints.length === 1) {
      const a = this.rulerPoints[0];
      world.circle(a.x, a.y, world.units(5), { color: 'warn', fill: 'warn' });
    } else if (this.rulerPoints.length === 2) {
      const [a, b] = this.rulerPoints;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      world.dimension(a.x, a.y, b.x, b.y, `${d.toFixed(2)} m`, { color: 'warn' });
    }
    if (this.anglePoints.length) {
      for (const p of this.anglePoints) {
        world.circle(p.x, p.y, world.units(4), { color: 'accel', fill: 'accel' });
      }
      if (this.anglePoints.length === 3) {
        const [A, O, B] = this.anglePoints;
        world.polyline([A, O, B], { color: 'accel', width: 2 });
        const a1 = Math.atan2(A.y - O.y, A.x - O.x);
        const a2 = Math.atan2(B.y - O.y, B.x - O.x);
        world.angleArc(O.x, O.y, a1, a2, world.units(38), { color: 'accel' });
      }
    }
    return this;
  }
}
