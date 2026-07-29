begin;

lock table public.rpe_entries in share row exclusive mode;

-- Un RPE nuevo sin session_id no puede transformarse de forma segura al
-- modelo anterior. El rollback se detiene antes de inventar o perder datos.
do $$
begin
  if exists (
    select 1
    from public.rpe_entries
    where session_id is null
  ) then
    raise exception
      'Rollback bloqueado: existen rpe_entries diarios sin session_id. No se inventarán sesiones.';
  end if;

  if exists (
    select 1
    from public.rpe_entries
    where duration_minutes is null
  ) then
    raise exception
      'Rollback bloqueado: existen rpe_entries sin duration_minutes.';
  end if;
end;
$$;

alter table public.rpe_entries
  drop constraint if exists rpe_entries_player_entry_date_key;

alter table public.rpe_entries
  drop constraint if exists rpe_entries_club_player_entry_date_key;

do $$
declare
  backup_row record;
  insert_columns text;
begin
  select string_agg(
    quote_ident(attribute_row.attname),
    ', '
    order by attribute_row.attnum
  )
  into insert_columns
  from pg_attribute attribute_row
  where attribute_row.attrelid = 'public.rpe_entries'::regclass
    and attribute_row.attnum > 0
    and not attribute_row.attisdropped
    and attribute_row.attgenerated = '';

  for backup_row in
    select row_data
    from public.rpe_entries_daily_phase1_backup
    order by archived_at, rpe_entry_id
  loop
    execute format(
      'insert into public.rpe_entries (%1$s)
       select %1$s
       from jsonb_populate_record(null::public.rpe_entries, $1)',
      insert_columns
    )
    using backup_row.row_data;
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.rpe_entries'::regclass
      and constraint_row.contype = 'u'
      and (
        select array_agg(attribute_row.attname::text order by attribute_row.attname::text)
        from unnest(constraint_row.conkey) as constraint_column(attnum)
        join pg_attribute attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
         and attribute_row.attnum = constraint_column.attnum
      ) = array['jugador_id', 'session_id']::text[]
  ) then
    alter table public.rpe_entries
      add constraint rpe_entries_jugador_id_session_id_key
      unique (jugador_id, session_id);
  end if;
end;
$$;

alter table public.rpe_entries
  alter column session_id set not null;

alter table public.rpe_entries
  alter column duration_minutes set default 0;

alter table public.rpe_entries
  alter column duration_minutes set not null;

-- Las tablas, columnas, FK, políticas RLS y datos legacy permanecen.
-- La copia de seguridad se conserva para auditoría.
commit;
