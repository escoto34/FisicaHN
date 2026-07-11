import {
  getTeacherRecord,
  registerTeacher,
  loginTeacher,
  logoutSession,
  getSession,
  startExamSession,
  endExamSession,
  getExamStatus,
  getAuditLog,
  exportExamToken,
  importExamToken
} from './auth.js';
import { listWorks, worksForSchool, exportWorksJSON, importWorksJSON, verifyWork } from './works.js';

const authPanel = document.getElementById('authPanel');
const dashPanel = document.getElementById('dashPanel');
const authMsg = document.getElementById('authMsg');
const dashMsg = document.getElementById('dashMsg');

function setMsg(el, text, ok) {
  el.textContent = text || '';
  el.className = 'form-msg' + (text ? (ok ? ' ok' : ' err') : '');
}

function showDash() {
  const session = getSession();
  if (!session || session.role !== 'teacher') {
    authPanel.classList.remove('hidden');
    dashPanel.classList.add('hidden');
    return;
  }
  authPanel.classList.add('hidden');
  dashPanel.classList.remove('hidden');
  document.getElementById('dashSchool').textContent = `Colegio: ${session.schoolName}`;
  refreshExam();
  refreshWorks();
  refreshAudit();
}

function refreshExam() {
  const st = getExamStatus();
  document.getElementById('examCodeDisplay').textContent = st.active && st.code ? st.code : '———';
}

async function refreshWorks() {
  const session = getSession();
  const body = document.getElementById('worksBody');
  let works = listWorks();
  if (session?.schoolName) {
    const schoolWorks = worksForSchool(session.schoolName);
    // mostrar del colegio + importados
    works = works.filter(
      (w) => w.schoolKey === session.schoolKey || w._importVerified !== undefined
    );
    if (!works.length) works = schoolWorks;
  }
  if (!works.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">Sin trabajos en este navegador. Importa JSON de alumnos o pide que guarden aquí.</td></tr>';
    return;
  }

  const rows = [];
  for (const w of works.slice(0, 100)) {
    const check = await verifyWork(w);
    const seal = w._importVerified === false || !check.ok
      ? `<span class="badge warn">${w._importReason || check.reason}</span>`
      : `<span class="badge ok">válido</span>`;
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
        <td class="mono">${esc(new Date(w.savedAt).toLocaleString())}</td>
        <td>${seal}</td>
      </tr>
    `);
  }
  body.innerHTML = rows.join('');
}

function refreshAudit() {
  const log = getAuditLog().slice(-40).reverse();
  document.getElementById('auditBox').textContent = log.length
    ? log.map((e) => `${e.at}  ${e.event}  ${JSON.stringify(e.detail || {})}`).join('\n')
    : 'Sin eventos.';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.getElementById('authForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(authMsg, '');
  try {
    await loginTeacher(
      document.getElementById('tSchool').value,
      document.getElementById('tPass').value
    );
    setMsg(authMsg, 'Sesión iniciada.', true);
    showDash();
  } catch (err) {
    setMsg(authMsg, err.message, false);
  }
});

document.getElementById('btnRegister')?.addEventListener('click', async () => {
  setMsg(authMsg, '');
  try {
    const school = document.getElementById('tSchool').value;
    const pass = document.getElementById('tPass').value;
    if (getTeacherRecord()) {
      if (!confirm('Ya hay un docente en este navegador. ¿Sobrescribir?')) return;
    }
    await registerTeacher(school, pass);
    await loginTeacher(school, pass);
    setMsg(authMsg, 'Cuenta creada e iniciada.', true);
    showDash();
  } catch (err) {
    setMsg(authMsg, err.message, false);
  }
});

document.getElementById('btnLogout')?.addEventListener('click', () => {
  logoutSession();
  showDash();
});

document.getElementById('btnStartExam')?.addEventListener('click', () => {
  try {
    const code = startExamSession();
    refreshExam();
    setMsg(dashMsg, `Examen activo. Código: ${code}`, true);
    refreshAudit();
  } catch (err) {
    setMsg(dashMsg, err.message, false);
  }
});

document.getElementById('btnEndExam')?.addEventListener('click', () => {
  endExamSession();
  refreshExam();
  setMsg(dashMsg, 'Examen finalizado.', true);
  refreshAudit();
});

document.getElementById('btnExportToken')?.addEventListener('click', () => {
  try {
    const token = exportExamToken();
    const blob = new Blob([JSON.stringify(token, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fisicahn-examen-${token.code}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(dashMsg, 'Token descargado. Cárgalo en cada PC del lab (Importar token).', true);
  } catch (err) {
    setMsg(dashMsg, err.message, false);
  }
});

document.getElementById('importToken')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const token = JSON.parse(await file.text());
    importExamToken(token);
    refreshExam();
    setMsg(dashMsg, 'Token de examen importado en este PC.', true);
    refreshAudit();
  } catch (err) {
    setMsg(dashMsg, err.message || 'Token inválido', false);
  }
  e.target.value = '';
});

document.getElementById('btnRefresh')?.addEventListener('click', () => {
  refreshWorks();
  refreshAudit();
  setMsg(dashMsg, 'Lista actualizada.', true);
});

document.getElementById('btnExport')?.addEventListener('click', () => {
  const session = getSession();
  const works = session ? worksForSchool(session.schoolName) : listWorks();
  exportWorksJSON(works.length ? works : listWorks());
});

document.getElementById('importFile')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const res = await importWorksJSON(file);
    setMsg(dashMsg, `Importados: ${res.added}. Total en caché: ${res.total}.`, true);
    refreshWorks();
    refreshAudit();
  } catch (err) {
    setMsg(dashMsg, err.message || 'Error al importar', false);
  }
  e.target.value = '';
});

// Prefill school if exists
const rec = getTeacherRecord();
if (rec?.schoolName) {
  document.getElementById('tSchool').value = rec.schoolName;
  document.getElementById('authTitle').textContent = 'Iniciar sesión docente';
}

showDash();
