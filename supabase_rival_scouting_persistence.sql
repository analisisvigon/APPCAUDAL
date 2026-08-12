-- H5: persistencia estructurada de scouting y evidencias manuales del rival.
-- Migración local. No modifica policies existentes y no debe ejecutarse remotamente sin revisión.
begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.rival_scouting_profiles (
  id uuid primary key default gen_random_uuid(),
  equipo_rival_id uuid not null references public.equipos_rivales(id) on delete cascade,
  tactical_identity jsonb not null default '{}'::jsonb,
  collective_profile jsonb not null default '{}'::jsonb,
  match_plan_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rival_scouting_profiles_team_unique unique (equipo_rival_id),
  constraint rival_scouting_profiles_json_check check (
    jsonb_typeof(tactical_identity) = 'object'
    and jsonb_typeof(collective_profile) = 'object'
    and jsonb_typeof(match_plan_notes) = 'object'
  )
);

create table if not exists public.rival_scouting_player_profiles (
  id uuid primary key default gen_random_uuid(),
  equipo_rival_id uuid not null references public.equipos_rivales(id) on delete cascade,
  global_player_id uuid references public.players_database(id) on delete cascade,
  membership_id uuid references public.player_team_memberships(id) on delete cascade,
  jugador_rival_id uuid references public.jugadores_rivales(id) on delete cascade,
  legacy_player_key text,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rival_scouting_player_profiles_identity_check check (
    global_player_id is not null or membership_id is not null or jugador_rival_id is not null
    or nullif(btrim(legacy_player_key), '') is not null
  ),
  constraint rival_scouting_player_profiles_json_check check (jsonb_typeof(profile) = 'object')
);

create unique index if not exists rival_scouting_player_profiles_global_uidx
on public.rival_scouting_player_profiles (equipo_rival_id, global_player_id)
where global_player_id is not null;
create unique index if not exists rival_scouting_player_profiles_membership_uidx
on public.rival_scouting_player_profiles (equipo_rival_id, membership_id)
where membership_id is not null;
create unique index if not exists rival_scouting_player_profiles_legacy_player_uidx
on public.rival_scouting_player_profiles (equipo_rival_id, jugador_rival_id)
where jugador_rival_id is not null;
create unique index if not exists rival_scouting_player_profiles_legacy_key_uidx
on public.rival_scouting_player_profiles (equipo_rival_id, legacy_player_key)
where legacy_player_key is not null;

create table if not exists public.rival_scouting_evidence (
  id uuid primary key default gen_random_uuid(),
  equipo_rival_id uuid not null references public.equipos_rivales(id) on delete cascade,
  partido_id uuid references public.partidos(id) on delete set null,
  jugador_rival_id uuid references public.jugadores_rivales(id) on delete set null,
  global_player_id uuid references public.players_database(id) on delete set null,
  membership_id uuid references public.player_team_memberships(id) on delete set null,
  legacy_id text,
  evidence_type text not null,
  importance text not null default 'Media',
  interpretation text not null,
  notes text,
  status text not null default 'pending',
  source text not null default 'staff',
  source_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rival_scouting_evidence_status_check check (status in ('pending', 'confirmed', 'discarded')),
  constraint rival_scouting_evidence_importance_check check (importance in ('Alta', 'Media', 'Baja')),
  constraint rival_scouting_evidence_interpretation_check check (btrim(interpretation) <> ''),
  constraint rival_scouting_evidence_source_context_check check (jsonb_typeof(source_context) = 'object')
);

create index if not exists rival_scouting_evidence_team_updated_idx
on public.rival_scouting_evidence (equipo_rival_id, updated_at desc);
create index if not exists rival_scouting_evidence_match_idx
on public.rival_scouting_evidence (partido_id) where partido_id is not null;
create unique index if not exists rival_scouting_evidence_legacy_uidx
on public.rival_scouting_evidence (equipo_rival_id, legacy_id)
where legacy_id is not null;

