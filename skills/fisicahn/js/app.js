/**
 * @fileoverview App — Punto de entrada de FísicaHN.
 * Catálogo por nivel (MS / HS / Advanced) + motor de simulación.
 */

import { PhysicsEngine } from './physics-engine.js';
import { Renderer } from './renderer.js';
import { CATALOG, getById, getUnifiedCatalog, getSimulationCatalog, WORKS_MODULE, getCategory, buildEnginePaths } from './catalog.js';
import { searchState, closestTerms, resultCardHtml } from './catalog-search.js';
import { normalizeText, escapeHtml } from './core/text.js';
import { getSession, logAudit, ensureExamLivenessPolling } from './auth.js';
import { saveWork, listWorks, getWork, initWorksStorage } from './works.js';
import {
  bindWorksPanelControls,
  renderWorksSidebar,
  updateWorksCountBadges,
  openWorksModal,
  ensureTeacherExamSync
} from './works-panel.js';
import { ensureSessionGate, renderSessionBadge, renderUserChip } from './session-gate.js';
import { bindUserMenu } from './user-menu.js';
import { initNetworkStatusUI } from './network-status.js';
import { initPanelResize } from './panel-resize.js';
import { ChallengeEngine, loadChallengeDataForEngine } from './challenges.js';
import { enhanceParamsPanel, typesetMath, ensureChallengesCss, ensureKatex } from './module-ui.js';
import { createModuleInstance, implementsMethod } from './core/sim-module.js';
import { Camera } from './core/camera.js';
import { LayerStack } from './core/layers.js';
import { Scene } from './core/scene.js';
import { CanvasInteraction, MeasureTools } from './core/interaction.js';
import { getTheme, getThemeName, setTheme, cycleTheme, toggleProjector, onThemeChange, THEMES } from './core/theme.js';
import { renderSchemaHtml, bindSchema, defaultValues, syncSchema } from './core/params-schema.js';
import { exportPng, exportSvg } from './core/scene-export.js';
import { ComparisonController } from './core/compare.js';

/* ============================================
   Estado
   ============================================ */
const state = {
  view: 'catalog', // 'catalog' | 'sim'
  catalogLevel: 'all', // filtro por nivel del catálogo (§4.3 nº4)
  catalogQuery: '', // consulta del buscador (§4.4)
  catalogCollapsed: {}, // secciones plegadas (persistente, §4.2)
  catalogId: null,
  currentModule: null,
  /** Namespace del `import()` activo: lo necesita la comparación (§2.9). */
  currentModuleNamespace: null,
  moduleInstances: {},
  loaded: false
};

const STORAGE_KEY = 'fisicahn_progress';
/** Estado de plegado de las secciones del catálogo (persistente). */
const COLLAPSED_KEY = 'fisicahn_catalog_collapsed';

/** Rutas de motores derivadas del catálogo (§4.5): una sola fuente. */
const ENGINE_PATHS = buildEnginePaths();

/** Motores de simulación (ruta por convención ./modules/<engineKey>.js) */
const ENGINE_PATHS = {
  kinematics: './modules/kinematics.js',
  dynamics: './modules/dynamics.js',
  'force-kinetic': './modules/force-kinetic.js',
  friction: './modules/friction.js',
  statics: './modules/statics.js',
  electricity: './modules/electricity.js',
  optics: './modules/optics.js',
  whiteboard: './modules/whiteboard.js',
  momentum: './modules/momentum.js',
  oscillatory: './modules/oscillatory.js',
  sound: './modules/sound.js',
  magnetic: './modules/magnetic.js',
  gravity: './modules/gravity.js',
  atomic: './modules/atomic.js',
  particles: './modules/particles.js',
  rotational: './modules/rotational.js',
  thermodynamics: './modules/thermodynamics.js',
  'work-energy': './modules/work-energy.js',
  'collisions-2d': './modules/collisions-2d.js',
  lenses: './modules/lenses.js',
  'wave-optics': './modules/wave-optics.js',
  circuits: './modules/circuits.js',
  'em-waves': './modules/em-waves.js',
  photoelectric: './modules/photoelectric.js',
  radioactivity: './modules/radioactivity.js',
  tunneling: './modules/tunneling.js',
  kepler: './modules/kepler.js',
  placeholder: './modules/placeholder.js'
};

function engineTitle(engineKey, catalogEntry) {
  if (catalogEntry?.title) return catalogEntry.title;
  for (const m of CATALOG) {
    if (m.engineKey === engineKey) return m.title;
  }
  return engineKey === 'placeholder' ? 'Próximamente' : engineKey;
}

/**
 * Herramientas de medición globales. El estado vive ahora en `MeasureTools`
 * (§2.6), reutilizable por los 42 módulos en lugar de sólo por el activo.
 */
const measureState = new MeasureTools();

/* ============================================
   DOM
   ============================================ */
const catalogView = document.getElementById('catalogView');
const simShell = document.getElementById('simShell');
const catalogBackBtn = document.getElementById('catalogBackBtn');
const sidebarNav = document.getElementById('sidebarNav');
const canvas = document.getElementById('simCanvas');
const fpsCounter = document.getElementById('fpsCounter');
const simStatus = document.getElementById('simStatus');
const moduleTitle = document.getElementById('moduleTitle');
const speedSlider = document.getElementById('speedSlider');
const speedDisplay = document.getElementById('speedDisplay');
const playPauseBtn = document.getElementById('playPauseBtn');
const playPauseLabel = document.getElementById('playPauseLabel');
const resetBtn = document.getElementById('resetBtn');
const stepBtn = document.getElementById('stepBtn');
const paramsPanel = document.getElementById('paramsPanel');
const chartSvg = document.getElementById('chartSvg');
const bottomTabs = document.querySelectorAll('.bottom-tab');
const bottomContent = document.getElementById('bottomContent');
const toolBtns = document.querySelectorAll('.tool-btn');
/** @type {ChallengeEngine|null} */
let challengeEngine = null;

/** Motor / renderer: lazy al entrar al laboratorio (el menú no crea canvas loop) */
let engine = null;
let renderer = null;
/** @type {Camera|null} */
let camera = null;
/** @type {LayerStack|null} */
let layers = null;
/** @type {Scene|null} */
let scene = null;
/** @type {CanvasInteraction|null} */
let interaction = null;
/** @type {ComparisonController|null} */
let comparison = null;
/** Desenlace del panel declarativo del módulo activo (§2.7). */
let unbindParams = null;
let _lastFpsShown = -1;
let _lastChartAt = 0;
let _lastReadoutAt = 0;
const CHART_MIN_MS = 100; // ~10 Hz de SVG (evita innerHTML a 60 fps)
/** Misma cadencia para `readout()`: los datos no se leen a 60 Hz (§3.1). */
const READOUT_MIN_MS = 100;

function bindEngineCallbacks() {
  if (!engine) return;
  engine.onUpdate = onEngineUpdate;
  engine.onRender = onEngineRender;
  engine.onPauseChanged = () => updatePlayPauseUI();
  engine.onResize = () => {
    if (renderer) {
      renderer.setDpr?.(engine._dpr || 1);
      renderer.invalidateCssSize?.();
    }
    // El tamaño cambió: las capas fuera de pantalla deben reconstruirse.
    layers?.invalidateAll();
  };
}

/**
 * Crea motor, renderer y el núcleo de la WAVE 2 (cámara, capas, escena e
 * interacción) la primera vez que se abre un módulo.
 * @returns {boolean}
 */
function ensureEngine() {
  if (engine && renderer) return true;
  if (!canvas || typeof canvas.getContext !== 'function') {
    console.error('FísicaHN: no se encontró #simCanvas');
    return false;
  }
  try {
    engine = new PhysicsEngine(canvas);
    camera = new Camera({ worldWidth: 20, worldHeight: 15 });
    renderer = new Renderer(canvas, {
      camera,
      ctx: engine.ctx,
      dpr: engine._dpr || 1
    });
    layers = new LayerStack(canvas, { ctx: engine.ctx, dpr: engine._dpr || 1 });
    scene = new Scene({ camera, layers, canvas });
    interaction = new CanvasInteraction(canvas, {
      camera,
      scene,
      // En pausa nada repinta solo: mover la cámara debe pedir un frame.
      onChange: () => engine?.requestPaint?.()
    });
    // Un cambio de tema invalida el fondo (rejilla y ejes cambian de color).
    onThemeChange(() => {
      layers?.invalidateAll();
      updateViewControlsUI();
      engine?.requestPaint?.();
    });
    bindEngineCallbacks();
    applyStoredTheme();
    // Preferencias de rendimiento persistidas (30 FPS / batería, §3.3)
    applySettingsToEngine();
    return true;
  } catch (err) {
    console.error('FísicaHN: error al crear motor/renderer', err);
    engine = null;
    renderer = null;
    camera = null;
    layers = null;
    scene = null;
    interaction = null;
    return false;
  }
}

/** Refleja el tema persistido en el atributo que lee el CSS de la app. */
function applyStoredTheme() {
  try {
    document.documentElement.dataset.canvasTheme = getThemeName();
  } catch {
    /* sin DOM */
  }
  updateViewControlsUI();
}

/* ============================================
   UI API para módulos
   ============================================ */
const chartPanel = document.getElementById('chartPanel');

/**
 * Envuelve `setData` con fusión + descarga final (~10 Hz) para los módulos
 * legacy que siguen escribiendo HTML desde `update()` a 60–300 Hz (§3.1).
 *
 * El `innerHTML` + `typesetMath` (3× `querySelectorAll`) es lo caro de la
 * cadena, no el armado del string: coalescer la escritura basta para bajar las
 * reconstrucciones del panel a ≤10 por segundo sin tocar los módulos. La
 * primera llamada escribe de inmediato (leading) y el resto se fusionan y se
 * vuelcan al final de la ventana (trailing), de modo que el valor mostrado
 * siempre es el más reciente.
 *
 * @param {function(string): void} fn
 * @param {number} minMs
 */
