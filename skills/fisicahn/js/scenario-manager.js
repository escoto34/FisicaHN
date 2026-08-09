/**
 * @fileoverview Escenarios guiados (WAVE 8.3) — capa pedagógica.
 *
 * Un escenario es un paquete didáctico (§8.3, skills/06-capa-pedagogica.md
 * PED-02): `initialState` (valores de parámetros), `steps[]` con una
 * instrucción y los `expectedParams` que prueban que el alumno configuró la
 * simulación como pedía el paso, y `validator` opcional para reglas que no
 * se expresan como parámetros (requisito del §8.3).
 *
 * El runner vive en la pestaña inferior «Escenarios»; la app le da un
 * adaptador { setParams(partial), getParams() } y este módulo queda sin
 * dependencias de app.js — solo importa checkNumericAnswer de challenges.js
 * para reutilizar la misma regla de tolerancia (§8.2).
 */
import { checkNumericAnswer } from './challenges.js';

/** Clave de almacenamiento local de escenarios creados por el docente. */
export const SCENARIO_STORAGE_KEY = 'fisicahn_scenarios';

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escenarios incorporados por módulo (semilla de la pestaña, como el
 * registro de retos de §8.1). Los `expectedParams` usan los ids del esquema
 * declarativo (`static params`) de cada motor.
 */
export const BUILTIN_SCENARIOS = [
  {
    scenarioId: 'proyectil-alcance-01',
    module: 'projectile',
    title: 'Tiro parabólico: el alcance',
    author: 'FísicaHN',
    duration: '20 min',
    description:
      'Investiga qué variables controlan el alcance horizontal de un tiro parabólico.',
    initialState: { v0: 18, ang: 45, h0: 0 },
    steps: [
      {
        instruction: 'Lanza con v₀ = 18 m/s y ángulo 45°. Anota el alcance.',
        expectedParams: { v0: 18, ang: 45 }
      },
      {
        instruction: 'Sube la velocidad a 25 m/s con el mismo ángulo. El alcance debe crecer ~1,4 veces.',
        expectedParams: { v0: 25, ang: 45 }
      },
      {
        instruction: 'Prueba con 30° y 60° a la misma velocidad: los alcances se parecen.',
        expectedParams: { ang: 30 }
      },
      {
        instruction: 'Lanza ahora desde una torre de 5 m con 45°.',
        expectedParams: { h0: 5 }
      }
    ]
  },
  {
    scenarioId: 'pendulo-periodo-01',
    module: 'pendulum',
    title: 'Péndulo: el período',
    author: 'FísicaHN',
    duration: '20 min',
    description: 'Descubrir que el período del péndulo simple no depende de la masa.',
    initialState: { modo: 'simple', L: 2.5, th0: 60, m: 1, roce: 0 },
    steps: [
      {
        instruction: 'Configura un péndulo simple de L = 2,5 m con ángulo 60°.',
        expectedParams: { modo: 'simple', L: 2.5, th0: 60 }
      },
      {
        instruction: 'Duplica la masa a 2 kg y observa el período: no cambia.',
        expectedParams: { m: 2 }
      },
      {
        instruction: 'Sube el ángulo inicial a 90°.',
        expectedParams: { th0: 90 }
      },
      {
        instruction: 'Acorta el péndulo a L = 1 m: el período debe ser ~√(1/2,5) ≈ 0,63 veces.',
        expectedParams: { L: 1 }
      }
    ]
  },
  {
    scenarioId: 'calor-equilibrio-01',
    module: 'calorimetry',
    title: 'Equilibrio térmico',
    author: 'FísicaHN',
    duration: '25 min',
    description: 'Determinar de qué depende la temperatura final de una mezcla.',
    initialState: { modo: 'mezcla', m1: 1, T1: 20, m2: 1, c2: 450, T2: 150 },
    steps: [
      {
        instruction: 'Mezcla 1 kg de agua a 20 °C con 1 kg de hierro (c = 450) a 150 °C.',
        expectedParams: { modo: 'mezcla', m1: 1, T1: 20, m2: 1, c2: 450, T2: 150 }
      },
      {
        instruction: 'Calienta el metal a 300 °C y observa el nuevo equilibrio.',
        expectedParams: { T2: 300 }
      },
      {
        instruction: 'Reduce el agua a 0,5 kg. El equilibrio sube aún más.',
        expectedParams: { m1: 0.5 }
      }
    ]
  },
  {
    scenarioId: 'espejos-imagenes-01',
    module: 'mirrors',
    title: 'Espejos esféricos: tipo de imagen',
    author: 'FísicaHN',
    duration: '25 min',
    description: 'Distinguir imágenes reales y virtuales en espejos cóncavos.',
    initialState: { tipo: 'concavo', f: 1.5, d0: 4, h: 1.2 },
    steps: [
      {
        instruction: 'Coloca el objeto a 4 m de un espejo cóncavo con f = 1,5 m.',
        expectedParams: { tipo: 'concavo', f: 1.5, d0: 4 }
      },
      {
        instruction: 'Acerca el objeto a 2 m (sigue fuera del foco): la imagen es real.',
        expectedParams: { d0: 2 }
      },
      {
        instruction: 'Ponlo a 1 m (dentro del foco): la imagen es virtual.',
        expectedParams: { d0: 1 }
      },
      {
        instruction: 'Cambia a espejo convexo y compara.',
        expectedParams: { tipo: 'convexo' }
      }
    ]
  },
  {
    scenarioId: 'dilatacion-viga-01',
    module: 'thermal-expansion',
    title: 'Dilatación de una viga',
    author: 'FísicaHN',
    duration: '20 min',
    description: 'Observar cómo la temperatura y el material alteran el largo del cuerpo.',
    initialState: { modo: 'lineal', material: 'acero', T: 275, L0: 2 },
    steps: [
      {
        instruction: 'Dilata linealmente una viga de acero de 2 m a 275 °C.',
        expectedParams: { modo: 'lineal', material: 'acero', L0: 2, T: 275 }
      },
      {
        instruction: 'Cálentala hasta 400 °C: se alarga más.',
        expectedParams: { T: 400 }
      },
      {
        instruction: 'Cambia el material a aluminio (α más grande): se alarga aún más.',
        expectedParams: { material: 'aluminio' }
      },
      {
        instruction: 'Pasa al modo volumétrico.',
        expectedParams: { modo: 'volumetrica' }
      }
    ]
  }
];

