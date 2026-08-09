/**
 * Verificación numérica de la física de la tanda 5.3 (térmica y ondas).
 * Cada comprobación contrasta con el valor analítico de referencia.
 * Uso: node --test skills/fisicahn/js/tests/physics-53.test.mjs
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

test('calorimetry: mezcla, meseta de fase y conducción', async () => {
  const m = await mk('calorimetry');
  m.params.modo = 'mezcla';
  m.params.m1 = 1; m.params.T1 = 20; m.params.m2 = 1; m.params.c2 = 450; m.params.T2 = 150;
  const Teq = (1 * 4186 * 20 + 1 * 450 * 150) / (4186 + 450);
  assert.ok(Math.abs(m.tEq() - Teq) < 1e-9, `T_eq ${m.tEq()} != ${Teq}`);

  m.params.modo = 'fase'; m.params.mIce = 0.5;
  const Q1 = 0.5 * 2090 * 20;
  const Q2 = Q1 + 0.5 * 334000;
  assert.equal(m.phaseTemp(Q1 + (Q2 - Q1) / 2), 0, 'meseta de fusión debe dar 0 °C');

  m.params.modo = 'conduccion';
  m.params.k = 200; m.params.A = 0.5; m.params.L = 1; m.params.T1 = 100; m.params.T2 = 20;
  assert.ok(Math.abs(m.transferPower() - 200 * 0.5 * 80) < 1e-9, 'P = kAΔT/L');
});

test('kinetic-theory: v_rms 2D y termostato converge a 300 K', async () => {
  const m = await mk('kinetic-theory');
  m.params.T = 300; m.params.modo = 'caja'; m.params.N = 150; m.params.choque = true;
  m.reset();
  for (let i = 0; i < 900; i++) m.update(1 / 60);
  const mN2 = 28 * 1.660539e-27;
  const target = Math.sqrt((2 * 1.380649e-23 * 300) / mN2);
  assert.ok(Math.abs(m.vRms(mN2) - target) < 1e-9, `v_rms ${m.vRms(mN2)} != ${target}`);
  assert.ok(Math.abs(m.Tmeas - 300) < 25, `T medida ${m.Tmeas} no converge a 300 K`);
});

test('thermal-expansion: acero 2 m con ΔT=100 → ΔL = 2.4 mm', async () => {
  const m = await mk('thermal-expansion');
  m.params.material = 'acero'; m.params.L0 = 2; m.params.T = 250;
  const dL = m.alphaOf('acero') * m.params.L0 * m.dT();
  assert.ok(Math.abs(dL - 12e-6 * 2 * 100) < 1e-12, `ΔL ${dL} != 2.4 mm`);
});

test('standing-waves: v=√(T/μ), fₙ=n·v/2L, λ=2L/n y batidos', async () => {
  const m = await mk('standing-waves');
  m.params.T = 64; m.params.mu = 0.01; m.params.L = 2; m.params.n = 3;
  assert.equal(m.vPhase(), 80, 'v = √(64/0.01) = 80 m/s');
  assert.equal(m.fN(), 60, 'f₃ = 3·80/2/2 = 60 Hz');
  assert.ok(Math.abs(m.lambdaN() - 4 / 3) < 1e-12, 'λ = 2L/n = 4/3 m');
  m.params.modo = 'batidos'; m.params.f1 = 6; m.params.f2 = 7;
  assert.equal(m.readout().f_batido.value, 1, 'f_batido = |f1−f2| = 1 Hz');
});

test('sound: v(20°C)=343, Doppler y caída de dB con la distancia', async () => {
  const m = await mk('sound');
  m.params.modo = 'doppler'; m.params.tempC = 20; m.params.f = 2; m.params.vSource = 2;
  assert.equal(m.soundSpeed(), 343, 'v = 331 + 0.6·20 = 343 m/s');
  assert.ok(Math.abs(m.observedF() - (2 * 343) / 341) < 1e-9, 'f′ = f·v/(v−vₛ)');
  m.params.modo = 'intensidad'; m.params.P = 100; m.params.r = 1;
  const beta = m.dBAt(1);
  assert.ok(Math.abs(beta - 10 * Math.log10(m.intensity() / 1e-12)) < 1e-9, 'β = 10·log₁₀(I/I₀)');
  assert.ok(Math.abs(m.dBAt(10) - (beta - 20)) < 1e-6, '10× la distancia → −20 dB');
});