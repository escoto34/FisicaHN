/**
 * WAVE 7 — Tests que aportan valor real (§7.4):
 *  1. Invariantes físicos: kinematics (MRU/MRUA exactos) y momentum
 *     (p⃗ se conserva en colisión elástica).
 *  2. Contrato de módulo: cada motor del catálogo importa, instancia y
 *     expone init/reset/update; getState/setState reversible donde existen.
 *  3. Regresión de esquema: catálogo ↔ registro de retos ↔ archivo de módulo.
 *  4. Integridad de trabajos: computeIntegrity estable entre versiones.
 *
 * Uso: node --test skills/fisicahn/js/tests/invariants.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const JS = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const MOD = pathToFileURL(path.join(JS, 'modules') + '/');

function fakeElement() {
  const el = {
    style: {},
    dataset: {},
    classList: { add() {}, toggle() {}, remove() {} },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    setAttribute() {},
    querySelector: () => null,
    click() {},
  };
  return el;
}

function fakeCanvas() {
  const absorbCtx = new Proxy({}, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (p === 'measureText') return (s) => ({ width: String(s).length * 7 });
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  return new Proxy(
    { width: 900, height: 700, style: {}, classList: { add() {}, toggle() {}, remove() {} } },
    {
      get(t, p) {
        if (p in t) return t[p];
        if (p === 'getContext') return () => absorbCtx;
        return () => {};
      },
      set(t, p, v) { t[p] = v; return true; },
    }
  );
}

globalThis.document = {
  documentElement: { style: {} },
  getElementById: () => fakeCanvas(),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => fakeElement(),
  createElementNS: () => fakeElement(),
  head: { appendChild() {} },
  body: { appendChild() {} },
};
globalThis.window = { katex: null };

const uiStub = () => new Proxy({}, {
  get(t, p) {
    if (p in t) return t[p];
    return () => {};
  },
  set(t, p, v) { t[p] = v; return true; },
});
const ctxStub = {
  engine: { reset() {}, canvas: fakeCanvas() },
  renderer: { follow() {}, resetCamera() {} },
  ui: uiStub(),
};

/* ---------- 1. Invariantes físicos ---------- */

test('kinematics: MRU — x(t) = x0 + v·t con v constante', async () => {
  const { default: Kinematics } = await import(MOD.href + 'kinematics.js');
  const inst = new Kinematics(ctxStub);
  inst.init({});
  inst.reset();
  inst.params.vx = 2;
  inst.params.vy = 0;
  inst.params.ax = 0;
  inst.params.ay = 0;
  inst.reset();
  const dt = 1 / 60;
  const steps = 300;
  const t = steps * dt;
  for (let i = 0; i < steps; i++) inst.update(dt);
  assert.ok(
    Math.abs(inst.pos.x - (-8 + 2 * t)) < 1e-9,
    `x debe avanzar 2·t: esperado ${(-8 + 2 * t).toFixed(6)}, real ${inst.pos.x.toFixed(6)}`
  );
  assert.ok(Math.abs(inst.vel.y) < 1e-12, 'vy debe permanecer 0');
  assert.ok(Math.abs(inst.vel.x - 2) < 1e-12, 'vx debe permanecer 2');
});

test('kinematics: MRAU — v(t) = v0 + a·t (pasos uniformes)', async () => {
  const { default: Kinematics } = await import(MOD.href + 'kinematics.js');
  const inst = new Kinematics(ctxStub);
  inst.init({});
  inst.reset();
  inst.params.vx = 0;
  inst.params.vy = 0;
  inst.params.ax = 0.4;
  inst.params.ay = 0.6;
  inst.reset();
  const dt = 1 / 60;
  const steps = 300;
  for (let i = 0; i < steps; i++) inst.update(dt);
  const t = steps * dt;
  assert.ok(Math.abs(inst.vel.x - 0.4 * t) < 1e-9, 'vx = a·t');
  assert.ok(Math.abs(inst.vel.y - 0.6 * t) < 1e-9, 'vy = a·t');
  // posición con aceleración: y = ½·a·t² (parte de 0)
  // el acumulador es semi-implícito: y = ½·a·dt²·n(n+1) (suma exacta)
  const n = steps;
  const expectedY = 0.6 * dt * dt * (n * (n + 1)) / 2;
  assert.ok(Math.abs(inst.pos.y - expectedY) < 2e-6, `y ≈ ½·a·t² (${expectedY.toFixed(4)})`);
});

