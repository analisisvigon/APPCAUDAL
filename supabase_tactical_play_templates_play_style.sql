alter table if exists public.tactical_play_templates
add column if not exists play_style text null;

alter table if exists public.tactical_play_templates
drop constraint if exists tactical_play_templates_play_style_valid;

alter table if exists public.tactical_play_templates
add constraint tactical_play_templates_play_style_valid
check (
  play_style is null
  or play_style in ('combinative', 'direct')
);

create index if not exists tactical_play_templates_owner_phase_situation_style_idx
on public.tactical_play_templates (owner_id, phase, situation, play_style);

comment on column public.tactical_play_templates.play_style is
'Tipo de juego ofensivo: combinative o direct. Es null para plantillas defensivas.';
