## FísicaHN Desktop + Mobile 1.4.2

### Correcciones de errores (Bugfixes)

- **Motores 5.1/5.2:** corregidos `mass-weight`, `fluids`, `inclined-plane`, `elasticity`, `units-error`, `oscillatory`, `projectile`, `vectors` y `kinetic-theory`, que dibujaban coordenadas fuera de pantalla (algunas primitivas recibían `viewport()` y se interpretaban como coordenadas de mundo). La corrección queda blindada con una prueba de encuadre automática (bbox 900×700 con matrices de transformación, `js/tests/smoke-55.test.mjs`).
- **Vectores:** corregido un «crash» en la carga del módulo (`Scene.pickable` no existía y el módulo lo usaba durante el dibujo).
- **Espacio infinito:** activado por defecto en Cinemática, Dinámica y Campos magnéticos (antes solo lo tenía Gravedad).

### Novedades (Features)

- **Módulo Hipérbola:** lugar geométrico |PF₁ − PF₂| = 2a con punto P arrastrable, asíntotas, focos y lectura en vivo. En el catálogo: Medición y vectores.
- **Iconos SVG**: los emojis de las tarjetas del catálogo, cabeceras de sección, barra lateral y resultados de búsqueda se sustituyen por iconos vectoriales monocromos que siguen el tema y el acento de la app.

### Archivos

| Archivo | SO |
|---------|-----|
| FisicaHN-Portable-1.4.2.exe | Windows (sin instalar) |
| FisicaHN.Setup.1.4.2.exe | Windows (instalador) |
| FisicaHN-1.4.2.AppImage | Linux |
| fisicahn-desktop_1.4.2_amd64.deb | Linux Debian/Ubuntu |
| FisicaHN-1.4.2-release.apk | Android |