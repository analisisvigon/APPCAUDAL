begin;

create or replace function public.save_match_system_change_with_snapshot(
  p_partido_id uuid,
  p_minute smallint,
  p_period text,
  p_from_system text,
  p_to_system text,
  p_note text,
  p_slots jsonb,
  p_is_complete boolean default true,
  p_event_id uuid default null
)
returns table (event_id uuid, snapshot_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_snapshot_id uuid;
  v_previous_to_system text;
begin
  if nullif(btrim(p_to_system), '') is null then raise exception 'to_system is required'; end if;

  if p_event_id is null then
    insert into public.partido_eventos_sistema (
      partido_id, minute, period, from_system, to_system, note
    ) values (
      p_partido_id, p_minute::text, nullif(btrim(p_period), ''), nullif(btrim(p_from_system), ''), btrim(p_to_system), nullif(btrim(p_note), '')
    ) returning id into v_event_id;
  else
    select to_system into v_previous_to_system
    from public.partido_eventos_sistema
    where id = p_event_id and partido_id = p_partido_id
    for update;
    if not found then raise exception 'system event not found for match'; end if;

    if exists (
      select 1
      from public.partido_snapshots_tacticos
      where partido_id = p_partido_id
        and minute = p_minute
        and source_system_event_id is distinct from p_event_id
    ) then
      raise exception 'another tactical snapshot already exists at minute %', p_minute;
    end if;

    update public.partido_eventos_sistema set
      minute = p_minute::text,
      period = nullif(btrim(p_period), ''),
      from_system = nullif(btrim(p_from_system), ''),
      to_system = btrim(p_to_system),
      note = nullif(btrim(p_note), ''),
      updated_at = now()
    where id = p_event_id and partido_id = p_partido_id
    returning id into v_event_id;

    update public.partido_snapshots_tacticos
    set minute = p_minute,
        period = nullif(btrim(p_period), ''),
        system = btrim(p_to_system),
        reason = coalesce(nullif(btrim(p_note), ''), 'Cambio de sistema'),
        is_complete = case
          when btrim(coalesce(v_previous_to_system, '')) = btrim(p_to_system) then is_complete
          else false
        end,
        updated_at = now()
    where source_system_event_id = v_event_id
    returning id into v_snapshot_id;

    if v_snapshot_id is not null then
      return query select v_event_id, v_snapshot_id;
      return;
    end if;
  end if;

  v_snapshot_id := public.save_match_tactical_snapshot(
    p_partido_id,
    p_minute,
    p_period,
    p_to_system,
    coalesce(nullif(btrim(p_note), ''), 'Cambio de sistema'),
    p_is_complete,
    p_slots,
    v_event_id
  );

  return query select v_event_id, v_snapshot_id;
end;
$$;

revoke all on function public.save_match_system_change_with_snapshot(uuid, smallint, text, text, text, text, jsonb, boolean, uuid) from public;
grant execute on function public.save_match_system_change_with_snapshot(uuid, smallint, text, text, text, text, jsonb, boolean, uuid) to authenticated;

comment on function public.save_match_system_change_with_snapshot(uuid, smallint, text, text, text, text, jsonb, boolean, uuid) is
'Crea o edita un cambio de sistema. Al editar conserva los IDs y slots del snapshot; un cambio de formación deja la disposición pendiente de revisión.';

commit;
