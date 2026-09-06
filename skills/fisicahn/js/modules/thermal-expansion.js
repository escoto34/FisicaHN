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

/** Escalas de dibujo por modo: metros → unidades de mundo. */
const SURF_SCALE = 2.6;
const VOL_SCALE = 2.2;
const BIM_SCALE = 24;

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
      showIf: { modo: ['lineal', 'superficial', 'volumetrica'] },
      type: 'select',
      label: 'Material',
      value: 'acero',
      options: Object.entries(MATERIALS).map(([v, m]) => ({ value: v, label: m.label }))
    },
    { id: 'T', label: 'Temperatura', latex: 'T', unit: '°C', min: -50, max: 400, step: 5, value: 275 },
    { id: 'L0', label: 'Longitud inicial', latex: 'L_0', unit: 'm', min: 0.5, max: 5, step: 0.1, value: 2, showIf: { modo: 'lineal' } },
    { id: 's0', label: 'Lado inicial', latex: 's_0', unit: 'm', min: 0.4, max: 3, step: 0.1, value: 1, showIf: { modo: 'superficial' } },
    { id: 'a0', label: 'Arista inicial', latex: 'a_0', unit: 'm', min: 0.4, max: 3, step: 0.1, value: 1, showIf: { modo: 'volumetrica' } },
    {
      id: 'meta1',
      showIf: { modo: 'bimetalica' },
      type: 'select',
      label: 'Lámina inferior',
      value: 'acero',
      options: Object.entries(MATERIALS).map(([v, m]) => ({ value: v, label: m.label }))
    },
    {
      id: 'meta2',
      showIf: { modo: 'bimetalica' },
      type: 'select',
      label: 'Lámina superior',
      value: 'aluminio',
      options: Object.entries(MATERIALS).map(([v, m]) => ({ value: v, label: m.label }))
    },
    { id: 'L', label: 'Longitud tira', latex: 'L', unit: 'm', min: 0.05, max: 0.5, step: 0.05, value: 0.2, showIf: { modo: 'bimetalica' } },
    { id: 't', label: 'Grosor por lámina', latex: 't', unit: 'mm', min: 0.2, max: 3, step: 0.2, value: 1.5, showIf: { modo: 'bimetalica' } }
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
    /** Paradas del sombreado cilíndrico (abajo → brillo → arriba); sólo cambia el color. */
    this._shade = [[0, '#000'], [0.68, '#fff'], [1, '#000']];
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
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
    this.setModuleFormulas({
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
    this.clearChallenges();
  }

  reset() {
    // Cada modo tiene su propia escala: la barra es larga y estrecha; los
    // cuadrados y cubos, compactos; la tira bimetálica, diminuta (0,2 m).
    const modo = this.params.modo;
    if (modo === 'superficial') {
      // Dos cuadrados de lado ≤ 1,4·s₀ separados 0,75 de su ancho.
      const W = this.params.s0 * 1.4 * SURF_SCALE;
      this.frameWorld(2.6 * W + 1.6, W + 2.8);
    } else if (modo === 'volumetrica') {
      const W = this.params.a0 * 1.4 * VOL_SCALE;
      this.frameWorld(2.8 * W + 1.6, W + 3.2);
    } else if (modo === 'bimetalica') {
      const Lv = this.params.L * BIM_SCALE;
      this.frameWorld(Lv * 1.6, Lv * 1.3);
    } else {
      this.frameWorld(24, 16);
    }
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
    const wv = scene.world();
    const left = wv.left;
    const right = wv.right;
    const top = wv.top;
    const bottom = wv.bottom;
    scene.gradientRect((left + right) / 2, (top + bottom) / 2, right - left, top - bottom, { from: cold, to: hot, alpha: 0.16 });
    scene.label(left + 1.6, top - 2.1, 'frío', { color: 'mass', size: 11, avoid: true });
    scene.label(right - 1.9, top - 2.1, 'caliente', { color: 'force', size: 11, avoid: true });

    /* ---- Fuente de calor: llama bajo el extremo derecho de la barra ---- */
    const fx = x0 + w1 + 0.9;
    const fy = yBar - H / 2 - 2.6;
    scene.flame(fx, fy, { h: 2.6, w: 1.5, t: this.t });
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

    /* ---- Pared fija a la izquierda (bloque sólido + rayado de apoyo) ---- */
    scene.rect(x0 - 0.35, yBar, 0.7, H + 2.2, { color: 'textDim', fill: 'textDim', alpha: 0.85, width: 1 });
    scene.wall(x0 - 0.7, yBar - H / 2 - 1.1, yBar + H / 2 + 1.1, {
      side: 'left', width: 1, alpha: 0.7, spacing: scene.px(0.45), length: scene.px(0.6)
    });

    /* ---- Barra cilíndrica horizontal (el objeto en estudio) ---- */
    const tone = Math.max(0, Math.min(1, (T + 50) / 450));
    const barColor = thermalColor('#5b8fd6', '#ff6a3d', tone);
    const cx = x0 + w1 / 2;
    // Sombreado cilíndrico: degradado vertical con el brillo a un tercio de la
    // altura (abajo = color pleno, arriba = algo más claro).
    this._shade[0][1] = barColor;
    this._shade[1][1] = thermalColor('#ffffff', barColor, 0.35);
    this._shade[2][1] = thermalColor('#ffffff', barColor, 0.66);
    scene.gradientRect(cx, yBar, w1, H, { direction: 'vertical', stops: this._shade, alpha: 0.95 });
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
    // Los dos cuadrados, lado a lado y centrados en el origen: antes uno
    // quedaba sobre el otro en el borde izquierdo del encuadre.
    const S = SURF_SCALE;
    const w0 = s0 * S;
    const w1 = s1 * S;
    const sep = Math.max(w0, w1) * 0.75;
    const xA = -sep;
    const xB = sep;

    scene.rect(xA, 0, w0, w0, { color: 'textDim', width: 2 });
    scene.label(xA, w0 / 2 + 0.35 * S, `Área inicial ${roundTo(s0 * s0, 2)} m²`, { avoid: true, color: 'textDim' });
    scene.rect(xB, 0, w1, w1, { color: 'mass', width: 2, fill: 'mass', alpha: 0.12 });
    scene.label(xB, w1 / 2 + 0.35 * S, `Área dilatada ${roundTo(s1 * s1, 2)} m²`, { avoid: true, color: 'mass' });
    // El cuadrado inicial superpuesto en trazo fino: el crecimiento se ve.
    scene.rect(xB, 0, w0, w0, { color: 'textDim', width: 1, dash: [4, 4], alpha: 0.8 });

    scene.dimension(xB - w1 / 2, -w1 / 2 - 0.35 * S, xB + w1 / 2, -w1 / 2 - 0.35 * S, `${roundTo(s1, 3)} m`, {
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

    // Dos cubos centrados en el origen (antes vivían en la franja superior).
    const S = VOL_SCALE;
    const sepV = Math.max(a0, a1) * S * 0.85;
    cube(-sepV, 0, a0 * S, 'textDim');
    scene.label(-sepV, (a0 * S) / 2 + 0.6, 'V₀ = ' + roundTo(a0 * a0 * a0, 2) + ' m³', { avoid: true, color: 'textDim' });
    cube(sepV, 0, a1 * S, 'mass');
    scene.label(sepV, (a1 * S) / 2 + 0.6, `Dilatado ${roundTo(a1 * a1 * a1, 2)} m³`, { avoid: true, color: 'mass' });

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
    // Flexión dibujada: acotada a la mitad de la longitud de la tira y a la
    // misma escala que ella (antes la tira se dibujaba ×10 y la flecha no, de
    // modo que la curvatura era casi invisible).
    const yVis = Math.max(-L * 0.5, Math.min(L * 0.5, yPhys * GAIN_BIM));
    const yEnd = Math.sign(dT) * (a2 >= a1 ? 1 : -1) * yVis * BIM_SCALE;
    // La tira mide centímetros: se dibuja a escala fija y centrada, no en la
    // esquina superior izquierda de un encuadre de 24 u.
    const Lv = L * BIM_SCALE;
    const x0 = -Lv / 2;
    // La tira se centra sobre su propia flexión: si el extremo sube 2 u, el
    // empotramiento baja 1 y el conjunto queda en mitad del encuadre.
    const y0 = -yEnd / 2;

    scene.label(0, y0 + Lv * 0.42, `T − T₀ = ${roundTo(dT, 0)} °C`, { avoid: true, color: 'energy' });
    scene.chip(0, y0 - Lv * 0.5, `R real ≈ ${R >= 100 ? '∞' : roundTo(R, 2) + ' m'}`, { avoid: true, color: 'textDim' });

    // Lámina superior (α mayor, queda fuera al curvar) y lámina inferior:
    // parábola y = y₀ + u²·δ muestreada por la escena.
    const grosor = Math.max(0.06, Lv * 0.02);
    const lamina = (offsetY) => (u, o) => {
      o.x = x0 + u * Lv;
      o.y = y0 + u * u * yEnd + offsetY;
    };
    scene.curve(lamina(grosor), 0, 1, { samples: 40, color: 'mass2', width: 8 });
    scene.curve(lamina(-grosor), 0, 1, { samples: 40, color: 'mass', width: 8 });
    scene.body(x0, y0, { shape: 'rect', w: Lv * 0.09, h: Lv * 0.13, color: 'textDim' });
    scene.label(x0 - Lv * 0.09, y0 - Lv * 0.16, 'Fijo', { avoid: true, color: 'textDim' });

    scene.vector(x0 + Lv, y0 + yEnd, Lv * 0.1, Math.sign(yEnd) * Lv * 0.1, {
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
