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

-- Aplicada: registrar versión 2 (checksum 4a9449760a365992d7c5d1cd)
do $$
begin
  if not exists (select 1 from public.schema_migrations where version = 2) then
    insert into public.schema_migrations (version, checksum)
    values (2, '74426f1740de1701063b758ae8e45087c8810652bd98ada3df7421d2be9524b3');
  else
    raise notice '0002 ya aplicada — esquema en orden';
  end if;
end $$;

-- =============================================================
-- REVERSIÓN (solo si no se rellenó NINGÚN nulo):
--   alter table public.schools  alter column school_name drop not null;
--   … repetir por cada columna tocada arriba.
-- Si hubo relleno de nulos, la reversión exige restaurar un backup
-- anterior a 0002 (un set not null que reparó datos no es reversible).
--   drop view public.schema_health;
--   delete from public.schema_migrations where version = 2;
-- =============================================================