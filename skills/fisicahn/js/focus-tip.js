/**
 * @fileoverview Etiqueta contextual para controles solo-icono (WAVE 25.3).
 *
 * El atributo `title` nativo no aparece con teclado ni en pantallas táctiles.
 * Esta pieza muestra el nombre accesible del control (aria-label) al recibir
 * foco por teclado o con una pulsación larga táctil, sin depender de `hover`.
 * Un único nodo flotante reutilizado: no toca el DOM de los controles.
 */

const SELECTOR = '.tool-btn[aria-label], .icon-btn[aria-label]';
const LONG_PRESS_MS = 450;

/** @returns {() => void} función de limpieza */
export function initFocusTips(root = document) {
  const tip = document.createElement('div');
  tip.className = 'focus-tip';
  tip.setAttribute('role', 'presentation');
  tip.hidden = true;
  document.body.appendChild(tip);

  let pressTimer = 0;
  let hideTimer = 0;

  const show = (/** @type {HTMLElement} */ el, ms = 0) => {
    tip.textContent = el.getAttribute('aria-label') || '';
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const above = r.top - tip.offsetHeight - 8;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(above >= 8 ? above : r.bottom + 8)}px`;
    clearTimeout(hideTimer);
    if (ms) hideTimer = window.setTimeout(hide, ms);
  };
  const hide = () => {
    tip.hidden = true;
    clearTimeout(hideTimer);
  };

  const onFocusIn = (/** @type {Event} */ e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest?.(SELECTOR));
    if (el && el.matches(':focus-visible')) show(el);
  };
  const onDown = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType !== 'touch') return;
    const el = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest?.(SELECTOR));
    if (!el) return;
    pressTimer = window.setTimeout(() => show(el, 1800), LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimer);

  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', hide);
  root.addEventListener('pointerdown', /** @type {EventListener} */ (onDown));
  root.addEventListener('pointerup', cancelPress);
  root.addEventListener('pointercancel', cancelPress);
  window.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());

  return () => {
    root.removeEventListener('focusin', onFocusIn);
    tip.remove();
  };
}
