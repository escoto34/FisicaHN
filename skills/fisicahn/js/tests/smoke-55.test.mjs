/**
 * Smoke 5.5 — auditoría de encuadre (bbox) de los módulos corregidos en la
 * tanda 5.1/5.2 + defaults de espacio infinito.
 *
 * Reproduce `Camera → Scene → ctx falso` del navegador: intercepta cada
 * primitiva del lienzo llevando la matriz de transformación por op, proyecta
 * los extremos de cada figura al viewbox 900×700 y falla si algo queda fuera
 * de [-3, 903] × [-3, 703] px.
 *
 * Uso: node --test skills/fisicahn/js/tests/smoke-55.test.mjs
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

/* Matriz 2D afín [a b c d e f]: x' = a·x + c·y + e ; y' = b·x + d·y + f */
const ID = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5]
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function fakeCtx() {
  const ops = [];
  let m = ID.slice();
  const stack = [];
  const real = {};
  const c = {
    save() { stack.push(m); },
    restore() { m = stack.pop() || ID; },
    setTransform(a, b, c2, d, e, f) { m = [a, b, c2, d, e, f]; },
    transform(a, b, c2, d, e, f) { m = mul(m, [a, b, c2, d, e, f]); },
    translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); },
    rotate(a) { const ct = Math.cos(a), st = Math.sin(a); m = mul(m, [ct, st, -st, ct, 0, 0]); },
    scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); }
  };
  c.canvas = { width: 900, height: 700 };
  c.measureText = (t) => ({ width: String(t).length * 7 });
  c.createLinearGradient = () => ({ addColorStop() {} });
  const handler = {
    get(t, p) {
      if (p === 'symbol') return undefined;
      if (p in c) return c[p];
      if (!(p in real)) real[p] = (...a) => { ops.push([String(p), m, ...a]); };
      return real[p];
    },
    set(t, p, v) { real[p] = v; return true; }
  };
  const proxy = new Proxy(real, handler);
  proxy.ops = ops;
  return proxy;
}

function geomPoints(op, m, args) {
  const P = (x, y) => apply(m, x, y);
  const out = [];
  const num = args.filter((v, i) => i >= 0 && typeof v === 'number');
  switch (op) {
    case 'rect':
    case 'fillRect':
    case 'strokeRect': {
      const [x, y, w, h] = num;
      out.push(P(x, y), P(x + w, y), P(x, y + h), P(x + w, y + h));
      break;
    }
    case 'moveTo':
    case 'lineTo': {
      out.push(P(num[0], num[1]));
      break;
    }
    case 'arc': {
      const [x, y, r, a0 = 0, a1 = 2 * Math.PI] = num;
      for (let k = 0; k <= 8; k++) {
        const t = a0 + ((a1 - a0) * k) / 8;
        out.push(P(x + r * Math.cos(t), y + r * Math.sin(t)));
      }
      break;
    }
    case 'circle': {
      const [x, y, r] = num;
      for (let k = 0; k <= 8; k += 2) out.push(P(x + r * Math.cos(k), y + r * Math.sin(k)));
      break;
    }
    case 'ellipse': {
      const [x, y, rx, ry] = num;
      for (let k = 0; k <= 8; k += 2) out.push(P(x + rx * Math.cos(k), y + ry * Math.sin(k)));
      break;
    }
    default: break;
  }
  return out;
}

const GEO = ['rect', 'arc', 'circle', 'ellipse', 'moveTo', 'lineTo', 'fillRect', 'strokeRect'];
const MARGIN = 3;
const LIMITS = { minX: -MARGIN, maxX: 900 + MARGIN, minY: -MARGIN, maxY: 700 + MARGIN };

const FIXED = [
  'mass-weight', 'fluids', 'inclined-plane', 'elasticity',
  'units-error', 'oscillatory', 'projectile', 'vectors', 'kinetic-theory',
  'hyperbola'
];

