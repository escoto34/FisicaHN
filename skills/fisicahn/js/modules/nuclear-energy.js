/**
 * @fileoverview Fisión, fusión y E = mc² (tanda 5.5).
 *
 * Curva de energía de enlace por nucleón BE(A)/A vía la fórmula semi-empírica
 * de masa (Weizsäcker, términos de volumen/superficie/Coulomb/asimetría; se
 * omite el de apareamiento por simplicidad pedagógica) — no es una curva de
 * juguete, reproduce el pico real cerca de A ≈ 60 (~8,7 MeV/nucleón, el
 * hierro real pica en 8,8). La energía liberada en una reacción es
 * exactamente la diferencia de energía de enlace entre productos y
 * reactivos: ΔE = Δ(BE) = Δm·c² — la fórmula de Einstein no es un cálculo
 * aparte, es la misma cuenta.
 *
 * Diseño: **un solo deslizador `A`** describe ambos procesos, porque son
 * simétricos: partir A en dos mitades A/2 libera energía si A está a la
 * derecha del pico (fisión); juntar dos mitades A/2 en A libera energía si A
 * está a la izquierda del pico (fusión). `ΔE_fisión(A) = −ΔE_fusión(A)`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

/** Coeficientes de Weizsäcker en MeV (sin término de apareamiento). */
const A_VOL = 15.8;
const A_SURF = 18.3;
const A_COUL = 0.714;
const A_ASYM = 23.2;
const A_MIN = 4;
const A_MAX = 260;

/** Z de la línea de estabilidad, aproximación estándar en función de A. */
function stableZ(A) {
  return A / (2 + 0.015 * Math.pow(A, 2 / 3));
}

/** Energía de enlace total (MeV) de un núcleo A, Z ≈ estable(A). */
function bindingTotal(A) {
  if (A < 2) return 0;
  const Z = stableZ(A);
  const vol = A_VOL * A;
  const surf = A_SURF * Math.pow(A, 2 / 3);
  const coul = (A_COUL * Z * (Z - 1)) / Math.pow(A, 1 / 3);
  const asym = (A_ASYM * Math.pow(A - 2 * Z, 2)) / A;
  return Math.max(0, vol - surf - coul - asym);
}

/** Energía de enlace por nucleón (MeV), la magnitud que dibuja la curva clásica. */
function bindingPerNucleon(A) {
  return A > 0 ? bindingTotal(A) / A : 0;
}

export default class NuclearEnergy extends SimModule {
  static viewport = { width: 22, height: 14 };

