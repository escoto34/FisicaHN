/**
 * @fileoverview Colisiones multi-cuerpo en 2D (discos elásticos / inelásticos).
 * Complementa `momentum` (1D, dos cuerpos).
 *
 * Migrado al contrato `SimModule` con `draw(scene)`: los discos son cuerpos
 * arrastrables, y el HUD muestra Ec(t) y |p|(t) para que se vea de un vistazo
 * que p se conserva siempre y Ec sólo cuando e = 1.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../core/geometry.js';

/** Semilado del recinto (unidades de mundo). */
const LIM = 6.5;
/** Tokens de color de los discos, cíclicos. La etiqueta mᵢ acompaña al color. */
const COLORS = ['field', 'mass2', 'velocity', 'accel', 'force', 'mass'];
/** Escala de dibujo de las velocidades. */
const K_VEL = 0.2;

export default class Collisions2DModule extends SimModule {
  static viewport = { width: 20, height: 19 };
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'n', label: 'Número de cuerpos', latex: 'N', min: 2, max: 8, step: 1, value: 4 },
    { id: 'e', label: 'Coef. de restitución', latex: 'e', min: 0, max: 1, step: 0.05, value: 1 },
    { id: 'speed', label: 'Rapidez típica', latex: 'v', unit: 'm/s', min: 0.5, max: 5, step: 0.1, value: 2.5 },
    { id: 'size', label: 'Tamaño de los discos', latex: 'r', unit: 'm', min: 0.2, max: 0.8, step: 0.05, value: 0.45 },
    { id: 'respawn', type: 'button', label: 'Reiniciar posiciones' }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { n: 4, e: 1, speed: 2.5, size: 0.45 };
    this.t = 0;
    /** @type {Array<{id:number,m:number,r:number,x:number,y:number,vx:number,vy:number,color:string}>} */
    this.bodies = [];
    /** Historiales Ec(t) y |p|(t) para la gráfica del HUD. */
    this.histEc = new TrailBuffer(240);
    this.histP = new TrailBuffer(240);
    this.dragging = null;
  }

  init(meta = null) {
    this.reset();
    this.renderer?.resetCamera?.();
    this.setModuleInfo({
      title: meta?.title || 'Colisiones multi-cuerpo (2D)',
      blurb:
        meta?.blurb ||
        'Varios discos en el plano: conservación de p y choques con coeficiente e.',
      story:
        'En 2D el momento se conserva por componentes. Con e = 1 el choque es elástico; e = 0 es perfectamente inelástico a lo largo de la normal.',
      cases: [
        'Billar y bolas de gas ideal (modelo de discos duros).',
        'Choque oblicuo: solo cambia la componente normal.',
        'Sistema de N cuerpos sin fuerzas externas: p total constante.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Momento 2D', formula: 'p⃗ = m v⃗ · Σp⃗ = const' },
        { name: 'Coeficiente de restitución', formula: 'e = −(v<sub>rel,n</sub>′) / v<sub>rel,n</sub>' },
        { name: 'Impulso normal', formula: 'J n̂ separa las velocidades a lo largo de la línea de centros' }
      ]
    });
    this.clearChallenges();
  }

  /** Coloca los discos en anillo con velocidades cruzadas. */
  _spawn() {
    this.bodies.length = 0;
    const n = Math.max(2, Math.min(8, Math.round(this.params.n)));
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + 0.3;
      const rad = 2.5 + (i % 2) * 0.8;
      const m = 1 + (i % 3) * 0.5;
      const vx = this.params.speed * Math.cos(ang + 1.2);
      const vy = this.params.speed * Math.sin(ang + 1.2);
      this.bodies.push({
        id: i,
        m,
        r: this.params.size * (0.85 + m * 0.15),
        x: rad * Math.cos(ang),
        y: rad * Math.sin(ang),
        vx: vx * (0.6 + 0.2 * (i % 3)),
        vy: vy * (0.6 + 0.2 * ((i + 1) % 3)),
        color: COLORS[i % COLORS.length]
      });
    }
  }

  reset() {
    this.t = 0;
    this._spawn();
    this.histEc.clear();
    this.histP.clear();
    this.engine?.reset?.();
  }

  destroy() {
    this.bodies.length = 0;
    this.histEc.clear();
    this.histP.clear();
  }

  setTool() {}

  _resolvePair(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-9;
    const minD = a.r + b.r;
    if (dist >= minD) return;
    const nx = dx / dist;
    const ny = dy / dist;
    // Separación proporcional a la masa inversa (sin asignaciones, §3.2).
    const overlap = minD - dist;
    const inv = 1 / a.m + 1 / b.m;
    const ka = (overlap * (1 / a.m)) / inv;
    const kb = (overlap * (1 / b.m)) / inv;
    a.x -= nx * ka;
    a.y -= ny * ka;
    b.x += nx * kb;
    b.y += ny * kb;

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const velN = rvx * nx + rvy * ny;
    if (velN > 0) return; // ya se separan
    const j = (-(1 + this.params.e) * velN) / inv;
    const jx = j * nx;
    const jy = j * ny;
    a.vx -= jx / a.m;
    a.vy -= jy / a.m;
    b.vx += jx / b.m;
    b.vy += jy / b.m;
  }

  update(dt) {
    if (this.dragging != null) return;
    this.t += dt;
    const e = this.params.e;
    const bodies = this.bodies;
    const sub = 2;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        b.x += b.vx * h;
        b.y += b.vy * h;
        // Paredes: rebote con el mismo coeficiente e.
        if (b.x < -LIM + b.r) {
          b.x = -LIM + b.r;
          b.vx = Math.abs(b.vx) * e;
        }
        if (b.x > LIM - b.r) {
          b.x = LIM - b.r;
          b.vx = -Math.abs(b.vx) * e;
        }
        if (b.y < -LIM + b.r) {
          b.y = -LIM + b.r;
          b.vy = Math.abs(b.vy) * e;
        }
        if (b.y > LIM - b.r) {
          b.y = LIM - b.r;
          b.vy = -Math.abs(b.vy) * e;
        }
      }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) this._resolvePair(bodies[i], bodies[j]);
      }
    }
    const tot = this.totals();
    this.histEc.push({ x: this.t, y: tot.Ec });
    this.histP.push({ x: this.t, y: Math.hypot(tot.px, tot.py) });
  }

  totals() {
    let px = 0;
    let py = 0;
    let Ec = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      px += b.m * b.vx;
      py += b.m * b.vy;
      Ec += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
    }
    return { px, py, Ec };
  }

  /* ---------- interacción directa (§2.6) ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    const b = this.bodies[Number(String(id).replace('m', ''))];
    if (!b) return;
    b.x = Math.max(-LIM + b.r, Math.min(LIM - b.r, world.x));
    b.y = Math.max(-LIM + b.r, Math.min(LIM - b.r, world.y));
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    // Recinto
    scene.rect(0, 0, LIM * 2, LIM * 2, { color: 'textDim', width: 2, alpha: 0.7 });

    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      scene.body(b.x, b.y, {
        shape: 'circle',
        r: b.r,
        color: b.color,
        id: `m${b.id}`,
        label: `m${b.id + 1} = ${b.m} kg`,
        labelColor: b.color
      });
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0.05) {
        scene.vector(b.x, b.y, b.vx * K_VEL, b.vy * K_VEL, { color: 'velocity', width: 2, dash: [6, 3] });
      }
    }

    const tot = this.totals();
    const pMag = Math.hypot(tot.px, tot.py);
    // Momento total: flecha desde el centro del recinto (siempre constante).
    if (pMag > 0.05) {
      scene.vector(0, 0, (tot.px / pMag) * Math.min(pMag * 0.2, 2.5), (tot.py / pMag) * Math.min(pMag * 0.2, 2.5), {
        color: 'text',
        width: 1.5,
        alpha: 0.5,
        label: 'Σp',
        labelSide: 1
      });
    }

    const hud = scene.hud;
    hud.chip(
      `N = ${this.bodies.length} · e = ${this.params.e} → ${this.params.e >= 1 ? 'elástico: Ec se conserva' : 'inelástico: Ec disminuye'}`,
      'top-left'
    );
    hud.readout(
      [
        { label: 'p_x', value: tot.px, unit: 'kg·m/s' },
        { label: 'p_y', value: tot.py, unit: 'kg·m/s' },
        { label: '|p|', value: pMag, unit: 'kg·m/s' },
        { label: 'Ec', value: tot.Ec, unit: 'J' }
      ],
      'bottom-left'
    );

    const vp = scene.viewport();
    if (vp.w > 420) {
      hud.legend(
        [
          { color: 'energy', label: 'Ec total' },
          { color: 'text', label: '|p| total', dash: [6, 3] }
        ],
        'top-right'
      );
      const ecPts = this.histEc.length > 1 ? this.histEc : [{ x: 0, y: tot.Ec }, { x: 1, y: tot.Ec }];
      const pPts = this.histP.length > 1 ? this.histP : [{ x: 0, y: pMag }, { x: 1, y: pMag }];
      hud.plot(
        { x: vp.x + vp.w - 210, y: vp.y + vp.h - 128, w: 195, h: 116 },
        {
          title: 'Ec (J) y |p| (kg·m/s) frente a t (s)',
          series: [
            { points: ecPts, color: 'energy' },
            { points: pPts, color: 'text', dash: [6, 3] }
          ],
          yRange: [0, Math.max(this._maxEc(), pMag, 1) * 1.15]
        }
      );
    }
  }

  /** Ec máxima registrada: fija el eje para que la caída inelástica se vea. */
  _maxEc() {
    let max = 0;
    this.histEc.forEach((p) => {
      if (p.y > max) max = p.y;
    });
    return max;
  }

  /* ---------- datos numéricos (§1.1) ---------- */

  readout() {
    const { px, py, Ec } = this.totals();
    return {
      N: { value: this.bodies.length, unit: '' },
      e: { value: this.params.e, unit: '' },
      'p_x': { value: roundTo(px, 3), unit: 'kg·m/s' },
      'p_y': { value: roundTo(py, 3), unit: 'kg·m/s' },
      '|p|': { value: roundTo(Math.hypot(px, py), 3), unit: 'kg·m/s' },
      'Ec total': { value: roundTo(Ec, 3), unit: 'J' },
      t: { value: roundTo(this.t, 2), unit: 's' }
    };
  }

  getState() {
    return {
      t: this.t,
      params: { ...this.params },
      bodies: this.bodies.map((b) => ({
        id: b.id,
        m: b.m,
        r: b.r,
        color: b.color,
        pos: { x: b.x, y: b.y },
        vel: { x: b.vx, y: b.vy }
      }))
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Array.isArray(s.bodies)) {
      this.bodies = s.bodies.map((b, i) => ({
        id: Number.isFinite(b.id) ? b.id : i,
        m: b.m,
        r: b.r,
        color: COLORS.includes(b.color) ? b.color : COLORS[i % COLORS.length],
        x: b.pos?.x ?? 0,
        y: b.pos?.y ?? 0,
        vx: b.vel?.x ?? 0,
        vy: b.vel?.y ?? 0
      }));
    }
    this.histEc.clear();
    this.histP.clear();
  }
}
