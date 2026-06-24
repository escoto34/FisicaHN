/**
 * @fileoverview PhysicsEngine — Bucle principal de simulación con timestep fijo.
 *
 * Usa requestAnimationFrame con acumulador de timestep fijo (60 FPS).
 * Soporta multiplicador de velocidad (0.1× a 5×) y callbacks onUpdate/onRender.
 */

const DEFAULT_DT = 1 / 60;
const MAX_FRAME_TIME = 0.1; // 100 ms
const MIN_SPEED = 0.1;
const MAX_SPEED = 5;

export class PhysicsEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this._running = false;
    this._paused = false;
    this._speed = 1;
    this._accumulator = 0;
    this._lastTime = 0;
    this._frameId = null;

    this._fps = 0;
    this._fpsFrames = 0;
    this._fpsTime = 0;

    /**
     * Callback: onUpdate(dt) — llamado en cada tick de física.
     * @type {function(number): void|undefined}
     */
    this.onUpdate = null;

    /**
     * Callback: onRender(ctx, dt, elapsed) — llamado en cada frame renderizado.
     * @type {function(CanvasRenderingContext2D, number, number): void|undefined}
     */
    this.onRender = null;

    /**
     * Callback: onPauseChanged(paused) — notifica cambios de pausa.
     * @type {function(boolean): void|undefined}
     */
    this.onPauseChanged = null;

    this._elapsed = 0;
  }

  /**
   * Inicia el bucle de simulación.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._paused = false;
    this._lastTime = performance.now() / 1000;
    this._tick(this._lastTime);
  }

  /**
   * Detiene el bucle por completo.
   */
  stop() {
    this._running = false;
    this._paused = false;
    if (this._frameId !== null) {
      cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }
  }

  /**
   * Pausa o reanuda la simulación.
   * @param {boolean} [pause] - Opcional: true para pausar, false para reanudar.
   */
  pause(pause) {
    if (pause === undefined) pause = !this._paused;
    this._paused = pause;
    if (this.onPauseChanged) this.onPauseChanged(this._paused);
    if (!this._paused) {
      this._lastTime = performance.now() / 1000;
    }
  }

  /**
   * Reinicia la simulación (acumulador y tiempo a cero).
   */
  reset() {
    this._accumulator = 0;
    this._lastTime = performance.now() / 1000;
    this._elapsed = 0;
    this._fps = 0;
    this._fpsFrames = 0;
    this._fpsTime = 0;
  }

  /**
   * Define el multiplicador de velocidad.
   * @param {number} mult - Valor entre 0.1 y 5
   */
  setSpeed(mult) {
    this._speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, mult));
  }

  /** @returns {number} Velocidad actual */
  getSpeed() {
    return this._speed;
  }

  /** @returns {boolean} Si la simulación está pausada */
  isPaused() {
    return this._paused;
  }

  /** @returns {number} Tiempo simulado transcurrido en segundos */
  getElapsed() {
    return this._elapsed;
  }

  /** @returns {number} FPS calculados */
  getFps() {
    return this._fps;
  }

  /**
   * Fuerza un tick de física (útil para avance por paso).
   */
  step() {
    if (this.onUpdate) this.onUpdate(DEFAULT_DT);
    this._elapsed += DEFAULT_DT;
  }

  /**
   * Bucle interno: requestAnimationFrame.
   * @param {number} now - Timestamp de performance.now() / 1000
   */
  _tick(now) {
    if (!this._running) return;
    this._frameId = requestAnimationFrame((t) => this._tick(t / 1000));

    // Cálculo de FPS
    this._fpsFrames++;
    this._fpsTime += this._lastTime ? (now - this._lastTime) : 0;
    if (this._fpsTime >= 1) {
      this._fps = Math.round(this._fpsFrames / this._fpsTime);
      this._fpsFrames = 0;
      this._fpsTime = 0;
    }

    // Timestep acumulador
    let frameTime = now - this._lastTime;
    this._lastTime = now;

    if (this._paused) {
      if (this.onRender) this.onRender(this.ctx, 0, this._elapsed);
      return;
    }

    // Limitar frameTime para evitar espirales de muerte
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

    this._accumulator += frameTime * this._speed;

    while (this._accumulator >= DEFAULT_DT) {
      if (this.onUpdate) this.onUpdate(DEFAULT_DT);
      this._accumulator -= DEFAULT_DT;
      this._elapsed += DEFAULT_DT;
    }

    if (this.onRender) this.onRender(this.ctx, this._accumulator / DEFAULT_DT, this._elapsed);
  }
}
