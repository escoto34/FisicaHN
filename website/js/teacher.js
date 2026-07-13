/**
 * Panel docente: acceso con email, examen en vivo, retos y trabajos.
 */
import {
  getTeacherRecord,
  registerTeacher,
  loginTeacher,
  logoutSession,
  getSession,
  startExamSession,
  endExamSession,
  getExamStatus,
  normalizeSchool
} from './auth.js';
import { listWorks, worksForSchool, exportWorksJSON, importWorksJSON, verifyWork, getWork } from './works.js';
import {
  isCloudEnabled,
  signInTeacher,
  signUpTeacher,
  signOutCloud,
  getCloudSession,
  pushExam,
  fetchSchoolWorks,
  upsertTeacherProfile,
  endExamOnCloud,
  upsertExamChallengePack
} from './supabase-api.js';

const authPanel = document.getElementById('authPanel');
const dashPanel = document.getElementById('dashPanel');
const authMsg = document.getElementById('authMsg');
const dashMsg = document.getElementById('dashMsg');
const examMsg = document.getElementById('examMsg');
const chMsg = document.getElementById('chMsg');

const DRAFT_KEY = 'fisicahn_challenge_draft_v1';
const ARCHIVE_KEY = 'fisicahn_teacher_archive_v1';
let pollTimer = null;
/** @type {Array} trabajos en vivo (incl. nube) */
let liveWorks = [];

function setMsg(el, text, ok) {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'form-msg' + (text ? (ok ? ' ok' : ' err') : '');
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || {
      schema: 1,
      type: 'fisicahn-challenge-pack',
      modules: {}
    };
  } catch {
    return { schema: 1, type: 'fisicahn-challenge-pack', modules: {} };
  }
}

function saveDraft(pack) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(pack));
}

function normalizePack(raw) {
  if (!raw || typeof raw !== 'object') {
    return { schema: 1, type: 'fisicahn-challenge-pack', modules: {} };
  }
  const modules = raw.modules || raw.challenges_by_module || {};
  const clean = {};
  for (const [k, list] of Object.entries(modules)) {
    if (!Array.isArray(list)) continue;
    clean[k] = list.filter((c) => c && c.question);
  }
  return { schema: 1, type: 'fisicahn-challenge-pack', modules: clean, title: raw.title || null };
}

function loadArchive() {
  try {
    return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveArchive(list) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, 500)));
}

function cloudRowToWork(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const id = payload.id || row.local_id || row.id;
  return {
    id,
    name: payload.name || row.module_title || 'Trabajo de examen',
    moduleId: payload.moduleId || row.module_id,
    moduleTitle: payload.moduleTitle || row.module_title || row.module_id,
    studentName: row.student_name || payload.studentName,
    schoolName: row.school_name || payload.schoolName,
    schoolKey: row.school_key || payload.schoolKey,
    mode: row.mode || payload.mode || 'exam',
    examCode: row.exam_code || payload.examCode,
    savedAt: payload.savedAt || row.created_at,
    snapshot: payload.snapshot || {},
    notes: payload.notes || '',
    integrity: row.integrity_hash || payload.integrity,
    _fromCloud: true,
    deletedAt: row.deleted_at || null,
    source: 'imported'
  };
}

function showDash() {
  const session = getSession();
  const cloud = getCloudSession();
  const ok = cloud?.access_token && session?.role === 'teacher';
  if (!ok) {
    authPanel.classList.remove('hidden');
    dashPanel.classList.add('hidden');
    stopPoll();
    return;
  }
  authPanel.classList.add('hidden');
  dashPanel.classList.remove('hidden');
  const school = session?.schoolName || cloud?.schoolName || '—';
  document.getElementById('dashSchool').textContent = `Colegio: ${school}`;
  document.getElementById('dashEmail').textContent = `Email: ${cloud.email || '—'}`;
  refreshExam();
  refreshWorks();
  renderChallengeList();
  startPollIfExam();
}

