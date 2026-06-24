/**
 * @fileoverview Sub-módulo: Leyes de Newton con Fricción
 * Simulación de un bloque sobre un plano inclinado con fricción
 */

import { Vector2D } from '../../utils/vector2d.js';
import { roundTo } from '../../utils/math-helpers.js';

let _engine = null;
let _renderer = null;
let _ui = null;

// Parámetros
let m = 5;
let F = 15;
let thetaF = 0; // Ángulo de la fuerza respecto al plano
let mus = 0.4;
let muk = 0.3;
let thetaP = 15; // Ángulo del plano inclinado
let g = 9.81;

// Estado
let u = 2; // Posición a lo largo del plano (m)
let v = 0; // Velocidad a lo largo del plano (m/s)
let t = 0;

// Variables de salida calculadas
let W = 0;
let Wx = 0;
let Wy = 0;
let Fax = 0;
let Fay = 0;
let N = 0;
let fsMax = 0;
let friction = 0;
let netForce = 0;
let acceleration = 0;
let stateStr = 'estático';

export function init(engine, renderer, ui) {
  _engine = engine;
  _renderer = renderer;
  _ui = ui;

  // Ajustar dimensiones del mundo
  _renderer.worldWidth = 20;
  _renderer.worldHeight = 15;

  reset();

  _ui.setInfo(`
    <strong>Leyes de Newton con Fricción</strong><br>
    Un bloque sobre una superficie inclinada. El <strong>Diagrama de Cuerpo Libre (DCL)</strong> 
    muestra las fuerzas en tiempo real. 
    Observa el equilibrio estático y la transición al movimiento cinético.
  `);

  _ui.setFormulas(`
    <ul style="padding-left:18px;margin:0;line-height:1.8">
      <li><strong>Fuerza Normal:</strong> N = m·g·cos(θ_p) - F·sen(θ_f)</li>
      <li><strong>Fricción Estática Máx:</strong> f_s,max = μ_s · N</li>
      <li><strong>Fricción Cinética:</strong> f_k = μ_k · N</li>
      <li><strong>Segunda Ley:</strong> a = F_neta / m</li>
    </ul>
  `);

  updateData();
  renderParams();
}

export function reset(engine, renderer, ui) {
  u = 2;
  v = 0;
  t = 0;
  recalc();
  updateData();
}

export function destroy() {
  _engine = null;
  _renderer = null;
  _ui = null;
}

export function setTool(toolId) {
  // Sin herramientas
}

function recalc() {
  // Asegurar que muk <= mus
  if (muk > mus) {
    muk = mus;
  }

  const radF = (thetaF * Math.PI) / 180;
  const radP = (thetaP * Math.PI) / 180;

  // Peso
  W = m * g;
  Wx = W * Math.sin(radP); // cuesta abajo
  Wy = W * Math.cos(radP); // hacia el plano

  // Fuerza aplicada
  Fax = F * Math.cos(radF); // paralela al plano cuesta arriba
  Fay = F * Math.sin(radF); // perpendicular al plano hacia arriba

  // Normal
  N = Wy - Fay;
  if (N < 0) N = 0;

  // Fricción estática máxima
  fsMax = mus * N;

  // Tendencia de movimiento cuesta arriba (Fax - Wx)
  const Ftendencia = Fax - Wx;

  if (N === 0) {
    // Despegado
    stateStr = 'despegado';
    friction = 0;
    netForce = Fax - Wx;
    acceleration = netForce / m;
  } else if (v === 0) {
    // Si está quieto, evaluamos si rompe la fricción estática
    if (Math.abs(Ftendencia) <= fsMax) {
      stateStr = 'estático';
      friction = -Ftendencia; // la fricción equilibra la tendencia
      netForce = 0;
      acceleration = 0;
    } else {
      stateStr = 'en movimiento';
      const dir = Math.sign(Ftendencia);
      friction = -dir * muk * N;
      netForce = Ftendencia + friction;
      acceleration = netForce / m;
    }
  } else {
    // Si ya se está moviendo, usa fricción cinética
    stateStr = 'en movimiento';
    const dir = Math.sign(v);
    friction = -dir * muk * N;
    netForce = Ftendencia + friction;
    acceleration = netForce / m;
  }
}

export function update(dt, elapsed) {
  t = elapsed;
  recalc();

  if (stateStr === 'en movimiento' || stateStr === 'despegado') {
    v += acceleration * dt;
    u += v * dt;

    // Límites de la rampa (longitud visual 0.5 a 16.5m)
    if (u < 0.5) {
      u = 0.5;
      v = 0;
      stateStr = 'estático';
    }
    if (u > 16.5) {
      u = 16.5;
      v = 0;
      stateStr = 'estático';
    }
  }

  updateData();

  // Actualizar gráficas (cada ~3 frames)
  const app = window.app || {};
  if (app.chart && Math.round(t * 60) % 3 === 0) {
    app.chart.addDataPoint('Velocidad v(t)', t, v);
    app.chart.addDataPoint('Fuerza Neta', t, netForce);
  }
}

