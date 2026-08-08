/**
 * @fileoverview Masa y peso — la masa no cambia de astro; el peso sí (tanda 5.1).
 *
 * Un cuerpo con `m` se despliega sobre una báscula preparada para la gravedad
 * del planeta elegido; el HUD compara W = m·g entre astros como barras, para
 * que se vea el contraste sin salir del lienzo. Ejercita `body`, `chip` y el
 * `plot` de barras (`scene.rect`) para la comparación multipanel.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

/** Gravedad superficial (m/s²) y años luz de nombres cortos. */
const ASTROS = [
  { id: 'tierra', label: 'Tierra', g: 9.8 },
  { id: 'luna', label: 'Luna', g: 1.62 },
  { id: 'mercurio', label: 'Mercurio', g: 3.7 },
  { id: 'marte', label: 'Marte', g: 3.71 },
  { id: 'jupiter', label: 'Júpiter', g: 24.79 },
  { id: 'neptuno', label: 'Neptuno', g: 11.15 }
];

export default class MassWeight extends SimModule {
  static viewport = { width: 22, height: 13 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    { id: 'm', label: 'Masa', latex: 'm', unit: 'kg', min: 0.5, max: 200, step: 0.5, value: 50 },
    {
      id: 'astro',
      type: 'select',
      label: 'Astro',
      value: 'tierra',
      options: ASTROS.map((a) => ({ value: a.id, label: a.label }))
    }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { m: 50, astro: 'tierra' };
  }

  astro() {
    return ASTROS.find((a) => a.id === this.params.astro) || ASTROS[0];
  }

  weight(m, g) {
    return m * g;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Masa y peso',
      blurb: 'Distinguir masa (invariante) de peso (m·g, depende del astro).',
      story:
        'Masa y peso se confunden porque en la Tierra un cuerpo de 50 kg «pesa» 50 (kg·g = 490 N). Pero la masa es cantidad de materia — no cambia al viajar a la Luna — mientras que el peso es la fuerza con la que un astro tira de ella, y ahí la gravedad manda.',
      cases: [
        'Un astronauta de 80 kg: ¿cuánto pesa en la Luna y en Júpiter?',
        'Comparar dos balanzas: la de masa (balanza de platillos) no se altera por g.',
        'Por qué los saltos son más altos en la Luna aunque la masa sea la misma.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Masa vs peso',
      items: [
        {
          name: 'Peso',
          formula: 'W = m · g',
          note: 'g varía con el astro; la masa m no.'
        },
        {
          name: 'Peso en otros astros',
          formula: 'W₂ = W₁ · (g₂ / g₁)',
          note: 'Regla de tres que se ve en la comparación de barras.'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.engine?.reset?.();
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const { m } = this.params;
    const a = this.astro();
    const W = this.weight(m, a.g);
    const w = scene.world();
    // Suelo centrado en el mundo: la báscula queda sobre el origen (§17.1).
    const g = -1.9;

    // Suelo.
    scene.rect(0, g, w.right - w.left - 1.6, 0.3, { color: 'textDim', fill: true });

    // Báscula: pedestal + plato sobre el suelo (eje centrado en el origen).
    const bx = 0;
    const topP = g + 1.1;
    scene.rect(bx, topP + 0.5, 2.4, 1.0, { color: 'mass', radius: 0.15 });
    scene.polygon(
      [
        { x: bx - 1.3, y: topP + 1.0 },
        { x: bx + 1.3, y: topP + 1.0 },
        { x: bx + 0.9, y: topP + 1.75 },
        { x: bx - 0.9, y: topP + 1.75 }
      ],
      { color: 'mass', fill: true, alpha: 0.25, dash: [] }
    );

    // Cuerpo sobre la báscula (el tamaño crece con la masa).
    const cy = topP + 2.1 - m / 250;
    scene.body(bx, cy, {
      shape: 'rect', r: 1.0 - m / 2500, color: 'mass',
      label: `m = ${m} kg`
    });

    // Vector peso (hacia abajo en el lienzo), acotado al suelo del mundo.
    const wLen = Math.min(3.6, Math.max(0.8, cy - w.bottom - 0.85));
    scene.vector(bx, cy - 0.1, 0, -wLen, {
      color: 'force',
      label: `W = ${roundTo(W, 1)} N`,
      labelSide: -1,
      width: 3
    });

    // Etiqueta del astro bajo el cuerpo.
    scene.chip(bx, topP + 2.9, `${a.label}: g = ${a.g} m/s²`, { avoid: true, color: 'energy' });

    // Comparación multipanel: barra de W por astro (rect es el «plot» de barras).
    this.drawWeightBars(scene, w);

    const hud = scene.hud;
    hud.chip(`Masa ${m} kg — ${a.label}`, 'top-left');
    hud.readout(
      [
        { label: 'm', value: m, unit: 'kg' },
        { label: 'g', value: a.g, unit: 'm/s²' },
        { label: 'W', value: roundTo(W, 1), unit: 'N' }
      ],
      'bottom-left'
    );
  }

  /** Barras W por astro, ancladas a la derecha (escala N). */
  drawWeightBars(scene, w) {
    const { m } = this.params;
    const maxW = this.weight(m, Math.max(...ASTROS.map((x) => x.g)));
    const barW = 0.5;
    const x0 = w.right - 8.6;
    const top = w.top - 1.1;
    const usable = 10.5;
    let i = 0;
    for (const a of ASTROS) {
      const W = this.weight(m, a.g);
      const h = Math.max(0.2, (W / maxW) * usable);
      scene.rect(x0 + i * (barW + 0.32), top - h / 2, barW, h, {
        color: i % 2 ? 'mass2' : 'energy',
        fill: true
      });
      scene.label(x0 + i * (barW + 0.32), top - 0.75, a.label.slice(0, 3), { avoid: true,
        color: 'textDim',
        size: 9
      });
      i++;
    }
    scene.label(x0 + ((barW * 6 + 0.32 * 5) / 2), top + 0.6, 'Peso W por astro', { avoid: true,
      color: 'textDim',
      size: 10
    });
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const { m } = this.params;
    const a = this.astro();
    const out = {
      masa: { value: m, unit: 'kg' },
      astro: { value: a.label, unit: '' },
      g: { value: roundTo(a.g, 2), unit: 'm/s²' },
      peso: { value: roundTo(this.weight(m, a.g), 1), unit: 'N' }
    };
    const tierra = this.weight(m, 9.8);
    out['Δ vs Tierra'] = { value: roundTo(this.weight(m, a.g) - tierra, 1), unit: 'N' };
    return out;
  }

  getState() {
    return { params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
  }
}