import { Vector2D } from '../../utils/vector2d.js';

export class Projectile {
    constructor() {
        this.params = {
            v0: 20,
            angle: 45,
            g: 9.81,
        };
        this.state = {
            time: 0,
            position: new Vector2D(0, 0),
            velocity: new Vector2D(0, 0),
            v0x: 0,
            v0y: 0,
            maxHeight: 0,
            range: 0,
            flightTime: 0,
            landed: false,
            trail: [],
            running: false,
        };
        this.canvas = null;
        this.ctx = null;
        this.renderer = null;
        this.originX = 70;
        this.groundY = 0;
        this.ppm = 2;
        this.trailTimer = 0;
    }

    init(canvas, renderer) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.renderer = renderer;
        this.reset();
    }

    reset() {
        this.state.time = 0;
        this.state.landed = false;
        this.state.running = false;
        this.trailTimer = 0;

        const rad = this.params.angle * Math.PI / 180;
        this.state.v0x = this.params.v0 * Math.cos(rad);
        this.state.v0y = this.params.v0 * Math.sin(rad);
        this.state.velocity = new Vector2D(this.state.v0x, this.state.v0y);
        this.state.position = new Vector2D(0, 0);

        this._precomputeTrajectory();
        this._updateScale();
        this.state.trail = [{ x: 0, y: 0, t: 0 }];
    }

    start() {
        this.state.running = true;
    }

    pause() {
        this.state.running = false;
    }

    _precomputeTrajectory() {
        const { v0, angle, g } = this.params;
        const rad = angle * Math.PI / 180;
        const v0x = v0 * Math.cos(rad);
        const v0y = v0 * Math.sin(rad);

        const tMax = v0y / g;
        this.state.maxHeight = (v0y * v0y) / (2 * g);

        const disc = v0y * v0y + 2 * g * 0;
        this.state.flightTime = (v0y + Math.sqrt(Math.max(0, disc))) / g;
        this.state.range = v0x * this.state.flightTime;

        this.state.trajectory = [];
        const steps = 100;
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * this.state.flightTime;
            const x = v0x * t;
            const y = v0y * t - 0.5 * g * t * t;
            this.state.trajectory.push({ x, y, t });
        }
    }

    update(dt) {
        if (!this.state.running || this.state.landed) return;
        this.state.time += dt;
        const t = this.state.time;
        const { v0, angle, g } = this.params;
        const rad = angle * Math.PI / 180;
        const v0x = v0 * Math.cos(rad);
        const v0y = v0 * Math.sin(rad);

        const x = v0x * t;
        const y = v0y * t - 0.5 * g * t * t;
        const vx = v0x;
        const vy = v0y - g * t;

        if (y <= 0 && t > 0) {
            this.state.position = new Vector2D(x, 0);
            this.state.velocity = new Vector2D(vx, vy);
            this.state.landed = true;
            this.state.running = false;
            this.state.trail.push({ x, y: 0, t });
            return;
        }

        this.state.position = new Vector2D(x, y);
        this.state.velocity = new Vector2D(vx, vy);

        this.trailTimer += dt;
        if (this.trailTimer >= 0.04) {
            this.trailTimer = 0;
            this.state.trail.push({ x, y, t });
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
        this._drawCannon(ctx, w, h);
        this._drawTrajectory(ctx, w, h);
        this._drawTrail(ctx, w, h);
        this._drawProjectile(ctx, w, h);
        this._drawVelocityVectors(ctx, w, h);
        this._drawRangeMarker(ctx, w, h);
        this._drawMaxHeightMarker(ctx, w, h);
        this._drawInfo(ctx, w, h);
    }

    _updateScale() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.groundY = h - 50;

        const range = Math.max(1, this.state.range);
        const maxH = Math.max(1, this.state.maxHeight);

        const availW = w - 100;
        const availH = h - 100;
        const ppmX = availW / (range + 10);
        const ppmY = availH / (maxH + 10);
        this.ppm = Math.min(ppmX, ppmY);
        this.ppm = Math.max(1.5, Math.min(20, this.ppm));
    }

    _toCanvas(p) {
        return {
            x: this.originX + p.x * this.ppm,
            y: this.groundY - p.y * this.ppm,
        };
    }

    _toCanvasXY(px, py) {
        return {
            x: this.originX + px * this.ppm,
            y: this.groundY - py * this.ppm,
        };
    }

    _drawBackground(ctx, w, h) {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, w, h);
    }

    _drawGrid(ctx, w, h) {
        const range = Math.max(1, this.state.range);
        const maxH = Math.max(1, this.state.maxHeight);
        const xStep = this._getGridStep(range);
        const yStep = this._getGridStep(maxH);

        ctx.strokeStyle = '#1a1a3e';
        ctx.lineWidth = 1;
        ctx.font = '9px monospace';
        ctx.fillStyle = '#555577';
        ctx.textAlign = 'center';

        for (let x = 0; x <= range + 2; x += xStep) {
            const cx = this.originX + x * this.ppm;
            if (cx < 30 || cx > w - 20) continue;
            ctx.beginPath();
            ctx.moveTo(cx, 20);
            ctx.lineTo(cx, this.groundY);
            ctx.stroke();
            ctx.fillText(`${x.toFixed(x % 1 === 0 ? 0 : 1)}`, cx, this.groundY + 14);
        }

        ctx.textAlign = 'right';
        for (let y = 0; y <= maxH + 2; y += yStep) {
            const cy = this.groundY - y * this.ppm;
            if (cy < 25 || cy > this.groundY - 5) continue;
            ctx.beginPath();
            ctx.moveTo(30, cy);
            ctx.lineTo(w - 20, cy);
            ctx.stroke();
            ctx.fillText(`${y.toFixed(y % 1 === 0 ? 0 : 1)}`, 26, cy + 3);
        }

        ctx.fillStyle = '#8888aa';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('x (m)', w / 2, this.groundY + 30);
        ctx.textAlign = 'right';
        ctx.fillText('y (m)', 24, 16);
    }

    _drawGround(ctx, w, h) {
        ctx.strokeStyle = '#444466';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, this.groundY);
        ctx.lineTo(w, this.groundY);
        ctx.stroke();

        ctx.fillStyle = '#333355';
        for (let x = 0; x < w; x += 15) {
            ctx.fillRect(x, this.groundY + 2, 8, 3);
        }
    }

    _drawCannon(ctx, w, h) {
        const rad = this.params.angle * Math.PI / 180;
        const cannonLen = 45;

        const basePos = this._toCanvasXY(0, 0);
        const barrelEnd = {
            x: basePos.x + cannonLen * Math.cos(rad),
            y: basePos.y - cannonLen * Math.sin(rad),
        };

        ctx.shadowColor = 'rgba(0, 229, 255, 0.3)';
        ctx.shadowBlur = 8;

        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(basePos.x, basePos.y);
        ctx.lineTo(barrelEnd.x, barrelEnd.y);
        ctx.stroke();
        ctx.lineCap = 'butt';

        ctx.fillStyle = '#444466';
        ctx.beginPath();
        ctx.arc(basePos.x, basePos.y, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#555577';
        ctx.beginPath();
        ctx.arc(basePos.x, basePos.y, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.fillStyle = '#8888aa';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`θ = ${this.params.angle.toFixed(0)}°`, basePos.x + 40, basePos.y - 15);

        const arcStart = 0;
        const arcEnd = -rad;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(basePos.x, basePos.y, 30, arcStart, arcEnd, true);
        ctx.stroke();
    }

    _drawTrajectory(ctx, w, h) {
        const traj = this.state.trajectory;
        if (!traj || traj.length < 2) return;

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        for (let i = 0; i < traj.length; i++) {
            const p = this._toCanvasXY(traj[i].x, traj[i].y);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _drawTrail(ctx, w, h) {
        const trail = this.state.trail;
        if (trail.length < 2) return;

        for (let i = 0; i < trail.length; i++) {
            const p = this._toCanvasXY(trail[i].x, trail[i].y);
            const alpha = 0.2 + 0.8 * (i / trail.length);
            ctx.fillStyle = `rgba(0, 229, 255, ${alpha * 0.5})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawProjectile(ctx, w, h) {
        const pos = this.state.position;
        if (this.state.landed && this.state.time > 0) return;

        const p = this._toCanvas(pos);

        ctx.shadowColor = 'rgba(0, 229, 255, 0.7)';
        ctx.shadowBlur = 18;

        const gradient = ctx.createRadialGradient(
            p.x - 3, p.y - 3, 2,
            p.x, p.y, 8
        );
        gradient.addColorStop(0, '#66eeff');
        gradient.addColorStop(0.7, '#00e5ff');
        gradient.addColorStop(1, '#0099cc');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    _drawVelocityVectors(ctx, w, h) {
        const pos = this.state.position;
        if (this.state.landed) return;

        const p = this._toCanvas(pos);
        const scale = 0.8;

        const vx = this.state.velocity.x;
        const vy = this.state.velocity.y;
        const vMag = this.state.velocity.magnitude();

        const vxEnd = {
            x: p.x + vx * this.ppm * scale,
            y: p.y,
        };
        const vyEnd = {
            x: p.x,
            y: p.y + vy * this.ppm * scale,
        };

        this._drawArrow(ctx, p.x, p.y, vxEnd.x, vxEnd.y, '#ff4444', 2.5);
        this._drawArrow(ctx, p.x, p.y, vyEnd.x, vyEnd.y, '#4488ff', 2.5);

        if (vMag > 0.1) {
            const vEnd = {
                x: p.x + vx * this.ppm * scale,
                y: p.y + vy * this.ppm * scale,
            };
            this._drawArrow(ctx, p.x, p.y, vEnd.x, vEnd.y, '#00ff88', 2, true);
        }

        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';

        ctx.fillStyle = '#ff4444';
        ctx.fillText(`vₓ = ${vx.toFixed(1)}`, vxEnd.x + 4, vxEnd.y - 2);

        ctx.fillStyle = '#4488ff';
        ctx.fillText(`vᵧ = ${vy.toFixed(1)}`, vyEnd.x + 4, vyEnd.y - 2);

        if (vMag > 0.1) {
            ctx.fillStyle = '#00ff88';
            ctx.textBaseline = 'top';
            const vEnd = {
                x: p.x + vx * this.ppm * scale,
                y: p.y + vy * this.ppm * scale,
            };
            ctx.fillText(`v = ${vMag.toFixed(1)}`, vEnd.x + 4, vEnd.y + 2);
        }
    }

    _drawArrow(ctx, x1, y1, x2, y2, color, width, dashed = false) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 2) return;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;

        if (dashed) {
            ctx.setLineDash([4, 4]);
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        const angle = Math.atan2(dy, dx);
        const headLen = Math.min(10, len * 0.3);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
            x2 - headLen * Math.cos(angle - 0.4),
            y2 - headLen * Math.sin(angle - 0.4)
        );
        ctx.lineTo(
            x2 - headLen * Math.cos(angle + 0.4),
            y2 - headLen * Math.sin(angle + 0.4)
        );
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    _drawRangeMarker(ctx, w, h) {
        const range = this.state.range;
        if (range <= 0) return;

        const mx = this._toCanvasXY(range, 0);

        ctx.strokeStyle = 'rgba(170, 102, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(mx.x, mx.y);
        ctx.lineTo(mx.x, mx.y - 30);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#aa66ff';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`R = ${range.toFixed(1)} m`, mx.x, mx.y - 33);

        ctx.fillStyle = 'rgba(170, 102, 255, 0.3)';
        ctx.font = '18px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('▼', mx.x, mx.y - 6);
    }

    _drawMaxHeightMarker(ctx, w, h) {
        const maxH = this.state.maxHeight;
        if (maxH <= 0) return;

        const range = this.state.range;
        const xAtMaxH = range / 2;
        const hp = this._toCanvasXY(xAtMaxH, maxH);

        ctx.strokeStyle = 'rgba(255, 140, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hp.x, hp.y);
        ctx.lineTo(hp.x, this.groundY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ff8c00';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`H_max = ${maxH.toFixed(1)} m`, hp.x, hp.y - 6);

        ctx.fillStyle = 'rgba(255, 140, 0, 0.4)';
        ctx.beginPath();
        ctx.moveTo(hp.x - 5, hp.y);
        ctx.lineTo(hp.x + 5, hp.y);
        ctx.stroke();
    }

    _drawInfo(ctx, w, h) {
        ctx.fillStyle = 'rgba(10, 10, 26, 0.8)';
        ctx.fillRect(w - 210, 10, 200, 110);

        ctx.font = '13px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const pos = this.state.position;
        const vel = this.state.velocity;
        const speed = vel.magnitude();

        const lines = [
            { label: 't =', value: `${this.state.time.toFixed(2)} s`, color: '#8888aa' },
            { label: 'x =', value: `${pos.x.toFixed(2)} m`, color: '#00e5ff' },
            { label: 'y =', value: `${pos.y.toFixed(2)} m`, color: '#00ff88' },
            { label: 'vₓ =', value: `${vel.x.toFixed(2)} m/s`, color: '#ff4444' },
            { label: 'vᵧ =', value: `${vel.y.toFixed(2)} m/s`, color: '#4488ff' },
            { label: 'v =', value: `${speed.toFixed(2)} m/s`, color: '#00ff88' },
            { label: 'R =', value: `${this.state.range.toFixed(1)} m`, color: '#aa66ff' },
            { label: 'H_max =', value: `${this.state.maxHeight.toFixed(1)} m`, color: '#ff8c00' },
        ];

        lines.forEach((line, i) => {
            ctx.fillStyle = '#8888aa';
            ctx.fillText(line.label, w - 200, 16 + i * 13);
            ctx.fillStyle = line.color;
            ctx.fillText(line.value, w - 130, 16 + i * 13);
        });
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
                min: 1,
                max: 50,
                step: 0.5,
                default: 20,
                unit: 'm/s',
            },
            {
                id: 'angle',
                label: 'Ángulo de lanzamiento (°)',
                type: 'range',
                min: 0,
                max: 90,
                step: 1,
                default: 45,
                unit: '°',
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
        const traj = this.state.trajectory || [];

        return [
            {
                id: 'xy',
                label: 'Trayectoria y vs x',
                datasets: [
                    {
                        id: 'trajectory',
                        label: 'Trayectoria',
                        color: '#00e5ff',
                        data: traj.map(p => ({ x: p.x, y: p.y })),
                    },
                    {
                        id: 'trail',
                        label: 'Recorrido',
                        color: '#00ff88',
                        data: trail.map(p => ({ x: p.x, y: p.y })),
                    },
                ],
                xLabel: 'x (m)',
                yLabel: 'y (m)',
            },
            {
                id: 'xt',
                label: 'x vs t',
                datasets: [
                    {
                        id: 'x',
                        label: 'x(t)',
                        color: '#ff4444',
                        data: trail.map(p => ({ x: p.t, y: p.x })),
                    },
                ],
                xLabel: 't (s)',
                yLabel: 'x (m)',
            },
            {
                id: 'yt',
                label: 'y vs t',
                datasets: [
                    {
                        id: 'y',
                        label: 'y(t)',
                        color: '#00ff88',
                        data: trail.map(p => ({ x: p.t, y: p.y })),
                    },
                ],
                xLabel: 't (s)',
                yLabel: 'y (m)',
            },
        ];
    }

    getState() {
        return {
            time: this.state.time,
            position: { x: this.state.position.x, y: this.state.position.y },
            velocity: { x: this.state.velocity.x, y: this.state.velocity.y },
            speed: this.state.velocity.magnitude(),
            maxHeight: this.state.maxHeight,
            range: this.state.range,
            flightTime: this.state.flightTime,
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
