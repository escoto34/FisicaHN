/**
 * @fileoverview Facade / Enrutador del módulo de Electricidad.
 * Permite seleccionar y ejecutar: Ley de Ohm, Leyes de Kirchhoff, Constructor de Circuitos.
 */

import * as ohmLaw from './electricity/ohm-law.js';
import * as kirchhoff from './electricity/kirchhoff.js';
import * as circuitBuilder from './electricity/circuit-builder.js';

const SUB_MODULES = {
  'ohm-law': { name: 'Ley de Ohm y Circuito Simple', module: ohmLaw },
  kirchhoff: { name: 'Leyes de Kirchhoff (2 Lazos)', module: kirchhoff },
  'circuit-builder': { name: 'Constructor de Circuitos (Drag & Drop)', module: circuitBuilder }
};

let activeKey = 'ohm-law';
let activeSub = ohmLaw;
let _engine = null;
let _renderer = null;
let _ui = null;

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  // Iniciar con sub-módulo seleccionado
  switchSubModule(activeKey);
}

export function destroy() {
  if (activeSub && typeof activeSub.destroy === 'function') {
    activeSub.destroy();
  }
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function reset(engine, renderer, ui) {
  if (activeSub && typeof activeSub.reset === 'function') {
    activeSub.reset(engine, renderer, ui);
  }
}

export function setTool(toolId) {
  if (activeSub && typeof activeSub.setTool === 'function') {
    activeSub.setTool(toolId);
  }
}

export function update(dt) {
  if (activeSub && typeof activeSub.update === 'function') {
    activeSub.update(dt, _engine.getElapsed());
  }
}

export function render(ctx, alpha, elapsed) {
  if (activeSub && typeof activeSub.render === 'function') {
    activeSub.render(ctx, alpha, elapsed);
  }
}

/**
 * Cambia el sub-módulo activo
 * @param {string} key - Clave del sub-módulo
 */
function switchSubModule(key) {
  if (!SUB_MODULES[key]) return;

  // Destruir anterior
  if (activeSub && typeof activeSub.destroy === 'function') {
    activeSub.destroy();
  }

  activeKey = key;
  activeSub = SUB_MODULES[key].module;

  // Limpiar y resetear el gráfico global
  const app = window.app || {};
  if (app.chart) {
    app.chart.clear();
  }

  // Inicializar sub-módulo
  activeSub.init(_engine, _renderer, _ui);

  // Volver a renderizar la cabecera de parámetros con el selector del sub-módulo
  renderSelectorHeader();

  // Resetear el motor
  _engine.reset();
}

/**
 * Inserta el selector de sub-módulos al principio del panel de parámetros
 */
function renderSelectorHeader() {
  const container = document.getElementById('paramsPanel');
  if (!container) return;

  // Crear el bloque de selección
  const selectorDiv = document.createElement('div');
  selectorDiv.className = 'control-group sub-module-selector';
  selectorDiv.style.borderBottom = '1px solid var(--border-color)';
  selectorDiv.style.paddingBottom = '12px';
  selectorDiv.style.marginBottom = '16px';

  let optionsHTML = '';
  for (const [k, v] of Object.entries(SUB_MODULES)) {
    optionsHTML += `<option value="${k}" ${k === activeKey ? 'selected' : ''}>${v.name}</option>`;
  }

  selectorDiv.innerHTML = `
    <label class="control-label" style="font-weight:bold;color:var(--accent-secondary)">Sub-módulo de Electricidad</label>
    <select class="select-input" id="elec_submodule_select" style="width:100%;margin-top:6px;padding:6px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm)">
      ${optionsHTML}
    </select>
  `;

  // Insertar al inicio
  container.insertBefore(selectorDiv, container.firstChild);

  // Vincular evento
  const select = document.getElementById('elec_submodule_select');
  select?.addEventListener('change', (e) => {
    switchSubModule(e.target.value);
  });
}
