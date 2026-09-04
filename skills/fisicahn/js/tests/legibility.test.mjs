/**
 * Legibility — WAVE 13, criterio de aceptación.
 *
 * Reutiliza el arnés de `smoke-55.test.mjs` (Camera → Scene → ctx falso) para
 * los 16 motores de §13.0. En vez de reconstruir la geometría de texto desde
 * las operaciones crudas del `ctx`, usa directamente el registro de cajas de
 * `Scene._labelBoxes` que alimenta el motor de anticolisión de §13.1 — es el
 * mismo dato que `label`/`chip`/`callout`/`readout` registran al dibujar, así
 * que la prueba verifica el sistema real, no una réplica aproximada de él.
 *
 * Falla si dos cajas de texto de un mismo frame se solapan, o si alguna cae
 * fuera del viewbox 900×700 (con el mismo margen que smoke-55).
 *
 * Uso: node --test skills/fisicahn/js/tests/legibility.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const JS = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const base = pathToFileURL(path.join(JS, 'modules') + '/');
const CORE = pathToFileURL(path.join(JS, 'core') + '/');

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

/** AABB en px CSS: ¿se solapan `a` y `b`? Réplica independiente de `rectsOverlap` de scene.js. */
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const MARGIN = 3;
const LIMITS = { minX: -MARGIN, maxX: 900 + MARGIN, minY: -MARGIN, maxY: 700 + MARGIN };

/* Los 16 motores de §13.0 — todos ya son `SimModule` con `draw(scene)` tras la migración de la WAVE 13. */
const MODULES = [
  'atomic', 'blackbody', 'calorimetry', 'capacitors', 'circuits', 'collisions-2d',
  'de-broglie', 'dynamics', 'elasticity', 'electricity', 'em-waves', 'fluids',
  'force-kinetic', 'friction', 'gravity', 'hydraulics', 'hyperbola', 'inclined-plane',
  'induction', 'kepler', 'kinematics', 'kinetic-theory', 'lenses', 'magnetic',
  'mass-weight', 'mirrors', 'momentum', 'nuclear-energy', 'optical-instruments', 'optics',
  'oscillatory', 'particles', 'pendulum', 'photoelectric', 'placeholder', 'projectile',
  'quantum-history', 'radioactivity', 'rotational', 'simple-machines', 'sound', 'special-relativity',
  'standing-waves', 'statics', 'thermal-expansion', 'thermodynamics', 'tunneling', 'units-error',
  'vectors', 'wave-optics', 'work-energy'
];
/* Override para verificar un subconjunto: FISICAHN_MODULES=a,b node --test … */
const MODULES_SEL = (process.env.FISICAHN_MODULES || '').split(',').map((s) => s.trim()).filter(Boolean);
const MODULES_RUN = MODULES_SEL.length ? MODULES_SEL : MODULES;

for (const name of MODULES_RUN) {
  test(`legibility 13: ${name} sin solapes de texto ni salidas del viewbox`, async () => {
    const { Camera } = await import(new URL('camera.js', CORE).href);
    const { Scene } = await import(new URL('scene.js', CORE).href);
    const mod = await import(base.href + name + '.js');
    const Ctor = mod.default;
    assert.ok(Ctor, `${name}: no exporta una clase SimModule (mod.default)`);

    const camera = new Camera({ worldWidth: 20, worldHeight: 15 });
    camera.setViewport(0, 0, 900, 700);
    const vp = Ctor.viewport;
    if (vp) camera.setWorldSize(vp.width || 20, vp.height || 15);
    const scene = new Scene({ camera });
    const ctx = fakeCtx();

    const inst = new Ctor({
      engine: { reset() {} },
      renderer: { follow() {}, resetCamera() {} },
      ui: uiStub(), scene, camera
    });
    inst.init({});
    inst.reset();

    // Varios frames con dt distintos: las etiquetas ancladas a objetos en
    // movimiento (péndulo, partículas…) cambian de posición relativa entre
    // frames, así que un solo frame estático no basta para atrapar un solape
    // que sólo aparece a mitad de la animación.
    const frames = [0, 1 / 60, 0.05, 0.12, 0.3];
    let elapsed = 0;
    for (const dt of frames) {
      elapsed += dt;
      inst.update?.(dt);
      scene.beginFrame(ctx, {
        theme: { bg: '#fff', name: 'light', lineScale: 1, fontScale: 1 },
        dt, elapsed, alpha: 0
      });
      scene.beginHud(ctx);
      inst.draw(scene);

      const boxes = scene._labelBoxes;
      assert.ok(Array.isArray(boxes), `${name}: la escena no expone _labelBoxes`);

      for (const b of boxes) {
        assert.ok(
          b.x >= LIMITS.minX && b.y >= LIMITS.minY &&
          b.x + b.w <= LIMITS.maxX && b.y + b.h <= LIMITS.maxY,
          `${name} (t=${elapsed.toFixed(2)}): etiqueta fuera del viewbox ` +
            `(x ${Math.round(b.x)}..${Math.round(b.x + b.w)}, y ${Math.round(b.y)}..${Math.round(b.y + b.h)})`
        );
      }

      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          assert.ok(
            !overlaps(boxes[i], boxes[j]),
            `${name} (t=${elapsed.toFixed(2)}): dos etiquetas se solapan ` +
              `(caja ${i} en x${Math.round(boxes[i].x)},y${Math.round(boxes[i].y)} vs ` +
              `caja ${j} en x${Math.round(boxes[j].x)},y${Math.round(boxes[j].y)})`
          );
        }
      }
    }
  });
}
