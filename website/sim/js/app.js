/**
 * @fileoverview App — Punto de entrada de FísicaHN.
 * Catálogo por nivel (MS / HS / Advanced) + motor de simulación.
 */

import { PhysicsEngine } from './physics-engine.js';
import { Renderer } from './renderer.js';
import { CATALOG, LEVELS, getByLevel, getById } from './catalog.js';
import { getSession, logAudit } from './auth.js';
import { saveWork, listWorks, exportWorksJSON, deleteWork } from './works.js';
import { ensureSessionGate, renderSessionBadge } from './session-gate.js';

/* ============================================
   Estado
   ============================================ */
const state = {
  view: 'catalog', // 'catalog' | 'sim'
  catalogLevel: 'middle',
  catalogId: null,
  currentModule: null,
  moduleInstances: {},
  loaded: false
};

const STORAGE_KEY = 'fisicahn_progress';

/** Motores de simulación existentes (carpeta modules/) */
const ENGINE_PATHS = {
  kinematics: './modules/kinematics.js',
  dynamics: './modules/dynamics.js',
  electricity: './modules/electricity.js',
  optics: './modules/optics.js',
  whiteboard: './modules/whiteboard.js',
  momentum: './modules/momentum.js',
  oscillatory: './modules/oscillatory.js',
  sound: './modules/sound.js',
  magnetic: './modules/magnetic.js',
  gravity: './modules/gravity.js',
  placeholder: './modules/placeholder.js'
};

const ENGINE_TITLES = {
  kinematics: 'Cinemática',
  dynamics: 'Dinámica',
  electricity: 'Electricidad',
  optics: 'Óptica',
  whiteboard: 'Pizarra',
  momentum: 'Momentum',
  oscillatory: 'Oscilatorio',
  sound: 'Sonido',
  magnetic: 'Campos magnéticos',
  gravity: 'Gravedad',
  placeholder: 'Próximamente'
};

/** Herramientas de medición globales */
const measureState = {
  tool: 'pointer',
  rulerPoints: [],
  anglePoints: [],
  probe: null,
  stopwatchEl: null
};

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

const engine = new PhysicsEngine(canvas);
const renderer = new Renderer(canvas, { worldWidth: 20, worldHeight: 15 });

/* ============================================
   UI API para módulos
   ============================================ */
const ui = {
  setParams(html) {
    paramsPanel.innerHTML = html;
  },
  setChart(svgContent) {
    chartSvg.innerHTML = svgContent;
  },
  setInfo(msg) {
    const infoPanel = document.getElementById('tab-info');
    if (infoPanel) infoPanel.innerHTML = `<p class="tab-text">${msg}</p>`;
  },
  setFormulas(html) {
    const panel = document.getElementById('tab-formulas');
    if (panel) panel.innerHTML = html;
  },
  setData(html) {
    const panel = document.getElementById('tab-data');
    if (panel) panel.innerHTML = html;
  },
  setChallenges(html) {
    const panel = document.getElementById('tab-challenges');
    if (panel) panel.innerHTML = html;
  },
  showTab(tabId) {
    bottomTabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    const panels = bottomContent.querySelectorAll('.tab-panel');
    panels.forEach((p) => p.classList.remove('active'));
    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.add('active');
  }
};

/* ============================================
   Catálogo UI
   ============================================ */

