/**
 * Smoke de la tanda 5.3 (térmica y ondas): init → reset → 240 ticks de update →
 * draw → readout → getState/setState → destroy, sobre una escena falsa.
 * Uso: node --test skills/fisicahn/js/tests/smoke-53.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const JS = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const base = pathToFileURL(path.join(JS, 'modules') + '/');

const ESCENA = [
  'line', 'polyline', 'rect', 'arc', 'polygon', 'fill', 'body', 'vector', 'trail',
  'spring', 'pulley', 'ray', 'wavefront', 'field', 'label', 'chip', 'dimension',
  'angleArc', 'tooltip', 'pickable', 'lens', 'ellipse', 'circle', 'emphasisHalo'
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
  ['calorimetry', 'T_eq', '°C'],
  ['kinetic-theory', 'T fija', 'K'],
  ['thermal-expansion', 'ΔT', 'K'],
  ['standing-waves', 'v', 'm/s'],
  ['sound', 'v sonido', 'm/s']
];

for (const [name] of MODS) {
  test(`smoke 5.3: ${name}`, async () => {
    const mod = await import(base.href + name + '.js');
    const inst = new mod.default({
      engine: engineStub(), renderer: rendererStub(), ui: uiStub(), scene: makeScene()
    });
    inst.init({});
    inst.reset();
    for (let i = 0; i < 240; i++) inst.update(1 / 60);
    const readout = inst.readout();
    const rs = inst.getState();
    inst.setState(rs);
    inst.draw(makeScene());
    inst.destroy();
    assert.ok(readout && typeof readout === 'object', 'readout() devuelve objeto');
    const keys = Object.keys(readout).filter((k) => readout[k] && readout[k].unit != null);
    assert.ok(keys.length > 0, `readout() sin claves con unidad: ${JSON.stringify(readout)}`);
  });
}