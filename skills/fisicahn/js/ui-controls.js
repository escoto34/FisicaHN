/**
 * ui-controls.js — Panel de control interactivo
 * Módulo para crear sliders, botones, selects y gestionar eventos táctiles/ratón.
 */

const CALLBACKS = new Map();

function emit(event, data) {
  const cbs = CALLBACKS.get(event) || [];
  cbs.forEach(fn => fn(data));
}

export function onChange(event, fn) {
  if (!CALLBACKS.has(event)) CALLBACKS.set(event, []);
  CALLBACKS.get(event).push(fn);
}

export function offChange(event, fn) {
  const cbs = CALLBACKS.get(event);
  if (!cbs) return;
  CALLBACKS.set(event, cbs.filter(f => f !== fn));
}

export class UIControls {
  constructor(rootEl) {
    this.root = rootEl;
    this.controls = new Map();
  }

  createSlider(container, { id, label, min, max, step, default: def, unit }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'control-slider';

    const labelEl = document.createElement('label');
    labelEl.className = 'slider-label';
    labelEl.textContent = label || id;

    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.textContent = (def ?? 0).toFixed(2) + (unit ? ` ${unit}` : '');

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider-input';
    input.id = id;
    input.min = min ?? 0;
    input.max = max ?? 100;
    input.step = step ?? 0.1;
    input.value = def ?? 0;

    const fill = document.createElement('div');
    fill.className = 'slider-fill';

    const updateValue = () => {
      const v = parseFloat(input.value);
      valueEl.textContent = v.toFixed(2) + (unit ? ` ${unit}` : '');
      fill.style.width = ((v - input.min) / (input.max - input.min)) * 100 + '%';
      emit(`${id}:change`, v);
    };

    const pointerMove = (e) => {
      e.preventDefault();
      const rect = input.getBoundingClientRect();
      const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
      let ratio = Math.max(0, Math.min(1, x / rect.width));
      let val = input.min + ratio * (input.max - input.min);
      val = Math.round(val / input.step) * input.step;
      val = Math.max(+input.min, Math.min(+input.max, val));
      input.value = val;
      updateValue();
    };

    const pointerUp = () => {
      document.removeEventListener('mousemove', pointerMove);
      document.removeEventListener('mouseup', pointerUp);
      document.removeEventListener('touchmove', pointerMove);
      document.removeEventListener('touchend', pointerUp);
    };

    const pointerDown = (e) => {
      e.preventDefault();
      pointerMove(e);
      document.addEventListener('mousemove', pointerMove);
      document.addEventListener('mouseup', pointerUp);
      document.addEventListener('touchmove', pointerMove, { passive: false });
      document.addEventListener('touchend', pointerUp);
    };

    input.addEventListener('input', updateValue);
    input.addEventListener('mousedown', pointerDown);
    input.addEventListener('touchstart', pointerDown, { passive: false });

    wrapper.appendChild(labelEl);
    wrapper.appendChild(valueEl);
    wrapper.appendChild(input);
    wrapper.appendChild(fill);

    if (container) container.appendChild(wrapper);
    else this.root.appendChild(wrapper);

    this.controls.set(id, { input, valueEl, wrapper });
    return { wrapper, input, valueEl };
  }

  createButton(container, { id, label, icon }) {
    const btn = document.createElement('button');
    btn.className = 'control-btn';
    btn.id = id;
    if (icon) {
      const iconEl = document.createElement('span');
      iconEl.className = 'btn-icon';
      iconEl.innerHTML = icon;
      btn.appendChild(iconEl);
    }
    const textEl = document.createElement('span');
    textEl.className = 'btn-label';
    textEl.textContent = label || id;
    btn.appendChild(textEl);

    btn.addEventListener('click', () => emit(`${id}:click`, { id }));

    if (container) container.appendChild(btn);
    else this.root.appendChild(btn);

    this.controls.set(id, { btn });
    return btn;
  }

  createSelect(container, { id, label, options }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'control-select';

    const labelEl = document.createElement('label');
    labelEl.className = 'select-label';
    labelEl.textContent = label || id;

    const select = document.createElement('select');
    select.className = 'select-input';
    select.id = id;

    options?.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.value ?? opt;
      el.textContent = opt.label ?? opt;
      select.appendChild(el);
    });

    select.addEventListener('change', () => {
      emit(`${id}:change`, select.value);
    });

    wrapper.appendChild(labelEl);
    wrapper.appendChild(select);

    if (container) container.appendChild(wrapper);
    else this.root.appendChild(wrapper);

    this.controls.set(id, { select, wrapper });
    return { wrapper, select };
  }

  getValue(id) {
    const ctrl = this.controls.get(id);
    if (!ctrl) return null;
    if (ctrl.input) return parseFloat(ctrl.input.value);
    if (ctrl.select) return ctrl.select.value;
    return null;
  }

  setValue(id, val) {
    const ctrl = this.controls.get(id);
    if (!ctrl) return;
    if (ctrl.input) {
      ctrl.input.value = val;
      ctrl.input.dispatchEvent(new Event('input'));
    }
    if (ctrl.select) {
      ctrl.select.value = val;
    }
  }

  destroy() {
    this.controls.forEach((ctrl) => {
      ctrl.wrapper?.remove();
      ctrl.btn?.remove();
    });
    this.controls.clear();
  }
}