/**
 * Compara `expected` (subconjunto de `actual`) con la misma regla de
 * tolerancia de §8.2 para los números, y exacta para cadenas/booleanos;
 * los arrays se comparan elemento a elemento.
 *
 * @param {object} expected
 * @param {object} actual
 * @param {number} [tolerance]
 * @returns {boolean}
 */
export function checkParamsMatch(expected, actual, tolerance = 0.05) {
  for (const [key, want] of Object.entries(expected ?? {})) {
    const got = actual?.[key];
    if (Array.isArray(want)) {
      if (!Array.isArray(got) || got.length !== want.length) return false;
      for (let i = 0; i < want.length; i++) {
        if (!checkParamsMatch({ v: want[i] }, { v: got[i] }, tolerance)) return false;
      }
      continue;
    }
    if (typeof want === 'number') {
      if (!checkNumericAnswer(got, want, tolerance)) return false;
      continue;
    }
    if (want !== got) return false;
  }
  return true;
}

/**
 * Escenarios (incorporados + guardados del docente) listos para un módulo.
 * @param {string} moduleKey
 * @param {Storage} [storage]
 * @returns {object[]}
 */
export function scenariosForModule(moduleKey, storage) {
  const embed = BUILTIN_SCENARIOS.filter((s) => s.module === moduleKey);
  const saved = new ScenarioStore(storage).allForModule(moduleKey);
  return [...embed, ...saved];
}

/** Almacén local de escenarios del docente (PED-02). */
export class ScenarioStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  /** @returns {Object<string, object>} Mapa scenarioId → escenario */
  getAll() {
    try {
      const raw = this.storage?.getItem(SCENARIO_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  save(scenario) {
    if (!scenario?.scenarioId) throw new Error('Escenario sin scenarioId');
    const all = this.getAll();
    scenario.savedAt = new Date().toISOString();
    all[scenario.scenarioId] = scenario;
    this.storage?.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(all));
    return scenario;
  }

  /** @param {string} scenarioId */
  load(scenarioId) {
    return this.getAll()[scenarioId] || null;
  }

  remove(scenarioId) {
    const all = this.getAll();
    delete all[scenarioId];
    this.storage?.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(all));
  }

  /** @param {string} moduleKey */
  allForModule(moduleKey) {
    return Object.values(this.getAll()).filter((s) => s && s.module === moduleKey);
  }

  /** @param {object} scenario */
  exportJson(scenario) {
    return JSON.stringify(scenario, null, 2);
  }

  /** Valida y guarda un escenario importado (FileReader desde la UI). */
  importJson(text) {
    const scenario = JSON.parse(String(text));
    if (!scenario || typeof scenario !== 'object') throw new Error('Escenario inválido');
    if (!scenario.scenarioId || typeof scenario.scenarioId !== 'string') {
      throw new Error('Falta scenarioId');
    }
    if (!scenario.module || typeof scenario.module !== 'string') {
      throw new Error('Falta module');
    }
    if (!Array.isArray(scenario.steps) || !scenario.steps.length) {
      throw new Error('Faltan steps');
    }
    for (const step of scenario.steps) {
      if (!step.instruction || typeof step.instruction !== 'string') {
        throw new Error('Paso sin instrucción');
      }
      if (!step.expectedParams || typeof step.expectedParams !== 'object') {
        throw new Error('Paso sin expectedParams');
      }
    }
    return this.save(scenario);
  }
}

/**
 * Verifica el paso actual del escenario contra los parámetros reales del
 * módulo (o contra un `validator` si el paso lo declara).
 *
 * @param {object} step
 * @param {object} params
 * @returns {boolean}
 */
export function checkStepFulfilled(step, params) {
  if (typeof step?.validator === 'function') return step.validator(params);
  return checkParamsMatch(step?.expectedParams, params);
}

