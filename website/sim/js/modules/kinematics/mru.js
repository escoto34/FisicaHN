export class MRU {
    constructor() {
        this.params = {
            v0: 10,
            x0: 0,
        };
        this.state = {
            time: 0,
            position: 0,
            velocity: 0,
            acceleration: 0,
            trail: [],
            running: false,
        };
        this.canvas = null;
        this.ctx = null;
        this.renderer = null;
        this.ppm = 30;
        this.originX = 80;
        this.objectY = 0;
        this.trailTimer = 0;
    }

    init(canvas, renderer) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.renderer = renderer;
        this.objectY = canvas.height / 2;
        this.reset();
    }

    reset() {
        this.state.time = 0;
        this.state.position = this.params.x0;
        this.state.velocity = this.params.v0;
        this.state.acceleration = 0;
        this.state.trail = [{ x: this.params.x0, t: 0 }];
        this.state.running = false;
        this.trailTimer = 0;
        this._updateScale();
    }

    start() {
        this.state.running = true;
    }

    pause() {
        this.state.running = false;
    }

    update(dt) {
        if (!this.state.running) return;
        this.state.time += dt;
        const t = this.state.time;
        const { v0, x0 } = this.params;

        const x = x0 + v0 * t;

        this.state.position = x;
        this.state.velocity = v0;
        this.state.acceleration = 0;

        this.trailTimer += dt;
        if (this.trailTimer >= 0.05) {
            this.trailTimer = 0;
            this.state.trail.push({ x, t });
            if (this.state.trail.length > 800) {
                this.state.trail = this.state.trail.slice(-400);
            }
        }

        this._updateScale();
    }

    render(ctx) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        this._drawGrid(ctx, w, h);
        this._drawAxis(ctx, w, h);
        this._drawRuler(ctx, w, h);
        this._drawTrail(ctx, w, h);
        this._drawObject(ctx, w, h);
        this._drawInfo(ctx, w, h);
    }

    _updateScale() {
        const maxDist = Math.abs(this.params.x0) + Math.abs(this.params.v0) * 12;
        const availW = this.canvas.width - 160;
        this.ppm = Math.max(5, Math.min(60, availW / (maxDist * 2 + 20)));
        this.originX = Math.max(60, 60 + (this.params.x0 < 0 ? Math.abs(this.params.x0) * this.ppm * 0.3 : 0));
        this.originX = Math.min(this.canvas.width * 0.5, this.originX);
    }

    _toCanvasX(x) {
        return this.originX + x * this.ppm;
    }

    _toCanvasY() {
        return this.objectY;
    }

    _toPhysicsX(cx) {
        return (cx - this.originX) / this.ppm;
    }

    _drawGrid(ctx, w, h) {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, w, h);

        const viewRange = this._getVisibleRange();
        const step = this._getGridStep(viewRange.maxX - viewRange.minX);
        const startX = Math.floor(viewRange.minX / step) * step;
        const endX = Math.ceil(viewRange.maxX / step) * step;

        ctx.strokeStyle = '#1a1a3e';
        ctx.lineWidth = 1;
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = '#555577';
        ctx.textAlign = 'center';

        for (let x = startX; x <= endX; x += step) {
            const cx = this._toCanvasX(x);
            if (cx < 0 || cx > w) continue;
            ctx.beginPath();
            ctx.moveTo(cx, 20);
            ctx.lineTo(cx, h - 30);
            ctx.stroke();
            ctx.fillText(`${x.toFixed(x % 1 === 0 ? 0 : 1)}`, cx, h - 14);
        }

        ctx.strokeStyle = '#333355';
        ctx.beginPath();
        ctx.moveTo(0, this.objectY);
        ctx.lineTo(w, this.objectY);
        ctx.stroke();
    }

    _drawAxis(ctx, w, h) {
        ctx.strokeStyle = '#555577';
        ctx.lineWidth = 2;

        const axisY = h - 30;
        ctx.beginPath();
        ctx.moveTo(40, axisY);
        ctx.lineTo(w - 20, axisY);
        ctx.stroke();

        ctx.fillStyle = '#8888aa';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('x (m)', w - 20, axisY - 6);

        ctx.textAlign = 'center';
        ctx.fillText('t (s)', w - 20, h - 4);
    }

    _drawRuler(ctx, w, h) {
        const rulerY = h - 24;
        const viewRange = this._getVisibleRange();
        const step = this._getGridStep(viewRange.maxX - viewRange.minX);

        ctx.strokeStyle = '#666688';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50, rulerY);
        ctx.lineTo(w - 30, rulerY);
        ctx.stroke();

        ctx.lineWidth = 1;
        ctx.font = '9px monospace';
        ctx.fillStyle = '#8888aa';
        ctx.textAlign = 'center';

        const startX = Math.floor(viewRange.minX / step) * step;
        const endX = Math.ceil(viewRange.maxX / step) * step;
        for (let x = startX; x <= endX; x += step) {
            const cx = this._toCanvasX(x);
            if (cx < 50 || cx > w - 30) continue;
            const major = Math.abs(x % (step * 5)) < 0.001;
            ctx.beginPath();
            ctx.moveTo(cx, rulerY);
            ctx.lineTo(cx, rulerY + (major ? 10 : 5));
            ctx.stroke();
        }
    }

    _drawTrail(ctx, w, h) {
        const trail = this.state.trail;
        if (trail.length < 2) return;

        ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
        for (let i = 0; i < trail.length; i++) {
            const cx = this._toCanvasX(trail[i].x);
            ctx.beginPath();
            ctx.arc(cx, this.objectY, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        const first = this._toCanvasX(trail[0].x);
        ctx.moveTo(first, this.objectY);
        for (let i = 1; i < trail.length; i++) {
            ctx.lineTo(this._toCanvasX(trail[i].x), this.objectY);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _drawObject(ctx, w, h) {
        const cx = this._toCanvasX(this.state.position);
        const cy = this.objectY;

        const size = 18;

        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = 'rgba(0, 229, 255, 0.5)';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.roundRect(cx - size / 2, cy - size / 2, size, size * 0.7, 3);
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('→', cx, cy);
    }

    _drawInfo(ctx, w, h) {
        ctx.fillStyle = 'rgba(10, 10, 26, 0.75)';
        ctx.fillRect(w - 200, 10, 190, 80);

        ctx.font = '13px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const lines = [
            { label: 't =', value: `${this.state.time.toFixed(2)} s`, color: '#8888aa' },
            { label: 'x =', value: `${this.state.position.toFixed(2)} m`, color: '#00e5ff' },
            { label: 'v =', value: `${this.state.velocity.toFixed(2)} m/s`, color: '#00ff88' },
            { label: 'a =', value: `${this.state.acceleration.toFixed(1)} m/s²', color: '#ff8c00' },
        ];

        lines.forEach((line, i) => {
            ctx.fillStyle = '#8888aa';
            ctx.fillText(line.label, w - 190, 16 + i * 17);
            ctx.fillStyle = line.color;
            ctx.fillText(line.value, w - 150, 16 + i * 17);
        });
    }

    _getVisibleRange() {
        const trail = this.state.trail;
        let minX = this.params.x0 - 5;
        let maxX = this.params.x0 + 5;
        if (trail.length > 0) {
            const xs = trail.map(p => p.x);
            minX = Math.min(minX, ...xs);
            maxX = Math.max(maxX, ...xs);
        }
        minX = Math.min(minX, this.state.position - 2);
        maxX = Math.max(maxX, this.state.position + 2);
        const range = maxX - minX;
        if (range < 10) {
            const center = (minX + maxX) / 2;
            minX = center - 5;
            maxX = center + 5;
        }
        const pad = (maxX - minX) * 0.15;
        return { minX: minX - pad, maxX: maxX + pad };
    }

    _getGridStep(range) {
        if (range <= 5) return 0.5;
        if (range <= 20) return 1;
        if (range <= 50) return 2;
        if (range <= 100) return 5;
        if (range <= 200) return 10;
        return 20;
    }

    getControls() {
        return [
            {
                id: 'v0',
                label: 'Velocidad inicial (m/s)',
                type: 'range',
                min: 0,
                max: 50,
                step: 0.1,
                default: 10,
                unit: 'm/s',
            },
            {
                id: 'x0',
                label: 'Posición inicial (m)',
                type: 'range',
                min: -100,
                max: 100,
                step: 1,
                default: 0,
                unit: 'm',
            },
        ];
    }

    getCharts() {
        const trail = this.state.trail;
        return [
            {
                id: 'xt',
                label: 'x vs t',
                datasets: [
                    {
                        id: 'x',
                        label: 'x(t)',
                        color: '#00e5ff',
                        data: trail.map(p => ({ x: p.t, y: p.x })),
                    },
                ],
                xLabel: 't (s)',
                yLabel: 'x (m)',
            },
            {
                id: 'vt',
                label: 'v vs t',
                datasets: [
                    {
                        id: 'v',
                        label: 'v(t)',
                        color: '#00ff88',
                        data: [
                            { x: 0, y: this.params.v0 },
                            { x: this.state.time, y: this.params.v0 },
                        ],
                    },
                ],
                xLabel: 't (s)',
                yLabel: 'v (m/s)',
            },
        ];
    }

    getState() {
        return {
            time: this.state.time,
            position: this.state.position,
            velocity: this.state.velocity,
            acceleration: this.state.acceleration,
            running: this.state.running,
        };
    }

    setParam(id, value) {
        if (id in this.params) {
            this.params[id] = Number(value);
            this.reset();
        }
    }
}
