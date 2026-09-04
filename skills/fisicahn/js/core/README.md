# Núcleo compartido (`js/core/`)

Contrato y utilidades comunes de los módulos de simulación. Es la base sobre la
que se apoya el rediseño del canvas (escena declarativa) y la migración del
panel de datos.

## Contrato de módulo

- `sim-module.js` — `SimModule`, clase base de todo motor, y la fábrica
  `createModuleInstance(mod, ctx)` que la app usa en `loadEngineModule`.
  - El módulo exporta `default class Foo extends SimModule { … }` → se instancia
    con estado propio (frente al singleton ESM previo).
  - Un módulo legacy (functions sueltas `init/update/render/…`) se envuelve en
    `LegacyModuleAdapter` sin modificar su código: la migración es incremental.
  - Ciclo de vida protegido: `init/reset/update/render/destroy` se invocan desde
    la app dentro de `try/catch`, de modo que un error no rompe el bucle RAF.

### Métodos del contrato

| Método | Cuándo | Notas |
|---|---|---|
| `init(meta)` | Al abrir el módulo | Una sola vez; monta info, fórmulas y parámetros |
| `reset()` | Botón Reiniciar / cambiar parámetro | Vuelve al estado inicial |
| `update(dt)` | Cada timestep (hasta 5/frame) | Física pura, **sin tocar el DOM** |
| `render(ctx, alpha, elapsed)` | Cada frame | Puente actual; en WAVE 2 pasa a `draw(scene)` |
| `draw(scene)` | Cada frame (futuro) | API declarativa de WAVE 2 |
| `readout()` | ~10 Hz (host) | Datos numéricos `{value, unit}`, reemplaza `updateData()` |
| `getState()` / `setState(s)` | Guardar/restaurar trabajo | JSON serializable |
| `destroy()` | Al salir del módulo | Libera la instancia |

## Utilidades

- `trail-buffer.js` — `TrailBuffer`: buffer de estela en anillo O(1). Sustituye
  el patrón `push` + `shift()` de 6 módulos.
- `geometry.js` — `dist`, `distToSegment`, `rayExitToRect` (punto por el que
  un rayo sale de un rectángulo: prolongar rayos ópticos hasta el borde del
  encuadre), y re-exporta `clamp`, `lerp`, `mapRange`, `roundTo`, `toDeg`,
  `toRad` desde `utils/math-helpers.js`. Un solo punto de entrada bajo
  `core/`; evita copias privadas de `clamp`.
- `draw-primitives.js` — `roundRect`, `arrowHead`, `chip`, `legend`: primitivas
  de dibujo que estaban duplicadas en 3–6 módulos. `wavelengthColor(nm)` da el
  color aproximado de una longitud de onda (espectro visible, UV/IR apagados)
  y `photonPath` traza el garabato sinusoidal con flecha de un fotón; la
  escena lo expone como `scene.photon(x, y, angle, length, { color, label })`.

Regla de uso: **no** crear copias privadas de estas funciones en un módulo.
Si falta una utilidad, se añade aquí y se importa.

## Canvas (WAVE 2)

El lienzo deja de ser un `<canvas>` que se borra entero 60 veces por segundo.
Sigue habiendo **un único elemento en el DOM**; lo que cambia es lo que hay
detrás.

| Archivo | Qué aporta |
|---|---|
| `camera.js` | Escala **isotrópica** (adiós al mundo deformado en pantalla ancha), zoom anclado al cursor, pan, `follow()` interpolado, viewports rectangulares |
| `layers.js` | Capas `background` / `world` / `hud` con invalidación independiente; la rejilla pasa de ~68 operaciones por frame a 0 en régimen estacionario |
| `scene.js` | API declarativa: `scene.body(…)`, `scene.vector(…)`, `scene.hud.plot(…)`. Oculta el backend, lo que permite exportar a SVG |
| `scene.arrowMark(x, y, ángulo)` | Punta de flecha suelta sobre un punto del mundo: marca el sentido de una curva ya trazada (líneas de campo, corrientes) sin dibujar un vector entero |
| `theme.js` | Tokens de color + perfiles `dark` / `light` / `projector` / `colorSafe` |
| `interaction.js` | Rueda, pellizco, pan, picking y arrastre de objetos; `MeasureTools` reutilizable |
| `params-schema.js` | Panel construido desde `static params` |
| `scene-export.js` | PNG del lienzo y SVG vectorial (grabador del contexto 2D) |
| `compare.js` | Comparación lado a lado: dos instancias, dos viewports, un solo bucle |

