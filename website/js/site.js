import { startStudentSession, getTeacherRecord } from './auth.js';

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
