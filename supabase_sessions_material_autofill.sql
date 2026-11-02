-- PROPUESTA LOCAL. Instalar manualmente tras revisión; no modifica sesiones existentes.
begin;

do $pre$
begin
  if to_regclass('public.planned_training_sessions') is null or
     to_regclass('public.planned_session_items') is null or
     to_regclass('public.planned_session_audit_events') is null or
     to_regprocedure('public.can_write_club_team_season(uuid)') is null or
     to_regprocedure('public.planned_session_state(uuid)') is null then
    raise exception 'Material de Sesiones: faltan dependencias';
  end if;
  if exists(select 1 from pg_catalog.pg_attribute where
      attrelid=to_regclass('public.planned_training_sessions') and
      attname='material_state' and not attisdropped and
      (atttypid<>'pg_catalog.jsonb'::regtype or attnotnull or atthasdef or
       pg_catalog.col_description(attrelid,attnum) is distinct from
         'NEXO CLUB Sesiones: procedencia manual y exclusiones de Material')) then
    raise exception 'Material de Sesiones: material_state preexistente incompatible';
  end if;
  if exists(select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='save_planned_session_material'
        and p.oid<>coalesce(to_regprocedure(
          'public.save_planned_session_material(uuid,integer,jsonb)')::oid,'0'::oid)) then
    raise exception 'Material de Sesiones: sobrecarga incompatible';
  end if;
  if to_regprocedure('public.save_planned_session_material(uuid,integer,jsonb)') is not null and
     pg_catalog.obj_description(to_regprocedure(
       'public.save_planned_session_material(uuid,integer,jsonb)')::oid,'pg_proc')
       is distinct from 'NEXO CLUB Sesiones: sincronización de Material por snapshot y CAS' then
    raise exception 'Material de Sesiones: RPC preexistente sin contrato acreditado';
  end if;
end $pre$;

alter table public.planned_training_sessions
  add column if not exists material_state jsonb;
comment on column public.planned_training_sessions.material_state is
  'NEXO CLUB Sesiones: procedencia manual y exclusiones de Material';

