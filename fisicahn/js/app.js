/**
 * @fileoverview App — Punto de entrada de FísicaHN.
 * Enrutador de módulos, estado global, inicialización de UI y atajos.
 *
 * Los módulos se cargan de forma perezosa (lazy) desde /js/modules/*.js
 * y deben exportar una función `init(engine, renderer, ui)` y `destroy()`.
 */

import { PhysicsEngine } from './physics-engine.js';
import { Renderer } from './renderer.js';
import { ChallengeEngine } from './challenges.js';
import { ScenarioManager } from './scenarios.js';

/* ============================================
   Estado de la aplicación
   ============================================ */
const state = {
  currentModule: 'kinematics',
  modules: {
    kinematics: null,
    dynamics: null,
    electricity: null,
    optics: null
  },
  moduleInstances: {},
  loaded: false
};

const STORAGE_KEY = 'fisicahn_progress';

/* ============================================
   Referencias DOM
   ============================================ */
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
const sidebarBtns = document.querySelectorAll('.module-btn');
const toolBtns = document.querySelectorAll('.tool-btn');

/** Mapa de títulos de módulos */
const MODULE_TITLES = {
  kinematics: 'Cinemática',
  dynamics: 'Dinámica',
  electricity: 'Electricidad',
  optics: 'Óptica'
};

/** Ruta base para módulos */
const MODULE_PATHS = {
  kinematics: './modules/kinematics.js',
  dynamics: './modules/dynamics.js',
  electricity: './modules/electricity.js',
  optics: './modules/optics.js'
};

/* ============================================
   Inicialización del motor y renderizador
   ============================================ */
const engine = new PhysicsEngine(canvas);
const renderer = new Renderer(canvas, { worldWidth: 20, worldHeight: 15 });

/* ============================================
   UI Helpers
   ============================================ */

/**
 * Objeto UI expuesto a los módulos.
 * Proporciona métodos para manipular paneles y registro de parámetros.
 */
const ui = {
  /**
   * Actualiza el panel de parámetros con controles HTML.
   * @param {string} html - HTML para inyectar en paramsPanel
   */
  setParams(html) {
    paramsPanel.innerHTML = html;
  },

  /**
   * Actualiza la gráfica SVG con contenido.
   * @param {string} svgContent - SVG interno
   */
  setChart(svgContent) {
    chartSvg.innerHTML = svgContent;
  },

  /**
   * Muestra un mensaje en el panel de información (pestaña activa).
   * @param {string} msg
   */
  setInfo(msg) {
    const infoPanel = document.getElementById('tab-info');
    if (infoPanel) {
      infoPanel.innerHTML = `<p class="tab-text">${msg}</p>`;
    }
  },

  /**
   * Agrega contenido a la pestaña de fórmulas.
   * @param {string} html
   */
  setFormulas(html) {
    const panel = document.getElementById('tab-formulas');
    if (panel) {
      panel.innerHTML = html;
    }
  },

  /**
   * Agrega contenido a la pestaña de datos.
   * @param {string} html
   */
  setData(html) {
    const panel = document.getElementById('tab-data');
    if (panel) {
      panel.innerHTML = html;
    }
  },

  /**
   * Agrega contenido a la pestaña de desafíos.
   * @param {string} html
   */
  setChallenges(html) {
    const panel = document.getElementById('tab-challenges');
    if (panel) {
      panel.innerHTML = html;
    }
  },

  /**
   * Alterna la visibilidad de una pestaña inferior.
   * @param {'info'|'formulas'|'data'|'challenges'} tabId
   */
  showTab(tabId) {
    bottomTabs.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    const panels = bottomContent.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.add('active');
  }
};

/* ============================================
   Carga/descarga de módulos
   ============================================ */

/**
 * Carga un módulo de física y lo inicializa.
 * @param {string} moduleId - Identificador del módulo (kinematics, dynamics, etc.)
 */
