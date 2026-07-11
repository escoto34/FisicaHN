// ============================================
// LEYES DE KIRCHHOFF — Análisis de Mallas (2 lazos)
// Archivo: js/modules/electricity/kirchhoff.js
// ============================================

export function kirchhoffMalla(V1, V2, R1, R2, R3) {
    const a11 = R1 + R2;
    const a12 = -R2;
    const a21 = -R2;
    const a22 = R2 + R3;
    const b1 = V1;
    const b2 = -V2;

    const det = a11 * a22 - a12 * a21;
    if (Math.abs(det) < 1e-10) return null;

    const I1 = (b1 * a22 - b2 * a12) / det;
    const I2 = (a11 * b2 - a21 * b1) / det;
    const IR2 = I1 - I2;

    return {
        I1, I2, IR2,
        voltages: { VR1: I1 * R1, VR2: IR2 * R2, VR3: I2 * R3 },
        powers: { PR1: I1 * I1 * R1, PR2: IR2 * IR2 * R2, PR3: I2 * I2 * R3 },
        loopCheck1: V1 - I1 * R1 - IR2 * R2,
        loopCheck2: -V2 - I2 * R3 + IR2 * R2,
        powerBalance: V1 * I1 + V2 * I2
    };
}

export class KirchhoffModule {
    constructor() {
        this.V1 = 12;
        this.V2 = 6;
        this.R1 = 100;
        this.R2 = 50;
        this.R3 = 200;
        this.t = 0;
        this.currentState = null;
        this.prevState = null;
        this._canvas = null;
        this._renderer = null;
    }

    init(canvas, renderer) {
        this._canvas = canvas;
        this._renderer = renderer;
        this.t = 0;
        this._recalc();
        this.prevState = this.currentState ? { ...this.currentState } : null;
    }

    update(dt) {
        this.t += dt;
        this.prevState = this.currentState ? { ...this.currentState } : null;
        this._recalc();
    }

