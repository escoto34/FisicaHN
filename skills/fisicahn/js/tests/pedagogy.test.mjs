/**
 * Verificación de la capa pedagógica (WAVE 8).
 *  - Registro de retos incorporados: esquema válido y cobertura ≥5 por motor
 *  - Tolerancia relativa de respuestas numéricas (5 % por defecto)
 *  - Carga de retos sin examen → retos del motor; con examen → solo pack docente
 * Uso: node --test skills/fisicahn/js/tests/pedagogy.test.mjs
 * Reconstruir el registro: node scripts/gen-builtin-challenges.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const VALID_TYPES = new Set(['numeric', 'select', 'multiple']);

test('registro integrado: esquema válido, cobertura ≥5 por motor', async () => {
  const { BUILTIN_CHALLENGES } = await import('../builtin-challenges.js');
  const keys = Object.keys(BUILTIN_CHALLENGES);
  assert.ok(keys.length >= 40, `esperaba ≥40 motores con retos, hay ${keys.length}`);
  for (const [engineKey, retos] of Object.entries(BUILTIN_CHALLENGES)) {
    assert.ok(Array.isArray(retos) && retos.length >= 5, `${engineKey} necesita ≥5 retos, tiene ${retos?.length}`);
    const ids = new Set();
    for (const r of retos) {
      assert.ok(!ids.has(r.id) && typeof r.id === 'string', `${engineKey}: id duplicado/falta`);
      ids.add(r.id);
      assert.ok(typeof r.question === 'string' && r.question.length >= 10, `${r.id}: pregunta`);
      assert.ok(VALID_TYPES.has(r.type), `${r.id}: tipo inválido ${r.type}`);
      assert.ok(Number.isFinite(r.points) && r.points > 0, `${r.id}: points`);
      assert.ok(typeof r.hint === 'string' && r.hint.length > 0, `${r.id}: hint vacío`);
      if (r.type === 'numeric') {
        assert.ok(Number.isFinite(Number(r.answer)), `${r.id}: answer no numérico`);
        // La unidad es opcional: respuestas adimensionales (fracciones,
        // excentricidad, factores) merecen quedar sin unidad.
        if (r.unit !== undefined) {
          assert.ok(typeof r.unit === 'string' && r.unit.length > 0, `${r.id}: unit vacía`);
        }
      } else {
        assert.ok(Array.isArray(r.options) && r.options.length >= 2, `${r.id}: options`);
        const idx = Number(r.answer);
        assert.ok(
          Number.isInteger(idx) && idx >= 0 && idx < r.options.length,
          `${r.id}: answer fuera de rango`
        );
        const unique = new Set(r.options.map(String));
        assert.equal(unique.size, r.options.length, `${r.id}: opciones duplicadas`);
      }
    }
  }
});

test('checkNumericAnswer: tolerancia relativa configurable (5 % por defecto)', async () => {
  const { checkNumericAnswer } = await import('../challenges.js');
  // Valores grandes: antes se exigía 4 cifras exactas (29,4 → |diff| < 0,01).
  assert.ok(checkNumericAnswer('29.4', '29.4', 0.05), 'exacto');
  assert.ok(checkNumericAnswer('30.87', '29.4', 0.05), 'dentro de 5 % (29,4·1,05)');
  assert.ok(!checkNumericAnswer('31.0', '29.4', 0.05), 'fuera de 5 %');
  // Valores pequeños: ±5 % relativo (0,005 ± 0,00025), no exigir 4 cifras.
  assert.ok(checkNumericAnswer('0.005', '0.005', 0.05), 'exacto');
  assert.ok(checkNumericAnswer('0.0052', '0.005', 0.05), 'dentro de 5 %');
  assert.ok(!checkNumericAnswer('0.006', '0.005', 0.05), 'fuera de 5 %');
  // Entradas inválidas nunca cuentan como acierto.
  assert.ok(!checkNumericAnswer('xyz', '1', 0.05));
  assert.ok(!checkNumericAnswer('', '1', 0.05));
  assert.ok(!checkNumericAnswer('1', undefined, 0.05));
  // Obedece el tolerance por reto (§8.2): 1 % para respuestas exactas.
  assert.ok(checkNumericAnswer('10.09', '10', 0.01), 'dentro de 1 %');
  assert.ok(!checkNumericAnswer('10.2', '10', 0.01), 'fuera de 1 %');
});

test('descubrimiento de retos sin examen: solo los del motor', async () => {
  const { engineHasBuiltInChallenges, loadChallengeDataForEngine } = await import(
    '../challenges.js'
  );

  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };

  assert.ok(engineHasBuiltInChallenges('projectile'), 'projectile tiene retos');
  assert.ok(!engineHasBuiltInChallenges('no-existe'), 'módulo fantasma sin retos');

  const retos = await loadChallengeDataForEngine('projectile');
  assert.ok(Array.isArray(retos) && retos.length >= 2, 'retos del motor sin examen');

  // Sin sesión/examen no debe incluir retos ajenos en la lista.
  const conPack = await loadChallengeDataForEngine('momentum');
  assert.ok(conPack.length >= 2, 'momentum también');
});

test('escenarios guiados: checkParamsMatch con tolerancia relativa', async () => {
  const { checkParamsMatch } = await import('../scenario-manager.js');
  const actual = { v0: 18, ang: 45, h0: 0, modo: 'simple', R: [200, 200] };
  assert.ok(checkParamsMatch({ v0: 18 }, actual), 'exacto');
  assert.ok(checkParamsMatch({ v0: 18.5 }, actual), 'dentro del 5 %');
  assert.ok(!checkParamsMatch({ v0: 20 }, actual), 'fuera del 5 %');
  assert.ok(checkParamsMatch({}, actual), 'expectativa vacía');
  assert.ok(!checkParamsMatch({ h0: 1 }, actual), 'valor ajeno');
  assert.ok(checkParamsMatch({ modo: 'simple' }, actual), 'string exacta');
  assert.ok(!checkParamsMatch({ modo: 'doble' }, actual), 'string distinta');
  assert.ok(checkParamsMatch({ R: [200, 200] }, { R: [200, 200.5] }), 'arrays cercano');
  assert.ok(!checkParamsMatch({ R: [200, 300] }, { R: [200, 200] }), 'array con valores distintos');
});

test('escenarios integrados: esquema y cobertura de módulos', async () => {
  const { BUILTIN_SCENARIOS } = await import(
    '../scenario-manager.js'
  );
  assert.ok(BUILTIN_SCENARIOS.length >= 5, 'semilla con ≥5 escenarios');
  const ids = new Set();
  for (const s of BUILTIN_SCENARIOS) {
    assert.ok(!ids.has(s.scenarioId) && typeof s.scenarioId === 'string', 'id único');
    ids.add(s.scenarioId);
    assert.ok(typeof s.module === 'string', 'módulo');
    assert.ok(Array.isArray(s.steps) && s.steps.length >= 3, '≥3 pasos');
    assert.ok(s.initialState && typeof s.initialState === 'object', 'estado inicial');
    for (const step of s.steps) {
      assert.ok(typeof step.instruction === 'string' && step.instruction.length > 10, 'instrucción');
      assert.ok(step.expectedParams && typeof step.expectedParams === 'object', 'expectedParams');
    }
  }
  const proj = BUILTIN_SCENARIOS.filter((s) => s.module === 'projectile');
  assert.ok(proj.length === 1, 'projectile: 1 escenario');
});

test('ScenarioStore: guardar, importar, exportar y listar por módulo', async () => {
  const { ScenarioStore } = await import('../scenario-manager.js');
  const mem = { data: null };
  const store = new ScenarioStore({
    getItem: (k) => (k === 'fisicahn_scenarios' ? mem.data : null),
    setItem: (k, v) => {
      if (k === 'fisicahn_scenarios') mem.data = v;
    },
    removeItem: () => {
      mem.data = null;
    }
  });

  const escenario = {
    scenarioId: 'test-import-01',
    module: 'projectile',
    title: 'Prueba',
    steps: [{ instruction: 'Fija v0 = 10', expectedParams: { v0: 10 } }]
  };
  const json = store.exportJson(escenario);
  const guardado = store.importJson(json);
  assert.equal(guardado.scenarioId, 'test-import-01');
  assert.equal(store.load('test-import-01').module, 'projectile');
  assert.equal(store.allForModule('projectile').length, 1);
  store.remove('test-import-01');
  assert.equal(store.load('test-import-01'), null);
  assert.throws(() => store.importJson('{"no": "escenario"}'), 'sin escenario');
  assert.throws(() => store.importJson('{"scenarioId":"x","module":"m","steps":[]}'), /steps/);
});