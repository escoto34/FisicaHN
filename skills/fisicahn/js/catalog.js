/**
 * Catálogo de simulaciones (listado unificado, sin duplicados).
 *
 * Cada entrada = un motor real distinto o un enfoque claramente diferente.
 * IDs antiguos se redirigen en getById() para trabajos guardados previos.
 *
 * WAVE 4: cada entrada lleva `category` (§3.5), `glyph`/`accent` (icono y color),
 * `serves[]` («Útil para», §3.4) y `modes[]` (modos internos con enlace
 * profundo, §4.4). Registrar un módulo nuevo es crear su archivo y añadir la
 * entrada aquí: `ENGINE_PATHS` (app.js) y `CHALLENGE_MODULE_LABELS`
 * (challenges.js) se derivan de este listado (§4.5).
 */

export const LEVELS = [
  { id: 'middle', label: 'Secundaria', labelEn: 'Middle School' },
  { id: 'high', label: 'Bachillerato', labelEn: 'High School' },
  { id: 'advanced', label: 'Avanzado', labelEn: 'Advanced' }
];

/** Categorías del menú (§3.5). `accent` alimenta `.catalog-card-accent-*`. */
export const CATEGORIES = [
  { id: 'medicion-vectores', label: 'Medición y vectores', glyph: '📏', accent: 'indigo' },
  { id: 'cinematica', label: 'Cinemática', glyph: '🏃', accent: 'blue' },
  { id: 'dinamica-fuerzas', label: 'Dinámica y fuerzas', glyph: '💪', accent: 'red' },
  { id: 'energia-momento', label: 'Trabajo, energía y momento', glyph: '⚡', accent: 'orange' },
  { id: 'rotacion-gravitacion', label: 'Rotación y gravitación', glyph: '🪐', accent: 'purple' },
  { id: 'fluidos', label: 'Fluidos', glyph: '💧', accent: 'teal' },
  { id: 'termica', label: 'Térmica', glyph: '🌡️', accent: 'amber' },
  { id: 'oscilaciones-ondas', label: 'Oscilaciones y ondas', glyph: '🌊', accent: 'cyan' },
  { id: 'optica', label: 'Óptica', glyph: '🔦', accent: 'green' },
  { id: 'electricidad-magnetismo', label: 'Electricidad y magnetismo', glyph: '🧲', accent: 'pink' },
  { id: 'fisica-moderna', label: 'Física moderna', glyph: '⚛️', accent: 'lime' },
  { id: 'herramientas', label: 'Herramientas docentes', glyph: '🧰', accent: 'gray' }
];

export function getCategory(categoryId) {
  return CATEGORIES.find((c) => c.id === categoryId) || null;
}

export function categoryLabel(categoryId) {
  return getCategory(categoryId)?.label || 'Otros';
}

/**
 * Módulo especial del menú: importar / exportar / ver trabajos en caché.
 */
export const WORKS_MODULE = {
  id: 'my-works',
  title: 'Mis trabajos',
  titleEn: 'My works',
  level: 'all',
  category: 'herramientas',
  glyph: '🗂️',
  accent: 'gray',
  blurb:
    'Importar o exportar JSON, y ver trabajos guardados o importados en este navegador.',
  serves: ['Mis trabajos', 'Guardar trabajos', 'Exportar e importar JSON', 'Trabajos en caché'],
  engineKey: null,
  status: 'ready',
  special: 'works',
  hub: true
};

/**
 * Alias de IDs antiguos → id canónico (trabajos / enlaces viejos).
 * Varios nombres del menú apuntaban al mismo motor; se unificaron.
 */
