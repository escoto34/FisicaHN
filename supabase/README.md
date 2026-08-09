# Supabase — esquema y migraciones (WAVE 6)

El esquema ya no es un único `schema.sql` que se pega en el SQL Editor:
es un **sistema de migraciones versionadas** (§6.4 de `mejoras.md`).

```
supabase/
  migrations/
    0001_initial_schema.sql        ← esquema histórico CONGELADO (estado de producción)
    0002_reconcile_not_null.sql    ← NOT NULL reales + vista schema_health (§6.2)
    0003_exams_code_unique.sql     ← exams.code único entre activos + mode CHECK (§6.3)
    0004_updated_at_triggers.sql   ← set_updated_at() compartido (§6.3)
    0005_audit_log_policy_index.sql ← SELECT, índice y purga de auditoría (§6.3)
    0006_exams_school_canonical.sql← school_key canónica; se elimina school_id (§6.5)
  schema.sql                       ← estado ACUMULADO (generado) — no editar
  README.md                        ← este archivo
```

## Reglas

1. **Nunca editar una migración ya aplicada.** El esquema debe poder
   reconstruirse en orden desde cero; reescribir una migración rompe la
   trazabilidad y el checksum de `schema_migrations`.
2. Cada migración es **idempotente** y al final **registra su versión** en
   `public.schema_migrations`. Si ya está aplicada, avisa y no hace nada.
3. **Sin `exception when others then null`**: los errores de esquema deben
   verse (regla §6.4.2). Las migraciones nuevas capturan solo la excepción
   específica (`duplicate_object`, `check_violation`, …) si hace falta.
4. Cada migración trae su **REVERSIÓN** comentada. Un `set not null` que
   rellenó nulos no es reversible; eso está escrito en el archivo.
5. Para cambiar el esquema: crear `0007_*.sql` y regenerar el acumulado:

   ```bash
   node scripts/regen-schema.mjs
   ```

## Migración cero (antes de tocar nada en producción)

El esquema real pudo haber divergido de los archivos (§6.2). Antes de aplicar
la 0001 hay que **volcar el esquema vivo** y compararlo:

```bash
pg_dump --schema-only --no-owner --dbname <URL de la base de datos> > /tmp/vivo.sql
diff /tmp/vivo.sql supabase/schema.sql | head -100
```

Si aparecen diferencias con sustancia (columna que no existe, tipo distinto),
**no** se reescribe 0001: se documenta divergencia y se absorbe en una
migración posterior (`0007_drift_fix.sql`).

## Aplicar en un entorno

Por orden, una por una (SQL Editor de Supabase o `psql`):

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/0001_initial_schema.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/0002_reconcile_not_null.sql
# … repetir hasta el número más alto
```

`ON_ERROR_STOP=1` garantiza que un error no pase desapercibido.

Comprobación post-despliegue:

```sql
select * from public.schema_health;            -- 0 filas = sano
select * from public.schema_migrations;        -- 1..6 con sus checksums
```

## Reversión

Cada archivo incluye su sección REVERSIÓN. En general:

```sql
delete from public.schema_migrations where version = N;
-- + el SQL inverso comentado en el archivo N
```

## Entornos NUEVOS (schema.sql acumulado)

`supabase/schema.sql` (estado acumulado) crea el esquema completo de una vez;
útil para CI o una base nueva de staging:

```bash
psql -v ON_ERROR_STOP=1 -f supabase/schema.sql
```

## Seguridad (Anexo §6.6)

- `hashPassword` (`js/auth.js`) es **solo el sello local** del registro
  offline del navegador; **no es una credencial** (SHA-256 con sal constante,
  una pasada). La autenticación real es Supabase Auth. Si llegara a proteger
  algo valioso: migrar a PBKDF2/Argon2id vía WebCrypto.
- `computeIntegrity` (`js/works.js`) detecta edición accidental, no
  falsificación. Para integridad real, la firma debe venir del servidor; la
  UI distingue ambos casos («sello débil» vs «SHA-256 sin verificación»).