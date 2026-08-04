/**
 * @fileoverview params-schema — panel de parámetros declarativo (§2.7).
 *
 * Sustituye tres mecanismos superpuestos:
 *
 * - `renderParams()` escrito a mano en cada uno de los 27 módulos,
 * - el `setTimeout(…, 0)` que cada uno usaba para enlazar sus controles
 *   *después* de que la app inyectara el HTML,
 * - y las 145 líneas de `enhanceParamsPanel` (`module-ui.js:518-662`), que
 *   reconstruían a posteriori la fila slider+número y llegaban a definir una
 *   `Object.defineProperty` sobre un nodo del DOM (línea 583).
 *
 * Aquí el módulo declara un esquema y un único renderizador construye el
 * panel, lo enlaza y escribe en `this.params`. Sin `setTimeout`, sin reflexión
 * sobre el DOM y sin duplicar el marcado 27 veces.
 *
 * @example
 * static params = [
 *   { id:'m',  label:'Masa', latex:'m', unit:'kg', min:0.1, max:10, step:0.1, value:1 },
 *   { id:'mode', type:'select', label:'Modo', options:[{value:'a',label:'A'}] }
 * ];
 */

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Decimales implícitos en el paso, para no mostrar 0.30000000000000004. */
function decimalsOf(step) {
  const s = String(step);
  return s.includes('.') ? Math.min(s.split('.')[1].length, 8) : 0;
}

/**
 * Normaliza el esquema: acepta el array de §2.7 y también el objeto
 * `{id: {…}}`, que es como algunos módulos ya tenían escritos sus parámetros.
 * @param {Array|object} schema
 * @returns {Array<object>}
 */
export function normalizeSchema(schema) {
  if (!schema) return [];
  if (Array.isArray(schema)) return schema.filter((p) => p && p.id);
  return Object.entries(schema).map(([id, def]) => ({ id, ...def }));
}

/**
 * Valores iniciales del esquema, listos para `this.params`.
 * @param {Array|object} schema
 * @returns {Object<string, number|string|boolean>}
 */
export function defaultValues(schema) {
  const out = {};
  for (const p of normalizeSchema(schema)) {
    out[p.id] = p.value ?? (p.type === 'checkbox' ? false : p.type === 'select' ? p.options?.[0]?.value : p.min ?? 0);
  }
  return out;
}

/**
 * Marcado de un control. Reutiliza las clases del CSS existente
 * (`control-group`, `param-row`, `custom-slider`, `param-number`) para que el
 * panel siga viéndose igual sin tocar la hoja de estilos.
 * @param {object} p
 * @param {*} value
 */
function controlHtml(p, value) {
  const type = p.type || 'range';
  // `$…$` activa el typeset de KaTeX que ya hace `ui.setParams`.
  const labelText = p.latex ? `$${p.latex}$${p.label ? ' ' + escapeHtml(p.label) : ''}` : escapeHtml(p.label || p.id);
  const unit = p.unit ? ` <span class="param-unit">${escapeHtml(p.unit)}</span>` : '';
  const label = `<label class="control-label" for="param_${p.id}">${labelText}${unit}</label>`;

  if (type === 'select') {
    const options = (p.options || [])
      .map((o) => {
        const v = o.value ?? o;
        const l = o.label ?? o;
        return `<option value="${escapeHtml(v)}"${v === value ? ' selected' : ''}>${escapeHtml(l)}</option>`;
      })
      .join('');
    return `<div class="control-group param-control" data-param="${p.id}">${label}
      <select id="param_${p.id}" class="custom-select">${options}</select>
    </div>`;
  }

  if (type === 'checkbox') {
    return `<div class="control-group param-control param-check" data-param="${p.id}">
      <label class="control-label checkbox-label" for="param_${p.id}">
        <input type="checkbox" id="param_${p.id}"${value ? ' checked' : ''}> ${labelText}${unit}
      </label>
    </div>`;
  }

  if (type === 'button') {
    return `<div class="control-group param-control" data-param="${p.id}">
      <button type="button" class="ctrl-btn" id="param_${p.id}">${escapeHtml(p.label || p.id)}</button>
    </div>`;
  }

  const min = p.min ?? 0;
  const max = p.max ?? 1;
  const step = p.step ?? 0.1;
  return `<div class="control-group param-control" data-param="${p.id}">${label}
    <div class="param-row">
      <input type="range" class="custom-slider" id="param_${p.id}"
        min="${min}" max="${max}" step="${step}" value="${value}">
      <input type="number" class="param-number" id="num_${p.id}"
        min="${min}" max="${max}" step="${step}" value="${value}"
        inputmode="decimal" aria-label="Valor de ${escapeHtml(p.label || p.id)}">
    </div>
  </div>`;
}