### Regla dura de coordenadas

Un módulo **nunca** accede a `ctx.canvas`. En su lugar:

```js
scene.viewport()   // { x, y, w, h } SIEMPRE en px CSS
scene.world()      // { left, right, top, bottom } en unidades de mundo
```

`ctx.canvas.width` devuelve píxeles de **dispositivo**: en un móvil con DPR 1,75
es 1,75× el ancho CSS, y ése era el origen de los ocho bugs que mandaban las
leyendas fuera de pantalla. Los módulos legacy tienen la misma vía de escape en
`renderer.viewport()`.

### Cómo se ve un módulo migrado

`modules/momentum.js` es la referencia: estado en la instancia, `static params`,
`static viewport`, `draw(scene)` y `readout()` con números en vez de HTML.

```js
export default class MiModulo extends SimModule {
  static viewport = { width: 22, height: 12 };
  static params = [{ id: 'm', label: 'Masa', unit: 'kg', min: 0.1, max: 10, step: 0.1, value: 1 }];

  update(dt) { /* física pura */ }

  draw(scene) {
    scene.body(this.x, 0, { shape: 'circle', r: 0.3, color: 'mass', id: 'bola' });
    scene.vector(this.x, 0, this.v * 0.25, 0, { color: 'velocity', label: 'v' });
    scene.hud.chip(`Ec = ${roundTo(this.ec, 2)} J`, 'top-right');
  }

  onDrag(id, world) { this.x = world.x; }   // manipulación directa
  readout() { return { 'v': { value: this.v, unit: 'm/s' } }; }
}
```

Los colores son **tokens** (`'velocity'`, `'mass'`, `'force'`), nunca literales:
así el modo proyector y la paleta segura para daltonismo funcionan sin tocar el
módulo. Regla que las acompaña: **el color nunca es el único portador de
información** — debe ir con estilo de línea, etiqueta o forma.

## Primitivas compartidas (auditoría del núcleo gráfico)

Salieron de copias privadas repetidas en los módulos migrados. Regla: si un
dibujo aparece en dos módulos, vive aquí. Todas aceptan tokens de color, todas
devuelven la escena (encadenables) y todas usan un solo `save/restore`.

### Escena (`scene.*`, coordenadas de mundo)

