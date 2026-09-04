-- 0007 — Seguridad: RPCs sin SECURITY DEFINER expuesto por la API y política
--        explícita en schema_migrations (Security Advisor 0028 / 0029 / 0008)
--
--  El linter de Supabase avisaba de tres cosas:
--   a) `soft_delete_student_work` era SECURITY DEFINER y ejecutable por `anon`
--      y `authenticated` (avisos 0028 y 0029).
--   b) `purge_audit_log` era SECURITY DEFINER y ejecutable por `authenticated`
--      (aviso 0029).
--   c) `schema_migrations` tenía RLS activo sin ninguna política (aviso 0008).
--
--  Principio de esta migración: NINGUNA función del esquema `public` corre con
--  privilegios del dueño. Toda la autoridad vuelve a RLS + grants por columna,
--  y las funciones son simples fachadas SECURITY INVOKER que validan la
--  entrada. Lo que antes «saltaba» RLS ahora lo permite una política
--  estrecha, verificable y auditable.
--
--  El cuarto aviso del Advisor («Leaked Password Protection Disabled») es un
--  ajuste de Auth que NO se puede fijar con SQL: Dashboard → Authentication →
--  Providers → Email → «Leaked password protection» (ver README).

-- -------------------------------------------------------------------
-- a) Soft-delete del alumno SIN SECURITY DEFINER
--
--    Mecanismo «ticket»: el RPC deja en un ajuste local a la transacción
--    (`fisicahn.soft_delete_ticket`) el local_id que va a dar de baja. Las
--    políticas de `anon` sobre student_works solo dejan ver/actualizar la fila
--    cuyo local_id coincide con ese ticket, y un trigger comprueba que la
--    única mutación es deleted_at: NULL → now(). Fuera del RPC el ticket no
--    existe, así que un PATCH directo del cliente anónimo no alcanza ninguna
--    fila (RLS) y, si la alcanzara, lo bloquearía el trigger.
-- -------------------------------------------------------------------

-- Grants por columna para anon: leer solo lo necesario para localizar la
-- fila, escribir solo deleted_at.
revoke select, update on table public.student_works from anon;
grant select (local_id, exam_code, deleted_at) on table public.student_works to anon;
grant update (deleted_at) on table public.student_works to anon;

drop policy if exists "works_select_soft_delete_ticket" on public.student_works;
create policy "works_select_soft_delete_ticket" on public.student_works
  for select to anon
  using (
    local_id is not null
    and local_id = current_setting('fisicahn.soft_delete_ticket', true)
  );

drop policy if exists "works_soft_delete_anon" on public.student_works;
create policy "works_soft_delete_anon" on public.student_works
  for update to anon
  using (
    deleted_at is null
    and local_id is not null
    and local_id = current_setting('fisicahn.soft_delete_ticket', true)
  )
  with check (deleted_at is not null);

-- Guardia: la baja anónima solo puede tocar deleted_at, una sola vez, y solo
-- con el ticket puesto por el RPC. Los docentes (authenticated) siguen
-- gobernados por works_update_teacher_school y no pasan por esta guardia.
create or replace function public.guard_student_work_soft_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  ticket text;
begin
  if current_user <> 'anon' then
    return new;
  end if;
  ticket := current_setting('fisicahn.soft_delete_ticket', true);
  if ticket is null or ticket = '' or ticket is distinct from old.local_id then
    raise exception 'student_works: la baja del alumno solo se realiza vía soft_delete_student_work()'
      using errcode = 'insufficient_privilege';
  end if;
  if old.deleted_at is not null or new.deleted_at is null then
    raise exception 'student_works: deleted_at solo puede pasar de NULL a una fecha, una vez'
      using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - 'deleted_at') <> (to_jsonb(old) - 'deleted_at') then
    raise exception 'student_works: la baja del alumno no puede modificar otras columnas'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_student_work_soft_delete() from public, anon, authenticated;

drop trigger if exists trg_student_works_guard_soft_delete on public.student_works;
create trigger trg_student_works_guard_soft_delete
  before update on public.student_works
  for each row execute function public.guard_student_work_soft_delete();

