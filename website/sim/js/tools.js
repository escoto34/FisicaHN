/**
 * tools.js — Instrumentos de medición virtuales
 * Cronómetro, regla superpuesta y multímetro virtual.
 */

export class Stopwatch {
  constructor(container, opts = {}) {
    this.container = container;
    this.running = false;
    this.startTime = 0;
    this.elapsed = 0;
    this.laps = [];
    this.frameId = null;
    this.formatLabel = opts.formatLabel || 'Tiempo transcurrido';

    this.buildUI();
  }

  buildUI() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'tool-stopwatch';

    const title = document.createElement('h4');
    title.className = 'tool-title';
    title.textContent = 'Cronómetro';
    this.wrapper.appendChild(title);

    this.display = document.createElement('div');
    this.display.className = 'stopwatch-display';
    this.display.textContent = '0.00s';
    this.wrapper.appendChild(this.display);

    this.lapList = document.createElement('ul');
    this.lapList.className = 'stopwatch-laps';
    this.wrapper.appendChild(this.lapList);

    const btnRow = document.createElement('div');
    btnRow.className = 'tool-btn-row';

    this.btnStart = document.createElement('button');
    this.btnStart.className = 'tool-btn tool-btn-primary';
    this.btnStart.textContent = '▶ Iniciar';
    this.btnStart.addEventListener('click', () => this.start());
    btnRow.appendChild(this.btnStart);

    this.btnLap = document.createElement('button');
    this.btnLap.className = 'tool-btn';
    this.btnLap.textContent = '⏱ Vuelta';
    this.btnLap.addEventListener('click', () => this.lap());
    btnRow.appendChild(this.btnLap);

    this.btnReset = document.createElement('button');
    this.btnReset.className = 'tool-btn tool-btn-danger';
    this.btnReset.textContent = '↺ Reiniciar';
    this.btnReset.addEventListener('click', () => this.reset());
    btnRow.appendChild(this.btnReset);

    this.wrapper.appendChild(btnRow);

    if (this.container) this.container.appendChild(this.wrapper);
  }

  start() {
    if (this.running) {
      this.running = false;
      cancelAnimationFrame(this.frameId);
      this.btnStart.textContent = '▶ Reanudar';
      return;
    }
    this.running = true;
    this.startTime = performance.now() - this.elapsed;
    this.btnStart.textContent = '⏸ Pausar';
    this.tick();
  }

  tick() {
    if (!this.running) return;
    this.elapsed = performance.now() - this.startTime;
    this.display.textContent = this.formatTime(this.elapsed);
    this.frameId = requestAnimationFrame(() => this.tick());
  }

  lap() {
    if (!this.running) return;
    const lapTime = this.elapsed;
    this.laps.push(lapTime);
    const li = document.createElement('li');
    li.textContent = `Vuelta ${this.laps.length}: ${this.formatTime(lapTime)}`;
    this.lapList.appendChild(li);
  }

  reset() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.elapsed = 0;
    this.laps = [];
    this.startTime = 0;
    this.display.textContent = '0.00s';
    this.lapList.innerHTML = '';
    this.btnStart.textContent = '▶ Iniciar';
  }

  formatTime(ms) {
    const s = ms / 1000;
    return s.toFixed(2) + 's';
  }

  getElapsed() {
    return this.elapsed;
  }

  destroy() {
    this.reset();
    this.wrapper.remove();
  }
}

export class Ruler {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.pixelsPerMeter = opts.pixelsPerMeter || 100;
    this.visible = false;
    this._origin = { x: 50, y: 50 };
    this._dragging = false;
    this._dragOffset = { x: 0, y: 0 };

