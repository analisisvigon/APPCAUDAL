-- NEXO CLUB / Microciclos 4B. REVISAR E INSTALAR MANUALMENTE.
-- No vincula ni modifica sesiones historicas. Conserva la RPC y el indice legacy.
begin;

do $preflight$
declare
  required_column record;
begin
  if auth.uid() is not null then
    raise exception '4B requiere una sesion administrativa sin JWT';
  end if;
  if to_regclass('public.training_sessions') is null
     or to_regclass('public.training_session_load_metrics') is null
     or to_regclass('public.microcycle_physical_session_links') is null
     or to_regclass('public.club_team_seasons') is null
     or to_regclass('public.club_seasons') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null
     or to_regprocedure('public.get_microcycle_team_loads_4a(uuid,date)') is null then
    raise exception '4B requiere las relaciones y helpers verificados de 4A';
  end if;
  if to_regprocedure('public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)') is not null
     and obj_description(to_regprocedure('public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)'), 'pg_proc')
       is distinct from 'NEXO CLUB 4B: atomic authorized CTS physical load save' then
    raise exception '4B: firma de guardado preexistente incompatible';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'save_cts_daily_training_load_4b'
      and p.oid <> coalesce(to_regprocedure('public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)')::oid, 0)) then
    raise exception '4B: sobrecarga de guardado incompatible';
  end if;
  if to_regprocedure('public.guard_cts_physical_session_4b()') is not null
     and obj_description(to_regprocedure('public.guard_cts_physical_session_4b()'), 'pg_proc')
       is distinct from 'NEXO CLUB 4B: protect linked physical session mutations' then
    raise exception '4B: guard de sesiones preexistente incompatible';
  end if;
  if to_regprocedure('public.guard_cts_physical_metric_4b()') is not null
     and obj_description(to_regprocedure('public.guard_cts_physical_metric_4b()'), 'pg_proc')
       is distinct from 'NEXO CLUB 4B: protect linked collective metric mutations' then
    raise exception '4B: guard de metricas preexistente incompatible';
  end if;
  if to_regprocedure('public.is_unlinked_physical_session_4b(uuid)') is not null
     and obj_description(to_regprocedure('public.is_unlinked_physical_session_4b(uuid)'), 'pg_proc')
       is distinct from 'NEXO CLUB 4B: RLS write boundary for unlinked legacy physical sessions' then
    raise exception '4B: helper RLS preexistente incompatible';
  end if;
  for required_column in
    select * from (values
      ('training_sessions','id','uuid'),
      ('training_sessions','session_date','date'),
      ('training_sessions','title','text'),
      ('training_sessions','session_type','text'),
      ('training_sessions','actual_duration_minutes','integer'),
      ('training_sessions','notes','text'),
      ('training_sessions','record_kind','text'),
      ('training_sessions','updated_at','timestamp with time zone'),
      ('training_session_load_metrics','session_id','uuid'),
      ('training_session_load_metrics','scope','text'),
      ('training_session_load_metrics','jugador_id','uuid'),
      ('training_session_load_metrics','aggregation_method','text'),
      ('training_session_load_metrics','distance_m','numeric'),
      ('training_session_load_metrics','hsr_m','numeric'),
      ('training_session_load_metrics','accelerations','integer'),
      ('training_session_load_metrics','decelerations','integer'),
      ('training_session_load_metrics','sprints','integer'),
      ('training_session_load_metrics','meters_per_minute','numeric'),
      ('training_session_load_metrics','load_units','numeric'),
      ('club_team_seasons','id','uuid'),
      ('club_team_seasons','season_id','uuid'),
      ('club_team_seasons','club_id','uuid'),
      ('club_seasons','id','uuid'),
      ('club_seasons','club_id','uuid'),
      ('club_seasons','starts_on','date'),
      ('club_seasons','ends_on','date'),
      ('club_seasons','status','text')
    ) as required(table_name, column_name, type_name)
  loop
    if not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.to_regclass('public.' || required_column.table_name)
        and a.attname = required_column.column_name and not a.attisdropped
        and pg_catalog.format_type(a.atttypid, null) = required_column.type_name) then
      raise exception '4B: columna incompatible %.%',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.training_sessions'::regclass
      and a.attname = 'record_kind' and a.attnotnull) then
    raise exception '4B: record_kind debe admitir NULL para no colisionar con el indice legacy';
  end if;
  if (select count(*) from pg_catalog.pg_class c
    where c.oid in ('public.training_sessions'::regclass,
                    'public.training_session_load_metrics'::regclass)
      and c.relrowsecurity) <> 2 then
    raise exception '4B: RLS debe estar activa en las dos tablas legacy';
  end if;
  if exists (select 1 from pg_catalog.pg_roles r
    where r.rolname = 'authenticated' and r.rolbypassrls)
     or exists (select 1 from pg_catalog.pg_class c
       where c.oid in ('public.training_sessions'::regclass,
                       'public.training_session_load_metrics'::regclass)
         and c.relowner = (select r.oid from pg_catalog.pg_roles r
           where r.rolname = 'authenticated') and not c.relforcerowsecurity) then
    raise exception '4B: authenticated podria eludir las politicas RLS restrictivas';
  end if;
  if exists (select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.microcycle_physical_session_links'::regclass
      and a.attname = 'session_date' and not a.attisdropped
      and pg_catalog.format_type(a.atttypid, null) <> 'date') then
    raise exception '4B: fecha del vinculo preexistente incompatible';
  end if;
  if pg_catalog.has_table_privilege('authenticated',
       'public.microcycle_physical_session_links',
       'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN')
     or pg_catalog.has_table_privilege('anon',
       'public.microcycle_physical_session_links',
       'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN')
     or pg_catalog.has_any_column_privilege('authenticated',
       'public.microcycle_physical_session_links', 'INSERT,UPDATE')
     or pg_catalog.has_any_column_privilege('anon',
       'public.microcycle_physical_session_links', 'INSERT,UPDATE') then
    raise exception '4B: vinculos 4A tienen escritura directa inesperada';
  end if;
  if exists (select 1 from pg_catalog.pg_trigger t
    where (t.tgrelid = 'public.training_sessions'::regclass
        and t.tgname = 'guard_cts_physical_session_4b'
        and t.tgfoid <> coalesce(to_regprocedure('public.guard_cts_physical_session_4b()')::oid, 0))
       or (t.tgrelid = 'public.training_session_load_metrics'::regclass
        and t.tgname = 'guard_cts_physical_metric_4b'
        and t.tgfoid <> coalesce(to_regprocedure('public.guard_cts_physical_metric_4b()')::oid, 0))) then
    raise exception '4B: nombre de trigger preexistente utilizado por otra funcion';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.microcycle_physical_session_links'::regclass
      and c.contype = 'p' and c.convalidated)
     or not exists (select 1 from pg_catalog.pg_index i
       where i.indexrelid = to_regclass('public.training_session_load_metrics_team_session_key')
         and i.indisunique and i.indisvalid) then
    raise exception '4B: unicidad de vinculo o metricas no acreditada';
  end if;
