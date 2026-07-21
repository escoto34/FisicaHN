/**
 * Panel y modal de trabajos (guardados + importados + evaluación).
 */

import {
  listWorks,
  deleteWork,
  importWorksJSON,
  exportWorksJSON,
  getWork,
  syncTeacherExamWorks,
  archiveExamWorksForTeacher
} from './works.js';
import {
  CHALLENGE_MODULE_LABELS,
  normalizeChallengePack,
  exportChallengePackJSON,
  setCachedExamChallengePack
} from './challenges.js';

/** Poll de trabajos en vivo (solo docente con examen activo). */
let examSyncTimer = null;
/** Clave schoolKey|examCode del poll actual (evita reinicios en bucle). */
let examSyncKey = null;
/** Overlay del modal (opcional; el poll sigue en segundo plano). */
let examSyncOverlay = null;
const EXAM_SYNC_MS = 5000;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ICONS = {
  saved: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M17 21v-8H7v8M7 3v5h8" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  imported: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  exam: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  cloud: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4M12 17h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
};

function workOrigin(w) {
  if (w._fromCloud || w.examLive || w.examArchived || w.source === 'imported' || w._importVerified != null) {
    return 'imported';
  }
  if (w.mode === 'exam') return 'exam';
  if (w.cloudSynced) return 'cloud';
  return 'saved';
}

function categoryLabel(w) {
  if (w.examArchived) return 'Examen · archivado (evaluar)';
  if (w.examLive || (w._fromCloud && w.mode === 'exam' && !w.examArchived)) {
    return 'Examen · en vivo';
  }
  const o = workOrigin(w);
  if (o === 'imported') {
    if (w._importVerified === false) return 'Importado · sello dudoso';
    if (w._importVerified === true) return 'Importado · sello OK';
    return 'Importado';
  }
  if (o === 'exam') return 'Examen';
  if (o === 'cloud') return 'Guardado · nube';
  return 'Guardado';
}

function iconFor(w) {
  const o = workOrigin(w);
  if (o === 'imported' && w._importVerified === false) return ICONS.warn;
  if (o === 'imported') return ICONS.imported;
  if (o === 'exam') return ICONS.exam;
  if (o === 'cloud') return ICONS.cloud;
  return ICONS.saved;
}

function originClass(w) {
  const o = workOrigin(w);
  if (o === 'imported' && w._importVerified === false) return 'is-warn';
  return `is-${o}`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-HN', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch {
    return iso || '—';
  }
}

/** Marca de tiempo del trabajo (guardado / importado / archivo). */
function workTimestamp(w) {
  const raw = w?.savedAt || w?.importedAt || w?.archivedAt || w?.createdAt || 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Código del examen actual en este dispositivo (docente activo o sesión unida).
 * @returns {string|null}
 */
export function getCurrentExamCode() {
  try {
    // Lazy: evita import circular en carga inicial
    const sessionRaw = localStorage.getItem('fisicahn_session_v1');
    const session = sessionRaw ? JSON.parse(sessionRaw) : null;
    if (session?.mode === 'exam' && session?.examCode) {
      return String(session.examCode);
    }
    const teacherRaw = localStorage.getItem('fisicahn_teacher_v1');
    const rec = teacherRaw ? JSON.parse(teacherRaw) : null;
    if (rec?.examActive && rec?.examCode) return String(rec.examCode);
    const tokRaw = localStorage.getItem('fisicahn_exam_token_v1');
    const tok = tokRaw ? JSON.parse(tokRaw) : null;
    if (tok?.active && tok?.code) return String(tok.code);
  } catch {
    /* ignore */
  }
  return null;
}

/** ¿El trabajo pertenece al examen actual? */
function isWorkFromCurrentExam(w, examCode = getCurrentExamCode()) {
  if (!examCode || !w) return false;
  return String(w.examCode || '') === String(examCode);
}

function describe(w) {
  const examCode = getCurrentExamCode();
  const examTag =
    examCode && isWorkFromCurrentExam(w, examCode)
      ? `Examen actual (${examCode})`
      : w.examCode
        ? `Examen ${w.examCode}`
        : null;
  return [
    w.moduleTitle || w.moduleId || 'Módulo',
    w.studentName || null,
    w.schoolName || null,
    examTag,
    formatDate(w.savedAt || w.importedAt)
  ]
    .filter(Boolean)
    .join(' · ');
}

export function renderWorksSidebar(host, opts = {}) {
  if (!host) return;
  const limit = opts.limit ?? 8;
  const works = listWorks().slice(0, limit);
  const total = listWorks().length;

  if (!works.length) {
    host.innerHTML = `
      <p class="placeholder-text">
        Aún no hay trabajos. Usa <strong>Guardar trabajo</strong> en un módulo.
      </p>`;
    return;
  }

  host.innerHTML =
    works
      .map(
        (w) => `
    <article class="work-item ${originClass(w)}" data-id="${escapeHtml(w.id)}">
      <span class="work-item-icon" aria-hidden="true">${iconFor(w)}</span>
      <div class="work-item-body">
        <div class="work-item-title">${escapeHtml(w.name)}</div>
        <div class="work-item-meta">${escapeHtml(categoryLabel(w))}</div>
        <div class="work-item-desc">${escapeHtml(describe(w))}</div>
      </div>
      <button type="button" class="work-del" data-del="${escapeHtml(w.id)}" aria-label="Eliminar trabajo">×</button>
    </article>`
      )
      .join('') +
    (total > limit
      ? `<p class="works-more-hint">${total - limit} más — “Ver mis trabajos”.</p>`
      : '');

  host.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('¿Eliminar este trabajo de la caché?')) {
        deleteWork(btn.dataset.del);
        renderWorksSidebar(host, opts);
        const modalList = document.getElementById('worksModalList');
        if (modalList) {
          const overlay = document.getElementById('worksModal');
          overlay?._paint?.();
        }
        updateWorksCountBadges();
      }
    });
  });
}

