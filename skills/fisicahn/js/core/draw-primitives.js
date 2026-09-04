/**
 * @fileoverview draw-primitives — primitivas de dibujo reutilizables.
 *
 * Consolida el `roundRect`, la punta de flecha, el badge `chip` y la `legend`
 * que estaban duplicados en 5–6 módulos y en `renderer.js`. Todas operan sobre
 * un `CanvasRenderingContext2D` en el mismo sistema de coordenadas que el
 * llamador, sin estado global.
 */

/**
 * Dibuja un rectángulo con esquinas redondeadas (fallback si `ctx.roundRect`
 * no existe). Reemplaza 6 polyfills/guards privados.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r - Radio de las esquinas.
 */
export function roundRect(ctx, x, y, w, h, r = 6) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * Dibuja una punta de flecha al final de un vector. Apunta a `(tx, ty)`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} tx
 * @param {number} ty
 * @param {number} angle - Ángulo de la dirección de la flecha (rad).
 * @param {number} size - Longitud de cada ala de la punta.
 */
export function arrowHead(ctx, tx, ty, angle, size = 10) {
  const a1 = angle + Math.PI * 0.85;
  const a2 = angle - Math.PI * 0.85;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + Math.cos(a1) * size, ty + Math.sin(a1) * size);
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + Math.cos(a2) * size, ty + Math.sin(a2) * size);
  ctx.stroke();
}

/**
 * Dibuja una etiqueta «chip» sobre un fondo redondeado. Replica la función
 * `chip()` duplicada en lenses/magnetic/optics.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Centro x del chip.
 * @param {number} y
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.fill] - Color de fondo (default translúcido).
 * @param {string} [opts.color] - Color del texto (default #fff).
 * @param {string} [opts.font]
 * @param {number} [opts.padding=8]
 * @returns {{width:number,height:number}} Dimensiones dibujadas.
 */
export function chip(ctx, x, y, text, opts = {}) {
  const font = opts.font || '12px sans-serif';
  const padding = opts.padding ?? 8;
  ctx.save();
  ctx.font = font;
  const w = ctx.measureText(text).width + padding * 2 + 6;
  const h = 22;
  const left = x - w / 2;
  const top = y - h / 2;
  ctx.fillStyle = opts.fill || 'rgba(15,15,26,0.75)';
  ctx.strokeStyle = opts.color || 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  roundRect(ctx, left, top, w, h, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
  return { width: w, y };
}

/**
 * Rayado diagonal entre dos puntos: símbolo estándar de apoyo fijo o sección
 * sólida en los diagramas de estática (WAVE 13, §13.2). Dibuja la línea base
 * y los trazos perpendiculares a 45°, hacia un lado (`opts.side`).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @param {object} [opts]
 * @param {number} [opts.spacing=8] - Separación entre trazos, px.
 * @param {number} [opts.length=10] - Longitud de cada trazo, px.
 * @param {number} [opts.side=1] - 1 o -1: a qué lado de la línea caen los trazos.
 */
export function hatchLine(ctx, x1, y1, x2, y2, opts = {}) {
  const spacing = opts.spacing ?? 8;
  const len = opts.length ?? 10;
  const side = opts.side ?? 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const segLen = Math.hypot(dx, dy) || 1;
  const ux = dx / segLen;
  const uy = dy / segLen;
  // Rota la dirección de la línea 135° (hacia `side`) para que cada trazo
  // caiga en diagonal hacia fuera, como en la notación de libro de texto.
  const theta = side * (-3 * Math.PI) / 4;
  const hx = ux * Math.cos(theta) - uy * Math.sin(theta);
  const hy = ux * Math.sin(theta) + uy * Math.cos(theta);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Todos los trazos en un solo camino y un solo `stroke()`: un suelo de 30
  // rayas costaba 30 trazados; el resultado dibujado es idéntico.
  const steps = Math.max(1, Math.round(segLen / spacing));
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    ctx.moveTo(px, py);
    ctx.lineTo(px + hx * len, py + hy * len);
  }
  ctx.stroke();
}

/**
 * Interpola entre dos colores hex/rgb para representar una magnitud continua
 * (temperatura, concentración…). Degradado de temperatura de la WAVE 13,
 * §13.2, sin depender de un color semántico nuevo.
 * @param {string} coldHex @param {string} hotHex @param {number} t - [0,1]
 * @returns {string} color CSS `rgb(r, g, b)`
 */
