/**
 * @fileoverview Buscador del catálogo (§4.4).
 *
 * Índice plano construido una vez (≈26 módulos × ~10 términos ≈ 260 entradas,
 * unos pocos KB). Un filtro con puntuación sobre ese array es instantáneo, así
 * que no hace falta ninguna librería de búsqueda. El mismo índice sirve al
 * grid del menú y a la barra lateral del laboratorio.
 *
 * Reglas: incremental, insensible a acentos/mayúsculas (normalización NFD de
 * core/text.js), tolerante a erratas (distancia de edición 1 para consultas de
 * ≥4 caracteres) y capaz de apuntar a un **modo** interno (enlace profundo
 * `#/m/<id>?mode=<modo>`).
 */

import {
  normalizeText,
  editDistance,
  highlightText,
  escapeHtml
} from './core/text.js';
import { CATALOG, CATEGORIES, categoryLabel } from './catalog.js';

/**
 * Peso de cada campo (tabla de §4.4).
 * title/titleEn ×5 · serves ×4 · modo.label y modo.serves ×4 · blurb ×2 ·
 * topic ×2 · fórmulas ×1 · category ×1.
 */
const WEIGHTS = {
  title: 5,
  serves: 4,
  mode: 4,
  modeServes: 4,
  blurb: 2,
  topic: 2,
  formula: 1,
  category: 1
};

let _index = null;

function pushRecord(records, catalogId, modeId, rawTerm, weight, kind) {
  if (!rawTerm) return;
  const term = normalizeText(rawTerm);
  if (!term) return;
  records.push({ catalogId, modeId, term, raw: String(rawTerm), weight, kind });
}

/** Construye (una vez) el índice completo del catálogo. */
export function buildCatalogIndex() {
  const records = [];
  for (const m of CATALOG) {
    const cat = CATEGORIES.find((c) => c.id === m.category);
    pushRecord(records, m.id, null, m.title, WEIGHTS.title, 'title');
    pushRecord(records, m.id, null, m.titleEn, WEIGHTS.title, 'title');
    pushRecord(records, m.id, null, cat?.label, WEIGHTS.category, 'category');
    pushRecord(records, m.id, null, m.blurb, WEIGHTS.blurb, 'blurb');
    pushRecord(records, m.id, null, m.topic, WEIGHTS.topic, 'topic');
    for (const s of m.serves || []) {
      pushRecord(records, m.id, null, s, WEIGHTS.serves, 'serves');
    }
    for (const st of m.formulas || []) {
      pushRecord(records, m.id, null, st?.name, WEIGHTS.formula, 'formula');
    }
    for (const mode of m.modes || []) {
      pushRecord(records, m.id, mode.id, mode.label, WEIGHTS.mode, 'mode');
      for (const s of mode.serves || []) {
        pushRecord(records, m.id, mode.id, s, WEIGHTS.modeServes, 'mode');
      }
    }
  }
  _index = records;
  return records;
}

/** Índice (construyéndolo bajo demanda si hace falta). */
export function getCatalogIndex() {
  if (!_index) buildCatalogIndex();
  return _index;
}

const KIND_LABEL = {
  serves: 'Útil para',
  mode: 'Modo',
  modeServes: 'Modo · útil para',
  title: 'Coincide con el título',
  category: 'Categoría',
  blurb: 'Descripción',
  topic: 'Tema',
  formula: 'Fórmula'
};

function matchScore(rec, token) {
  // Coincidencia de palabra completa (tras normalizar) puntúa más.
  if (rec.term === token) return rec.weight * 1.5;
  if (rec.term.includes(token)) return rec.weight;
  return 0;
}

/**
 * Distancia de edición mínima entre el token y cualquiera de las palabras del
 * término (tolerancia a erratas por palabra, no contra la frase entera).
 * @returns {number} distancia si está dentro de `maxDist`; si no, Infinity.
 */
function wordDistance(tok, term, maxDist) {
  if (editDistance(tok, term, maxDist) <= maxDist) return editDistance(tok, term, maxDist);
  let best = Infinity;
  for (const w of term.split(/\s+/)) {
    if (w.length < 3) continue;
    const d = editDistance(tok, w, maxDist);
    if (d < best) best = d;
    if (best === 0) return 0;
  }
  return best;
}

/**
 * Busca en el índice. Devuelve resultados agrupados por módulo (y modo),
 * ordenados por puntuación.
 *
 * @param {string} query
 * @returns {Array<{ catalogId: string, modeId: string|null, score: number,
 *   reasons: Array<{ raw: string, kind: string }>, titleRaw: string }>}
 */