end $preflight$;

-- La FK compuesta mantiene la fecha del vinculo sincronizada incluso si cambia
-- la fecha de la sesion. UNIQUE(CTS, fecha) es la barrera final de concurrencia.
do $unique_session_date$
begin
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.training_sessions'::regclass
      and c.conname = 'training_sessions_id_date_4b_key') then
    alter table public.training_sessions
      add constraint training_sessions_id_date_4b_key unique (id, session_date);
  end if;
end $unique_session_date$;

alter table public.microcycle_physical_session_links
  add column if not exists session_date date;
update public.microcycle_physical_session_links l
  set session_date = s.session_date
from public.training_sessions s
where s.id = l.training_session_id and l.session_date is null;
do $link_date_check$
begin
  if exists (select 1 from public.microcycle_physical_session_links l
    left join public.training_sessions s on s.id = l.training_session_id
    where s.id is null or l.session_date is distinct from s.session_date) then
    raise exception '4B: fecha de vinculo preexistente incompatible con la sesion';
  end if;
end $link_date_check$;
alter table public.microcycle_physical_session_links
  alter column session_date set not null;
do $link_constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.microcycle_physical_session_links'::regclass
      and c.conname = 'microcycle_physical_session_links_cts_date_4b_key') then
    alter table public.microcycle_physical_session_links
      add constraint microcycle_physical_session_links_cts_date_4b_key
      unique (club_team_season_id, session_date);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.microcycle_physical_session_links'::regclass
      and c.conname = 'microcycle_physical_session_links_session_date_4b_fkey') then
    alter table public.microcycle_physical_session_links
      add constraint microcycle_physical_session_links_session_date_4b_fkey
      foreign key (training_session_id, session_date)
      references public.training_sessions(id, session_date)
      on update cascade on delete restrict;
  end if;