export function thermalColor(coldHex, hotHex, t) {
  const c = Math.max(0, Math.min(1, t));
  const parse = (color) => {
    const h = String(color).trim().replace('#', '');
    const n = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h.padEnd(6, '0');
    return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0];
  };
  const [r1, g1, b1] = parse(coldHex);
  const [r2, g2, b2] = parse(hotHex);
  const r = Math.round(r1 + (r2 - r1) * c);
  const g = Math.round(g1 + (g2 - g1) * c);
  const b = Math.round(b1 + (b2 - b1) * c);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Color aproximado de una longitud de onda (nm): tramos del espectro visible
 * y tonos apagados fuera de él (UV violeta oscuro, IR rojo pálido). Es la
 * paleta física de `atomic`, `photoelectric` y la radiación γ — el color
 * lleva información real (λ), así que la primitiva que lo use debe acompañarlo
 * siempre de una etiqueta con el valor numérico.
 * @param {number|null} nm
 * @returns {string} color CSS hex
 */
export function wavelengthColor(nm) {
  if (nm == null || !Number.isFinite(nm)) return '#ce93d8';
  if (nm < 380) return '#7e57c2'; // UV
  if (nm < 450) return '#5c6bc0';
  if (nm < 495) return '#26c6da';
  if (nm < 570) return '#66bb6a';
  if (nm < 590) return '#ffee58';
  if (nm < 620) return '#ffb74d';
  if (nm < 750) return '#ef5350';
  return '#ef9a9a'; // IR
}

/**
 * Garabato sinusoidal con punta de flecha: el símbolo de libro de texto para
 * un fotón (γ) o una onda que viaja. Traza desde (x, y) a lo largo de
 * `angle` durante `length` px; el llamador fija color y grosor.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y - Cola del fotón (px).
 * @param {number} angle - Dirección en radianes (sistema del lienzo).
 * @param {number} length - Longitud total en px.
 * @param {object} [opts]
 * @param {number} [opts.amplitude=4] - Semiamplitud de la ondulación, px.
 * @param {number} [opts.waves=3] - Número de ondas completas.
 * @param {number} [opts.head=7] - Tamaño de la punta, px (0 = sin punta).
 * @param {number} [opts.phase=0] - Fase inicial (anima el garabato).
 */
export function photonPath(ctx, x, y, angle, length, opts = {}) {
  const amp = opts.amplitude ?? 4;
  const waves = opts.waves ?? 3;
  const head = opts.head ?? 7;
  const phase = opts.phase ?? 0;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const body = Math.max(1, length - head);
  const steps = Math.max(6, Math.round(waves * 8));
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * body;
    const off = Math.sin(phase + (i / steps) * waves * Math.PI * 2) * amp;
    const px = x + ux * s + nx * off;
    const py = y + uy * s + ny * off;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.lineTo(x + ux * length, y + uy * length);
  ctx.stroke();
  if (head > 0) arrowHead(ctx, x + ux * length, y + uy * length, angle, head);
}

/**
 * Anillos concéntricos ondulados: textura de fluido/viscosidad de la
 * WAVE 13, §13.2 — distingue un medio continuo de un cuerpo sólido sin
 * depender del color.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx @param {number} cy @param {number} rMax
 * @param {object} [opts]
 * @param {number} [opts.rings=3]
 * @param {number} [opts.amplitude=2] - Amplitud de la ondulación, px.
 * @param {number} [opts.waves=10] - Número de ondas por anillo.
 */
export function ripplePattern(ctx, cx, cy, rMax, opts = {}) {
  const rings = Math.max(1, opts.rings ?? 3);
  const amp = opts.amplitude ?? 2;
  const waves = opts.waves ?? 10;
  for (let i = 1; i <= rings; i++) {
    const r = (rMax * i) / rings;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.001; a += 0.15) {
      const rr = r + Math.sin(a * waves) * amp;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

/**
 * Resplandor radial alrededor de un punto: halo de énfasis de la WAVE 13,
 * §13.2, para objetos interactivos o seleccionados. Forma/brillo, no un
 * color semántico nuevo.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx @param {number} cy @param {number} r
 * @param {object} [opts]
 * @param {string} [opts.color='rgba(255,255,255,0.6)']
 * @param {string} [opts.blend='lighter']
 */
export function halo(ctx, cx, cy, r, opts = {}) {
  const color = opts.color || 'rgba(255,255,255,0.6)';
  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.6);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = opts.blend || 'lighter';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Dibuja una leyenda horizontal con varios elementos (color + etiqueta).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{color:string, label:string}>} items
 * @param {number} x - Esquina superior izquierda.
 * @param {number} y
 * @param {number} [lineLength=14]
 * @returns {number} Altura total ocupada.
 */
export function legend(ctx, items, x, y, lineLength = 14) {
  let cursorX = x;
  const lineHeight = 16;
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  items.forEach((item, i) => {
    ctx.fillStyle = item.color;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursorX, y + lineHeight - 5);
    ctx.lineTo(cursorX + lineLength, y + lineHeight - 5);
    ctx.stroke();
    ctx.fillStyle = item.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, cursorX + lineLength + 5, y + lineHeight - 3);
    cursorX += lineLength + 5 + ctx.measureText(item.label).width + 14;
  });
  ctx.restore();
  return lineHeight;
}

