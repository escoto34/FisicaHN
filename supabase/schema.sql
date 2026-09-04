-- FísicaHN — esquema ACUMULADO (generado por scripts/regen-schema.mjs).
-- NO editar a mano. Es el resultado de aplicar 7 migraciones
-- (0001_initial_schema.sql … 0007_security_invoker_rpcs.sql) en orden; sirve para entornos NUEVOS y para
-- leer el esquema real. Los entornos existentes NO se tocan con este archivo:
-- se migran aplicando 0002…0007_security_invoker_rpcs.sql en orden tras la 0001 congelada
-- (ver supabase/README.md).
--
-- FísicaHN — esquema Supabase (SQL Editor → Run)
-- Seguro de re-ejecutar (DROP POLICY IF EXISTS + CREATE).
-- Políticas RLS endurecidas (sin WITH CHECK true en inserts públicos).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CHECKLIST SEGURIDAD (Dashboard — no se puede fijar solo con SQL)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Auth → Providers → Email → Password:
--    • Activar "Leaked password protection" (HaveIBeenPwned).
--      Docs: https://supabase.com/docs/guides/auth/password-security
--    • Mínimo 8+ caracteres (recomendado 10+).
--    Nota: en plan Free a veces el toggle no está disponible; el WARN del
--    Security Advisor se quita al activarlo (Pro) o se puede ignorar si solo
--    usas OAuth sin contraseñas.
-- 2) Project Settings → API: NUNCA expongas service_role en el cliente;
--    solo anon key en la app Electron/ZIP.
-- 3) Auth → URL Configuration: Site URL y Redirect URLs solo a tus dominios.
-- 4) Tras correr este script: Database → Advisors → Security (revisar avisos).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.teacher_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.teacher_profiles add column if not exists email text;
alter table public.teacher_profiles add column if not exists school_name text;
alter table public.teacher_profiles add column if not exists school_key text;
alter table public.teacher_profiles add column if not exists updated_at timestamptz default now();

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  school_key text not null,
  created_at timestamptz not null default now()
);

alter table public.schools add column if not exists school_name text;
alter table public.schools add column if not exists school_key text;
alter table public.schools add column if not exists owner_id uuid references auth.users (id) on delete set null;
alter table public.schools add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'schools_school_key_key'
      and conrelid = 'public.schools'::regclass
  ) then
    alter table public.schools add constraint schools_school_key_key unique (school_key);
  end if;
exception
  when others then null;
end $$;

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  school_key text not null,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.exams add column if not exists school_id uuid references public.schools (id) on delete cascade;
alter table public.exams add column if not exists school_key text;
alter table public.exams add column if not exists code text;
alter table public.exams add column if not exists active boolean default true;
alter table public.exams add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.exams add column if not exists created_at timestamptz default now();
alter table public.exams add column if not exists ended_at timestamptz;

create index if not exists exams_code_active_idx on public.exams (code) where active = true;
create index if not exists exams_school_key_idx on public.exams (school_key);

create table if not exists public.student_works (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.student_works add column if not exists local_id text;
alter table public.student_works add column if not exists student_name text;
alter table public.student_works add column if not exists school_name text;
alter table public.student_works add column if not exists school_key text;
alter table public.student_works add column if not exists exam_code text;
alter table public.student_works add column if not exists module_id text;
alter table public.student_works add column if not exists module_title text;
alter table public.student_works add column if not exists mode text default 'practice';
alter table public.student_works add column if not exists payload jsonb default '{}'::jsonb;
alter table public.student_works add column if not exists integrity_hash text;
alter table public.student_works add column if not exists created_at timestamptz default now();
-- Soft-delete (debe existir ANTES de las políticas RLS que lo referencian)
alter table public.student_works add column if not exists deleted_at timestamptz;

create index if not exists student_works_school_key_idx on public.student_works (school_key);
create index if not exists student_works_exam_code_idx on public.student_works (exam_code);
create index if not exists student_works_exam_live_idx
  on public.student_works (exam_code, school_key)
  where deleted_at is null;
create index if not exists student_works_local_id_idx
  on public.student_works (local_id)
  where local_id is not null;

create table if not exists public.audit_log (
  id bigserial primary key,
  event text not null,
  created_at timestamptz not null default now()
);

alter table public.audit_log add column if not exists detail jsonb default '{}'::jsonb;
alter table public.audit_log add column if not exists school_key text;
alter table public.audit_log add column if not exists created_at timestamptz default now();

create table if not exists public.improvement_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idea text not null,
  created_at timestamptz not null default now()
);

