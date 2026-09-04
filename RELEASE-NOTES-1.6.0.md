# FísicaHN 1.6.0

## Motores gráficos: un solo contrato para los 50 módulos

- **17 motores migrados** del dibujo imperativo (`render(ctx)`, HTML de parámetros a mano, `updateData()` con HTML) al contrato declarativo `SimModule`: `static params`, `static viewport`, `static anchor`, `draw(scene)`, `readout()` numérico y `getState/setState` reversibles. Son `dynamics`, `force-kinetic`, `friction`, `work-energy`, `collisions-2d`, `gravity`, `kepler`, `electricity`, `magnetic`, `optics`, `lenses`, `thermodynamics`, `atomic`, `photoelectric`, `radioactivity`, `tunneling` y `placeholder`. `kinematics` deja su panel manual por el esquema declarativo. Todos conservan su física y sus modos, y ganan gráficas en el lienzo, cotas, chips de estado, leyendas y manipulación directa (cuerpos arrastrables).
- **Ningún módulo importa ya la capa de presentación** (`module-ui.js`): la información y las fórmulas se describen como datos y el anfitrión las convierte en HTML (`SimModule#setModuleInfo/#setModuleFormulas`). El lint pasa con `--max-warnings 0`.
- Mejoras de contenido durante la migración: adiabática real y ciclo de Carnot con adiabáticas en Termodinámica; transmisión exacta de barrera rectangular (con resonancias) en Túnel cuántico; ciclo de emisión/absorción animado y vista de espectro en Física atómica; presets de pares de medios y gráfica θ₂(θ₁) en Óptica; imagen de lentes con gráfica dᵢ(d₀); sector barrido (2.ª ley de Kepler) y asistencia gravitacional con Δv; sonda de campo arrastrable con E, V y F en Campo eléctrico; sentido de B y gráfica v(t) en Campos magnéticos; gráfica f(F) de libro en Fricción.

## Cuatro módulos nuevos

- **Máquinas simples** (`simple-machines`): palancas de 1.ª/2.ª/3.ª clase con brazos arrastrables, polea fija/móvil/polipasto, plano inclinado y torno; ventaja mecánica ideal y real con eficiencia.
- **Presión y prensa hidráulica** (`hydraulics`): presión hidrostática con sonda arrastrable y manómetro, prensa de Pascal animada, vasos comunicantes con dos líquidos.
- **Condensadores y dieléctricos** (`capacitors`): placas paralelas con inserción animada del dieléctrico, carga y descarga RC con gráficas, asociación serie/paralelo.
- **Cuerpo negro y espectro térmico** (`blackbody`): espectro de Planck coloreado, ley de Wien, Stefan–Boltzmann, comparación con Rayleigh–Jeans y clasificación espectral de estrellas.

## Núcleo gráfico: menos redundancia, más rendimiento

- Primitivas compartidas nuevas en `core/scene.js`: `curve`, `dots`, `ground/ceiling/wall`, `axes/grid`, `thermometer`, `bars`, `gradientRect`, `flame`, `coil`, `flow`, `rayTo`, `intensityStrip`, `arrowMark`, `photon`; series `{fn, samples}` en `hud.plot`; `Float64Array` aceptado en polilíneas y estelas. Sustituyen copias privadas en más de veinte módulos.
- Tiempo medio de dibujo de los 30 módulos ya declarativos: **−28 %** (anticolisión de etiquetas −49 %, degradados radiales y `save/restore` por frame eliminados en los módulos de partículas, termómetro y franjas de interferencia cacheados). `hud.plot` ya no rompe con series constantes ni en comparación lado a lado.
- Presupuesto de rendimiento regenerado (50 motores) con medición «mejor de 3» y umbral robusto al ruido.

## Supabase: Security Advisor sin avisos de SQL

- Migración `0007_security_invoker_rpcs.sql`: `soft_delete_student_work` y `purge_audit_log` dejan de ser `SECURITY DEFINER`. La autoridad pasa a políticas RLS estrechas (ticket transaccional + grants por columna + trigger guardia para la baja del alumno; política `DELETE` con suelo de retención de 90 días para la purga), y `schema_migrations` recibe su política. Se corrige además el `SELECT` de auditoría que la 0005 nunca llegó a conceder.
- Verificada de extremo a extremo con roles `anon`/`authenticated` sobre Postgres 18 embebido (26 comprobaciones, tanto el `schema.sql` acumulado como la secuencia 0001…0007).
- El aviso «Leaked password protection» es un ajuste del panel de Auth y se documenta en `supabase/README.md`.

## Calidad

- 244 pruebas automatizadas (antes 118): legibilidad, bbox, anclaje y controles cubren ahora los 51 motores del catálogo.

## Archivos de la release

| Plataforma | Archivo |
|---|---|
| Windows (portable) | `FisicaHN-Portable-1.6.0.exe` |
| Windows (instalador) | `FisicaHN Setup 1.6.0.exe` |
| Linux (AppImage) | `FisicaHN-1.6.0.AppImage` |
| Linux (Debian/Ubuntu) | `fisicahn-desktop_1.6.0_amd64.deb` |
| Android | `FisicaHN-1.6.0-release.apk` |
