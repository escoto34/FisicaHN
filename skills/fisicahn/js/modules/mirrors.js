/**
 * @fileoverview Espejos esféricos: cóncavo y convexo (tanda 5.4).
 *
 * Trazado de tres rayos desde la punta del objeto hasta el espejo y su
 * reflexión convergiendo en la imagen dada por la ecuación del espejo
 * 1/f = 1/d₀ + 1/dᵢ, con aumento M = −dᵢ/d₀ (M < 0 → invertida, dᵢ < 0 →
 * virtual). La geometría usa la convención del espejo: objeto a la izquierda
 * (x = −d₀), foco F a x = −f (f > 0 cóncavo enfoca del lado del objeto;
 * f < 0 convexo enfoca detrás), centro de curvatura C a x = −2f.
 *
 * Los tres rayos clásicos: paralelo al eje, hacia el centro C y hacia el foco
 * F; los reflejados se dibujan convergiendo en la posición exacta de la
 * imagen (dada por la ecuación). Con d₀ ≈ f la imagen diverge: se avisa.
 *
 * Ejercita `arc`, `line`, `vector`, `label`, `chip`, `readout`.
 */

import { SimModule } from '../core/sim-module.js';
import { roundTo } from '../utils/math-helpers.js';
import { setModuleInfo, setModuleFormulas, clearChallenges } from '../module-ui.js';

const MIRROR_HALF = 3.2;

export default class Mirrors extends SimModule {
  static viewport = { width: 24, height: 15 };

  // Punto fijo del mecanismo en el origen del mundo (WAVE 17.1).
  static anchor = { x: 0, y: 0 };

  static params = [
    {
      id: 'tipo',
      type: 'select',
      label: 'Espejo',
      value: 'concavo',
      options: [
        { value: 'concavo', label: 'Cóncavo (convergente)' },
        { value: 'convexo', label: 'Convexo (divergente)' }
      ]
    },
    { id: 'f', label: 'Distancia focal', latex: 'f', unit: 'm', min: 0.25, max: 3, step: 0.05, value: 1.5 },
    { id: 'd0', label: 'Distancia del objeto', latex: 'd_o', unit: 'm', min: 0.5, max: 8, step: 0.1, value: 4 },
    { id: 'h', label: 'Altura del objeto', latex: 'h_o', unit: 'm', min: 0.1, max: 2.5, step: 0.1, value: 1.2 }
  ];

  constructor(ctx) {
    super(ctx);
    this.params = { tipo: 'concavo', f: 1.5, d0: 4, h: 1.2 };
    this.t = 0;
  }

  init(meta = null) {
    this.reset();
    setModuleInfo(this.ui, {
      title: 'Espejos esféricos',
      blurb: 'Imágenes en espejos cóncavos y convexos con rayos y la ecuación del espejo.',
      story:
        'Las cucharas y los retrovisores son espejos esféricos: su curva hace que los rayos paralelos se junten (cóncavo) o se abran (convexo) en un foco. Tres rayos bastan para localizar la imagen: el paralelo se refleja hacia el foco, el que pasa por el centro se devuelve por sí mismo y el que va al foco sale paralelo. Donde se cruzan los reflejados, está la imagen.',
      cases: [
        'Cóncavo con d₀ > 2f: imagen real, invertida y menor (entre F y C).',
        'Cóncavo con d₀ < f: imagen virtual, derecha y mayor (lupa de maquillaje).',
        'Convexo: siempre virtual, derecha y menor: el campo amplio del retrovisor.',
        'd₀ = f: los reflejados son paralelos: imagen en el infinito.'
      ]
    });
    setModuleFormulas(this.ui, {
      title: 'Espejos esféricos',
      items: [
        { name: 'Ecuación del espejo', formula: '\\dfrac{1}{f} = \\dfrac{1}{d_o} + \\dfrac{1}{d_i}' },
        { name: 'Aumento', formula: 'M = -\\dfrac{d_i}{d_o}', note: 'M < 0 → imagen invertida.' },
        {
          name: 'Tipo de imagen',
          formula: 'd_i > 0 \\to \\text{real} \\quad d_i < 0 \\to \\text{virtual}',
          note: 'Real: mismo lado que el objeto. Virtual: detrás del espejo.'
        }
      ]
    });
    clearChallenges(this.ui);
  }

