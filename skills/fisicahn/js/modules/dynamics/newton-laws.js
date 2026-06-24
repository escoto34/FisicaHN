// ============================================
// LEYES DE NEWTON CON FRICCIÓN — Plano Inclinado
// Archivo: js/modules/dynamics/newton-laws.js
// ============================================

const G_DEFAULT = 9.81;

/**
 * Calcula el análisis completo de fuerzas de Newton.
 */
export function newtonCalculation(m, Faplicada, angFuerza, mus, muk, angPlano, g) {
    muk = Math.min(muk, mus);

    const radF = angFuerza * Math.PI / 180;
    const radP = angPlano * Math.PI / 180;

    const W = m * g;
    const Wx = W * Math.sin(radP);
    const Wy = W * Math.cos(radP);

    const Fax = Faplicada * Math.cos(radF);
    const Fay = Faplicada * Math.sin(radF);

    const N = Math.max(0, Wy - Fay);

    if (N <= 0) {
        return {
            weight: W, weightX: Wx, weightY: Wy,
            appliedX: Fax, appliedY: Fay,
            normal: 0, maxStaticFriction: 0,
            friction: 0, netForce: Fax - Wx,
            acceleration: (Fax - Wx) / m,
            state: 'despegado',
            criticalAngle: Math.atan(mus) * 180 / Math.PI,
            fbd: buildFBD(W, Wx, Wy, Fax, Fay, 0, 0, angPlano)
        };
    }

    const fsMax = mus * N;
    const Ftendencia = Fax - Wx;

    let friction, acceleration, state, netForce;

    if (Math.abs(Ftendencia) <= fsMax) {
        friction = -Ftendencia;
        netForce = 0;
        acceleration = 0;
        state = 'estático';
    } else {
        const direction = Math.sign(Ftendencia);
        const fk = muk * N;
        friction = -direction * fk;
        netForce = Ftendencia + friction;
        acceleration = netForce / m;
        state = 'en movimiento';
    }

    return {
        weight: W, weightX: Wx, weightY: Wy,
        appliedX: Fax, appliedY: Fay,
        normal: N, maxStaticFriction: fsMax,
        friction, netForce, acceleration, state,
        criticalAngle: Math.atan(mus) * 180 / Math.PI,
        fbd: buildFBD(W, Wx, Wy, Fax, Fay, N, friction, angPlano)
    };
}

function buildFBD(W, Wx, Wy, Fax, Fay, N, friction, thetaPDeg) {
    const radP = thetaPDeg * Math.PI / 180;
    return {
        weight: {
            label: `W = ${W.toFixed(1)} N`,
            magnitude: W, color: '#e74c3c',
            dx: -W * Math.sin(radP), dy: -W * Math.cos(radP)
        },
        weightX: {
            label: `Wx = ${Wx.toFixed(1)} N`,
            magnitude: Wx, color: '#e74c3c',
            dx: -Wx, dy: 0, dashed: true
        },
        weightY: {
            label: `Wy = ${Wy.toFixed(1)} N`,
            magnitude: Wy, color: '#e74c3c',
            dx: 0, dy: -Wy, dashed: true
        },
        normal: {
            label: `N = ${N.toFixed(1)} N`,
            magnitude: N, color: '#2ecc71',
            dx: 0, dy: N
        },
        applied: {
            label: `F = ${Math.sqrt(Fax*Fax + Fay*Fay).toFixed(1)} N`,
            magnitude: Math.sqrt(Fax * Fax + Fay * Fay),
            color: '#3498db', dx: Fax, dy: Fay
        },
        friction: {
            label: `f = ${Math.abs(friction).toFixed(1)} N`,
            magnitude: Math.abs(friction),
            color: '#ff8c00', dx: friction, dy: 0
        }
    };
}

export class NewtonLawsModule {
    constructor() {
        this.m = 5;
        this.F = 10;
        this.thetaF = 0;
        this.mus = 0.4;
        this.muk = 0.3;
        this.thetaP = 0;
        this.g = G_DEFAULT;

        this.position = 0;
        this.velocity = 0;
        this.t = 0;
        this.analysis = null;
        this.scale = { pixelsPerMeter: 20 };
        this._history = [];
        this._canvas = null;
        this._renderer = null;
    }

    init(canvas, renderer) {
        this._canvas = canvas;
        this._renderer = renderer;
        this.position = 0;
        this.velocity = 0;
        this.t = 0;
        this._history = [];
        this.analysis = newtonCalculation(
            this.m, this.F, this.thetaF,
            this.mus, this.muk, this.thetaP, this.g
        );
    }

