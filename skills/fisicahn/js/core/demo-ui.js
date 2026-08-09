/**
 * WAVE 9 §9.1 — UI de grabación/reproducción de demos.
 *
 * Capa de presentación (habita en core/ porque construye DOM; la regla
 * «no DOM en módulos» de §3.1 aplica solo a js/modules).
 *
 * La sección «Demo» del panel lateral:
 *   ● Grabar      — muestras en el grid de 1/sampleRate (tiempo simulado)
 *   ▶ Reproducir  — timeline determinista sobre el snapshot del host
 *   ⬇ Exportar / ⬆ Importar / 🗂 Mis demos — JSON ligero (KB, no vídeo)
 *
 * Los módulos legacy sin getState/setState solo guardan parámetros: la
 * reproducción es visual (misma configuración que al grabar).
 */

import {
  DemoRecorder,
  DemoStore,
  replayDemo,
  demoFromJson,
  downloadDemo,
} from './demo-recorder.js';
import { recordWebm, downloadBlob, exportPngSequence } from './screen-recorder.js';

const ICON_PLAY =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20"/></svg>';
const ICON_REC =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>';

const SPEED_OPTS = [0.5, 1, 2, 4];

let hooks = {};
let recorder = null;
let lastDemo = null;
let playing = null;

function byId(id) {
  return document.getElementById(id);
}

/**
 * @param {object} h Hooks del host (app.js)
 * @param {() => string|null} h.getModuleId   catálogo activo (null en pizarra)
 * @param {() => object} h.snapshot           uiParams + moduleState actuales
 * @param {() => object|null} h.engine        motot PhysicsEngine
 * @param {(id: string) => Promise<void>} h.openModule
 * @param {() => object|null} h.getInstance   instancia del módulo activo
 * @param {(ui: object) => void} h.setUi      aplicar sliders (fallback)
 * @param {() => boolean} h.isWhiteboard
 * @param {() => void} h.onTransportChanged   refresh de botones de pausa
 * @returns {{ tick(): void }} para enganchar al bucle de física
 */
export function initDemoUI(h) {
  hooks = h;
  buildDom();
  bind();
  return { tick: () => recorder?.tick?.() };
}

function buildDom() {
  const host = document.getElementById('rightPanel');
  if (!host) return;
  const section = document.createElement('section');
  section.className = 'panel-section';
  section.innerHTML = `
    <h3 class="panel-title">Demo</h3>
    <div class="btn-row" id="demoRecRow">
      <button type="button" class="ctrl-btn primary" id="demoRecBtn" title="Grabar la simulación como demo jugable">
        ${ICON_REC}<span>Grabar</span>
      </button>
      <button type="button" class="ctrl-btn" id="demoPlayBtn" disabled title="Reproducir la última demo (o la primera de Mis demos)">
        ${ICON_PLAY}<span>Reproducir</span>
      </button>
    </div>
    <div class="btn-row" id="demoFileRow">
      <button type="button" class="ctrl-btn ctrl-btn-small" id="demoSaveBtn" disabled>⬇ Exportar</button>
      <button type="button" class="ctrl-btn ctrl-btn-small" id="demoImportBtn">⬆ Importar</button>
      <button type="button" class="ctrl-btn ctrl-btn-small" id="demoGalleryBtn">🗂 Mis demos</button>
    </div>
    <div class="btn-row" id="videoRecRow">
      <button type="button" class="ctrl-btn ctrl-btn-small" id="videoRecBtn" title="WebM del lienzo (MediaRecorder)">
        🎬 Vídeo
      </button>
      <button type="button" class="ctrl-btn ctrl-btn-small" id="pngSeqBtn" title="Descargar 12 fotogramas PNG">
        PNG ×12
      </button>
    </div>
    <div class="demo-timeline" id="demoTimeline" hidden>
      <input type="range" id="demoProgress" class="custom-slider" min="0" max="100" value="0" step="0.5"
        aria-label="Progreso de la demo" title="Duración simulada">
      <div class="demo-meta-row">
        <span id="demoTimeLabel">0.0 / 0.0 s</span>
        <label class="demo-speed-label">Velocidad
          <select id="demoSpeed" class="demo-speed-select" aria-label="Velocidad de reproducción">
            ${SPEED_OPTS.map((s) => `<option value="${s}">${s}×</option>`).join('')}
          </select>
        </label>
      </div>
    </div>
    <input type="file" id="demoImportFile" accept="application/json,.json" hidden>
  `;
  host.appendChild(section);
}

function bind() {
  byId('demoRecBtn')?.addEventListener('click', toggleRecording);
  byId('demoPlayBtn')?.addEventListener('click', () => playDemo(lastDemo || galleryFirst()));
  byId('demoSaveBtn')?.addEventListener('click', exportDemo);
  byId('demoImportBtn')?.addEventListener('click', () => byId('demoImportFile')?.click());
  byId('demoImportFile')?.addEventListener('change', onImportFile);
  byId('demoGalleryBtn')?.addEventListener('click', showGallery);
  byId('videoRecBtn')?.addEventListener('click', toggleVideoRec);
  byId('pngSeqBtn')?.addEventListener('click', capturePngSequence);
}

