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
import { thermalColor } from '../core/draw-primitives.js';
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
    scene.label(x + len / 2, y - 0.62, label, { avoid: true, color });
  }

  _drawLine(scene) {
    const { L0, T } = this.params;
    const alpha = this.alphaOf(this.params.material);
    const dT = this.dT();
    const dL = alpha * L0 * dT;
    // Deformación visual amplificada y acotada a un 40 % de la longitud base.
    const vis = Math.max(-L0 * 0.4, Math.min(L0 * 0.4, dL * GAIN));
    // Animación suave de la expansión al abrir o cambiar parámetros.
    const k = 1 - Math.exp(-Math.min(this.t, 80) * 1.6);
    const dVis = vis * k;
    const Lvis = L0 + dVis;
    // Escala de dibujo: la barra de L₀ ocupa ~12 unidades de mundo.
    const S = 12 / 5; // 5 m → 12 u (L0 ∈ [0.5, 5])
    const x0 = -9.5; // extremo fijo (pared) a la izquierda
    const yBar = 0.4;
    const H = 1.5; // diámetro del cilindro
    const w0 = L0 * S;
    const w1 = Lvis * S;
    const dW = dVis * S;

    /* ---- Fondo: gradiente térmico frío (izq, azul) → caliente (der, rojo) ---- */
    const cold = '#1f5fbf';
    const hot = '#e8442a';
    const nBands = 48;
    const wv = scene.world();
    const left = wv.left;
    const right = wv.right;
    const top = wv.top;
    const bottom = wv.bottom;
    const bandW = (right - left) / nBands;
    for (let i = 0; i < nBands; i++) {
      const bx = left + (i + 0.5) * bandW;
      const c = thermalColor(cold, hot, i / (nBands - 1));
      scene.rect(bx, (top + bottom) / 2, bandW + 0.04, Math.abs(top - bottom), { fill: c, stroke: false, alpha: 0.16 });
    }
    scene.label(left + 1.6, top - 2.1, 'frío', { color: 'mass', size: 11, avoid: true });
    scene.label(right - 1.9, top - 2.1, 'caliente', { color: 'force', size: 11, avoid: true });

    /* ---- Fuente de calor: llama bajo el extremo derecho de la barra ---- */
    const flick = 1 + 0.12 * Math.sin(this.t * 9) + 0.06 * Math.sin(this.t * 17);
    const fx = x0 + w1 + 0.9;
    const fy = yBar - H / 2 - 2.6;
    scene.emphasisHalo(fx, fy + 1, 1.6, { color: 'rgba(255,140,80,0.35)' });
    const flame = (scale, hgt) => {
      const pts = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18;
        const wobble = 1 + 0.08 * Math.sin(this.t * 11 + u * 6);
        pts.push({ x: fx + Math.sin(u * Math.PI) * 0.75 * scale * wobble, y: fy + u * hgt * flick });
      }
      for (let i = 18; i >= 0; i--) {
        const u = i / 18;
        const wobble = 1 + 0.08 * Math.sin(this.t * 13 + u * 5);
        pts.push({ x: fx - Math.sin(u * Math.PI) * 0.75 * scale * wobble, y: fy + u * hgt * flick });
      }
      return pts;
    };
    scene.polygon(flame(1, 2.6), { color: 'ray', fill: 'ray', alpha: 0.75, width: 1 });
    scene.polygon(flame(0.55, 1.7), { color: 'force', fill: 'force', alpha: 0.9, width: 1 });
    scene.polygon(flame(0.25, 0.9), { color: '#fff3c4', fill: '#fff3c4', alpha: 0.9, width: 1 });
    // Mechero: base de la llama.
    scene.rect(fx, fy - 0.35, 0.9, 0.5, { color: 'textDim', fill: 'textDim', alpha: 0.8, width: 1 });
    scene.rect(fx, fy - 1.1, 0.35, 1.1, { color: 'textDim', fill: 'textDim', alpha: 0.8, width: 1 });
    scene.label(fx, fy - 2.1, `fuente de calor · T = ${T} °C`, { avoid: true, color: 'energy', size: 11 });
    // Ondas de calor subiendo hacia la barra.
    for (let j = 0; j < 3; j++) {
      const ph = (this.t * 0.9 + j * 0.33) % 1;
      const yy = fy + 2.6 + ph * 1.4;
      scene.line(fx - 0.5 + j * 0.5, yy, fx - 0.2 + j * 0.5, yy + 0.35, { color: 'force', width: 1.2, alpha: 0.6 * (1 - ph) });
    }

    /* ---- Pared fija a la izquierda ---- */
    scene.rect(x0 - 0.35, yBar, 0.7, H + 2.2, { color: 'textDim', fill: 'textDim', alpha: 0.85, width: 1 });
    for (let yy = yBar - H / 2 - 1.0; yy <= yBar + H / 2 + 1.0; yy += 0.45) {
      scene.line(x0 - 0.7, yy, x0 - 1.15, yy - 0.4, { color: 'textDim', width: 1, alpha: 0.7 });
    }

    /* ---- Barra cilíndrica horizontal (el objeto en estudio) ---- */
    const tone = Math.max(0, Math.min(1, (T + 50) / 450));
    const barColor = thermalColor('#5b8fd6', '#ff6a3d', tone);
    const cx = x0 + w1 / 2;
    // Sombreado cilíndrico: bandas horizontales de claro (arriba) a oscuro (abajo).
    const nShade = 10;
    for (let i = 0; i < nShade; i++) {
      const u = (i + 0.5) / nShade;
      const shade = thermalColor('#ffffff', barColor, 0.35 + 0.65 * Math.abs(u - 0.32) * 1.5);
      scene.rect(cx, yBar + H / 2 - u * H, w1, H / nShade + 0.03, { fill: shade, stroke: false, alpha: 0.95 });
    }
    // Zona ΔL resaltada (la parte nueva de la barra).
    if (Math.abs(dW) > 0.02) {
      scene.rect(x0 + w0 + dW / 2, yBar, Math.abs(dW), H, { fill: 'energy', stroke: false, alpha: 0.35 });
      scene.line(x0 + w0, yBar - H / 2, x0 + w0, yBar + H / 2, { color: 'energy', width: 1.6, dash: [4, 3] });
    }
    // Contorno y tapas elípticas (perspectiva de cilindro).
    scene.rect(cx, yBar, w1, H, { color: barColor, width: 2.2, stroke: true });
    scene.ellipse(x0 + w1, yBar, 0.32, H / 2, { color: barColor, fill: barColor, fillAlpha: 0.9, width: 2.2 });
    scene.ellipse(x0, yBar, 0.32, H / 2, { color: barColor, width: 2.2, alpha: 0.6 });
    scene.label(cx, yBar + H / 2 + 0.55, `L = ${roundTo(L0 + dL, 4)} m`, { avoid: true, color: 'text', size: 12 });

    /* ---- Flecha superior bidireccional: dirección del aumento de longitud ---- */
    const yTop = yBar + H / 2 + 2.1;
    scene.dimension(x0, yTop, x0 + w1, yTop, '', { color: 'energy' });
    scene.label(cx, yTop + 0.55, `⟵ la longitud crece a lo largo del eje ⟶`, { avoid: true, color: 'energy', size: 11 });

    /* ---- Flecha inferior segmentada: L₀ + ΔL ---- */
    const yBot = yBar - H / 2 - 1.5;
    scene.dimension(x0, yBot, x0 + w0, yBot, `L₀ = ${roundTo(L0, 2)} m`, { color: 'textDim', dash: [6, 4], offset: 0 });
    if (Math.abs(dW) > 0.02) {
      scene.dimension(x0 + w0, yBot, x0 + w1, yBot, `ΔL = ${roundTo(dL * 1000, 2)} mm`, {
        color: 'energy',
        dash: [3, 3],
        offset: 0
      });
      scene.line(x0 + w0, yBot - 0.45, x0 + w0, yBot + 0.45, { color: 'energy', width: 1.4 });
      scene.chip(cx, yBot - 1.15, `ΔL = α·L₀·ΔT (dibujo ×${GAIN})`, { avoid: true, color: 'energy' });
    } else {
      scene.chip(cx, yBot - 1.15, `ΔT = ${roundTo(dT, 0)} °C → aún sin dilatación visible`, {
        avoid: true,
        color: 'textDim'
      });
    }

    scene.hud.chip(
      `Dilatación lineal — ${this.params.material.toUpperCase()} (α = ${alpha * 1e6}×10⁻⁶/°C)`,
      'top-left',
      { color: 'energy' }
    );
    scene.hud.readout(
      [
        { label: 'ΔT', value: roundTo(dT, 0), unit: 'K' },
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

    scene.label(-9.4, 5.9, `Área inicial ${roundTo(s0 * s0, 2)} m²`, { avoid: true, align: 'left', color: 'textDim' });
    scene.rect(cx - s0 / 2, 3 - s0 / 2, s0, s0, { color: 'textDim', width: 2 });
    scene.label(-9.4, -2.4, `Área dilatada ${roundTo(s1 * s1, 2)} m²`, { avoid: true, align: 'left', color: 'mass' });
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
    scene.label(-6.5, 7.8, 'V₀ = ' + roundTo(a0 * a0 * a0, 2) + ' m³', { avoid: true, color: 'textDim' });
    cube(4.5, 4.5, a1, 'mass');
    scene.label(4.5, 7.8, 'Dilatado', { avoid: true, color: 'mass' });

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

    scene.label(x0 + Lv / 2, y0 + 2.6, `T − T₀ = ${roundTo(dT, 0)} °C`, { avoid: true, color: 'energy' });
    scene.chip(x0, y0 - 2.2, `R real ≈ ${R >= 100 ? '∞' : roundTo(R, 2) + ' m'}`, { avoid: true, color: 'textDim' });

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
    scene.label(x0 - 0.5, y0 - 0.8, 'Fijo', { avoid: true, color: 'textDim' });

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