async function loadModule(moduleId) {
  // Descargar módulo anterior
  if (state.moduleInstances[state.currentModule]) {
    try {
      state.moduleInstances[state.currentModule].destroy();
    } catch (e) {
      console.warn(`Error al destruir módulo ${state.currentModule}:`, e);
    }
    delete state.moduleInstances[state.currentModule];
  }

  state.currentModule = moduleId;
  moduleTitle.textContent = MODULE_TITLES[moduleId] || moduleId;

  // Actualizar sidebar
  sidebarBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === moduleId);
  });

  // Limpiar paneles
  paramsPanel.innerHTML = '<p class="placeholder-text">Cargando módulo...</p>';
  chartSvg.innerHTML = '<text x="150" y="90" text-anchor="middle" fill="var(--text-secondary)" font-size="11">Cargando...</text>';

  // Carga perezosa del módulo
  try {
    const mod = await import(MODULE_PATHS[moduleId]);
    state.moduleInstances[moduleId] = mod;
    engine.reset();
    if (typeof mod.init === 'function') {
      mod.init(engine, renderer, ui);
    }

    // Cargar retos pedagógicos correspondientes
    try {
      let challengesFile = '';
      if (moduleId === 'kinematics') challengesFile = 'cinematica-retos.json';
      else if (moduleId === 'dynamics') challengesFile = 'dinamica-retos.json';
      else if (moduleId === 'electricity') challengesFile = 'electricidad-retos.json';
      else if (moduleId === 'optics') challengesFile = 'optica-retos.json';

      if (challengesFile && window.challengeEngine) {
        const response = await fetch(`data/challenges/${challengesFile}`);
        if (response.ok) {
          const data = await response.json();
          window.challengeEngine.loadChallenges(moduleId, data);
        } else {
          console.warn(`No se pudo cargar el archivo de retos: ${challengesFile}`);
        }
      }
    } catch (challengeErr) {
      console.error('Error al cargar retos pedagógicos:', challengeErr);
    }
  } catch (err) {
    console.error(`Error cargando módulo ${moduleId}:`, err);
    paramsPanel.innerHTML = `<p class="placeholder-text" style="color: var(--danger)">Error al cargar ${MODULE_TITLES[moduleId]}. Verifica la consola.</p>`;
  }

  saveProgress();
}

/* ============================================
   Persistencia (localStorage)
   ============================================ */

function saveProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    data.lastModule = state.currentModule;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage no disponible
  }
}

function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (data.lastModule && MODULE_PATHS[data.lastModule]) {
      return data.lastModule;
    }
  } catch {
    // ignorar
  }
  return null;
}

/* ============================================
   Configuración de eventos UI
   ============================================ */

// Sidebar — cambio de módulo
sidebarBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const mod = btn.dataset.module;
    if (mod !== state.currentModule) {
      loadModule(mod);
    }
  });
});

// Slider de velocidad
speedSlider.addEventListener('input', () => {
  const val = parseFloat(speedSlider.value);
  speedDisplay.textContent = val.toFixed(1) + '×';
  engine.setSpeed(val);
});

// Botón play/pause
playPauseBtn.addEventListener('click', togglePause);

function togglePause() {
  engine.pause();
  updatePlayPauseUI();
}

function updatePlayPauseUI() {
  const paused = engine.isPaused();
  const icon = playPauseBtn.querySelector('svg');
  playPauseLabel.textContent = paused ? 'Reproducir' : 'Pausa';
  simStatus.textContent = paused ? '⏸ Pausado' : '▶ En ejecución';
  if (paused) {
    icon.innerHTML = '<polygon points="6 4 20 12 6 20"/>';
  } else {
    icon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
  }
}

// Botón reinicio
resetBtn.addEventListener('click', () => {
  engine.reset();
  const inst = state.moduleInstances[state.currentModule];
  if (inst && typeof inst.reset === 'function') {
    inst.reset(engine, renderer, ui);
  }
});

// Botón paso
stepBtn.addEventListener('click', () => {
  if (!engine.isPaused()) engine.pause();
  engine.step();
  updatePlayPauseUI();
});

// Botón pantalla completa
document.getElementById('fullscreenBtn').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.body.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// Botón configuración
document.getElementById('settingsBtn').addEventListener('click', () => {
  ui.showTab('info');
  ui.setInfo('Configuración global próximamente.');
});

// Pestañas inferiores
bottomTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    ui.showTab(tabId);
  });
});