/**
 * Tipos de lente reconocidos por `lensPath` (los seis perfiles de libro de
 * texto). Los tres primeros son convergentes (más gruesas en el centro), los
 * tres últimos divergentes (más finas en el centro).
 */
export const LENS_TYPES = Object.freeze([
  'biconvex',
  'plano-convex',
  'meniscus-convex',
  'biconcave',
  'plano-concave',
  'meniscus-concave'
]);

/**
 * Flecha de un arco esférico: desplazamiento de la cara respecto a su cuerda
 * a la altura relativa `u ∈ [−1, 1]` (u = 0 en el eje óptico, ±1 en los
 * bordes). La cara es un arco de circunferencia real —como la superficie de
 * una lente esférica— con flecha `s` sobre una semicuerda `ry`, de modo que
 * vale `s` en el centro y 0 en los bordes.
 * @param {number} u
 * @param {number} s - Flecha (sagitta) en px.
 * @param {number} ry - Semialtura en px.
 */
function sagitta(u, s, ry) {
  if (s <= 1e-6) return 0;
  const R = (ry * ry + s * s) / (2 * s); // radio de curvatura de la cara
  const y = u * ry;
  return s - (R - Math.sqrt(Math.max(0, R * R - y * y)));
}

/**
 * Perfil de una lente: para cada altura relativa `u ∈ [−1, 1]` devuelve la
 * abscisa de la cara izquierda y de la derecha (px, relativas al centro
 * óptico). Es la geometría que comparten `lensPath` y quien quiera medir la
 * lente (p. ej. para colocar etiquetas).
 *
 * `e ∈ [0, 1]` es la excentricidad visual: cuánto se abomba cada cara curva
 * respecto al semiancho disponible `rx`. 0 → cara casi plana (lente débil,
 * |f| grande); 1 → arco máximo (lente fuerte, |f| pequeño). En las
 * bicóncavas es el hundimiento de la cara. El semiancho máximo de la
 * silueta nunca supera `rx`.
 *
 * @param {number} rx - Semiancho máximo de la silueta (px).
 * @param {number} ry - Semialto (px).
 * @param {string} type - Uno de `LENS_TYPES` (alias: `meniscus` → convexo).
 * @param {number} e - Excentricidad visual en [0, 1].
 * @param {boolean} [flip=false] - Espeja la lente (cara curva al otro lado).
 * @returns {(u: number) => { left: number, right: number }}
 */
