-- PROPUESTA LOCAL. NO EJECUTAR hasta verificar el preflight y autorizar la instalación.
-- Un microciclo = un CTS canónico + el lunes de la semana. No toca sesiones ni partidos.
begin;

do $pre$
declare v_table oid := to_regclass('public.planned_microcycles');
  v_function oid := to_regprocedure('public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)');
  v_guard oid := to_regprocedure('public.guard_planned_microcycle_2b()');
begin
  if to_regclass('public.club_team_seasons') is null or
     to_regclass('public.club_teams') is null or
     to_regclass('public.club_seasons') is null or
     to_regclass('public.club_memberships') is null or
     to_regprocedure('public.can_read_club_team_season(uuid)') is null or
     to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Microciclos 2B: faltan dependencias canónicas';
  end if;
  if v_table is not null and obj_description(v_table,'pg_class') is distinct from
     'NEXO CLUB Microciclos 2B: planificación por CTS y lunes' then
    raise exception 'Microciclos 2B: planned_microcycles preexistente incompatible';
  end if;
  if v_function is not null and obj_description(v_function,'pg_proc') is distinct from
     'NEXO CLUB Microciclos 2B: escritura CAS de planificación semanal' then
    raise exception 'Microciclos 2B: RPC preexistente incompatible';
  end if;
  if v_guard is not null and obj_description(v_guard,'pg_proc') is distinct from
     'NEXO CLUB Microciclos 2B: guard de integridad, identidad y temporada' then
    raise exception 'Microciclos 2B: guard preexistente incompatible';
  end if;
  if v_table is not null and exists(select 1 from pg_policy
      where polrelid=v_table and polname<>'planned_microcycles_read') then
    raise exception 'Microciclos 2B: políticas RLS preexistentes no acreditadas';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('save_planned_microcycle_2b','guard_planned_microcycle_2b')
        and p.oid not in (coalesce(v_function,'0'::oid),coalesce(v_guard,'0'::oid))) then
    raise exception 'Microciclos 2B: sobrecarga de función no acreditada';
  end if;
end $pre$;

create table if not exists public.planned_microcycles (
  id uuid primary key default gen_random_uuid(),
  club_team_season_id uuid not null references public.club_team_seasons(id) on delete restrict,
  week_starts_on date not null,
  weekly jsonb not null,
  days jsonb not null,
  revision integer not null default 1,
  created_by_membership_id uuid not null references public.club_memberships(id) on delete restrict,
  updated_by_membership_id uuid not null references public.club_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_microcycles_week_key unique (club_team_season_id,week_starts_on),
  constraint planned_microcycles_monday_check check (extract(isodow from week_starts_on)=1),
  constraint planned_microcycles_revision_check check (revision>0),
  constraint planned_microcycles_payload_size_check check (
    octet_length(weekly::text)<=32000 and octet_length(days::text)<=80000)
);
comment on table public.planned_microcycles is
  'NEXO CLUB Microciclos 2B: planificación por CTS y lunes';
create index if not exists planned_microcycles_week_idx
  on public.planned_microcycles(week_starts_on,club_team_season_id);
alter table public.planned_microcycles owner to postgres;
alter table public.planned_microcycles enable row level security;
revoke all on table public.planned_microcycles from public,anon,authenticated,service_role;
grant select on table public.planned_microcycles to authenticated,service_role;

do $policy$
begin
  if not exists(select 1 from pg_policy where
    polrelid=to_regclass('public.planned_microcycles') and polname='planned_microcycles_read') then
    create policy planned_microcycles_read on public.planned_microcycles
      for select to authenticated
      using (public.can_read_club_team_season(club_team_season_id));
  end if;
end $policy$;
alter policy planned_microcycles_read on public.planned_microcycles
  to authenticated using (public.can_read_club_team_season(club_team_season_id));

create or replace function public.guard_planned_microcycle_2b()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_club uuid; v_start date; v_end date; v_status text; v_actor uuid;
  v_key text; v_day jsonb; v_item jsonb; v_priority text; v_seen text[];
  v_index integer;
