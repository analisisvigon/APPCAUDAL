create table public.tactical_play_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null
    default auth.uid()
    references auth.users(id)
    on delete cascade,
  name text not null,
  phase text not null,
  situation text not null,
  category text,
  description text not null default '',
  base_rival_system text,
  base_caudal_system text,
  tags jsonb not null default '[]'::jsonb,
  player_positions jsonb not null default '{}'::jsonb,
  arrows jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tactical_play_templates_name_not_empty
    check (char_length(trim(name)) > 0),
  constraint tactical_play_templates_phase_not_empty
    check (char_length(trim(phase)) > 0),
  constraint tactical_play_templates_situation_not_empty
    check (char_length(trim(situation)) > 0),
  constraint tactical_play_templates_tags_array
    check (
      jsonb_typeof(tags) = 'array'
      and not jsonb_path_exists(tags, '$[*] ? (@.type() != "string")')
    ),
  constraint tactical_play_templates_positions_object
    check (jsonb_typeof(player_positions) = 'object'),
  constraint tactical_play_templates_arrows_array
    check (jsonb_typeof(arrows) = 'array')
);

create index tactical_play_templates_name_idx
  on public.tactical_play_templates (lower(name));

create index tactical_play_templates_phase_situation_idx
  on public.tactical_play_templates (phase, situation);

create index tactical_play_templates_updated_at_idx
  on public.tactical_play_templates (updated_at desc);

create index tactical_play_templates_owner_updated_idx
  on public.tactical_play_templates (owner_id, updated_at desc);

create index tactical_play_templates_owner_phase_situation_idx
  on public.tactical_play_templates (owner_id, phase, situation);

alter table public.tactical_play_templates enable row level security;

create policy "Users can read own tactical templates"
on public.tactical_play_templates
for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own private tactical templates"
on public.tactical_play_templates
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and is_public = false
);

create policy "Users can update own private tactical templates"
on public.tactical_play_templates
for update
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and is_public = false
);

create policy "Users can delete own tactical templates"
on public.tactical_play_templates
for delete
to authenticated
using (owner_id = auth.uid());

create trigger set_tactical_play_templates_updated_at
before update on public.tactical_play_templates
for each row execute function public.set_updated_at();

comment on table public.tactical_play_templates is
'Plantillas tacticas privadas y reutilizables de Sistemas Enfrentados.';

comment on column public.tactical_play_templates.player_positions is
'Estructura tactica semantica por roles. Nunca contiene jugadores, nombres, fotografias ni IDs de equipos.';

comment on column public.tactical_play_templates.base_rival_system is
'Sistema rival de referencia al crear la plantilla; nunca limita su reutilizacion.';

comment on column public.tactical_play_templates.base_caudal_system is
'Sistema Caudal de referencia al crear la plantilla; nunca limita su reutilizacion.';
