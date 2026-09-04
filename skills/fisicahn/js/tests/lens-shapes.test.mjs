/**
 * Siluetas de lente (draw-primitives.lensProfile): las seis formas de libro
 * deben ser cerradas, sin cruzarse, con el grosor correcto en el centro
 * (convergentes gruesas, divergentes finas) y dentro del semiancho rx. La
 * excentricidad debe abombar más la lente cuanto menor es |f|.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { lensProfile, lensBulgeFromFocal, LENS_TYPES } = await import('../core/draw-primitives.js');

const RX = 20;
const RY = 80;

function thickness(faces, u) {
  const f = faces(u);
  return f.right - f.left;
}

test('lentes: seis tipos, contorno válido y grosor coherente', () => {
  assert.equal(LENS_TYPES.length, 6);
  for (const type of LENS_TYPES) {
    const faces = lensProfile(RX, RY, type, 0.7);
    for (let i = 0; i <= 40; i++) {
      const u = -1 + (2 * i) / 40;
      const f = faces(u);
      assert.ok(f.right > f.left, `${type}: caras cruzadas en u=${u}`);
      assert.ok(f.left >= -RX - 1e-9 && f.right <= RX + 1e-9, `${type}: se sale del semiancho en u=${u}`);
    }
    const centro = thickness(faces, 0);
    const borde = thickness(faces, 1);
    if (type.includes('convex')) assert.ok(centro > borde, `${type}: una convergente es más gruesa en el centro`);
    else assert.ok(centro < borde, `${type}: una divergente es más fina en el centro`);
  }
});

test('lentes: la excentricidad abomba la cara y flip espeja la silueta', () => {
  const suave = lensProfile(RX, RY, 'biconvex', 0.2);
  const fuerte = lensProfile(RX, RY, 'biconvex', 0.9);
  assert.ok(thickness(fuerte, 0) > thickness(suave, 0), 'más e → más gruesa en el centro');
  assert.ok(Math.abs(thickness(fuerte, 1) - thickness(suave, 1)) < 1e-9, 'el borde no depende de e');

  const pc = lensProfile(RX, RY, 'plano-convex', 0.6);
  const pcFlip = lensProfile(RX, RY, 'plano-convex', 0.6, true);
  assert.ok(Math.abs(pc(0).left - pc(1).left) < 1e-9, 'plano-convexa: cara izquierda plana');
  assert.ok(Math.abs(pcFlip(0).right - pcFlip(1).right) < 1e-9, 'flip: la cara plana pasa a la derecha');
  assert.ok(Math.abs(pcFlip(0).right + pc(0).left) < 1e-9, 'flip es un espejo exacto');
});

test('lentes: lensBulgeFromFocal decrece con |f| y queda acotada', () => {
  const e1 = lensBulgeFromFocal(1, 4);
  const e4 = lensBulgeFromFocal(4, 4);
  const e16 = lensBulgeFromFocal(16, 4);
  assert.ok(e1 > e4 && e4 > e16, 'a menor |f| más curvatura');
  assert.ok(Math.abs(e4 - 0.5) < 1e-9, 'f = fRef → curvatura media');
  assert.ok(lensBulgeFromFocal(1e-6, 4) <= 0.95 && lensBulgeFromFocal(1e6, 4) >= 0.12, 'acotada en [0.12, 0.95]');
  assert.ok(Math.abs(lensBulgeFromFocal(-4, 4) - e4) < 1e-9, 'usa |f|');
});
