-- APPCAUDAL Sesiones 05. PREPARADO PARA REVISIÓN; NO EJECUTADO.
-- Requiere 03A, 03C, 04A y 04B instalados. No modifica esas RPC ni sus tablas.
begin;

do $pre$
declare v_name text;
begin
  if to_regclass('public.planned_training_sessions') is null
     or to_regclass('public.planned_session_slots') is null
     or to_regclass('public.planned_session_player_roster') is null
     or to_regclass('public.player_positions') is null
     or to_regclass('public.planned_session_audit_events') is null
     or to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is null
     or to_regprocedure('public.planned_session_04b_state(uuid)') is null
     or to_regprocedure('public.can_read_club_team_season(uuid)') is null then
    raise exception 'Sesiones 05: faltan dependencias instaladas de 03A/04A/04B';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='planned_session_04b_lock'
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[])
     or not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='planned_session_player_roster'
         and c.relrowsecurity) then
    raise exception 'Sesiones 05: autorización 04B o RLS 04A incompatibles';
  end if;
  if (select count(*) from pg_attribute a
      where a.attrelid=to_regclass('public.planned_session_player_roster')
        and a.attname in ('session_id','player_id') and a.atttypid='uuid'::regtype
        and not a.attisdropped)<>2
     or (select count(*) from pg_attribute a
      where a.attrelid=to_regclass('public.planned_session_slots')
        and a.attname in ('id','session_id') and a.atttypid='uuid'::regtype
        and not a.attisdropped)<>2
     or (select count(*) from pg_attribute a
      where a.attrelid=to_regclass('public.player_positions') and not a.attisdropped
        and ((a.attname='player_id' and a.atttypid='uuid'::regtype)
          or (a.attname in ('position_type','position_key') and a.atttypid='text'::regtype)
          or (a.attname='is_primary' and a.atttypid='boolean'::regtype)))<>4 then
    raise exception 'Sesiones 05: columnas canónicas incompatibles';
  end if;
  if to_regclass('public.planned_session_distributions') is not null
    and obj_description(to_regclass('public.planned_session_distributions'),'pg_class')
      is distinct from 'APPCAUDAL Sesiones 05: session distributions v1' then
    raise exception 'Sesiones 05: nombre de tabla ocupado';
  end if;
  for v_name in select p.oid::regprocedure::text from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='save_planned_session_distributions_05'
      and p.oid<>coalesce(to_regprocedure(
        'public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)')::oid,'0'::oid)
  loop
    raise exception 'Sesiones 05: sobrecarga conflictiva %',v_name;
  end loop;
  if to_regprocedure('public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)') is not null
    and obj_description(to_regprocedure(
      'public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)'),'pg_proc')
      is distinct from 'APPCAUDAL Sesiones 05: save_planned_session_distributions_05' then
    raise exception 'Sesiones 05: nombre de RPC ocupado';
  end if;
end $pre$;

create table if not exists public.planned_session_distributions (
  session_id uuid primary key references public.planned_training_sessions(id) on delete restrict,
  formation_key text,
  specific_positions_snapshot jsonb not null default '[]'::jsonb,
  player_layout jsonb not null default '[]'::jsonb,
  space_zones jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_distributions_formation_check check (
    formation_key is null or formation_key in
      ('4-4-2','4-2-3-1','4-3-3','4-1-4-1','3-5-2','5-3-2','3-4-3')),
  constraint planned_distributions_json_check check (
    jsonb_typeof(specific_positions_snapshot)='array'
    and jsonb_typeof(player_layout)='array'
    and jsonb_typeof(space_zones)='array'
    and octet_length(specific_positions_snapshot::text)<=32768
    and octet_length(player_layout::text)<=65536
    and octet_length(space_zones::text)<=65536),
  constraint planned_distributions_empty_formation_check check (
    formation_key is not null or player_layout='[]'::jsonb)
);
comment on table public.planned_session_distributions is
  'APPCAUDAL Sesiones 05: session distributions v1';
alter table public.planned_session_distributions owner to postgres;
alter table public.planned_session_distributions enable row level security;
revoke all on table public.planned_session_distributions
  from public,anon,authenticated,service_role;
grant select on table public.planned_session_distributions to authenticated,service_role;