function throttleSetData(fn, minMs = READOUT_MIN_MS) {
  let pending = null;
  let timer = null;
  let lastFlush = 0;
  const flush = () => {
    timer = null;
    lastFlush = performance.now();
    if (pending == null) return;
    const html = pending;
    pending = null;
    fn(html);
  };
  const call = (html) => {
    pending = String(html);
    if (timer) return;
    const now = performance.now();
    if (now - lastFlush >= minMs) {
      flush();
      return;
    }
    const wait = minMs - (now - lastFlush);
    timer = setTimeout(() => {
      const t = performance.now();
      if (t - lastFlush >= minMs) flush();
      else timer = setTimeout(flush, minMs - (t - lastFlush));
    }, wait);
  };
  /** Descarta la escritura pendiente (cambio de módulo). */
  call.clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };
  /** Vuelca la pendiente de inmediato (p. ej. antes de leer un valor). */
  call.flush = flush;
  return call;
}

const ui = {
  setParams(html) {
    if (!paramsPanel) return;
    paramsPanel.innerHTML = html;
    // Slider + campo de texto en todos los parámetros; LaTeX en etiquetas
    enhanceParamsPanel(paramsPanel);
    typesetMath(paramsPanel);
    // En pausa: repintar al cambiar parámetros
    if (!paramsPanel.dataset.paintBound) {
      paramsPanel.dataset.paintBound = '1';
      paramsPanel.addEventListener('input', () => engine?.requestPaint?.());
      paramsPanel.addEventListener('change', () => engine?.requestPaint?.());
    }
  },
  /** Muestra gráfica solo si enableCharts(true) o se pasa contenido no vacío con show=true */
  setChart(svgContent, opts = {}) {
    if (!chartSvg) return;
    const show = opts.show === true || (opts.show !== false && svgContent && !opts.hide);
    if (chartPanel) chartPanel.hidden = !show;
    if (show) chartSvg.innerHTML = svgContent;
  },
  showCharts(on) {
    if (chartPanel) chartPanel.hidden = !on;
  },
  setInfo(msg) {
    const infoPanel = document.getElementById('tab-info');
    if (infoPanel) {
      // Si ya viene marcado como bloque, no envolver
      if (String(msg).includes('module-info-block') || String(msg).includes('tab-text')) {
        infoPanel.innerHTML = msg;
      } else {
        infoPanel.innerHTML = `<p class="tab-text">${msg}</p>`;
      }
      typesetMath(infoPanel);
    }
  },
  setFormulas(html) {
    const panel = document.getElementById('tab-formulas');
    if (panel) {
      panel.innerHTML = html;
      typesetMath(panel);
    }
  },
  setData(html) {
    const panel = document.getElementById('tab-data');
    if (panel) {
      panel.innerHTML = html;
      typesetMath(panel);
    }
  },
  /**
   * @param {null|{ engineKey: string, challenges: Array }|string} data
   * null/'' → oculta pestaña Retos; objeto → monta motor en #tab-challenges
   */
  setChallenges(data) {
    const tabBtn = document.querySelector('.bottom-tab[data-tab="challenges"]');
    const panel = document.getElementById('tab-challenges');
    if (!tabBtn || !panel) return;

    if (!data || data === '' || (typeof data === 'object' && !data.challenges?.length)) {
      tabBtn.hidden = true;
      panel.hidden = true;
      panel.innerHTML = '';
      if (challengeEngine) {
        challengeEngine.destroy();
        challengeEngine = null;
      }
      if (tabBtn.classList.contains('active')) this.showTab('info');
      return;
    }

    tabBtn.hidden = false;
    panel.hidden = false;
    ensureChallengesCss();
    if (!challengeEngine) {
      challengeEngine = new ChallengeEngine({ mount: panel });
    } else {
      challengeEngine.mount(panel);
    }
    const engineKey = data.engineKey || state.currentModule || '';
    challengeEngine.loadChallenges(engineKey, data.challenges || []);
  },
  showTab(tabId) {
    const tabs = document.querySelectorAll('.bottom-tab');
    tabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    if (!bottomContent) return;
    const panels = bottomContent.querySelectorAll('.tab-panel');
    panels.forEach((p) => {
      p.classList.remove('active');
      // tab-challenges usa hidden para no ocupar si no hay retos
      if (p.id === 'tab-challenges' && tabId !== 'challenges') {
        /* keep panel.hidden as set by setChallenges */
      }
    });
    const target = document.getElementById(`tab-${tabId}`);
    if (target) {
      target.classList.add('active');
      if (tabId === 'challenges') target.hidden = false;
    }
  }
};

/**
 * UI que reciben LOS MÓDULOS LEGACY. La diferencia con `ui` es `setData`
 * throttleado (§3.1): escriben HTML desde `update()` a 60–300 Hz y el coste
 * real está en el `innerHTML` + typeset de KaTeX, no en el string. Los módulos
 * migrados (`SimModule`) usan `readout()` y el anfitrión escribe ~10 Hz, con
 * `ui.setData` directo.
 */
const legacyUi = { ...ui, setData: throttleSetData(ui.setData) };

/** Tras init del módulo: retos solo en modo examen con pack del docente. */
async function setupChallengesForEngine(engineKey) {
  if (!engineKey || engineKey === 'whiteboard' || engineKey === 'placeholder') {
    ui.setChallenges(null);
    return;
  }
  try {
    const challenges = await loadChallengeDataForEngine(engineKey);
    if (!challenges.length) {
      ui.setChallenges(null);
      return;
    }
    ui.setChallenges({ engineKey, challenges });
  } catch (e) {
    console.warn('setupChallengesForEngine', e);
    ui.setChallenges(null);
  }
}

/**
 * Aviso cuando el examen termina (este equipo o el docente en la nube).
 */
