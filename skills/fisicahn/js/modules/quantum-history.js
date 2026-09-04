/**
 * @fileoverview Historia de la mecánica cuántica, 1900-1935 (tanda 5.5).
 *
 * Línea de tiempo interactiva con diez hitos. El pedido original habla de
 * "mini-demos incrustadas" reutilizando `photoelectric`, `atomic` y
 * `tunneling`. Incrustar de verdad esos módulos —instanciar su `SimModule`,
 * correr su propio `update`/`draw` dentro de este `draw()`— exigiría que la
 * escena supiera anidar más de una `Camera`/viewport a la vez, algo que el
 * núcleo (§2) no ofrece todavía: sería una WAVE de composición de escenas por
 * derecho propio, no un ajuste puntual de este módulo.
 *
 * Alcance real de esta tanda: cada hito dibuja su **propio boceto
 * simplificado** —no una copia del motor del módulo hermano, sino la misma
 * idea física reducida a un puñado de primitivas— y el texto remite al
 * módulo completo para explorarlo. Es honesto sobre la diferencia: un boceto
 * no es una simulación.
 */

import { SimModule } from '../core/sim-module.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const MILESTONES = [
  {
    year: 1900,
    who: 'Planck',
    title: 'Cuantización de la energía',
    text: 'Para explicar el espectro de un cuerpo negro sin la "catástrofe ultravioleta", Planck propone que la energía se intercambia en paquetes E = hf, no de forma continua.',
    belief:
      'Se trataba la radiación del cuerpo negro como ondas continuas de todas las frecuencias: el cálculo clásico predecía que la emisión se disparaba sin límite hacia el ultravioleta, algo absurdo que la medida desmentía una y otra vez.',
    reality:
      'La energía no se intercambia de forma continua: cada oscilador solo puede emitir o absorber paquetes de energía hf. Con esa única hipótesis la curva medida se reproduce exactamente. La continuidad era una extrapolación clásica falsa a escala atómica.',
    sketch: 'planck',
    verdict: { status: 'refutada', certainty: 'alta', note: 'La radiación clásica continua (Rayleigh–Jeans) está refutada: la curva de Planck se mide en cada cuerpo negro, del horno al fondo cósmico de microondas.' }
  },
  {
    year: 1905,
    who: 'Einstein',
    title: 'Efecto fotoeléctrico',
    text: 'La luz misma está cuantizada en fotones de energía hf. Explica por qué la luz de baja frecuencia no arranca electrones sin importar la intensidad. Ver el módulo "Efecto fotoeléctrico".',
    belief:
      'Si la luz es una onda continua, su energía depende de la intensidad: un foco intenso debería arrancar electrones a cualquier frecuencia y con solo esperar un poco.',
    reality:
      'La energía del haz viaja en fotones de energía hf. Si hf es menor que la función de trabajo φ del metal, ningún fotón puede arrancar un electrón por intenso que sea el foco. El umbral de frecuencia (no la intensidad) decide el efecto: la imagen ondulatoria clásica estaba equivocada.',
    sketch: 'photoelectric',
    verdict: { status: 'refutada', certainty: 'alta', note: 'La imagen ondulatoria clásica del efecto fotoeléctrico está refutada: Millikan midió K_max = hf − φ en 1916 y la frecuencia umbral se comprueba en cualquier laboratorio docente.' }
  },
  {
    year: 1913,
    who: 'Bohr',
    title: 'Modelo atómico cuantizado',
    text: 'Los electrones sólo ocupan órbitas de momento angular cuantizado; saltan entre niveles emitiendo o absorbiendo un fotón de energía exacta. Ver el módulo "Física atómica".',
    belief:
      'El átomo de Rutherford tenía electrones orbitando como planetas; clásicamente un electrón acelerado irradiaría energía y colapsaría al núcleo en ~10⁻¹¹ s. Se creía que ese colapso era inevitable.',
    reality:
      'Los átomos no colapsan: los electrones solo ocupan órbitas cuantizadas y radian únicamente al saltar entre niveles (Eₙ = −13,6 eV/n²). La predicción clásica de colapso es falsa; la estabilidad de la materia es un efecto cuántico.',
    sketch: 'bohr',
    verdict: { status: 'refutada', certainty: 'alta', note: 'El colapso clásico del átomo está refutado por la simple existencia de la materia estable. El propio modelo de Bohr fue luego superado por la mecánica cuántica (orbitales, no órbitas), pero sus niveles de energía para el hidrógeno siguen siendo correctos.' }
  },
  {
    year: 1924,
    who: 'de Broglie',
    title: 'Dualidad onda-partícula',
    text: 'Si la luz (onda) se comporta como partícula, quizás la materia (partícula) se comporte como onda: λ = h/p. Ver el módulo "Dualidad onda-partícula".',
    belief:
      'Se creía que la dualidad onda-partícula era exclusiva de la luz; la materia eran partículas con trayectorias bien definidas y sin ninguna longitud de onda asociada.',
    reality:
      'No: toda partícula lleva asociada una onda de materia λ = h/p. La idea dejó de ser especulación en 1927: el haz de electrones de Davisson y Germer difractaba como lo haría una onda. La creencia clásica era incompleta.',
    sketch: 'debroglie',
    verdict: { status: 'refutada', certainty: 'alta', note: 'La idea de partícula sin onda asociada está refutada: la difracción de electrones (1927), de neutrones y hasta de moléculas grandes (C₆₀, 1999) se observa de forma rutinaria.' }
  },
  {
    year: 1926,
    who: 'Schrödinger / Heisenberg',
    title: 'Mecánica cuántica moderna',
    text: 'Dos formulaciones equivalentes nacen casi a la vez: la ecuación de onda de Schrödinger y la mecánica matricial de Heisenberg. Ambas describen la misma física con matemática distinta.',
    belief:
      'Al nacer dos formalismos aparentemente incompatibles (ecuación de onda y mecánica matricial), se dudaba si solo uno podía ser el correcto o si acaso la teoría entera estaba mal planteada.',
    reality:
      'Ambas formulaciones resultan matemáticamente equivalentes: describen exactamente la misma física. La duda era un problema de lenguaje, no de contenido: ninguna estaba mal; eran la misma teoría en dos notaciones.',
    sketch: 'wavefunction',
    verdict: { status: 'vigente', certainty: 'alta', note: 'Aquí no había una creencia equivocada: la sospecha de incompatibilidad se disolvió cuando Schrödinger (1926) y Dirac demostraron que ambos formalismos son equivalentes. Ambos siguen vigentes.' }
  },
  {
    year: 1927,
    who: 'Heisenberg',
    title: 'Principio de incertidumbre',
    text: 'No se puede conocer a la vez, con precisión arbitraria, la posición y el momento de una partícula: Δx·Δp ≥ ħ/2. No es un límite del instrumento, es de la naturaleza.',
    belief:
      'Se creía que toda imprecisión era un límite del instrumento y que, en principio, se podía conocer el estado exacto de un sistema: un universo determinista al estilo de Laplace.',
    reality:
      'La incertidumbre es intrínseca a la naturaleza, no al aparato de medida: precisar la posición perturba el momento y viceversa. El determinismo clásico a escala atómica es imposible.',
    sketch: 'uncertainty',
    verdict: { status: 'refutada', certainty: 'alta', note: 'El determinismo laplaciano a escala atómica está refutado: la relación Δx·Δp ≥ ħ/2 es un teorema de la teoría y se ha verificado con fotones, átomos y osciladores mecánicos.' }
  },
  {
    year: 1927,
    who: 'Davisson y Germer',
    title: 'Difracción de electrones confirmada',
    text: 'Un haz de electrones reflejado en un cristal de níquel produce un patrón de difracción: la hipótesis de de Broglie deja de ser especulación y pasa a ser medida.',
    belief:
      'Los electrones son partículas puntuales; la difracción y la interferencia eran fenómenos reservados a las ondas.',
    reality:
      'El patrón de difracción del haz de electrones en el níquel confirmó la onda de materia λ = h/p. La imagen corpuscular clásica, sin onda asociada, era incompleta.',
    sketch: 'debroglie',
    verdict: { status: 'refutada', certainty: 'alta', note: 'La idea de partícula sin onda asociada está refutada: la difracción de electrones (1927), de neutrones y hasta de moléculas grandes (C₆₀, 1999) se observa de forma rutinaria.' }
  },
  {
    year: 1928,
    who: 'Dirac',
    title: 'Ecuación relativista del electrón',
    text: 'Al combinar mecánica cuántica y relatividad especial, la ecuación de Dirac predice una partícula nueva: el positrón, la antimateria del electrón (confirmado en 1932).',
    belief:
      'La ecuación de Dirac predecía estados de energía negativa; se los consideró un artefacto matemático sin sentido físico, un error de la teoría.',
    reality:
      'Esos estados son reales: en 1932 Anderson descubrió el positrón (e⁺), la misma masa del electrón con carga opuesta. La antimateria existe; descartar los estados de energía negativa era el error.',
    sketch: 'dirac',
    verdict: { status: 'refutada', certainty: 'alta', note: 'Tratar los estados de energía negativa como un artefacto fue un error: el positrón se detectó en 1932 y hoy la antimateria se produce y usa a diario (tomografía PET).' }
  },
  {
    year: 1928,
    who: 'Gamow, Condon y Gurney',
    title: 'Teoría cuántica del túnel',
    text: 'El decaimiento alfa se explica porque la partícula "atraviesa" una barrera de energía que clásicamente sería infranqueable. Ver el módulo "Túnel cuántico".',
    belief:
      'Clásicamente, si una partícula no tiene energía para superar una barrera, no puede cruzarla jamás: siempre se refleja. Así se explicaban las colisiones ordinarias.',
    reality:
      'En mecánica cuántica la función de onda decae dentro de la barrera pero no llega a cero: hay probabilidad finita de aparecer al otro lado (factor exponencial). El decaimiento alfa solo se explica así. La prohibición clásica se viola a escala nuclear.',
    sketch: 'tunneling',
    verdict: { status: 'refutada', certainty: 'alta', note: 'La prohibición clásica de cruzar la barrera está refutada: el túnel explica el decaimiento alfa, sostiene la fusión del Sol y es la base del microscopio de efecto túnel (1981) y de la memoria flash.' }
  },
  {
    year: 1935,
    who: 'Einstein, Podolsky y Rosen',
    title: 'La paradoja EPR',
    text: 'Einstein cuestiona si la mecánica cuántica está completa: dos partículas entrelazadas parecen influirse instantáneamente pese a la distancia — "acción fantasmal a distancia". Abre el debate que sigue hoy.',
    belief:
      'EPR creían que, si el entrelazamiento correlaciona partículas al instante a cualquier distancia, la cuántica debía estar incompleta: para preservar la localidad tenía que haber «variables ocultas» aún por descubrir. Por eso se creía que la teoría era provisional.',
    reality:
      'El teorema de Bell (1964) y los experimentos posteriores muestran que ninguna teoría local de variables ocultas reproduce las correlaciones cuánticas: la cuántica es completa y el entrelazamiento es real. La conclusión EPR está refutada con alta confianza (sin que ello permita transmitir información instantánea).',
    sketch: 'epr',
    verdict: { status: 'refutada', certainty: 'alta', note: 'La conclusión EPR (variables ocultas locales) está refutada con alta certeza: las desigualdades de Bell se violan en los experimentos de Aspect, Zeilinger y Clauser (Nobel 2022), incluidos los «libres de lagunas» de 2015. Sigue abierto, eso sí, el debate sobre la interpretación.' }
  }
];

