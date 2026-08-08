/**
 * @fileoverview Elasticidad — curva σ–ε con régimen elástico y plástico
 * (tanda 5.2). Ejercita `plot` con el área bajo la curva (resiliencia).
 *
 * El módulo modela una probeta de material: mientras la tensión σ aplicada no
 * supera el límite elástico σy, la deformación obedece la ley de Hooke
 * ε = σ/E y es recuperable; al pasar σy entra en el régimen plástico y al
 * llegar a σu rota. La entrada es la tensión como fracción del esfuerzo último
 * (0–100 % de σu), de modo que el deslizador barre toda la curva para cada
 * material. El usuario ve la probeta alargarse y el punto deslizarse sobre la
 * curva σ–ε, cuyo área elástica es la resiliencia.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

/** Presets por material: E (Pa), σy (Pa), σu (Pa), εu (adimensional). */
const MATERIALS = {
  acero: { label: 'Acero', E: 200e9, sy: 250e6, su: 400e6, eu: 0.2 },
  aluminio: { label: 'Aluminio', E: 69e9, sy: 276e6, su: 310e6, eu: 0.17 },
  cobre: { label: 'Cobre', E: 117e9, sy: 70e6, su: 220e6, eu: 0.45 },
  caucho: { label: 'Caucho', E: 5e6, sy: 2e6, su: 18e6, eu: 4 }
};

const MPa = 1e6;

