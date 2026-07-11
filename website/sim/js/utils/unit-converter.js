/**
 * @fileoverview UnitConverter — Conversiones de unidades para contexto de física.
 */

export const unitConverter = {
  /**
   * Convierte metros por segundo a kilómetros por hora.
   * @param {number} ms - Velocidad en m/s
   * @returns {number} Velocidad en km/h
   */
  msToKmh(ms) {
    return ms * 3.6;
  },

  /**
   * Convierte kilómetros por hora a metros por segundo.
   * @param {number} kmh - Velocidad en km/h
   * @returns {number} Velocidad en m/s
   */
  kmhToMs(kmh) {
    return kmh / 3.6;
  },

  /**
   * Convierte grados Celsius a Fahrenheit.
   * @param {number} c - Temperatura en °C
   * @returns {number} Temperatura en °F
   */
  celsiusToFahrenheit(c) {
    return (c * 9 / 5) + 32;
  },

  /**
   * Convierte grados Fahrenheit a Celsius.
   * @param {number} f - Temperatura en °F
   * @returns {number} Temperatura en °C
   */
  fahrenheitToCelsius(f) {
    return (f - 32) * 5 / 9;
  },

  /**
   * Convierte grados Celsius a Kelvin.
   * @param {number} c - Temperatura en °C
   * @returns {number} Temperatura en K
   */
  celsiusToKelvin(c) {
    return c + 273.15;
  },

  /**
   * Convierte Kelvin a grados Celsius.
   * @param {number} k - Temperatura en K
   * @returns {number} Temperatura en °C
   */
  kelvinToCelsius(k) {
    return k - 273.15;
  },

  /**
   * Convierte newtons a kilogramos-fuerza.
   * @param {number} n - Fuerza en N
   * @returns {number} Fuerza en kgf
   */
  newtonsToKgf(n) {
    return n / 9.80665;
  },

  /**
   * Convierte kilogramos-fuerza a newtons.
   * @param {number} kgf - Fuerza en kgf
   * @returns {number} Fuerza en N
   */
  kgfToNewtons(kgf) {
    return kgf * 9.80665;
  },

  /**
   * Presets de conversión rápida para uso en la UI.
   * Cada entrada: { label, from, to, convertFn }
   */
  presets: [
    { label: 'm/s → km/h', from: 'm/s', to: 'km/h', convertFn: (v) => v * 3.6 },
    { label: 'km/h → m/s', from: 'km/h', to: 'm/s', convertFn: (v) => v / 3.6 },
    { label: '°C → °F',    from: '°C',  to: '°F',  convertFn: (v) => (v * 9 / 5) + 32 },
    { label: '°F → °C',    from: '°F',  to: '°C',  convertFn: (v) => (v - 32) * 5 / 9 },
    { label: '°C → K',     from: '°C',  to: 'K',   convertFn: (v) => v + 273.15 },
    { label: 'K → °C',     from: 'K',   to: '°C',  convertFn: (v) => v - 273.15 },
    { label: 'N → kgf',    from: 'N',   to: 'kgf', convertFn: (v) => v / 9.80665 },
    { label: 'kgf → N',    from: 'kgf', to: 'N',   convertFn: (v) => v * 9.80665 },
  ]
};
