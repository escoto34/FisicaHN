/**
 * Hipérbola — la hipérbola como lugar geométrico: |PF₁ − PF₂| = 2a.
 *
 * Dibuja las dos ramas de x²/a² − y²/b² = 1 con sus asíntotas y focos, y un
 * punto P arrastrable: los segmentos a los focos se dibujan en vivo y el
 * `readout()` reporta |PF₁| − |PF₂|. Si P viaja sobre la curva esa diferencia
 * es constante (2a); al soltar el punto se «enamora» de la rama derecha.
 *
 * @module modules/hyperbola
 */
import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../core/geometry.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

/** Distancia focal: foci en (±c, 0), c² = a² + b². */
function focal(ia, ib) {
  return Math.sqrt(ia * ia + ib * ib);
}

/**
 * Muestrea una rama con la parametrización x = a·cosh(u), y = b·sinh(u),
 * acotada al mundo: los puntos se distribuyen a lo largo de la curva, no por
 * «x fijo» (que se dispersaría lejos del vértice).
 */
function sampleBranch(ia, ib, maxX) {
  const uMax = Math.acosh(Math.max(1.0001, maxX / ia));
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const u = -uMax + (2 * uMax * i) / 80;
    pts.push({ x: ia * Math.cosh(u), y: ib * Math.sinh(u) });
  }
  return pts;
}

export default class HyperbolaModule extends SimModule {
  /** Encuadre propio: la curva sale algo más alta que ancha (§2.2). */
  static viewport = { width: 26, height: 18 };

  /** Esquema declarativo: la app construye y enlaza el panel (§2.7). */
  static params = [
    { id: 'a', label: 'Semieje real', latex: 'a', unit: 'u', min: 1, max: 4, step: 0.25, value: 2 },
    {
      id: 'b',
      label: 'Semieje imaginario',
      latex: 'b',
      unit: 'u',
      min: 0.75,
      max: 4,
      step: 0.25,
      value: 1.5
    }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { a: 2, b: 1.5 };
    /** Punto arrastrable: empieza en el vértice derecho (a, 0). */
    this.p = { x: 2, y: 0 };
  }

