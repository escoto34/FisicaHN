/**
 * @fileoverview Inducción electromagnética (tanda 5.4).
 *
 * Modo `faraday`: un imán oscila frente a una bobina; el flujo Φ(x) sigue una
 * forma de Lorentz por proximidad al polo y la fem inducida
 * ε = −N·dΦ/dt se evalúa numéricamente y se contrasta con la derivada
 * analítica. Cuando el imán pasa por el centro (x = 0) la velocidad es máxima
 * y |ε| alcanza su pico; en los extremos el flujo es extremo pero ε = 0.
 *
 * Modo `transformador`: bobina primaria alimentada por V₁ = V_pk sin(ωt); el
 * flujo compartido induce en la secundaria V₂ = (N₂/N₁)·V₁: la relación de
 * espiras a golpe de vista (sube el voltaje si N₂ > N₁, la corriente baja).
 *
 * Ejercita `arc`, `circle`, `rect`, `line`, `polyline`, `plot`, `chip`,
 * `readout`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

export default class Induction extends SimModule {
  static viewport = { width: 24, height: 15 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'faraday',
      options: [
        { value: 'faraday', label: 'Faraday: imán y bobina' },
        { value: 'transformador', label: 'Transformador' }
      ]
    },
    { id: 'N', label: 'Espiras', latex: 'N', min: 1, max: 60, step: 1, value: 20 },
    { id: 'amp', label: 'Amplitud del imán', latex: 'a', unit: 'm', min: 0.2, max: 3, step: 0.1, value: 1.6 },
    { id: 'f', label: 'Frecuencia', latex: 'f', unit: 'Hz', min: 0.1, max: 2, step: 0.05, value: 0.5 },
    { id: 'lamb', label: 'Alcance del campo', latex: '\\lambda', unit: 'm', min: 0.3, max: 2, step: 0.05, value: 0.7 },
    { id: 'Phi0', label: 'Flujo base', latex: '\\Phi_0', unit: 'Wb', min: 0.02, max: 0.2, step: 0.01, value: 0.08 },
    { id: 'N1', label: 'Espiras primarias', latex: 'N_1', min: 10, max: 200, step: 10, value: 100 },
    { id: 'N2', label: 'Espiras secundarias', latex: 'N_2', min: 10, max: 400, step: 10, value: 50 },
    { id: 'Vpk', label: 'Tensión pico primaria', latex: 'V_{1pk}', unit: 'V', min: 20, max: 240, step: 2, value: 120 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'faraday',
      N: 20,
      amp: 1.6,
      f: 0.5,
      lamb: 0.7,
      Phi0: 0.08,
      N1: 100,
      N2: 50,
      Vpk: 120
    };
    this.t = 0;
    this.dt = 1 / 60;
    this.histPhi = [];
    this.histEmf = [];
    this.fluxPrev = 0;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Inducción electromagnética',
      blurb: 'Ley de Faraday-Lenz: fem por flujo variable, y el transformador.',
      story:
        'Faraday descubrió que un flujo magnético que cambia con el tiempo fabrica una tensión: empuja electrones sin tocarlos. La ley es de una limpieza brutal: cuantas más espiras y más rápido cambie el flujo, más voltaje. El transformador es esa idea en directo: la corriente alterna del primario crea un flujo variable que induce otra tensión en el secundario, con valor fijado por la relación de espiras.',
      cases: [
        'El imán cruza el centro a máxima velocidad: |ε| es máximo.',
        'En los extremos el flujo es máximo, pero no cambia: ε = 0. Flujo ≠ fem.',
        'Dobla las espiras N y la fem se duplica (ε = −N·dΦ/dt).',
        'Transformador: V₂/V₁ = N₂/N₁. Con N₂ < N₁ bajas el voltaje y sube la corriente.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Inducción electromagnética',
      items: [
        { name: 'Flujo magnético', formula: '\\Phi = B A \\cos\\theta' },
        { name: 'Ley de Faraday', formula: '\\mathcal{E} = -N \\dfrac{d\\Phi}{dt}' },
        { name: 'Ley de Lenz', formula: 'I_\\text{ind}\ \\text{se opone al cambio de flujo}' },
        {
          name: 'Transformador',
          formula: '\\dfrac{V_2}{V_1} = \\dfrac{N_2}{N_1}',
          note: 'Relación de espiras; P₁ ≈ P₂ (sube V, baja I).'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.dt = 1 / 60;
    this.histPhi = [];
    this.histEmf = [];
    this.fluxPrev = this.fluxNow();
    this.engine?.reset?.();
  }

  update(dt) {
    this.dt = Math.max(dt, 1e-9);
    this.t += this.dt;
    const flux = this.fluxNow();
    const emf = this.modoFaraday() ? -this.params.N * ((flux - this.fluxPrev) / this.dt) : 0;
    this.fluxPrev = flux;

    this.histPhi.push({ x: this.t, y: flux });
    this.histEmf.push({ x: this.t, y: emf });
    if (this.histPhi.length > 420) {
      this.histPhi.shift();
      this.histEmf.shift();
    }
  }

  modoFaraday() {
    return this.params.modo === 'faraday';
  }

  /** Posición del imán (m) a lo largo del eje en el instante actual. */
  magnetX() {
    return this.params.amp * Math.sin(2 * Math.PI * this.params.f * this.t);
  }

  /** Velocidad del imán (m/s). */
  magnetV() {
    const w = 2 * Math.PI * this.params.f;
    return this.params.amp * w * Math.cos(w * this.t);
  }

  /** Flujo instantáneo Φ (Wb) por proximidad del polo al centro de la bobina. */
  fluxNow() {
    const x = this.magnetX();
    const l = this.params.lamb;
    return (this.params.Phi0 * l * l) / (l * l + x * x);
  }

  /** EMF numérico del último update(). */
  emfNow() {
    if (!this.modoFaraday() || this.histEmf.length === 0) return 0;
    return this.histEmf[this.histEmf.length - 1].y;
  }

  /** dΦ/dt analítico incluyendo el movimiento del imán. */
  emfAnalytic() {
    const { amp, f, lamb: l, N, Phi0 } = this.params;
    const x = this.magnetX();
    const w = 2 * Math.PI * f;
    const dPhidx = (-2 * Phi0 * l * l * x) / Math.pow(l * l + x * x, 2);
    return -N * dPhidx * (amp * w * Math.cos(w * this.t));
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    if (this.modoFaraday()) this._drawFaraday(scene);
    else this._drawTransformador(scene);
  }

  _drawFaraday(scene) {
    const x = this.magnetX();

    // Riel y bobina centrados: el centro de la bobina es (0,0), el mismo
    // origen que usa la física (`magnetX` oscila alrededor de 0). El imán
    // cruza la bobina: Φ máximo en el centro, |ε| máximo en el cruce.
    scene.line(-6.4, -1.6, 7.4, -1.6, { color: 'textDim', width: 2 });
    scene.label(7.8, -1.95, 'riel', { color: 'textDim', size: 11 });
    this._coil(scene, 0, 0, 5, 1.15, 'energy');

    // Imán (rojo N, azul S) sobre el riel.
    scene.rect(x - 1.5, -0.95, 1.5, 1.9, { color: 'force', width: 2 });
    scene.rect(x, -0.95, 1.5, 1.9, { color: 'textDim', width: 2 });
    scene.label(x - 0.75, 0.15, 'N', { color: 'force' });
    scene.label(x + 0.75, 0.15, 'S', { color: 'textDim' });

    // Flecha de velocidad en la punta del imán.
    const v = this.magnetV();
    scene.vector(x + 1.9, 0, v * 1.4, 0, { color: 'spring', label: 'v' });

    // Líneas de campo (grosor ~ flujo) entre imán y bobina.
    const l = this.params.lamb;
    const fLines = 4;
    for (let i = 0; i < fLines; i++) {
      const xp = (x + 1.6) - ((x + 1.6) * (i + 1)) / (fLines + 1);
      const spread = 0.9 * (1 - Math.abs(xp) / 7);
      scene.line(xp, -spread, xp, spread, { color: 'textDim', width: 1.2, alpha: 0.5 });
    }

    scene.hud.chip('Faraday: la fem es −N·dΦ/dt', 'top-left');
    const vp = scene.viewport();
    if (vp.w > 430) {
      const t0 = Math.max(0, this.t - 6);
      scene.hud.plot(
        { x: vp.x + vp.w - 300, y: vp.y + vp.h - 150, w: 290, h: 140 },
        {
          title: 'Φ(t) y ε(t)',
          series: [
            { points: this.histPhi, color: 'textDim', width: 1.6 },
            { points: this.histEmf, color: 'energy', width: 1.6, dash: [4, 3] }
          ],
          xRange: [t0, t0 + 6],
          yRange: this._faradayYRange(),
          xLabel: 't (s)',
          yLabel: 'Φ Wb · ε V'
        }
      );
    }
    scene.hud.readout(
      [
        { label: 'Φ', value: roundTo(this.fluxNow(), 3), unit: 'Wb' },
        { label: 'ε (num)', value: roundTo(this.emfNow(), 2), unit: 'V' },
        { label: 'ε (ana)', value: roundTo(this.emfAnalytic(), 2), unit: 'V' }
      ],
      'bottom-left'
    );
  }

  _faradayYRange() {
    const eMax = Math.max(...this.histEmf.map((p) => Math.abs(p.y)), 0.05);
    const y = eMax * 1.15;
    return [-y, y];
  }

  _drawTransformador(scene) {
    const { N1, N2, Vpk, f } = this.params;
    const w = 2 * Math.PI * f;
    const v1 = Vpk * Math.sin(w * this.t);
    const v2 = Vpk * (N2 / N1) * Math.sin(w * this.t);

    // Núcleo (cuatro barras).
    scene.rect(-2.6, -2.6, 0.7, 5.2, { color: 'textDim', width: 2 });
    scene.rect(1.9, -2.6, 0.7, 5.2, { color: 'textDim', width: 2 });
    scene.rect(-2.6, 2.3, 5.2, 0.7, { color: 'textDim', width: 2 });
    scene.rect(-2.6, -3, 5.2, 0.7, { color: 'textDim', width: 2 });

    // Bobinas: primaria (izquierda), secundaria (derecha).
    this._coil(scene, -2.25, 0, 3, 0.8, 'mass');
    this._coil(scene, 2.25, 0, 6, 0.8, 'energy');

    // Fuente AC a la izquierda del primario.
    scene.line(-4.2, -1, -4.2, 1, { color: 'mass', width: 2 });
    scene.circle(-4.9, 0, 0.45, { color: 'mass', width: 2 });
    scene.polyline(
      [
        { x: -5.35, y: 0.3 },
        { x: -5.05, y: 0 },
        { x: -5.35, y: -0.3 }
      ],
      { color: 'mass', width: 1.6 }
    );
    scene.label(-4.9, 1.1, 'V₁ ~', { color: 'mass' });
    scene.label(2.6, 1.4, `V₂ = ${roundTo(N2 / N1, 2)}·V₁`, { color: 'energy' });

    scene.hud.chip('Transformador: V₂/V₁ = N₂/N₁', 'top-left');
    const vp = scene.viewport();
    if (vp.w > 430) {
      const t0 = this.t - 4;
      const N = 160;
      const s1 = [];
      const s2 = [];
      for (let i = 0; i <= N; i++) {
        const tt = t0 + (4 * i) / N;
        const s = Math.sin(w * tt);
        s1.push({ x: tt, y: Vpk * s });
        s2.push({ x: tt, y: Vpk * (N2 / N1) * s });
      }
      scene.hud.plot(
        { x: vp.x + vp.w - 300, y: vp.y + vp.h - 150, w: 290, h: 140 },
        {
          title: 'V₁ y V₂ (superpuestas)',
          series: [
            { points: s1, color: 'mass', width: 1.8 },
            { points: s2, color: 'energy', width: 1.8, dash: [4, 3] }
          ],
          xRange: [t0, t0 + 4],
          yRange: [-(Vpk * Math.max(1, N2 / N1)) * 1.15, Vpk * Math.max(1, N2 / N1) * 1.15],
          xLabel: 't (s)',
          yLabel: 'V'
        }
      );
    }
    scene.hud.readout(
      [
        { label: 'V₁ (inst)', value: roundTo(v1, 1), unit: 'V' },
        { label: 'V₂ (inst)', value: roundTo(v2, 1), unit: 'V' },
        { label: 'Relación N₂/N₁', value: roundTo(N2 / N1, 3), unit: '' }
      ],
      'bottom-left'
    );
  }

  /** Bobina vertical: nLoops círculos apilados (vista de lado). */
  _coil(scene, cx, cy, loops, r, color) {
    const spacing = r * 1.15;
    const y0 = cy - ((loops - 1) * spacing) / 2;
    for (let i = 0; i < loops; i++) {
      scene.circle(cx, y0 + i * spacing, r, { color, width: 2 });
    }
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    if (this.modoFaraday()) {
      const n = this.emfNow();
      const a = this.emfAnalytic();
      return {
        'Φ': { value: roundTo(this.fluxNow(), 3), unit: 'Wb' },
        'dΦ/dt': { value: roundTo(-(n / Math.max(this.params.N, 1)), 4), unit: 'Wb/s' },
        'ε (numérica)': { value: roundTo(n, 2), unit: 'V' },
        'ε (analítica)': { value: roundTo(a, 2), unit: 'V' },
        'posición del imán': { value: roundTo(this.magnetX(), 2), unit: 'm' }
      };
    }
    const ratio = this.params.N2 / this.params.N1;
    return {
      'V₂/V₁': { value: roundTo(ratio, 3), unit: '' },
      'V₂ pico': { value: roundTo(this.params.Vpk * ratio, 1), unit: 'V' },
      'P₁ ≈ P₂': { value: 'ideal', unit: '' }
    };
  }

  getState() {
    return { t: this.t, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
  }

  destroy() {}
}