function refreshExam() {
  const st = getExamStatus();
  document.getElementById('examCodeDisplay').textContent =
    st.active && st.code ? st.code : '———';
}

function formatWorkDetail(w, sealText) {
  return [
    `Alumno: ${w.studentName || '—'}`,
    `Trabajo: ${w.name || '—'}`,
    `Módulo: ${w.moduleTitle || w.moduleId || '—'}`,
    `Colegio: ${w.schoolName || '—'}`,
    `Modo: ${w.mode || 'practice'}${w.examCode ? ` · código ${w.examCode}` : ''}`,
    `Fecha: ${w.savedAt ? new Date(w.savedAt).toLocaleString() : '—'}`,
    `Sello: ${sealText || '—'}`,
    w.notes ? `Notas: ${w.notes}` : null,
    w.snapshot ? `Snapshot: ${JSON.stringify(w.snapshot).slice(0, 400)}…` : null
  ]
    .filter(Boolean)
    .join('\n');
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPollIfExam() {
  stopPoll();
  const st = getExamStatus();
  if (!st.active || !st.code) return;
  pollTimer = setInterval(() => refreshWorks(), 8000);
}

async function refreshWorks() {
  const session = getSession();
  const cloud = getCloudSession();
  const body = document.getElementById('worksBody');
  const schoolKey =
    session?.schoolKey ||
    normalizeSchool(session?.schoolName || getTeacherRecord()?.schoolName || '');

  let works = listWorks().slice();
  const archived = loadArchive();
  // Archivo local de exámenes previos
  for (const w of archived) {
    if (!works.some((x) => x.id === w.id)) works.push(w);
  }

  if (schoolKey) {
    const schoolWorks = worksForSchool(session?.schoolName || getTeacherRecord()?.schoolName);
    works = works.filter((w) => w.schoolKey === schoolKey || w._importVerified !== undefined || w._fromCloud);
    if (!works.length) works = schoolWorks;
  }

  if (cloud?.access_token && schoolKey) {
    try {
      const remote = await fetchSchoolWorks(schoolKey, { includeDeleted: true, limit: 300 });
      const liveMap = new Map();
      const deleted = new Set();
      for (const row of remote) {
        const w = cloudRowToWork(row);
        if (row.deleted_at) {
          deleted.add(w.id);
        } else {
          liveMap.set(w.id, w);
        }
      }
      // Quitar lives soft-deleted (no el archivo permanente)
      works = works.filter((w) => {
        if (w.examArchived) return true;
        if (deleted.has(w.id) && w._fromCloud && !w.examArchived) return false;
        return true;
      });
      for (const [id, w] of liveMap) {
        const i = works.findIndex((x) => x.id === id);
        if (i >= 0) {
          if (!works[i].examArchived) works[i] = { ...works[i], ...w };
        } else {
          works.unshift(w);
        }
      }
      liveWorks = works;
    } catch {
      /* ignore */
    }
  }

  if (!works.length) {
    body.innerHTML =
      '<tr><td colspan="7" class="muted">Sin trabajos. Los alumnos guardan con el código de examen en línea.</td></tr>';
    return;
  }

  const rows = [];
  for (const w of works.slice(0, 100)) {
    let sealText = 'ok';
    let seal = '<span class="badge ok">ok</span>';
    if (w._fromCloud) {
      sealText = w.examArchived ? 'archivo' : 'nube';
      seal = `<span class="badge ok">${esc(sealText)}</span>`;
    } else {
      const check = await verifyWork(w);
      sealText = w._importReason || check.reason || 'ok';
      seal =
        w._importVerified === false || !check.ok
          ? `<span class="badge warn">${esc(sealText)}</span>`
          : `<span class="badge ok">válido</span>`;
    }
    rows.push(`
      <tr>
        <td>${esc(w.studentName)}</td>
        <td>${esc(w.name)}</td>
        <td>${esc(w.moduleTitle || w.moduleId)}</td>
        <td>${
          w.mode === 'exam'
            ? `<span class="badge exam">examen ${esc(w.examCode || '')}</span>`
            : 'práctica'
        }</td>
        <td class="mono">${esc(w.savedAt ? new Date(w.savedAt).toLocaleString() : '—')}</td>
        <td>${seal}</td>
        <td><button type="button" class="btn btn-secondary btn-sm" data-eval="${esc(w.id)}" data-seal="${esc(sealText)}">Ver</button></td>
      </tr>
    `);
  }
  body.innerHTML = rows.join('');
  body.querySelectorAll('[data-eval]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const w =
        works.find((x) => x.id === btn.dataset.eval) ||
        liveWorks.find((x) => x.id === btn.dataset.eval) ||
        getWork(btn.dataset.eval);
      if (!w) {
        alert('Trabajo no encontrado');
        return;
      }
      alert('Evaluación del trabajo\n\n' + formatWorkDetail(w, btn.dataset.seal));
    });
  });
}

