-- NEXO CLUB 4D. Instalacion manual tras revisar el preflight y el verificador.
-- Solo atribuye INSERT nuevos con una ficha legacy vinculada expresamente a un CTS.
-- Las respuestas preexistentes permanecen sin CTS; no cambia RLS ni formularios.
begin;
set local search_path = pg_catalog;

do $pre$
declare
  v_table text;
begin
  if to_regclass('public.rpe_entries') is null
    or to_regclass('public.wellness_entries') is null
    or to_regclass('public.jugadores') is null
    or to_regclass('public.legacy_jugador_cts_links_v1') is null
    or to_regclass('public.player_team_memberships') is null
    or to_regclass('public.club_team_season_players') is null
    or to_regclass('public.club_team_seasons') is null
    or to_regclass('public.club_seasons') is null
    or to_regclass('public.microcycle_physical_session_links') is null
    or to_regprocedure('public.can_read_club_team_season(uuid)') is null then
    raise exception '4D: faltan relaciones canonicas o el helper de lectura';
  end if;
  foreach v_table in array array['rpe_entries','wellness_entries'] loop
    if (select count(*) from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('public.' || v_table)
        and a.attnum > 0 and not a.attisdropped
        and ((a.attname in ('id','jugador_id') and a.atttypid = 'uuid'::regtype)
          or (a.attname = 'entry_date' and a.atttypid = 'date'::regtype))) <> 3
      or exists (select 1 from pg_catalog.pg_attribute a
        where a.attrelid = to_regclass('public.' || v_table)
          and a.attname = 'club_team_season_id' and not a.attisdropped
          and (a.atttypid <> 'uuid'::regtype or a.attnotnull)) then
      raise exception '4D: columnas incompatibles en %', v_table;
    end if;
    if exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid=to_regclass('public.' || v_table)
        and a.attname='club_team_season_id' and not a.attisdropped)
      and to_regprocedure('public.attribute_collective_recovery_cts_4d()') is null then
      raise exception '4D: columna CTS preexistente sin mecanismo 4D en %',v_table;
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('public.rpe_entries')
        and a.attname = 'rpe' and a.atttypid = 'integer'::regtype)
    or not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('public.rpe_entries')
        and a.attname = 'session_id' and a.atttypid = 'uuid'::regtype)
    or not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('public.wellness_entries')
        and a.attname = 'health_ratio' and a.atttypid = 'numeric'::regtype)
    or not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('public.jugadores')
        and a.attname in ('global_player_id','membership_id')
        and a.atttypid = 'uuid'::regtype
      group by a.attrelid having count(*) = 2)
    or to_regprocedure('public.attribute_collective_recovery_cts_4d()') is not null
       and obj_description(to_regprocedure('public.attribute_collective_recovery_cts_4d()'),'pg_proc')
         is distinct from 'NEXO CLUB 4D: explicit CTS attribution for new recovery responses'
    or to_regprocedure('public.get_microcycle_collective_recovery_4d(uuid,date)') is not null
       and obj_description(to_regprocedure('public.get_microcycle_collective_recovery_4d(uuid,date)'),'pg_proc')
         is distinct from 'NEXO CLUB 4D: private daily RPE and wellness aggregates' then
    raise exception '4D: contrato de respuesta o nombre de funcion incompatible';
  end if;
  if (select count(*) from (values
      ('jugadores','id','uuid'),('jugadores','global_player_id','uuid'),
      ('jugadores','membership_id','uuid'),
      ('legacy_jugador_cts_links_v1','jugador_id','uuid'),
      ('legacy_jugador_cts_links_v1','club_team_season_player_id','uuid'),
      ('club_team_season_players','id','uuid'),
      ('club_team_season_players','player_id','uuid'),
      ('club_team_season_players','club_team_season_id','uuid'),
      ('club_team_season_players','joined_on','date'),
      ('club_team_season_players','left_on','date'),
      ('club_team_season_players','voided_at','timestamp with time zone'),
      ('club_team_season_players','has_departed','boolean'),
      ('club_team_seasons','id','uuid'),('club_team_seasons','season_id','uuid'),
      ('club_team_seasons','club_id','uuid'),('club_team_seasons','team_id','uuid'),
      ('club_seasons','id','uuid'),('club_seasons','club_id','uuid'),
      ('club_seasons','starts_on','date'),('club_seasons','ends_on','date'),
      ('club_seasons','status','text'),
      ('player_team_memberships','id','uuid'),
      ('player_team_memberships','player_id','uuid'),
      ('player_team_memberships','team_id','uuid'),
      ('microcycle_physical_session_links','training_session_id','uuid'),
      ('microcycle_physical_session_links','club_team_season_id','uuid')
    ) expected(table_name,column_name,type_name)
    where exists(select 1 from pg_catalog.pg_attribute a
      where a.attrelid=to_regclass('public.' || expected.table_name)
        and a.attname=expected.column_name and not a.attisdropped
        and a.atttypid=expected.type_name::regtype))<>26 then
    raise exception '4D: columnas del vinculo jugador-CTS incompatibles';
  end if;
  if (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='get_microcycle_collective_recovery_4d')
      > case when to_regprocedure('public.get_microcycle_collective_recovery_4d(uuid,date)') is null then 0 else 1 end then
    raise exception '4D: sobrecarga RPC incompatible';
  end if;
  if (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='attribute_collective_recovery_cts_4d')
      > case when to_regprocedure('public.attribute_collective_recovery_cts_4d()') is null then 0 else 1 end then
    raise exception '4D: sobrecarga de trigger incompatible';
  end if;