create table if not exists public.rival_scouting_connections (
  id uuid primary key default gen_random_uuid(),
  equipo_rival_id uuid not null references public.equipos_rivales(id) on delete cascade,
  partido_id uuid references public.partidos(id) on delete set null,
  legacy_id text,
  team_scope text not null default 'rival',
  source_entity_type text not null,
  source_global_player_id uuid references public.players_database(id) on delete set null,
  source_membership_id uuid references public.player_team_memberships(id) on delete set null,
  source_jugador_rival_id uuid references public.jugadores_rivales(id) on delete set null,
  source_jugador_id uuid references public.jugadores(id) on delete set null,
  source_role text,
  source_label text not null,
  target_entity_type text not null,
  target_global_player_id uuid references public.players_database(id) on delete set null,
  target_membership_id uuid references public.player_team_memberships(id) on delete set null,
  target_jugador_rival_id uuid references public.jugadores_rivales(id) on delete set null,
  target_jugador_id uuid references public.jugadores(id) on delete set null,
  target_role text,
  target_label text not null,
  connection_type text not null,
  intensity text not null default 'Media',
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rival_scouting_connections_team_scope_check check (team_scope in ('rival', 'caudal')),
  constraint rival_scouting_connections_entity_type_check check (
    source_entity_type in ('player', 'role') and target_entity_type in ('player', 'role')
  ),
  constraint rival_scouting_connections_source_check check (
    (source_entity_type = 'player' and num_nonnulls(source_global_player_id, source_membership_id, source_jugador_rival_id, source_jugador_id) >= 1)
    or (source_entity_type = 'role' and nullif(btrim(source_role), '') is not null)
  ),
  constraint rival_scouting_connections_target_check check (
    (target_entity_type = 'player' and num_nonnulls(target_global_player_id, target_membership_id, target_jugador_rival_id, target_jugador_id) >= 1)
    or (target_entity_type = 'role' and nullif(btrim(target_role), '') is not null)
  ),
  constraint rival_scouting_connections_intensity_check check (intensity in ('Alta', 'Media', 'Baja'))
);

create index if not exists rival_scouting_connections_team_updated_idx
on public.rival_scouting_connections (equipo_rival_id, updated_at desc);
create unique index if not exists rival_scouting_connections_legacy_uidx
on public.rival_scouting_connections (equipo_rival_id, legacy_id)
where legacy_id is not null;

create table if not exists public.rival_scouting_legacy_imports (
  id uuid primary key default gen_random_uuid(),
  equipo_rival_id uuid not null references public.equipos_rivales(id) on delete cascade,
  storage_key text not null,
  legacy_item_id text not null,
  payload_fingerprint text not null,
  import_status text not null,
  conflict_payload jsonb not null default '[]'::jsonb,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rival_scouting_legacy_imports_unique unique (equipo_rival_id, storage_key, legacy_item_id),
  constraint rival_scouting_legacy_imports_status_check check (import_status in ('imported', 'conflict', 'skipped')),
  constraint rival_scouting_legacy_imports_conflict_check check (jsonb_typeof(conflict_payload) = 'array')
);

create or replace function public.h5_touch_rival_scouting_updated_at()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'rival_scouting_profiles', 'rival_scouting_player_profiles', 'rival_scouting_evidence',
    'rival_scouting_connections', 'rival_scouting_legacy_imports'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'h5_touch_updated_at'
        and tgrelid = format('public.%I', v_table)::regclass
        and not tgisinternal
    ) then
      execute format('create trigger h5_touch_updated_at before update on public.%I for each row execute function public.h5_touch_rival_scouting_updated_at()', v_table);
    end if;
  end loop;
end $$;

