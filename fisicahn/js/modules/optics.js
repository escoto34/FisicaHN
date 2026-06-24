/**
 * @fileoverview Facade / Enrutador del módulo de Óptica.
 * Permite seleccionar y ejecutar: Reflexión, Refracción, Lentes.
 */

import { Reflection } from './optics/reflection.js';
import { Refraction } from './optics/refraction.js';
import { Lenses } from './optics/lenses.js';
import { roundTo } from '../utils/math-helpers.js';

const SUB_MODULES = {
  reflection: { name: 'Reflexión (Espejos)', ClassRef: Reflection },
  refraction: { name: 'Refracción (Ley de Snell)', ClassRef: Refraction },
  lenses: { name: 'Lentes Convergentes/Divergentes', ClassRef: Lenses }
};

let activeKey = 'reflection';
let activeInstance = null;
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
  if (activeInstance && typeof activeInstance.destroy === 'function') {
    activeInstance.destroy();
  }
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function reset(engine, renderer, ui) {
  if (activeInstance && typeof activeInstance.reset === 'function') {
    activeInstance.reset();
  }
  updateData();
  renderSelectorAndParams();
}

export function setTool(toolId) {
  if (activeInstance && typeof activeInstance.setTool === 'function') {
    activeInstance.setTool(toolId);
  }
}

export function update(dt) {
  if (activeInstance && typeof activeInstance.update === 'function') {
    activeInstance.update(dt);
  }
}

export function render(ctx, alpha, elapsed) {
  if (activeInstance && typeof activeInstance.render === 'function') {
    activeInstance.render(ctx);
  }
}

/**
 * Cambia el sub-módulo activo
 * @param {string} key - Clave del sub-módulo
 */
function switchSubModule(key) {
  if (!SUB_MODULES[key]) return;

  if (activeInstance && typeof activeInstance.destroy === 'function') {
    activeInstance.destroy();
  }

  activeKey = key;
  const ClassRef = SUB_MODULES[key].ClassRef;
  activeInstance = new ClassRef();

  // Limpiar y resetear el gráfico global
  const app = window.app || {};
  if (app.chart) {
    app.chart.clear();
  }

  // Inicializar sub-módulo (las clases esperan canvas y renderer)
  activeInstance.init(_renderer.canvas, _renderer);

  // Cargar información pedagógica
  _ui.setInfo(getInfoText(key));
  _ui.setFormulas(getFormulasHTML(key));
  updateData();

  // Renderizar selectores y controles de parámetros
  renderSelectorAndParams();

  // Resetear el motor
  _engine.reset();
}

function getInfoText(key) {
  if (key === 'reflection') {
    return `
      <strong>Reflexión en Espejos Esféricos</strong><br>
      La luz reflejada en superficies curvas forma imágenes reales o virtuales.
      Los espejos cóncavos convergen la luz y pueden aumentar o invertir imágenes.
      Los convexos divergen la luz y reducen el campo visual formando siempre imágenes virtuales.
    `;
  } else if (key === 'refraction') {
    return `
      <strong>Refracción y Ley de Snell</strong><br>
      Cuando la luz cambia de medio transparente (p. ej., de aire a agua), varía su velocidad y dirección.
      Si pasa a un medio con menor índice de refracción, puede ocurrir Reflexión Total Interna (RTI) al superar el ángulo crítico.
    `;
  } else if (key === 'lenses') {
    return `
      <strong>Lentes Delgadas</strong><br>
      Las lentes refractan la luz a través de dos caras curvas.
      Las lentes convergentes (convexas) concentran la luz en un punto focal, formando imágenes reales o virtuales.
      Las divergentes (cóncavas) dispersan la luz, formando siempre imágenes virtuales y reducidas.
    `;
  }
  return '';
}

