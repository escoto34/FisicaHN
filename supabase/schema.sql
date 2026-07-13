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
