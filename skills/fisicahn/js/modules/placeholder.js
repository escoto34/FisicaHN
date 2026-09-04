/**
 * @fileoverview Módulo «Próximamente» — entradas del catálogo sin motor propio.
 *
 * `SimModule` mínimo: sin parámetros, sin física; `draw(scene)` presenta el
 * título de la entrada y un aviso de «en desarrollo» con el vocabulario de la
 * escena (nada de `ctx` ni de DOM). El anfitrión pasa `{ title, blurb }` en
 * `init(meta)`.
 */

import { SimModule } from '../core/sim-module.js';

export default class PlaceholderModule extends SimModule {
  static viewport = { width: 20, height: 14 };

  static anchor = { x: 0, y: 0 };

  static params = [];

  constructor(ctx) {
    super(ctx);
    this.params = {};
    this.t = 0;
    this.title = 'Próximamente';
    this.blurb = '';
  }

  init(meta = null) {
    this.title = meta?.title || 'Próximamente';
    this.blurb = meta?.blurb || '';
    this.reset();
    this.setModuleInfo({
      title: this.title,
      blurb: `${this.blurb}${this.blurb ? ' ' : ''}Esta simulación está en el catálogo pero aún no tiene motor propio.`,
      story: 'Mientras tanto puedes explorar los módulos marcados como «Disponible» en el catálogo.',
      cases: []
    });
    this.setModuleFormulas({ items: [] });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
  }

  draw(scene) {
    // Anillo que respira lentamente: señal de «vivo, pero en construcción».
    const r = 2.6 + 0.15 * Math.sin(this.t * 1.5);
    scene.circle(0, 0, r, { color: 'textDim', width: 1.5, dash: [8, 6], alpha: 0.6 });
    scene.circle(0, 0, 0.18, { fill: 'mass', color: 'mass' });
    scene.label(0, 0.55, this.title, { size: 20, weight: '600', color: 'text', baseline: 'bottom' });
    scene.label(0, -0.55, 'Simulación en desarrollo', { size: 14, color: 'textDim', baseline: 'top' });
    scene.hud.chip('Próximamente', 'top-left', { color: 'textDim' });
  }

  readout() {
    return {};
  }

  getState() {
    return { t: this.t, params: {} };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (Number.isFinite(s.t)) this.t = s.t;
  }
}
