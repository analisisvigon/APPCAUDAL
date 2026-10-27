-- PENDIENTE DE REVISIÓN — NO EJECUTAR DESDE CODEX.
-- Biblioteca de plantillas de planificación, independiente de fechas y temporadas.
begin;

do $pre$
declare v_table oid := to_regclass('public.planned_microcycle_templates')::oid;
  v_function oid;
begin
  if to_regclass('public.planned_microcycles') is null or
     to_regclass('public.club_teams') is null or
     to_regclass('public.club_memberships') is null or
     to_regclass('public.club_team_seasons') is null or
     to_regclass('public.club_seasons') is null or
     to_regprocedure('public.can_read_club_team_season(uuid)') is null or
     to_regprocedure('public.can_write_club_team_season(uuid)') is null or
     to_regprocedure('public.has_club_role(uuid,text[])') is null then
    raise exception 'Microciclos 2C: faltan dependencias canónicas o de autorización';
  end if;
  if v_table is not null and obj_description(v_table,'pg_class') is distinct from
     'NEXO CLUB Microciclos 2C: plantillas inmutables por equipo' then
    raise exception 'Microciclos 2C: tabla preexistente incompatible; revisar antes de instalar';
  end if;
  for v_function in select candidate.function_oid from (values
    (to_regprocedure('public.can_read_microcycle_template_team_2c(uuid,uuid)')::oid),
    (to_regprocedure('public.can_write_microcycle_template_team_2c(uuid,uuid)')::oid),
    (to_regprocedure('public.create_planned_microcycle_template_2c(uuid,text,text)')::oid),
    (to_regprocedure('public.manage_planned_microcycle_template_2c(uuid,integer,text,text,boolean)')::oid)
  ) candidate(function_oid) loop
    if v_function is not null and obj_description(v_function,'pg_proc') is distinct from
       'NEXO CLUB Microciclos 2C: función de plantillas' then
      raise exception 'Microciclos 2C: función preexistente incompatible';
    end if;
  end loop;
end $pre$;

create table if not exists public.planned_microcycle_templates (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  team_id uuid not null,
  creator_membership_id uuid not null,
  name text not null,
  description text not null default '',
  weekly jsonb not null,
  days jsonb not null,
  revision integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_microcycle_templates_team_club_fk
    foreign key (team_id,club_id) references public.club_teams(id,club_id)
    on update no action on delete restrict,
  constraint planned_microcycle_templates_creator_club_fk
    foreign key (creator_membership_id,club_id) references public.club_memberships(id,club_id)
    on update no action on delete restrict,
  constraint planned_microcycle_templates_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint planned_microcycle_templates_description_check
    check (char_length(description) <= 1000),
  constraint planned_microcycle_templates_revision_check check (revision > 0),
  constraint planned_microcycle_templates_payload_check check (
    jsonb_typeof(weekly) = 'object' and jsonb_typeof(days) = 'array' and
    jsonb_array_length(days) = 7 and octet_length(weekly::text) <= 32000 and
    octet_length(days::text) <= 80000)
);
comment on table public.planned_microcycle_templates is
  'NEXO CLUB Microciclos 2C: plantillas inmutables por equipo';
create index if not exists planned_microcycle_templates_team_idx
  on public.planned_microcycle_templates(club_id,team_id,archived_at,created_at desc);
create index if not exists planned_microcycle_templates_creator_idx
  on public.planned_microcycle_templates(creator_membership_id,created_at desc);
alter table public.planned_microcycle_templates owner to postgres;
alter table public.planned_microcycle_templates enable row level security;
revoke all on table public.planned_microcycle_templates from public,anon,authenticated,service_role;
grant select on table public.planned_microcycle_templates to authenticated,service_role;

