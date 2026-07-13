/**
 * API Supabase para el sitio (docentes, exámenes, trabajos, ideas).
 * Solo anon key vía supabase-config.js — nunca service_role.
 */

import cfg from './supabase-config.js';

function configured() {
  return (
    cfg &&
    cfg.enabled !== false &&
    typeof cfg.url === 'string' &&
    cfg.url.startsWith('https://') &&
    typeof cfg.anonKey === 'string' &&
    cfg.anonKey.length > 20 &&
    !cfg.anonKey.includes('YOUR_')
  );
}

export function isCloudEnabled() {
  return configured();
}

function headers(extra = {}, accessToken = null) {
  const h = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${accessToken || cfg.anonKey}`,
    'Content-Type': 'application/json',
    ...extra
  };
  return h;
}

function sessionKey() {
  return 'fisicahn_sb_session_v1';
}

export function getCloudSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey()) || 'null');
  } catch {
    return null;
  }
}

export function setCloudSession(sess) {
  if (!sess) localStorage.removeItem(sessionKey());
  else localStorage.setItem(sessionKey(), JSON.stringify(sess));
}

export async function signUpTeacher(email, password, schoolName) {
  if (!configured()) throw new Error('Supabase no configurado. Edita website/js/supabase-config.js');
  const res = await fetch(`${cfg.url}/auth/v1/signup`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      email: String(email).trim(),
      password,
      data: { school_name: schoolName, role: 'teacher' }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || `HTTP ${res.status}`);
  if (data.access_token) {
    setCloudSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
      email: data.user?.email || email,
      schoolName
    });
  }
  return data;
}

export async function signInTeacher(email, password) {
  if (!configured()) throw new Error('Supabase no configurado.');
  const res = await fetch(
    `${cfg.url}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email: String(email).trim(), password })
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || 'Credenciales incorrectas');
  setCloudSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: data.user,
    email: data.user?.email || email,
    expires_at: data.expires_at
  });
  return data;
}

export function signOutCloud() {
  setCloudSession(null);
}

/** Upsert perfil docente (school_key) para RLS de trabajos/exámenes. */
export async function upsertTeacherProfile(profile) {
  if (!configured()) return { ok: false, skipped: true };
  const sess = getCloudSession();
  if (!sess?.access_token || !sess?.user?.id) return { ok: false, error: 'Sin sesión' };
  const schoolKey = String(profile.schoolKey || '').trim();
  if (schoolKey.length < 2) return { ok: false, error: 'school_key inválido' };
  const res = await fetch(`${cfg.url}/rest/v1/teacher_profiles`, {
    method: 'POST',
    headers: headers(
      { Prefer: 'resolution=merge-duplicates,return=minimal' },
      sess.access_token
    ),
    body: JSON.stringify({
      id: sess.user.id,
      email: profile.email || sess.email || null,
      school_name: profile.schoolName || null,
      school_key: schoolKey,
      updated_at: new Date().toISOString()
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: t || `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function pushExam({ schoolKey, schoolName, code }) {
  if (!configured()) return { ok: false, skipped: true };
  const sess = getCloudSession();
  const token = sess?.access_token;
  // Desactivar exámenes previos del colegio (best-effort)
  try {
    await fetch(
      `${cfg.url}/rest/v1/exams?school_key=eq.${encodeURIComponent(schoolKey)}&active=eq.true`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=minimal' }, token),
        body: JSON.stringify({ active: false, ended_at: new Date().toISOString() })
      }
    );
  } catch {
    /* ignore */
  }
  const res = await fetch(`${cfg.url}/rest/v1/exams`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }, token),
    body: JSON.stringify({
      school_key: schoolKey,
      code: String(code),
      active: true,
      created_by: sess?.user?.id || null
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: t };
  }
  return { ok: true, data: await res.json().catch(() => null) };
}

export async function validateExamCode(code) {
  if (!configured()) return { ok: true, cloud: false };
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/exams?code=eq.${encodeURIComponent(code)}&active=eq.true&select=code,school_key,active&limit=1`,
      { headers: headers() }
    );
    if (!res.ok) return { ok: true, cloud: false };
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) {
      // Sin fila en nube: se permite modo pizarra (offline)
      return { ok: true, cloud: true, found: false };
    }
    return { ok: true, cloud: true, found: true, exam: rows[0] };
  } catch {
    return { ok: true, cloud: false };
  }
}

export async function uploadWork(work) {
  if (!configured()) return { ok: false, skipped: true };
  const row = {
    local_id: work.id || null,
    student_name: work.studentName || null,
    school_name: work.schoolName || null,
    school_key: work.schoolKey || null,
    exam_code: work.examCode || null,
    module_id: work.moduleId || null,
    module_title: work.moduleTitle || null,
    mode: work.mode || 'practice',
    payload: work,
    integrity_hash: work.integrity || work.hash || null,
    created_at: work.savedAt || new Date().toISOString(),
    deleted_at: null
  };
  const res = await fetch(`${cfg.url}/rest/v1/student_works`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(row)
  });
  return { ok: res.ok, status: res.status };
}

