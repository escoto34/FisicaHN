/**
 * @fileoverview Campo eléctrico y cargas — Coulomb, campo E y potencial de
 * cargas puntuales en reposo (electrostática; NO es un circuito).
 *
 * Migrado al contrato `SimModule` + `draw(scene)`. Las cargas y la sonda P se
 * arrastran con el puntero (`scene.body` con `id` + `onDrag`).
 *
 * Líneas de campo: se trazan DESDE EL CENTRO de cada carga (streamlines).
 * Nacen en el centro, atraviesan el disco y siguen la dirección de E
 * (positivas) o la contraria (negativas) integrando paso a paso hasta entrar
 * en otra carga o salir del área visible. Su número es proporcional a √|q|
 * (criterio de Faraday: el flujo de líneas ∝ carga). Se recalculan sólo cuando
 * cambia algo (cargas, posiciones o encuadre), no en cada frame.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../core/geometry.js';

/** Constante de Coulomb, N·m²/C². */
const K = 8.99e9;
/** Radio dibujado de cada carga (unidades de mundo). */
const R_CHARGE = 0.5;
/** Radio de la sonda P. */
const R_PROBE = 0.2;
/** Paso de integración de las líneas de campo (unidades de mundo). */
const STEP = 0.12;
const MAX_STEPS = 420;

/** Punto de trabajo para muestrear E sin allocar. */
const _e = { x: 0, y: 0 };

export default class ElectricityModule extends SimModule {
  static viewport = { width: 24, height: 16 };

