/**
 * Trabajos del alumno:
 * - Web: localStorage
 * - Electron: archivo en userData vía IPC (fiable) + espejo localStorage
 */

import { sha256, getSession, logAudit, normalizeSchool } from './auth.js';

const WORKS_KEY = 'fisicahn_works_v1';

/** @type {Array|null} caché en memoria (fuente de verdad en runtime) */
let memoryList = null;
let hydrated = false;
let hydratePromise = null;

function isDesktopFile() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.FisicaHNDesktop?.isDesktop &&
      typeof window.FisicaHNDesktop.loadWorks === 'function' &&
      typeof window.FisicaHNDesktop.saveWorks === 'function'
  );
}

function storageAvailable() {
  try {
    const k = '__fisicahn_ls_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function readLocalStorage() {
  try {
    const raw = localStorage.getItem(WORKS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeLocalStorage(list) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(WORKS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * Carga la caché al arrancar (imprescindible en Electron).
 * Llamar desde app.init().
 */
export async function initWorksStorage() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    if (isDesktopFile()) {
      try {
        const fromFile = await window.FisicaHNDesktop.loadWorks();
        if (Array.isArray(fromFile) && fromFile.length) {
          memoryList = fromFile;
        } else {
          // Migrar desde localStorage si el archivo está vacío
          const fromLs = readLocalStorage();
          memoryList = fromLs;
          if (fromLs.length) {
            await window.FisicaHNDesktop.saveWorks(fromLs);
          }
        }
      } catch (e) {
        console.warn('Electron works load failed, using localStorage', e);
        memoryList = readLocalStorage();
      }
    } else {
      memoryList = readLocalStorage();
    }
    hydrated = true;
    return memoryList;
  })();
  return hydratePromise;
}

export function listWorks() {
  if (memoryList) return memoryList.slice();
  // Antes de hydrate: leer LS síncrono
  return readLocalStorage();
}

async function persistAll(list) {
  memoryList = Array.isArray(list) ? list : [];
  let ok = false;
  let detail = '';

  if (isDesktopFile()) {
    try {
      const res = await window.FisicaHNDesktop.saveWorks(memoryList);
      if (res && res.ok === false) {
        detail = res.error || 'Error al escribir archivo de trabajos';
      } else {
        ok = true;
      }
    } catch (e) {
      detail = e?.message || String(e);
    }
  }

  // Espejo localStorage (web y respaldo Electron)
  const lsOk = writeLocalStorage(memoryList);
  if (lsOk) ok = true;

  if (!ok) {
    throw new Error(
      detail ||
        'No se pudo guardar. En Electron comprueba permisos de userData; en web desactiva modo privado.'
    );
  }

  // Verificar lectura
  if (isDesktopFile()) {
    try {
      const again = await window.FisicaHNDesktop.loadWorks();
      if (Array.isArray(again) && again.length !== memoryList.length) {
        // no bloquear si el archivo se escribió pero load difiere por carrera
        console.warn('works verify length', again.length, memoryList.length);
      }
    } catch {
      /* ignore */
    }
  }
}

function saveAll(list) {
  // API síncrona legacy: actualiza memoria + best-effort LS; dispara persist async
  memoryList = Array.isArray(list) ? list : [];
  writeLocalStorage(memoryList);
  if (isDesktopFile()) {
    window.FisicaHNDesktop.saveWorks(memoryList).catch((e) =>
      console.error('saveWorks async', e)
    );
  } else if (!storageAvailable()) {
    throw new Error(
      'Este navegador bloquea localStorage (modo privado o permisos).'
    );
  }
  // Verificación LS solo en web
  if (!isDesktopFile()) {
    const check = readLocalStorage();
    if (check.length !== memoryList.length) {
      throw new Error('No se pudo verificar el guardado en localStorage.');
    }
  }
}

function payloadForHash(work) {
  return JSON.stringify({
    id: work.id,
    name: work.name,
    moduleId: work.moduleId,
    moduleTitle: work.moduleTitle,
    studentName: work.studentName,
    schoolName: work.schoolName,
    schoolKey: work.schoolKey,
    mode: work.mode,
    examCode: work.examCode || null,
    savedAt: work.savedAt,
    snapshot: work.snapshot,
    notes: work.notes || ''
  });
}

export async function computeIntegrity(work) {
  return sha256(payloadForHash(work));
}

export async function verifyWork(work) {
  if (!work || !work.integrity) return { ok: false, reason: 'Sin sello' };
  if (String(work.integrity).startsWith('unsigned_')) {
    return { ok: true, reason: 'Sello débil (cliente)' };
  }
  const expected = await computeIntegrity(work);
  return {
    ok: expected === work.integrity,
    reason: expected === work.integrity ? 'OK' : 'Sello alterado (posible edición manual)'
  };
}

/**
 * Guarda un trabajo nombrado del módulo actual.
 */
export async function saveWork(data) {
  await initWorksStorage();

  const session = getSession();
  const name = String(data.name || '').trim();
  if (name.length < 1) throw new Error('Pon un nombre al trabajo.');
  if (!data.moduleId) throw new Error('Módulo no identificado.');

  const studentName =
    session?.studentName ||
    session?.email ||
    data.studentName ||
    (session?.role === 'teacher' ? 'Docente' : 'Anónimo');
  const schoolName = session?.schoolName || data.schoolName || 'Sin colegio';
  const mode = session?.mode || 'practice';
  const examCode = session?.examCode || data.examCode || null;

  const work = {
    id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    moduleId: data.moduleId,
    moduleTitle: data.moduleTitle || data.moduleId,
    studentName,
    schoolName,
    schoolKey: normalizeSchool(schoolName),
    mode,
    examCode,
    savedAt: new Date().toISOString(),
    snapshot: data.snapshot || {},
    notes:
      data.notes ||
      (mode === 'exam'
        ? `Examen código ${examCode || '?'}`
        : isDesktopFile()
          ? 'Guardado en app de escritorio'
          : ''),
    integrity: '',
    source: 'local',
    platform: isDesktopFile() ? 'electron' : 'web'
  };

  try {
    work.integrity = await computeIntegrity(work);
  } catch (err) {
    console.warn('Integrity hash falló; se guarda sin sello fuerte:', err);
    work.integrity = `unsigned_${work.id}_${work.savedAt}`;
    work.integrityWeak = true;
  }

  const list = listWorks();
  list.unshift(work);
  while (list.length > 200) list.pop();
  await persistAll(list);
  logAudit('work_save', {
    id: work.id,
    name: work.name,
    moduleId: work.moduleId,
    mode,
    desktop: isDesktopFile()
  });

  try {
    const { uploadWorkToCloud } = await import('./supabase-client.js');
    const cloud = await uploadWorkToCloud({
      ...work,
      hash: work.integrity
    });
    if (cloud.ok) {
      work.cloudSynced = true;
      // re-persist con flag nube
      const again = listWorks().map((w) => (w.id === work.id ? { ...w, cloudSynced: true } : w));
      await persistAll(again);
      logAudit('work_cloud_sync', { id: work.id });
    } else if (!cloud.skipped) {
      logAudit('work_cloud_sync_fail', { id: work.id, error: cloud.error || 'unknown' });
    }
  } catch {
    /* sin nube */
  }

  return work;
}

export function deleteWork(id) {
  const prev = listWorks().find((w) => w.id === id) || null;
  const list = listWorks().filter((w) => w.id !== id);
  saveAll(list);
  if (isDesktopFile()) {
    window.FisicaHNDesktop.saveWorks(list).catch(() => {});
  }
  logAudit('work_delete', { id });

  // En examen: avisar a la nube para que el docente deje de verlo
  if (prev && (prev.mode === 'exam' || prev.examCode) && prev.examCode && prev.source !== 'exam-archive') {
    const examCode = prev.examCode;
    const localId = prev.cloudLocalId || prev.id;
    import('./supabase-client.js')
      .then(({ softDeleteWorkOnCloud }) =>
        softDeleteWorkOnCloud({ localId, examCode })
      )
      .then((r) => {
        if (r?.ok) logAudit('work_cloud_delete', { id: localId, examCode });
        else if (r && !r.skipped) logAudit('work_cloud_delete_fail', { id: localId, error: r.error });
      })
      .catch(() => {});
  }
}

/**
 * Convierte filas de student_works (Supabase) a trabajos locales del docente.
 */
export function cloudRowToWork(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const id = payload.id || row.local_id || row.id;
  return {
    id,
    name: payload.name || row.module_title || 'Trabajo de examen',
    moduleId: payload.moduleId || row.module_id || null,
    moduleTitle: payload.moduleTitle || row.module_title || row.module_id || 'Módulo',
    studentName: row.student_name || payload.studentName || 'Alumno',
    schoolName: row.school_name || payload.schoolName || null,
    schoolKey: row.school_key || payload.schoolKey || null,
    mode: row.mode || payload.mode || 'exam',
    examCode: row.exam_code || payload.examCode || null,
    savedAt: payload.savedAt || row.created_at || new Date().toISOString(),
    snapshot: payload.snapshot || {},
    notes: payload.notes || (row.exam_code ? `Examen código ${row.exam_code}` : ''),
    integrity: row.integrity_hash || payload.integrity || null,
    source: 'imported',
    examLive: !row.deleted_at,
    examArchived: false,
    cloudSynced: true,
    cloudRowId: row.id,
    cloudLocalId: row.local_id || payload.id || id,
    _fromCloud: true,
    deletedAt: row.deleted_at || null,
    importedAt: new Date().toISOString()
  };
}

/**
 * Sincroniza trabajos de examen del colegio en la PC del docente.
 * - Añade / actualiza filas vivas → Mis trabajos (importados)
 * - Si el alumno borró en su PC (deleted_at), quita la copia live del docente
 * - No toca trabajos ya archivados al cerrar el examen (examArchived)
 * @returns {Promise<{ added: number, removed: number, updated: number, total: number }>}
 */
export async function syncTeacherExamWorks({ schoolKey, examCode = null } = {}) {
  await initWorksStorage();
  if (!schoolKey) return { added: 0, removed: 0, updated: 0, total: listWorks().length };

  let rows = [];
  try {
    const { fetchTeacherWorks } = await import('./supabase-client.js');
    rows = await fetchTeacherWorks({ schoolKey, examCode, includeDeleted: true, limit: 300 });
  } catch {
    return { added: 0, removed: 0, updated: 0, total: listWorks().length, error: 'fetch' };
  }

  let list = listWorks();
  let added = 0;
  let removed = 0;
  let updated = 0;

  const liveById = new Map();
  const deletedIds = new Set();

  for (const row of rows) {
    const work = cloudRowToWork(row);
    if (row.deleted_at) {
      deletedIds.add(work.id);
      if (work.cloudLocalId) deletedIds.add(work.cloudLocalId);
    } else {
      liveById.set(work.id, work);
    }
  }

  // Quitar lives borrados por el alumno (no archivar)
  const before = list.length;
  list = list.filter((w) => {
    if (w.examArchived) return true;
    if (w.source === 'exam-archive') return true;
    const isLiveImport =
      w._fromCloud || w.examLive || (w.source === 'imported' && w.mode === 'exam' && w.cloudSynced);
    if (!isLiveImport) return true;
    if (deletedIds.has(w.id) || (w.cloudLocalId && deletedIds.has(w.cloudLocalId))) {
      return false;
    }
    return true;
  });
  removed = before - list.length;

  // Upsert lives
  const byId = new Map(list.map((w) => [w.id, w]));
  for (const [id, cloudWork] of liveById) {
    const existing = byId.get(id);
    if (existing?.examArchived || existing?.source === 'exam-archive') {
      continue;
    }
    if (!existing) {
      list.unshift(cloudWork);
      byId.set(id, cloudWork);
      added++;
    } else {
      const merged = {
        ...existing,
        ...cloudWork,
        source: existing.source === 'local' ? existing.source : 'imported',
        examLive: true,
        examArchived: false
      };
      const idx = list.findIndex((w) => w.id === id);
      if (idx >= 0) list[idx] = merged;
      updated++;
    }
  }

  while (list.length > 400) list.pop();
  await persistAll(list);
  logAudit('exam_works_sync', { added, removed, updated, schoolKey, examCode });
  return { added, removed, updated, total: list.length };
}

/**
 * Al finalizar el examen: congela los trabajos vivos en la PC del docente
 * para evaluación (ya no se borran si el alumno limpia su caché después).
 */
export async function archiveExamWorksForTeacher({ examCode = null } = {}) {
  await initWorksStorage();
  const list = listWorks().map((w) => {
    const matchExam = !examCode || w.examCode === examCode;
    const isLive =
      matchExam &&
      (w.examLive || w._fromCloud || (w.mode === 'exam' && w.source === 'imported' && !w.examArchived));
    if (!isLive) return w;
    return {
      ...w,
      examLive: false,
      examArchived: true,
      source: 'imported',
      notes: w.notes || (examCode ? `Archivado examen ${examCode}` : 'Archivado de examen'),
      archivedAt: new Date().toISOString()
    };
  });
  await persistAll(list);
  logAudit('exam_works_archive', { examCode, count: list.filter((w) => w.examArchived).length });
  return list.length;
}

export function getWork(id) {
  return listWorks().find((w) => w.id === id) || null;
}

export function worksForSchool(schoolName) {
  const key = normalizeSchool(schoolName);
  return listWorks().filter((w) => w.schoolKey === key);
}

export function exportWorksJSON(works) {
  const list = Array.isArray(works) ? works : listWorks();
  const filename = `fisicahn-trabajos-${Date.now()}.json`;
  const payload = JSON.stringify(list, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { count: list.length, filename };
}

export async function importWorksJSON(file) {
  await initWorksStorage();
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const incoming = Array.isArray(data) ? data : data?.works;
  if (!Array.isArray(incoming)) {
    throw new Error('JSON inválido: se esperaba un array de trabajos o { "works": [...] }.');
  }
  if (incoming.length === 0) {
    return { added: 0, total: listWorks().length, skipped: 0 };
  }

  const list = listWorks();
  const ids = new Set(list.map((w) => w.id));
  let added = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') {
      skipped++;
      continue;
    }
    const w = { ...raw };
    if (!w.id) {
      w.id = `w_imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (ids.has(w.id)) {
      skipped++;
      continue;
    }
    if (!w.name) w.name = w.moduleTitle || w.moduleId || 'Trabajo importado';
    if (!w.savedAt) w.savedAt = now;

    let check = { ok: false, reason: 'Sin sello' };
    try {
      check = await verifyWork(w);
    } catch {
      check = { ok: false, reason: 'No se pudo verificar el sello' };
    }
    w._importVerified = check.ok;
    w._importReason = check.reason;
    w.source = 'imported';
    w.importedAt = now;

    list.unshift(w);
    ids.add(w.id);
    added++;
  }

  await persistAll(list);
  logAudit('work_import', { added, skipped });
  return { added, skipped, total: list.length };
}
