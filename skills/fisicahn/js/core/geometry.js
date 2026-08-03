/**
 * @fileoverview geometry — utilidades geométricas del núcleo compartido.
 *
 * Reúne `clamp`/`lerp` (ya exportados por `utils/math-helpers.js`, sin uso) y
 * añade `dist` / `distToSegment`, ayudando a los módulos a dejar de lado sus
 * copias privadas. Punto de entrada único bajo `js/core/`.
 */
export { clamp, lerp, mapRange, roundTo, toDeg, toRad } from '../utils/math-helpers.js';

/**
 * Distancia euclídea entre dos puntos {x, y}.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Distancia mínima entre el punto `p` y el segmento [a, b].
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function distToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * abx, y: a.y + t * aby };
  return dist(p, proj);
}