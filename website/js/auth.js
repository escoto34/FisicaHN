/**
 * Auth docente / sesión alumno (100% cliente, localStorage).
 * Apto para Cloudflare Pages. No es seguridad de servidor:
 * reduce trampas casuales y sella trabajos con hash.
 */

const TEACHER_KEY = 'fisicahn_teacher_v1';
const SESSION_KEY = 'fisicahn_session_v1';
const AUDIT_KEY = 'fisicahn_audit_v1';
const SALT = 'fisicahn-hn-2026-static';

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(hash);
}

export async function hashPassword(password, schoolName) {
  const school = normalizeSchool(schoolName);
  return sha256(`${SALT}|${school}|${password}`);
}

export function normalizeSchool(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function getTeacherRecord() {
  try {
    return JSON.parse(localStorage.getItem(TEACHER_KEY) || 'null');
  } catch {
    return null;
  }
}

/** Primer registro de docente en este navegador */
export async function registerTeacher(schoolName, password) {
  const school = String(schoolName || '').trim();
  if (school.length < 2) throw new Error('Nombre de colegio demasiado corto.');
  if (!password || password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.');
  const passwordHash = await hashPassword(password, school);
  const record = {
    schoolName: school,
    schoolKey: normalizeSchool(school),
    passwordHash,
    createdAt: new Date().toISOString(),
    examCode: null,
    examActive: false
  };
  localStorage.setItem(TEACHER_KEY, JSON.stringify(record));
  return record;
}

export async function loginTeacher(schoolName, password) {
  const rec = getTeacherRecord();
  if (!rec) throw new Error('No hay docente registrado en este navegador. Crea una cuenta primero.');
  if (normalizeSchool(schoolName) !== rec.schoolKey) {
    throw new Error('El nombre del colegio no coincide.');
  }
  const h = await hashPassword(password, schoolName);
  if (h !== rec.passwordHash) throw new Error('Contraseña incorrecta.');
  const session = {
    role: 'teacher',
    schoolName: rec.schoolName,
    schoolKey: rec.schoolKey,
    loggedAt: new Date().toISOString()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  logAudit('teacher_login', { school: rec.schoolName });
  return session;
}

export function logoutSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function isTeacherSession() {
  const s = getSession();
  return s && s.role === 'teacher';
}

/** Genera código de examen (docente autenticado) */
export function startExamSession() {
  const rec = getTeacherRecord();
  const session = getSession();
  if (!rec || !session || session.role !== 'teacher') {
    throw new Error('Debes iniciar sesión como docente.');
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  rec.examCode = code;
  rec.examActive = true;
  rec.examStartedAt = new Date().toISOString();
  localStorage.setItem(TEACHER_KEY, JSON.stringify(rec));
  logAudit('exam_start', { code });
  return code;
}

export function endExamSession() {
  const rec = getTeacherRecord();
  if (!rec) return;
  rec.examActive = false;
  rec.examCode = null;
  localStorage.setItem(TEACHER_KEY, JSON.stringify(rec));
  logAudit('exam_end', {});
}

export function getExamStatus() {
  const rec = getTeacherRecord();
  // Token importado (lab multi-PC) tiene prioridad visual si no hay doc local
  try {
    const tok = JSON.parse(localStorage.getItem('fisicahn_exam_token_v1') || 'null');
    if (tok?.active && tok?.code) {
      return {
        active: true,
        code: tok.code,
        schoolName: tok.schoolName || rec?.schoolName || null
      };
    }
  } catch {
    /* ignore */
  }
  if (!rec) return { active: false, code: null, schoolName: null };
  return {
    active: !!rec.examActive,
    code: rec.examCode,
    schoolName: rec.schoolName
  };
}

/** Exporta token de examen para otros PCs del lab (sin contraseña). */
export function exportExamToken() {
  const rec = getTeacherRecord();
  if (!rec?.examActive || !rec.examCode) {
    throw new Error('No hay examen activo para exportar.');
  }
  return {
    schema: 1,
    type: 'fisicahn-exam-token',
    schoolName: rec.schoolName,
    schoolKey: rec.schoolKey,
    code: rec.examCode,
    active: true,
    startedAt: rec.examStartedAt || new Date().toISOString()
  };
}

export function importExamToken(token) {
  if (!token || token.type !== 'fisicahn-exam-token' || !token.code) {
    throw new Error('Token de examen inválido.');
  }
  localStorage.setItem(
    'fisicahn_exam_token_v1',
    JSON.stringify({
      schoolName: token.schoolName,
      schoolKey: token.schoolKey || normalizeSchool(token.schoolName),
      code: String(token.code),
      active: true,
      startedAt: token.startedAt || new Date().toISOString()
    })
  );
  // Si no hay docente local, crea un registro mínimo solo para validar código
  let rec = getTeacherRecord();
  if (!rec) {
    rec = {
      schoolName: token.schoolName,
      schoolKey: token.schoolKey || normalizeSchool(token.schoolName),
      passwordHash: null,
      createdAt: new Date().toISOString(),
      examCode: String(token.code),
      examActive: true,
      examStartedAt: token.startedAt || new Date().toISOString(),
      fromToken: true
    };
  } else {
    rec.examCode = String(token.code);
    rec.examActive = true;
  }
  localStorage.setItem(TEACHER_KEY, JSON.stringify(rec));
  logAudit('exam_token_import', { school: token.schoolName });
}

/**
 * Alumno entra en modo práctica o examen.
 *
 * Offline multi-PC (caso normal del lab):
 *   El docente genera un código en SU pantalla y lo escribe en la pizarra.
 *   Cada alumno escribe el MISMO código al entrar. No hace falta red ni
 *   que el código exista en el localStorage del PC del alumno.
 *   El código queda sellado en cada trabajo exportado; el docente filtra después.
 *
 * Opcional (mismo PC o token importado):
 *   Si hay examen activo local, se valida colegio + código exacto.
 *
 * @param {{ studentName: string, schoolName: string, mode: 'practice'|'exam', examCode?: string }} opts
 */
export async function startStudentSession(opts) {
  const studentName = String(opts.studentName || '').trim();
  const schoolName = String(opts.schoolName || '').trim();
  const mode = opts.mode === 'exam' ? 'exam' : 'practice';
  if (studentName.length < 2) throw new Error('Escribe tu nombre completo.');
  if (schoolName.length < 2) throw new Error('Escribe el nombre del colegio.');

  let examCode = null;
  if (mode === 'exam') {
    examCode = String(opts.examCode || '')
      .trim()
      .replace(/\s+/g, '');
    if (!/^\d{4,8}$/.test(examCode)) {
      throw new Error('El código de examen son 4–8 dígitos (el que dictó o escribió el docente).');
    }

    // Si este PC tiene examen/token local, validar en duro (lab controlado).
    // Si no, modo offline: el código es el que el docente puso en la pizarra.
    const st = getExamStatus();
    if (st.active && st.code) {
      if (String(st.code) !== examCode) {
        throw new Error('Código de examen incorrecto para la sesión activa en este PC.');
      }
      const rec = getTeacherRecord();
      let schoolKey = rec?.schoolKey;
      try {
        schoolKey =
          schoolKey ||
          JSON.parse(localStorage.getItem('fisicahn_exam_token_v1') || '{}').schoolKey;
      } catch {
        /* ignore */
      }
      if (schoolKey && normalizeSchool(schoolName) !== schoolKey) {
        throw new Error('El colegio no coincide con el del examen de este PC.');
      }
    }
  }

  const session = {
    role: 'student',
    studentName,
    schoolName,
    schoolKey: normalizeSchool(schoolName),
    mode,
    examCode,
    loggedAt: new Date().toISOString()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  logAudit('student_login', { studentName, mode, examCode: examCode || undefined });
  return session;
}

export function logAudit(event, detail = {}) {
  try {
    const list = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    list.push({
      event,
      detail,
      at: new Date().toISOString(),
      href: typeof location !== 'undefined' ? location.pathname : ''
    });
    // tope
    while (list.length > 500) list.shift();
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getAuditLog() {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearAuditLog() {
  localStorage.removeItem(AUDIT_KEY);
}