/**
 * @param {HTMLElement} host
 * @param {{
 *   filter?: 'all'|'saved'|'imported',
 *   sort?: 'time-desc'|'time-asc',
 *   examScope?: 'all'|'current'|'other',
 *   evaluate?: boolean
 * }} opts
 */
export function renderWorksList2(host, opts = {}) {
  if (!host) return;
  const filter = opts.filter || 'all';
  const sort = opts.sort || 'time-desc';
  const examScope = opts.examScope || 'all';
  const evaluate = opts.evaluate !== false;
  const currentExam = getCurrentExamCode();
  let works = listWorks();

  if (filter === 'saved') {
    works = works.filter((w) => workOrigin(w) !== 'imported');
  } else if (filter === 'imported') {
    works = works.filter((w) => workOrigin(w) === 'imported');
  }

  if (currentExam && examScope === 'current') {
    works = works.filter((w) => isWorkFromCurrentExam(w, currentExam));
  } else if (currentExam && examScope === 'other') {
    works = works.filter((w) => !isWorkFromCurrentExam(w, currentExam));
  }

  // Tiempo: mayor→menor = más reciente primero; menor→mayor = más antiguo primero
  works.sort((a, b) => {
    const da = workTimestamp(a);
    const db = workTimestamp(b);
    return sort === 'time-asc' ? da - db : db - da;
  });

  if (!works.length) {
    let emptyExtra = '';
    if (filter === 'imported') emptyExtra = ' importados';
    else if (filter === 'saved') emptyExtra = ' guardados';
    if (currentExam && examScope === 'current') emptyExtra += ' del examen actual';
    else if (currentExam && examScope === 'other') emptyExtra += ' fuera del examen actual';
    host.innerHTML = `
      <div class="works-list2-empty">
        <p>No hay trabajos${emptyExtra}.</p>
        <p class="placeholder-text">Guarda un trabajo en un módulo de simulación o cambia los filtros.</p>
      </div>`;
    return;
  }

  host.innerHTML = `
    <div class="works-list2" role="list">
      <div class="works-list2-sep" aria-hidden="true"></div>
      ${works
        .map(
          (w) => `
        <div class="works-list2-row ${originClass(w)}" role="listitem" data-id="${escapeHtml(w.id)}">
          <div class="works-list2-meta">
            <span class="works-list2-icon">${iconFor(w)}</span>
            <div>
              <h3 class="works-list2-title">${escapeHtml(w.name)}</h3>
              <p class="works-list2-cat">${escapeHtml(categoryLabel(w))}</p>
            </div>
          </div>
          <p class="works-list2-desc">${escapeHtml(describe(w))}${
            w.notes ? ` — ${escapeHtml(String(w.notes).slice(0, 80))}` : ''
          }</p>
          <div class="works-list2-actions">
            <button type="button" class="works-list2-btn primary" data-open="${escapeHtml(w.id)}" title="Abrir en el módulo con parámetros guardados">
              Abrir en módulo
            </button>
            ${
              evaluate
                ? `<button type="button" class="works-list2-btn" data-eval="${escapeHtml(w.id)}">
              Detalles
            </button>`
                : ''
            }
            <button type="button" class="works-list2-btn danger" data-del="${escapeHtml(w.id)}">Eliminar</button>
          </div>
        </div>
        <div class="works-list2-sep" aria-hidden="true"></div>`
        )
        .join('')}
    </div>`;

  host.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.open;
      if (typeof window.FisicaHNOpenWork === 'function') {
        window.FisicaHNOpenWork(id);
      } else {
        alert('No se pudo abrir el módulo. Recarga la app.');
      }
    });
  });
  host.querySelectorAll('[data-eval]').forEach((btn) => {
    btn.addEventListener('click', () => showWorkEvaluation(btn.dataset.eval));
  });
  host.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm('¿Eliminar este trabajo?')) {
        deleteWork(btn.dataset.del);
        renderWorksList2(host, opts);
        const side = document.getElementById('worksList');
        if (side) renderWorksSidebar(side, opts);
        updateWorksCountBadges();
        openWorksModal._onChanged?.();
      }
    });
  });
}