end $pre$;

alter table public.rpe_entries add column if not exists club_team_season_id uuid;
alter table public.wellness_entries add column if not exists club_team_season_id uuid;

do $constraints$
declare
  v_table text;
  v_name text;
  v_rel oid;
  v_att smallint;
begin
  foreach v_table in array array['rpe_entries','wellness_entries'] loop
    v_name := v_table || '_cts_4d_fkey';
    v_rel := to_regclass('public.' || v_table);
    select attnum into v_att from pg_catalog.pg_attribute
      where attrelid=v_rel and attname='club_team_season_id' and not attisdropped;
    if exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid=v_rel and c.conname=v_name) then
      if not exists (select 1 from pg_catalog.pg_constraint c
        where c.conrelid=v_rel and c.conname=v_name and c.contype='f'
          and c.confrelid=to_regclass('public.club_team_seasons')
          and c.conkey=array[v_att]::smallint[] and c.confdeltype='r'
          and c.convalidated) then
        raise exception '4D: FK incompatible: %',v_name;
      end if;
    else
      execute pg_catalog.format('alter table public.%I add constraint %I foreign key (club_team_season_id) references public.club_team_seasons(id) on delete restrict',v_table,v_name);
    end if;
  end loop;
end $constraints$;

create index if not exists rpe_entries_cts_date_4d_idx
  on public.rpe_entries (club_team_season_id,entry_date)
  where club_team_season_id is not null;
create index if not exists wellness_entries_cts_date_4d_idx
  on public.wellness_entries (club_team_season_id,entry_date)
  where club_team_season_id is not null;

create or replace function public.attribute_collective_recovery_cts_4d()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_cts uuid;
  v_status text;
  v_session uuid;