    update(dt) {
        this.analysis = newtonCalculation(
            this.m, this.F, this.thetaF,
            this.mus, this.muk, this.thetaP, this.g
        );

        if (this.analysis.state === 'en movimiento') {
            this.velocity += this.analysis.acceleration * dt;
            this.position += this.velocity * dt;
            if (this.position < 0) {
                this.position = 0;
                if (this.velocity < 0) this.velocity = 0;
            }
        } else {
            if (this.analysis.state === 'detenido' || Math.abs(this.velocity) < 0.001) {
                this.velocity = 0;
            }
        }

        this.t += dt;

        const Ec = 0.5 * this.m * this.velocity * this.velocity;
        const h = this.position * Math.sin(this.thetaP * Math.PI / 180);
        const Ep = this.m * this.g * Math.max(0, h);
        this._history.push({
            t: this.t, a: this.analysis.acceleration,
            v: this.velocity, x: this.position,
            Ec, Ep, Em: Ec + Ep
        });
        if (this._history.length > 500) this._history.shift();
    }

    render(ctx) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        ctx.clearRect(0, 0, W, H);

        const radP = this.thetaP * Math.PI / 180;

        this._drawInclinedPlane(ctx, W, H, radP);
        const blockCenter = this._drawBlock(ctx, W, H, radP);
        if (this.analysis) {
            this._drawFBD(ctx, blockCenter.x, blockCenter.y, radP);
        }
        this._drawDataPanel(ctx);
    }

    reset() {
        this.position = 0;
        this.velocity = 0;
        this.t = 0;
        this._history = [];
        if (this._canvas) {
            this.analysis = newtonCalculation(
                this.m, this.F, this.thetaF,
                this.mus, this.muk, this.thetaP, this.g
            );
        }
    }

    getControls() {
        return [
            { id: 'm', label: 'Masa (m)', type: 'range', min: 0.1, max: 100, step: 0.1, default: 5, unit: 'kg' },
            { id: 'F', label: 'Fuerza aplicada (F)', type: 'range', min: 0, max: 500, step: 1, default: 10, unit: 'N' },
            { id: 'thetaF', label: 'Ángulo de F (θ_F)', type: 'range', min: 0, max: 90, step: 1, default: 0, unit: '°' },
            { id: 'mus', label: 'μs (estático)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, unit: '' },
            { id: 'muk', label: 'μk (cinético)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, unit: '' },
            { id: 'thetaP', label: 'Inclinación (θ_p)', type: 'range', min: 0, max: 60, step: 1, default: 0, unit: '°' },
            { id: 'g', label: 'Gravedad (g)', type: 'range', min: 1, max: 25, step: 0.01, default: G_DEFAULT, unit: 'm/s²' }
        ];
    }

    getCharts() {
        return {
            type: 'line',
            datasets: [
                { id: 'v', label: 'Velocidad', color: '#00e5ff', data: this._history.map(p => ({ x: p.t, y: p.v })) },
                { id: 'a', label: 'Aceleración', color: '#ff8c00', data: this._history.map(p => ({ x: p.t, y: p.a })) },
                { id: 'x', label: 'Posición', color: '#2ecc71', data: this._history.map(p => ({ x: p.t, y: p.x })) }
            ],
            xlabel: 't (s)',
            ylabel: 'Magnitud'
        };
    }

    _drawInclinedPlane(ctx, w, h, radP) {
        const baseX = 80;
        const baseY = h - 80;
        const planeLen = w - 160;
        const endX = baseX + planeLen * Math.cos(radP);
        const endY = baseY - planeLen * Math.sin(radP);

        ctx.fillStyle = '#1a1a3e';
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(endX, endY);
        ctx.lineTo(endX + 40, baseY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#555577';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.fillStyle = '#444';
        ctx.font = '11px system-ui';
        ctx.fillText('Superficie', (baseX + endX) / 2 - 30, baseY + 20);

        if (this.thetaP > 0) {
            const arcR = 50;
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(baseX, baseY, arcR, 0, -radP, true);
            ctx.stroke();

            ctx.fillStyle = '#aaa';
            ctx.font = '12px system-ui';
            const labelAngle = -radP / 2;
            ctx.fillText(
                `${this.thetaP}°`,
                baseX + (arcR + 14) * Math.cos(labelAngle) - 12,
                baseY + (arcR + 14) * Math.sin(-labelAngle) + 4
            );
        }
    }

    _drawBlock(ctx, w, h, radP) {
        const baseX = 80;
        const baseY = h - 80;
        const planeLen = w - 160;
        const distAlong = 120 + this.position * this.scale.pixelsPerMeter;
        const bx = baseX + distAlong * Math.cos(radP);
        const by = baseY - distAlong * Math.sin(radP);

        const blockW = 60;
        const blockH = 40;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(-radP);

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-blockW / 2 + 3, -blockH + 3, blockW, blockH);

        const isMoving = this.analysis && this.analysis.state === 'en movimiento';
        ctx.fillStyle = isMoving ? '#3498db' : '#2c3e50';
        ctx.fillRect(-blockW / 2, -blockH, blockW, blockH);
        ctx.strokeStyle = isMoving ? '#5dade2' : '#555';
        ctx.lineWidth = 2;
        ctx.strokeRect(-blockW / 2, -blockH, blockW, blockH);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.m} kg`, 0, -blockH / 2 + 5);
        ctx.textAlign = 'left';

        ctx.restore();
        return { x: bx, y: by };
    }

    _drawFBD(ctx, cx, cy, radP) {
        const fbd = this.analysis.fbd;
        const SCALE = 0.6;

        const vectors = [
            { ...fbd.weight, labelOffX: -20, labelOffY: -20 },
            { ...fbd.normal, labelOffX: 12, labelOffY: -12 },
            { ...fbd.applied, labelOffX: 12, labelOffY: -12 },
            { ...fbd.friction, labelOffX: 12, labelOffY: -12 }
        ];

        for (const vec of vectors) {
            if (vec.magnitude < 0.01) continue;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(-radP);

            const ex = vec.dx * SCALE;
            const ey = -vec.dy * SCALE;

            ctx.strokeStyle = vec.color;
            ctx.lineWidth = 3;
            if (vec.dashed) ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.setLineDash([]);

            if (vec.magnitude > 0.5) {
                const angle = Math.atan2(ey, ex);
                const hl = 10;
                ctx.fillStyle = vec.color;
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - hl * Math.cos(angle - 0.4), ey - hl * Math.sin(angle - 0.4));
                ctx.lineTo(ex - hl * Math.cos(angle + 0.4), ey - hl * Math.sin(angle + 0.4));
                ctx.closePath();
                ctx.fill();
            }

            ctx.fillStyle = vec.color;
            ctx.font = '11px system-ui';
            const lx = ex * 0.5 + (vec.labelOffX || 0);
            const ly = ey * 0.5 + (vec.labelOffY || 0);
            ctx.fillText(vec.label, lx, ly);

            ctx.restore();
        }
    }

    _drawDataPanel(ctx) {
        if (!this.analysis) return;
        const a = this.analysis;

        const px = 10, py = 10, pw = 270, ph = 230;
        ctx.fillStyle = 'rgba(10, 10, 26, 0.92)';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = a.state === 'en movimiento' ? '#3498db' : '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, pw, ph);

        ctx.font = '12px system-ui';
        const col1 = px + 14;
        const col2 = px + 150;
        const row = (i) => py + 22 + i * 16;

        ctx.fillStyle = a.state === 'en movimiento' ? '#3498db' : '#2ecc71';
        ctx.font = 'bold 13px system-ui';
        ctx.fillText(`Estado: ${a.state.toUpperCase()}`, col1, row(0));

        ctx.fillStyle = '#e8e8f0';
        ctx.font = '12px system-ui';
        const lines = [
            { l: `W = ${a.weight.toFixed(1)} N`, r: `Wx = ${a.weightX.toFixed(1)} N` },
            { l: `N = ${a.normal.toFixed(1)} N`, r: `Wy = ${a.weightY.toFixed(1)} N` },
            { l: `Fax = ${a.appliedX.toFixed(1)} N`, r: `Fay = ${a.appliedY.toFixed(1)} N` },
            { l: `fs_max = ${a.maxStaticFriction.toFixed(1)} N`, r: `f = ${Math.abs(a.friction).toFixed(1)} N` },
            { l: `F_neta = ${a.netForce.toFixed(2)} N`, r: `a = ${a.acceleration.toFixed(3)} m/s²` },
            { l: `v = ${this.velocity.toFixed(2)} m/s`, r: `x = ${this.position.toFixed(2)} m` },
            { l: `θ_crítico = ${a.criticalAngle.toFixed(1)}°`, r: '' }
        ];
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i].l, col1, row(i + 1));
            if (lines[i].r) ctx.fillText(lines[i].r, col2, row(i + 1));
        }
    }
}