create or replace function public.save_rival_scouting_snapshot(
  p_team_id uuid,
  p_tactical_identity jsonb,
  p_collective_profile jsonb,
  p_match_plan_notes jsonb,
  p_player_profiles jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_item jsonb;
declare v_profile_id uuid;
begin
  if p_team_id is null then raise exception using errcode = '22023', message = 'El rival es obligatorio.'; end if;
  if jsonb_typeof(coalesce(p_tactical_identity, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_collective_profile, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_match_plan_notes, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_player_profiles, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'El snapshot de scouting no tiene un formato válido.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_team_id::text, 5));
  perform 1 from public.equipos_rivales where id = p_team_id for update;
  if not found then raise exception using errcode = '23503', message = 'El rival no existe o no es accesible.'; end if;

  insert into public.rival_scouting_profiles (equipo_rival_id, tactical_identity, collective_profile, match_plan_notes)
  values (p_team_id, coalesce(p_tactical_identity, '{}'), coalesce(p_collective_profile, '{}'), coalesce(p_match_plan_notes, '{}'))
  on conflict (equipo_rival_id) do update set
    tactical_identity = excluded.tactical_identity,
    collective_profile = excluded.collective_profile,
    match_plan_notes = excluded.match_plan_notes;

  for v_item in select item from jsonb_array_elements(coalesce(p_player_profiles, '[]'::jsonb)) input(item)
  loop
    if nullif(v_item->>'id', '') is not null then
      update public.rival_scouting_player_profiles
      set profile = coalesce(v_item->'profile', '{}'::jsonb)
      where id = (v_item->>'id')::uuid and equipo_rival_id = p_team_id;
      if not found then raise exception using errcode = 'P0002', message = 'El perfil observado ya no existe.'; end if;
    else
      select id into v_profile_id
      from public.rival_scouting_player_profiles
      where equipo_rival_id = p_team_id
        and (
          (nullif(v_item->>'global_player_id', '') is not null and global_player_id = (v_item->>'global_player_id')::uuid)
          or (nullif(v_item->>'membership_id', '') is not null and membership_id = (v_item->>'membership_id')::uuid)
          or (nullif(v_item->>'jugador_rival_id', '') is not null and jugador_rival_id = (v_item->>'jugador_rival_id')::uuid)
          or (nullif(v_item->>'legacy_player_key', '') is not null and legacy_player_key = v_item->>'legacy_player_key')
        )
      order by created_at
      limit 1;
      if v_profile_id is not null then
        update public.rival_scouting_player_profiles
        set profile = coalesce(v_item->'profile', '{}'::jsonb)
        where id = v_profile_id;
      else
        insert into public.rival_scouting_player_profiles (
          equipo_rival_id, global_player_id, membership_id, jugador_rival_id, legacy_player_key, profile
        ) values (
          p_team_id,
          nullif(v_item->>'global_player_id', '')::uuid,
          nullif(v_item->>'membership_id', '')::uuid,
          nullif(v_item->>'jugador_rival_id', '')::uuid,
          nullif(v_item->>'legacy_player_key', ''),
          coalesce(v_item->'profile', '{}'::jsonb)
        );
      end if;
    end if;
  end loop;
  return jsonb_build_object('equipo_rival_id', p_team_id, 'saved_at', now());
end;
$$;

comment on function public.save_rival_scouting_snapshot(uuid, jsonb, jsonb, jsonb, jsonb) is
  'Guarda el perfil vigente y los perfiles observados del rival respetando las policies del usuario.';

do $$
declare v_table text;
declare v_policy text;
begin
  foreach v_table in array array[
    'rival_scouting_profiles', 'rival_scouting_player_profiles', 'rival_scouting_evidence',
    'rival_scouting_connections', 'rival_scouting_legacy_imports'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon', v_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', v_table);
    foreach v_policy in array array['read', 'insert', 'update', 'delete'] loop
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = v_table
          and policyname = format('Authenticated staff can %s %s', v_policy, v_table)
      ) then
        if v_policy = 'read' then
          execute format('create policy "Authenticated staff can read %s" on public.%I for select to authenticated using (true)', v_table, v_table);
        elsif v_policy = 'insert' then
          execute format('create policy "Authenticated staff can insert %s" on public.%I for insert to authenticated with check (true)', v_table, v_table);
        elsif v_policy = 'update' then
          execute format('create policy "Authenticated staff can update %s" on public.%I for update to authenticated using (true) with check (true)', v_table, v_table);
        else
          execute format('create policy "Authenticated staff can delete %s" on public.%I for delete to authenticated using (true)', v_table, v_table);
        end if;
      end if;
    end loop;
  end loop;
end $$;

revoke all on function public.save_rival_scouting_snapshot(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_rival_scouting_snapshot(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.h5_touch_rival_scouting_updated_at() from public, anon;

commit;
