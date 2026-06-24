/**
 * @fileoverview Sub-módulo: Constructor de Circuitos (Drag & Drop)
 * Permite colocar cables, resistencias, pilas, LEDs e interruptores en un grid de 40px.
 * Resuelve el circuito eléctricamente en tiempo real usando Análisis Nodal.
 */

import { Vector2D } from '../../utils/vector2d.js';
import { roundTo } from '../../utils/math-helpers.js';

let _engine = null;
let _renderer = null;
let _ui = null;

// Tamaño del grid en píxeles
const GRID_PX = 40;

// Lista de componentes colocados:
// { id, type, x1, y1, x2, y2, value, closed } (x, y en unidades de rejilla 0..20, 0..15)
let components = [];
let nextId = 1;

// Herramienta seleccionada: wire, battery, resistor, led, switch, erase
let activeTool = 'wire';

// Estado de dibujo: inicio del arrastre
let dragStart = null; // { gx, gy }
let dragCurrent = null; // { gx, gy }

// Valores por defecto
let defaultR = 100;
let defaultV = 9;

// Resultados del solver
let nodeVoltages = {}; // 'gx,gy' -> V
let branchCurrents = {}; // compId -> A
let solverMessage = 'Dibuja un circuito cerrado con una pila para analizar.';
let solverOk = false;

