/**
 * challenges.js — Motor de retos pedagógicos (pestaña inferior del módulo).
 */

const STORAGE_KEY = 'fisicahn_challenges';

/**
 * Rutas legacy de retos de ejemplo (ya no se cargan en la app).
 * Solo se muestran retos del pack de examen activo.
 */
export const CHALLENGE_ENGINES = {};

export const CHALLENGE_MODULE_LABELS = {
  kinematics: 'Cinemática',
  dynamics: 'Fuerzas y movimiento',
  'force-kinetic': 'Fuerza cinética',
  friction: 'Fricción',
  statics: 'Estática',
  electricity: 'Campo eléctrico y cargas',
  optics: 'Luz y óptica geométrica',
  momentum: 'Cantidad de movimiento',
  oscillatory: 'Oscilaciones y energía',
  sound: 'Sonido y ondas',
  magnetic: 'Campos magnéticos',
  gravity: 'Gravedad universal',
  atomic: 'Física atómica',
  particles: 'Cargas en campo B (partículas)',
  rotational: 'Circular y rotacional',
  thermodynamics: 'Termodinámica',
  'work-energy': 'Trabajo, energía y potencia',
  'collisions-2d': 'Colisiones multi-cuerpo (2D)',
  lenses: 'Lentes delgadas',
  'wave-optics': 'Interferencia y difracción',
  circuits: 'Circuitos DC / AC',
  'em-waves': 'Ondas electromagnéticas',
  photoelectric: 'Efecto fotoeléctrico',
  radioactivity: 'Decaimiento radiactivo',
  tunneling: 'Túnel cuántico',
  kepler: 'Kepler y asistencia gravitacional'
};

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { completed: [], score: 0, streak: 0 };
  } catch {
    return { completed: [], score: 0, streak: 0 };
  }
}

