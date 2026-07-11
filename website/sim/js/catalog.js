/**
 * Catálogo curricular de simulaciones por nivel.
 */

export const LEVELS = [
  { id: 'middle', label: 'Secundaria', labelEn: 'Middle School' },
  { id: 'high', label: 'Bachillerato', labelEn: 'High School' },
  { id: 'advanced', label: 'Avanzado', labelEn: 'Advanced' }
];

/** @type {import('./catalog.js').CatalogModule[]} */
export const CATALOG = [
  // Docente
  {
    id: 'whiteboard',
    title: 'Pizarra',
    titleEn: 'Whiteboard',
    level: 'middle',
    blurb: 'Pizarra en blanco para ejemplos del profesor (también en Bachillerato y Avanzado).',
    engineKey: 'whiteboard',
    status: 'ready',
    teacher: true
  },

  // —— Middle School ——
  {
    id: 'magnetic-fields',
    title: 'Campos magnéticos',
    titleEn: 'Magnetic Fields',
    level: 'middle',
    blurb: 'Carga en B uniforme: órbita circular y F = qvB.',
    engineKey: 'magnetic',
    status: 'ready'
  },
  {
    id: 'forces-motion',
    title: 'Fuerzas y movimiento',
    titleEn: 'Forces & Motion',
    level: 'middle',
    blurb: 'Fuerza neta, masa y aceleración (F = ma). Espacio infinito disponible.',
    engineKey: 'dynamics',
    status: 'ready'
  },
  {
    id: 'circuits',
    title: 'Circuitos',
    titleEn: 'Circuits',
    level: 'middle',
    blurb: 'Ley de Ohm, serie/paralelo y Kirchhoff.',
    engineKey: 'electricity',
    status: 'ready'
  },
  {
    id: 'potential-kinetic',
    title: 'Energía potencial y cinética',
    titleEn: 'Potential & Kinetic Energy',
    level: 'middle',
    blurb: 'Energía y fuerzas: exploración con dinámica.',
    engineKey: 'dynamics',
    status: 'ready'
  },
  {
    id: 'waves-energy-transfer',
    title: 'Ondas y transferencia de energía',
    titleEn: 'Waves & Energy Transfer',
    level: 'middle',
    blurb: 'Frentes de onda y propagación (vista con módulo de sonido).',
    engineKey: 'sound',
    status: 'ready'
  },
  {
    id: 'conservation-energy',
    title: 'Conservación de la energía',
    titleEn: 'Conservation of Energy',
    level: 'middle',
    blurb: 'Em en el oscilador y sistemas dinámicos.',
    engineKey: 'oscillatory',
    status: 'ready'
  },

  // —— High School ——
  {
    id: 'whiteboard-hs',
    title: 'Pizarra',
    titleEn: 'Whiteboard',
    level: 'high',
    blurb: 'Pizarra docente para ejemplos en bachillerato.',
    engineKey: 'whiteboard',
    status: 'ready',
    teacher: true
  },
  {
    id: 'light',
    title: 'Luz',
    titleEn: 'Light',
    level: 'high',
    blurb: 'Óptica geométrica: espejos y lentes.',
    engineKey: 'optics',
    status: 'ready'
  },
  {
    id: 'one-d-motion',
    title: 'Movimiento unidimensional',
    titleEn: 'One-dimensional Motion',
    level: 'high',
    blurb: 'MRU/MRUV con espacio infinito y cámara.',
    engineKey: 'kinematics',
    status: 'ready'
  },
  {
    id: 'momentum',
    title: 'Momentum',
    titleEn: 'Momentum',
    level: 'high',
    blurb: 'Colisiones 1D elásticas e inelásticas.',
    engineKey: 'momentum',
    status: 'ready'
  },
  {
    id: 'sound',
    title: 'Sonido',
    titleEn: 'Sound',
    level: 'high',
    blurb: 'Velocidad del sonido y efecto Doppler.',
    engineKey: 'sound',
    status: 'ready'
  },
  {
    id: 'electrodynamics',
    title: 'Electrodinámica',
    titleEn: 'Electrodynamics',
    level: 'high',
    blurb: 'Circuitos y cargas en movimiento (base).',
    engineKey: 'electricity',
    status: 'ready'
  },
  {
    id: 'universal-gravity',
    title: 'Gravedad universal',
    titleEn: 'Universal Gravity',
    level: 'high',
    blurb: 'Órbitas 2D con masa central fija.',
    engineKey: 'gravity',
    status: 'ready'
  },

  // —— Advanced ——
  {
    id: 'whiteboard-adv',
    title: 'Pizarra',
    titleEn: 'Whiteboard',
    level: 'advanced',
    blurb: 'Pizarra docente para temas avanzados.',
    engineKey: 'whiteboard',
    status: 'ready',
    teacher: true
  },
  {
    id: 'two-d-motion',
    title: 'Movimiento bidimensional',
    titleEn: 'Two-dimensional Motion',
    level: 'advanced',
    blurb: 'Movimiento en el plano con vectores (cinemática).',
    engineKey: 'kinematics',
    status: 'ready'
  },
  {
    id: 'oscillatory-motion',
    title: 'Movimiento oscilatorio',
    titleEn: 'Oscillatory Motion',
    level: 'advanced',
    blurb: 'MHS: resorte, periodo y energía.',
    engineKey: 'oscillatory',
    status: 'ready'
  },
  {
    id: 'atomic-physics',
    title: 'Física atómica',
    titleEn: 'Atomic Physics',
    level: 'advanced',
    blurb: 'Introducción conceptual (en desarrollo).',
    engineKey: null,
    status: 'soon'
  },
  {
    id: 'particle-physics',
    title: 'Física de partículas',
    titleEn: 'Particle Physics',
    level: 'advanced',
    blurb: 'Introducción conceptual (en desarrollo).',
    engineKey: null,
    status: 'soon'
  },
  {
    id: 'wave-optics',
    title: 'Óptica ondulatoria',
    titleEn: 'Wave Optics',
    level: 'advanced',
    blurb: 'Base óptica; interferencia dedicada próximamente.',
    engineKey: 'optics',
    status: 'ready'
  },
  {
    id: 'rotational-motion',
    title: 'Movimiento rotacional',
    titleEn: 'Rotational Motion',
    level: 'advanced',
    blurb: 'Órbita y movimiento circular (usa gravedad / B).',
    engineKey: 'magnetic',
    status: 'ready'
  }
];

export function getByLevel(levelId) {
  return CATALOG.filter((m) => m.level === levelId);
}

export function getById(id) {
  return CATALOG.find((m) => m.id === id) || null;
}
