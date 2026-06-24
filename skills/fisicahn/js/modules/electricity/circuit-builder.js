// ============================================
// CONSTRUCTOR DE CIRCUITOS — Drag & Drop
// Archivo: js/modules/electricity/circuit-builder.js
// ============================================

export const GRID_SIZE = 40;

export function snapToGrid(x, y) {
    return {
        x: Math.round(x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(y / GRID_SIZE) * GRID_SIZE
    };
}

export class CircuitNode {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.connections = [];
        this.voltage = 0;
    }
}

export class CircuitComponent {
    constructor(type, value, nodeA, nodeB) {
        this.type = type;
        this.value = value;
        this.nodeA = nodeA;
        this.nodeB = nodeB;
        this.current = 0;
        this.voltageDrop = 0;
        this.power = 0;
        this.id = '';
    }

    getLabel() {
        const labels = {
            battery: `${this.value}V`,
            resistor: `${this.value}Ω`,
            bulb: `${this.value}Ω`,
            switch: 'SW',
            wire: '',
            ammeter: 'A',
            voltmeter: 'V'
        };
        return labels[this.type] || this.type;
    }
}

export class CircuitBuilderModule {
    constructor() {
        this._canvas = null;
        this._renderer = null;
        this.nodes = new Map();
        this.components = [];
        this.nextNodeId = 1;
        this.nextCompId = 1;
        this.solved = false;
        this.analysisResult = null;

        this.palette = [
            { type: 'battery', label: 'Batería', icon: '🔋', defaultValue: 12 },
            { type: 'resistor', label: 'Resistencia', icon: '⊏⊐', defaultValue: 100 },
            { type: 'bulb', label: 'Foco', icon: '💡', defaultValue: 50 },
            { type: 'switch', label: 'Switch', icon: '⚡', defaultValue: 0 },
            { type: 'wire', label: 'Cable', icon: '〰️', defaultValue: 0 },
            { type: 'ammeter', label: 'Amperímetro', icon: 'A', defaultValue: 0 },
            { type: 'voltmeter', label: 'Voltímetro', icon: 'V', defaultValue: 0 }
        ];

        this.selectedPalette = null;
        this.dragStart = null;
        this.hoveredNode = null;
        this._connectingNode = null;
        this.connectionMode = false;
    }

    init(canvas, renderer) {
        this._canvas = canvas;
        this._renderer = renderer;
        this.nodes.clear();
        this.components = [];
        this.nextNodeId = 1;
        this.nextCompId = 1;
        this.solved = false;
        this.analysisResult = null;
        this._connectingNode = null;
        this.connectionMode = false;
    }

    update(dt) {
    }

