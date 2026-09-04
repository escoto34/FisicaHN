/**
 * @fileoverview Vectores — suma 2D (método del paralelogramo) y descomposición
 * en componentes (tanda 5.1).
 *
 * Ejercita las primitivas `vector`, `angleArc` y `dimension` de la escena, y el
 * arrastre interactivo (§2.6): las puntas de A y B se pueden arrastrar y la
 * resultante se actualiza al vuelo.
 *
 * Modos:
 * - `suma`: A + B = R con el paralelogramo dibujado y ángulos anotados.
 * - `componentes`: dado |v| y θ, se descomponen vx y vy (y a la inversa).
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';

const DEG = 180 / Math.PI;

export default class VectorsModule extends SimModule {
  static viewport = { width: 22, height: 13 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'suma',
      options: [
        { value: 'suma', label: 'Suma de vectores' },
        { value: 'componentes', label: 'Descomposición' }
      ]
    },
    { id: 'ax', label: 'A_x', latex: 'A_x', unit: 'u', min: -6, max: 6, step: 0.1, value: 4 },
    { id: 'ay', label: 'A_y', latex: 'A_y', unit: 'u', min: -6, max: 6, step: 0.1, value: 3 },
    { id: 'bx', label: 'B_x', latex: 'B_x', unit: 'u', min: -6, max: 6, step: 0.1, value: -2 },
    { id: 'by', label: 'B_y', latex: 'B_y', unit: 'u', min: -6, max: 6, step: 0.1, value: 4 },
    { id: 'mag', label: 'Magnitud', latex: '|v|', unit: 'u', min: 0.5, max: 10, step: 0.1, value: 5 },
    { id: 'ang', label: 'Ángulo', latex: '\\theta', unit: '°', min: 0, max: 360, step: 1, value: 53 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'suma',
      ax: 4, ay: 3, bx: -2, by: 4,
      mag: 5, ang: 53
    };
    /** Vector que el usuario está arrastrando: 'A' | 'B' | null. */
    this.dragging = null;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: 'Vectores',
      blurb: 'Suma de vectores en el plano y descomposición en componentes.',
      story:
        'Un vector es una cantidad con magnitud y dirección: desplazamiento, velocidad, fuerza. La descomposición en componentes es la puerta a todo el análisis posterior — sumar fuerzas o velocidades es sumar componentes, y el paralelogramo muestra por qué eso funciona.',
      cases: [
        'Dos fuerzas concurrentes sobre un punto: la resultante es el paralelogramo.',
        'Un avión que vuela con viento lateral: v_avión + v_viento = v_resultante.',
        'Descomponer el peso de un cuerpo sobre un plano inclinado (necesario en Inclinado).'
      ]
    });
    this.setModuleFormulas({
      title: 'Operaciones con vectores',
      items: [
        {
          name: 'Componentes',
          formula: 'v_x = |v|·cos θ,  v_y = |v|·sin θ',
          note: 'Con θ medido desde el eje x positivo.'
        },
        {
          name: 'Magnitud',
          formula: '|v| = √(v_x² + v_y²)',
          note: 'Teorema de Pitágoras sobre las componentes.'
        },
        {
          name: 'Dirección',
          formula: 'θ = atan2(v_y, v_x)',
          note: 'atan2 resuelve el cuadrante correcto.'
        }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.dragging = null;
    this.engine?.reset?.();
  }

  components() {
    const rad = (this.params.ang * Math.PI) / 180;
    return {
      x: this.params.mag * Math.cos(rad),
      y: this.params.mag * Math.sin(rad)
    };
  }

  magnitude(ax, ay) {
    return Math.hypot(ax, ay);
  }

  angle(ax, ay) {
    return Math.atan2(ay, ax) * DEG;
  }

  update(dt) {
    // Sin física: el estado es puramente geométrico.
  }

  /* ---------- interacción directa (§2.6) ---------- */

  onPickStart(id) {
    if (id === 'A' || id === 'B') this.dragging = id;
  }

  onDrag(id, world) {
    if (id === 'A') {
      this.params.ax = Math.max(-9, Math.min(9, roundTo(world.x, 1)));
      this.params.ay = Math.max(-6, Math.min(6, roundTo(world.y, 1)));
    } else if (id === 'B') {
      this.params.bx = Math.max(-9, Math.min(9, roundTo(world.x, 1)));
      this.params.by = Math.max(-6, Math.min(6, roundTo(world.y, 1)));
    }
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    // Rejilla + ejes: ancla visual para las componentes.
    const w = scene.world();
    this.drawGrid(scene, w);
    scene.axes({ color: 'textDim', width: 1.5, tick: 0 });

    const hud = scene.hud;
    if (this.params.modo === 'suma') this.drawSum(scene, hud);
    else this.drawComponents(scene, hud);
  }

  /** Rejilla de fondo discreta (0.5 u) para leer componentes a ojo: un solo trazo. */
  drawGrid(scene, w) {
    scene.grid(0.5, { color: 'textDim', width: 0.5, alpha: 0.12 });
  }

  drawSum(scene, hud) {
    const { ax, ay, bx, by } = this.params;
    const rx = ax + bx;
    const ry = ay + by;

    // Componentes punteadas de A y B (proyección sobre los ejes).
    scene.line(0, 0, ax, 0, { color: 'mass', dash: [4, 4], alpha: 0.55 });
    scene.line(ax, 0, ax, ay, { color: 'mass', dash: [4, 4], alpha: 0.55 });
    scene.line(0, 0, bx, 0, { color: 'mass2', dash: [4, 4], alpha: 0.55 });
    scene.line(bx, 0, bx, by, { color: 'mass2', dash: [4, 4], alpha: 0.55 });

    // Lado opuesto del paralelogramo (diagonales de apoyo).
    scene.polyline([{ x: ax, y: ay }, { x: ax + bx, y: ay + by }, { x: bx, y: by }], {
      color: 'textDim', dash: [3, 5], alpha: 0.6
    });

    // A y B desde el origen, arrastrables por la punta.
    scene.vector(0, 0, ax, ay, {
      color: 'mass',
      label: `A (${roundTo(ax, 1)}, ${roundTo(ay, 1)})`,
      width: 3
    });
    scene.vector(0, 0, bx, by, {
      color: 'mass2',
      label: `B (${roundTo(bx, 1)}, ${roundTo(by, 1)})`,
      labelSide: -1,
      width: 3
    });
    scene.pickable('A', { x: ax, y: ay, r: 0.4 });
    scene.pickable('B', { x: bx, y: by, r: 0.4 });

    // Resultante R = A + B.
    scene.vector(0, 0, rx, ry, {
      color: 'energy',
      label: `R = A + B (${roundTo(rx, 1)}, ${roundTo(ry, 1)})`,
      width: 3.5
    });
    scene.angleArc(0, 0, 0, Math.atan2(ry, rx), 0.9 * Math.min(Math.hypot(rx, ry), 1.6), {
      color: 'energy',
      label: `${roundTo(this.angle(rx, ry), 1)}°`
    });

    // Cota del alcance horizontal de la resultante.
    scene.dimension(0, -0.9, rx, -0.9, `R_x = ${roundTo(rx, 1)} u`, { color: 'textDim' });

    hud.chip('Arrastra las puntas de A y B', 'top-left');
    hud.readout(
      [
        { label: '|A|', value: roundTo(this.magnitude(ax, ay), 2), unit: 'u' },
        { label: '|B|', value: roundTo(this.magnitude(bx, by), 2), unit: 'u' },
        { label: '|R|', value: roundTo(this.magnitude(rx, ry), 2), unit: 'u' },
        { label: 'θ_R', value: roundTo(this.angle(rx, ry), 1), unit: '°' }
      ],
      'bottom-left'
    );
  }

  drawComponents(scene, hud) {
    const { mag, ang } = this.params;
    const rad = (ang * Math.PI) / 180;
    const vx = mag * Math.cos(rad);
    const vy = mag * Math.sin(rad);

    scene.vector(0, 0, vx, 0, { color: 'mass', label: `v_x = ${roundTo(vx, 2)} u`, labelSide: -1, width: 3 });
    scene.vector(vx, 0, 0, vy, { color: 'mass2', label: `v_y = ${roundTo(vy, 2)} u`, labelSide: -1, width: 3 });
    scene.vector(0, 0, vx, vy, { color: 'energy', label: `|v| = ${roundTo(mag, 2)} u`, width: 3.5 });
    scene.angleArc(0, 0, 0, rad, 1.4, { color: 'energy', label: `${ang}°`, fill: true });

    scene.dimension(0, -1.4, vx, -1.4, `v_x = |v|·cos ${ang}°`, { color: 'textDim' });

    hud.chip('Descomposición de un vector', 'top-left');
    hud.readout(
      [
        { label: 'v_x', value: roundTo(vx, 2), unit: 'u' },
        { label: 'v_y', value: roundTo(vy, 2), unit: 'u' },
        { label: '|v|', value: roundTo(mag, 2), unit: 'u' },
        { label: 'θ', value: ang, unit: '°' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    if (this.params.modo === 'suma') {
      const { ax, ay, bx, by } = this.params;
      const rx = ax + bx;
      const ry = ay + by;
      return {
        'A': { value: `(${roundTo(ax, 1)}, ${roundTo(ay, 1)})`, unit: 'u' },
        'B': { value: `(${roundTo(bx, 1)}, ${roundTo(by, 1)})`, unit: 'u' },
        'R': { value: `(${roundTo(rx, 1)}, ${roundTo(ry, 1)})`, unit: 'u' },
        '|R|': { value: roundTo(this.magnitude(rx, ry), 2), unit: 'u' },
        'θ_R': { value: roundTo(this.angle(rx, ry), 1), unit: '°' }
      };
    }
    const c = this.components();
    return {
      'v_x': { value: roundTo(c.x, 2), unit: 'u' },
      'v_y': { value: roundTo(c.y, 2), unit: 'u' },
      '|v|': { value: roundTo(this.params.mag, 2), unit: 'u' },
      'θ': { value: this.params.ang, unit: '°' }
    };
  }

  getState() {
    return { params: { ...this.params }, dragging: null };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    this.dragging = null;
  }

  destroy() {
    this.dragging = null;
  }
}
