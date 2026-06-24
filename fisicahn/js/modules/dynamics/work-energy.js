/**
 * @fileoverview Sub-módulo: Trabajo, Energía y Potencia
 * Objeto deslizándose en una rampa con conservación y disipación de energía
 */

import { Vector2D } from '../../utils/vector2d.js';
import { roundTo } from '../../utils/math-helpers.js';

let _engine = null;
let _renderer = null;
let _ui = null;

// Parámetros
let m = 2; // kg
let muk = 0.05; // Coeficiente de fricción
let g = 9.81;
let rampType = 'slide';

// Estado
let pos = 0.1; // Posición normalizada a lo largo de la rampa [0..1]
let velocity = 0; // Velocidad tangencial (m/s)
let height = 0; // Altura actual (m)
let t = 0;
let dissipatedEnergy = 0; // Energía perdida por fricción (J)
let initialEnergy = 0;

// Perfil de la rampa: array de { x, y, h, slope, angle }
let rampProfile = [];
const N_RAMP = 200;

// Mouse drag state
let isDraggingSphere = false;
const listeners = {};

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  // Ajustar dimensiones del mundo
  _renderer.worldWidth = 24;
  _renderer.worldHeight = 18; // origen en el centro, suelo en Y = -6

  generateRamp(rampType);
  reset();

  _ui.setInfo(`
    <strong>Trabajo, Energía y Potencia</strong><br>
    Suelta la bola desde cualquier punto de la rampa (puedes arrastrarla con el mouse). 
    Observa el intercambio de <strong>Energía Cinética (Ec)</strong> y <strong>Energía Potencial (Ep)</strong>. 
    Activa la fricción para ver la disipación de energía mecánica (Em).
  `);

  _ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>Energía Cinética:</strong> Ec = ½·m·v²</li>
      <li><strong>Energía Potencial:</strong> Ep = m·g·h</li>
      <li><strong>Energía Mecánica:</strong> Em = Ec + Ep</li>
      <li><strong>Trabajo de Fricción:</strong> W_fr = -f_k · d = -μ_k · N · d</li>
      <li><strong>Conservación:</strong> Em,i = Em,f + |W_fr|</li>
    </ul>
  `);

  updateData();
  renderParams();

  // Registrar interacción de arrastre
  setupRampInteraction();
}

function generateRamp(type) {
  rampProfile = [];
  const startX = -10;
  const endX = 10;
  const groundY = -6;

  for (let i = 0; i <= N_RAMP; i++) {
    const frac = i / N_RAMP;
    const x = startX + frac * (endX - startX);
    let h = 0;

    switch (type) {
      case 'valley':
        h = 10 * (1 - Math.sin(frac * Math.PI)) + 1;
        break;
      case 'hill':
        h = 9 * Math.sin(frac * Math.PI) + 1;
        break;
      case 'slide':
        h = 12 * (1 - frac) + 1;
        break;
      case 'rollercoaster':
        h = 5 * Math.sin(frac * Math.PI * 2) + 7;
        if (h < 1) h = 1;
        break;
    }

    const y = groundY + h;
    rampProfile.push({ x, y, h });
  }

  // Calcular pendientes y ángulos
  for (let i = 0; i <= N_RAMP; i++) {
    let slope = 0;
    if (i === 0) {
      slope = (rampProfile[1].y - rampProfile[0].y) / (rampProfile[1].x - rampProfile[0].x);
    } else if (i === N_RAMP) {
      slope = (rampProfile[N_RAMP].y - rampProfile[N_RAMP - 1].y) / (rampProfile[N_RAMP].x - rampProfile[N_RAMP - 1].x);
    } else {
      slope = (rampProfile[i + 1].y - rampProfile[i - 1].y) / (rampProfile[i + 1].x - rampProfile[i - 1].x);
    }
    rampProfile[i].slope = slope;
    rampProfile[i].angle = Math.atan(slope);
  }
}

function getRampPoint(p) {
  const idx = p * N_RAMP;
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, N_RAMP);
  const frac = idx - i0;

  const pt0 = rampProfile[i0];
  const pt1 = rampProfile[i1];

  return {
    x: pt0.x * (1 - frac) + pt1.x * frac,
    y: pt0.y * (1 - frac) + pt1.y * frac,
    h: pt0.h * (1 - frac) + pt1.h * frac,
    angle: pt0.angle * (1 - frac) + pt1.angle * frac
  };
}

export function reset(engine, renderer, ui) {
  pos = 0.1;
  velocity = 0;
  t = 0;
  dissipatedEnergy = 0;
  const pt = getRampPoint(pos);
  height = pt.h;
  initialEnergy = m * g * height;
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
  // Sin herramientas
}

export function update(dt, elapsed) {
  if (isDraggingSphere) return;

  t = elapsed;
  const pt = getRampPoint(pos);
  height = pt.h;
  const angle = pt.angle;

  // Fuerzas tangenciales a la rampa
  // Componente del peso cuesta abajo: -m * g * sen(θ)
  const fGrav = -m * g * Math.sin(angle);

  // Fricción normal: N = m * g * cos(θ)
  const N = m * g * Math.cos(angle);
  const fFric = velocity !== 0 ? -Math.sign(velocity) * muk * N : 0;

  // Aceleración tangencial
  const acceleration = (fGrav + fFric) / m;

  // Integrar
  velocity += acceleration * dt;

  // Calcular energía disipada
  if (velocity !== 0) {
    const ds = Math.abs(velocity * dt);
    dissipatedEnergy += muk * N * ds;
  }

  // Longitud de rampa es aproximadamente 20m en la horizontal.
  // Dividimos el movimiento en X por el largo para actualizar la posición normalizada.
  const dx = velocity * dt * Math.cos(angle);
  pos += dx / 20;

  // Rebote suave en los bordes
  if (pos < 0.002) {
    pos = 0.002;
    velocity = -velocity * 0.4; // amortiguación
  }
  if (pos > 0.998) {
    pos = 0.998;
    velocity = -velocity * 0.4;
  }

  updateData();

  // Actualizar gráficas (cada ~3 frames)
  const app = window.app || {};
  const Ec = 0.5 * m * velocity * velocity;
  const Ep = m * g * height;
  if (app.chart && Math.round(t * 60) % 3 === 0) {
    app.chart.addDataPoint('Ec (Cinética)', t, Ec);
    app.chart.addDataPoint('Ep (Potencial)', t, Ep);
    app.chart.addDataPoint('Em (Mecánica)', t, Ec + Ep);
  }
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;
  const pt = getRampPoint(pos);
  const objW = r.worldWidth;
  const objH = r.worldHeight;

  // 1. Dibujar rampa (como un polígono relleno)
  ctx.save();
  ctx.fillStyle = 'rgba(26, 26, 62, 0.9)'; // rampa azul oscuro
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const startCanvas = r.worldToCanvas(rampProfile[0].x, -6);
  ctx.moveTo(startCanvas.x, startCanvas.y);
  for (const p of rampProfile) {
    const pc = r.worldToCanvas(p.x, p.y);
    ctx.lineTo(pc.x, pc.y);
  }
  const endCanvas = r.worldToCanvas(rampProfile[N_RAMP].x, -6);
  ctx.lineTo(endCanvas.x, endCanvas.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 2. Dibujar esfera rodante
  // Sumar radio a la normal para que ruede sobre la superficie, no al centro
  const radius = 0.8;
  const normalVec = new Vector2D(-Math.sin(pt.angle), Math.cos(pt.angle));
  const spherePos = new Vector2D(pt.x, pt.y).add(normalVec.scale(radius));

  r.drawObject(spherePos.x, spherePos.y, {
    shape: 'circle',
    size: radius,
    color: '#ff8c00',
    label: `h = ${roundTo(pt.h, 1)}m`
  });

  // 3. Dibujar barras de energía directamente en el canvas (arriba a la izquierda)
  drawEnergyHUD(ctx);

  // 4. Indicador de tiempo
  ctx.save();
  ctx.font = '14px monospace';
  ctx.fillStyle = '#e0e0e0';
  ctx.fillText(`Tiempo: ${roundTo(t, 2)}s`, 20, 30);
  ctx.restore();
}

function drawEnergyHUD(ctx) {
  const r = _renderer;
  const startX = 30;
  const startY = 160;
  const barW = 25;
  const maxBarH = 80;

  const Ec = 0.5 * m * velocity * velocity;
  const Ep = m * g * height;
  const Em = Ec + Ep;

  const maxVal = Math.max(initialEnergy, 10);
  const scale = maxBarH / maxVal;

  const bars = [
    { name: 'Ec', val: Ec, color: '#ef5350' },
    { name: 'Ep', val: Ep, color: '#4fc3f7' },
    { name: 'Em', val: Em, color: '#66bb6a' },
    { name: 'Edis', val: dissipatedEnergy, color: '#ffb74d' }
  ];

  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 26, 0.8)';
  ctx.fillRect(startX - 15, startY - maxBarH - 35, 175, maxBarH + 60);

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(startX - 15, startY - maxBarH - 35, 175, maxBarH + 60);

  ctx.fillStyle = '#e0e0e0';
  ctx.font = 'bold 11px system-ui';
  ctx.fillText('ENERGÍA (J)', startX, startY - maxBarH - 18);

  bars.forEach((b, idx) => {
    const x = startX + idx * 40;
    const h = b.val * scale;

    // Fondo barra
    ctx.fillStyle = '#111';
    ctx.fillRect(x, startY - maxBarH, barW, maxBarH);

    // Barra rellena
    ctx.fillStyle = b.color;
    ctx.fillRect(x, startY - Math.min(h, maxBarH), barW, Math.min(h, maxBarH));

    // Borde barra
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(x, startY - maxBarH, barW, maxBarH);

    // Texto
    ctx.fillStyle = b.color;
    ctx.font = '10px monospace';
    ctx.fillText(b.name, x + 4, startY + 16);
    ctx.font = '9px monospace';
    ctx.fillText(`${Math.round(b.val)}`, x, startY - Math.min(h, maxBarH) - 4);
  });
  ctx.restore();
}

function setupRampInteraction() {
  listeners.onMouseDown = (e) => {
    const mousePos = _renderer.getMousePos(e);
    const pt = getRampPoint(pos);
    const normalVec = new Vector2D(-Math.sin(pt.angle), Math.cos(pt.angle));
    const spherePos = new Vector2D(pt.x, pt.y).add(normalVec.scale(0.8));

    const dist = Math.hypot(mousePos.x - spherePos.x, mousePos.y - spherePos.y);
    if (dist < 2.5) { // Clic cerca de la bola
      isDraggingSphere = true;
      _engine.pause();
    }
  };

  listeners.onMouseMove = (e) => {
    if (!isDraggingSphere) return;
    const mousePos = _renderer.getMousePos(e);
    // Convertir coordenada mouse X a pos [0..1]
    let t_new = (mousePos.x - (-10)) / 20;
    t_new = Math.max(0.01, Math.min(0.99, t_new));
    pos = t_new;
    velocity = 0;
    dissipatedEnergy = 0;

    const pt = getRampPoint(pos);
    height = pt.h;
    initialEnergy = m * g * height;

    updateData();
  };

  listeners.onMouseUp = () => {
    isDraggingSphere = false;
  };

  // Touch support
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

  const canvas = _renderer.canvas;
  canvas.addEventListener('mousedown', listeners.onMouseDown);
  canvas.addEventListener('mousemove', listeners.onMouseMove);
  window.addEventListener('mouseup', listeners.onMouseUp);
  canvas.addEventListener('touchstart', listeners.onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', listeners.onTouchMove, { passive: true });
  window.addEventListener('touchend', listeners.onTouchEnd);
}

function updateData() {
  if (!_ui) return;
  const Ec = 0.5 * m * velocity * velocity;
  const Ep = m * g * height;
  const Em = Ec + Ep;

  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.8">
      <div>Masa del Cuerpo: ${m} kg</div>
      <div>Coef. Fricción μ_k: ${muk}</div>
      <div>Gravedad (g): ${g} m/s²</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div>Tiempo (t): ${roundTo(t, 2)} s</div>
      <div>Altura (h): ${roundTo(height, 2)} m</div>
      <div>Velocidad (v): ${roundTo(Math.abs(velocity), 2)} m/s</div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:8px 0">
      <div>Energía Cinética (Ec): ${roundTo(Ec, 1)} J</div>
      <div>Energía Potencial (Ep): ${roundTo(Ep, 1)} J</div>
      <div>Energía Mecánica (Em): ${roundTo(Em, 1)} J</div>
      <div>Energía Disipada (Edis): ${roundTo(dissipatedEnergy, 1)} J</div>
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;

  const rampOptions = [
    { value: 'slide', label: 'Rampa de Bajada 📉' },
    { value: 'valley', label: 'Valle en U 📈📉' },
    { value: 'hill', label: 'Colina 📈' },
    { value: 'rollercoaster', label: 'Montaña Rusa 🎢' }
  ].map(r => `<option value="${r.value}" ${r.value === rampType ? 'selected' : ''}>${r.label}</option>`).join('');

  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Forma de la Rampa</label>
      <select class="select-input" id="param_ramp_type" style="width:100%">
        ${rampOptions}
      </select>
    </div>
    <div class="control-group">
      <label class="control-label">Masa m (kg)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_m" min="0.5" max="10" step="0.5" value="${m}">
        <span class="slider-value" id="val_m">${m} kg</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Fricción Cinética μ_k</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_muk" min="0" max="0.5" step="0.01" value="${muk}">
        <span class="slider-value" id="val_muk">${muk}</span>
      </div>
    </div>
  `);

  const s_ramp = document.getElementById('param_ramp_type');
  const s_m = document.getElementById('param_m');
  const s_muk = document.getElementById('param_muk');

  s_ramp?.addEventListener('change', (e) => {
    rampType = e.target.value;
    generateRamp(rampType);
    reset();
  });

  s_m?.addEventListener('input', (e) => {
    m = parseFloat(e.target.value);
    document.getElementById('val_m').textContent = `${m} kg`;
    reset();
  });

  s_muk?.addEventListener('input', (e) => {
    muk = parseFloat(e.target.value);
    document.getElementById('val_muk').textContent = `${muk}`;
    // La fricción se puede cambiar en vivo sin reiniciar la rampa
  });
}
