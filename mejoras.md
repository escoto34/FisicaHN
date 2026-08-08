# FísicaHN — Plan de mejoras por WAVEs

> Documento de arquitectura y hoja de ruta.
> Base analizada: commit `3c9c43d`, 182 archivos, ~210k palabras, 2 345 nodos de grafo.
> Toda afirmación cita `archivo:línea`. La copia de referencia para el análisis es
> `skills/fisicahn/` (ver §1.1: es la **fuente de la verdad** del proyecto).

---

## Índice

- [0. Resumen ejecutivo](#0-resumen-ejecutivo)
- [1. Diagnóstico de arquitectura](#1-diagnóstico-de-arquitectura)
- [2. Redundancias encontradas](#2-redundancias-encontradas)
- [3. Temas de física: inventario y deduplicación](#3-temas-de-física-inventario-y-deduplicación)
- [WAVE 0 — Higiene del repositorio](#wave-0--higiene-del-repositorio) ✅
- [WAVE 1 — Contrato de módulo y núcleo compartido](#wave-1--contrato-de-módulo-y-núcleo-compartido) ✅
- [WAVE 2 — Rediseño del canvas ★](#wave-2--rediseño-del-canvas-) ✅ — [balance](#210-lo-que-quedó-hecho)
- [WAVE 3 — Rendimiento y uso de recursos](#wave-3--rendimiento-y-uso-de-recursos) ✅ — [balance](#310-lo-que-quedó-hecho)
- [WAVE 4 — Catálogo por categorías y navegación](#wave-4--catálogo-por-categorías-y-navegación) ✅ — [balance](#410-lo-que-quedó-hecho)
- [WAVE 5 — Nuevos módulos de física](#wave-5--nuevos-módulos-de-física)
- [WAVE 6 — Base de datos y backend](#wave-6--base-de-datos-y-backend)
- [WAVE 7 — Herramientas y calidad](#wave-7--herramientas-y-calidad)
- [WAVE 8 — Capa pedagógica](#wave-8--capa-pedagógica)
- [WAVE 9 — Funciones docentes y distribución](#wave-9--funciones-docentes-y-distribución)
- [WAVE 10 — Auditoría de encuadre de los motores 5.1/5.2](#wave-10--auditoría-de-encuadre-y-corrección-de-los-motores-5152) ✅
- [WAVE 11 — Iconos SVG en el catálogo y el tocador](#wave-11--iconos-svg-en-el-catálogo-y-el-tocador) ✅
- [WAVE 12 — Paleta de la landing y catálogo sin secciones](#wave-12--paleta-de-la-landing-y-catálogo-sin-secciones) ✅
- [WAVE 13 — Legibilidad visual de 16 módulos](#wave-13--legibilidad-visual-de-16-módulos) ✅
- [WAVE 14 — Controles funcionales en todos los módulos](#wave-14--controles-funcionales-en-todos-los-módulos)
- [WAVE 15 — Las gráficas se dibujan en el motor](#wave-15--las-gráficas-se-dibujan-en-el-motor)
- [WAVE 16 — Panel derecho: orden y estética](#wave-16--panel-derecho-orden-y-estética)
- [WAVE 17 — Origen centrado, encuadre inicial y espacio infinito](#wave-17--origen-centrado-encuadre-inicial-y-espacio-infinito)
- [WAVE 18 — Cámara lenta real: velocidad desacoplada de los FPS](#wave-18--cámara-lenta-real-velocidad-desacoplada-de-los-fps)
- [Anexo A — Métricas de referencia](#anexo-a--métricas-de-referencia)
- [Anexo B — Decisiones tomadas](#anexo-b--decisiones-tomadas)

---

## 0. Resumen ejecutivo

FísicaHN es un simulador de física educativo en **JavaScript ES modules nativo, sin
bundler, sin dependencias y sin build step**, distribuido en cuatro formatos (web,
ZIP offline, Electron, APK Android) desde un único código fuente. Esa decisión es
acertada y este plan **no la toca**: ninguna WAVE introduce un bundler ni un
framework.

El proyecto tiene 27 motores de física funcionando, un sistema de examen en vivo
con Supabase y un catálogo navegable. Los problemas no son de concepto sino de
**capas que nunca se formalizaron**: no hay contrato de módulo, el `Renderer` cubre
sólo el 10 % del dibujo real, y el panel de datos se reescribe con `innerHTML` hasta
300 veces por segundo.

### Los cinco problemas dominantes

| # | Problema | Evidencia | WAVE |
|---|---|---|---|
| 1 | **76 archivos generados versionados en git** (`website/sim/`) | CI los regenera con `rm -rf` (`build-website.sh:16`) | 0 |
| 2 | **`ui.setData()` a 60–300 Hz** con `innerHTML` + 3× `querySelectorAll` | 22 de 28 módulos lo llaman desde `update()` | 3 |
| 3 | **90 % del dibujo es `ctx` crudo** (856 llamadas vs 91 primitivas) | `lenses.js` 140 `ctx.*` y 0 primitivas | 2 |
| 4 | **Sin contrato de módulo**: duck-typing con `typeof` × 13 métodos | `app.js:680-694` | 1 |
| 5 | **`schema.sql` no garantiza su propio esquema** al re-ejecutarse | `add column if not exists` sin `set not null`, 3 bloques que se tragan errores | 6 |

### Orden recomendado

WAVE 0 y 1 son **prerrequisitos duros**: sin fuente única no tiene sentido refactorizar
(habría que hacerlo dos veces), y sin contrato de módulo el rediseño del canvas no
tiene dónde apoyarse. WAVE 2 y 3 se solapan de forma natural. WAVE 5 (temas nuevos)
depende de WAVE 1 + 2 + 4: escribir 19 módulos nuevos **antes** del refactor
multiplicaría por 1,5 el trabajo de migración.

```
WAVE 0 ──► WAVE 1 ──┬──► WAVE 2 ──► WAVE 3
                    │       │         │
                    │       └──► WAVE 9 (proyector, comparación, grabación, PWA)
                    │                 │
                    └──► WAVE 4 ──────┴──► WAVE 5 ──► WAVE 8
WAVE 6 (independiente)
WAVE 7 (transversal, arranca con WAVE 1)
```

**Alcance decidido** (ver [Anexo B](#anexo-b--decisiones-tomadas)): las cuatro
herramientas de calidad entran en WAVE 7; las cuatro funciones nuevas dejan de ser
candidatas y se planifican en WAVE 2 y WAVE 9; WAVE 6 incluye el sistema de
migraciones completo; WAVE 5 llega a **46 módulos**.

### Estado de ejecución

| WAVE | Estado | Commit |
|---|---|---|
| 0 — Higiene del repositorio | ✅ Hecha | `01a456e` |
| 1 — Contrato de módulo | ✅ Hecha | `4f34fb3` |
| 2 — Rediseño del canvas ★ | ✅ Hecha | `ae7d80a` |
| 3 — Rendimiento | ✅ Hecha | — |
| 4 — Catálogo y buscador | Pendiente | — |
| 5 — Nuevos módulos | Pendiente | — |
| 6 — Base de datos | Pendiente | — |
| 7 — Herramientas y calidad | Pendiente | — |
| 8 — Capa pedagógica | Pendiente | — |
| 9 — Funciones docentes | Pendiente | — |
| 10 — Auditoría de encuadre 5.1/5.2 | ✅ Hecha | `4e48d5b` |
| 11 — Iconos SVG | ✅ Hecha | `3a4a2e2` |
| 12 — Paleta de la landing y catálogo sin secciones | ✅ Hecha | — |

Tres de los cinco problemas dominantes están cerrados: el **#1** (archivos generados
 versionados) en la WAVE 0, el **#4** (sin contrato de módulo) en la WAVE 1 y el **#3**
(90 % del dibujo con `ctx` crudo) en la WAVE 2 — con la salvedad de que la WAVE 2
construye la escena declarativa y migra dos módulos, pero **los 26 restantes siguen
dibujando con `ctx` crudo** a través del adaptador. Ver [§2.10](#210-lo-que-quedó-hecho).

El **#2** (`ui.setData()` a 60–300 Hz) quedó cerrado en la WAVE 3 mediante throttle del
host a 10 Hz (§3.1) — con el matiz de que 21 módulos siguen generando su propio HTML y la
migración total a `readout()` es trabajo por módulo. Sigue abierto el **#5** (`schema.sql`,
WAVE 6). Ver [§3.10](#310-lo-que-quedó-hecho).

---

## 1. Diagnóstico de arquitectura

### 1.1 Topología real: una fuente, tres destinos generados

```
skills/fisicahn/          ← FUENTE DE LA VERDAD (76 archivos en git)
   │
   ├─ scripts/build-website.sh:16  rm -rf website/sim && rsync
   │     └──► website/sim/         ← generado … pero 76 archivos EN GIT ⚠
   │
   ├─ desktop/scripts/sync-app.sh:5
   │     └──► desktop/app/         ← generado, gitignored ✓
   │
   └─ mobile/scripts/sync-www.sh:5
         └──► mobile/www/          ← generado, gitignored ✓
```

`.gitignore:29` ignora `desktop/app/` y `.gitignore:40` ignora `mobile/www/`, pero
`website/sim/` **no está ignorado**. El workflow `.github/workflows/deploy-pages.yml`
ejecuta `./scripts/build-website.sh`, que empieza con `rm -rf "$SIM"` — de modo que
lo que está en git se destruye y se regenera en cada despliegue. Los 76 archivos
versionados no aportan nada y duplican cada cambio.

**Verificado:** `diff -rq skills/fisicahn website/sim` → única diferencia
`supabase-config.js`, que además está gitignored (`.gitignore:19-23`).

### 1.2 Capas del simulador

| Capa | Archivo | Líneas | Rol real |
|---|---|---|---|
| Orquestador | `js/app.js` | 1 645 | Routing hash, catálogo, carga de motores, glue engine↔renderer↔UI |
| Bucle | `js/physics-engine.js` | 392 | RAF, timestep fijo 1/60 con acumulador, DPR, resize |
| Dibujo | `js/renderer.js` | 496 | Conversión mundo↔canvas + 5 primitivas |
| UI de módulo | `js/module-ui.js` | 694 | Paneles HTML, KaTeX, shim de compatibilidad |
| Motores | `js/modules/*.js` | 8 331 | 27 motores + placeholder |
| Persistencia | `js/works.js` + `works-panel.js` | 1 689 | Trabajos, integridad, sync docente |
| Auth/nube | `js/auth.js` + `supabase-client.js` | 1 497 | Sesión, examen en vivo, Supabase |

### 1.3 Lo que funciona bien (no tocar)

- **Timestep fijo con acumulador y sub-stepping** (`physics-engine.js:367-379`) con
  clamp anti-death-spiral (`MAX_FRAME_TIME = 0.1`, línea 9). Es correcto.
- **Carga perezosa por `import()` dinámico** (`app.js:671`) — code splitting real sin
  bundler. `challenges.js` y `works-panel.js` también son diferidos.
- **KaTeX cargado bajo demanda** con promesa memoizada (`module-ui.js:18-49`).
- **Gráficas SVG ya throttleadas** a 10 Hz (`app.js:117-118`, `CHART_MIN_MS = 100`).
  El patrón correcto ya existe — sólo no se aplicó al panel de datos.
- **Heurística DPR adaptativa** (`physics-engine.js:190`): tope 1,75 en táctil y 2 en
  escritorio, con límite de textura 2048/4096. Bien pensado para gama baja.
- **RLS de Supabase sin `WITH CHECK true`** — el endurecimiento ya se hizo
  (`schema.sql:236-247`). El insert anónimo valida 7 condiciones.

### 1.4 Deudas estructurales

**No hay contrato de módulo.** El "contrato" son 13 métodos probados con
`typeof x === 'function'` en `app.js:680-694`. Consecuencias medidas:

- `reset()` se invoca con 3 argumentos (`app.js:847`) pero se declara con 0, 1, 2 y 3
  según el módulo (`whiteboard.js:491` vs `kinematics.js:91` vs `dynamics.js:79`).
- `getCharts()` existe en **1 de 28** módulos; `setUnbounded()` en 4 y `getUnbounded()`
  en 3 — asimetría en `dynamics.js`.
- `setTool()` está declarado en 25 módulos y **19 son cuerpos vacíos**.
- Sólo `init()` está en try/catch (`app.js:699`). Una excepción en `update()` o
  `render()` **rompe el bucle RAF** de forma permanente.

**Los módulos son singletons.** El estado vive en `let` de nivel de módulo
(`kinematics.js:17-29`) y la caché ESM devuelve siempre el mismo namespace
(`app.js:672`). `destroy()` sólo hace `delete` del mapa (`app.js:638`); la memoria
persiste. Esto **bloquea** cualquier funcionalidad de comparación lado a lado.

**El `Renderer` no renderiza.** Recuento sobre los 28 módulos:

| | llamadas |
|---|---|
| `ctx.*` crudas dentro de módulos | **856** |
| `drawObject` + `drawVector` + `drawLabel` | **91** |
| `worldToCanvas` (convertir y seguir con `ctx` crudo) | 123 |

Es una librería de conversión de coordenadas, no un renderer. Y por eso **no existe
tema, ni modo alto contraste, ni exportación, ni un cambio global de estilo**.

---

## 2. Redundancias encontradas

### 2.1 Nivel repositorio

| Redundancia | Tamaño | Acción |
|---|---|---|
| `website/sim/` versionado siendo artefacto de build | 76 archivos, 1,3 MB | Ignorar en git (WAVE 0) |
| `katex.min.js` + fuentes duplicados en cada copia | ~1 MB × 4 copias | Fuente única; las copias las hace el script |
| `data/challenges/*.json` — 4 archivos nunca leídos | 5 archivos | `CHALLENGE_ENGINES = {}` está vacío (`challenges.js:11`); nada los hace `fetch`. Convertir en semilla real o borrar (WAVE 8) |
| `implementation_plan.md` desactualizado | 29 KB | Describe 18 módulos con 3 pestañas de nivel; el código tiene 27 sin pestañas. Rutas citadas (`js/core/physics-engine.js`) no existen |

### 2.2 Nivel código — duplicación literal entre módulos

| Helper duplicado | Copias | Ubicaciones |
|---|---|---|
| **Buffer de estela** (`push` + `shift()` con tope) | **6** | `kinematics.js:158`, `dynamics.js:148`, `force-kinetic.js:103`, `gravity.js:90`, `magnetic.js:185`, `particles.js:120` |
| **Bucle de dibujo de estela** | **5** | `kinematics.js:189-201`, `dynamics.js:179-190`, `gravity.js:110-120`, `particles.js:151-160`, `force-kinetic.js:147-155` |
| **`roundRect`** (polyfill / guard / nativo) | **6** | `friction.js:421-430`, `lenses.js:164`, `magnetic.js:229`, `optics.js:282`, `photoelectric.js:272`, `renderer.js:450` |
| **Punta de flecha** (misma trigonometría, 4 firmas) | **5** | `renderer.js:388`, `optics.js:191`, `lenses.js:98`, `whiteboard.js:379`, `circuits.js:216` |
| **`chip()`** (badge con `roundRect` + `measureText`) | **3** | `lenses.js:219`, `magnetic.js:221`, `optics.js:277` |
| **Bloque de leyenda** | **3** | `optics.js:384`, `magnetic.js:372`, `lenses.js:440` |
| **`clamp`** (copias privadas) | **3** | `renderer.js:12`, `module-ui.js:617`, más el export sin usar en `math-helpers.js:23` |
| **`renderParams()`** privada | **27** | todos menos `placeholder.js` |
| **`updateData()`** privada | **22** | ver WAVE 3 |
| **`resetState()`** | **10** | `circuits.js:62` y 9 más |
| **`setTool()` vacío** | **19** | `circuits.js:75`, `optics.js:183`, `lenses.js:72`… |
| **Boilerplate `let _engine,_renderer,_ui` + `destroy()`** | **28** | todos |
| **`setTimeout(…, 0)` para bindear tras `setParams`** | **~27** | `kinematics.js:263`, `optics.js:531`, `circuits.js:376` |

> **Aclaración sobre `roundTo()`.** El grafo de conocimiento lo señaló con 70 aristas
> sobre 24 módulos, pero **no está duplicado**: se define una vez en
> `utils/math-helpers.js:65` y lo importan 26 módulos. Es el único helper compartido
> con éxito del proyecto — el modelo a replicar, no un problema.

**Estimación:** entre 1 500 y 2 500 líneas eliminables de las ~8 300 de `js/modules/`.

### 2.3 Redundancia de mecanismos (la más cara de mantener)

`enhanceParamsPanel()` (`module-ui.js:518-662`, 145 líneas) existe sólo para
reconciliar **tres sistemas de controles superpuestos**:

1. `paramControl()` + `bindParamControls()` — 13 módulos.
2. HTML crudo escrito a mano con `<input type="range">` — 15 módulos.
3. Un `<span>` legacy de valor que se lee con `getElementById(...).textContent`.

Para que (3) siga funcionando sobre un `<input>` inyectado, el código hace
`Object.defineProperty(num, 'textContent', {get, set})` — **monkey-patching de una
propiedad del DOM** (`module-ui.js:583-592`) — y dispara `new Event('input')`
sintético para reactivar los listeners del módulo (línea 645). Es deuda técnica que
se paga en cada módulo nuevo.

---

## 3. Temas de física: inventario y deduplicación

### 3.1 Los 27 motores existentes

| Motor (`engineKey`) | Título | Nivel | Física exacta |
|---|---|---|---|
| `kinematics` | Cinemática | high | MRU y MRUV en el plano (vx, vy, ax, ay). Único con gráficas x-t/v-t |
| `forces-motion` | Fuerzas y movimiento | middle | 2ª ley vectorial F⃗ = m·a⃗ |
| `kinetic-force` | Fuerza cinética | middle | a = F/m, Ec = ½mv², W = ΔEc, sin fricción |
| `friction` | Fricción | middle | f_s ≤ μ_s·N, f_k = μ_k·N, umbral de arranque |
| `statics` | Estática | high | Equilibrio de partícula, tensiones T1/T2 |
| `momentum` | Cantidad de movimiento | high | Colisiones 1D, elástico/inelástico, coef. e |
| `collisions-2d` | Colisiones multicuerpo | high | N discos en el plano con paredes |
| `work-energy` | Trabajo, energía y potencia | high | W = F·d·cosθ, W_fric, ΔEc, P = F·v |
| `rotational` | Circular y rotacional | high | τ = Iα, MCU, precesión |
| `oscillatory-energy` | Oscilaciones y energía | advanced | MHS de resorte, Ec ↔ Ep |
| `thermodynamics` | Termodinámica | advanced | PV = nRT, isotermas, Carnot, difusión |
| `sound-waves` | Sonido y ondas | high | v = f·λ, efecto Doppler |
| `electric-field` | Campo eléctrico | middle | Coulomb, campo E, potencial |
| `circuits-dc-ac` | Circuitos DC / AC | high | Serie, paralelo, RLC forzado |
| `magnetic-fields` | Campos magnéticos | middle | Lorentz F = q(v×B), órbita ciclotrón |
| `em-waves` | Ondas EM | advanced | E ⊥ B, c = f·λ, polarización |
| `universal-gravity` | Gravedad universal | high | F ∝ 1/r², órbita satélite |
| `kepler-orbits` | Kepler y asistencia grav. | advanced | T² ∝ a³, flyby |
| `geometric-optics` | Luz y óptica geométrica | high | Snell, reflexión total interna |
| `thin-lenses` | Lentes delgadas | high | 1/f = 1/d₀ + 1/dᵢ, M = −dᵢ/d₀ |
| `interference-diffraction` | Interferencia y difracción | advanced | Young, difracción de una rendija |
| `atomic-physics` | Física atómica | advanced | Bohr, E_n = −13,6·Z²/n² |
| `photoelectric` | Efecto fotoeléctrico | advanced | K_max = hf − φ |
| `radioactivity` | Decaimiento radiactivo | advanced | N(t) = N₀e^(−λt) |
| `quantum-tunneling` | Túnel cuántico | advanced | T ≈ e^(−2κL) |
| `particle-physics` | Cargas en campo B | advanced | Espectrómetro, r = mv/qB |
| `whiteboard` | Pizarra | middle | Herramienta docente (no es física) |

### 3.2 Deduplicación de los temas solicitados

Regla aplicada, según lo pedido: **un tema sólo genera módulo nuevo si su motor
numérico es distinto**. Si sólo cambia el enunciado o el encuadre pedagógico, va como
*modo* de un motor existente o como escenario.

#### Ya cubiertos — NO crear módulo

| Tema solicitado | Cubierto por | Nota |
|---|---|---|
| Cinemática · Movimiento lineal · Movimiento en 2D · Movimiento y posición | `kinematics` | Ya unifica 1D y 2D con componentes |
| Leyes de Newton · Leyes del movimiento · Interacciones y fuerza | `forces-motion` | Mismo motor: integrar F⃗ = m·a⃗ |
| Energía · Trabajo · Trabajo y energía · Energía y su relación · Fuerza y energía de trabajo | `work-energy` | Cinco formulaciones del mismo motor |
| Momento lineal · Conservación del momento | `momentum` + `collisions-2d` | 1D y 2D ya separados |
| Gravedad · Teorías de la gravedad · Movimiento circular y gravitación | `universal-gravity` + `kepler-orbits` | |
| Movimiento circular y rotacional · Movimiento circular | `rotational` | Ya tiene modo `circular` |
| Circuitos eléctricos | `circuits-dc-ac` | |
| Física térmica | `thermodynamics` | Falta calorimetría → §3.3 |
| Vibraciones y ondas | `oscillatory-energy` + `sound-waves` | Falta cuerda → §3.3 |
| Refracción y lentes | `geometric-optics` + `thin-lenses` | Faltan espejos → §3.3 |

**Sinónimos detectados y colapsados:** «Movimiento lineal» = «Cinemática» = «Movimiento
en dos dimensiones»; «Trabajo» = «Trabajo y energía» = «Fuerza y energía de trabajo»;
«Leyes del movimiento» = «Leyes de Newton» = «Interacciones y fuerza»; «Momento
lineal» = «Conservación del momento lineal»; «Movimiento circular» = «Movimiento
circular y rotacional». De **31 nombres** solicitados quedan **15 temas realmente nuevos**,
más 4 de ampliación de cobertura (§3.3).

#### Modos nuevos sobre motores existentes — NO son módulos

Estos temas tienen entidad pedagógica pero **compartirían motor numérico**, así que se
implementan como modo dentro del módulo que ya resuelve esa física. Es la aplicación
directa de la regla «ningún motor igual a otro»:

| Tema | Motor anfitrión | Modo a añadir | Por qué no es módulo |
|---|---|---|---|
| **Impulso** (J = FΔt) | `momentum` | Gráfica F–t con área bajo la curva | Es la forma integral del mismo teorema |
| **Ley de Hooke en resortes** (F = −kx, serie/paralelo) | `oscillatory-energy` | Modo estático previo al MHS | Mismo resorte lineal, sin integrar |
| **Momento angular** (patinadora) | `rotational` | Cuarto modo | Mismo sólido rígido, τ = dL/dt |
| **Caída libre** | `kinematics` | Preajuste ax = 0, ay = −g | Caso particular del MRUV |
| **Carga y descarga RC** | `circuits-dc-ac` | Cuarto modo | Mismo solucionador de circuito |
| **Capacitores y dieléctricos** | `circuits-dc-ac` | Extensión del modo RC | Idem |
| **Centro de masa** | `collisions-2d` | Overlay del CM | Magnitud derivada del mismo sistema |
| **Transformadores y relación de espiras** | `induction` | Modo de inducción mutua | El motor es ε = −N·dΦ/dt, idéntico |
| **Polarización y ley de Malus** | `em-waves` | Segundo polarizador | Misma onda plana, distinto observable |
| **Batidos y superposición** | `standing-waves` | Modo sin condición de contorno | Misma suma de ondas |
| **Doble péndulo y caos** | `pendulum` | Segundo eslabón | Misma integración angular |
| **Radiación y convección** | `calorimetry` | Modos de transferencia | Mismo balance de calor |
| **Intensidad sonora y escala dB** | `sound-waves` | Capa de intensidad 1/r² | Misma fuente emisora |

#### Colapsar un tema no puede esconderlo

Fusionar 31 nombres en 27 motores tiene un riesgo obvio: **quien busca «impulso» no
encuentra nada**, porque el módulo se llama «Cantidad de movimiento». La deduplicación
sólo es aceptable si va acompañada de dos cosas:

1. **Campo `serves`** en cada entrada del catálogo — la lista explícita de temas
   curriculares que ese módulo cubre, con la redacción que usan los programas de
   estudio (§3.4).
2. **Los modos son destino de búsqueda.** «Impulso» debe llevar directamente al modo
   Impulso de `momentum`, no a la portada del módulo. Requiere enlace profundo por
   modo: `#/m/momentum?mode=impulse` (§4.4).

Sin esto, cada tema colapsado sería un tema perdido para el usuario.

### 3.3 Los 19 módulos nuevos (motor distinto verificado)

Los **15 primeros** salen de tu lista de temas; los **4 últimos** son la ampliación de
cobertura. Cada uno pasa el filtro: motor numérico distinto de los 27 existentes y de
los otros 18 nuevos.

| # | `engineKey` | Título | Categoría | Motor — por qué NO duplica a ninguno |
|---|---|---|---|---|
| 1 | `units-error` | Dimensiones, unidades y error | Medición | Análisis dimensional, cifras significativas y propagación de error. No es simulación temporal: no existe nada parecido |
| 2 | `vectors` | Vectores | Medición | Álgebra vectorial interactiva: suma gráfica, descomposición, producto escalar/vectorial. Sin integración temporal |
| 3 | `projectile` | Tiro parabólico | Cinemática | Alcance, altura máxima y ángulo óptimo **con** resistencia del aire opcional. `kinematics` integra a⃗ constante sin término de arrastre ni resolución analítica de alcance |
| 4 | `mass-weight` | Masa y peso | Dinámica | Balanza vs dinamómetro en 8 cuerpos celestes (g variable). `forces-motion` no modela g por planeta ni distingue instrumentos |
| 5 | `inclined-plane` | Plano inclinado y poleas | Dinámica | Descomposición en plano inclinado + máquina de Atwood con polea. `friction` es caja horizontal; aquí hay ligadura de cuerda y dos masas acopladas |
| 6 | `pendulum` | Péndulo simple y físico | Ondas | Integración **angular** con T = 2π√(L/g), régimen de ángulo grande no armónico. `oscillatory-energy` es resorte lineal con solución cerrada |
| 7 | `fluids` | Fluidos: Arquímedes y Bernoulli | Fluidos | Empuje, presión hidrostática y ecuación de continuidad. Área completamente ausente |
| 8 | `calorimetry` | Calorimetría y cambios de fase | Térmica | Q = mcΔT + calor latente con mezclas y meseta de fase. `thermodynamics` modela gas ideal P–V, no transferencia con cambio de estado |
| 9 | `kinetic-theory` | Teoría cinética de gases | Térmica | N moléculas con colisiones y distribución de Maxwell-Boltzmann. `thermodynamics` usa PV = nRT macroscópico; `collisions-2d` no tiene termostato ni histograma de rapidez |
| 10 | `standing-waves` | Ondas estacionarias en cuerdas | Ondas | Modos normales, armónicos y nodos con v = √(T/μ). `sound-waves` emite frentes circulares para Doppler; no hay condición de contorno |
| 11 | `mirrors` | Espejos esféricos | Óptica | Trazado con espejo cóncavo/convexo, 1/f = 1/d₀ + 1/dᵢ **con reflexión**. `thin-lenses` refracta; la construcción de rayos difiere |
| 12 | `induction` | Inducción electromagnética | Electromagnetismo | Ley de Faraday ε = −dΦ/dt y Lenz: espira móvil, flujo variable. `magnetic-fields` mueve una carga en B constante; aquí el observable es el flujo |
| 13 | `nuclear-energy` | Fisión, fusión y E = mc² | Moderna | Energía de enlace por nucleón, defecto de masa, reacción en cadena. `radioactivity` es decaimiento estocástico de un isótopo |
| 14 | `de-broglie` | Dualidad onda-partícula | Moderna | λ = h/p y doble rendija **con electrones**, patrón acumulado partícula a partícula. `interference-diffraction` es intensidad continua de luz |
| 15 | `quantum-history` | Historia de la mecánica cuántica | Moderna | Línea de tiempo interactiva 1900–1935 con mini-demos incrustadas. Tipo de módulo distinto (narrativo); reutiliza `photoelectric`, `atomic` y `tunneling` |
| 16 | `special-relativity` | Relatividad especial | Moderna | Transformaciones de Lorentz: dilatación temporal, contracción de longitud, simultaneidad, E = γmc². Ningún motor existente aplica factor γ |
| 17 | `elasticity` | Elasticidad y deformación | Dinámica | Curva esfuerzo–deformación σ = E·ε, módulo de Young, límite elástico y rotura. **No duplica** el modo Hooke de `oscillatory-energy`: ahí el observable es el desplazamiento de un resorte ideal; aquí es la respuesta de un material con régimen plástico |
| 18 | `thermal-expansion` | Dilatación térmica | Térmica | ΔL = α·L₀·ΔT lineal, superficial y volumétrica, con tira bimetálica. `calorimetry` transfiere calor y `thermodynamics` modela el gas; ninguno calcula deformación por temperatura |
| 19 | `optical-instruments` | Instrumentos ópticos | Óptica | Sistemas de **varias lentes en cascada**: ojo, lupa, microscopio y telescopio, con aumento angular. `thin-lenses` resuelve **una** lente; encadenar imagen-objeto entre elementos es otro solucionador |

**Total tras WAVE 5: 46 módulos** (27 + 19), más la entrada especial «Mis trabajos».

#### Descartados por duplicar motor

Para dejar constancia del filtro, estos temas se evaluaron y **no** generan módulo:
transformadores, polarización, batidos, doble péndulo, radiación/convección e
intensidad sonora → todos pasan a modos (tabla anterior). «Espectro
electromagnético» ya está en `em-waves`; «potencial eléctrico» en `electric-field`;
«maniobras orbitales» en `kepler-orbits`; «fuerza centrípeta» en `rotational`.

### 3.4 «Útil para»: temas que cubre cada módulo

Campo nuevo `serves[]` en la entrada del catálogo. Se muestra en la ficha del módulo
(«Útil para: …») y **alimenta el buscador** (§4.4). Redacción tomada de los programas
de estudio, no de la jerga interna del código.

Tabla para los módulos que absorbieron sinónimos o modos — son los que corren riesgo
de volverse invisibles:

| Módulo | Útil para |
|---|---|
| `kinematics` | Cinemática · Movimiento lineal · Movimiento en dos dimensiones · Movimiento y posición · MRU · MRUV · **Caída libre** |
| `forces-motion` | Leyes del movimiento de Newton · Leyes del movimiento · Interacciones y fuerza · Segunda ley · Dinámica · Diagrama de cuerpo libre |
| `work-energy` | Trabajo · Energía · Trabajo y energía · Energía y su relación · Fuerza y energía de trabajo · Potencia · Teorema trabajo-energía |
| `momentum` | Momento lineal · **Impulso** · Conservación del momento lineal · Choques elásticos e inelásticos · Coeficiente de restitución |
| `collisions-2d` | Choques en dos dimensiones · Conservación del momento · **Centro de masa** |
| `universal-gravity` | Gravedad · **Teorías de la gravedad** · Gravitación universal · Ley del inverso del cuadrado · Campo gravitatorio |
| `kepler-orbits` | Movimiento circular y gravitación · Leyes de Kepler · Órbitas · Asistencia gravitacional |
| `rotational` | Movimiento circular · Movimiento circular y rotacional · **Momento angular** · Torque · MCU · Fuerza centrípeta · Inercia rotacional |
| `oscillatory-energy` | Vibraciones · Vibraciones y ondas · Movimiento armónico simple · **Ley de Hooke** · Resortes · Energía en oscilaciones |
| `sound-waves` | Ondas · Vibraciones y ondas · Sonido · Efecto Doppler · **Intensidad sonora** · **Escala de decibelios** |
| `standing-waves` | Ondas estacionarias · Armónicos · Nodos y antinodos · **Batidos** · **Superposición de ondas** |
| `pendulum` | Péndulo simple · Péndulo físico · Movimiento armónico · **Doble péndulo** · **Caos** |
| `circuits-dc-ac` | Circuitos eléctricos · Ley de Ohm · Serie y paralelo · RLC · **Circuitos RC** · **Capacitores** · **Dieléctricos** · Corriente alterna · Resonancia |
| `electric-field` | Campo eléctrico · Ley de Coulomb · Potencial eléctrico · Cargas puntuales · Dipolo |
| `induction` | Inducción electromagnética · Ley de Faraday · Ley de Lenz · **Transformadores** · **Relación de espiras** · Inducción mutua |
| `em-waves` | Ondas electromagnéticas · Espectro electromagnético · **Polarización** · **Ley de Malus** |
| `thermodynamics` | Física térmica · Gases ideales · Leyes de los gases · Ciclo de Carnot · Máquinas térmicas · Rendimiento |
| `calorimetry` | Calorimetría · Calor específico · Cambios de fase · Calor latente · **Conducción** · **Convección** · **Radiación** |
| `geometric-optics` | Refracción · Refracción y lentes · Ley de Snell · Reflexión · Reflexión total interna · Índice de refracción |
| `thin-lenses` | Lentes · Refracción y lentes · Lentes delgadas · Formación de imágenes · Aumento |
| `vectors` | Vectores · Suma de vectores · Descomposición · Componentes · Producto escalar · Producto vectorial |
| `projectile` | Vectores y proyectiles · Tiro parabólico · Movimiento en dos dimensiones · Alcance y altura máxima · Ángulo óptimo |
| `units-error` | Dimensiones de la unidad y error · Análisis dimensional · Cifras significativas · Propagación de errores · Sistema Internacional |
| `mass-weight` | Masa versus peso · Masa, fuerza y peso · Gravedad en otros planetas · Balanza y dinamómetro |

**En negrita** los temas que sólo son accesibles a través de un modo interno: son
exactamente los que exigen el enlace profundo de §4.4. Los 22 módulos restantes llevan
también su `serves[]`, pero su nombre ya coincide con el tema y no corrían riesgo.

**Cobertura verificada:** los 31 nombres de tu lista aparecen en esta tabla o en un
título de módulo. Ninguno queda sin ruta de entrada.

### 3.5 Categorías del menú

Con 46 módulos el grid plano actual (`index.html:17-44`, una sola sección) sería
inusable. Estructura propuesta — 12 categorías, 47 entradas:

| Categoría | N | Módulos |
|---|---|---|
| **Medición y vectores** | 2 | `units-error`, `vectors` |
| **Cinemática** | 2 | `kinematics`, `projectile` |
| **Dinámica y fuerzas** | 7 | `forces-motion`, `kinetic-force`, `friction`, `inclined-plane`, `statics`, `mass-weight`, `elasticity` |
| **Trabajo, energía y momento** | 3 | `work-energy`, `momentum`, `collisions-2d` |
| **Rotación y gravitación** | 3 | `rotational`, `universal-gravity`, `kepler-orbits` |
| **Fluidos** | 1 | `fluids` |
| **Térmica** | 4 | `thermodynamics`, `calorimetry`, `kinetic-theory`, `thermal-expansion` |
| **Oscilaciones y ondas** | 4 | `oscillatory-energy`, `pendulum`, `sound-waves`, `standing-waves` |
| **Óptica** | 5 | `geometric-optics`, `thin-lenses`, `mirrors`, `interference-diffraction`, `optical-instruments` |
| **Electricidad y magnetismo** | 5 | `electric-field`, `circuits-dc-ac`, `magnetic-fields`, `induction`, `em-waves` |
| **Física moderna** | 9 | `photoelectric`, `atomic-physics`, `radioactivity`, `quantum-tunneling`, `particle-physics`, `de-broglie`, `nuclear-energy`, `special-relativity`, `quantum-history` |
| **Herramientas docentes** | 2 | `whiteboard`, `my-works` |

«Fluidos» queda con un solo módulo: es la única categoría que no se sostiene por
volumen, pero sí por identidad curricular. Si molesta, se fusiona con «Dinámica y
fuerzas» bajo el nombre «Mecánica de sólidos y fluidos».

---

# WAVE 0 — Higiene del repositorio

> ✅ **Hecha** — commit `01a456e`.

**Objetivo:** una sola fuente de la verdad. Prerrequisito de todo lo demás.
**Riesgo:** bajo. **Impacto:** elimina el trabajo duplicado en cada cambio futuro.

### 0.1 Sacar `website/sim/` del control de versiones

`website/sim/` es salida de `build-website.sh:16` (`rm -rf "$SIM"`), que CI ejecuta en
cada push. Mantener 76 copias en git obliga a editar dos veces cada archivo.

```gitignore
# .gitignore — junto a desktop/app/ y mobile/www/
# sim/ se genera con scripts/build-website.sh (no editar a mano)
website/sim/
```

Y `git rm -r --cached website/sim` en el commit de la WAVE.

**Verificación:** `./scripts/build-website.sh && test -f website/sim/js/app.js` debe
seguir produciendo el sitio completo, y `git status` quedar limpio después.

### 0.2 Guardia contra ediciones en carpetas generadas

Cabecera autogenerada en los tres destinos y comprobación en CI de que
`skills/fisicahn/` es el único origen modificado. Evita el fallo silencioso de editar
`website/sim/js/app.js` y perderlo en el siguiente build.

### 0.3 Limpieza de artefactos y documentación obsoleta

- `desktop/` ocupa **1,7 GB** y `tools/` **664 MB** en disco. Revisar qué está
  gitignored y qué no; ninguno debería versionar `node_modules` ni `release/`.
- `implementation_plan.md` describe una arquitectura que no existe (18 módulos,
  pestañas de nivel, rutas `js/core/`). Marcar como histórico o reescribir.
- Decidir sobre los 4 JSON de retos huérfanos (`CHALLENGE_ENGINES = {}` en
  `challenges.js:11`): convertirlos en semilla real o eliminarlos → WAVE 8.

### 0.4 Soporte SQL en el grafo de conocimiento

`pip install 'graphifyy[sql]'` — hoy `schema.sql` no aporta nodos al grafo por falta de
`tree_sitter_sql`.

---

# WAVE 1 — Contrato de módulo y núcleo compartido

> ✅ **Hecha** — commit `4f34fb3`. `SimModule` + `createModuleInstance`,
> `LegacyModuleAdapter`, ciclo de vida en `try/catch` con pantalla de error
> degradada, y `js/core/` con `trail-buffer`, `geometry` y `draw-primitives`.
> `kinematics` migró como primer módulo.

**Objetivo:** convertir la convención implícita en una interfaz explícita, y extraer
lo repetido 27 veces.
**Depende de:** WAVE 0. **Habilita:** WAVE 2, 4, 5.

### 1.1 `SimModule` — clase base con fábrica

El problema de fondo es que cada módulo es un **singleton** (estado en `let` de nivel
de módulo, caché ESM en `app.js:672`). Se sustituye por una fábrica que devuelve
instancias:

```js
// js/core/sim-module.js
export class SimModule {
  static params = [];          // esquema declarativo → WAVE 2.7
  static formulas = [];
  static info = {};

  constructor(ctx) { this.engine = ctx.engine; this.scene = ctx.scene; this.ui = ctx.ui; }

  init() {}                    // única vez al montar
  reset() {}                   // volver al estado inicial
  update(dt) {}                // física — SIN tocar el DOM (ver WAVE 3.1)
  draw(scene) {}               // dibujo declarativo — ver WAVE 2
  readout() { return {}; }     // { Ec: {value: 12.3, unit: 'J'} } — reemplaza updateData()
  getState() { return {}; }
  setState(s) {}
  destroy() {}
}
```

Cada módulo pasa a `export default class Kinematics extends SimModule { … }`, y
`loadEngineModule()` (`app.js:650-707`) hace `new mod.default(ctx)`. Beneficios
inmediatos:

- Dos instancias del mismo módulo → **comparación lado a lado** (imposible hoy).
- `destroy()` real: se libera la instancia, no sólo la entrada del mapa.
- Los 28 bloques de `let _engine, _renderer, _ui` desaparecen.

### 1.2 Envolver el ciclo de vida en try/catch

Hoy sólo `init()` está protegido (`app.js:699`). Una excepción en `update()` o
`render()` mata el RAF sin traza visible. Añadir captura por módulo con degradación a
pantalla de error y botón de reinicio, en lugar de congelar la aplicación.

### 1.3 Migración por adaptador (sin big-bang)

`loadEngineModule` detecta si el módulo exporta `default` (nuevo) o funciones sueltas
(legacy) y en el segundo caso lo envuelve en un `LegacyModuleAdapter`. Los 27 módulos
se migran de uno en uno, con la app funcionando en todo momento.

### 1.4 Extraer las utilidades duplicadas

Nuevos archivos en `js/core/`, alimentados por la tabla §2.2:

| Archivo | Contenido | Elimina |
|---|---|---|
| `trail-buffer.js` | Ring buffer O(1) con capacidad fija | 6 estelas + 5 bucles de dibujo |
| `draw-primitives.js` | `roundRect`, `arrowHead`, `chip`, `legend` | 6 + 5 + 3 + 3 copias |
| `geometry.js` | `dist`, `distToSegment`, `clamp`, `lerp` | 3 copias de `clamp`; recupera `math-helpers.js:23` |

`utils/math-helpers.js` ya exporta `lerp`, `clamp` y `mapRange` **sin que nadie los
use**: el problema no es que falten utilidades, es que no se conocen. Documentar el
núcleo en `js/core/README.md`.

---

# WAVE 2 — Rediseño del canvas ★

> ✅ **Hecha** — commit `ae7d80a`. Balance de lo entregado, las desviaciones y lo
> que queda: [§2.10](#210-lo-que-quedó-hecho).

> **Es la WAVE central del plan.** El canvas es el producto: todo lo demás es
> andamiaje alrededor. Hoy es un único `<canvas>` que se borra entero 60 veces por
> segundo mientras cada módulo dibuja con `ctx` crudo en un espacio de coordenadas
> que ni siquiera es consistente entre módulos.

## 2.0 Diagnóstico específico del canvas

### Bug de espacio de coordenadas — 8 módulos afectados

`render(ctx)` recibe el contexto **en píxeles CSS** (`app.js:1101` aplica
`applyDprTransform()`), pero varios módulos leen el **buffer en píxeles de
dispositivo**:

```js
// optics.js:247-248  ← INCORRECTO
const w = r.canvas.width;    // buffer: 1,75× el ancho CSS en móvil
const h = r.canvas.height;
```

Con DPR 1,75 la leyenda se dibuja a `lx = w - 16`, es decir **fuera de pantalla**, y
los rellenos de medios cubren 1,75× de más. Mismo patrón en `thermodynamics.js:157`,
`momentum.js:154`, `work-energy.js:153`, `force-kinetic.js:200`, `sound.js:116`,
`oscillatory.js:113`.

Y hay dos parches ad-hoc **distintos** para el mismo bug: `magnetic.js:242` y
`lenses.js:243` usan `ctx.canvas?.clientWidth || ctx.canvas?.width`, mientras
`placeholder.js:33` recalcula su propio `devicePixelRatio`.

Caso aparte: `whiteboard.js` trabaja **deliberadamente** en píxeles de dispositivo
(`setTransform(1,0,0,1,0,0)` en la línea 522), y por eso `app.js:1112` tiene que
reaplicar la transformación después. Efecto secundario: los trazos de la pizarra se
ven ~2× más finos en pantallas HiDPI.

### El mundo se deforma con la ventana

`worldWidth` y `worldHeight` son fijos (20×15, `app.js:146-147`) y la escala se deriva
por eje: `scaleX = cssW / worldWidth`, `scaleY = cssH / worldHeight`
(`renderer.js:124-134`). **No se preserva la relación de aspecto**: una órbita circular
en `kepler` se ve elíptica en pantalla ancha, y un ángulo de 45° en `optics` no mide
45° visualmente.

### No hay zoom, y el sistema de overlays está muerto

La cámara sólo tiene `{x, y}` (`renderer.js:33`) — pan sin zoom, sin rotación, sin
límites, sin interpolación en `follow()` (salto duro, línea 102). El sistema de
overlays (`addOverlay` / `clearOverlays`, `renderer.js:462-478`) existe, se limpia en
dos sitios… y **ningún módulo llama nunca a `addOverlay`**.

### Vocabulario insuficiente

Cinco primitivas para 27 simulaciones: `drawGrid`, `drawObject`, `drawVector`,
`drawLabel`, `drawTooltip`. No hay `drawPolyline`, `drawPath`, `drawArc`, `drawSpring`,
`drawTrail`, `drawLegend`, `drawChip`, `drawField`. De ahí las 856 llamadas crudas.

---

## 2.1 Sistema de capas (el cambio estructural)

Hoy: un `<canvas>`, `clear()` del buffer completo y redibujado íntegro cada frame
(`app.js:1097-1114`), incluida una rejilla estática de ~35 trazos + ~33 `fillText`
(`renderer.js:151-264`) que casi nunca cambia.

Propuesta: **tres capas con invalidación independiente**.

| Capa | Contenido | Se redibuja cuando |
|---|---|---|
| **`background`** | Rejilla, ejes, escala, fondo del tema | Cambia tamaño, cámara, zoom o tema |
| **`world`** | La simulación (lo que hoy dibuja `render()`) | Cada frame |
| **`hud`** | Leyendas, chips, medidas, tooltips, selección | Cambia el estado de UI |

Implementación sin coste de composición: `background` y `hud` en `OffscreenCanvas`
(con fallback a `<canvas>` desconectado del DOM), compuestos en el canvas visible con
`drawImage`. Se mantiene **un único elemento en el DOM** — importante para el
rendimiento táctil y para `whiteboard`.

Ganancia medida esperada: la rejilla pasa de 68 operaciones/frame a 0 en régimen
estacionario.

## 2.2 Cámara real

```js
// js/core/camera.js
class Camera {
  constructor() { this.x = 0; this.y = 0; this.zoom = 1; }
  fit(worldW, worldH, viewW, viewH, { mode: 'contain' })  // preserva aspecto
  worldToScreen(wx, wy, out)   // escribe en `out`, sin allocar
  screenToWorld(sx, sy, out)
  follow(wx, wy, { smooth: 0.15 })   // interpolado, no salto
  clampTo(bounds)
}
```

- **Escala isotrópica** (`scale = min(viewW/worldW, viewH/worldH)`), con *letterboxing*.
  Corrige la deformación descrita en §2.0.
- **Zoom** con rueda, pellizco táctil y botones ±, anclado al cursor.
- **Pan** con arrastre del botón central o espacio+arrastre; en táctil, dos dedos.
- `follow()` interpolado: elimina el salto duro de `renderer.js:102`, visible hoy en
  `gravity` y `kepler`.
- **Encuadre automático** por módulo: `static viewport = { width: 20, height: 15 }`
  declarado en la clase, en vez del 20×15 global de `app.js:146`.

## 2.3 Un único espacio de coordenadas

Regla dura: **los módulos nunca acceden a `ctx.canvas`**. En su lugar:

```js
scene.viewport()   // { w, h } SIEMPRE en px CSS
scene.world()      // { left, right, top, bottom } en unidades de mundo
```

Esto elimina de raíz los 8 bugs de DPR de §2.0 y los dos parches divergentes. Se puede
verificar automáticamente con una regla de lint (`no-restricted-properties` sobre
`canvas.width`) → WAVE 7.

`whiteboard` se migra a la capa `hud` con unidades CSS, resolviendo de paso el grosor
de trazo en HiDPI y permitiendo retirar el `applyDprTransform()` defensivo de
`app.js:1112`.

## 2.4 API de dibujo declarativa

El módulo deja de recibir un `ctx` y recibe una **escena**. El backend queda oculto, lo
que abre la puerta a exportar SVG/PNG y, en el futuro, a un backend WebGL sin tocar
un solo módulo.

```js
draw(scene) {
  scene.trail(this.trail, { color: theme.accent, fade: true });
  scene.body(this.pos, { shape: 'circle', r: 0.3, color: theme.mass, label: 'm₁' });
  scene.vector(this.pos, this.vel, { color: theme.velocity, label: 'v⃗', unit: 'm/s' });
  scene.spring(anchor, this.pos, { coils: 12 });
  scene.field(this.E, { type: 'arrows', density: 12 });   // campos E y B
  scene.hud.legend([{ color: theme.velocity, label: 'Velocidad' }]);
  scene.hud.chip(`Ec = ${roundTo(this.ec, 2)} J`, 'top-right');
}
```

**Vocabulario propuesto** (cubre las 856 llamadas crudas auditadas):

| Grupo | Primitivas |
|---|---|
| Geometría | `line`, `polyline`, `path`, `circle`, `rect`, `arc`, `polygon` |
| Física | `body`, `vector`, `trail`, `spring`, `pulley`, `ray`, `wavefront`, `field` |
| Anotación | `label`, `chip`, `legend`, `dimension`, `angleArc`, `tooltip` |
| Gráficas | `plot` (ejes + series in-canvas, para `photoelectric`, `thermodynamics`) |

`scene.plot` merece mención aparte: hoy `photoelectric.js:drawGraph` y
`thermodynamics` dibujan sus propios ejes a mano, y `kinematics` es el **único** módulo
con gráficas (vía SVG externo, `useCharts`). Una primitiva de gráfica en canvas
permitiría dar gráficas a los 42 módulos sin coste por módulo.

## 2.5 Tema, modo proyector y accesibilidad

> **Decidido: entra en el plan.** Era la candidata «Modo proyector + tema claro».

`renderer.js:88` rellena con `#0f0f1a` **hardcodeado**. Con el dibujo declarativo, los
colores pasan a ser *tokens*:

```js
// js/core/theme.js
export const themes = {
  dark:      { bg:'#0f0f1a', grid:'#1e2030', mass:'#4ea1ff', velocity:'#39d98a', force:'#ff6b6b', … },
  light:     { … },   // luz ambiente alta
  projector: { … },   // alto contraste + trazo grueso + tipografía grande
  colorSafe: { … }    // paleta segura para daltonismo
};
```

**Modo proyector** — no es sólo un tema, es un perfil de presentación completo:

| Ajuste | Normal | Proyector |
|---|---|---|
| Paleta | `dark` | Alto contraste sobre fondo claro |
| Grosor de trazo | 1–2 px | ×2 (los proyectores comen detalle fino) |
| Tipografía de etiquetas | 12–14 px | ×1,6 |
| Barra lateral y paneles | Visibles | Colapsables con una tecla |
| Rejilla | Completa | Sólo ejes principales |

Se activa con atajo de teclado y persiste en `localStorage`. Todo son *tokens* del
tema y parámetros de la escena: **ningún módulo se entera**. Hoy, cambiar un solo
color exige editar 27 archivos.

La **paleta segura para daltonismo** afecta a ~8 % de los estudiantes varones. Es una
mejora de accesibilidad real, no cosmética: en `optics` y `circuits` el color es el
único canal que distingue magnitudes (rayo incidente vs refractado, corriente vs
tensión). Regla nueva: **el color nunca es el único portador de información** — debe
ir acompañado de estilo de línea, etiqueta o forma.

## 2.6 Interacción directa sobre el canvas

Hoy la interacción se limita a `getMousePos` / `getPointerPos` (`renderer.js:480-495`) y
cada módulo resuelve el *hit testing* por su cuenta — cuando lo hace.

Capa de interacción en la escena:

- **Picking**: `scene.pickable(id, bounds)` durante el dibujo; la escena resuelve qué
  hay bajo el cursor y emite `onPick(id)`.
- **Arrastre de objetos**: mover una carga en `electric-field`, el foco en `thin-lenses`,
  el bloque en `friction`. Es el salto pedagógico más grande: pasar de «mover un
  deslizador» a **manipular el sistema**.
- **Herramienta de medida**: regla, transportador y cronómetro reutilizables en los 42
  módulos. Hoy existe `drawMeasureOverlays` (`app.js:1113`) sólo para el módulo activo.
- **Inspección**: hover sobre un cuerpo → tooltip con sus magnitudes en vivo.

## 2.7 Panel de parámetros declarativo

Sustituye `renderParams()` × 27, los `setTimeout(…, 0)` × 27 y las 145 líneas de
`enhanceParamsPanel` (`module-ui.js:518-662`) con su `Object.defineProperty` sobre el
DOM (línea 583).

```js
static params = [
  { id:'m',  label:'Masa',     latex:'m', unit:'kg',   min:0.1, max:10, step:0.1, value:1 },
  { id:'v0', label:'Vel. ini', latex:'v_0', unit:'m/s', min:-20, max:20, step:0.5, value:5 },
  { id:'mode', type:'select', label:'Modo', options:[…] }
];
```

Un único renderizador construye el panel, lo bindea y escribe en `this.params.m`. Cierra
además la puerta a los tres mecanismos superpuestos de §2.3.

## 2.8 Exportación

Con dibujo declarativo, la escena puede reproducirse en otros backends:

- **PNG** del canvas (ya existe para `whiteboard`: `whiteboard.js:exportPng`) → los 46.
- **SVG** vectorial para pegar en guías impresas y exámenes.
- **Secuencia de fotogramas** — base de la exportación a GIF/vídeo de la WAVE 9.

## 2.9 Comparación lado a lado

> **Decidido: entra en el plan.** Era la candidata «Comparación lado a lado».

Es el mayor salto pedagógico de todo el documento: pasar de «mira esta simulación» a
**«compara estas dos»** — el experimento controlado, que es como se enseña física.

Casos de uso directos: caída con y sin resistencia del aire (`projectile`); choque
elástico vs inelástico (`momentum`); misma órbita con dos valores de GM
(`universal-gravity`); lente convergente vs divergente (`thin-lenses`); dos metales en
`photoelectric`.

**Hoy es imposible**, y la causa es estructural: los módulos son singletons con estado
en variables de nivel de módulo (`kinematics.js:17-29`) y la caché ESM devuelve
siempre el mismo namespace (`app.js:672`). Instanciar el módulo dos veces daría dos
vistas del **mismo** estado.

La WAVE 1.1 (fábrica `SimModule` en vez de singleton) lo desbloquea casi gratis. Lo
que falta añadir aquí:

1. **Layout de dos paneles** con divisoria arrastrable — `panel-resize.js` (145 líneas)
   ya resuelve el arrastre de divisorias y es reutilizable.
2. **Dos escenas independientes** sobre el mismo canvas mediante *viewports* de la
   cámara (§2.2), no dos elementos `<canvas>`: mantiene una sola superficie y un solo
   bucle RAF.
3. **Enlace de controles**: modo «vincular» que propaga un cambio de parámetro a ambos
   lados salvo los marcados como «variable independiente». Es lo que convierte la
   función en un experimento controlado en lugar de dos simulaciones sueltas.
4. **Lectura comparada**: `readout()` (§1.1) de ambas instancias en una tabla con la
   diferencia calculada.

Coste añadido bajo **si y sólo si** se hace después de la WAVE 1. Hacerlo antes
implicaría reescribir los 27 módulos.

---

## 2.10 Lo que quedó hecho

Commit `ae7d80a`: 8 archivos nuevos en `js/core/`, ~5 000 líneas.

| § | Entregado | Archivo |
|---|---|---|
| 2.1 | Capas `background` / `world` / `hud` con `OffscreenCanvas` y reserva | `core/layers.js` |
| 2.2 | Cámara con escala isotrópica, zoom anclado, pan, `follow()` interpolado y viewports | `core/camera.js` |
| 2.3 | `scene.viewport()` / `scene.world()`; los 8 bugs de DPR corregidos | `core/scene.js`, módulos |
| 2.4 | 27 primitivas declarativas, incluida `plot` en lienzo | `core/scene.js` |
| 2.5 | Tokens + perfiles `dark` / `light` / `projector` / `colorSafe` | `core/theme.js` |
| 2.6 | Picking, arrastre, rueda, pellizco y `MeasureTools` reutilizable | `core/interaction.js` |
| 2.7 | Panel construido desde `static params` | `core/params-schema.js` |
| 2.8 | PNG del lienzo y SVG vectorial vía grabador del contexto 2D | `core/scene-export.js` |
| 2.9 | Dos instancias, dos viewports, controles enlazados y tabla Δ | `core/compare.js` |

### Desviaciones respecto a lo planificado

**El espaciado de la rejilla se adapta al zoom.** No estaba en el plan, pero el zoom
libre lo volvió obligatorio: con el paso fijo de 1 m, acercarse dejaba una sola línea
en pantalla y alejarse producía cientos de trazos con su `fillText`. Se añadió la
secuencia 1-2-5 por década (`renderer.gridSpacing`) y una barra de escala, porque con
zoom libre saber cuánto mide un cuadro deja de ser evidente.

**`drawGrid` trabaja sobre el viewport de la cámara, no sobre el lienzo.** Necesario
para que cada mitad de §2.9 tenga sus propios ejes.

**`PhysicsEngine.getDelta()`.** La interpolación de `follow()` necesita la duración
real del frame; sin ella, a 144 Hz el seguimiento iría casi tres veces más rápido.

**`implementsMethod()` en el contrato.** `SimModule` define `draw`, `readout` y
compañía como cuerpos vacíos, así que `typeof inst.draw === 'function'` da `true`
también en un módulo que aún dibuja con `render(ctx)`. Sin este detector, `kinematics`
—migrado en la WAVE 1 pero todavía imperativo— se habría quedado en blanco. Regla
derivada: **el anfitrión sólo se hace cargo del panel Datos en módulos del contrato
completo** (`draw` + `readout`); si no, su `ui.setData()` y el del anfitrión
parpadearían en el mismo panel.

**`whiteboard` migró a píxeles CSS.** Estaba previsto en §2.3 y se hizo: además de
retirar el `applyDprTransform()` defensivo, corrige que los trazos se vieran ~2× más
finos en pantallas HiDPI.

### Lo que NO quedó hecho

**Sólo 2 de 28 módulos usan la escena declarativa.** `momentum` está migrado al
contrato completo (`static params`, `static viewport`, `draw(scene)`, `readout()`,
`onDrag`) y sirve de referencia; `kinematics` es `SimModule` pero sigue con
`render(ctx)`. Los 26 restantes funcionan sin cambios a través del adaptador, pero
**siguen siendo 90 % `ctx` crudo**: el problema dominante #3 está *desbloqueado*, no
resuelto. Migrarlos es trabajo por módulo que este documento no asigna a ninguna WAVE
concreta — conviene hacerlo en tandas, y es prerrequisito real de que §2.8 (SVG) y
§2.9 (comparación) sirvan para algo más que un módulo.

**Consecuencias visibles hoy:** exportar a SVG y comparar lado a lado están
deshabilitados fuera de `momentum`, y la app lo dice explícitamente en vez de producir
un archivo dudoso o dos paneles en blanco.

**Sin cobertura automatizada en el repositorio.** La verificación fueron 59
comprobaciones ejecutadas fuera del árbol (cámara, tema, escena, picking, panel,
grabador SVG, física de choques, comparación y despacho `draw`/`render`) más una
pasada manual en navegador. Convertirlas en la suite de Vitest de §7.2 es trabajo de
la WAVE 7; hasta entonces, la WAVE 2 no tiene red de seguridad ante regresiones.

**El sistema de overlays sigue muerto.** §2.0 señaló que `addOverlay` /
`clearOverlays` existe y ningún módulo lo llama. Se mantuvo por compatibilidad, pero
la escena lo deja obsoleto: procede retirarlo cuando la migración de módulos avance.

---

# WAVE 3 — Rendimiento y uso de recursos

## 3.1 El problema dominante: `ui.setData()` a 60–300 Hz

**22 de 28 módulos** llaman `updateData()` desde dentro de `update(dt)`. La cadena por
llamada (`app.js:209-215`) es:

```js
setData(html) { panel.innerHTML = html; typesetMath(panel); }
```

y `typesetMath` (`module-ui.js:259-332`) hace **tres pasadas de `querySelectorAll`**
(líneas 266, 287, 299) más regex por elemento.

Y como `update()` se llama **hasta 5 veces por frame** por el sub-stepping
(`physics-engine.js:371-376`), en el peor caso son **300 reconstrucciones de HTML por
segundo**, cada una con parseo, 3 recorridos del DOM y re-typeset de KaTeX.

**Corrección en dos pasos:**

1. **Separar cálculo de presentación.** `update()` deja de tocar el DOM; el módulo
   expone `readout()` (§1.1) devolviendo números, no HTML.
2. **Throttle + escritura quirúrgica.** El host lee `readout()` a ~10 Hz — igual que ya
   hace con las gráficas (`CHART_MIN_MS = 100`, `app.js:117`) — y actualiza sólo los
   `textContent` que cambiaron. Las etiquetas y unidades se montan una vez; KaTeX se
   ejecuta una vez.

Es **el mayor retorno de rendimiento del proyecto**, y el patrón correcto ya existe en
el código para las gráficas.

## 3.2 Allocaciones en el bucle caliente

| Origen | Coste medido | Corrección |
|---|---|---|
| `worldToCanvas` devuelve objeto literal nuevo (`renderer.js:130-133`) | `particles.js:158`: 12 partículas × 80 puntos = **960 objetos/frame** | Variante con parámetro `out`, o `worldToCanvasX/Y` escalares |
| `Vector2D` inmutable | `kinematics.js:156-158`: **6 objetos por tick** × 60 Hz | Variantes mutables `addMut`/`scaleMut` para el hot path |
| `trail.shift()` es O(n) cada frame | 6 módulos (`kinematics.js:159`, `gravity.js:91`…) | `TrailBuffer` circular de WAVE 1.4 |
| `photons.filter()` + `electrons.filter()` por `update()` | `photoelectric.js:174,186`: 2 arrays nuevos por tick | Compactación in situ / pool |
| `getComputedStyle` en `drawLabel` y `drawTooltip` | `renderer.js:425,440` — `circuits` fuerza **10 recálculos de estilo/frame** | Cachear la fuente como ya hace `drawGrid` (`renderer.js:164`) |
| Closures redefinidos por frame | `optics.js:277` (`chip`), `circuits.js:230` (`drawWire`) | Elevar fuera de `render()` |
| `computeOptics()` recalculado en render | `optics.js:246` — 5 `Vector2D` + objeto de 12 campos, ya calculado en `update()` | Reusar el resultado |

## 3.3 Bucle y energía

- **Sub-stepping con pérdida**: al superar `_maxSubsteps = 5` el acumulador sobrante se
  **descarta** (`physics-engine.js:377-379`). A velocidad 5× la simulación se ralentiza
  en silencio, porque `setSpeed` escala el acumulador y no el `dt`
  (`physics-engine.js:284-286`). Escalar `dt` (con tope de estabilidad) da un
  comportamiento honesto.
- **`alpha` de interpolación es nominal**: se calcula y se pasa
  (`physics-engine.js:381`) pero **ningún módulo lo usa**. O se implementa la
  interpolación de render en `scene.body`, o se retira del contrato.
- **Ahorro de batería** (importante en el APK y en portátiles de aula): pausar el RAF
  cuando el canvas sale del viewport (`IntersectionObserver`), y ofrecer un modo 30 fps
  para equipos de gama baja. La base ya está: `visibilitychange` está manejado
  (`physics-engine.js:100`).

## 3.4 Peso de descarga

`katex.min.js` más sus fuentes son ~1 MB, presentes en cada copia. Opciones: subconjunto
de fuentes usado realmente, `font-display: swap`, y confirmar que la carga perezosa
(`module-ui.js:18`) no se dispara en módulos sin fórmulas.

---

## 3.10 Lo que quedó hecho

> ✅ **Hecha**. Balance de lo entregado, las desviaciones sobre el plan y lo que sigue
> abierto. Verificación: `node --check` sobre los 17 archivos tocados, sin tests
> automatizados en el árbol (ver abajo).

### Entregado

**§3.1 — Panel de datos a ~10 Hz (híbrido).** El plan preveía migrar los 22 módulos que
llaman `updateData()`/`setData` desde `update()`. Se decidió un híbrido por riesgo:
- **Host:** `ui.setData` queda envuelta en `throttleSetData()` (leading + trailing con
  corte a `READOUT_MIN_MS = 100` ms). El 100 % de los módulos legacy sigue escribiendo
  su HTML, pero como máximo a 10 Hz y siempre con el valor más reciente. El panel se
  descarta (`clear()`) al destruir el motor para no pintar stale HTML al cambiar de módulo.
- **`kinematics` como referencia:** es `SimModule` con `readout()` numérico (igual que
  `momentum`), y el host lo presenta con `pumpReadout()`. `pumpReadout` ya **no exige**
  `draw(scene)`: `kinematics` tiene `render(ctx)` y se presenta igual. Los 21 módulos
  restantes no se migran en esta WAVE (trabajo por módulo, se amortiza cuando llegue la
  migración declarativa del plan WAVE 2).

**§3.2 — Allocaciones del bucle caliente.** Toda la tabla está atendida:
- **`worldToCanvas` con `out`**: `renderer` soporta el parámetro `out`; los bucles de
  estela/guía/rejilla de `kinematics`, `gravity`, `dynamics`, `force-kinetic`,
  `magnetic`, `kepler`, `particles` y `electricity` reusan puntos de trabajo
  (`_to`, `_bw`, `_tp`, `_pe`, `_tc`, `_e1/_e2`). El caso `particles.js:158` pasa de
  ~960 objetos/frame a 1 objeto reaprovechado.
- **`Vector2D` mutable**: `set`, `addScaled`, `scaleMut`, `addMut` en `vector2d.js`;
  aplicados en `kinematics`, `gravity`, `dynamics`, `force-kinetic`, `magnetic`,
  `kepler`, `particles` y `collisions-2d` (el hot path de empuje/restitución pasa de 4
  `Vector2D` por par a cero).
- **`filter()` → compactación in situ** en `photoelectric` (fotones y electrones),
  `tunneling` (paquetes) y `particles`.
- **Closures fuera de `render`**: `optics` (`chip`→`drawChip`) y `circuits`
  (`drawWire`, ya parametrizada con `ctx`/`r`). `magnetic` y `lenses` ya tenían `chip`
  como función de módulo.
- **`computeOptics()`** se reusa vía `lastOptics` (ya cacheado en `init`/cambios de
  parámetros); `render` sólo cae a recomputar si no hay caché.
- **`getComputedStyle` en `drawLabel`/`drawTooltip`** ya estaba cacheado desde la WAVE 2.

**§3.3 — Bucle y energía.**
- `_maxSubsteps` pasa de 5 fijo a `MAX_SUBSTEPS = ceil((MAX_FRAME_TIME·MAX_SPEED)/DEFAULT_DT)`
  **= 30**, derivado de los límites reales. Con la cota derivada nunca se descarta tiempo
  legítimo en régimen; el descarte final queda como red ante un pico imposible.
- **Ahorro de batería**: `IntersectionObserver` sobre el canvas + `visibilitychange`; el
  RAF se pausa si la pestaña está oculta o el lienzo sale de pantalla (opción de ajuste).
- **Modo 30 fps** para gama baja: el frame se descarta y la física recupera el tiempo con
  el frame siguiente (la simulación no se ralentiza, sólo se pinta menos).
- **Ajustes persistentes** (`localStorage`, clave `fisicahn_settings`) desde el botón de
  configuración: *Ahorro de batería* (por defecto ON) y *30 FPS* (OFF). Se aplican en
  `loadEngineModule`.
- **`alpha` se mantiene nominal** por decisión: no se retira del contrato ni se
  implementa la interpolación ahora; los módulos usan el último estado (comportamiento
  «más nuevo siempre gana») que ya es aceptable visualmente.

**§3.4 — Peso de descarga.** `font-display:swap` inyectado en los 20 `@font-face` de
`assets/katex/katex.min.css`; la carga perezosa de KaTeX (`module-ui.js:18`) ya no se
dispara si no hay `\\(...\\)` visible, y no hay referencia a KaTeX en `index.html`. No se
subsetearon fuentes (decisión: rendimiento de primer pintado sin romper la fórmula
cuando despliega).

### Consecuencias visibles hoy

El panel Datos de la mayoría de los módulos se actualiza a **10 Hz** en vez de 60–300 Hz,
y el de `kinematics`/`momentum` lo monta el host a partir de números. En modo 30 fps + PIN
o pestaña de fondo, el proceso cae a ~0 % CPU cuando el lienzo no es visible. Los
parámetros no cambian de comportamiento.

### Desviaciones sobre el plan

- Los **21 módulos legacy** siguen generando su HTML y lo mandan por `setData` (ahora
  throttleado). La WAVE 3 no los migra a `readout()`.
- `particles` conserva un `shift()` de la **lista** de partículas al spawnear (a ~1.6 s, no
  por frame); los **puntos** de estela ya son `TrailBuffer`.
- No se tocó el `string` CSS de fuentes ni se añadió subconjunto.

### Sin cobertura automatizada

La verificación fue `node --check` sobre `app.js`, `physics-engine.js`, `vector2d.js`,
`trail-buffer.js` y los 13 módulos editados, más revisión de los bucles alojados. Como en
la WAVE 2, falta la suite de Vitest de §7.2 y el **presupuesto de rendimiento** (§7.6):
medir allocaciones y FPS antes/después de esta WAVE (y fijarlo en CI) es lo que evita que
las regresiones de §3.2 vuelvan en silencio.

---

# WAVE 4 — Catálogo por categorías y navegación

**Depende de:** WAVE 1. **Habilita:** WAVE 5.

### 4.1 El catálogo actual no escala

`catalog.js` es una **lista plana** de 27 entradas sin categorías, sin iconos y sin
etiquetas. El grid es una sola sección (`index.html:17-44`) regenerada íntegra en cada
`renderCatalogGrids()` (`app.js:388`). Con 42 tarjetas serían ~5 pantallas de scroll sin
punto de anclaje, y la barra lateral del laboratorio (`fillSidebarUnified`,
`app.js:565`) una lista de 42 botones idénticos.

**No hay búsqueda.** Cero campos de filtro en el HTML.

### 4.2 Trabajo ya hecho que se puede aprovechar

- `mod.glyph` y `mod.accent` **ya se leen** en `app.js:392` y `app.js:412`, con CSS
  `.catalog-card-accent-*` — pero ninguna entrada los define. Soporte de iconos y color
  por categoría listo, sin escribir CSS nuevo.
- Los badges `ready` / `soon` existen (`app.js:400-407`, `catalog.css:221`) sin ninguna
  entrada que los use — la vía prevista para anunciar módulos en desarrollo.
- `LEVELS` y `getByLevel()` (`catalog.js:8-12`, `373`) existen pero **`getByLevel` no se
  importa en ningún sitio** y `state.catalogLevel` se escribe y nunca se lee
  (`app.js:30`, `611`, `746`). Hay una capa de niveles a medio construir.

### 4.3 Cambios

1. **Añadir `category`, `glyph` y `serves[]`** a cada entrada del catálogo, según §3.4
   y §3.5.
2. **Renderizar por secciones** con encabezado plegable y contador; recordar el estado
   de plegado.
3. **Buscador** sobre nombre y descripción → §4.4, su propia sección.
4. **Filtro por nivel** reactivando `getByLevel()` y `state.catalogLevel`.
5. **Barra lateral agrupada** por categoría, con la sección activa expandida.
6. **Renderizado incremental**: dejar de regenerar el grid completo en cada retorno al
   menú.
7. **Mostrar «Útil para»** en la ficha de cada módulo, y renderizar por fin el campo
   `topic` (§8.3).

### 4.4 Buscador del catálogo

Con 46 módulos en 12 categorías, la búsqueda deja de ser una comodidad y pasa a ser
**la vía principal de acceso**. Hoy no existe: cero campos de filtro en
`index.html`.

#### Qué se indexa

Nombre **y** descripción, más los campos que hacen encontrable un tema colapsado:

| Campo | Peso | Ejemplo |
|---|---|---|
| `title` / `titleEn` | ×5 | «Cantidad de movimiento» / «Momentum» |
| `serves[]` (§3.4) | ×4 | «Impulso», «Conservación del momento lineal» |
| `modes[].label` y `modes[].serves[]` | ×4 | «Impulso» → modo interno de `momentum` |
| `blurb` (descripción corta) | ×2 | «Colisiones 1D de dos cuerpos…» |
| `topic` (desambiguación) | ×2 | Ya existe y hoy no se muestra ni se busca |
| `formulas[].name` y símbolos | ×1 | «p = mv», «J = FΔt» |
| `category` | ×1 | «Trabajo, energía y momento» |

#### Comportamiento

- **Incremental**, filtra según se escribe, sin botón de buscar.
- **Insensible a acentos y mayúsculas** — `normalizeSchool()` (`auth.js:137-144`) ya
  hace exactamente esta normalización NFD; se extrae a `js/core/text.js` y se reutiliza.
  Sin esto, «cinematica» no encontraría «Cinemática».
- **Tolerante a erratas** para consultas de ≥4 caracteres (distancia de edición 1):
  «impluso» → «impulso».
- **Resultados agrupados por categoría**, respetando la estructura del menú.
- **Resalta la coincidencia** e indica **por qué** aparece: si «impulso» encuentra
  `momentum`, el resultado debe mostrar «Útil para: **Impulso**», no sólo el título.
  Es lo que evita que el usuario piense que el buscador se equivocó.
- **Sin resultados** → sugerir los términos cercanos del índice, nunca una pantalla vacía.
- **Atajo de teclado** (`/` o `Ctrl-K`) y foco automático al abrir el catálogo.

#### Resultados que apuntan a un modo

Es el requisito que sostiene toda la deduplicación de §3.2. Si un término coincide con
un modo, el resultado es **el modo**, no el módulo:

```
Buscar: "impulso"
┌────────────────────────────────────────────────┐
│ Cantidad de movimiento · modo Impulso          │
│ Útil para: Impulso, Teorema impulso-momento    │
│ → #/m/momentum?mode=impulse                    │
└────────────────────────────────────────────────┘
```

Requiere que el enrutador acepte el parámetro de modo. `parseAppRoute`
(`app.js:452-464`) y `syncBrowserHistory` (`app.js:478-493`) hoy sólo entienden
`#/m/<id>`: hay que extenderlos, y que el módulo lea el modo inicial en `init()`.
Beneficio adicional: el docente puede **enlazar directamente a un modo concreto** en su
guía de clase.

#### Implementación

Índice plano construido una vez al cargar el catálogo (46 módulos × ~10 términos ≈ 500
entradas). Es un array en memoria de unos pocos KB: **no hace falta ninguna librería de
búsqueda**, un filtro con puntuación sobre un array de ese tamaño es instantáneo. Se
reconstruye sólo si cambia el catálogo.

El mismo índice sirve a la **barra lateral del laboratorio**, que con 46 módulos
necesita buscador tanto como el catálogo.

### 4.5 Registro de módulos en un solo sitio

Hoy añadir un módulo exige tocar **tres archivos**: `ENGINE_PATHS` (`app.js:40-69`),
`CATALOG` (`catalog.js:61`) y `CHALLENGE_MODULE_LABELS` (`challenges.js:13`). Con 42
módulos es una fuente garantizada de desincronización.

Unificar en la entrada del catálogo, derivando las otras dos estructuras. Reduce el
alta de un módulo a: **crear el archivo y añadir una entrada.**

```js
{
  id: 'momentum',
  path: './modules/momentum.js',        // absorbe ENGINE_PATHS
  title: 'Cantidad de movimiento',
  titleEn: 'Momentum',
  category: 'energia-momento',          // §3.5
  glyph: '⚫',                           // ya soportado en app.js:392, sin usar
  level: 'high',
  blurb: 'Choques de dos cuerpos en 1D: elástico, inelástico y coeficiente de restitución.',
  topic: 'Se centra en la conservación de p⃗ en una dimensión; para choques en el plano, ver Colisiones multicuerpo.',
  serves: [                             // §3.4 — se muestra y se busca
    'Momento lineal', 'Impulso', 'Conservación del momento lineal',
    'Choques elásticos e inelásticos', 'Coeficiente de restitución'
  ],
  modes: [                              // destino de búsqueda con enlace profundo
    { id: 'collision', label: 'Choques',  serves: ['Choques elásticos e inelásticos'] },
    { id: 'impulse',   label: 'Impulso',  serves: ['Impulso', 'Teorema impulso-momento', 'Gráfica F–t'] }
  ],
  challengeLabel: 'Cantidad de movimiento',  // absorbe CHALLENGE_MODULE_LABELS
  status: 'ready'
}
```

Un test de regresión (§7.4 nº 3) verifica que todo `path` existe, que todo `category`
está en la lista de §3.5, y que ningún término de `serves[]` aparece en dos módulos sin
justificación — esto último detectaría automáticamente una duplicación de temas futura.

## 4.10 Lo que quedó hecho

> ✅ **Hecha**. Balance de lo entregado, las desviaciones sobre el plan y lo que sigue
> abierto. Verificación: `node --check` sobre los archivos tocados y pruebas de humo
> del índice de búsqueda en Node (sin navegador).

### Entregado

**§4.3 nº 1-5 y 7 — Catálogo por secciones, filtros y «Útil para».**
- `CATEGORIES` (12 categorías con glyph y accent) ya estaba en `catalog.js`; se enlaza
  con el grid y la barra lateral.
- Grid por **secciones plegables** con chevrón, glyph, título y contador; el estado de
  plegado se persiste en `localStorage` (`fisicahn_catalog_collapsed`).
- **Filtro por nivel** (Todos / ESO / Bachillerato / Universidad) reactivando
  `state.catalogLevel` y la capa `level` que ya existía en cada entrada.
- Ficha del módulo: «Útil para» (`serves[]`) al pie del panel de parámetros y el campo
  `topic` en la tarjeta (por fin se muestra).
- Barra lateral del laboratorio **agrupada por categoría**, con la sección activa
  expandida y las demás plegadas.

**§4.4 — Buscador del catálogo.** Nuevo `js/catalog-search.js`:
- Índice plano (≈260 entradas) con pesos por campo según la tabla del plan; se
  construye una vez y se reutiliza en grid y sugerencias.
- Incremental (debounce 180 ms), normalización NFD compartida con `auth.js` vía
  `js/core/text.js`, tolerancia a erratas **por palabra** (distancia 1; 2 para
  consultas ≥6 caracteres), resultados agrupados por categoría, resaltado de la
  coincidencia y motivo de aparición («Útil para: Impulso»).
- «Sin resultados» nunca deja pantalla vacía: sugiere términos cercanos clickables.
- Atajos `/` y `Ctrl-K`; foco automático la primera vez.
- **Enlaces profundos a modos**: `#/m/<id>?mode=<modo>` — el enrutador los entiende
  (`parseAppRoute`), se propagan por `history.state` y el módulo aplica el parámetro
  inicial tras `init()` (`loadEngineModule`). «Impulso» abre `momentum` en el modo
  Impulso. Funciona con los `modes[]` de `momentum`, `circuits-dc-ac` y `kepler-orbits`.

**§4.5 — Registro en un solo sitio.** `ENGINE_PATHS` (app.js) y
`CHALLENGE_MODULE_LABELS` (challenges.js) se derivan del catálogo con
`buildEnginePaths()` y `buildChallengeLabels()`; `CHALLENGE_ENGINES` ya era un objeto
vacío. Registrar un módulo es crear el archivo y añadir la entrada.

### Desviaciones

- **§4.3 nº 6 (renderizado incremental).** El grid se regenera salvo que la firma
  (nivel + consulta + nº de trabajos) no cambie; no se llegó a un verdadero diffing de
  tarjetas, que no aporta con 27 módulos y un render que ya es <5 ms.
- **Buscador en la barra lateral.** El plan lo menciona («el mismo índice sirve a la
  barra lateral»); se entregó la agrupación por categoría, que es el remedio principal
  al listado plano. El buscador lateral puede venir en WAVE 7 con la capa de calidad.
- **Peso de `topic`** en el índice: se indexa a ×2 como dice el plan, pero se muestra
  en la tarjeta aunque la búsqueda no la haya resaltado.

### Verificación

`node --check` sobre `app.js`, `catalog.js`, `catalog-search.js`, `challenges.js`,
`core/text.js` y `auth.js`, más pruebas de humo del índice: «eletricidad» (errata) →
`electric-field`; «choque» → `momentum` modo `choque`; «impulso» → modo `impulso`;
«gravitacional» → `kepler-orbits`; sin resultados → sugerencias por cercanía. Sin
tests automatizados en el árbol (mismo criterio que WAVE 3).

---

# WAVE 5 — Nuevos módulos de física

**Depende de:** WAVE 1 (contrato), WAVE 2 (escena), WAVE 4 (categorías).
**Motivo del orden:** escribir 19 módulos con la API antigua obligaría a migrarlos
después. Con el nuevo contrato, cada módulo nuevo nace ya en su forma final.

> **Estado (tanda 5.1 — Fundamentos): ✅ entregada.** `units-error`, `vectors`,
> `projectile`, `mass-weight` e `inclined-plane` (ver balance en [§5.7](#57-balance-de-la-tanda-51)).
>
> **Estado (tanda 5.2 — Mecánica ampliada): ✅ entregada.** `pendulum` (con doble
> péndulo), `fluids` (Arquímedes + Bernoulli), `elasticity`, modo Impulso con
> área F–t en `momentum`, Hooke (spring) en `oscillatory` y Momento angular en
> `rotational` (ver balance en [§5.8](#58-balance-de-la-tanda-52)).
>
> **Estado (tanda 5.4 — Óptica y electromagnetismo): ✅ entregada.** `mirrors`
> (espejos cóncavo/convexo), `induction` (Faraday-Lenz + transformador),
> `optical-instruments` (ojo, lupa, microscopio, telescopio), migración de
> `circuits` (modo RC con dieléctricos) y de `em-waves` (modo Polarización con la
> ley de Malus) al contrato nuevo (ver balance en [§5.10](#510-balance-de-la-tanda-54)).

Las tandas están ordenadas por **valor curricular** (cobertura del currículo hondureño
de secundaria primero) y por **reutilización de primitivas** de WAVE 2. Cada tanda es
entregable por separado: al cerrar una, el catálogo crece y el proyecto queda estable.

### Tanda 5.1 — Fundamentos (cierra el currículo básico)

| Módulo | Primitivas nuevas que ejercita |
|---|---|
| `units-error` | Formularios y validación; sin canvas pesado |
| `vectors` | `vector`, `angleArc`, `dimension`, arrastre interactivo (§2.6) |
| `projectile` | `trail`, `plot`, `dimension` |
| `mass-weight` | `body`, `chip`, comparación multipanel |
| `inclined-plane` | `polygon`, `vector`, `pulley`, `angleArc` |

### Tanda 5.2 — Mecánica ampliada

| Módulo | Notas |
|---|---|
| `pendulum` | Integración angular; contraste ángulo pequeño vs grande |
| `fluids` | Requiere primitiva de relleno con nivel; Arquímedes + Bernoulli |
| `elasticity` | Curva σ–ε con `plot`; régimen elástico y plástico |
| Modo **Impulso** en `momentum` | `plot` con área bajo F–t |
| Modo **Hooke** en `oscillatory-energy` | `spring` |
| Modo **Momento angular** en `rotational` | |
| Modo **Doble péndulo** en `pendulum` | Cierra la tanda; sensibilidad a condiciones iniciales |

### Tanda 5.3 — Térmica y ondas

| Módulo | Notas |
|---|---|
| `calorimetry` | Meseta de cambio de fase; `plot` de T vs Q |
| `kinetic-theory` | N moléculas + histograma de Maxwell-Boltzmann |
| `thermal-expansion` | Tira bimetálica; dilatación lineal, superficial y volumétrica |
| `standing-waves` | `wavefront`, nodos y antinodos, armónicos |
| Modo **Radiación y convección** en `calorimetry` | |
| Modo **Batidos** en `standing-waves` | |
| Modo **Intensidad y dB** en `sound-waves` | |

### Tanda 5.4 — Óptica y electromagnetismo

| Módulo | Notas |
|---|---|
| `mirrors` | Reutiliza el trazado de rayos de `thin-lenses` |
| `optical-instruments` | Encadenado de lentes; requiere `mirrors` y `thin-lenses` estables |
| `induction` | `field`, flujo variable, ley de Lenz |
| Modo **RC** en `circuits-dc-ac` | Carga/descarga + dieléctricos |
| Modo **Transformador** en `induction` | Inducción mutua, relación de espiras |
| Modo **Polarización** en `em-waves` | Ley de Malus con dos polarizadores |

### Tanda 5.5 — Física moderna

| Módulo | Notas |
|---|---|
| `de-broglie` | Patrón acumulado electrón a electrón |
| `nuclear-energy` | Curva de energía de enlace; fisión y fusión |
| `special-relativity` | Factor γ; dilatación temporal y contracción de longitud |
| `quantum-history` | Línea de tiempo con mini-demos de `photoelectric`, `atomic`, `tunneling`. **Va la última**: incrusta módulos que deben existir ya |

### 5.6 Criterio de aceptación por módulo

Para no repetir los desajustes actuales, cada módulo nuevo debe traer:

- Ficha de catálogo con `category`, `glyph`, `blurb` y `topic` (este último **explicando
  en qué se diferencia de sus vecinos** — el campo ya existe y está bien usado, pero hoy
  no se renderiza en ninguna parte).
- **`serves[]` con al menos 3 temas** en la redacción de los programas de estudio
  (§3.4), y `modes[].serves[]` en cada modo interno. Sin esto el módulo es invisible
  para el buscador (§4.4). Se verifica en el test de regresión de catálogo.
- `readout()` con magnitudes y unidades correctas.
- `getState()` / `setState()` para que sea guardable en «Mis trabajos».
- Fórmulas en LaTeX vía `setModuleFormulas`.
- Al menos 5 retos en el pack de ejemplo.

### 5.7 Balance de la tanda 5.1 (Fundamentos)

> ✅ **Entregada** con los cinco módulos: `units-error`, `vectors`, `projectile`,
> `mass-weight` e `inclined-plane`. Todos nacen en el contrato nuevo
> (`SimModule` + `static params` + `draw(scene)` + `readout()` numérico), así
> que la comparación lado a lado (§2.9) y los enlaces profundos a modo (§4.4)
> funcionan desde el primer día.

**Qué aporta cada uno a las primitivas de la tanda:**

| Módulo | Primitivas ejercitadas | Detalle pedagógico |
|---|---|---|
| `units-error` | `rect`, `dimension`, `chip`, validación de formulario | Cifras significativas + error relativo; 5 dimensiones SI lineales; prefiere mostrar «dato inválido» antes que un resultado falso |
| `vectors` | `vector`, `angleArc`, `dimension`, arrastre (§2.6) | Paralelogramo + descomposición; las puntas de A y B se arrastran |
| `projectile` | `trail`, `plot`, `dimension` | Alcance por interpolación al aterrizar; gráfica y(t) en lienzo |
| `mass-weight` | `body`, `chip`, barras multipanel | Comparación W por astro; W = m·g frente a m invariante |
| `inclined-plane` | `polygon`, `vector`, `pulley`, `angleArc` | Triángulo de fuerzas; estática cuando |F_net| ≤ μ·N; contrapeso opcional |

**Criterio de aceptación (§5.6):** todos traen `category`+`glyph`+`blurb`+`topic`
(explicando la diferencia con sus vecinos), `serves[]` con 6 temas, `modes[]`
con enlace profundo (`units-error`, `vectors`, `mass-weight`, `inclined-plane`),
`readout()`, `getState()`/`setState()`, fórmulas LaTeX y 6 retos en
`ejemplo-pack-examen.json`.

**Verificación:** `node --check` sobre los 5 módulos y `catalog.js`; humo del
índice («paralelogramo» → `vectors#suma`, «plano inclinado» → `inclined-plane#plano»,
«conversion de unidades» → `units-error`); simulación de 240 ticks con `update()`
por módulo sin excepciones y `readout()` con unidades correctas (R = 32.85 m,
W = 490 N, a = 1.6 m/s² con el contrapeso por defecto).

**Pendiente:** en el rango visual de la escena no se llegó a dibujar el vector de
la tensión en la cuerda del plano inclinado (la tensión se aproxima por W₂ en el
readout); el contraste lado a lado entre materiales de `elasticity` (Acero frente
a Caucho) es el caso de uso natural de la comparación §2.9.

### 5.8 Balance de la tanda 5.2 (Mecánica ampliada)

> ✅ **Entregada.** La tanda añade tres módulos nuevos (`pendulum`, `fluids`,
> `elasticity`) y los dos modos pendientes de motores existentes: Impulso con
> área bajo F–t en `momentum`, y las migraciones de `oscillatory` y `rotational`
> al contrato nuevo con sus modos Hooke/amortiguado y Momento angular.

**Novedades en la escena (§2.4) para esta tanda:**

| Primitiva | Para qué |
|---|---|
| `scene.fill(x, y, w, h)` | Relleno de líquido con superficie horizontal ondulada (modo Arquímedes) |
| `plot` con `series[].fill` | Área bajo la curva: impulso J = ∫F·dt y resiliencia (área elástica de σ–ε) |
| `scene.spring(a, b)` | Muelle real entre la pared y la masa en `oscillatory` |

**Contraste pedagógico que cierra cada módulo:**

| Módulo | Contraste que se ve sin leer nada |
|---|---|
| `pendulum` | Fantasma de la solución lineal superpuesto: a 10° coincide con la estela real, a 60° se separa (T medido 3.42 s vs 3.17 s) |
| `pendulum` doble | ε en μrad: dos estelas idénticas que divergen hasta 672° en 40 s (exponente de Lyapunov) |
| `fluids` | Cubo que flota con su línea de flotación frente a uno que se hunde con a = g(1−ρf/ρb) |
| `elasticity` | Punto vivo sobre la curva σ–ε: el área elástica resaltada es la resiliencia |
| `oscillatory` | Envolvente e^{−γt} visible en la estela; Em cae de 750 J a 0.03 J en 10 s con γ = 0.5 |
| `rotational` momentum | «Patinador»: al encoger el brazo r, ω sube al instante con L constante (E sube de 36 a 144 J) |

**Criterio de aceptación (§5.6):** los tres módulos nuevos traen
`category`+`glyph`+`blurb`+`topic`, `serves[]`, `modes[]` con enlace profundo
(`pendulum#simple|#doble`, `fluids#arquimedes|#bernoulli`), `readout()` numérico,
`getState()`/`setState()`, fórmulas LaTeX y 6 retos cada uno en
`ejemplo-pack-examen.json`. `oscillatory` y `rotational` migrados reciben
también `modes[]` (`#mhs`, `#amortiguado`, `#torque`, `#circular`, `#momentum`,
`#precession`) y dejan de ser motores legacy — bajan los 27 originales a 17.

**Verificación:** `node --check` en los 6 archivos tocados + app/catalog/scene;
humo de dibujo (fake scene) sobre los 12 módulos migrados sin excepciones;
humo del buscador: «venturi» → `fluids#bernoulli`, «caos» → `pendulum#doble`,
«precesion» → `rotational#precession`, «resiliencia» → `elasticity`.

**Pendiente:** el modo Bernoulli dibuja la columna del manómetro con escala
visual fija (no proporcional a la columna real de kPa); `circuits` y `kepler`
siguen con `modes[]` declarados en catálogo sin motor migrado (enlace profundo
inactivo) — arrastrado desde WAVE 4. El resto de la tanda 5.3 (térmica y ondas)
queda para la siguiente entrega.

### 5.9 Balance de la tanda 5.3 (Térmica y ondas)

> ✅ **Entregada.** La tanda añade cuatro módulos nuevos (`calorimetry`,
> `kinetic-theory`, `thermal-expansion`, `standing-waves`) y el modo
> Intensidad y dB en `sound` (con su migración al contrato nuevo). Cierra las
> categorías Térmica y Oscilaciones y ondas del catálogo, menos la deuda
> heredada de WAVE 4 (`modes[]` declarados sin motor en `circuits` y `kepler`).

**Novedades en la escena (§2.4) para esta tanda:**

| Primitiva | Para qué |
|---|---|
| `scene.hud.plot` | Curva T vs Q con la meseta de fusión (calorimetría) y espectro de armónicos fₙ = n·f₁ (ondas estacionarias) |
| `scene.hud.readout` | Panel de datos numérico en todos los modos (batidos, intensidad dB, mezcla) |

**Contraste pedagógico que cierra cada módulo:**

| Módulo | Contraste que se ve sin leer nada |
|---|---|
| `calorimetry` | Meseta plana a 0 °C en T vs Q mientras el hielo se funde; el calor latente no sube la temperatura |
| `kinetic-theory` | Termostato que converge a T fijada (300 K) y histograma que se acerca a Maxwell–Boltzmann |
| `thermal-expansion` | Tira bimetálica que se curva con ΔT: el metal de mayor α queda fuera del arco |
| `standing-waves` | Nodos fijos e inversión de fase entre armónicos; batidos con envolvente que marca T_batido |
| `sound` | El sonido más fuerte «no viaja más lejos»: a 10 m son −20 dB respecto a 1 m, siempre (β₁ = 99.0 dB → β₁₀ = 79.0 dB con 100 mW) |

**Criterio de aceptación (§5.6):** los cuatro módulos nuevos traen
`category`+`glyph`+`blurb`+`topic`, `serves[]`, `modes[]` con enlace profundo
(`calorimetry#mezcla|#fase|#conduccion`, `kinetic-theory#caja|#binaria`,
`thermal-expansion#lineal|#superficial|#volumetrica|#bimetalica`,
`standing-waves#cuerda|#batidos`, `sound-waves#doppler|#intensidad`), `readout()`
numérico, `getState()`/`setState()`, fórmulas LaTeX y retos en
`ejemplo-pack-examen.json`. `sound` deja de ser legacy (bajan los 27 originales
a 16).

**Verificación:** `node --check` en los 5 archivos tocados y `catalog.js`; humo
de dibujo (fake scene) con 240 ticks sin excepciones y `readout()` con unidades
por módulo; física contrastada con el valor analítico:

| Módulo | Referencia analítica |
|---|---|
| `calorimetry` | T_eq = 32.62 °C (mezcla 1 kg agua 20 °C + 1 kg c=450 a 150 °C); P = 8 000 W (conducción k=200, A=0.5, L=1, ΔT=80) |
| `kinetic-theory` | v_rms = 422.1 m/s (N₂ a 300 K); T medida = 300 K tras 15 s |
| `thermal-expansion` | ΔL = 2.4 mm (acero, 2 m, ΔT = 100 °C) |
| `standing-waves` | v = 80 m/s (T=64, μ=0.01); f₃ = 60 Hz; λ = 4/3 m; f_batido = 1 Hz |
| `sound` | v = 343 m/s (20 °C); f′ = 2.012 Hz (f=2, vₛ=2); β₁₀ = β₁ − 20 dB |

**Tests versionados:** `skills/fisicahn/js/tests/smoke-53.test.mjs` y
`physics-53.test.mjs` (`node --test` → 10/10 verdes).

**Pendiente:** queda la tanda 5.4 (Óptica y electromagnetismo): `mirrors`,
`optical-instruments`, `induction` y los modos RC (`circuits-dc-ac`),
Transformador (`induction`) y Polarización (`em-waves`). La deuda de
`modes[]` de `circuits`/`kepler` se salda al migrar `circuits-dc-ac` en la 5.4.

---

### 5.10 Balance de la tanda 5.4 (Óptica y electromagnetismo)

> ✅ **Entregada.** La tanda añade tres módulos nuevos (`mirrors`, `induction`,
> `optical-instruments`) y **saldaba la deuda de WAVE 4**: `circuits-dc-ac` y
> `em-waves` dejan de ser legacy y migran al contrato `SimModule`, incorporando
> los modos que el catálogo ya prometía sin motor (RC con dieléctricos en
> `circuits`, Polarización con Malus en `em-waves`). Cierra las categorías
> Óptica e Inducción/transformadores del currículo de secundaria.

**Novedades en la escena para esta tanda:**

| Primitiva | Para qué |
|---|---|
| `scene.hud.plot` | Historial Φ(t) y ε(t) superpuestos en Faraday; V₁/V₂ de las dos bobinas en el transformador |
| `scene.vector` con tramo discontinuo | Prolongación virtual de rayos (imagen virtual de lupa, microscopio y telescopio) |
| `scene.hud.chip` con color condicional | Aviso de presbicia (acomodación agotada) en el ojo; estado carga/descarga en RC |

**Contraste pedagógico que cierra cada módulo:**

| Módulo | Contraste que se ve sin leer nada |
|---|---|
| `mirrors` | Objeto entre F y el vértice: pasa de imagen real invertida (del lado del objeto) a virtual derecha y mayor — la ecuación del espejo cambia de signo |
| `induction` | El imán cruza el centro a máxima velocidad → |ε| máximo; en los extremos Φ es máximo pero ε = 0: **flujo ≠ fem** |
| `optical-instruments` | El ojo acomoda (f querido) para que la imagen caiga siempre en la retina; la lupa da una imagen virtual derecha y M = 1 + N/f; el telescopio amplifica el ángulo con f_o/f_e |
| `circuits-dc-ac` | RC: la carga sigue la exponencial V(1−e^(−t/τ)) y el dieléctrico (κ) sube la capacidad hasta la meseta del 63.2 % |
| `em-waves` | Polarizador a 45°: la luz cae a la mitad (Malus); a 90° se apaga del todo |

**Criterio de aceptación (§5.6):** `mirrors`, `induction` y `optical-instruments`
traen `category`+`glyph`+`blurb`+`topic`, `serves[]`, `modes[]` con enlace
profundo (`mirrors#concavo|#convexo`, `induction#faraday|#transformador`,
`optical-instruments#ojo|#lupa|#microscopio|#telescopio`,
`em-waves#plana|#polarizacion`, `circuits-dc-ac#series|#parallel|#rlc|#rc`),
`readout()` numérico, `getState()`/`setState()`, fórmulas LaTeX y retos en
`ejemplo-pack-examen.json` (mirrors, induction, optical-instruments, em-waves y
circuits: 6 retos por módulo, 30 nuevos). El catálogo incorpora los tres módulos
nuevos (`mirrors`, `induction`, `optical-instruments`) y alinea los `modes[]` de
`circuits-dc-ac[#series|#parallel|#rlc|#rc]` y `em-waves[#plana|#polarizacion]`
con los valores reales de sus motores migrados, cerrando la deuda de WAVE 4.

**Verificación:** `node --check` en los 5 archivos tocados y `catalog.js`; humo
de dibujo (fake scene) con 240 ticks sin excepciones y `readout()` con unidades
por módulo; física contrastada con el valor analítico:

| Módulo | Referencia analítica |
|---|---|
| `mirrors` | dᵢ = 2.4 m (cóncavo f=1.5, d₀=4) real invertida; d₀ < f → virtual (−3 m); convexo siempre virtual |
| `induction` | ε = −N·dΦ/dt numérico ≈ analítico (Lorentziana con imán oscilante, tol 25 % del valor, lejos de centro/giros); transformador V₂ = V₁·(N₂/N₁) |
| `optical-instruments` | Ojo f = d₀·L/(d₀+L); lupa M = 1+N/f = 6× (f=5); microscopio M = 200× (L=16, f_o=1, f_e=2); telescopio M = 10 (f_o/f_e) |
| `circuits` (RC/RLC) | τ = R·C = 0.2 s (R=200 Ω, C=1000 µF); V_c(τ) ≈ 63.2 % con Euler explícito; f₀ = 1/(2π√(LC)) = 15.92 Hz; C = κ·C₀ (papel κ=3.5) |
| `em-waves` | Malus: I₂ = I₁·cos²θ → 100 % (0°), 50 % (45°), 25 % (60°), 0 (90°) |

**Tests versionados:** `skills/fisicahn/js/tests/smoke-54.test.mjs` y
`physics-54.test.mjs` (`node --test` → 11/11 verdes). Con la tanda 5.3 se
mantienen los 21 tests verdes (5.3: 10/10, 5.4: 11/11).

**Pendiente de mantenimiento detectado:** la deuda de `kepler` (`modes[]`
`kepler`/`flyby` declarados sin motor migrado) queda para la tanda 5.5; y la
primitiva `wavefront` pedida en 5.3 sigue sin existir en la API (standing-waves
pinta su envolvente con `polyline`). La tanda 5.5 (Física moderna: `de-broglie`,
`nuclear-energy`, `special-relativity`, `quantum-history`) es la siguiente.

---

# WAVE 6 — Base de datos y backend

**Independiente** de las demás WAVEs. `supabase/schema.sql`, 453 líneas, 7 tablas.

### 6.1 Lo que ya está bien

El endurecimiento de RLS **ya se hizo** y es correcto: no hay `WITH CHECK true`; el
insert anónimo de `student_works` valida 7 condiciones (`schema.sql:236-247`); el
soft-delete del alumno pasa por una RPC `SECURITY DEFINER` con `search_path` fijo y
validación de formato (`schema.sql:333-364`) en vez de un `UPDATE` libre; los `grant`
son explícitos por tabla y rol (`schema.sql:303-318`). La función
`current_teacher_school_key()` es `stable` + `security invoker` + `search_path`
fijado (`schema.sql:150-161`). Este archivo lo escribió alguien con criterio.

### 6.2 Problema estructural: el esquema no se garantiza a sí mismo

Todas las tablas siguen el patrón:

```sql
create table if not exists public.X ( … col text not null … );
alter table public.X add column if not exists col text;   -- sin NOT NULL
```

Si la tabla **ya existe** — que es el caso real, el archivo está pensado para
re-ejecutarse (`schema.sql:2`) — el `create table` no hace nada y los `add column`
añaden columnas **nullable y sin CHECK**. En las 453 líneas **no hay un solo
`alter column … set not null`**. Por tanto: `exams.school_key text not null`
(`schema.sql:64`) **no está garantizado** en la base viva, y es imposible saber leyendo
el archivo cuál es el esquema real de producción.

Agravante: tres bloques `do $$ … exception when others then null; end $$;`
(`schema.sql:49-60`, `132-141`, `286-300`) **se tragan cualquier error en silencio**. Si
el `unique (school_key)` de `schools` falla por duplicados preexistentes, el script
imprime «Success» y la restricción no existe.

**Corrección propuesta:**

1. Bloque idempotente de reconciliación que, para cada columna que debe ser `not null`,
   rellena los nulos con un valor por defecto y luego aplica `set not null`.
2. Sustituir `exception when others then null` por captura de la excepción **específica**
   (`duplicate_object`, `duplicate_table`) y `raise notice` en el resto. Un error de
   esquema debe verse.
3. Vista `public.schema_health` que reporte columnas esperadas `not null` que no lo son
   — verificable tras cada despliegue.

### 6.3 Correcciones concretas de esquema

| # | Problema | Corrección |
|---|---|---|
| 1 | **`exams.code` no es único.** `exams_code_active_idx` (`schema.sql:78`) es un índice **parcial no único**. Dos exámenes activos pueden compartir código | Índice único parcial `on exams (code) where active`. Es un fallo funcional: `challenge_packs_select_active` (`schema.sql:411-419`) hace `where e.code = … and e.active` — con códigos duplicados un alumno podría recibir el pack equivocado |
| 2 | `teacher_profiles.updated_at` y `exam_challenge_packs.updated_at` existen **sin trigger** | Trigger `set_updated_at()` compartido |
| 3 | `student_works.mode` sin CHECK a nivel de tabla | La política valida `^[a-z_]+$` sólo en insert anónimo; añadir CHECK (`'practice'`, `'exam'`) |
| 4 | `exams.school_id` (FK) y `exams.school_key` (texto) coexisten | Decidir la canónica; hoy las políticas usan `school_key` y `school_id` no se filtra nunca |
| 5 | `audit_log` sin índice y sin política de retención | Índice `(school_key, created_at desc)` + purga programada |
| 6 | `audit_log` **sin política de SELECT** | Sólo tiene insert (`schema.sql:263`). Nadie puede leer la auditoría, ni el docente dueño |
| 7 | `schools.owner_id is null` legible por cualquier autenticado (`schema.sql:188`) | Colegios huérfanos visibles para todos; acotar o migrar a propietario |
| 8 | `improvement_ideas` sin índice por fecha para moderación | `(created_at desc)` |
| 9 | Sin sistema de migraciones — `supabase/` sólo contiene `schema.sql` | Ver §6.4 |

### 6.4 Sistema de migraciones

> **Decidido: alcance completo.** Es el único cambio que deja el esquema trazable.

Hoy `supabase/` contiene **un solo archivo** que se pega en el SQL Editor y se ejecuta a
mano. No hay forma de saber qué versión corre en producción, ni de aplicar un cambio
sin releer las 453 líneas, ni de revertir.

**Estructura propuesta:**

```
supabase/
  migrations/
    0001_initial_schema.sql        ← el schema.sql actual, congelado
    0002_reconcile_not_null.sql    ← §6.2, reconciliación idempotente
    0003_exams_code_unique.sql     ← §6.3 nº 1
    0004_updated_at_triggers.sql   ← §6.3 nº 2
    0005_audit_log_policy_index.sql← §6.3 nº 5 y 6
    0006_exams_school_canonical.sql← §6.5
  schema.sql                        ← generado: estado acumulado, sólo lectura
  README.md                         ← cómo aplicar y cómo revertir
```

**Reglas:**

1. Cada migración es **idempotente** y lleva número correlativo.
2. Tabla de control `public.schema_migrations (version int primary key, applied_at timestamptz, checksum text)`.
   Cada archivo registra su versión al final; si ya está aplicada, no hace nada.
3. `schema.sql` deja de editarse a mano: pasa a ser el **estado acumulado** regenerado,
   útil para levantar un entorno nuevo de cero.
4. Cada migración lleva su **sección de reversión** comentada. No todas serán
   reversibles (un `set not null` que rellenó nulos no lo es); eso debe estar escrito.
5. Ninguna migración usa `exception when others then null` (§6.2).

**Migración cero — verificar antes de tocar nada.** Como el esquema real de producción
puede haber divergido del archivo (§6.2), el paso previo obligatorio es volcar el
esquema vivo (`pg_dump --schema-only`) y compararlo con `schema.sql`. La `0001` debe
reflejar **lo que hay**, no lo que el archivo dice que hay.

### 6.5 Resolver `school_id` vs `school_key` en `exams`

`exams` tiene las dos: `school_id uuid` con FK a `schools` (`schema.sql:70`) y
`school_key text` (`schema.sql:71`). **Las políticas RLS usan sólo `school_key`**
(`schema.sql:225`, `229`) y `school_id` no se filtra nunca en ninguna consulta de
`supabase-client.js`. Es una FK muerta que sugiere una normalización a medio hacer.

Dos salidas coherentes, a elegir:

- **`school_key` canónica** (menos trabajo): eliminar `school_id`, documentar que
  `school_key` es la clave de negocio y que `schools.school_key` es única
  (`schema.sql:56`). Coherente con lo que el código ya hace.
- **`school_id` canónica** (más correcta): migrar las políticas a `school_id`, con
  `current_teacher_school_id()` en lugar de `current_teacher_school_key()`, y dejar
  `school_key` sólo como código legible para el usuario. Requiere backfill y reescribir
  6 políticas.

Recomendación: la primera, salvo que se prevean colegios que cambien de nombre o clave.

### 6.6 Seguridad de aplicación

**`hashPassword` es débil** (`auth.js:132-135`):

```js
return sha256(`${SALT}|${school}|${password}`);
```

SHA-256 de una pasada, sal **constante y compartida**, calculado en el cliente. Un
diccionario común se prueba a millones de intentos por segundo, y dos docentes del
mismo colegio con igual contraseña producen el mismo hash. Mitigante importante: es el
camino **local/offline** (registro en `localStorage`, `auth.js:146`); la autenticación
real es Supabase Auth. **Recomendación:** documentar explícitamente que ese registro no
es una credencial de seguridad, o migrarlo a PBKDF2/Argon2 vía WebCrypto si va a
protegerse algo con él.

**`computeIntegrity`** (`works.js:178`) es un SHA-256 del payload **sin clave**: detecta
edición accidental, no falsificación — cualquiera puede recalcularlo. El código ya es
honesto al respecto (`verifyWork` distingue «Sello débil (cliente)», `works.js:184`).
Para integridad real haría falta firma del lado servidor. Conviene que la UI del docente
lo refleje sin ambigüedad.

**Lógica de autorización en cliente:** revisar que toda regla de negocio del examen en
vivo (expulsar alumno, terminar examen) esté respaldada por RLS y no sólo por
`auth.js`/`works-panel.js`.

---

# WAVE 7 — Herramientas y calidad

**Transversal.** Arranca junto a WAVE 1 y acompaña al resto.

### 7.1 Estado actual: cero red de seguridad

- **Sin tests.** `find` de `*.test.js` / `*.spec.js` / `jest.config*` / `vitest.config*` →
  **0 archivos**.
- **Sin tipos ni lint.** No hay `tsconfig.json`, `jsconfig.json`, `.d.ts`, `@ts-check` ni
  ESLint. La densidad de JSDoc es irregular: `module-ui.js` 19 anotaciones,
  `physics-engine.js` 14, pero `kinematics.js` **0**, `friction.js` **0**, `optics.js` 1.
- **CI sólo despliega**, no verifica.

Con 42 módulos y un refactor de este tamaño por delante, esto es el mayor riesgo del
plan.

### 7.2 Las cuatro herramientas — confirmadas

> **Decidido: las cuatro entran.**

Todas son de **desarrollo**: no entran en el artefacto publicado, y el principio de
«sin build step» se mantiene intacto. Van en un `package.json` en la raíz con
`devDependencies` únicamente; `skills/fisicahn/` sigue sin dependencias y los tres
scripts de sync no cambian.

| Herramienta | Uso | Justificación |
|---|---|---|
| **Vitest** | Tests unitarios de física | Verificar que `kinematics` conserva la energía, que `momentum` conserva p⃗, que Snell da el ángulo correcto. Los motores son funciones puras sobre estado: son fáciles de testear |
| **ESLint** (config plana) | Reglas de arquitectura | `no-restricted-properties` sobre `canvas.width` bloquea la regresión del bug de DPR (§2.3); `no-restricted-syntax` prohíbe tocar el DOM dentro de `update()` (§3.1) |
| **`@ts-check` + JSDoc** | Tipado sin migrar a TS | Tipar el contrato `SimModule` y la API de escena. Cero cambios en runtime |
| **Presupuesto de rendimiento** | Script que mide frames y allocaciones | Evita que las regresiones de §3.2 vuelvan silenciosamente |

**Orden de adopción.** No las cuatro a la vez: cada una debe entrar cuando hay algo
que proteger.

1. **ESLint primero**, con las dos reglas de arquitectura. Es la de menor coste y la
   única que se puede aplicar **antes** del refactor: convierte los 8 bugs de DPR
   (§2.0) y los 22 módulos que tocan el DOM en `update()` (§3.1) en una lista de
   errores accionable, que además sirve de checklist de migración.
2. **Vitest** al empezar la WAVE 1, sobre los módulos ya migrados al contrato nuevo.
3. **`@ts-check`** sobre `js/core/` (contrato y escena) en cuanto exista; luego se
   extiende módulo a módulo.
4. **Presupuesto de rendimiento** al cerrar la WAVE 3, para fijar las cifras logradas.

**Reglas ESLint concretas a escribir:**

| Regla | Impide |
|---|---|
| `no-restricted-properties: canvas.width / canvas.height` | El bug de coordenadas DPR de §2.0 |
| `no-restricted-syntax` sobre `innerHTML` dentro de `update()` | El problema de rendimiento nº 1 de §3.1 |
| `no-restricted-imports` de `module-ui` en `js/modules/` | Que los módulos vuelvan a construir HTML |
| Prohibir `setTimeout(…, 0)` tras `setParams` | Los 27 bindings diferidos de §2.7 |

### 7.3 CI: de desplegar a verificar

`deploy-pages.yml` sólo despliega. Añadir un job previo que ejecute lint, tipos y
tests, y que **bloquee el despliegue si fallan**. Coste: un `npm ci` en CI; el
artefacto publicado no cambia ni un byte.

### 7.4 Tests que aportan valor real aquí

1. **Invariantes físicos** — energía, momento y carga se conservan cuando deben. Un test
   por ley, no por módulo.
2. **Contrato de módulo** — recorrer los 46 y verificar que implementan la interfaz,
   que `getState()`/`setState()` es reversible y que `destroy()` no deja listeners.
3. **Regresión de esquema** — que `catalog.js`, las rutas de motor y las etiquetas de
   retos estén sincronizadas (§4.4).
4. **Integridad de trabajos** — `computeIntegrity` estable entre versiones; un trabajo
   guardado hoy debe seguir abriéndose mañana.

### 7.5 Ideas no planificadas

Surgieron del análisis y **siguen fuera de las WAVEs**. Se dejan anotadas para
decidirlas más adelante:

| Idea | Valor | Coste |
|---|---|---|
| **Constructor de circuitos** por arrastre | Alto — lo pide `skills/03-electricidad-dc.md` y no existe | Alto |
| **Editor de escenarios** guiados (`steps[]`, `expectedParams`) | Alto — especificado en `skills/06-capa-pedagogica.md`, sin implementar | Alto (parcialmente en WAVE 8.3) |
| **Autoevaluación con retroalimentación** por error frecuente | Alto | Medio |
| **Exportar informe PDF** del trabajo del alumno | Medio | Medio |
| **i18n es/en** — `titleEn` ya existe en las 27 entradas | Medio | Medio |

---

# WAVE 8 — Capa pedagógica

### 8.1 El sistema de retos está desconectado

- **`CHALLENGE_ENGINES = {}` está vacío** (`challenges.js:11`), comentado como «rutas
  legacy … ya no se cargan». Los 4 JSON de `data/challenges/` son **código muerto**:
  nada los solicita.
- `engineHasBuiltInChallenges()` devuelve **`false` siempre** (`challenges.js:133-136`).
- Resultado: **ningún módulo tiene retos propios**. La pestaña «Retos»
  (`index.html:189`) sólo aparece si un docente publica un pack de examen.

### 8.2 Divergencia documentación ↔ código

`checkAnswer` (`challenges.js:291`) usa **tolerancia absoluta fija** `< 0.01`, mientras
`skills/06-capa-pedagogica.md:105,160-162` especifica **5 % relativo**. Con la
tolerancia absoluta, un reto cuya respuesta sea 29,4 m/s exige cuatro cifras exactas, y
uno cuya respuesta sea 0,005 es imposible de fallar. Hay que alinear ambos: la
tolerancia relativa es la correcta.

### 8.3 Trabajo

1. Reactivar los retos incorporados por módulo, con los 4 JSON existentes como semilla.
2. Corregir la tolerancia a relativa configurable por reto.
3. Extender a los 42 módulos (mínimo 5 retos, §5.6).
4. Implementar los **escenarios guiados** de `skills/06-capa-pedagogica.md`
   (`steps[]`, `expectedParams`, `validator`) — especificados y nunca construidos.
5. Renderizar el campo `topic` del catálogo, que hoy documenta muy bien las diferencias
   entre módulos vecinos y **no se muestra en ninguna parte**.

---

# WAVE 9 — Funciones docentes y distribución

**Depende de:** WAVE 2 (escena declarativa y exportación).
Recoge las dos funciones decididas que no encajan dentro del rediseño del canvas.

## 9.1 Grabar y reproducir demos

> **Decidido: entra en el plan.**

El caso real es concreto: el docente prepara en casa una simulación con los parámetros
exactos que quiere mostrar, y en clase la reproduce sin volver a ajustar deslizadores
delante de 40 estudiantes.

**Se graban las entradas, no los fotogramas.** Un `.json` de unos pocos KB en vez de un
vídeo de decenas de MB:

```js
{
  schema: 1, module: 'projectile', duration: 12.5,
  initial: { v0: 25, angle: 45, drag: 0.1 },     // estado inicial vía setState()
  events: [                                       // cambios en el tiempo
    { t: 0.0,  action: 'play' },
    { t: 3.2,  action: 'param', id: 'angle', value: 60 },
    { t: 7.8,  action: 'pause' },
    { t: 7.8,  action: 'annotate', text: 'Aquí el alcance es máximo' }
  ]
}
```

Piezas que **ya existen** y se reutilizan:

- `getState()` / `setState()` en 25 de 28 módulos → el estado inicial es gratis.
- El timestep fijo (`physics-engine.js:8`, `DEFAULT_DT = 1/60`) hace la simulación
  **determinista**: la misma entrada produce la misma salida, que es lo que permite
  reproducir desde eventos. Excepción: `radioactivity` y `kinetic-theory` usan
  aleatoriedad, así que necesitan **semilla registrada** en la grabación.
- El formato de trabajos de `works.js` sirve de contenedor: una grabación es un
  trabajo con un campo más, así que hereda guardado, exportación y sincronización.

Añade además: línea de tiempo con barra de progreso, control de velocidad y
**anotaciones temporizadas** — el docente marca el instante clave con un texto.

## 9.2 Exportar a GIF y vídeo

Continuación natural de §2.8. Con la escena declarativa, exportar es recorrer los
fotogramas y volcarlos:

- **GIF** para material asíncrono y guías impresas digitales.
- **WebM** vía `MediaRecorder` sobre `canvas.captureStream()` — API nativa del
  navegador, cero dependencias.
- **Secuencia PNG** para quien quiera montarlo aparte.

Restricción a documentar: en Electron y en el APK el rendimiento de captura es peor
que en navegador; conviene limitar la duración exportable.

## 9.3 PWA instalable offline

> **Decidido: entra en el plan.**

El simulador ya es **100 % estático y sin dependencias de red** — el ZIP offline
existente lo demuestra (`build-website.sh` genera `downloads/fisicahn.zip`). Convertirlo
en PWA es sobre todo declarativo:

1. **`manifest.webmanifest`** — nombre, iconos (ya existen en `mobile/android/.../mipmap-*`
   y `website/assets/`), `display: standalone`, color de tema.
2. **Service worker** con precaché del *app shell* y de los 46 módulos, estrategia
   *cache-first* para estáticos y *network-first* para Supabase.
3. **Indicador de estado** — `network-status.js` (187 líneas) ya detecta conectividad y
   tiene UI; sólo hay que conectarlo al estado del service worker.
4. **Actualización controlada**: aviso de «hay una versión nueva» en vez de recarga
   silenciosa, para no interrumpir un examen en curso.

**Valor concreto:** un cuarto canal de distribución que no requiere instalar nada ni
descargar un ZIP, funciona sin conexión y se actualiza solo. Es el más barato de los
cuatro (web, ZIP, Electron, APK) porque no añade empaquetado.

**Interacción con el examen en vivo — cuidado.** El modo examen depende de Supabase
(`checkExamStillActive`, `ensureExamLivenessPolling` en `auth.js`). El service worker
**nunca** debe cachear esas respuestas: un pack de retos o un estado «examen activo»
servido desde caché rompería la integridad del examen. Regla: todo lo que vaya a
`supabase.co` queda fuera del service worker.

---

# Anexo A — Métricas de referencia

Medir antes y después de cada WAVE.

| Métrica | Valor actual | Objetivo |
|---|---|---|
| Archivos generados en git | 76 (`website/sim/`) | 0 |
| Llamadas `ctx.*` crudas en módulos | 856 | < 100 |
| Primitivas de renderer usadas | 91 | > 800 |
| Escrituras de `innerHTML` por segundo | hasta 300 | ≤ 10 |
| Objetos asignados por frame (`particles`) | ~960 | < 50 |
| Operaciones de rejilla por frame | ~68 | 0 (en caché) |
| Módulos con bug de coordenadas DPR | 8 | 0 |
| Copias de helpers duplicados | 33 | 0 |
| Líneas en `js/modules/` | 8 331 | ~6 500 con 46 módulos |
| Módulos de física | 27 | 46 |
| Categorías en el menú | 0 | 12 |
| Buscador del catálogo | No existe | Nombre + descripción + `serves[]` + modos |
| Temas curriculares con ruta de entrada | ~27 (sólo por título) | ~200 vía `serves[]` |
| Temas alcanzables sólo por modo interno | — | 13, todos con enlace profundo |
| Cobertura de tests | 0 % | Invariantes físicos de los 46 |
| Reglas de arquitectura verificadas en CI | 0 | 4 |
| Columnas `not null` garantizadas por `schema.sql` | 0 | Todas las declaradas |
| Versión de esquema conocida en producción | Desconocida | Trazable (`schema_migrations`) |
| Canales de distribución | 4 (web, ZIP, Electron, APK) | 5 (+ PWA) |

---

# Anexo B — Decisiones tomadas

Decisiones que fijan el alcance de este documento.

| Pregunta | Decisión | Efecto |
|---|---|---|
| Herramientas de desarrollo | **Las cuatro**: Vitest, ESLint, `@ts-check`, presupuesto de rendimiento | WAVE 7 reescrita con orden de adopción y reglas concretas (§7.2). CI pasa a verificar, no sólo desplegar (§7.3) |
| Funciones nuevas | **Las cuatro**: modo proyector, comparación lado a lado, grabar/reproducir, PWA | Dejan de ser candidatas. Proyector → §2.5; comparación → §2.9; grabación y PWA → WAVE 9 |
| Alcance de `schema.sql` | **Todo, incluidas migraciones** | WAVE 6 gana §6.4 (migraciones numeradas + `schema_migrations`) y §6.5 (`school_id` vs `school_key`) |
| Módulos nuevos | **Los 15 + más cobertura** | 19 módulos nuevos → 46 totales. Añadidos `special-relativity`, `elasticity`, `thermal-expansion`, `optical-instruments`. Tanda 5.5 ampliada |

**Lo que no cambió:** el proyecto sigue **sin bundler, sin framework y sin build step**
en el artefacto publicado. Las cuatro herramientas son `devDependencies` en la raíz;
`skills/fisicahn/` no gana ni una dependencia y los tres scripts de sync no se tocan.

**Sobre «más cobertura»:** pediste ampliar, pero la regla de «ningún motor igual a
otro» es más restrictiva y la respeté por encima del volumen. Por eso transformadores,
polarización, batidos, doble péndulo, radiación/convección e intensidad sonora entraron
como **modos** y no como módulos (§3.2): comparten el motor numérico de un módulo
existente. El resultado son 46 módulos con 13 modos nuevos, en vez de ~55 módulos con
motores repetidos.

**Aprendido al ejecutar la WAVE 2:** el plan daba por hecho que «migrar a `SimModule`»
y «dibujar con la escena» eran el mismo paso. No lo son, y `kinematics` lo demostró:
es `SimModule` desde la WAVE 1 pero sigue siendo imperativo. De ahí `implementsMethod()`
y la regla de que el anfitrión sólo gestiona el panel Datos en módulos del contrato
completo. Cualquier WAVE futura que despache por capacidad del módulo debe comprobar
**sobreescritura**, nunca `typeof`.

**Añadido después:** campo `serves[]` con los temas que cubre cada módulo (§3.4) y
buscador sobre nombre y descripción (§4.4). Las dos piezas son inseparables de la
deduplicación anterior: sin ellas, fusionar 31 temas en 27 motores habría escondido
los temas absorbidos. El buscador indexa `serves[]` y **los modos son destino de
búsqueda con enlace profundo** (`#/m/momentum?mode=impulse`), de modo que los 13 temas
que viven dentro de un modo siguen teniendo su propia ruta de entrada.

---

## Nota sobre el alcance

Este documento es **diagnóstico y plan**, no un compromiso de ejecutar las nueve WAVEs
seguidas. Las WAVEs 0, 1, 2 y 3 forman un bloque coherente que puede acometerse solo y
deja el proyecto en mejor estado aunque no se continúe. **Las cuatro primeras están
hechas**; la WAVE 3 cerró el bloque con el throttle del panel de datos a 10 Hz, el bucle
de simulación honesto y el ahorro de energía. La WAVE 6 (base de datos) es
independiente y puede hacerse en cualquier momento. La WAVE 5 (temas nuevos) es la que
más valor visible aporta al usuario final, y por eso mismo la que más conviene no
empezar antes de tiempo.

Ninguna WAVE se ha implementado: el estado del repositorio no ha cambiado.

> _Nota de ejecución: este párrafo quedó obsoleto. Las WAVEs 0–3 se implementaron en sus
> commits correspondientes y el estado de cada una está en la tabla de la introducción._

---

# WAVE 10 — Auditoría de encuadre y corrección de los motores 5.1/5.2

> ✅ **Hecha** — commit `4e48d5b`.

Trabajo de fondo que desbloquea la migración: una auditoría geométrica con
**matrices de transformación** (viewbox 900×700, `Camera → Scene → ctx` falso con
los puntos proyectados por op) demostró que 8 motores de las tandas 5.1/5.2
pintaban fuera de pantalla. Causa raíz ya documentada en §2.0: primitivas que
recibían `viewport()` en px y `Surface.project` las interpretaba como mundo.

- Corregidos: `mass-weight`, `fluids`, `inclined-plane`, `elasticity`,
  `units-error`, `oscillatory`, `projectile`, `vectors` + `kinetic-theory`
  (paredes centradas). Tras la corrección, la auditoría completa muestra los 40
  motores `SimModule` dentro de ±3 px del viewbox.
- `Scene.pickable(id, bounds)` reexpuesto (§2.6); sin él `vectors` se caía en el
  `hitTest` (al uso de `scene.pickable` durante el `draw`).
- **Espacio infinito por defecto**: `unbounded = true` en `kinematics`,
  `dynamics` y `magnetic` (el botón global de la barra ya existía,
  `app.js:1668`).
- Nuevo módulo **Hipérbola** (`hyperbola.js`, categoría `medicion-vectores`,
  nivel high): lugar geométrico |PF₁ − PF₂| = 2a con punto P arrastrable
  (`onDrag` + enamorado de la rama), asíntotas y focos; `readout()` numérico.
- Tests: `js/tests/smoke-55.test.mjs` — auditoría bbox de los 9 motores + rifle
  de defaults. Suite completa: 32/32.

# WAVE 11 — Iconos SVG en el catálogo y el tocador

> ✅ **Hecha** — commit posterior.

Los emojis de `glyph` se sustituyen por **iconos SVG inline** (`js/core/icons.js`,
~2 KB, 24 × 24, `stroke="currentColor"`): cada categoría tiene un icono propio y
cada módulo hereda el de su categoría salvo los que tienen el suyo
(`hyperbola`, `momentum`, `vectors`, `whiteboard`, `projectile`). Cuatro puntos
de render actualizados sin tocar `catalog.js`: tarjetas (`app.js`), cabeceras de
sección, grupos laterales y resultados de búsqueda (`catalog-search.js`).
Test `js/tests/icons.test.mjs`: todos los módulos y categorías resuelven icono,
SVGs bien formados y sin emojis. Suite completa: 36/36.

Todo esto entra en `skills/fisicahn/` y se propaga con los tres scripts de sync;
ninguna dependencia nueva ni bundler (§0).

# WAVE 12 — Paleta de la landing y catálogo sin secciones

> ✅ **Hecha** — trabajo de esta sesión, aún sin commit.

Dos frentes de front-end resueltos juntos: el simulador adopta la **paleta de la
landing** (`website/`) como fuente única de color, y el **catálogo deja de agrupar
por categorías** para volverse una cuadrícula plana con el filtro «Todos» por defecto.

## 12.1 Paleta de la landing en el simulador

La paleta vive en `website/css/site.css:2` y ahora **es la fuente de verdad del look**
del simulador:

| Token landing | Valor | Destino en el simulador |
|---|---|---|
| `--bg` | `#0c0f14` | `--bg-primary`, tema canvas `dark.bg`, arranque `index.html` |
| `--bg-elev` | `#141a22` | `--bg-secondary` |
| `--bg-card` | `#1c2430` | `--bg-tertiary` |
| `--text` | `#e8eef6` | `--text-primary`, `dark.text` |
| `--muted` | `#9aa8b8` | `--text-secondary` |
| `--accent` | `#3ecfbf` | `--accent` (era `#4fc3f7`) |
| `--accent-2` | `#e8a838` | `--accent-secondary` |
| `--ok` | `#3ecf7a` | `--success` |
| `--err` | `#f07178` | `--danger` |

- `css/main.css`: tokens del design system reasignados y **36 literales** heredados
  migrados (`#4fc3f7` → `#3ecfbf`, `rgba(79,195,247,α)` → `rgba(62,207,191,α)`,
  ámbar `#ffb74d` → `#e8a838`, verde «Mis trabajos» `#81c784` → `#3ecf7a`, rojos de
  estado `#ef9a9a` → `#f07178`). `css/catalog.css`: otros 24 literales de acento +
  badge «Mis trabajos».
- `js/core/theme.js` — tema `dark` (el de arranque): fondo, texto, HUD y estados
  `ok/warn/danger` de la paleta; `mass2`, `velocity`, `force`, `energy` y `DARK_SERIES`
  ajustados a los tonos nuevos. `light` y `projector` reciben variantes oscurecidas de
  los tres estados (contraste sobre fondos claros); `colorSafe` alinea **solo los
  neutros** — su paleta para daltonismo queda intacta a propósito.
- Paletas que elige el usuario en JS: gráficas de trabajos (`app.js`), pizarra
  (`whiteboard.js`) y colisiones 2D (`collisions-2d.js`); `index.html` arranca en
  `#0c0f14` sin flash de color.

**Regla nueva — la semántica ante todo:** los colores vectoriales que distinguen
magnitudes en el lienzo (masa azul, fuerza roja, velocidad verde, aceleración
violeta, campo cian…) **no se reemplazan por la paleta** porque son el canal
pedagógico de información; el cambio es de *chrome* (UI, fondos, neutros y estados).
Modificar la landing exige volver a propagar aquí: `bash mobile/scripts/sync-www.sh`.

## 12.2 Catálogo plano y filtro de nivel por defecto

- `app.js`: `renderFlatGrid` sustituye las secciones por categoría («Medición y
  vectores», «Cinemática», «Dinámica y fuerzas»…) en la vista principal; todas las
  tarjetas van en una sola cuadrícula. Las secciones agrupadas quedan **solo en los
  resultados de búsqueda** (§4.4), donde el encabezado de categoría ayuda a orientarse.
- Sidebar plana: `fillSidebarUnified` ya no crea grupos plegables
  (`sidebar-group`/`sidebar-group-head`); los módulos son botones directos.
- Filtro de nivel (Todos / ESO / Bachillerato / Universidad): el estado se restaura
  desde `lastLevel` **solo si el usuario lo eligió**; por defecto es `all` («Todos»).
  Antes abrir un módulo forzaba `state.catalogLevel = entry.level`, y al volver al
  catálogo el filtro aparecía cambiado sin que el usuario lo tocara — se elimina esa
  sobreescritura.

**Regla nueva — registro único, render cero cabeceras:** un módulo nuevo sigue
entrando solo por `catalog.js` (§4.5); aparece en la cuadrícula plana y en la sidebar
sin necesidad de código adicional. El catálogo principal no vuelve a tener grupos por
categoría.

---

# WAVE 13 — Legibilidad visual de 16 módulos

> ✅ **Hecho.** Commit «Legibilidad: motor de anticolisión y migración de los 4
> módulos legacy».
>
> Resumen: §13.1 — registro de cajas por frame en `Scene` (`registerBox`/`findFreeBox`),
> `Surface.label`/`chip` con `opts.avoid` (candidatos arriba→abajo→derecha→izquierda),
> `HudSurface` con cola automática por ancla (`_nextOffset`, sustituye el `opts.line`
> manual) y `scene.callout()` nuevo. §13.2 — vocabulario nuevo en `scene.js`/
> `draw-primitives.js`: `hatch` (apoyo fijo), `thermal` (degradado frío↔caliente),
> `fluidPattern` (anillos de fluido) y `emphasisHalo`. §13.0/§13.3 — `statics`,
> `wave-optics` y `particles` migrados de legacy (`render(ctx)`) a `SimModule` con
> `draw(scene)`; `induction` ya estaba migrado. `body()` activa `avoid` por defecto en
> su etiqueta (antes ninguna primitiva registraba caja). Pasada puntual en los 16
> módulos: `opts.avoid: true` en 65 llamadas a `label`/`chip` mundo, más dos arreglos
> de posición reales que el nuevo test atrapó (`thermal-expansion`: dos etiquetas
> centradas se salían del viewbox por el borde izquierdo; un chip pisaba el borde por
> anclar en el extremo de la barra en vez de su centro). Nuevo
> `js/tests/legibility.test.mjs`: verifica los 16 módulos contra `Scene._labelBoxes`
> en 5 frames — sin solapes y dentro del viewbox 900×700. 70/70 tests verdes.

Diagnóstico: la API declarativa (`website/sim/js/core/scene.js`) no tiene motor de
layout de etiquetas. `Surface.label`/`chip` pintan donde el módulo diga
(`scene.js:785-812`); lo único anticolisión que existe hoy es `labelSide` en
`Surface.vector` (`scene.js:480`) y `opts.line` para apilar chips/textos en el HUD
(`scene.js:976-1005`). Dos anclajes al mismo `anchorPoint` con `line=0` — típicamente
`hud.chip('top-left')` junto a `hud.readout(...,'top-left')` — se pisan siempre porque
ambos parten del mismo punto. En los módulos **legacy** el problema es peor: pintan
con `ctx.fillText` en píxeles de pantalla con constantes mágicas (`statics.js:271-290`)
o reimplementan su propio `chip()` local (`magnetic.js:226-241`).

## 13.0 Los 16 módulos, con su motor real

Mapeo resuelto por `engineKey` vía `enginePath()` en `catalog.js:1416`:

| Petición | Motor (`website/sim/js/modules/`) | API |
|---|---|---|
| Unidades y errores | `units-error.js` | `draw(scene)` |
| Vectores | `vectors.js` | `draw(scene)` |
| Masa y peso | `mass-weight.js` | `draw(scene)` |
| Elasticidad | `elasticity.js` | `draw(scene)` |
| Estática | `statics.js` | **legacy** (`render(ctx)`) |
| Péndulo | `pendulum.js` | `draw(scene)` |
| Ondas estacionarias | `standing-waves.js` | `draw(scene)` |
| Fluidos | `fluids.js` | `draw(scene)` |
| Calorimetría | `calorimetry.js` | `draw(scene)` |
| Teoría cinética | `kinetic-theory.js` | `draw(scene)` |
| Dilatación térmica | `thermal-expansion.js` | `draw(scene)` |
| Espejos esféricos | `mirrors.js` | `draw(scene)` |
| Introducción electromagnética | `induction.js` | mixto |
| Interferencia y difracción | `wave-optics.js` | **legacy** |
| Instrumentos ópticos | `optical-instruments.js` | `draw(scene)` |
| Partículas en campo B | `particles.js` | **legacy** |

Los legacy (`statics`, `wave-optics`, `particles`, y la parte legacy de `induction`) se
migran primero a `draw(scene)` + `static params` + `static viewport`: sin eso no hay
forma de garantizar el no solapamiento con el resto de la WAVE.

## 13.1 Layout de etiquetas en `scene.js` (el cambio estructural)

Se añade al núcleo, para no repetir la lógica en 16 módulos:

- Registro de cajas ocupadas por frame + `Surface.label`/`chip` con `opts.avoid: true`,
  que desplaza la etiqueta al primer candidato libre (arriba → abajo → derecha →
  izquierda).
- `HudSurface`: cola automática por ancla, para que `chip` y `readout` sobre el mismo
  `anchorPoint` se apilen en vez de pisarse (extiende el `opts.line` existente en
  `scene.js:976` a un contador implícito por ancla).
- `scene.callout(x, y, texto)`: etiqueta con línea guía para objetos pequeños donde el
  texto no cabe encima.

## 13.2 Vocabulario visual nuevo

El pedido explícito es «si es necesario, creando nuevos elementos (diferentes formas,
texturas y colores)». Se añaden primitivas reutilizables en `scene.js` +
`draw-primitives.js`: hatch/rayado (secciones sólidas, apoyos de estática), degradado
de temperatura (calorimetría, dilatación térmica), patrón de fluido (ondas en
superficie, viscosidad), halo de énfasis para objetos interactivos, y cotas con
`dimension` ya existente (`scene.js:820`).

**Regla nueva — forma y textura, no color semántico:** los colores vectoriales que
distinguen magnitudes (masa azul, fuerza roja, velocidad verde, aceleración violeta,
campo cian…) siguen intocables por la regla de la WAVE 12 (§12.1); lo que esta WAVE
amplía es el vocabulario de **forma y textura** para diferenciar objetos sin depender
solo del color.

## 13.3 Pasada módulo a módulo

Una entrada corta por módulo con el problema concreto y el arreglo puntual (no
reescribir el módulo entero). Orden por gravedad: legacy primero
(`statics`, `wave-optics`, `particles`, `induction`), después los `draw(scene)` con
paneles dibujados en coordenadas de mundo con constantes mágicas
(`mass-weight.js:148-173`, `units-error.js:113-138`), y por último el resto de la
lista de §13.0.

## Criterio de aceptación

Test nuevo `js/tests/legibility.test.mjs`: con el mismo arnés de bbox de
`js/tests/smoke-55.test.mjs`, captura todas las operaciones de texto (`label`, `chip`,
`readout`, `callout`) de los 16 motores durante varios frames de simulación y falla si
dos cajas de texto se intersecan o si alguna sale del viewbox 900×700.

---

# WAVE 14 — Controles funcionales en todos los módulos

> 🔜 **Pendiente.**

Diagnóstico: hay dos rutas de panel — la declarativa (`js/core/params-schema.js:125`
`renderSchemaHtml` / `:144` `bindSchema`) y la legacy (`js/module-ui.js:518`
`enhanceParamsPanel`, `:450` `paramControl`, `:481` `bindParamControls`). En la ruta
legacy cada módulo cablea sus controles a mano vía `renderParams()`/`bindParamControls`
propios; ahí es donde aparecen los handlers muertos.

## 14.1 Auditoría exhaustiva

Inventario `módulo × control × ¿tiene efecto observable?` sobre **los 44 módulos**, no
solo los 16 de la WAVE 13. Para cada control (slider, select, botón, checkbox): moverlo
debe alterar `readout()` o el resultado del `draw` en el frame siguiente. Migrar a
`static params` todo módulo legacy que se toque de todos modos por la WAVE 13 —
elimina la clase entera de fallo en vez de parchear el handler suelto.

## 14.2 Bug ya localizado (ejemplo documentado)

`app.js:1677-1682` hace `inst.setUnbounded(!inst.getUnbounded?.())`. `dynamics.js` no
exporta `getUnbounded`, así que `!undefined === true`: en Dinámica ese botón **solo
enciende, nunca apaga**. Se corrige junto con §17.3 (misma familia de bug).

## Criterio de aceptación

Test `js/tests/controls.test.mjs`: para cada módulo y cada param del esquema, aplicar
`min` y `max`, ejecutar N pasos de simulación y exigir que la firma del `draw` (o el
`readout()`) cambie entre los dos extremos. Un param inerte hace fallar el test para
ese módulo.

---

# WAVE 15 — Las gráficas se dibujan en el motor

> 🔜 **Pendiente.**

Diagnóstico: hoy la gráfica vive en el panel derecho como un
`<svg viewBox="0 0 300 180">` (`index.html:201-209`), alimentado por
`applyModuleCharts()` (`js/app.js:1899`) con escalado manual y paleta hardcodeada
`['#4fc3f7','#66bb6a','#ffb74d','#ef5350']` (`js/app.js:1931`) — colores que la
WAVE 12 ya jubiló en el resto de la UI. En paralelo el núcleo ya tiene
`HudSurface.plot()` (`scene.js:1100`) con ejes y autoescala, usado hoy solo por
`js/modules/momentum.js` (gráfica F–t con área del impulso).

## 15.1 Migración

Todo `getCharts()` pasa a `scene.hud.plot()` dentro del `draw()` del módulo, con
colores de `theme.seriesColor` (`js/core/theme.js:326`) y trazo de
`seriesDash:337`, siguiendo el patrón de `momentum.js`.

## 15.2 Eliminación del panel de Gráficas

Se retira del todo (decisión tomada con el usuario, no queda como fallback oculto):
`#chartPanel`/`#chartSvg` de `index.html`, `ui.setChart`/`ui.showCharts`
(`js/app.js:270`, `:277`), `applyModuleCharts` (`js/app.js:1899`), el bombeo del bucle
principal (`js/app.js:1866-1873`), la bandera `useCharts` (`js/app.js:1193`, `:1155`) y
las reglas `.chart-panel`/`.chart-svg` de `css/main.css:734-751`.

## 15.3 Ventaja colateral

La gráfica entra gratis en la exportación PNG/SVG (`js/core/scene-export.js`) y en la
comparación lado a lado (`js/core/compare.js`), cosa que hoy no ocurre por vivir fuera
del canvas.

**Riesgo a vigilar:** el HUD comparte espacio con `readout` y chips, así que esta WAVE
depende de que §13.1 (cola automática por ancla) esté implementada antes; de lo
contrario la gráfica se solapa con el resto del HUD.

---

# WAVE 16 — Panel derecho: orden y estética

> ✅ **Hecho.** Commit «Panel derecho en orden y selects modernos».
>
> Resumen: «Herramientas» sube justo debajo de «Parámetros» y «Útil para» deja de
> colgarse al pie de `paramsPanel` para vivir en su propia `.panel-section`
> (`#servesSection`) al final del `<aside>` (orden: Controles → Parámetros →
> Herramientas → Gráficas → Útil para; con la WAVE 15 desaparece Gráficas).
> `appendCatalogServes()` apunta a `#servesPanel` y oculta la sección cuando el
> módulo no declara `serves[]`. Nueva regla `.custom-select` en `css/main.css`
> (tokens de la WAVE 12, `appearance: none`, chevron SVG, `:hover` y
> `:focus-visible`), y los 5 módulos legacy (`lenses`, `kepler`, `wave-optics`,
> `photoelectric`, `thermodynamics`) borran su estilo inline duplicado.

## 16.1 Herramientas encima de «Útil para»

> ✅ **Hecho.**

Orden actual del DOM: Controles (`index.html:169`) → Parámetros (`:195`) → Gráficas
(`:201`) → Herramientas (`:206`). «Útil para» **no es una sección propia**:
`appendCatalogServes()` (`js/app.js:819`, `<summary>` en `:830`) hace
`paramsPanel.appendChild(wrap)`, así que queda dentro de Parámetros, al pie — por
encima de Herramientas.

Arreglo: sacar «Útil para» a su propia `.panel-section` al final del `<aside>` y subir
Herramientas justo debajo de Parámetros. Con la desaparición de Gráficas (WAVE 15) el
orden final queda:

**Controles → Parámetros → Herramientas → Útil para**

## 16.2 Selects modernos

> ✅ **Hecho.** `css/main.css` define `.custom-select`; 5 módulos legacy sin estilo
> inline.

`params-schema.js:78-90` emite `<select class="custom-select">` y **`.custom-select`
no tiene ninguna regla CSS** para `css/main.css`, `css/catalog.css` ni
`css/challenges.css` — se ve con el chrome nativo del navegador, desalineado con el
resto del panel. Además 5 módulos legacy lo parchean con estilos inline duplicados
carácter a carácter: `lenses.js:464`, `kepler.js:240`, `wave-optics.js:166`,
`photoelectric.js:474`, `thermodynamics.js:247`.

Arreglo: una regla `.custom-select` en `css/main.css` con los tokens de la WAVE 12
(`--bg-tertiary`, `--accent` `#3ecfbf`), `appearance: none`, chevron SVG como
`background-image` data-URI, `:focus-visible` con anillo de acento y `:hover`. Se
borran los 5 bloques de estilo inline duplicado. Referencia de estilo ya existente en
el proyecto: `.challenge-select` (`css/challenges.css:233`).

---

# WAVE 17 — Origen centrado, encuadre inicial y espacio infinito

> ✅ **Hecho.** Commit «Origen centrado, encuadre inicial y botón de espacio infinito».
>
> Resumen: los 16 módulos de la WAVE 13 declaran `static anchor = {x:0,y:0}` (3 legacy con
> `export const anchor`) y `smoke-55.test.mjs` los verifica a ≤0.5 u del origen;
> `camera.reset()` fija `_userFramed` y la app lo libera en Reiniciar, cambio de
> parámetro, toggle de espacio infinito y primer `pointerdown` de manipulación
> (`onPickStart`); `updateViewControlsUI()` sincroniza zoom, encuadre y espacio
> infinito; `dynamics.js` exporta por fin `getUnbounded`.

## 17.1 El punto fijo en el centro del plano

> ✅ **Hecho.** Báscula de `mass-weight` centrada (`bx=0`, suelo `g=-1.9`), probeta de
> `elasticity` en `cx=0`, techo/anclajes de `statics` en y=0.35/0, rendija de
> `wave-optics` en x=0 (fuente -4, pantalla 7, crestas -3.5).

`Camera` arranca y resetea en `x=0, y=0` (`js/core/camera.js:33-34`, `:328-336`) y
`app.js:1144-1149` aplica `static viewport` + `resetCamera()` al cargar cada módulo. No
existe «centrar en el contenido»: cada módulo **debe** colocar su punto fijo (pivote
del péndulo, vértice del espejo, eje de la balanza, centro de la caja de gas) en el
origen del mundo. Se audita cada uno de los 16 módulos de la WAVE 13 y se reubican los
que hoy usan un origen desplazado; se extiende el arnés de `smoke-55.test.mjs` para
exigir que el punto fijo declarado por el módulo caiga a ≤0.5 unidades de mundo de
(0,0).

## 17.2 «Encuadre de verdad encuadra»

> ✅ **Hecho.** `camera.reset()` fija `_userFramed`; `follow()` retorna temprano mientras
> esté fija. La app libera la bandera al acabar de cargar el módulo, en Reiniciar,
> cambio de parámetro, toggle de espacio infinito y `onPickStart`. `updateViewControlsUI()`
> sincroniza los cuatro controles y el botón de herramienta de espacio infinito
> (`data-tool="unbounded"`) se deshabilitado para módulos sin soporte.

`#resetViewBtn` (`index.html:136` → handler `js/app.js:1538-1542` → `camera.reset()`)
es un **no-op práctico** en los módulos con espacio infinito activo: `reset()` limpia
`_target`, pero en el frame siguiente `update()` vuelve a llamar `renderer.follow(pos)`
(`kinematics.js:98`, `dynamics.js:89`, y equivalentes en `gravity.js` y `magnetic.js`),
y la cámara salta de nuevo al objeto.

Arreglo: `camera.reset()` fija una bandera `_userFramed` que suspende el `follow()`
hasta que el usuario mueva algo o reinicie la simulación. Se repasa además
`updateViewControlsUI()` (`js/app.js:1330`), que hoy solo actualiza `#zoomLabel` y deja
sin reflejar el resto de estados de vista (zoom in/out deshabilitado, etc.) —se
extiende para que cada botón de vista muestre su estado real.

## 17.3 Espacio infinito ON por defecto

> ✅ **Hecho.** `dynamics.js` exporta `getUnbounded` y `renderParams()` de kinematics y
> dynamics pinta `aria-pressed`/`active` desde el estado real. Para módulos sin
> `setUnbounded` el botón `data-tool="unbounded"` sale `disabled`. `setState()` aplica
> `unbounded` solo si la clave está en el snapshot.

Estado real: solo **4 módulos** lo implementan —`kinematics.js:33`, `dynamics.js:27`,
`gravity.js:19`, `magnetic.js:24`— y los 4 ya tienen default `true`. Quedan dos
incoherencias por corregir:

- El botón se **pinta OFF** aunque el estado sea ON: `kinematics.js:254-256` y
  `dynamics.js:259-261` emiten `aria-pressed="false"` y texto «Espacio infinito: OFF»
  sin la clase `active`. `gravity.js:135` sí lo pinta bien (`active` + «ON») y sirve de
  patrón que corregir los otros dos.
- `dynamics.js` no exporta `getUnbounded` (bug ya documentado en §14.2), causa raíz de
  que su botón nunca se apague.

**Persistencia y trabajos guardados.** El usuario pide que el default ON se respete
salvo que el archivo se haya guardado con espacio infinito en OFF. El estado no viaja
por `uiParams` sino por `moduleState`: guardado en `collectModuleSnapshot()`
(`app.js:2062`, `:2076-2079`) vía `handleSaveWork()` (`:2176`); restauración en
`openWorkInModule()` (`:2207`, `:2236-2238`) vía `inst.setState(snap.moduleState)`;
almacenamiento en `js/works.js:173, 225, 322`.

**Regla nueva — el snapshot manda solo si está presente:** `setState()` aplica
`unbounded` únicamente si la clave existe en el snapshot cargado; si falta (trabajo
guardado antes de esta WAVE), gana el default `true`. Para los módulos que no
implementan `setUnbounded` (todos salvo los 4 de la tabla), el botón
`data-tool="unbounded"` (`index.html`) sale `disabled` en vez de mostrar un estado
engañoso.

---

# WAVE 18 — Cámara lenta real: velocidad desacoplada de los FPS

> 🔜 **Pendiente.**

Diagnóstico verificado en el código: el multiplicador de velocidad ya escala el
**tiempo**, no el render — `physics-engine.js:462` hace
`this._accumulator += frameTime * this._speed`, pero el bucle de subpasos usa
**siempre** `DEFAULT_DT = 1/60` (`:465-474`). El efecto es justo el que describe el
usuario: a 0.1× el acumulador crece 1.67 ms por frame y tarda 16.7 ms en completar un
paso de 1/60 s, así que `onUpdate` dispara solo ~6 veces por segundo. El render sigue a
60 FPS y `#fpsCounter` (`app.js:2022-2029`) marca 60, pero **el movimiento se ve a
tirones**, como si fuera a 6 FPS.

## 18.1 Arreglo — paso variable acotado

Escalar el propio subpaso cuando la velocidad baja de 1×, en vez de escalar solo el
acumulador:

```js
const stepDt = DEFAULT_DT * Math.min(1, this._speed);
this._accumulator += frameTime * this._speed;
let steps = 0;
while (this._accumulator >= stepDt && steps < this._maxSubsteps) {
  this.onUpdate(stepDt);
  this._accumulator -= stepDt;
  this._elapsed += stepDt;
  steps++;
}
```

A 0.1× sale exactamente 1 subpaso por frame con `dt = 1/600` → movimiento continuo a
60 FPS de render, diez veces más lento en el tiempo simulado. A 1× el comportamiento es
idéntico al actual. Por encima de 1× nada cambia (`stepDt` se queda en 1/60 y crecen
los subpasos, como hoy). El dt menor a velocidades bajas solo mejora la precisión de
integración, sin riesgo numérico nuevo. Se revisa que `MAX_SUBSTEPS`
(`physics-engine.js:19`) siga acotando el peor caso con el `stepDt` variable.

## 18.2 Coherencia con Datos: todo en tiempo simulado

Segunda mitad de lo pedido («si la velocidad está en 0.1× y hay una aceleración
equivalente a 10 veces por segundo, que acelere 1 vez por segundo»). Los valores del
`readout()` ya son tiempo **simulado** — cada módulo integra `this.t += dt` con dt
fijo; no hay ningún `performance.now()`/`Date.now()` dentro de la física ni de los
`readout()` en `js/modules/`. Lo que sí es wall-clock es la **cadencia de
publicación**: `app.js:1250-1256` con `READOUT_MIN_MS = 100` (`app.js:120`, ~10 Hz de
reloj real). Consecuencia hoy: a 5× se saltan muestras de tiempo simulado y a 0.1× se
repite el mismo valor varias veces.

Arreglo: cambiar el throttle de publicación a tiempo **simulado** (publicar cada
`READOUT_MIN_SIM_S` de `this._elapsed`, no cada `READOUT_MIN_MS` de reloj), con un
techo adicional de wall-clock para no saturar el DOM a 5×.

**Regla nueva — reloj simulado, no reloj real:** todo lo que se muestra en la pestaña
Datos se mide en segundos de simulación; el único indicador de reloj real que
sobrevive en la UI es `#fpsCounter`. Cualquier módulo nuevo que quiera reportar una
frecuencia (ej. Doppler en `sound.js`, EM en `em-waves.js`) la calcula sobre
`this._elapsed`, nunca sobre `performance.now()`.