function renderChallengeList() {
  const host = document.getElementById('chList');
  if (!host) return;
  const draft = getDraft();
  const keys = Object.keys(draft.modules || {}).filter((k) => draft.modules[k]?.length);
  if (!keys.length) {
    host.innerHTML = 'Ningún reto en el formulario.';
    return;
  }
  host.innerHTML = keys
    .map((mod) => {
      const items = draft.modules[mod]
        .map(
          (c, i) =>
            `<li>${esc(String(c.question).slice(0, 90))} <button type="button" class="btn btn-secondary btn-sm" data-rm-mod="${esc(mod)}" data-rm-i="${i}">Quitar</button></li>`
        )
        .join('');
      return `<div><strong>${esc(mod)}</strong> (${draft.modules[mod].length})<ul>${items}</ul></div>`;
    })
    .join('');
  host.querySelectorAll('[data-rm-mod]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = getDraft();
      const mod = btn.dataset.rmMod;
      const i = parseInt(btn.dataset.rmI, 10);
      d.modules[mod]?.splice(i, 1);
      if (d.modules[mod] && !d.modules[mod].length) delete d.modules[mod];
      saveDraft(d);
      renderChallengeList();
    });
  });
}

document.getElementById('chType')?.addEventListener('change', () => {
  const t = document.getElementById('chType').value;
  const f = document.getElementById('chOptionsField');
  if (f) f.hidden = !(t === 'multiple' || t === 'select');
});

document.getElementById('btnChAdd')?.addEventListener('click', () => {
  const moduleId = document.getElementById('chModule').value;
  const type = document.getElementById('chType').value;
  const question = document.getElementById('chQuestion').value.trim();
  const answerRaw = document.getElementById('chAnswer').value.trim();
  const unit = document.getElementById('chUnit').value.trim();
  const hint = document.getElementById('chHint').value.trim();
  const points = parseInt(document.getElementById('chPoints').value || '10', 10) || 10;
  if (question.length < 3) {
    setMsg(chMsg, 'Escribe la pregunta.', false);
    return;
  }
  const c = {
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
      setMsg(chMsg, 'Respuesta numérica inválida.', false);
      return;
    }
    c.answer = n;
    if (unit) c.unit = unit;
  } else {
    const options = document
      .getElementById('chOptions')
      .value.split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length < 2) {
      setMsg(chMsg, 'Añade al menos 2 opciones.', false);
      return;
    }
    const idx = parseInt(answerRaw, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) {
      setMsg(chMsg, `Índice de respuesta 0–${options.length - 1}.`, false);
      return;
    }
    c.options = options;
    c.answer = idx;
  }
  const d = getDraft();
  if (!d.modules[moduleId]) d.modules[moduleId] = [];
  d.modules[moduleId].push(c);
  saveDraft(d);
  document.getElementById('chQuestion').value = '';
  document.getElementById('chAnswer').value = '';
  document.getElementById('chHint').value = '';
  document.getElementById('chOptions').value = '';
  renderChallengeList();
  setMsg(chMsg, 'Reto añadido al formulario.', true);
});

