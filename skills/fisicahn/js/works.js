/**
 * Trabajos guardados del alumno en localStorage (caché del navegador).
 * Cada trabajo lleva sello de integridad (SHA-256) para detectar ediciones manuales.
 */

import { sha256, getSession, logAudit, normalizeSchool } from './auth.js';

const WORKS_KEY = 'fisicahn_works_v1';

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

export function listWorks() {
  try {
    const raw = localStorage.getItem(WORKS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveAll(list) {
  if (!storageAvailable()) {
    throw new Error(
      'Este navegador bloquea localStorage (modo privado o permisos). Desactívalo o usa otro navegador.'
    );
  }
  localStorage.setItem(WORKS_KEY, JSON.stringify(list));
  // verificar escritura
  const check = listWorks();
  if (check.length !== list.length) {
    throw new Error('No se pudo verificar el guardado en localStorage.');
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
  const expected = await computeIntegrity(work);
  return {
    ok: expected === work.integrity,
    reason: expected === work.integrity ? 'OK' : 'Sello alterado (posible edición manual)'
  };
}

/**
 * Guarda un trabajo nombrado del módulo actual.
 * @param {{ name: string, moduleId: string, moduleTitle: string, snapshot?: object, notes?: string }} data
 */
export async function saveWork(data) {
  const session = getSession();
  const name = String(data.name || '').trim();
  if (name.length < 1) throw new Error('Pon un nombre al trabajo.');
  if (!data.moduleId) throw new Error('Módulo no identificado.');

  const studentName = session?.studentName || data.studentName || 'Anónimo';
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
    notes: data.notes || (mode === 'exam' ? `Examen código ${examCode || '?'}` : ''),
    integrity: '',
    source: 'local' // local | imported
  };

  // El sello NUNCA debe impedir guardar el trabajo
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
  saveAll(list);
  logAudit('work_save', { id: work.id, name: work.name, moduleId: work.moduleId, mode });

  // Sync opcional a Supabase (dinámico: no rompe el módulo si falla la carga)
  try {
    const { uploadWorkToCloud } = await import('./supabase-client.js');
    const cloud = await uploadWorkToCloud({
      ...work,
      hash: work.integrity
    });
    if (cloud.ok) {
      work.cloudSynced = true;
      logAudit('work_cloud_sync', { id: work.id });
    } else if (!cloud.skipped) {
      logAudit('work_cloud_sync_fail', { id: work.id, error: cloud.error || 'unknown' });
    }
  } catch {
    /* sin nube / offline */
  }

  return work;
}

export function deleteWork(id) {
  const list = listWorks().filter((w) => w.id !== id);
  saveAll(list);
  logAudit('work_delete', { id });
}

export function getWork(id) {
  return listWorks().find((w) => w.id === id) || null;
}

export function worksForSchool(schoolName) {
  const key = normalizeSchool(schoolName);
  return listWorks().filter((w) => w.schoolKey === key);
}

/**
 * Exporta trabajos a un archivo JSON descargable.
 * @param {Array|undefined} works - si se omite, lee de localStorage
 * @returns {{ count: number, filename: string }}
 */
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
  // Firefox: debe estar en el DOM un momento
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { count: list.length, filename };
}

export async function importWorksJSON(file) {
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
    // Aceptar trabajos sin id (generar uno) para JSON hechos a mano
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

  saveAll(list);
  logAudit('work_import', { added, skipped });
  return { added, skipped, total: list.length };
}
