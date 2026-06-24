/**
 * charts.js — Gráficos SVG dinámicos sin librerías externas
 * Soporta: líneas, barras, múltiples datasets, auto-escalado, responsive.
 */

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export class Chart {
  constructor(container, opts = {}) {
    this.id = opts.id || 'chart';
    this.title = opts.title || '';
    this.xLabel = opts.xLabel || 'X';
    this.yLabel = opts.yLabel || 'Y';
    this.width = opts.width || 400;
    this.height = opts.height || 300;
    this.minX = opts.minX ?? 0;
    this.maxX = opts.maxX ?? 10;
    this.minY = opts.minY ?? 0;
    this.maxY = opts.maxY ?? 10;
    this.autoScale = opts.autoScale !== false;
    this.padding = { top: 30, right: 20, bottom: 40, left: 50 };
    this.datasets = new Map();
    this.zoomHistory = [];

    this.svg = el('svg', {
      viewBox: `0 0 ${this.width} ${this.height}`,
      class: 'chart-svg',
      id: this.id,
      preserveAspectRatio: 'xMidYMid meet'
    });

    this.buildDefs();

    const bg = el('rect', { x: 0, y: 0, width: this.width, height: this.height, fill: '#16213e', rx: 4 });
    const border = el('rect', { x: 0, y: 0, width: this.width, height: this.height, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': 1.5, rx: 4 });
    this.svg.appendChild(bg);
    this.svg.appendChild(border);

    this.plotArea = {
      x: this.padding.left,
      y: this.padding.top,
      w: this.width - this.padding.left - this.padding.right,
      h: this.height - this.padding.top - this.padding.bottom
    };

    this.drawTitle();
    this.drawGrid();
    this.drawAxes();

    if (container) container.appendChild(this.svg);
  }

  buildDefs() {
    const defs = el('defs');
    COLORS.forEach((c, i) => {
      const marker = el('marker', {
        id: `dot-${i}`,
        viewBox: '0 0 10 10',
        refX: 5, refY: 5,
        markerWidth: 6, markerHeight: 6
      });
      const circle = el('circle', { cx: 5, cy: 5, r: 4, fill: c });
      marker.appendChild(circle);
      defs.appendChild(marker);
    });
    this.svg.appendChild(defs);
  }

  drawTitle() {
    if (!this.title) return;
    const t = el('text', {
      x: this.width / 2,
      y: 18,
      'text-anchor': 'middle',
      'font-size': '13',
      'font-weight': 'bold',
      fill: '#e0e0e0'
    });
    t.textContent = this.title;
    this.svg.appendChild(t);
  }

  drawAxes() {
    const { x: ox, y: oy, w, h } = this.plotArea;
    // X axis
    this.svg.appendChild(el('line', {
      x1: ox, y1: oy + h, x2: ox + w, y2: oy + h,
      stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 1
    }));
    // Y axis
    this.svg.appendChild(el('line', {
      x1: ox, y1: oy, x2: ox, y2: oy + h,
      stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 1
    }));
    // X label
    const xl = el('text', {
      x: ox + w / 2, y: oy + h + 28,
      'text-anchor': 'middle', 'font-size': '11', fill: '#a0a0b0'
    });
    xl.textContent = this.xLabel;
    this.svg.appendChild(xl);
    // Y label
    const yl = el('text', {
      x: 14, y: oy + h / 2,
      'text-anchor': 'middle', 'font-size': '11', fill: '#a0a0b0',
      transform: `rotate(-90, 14, ${oy + h / 2})`
    });
    yl.textContent = this.yLabel;
    this.svg.appendChild(yl);
  }

  drawGrid() {
    const { x: ox, y: oy, w, h } = this.plotArea;
    const gX = el('g', { class: 'grid-x' });
    const gY = el('g', { class: 'grid-y' });

    const xTicks = 5;
    const yTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const x = ox + (w / xTicks) * i;
      const line = el('line', {
        x1: x, y1: oy, x2: x, y2: oy + h,
        stroke: 'rgba(255, 255, 255, 0.05)', 'stroke-width': 0.5
      });
      gX.appendChild(line);
      const val = this.minX + (this.maxX - this.minX) * (i / xTicks);
      const lbl = el('text', {
        x, y: oy + h + 16,
        'text-anchor': 'middle', 'font-size': '9', fill: '#a0a0b0'
      });
      lbl.textContent = val.toFixed(1);
      gX.appendChild(lbl);
    }
    for (let i = 0; i <= yTicks; i++) {
      const y = oy + h - (h / yTicks) * i;
      const line = el('line', {
        x1: ox, y1: y, x2: ox + w, y2: y,
        stroke: 'rgba(255, 255, 255, 0.05)', 'stroke-width': 0.5
      });
      gY.appendChild(line);
      const val = this.minY + (this.maxY - this.minY) * (i / yTicks);
      const lbl = el('text', {
        x: ox - 6, y: y + 3,
        'text-anchor': 'end', 'font-size': '9', fill: '#a0a0b0'
      });
      lbl.textContent = val.toFixed(1);
      gY.appendChild(lbl);
    }
    this.svg.appendChild(gX);
    this.svg.appendChild(gY);
  }

  xToPixel(x) {
    const { x: ox, w } = this.plotArea;
    return ox + ((x - this.minX) / (this.maxX - this.minX || 1)) * w;
  }

  yToPixel(y) {
    const { y: oy, h } = this.plotArea;
    return oy + h - ((y - this.minY) / (this.maxY - this.minY || 1)) * h;
  }

  addDataPoint(datasetId, x, y) {
    let ds = this.datasets.get(datasetId);
    if (!ds) {
      const idx = this.datasets.size;
      ds = { id: datasetId, data: [], color: COLORS[idx % COLORS.length], group: null };
      this.datasets.set(datasetId, ds);
    }
    ds.data.push({ x, y });

    if (this.autoScale) this.recalcBounds();
    this.render();
  }

  setData(datasetId, data) {
    const idx = [...this.datasets.keys()].indexOf(datasetId);
    const colorIdx = idx >= 0 ? idx : this.datasets.size;
    this.datasets.set(datasetId, {
      id: datasetId,
      data: data.map(p => ({ x: p.x ?? p[0], y: p.y ?? p[1] })),
      color: COLORS[colorIdx % COLORS.length],
      group: null
    });
    if (this.autoScale) this.recalcBounds();
    this.render();
  }

  recalcBounds() {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    this.datasets.forEach(ds => {
      ds.data.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });
    if (minX === Infinity) return;
    const padX = (maxX - minX) * 0.1 || 1;
    const padY = (maxY - minY) * 0.1 || 1;
    this.minX = Math.min(this.minX, minX - padX);
    this.maxX = Math.max(this.maxX, maxX + padX);
    this.minY = Math.min(this.minY, minY - padY);
    this.maxY = Math.max(this.maxY, maxY + padY);
  }

  pushZoom() {
    this.zoomHistory.push({ minX: this.minX, maxX: this.maxX, minY: this.minY, maxY: this.maxY });
  }

  zoomTo(xMin, xMax, yMin, yMax) {
    this.pushZoom();
    this.minX = xMin; this.maxX = xMax;
    this.minY = yMin; this.maxY = yMax;
    this.autoScale = false;
    this.render();
  }

  zoomReset() {
    if (this.zoomHistory.length === 0) return;
    const z = this.zoomHistory.pop();
    Object.assign(this, z);
    this.autoScale = this.zoomHistory.length === 0;
    this.render();
  }

  removeDataset(datasetId) {
    this.datasets.delete(datasetId);
    this.render();
  }

  render() {
    // Remove old plot groups
    this.svg.querySelectorAll('.chart-plot').forEach(el => el.remove());

    const plotGroup = el('g', { class: 'chart-plot' });

    this.datasets.forEach((ds, dsId) => {
      const { data, color } = ds;
      if (data.length < 1) return;

      const isBar = dsId.startsWith('bar-');
      const points = data.map(p => ({
        px: this.xToPixel(p.x),
        py: this.yToPixel(p.y)
      }));

      if (isBar) {
        // Bar chart
        const barWidth = Math.max(2, (this.plotArea.w / data.length) * 0.6);
        points.forEach((p, i) => {
          const barBottom = this.yToPixel(0);
          const bar = el('rect', {
            x: p.px - barWidth / 2,
            y: p.py,
            width: barWidth,
            height: Math.max(1, barBottom - p.py),
            fill: color,
            opacity: '0.8',
            rx: '1'
          });
          plotGroup.appendChild(bar);
        });
      } else {
        // Line chart
        if (data.length >= 2) {
          let pathD = '';
          points.forEach((p, i) => {
            pathD += (i === 0 ? 'M' : 'L') + p.px.toFixed(1) + ',' + p.py.toFixed(1);
          });
          const path = el('path', {
            d: pathD,
            fill: 'none',
            stroke: color,
            'stroke-width': '2',
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round'
          });
          plotGroup.appendChild(path);
        }

        // Dot markers
        points.forEach((p, i) => {
          const dot = el('circle', {
            cx: p.px, cy: p.py, r: '3',
            fill: color,
            stroke: '#fff',
            'stroke-width': '1'
          });
          // Tooltip
          const dp = data[i];
          dot.addEventListener('mouseenter', (e) => {
            this.showTooltip(e, dp);
          });
          dot.addEventListener('mouseleave', () => this.hideTooltip());
          plotGroup.appendChild(dot);
        });
      }

      // Legend
      const legendIdx = [...this.datasets.keys()].indexOf(dsId);
      const ly = this.padding.top + legendIdx * 16;
      const legend = el('g', { class: 'chart-legend' });
      const ldot = el('circle', { cx: this.width - 70, cy: ly - 3, r: 4, fill: color });
      legend.appendChild(ldot);
      const ltxt = el('text', {
        x: this.width - 62, y: ly + 1,
        'font-size': '9', fill: '#e0e0e0'
      });
      ltxt.textContent = dsId;
      legend.appendChild(ltxt);
      plotGroup.appendChild(legend);
    });

    this.svg.appendChild(plotGroup);
  }

  showTooltip(event, dataPoint) {
    this.hideTooltip();
    const tt = document.createElement('div');
    tt.className = 'chart-tooltip';
    tt.textContent = `(${dataPoint.x.toFixed(2)}, ${dataPoint.y.toFixed(2)})`;
    tt.style.position = 'absolute';
    tt.style.background = '#1f2937';
    tt.style.color = '#fff';
    tt.style.padding = '4px 8px';
    tt.style.borderRadius = '4px';
    tt.style.fontSize = '12px';
    tt.style.pointerEvents = 'none';
    tt.style.zIndex = '1000';
    tt.style.whiteSpace = 'nowrap';
    const rect = this.svg.getBoundingClientRect();
    tt.style.left = (event.clientX - rect.left + 10) + 'px';
    tt.style.top = (event.clientY - rect.top - 10) + 'px';
    this.svg.parentElement.appendChild(tt);
    this._tooltip = tt;
  }

  hideTooltip() {
    this._tooltip?.remove();
    this._tooltip = null;
  }

  clear() {
    this.datasets.clear();
    this.render();
  }

  resize(width, height) {
    this.width = width || this.width;
    this.height = height || this.height;
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.plotArea = {
      x: this.padding.left,
      y: this.padding.top,
      w: this.width - this.padding.left - this.padding.right,
      h: this.height - this.padding.top - this.padding.bottom
    };
    this.render();
  }
}
