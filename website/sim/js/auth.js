/**
 * Auth docente / sesión alumno (100% cliente, localStorage).
 * Apto para Cloudflare Pages. No es seguridad de servidor:
 * reduce trampas casuales y sella trabajos con hash.
 */

const TEACHER_KEY = 'fisicahn_teacher_v1';
const SESSION_KEY = 'fisicahn_session_v1';
const AUDIT_KEY = 'fisicahn_audit_v1';
/** Perfil de alumno recordado en este equipo (USB / PC personal). */
const STUDENT_PROFILE_KEY = 'fisicahn_student_profile_v1';
const SALT = 'fisicahn-hn-2026-static';

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * SHA-256 en pure JS (fallback cuando crypto.subtle no existe:
 * file://, HTTP en IP de red, algunos WebViews).
 * Misma salida hex que Web Crypto.
 */
function sha256Fallback(text) {
  // Algoritmo SHA-256 (FIPS 180-4), implementación compacta para cliente offline.
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const rotr = (n, x) => (x >>> n) | (x << (32 - n));
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const withPad = bytes.length + 1 + 8;
  const blockCount = ((withPad + 63) >> 6) << 6; // múltiplo de 64
  const buf = new Uint8Array(blockCount);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  // longitud en bits big-endian al final (solo 32 bits bajos + altos)
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  view.setUint32(blockCount - 8, hi, false);
  view.setUint32(blockCount - 4, lo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let i = 0; i < blockCount; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(7, w[j - 15]) ^ rotr(18, w[j - 15]) ^ (w[j - 15] >>> 3);
      const s1 = rotr(17, w[j - 2]) ^ rotr(19, w[j - 2]) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new DataView(new ArrayBuffer(32));
  out.setUint32(0, h0, false);
  out.setUint32(4, h1, false);
  out.setUint32(8, h2, false);
  out.setUint32(12, h3, false);
  out.setUint32(16, h4, false);
  out.setUint32(20, h5, false);
  out.setUint32(24, h6, false);
  out.setUint32(28, h7, false);
  return bytesToHex(out.buffer);
}

/** true si Web Crypto Subtle está disponible (HTTPS o localhost). */
export function hasSubtleCrypto() {
  return typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function';
}

export async function sha256(text) {
  const str = String(text ?? '');
  if (hasSubtleCrypto()) {
    try {
      const data = new TextEncoder().encode(str);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return bytesToHex(hash);
    } catch {
      /* cae al fallback (p. ej. contexto no seguro mal detectado) */
    }
  }
  return sha256Fallback(str);
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

/** Guarda sesión ya validada (docente o alumno). */
export function setSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function isTeacherSession() {
  const s = getSession();
  return s && s.role === 'teacher';
}

/** Perfil de alumno en este equipo (para reutilizar en USB). */
export function getStudentProfile() {
  try {
    return JSON.parse(localStorage.getItem(STUDENT_PROFILE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveStudentProfile({ studentName, schoolName }) {
  const name = String(studentName || '').trim();
  const school = String(schoolName || '').trim();
  if (name.length < 2 || school.length < 2) return null;
  const profile = {
    studentName: name,
    schoolName: school,
    schoolKey: normalizeSchool(school),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STUDENT_PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function clearStudentProfile() {
  localStorage.removeItem(STUDENT_PROFILE_KEY);
}

/**
 * Nombre mostrado del usuario según verificación / sesión.
 * Docente: email o colegio; alumno: nombre.
 */
export function getDisplayName(session = getSession()) {
  if (!session) return '';
  if (session.role === 'teacher') {
    return session.email || session.studentName || session.schoolName || 'Docente';
  }
  return session.studentName || session.schoolName || 'Alumno';
}

/**
 * Crea sesión de docente a partir de datos verificados (email en la nube + colegio).
 * @param {{ email: string, schoolName: string, userId?: string }} opts
 */
export async function startTeacherSessionVerified(opts) {
  const email = String(opts.email || '').trim().toLowerCase();
  const schoolName = String(opts.schoolName || '').trim();
  if (!email || !email.includes('@')) throw new Error('Email no válido.');
  if (schoolName.length < 2) throw new Error('Escribe el nombre del colegio.');

  let rec = getTeacherRecord();
  if (!rec || normalizeSchool(schoolName) !== rec.schoolKey) {
    // Registro local mínimo (sin contraseña local si solo usa nube)
    rec = {
      schoolName,
      schoolKey: normalizeSchool(schoolName),
      passwordHash: rec?.passwordHash || null,
      email,
      createdAt: rec?.createdAt || new Date().toISOString(),
      examCode: rec?.examCode || null,
      examActive: !!rec?.examActive
    };
  } else {
    rec.schoolName = schoolName;
    rec.email = email;
  }
  localStorage.setItem(TEACHER_KEY, JSON.stringify(rec));

  const session = {
    role: 'teacher',
    email,
    userId: opts.userId || null,
    schoolName: rec.schoolName,
    schoolKey: rec.schoolKey,
    studentName: email,
    mode: 'practice',
    examCode: null,
    verified: true,
    loggedAt: new Date().toISOString()
  };
  setSession(session);
  logAudit('teacher_login_verified', { email, school: rec.schoolName });
  return session;
}

/**
 * Unirse a un código de examen (alumno o docente).
 * No crea el código: solo asocia la sesión al examen.
 * Offline: acepta 4–8 dígitos (modo pizarra).
 * Online: si hay nube y el código no existe, avisa (no bloquea si la red falla).
 */
export async function joinExamCode(examCodeInput) {
  const session = getSession();
  if (!session || (session.role !== 'student' && session.role !== 'teacher')) {
    throw new Error('Primero inicia sesión como alumno o docente.');
  }

  const examCode = String(examCodeInput || '')
    .trim()
    .replace(/\s+/g, '');
  if (!/^\d{4,8}$/.test(examCode)) {
    throw new Error('El código de examen son 4–8 dígitos.');
  }

  let schoolKey = session.schoolKey || normalizeSchool(session.schoolName || '');
  let schoolName = session.schoolName || '';

  // Validación local si hay examen activo en este PC
  const st = getExamStatus();
  if (st.active && st.code && String(st.code) !== examCode) {
    throw new Error('Código incorrecto para la sesión de examen activa en este PC.');
  }

  // Nube (si hay)
  try {
    const { validateExamCode } = await import('./supabase-client.js');
    if (typeof validateExamCode === 'function') {
      const cloud = await validateExamCode(examCode);
      if (cloud.cloud && cloud.found === false) {
        throw new Error(
          'Código no encontrado o inactivo en la nube. Pide al docente un código vigente.'
        );
      }
      if (cloud.cloud && cloud.found && cloud.exam?.school_key) {
        schoolKey = cloud.exam.school_key;
      }
    }
  } catch (e) {
    if (
      e?.message &&
      (e.message.includes('no encontrado') ||
        e.message.includes('incorrecto') ||
        e.message.includes('inactivo'))
    ) {
      throw e;
    }
    // Sin red: modo pizarra — el código se sella en el trabajo
  }

  const next = {
    ...session,
    mode: 'exam',
    examCode,
    schoolKey: schoolKey || session.schoolKey,
    schoolName: schoolName || session.schoolName
  };
  setSession(next);
  logAudit('exam_join', {
    role: next.role,
    examCode,
    name: next.studentName || next.email
  });
  return next;
}

/** Sale del modo examen (vuelve a práctica) sin cerrar sesión. */
export function leaveExamMode() {
  const session = getSession();
  if (!session) return null;
  const next = { ...session, mode: 'practice', examCode: null };
  setSession(next);
  logAudit('exam_leave', { role: next.role });
  return next;
}

/**
 * Genera código de examen (solo docente).
 * Local: marca examen activo en este equipo.
 * Para publicar en la nube usa createExamCodeOnline().
 */
export function startExamSession() {
  const rec = getTeacherRecord();
  const session = getSession();
  if (!session || session.role !== 'teacher') {
    throw new Error('Solo un docente verificado puede crear códigos de examen.');
  }
  if (!rec) {
    throw new Error('Falta el colegio en la sesión. Vuelve a iniciar sesión como docente.');
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  rec.examCode = code;
  rec.examActive = true;
  rec.examStartedAt = new Date().toISOString();
  localStorage.setItem(TEACHER_KEY, JSON.stringify(rec));
  logAudit('exam_start', { code });
  return code;
}

/**
 * Crea código y lo publica en la nube (solo docente con sesión de email).
 * @returns {Promise<string>} código de 6 dígitos
 */
export async function createExamCodeOnline() {
  const session = getSession();
  if (!session || session.role !== 'teacher') {
    throw new Error('Solo un docente verificado puede crear códigos de examen.');
  }
  const { ensureCloudEnabled, getCloudSession, pushExam } = await import('./supabase-client.js');
  const ok = await ensureCloudEnabled();
  if (!ok) {
    throw new Error('Se necesita conexión y config en línea para publicar el código.');
  }
  const cloud = getCloudSession();
  if (!cloud?.access_token) {
    throw new Error('Inicia sesión como docente con email (verificación) para crear un código.');
  }

  const code = startExamSession();
  const rec = getTeacherRecord();
  const push = await pushExam({
    schoolKey: rec.schoolKey || session.schoolKey,
    schoolName: rec.schoolName || session.schoolName,
    code
  });
  if (!push.ok) {
    endExamSession();
    throw new Error(push.error || 'No se pudo publicar el código en la nube.');
  }

  // El docente queda en contexto del examen que creó (puede unirse explícitamente también)
  const next = {
    ...session,
    mode: 'exam',
    examCode: code
  };
  setSession(next);
  logAudit('exam_create_online', { code });
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
 * @param {{ studentName: string, schoolName: string, mode: 'practice'|'exam', examCode?: string, remember?: boolean }} opts
 */
export async function startStudentSession(opts) {
  const studentName = String(opts.studentName || '').trim();
  const schoolName = String(opts.schoolName || '').trim();
  const mode = opts.mode === 'exam' ? 'exam' : 'practice';
  if (studentName.length < 2) throw new Error('Escribe tu nombre completo.');
  if (schoolName.length < 2) throw new Error('Escribe el nombre del colegio.');

  let examCode = null;
  let schoolKey = normalizeSchool(schoolName);

  if (mode === 'exam') {
    examCode = String(opts.examCode || '')
      .trim()
      .replace(/\s+/g, '');
    if (!/^\d{4,8}$/.test(examCode)) {
      throw new Error('El código de examen son 4–8 dígitos (el que escribió el docente).');
    }

    // 1) Examen activo en este PC (token/local)
    const st = getExamStatus();
    if (st.active && st.code) {
      if (String(st.code) !== examCode) {
        throw new Error('Código de examen incorrecto para la sesión activa en este PC.');
      }
      const rec = getTeacherRecord();
      let sk = rec?.schoolKey;
      try {
        sk =
          sk ||
          JSON.parse(localStorage.getItem('fisicahn_exam_token_v1') || '{}').schoolKey;
      } catch {
        /* ignore */
      }
      if (sk && schoolKey !== sk) {
        throw new Error('El colegio no coincide con el del examen de este PC.');
      }
      if (sk) schoolKey = sk;
    } else {
      // 2) Validar en la nube si hay internet y config
      try {
        const { validateExamCode } = await import('./supabase-client.js');
        if (typeof validateExamCode === 'function') {
          const cloud = await validateExamCode(examCode);
          if (cloud.cloud && cloud.found === false) {
            throw new Error(
              'Código de examen no encontrado o inactivo en la nube. Pide al docente que genere uno en línea.'
            );
          }
          if (cloud.cloud && cloud.found && cloud.exam?.school_key) {
            if (schoolKey && schoolKey !== cloud.exam.school_key) {
              schoolKey = cloud.exam.school_key;
            } else if (!schoolKey) {
              schoolKey = cloud.exam.school_key;
            }
          }
        }
      } catch (e) {
        if (
          e?.message &&
          (e.message.includes('no encontrado') ||
            e.message.includes('incorrecto') ||
            e.message.includes('no coincide') ||
            e.message.includes('inactivo'))
        ) {
          throw e;
        }
      }
    }
  }

  // Recordar en este USB / PC (útil si cada alumno tiene su pen drive)
  if (opts.remember !== false) {
    saveStudentProfile({ studentName, schoolName });
  }

  const session = {
    role: 'student',
    studentName,
    schoolName,
    schoolKey,
    mode,
    examCode,
    verified: true,
    loggedAt: new Date().toISOString()
  };
  setSession(session);
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