end $link_constraints$;

create or replace function public.guard_cts_physical_session_4b()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $guard$
declare v_cts uuid;
begin
  select l.club_team_season_id into v_cts
  from public.microcycle_physical_session_links l
  where l.training_session_id = old.id;
  if v_cts is null then
    if tg_op = 'UPDATE' then return new; end if;
    return old;
  end if;
  perform 1 from public.club_team_seasons cts
    join public.club_seasons season on season.id = cts.season_id
      and season.club_id = cts.club_id
    where cts.id = v_cts for update of season;
  if auth.uid() is null or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Sesion fisica vinculada: escritura no autorizada'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.record_kind is distinct from old.record_kind
       or not exists (select 1 from public.club_team_seasons cts
         join public.club_seasons season on season.id = cts.season_id
           and season.club_id = cts.club_id
         where cts.id = v_cts and season.status = 'open'
           and new.session_date between season.starts_on and season.ends_on) then
      raise exception 'Identidad o fecha de sesion fisica incompatible'
        using errcode = '23514';
    end if;
    if exists (select 1 from public.microcycle_physical_session_links l
      join public.training_sessions s on s.id = l.training_session_id
      where l.club_team_season_id = v_cts and s.id <> old.id
        and s.session_date = new.session_date) then
      raise exception 'Ya hay una carga fisica vinculada para este dia y CTS'
        using errcode = '23505';
    end if;
    return new;
  end if;
  return old;
end $guard$;
comment on function public.guard_cts_physical_session_4b() is
  'NEXO CLUB 4B: protect linked physical session mutations';
alter function public.guard_cts_physical_session_4b() owner to postgres;
revoke all on function public.guard_cts_physical_session_4b() from public, anon, authenticated, service_role;

create or replace function public.guard_cts_physical_metric_4b()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $guard$
declare
  v_cts uuid;
  v_session_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.session_id is distinct from old.session_id
       or new.scope is distinct from old.scope
       or new.jugador_id is distinct from old.jugador_id
       or new.aggregation_method is distinct from old.aggregation_method then
      if exists (select 1 from public.microcycle_physical_session_links l
        where l.training_session_id in (old.session_id, new.session_id)) then
        raise exception 'Identidad de metrica vinculada inmutable' using errcode = '23514';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then v_session_id := old.session_id;
  else v_session_id := new.session_id; end if;
  select l.club_team_season_id into v_cts
  from public.microcycle_physical_session_links l
  where l.training_session_id = v_session_id;
  if v_cts is not null then
    perform 1 from public.club_team_seasons cts
      join public.club_seasons season on season.id = cts.season_id
        and season.club_id = cts.club_id
      where cts.id = v_cts for update of season;
  end if;
  if v_cts is not null and (auth.uid() is null
      or public.can_write_club_team_season(v_cts) is not true) then
    raise exception 'Metrica fisica vinculada: escritura no autorizada'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $guard$;
comment on function public.guard_cts_physical_metric_4b() is
  'NEXO CLUB 4B: protect linked collective metric mutations';
alter function public.guard_cts_physical_metric_4b() owner to postgres;
revoke all on function public.guard_cts_physical_metric_4b() from public, anon, authenticated, service_role;

drop trigger if exists guard_cts_physical_session_4b on public.training_sessions;
create trigger guard_cts_physical_session_4b before update or delete
  on public.training_sessions for each row
  execute function public.guard_cts_physical_session_4b();
drop trigger if exists guard_cts_physical_metric_4b on public.training_session_load_metrics;
create trigger guard_cts_physical_metric_4b before insert or update or delete
  on public.training_session_load_metrics for each row
  execute function public.guard_cts_physical_metric_4b();

