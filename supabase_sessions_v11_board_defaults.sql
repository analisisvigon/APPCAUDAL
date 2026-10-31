begin;

-- Sesiones V1.1: preferencias por CTS y copia al crear cada sesion.
-- No cambia ni reemplaza la RPC 05 ni sus zonas porcentuales.
do $pre$
begin
  if to_regclass('public.club_team_seasons') is null or
     to_regclass('public.planned_training_sessions') is null or
     to_regclass('public.planned_session_distributions') is null or
     to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is null or
     to_regprocedure('public.can_read_club_team_season(uuid)') is null or
     to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Sesiones V1.1: falta una dependencia verificada';
  end if;
  if to_regclass('public.planned_cts_board_defaults_v11') is not null or
     to_regclass('public.planned_session_board_seed_v11') is not null or
     to_regprocedure('public.fix_planned_board_default_v11(uuid,text)') is not null or
     to_regprocedure('public.save_planned_field_dimensions_v11(uuid,integer,numeric,numeric)') is not null then
    if to_regclass('public.planned_cts_board_defaults_v11') is null or
       to_regclass('public.planned_session_board_seed_v11') is null or
       obj_description(to_regclass('public.planned_cts_board_defaults_v11'),'pg_class') is distinct from 'NEXO Sesiones V1.1: CTS board defaults' or
       obj_description(to_regclass('public.planned_session_board_seed_v11'),'pg_class') is distinct from 'NEXO Sesiones V1.1: immutable initial board seed' then
      raise exception 'Sesiones V1.1: objeto preexistente incompatible';
    end if;
  end if;
end $pre$;

create table if not exists public.planned_cts_board_defaults_v11 (
  club_team_season_id uuid primary key references public.club_team_seasons(id) on delete restrict,
  formation_key text,
  player_layout jsonb not null default '[]'::jsonb,
  field_length_m numeric(6,2),
  field_width_m numeric(6,2),
  updated_at timestamptz not null default now(),
  constraint planned_cts_board_defaults_v11_formation_ck check (formation_key is null or formation_key in
    ('4-4-2','4-2-3-1','4-3-3','4-1-4-1','3-5-2','5-3-2','3-4-3')),
  constraint planned_cts_board_defaults_v11_layout_ck check (
    jsonb_typeof(player_layout)='array' and octet_length(player_layout::text)<=65536 and
    (formation_key is not null or player_layout='[]'::jsonb)),
  constraint planned_cts_board_defaults_v11_field_ck check (
    (field_length_m is null and field_width_m is null) or
    (field_length_m>0 and field_length_m<=500 and field_width_m>0 and field_width_m<=500))
);
comment on table public.planned_cts_board_defaults_v11 is 'NEXO Sesiones V1.1: CTS board defaults';
alter table public.planned_cts_board_defaults_v11 owner to postgres;
alter table public.planned_cts_board_defaults_v11 enable row level security;
revoke all on public.planned_cts_board_defaults_v11 from public,anon,authenticated,service_role;
grant select on public.planned_cts_board_defaults_v11 to authenticated,service_role;
do $p$ begin
  if not exists (select 1 from pg_policy where polrelid='public.planned_cts_board_defaults_v11'::regclass and polname='planned_cts_board_defaults_v11_read') then
    create policy planned_cts_board_defaults_v11_read on public.planned_cts_board_defaults_v11
      for select to authenticated using (public.can_read_club_team_season(club_team_season_id));
  end if;
end $p$;
alter policy planned_cts_board_defaults_v11_read on public.planned_cts_board_defaults_v11
  to authenticated using (public.can_read_club_team_season(club_team_season_id));