/** Vista de evaluación del trabajo (para docentes / revisión). */
export function showWorkEvaluation(id) {
  const w = getWork(id);
  if (!w) {
    alert('Trabajo no encontrado.');
    return;
  }
  const lines = [
    '—— Evaluación del trabajo ——',
    `Nombre: ${w.name}`,
    `Módulo: ${w.moduleTitle || w.moduleId}`,
    `Origen: ${categoryLabel(w)}`,
    `Alumno: ${w.studentName || '—'}`,
    `Colegio: ${w.schoolName || '—'}`,
    `Modo: ${w.mode || 'practice'}`,
    w.examCode ? `Código examen: ${w.examCode}` : null,
    `Guardado: ${formatDate(w.savedAt)}`,
    w.importedAt ? `Importado: ${formatDate(w.importedAt)}` : null,
    w._importReason ? `Verificación sello: ${w._importReason}` : null,
    w.integrityWeak ? 'Aviso: sello débil en este navegador' : null,
    w.notes ? `Notas: ${w.notes}` : null,
    w.cloudSynced ? 'Sincronizado en la nube: sí' : null,
    `ID: ${w.id}`,
    w.integrity ? `Sello: ${String(w.integrity).slice(0, 40)}…` : null
  ].filter(Boolean);

  if (w.snapshot && typeof w.snapshot === 'object') {
    try {
      const snap = JSON.stringify(w.snapshot, null, 2);
      lines.push('', '—— Estado del módulo (snapshot) ——', snap.slice(0, 1200) + (snap.length > 1200 ? '\n…' : ''));
    } catch {
      /* ignore */
    }
  }

  alert(lines.join('\n'));
}

export function updateWorksCountBadges() {
  const works = listWorks();
  const imported = works.filter((w) => workOrigin(w) === 'imported').length;
  const saved = works.length - imported;
  document.querySelectorAll('[data-works-count]').forEach((el) => {
    el.textContent = String(works.length);
  });
  document.querySelectorAll('[data-works-saved]').forEach((el) => {
    el.textContent = String(saved);
  });
  document.querySelectorAll('[data-works-imported]').forEach((el) => {
    el.textContent = String(imported);
  });
}

/**
 * @param {{
 *   filter?: 'all'|'saved'|'imported',
 *   hub?: boolean,
 *   onChanged?: () => void
 * }} opts
 * hub=true: módulo Mis trabajos (import/export + código examen online)
 * filter default from sidebar: 'saved'
 */