function renderCatalogGrids() {
  for (const level of LEVELS) {
    const grid = document.getElementById(`grid-${level.id}`);
    if (!grid) continue;
    grid.innerHTML = '';
    for (const mod of getByLevel(level.id)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'catalog-card';
      btn.dataset.catalogId = mod.id;
      btn.setAttribute(
        'aria-label',
        `${mod.title}. ${mod.status === 'ready' ? 'Disponible' : 'Próximamente'}`
      );
      btn.innerHTML = `
        <div class="catalog-card-top">
          <div>
            <div class="catalog-card-title">${escapeHtml(mod.title)}</div>
            <div class="catalog-card-en">${escapeHtml(mod.titleEn)}</div>
          </div>
          <span class="catalog-badge ${mod.status}">${
            mod.status === 'ready' ? 'Disponible' : 'Pronto'
          }</span>
        </div>
        <p class="catalog-card-blurb">${escapeHtml(mod.blurb)}</p>
      `;
      btn.addEventListener('click', () => openCatalogModule(mod.id));
      grid.appendChild(btn);
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setCatalogLevel(levelId) {
  state.catalogLevel = levelId;
  document.querySelectorAll('.catalog-tab').forEach((tab) => {
    const on = tab.dataset.level === levelId;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.catalog-panel').forEach((panel) => {
    const on = panel.dataset.level === levelId;
    panel.classList.toggle('active', on);
    panel.hidden = !on;
  });
  saveProgress();
}

function showCatalog() {
  state.view = 'catalog';
  catalogView.hidden = false;
  simShell.hidden = true;
  document.body.classList.add('view-catalog');
  document.body.classList.remove('view-sim');
  // Pausar simulación en segundo plano
  engine.pause(true);
  updatePlayPauseUI();
  saveProgress();
}

function showSimShell() {
  state.view = 'sim';
  catalogView.hidden = true;
  simShell.hidden = false;
  document.body.classList.add('view-sim');
  document.body.classList.remove('view-catalog');
}

function fillSidebarForLevel(levelId) {
  if (!sidebarNav) return;
  sidebarNav.innerHTML = '';
  for (const mod of getByLevel(levelId)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'module-btn';
    btn.dataset.catalogId = mod.id;
    if (mod.id === state.catalogId) btn.classList.add('active');
    btn.innerHTML = `<span>${escapeHtml(mod.title)}</span>`;
    btn.addEventListener('click', () => openCatalogModule(mod.id));
    sidebarNav.appendChild(btn);
  }
}

/**
 * Entra a un módulo del catálogo (carga motor real o placeholder).
 */
async function openCatalogModule(catalogId) {
  const entry = getById(catalogId);
  if (!entry) return;

  state.catalogId = catalogId;
  state.catalogLevel = entry.level;
  showSimShell();
  fillSidebarForLevel(entry.level);

  const engineKey = entry.engineKey || 'placeholder';
  await loadEngineModule(engineKey, entry);
  saveProgress();
}

/* ============================================
   Carga de motor
   ============================================ */

async function destroyCurrentEngine() {
  const key = state.currentModule;
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
 */
async function loadEngineModule(engineKey, catalogEntry = null) {
  await destroyCurrentEngine();

  const path = ENGINE_PATHS[engineKey] || ENGINE_PATHS.placeholder;
  const usePlaceholder = !ENGINE_PATHS[engineKey] || engineKey === 'placeholder' || !catalogEntry?.engineKey;

  const resolvedKey = usePlaceholder ? 'placeholder' : engineKey;
  state.currentModule = resolvedKey;

  const title = catalogEntry?.title || ENGINE_TITLES[resolvedKey] || resolvedKey;
  moduleTitle.textContent = title;

  document.querySelectorAll('.module-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.catalogId === state.catalogId);
  });

  paramsPanel.innerHTML = '<p class="placeholder-text">Cargando módulo...</p>';
  chartSvg.innerHTML =
    '<text x="150" y="90" text-anchor="middle" fill="var(--text-secondary)" font-size="11">Cargando...</text>';

  try {
    const mod = await import(path);
    state.moduleInstances[resolvedKey] = mod;
    engine.reset();
    renderer.resetCamera();
    renderer.clearOverlays();
    measureState.rulerPoints = [];
    measureState.anglePoints = [];
    measureState.probe = null;
    if (typeof mod.init === 'function') {
      if (resolvedKey === 'placeholder') {
        mod.init(engine, renderer, ui, {
          title,
          blurb: catalogEntry?.blurb || ''
        });
      } else {
        mod.init(engine, renderer, ui);
      }
    }
    // Pizarra se queda pausada; resto corre
    if (resolvedKey === 'whiteboard') {
      engine.pause(true);
      updatePlayPauseUI();
    } else {
      ensureRunning();
    }
  } catch (err) {
    console.error(`Error cargando motor ${resolvedKey}:`, err);
    paramsPanel.innerHTML = `<p class="placeholder-text" style="color: var(--danger)">Error al cargar ${escapeHtml(
      title
    )}. Verifica la consola.</p>`;
  }
}

function ensureRunning() {
  engine.pause(false);
  updatePlayPauseUI();
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
  engine.pause();
  updatePlayPauseUI();
}

function updatePlayPauseUI() {
  const paused = engine.isPaused();
  const icon = playPauseBtn.querySelector('svg');
  playPauseLabel.textContent = paused ? 'Reproducir' : 'Pausa';
  simStatus.textContent = paused ? 'Pausado' : 'En ejecución';
  if (!icon) return;
  if (paused) {
    icon.innerHTML = '<polygon points="6 4 20 12 6 20"/>';
  } else {
    icon.innerHTML =
      '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
  }
}

speedSlider.addEventListener('input', () => {
  const val = parseFloat(speedSlider.value);
  speedDisplay.textContent = val.toFixed(1) + '×';
  engine.setSpeed(val);
});

playPauseBtn.addEventListener('click', togglePause);

resetBtn.addEventListener('click', () => {
  engine.reset();
  const inst = state.moduleInstances[state.currentModule];
  if (inst && typeof inst.reset === 'function') {
    inst.reset(engine, renderer, ui);
  }
});

stepBtn.addEventListener('click', () => {
  if (!engine.isPaused()) engine.pause();
  engine.step();
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
  ui.showTab('info');
  ui.setInfo('Configuración global próximamente. Usa el catálogo para cambiar de módulo.');
});

catalogBackBtn?.addEventListener('click', () => {
  showCatalog();
});

bottomTabs.forEach((btn) => {
  btn.addEventListener('click', () => ui.showTab(btn.dataset.tab));
});

toolBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool || 'pointer';
    if (tool === 'whiteboard') {
      openCatalogModule(
        state.catalogLevel === 'high'
          ? 'whiteboard-hs'
          : state.catalogLevel === 'advanced'
            ? 'whiteboard-adv'
            : 'whiteboard'
      );
      return;
    }
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
      measureState.rulerPoints = [];
      measureState.anglePoints = [];
      measureState.probe = null;
      renderer.clearOverlays();
      return;
    }

    toolBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    measureState.tool = tool;
    measureState.rulerPoints = [];
    measureState.anglePoints = [];

    const inst = state.moduleInstances[state.currentModule];
    if (inst && typeof inst.setTool === 'function') {
      inst.setTool(tool);
    }
  });
});