create table if not exists public.planned_session_board_seed_v11 (
  session_id uuid primary key references public.planned_training_sessions(id) on delete restrict,
  formation_key text,
  player_layout jsonb not null default '[]'::jsonb,
  field_length_m numeric(6,2),
  field_width_m numeric(6,2),
  updated_at timestamptz not null default now(),
  constraint planned_session_board_seed_v11_formation_ck check (formation_key is null or formation_key in
    ('4-4-2','4-2-3-1','4-3-3','4-1-4-1','3-5-2','5-3-2','3-4-3')),
  constraint planned_session_board_seed_v11_layout_ck check (
    jsonb_typeof(player_layout)='array' and octet_length(player_layout::text)<=65536 and
    (formation_key is not null or player_layout='[]'::jsonb)),
  constraint planned_session_board_seed_v11_field_ck check (
    (field_length_m is null and field_width_m is null) or
    (field_length_m>0 and field_length_m<=500 and field_width_m>0 and field_width_m<=500))
);
comment on table public.planned_session_board_seed_v11 is 'NEXO Sesiones V1.1: immutable initial board seed';
alter table public.planned_session_board_seed_v11 owner to postgres;
alter table public.planned_session_board_seed_v11 enable row level security;
revoke all on public.planned_session_board_seed_v11 from public,anon,authenticated,service_role;
grant select on public.planned_session_board_seed_v11 to authenticated,service_role;
do $p$ begin
  if not exists (select 1 from pg_policy where polrelid='public.planned_session_board_seed_v11'::regclass and polname='planned_session_board_seed_v11_read') then
    create policy planned_session_board_seed_v11_read on public.planned_session_board_seed_v11
      for select to authenticated using (exists (select 1 from public.planned_training_sessions s
        where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
end $p$;
alter policy planned_session_board_seed_v11_read on public.planned_session_board_seed_v11
  to authenticated using (exists (select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));

create or replace function public.seed_planned_board_v11() returns trigger
language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  insert into public.planned_session_board_seed_v11
    (session_id,formation_key,player_layout,field_length_m,field_width_m)
  select new.id,d.formation_key,d.player_layout,d.field_length_m,d.field_width_m
  from public.planned_cts_board_defaults_v11 d
  where d.club_team_season_id=new.club_team_season_id;
  return new;
end $fn$;
alter function public.seed_planned_board_v11() owner to postgres;
revoke all on function public.seed_planned_board_v11() from public,anon,authenticated,service_role;
do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid='public.planned_training_sessions'::regclass and tgname='planned_board_seed_v11' and not tgisinternal) then
    create trigger planned_board_seed_v11 after insert on public.planned_training_sessions
      for each row execute function public.seed_planned_board_v11();
  end if;
end $t$;

-- Fijar desde una sesion ya guardada: el servidor copia el layout real, nunca un JSON del cliente.
create or replace function public.fix_planned_board_default_v11(p_session_id uuid,p_kind text)
returns void language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_cts uuid; v_field record; v_layout record;
begin
  if auth.uid() is null or p_kind not in ('players','field') then
    raise exception 'Configuracion no autorizada' using errcode='42501';
  end if;
  select s.club_team_season_id into v_cts from public.planned_training_sessions s where s.id=p_session_id;
  if v_cts is null or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Configuracion no autorizada' using errcode='42501';
  end if;
  perform 1 from public.club_seasons se join public.club_team_seasons cts
    on cts.season_id=se.id and cts.club_id=se.club_id
    where cts.id=v_cts and se.status='open' for update of se;
  if not found or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  if p_kind='players' then
    select formation_key,player_layout into v_layout from public.planned_session_distributions where session_id=p_session_id;
    if not found or v_layout.formation_key is null or jsonb_array_length(v_layout.player_layout)=0 then
      raise exception 'Guarda antes una distribucion de jugadores completa' using errcode='23514';
    end if;
    insert into public.planned_cts_board_defaults_v11(club_team_season_id,formation_key,player_layout)
      values(v_cts,v_layout.formation_key,v_layout.player_layout)
      on conflict (club_team_season_id) do update set formation_key=excluded.formation_key,
        player_layout=excluded.player_layout,updated_at=now();
  else
    select field_length_m,field_width_m into v_field from public.planned_session_board_seed_v11 where session_id=p_session_id;
    if not found or v_field.field_length_m is null or v_field.field_width_m is null then
      raise exception 'Guarda antes las dimensiones del campo' using errcode='23514';
    end if;
    insert into public.planned_cts_board_defaults_v11(club_team_season_id,field_length_m,field_width_m)
      values(v_cts,v_field.field_length_m,v_field.field_width_m)
      on conflict (club_team_season_id) do update set field_length_m=excluded.field_length_m,
        field_width_m=excluded.field_width_m,updated_at=now();
  end if;
end $fn$;
alter function public.fix_planned_board_default_v11(uuid,text) owner to postgres;
revoke all on function public.fix_planned_board_default_v11(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.fix_planned_board_default_v11(uuid,text) to authenticated;

create or replace function public.save_planned_field_dimensions_v11(
  p_session_id uuid,p_expected_revision integer,p_length_m numeric,p_width_m numeric)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ctx record; v_old record; v_revision integer;
begin
  if (p_length_m is null) <> (p_width_m is null) or
     (p_length_m is not null and (p_length_m<=0 or p_length_m>500 or p_width_m<=0 or p_width_m>500)) then
    raise exception 'Dimensiones invalidas' using errcode='22023';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  select field_length_m,field_width_m into v_old from public.planned_session_board_seed_v11
    where session_id=p_session_id for update;
  if v_old.field_length_m is not distinct from p_length_m and
     v_old.field_width_m is not distinct from p_width_m then return p_expected_revision; end if;
  insert into public.planned_session_board_seed_v11(session_id,field_length_m,field_width_m)
    values(p_session_id,p_length_m,p_width_m) on conflict(session_id) do update set
    field_length_m=excluded.field_length_m,field_width_m=excluded.field_width_m,updated_at=now();
  update public.planned_training_sessions set revision=revision+1 where id=p_session_id
    returning revision into v_revision;
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,before_hash,after_hash,metadata)
  values(p_session_id,v_revision,v_ctx.actor_id,
    case when v_ctx.planning_state='confirmed' then 'confirmed_saved' else 'draft_saved' end,
    array['distributions'],md5(jsonb_build_object('length',v_old.field_length_m,'width',v_old.field_width_m)::text),
    md5(jsonb_build_object('length',p_length_m,'width',p_width_m)::text),
    jsonb_build_object('operation','save_field_dimensions_v11'));
  return v_revision;
end $fn$;
alter function public.save_planned_field_dimensions_v11(uuid,integer,numeric,numeric) owner to postgres;
revoke all on function public.save_planned_field_dimensions_v11(uuid,integer,numeric,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.save_planned_field_dimensions_v11(uuid,integer,numeric,numeric) to authenticated;

do $post$ begin
  if (select count(*) from pg_trigger where tgrelid='public.planned_training_sessions'::regclass
      and tgname='planned_board_seed_v11' and not tgisinternal and tgenabled='O')<>1 or
     not has_function_privilege('authenticated','public.fix_planned_board_default_v11(uuid,text)','EXECUTE') or
     not has_function_privilege('authenticated','public.save_planned_field_dimensions_v11(uuid,integer,numeric,numeric)','EXECUTE') or
     has_function_privilege('anon','public.fix_planned_board_default_v11(uuid,text)','EXECUTE') or
     has_function_privilege('anon','public.save_planned_field_dimensions_v11(uuid,integer,numeric,numeric)','EXECUTE') then
    raise exception 'Sesiones V1.1: postflight de seguridad fallido';
  end if;
end $post$;
commit;
