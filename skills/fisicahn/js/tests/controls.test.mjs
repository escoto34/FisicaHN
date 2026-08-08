/**
 * Controls — WAVE 14, criterio de aceptación.
 *
 * Para cada módulo con esquema declarativo (`static params`, §2.7) y cada
 * param del esquema: aplica los dos extremos (min/max de un slider, los dos
 * valores límite de un select, true/false de un checkbox), ejecuta N pasos
 * de simulación en cada extremo y exige que `readout()` o la «firma» de
 * `draw(scene)` — la secuencia de llamadas a primitivas con sus argumentos —
 * cambien entre los dos extremos. Reproduce lo que hace el usuario en el
 * panel: `app.js: mountDeclarativeParams` llama `instance.reset()` tras cada
 * cambio de parámetro, así que este arnés hace lo mismo.
 *
 * Un param inerte (mover el slider no cambia nada observable) hace fallar el
 * test para ese módulo — es la clase de bug que documenta §14.2
 * (`dynamics.setUnbounded` sólo encendía, nunca apagaba) generalizada a los
 * 44 módulos.
 *
 * Alcance: cubre los módulos con `static params` (los migrados a `SimModule`
 * con el panel declarativo de §2.7). Los módulos legacy (funciones sueltas,
 * `paramControl`/`bindParamControls` a mano) no exponen un esquema
 * introspectable en tiempo de ejecución — se auditaron a mano (§14.1) en vez
 * de con este arnés genérico.
 *
 * Uso: node --test skills/fisicahn/js/tests/controls.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = pathToFileURL(
  '/home/escoto/Documentos/simulador fisica/skills/fisicahn/js/modules/'
);
const CORE = pathToFileURL(
  '/home/escoto/Documentos/simulador fisica/skills/fisicahn/js/core/'
);

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, appendChild() {}, addEventListener() {} }),
  head: { appendChild() {} },
  body: { appendChild() {} }
};
globalThis.window = { katex: null };

const uiStub = () => ({
  setParams() {}, setData() {}, setInfo() {}, setFormulas() {}, setChallenges() {},
  set() {}, showCharts() {}, setCharts() {}, showTab() {}
});

function fakeCtx() {
  const real = {};
  const c = {
    save() {}, restore() {}, setTransform() {}, transform() {}, translate() {},
    rotate() {}, scale() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    stroke() {}, fill() {}, fillRect() {}, strokeRect() {}, fillText() {}, strokeText() {},
    rect() {}, arc() {}, roundRect() {}, clip() {}, quadraticCurveTo() {}, setLineDash() {}
  };
  c.canvas = { width: 900, height: 700 };
  c.measureText = (t) => ({ width: String(t).length * 7 });
  c.createLinearGradient = () => ({ addColorStop() {} });
  c.createRadialGradient = () => ({ addColorStop() {} });
  const handler = {
    get(t, p) {
      if (p === 'symbol') return undefined;
      if (p in c) return c[p];
      if (!(p in real)) real[p] = () => {};
      return real[p];
    },
    set(t, p, v) { real[p] = v; return true; }
  };
  return new Proxy(real, handler);
}

/** Ejecuta `inst.draw(scene)` sobre una escena nueva y devuelve una firma de texto. */
function captureDrawSignature(camera, inst) {
  const scene = new Scene({ camera });
  const ctx = fakeCtx();
  scene.beginFrame(ctx, {
    theme: { bg: '#fff', name: 'light', lineScale: 1, fontScale: 1 },
    dt: 1 / 60, elapsed: 0, alpha: 0
  });
  scene.beginHud(ctx);
  const log = [];
  const wrap = (obj) =>
    new Proxy(obj, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (typeof v !== 'function' || String(prop).startsWith('_')) return v;
        if (prop === 'hud') return wrap(v);
        return (...args) => {
          log.push(`${String(prop)}(${args.map((a) => safeJson(a)).join(',')})`);
          return v.apply(target, args);
        };
      }
    });
  inst.draw(wrap(scene));
  let readoutSig = '';
  try {
    readoutSig = safeJson(inst.readout?.());
  } catch {
    readoutSig = '';
  }
  return log.join('|') + '::' + readoutSig;
}

function safeJson(v) {
  try {
    return JSON.stringify(v, (_, val) => (typeof val === 'number' ? Math.round(val * 1000) / 1000 : val));
  } catch {
    return String(v);
  }
}

