import js from '@eslint/js';
import globals from 'globals';

// WAVE 7 — Reglas de arquitectura (mejoras.md §7.2).
//
// Tres invariantes que las WAVEs 1-3 deben dejar garantizadas y que aquí se
// bloquean por regresión. Violaciones de módulos legacy aparecen como
// *warnings* (checklist de migración, ver mejoras.md §7.2), no como errores.

export default [
  {
    ignores: [
      'website/**',
      'desktop/**',
      'mobile/**',
      'node_modules/**',
      'tools/**',
      'graphify-out/**',
      '**/assets/**',
      '.venv/**',
      'skills/layers-skills/**',
      'skills/taste-skill/**',
      'skills/ui-ux-pro-max-skill/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['skills/fisicahn/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',

      // 1) El bug de DPR (§2.0): leer/escribir `canvas.width` donde no toca.
      // Las únicas excepciones legítimas son los chokepoints de buffer
      // (renderer, core/layers, physics-engine), cubiertas por `overrides`.
      'no-restricted-properties': [
        'error',
        {
          object: 'canvas',
          property: 'width',
          message:
            'BUG DPR (§2.0): usar el ancho CSS de la vista (lienzo) o el helper de capas, no canvas.width.',
        },
        {
          object: 'canvas',
          property: 'height',
          message:
            'BUG DPR (§2.0): usar el alto CSS de la vista o el helper de capas, no canvas.height.',
        },
      ],

      // 2) Prohibido construir DOM en módulos (§3.1).
      //    Nota: la prohibición de innerHTML NO aplica a la capa de
      //    presentación (app.js, works-panel, etc.), que sí construye UI.
    },
  },
  {
    // Los módulos legacy del W1.7 siguen usando `setTimeout(…)` sin delay para
    // enlazar controles y construyen HTML propio. No se bloquea (se migran en
    // W1/W3), pero el CI vigila que la lista no crezca: más que el umbral
    // rompe el despliegue (§7.3).
    files: ['**/js/modules/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'AssignmentExpression[left.property.name="innerHTML"]',
          message:
            'No se construye DOM en módulos (§3.1). Los módulos solo pintan en el lienzo; la UI vive en la capa de presentación.',
        },
        {
          selector:
            'CallExpression[callee.name="setTimeout"][arguments.length=1]',
          message:
            'Binding diferido (§2.7): setTimeout sin delay para enlazar controles. Migrar a bind paramControl posterior del render.',
        },
      ],
    },
  },
  {
    files: ['**/js/modules/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          name: '../module-ui.js',
          message:
            'Módulo legacy que importa UI (§3.1): correr contra el contrato nuevo (summary bar/paneles de la escena).',
        },
      ],
    },
  },
  {
    // Service worker (§9.3): globals de worker + caché HTTP.
    files: ['skills/fisicahn/sw.js'],
    languageOptions: {
      globals: {
        ...globals.worker,
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        skipWaiting: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    // Chokepoints legítimos del buffer: cambios de tamaño del lienzo.
    // screen-recorder.js consulta el tamaño INTRÍNSECO (píxeles device) del
    // lienzo para WebM/PNG: es lectura de dimensiones, no coordenadas DPR.
    files: [
      '**/js/renderer.js',
      '**/js/core/layers.js',
      '**/js/physics-engine.js',
      '**/js/core/screen-recorder.js',
    ],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['**/tests/**/*.mjs', 'js/tests/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];