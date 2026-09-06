/**
 * @fileoverview Leyes de Kepler + asistencia gravitacional (flyby).
 *
 * Complementa «Gravedad universal» (órbita libre) con foco en las tres leyes
 * —elipse con el Sol en un foco, áreas iguales en tiempos iguales y
 * T² ∝ a³— y en el sobrevuelo (slingshot) que cambia la rapidez de una sonda.
 *
 * Migrado al contrato `SimModule` + `draw(scene)`. Dos modos (`mode`,
 * el mismo id que usa el catálogo para el enlace profundo):
 *
 * - `kepler`: el planeta parte del perihelio con la velocidad de vis-viva;
 *   se dibuja la elipse ideal, los dos focos, perihelio/afelio, el sector
 *   barrido en los últimos 0,6 s (2.ª ley) y la gráfica |v|(t).
 * - `flyby`: sonda + planeta móvil + Sol débil. La gráfica |v|(t) muestra el
 *   salto de rapidez tras el sobrevuelo.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../core/geometry.js';

/** Radio orbital del planeta en el modo flyby (unidades de mundo). */
const PLANET_R = 8;
/** Ventana temporal del sector barrido (2.ª ley), s. */
const SWEEP_WINDOW = 0.6;
/** Puntos de la guía de la elipse. */
const ELLIPSE_N = 96;

export default class KeplerModule extends SimModule {
  /** Encuadre 34 × 22: cabe la elipse con a = 9, e = 0,85 (afelio a −16,65). */
  static viewport = { width: 34, height: 22 };