test('momentum: p⃗ se conserva en colisión elástica (m1≠m2)', async () => {
  const { default: Momentum } = await import(MOD.href + 'momentum.js');
  const inst = new Momentum(ctxStub);
  inst.init({});
  // `init` siembra v1i/v2i y masa; forzamos condiciones iniciales válidas.
  inst.params.m1 = 2;
  inst.params.m2 = 1;
  inst.params.tipo = 'elastico';
  inst.v1 = 3;
  inst.v2 = -2;
  const p0 = inst.momentum(); // = 2·3 + 1·(−2) = 4
  const dt = 1 / 60;
  let guard = 0;
  while (!inst.collided && guard++ < 6000) inst.update(dt);
  assert.ok(inst.collided, 'la colisión debe producirse');
  const p1 = inst.momentum();
  assert.ok(Math.abs(p1 - p0) < 1e-9, `p antes ${p0} vs después ${p1}`);
  // Forma cerrada de la colisión elástica 1D:
  const { m1, m2 } = inst.params;
  const u1 = 3, u2 = -2;
  const v1f = ((m1 - m2) * u1 + 2 * m2 * u2) / (m1 + m2);
  const v2f = ((m2 - m1) * u2 + 2 * m1 * u1) / (m1 + m2);
  assert.ok(Math.abs(inst.v1 - v1f) < 1e-9, `v1' esperado ${v1f}, real ${inst.v1}`);
  assert.ok(Math.abs(inst.v2 - v2f) < 1e-9, `v2' esperado ${v2f}, real ${inst.v2}`);
});

/* ---------- 2. Contrato de módulo ---------- */

