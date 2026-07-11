/**
 * Modal de entrada: práctica o examen (nombre + colegio + código).
 */

import {
  getSession,
  startStudentSession,
  getExamStatus,
  getTeacherRecord
} from './auth.js';

export function ensureSessionGate() {
  const existing = getSession();
  if (existing && (existing.role === 'student' || existing.role === 'teacher')) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'sessionGate';
    overlay.className = 'session-gate';
    overlay.innerHTML = `
      <div class="session-gate-card" role="dialog" aria-labelledby="gateTitle">
        <h2 id="gateTitle">Entrar a FísicaHN</h2>
        <p class="session-gate-lead">Identifícate para guardar trabajos. En examen escribe el código que el docente puso en la pizarra (no hace falta internet).</p>
        <label class="gate-label">Tu nombre
          <input type="text" id="gateName" autocomplete="name" required maxlength="80" placeholder="Nombre y apellido">
        </label>
        <label class="gate-label">Colegio
          <input type="text" id="gateSchool" autocomplete="organization" required maxlength="120" placeholder="Nombre del colegio">
        </label>
        <fieldset class="gate-mode">
          <legend>Modo</legend>
          <label><input type="radio" name="gateMode" value="practice" checked> Práctica</label>
          <label><input type="radio" name="gateMode" value="exam"> Examen</label>
        </fieldset>
        <label class="gate-label gate-code" id="gateCodeWrap" hidden>Código de examen (pizarra)
          <input type="text" id="gateCode" inputmode="numeric" maxlength="8" placeholder="Ej. 482910">
        </label>
        <p class="gate-error" id="gateError" hidden></p>
        <div class="gate-actions">
          <button type="button" class="gate-btn primary" id="gateEnter">Entrar</button>
          <a class="gate-link" href="../index.html" id="gateHomeLink">Volver al sitio</a>
        </div>
        <p class="gate-hint" id="gateHint"></p>
      </div>
    `;
    document.body.appendChild(overlay);

    // Prefill school if teacher registered on this machine
    const rec = getTeacherRecord();
    if (rec?.schoolName) {
      overlay.querySelector('#gateSchool').value = rec.schoolName;
    }
    const exam = getExamStatus();
    if (exam.active) {
      overlay.querySelector('#gateHint').textContent =
        `Hay un examen activo en este navegador para “${exam.schoolName}”.`;
    }

    const codeWrap = overlay.querySelector('#gateCodeWrap');
    overlay.querySelectorAll('input[name="gateMode"]').forEach((r) => {
      r.addEventListener('change', () => {
        codeWrap.hidden = overlay.querySelector('input[name="gateMode"]:checked').value !== 'exam';
      });
    });

    const home = overlay.querySelector('#gateHomeLink');
    const isDesktop =
      typeof window !== 'undefined' &&
      (window.FisicaHNDesktop?.isDesktop ||
        document.documentElement.dataset.desktop === '1');
    if (isDesktop) {
      home.hidden = true;
      home.removeAttribute('href');
    } else if (!document.referrer && location.pathname.includes('/sim/')) {
      home.href = '../index.html';
    }

    const err = overlay.querySelector('#gateError');
    overlay.querySelector('#gateEnter').addEventListener('click', async () => {
      err.hidden = true;
      try {
        const mode = overlay.querySelector('input[name="gateMode"]:checked').value;
        const session = await startStudentSession({
          studentName: overlay.querySelector('#gateName').value,
          schoolName: overlay.querySelector('#gateSchool').value,
          mode,
          examCode: overlay.querySelector('#gateCode').value
        });
        overlay.remove();
        resolve(session);
      } catch (e) {
        err.textContent = e.message || 'No se pudo entrar.';
        err.hidden = false;
      }
    });
  });
}

export function renderSessionBadge(container) {
  const s = getSession();
  if (!container || !s) return;
  const modeLabel = s.mode === 'exam' ? 'EXAMEN' : s.role === 'teacher' ? 'DOCENTE' : 'Práctica';
  container.innerHTML = `
    <span class="session-badge ${s.mode === 'exam' ? 'exam' : ''}">
      ${escapeHtml(s.studentName || s.schoolName || 'Sesión')} · ${modeLabel}
    </span>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
