alter table if exists public.tactical_play_templates
add column if not exists transition_type text null;

alter table if exists public.tactical_play_templates
add column if not exists field_zone text null;

alter table if exists public.tactical_play_templates
add column if not exists behaviour text null;

alter table if exists public.tactical_play_templates
drop constraint if exists tactical_play_templates_transition_type_valid;

alter table if exists public.tactical_play_templates
add constraint tactical_play_templates_transition_type_valid
check (
  transition_type is null
  or transition_type in ('offensive_transition', 'defensive_transition')
);

alter table if exists public.tactical_play_templates
drop constraint if exists tactical_play_templates_field_zone_valid;

alter table if exists public.tactical_play_templates
add constraint tactical_play_templates_field_zone_valid
check (
  field_zone is null
  or field_zone in ('defensive_half', 'attacking_half')
);

alter table if exists public.tactical_play_templates
drop constraint if exists tactical_play_templates_behaviour_valid;

alter table if exists public.tactical_play_templates
add constraint tactical_play_templates_behaviour_valid
check (
  behaviour is null
  or behaviour in ('fast_attack', 'keep_possession', 'counterpress', 'retreat')
);

alter table if exists public.tactical_play_templates
drop constraint if exists tactical_play_templates_transition_context_valid;

alter table if exists public.tactical_play_templates
add constraint tactical_play_templates_transition_context_valid
check (
  (
    phase <> 'transition'
    and transition_type is null
    and field_zone is null
    and behaviour is null
  )
  or (
    phase = 'transition'
    and transition_type is not null
    and field_zone is not null
    and (
      (
        transition_type = 'offensive_transition'
        and behaviour in ('fast_attack', 'keep_possession')
      )
      or (
        transition_type = 'defensive_transition'
        and behaviour in ('counterpress', 'retreat')
      )
    )
  )
);

create index if not exists tactical_play_templates_owner_transition_context_idx
on public.tactical_play_templates (
  owner_id,
  phase,
  transition_type,
  field_zone,
  behaviour
);

comment on column public.tactical_play_templates.transition_type is
'Tipo de transicion: offensive_transition o defensive_transition. Es null en otras fases.';

comment on column public.tactical_play_templates.field_zone is
'Zona de recuperacion o perdida: defensive_half o attacking_half. Es null en otras fases.';

comment on column public.tactical_play_templates.behaviour is
'Comportamiento de la transicion. Es null en otras fases.';