test('contrato: cada engineKey del catálogo instancia o tiene API legacy', async () => {
  const { CATALOG } = await import(pathToFileURL(path.join(JS, 'catalog.js')).href);
  const failures = [];
  for (const entry of CATALOG) {
    if (!entry.engineKey) continue; // p. ej. my-works
    const mod = await import(MOD.href + entry.engineKey + '.js');
    if (typeof mod.default === 'function') {
      const inst = new mod.default(ctxStub);
      for (const m of ['init', 'reset', 'update']) {
        if (typeof inst[m] !== 'function') failures.push(`${entry.engineKey}: falta inst.${m}()`);
      }
      inst.init({});
      inst.reset();
      inst.update(1 / 60); // no debe lanzar
    } else {
      for (const m of ['init', 'update']) {
        if (typeof mod[m] !== 'function') failures.push(`${entry.engineKey}: namespace sin ${m}()`);
      }
      mod.init(ctxStub.engine, ctxStub.renderer, ctxStub.ui, {});
      mod.update(1 / 60);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('contrato: getState/setState reversible en motores con estado', async () => {
  const { CATALOG } = await import(pathToFileURL(path.join(JS, 'catalog.js')).href);
  const failures = [];
  let checked = 0;
  for (const entry of CATALOG) {
    if (!entry.engineKey) continue;
    const mod = await import(MOD.href + entry.engineKey + '.js');
    if (typeof mod.default !== 'function') continue; // legacy: migrar en W1
    const inst = new mod.default(ctxStub);
    if (typeof inst.init !== 'function') continue;
    inst.init({});
    inst.reset();
    const get = inst.getState, set = inst.setState;
    if (typeof get !== 'function' || typeof set !== 'function') continue;
    checked++;
    let snap;
    try {
      snap = get.call(inst);
      const snap2 = get.call(inst); // doble lectura idempotente
      assert.deepEqual(JSON.parse(JSON.stringify(snap)), JSON.parse(JSON.stringify(snap2)),
        `${entry.engineKey}: getState no es idempotente`);
      set.call(inst, JSON.parse(JSON.stringify(snap)));
      const back = get.call(inst);
      assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(snap)),
        `${entry.engineKey}: setState(getState()) no es reversible`);
    } catch (e) {
      failures.push(`${entry.engineKey}: ${e.message}`);
    }
  }
  assert.ok(checked >= 8, `esperaba ≥8 motores con estado migrado, hay ${checked}`);
  assert.deepEqual(failures, [], failures.join('\n'));
});

/* ---------- 3. Regresión de esquema ---------- */

test('esquema: catálogo ↔ archivo de módulo ↔ retos integrados', async () => {
  const { CATALOG } = await import(pathToFileURL(path.join(JS, 'catalog.js')).href);
  const { BUILTIN_CHALLENGES } = await import(
    pathToFileURL(path.join(JS, 'builtin-challenges.js')).href
  );
  const entries = CATALOG.filter((e) => e.engineKey);
  const keys = entries.map((e) => e.engineKey);
  // cada entrada del catálogo tiene archivo de módulo
  const missing = keys.filter((k) => !existsSync(path.join(JS, 'modules', k + '.js')));
  assert.deepEqual(missing, [], `módulos sin archivo: ${missing}`);
  // sin retos → herramienta de enseñar rota: el registro cubre exactamente
  // los motores del catálogo (mismos keys en ambos sentidos).
  const challengeKeys = Object.keys(BUILTIN_CHALLENGES).sort();
  const catalogKeys = [...new Set(keys)].sort();
  const SIN_RETOS = new Set(['whiteboard']); // herramientas, no motores de física
  const soloCatalogo = catalogKeys.filter((k) => !challengeKeys.includes(k));
  const soloInvertido = challengeKeys.filter((k) => !catalogKeys.includes(k));
  assert.deepEqual(soloInvertido, [],
    'hay retos de motores que no están en el catálogo (regenerar registro)');
  assert.deepEqual(soloCatalogo, [...SIN_RETOS].sort(),
    'motores de catálogo sin retos (se esperan solo las herramientas)');
});

/* ---------- 4. Integridad de trabajos ---------- */

test('integridad: computeIntegrity estable entre versiones y detecta edición', async () => {
  const { computeIntegrity, verifyWork } = await import(
    pathToFileURL(path.join(JS, 'works.js')).href
  );
  const work = {
    id: 'w1', name: 'Péndulo', moduleId: 'pendulum', moduleTitle: 'Péndulo',
    studentName: 'Ana', schoolName: 'IES Norte', schoolKey: 'ies-norte',
    mode: 'practice', savedAt: '2026-01-01T00:00:00Z',
    snapshot: { params: { L: 1, theta: 30 } }, notes: 'primera clase',
  };
  const first = await computeIntegrity(work);
  const second = await computeIntegrity(work);
  assert.equal(first, second, 'misma entrada → mismo sello (estable)');

  const tampered = { ...work, snapshot: { params: { L: 1, theta: 31 } } };
  const other = await computeIntegrity(tampered);
  assert.notEqual(other, first, 'edición de parámetros → sello distinto');

  const v = await verifyWork({ ...tampered, integrity: first });
  assert.equal(v.ok, false, 'el sello debe detectar la edición');
  const ok = await verifyWork({ ...work, integrity: first });
  assert.equal(ok.ok, true, 'trabajo intacto verifica');
  const weak = await verifyWork({ ...work, integrity: 'unsigned_1' });
  assert.equal(weak.ok, true, 'sello débil (cliente) se reconoce como tal');
  assert.equal(weak.reason, 'Sello débil (cliente)');
});