function showExamEndedBanner(detail = {}) {
  const remote = !!detail.remote;
  const code = detail.code ? String(detail.code) : '';
  let el = document.getElementById('examEndedBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'examEndedBanner';
    el.className = 'exam-ended-banner';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <strong>${remote ? 'El docente finalizó el examen' : 'Examen finalizado'}</strong>
    <span>${
      remote
        ? `Código ${code || '—'} ya no está activo. Volviste a modo práctica.`
        : `Código ${code || '—'} cerrado. Los alumnos conectados salen del examen automáticamente.`
    }</span>
    <button type="button" class="exam-ended-banner-close" aria-label="Cerrar aviso">×</button>
  `;
  el.hidden = false;
  el.querySelector('.exam-ended-banner-close')?.addEventListener('click', () => {
    el.hidden = true;
  });
  clearTimeout(showExamEndedBanner._t);
  showExamEndedBanner._t = setTimeout(() => {
    if (el) el.hidden = true;
  }, 12000);
}

async function onExamEndedGlobal(ev) {
  const detail = ev?.detail || {};
  try {
    renderUserChip(document.getElementById('userChipHost'));
    renderSessionBadge(document.getElementById('sessionBadgeHost'));
  } catch {
    /* ignore */
  }
  showExamEndedBanner(detail);
  if (state.currentModule) {
    try {
      await setupChallengesForEngine(state.currentModule);
    } catch {
      /* ignore */
    }
  } else {
    try {
      ui?.setChallenges?.(null);
    } catch {
      /* ignore */
    }
  }
  try {
    const { stopExamWorksPolling } = await import('./works-panel.js');
    stopExamWorksPolling();
  } catch {
    /* ignore */
  }
  try {
    updateWorksCountBadges();
  } catch {
    /* ignore */
  }
}

/* ============================================
   Catálogo UI (§4.2-§4.4)
   ============================================ */

/** Clave de estado de plegado: una entrada por categoría (persistente). */
function catalogSectionKey(catId) {
  return catId;
}

/** ¿El módulo pertenece al nivel filtrado? (`all` no filtra nada.) */
function moduleIsInLevel(mod, lvl) {
  return lvl === 'all' || mod.level === 'all' || mod.level === lvl;
}

/** HTML de una tarjeta del catálogo (se usa también para resultados de búsqueda). */
export function catalogCardHtml(mod, opts = {}) {
  const accent = mod.accent && /^[a-z0-9-]+$/i.test(mod.accent) ? mod.accent : '';
  const statusLabel =
    mod.special === 'works'
      ? opts.worksCount
        ? `${opts.worksCount} en caché`
        : 'Importar / ver'
      : mod.status === 'ready'
        ? 'Disponible'
        : 'Pronto';
  const glyph = mod.glyph
    ? `<span class="catalog-card-glyph" aria-hidden="true">${escapeHtml(mod.glyph)}</span>`
    : '';
  const mode = opts.mode ? ` data-catalog-mode="${escapeHtml(opts.mode)}"` : '';
  return `
    <button type="button" class="catalog-card${mod.special === 'works' ? ' catalog-card-works' : ''}${
      accent ? ` catalog-card-accent-${accent}` : ''
    }"
      data-catalog-id="${escapeHtml(mod.id)}"${mode}
      data-catalogId="${escapeHtml(mod.id)}"
      aria-label="${escapeHtml(mod.title)} ${mod.status === 'ready' ? 'Disponible' : 'Pronto'}">
      <div class="catalog-card-top">
        <div class="catalog-card-heading">
          ${glyph}
          <div>
            <div class="catalog-card-title">${escapeHtml(mod.title)}</div>
            <div class="catalog-card-en">${escapeHtml(mod.titleEn || '')}</div>
          </div>
        </div>
        <span class="catalog-badge ${mod.special === 'works' ? 'works' : mod.status}">${escapeHtml(
          statusLabel
        )}</span>
      </div>
      <p class="catalog-card-blurb">${escapeHtml(mod.blurb)}</p>
      ${mod.topic ? `<p class="catalog-card-topic">${escapeHtml(mod.topic)}</p>` : ''}
    </button>
  `;
}

/** Enlaza clics de tarjetas del catálogo (estáticas o generadas). */
function bindCatalogCardClicks() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;
  grid.querySelectorAll('[data-catalog-id], [data-catalogId]').forEach((btn) => {
    if (btn.dataset.boundClick === '1') return;
    btn.dataset.boundClick = '1';
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-catalog-id') || btn.dataset.catalogId;
      const mode = btn.getAttribute('data-catalog-mode');
      if (id) openCatalogModule(id, { mode });
    });
  });
}

/** HTML de la cabecera de sección (chevrón, glyph de categoría, título y nº). */
function sectionHeaderHtml(catId, label, n, level) {
  const key = catalogSectionKey(catId);
  const isCollapsed = !!state.catalogCollapsed[key];
  const cat = getCategory(catId);
  const glyph = cat?.glyph
    ? `<span class="catalog-sec-glyph" aria-hidden="true">${escapeHtml(cat.glyph)}</span>`
    : '';
  return `
    <button type="button" class="catalog-section-head" data-collapse-key="${escapeHtml(key)}"
      aria-expanded="${String(!isCollapsed)}">
      <span class="catalog-sec-chevron" aria-hidden="true">${isCollapsed ? '▸' : '▾'}</span>
      ${glyph}
      <span class="catalog-sec-title">${escapeHtml(label)}</span>
      <span class="catalog-sec-count">${n}</span>
    </button>
  `;
}

/** Marca una sección como plegada según el estado persistido. */
function applySectionCollapsed(section, key) {
  if (state.catalogCollapsed[key]) {
    section.classList.add('catalog-section-collapsed');
  }
}

/**
 * Renderiza el grid del catálogo según el filtro de nivel y la búsqueda.
 * §4.2: secciones por categoría · §4.4: agrupación de resultados por categoría.
 * §4.3 nº6: si la firma (nivel + consulta) no cambió, no se regenera el DOM.
 */
let _lastCatalogRenderSig = null;

function renderCatalogGrids() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;

  // Las pills reflejan siempre el estado (también tras abrir un módulo).
  document.querySelectorAll('.catalog-level-pill').forEach((p) => {
    p.setAttribute('aria-pressed', String(p.dataset.level === state.catalogLevel));
  });

  let worksCount = 0;
  try {
    worksCount = listWorks().length;
  } catch {
    worksCount = 0;
  }

  const query = state.catalogQuery.trim();
  const level = state.catalogLevel;
  const sig = `${level}::${query}::${worksCount}`;
  if (sig === _lastCatalogRenderSig) return;
  _lastCatalogRenderSig = sig;

  grid.innerHTML = '';

  if (query) {
    renderSearchSections(grid, query);
  } else {
    const seen = new Set();
    const mods = [];
    for (const card of getUnifiedCatalog()) {
      if (level !== 'all' && !moduleIsInLevel(card, level)) continue;
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      mods.push(card);
    }
    renderSectionedGrid(grid, mods, level, worksCount);
  }
  bindCatalogCardClicks();
  bindSectionCollapse();
  bindSearchSuggestions();
}

/** Secciones por categoría (cabecera plegable + fila de tarjetas). */
function renderSectionedGrid(grid, mods, level, worksCount) {
  const groups = new Map();
  for (const mod of mods) {
    const key = catalogSectionKey(mod.category);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mod);
  }
  for (const [key, list] of groups) {
    const cat = getCategory(key) || getCategory(list[0]?.category);
    const label = cat?.keyword || cat?.label || key;
    const section = document.createElement('section');
    section.className = 'catalog-section';
    section.setAttribute('data-category', key);
    section.innerHTML = sectionHeaderHtml(cat?.id || key, label, list.length, level);
    const body = document.createElement('div');
    body.className = 'catalog-section-body';
    const row = document.createElement('div');
    row.className = 'catalog-row';
    for (const mod of list) {
      const wrap = document.createElement('div');
      wrap.innerHTML = catalogCardHtml(mod, { worksCount });
      row.appendChild(wrap.firstElementChild);
    }
    body.appendChild(row);
    section.appendChild(body);
    applySectionCollapsed(section, key);
    grid.appendChild(section);
  }
}

/** Secciones de resultados de búsqueda agrupadas por categoría (§4.4). */
function renderSearchSections(grid, query) {
  const st = searchState(query);
  if (!st.groups.length) {
    grid.innerHTML = noResultsHtml(query);
    return;
  }
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  for (const group of st.groups) {
    const key = catalogSectionKey(group.categoryId);
    const section = document.createElement('section');
    section.className = 'catalog-section';
    section.innerHTML = sectionHeaderHtml(group.categoryId, group.categoryLabel, group.results.length, state.catalogLevel);
    const body = document.createElement('div');
    body.className = 'catalog-section-body';
    const row = document.createElement('div');
    row.className = 'catalog-row';
    for (const res of group.results) {
      const wrap = document.createElement('div');
      wrap.innerHTML = resultCardHtml(res, tokens);
      row.appendChild(wrap.firstElementChild);
    }
    body.appendChild(row);
    section.appendChild(body);
    grid.appendChild(section);
  }
}

/** Bloque de «sin resultados» con sugerencias por cercanía (§4.4). */
function noResultsHtml(query) {
  const suggestions = closestTerms(query, 3)
    .map(
      (s) =>
        `<button type="button" class="search-suggestion" data-sug="${escapeHtml(s.raw)}">${escapeHtml(
          s.raw
        )}</button>`
    )
    .join('');
  return `<div class="catalog-empty">
    <p class="placeholder-text">Sin resultados para «${escapeHtml(query)}».</p>
    ${suggestions ? `<p class="search-suggestions">¿Querías decir…? ${suggestions}</p>` : ''}
  </div>`;
}

/* --- Plegado de secciones (§4.2) --- */

function bindSectionCollapse() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;
  grid.querySelectorAll('.catalog-section-head').forEach((head) => {
    if (head.dataset.bound === '1') return;
    head.dataset.bound = '1';
    head.addEventListener('click', () => {
      const key = head.dataset.collapseKey;
      const section = head.closest('.catalog-section');
      if (!key || !section) return;
      const collapsed = !state.catalogCollapsed[key];
      state.catalogCollapsed[key] = collapsed;
      section.classList.toggle('catalog-section-collapsed', collapsed);
      head.setAttribute('aria-expanded', String(!collapsed));
      head.querySelector('.catalog-sec-chevron').textContent = collapsed ? '▸' : '▾';
      persistCollapsed();
    });
  });
}

function persistCollapsed() {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state.catalogCollapsed));
  } catch {
    /* almacenamiento no disponible */
  }
}

function loadCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    state.catalogCollapsed = raw ? JSON.parse(raw) : {};
  } catch {
    state.catalogCollapsed = {};
  }
}

/* --- Buscador (§4.4) --- */

function bindCatalogSearch() {
  const input = document.getElementById('catalogSearchInput');
  const clearBtn = document.getElementById('catalogSearchClear');
  if (!input) return;

  // Foco automático, solo la primera vez que se abre el catálogo (§4.4).
  if (!document.body.dataset.catalogSearchFocused) {
    document.body.dataset.catalogSearchFocused = '1';
    input.focus({ preventScroll: true });
  }

  const apply = () => {
    state.catalogQuery = input.value.trim();
    if (clearBtn) clearBtn.hidden = !state.catalogQuery;
    renderCatalogGrids();
  };

  input.addEventListener('input', () => {
    if (input.dataset.debounce) clearTimeout(input.dataset.debounce);
    input.dataset.debounce = setTimeout(apply, 180);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      apply();
      input.blur();
    } else if (e.key === 'Enter') {
      if (input.dataset.debounce) {
        clearTimeout(input.dataset.debounce);
        delete input.dataset.debounce;
      }
      apply();
    }
  });
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      apply();
      input.focus();
    });
  }
}

/** Atajo de teclado «/» o Ctrl-K para enfocar el buscador (fuera de inputs). */
function bindCatalogSearchShortcut() {
  document.addEventListener('keydown', (e) => {
    const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
    const isCtrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
    if (!isSlash && !isCtrlK) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (state.view !== 'catalog') return;
    e.preventDefault();
    const input = document.getElementById('catalogSearchInput');
    if (input) {
      input.focus();
      input.select();
    }
  });
}

function bindCatalogLevelFilters() {
  const group = document.querySelector('.catalog-level-filters');
  if (!group) return;
  group.querySelectorAll('.catalog-level-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      state.catalogLevel = pill.dataset.level || 'all';
      group.querySelectorAll('.catalog-level-pill').forEach((p) => {
        p.setAttribute('aria-pressed', String(p === pill));
      });
      renderCatalogGrids();
    });
  });
}

/** Las sugerencias de «sin resultados» llenan el buscador y vuelven a buscar. */
function bindSearchSuggestions() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;
  grid.querySelectorAll('.search-suggestion').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const input = document.getElementById('catalogSearchInput');
      if (input) {
        input.value = btn.dataset.sug || '';
        state.catalogQuery = input.value.trim();
        renderCatalogGrids();
        input.focus();
      }
    });
  });
}

/* --- Ficha del módulo (§4.3): «Útil para» (serves[]) --- */

/** Adjunta los `serves[]` del módulo al pie del panel de parámetros. */
function appendCatalogServes(entry) {
  if (!paramsPanel) return;
  const list = entry?.serves || [];
  paramsPanel.querySelectorAll('.catalog-serves').forEach((n) => n.remove());
  if (!list.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'catalog-serves';
  const items = list
    .map((s) => `<span class="catalog-serves-chip">${escapeHtml(s)}</span>`)
    .join('');
  wrap.innerHTML = `<details open>
    <summary>Útil para</summary>
    <div class="catalog-serves-list">${items}</div>
  </details>`;
  paramsPanel.appendChild(wrap);
}

/* ============================================
   Historial del navegador (checkpoints web)
   Menú ↔ módulo: Atrás / Adelante del browser
   URL: #/  |  #/m/<catalogId>
   ============================================ */
/** true mientras se aplica un popstate (no reescribir history). */
let _historySilent = false;

function parseAppRoute() {
  const raw = String(location.hash || '')
    .replace(/^#/, '')
    .replace(/^\//, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  let mode = null;
  if (qs) {
    const m = qs.match(/[?&]mode=([^&]+)/);
    if (m) {
      try {
        mode = decodeURIComponent(m[1]);
      } catch {
        mode = m[1];
      }
    }
  }
  if ((parts[0] === 'm' || parts[0] === 'sim') && parts[1]) {
    try {
      return { view: 'sim', catalogId: decodeURIComponent(parts[1]), mode };
    } catch {
      return { view: 'sim', catalogId: parts[1], mode };
    }
  }
  return { view: 'catalog', catalogId: null, mode: null };
}

function appRouteUrl(view, catalogId, mode = null) {
  if (view === 'sim' && catalogId) {
    const base = `#/m/${encodeURIComponent(catalogId)}`;
    return mode ? `${base}?mode=${encodeURIComponent(mode)}` : base;
  }
  return '#/';
}

/**
 * @param {'catalog'|'sim'} view
 * @param {string|null} catalogId
 * @param {'push'|'replace'|'none'} mode
 * @param {string|null} [routeMode] - Modo interno del módulo (enlace profundo).
 */
