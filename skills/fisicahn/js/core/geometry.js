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

/**
 * Punto por el que un rayo que parte de `(x, y)` con dirección `(dx, dy)`
 * abandona el rectángulo `rect` (`{left, right, top, bottom}`, y hacia
 * arriba). Sirve para prolongar rayos ópticos «hasta el borde» sin salirse
 * del encuadre (lentes, espejos). Si el origen ya está fuera o la dirección
 * es nula devuelve el propio origen. Escribe en `out` para no allocar.
 * @param {number} x @param {number} y
 * @param {number} dx @param {number} dy
 * @param {{left:number,right:number,top:number,bottom:number}} rect
 * @param {{x:number,y:number}} [out]
 * @returns {{x:number,y:number}}
 */
export function rayExitToRect(x, y, dx, dy, rect, out = { x: 0, y: 0 }) {
  let t = Infinity;
  if (dx > 1e-12) t = Math.min(t, (rect.right - x) / dx);
  else if (dx < -1e-12) t = Math.min(t, (rect.left - x) / dx);
  if (dy > 1e-12) t = Math.min(t, (rect.top - y) / dy);
  else if (dy < -1e-12) t = Math.min(t, (rect.bottom - y) / dy);
  if (!Number.isFinite(t) || t < 0) t = 0;
  out.x = x + dx * t;
  out.y = y + dy * t;
  return out;
}

/**
 * Interpolación suave de Hermite: 0 en `edge0`, 1 en `edge1`, con
 * pendiente nula en ambos extremos. Es el *easing* de las animaciones de
 * aparición (caída de la muestra en `calorimetry`, dilataciones…), que cada
 * módulo escribía a mano como `u * u * (3 - 2 * u)`.
 * @param {number} edge0 @param {number} edge1 @param {number} x
 * @returns {number} en [0, 1]
 */
export function smoothstep(edge0, edge1, x) {
  const u = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1e-12)));
  return u * u * (3 - 2 * u);
}