alter table public.improvement_ideas add column if not exists email text;
alter table public.improvement_ideas add column if not exists school_name text;
alter table public.improvement_ideas add column if not exists idea text;
alter table public.improvement_ideas add column if not exists created_at timestamptz default now();

do $$
begin
  alter table public.improvement_ideas
    drop constraint if exists improvement_ideas_idea_check;
  alter table public.improvement_ideas
    add constraint improvement_ideas_idea_check
    check (char_length(idea) between 10 and 4000);
exception
  when others then null;
end $$;

create index if not exists ideas_user_created_idx
  on public.improvement_ideas (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper: perfil docente del usuario actual
-- ---------------------------------------------------------------------------

create or replace function public.current_teacher_school_key()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select school_key
  from public.teacher_profiles
  where id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_teacher_school_key() from public;
grant execute on function public.current_teacher_school_key() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.teacher_profiles enable row level security;
alter table public.schools enable row level security;
alter table public.exams enable row level security;
alter table public.student_works enable row level security;
alter table public.audit_log enable row level security;
alter table public.improvement_ideas enable row level security;

-- Profiles: solo el propio usuario
drop policy if exists "profiles_self" on public.teacher_profiles;
create policy "profiles_self" on public.teacher_profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Schools
drop policy if exists "schools_select_auth" on public.schools;
create policy "schools_select_auth" on public.schools
  for select to authenticated
  using (owner_id = auth.uid() or owner_id is null);

drop policy if exists "schools_insert_auth" on public.schools;
create policy "schools_insert_auth" on public.schools
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "schools_update_owner" on public.schools;
create policy "schools_update_owner" on public.schools
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Exams: lectura pública de activos (código de pizarra / validación)
drop policy if exists "exams_select_active" on public.exams;
create policy "exams_select_active" on public.exams
  for select to anon, authenticated
  using (active = true);

-- Escritura: solo docentes autenticados, atada a su uid / colegio
drop policy if exists "exams_write_auth" on public.exams;
drop policy if exists "exams_insert_teacher" on public.exams;
drop policy if exists "exams_update_teacher" on public.exams;

create policy "exams_insert_teacher" on public.exams
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and code ~ '^[0-9]{4,8}$'
    and school_key is not null
    and char_length(school_key) between 2 and 160
  );

create policy "exams_update_teacher" on public.exams
  for update to authenticated
  using (
    created_by = auth.uid()
    or school_key = public.current_teacher_school_key()
  )
  with check (
    created_by = auth.uid()
    or school_key = public.current_teacher_school_key()
  );

-- Works: insert con validación mínima (no WITH CHECK true)
-- Nombres legacy y actual: hay que dropear TODOS antes de CREATE (re-run).
drop policy if exists "works_insert_anon" on public.student_works;
drop policy if exists "works_insert_validated" on public.student_works;
create policy "works_insert_validated" on public.student_works
  for insert to anon, authenticated
  with check (
    student_name is not null
    and char_length(trim(student_name)) between 1 and 120
    and (school_key is null or char_length(school_key) <= 160)
    and (exam_code is null or exam_code ~ '^[0-9]{4,8}$')
    and (module_id is null or char_length(module_id) <= 80)
    and (mode is null or (char_length(mode) between 1 and 32 and mode ~ '^[a-z_]+$'))
    and (payload is null or octet_length(payload::text) < 200000)
    and deleted_at is null
  );

