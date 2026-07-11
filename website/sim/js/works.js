/**
 * Trabajos guardados del alumno en localStorage (caché del navegador).
 * Cada trabajo lleva sello de integridad (SHA-256) para detectar ediciones manuales.
 */

import { sha256, getSession, logAudit, normalizeSchool } from './auth.js';

const WORKS_KEY = 'fisicahn_works_v1';

export function listWorks() {
  try {
    return JSON.parse(localStorage.getItem(WORKS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveAll(list) {
  localStorage.setItem(WORKS_KEY, JSON.stringify(list));
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
    integrity: ''
  };
  work.integrity = await computeIntegrity(work);

  const list = listWorks();
  list.unshift(work);
  // límite de almacenamiento
  while (list.length > 200) list.pop();
  saveAll(list);
  logAudit('work_save', { id: work.id, name: work.name, moduleId: work.moduleId, mode });
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

export function exportWorksJSON(works) {
  const blob = new Blob([JSON.stringify(works, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fisicahn-trabajos-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importWorksJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const incoming = Array.isArray(data) ? data : data.works;
  if (!Array.isArray(incoming)) throw new Error('JSON inválido.');
  const list = listWorks();
  const ids = new Set(list.map((w) => w.id));
  let added = 0;
  for (const w of incoming) {
    if (!w || !w.id || ids.has(w.id)) continue;
    const check = await verifyWork(w);
    w._importVerified = check.ok;
    w._importReason = check.reason;
    list.unshift(w);
    ids.add(w.id);
    added++;
  }
  saveAll(list);
  logAudit('work_import', { added });
  return { added, total: list.length };
}
