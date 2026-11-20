# FísicaHN 1.6.2 — demos que se reproducen, lienzo que manda y retos solo en examen

Versión de corrección sobre 1.6.1. El catálogo queda en **50 entradas**
(49 simulaciones + Pizarra docente) y se retira el módulo «Unidades y errores»:
no era una simulación temporal y su contenido ya está repartido en los retos
del examen. No cambia el contrato de los motores.

## Demos: abrir ya no borra, y la reproducción se ve fluida

- El botón **Abrir** de *Mis demos* emitía `replay` pero el manejador sólo
  reconocía `play`: caía en la rama de borrado y eliminaba la demo al intentar
  reproducirla. Ahora reproduce y deja la demo guardada.
- Si la demo pertenece a otro módulo, el host espera a cargarlo antes de
  aplicar muestras (antes se pintaban en el motor anterior).
- Grabación a **30 muestras/s** y repintado en cada frame durante la
  reproducción: se acabaron los saltos a 15 imágenes/s con el motor en pausa.
- Corregida la duración guardada: ahora es el tiempo simulado transcurrido,
  aunque el reloj del motor no empezara en cero.

## El móvil deja de pelearse con el canvas

- La barra táctil tenía Pausa/Parámetros/Reiniciar, el panel de parámetros
  otra vez Pausa y la cabecera otro Reiniciar. Quedan **Parámetros** y
  **Panel**: la pausa vive en el panel de controles y el reinicio en la
  cabecera (que además reencuadra la cámara).
- Los paneles lateral e inferior pasan a hojas que se abren desde esa barra,
  con scrim para cerrar. El lienzo recupera la pantalla en vez de compartirla
  con dos paneles fijos.
- La barra flotante de botones de vista se oculta en teléfonos (zoom con
  pellizco, encuadre con el botón de la cabecera) y las gráficas HUD se
  escalan solas cuando el lienzo es pequeño: antes una gráfica de 230×150
  podía tapar la simulación.
- La altura mínima del lienzo se adapta a la proporción declarada por cada
  módulo (`static viewport`), con un límite para no comerse la pantalla.

## Ampliar el lienzo (y no el módulo entero)

- El botón del rectángulo ya no pide pantalla completa al documento: aplica
  un modo de lienzo maximizado con CSS. Los paneles del módulo no se
  agrandan; el canvas sí.
- Al maximizar vuelven a entrar en la vista la barra de botones y el panel
  inferior con sus gráficas, aunque en móvil estuvieran plegados. `Esc` sale
  del modo sin volver al catálogo.

## Cámara y gestos

- Mantener pulsado (~320 ms) el ratón o el dedo sobre el canvas desplaza la
  cámara, incluso si debajo hay un objeto arrastrable. El arrastre rápido
  sigue moviendo el objeto.
- **Reiniciar** llama también a `camera.reset()` antes de reanudar el
  seguimiento: vuelven el encuadre y el zoom iniciales, no sólo el tiempo.

## Retos: sólo dentro de un examen

- La pestaña **Retos** desaparece en práctica. Durante un examen se sirven
  exclusivamente las preguntas publicadas por el docente.
- Al crear un examen, *Mis trabajos → Retos del examen* incluye un botón
  **Cargar retos del módulo**: importa los retos incorporados de ese módulo
  con sus respuestas ya rellenas, sin duplicados. Se pueden seguir añadiendo
  preguntas a mano o importando/exportando JSON.

## Iconos en vez de emojis

- Catálogo, demos, retos y escenarios usan iconos SVG o texto; se eliminaron
  los emojis de la interfaz y de los datos de las tarjetas.

## Calidad

- `npm run check` en verde: 0 avisos de lint, tipos limpios, **241 pruebas** y
  presupuesto de rendimiento dentro de lo previsto.
- Nuevas pruebas: duración de demos con reloj desplazado y repintado por
  frame; descubrimiento de retos reescrito para el modo examen.

## Archivos de la release

| Plataforma | Archivo |
|---|---|
| Windows (portable) | `FisicaHN-Portable-1.6.2.exe` |
| Windows (instalador) | `FisicaHN Setup 1.6.2.exe` |
| Linux (AppImage) | `FisicaHN-1.6.2.AppImage` |
| Linux (Debian/Ubuntu) | `fisicahn-desktop_1.6.2_amd64.deb` |
| Android | `FisicaHN-1.6.2-release.apk` |
| Web / USB | `fisicahn.zip` |
