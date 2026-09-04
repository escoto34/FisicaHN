/**
 * @fileoverview Luz y óptica geométrica — reflexión, refracción (Snell) y
 * reflexión total interna sobre una interfaz plana.
 *
 * Migrado al contrato `SimModule` + `draw(scene)`: el estado vive en la
 * instancia, los parámetros son un esquema declarativo y los colores son
 * tokens del tema. Geometría estándar de libro:
 *
 *  - Interfaz horizontal en y = 0; medio 1 arriba (y > 0), medio 2 abajo.
 *  - Normal vertical por el punto de impacto (0, 0), que es el `anchor`.
 *  - Ángulos medidos desde la normal.
 *
 * Además del diagrama de rayos, la gráfica θ₂(θ₁) del HUD muestra de un
 * vistazo dónde se acaba la refracción (ángulo crítico) — el «porqué» de la
 * fibra óptica.
 */

import { SimModule } from '../core/sim-module.js';
import { toRad, toDeg, roundTo, clamp } from '../core/geometry.js';

/** Materiales típicos (índice de refracción aprox.). */
const MATERIALS = [
  { id: 'air', label: 'Aire', n: 1.0 },
  { id: 'water', label: 'Agua', n: 1.33 },
  { id: 'glass', label: 'Vidrio', n: 1.5 },
  { id: 'diamond', label: 'Diamante', n: 2.42 }
];

/** Parejas de medios de ejemplo: fijan n₁, n₂ y θ₁ mientras estén activas. */
const PRESETS = {
  'air-water': { label: 'Aire → agua', n1: 1.0, n2: 1.33, angle: 40 },
  'air-glass': { label: 'Aire → vidrio', n1: 1.0, n2: 1.5, angle: 35 },
  'water-air': { label: 'Agua → aire', n1: 1.33, n2: 1.0, angle: 40 },
  'glass-air': { label: 'Vidrio → aire', n1: 1.5, n2: 1.0, angle: 50 },
  'diamond-air': { label: 'Diamante → aire', n1: 2.42, n2: 1.0, angle: 30 }
};

/** Longitud dibujada de cada rayo, en unidades de mundo. */
const RAY_LEN = 6.2;
/** Puntos de la curva θ₂(θ₁) del HUD. */
const CURVE_N = 90;

/** Nombre del material más cercano a un índice, o genérico si no coincide. */
function materialLabel(n) {
  let best = MATERIALS[0];
  let d = Infinity;
  for (const m of MATERIALS) {
    const dd = Math.abs(m.n - n);
    if (dd < d) {
      d = dd;
      best = m;
    }
  }
  return d > 0.08 ? `n = ${roundTo(n, 2)}` : best.label;
}

export default class OpticsModule extends SimModule {
  /** Interfaz apaisada: los rayos se abren a ambos lados de la normal. */
  static viewport = { width: 20, height: 14 };