canvas.addEventListener('pointerdown', (e) => {
  if (state.view !== 'sim') return;
  if (state.currentModule === 'whiteboard') return;
  const world = renderer.getMousePos(e);
  if (measureState.tool === 'probe') {
    measureState.probe = world;
    ui.setData(
      `<div style="font-family:var(--font-mono)">Sonda: x=${world.x.toFixed(3)} m, y=${world.y.toFixed(3)} m</div>`
    );
  } else if (measureState.tool === 'ruler') {
    measureState.rulerPoints.push(world);
    if (measureState.rulerPoints.length > 2) measureState.rulerPoints = [world];
  } else if (measureState.tool === 'angle') {
    measureState.anglePoints.push(world);
    if (measureState.anglePoints.length > 3) measureState.anglePoints = [world];
  }
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

document.querySelectorAll('.catalog-tab').forEach((tab) => {
  tab.addEventListener('click', () => setCatalogLevel(tab.dataset.level));
});

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (state.view === 'catalog') {
    if (e.code === 'Digit1') setCatalogLevel('middle');
    if (e.code === 'Digit2') setCatalogLevel('high');
    if (e.code === 'Digit3') setCatalogLevel('advanced');
    return;
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      togglePause();
      break;
    case 'KeyR':
      e.preventDefault();
      resetBtn.click();
      break;
    case 'Escape':
      e.preventDefault();
      showCatalog();
      break;
    case 'KeyI': {
      const inst = state.moduleInstances[state.currentModule];
      if (inst?.setUnbounded) {
        e.preventDefault();
        inst.setUnbounded(!(inst.getUnbounded?.() ?? false));
      }
      break;
    }
  }
});

