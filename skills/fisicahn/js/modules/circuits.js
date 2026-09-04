/**
 * @fileoverview Circuitos DC / AC: serie, paralelo, RLC forzado y RC
 * (carga/descarga con dieléctricos) — tanda 5.4.
 *
 * Migrado al contrato nuevo (`SimModule` + `draw(scene)` + `readout()`), lo
 * que activa el enlace profundo de los modos del catálogo (antes inactivo).
 *
 * Modos:
 *  - `series` / `parallel`: Ohm y Kirchhoff; la corriente animada se dibuja
 *    como puntos en movimiento proporcionales a |I|.
 *  - `rlc`: Z = √(R² + (X_L − X_C)²), resonancia f₀ = 1/(2π√(LC)), i(t).
 *  - `rc`: carga V_c = V(1 − e^(−t/τ)) y descarga V_c = V·e^(−t/τ), con
 *    τ = R·C y C efectiva por el dieléctrico C = κ·C₀ (papel, vidrio, mica).
 *
 * Ejercita `line`, `body`, `vector`, `label`, `plot`, `chip`, `readout`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';

const DIELECTRICS = {
  aire: { k: 1, label: 'Aire' },
  papel: { k: 3.5, label: 'Papel' },
  vidrio: { k: 6, label: 'Vidrio' },
  mica: { k: 7, label: 'Mica' }
};

export default class Circuits extends SimModule {
  static viewport = { width: 24, height: 15 };

  static params = [
    {
      id: 'mode',
      type: 'select',
      label: 'Modo',
      value: 'series',
      options: [
        { value: 'series', label: 'DC serie' },
        { value: 'parallel', label: 'DC paralelo' },
        { value: 'rlc', label: 'AC RLC serie' },
        { value: 'rc', label: 'RC carga/descarga' }
      ]
    },
    { id: 'V', label: 'Tensión DC', latex: 'V', unit: 'V', min: 1, max: 24, step: 0.5, value: 12 },
    { id: 'R1', label: 'R₁', latex: 'R_1', unit: 'Ω', min: 10, max: 500, step: 5, value: 100 },
    { id: 'R2', label: 'R₂', latex: 'R_2', unit: 'Ω', min: 10, max: 500, step: 5, value: 200 },
    { id: 'R', label: 'R (RLC/RC)', latex: 'R', unit: 'Ω', min: 5, max: 200, step: 1, value: 40 },
    { id: 'L', label: 'Inductancia', latex: 'L', unit: 'H', min: 0.05, max: 2, step: 0.05, value: 0.5 },
    { id: 'C', label: 'Capacidad', latex: 'C', unit: 'µF', min: 10, max: 1000, step: 10, value: 200 },
    { id: 'f', label: 'Frecuencia AC', latex: 'f', unit: 'Hz', min: 10, max: 200, step: 1, value: 50 },
    { id: 'Vac', label: 'V pico AC', latex: 'V_{pk}', unit: 'V', min: 1, max: 20, step: 0.5, value: 10 },
    {
      id: 'accion',
      type: 'select',
      label: 'Acción RC',
      value: 'carga',
      options: [
        { value: 'carga', label: 'Cargar (conecta la fuente)' },
        { value: 'descarga', label: 'Descargar (sin fuente)' }
      ]
    },
    {
      id: 'diel',
      type: 'select',
      label: 'Dieléctrico',
      value: 'aire',
      options: Object.entries(DIELECTRICS).map(([v, d]) => ({ value: v, label: d.label }))
    }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      mode: 'series',
      V: 12,
      R1: 100,
      R2: 200,
      R: 40,
      L: 0.5,
      C: 200,
      f: 50,
      Vac: 10,
      accion: 'carga',
      diel: 'aire'
    };
    this.t = 0;
    this.q = 0;
    this.i = 0;
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: 'Circuitos DC / AC',
      blurb: 'Serie/paralelo (Ohm), impedancia RLC con resonancia y RC con dieléctricos.',
      story:
        'Ohm y Kirchhoff rigen los circuitos de corriente. En AC, la bobina y el condensador se oponen con reactancias, y en la resonancia se cancelan (por eso "se sintoniza" la radio con un LC). Y el condensador no se carga de golpe: obedece una exponencial V_c = V(1 − e^(−t/τ)) con τ = R·C, el tiempo en que sube el 63 % — un dieléctrico dentro multiplica la capacidad por κ.',
      cases: [
        'Divisor de tensión: en serie la V se reparte según R₁:R₂.',
        'En paralelo todas las ramas ven la misma V: las bombillas de casa.',
        'RLC: en f₀ la impedancia es mínima (Z = R) y la corriente es máxima.',
        'RC: a t = τ el condensador está al 63.2 %; a 5τ, casi lleno.'
      ]
    });
    this.setModuleFormulas({
      title: 'Circuitos DC / AC',
      items: [
        { name: 'Ley de Ohm', formula: 'V = I R' },
        { name: 'Serie', formula: 'R_{eq} = R_1 + R_2' },
        { name: 'Paralelo', formula: '\\dfrac{1}{R_{eq}} = \\dfrac{1}{R_1} + \\dfrac{1}{R_2}' },
        { name: 'Impedancia RLC serie', formula: 'Z = \\sqrt{R^2 + (X_L - X_C)^2}' },
        { name: 'Resonancia', formula: 'f_0 = \\dfrac{1}{2\\pi \\sqrt{LC}}' },
        {
          name: 'Carga del condensador',
          formula: 'V_c = V\\,(1 - e^{-t/\\tau}) \\quad \\tau = R C'
        },
        { name: 'Descarga', formula: 'V_c = V\\,e^{-t/\\tau}' },
        { name: 'Capacidad con dieléctrico', formula: 'C = \\kappa C_0' }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.q = 0;
    this.i = 0;
    if (this.params.mode === 'rc' && this.params.accion === 'descarga') {
      this.q = this.cEff() * this.params.V;
    }
    this.engine?.reset?.();
  }

  update(dt) {
    this.t += dt;
    if (this.params.mode === 'rlc') {
      const { w, I0, phi } = this.rlcZ();
      this.i = I0 * Math.sin(w * this.t - phi);
      this.q += this.i * dt;
      return;
    }
    if (this.params.mode === 'rc') {
      const C = this.cEff();
      const tau = this.params.R * C;
      if (this.params.accion === 'carga') {
        this.q += ((this.params.V * C - this.q) * dt) / tau;
      } else {
        this.q -= (this.q * dt) / tau;
      }
      const vc = this.q / Math.max(C, 1e-15);
      this.i = this.params.accion === 'carga' ? (this.params.V - vc) / this.params.R : -vc / this.params.R;
      return;
    }
    this.i = this.dcResults().I;
  }

  /* ---------- solvers ---------- */

  cFarad() {
    return this.params.C * 1e-6;
  }

  cEff() {
    return this.cFarad() * DIELECTRICS[this.params.diel].k;
  }

  dcResults() {
    if (this.params.mode === 'series') {
      const Req = this.params.R1 + this.params.R2;
      const I = this.params.V / Req;
      return {
        Req,
        I,
        V1: I * this.params.R1,
        V2: I * this.params.R2,
        I1: I,
        I2: I,
        P: this.params.V * I
      };
    }
    const Req = 1 / (1 / this.params.R1 + 1 / this.params.R2);
    const I1 = this.params.V / this.params.R1;
    const I2 = this.params.V / this.params.R2;
    return {
      Req,
      I: I1 + I2,
      I1,
      I2,
      V1: this.params.V,
      V2: this.params.V,
      P: this.params.V * (I1 + I2)
    };
  }

  rlcZ() {
    const w = 2 * Math.PI * this.params.f;
    const XL = w * this.params.L;
    const XC = 1 / (w * Math.max(this.cFarad(), 1e-15));
    const Z = Math.hypot(this.params.R, XL - XC);
    const I0 = this.params.Vac / Math.max(Z, 1e-9);
    const phi = Math.atan2(XL - XC, this.params.R);
    const f0 = 1 / (2 * Math.PI * Math.sqrt(this.params.L * this.cFarad()));
    return { w, XL, XC, Z, I0, phi, f0 };
  }

  rcTau() {
    return this.params.R * this.cEff();
  }

  /** V_c analítico en el instante actual. */
  vcAnalytic() {
    const V = this.params.V;
    const tau = this.rcTau();
    return this.params.accion === 'carga'
      ? V * (1 - Math.exp(-this.t / tau))
      : V * Math.exp(-this.t / tau);
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    if (this.params.mode === 'rlc') this._drawRlc(scene);
    else if (this.params.mode === 'rc') this._drawRc(scene);
    else this._drawDc(scene);
  }

  /** Puntos de corriente animados a lo largo de un tramo (proporcionales a |I|). */
  _flow(scene, x0, y0, x1, y1, amps, color) {
    scene.flow(x0, y0, x1, y1, { amps, color, t: this.t });
  }

  _wire(scene, x0, y0, x1, y1) {
    scene.line(x0, y0, x1, y1, { color: 'textDim', width: 2 });
  }

  _drawDc(scene) {
    const res = this.dcResults();
    const I = res.I;
    const isSeries = this.params.mode === 'series';

    // Lazo base.
    this._wire(scene, -3, 2, 3, 2);
    this._wire(scene, 3, 2, 3, -2);
    this._wire(scene, 3, -2, -3, -2);
    this._wire(scene, -3, -2, -3, 2);
    scene.body(-3, 0, { shape: 'rect', w: 1.1, h: 0.55, color: 'energy', label: `${this.params.V} V` });

    if (isSeries) {
      scene.body(0, 2, { shape: 'rect', w: 1, h: 0.5, color: 'force', label: 'R₁' });
      scene.body(0, -2, { shape: 'rect', w: 1, h: 0.5, color: 'energy', label: 'R₂' });
      this._flow(scene, -2.4, 2, 2.4, 2, I, '#ffee58');
      this._flow(scene, 3, 1.5, 3, -1.5, I, '#ffee58');
      this._flow(scene, 2.4, -2, -2.4, -2, I, '#ffee58');
      this._flow(scene, -3, -1.5, -3, 1.5, I, '#ffee58');
      scene.label(0, 3.35, `R₁ · V₁ = ${roundTo(res.V1, 2)} V`, { color: 'force' });
      scene.label(0, -3.35, `R₂ · V₂ = ${roundTo(res.V2, 2)} V`, { color: 'energy' });
      scene.label(0, 0.15, `I = ${fmtI(I)} (misma en serie)`, { color: 'mass' });
    } else {
      this._wire(scene, -0.8, 2, -0.8, -2);
      this._wire(scene, 0.8, 2, 0.8, -2);
      scene.body(-0.8, 0, { shape: 'rect', w: 0.9, h: 0.45, color: 'force', label: 'R₁' });
      scene.body(0.8, 0, { shape: 'rect', w: 0.9, h: 0.45, color: 'energy', label: 'R₂' });
      this._flow(scene, -3, 1.4, -3, -1.4, I, '#ffee58');
      this._flow(scene, -2.6, 2, -1.1, 2, I, '#ffee58');
      this._flow(scene, 1.1, 2, 2.6, 2, I, '#ffee58');
      this._flow(scene, 3, 1.4, 3, -1.4, I, '#ffee58');
      this._flow(scene, 2.6, -2, 1.1, -2, I, '#ffee58');
      this._flow(scene, -1.1, -2, -2.6, -2, I, '#ffee58');
      this._flow(scene, -0.8, 1.6, -0.8, -1.6, res.I1, '#ef5350');
      this._flow(scene, 0.8, 1.6, 0.8, -1.6, res.I2, '#ffb74d');
      scene.label(-0.8, 2.7, `I₁ = ${fmtI(res.I1)}`, { color: 'force' });
      scene.label(0.8, 2.7, `I₂ = ${fmtI(res.I2)}`, { color: 'energy' });
      scene.label(0, -3.4, `I_total = I₁ + I₂ = ${fmtI(I)}`, { color: 'mass' });
    }

    scene.hud.chip(
      `DC ${isSeries ? 'serie' : 'paralelo'} · R_eq = ${roundTo(res.Req, 2)} Ω`,
      'top-left'
    );
    scene.hud.readout(
      [
        { label: 'V', value: roundTo(this.params.V, 1), unit: 'V' },
        { label: 'I', value: Number(roundTo(res.I, 5)), unit: 'A' },
        { label: 'Req', value: roundTo(res.Req, 2), unit: 'Ω' },
        { label: 'P', value: roundTo(res.P, 3), unit: 'W' }
      ],
      'bottom-left'
    );
  }

  _drawRlc(scene) {
    const z = this.rlcZ();
    this._wire(scene, -4, 2, 4, 2);
    this._wire(scene, 4, 2, 4, -2);
    this._wire(scene, 4, -2, -4, -2);
    this._wire(scene, -4, -2, -4, 2);
    scene.body(-2, 2, { shape: 'rect', w: 1, h: 0.5, color: 'force', label: 'R' });
    scene.body(0, 2, { shape: 'rect', w: 1, h: 0.5, color: 'mass', label: 'L' });
    scene.body(2, 2, { shape: 'rect', w: 1, h: 0.5, color: 'energy', label: 'C' });
    scene.body(-4, 0, { shape: 'circle', r: 0.45, color: 'spring', label: '~V' });

    this._flow(scene, -3.5, 2, 3.5, 2, this.i, '#ce93d8');
    this._flow(scene, 4, 1.5, 4, -1.5, this.i, '#ce93d8');
    this._flow(scene, 3.5, -2, -3.5, -2, this.i, '#ce93d8');
    this._flow(scene, -4, -1.5, -4, 1.5, this.i, '#ce93d8');

    // i(t) en el tiempo reciente.
    const vp = scene.viewport();
    if (vp.w > 430) {
      // Serie analítica muestreada por `plot` (sin array de puntos por frame).
      scene.hud.plot(
        { x: vp.x + vp.w - 280, y: vp.y + vp.h - 128, w: 270, h: 118 },
        {
          title: `i(t) · I₀ = ${fmtI(z.I0)}`,
          series: [{ fn: (tt) => z.I0 * Math.sin(z.w * tt - z.phi), samples: 120, color: 'energy', width: 2 }],
          xRange: [this.t - 0.8, this.t],
          yRange: [-z.I0 * 1.3, z.I0 * 1.3],
          xLabel: 't (s)',
          yLabel: 'A'
        }
      );
    }

    scene.hud.chip(
      `f₀ = ${roundTo(z.f0, 1)} Hz · Z = ${roundTo(z.Z, 2)} Ω` +
        (Math.abs(z.XL - z.XC) < 1e-6 ? ' · ¡resonancia!' : ''),
      'top-left'
    );
    scene.hud.readout(
      [
        { label: 'f', value: roundTo(this.params.f, 1), unit: 'Hz' },
        { label: 'X_L', value: roundTo(z.XL, 2), unit: 'Ω' },
        { label: 'X_C', value: roundTo(z.XC, 2), unit: 'Ω' },
        { label: 'Z', value: roundTo(z.Z, 2), unit: 'Ω' },
        { label: 'I₀', value: Number(roundTo(z.I0, 5)), unit: 'A' }
      ],
      'bottom-left'
    );
  }

  _drawRc(scene) {
    const C = this.cEff();
    const tau = this.rcTau();
    const vc = this.q / Math.max(C, 1e-15);
    const V = this.params.V;
    const cargando = this.params.accion === 'carga';

    this._wire(scene, -4.4, 2, 4.4, 2);
    this._wire(scene, 4.4, 2, 4.4, -2);
    this._wire(scene, 4.4, -2, -4.4, -2);
    this._wire(scene, -4.4, -2, -4.4, 2);
    if (cargando) {
      scene.body(-4.4, 0, { shape: 'circle', r: 0.45, color: 'energy', label: `${V} V` });
    } else {
      scene.body(-4.4, 0, { shape: 'circle', r: 0.45, color: 'textDim', label: 'corto' });
    }
    scene.body(-2.2, 2, { shape: 'rect', w: 1, h: 0.5, color: 'force', label: 'R' });
    scene.body(2.2, 2, { shape: 'rect', w: 1, h: 0.5, color: 'spring', label: `C (${DIELECTRICS[this.params.diel].label})` });

    // Condensador real (dos placas paralelas) en la rama derecha.
    scene.line(4.4, -0.3, 4.4, 0.3, { color: 'spring', width: 3 });
    scene.line(4.0, -0.3, 4.0, 0.3, { color: 'spring', width: 3 });

    this._flow(scene, -3.8, 2, 3.8, 2, this.i, '#ffee58');
    this._flow(scene, 4.4, 1.5, 4.4, -1.5, this.i, '#ffee58');
    this._flow(scene, 3.8, -2, -3.8, -2, this.i, '#ffee58');
    this._flow(scene, -4.4, -1.5, -4.4, 1.5, this.i, '#ffee58');

    scene.label(0, 2.9, `τ = RC = ${roundTo(tau, 3)} s`, { color: 'force' });
    scene.label(0, 3.6, `${cargando ? 'cargando' : 'descargando'} · κ = ${DIELECTRICS[this.params.diel].k}`, {
      color: 'textDim',
      size: 11
    });
    scene.label(0, -2.85, `V_c = ${roundTo(vc, 2)} V (${roundTo((vc / V) * 100, 1)} % del máximo)`, {
      color: 'spring'
    });

    // V_c(t) analítica con el estado actual marcado.
    const vp = scene.viewport();
    if (vp.w > 430) {
      const tMax = Math.max(this.t + 0.05, 6 * tau + 0.05);
      const vcOf = cargando ? (tt) => V * (1 - Math.exp(-tt / tau)) : (tt) => V * Math.exp(-tt / tau);
      const dot = {
        points: [{ x: this.t - 0.6, y: 0 }, { x: this.t + 0.6, y: 0 }],
        color: 'energy',
        width: 1
      };
      const horiz = {
        points: [{ x: this.t, y: 0 }, { x: this.t, y: vc }],
        color: 'energy',
        width: 2
      };
      scene.hud.plot(
        { x: vp.x + vp.w - 280, y: vp.y + vp.h - 128, w: 270, h: 118 },
        {
          title: `V_c(t) = ${cargando ? 'V(1−e^(−t/τ))' : 'V·e^(−t/τ)'}`,
          series: [
            { fn: vcOf, samples: 140, color: 'spring', width: 2 },
            dot,
            horiz
          ],
          xRange: [0, tMax],
          yRange: [0, V * 1.1],
          xLabel: 't (s)',
          yLabel: 'V'
        }
      );
      scene.body(this.t, 0, { shape: 'circle', r: 0.05, color: 'textDim' });
      scene.hud.chip(`t = ${roundTo(this.t, 1)} s → ${roundTo((vc / V) * 100, 1)} %`, 'top-left');
    } else {
      scene.hud.chip(`RC: τ = ${roundTo(tau, 3)} s`, 'top-left');
    }

    scene.hud.readout(
      [
        { label: 'τ = RC', value: roundTo(tau, 3), unit: 's' },
        { label: 'V_c', value: roundTo(vc, 2), unit: 'V' },
        { label: 'V_c (anál.)', value: roundTo(this.vcAnalytic(), 2), unit: 'V' },
        { label: 'I', value: Number(roundTo(this.i, 5)), unit: 'A' }
      ],
      'bottom-left'
    );
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    if (this.params.mode === 'rc') {
      const vc = this.q / Math.max(this.cEff(), 1e-15);
      return {
        'τ': { value: roundTo(this.rcTau(), 3), unit: 's' },
        'V_c': { value: roundTo(vc, 2), unit: 'V' },
        'V_c analítico': { value: roundTo(this.vcAnalytic(), 2), unit: 'V' },
        'I': { value: Number(roundTo(this.i, 5)), unit: 'A' },
        'C (κ)': { value: Number(roundTo(this.cEff() * 1e6, 2)), unit: 'µF' }
      };
    }
    if (this.params.mode === 'rlc') {
      const z = this.rlcZ();
      return {
        'f₀': { value: roundTo(z.f0, 2), unit: 'Hz' },
        'X_L': { value: roundTo(z.XL, 2), unit: 'Ω' },
        'X_C': { value: roundTo(z.XC, 2), unit: 'Ω' },
        'Z': { value: roundTo(z.Z, 2), unit: 'Ω' },
        'I₀': { value: Number(roundTo(z.I0, 5)), unit: 'A' }
      };
    }
    const res = this.dcResults();
    return {
      'I': { value: Number(roundTo(res.I, 5)), unit: 'A' },
      'Req': { value: roundTo(res.Req, 2), unit: 'Ω' },
      'V₁': { value: roundTo(res.V1, 3), unit: 'V' },
      'V₂': { value: roundTo(res.V2, 3), unit: 'V' },
      'P': { value: roundTo(res.P, 3), unit: 'W' }
    };
  }

  getState() {
    return { t: this.t, q: this.q, i: this.i, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.q)) this.q = s.q;
    if (Number.isFinite(s.i)) this.i = s.i;
  }

  destroy() {}
}

/** Formato de corriente legible (mA si es pequeña). */
function fmtI(amps) {
  const a = Number(amps) || 0;
  if (Math.abs(a) < 0.001) return `${roundTo(a * 1e6, 1)} µA`;
  if (Math.abs(a) < 1) return `${roundTo(a * 1000, 2)} mA`;
  return `${roundTo(a, 4)} A`;
}