export default class Elasticity extends SimModule {
  static viewport = { width: 22, height: 14 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'material',
      type: 'select',
      label: 'Material',
      value: 'acero',
      options: Object.entries(MATERIALS).map(([v, m]) => ({ value: v, label: m.label }))
    },
    { id: 'L0', label: 'Longitud inicial', latex: 'L_0', unit: 'm', min: 0.5, max: 3, step: 0.1, value: 1.5 },
    { id: 'A', label: 'Sección', latex: 'A', unit: 'cm²', min: 0.5, max: 20, step: 0.5, value: 4 },
    { id: 'frac', label: 'Tensión (fracción de σu)', latex: '\\sigma/\\sigma_u', unit: '%', min: 0, max: 100, step: 1, value: 40 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { material: 'acero', L0: 1.5, A: 4, frac: 40 };
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Elasticidad',
      blurb: 'Curva tensión–deformación: ley de Hooke, frontera elástica y régimen plástico.',
      story:
        'Un mismo acero puede sostener un puente y doblarse sin romperse: la elasticidad es la ciencia de qué se recupera y qué deforma para siempre. Cuando la tensión es pequeña, ε = σ/E devuelve el material a su forma. Pasada la frontera σy, las deformaciones quedan; en σu sobreviene la rotura. La curva σ–ε es el carnet de identidad mecánico de cada material, y el área bajo su parte elástica mide cuánta energía puede almacenar sin deformarse para siempre.',
      cases: [
        'En el régimen elástico, ε = σ/E es lineal y recuperable.',
        'Al pasar σy, la deformación crece y no se deshace al soltar la carga.',
        'El caucho soporta deformaciones de cientos de %; el acero apenas el 0.2%.',
        'Bajar la sección A sube la tensión para la misma fuerza: σ = F/A.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Elasticidad',
      items: [
        {
          name: 'Ley de Hooke (tensión)',
          formula: '\\sigma = E \\cdot \\varepsilon',
          note: 'Válida solo en el régimen elástico, antes de σy.'
        },
        {
          name: 'Deformación unitaria',
          formula: '\\varepsilon = \\Delta L / L_0',
          note: 'Alargamiento relativo a la longitud inicial.'
        },
        {
          name: 'Tensión normal',
          formula: '\\sigma = F / A',
          note: 'Fuerza por unidad de área; la sección A reparte la carga.'
        },
        {
          name: 'Resiliencia',
          formula: 'u = \\tfrac{1}{2}\\sigma_y \\varepsilon_y = \\sigma_y^2 / (2E)',
          note: 'Área bajo la parte elástica de la curva σ–ε (MJ/m³).'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.engine?.reset?.();
  }

  mat() {
    return MATERIALS[this.params.material];
  }

  /** σ aplicada (Pa): fracción del esfuerzo último. */
  stress() {
    return (this.params.frac / 100) * this.mat().su;
  }

  /** ε según el régimen (Hooke / plástico lineal / rotura). */
  strain() {
    const { sy, su, eu, E } = this.mat();
    const sig = this.stress();
    if (sig <= sy) return sig / E;
    if (sig <= su) {
      const ey = sy / E;
      return ey + ((sig - sy) * (eu - ey)) / (su - sy);
    }
    return eu * 2; // fuera de escala: marca de rotura
  }

  elongation() {
    return this.strain() * this.params.L0;
  }

  force() {
    return this.stress() * this.params.A * 1e-4;
  }

  region() {
    const sig = this.stress();
    const { sy, su } = this.mat();
    if (sig < sy) return 'Elástico';
    if (sig < su) return 'Plástico';
    return 'Rotura';
  }

  resilience() {
    const { sy, E } = this.mat();
    return (sy * sy) / (2 * E) / 1e6; // MJ/m³
  }

  /** Presentación del módulo de Young (GPa o MPa según el orden de magnitud). */
  Etext() {
    const E = this.mat().E;
    if (E >= 1e9) return `${Math.round(E / 1e9)} GPa`;
    return `${roundTo(E / 1e6, 1)} MPa`;
  }

  /** Puntos [ε, σ/MPa] en el rango accesible por el deslizador. */
  _curvePoints() {
    const { sy, su, eu, E } = this.mat();
    const ey = sy / E;
    const pts = [];
    const n = 80;
    for (let i = 0; i <= n; i++) {
      const sig = (su * i) / n;
      let eps;
      if (sig <= sy) {
        eps = sig / E;
      } else {
        eps = ey + ((sig - sy) * (eu - ey)) / (su - sy);
      }
      pts.push({ x: eps, y: sig / MPa });
    }
    return pts;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { material, L0, A, frac } = this.params;
    const e = this.strain();
    const L = L0 * (1 + e);
    const w = scene.world();
    const cx = 0; // probeta centrada en el origen del mundo
    const cap = w.top - 2.0; // cap fijo cerca de la cima del mundo
    const broken = this.region() === 'Rotura';

    // Probeta cuelga del cap hacia abajo, elongada según ε (sin salir del mundo).
    const maxL = this.mat().eu > 1 ? 9 : 7;
    const lSpace = cap - w.bottom - 0.9;
    const lPx = Math.max(0.8, Math.min(lSpace, (L / maxL) * (cap - w.bottom - 2)));
    const yTop = cap; // arriba de la probeta
    const yBot = cap - lPx; // abajo de la probeta
    scene.rect(cx, cap - lPx / 2, 1.2, lPx, { color: 'spring', width: 2, fill: 'energy', alpha: 0.25 });
    scene.rect(cx - 1.4, cap + 0.25, 4, 0.5, { color: 'textDim', width: 2, fill: 'mass' });
    scene.line(cx - 2.8, cap + 0.25, cx + 2.8, cap + 0.25, { color: 'textDim', width: 3 });

    const F = this.force();
    const k = 5.9e-6; // techo de 2.6 u de mundo para la fuerza máxima
    scene.vector(cx, cap + 0.35, 0, Math.min(F * k, w.top - cap - 0.55), {
      color: 'force',
      label: `F = ${roundTo(F / 1e3, 1)} kN`,
      labelSide: 1
    });
    scene.dimension(cx + 1.3, yBot, cx + 1.3, yBot + (lPx / maxL) * L0, `${L0} m →`, { color: 'textDim' });

    scene.label(cx, yBot - 0.55, `Región: ${this.region()}   E = ${this.Etext()}`, { color: 'energy' });
    if (broken) scene.label(cx, yBot - 1.5, 'Rotura: la probeta cede', { color: 'danger' });

    // Curva σ–ε con el área elástica resaltada (resiliencia).
    const hud = scene.hud;
    const vp = scene.viewport(); // el plot vive en px del HUD
    const pts = this._curvePoints();
    const eu = this.mat().eu;
    const su = this.mat().su / MPa;
    const sy = this.mat().sy / MPa;
    const ey = Math.min(pts[pts.length - 1].x, this.mat().sy / this.mat().E * 1.5);
    const rect = { x: vp.x + vp.w - 245, y: vp.y + 24, w: 230, h: 152 };
    const maxX = eu * 1.15;
    const maxY = su * 1.15;
    const elasticPts = pts.filter((p) => p.y <= sy).map((p) => ({ x: p.x, y: p.y }));
    const yieldPts = [{ x: 0, y: sy }, { x: (this.mat().sy / this.mat().E) * 1.25, y: sy }];
    hud.plot({ x: vp.x + vp.w - 245, y: vp.y + 24, w: 230, h: 152 }, {
      title: 'Curva σ–ε — el área elástica es la resiliencia',
      xRange: [0, maxX],
      yRange: [0, maxY],
      series: [
        { points: pts, color: 'energy', label: 'σ(ε)', fill: true },
        { points: elasticPts, color: 'velocity', label: 'Hooke' },
        { points: yieldPts, color: 'textDim', dash: [3, 3] },
        { points: [{ x: e, y: this.stress() / MPa }], color: 'danger', label: 'Estado actual', pointSize: 3.5 }
      ]
    });

    hud.chip(`Material: ${this.mat().label}`, 'top-left');
    hud.readout(
      [
        { label: 'σ', value: roundTo(this.stress() / MPa, 1), unit: 'MPa' },
        { label: 'ε', value: roundTo(e, 4), unit: '' },
        { label: 'ΔL', value: roundTo(this.elongation(), 3), unit: 'm' },
        { label: 'F', value: roundTo(F / 1e3, 1), unit: 'kN' },
        { label: 'Resiliencia', value: roundTo(this.resilience(), 2), unit: 'MJ/m³' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    return {
      'σ': { value: roundTo(this.stress() / MPa, 1), unit: 'MPa' },
      'ε': { value: roundTo(this.strain(), 5), unit: '' },
      'ΔL': { value: roundTo(this.elongation(), 3), unit: 'm' },
      'F': { value: roundTo(this.force() / 1e3, 1), unit: 'kN' },
      'Región': { value: this.region(), unit: '' },
      'E': this.mat().E >= 1e9
        ? { value: Math.round(this.mat().E / 1e9), unit: 'GPa' }
        : { value: roundTo(this.mat().E / 1e6, 1), unit: 'MPa' }
    };
  }

  getState() {
    return { params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
  }
}