do $policy$
begin
  if not exists (select 1 from pg_policy where polrelid=to_regclass(
      'public.planned_session_distributions') and polname='planned_distributions_read') then
    create policy planned_distributions_read on public.planned_session_distributions
      for select to authenticated using (
        exists (select 1 from public.planned_training_sessions s
          where s.id=session_id
            and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
end $policy$;
alter policy planned_distributions_read on public.planned_session_distributions
  to authenticated using (
    exists (select 1 from public.planned_training_sessions s
      where s.id=session_id
        and public.can_read_club_team_season(s.club_team_season_id)));

-- Reemplazo completo de ambas distribuciones. El cliente envía TODOS los
-- jugadores congelados y TODOS los ejercicios actuales; no envía posiciones
-- específicas como autoridad. El servidor las congela desde player_positions.
create or replace function public.save_planned_session_distributions_05(
  p_session_id uuid,p_expected_revision integer,p_formation_key text,
  p_player_layout jsonb,p_space_zones jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ctx record; v_old record; v_exists boolean; v_snapshot jsonb:='[]'::jsonb;
  v_item jsonb; v_id uuid; v_seen uuid[]:='{}'::uuid[];
  v_roster_count integer; v_slot_count integer; v_revision integer;
  v_x numeric; v_y numeric; v_w numeric; v_h numeric;
  v_before jsonb; v_after jsonb; v_before_hash text; v_after_hash text;
begin
  if jsonb_typeof(p_player_layout) is distinct from 'array'
     or jsonb_typeof(p_space_zones) is distinct from 'array'
     or octet_length(p_player_layout::text)>65536
     or octet_length(p_space_zones::text)>65536
     or jsonb_array_length(p_player_layout)>100
     or jsonb_array_length(p_space_zones)>100
     or (p_formation_key is not null and p_formation_key not in
       ('4-4-2','4-2-3-1','4-3-3','4-1-4-1','3-5-2','5-3-2','3-4-3')) then
    raise exception 'Distribución inválida' using errcode='22023';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  select formation_key,specific_positions_snapshot,player_layout,space_zones
    into v_old from public.planned_session_distributions
    where session_id=p_session_id for update;
  v_exists:=found;
  select count(*) into v_roster_count from public.planned_session_player_roster
    where session_id=p_session_id;
  select count(*) into v_slot_count from public.planned_session_slots
    where session_id=p_session_id;
  if (p_formation_key is null and jsonb_array_length(p_player_layout)<>0)
     or (p_formation_key is not null and
       (v_roster_count=0 or jsonb_array_length(p_player_layout)<>v_roster_count))
     or jsonb_array_length(p_space_zones)<>v_slot_count then
    raise exception 'Distribución incompleta para la plantilla o los ejercicios actuales'
      using errcode='23514';
  end if;
  if v_exists then
    v_snapshot:=v_old.specific_positions_snapshot;
  end if;
  if p_formation_key is not null and v_snapshot='[]'::jsonb then
      select coalesce(jsonb_agg(jsonb_build_object('player_id',r.player_id,
        'position_key',pos.position_key) order by r.player_id),'[]'::jsonb)
        into v_snapshot
      from public.planned_session_player_roster r
      left join lateral (
        select case when count(*)=1 then min(p.position_key) end as position_key
        from public.player_positions p where p.player_id=r.player_id
          and p.position_type='specific' and p.is_primary
      ) pos on true
      where r.session_id=p_session_id;
  end if;
  for v_item in select value from jsonb_array_elements(p_player_layout) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ?& array['player_id','placement','x','y'])
       or exists (select 1 from jsonb_object_keys(v_item) as k(key)
         where k.key not in ('player_id','placement','x','y'))
       or jsonb_typeof(v_item->'player_id') is distinct from 'string'
       or jsonb_typeof(v_item->'placement') is distinct from 'string'
       or coalesce(v_item->>'placement' not in ('auto','manual','unplaced'),true) then
      raise exception 'Ubicación de jugador inválida' using errcode='22023';
    end if;
    v_id:=(v_item->>'player_id')::uuid;
    if v_id=any(v_seen) or not exists (select 1 from public.planned_session_player_roster r
      where r.session_id=p_session_id and r.player_id=v_id) then
      raise exception 'Jugador ajeno o duplicado en la distribución' using errcode='23514';
    end if;
    v_seen:=array_append(v_seen,v_id);
    if v_item->>'placement'='unplaced' then
      if jsonb_typeof(v_item->'x') is distinct from 'null'
        or jsonb_typeof(v_item->'y') is distinct from 'null' then
        raise exception 'Jugador sin ubicación con coordenadas' using errcode='22023';
      end if;
    else
      if jsonb_typeof(v_item->'x') is distinct from 'number'
         or jsonb_typeof(v_item->'y') is distinct from 'number' then
        raise exception 'Coordenadas de jugador inválidas' using errcode='22023';
      end if;
      v_x:=(v_item->>'x')::numeric; v_y:=(v_item->>'y')::numeric;
      if v_x<0 or v_x>100 or v_y<0 or v_y>100 then
        raise exception 'Coordenadas de jugador fuera del campo' using errcode='22023';
      end if;
      if v_item->>'placement'='auto' and not exists (
        select 1 from jsonb_array_elements(v_snapshot) as p(value)
        where p.value->>'player_id'=v_id::text and p.value->>'position_key' is not null) then
        raise exception 'Jugador sin posición específica inequívoca: usar sin ubicación'
          using errcode='23514';
      end if;
    end if;
  end loop;
  v_seen:='{}'::uuid[];
  for v_item in select value from jsonb_array_elements(p_space_zones) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ?& array['slot_id','x','y','w','h','color','provisional'])
       or exists (select 1 from jsonb_object_keys(v_item) as k(key)
         where k.key not in ('slot_id','x','y','w','h','color','provisional'))
       or jsonb_typeof(v_item->'slot_id') is distinct from 'string'
       or jsonb_typeof(v_item->'provisional') is distinct from 'boolean'
       or jsonb_typeof(v_item->'color') is distinct from 'string'
       or coalesce(v_item->>'color' not in
         ('blue','red','green','yellow','purple','orange','teal'),true)
       or jsonb_typeof(v_item->'x') is distinct from 'number'
       or jsonb_typeof(v_item->'y') is distinct from 'number'
       or jsonb_typeof(v_item->'w') is distinct from 'number'
       or jsonb_typeof(v_item->'h') is distinct from 'number' then
      raise exception 'Zona de ejercicio inválida' using errcode='22023';
    end if;
    v_id:=(v_item->>'slot_id')::uuid;
    if v_id=any(v_seen) or not exists (select 1 from public.planned_session_slots sl
      where sl.id=v_id and sl.session_id=p_session_id) then
      raise exception 'Ejercicio ajeno o duplicado en distribución de espacio'
        using errcode='23514';
    end if;
    v_seen:=array_append(v_seen,v_id);
    v_x:=(v_item->>'x')::numeric; v_y:=(v_item->>'y')::numeric;
    v_w:=(v_item->>'w')::numeric; v_h:=(v_item->>'h')::numeric;
    if v_x<0 or v_y<0 or v_w<=0 or v_h<=0
       or v_x+v_w>100 or v_y+v_h>100 then
      raise exception 'Zona fuera del campo' using errcode='22023';
    end if;
  end loop;
  v_before:=case when v_exists then jsonb_build_object(
    'formation',v_old.formation_key,'specific',v_old.specific_positions_snapshot,
    'players',v_old.player_layout,'zones',v_old.space_zones) else '{}'::jsonb end;
  v_after:=jsonb_build_object('formation',p_formation_key,'specific',v_snapshot,
    'players',p_player_layout,'zones',p_space_zones);
  if v_before=v_after then return p_expected_revision; end if;
  v_before_hash:=md5(jsonb_build_object('session',public.planned_session_04b_state(p_session_id),
    'distribution',v_before)::text);
  insert into public.planned_session_distributions
    (session_id,formation_key,specific_positions_snapshot,player_layout,space_zones)
    values (p_session_id,p_formation_key,v_snapshot,p_player_layout,p_space_zones)
    on conflict (session_id) do update set
      formation_key=excluded.formation_key,
      specific_positions_snapshot=excluded.specific_positions_snapshot,
      player_layout=excluded.player_layout,space_zones=excluded.space_zones,
      updated_at=now();
  update public.planned_training_sessions set revision=revision+1
    where id=p_session_id returning revision into v_revision;
  v_after_hash:=md5(jsonb_build_object('session',public.planned_session_04b_state(p_session_id),
    'distribution',v_after)::text);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
    values (p_session_id,v_revision,v_ctx.actor_id,
      case when v_ctx.planning_state='confirmed' then 'confirmed_saved' else 'draft_saved' end,
      array['distributions'],v_before_hash,v_after_hash,
      jsonb_build_object('operation','save_distributions_05',
        'players',jsonb_array_length(p_player_layout),
        'zones',jsonb_array_length(p_space_zones)));
  return v_revision;
end $fn$;
comment on function public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb) is
  'APPCAUDAL Sesiones 05: save_planned_session_distributions_05';