  reset() {
    this.t = 0;
    this.engine?.reset?.();
  }

  update(dt) {
    this.t += dt;
  }

  /** Distancia focal con signo según el tipo de espejo (m). */
  fSigned() {
    return this.params.tipo === 'concavo' ? this.params.f : -this.params.f;
  }

  /** Posición de la imagen dᵢ (m; > 0 real, < 0 virtual). null si d₀ = f. */
  dI() {
    const f = this.fSigned();
    const d0 = this.params.d0;
    const denom = d0 - f;
    if (Math.abs(denom) < 1e-9) return null;
    return (f * d0) / denom;
  }

  /** Aumento M = −dᵢ/d₀. */
  magnification(di) {
    return -di / this.params.d0;
  }

  /** Altura de la imagen con signo (negativa = invertida). */
  hI(di) {
    return this.params.h * this.magnification(di);
  }

  /* ---------- dibujo declarativo ---------- */

  draw(scene) {
    const { d0, h } = this.params;
    const di = this.dI();
    const cx = -2 * this.fSigned();

    scene.line(-11.5, 0, 11.5, 0, { color: 'textDim', width: 1.4 });
    scene.label(11.6, 0.25, 'eje', { avoid: true, color: 'textDim', size: 11 });

    // Espejo: arco de círculo con centro en C = (−2f, 0) y radio R = 2|f|.
    this._drawMirror(scene, cx);

    // Objeto: flecha vertical en x = −d₀.
    scene.vector(-d0, 0, 0, h, { color: 'mass', width: 2.6 });
    scene.label(-d0 - 0.35, h / 2, 'O', { avoid: true, color: 'mass' });

    if (di === null) {
      scene.hud.chip('d₀ = f: la imagen está en el infinito', 'top-left', { color: 'amber' });
      scene.hud.readout(
        [
          { label: 'f', value: roundTo(this.fSigned(), 2), unit: 'm' },
          { label: 'd₀', value: roundTo(d0, 2), unit: 'm' },
          { label: 'dᵢ', value: '∞', unit: '' }
        ],
        'bottom-left'
      );
      return;
    }

    const xImg = -di;
    const hImg = this.hI(di);

    // Imagen: flecha en la posición calculada (virtual → discontinua).
    if (di > 0) {
      scene.vector(xImg, 0, 0, hImg, { color: 'force', width: 2.6, dash: [] });
    } else {
      scene.vector(xImg, 0, 0, hImg, { color: 'force', width: 2.2, dash: [5, 3] });
    }
    scene.label(xImg + 0.35, hImg / 2, `I ${di > 0 ? '(real)' : '(virtual)'}`, { avoid: true, color: 'force' });

    // Tres rayos desde la punta O = (−d₀, h).
    const f = this.fSigned();
    const gx = -f; // posición del foco (F) en pantalla
    const y1 = h; // paralelo
    const y2 = clamp(h * (cx / (d0 + cx)), -MIRROR_HALF, MIRROR_HALF); // hacia C
    const y3 = clamp(h * (gx / (d0 + gx)), -MIRROR_HALF, MIRROR_HALF); // hacia F

    this._rayToImage(scene, -d0, h, y1, xImg, hImg, 'textDim', false);
    this._rayToImage(scene, -d0, h, y2, xImg, hImg, 'energy', true);
    this._rayToImage(scene, -d0, h, y3, xImg, hImg, 'spring', false);

    // Marcas C, 2F y F sobre el eje.
    scene.body(cx, 0, { shape: 'circle', r: 0.1, color: 'textDim' });
    scene.label(cx, -0.5, 'C', { avoid: true, color: 'textDim' });
    scene.body(gx, 0, { shape: 'circle', r: 0.1, color: 'textDim' });
    scene.label(gx, -0.5, 'F', { avoid: true, color: 'textDim' });

    scene.hud.chip(`Espejo ${this.params.tipo === 'concavo' ? 'cóncavo' : 'convexo'}`, 'top-left');
    scene.hud.readout(
      [
        { label: 'f', value: roundTo(f, 2), unit: 'm' },
        { label: 'd₀', value: roundTo(d0, 2), unit: 'm' },
        { label: 'dᵢ', value: roundTo(di, 2), unit: 'm' },
        { label: 'M', value: roundTo(this.magnification(di), 2), unit: '×' }
      ],
      'bottom-left'
    );
  }

