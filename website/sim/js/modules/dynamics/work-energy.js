// ============================================
// TRABAJO, ENERGÍA Y POTENCIA
// Archivo: js/modules/dynamics/work-energy.js
// ============================================

const G_DEFAULT = 9.81;

export function energyCalculation(m, v, h, F, d, thetaDeg, muk, g) {
    const rad = thetaDeg * Math.PI / 180;
    const Ec = 0.5 * m * v * v;
    const Ep = m * g * h;
    const Em = Ec + Ep;
    const Wapplied = F * d * Math.cos(rad);
    const N = m * g;
    const fk = muk * N;
    const Wfriction = -fk * d;
    const Wnet = Wapplied + Wfriction;
    const Pinstant = F * v * Math.cos(rad);

    return {
        kineticEnergy: Ec,
        potentialEnergy: Ep,
        mechanicalEnergy: Em,
        workApplied: Wapplied,
        workFriction: Wfriction,
        workNet: Wnet,
        power: Pinstant,
        powerHP: Pinstant / 746,
        bars: [
            { label: 'Ec', value: Ec, color: '#e74c3c' },
            { label: 'Ep', value: Ep, color: '#3498db' },
            { label: 'Em', value: Em, color: '#2ecc71' }
        ]
    };
}

export class WorkEnergyModule {
    constructor() {
        this.m = 2;
        this.muk = 0;
        this.g = G_DEFAULT;
        this.rampProfile = null;
        this.rampLength = 600;
        this.pos = 0;
        this.velocity = 0;
        this.height = 10;
        this.dissipatedEnergy = 0;
        this.energyHistory = [];
        this.scale = { pixelsPerMeter: 8 };
        this._canvas = null;
        this._renderer = null;
        this._running = false;
        this._rampType = 'slide';
        this._vInput = 0;
        this._hInput = 10;
        this._FInput = 0;
        this._dInput = 0;
        this._thetaInput = 0;
    }

    init(canvas, renderer) {
        this._canvas = canvas;
        this._renderer = renderer;
        this.pos = 0;
        this.velocity = 0;
        this.dissipatedEnergy = 0;
        this.energyHistory = [];
        this._running = true;
        if (!this.rampProfile) this.generateRamp(this._rampType);
        this.height = this.getHeightAt(this.pos);
    }

