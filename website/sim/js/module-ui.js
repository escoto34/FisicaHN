/**
 * Utilidades de UI compartidas por módulos:
 * - info + Historia y casos prácticos
 * - fórmulas con LaTeX (KaTeX)
 * - parámetros: slider + campo de texto numérico en todos
 */

/* ============================================
   LaTeX / KaTeX
   ============================================ */

function katexReady() {
  return typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function';
}

/** Carga KaTeX offline solo cuando hace falta (catálogo sin ~300 KB JS/CSS). */
let _katexLoadPromise = null;
export function ensureKatex() {
  if (katexReady()) return Promise.resolve(true);
  if (_katexLoadPromise) return _katexLoadPromise;
  _katexLoadPromise = new Promise((resolve) => {
    const base = 'assets/katex/';
    if (!document.querySelector('link[data-katex-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = base + 'katex.min.css';
      link.dataset.katexCss = '1';
      document.head.appendChild(link);
    }
    const existing = document.querySelector('script[data-katex-js]');
    if (existing) {
      if (katexReady()) {
        resolve(true);
        return;
      }
      existing.addEventListener('load', () => resolve(katexReady()), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = base + 'katex.min.js';
    s.async = true;
    s.dataset.katexJs = '1';
    s.onload = () => resolve(katexReady());
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return _katexLoadPromise;
}

/** Espera a KaTeX y reintenta typeset. */
function whenKatex(cb) {
  if (katexReady()) {
    cb();
    return;
  }
  ensureKatex().then(() => {
    if (katexReady()) {
      cb();
      return;
    }
    // fallback: reintentos cortos si el script aún no expuso window.katex
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      if (katexReady() || n > 25) {
        clearInterval(id);
        cb();
      }
    }, 40);
  });
}

/** CSS de retos: solo al montar la pestaña Retos. */
let _challengesCssLoaded = false;
export function ensureChallengesCss() {
  if (_challengesCssLoaded || document.querySelector('link[data-challenges-css]')) {
    _challengesCssLoaded = true;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/challenges.css';
  link.dataset.challengesCss = '1';
  document.head.appendChild(link);
  _challengesCssLoaded = true;
}

/**
 * Convierte notación “humana” / HTML a LaTeX aproximado.
 * @param {string} input
 */
export function htmlToLatex(input) {
  let t = String(input ?? '');
  t = t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&minus;/g, '-')
    .replace(/&middot;/g, '\\cdot ')
    .replace(/&times;/g, '\\times ')
    .replace(/&plusmn;/g, '\\pm ')
    .replace(/&nbsp;/g, ' ');

  t = t.replace(/<sub>([\s\S]*?)<\/sub>/gi, '_{$1}');
  t = t.replace(/<sup>([\s\S]*?)<\/sup>/gi, '^{$1}');
  t = t.replace(/<\/?[^>]+>/g, '');

  // raíces y potencias unicode
  t = t.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
  t = t.replace(/√\[([^\]]+)\]/g, '\\sqrt{$1}');
  t = t.replace(/√\s*\{/g, '\\sqrt{');
  t = t.replace(/√([A-Za-z0-9\\{])/g, '\\sqrt{$1}');

  t = t.replace(/([A-Za-z])⃗/g, '\\vec{$1}');
  t = t.replace(/([A-Za-z])̂/g, '\\hat{$1}');

  const uni = [
    ['·', '\\cdot '],
    ['×', '\\times '],
    ['÷', '\\div '],
    ['−', '-'],
    ['–', '-'],
    ['—', '-'],
    ['≈', '\\approx '],
    ['≠', '\\neq '],
    ['≤', '\\leq '],
    ['≥', '\\geq '],
    ['±', '\\pm '],
    ['π', '\\pi '],
    ['θ', '\\theta '],
    ['φ', '\\varphi '],
    ['ϕ', '\\phi '],
    ['ω', '\\omega '],
    ['α', '\\alpha '],
    ['β', '\\beta '],
    ['γ', '\\gamma '],
    ['δ', '\\delta '],
    ['λ', '\\lambda '],
    ['μ', '\\mu '],
    ['ρ', '\\rho '],
    ['σ', '\\sigma '],
    ['τ', '\\tau '],
    ['η', '\\eta '],
    ['κ', '\\kappa '],
    ['ε', '\\varepsilon '],
    ['Σ', '\\Sigma '],
    ['Δ', '\\Delta '],
    ['∂', '\\partial '],
    ['∞', '\\infty '],
    ['ℏ', '\\hbar '],
    ['⊥', '\\perp '],
    ['°', '^{\\circ}'],
    ['²', '^{2}'],
    ['³', '^{3}'],
    ['⁴', '^{4}'],
    ['½', '\\frac{1}{2}'],
    ['₀', '_{0}'],
    ['₁', '_{1}'],
    ['₂', '_{2}'],
    ['₃', '_{3}'],
    ['ᵢ', '_{i}'],
    ['ₙ', '_{n}'],
    ['ₕ', '_{h}'],
    ['ₑ', '_{e}'],
    ['ₖ', '_{k}'],
    ['ₘ', '_{m}'],
    ['ₛ', '_{s}'],
    ['ₜ', '_{t}'],
    ['′', "'"],
    ['→', '\\rightarrow '],
    ['←', '\\leftarrow '],
    ['↔', '\\leftrightarrow '],
    ['∝', '\\propto '],
    ['∠', '\\angle '],
    ['∥', '\\parallel ']
  ];
  for (const [a, b] of uni) t = t.split(a).join(b);

  // ½ k A² already handled; e^{-...} ok
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * Renderiza LaTeX a HTML (string). Fallback: texto plano.
 * @param {string} latex
 * @param {{ displayMode?: boolean }} opts
 */
export function renderLatex(latex, opts = {}) {
  const src = String(latex ?? '').trim();
  if (!src) return '';
  if (!katexReady()) {
    return `<span class="tex-fallback">${escapeHtml(src)}</span>`;
  }
  try {
    return window.katex.renderToString(src, {
      throwOnError: false,
      displayMode: !!opts.displayMode,
      strict: 'ignore',
      trust: false,
      output: 'html'
    });
  } catch {
    return `<span class="tex-fallback">${escapeHtml(src)}</span>`;
  }
}

/**
 * Sustituye $...$ y \(...\) en un HTML por KaTeX.
 * @param {string} html
 */
export function renderDollarMath(html) {
  let s = String(html ?? '');
  // \( ... \)
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => renderLatex(tex.trim(), { displayMode: false }));
  // \[ ... \]
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => renderLatex(tex.trim(), { displayMode: true }));
  // $...$ (no $$)
  s = s.replace(/\$([^$\n]+)\$/g, (_, tex) => renderLatex(tex.trim(), { displayMode: false }));
  return s;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

/**
 * Span listo para typeset: data-tex="..."
 * @param {string} latex
 * @param {{ display?: boolean }} opts
 */
export function texSpan(latex, opts = {}) {
  return `<span class="tex" data-tex="${escapeAttr(latex)}"${opts.display ? ' data-display="1"' : ''}></span>`;
}

/**
 * Etiqueta de parámetro con símbolo LaTeX + texto/unidad.
 * @param {string} latexSymbol p.ej. "m_1"
 * @param {string} [rest] p.ej. "(kg)" o "masa"
 */
export function paramLabel(latexSymbol, rest = '') {
  const tail = rest ? ` ${escapeHtml(rest)}` : '';
  return `${texSpan(latexSymbol)}${tail}`;
}

/**
 * Typeset en un subárbol del DOM.
 * @param {ParentNode | null} root
 */
export function typesetMath(root, _retried = false) {
  if (!root) return;
  if (!katexReady()) {
    if (!_retried) whenKatex(() => typesetMath(root, true));
    return;
  }

  root.querySelectorAll('[data-tex]').forEach((el) => {
    if (el.dataset.texDone === '1') return;
    const tex = el.getAttribute('data-tex') || '';
    if (!tex) return;
    if (katexReady()) {
      try {
        window.katex.render(tex, el, {
          throwOnError: false,
          displayMode: el.dataset.display === '1',
          strict: 'ignore'
        });
        el.dataset.texDone = '1';
        return;
      } catch {
        /* fallthrough */
      }
    }
    el.textContent = tex;
    el.dataset.texDone = '1';
  });

  root.querySelectorAll('.formula-expr').forEach((el) => {
    if (el.dataset.texDone === '1') return;
    if (el.querySelector('.katex')) {
      el.dataset.texDone = '1';
      return;
    }
    const raw = el.getAttribute('data-latex') || el.textContent || '';
    const latex = el.getAttribute('data-latex') ? raw : htmlToLatex(raw);
    el.innerHTML = renderLatex(latex, { displayMode: false });
    el.dataset.texDone = '1';
  });

  root.querySelectorAll('.control-label, .formula-name, .formula-note, .param-unit').forEach((el) => {
    if (el.dataset.texDone === '1') return;
    if (el.querySelector('.katex, [data-tex]')) {
      // typeset children data-tex already handled; mark done
      el.dataset.texDone = '1';
      return;
    }
    const html = el.innerHTML;
    if (!html) return;
    if (html.includes('$') || html.includes('\\(') || /<sub>|<sup>/.test(html) || /[μθωπαλφηκσεΔ∂ℏπτγΣ√·²₃₀₁₂]/.test(html)) {
      // Convert HTML subs then dollar-render / full latex for pure math labels
      let next = html;
      if (/<sub>|<sup>/.test(next) || /[μθωπαλφηκσεΔ∂ℏπτγΣ√·²₀₁₂₃]/.test(next)) {
        // If the whole label looks like a formula-ish token, render as latex
        const plain = next.replace(/<[^>]+>/g, '');
        if (/[=√∂∑∫]/.test(plain)) {
          el.innerHTML = renderLatex(htmlToLatex(next));
        } else {
          next = next
            .replace(/<sub>([\s\S]*?)<\/sub>/gi, '$_{$1}$')
            .replace(/<sup>([\s\S]*?)<\/sup>/gi, '$^{$1}$');
          // greek letters → $...$
          next = next.replace(/([μθωπαλφηκσεΔ∂ℏπτγΣ])/g, '$$$1$$');
          // m1, v0, R2 as symbols when alone at start
          next = next.replace(/(^|[\s>])([A-Za-z])(\d+)(?=[\s<(]|$)/g, '$1$$$2_$3$$');
          el.innerHTML = renderDollarMath(htmlToLatexKeepText(next));
        }
      } else if (html.includes('$') || html.includes('\\(')) {
        el.innerHTML = renderDollarMath(html);
      }
      el.dataset.texDone = '1';
    }
  });
}

/** htmlToLatex but preserve already $-wrapped segments roughly */
function htmlToLatexKeepText(html) {
  // Only convert unicode outside of $...$
  const parts = String(html).split(/(\$[^$]+\$)/g);
  return parts
    .map((p) => {
      if (p.startsWith('$') && p.endsWith('$')) {
        const inner = p.slice(1, -1);
        return `$${htmlToLatex(inner)}$`;
      }
      return p;
    })
    .join('');
}

/* ============================================
   Info / fórmulas
   ============================================ */

/**
 * @param {object} ui
 * @param {{ title: string, blurb: string, story?: string, cases?: string[] }} content
 */
export function setModuleInfo(ui, content) {
  const title = content.title || 'Módulo';
  const blurb = content.blurb || '';
  const story = content.story || '';
  const cases = Array.isArray(content.cases) ? content.cases : [];

  const casesHtml = cases.length
    ? `<ul class="info-cases">${cases.map((c) => `<li>${c}</li>`).join('')}</ul>`
    : '';

  ui.setInfo(`
    <div class="module-info-block">
      <p class="tab-text"><strong>${escapeHtml(title)}</strong> — ${blurb}</p>
      <button type="button" class="ctrl-btn info-story-btn" id="moduleStoryBtn" aria-expanded="false">
        Historia y casos prácticos
      </button>
      <div class="module-story-panel" id="moduleStoryPanel" hidden>
        ${story ? `<p class="tab-text story-text">${story}</p>` : ''}
        ${casesHtml}
      </div>
    </div>
  `);

  setTimeout(() => {
    const btn = document.getElementById('moduleStoryBtn');
    const panel = document.getElementById('moduleStoryPanel');
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      const open = panel.hasAttribute('hidden');
      if (open) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    typesetMath(document.getElementById('tab-info'));
  }, 0);
}

/**
 * Fórmulas con LaTeX (KaTeX).
 * Cada item: { name, formula | latex, note? }
 * `formula` se convierte automáticamente a LaTeX si no viene `latex`.
 * @param {object} ui
 * @param {{ title?: string, items: { name: string, formula?: string, latex?: string, note?: string }[] }} data
 */
export function setModuleFormulas(ui, data) {
  const items = data.items || [];
  const title = data.title ? `<p class="formula-section-title">${escapeHtml(data.title)}</p>` : '';
  const rows = items
    .map((it) => {
      const latex = (it.latex || htmlToLatex(it.formula || '')).trim();
      // data-latex: typesetMath / reintento cuando KaTeX esté listo
      const expr = katexReady()
        ? renderLatex(latex, { displayMode: false })
        : `<span class="tex-fallback">${escapeHtml(latex)}</span>`;
      const note = it.note
        ? `<div class="formula-note">${katexReady() ? renderDollarMath(String(it.note)) : escapeHtml(String(it.note))}</div>`
        : '';
      return `
    <div class="formula-card">
      <div class="formula-name">${escapeHtml(it.name || '')}</div>
      <div class="formula-expr" data-latex="${escapeAttr(latex)}"${katexReady() ? ' data-tex-done="1"' : ''}>${expr}</div>
      ${note}
    </div>`;
    })
    .join('');
  ui.setFormulas(`
    <div class="formulas-readable">
      ${title}
      ${rows || '<p class="tab-text placeholder-text">Sin fórmulas en este módulo.</p>'}
    </div>
  `);
  setTimeout(() => typesetMath(document.getElementById('tab-formulas')), 0);
}

/* ============================================
   Parámetros: slider + texto
   ============================================ */

/**
 * Control: etiqueta (LaTeX opcional) + slider + input numérico (texto).
 * @param {{
 *   id: string,
 *   label?: string,
 *   labelTex?: string,
 *   labelRest?: string,
 *   min: number,
 *   max: number,
 *   step: number,
 *   value: number,
 *   unit?: string,
 *   unitTex?: string
 * }} p
 */
export function paramControl(p) {
  let labelHtml;
  if (p.labelTex) {
    labelHtml = paramLabel(p.labelTex, p.labelRest || '');
  } else {
    labelHtml = p.label || p.id;
  }
  const unit = p.unitTex
    ? ` <span class="param-unit">${texSpan(p.unitTex)}</span>`
    : p.unit
      ? ` <span class="param-unit">${escapeHtml(p.unit)}</span>`
      : '';
  return `
    <div class="control-group param-control" data-param="${p.id}">
      <label class="control-label" for="param_${p.id}">${labelHtml}${unit}</label>
      <div class="param-row">
        <input type="range" class="custom-slider" id="param_${p.id}"
          min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}">
        <input type="number" class="param-number" id="num_${p.id}"
          min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}"
          inputmode="decimal" aria-label="Valor numérico de ${escapeAttr(p.labelTex || p.label || p.id)}">
      </div>
    </div>
  `;
}

/**
 * Enlaza slider e input numérico; llama onChange(id, value).
 * @param {string[]} ids
 * @param {(id: string, value: number, source?: string) => void} onChange
 */
export function bindParamControls(ids, onChange) {
  ids.forEach((id) => {
    const range = document.getElementById(`param_${id}`);
    const num = document.getElementById(`num_${id}`);
    if (!range || !num) return;

    const apply = (raw, source) => {
      let v = parseFloat(String(raw).replace(',', '.'));
      if (!Number.isFinite(v)) return;
      const min = parseFloat(range.min);
      const max = parseFloat(range.max);
      if (Number.isFinite(min)) v = Math.max(min, v);
      if (Number.isFinite(max)) v = Math.min(max, v);
      const step = parseFloat(range.step) || 0.1;
      const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
      v = Number(v.toFixed(Math.min(decimals, 8)));
      range.value = String(v);
      num.value = String(v);
      onChange(id, v, source);
    };

    range.addEventListener('input', () => apply(range.value, 'range'));
    num.addEventListener('change', () => apply(num.value, 'number'));
    num.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply(num.value, 'number');
      }
    });
  });
}

/**
 * Tras setParams: añade input de texto a todo range y typeset LaTeX en etiquetas.
 * Compatible con módulos que actualizan un &lt;span&gt; hermano vía textContent.
 * @param {ParentNode | null} root
 */
export function enhanceParamsPanel(root) {
  if (!root) return;

  root.querySelectorAll('input[type="range"]').forEach((range) => {
    if (range.dataset.numBound === '1') return;
    range.dataset.numBound = '1';

    const group = range.closest('.control-group, .param-control') || range.parentElement;
    let row = range.closest('.param-row, .slider-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'param-row';
      range.parentNode?.insertBefore(row, range);
      row.appendChild(range);
    } else if (row.classList.contains('slider-row')) {
      row.classList.add('param-row');
    }

    // ¿Ya hay input numérico en la fila/grupo?
    const idBase = String(range.id || '').replace(/^param_/, '');
    let num =
      row.querySelector('input.param-number, input[type="number"]') ||
      (idBase && group
        ? group.querySelector(`input.param-number#num_${idBase.replace(/\\/g, '')}`)
        : null) ||
      null;

    // Span de valor (patrón clásico: range + span#d_*)
    let valueSpan = null;
    const sibling = range.nextElementSibling;
    if (sibling && sibling.tagName === 'SPAN' && !sibling.classList.contains('param-unit')) {
      valueSpan = sibling;
    }
    if (!valueSpan && row) {
      const spans = [...row.querySelectorAll('span')].filter(
        (s) => !s.classList.contains('param-unit') && !s.classList.contains('katex')
      );
      valueSpan = spans.find((s) => s !== range) || null;
    }

    if (!num) {
      num = document.createElement('input');
      num.type = 'number';
      num.className = 'param-number';
      num.inputMode = 'decimal';
      if (range.min !== '') num.min = range.min;
      if (range.max !== '') num.max = range.max;
      if (range.step !== '') num.step = range.step;
      num.value = range.value;

      // Reutilizar id del span de valor para que módulos que hacen getElementById(d_*) sigan funcionando
      if (valueSpan?.id) {
        num.id = valueSpan.id;
      } else if (range.id) {
        const base = range.id.replace(/^param_/, '').replace(/^m_/, '').replace(/^p_/, '');
        num.id = `num_${base || range.id}`;
      }

      num.setAttribute(
        'aria-label',
        `Valor numérico${range.id ? ' (' + range.id + ')' : ''}`
      );

      // Módulos antiguos hacen el.textContent = valor sobre el span
      try {
        Object.defineProperty(num, 'textContent', {
          configurable: true,
          get() {
            return this.value;
          },
          set(v) {
            const n = parseFloat(String(v).replace(',', '.'));
            if (Number.isFinite(n)) this.value = String(n);
          }
        });
      } catch {
        /* ignore */
      }

      if (valueSpan) {
        valueSpan.replaceWith(num);
      } else {
        row.appendChild(num);
      }
    } else {
      // Alinear min/max/step
      if (range.min !== '') num.min = range.min;
      if (range.max !== '') num.max = range.max;
      if (range.step !== '') num.step = range.step;
      if (!num.value) num.value = range.value;
      if (valueSpan && valueSpan !== num) {
        try {
          valueSpan.remove();
        } catch {
          /* ignore */
        }
      }
    }

    const clamp = (raw) => {
      let v = parseFloat(String(raw).replace(',', '.'));
      if (!Number.isFinite(v)) return null;
      const min = parseFloat(range.min);
      const max = parseFloat(range.max);
      if (Number.isFinite(min)) v = Math.max(min, v);
      if (Number.isFinite(max)) v = Math.min(max, v);
      const step = parseFloat(range.step);
      if (Number.isFinite(step) && step > 0) {
        const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
        // no forzar múltiplo estricto si el usuario escribe valor intermedio; solo redondeo suave
        v = Number(v.toFixed(Math.max(decimals, 4)));
      }
      return v;
    };

    const fromRange = () => {
      num.value = range.value;
    };
    const fromNum = () => {
      const v = clamp(num.value);
      if (v == null) {
        num.value = range.value;
        return;
      }
      num.value = String(v);
      range.value = String(v);
      // Disparar listeners del módulo (input en el range)
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
    };

    range.addEventListener('input', fromRange);
    range.addEventListener('change', fromRange);
    num.addEventListener('change', fromNum);
    num.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        fromNum();
        num.blur();
      }
    });
  });

  typesetMath(root);
}