for (const name of FIXED) {
  test(`bbox 5.5: ${name} dentro del viewbox`, async () => {
    const { Camera } = await import(new URL('camera.js', CORE).href);
    const { Scene } = await import(new URL('scene.js', CORE).href);
    const mod = await import(base.href + name + '.js');
    const Ctor = mod.default;
    const camera = new Camera({ worldWidth: 20, worldHeight: 15 });
    camera.setViewport(0, 0, 900, 700);
    const vp = Ctor.viewport;
    if (vp) camera.setWorldSize(vp.width || 20, vp.height || 15);
    const scene = new Scene({ camera });
    const ctx = fakeCtx();
    scene.beginFrame(ctx, {
      theme: { bg: '#fff', name: 'light', lineScale: 1, fontScale: 1 },
      dt: 1 / 60, elapsed: 0, alpha: 0
    });
    scene.beginHud(ctx);
    const inst = new Ctor({
      engine: { reset() {} },
      renderer: { follow() {}, resetCamera() {} },
      ui: uiStub(), scene, camera
    });
    inst.init({});
    inst.reset();
    inst.draw(scene);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let any = false;
    for (const [op, m, ...args] of ctx.ops) {
      if (!GEO.includes(op)) continue;
      for (const [x, y] of geomPoints(op, m, args)) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        any = true;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    assert.ok(any, `${name}: draw() no emitió geometría`);
    assert.ok(
      minX >= LIMITS.minX && minY >= LIMITS.minY &&
      maxX <= LIMITS.maxX && maxY <= LIMITS.maxY,
      `${name}: fuera del viewbox (x ${Math.round(minX)}..${Math.round(maxX)}, ` +
        `y ${Math.round(minY)}..${Math.round(maxY)})`
    );
  });
}

test('defaults 5.5: unbounded=true en kinematics, dynamics y magnetic', async () => {
  const ctxSim = { engine: { reset() {} }, renderer: { resetCamera() {}, follow() {} }, ui: uiStub() };
  const kin = new (await import(base.href + 'kinematics.js')).default(ctxSim);
  kin.init({});
  assert.equal(kin.unbounded, true, 'kinematics: unbounded debe iniciar en true');

  const dynNs = await import(base.href + 'dynamics.js');
  dynNs.init(ctxSim.engine, ctxSim.renderer, ctxSim.ui, {});
  assert.equal(dynNs.getState().unbounded, true, 'dynamics: unbounded debe iniciar en true');

  const magNs = await import(base.href + 'magnetic.js');
  magNs.init(ctxSim.engine, ctxSim.renderer, ctxSim.ui, {});
  assert.equal(magNs.getUnbounded(), true, 'magnetic: unbounded debe iniciar en true');
});

/* §17.1 — el punto fijo declarado por cada módulo cae a ≤0.5 u de mundo de (0,0). */
const ANCHORED = [
  'units-error', 'vectors', 'mass-weight', 'elasticity', 'statics', 'pendulum',
  'standing-waves', 'fluids', 'calorimetry', 'kinetic-theory', 'thermal-expansion',
  'mirrors', 'induction', 'wave-optics', 'optical-instruments', 'particles'
];

for (const name of ANCHORED) {
  test(`anchor 17.1: ${name} declara su punto fijo a ≤0.5 u del origen`, async () => {
    const mod = await import(base.href + name + '.js');
    const anchor = mod.default?.anchor ?? mod.anchor;
    assert.ok(anchor, `${name}: no declara anchor`);
    const d = Math.hypot(anchor.x - 0, anchor.y - 0);
    assert.ok(
      d <= 0.5,
      `${name}: punto fijo en (${anchor.x}, ${anchor.y}) a ${d.toFixed(2)} u del origen`
    );
  });
}

/* §17.2 — encuadre inicial: reset() fija `_userFramed`, follow() se suspende
 * y resumeFollow() lo libera. */
test('17.2: camera.reset() suspende follow() hasta resumeFollow()', async () => {
  const { Camera } = await import(new URL('camera.js', CORE).href);
  const cam = new Camera({ worldWidth: 20, worldHeight: 15 });
  cam.reset();
  assert.equal(cam.userFramed, true, 'reset() debe fijar userFramed');
  cam.follow(3, 4);
  cam.update(1 / 60);
  // El encuadre manual manda: la cámara no salta al objetivo.
  assert.equal(cam.userFramed, true);
  assert.notEqual(cam.x, 3);
  cam.resumeFollow();
  assert.equal(cam.userFramed, false, 'resumeFollow() libera el encuadre');
  cam.follow(3, 4, { smooth: 0 });
  assert.equal(cam.x, 3, 'con smooth=0 el follow vuelve a ser instantáneo');
});

/* §17.3 — los 4 módulos con espacio infinito exponen getUnbounded. */
test('17.3: dynamics exporta getUnbounded (botón de espacio infinito)', async () => {
  const ctxSim = { engine: { reset() {} }, renderer: { resetCamera() {}, follow() {} }, ui: uiStub() };
  const dynNs = await import(base.href + 'dynamics.js');
  dynNs.init(ctxSim.engine, ctxSim.renderer, ctxSim.ui, {});
  assert.equal(typeof dynNs.getUnbounded, 'function', 'dynamics: falta getUnbounded');
  assert.equal(dynNs.getUnbounded(), true);

  const gravNs = await import(base.href + 'gravity.js');
  gravNs.init(ctxSim.engine, ctxSim.renderer, ctxSim.ui, {});
  assert.equal(typeof gravNs.getUnbounded, 'function');
  assert.equal(gravNs.getUnbounded(), true);
});