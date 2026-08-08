/**
 * Iconos SVG inline para el catálogo y el tocador (sustituyen a los emojis).
 *
 * Los iconos son monocromos (`stroke="currentColor"`), 24 × 24, para que el
 * color lo decida la clase CSS del sitio (acento de categoría / tema). Cada
 * módulo puede tener un icono propio; si no, hereda el de su categoría.
 *
 * Solo se permiten SVGs constantes y verificados por `icons.test.mjs`: ningún
 * módulo dibuja aquí strings que no sean iconos.
 */
const svg = (inner) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
  'aria-hidden="true">' +
  inner +
  '</svg>';

/** Icono de cada categoría del catálogo (ver `CATEGORIES` en catalog.js). */
export const CATEGORY_ICONS = {
  'medicion-vectores': svg('<path d="M3 17.5 17.5 3l3.5 3.5L6.5 21 3 17.5z"/><path d="M6.3 6 8.8 8.5m1.3-1.3 2.5 2.5M10 11.8l2.5 2.5"/>'),
  cinematica: svg('<circle cx="13.5" cy="5" r="2.2"/><path d="M13.5 9.5v4.5M7 8.5l6.5 4M13.5 14l4.5 3.5M9.5 21l4-3.5M18 21l-4-3"/>'),
  'dinamica-fuerzas': svg('<path d="M12 21V4M4 9l8-6 8 6"/>'),
  'energia-momento': svg('<circle cx="12" cy="12" r="8.5"/><path d="M13.5 4.5 8 13h7l-2 6.5L16.5 11h-6"/>'),
  'rotacion-gravitacion': svg('<ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-18 12 12)"/><circle cx="20" cy="8" r="1.8"/><circle cx="12" cy="12" r="1.6"/>'),
  fluidos: svg('<path d="M12 3c4.2 5.4 6.5 8.5 6.5 11.8a6.5 6.5 0 0 1-13 0c0-3.3 2.3-6.4 6.5-11.8z"/>'),
  termica: svg('<path d="M12 6.5v10"/><circle cx="12" cy="16.5" r="3.4"/><path d="M12 3.5v3.5"/>'),
  'oscilaciones-ondas': svg('<path d="M2 13c2.5-6.5 5-6.5 7.5 0s5 6.5 7.5 0 5-6.5 7.5 0"/>'),
  optica: svg('<circle cx="8" cy="12" r="4.5"/><path d="M12.5 12H2.5M20.5 7.5l2.5-2.5M20.5 16.5l2.5 2.5"/>'),
  'electricidad-magnetismo': svg('<path d="M6 4h13a1 1 0 0 1 0 2H9a7 7 0 0 0 0 14h13"/><path d="M9 8h1.5M9 11h4"/>'),
  'fisica-moderna': svg('<circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>'),
  herramientas: svg('<path d="M14.8 3.4a4.6 4.6 0 0 0-3.9 7.3L4 17.6a2 2 0 0 0 2.8 2.8l6.9-6.9a4.6 4.6 0 0 0 1.1-10.1z"/><path d="M14.8 8.3a1.8 1.8 0 1 1-1.8-1.8"/>')
};

/** Iconos específicos de módulo (heredan su categoría si falta entrada). */
export const MODULE_ICONS = {
  hyperbola: svg('<path d="M3.5 4.5c3.2 2.1 3.2 12.9 0 15M20.5 4.5c-3.2 2.1-3.2 12.9 0 15"/><circle cx="12" cy="12" r="1.6"/>'),
  momentum: svg('<circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="4"/><path d="M11.5 12h6M17 12l-2.5-2.5M17 12l-2.5 2.5"/>'),
  vectors: svg('<path d="M3 21 21 3M21 3h-6M21 3v6"/><path d="M3 21l6-6"/>'),
  whiteboard: svg('<path d="M6 21 21 6l-3-3L3 18l-1 4z"/>'),
  projectile: svg('<circle cx="4" cy="20" r="2.4"/><path d="M6 19c6-5 12-12 14-17"/>')
};

/**
 * Icono SVG de un módulo (su ícono propio o el de su categoría) o `null`.
 * @param {string} id - id del módulo (catalog entry).
 * @param {string} [categoryId] - categoría del módulo (fallback).
 * @returns {string|null}
 */
export function iconFor(id, categoryId) {
  return MODULE_ICONS[id] || (categoryId ? CATEGORY_ICONS[categoryId] : null) || null;
}

/** Icono SVG de una categoría o `null`. */
export function categoryIcon(categoryId) {
  return CATEGORY_ICONS[categoryId] ?? null;
}