  init(meta = null) {
    this.params.a = this.params.a ?? 2;
    this.params.b = this.params.b ?? 1.5;
    // Al cambiar `a` el vértice se mueve: si el punto quedó donde estuvo el
    // anterior, se relocaliza en el nuevo vértice.
    if (Math.abs(this.p.y) < 1e-9) this.p.x = this.params.a;

    setModuleInfo(this.ui, {
      title: meta?.title || 'Hipérbola',
      blurb:
        meta?.blurb ||
        'Lugar de los puntos cuya diferencia de distancias a dos focos es constante: |PF₁ − PF₂| = 2a.',
      story:
        'Las cónicas son las curvas que se ven al cortar un cono con un plano. La hipérbola aparece en la navegación LORAN (diferencias de distancias a dos estaciones), en telescopios de doble espejo y en las órbitas hiperbólicas de cometas. Arrastra P y comprueba que |PF₁ − PF₂| no cambia mientras P está sobre la curva.',
      cases: [
        'Arrastrar P por la rama derecha: PF₁ − PF₂ aparece constante.',
        'Cambiar a y b: la curvatura y la posición de los focos se ajustan (c² = a² + b²).',
        'Cruzar el eje: en la rama izquierda la diferencia cambia de signo.'
      ]
    });
    setModuleFormulas(this.ui, {
      items: [
        { name: 'Ecuación canónica', formula: 'x²/a² − y²/b² = 1', note: 'Centro en el origen, focos en el eje x.' },
        { name: 'Distancia focal', formula: 'c² = a² + b²', note: 'c es la distancia de cada foco al centro.' },
        { name: 'Lugar geométrico', formula: '|PF₁ − PF₂| = 2a', note: 'La diferencia es constante sobre toda la curva.' }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.init();
  }

  onPickStart() {
    /* el arrastre se procesa en onDrag */
  }

  onDrag(id, world) {
    if (id !== 'P') return;
    this.p.x = world.x;
    this.p.y = world.y;
  }

  /**
   * Al soltar se «enamora» el punto a la rama derecha: se mantiene su
   * altura y se ajusta x para quedar sobre la curva (x = a·cosh(u),
   * u = asinh(y/b)). Así la ley del lugar se cumple a la vista.
   */
  onDragEnd() {
    const p = this.p;
    if (p.x <= 0) return; // rama izquierda: dejar donde quedó
    const { a, b } = this.params;
    // u = asinh(y/b), x = a·cosh(u): ajusta x manteniendo la altura.
    p.x = a * Math.cosh(Math.asinh(p.y / b));
  }

  update() {
    /* Estado puramente geométrico: no hay física temporal. */
  }

  draw(scene) {
    const w = scene.world();
    const { a, b } = this.params;
    const c = focal(a, b);
    const P = this.p;

    // Ejes con marcas enteras (aquí no ayuda una rejilla completa).
    scene.line(w.left, 0, w.right, 0, { color: 'textDim', width: 1.5 });
    scene.line(0, w.bottom, 0, w.top, { color: 'textDim', width: 1.5 });
    for (let x = Math.ceil(w.left); x <= Math.floor(w.right); x++) {
      scene.line(x, -0.12, x, 0.12, { color: 'axisLabel' });
    }
    for (let y = Math.ceil(w.bottom); y <= Math.floor(w.top); y++) {
      scene.line(-0.12, y, 0.12, y, { color: 'axisLabel' });
    }

    // Asíntotas y = ±(b/a)x (con el mismo vmax que las ramas)
    const xc = Math.max(w.right, -w.left);
    const slope = b / a;
    scene.line(0, 0, xc, slope * xc, { color: 'textDim', dash: [5, 5], width: 1 });
    scene.line(0, 0, xc, -slope * xc, { color: 'textDim', dash: [5, 5], width: 1 });
    scene.line(0, 0, -xc, slope * xc, { color: 'textDim', dash: [5, 5], width: 1 });
    scene.line(0, 0, -xc, -slope * xc, { color: 'textDim', dash: [5, 5], width: 1 });

    // Las dos ramas
    const ptsR = sampleBranch(a, b, xc);
    scene.polyline(ptsR, { color: 'mass', width: 2.5 });
    scene.polyline(ptsR.map((q) => ({ x: -q.x, y: q.y })), { color: 'mass', width: 2.5 });

    // Focos
    scene.circle(-c, 0, 0.14, { color: 'force', fill: true });
    scene.circle(c, 0, 0.14, { color: 'force', fill: true });
    scene.label(-c, -0.55, 'F₁', { color: 'force' });
    scene.label(c, -0.55, 'F₂', { color: 'force' });
    scene.label(0, 0.5, 'O', { color: 'textDim' });
    scene.dimension(a, -1.55, c, -1.55, `c = ${roundTo(c, 2)}`, { color: 'textDim' });

    // Vértices
    scene.circle(a, 0, 0.08, { color: 'mass' });
    scene.circle(-a, 0, 0.08, { color: 'mass' });

    // Punto arrastrable y segmentos a los focos (en vivo)
    const d1 = Math.hypot(P.x + c, P.y);
    const d2 = Math.hypot(P.x - c, P.y);
    scene.vector(P.x, P.y, -c - P.x, -P.y, {
      color: 'energy', label: `PF₁ = ${roundTo(d1, 2)}`, labelSide: -1, width: 2
    });
    scene.vector(P.x, P.y, c - P.x, -P.y, {
      color: 'mass2', label: `PF₂ = ${roundTo(d2, 2)}`, labelSide: 1, width: 2
    });
    scene.body(P.x, P.y, { id: 'P', r: 0.22, color: 'force' });
    scene.pickable('P', { x: P.x, y: P.y, r: 0.6 });
    scene.label(P.x, P.y + 0.85, `|PF₁−PF₂| = ${roundTo(Math.abs(d1 - d2), 3)}`, { color: 'force' });

    // Leyenda
    scene.hud.legend(
      [
        { color: 'mass', label: `x²/${roundTo(a * a, 2)} − y²/${roundTo(b * b, 2)} = 1` },
        { color: 'force', label: 'Focos (±c, 0) · P arrastrable' },
        { color: 'energy', label: '|PF₁ − PF₂| = 2a' }
      ],
      'top-right'
    );
  }

  readout() {
    const { a, b } = this.params;
    const c = focal(a, b);
    const d1 = Math.hypot(this.p.x + c, this.p.y);
    const d2 = Math.hypot(this.p.x - c, this.p.y);
    return {
      'Semieje real': { value: a, unit: 'u' },
      'Semieje imaginario': { value: b, unit: 'u' },
      'Foco c': { value: roundTo(c, 3), unit: 'u' },
      'PF₁': { value: roundTo(d1, 3), unit: 'u' },
      'PF₂': { value: roundTo(d2, 3), unit: 'u' },
      '|PF₁ − PF₂|': { value: roundTo(Math.abs(d1 - d2), 3), unit: 'u' }
    };
  }

  getState() {
    return { params: { ...this.params }, p: { ...this.p } };
  }

  setState(s) {
    if (s?.params) Object.assign(this.params, s.params);
    if (s?.p) Object.assign(this.p, s.p);
  }

  destroy() {
    /* sin temporizadores ni escuchas globales */
  }
}