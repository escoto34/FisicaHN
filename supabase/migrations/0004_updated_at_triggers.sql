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
-- Aplicada: registrar versión 4
-- -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.schema_migrations where version = 4) then
    insert into public.schema_migrations (version, checksum)
    values (4, '80361aeb4114010649b67b3501786a9cc67aa0a96578813f04f209fd0f77b44e');
  else
    raise notice '0004 ya aplicada — esquema en orden';
  end if;
end $$;

-- ============ REVERSIÓN ============
--   drop trigger trg_teacher_profiles_updated_at on public.teacher_profiles;
--   drop trigger trg_exam_challenge_packs_updated_at on public.exam_challenge_packs;
--   drop function public.set_updated_at();
--   delete from public.schema_migrations where version = 4;