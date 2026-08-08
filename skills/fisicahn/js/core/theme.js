/**
 * @fileoverview theme — tokens de color y perfiles de presentación (§2.5).
 *
 * Antes de esta WAVE el fondo estaba escrito a mano en `renderer.js:88`
 * (`#0f0f1a`) y cada módulo elegía sus propios literales de color: cambiar una
 * sola tonalidad obligaba a editar 27 archivos. Aquí el color pasa a ser un
 * *token* que la escena resuelve en tiempo de dibujo, así que un módulo escribe
 * `theme.velocity` y el perfil activo decide el valor.
 *
 * Un tema es más que una paleta: lleva también los multiplicadores de
 * presentación (grosor de trazo, tamaño de tipografía, detalle de rejilla) que
 * hacen posible el **modo proyector**.
 *
 * Regla que acompaña a la paleta segura: **el color nunca es el único portador
 * de información**. Las primitivas que distinguen magnitudes por color aceptan
 * además `dash` y `label`, y `colorSafe` los exige.
 */

const STORAGE_KEY = 'fisicahn.theme';

/** Paleta base compartida por los perfiles oscuros. */
const DARK_SERIES = ['#4ea1ff', '#3ecf7a', '#f07178', '#e8a838', '#ce93d8', '#4dd0e1'];
/** Paleta segura para deuteranopía/protanopía (azul–naranja–gris, sin rojo/verde). */
const SAFE_SERIES = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00'];

/**
 * @typedef {object} Theme
 * @property {string} name
 * @property {string} label
 * @property {boolean} dark
 * @property {string} bg          Fondo del lienzo.
 * @property {string} grid        Rejilla menor.
 * @property {string} gridStrong  Rejilla mayor.
 * @property {string} axis        Ejes.
 * @property {string} axisLabel   Números de los ejes.
 * @property {string} text        Texto principal sobre el lienzo.
 * @property {string} textDim     Texto secundario.
 * @property {string} hudBg       Fondo de chips y tooltips.
 * @property {string} hudBorder   Borde de chips y tooltips.
 * @property {string} mass        Cuerpo primario.
 * @property {string} mass2       Cuerpo secundario.
 * @property {string} velocity    Vector velocidad.
 * @property {string} force       Vector fuerza.
 * @property {string} accel       Vector aceleración.
 * @property {string} energy      Energía / trabajo.
 * @property {string} field       Campos E y B.
 * @property {string} ray         Rayo incidente.
 * @property {string} rayAlt      Rayo refractado / reflejado.
 * @property {string} spring      Muelles y cuerdas.
 * @property {string} trail       Estelas.
 * @property {string} ok
 * @property {string} warn
 * @property {string} danger
 * @property {string[]} series    Paleta cíclica para gráficas.
 * @property {number} lineScale   Multiplicador de grosor de trazo.
 * @property {number} fontScale   Multiplicador del tamaño de tipografía.
 * @property {'full'|'axes'} gridDetail
 * @property {boolean} glow       Sombras de brillo (caras en proyector).
 * @property {boolean} requireNonColorCue  Fuerza trazo/etiqueta además del color.
 */