export function render(ctx, alpha, elapsed) {
  if (!_renderer) return;

  const r = _renderer;
  const radP = (thetaP * Math.PI) / 180;
  const startPoint = new Vector2D(-9, -5);
  const dir = new Vector2D(Math.cos(radP), Math.sin(radP));
  const normalVec = new Vector2D(-Math.sin(radP), Math.cos(radP));

  // 1. Dibujar cuña del plano inclinado
  const endPoint = startPoint.add(dir.scale(18));
  const p1 = r.worldToCanvas(startPoint.x, startPoint.y);
  const p2 = r.worldToCanvas(endPoint.x, endPoint.y);
  const p3 = r.worldToCanvas(endPoint.x, startPoint.y);

  ctx.save();
  ctx.fillStyle = 'rgba(79, 195, 247, 0.05)';
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#666';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.restore();

  // 2. Dibujar arco del ángulo del plano
  if (thetaP > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 45, 0, -radP, true);
    ctx.stroke();
    ctx.restore();
    r.drawLabel(startPoint.x + 3.2, startPoint.y + 0.8, `${thetaP}°`, { color: '#aaa', fontSize: 11 });
  }

  // 3. Posición del bloque
  const blockW = 2.4;
  const blockH = 1.6;
  const blockPos = startPoint.add(dir.scale(u)).add(normalVec.scale(blockH / 2));

  // Dibujar bloque rotado
  ctx.save();
  const pb = r.worldToCanvas(blockPos.x, blockPos.y);
  ctx.translate(pb.x, pb.y);
  ctx.rotate(-radP);
  ctx.fillStyle = stateStr === 'en movimiento' ? '#4fc3f7' : '#2b3a4a';
  ctx.fillRect(-r.worldWidth * (blockW / 2) / 20 * 12, -r.worldHeight * (blockH / 2) / 15 * 12, r.worldWidth * blockW / 20 * 12, r.worldHeight * blockH / 15 * 12);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-r.worldWidth * (blockW / 2) / 20 * 12, -r.worldHeight * (blockH / 2) / 15 * 12, r.worldWidth * blockW / 20 * 12, r.worldHeight * blockH / 15 * 12);
  ctx.restore();

  // 4. Dibujar Diagrama de Cuerpo Libre (DCL)
  // Escala visual de fuerzas: 10 N = 1.5 unidades mundo
  const fScale = 1.5 / 10;

  // Peso (rojo, vertical hacia abajo)
  r.drawVector(blockPos.x, blockPos.y, 0, -W * fScale, {
    color: '#ef5350',
    label: `W = ${roundTo(W, 1)} N`
  });

  if (N > 0.1) {
    // Normal (verde, perpendicular al plano hacia arriba)
    const normalDisp = normalVec.scale(N * fScale);
    r.drawVector(blockPos.x, blockPos.y, normalDisp.x, normalDisp.y, {
      color: '#66bb6a',
      label: `N = ${roundTo(N, 1)} N`
    });
  }

  // Fuerza aplicada (azul, ángulo thetaF respecto al plano)
  if (F > 0.1) {
    const radF_global = radP + (thetaF * Math.PI) / 180;
    const appliedVec = new Vector2D(Math.cos(radF_global), Math.sin(radF_global)).scale(F * fScale);
    r.drawVector(blockPos.x, blockPos.y, appliedVec.x, appliedVec.y, {
      color: '#4fc3f7',
      label: `F = ${roundTo(F, 1)} N`
    });
  }

  // Fricción (naranja, paralela al plano, opuesta al movimiento/tendencia)
  if (Math.abs(friction) > 0.1) {
    const frictionDisp = dir.scale(friction * fScale); // el signo de friction ya maneja la dirección
    r.drawVector(blockPos.x, blockPos.y, frictionDisp.x, frictionDisp.y, {
      color: '#ffb74d',
      label: `f = ${roundTo(Math.abs(friction), 1)} N`
    });
  }

  // 5. Indicador de estado
  ctx.save();
  ctx.fillStyle = stateStr === 'en movimiento' ? '#4fc3f7' : '#66bb6a';
  ctx.font = 'bold 13px system-ui';
  ctx.fillText(`Estado: ${stateStr.toUpperCase()}`, 20, 30);
  ctx.restore();
}

function updateData() {
  if (!_ui) return;
  const criticalAngle = Math.atan(mus) * 180 / Math.PI;

  _ui.setData(`
    <div style="font-family:var(--font-mono);font-size:0.82rem;line-height:1.8">
      <div>Estado: <strong style="color:${stateStr === 'en movimiento' ? 'var(--accent)' : 'var(--success)'}">${stateStr.toUpperCase()}</strong></div>
      <div>Peso (W = m·g): ${roundTo(W, 2)} N</div>
      <div>Fuerza Normal (N): ${roundTo(N, 2)} N</div>
      <div>Componentes Peso: Wx = ${roundTo(Wx, 2)} N | Wy = ${roundTo(Wy, 2)} N</div>
      <div>Componentes F: Fax = ${roundTo(Fax, 2)} N | Fay = ${roundTo(Fay, 2)} N</div>
      <div>Fricción Estática Máx: ${roundTo(fsMax, 2)} N</div>
      <div>Fuerza de Fricción (f): ${roundTo(Math.abs(friction), 2)} N</div>
      <div>Fuerza Neta: ${roundTo(netForce, 2)} N</div>
      <div>Aceleración (a): ${roundTo(acceleration, 3)} m/s²</div>
      <div>Velocidad (v): ${roundTo(v, 2)} m/s</div>
      <div>Ángulo Crítico Desliz: ${roundTo(criticalAngle, 1)}°</div>
    </div>
  `);
}

