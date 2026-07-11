# FísicaHN — sitio web (Cloudflare Pages)

Carpeta lista para publicar en **Cloudflare Pages**.

## Contenido

| Ruta | Descripción |
|------|-------------|
| `/` | Landing: descarga, entrada al lab, info docente |
| `/teacher.html` | Panel docente (colegio + contraseña, examen, trabajos) |
| `/sim/` | Simulador completo |
| `/downloads/fisicahn.zip` | Paquete descargable del simulador |

## Desplegar en Cloudflare Pages

1. Reconstruye el sitio (copia `skills/fisicahn` → `website/sim` y regenera el ZIP):

```bash
./scripts/build-website.sh
```

2. En el dashboard de Cloudflare Pages:
   - **Build command:** `./scripts/build-website.sh` (o vacío si subes ya construido)
   - **Build output directory:** `website`
   - Framework preset: **None**

3. O con Wrangler:

```bash
npx wrangler pages deploy website --project-name fisicahn
```

## Flujo docente / anti-trampa (cliente)

- Registro: nombre de colegio + contraseña → hash SHA-256 en `localStorage`.
- Examen: código de 6 dígitos; opcional **token JSON** para multi-PC del lab.
- Alumno: nombre + colegio (+ código si examen).
- **Guardar trabajo** en cada módulo → caché del navegador con sello de integridad.
- Export/import JSON para recoger trabajos por USB.

> Es una web estática: no hay backend. Sirve para disciplina de aula y detectar JSON editados a mano, no para secretos de alta seguridad.

## Desarrollo local

```bash
./scripts/build-website.sh
cd website && python3 -m http.server 8080
# http://127.0.0.1:8080
```
