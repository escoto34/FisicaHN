// @ts-check
/**
 * @fileoverview Núcleo compartido — contrato de módulo para FísicaHN.
 *
 * Define la interfaz explícita de un motor (SimModule) frente a la convención
 * implícita que antes se adivinaba con `typeof x === 'function'`. La fábrica
 * `createModuleInstance` sustituye al singleton ESM: cada llamada devuelve una
 * instancia con estado propio, lo que habilita (entre otras cosas) la
 * comparación lado a lado de §2.9.
 *
 * Un módulo legado (functions sueltas `init/update/render/…`) se envuelve en
 * `LegacyModuleAdapter` sin tocarlo: la migración es incremental, módulo a
 * módulo, y la app sigue funcionando en todo momento.
 */

/**
 * Clase base de todo motor. Los métodos de la izquierda del ciclo de vida son
 * el contrato histórico (canvas vía `engine`/`renderer`); `draw(scene)` y
 * `readout()` son la dirección del plan (escena declarativa y datos numéricos).
 *
 * Todas las firmas son seguras para heredar y sobreescribir: se llaman con
 * argumentos extra sin romperse.
 */
export class SimModule {
  /** Esquema declarativo de parámetros → WAVE 2.7 (sobreescribible). */
  static params = {};
  /** Fórmulas en LaTeX para la pestaña Fórmulas. */
  static formulas = [];
  /** Metadatos estáticos del módulo (título, blurb, etc.). */
  static info = {};

  /**
   * @param {object} ctx — contexto de host.
   * @param {import('../physics-engine.js').PhysicsEngine} ctx.engine
   * @param {object} ctx.renderer
   * @param {object} ctx.ui
   * @param {object} [ctx.scene] - escena declarativa (WAVE 2); por defecto el renderer.
   */
  constructor(ctx) {
    this.engine = ctx.engine;
    this.renderer = ctx.renderer;
    this.ui = ctx.ui;
    // `scene` será la escena declarativa de WAVE 2; hoy apunta al renderer.
    this.scene = ctx.scene || ctx.renderer;
    this.isSimModule = true;
    this.legacy = false;
  }

  /** Montaje: se llama una única vez al abrir el módulo. @param {object|null} meta */
  init(meta = null) {}

  /** Devuelve al estado inicial (construye desde `this.params`). */
  reset() {}

  /**
   * Física — NO debe tocar el DOM (ver WAVE 3.1). Aquí solo avanzar el estado.
   * @param {number} dt - Segundos del timestep.
   */
  update(dt) {}

  /**
   * Dibujo imperativo heredado (ctx en px CSS). En WAVE 2 se sustituye por
   * `draw(scene)` declarativo; se mantiene como puente mientras se migra.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} alpha
   * @param {number} elapsed
   */
  render(ctx, alpha, elapsed) {}

  /**
   * Dibujo declarativo de WAVE 2. Siguendo el contrato nuevo, los módulos
   * migrados implementan esto en lugar de `render`.
   * @param {object} scene
   */
  draw(scene) {}

  /**
   * Datos numéricos separados de la presentación — sustituye a `updateData()`:
   * @returns {Object<string, {value: number, unit: string}>}
   */
  readout() {
    return {};
  }

  /** Estado serializable (params + variables) para «Mis trabajos». */
  getState() {
    return {};
  }

  /** Restaura un estado devuelto por `getState()`. */
  setState(s) {}

  /** Libera recursos de la instancia. */
  destroy() {}

  /* ---------- Puente declarativo hacia la capa de presentación (§3.1) ----------
   * El módulo NO importa `module-ui.js`: describe su información como datos y
   * el anfitrión (`ui.setModuleInfo` / `ui.setModuleFormulas`) los convierte
   * en HTML. En los arneses de prueba el `ui` es un stub sin esos métodos y
   * las llamadas son inofensivas. */