  /** Punto de impacto del rayo sobre la interfaz: fijo en el origen (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'preset',
      type: 'select',
      label: 'Par de medios',
      value: 'manual',
      options: [
        { value: 'manual', label: 'Manual (deslizadores)' },
        ...Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label }))
      ]
    },
    { id: 'angle', label: 'Ángulo de incidencia', latex: '\\theta_1', unit: '°', min: 0, max: 89, step: 1, value: 40 },
    { id: 'n1', label: 'Índice del medio 1 (arriba)', latex: 'n_1', min: 1, max: 2.5, step: 0.01, value: 1.0 },
    { id: 'n2', label: 'Índice del medio 2 (abajo)', latex: 'n_2', min: 1, max: 2.5, step: 0.01, value: 1.33 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { preset: 'manual', angle: 40, n1: 1.0, n2: 1.33 };
    this.t = 0;
    /** Resultado de Snell para el estado actual (se reescribe, no se re-crea). */
    this.o = {
      theta1: 40,
      theta2: null,
      n1: 1,
      n2: 1.33,
      isTIR: false,
      critical: null,
      sinLeft: 0,
      sinRight: 0
    };
    /** Curva θ₂(θ₁) para la gráfica del HUD; se regenera sólo si cambian n₁/n₂. */
    this.curve = [];
    this._curveKey = '';
    /** Punto actual sobre la curva (serie de un solo punto). */
    this._dot = [{ x: 0, y: 0 }];
    /** Línea vertical del ángulo crítico en la gráfica. */
    this._critLine = [
      { x: 0, y: 0 },
      { x: 0, y: 90 }
    ];
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Luz y óptica geométrica',
      blurb:
        meta?.blurb ||
        'La luz como rayos: al chocar con una frontera se refleja y, si puede, se refracta (cambia de dirección).',
      story:
        'Óptica geométrica = dibujar rayos (no ondas con interferencia). Snell: n₁ sen θ₁ = n₂ sen θ₂. Si vas de un medio «denso» a uno «raro» con mucho ángulo, el rayo no sale: reflexión total interna (fibra óptica).',
      cases: [
        'Espejo: el rayo rebota con el mismo ángulo (θi = θr).',
        'Lápiz en un vaso: el rayo se «quiebra» al pasar aire ↔ agua.',
        'Fibra óptica: luz atrapada por reflexión total interna.'
      ]
    });
    this.setModuleFormulas({
      items: [
        {
          name: 'Reflexión',
          formula: 'θ<sub>i</sub> = θ<sub>r</sub>',
          note: 'Ángulos medidos desde la normal (línea punteada vertical).'
        },
        {
          name: 'Ley de Snell',
          formula: 'n₁ · sen θ₁ = n₂ · sen θ₂',
          note: 'n grande = medio ópticamente más denso (la luz «va más lenta»).'
        },
        {
          name: 'Ángulo crítico',
          formula: 'θ<sub>c</sub> = arcsen(n₂ / n₁)',
          note: 'Solo si n₁ > n₂. Si θ₁ ≥ θc → reflexión total interna.'
        }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this._recompute();
    this.engine?.reset?.();
  }

  /** Valores efectivos: el par de medios elegido manda sobre los deslizadores. */
  effective() {
    const p = PRESETS[this.params.preset];
    if (p) return { angle: p.angle, n1: p.n1, n2: p.n2 };
    return { angle: this.params.angle, n1: this.params.n1, n2: this.params.n2 };
  }

  /** Snell para el estado actual; escribe en `this.o` sin allocar. */
  _recompute() {
    const e = this.effective();
    const o = this.o;
    o.theta1 = clamp(e.angle, 0, 89.5);
    o.n1 = Math.max(1, e.n1);
    o.n2 = Math.max(1, e.n2);
    o.critical = o.n1 > o.n2 ? toDeg(Math.asin(o.n2 / o.n1)) : null;
    const sin2 = (o.n1 / o.n2) * Math.sin(toRad(o.theta1));
    o.sinLeft = o.n1 * Math.sin(toRad(o.theta1));
    if (sin2 > 1 + 1e-9) {
      o.isTIR = true;
      o.theta2 = null;
      o.sinRight = null;
    } else {
      o.isTIR = false;
      o.theta2 = toDeg(Math.asin(clamp(sin2, -1, 1)));
      o.sinRight = o.n2 * Math.sin(toRad(o.theta2));
    }

    const key = `${o.n1}|${o.n2}`;
    if (key !== this._curveKey) {
      this._curveKey = key;
      this.curve = [];
      for (let i = 0; i <= CURVE_N; i++) {
        const th1 = (90 * i) / CURVE_N;
        const s = (o.n1 / o.n2) * Math.sin(toRad(th1));
        if (s > 1) break;
        this.curve.push({ x: th1, y: toDeg(Math.asin(s)) });
      }
    }
    this._dot[0].x = o.theta1;
    this._dot[0].y = o.isTIR ? 90 : o.theta2;
    if (o.critical != null) {
      this._critLine[0].x = o.critical;
      this._critLine[1].x = o.critical;
    }
  }

  update(dt) {
    this.t += dt;
    this._recompute();
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    const o = this.o;
    const b = scene.world();
    const th1 = toRad(o.theta1);

    // —— Medios: dos bandas cuya opacidad crece con n (más denso, más oscuro).
    const tint = (n) => 0.05 + 0.07 * clamp((n - 1) / 1.5, 0, 1);
    scene.rect((b.left + b.right) / 2, b.top / 2, b.right - b.left, b.top, {
      fill: 'rayAlt',
      stroke: false,
      alpha: tint(o.n1)
    });
    scene.rect((b.left + b.right) / 2, b.bottom / 2, b.right - b.left, -b.bottom, {
      fill: 'field',
      stroke: false,
      alpha: tint(o.n2)
    });
    scene.label(b.left + 0.4, 0.55, `Medio 1 · ${materialLabel(o.n1)} · n₁ = ${roundTo(o.n1, 2)}`, {
      align: 'left',
      baseline: 'bottom',
      color: 'rayAlt',
      weight: '600',
      avoid: true
    });
    scene.label(b.left + 0.4, -0.55, `Medio 2 · ${materialLabel(o.n2)} · n₂ = ${roundTo(o.n2, 2)}`, {
      align: 'left',
      baseline: 'top',
      color: 'field',
      weight: '600',
      avoid: true
    });

    // —— Interfaz y normal.
    scene.line(b.left, 0, b.right, 0, { color: 'text', width: 2, alpha: 0.6 });
    scene.line(0, -3.2, 0, 3.2, { color: 'textDim', width: 1.5, dash: [5, 5] });
    scene.label(0.2, 3.25, 'normal', { align: 'left', baseline: 'bottom', color: 'textDim', size: 11, avoid: true });

    // —— Rayos (vector = segmento con punta de flecha).
    const sx = RAY_LEN * Math.sin(th1);
    const cy = RAY_LEN * Math.cos(th1);
    // Incidente: baja desde arriba-izquierda hasta el punto de impacto.
    scene.body(-sx, cy, { shape: 'circle', r: 0.2, color: 'ray', glow: true });
    scene.label(-sx, cy + 0.35, 'fuente', { color: 'ray', size: 11, avoid: true });
    scene.vector(-sx, cy, sx, -cy, { color: 'ray', width: 3 });
    // Reflejado: espejo respecto a la normal. En RTI se lleva toda la luz (trazo
    // continuo); si hay refracción, va discontinuo y más tenue.
    scene.vector(0, 0, sx, cy, {
      color: o.isTIR ? 'danger' : 'warn',
      width: o.isTIR ? 3 : 2.2,
      dash: o.isTIR ? undefined : [7, 5],
      alpha: o.isTIR ? 1 : 0.8
    });
    // Refractado: sólo si Snell tiene solución.
    if (!o.isTIR) {
      const th2 = toRad(o.theta2);
      scene.vector(0, 0, RAY_LEN * Math.sin(th2), -RAY_LEN * Math.cos(th2), { color: 'rayAlt', width: 3 });
    }

    // Punto de impacto encima de los rayos.
    scene.body(0, 0, { shape: 'circle', r: 0.11, color: 'text', glow: false });

    // —— Arcos de ángulo (desde la normal). Radios distintos para que las
    // etiquetas θ₁ y θr no compitan cuando θ₁ → 0.
    if (o.theta1 > 0.5) {
      this._angleMark(scene, Math.PI / 2, Math.PI / 2 + th1, 1.25, `θ₁ = ${roundTo(o.theta1, 0)}°`, 'ray');
      this._angleMark(scene, Math.PI / 2 - th1, Math.PI / 2, 1.75, `θr = ${roundTo(o.theta1, 0)}°`, o.isTIR ? 'danger' : 'warn');
    }
    if (!o.isTIR && o.theta2 > 0.5) {
      const th2 = toRad(o.theta2);
      this._angleMark(scene, -Math.PI / 2, -Math.PI / 2 + th2, 1.25, `θ₂ = ${roundTo(o.theta2, 1)}°`, 'rayAlt');
    }
    // Ángulo crítico: marca discontinua del límite de la refracción.
    if (o.critical != null) {
      const thc = toRad(o.critical);
      scene.line(0, 0, -2.6 * Math.sin(thc), 2.6 * Math.cos(thc), { color: 'danger', width: 1.2, dash: [3, 4], alpha: 0.7 });
      scene.label(-2.75 * Math.sin(thc), 2.75 * Math.cos(thc), `θc = ${roundTo(o.critical, 1)}°`, {
        color: 'danger',
        size: 11,
        align: 'right',
        avoid: true
      });
    }

    // —— HUD.
    const hud = scene.hud;
    hud.chip(
      o.isTIR ? 'Reflexión total interna: el rayo no sale' : `Refracta · θ₂ = ${roundTo(o.theta2, 1)}°`,
      'top-left',
      { color: o.isTIR ? 'danger' : 'ok' }
    );
    const preset = PRESETS[this.params.preset];
    if (preset) hud.chip(`Par de medios: ${preset.label}`, 'top-left');
    else if (o.critical == null) hud.chip('n₁ ≤ n₂: siempre hay refracción', 'top-left', { color: 'textDim' });
    else hud.chip(`Por encima de θc = ${roundTo(o.critical, 1)}° hay reflexión total`, 'top-left', { color: 'textDim' });

    hud.readout(
      [
        { label: 'n₁·sen θ₁', value: o.sinLeft, unit: '' },
        { label: 'n₂·sen θ₂', value: o.isTIR ? '—' : o.sinRight, unit: '' },
        { label: 'θc', value: o.critical == null ? 'no aplica' : roundTo(o.critical, 1), unit: o.critical == null ? '' : '°' }
      ],
      'bottom-left',
      { decimals: 3 }
    );
    hud.legend(
      [
        { color: 'ray', label: 'Incidente', dash: [] },
        { color: o.isTIR ? 'danger' : 'warn', label: o.isTIR ? 'Reflejado (total)' : 'Reflejado', dash: o.isTIR ? [] : [6, 4] },
        ...(o.isTIR ? [] : [{ color: 'rayAlt', label: 'Refractado', dash: [] }])
      ],
      'bottom-right'
    );

    // Gráfica θ₂(θ₁): la curva termina de golpe en el ángulo crítico.
    const vp = scene.viewport();
    if (vp.w > 420 && this.curve.length > 1) {
      const series = [{ points: this.curve, color: 'rayAlt', label: 'θ₂', dash: [] }];
      if (o.critical != null) series.push({ points: this._critLine, color: 'danger', dash: [4, 3], width: 1.2 });
      series.push({ points: this._dot, color: 'ray', pointSize: 4 });
      hud.plot(
        { x: vp.x + vp.w - 210, y: vp.y + 12, w: 195, h: 116 },
        { title: 'θ₂ frente a θ₁ (grados)', series, xRange: [0, 90], yRange: [0, 90] }
      );
    }
  }

  /** Arco de ángulo con etiqueta apartada de las demás (§13.1). */
  _angleMark(scene, a0, a1, r, text, color) {
    scene.arc(0, 0, r, a0, a1, { color, width: 1.6, alpha: 0.9 });
    const mid = (a0 + a1) / 2;
    scene.label(Math.cos(mid) * (r + 0.55), Math.sin(mid) * (r + 0.55), text, {
      color,
      size: 11,
      weight: '600',
      baseline: 'middle',
      avoid: true
    });
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    const o = this.o;
    return {
      'θ₁ (incidencia)': { value: roundTo(o.theta1, 1), unit: '°' },
      'θr (reflejado)': { value: roundTo(o.theta1, 1), unit: '°' },
      'θ₂ (refractado)': { value: o.isTIR ? null : roundTo(o.theta2, 2), unit: '°' },
      'n₁': { value: roundTo(o.n1, 2), unit: '' },
      'n₂': { value: roundTo(o.n2, 2), unit: '' },
      'n₁·sen θ₁': { value: roundTo(o.sinLeft, 4), unit: '' },
      'n₂·sen θ₂': { value: o.isTIR ? null : roundTo(o.sinRight, 4), unit: '' },
      'θc (crítico)': { value: o.critical == null ? null : roundTo(o.critical, 2), unit: '°' },
      'Reflexión total': { value: o.isTIR ? 1 : 0, unit: '(1 = sí)' }
    };
  }

  getState() {
    return { t: this.t, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    this._recompute();
  }

  destroy() {
    this.curve = [];
  }
}
