/**
 * Verificación numérica de la física de la tanda 5.4 (óptica y electromagnetismo).
 * Cada comprobación contrasta con el valor analítico de referencia.
 * Uso: node --test skills/fisicahn/js/tests/physics-54.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const JS = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const base = pathToFileURL(path.join(JS, 'modules') + '/');

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
  head: { appendChild() {} },
  body: { appendChild() {} }
};

const uiStub = { setInfo() {}, setFormulas() {}, setChallenges() {}, setParams() {} };
const engineStub = { reset() {}, requestPaint() {} };
const rendererStub = { resetCamera() {} };

async function mk(name) {
  const mod = await import(base.href + name + '.js');
  const inst = new mod.default({ engine: engineStub, renderer: rendererStub, ui: uiStub });
  inst.init({});
  inst.reset();
  return inst;
}

test('espejos: ecuación del espejo para cóncavo y convexo', async () => {
  const m = await mk('mirrors');
  // Cóncavo f = 1.5, d₀ = 4 → dᵢ = 2.4 m, imagen real invertida (M < 0)
  m.params.tipo = 'concavo'; m.params.f = 1.5; m.params.d0 = 4; m.params.h = 1.2;
  const di = m.dI();
  assert.ok(Math.abs(di - 2.4) < 1e-12, `dᵢ concavo ${di} != 2.4`);
  assert.ok(m.magnification(di) < 0, 'imagen real → invertida (M < 0)');

  // Cóncavo con d₀ < f → dᵢ < 0 (virtual) y M > 0 (derecha, mayor)
  m.params.d0 = 1;
  const di2 = m.dI();
  assert.ok(di2 < 0, `d₀ < f debe dar imagen virtual, dᵢ = ${di2}`);
  assert.ok(m.magnification(di2) > 0, 'virtual → derecha (M > 0)');

  // Convexo: siempre dᵢ < 0
  m.params.tipo = 'convexo'; m.params.d0 = 4; m.params.f = 1.5;
  const di3 = m.dI();
  assert.ok(di3 < 0 && Math.abs(di3) < 4, `convexo virtual ${di3}`);

  // d₀ = f → dᵢ = null (infinito)
  m.params.tipo = 'concavo'; m.params.d0 = 1.5;
  assert.equal(m.dI(), null, 'd₀ = f debe dar null');
});

test('inducción: Faraday numérico ≈ analítico y transformador por relación de espiras', async () => {
  const m = await mk('induction');
  m.params.modo = 'faraday';
  m.params.f = 0.5;
  const tol = 0.25;
  for (let i = 0; i < 240; i++) {
    m.update(1 / 60);
    // El diferenciador es hacia adelante: cerca del centro (curvatura máxima)
    // subestima la derivada instantánea y en los giros la fase se desplaza;
    // solo se compara en régimen de velocidad apreciable.
    if (Math.abs(m.magnetX()) < 0.25 || Math.abs(m.magnetV()) < 0.9) continue;
    const num = m.emfNow();
    const an = m.emfAnalytic();
    assert.ok(Math.abs(num - an) < Math.max(0.02, Math.abs(an) * tol),
      `ε num ${num} vs ana ${an} en t=${m.t.toFixed(3)}, x=${m.magnetX().toFixed(3)}`);
  }

  m.params.modo = 'transformador';
  m.params.N1 = 100; m.params.N2 = 50; m.params.Vpk = 120;
  const ratio = m.params.N2 / m.params.N1;
  m.update(1 / 60);
  const v2 = m.readout();
  assert.equal(v2['V₂/V₁'].value, round(0.5), `N₂/N₁ = 0.5, got ${v2['V₂/V₁'].value}`);
  assert.ok(Math.abs(v2['V₂ pico'].value - 120 * ratio) < 1e-6, 'V₂ pico = Vpk·(N2/N1)');

  // Transformador elevador
  m.params.N1 = 100; m.params.N2 = 300;
  assert.ok(Math.abs(m.readout()['V₂ pico'].value - 360) < 1e-6, 'N₂=300 → V₂ pico = 360 V');
});

test('instrumentos ópticos: ojo, lupa, microscopio y telescopio', async () => {
  const m = await mk('optical-instruments');

  m.params.modo = 'ojo'; m.params.do = 50; // punto: f = 50·2.5/52.5
  const fOjo = (50 * 2.5) / 52.5;
  assert.ok(Math.abs(m.ojoF() - fOjo) < 1e-9, `ojo f ${m.ojoF()} != ${fOjo}`);

  m.params.modo = 'lupa'; m.params.fLupa = 5; m.params.dLupa = 4;
  const di = m.thinLens(4, 5);
  assert.equal(di, -20, `lupa dᵢ debe ser −20 cm (virtual), got ${di}`);
  assert.ok(Math.abs(m.lupaM() - 6) < 1e-9, 'M lupa = 1 + 25/5 = 6');

  m.params.modo = 'microscopio'; m.params.fo = 1; m.params.fe = 2; m.params.L = 16;
  const micro = m.microscopio();
  assert.ok(Math.abs(micro.mTotal - 200) < 1e-6, `microscopio M = 200, got ${micro.mTotal}`);
  assert.ok(Math.abs(micro.mObj) > 1, 'objetivo tiene que aumentar');

  m.params.modo = 'telescopio'; m.params.foT = 50; m.params.feT = 5;
  assert.equal(m.telescopioM(), 10, 'telescopio M = 50/5 = 10');
});

test('RLC y RC en circuits (migrado): resonancia y exponencial', async () => {
  const c = await mk('circuits');
  c.params.mode = 'series'; c.params.R1 = 100; c.params.R2 = 200; c.params.V = 12;
  assert.equal(c.dcResults().Req, 300, 'R serie = 100+200');
  assert.equal(c.dcResults().I, 0.04, 'I serie = 12/300');

  c.params.mode = 'rlc'; c.params.C = 200; c.params.f = 50;
  const z = c.rlcZ();
  const wRes = 1 / Math.sqrt(0.5 * 200e-6);
  const f0 = wRes / (2 * Math.PI);
  assert.ok(Math.abs(z.f0 - f0) < 1e-9, `f₀ == 1/(2π√(LC))`);

  // RC: con τ = 0.2 s (R=200 Ω, C=1000 µF) y dt=1/60 el avance es estable;
  // a t = τ la tensión ronda el 63.2 % (Euler explícito → tolerancia holgada).
  c.params.mode = 'rc'; c.params.accion = 'carga';
  c.params.V = 12; c.params.R = 200; c.params.C = 1000; c.params.diel = 'aire';
  c.reset();
  const tau = c.rcTau();
  assert.ok(Math.abs(tau - 0.2) < 1e-9, `τ = R·C = 0.2 s, got ${tau}`);
  let guard = 0;
  while (c.t < tau && guard++ < 1000) c.update(1 / 60);
  const vc = c.q / Math.max(c.cEff(), 1e-15);
  const ref = 12 * (1 - Math.exp(-1));
  assert.ok(Math.abs(vc - ref) < 0.6, `V_c(τ) = ${vc} ≈ ${ref} (±0.6, Euler discreto)`);

  // Dieléctrico papel (κ=3.5): la capacidad sube y τ crece
  const tauAire = c.rcTau();
  c.params.diel = 'papel';
  assert.ok(Math.abs(c.cEff() - c.cFarad() * 3.5) < 1e-18, 'C = κ·C₀');
  assert.ok(c.rcTau() > tauAire, 'con papel, τ = RC sube');
});

test('em-waves: Malus I₂ = I₁·cos²θ', async () => {
  const m = await mk('em-waves');
  m.params.theta = 45; m.params.I1 = 100;
  assert.ok(Math.abs(m.i2() - 50) < 1e-9, `Malus 45° → 50 %, got ${m.i2()}`);
  m.params.theta = 0;
  assert.ok(Math.abs(m.i2() - 100) < 1e-9, 'cos²0 = 1 → 100 %');
  m.params.theta = 90;
  assert.ok(m.i2() < 1e-6, 'cos²90° = 0 → se apaga');
  m.params.theta = 60;
  assert.ok(Math.abs(m.i2() - 25) < 1e-6, 'cos²60° = 0.25 → 25 %');
});

function round(x) {
  return Math.round(x * 1e6) / 1e6;
}