function saveProgress(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/**
 * Pack de retos del examen en caché local (alumno / docente).
 * @returns {{ modules: Record<string, Array>, examCode?: string } | null}
 */
export function getCachedExamChallengePack() {
  try {
    return JSON.parse(localStorage.getItem('fisicahn_exam_challenges_v1') || 'null');
  } catch {
    return null;
  }
}

export function setCachedExamChallengePack(pack, examCode) {
  if (!pack) {
    localStorage.removeItem('fisicahn_exam_challenges_v1');
    return;
  }
  const normalized = normalizeChallengePack(pack);
  normalized.examCode = examCode || pack.examCode || null;
  localStorage.setItem('fisicahn_exam_challenges_v1', JSON.stringify(normalized));
}

/** Normaliza import JSON del docente. */
export function normalizeChallengePack(raw) {
  if (!raw || typeof raw !== 'object') {
    return { schema: 1, type: 'fisicahn-challenge-pack', modules: {} };
  }
  let modules = raw.modules || raw.challenges_by_module || null;
  if (!modules && Array.isArray(raw.challenges)) {
    modules = { _all: raw.challenges };
  }
  if (!modules || typeof modules !== 'object') modules = {};
  const clean = {};
  for (const [key, list] of Object.entries(modules)) {
    if (!Array.isArray(list)) continue;
    clean[key] = list
      .filter((c) => c && typeof c === 'object' && c.question)
      .map((c, i) => ({
        id: c.id || `${key}-${i + 1}`,
        type: c.type || (Array.isArray(c.options) ? 'multiple' : 'numeric'),
        question: String(c.question),
        answer: c.answer,
        options: Array.isArray(c.options) ? c.options : undefined,
        unit: c.unit || '',
        hint: c.hint || '',
        points: Number(c.points) || 10,
        module: c.module || key
      }));
  }
  return {
    schema: 1,
    type: 'fisicahn-challenge-pack',
    modules: clean,
    title: raw.title || null,
    examCode: raw.examCode || null
  };
}

export function exportChallengePackJSON(pack, filename) {
  const normalized = normalizeChallengePack(pack);
  const name = filename || `fisicahn-retos-${Date.now()}.json`;
  const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { filename: name, modules: Object.keys(normalized.modules).length };
}

export function engineHasBuiltInChallenges(_engineKey) {
  // Los retos de ejemplo del repo están desactivados.
  return false;
}

/**
 * Carga retos del módulo solo en modo examen y solo del pack del docente.
 * Sin examen → lista vacía (la pestaña Retos se oculta).
 * Reintenta bajar el pack de la nube si la caché local está vacía.
 */
export async function loadChallengeDataForEngine(engineKey) {
  if (!engineKey) return [];

  let examCode = null;
  try {
    const { getSession } = await import('./auth.js');
    const session = getSession();
    if (!session || session.mode !== 'exam' || !session.examCode) {
      return [];
    }
    examCode = session.examCode;
  } catch {
    return [];
  }

  let examPack = getCachedExamChallengePack();
  const hasAny =
    examPack?.modules &&
    Object.values(examPack.modules).some((arr) => Array.isArray(arr) && arr.length);

  // Si no hay pack local, intentar nube (PC del docente lo publicó después de unirse)
  if (!hasAny && examCode) {
    try {
      const { fetchExamChallengePack } = await import('./supabase-client.js');
      const row = await fetchExamChallengePack(examCode);
      if (row?.pack) {
        setCachedExamChallengePack(normalizeChallengePack(row.pack), examCode);
        examPack = getCachedExamChallengePack();
      }
    } catch {
      /* sin red */
    }
  }

  if (!examPack?.modules) return [];

  const fromExam =
    examPack.modules[engineKey] ||
    examPack.modules[engineKey?.replace(/-/g, '_')] ||
    [];
  return Array.isArray(fromExam) ? fromExam.slice() : [];
}

export class ChallengeEngine {
  /**
   * @param {{ mount?: HTMLElement, onComplete?: Function, onProgress?: Function }} callbacks
   */
  constructor(callbacks = {}) {
    this.challenges = [];
    this.currentIndex = 0;
    this.progress = loadProgress();
    this.onComplete = callbacks.onComplete || (() => {});
    this.onProgress = callbacks.onProgress || (() => {});
    this._hintIndex = 0;
    this._answered = false;
    this._mount = callbacks.mount || null;
    this.panel = null;
    this.card = null;
    this.progressFill = null;
    this.scoreBadge = null;

    this.buildUI(this._mount);
  }

  /** Monta en un contenedor (pestaña inferior). */
  mount(el) {
    if (!el) return;
    this._mount = el;
    if (this.panel && this.panel.parentElement !== el) {
      el.innerHTML = '';
      el.appendChild(this.panel);
    }
  }

  loadChallenges(moduleId, challengeData) {
    const data = Array.isArray(challengeData) ? challengeData : [];
    this.challenges = data.filter((c) => !c.module || c.module === moduleId || !moduleId);
    this.currentIndex = 0;
    this._answered = false;
    this._hintIndex = 0;
    this.render();
  }

  buildUI(mountEl) {
    this.panel = document.createElement('div');
    this.panel.className = 'challenge-panel challenge-embedded';
    this.panel.innerHTML = `
      <div class="challenge-header challenge-header-embedded">
        <span class="challenge-title">Retos del módulo</span>
        <span class="challenge-score-badge">0 pts</span>
      </div>
      <div class="challenge-body">
        <div class="challenge-progress-bar">
          <div class="challenge-progress-fill" style="width:0%"></div>
        </div>
        <div class="challenge-card"></div>
      </div>
    `;

    this.body = this.panel.querySelector('.challenge-body');
    this.card = this.panel.querySelector('.challenge-card');
    this.progressFill = this.panel.querySelector('.challenge-progress-fill');
    this.scoreBadge = this.panel.querySelector('.challenge-score-badge');

    if (mountEl) {
      mountEl.innerHTML = '';
      mountEl.appendChild(this.panel);
    }

    this.updateScoreBadge();
  }

  next() {
    if (this.currentIndex < this.challenges.length - 1) {
      this.currentIndex++;
      this._answered = false;
      this._hintIndex = 0;
      this.render();
    } else {
      this.card.innerHTML = `
        <div class="challenge-complete">
          <h3>¡Retos completados!</h3>
          <p>Puntaje total: ${this.progress.score} pts</p>
          <p>Racha: ${this.progress.streak} seguidos</p>
          <button type="button" class="challenge-btn challenge-btn-restart">Reiniciar</button>
        </div>
      `;
      this.card.querySelector('.challenge-btn-restart')?.addEventListener('click', () => {
        this.progress = { completed: [], score: 0, streak: 0 };
        saveProgress(this.progress);
        this.currentIndex = 0;
        this._answered = false;
        this.render();
        this.updateScoreBadge();
      });
      this.onComplete(this.getProgress());
    }
  }

  checkAnswer(userAnswer) {
    if (this._answered) return;
    const challenge = this.challenges[this.currentIndex];
    if (!challenge) return;

    let correct = false;
    if (challenge.type === 'numeric') {
      const n = parseFloat(userAnswer);
      const ans = parseFloat(challenge.answer);
      correct = Number.isFinite(n) && Number.isFinite(ans) && Math.abs(n - ans) < 0.01;
    } else if (challenge.type === 'multiple' || challenge.type === 'select') {
      correct =
        parseInt(userAnswer, 10) === parseInt(challenge.answer, 10) ||
        userAnswer === challenge.answer;
    }

    this._answered = true;
    const feedbackEl = this.card.querySelector('.challenge-feedback');
    const already = this.progress.completed.includes(challenge.id);
    if (correct) {
      if (!already) {
        this.progress.completed.push(challenge.id);
        this.progress.score += challenge.points || 10;
      }
      this.progress.streak = (this.progress.streak || 0) + 1;
      if (feedbackEl) {
        feedbackEl.className = 'challenge-feedback challenge-feedback-correct';
        feedbackEl.textContent = already
          ? '✓ Correcto (ya sumado)'
          : `✓ ¡Correcto! +${challenge.points || 10} pts`;
      }
    } else {
      this.progress.streak = 0;
      const expected =
        challenge.type === 'numeric'
          ? `${challenge.answer} ${challenge.unit || ''}`.trim()
          : challenge.options?.[challenge.answer] ?? challenge.answer;
      if (feedbackEl) {
        feedbackEl.className = 'challenge-feedback challenge-feedback-incorrect';
        feedbackEl.textContent = `✗ Incorrecto. Respuesta: ${expected}`;
      }
    }
    saveProgress(this.progress);
    this.updateScoreBadge();
    this.updateProgressBar();
    this.onProgress({ correct, score: this.progress.score, streak: this.progress.streak });

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'challenge-btn challenge-btn-next';
    nextBtn.textContent =
      this.currentIndex < this.challenges.length - 1 ? 'Siguiente →' : 'Finalizar ✓';
    nextBtn.addEventListener('click', () => this.next());
    this.card.appendChild(nextBtn);
  }

  getHint() {
    const challenge = this.challenges[this.currentIndex];
    if (!challenge) return;

    const hints = challenge.hint
      ? String(challenge.hint)
          .split(';')
          .map((h) => h.trim())
          .filter(Boolean)
      : ['Sin pista disponible'];
    if (this._hintIndex >= hints.length) return;

    const hintEl =
      this.card.querySelector('.challenge-hints') ||
      (() => {
        const el = document.createElement('div');
        el.className = 'challenge-hints';
        this.card.appendChild(el);
        return el;
      })();

    const p = document.createElement('p');
    p.textContent = `💡 Pista ${this._hintIndex + 1}: ${hints[this._hintIndex]}`;
    hintEl.appendChild(p);
    this._hintIndex++;
  }

  render() {
    if (!this.card) return;
    const challenge = this.challenges[this.currentIndex];
    if (!challenge) {
      this.card.innerHTML =
        '<p class="challenge-empty">No hay retos disponibles para este módulo.</p>';
      return;
    }

    this.card.innerHTML = '';
    this._hintIndex = 0;

    const qCard = document.createElement('div');
    qCard.className = 'challenge-question-card';

    const meta = document.createElement('div');
    meta.className = 'challenge-meta';
    meta.innerHTML = `<span class="challenge-num">Reto ${this.currentIndex + 1}/${this.challenges.length}</span>
      <span class="challenge-points">${challenge.points || 10} pts</span>`;
    qCard.appendChild(meta);

    const question = document.createElement('p');
    question.className = 'challenge-question';
    question.textContent = challenge.question;
    qCard.appendChild(question);
    this.card.appendChild(qCard);

    if (challenge.type === 'multiple') {
      const optGroup = document.createElement('div');
      optGroup.className = 'challenge-options';
      (challenge.options || []).forEach((opt, i) => {
        const label = document.createElement('label');
        label.className = 'challenge-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `challenge-${challenge.id}`;
        radio.value = String(i);
        radio.addEventListener('change', () => this.checkAnswer(i));
        label.appendChild(radio);
        label.appendChild(document.createTextNode(` ${opt}`));
        optGroup.appendChild(label);
      });
      this.card.appendChild(optGroup);
    } else if (challenge.type === 'select') {
      const sel = document.createElement('select');
      sel.className = 'challenge-select';
      (challenge.options || []).forEach((opt, i) => {
        const optEl = document.createElement('option');
        optEl.value = String(i);
        optEl.textContent = opt;
        sel.appendChild(optEl);
      });
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'challenge-btn';
      btn.textContent = 'Responder';
      btn.addEventListener('click', () => this.checkAnswer(sel.value));
      this.card.appendChild(sel);
      this.card.appendChild(btn);
    } else {
      const inputRow = document.createElement('div');
      inputRow.className = 'challenge-input-row';
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.className = 'challenge-input';
      input.placeholder = challenge.unit ? `Respuesta (${challenge.unit})` : 'Respuesta';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'challenge-btn challenge-btn-submit';
      btn.textContent = '✓ Responder';
      btn.addEventListener('click', () => this.checkAnswer(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.checkAnswer(input.value);
      });
      inputRow.appendChild(input);
      inputRow.appendChild(btn);
      this.card.appendChild(inputRow);
    }

    const hintBtn = document.createElement('button');
    hintBtn.type = 'button';
    hintBtn.className = 'challenge-btn challenge-btn-hint';
    hintBtn.textContent = '💡 Pista';
    hintBtn.addEventListener('click', () => this.getHint());
    this.card.appendChild(hintBtn);

    const feedback = document.createElement('div');
    feedback.className = 'challenge-feedback';
    this.card.appendChild(feedback);

    this.updateProgressBar();
  }

  updateProgressBar() {
    if (!this.progressFill || this.challenges.length === 0) return;
    const pct = ((this.currentIndex + (this._answered ? 1 : 0)) / this.challenges.length) * 100;
    this.progressFill.style.width = Math.min(100, pct) + '%';
  }

  updateScoreBadge() {
    if (this.scoreBadge) this.scoreBadge.textContent = `${this.progress.score} pts`;
  }

  getProgress() {
    return { ...this.progress, total: this.challenges.length, current: this.currentIndex };
  }

  destroy() {
    this.panel?.remove();
    this.panel = null;
    this.card = null;
  }
}
