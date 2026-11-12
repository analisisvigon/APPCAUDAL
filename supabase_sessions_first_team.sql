-- MANUAL: preparar/revisar antes de desplegar el nuevo estado. No ejecutado por Codex.
-- Amplía únicamente el catálogo de disponibilidad de sesión. No cambia filas,
-- snapshots, RLS, grants, triggers ni la disponibilidad global del jugador.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  routine regprocedure := to_regprocedure('public.save_planned_session_availability_04b(uuid,integer,jsonb)');
  definition text;
  constraint_definition text;
  old_validation constant text := $$v_status<>all(array['available','absent','injured','adapted'])$$;
  new_validation constant text := $$v_status<>all(array['available','absent','injured','adapted','first_team'])$$;
begin
  if routine is null or to_regclass('public.planned_session_player_availability') is null then
    raise exception 'Faltan los prerrequisitos de Sesiones 04A/04B';
  end if;
  if not exists (select 1 from pg_proc where oid=routine and prosecdef
    and 'search_path=pg_catalog'=any(proconfig)) then
    raise exception 'Contrato de seguridad inesperado; revisar antes de aplicar';
  end if;
  select pg_get_functiondef(routine) into definition;
  select pg_get_constraintdef(oid) into constraint_definition
    from pg_constraint where conrelid='public.planned_session_player_availability'::regclass
      and conname='planned_session_player_availability_status_check' and contype='c';
  if constraint_definition is null then raise exception 'Falta la restricción de estados'; end if;
  if position(new_validation in definition)>0 and position('first_team' in constraint_definition)>0 then
    raise notice 'Estado first_team ya instalado';
    return;
  end if;
  if (length(definition)-length(replace(definition,old_validation,'')))<>length(old_validation)
    or position('first_team' in constraint_definition)>0
    or (select array_agg(m[1] order by m[1]) from regexp_matches(constraint_definition, '''([^'']+)''', 'g') m)
      is distinct from array['absent','adapted','available','injured']::text[] then
    raise exception 'Validación distinta de 04B o instalación parcial; revisar sin sobrescribir';
  end if;
  -- Mantiene íntegramente el bloqueo CTS/CAS, la auditoría y la RPC instalada.
  execute replace(definition,old_validation,new_validation);
  alter table public.planned_session_player_availability
    drop constraint planned_session_player_availability_status_check;
  alter table public.planned_session_player_availability
    add constraint planned_session_player_availability_status_check
      check (status in ('available','absent','injured','adapted','first_team'));
end
$migration$;
commit;