function syncBrowserHistory(view, catalogId, mode = 'replace', routeMode = null) {
  if (_historySilent || mode === 'none') return;
  if (typeof history === 'undefined' || !history.pushState) return;
  const histState = {
    fisicahn: 1,
    view,
    catalogId: view === 'sim' ? catalogId || null : null,
    mode: view === 'sim' ? routeMode || null : null
  };
  const url = appRouteUrl(view, catalogId, routeMode);
  try {
    if (mode === 'push') history.pushState(histState, '', url);
    else history.replaceState(histState, '', url);
  } catch {
    /* ignore (file://, etc.) */
  }
}

/** Vuelve al menú: preferir history.back() si el checkpoint actual es un módulo. */
function goToCatalog() {
  const st = typeof history !== 'undefined' ? history.state : null;
  if (st?.fisicahn && st.view === 'sim') {
    try {
      history.back();
      return;
    } catch {
      /* fall through */
    }
  }
  showCatalog({ history: 'replace' });
}

function showCatalog(opts = {}) {
  const historyMode = opts.history ?? 'replace';
  state.view = 'catalog';
  catalogView.hidden = false;
  simShell.hidden = true;
  document.body.classList.add('view-catalog');
  document.body.classList.remove('view-sim');
  setMobileParamsExpanded(false);
  // Cortar el bucle RAF por completo (cero CPU en el menú)
  try {
    engine?.stop?.();
  } catch {
    /* ignore */
  }
  updatePlayPauseUI();
  renderCatalogGrids();
  bindCatalogCardClicks();
  saveProgress();
  syncBrowserHistory('catalog', null, historyMode);
}

function showSimShell() {
  state.view = 'sim';
  catalogView.hidden = true;
  simShell.hidden = false;
  document.body.classList.add('view-sim');
  document.body.classList.remove('view-catalog');
  setMobileParamsExpanded(false);
  bindMobileSimBar();
  // Tras mostrar el lab, el canvas pasa a tener tamaño real → redimensionar buffer
  requestAnimationFrame(() => {
    engine?.resizeCanvas?.();
    engine?.requestPaint?.();
    // Segundo frame: layouts flex en tablets a veces resuelven altura un tick después
    requestAnimationFrame(() => engine?.resizeCanvas?.());
  });
}

/** Barra lateral: cabecera fija (logo / todos / trabajos) + lista de módulos con scroll (PC). */
function fillSidebarUnified() {
  if (!sidebarNav) return;
  sidebarNav.innerHTML = '';

  // Mis trabajos en la cabecera fija (no se mueve al hacer scroll de módulos)
  const worksHost = document.getElementById('sidebarWorksHost');
  if (worksHost) {
    worksHost.innerHTML = '';
    const worksBtn = document.createElement('button');
    worksBtn.type = 'button';
    worksBtn.className = 'module-btn module-btn-works';
    worksBtn.dataset.catalogId = WORKS_MODULE.id;
    worksBtn.innerHTML = `<span>${escapeHtml(WORKS_MODULE.title)}</span>`;
    worksBtn.addEventListener('click', () => openWorksModal({ filter: 'all', hub: true }));
    worksHost.appendChild(worksBtn);
  }

  // Agrupar por categoría; solo la sección del módulo activo queda expandida.
  const groups = new Map();
  for (const mod of getSimulationCatalog()) {
    const catId = mod.category;
    if (!groups.has(catId)) groups.set(catId, []);
    groups.get(catId).push(mod);
  }
  for (const [catId, mods] of groups) {
    const cat = getCategory(catId);
    const activeHere = mods.some((m) => m.id === state.catalogId);
    const group = document.createElement('section');
    group.className = 'sidebar-group';
    group.setAttribute('data-category', catId);
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'sidebar-group-head';
    head.setAttribute('aria-expanded', String(activeHere));
    head.innerHTML = `
      <span class="sidebar-group-chevron" aria-hidden="true">${activeHere ? '▾' : '▸'}</span>
      ${cat?.glyph ? `<span class="sidebar-group-glyph" aria-hidden="true">${escapeHtml(cat.glyph)}</span>` : ''}
      <span class="sidebar-group-title">${escapeHtml(cat?.keyword || cat?.label || catId)}</span>
    `;
    const body = document.createElement('div');
    body.className = 'sidebar-group-body';
    if (!activeHere) group.classList.add('collapsed');
    for (const mod of mods) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'module-btn';
      btn.dataset.catalogId = mod.id;
      if (mod.id === state.catalogId) btn.classList.add('active');
      btn.innerHTML = `<span>${escapeHtml(mod.title)}</span>`;
      btn.addEventListener('click', () => openCatalogModule(mod.id));
      body.appendChild(btn);
    }
    head.addEventListener('click', () => {
      const collapsed = group.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', String(!collapsed));
      head.querySelector('.sidebar-group-chevron').textContent = collapsed ? '▸' : '▾';
    });
    group.appendChild(head);
    group.appendChild(body);
    sidebarNav.appendChild(group);
  }
}

/**
 * Entra a un módulo del catálogo (carga motor real o placeholder).
 * “Mis trabajos” abre el gestor sin salir del menú principal.
 * @param {string} catalogId
 * @param {{ history?: 'push'|'replace'|'none', mode?: string|null }} [opts]
 *   `mode`: id de un `modes[]` del catálogo → enlace profundo del buscador (§4.4).
 */
async function openCatalogModule(catalogId, opts = {}) {
  const entry = getById(catalogId);
  if (!entry) return;

  // Hub Mis trabajos: import/export + evaluación + código examen online
  if (entry.special === 'works' || catalogId === WORKS_MODULE.id) {
    openWorksModal({
      hub: true,
      filter: 'all',
      onChanged: () => {
        renderCatalogGrids();
        refreshWorksList();
      }
    });
    return;
  }

  // Modo interno pedido por enlace profundo; se valida contra el catálogo.
  let initialMode = null;
  if (opts.mode) {
    const mode = (entry.modes || []).find((md) => md.id === opts.mode);
    if (mode) initialMode = mode;
  }

  const prevView = state.view;
  const prevId = state.catalogId;
  // Menú → módulo: push (checkpoint). Módulo → módulo: replace (Atrás = menú).
  let historyMode = opts.history;
  if (!historyMode) {
    if (prevView === 'catalog') historyMode = 'push';
    else if (prevView === 'sim' && prevId && prevId !== catalogId) historyMode = 'replace';
    else historyMode = 'replace';
  }

  state.catalogId = catalogId;
  state.catalogLevel = entry.level || 'all';
  showSimShell();
  fillSidebarUnified();

  if (!ensureEngine()) {
    alert('No se pudo iniciar el motor de simulación. Recarga la página (Ctrl+Shift+R).');
    showCatalog({ history: 'replace' });
    return;
  }

  // Precarga KaTeX en paralelo con el módulo (fórmulas/params)
  ensureKatex().catch(() => {});

  const engineKey = entry.engineKey || 'placeholder';
  await loadEngineModule(engineKey, entry, initialMode);
  // Ficha del módulo: «Útil para» (serves[]) al pie del panel de parámetros (§4.3).
  appendCatalogServes(entry);
  saveProgress();
  syncBrowserHistory('sim', catalogId, historyMode, initialMode?.id || null);
}

/* ============================================
   Carga de motor
   ============================================ */

async function destroyCurrentEngine() {
  const key = state.currentModule;
  // Un módulo legacy pudo dejar una escritura de datos pendiente en el throttle
  // de §3.1: descartarla para que no salpique el panel del módulo siguiente.
  legacyUi.setData.clear?.();
  if (comparison) {
    comparison.destroy();
    comparison = null;
  }
  if (unbindParams) {
    unbindParams();
    unbindParams = null;
  }
  interaction?.setTarget(null);
  if (key && state.moduleInstances[key]) {
    try {
      state.moduleInstances[key].destroy?.();
    } catch (e) {
      console.warn(`Error al destruir módulo ${key}:`, e);
    }
    delete state.moduleInstances[key];
  }
}

/**
 * @param {string} engineKey
 * @param {object|null} catalogEntry
 * @param {{ id: string, param: string, value: * }|null} [initialMode] — modo
 *   interno del catálogo para enlaces profundos (#/m/<id>?mode=…).
 */
async function loadEngineModule(engineKey, catalogEntry = null, initialMode = null) {
  await destroyCurrentEngine();

  const path = ENGINE_PATHS[engineKey] || ENGINE_PATHS.placeholder;
  const usePlaceholder = !ENGINE_PATHS[engineKey] || engineKey === 'placeholder' || !catalogEntry?.engineKey;

  const resolvedKey = usePlaceholder ? 'placeholder' : engineKey;
  state.currentModule = resolvedKey;

  const title = engineTitle(resolvedKey, catalogEntry);
  moduleTitle.textContent = title;

  document.querySelectorAll('.module-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.catalogId === state.catalogId);
  });

  paramsPanel.innerHTML = '<p class="placeholder-text">Cargando módulo...</p>';
  chartSvg.innerHTML =
    '<text x="150" y="90" text-anchor="middle" fill="var(--text-secondary)" font-size="11">Cargando...</text>';

  try {
    const mod = await import(path);
    const ctx = { engine, renderer, scene, ui, canvas, camera };
    const instance = createModuleInstance(mod, ctx);
    state.moduleInstances[resolvedKey] = instance;
    state.currentModuleNamespace = mod;
    engine?.reset?.();
    // Encuadre declarado por el módulo (`static viewport`), en vez del 20×15
    // global que la app imponía a los 27 motores (§2.2).
    const vp = mod?.default?.viewport || instance.viewport || null;
    camera?.setWorldSize(vp?.width || 20, vp?.height || 15);
    renderer?.resetCamera?.();
    renderer?.clearOverlays?.();
    layers?.invalidateAll();
    measureState.clear();
    // La pizarra necesita el puntero para dibujar: sin zoom ni pan encima.
    interaction?.setEnabled(resolvedKey !== 'whiteboard');
    interaction?.setTarget(instance);
    ui.showCharts(false);
    const meta =
      resolvedKey === 'placeholder'
        ? { title, blurb: catalogEntry?.blurb || '' }
        : catalogEntry || null;
    try {
      if (instance.isSimModule) {
        // Nuevo contrato: el módulo guarda su propio estado/contexto en el ctor.
        instance.init(meta);
        // Panel declarativo: la app lo construye y lo enlaza (§2.7).
        mountDeclarativeParams(mod, instance);
      } else {
        // Módulo legacy: el adaptador reenvía a las functions sueltas originales.
        // La UI lleva `setData` throttleado (§3.1): escriben HTML a 60–300 Hz.
        instance.init(engine, renderer, legacyUi, meta);
      }
    } catch (err) {
      console.error(`Error en init de ${resolvedKey}:`, err);
      showModuleBroken(title);
    }
    updateViewControlsUI();
    // Enlace profundo a un modo interno del catálogo (§4.4): aplicar el parámetro.
    if (initialMode && instance && instance.params && initialMode.param) {
      try {
        instance.params[initialMode.param] = initialMode.value;
        instance.reset?.();
        engine?.reset?.();
        const schema = mod?.default?.params;
        if (Array.isArray(schema) && schema.length) {
          syncSchema(paramsPanel, schema, instance.params);
        }
      } catch (err) {
        console.error('Error al aplicar el modo inicial:', err);
      }
    }
    // Retos en barra inferior (solo motores con casos de uso o pack de examen)
    await setupChallengesForEngine(resolvedKey).catch(() => ui.setChallenges(null));
    // Activar panel de gráficas solo si el módulo lo pide
    if (instance.useCharts === true) ui.showCharts(true);
    // Arrancar loop (pizarra sin pausa/velocidad: el dibujo depende del RAF)
    if (engine && !engine.isRunning?.()) engine.start();
    ensureRunning();
    updateTransportControlsForModule(resolvedKey);
  } catch (err) {
    console.error(`Error cargando motor ${resolvedKey}:`, err);
    showModuleBroken(title);
  }
}

