/**
 * @fileoverview Cantidad de movimiento — momento lineal, impulso y choques 1D.
 *
 * **Módulo de referencia de la WAVE 2.** Es el primero migrado al contrato
 * `SimModule` con `draw(scene)`, y sirve de patrón para el resto:
 *
 * - El estado vive en la instancia, no en variables de nivel de módulo. Eso es
 *   lo que habilita la comparación lado a lado de §2.9 — «choque elástico
 *   frente a inelástico» es justo el caso de uso que la motiva.
 * - Los parámetros son un esquema declarativo (§2.7): sin `renderParams()`
 *   escrito a mano ni `setTimeout(…, 0)` para enlazar los controles.
 * - Dibuja con el vocabulario de la escena (§2.4), en un único espacio de
 *   coordenadas: nada de `ctx.canvas.width`, que era el bug de DPR de §2.0
 *   (las barras de energía se salían de pantalla en móvil).
 * - `readout()` devuelve números, no HTML: la presentación es del anfitrión, y
 *   la comparación puede restar dos lecturas.
 *
 * El modo **impulso** existe porque «Impulso» no merece un motor propio: sería
 * idéntico a éste. Es un modo, no un módulo duplicado (§3.2).
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../core/geometry.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

/** Altura del riel en el mundo. Todo el módulo es 1D sobre esta recta. */
const RAIL_Y = 0;
/** Semiancho del riel, en unidades de mundo. */
const RAIL_HALF = 9.5;

export default class MomentumModule extends SimModule {
  /** Encuadre propio: el riel pide más ancho que alto (§2.2). */
  static viewport = { width: 22, height: 12 };