function renderParams() {
  if (!_ui) return;

  const matPresets = [
    { label: 'Madera s/ Madera (μs=0.5, μk=0.3)', mus: 0.5, muk: 0.3 },
    { label: 'Acero s/ Acero (μs=0.6, μk=0.4)', mus: 0.6, muk: 0.4 },
    { label: 'Caucho s/ Asfalto (μs=0.8, μk=0.7)', mus: 0.8, muk: 0.7 },
    { label: 'Hielo s/ Hielo (μs=0.1, μk=0.03)', mus: 0.1, muk: 0.03 },
    { label: 'Teflón s/ Teflón (μs=0.04, μk=0.04)', mus: 0.04, muk: 0.04 }
  ];

  const presetOptions = matPresets.map((p, idx) => 
    `<option value="${idx}">${p.label}</option>`
  ).join('');

  _ui.setParams(`
    <div class="control-group">
      <label class="control-label">Materiales (Fricción)</label>
      <select class="select-input" id="param_mat_preset" style="width:100%">
        <option value="-1">Personalizado</option>
        ${presetOptions}
      </select>
    </div>
    <div class="control-group">
      <label class="control-label">Masa m (kg)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_m" min="0.5" max="20" step="0.5" value="${m}">
        <span class="slider-value" id="val_m">${m} kg</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Fuerza Aplicada F (N)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_F" min="0" max="100" step="1" value="${F}">
        <span class="slider-value" id="val_F">${F} N</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Ángulo de Fuerza θ_f (°)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_thetaF" min="-30" max="90" step="1" value="${thetaF}">
        <span class="slider-value" id="val_thetaF">${thetaF}°</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Ángulo de Plano θ_p (°)</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_thetaP" min="0" max="60" step="1" value="${thetaP}">
        <span class="slider-value" id="val_thetaP">${thetaP}°</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Coef. Estático μ_s</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_mus" min="0" max="1.5" step="0.05" value="${mus}">
        <span class="slider-value" id="val_mus">${mus}</span>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Coef. Cinético μ_k</label>
      <div class="slider-row">
        <input type="range" class="custom-slider" id="param_muk" min="0" max="1.5" step="0.05" value="${muk}">
        <span class="slider-value" id="val_muk">${muk}</span>
      </div>
    </div>
  `);

  const s_m = document.getElementById('param_m');
  const s_F = document.getElementById('param_F');
  const s_thetaF = document.getElementById('param_thetaF');
  const s_thetaP = document.getElementById('param_thetaP');
  const s_mus = document.getElementById('param_mus');
  const s_muk = document.getElementById('param_muk');
  const s_preset = document.getElementById('param_mat_preset');

  s_m?.addEventListener('input', (e) => {
    m = parseFloat(e.target.value);
    document.getElementById('val_m').textContent = `${m} kg`;
    reset();
  });

  s_F?.addEventListener('input', (e) => {
    F = parseFloat(e.target.value);
    document.getElementById('val_F').textContent = `${F} N`;
    reset();
  });

  s_thetaF?.addEventListener('input', (e) => {
    thetaF = parseFloat(e.target.value);
    document.getElementById('val_thetaF').textContent = `${thetaF}°`;
    reset();
  });

  s_thetaP?.addEventListener('input', (e) => {
    thetaP = parseFloat(e.target.value);
    document.getElementById('val_thetaP').textContent = `${thetaP}°`;
    reset();
  });

  s_mus?.addEventListener('input', (e) => {
    mus = parseFloat(e.target.value);
    document.getElementById('val_mus').textContent = `${mus}`;
    if (muk > mus) {
      muk = mus;
      s_muk.value = muk;
      document.getElementById('val_muk').textContent = `${muk}`;
    }
    s_preset.value = "-1";
    reset();
  });

  s_muk?.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (val > mus) {
      val = mus;
      s_muk.value = val;
    }
    muk = val;
    document.getElementById('val_muk').textContent = `${muk}`;
    s_preset.value = "-1";
    reset();
  });

  s_preset?.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value);
    if (idx >= 0) {
      const p = matPresets[idx];
      mus = p.mus;
      muk = p.muk;
      s_mus.value = mus;
      s_muk.value = muk;
      document.getElementById('val_mus').textContent = `${mus}`;
      document.getElementById('val_muk').textContent = `${muk}`;
      reset();
    }
  });
}