-- El guard de triggers conserva las reglas CTS para administracion y RPC.
-- Estas politicas RESTRICTIVE impiden que un cliente authenticated use el
-- guardado legacy o las escrituras directas sobre filas ya vinculadas.
create or replace function public.is_unlinked_physical_session_4b(target_session_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $unlinked$
  select target_session_id is not null and auth.uid() is not null
    and not exists (select 1 from public.microcycle_physical_session_links l
      where l.training_session_id = target_session_id)
$unlinked$;
comment on function public.is_unlinked_physical_session_4b(uuid) is
  'NEXO CLUB 4B: RLS write boundary for unlinked legacy physical sessions';
alter function public.is_unlinked_physical_session_4b(uuid) owner to postgres;
revoke all on function public.is_unlinked_physical_session_4b(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_unlinked_physical_session_4b(uuid) to authenticated;

drop policy if exists microcycle_4b_sessions_update on public.training_sessions;
create policy microcycle_4b_sessions_update on public.training_sessions
  as restrictive for update to authenticated
  using (public.is_unlinked_physical_session_4b(id))
  with check (public.is_unlinked_physical_session_4b(id));
drop policy if exists microcycle_4b_sessions_delete on public.training_sessions;
create policy microcycle_4b_sessions_delete on public.training_sessions
  as restrictive for delete to authenticated
  using (public.is_unlinked_physical_session_4b(id));
drop policy if exists microcycle_4b_metrics_insert on public.training_session_load_metrics;
create policy microcycle_4b_metrics_insert on public.training_session_load_metrics
  as restrictive for insert to authenticated
  with check (public.is_unlinked_physical_session_4b(session_id));
drop policy if exists microcycle_4b_metrics_update on public.training_session_load_metrics;
create policy microcycle_4b_metrics_update on public.training_session_load_metrics
  as restrictive for update to authenticated
  using (public.is_unlinked_physical_session_4b(session_id))
  with check (public.is_unlinked_physical_session_4b(session_id));
drop policy if exists microcycle_4b_metrics_delete on public.training_session_load_metrics;
create policy microcycle_4b_metrics_delete on public.training_session_load_metrics
  as restrictive for delete to authenticated
  using (public.is_unlinked_physical_session_4b(session_id));

create or replace function public.save_cts_daily_training_load_4b(
  p_club_team_season_id uuid, p_session_date date, p_session_type text,
  p_actual_duration_minutes integer, p_distance_m numeric, p_hsr_m numeric,
  p_accelerations integer, p_decelerations integer, p_sprints integer,
  p_meters_per_minute numeric, p_load_units numeric, p_notes text,
  p_existing_session_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
as $function$
declare
  v_starts date;
  v_ends date;
  v_status text;
  v_session public.training_sessions%rowtype;
  v_metric public.training_session_load_metrics%rowtype;
begin
  if auth.uid() is null or p_club_team_season_id is null
     or public.can_write_club_team_season(p_club_team_season_id) is not true then
    raise exception 'Escritura fisica no autorizada' using errcode = '42501';
  end if;
  select season.starts_on, season.ends_on, season.status
    into v_starts, v_ends, v_status
  from public.club_team_seasons cts
  join public.club_seasons season on season.id = cts.season_id
    and season.club_id = cts.club_id
  where cts.id = p_club_team_season_id
  for update of season;
  if v_status is distinct from 'open'
     or public.can_write_club_team_season(p_club_team_season_id) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode = '42501';
  end if;
  if p_session_date is null or v_starts is null or v_ends is null
     or p_session_date not between v_starts and v_ends
     or p_session_type is null
     or p_session_type not in ('training','match','recovery','activation','rest','other')
     or (p_session_type <> 'rest' and p_actual_duration_minutes is null)
     or (p_actual_duration_minutes is not null and p_actual_duration_minutes <= 0)
     or p_distance_m < 0 or p_hsr_m < 0 or p_accelerations < 0
     or p_decelerations < 0 or p_sprints < 0 or p_meters_per_minute < 0
     or p_load_units < 0 then
    raise exception 'Fecha, tipo o metricas fisicas invalidas' using errcode = '23514';
  end if;
  if exists (select 1 from public.microcycle_physical_session_links l
    join public.training_sessions s on s.id = l.training_session_id
    where l.club_team_season_id = p_club_team_season_id
      and s.session_date = p_session_date
      and (p_existing_session_id is null or s.id <> p_existing_session_id)) then
    raise exception 'Ya hay una carga fisica vinculada para este dia y CTS'
      using errcode = '23505';
  end if;
  if p_existing_session_id is null then
    insert into public.training_sessions
      (session_date,title,session_type,actual_duration_minutes,notes,record_kind,updated_at)
    values (p_session_date,
      case p_session_type when 'training' then 'Entrenamiento'
        when 'match' then 'Partido' when 'recovery' then 'Recuperacion'
        when 'activation' then 'Activacion' when 'rest' then 'Descanso' else 'Otro' end,
      p_session_type,p_actual_duration_minutes,nullif(btrim(p_notes),''),null,now())
    returning * into v_session;
    insert into public.microcycle_physical_session_links
      (training_session_id,club_team_season_id,session_date)
    values (v_session.id,p_club_team_season_id,v_session.session_date);
  else
    select s.* into v_session from public.training_sessions s
    join public.microcycle_physical_session_links l
      on l.training_session_id = s.id and l.club_team_season_id = p_club_team_season_id
    where s.id = p_existing_session_id for update of s;
    if v_session.id is null then
      raise exception 'Sesion fisica no vinculada al CTS seleccionado' using errcode = '42501';
    end if;
    update public.training_sessions s set session_date = p_session_date,
      title = case p_session_type when 'training' then 'Entrenamiento'
        when 'match' then 'Partido' when 'recovery' then 'Recuperacion'
        when 'activation' then 'Activacion' when 'rest' then 'Descanso' else 'Otro' end,
      session_type = p_session_type, actual_duration_minutes = p_actual_duration_minutes,
      notes = nullif(btrim(p_notes),'')
    where s.id = p_existing_session_id returning * into v_session;
  end if;
  insert into public.training_session_load_metrics
    (session_id,scope,jugador_id,aggregation_method,distance_m,hsr_m,
     accelerations,decelerations,sprints,meters_per_minute,load_units)
  values (v_session.id,'team',null,'team_average',p_distance_m,p_hsr_m,
    p_accelerations,p_decelerations,p_sprints,p_meters_per_minute,p_load_units)
  on conflict (session_id) where scope = 'team' do update set
    distance_m = excluded.distance_m, hsr_m = excluded.hsr_m,
    accelerations = excluded.accelerations, decelerations = excluded.decelerations,
    sprints = excluded.sprints, meters_per_minute = excluded.meters_per_minute,
    load_units = excluded.load_units
  returning * into v_metric;
  return pg_catalog.jsonb_build_object('session',pg_catalog.to_jsonb(v_session),
    'metrics',pg_catalog.to_jsonb(v_metric));
end $function$;
comment on function public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid) is
  'NEXO CLUB 4B: atomic authorized CTS physical load save';
alter function public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid) owner to postgres;
revoke all on function public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)
  to authenticated;

