alter table if exists public.tactical_play_templates
add column if not exists set_piece_type text null;

alter table if exists public.tactical_play_templates
add column if not exists set_piece_action text null;

alter table if exists public.tactical_play_templates
add column if not exists ball_start_position jsonb null;

alter table if exists public.tactical_play_templates
drop constraint if exists tactical_play_templates_set_piece_context_valid;

alter table if exists public.tactical_play_templates
add constraint tactical_play_templates_set_piece_context_valid
check (
  (
    phase <> 'set_piece'
    and set_piece_type is null
    and set_piece_action is null
    and ball_start_position is null
  )
  or (
    phase = 'set_piece'
    and set_piece_type in ('offensive_set_piece', 'defensive_set_piece')
    and set_piece_action in ('corner', 'wide_free_kick', 'central_free_kick', 'throw_in')
    and jsonb_typeof(ball_start_position) = 'object'
    and jsonb_typeof(ball_start_position -> 'x') = 'number'
    and jsonb_typeof(ball_start_position -> 'y') = 'number'
    and (ball_start_position ->> 'x')::numeric between 1 and 99
    and (ball_start_position ->> 'y')::numeric between 1 and 99
  )
);

create index if not exists tactical_play_templates_owner_set_piece_context_idx
on public.tactical_play_templates (
  owner_id,
  phase,
  set_piece_type,
  set_piece_action
);

comment on column public.tactical_play_templates.set_piece_type is
'Orientacion de la ABP: offensive_set_piece o defensive_set_piece. Es null en otras fases.';

comment on column public.tactical_play_templates.set_piece_action is
'Tipo de accion ABP. Es null en otras fases.';

comment on column public.tactical_play_templates.ball_start_position is
'Coordenadas relativas x/y del balon en una plantilla ABP. Es null en otras fases.';
