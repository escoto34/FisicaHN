/**
 * Catálogo de simulaciones (listado unificado, sin duplicados).
 *
 * Cada entrada = un motor real distinto o un enfoque claramente diferente.
 * IDs antiguos se redirigen en getById() para trabajos guardados previos.
 */

export const LEVELS = [
  { id: 'middle', label: 'Secundaria', labelEn: 'Middle School' },
  { id: 'high', label: 'Bachillerato', labelEn: 'High School' },
  { id: 'advanced', label: 'Avanzado', labelEn: 'Advanced' }
];

/**
 * Módulo especial del menú: importar / exportar / ver trabajos en caché.
 */
export const WORKS_MODULE = {
  id: 'my-works',
  title: 'Mis trabajos',
  titleEn: 'My works',
  level: 'all',
  blurb:
    'Importar o exportar JSON, y ver trabajos guardados o importados en este navegador.',
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
    blurb: 'Pizarra en blanco para ejemplos del profesor (sin simulación física).',
    engineKey: 'whiteboard',
    status: 'ready',
    teacher: true,
    topic:
      'Herramienta docente: dibujo libre. No es un módulo de física con leyes propias.'
  },
  {
    id: 'kinematics',
    title: 'Cinemática',
    titleEn: 'Kinematics',
    level: 'high',
    blurb:
      'MRU y MRUV en 1D o en el plano: posición, velocidad y aceleración (sin fuerzas).',
    engineKey: 'kinematics',
    status: 'ready',
    topic:
      'Describe cómo se mueve un objeto (x, v, a, t) sin preguntar por qué. Unifica el antiguo “movimiento 1D” y “2D”: el motor ya usa componentes vx, vy, ax, ay.'
  },
  {
    id: 'forces-motion',
    title: 'Fuerzas y movimiento',
    titleEn: 'Forces & Motion',
    level: 'middle',
    blurb: 'Segunda ley de Newton: F = m·a. Fuerza neta, masa y aceleración.',
    engineKey: 'dynamics',
    status: 'ready',
    topic:
      'Dinámica: la fuerza neta explica la aceleración. Distinto de cinemática (allí no hay F).'
  },
  {
    id: 'kinetic-force',
    title: 'Fuerza cinética',
    titleEn: 'Kinetic force & energy',
    level: 'middle',
    blurb:
      'Fuerza neta → aceleración y energía cinética: a = F/m, Ec = ½mv², W = ΔEc.',
    engineKey: 'force-kinetic',
    status: 'ready',
    topic:
      'Cómo una F neta cambia la velocidad y la Ec. Sin fricción. Complementa “Fuerzas y movimiento” (vectores F) y “Trabajo, energía” (con rozamiento).'
  },
  {
    id: 'friction',
    title: 'Fricción',
    titleEn: 'Friction',
    level: 'middle',
    blurb:
      'Muñeco empuja una caja: fricción estática (no arranca) y cinética (desliza). μ_s, μ_k.',
    engineKey: 'friction',
    status: 'ready',
    topic:
      'f_s ≤ μ_s N en reposo; f_k = μ_k N al deslizar. Visual con personaje y caja. Distinto de trabajo-energía (allí se integra W de fricción).'
  },
  {
    id: 'statics',
    title: 'Estática',
    titleEn: 'Statics',
    level: 'high',
    blurb:
      'Equilibrio de fuerzas: masa colgada de dos cuerdas. ΣFₓ = 0, ΣFᵧ = 0 y tensiones.',
    engineKey: 'statics',
    status: 'ready',
    topic:
      'Cuerpos en reposo bajo fuerzas equilibradas. Partícula con dos tensiones y peso. No es dinámica con aceleración.'
  },
  {
    id: 'momentum',
    title: 'Cantidad de movimiento',
    titleEn: 'Momentum',
    level: 'high',
    blurb: 'Colisiones 1D elásticas e inelásticas; p = m·v y conservación.',
    engineKey: 'momentum',
    status: 'ready',
    topic: 'Choques 1D entre dos cuerpos. Para N cuerpos en el plano ver “Colisiones multi-cuerpo”.'
  },
  {
    id: 'collisions-2d',
    title: 'Colisiones multi-cuerpo (2D)',
    titleEn: 'Multi-body collisions (2D)',
    level: 'high',
    blurb: 'Varios discos en el plano: choques con e, conservación de p⃗ y Ec.',
    engineKey: 'collisions-2d',
    status: 'ready',
    topic: 'Complementa el módulo 1D: N cuerpos, paredes y coeficiente de restitución.'
  },
  {
    id: 'work-energy',
    title: 'Trabajo, energía y potencia',
    titleEn: 'Work, Energy & Power',
    level: 'high',
    blurb: 'Bloque con F y rozamiento: W = F d cosθ, ΔEc y P = F·v.',
    engineKey: 'work-energy',
    status: 'ready',
    topic:
      'Energía mecánica general con fricción. Distinto del resorte MHS (solo Ec↔Ep sin trabajo de rozamiento).'
  },
  {
    id: 'rotational',
    title: 'Circular y rotacional',
    titleEn: 'Circular & Rotational',
    level: 'high',
    blurb: 'MCU, τ = Iα, momento de inercia y precesión simple de peonza.',
    engineKey: 'rotational',
    status: 'ready',
    topic:
      'Cuerpo rígido / cinemática angular. No confundir con órbita de carga en B (Lorentz).'
  },
  {
    id: 'oscillatory-energy',
    title: 'Oscilaciones y energía',
    titleEn: 'Oscillations & Energy',
    level: 'advanced',
    blurb:
      'MHS en un resorte: x = A cos(ωt+φ), periodo, y Ec ↔ Ep (Em constante).',
    engineKey: 'oscillatory',
    status: 'ready',
    topic:
      'Resorte armónico: Ec, Ep y Em. Para trabajo/potencia con rozamiento usa “Trabajo, energía y potencia”.'
  },
  {
    id: 'thermodynamics',
    title: 'Termodinámica',
    titleEn: 'Thermodynamics',
    level: 'advanced',
    blurb: 'Gas ideal (P–V), ciclo de Carnot y conducción/difusión de calor.',
    engineKey: 'thermodynamics',
    status: 'ready',
    topic: 'Leyes térmicas, motores (η de Carnot) y transferencia de calor 1D.'
  },
  {
    id: 'sound-waves',
    title: 'Sonido y ondas',
    titleEn: 'Sound & Waves',
    level: 'high',
    blurb:
      'Ondas sonoras: frentes, v = f·λ, temperatura y efecto Doppler (fuente móvil).',
    engineKey: 'sound',
    status: 'ready',
    topic:
      'Ondas mecánicas/acústicas. Ondas EM y óptica ondulatoria son módulos aparte.'
  },
  {
    id: 'electric-field',
    title: 'Campo eléctrico y cargas',
    titleEn: 'Electric Field & Charges',
    level: 'middle',
    blurb:
      'Ley de Coulomb, campo E y potencial entre cargas puntuales (electrostática).',
    engineKey: 'electricity',
    status: 'ready',
    topic:
      'Electrostática de cargas. Circuitos Ohm/RLC están en “Circuitos DC/AC”.'
  },
  {
    id: 'circuits-dc-ac',
    title: 'Circuitos DC / AC',
    titleEn: 'DC / AC Circuits',
    level: 'high',
    blurb: 'Serie/paralelo (Ohm) e impedancia RLC con resonancia e i(t).',
    engineKey: 'circuits',
    status: 'ready',
    topic: 'Mallas resistivas y RLC forzado. No es el mapa de Coulomb.'
  },
  {
    id: 'magnetic-fields',
    title: 'Campos magnéticos',
    titleEn: 'Magnetic Fields · Lorentz',
    level: 'middle',
    blurb:
      'Carga en B uniforme: F = q(v×B). Círculo sin masa en el centro (≠ gravedad).',
    engineKey: 'magnetic',
    status: 'ready',
    topic:
      'Fuerza de Lorentz / ciclotrón. No es órbita gravitatoria (eso es Gravedad o Kepler).'
  },
  {
    id: 'em-waves',
    title: 'Ondas electromagnéticas',
    titleEn: 'Electromagnetic Waves',
    level: 'advanced',
    blurb: 'Onda plana: E ⊥ B ⊥ propagación; c = f·λ.',
    engineKey: 'em-waves',
    status: 'ready',
    topic: 'Luz como onda EM (Maxwell). Distinto de sonido y de franjas de Young.'
  },
  {
    id: 'universal-gravity',
    title: 'Gravedad universal',
    titleEn: 'Universal Gravity',
    level: 'high',
    blurb: 'Satélite alrededor de una masa central (F ∝ 1/r²). Hay cuerpo en el centro.',
    engineKey: 'gravity',
    status: 'ready',
    topic:
      'Gravitación con GM libre. Leyes de Kepler explícitas y flyby: módulo Kepler.'
  },
  {
    id: 'kepler-orbits',
    title: 'Kepler y asistencia gravitacional',
    titleEn: 'Kepler & Gravity Assist',
    level: 'advanced',
    blurb: 'Elipses T²∝a³, periodo medido y sobrevuelo (slingshot) — gravedad, no B.',
    engineKey: 'kepler',
    status: 'ready',
    topic: '3 leyes de Kepler + asistencia gravitacional para sondas.'
  },
  {
    id: 'geometric-optics',
    title: 'Luz y óptica geométrica',
    titleEn: 'Light & Geometric Optics',
    level: 'high',
    blurb:
      'Interfaz plana: reflexión, refracción (Snell) y RTI. No forma imagen con lente.',
    engineKey: 'optics',
    status: 'ready',
    topic:
      'Interfaz plana (Snell). Lentes delgadas e interferencia son módulos aparte.'
  },
  {
    id: 'thin-lenses',
    title: 'Lentes delgadas',
    titleEn: 'Thin Lenses · imagen',
    level: 'high',
    blurb:
      'Lente convergente/divergente: focos F, objeto → imagen y 1/f = 1/d₀ + 1/dᵢ.',
    engineKey: 'lenses',
    status: 'ready',
    topic: 'Formación de imagen con lente convergente/divergente (diagrama de rayos).'
  },
  {
    id: 'interference-diffraction',
    title: 'Interferencia y difracción',
    titleEn: 'Interference & Diffraction',
    level: 'advanced',
    blurb: 'Doble rendija (Young) e intensidad de difracción de una rendija.',
    engineKey: 'wave-optics',
    status: 'ready',
    topic: 'Óptica ondulatoria real (franjas). No es Snell de interfaz plana.'
  },
  {
    id: 'atomic-physics',
    title: 'Física atómica',
    titleEn: 'Atomic Physics',
    level: 'advanced',
    blurb: 'Modelo de Bohr: niveles, órbitas y fotones en saltos de energía.',
    engineKey: 'atomic',
    status: 'ready',
    topic: 'Estructura atómica cuantizada (Bohr). Fotoeléctrico y túnel son otros módulos.'
  },
  {
    id: 'photoelectric',
    title: 'Efecto fotoeléctrico',
    titleEn: 'Photoelectric Effect',
    level: 'advanced',
    blurb: 'hf y trabajo de extracción φ: K_max = hf − φ y frecuencia umbral.',
    engineKey: 'photoelectric',
    status: 'ready',
    topic: 'Cuantos de luz e electrones emitidos; intensidad vs K_max.'
  },
  {
    id: 'radioactivity',
    title: 'Decaimiento radiactivo',
    titleEn: 'Radioactive Decay',
    level: 'advanced',
    blurb: 'N(t) = N₀ e^(−λt), vida media y actividad A = λN.',
    engineKey: 'radioactivity',
    status: 'ready',
    topic: 'Proceso estocástico de desintegración nuclear.'
  },
  {
    id: 'quantum-tunneling',
    title: 'Túnel cuántico',
    titleEn: 'Quantum Tunneling',
    level: 'advanced',
    blurb: 'Barrera de potencial: T ≈ e^(−2κL) aunque E < V₀.',
    engineKey: 'tunneling',
    status: 'ready',
    topic: 'Penetración de barrera; base del STM y fusión estelar.'
  },
  {
    id: 'particle-physics',
    title: 'Cargas en campo B (partículas)',
    titleEn: 'Charges in B (particles)',
    level: 'advanced',
    blurb:
      'Varias especies (e⁻, p⁺, α…) en B: curvatura y r = mv/|q|B (estilo espectrómetro).',
    engineKey: 'particles',
    status: 'ready',
    topic:
      'Espectrómetro multi-especie. Intro de una carga: “Campos magnéticos”.'
  }
];

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
