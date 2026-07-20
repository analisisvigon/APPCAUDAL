-- Identidad canónica de goleador y asistente para partido_eventos_gol.
-- Conserva los nombres como snapshot legible y añade IDs estables de jugadores.
begin;

alter table if exists public.partido_eventos_gol
  add column if not exists scorer_id uuid references public.jugadores(id) on delete set null,
  add column if not exists assistant_id uuid references public.jugadores(id) on delete set null;

create index if not exists partido_eventos_gol_scorer_id_idx
on public.partido_eventos_gol (scorer_id)
where scorer_id is not null;

create index if not exists partido_eventos_gol_assistant_id_idx
on public.partido_eventos_gol (assistant_id)
where assistant_id is not null;

-- Backfill conservador: solo enlaza cuando el nombre identifica exactamente una fila.
update public.partido_eventos_gol goal
set scorer_id = candidate.id
from public.jugadores candidate
where goal.scorer_id is null
  and nullif(trim(goal.scorer), '') is not null
  and lower(trim(candidate.name)) = lower(trim(goal.scorer))
  and (
    select count(*)
    from public.jugadores duplicate_check
    where lower(trim(duplicate_check.name)) = lower(trim(goal.scorer))
  ) = 1;

update public.partido_eventos_gol goal
set assistant_id = candidate.id
from public.jugadores candidate
where goal.assistant_id is null
  and nullif(trim(goal.assistant), '') is not null
  and lower(trim(candidate.name)) = lower(trim(goal.assistant))
  and (
    select count(*)
    from public.jugadores duplicate_check
    where lower(trim(duplicate_check.name)) = lower(trim(goal.assistant))
  ) = 1;

comment on column public.partido_eventos_gol.scorer is
'Snapshot del nombre del goleador. La identidad estable se guarda en scorer_id.';

comment on column public.partido_eventos_gol.assistant is
'Snapshot del nombre del asistente. Null significa que no hay asistente registrado.';

comment on column public.partido_eventos_gol.scorer_id is
'Jugador de la plantilla asociado al gol. Fuente canónica para agregaciones por jugador.';

comment on column public.partido_eventos_gol.assistant_id is
'Jugador de la plantilla asociado a la asistencia. Fuente canónica para agregaciones por jugador.';

commit;

-- Auditoría posterior: una zona de origen no implica que exista asistente.
select id, partido_id, scorer, scorer_id, assistant, assistant_id, assist_zone
from public.partido_eventos_gol
where type = 'Gol a favor'
  and nullif(trim(coalesce(assistant, '')), '') is null
order by created_at desc;
