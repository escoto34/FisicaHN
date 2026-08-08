/**
 * @fileoverview Relatividad especial — factor γ, dilatación temporal,
 * contracción de longitud y relatividad de la simultaneidad (tanda 5.5).
 *
 * Unidades naturales: las velocidades se dan como β = v/c ∈ [0, 0.99) y las
 * longitudes/tiempos en unidades donde c = 1 (p. ej. "segundos-luz" para
 * distancia), así que las fórmulas se leen literalmente sin factores de
 * conversión: γ = 1/√(1−β²), Δt' = γΔt₀, L = L₀/γ.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

/** Periodo visual de un "tic" del reloj de luz en reposo, en segundos de la simulación. */
const T0 = 2;

/** Onda triangular en [0,1]: 0 → 1 → 0 por periodo, para el rebote del fotón. */
function triangle(t, period) {
  const u = (t % period) / period;
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

export default class SpecialRelativity extends SimModule {
  static viewport = { width: 20, height: 13 };

  // Sin mecanismo con posición propia: el diagrama vive centrado en el origen (§17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'modo',
      type: 'select',
      label: 'Efecto',
      value: 'dilatacion',
      options: [
        { value: 'dilatacion', label: 'Dilatación temporal' },
        { value: 'contraccion', label: 'Contracción de longitud' },
        { value: 'simultaneidad', label: 'Relatividad de la simultaneidad' }
      ]
    },
    { id: 'beta', label: 'Velocidad', latex: '\\beta = v/c', min: 0, max: 0.99, step: 0.01, value: 0.6 },
    { id: 'L0', label: 'Longitud propia', latex: 'L_0', unit: 'ls', min: 1, max: 8, step: 0.5, value: 4 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { modo: 'dilatacion', beta: 0.6, L0: 4 };
    this.t = 0;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: meta?.title || 'Relatividad especial',
      blurb: meta?.blurb || 'γ, dilatación temporal, contracción de longitud y simultaneidad.',
      story:
        'Einstein partió de un postulado incómodo: la luz viaja a c para todo observador, se mueva como se mueva. Para que eso sea posible, el tiempo y el espacio dejan de ser absolutos — un reloj que se mueve respecto a ti tiquetea más lento (dilatación), una regla que se mueve mide más corta (contracción), y dos sucesos simultáneos en un sistema no lo son en otro (simultaneidad). Los tres efectos son la misma transformación de Lorentz vista desde tres preguntas distintas.',
      cases: [
        'Muones cósmicos que sobreviven el viaje hasta el suelo gracias a su "reloj" dilatado.',
        'GPS: los satélites corrigen su reloj por dilatación temporal (relatividad especial y general).',
        'Aceleradores de partículas: a β cercano a 1, γ crece sin límite.'
      ]
    });
    setModuleFormulas(this.ui, {
      items: [
        { name: 'Factor de Lorentz', formula: '\\gamma = \\dfrac{1}{\\sqrt{1-\\beta^2}}', note: 'β = v/c.' },
        { name: 'Dilatación temporal', formula: '\\Delta t\'= \\gamma \\, \\Delta t_0', note: 'El reloj en movimiento tiquetea más lento, visto desde fuera.' },
        { name: 'Contracción de longitud', formula: 'L = L_0 / \\gamma', note: 'Sólo en la dirección del movimiento.' },
        { name: 'Simultaneidad', formula: '\\Delta t\' = \\gamma \\, \\beta \\, L_0 / c', note: 'Sucesos simultáneos en un sistema, no en otro.' }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.engine?.reset?.();
  }

  update(dt) {
    this.t += dt;
  }

  gamma() {
    const b = this.params.beta;
    return 1 / Math.sqrt(Math.max(1e-6, 1 - b * b));
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { modo } = this.params;
    if (modo === 'contraccion') this.drawContraction(scene);
    else if (modo === 'simultaneidad') this.drawSimultaneity(scene);
    else this.drawDilation(scene);

    scene.hud.readout(
      [
        { label: 'β', value: this.params.beta, unit: '' },
        { label: 'γ', value: roundTo(this.gamma(), 4), unit: '' }
      ],
      'top-right'
    );
  }

  drawDilation(scene) {
    const g = this.gamma();
    const H = 6;
    const restX = -5;
    const movX = 5;

    // Reloj en reposo: rebote a periodo T0.
    scene.line(restX - 1.5, H / 2, restX + 1.5, H / 2, { color: 'textDim', width: 3 });
    scene.line(restX - 1.5, -H / 2, restX + 1.5, -H / 2, { color: 'textDim', width: 3 });
    const yRest = -H / 2 + triangle(this.t, T0) * H;
    scene.body(restX, yRest, { shape: 'circle', r: 0.18, color: 'ray', glow: true });
    scene.label(restX, H / 2 + 0.7, 'Reloj en reposo', { color: 'textDim', size: 12 });

    // Reloj en movimiento: mismo mecanismo, pero tiquetea γ veces más lento
    // visto desde aquí — la diagonal punteada es el camino real de la luz.
    scene.line(movX - 1.5, H / 2, movX + 1.5, H / 2, { color: 'textDim', width: 3 });
    scene.line(movX - 1.5, -H / 2, movX + 1.5, -H / 2, { color: 'textDim', width: 3 });
    scene.line(movX, -H / 2, movX - 1.2, H / 2, { color: 'field', width: 1, dash: [3, 3], alpha: 0.5 });
    scene.line(movX, -H / 2, movX + 1.2, H / 2, { color: 'field', width: 1, dash: [3, 3], alpha: 0.5 });
    const yMov = -H / 2 + triangle(this.t / g, T0) * H;
    scene.body(movX, yMov, { shape: 'circle', r: 0.18, color: 'field', glow: true });
    scene.label(movX, H / 2 + 0.7, `En movimiento (β=${this.params.beta})`, { color: 'textDim', size: 12 });

    scene.hud.chip(`Δt' = γ·Δt₀ — el reloj móvil tiquetea ${roundTo(g, 2)}× más lento`, 'bottom-left', { color: 'field' });
  }

  drawContraction(scene) {
    const { L0 } = this.params;
    const g = this.gamma();
    const L = L0 / g;
    const scale = 1.4; // unidades de mundo por segundo-luz, sólo para que quepa

    scene.label(0, 3.5, `L₀ = ${L0} ls (en reposo)`, { color: 'textDim', size: 12 });
    scene.rect(0, 2, L0 * scale, 0.8, { color: 'mass', width: 2 });
    scene.dimension(-(L0 * scale) / 2, 1.2, (L0 * scale) / 2, 1.2, `${L0} ls`, { color: 'textDim' });

    scene.label(0, -1.2, `L = L₀/γ (en movimiento, β=${this.params.beta})`, { color: 'field', size: 12 });
    scene.rect(0, -2.5, L * scale, 0.8, { color: 'field', width: 2 });
    scene.dimension(-(L * scale) / 2, -3.3, (L * scale) / 2, -3.3, `${roundTo(L, 3)} ls`, { color: 'field' });

    scene.hud.chip(`L = L₀/γ = ${roundTo(L, 3)} ls`, 'bottom-left', { color: 'field' });
  }

  drawSimultaneity(scene) {
    const { L0, beta } = this.params;
    const g = this.gamma();
    // Sucesos simultáneos (Δt'=0) en el marco del tren, a x'=0 y x'=L0.
    // Transformación de Lorentz al marco del suelo: Δt = γβL0/c (c=1 aquí).
    const dtGround = g * beta * L0;
    const scale = 1.4;
    const half = (L0 * scale) / 2;

    scene.rect(0, 0, L0 * scale, 1.2, { color: 'mass', width: 2 });
    scene.body(-half, 0, { shape: 'circle', r: 0.2, color: 'ray', label: 'destello A' });
    scene.body(half, 0, { shape: 'circle', r: 0.2, color: 'ray', label: 'destello B' });
    scene.label(0, 1.2, `Tren: L₀ = ${L0} ls, β = ${beta}`, { color: 'textDim', size: 12, baseline: 'bottom', offsetY: -6 });

    const firstIsA = dtGround >= 0;
    scene.label(
      0,
      -2,
      `Para el andén: ${firstIsA ? 'A' : 'B'} ocurre primero, Δt = ${roundTo(Math.abs(dtGround), 3)} ls (=s con c=1)`,
      { color: 'energy', size: 12 }
    );
    scene.label(0, -3, 'En el tren, A y B son simultáneos (Δt\' = 0)', { color: 'textDim', size: 11 });

    scene.hud.chip(`Δt (andén) = γβL₀ = ${roundTo(dtGround, 3)} s`, 'bottom-left', { color: 'energy' });
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const { modo, beta, L0 } = this.params;
    const g = this.gamma();
    const out = {
      modo: { value: modo, unit: '' },
      beta: { value: beta, unit: '' },
      gamma: { value: roundTo(g, 4), unit: '' }
    };
    if (modo === 'contraccion') {
      out.L0 = { value: L0, unit: 'ls' };
      out.L = { value: roundTo(L0 / g, 4), unit: 'ls' };
    } else if (modo === 'simultaneidad') {
      out.L0 = { value: L0, unit: 'ls' };
      out['Δt (andén)'] = { value: roundTo(g * beta * L0, 4), unit: 's' };
    } else {
      out['ratio de tic'] = { value: roundTo(g, 4), unit: '' };
    }
    return out;
  }

  getState() {
    return { t: this.t, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (s.t != null) this.t = s.t;
  }
}