    this.buildOverlay();
    this.bindEvents();
  }

  buildOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'ruler-overlay';
    this.overlay.style.position = 'absolute';
    this.overlay.style.pointerEvents = 'none';
    this.overlay.style.display = 'none';

    this.rulerEl = document.createElement('div');
    this.rulerEl.className = 'ruler-tool';
    this.rulerEl.style.position = 'absolute';
    this.rulerEl.style.pointerEvents = 'auto';
    this.rulerEl.style.cursor = 'grab';
    this.rulerEl.style.background = 'rgba(59, 130, 246, 0.12)';
    this.rulerEl.style.border = '2px solid #3b82f6';
    this.rulerEl.style.borderRadius = '4px';
    this.rulerEl.style.userSelect = 'none';

    this.rulerLabel = document.createElement('div');
    this.rulerLabel.className = 'ruler-label';
    this.rulerLabel.style.position = 'absolute';
    this.rulerLabel.style.top = '-22px';
    this.rulerLabel.style.left = '0';
    this.rulerLabel.style.background = '#3b82f6';
    this.rulerLabel.style.color = '#fff';
    this.rulerLabel.style.padding = '2px 6px';
    this.rulerLabel.style.borderRadius = '3px';
    this.rulerLabel.style.fontSize = '11px';
    this.rulerLabel.style.fontWeight = 'bold';
    this.rulerLabel.style.whiteSpace = 'nowrap';
    this.rulerEl.appendChild(this.rulerLabel);

    this.rulerEl.appendChild(this.createRulerTicks());

    this.overlay.appendChild(this.rulerEl);
    this.canvas.parentElement.appendChild(this.overlay);
  }

  createRulerTicks() {
    const container = document.createElement('div');
    container.className = 'ruler-ticks';
    container.style.cssText = 'position:absolute;top:8px;left:0;right:0;height:24px;overflow:hidden';

    const canvasRect = this.canvas.getBoundingClientRect();
    const widthPx = canvasRect.width;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '24');
    svg.style.display = 'block';

    const meters = Math.ceil(widthPx / this.pixelsPerMeter);
    for (let i = 0; i <= meters; i++) {
      const x = i * this.pixelsPerMeter;
      const major = i % 5 === 0;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', x);
      line.setAttribute('y1', '0');
      line.setAttribute('x2', x);
      line.setAttribute('y2', major ? '20' : '10');
      line.setAttribute('stroke', '#3b82f6');
      line.setAttribute('stroke-width', major ? '1.5' : '0.8');
      svg.appendChild(line);

      if (major) {
        const txt = document.createElementNS(svgNS, 'text');
        txt.setAttribute('x', x);
        txt.setAttribute('y', '22');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '8');
        txt.setAttribute('fill', '#3b82f6');
        txt.textContent = i + 'm';
        svg.appendChild(txt);
      }
    }
    container.appendChild(svg);
    return container;
  }

  bindEvents() {
    const mouseDown = (e) => {
      if (!this.visible) return;
      const rect = this.rulerEl.getBoundingClientRect();
      this._dragOffset = {
        x: (e.clientX || e.touches?.[0]?.clientX) - rect.left,
        y: (e.clientY || e.touches?.[0]?.clientY) - rect.top
      };
      this._dragging = true;
      this.rulerEl.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const mouseMove = (e) => {
      if (!this._dragging) return;
      const canvasRect = this.canvas.getBoundingClientRect();
      const parentRect = this.overlay.getBoundingClientRect();
      let cx = (e.clientX || e.touches?.[0]?.clientX) - parentRect.left - this._dragOffset.x;
      let cy = (e.clientY || e.touches?.[0]?.clientY) - parentRect.top - this._dragOffset.y;
      cx = Math.max(0, Math.min(cx, parentRect.width - 50));
      cy = Math.max(0, Math.min(cy, parentRect.height - 40));
      this.rulerEl.style.left = cx + 'px';
      this.rulerEl.style.top = cy + 'px';
    };

    const mouseUp = () => {
      this._dragging = false;
      this.rulerEl.style.cursor = 'grab';
    };

    this.rulerEl.addEventListener('mousedown', mouseDown);
    this.rulerEl.addEventListener('touchstart', mouseDown, { passive: false });
    document.addEventListener('mousemove', mouseMove);
    document.addEventListener('touchmove', mouseMove, { passive: false });
    document.addEventListener('mouseup', mouseUp);
    document.addEventListener('touchend', mouseUp);
  }

  show() {
    this.visible = true;
    this.overlay.style.display = 'block';
  }

  hide() {
    this.visible = false;
    this.overlay.style.display = 'none';
  }

  toggle() {
    this.visible ? this.hide() : this.show();
  }

  setScale(pixelsPerMeter) {
    this.pixelsPerMeter = pixelsPerMeter;
    this.rulerEl.innerHTML = '';
    this.rulerLabel = document.createElement('div');
    this.rulerLabel.className = 'ruler-label';
    this.rulerLabel.style.cssText = 'position:absolute;top:-22px;left:0;background:#3b82f6;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:bold;white-space:nowrap';
    this.rulerEl.appendChild(this.rulerLabel);
    this.rulerEl.appendChild(this.createRulerTicks());
    this.updateLabel();
  }

  updateLabel() {
    const w = this.rulerEl.offsetWidth;
    const meters = (w / this.pixelsPerMeter).toFixed(1);
    this.rulerLabel.textContent = meters + ' m';
  }

  destroy() {
    this.overlay.remove();
  }
}

