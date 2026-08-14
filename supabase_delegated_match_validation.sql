-- Registro Delegado: transición atómica del estado de un partido y sus eventos.
-- Ejecutar después de supabase_delegated_data_status.sql y supabase_match_quick_events.sql.

alter table public.partidos
add column if not exists delegated_reviewed_at timestamptz null;

comment on column public.partidos.delegated_reviewed_at is
'Última transición explícita del Registro Delegado a Revisado, Validado o Descartado.';

create or replace function public.set_delegated_match_status(
  p_partido_id uuid,
  p_status text
)
returns table (
  partido_id uuid,
  delegated_data_status text,
  reviewed_at timestamptz,
  total_events bigint,
  validated_events bigint,
  pending_events bigint,
  unidentified_events bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_partido_id uuid;
  v_reviewed_at timestamptz;
begin
  if p_status is null or p_status not in ('Sin revisar', 'Revisado', 'Validado', 'Descartado') then
    raise exception 'Estado de Registro Delegado no válido: %', coalesce(p_status, '<null>')
      using errcode = '22023';
  end if;

  select p.id
  into v_partido_id
  from public.partidos p
  where p.id = p_partido_id
  for update;

  if v_partido_id is null then
    raise exception 'Partido no encontrado: %', p_partido_id
      using errcode = 'P0002';
  end if;

  update public.match_quick_events e
  set reviewed = case
    when p_status <> 'Validado' then false
    when regexp_replace(e.tipo_evento, '_rival$', '', 'i') not in (
      'gol', 'tiro', 'tiro_puerta', 'regate', 'centro', 'perdida',
      'robo', 'recuperacion', 'falta_realizada', 'falta_recibida', 'corner'
    ) then false
    when e.equipo = 'rival' or e.tipo_evento ~* '_rival$' then true
    when regexp_replace(e.tipo_evento, '_rival$', '', 'i') = 'corner' then true
    else e.jugador_id is not null
  end
  where e.partido_id = p_partido_id;

  v_reviewed_at := case when p_status = 'Sin revisar' then null else now() end;

  update public.partidos p
  set delegated_data_status = p_status,
      delegated_reviewed_at = v_reviewed_at
  where p.id = p_partido_id;

  return query
  select
    p.id,
    p.delegated_data_status,
    p.delegated_reviewed_at,
    count(e.id) filter (
      where regexp_replace(e.tipo_evento, '_rival$', '', 'i') in (
        'gol', 'tiro', 'tiro_puerta', 'regate', 'centro', 'perdida',
        'robo', 'recuperacion', 'falta_realizada', 'falta_recibida', 'corner'
      )
    ),
    count(e.id) filter (
      where e.reviewed
        and regexp_replace(e.tipo_evento, '_rival$', '', 'i') in (
          'gol', 'tiro', 'tiro_puerta', 'regate', 'centro', 'perdida',
          'robo', 'recuperacion', 'falta_realizada', 'falta_recibida', 'corner'
        )
    ),
    count(e.id) filter (
      where not e.reviewed
        and regexp_replace(e.tipo_evento, '_rival$', '', 'i') in (
          'gol', 'tiro', 'tiro_puerta', 'regate', 'centro', 'perdida',
          'robo', 'recuperacion', 'falta_realizada', 'falta_recibida', 'corner'
        )
    ),
    count(e.id) filter (
      where e.equipo = 'caudal'
        and e.tipo_evento !~* '_rival$'
        and regexp_replace(e.tipo_evento, '_rival$', '', 'i') in (
          'gol', 'tiro', 'tiro_puerta', 'regate', 'centro', 'perdida',
          'robo', 'recuperacion', 'falta_realizada', 'falta_recibida'
        )
        and e.jugador_id is null
    )
  from public.partidos p
  left join public.match_quick_events e on e.partido_id = p.id
  where p.id = p_partido_id
  group by p.id, p.delegated_data_status, p.delegated_reviewed_at;
end;
$$;

comment on function public.set_delegated_match_status(uuid, text) is
'Transición atómica por partido. Validado aprueba eventos resolubles; el resto queda pendiente. Otros estados desvalidan los eventos sin borrarlos.';

revoke all on function public.set_delegated_match_status(uuid, text) from public;
grant execute on function public.set_delegated_match_status(uuid, text) to authenticated;