/* ============================================
   Loop
   ============================================ */

engine.onUpdate = (dt) => {
  if (state.view !== 'sim') return;
  const inst = state.moduleInstances[state.currentModule];
  if (inst && typeof inst.update === 'function') inst.update(dt);
};

engine.onRender = (ctx, alpha, elapsed) => {
  if (state.view !== 'sim') return;
  renderer.clear();
  const inst = state.moduleInstances[state.currentModule];
  const skipGrid = inst && inst.skipWorldGrid === true;
  if (!skipGrid) {
    renderer.drawGrid({ spacing: 1 });
  }
  if (inst && typeof inst.render === 'function') {
    inst.render(ctx, alpha, elapsed);
  }
  drawMeasureOverlays(ctx);
  renderer.drawOverlays();
  fpsCounter.textContent = `${engine.getFps()} FPS`;
  if (!engine.isPaused()) {
    simStatus.textContent = `En ejecución · ${elapsed.toFixed(1)}s`;
  }
};

function drawMeasureOverlays(ctx) {
  if (measureState.probe) {
    const p = measureState.probe;
    renderer.drawTooltip(p.x, p.y, `x=${p.x.toFixed(2)}  y=${p.y.toFixed(2)}`);
  }
  if (measureState.rulerPoints.length === 1) {
    const a = measureState.rulerPoints[0];
    const pa = renderer.worldToCanvas(a.x, a.y);
    ctx.save();
    ctx.fillStyle = '#ffb74d';
    ctx.beginPath();
    ctx.arc(pa.x, pa.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (measureState.rulerPoints.length === 2) {
    const [a, b] = measureState.rulerPoints;
    const pa = renderer.worldToCanvas(a.x, a.y);
    const pb = renderer.worldToCanvas(b.x, b.y);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    ctx.save();
    ctx.strokeStyle = '#ffb74d';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.fillStyle = '#ffb74d';
    ctx.font = '12px monospace';
    ctx.fillText(`${dist.toFixed(2)} m`, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - 8);
    ctx.restore();
  }
  if (measureState.anglePoints.length >= 1) {
    ctx.save();
    ctx.fillStyle = '#ce93d8';
    for (const pt of measureState.anglePoints) {
      const p = renderer.worldToCanvas(pt.x, pt.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (measureState.anglePoints.length === 3) {
      const [A, O, B] = measureState.anglePoints;
      const po = renderer.worldToCanvas(O.x, O.y);
      const pa = renderer.worldToCanvas(A.x, A.y);
      const pb = renderer.worldToCanvas(B.x, B.y);
      ctx.strokeStyle = '#ce93d8';
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(po.x, po.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      const ang1 = Math.atan2(A.y - O.y, A.x - O.x);
      const ang2 = Math.atan2(B.y - O.y, B.x - O.x);
      let deg = Math.abs((ang2 - ang1) * 180 / Math.PI);
      if (deg > 180) deg = 360 - deg;
      ctx.fillText(`${deg.toFixed(1)}°`, po.x + 10, po.y - 10);
    }
    ctx.restore();
  }
}

engine.onPauseChanged = () => updatePlayPauseUI();

/* ============================================
   Init
   ============================================ */

function collectModuleSnapshot() {
  const inst = state.moduleInstances[state.currentModule];
  const snap = {
    catalogId: state.catalogId,
    engineKey: state.currentModule,
    simTime: engine._elapsed ?? 0,
    paused: engine.isPaused?.() ?? false
  };
  if (inst && typeof inst.getState === 'function') {
    try {
      const s = inst.getState();
      // serializable shallow
      snap.moduleState = JSON.parse(JSON.stringify(s, (_k, v) =>
        typeof v === 'number' && !Number.isFinite(v) ? null : v
      ));
    } catch {
      snap.moduleState = null;
    }
  }
  return snap;
}

async function handleSaveWork() {
  const session = getSession();
  if (!session || session.role === 'teacher') {
    // allow teacher to save as demo with prompt name
  }
  const defaultName = `${state.catalogId || state.currentModule || 'modulo'}-${new Date()
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ')}`;
  const name = prompt('Nombre del trabajo a guardar:', defaultName);
  if (name == null) return;
  try {
    const entry = getById(state.catalogId);
    const work = await saveWork({
      name,
      moduleId: state.catalogId || state.currentModule || 'unknown',
      moduleTitle: entry?.title || moduleTitle?.textContent || state.currentModule,
      snapshot: collectModuleSnapshot(),
      notes: session?.mode === 'exam' ? 'Modo examen' : ''
    });
    refreshWorksList();
    alert(`Trabajo guardado: “${work.name}”\nQueda en la caché de este navegador (sello de integridad incluido).`);
  } catch (e) {
    alert(e.message || 'No se pudo guardar.');
  }
}

function refreshWorksList() {
  const host = document.getElementById('worksList');
  if (!host) return;
  const works = listWorks().slice(0, 12);
  if (!works.length) {
    host.innerHTML =
      '<p class="placeholder-text">Aún no hay trabajos. Usa “Guardar trabajo” en un módulo.</p>';
    return;
  }
  host.innerHTML = works
    .map(
      (w) => `
    <div class="work-item" data-id="${w.id}">
      <div class="work-item-title">${escapeHtml(w.name)}</div>
      <div class="work-item-meta">${escapeHtml(w.moduleTitle)} · ${new Date(w.savedAt).toLocaleString()}${
        w.mode === 'exam' ? ' · EXAMEN' : ''
      }</div>
      <button type="button" class="work-del" data-del="${w.id}" aria-label="Eliminar trabajo">×</button>
    </div>`
    )
    .join('');
  host.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm('¿Eliminar este trabajo de la caché?')) {
        deleteWork(btn.dataset.del);
        refreshWorksList();
      }
    });
  });
}