export class Multimeter {
  constructor(container, opts = {}) {
    this.container = container;
    this.mode = opts.mode || 'voltage';
    this.reading = 0;
    this.unitMap = { voltage: 'V', current: 'A', resistance: 'Ω' };
    this.probeConnected = false;

    this.buildUI();
  }

  buildUI() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'tool-multimeter';

    const title = document.createElement('h4');
    title.className = 'tool-title';
    title.textContent = 'Multímetro Virtual';
    this.wrapper.appendChild(title);

    this.display = document.createElement('div');
    this.display.className = 'multimeter-display';
    this.display.innerHTML = `
      <div class="mm-reading">0.00 <span class="mm-unit">V</span></div>
      <div class="mm-mode-label">Modo: Voltaje</div>
    `;
    this.wrapper.appendChild(this.display);

    const modeRow = document.createElement('div');
    modeRow.className = 'tool-btn-row';

    const modes = [
      { id: 'voltage', label: 'V∼' },
      { id: 'current', label: 'A∼' },
      { id: 'resistance', label: 'Ω' }
    ];
    modes.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'tool-btn' + (m.id === this.mode ? ' tool-btn-active' : '');
      btn.textContent = m.label;
      btn.addEventListener('click', () => this.setMode(m.id));
      modeRow.appendChild(btn);
      this[`btn${m.id}`] = btn;
    });
    this.wrapper.appendChild(modeRow);

    // Probes indicator
    this.probeIndicator = document.createElement('div');
    this.probeIndicator.className = 'multimeter-probes';
    this.probeIndicator.innerHTML = `
      <span class="probe probe-red">● Punta roja</span>
      <span class="probe probe-black">● Punta negra</span>
      <span class="probe-status">Desconectado</span>
    `;
    this.wrapper.appendChild(this.probeIndicator);

    if (this.container) this.container.appendChild(this.wrapper);
  }

  setMode(mode) {
    this.mode = mode;
    ['voltage', 'current', 'resistance'].forEach(m => {
      const btn = this[`btn${m}`];
      if (btn) btn.className = 'tool-btn' + (m === mode ? ' tool-btn-active' : '');
    });
    const labels = { voltage: 'Voltaje', current: 'Corriente', resistance: 'Resistencia' };
    this.display.querySelector('.mm-mode-label').textContent = `Modo: ${labels[mode]}`;
    this.display.querySelector('.mm-unit').textContent = this.unitMap[mode];
    this.updateReading(this.reading);
  }

  connect() {
    this.probeConnected = true;
    this.probeIndicator.querySelector('.probe-status').textContent = 'Conectado';
    this.probeIndicator.querySelector('.probe-status').style.color = '#22c55e';
  }

  disconnect() {
    this.probeConnected = false;
    this.probeIndicator.querySelector('.probe-status').textContent = 'Desconectado';
    this.probeIndicator.querySelector('.probe-status').style.color = '#ef4444';
    this.updateReading(0);
  }

  updateReading(value) {
    this.reading = value;
    const unit = this.unitMap[this.mode] || 'V';
    this.display.querySelector('.mm-reading').innerHTML =
      `${value.toFixed(2)} <span class="mm-unit">${unit}</span>`;
  }

  destroy() {
    this.wrapper.remove();
  }
}