begin
  if tg_table_schema <> 'public' or tg_table_name not in ('rpe_entries','wellness_entries') then
    raise exception '4D: origen no autorizado' using errcode='42501';
  end if;
  -- Una correccion de contenido no cambia la atribucion ya acreditada.
  if tg_op='UPDATE' then
    if old.club_team_season_id is null then
      new.club_team_season_id := null; -- Nunca conciliar historico en un UPSERT.
      return new;
    end if;
    if exists (select 1 from public.club_team_seasons cts
      join public.club_seasons season
        on season.id=cts.season_id and season.club_id=cts.club_id
      where cts.id=old.club_team_season_id and season.status='closed') then
      raise exception '4D: temporada cerrada, respuesta de solo lectura'
        using errcode='42501';
    end if;
    if new.jugador_id is not distinct from old.jugador_id
       and new.entry_date is not distinct from old.entry_date then
      if tg_table_name='wellness_entries' then
        new.club_team_season_id := old.club_team_season_id;
        return new;
      elsif new.session_id is not distinct from old.session_id then
        new.club_team_season_id := old.club_team_season_id;
        return new;
      end if;
    end if;
  end if;
  if tg_table_name='rpe_entries' then v_session := new.session_id; end if;
  select roster.club_team_season_id, season.status into v_cts,v_status
  from public.legacy_jugador_cts_links_v1 binding
  join public.jugadores ficha on ficha.id=binding.jugador_id
  join public.club_team_season_players roster
    on roster.id=binding.club_team_season_player_id
   and roster.player_id=ficha.global_player_id and roster.voided_at is null
  join public.club_team_seasons cts on cts.id=roster.club_team_season_id
  join public.club_seasons season on season.id=cts.season_id and season.club_id=cts.club_id
  join public.player_team_memberships stage on stage.id=ficha.membership_id
   and stage.player_id=roster.player_id and stage.team_id=cts.team_id
  where binding.jugador_id=new.jugador_id
    and new.entry_date between season.starts_on and season.ends_on
    and (roster.joined_on is null or new.entry_date>=roster.joined_on)
    and (roster.left_on is null or new.entry_date<roster.left_on)
    and (not roster.has_departed or roster.left_on is not null)
    and (v_session is null or not exists (
      select 1 from public.microcycle_physical_session_links link
      where link.training_session_id=v_session
        and link.club_team_season_id<>roster.club_team_season_id));
  if tg_op='INSERT' then
    if v_cts is not null and v_status='closed' then
      raise exception '4D: temporada cerrada, respuesta de solo lectura'
        using errcode='42501';
    end if;
    new.club_team_season_id := case when v_status='open' then v_cts else null end;
  elsif v_cts is distinct from old.club_team_season_id then
    raise exception '4D: cambio de identidad CTS no acreditado' using errcode='23514';
  else
    new.club_team_season_id := old.club_team_season_id;
  end if;
  return new;
end $function$;
comment on function public.attribute_collective_recovery_cts_4d() is
  'NEXO CLUB 4D: explicit CTS attribution for new recovery responses';
alter function public.attribute_collective_recovery_cts_4d() owner to postgres;
revoke all on function public.attribute_collective_recovery_cts_4d() from public,anon,authenticated,service_role;

do $triggers$
begin
  if exists (select 1 from pg_catalog.pg_trigger t
    where t.tgrelid=to_regclass('public.rpe_entries')
      and t.tgname='rpe_entries_attribute_cts_4d'
      and t.tgfoid<>to_regprocedure('public.attribute_collective_recovery_cts_4d()'))
    or exists (select 1 from pg_catalog.pg_trigger t
    where t.tgrelid=to_regclass('public.wellness_entries')
      and t.tgname='wellness_entries_attribute_cts_4d'
      and t.tgfoid<>to_regprocedure('public.attribute_collective_recovery_cts_4d()')) then
    raise exception '4D: trigger preexistente incompatible';
  end if;
end $triggers$;
drop trigger if exists rpe_entries_attribute_cts_4d on public.rpe_entries;
create trigger rpe_entries_attribute_cts_4d before insert or update
  on public.rpe_entries for each row
  execute function public.attribute_collective_recovery_cts_4d();
drop trigger if exists wellness_entries_attribute_cts_4d on public.wellness_entries;
create trigger wellness_entries_attribute_cts_4d before insert or update
  on public.wellness_entries for each row
  execute function public.attribute_collective_recovery_cts_4d();

create or replace function public.get_microcycle_collective_recovery_4d(
  p_club_team_season_id uuid,p_week_starts_on date)
returns table (day_date date,rpe_average numeric,rpe_responses integer,rpe_state text,
  wellness_average numeric,wellness_responses integer,wellness_state text)