// Event listeners to clean up
const listeners = {};

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  // Ajustar dimensiones del mundo para que coincida exactamente con la rejilla de píxeles
  // El canvas mide 800x600 px. Dividido por 40px = 20x15 celdas.
  _renderer.worldWidth = 20;
  _renderer.worldHeight = 15;

  reset();

  _ui.setInfo(`
    <strong>Constructor de Circuitos Interactivos</strong><br>
    Selecciona un componente en la paleta inferior y <strong>arrastra de un nodo a otro</strong> en el canvas para colocarlo. 
    <br>Haz clic sobre un <strong>Interruptor</strong> para abrirlo o cerrarlo. Usa el <strong>Borrador</strong> para quitar elementos.
  `);

  _ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>Arrastrar:</strong> Clic en un nodo y arrastrar a otro.</li>
      <li><strong>Interruptor:</strong> Clic para abrir/cerrar.</li>
      <li><strong>LED:</strong> Brilla si la corriente supera los 2 mA.</li>
      <li><strong>Borrador:</strong> Clic sobre un elemento para eliminarlo.</li>
    </ul>
  `);

  updateData();
  renderParams();

  // Configurar eventos de ratón sobre canvas
  setupCanvasEvents();
}

export function reset(engine, renderer, ui) {
  components = [];
  nextId = 1;
  dragStart = null;
  dragCurrent = null;
  nodeVoltages = {};
  branchCurrents = {};
  solverMessage = 'Dibuja un circuito cerrado con una pila para analizar.';
  solverOk = false;
  updateData();
}

export function destroy() {
  const canvas = _renderer?.canvas;
  if (canvas) {
    canvas.removeEventListener('mousedown', listeners.onMouseDown);
    canvas.removeEventListener('mousemove', listeners.onMouseMove);
    window.removeEventListener('mouseup', listeners.onMouseUp);
    canvas.removeEventListener('touchstart', listeners.onTouchStart);
    canvas.removeEventListener('touchmove', listeners.onTouchMove);
    window.removeEventListener('touchend', listeners.onTouchEnd);
  }
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function setTool(toolId) {
  // Manejado localmente en la paleta de parámetros
}

export function update(dt, elapsed) {
  // El circuito se resuelve estáticamente, no hay variables que integren con el tiempo
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;

  // 1. Dibujar rejilla de puntos (nodos disponibles)
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  for (let gx = 1; gx < 20; gx++) {
    for (let gy = 1; gy < 15; gy++) {
      const p = gridToCanvas(gx, gy);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 2. Dibujar componentes colocados
  components.forEach(c => {
    drawComponent(ctx, c);
  });

  // 3. Dibujar corriente (electrones fluyendo por los componentes con corriente)
  drawElectrons(ctx, elapsed);

  // 4. Dibujar vista previa de dibujo activo
  if (dragStart && dragCurrent) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,229,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const pA = gridToCanvas(dragStart.gx, dragStart.gy);
    const pB = gridToCanvas(dragCurrent.gx, dragCurrent.gy);
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pB.x, pB.y);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Dibujar voltajes en los nodos si el circuito está resuelto
  if (solverOk) {
    ctx.save();
    ctx.font = '9px monospace';
    ctx.fillStyle = '#66bb6a';
    for (const [key, vVal] of Object.entries(nodeVoltages)) {
      const [gx, gy] = key.split(',').map(Number);
      const p = gridToCanvas(gx, gy);
      ctx.fillText(`${roundTo(vVal, 1)}V`, p.x + 4, p.y - 4);
    }
    ctx.restore();
  }
}

function gridToCanvas(gx, gy) {
  // Mapeo directo a píxeles
  return {
    x: gx * GRID_PX,
    y: (15 - gy) * GRID_PX // invertir Y
  };
}

function canvasToGrid(cx, cy) {
  const gx = Math.round(cx / GRID_PX);
  const gy = 15 - Math.round(cy / GRID_PX);
  return {
    gx: Math.max(1, Math.min(19, gx)),
    gy: Math.max(1, Math.min(14, gy))
  };
}

function drawComponent(ctx, c) {
  const pA = gridToCanvas(c.x1, c.y1);
  const pB = gridToCanvas(c.x2, c.y2);
  const midX = (pA.x + pB.x) / 2;
  const midY = (pA.y + pB.y) / 2;
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const angle = Math.atan2(dy, dx);
  const len = Math.hypot(dx, dy);

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(angle);

  // Dibujar cuerpo según tipo
  ctx.strokeStyle = '#888899';
  ctx.lineWidth = 3;

  if (c.type === 'wire') {
    ctx.beginPath();
    ctx.moveTo(-len/2, 0);
    ctx.lineTo(len/2, 0);
    ctx.stroke();
  } else if (c.type === 'battery') {
    // Dibujar cable de conexión
    ctx.beginPath();
    ctx.moveTo(-len/2, 0);
    ctx.lineTo(-10, 0);
    ctx.moveTo(10, 0);
    ctx.lineTo(len/2, 0);
    ctx.stroke();

    // Placas de la pila
    ctx.strokeStyle = '#ffb74d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, -12); ctx.lineTo(-6, 12); // Placa larga +
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(6, -6); ctx.lineTo(6, 6); // Placa corta -
    ctx.stroke();
  } else if (c.type === 'resistor') {
    ctx.beginPath();
    ctx.moveTo(-len/2, 0);
    ctx.lineTo(-15, 0);
    ctx.moveTo(15, 0);
    ctx.lineTo(len/2, 0);
    ctx.stroke();

    // Caja resistencia
    ctx.fillStyle = '#2b3a4a';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-15, -6, 30, 12);
    ctx.strokeRect(-15, -6, 30, 12);

    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${c.value}Ω`, 0, 0);
  } else if (c.type === 'led') {
    ctx.beginPath();
    ctx.moveTo(-len/2, 0);
    ctx.lineTo(-12, 0);
    ctx.moveTo(12, 0);
    ctx.lineTo(len/2, 0);
    ctx.stroke();

    // Triángulo del LED
    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(6, 0);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();

    // Línea de barrera
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(6, -8);
    ctx.lineTo(6, 8);
    ctx.stroke();

    // Glow si está encendido
    const current = Math.abs(branchCurrents[c.id] || 0);
    if (solverOk && current > 0.002) {
      ctx.fillStyle = 'rgba(255, 235, 59, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (c.type === 'switch') {
    ctx.beginPath();
    ctx.moveTo(-len/2, 0);
    ctx.lineTo(-10, 0);
    ctx.moveTo(10, 0);
    ctx.lineTo(len/2, 0);
    ctx.stroke();

    // Terminales circulares
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-10, 0, 2.5, 0, Math.PI * 2);
    ctx.arc(10, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Palanca
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    if (c.closed) {
      ctx.lineTo(10, 0);
    } else {
      ctx.lineTo(5, -12);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawElectrons(ctx, elapsed) {
  if (!solverOk) return;

  ctx.save();
  ctx.fillStyle = '#00e5ff';
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 3;

  components.forEach(c => {
    const current = branchCurrents[c.id] || 0;
    if (Math.abs(current) < 0.0001) return;

    // Dibujar electrones fluyendo a lo largo del componente
    const pA = gridToCanvas(c.x1, c.y1);
    const pB = gridToCanvas(c.x2, c.y2);
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const len = Math.hypot(dx, dy);

    // Cantidad de electrones proporcional a la longitud
    const num = Math.floor(len / 18);
    const speed = current * 12; // factor visual de velocidad

    for (let i = 0; i < num; i++) {
      let progress = (i / num + speed * elapsed) % 1;
      if (progress < 0) progress += 1;

      // Si la corriente es negativa, el sentido físico se invierte
      const factor = current > 0 ? progress : (1 - progress);
      const ex = pA.x + dx * factor;
      const ey = pA.y + dy * factor;

      ctx.beginPath();
      ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function setupCanvasEvents() {
  const canvas = _renderer.canvas;

  listeners.onMouseDown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const gridPt = canvasToGrid(cx, cy);

    if (activeTool === 'erase') {
      // Borrar componente bajo el clic
      const clickedComp = findComponentNear(cx, cy);
      if (clickedComp) {
        components = components.filter(c => c.id !== clickedComp.id);
        solveCircuit();
      }
      return;
    }

    if (activeTool === 'select' || activeTool === 'switch') {
      // Si hace clic sobre un switch, lo conmuta
      const clickedComp = findComponentNear(cx, cy);
      if (clickedComp && clickedComp.type === 'switch') {
        clickedComp.closed = !clickedComp.closed;
        solveCircuit();
      }
      return;
    }

    // Iniciar dibujo
    dragStart = gridPt;
    dragCurrent = gridPt;
  };

  listeners.onMouseMove = (e) => {
    if (!dragStart) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
    dragCurrent = canvasToGrid(cx, cy);
  };

  listeners.onMouseUp = (e) => {
    if (!dragStart || !dragCurrent) return;

    // Guardar componente si los puntos son distintos
    if (dragStart.gx !== dragCurrent.gx || dragStart.gy !== dragCurrent.gy) {
      // Evitar duplicados exactos en el mismo tramo
      const duplicate = components.find(c => 
        (c.x1 === dragStart.gx && c.y1 === dragStart.gy && c.x2 === dragCurrent.gx && c.y2 === dragCurrent.gy) ||
        (c.x2 === dragStart.gx && c.y2 === dragStart.gy && c.x1 === dragCurrent.gx && c.y1 === dragCurrent.gy)
      );

      if (!duplicate) {
        let val = 0;
        if (activeTool === 'battery') val = defaultV;
        if (activeTool === 'resistor') val = defaultR;
        if (activeTool === 'led') val = 50; // Resistencia de referencia LED

        components.push({
          id: nextId++,
          type: activeTool,
          x1: dragStart.gx,
          y1: dragStart.gy,
          x2: dragCurrent.gx,
          y2: dragCurrent.gy,
          value: val,
          closed: true // para interruptor
        });
        solveCircuit();
      }
    }

    dragStart = null;
    dragCurrent = null;
  };

  // Touch Support
  listeners.onTouchStart = (e) => {
    if (e.touches.length > 0) {
      listeners.onMouseDown(e.touches[0]);
    }
  };

  listeners.onTouchMove = (e) => {
    if (e.touches.length > 0) {
      listeners.onMouseMove(e.touches[0]);
    }
  };

  listeners.onTouchEnd = () => {
    listeners.onMouseUp();
  };

  canvas.addEventListener('mousedown', listeners.onMouseDown);
  canvas.addEventListener('mousemove', listeners.onMouseMove);
  window.addEventListener('mouseup', listeners.onMouseUp);
  canvas.addEventListener('touchstart', listeners.onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', listeners.onTouchMove, { passive: true });
  window.addEventListener('touchend', listeners.onTouchEnd);
}

function findComponentNear(cx, cy) {
  // Encontrar el componente cuya línea media esté más cerca de cx,cy
  let best = null;
  let minDist = 15; // Distancia límite en px

  components.forEach(c => {
    const p1 = gridToCanvas(c.x1, c.y1);
    const p2 = gridToCanvas(c.x2, c.y2);

    // Distancia punto a segmento
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (len === 0) return;
    const t = Math.max(0, Math.min(1, ((cx - p1.x) * (p2.x - p1.x) + (cy - p1.y) * (p2.y - p1.y)) / (len * len)));
    const projX = p1.x + t * (p2.x - p1.x);
    const projY = p1.y + t * (p2.y - p1.y);
    const d = Math.hypot(cx - projX, cy - projY);

    if (d < minDist) {
      minDist = d;
      best = c;
    }
  });

  return best;
}

/**
 * Resuelve el circuito usando Nodal Analysis simplificado
 */
function solveCircuit() {
  nodeVoltages = {};
  branchCurrents = {};
  solverOk = false;

  const batteries = components.filter(c => c.type === 'battery');
  if (batteries.length === 0) {
    solverMessage = 'Falta una Pila 🔋 en el circuito para alimentar.';
    updateData();
    return;
  }

  // Agrupar nodos conectados por cables (y interruptores cerrados)
  const parents = {};
  const find = (node) => {
    if (!parents[node]) parents[node] = node;
    if (parents[node] === node) return node;
    return parents[node] = find(parents[node]);
  };
  const union = (n1, n2) => {
    const r1 = find(n1);
    const r2 = find(n2);
    if (r1 !== r2) parents[r1] = r2;
  };

  // Nodos físicos
  const nodeSet = new Set();
  components.forEach(c => {
    nodeSet.add(`${c.x1},${c.y1}`);
    nodeSet.add(`${c.x2},${c.y2}`);
  });

  // Agrupar por cables e interruptores cerrados
  components.forEach(c => {
    if (c.type === 'wire' || (c.type === 'switch' && c.closed)) {
      union(`${c.x1},${c.y1}`, `${c.x2},${c.y2}`);
    }
  });

  // Mapear cada nodo físico a un supernodo (ID único de grupo)
  const superNodes = {};
  const superNodeSet = new Set();
  nodeSet.forEach(n => {
    const sId = find(n);
    superNodes[n] = sId;
    superNodeSet.add(sId);
  });

  const sNodesList = Array.from(superNodeSet);
  const numSNodes = sNodesList.length;

  if (numSNodes < 2) {
    solverMessage = 'Circuito abierto o solo cortocircuito.';
    updateData();
    return;
  }

  // Identificar terminales de la primera batería
  const bat = batteries[0];
  const batNeg = superNodes[`${bat.x2},${bat.y2}`];
  const batPos = superNodes[`${bat.x1},${bat.y1}`];

  if (batNeg === batPos) {
    solverMessage = '¡Advertencia! Pila cortocircuitada.';
    updateData();
    return;
  }

  // Resolver matriz de conductancias para supernodos
  // Indexar supernodos: 0 es Ground (batNeg), los demás son incógnitas
  const sNodeToIndex = {};
  sNodeToIndex[batNeg] = 0; // Ground = 0V
  let nextIdx = 1;
  sNodesList.forEach(sn => {
    if (sn !== batNeg) {
      sNodeToIndex[sn] = nextIdx++;
    }
  });

  const N = nextIdx; // Número total de variables (incluye batPos que es conocida)
  const G_matrix = Array.from({ length: N }, () => Array(N).fill(0));
  const I_vector = Array(N).fill(0);

  // Añadir conductancias de resistencias, LEDs y switches abiertos (fricción alta)
  components.forEach(c => {
    let R = 0;
    if (c.type === 'resistor') R = c.value;
    else if (c.type === 'led') R = c.value;
    else if (c.type === 'switch' && !c.closed) R = 1e7; // circuito abierto

    if (R > 0) {
      const idxA = sNodeToIndex[superNodes[`${c.x1},${c.y1}`]];
      const idxB = sNodeToIndex[superNodes[`${c.x2},${c.y2}`]];

      const cond = 1 / R;
      G_matrix[idxA][idxA] += cond;
      G_matrix[idxB][idxB] += cond;
      G_matrix[idxA][idxB] -= cond;
      G_matrix[idxB][idxA] -= cond;
    }
  });

  // Resolver sistema lineal. El nodo de la batería positiva está fijo a V
  // Así que resolvemos para los nodos intermedios.
  // G_sub * V_sub = I_sub
  const posIdx = sNodeToIndex[batPos];
  const knownVoltages = Array(N).fill(null);
  knownVoltages[0] = 0; // Ground
  knownVoltages[posIdx] = bat.value; // Voltaje batería

  // Resolver por sustitución/eliminación simple de Gauss para las incógnitas
  const solvedVoltages = solveEquations(G_matrix, I_vector, knownVoltages);

  if (!solvedVoltages) {
    solverMessage = 'No se pudo resolver. Revisa conexiones.';
    updateData();
    return;
  }

  // Mapear voltajes de supernodos de vuelta a los nodos físicos
  nodeSet.forEach(n => {
    const sn = superNodes[n];
    const idx = sNodeToIndex[sn];
    nodeVoltages[n] = solvedVoltages[idx] || 0;
  });

  // Calcular corrientes por rama
  components.forEach(c => {
    const v1 = nodeVoltages[`${c.x1},${c.y1}`] || 0;
    const v2 = nodeVoltages[`${c.x2},${c.y2}`] || 0;

    let I = 0;
    if (c.type === 'resistor' || c.type === 'led') {
      I = (v1 - v2) / c.value;
    } else if (c.type === 'switch') {
      I = c.closed ? (v1 - v2) / 0.1 : (v1 - v2) / 1e7;
    } else if (c.type === 'wire') {
      // Corriente en el cable se estima por Kirchhoff local
      I = (v1 - v2) / 0.01;
    } else if (c.type === 'battery') {
      // La batería entrega la suma de corrientes salientes
      I = 0;
    }
    branchCurrents[c.id] = I;
  });

  // Recalcular corriente en la batería sumando las corrientes por las resistencias conectadas a su nodo positivo
  let batCurrent = 0;
  components.forEach(c => {
    if (c.type === 'resistor' || c.type === 'led') {
      const sn1 = superNodes[`${c.x1},${c.y1}`];
      const sn2 = superNodes[`${c.x2},${c.y2}`];
      if (sn1 === batPos && sn2 !== batPos) {
        batCurrent += branchCurrents[c.id];
      }
      if (sn2 === batPos && sn1 !== batPos) {
        batCurrent -= branchCurrents[c.id];
      }
    }
  });
  branchCurrents[bat.id] = batCurrent;

  solverOk = true;
  solverMessage = `Circuito Activo. Corriente batería: ${roundTo(Math.abs(batCurrent), 3)} A`;
  updateData();
}

/**
 * Resuelve el sistema G * V = I para variables desconocidas
 */
function solveEquations(G, I, known) {
  const N = G.length;
  const A = Array.from({ length: N }, () => Array(N + 1).fill(0));

  // Rellenar matriz aumentada
  for (let i = 0; i < N; i++) {
    if (known[i] !== null) {
      A[i][i] = 1;
      A[i][N] = known[i];
    } else {
      for (let j = 0; j < N; j++) {
        A[i][j] = G[i][j];
      }
      A[i][N] = I[i];
    }
  }

  // Eliminación Gaussiana
  for (let i = 0; i < N; i++) {
    // Pivote
    let max = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < N; k++) {
      if (Math.abs(A[k][i]) > max) {
        max = Math.abs(A[k][i]);
        maxRow = k;
      }
    }

    if (max < 1e-12) continue; // Singolaridad local

    // Intercambiar filas
    const temp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = temp;

    // Hacer ceros debajo
    for (let k = i + 1; k < N; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j <= N; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
    }
  }

  // Sustitución hacia atrás
  const V = Array(N).fill(0);
  for (let i = N - 1; i >= 0; i--) {
    if (Math.abs(A[i][i]) < 1e-12) {
      V[i] = known[i] !== null ? known[i] : 0;
      continue;
    }
    V[i] = A[i][N] / A[i][i];
    for (let k = i - 1; k >= 0; k--) {
      A[k][N] -= A[k][i] * V[i];
      A[k][i] = 0;
    }
  }

  return V;
}

function updateData() {
  if (!_ui) return;
  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.6">
      <div><strong>Estado del Solver:</strong></div>
      <div style="color:${solverOk ? 'var(--success)' : 'var(--danger)'};margin-bottom:8px">${solverMessage}</div>
      <div>Componentes en el Canvas: ${components.length}</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div style="font-size:0.75rem;opacity:0.8">
        * Coloca una Pila y conecta resistencias con cables para cerrar el circuito.<br>
        * Activa el multímetro (hover) pasando el mouse sobre las resistencias.
      </div>
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;

  const tools = [
    { value: 'wire', label: 'Cable ──' },
    { value: 'battery', label: 'Pila 🔋' },
    { value: 'resistor', label: 'Resistencia ⁝⁝' },
    { value: 'led', label: 'LED 💡' },
    { value: 'switch', label: 'Interruptor ⊸' },
    { value: 'erase', label: 'Borrador 🗑' }
  ].map(t => `<button class="ctrl-btn ${t.value === activeTool ? 'primary' : ''}" id="btn_tool_${t.value}" style="flex:1;padding:6px">${t.label}</button>`).join('');

  _ui.setParams(`
    <div class="control-group">
      <label class="control-label" style="font-weight:bold">Paleta de Circuitos</label>
      <div class="btn-row" style="flex-wrap:wrap;gap:4px">
        ${tools}
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Valor Resistencia por Defecto (Ω)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_defR" min="10" max="500" step="10" value="${defaultR}">
        <span class="slider-value" id="val_defR">${defaultR} Ω</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Voltaje Pila por Defecto (V)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_defV" min="1.5" max="24" step="1.5" value="${defaultV}">
        <span class="slider-value" id="val_defV">${defaultV} V</span>
      </div>
    </div>
    <div class="control-group">
      <button class="ctrl-btn" id="btn_clear_canvas" style="width:100%">Limpiar Lienzo</button>
    </div>
  `);

  const s_defR = document.getElementById('param_defR');
  const s_defV = document.getElementById('param_defV');
  const b_clear = document.getElementById('btn_clear_canvas');

  // Vincular eventos a la paleta de herramientas
  ['wire', 'battery', 'resistor', 'led', 'switch', 'erase'].forEach(t => {
    const btn = document.getElementById(`btn_tool_${t}`);
    btn?.addEventListener('click', () => {
      // Remover active de todos
      document.querySelectorAll('.btn-row .ctrl-btn').forEach(b => b.classList.remove('primary'));
      btn.classList.add('primary');
      activeTool = t;
    });
  });

  s_defR?.addEventListener('input', (e) => {
    defaultR = parseFloat(e.target.value);
    document.getElementById('val_defR').textContent = `${defaultR} Ω`;
  });

  s_defV?.addEventListener('input', (e) => {
    defaultV = parseFloat(e.target.value);
    document.getElementById('val_defV').textContent = `${defaultV} V`;
  });

  b_clear?.addEventListener('click', () => {
    reset();
  });
}
