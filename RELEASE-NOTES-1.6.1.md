# FísicaHN 1.6.1 — controles vivos, flotación correcta y encuadres a medida

Versión de corrección sobre 1.6.0. No cambia el catálogo (50 módulos) ni el
contrato de los motores: corrige lo que el aula veía mal.

## Por qué hay que actualizar sí o sí

El service worker guardaba los archivos con estrategia *cache-first* y la clave
de la caché es la versión de la app. Un despliegue que no cambiara la versión
**no llegaba nunca** a un navegador que ya hubiera abierto el simulador: seguía
sirviendo los módulos viejos desde su caché. A partir de esta versión los
estáticos usan *stale-while-revalidate*: se sirve la copia guardada (arranque
instantáneo y offline intacto) y en paralelo se descarga la nueva para la
siguiente carga.

## Controles que no movían nada

- **Visibilidad por modo (`showIf`)**: cada deslizador se muestra sólo en el
  modo donde actúa. Eran **100 parámetros de 21 módulos**; el caso que lo
  destapó: mover «Sección ancha» en el modo Arquímedes de Fluidos no cambiaba
  nada porque pertenece a Bernoulli.
- **Nueve parámetros que sólo movían números** ahora se ven en la escena:
  espiras dibujadas ∝ N y alcance del campo λ (Inducción), partículas ∝ n
  (Termodinámica), radio del emisor ∝ √A (Cuerpo negro), calor específico
  revelado sobre la muestra (Calorimetría), umbral f_s,max y fricción cinética
  «fantasma» (Fricción), barras de error del modo cifras y errores (Unidades).
- **`syncParams()`**: lo que el módulo cambia al arrastrar vuelve al panel
  (sonda de presión, r₀ del satélite, semieje del planeta).

## Fluidos

- El empuje se **integra de verdad** (E = ρf·g·A·d con la profundidad realmente
  sumergida). El cubo ya no aparece flotando en el aire con ciertas densidades
  ni atraviesa el fondo: sube hasta enrasar en ρb/ρf y se posa si pesa más.
- Bernoulli redibujado con dos tubos piezométricos (la diferencia de altura es
  la caída de presión), líneas de corriente animadas y vectores v₁/v₂.

## Encuadre y zoom

Nuevo `frameWorld()` en el contrato: cada modo ajusta el mundo visible a su
mecanismo. Plano inclinado pasó del 41 % del lienzo (arrinconado abajo a la
izquierda) al 67–75 % centrado; Presión y prensa hidráulica, del 55–63 % al
66–82 %. Igual en Calorimetría, Rotación, Péndulo, Circuitos, Termodinámica,
Kepler, Gravedad, Ondas estacionarias, Dilatación, Radiactividad y Elasticidad.

Bugs de dibujo encontrados en el camino: la barra de conducción se trazaba de
x = −17 a 0 (media fuera del lienzo), la imagen virtual de la lupa saltaba a
x ≈ 600 con el objeto cerca del foco, los frentes de onda del Doppler crecían
sin límite y el bloque del plano inclinado se apoyaba junto al plano, no sobre
él.

## Kepler y gravedad

La elipse guía, los focos, el perihelio/afelio y la cota 2a se calculan desde
los **elementos orbitales del estado real**: al arrastrar el planeta la guía y
los datos lo acompañan en vez de quedarse en la órbita anterior. En Gravedad,
arrastrar el satélite actualiza r₀ y v₀.

## Luz y óptica geométrica

La superficie de separación se dibuja como cuerpo con espesor, textura del
segundo medio y destello en el punto de impacto. Nuevo modo **espejo plano**
(superficie opaca con respaldo rayado, sin rayo refractado) para ver dónde
rebota la luz.

## Arnés de pruebas

- `smoke-55` multiplicaba matrices transpuestas: medía mal la posición de
  cualquier cuerpo rotado.
- `controls` no envolvía `scene.hud`, así que gráficas y lecturas del HUD no
  contaban como efecto observable de un parámetro.

`npm run check` en verde: 0 avisos de lint, tipos limpios, 244 pruebas y
presupuesto de rendimiento dentro de lo previsto.
