# Product

## Register

product

## Users

Estudiantes (secundaria, bachillerato y universidad) y docentes de física que necesitan un laboratorio virtual interactivo para experimentar, visualizar y analizar fenómenos físicos en diversas condiciones de conectividad y en múltiples dispositivos (pantallas táctiles móviles, tablets, ordenadores de escritorio y proyectores de aula).

## Product Purpose

FísicaHN es un laboratorio virtual de física interactivo, accesible y científicamente riguroso, desarrollado para el ámbito educativo. Su propósito es facilitar la comprensión intuitiva y matemática de los fenómenos físicos mediante la simulación en tiempo real, manteniendo disponibilidad multiplataforma completa (Web, PWA, ZIP offline, Electron y Android APK) sin dependencias externas en tiempo de ejecución.

## Brand Personality

- **Científico y tecnológico:** estética oscura, precisa y contemporánea, con el turquesa (`#3ecfbf`) como color de acento y los colores vectoriales conservando su significado físico educativo.
- **Educativo y accesible:** claro, ergonómico y estructurado, permitiendo encontrar rápidamente cualquier módulo y experimentar sin fricciones.
- **Riguroso y confiable:** las ecuaciones, constantes, unidades SI y el determinismo físico son intocables.

## Anti-references

- **No a los dashboards administrativos genéricos:** FísicaHN es un laboratorio de experimentación científica, no un panel de analíticas o SaaS corporativo con tarjetas repetitivas.
- **No a la contaminación del espacio físico:** ningún gráfico comparativo, histograma o tabla debe dibujarse dentro del plano de coordenadas del fenómeno físico (ej. barras de astros en Masa y peso).
- **No a la versión móvil como miniatura comprimida:** la experiencia móvil debe sentirse diseñada para pantallas táctiles (cajones, bottom sheets, hit-targets de 44 px), nunca tres columnas de escritorio achicadas.
- **No a la degradación tipográfica:** prohibido introducir fuentes genéricas o alterar la jerarquía estricta de Share, Oswald, BBH Bogle y Nunito.
- **No al "AI slop" visual:** sin gradientes decorativos en texto, sin side-stripes de adorno y sin elementos que compitan con la física.

## Design Principles

1. **La simulación física es la protagonista indiscutible:** el lienzo donde ocurre el fenómeno tiene la máxima jerarquía visual; los paneles de control y consulta existen para servir a la simulación sin asfixiarla.
2. **Separación estricta de espacios:** el lienzo de coordenadas se reserva para la física y sus vectores; las estadísticas, distribuciones y comparativas pertenecen al panel de consulta inferior.
3. **Ergonomía nativa por dispositivo:** escritorio (3 zonas: navegación, lienzo, controles), tablet (disposición adaptable fluida) y teléfono (drawer, lienzo prioritario y bottom sheets) responden a la realidad de su interacción física.
4. **Cero duplicidad funcional:** cada acción (reproducir, pausar, reiniciar, guardar) tiene una ubicación coherente y única.
5. **Autonomía e integridad offline:** 100% utilizable sin red, en JavaScript ES modules nativo, sin frameworks ni build step en el artefacto publicado.

## Accessibility & Inclusion

- Objetivos táctiles mínimos de 44 × 44 px en todos los botones y controles móviles.
- Navegación completa por teclado con tabulación lógica y foco visible turquesa (`:focus-visible`).
- Relación de contraste WCAG 2.1 AA (≥ 4.5:1 para texto sobre fondo oscuro `#0c0f14`/`#141a22`).
- Soporte para `prefers-reduced-motion` en transiciones de paneles.
- Temas alternativos integrados: Modo Proyector (alto contraste en aula) y Modo Daltonismo (`colorSafe`).
