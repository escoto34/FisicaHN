# FísicaHN 1.5.0

## Hoja de ruta completada: WAVEs 0 a 18

Esta versión cierra el plan de arquitectura de `mejoras.md`: contrato de módulo
unificado, escena declarativa, rendimiento del panel de datos, catálogo por
categorías, legibilidad visual, controles funcionales en todos los motores,
gráficas dentro del lienzo, encuadre inicial con espacio infinito y cámara
lenta desacoplada de los FPS.

## Motores gráficos: correcciones de esta versión

- **Ondas electromagnéticas (polarización y ley de Malus):** el dibujo no
  reflejaba los parámetros del módulo. Ahora la amplitud de la onda entre
  polarizadores sigue I₁ (E ∝ √I₁), el segundo polarizador gira según θ desde
  la vertical, la onda transmitida se inclina y se atenúa como cos²θ, con la
  descomposición vectorial E₁ = E₁cosθ + E₁sinθ y barras I₁/I₂.
- **Lentes como siluetas de libro de texto:** nueva primitiva de dibujo con
  arcos esféricos reales para los seis perfiles ópticos (biconvexa,
  plano-convexa, menisco convergente, bicóncava, plano-cóncava, menisco
  divergente). La curvatura depende de la distancia focal. El módulo de
  lentes delgadas gana un selector de forma; instrumentos ópticos usa la
  lente correcta según el elemento (cristalino, lupa, objetivo/ocular de
  microscopio y telescopio) y corrige la geometría de la imagen final del
  microscopio y el encuadre del telescopio.
- **Historia de la mecánica cuántica:** cada hito de la línea de tiempo
  muestra siempre, sin desplegables, qué se creía antes, por qué estaba mal
  y un veredicto con su grado de certeza (con la evidencia experimental:
  Millikan, Davisson–Germer, el positrón, las desigualdades de Bell…).
- **Calorimetría (modo mezcla):** calorímetro con termómetro graduado y
  muestras metálicas desconocidas (A–F) para despejar su calor específico a
  partir de la temperatura de equilibrio, con la muestra cayendo al agua al
  iniciar.
- **Dilatación térmica (modo lineal):** la barra cilíndrica se dibuja con
  fuente de calor, gradiente térmico de fondo, flecha bidireccional de
  crecimiento y flecha segmentada L₀ + ΔL.
- **Campo eléctrico:** las líneas de campo nacen en el centro de cada carga,
  con flechas de sentido y una densidad de líneas proporcional a |q|.
- Corrige además el enlace profundo con modo (`#/m/<id>?mode=...`), que no
  se interpretaba por un error en la expresión regular.

## Archivos de la release

| Archivo | Plataforma |
|---------|------------|
| `FisicaHN-Portable-1.5.0.exe` | Windows (Portable) |
| `FisicaHN Setup 1.5.0.exe` | Windows (Instalador NSIS) |
| `FisicaHN-1.5.0.AppImage` | Linux (AppImage) |
| `fisicahn-desktop_1.5.0_amd64.deb` | Linux (DEB Debian/Ubuntu) |
| `FisicaHN-1.5.0-release.apk` | Android |