  /**
   * Pestaña Información: título, resumen, historia, casos y secciones fijas.
   * @param {{ title: string, blurb: string, story?: string, cases?: string[],
   *   sections?: { title: string, text: string, tone?: string }[] }} content
   */
  setModuleInfo(content) {
    /** @type {any} */
    const ui = this.ui;
    if (!ui) return;
    if (typeof ui.setModuleInfo === 'function') ui.setModuleInfo(content);
    else if (typeof ui.setInfo === 'function') {
      ui.setInfo(`<strong>${content?.title || ''}</strong> — ${content?.blurb || ''}`);
    }
  }

  /**
   * Pestaña Fórmulas.
   * @param {{ title?: string, items: { name: string, formula?: string, latex?: string, note?: string }[] }} data
   */
  setModuleFormulas(data) {
    /** @type {any} */
    const ui = this.ui;
    if (!ui) return;
    if (typeof ui.setModuleFormulas === 'function') ui.setModuleFormulas(data);
    else if (typeof ui.setFormulas === 'function') ui.setFormulas('');
  }

  /** Limpia la pestaña de retos (módulo sin pack de examen activo). */
  clearChallenges() {
    /** @type {any} */
    const ui = this.ui;
    if (ui && typeof ui.setChallenges === 'function') ui.setChallenges(null);
  }
}

/**
 * Envuelve un módulo legado (namespace de functions) en una interfaz por
 * instancia. Se delega a proxy: lectura y llamadas se reenvían al módulo
 * original con el `this` correcto, así la app usa la misma API para ambos.
 */
function createLegacyAdapter(mod) {
  const bound = new Map();
  return new Proxy(
    {
      isSimModule: false,
      legacy: true,
      __mod: mod
    },
    {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (!(prop in mod)) return undefined;
        const value = mod[prop];
        if (typeof value !== 'function') return value;
        if (!bound.has(prop)) bound.set(prop, value.bind(mod));
        return bound.get(prop);
      },
      set(target, prop, value) {
        if (prop in target) {
          target[prop] = value;
          return true;
        }
        mod[prop] = value;
        return true;
      },
      has(target, prop) {
        return prop in target || prop in mod;
      }
    }
  );
}

/**
 * Fábrica central: crea la instancia de un módulo según su estilo.
 *
 * - El módulo exporta `default class … extends SimModule` → se instancia.
 * - Un namespace legacy (functions sueltas) → se envuelve en un adaptador.
 *
 * El adaptador mantiene el estado a nivel de módulo del código viejo hasta que
 * se migra; los módulos nuevos guardan su estado en la instancia.
 *
 * @param {{ default?: typeof SimModule | undefined }} mod - Namespace devuelto por `import()`.
 * @param {object} ctx - Contexto de host { engine, renderer, scene, ui }.
 * @param {import('../physics-engine.js').PhysicsEngine} ctx.engine - Motor físico del host.
 * @param {object} ctx.renderer - Renderer del host.
 * @param {object} ctx.ui - Servicios UI del host.
 * @param {object} [ctx.scene] - Escena declarativa (opcional; el renderer por defecto).
 * @returns {object} Instancia lista para llamar `init(meta)`.
 */
export function createModuleInstance(mod, ctx) {
  const Ctor = mod.default;
  if (Ctor instanceof Function && Ctor.prototype instanceof SimModule) {
    return new Ctor(ctx);
  }
  return createLegacyAdapter(mod);
}

/**
 * ¿La instancia **sobreescribe** un método del contrato, o sólo hereda el vacío
 * de `SimModule`?
 *
 * `typeof inst.draw === 'function'` no sirve para decidirlo: la clase base
 * define `draw`, `readout` y compañía como cuerpos vacíos, así que un módulo
 * migrado a `SimModule` pero que aún dibuja con `render(ctx)` —como
 * `kinematics`— daría `true` y el anfitrión lo mandaría a la implementación
 * vacía, dejando el lienzo en blanco.
 *
 * @param {object & { legacy?: boolean }} instance
 * @param {string} method
 * @returns {boolean}
 */
export function implementsMethod(instance, method) {
  if (!instance) return false;
  const fn = instance[method];
  if (typeof fn !== 'function') return false;
  // Un adaptador legacy reenvía al namespace: si la función existe, es propia.
  if (instance.legacy) return true;
  return fn !== SimModule.prototype[method];
}