/**
 * Construye y enlaza el panel a partir de `static params` (§2.7).
 *
 * Sustituye al `renderParams()` escrito a mano en cada módulo y al
 * `setTimeout(…, 0)` que hacía falta para enlazar los controles después de que
 * la app inyectara el HTML: aquí los nodos ya existen cuando se enlazan.
 *
 * @param {object} mod - Namespace del módulo.
 * @param {object} instance
 */
function mountDeclarativeParams(mod, instance) {
  const schema = mod?.default?.params;
  if (!schema || !Array.isArray(schema) || !schema.length) return;

  if (!instance.params) instance.params = defaultValues(schema);
  ui.setParams(renderSchemaHtml(schema, instance.params));

  if (unbindParams) unbindParams();
  unbindParams = bindSchema(paramsPanel, schema, instance.params, (id, value) => {
    try {
      // Un cambio de parámetro devuelve la simulación a su estado inicial: es
      // lo que hacían los 27 módulos a mano tras cada slider.
      instance.reset?.();
      engine?.reset?.();
    } catch (err) {
      console.error('Error al aplicar un parámetro:', err);
    }
    comparison?.syncParam(id, value, 'a');
    engine?.requestPaint?.();
  });
}

/**
 * Vuelca `readout()` en la pestaña Datos con su propia cadencia (~10 Hz).
 *
 * Los módulos migrados devuelven números en vez de HTML, así que la
 * presentación es responsabilidad del anfitrión — y la comparación de §2.9
 * puede restar dos lecturas en lugar de comparar cadenas.
 */
function pumpReadout(instance) {
  // Regla (§3.1): el anfitrión se hace cargo del panel Datos **cuando el módulo
  // sobreescribe `readout()`**. Ese es el pacto: si el módulo devuelve números,
  // él ya no escribe HTML y el host presenta; los módulos legacy que aún llaman
  // `ui.setData` se quedan con su propio panel (throttleado). No hace falta
  // exigir `draw(scene)`: `kinematics` es `SimModule` con `render(ctx)` y
  // `readout()` numérico, y el host lo presenta igual.
  if (!implementsMethod(instance, 'readout')) return;
  const now = performance.now();
  if (now - _lastReadoutAt < READOUT_MIN_MS) return;
  _lastReadoutAt = now;

  let data;
  try {
    data = instance.readout();
  } catch (err) {
    console.error('Error en readout del módulo:', err);
    return;
  }
  const rows = Object.entries(data || {});
  if (!rows.length) return;

  if (comparison?.active) {
    ui.setData(comparison.readoutTable());
    return;
  }
  ui.setData(
    `<div class="readout-grid">${rows
      .map(
        ([k, v]) =>
          `<div class="readout-row"><span class="readout-key">${escapeHtml(k)}</span><span class="readout-val">${escapeHtml(
            String(v?.value ?? '—')
          )}</span><span class="readout-unit">${escapeHtml(v?.unit || '')}</span></div>`
      )
      .join('')}</div>`
  );
}

/**
 * Activa o desactiva la comparación lado a lado (§2.9).
 *
 * Sólo está disponible en módulos migrados a `SimModule`: un namespace legacy
 * comparte estado entre «instancias» y daría dos vistas idénticas, que es peor
 * que no ofrecer la función.
 */
function toggleComparison() {
  if (comparison) {
    comparison.destroy();
    comparison = null;
    interaction?.setTarget(state.moduleInstances[state.currentModule]);
    updateViewControlsUI();
    engine?.requestPaint?.();
    return;
  }
  const mod = state.currentModuleNamespace;
  if (!ComparisonController.supports(mod)) {
    ui.showTab('info');
    ui.setInfo(
      'La comparación lado a lado necesita un módulo migrado al contrato nuevo. ' +
        'Pruébala en <strong>Cantidad de movimiento</strong>.'
    );
    return;
  }
  comparison = new ComparisonController({
    mod,
    camera,
    scene,
    canvas,
    hostCtx: { engine, renderer, ui, canvas, camera },
    labels: ['A', 'B'],
    onChange: () => engine?.requestPaint?.()
  });
  const entry = state.catalogId ? getById(state.catalogId) : null;
  if (!comparison.start(entry)) {
    comparison = null;
    return;
  }
  // El panel manda sobre el lado A; B copia salvo la variable independiente.
  const inst = state.moduleInstances[state.currentModule];
  if (inst?.params && comparison.a?.params) Object.assign(comparison.a.params, inst.params);
  interaction?.setTarget(comparison.a);
  ui.showTab('data');
  updateViewControlsUI();
  engine?.requestPaint?.();
}

/** Sincroniza el estado visual de los controles de vista con el modelo. */
function updateViewControlsUI() {
  const zoomLabel = document.getElementById('zoomLabel');
  if (zoomLabel && camera) zoomLabel.textContent = `${Math.round(camera.zoom * 100)}%`;
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.title = `Tema del lienzo: ${THEMES[getThemeName()]?.label || getThemeName()} (T)`;
    themeBtn.dataset.theme = getThemeName();
  }
  const compareBtn = document.getElementById('compareBtn');
  if (compareBtn) {
    const supported = ComparisonController.supports(state.currentModuleNamespace);
    compareBtn.classList.toggle('active', !!comparison?.active);
    compareBtn.disabled = !supported && !comparison;
    compareBtn.title = supported
      ? 'Comparación lado a lado (C)'
      : 'Comparación no disponible en este módulo todavía';
  }
}

/** Pantalla de error degradada en lugar de congelar la app (contrato §1.2). */
function showModuleBroken(title) {
  if (paramsPanel) {
    paramsPanel.innerHTML = `<p class="placeholder-text" style="color: var(--danger)">Error al cargar ${escapeHtml(
      title
    )}. Verifica la consola.</p>
      <button type="button" class="ctrl-btn" style="margin-top: 8px" data-reload-module>
        Reintentar módulo
      </button>`;
    paramsPanel.querySelector('[data-reload-module]')?.addEventListener('click', () => {
      if (state.catalogId && getById(state.catalogId)) {
        openCatalogModule(state.catalogId, { history: 'none' });
      }
    });
  }
  try {
    engine?.pause?.(true);
  } catch {
    /* ignore */
  }
  if (simStatus) {
    simStatus.textContent = 'Error del módulo';
    delete simStatus.dataset.t;
  }
}

function ensureRunning() {
  if (!engine) return;
  if (!engine.isRunning?.()) engine.start();
  engine.pause(false);
  updatePlayPauseUI();
}

/** true si el módulo actual es la pizarra (sin simulación temporal). */
function isWhiteboardModule(key = state.currentModule) {
  return key === 'whiteboard';
}

/**
 * En pizarra se ocultan velocidad, pausa y paso (no aplican al dibujo).
 * En el resto de módulos se muestran de nuevo.
 */
function updateTransportControlsForModule(key = state.currentModule) {
  const hide = isWhiteboardModule(key);
  const transport = document.getElementById('simTransportControls');
  if (transport) transport.hidden = hide;
  const mobilePlay = document.getElementById('mobilePlayBtn');
  if (mobilePlay) mobilePlay.hidden = hide;
  if (hide && simStatus) {
    simStatus.textContent = 'Pizarra';
    delete simStatus.dataset.t;
  }
  if (!hide) updatePlayPauseUI();
}

/* ============================================
   Persistencia
   ============================================ */

function saveProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    data.lastCatalogId = state.catalogId;
    data.lastLevel = state.catalogLevel;
    data.lastView = state.view;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

/* ============================================
   Controles
   ============================================ */

function togglePause() {
  if (isWhiteboardModule()) return;
  engine?.pause?.();
  updatePlayPauseUI();
}

function updatePlayPauseUI() {
  const paused = engine?.isPaused?.() ?? true;
  if (playPauseLabel) playPauseLabel.textContent = paused ? 'Reproducir' : 'Pausa';
  if (simStatus) simStatus.textContent = paused ? 'Pausado' : 'En ejecución';
  const mobilePlay = document.getElementById('mobilePlayBtn');
  if (mobilePlay) mobilePlay.textContent = paused ? 'Reproducir' : 'Pausa';
  const icon = playPauseBtn?.querySelector('svg');
  if (!icon) return;
  if (paused) {
    icon.innerHTML = '<polygon points="6 4 20 12 6 20"/>';
  } else {
    icon.innerHTML =
      '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
  }
}

function setMobileParamsExpanded(open) {
  const params = document.getElementById('mobileParamsBtn');
  document.body.classList.toggle('mobile-params-expanded', open);
  if (params) {
    params.textContent = open ? 'Cerrar params' : 'Parámetros';
    params.classList.toggle('primary', !!open);
  }
  let scrim = document.getElementById('mobileParamsScrim');
  if (open) {
    if (!scrim) {
      scrim = document.createElement('button');
      scrim.type = 'button';
      scrim.id = 'mobileParamsScrim';
      scrim.className = 'mobile-params-scrim';
      scrim.setAttribute('aria-label', 'Cerrar panel de parámetros');
      scrim.addEventListener('click', () => setMobileParamsExpanded(false));
      document.body.appendChild(scrim);
    }
    scrim.hidden = false;
  } else if (scrim) {
    scrim.hidden = true;
  }
  requestAnimationFrame(() => engine?.resizeCanvas?.());
}

