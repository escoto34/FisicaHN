<p align="center">
  <img src="website/assets/logo.svg" width="72" height="72" alt="FísicaHN">
</p>

<h1 align="center">FísicaHN</h1>
<p align="center">
  <strong>Laboratorio virtual de física interactivo para el aula</strong><br>
  En el navegador, PWA offline, en USB, en la computadora o en la tablet/celular
</p>

<p align="center">
  <a href="https://github.com/escoto34/FisicaHN">github.com/escoto34/FisicaHN</a>
</p>

---

## ¿Qué es?

FísicaHN es un laboratorio de física educativo en **JavaScript ES modules nativo (sin bundler, sin dependencias y sin build step en el runtime)**. Los alumnos y docentes abren simulaciones interactivas, miden magnitudes en tiempo simulado, prueban escenarios guiados, graban demos y realizan eximentes o exámenes en vivo respaldados por Supabase.

Se distribuye en 5 formatos desde una única fuente de verdad (`skills/fisicahn`):
- **Web online**
- **PWA instalable offline** (Service Worker con precaché)
- **ZIP offline** (USB o NetSupport en PCs sin internet)
- **App de escritorio** (Electron para Windows y Linux)
- **App Android** (Capacitor APK para tablets y celulares)

Versión actual: **1.5.0** (Hoja de ruta WAVEs 0 a 18 completada al 100%).

---

## Cómo usarlo

| Plataforma | Para quién | Cómo empezar |
|------------|------------|--------------|
| **Web / PWA** | Cualquiera con o sin internet | Abre el sitio web, instálalo como PWA para uso sin conexión |
| **ZIP Offline** | USB, NetSupport, laboratorios bloqueados | Descarga `fisicahn.zip`, descomprime y abre `index.html` |
| **Escritorio** | Windows (Instalador / Portable) o Linux (AppImage / DEB) | Descarga los binarios desde [Releases v1.5.0](https://github.com/escoto34/FisicaHN/releases/tag/v1.5.0) |
| **Android** | Tablets y teléfonos | Instala `FisicaHN-1.5.0-release.apk` |

### Linux (AppImage)

```bash
chmod +x FisicaHN-1.5.0.AppImage
./FisicaHN-1.5.0.AppImage
```

---

## Alumnos y docentes

| Rol | Requisitos | Capacidades |
|-----|------------|-------------|
| **Alumno** | Nombre y colegio | Practicar, resolver retos integrados por módulo (tolerancia relativa del 5%), seguir escenarios guiados paso a paso, unirse a un examen con código del docente y guardar trabajos con sello de integridad |
| **Docente** | Cuenta registrada | Crear códigos de examen en vivo, publicar packs de retos, supervisar resultados de clase en tiempo real, grabar/reproducir demos de simulación y exportar sesiones |

---

## Qué hay en el laboratorio

El catálogo cuenta con **46 módulos de física interactivos + Pizarra docente + Mis trabajos** organizados en 12 categorías curriculares con búsqueda instantánea y enlace profundo por modo (`#/m/momentum?mode=impulse`):

1. **Medición y vectores:** Dimensiones, unidades y error (`units-error`), Vectores (`vectors`), Hipérbola (`hyperbola`).
2. **Cinemática:** Cinemática (`kinematics`), Tiro parabólico (`projectile`).
3. **Dinámica y fuerzas:** Fuerzas y movimiento (`forces-motion`), Fuerza cinética (`kinetic-force`), Fricción (`friction`), Plano inclinado y poleas (`inclined-plane`), Estática (`statics`), Masa y peso (`mass-weight`), Elasticidad y deformación (`elasticity`).
4. **Trabajo, energía y momento:** Trabajo, energía y potencia (`work-energy`), Cantidad de movimiento e impulso (`momentum`), Colisiones multicuerpo 2D (`collisions-2d`).
5. **Rotación y gravitación:** Circular y rotacional (`rotational`), Gravedad universal (`universal-gravity`), Kepler y maniobras orbitales (`kepler-orbits`).
6. **Fluidos:** Arquímedes, empuje y Ecuación de Bernoulli (`fluids`).
7. **Térmica:** Termodinámica (`thermodynamics`), Calorimetría y fases (`calorimetry`), Teoría cinética de gases (`kinetic-theory`), Dilatación térmica (`thermal-expansion`).
8. **Oscilaciones y ondas:** Oscilaciones y resorte (`oscillatory-energy`), Péndulo simple y doble armónico/caótico (`pendulum`), Sonido y Doppler (`sound-waves`), Ondas estacionarias y batidos (`standing-waves`).
9. **Óptica:** Luz y reflexión/refracción (`geometric-optics`), Lentes delgadas (`thin-lenses`), Espejos esféricos (`mirrors`), Interferencia y difracción (`interference-diffraction`), Instrumentos ópticos (`optical-instruments`).
10. **Electricidad y magnetismo:** Campo eléctrico (`electric-field`), Circuitos DC/AC y RC (`circuits-dc-ac`), Campos magnéticos (`magnetic-fields`), Inducción electromagnética y transformadores (`induction`), Ondas EM y polarización (`em-waves`).
11. **Física moderna:** Efecto fotoeléctrico (`photoelectric`), Física atómica Bohr (`atomic-physics`), Decaimiento radiactivo (`radioactivity`), Túnel cuántico (`quantum-tunneling`), Partículas en campo B (`particle-physics`), Dualidad de-Broglie (`de-broglie`), Fisión y fusión nuclear (`nuclear-energy`), Relatividad especial Lorentz (`special-relativity`), Historia de la cuántica (`quantum-history`).
12. **Herramientas docentes:** Pizarra interactiva (`whiteboard`), Mis trabajos (`my-works`).

---

## Características clave (Arquitectura & Calidad)

- **Núcleo Declarativo y Cámara:** Escena 2D con primitivas físicas/geométricas, cámara isotrópica con zoom anclado, pan y encuadre inteligente.
- **Rendimiento:** Throttling a 10 Hz del panel de lectura, sub-stepping adaptativo y desacoplamiento de velocidad simulada vs FPS (cámara lenta continua sin tirones a 60 FPS).
- **Legibilidad Anticolisión:** Motor de layout automático de etiquetas, chips y llamadas para evitar solapes dentro del lienzo (viewbox 900×700).
- **Demos y Grabación:** Grabación y reproducción determinista de muestras en tiempo simulado (`fisicahn-demo-v1`) y exportación a video WebM / fotogramas PNG.
- **Pruebas de Calidad:** Suite de pruebas automatizada con 115 tests (`npm test`: invariantes físicos, contrato de módulos, legibilidad, controles y esquemas).

---

## Descargas (Versión 1.5.0)

Publicadas en [GitHub Releases v1.5.0](https://github.com/escoto34/FisicaHN/releases/tag/v1.5.0):

- **Windows:** `FisicaHN Setup 1.5.0.exe` (Instalador NSIS) y `FisicaHN-Portable-1.5.0.exe` (Portable)
- **Linux:** `FisicaHN-1.5.0.AppImage` y `fisicahn-desktop_1.5.0_amd64.deb`
- **Android:** `FisicaHN-1.5.0-release.apk`
- **PWA / Web:** Disponible en el sitio web de la aplicación.

---

## Licencia y contacto

Licencia MIT. Desarrollado para laboratorios escolares e instituciones educativas.  
Código y novedades: [github.com/escoto34/FisicaHN](https://github.com/escoto34/FisicaHN).
