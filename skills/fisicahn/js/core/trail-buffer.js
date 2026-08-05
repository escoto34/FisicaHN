/**
 * @fileoverview TrailBuffer — buffer de estela en anillo (O(1), capacidad fija).
 *
 * Sustituye el patrón `push` + `shift()` con tope duplicado en 6 módulos
 * (kinematics, dynamics, force-kinetic, gravity, magnetic, particles). El
 * array de tamaño fijo evita el O(n) de `shift()` en cada frame del bucle
 * caliente (§2.2 / §3.2).
 */
export class TrailBuffer {
  /**
   * @param {number} capacity - Número máximo de puntos retenidos.
   */
  constructor(capacity = 200) {
    this.capacity = capacity;
    this.size = 0;
    this.head = 0;
    this._buf = new Array(capacity);
  }

  /** Añade un punto al final, descartando el más antiguo si está lleno. */
  push(item) {
    if (this.size < this.capacity) {
      this._buf[this.size] = item;
      this.size++;
    } else {
      this._buf[this.head] = item;
      this.head = (this.head + 1) % this.capacity;
    }
    return this;
  }

  /**
   * Recorre los puntos en orden cronológico.
   * @param {(item: *, i: number) => void} fn
   */
  forEach(fn) {
    for (let i = 0; i < this.size; i++) {
      fn(this._buf[(this.head + i) % this.capacity], i);
    }
  }

  /** Devuelve una copia ordenada (no destructiva) de los puntos. */
  toArray() {
    const out = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      out[i] = this._buf[(this.head + i) % this.capacity];
    }
    return out;
  }

  /** Devuelve el punto más reciente, o `undefined` si está vacío. */
  last() {
    if (this.size === 0) return undefined;
    return this._buf[(this.head + this.size - 1) % this.capacity];
  }

  /** Punto i-ésimo en orden cronológico (0 = el más antiguo). */
  get(i) {
    return this._buf[(this.head + i) % this.capacity];
  }

  /** @returns {boolean} true si no hay puntos. */
  isEmpty() {
    return this.size === 0;
  }

  /** Vacía el buffer. */
  clear() {
    this.size = 0;
    this.head = 0;
    return this;
  }

  /** Longitud efectiva. */
  get length() {
    return this.size;
  }
}