function bindMobileSimBar() {
  const play = document.getElementById('mobilePlayBtn');
  const params = document.getElementById('mobileParamsBtn');
  const reset = document.getElementById('mobileResetBtn');
  if (play && play.dataset.bound !== '1') {
    play.dataset.bound = '1';
    play.addEventListener('click', () => togglePause());
  }
  if (params && params.dataset.bound !== '1') {
    params.dataset.bound = '1';
    params.addEventListener('click', () => {
      const open = !document.body.classList.contains('mobile-params-expanded');
      setMobileParamsExpanded(open);
    });
  }
  if (reset && reset.dataset.bound !== '1') {
    reset.dataset.bound = '1';
    reset.addEventListener('click', () => resetBtn?.click());
  }
}

speedSlider?.addEventListener('input', () => {
  if (isWhiteboardModule()) return;
  const val = parseFloat(speedSlider.value);
  if (speedDisplay) speedDisplay.textContent = val.toFixed(1) + '×';
  engine?.setSpeed?.(val);
});

playPauseBtn?.addEventListener('click', togglePause);

resetBtn?.addEventListener('click', () => {
  engine?.reset?.();
  if (comparison?.active) {
    comparison.reset();
    engine?.requestPaint?.();
    return;
  }
  const inst = state.moduleInstances[state.currentModule];
  if (inst && typeof inst.reset === 'function') {
    inst.reset(engine, renderer, ui);
  }
});

/* ============================================
   Controles de vista (§2.2, §2.5, §2.8, §2.9)
   ============================================ */

document.getElementById('zoomInBtn')?.addEventListener('click', () => {
  camera?.zoomBy(1.25);
  updateViewControlsUI();
  engine?.requestPaint?.();
});

document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
  camera?.zoomBy(1 / 1.25);
  updateViewControlsUI();
  engine?.requestPaint?.();
});

document.getElementById('resetViewBtn')?.addEventListener('click', () => {
  camera?.reset();
  updateViewControlsUI();
  engine?.requestPaint?.();
});

document.getElementById('themeBtn')?.addEventListener('click', () => {
  cycleTheme();
});

document.getElementById('projectorBtn')?.addEventListener('click', () => {
  toggleProjector();
});

document.getElementById('exportPngBtn')?.addEventListener('click', () => {
  if (!canvas) return;
  exportPng(canvas, moduleTitle?.textContent || 'simulacion');
});

document.getElementById('exportSvgBtn')?.addEventListener('click', () => {
  const inst = comparison?.a || state.moduleInstances[state.currentModule];
  const size = renderer?.cssSize?.() || { w: 800, h: 600 };
  const ok = exportSvg({
    instance: implementsMethod(inst, 'draw') ? inst : null,
    scene,
    camera,
    size,
    name: moduleTitle?.textContent || 'simulacion',
    drawBackground: null
  });
  if (!ok) {
    ui.showTab('info');
    ui.setInfo(
      'La exportación a SVG necesita un módulo migrado al dibujo declarativo. ' +
        'Usa <strong>Exportar PNG</strong> mientras tanto.'
    );
  }
});

document.getElementById('compareBtn')?.addEventListener('click', toggleComparison);

stepBtn?.addEventListener('click', () => {
  if (!engine || isWhiteboardModule()) return;
  if (!engine.isPaused()) engine.pause();
  engine.step();
  // Un frame de render con el estado nuevo
  if (typeof engine.requestPaint === 'function') engine.requestPaint();
  else if (engine.onRender) engine.onRender(engine.ctx, 0, engine.getElapsed());
  updatePlayPauseUI();
});

document.getElementById('fullscreenBtn')?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.body.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

document.getElementById('settingsBtn')?.addEventListener('click', () => {
  toggleSettingsPanel();
});

/* ============================================
   Ajustes de rendimiento (§3.3)
   ============================================ */

const SETTINGS_KEY = 'fisicahn_settings';

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSettings(patch) {
  const cur = loadSettings();
  const next = { ...cur, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function applySettingsToEngine() {
  const s = loadSettings();
  engine?.setBatterySave?.(s.batterySave !== false);
  engine?.setFpsLimit?.(s.fps30 === true ? 30 : 60);
}

function toggleSettingsPanel() {
  let panel = document.getElementById('perfSettingsDock');
  if (panel) {
    panel.remove();
    return;
  }
  const s = loadSettings();
  panel = document.createElement('div');
  panel.id = 'perfSettingsDock';
  panel.className = 'stopwatch-dock';
  panel.innerHTML = `
    <strong>Rendimiento y energía</strong>
    <label class="settings-check">
      <input type="checkbox" id="setBattery" ${s.batterySave !== false ? 'checked' : ''}>
      Ahorro de batería (pausar si el lienzo sale de pantalla)
    </label>
    <label class="settings-check">
      <input type="checkbox" id="setFps30" ${s.fps30 === true ? 'checked' : ''}>
      Modo 30 FPS (equipos de gama baja)
    </label>
    <p class="settings-note">Ambos se guardan en este equipo y se aplican en la próxima simulación abierta.</p>
  `;
  document.querySelector('.right-panel')?.prepend(panel);
  const apply = () => applySettingsToEngine();
  panel.querySelector('#setBattery')?.addEventListener('change', (e) => {
    saveSettings({ batterySave: e.target.checked });
    apply();
  });
  panel.querySelector('#setFps30')?.addEventListener('change', (e) => {
    saveSettings({ fps30: e.target.checked });
    apply();
  });
}

catalogBackBtn?.addEventListener('click', () => {
  goToCatalog();
});

bottomTabs.forEach((btn) => {
  btn.addEventListener('click', () => ui.showTab(btn.dataset.tab));
});

toolBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool || 'pointer';
    if (tool === 'unbounded') {
      const inst = state.moduleInstances[state.currentModule];
      if (inst && typeof inst.setUnbounded === 'function') {
        inst.setUnbounded(!inst.getUnbounded?.());
      } else if (inst && typeof inst.setTool === 'function') {
        inst.setTool('unbounded');
      }
      return;
    }
    if (tool === 'stopwatch') {
      toggleStopwatchPanel();
      return;
    }
    if (tool === 'erase') {
      measureState.clear();
      renderer.clearOverlays();
      engine?.requestPaint?.();
      return;
    }

    toolBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    measureState.setTool(tool);
    // La capa de interacción necesita saber si el puntero es para medir o
    // para manipular objetos: son gestos incompatibles sobre el mismo clic.
    interaction?.setTool(tool);

    const inst = state.moduleInstances[state.currentModule];
    if (inst && typeof inst.setTool === 'function') {
      inst.setTool(tool);
    }
  });
});

canvas?.addEventListener('pointerdown', (e) => {
  if (state.view !== 'sim' || !renderer) return;
  if (state.currentModule === 'whiteboard') return;
  if (measureState.tool === 'pointer') return; // manipulación directa: §2.6
  const world = renderer.getMousePos(e);
  if (measureState.handleClick(world) && measureState.tool === 'probe') {
    ui.setData(
      `<div style="font-family:var(--font-mono)">Sonda: x=${world.x.toFixed(3)} m, y=${world.y.toFixed(3)} m</div>`
    );
  }
  engine?.requestPaint?.();
});

function toggleStopwatchPanel() {
  let panel = document.getElementById('stopwatchDock');
  if (panel) {
    panel.remove();
    return;
  }
  panel = document.createElement('div');
  panel.id = 'stopwatchDock';
  panel.className = 'stopwatch-dock';
  panel.innerHTML = `
    <strong>Cronómetro</strong>
    <div id="swDisplay" class="sw-display">0.00 s</div>
    <div class="btn-row">
      <button type="button" class="ctrl-btn primary" id="swStart">Iniciar</button>
      <button type="button" class="ctrl-btn" id="swReset">Reiniciar</button>
    </div>
  `;
  document.querySelector('.right-panel')?.prepend(panel);
  let running = false;
  let start = 0;
  let elapsed = 0;
  let raf = 0;
  const display = panel.querySelector('#swDisplay');
  const tick = () => {
    if (!running) return;
    elapsed = performance.now() - start;
    display.textContent = (elapsed / 1000).toFixed(2) + ' s';
    raf = requestAnimationFrame(tick);
  };
  panel.querySelector('#swStart').addEventListener('click', (ev) => {
    const b = ev.currentTarget;
    if (!running) {
      running = true;
      start = performance.now() - elapsed;
      b.textContent = 'Pausar';
      tick();
    } else {
      running = false;
      cancelAnimationFrame(raf);
      b.textContent = 'Iniciar';
    }
  });
  panel.querySelector('#swReset').addEventListener('click', () => {
    running = false;
    cancelAnimationFrame(raf);
    elapsed = 0;
    display.textContent = '0.00 s';
    panel.querySelector('#swStart').textContent = 'Iniciar';
  });
}

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (state.view === 'catalog') {
    return;
  }

  switch (e.code) {
    case 'Space':
      if (isWhiteboardModule()) return;
      e.preventDefault();
      togglePause();
      break;
    case 'KeyR':
      e.preventDefault();
      resetBtn.click();
      break;
    case 'Escape':
      e.preventDefault();
      goToCatalog();
      break;
    case 'KeyI': {
      const inst = state.moduleInstances[state.currentModule];
      if (inst?.setUnbounded) {
        e.preventDefault();
        inst.setUnbounded(!(inst.getUnbounded?.() ?? false));
      }
      break;
    }
    // Atajos de la WAVE 2: la cámara y el tema se manejan sin soltar el ratón.
    case 'Equal':
    case 'NumpadAdd':
      e.preventDefault();
      camera?.zoomBy(1.25);
      updateViewControlsUI();
      engine?.requestPaint?.();
      break;
    case 'Minus':
    case 'NumpadSubtract':
      e.preventDefault();
      camera?.zoomBy(1 / 1.25);
      updateViewControlsUI();
      engine?.requestPaint?.();
      break;
    case 'Digit0':
    case 'Numpad0':
      e.preventDefault();
      camera?.reset();
      updateViewControlsUI();
      engine?.requestPaint?.();
      break;
    case 'KeyT':
      e.preventDefault();
      cycleTheme();
      break;
    case 'KeyP':
      // Modo proyector: el atajo importa porque se usa de pie, ante la clase.
      e.preventDefault();
      toggleProjector();
      break;
    case 'KeyC':
      e.preventDefault();
      toggleComparison();
      break;
  }
});