// Herramientas
toolBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    toolBtns.forEach(b => b.classList.remove('active'));
    btn.classList.toggle('active');
    // El módulo activo puede leer data-tool del botón activo
    const tool = document.querySelector('.tool-btn.active');
    const inst = state.moduleInstances[state.currentModule];
    if (inst && typeof inst.setTool === 'function') {
      inst.setTool(tool ? tool.dataset.tool : 'pointer');
    }
  });
});

/* ============================================
   Atajos de teclado
   ============================================ */
document.addEventListener('keydown', (e) => {
  // Evitar atajos si el foco está en un input/textarea
  const tag = document.activeElement?.tagName || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
      toolBtns.forEach(b => b.classList.remove('active'));
      break;
    case 'Digit1':
      loadModule('kinematics');
      break;
    case 'Digit2':
      loadModule('dynamics');
      break;
    case 'Digit3':
      loadModule('electricity');
      break;
    case 'Digit4':
      loadModule('optics');
      break;
  }
});

/* ============================================
   Bucle de renderizado
   ============================================ */

engine.onUpdate = (dt) => {
  const inst = state.moduleInstances[state.currentModule];
  if (inst && typeof inst.update === 'function') {
    inst.update(dt);
  }
};

engine.onRender = (ctx, alpha, elapsed) => {
  renderer.clear();
  renderer.drawGrid({ spacing: 1 });

  const inst = state.moduleInstances[state.currentModule];
  if (inst && typeof inst.render === 'function') {
    inst.render(ctx, alpha, elapsed);
  }

  fpsCounter.textContent = `${engine.getFps()} FPS`;

  // Estado de simulación
  if (!engine.isPaused()) {
    simStatus.textContent = `▶ En ejecución · ${elapsed.toFixed(1)}s`;
  }
};

engine.onPauseChanged = (paused) => {
  updatePlayPauseUI();
};

/* ============================================
   Inicio de la aplicación
   ============================================ */

async function init() {
  // Cargar progreso previo
  const lastMod = loadProgress();
  const initialMod = lastMod && MODULE_PATHS[lastMod] ? lastMod : 'kinematics';

  // Iniciar motor
  engine.start();

  // Instanciar motores pedagógicos
  window.challengeEngine = new ChallengeEngine();
  
  const scenarioManager = new ScenarioManager({
    onLoad: (scenario) => {
      if (scenario.module && scenario.module !== state.currentModule) {
        loadModule(scenario.module);
      }
      setTimeout(() => {
        const inst = state.moduleInstances[state.currentModule];
        if (inst) {
          // Si el módulo tiene un método para cargar estado de controles
          if (typeof inst.loadScenarioState === 'function') {
            inst.loadScenarioState(scenario.controls);
          } else {
            // Asignación directa a las variables y recálculo
            for (const [k, v] of Object.entries(scenario.controls)) {
              inst[k] = v;
            }
            if (typeof inst.reset === 'function') {
              inst.reset(engine, renderer, ui);
            }
          }
        }
      }, 200);
    },
    onSave: (scenario) => {
      const inst = state.moduleInstances[state.currentModule];
      if (inst) {
        scenario.module = state.currentModule;
        scenario.controls = {};
        if (typeof inst.getScenarioState === 'function') {
          scenario.controls = inst.getScenarioState();
        } else {
          const controls = typeof inst.getControls === 'function' ? inst.getControls() : [];
          controls.forEach(ctrl => {
            scenario.controls[ctrl.id] = inst[ctrl.id];
          });
        }
      }
    }
  });

  // Agregar la UI del ScenarioManager al tab de Info
  const tabInfo = document.getElementById('tab-info');
  if (tabInfo) {
    const divider = document.createElement('hr');
    divider.style.border = '0';
    divider.style.borderTop = '1px solid var(--border-color)';
    divider.style.margin = '16px 0';
    tabInfo.appendChild(divider);
    tabInfo.appendChild(scenarioManager.wrapper);
  }

  // Cargar módulo inicial
  await loadModule(initialMod);

  state.loaded = true;
  console.log(`FísicaHN iniciado — módulo: ${initialMod}`);
}

init().catch(console.error);