document.getElementById('btnChExport')?.addEventListener('click', () => {
  const pack = normalizePack(getDraft());
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fisicahn-retos-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setMsg(chMsg, 'JSON de retos exportado.', true);
});

document.getElementById('chImportFile')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const pack = normalizePack(data);
    saveDraft(pack);
    renderChallengeList();
    setMsg(chMsg, `Importado: ${Object.keys(pack.modules).length} módulo(s).`, true);
  } catch (err) {
    setMsg(chMsg, err.message || 'JSON inválido', false);
  }
});

document.getElementById('btnChPublish')?.addEventListener('click', async () => {
  setMsg(chMsg, '');
  const st = getExamStatus();
  const session = getSession();
  const rec = getTeacherRecord();
  if (!st.active || !st.code) {
    setMsg(chMsg, 'Genera un código de examen activo primero.', false);
    return;
  }
  try {
    const r = await upsertExamChallengePack({
      examCode: st.code,
      schoolKey: session?.schoolKey || rec?.schoolKey,
      pack: normalizePack(getDraft())
    });
    if (!r.ok) throw new Error(r.error || 'No se pudo publicar');
    setMsg(chMsg, 'Retos publicados en el examen activo.', true);
  } catch (err) {
    setMsg(chMsg, err.message, false);
  }
});

document.getElementById('authForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(authMsg, '');
  if (!isCloudEnabled()) {
    setMsg(
      authMsg,
      'El acceso en línea no está configurado en este despliegue. ' +
        'El administrador debe definir SUPABASE_URL y SUPABASE_ANON_KEY ' +
        '(GitHub → Settings → Secrets and variables → Actions) y volver a publicar, ' +
        'o crear website/js/supabase-config.js en local y servir desde website/.',
      false
    );
    return;
  }
  const school = document.getElementById('tSchool').value;
  const pass = document.getElementById('tPass').value;
  const email = document.getElementById('tEmail').value;
  try {
    await signInTeacher(email, pass);
    try {
      await loginTeacher(school, pass);
    } catch {
      await registerTeacher(school, pass);
      await loginTeacher(school, pass);
    }
    const cs = getCloudSession();
    if (cs) {
      cs.schoolName = school;
      localStorage.setItem('fisicahn_sb_session_v1', JSON.stringify(cs));
    }
    try {
      const rec = getTeacherRecord();
      await upsertTeacherProfile({
        email: cs?.email,
        schoolName: school,
        schoolKey: rec?.schoolKey || normalizeSchool(school)
      });
    } catch {
      /* ignore */
    }
    setMsg(authMsg, 'Sesión iniciada.', true);
    showDash();
  } catch (err) {
    setMsg(authMsg, err.message, false);
  }
});

