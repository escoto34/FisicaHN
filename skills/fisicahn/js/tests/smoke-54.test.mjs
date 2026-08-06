/**
 * Smoke de la tanda 5.4 (óptica y electromagnetismo): init → reset → 240 ticks
 * de update → draw → readout → getState/setState → destroy, sobre escena falsa.
 * Incluye los módulos recién migrados (circuits, em-waves) y los nuevos.
 * Uso: node --test skills/fisicahn/js/tests/smoke-54.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = pathToFileURL(
  '/home/escoto/Documentos/simulador fisica/skills/fisicahn/js/modules/'
);

const ESCENA = [
  'line', 'polyline', 'path', 'rect', 'arc', 'polygon', 'fill', 'body', 'vector',
  'trail', 'spring', 'pulley', 'ray', 'wavefront', 'field', 'label', 'chip',
  'dimension', 'angleArc', 'tooltip', 'pickable', 'circle'
];

function makeScene() {
  const scene = {
    viewport: () => ({ x: 0, y: 0, w: 900, h: 600 }),
    world: () => ({ left: -12, right: 12, top: 8, bottom: -8 }),
    dt: 1 / 60,
    elapsed: 0
  };
  for (const k of ESCENA) scene[k] = function () { return this; };
  scene.hud = {};
  for (const k of ['text', 'chip', 'legend', 'readout', 'plot', 'anchorPoint']) {
    scene.hud[k] = function () { return this; };
  }
  return scene;
}

const uiStub = () => ({
  setParams() {}, setData() {}, setInfo() {}, setFormulas() {}, setChallenges() {}, set() {}
});
const engineStub = () => ({ reset() {}, requestPaint() {}, getDelta: () => 1 / 60 });
const rendererStub = () => ({ resetCamera() {} });

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
  head: { appendChild() {} },
  body: { appendChild() {} }
};

const MODS = [
  ['mirrors', 'dᵢ'],
  ['induction', 'Φ'],
  ['optical-instruments', 'dᵢ'],
  ['circuits', 'I'],
  ['em-waves', 'θ']
];

for (const [name, keyHint] of MODS) {
  test(`smoke 5.4: ${name}`, async () => {
    const mod = await import(base.href + name + '.js');
    const inst = new mod.default({
      engine: engineStub(), renderer: rendererStub(), ui: uiStub(), scene: makeScene()
    });
    inst.init({});
    for (const mode of Object.keys(inst.params || {}).filter((k) => false)) void mode;
    inst.reset();
    for (let i = 0; i < 240; i++) inst.update(1 / 60);
    const readout = inst.readout();
    const rs = inst.getState();
    inst.setState(rs);
    inst.draw(makeScene());
    inst.destroy();
    assert.ok(readout && typeof readout === 'object', 'readout() devuelve objeto');
    assert.ok(Object.keys(readout).length > 0, 'readout() no vacío');
    if (keyHint !== 'θ') {
      assert.ok(
        Object.keys(readout).some((k) => k.includes('dᵢ') || k.includes('I') || k.includes('Φ')),
        `readout() sin magnitud clave: ${JSON.stringify(Object.keys(readout))}`
      );
    } else {
      assert.ok(
        Object.keys(readout).some((k) => k.includes('λ') || k.includes('θ')),
        `em-waves readout() sin λ/θ: ${JSON.stringify(Object.keys(readout))}`
      );
    }
  });
}

// Los módulos con `modo` multicanal: recorrer cada modo sin excepción.
test('smoke 5.4: todos los modos de em-waves, induction, optical-instruments y circuits', async () => {
  const targets = [
    ['em-waves', 'modo', ['plana', 'polarizacion']],
    ['induction', 'modo', ['faraday', 'transformador']],
    ['optical-instruments', 'modo', ['ojo', 'lupa', 'microscopio', 'telescopio']],
    ['circuits', 'mode', ['series', 'parallel', 'rlc', 'rc']],
    ['mirrors', 'tipo', ['concavo', 'convexo']]
  ];
  for (const [name, paramKey, modes] of targets) {
    const mod = await import(base.href + name + '.js');
    for (const mode of modes) {
      const inst = new mod.default({
        engine: engineStub(), renderer: rendererStub(), ui: uiStub()
      });
      inst.params[paramKey] = mode;
      inst.init({});
      inst.reset();
      for (let i = 0; i < 60; i++) inst.update(1 / 60);
      const ro = inst.readout();
      inst.draw(makeScene());
      assert.ok(typeof ro === 'object' && Object.keys(ro).length > 0, `${name}#${mode} readout vacío`);
    }
  }
});