begin
  if tg_op='DELETE' then
    raise exception 'Microciclo histórico: eliminación no habilitada' using errcode='42501';
  end if;
  if auth.uid() is null or public.can_write_club_team_season(new.club_team_season_id) is not true then
    raise exception 'Planificación no autorizada' using errcode='42501';
  end if;
  select cts.club_id,se.starts_on,se.ends_on,se.status
    into v_club,v_start,v_end,v_status
  from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=new.club_team_season_id for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(new.club_team_season_id) is not true or
     new.week_starts_on>v_end or new.week_starts_on+6<v_start then
    raise exception 'Equipo-temporada cerrado, revocado o fuera de fecha' using errcode='42501';
  end if;
  select m.id into v_actor from public.club_memberships m
  where m.club_id=v_club and m.user_id=auth.uid() and m.is_active
    and m.role in ('owner','admin','staff') order by m.id limit 1;
  if v_actor is null or new.updated_by_membership_id<>v_actor then
    raise exception 'Autoría de planificación no autorizada' using errcode='42501';
  end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.club_team_season_id<>old.club_team_season_id or
       new.week_starts_on<>old.week_starts_on or
       new.created_by_membership_id<>old.created_by_membership_id or
       new.created_at<>old.created_at or new.revision<>old.revision+1 then
      raise exception 'Identidad o revisión de microciclo inmutable' using errcode='42501';
    end if;
  elsif new.created_by_membership_id<>v_actor or new.revision<>1 then
    raise exception 'Microciclo inicial inválido' using errcode='42501';
  end if;
  if pg_catalog.jsonb_typeof(new.weekly)<>'object' or
     pg_catalog.jsonb_typeof(new.days)<>'object' then
    raise exception 'Planificación JSON inválida' using errcode='22023';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(new.weekly))<>4 or
     not (new.weekly ?& array['objective','priorities','responsible','observations']) or
     pg_catalog.jsonb_typeof(new.weekly->'objective')<>'string' or
     pg_catalog.jsonb_typeof(new.weekly->'priorities')<>'array' or
     pg_catalog.jsonb_typeof(new.weekly->'responsible')<>'string' or
     pg_catalog.jsonb_typeof(new.weekly->'observations')<>'string' or
     char_length(new.weekly->>'objective')>10000 or
     char_length(new.weekly->>'responsible')>160 or
     char_length(new.weekly->>'observations')>10000 then
    raise exception 'Cabecera semanal inválida' using errcode='22023';
  end if;
  v_seen:=array[]::text[];
  for v_item in select value from pg_catalog.jsonb_array_elements(new.weekly->'priorities') loop
    if pg_catalog.jsonb_typeof(v_item)<>'string' then
      raise exception 'Prioridad semanal inválida' using errcode='22023';
    end if;
    v_priority:=v_item #>> '{}';
    if v_priority not in ('Táctica','Técnica','Física','Estratégica / ABP','Recuperación','Otros') or
       v_priority=any(v_seen) then
      raise exception 'Prioridad semanal duplicada o desconocida' using errcode='22023';
    end if;
    v_seen:=array_append(v_seen,v_priority);
  end loop;
  if cardinality(v_seen)>6 or (select count(*) from pg_catalog.jsonb_object_keys(new.days))<>7 then
    raise exception 'La planificación debe contener exactamente siete días' using errcode='22023';
  end if;
  for v_index in 0..6 loop
    v_key:=(new.week_starts_on+v_index)::text;
    v_day:=new.days->v_key;
    if pg_catalog.jsonb_typeof(v_day) is distinct from 'object' then
      raise exception 'Día de planificación ausente o inválido' using errcode='22023';
    end if;
    if (select count(*) from pg_catalog.jsonb_object_keys(v_day))<>6 or
       not (v_day ?& array['type','objective','focus','intensity','durationMinutes','observations']) or
       pg_catalog.jsonb_typeof(v_day->'type')<>'string' or
       pg_catalog.jsonb_typeof(v_day->'objective')<>'string' or
       pg_catalog.jsonb_typeof(v_day->'focus')<>'string' or
       pg_catalog.jsonb_typeof(v_day->'intensity')<>'string' or
       pg_catalog.jsonb_typeof(v_day->'observations')<>'string' or
       pg_catalog.jsonb_typeof(v_day->'durationMinutes') not in ('number','null') or
       (v_day->>'type') not in ('','Entrenamiento','Descanso','Recuperación','Partido','Otro') or
       (v_day->>'focus') not in ('','Táctico','Técnico','Físico','Estratégico / ABP','Recuperación','Mixto') or
       (v_day->>'intensity') not in ('','Muy baja','Baja','Media','Alta','Muy alta') or
       char_length(v_day->>'objective')>1000 or
       char_length(v_day->>'observations')>5000 then
      raise exception 'Datos diarios inválidos' using errcode='22023';
    end if;
    if v_day->'durationMinutes'<>'null'::jsonb and
       (v_day->>'durationMinutes') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'Duración diaria inválida' using errcode='22023';
    end if;
    if (new.week_starts_on+v_index<v_start or new.week_starts_on+v_index>v_end) and
       ((v_day->>'type')<>'' or (v_day->>'objective')<>'' or
        (v_day->>'focus')<>'' or (v_day->>'intensity')<>'' or
        (v_day->>'observations')<>'' or v_day->'durationMinutes'<>'null'::jsonb) then
      raise exception 'No se puede planificar fuera de la temporada' using errcode='23514';
    end if;
  end loop;
  if tg_op='INSERT' then new.created_at:=now(); end if;
  new.updated_at:=now();
  return new;
end $fn$;
alter function public.guard_planned_microcycle_2b() owner to postgres;
revoke all on function public.guard_planned_microcycle_2b() from public,anon,authenticated,service_role;
comment on function public.guard_planned_microcycle_2b() is
  'NEXO CLUB Microciclos 2B: guard de integridad, identidad y temporada';

