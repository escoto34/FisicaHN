-- FísicaHN — esquema Supabase (SQL Editor → Run)
-- Seguro de re-ejecutar: añade columnas que falten si las tablas ya existían.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tablas (CREATE IF NOT EXISTS + ALTER para migrar instalaciones previas)
-- ---------------------------------------------------------------------------

create table if not exists public.teacher_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.teacher_profiles add column if not exists email text;
alter table public.teacher_profiles add column if not exists school_name text;
alter table public.teacher_profiles add column if not exists school_key text;
alter table public.teacher_profiles add column if not exists updated_at timestamptz default now();

-- schools: puede existir de un schema viejo sin owner_id
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

-- unique en school_key (ignorar si ya existe)
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

create index if not exists student_works_school_key_idx on public.student_works (school_key);
create index if not exists student_works_exam_code_idx on public.student_works (exam_code);

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

-- check constraint de longitud (recrear si no existe)
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
-- RLS
-- ---------------------------------------------------------------------------

alter table public.teacher_profiles enable row level security;
alter table public.schools enable row level security;
alter table public.exams enable row level security;
alter table public.student_works enable row level security;
alter table public.audit_log enable row level security;
alter table public.improvement_ideas enable row level security;

-- Profiles
drop policy if exists "profiles_self" on public.teacher_profiles;
create policy "profiles_self" on public.teacher_profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Schools (owner_id ya existe tras el ALTER de arriba)
drop policy if exists "schools_select_auth" on public.schools;
create policy "schools_select_auth" on public.schools
  for select to authenticated using (true);

drop policy if exists "schools_insert_auth" on public.schools;
create policy "schools_insert_auth" on public.schools
  for insert to authenticated
  with check (owner_id is null or owner_id = auth.uid());

drop policy if exists "schools_update_owner" on public.schools;
create policy "schools_update_owner" on public.schools
  for update to authenticated
  using (owner_id is null or owner_id = auth.uid());

-- Exams
drop policy if exists "exams_select_active" on public.exams;
create policy "exams_select_active" on public.exams
  for select to anon, authenticated
  using (active = true);

drop policy if exists "exams_write_auth" on public.exams;
create policy "exams_write_auth" on public.exams
  for all to authenticated
  using (true) with check (true);

-- Works
drop policy if exists "works_insert_anon" on public.student_works;
create policy "works_insert_anon" on public.student_works
  for insert to anon, authenticated with check (true);

drop policy if exists "works_select_authenticated" on public.student_works;
create policy "works_select_authenticated" on public.student_works
  for select to authenticated using (true);

-- Audit
drop policy if exists "audit_insert_anon" on public.audit_log;
create policy "audit_insert_anon" on public.audit_log
  for insert to anon, authenticated with check (true);

-- Ideas
drop policy if exists "ideas_insert_own" on public.improvement_ideas;
create policy "ideas_insert_own" on public.improvement_ideas
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "ideas_select_own" on public.improvement_ideas;
create policy "ideas_select_own" on public.improvement_ideas
  for select to authenticated
  using (user_id = auth.uid());

comment on table public.improvement_ideas is 'Ideas de mejora de docentes verificados (email). Cooldown 3h en cliente.';
comment on column public.schools.owner_id is 'Docente auth.users que registró el colegio (puede ser null en datos legacy).';