function getFormulasHTML(key) {
  if (key === 'reflection') {
    return `
      <ul style="padding-left:18px;margin:0;line-height:1.8">
        <li><strong>Ecuación de espejos:</strong> 1/f = 1/d₀ + 1/dᵢ</li>
        <li><strong>Distancia imagen:</strong> dᵢ = (d₀ · f) / (d₀ - f)</li>
        <li><strong>Aumento lateral:</strong> M = -dᵢ / d₀ = hᵢ / h₀</li>
        <li><strong>Foco:</strong> cóncavo (f > 0), convexo (f < 0)</li>
      </ul>
    `;
  } else if (key === 'refraction') {
    return `
      <ul style="padding-left:18px;margin:0;line-height:1.8">
        <li><strong>Ley de Snell:</strong> n₁ · sen(θ₁) = n₂ · sen(θ₂)</li>
        <li><strong>Ángulo crítico:</strong> θ_c = arcsen(n₂ / n₁) [n₁ > n₂]</li>
        <li><strong>Reflexión:</strong> θᵣ = θᵢ</li>
      </ul>
    `;
  } else if (key === 'lenses') {
    return `
      <ul style="padding-left:18px;margin:0;line-height:1.8">
        <li><strong>Ecuación de lentes:</strong> 1/f = 1/d₀ + 1/dᵢ</li>
        <li><strong>Distancia imagen:</strong> dᵢ = (d₀ · f) / (d₀ - f)</li>
        <li><strong>Aumento lateral:</strong> M = -dᵢ / d₀ = hᵢ / h₀</li>
        <li><strong>Foco:</strong> convergente (f > 0), divergente (f < 0)</li>
      </ul>
    `;
  }
  return '';
}

function updateData() {
  if (!_ui || !activeInstance) return;

  let html = '';
  if (activeKey === 'reflection') {
    const inst = activeInstance;
    html = `
      <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.6">
        <div><strong>Propiedades del Espejo:</strong></div>
        <div>Tipo de Espejo: ${inst.tipo_espejo}</div>
        <div>Distancia Objeto (d₀): ${inst.d0} cm</div>
        <div>Altura Objeto (h₀): ${inst.h0} cm</div>
        <div>Distancia Focal (f): ${inst.tipo_espejo === 'plano' ? '∞' : inst.f + ' cm'}</div>
        <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
        <div><strong>Resultados de la Imagen:</strong></div>
        <div>Distancia Imagen (dᵢ): ${isFinite(inst.di) ? roundTo(inst.di, 2) + ' cm' : '∞ (En el infinito)'}</div>
        <div>Altura Imagen (hᵢ): ${isFinite(inst.hi) ? roundTo(inst.hi, 2) + ' cm' : '∞'}</div>
        <div>Aumento Lateral (M): ${isFinite(inst.M) ? roundTo(inst.M, 3) : '∞'}</div>
        <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
        <div><strong>Clasificación:</strong></div>
        <div>Naturaleza: Imagen ${inst.categoria_real}</div>
        <div>Orientación: ${inst.categoria_orientacion}</div>
        <div>Tamaño: ${inst.categoria_tamano}</div>
      </div>
    `;
  } else if (activeKey === 'refraction') {
    const inst = activeInstance;
    const theta2Str = inst.isTIR ? '<span style="color:var(--warning)">Reflexión Interna Total</span>' : `${roundTo(inst.theta2, 2)}°`;
    html = `
      <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.6">
        <div><strong>Medios de Transmisión:</strong></div>
        <div>Medio superior (n₁): ${inst.n1.toFixed(2)}</div>
        <div>Medio inferior (n₂): ${inst.n2.toFixed(2)}</div>
        <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
        <div><strong>Medición de Ángulos:</strong></div>
        <div>Ángulo de Incidencia (θ₁): ${inst.theta1}°</div>
        <div>Ángulo de Refracción (θ₂): ${theta2Str}</div>
        <div>Ángulo de Reflexión (θᵣ): ${inst.theta_r}°</div>
        ${inst.n1 > inst.n2 ? `<div>Ángulo Crítico (θc): ${roundTo(inst.criticalAngle, 2)}°</div>` : ''}
        <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
        <div><strong>Estado del Rayo:</strong></div>
        <div>${inst.isTIR ? '⚡ Reflexión Total Interna activa' : '✓ Refracción a través del límite'}</div>
      </div>
    `;
  } else if (activeKey === 'lenses') {
    const inst = activeInstance;
    html = `
      <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.6">
        <div><strong>Propiedades de la Lente:</strong></div>
        <div>Tipo de Lente: ${inst.tipo_lente}</div>
        <div>Distancia Objeto (d₀): ${inst.d0} cm</div>
        <div>Altura Objeto (h₀): ${inst.h0} cm</div>
        <div>Distancia Focal (f): ${inst.f} cm</div>
        <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
        <div><strong>Resultados de la Imagen:</strong></div>
        <div>Distancia Imagen (dᵢ): ${isFinite(inst.di) ? roundTo(inst.di, 2) + ' cm' : '∞ (En el infinito)'}</div>
        <div>Altura Imagen (hᵢ): ${isFinite(inst.hi) ? roundTo(inst.hi, 2) + ' cm' : '∞'}</div>
        <div>Aumento Lateral (M): ${isFinite(inst.M) ? roundTo(inst.M, 3) : '∞'}</div>
        <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
        <div><strong>Clasificación:</strong></div>
        <div>Naturaleza: Imagen ${inst.categoria_real}</div>
        <div>Orientación: ${inst.categoria_orientacion}</div>
        <div>Tamaño: ${inst.categoria_tamano}</div>
      </div>
    `;
  }

  _ui.setData(html);
}