/* ============================================
   Loop
   ============================================ */

function onEngineUpdate(dt) {
  if (state.view !== 'sim') return;
  const inst = state.moduleInstances[state.currentModule];

  if (comparison?.active) {
    // Ambos lados avanzan con el mismo paso: si no, la comparación mentiría.
    comparison.update(dt);
    pumpReadout(comparison.a);
    return;
  }

  try {
    if (inst && typeof inst.update === 'function') inst.update(dt);
  } catch (err) {
    // Un error en update() no debe romper el bucle RAF (§1.2).
    console.error('Error en update del módulo:', err);
    attemptRecoverLoop();
    return;
  }
  pumpReadout(inst);
  // Gráficas SVG a ~10 Hz (no a 60 fps) — reduce layout/innerHTML
  try {
    if (inst && inst.useCharts === true && typeof inst.getCharts === 'function') {
      const now = performance.now();
      if (now - _lastChartAt >= CHART_MIN_MS) {
        _lastChartAt = now;
        const charts = inst.getCharts();
        if (charts != null) applyModuleCharts(charts);
      }
    }
  } catch {
    /* no bloquear el loop */
  }
}

/**
 * Al degradar por error del módulo: pausa el bucle para evitar un RAF infinito
 * con excepciones y avisa en la barra de estado.
 */
function attemptRecoverLoop() {
  try {
    engine?.pause?.(true);
  } catch {
    /* ignore */
  }
  if (simStatus && isWhiteboardModule() === false) {
    simStatus.textContent = 'Pausado (error en la sim)';
    delete simStatus.dataset.t;
  }
  updatePlayPauseUI();
}

/** Acepta string SVG o { series: [{label, points:[{x,y}]}] } */
function applyModuleCharts(charts) {
  if (typeof charts === 'string') {
    ui.setChart(charts, { show: true });
    return;
  }
  if (!charts || !Array.isArray(charts.series)) return;
  const W = 300;
  const H = 180;
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of charts.series) {
    for (const p of s.points || []) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 1;
    minY = 0;
    maxY = 1;
  }
  if (maxX === minX) maxX = minX + 1;
  if (maxY === minY) maxY = minY + 1;
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const sx = (x) => pad.l + ((x - minX) / (maxX - minX)) * pw;
  const sy = (y) => pad.t + ph - ((y - minY) / (maxY - minY)) * ph;
  const colors = ['#4fc3f7', '#66bb6a', '#ffb74d', '#ef5350'];
  let paths = '';
  charts.series.forEach((s, i) => {
    const pts = s.points || [];
    if (pts.length < 2) return;
    const d = pts.map((p, j) => `${j ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    paths += `<path d="${d}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="2"/>`;
  });
  const title = charts.title
    ? `<text x="${W / 2}" y="12" text-anchor="middle" fill="var(--text-secondary)" font-size="10">${escapeHtml(
        charts.title
      )}</text>`
    : '';
  ui.setChart(
    `${title}<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ph}" stroke="var(--border-color)"/><line x1="${pad.l}" y1="${pad.t + ph}" x2="${pad.l + pw}" y2="${pad.t + ph}" stroke="var(--border-color)"/>${paths}`,
    { show: true }
  );
}

/**
 * Bucle de dibujo por capas (§2.1).
 *
 * Antes se borraba el lienzo entero y se redibujaba todo 60 veces por segundo,
 * incluida una rejilla estática de ~68 operaciones que casi nunca cambia. Ahora
 * el fondo vive en una capa fuera de pantalla y sólo se repinta cuando cambia
 * su firma: tamaño, cámara o tema.
 */
function onEngineRender(ctx, alpha, elapsed) {
  if (state.view !== 'sim' || !renderer || !engine) return;
  const theme = getTheme();
  // Sincronizar DPR y limpiar buffer completo (evita basura de color en Android)
  renderer.setDpr?.(engine._dpr || 1);
  engine.applyDprTransform?.();

  const { w: cssW, h: cssH } = renderer.cssSize();
  // La cámara interpola su seguimiento una vez por frame, no por subpaso.
  camera.update(engine.getDelta?.() ?? 1 / 60);
  layers.resize(cssW, cssH, engine._dpr || 1);
  layers.beginFrame(theme.bg);

  const inst = state.moduleInstances[state.currentModule];
  const skipGrid = inst && inst.skipWorldGrid === true;

  if (comparison?.active) {
    // Comparación: dos viewports sobre el mismo lienzo, un solo bucle RAF.
    scene.dt = engine.getDelta?.() ?? 1 / 60;
    scene.elapsed = elapsed;
    comparison.draw(ctx, cssW, cssH, skipGrid ? null : () => renderer.drawGrid({ spacing: 1 }));
    drawFpsAndStatus(elapsed);
    return;
  }

  if (!skipGrid) {
    // Firma de la capa: si no cambia, la rejilla no se vuelve a trazar.
    // `drawGridTo` es imprescindible aquí: sin él la rejilla iría al lienzo
    // visible y la capa cacheada quedaría vacía.
    const signature = `${camera.version}|${theme.name}|${cssW}x${cssH}`;
    layers.paint('background', signature, (bgCtx) => renderer.drawGridTo(bgCtx, { spacing: 1 }));
    engine.applyDprTransform?.();
  }

  // La escena declarativa comparte contexto con el render legacy: los módulos
  // migrados usan `draw(scene)` y el resto sigue con `render(ctx)`.
  scene.beginFrame(ctx, { theme, dt: engine.getDelta?.() ?? 1 / 60, elapsed, alpha });
  scene.beginHud(ctx);
  // `implementsMethod` y no `typeof`: `SimModule` define `draw` vacío, así que
  // un módulo migrado que aún dibuja con `render(ctx)` se quedaría en blanco.
  if (implementsMethod(inst, 'draw')) {
    try {
      inst.draw(scene);
    } catch (err) {
      console.error('Error en draw del módulo:', err);
      attemptRecoverLoop();
    }
  } else if (inst && typeof inst.render === 'function') {
    try {
      inst.render(ctx, alpha, elapsed);
    } catch (err) {
      console.error('Error en render del módulo:', err);
      attemptRecoverLoop();
    }
  }
  // Tras módulos que tocan setTransform (p. ej. pizarra), restaurar espacio CSS
  engine.applyDprTransform?.();
  if (measureState.active) measureState.draw(scene);
  scene.endFrame();
  renderer.drawOverlays();
  drawFpsAndStatus(elapsed);
}

/** Contador de FPS y reloj de simulación, ambos con su propia cadencia. */
function drawFpsAndStatus(elapsed) {
  if (fpsCounter) {
    const fps = engine.getFps();
    if (fps !== _lastFpsShown) {
      _lastFpsShown = fps;
      fpsCounter.textContent = `${fps} FPS`;
    }
  }
  if (isWhiteboardModule()) {
    if (simStatus && simStatus.textContent !== 'Pizarra') simStatus.textContent = 'Pizarra';
  } else if (!engine.isPaused() && simStatus) {
    // Actualizar reloj de sim a ~4 Hz vía resto entero
    const t = Math.floor(elapsed * 4);
    if (simStatus.dataset.t !== String(t)) {
      simStatus.dataset.t = String(t);
      simStatus.textContent = `En ejecución · ${elapsed.toFixed(1)}s`;
    }
  }
}

/* ============================================
   Init
   ============================================ */

function collectUiParams() {
  const out = {};
  document.querySelectorAll('#paramsPanel input[type="range"], #paramsPanel input.param-number').forEach((el) => {
    const id = (el.id || '').replace(/^(param_|num_)/, '');
    if (!id) return;
    const v = parseFloat(el.value);
    if (Number.isFinite(v)) out[id] = v;
  });
  document.querySelectorAll('#paramsPanel input[type="checkbox"]').forEach((el) => {
    const id = (el.id || '').replace(/^param_/, '');
    if (id) out[id] = el.checked;
  });
  return out;
}

function collectModuleSnapshot() {
  const inst = state.moduleInstances[state.currentModule];
  const snap = {
    catalogId: state.catalogId,
    engineKey: state.currentModule,
    simTime: engine?._elapsed ?? 0,
    paused: engine?.isPaused?.() ?? false,
    speed: engine?.getSpeed?.() ?? 1,
    tools: {
      tool: measureState.tool
    },
    uiParams: collectUiParams()
  };
  if (inst && typeof inst.getState === 'function') {
    try {
      const s = inst.getState();
      snap.moduleState = JSON.parse(
        JSON.stringify(s, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v))
      );
    } catch {
      snap.moduleState = null;
    }
  }
  return snap;
}

