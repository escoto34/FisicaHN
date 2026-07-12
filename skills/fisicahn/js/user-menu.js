/**
 * Panel de cuenta dentro del simulador:
 * - Muestra datos de verificación (alumno / docente)
 * - Unirse a código de examen (todos)
 * - Crear código de examen (solo docente verificado)
 * - Cerrar sesión / cambiar usuario
 */

import {
  getSession,
  getDisplayName,
  logoutSession,
  joinExamCode,
  leaveExamMode,
  createExamCodeOnline,
  endExamSession,
  getExamStatus,
  isTeacherSession
} from './auth.js';
import {
  getCloudSession,
  signOutCloud,
  ensureCloudEnabled
} from './supabase-client.js';
import { ensureSessionGate, renderSessionBadge, renderUserChip } from './session-gate.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function refreshAllUi() {
  renderSessionBadge(document.getElementById('sessionBadgeHost'));
  renderUserChip(document.getElementById('userChipHost'));
  window.dispatchEvent(new CustomEvent('fisicahn:session', { detail: getSession() }));
}

/**
 * Abre el panel de cuenta (o el login si no hay sesión).
 */
export async function openUserMenu() {
  const session = getSession();
  if (!session) {
    await ensureSessionGate({ force: true });
    refreshAllUi();
    return getSession();
  }

  const prev = document.getElementById('userMenu');
  if (prev) prev.remove();

  const isTeacher = session.role === 'teacher';
  const cloud = getCloudSession();
  const examSt = getExamStatus();
  const online = await ensureCloudEnabled().catch(() => false);

  const overlay = document.createElement('div');
  overlay.id = 'userMenu';
  overlay.className = 'user-menu-overlay';
  overlay.innerHTML = `
    <div class="user-menu-card" role="dialog" aria-labelledby="userMenuTitle" aria-modal="true">
      <header class="user-menu-header">
        <h2 id="userMenuTitle">Cuenta</h2>
        <button type="button" class="user-menu-close" id="userMenuClose" aria-label="Cerrar">×</button>
      </header>

      <section class="user-menu-identity">
        <p class="user-menu-role">${isTeacher ? 'Docente verificado' : 'Alumno'}</p>
        <p class="user-menu-name">${escapeHtml(getDisplayName(session))}</p>
        <ul class="user-menu-meta">
          ${
            isTeacher && (session.email || cloud?.email)
              ? `<li><strong>Email:</strong> ${escapeHtml(session.email || cloud?.email)}</li>`
              : ''
          }
          <li><strong>Colegio:</strong> ${escapeHtml(session.schoolName || '—')}</li>
          <li><strong>Modo:</strong> ${
            session.mode === 'exam'
              ? `Examen · código ${escapeHtml(session.examCode || '—')}`
              : 'Práctica'
          }</li>
          ${
            isTeacher
              ? `<li><strong>Nube:</strong> ${
                  cloud?.access_token
                    ? 'Sesión de email activa'
                    : online
                      ? 'Sin token (vuelve a entrar como docente)'
                      : 'Sin config en línea en este equipo'
                }</li>`
              : ''
          }
        </ul>
      </section>

      <section class="user-menu-section">
        <h3>Unirse a un código de examen</h3>
        <p class="user-menu-hint">
          Disponible para alumnos y docentes. No crea el código: solo te une al examen del aula.
        </p>
        <label class="gate-label">Código
          <input type="text" id="userJoinCode" inputmode="numeric" maxlength="8" placeholder="Ej. 482910" value="${
            session.examCode && session.mode === 'exam' ? escapeHtml(session.examCode) : ''
          }">
        </label>
        <div class="user-menu-row">
          <button type="button" class="gate-btn primary" id="userJoinBtn">Unirse</button>
          ${
            session.mode === 'exam'
              ? `<button type="button" class="gate-btn secondary" id="userLeaveExamBtn">Salir del examen</button>`
              : ''
          }
        </div>
      </section>

      ${
        isTeacher
          ? `
      <section class="user-menu-section teacher-only">
        <h3>Crear código de examen</h3>
        <p class="user-menu-hint">
          Solo docentes con email verificado y conexión. Los alumnos no pueden crear códigos.
        </p>
        <div class="works-exam-code" id="userExamCodeDisplay">${
          examSt.active && examSt.code
            ? escapeHtml(examSt.code)
            : session.examCode && session.mode === 'exam'
              ? escapeHtml(session.examCode)
              : '———'
        }</div>
        <div class="user-menu-row">
          <button type="button" class="gate-btn primary" id="userCreateExamBtn" ${
            cloud?.access_token ? '' : 'disabled'
          }>Generar código</button>
          <button type="button" class="gate-btn secondary" id="userEndExamBtn">Finalizar examen local</button>
        </div>
        ${
          !cloud?.access_token
            ? `<p class="user-menu-hint warn">Para generar en la nube, cierra sesión y entra de nuevo como docente con email (con internet).</p>`
            : ''
        }
      </section>`
          : `
      <section class="user-menu-section">
        <p class="user-menu-hint">
          Como alumno puedes unirte a un código, pero no crear uno. Pide el código a tu docente.
        </p>
      </section>`
      }

      <p class="gate-error" id="userMenuError" hidden></p>
      <p class="gate-hint ok" id="userMenuOk" hidden></p>

      <footer class="user-menu-footer">
        <button type="button" class="gate-btn secondary" id="userSwitchBtn">Cambiar usuario</button>
        <button type="button" class="gate-btn danger" id="userLogoutBtn">Cerrar sesión</button>
      </footer>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    refreshAllUi();
  };

  const err = overlay.querySelector('#userMenuError');
  const ok = overlay.querySelector('#userMenuOk');
  const setErr = (m) => {
    err.hidden = !m;
    err.textContent = m || '';
    ok.hidden = true;
  };
  const setOk = (m) => {
    ok.hidden = !m;
    ok.textContent = m || '';
    err.hidden = true;
  };

  overlay.querySelector('#userMenuClose').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#userJoinBtn')?.addEventListener('click', async () => {
    setErr('');
    try {
      const code = overlay.querySelector('#userJoinCode').value;
      await joinExamCode(code);
      setOk(`Unido al examen ${code.trim()}. Los trabajos se sellarán con este código.`);
      refreshAllUi();
      // Actualizar display
      const st = getSession();
      const disp = overlay.querySelector('#userExamCodeDisplay');
      if (disp && st?.examCode) disp.textContent = st.examCode;
    } catch (e) {
      setErr(e.message || 'No se pudo unir al examen.');
    }
  });

  overlay.querySelector('#userLeaveExamBtn')?.addEventListener('click', () => {
    leaveExamMode();
    setOk('Volviste a modo práctica.');
    refreshAllUi();
  });

  overlay.querySelector('#userCreateExamBtn')?.addEventListener('click', async () => {
    setErr('');
    if (!isTeacherSession()) {
      setErr('Solo los docentes pueden crear códigos de examen.');
      return;
    }
    try {
      const code = await createExamCodeOnline();
      const disp = overlay.querySelector('#userExamCodeDisplay');
      if (disp) disp.textContent = code;
      setOk(`Código ${code} activo en la nube. Escríbelo en la pizarra.`);
      refreshAllUi();
    } catch (e) {
      setErr(e.message || 'No se pudo crear el código.');
    }
  });

  overlay.querySelector('#userEndExamBtn')?.addEventListener('click', () => {
    endExamSession();
    leaveExamMode();
    const disp = overlay.querySelector('#userExamCodeDisplay');
    if (disp) disp.textContent = '———';
    setOk('Examen finalizado en este equipo.');
    refreshAllUi();
  });

  overlay.querySelector('#userLogoutBtn')?.addEventListener('click', () => {
    logoutSession();
    signOutCloud();
    overlay.remove();
    refreshAllUi();
    ensureSessionGate({ force: true }).then(() => refreshAllUi());
  });

  overlay.querySelector('#userSwitchBtn')?.addEventListener('click', () => {
    logoutSession();
    // No borrar cloud necesariamente al cambiar de alumno a alumno
    overlay.remove();
    ensureSessionGate({ force: true }).then(() => refreshAllUi());
  });

  return session;
}

/** Enlaza chip, badge y eventos globales. */
export function bindUserMenu() {
  renderUserChip(document.getElementById('userChipHost'));
  renderSessionBadge(document.getElementById('sessionBadgeHost'));

  window.addEventListener('fisicahn:open-account', () => {
    openUserMenu().catch((e) => console.warn('user menu', e));
  });
  window.addEventListener('fisicahn:session', () => {
    renderUserChip(document.getElementById('userChipHost'));
    renderSessionBadge(document.getElementById('sessionBadgeHost'));
  });

  document.getElementById('openAccountBtn')?.addEventListener('click', () => {
    openUserMenu().catch(() => {});
  });
}