function renderSelectorAndParams() {
  const container = document.getElementById('paramsPanel');
  if (!container) return;

  // 1. Selector header HTML
  let optionsHTML = '';
  for (const [k, v] of Object.entries(SUB_MODULES)) {
    optionsHTML += `<option value="${k}" ${k === activeKey ? 'selected' : ''}>${v.name}</option>`;
  }

  let html = `
    <div class="control-group sub-module-selector" style="border-bottom:1px solid var(--border-color);padding-bottom:12px;margin-bottom:16px">
      <label class="control-label" style="font-weight:bold;color:var(--accent)">Sub-módulo de Óptica</label>
      <select class="select-input" id="opt_submodule_select" style="width:100%;margin-top:6px;padding:6px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm)">
        ${optionsHTML}
      </select>
    </div>
  `;

  // 2. Dynamic controls from activeInstance.getControls()
  const controls = activeInstance.getControls() || [];
  controls.forEach(ctrl => {
    if (ctrl.type === 'select') {
      const opts = ctrl.options.map(opt => `<option value="${opt.value}" ${opt.value === activeInstance[ctrl.id] ? 'selected' : ''}>${opt.label}</option>`).join('');
      html += `
        <div class="control-group">
          <label class="control-label">${ctrl.label}</label>
          <select class="select-input" id="opt_param_${ctrl.id}" style="width:100%">
            ${opts}
          </select>
        </div>
      `;
    } else if (ctrl.type === 'range') {
      html += `
        <div class="control-group">
          <label class="control-label">${ctrl.label}</label>
          <div class="slider-row">
            <input type="range" class="custom-slider" id="opt_param_${ctrl.id}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${activeInstance[ctrl.id]}">
            <span class="slider-value" id="opt_val_${ctrl.id}">${activeInstance[ctrl.id]}${ctrl.unit || ''}</span>
          </div>
        </div>
      `;
    }
  });

  container.innerHTML = html;

  // 3. Attach listeners
  const subSelect = document.getElementById('opt_submodule_select');
  subSelect?.addEventListener('change', (e) => {
    switchSubModule(e.target.value);
  });

  controls.forEach(ctrl => {
    const el = document.getElementById(`opt_param_${ctrl.id}`);
    if (!el) return;

    if (ctrl.type === 'select') {
      el.addEventListener('change', (e) => {
        activeInstance[ctrl.id] = e.target.value;
        activeInstance.calculate();
        updateData();
      });
    } else if (ctrl.type === 'range') {
      const valSpan = document.getElementById(`opt_val_${ctrl.id}`);
      el.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        activeInstance[ctrl.id] = val;
        if (valSpan) valSpan.textContent = `${val}${ctrl.unit || ''}`;
        activeInstance.calculate();
        updateData();
      });
    }
  });
}
