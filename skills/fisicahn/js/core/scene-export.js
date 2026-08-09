/**
 * @fileoverview scene-export — exportación de la escena a PNG y SVG (§2.8).
 *
 * Con el dibujo declarativo la escena deja de estar atada al lienzo: basta con
 * darle otro backend. `exportPng` copia el resultado ya compuesto; `exportSvg`
 * vuelve a ejecutar `draw(scene)` contra un contexto que, en vez de pintar,
 * **graba** cada operación como un elemento SVG.
 *
 * El PNG ya existía, pero sólo para `whiteboard` (`whiteboard.js:exportPng`).
 * Aquí sirve para los 46 módulos, y el SVG es vectorial: se pega en una guía
 * impresa o en un examen sin pixelarse.
 *
 * La secuencia de fotogramas que necesita la exportación a GIF/vídeo de la
 * WAVE 9 se apoya en este mismo mecanismo (`captureFrames`).
 */

import { getTheme } from './theme.js';

/**
 * Contexto 2D de mentira que graba en SVG.
 *
 * Cubre el subconjunto que usan las primitivas de `scene.js`. Lo que no tiene
 * equivalente vectorial razonable degrada en silencio y de forma documentada:
 * los degradados se aplanan a su color central y las sombras (que sólo aportan
 * legibilidad sobre el fondo) se omiten. Es una pérdida aceptable: el destino
 * del SVG es el papel, donde no hay brillo que simular.
 */
class SvgRecordingContext {
  /**
   * @param {number} width - px CSS.
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** @type {string[]} */
    this.out = [];
    /** @type {Array<{x:number,y:number,type:string,args:number[]}>} */
    this._path = [];

    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.globalAlpha = 1;
    this.font = '12px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.shadowColor = 'transparent';
    this.shadowBlur = 0;