/* ---------- Vídeo (W9.2) ---------- */

let videoRec = null;

function toggleVideoRec() {
  const canvas = hooks.engine?.()?.canvas || document.getElementById('simCanvas');
  if (!canvas || typeof canvas.captureStream !== 'function') {
    showHint('Tu navegador no soporta captura de vídeo (seguir con demos JSON).');
    return;
  }
  if (videoRec) {
    stopVideoRec();
    return;
  }
  try {
    videoRec = recordWebm(canvas, {
      fps: 30,
      durationMs: 0,
      onProgress: (pct) => updateVideoUi(true, pct),
    });
    void videoRec.start();
    updateVideoUi(true, 0);
  } catch (e) {
    videoRec = null;
    showHint('No se pudo iniciar el vídeo: ' + (e?.message || e));
  }
}

async function stopVideoRec() {
  const ctl = videoRec;
  videoRec = null;
  if (!ctl) return;
  updateVideoUi(false, 100);
  const { blob } = await ctl.stop();
  const name = `fisicahn-${hooks.getModuleId?.() || 'sim'}-${Date.now()}.webm`;
  downloadBlob(blob, name);
  showHint(`Vídeo WebM descargado (${(blob.size / 1024 / 1024).toFixed(1)} MB).`);
  updateVideoUi(false, 0);
}

function updateVideoUi(on, pct) {
  const btn = byId('videoRecBtn');
  if (!btn) return;
  btn.textContent = on ? `⏹ Parar vídeo ${pct ? Math.round(pct) + '%' : ''}` : '🎬 Vídeo';
  btn.classList.toggle('recording-active', on);
}

async function capturePngSequence() {
  const canvas = hooks.engine?.()?.canvas || document.getElementById('simCanvas');
  if (!canvas) {
    showHint('No hay lienzo activo.');
    return;
  }
  showHint('Descargando 12 fotogramas PNG…');
  try {
    await exportPngSequence(canvas, { count: 12, scale: 1, frameMs: 60 });
  } catch (e) {
    showHint('Secuencia PNG interrumpida: ' + (e?.message || e));
  }
}

/* ---------- Grabación ---------- */

function toggleRecording() {
  if (recorder?.isRecording) stopRecording();
  else startRecording();
}

function startRecording() {
  if (hooks.isWhiteboard?.()) {
    showHint('La pizarra no tiene tiempo simulado: no se puede grabar.');
    return;
  }
  const moduleId = hooks.getModuleId?.();
  if (!moduleId) return;
  stopPlayback();
  const engine = hooks.engine?.();
  recorder = new (demoRecorderClass())({
    getTime: () => engine?.getElapsed?.() ?? 0,
    sample: () => hooks.snapshot?.(),
    moduleId,
  });
  engine?.pause?.();
  recorder.start();
  updateRecUi();
}

function demoRecorderClass() {
  return DemoRecorder;
}

function stopRecording() {
  const demo = recorder?.stop?.();
  recorder = null;
  if (!demo || !demo.samples || demo.samples.length < 2) {
    showHint('La grabación quedó más corta que un intervalo de muestreo.');
    updateRecUi();
    return;
  }
  lastDemo = demo;
  let saved = null;
  try {
    saved = DemoStore.save(demo);
  } catch {
    /* sin almacenamiento, se puede exportar igual */
  }
  byId('demoSaveBtn').disabled = false;
  byId('demoPlayBtn').disabled = false;
  showHint(
    `Demo: ${demo.samples.length} instantes · ${demo.duration.toFixed(1)} s${saved ? ' · guardada en Mis demos' : ''}`
  );
  updateRecUi();
}

function updateRecUi() {
  const btn = byId('demoRecBtn');
  if (!btn) return;
  const rec = recorder?.isRecording ?? false;
  btn.innerHTML = rec
    ? `${ICON_REC}<span>Parar</span>`
    : `${ICON_REC}<span>Grabar</span>`;
  btn.classList.toggle('recording-active', rec);
  btn.title = rec
    ? 'Parar la grabación'
    : 'Grabar la simulación como demo jugable';
}

/* ---------- Reproducción ---------- */

/**
 * @param {object} demo objeto v1
 */
