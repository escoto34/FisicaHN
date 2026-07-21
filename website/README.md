# Sitio de FísicaHN

Páginas públicas del laboratorio: inicio, acceso docente, simulador y descargas.

## Páginas

| Ruta | Contenido |
|------|-----------|
| `/` | Inicio: entrada de alumnos, módulos, descargas, docentes |
| `/teacher.html` | Acceso y panel del docente |
| `/sim/` | Laboratorio completo |
| `/downloads/` | ZIP del lab y APK de Android |

## Actualizar el laboratorio en el sitio

Desde la carpeta principal del proyecto:

```bash
./scripts/build-website.sh
```

Copia el simulador a `sim/`, prepara la configuración en línea si existe y regenera el ZIP de descarga.

Para verlo en tu computadora:

```bash
cd website && python3 -m http.server 8080
```

Luego abre `http://127.0.0.1:8080/`.

## Configuración en línea (opcional)

Si usas cuentas de docente y códigos de examen en la nube, copia el ejemplo de configuración y rellena los datos del proyecto (nunca subas contraseñas ni claves secretas al repositorio).

Más detalle en `docs/` de la raíz del proyecto.