    this._dash = [];
    // Matriz [a, b, c, d, e, f] como la de `setTransform`.
    this._m = [1, 0, 0, 1, 0, 0];
    /** @type {Array<object>} */
    this._stack = [];
  }

  /* --- estado --- */

  save() {
    this._stack.push({
      m: this._m.slice(),
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      globalAlpha: this.globalAlpha,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      dash: this._dash.slice()
    });
  }

  restore() {
    const s = this._stack.pop();
    if (!s) return;
    this._m = s.m;
    this.fillStyle = s.fillStyle;
    this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth;
    this.lineCap = s.lineCap;
    this.lineJoin = s.lineJoin;
    this.globalAlpha = s.globalAlpha;
    this.font = s.font;
    this.textAlign = s.textAlign;
    this.textBaseline = s.textBaseline;
    this._dash = s.dash;
  }

  /* --- transformaciones --- */

  setTransform(a, b, c, d, e, f) {
    this._m = [a, b, c, d, e, f];
  }

  transform(a, b, c, d, e, f) {
    const m = this._m;
    this._m = [
      m[0] * a + m[2] * b,
      m[1] * a + m[3] * b,
      m[0] * c + m[2] * d,
      m[1] * c + m[3] * d,
      m[0] * e + m[2] * f + m[4],
      m[1] * e + m[3] * f + m[5]
    ];
  }

  translate(x, y) {
    this.transform(1, 0, 0, 1, x, y);
  }

  scale(x, y) {
    this.transform(x, 0, 0, y, 0, 0);
  }

  rotate(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    this.transform(c, s, -s, c, 0, 0);
  }

  /** Aplica la matriz activa a un punto. */
  _pt(x, y) {
    const m = this._m;
    return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
  }

  /** Escala media de la matriz, para radios y grosores. */
  _scaleFactor() {
    const m = this._m;
    return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  }

  /* --- caminos --- */

  beginPath() {
    this._path = [];
  }

  closePath() {
    this._path.push({ type: 'Z' });
  }

  moveTo(x, y) {
    const p = this._pt(x, y);
    this._path.push({ type: 'M', x: p.x, y: p.y });
  }

  lineTo(x, y) {
    const p = this._pt(x, y);
    this._path.push({ type: 'L', x: p.x, y: p.y });
  }

  quadraticCurveTo(cx, cy, x, y) {
    const c = this._pt(cx, cy);
    const p = this._pt(x, y);
    this._path.push({ type: 'Q', cx: c.x, cy: c.y, x: p.x, y: p.y });
  }

  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    const a = this._pt(c1x, c1y);
    const b = this._pt(c2x, c2y);
    const p = this._pt(x, y);
    this._path.push({ type: 'C', ax: a.x, ay: a.y, bx: b.x, by: b.y, x: p.x, y: p.y });
  }

  arc(cx, cy, r, a0, a1, ccw = false) {
    const s = this._scaleFactor();
    const R = r * s;
    const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6;
    const start = this._pt(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
    if (full) {
      // Un círculo completo no se puede expresar con un solo arco SVG.
      const end = this._pt(cx + r * Math.cos(a0 + Math.PI), cy + r * Math.sin(a0 + Math.PI));
      this._path.push({ type: 'M', x: start.x, y: start.y });
      this._path.push({ type: 'A', r: R, large: 1, sweep: 1, x: end.x, y: end.y });
      this._path.push({ type: 'A', r: R, large: 1, sweep: 1, x: start.x, y: start.y });
      return;
    }
    const end = this._pt(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
    let delta = a1 - a0;
    if (ccw && delta > 0) delta -= Math.PI * 2;
    if (!ccw && delta < 0) delta += Math.PI * 2;
    const large = Math.abs(delta) > Math.PI ? 1 : 0;
    const sweep = delta > 0 ? 1 : 0;
    if (!this._path.length) this._path.push({ type: 'M', x: start.x, y: start.y });
    else this._path.push({ type: 'L', x: start.x, y: start.y });
    this._path.push({ type: 'A', r: R, large, sweep, x: end.x, y: end.y });
  }

  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }

  roundRect(x, y, w, h, r = 0) {
    const rr = Math.min(r, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.lineTo(x + w - rr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + rr);
    this.lineTo(x + w, y + h - rr);
    this.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    this.lineTo(x + rr, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - rr);
    this.lineTo(x, y + rr);
    this.quadraticCurveTo(x, y, x + rr, y);
    this.closePath();
  }

  _pathData() {
    let d = '';
    for (const seg of this._path) {
      switch (seg.type) {
        case 'M':
          d += `M${seg.x.toFixed(2)} ${seg.y.toFixed(2)}`;
          break;
        case 'L':
          d += `L${seg.x.toFixed(2)} ${seg.y.toFixed(2)}`;
          break;
        case 'Q':
          d += `Q${seg.cx.toFixed(2)} ${seg.cy.toFixed(2)} ${seg.x.toFixed(2)} ${seg.y.toFixed(2)}`;
          break;
        case 'C':
          d += `C${seg.ax.toFixed(2)} ${seg.ay.toFixed(2)} ${seg.bx.toFixed(2)} ${seg.by.toFixed(2)} ${seg.x.toFixed(2)} ${seg.y.toFixed(2)}`;
          break;
        case 'A':
          d += `A${seg.r.toFixed(2)} ${seg.r.toFixed(2)} 0 ${seg.large} ${seg.sweep} ${seg.x.toFixed(2)} ${seg.y.toFixed(2)}`;
          break;
        case 'Z':
          d += 'Z';
          break;
      }
    }
    return d;
  }

  /** Un degradado no tiene equivalente directo: se aplana a su color medio. */
  _flat(style) {
    if (style && typeof style === 'object' && style.__stops) {
      const stops = style.__stops;
      return stops[Math.floor(stops.length / 2)]?.color || '#888888';
    }
    return typeof style === 'string' ? style : '#000000';
  }

  _dashAttr() {
    return this._dash?.length ? ` stroke-dasharray="${this._dash.join(' ')}"` : '';
  }

  fill() {
    const d = this._pathData();
    if (!d) return;
    this.out.push(
      `<path d="${d}" fill="${this._flat(this.fillStyle)}" fill-opacity="${this.globalAlpha}" stroke="none"/>`
    );
  }

  stroke() {
    const d = this._pathData();
    if (!d) return;
    const w = this.lineWidth * this._scaleFactor();
    this.out.push(
      `<path d="${d}" fill="none" stroke="${this._flat(this.strokeStyle)}" stroke-opacity="${this.globalAlpha}" stroke-width="${w.toFixed(2)}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${this._dashAttr()}/>`
    );
  }

  fillRect(x, y, w, h) {
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
  }

  strokeRect(x, y, w, h) {
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
  }

  clearRect() {
    /* el SVG parte de un fondo explícito: no hay nada que borrar */
  }

  clip() {
    /* recorte omitido: sólo afecta a `plot`, cuyas series ya van acotadas */
  }

  drawImage() {
    /* las capas se graban por separado, no como imagen */
  }

  _fontSize() {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return m ? parseFloat(m[1]) : 12;
  }

  _fontFamily() {
    const m = /px\s+(.+)$/.exec(this.font);
    return m ? m[1] : 'sans-serif';
  }

  fillText(text, x, y) {
    const p = this._pt(x, y);
    const size = this._fontSize() * this._scaleFactor();
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start';
    const baseline =
      this.textBaseline === 'middle'
        ? 'central'
        : this.textBaseline === 'top'
          ? 'hanging'
          : 'alphabetic';
    const esc = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    this.out.push(
      `<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" fill="${this._flat(this.fillStyle)}" fill-opacity="${this.globalAlpha}" font-size="${size.toFixed(1)}" font-family="${this._fontFamily().replace(/"/g, "'")}" text-anchor="${anchor}" dominant-baseline="${baseline}">${esc}</text>`
    );
  }

  strokeText(text, x, y) {
    this.fillText(text, x, y);
  }

  /** Aproximación tipográfica: 0,55 em por carácter en fuentes de UI. */
  measureText(text) {
    return { width: String(text).length * this._fontSize() * 0.55 };
  }

  setLineDash(arr) {
    this._dash = Array.isArray(arr) ? arr.slice() : [];
  }

  getLineDash() {
    return this._dash.slice();
  }

  createRadialGradient() {
    const stops = [];
    return { __stops: stops, addColorStop: (o, color) => stops.push({ o, color }) };
  }

  createLinearGradient() {
    return this.createRadialGradient();
  }

  /** Documento SVG completo. */
  toSvg(background) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">
<rect width="100%" height="100%" fill="${background}"/>
${this.out.join('\n')}
</svg>`;
  }
}

/**
 * Descarga un blob con el nombre indicado.
 * @param {Blob} blob
 * @param {string} filename
 */
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar en el siguiente tick: Safari aún no ha leído la URL al volver.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre de archivo con marca temporal, seguro en cualquier sistema. */
function stamp(base, ext) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const slug = String(base || 'simulacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `fisicahn-${slug}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

/**
 * Exporta el lienzo tal como se ve, con las tres capas ya compuestas.
 * @param {HTMLCanvasElement} canvas
 * @param {string} [name]
 * @returns {Promise<boolean>}
 */
export function exportPng(canvas, name = 'simulacion') {
  return new Promise((resolve) => {
    if (!canvas || typeof canvas.toBlob !== 'function') {
      resolve(false);
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      download(blob, stamp(name, 'png'));
      resolve(true);
    }, 'image/png');
  });
}

/**
 * Reejecuta el dibujo del módulo contra el grabador y descarga el SVG.
 *
 * Sólo funciona con módulos migrados a `draw(scene)`: un módulo legacy dibuja
 * con `ctx` crudo y, aunque el grabador cubre casi todo el API, no hay garantía
 * de que el resultado sea fiel. Por eso se comprueba antes y se devuelve
 * `false` en lugar de producir un archivo dudoso.
 *
 * @param {object} opts
 * @param {object} opts.instance - Instancia del módulo.
 * @param {import('./scene.js').Scene} opts.scene
 * @param {import('./camera.js').Camera} opts.camera
 * @param {{w:number,h:number}} opts.size - Tamaño en px CSS.
 * @param {string} [opts.name]
 * @param {(scene: object) => void} [opts.drawBackground] - Rejilla y ejes.
 * @returns {boolean} true si se generó el archivo.
 */
export function exportSvg(opts) {
  const { instance, scene, size, name } = opts;
  if (!instance || typeof instance.draw !== 'function') return false;

  const theme = getTheme();
  const rec = new SvgRecordingContext(Math.round(size.w), Math.round(size.h));

  // El grabador no tiene DPR: el espacio ya es px CSS, matriz identidad.
  rec.setTransform(1, 0, 0, 1, 0, 0);

  scene.beginFrame(rec, { theme, dt: 0, elapsed: scene.elapsed, alpha: 0 });
  scene.beginHud(rec);
  scene.beginBackground(rec);
  try {
    if (typeof opts.drawBackground === 'function') opts.drawBackground(scene);
    instance.draw(scene);
  } catch (err) {
    console.error('Error exportando a SVG:', err);
    scene.endFrame();
    return false;
  }
  scene.endFrame();

  download(new Blob([rec.toSvg(theme.bg)], { type: 'image/svg+xml;charset=utf-8' }), stamp(name, 'svg'));
  return true;
}

/**
 * Captura N fotogramas consecutivos como `ImageBitmap`/`Blob`. Es la base de
 * la exportación a GIF/vídeo de la WAVE 9; aquí sólo se deja el mecanismo.
 * @param {HTMLCanvasElement} canvas
 * @param {number} count
 * @param {() => void} step - Avanza un fotograma de la simulación.
 * @returns {Promise<Blob[]>}
 */
export async function captureFrames(canvas, count, step) {
  const frames = [];
  for (let i = 0; i < count; i++) {
    step();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (blob) frames.push(blob);
  }
  return frames;
}

export { SvgRecordingContext };
