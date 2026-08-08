/**
 * @fileoverview Dilatación térmica — lineal, superficial, volumétrica y tira
 * bimetálica (tanda 5.3).
 *
 * ΔL = α·L₀·ΔT, ΔA = 2α·A₀·ΔT y ΔV ≈ 3α·V₀·ΔT. Las deformaciones reales son
 * del orden del milímetro, así que los tres primeros modos las dibujan con una
 * amplificación declarada (GAIN) y acotada; el modo `bimetalica` muestra la
 * tira que curva dos láminas de distinto α — el mecanismo del termostato de
 * casa y del interruptor de planchas.
 *
 * Todo es analítico: no hay integración temporal. Ejercita `rect`, `polygon`,
 * `polyline`, `dimension`, `chip` y `readout`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

/** Materiales con α en 10⁻⁶/°C. */
const MATERIALS = {
  invar: { label: 'Invar (1.2e-6)', alpha: 1.2 },
  pirex: { label: 'Pirex (3.3e-6)', alpha: 3.3 },
  vidrio: { label: 'Vidrio común (8e-6)', alpha: 8 },
  acero: { label: 'Acero (12e-6)', alpha: 12 },
  cobre: { label: 'Cobre (17e-6)', alpha: 17 },
  aluminio: { label: 'Aluminio (24e-6)', alpha: 24 }
};
const T0 = 150; // °C de referencia: ΔL = 0 en esta temperatura.
/** Amplificación de la deformación dibujada (declarada en pantalla). */
const GAIN = 850;
/** Amplificación de la flexión de la tira bimetálica. */
const GAIN_BIM = 160;