export async function softDeleteWork({ localId, examCode }) {
  if (!configured() || !localId || !examCode) return { ok: false, skipped: true };
  const res = await fetch(`${cfg.url}/rest/v1/rpc/soft_delete_student_work`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_local_id: String(localId), p_exam_code: String(examCode) })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: t || `HTTP ${res.status}` };
  }
  return { ok: true, data: await res.json().catch(() => true) };
}

export async function fetchSchoolWorks(schoolKey, { includeDeleted = true, examCode = null, limit = 200 } = {}) {
  if (!configured()) return [];
  const sess = getCloudSession();
  if (!sess?.access_token) return [];
  const params = new URLSearchParams();
  params.set('school_key', `eq.${schoolKey}`);
  params.set('order', 'created_at.desc');
  params.set('limit', String(limit));
  params.set(
    'select',
    'id,local_id,student_name,school_name,school_key,exam_code,module_id,module_title,mode,payload,integrity_hash,created_at,deleted_at'
  );
  if (examCode) params.set('exam_code', `eq.${examCode}`);
  if (!includeDeleted) params.set('deleted_at', 'is.null');
  const res = await fetch(`${cfg.url}/rest/v1/student_works?${params}`, {
    headers: headers({}, sess.access_token)
  });
  if (!res.ok) return [];
  return res.json();
}

export async function endExamOnCloud({ schoolKey, code = null } = {}) {
  if (!configured()) return { ok: false, skipped: true };
  const sess = getCloudSession();
  if (!sess?.access_token || !schoolKey) return { ok: false, error: 'Sin sesión' };
  let url = `${cfg.url}/rest/v1/exams?school_key=eq.${encodeURIComponent(schoolKey)}&active=eq.true`;
  if (code) url += `&code=eq.${encodeURIComponent(code)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }, sess.access_token),
    body: JSON.stringify({ active: false, ended_at: new Date().toISOString() })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: t || `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function upsertExamChallengePack({ examCode, schoolKey, pack }) {
  if (!configured()) return { ok: false, skipped: true };
  const sess = getCloudSession();
  if (!sess?.access_token) return { ok: false, error: 'Sesión docente requerida' };
  const res = await fetch(`${cfg.url}/rest/v1/exam_challenge_packs?on_conflict=exam_code`, {
    method: 'POST',
    headers: headers(
      { Prefer: 'resolution=merge-duplicates,return=representation' },
      sess.access_token
    ),
    body: JSON.stringify({
      exam_code: String(examCode),
      school_key: String(schoolKey),
      pack: pack || {},
      created_by: sess.user?.id || null,
      updated_at: new Date().toISOString()
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: t || `HTTP ${res.status}` };
  }
  return { ok: true, data: await res.json().catch(() => null) };
}

export async function fetchExamChallengePack(examCode) {
  if (!configured() || !examCode) return null;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/exam_challenge_packs?exam_code=eq.${encodeURIComponent(examCode)}&select=exam_code,school_key,pack,updated_at&limit=1`,
      { headers: headers() }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

const IDEAS_COOLDOWN_MS = 3 * 60 * 60 * 1000;

export function ideasCooldownRemainingMs() {
  const sess = getCloudSession();
  const uid = sess?.user?.id || sess?.email || 'anon';
  const key = `fisicahn_idea_cd_${uid}`;
  const last = parseInt(localStorage.getItem(key) || '0', 10);
  const left = last + IDEAS_COOLDOWN_MS - Date.now();
  return Math.max(0, left);
}

export async function submitIdea({ idea, schoolName }) {
  if (!configured()) throw new Error('Supabase no configurado.');
  const sess = getCloudSession();
  if (!sess?.access_token || !sess?.user?.id) {
    throw new Error('Debes iniciar sesión con email verificado en Acceso docente.');
  }
  const left = ideasCooldownRemainingMs();
  if (left > 0) {
    const h = Math.ceil(left / 3600000);
    throw new Error(`Espera ${h} h antes de enviar otra idea (límite cada 3 horas).`);
  }
  const text = String(idea || '').trim();
  if (text.length < 10) throw new Error('La idea debe tener al menos 10 caracteres.');
  if (text.length > 4000) throw new Error('Máximo 4000 caracteres.');

  const res = await fetch(`${cfg.url}/rest/v1/improvement_ideas`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }, sess.access_token),
    body: JSON.stringify({
      user_id: sess.user.id,
      email: sess.email || sess.user.email || null,
      school_name: schoolName || null,
      idea: text
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `No se pudo guardar la idea (${res.status})`);
  }
  const uid = sess.user.id || sess.email;
  localStorage.setItem(`fisicahn_idea_cd_${uid}`, String(Date.now()));
  return await res.json();
}