language plpgsql stable security definer set search_path=pg_catalog
as $function$
begin
  if auth.uid() is null or p_club_team_season_id is null or p_week_starts_on is null
    or extract(isodow from p_week_starts_on)<>1
    or public.can_read_club_team_season(p_club_team_season_id) is not true then
    return;
  end if;
  return query
  with days as (select (p_week_starts_on+day_index.day)::date as d
    from pg_catalog.generate_series(0,6) as day_index(day)),
  rpe_unique as (select r.entry_date,r.jugador_id,avg(r.rpe)::numeric as value
    from public.rpe_entries r where r.club_team_season_id=p_club_team_season_id
      and r.entry_date between p_week_starts_on and p_week_starts_on+6
      and r.rpe between 1 and 10
    group by r.entry_date,r.jugador_id having count(*)=1),
  rpe_daily as (select u.entry_date,count(*)::integer as people,avg(u.value)::numeric as value
    from rpe_unique u group by u.entry_date),
  wellness_unique as (select w.entry_date,w.jugador_id,avg(w.health_ratio)::numeric as value
    from public.wellness_entries w where w.club_team_season_id=p_club_team_season_id
      and w.entry_date between p_week_starts_on and p_week_starts_on+6
      and w.health_ratio between 0 and 10
    group by w.entry_date,w.jugador_id having count(*)=1),
  wellness_daily as (select u.entry_date,count(*)::integer as people,avg(u.value)::numeric as value
    from wellness_unique u group by u.entry_date)
  select d.d,
    case when coalesce(r.people,0)>=5 then pg_catalog.round(r.value,2) else null end,
    case when coalesce(r.people,0)>=5 then r.people else null end,
    case when coalesce(r.people,0)=0 then 'absent'
      when r.people<5 then 'below_threshold' else 'available' end,
    case when coalesce(w.people,0)>=5 then pg_catalog.round(w.value,2) else null end,
    case when coalesce(w.people,0)>=5 then w.people else null end,
    case when coalesce(w.people,0)=0 then 'absent'
      when w.people<5 then 'below_threshold' else 'available' end
  from days d left join rpe_daily r on r.entry_date=d.d
    left join wellness_daily w on w.entry_date=d.d
  order by d.d;
end $function$;
comment on function public.get_microcycle_collective_recovery_4d(uuid,date) is
  'NEXO CLUB 4D: private daily RPE and wellness aggregates';
alter function public.get_microcycle_collective_recovery_4d(uuid,date) owner to postgres;
revoke all on function public.get_microcycle_collective_recovery_4d(uuid,date)
  from public,anon,authenticated,service_role;
grant execute on function public.get_microcycle_collective_recovery_4d(uuid,date)
  to authenticated;

do $post$
declare
  v_table text;
  v_index text;
  v_relation oid;
begin
  foreach v_table in array array['rpe_entries','wellness_entries'] loop
    v_index := v_table || '_cts_date_4d_idx';
    v_relation := to_regclass('public.' || v_table);
    if not exists (select 1 from pg_catalog.pg_index i
      where i.indexrelid=to_regclass('public.' || v_index)
        and i.indrelid=v_relation and i.indisvalid and i.indisready
        and i.indnkeyatts=2 and i.indisunique=false
        and i.indkey[0]=(select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid=v_relation and a.attname='club_team_season_id')
        and i.indkey[1]=(select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid=v_relation and a.attname='entry_date')
        and pg_catalog.regexp_replace(pg_catalog.lower(
          pg_catalog.pg_get_expr(i.indpred,i.indrelid)),
          '[[:space:]()]','','g')='club_team_season_idisnotnull') then
      raise exception '4D: indice inexistente o incompatible: %',v_index;
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_trigger t
    where t.tgname in ('rpe_entries_attribute_cts_4d','wellness_entries_attribute_cts_4d')
      and t.tgrelid in (to_regclass('public.rpe_entries'),to_regclass('public.wellness_entries'))
      and t.tgfoid=to_regprocedure('public.attribute_collective_recovery_cts_4d()')
      and not t.tgisinternal and t.tgenabled='O')<>2
    or not pg_catalog.has_function_privilege('authenticated',
      to_regprocedure('public.get_microcycle_collective_recovery_4d(uuid,date)'),'EXECUTE')
    or pg_catalog.has_function_privilege('anon',
      to_regprocedure('public.get_microcycle_collective_recovery_4d(uuid,date)'),'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',
      to_regprocedure('public.attribute_collective_recovery_cts_4d()'),'EXECUTE') then
    raise exception '4D: postflight de triggers o EXECUTE incorrecto';
  end if;
end $post$;
commit;
