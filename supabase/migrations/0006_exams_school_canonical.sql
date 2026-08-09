-- 0006 — `school_id` vs `school_key` en exams: se decide la canónica (§6.5)
--
-- Decisión adoptada: **school_key es la clave de negocio del colegio**.
-- `exams.school_id` era una FK muerta: las políticas RLS usan solo
-- `school_key` (`0001`), los clientes solo consultan `school_key` y ningún
-- código referencia `school_id`. Se elimina para que el esquema refleje lo
-- que el código hace, y se documenta que cambios de nombre/clave de colegio
-- NO se soportan (el código de la pizarra es estable).
--
-- Si en el futuro se precisara renombrar colegios, la migración correcta sería
--  1) crear `schools.school_key_visible text` (nuevo), 2) poblar, 3) mover
--  4) y dejar `school_key` como canonical elegida. No tocar este archivo:
--  nueva migración 0007.

alter table public.exams drop column if exists school_id;

-- Verificación post-despliegue (debe devolver 0 filas):
--   select count(*) from information_schema.columns
--   where table_schema = 'public' and table_name = 'exams'
--     and column_name = 'school_id';

-- -------------------------------------------------------------------
-- Aplicada: registrar versión 6
-- -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.schema_migrations where version = 6) then
    insert into public.schema_migrations (version, checksum)
    values (6, '1dda9bfd5718f8eec636ceb17d8fdf45df8687b15d70e4c5a9229fa47d4d0b3b');
  else
    raise notice '0006 ya aplicada — esquema en orden';
  end if;
end $$;

-- ============ REVERSIÓN ============
--   alter table public.exams
--     add column school_id uuid references public.schools (id) on delete cascade;
--   El backfill de school_id desde school_key no se puede garantizar
--   (school_key de exams puede no existir en schools): si se necesita,
--   restaurar desde backup anterior a 0006.
--   delete from public.schema_migrations where version = 6;