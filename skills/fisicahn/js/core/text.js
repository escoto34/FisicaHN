/**
 * @fileoverview Utilidades de texto compartidas (§4.4).
 *
 * `normalizeText` se extrae de `auth.js:normalizeSchool` para reutilizarla en
 * el buscador del catálogo y en la barra lateral: sin esta normalización
 * NFD, «cinematica» no encontraría «Cinemática».
 */

/**
 * Normaliza texto para comparar: minúsculas, sin acentos (NFD + strip de
 * marcas combinantes) y espacios colapsados.
 * @param {*} value
 * @returns {string}
 */
export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normalización con mapa de índices: devuelve el texto normalizado y una
 * tabla `idx[i]` con la posición del carácter normalizado i-ésimo en el
 * texto original. Sirve para resaltar una coincidencia en el texto real
 * (con acentos) tras buscar sobre el normalizado.
 * @param {string} value
 * @returns {{ norm: string, idx: number[] }}
 */
export function normalizeIndexed(value) {
  const s = String(value || '');
  let norm = '';
  const idx = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\u0300' || (ch >= '\u0301' && ch <= '\u036f')) continue;
    norm += ch.toLowerCase();
    idx.push(i);
  }
  return { norm, idx };
}

/**
 * Distancia de edición (Levenshtein) con cota superior temprana: los pares
 * cuya diferencia de longitud ya supera `maxDist` se descartan al vuelo.
 * @param {string} a
 * @param {string} b
 * @param {number} maxDist
 * @returns {number}
 */
export function editDistance(a, b, maxDist = 2) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[n];
}

/**
 * Resalta la parte de `raw` que coincide con `token` (normalizado), envolviendo
 * el fragmento en <mark>. Devuelve el HTML.
 * @param {string} raw - Texto original (p. ej. «Cinemática»).
 * @param {string} token - Fragmento normalizado («cinematica»).
 * @returns {string}
 */
export function highlightText(raw, token) {
  const { norm, idx } = normalizeIndexed(raw);
  const pos = norm.indexOf(token);
  if (pos < 0) return escapeHtml(raw);
  const start = idx[pos];
  const end = idx[pos + token.length - 1] + 1;
  return (
    escapeHtml(raw.slice(0, start)) +
    '<mark>' +
    escapeHtml(raw.slice(start, end)) +
    '</mark>' +
    escapeHtml(raw.slice(end))
  );
}

/** Escapa HTML para inyectar texto seguro. */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
