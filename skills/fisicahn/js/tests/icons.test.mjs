/**
 * Iconos SVG del catálogo y el tocador (core/icons.js).
 *
 * · Cada módulo del catálogo resuelve un icono (el propio o el de su categoría).
 * · Cada categoría tiene icono propio.
 * · Los SVGs son constantes, bien formados y sin emojis (los emojis de
 *   `glyph` solo deben quedar como respaldo para módulos sin icono).
 *
 * Uso: node --test skills/fisicahn/js/tests/icons.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const JS = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CAT_URL = pathToFileURL(path.join(JS, 'catalog.js')).href;

const { CATALOG, CATEGORIES } = await import(CAT_URL);
const { iconFor, categoryIcon, CATEGORY_ICONS, MODULE_ICONS } = await import(
  pathToFileURL(path.join(JS, 'core/icons.js')).href
);

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function wellFormed(svg) {
  if (typeof svg !== 'string' || !svg.startsWith('<svg') || !svg.endsWith('</svg>')) return false;
  const open = count(svg, /<(path|circle|ellipse|line|rect|polyline|polygon)\b/g);
  const close = count(svg, /<\/(path|circle|ellipse|line|rect|polyline|polygon)>/g);
  return open > 0 && open === close && !EMOJI.test(svg);
}

function count(match) {
  return match ? match.length : 0;
}

test('iconos: todas las categorías tienen SVG propio', () => {
  for (const cat of CATEGORIES) {
    assert.ok(wellFormed(categoryIcon(cat.id)), `categoría "${cat.id}" sin icono válido`);
  }
});

test('iconos: cada módulo del catálogo resuelve un SVG (propio o de categoría)', () => {
  for (const mod of CATALOG) {
    assert.ok(wellFormed(iconFor(mod.id, mod.category)), `módulo "${mod.id}" sin icono`);
  }
});

test('iconos: los SVGs definidos son constantes y sin emojis', () => {
  for (const [id, icon] of Object.entries({ ...CATEGORY_ICONS, ...MODULE_ICONS })) {
    assert.ok(wellFormed(icon), `icono "${id}" mal formado o con emoji`);
  }
});

test('iconos: ningún icono de módulo depende de glyph emojis', () => {
  assert.equal(typeof MODULE_ICONS.hyperbola, 'string', 'hiperboola sin icono propio');
});