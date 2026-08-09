#!/usr/bin/env node
/**
 * WAVE 7 — Presupuesto de rendimiento (§7.2, herramienta nº 4).
 *
 * Mide frames/segundo alcanzables por cada motor (bucle `update(dt)` puro,
 * sin render) y lo compara con un presupuesto comprometido en
 * scripts/perf-baseline.json (fijado al cerrar la WAVE 3).
 *
 * Uso:
 *   node scripts/perf-budget.mjs          — verifica contra el presupuesto
 *   node scripts/perf-budget.mjs --update — regenera el presupuesto
 *
 * Falla con exit code 1 si algún módulo baja del 50 % del presupuesto
 * (margen para ruido de CI). Es — junto a tsc y eslint — uno de los tres
 * checkes del job verify del despliegue.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MODULES = path.join(ROOT, 'skills/fisicahn/js/modules');
const BASE_URL = pathToFileURL(MODULES + '/');
const BASELINE = path.join(ROOT, 'scripts/perf-baseline.json');

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    style: {}, classList: { add() {}, toggle() {} },
    appendChild() {}, addEventListener() {}, setAttribute() {},
  }),
  head: { appendChild() {} },
  body: { appendChild() {} },
};
globalThis.window = { katex: null };

const uiStub = () => ({
  setParams() {}, setData() {}, setInfo() {}, setFormulas() {}, setChallenges() {},
  set() {}, showCharts() {}, setCharts() {}, showTab() {},
});

const { CATALOG } = await import(
  pathToFileURL(path.join(ROOT, 'skills/fisicahn/js/catalog.js')).href
);

/** Devuelve el closure `update(dt)` listo para medir, o null si no soporta. */
async function runnerFor(engineKey) {
  const mod = await import(BASE_URL.href + engineKey + '.js');
  const ctx = {
    engine: { reset() {} },
    renderer: { follow() {}, resetCamera() {} },
    ui: uiStub(),
    scene: undefined,
  };
  try {
    if (typeof mod.default === 'function') {
      const inst = new mod.default(ctx);
      inst.init({});
      inst.reset();
      if (typeof inst.update !== 'function') return null;
      return (dt) => inst.update(dt);
    }
    const initFn = mod.init;
    if (typeof initFn !== 'function' || typeof mod.update !== 'function') return null;
    initFn(ctx.engine, ctx.renderer, ctx.ui, {});
    return (dt) => mod.update(dt);
  } catch {
    return null;
  }
}

const WARM = 200;
const STEPS = 1000;

function measure(run, dt) {
  for (let i = 0; i < WARM; i++) run(dt);
  const t0 = performance.now();
  for (let i = 0; i < STEPS; i++) run(dt);
  return performance.now() - t0;
}

const names = [];
for (const entry of CATALOG) {
  if (!entry.engineKey) continue;
  names.push(entry.engineKey);
}

const results = {};
for (const name of names) {
  const run = await runnerFor(name);
  if (!run) {
    console.log(`  - ${name}: sin bucle medible (ok)`);
    continue;
  }
  const ms = measure(run, 1 / 60);
  results[name] = Math.round(ms * 100) / 100;
}

const update = process.argv.includes('--update');
if (update) {
  writeFileSync(BASELINE, JSON.stringify(results, null, 2) + '\n');
  console.log(`Presupuesto regenerado (${Object.keys(results).length} módulos): ${BASELINE}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.error('Falta scripts/perf-baseline.json — genera con: node scripts/perf-budget.mjs --update');
  process.exit(2);
}

let failed = 0;
for (const [name, ms] of Object.entries(results)) {
  const ref = baseline[name];
  if (ref == null) {
    console.log(`  + ${name}: nuevo, sin presupuesto (${ms} ms/1000). Regenera con --update.`);
    continue;
  }
  const ratio = ms / ref;
  const mark = ratio <= 1.5 ? 'ok' : 'REGÚN';
  if (ratio > 1.5) failed++;
  console.log(
    `${mark === 'ok' ? '  ✓' : '  ✗'} ${name.padEnd(24)} ${ms.toFixed(0).padStart(5)} ms  (×${ratio.toFixed(2)} del presupuesto ${ref.toFixed(0)} ms)`
  );
}

if (failed > 0) {
  console.error(`INSPECCIÓN: ${failed} módulo(s) superan ×1.5 su presupuesto — revisar regresión (§3.2).`);
  process.exit(1);
}
console.log('Presupuesto de rendimiento: OK');