/** Modal HTML (prompt falla o no existe en Electron). */
function askWorkName(defaultName) {
  return new Promise((resolve) => {
    const prev = document.getElementById('saveWorkModal');
    if (prev) prev.remove();
    const overlay = document.createElement('div');
    overlay.id = 'saveWorkModal';
    overlay.className = 'session-gate';
    overlay.innerHTML = `
      <div class="session-gate-card" role="dialog" aria-labelledby="saveWorkTitle">
        <h2 id="saveWorkTitle">Guardar trabajo</h2>
        <p class="session-gate-lead">Se guardará el módulo, parámetros y herramientas actuales en la caché de este equipo${
          window.FisicaHNDesktop?.isDesktop ? ' (app de escritorio)' : ''
        }.</p>
        <label class="gate-label">Nombre del trabajo
          <input type="text" id="saveWorkName" maxlength="120" value="">
        </label>
        <p class="gate-error" id="saveWorkErr" hidden></p>
        <div class="gate-actions">
          <button type="button" class="gate-btn primary" id="saveWorkOk">Guardar</button>
          <button type="button" class="gate-btn secondary" id="saveWorkCancel">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#saveWorkName');
    if (input) input.value = defaultName;
    input?.focus();
    input?.select();
    const finish = (val) => {
      overlay.remove();
      resolve(val);
    };
    overlay.querySelector('#saveWorkCancel')?.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });
    const submit = () => {
      const name = String(input?.value || '').trim();
      const err = overlay.querySelector('#saveWorkErr');
      if (!name) {
        if (err) {
          err.textContent = 'Escribe un nombre.';
          err.hidden = false;
        }
        return;
      }
      finish(name);
    };
    overlay.querySelector('#saveWorkOk')?.addEventListener('click', submit);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  });
}

async function handleSaveWork() {
  let session = getSession();
  if (!session) {
    try {
      await ensureSessionGate();
    } catch {
      /* ignore */
    }
    session = getSession();
    if (!session) {
      alert('Inicia sesión (Alumno o Docente) para guardar en este equipo.');
      return;
    }
  }

  await initWorksStorage();

  const defaultName = `${state.catalogId || state.currentModule || 'modulo'}-${new Date()
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ')}`;
  const name = await askWorkName(defaultName);
  if (name == null) return;

  try {
    const entry = getById(state.catalogId);
    const work = await saveWork({
      name,
      moduleId: state.catalogId || state.currentModule || 'unknown',
      moduleTitle: entry?.title || moduleTitle?.textContent || state.currentModule,
      snapshot: collectModuleSnapshot(),
      notes:
        getSession()?.mode === 'exam'
          ? 'Modo examen'
          : window.FisicaHNDesktop?.isDesktop
            ? 'Guardado en app de escritorio'
            : ''
    });
    refreshWorksList();
    const total = listWorks().length;
    const where = window.FisicaHNDesktop?.isDesktop
      ? 'archivo de la app (userData) + caché local'
      : 'caché local de este navegador';
    const cloudNote = work.cloudSynced ? '\nTambién se envió a la nube.' : '';
    const weakNote = work.integrityWeak ? '\n(Aviso: sello de integridad débil.)' : '';
    alert(
      `Trabajo guardado: “${work.name}”\n` +
        `Total: ${total}\n` +
        `Queda en ${where}.${weakNote}${cloudNote}\n\n` +
        `Ábrelo desde Mis trabajos → Abrir en módulo.`
    );
  } catch (e) {
    console.error('Guardar trabajo:', e);
    alert(e?.message || String(e) || 'No se pudo guardar.');
  }
}

/**
 * Abre un trabajo guardado: carga el módulo y restaura parámetros / estado.
 * @param {string} workId
 */
export async function openWorkInModule(workId) {
  await initWorksStorage();
  const w = getWork(workId);
  if (!w) {
    alert('Trabajo no encontrado en la caché.');
    return;
  }
  const catalogId = w.snapshot?.catalogId || w.moduleId;
  const entry = getById(catalogId);
  if (!entry || entry.special === 'works') {
    alert(`No se puede abrir el módulo “${catalogId || '?'}”.`);
    return;
  }

  // Cerrar modal de trabajos
  const modal = document.getElementById('worksModal');
  if (modal) {
    modal.hidden = true;
    document.body.classList.remove('works-modal-open');
  }

  await openCatalogModule(catalogId);

  // Esperar un frame a que el módulo pinte params
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));

  const inst = state.moduleInstances[state.currentModule];
  const snap = w.snapshot || {};

  if (inst && typeof inst.setState === 'function' && snap.moduleState) {
    try {
      inst.setState(snap.moduleState);
    } catch (e) {
      console.warn('setState módulo', e);
    }
  } else if (snap.uiParams && typeof snap.uiParams === 'object') {
    // Fallback: aplicar sliders del panel
    for (const [id, val] of Object.entries(snap.uiParams)) {
      const range = document.getElementById(`param_${id}`);
      const num = document.getElementById(`num_${id}`);
      if (range && typeof val === 'number') {
        range.value = String(val);
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (num && typeof val === 'number') {
        num.value = String(val);
        num.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof val === 'boolean') {
        const cb = document.getElementById(`param_${id}`);
        if (cb && cb.type === 'checkbox') {
          cb.checked = val;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }

  if (snap.tools?.tool) {
    measureState.tool = snap.tools.tool;
    document.querySelectorAll('.tool-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === snap.tools.tool);
    });
  }
  if (!isWhiteboardModule() && typeof snap.speed === 'number' && speedSlider) {
    speedSlider.value = String(snap.speed);
    speedSlider.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Pizarra nunca se restaura en pausa (el dibujo no se vería)
  if (!isWhiteboardModule() && snap.paused && engine && !engine.isPaused()) {
    engine.pause(true);
    updatePlayPauseUI();
  }

  logAudit('work_open', { id: w.id, moduleId: catalogId });
}

// API global para el panel de trabajos
window.FisicaHNOpenWork = openWorkInModule;

function refreshWorksList() {
  // Lista de trabajos solo en el hub / barra lateral, no en panel derecho
  updateWorksCountBadges();
}

// Enlazar tarjetas del HTML estático en cuanto el módulo carga
try {
  bindCatalogCardClicks();
  renderCatalogGrids();
} catch (e) {
  console.error('Catálogo bootstrap:', e);
}

async function init() {
  // App de escritorio (Electron / NetSupport): ocultar enlaces web
  if (window.FisicaHNDesktop?.isDesktop) {
    document.documentElement.dataset.desktop = '1';
    document.body.classList.add('is-desktop');
  }

  // Mostrar catálogo YA (antes del gate) para que la app no quede en blanco
  try {
    showCatalog();
    renderCatalogGrids();
    bindCatalogCardClicks();
  } catch (e) {
    console.error('Catálogo inicial:', e);
  }

  // Indicador Wi‑Fi Online/Offline + Reconectar
  try {
    initNetworkStatusUI();
  } catch (e) {
    console.warn('Network UI:', e);
  }

  try {
    await initWorksStorage();
  } catch (e) {
    console.warn('Works storage:', e);
  }

  try {
    await ensureSessionGate();
  } catch (e) {
    console.warn('Session gate:', e);
  }
  try {
    bindUserMenu();
  } catch (e) {
    console.warn('User menu:', e);
    renderSessionBadge(document.getElementById('sessionBadgeHost'));
    renderUserChip(document.getElementById('userChipHost'));
  }

  try {
    initPanelResize({
      onResize: () => {
        try {
          engine?.resizeCanvas?.();
        } catch {
          /* ignore */
        }
      }
    });
  } catch (e) {
    console.warn('Panel resize:', e);
  }
  logAudit('app_start', {
    modules: CATALOG.length,
    desktop: !!window.FisicaHNDesktop?.isDesktop
  });

  bindWorksPanelControls({
    onChanged: () => {
      refreshWorksList();
      if (state.view === 'catalog') renderCatalogGrids();
    }
  });
  refreshWorksList();
  // Docente con examen activo: poll de trabajos aunque el modal esté cerrado
  ensureTeacherExamSync().catch(() => {});
  // Alumnos/docentes en examen en la nube: detectar cierre del docente en todos los dispositivos
  try {
    ensureExamLivenessPolling();
  } catch {
    /* ignore */
  }
  window.addEventListener('fisicahn:exam-ended', onExamEndedGlobal);
  window.addEventListener('fisicahn:session', () => {
    try {
      ensureExamLivenessPolling();
    } catch {
      /* ignore */
    }
  });

  document.getElementById('openWhiteboardBtn')?.addEventListener('click', () => {
    openCatalogModule('whiteboard');
  });
  document.getElementById('sidebarBrandBtn')?.addEventListener('click', () => {
    goToCatalog();
  });
  document.getElementById('saveWorkBtn')?.addEventListener('click', () => handleSaveWork());

  // Checkpoints del navegador: Atrás/Adelante entre menú y módulos
  window.addEventListener('popstate', onAppPopState);

  // Catálogo §4.2-§4.4: plegado de secciones, buscador y filtros por nivel
  loadCollapsed();
  bindCatalogSearch();
  bindCatalogSearchShortcut();
  bindCatalogLevelFilters();

  const saved = loadProgress();
  if (canvas && engine) {
    engine.start();
  } else {
    console.error('Canvas o motor no disponible');
  }

  // Ruta por hash (#/m/id) tiene prioridad; si no, última vista guardada
  const route = parseAppRoute();
  const resumeId = saved.lastCatalogId;
  const routeModule =
    route.view === 'sim' &&
    route.catalogId &&
    route.catalogId !== WORKS_MODULE.id &&
    getById(route.catalogId) &&
    getById(route.catalogId).special !== 'works'
      ? route.catalogId
      : null;
  const savedModule =
    !routeModule &&
    saved.lastView === 'sim' &&
    resumeId &&
    resumeId !== WORKS_MODULE.id &&
    getById(resumeId) &&
    getById(resumeId).special !== 'works'
      ? resumeId
      : null;

  if (routeModule) {
    try {
      await openCatalogModule(routeModule, { history: 'replace', mode: route.mode || null });
    } catch (e) {
      console.error('Abrir ruta:', e);
      showCatalog({ history: 'replace' });
    }
  } else if (savedModule) {
    try {
      await openCatalogModule(savedModule, { history: 'replace' });
    } catch (e) {
      console.error('Reabrir módulo:', e);
      showCatalog({ history: 'replace' });
    }
  } else {
    showCatalog({ history: 'replace' });
  }

  const session = getSession();
  if (session?.mode === 'exam') {
    document.body.classList.add('exam-mode');
  }

  state.loaded = true;
  console.log('FísicaHN: listo —', CATALOG.length, 'módulos');
}

/** Atrás / Adelante del navegador. */
function onAppPopState(ev) {
  const st = ev?.state;
  _historySilent = true;
  const done = () => {
    _historySilent = false;
  };

  // Estado nuestro
  if (st?.fisicahn) {
    if (st.view === 'sim' && st.catalogId && getById(st.catalogId)?.special !== 'works') {
      openCatalogModule(st.catalogId, { history: 'none', mode: st.mode || null }).finally(done);
      return;
    }
    showCatalog({ history: 'none' });
    done();
    return;
  }

  // Sin state (p. ej. entrada antigua): interpretar hash
  const route = parseAppRoute();
  if (route.view === 'sim' && route.catalogId && getById(route.catalogId)) {
    openCatalogModule(route.catalogId, { history: 'none', mode: route.mode || null }).finally(done);
    return;
  }
  showCatalog({ history: 'none' });
  done();
}

init().catch((err) => {
  console.error('Init falló:', err);
  try {
    showCatalog();
    renderCatalogGrids();
  } catch {
    /* último recurso */
  }
  alert(
    'Hubo un error al iniciar FísicaHN. Recarga la página.\nSi persiste, abre la consola (F12) y reporta el mensaje.'
  );
});