function playDemo(demo) {
  stopPlayback();
  const engine = hooks.engine?.();
  if (!demo || !engine) return;
  const moduleId = demo.moduleId;
  const adapter = {
    resetSample: () => {
      if (moduleId && moduleId !== hooks.getModuleId?.() && hooks.openModule) {
        void hooks.openModule(moduleId).then(() => engine.pause?.());
      } else {
        engine.pause?.();
        engine.reset?.();
        engine.requestPaint?.();
      }
      hooks.onTransportChanged?.();
    },
    applySample: (params, moduleState) => {
      const inst = hooks.getInstance?.();
      if (inst && typeof inst.setState === 'function' && moduleState) {
        try {
          inst.setState(moduleState);
        } catch (err) {
          console.warn('demo: setState', err);
          if (params && typeof params === 'object') {
            hooks.setUiParams?.(params);
          }
        }
      } else if (params && typeof params === 'object') {
        hooks.setUiParams?.(params);
      }
      engine.requestPaint?.();
    },
    onDone: () => {
      playing = null;
      engine.pause?.();
      updatePlayUi(0, demo.duration);
      hooks.onTransportChanged?.();
    },
    onProgress: (pct) => updatePlayUi(pct, demo.duration),
  };
  try {
    playing = replayDemo(demo, adapter, {
      speed: Number(document.getElementById('demoSpeed')?.value || 1),
    });
    byId('demoPlayBtn')?.classList.add('replaying');
  } catch (e) {
    showHint(e?.message || String(e));
  }
}

function stopPlayback() {
  if (!playing) return;
  try {
    if (typeof playing.pause === 'function') playing.pause();
  } catch {
    /* live */
  }
  playing = null;
  byId('demoPlayBtn')?.classList.remove('replaying');
}

function updatePlayUi(pct, duration) {
  const bar = byId('demoProgress');
  const label = byId('demoTimeLabel');
  const t = (pct / 100) * (duration || 0);
  if (bar) bar.value = String(Math.min(100, Math.max(0, pct)));
  if (label) label.textContent = `${t.toFixed(1)} / ${(duration || 0).toFixed(1)} s`;
}

function galleryFirst() {
  const list = DemoStore.list();
  return list?.[0]?.demo || null;
}

/* ---------- Archivos ---------- */

function exportDemo() {
  if (!lastDemo) return;
  try {
    const name = `fisicahn-demo-${lastDemo.moduleId}-${Date.now()}.json`;
    downloadDemo(lastDemo, name);
    showHint('Descargado como JSON (KB, no vídeo).');
  } catch (e) {
    showHint(e?.message || 'No se pudo exportar.');
  }
}

function onImportFile(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  file
    .text()
    .then((text) => {
      const demo = demoFromJson(text);
      if (!demo) throw new Error('El archivo no es una demo v1.');
      lastDemo = demo;
      byId('demoSaveBtn').disabled = false;
      byId('demoPlayBtn').disabled = false;
      showHint(
        `Importada: ${demo.moduleId} · ${demo.samples.length} instantes · ${demo.duration.toFixed(1)} s`
      );
    })
    .catch((e) => showHint(e?.message || 'Import fallido.'));
}

/* ---------- Mis demos ---------- */

function showGallery() {
  const list = DemoStore.list();
  const overlay = document.createElement('div');
  overlay.className = 'session-gate';
  overlay.innerHTML = `
    <div class="session-gate-card" role="dialog" aria-labelledby="demoGalleryTitle">
      <h2 id="demoGalleryTitle">Mis demos</h2>
      <p class="session-gate-lead">Reproducir o borrar demos guardadas en este equipo.</p>
      <div class="demo-gallery-list">
        ${list
          .map(
            (e) => `
          <div class="demo-gallery-item" data-id="${escAttr(e.id)}">
            <span class="demo-gallery-name">${escAttr(e.moduleId)}</span>
            <span class="demo-gallery-meta">${e.demo.samples.length} inst · ${e.demo.duration.toFixed(1)} s</span>
            <span class="demo-gallery-actions">
              <button type="button" class="ctrl-btn ctrl-btn-small" data-action="replay">▶ Abrir</button>
              <button type="button" class="ctrl-btn ctrl-btn-small" data-action="drop" aria-label="Eliminar">🗑</button>
            </span>
          </div>`
          )
          .join('')}
      </div>
      <div class="gate-actions">
        <button type="button" class="gate-btn secondary" id="demoGalleryClose">Cerrar</button>
      </div>
    </div>`;
  if (!list.length) {
    overlay.querySelector('.demo-gallery-list').innerHTML =
      '<p class="placeholder-text">Aún no hay demos en este equipo.</p>';
  }
  document.body.appendChild(overlay);
  overlay.querySelector('#demoGalleryClose')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('[data-id]');
      const demo = item && DemoStore.get(item.dataset.id);
      if (!demo) return;
      overlay.remove();
      if (btn.dataset.action === 'play') {
        lastDemo = demo;
        byId('demoPlayBtn').disabled = false;
        playDemo(demo);
      } else {
        DemoStore.delete(item.dataset.id);
        showGallery();
      }
    });
  });
}

function escAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function showHint(msg) {
  if (!msg) return;
  alert(msg);
}