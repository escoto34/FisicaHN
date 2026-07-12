# FísicaHN — sitio web

Publica la carpeta `website/` en **GitHub Pages** o **Cloudflare Pages**.

## Contenido

| Ruta | Uso |
|------|-----|
| `/` | Landing (entrada alumno, docentes, ideas) |
| `/teacher.html` | Panel docente (email o offline) |
| `/sim/` | Laboratorio |
| `/downloads/fisicahn.zip` | Paquete offline (se regenera en cada build) |
| `/assets/` | Logo y favicon (círculo unitario + vector) |

## Build

```bash
./scripts/build-website.sh
```

Copia `skills/fisicahn` → `website/sim` y actualiza el ZIP.

## Supabase

Ver `docs/SUPABASE_GITHUB_PAGES.md` y `supabase/schema.sql`.  
Solo **anon key** en `js/supabase-config.js` (nunca `service_role`).
