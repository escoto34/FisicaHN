/**
 * @fileoverview Campos magnéticos — carga con velocidad en B uniforme
 * (F = q·v × B). B perpendicular a la página (⊙ sale / ⊗ entra); movimiento
 * en el plano xy.
 *
 * Importante (pedagogía): la órbita es circular, pero el centro NO es una
 * masa. A diferencia de gravedad/Kepler, no hay cuerpo en el centro: el
 * «centro» es sólo el centro geométrico de la trayectoria (fuerza siempre
 * ⊥ a v). Por eso se marca con una cruz y una llamada, no con un cuerpo.
 *
 * Migrado al contrato `SimModule` + `draw(scene)`: estado en la instancia,
 * esquema declarativo, vocabulario de la escena y `readout()` numérico.
 * `unbounded` («seguir carga») empieza en `true`, §17.3.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../core/geometry.js';

/** Radio dibujado de la carga (unidades de mundo). */
const R_CHARGE = 0.38;
/** Paso de la rejilla de símbolos de B (unidades de mundo). */
const B_STEP = 1.6;
/** Radio máximo con el que la órbita completa cabe en el encuadre 24 × 18. */
const R_FITS = 8;
/** Radio máximo para dibujar la guía (círculo, radio y centro). */
const R_GUIDE = 12;

export default class MagneticModule extends SimModule {
  static viewport = { width: 24, height: 18 };

