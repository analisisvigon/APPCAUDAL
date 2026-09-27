-- Reparacion transaccional e idempotente de una unica identidad de snapshot.
-- No ejecutar desde la app. No modifica minuto, sistema, slot ni nombre snapshot.
begin;

select
  'BEFORE' as stage,
  snapshot.partido_id,
  snapshot.id as snapshot_id,
  snapshot.minute,
  snapshot.system,
  slot.slot,
  slot.jugador_id,
  slot.player_name_snapshot
from public.partido_snapshots_tacticos snapshot
join public.partido_snapshot_tactico_slots slot on slot.snapshot_id = snapshot.id
where snapshot.id = 'f888f2a6-c71b-45dd-b0e7-4792c725c61f'::uuid
  and snapshot.partido_id = '25cbc486-080a-4b82-9980-3c09cc103181'::uuid
  and snapshot.minute = 89
  and snapshot.system = '4-2-3-1'
  and slot.slot = 9;

do $repair$
declare
  v_snapshot_id constant uuid := 'f888f2a6-c71b-45dd-b0e7-4792c725c61f'::uuid;
  v_match_id constant uuid := '25cbc486-080a-4b82-9980-3c09cc103181'::uuid;
  v_player_id constant uuid := 'af4060e4-b54a-4e43-94b8-ccd600e7e784'::uuid;
  canonical_player_count integer;
  repairable_slot_count integer;
  already_repaired_count integer;
begin
  select count(*) into canonical_player_count
  from public.jugadores player
  where player.id = v_player_id;
  if canonical_player_count <> 1 then
    raise exception 'Palacio repair stopped: canonical player ID was not found exactly once';
  end if;

  select count(*) into repairable_slot_count
  from public.partido_snapshots_tacticos snapshot
  join public.partido_snapshot_tactico_slots slot on slot.snapshot_id = snapshot.id
  where snapshot.id = v_snapshot_id
    and snapshot.partido_id = v_match_id
    and snapshot.minute = 89
    and snapshot.system = '4-2-3-1'
    and slot.slot = 9
    and slot.jugador_id is null
    and slot.player_name_snapshot = 'Daniel Palalcio';

  select count(*) into already_repaired_count
  from public.partido_snapshots_tacticos snapshot
  join public.partido_snapshot_tactico_slots slot on slot.snapshot_id = snapshot.id
  where snapshot.id = v_snapshot_id
    and snapshot.partido_id = v_match_id
    and snapshot.minute = 89
    and snapshot.system = '4-2-3-1'
    and slot.slot = 9
    and slot.jugador_id = v_player_id
    and slot.player_name_snapshot = 'Daniel Palalcio';

  if repairable_slot_count = 1 then
    update public.partido_snapshot_tactico_slots slot
    set jugador_id = v_player_id
    where slot.snapshot_id = v_snapshot_id
      and slot.slot = 9
      and slot.jugador_id is null
      and slot.player_name_snapshot = 'Daniel Palalcio'
      and exists (
        select 1
        from public.partido_snapshots_tacticos snapshot
        where snapshot.id = slot.snapshot_id
          and snapshot.partido_id = v_match_id
          and snapshot.minute = 89
          and snapshot.system = '4-2-3-1'
      );
    if not found then
      raise exception 'Palacio repair stopped: guarded update affected no row';
    end if;
  elsif already_repaired_count <> 1 then
    raise exception 'Palacio repair stopped: expected exactly one matching null-ID row or an already repaired row';
  end if;

  if not exists (
    select 1
    from public.partido_snapshots_tacticos snapshot
    join public.partido_snapshot_tactico_slots slot on slot.snapshot_id = snapshot.id
    where snapshot.id = v_snapshot_id
      and snapshot.partido_id = v_match_id
      and snapshot.minute = 89
      and snapshot.system = '4-2-3-1'
      and slot.slot = 9
      and slot.jugador_id = v_player_id
      and slot.player_name_snapshot = 'Daniel Palalcio'
  ) then
    raise exception 'Palacio repair stopped: AFTER condition failed';
  end if;
end;
$repair$;

select
  'AFTER' as stage,
  snapshot.partido_id,
  snapshot.id as snapshot_id,
  snapshot.minute,
  snapshot.system,
  slot.slot,
  slot.jugador_id,
  slot.player_name_snapshot
from public.partido_snapshots_tacticos snapshot
join public.partido_snapshot_tactico_slots slot on slot.snapshot_id = snapshot.id
where snapshot.id = 'f888f2a6-c71b-45dd-b0e7-4792c725c61f'::uuid
  and snapshot.partido_id = '25cbc486-080a-4b82-9980-3c09cc103181'::uuid
  and snapshot.minute = 89
  and snapshot.system = '4-2-3-1'
  and slot.slot = 9;

commit;