  // No hay mecanismo físico con posición: el marcador vive en el origen (§17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'proceso',
      type: 'select',
      label: 'Proceso',
      value: 'fision',
      options: [
        { value: 'fision', label: 'Fisión (A → 2×A/2)' },
        { value: 'fusion', label: 'Fusión (2×A/2 → A)' }
      ]
    },
    { id: 'A', label: 'Número másico A', latex: 'A', min: A_MIN, max: A_MAX, step: 1, value: 236 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { proceso: 'fision', A: 236 };
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: meta?.title || 'Fisión, fusión y E = mc²',
      blurb: meta?.blurb || 'Curva de energía de enlace por nucleón: por qué fisión y fusión liberan energía.',
      story:
        'Cada núcleo pesa un poco menos que la suma de sus protones y neutrones sueltos: esa masa faltante, convertida con E = mc², es la energía de enlace que lo mantiene unido. La curva de energía de enlace por nucleón tiene un pico cerca del hierro (A ≈ 60): los núcleos muy pesados ganan energía al partirse (fisión) y los muy ligeros ganan energía al fundirse (fusión), porque ambos caminos suben hacia el pico.',
      cases: [
        'Reactor nuclear y bomba atómica: fisión de uranio-235 o plutonio-239.',
        'El Sol y las estrellas: fusión de hidrógeno en helio.',
        'Por qué el hierro no sirve como combustible nuclear: ya está en el pico.'
      ]
    });
    setModuleFormulas(this.ui, {
      items: [
        { name: 'Einstein', formula: 'E = m c^2', note: 'La masa que falta en el núcleo es energía de enlace.' },
        { name: 'Energía de enlace', formula: 'BE(A) = \\Delta m \\, c^2', note: 'Fórmula semi-empírica de Weizsäcker.' },
        {
          name: 'Energía liberada',
          formula: '\\Delta E = BE_{\\text{productos}} - BE_{\\text{reactivos}}',
          note: 'Positiva cuando el proceso es favorable.'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.engine?.reset?.();
  }

  /** Z aproximada del núcleo A actual, por la línea de estabilidad. */
  Z() {
    return stableZ(this.params.A);
  }

  /** ΔE (MeV) liberada por el proceso elegido — positiva si es favorable. */
  reactionEnergy() {
    const { A, proceso } = this.params;
    const beA = bindingTotal(A);
    const beHalves = 2 * bindingTotal(A / 2);
    return proceso === 'fision' ? beHalves - beA : beA - beHalves;
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  worldX(A) {
    return -10 + (A / A_MAX) * 20;
  }

  worldY(beA) {
    return -5 + (Math.min(beA, 9) / 9) * 9;
  }

  draw(scene) {
    const { A, proceso } = this.params;

    // Curva BE/A(A): el "mapa" del que salen fisión y fusión.
    const pts = [];
    for (let a = A_MIN; a <= A_MAX; a += 4) {
      pts.push({ x: this.worldX(a), y: this.worldY(bindingPerNucleon(a)) });
    }
    scene.polyline(pts, { color: 'energy', width: 2.5 });
    scene.line(-10, -5, 10, -5, { color: 'textDim', width: 1 });
    scene.label(0, -5.4, 'A (número másico) →', { color: 'textDim', size: 11 });

    // Marcador del núcleo A y de las dos mitades A/2.
    const half = A / 2;
    const xA = this.worldX(A);
    const yA = this.worldY(bindingPerNucleon(A));
    const xHalf = this.worldX(half);
    const yHalf = this.worldY(bindingPerNucleon(half));

    scene.body(xA, yA, { shape: 'circle', r: 0.28, color: 'mass', label: `A=${A}`, avoidLabel: true });
    scene.body(xHalf, yHalf, { shape: 'circle', r: 0.22, color: 'field', label: `A/2=${roundTo(half, 0)}`, avoidLabel: true });

    const dE = this.reactionEnergy();
    const favorable = dE > 0;
    const from = proceso === 'fision' ? { x: xA, y: yA } : { x: xHalf, y: yHalf };
    const to = proceso === 'fision' ? { x: xHalf, y: yHalf } : { x: xA, y: yA };
    scene.vector(from.x, from.y, to.x - from.x, to.y - from.y, {
      color: favorable ? 'ok' : 'danger',
      width: 2,
      dash: [4, 3]
    });
    scene.hud.chip(
      `${proceso === 'fision' ? 'Fisión' : 'Fusión'}: ΔE = ${roundTo(dE, 1)} MeV ${favorable ? '(libera)' : '(absorbe)'}`,
      'top-left',
      { color: favorable ? 'ok' : 'danger' }
    );
    scene.hud.readout(
      [
        { label: 'A', value: A, unit: '' },
        { label: 'Z (estable)', value: roundTo(this.Z(), 0), unit: '' },
        { label: 'BE/A', value: roundTo(bindingPerNucleon(A), 3), unit: 'MeV' },
        { label: 'ΔE', value: roundTo(dE, 2), unit: 'MeV' }
      ],
      'top-left'
    );
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const { A, proceso } = this.params;
    return {
      proceso: { value: proceso === 'fision' ? 'Fisión' : 'Fusión', unit: '' },
      A: { value: A, unit: '' },
      Z: { value: roundTo(this.Z(), 0), unit: '' },
      'BE/A': { value: roundTo(bindingPerNucleon(A), 3), unit: 'MeV' },
      deltaE: { value: roundTo(this.reactionEnergy(), 2), unit: 'MeV' }
    };
  }

  getState() {
    return { params: { ...this.params } };
  }

  setState(s) {
    if (!s?.params) return;
    Object.assign(this.params, s.params);
  }
}