create or replace function public.save_planned_session_material(
  p_session_id uuid,p_expected_revision integer,p_state jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_session public.planned_training_sessions%rowtype;
  v_cts uuid; v_club uuid; v_actor uuid; v_status text; v_snapshot jsonb; v_json jsonb;
  v_raw text; v_part text; v_entry text; v_key text;
  v_auto text[]:='{}'; v_auto_keys text[]:='{}';
  v_manual text[]:='{}'; v_manual_keys text[]:='{}';
  v_excluded text[]:='{}'; v_merged text[]:='{}'; v_merged_keys text[]:='{}';
  v_state jsonb; v_material text; v_revision integer; v_before text; v_after text;
begin
  if auth.uid() is null or p_session_id is null or p_expected_revision is null or
     p_state is null or pg_catalog.jsonb_typeof(p_state)<>'object' or
     p_state->>'version' is distinct from '1' or
     (p_state - array['version','manual','excluded'])<>'{}'::jsonb or
     pg_catalog.jsonb_typeof(p_state->'manual') is distinct from 'array' or
     pg_catalog.jsonb_typeof(p_state->'excluded') is distinct from 'array' or
     pg_catalog.jsonb_array_length(p_state->'manual')>100 or
     pg_catalog.jsonb_array_length(p_state->'excluded')>100 or
     pg_catalog.octet_length(p_state::text)>10000 then
    raise exception 'Estado de Material inválido' using errcode='22023';
  end if;
  select s.club_team_season_id into v_cts
    from public.planned_training_sessions s where s.id=p_session_id;
  if v_cts is null or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Sesión no autorizada' using errcode='42501';
  end if;
  select cts.club_id,se.status into v_club,v_status
    from public.club_team_seasons cts
    join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
    where cts.id=v_cts for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  select * into v_session from public.planned_training_sessions s
    where s.id=p_session_id for update;
  if not found or v_session.revision<>p_expected_revision then
    raise exception 'Revisión obsoleta' using errcode='40001';
  end if;
  select m.id into v_actor from public.club_memberships m
    where m.club_id=v_club and m.user_id=auth.uid() and m.is_active
      and m.role in ('owner','admin','staff')
    order by m.id limit 1 for share of m;
  if v_actor is null then
    raise exception 'Membresía no autorizada' using errcode='42501';
  end if;
  if exists(select 1 from public.club_memberships m where m.id=v_actor and m.role='staff') then
    perform 1 from public.club_team_season_permissions p
      where p.club_id=v_club and p.membership_id=v_actor
        and p.club_team_season_id=v_cts for share of p;
    if not found then raise exception 'Asignación revocada' using errcode='42501'; end if;
  end if;
  for v_json in select value from pg_catalog.jsonb_array_elements(p_state->'manual') loop
    if pg_catalog.jsonb_typeof(v_json)<>'string' then
      raise exception 'Entrada manual inválida' using errcode='22023';
    end if;
    v_part:=pg_catalog.regexp_replace(pg_catalog.btrim(v_json #>> '{}'),
      '[[:space:]]+',' ','g');
    v_key:=pg_catalog.lower(v_part);
    if v_part='' or pg_catalog.char_length(v_part)>200 or
       v_part ~ '[,;]' or pg_catalog.strpos(v_part,E'\n')>0 then
      raise exception 'Entrada manual inválida' using errcode='22023';
    end if;
    if v_key<>all(v_manual_keys) then
      v_manual:=pg_catalog.array_append(v_manual,v_part);
      v_manual_keys:=pg_catalog.array_append(v_manual_keys,v_key);
    end if;
  end loop;
  for v_json in select value from pg_catalog.jsonb_array_elements(p_state->'excluded') loop
    if pg_catalog.jsonb_typeof(v_json)<>'string' then
      raise exception 'Exclusión inválida' using errcode='22023';
    end if;
    v_entry:=v_json #>> '{}';
    v_key:=pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(v_entry),
      '[[:space:]]+',' ','g'));
    if v_key='' or pg_catalog.char_length(v_key)>200 or v_key ~ '[,;]' or
       pg_catalog.strpos(v_key,E'\n')>0 then
      raise exception 'Exclusión inválida' using errcode='22023';
    end if;
    if v_key<>all(v_excluded) then v_excluded:=pg_catalog.array_append(v_excluded,v_key); end if;
  end loop;
  for v_snapshot in select it.task_snapshot from public.planned_session_items it
      join public.planned_session_slots sl on sl.id=it.slot_id and sl.session_id=it.session_id
      where it.session_id=p_session_id and it.kind='library_task'
      order by case sl.phase when 'activation' then 0 when 'main' then 1
        when 'cooldown' then 2 else 3 end,sl.sort_order,sl.id,it.sort_order,it.id loop
    if v_snapshot is null or v_snapshot->>'snapshot_version' is distinct from '1' then
      raise exception 'Snapshot de Biblioteca incompatible' using errcode='0A000';
    end if;
    v_raw:=case when v_snapshot->'working' ? 'material'
      then v_snapshot->'working'->>'material'
      else v_snapshot->'source'->>'material' end;
    for v_part in select pg_catalog.regexp_split_to_table(coalesce(v_raw,''),E'[,;\n]+') loop
      v_part:=pg_catalog.regexp_replace(pg_catalog.btrim(v_part),'[[:space:]]+',' ','g');
      v_key:=pg_catalog.lower(v_part);
      if v_part<>'' and v_key<>all(v_auto_keys) then
        v_auto:=pg_catalog.array_append(v_auto,v_part);
        v_auto_keys:=pg_catalog.array_append(v_auto_keys,v_key);
      end if;
    end loop;
  end loop;
  for v_part in select unnest(v_auto) loop
    v_key:=pg_catalog.lower(v_part);
    if v_key<>all(v_excluded) and v_key<>all(v_merged_keys) then
      v_merged:=pg_catalog.array_append(v_merged,v_part);
      v_merged_keys:=pg_catalog.array_append(v_merged_keys,v_key);
    end if;
  end loop;
  for v_part in select unnest(v_manual) loop
    v_key:=pg_catalog.lower(v_part);
    if v_key<>all(v_merged_keys) then
      v_merged:=pg_catalog.array_append(v_merged,v_part);
      v_merged_keys:=pg_catalog.array_append(v_merged_keys,v_key);
    end if;
  end loop;
  v_material:=nullif(pg_catalog.array_to_string(v_merged,', '),'');
  if pg_catalog.char_length(v_material)>5000 then
    raise exception 'Material supera 5000 caracteres' using errcode='22001';
  end if;
  v_state:=pg_catalog.jsonb_build_object('version',1,'manual',v_manual,'excluded',v_excluded);
  if v_session.material is not distinct from v_material and
     v_session.material_state is not distinct from v_state then
    return v_session.revision;
  end if;
  v_before:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'session',public.planned_session_state(p_session_id),
    'material_state',v_session.material_state)::text);
  update public.planned_training_sessions set material=v_material,
    material_state=v_state,revision=revision+1 where id=p_session_id
    returning revision into v_revision;
  v_after:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'session',public.planned_session_state(p_session_id),
    'material_state',v_state)::text);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
  values (p_session_id,v_revision,v_actor,
    case when v_session.planning_state='confirmed' then 'confirmed_saved' else 'draft_saved' end,
    array['material'],v_before,v_after,
    pg_catalog.jsonb_build_object('operation','material_autofill'));
  return v_revision;
end $fn$;

comment on function public.save_planned_session_material(uuid,integer,jsonb) is
  'NEXO CLUB Sesiones: sincronización de Material por snapshot y CAS';

alter function public.save_planned_session_material(uuid,integer,jsonb) owner to postgres;
revoke all on function public.save_planned_session_material(uuid,integer,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.save_planned_session_material(uuid,integer,jsonb)
  to authenticated,service_role;

do $post$
begin
  if not exists(select 1 from pg_catalog.pg_attribute where
      attrelid=to_regclass('public.planned_training_sessions') and
      attname='material_state' and atttypid='pg_catalog.jsonb'::regtype and
      not attisdropped and not attnotnull) or
     not exists(select 1 from pg_catalog.pg_proc where
      oid=to_regprocedure('public.save_planned_session_material(uuid,integer,jsonb)')
      and prosecdef and proconfig @> array['search_path=pg_catalog']::text[]) or
     pg_catalog.has_function_privilege('anon',
       'public.save_planned_session_material(uuid,integer,jsonb)','EXECUTE') or
     not pg_catalog.has_function_privilege('authenticated',
       'public.save_planned_session_material(uuid,integer,jsonb)','EXECUTE') then
    raise exception 'Material de Sesiones: postflight fallido';
  end if;
end $post$;

commit;