-- Lectura de trabajos: solo docentes del mismo school_key; ocultar soft-deleted
drop policy if exists "works_select_authenticated" on public.student_works;
drop policy if exists "works_select_teacher_school" on public.student_works;
create policy "works_select_teacher_school" on public.student_works
  for select to authenticated
  using (
    school_key is not null
    and school_key = public.current_teacher_school_key()
    and deleted_at is null
  );

-- Audit: solo docentes autenticados (no spam anónimo)
drop policy if exists "audit_insert_anon" on public.audit_log;
drop policy if exists "audit_insert_auth" on public.audit_log;
create policy "audit_insert_auth" on public.audit_log
  for insert to authenticated
  with check (
    char_length(event) between 1 and 80
    and (school_key is null or char_length(school_key) <= 160)
    and (detail is null or octet_length(detail::text) < 20000)
  );

-- Ideas
drop policy if exists "ideas_insert_own" on public.improvement_ideas;
create policy "ideas_insert_own" on public.improvement_ideas
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "ideas_select_own" on public.improvement_ideas;
create policy "ideas_select_own" on public.improvement_ideas
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Endurecer función rls_auto_enable (si existe en el proyecto)
-- ---------------------------------------------------------------------------

do $$
begin
  -- Revocar ejecución pública de funciones SECURITY DEFINER peligrosas
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke all on function public.rls_auto_enable() from public';
    execute 'revoke all on function public.rls_auto_enable() from anon';
    execute 'revoke all on function public.rls_auto_enable() from authenticated';
  end if;
exception
  when others then null;
end $$;

-- No exponer tablas al rol public por defecto (Supabase usa anon/authenticated)
revoke all on table public.teacher_profiles from public;
revoke all on table public.schools from public;
revoke all on table public.exams from public;
revoke all on table public.student_works from public;
revoke all on table public.audit_log from public;
revoke all on table public.improvement_ideas from public;

grant select on table public.exams to anon, authenticated;
grant insert on table public.student_works to anon, authenticated;
grant select on table public.student_works to authenticated;
grant insert, update on table public.exams to authenticated;
grant all on table public.teacher_profiles to authenticated;
grant select, insert, update on table public.schools to authenticated;
grant insert on table public.audit_log to authenticated;
grant select, insert on table public.improvement_ideas to authenticated;
grant usage, select on all sequences in schema public to authenticated;

comment on table public.improvement_ideas is 'Ideas de mejora de docentes verificados (email). Cooldown 3h en cliente.';
comment on column public.schools.owner_id is 'Docente auth.users que registró el colegio.';
comment on policy "exams_insert_teacher" on public.exams is 'Solo docentes autenticados pueden crear códigos.';
comment on policy "works_insert_validated" on public.student_works is 'Insert anónimo con validación de campos (no WITH CHECK true).';

-- ---------------------------------------------------------------------------
-- Examen en vivo: soft-delete RPC + packs de retos del docente
-- (columna deleted_at e índices: ya creados con student_works arriba)
-- ---------------------------------------------------------------------------

-- Soft-delete por el alumno (anon) vía RPC (no UPDATE libre sobre la tabla).
-- SECURITY DEFINER: solo actualiza deleted_at con local_id + exam_code exactos.
-- search_path fijo; sin grant a public; no devuelve filas sensibles.
create or replace function public.soft_delete_student_work(
  p_local_id text,
  p_exam_code text
)
returns boolean
language plpgsql
security definer
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

  update public.student_works
  set deleted_at = now()
  where local_id = lid
    and exam_code = p_exam_code
    and deleted_at is null;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.soft_delete_student_work(text, text) from public;
revoke all on function public.soft_delete_student_work(text, text) from anon, authenticated;
grant execute on function public.soft_delete_student_work(text, text) to anon, authenticated;