/**
 * Reproduce un escenario en un contenedor dado.
 *
 * @param {HTMLElement} mount
 * @param {{ engineKey: string, scenarios: object[] }} data
 * @param {object} adapter - { getParams(): object, setParams(partial): void }
 */
export class ScenarioRunner {
  constructor(mount, data = null, adapter = null) {
    this.mount = mount;
    this.adapter = adapter;
    this.list = data?.scenarios || [];
    this.current = 0;
    this.stepIndex = 0;
    this.done = false;
    this.build();
    if (this.list.length) this.render();
  }

  destroy() {
    this.mount.innerHTML = '';
  }

  build() {
    this.mount.innerHTML = `
      <div class="scenario-shell">
        <div class="scenario-head">
          <select class="custom-select scenario-select" aria-label="Escenario del módulo"></select>
          <div class="scenario-title"></div>
          <div class="scenario-meta"></div>
        </div>
        <div class="scenario-progress">
          <div class="scenario-progress-fill"></div>
        </div>
        <div class="scenario-card"></div>
      </div>
    `;
    this.select = this.mount.querySelector('.scenario-select');
    this.titleEl = this.mount.querySelector('.scenario-title');
    this.metaEl = this.mount.querySelector('.scenario-meta');
    this.fill = this.mount.querySelector('.scenario-progress-fill');
    this.card = this.mount.querySelector('.scenario-card');

    this.select.addEventListener('change', () => {
      this.current = Number(this.select.value);
      this.stepIndex = 0;
      this.done = false;
      this.render();
    });
  }

  buildOptions() {
    this.select.innerHTML = this.list
      .map((s, i) => `<option value="${i}">${escapeHtml(s.title || s.scenarioId)}</option>`)
      .join('');
  }

  currentScenario() {
    return this.list[this.current];
  }

  render() {
    this.buildOptions();
    const s = this.currentScenario();
    if (!s) {
      this.card.innerHTML =
        '<p class="scenario-empty">No hay escenarios para este módulo.</p>';
      return;
    }
    this.titleEl.textContent = s.title || s.scenarioId;
    this.metaEl.textContent = [s.author, s.duration].filter(Boolean).join(' · ');
    this.fill.style.width = `${Math.round((this.stepIndex / s.steps.length) * 100)}%`;
    this.renderStep();
  }

  renderStep() {
    const s = this.currentScenario();
    if (this.done) {
      this.card.innerHTML = `
        <div class="scenario-step">
          <p class="scenario-step-text"><strong>¡Escenario completado!</strong>
          Repite la secuencia o elige otro escenario.</p>
          <button type="button" class="challenge-btn challenge-btn-restart">Reiniciar</button>
        </div>
      `;
      this.card.querySelector('.challenge-btn-restart').addEventListener('click', () => {
        this.stepIndex = 0;
        this.done = false;
        this.render();
      });
      return;
    }

    const step = s.steps[this.stepIndex];
    this.card.innerHTML = `
      <div class="scenario-step">
        <p class="scenario-step-n">Paso ${this.stepIndex + 1} de ${s.steps.length}</p>
        <p class="scenario-step-text">${escapeHtml(step.instruction)}</p>
        ${
          step.expectedParams && Object.keys(step.expectedParams).length
            ? `<p class="scenario-step-expected">Valores esperados: ${escapeHtml(
                Object.entries(step.expectedParams)
                  .map(([k, v]) => `${k} = ${Array.isArray(v) ? JSON.stringify(v) : v}`)
                  .join(', ')
              )}</p>`
            : ''
        }
        <div class="scenario-controls">
          <button type="button" class="challenge-btn scenario-apply">Configurar así</button>
          <button type="button" class="challenge-btn scenario-check">Comprobar configuración</button>
        </div>
        <p class="scenario-feedback"></p>
      </div>
    `;

    const checkBtn = this.card.querySelector('.scenario-check');
    const feedback = this.card.querySelector('.scenario-feedback');

    this.card.querySelector('.scenario-apply').addEventListener('click', () => {
      // Paso 0 aplica el estado inicial completo; los demás, lo pedido en
      // el expectedParams del paso.
      if (this.stepIndex === 0 && s.initialState) {
        this.adapter?.setParams?.(s.initialState);
      } else {
        this.adapter?.setParams?.(step.expectedParams);
      }
      feedback.textContent = '';
      feedback.style.color = '';
    });

    checkBtn.addEventListener('click', () => {
      const params = this.adapter?.getParams?.() || {};
      const ok = checkStepFulfilled(step, params);
      feedback.textContent = ok
        ? '✔ Configuración correcta. Continúa.'
        : '✘ Aún no coincide. Revisa los valores y pulsa «Configurar así» o ajústalos a mano.';
      feedback.style.color = ok ? 'var(--accent, #3ecfbf)' : 'var(--error, #ef5350)';
      if (ok) {
        if (this.stepIndex < s.steps.length - 1) {
          this.stepIndex++;
          this.render();
        } else {
          this.done = true;
          this.render();
        }
      }
    });
  }
}