export const CATALOG_ALIASES = {
  // Cinemática unificada (antes 1D y 2D por separado, mismo motor)
  'one-d-motion': 'kinematics',
  'two-d-motion': 'kinematics',
  // Trabajos viejos “circuitos/electrodinámica” = Coulomb; el motor Ohm/RLC es circuits-dc-ac
  circuits: 'electric-field',
  electrodynamics: 'electric-field',
  electricity: 'electric-field',
  // Sonido = ondas acústicas
  'waves-energy-transfer': 'sound-waves',
  sound: 'sound-waves',
  // Oscilador (Ec/Ep); trabajo general con fricción es work-energy
  'conservation-energy': 'oscillatory-energy',
  'oscillatory-motion': 'oscillatory-energy',
  'potential-kinetic': 'oscillatory-energy',
  // Óptica: “wave-optics” antiguo era Snell; la ondulatoria real es interference-diffraction
  light: 'geometric-optics',
  'wave-optics': 'geometric-optics',
  optics: 'geometric-optics',
  // Rotación: ahora motor propio (antes se redirigía por error a magnetic-fields)
  'rotational-motion': 'rotational',
  // Fuerzas
  'forces-motion': 'forces-motion',
  dynamics: 'forces-motion'
};

/** @type {Array<Record<string, unknown>>} */
export const CATALOG = [
  {
    id: 'whiteboard',
    title: 'Pizarra',
    titleEn: 'Whiteboard',
    level: 'middle',
    category: 'herramientas',
    glyph: '🖊️',
    accent: 'gray',
    blurb: 'Pizarra en blanco para ejemplos del profesor (sin simulación física).',
    engineKey: 'whiteboard',
    status: 'ready',
    teacher: true,
    serves: ['Pizarra docente', 'Dibujo libre', 'Notas de clase', 'Explicar en vivo'],
    topic:
      'Herramienta docente: dibujo libre. No es un módulo de física con leyes propias.'
  },
  {
    id: 'units-error',
    title: 'Unidades y errores',
    titleEn: 'Units & error analysis',
    level: 'middle',
    category: 'medicion-vectores',
    glyph: '📐',
    accent: 'indigo',
    blurb: 'Conversión de unidades, cifras significativas y propagación de errores.',
    engineKey: 'units-error',
    status: 'ready',
    serves: [
      'Conversión de unidades',
      'Cifras significativas',
      'Error absoluto y relativo',
      'Unidades del SI',
      'Notación científica',
      'Múltiplos y submúltiplos'
    ],
    modes: [
      {
        id: 'convertir',
        label: 'Conversión',
        param: 'modo',
        value: 'convertir',
        serves: ['Conversión de unidades', 'Múltiplos y submúltiplos']
      },
      {
        id: 'errores',
        label: 'Cifras y errores',
        param: 'modo',
        value: 'errores',
        serves: ['Cifras significativas', 'Error absoluto y relativo']
      }
    ],
    topic:
      'Medición y tratamiento de errores: no simula una ley física, sino la metrología previa. Es la base de todos los demás módulos.'
  },
  {
    id: 'vectors',
    title: 'Vectores',
    titleEn: 'Vectors',
    level: 'middle',
    category: 'medicion-vectores',
    glyph: '🧭',
    accent: 'indigo',
    blurb: 'Suma de vectores por el paralelogramo y descomposición en componentes.',
    engineKey: 'vectors',
    status: 'ready',
    serves: [
      'Vectores y escalares',
      'Suma de vectores',
      'Componentes de un vector',
      'Método del paralelogramo',
      'Descomposición de fuerzas',
      'Dirección y magnitud'
    ],
    modes: [
      {
        id: 'suma',
        label: 'Suma de vectores',
        param: 'modo',
        value: 'suma',
        serves: ['Suma de vectores', 'Método del paralelogramo']
      },
      {
        id: 'componentes',
        label: 'Descomposición',
        param: 'modo',
        value: 'componentes',
        serves: ['Componentes de un vector', 'Descomposición de fuerzas']
      }
    ],
    topic:
      'Herramienta geométrica previa a dinámica: sin componentes no se suman fuerzas. Se distingue de cinemática porque aquí no hay tiempo ni trayectoria.'
  },
  {
    id: 'kinematics',
    title: 'Cinemática',
    titleEn: 'Kinematics',
    level: 'high',
    category: 'cinematica',
    glyph: '🏃',
    accent: 'blue',
    blurb:
      'MRU y MRUV en 1D o en el plano: posición, velocidad y aceleración (sin fuerzas).',
    engineKey: 'kinematics',
    status: 'ready',
    serves: [
      'Cinemática',
      'Movimiento lineal',
      'Movimiento en dos dimensiones',
      'Movimiento y posición',
      'MRU',
      'MRUV',
      'Caída libre'
    ],
    topic:
      'Describe cómo se mueve un objeto (x, v, a, t) sin preguntar por qué. Unifica el antiguo “movimiento 1D” y “2D”: el motor ya usa componentes vx, vy, ax, ay.'
  },
  {
    id: 'projectile',
    title: 'Proyectil',
    titleEn: 'Projectile motion',
    level: 'high',
    category: 'cinematica',
    glyph: '🚀',
    accent: 'blue',
    blurb: 'Tiro parabólico: alcance, altura máxima y tiempo de vuelo.',
    engineKey: 'projectile',
    status: 'ready',
    serves: [
      'Cinemática',
      'Proyectil',
      'Movimiento parabólico',
      'Alcance máximo',
      'Altura máxima',
      'Movimiento en dos dimensiones',
      'Caída libre'
    ],
    topic:
      'Cinemática 2D con aceleración constante: la horizontal MRU y la vertical caída libre. Complementa a “Cinemática” (allí las componentes son libres; aquí vienen de v₀ y θ).'
  },
  {
    id: 'forces-motion',
    title: 'Fuerzas y movimiento',
    titleEn: 'Forces & Motion',
    level: 'middle',
    category: 'dinamica-fuerzas',
    glyph: '💪',
    accent: 'red',
    blurb: 'Segunda ley de Newton: F = m·a. Fuerza neta, masa y aceleración.',
    engineKey: 'dynamics',
    status: 'ready',
    serves: [
      'Leyes del movimiento de Newton',
      'Leyes del movimiento',
      'Interacciones y fuerza',
      'Segunda ley',
      'Dinámica',
      'Diagrama de cuerpo libre'
    ],
    topic:
      'Dinámica: la fuerza neta explica la aceleración. Distinto de cinemática (allí no hay F).'
  },
  {
    id: 'mass-weight',
    title: 'Masa y peso',
    titleEn: 'Mass vs weight',
    level: 'middle',
    category: 'dinamica-fuerzas',
    glyph: '⚖️',
    accent: 'red',
    blurb: 'Distinguir masa (invariante) de peso (m·g, depende del astro).',
    engineKey: 'mass-weight',
    status: 'ready',
    serves: [
      'Masa y peso',
      'Peso y gravedad',
      'Fuerza gravitatoria',
      'Medición de masa',
      'Diferencia masa y peso',
      'Fuerza y sus efectos'
    ],
    modes: [
      {
        id: 'tierra',
        label: 'En la Tierra',
        param: 'astro',
        value: 'tierra',
        serves: ['Masa y peso', 'Peso y gravedad']
      },
      {
        id: 'luna',
        label: 'En la Luna',
        param: 'astro',
        value: 'luna',
        serves: ['Fuerza gravitatoria', 'Peso y gravedad']
      }
    ],
    topic:
      'Primer contacto con W = m·g y con la diferencia entre cantidad de materia y fuerza. No trata el movimiento: para eso están Fuerzas y movimiento / Gravedad universal.'
  },
  {
    id: 'inclined-plane',
    title: 'Plano inclinado',
    titleEn: 'Inclined plane',
    level: 'high',
    category: 'dinamica-fuerzas',
    glyph: '⛰️',
    accent: 'red',
    blurb: 'Descomposición del peso, fricción y polea con contrapeso.',
    engineKey: 'inclined-plane',
    status: 'ready',
    serves: [
      'Leyes del movimiento de Newton',
      'Dinámica',
      'Plano inclinado',
      'Diagrama de cuerpo libre',
      'Fricción y rozamiento',
      'Tensión y poleas',
      'Máquinas simples'
    ],
    modes: [
      {
        id: 'plano',
        label: 'Plano y fricción',
        param: 'polea',
        value: false,
        serves: ['Plano inclinado', 'Fricción y rozamiento']
      },
      {
        id: 'polea',
        label: 'Con polea',
        param: 'polea',
        value: true,
        serves: ['Tensión y poleas', 'Máquinas simples']
      }
    ],
    topic:
      'Aplicación de la segunda ley con ejes rotados: W∥ y N. Se diferencia de Fuerzas y movimiento (ejes cartesianos) y de Fricción (aquí el rozamiento se combina con la gravedad en el plano).'
  },
  {
    id: 'kinetic-force',
    title: 'Fuerza cinética',
    titleEn: 'Kinetic force & energy',
    level: 'middle',
    category: 'dinamica-fuerzas',
    glyph: '🚀',
    accent: 'red',
    blurb:
      'Fuerza neta → aceleración y energía cinética: a = F/m, Ec = ½mv², W = ΔEc.',
    engineKey: 'force-kinetic',
    status: 'ready',
    serves: [
      'Fuerza neta',
      'Energía cinética',
      'Trabajo y energía cinética',
      'a = F/m',
      'Segunda ley'
    ],
    topic:
      'Cómo una F neta cambia la velocidad y la Ec. Sin fricción. Complementa “Fuerzas y movimiento” (vectores F) y “Trabajo, energía” (con rozamiento).'
  },
  {
    id: 'friction',
    title: 'Fricción',
    titleEn: 'Friction',
    level: 'middle',
    category: 'dinamica-fuerzas',
    glyph: '🛷',
    accent: 'red',
    blurb:
      'Muñeco empuja una caja: fricción estática (no arranca) y cinética (desliza). μ_s, μ_k.',
    engineKey: 'friction',
    status: 'ready',
    serves: [
      'Fricción',
      'Fricción estática y cinética',
      'Coeficientes μ_s y μ_k',
      'Fuerza normal'
    ],
    topic:
      'f_s ≤ μ_s N en reposo; f_k = μ_k N al deslizar. Visual con personaje y caja. Distinto de trabajo-energía (allí se integra W de fricción).'
  },
  {
    id: 'statics',
    title: 'Estática',
    titleEn: 'Statics',
    level: 'high',
    category: 'dinamica-fuerzas',
    glyph: '🪢',
    accent: 'red',
    blurb:
      'Equilibrio de fuerzas: masa colgada de dos cuerdas. ΣFₓ = 0, ΣFᵧ = 0 y tensiones.',
    engineKey: 'statics',
    status: 'ready',
    serves: ['Equilibrio de fuerzas', 'Tensiones', 'ΣF = 0', 'Cuerpo en reposo'],
    topic:
      'Cuerpos en reposo bajo fuerzas equilibradas. Partícula con dos tensiones y peso. No es dinámica con aceleración.'
  },
  {
    id: 'momentum',
    title: 'Cantidad de movimiento',
    titleEn: 'Momentum',
    level: 'high',
    category: 'energia-momento',
    glyph: '🎱',
    accent: 'orange',
    blurb: 'Colisiones 1D elásticas e inelásticas; p = m·v y conservación.',
    engineKey: 'momentum',
    status: 'ready',
    serves: [
      'Momento lineal',
      'Impulso',
      'Conservación del momento lineal',
      'Choques elásticos e inelásticos',
      'Coeficiente de restitución'
    ],
    modes: [
      {
        id: 'choque',
        label: 'Choque',
        param: 'modo',
        value: 'choque',
        serves: ['Choques elásticos e inelásticos', 'Coeficiente de restitución']
      },
      {
        id: 'impulso',
        label: 'Impulso',
        param: 'modo',
        value: 'impulso',
        serves: ['Impulso', 'Teorema impulso-momento', 'Gráfica F–t']
      }
    ],
    topic: 'Choques 1D entre dos cuerpos. Para N cuerpos en el plano ver “Colisiones multi-cuerpo”.'
  },
  {
    id: 'collisions-2d',
    title: 'Colisiones multi-cuerpo (2D)',
    titleEn: 'Multi-body collisions (2D)',
    level: 'high',
    category: 'energia-momento',
    glyph: '🎯',
    accent: 'orange',
    blurb: 'Varios discos en el plano: choques con e, conservación de p⃗ y Ec.',
    engineKey: 'collisions-2d',
    status: 'ready',
    serves: [
      'Choques en dos dimensiones',
      'Conservación del momento',
      'Centro de masa',
      'Coeficiente de restitución'
    ],
    topic: 'Complementa el módulo 1D: N cuerpos, paredes y coeficiente de restitución.'
  },
  {
    id: 'work-energy',
    title: 'Trabajo, energía y potencia',
    titleEn: 'Work, Energy & Power',
    level: 'high',
    category: 'energia-momento',
    glyph: '⚙️',
    accent: 'orange',
    blurb: 'Bloque con F y rozamiento: W = F d cosθ, ΔEc y P = F·v.',
    engineKey: 'work-energy',
    status: 'ready',
    serves: [
      'Trabajo',
      'Energía',
      'Trabajo y energía',
      'Energía y su relación',
      'Fuerza y energía de trabajo',
      'Potencia',
      'Teorema trabajo-energía'
    ],
    topic:
      'Energía mecánica general con fricción. Distinto del resorte MHS (solo Ec↔Ep sin trabajo de rozamiento).'
  },
  {
    id: 'rotational',
    title: 'Circular y rotacional',
    titleEn: 'Circular & Rotational',
    level: 'high',
    category: 'rotacion-gravitacion',
    glyph: '🛞',
    accent: 'purple',
    blurb: 'MCU, τ = Iα, momento de inercia y precesión simple de peonza.',
    engineKey: 'rotational',
    status: 'ready',
    serves: [
      'Movimiento circular',
      'Movimiento circular y rotacional',
      'Momento angular',
      'Torque',
      'MCU',
      'Fuerza centrípeta',
      'Inercia rotacional'
    ],
    topic:
      'Cuerpo rígido / cinemática angular. No confundir con órbita de carga en B (Lorentz).'
  },
  {
    id: 'oscillatory-energy',
    title: 'Oscilaciones y energía',
    titleEn: 'Oscillations & Energy',
    level: 'advanced',
    category: 'oscilaciones-ondas',
    glyph: '🪀',
    accent: 'cyan',
    blurb:
      'MHS en un resorte: x = A cos(ωt+φ), periodo, y Ec ↔ Ep (Em constante).',
    engineKey: 'oscillatory',
    status: 'ready',
    serves: [
      'Vibraciones',
      'Vibraciones y ondas',
      'Movimiento armónico simple',
      'Ley de Hooke',
      'Resortes',
      'Energía en oscilaciones'
    ],
    topic:
      'Resorte armónico: Ec, Ep y Em. Para trabajo/potencia con rozamiento usa “Trabajo, energía y potencia”.'
  },
  {
    id: 'thermodynamics',
    title: 'Termodinámica',
    titleEn: 'Thermodynamics',
    level: 'advanced',
    category: 'termica',
    glyph: '🌡️',
    accent: 'amber',
    blurb: 'Gas ideal (P–V), ciclo de Carnot y conducción/difusión de calor.',
    engineKey: 'thermodynamics',
    status: 'ready',
    serves: [
      'Física térmica',
      'Gases ideales',
      'Leyes de los gases',
      'Ciclo de Carnot',
      'Máquinas térmicas',
      'Rendimiento'
    ],
    topic: 'Leyes térmicas, motores (η de Carnot) y transferencia de calor 1D.'
  },
  {
    id: 'sound-waves',
    title: 'Sonido y ondas',
    titleEn: 'Sound & Waves',
    level: 'high',
    category: 'oscilaciones-ondas',
    glyph: '🔊',
    accent: 'cyan',
    blurb:
      'Ondas sonoras: frentes, v = f·λ, temperatura y efecto Doppler (fuente móvil).',
    engineKey: 'sound',
    status: 'ready',
    serves: [
      'Ondas',
      'Vibraciones y ondas',
      'Sonido',
      'Efecto Doppler',
      'Intensidad sonora',
      'Escala de decibelios'
    ],
    topic:
      'Ondas mecánicas/acústicas. Ondas EM y óptica ondulatoria son módulos aparte.'
  },
  {
    id: 'electric-field',
    title: 'Campo eléctrico y cargas',
    titleEn: 'Electric Field & Charges',
    level: 'middle',
    category: 'electricidad-magnetismo',
    glyph: '⚡',
    accent: 'pink',
    blurb:
      'Ley de Coulomb, campo E y potencial entre cargas puntuales (electrostática).',
    engineKey: 'electricity',
    status: 'ready',
    serves: [
      'Campo eléctrico',
      'Ley de Coulomb',
      'Potencial eléctrico',
      'Cargas puntuales',
      'Dipolo'
    ],
    topic:
      'Electrostática de cargas. Circuitos Ohm/RLC están en “Circuitos DC/AC”.'
  },
  {
    id: 'circuits-dc-ac',
    title: 'Circuitos DC / AC',
    titleEn: 'DC / AC Circuits',
    level: 'high',
    category: 'electricidad-magnetismo',
    glyph: '🔌',
    accent: 'pink',
    blurb: 'Serie/paralelo (Ohm) e impedancia RLC con resonancia e i(t).',
    engineKey: 'circuits',
    status: 'ready',
    serves: [
      'Circuitos eléctricos',
      'Ley de Ohm',
      'Serie y paralelo',
      'RLC',
      'Circuitos RC',
      'Capacitores',
      'Dieléctricos',
      'Corriente alterna',
      'Resonancia'
    ],
    modes: [
      {
        id: 'series',
        label: 'Serie',
        param: 'mode',
        value: 'series',
        serves: ['Serie', 'Ley de Ohm', 'Resistencias en serie']
      },
      {
        id: 'parallel',
        label: 'Paralelo',
        param: 'mode',
        value: 'parallel',
        serves: ['Paralelo', 'Resistencias en paralelo']
      },
      {
        id: 'rlc',
        label: 'RLC forzado',
        param: 'mode',
        value: 'rlc',
        serves: ['RLC', 'Resonancia', 'Corriente alterna', 'Impedancia']
      }
    ],
    topic: 'Mallas resistivas y RLC forzado. No es el mapa de Coulomb.'
  },
  {
    id: 'magnetic-fields',
    title: 'Campos magnéticos',
    titleEn: 'Magnetic Fields · Lorentz',
    level: 'middle',
    category: 'electricidad-magnetismo',
    glyph: '🧲',
    accent: 'pink',
    blurb:
      'Carga en B uniforme: F = q(v×B). Círculo sin masa en el centro (≠ gravedad).',
    engineKey: 'magnetic',
    status: 'ready',
    serves: [
      'Fuerza de Lorentz',
      'Campo magnético',
      'Ciclotrón',
      'Carga en campo B',
      'Radio de Larmor'
    ],
    topic:
      'Fuerza de Lorentz / ciclotrón. No es órbita gravitatoria (eso es Gravedad o Kepler).'
  },
  {
    id: 'em-waves',
    title: 'Ondas electromagnéticas',
    titleEn: 'Electromagnetic Waves',
    level: 'advanced',
    category: 'electricidad-magnetismo',
    glyph: '📡',
    accent: 'pink',
    blurb: 'Onda plana: E ⊥ B ⊥ propagación; c = f·λ.',
    engineKey: 'em-waves',
    status: 'ready',
    serves: [
      'Ondas electromagnéticas',
      'Espectro electromagnético',
      'Polarización',
      'Ley de Malus',
      'Velocidad de la luz'
    ],
    topic: 'Luz como onda EM (Maxwell). Distinto de sonido y de franjas de Young.'
  },
  {
    id: 'universal-gravity',
    title: 'Gravedad universal',
    titleEn: 'Universal Gravity',
    level: 'high',
    category: 'rotacion-gravitacion',
    glyph: '🪐',
    accent: 'purple',
    blurb: 'Satélite alrededor de una masa central (F ∝ 1/r²). Hay cuerpo en el centro.',
    engineKey: 'gravity',
    status: 'ready',
    serves: [
      'Gravedad',
      'Teorías de la gravedad',
      'Gravitación universal',
      'Ley del inverso del cuadrado',
      'Campo gravitatorio'
    ],
    topic:
      'Gravitación con GM libre. Leyes de Kepler explícitas y flyby: módulo Kepler.'
  },
  {
    id: 'kepler-orbits',
    title: 'Kepler y asistencia gravitacional',
    titleEn: 'Kepler & Gravity Assist',
    level: 'advanced',
    category: 'rotacion-gravitacion',
    glyph: '🛰️',
    accent: 'purple',
    blurb: 'Elipses T²∝a³, periodo medido y sobrevuelo (slingshot) — gravedad, no B.',
    engineKey: 'kepler',
    status: 'ready',
    serves: [
      'Movimiento circular y gravitación',
      'Leyes de Kepler',
      'Órbitas',
      'Asistencia gravitacional'
    ],
    modes: [
      {
        id: 'kepler',
        label: 'Leyes de Kepler',
        param: 'mode',
        value: 'kepler',
        serves: ['Leyes de Kepler', 'T² ∝ a³', 'Elipses']
      },
      {
        id: 'flyby',
        label: 'Asistencia gravitacional',
        param: 'mode',
        value: 'flyby',
        serves: ['Asistencia gravitacional', 'Slingshot', 'Sondas espaciales']
      }
    ],
    topic: '3 leyes de Kepler + asistencia gravitacional para sondas.'
  },
  {
    id: 'geometric-optics',
    title: 'Luz y óptica geométrica',
    titleEn: 'Light & Geometric Optics',
    level: 'high',
    category: 'optica',
    glyph: '🔦',
    accent: 'green',
    blurb:
      'Interfaz plana: reflexión, refracción (Snell) y RTI. No forma imagen con lente.',
    engineKey: 'optics',
    status: 'ready',
    serves: [
      'Refracción',
      'Refracción y lentes',
      'Ley de Snell',
      'Reflexión',
      'Reflexión total interna',
      'Índice de refracción'
    ],
    topic:
      'Interfaz plana (Snell). Lentes delgadas e interferencia son módulos aparte.'
  },
  {
    id: 'thin-lenses',
    title: 'Lentes delgadas',
    titleEn: 'Thin Lenses · imagen',
    level: 'high',
    category: 'optica',
    glyph: '🔍',
    accent: 'green',
    blurb:
      'Lente convergente/divergente: focos F, objeto → imagen y 1/f = 1/d₀ + 1/dᵢ.',
    engineKey: 'lenses',
    status: 'ready',
    serves: [
      'Lentes',
      'Refracción y lentes',
      'Lentes delgadas',
      'Formación de imágenes',
      'Aumento'
    ],
    topic: 'Formación de imagen con lente convergente/divergente (diagrama de rayos).'
  },
  {
    id: 'interference-diffraction',
    title: 'Interferencia y difracción',
    titleEn: 'Interference & Diffraction',
    level: 'advanced',
    category: 'optica',
    glyph: '🌈',
    accent: 'green',
    blurb: 'Doble rendija (Young) e intensidad de difracción de una rendija.',
    engineKey: 'wave-optics',
    status: 'ready',
    serves: [
      'Interferencia',
      'Difracción',
      'Doble rendija',
      'Franjas de Young',
      'Óptica ondulatoria'
    ],
    topic: 'Óptica ondulatoria real (franjas). No es Snell de interfaz plana.'
  },
  {
    id: 'atomic-physics',
    title: 'Física atómica',
    titleEn: 'Atomic Physics',
    level: 'advanced',
    category: 'fisica-moderna',
    glyph: '⚛️',
    accent: 'lime',
    blurb: 'Modelo de Bohr: niveles, órbitas y fotones en saltos de energía.',
    engineKey: 'atomic',
    status: 'ready',
    serves: [
      'Física atómica',
      'Modelo de Bohr',
      'Niveles de energía',
      'Transiciones atómicas',
      'Espectros'
    ],
    topic: 'Estructura atómica cuantizada (Bohr). Fotoeléctrico y túnel son otros módulos.'
  },
  {
    id: 'photoelectric',
    title: 'Efecto fotoeléctrico',
    titleEn: 'Photoelectric Effect',
    level: 'advanced',
    category: 'fisica-moderna',
    glyph: '☀️',
    accent: 'lime',
    blurb: 'hf y trabajo de extracción φ: K_max = hf − φ y frecuencia umbral.',
    engineKey: 'photoelectric',
    status: 'ready',
    serves: [
      'Efecto fotoeléctrico',
      'Fotones',
      'Trabajo de extracción',
      'Frecuencia umbral',
      'Física cuántica'
    ],
    topic: 'Cuantos de luz e electrones emitidos; intensidad vs K_max.'
  },
  {
    id: 'radioactivity',
    title: 'Decaimiento radiactivo',
    titleEn: 'Radioactive Decay',
    level: 'advanced',
    category: 'fisica-moderna',
    glyph: '☢️',
    accent: 'lime',
    blurb: 'N(t) = N₀ e^(−λt), vida media y actividad A = λN.',
    engineKey: 'radioactivity',
    status: 'ready',
    serves: [
      'Radiactividad',
      'Decaimiento radiactivo',
      'Vida media',
      'Actividad',
      'Desintegración nuclear'
    ],
    topic: 'Proceso estocástico de desintegración nuclear.'
  },
  {
    id: 'quantum-tunneling',
    title: 'Túnel cuántico',
    titleEn: 'Quantum Tunneling',
    level: 'advanced',
    category: 'fisica-moderna',
    glyph: '🕳️',
    accent: 'lime',
    blurb: 'Barrera de potencial: T ≈ e^(−2κL) aunque E < V₀.',
    engineKey: 'tunneling',
    status: 'ready',
    serves: [
      'Túnel cuántico',
      'Barrera de potencial',
      'Efecto túnel',
      'Microscopio STM',
      'Fusión estelar'
    ],
    topic: 'Penetración de barrera; base del STM y fusión estelar.'
  },
  {
    id: 'particle-physics',
    title: 'Cargas en campo B (partículas)',
    titleEn: 'Charges in B (particles)',
    level: 'advanced',
    category: 'fisica-moderna',
    glyph: '🧪',
    accent: 'lime',
    blurb:
      'Varias especies (e⁻, p⁺, α…) en B: curvatura y r = mv/|q|B (estilo espectrómetro).',
    engineKey: 'particles',
    status: 'ready',
    serves: [
      'Partículas',
      'Espectrómetro de masas',
      'Radio de Larmor',
      'Curvatura en campo B',
      'Detectores'
    ],
    topic:
      'Espectrómetro multi-especie. Intro de una carga: “Campos magnéticos”.'
  }
];

