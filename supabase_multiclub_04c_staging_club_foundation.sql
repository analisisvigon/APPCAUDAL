-- SOLO ENSAYO 04C. Estructura sin filas históricas, derivada de Club Core
-- 19, 32, 33 y 34. NO ejecutar esas cuatro migraciones históricas encima.
-- Requiere 01/02/03 y el bootstrap de identidad 04C; no instala 03C.
begin;
do $guard$
begin
  if auth.uid() is not null or current_user <> 'postgres'
    or (select count(*) from auth.users) <> 0
    or to_regclass('public.nexoclub_04c_staging_guard') is not null
    or to_regprocedure('public.is_app_staff()') is null
    or to_regclass('public.clubs') is null
    or to_regclass('public.equipos_rivales') is null
    or to_regclass('public.club_seasons') is not null
    or to_regclass('public.club_teams') is not null
    or to_regclass('public.club_team_seasons') is not null then
    raise exception '04C exige proyecto de ensayo vacío con Club Core 01/02/03 e identidad';
  end if;
  if exists (select 1 from public.clubs) or exists (select 1 from public.equipos_rivales) then
    raise exception '04C no acepta datos deportivos preexistentes';
  end if;
end $guard$;

-- Club Core 32: la misma clave compuesta que usa el permiso CTS de Change 35.
alter table public.club_memberships
  add constraint club_memberships_id_club_key unique (id, club_id);

-- Club Core 19: solo la tabla necesaria para CTS. El dominio Multas queda
-- fuera de este ensayo; no se finge su contrato ni se crean sujetos.
create table public.club_seasons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  code text not null,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  status text not null default 'open',
  closed_at timestamptz,
  closed_by_membership_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint club_seasons_code_not_empty check (pg_catalog.char_length(pg_catalog.btrim(code)) > 0),
  constraint club_seasons_label_not_empty check (pg_catalog.char_length(pg_catalog.btrim(label)) > 0),
  constraint club_seasons_date_order_check check (starts_on <= ends_on),
  constraint club_seasons_club_code_key unique (club_id, code),
  constraint club_seasons_id_club_key unique (id, club_id),
  constraint club_seasons_status_check check (status in ('open', 'closed')),
  constraint club_seasons_lifecycle_consistency_check check (
    (status = 'open' and closed_at is null and closed_by_membership_id is null)
    or (status = 'closed' and closed_at is not null and closed_by_membership_id is not null)
  ),
  constraint club_seasons_closed_by_membership_club_fkey
    foreign key (closed_by_membership_id, club_id)
    references public.club_memberships(id, club_id) on delete restrict
);

create unique index club_seasons_one_active_per_club_uidx
  on public.club_seasons (club_id) where is_active;
create trigger set_club_seasons_updated_at before update on public.club_seasons
  for each row execute function public.set_club_core_updated_at();
alter table public.club_seasons owner to postgres;
alter table public.club_seasons enable row level security;
create policy "Fines staff can read club seasons" on public.club_seasons
  for select to authenticated using (
    public.is_app_staff()
    and club_id = (select membership.club_id from public.current_membership() membership)
  );
revoke all on table public.club_seasons from public, anon, authenticated, service_role;
grant select on table public.club_seasons to authenticated;
grant select, insert, update, delete on table public.club_seasons to service_role;

-- Change 33: equipo propio canónico, sin INSERT histórico del Caudal.
create table public.club_teams (
  id uuid not null,
  club_id uuid not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint club_teams_pkey primary key (id),
  constraint club_teams_id_fkey foreign key (id)
    references public.equipos_rivales(id) on delete restrict,
  constraint club_teams_club_id_fkey foreign key (club_id)
    references public.clubs(id) on delete restrict,
  constraint club_teams_club_code_key unique (club_id, code),
  constraint club_teams_id_club_key unique (id, club_id),
  constraint club_teams_code_not_empty check (
    code = pg_catalog.btrim(code) and code <> ''
  )
);
comment on table public.club_teams is
  'APPCAUDAL Cambio 2: equipos propios vinculados al catalogo deportivo legacy.';
alter table public.club_teams owner to postgres;
alter table public.club_teams enable row level security;
create policy club_teams_staff_select on public.club_teams
  for select to authenticated using (public.can_edit_club_data(club_id));
create policy club_teams_manager_insert on public.club_teams
  for insert to authenticated with check (public.can_manage_club(club_id));
create policy club_teams_manager_update on public.club_teams
  for update to authenticated using (public.can_manage_club(club_id))
  with check (public.can_manage_club(club_id));
revoke all on table public.club_teams from public, anon, authenticated, service_role;
grant select, insert on table public.club_teams to authenticated;
grant update (code, is_active) on table public.club_teams to authenticated;
grant select, insert, update on table public.club_teams to service_role;
create trigger set_club_teams_updated_at before update on public.club_teams
  for each row execute function public.set_club_core_updated_at();

-- Change 34: relación canónica, FK compuestas que impiden cruces de club.
create table public.club_team_seasons (
  id uuid not null default gen_random_uuid(),
  club_id uuid not null,
  team_id uuid not null,
  season_id uuid not null,
  created_at timestamptz not null default now(),
  constraint club_team_seasons_pkey primary key (id),
  constraint club_team_seasons_team_season_key unique (team_id, season_id),
  constraint club_team_seasons_team_club_fkey
    foreign key (team_id, club_id) references public.club_teams(id, club_id)
    on update no action on delete restrict,
  constraint club_team_seasons_season_club_fkey
    foreign key (season_id, club_id) references public.club_seasons(id, club_id)
    on update no action on delete restrict
);
comment on table public.club_team_seasons is
  'APPCAUDAL canonical links between club teams and club seasons (change 34)';
create index club_team_seasons_club_season_idx
  on public.club_team_seasons (club_id, season_id, team_id);
alter table public.club_team_seasons owner to postgres;
alter table public.club_team_seasons enable row level security;
create policy club_team_seasons_staff_select on public.club_team_seasons
  for select to authenticated using (public.can_edit_club_data(club_id));
create policy club_team_seasons_manager_insert on public.club_team_seasons
  for insert to authenticated with check (public.can_manage_club(club_id));
revoke all on table public.club_team_seasons from public, anon, authenticated, service_role;
grant select, insert on table public.club_team_seasons to authenticated;
grant select, insert, delete on table public.club_team_seasons to service_role;
commit;