function normalizeSchema(schema) {
  if (!Array.isArray(schema)) return [];
  return schema.filter((p) => p && p.id && p.type !== 'button');
}

function extremesFor(p) {
  if (p.type === 'select') {
    const opts = (p.options || []).map((o) => (o && typeof o === 'object' ? o.value : o));
    if (opts.length < 2) return null;
    return [opts[0], opts[opts.length - 1]];
  }
  if (p.type === 'checkbox') return [false, true];
  const min = p.min ?? 0;
  const max = p.max ?? 1;
  if (min === max) return null;
  return [min, max];
}

/* Módulos migrados a `SimModule` con `static params` (§2.7) — auto-descubiertos. */
const CANDIDATE_MODULES = [
  'calorimetry', 'circuits', 'elasticity', 'em-waves', 'fluids', 'hyperbola',
  'inclined-plane', 'induction', 'kinetic-theory', 'mass-weight', 'mirrors',
  'momentum', 'optical-instruments', 'oscillatory', 'particles', 'pendulum',
  'projectile', 'rotational', 'sound', 'standing-waves', 'statics',
  'thermal-expansion', 'units-error', 'vectors', 'wave-optics'
];

const { Camera } = await import(new URL('camera.js', CORE).href);
const { Scene } = await import(new URL('scene.js', CORE).href);

// 180 pasos a 1/60 s ≈ 3 s simulados — algunos módulos (choques que se
// acercan, decaimiento) no muestran ningún efecto en la primera fracción de
// segundo; 30 pasos (0.5 s) daba falsos "inertes" en momentum (el choque
// no llegaba a ocurrir dentro de la ventana).
function runSteps(inst, n = 180, dt = 1 / 60) {
  for (let i = 0; i < n; i++) inst.update?.(dt);
}

/**
 * Otros selects del esquema (`modo`, `tipo`…): muchos params sólo son
 * relevantes en una rama del `modo` — un `modo` fijo en el default haría que
 * casi todo lo demás pareciera «inerte». Se prueba el param bajo los dos
 * extremos cruzados con cada valor de esos selects, y basta con que alguna
 * combinación muestre diferencia.
 */
function otherSelectParams(schema, excludeId) {
  return schema
    .filter((p) => p.type === 'select' && p.id !== excludeId && (p.options || []).length > 1)
    .map((p) => ({
      id: p.id,
      values: p.options.map((o) => (o && typeof o === 'object' ? o.value : o))
    }));
}

function cartesian(paramsList) {
  return paramsList.reduce((acc, p) => {
    const out = [];
    for (const combo of acc) for (const v of p.values) out.push({ ...combo, [p.id]: v });
    return out;
  }, [{}]);
}

for (const name of CANDIDATE_MODULES) {
  test(`controls 14: ${name} — cada param del esquema tiene efecto observable`, async () => {
    const mod = await import(base.href + name + '.js');
    const Ctor = mod.default;
    assert.ok(Ctor, `${name}: no exporta una clase SimModule`);
    const schema = normalizeSchema(Ctor.params);
    assert.ok(schema.length, `${name}: static params está vacío`);

    const camera = new Camera({ worldWidth: 20, worldHeight: 15 });
    camera.setViewport(0, 0, 900, 700);
    const vp = Ctor.viewport;
    if (vp) camera.setWorldSize(vp.width || 20, vp.height || 15);

    const dead = [];
    for (const p of schema) {
      const ext = extremesFor(p);
      if (!ext) continue; // rango degenerado o select de una sola opción: no evaluable
      const [lo, hi] = ext;
      const combos = cartesian(otherSelectParams(schema, p.id));

      const sample = (value, combo) => {
        const inst = new Ctor({
          engine: { reset() {} },
          renderer: { follow() {}, resetCamera() {} },
          ui: uiStub(), scene: null, camera
        });
        inst.init({});
        Object.assign(inst.params, combo);
        inst.params[p.id] = value;
        inst.reset(); // mountDeclarativeParams llama reset() tras cada cambio (app.js)
        runSteps(inst);
        return captureDrawSignature(camera, inst);
      };

      const anyDiff = combos.some((combo) => sample(lo, combo) !== sample(hi, combo));
      if (!anyDiff) dead.push(p.id);
    }

    assert.deepEqual(
      dead, [],
      `${name}: param(s) sin efecto observable en draw()/readout() bajo ninguna combinación de modo: ${dead.join(', ')}`
    );
  });
}