export default class ThermalExpansion extends SimModule {
  static viewport = { width: 24, height: 16 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'lineal',
      options: [
        { value: 'lineal', label: 'Dilatación lineal' },
        { value: 'superficial', label: 'Dilatación superficial' },
        { value: 'volumetrica', label: 'Dilatación volumétrica' },
        { value: 'bimetalica', label: 'Tira bimetálica' }
      ]
    },
    {
      id: 'material',
      type: 'select',
      label: 'Material',
      value: 'acero',
      options: Object.entries(MATERIALS).map(([v, m]) => ({ value: v, label: m.label }))
    },
    { id: 'T', label: 'Temperatura', latex: 'T', unit: '°C', min: -50, max: 400, step: 5, value: 275 },
    { id: 'L0', label: 'Longitud inicial', latex: 'L_0', unit: 'm', min: 0.5, max: 5, step: 0.1, value: 2 },
    { id: 's0', label: 'Lado inicial', latex: 's_0', unit: 'm', min: 0.4, max: 3, step: 0.1, value: 1 },
    { id: 'a0', label: 'Arista inicial', latex: 'a_0', unit: 'm', min: 0.4, max: 3, step: 0.1, value: 1 },
    {
      id: 'meta1',
      type: 'select',
      label: 'Lámina inferior',
      value: 'acero',
      options: Object.entries(MATERIALS).map(([v, m]) => ({ value: v, label: m.label }))
    },
    {
      id: 'meta2',
      type: 'select',
      label: 'Lámina superior',
      value: 'aluminio',
      options: Object.entries(MATERIALS).map(([v, m]) => ({ value: v, label: m.label }))
    },
    { id: 'L', label: 'Longitud tira', latex: 'L', unit: 'm', min: 0.05, max: 0.5, step: 0.05, value: 0.2 },
    { id: 't', label: 'Grosor por lámina', latex: 't', unit: 'mm', min: 0.2, max: 3, step: 0.2, value: 1.5 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'lineal',
      material: 'acero',
      T: 275,
      L0: 2,
      s0: 1,
      a0: 1,
      meta1: 'acero',
      meta2: 'aluminio',
      L: 0.2,
      t: 1.5
    };
    this.t = 0;
    this.useCharts = false;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Dilatación térmica',
      blurb: 'ΔL = α·L₀·ΔT en lineal, superficial y volumétrica, y la tira bimetálica.',
      story:
        'Todo sólido respira con la temperatura: los átomos vibran más y la distancia media entre ellos crece. El coeficiente α mide cuánto por grado. Si el crecimiento se bloquea, el esfuerzo es enorme — por eso los rieles del tren tienen juntas de expansión. Y cuando dos metales distintos se sueldan, la lámina se curva al calentarse: es el corazón del termostato doméstico.',
      cases: [
        'Calentar acero: ΔL de milímetros sobre una barra de 2 m (aquí amplificada).',
        'Cambiar de vidrio a invar: la deformación se divide por ~7.',
        'Dilatación superficial: el área crece el doble que cada lado.',
        'Tira bimetálica: se curva hacia la lámina de menor α al calentar.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Dilatación térmica',
      items: [
        {
          name: 'Lineal',
          formula: '\\Delta L = \\alpha \\, L_0 \\, \\Delta T',
          note: 'α es propio de cada material (1/°C).'
        },
        {
          name: 'Superficial',
          formula: '\\Delta A = 2 \\alpha \\, A_0 \\, \\Delta T',
          note: 'Dos direcciones por cada lado.'
        },
        {
          name: 'Volumétrica',
          formula: '\\Delta V \\approx 3 \\alpha \\, V_0 \\, \\Delta T',
          note: 'β ≈ 3α para sólidos isótropos.'
        },
        {
          name: 'Tira bimetálica',
          formula: 'R \\approx \\dfrac{t}{(\\alpha_2 - \\alpha_1)\\,\\Delta T}',
          note: 'Radio de curvatura: menor α estira menos y dobla hacia su lado.'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.engine?.reset?.();
  }

  update(dt) {
    this.t += dt;
  }

  dT() {
    return this.params.T - T0;
  }

  alphaOf(id) {
    return (MATERIALS[id] || MATERIALS.acero).alpha * 1e-6;
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    const modo = this.params.modo;
    if (modo === 'lineal') this._drawLine(scene);
    else if (modo === 'superficial') this._drawSurface(scene);
    else if (modo === 'volumetrica') this._drawVolume(scene);
    else this._drawBimetal(scene);
  }

  /** Barra de longitud len (m) con etiqueta. */
  _bar(scene, x, y, len, color, label) {
    scene.rect(x, y - 0.3, len, 0.6, { color, width: 2.5 });
    scene.label(x + len / 2, y - 0.62, label, { color });
  }

  _drawLine(scene) {
    const { L0 } = this.params;
    const dL = this.alphaOf(this.params.material) * L0 * this.dT();
    // Deformación visual amplificada y acotada a la mitad de la longitud base.
    const vis = Math.max(-L0 * 0.5, Math.min(L0 * 0.5, dL * GAIN));
    const L1 = L0 + vis;
    const x = -9;

    scene.label(-9.4, 6.9, `Referencia  T₀ = ${T0} °C`, { color: 'textDim' });
    this._bar(scene, x, 6, L0, 'textDim', `${L0} m`);
    scene.label(-9.4, 1.9, `Calentado  T = ${this.params.T} °C`, { color: 'mass' });
    this._bar(scene, x, 1, L1, 'mass', `${roundTo(L1, 3)} m`);

    if (Math.abs(vis) > 0.01) {
      scene.dimension(x + L0, 2.3, x + L1, 2.3, `ΔL = ${roundTo(dL * 1000, 2)} mm`, {
        color: 'energy'
      });
      scene.chip(x, -0.4, `Deformación ×${GAIN} para que se vea`, { color: 'energy' });
    }

    scene.hud.readout(
      [
        { label: 'ΔT', value: roundTo(this.dT(), 0), unit: 'K' },
        { label: 'ΔL real', value: roundTo(dL * 1000, 3), unit: 'mm' },
        { label: 'L final', value: roundTo(L0 + dL, 5), unit: 'm' }
      ],
      'bottom-left'
    );
  }

  _drawSurface(scene) {
    const { s0 } = this.params;
    const dA = 2 * this.alphaOf(this.params.material) * s0 * s0 * this.dT();
    const vis = Math.max(-s0 * 0.4, Math.min(s0 * 0.4, this.alphaOf(this.params.material) * s0 * this.dT() * GAIN));
    const s1 = s0 + vis;
    const cx = -5;

    scene.label(-9.4, 5.9, `Área inicial ${roundTo(s0 * s0, 2)} m²`, { color: 'textDim' });
    scene.rect(cx - s0 / 2, 3 - s0 / 2, s0, s0, { color: 'textDim', width: 2 });
    scene.label(-9.4, -2.4, `Área dilatada ${roundTo(s1 * s1, 2)} m²`, { color: 'mass' });
    scene.rect(cx - s1 / 2, -4 - s1 / 2, s1, s1, { color: 'mass', width: 2 });

    scene.dimension(cx - s1 / 2, -4 - s1 / 2 - 0.8, cx + s1 / 2, -4 - s1 / 2 - 0.8, `${roundTo(s1, 3)} m`, {
      color: 'textDim'
    });

    scene.hud.readout(
      [
        { label: 'ΔT', value: roundTo(this.dT(), 0), unit: 'K' },
        { label: 'ΔA real', value: roundTo(dA * 10000, 1), unit: 'cm²' },
        { label: 'Lado final', value: roundTo(s0 + this.alphaOf(this.params.material) * s0 * this.dT(), 6), unit: 'm' }
      ],
      'bottom-left'
    );
  }

  _drawVolume(scene) {
    const { a0 } = this.params;
    const dV = 3 * this.alphaOf(this.params.material) * a0 * a0 * a0 * this.dT();
    const vis = Math.max(-a0 * 0.4, Math.min(a0 * 0.4, this.alphaOf(this.params.material) * a0 * this.dT() * GAIN));
    const a1 = a0 + vis;

    const cube = (x, y, side, color) => {
      // Proyección isométrica simple: frente + aristas superiores.
      scene.polygon(
        [
          { x: x - side / 2, y: y + side / 2 },
          { x: x + side / 2, y: y + side / 2 },
          { x: x + side / 2, y: y - side / 2 },
          { x: x - side / 2, y: y - side / 2 }
        ],
        { color, fill: color, alpha: 0.12, width: 2 }
      );
      scene.line(x - side / 2, y - side / 2, x - side / 2 - side * 0.22, y - side / 2 - side * 0.28, { color, width: 2 });
      scene.line(x + side / 2, y - side / 2, x + side / 2 - side * 0.22, y - side / 2 - side * 0.28, { color, width: 2 });
      scene.line(x - side / 2, y + side / 2, x - side / 2 - side * 0.22, y + side / 2 - side * 0.28, { color, width: 2 });
      scene.line(x + side / 2, y + side / 2, x + side / 2 - side * 0.22, y + side / 2 - side * 0.28, { color, width: 2 });
      scene.polygon(
        [
          { x: x - side / 2 - side * 0.22, y: y - side / 2 - side * 0.28 },
          { x: x + side / 2 - side * 0.22, y: y - side / 2 - side * 0.28 },
          { x: x + side / 2 - side * 0.22, y: y + side / 2 - side * 0.28 },
          { x: x - side / 2 - side * 0.22, y: y + side / 2 - side * 0.28 }
        ],
        { color, width: 2 }
      );
    };

    cube(-6.5, 4.5, a0, 'textDim');
    scene.label(-6.5, 7.8, 'V₀ = ' + roundTo(a0 * a0 * a0, 2) + ' m³', { color: 'textDim' });
    cube(4.5, 4.5, a1, 'mass');
    scene.label(4.5, 7.8, 'Dilatado', { color: 'mass' });

    scene.hud.readout(
      [
        { label: 'ΔT', value: roundTo(this.dT(), 0), unit: 'K' },
        { label: 'ΔV real', value: roundTo(dV * 1e6, 1), unit: 'cm³' },
        { label: 'V final', value: roundTo(Math.pow(a0 + this.alphaOf(this.params.material) * a0 * this.dT(), 3), 5), unit: 'm³' }
      ],
      'bottom-left'
    );
  }

  _drawBimetal(scene) {
    const { L, t, meta1, meta2 } = this.params;
    const a1 = this.alphaOf(meta1);
    const a2 = this.alphaOf(meta2);
    const tTot = 2 * t * 1e-3;
    const dT = this.dT();
    // Flexión física (aprox. pequeña curvatura) y radio real.
    const yPhys = (L * L * Math.abs(a2 - a1) * Math.abs(dT)) / (2 * tTot);
    const R = tTot / (Math.abs(a2 - a1) * Math.abs(dT) + 1e-12);
    // Deformación visual acotada.
    const yVis = Math.max(-L * 2.4, Math.min(L * 2.4, yPhys * GAIN_BIM));
    const yEnd = Math.sign(dT) * (a2 >= a1 ? 1 : -1) * yVis;
    const Lv = L * 10; // la tira de 0.2 m se dibuja de 2 m.
    const x0 = -8;
    const y0 = 4;

    scene.label(x0 + Lv / 2, y0 + 2.6, `T − T₀ = ${roundTo(dT, 0)} °C`, { color: 'energy' });
    scene.chip(x0, y0 - 2.2, `R real ≈ ${R >= 100 ? '∞' : roundTo(R, 2) + ' m'}`, { color: 'textDim' });

    const pts = (offsetY) => {
      const out = [];
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        out.push({ x: x0 + u * Lv, y: y0 + u * u * yEnd + offsetY });
      }
      return out;
    };
    // Lámina superior (α mayor, queda fuera al curvar) y lámina inferior.
    scene.polyline(pts(0.09), { color: 'mass2', width: 8 });
    scene.polyline(pts(-0.09), { color: 'mass', width: 8 });
    scene.body(x0, y0, { shape: 'rect', w: 0.5, h: 0.7, color: 'textDim' });
    scene.label(x0 - 0.5, y0 - 0.8, 'Fijo', { color: 'textDim' });

    scene.vector(x0 + Lv, y0 + yEnd, 0.5, Math.sign(yEnd) * 0.5, {
      color: 'energy',
      label: `δ ≈ ${roundTo(yPhys * 1000, 2)} mm`,
      labelSide: 1
    });

    scene.hud.readout(
      [
        { label: 'α₁', value: a1 * 1e6, unit: '×10⁻⁶/°C' },
        { label: 'α₂', value: a2 * 1e6, unit: '×10⁻⁶/°C' },
        { label: 'Flexión δ', value: roundTo(yPhys * 1000, 3), unit: 'mm' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const dT = this.dT();
    if (this.params.modo === 'lineal') {
      const dL = this.alphaOf(this.params.material) * this.params.L0 * dT;
      return {
        'ΔT': { value: roundTo(dT, 0), unit: 'K' },
        'ΔL': { value: roundTo(dL * 1000, 3), unit: 'mm' },
        'L final': { value: roundTo(this.params.L0 + dL, 5), unit: 'm' }
      };
    }
    if (this.params.modo === 'superficial') {
      const dA = 2 * this.alphaOf(this.params.material) * this.params.s0 * this.params.s0 * dT;
      return {
        'ΔA': { value: roundTo(dA * 10000, 1), unit: 'cm²' },
        'Lado final': { value: roundTo(this.params.s0 + this.alphaOf(this.params.material) * this.params.s0 * dT, 6), unit: 'm' }
      };
    }
    if (this.params.modo === 'volumetrica') {
      const dV = 3 * this.alphaOf(this.params.material) * Math.pow(this.params.a0, 3) * dT;
      return {
        'ΔV': { value: roundTo(dV * 1e6, 1), unit: 'cm³' },
        'V final': { value: roundTo(Math.pow(this.params.a0 + this.alphaOf(this.params.material) * this.params.a0 * dT, 3), 5), unit: 'm³' }
      };
    }
    const a1 = this.alphaOf(this.params.meta1);
    const a2 = this.alphaOf(this.params.meta2);
    const tTot = 2 * this.params.t * 1e-3;
    const yPhys = (this.params.L * this.params.L * Math.abs(a2 - a1) * Math.abs(dT)) / (2 * tTot);
    return {
      'Flexión': { value: roundTo(yPhys * 1000, 3), unit: 'mm' },
      'R curvatura': { value: roundTo(tTot / (Math.abs(a2 - a1) * Math.abs(dT) + 1e-12), 2), unit: 'm' }
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
