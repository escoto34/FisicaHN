// ============================================
// LEY DE OHM — Circuito Simple con 3 Resistencias
// Archivo: js/modules/electricity/ohm-law.js
// ============================================

export function leyOhm(V, R) {
    if (R === 0) return { I: Infinity, P: Infinity };
    const I = V / R;
    const P = V * I;
    return { I, P };
}

export function resistenciaSerie(resistencias) {
    return resistencias.reduce((sum, r) => sum + r, 0);
}

export function resistenciaParalelo(resistencias) {
    const invReq = resistencias.reduce((sum, r) => sum + 1 / r, 0);
    return 1 / invReq;
}

export function circuitoSerie(V, resistencias) {
    const Req = resistenciaSerie(resistencias);
    const I = Req === 0 ? Infinity : V / Req;

    const componentes = resistencias.map((R, i) => ({
        id: `R${i + 1}`,
        resistance: R,
        voltage: I * R,
        current: I,
        power: I * I * R
    }));

    return {
        Req,
        totalCurrent: I,
        totalPower: V * I,
        components: componentes,
        kirchhoffCheck: componentes.reduce((s, c) => s + c.voltage, 0)
    };
}

export function circuitoParalelo(V, resistencias) {
    const Req = resistenciaParalelo(resistencias);
    const Itotal = Req === 0 ? Infinity : V / Req;

    const componentes = resistencias.map((R, i) => ({
        id: `R${i + 1}`,
        resistance: R,
        voltage: V,
        current: V / R,
        power: V * V / R
    }));

    return {
        Req,
        totalCurrent: Itotal,
        totalPower: V * Itotal,
        components: componentes,
        kirchhoffCheck: componentes.reduce((s, c) => s + c.current, 0)
    };
}

export function circuitoMixto(V, resistencias) {
    const reqPar = resistenciaParalelo([resistencias[1], resistencias[2]]);
    const total = circuitoSerie(V, [resistencias[0], reqPar]);

    const Iparcial = total.totalCurrent;
    const Vr1 = Iparcial * resistencias[0];
    const Vpar = V - Vr1;
    const Ir2 = Vpar / resistencias[1];
    const Ir3 = Vpar / resistencias[2];

    return {
        Req: total.Req,
        totalCurrent: Iparcial,
        totalPower: V * Iparcial,
        components: [
            { id: 'R1', resistance: resistencias[0], voltage: Vr1, current: Iparcial, power: Iparcial * Iparcial * resistencias[0] },
            { id: 'R2', resistance: resistencias[1], voltage: Vpar, current: Ir2, power: Ir2 * Ir2 * resistencias[1] },
            { id: 'R3', resistance: resistencias[2], voltage: Vpar, current: Ir3, power: Ir3 * Ir3 * resistencias[2] }
        ],
        kirchhoffCheck: V
    };
}

export class OhmLawModule {
    constructor() {
        this.V = 12;
        this.R = [100, 220, 470];
        this.tipo = 'serie';
        this.t = 0;
        this.currentState = null;
        this.electronParticles = [];
        this.maxParticles = 100;
        this._canvas = null;
        this._renderer = null;
    }

