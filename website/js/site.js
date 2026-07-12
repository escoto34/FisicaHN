import { startStudentSession, getTeacherRecord } from './auth.js';
import { getCloudSession, submitIdea, ideasCooldownRemainingMs, isCloudEnabled } from './supabase-api.js';

const form = document.getElementById('quickForm');
const modeSel = document.getElementById('qMode');
const codeField = document.getElementById('qCodeField');
const msg = document.getElementById('qMsg');

const rec = getTeacherRecord();
if (rec?.schoolName) {
  const school = document.getElementById('qSchool');
  if (school && !school.value) school.value = rec.schoolName;
}

modeSel?.addEventListener('change', () => {
  codeField.hidden = modeSel.value !== 'exam';
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  msg.className = 'form-msg';
  try {
    await startStudentSession({
      studentName: document.getElementById('qName').value,
      schoolName: document.getElementById('qSchool').value,
      mode: modeSel.value,
      examCode: document.getElementById('qCode').value
    });
    msg.textContent = 'Entrando…';
    msg.classList.add('ok');
    location.href = 'sim/';
  } catch (err) {
    msg.textContent = err.message || 'Error al entrar';
    msg.classList.add('err');
  }
});

/* Ideas de mejora (solo email verificado / sesión nube) */
const ideaForm = document.getElementById('ideaForm');
const ideaMsg = document.getElementById('ideaMsg');
const ideaText = document.getElementById('ideaText');
const ideaSubmit = document.getElementById('ideaSubmit');

function refreshIdeaUi() {
  const cloud = getCloudSession();
  const verified = Boolean(cloud?.access_token && cloud?.user?.id);
  if (ideaText) ideaText.disabled = !verified;
  if (ideaSubmit) ideaSubmit.disabled = !verified;
  if (!verified && ideaMsg && !ideaMsg.textContent) {
    ideaMsg.textContent = 'Inicia sesión con email en Acceso docente para enviar ideas.';
    ideaMsg.className = 'form-msg';
  }
  const left = ideasCooldownRemainingMs();
  if (verified && left > 0 && ideaSubmit) {
    const mins = Math.ceil(left / 60000);
    ideaSubmit.disabled = true;
    if (ideaMsg) {
      ideaMsg.textContent = `Cooldown activo: puedes enviar otra idea en ~${mins} min.`;
      ideaMsg.className = 'form-msg';
    }
  }
}

ideaForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!ideaMsg) return;
  ideaMsg.textContent = '';
  ideaMsg.className = 'form-msg';
  try {
    const cloud = getCloudSession();
    if (!cloud?.access_token) throw new Error('Sesión de email requerida.');
    await submitIdea({
      idea: ideaText.value,
      schoolName: getTeacherRecord()?.schoolName || cloud.schoolName || null
    });
    ideaMsg.textContent = 'Idea guardada. Gracias por contribuir.';
    ideaMsg.classList.add('ok');
    ideaText.value = '';
    refreshIdeaUi();
  } catch (err) {
    ideaMsg.textContent = err.message || 'No se pudo enviar';
    ideaMsg.classList.add('err');
  }
});

refreshIdeaUi();