/** @type {Object<string, Theme>} */
export const THEMES = {
  dark: {
    name: 'dark',
    label: 'Oscuro',
    dark: true,
    bg: '#0c0f14',
    grid: 'rgba(255,255,255,0.06)',
    gridStrong: 'rgba(255,255,255,0.12)',
    axis: 'rgba(255,255,255,0.28)',
    axisLabel: 'rgba(255,255,255,0.35)',
    text: '#e8eef6',
    textDim: 'rgba(255,255,255,0.55)',
    hudBg: 'rgba(12,15,20,0.88)',
    hudBorder: 'rgba(255,255,255,0.18)',
    mass: '#4ea1ff',
    mass2: '#e8a838',
    velocity: '#3ecf7a',
    force: '#f07178',
    accel: '#ce93d8',
    energy: '#3ecf7a',
    field: '#4dd0e1',
    ray: '#ffd54f',
    rayAlt: '#80d8ff',
    spring: '#b0bec5',
    trail: 'rgba(78,161,255,0.55)',
    ok: '#3ecf7a',
    warn: '#e8a838',
    danger: '#f07178',
    series: DARK_SERIES,
    lineScale: 1,
    fontScale: 1,
    gridDetail: 'full',
    glow: true,
    requireNonColorCue: false
  },

  light: {
    name: 'light',
    label: 'Claro',
    dark: false,
    bg: '#f7f8fb',
    grid: 'rgba(20,24,40,0.07)',
    gridStrong: 'rgba(20,24,40,0.14)',
    axis: 'rgba(20,24,40,0.40)',
    axisLabel: 'rgba(20,24,40,0.55)',
    text: '#1b1f2a',
    textDim: 'rgba(27,31,42,0.65)',
    hudBg: 'rgba(255,255,255,0.92)',
    hudBorder: 'rgba(20,24,40,0.18)',
    mass: '#1565c0',
    mass2: '#e65100',
    velocity: '#1b7f4f',
    force: '#c62828',
    accel: '#6a1b9a',
    energy: '#2e7d32',
    field: '#00838f',
    ray: '#ef6c00',
    rayAlt: '#0277bd',
    spring: '#546e7a',
    trail: 'rgba(21,101,192,0.45)',
    ok: '#2b9e66',
    warn: '#c98a1e',
    danger: '#d95f66',
    series: ['#1565c0', '#1b7f4f', '#c62828', '#e65100', '#6a1b9a', '#00838f'],
    lineScale: 1,
    fontScale: 1,
    gridDetail: 'full',
    glow: false,
    requireNonColorCue: false
  },

  // Perfil de presentación completo, no sólo una paleta: los proyectores comen
  // el detalle fino, así que el trazo se dobla, la tipografía crece y la
  // rejilla se reduce a los ejes principales para no competir con la escena.
  projector: {
    name: 'projector',
    label: 'Proyector',
    dark: false,
    bg: '#ffffff',
    grid: 'rgba(0,0,0,0.10)',
    gridStrong: 'rgba(0,0,0,0.22)',
    axis: '#111111',
    axisLabel: '#333333',
    text: '#000000',
    textDim: '#333333',
    hudBg: 'rgba(255,255,255,0.95)',
    hudBorder: '#111111',
    mass: '#003f8f',
    mass2: '#a34700',
    velocity: '#006b3c',
    force: '#b00020',
    accel: '#5b2c8f',
    energy: '#006b3c',
    field: '#00606b',
    ray: '#a34700',
    rayAlt: '#003f8f',
    spring: '#333333',
    trail: 'rgba(0,63,143,0.4)',
    ok: '#2b9e66',
    warn: '#c98a1e',
    danger: '#d95f66',
    series: ['#003f8f', '#a34700', '#006b3c', '#b00020', '#5b2c8f', '#00606b'],
    lineScale: 2,
    fontScale: 1.6,
    gridDetail: 'axes',
    glow: false,
    requireNonColorCue: true
  },

  // ~8 % de los estudiantes varones no distingue rojo de verde. En `optics` y
  // `circuits` el color es hoy el único canal que separa magnitudes, así que
  // este perfil cambia la paleta *y* activa las señales redundantes.
  colorSafe: {
    name: 'colorSafe',
    label: 'Daltonismo',
    dark: true,
    bg: '#0c0f14',
    grid: 'rgba(255,255,255,0.07)',
    gridStrong: 'rgba(255,255,255,0.14)',
    axis: 'rgba(255,255,255,0.32)',
    axisLabel: 'rgba(255,255,255,0.40)',
    text: '#e8eef6',
    textDim: 'rgba(255,255,255,0.6)',
    hudBg: 'rgba(12,15,20,0.88)',
    hudBorder: 'rgba(255,255,255,0.22)',
    mass: '#56b4e9',
    mass2: '#e69f00',
    velocity: '#009e73',
    force: '#d55e00',
    accel: '#cc79a7',
    energy: '#f0e442',
    field: '#0072b2',
    ray: '#e69f00',
    rayAlt: '#56b4e9',
    spring: '#bbbbbb',
    trail: 'rgba(86,180,233,0.5)',
    ok: '#009e73',
    warn: '#e69f00',
    danger: '#d55e00',
    series: SAFE_SERIES,
    lineScale: 1.25,
    fontScale: 1.1,
    gridDetail: 'full',
    glow: false,
    requireNonColorCue: true
  }
};