    init(canvas, renderer) {
        this._canvas = canvas;
        this._renderer = renderer;
        this.t = 0;
        this._recalc();
        this.electronParticles = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this.electronParticles.push({
                progress: i / this.maxParticles,
                speed: 0
            });
        }
    }

    update(dt) {
        this.t += dt;
        this._recalc();

        const I = this.currentState ? Math.min(Math.abs(this.currentState.totalCurrent), 5) : 0;
        const flow = 0.05 + I * 0.08;
        for (const p of this.electronParticles) {
            p.progress = (p.progress + flow * dt) % 1;
        }
    }

    render(ctx) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        ctx.clearRect(0, 0, W, H);

        this._drawBackground(ctx, W, H);

        if (this.tipo === 'serie') {
            this._drawCircuitSerie(ctx, W, H);
        } else if (this.tipo === 'paralelo') {
            this._drawCircuitParalelo(ctx, W, H);
        } else {
            this._drawCircuitMixto(ctx, W, H);
        }

        this._drawElectrons(ctx, W, H);
        this._drawResistorDetails(ctx, W, H);
        this._drawInfoPanel(ctx, W, H);
    }

    reset() {
        this.t = 0;
        this.electronParticles = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this.electronParticles.push({ progress: i / this.maxParticles, speed: 0 });
        }
        if (this._canvas) this._recalc();
    }

    getControls() {
        return [
            { id: 'V', label: 'Voltaje (V)', type: 'range', min: 1, max: 240, step: 1, default: 12, unit: 'V' },
            { id: 'R1', label: 'R₁', type: 'range', min: 1, max: 10000, step: 1, default: 100, unit: 'Ω' },
            { id: 'R2', label: 'R₂', type: 'range', min: 1, max: 10000, step: 1, default: 220, unit: 'Ω' },
            { id: 'R3', label: 'R₃', type: 'range', min: 1, max: 10000, step: 1, default: 470, unit: 'Ω' },
            { id: 'tipo', label: 'Configuración', type: 'select', options: ['serie', 'paralelo', 'mixto'], default: 'serie' }
        ];
    }

    getCharts() {
        if (!this.currentState) return null;
        return {
            type: 'bar',
            datasets: this.currentState.components.map(c => ({
                label: c.id,
                color: '#3498db',
                data: [{ x: 0, y: c.resistance }]
            })),
            xlabel: 'Componente',
            ylabel: 'Resistencia (Ω)'
        };
    }

    _recalc() {
        const R = this.R;
        if (this.tipo === 'serie') {
            this.currentState = circuitoSerie(this.V, R);
        } else if (this.tipo === 'paralelo') {
            this.currentState = circuitoParalelo(this.V, R);
        } else {
            this.currentState = circuitoMixto(this.V, R);
        }
    }

    _drawBackground(ctx, W, H) {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, W, H);
    }

    _drawCircuitSerie(ctx, W, H) {
        const st = this.currentState;
        if (!st) return;

        const cx = W / 2;
        const cy = H / 2;
        const loopR = Math.min(W, H) * 0.35;

        ctx.strokeStyle = '#8888aa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, loopR, 0, Math.PI * 2);
        ctx.stroke();

        this._drawBattery(ctx, cx - loopR, cy, 1);
        this._drawResistor(ctx, cx + loopR * 0.3, cy - loopR * 0.7, 0.8);
        this._drawResistor(ctx, cx + loopR * 0.85, cy + loopR * 0.25, 0.6);
        this._drawResistor(ctx, cx - loopR * 0.5, cy + loopR * 0.7, 0.7);
        this._drawAmmeter(ctx, cx + loopR * 0.7, cy - loopR * 0.25);

        const I = st.totalCurrent;
        if (I > 0 && I < Infinity) {
            ctx.fillStyle = '#00e5ff';
            ctx.font = '11px system-ui';
            const iAng = -Math.PI / 4;
            ctx.fillText(`I = ${I.toFixed(3)} A`, cx + loopR * 0.6 * Math.cos(iAng), cy + loopR * 0.6 * Math.sin(iAng) - 10);
        }
    }

    _drawCircuitParalelo(ctx, W, H) {
        const st = this.currentState;
        if (!st) return;

        const cx = W / 2;
        const cy = H / 2;
        const halfW = Math.min(W, H) * 0.3;

        ctx.strokeStyle = '#8888aa';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(cx - halfW, cy - halfW);
        ctx.lineTo(cx + halfW, cy - halfW);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - halfW, cy + halfW);
        ctx.lineTo(cx + halfW, cy + halfW);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - halfW, cy - halfW);
        ctx.lineTo(cx - halfW, cy + halfW);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + halfW, cy - halfW);
        ctx.lineTo(cx + halfW, cy + halfW);
        ctx.stroke();

        this._drawBattery(ctx, cx - halfW - 20, cy, 0);

        const spacing = (2 * halfW) / 4;
        for (let i = 0; i < 3; i++) {
            const rx = cx - halfW + spacing * (i + 1);
            this._drawResistor(ctx, rx, cy, 0);
        }

        ctx.fillStyle = '#00e5ff';
        ctx.font = '11px system-ui';
        ctx.fillText(`I_total = ${st.totalCurrent.toFixed(3)} A`, cx + halfW + 10, cy - halfW - 8);
    }

    _drawCircuitMixto(ctx, W, H) {
        const st = this.currentState;
        if (!st) return;

        const cx = W / 2;
        const cy = H / 2;

        ctx.strokeStyle = '#8888aa';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(cx - 120, cy - 80);
        ctx.lineTo(cx + 120, cy - 80);
        ctx.lineTo(cx + 120, cy + 80);
        ctx.lineTo(cx, cy + 80);
        ctx.lineTo(cx, cy + 30);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - 120, cy - 80);
        ctx.lineTo(cx - 120, cy + 80);
        ctx.lineTo(cx, cy + 80);
        ctx.stroke();

        this._drawBattery(ctx, cx - 120 - 20, cy - 80, -Math.PI / 2);
        this._drawResistor(ctx, cx, cy - 80, Math.PI / 2);
        this._drawResistor(ctx, cx - 60, cy + 40, 0);
        this._drawResistor(ctx, cx + 60, cy + 40, 0);
    }

    _drawBattery(ctx, x, y, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-5, -18);
        ctx.lineTo(-5, 18);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(5, -22);
        ctx.lineTo(5, 22);
        ctx.stroke();

        ctx.fillStyle = '#ff8c00';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ff8c00';
        ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.V}V`, 0, 40);
        ctx.textAlign = 'left';

        ctx.restore();
    }

    _drawResistor(ctx, x, y, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        const w = 30;
        const h = 12;
        const zigzag = 5;

        ctx.strokeStyle = '#aa66ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        for (let i = 0; i < zigzag; i++) {
            const t = (i + 1) / (zigzag + 1);
            const px = -w / 2 + t * w;
            const py = (i % 2 === 0) ? -h / 2 : h / 2;
            ctx.lineTo(px, py);
        }
        ctx.lineTo(w / 2, 0);
        ctx.stroke();

        ctx.restore();
    }

    _drawAmmeter(ctx, x, y) {
        ctx.save();
        ctx.translate(x, y);

        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 8px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('A', 0, 4);
        ctx.textAlign = 'left';

        ctx.restore();
    }

    _drawElectrons(ctx, W, H) {
        const cx = W / 2;
        const cy = H / 2;
        const loopR = Math.min(W, H) * 0.35;

        for (const p of this.electronParticles) {
            const angle = p.progress * Math.PI * 2;
            const ex = cx + loopR * Math.cos(angle);
            const ey = cy + loopR * Math.sin(angle);

            const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, 5);
            glow.addColorStop(0, 'rgba(0, 229, 255, 0.9)');
            glow.addColorStop(1, 'rgba(0, 229, 255, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(ex, ey, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#00e5ff';
            ctx.fill();
        }
    }

    _drawResistorDetails(ctx, W, H) {
        const st = this.currentState;
        if (!st) return;

        const cx = W / 2;
        const cy = H / 2;
        const loopR = Math.min(W, H) * 0.35;

        const labels = [
            { label: `R₁ = ${st.components[0].resistance}Ω`, x: cx + loopR * 0.1, y: cy - loopR * 0.8 },
            { label: `R₂ = ${st.components[1].resistance}Ω`, x: cx + loopR * 0.9, y: cy + loopR * 0.1 },
            { label: `R₃ = ${st.components[2].resistance}Ω`, x: cx - loopR * 0.6, y: cy + loopR * 0.7 }
        ];

        for (const l of labels) {
            ctx.fillStyle = '#aaa';
            ctx.font = '10px system-ui';
            ctx.fillText(l.label, l.x, l.y);
        }

        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 10px system-ui';
        ctx.fillText(`Req = ${st.Req.toFixed(1)} Ω`, W - 140, 22);
        ctx.fillText(`I = ${st.totalCurrent.toFixed(3)} A`, W - 140, 38);
        ctx.fillText(`P = ${st.totalPower.toFixed(2)} W`, W - 140, 54);
    }

    _drawInfoPanel(ctx, W, H) {
        const st = this.currentState;
        if (!st) return;

        ctx.fillStyle = 'rgba(10, 10, 26, 0.88)';
        ctx.fillRect(10, 10, 200, 120);

        ctx.fillStyle = '#e8e8f0';
        ctx.font = 'bold 13px system-ui';
        ctx.fillText(`Circuito en ${this.tipo.toUpperCase()}`, 20, 30);

        ctx.font = '12px system-ui';
        ctx.fillStyle = '#e8e8f0';
        ctx.fillText(`Req = ${st.Req.toFixed(1)} Ω`, 20, 50);
        ctx.fillText(`I_total = ${isFinite(st.totalCurrent) ? st.totalCurrent.toFixed(3) : '∞'} A`, 20, 68);
        ctx.fillText(`P_total = ${isFinite(st.totalPower) ? st.totalPower.toFixed(2) : '∞'} W`, 20, 86);
        ctx.fillStyle = '#888';
        ctx.fillText(`Kirchhoff: Σ = ${st.kirchhoffCheck.toFixed(2)}`, 20, 104);
    }
}