export default class QuantumHistory extends SimModule {
  static viewport = { width: 22, height: 13 };

  // Sin mecanismo con posición propia: la línea de tiempo vive en el origen (§17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'hito',
      type: 'select',
      label: 'Hito',
      value: '0',
      options: MILESTONES.map((m, i) => ({ value: String(i), label: `${m.year} — ${m.who}` }))
    }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { hito: '0' };
    this.t = 0;
  }

  init(meta = null) {
    this.reset();
    setModuleFormulas(this.ui, {
      items: [
        { name: 'Planck', formula: 'E = h f' },
        { name: 'Einstein (fotoeléctrico)', formula: 'K_{max} = hf - \\phi' },
        { name: 'Bohr', formula: 'E_n = -\\dfrac{13{,}6\\,\\text{eV}}{n^2}' },
        { name: 'de Broglie', formula: '\\lambda = h/p' },
        { name: 'Heisenberg', formula: '\\Delta x \\, \\Delta p \\geq \\hbar/2' }
      ]
    });
    clearChallenges(this.ui);
    this._refreshInfo();
  }

  reset() {
    this.t = 0;
    this.engine?.reset?.();
    this._refreshInfo?.();
  }

  _refreshInfo() {
    const m = this.milestone();
    const v = m.verdict || {};
    const statusLabel =
      v.status === 'refutada'
        ? `Creencia REFUTADA (certeza ${v.certainty || 'alta'})`
        : v.status === 'vigente'
          ? 'No estaba mal: sigue vigente'
          : `Creencia incompleta (certeza ${v.certainty || 'media'})`;
    // Toda la ficha del hito va VISIBLE en la pestaña Información (barra bajo
    // la animación), sin desplegables: qué pasó, por qué se creía lo anterior
    // y por qué estaba mal (con el grado de certeza de que lo esté).
    setModuleInfo(this.ui, {
      title: 'Historia de la mecánica cuántica',
      blurb: `<strong>${m.year} — ${m.who}: ${m.title}.</strong> ${m.text}`,
      sections: [
        { title: 'Por qué se creía así:', text: m.belief, tone: 'accent' },
        { title: 'Por qué estaba mal:', text: m.reality, tone: 'warn' },
        { title: `${statusLabel}.`, text: v.note || '', tone: v.status === 'vigente' ? 'ok' : 'warn' }
      ],
      story:
        'Cada hito de la línea de tiempo dibuja un boceto simplificado de la idea (no una simulación completa): el módulo hermano indicado en el texto la explora a fondo.',
      cases: [
        'Por qué el LED de tu teléfono emite un color y no otro (niveles de Bohr).',
        'Por qué un microscopio electrónico ve más detalle que uno óptico (de Broglie).',
        'Por qué el decaimiento radiactivo es impredecible para un átomo individual (túnel cuántico).'
      ]
    });
  }

  update(dt) {
    this.t += dt;
  }

  milestone() {
    return MILESTONES[Number(this.params.hito) || 0];
  }

  /* ---------- dibujo declarativo (§2.4) ---------- */

  draw(scene) {
    const m = this.milestone();
    const idx = Number(this.params.hito) || 0;

    // Línea de tiempo con marcas para cada hito; el actual, resaltado.
    const x0 = -9.5;
    const x1 = 9.5;
    scene.line(x0, 5, x1, 5, { color: 'textDim', width: 2 });
    MILESTONES.forEach((mi, i) => {
      const x = x0 + ((x1 - x0) * (mi.year - 1900)) / 35;
      const active = i === idx;
      scene.body(x, 5, { shape: 'circle', r: active ? 0.18 : 0.1, color: active ? 'mass' : 'textDim', glow: active });
      if (active) {
        scene.label(x, 5.5, `${mi.year}`, { color: 'mass', size: 12, avoid: true });
      }
    });

    // Boceto simplificado del hito activo, en la mitad inferior del lienzo.
    this.drawSketch(scene, m.sketch);

    scene.hud.chip(`${m.year} — ${m.who}: ${m.title}`, 'top-left', { color: 'energy' });
  }

  /** Boceto simplificado por hito — ver nota de cabecera sobre el alcance real. */
  drawSketch(scene, kind) {
    const cx = 0;
    const cy = -1;
    switch (kind) {
      case 'planck': {
        // Curva de radiación de cuerpo negro: sube y cae (sin catástrofe UV).
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const x = -6 + (i / 40) * 12;
          const u = (i / 40) * 4;
          const y = cy - 2.5 + u * u * Math.exp(-u) * 3.2;
          pts.push({ x, y });
        }
        scene.polyline(pts, { color: 'energy', width: 2.5 });
        scene.label(cx, cy - 3.2, 'Intensidad vs frecuencia — sin divergencia al cuantizar E = hf', { color: 'textDim', size: 11 });
        break;
      }
      case 'photoelectric': {
        scene.rect(cx, cy, 4, 2.4, { color: 'mass', fill: 'mass', alpha: 0.25 });
        scene.label(cx, cy - 1.6, 'Metal', { color: 'textDim', size: 11 });
        for (let i = -1; i <= 1; i++) {
          scene.vector(cx + i * 1.2, cy + 3, 0, -1.4, { color: 'ray', width: 2 });
        }
        scene.vector(cx, cy + 1.4, 1.6, 1.4, { color: 'field', width: 2, label: 'e⁻' });
        break;
      }
      case 'bohr': {
        scene.body(cx, cy, { shape: 'circle', r: 0.22, color: 'force', glow: false, label: 'núcleo' });
        [1.2, 2.1, 3.0].forEach((r, i) => scene.arc(cx, cy, r, 0, Math.PI * 2, { color: 'field', width: 1.4, dash: [3, 3] }));
        const ang = this.t * 1.5;
        scene.body(cx + Math.cos(ang) * 2.1, cy + Math.sin(ang) * 2.1, { shape: 'circle', r: 0.12, color: 'mass', glow: false });
        break;
      }
      case 'debroglie': {
        // Icono onda + partícula: una polilínea sinusoidal con un punto encima.
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const x = -3.5 + (i / 40) * 7;
          pts.push({ x, y: cy + Math.sin((i / 40) * Math.PI * 4) * 0.8 });
        }
        scene.polyline(pts, { color: 'field', width: 2 });
        scene.body(0, cy, { shape: 'circle', r: 0.16, color: 'mass', glow: false, label: 'λ = h/p' });
        break;
      }
      case 'wavefunction': {
        const pts = [];
        for (let i = 0; i <= 60; i++) {
          const x = -5 + (i / 60) * 10;
          const envelope = Math.exp(-((x / 3) ** 2));
          pts.push({ x, y: cy + Math.sin((i / 60) * Math.PI * 8 + this.t * 2) * envelope * 1.6 });
        }
        scene.polyline(pts, { color: 'field', width: 2 });
        scene.label(cx, cy - 2.4, 'ψ(x,t): paquete de onda — Schrödinger y Heisenberg predicen lo mismo', { color: 'textDim', size: 11 });
        break;
      }
      case 'uncertainty': {
        const spread = 0.6 + 0.4 * Math.sin(this.t);
        scene.circle(cx, cy, spread, { color: 'mass', fill: 'mass', alpha: 0.3 });
        scene.circle(cx, cy, Math.max(0.3, 1.2 - spread), { color: 'field', fill: 'field', alpha: 0.3 });
        scene.label(cx, cy - 2, 'Cuando Δx se achica, Δp crece — y viceversa', { color: 'textDim', size: 11 });
        break;
      }
      case 'dirac': {
        scene.body(cx - 1.5, cy, { shape: 'circle', r: 0.3, color: 'field', label: 'e⁻ (−)' });
        scene.body(cx + 1.5, cy, { shape: 'circle', r: 0.3, color: 'force', label: 'e⁺ (+)' });
        scene.label(cx, cy - 1.4, 'Misma masa, carga opuesta: la antimateria del electrón', { color: 'textDim', size: 11 });
        break;
      }
      case 'tunneling': {
        scene.rect(cx, cy, 1.2, 3, { color: 'textDim', fill: 'textDim', alpha: 0.35 });
        scene.label(cx, cy + 1.9, 'barrera', { color: 'textDim', size: 10 });
        const u = (Math.sin(this.t * 0.8) + 1) / 2;
        scene.body(-5 + u * 10, cy, { shape: 'circle', r: 0.18, color: 'mass', glow: false });
        break;
      }
      case 'epr':
      default: {
        scene.body(cx - 2.5, cy, { shape: 'circle', r: 0.22, color: 'field', label: 'partícula A' });
        scene.body(cx + 2.5, cy, { shape: 'circle', r: 0.22, color: 'field', label: 'partícula B' });
        scene.line(cx - 2.5, cy, cx + 2.5, cy, { color: 'energy', width: 1.4, dash: [2, 4], alpha: 0.6 });
        scene.label(cx, cy - 1.4, 'Entrelazadas: medir A parece decidir B al instante', { color: 'textDim', size: 11 });
        break;
      }
    }
  }

  /* ---------- datos numéricos (§3.1) ---------- */

  readout() {
    const m = this.milestone();
    return {
      año: { value: m.year, unit: '' },
      quién: { value: m.who, unit: '' },
      hito: { value: m.title, unit: '' },
      'creencia previa': { value: m.verdict?.status === 'vigente' ? 'vigente' : `${m.verdict?.status || '—'} (certeza ${m.verdict?.certainty || '—'})`, unit: '' }
    };
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