/** Orden de rotación del atajo de teclado. */
export const THEME_ORDER = ['dark', 'light', 'projector', 'colorSafe'];

let _current = THEMES.dark;
/** @type {Set<(t: Theme) => void>} */
const _listeners = new Set();

function readStored() {
  try {
    const name = localStorage.getItem(STORAGE_KEY);
    return name && THEMES[name] ? name : null;
  } catch {
    return null;
  }
}

// Restaurar la preferencia antes del primer frame para que el fondo no
// parpadee de oscuro a claro al abrir un módulo.
const _stored = readStored();
if (_stored) _current = THEMES[_stored];

/** @returns {Theme} Perfil activo. */
export function getTheme() {
  return _current;
}

/** @returns {string} Nombre del perfil activo. */
export function getThemeName() {
  return _current.name;
}

/** @returns {boolean} true si el perfil activo es el de proyección. */
export function isProjector() {
  return _current.name === 'projector';
}

/**
 * Cambia el perfil activo, lo persiste y notifica a los suscriptores.
 * @param {string} name - Clave de `THEMES`.
 * @returns {Theme} El perfil resultante (sin cambios si `name` no existe).
 */
export function setTheme(name) {
  const next = THEMES[name];
  if (!next || next === _current) return _current;
  _current = next;
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* modo privado: el tema vive sólo en esta sesión */
  }
  // El atributo permite que el CSS de la app siga al tema del lienzo.
  try {
    document.documentElement.dataset.canvasTheme = name;
  } catch {
    /* sin DOM (pruebas) */
  }
  for (const fn of _listeners) {
    try {
      fn(_current);
    } catch (err) {
      console.warn('theme listener', err);
    }
  }
  return _current;
}

/**
 * Avanza al siguiente perfil de `THEME_ORDER` (atajo de teclado).
 * @returns {Theme}
 */
export function cycleTheme() {
  const i = THEME_ORDER.indexOf(_current.name);
  return setTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
}

/**
 * Alterna entre el modo proyector y el último perfil normal.
 * @returns {Theme}
 */
let _beforeProjector = 'dark';
export function toggleProjector() {
  if (isProjector()) return setTheme(_beforeProjector);
  _beforeProjector = _current.name;
  return setTheme('projector');
}

/**
 * Suscribe un callback a los cambios de tema.
 * @param {(t: Theme) => void} fn
 * @returns {() => void} Función para cancelar la suscripción.
 */
export function onThemeChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Resuelve un color que puede ser un token del tema o un literal CSS.
 * Permite que un módulo escriba `'velocity'` y siga funcionando si pasa
 * `'#39d98a'` (compatibilidad con los 27 módulos aún sin migrar).
 * @param {string|undefined} value
 * @param {string} [fallbackToken='text']
 * @returns {string} Color CSS.
 */
export function resolveColor(value, fallbackToken = 'text') {
  if (!value) return _current[fallbackToken] || _current.text;
  const token = _current[value];
  return typeof token === 'string' ? token : value;
}

/**
 * Color de la serie `i` de una gráfica, cíclico.
 * @param {number} i
 * @returns {string}
 */
export function seriesColor(i) {
  const s = _current.series;
  return s[((i % s.length) + s.length) % s.length];
}

/**
 * Patrón de guiones asociado al índice de una serie. Es la señal redundante
 * que acompaña al color cuando el perfil lo exige.
 * @param {number} i
 * @returns {number[]} Array apto para `ctx.setLineDash`.
 */
export function seriesDash(i) {
  if (!_current.requireNonColorCue) return [];
  const patterns = [[], [8, 4], [2, 3], [10, 3, 2, 3], [5, 5], [1, 4]];
  return patterns[((i % patterns.length) + patterns.length) % patterns.length];
}
