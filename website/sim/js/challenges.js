/**
 * challenges.js — Motor de retos pedagógicos
 * Sistema de preguntas con progreso, localStorage, y feedback visual.
 */

const STORAGE_KEY = 'fisicahn_challenges';

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { completed: [], score: 0, streak: 0 };
  } catch { return { completed: [], score: 0, streak: 0 }; }
}

function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export class ChallengeEngine {
  constructor(callbacks = {}) {
    this.challenges = [];
    this.currentIndex = 0;
    this.progress = loadProgress();
    this.onComplete = callbacks.onComplete || (() => {});
    this.onProgress = callbacks.onProgress || (() => {});
    this._hintIndex = 0;
    this._answered = false;
    this._shuffledOptions = new Map();

    this.buildUI();
  }

  loadChallenges(moduleId, challengeData) {
    this.challenges = challengeData.filter(c => c.module === moduleId || !c.module);
    this.currentIndex = 0;
    this._answered = false;
    this._hintIndex = 0;
    this.render();
  }

  buildUI() {
    this.panel = document.createElement('div');
    this.panel.className = 'challenge-panel challenge-collapsed';
    this.panel.innerHTML = `
      <div class="challenge-header">
        <span class="challenge-toggle">▶</span>
        <span class="challenge-title">Retos</span>
        <span class="challenge-score-badge">0 pts</span>
      </div>
      <div class="challenge-body">
        <div class="challenge-progress-bar">
          <div class="challenge-progress-fill" style="width:0%"></div>
        </div>
        <div class="challenge-card"></div>
      </div>
    `;

    this.toggleBtn = this.panel.querySelector('.challenge-toggle');
    this.body = this.panel.querySelector('.challenge-body');
    this.card = this.panel.querySelector('.challenge-card');
    this.progressFill = this.panel.querySelector('.challenge-progress-fill');
    this.scoreBadge = this.panel.querySelector('.challenge-score-badge');

    this.panel.querySelector('.challenge-header').addEventListener('click', () => {
      this.panel.classList.toggle('challenge-collapsed');
      this.toggleBtn.textContent = this.panel.classList.contains('challenge-collapsed') ? '▶' : '▼';
    });

    document.body.appendChild(this.panel);
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
          <h3>🎉 ¡Retos completados!</h3>
          <p>Puntaje total: ${this.progress.score} pts</p>
          <p>Racha: ${this.progress.streak} seguidos</p>
          <button class="challenge-btn challenge-btn-restart">Reiniciar</button>
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
    }
  }

  checkAnswer(userAnswer) {
    if (this._answered) return;
    const challenge = this.challenges[this.currentIndex];
    if (!challenge) return;

    let correct = false;
    if (challenge.type === 'numeric') {
      correct = Math.abs(parseFloat(userAnswer) - challenge.answer) < 0.01;
    } else if (challenge.type === 'multiple' || challenge.type === 'select') {
      correct = parseInt(userAnswer) === challenge.answer || userAnswer === challenge.answer;
    }

    this._answered = true;
    const feedbackEl = this.card.querySelector('.challenge-feedback');
    if (correct) {
      this.progress.completed.push(challenge.id);
      if (!this.progress.completed.includes(challenge.id)) {
        this.progress.score += challenge.points || 10;
      }
      this.progress.streak = (this.progress.streak || 0) + 1;
      if (feedbackEl) {
        feedbackEl.className = 'challenge-feedback challenge-feedback-correct';
        feedbackEl.textContent = `✓ ¡Correcto! +${challenge.points || 10} pts`;
      }
    } else {
      this.progress.streak = 0;
      const expected = challenge.type === 'numeric'
        ? `${challenge.answer} ${challenge.unit || ''}`
        : challenge.options?.[challenge.answer] || challenge.answer;
      if (feedbackEl) {
        feedbackEl.className = 'challenge-feedback challenge-feedback-incorrect';
        feedbackEl.textContent = `✗ Incorrecto. Respuesta: ${expected}`;
      }
    }
    saveProgress(this.progress);
    this.updateScoreBadge();
    this.updateProgressBar();
    this.onProgress({ correct, score: this.progress.score, streak: this.progress.streak });

    // Show next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'challenge-btn challenge-btn-next';
    nextBtn.textContent = this.currentIndex < this.challenges.length - 1 ? 'Siguiente →' : 'Finalizar ✓';
    nextBtn.addEventListener('click', () => this.next());
    this.card.appendChild(nextBtn);
  }

  getHint() {
    const challenge = this.challenges[this.currentIndex];
    if (!challenge) return;

    const hints = challenge.hint ? challenge.hint.split(';').map(h => h.trim()) : [challenge.hint || 'Sin pista disponible'];
    if (this._hintIndex >= hints.length) return;

    const hintEl = this.card.querySelector('.challenge-hints') || (() => {
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
    const challenge = this.challenges[this.currentIndex];
    if (!challenge) {
      this.card.innerHTML = '<p class="challenge-empty">No hay retos disponibles para este módulo.</p>';
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

      challenge.options.forEach((opt, i) => {
        const label = document.createElement('label');
        label.className = 'challenge-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `challenge-${challenge.id}`;
        radio.value = i;
        radio.addEventListener('change', () => this.checkAnswer(i));
        label.appendChild(radio);
        label.appendChild(document.createTextNode(` ${opt}`));
        optGroup.appendChild(label);
      });
      this.card.appendChild(optGroup);
    } else if (challenge.type === 'select') {
      const sel = document.createElement('select');
      sel.className = 'challenge-select';
      challenge.options.forEach((opt, i) => {
        const optEl = document.createElement('option');
        optEl.value = i;
        optEl.textContent = opt;
        sel.appendChild(optEl);
      });
      const btn = document.createElement('button');
      btn.className = 'challenge-btn';
      btn.textContent = 'Responder';
      btn.addEventListener('click', () => this.checkAnswer(sel.value));
      this.card.appendChild(sel);
      this.card.appendChild(btn);
    } else if (challenge.type === 'numeric') {
      const inputRow = document.createElement('div');
      inputRow.className = 'challenge-input-row';
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.className = 'challenge-input';
      input.placeholder = challenge.unit ? `Respuesta (${challenge.unit})` : 'Respuesta';
      const btn = document.createElement('button');
      btn.className = 'challenge-btn challenge-btn-submit';
      btn.textContent = '✓ Responder';
      btn.addEventListener('click', () => this.checkAnswer(input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.checkAnswer(input.value); });
      inputRow.appendChild(input);
      inputRow.appendChild(btn);
      this.card.appendChild(inputRow);
    }

    // Hint button
    const hintBtn = document.createElement('button');
    hintBtn.className = 'challenge-btn challenge-btn-hint';
    hintBtn.textContent = '💡 Pista';
    hintBtn.addEventListener('click', () => this.getHint());
    this.card.appendChild(hintBtn);

    // Feedback area
    const feedback = document.createElement('div');
    feedback.className = 'challenge-feedback';
    this.card.appendChild(feedback);

    this.updateProgressBar();
  }

  updateProgressBar() {
    if (this.challenges.length === 0) return;
    const pct = (this.currentIndex / this.challenges.length) * 100;
    this.progressFill.style.width = pct + '%';
  }

  updateScoreBadge() {
    this.scoreBadge.textContent = `${this.progress.score} pts`;
  }

  getProgress() {
    return { ...this.progress, total: this.challenges.length, current: this.currentIndex };
  }

  destroy() {
    this.panel.remove();
  }
}