  /** El punto medio entre q₁ y q₂ está en el origen (§17.1). */
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Configuración',
      value: 'dos',
      options: [
        { value: 'dos', label: 'Dos cargas (dipolo)' },
        { value: 'tres', label: 'Tres cargas' }
      ]
    },
    {
      id: 'vista',
      type: 'select',
      label: 'Representación',
      value: 'lineas',
      options: [
        { value: 'lineas', label: 'Líneas de campo' },
        { value: 'vectores', label: 'Vectores E en rejilla' }
      ]
    },
    { id: 'q1', label: 'Carga 1', latex: 'q_1', unit: 'µC', min: -3, max: 3, step: 0.5, value: 1 },
    { id: 'q2', label: 'Carga 2', latex: 'q_2', unit: 'µC', min: -3, max: 3, step: 0.5, value: -1 },
    { id: 'q3', label: 'Carga 3 (solo con tres)', latex: 'q_3', unit: 'µC', min: -3, max: 3, step: 0.5, value: 1 },
    { id: 'd', label: 'Separación q₁–q₂', latex: 'd', unit: 'm', min: 3, max: 8, step: 0.5, value: 6 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { modo: 'dos', vista: 'lineas', q1: 1, q2: -1, q3: 1, d: 6 };
    this.t = 0;
    /** Cargas vivas: posición (m), carga (C) e id de arrastre. */
    this.charges = [];
    /** Sonda P donde se mide E y V. */
    this.probe = { x: 0, y: -2.5 };
    /** Caché de líneas de campo: clave + arrays planos. */
    this._linesKey = '';
    this._lines = [];
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: meta?.title || 'Campo eléctrico y cargas',
      blurb: meta?.blurb || 'Electrostática: Coulomb, campo E y potencial entre cargas puntuales.',
      story:
        'Coulomb midió la fuerza entre cargas; Faraday introdujo la idea de campo: el espacio alrededor de una carga queda «tensado» y cualquier otra carga siente ahí una fuerza. Este módulo NO es un circuito (Ohm/Kirchhoff): es el campo de cargas en reposo. Arrastra las cargas y la sonda P para explorar E y V.',
      cases: [
        'Dos cargas del mismo signo se repelen (Coulomb).',
        'Las líneas de campo salen de + y entran en −; su densidad ∝ √|q|.',
        'El potencial es más alto cerca de una carga positiva.',
        'Con tres cargas el campo en P es la suma vectorial de los tres.'
      ]
    });
    this.setModuleFormulas({
      items: [
        { name: 'Ley de Coulomb', formula: 'F = k · |q₁·q₂| / r²', note: 'k ≈ 8.99×10⁹ N·m²/C²' },
        { name: 'Campo eléctrico', formula: 'E = k · q / r²', note: 'Vector: suma de las contribuciones de cada carga.' },
        { name: 'Potencial', formula: 'V = k · q / r', note: 'Escalar: se suma directamente.' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    const { d, q1, q2, q3, modo } = this.params;
    this.charges = [
      { id: 'q1', x: -d / 2, y: 0, q: q1 * 1e-6 },
      { id: 'q2', x: d / 2, y: 0, q: q2 * 1e-6 }
    ];
    if (modo === 'tres') this.charges.push({ id: 'q3', x: 0, y: 3, q: q3 * 1e-6 });
    this.probe = { x: 0, y: -2.5 };
    this._linesKey = '';
    this.engine?.reset?.();
  }

  destroy() {
    this.charges.length = 0;
    this._lines.length = 0;
  }

  /** Electrostática: nada se mueve por sí solo. */
  update(dt) {
    this.t += dt;
  }

  /* ---------- campo y potencial ---------- */

  /** Campo E en (px, py) → `out` (N/C). */
  fieldAt(px, py, out) {
    let ex = 0;
    let ey = 0;
    for (const c of this.charges) {
      const dx = px - c.x;
      const dy = py - c.y;
      const r2 = dx * dx + dy * dy + 1e-6;
      const eMag = (K * c.q) / r2;
      const inv = 1 / Math.sqrt(r2);
      ex += eMag * dx * inv;
      ey += eMag * dy * inv;
    }
    out.x = ex;
    out.y = ey;
    return out;
  }

  /** Potencial V en (px, py) (V). */
  potentialAt(px, py) {
    let v = 0;
    for (const c of this.charges) {
      const r = Math.hypot(px - c.x, py - c.y) || 1e-3;
      v += (K * c.q) / r;
    }
    return v;
  }

  /** Fuerza de Coulomb entre q₁ y q₂ (N): positiva = repulsión. */
  coulombForce() {
    const [a, b] = this.charges;
    if (!a || !b) return 0;
    const r = Math.hypot(a.x - b.x, a.y - b.y) || 1e-3;
    return (K * a.q * b.q) / (r * r);
  }

  /* ---------- líneas de campo (desde el centro de cada carga) ---------- */

  _traceLine(origin, ang, dir, bounds) {
    const pts = [];
    let px = origin.x;
    let py = origin.y;
    // Primer tramo radial: del centro al borde del disco (dentro de la carga
    // el campo es formalmente singular; se sale en línea recta).
    let ex = Math.cos(ang);
    let ey = Math.sin(ang);
    pts.push(px, py);
    px += ex * R_CHARGE;
    py += ey * R_CHARGE;
    for (let i = 0; i < MAX_STEPS; i++) {
      // Fuera del área visible: la línea termina en el último punto interior.
      if (px < bounds.minX || px > bounds.maxX || py < bounds.minY || py > bounds.maxY) break;
      pts.push(px, py);
      let entered = false;
      for (const c of this.charges) {
        if (c === origin) continue;
        if (Math.hypot(px - c.x, py - c.y) < R_CHARGE * 0.9) {
          pts.push(c.x, c.y); // termina en el centro de la carga de llegada
          entered = true;
          break;
        }
      }
      if (entered) break;
      this.fieldAt(px, py, _e);
      const m = Math.hypot(_e.x, _e.y) || 1e-9;
      ex = _e.x / m;
      ey = _e.y / m;
      px += ex * STEP * dir;
      py += ey * STEP * dir;
    }
    return pts;
  }

  /** Recalcula las líneas sólo si cambió la configuración o el encuadre. */
  _fieldLines(scene) {
    const w = scene.world();
    const key =
      this.charges.map((c) => `${roundTo(c.x, 2)},${roundTo(c.y, 2)},${c.q}`).join(';') +
      `|${roundTo(w.left, 1)},${roundTo(w.right, 1)},${roundTo(w.top, 1)},${roundTo(w.bottom, 1)}`;
    if (key === this._linesKey) return this._lines;
    this._linesKey = key;
    // Margen interior: las puntas de flecha (7 px) no deben asomar del lienzo.
    const inset = 0.3;
    const bounds = { minX: w.left + inset, maxX: w.right - inset, minY: w.bottom + inset, maxY: w.top - inset };
    const lines = [];
    for (const c of this.charges) {
      if (Math.abs(c.q) < 1e-12) continue;
      const dir = Math.sign(c.q) || 1;
      const seeds = Math.max(8, Math.round(16 * Math.sqrt(Math.abs(c.q) * 1e6)));
      for (let k = 0; k < seeds; k++) {
        const a = ((k + 0.5) / seeds) * Math.PI * 2;
        const pts = this._traceLine(c, a, dir, bounds);
        if (pts.length >= 6) lines.push({ pts, dir });
      }
    }
    this._lines = lines;
    return lines;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const lineas = this.params.vista === 'lineas';

    // 1) Discos de las cargas debajo de las líneas, para que se vean nacer
    //    en el centro. Color + signo dibujado: el color no va solo.
    for (const c of this.charges) {
      const neutral = Math.abs(c.q) < 1e-12;
      scene.body(c.x, c.y, {
        shape: 'circle',
        r: R_CHARGE,
        color: neutral ? 'textDim' : c.q > 0 ? 'force' : 'field',
        id: c.id
      });
    }

    if (lineas) {
      // 2) Líneas de campo con puntas de flecha en el sentido de E.
      const lines = this._fieldLines(scene);
      for (const { pts, dir } of lines) {
        scene.polyline(pts, { color: 'field', width: 1.3, alpha: 0.62 });
        const n = pts.length / 2;
        const marks = n > 60 ? [Math.floor(n * 0.3), Math.floor(n * 0.7)] : [Math.floor(n * 0.5)];
        for (const idx of marks) {
          if (idx < 2 || idx >= n - 1) continue;
          const ax = pts[(idx - 1) * 2];
          const ay = pts[(idx - 1) * 2 + 1];
          const bx = pts[idx * 2];
          const by = pts[idx * 2 + 1];
          const ang = Math.atan2(by - ay, bx - ax) + (dir > 0 ? 0 : Math.PI);
          scene.arrowMark(bx, by, ang, { color: 'field', size: 7, alpha: 0.85 });
        }
      }
    } else {
      // 2') Vectores E en rejilla: longitud saturada cerca de las cargas.
      const wb = scene.world();
      const stepX = (wb.right - wb.left) / 18;
      scene.field((x, y, out) => this.fieldAt(x, y, out), {
        density: 18,
        color: 'field',
        scale: (stepX * 0.8) / 1500,
        alpha: 0.7
      });
    }

    // 3) Signo y etiqueta de cada carga encima de las líneas.
    const rp = scene.px(R_CHARGE);
    for (let i = 0; i < this.charges.length; i++) {
      const c = this.charges[i];
      const neutral = Math.abs(c.q) < 1e-12;
      const qMicro = c.q * 1e6;
      scene.label(c.x, c.y, neutral ? '0' : c.q > 0 ? '+' : '−', {
        color: 'text',
        size: 16,
        weight: '700',
        baseline: 'middle',
        avoid: false
      });
      scene.label(c.x, c.y, `q${'₁₂₃'[i] || i + 1} = ${qMicro > 0 ? '+' : ''}${roundTo(qMicro, 2)} µC`, {
        color: neutral ? 'textDim' : c.q > 0 ? 'force' : 'field',
        size: 12,
        offsetY: rp + 6,
        baseline: 'top',
        avoid: true
      });
    }

    // 4) Sonda P con el vector E local.
    const p = this.probe;
    this.fieldAt(p.x, p.y, _e);
    const eMag = Math.hypot(_e.x, _e.y);
    scene.body(p.x, p.y, { shape: 'triangle', r: R_PROBE, color: 'energy', label: 'P', labelColor: 'energy', id: 'P' });
    if (eMag > 1) {
      const len = Math.min(2.4, 0.4 + eMag / 1500);
      scene.vector(p.x, p.y, (_e.x / eMag) * len, (_e.y / eMag) * len, {
        color: 'energy',
        label: `E = ${roundTo(eMag, 0)} N/C`
      });
    }

    // HUD.
    const hud = scene.hud;
    hud.chip(lineas ? 'Líneas ∝ √|q|: salen de + y entran en −' : 'Vectores E: suma de las contribuciones', 'top-left');
    const F = this.coulombForce();
    hud.readout(
      [
        { label: 'F₁₂', value: F, unit: F >= 0 ? 'N (repulsión)' : 'N (atracción)' },
        { label: 'E(P)', value: eMag, unit: 'N/C' },
        { label: 'V(P)', value: this.potentialAt(p.x, p.y), unit: 'V' }
      ],
      'bottom-left',
      { decimals: 1 }
    );
    hud.legend(
      [
        { color: 'force', label: 'Carga positiva (+)' },
        { color: 'field', label: 'Carga negativa (−) · campo E' },
        { color: 'energy', label: 'Sonda P y E en P' }
      ],
      'top-right'
    );
    hud.text('Arrastra las cargas y la sonda P', 'bottom-right', { color: 'textDim', size: 11 });
  }

  /* ---------- manipulación directa ---------- */

  onDrag(id, world) {
    if (id === 'P') {
      this.probe.x = world.x;
      this.probe.y = world.y;
      return;
    }
    const c = this.charges.find((k) => k.id === id);
    if (!c) return;
    c.x = world.x;
    c.y = world.y;
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const p = this.probe;
    this.fieldAt(p.x, p.y, _e);
    const out = {
      'F₁₂ (Coulomb)': { value: roundTo(this.coulombForce(), 3), unit: 'N' },
      'E(P)': { value: roundTo(Math.hypot(_e.x, _e.y), 1), unit: 'N/C' },
      'V(P)': { value: roundTo(this.potentialAt(p.x, p.y), 1), unit: 'V' },
      'cargas': { value: this.charges.length, unit: '' }
    };
    for (const c of this.charges) {
      out[c.id] = { value: roundTo(c.q * 1e6, 2), unit: 'µC' };
    }
    return out;
  }

  getState() {
    return {
      t: this.t,
      params: { ...this.params },
      charges: this.charges.map((c) => ({ id: c.id, x: c.x, y: c.y, q: c.q })),
      probe: { x: this.probe.x, y: this.probe.y }
    };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Array.isArray(s.charges)) {
      this.charges = s.charges.map((c) => ({ id: c.id, x: c.x, y: c.y, q: c.q }));
    }
    if (s.probe) this.probe = { x: s.probe.x, y: s.probe.y };
    this._linesKey = '';
  }
}