-- El RPC: misma firma y semántica que antes (misma validación de entrada,
-- mismo booleano de retorno), pero SECURITY INVOKER.
create or replace function public.soft_delete_student_work(
  p_local_id text,
  p_exam_code text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
  lid text;
begin
  lid := trim(coalesce(p_local_id, ''));
  -- local_id del cliente suele ser UUID / id largo; evitar borrados por fuerza bruta
  if char_length(lid) < 8 or char_length(lid) > 80 then
    return false;
  end if;
  if p_exam_code is null or p_exam_code !~ '^[0-9]{4,8}$' then
    return false;
  end if;

  -- Ticket local a la transacción: habilita las políticas de anon solo para
  -- esta fila y solo durante este RPC.
  perform set_config('fisicahn.soft_delete_ticket', lid, true);

  update public.student_works
  set deleted_at = now()
  where local_id = lid
    and exam_code = p_exam_code
    and deleted_at is null;

  get diagnostics n = row_count;
  perform set_config('fisicahn.soft_delete_ticket', '', true);
  return n > 0;
end;
$$;

revoke all on function public.soft_delete_student_work(text, text) from public;
grant execute on function public.soft_delete_student_work(text, text) to anon, authenticated;

-- -------------------------------------------------------------------
-- b) Purga de auditoría SIN SECURITY DEFINER
--
--    La autoridad pasa a una política DELETE del docente sobre SU colegio con
--    un suelo de retención de 90 días fijado en la propia política: ni el RPC
--    ni un DELETE directo pueden borrar auditoría más reciente.
-- -------------------------------------------------------------------
drop policy if exists "audit_delete_teacher_retention" on public.audit_log;
create policy "audit_delete_teacher_retention" on public.audit_log
  for delete to authenticated
  using (
    school_key is not null
    and school_key = public.current_teacher_school_key()
    and created_at < now() - interval '90 days'
  );

-- Nota: 0005 creó la política SELECT de auditoría pero nunca concedió el
-- privilegio de tabla, así que el docente seguía sin poder leerla (ni el
-- DELETE del RPC, que necesita leer school_key/created_at). Se corrige aquí.
grant select, delete on table public.audit_log to authenticated;

create or replace function public.purge_audit_log(
  p_school_key text,
  p_before timestamptz
)
returns int
language plpgsql
security invoker
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

revoke all on function public.purge_audit_log(text, timestamptz) from public, anon;
grant execute on function public.purge_audit_log(text, timestamptz) to authenticated;

-- -------------------------------------------------------------------
-- c) schema_migrations: RLS con política explícita
--    Solo lectura para docentes autenticados (versión y checksum no son
--    datos sensibles y permiten comprobar «esquema al día» desde el panel).
--    Nadie escribe por la API: las migraciones se aplican con psql/SQL Editor.
-- -------------------------------------------------------------------
alter table public.schema_migrations enable row level security;
revoke all on table public.schema_migrations from public, anon;
grant select on table public.schema_migrations to authenticated;

drop policy if exists "schema_migrations_select_teacher" on public.schema_migrations;
create policy "schema_migrations_select_teacher" on public.schema_migrations
  for select to authenticated
  using (true);

comment on policy "schema_migrations_select_teacher" on public.schema_migrations is
  'Lectura de versiones aplicadas para docentes; sin escritura por la API.';
comment on function public.soft_delete_student_work(text, text) is
  'Baja lógica del trabajo del alumno (anon). SECURITY INVOKER: la autoridad está en RLS + trigger guardia con ticket transaccional.';
comment on function public.purge_audit_log(text, timestamptz) is
  'Purga de auditoría del propio colegio. SECURITY INVOKER: la retención mínima (90 días) la impone la política DELETE.';

-- -------------------------------------------------------------------
-- Aplicada: registrar versión 7
-- -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.schema_migrations where version = 7) then
    insert into public.schema_migrations (version, checksum)
    values (7, 'RELLENAR-0007');
  else
    raise notice '0007 ya aplicada — esquema en orden';
  end if;
end $$;

-- ============ REVERSIÓN ============
--   -- volver a las versiones SECURITY DEFINER de 0001 (soft_delete) y 0005 (purge):
--   -- reejecutar los bloques `create or replace function` de esos archivos.
--   drop trigger if exists trg_student_works_guard_soft_delete on public.student_works;
--   drop function if exists public.guard_student_work_soft_delete();
--   drop policy if exists "works_select_soft_delete_ticket" on public.student_works;
--   drop policy if exists "works_soft_delete_anon" on public.student_works;
--   revoke select (local_id, exam_code, deleted_at), update (deleted_at) on public.student_works from anon;
--   drop policy if exists "audit_delete_teacher_retention" on public.audit_log;
--   revoke select, delete on table public.audit_log from authenticated;
--   drop policy if exists "schema_migrations_select_teacher" on public.schema_migrations;
--   revoke select on table public.schema_migrations from authenticated;
--   delete from public.schema_migrations where version = 7;
