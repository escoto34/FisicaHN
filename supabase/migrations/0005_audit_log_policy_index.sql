-- 0005 — Auditoría: índice, SELECT policy y purga (§6.3, ítems 5, 6 y 8)
--
--  a) `audit_log` ganaba índice de consulta por colegio+fecha y una política
--     de SELECT (solo docentes del propio colegio) — hoy nadie puede leerla.
--  b) RPC `purge_audit_log` para cumplir la retención sin dar DELETE libre.
--  c) `improvement_ideas(created_at desc)` para moderar por fecha.

-- -------------------------------------------------------------------
-- a) Índice de auditoría por escuela y fecha
-- -------------------------------------------------------------------
create index if not exists audit_log_school_created_idx
  on public.audit_log (school_key, created_at desc);

-- -------------------------------------------------------------------
-- b) SELECT para el docente del colegio (hoy no existe ninguna política
--    de lectura: ni el dueño puede auditar su colegio).
-- -------------------------------------------------------------------
drop policy if exists "audit_select_teacher" on public.audit_log;
create policy "audit_select_teacher" on public.audit_log
  for select to authenticated
  using (
    school_key = public.current_teacher_school_key()
  );

-- Purga con retención: el docente borra solo operaciones de SU colegio,
-- anteriores a una fecha. SECURITY DEFINER con search_path fijo; sin
-- reasignación a público.
create or replace function public.purge_audit_log(
  p_school_key text,
  p_before timestamptz
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_school_key is null
     or p_school_key <> public.current_teacher_school_key()
     or p_before is null then
    return 0;
  end if;
  delete from public.audit_log
  where school_key = p_school_key
    and created_at < p_before;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_audit_log(text, timestamptz) from public;
revoke all on function public.purge_audit_log(text, timestamptz) from anon;
grant execute on function public.purge_audit_log(text, timestamptz) to authenticated;

-- -------------------------------------------------------------------
-- c) Moderación de ideas por fecha
-- -------------------------------------------------------------------
create index if not exists improvement_ideas_created_idx
  on public.improvement_ideas (created_at desc);

-- -------------------------------------------------------------------
-- Aplicada: registrar versión 5
-- -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.schema_migrations where version = 5) then
    insert into public.schema_migrations (version, checksum)
    values (5, 'RELLENAR-0005');
  else
    raise notice '0005 ya aplicada — esquema en orden';
  end if;
end $$;

-- ============ REVERSIÓN ============
--   drop policy "audit_select_teacher" on public.audit_log;
--   drop function public.purge_audit_log(text, timestamptz);
--   drop index if exists audit_log_school_created_idx;
--   drop index if exists improvement_ideas_created_idx;
--   delete from public.schema_migrations where version = 5;