export function openWorksModal(opts = {}) {
  const initialFilter = opts.filter || (opts.hub ? 'all' : 'saved');
  const hub = Boolean(opts.hub);

  let overlay = document.getElementById('worksModal');
  if (opts.onChanged) openWorksModal._onChanged = opts.onChanged;

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'worksModal';
    overlay.className = 'works-modal';
    overlay.innerHTML = `
      <div class="works-modal-card" role="dialog" aria-labelledby="worksModalTitle" aria-modal="true">
        <header class="works-modal-header">
          <div>
            <h2 id="worksModalTitle">Mis trabajos</h2>
            <p class="works-modal-lead">
              <span class="works-modal-counts">
                Total <strong data-works-count>0</strong> ·
                Guardados <strong data-works-saved>0</strong> ·
                Importados <strong data-works-imported>0</strong>
              </span>
            </p>
          </div>
          <button type="button" class="works-modal-close" id="worksModalClose" aria-label="Cerrar">×</button>
        </header>
        <div id="worksExamBar" class="works-exam-bar" hidden>
          <div>
            <strong>Código de examen</strong>
            <p class="works-exam-hint">Solo docentes verificados pueden generar. Alumnos: unirse desde Cuenta.</p>
            <div class="works-exam-code" id="worksExamCode">———</div>
            <p class="works-exam-msg" id="worksExamMsg" hidden></p>
            <p class="works-exam-hint" id="worksExamSyncHint" hidden></p>
          </div>
          <div class="works-exam-actions">
            <button type="button" class="ctrl-btn primary" id="worksGenExamBtn">Generar código</button>
            <button type="button" class="ctrl-btn" id="worksSyncExamBtn" title="Traer trabajos de alumnos">Actualizar clase</button>
            <button type="button" class="ctrl-btn" id="worksEndExamBtn">Finalizar</button>
          </div>
          <div id="worksChallengeEditor" class="works-challenge-editor" hidden>
            <h3 class="works-challenge-title">Retos del examen</h3>
            <p class="works-exam-hint">
              Elige un módulo y añade preguntas, o importa un JSON de retos. Puedes exportar el formulario para reutilizarlo.
            </p>
            <div class="works-challenge-row">
              <label>
                Módulo
                <select id="worksChModule"></select>
              </label>
              <label>
                Tipo
                <select id="worksChType">
                  <option value="numeric">Numérico</option>
                  <option value="multiple">Opción múltiple</option>
                  <option value="select">Lista desplegable</option>
                </select>
              </label>
            </div>
            <label class="works-challenge-full">
              Pregunta
              <textarea id="worksChQuestion" rows="2" placeholder="Enunciado del reto"></textarea>
            </label>
            <div class="works-challenge-row" id="worksChAnswerRow">
              <label>
                Respuesta (número o índice 0-based)
                <input type="text" id="worksChAnswer" placeholder="ej. 5 o 1">
              </label>
              <label>
                Unidad
                <input type="text" id="worksChUnit" placeholder="m/s²">
              </label>
              <label>
                Puntos
                <input type="number" id="worksChPoints" value="10" min="1" max="100">
              </label>
            </div>
            <label class="works-challenge-full" id="worksChOptionsWrap" hidden>
              Opciones (una por línea; la respuesta es el índice empezando en 0)
              <textarea id="worksChOptions" rows="3" placeholder="Opción A&#10;Opción B&#10;Opción C"></textarea>
            </label>
            <label class="works-challenge-full">
              Pista
              <input type="text" id="worksChHint" placeholder="Opcional">
            </label>
            <div class="works-exam-actions">
              <button type="button" class="ctrl-btn primary" id="worksChAddBtn">Añadir reto</button>
              <button type="button" class="ctrl-btn" id="worksChExportBtn">Exportar JSON</button>
              <button type="button" class="ctrl-btn" id="worksChImportBtn">Importar JSON</button>
              <button type="button" class="ctrl-btn" id="worksChPublishBtn">Publicar en examen</button>
              <input type="file" id="worksChImportFile" accept="application/json,.json" hidden>
            </div>
            <div id="worksChList" class="works-challenge-list"></div>
          </div>
        </div>
        <div class="works-modal-filters-wrap">
          <div class="works-modal-filters" role="tablist" aria-label="Origen">
            <button type="button" class="works-filter" data-filter="all">Todos</button>
            <button type="button" class="works-filter" data-filter="saved">Guardados</button>
            <button type="button" class="works-filter" data-filter="imported">Importados</button>
          </div>
          <div class="works-modal-filters works-modal-filters-sort" role="group" aria-label="Orden por tiempo">
            <span class="works-filter-label">Tiempo</span>
            <button type="button" class="works-filter" data-sort="time-desc" title="Más recientes primero">Mayor → menor</button>
            <button type="button" class="works-filter" data-sort="time-asc" title="Más antiguos primero">Menor → mayor</button>
          </div>
          <div class="works-modal-filters works-modal-filters-exam" role="group" aria-label="Examen actual" hidden>
            <span class="works-filter-label">Examen</span>
            <button type="button" class="works-filter" data-exam-scope="all">Cualquiera</button>
            <button type="button" class="works-filter" data-exam-scope="current">Examen actual</button>
            <button type="button" class="works-filter" data-exam-scope="other">No en examen actual</button>
          </div>
        </div>
        <div id="worksModalList" class="works-modal-body"></div>
        <footer class="works-modal-footer">
          <button type="button" class="ctrl-btn" id="worksModalImport" hidden>Importar JSON</button>
          <button type="button" class="ctrl-btn" id="worksModalExport" hidden>Exportar JSON</button>
          <button type="button" class="ctrl-btn primary" id="worksModalDone">Cerrar</button>
        </footer>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => {
      overlay.hidden = true;
      document.body.classList.remove('works-modal-open');
      // No detener el poll: el docente sigue recibiendo trabajos de la clase.
    };
    overlay.querySelector('#worksModalClose').addEventListener('click', close);
    overlay.querySelector('#worksModalDone').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay._filter = 'saved';
    overlay._sort = 'time-desc';
    overlay._examScope = 'all';
    overlay._hub = false;

    const listEl = () => overlay.querySelector('#worksModalList');

    const syncFilterButtons = () => {
      overlay.querySelectorAll('.works-filter[data-filter]').forEach((b) => {
        b.classList.toggle('active', b.dataset.filter === overlay._filter);
      });
      overlay.querySelectorAll('.works-filter[data-sort]').forEach((b) => {
        b.classList.toggle('active', b.dataset.sort === overlay._sort);
      });
      overlay.querySelectorAll('.works-filter[data-exam-scope]').forEach((b) => {
        b.classList.toggle('active', b.dataset.examScope === overlay._examScope);
      });
      const examRow = overlay.querySelector('.works-modal-filters-exam');
      const code = getCurrentExamCode();
      if (examRow) {
        examRow.hidden = !code;
        if (!code && overlay._examScope !== 'all') {
          overlay._examScope = 'all';
        }
        // etiqueta con código actual
        const curBtn = examRow.querySelector('[data-exam-scope="current"]');
        if (curBtn && code) {
          curBtn.textContent = `Examen actual (${code})`;
        }
      }
    };

    /** Solo repinta la lista (sin reiniciar poll). */
    const paintList = () => {
      renderWorksList2(listEl(), {
        filter: overlay._filter,
        sort: overlay._sort || 'time-desc',
        examScope: overlay._examScope || 'all',
        evaluate: true
      });
      updateWorksCountBadges();
      syncFilterButtons();
      const imp = overlay.querySelector('#worksModalImport');
      const exp = overlay.querySelector('#worksModalExport');
      if (imp) imp.hidden = !overlay._hub;
      if (exp) exp.hidden = !overlay._hub;
    };
    const paint = () => {
      paintList();
      refreshExamBar(overlay);
    };
    overlay._paint = paint;
    overlay._paintList = paintList;
    overlay._syncFilterButtons = syncFilterButtons;

    overlay.querySelectorAll('.works-filter[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay._filter = btn.dataset.filter || 'all';
        paintList();
      });
    });
    overlay.querySelectorAll('.works-filter[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay._sort = btn.dataset.sort || 'time-desc';
        paintList();
      });
    });
    overlay.querySelectorAll('.works-filter[data-exam-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay._examScope = btn.dataset.examScope || 'all';
        paintList();
      });
    });

    overlay.querySelector('#worksModalImport')?.addEventListener('click', () => {
      document.getElementById('importWorksFile')?.click();
    });
    overlay.querySelector('#worksModalExport')?.addEventListener('click', () => {
      const works = listWorks();
      if (!works.length) {
        alert('No hay trabajos para exportar.');
        return;
      }
      const { count, filename } = exportWorksJSON(works);
      alert(`Se descargaron ${count} trabajo(s):\n${filename}`);
    });

    overlay.querySelector('#worksGenExamBtn')?.addEventListener('click', () => generateExamFromHub(overlay));
    overlay.querySelector('#worksEndExamBtn')?.addEventListener('click', () => endExamFromHub(overlay));
    overlay.querySelector('#worksSyncExamBtn')?.addEventListener('click', () => manualSyncExamWorks(overlay));
    bindChallengeEditor(overlay);
  }

  overlay._filter = initialFilter;
  if (!overlay._sort) overlay._sort = 'time-desc';
  if (!overlay._examScope) overlay._examScope = 'all';
  overlay._hub = hub;
  overlay.hidden = false;
  document.body.classList.add('works-modal-open');
  // Preferir Importados si hay examen en curso; sync al abrir
  Promise.resolve()
    .then(async () => {
      try {
        const auth = await import('./auth.js');
        const st = auth.getExamStatus();
        const session = auth.getSession();
        const code =
          (st.active && st.code) ||
          (session?.mode === 'exam' && session?.examCode) ||
          null;
        if (code && (initialFilter === 'saved' || !opts.filter)) {
          overlay._filter = 'imported';
        }
        // Con examen activo, resaltar trabajos de ese código si el usuario no eligió otro alcance
        if (code && opts.examScope) {
          overlay._examScope = opts.examScope;
        }
      } catch {
        /* ignore */
      }
      if (opts.sort) overlay._sort = opts.sort;
      overlay._paint?.();
      ensureTeacherExamSync();
    })
    .catch(() => {
      overlay._paint?.();
    });
}

/** Botón para expandir/plegar el editor de retos (móvil). */
function ensureChallengeEditorToggle(overlay, editor) {
  if (!editor || editor.dataset.toggleBound === '1') return;
  editor.dataset.toggleBound = '1';
  let btn = overlay.querySelector('#worksChToggleBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'worksChToggleBtn';
    btn.className = 'ctrl-btn works-ch-toggle';
    btn.textContent = 'Retos del examen';
    editor.parentElement?.insertBefore(btn, editor);
  }
  const syncLabel = () => {
    const collapsed = editor.classList.contains('is-collapsed');
    btn.textContent = collapsed ? 'Mostrar retos del examen' : 'Ocultar retos del examen';
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  };
  btn.addEventListener('click', () => {
    editor.classList.toggle('is-collapsed');
    editor.dataset.userExpanded = editor.classList.contains('is-collapsed') ? '0' : '1';
    syncLabel();
  });
  syncLabel();
}

/** Draft de retos del docente en el hub (antes/durante el examen). */
function getChallengeDraft() {
  try {
    return JSON.parse(localStorage.getItem('fisicahn_challenge_draft_v1') || 'null') || {
      schema: 1,
      type: 'fisicahn-challenge-pack',
      modules: {}
    };
  } catch {
    return { schema: 1, type: 'fisicahn-challenge-pack', modules: {} };
  }
}

function saveChallengeDraft(pack) {
  localStorage.setItem('fisicahn_challenge_draft_v1', JSON.stringify(normalizeChallengePack(pack)));
}

async function refreshExamBar(overlay) {
  const bar = overlay?.querySelector('#worksExamBar');
  if (!bar) return;

  try {
    const { getSession, getExamStatus } = await import('./auth.js');
    const session = getSession();
    // Solo docentes ven la barra de crear código
    if (!session || session.role !== 'teacher') {
      bar.hidden = true;
      return;
    }
    // Hub o examen activo: mostrar controles de clase
    const st = getExamStatus();
    const code =
      st.active && st.code
        ? st.code
        : session.examCode && session.mode === 'exam'
          ? session.examCode
          : null;
    if (!overlay._hub && !code) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const codeEl = overlay.querySelector('#worksExamCode');
    if (codeEl) codeEl.textContent = code || '———';
    const editor = overlay.querySelector('#worksChallengeEditor');
    // En móvil el editor de retos empieza plegado para no bloquear la lista
    if (editor) {
      editor.hidden = false;
      ensureChallengeEditorToggle(overlay, editor);
      const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
      if (narrow && editor.dataset.userExpanded !== '1') {
        editor.classList.add('is-collapsed');
      }
    }
    renderChallengeDraftList(overlay);

    const hint = overlay.querySelector('.works-exam-hint');
    if (hint) {
      hint.textContent =
        'Genera un código en línea. Los trabajos de los alumnos llegan a Importados. Usa «Actualizar clase» o espera el auto-sync cada 5 s.';
    }

    if (code && session.schoolKey) {
      startExamWorksPolling(session.schoolKey, code, overlay);
    }
  } catch {
    bar.hidden = true;
  }
}

export function stopExamWorksPolling() {
  if (examSyncTimer) {
    clearInterval(examSyncTimer);
    examSyncTimer = null;
  }
  examSyncKey = null;
  examSyncOverlay = null;
}

/**
 * Poll en segundo plano de trabajos de examen (docente).
 * No reinicia si ya corre el mismo schoolKey+código (evita bucles).
 */
export function startExamWorksPolling(schoolKey, examCode, overlay) {
  if (!schoolKey) return;
  const key = `${schoolKey}|${examCode || ''}`;
  if (overlay) examSyncOverlay = overlay;

  if (examSyncTimer && examSyncKey === key) {
    // Ya hay poll: solo actualiza referencia del modal
    return;
  }

  if (examSyncTimer) {
    clearInterval(examSyncTimer);
    examSyncTimer = null;
  }
  examSyncKey = key;

  const tick = async () => {
    try {
      const r = await syncTeacherExamWorks({ schoolKey, examCode });
      const ov = examSyncOverlay || document.getElementById('worksModal');
      const hint = ov?.querySelector?.('#worksExamSyncHint');
      if (hint) {
        hint.hidden = false;
        const t = new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        hint.textContent = `Clase en vivo · ${t}: +${r.added} · −${r.removed} · ~${r.updated} · total ${r.total}`;
      }
      // Solo lista — NO refreshExamBar (evitaba bucle de re-sync)
      if (ov && !ov.hidden) {
        if (typeof ov._paintList === 'function') ov._paintList();
        else if (typeof ov._paint === 'function') ov._paint();
      }
      updateWorksCountBadges();
      const side = document.getElementById('worksList');
      if (side) renderWorksSidebar(side);
      // Badge del catálogo
      try {
        window.dispatchEvent(
          new CustomEvent('fisicahn:exam-works-sync', { detail: r })
        );
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore red */
    }
  };
  tick();
  examSyncTimer = setInterval(tick, EXAM_SYNC_MS);
}

/**
 * Arranca o reanuda el poll si el docente tiene examen activo.
 * Llamar al iniciar la app y al crear un código.
 */
export async function ensureTeacherExamSync() {
  try {
    const { getSession, getExamStatus } = await import('./auth.js');
    const session = getSession();
    if (!session || session.role !== 'teacher' || !session.schoolKey) return;
    const st = getExamStatus();
    const code =
      st.active && st.code
        ? st.code
        : session.examCode && session.mode === 'exam'
          ? session.examCode
          : null;
    if (!code) return;
    startExamWorksPolling(session.schoolKey, code, document.getElementById('worksModal'));
  } catch {
    /* ignore */
  }
}

async function manualSyncExamWorks(overlay) {
  const msg = overlay.querySelector('#worksExamMsg');
  try {
    const { getSession, getExamStatus } = await import('./auth.js');
    const session = getSession();
    const st = getExamStatus();
    const code = st.code || session?.examCode;
    if (!session?.schoolKey) throw new Error('Falta el colegio en la sesión docente.');
    // Forzar un tick aunque el poll ya exista
    examSyncKey = null;
    const r = await syncTeacherExamWorks({ schoolKey: session.schoolKey, examCode: code });
    startExamWorksPolling(session.schoolKey, code, overlay);
    if (msg) {
      msg.hidden = false;
      msg.className = 'works-exam-msg ok';
      msg.textContent = `Sincronizado: ${r.added} nuevos, ${r.removed} eliminados por alumnos, ${r.total} en total.`;
    }
    if (typeof overlay._paintList === 'function') overlay._paintList();
    else overlay._paint?.();
    updateWorksCountBadges();
  } catch (e) {
    if (msg) {
      msg.hidden = false;
      msg.className = 'works-exam-msg err';
      msg.textContent = e.message || 'No se pudo sincronizar';
    }
  }
}

async function generateExamFromHub(overlay) {
  const msg = overlay.querySelector('#worksExamMsg');
  const setMsg = (t, ok) => {
    if (!msg) return;
    msg.hidden = !t;
    msg.textContent = t || '';
    msg.className = 'works-exam-msg' + (ok ? ' ok' : ' err');
  };
  setMsg('');

  try {
    const auth = await import('./auth.js');
    const session = auth.getSession();
    if (!session || session.role !== 'teacher') {
      throw new Error('Solo un docente verificado puede crear códigos. Entra en Cuenta → Docente.');
    }
    const code = await auth.createExamCodeOnline();
    const codeEl = overlay.querySelector('#worksExamCode');
    if (codeEl) codeEl.textContent = code;
    // Publicar pack de retos si hay borrador
    const draft = getChallengeDraft();
    if (Object.keys(draft.modules || {}).some((k) => draft.modules[k]?.length)) {
      try {
        const { upsertExamChallengePack } = await import('./supabase-client.js');
        await upsertExamChallengePack({
          examCode: code,
          schoolKey: session.schoolKey,
          pack: draft
        });
        setCachedExamChallengePack(draft, code);
      } catch {
        /* pack opcional */
      }
    }
    setMsg(`Código ${code} activo. Compártelo con la clase. Los trabajos llegan a Importados.`, true);
    window.dispatchEvent(new CustomEvent('fisicahn:session', { detail: auth.getSession() }));
    // Forzar poll inmediato con el código nuevo
    examSyncKey = null;
    if (session.schoolKey) startExamWorksPolling(session.schoolKey, code, overlay);
    refreshExamBar(overlay);
    // Preferir pestaña Importados para ver la clase
    overlay._filter = 'imported';
    overlay._paintList?.();
  } catch (e) {
    setMsg(e.message || 'Error al generar código', false);
  }
}

async function endExamFromHub(overlay) {
  try {
    const auth = await import('./auth.js');
    const st = auth.getExamStatus();
    const code = st.code || auth.getSession()?.examCode || null;
    stopExamWorksPolling();
    // Cierra en la nube + este dispositivo; los alumnos salen solos vía poll
    const result = auth.endExamSession({ archiveWorks: true, endCloud: true });
    if (result?.done) {
      try {
        await result.done;
      } catch {
        /* ignore */
      }
    }
    const codeEl = overlay.querySelector('#worksExamCode');
    if (codeEl) codeEl.textContent = '———';
    const msg = overlay.querySelector('#worksExamMsg');
    if (msg) {
      msg.hidden = false;
      msg.textContent =
        'Examen finalizado en todos los dispositivos. Los JSON de los alumnos quedan en Mis trabajos (importados) para que los evalúes.';
      msg.className = 'works-exam-msg ok';
    }
    overlay._paint?.();
    updateWorksCountBadges();
    try {
      window.dispatchEvent(new CustomEvent('fisicahn:session', { detail: auth.getSession() }));
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

function bindChallengeEditor(overlay) {
  const modSel = overlay.querySelector('#worksChModule');
  if (modSel && !modSel.options.length) {
    for (const [key, label] of Object.entries(CHALLENGE_MODULE_LABELS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      modSel.appendChild(opt);
    }
    // Preferidos con casos de uso primero
    modSel.value = 'dynamics';
  }

  const typeSel = overlay.querySelector('#worksChType');
  typeSel?.addEventListener('change', () => {
    const multi = typeSel.value === 'multiple' || typeSel.value === 'select';
    const wrap = overlay.querySelector('#worksChOptionsWrap');
    if (wrap) wrap.hidden = !multi;
  });

  overlay.querySelector('#worksChAddBtn')?.addEventListener('click', () => {
    addChallengeFromForm(overlay);
  });
  overlay.querySelector('#worksChExportBtn')?.addEventListener('click', () => {
    const draft = getChallengeDraft();
    const { filename } = exportChallengePackJSON(draft);
    alert(`Exportado: ${filename}`);
  });
  overlay.querySelector('#worksChImportBtn')?.addEventListener('click', () => {
    overlay.querySelector('#worksChImportFile')?.click();
  });
  overlay.querySelector('#worksChImportFile')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const pack = normalizeChallengePack(data);
      saveChallengeDraft(pack);
      renderChallengeDraftList(overlay);
      alert(
        `Importados retos en ${Object.keys(pack.modules).length} módulo(s).`
      );
    } catch (err) {
      alert(err.message || 'JSON inválido');
    }
  });
  overlay.querySelector('#worksChPublishBtn')?.addEventListener('click', () =>
    publishChallengePack(overlay)
  );
}

function addChallengeFromForm(overlay) {
  const moduleId = overlay.querySelector('#worksChModule')?.value || 'dynamics';
  const type = overlay.querySelector('#worksChType')?.value || 'numeric';
  const question = String(overlay.querySelector('#worksChQuestion')?.value || '').trim();
  const answerRaw = String(overlay.querySelector('#worksChAnswer')?.value || '').trim();
  const unit = String(overlay.querySelector('#worksChUnit')?.value || '').trim();
  const points = parseInt(overlay.querySelector('#worksChPoints')?.value || '10', 10) || 10;
  const hint = String(overlay.querySelector('#worksChHint')?.value || '').trim();
  const optionsText = String(overlay.querySelector('#worksChOptions')?.value || '');

  if (question.length < 3) {
    alert('Escribe la pregunta del reto.');
    return;
  }

  const challenge = {
    id: `${moduleId}-${Date.now().toString(36)}`,
    type,
    question,
    points,
    hint,
    module: moduleId
  };

  if (type === 'numeric') {
    const n = parseFloat(answerRaw);
    if (!Number.isFinite(n)) {
      alert('La respuesta numérica no es válida.');
      return;
    }
    challenge.answer = n;
    if (unit) challenge.unit = unit;
  } else {
    const options = optionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length < 2) {
      alert('Añade al menos 2 opciones (una por línea).');
      return;
    }
    const idx = parseInt(answerRaw, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) {
      alert(`La respuesta debe ser el índice 0–${options.length - 1}.`);
      return;
    }
    challenge.options = options;
    challenge.answer = idx;
  }

  const draft = getChallengeDraft();
  if (!draft.modules[moduleId]) draft.modules[moduleId] = [];
  draft.modules[moduleId].push(challenge);
  saveChallengeDraft(draft);
  if (overlay.querySelector('#worksChQuestion')) overlay.querySelector('#worksChQuestion').value = '';
  if (overlay.querySelector('#worksChAnswer')) overlay.querySelector('#worksChAnswer').value = '';
  if (overlay.querySelector('#worksChHint')) overlay.querySelector('#worksChHint').value = '';
  if (overlay.querySelector('#worksChOptions')) overlay.querySelector('#worksChOptions').value = '';
  renderChallengeDraftList(overlay);
}

function renderChallengeDraftList(overlay) {
  const host = overlay.querySelector('#worksChList');
  if (!host) return;
  const draft = getChallengeDraft();
  const modules = draft.modules || {};
  const keys = Object.keys(modules).filter((k) => modules[k]?.length);
  if (!keys.length) {
    host.innerHTML = '<p class="placeholder-text">Ningún reto en el formulario todavía.</p>';
    return;
  }
  host.innerHTML = keys
    .map((mod) => {
      const label = CHALLENGE_MODULE_LABELS[mod] || mod;
      const items = modules[mod]
        .map(
          (c, i) => `
        <li>
          <span>${escapeHtml(c.question.slice(0, 80))}${c.question.length > 80 ? '…' : ''}</span>
          <button type="button" class="work-del" data-ch-mod="${escapeHtml(mod)}" data-ch-i="${i}" aria-label="Quitar reto">×</button>
        </li>`
        )
        .join('');
      return `<div class="works-challenge-mod"><strong>${escapeHtml(label)}</strong> (${modules[mod].length})<ul>${items}</ul></div>`;
    })
    .join('');

  host.querySelectorAll('[data-ch-mod]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mod = btn.dataset.chMod;
      const i = parseInt(btn.dataset.chI, 10);
      const d = getChallengeDraft();
      if (d.modules[mod]) {
        d.modules[mod].splice(i, 1);
        if (!d.modules[mod].length) delete d.modules[mod];
        saveChallengeDraft(d);
        renderChallengeDraftList(overlay);
      }
    });
  });
}

async function publishChallengePack(overlay) {
  const msg = overlay.querySelector('#worksExamMsg');
  try {
    const { getSession, getExamStatus } = await import('./auth.js');
    const session = getSession();
    const st = getExamStatus();
    const code = st.code || session?.examCode;
    if (!code) throw new Error('Genera o activa un código de examen primero.');
    if (!session?.schoolKey) throw new Error('Falta el colegio en la sesión.');
    const draft = getChallengeDraft();
    const { upsertExamChallengePack } = await import('./supabase-client.js');
    const r = await upsertExamChallengePack({
      examCode: code,
      schoolKey: session.schoolKey,
      pack: draft
    });
    if (!r.ok) throw new Error(r.error || 'No se pudo publicar el pack');
    setCachedExamChallengePack(draft, code);
    if (msg) {
      msg.hidden = false;
      msg.className = 'works-exam-msg ok';
      msg.textContent = 'Retos publicados en la nube para este examen.';
    }
  } catch (e) {
    if (msg) {
      msg.hidden = false;
      msg.className = 'works-exam-msg err';
      msg.textContent = e.message || 'Error al publicar retos';
    }
  }
}

export function bindWorksPanelControls(handlers = {}) {
  const fileInput = document.getElementById('importWorksFile');
  const viewBtn = document.getElementById('viewWorksListBtn');
  const side = document.getElementById('worksList');

  const refresh = () => {
    if (side) renderWorksSidebar(side);
    updateWorksCountBadges();
    const overlay = document.getElementById('worksModal');
    if (overlay && !overlay.hidden) overlay._paint?.();
    handlers.onChanged?.();
  };

  // Botón opcional (panel derecho eliminado; queda el hub y la barra lateral)
  viewBtn?.addEventListener('click', () => openWorksModal({ filter: 'saved', hub: false }));

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const result = await importWorksJSON(file);
      refresh();
      openWorksModal._onChanged?.();
      if (result.added === 0) {
        alert(`No se añadió ningún trabajo nuevo.\nTotal: ${result.total}`);
      } else {
        alert(`Importados: ${result.added}.\nTotal: ${result.total}`);
        openWorksModal({ filter: 'imported', hub: true });
      }
    } catch (e) {
      console.error(e);
      alert(e?.message || 'No se pudo importar el JSON.');
    }
  });

  refresh();
  return { refresh };
}
