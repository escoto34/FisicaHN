/**
 * WAVE 25 — invariantes estructurales de la interfaz compartida.
 * Lee `index.html` y el código de módulos como texto: no necesita DOM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

test('25.2 cada acción de transporte existe una sola vez', () => {
  for (const id of ['playPauseBtn', 'stepBtn', 'speedSlider', 'resetBtn']) {
    const n = (html.match(new RegExp(`id="${id}"`, 'g')) || []).length;
    assert.equal(n, 1, `#${id} debe aparecer exactamente una vez (apareció ${n})`);
  }
  assert.ok(!app.includes('mobilePlayBtn'), 'sin botón de reproducción móvil duplicado');
});

test('25.3 todo botón solo-icono tiene nombre accesible', () => {
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [];
  for (const b of buttons) {
    const text = b.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
    const open = b.slice(0, b.indexOf('>') + 1);
    if (!text) assert.match(open, /aria-label="[^"]+"/, `botón sin nombre accesible: ${open}`);
  }
});

test('25.3 herramientas con aria-label y title', () => {
  const tools = html.match(/<button[^>]*data-tool="[^"]+"[^>]*>/g) || [];
  assert.ok(tools.length >= 6);
  for (const t of tools) {
    assert.match(t, /aria-label="[^"]+"/, t);
    assert.match(t, /title="[^"]+"/, t);
  }
});

test('25.1 de-broglie no dibuja el histograma en el plano y lo expone como gráfica', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'modules', 'de-broglie.js'), 'utf8');
  const draw = src.slice(src.indexOf('draw(scene)'), src.indexOf('readout()'));
  assert.ok(!/scene\.rect\(/.test(draw), 'draw() no debe pintar barras estadísticas');
  assert.ok(/graphData\(\)/.test(src));
});

test('25.1 fluids y em-waves no dibujan barras comparativas en el plano', () => {
  for (const name of ['fluids', 'em-waves']) {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'modules', `${name}.js`), 'utf8');
    assert.ok(!/scene\.bars\(/.test(src), `${name}: la comparación va en la pestaña Gráficas`);
    assert.ok(/graphData\(\)/.test(src), `${name}: debe declarar graphData()`);
  }
});

test('25.5 existe disposición propia para tablet apaisada y no hay scroll horizontal forzado', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
  assert.match(css, /@media \(min-width: 721px\) and \(max-width: 1100px\) and \(orientation: landscape\) and \(min-height: 501px\)/);
  assert.match(css, /safe-area-inset-right/);
  assert.match(html, /viewport-fit=cover/);
});

test('25.1 capacitors: la comparación Q/V de la asociación va en Gráficas, no en el plano', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'modules', 'capacitors.js'), 'utf8');
  const net = src.slice(src.indexOf('_drawNetwork(scene)'), src.indexOf('_drawNetwork(scene)') + 6000);
  assert.ok(!/baseY/.test(net), 'sin barras comparativas bajo el circuito');
  assert.ok(/graphData\(\)/.test(src));
});