-- Docente puede actualizar (p. ej. soft-delete manual) filas de su colegio
drop policy if exists "works_update_teacher_school" on public.student_works;
create policy "works_update_teacher_school" on public.student_works
  for update to authenticated
  using (
    school_key is not null
    and school_key = public.current_teacher_school_key()
  )
  with check (
    school_key is not null
    and school_key = public.current_teacher_school_key()
  );

grant update on table public.student_works to authenticated;

-- Pack de retos por código de examen (formulario docente o JSON importado)
create table if not exists public.exam_challenge_packs (
  id uuid primary key default gen_random_uuid(),
  exam_code text not null,
  school_key text not null,
  pack jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exam_challenge_packs add column if not exists exam_code text;
alter table public.exam_challenge_packs add column if not exists school_key text;
alter table public.exam_challenge_packs add column if not exists pack jsonb default '{}'::jsonb;
alter table public.exam_challenge_packs add column if not exists created_by uuid;
alter table public.exam_challenge_packs add column if not exists created_at timestamptz default now();
alter table public.exam_challenge_packs add column if not exists updated_at timestamptz default now();

create unique index if not exists exam_challenge_packs_code_uidx
  on public.exam_challenge_packs (exam_code);

alter table public.exam_challenge_packs enable row level security;

-- Lectura: pack de examen activo (anon) o del colegio del docente
drop policy if exists "challenge_packs_select_active" on public.exam_challenge_packs;
drop policy if exists "challenge_packs_select_teacher" on public.exam_challenge_packs;
create policy "challenge_packs_select_active" on public.exam_challenge_packs
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.exams e
      where e.code = exam_challenge_packs.exam_code
        and e.active = true
    )
  );
create policy "challenge_packs_select_teacher" on public.exam_challenge_packs
  for select to authenticated
  using (school_key = public.current_teacher_school_key());

drop policy if exists "challenge_packs_write_teacher" on public.exam_challenge_packs;
drop policy if exists "challenge_packs_insert_teacher" on public.exam_challenge_packs;
drop policy if exists "challenge_packs_update_teacher" on public.exam_challenge_packs;
create policy "challenge_packs_insert_teacher" on public.exam_challenge_packs
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and school_key = public.current_teacher_school_key()
    and exam_code ~ '^[0-9]{4,8}$'
    and octet_length(pack::text) < 500000
  );

create policy "challenge_packs_update_teacher" on public.exam_challenge_packs
  for update to authenticated
  using (
    school_key = public.current_teacher_school_key()
  )
  with check (
    school_key = public.current_teacher_school_key()
    and octet_length(pack::text) < 500000
  );

revoke all on table public.exam_challenge_packs from public;
grant select on table public.exam_challenge_packs to anon, authenticated;
grant insert, update on table public.exam_challenge_packs to authenticated;

comment on column public.student_works.deleted_at is
  'Soft-delete en vivo: si el alumno borra el trabajo, el docente deja de verlo; al terminar el examen se archivan los no borrados.';
comment on table public.exam_challenge_packs is
  'Retos del examen (JSON por módulo). El docente los carga por formulario o import JSON.';

-- 0002 — Reconciliación idempotente de NOT NULL (§6.2)
-- El esquema histórico declaraba columnas NOT NULL en `create table`, pero los
-- `alter table … add column` posteriores las añadían nullable. Esta migración:
--   a) rellena los nulos redundantes con un valor por defecto razonable,
--   b) aplica `set not null` a cada columna que el contrato exige,
--   c) crea public.schema_health para verificar el estado tras cada despliegue.
-- Regla §6.4.5: un `set not null` que rellenó nulos NO es reversible (REVERSIÓN abajo).

create table if not exists public.schema_migrations (
  version int primary key,
  applied_at timestamptz not null default now(),
  checksum text not null
);

-- public.teacher_profiles.created_at: rellenar nulos y fijar NOT NULL
update public.teacher_profiles set created_at = now() where created_at is null;
alter table public.teacher_profiles alter column created_at set not null;

