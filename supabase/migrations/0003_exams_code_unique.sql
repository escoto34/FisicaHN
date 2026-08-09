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
create unique index exams_code_active_uidx on public.exams (code) where active = true;

-- -------------------------------------------------------------------
-- b) student_works.mode: CHECK a nivel de tabla
-- -------------------------------------------------------------------
alter table public.student_works
  drop constraint if exists student_works_mode_check;
alter table public.student_works
  add constraint student_works_mode_check
  check (mode in ('practice', 'exam'));

-- -------------------------------------------------------------------
-- Aplicada: registrar versión 3
-- -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.schema_migrations where version = 3) then
    insert into public.schema_migrations (version, checksum)
    values (3, 'f51dc42d62629094f4097187ea5f1e4530bfe17db0346beb8d0c3eb5b9e2719c');
  else
    raise notice '0003 ya aplicada — esquema en orden';
  end if;
end $$;

-- ============ REVERSIÓN ============
--   drop index if exists exams_code_active_uidx;
--   create index exams_code_active_idx on public.exams (code) where active = true;
--   alter table public.student_works drop constraint student_works_mode_check;
--   Nota: la desactivación de duplicados históricos NO es reversible
--   (restaurar esas filas desde backup si hiciera falta).
--   delete from public.schema_migrations where version = 3;