/**
 * Construye el HTML completo del panel a partir del esquema.
 * @param {Array|object} schema
 * @param {Object<string, *>} values
 * @returns {string}
 */
export function renderSchemaHtml(schema, values = {}) {
  return normalizeSchema(schema)
    .map((p) => controlHtml(p, values[p.id] ?? p.value ?? p.min ?? 0))
    .join('\n');
}

/**
 * Enlaza los controles ya presentes en `root` al objeto de valores.
 *
 * A diferencia del patrón anterior, esto se llama **inmediatamente después**
 * de inyectar el HTML: los nodos ya existen, así que el `setTimeout(…, 0)`
 * sobra.
 *
 * @param {ParentNode} root
 * @param {Array|object} schema
 * @param {Object<string, *>} values - Se muta en el sitio (es `this.params`).
 * @param {(id: string, value: *, param: object) => void} [onChange]
 * @returns {() => void} Función para desenlazar.
 */
export function bindSchema(root, schema, values, onChange = () => {}) {
  if (!root) return () => {};
  const params = normalizeSchema(schema);
  /** @type {Array<[Element, string, EventListener]>} */
  const bound = [];
  const on = (el, ev, fn) => {
    el.addEventListener(ev, fn);
    bound.push([el, ev, fn]);
  };

  for (const p of params) {
    const el = root.querySelector(`#param_${CSS.escape(p.id)}`);
    if (!el) continue;
    const type = p.type || 'range';

    if (type === 'select') {
      on(el, 'change', () => {
        values[p.id] = el.value;
        onChange(p.id, el.value, p);
      });
      continue;
    }

    if (type === 'checkbox') {
      on(el, 'change', () => {
        values[p.id] = el.checked;
        onChange(p.id, el.checked, p);
      });
      continue;
    }

    if (type === 'button') {
      on(el, 'click', () => onChange(p.id, true, p));
      continue;
    }

    const num = root.querySelector(`#num_${CSS.escape(p.id)}`);
    const decimals = decimalsOf(p.step ?? 0.1);
    const apply = (raw) => {
      // Coma decimal: el teclado numérico en español la emite y `parseFloat`
      // la corta en seco (2,5 → 2).
      let v = parseFloat(String(raw).replace(',', '.'));
      if (!Number.isFinite(v)) return;
      if (p.min != null) v = Math.max(p.min, v);
      if (p.max != null) v = Math.min(p.max, v);
      v = Number(v.toFixed(decimals));
      el.value = String(v);
      if (num) num.value = String(v);
      values[p.id] = v;
      onChange(p.id, v, p);
    };

    on(el, 'input', () => apply(el.value));
    if (num) {
      on(num, 'change', () => apply(num.value));
      on(num, 'keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          apply(num.value);
        }
      });
    }
  }

  return () => {
    for (const [el, ev, fn] of bound) el.removeEventListener(ev, fn);
    bound.length = 0;
  };
}

/**
 * Refleja en los controles un cambio hecho desde el código (por ejemplo al
 * restaurar un trabajo guardado o al vincular los dos lados de §2.9).
 * @param {ParentNode} root
 * @param {Array|object} schema
 * @param {Object<string, *>} values
 */
export function syncSchema(root, schema, values) {
  if (!root) return;
  for (const p of normalizeSchema(schema)) {
    const v = values[p.id];
    if (v === undefined) continue;
    const el = root.querySelector(`#param_${CSS.escape(p.id)}`);
    if (!el) continue;
    if ((p.type || 'range') === 'checkbox') el.checked = !!v;
    else el.value = String(v);
    const num = root.querySelector(`#num_${CSS.escape(p.id)}`);
    if (num) num.value = String(v);
  }
}