alter function public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)
  owner to postgres;
revoke all on function public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)
  to authenticated;

do $post$
begin
  if not exists (select 1 from pg_class c where c.oid=to_regclass(
      'public.planned_session_distributions') and c.relrowsecurity
      and c.relowner='postgres'::regrole)
     or not has_table_privilege('authenticated',
       'public.planned_session_distributions','SELECT')
     or not has_table_privilege('service_role',
       'public.planned_session_distributions','SELECT')
     or has_table_privilege('authenticated',
       'public.planned_session_distributions',
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or has_table_privilege('anon','public.planned_session_distributions',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or (select count(*) from pg_policy where polrelid=to_regclass(
      'public.planned_session_distributions'))<>1
     or not exists (select 1 from pg_policy p
       where p.polrelid=to_regclass('public.planned_session_distributions')
         and p.polname='planned_distributions_read' and p.polcmd='r'
         and p.polpermissive and p.polroles=array['authenticated'::regrole::oid]
         and position('can_read_club_team_season' in
           pg_get_expr(p.polqual,p.polrelid))>0)
     or not exists (select 1 from pg_proc p where p.oid=to_regprocedure(
       'public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)')
       and p.prosecdef and p.proowner='postgres'::regrole
       and p.proconfig @> array['search_path=pg_catalog']::text[])
     or not has_function_privilege('authenticated',
       'public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)','EXECUTE')
     or has_function_privilege('anon',
       'public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)','EXECUTE') then
    raise exception 'Sesiones 05: postflight de permisos/RLS/RPC fallido';
  end if;
  if (select count(*) from pg_attribute a where a.attrelid=to_regclass(
      'public.planned_session_distributions') and a.attnum>0 and not a.attisdropped)<>7
     or (select count(*) from pg_attribute a where a.attrelid=to_regclass(
       'public.planned_session_distributions') and not a.attisdropped
       and ((a.attname='session_id' and a.atttypid='uuid'::regtype and a.attnotnull)
         or (a.attname='formation_key' and a.atttypid='text'::regtype and not a.attnotnull)
         or (a.attname in ('specific_positions_snapshot','player_layout','space_zones')
           and a.atttypid='jsonb'::regtype and a.attnotnull)
         or (a.attname in ('created_at','updated_at')
           and a.atttypid='timestamptz'::regtype and a.attnotnull)))<>7
     or (select count(*) from pg_constraint c where c.conrelid=to_regclass(
       'public.planned_session_distributions'))<>5
     or (select count(*) from pg_constraint c where c.conrelid=to_regclass(
       'public.planned_session_distributions') and c.convalidated and c.contype='c'
       and c.conname in ('planned_distributions_formation_check',
         'planned_distributions_json_check',
         'planned_distributions_empty_formation_check'))<>3
     or not exists (select 1 from pg_constraint c where c.conrelid=to_regclass(
       'public.planned_session_distributions') and c.contype='f' and c.convalidated
       and c.confrelid=to_regclass('public.planned_training_sessions')
       and c.confdeltype='r' and cardinality(c.conkey)=1
       and c.conkey[1]=(select a.attnum from pg_attribute a
         where a.attrelid=c.conrelid and a.attname='session_id' and not a.attisdropped))
     or not exists (select 1 from pg_constraint c where c.conrelid=to_regclass(
       'public.planned_session_distributions') and c.contype='p' and c.convalidated
       and cardinality(c.conkey)=1
       and c.conkey[1]=(select a.attnum from pg_attribute a
         where a.attrelid=c.conrelid and a.attname='session_id' and not a.attisdropped)) then
    raise exception 'Sesiones 05: restricciones ausentes o incompatibles';
  end if;
end $post$;
commit;
