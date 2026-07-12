# FísicaHN: Supabase + GitHub Pages

## ¿Necesitas darme una API key?

| Clave | ¿Me la pasas? | ¿Va al frontend / GitHub Pages? |
|--------|----------------|----------------------------------|
| **Project URL** | Solo cuando quieras conectar (o ponla tú en secrets) | Sí (pública) |
| **anon / public** | Igual: en secrets o en `supabase-config.js` local | Sí (diseñada para el navegador) |
| **service_role** | **Nunca** | **Nunca** — bypasea RLS |

No hace falta que me envíes ninguna clave por el chat. Configúralas en tu máquina o en GitHub Secrets.

## Pasos Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. SQL Editor → pega y ejecuta `supabase/schema.sql`.
3. Project Settings → API:
   - **Project URL**
   - **anon public** key

### Local

```bash
cp website/js/supabase-config.example.js website/js/supabase-config.js
# Edita url + anonKey
./scripts/build-website.sh
cd website && python3 -m http.server 8080
# http://127.0.0.1:8080/sim/
```

El indicador de red en el catálogo debe pasar a **Online** (verde = cloud, azul = online sin config).

### GitHub Pages

1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Push a `main` (o ejecuta el workflow **Deploy GitHub Pages** a mano).

El script `scripts/build-website.sh` escribe `website/js/supabase-config.js` si esas variables están definidas.

## Qué hace el código hoy

- **Offline-first**: auth, examen y trabajos siguen en `localStorage`.
- **Indicador Wi‑Fi** en el menú del simulador (catálogo y barra superior): Offline / Online + **Reconectar** a la izquierda.
- **Sync opcional**: al guardar un trabajo, si Supabase responde, se inserta en `student_works`.
- Sin config o sin red: todo sigue funcionando en local.

## Seguridad

- RLS en el schema: inserts anónimos de trabajos; lectura de trabajos solo `authenticated` (ajusta cuando actives Auth de docentes).
- No subas `service_role` al repo.
- `website/js/supabase-config.js` con keys reales: mejor secretos de CI; el archivo del repo puede quedar vacío/`enabled: false`.