export function lensProfile(rx, ry, type, e, flip = false) {
  const t = Math.max(0.02, Math.min(1, e));
  const edge = Math.max(1, rx * 0.12); // semiespesor mínimo en el borde
  const core = Math.max(1, rx * 0.14); // semiespesor mínimo en el centro (divergentes)
  const sMax = Math.max(0.5, rx - edge); // flecha máxima disponible
  const s = t * sMax;
  let faces;
  switch (type) {
    case 'plano-convex': {
      // Cara plana a la izquierda y cara convexa a la derecha; la silueta se
      // centra en el eje óptico para que O quede en medio del cristal.
      const T = 2 * edge + s;
      faces = (u) => ({ left: -T / 2, right: -T / 2 + 2 * edge + sagitta(u, s, ry) });
      break;
    }
    case 'meniscus':
    case 'meniscus-convex': {
      // Ambas caras curvan hacia el mismo lado (media luna): la convexa con
      // flecha s, la cóncava más suave (0.55·s) → más gruesa en el centro.
      const s2 = 0.55 * s;
      const T = 2 * edge;
      faces = (u) => ({ left: -T / 2 + sagitta(u, s2, ry) - (s - s2) / 2, right: T / 2 + sagitta(u, s, ry) - (s - s2) / 2 });
      break;
    }
    case 'biconcave': {
      // Bordes gruesos (rx) y cintura fina en el centro: rx − s ≥ core.
      const sc = Math.min(s, rx - core);
      faces = (u) => ({ left: -rx + sagitta(u, sc, ry), right: rx - sagitta(u, sc, ry) });
      break;
    }
    case 'plano-concave': {
      const sc = Math.min(s, rx - core);
      const T = rx; // espesor en el borde
      faces = (u) => ({ left: -T / 2, right: T / 2 - sagitta(u, sc, ry) });
      break;
    }
    case 'meniscus-concave': {
      // Cóncava más curvada que la convexa → más fina en el centro.
      const sc = Math.min(s, rx - core);
      const s2 = 0.55 * sc;
      const T = 2 * core + (sc - s2);
      faces = (u) => ({ left: -T / 2 + sagitta(u, sc, ry) - (sc - s2) / 2, right: T / 2 + sagitta(u, s2, ry) - (sc - s2) / 2 });
      break;
    }
    default: {
      // biconvex: óvalo simétrico con semiespesor edge en el borde.
      faces = (u) => ({ left: -edge - sagitta(u, s, ry), right: edge + sagitta(u, s, ry) });
    }
  }
  if (!flip) return faces;
  return (u) => {
    const f = faces(u);
    return { left: -f.right, right: -f.left };
  };
}

/**
 * Traza el contorno de una **lente delgada** como silueta de libro de texto en
 * la posición (cx, cy): `2·ry` de alto y `2·rx` de ancho máximo. Cada cara
 * es un arco de circunferencia (superficie esférica real), y la
 * excentricidad visual `e ∈ [0,1]` controla cuánto se abomba: 0 → casi
 * plana (lente débil, |f| grande); 1 → arco máximo (lente fuerte, |f|
 * pequeño).
 *
 * Tipos (ver `LENS_TYPES`):
 *  - `biconvex`         convergente: óvalo grueso en el centro.
 *  - `plano-convex`     convergente: una cara plana (objetivos, colimadores).
 *  - `meniscus-convex`  convergente: media luna gruesa en el centro (gafas +).
 *  - `biconcave`        divergente: cintura fina, bordes gruesos.
 *  - `plano-concave`    divergente: una cara plana y otra hundida.
 *  - `meniscus-concave` divergente: media luna fina en el centro (gafas −).
 *
 * Traza con `bezierCurveTo` (presente en canvas y en la exportación SVG) para
 * no depender de `ctx.ellipse`; el relleno/contorno se aplica fuera.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx - Semiancho máximo (px).
 * @param {number} ry - Semialto (px).
 * @param {string} [type='biconvex']
 * @param {number} [e=0.6] - Excentricidad visual de la curvatura en [0,1].
 * @param {boolean} [flip=false] - Espeja la lente horizontalmente.
 */
export function lensPath(ctx, cx, cy, rx, ry, type = 'biconvex', e = 0.6, flip = false) {
  const faces = lensProfile(rx, ry, type, e, flip);
  const N = 28;
  const pts = [];
  // Cara izquierda de arriba abajo y cara derecha de abajo arriba: el
  // contorno se recorre en un solo sentido y cierra sin cruzarse.
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    pts.push({ x: cx + faces(u).left, y: cy + u * ry });
  }
  for (let i = N; i >= 0; i--) {
    const u = -1 + (2 * i) / N;
    pts.push({ x: cx + faces(u).right, y: cy + u * ry });
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  // Suavizado Catmull-Rom→Bézier cerrado: cada vértice queda sobre la curva.
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
  }
  ctx.closePath();
}

/**
 * Excentricidad visual de una lente a partir de su distancia focal, en la
 * escala que usan los módulos (unidades o cm): a menor |f| (lente más
 * potente) más abombada; a mayor |f| más plana. `fRef` es la focal que se
 * dibuja con curvatura media (0.5).
 * @param {number} f - Distancia focal (se usa |f|).
 * @param {number} [fRef=4]
 * @returns {number} e ∈ [0.12, 0.95]
 */
export function lensBulgeFromFocal(f, fRef = 4) {
  const a = Math.max(1e-3, Math.abs(f));
  // Curva suave en log: f = fRef/4 → ~0.9, f = fRef → 0.5, f = 4·fRef → ~0.15.
  const e = 0.5 - 0.25 * Math.log2(a / fRef);
  return Math.max(0.12, Math.min(0.95, e));
}