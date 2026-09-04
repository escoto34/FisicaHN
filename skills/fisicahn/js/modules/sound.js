/**
 * @fileoverview Sonido — efecto Doppler (fuente móvil) e intensidad sonora con
 * escala de decibelios (tanda 5.3). Migrado al contrato nuevo en la tanda.
 *
 * Modo `doppler`: frentes circulares emitidos por una fuente que se mueve; el
 * observador fijo mide f′ = f·v/(v ∓ vₛ).
 *
 * Modo `intensidad`: fuente puntual de potencia P; la intensidad I = P/(4πr²)
 * cae con el cuadrado de la distancia y el decibelio β = 10·log₁₀(I/I₀) la
 * convierte en una escala lineal para el oído (I₀ = 10⁻¹² W/m²). El observador
 * se arrastra; a doble distancia −6 dB.
 */

import { SimModule } from '../core/sim-module.js';
import { TrailBuffer } from '../core/trail-buffer.js';
import { roundTo } from '../utils/math-helpers.js';

const I0 = 1e-12; // umbral de audición, W/m²

export default class SoundWaves extends SimModule {
  static viewport = { width: 24, height: 15 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Modo',
      value: 'doppler',
      options: [
        { value: 'doppler', label: 'Efecto Doppler' },
        { value: 'intensidad', label: 'Intensidad y dB' }
      ]
    },
    { id: 'tempC', label: 'Temperatura del aire', latex: 'T', unit: '°C', min: -10, max: 40, step: 1, value: 20 },
    { id: 'f', label: 'Frecuencia (demo)', latex: 'f', unit: 'Hz', min: 0.5, max: 5, step: 0.1, value: 2 },
    { id: 'vSource', label: 'Velocidad de la fuente', latex: 'v_s', unit: 'm/s', min: -6, max: 6, step: 0.2, value: 2 },
    { id: 'P', label: 'Potencia de la fuente', latex: 'P', unit: 'mW', min: 0.1, max: 5000, step: 10, value: 100 },
    { id: 'r', label: 'Distancia', latex: 'r', unit: 'm', min: 0.2, max: 14, step: 0.1, value: 1 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = {
      modo: 'doppler',
      tempC: 20,
      f: 2,
      vSource: 2,
      P: 100,
      r: 1
    };
    this.t = 0;
    this.sourceX = -8;
    /** Frentes emitidos: anillo de 40 (el más antiguo se descarta sin `shift()`). */
    this.waves = new TrailBuffer(40);
  }

  init(meta = null) {
    this.reset();
    this.setModuleInfo({
      title: 'Sonido y ondas',
      blurb: 'Efecto Doppler con frentes móviles e intensidad sonora en decibelios.',
      story:
        'El sonido es una onda mecánica longitudinal. Cuando la fuente se mueve, los frentes se comprimen delante (tono más agudo) y se estiran detrás: es la sirena de la ambulancia. Y además de tono, el sonido tiene volumen: la potencia de la fuente se reparte en esferas cada vez más grandes, por eso la intensidad cae como 1/r² y el oído comprime esa caída en una escala logarítmica, el decibelio.',
      cases: [
        'La sirena se acerca: f′ > f; al alejarse, f′ < f.',
        'Arrastrar el observador en el modo intensidad: al doblar la distancia se pierden 6 dB.',
        'v del sonido crece con la temperatura del aire.',
        'Pasar de 1 mW a 1000 mW (×1000) son +30 dB: de susurro a taladro.'
      ]
    });
    this.setModuleFormulas({
      title: 'Sonido',
      items: [
        {
          name: 'Velocidad de onda',
          formula: 'v = f \\cdot \\lambda',
          note: 'La energía viaja con la onda a velocidad v.'
        },
        {
          name: 'Doppler (fuente móvil)',
          formula: "f' = f \\cdot \\frac{v}{v \\mp v_s}",
          note: 'Menos si se acerca, más si se aleja.'
        },
        {
          name: 'v en aire (aprox.)',
          formula: 'v \\approx 331 + 0{,}6\\,T(°C)',
          note: 'm/s a nivel del mar.'
        },
        {
          name: 'Intensidad',
          formula: 'I = \\dfrac{P}{4\\pi r^2}',
          note: 'La potencia se reparte en la esfera 4πr².'
        },
        {
          name: 'Escala de decibelios',
          formula: '\\beta = 10\\log_{10}\\left(\\dfrac{I}{I_0}\\right)',
          note: 'I₀ = 10⁻¹² W/m² (umbral de audición). Doblar r resta ~6 dB.'
        }
      ]
    });
    this.clearChallenges();
  }

  reset() {
    this.t = 0;
    this.sourceX = -8;
    this.waves.clear();
    this.engine?.reset?.();
  }

  update(dt) {
    this.t += dt;
    if (this.params.modo !== 'doppler') return;

    this.sourceX += this.params.vSource * dt;
    if (this.sourceX > 12) this.sourceX = -10;
    if (this.sourceX < -12) this.sourceX = 10;

    const period = 1 / Math.max(this.params.f, 0.1);
    if (this.waves.length === 0 || this.t - this.waves.last().born >= period) {
      this.waves.push({ x: this.sourceX, born: this.t, r: 0 });
    }

    const v = this.soundSpeed();
    this.waves.forEach((w) => {
      w.r = (this.t - w.born) * v * 0.15;
    });
  }

  soundSpeed() {
    return 331 + 0.6 * this.params.tempC;
  }

