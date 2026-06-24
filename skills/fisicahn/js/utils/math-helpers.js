/**
 * @fileoverview Funciones matemáticas auxiliares para FísicaHN.
 */

/**
 * Interpolación lineal entre a y b.
 * @param {number} a
 * @param {number} b
 * @param {number} t - Factor de interpolación [0, 1]
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Restringe un valor dentro de un rango [min, max].
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Re-mapea un valor de un rango de entrada a un rango de salida.
 * @param {number} val
 * @param {number} inMin
 * @param {number} inMax
 * @param {number} outMin
 * @param {number} outMax
 * @returns {number}
 */
export function mapRange(val, inMin, inMax, outMin, outMax) {
  const t = (val - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

/**
 * Convierte grados a radianes.
 * @param {number} deg
 * @returns {number}
 */
export function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Convierte radianes a grados.
 * @param {number} rad
 * @returns {number}
 */
export function toDeg(rad) {
  return rad * (180 / Math.PI);
}

/**
 * Redondea un número a una cantidad fija de decimales.
 * @param {number} val
 * @param {number} decimals - Cantidad de decimales (por defecto 0)
 * @returns {number}
 */
export function roundTo(val, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}