export function searchCatalog(query) {
  if (!query) return [];
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  const records = getCatalogIndex();
  const byKey = new Map();
  const keyOf = (id, modeId) => `${id}::${modeId || ''}`;

  // Primera pasada: coincidencia directa por token.
  let matchedAny = false;
  for (const rec of records) {
    for (const tok of tokens) {
      const sc = matchScore(rec, tok);
      if (sc <= 0) continue;
      matchedAny = true;
      const key = keyOf(rec.catalogId, rec.modeId);
      let acc = byKey.get(key);
      if (!acc) {
        acc = { catalogId: rec.catalogId, modeId: rec.modeId, score: 0, reasons: [] };
        byKey.set(key, acc);
      }
      acc.score += sc;
      if (!acc.reasons.some((r) => r.raw === rec.raw)) {
        acc.reasons.push({ raw: rec.raw, kind: rec.kind });
      }
    }
  }

  // Segunda pasada: tolerancia a erratas para tokens de ≥4 sin coincidencia.
  const unmatched = tokens.filter((tok) => (matchedAny ? !hasToken(tok) : true));
  for (const tok of unmatched) {
    if (tok.length < 4) continue;
    const maxD = tok.length >= 6 ? 2 : 1;
    for (const rec of records) {
      if (matchScore(rec, tok) > 0) continue;
      if (wordDistance(tok, rec.term, maxD) <= maxD) {
        const key = keyOf(rec.catalogId, rec.modeId);
        let acc = byKey.get(key);
        if (!acc) {
          acc = { catalogId: rec.catalogId, modeId: rec.modeId, score: 0, reasons: [] };
          byKey.set(key, acc);
        }
        acc.score += rec.weight * 0.5; // acierto por cercanía: menos peso
        if (!acc.reasons.some((r) => r.raw === rec.raw)) {
          acc.reasons.push({ raw: rec.raw, kind: rec.kind });
        }
      }
    }
  }

  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

function hasToken(tok) {
  for (const rec of getCatalogIndex()) {
    if (matchScore(rec, tok) > 0) return true;
  }
  return false;
}

/**
 * Sugiere los términos más cercanos del índice cuando no hay resultados
 * (nunca una pantalla vacía).
 * @param {string} query
 * @param {number} limit
 * @returns {Array<{ raw: string, dist: number }>}
 */
export function closestTerms(query, limit = 3) {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const suggestions = [];
  const seen = new Set();
  const maxDist = (t) => (t.length >= 6 ? 2 : 1);
  for (const tok of tokens) {
    for (const rec of getCatalogIndex()) {
      const d = wordDistance(tok, rec.term, maxDist(tok));
      if (d <= maxDist(tok) && !seen.has(rec.term)) {
        seen.add(rec.term);
        suggestions.push({ raw: rec.raw, dist: d });
      }
    }
  }
  suggestions.sort((a, b) => a.dist - b.dist);
  return suggestions.slice(0, limit);
}

/** Estado del buscador para el grid. */
export function searchState(query) {
  const results = searchCatalog(query);
  // Agrupa por categoría manteniendo el orden del menú.
  const byCat = new Map();
  for (const res of results) {
    const mod = CATALOG.find((m) => m.id === res.catalogId);
    const catId = mod?.category || 'otros';
    if (!byCat.has(catId)) byCat.set(catId, []);
    byCat.get(catId).push({ ...res, mod });
  }
  const groups = [];
  for (const catId of byCat.keys()) {
    const cat = CATEGORIES.find((c) => c.id === catId);
    groups.push({
      categoryId: cat?.id || catId,
      categoryLabel: cat?.label || categoryLabel(catId),
      accent: cat?.accent || 'gray',
      results: byCat.get(catId)
    });
  }
  return { query: normalizeText(query), groups };
}

/**
 * HTML de una tarjeta de resultado de búsqueda (con motivo y enlace de modo).
 * @param {{ catalogId: string, modeId: string|null, mod: object, reasons: Array<{raw: string, kind: string}>}} res
 */
export function resultCardHtml(res, queryTokens = null) {
  const mod = res.mod;
  const accent = mod.accent && /^[a-z0-9-]+$/i.test(mod.accent) ? mod.accent : '';
  const glyph = mod.glyph
    ? `<span class="catalog-card-glyph" aria-hidden="true">${escapeHtml(mod.glyph)}</span>`
    : '';
  const title = queryTokens
    ? highlightFirst(mod.title, queryTokens)
    : escapeHtml(mod.title);

  const reasons = (res.reasons || [])
    .map((r) => {
      const label = KIND_LABEL[r.kind] || 'Relacionado';
      const term = queryTokens ? highlightFirst(r.raw, queryTokens) : escapeHtml(r.raw);
      return `<span class="search-reason"><span class="search-reason-kind">${label}:</span> ${term}</span>`;
    })
    .join('');

  const modeRow = res.modeId
    ? `<div class="search-mode-route" aria-hidden="true">#/m/${escapeHtml(res.catalogId)}?mode=${escapeHtml(res.modeId)}</div>`
    : '';

  return `
    <button type="button" class="catalog-card catalog-search-hit${accent ? ` catalog-card-accent-${accent}` : ''}"
      data-catalog-id="${escapeHtml(res.catalogId)}"
      data-catalog-mode="${escapeHtml(res.modeId || '')}">
      <div class="catalog-card-top">
        <div class="catalog-card-heading">
          ${glyph}
          <div>
            <div class="catalog-card-title">${title}</div>
            <div class="catalog-card-en">${escapeHtml(mod.titleEn || '')}</div>
          </div>
        </div>
        ${
          res.modeId
            ? `<span class="catalog-badge mode">modo</span>`
            : `<span class="catalog-badge ${mod.status}">${mod.status === 'ready' ? 'Disponible' : 'Pronto'}</span>`
        }
      </div>
      <p class="catalog-card-blurb">${escapeHtml(mod.blurb)}</p>
      <div class="search-reasons">${reasons}</div>
      ${modeRow}
    </button>
  `;
}

/** Resalta la primera coincidencia de cualquier token (normalizado). */
function highlightFirst(raw, tokens) {
  const norm = normalizeText(raw);
  let best = -1;
  let bestTok = null;
  for (const t of tokens) {
    const p = norm.indexOf(t);
    if (p >= 0 && (best < 0 || p < best)) {
      best = p;
      bestTok = t;
    }
  }
  if (bestTok) return highlightText(raw, bestTok);
  return escapeHtml(raw);
}

/** ¿Hay coincidencia directa (no tipográfica) para el token en el índice? */
export function hasTypoFreeMatch(query) {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  return tokens.every((t) => t.length < 4 || hasToken(t));
}