-- public.schools.school_name: rellenar nulos y fijar NOT NULL
update public.schools set school_name = '' where school_name is null;
alter table public.schools alter column school_name set not null;

-- public.schools.school_key: rellenar nulos y fijar NOT NULL
update public.schools set school_key = '' where school_key is null;
alter table public.schools alter column school_key set not null;

-- public.schools.created_at: rellenar nulos y fijar NOT NULL
update public.schools set created_at = now() where created_at is null;
alter table public.schools alter column created_at set not null;

-- public.exams.school_key: rellenar nulos y fijar NOT NULL
update public.exams set school_key = '' where school_key is null;
alter table public.exams alter column school_key set not null;

-- public.exams.code: rellenar nulos y fijar NOT NULL
update public.exams set code = '' where code is null;
alter table public.exams alter column code set not null;

-- public.exams.active: rellenar nulos y fijar NOT NULL
update public.exams set active = true where active is null;
alter table public.exams alter column active set not null;

-- public.exams.created_at: rellenar nulos y fijar NOT NULL
update public.exams set created_at = now() where created_at is null;
alter table public.exams alter column created_at set not null;

-- public.student_works.payload: rellenar nulos y fijar NOT NULL
update public.student_works set payload = '{}'::jsonb where payload is null;
alter table public.student_works alter column payload set not null;

-- public.student_works.created_at: rellenar nulos y fijar NOT NULL
update public.student_works set created_at = now() where created_at is null;
alter table public.student_works alter column created_at set not null;

-- public.audit_log.event: rellenar nulos y fijar NOT NULL
update public.audit_log set event = '' where event is null;
alter table public.audit_log alter column event set not null;

-- public.audit_log.created_at: rellenar nulos y fijar NOT NULL
update public.audit_log set created_at = now() where created_at is null;
alter table public.audit_log alter column created_at set not null;

-- public.improvement_ideas.user_id: FK a auth.users — sin backfill razonable
do $$
declare n int;
begin
  select count(*) into n from improvement_ideas where user_id is null;
  if n > 0 then
    raise exception '0002: public.improvement_ideas.user_id tiene % filas NULL; resuélvelas a mano y re-aplica', n
      using hint = 'Asigna un user_id válido a esas filas o borra las huérfanas.';
  end if;
  execute('alter table public.improvement_ideas alter column user_id set not null');
end $$;

-- public.improvement_ideas.idea: rellenar nulos y fijar NOT NULL
update public.improvement_ideas set idea = '' where idea is null;
alter table public.improvement_ideas alter column idea set not null;

-- public.improvement_ideas.created_at: rellenar nulos y fijar NOT NULL
update public.improvement_ideas set created_at = now() where created_at is null;
alter table public.improvement_ideas alter column created_at set not null;

-- public.exam_challenge_packs.exam_code: rellenar nulos y fijar NOT NULL
update public.exam_challenge_packs set exam_code = '' where exam_code is null;
alter table public.exam_challenge_packs alter column exam_code set not null;

-- public.exam_challenge_packs.school_key: rellenar nulos y fijar NOT NULL
update public.exam_challenge_packs set school_key = '' where school_key is null;
alter table public.exam_challenge_packs alter column school_key set not null;

-- public.exam_challenge_packs.pack: rellenar nulos y fijar NOT NULL
update public.exam_challenge_packs set pack = '{}'::jsonb where pack is null;
alter table public.exam_challenge_packs alter column pack set not null;

-- public.exam_challenge_packs.created_at: rellenar nulos y fijar NOT NULL
update public.exam_challenge_packs set created_at = now() where created_at is null;
alter table public.exam_challenge_packs alter column created_at set not null;

-- public.exam_challenge_packs.updated_at: rellenar nulos y fijar NOT NULL
update public.exam_challenge_packs set updated_at = now() where updated_at is null;
alter table public.exam_challenge_packs alter column updated_at set not null;