  /** Arco del espejo en x ≈ 0; el vértice del círculo es el punto (0,0). */
  _drawMirror(scene, cx) {
    const R = Math.max(2 * Math.abs(this.fSigned()), 1.2);
    const a = Math.min(Math.asin(Math.min(MIRROR_HALF, R) / R), 0.62);
    if (cx < 0) {
      // Cóncavo: la cavidad abre hacia el objeto (izquierda); centro en θ = 0.
      scene.arc(cx, 0, R, -a, a, { color: 'textDim', width: 3 });
      scene.line(cx + R + 0.04, -a * R, cx + R + 0.04, a * R, { color: 'textDim', width: 3 });
    } else {
      // Convexo: el bulto sale hacia el objeto; centro en θ = π.
      scene.arc(cx, 0, R, Math.PI - a, Math.PI + a, { color: 'textDim', width: 3 });
      scene.line(cx - R - 0.04, -a * R, cx - R - 0.04, a * R, { color: 'textDim', width: 3 });
    }
  }

  /**
   * Rayo incidente desde la punta del objeto O = (ox, h) al punto del espejo
   * (0, my), y su reflexión hacia la imagen (ix, iy). Para imágenes virtuales
   * la prolongación hacia la imagen se dibuja en línea de puntos.
   */
  _rayToImage(scene, ox, h, my, ix, iy, color, dash) {
    scene.line(ox, h, 0, my, { color, width: 1.7, alpha: 0.85 });
    const dx = ix - 0;
    const dy = iy - my;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const ux = dx / len;
    const uy = dy / len;
    const reach = len + 2.2; // la línea reflejada cruza la imagen y sigue un trecho
    if (ix > 0) {
      // Imagen real: rayo sólido a través de la imagen.
      scene.line(0, my, ux * reach, my + uy * reach, { color, width: 1.7 });
    } else {
      // Virtual: el segmento sólido va hacia la imagen y la extensión es de puntos.
      const seg = Math.min(len, 2.4);
      scene.line(0, my, ux * seg, my + uy * seg, { color, width: 1.7 });
      scene.line(ux * (seg - 4), my + uy * (seg - 4), ix, iy, { color, width: 1.4, dash: [4, 3], alpha: 0.8 });
    }
    if (dash) scene.body(ix, iy, { shape: 'circle', r: 0.14, color });
  }

  /* ---------- datos numéricos ---------- */

  readout() {
    const di = this.dI();
    if (di === null) {
      return {
        'f': { value: roundTo(this.fSigned(), 2), unit: 'm' },
        'd₀': { value: roundTo(this.params.d0, 2), unit: 'm' },
        'dᵢ': { value: '∞', unit: '' }
      };
    }
    return {
      'f': { value: roundTo(this.fSigned(), 2), unit: 'm' },
      'd₀': { value: roundTo(this.params.d0, 2), unit: 'm' },
      'dᵢ': { value: roundTo(di, 2), unit: 'm' },
      'M': { value: roundTo(this.magnification(di), 2), unit: '×' }
    };
  }

  getState() {
    return { t: this.t, params: { ...this.params } };
  }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.params) Object.assign(this.params, s.params);
    if (Number.isFinite(s.t)) this.t = s.t;
  }

  destroy() {}
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}