    generateRamp(type) {
        this._rampType = type;
        const n = 200;
        this.rampProfile = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            let h;
            switch (type) {
                case 'valley':
                    h = 20 * (1 - Math.sin(t * Math.PI)) * 0.5 + 1;
                    break;
                case 'hill':
                    h = 15 * Math.sin(t * Math.PI) + 1;
                    break;
                case 'slide':
                    h = 20 * (1 - t) + 1;
                    break;
                case 'rollercoaster':
                    h = 12 * Math.sin(t * Math.PI * 2) + 14;
                    if (h < 1) h = 1;
                    break;
                default:
                    h = 20 * (1 - t) + 1;
            }
            this.rampProfile.push({ t, h });
        }
    }

    getHeightAt(t) {
        if (!this.rampProfile || this.rampProfile.length === 0) return 0;
        const idx = t * (this.rampProfile.length - 1);
        const i0 = Math.floor(idx);
        const i1 = Math.min(i0 + 1, this.rampProfile.length - 1);
        const frac = idx - i0;
        if (i0 >= this.rampProfile.length) return this.rampProfile[this.rampProfile.length - 1].h;
        return this.rampProfile[i0].h * (1 - frac) + this.rampProfile[i1].h * frac;
    }

    getSlopeAt(t) {
        const dt = 0.001;
        const h1 = this.getHeightAt(Math.max(0, t - dt));
        const h2 = this.getHeightAt(Math.min(1, t + dt));
        return (h2 - h1) / (2 * dt * (this.rampLength / this.scale.pixelsPerMeter));
    }

    update(dt) {
        if (!this._running) return;

        if (this.pos >= 1) {
            this._running = false;
            return;
        }

        const h = this.getHeightAt(this.pos);
        const slope = this.getSlopeAt(this.pos);
        const angle = Math.atan(slope);

        const aGrav = -this.g * Math.sin(angle);
        const N = this.m * this.g * Math.cos(angle);
        const aFric = this.velocity !== 0
            ? -Math.sign(this.velocity) * this.muk * N / this.m
            : 0;

        const a = aGrav + aFric;
        this.velocity += a * dt;

        const dx = this.velocity * dt / (this.rampLength / this.scale.pixelsPerMeter);
        this.pos += dx;
        this.pos = Math.max(0, Math.min(1, this.pos));
        this.height = this.getHeightAt(this.pos);

        this.dissipatedEnergy += Math.abs(this.muk * N * Math.abs(this.velocity) * dt);

        const Ec = 0.5 * this.m * this.velocity * this.velocity;
        const Ep = this.m * this.g * this.height;
        this.energyHistory.push({
            t: this.energyHistory.length * dt,
            Ec, Ep, Em: Ec + Ep, Edis: this.dissipatedEnergy
        });
        if (this.energyHistory.length > 500) this.energyHistory.shift();
    }

    render(ctx) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        ctx.clearRect(0, 0, W, H);

        if (!this.rampProfile) this.generateRamp(this._rampType);

        const Ec = 0.5 * this.m * this.velocity * this.velocity;
        const Ep = this.m * this.g * this.height;
        const Em = Ec + Ep;

        this._drawRamp(ctx, W, H);
        this._drawObject(ctx, W, H);
        this._drawEnergyBars(ctx, W, H, Ec, Ep, Em);
        this._drawInfoPanel(ctx, W, H, Ec, Ep, Em);
    }

    reset() {
        this.pos = 0;
        this.velocity = 0;
        this.dissipatedEnergy = 0;
        this.energyHistory = [];
        this._running = true;
        if (this.rampProfile) this.height = this.getHeightAt(this.pos);
    }

    getControls() {
        return [
            { id: 'm', label: 'Masa (m)', type: 'range', min: 0.1, max: 100, step: 0.1, default: 2, unit: 'kg' },
            { id: 'rampType', label: 'Perfil de rampa', type: 'select', options: ['slide', 'valley', 'hill', 'rollercoaster'], default: 'slide' },
            { id: 'muk', label: 'μk (fricción)', type: 'range', min: 0, max: 1, step: 0.01, default: 0, unit: '' },
            { id: 'g', label: 'Gravedad (g)', type: 'range', min: 1, max: 25, step: 0.01, default: G_DEFAULT, unit: 'm/s²' }
        ];
    }

    getCharts() {
        return {
            type: 'bar',
            datasets: [
                { label: 'Ec', color: '#e74c3c', data: this.energyHistory.map(p => ({ x: p.t, y: p.Ec })) },
                { label: 'Ep', color: '#3498db', data: this.energyHistory.map(p => ({ x: p.t, y: p.Ep })) },
                { label: 'Em', color: '#2ecc71', data: this.energyHistory.map(p => ({ x: p.t, y: p.Em })) },
                { label: 'Edis', color: '#f39c12', data: this.energyHistory.map(p => ({ x: p.t, y: p.Edis })) }
            ],
            xlabel: 't (s)',
            ylabel: 'Energía (J)'
        };
    }

    _drawRamp(ctx, w, h) {
        if (!this.rampProfile) return;
        const baseY = h - 60;
        const startX = 80;

        ctx.beginPath();
        ctx.moveTo(startX, baseY);
        for (const pt of this.rampProfile) {
            const px = startX + pt.t * this.rampLength;
            const py = baseY - pt.h * this.scale.pixelsPerMeter;
            ctx.lineTo(px, py);
        }
        ctx.lineTo(startX + this.rampLength, baseY);
        ctx.closePath();
        ctx.fillStyle = '#1a1a3e';
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#555';
        ctx.font = '10px system-ui';
        ctx.fillText('0 m', startX - 2, baseY + 16);
        ctx.fillText(`${Math.max(0, this.getHeightAt(0)).toFixed(0)} m`, startX - 20, baseY - this.getHeightAt(0) * this.scale.pixelsPerMeter - 4);
    }

    _drawObject(ctx, w, h) {
        const baseY = h - 60;
        const startX = 80;
        const ppm = this.scale.pixelsPerMeter;

        const px = startX + this.pos * this.rampLength;
        const py = baseY - this.height * ppm;

        const radGrad = ctx.createRadialGradient(px - 4, py - 12, 2, px, py - 8, 14);
        radGrad.addColorStop(0, '#ffaa44');
        radGrad.addColorStop(1, '#ff8c00');
        ctx.beginPath();
        ctx.arc(px, py - 8, 12, 0, Math.PI * 2);
        ctx.fillStyle = radGrad;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#e8e8f0';
        ctx.font = '11px system-ui';
        ctx.fillText(`h=${this.height.toFixed(1)} m`, px + 18, py - 18);
        ctx.fillText(`v=${Math.abs(this.velocity).toFixed(1)} m/s`, px + 18, py - 2);
    }

    _drawEnergyBars(ctx, w, h, Ec, Ep, Em) {
        const barX = w - 175;
        const barW = 38;
        const maxBarH = 220;
        const baseY = h - 80;

        const EmInitial = this.m * this.g * (this.rampProfile ? this.rampProfile[0].h : 20);
        const scale = maxBarH / Math.max(EmInitial, 1);

        ctx.fillStyle = 'rgba(10, 10, 26, 0.88)';
        ctx.fillRect(barX - 18, baseY - maxBarH - 45, 175, maxBarH + 70);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.strokeRect(barX - 18, baseY - maxBarH - 45, 175, maxBarH + 70);

        ctx.font = 'bold 12px system-ui';
        ctx.fillStyle = '#e8e8f0';
        ctx.fillText('Energía (J)', barX + 10, baseY - maxBarH - 28);

        const bars = [
            { label: 'Ec', value: Ec, color: '#e74c3c', x: barX },
            { label: 'Ep', value: Ep, color: '#3498db', x: barX + 45 },
            { label: 'Em', value: Em, color: '#2ecc71', x: barX + 90 }
        ];

        for (const bar of bars) {
            const bh = Math.min(bar.value * scale, maxBarH);

            ctx.fillStyle = bar.color;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(bar.x, baseY - bh, barW, bh);
            ctx.globalAlpha = 1;

            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.strokeRect(bar.x, baseY - maxBarH, barW, maxBarH);

            ctx.fillStyle = bar.color;
            ctx.font = '10px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(bar.label, bar.x + barW / 2, baseY + 14);
            ctx.fillText(bar.value.toFixed(1), bar.x + barW / 2, baseY - bh - 5);
            ctx.textAlign = 'left';
        }

        if (this.dissipatedEnergy > 0.1) {
            const disH = Math.min(this.dissipatedEnergy * scale, maxBarH);
            ctx.fillStyle = '#f39c12';
            ctx.globalAlpha = 0.5;
            ctx.fillRect(barX + 90, baseY - (Em * scale) - disH, barW, disH);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#f39c12';
            ctx.font = '9px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('Disipada', barX + 90 + barW / 2, baseY - (Em * scale) - disH - 8);
            ctx.fillText(`${this.dissipatedEnergy.toFixed(1)} J`, barX + 90 + barW / 2, baseY - (Em * scale) - disH - 20);
            ctx.textAlign = 'left';
        }
    }

    _drawInfoPanel(ctx, w, h, Ec, Ep, Em) {
        const px = 10, py = 10;
        ctx.fillStyle = 'rgba(10, 10, 26, 0.88)';
        ctx.fillRect(px, py, 220, 130);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.strokeRect(px, py, 220, 130);

        ctx.fillStyle = '#e8e8f0';
        ctx.font = '12px system-ui';
        const lines = [
            `Ec = ${Ec.toFixed(2)} J`,
            `Ep = ${Ep.toFixed(2)} J`,
            `Em = ${Em.toFixed(2)} J`,
            this.muk > 0 ? `Disipada = ${this.dissipatedEnergy.toFixed(2)} J` : '',
            `v = ${Math.abs(this.velocity).toFixed(2)} m/s`,
            `h = ${this.height.toFixed(2)} m`
        ].filter(l => l !== '');

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], px + 12, py + 20 + i * 18);
        }

        if (!this._running && this.pos >= 1) {
            ctx.fillStyle = '#ff8c00';
            ctx.font = 'bold 13px system-ui';
            ctx.fillText('¡Objeto llegó al final!', px + 12, py + 110);
        }
    }
}