  /** Esquema declarativo: la app construye y enlaza el panel (§2.7). */
  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'choque',
      options: [
        { value: 'choque', label: 'Choque' },
        { value: 'impulso', label: 'Impulso (F·Δt)' }
      ]
    },
    {
      id: 'tipo',
      type: 'select',
      label: 'Tipo de choque',
      value: 'elastico',
      options: [
        { value: 'elastico', label: 'Elástico' },
        { value: 'inelastico', label: 'Inelástico (coef. e)' },
        { value: 'perfecto', label: 'Perfectamente inelástico' }
      ]
    },
    { id: 'm1', label: 'Masa 1', latex: 'm_1', unit: 'kg', min: 0.5, max: 10, step: 0.5, value: 2 },
    { id: 'm2', label: 'Masa 2', latex: 'm_2', unit: 'kg', min: 0.5, max: 10, step: 0.5, value: 3 },
    { id: 'v1i', label: 'Velocidad inicial 1', latex: 'v_1', unit: 'm/s', min: -8, max: 8, step: 0.5, value: 4 },
    { id: 'v2i', label: 'Velocidad inicial 2', latex: 'v_2', unit: 'm/s', min: -8, max: 8, step: 0.5, value: -1 },
    { id: 'e', label: 'Coef. de restitución', latex: 'e', min: 0, max: 1, step: 0.05, value: 0.5 },
    { id: 'F', label: 'Fuerza aplicada', latex: 'F', unit: 'N', min: 0, max: 40, step: 1, value: 12 },
    { id: 'dt', label: 'Duración', latex: '\\Delta t', unit: 's', min: 0.1, max: 3, step: 0.1, value: 1 }
  ];

  constructor(ctx) {
    super(ctx);
    /** Valores vivos del esquema; el panel escribe aquí directamente. */
    this.params = {
      modo: 'choque',
      tipo: 'elastico',
      m1: 2,
      m2: 3,
      v1i: 4,
      v2i: -1,
      e: 0.5,
      F: 12,
      dt: 1
    };
    this.t = 0;
    this.collided = false;
    this.x1 = -6;
    this.x2 = 4;
    this.v1 = 4;
    this.v2 = -1;
    /** Historial p(t) para la gráfica en lienzo. Anillo: sin `shift()` por frame. */
    this.history = new TrailBuffer(240);
    /** Cuerpo que el usuario está arrastrando, o null. */
    this.dragging = null;
    this.useCharts = false;
  }

  init() {
    this.reset();

    setModuleInfo(this.ui, {
      title: 'Cantidad de movimiento',
      blurb: 'Momento lineal, impulso y choques en una dimensión.',
      story:
        'La conservación del momento es el principio que explica desde el retroceso de un arma hasta la propulsión de un cohete: no hace falta apoyarse en nada externo, basta con expulsar masa.',
      cases: [
        'Bolas de billar: choque casi elástico.',
        'Dos vagones que se acoplan: perfectamente inelástico.',
        'Retroceso de un arma al disparar.',
        'Airbag: alarga Δt para reducir la fuerza del mismo impulso.'
      ]
    });

    setModuleFormulas(this.ui, {
      items: [
        { name: 'Momento lineal', formula: 'p = m · v' },
        {
          name: 'Conservación',
          formula: 'Σ p_i = Σ p_f',
          note: 'En un sistema aislado de fuerzas externas netas.'
        },
        {
          name: 'Impulso',
          formula: 'J = F · Δt = Δp',
          note: 'El área bajo la gráfica $F$–$t$ es el cambio de momento.'
        },
        {
          name: 'Coeficiente de restitución',
          formula: 'e = (v_2f − v_1f) / (v_1i − v_2i)',
          note: '$e = 1$ elástico, $e = 0$ perfectamente inelástico.'
        }
      ]
    });

    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.collided = false;
    this.history.clear();
    if (this.params.modo === 'impulso') {
      // Un solo cuerpo en reposo al que se aplica F durante Δt.
      this.x1 = -6;
      this.v1 = 0;
      this.x2 = RAIL_HALF;
      this.v2 = 0;
    } else {
      this.x1 = -6;
      this.x2 = 4;
      this.v1 = this.params.v1i;
      this.v2 = this.params.v2i;
    }
  }

  /** Radio del cuerpo i, creciente con la masa para que se lea de un vistazo. */
  radius(which) {
    const m = which === 1 ? this.params.m1 : this.params.m2;
    return 0.35 + m * 0.08;
  }

  /** Resuelve el choque según el tipo elegido. */
  _resolveCollision() {
    const { m1, m2, tipo } = this.params;
    const u1 = this.v1;
    const u2 = this.v2;

    if (tipo === 'perfecto') {
      const vf = (m1 * u1 + m2 * u2) / (m1 + m2);
      this.v1 = vf;
      this.v2 = vf;
      return;
    }
    // El caso elástico es el de restitución con e = 1; se escribe aparte
    // porque es la fórmula que aparece en el libro de texto.
    const e = tipo === 'elastico' ? 1 : this.params.e;
    this.v1 = ((m1 - e * m2) * u1 + m2 * (1 + e) * u2) / (m1 + m2);
    this.v2 = ((m2 - e * m1) * u2 + m1 * (1 + e) * u1) / (m1 + m2);
  }

  momentum() {
    return this.params.m1 * this.v1 + this.params.m2 * this.v2;
  }

  energy() {
    return 0.5 * this.params.m1 * this.v1 ** 2 + 0.5 * this.params.m2 * this.v2 ** 2;
  }

  /** Fuerza aplicada en el instante actual (sólo en modo impulso). */
  appliedForce() {
    if (this.params.modo !== 'impulso') return 0;
    return this.t <= this.params.dt ? this.params.F : 0;
  }

  update(dt) {
    if (this.dragging) return; // arrastrando: la física espera
    this.t += dt;

    if (this.params.modo === 'impulso') {
      const F = this.appliedForce();
      this.v1 += (F / this.params.m1) * dt;
      this.x1 += this.v1 * dt;
      if (this.x1 > RAIL_HALF) this.x1 = -RAIL_HALF;
    } else {
      this.x1 += this.v1 * dt;
      this.x2 += this.v2 * dt;
      if (!this.collided) {
        const r1 = this.radius(1);
        const r2 = this.radius(2);
        if (this.x1 + r1 >= this.x2 - r2 && this.v1 > this.v2) {
          this._resolveCollision();
          this.collided = true;
          // Separarlos un pelo evita que se re-detecte el contacto.
          this.x1 = this.x2 - r1 - r2 - 0.01;
        }
      }
    }

    this.history.push({ x: this.t, y: this.momentum() });
  }

  /* ---------- interacción directa (§2.6) ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    const r = this.radius(id === 'm1' ? 1 : 2);
    const x = Math.max(-RAIL_HALF + r, Math.min(RAIL_HALF - r, world.x));
    if (id === 'm1') this.x1 = x;
    else this.x2 = x;
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const impulso = this.params.modo === 'impulso';
    const r1 = this.radius(1);
    const r2 = this.radius(2);

    // Riel
    scene.line(-RAIL_HALF, RAIL_Y - 0.7, RAIL_HALF, RAIL_Y - 0.7, {
      color: 'spring',
      width: 3
    });

    // `id` registra el cuerpo como seleccionable: la escena resuelve el
    // hit testing y el arrastre llega a onDrag sin que el módulo lo calcule.
    scene.body(this.x1, RAIL_Y, { shape: 'rect', r: r1, color: 'mass', id: 'm1' });
    scene.vector(this.x1, RAIL_Y + r1 + 0.45, this.v1 * 0.25, 0, {
      color: 'velocity',
      label: `v₁ = ${roundTo(this.v1, 2)} m/s`
    });
    // La masa va bajo el riel y la velocidad encima: si comparten el lado, la
    // etiqueta del vector se monta sobre la del cuerpo.
    scene.label(this.x1, RAIL_Y - 1.0, `m₁ = ${this.params.m1} kg`, { color: 'mass' });

    if (!impulso) {
      scene.body(this.x2, RAIL_Y, { shape: 'rect', r: r2, color: 'mass2', id: 'm2' });
      scene.vector(this.x2, RAIL_Y + r2 + 0.45, this.v2 * 0.25, 0, {
        color: 'velocity',
        label: `v₂ = ${roundTo(this.v2, 2)} m/s`,
        labelSide: -1
      });
      scene.label(this.x2, RAIL_Y - 1.0, `m₂ = ${this.params.m2} kg`, { color: 'mass2' });
    } else {
      const F = this.appliedForce();
      if (F > 0) {
        scene.vector(this.x1 - r1, RAIL_Y, -F * 0.06, 0, {
          color: 'force',
          label: `F = ${F} N`,
          labelSide: -1
        });
      }
    }

    // HUD: estado, magnitudes y leyenda. Anclado al viewport, así que en
    // comparación lado a lado cada mitad tiene el suyo.
    const hud = scene.hud;
    hud.chip(
      impulso
        ? this.t <= this.params.dt
          ? 'Aplicando fuerza'
          : 'Fuerza retirada'
        : this.collided
          ? 'Después del choque'
          : 'Antes del choque',
      'top-left'
    );
    hud.readout(
      [
        { label: 'p', value: this.momentum(), unit: 'kg·m/s' },
        { label: 'Ec', value: this.energy(), unit: 'J' },
        ...(impulso ? [{ label: 'J', value: this.impulse(), unit: 'N·s' }] : [])
      ],
      'bottom-left'
    );

    // Gráfica dentro del lienzo: p(t) en choques, F–t con el área del impulso
    // en el modo impulso (tanda 5.2).
    const vp = scene.viewport();
    if (vp.w > 420 && this.history.length > 1) {
      hud.plot(
        { x: vp.x + vp.w - 210, y: vp.y + vp.h - 128, w: 195, h: 116 },
        impulso
          ? {
              title: 'Fuerza aplicada F(t)',
              series: [
                {
                  points: [
                    { x: 0, y: this.params.F },
                    { x: Math.min(this.t, this.params.dt), y: this.params.F }
                  ],
                  color: 'force',
                  fill: true
                }
              ],
              yRange: [0, this.params.F * 1.25],
              xRange: [0, Math.max(this.params.dt, this.t) * 1.1]
            }
          : {
              title: 'Momento total p(t)',
              series: [{ points: this.history, color: 'energy', label: 'p' }],
              yRange: this._pRange()
            }
      );
    }
  }

  /** Rango fijo del eje p: si autoescalara, la recta constante no se vería. */
  _pRange() {
    const p0 = this.params.m1 * this.params.v1i + this.params.m2 * this.params.v2i;
    const span = Math.max(Math.abs(p0), Math.abs(this.momentum()), 1) * 1.4;
    return [-span, span];
  }

  /** Impulso acumulado sobre el cuerpo 1 (modo impulso). */
  impulse() {
    return this.params.F * Math.min(this.t, this.params.dt);
  }

  /* ---------- datos numéricos, no HTML (§1.1) ---------- */

  readout() {
    const out = {
      'v₁': { value: roundTo(this.v1, 3), unit: 'm/s' },
      'p total': { value: roundTo(this.momentum(), 3), unit: 'kg·m/s' },
      'Ec': { value: roundTo(this.energy(), 3), unit: 'J' }
    };
    if (this.params.modo === 'impulso') {
      out['J'] = { value: roundTo(this.impulse(), 3), unit: 'N·s' };
      out['Δp'] = { value: roundTo(this.params.m1 * this.v1, 3), unit: 'kg·m/s' };
    } else {
      out['v₂'] = { value: roundTo(this.v2, 3), unit: 'm/s' };
      const p0 = this.params.m1 * this.params.v1i + this.params.m2 * this.params.v2i;
      out['Ec perdida'] = {
        value: roundTo(
          0.5 * this.params.m1 * this.params.v1i ** 2 +
            0.5 * this.params.m2 * this.params.v2i ** 2 -
            this.energy(),
          3
        ),
        unit: 'J'
      };
      out['Δp sistema'] = { value: roundTo(this.momentum() - p0, 3), unit: 'kg·m/s' };
    }
    return out;
  }

  getState() {
    return {
      x1: this.x1,
      x2: this.x2,
      v1: this.v1,
      v2: this.v2,
      collided: this.collided,
      t: this.t,
      params: { ...this.params }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.x1)) this.x1 = s.x1;
    if (Number.isFinite(s.x2)) this.x2 = s.x2;
    if (Number.isFinite(s.v1)) this.v1 = s.v1;
    if (Number.isFinite(s.v2)) this.v2 = s.v2;
    if (typeof s.collided === 'boolean') this.collided = s.collided;
    if (Number.isFinite(s.t)) this.t = s.t;
    this.history.clear();
  }

  destroy() {
    this.history.clear();
    this.dragging = null;
  }
}