    render(ctx) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, W, H);

        if (!this.currentState) {
            ctx.fillStyle = '#ff4444';
            ctx.font = '16px system-ui';
            ctx.fillText('Configuración degenerada (det = 0). Cambia los valores.', 40, 40);
            return;
        }

        this._drawCircuit(ctx, W, H);
        this._drawCurrentArrows(ctx, W, H);
        this._drawLabels(ctx, W, H);
        this._drawInfoPanel(ctx, W, H);
    }

    reset() {
        this.t = 0;
        if (this._canvas) {
            this._recalc();
            this.prevState = this.currentState ? { ...this.currentState } : null;
        }
    }

    getControls() {
        return [
            { id: 'V1', label: 'Fuente V₁', type: 'range', min: 1, max: 24, step: 0.5, default: 12, unit: 'V' },
            { id: 'V2', label: 'Fuente V₂', type: 'range', min: 1, max: 24, step: 0.5, default: 6, unit: 'V' },
            { id: 'R1', label: 'R₁ (lazo 1)', type: 'range', min: 10, max: 1000, step: 1, default: 100, unit: 'Ω' },
            { id: 'R2', label: 'R₂ (compartida)', type: 'range', min: 10, max: 1000, step: 1, default: 50, unit: 'Ω' },
            { id: 'R3', label: 'R₃ (lazo 2)', type: 'range', min: 10, max: 1000, step: 1, default: 200, unit: 'Ω' }
        ];
    }

    getCharts() {
        if (!this.currentState) return null;
        return {
            type: 'bar',
            datasets: [
                { label: 'I₁', color: '#00e5ff', data: [{ x: 0, y: this.currentState.I1 }] },
                { label: 'I₂', color: '#ff8c00', data: [{ x: 1, y: this.currentState.I2 }] },
                { label: 'IR₂', color: '#aa66ff', data: [{ x: 2, y: this.currentState.IR2 }] }
            ],
            xlabel: 'Corrientes',
            ylabel: 'I (A)'
        };
    }

    _recalc() {
        this.currentState = kirchhoffMalla(this.V1, this.V2, this.R1, this.R2, this.R3);
    }

    _drawCircuit(ctx, W, H) {
        const st = this.currentState;
        if (!st) return;

        const cx = W / 2;
        const cy = H / 2;
        const halfW = 180;
        const halfH = 120;

        const L = cx - halfW;
        const R = cx + halfW;
        const T = cy - halfH;
        const B = cy + halfH;

        ctx.strokeStyle = '#8888aa';
        ctx.lineWidth = 3;

        // Lazo 1 (izquierdo)
        ctx.strokeRect(L, T, halfW, 2 * halfH);

        // Lazo 2 (derecho)
        ctx.strokeRect(cx, T, halfW, 2 * halfH);

        // Línea central (R2 compartida)
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#aa66ff';
        ctx.beginPath();
        ctx.moveTo(cx, T);
        ctx.lineTo(cx, B);
        ctx.stroke();
        ctx.setLineDash([]);

        // Batería V1 (lazo izquierdo, abajo)
        this._drawBattery(ctx, L + 30, B - 20);

        // Batería V2 (lazo derecho, arriba)
        this._drawBattery(ctx, R - 30, T + 20);
        ctx.fillStyle = '#ff8c00';
        ctx.font = 'bold 11px system-ui';
        ctx.fillText('V₂', R - 45, T + 16);

        // Resistencia R1 (lazo izquierdo, arriba)
        this._drawResistor(ctx, cx - halfW / 2, T + 30);

        // Resistencia R2 (centro)
        this._drawResistorVertical(ctx, cx + 10, cy - 30);

        // Resistencia R3 (lazo derecho, abajo)
        this._drawResistor(ctx, cx + halfW / 2, B - 30);

        // Nodos
        const nodos = [
            [L, T], [L, B], [cx, T], [cx, B], [R, T], [R, B]
        ];
        for (const [nx, ny] of nodos) {
            ctx.beginPath();
            ctx.arc(nx, ny, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ff8c00';
            ctx.fill();
            ctx.strokeStyle = '#cc7700';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        const x1 = L + 10, y1 = T + 10;
        ctx.fillStyle = '#e8e8f0';
        ctx.font = 'bold 13px system-ui';
        ctx.fillText('Malla 1', x1, y1 + 14);
        ctx.fillText('Malla 2', R - 80, y1 + 14);
    }

    _drawBattery(ctx, x, y) {
        ctx.save();
        ctx.translate(x, y);

        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(0, 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(8, -16);
        ctx.lineTo(8, 16);
        ctx.stroke();

        ctx.fillStyle = '#ff8c00';
        ctx.beginPath();
        ctx.arc(4, 0, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawResistor(ctx, x, y) {
        ctx.save();
        ctx.translate(x, y);

        const w = 36;
        const h = 10;
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

    _drawResistorVertical(ctx, x, y) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 2);
        ctx.restore();

        const w = 36;
        const h = 10;
        const zigzag = 5;

        ctx.strokeStyle = '#aa66ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y - w / 2);
        for (let i = 0; i < zigzag; i++) {
            const t = (i + 1) / (zigzag + 1);
            const py = y - w / 2 + t * w;
            const px = x + ((i % 2 === 0) ? -h / 2 : h / 2);
            ctx.lineTo(px, py);
        }
        ctx.lineTo(x, y + w / 2);
        ctx.stroke();
    }

    _drawCurrentArrows(ctx, W, H) {
        const st = this.currentState;
        if (!st) return;

        const cx = W / 2;
        const cy = H / 2;
        const halfW = 180;
        const halfH = 120;

        const scale = Math.min(Math.abs(st.I1) * 80, 80);

        this._drawArrow(ctx, cx - halfW + 15, cy, scale, 0, '#00e5ff', `I₁ = ${st.I1.toFixed(3)} A`);

        this._drawArrow(ctx, cx + halfW - 15, cy, -scale, 0, '#ff8c00', `I₂ = ${st.I2.toFixed(3)} A`);

        const ir2scale = Math.min(Math.abs(st.IR2) * 80, 80);
        this._drawArrow(ctx, cx, cy - 10, 0, -ir2scale * Math.sign(st.IR2 || 0.001), '#aa66ff', `IR₂ = ${st.IR2.toFixed(3)} A`);
    }

    _drawArrow(ctx, x, y, dx, dy, color, label) {
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;

        const nx = dx / len;
        const ny = dy / len;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.stroke();

        const hl = 10;
        const angle = Math.atan2(dy, dx);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx - hl * Math.cos(angle - 0.4), y + dy - hl * Math.sin(angle - 0.4));
        ctx.lineTo(x + dx - hl * Math.cos(angle + 0.4), y + dy - hl * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = color;
        ctx.font = '10px system-ui';
        ctx.fillText(label, x + dx / 2 + 10, y + dy / 2 - 8);
    }

    _drawLabels(ctx, W, H) {
        if (!this.currentState) return;
        const st = this.currentState;

        const cx = W / 2;
        const cy = H / 2;
        const halfW = 180;
        const halfH = 120;

        ctx.fillStyle = '#aaa';
        ctx.font = '10px system-ui';
        ctx.fillText(`R₁ = ${this.R1} Ω`, cx - halfW + 10, cy - halfH + 50);
        ctx.fillText(`R₂ = ${this.R2} Ω`, cx + 20, cy - 45);
        ctx.fillText(`R₃ = ${this.R3} Ω`, cx + halfW - 60, cy + halfH - 30);
        ctx.fillText(`V₁ = ${this.V1} V`, cx - halfW + 10, cy + halfH - 10);
    }

    _drawInfoPanel(ctx, W, H) {
        const st = this.currentState;
        if (!st) return;

        const panelW = 230;
        const panelH = 200;
        ctx.fillStyle = 'rgba(10, 10, 26, 0.9)';
        ctx.fillRect(10, 10, panelW, panelH);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.strokeRect(10, 10, panelW, panelH);

        ctx.fillStyle = '#e8e8f0';
        ctx.font = 'bold 13px system-ui';
        ctx.fillText('Resultados', 20, 30);

        ctx.font = '12px system-ui';
        let line = 1;
        const lines = [
            { l: `I₁ = ${st.I1.toFixed(4)} A`, c: '#00e5ff' },
            { l: `I₂ = ${st.I2.toFixed(4)} A`, c: '#ff8c00' },
            { l: `IR₂ = I₁ - I₂ = ${st.IR2.toFixed(4)} A`, c: '#aa66ff' },
            { l: `VR₁ = ${st.voltages.VR1.toFixed(2)} V`, c: '#888' },
            { l: `VR₂ = ${st.voltages.VR2.toFixed(2)} V`, c: '#888' },
            { l: `VR₃ = ${st.voltages.VR3.toFixed(2)} V`, c: '#888' },
            { l: `PR₁ = ${st.powers.PR1.toFixed(4)} W`, c: '#888' },
            { l: `PR₂ = ${st.powers.PR2.toFixed(4)} W`, c: '#888' },
            { l: `PR₃ = ${st.powers.PR3.toFixed(4)} W`, c: '#888' }
        ];

        for (const item of lines) {
            ctx.fillStyle = item.c;
            ctx.fillText(item.l, 20, 30 + line * 18);
            line++;
        }

        ctx.fillStyle = '#2ecc71';
        ctx.font = '10px system-ui';
        ctx.fillText(`ΣV lazo 1 = ${st.loopCheck1.toExponential(2)} V`, 20, 30 + line * 18 + 4);
        ctx.fillText(`ΣV lazo 2 = ${st.loopCheck2.toExponential(2)} V`, 20, 30 + (line + 1) * 18 + 4);
    }
}
