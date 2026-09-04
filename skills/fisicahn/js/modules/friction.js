/**
 * @fileoverview Fricción — un muñeco empuja una caja: estática (no se mueve)
 * frente a cinética (desliza). f_s ≤ μ_s N · f_k = μ_k N · arranque cuando F > f_s,max
 *
 * Migrado al contrato `SimModule` con `draw(scene)`. La gráfica del HUD es la
 * curva de libro f(F): crece con el empuje hasta f_s,max y cae a f_k al
 * arrancar, con un marcador del estado actual sobre ella.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../core/geometry.js';

const G = 9.81;
const BOX_W = 1.4;
const BOX_H = 1.1;
const GROUND_Y = -0.55;
const TRACK_HALF = 9;
/** Posición inicial del borde izquierdo de la caja. */
const X0 = -1.2;
/** Escala de dibujo de los vectores de fuerza (unidades de mundo por N). */
const K_FORCE = 0.1;
/** Tope del eje F en la gráfica f(F) (coincide con el máximo del slider). */
const F_MAX = 80;

export default class FrictionModule extends SimModule {
  static viewport = { width: 20, height: 12 };
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'm', label: 'Masa de la caja', latex: 'm', unit: 'kg', min: 1, max: 20, step: 0.5, value: 5 },
    { id: 'F', label: 'Empuje', latex: 'F', unit: 'N', min: 0, max: F_MAX, step: 0.5, value: 15 },
    { id: 'mu_s', label: 'Coef. estático', latex: '\\mu_s', min: 0.05, max: 1.2, step: 0.01, value: 0.45 },
    { id: 'mu_k', label: 'Coef. cinético', latex: '\\mu_k', min: 0, max: 1, step: 0.01, value: 0.3 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { m: 5, F: 15, mu_s: 0.45, mu_k: 0.3 };
    this.t = 0;
    /** Borde izquierdo de la caja (m). */
    this.boxX = X0;
    this.v = 0;
    /** 'static' | 'kinetic' */
    this.mode = 'static';
    /** Fase de animación de piernas al caminar (0…1). */
    this.walkPhase = 0;
    /** Inclinación del torso al empujar (rad). */
    this.lean = 0.2;
    this.dragging = null;
  }

  init(meta = null) {
    this.reset();
    this.renderer?.resetCamera?.();

    this.setModuleInfo({
      title: meta?.title || 'Fricción',
      blurb:
        meta?.blurb ||
        'Un muñeco empuja una caja: fricción estática (reposo) y cinética (deslizamiento).',
      story:
        'Mientras la caja no se mueve, la fricción estática se ajusta para equilibrar el empuje (hasta μ_s N). ' +
        'Si empujas más fuerte que ese máximo, la caja arranca y actúa la fricción cinética f_k = μ_k N, ' +
        'casi siempre menor que el máximo estático. Por eso cuesta más arrancar un mueble que deslizarlo.',
      cases: [
        'Empujar un armario o un cajón pesado en el suelo.',
        'Frenar un coche: bloqueo de ruedas → fricción cinética (menor control).',
        'Caminar: la fricción estática del zapato te impulsa hacia adelante.'
      ]
    });

    this.setModuleFormulas({
      items: [
        { name: 'Normal', formula: 'N = m g', note: 'Superficie horizontal.' },
        {
          name: 'Estática (máx.)',
          formula: 'f_{s,\\max} = \\mu_s N',
          note: 'En reposo: f_s ≤ f_{s,max} y se opone al empuje.'
        },
        {
          name: 'Cinética',
          formula: 'f_k = \\mu_k N',
          note: 'Al deslizar; suele ser μ_k < μ_s.'
        },
        {
          name: 'Segunda ley (deslizando)',
          formula: 'F - f_k = m a'
        }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.boxX = X0;
    this.v = 0;
    this.mode = 'static';
    this.walkPhase = 0;
    this.lean = 0.2;
    this.engine?.reset?.();
  }

  destroy() {}

  setTool() {}

  N() {
    return this.params.m * G;
  }

  fsMax() {
    return this.params.mu_s * this.N();
  }

  fk() {
    return this.params.mu_k * this.N();
  }

  /** Fricción que actúa ahora: en reposo iguala al empuje (hasta f_s,max). */
  frictionForce() {
    if (this.mode === 'static') return Math.min(this.params.F, this.fsMax());
    return this.fk();
  }

  accel() {
    return this.mode === 'kinetic' ? (this.params.F - this.fk()) / this.params.m : 0;
  }

  update(dt) {
    if (this.dragging) return;
    this.t += dt;
    const F = this.params.F;
    const fMax = this.fsMax();
    const fKin = this.fk();

    if (this.mode === 'static') {
      if (F > fMax + 1e-6) {
        // Arranca: pasa a fricción cinética.
        this.mode = 'kinetic';
        this.v = 0.01;
      } else {
        this.v = 0;
        // El muñeco se inclina más cuanto más cerca está del umbral.
        this.lean = 0.12 + 0.35 * Math.min(1, F / Math.max(fMax, 0.5));
      }
    }

    if (this.mode === 'kinetic') {
      const a = (F - fKin) / this.params.m;
      this.v += a * dt;
      if (this.v < 0) {
        this.v = 0;
        // Si F ≤ f_s,max puede volver a estático al parar.
        if (F <= fMax) this.mode = 'static';
      }
      this.boxX += this.v * dt;
      this.walkPhase = (this.walkPhase + Math.min(Math.abs(this.v), 4) * dt * 1.2) % 1;
      this.lean = 0.18 + 0.12 * Math.min(1, F / 30);

      // Bucle de pista: reaparece a la izquierda.
      if (this.boxX > 7) this.boxX = -6;
    }
  }

  /* ---------- interacción directa (§2.6) ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    this.boxX = Math.max(-TRACK_HALF + 1.5, Math.min(TRACK_HALF - BOX_W, world.x - BOX_W / 2));
    this.v = 0;
    if (this.params.F <= this.fsMax()) this.mode = 'static';
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  _drawGround(scene) {
    scene.line(-TRACK_HALF, GROUND_Y, TRACK_HALF, GROUND_Y, { color: 'textDim', width: 3 });
    scene.hatch(-TRACK_HALF, GROUND_Y, TRACK_HALF, GROUND_Y, { color: 'textDim', side: 1, spacing: 14, length: 9 });
  }

  _drawBox(scene) {
    const cx = this.boxX + BOX_W / 2;
    const cy = GROUND_Y + BOX_H / 2;
    scene.body(cx, cy, { shape: 'rect', r: BOX_H / 2, w: BOX_W, h: BOX_H, color: 'mass2', id: 'caja' });
    // Listones de la caja de madera: textura, no sólo color.
    for (let i = 1; i <= 2; i++) {
      const yy = GROUND_Y + (BOX_H * i) / 3;
      scene.line(this.boxX + 0.1, yy, this.boxX + BOX_W - 0.1, yy, { color: 'text', width: 1, alpha: 0.35 });
    }
    scene.label(cx, cy, `${this.params.m} kg`, { baseline: 'middle', weight: 'bold', size: 12 });
    return { cx, cy };
  }

  /** Muñeco tipo stick figure que empuja la caja desde la izquierda. */
  _drawPerson(scene) {
    const handX = this.boxX - 0.05;
    const standX = handX - 0.55;
    const footY = GROUND_Y;
    const lean = this.lean;

    const headX = standX;
    const headY = footY + 1.55;
    const hipX = standX + lean * 0.15;
    const hipY = footY + 0.75;
    const shX = standX + lean * 0.35;
    const shY = footY + 1.25;
    const handY = footY + BOX_H * 0.55;

    // Animación de piernas: zancada larga al deslizar, corta al empujar en vano.
    const stride = this.mode === 'kinetic' && this.v > 0.05 ? 0.22 : 0.06;
    const ph = this.walkPhase * Math.PI * 2;
    const legSwing = Math.sin(ph) * stride;
    const legSwing2 = Math.sin(ph + Math.PI) * stride;

    const bodyStyle = { color: 'field', width: 3.2 };
    // Piernas
    scene.polyline([hipX, hipY, standX + legSwing, footY + 0.38, standX + legSwing * 1.4, footY], bodyStyle);
    scene.polyline([hipX, hipY, standX + legSwing2, footY + 0.38, standX + legSwing2 * 1.4, footY], bodyStyle);
    // Torso
    scene.line(hipX, hipY, shX, shY, bodyStyle);
    // Brazo que empuja (hombro → codo → mano en la caja), en otro color.
    const elbowX = (standX + handX) / 2 + lean * 0.1;
    const elbowY = footY + BOX_H * 0.72;
    scene.polyline([shX, shY, elbowX, elbowY, handX, handY], { color: 'mass2', width: 3.5 });
    // Otro brazo (atrás, balanceo)
    scene.line(shX, shY, standX - 0.25 - legSwing * 0.5, footY + 0.95, { color: 'field', width: 2.8 });
    // Cabeza
    scene.circle(headX, headY, 0.22, { color: 'text', fill: 'ray', width: 1.5, alpha: 0.9 });

    // Esfuerzo: gota de sudor si empuja fuerte sin conseguir moverla.
    if (this.mode === 'static' && this.params.F > this.fsMax() * 0.7) {
      scene.ellipse(headX + 0.32, headY + 0.05, 0.06, 0.1, { color: 'field', fill: 'field', fillAlpha: 0.7, width: 1 });
    }
  }

  _drawForces(scene, box) {
    const { cx } = box;
    const cy = GROUND_Y + BOX_H * 0.55;
    const F = this.params.F;

    // Empuje F: desde la mano hacia la caja.
    if (F > 0.05) {
      scene.vector(this.boxX - 0.05, cy, F * K_FORCE, 0, {
        color: 'force',
        width: 2.5,
        label: `F = ${roundTo(F, 1)} N`,
        labelSide: 1
      });
    }

    // Fricción: se opone al empuje. A trazos en estático, sólida en cinético.
    const f = this.frictionForce();
    if (f > 0.05) {
      const isStatic = this.mode === 'static';
      scene.vector(cx, GROUND_Y + 0.12, -f * K_FORCE, 0, {
        color: 'accel',
        width: 2.5,
        dash: isStatic ? [4, 3] : [],
        label: isStatic ? `f_s ≈ ${roundTo(f, 1)} N` : `f_k = ${roundTo(f, 1)} N`,
        labelSide: -1
      });
    }

    // Normal y peso: verticales cortos, con etiqueta.
    const nLen = Math.min(this.N() * 0.02, 0.9);
    scene.vector(cx, GROUND_Y + BOX_H, 0, nLen, { color: 'field', width: 2, label: 'N', labelSide: 1 });
    scene.vector(cx, GROUND_Y + BOX_H * 0.35, 0, -nLen, { color: 'ray', width: 2, label: 'mg', labelSide: -1 });

    // Velocidad: sale por la derecha de la caja cuando desliza.
    if (this.v > 0.05) {
      scene.vector(this.boxX + BOX_W + 0.1, cy, this.v * 0.35, 0, {
        color: 'velocity',
        width: 2.5,
        dash: [6, 3],
        label: `v = ${roundTo(this.v, 2)} m/s`,
        labelSide: 1
      });
    }
  }

  draw(scene) {
    this._drawGround(scene);
    const box = this._drawBox(scene);
    this._drawPerson(scene);
    this._drawForces(scene, box);

    const fMax = this.fsMax();
    const fKin = this.fk();
    const F = this.params.F;
    const isStatic = this.mode === 'static';

    const hud = scene.hud;
    hud.chip(isStatic ? 'REPOSO — fricción estática' : 'DESLIZA — fricción cinética', 'top-left', {
      color: isStatic ? 'accel' : 'force'
    });
    hud.chip(`F ${F > fMax ? '>' : '≤'} f_s,max (${roundTo(fMax, 1)} N) → ${F > fMax ? 'arranca' : 'no arranca'}`, 'top-left');
    hud.readout(
      [
        { label: 'N', value: this.N(), unit: 'N' },
        { label: 'f_s,max', value: fMax, unit: 'N' },
        { label: 'f_k', value: fKin, unit: 'N' },
        { label: 'f', value: this.frictionForce(), unit: 'N' },
        { label: 'v', value: this.v, unit: 'm/s' },
        { label: 'a', value: this.accel(), unit: 'm/s²' }
      ],
      'bottom-left'
    );

    // Gráfica de libro f(F): sube hasta f_s,max y cae a f_k al arrancar.
    const vp = scene.viewport();
    if (vp.w > 420) {
      hud.legend(
        [
          { color: 'accel', label: 'f frente al empuje F' },
          { color: 'force', label: 'estado actual', dash: [2, 2] }
        ],
        'top-right'
      );
      hud.plot(
        { x: vp.x + vp.w - 210, y: vp.y + vp.h - 128, w: 195, h: 116 },
        {
          title: 'Fricción f (N) frente a F (N)',
          series: [
            {
              points: [0, 0, fMax, fMax, fMax, fKin, F_MAX, fKin],
              color: 'accel'
            },
            { points: [{ x: F, y: this.frictionForce() }], color: 'force', pointSize: 4 }
          ],
          xRange: [0, F_MAX],
          yRange: [0, Math.max(fMax * 1.2, 5)]
        }
      );
    }
  }

  /* ---------- datos numéricos (§1.1) ---------- */

  readout() {
    const fMax = this.fsMax();
    const status =
      this.mode === 'static'
        ? this.params.F > fMax
          ? 'arrancando…'
          : 'en reposo (estática)'
        : 'deslizando (cinética)';
    return {
      estado: { value: status, unit: '' },
      N: { value: roundTo(this.N(), 2), unit: 'N' },
      'f_s,max': { value: roundTo(fMax, 2), unit: 'N' },
      'f_k': { value: roundTo(this.fk(), 2), unit: 'N' },
      'f actual': { value: roundTo(this.frictionForce(), 2), unit: 'N' },
      'F empuje': { value: roundTo(this.params.F, 1), unit: 'N' },
      v: { value: roundTo(this.v, 3), unit: 'm/s' },
      a: { value: roundTo(this.accel(), 3), unit: 'm/s²' },
      'μ_s': { value: this.params.mu_s, unit: '' },
      'μ_k': { value: this.params.mu_k, unit: '' }
    };
  }

  getState() {
    return {
      t: this.t,
      boxX: this.boxX,
      v: this.v,
      mode: this.mode,
      walkPhase: this.walkPhase,
      lean: this.lean,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.boxX)) this.boxX = s.boxX;
    if (Number.isFinite(s.v)) this.v = s.v;
    if (s.mode === 'static' || s.mode === 'kinetic') this.mode = s.mode;
    if (Number.isFinite(s.walkPhase)) this.walkPhase = s.walkPhase;
    if (Number.isFinite(s.lean)) this.lean = s.lean;
    if (Number.isFinite(s.t)) this.t = s.t;
  }
}