    render(ctx) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, W, H);

        this._drawGrid(ctx, W, H);
        this._drawComponents(ctx);
        this._drawNodes(ctx);
        this._drawConnectionPreview(ctx);

        if (this.connectionMode && this._connectingNode) {
            ctx.fillStyle = '#ff8c00';
            ctx.font = '11px system-ui';
            ctx.fillText('Haz clic en otro nodo para conectar...', 20, H - 20);
        }

        if (this.solved && this.analysisResult) {
            this._drawAnalysisInfo(ctx);
        }
    }

    reset() {
        this.nodes.clear();
        this.components = [];
        this.nextNodeId = 1;
        this.nextCompId = 1;
        this.solved = false;
        this.analysisResult = null;
        this._connectingNode = null;
        this.connectionMode = false;
    }

    getControls() {
        return [
            { id: 'analyze', label: 'Analizar circuito', type: 'button', action: 'analyze' },
            { id: 'clear', label: 'Limpiar todo', type: 'button', action: 'clear' }
        ];
    }

    getCharts() {
        if (!this.solved || !this.analysisResult) return null;
        return {
            type: 'bar',
            datasets: this.components
                .filter(c => c.type === 'resistor' || c.type === 'bulb')
                .map((c, i) => ({
                    label: `${c.type} ${i + 1}`,
                    color: '#e74c3c',
                    data: [{ x: i, y: c.power }]
                })),
            xlabel: 'Componente',
            ylabel: 'Potencia (W)'
        };
    }

    addNode(x, y) {
        const snapped = snapToGrid(x, y);
        const id = `n${this.nextNodeId++}`;
        const node = new CircuitNode(id, snapped.x, snapped.y);
        this.nodes.set(id, node);
        return node;
    }

    getNodeAt(x, y, tolerance) {
        tolerance = tolerance || 15;
        for (const node of this.nodes.values()) {
            const dx = x - node.x;
            const dy = y - node.y;
            if (Math.sqrt(dx * dx + dy * dy) < tolerance) return node;
        }
        return null;
    }

    addComponent(type, value, nodeA, nodeB) {
        const comp = new CircuitComponent(type, value, nodeA, nodeB);
        comp.id = `c${this.nextCompId++}`;
        this.components.push(comp);
        if (!nodeA.connections.includes(comp.id)) nodeA.connections.push(comp.id);
        if (!nodeB.connections.includes(comp.id)) nodeB.connections.push(comp.id);
        this.solved = false;
        this.analysisResult = null;
        return comp;
    }

    analyze() {
        if (this.components.length === 0) {
            this.analysisResult = { ok: false, message: 'No hay componentes en el circuito.' };
            return this.analysisResult;
        }

        if (!this._hasClosedLoop()) {
            this.analysisResult = { ok: false, message: 'Circuito abierto: no hay un lazo cerrado.' };
            return this.analysisResult;
        }

        const battery = this.components.find(c => c.type === 'battery');
        if (!battery) {
            this.analysisResult = { ok: false, message: 'No hay batería en el circuito.' };
            return this.analysisResult;
        }

        const resistors = this.components.filter(c => c.type === 'resistor' || c.type === 'bulb');
        const wires = this.components.filter(c => c.type === 'wire');
        const switchComp = this.components.find(c => c.type === 'switch');

        if (switchComp) {
            if (switchComp.value === 0) {
                this.analysisResult = { ok: true, message: 'Switch abierto — no circula corriente.', totalCurrent: 0 };
                return this.analysisResult;
            }
        }

        if (resistors.length === 0 && wires.length > 0) {
            const Req = 0.001;
            const I = battery.value / Req;
            this.analysisResult = {
                ok: true, message: 'Cortocircuito (solo cables). Corriente muy alta.',
                totalCurrent: I, totalPower: battery.value * I, Req: Req
            };
            for (const comp of this.components) {
                comp.current = I;
                comp.voltageDrop = I * (comp.type === 'resistor' || comp.type === 'bulb' ? comp.value : 0.001);
                comp.power = comp.current * comp.voltageDrop;
            }
            this.solved = true;
            return this.analysisResult;
        }

        const Req = resistors.reduce((s, r) => s + r.value, 0);
        const I = Req > 0 ? battery.value / Req : Infinity;

        for (const comp of this.components) {
            if (comp.type === 'battery') {
                comp.current = I;
                comp.voltageDrop = battery.value;
                comp.power = battery.value * I;
            } else if (comp.type === 'resistor' || comp.type === 'bulb') {
                comp.current = I;
                comp.voltageDrop = I * comp.value;
                comp.power = I * I * comp.value;
            } else if (comp.type === 'wire') {
                comp.current = I;
                comp.voltageDrop = 0;
                comp.power = 0;
            } else if (comp.type === 'ammeter') {
                comp.current = I;
                comp.voltageDrop = 0;
                comp.power = 0;
            } else if (comp.type === 'voltmeter') {
                comp.current = 0;
                comp.voltageDrop = battery.value;
                comp.power = 0;
            } else if (comp.type === 'switch') {
                comp.current = I;
                comp.voltageDrop = 0;
                comp.power = 0;
            }
        }

        this.solved = true;
        this.analysisResult = {
            ok: true,
            message: 'Circuito resuelto.',
            totalCurrent: I,
            totalPower: battery.value * I,
            Req: Req
        };
        return this.analysisResult;
    }

    clearAll() {
        this.nodes.clear();
        this.components = [];
        this.nextNodeId = 1;
        this.nextCompId = 1;
        this.solved = false;
        this.analysisResult = null;
        this._connectingNode = null;
        this.connectionMode = false;
    }

    handlePointerDown(x, y) {
        const snapped = snapToGrid(x, y);
        const existingNode = this.getNodeAt(x, y);

        if (this.connectionMode && this._connectingNode) {
            if (existingNode && existingNode.id !== this._connectingNode.id) {
                this.addComponent('wire', 0, this._connectingNode, existingNode);
            }
            this.connectionMode = false;
            this._connectingNode = null;
            return;
        }

        if (existingNode) {
            if (!this.connectionMode) {
                this.connectionMode = true;
                this._connectingNode = existingNode;
            }
            return;
        }

        if (this.selectedPalette) {
            const nodeA = this.addNode(snapped.x - GRID_SIZE / 2, snapped.y);
            const nodeB = this.addNode(snapped.x + GRID_SIZE / 2, snapped.y);
            this.addComponent(
                this.selectedPalette.type,
                this.selectedPalette.defaultValue,
                nodeA, nodeB
            );
        }
    }

    handlePointerMove(x, y) {
        this.hoveredNode = this.getNodeAt(x, y);
    }

    handleDragFromPalette(type, defaultValue) {
        this.selectedPalette = { type, defaultValue };
        this.connectionMode = false;
        this._connectingNode = null;
    }

    _hasClosedLoop() {
        if (this.nodes.size < 2) return false;
        const visited = new Set();
        const startNode = this.nodes.values().next().value;
        if (!startNode) return false;
        const stack = [startNode];
        const parent = new Map();
        parent.set(startNode.id, null);

        while (stack.length > 0) {
            const current = stack.pop();
            if (visited.has(current.id)) continue;
            visited.add(current.id);

            for (const cid of current.connections) {
                const comp = this.components.find(c => c.id === cid);
                if (!comp) continue;
                const neighbor = comp.nodeA.id === current.id ? comp.nodeB : comp.nodeA;
                if (!neighbor || visited.has(neighbor.id)) continue;
                parent.set(neighbor.id, current.id);
                stack.push(neighbor);
            }
        }

        for (const comp of this.components) {
            if (comp.type === 'battery' || comp.type === 'wire') {
                const aVisited = visited.has(comp.nodeA.id);
                const bVisited = visited.has(comp.nodeB.id);
                if (aVisited && bVisited) return true;
            }
        }

        return visited.size >= 2;
    }

    _drawGrid(ctx, W, H) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= W; x += GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = 0; y <= H; y += GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
        const half = GRID_SIZE / 2;
        for (let x = half; x <= W; x += GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = half; y <= H; y += GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
    }

    _drawComponents(ctx) {
        for (const comp of this.components) {
            const a = comp.nodeA;
            const b = comp.nodeB;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(angle);

            const isActive = this.solved && comp.current > 0.001;

            switch (comp.type) {
                case 'battery':
                    this._drawBatterySymbol(ctx, len);
                    break;
                case 'resistor':
                    this._drawResistorSymbol(ctx, len, isActive);
                    break;
                case 'bulb':
                    this._drawBulbSymbol(ctx, isActive);
                    break;
                case 'switch':
                    this._drawSwitchSymbol(ctx, len);
                    break;
                case 'ammeter':
                    this._drawMeterSymbol(ctx, 'A', isActive ? comp.current : 0);
                    break;
                case 'voltmeter':
                    this._drawMeterSymbol(ctx, 'V', isActive ? comp.voltageDrop : 0);
                    break;
                case 'wire':
                default:
                    ctx.strokeStyle = isActive ? '#00e5ff' : '#555577';
                    ctx.lineWidth = isActive ? 3 : 2;
                    ctx.beginPath();
                    ctx.moveTo(-len / 2, 0);
                    ctx.lineTo(len / 2, 0);
                    ctx.stroke();
                    break;
            }

            ctx.restore();

            ctx.fillStyle = '#888';
            ctx.font = '9px system-ui';
            ctx.textAlign = 'center';
            const label = comp.getLabel();
            if (label) ctx.fillText(label, mx, my + 20);
            ctx.textAlign = 'left';

            if (isActive && (comp.type === 'resistor' || comp.type === 'bulb')) {
                const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 20);
                glow.addColorStop(0, `rgba(255, ${Math.floor(100 + comp.power * 10)}, 0, 0.3)`);
                glow.addColorStop(1, 'rgba(255, 140, 0, 0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(mx, my, 20, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    _drawBatterySymbol(ctx, len) {
        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 3;

        const gap = 6;
        const shortLen = len / 2 - gap;

        ctx.beginPath();
        ctx.moveTo(-shortLen, 0);
        ctx.lineTo(-gap, 0);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(gap, 0);
        ctx.lineTo(shortLen, 0);
        ctx.stroke();

        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-3, -10);
        ctx.lineTo(-3, 10);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(3, -14);
        ctx.lineTo(3, 14);
        ctx.stroke();

        ctx.fillStyle = '#ff8c00';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ff8c00';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('+', -len / 2 + 4, -6);
        ctx.fillText('−', len / 2 - 4, -6);
        ctx.textAlign = 'left';
    }

    _drawResistorSymbol(ctx, len, active) {
        const w = Math.max(len * 0.8, 20);
        const h = 8;
        const zigzag = 5;
        const startX = -w / 2;

        ctx.strokeStyle = active ? '#aa66ff' : '#6666aa';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.moveTo(-len / 2, 0);
        ctx.lineTo(startX, 0);
        for (let i = 0; i < zigzag; i++) {
            const t = (i + 1) / (zigzag + 1);
            const px = startX + t * w;
            const py = (i % 2 === 0) ? -h : h;
            ctx.lineTo(px, py);
        }
        ctx.lineTo(len / 2, 0);
        ctx.stroke();
    }

    _drawBulbSymbol(ctx, active) {
        ctx.strokeStyle = active ? '#ffcc00' : '#6666aa';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.arc(0, -2, 12, 0, Math.PI, false);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-10, 8);
        ctx.lineTo(-3, 2);
        ctx.moveTo(10, 8);
        ctx.lineTo(3, 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-5, 10);
        ctx.lineTo(5, 10);
        ctx.stroke();

        if (active) {
            const glow = ctx.createRadialGradient(0, -2, 0, 0, -2, 20);
            glow.addColorStop(0, 'rgba(255, 200, 0, 0.4)');
            glow.addColorStop(1, 'rgba(255, 200, 0, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(0, -2, 20, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawSwitchSymbol(ctx, len) {
        ctx.strokeStyle = '#8888aa';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(-len / 2, 0);
        ctx.lineTo(-3, 0);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(len / 2, 0);
        ctx.lineTo(6, 0);
        ctx.stroke();

        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(6, -10);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ff8c00';
        ctx.fill();
    }

    _drawMeterSymbol(ctx, label, reading) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, 4);

        if (reading > 0) {
            ctx.font = '7px system-ui';
            ctx.fillText(reading.toFixed(2), 0, 16);
        }
        ctx.textAlign = 'left';

        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-12, 0);
        ctx.lineTo(-18, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
    }

    _drawNodes(ctx) {
        for (const node of this.nodes.values()) {
            const isHovered = this.hoveredNode && this.hoveredNode.id === node.id;
            const isConnecting = this._connectingNode && this._connectingNode.id === node.id;

            ctx.beginPath();
            ctx.arc(node.x, node.y, isHovered ? 6 : 4, 0, Math.PI * 2);
            ctx.fillStyle = isConnecting ? '#ff4444' : (isHovered ? '#ffaa00' : '#ff8c00');
            ctx.fill();
            ctx.strokeStyle = isConnecting ? '#ff0000' : '#cc7700';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    _drawConnectionPreview(ctx) {
        if (!this.connectionMode || !this._connectingNode) return;

        const x = this.hoveredNode ? this.hoveredNode.x : this._connectingNode.x;
        const y = this.hoveredNode ? this.hoveredNode.y : this._connectingNode.y;

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(this._connectingNode.x, this._connectingNode.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _drawAnalysisInfo(ctx) {
        if (!this.analysisResult) return;

        const W = ctx.canvas.width;
        ctx.fillStyle = 'rgba(10, 10, 26, 0.88)';
        ctx.fillRect(10, 10, 220, 110);
        ctx.strokeStyle = this.analysisResult.ok ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.3)';
        ctx.strokeRect(10, 10, 220, 110);

        ctx.fillStyle = this.analysisResult.ok ? '#2ecc71' : '#ff4444';
        ctx.font = 'bold 12px system-ui';
        ctx.fillText(this.analysisResult.message, 20, 30);

        if (this.analysisResult.totalCurrent !== undefined) {
            ctx.fillStyle = '#e8e8f0';
            ctx.font = '12px system-ui';
            ctx.fillText(`I_total = ${this.analysisResult.totalCurrent.toFixed(3)} A`, 20, 52);
            if (this.analysisResult.totalPower !== undefined) {
                ctx.fillText(`P_total = ${this.analysisResult.totalPower.toFixed(2)} W`, 20, 72);
            }
            if (this.analysisResult.Req !== undefined) {
                ctx.fillText(`Req = ${this.analysisResult.Req.toFixed(1)} Ω`, 20, 92);
            }
        }
    }
}
