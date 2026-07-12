/**
 * Indicador Online / Offline + botón Reconectar (esquina superior del menú).
 * Montable en varios hosts (catálogo y barra del simulador).
 */

import { probeConnectivity, clearProbeCache } from './supabase-client.js';

const hosts = new Set();
let current = {
  browserOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  configured: false,
  cloud: false,
  status: 'unknown',
  message: 'Comprobando…',
  latencyMs: null
};
let probing = false;
let bound = false;

const SVG_WIFI = `
<svg class="net-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path d="M5 12.55a11 11 0 0 1 14.08 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M1.42 9a16 16 0 0 1 21.16 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <circle cx="12" cy="20" r="1.4" fill="currentColor"/>
</svg>`;

const SVG_WIFI_OFF = `
<svg class="net-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path d="M1 1l22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M10.71 5.05A16 16 0 0 1 22.58 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <circle cx="12" cy="20" r="1.4" fill="currentColor"/>
</svg>`;

function labelFor(state) {
  if (probing || state.status === 'connecting') return 'Conectando…';
  if (!state.browserOnline || state.status === 'offline') return 'Offline';
  if (state.status === 'cloud') return 'Online';
  if (state.status === 'local') return 'Online';
  if (state.status === 'error') return 'Sin nube';
  return '…';
}

function titleFor(state) {
  return state.message || labelFor(state);
}

function cssClass(state) {
  if (probing) return 'is-connecting';
  if (!state.browserOnline || state.status === 'offline') return 'is-offline';
  if (state.status === 'cloud') return 'is-cloud';
  if (state.status === 'local') return 'is-local';
  if (state.status === 'error') return 'is-error';
  return 'is-unknown';
}

function renderHost(el) {
  if (!el) return;
  const st = current;
  const offline = !st.browserOnline || st.status === 'offline';
  const showReconnect = offline || st.status === 'error' || st.status === 'local' || st.status === 'unknown';
  const icon = offline || st.status === 'error' ? SVG_WIFI_OFF : SVG_WIFI;
  const lbl = labelFor(st);

  el.innerHTML = `
    <div class="network-status ${cssClass(st)}" role="status" aria-live="polite" title="${escapeAttr(titleFor(st))}">
      <button type="button" class="net-reconnect-btn" data-net-reconnect ${showReconnect ? '' : 'hidden'}
        ${probing ? 'disabled' : ''} title="Comprobar de nuevo la conexión">
        Reconectar
      </button>
      <span class="net-indicator">
        ${icon}
        <span class="net-label">${escapeHtml(lbl)}</span>
      </span>
    </div>
  `;

  const btn = el.querySelector('[data-net-reconnect]');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      reconnect();
    });
  }
}

function paintAll() {
  hosts.forEach((el) => {
    if (document.contains(el)) renderHost(el);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

export function mountNetworkStatus(el) {
  if (!el) return;
  hosts.add(el);
  ensureListeners();
  renderHost(el);
}

export function getNetworkState() {
  return { ...current, probing };
}

export async function refreshNetworkStatus(opts = {}) {
  if (probing && !opts.force) return current;
  probing = true;
  current = { ...current, status: 'connecting', message: 'Comprobando conexión…' };
  paintAll();
  try {
    if (opts.force) clearProbeCache();
    current = await probeConnectivity({ force: true, timeoutMs: opts.timeoutMs || 8000 });
  } catch {
    current = {
      browserOnline: navigator.onLine,
      configured: false,
      cloud: false,
      status: navigator.onLine ? 'error' : 'offline',
      message: 'Error al comprobar la red',
      latencyMs: null
    };
  } finally {
    probing = false;
    paintAll();
  }
  return current;
}

export async function reconnect() {
  return refreshNetworkStatus({ force: true });
}

function ensureListeners() {
  if (bound) return;
  bound = true;
  window.addEventListener('online', () => {
    refreshNetworkStatus({ force: true });
  });
  window.addEventListener('offline', () => {
    current = {
      browserOnline: false,
      configured: current.configured,
      cloud: false,
      status: 'offline',
      message: 'Sin conexión a internet',
      latencyMs: null
    };
    paintAll();
  });
}

/**
 * Monta en #networkStatusCatalog y #networkStatusSim si existen, y hace el primer probe.
 */
export function initNetworkStatusUI() {
  ensureListeners();
  const catalog = document.getElementById('networkStatusCatalog');
  const sim = document.getElementById('networkStatusSim');
  if (catalog) mountNetworkStatus(catalog);
  if (sim) mountNetworkStatus(sim);
  // Primer estado rápido del navegador, luego probe async
  current = {
    browserOnline: navigator.onLine,
    configured: false,
    cloud: false,
    status: navigator.onLine ? 'unknown' : 'offline',
    message: navigator.onLine ? 'Comprobando…' : 'Sin conexión a internet',
    latencyMs: null
  };
  paintAll();
  refreshNetworkStatus({ force: true });
}