do $postflight$
begin
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.training_sessions'::regclass
      and c.conname = 'training_sessions_id_date_4b_key'
      and c.contype = 'u' and c.convalidated
      and pg_catalog.cardinality(c.conkey) = 2
      and c.conkey[1] = (select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'id')
      and c.conkey[2] = (select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'session_date'))
     or not exists (select 1 from pg_catalog.pg_constraint c
       where c.conrelid = 'public.microcycle_physical_session_links'::regclass
         and c.conname = 'microcycle_physical_session_links_cts_date_4b_key'
         and c.contype = 'u' and c.convalidated
         and pg_catalog.cardinality(c.conkey) = 2
         and c.conkey[1] = (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid = c.conrelid and a.attname = 'club_team_season_id')
         and c.conkey[2] = (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid = c.conrelid and a.attname = 'session_date'))
     or not exists (select 1 from pg_catalog.pg_constraint c
       where c.conrelid = 'public.microcycle_physical_session_links'::regclass
         and c.conname = 'microcycle_physical_session_links_session_date_4b_fkey'
         and c.contype = 'f' and c.convalidated
         and c.confrelid = 'public.training_sessions'::regclass
         and c.confupdtype = 'c' and c.confdeltype = 'r'
         and pg_catalog.cardinality(c.conkey) = 2
         and pg_catalog.cardinality(c.confkey) = 2
         and c.conkey[1] = (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid = c.conrelid and a.attname = 'training_session_id')
         and c.conkey[2] = (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid = c.conrelid and a.attname = 'session_date')
         and c.confkey[1] = (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid = c.confrelid and a.attname = 'id')
         and c.confkey[2] = (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid = c.confrelid and a.attname = 'session_date'))
     or not exists (select 1 from pg_catalog.pg_attribute a
       where a.attrelid = 'public.microcycle_physical_session_links'::regclass
         and a.attname = 'session_date' and a.attnotnull
         and pg_catalog.format_type(a.atttypid, null) = 'date') then
    raise exception '4B: unicidad o sincronizacion de fecha CTS incompleta';
  end if;
  if (select count(*) from pg_catalog.pg_policy p
      where ((p.polrelid = 'public.training_sessions'::regclass
          and p.polname in ('microcycle_4b_sessions_update','microcycle_4b_sessions_delete'))
        or (p.polrelid = 'public.training_session_load_metrics'::regclass
          and p.polname in ('microcycle_4b_metrics_insert','microcycle_4b_metrics_update','microcycle_4b_metrics_delete')))
        and not p.polpermissive) <> 5 then
    raise exception '4B: politicas restrictivas de escritura incompletas';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p
      where p.oid = 'public.is_unlinked_physical_session_4b(uuid)'::regprocedure
        and p.prosecdef and p.provolatile = 's'
        and p.proconfig = array['search_path=pg_catalog']::text[]
        and p.proowner = (select oid from pg_catalog.pg_roles where rolname='postgres'))
     or not pg_catalog.has_function_privilege('authenticated',
       'public.is_unlinked_physical_session_4b(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.is_unlinked_physical_session_4b(uuid)', 'EXECUTE') then
    raise exception '4B: helper RLS incompleto';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = 'public.training_sessions'::regclass
        and t.tgname = 'guard_cts_physical_session_4b' and not t.tgisinternal
        and t.tgtype = 27 and t.tgenabled = 'O'
        and t.tgfoid = 'public.guard_cts_physical_session_4b()'::regprocedure)
     or not exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = 'public.training_session_load_metrics'::regclass
        and t.tgname = 'guard_cts_physical_metric_4b' and not t.tgisinternal
        and t.tgtype = 31 and t.tgenabled = 'O'
        and t.tgfoid = 'public.guard_cts_physical_metric_4b()'::regprocedure)
     or not exists (select 1 from pg_catalog.pg_proc p
      where p.oid = 'public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)'::regprocedure
        and p.prosecdef and p.proconfig = array['search_path=pg_catalog']::text[]
        and p.proowner = (select oid from pg_catalog.pg_roles where rolname='postgres'))
     or (select count(*) from pg_catalog.pg_proc p
       where p.oid in ('public.guard_cts_physical_session_4b()'::regprocedure,
                       'public.guard_cts_physical_metric_4b()'::regprocedure)
         and p.prosecdef and p.proconfig = array['search_path=pg_catalog']::text[]
         and p.proowner = (select oid from pg_catalog.pg_roles where rolname='postgres')) <> 2
     or not pg_catalog.has_function_privilege('authenticated',
      'public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
      'public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)', 'EXECUTE')
     or exists (select 1 from pg_catalog.pg_proc p,
        pg_catalog.aclexplode(p.proacl) acl
       where p.oid = 'public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)'::regprocedure
         and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
     or pg_catalog.has_table_privilege('authenticated',
       'public.microcycle_physical_session_links',
       'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN')
     or pg_catalog.has_any_column_privilege('authenticated',
       'public.microcycle_physical_session_links', 'INSERT,UPDATE') then
    raise exception '4B: guard o privilegios incompletos';
  end if;
end $postflight$;
commit;