drop trigger if exists planned_microcycles_guard on public.planned_microcycles;
create trigger planned_microcycles_guard before insert or update or delete
  on public.planned_microcycles for each row execute function public.guard_planned_microcycle_2b();

create or replace function public.save_planned_microcycle_2b(
  p_club_team_season_id uuid,p_week_starts_on date,p_expected_revision integer,
  p_weekly jsonb,p_days jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_club uuid; v_status text; v_start date; v_end date; v_actor uuid;
  v_id uuid; v_revision integer;
begin
  if auth.uid() is null or p_club_team_season_id is null or p_week_starts_on is null or
     p_expected_revision is null or p_expected_revision<0 or
     public.can_write_club_team_season(p_club_team_season_id) is not true then
    raise exception 'Planificación no autorizada' using errcode='42501';
  end if;
  select cts.club_id,se.status,se.starts_on,se.ends_on into v_club,v_status,v_start,v_end
  from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=p_club_team_season_id for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(p_club_team_season_id) is not true or
     p_week_starts_on>v_end or p_week_starts_on+6<v_start then
    raise exception 'Equipo-temporada cerrado o no autorizado' using errcode='42501';
  end if;
  select m.id into v_actor from public.club_memberships m
  where m.club_id=v_club and m.user_id=auth.uid() and m.is_active
    and m.role in ('owner','admin','staff') order by m.id limit 1;
  if v_actor is null then
    raise exception 'Membresía no autorizada' using errcode='42501';
  end if;
  select pm.id,pm.revision into v_id,v_revision
  from public.planned_microcycles pm
  where pm.club_team_season_id=p_club_team_season_id and
    pm.week_starts_on=p_week_starts_on for update;
  if not found then
    if p_expected_revision<>0 then
      raise exception 'Revisión semanal obsoleta' using errcode='40001';
    end if;
    insert into public.planned_microcycles
      (club_team_season_id,week_starts_on,weekly,days,created_by_membership_id,updated_by_membership_id)
    values (p_club_team_season_id,p_week_starts_on,p_weekly,p_days,v_actor,v_actor)
    returning id,revision into v_id,v_revision;
  else
    if p_expected_revision<>v_revision then
      raise exception 'Revisión semanal obsoleta' using errcode='40001';
    end if;
    update public.planned_microcycles set weekly=p_weekly,days=p_days,
      revision=revision+1,updated_by_membership_id=v_actor
    where id=v_id returning revision into v_revision;
  end if;
  return pg_catalog.jsonb_build_object('id',v_id,'revision',v_revision);
end $fn$;
alter function public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb) owner to postgres;
revoke all on function public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)
  to authenticated;
comment on function public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb) is
  'NEXO CLUB Microciclos 2B: escritura CAS de planificación semanal';

do $post$
begin
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.planned_microcycles')
      and contype='u' and conname='planned_microcycles_week_key' and convalidated) or
     (select count(*) from pg_constraint where conrelid=to_regclass('public.planned_microcycles')
       and contype='c' and convalidated and conname in
         ('planned_microcycles_monday_check','planned_microcycles_revision_check',
          'planned_microcycles_payload_size_check'))<>3 or
     not exists(select 1 from pg_class i join pg_index x on x.indexrelid=i.oid
       where i.relnamespace='public'::regnamespace and i.relname='planned_microcycles_week_idx'
         and x.indrelid=to_regclass('public.planned_microcycles') and x.indisvalid
         and x.indnkeyatts=2 and not x.indisunique
         and x.indkey[0]=(select attnum from pg_attribute where
           attrelid=x.indrelid and attname='week_starts_on' and not attisdropped)
         and x.indkey[1]=(select attnum from pg_attribute where
           attrelid=x.indrelid and attname='club_team_season_id' and not attisdropped)) or
     (select count(*) from pg_policy where polrelid=to_regclass('public.planned_microcycles'))<>1 or
     not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.planned_microcycles')
      and tgname='planned_microcycles_guard' and not tgisinternal and tgenabled='O') or
     not (select relrowsecurity from pg_class where oid=to_regclass('public.planned_microcycles')) or
     has_table_privilege('anon','public.planned_microcycles','SELECT') or
     has_table_privilege('anon','public.planned_microcycles','INSERT') or
     has_table_privilege('anon','public.planned_microcycles','UPDATE') or
     has_table_privilege('anon','public.planned_microcycles','DELETE') or
     has_table_privilege('authenticated','public.planned_microcycles','INSERT') or
     has_table_privilege('authenticated','public.planned_microcycles','UPDATE') or
     has_table_privilege('authenticated','public.planned_microcycles','DELETE') or
     has_function_privilege('anon','public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)','EXECUTE') or
     not has_function_privilege('authenticated','public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)','EXECUTE') then
    raise exception 'Microciclos 2B: postcondición esencial incumplida';
  end if;
end $post$;
commit;