async function init() {
  // App de escritorio (Electron / NetSupport): ocultar enlaces web
  if (window.FisicaHNDesktop?.isDesktop) {
    document.documentElement.dataset.desktop = '1';
    document.body.classList.add('is-desktop');
  }

  await ensureSessionGate();
  renderSessionBadge(document.getElementById('sessionBadgeHost'));
  logAudit('app_start', {
    modules: CATALOG.length,
    desktop: !!window.FisicaHNDesktop?.isDesktop
  });

  renderCatalogGrids();
  refreshWorksList();

  document.getElementById('openWhiteboardBtn')?.addEventListener('click', () => {
    openCatalogModule('whiteboard');
  });
  document.getElementById('saveWorkBtn')?.addEventListener('click', () => handleSaveWork());
  document.getElementById('exportMyWorksBtn')?.addEventListener('click', () => {
    exportWorksJSON(listWorks());
  });

  const saved = loadProgress();
  if (saved.lastLevel) setCatalogLevel(saved.lastLevel);
  else setCatalogLevel('middle');

  engine.start();

  if (saved.lastView === 'sim' && saved.lastCatalogId && getById(saved.lastCatalogId)) {
    await openCatalogModule(saved.lastCatalogId);
  } else {
    showCatalog();
  }

  // En examen, avisar en catálogo
  const session = getSession();
  if (session?.mode === 'exam') {
    document.body.classList.add('exam-mode');
  }

  state.loaded = true;
  console.log('FísicaHN: catálogo listo —', CATALOG.length, 'módulos');
}

init().catch(console.error);