document.getElementById('btnRegister')?.addEventListener('click', async () => {
  setMsg(authMsg, '');
  if (!isCloudEnabled()) {
    setMsg(
      authMsg,
      'El acceso en línea no está configurado en este despliegue. ' +
        'Faltan las claves del backend (SUPABASE_URL + SUPABASE_ANON_KEY en secrets de GitHub Actions, ' +
        'o supabase-config.js en desarrollo local).',
      false
    );
    return;
  }
  const school = document.getElementById('tSchool').value;
  const pass = document.getElementById('tPass').value;
  const email = document.getElementById('tEmail').value;
  try {
    if (pass.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    await signUpTeacher(email, pass, school);
    await registerTeacher(school, pass);
    await loginTeacher(school, pass);
    try {
      const rec = getTeacherRecord();
      const cs = getCloudSession();
      await upsertTeacherProfile({
        email: cs?.email || email,
        schoolName: school,
        schoolKey: rec?.schoolKey || normalizeSchool(school)
      });
    } catch {
      /* ignore */
    }
    setMsg(
      authMsg,
      'Cuenta creada. Si debes confirmar el email, revisa tu bandeja antes de generar códigos de examen.',
      true
    );
    showDash();
  } catch (err) {
    setMsg(authMsg, err.message, false);
  }
});

document.getElementById('btnLogout')?.addEventListener('click', () => {
  logoutSession();
  signOutCloud();
  stopPoll();
  showDash();
});

document.getElementById('btnStartExam')?.addEventListener('click', async () => {
  setMsg(examMsg, '');
  const cloud = getCloudSession();
  if (!cloud?.access_token) {
    setMsg(examMsg, 'Debes iniciar sesión con email para generar un código en línea.', false);
    return;
  }
  try {
    if (!getSession() || getSession().role !== 'teacher') {
      const rec = getTeacherRecord();
      if (!rec) throw new Error('Falta el colegio en la sesión. Vuelve a iniciar sesión.');
      localStorage.setItem(
        'fisicahn_session_v1',
        JSON.stringify({
          role: 'teacher',
          schoolName: rec.schoolName,
          schoolKey: rec.schoolKey,
          loggedAt: new Date().toISOString()
        })
      );
    }
    const code = startExamSession();
    const rec = getTeacherRecord();
    const cloudPush = await pushExam({
      schoolKey: rec.schoolKey,
      schoolName: rec.schoolName,
      code
    });
    refreshExam();
    if (!cloudPush.ok) {
      endExamSession();
      refreshExam();
      throw new Error(
        cloudPush.error ||
          'No se pudo publicar el código en la nube. Revisa la conexión e inténtalo de nuevo.'
      );
    }
    // Publicar pack si hay draft
    const draft = normalizePack(getDraft());
    if (Object.keys(draft.modules).length) {
      await upsertExamChallengePack({
        examCode: code,
        schoolKey: rec.schoolKey,
        pack: draft
      });
    }
    startPollIfExam();
    setMsg(
      examMsg,
      `Código ${code} activo en la nube. Los trabajos de la clase se actualizan solos; al finalizar quedan archivados aquí.`,
      true
    );
  } catch (err) {
    setMsg(examMsg, err.message, false);
  }
});

document.getElementById('btnEndExam')?.addEventListener('click', async () => {
  const st = getExamStatus();
  const rec = getTeacherRecord();
  const code = st.code;
  stopPoll();
  // Archivar lives locales del docente
  try {
    await refreshWorks();
    const toArchive = (liveWorks.length ? liveWorks : listWorks())
      .filter((w) => w.mode === 'exam' || w._fromCloud)
      .filter((w) => !code || w.examCode === code)
      .map((w) => ({ ...w, examArchived: true, source: 'imported', archivedAt: new Date().toISOString() }));
    const prev = loadArchive();
    const ids = new Set(prev.map((w) => w.id));
    for (const w of toArchive) {
      if (!ids.has(w.id)) prev.unshift(w);
    }
    saveArchive(prev);
  } catch {
    /* ignore */
  }
  if (rec?.schoolKey) {
    await endExamOnCloud({ schoolKey: rec.schoolKey, code });
  }
  endExamSession();
  refreshExam();
  setMsg(
    examMsg,
    'Examen finalizado. Los trabajos de los alumnos quedaron archivados en este panel para evaluarlos.',
    true
  );
  refreshWorks();
});

document.getElementById('btnRefresh')?.addEventListener('click', () => refreshWorks());
document.getElementById('btnExport')?.addEventListener('click', () => {
  const merged = [...listWorks(), ...loadArchive()];
  const seen = new Set();
  const uniq = [];
  for (const w of merged) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    uniq.push(w);
  }
  exportWorksJSON(uniq);
});
document.getElementById('importFile')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const r = await importWorksJSON(file);
    setMsg(dashMsg, `Importados: ${r.added}. Total: ${r.total}`, true);
    refreshWorks();
  } catch (err) {
    setMsg(dashMsg, err.message, false);
  }
});

showDash();