create or replace function public.can_read_microcycle_template_team_2c(
  target_team_id uuid,target_club_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $fn$
  select coalesce(auth.uid() is not null and target_team_id is not null and
    target_club_id is not null and exists (
      select 1 from public.club_teams team
      where team.id=target_team_id and team.club_id=target_club_id
    ) and (
      public.has_club_role(target_club_id,array['owner','admin']::text[]) or
      exists (
        select 1 from public.club_team_seasons cts
        join public.club_seasons season on season.id=cts.season_id
          and season.club_id=cts.club_id
        where cts.club_id=target_club_id and cts.team_id=target_team_id
          and season.is_active and public.can_read_club_team_season(cts.id)
      )
    ),false);
$fn$;
alter function public.can_read_microcycle_template_team_2c(uuid,uuid) owner to postgres;
revoke all on function public.can_read_microcycle_template_team_2c(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.can_read_microcycle_template_team_2c(uuid,uuid)
  to authenticated,service_role;
comment on function public.can_read_microcycle_template_team_2c(uuid,uuid) is
  'NEXO CLUB Microciclos 2C: función de plantillas';

create or replace function public.can_write_microcycle_template_team_2c(
  target_team_id uuid,target_club_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $fn$
  select coalesce(auth.uid() is not null and target_team_id is not null and
    target_club_id is not null and exists (
      select 1 from public.club_team_seasons cts
      join public.club_seasons season on season.id=cts.season_id
        and season.club_id=cts.club_id
      where cts.club_id=target_club_id and cts.team_id=target_team_id
        and season.is_active and season.status='open'
        and public.can_write_club_team_season(cts.id)
    ),false);
$fn$;
alter function public.can_write_microcycle_template_team_2c(uuid,uuid) owner to postgres;
revoke all on function public.can_write_microcycle_template_team_2c(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.can_write_microcycle_template_team_2c(uuid,uuid)
  to authenticated,service_role;
comment on function public.can_write_microcycle_template_team_2c(uuid,uuid) is
  'NEXO CLUB Microciclos 2C: función de plantillas';

do $policy$
begin
  if not exists(select 1 from pg_policy where polrelid=to_regclass('public.planned_microcycle_templates')
      and polname='planned_microcycle_templates_read') then
    create policy planned_microcycle_templates_read on public.planned_microcycle_templates
      for select to authenticated using (
        public.can_read_microcycle_template_team_2c(team_id,club_id) and
        (archived_at is null or public.has_club_role(club_id,array['owner','admin']::text[]) or
          exists(select 1 from public.club_memberships actor
            where actor.id=creator_membership_id
              and actor.club_id=planned_microcycle_templates.club_id
              and actor.user_id=auth.uid() and actor.is_active)));
  end if;
end $policy$;
alter policy planned_microcycle_templates_read on public.planned_microcycle_templates
  to authenticated using (
    public.can_read_microcycle_template_team_2c(team_id,club_id) and
    (archived_at is null or public.has_club_role(club_id,array['owner','admin']::text[]) or
      exists(select 1 from public.club_memberships actor
        where actor.id=creator_membership_id
          and actor.club_id=planned_microcycle_templates.club_id
          and actor.user_id=auth.uid() and actor.is_active)));

create or replace function public.create_planned_microcycle_template_2c(
  p_source_microcycle_id uuid,p_name text,p_description text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_source public.planned_microcycles%rowtype; v_cts public.club_team_seasons%rowtype;
  v_actor uuid; v_days jsonb; v_id uuid;
begin
  if auth.uid() is null or p_source_microcycle_id is null or p_name is null or
     char_length(btrim(p_name)) not between 1 and 120 or p_description is null or
     char_length(p_description)>1000 then
    raise exception 'Plantilla inválida' using errcode='22023';
  end if;
  select * into v_source from public.planned_microcycles
  where id=p_source_microcycle_id;
  if not found or public.can_read_club_team_season(v_source.club_team_season_id) is not true then
    raise exception 'Planificación de origen no autorizada' using errcode='42501';
  end if;
  select * into v_cts from public.club_team_seasons where id=v_source.club_team_season_id;
  if not found or public.can_write_microcycle_template_team_2c(v_cts.team_id,v_cts.club_id) is not true then
    raise exception 'Equipo de plantilla no autorizado' using errcode='42501';
  end if;
  select id into v_actor from public.club_memberships
  where club_id=v_cts.club_id and user_id=auth.uid() and is_active
    and role in ('owner','admin','staff') order by id limit 1;
  if v_actor is null then
    raise exception 'Membresía no autorizada' using errcode='42501';
  end if;
  select jsonb_agg(jsonb_build_object(
      'type',day.data->>'type', 'objective',day.data->>'objective',
      'focus',day.data->>'focus', 'intensity',day.data->>'intensity',
      'durationMinutes',day.data->'durationMinutes', 'observations','') order by n.day_index)
    into v_days
  from generate_series(0,6) n(day_index)
  cross join lateral (select v_source.days -> ((v_source.week_starts_on+n.day_index)::text) as data) day;
  insert into public.planned_microcycle_templates
    (club_id,team_id,creator_membership_id,name,description,weekly,days)
  values (v_cts.club_id,v_cts.team_id,v_actor,btrim(p_name),p_description,
    jsonb_build_object('objective',v_source.weekly->>'objective',
      'priorities',v_source.weekly->'priorities','responsible','','observations',''),v_days)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'revision',1);
end $fn$;
alter function public.create_planned_microcycle_template_2c(uuid,text,text) owner to postgres;
revoke all on function public.create_planned_microcycle_template_2c(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_planned_microcycle_template_2c(uuid,text,text)
  to authenticated;
comment on function public.create_planned_microcycle_template_2c(uuid,text,text) is
  'NEXO CLUB Microciclos 2C: función de plantillas';

create or replace function public.manage_planned_microcycle_template_2c(
  p_template_id uuid,p_expected_revision integer,p_name text,p_description text,p_archive boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_template public.planned_microcycle_templates%rowtype; v_revision integer;
begin
  if auth.uid() is null or p_template_id is null or p_expected_revision is null or
     p_expected_revision<1 or p_name is null or
     char_length(btrim(p_name)) not between 1 and 120 or p_description is null or
     char_length(p_description)>1000 or p_archive is null then
    raise exception 'Cambio de plantilla inválido' using errcode='22023';
  end if;
  select * into v_template from public.planned_microcycle_templates
  where id=p_template_id for update;
  if not found or public.can_write_microcycle_template_team_2c(
      v_template.team_id,v_template.club_id) is not true or not (
        public.has_club_role(v_template.club_id,array['owner','admin']::text[]) or
        exists(select 1 from public.club_memberships actor
          where actor.id=v_template.creator_membership_id
            and actor.club_id=v_template.club_id and actor.user_id=auth.uid()
            and actor.is_active and actor.role='staff')) then
    raise exception 'Gestión de plantilla no autorizada' using errcode='42501';
  end if;
  if v_template.revision<>p_expected_revision then
    raise exception 'Revisión de plantilla obsoleta' using errcode='40001';
  end if;
  update public.planned_microcycle_templates
  set name=btrim(p_name),description=p_description,
    archived_at=case when p_archive then coalesce(archived_at,now()) else null end,
    revision=revision+1,updated_at=now()
  where id=p_template_id returning revision into v_revision;
  return jsonb_build_object('id',p_template_id,'revision',v_revision);
end $fn$;
alter function public.manage_planned_microcycle_template_2c(uuid,integer,text,text,boolean) owner to postgres;
revoke all on function public.manage_planned_microcycle_template_2c(uuid,integer,text,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.manage_planned_microcycle_template_2c(uuid,integer,text,text,boolean)
  to authenticated;
comment on function public.manage_planned_microcycle_template_2c(uuid,integer,text,text,boolean) is
  'NEXO CLUB Microciclos 2C: función de plantillas';

do $post$
begin
  if (select count(*) from pg_attribute
      where attrelid=to_regclass('public.planned_microcycle_templates') and attnum>0
        and not attisdropped and attname=any(array['id','club_id','team_id',
          'creator_membership_id','name','description','weekly','days','revision',
          'archived_at','created_at','updated_at']))<>12 or
     (select count(*) from pg_constraint
      where conrelid=to_regclass('public.planned_microcycle_templates')
        and contype='f' and convalidated and confdeltype='r' and conname=any(array[
          'planned_microcycle_templates_team_club_fk',
          'planned_microcycle_templates_creator_club_fk']))<>2 or
     (select count(*) from pg_index i join pg_class index_row on index_row.oid=i.indexrelid
      where i.indrelid=to_regclass('public.planned_microcycle_templates') and i.indisvalid
        and index_row.relname=any(array['planned_microcycle_templates_team_idx',
          'planned_microcycle_templates_creator_idx']))<>2 or
     (select count(*) from pg_policy where polrelid=to_regclass('public.planned_microcycle_templates'))<>1 or
     not exists(select 1 from pg_policy where polrelid=to_regclass('public.planned_microcycle_templates')
       and polname='planned_microcycle_templates_read' and polcmd='r') or
     not (select relrowsecurity from pg_class where oid=to_regclass('public.planned_microcycle_templates')) or
     has_table_privilege('anon','public.planned_microcycle_templates','SELECT') or
     has_table_privilege('anon','public.planned_microcycle_templates','INSERT') or
     has_table_privilege('anon','public.planned_microcycle_templates','UPDATE') or
     has_table_privilege('anon','public.planned_microcycle_templates','DELETE') or
     has_table_privilege('authenticated','public.planned_microcycle_templates','INSERT') or
     has_table_privilege('authenticated','public.planned_microcycle_templates','UPDATE') or
     has_table_privilege('authenticated','public.planned_microcycle_templates','DELETE') or
     not has_table_privilege('authenticated','public.planned_microcycle_templates','SELECT') or
     has_function_privilege('anon','public.create_planned_microcycle_template_2c(uuid,text,text)','EXECUTE') or
     has_function_privilege('anon','public.manage_planned_microcycle_template_2c(uuid,integer,text,text,boolean)','EXECUTE') or
     has_function_privilege('anon','public.can_read_microcycle_template_team_2c(uuid,uuid)','EXECUTE') or
     has_function_privilege('anon','public.can_write_microcycle_template_team_2c(uuid,uuid)','EXECUTE') or
     not has_function_privilege('authenticated','public.create_planned_microcycle_template_2c(uuid,text,text)','EXECUTE') or
     not has_function_privilege('authenticated','public.manage_planned_microcycle_template_2c(uuid,integer,text,text,boolean)','EXECUTE') then
    raise exception 'Microciclos 2C: postflight de privilegios y RLS no superado';
  end if;
end $post$;

commit;