/**
 * Ruta del motor por convención `./modules/<engineKey>.js`.
 * §4.5: deriva `ENGINE_PATHS` de esta lista — añadir un módulo no exige tocar
 * app.js ni challenges.js, solo crear el archivo y añadir la entrada aquí.
 */
export function enginePath(engineKey) {
  return `./modules/${engineKey}.js`;
}

/** `{ engineKey: ruta }` derivado del catálogo (§4.5). */
export function buildEnginePaths() {
  const out = {};
  for (const m of CATALOG) {
    if (m.engineKey && !(m.engineKey in out)) {
      out[m.engineKey] = enginePath(m.engineKey);
    }
  }
  out.placeholder = './modules/placeholder.js';
  return out;
}

/** `{ engineKey: etiqueta }` derivado del catálogo (§4.5). */
export function buildChallengeLabels() {
  const out = {};
  for (const m of CATALOG) {
    if (!m.engineKey) continue;
    out[m.engineKey] = m.challengeLabel || m.title;
  }
  return out;
}

function resolveId(id) {
  if (!id) return id;
  if (id === WORKS_MODULE.id) return id;
  let cur = id;
  const seen = new Set();
  while (CATALOG_ALIASES[cur] && CATALOG_ALIASES[cur] !== cur && !seen.has(cur)) {
    seen.add(cur);
    cur = CATALOG_ALIASES[cur];
  }
  return cur;
}

export function getByLevel(levelId) {
  if (!levelId || levelId === 'all') return CATALOG;
  return CATALOG.filter((m) => m.level === levelId);
}

export function getById(id) {
  if (id === WORKS_MODULE.id) return { ...WORKS_MODULE };
  const resolved = resolveId(id);
  const found = CATALOG.find((m) => m.id === resolved);
  if (!found) return null;
  // Si venía de un alias, devolver la entrada canónica (id nuevo)
  return { ...found };
}

/**
 * Listado único para el menú principal y la barra lateral.
 * “Mis trabajos” va primero.
 */
export function getUnifiedCatalog() {
  return [{ ...WORKS_MODULE }, ...CATALOG.map((m) => ({ ...m }))];
}

/** Módulos de simulación (sin el hub de trabajos). */
export function getSimulationCatalog() {
  return getUnifiedCatalog().filter((m) => m.special !== 'works');
}