-- ----------------------------------------------------------------
-- Vista de salud: columnas que DEBERÍAN ser NOT NULL y NO lo son.
-- select * from public.schema_health  →  0 filas = esquema sano.
-- ----------------------------------------------------------------
create or replace view public.schema_health as
select c.table_name, c.column_name
from information_schema.columns c
where c.table_schema = 'public'
  and c.is_nullable = 'YES'
  and (c.table_name, c.column_name) in (
    ('teacher_profiles', 'created_at'),
    ('schools', 'school_name'),
    ('schools', 'school_key'),
    ('schools', 'created_at'),
    ('exams', 'school_key'),
    ('exams', 'code'),
    ('exams', 'active'),
    ('exams', 'created_at'),
    ('student_works', 'payload'),
    ('student_works', 'created_at'),
    ('audit_log', 'event'),
    ('audit_log', 'created_at'),
    ('improvement_ideas', 'user_id'),
    ('improvement_ideas', 'idea'),
    ('improvement_ideas', 'created_at'),
    ('exam_challenge_packs', 'exam_code'),
    ('exam_challenge_packs', 'school_key'),
    ('exam_challenge_packs', 'pack'),
    ('exam_challenge_packs', 'created_at'),
    ('exam_challenge_packs', 'updated_at')
);

comment on view public.schema_health is
  'Filas = columnas que deberían ser NOT NULL y no lo son (WAVE 6 §6.2). Vacío = sano.';

-- 0003 — Restricciones por tabla (§6.3, ítems 1 y 3)
--
--  a) `exams.code` pasa a ser único entre exámenes ACTIVOS. Hoy era un índice
--     parcial NO único y `challenge_packs_select_active` (0001) resuelve con
--     `where e.code = ? and e.active` — con códigos duplicados un alumno
--     podía recibir el pack equivocado (fallo funcional).
--  b) `student_works.mode` gana un CHECK a nivel de tabla, endureciendo lo
--     que hoy solo valida la política de insert.

-- ------------------------------------------------------------------
-- a) exams.code: único entre activos
-- ------------------------------------------------------------------
-- Paso 1: si hay duplicados activos (datos históricos), desactivar los
-- más antiguos con un aviso visible. Los errores de esquema se ven (§6.4.2).
do $$
declare
  n int;
begin
  select count(*) into n
  from (
    select code from public.exams where active = true
    group by code having count(*) > 1
  ) d;
  if n > 0 then
    raise notice '0003: % código(s) duplicado(s) activos — se desactivan los más antiguos', n;
    update public.exams e
    set active = false
    where e.id in (
      select id from (
        select id,
               row_number() over (partition by code order by created_at desc) rn
        from public.exams
        where active = true
      ) ranked
      where rn > 1
    );
  end if;
end $$;

-- Paso 2: el índice único. Si aún quedaran duplicados, falla a la vista.
drop index if exists exams_code_active_idx;
create unique index if not exists exams_code_active_uidx on public.exams (code) where active = true;

-- -------------------------------------------------------------------
-- b) student_works.mode: CHECK a nivel de tabla
-- -------------------------------------------------------------------
alter table public.student_works
  drop constraint if exists student_works_mode_check;
alter table public.student_works
  add constraint student_works_mode_check
  check (mode in ('practice', 'exam'));

-- -------------------------------------------------------------------

-- 0004 — Triggers `updated_at` compartidos (§6.3, ítem 2)
--
-- `teacher_profiles.updated_at` y `exam_challenge_packs.updated_at` existían
-- sin trigger: nadie los actualizaba. Un único disparador `set_updated_at()`
-- los mantiene al día en todas las filas de esas tablas.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_teacher_profiles_updated_at on public.teacher_profiles;
create trigger trg_teacher_profiles_updated_at
  before update on public.teacher_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_exam_challenge_packs_updated_at on public.exam_challenge_packs;
create trigger trg_exam_challenge_packs_updated_at
  before update on public.exam_challenge_packs
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------

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