  /** El centro geométrico de la órbita se coloca en el origen (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'q', label: 'Carga (signo y magnitud)', latex: 'q', unit: 'C', min: -3, max: 3, step: 0.5, value: 1 },
    { id: 'm', label: 'Masa', latex: 'm', unit: 'kg', min: 0.4, max: 3, step: 0.1, value: 1 },
    { id: 'B', label: 'Campo magnético', latex: 'B', unit: 'T', min: 0.2, max: 3, step: 0.1, value: 1.2 },
    { id: 'v0', label: 'Rapidez', latex: 'v_0', unit: 'm/s', min: 0.5, max: 6, step: 0.1, value: 3 },
    {
      id: 'sentidoB',
      type: 'select',
      label: 'Sentido de B',
      value: 'sale',
      options: [
        { value: 'sale', label: '⊙ Sale de la página (+z)' },
        { value: 'entra', label: '⊗ Entra en la página (−z)' }
      ]
    }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { q: 1, m: 1, B: 1.2, v0: 3, sentidoB: 'sale' };
    this.t = 0;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    /** Seguir la carga con la cámara (botón «espacio infinito»). */
    this.unbounded = true;
    this.trail = new TrailBuffer(400);
    /** Historial v_x(t) y v_y(t): sinusoides con periodo T. */
    this.histVx = new TrailBuffer(240);
    this.histVy = new TrailBuffer(240);
    this._sampleAcc = 0;
  }

  init(meta = null) {
    this.reset();
    this.renderer?.resetCamera?.();
    this.setModuleInfo({
      title: meta?.title || 'Campos magnéticos',
      blurb: meta?.blurb || 'Carga en B uniforme: F = q(v × B). Órbita circular sin masa en el centro.',
      story:
        'La fuerza de Lorentz es siempre perpendicular a la velocidad: curva la trayectoria pero no cambia |v|. ' +
        'El círculo tiene un centro geométrico (cruz discontinua), no un planeta ni una carga fija. ' +
        'Eso lo distingue de Gravedad universal y de Kepler (atracción 1/r² hacia una masa central). ' +
        'Ejemplo real: electrones en un tubo de rayos catódicos o iones en un ciclotrón.',
      cases: [
        'Tubo CRT / haz de electrones curvado por B.',
        'Ciclotrón: órbitas con r = mv/|q|B (mayor v → mayor radio).',
        'Cambia el signo de q o el sentido de B: la órbita gira al revés (mano derecha).',
        'T = 2πm/|q|B no depende de v: la gráfica v(t) conserva su periodo al cambiar v₀.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Fuerza de Lorentz (B ⊥ v)', formula: 'F = |q| · v · B', note: 'Dirección: v × B (mano derecha). |v| no cambia.' },
        { name: 'Radio de órbita', formula: 'r = m·v / (|q|·B)', note: 'Mayor B o |q| → círculo más chico. No hay masa en el centro.' },
        { name: 'Periodo ciclotrón', formula: 'T = 2π m / (|q| B)', note: 'En B uniforme, T no depende de v.' }
      ]
    });
    this.clearChallenges();
  }

  /** Componente z de B con signo según el sentido elegido. */
  Bz() {
    return this.params.sentidoB === 'entra' ? -this.params.B : this.params.B;
  }

  /** Carga efectiva: q = 0 rompe la órbita, se evita como hacía el panel legacy. */
  qEff() {
    const q = this.params.q;
    if (Math.abs(q) < 0.25) return q >= 0 ? 0.5 : -0.5;
    return q;
  }

  /** Radio ciclotrón r = m v / |q B|. */
  orbitRadius() {
    return (this.params.m * this.params.v0) / (Math.abs(this.qEff() * this.Bz()) || 1e-9);
  }

  /** Periodo ciclotrón. */
  period() {
    return (2 * Math.PI * this.params.m) / (Math.abs(this.qEff() * this.Bz()) || 1e-9);
  }

  /** Magnitud de la fuerza de Lorentz. */
  force() {
    return Math.abs(this.qEff() * this.Bz()) * Math.hypot(this.vx, this.vy);
  }

  /**
   * Centro geométrico de la órbita (no es un objeto físico).
   * r_c = r + (m / (q B)) (v × ẑ),  v×ẑ = (vy, −vx).
   */
  orbitCenter() {
    const qB = this.qEff() * this.Bz();
    const f = this.params.m / qB;
    return { x: this.x + f * this.vy, y: this.y + f * -this.vx };
  }

  /**
   * Coloca la carga de modo que el centro geométrico quede en el origen.
   * Así se ve la órbita completa y no parece «orbitar un objeto invisible».
   * Si el círculo no cabe en el encuadre (r grande), la carga arranca en el
   * origen y el centro queda a (−r, 0): lo importante es ver la carga.
   */
  reset() {
    this.t = 0;
    const R = this.orbitRadius();
    const speed = Math.max(0.05, this.params.v0);
    // a = k(vy, −vx) con k = qB/m; centro en (0,0), partícula en (R, 0):
    // a debe apuntar a −x → k·vy < 0 → vy tiene el signo opuesto a k.
    const sense = this.qEff() * this.Bz() >= 0 ? -1 : 1;
    this.x = R <= R_FITS ? R : 0;
    this.y = 0;
    this.vx = 0;
    this.vy = sense * speed;
    this.trail.clear();
    this.histVx.clear();
    this.histVy.clear();
    this._sampleAcc = 0;
    if (!this.unbounded) this.renderer?.resetCamera?.();
    this.engine?.reset?.();
  }

  destroy() {
    this.trail.clear();
    this.histVx.clear();
    this.histVy.clear();
    this.renderer?.resetCamera?.();
  }

  /* ---------- seguir carga (§17.3) ---------- */

  setTool(id) {
    if (id === 'unbounded') this.setUnbounded(!this.unbounded);
  }

  setUnbounded(on) {
    this.unbounded = !!on;
    if (this.unbounded) this.renderer?.follow?.(this.x, this.y);
    else this.renderer?.resetCamera?.();
  }

  getUnbounded() {
    return this.unbounded;
  }

  /* ---------- física ---------- */

  update(dt) {
    this.t += dt;
    // F = q (v × Bẑ) → a = (qB/m)(vy, −vx)
    const k = (this.qEff() * this.Bz()) / this.params.m;
    const ax = k * this.vy;
    const ay = -k * this.vx;
    this.vx += ax * dt;
    this.vy += ay * dt;
    // Renormalización suave: |v| es constante (F magnética no hace trabajo).
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 1e-6) {
      const s = this.params.v0 / speed;
      this.vx *= s;
      this.vy *= s;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.trail.push({ x: this.x, y: this.y });

    this._sampleAcc += dt;
    if (this._sampleAcc >= 0.05) {
      this._sampleAcc = 0;
      this.histVx.push({ x: this.t, y: this.vx });
      this.histVy.push({ x: this.t, y: this.vy });
    }

    if (this.unbounded) this.renderer?.follow?.(this.x, this.y);
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const sale = this.Bz() > 0;
    const R = this.orbitRadius();
    const c = this.orbitCenter();
    const q = this.qEff();

    // Campo B uniforme: rejilla de ⊙ (sale) o ⊗ (entra) sobre el área visible.
    const w = scene.world();
    const margin = 0.25; // los símbolos no asoman del lienzo
    const x0 = Math.ceil((w.left + margin) / B_STEP) * B_STEP;
    const y0 = Math.ceil((w.bottom + margin) / B_STEP) * B_STEP;
    for (let x = x0; x <= w.right - margin; x += B_STEP) {
      for (let y = y0; y <= w.top - margin; y += B_STEP) {
        scene.circle(x, y, 0.13, { color: 'field', width: 1.2, alpha: 0.35 });
        if (sale) {
          scene.circle(x, y, 0.045, { color: 'field', fill: 'field', alpha: 0.55 });
        } else {
          scene.line(x - 0.08, y - 0.08, x + 0.08, y + 0.08, { color: 'field', width: 1.2, alpha: 0.5 });
          scene.line(x - 0.08, y + 0.08, x + 0.08, y - 0.08, { color: 'field', width: 1.2, alpha: 0.5 });
        }
      }
    }

    // Órbita guía + radio + centro geométrico (cruz, no cuerpo).
    if (Number.isFinite(R) && R <= R_GUIDE) {
      scene.circle(c.x, c.y, R, { color: 'accel', width: 1.5, dash: [6, 5], alpha: 0.45 });
      scene.line(c.x, c.y, this.x, this.y, { color: 'warn', width: 1.4, dash: [4, 4], alpha: 0.7 });
      scene.label((c.x + this.x) / 2, (c.y + this.y) / 2, `r = ${roundTo(R, 2)} m`, { color: 'warn', size: 11, avoid: true });
      scene.line(c.x - 0.3, c.y, c.x + 0.3, c.y, { color: 'text', width: 1.5, alpha: 0.6 });
      scene.line(c.x, c.y - 0.3, c.x, c.y + 0.3, { color: 'text', width: 1.5, alpha: 0.6 });
      scene.circle(c.x, c.y, 0.1, { color: 'text', width: 1.5, alpha: 0.6 });
      // La llamada apunta hacia el lado del encuadre donde hay sitio.
      scene.callout(c.x, c.y, 'centro geométrico (no hay objeto)', {
        angle: c.x <= 0 ? Math.PI / 4 : (3 * Math.PI) / 4,
        distance: 26,
        color: 'textDim'
      });
    }

    // Estela y carga.
    if (this.trail.length > 1) scene.trail(this.trail, { color: 'accel', width: 2.2, alpha: 0.55 });
    scene.body(this.x, this.y, {
      shape: 'circle',
      r: R_CHARGE,
      color: q >= 0 ? 'force' : 'field',
      label: q >= 0 ? `+q = ${roundTo(Math.abs(q), 2)} C` : `−q = ${roundTo(Math.abs(q), 2)} C`,
      labelColor: q >= 0 ? 'force' : 'field',
      id: 'carga'
    });

    // Vectores v y F (⊥ v) en la carga.
    const v = Math.hypot(this.vx, this.vy);
    if (v > 0.01) {
      scene.vector(this.x, this.y, this.vx * 0.28, this.vy * 0.28, { color: 'velocity', label: `v = ${roundTo(v, 2)} m/s` });
    }
    const Fx = q * this.Bz() * this.vy;
    const Fy = -q * this.Bz() * this.vx;
    const Fmag = Math.hypot(Fx, Fy) || 1;
    const fScale = 0.9 / Fmag;
    scene.vector(this.x, this.y, Fx * fScale, Fy * fScale, { color: 'force', label: `F = ${roundTo(this.force(), 2)} N`, labelSide: -1 });

    // HUD.
    const hud = scene.hud;
    hud.chip(`B uniforme ${sale ? '⊙ sale de' : '⊗ entra en'} la página · F = q(v × B)`, 'top-left');
    hud.chip('No hay masa ni imán en el centro del círculo', 'top-left');
    hud.readout(
      [
        { label: '|v|', value: v, unit: 'm/s' },
        { label: 'r', value: R, unit: 'm' },
        { label: 'T', value: this.period(), unit: 's' },
        { label: 'F', value: this.force(), unit: 'N' }
      ],
      'bottom-left'
    );
    hud.legend(
      [
        { color: 'field', label: sale ? 'B ⊙ (uniforme, sale)' : 'B ⊗ (uniforme, entra)' },
        { color: q >= 0 ? 'force' : 'field', label: 'Carga en movimiento' },
        { color: 'velocity', label: 'Velocidad v' },
        { color: 'force', label: 'Fuerza F ⊥ v' },
        { color: 'accel', label: 'Órbita guía', dash: [6, 5] },
        { color: 'text', label: 'Centro (no es un objeto)' }
      ],
      'top-right'
    );

    const vp = scene.viewport();
    if (vp.w > 420) {
      const hasHist = this.histVx.length > 1;
      const span = this.params.v0 * 1.2;
      hud.plot(
        { x: vp.x + vp.w - 215, y: vp.y + vp.h - 128, w: 200, h: 116 },
        {
          title: `v_x, v_y (t) · T = ${roundTo(this.period(), 2)} s`,
          series: [
            { points: hasHist ? this.histVx : [{ x: 0, y: this.vx }, { x: 1, y: this.vx }], color: 'velocity', label: 'v_x' },
            { points: hasHist ? this.histVy : [{ x: 0, y: this.vy }, { x: 1, y: this.vy }], color: 'accel', label: 'v_y', dash: [4, 3] }
          ],
          yRange: [-span, span]
        }
      );
    }
  }

  /* ---------- manipulación directa ---------- */

  /** Arrastrar la carga la reposiciona; la órbita se recentra desde ahí. */
  onDrag(id, world) {
    if (id !== 'carga') return;
    this.x = world.x;
    this.y = world.y;
    this.trail.clear();
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const c = this.orbitCenter();
    return {
      q: { value: this.qEff(), unit: 'C' },
      B: { value: this.Bz(), unit: 'T' },
      '|v|': { value: roundTo(Math.hypot(this.vx, this.vy), 3), unit: 'm/s' },
      r: { value: roundTo(this.orbitRadius(), 3), unit: 'm' },
      T: { value: roundTo(this.period(), 3), unit: 's' },
      F: { value: roundTo(this.force(), 3), unit: 'N' },
      'centro x': { value: roundTo(c.x, 2), unit: 'm' },
      'centro y': { value: roundTo(c.y, 2), unit: 'm' }
    };
  }

  getState() {
    return {
      t: this.t,
      pos: { x: this.x, y: this.y },
      vel: { x: this.vx, y: this.vy },
      unbounded: this.unbounded,
      params: { ...this.params }
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
    if (typeof s.unbounded === 'boolean') this.setUnbounded(s.unbounded);
    this.trail.clear();
    this.histVx.clear();
    this.histVy.clear();
  }
}
