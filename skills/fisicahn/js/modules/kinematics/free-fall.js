export class FreeFall {
    constructor() {
        this.params = {
            h0: 50,
            g: 9.81,
        };
        this.state = {
            time: 0,
            height: 0,
            velocity: 0,
            impactTime: 0,
            impactVelocity: 0,
            landed: false,
            trail: [],
            running: false,
        };
        this.canvas = null;
        this.ctx = null;
        this.renderer = null;
        this.ppm = 4;
        this.groundY = 0;
        this.ballX = 0;
        this.trailTimer = 0;
    }

    init(canvas, renderer) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.renderer = renderer;
        this.ballX = canvas.width / 2;
        this.reset();
    }

    reset() {
        this.state.time = 0;
        this.state.height = this.params.h0;
        this.state.velocity = 0;
        this.state.landed = false;
        this.state.trail = [{ y: this.params.h0, v: 0, t: 0 }];
        this.state.running = false;
        this.trailTimer = 0;
        this._precomputeImpact();
        this._updateScale();
    }

    start() {
        this.state.running = true;
    }

    pause() {
        this.state.running = false;
    }

    _precomputeImpact() {
        const { h0, g } = this.params;
        const disc = 2 * g * h0;
        const tImpact = Math.sqrt(disc) / g;
        const vImpact = -g * tImpact;
        this.state.impactTime = tImpact;
        this.state.impactVelocity = Math.abs(vImpact);
    }

    update(dt) {
        if (!this.state.running || this.state.landed) return;
        this.state.time += dt;
        const t = this.state.time;
        const { h0, g } = this.params;

        const y = h0 - 0.5 * g * t * t;
        const vy = -g * t;

        if (y <= 0) {
            this.state.height = 0;
            this.state.velocity = -g * this.state.impactTime;
            this.state.landed = true;
            this.state.running = false;
            this.state.trail.push({ y: 0, v: this.state.velocity, t });
            return;
        }

        this.state.height = y;
        this.state.velocity = vy;

        this.trailTimer += dt;
        if (this.trailTimer >= 0.04) {
            this.trailTimer = 0;
            this.state.trail.push({ y, v: vy, t });
            if (this.state.trail.length > 600) {
                this.state.trail = this.state.trail.slice(-300);
            }
        }
    }

    render(ctx) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        this._drawBackground(ctx, w, h);
        this._drawGrid(ctx, w, h);
        this._drawGround(ctx, w, h);
        this._drawRuler(ctx, w, h);
        this._drawTrail(ctx, w, h);
        this._drawBall(ctx, w, h);
        this._drawInfo(ctx, w, h);
        this._drawSpeedIndicator(ctx, w, h);
        this._drawStopwatch(ctx, w, h);
    }

    _updateScale() {
        const h = this.canvas.height;
        const availH = h - 100;
        this.ppm = Math.max(2, Math.min(15, availH / (this.params.h0 + 5)));
        this.groundY = h - 50;
    }

    _toCanvasY(height) {
        return this.groundY - height * this.ppm;
    }

    _toCanvasX(offset = 0) {
        return this.ballX + offset;
    }

    _drawBackground(ctx, w, h) {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, w, h);

        const grad = ctx.createLinearGradient(0, 20, 0, this.groundY);
        grad.addColorStop(0, 'rgba(0, 229, 255, 0.02)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 20, w, this.groundY - 20);

        ctx.strokeStyle = '#1a1a3e';
        ctx.lineWidth = 1;
        const step = this._getGridStep(this.params.h0);
        const yGrid = this.groundY;
        for (let y = 0; y <= this.params.h0 + 2; y += step) {
            const cy = this._toCanvasY(y);
            if (cy < 20 || cy > yGrid - 5) continue;
            ctx.beginPath();
            ctx.moveTo(30, cy);
            ctx.lineTo(w - 80, cy);
            ctx.stroke();
        }
    }

    _drawGrid(ctx, w, h) {
        const step = this._getGridStep(this.params.h0);
        ctx.fillStyle = '#555577';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        for (let y = 0; y <= this.params.h0 + 2; y += step) {
            const cy = this._toCanvasY(y);
            if (cy < 25 || cy > this.groundY - 5) continue;
            ctx.fillText(`${y.toFixed(y % 1 === 0 ? 0 : 1)}`, 26, cy + 3);
        }

        ctx.fillStyle = '#8888aa';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('h (m)', 20, 16);
    }

    _drawGround(ctx, w, h) {
        ctx.strokeStyle = '#444466';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, this.groundY);
        ctx.lineTo(w, this.groundY);
        ctx.stroke();

        ctx.fillStyle = '#333355';
        for (let x = 0; x < w; x += 20) {
            ctx.fillRect(x, this.groundY + 2, 10, 4);
        }

        ctx.fillStyle = '#555577';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('suelo (y = 0)', w - 110, this.groundY - 8);
    }

    _drawRuler(ctx, w, h) {
        const rulerX = w - 50;
        const rulerTop = 25;
        const rulerBottom = this.groundY - 10;
        const rulerHeight = rulerBottom - rulerTop;

        ctx.strokeStyle = '#555577';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rulerX, rulerTop);
        ctx.lineTo(rulerX, rulerBottom);
        ctx.stroke();

        const step = this._getGridStep(this.params.h0);
        ctx.lineWidth = 1;
        ctx.font = '8px monospace';
        ctx.fillStyle = '#666688';
        ctx.textAlign = 'left';

        for (let y = 0; y <= this.params.h0 + 2; y += step) {
            const cy = this._toCanvasY(y);
            if (cy < rulerTop + 5 || cy > rulerBottom - 5) continue;
            const visualY = rulerTop + (cy - 25) / (this.groundY - 25) * rulerHeight;
            ctx.beginPath();
            ctx.moveTo(rulerX, visualY);
            ctx.lineTo(rulerX + 8, visualY);
            ctx.stroke();
            ctx.fillText(`${y}`, rulerX + 10, visualY + 3);
        }
    }

    _drawTrail(ctx, w, h) {
        const trail = this.state.trail;
        if (trail.length < 2) return;

        ctx.fillStyle = 'rgba(0, 255, 136, 0.35)';
        for (let i = 0; i < trail.length; i++) {
            const cy = this._toCanvasY(trail[i].y);
            if (cy < 20 || cy > this.groundY) continue;
            ctx.beginPath();
            ctx.arc(this.ballX, cy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = 'rgba(0, 255, 136, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < trail.length; i++) {
            const cy = this._toCanvasY(trail[i].y);
            if (cy < 20 || cy > this.groundY) continue;
            if (!started) {
                ctx.moveTo(this.ballX, cy);
                started = true;
            } else {
                ctx.lineTo(this.ballX, cy);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _drawBall(ctx, w, h) {
        const cy = this.state.landed ? this.groundY : this._toCanvasY(this.state.height);
        const r = 10;

        ctx.shadowColor = 'rgba(0, 255, 136, 0.6)';
        ctx.shadowBlur = 15;

        const gradient = ctx.createRadialGradient(
            this.ballX - r * 0.3, cy - r * 0.3, r * 0.1,
            this.ballX, cy, r
        );
        gradient.addColorStop(0, '#88ffbb');
        gradient.addColorStop(0.6, '#00ff88');
        gradient.addColorStop(1, '#00aa55');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.ballX, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (this.state.landed) {
            ctx.fillStyle = 'rgba(255, 68, 68, 0.6)';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💥', this.ballX, this.groundY - 25);
        }
    }

    _drawInfo(ctx, w, h) {
        ctx.fillStyle = 'rgba(10, 10, 26, 0.8)';
        ctx.fillRect(10, 10, 200, 95);

        ctx.font = '13px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const lines = [
            { label: 't =', value: `${this.state.time.toFixed(2)} s`, color: '#8888aa' },
            { label: 'h =', value: `${this.state.height.toFixed(2)} m`, color: '#00ff88' },
            { label: 'v =', value: `${Math.abs(this.state.velocity).toFixed(2)} m/s ↓`, color: '#ff8c00' },
            { label: 'g =', value: `${this.params.g.toFixed(2)} m/s²`, color: '#00e5ff' },
            { label: 't_impacto =', value: `${this.state.impactTime.toFixed(2)} s`, color: '#aa66ff' },
            { label: 'v_impacto =', value: `${this.state.impactVelocity.toFixed(2)} m/s`, color: '#ff4444' },
        ];

        lines.forEach((line, i) => {
            ctx.fillStyle = '#8888aa';
            ctx.fillText(line.label, 16, 16 + i * 14);
            ctx.fillStyle = line.color;
            ctx.fillText(line.value, 100, 16 + i * 14);
        });
    }

    _drawSpeedIndicator(ctx, w, h) {
        const barX = w - 80;
        const barY = 40;
        const barW = 20;
        const barH = 150;

        ctx.fillStyle = '#1a1a3e';
        ctx.fillRect(barX, barY, barW, barH);

        const maxV = Math.max(1, this.state.impactVelocity);
        const ratio = Math.abs(this.state.velocity) / maxV;
        const fillH = Math.min(barH, ratio * barH);

        const grad = ctx.createLinearGradient(0, barY + barH, 0, barY);
        grad.addColorStop(0, '#00ff88');
        grad.addColorStop(0.5, '#ff8c00');
        grad.addColorStop(1, '#ff4444');
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY + barH - fillH, barW, fillH);

        ctx.strokeStyle = '#444466';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = '#8888aa';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('v', barX + barW / 2, barY - 5);
    }

    _drawStopwatch(ctx, w, h) {
        const swX = w / 2 - 50;
        const swY = 12;

        ctx.fillStyle = 'rgba(10, 10, 26, 0.7)';
        ctx.fillRect(swX, swY, 100, 28);

        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const t = this.state.time;
        const min = Math.floor(t / 60);
        const sec = Math.floor(t % 60);
        const ms = Math.floor((t % 1) * 100);
        ctx.fillText(
            `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(2, '0')}`,
            swX + 50,
            swY + 5
        );
    }

    _getGridStep(maxHeight) {
        if (maxHeight <= 5) return 0.5;
        if (maxHeight <= 20) return 1;
        if (maxHeight <= 50) return 5;
        if (maxHeight <= 100) return 10;
        return 20;
    }

    getControls() {
        return [
            {
                id: 'h0',
                label: 'Altura inicial (m)',
                type: 'range',
                min: 1,
                max: 100,
                step: 0.5,
                default: 50,
                unit: 'm',
            },
            {
                id: 'g',
                label: 'Gravedad (m/s²)',
                type: 'range',
                min: 1.6,
                max: 20,
                step: 0.01,
                default: 9.81,
                unit: 'm/s²',
                presets: [
                    { label: 'Luna', value: 1.6 },
                    { label: 'Marte', value: 3.72 },
                    { label: 'Tierra', value: 9.81 },
                    { label: 'Júpiter', value: 24.79 },
                ],
            },
        ];
    }

    getCharts() {
        const trail = this.state.trail;
        const { g } = this.params;

        return [
            {
                id: 'ht',
                label: 'h vs t',
                datasets: [
                    {
                        id: 'h',
                        label: 'h(t)',
                        color: '#00ff88',
                        data: trail.map(p => ({ x: p.t, y: p.y })),
                    },
                ],
                xLabel: 't (s)',
                yLabel: 'h (m)',
            },
            {
                id: 'vt',
                label: 'v vs t',
                datasets: [
                    {
                        id: 'v',
                        label: 'v(t)',
                        color: '#ff8c00',
                        data: trail.map(p => ({ x: p.t, y: p.v })),
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
            height: this.state.height,
            velocity: this.state.velocity,
            impactTime: this.state.impactTime,
            impactVelocity: this.state.impactVelocity,
            landed: this.state.landed,
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
