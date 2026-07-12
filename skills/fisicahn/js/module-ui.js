/**
 * Utilidades de UI compartidas por módulos:
 * - info + botón Historia y casos prácticos
 * - fórmulas legibles
 * - parámetros con slider + campo numérico
 */

/**
 * @param {object} ui
 * @param {{ title: string, blurb: string, story?: string, cases?: string[] }} content
 */
export function setModuleInfo(ui, content) {
  const title = content.title || 'Módulo';
  const blurb = content.blurb || '';
  const story = content.story || '';
  const cases = Array.isArray(content.cases) ? content.cases : [];

  const casesHtml = cases.length
    ? `<ul class="info-cases">${cases.map((c) => `<li>${c}</li>`).join('')}</ul>`
    : '';

  ui.setInfo(`
    <div class="module-info-block">
      <p class="tab-text"><strong>${title}</strong> — ${blurb}</p>
      <button type="button" class="ctrl-btn info-story-btn" id="moduleStoryBtn" aria-expanded="false">
        Historia y casos prácticos
      </button>
      <div class="module-story-panel" id="moduleStoryPanel" hidden>
        ${story ? `<p class="tab-text story-text">${story}</p>` : ''}
        ${casesHtml}
      </div>
    </div>
  `);

  setTimeout(() => {
    const btn = document.getElementById('moduleStoryBtn');
    const panel = document.getElementById('moduleStoryPanel');
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      const open = panel.hasAttribute('hidden');
      if (open) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }, 0);
}

/**
 * Fórmulas en bloques legibles (notación con subíndices HTML).
 * @param {object} ui
 * @param {{ title?: string, items: { name: string, formula: string, note?: string }[] }} data
 */
export function setModuleFormulas(ui, data) {
  const items = data.items || [];
  const title = data.title ? `<p class="formula-section-title">${data.title}</p>` : '';
  const rows = items
    .map(
      (it) => `
    <div class="formula-card">
      <div class="formula-name">${it.name}</div>
      <div class="formula-expr">${it.formula}</div>
      ${it.note ? `<div class="formula-note">${it.note}</div>` : ''}
    </div>`
    )
    .join('');
  ui.setFormulas(`
    <div class="formulas-readable">
      ${title}
      ${rows || '<p class="tab-text placeholder-text">Sin fórmulas en este módulo.</p>'}
    </div>
  `);
}

/**
 * Construye un control de parámetro: etiqueta + slider + input numérico.
 * @param {{ id: string, label: string, min: number, max: number, step: number, value: number, unit?: string }} p
 */
export function paramControl(p) {
  const unit = p.unit ? ` <span class="param-unit">${p.unit}</span>` : '';
  return `
    <div class="control-group param-control" data-param="${p.id}">
      <label class="control-label" for="param_${p.id}">${p.label}${unit}</label>
      <div class="param-row">
        <input type="range" class="custom-slider" id="param_${p.id}"
          min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}">
        <input type="number" class="param-number" id="num_${p.id}"
          min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}"
          aria-label="${p.label} (número)">
      </div>
    </div>
  `;
}

/**
 * Enlaza slider e input numérico; llama onChange(id, value).
 * @param {string[]} ids
 * @param {(id: string, value: number) => void} onChange
 */
export function bindParamControls(ids, onChange) {
  ids.forEach((id) => {
    const range = document.getElementById(`param_${id}`);
    const num = document.getElementById(`num_${id}`);
    if (!range || !num) return;

    const apply = (raw, source) => {
      let v = parseFloat(raw);
      if (!Number.isFinite(v)) return;
      const min = parseFloat(range.min);
      const max = parseFloat(range.max);
      v = Math.min(max, Math.max(min, v));
      // redondeo al step
      const step = parseFloat(range.step) || 0.1;
      const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
      v = Number(v.toFixed(decimals));
      range.value = String(v);
      num.value = String(v);
      onChange(id, v, source);
    };

    range.addEventListener('input', () => apply(range.value, 'range'));
    num.addEventListener('change', () => apply(num.value, 'number'));
    num.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply(num.value, 'number');
      }
    });
  });
}

/** Desafíos desactivados en la UI (no-op). */
export function clearChallenges(ui) {
  if (ui && typeof ui.setChallenges === 'function') {
    ui.setChallenges('');
  }
}