  observedF() {
    const v = this.soundSpeed();
    const vs = this.params.vSource;
    const den = v - vs;
    if (Math.abs(den) < 1e-6) return Infinity;
    return (this.params.f * v) / den;
  }

  /** Intensidad en W/m² a la distancia actual (modo intensidad). */
  intensity() {
    const Pw = this.params.P * 1e-3;
    return Pw / (4 * Math.PI * this.params.r * this.params.r);
  }

  dBAt(r) {
    const Pw = this.params.P * 1e-3;
    return 10 * Math.log10((Pw / (4 * Math.PI * r * r)) / I0);
  }

  /* ---------- interacción directa (§2.6) ---------- */

  onPickStart(id) {
    this.dragging = id;
  }

  onDrag(id, world) {
    if (id !== 'obs' || this.params.modo !== 'intensidad') return;
    this.params.r = Math.max(0.2, Math.min(14, Math.abs(world.x)));
  }

  onDragEnd() {
    this.dragging = null;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    if (this.params.modo === 'doppler') this._drawDoppler(scene);
    else this._drawIntensidad(scene);
  }

  _drawDoppler(scene) {
    // Frentes emitidos por la fuente en movimiento.
    this.waves.forEach((w) => scene.wavefront(w.x, 0, w.r, { color: 'field', maxR: 16 }));
    scene.body(this.sourceX, 0, { shape: 'triangle', r: 0.5, color: 'force', label: 'fuente', labelColor: 'force' });
    scene.body(6, 0, { shape: 'circle', r: 0.4, color: 'mass', label: 'observador', labelColor: 'mass' });

    scene.hud.chip('Fuente móvil: frentes comprimidos delante', 'top-left');
    scene.hud.readout(
      [
        { label: 'v sonido', value: roundTo(this.soundSpeed(), 1), unit: 'm/s' },
        { label: 'f fuente', value: roundTo(this.params.f, 2), unit: 'Hz' },
        { label: 'v fuente', value: roundTo(this.params.vSource, 1), unit: 'm/s' },
        { label: 'f observada', value: roundTo(this.observedF(), 3), unit: 'Hz' }
      ],
      'bottom-left'
    );
  }

  _drawIntensidad(scene) {
    const r = this.params.r;
    const beta = this.dBAt(r);
    const I = this.intensity();

    // Esferas concéntricas: el frente se reparte en la superficie 4πr².
    for (let k = 1; k <= 6; k++) {
      scene.wavefront(0, 0, k, { color: 'field', maxR: 7, alpha: 0.5 });
    }
    scene.body(0, 0, { shape: 'circle', r: 0.35, color: 'force', label: 'fuente', labelColor: 'force' });

    // Observador arrastrable: el punto vivo de la gráfica.
    scene.body(r, 0, { shape: 'circle', r: 0.3, color: 'mass', id: 'obs' });
    scene.label(r, 0.62, `${roundTo(beta, 1)} dB`, { color: 'mass' });

    // Referencia del −6 dB: doble de distancia.
    if (2 * r <= 14) {
      scene.wavefront(0, 0, 2 * r, { color: 'energy', maxR: 30, dash: [4, 4], alpha: 0.7 });
      scene.label(2 * r, 0.6, `${roundTo(this.dBAt(2 * r), 1)} dB`, { color: 'energy' });
    }

    scene.hud.chip(`I = P/(4πr²) = ${roundTo(I, 3)} W/m²`, 'top-left');
    scene.hud.readout(
      [
        { label: 'P', value: roundTo(this.params.P, 0), unit: 'mW' },
        { label: 'r', value: roundTo(r, 2), unit: 'm' },
        { label: 'β', value: roundTo(beta, 1), unit: 'dB' },
        { label: 'β a 2r', value: roundTo(this.dBAt(2 * r), 1), unit: 'dB' }
      ],
      'bottom-left'
    );

    // Curva I(r) ∝ 1/r² con el punto vivo.
    const vp = scene.viewport();
    if (vp.w > 430) {
      const rmax = 14;
      const Pw = this.params.P * 1e-3;
      scene.hud.plot(
        { x: vp.x + vp.w - 250, y: vp.y + vp.h - 128, w: 235, h: 116 },
        {
          title: 'Intensidad I(r) ∝ 1/r²',
          series: [{ fn: (rr) => Pw / (4 * Math.PI * rr * rr), samples: 60, color: 'mass', label: 'I' }],
          xRange: [0.3, rmax],
          yRange: [0, (this.params.P * 1e-3) / (4 * Math.PI * 0.3 * 0.3) * 1.1],
          xLabel: 'r (m)',
          yLabel: 'W/m²'
        }
      );
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    if (this.params.modo === 'intensidad') {
      return {
        'I': { value: roundTo(this.intensity(), 4), unit: 'W/m²' },
        'β': { value: roundTo(this.dBAt(this.params.r), 1), unit: 'dB' },
        'β a 2r': { value: roundTo(this.dBAt(2 * this.params.r), 1), unit: 'dB' }
      };
    }
    return {
      'v sonido': { value: roundTo(this.soundSpeed(), 1), unit: 'm/s' },
      'f fuente': { value: roundTo(this.params.f, 2), unit: 'Hz' },
      'f observada': { value: roundTo(this.observedF(), 3), unit: 'Hz' }
    };
  }

  getState() {
    return { t: this.t, sourceX: this.sourceX, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
    if (Number.isFinite(s.sourceX)) this.sourceX = s.sourceX;
    this.waves.clear();
  }

  destroy() {
    this.waves.clear();
  }
}