| Primitiva | Qué dibuja | Sustituye a |
|---|---|---|
| `curve(fn, t0, t1, { samples, …polyline })` | Curva `y = f(t)` (devolver un número) o paramétrica (`fn(t, out)` escribe `out.x/out.y`), muestreada por la escena sin arrays de puntos por frame | Bucles `pts.push({x,y})` + `polyline` de em-waves, standing-waves, quantum-history, thermal-expansion |
| `dots(points, r, { color, alpha, outline, filter })` | Nube de discos iguales en un solo camino; `filter(p, i)` dibuja sólo una especie de un array mixto | 120–320 `body()` por frame en kinetic-theory; electrones en vuelo de de-broglie |
| `ground(x1, x2, y, opts)` / `ceiling(…)` | Línea de apoyo con rayado por debajo / por encima | Suelo de projectile, mass-weight, inclined-plane, oscillatory; techo de pendulum y statics |
| `wall(x, y1, y2, { side: 'left'\|'right' })` | Pared vertical con rayado hacia el lado sólido | Pared de oscillatory y thermal-expansion |
| `axes({ x, y, tick, tickSize, tickColor })` | Ejes cartesianos con marcas, en dos trazos | ~70 `line` por frame en hyperbola; ejes de vectors |
| `grid(step, { color, width, alpha })` | Rejilla de mundo en un solo trazo | ~100 `line` por frame en vectors |
| `thermometer(x, yBase, h, t, { color, tube, width, ticks, marks })` | Tubo + columna proporcional a `t ∈ [0,1]` + bulbo, con escala (`ticks`) y referencias (`marks`, p. ej. T_eq) | Termómetro a mano de calorimetry |
| `bars(x, yBase, items, { max, hMax, barW, gap, frame, labelSize, labelOffset })` | Barras verticales comparativas desde una línea base | Barras de peso por astro (mass-weight) e intensidades I₁/I₂ (em-waves) |
| `gradientRect(x, y, w, h, { from, to, stops, direction, alpha })` | Rectángulo centrado con degradado lineal; cae a bandas si el backend no tiene degradados (el SVG aplana al color medio) | 48 bandas de fondo + 10 bandas de sombreado cilíndrico en thermal-expansion |
| `flame(x, y, { h, w, t, outer, mid, core, halo })` | Llama de tres capas con parpadeo por tiempo y halo cálido | Llama de thermal-expansion |
| `coil(cx, cy, loops, r, { color, spacing, horizontal })` | Bobina de espiras apiladas en un trazo | `_coil` de induction |
| `flow(x0, y0, x1, y1, { amps, color, r, t })` | Puntos de corriente animados (densidad y velocidad ∝ \|amps\|, signo = sentido) | `_flow` de circuits (16 `body` con degradado por tramo) |
| `rayTo(x0, y0, ix, iy, { virtual, overshoot, solid, back, dash })` | Rayo hacia una imagen: sólido que la cruza (real) o sólido + prolongación punteada (virtual) | `_rayToImage` (mirrors) y `_segToImage` (optical-instruments) |
| `intensityStrip(x, y0, y1, w, values, { gamma, colorAt })` | Franja vertical de celdas coloreadas por intensidad | 121 `rect` por frame en wave-optics |

Además, `hud.plot` acepta **series por función**: `{ fn: (x) => y, samples }`
se muestrea sobre el rango X (`xRange` o el autoescalado) en un búfer plano
reutilizado — así las curvas analíticas (i(t) y V_c(t) de circuits, T(t) y
T(Q) de calorimetry, V₁/V₂ de induction, I(r) de sound, cos²θ de em-waves) ya
no construyen un array de objetos por frame. Todas las primitivas de puntos
(`polyline`, `path`, `trail`, `dots`, `plot`) aceptan también arrays tipados
planos (`Float64Array`), que es el formato recomendado para caches de módulo.

`geometry.js` añade `smoothstep(edge0, edge1, x)` (easing de Hermite) para las
animaciones de aparición.

### Costes por frame que el núcleo ya no paga

- `pointList` reutiliza tres adaptadores estáticos y lee el `TrailBuffer` con
  `get(i)`: antes creaba un objeto + clausura por llamada y copiaba el anillo
  entero con `toArray()` cada frame.
- `font()` cachea la cadena por (tamaño, peso, escala); `label` y `chip` miden
  y pintan dentro de un solo `save/restore` (antes dos por etiqueta).
- `body()` cachea el degradado radial por (color, radio a ½ px) y lo invalida
  al cambiar de contexto: un gas de 300 moléculas pasaba de 300
  `createRadialGradient` por frame a 0.
- `_style` usa un `[]` congelado compartido para `setLineDash` en vez de
  allocar uno por primitiva.
- `findFreeBox` prueba los cuatro candidatos sobre una caja de trabajo y sin
  clausuras: 60 etiquetas con `avoid` pasan de 0,31 a 0,17 ms por frame. El
  registro `_labelBoxes` (del que dependen los tests de legibilidad) no cambia.
- `hatchLine` traza todas las rayas en un único `stroke()`.
- `Scene.beginFrame` propaga `elapsed` a las tres superficies: `fill` con
  `waves`, `flame` y `flow` animan sin que el módulo pase el tiempo.

Patrones que un módulo debe evitar (y que ya no quedan en los migrados):
`push` + `shift()` en historiales (usar `TrailBuffer`, que `plot` acepta
directamente), `new Set(arr.map(…))` o `Math.max(...arr.map(…))` en `draw`,
histogramas recalculados 60 veces por segundo (kinetic-theory los refresca
cada 0,1 s), y curvas estáticas remuestreadas por frame (nuclear-energy,
hyperbola y wave-optics las cachean por clave de parámetros).
