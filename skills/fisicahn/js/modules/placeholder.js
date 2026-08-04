import { clearChallenges, setModuleInfo, setModuleFormulas } from '../module-ui.js';
import { getTheme } from '../core/theme.js';
/**
 * Módulo placeholder para entradas del catálogo aún sin simulación dedicada.
 */

let title = 'Próximamente';
let blurb = '';
let t = 0;
let _renderer = null;

export function init(engine, renderer, ui, meta = {}) {
  _renderer = renderer;
  title = meta.title || title;
  blurb = meta.blurb || '';
  t = 0;

  ui.setParams(`
    <p class="placeholder-text">Esta simulación está en el catálogo pero aún no tiene motor propio.</p>
    <p class="placeholder-text" style="margin-top:8px;opacity:.8">Mientras tanto puedes explorar módulos marcados como <strong>Disponible</strong> en el catálogo.</p>
  `);
  ui.setChart('<text x="150" y="90" text-anchor="middle" fill="var(--text-secondary)" font-size="11">Sin gráfica</text>');
  ui.setInfo(`<strong>${title}</strong><br>${blurb}<br><br>Estado: <em>próximamente</em>.`);
  ui.setFormulas('<p class="tab-text placeholder-text">Fórmulas cuando la simulación esté implementada.</p>');
  ui.setData('<p class="tab-text placeholder-text">Sin datos en vivo.</p>');
  clearChallenges(ui);
}

export function update(dt) {
  t += dt;
}

export function render(ctx) {
  // El renderer da px CSS; antes este módulo recalculaba su propio DPR, que
  // era el tercero de los parches divergentes al mismo bug (§2.0).
  const { w, h } = _renderer?.viewport?.() || { w: 320, h: 240 };
  const theme = getTheme();
  ctx.save();
  ctx.fillStyle = theme.dark ? 'rgba(12, 15, 20, 0.35)' : 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = theme.text;
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, w / 2, h / 2 - 12);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = theme.textDim;
  ctx.fillText('Simulación en desarrollo', w / 2, h / 2 + 16);
  ctx.restore();
}

export function reset() {
  t = 0;
}

export function destroy() {
  _renderer = null;
}