  /** El Sol está en el origen (foco de la elipse), §17.1. */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'mode',
      type: 'select',
      label: 'Modo',
      value: 'kepler',
      options: [
        { value: 'kepler', label: 'Leyes de Kepler (elipse)' },
        { value: 'flyby', label: 'Asistencia gravitacional' }
      ]
    },
    { id: 'a', label: 'Semieje mayor', latex: 'a', unit: 'm', min: 3, max: 9, step: 0.1, value: 5, showIf: { mode: 'kepler' } },
    { id: 'e', label: 'Excentricidad', latex: 'e', min: 0, max: 0.85, step: 0.01, value: 0.35, showIf: { mode: 'kepler' } },
    { id: 'GM', label: 'GM central (Sol)', latex: 'GM', unit: 'm³/s²', min: 15, max: 80, step: 1, value: 40 },
    { id: 'planetGM', label: 'GM del planeta', latex: 'GM_p', unit: 'm³/s²', min: 4, max: 30, step: 0.5, value: 12, showIf: { mode: 'flyby' } },
    { id: 'planetV', label: 'Velocidad del planeta', latex: 'v_p', unit: 'm/s', min: 0, max: 3, step: 0.1, value: 1.2, showIf: { mode: 'flyby' } },
    { id: 'v0', label: 'Velocidad de la sonda', latex: 'v_0', unit: 'm/s', min: 1, max: 6, step: 0.1, value: 3.2, showIf: { mode: 'flyby' } }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { mode: 'kepler', a: 5, e: 0.35, GM: 40, planetGM: 12, planetV: 1.2, v0: 3.2 };
    this.t = 0;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    /** Planeta del modo flyby. */
    this.planet = { x: PLANET_R, y: 0, vx: 0, vy: 1.2 };
    /** Rapidez inicial de la sonda (para Δ|v| tras el sobrevuelo). */
    this.v0Flyby = 3.2;
    /** Estela (anillo, sin `shift()`); cada punto lleva su instante. */
    this.trail = new TrailBuffer(500);
    this.planetTrail = new TrailBuffer(300);
    /** Historial |v|(t) para la gráfica del HUD. */
    this.history = new TrailBuffer(240);
    this._sampleAcc = 0;
    /** Periodo medido: ángulo acumulado desde el último paso por 2π. */
    this.thetaAcc = 0;
    this.lapStart = 0;
    this.lastTheta = 0;
    this.periodEst = null;
    /** Buffers reutilizados para la guía de la elipse y el sector barrido. */
    this._ellipse = new Array(2 * (ELLIPSE_N + 1)).fill(0);
    this._sweep = [];
  }

  init(meta = null) {
    this.reset();
    this.renderer?.resetCamera?.();
    this.setModuleInfo({
      title: meta?.title || 'Kepler y asistencia gravitacional',
      blurb: meta?.blurb || 'Elipses con T² ∝ a³ y sobrevuelo (slingshot) que cambia la velocidad.',
      story:
        'Kepler describió las órbitas planetarias a partir de las observaciones de Tycho Brahe; Newton las explicó con la gravitación. Las sondas actuales usan asistencia gravitacional: al pasar cerca de un planeta en movimiento roban (o ceden) parte de su energía respecto al Sol.',
      cases: [
        'Planetas: más semieje a → mayor periodo T (T² ∝ a³).',
        'Áreas iguales en tiempos iguales: más rápido en el perihelio (2.ª ley).',
        'Voyager / Juno: flyby para cambiar rumbo y ganar rapidez.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: '1.ª ley', formula: 'Órbitas elípticas; Sol en un foco' },
        { name: '2.ª ley', formula: 'dA/dt = const', note: 'Más rápido en perihelio.' },
        { name: '3.ª ley', formula: 'T² = (4π²/GM) a³' },
        { name: 'Vis-viva', formula: 'v² = GM (2/r − 1/a)' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    // Encuadre a la medida de la órbita: con el 34 × 22 fijo, una elipse de
    // a = 5 ocupaba un tercio del lienzo.
    if (this.params.mode === 'flyby') {
      this.frameWorld(26, 15);
    } else {
      const e = Math.min(0.9, Math.max(0, this.params.e));
      const a = this.params.a;
      const ra = a * (1 + e);
      const b = a * Math.sqrt(Math.max(0.02, 1 - e * e));
      this.frameWorld(2 * (ra + 1.8), 2 * (b + 2.2));
    }
    this.t = 0;
    this.trail.clear();
    this.planetTrail.clear();
    this.history.clear();
    this._sampleAcc = 0;
    this._sweep.length = 0;
    if (this.params.mode === 'flyby') this._resetFlyby();
    else this._resetKepler();
    this.engine?.reset?.();
  }

  /** Parte del perihelio con la velocidad de vis-viva. */
  _resetKepler() {
    const a = this.params.a;
    const e = Math.min(0.9, Math.max(0, this.params.e));
    const rp = a * (1 - e);
    this.x = rp;
    this.y = 0;
    this.vx = 0;
    this.vy = Math.sqrt((this.params.GM * (1 + e)) / Math.max(rp, 0.1));
    this.thetaAcc = 0;
    this.lapStart = 0;
    this.lastTheta = 0;
    this.periodEst = null;
  }

  _resetFlyby() {
    this.x = -10;
    this.y = 2.5;
    this.vx = this.params.v0;
    this.vy = 0;
    this.v0Flyby = this.params.v0;
    this.planet = { x: PLANET_R, y: 0, vx: 0, vy: this.params.planetV };
  }

  destroy() {
    this.trail.clear();
    this.planetTrail.clear();
    this.history.clear();
    this.renderer?.resetCamera?.();
  }

  /* ---------- física ---------- */

  r() {
    return Math.hypot(this.x, this.y) || 1e-6;
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** Periodo teórico (3.ª ley) para el semieje actual. */
  periodTheory(a = this.elements().a) {
    if (!(a > 0)) return null;
    return 2 * Math.PI * Math.sqrt((a * a * a) / this.params.GM);
  }

  /**
   * Elementos orbitales **del estado actual** (osculadores): semieje,
   * excentricidad y dirección del perihelio.
   *
   * Antes la elipse guía, el perihelio, el afelio y la cota 2a se dibujaban
   * con los deslizadores `a` y `e`, no con la órbita real: al arrastrar el
   * planeta el cuerpo se iba a otro sitio y la elipse de ejemplo (y los datos)
   * se quedaban atrás. Calculándolos aquí, el dibujo siempre describe lo que
   * el planeta está haciendo.
   *
   * @returns {{a:number, e:number, omega:number, rp:number, ra:number, ligada:boolean}}
   */
  elements() {
    const GM = this.params.GM;
    const r = this.r();
    const v2 = this.vx * this.vx + this.vy * this.vy;
    const inv = 2 / r - v2 / GM; // 1/a por vis-viva
    const a = Math.abs(inv) > 1e-9 ? 1 / inv : Infinity;
    // Vector excentricidad: e⃗ = ((v² − GM/r)·r⃗ − (r⃗·v⃗)·v⃗) / GM
    const rv = this.x * this.vx + this.y * this.vy;
    const k = v2 - GM / r;
    const ex = (k * this.x - rv * this.vx) / GM;
    const ey = (k * this.y - rv * this.vy) / GM;
    const e = Math.hypot(ex, ey);
    const omega = e > 1e-6 ? Math.atan2(ey, ex) : 0;
    const ligada = inv > 0 && e < 1;
    return { a, e, omega, rp: a * (1 - e), ra: a * (1 + e), ligada };
  }

  update(dt) {
    this.t += dt;
    if (this.params.mode === 'kepler') {
      const r = this.r();
      const aMag = this.params.GM / (r * r);
      this.vx += ((-aMag * this.x) / r) * dt;
      this.vy += ((-aMag * this.y) / r) * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      // Periodo medido: cuando el ángulo acumulado completa 2π.
      const th = Math.atan2(this.y, this.x);
      let dth = th - this.lastTheta;
      if (dth < -Math.PI) dth += Math.PI * 2;
      if (dth > Math.PI) dth -= Math.PI * 2;
      this.thetaAcc += dth;
      if (this.thetaAcc >= Math.PI * 2) {
        this.periodEst = this.t - this.lapStart;
        this.lapStart = this.t;
        this.thetaAcc -= Math.PI * 2;
      }
      this.lastTheta = th;
    } else {
      // Flyby: gravedad del planeta + Sol débil como contexto.
      const p = this.planet;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const dx = this.x - p.x;
      const dy = this.y - p.y;
      const rp = Math.hypot(dx, dy) || 1e-6;
      const ap = this.params.planetGM / (rp * rp);
      this.vx += ((-ap * dx) / rp) * dt;
      this.vy += ((-ap * dy) / rp) * dt;
      const rs = this.r();
      const asun = (this.params.GM * 0.15) / (rs * rs);
      this.vx += ((-asun * this.x) / rs) * dt;
      this.vy += ((-asun * this.y) / rs) * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.planetTrail.push({ x: p.x, y: p.y });
      if (this.x > 14 || this.x < -14 || Math.abs(this.y) > 12) {
        this.trail.clear();
        this.planetTrail.clear();
        this._resetFlyby();
      }
    }
    this.trail.push({ x: this.x, y: this.y, t: this.t });
    this._sampleAcc += dt;
    if (this._sampleAcc >= 0.05) {
      this._sampleAcc = 0;
      this.history.push({ x: this.t, y: this.speed() });
    }
    // Seguimiento parcial: el Sol nunca sale del encuadre.
    this.renderer?.follow?.(this.x * 0.2, this.y * 0.2);
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    if (this.params.mode === 'flyby') this._drawFlyby(scene);
    else this._drawKepler(scene);
  }

  _drawKepler(scene) {
    const { GM } = this.params;
    // La elipse guía sale de la órbita real (osculadora), no de los
    // deslizadores: al arrastrar el planeta, la guía lo acompaña.
    const el = this.elements();
    const cosW = Math.cos(el.omega);
    const sinW = Math.sin(el.omega);
    const a = el.a;
    const e = el.e;
    const b = a * Math.sqrt(Math.max(0, 1 - e * e));
    const c = a * e;
    // Rota (u, v) del marco de la elipse al mundo (perihelio hacia omega).
    const rot = (u, v, out) => {
      out.x = u * cosW - v * sinW;
      out.y = u * sinW + v * cosW;
      return out;
    };
    const _p = { x: 0, y: 0 };

    if (el.ligada) {
      const pts = this._ellipse;
      for (let i = 0; i <= ELLIPSE_N; i++) {
        const ang = (i / ELLIPSE_N) * Math.PI * 2;
        rot(-c + a * Math.cos(ang), b * Math.sin(ang), _p);
        pts[2 * i] = _p.x;
        pts[2 * i + 1] = _p.y;
      }
      scene.polyline(pts, { color: 'textDim', dash: [4, 4], width: 1, alpha: 0.7 });
      // Eje mayor acotado sobre la propia elipse (perihelio → afelio).
      rot(el.rp, -b - 0.7, _p);
      const dx1 = _p.x;
      const dy1 = _p.y;
      rot(-el.ra, -b - 0.7, _p);
      scene.dimension(dx1, dy1, _p.x, _p.y, `2a = ${roundTo(2 * a, 1)} m`, { color: 'textDim' });
    }

    // Sector barrido en los últimos SWEEP_WINDOW s (2.ª ley): Sol + estela reciente.
    const sweep = this._sweep;
    sweep.length = 0;
    sweep.push(0, 0);
    const tr = this.trail;
    const tMin = this.t - SWEEP_WINDOW;
    for (let i = 0; i < tr.length; i++) {
      const q = tr.get(i);
      if (q.t >= tMin) sweep.push(q.x, q.y);
    }
    if (sweep.length >= 6) {
      scene.path(sweep, { fill: 'energy', fillAlpha: 0.28, color: 'energy', width: 1, alpha: 0.9 });
    }

    // Estela completa.
    if (tr.length > 1) scene.trail(tr, { color: 'trail', width: 1.8, alpha: 0.6 });

    // Sol en el foco y segundo foco vacío (sobre el eje mayor girado).
    scene.body(0, 0, { shape: 'circle', r: 0.65, color: 'ray', label: `Sol (GM = ${GM})`, labelColor: 'ray' });
    if (el.ligada && c > 0.15) {
      rot(-2 * c, 0, _p);
      const fx = _p.x;
      const fy = _p.y;
      scene.line(fx - 0.25, fy, fx + 0.25, fy, { color: 'textDim', width: 1.5 });
      scene.line(fx, fy - 0.25, fx, fy + 0.25, { color: 'textDim', width: 1.5 });
      scene.label(fx, fy, 'F₂ (vacío)', { color: 'textDim', size: 11, offsetX: 8, offsetY: 16, align: 'left', baseline: 'top', avoid: true });
    }

    // Perihelio y afelio marcados sobre la órbita real.
    if (el.ligada) {
      rot(el.rp, 0, _p);
      const px = _p.x;
      const py = _p.y;
      scene.line(px - 0.3 * sinW, py + 0.3 * cosW, px + 0.3 * sinW, py - 0.3 * cosW, { color: 'textDim', width: 1.5 });
      scene.callout(px, py, `perihelio r = ${roundTo(el.rp, 2)}`, { angle: Math.PI / 5, distance: 28, color: 'textDim' });
      rot(-el.ra, 0, _p);
      const ax = _p.x;
      const ay = _p.y;
      scene.line(ax - 0.3 * sinW, ay + 0.3 * cosW, ax + 0.3 * sinW, ay - 0.3 * cosW, { color: 'textDim', width: 1.5 });
      scene.callout(ax, ay, `afelio r = ${roundTo(el.ra, 2)}`, { angle: Math.PI / 5, distance: 28, color: 'textDim' });
    }

    // Radio vector y planeta.
    scene.line(0, 0, this.x, this.y, { color: 'textDim', dash: [3, 4], width: 1, alpha: 0.8 });
    scene.body(this.x, this.y, { shape: 'circle', r: 0.28, color: 'mass', label: 'planeta (arrástralo)', labelColor: 'mass', id: 'planeta' });
    const v = this.speed();
    if (v > 0.01) {
      scene.vector(this.x, this.y, this.vx * 0.25, this.vy * 0.25, { color: 'velocity', label: `v = ${roundTo(v, 2)} m/s` });
    }
    const r = this.r();
    const fLen = Math.min(2, 0.3 + (GM / (r * r)) * 0.35);
    scene.vector(this.x, this.y, (-this.x / r) * fLen, (-this.y / r) * fLen, { color: 'force', label: 'F', labelSide: -1 });

    // HUD.
    const hud = scene.hud;
    hud.chip(el.ligada ? `Órbita actual · e = ${roundTo(e, 2)} · a = ${roundTo(a, 2)} m` : 'Trayectoria abierta (escape)', 'top-left');
    const E = 0.5 * v * v - GM / r;
    const T = this.periodTheory(a);
    hud.readout(
      [
        { label: 'r', value: r, unit: 'm' },
        { label: '|v|', value: v, unit: 'm/s' },
        { label: 'a (real)', value: el.ligada ? a : '∞', unit: el.ligada ? 'm' : '' },
        { label: 'e (real)', value: e, unit: '' },
        { label: 'T teoría', value: T != null ? T : '—', unit: T != null ? 's' : '' },
        { label: 'T medido', value: this.periodEst != null ? this.periodEst : '…', unit: this.periodEst != null ? 's' : '' },
        { label: 'E/m', value: E, unit: 'J/kg' }
      ],
      'bottom-left'
    );
    hud.legend(
      [
        { color: 'trail', label: 'Órbita real' },
        { color: 'textDim', label: 'Elipse de la órbita actual', dash: [4, 4] },
        { color: 'energy', label: `Área barrida en ${SWEEP_WINDOW} s` },
        { color: 'velocity', label: 'Velocidad v' },
        { color: 'force', label: 'Fuerza F' }
      ],
      'top-right'
    );
    this._drawSpeedPlot(scene, 'Rapidez |v|(t): máxima en el perihelio');
  }

  _drawFlyby(scene) {
    const p = this.planet;
    const v = this.speed();

    // Sol débil en el origen (contexto).
    scene.body(0, 0, { shape: 'circle', r: 0.5, color: 'ray', label: 'Sol (débil)', labelColor: 'ray' });

    // Planeta con su trayectoria y su velocidad.
    if (this.planetTrail.length > 1) scene.trail(this.planetTrail, { color: 'mass2', width: 1.2, dash: [3, 3], alpha: 0.5 });
    scene.body(p.x, p.y, { shape: 'circle', r: 0.55, color: 'mass2', label: `planeta (GM = ${this.params.planetGM})`, labelColor: 'mass2' });
    if (Math.hypot(p.vx, p.vy) > 0.01) {
      scene.vector(p.x, p.y, p.vx * 0.6, p.vy * 0.6, { color: 'velocity', label: `v_p = ${roundTo(Math.hypot(p.vx, p.vy), 2)}`, labelSide: -1 });
    }

    // Sonda, estela y vectores.
    if (this.trail.length > 1) scene.trail(this.trail, { color: 'trail', width: 1.8, alpha: 0.6 });
    scene.body(this.x, this.y, { shape: 'triangle', r: 0.3, color: 'mass', rotation: Math.atan2(this.vy, this.vx), label: 'sonda', labelColor: 'mass', id: 'sonda' });
    if (v > 0.01) {
      scene.vector(this.x, this.y, this.vx * 0.25, this.vy * 0.25, { color: 'velocity', label: `v = ${roundTo(v, 2)} m/s` });
    }
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const fLen = Math.min(2, (this.params.planetGM / (d * d)) * 0.8);
    if (fLen > 0.08) {
      scene.vector(this.x, this.y, (dx / d) * fLen, (dy / d) * fLen, { color: 'force', label: 'F', labelSide: -1 });
    }

    // HUD.
    const hud = scene.hud;
    const dv = v - this.v0Flyby;
    hud.chip('Asistencia gravitacional (flyby / slingshot)', 'top-left');
    hud.chip(dv > 0.05 ? `La sonda ganó ${roundTo(dv, 2)} m/s` : dv < -0.05 ? `La sonda perdió ${roundTo(-dv, 2)} m/s` : 'Antes del sobrevuelo', 'top-left');
    hud.readout(
      [
        { label: '|v| sonda', value: v, unit: 'm/s' },
        { label: '|v| inicial', value: this.v0Flyby, unit: 'm/s' },
        { label: 'Δ|v|', value: dv, unit: 'm/s' },
        { label: 'd al planeta', value: d, unit: 'm' }
      ],
      'bottom-left'
    );
    hud.legend(
      [
        { color: 'trail', label: 'Trayectoria de la sonda' },
        { color: 'mass2', label: 'Órbita del planeta', dash: [3, 3] },
        { color: 'velocity', label: 'Velocidad' },
        { color: 'force', label: 'Atracción del planeta' }
      ],
      'top-right'
    );
    this._drawSpeedPlot(scene, 'Rapidez de la sonda |v|(t)');
  }

  _drawSpeedPlot(scene, title) {
    const vp = scene.viewport();
    if (vp.w <= 420) return;
    const v = this.speed();
    const points = this.history.length > 1 ? this.history : [{ x: 0, y: v }, { x: 1, y: v }];
    scene.hud.plot(
      { x: vp.x + vp.w - 215, y: vp.y + vp.h - 128, w: 200, h: 116 },
      { title, series: [{ points, color: 'velocity', label: '|v|' }], yRange: [0, Math.max(v, this.v0Flyby, 1) * 1.5] }
    );
  }

  /* ---------- manipulación directa ---------- */

  /**
   * Arrastrar el planeta **redefine la órbita**: el punto soltado pasa a ser
   * el nuevo perihelio, con la rapidez de vis-viva que le corresponde. El
   * semieje resultante vuelve al deslizador `a` (y al panel) para que la
   * elipse guía, las cotas y los datos describan todos la misma órbita.
   */
  onDrag(id, world) {
    if (id !== 'planeta' && id !== 'sonda') return;
    const rr = Math.hypot(world.x, world.y);
    if (rr < 1) return;
    if (id === 'sonda') {
      this.x = world.x;
      this.y = world.y;
      this.trail.clear();
      this.history.clear();
      return;
    }
    const e = Math.min(0.9, Math.max(0, this.params.e));
    // El perihelio arrastrable se limita al rango del deslizador de semieje.
    const rp = Math.min(9 * (1 - e), Math.max(3 * (1 - e), rr));
    const ux = world.x / rr;
    const uy = world.y / rr;
    this.x = ux * rp;
    this.y = uy * rp;
    const v = Math.sqrt((this.params.GM * (1 + e)) / Math.max(rp, 0.1));
    // Velocidad perpendicular al radio, sentido antihorario.
    this.vx = -uy * v;
    this.vy = ux * v;
    this.params.a = Math.round((rp / (1 - e)) * 10) / 10;
    this.syncParams();
    this.thetaAcc = 0;
    this.lapStart = this.t;
    this.lastTheta = Math.atan2(this.y, this.x);
    this.periodEst = null;
    this.trail.clear();
    this.history.clear();
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const r = this.r();
    const v = this.speed();
    if (this.params.mode === 'kepler') {
      const E = 0.5 * v * v - this.params.GM / r;
      const el = this.elements();
      const T = this.periodTheory(el.a);
      return {
        a: { value: el.ligada ? roundTo(el.a, 3) : 0, unit: 'm' },
        e: { value: roundTo(el.e, 3), unit: '' },
        r: { value: roundTo(r, 3), unit: 'm' },
        'r perihelio': { value: el.ligada ? roundTo(el.rp, 3) : 0, unit: 'm' },
        'r afelio': { value: el.ligada ? roundTo(el.ra, 3) : 0, unit: 'm' },
        '|v|': { value: roundTo(v, 3), unit: 'm/s' },
        'T teoría': { value: T != null ? roundTo(T, 2) : 0, unit: 's' },
        'T medido': { value: this.periodEst != null ? roundTo(this.periodEst, 2) : 0, unit: 's' },
        'E/m': { value: roundTo(E, 3), unit: 'J/kg' }
      };
    }
    const p = this.planet;
    return {
      '|v| sonda': { value: roundTo(v, 3), unit: 'm/s' },
      '|v| inicial': { value: roundTo(this.v0Flyby, 3), unit: 'm/s' },
      'Δ|v|': { value: roundTo(v - this.v0Flyby, 3), unit: 'm/s' },
      'GM planeta': { value: this.params.planetGM, unit: 'm³/s²' },
      'd al planeta': { value: roundTo(Math.hypot(p.x - this.x, p.y - this.y), 3), unit: 'm' }
    };
  }

  getState() {
    return {
      t: this.t,
      params: { ...this.params },
      pos: { x: this.x, y: this.y },
      vel: { x: this.vx, y: this.vy },
      planet: { ...this.planet },
      v0Flyby: this.v0Flyby,
      thetaAcc: this.thetaAcc,
      lapStart: this.lapStart,
      lastTheta: this.lastTheta,
      periodEst: this.periodEst
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (s.pos) {
      this.x = s.pos.x;
      this.y = s.pos.y;
    }
    if (s.vel) {
      this.vx = s.vel.x;
      this.vy = s.vel.y;
    }
    if (s.planet) this.planet = { ...s.planet };
    if (Number.isFinite(s.v0Flyby)) this.v0Flyby = s.v0Flyby;
    if (Number.isFinite(s.thetaAcc)) this.thetaAcc = s.thetaAcc;
    if (Number.isFinite(s.lapStart)) this.lapStart = s.lapStart;
    if (Number.isFinite(s.lastTheta)) this.lastTheta = s.lastTheta;
    this.periodEst = Number.isFinite(s.periodEst) ? s.periodEst : null;
    this.trail.clear();
    this.planetTrail.clear();
    this.history.clear();
  }
}