/** Limpia la pestaña de retos (módulo sin casos / pizarra). */
export function clearChallenges(ui) {
  if (ui && typeof ui.setChallenges === 'function') {
    ui.setChallenges(null);
  }
}

/**
 * Carga retos en la pestaña inferior si el motor tiene casos de uso o pack de examen.
 * @param {object} ui
 * @param {string} engineKey
 */
export async function loadModuleChallenges(ui, engineKey) {
  if (!ui || typeof ui.setChallenges !== 'function') return;
  if (!engineKey || engineKey === 'whiteboard' || engineKey === 'placeholder') {
    ui.setChallenges(null);
    return;
  }
  try {
    const { loadChallengeDataForEngine, engineHasBuiltInChallenges, getCachedExamChallengePack } =
      await import('./challenges.js');
    const data = await loadChallengeDataForEngine(engineKey);
    const examPack = getCachedExamChallengePack();
    const hasExam = Boolean(examPack?.modules?.[engineKey]?.length);
    if (!data.length && !engineHasBuiltInChallenges(engineKey) && !hasExam) {
      ui.setChallenges(null);
      return;
    }
    ui.setChallenges({ engineKey, challenges: data });
  } catch (e) {
    console.warn('Retos no cargados', e);
    ui.setChallenges(null);
  }
}
