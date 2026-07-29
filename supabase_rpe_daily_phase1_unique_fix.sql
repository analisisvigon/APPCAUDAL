begin;

lock table public.rpe_entries in share row exclusive mode;

-- Esta corrección no consolida ni elimina filas. Si hay duplicados diarios,
-- se detiene antes de modificar restricciones para que se resuelvan aparte.
do $$
begin
  if exists (
    select 1
    from public.rpe_entries
    group by jugador_id, entry_date
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'No se puede crear UNIQUE (jugador_id, entry_date): existen duplicados diarios en public.rpe_entries.';
  end if;
end;
$$;

-- Elimina cualquier constraint UNIQUE formado exactamente por
-- jugador_id + session_id, independientemente de su nombre.
do $$
declare
  player_attnum smallint;
  session_attnum smallint;
  old_constraint_name text;
begin
  select attnum::smallint
  into player_attnum
  from pg_attribute
  where attrelid = 'public.rpe_entries'::regclass
    and attname = 'jugador_id'
    and not attisdropped;

  select attnum::smallint
  into session_attnum
  from pg_attribute
  where attrelid = 'public.rpe_entries'::regclass
    and attname = 'session_id'
    and not attisdropped;

  if player_attnum is null or session_attnum is null then
    raise exception 'No se encontraron jugador_id y session_id en public.rpe_entries.';
  end if;

  for old_constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.rpe_entries'::regclass
      and constraint_row.contype = 'u'
      and cardinality(constraint_row.conkey) = 2
      and constraint_row.conkey @> array[player_attnum, session_attnum]::smallint[]
  loop
    execute format(
      'alter table public.rpe_entries drop constraint %I',
      old_constraint_name
    );
  end loop;
end;
$$;

-- Cubre también el caso en que la unicidad antigua se hubiera creado como
-- índice UNIQUE independiente y no como pg_constraint.
do $$
declare
  player_attnum smallint;
  session_attnum smallint;
  old_index_name text;
begin
  select attnum::smallint
  into player_attnum
  from pg_attribute
  where attrelid = 'public.rpe_entries'::regclass
    and attname = 'jugador_id'
    and not attisdropped;

  select attnum::smallint
  into session_attnum
  from pg_attribute
  where attrelid = 'public.rpe_entries'::regclass
    and attname = 'session_id'
    and not attisdropped;

  for old_index_name in
    select index_class.relname
    from pg_index index_row
    join pg_class index_class
      on index_class.oid = index_row.indexrelid
    where index_row.indrelid = 'public.rpe_entries'::regclass
      and index_row.indisunique
      and not index_row.indisprimary
      and index_row.indnkeyatts = 2
      and index_row.indpred is null
      and index_row.indexprs is null
      and (
        select count(*)
        from unnest(index_row.indkey) as index_column(attnum)
        where index_column.attnum in (player_attnum, session_attnum)
      ) = 2
      and not exists (
        select 1
        from pg_constraint constraint_row
        where constraint_row.conindid = index_row.indexrelid
      )
  loop
    execute format('drop index public.%I', old_index_name);
  end loop;
end;
$$;

-- Crea la nueva restricción solo si no existe ya una UNIQUE exactamente
-- equivalente, aunque tenga otro nombre.
do $$
declare
  player_attnum smallint;
  entry_date_attnum smallint;
begin
  select attnum::smallint
  into player_attnum
  from pg_attribute
  where attrelid = 'public.rpe_entries'::regclass
    and attname = 'jugador_id'
    and not attisdropped;

  select attnum::smallint
  into entry_date_attnum
  from pg_attribute
  where attrelid = 'public.rpe_entries'::regclass
    and attname = 'entry_date'
    and not attisdropped;

  if player_attnum is null or entry_date_attnum is null then
    raise exception 'No se encontraron jugador_id y entry_date en public.rpe_entries.';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.rpe_entries'::regclass
      and constraint_row.contype = 'u'
      and cardinality(constraint_row.conkey) = 2
      and constraint_row.conkey @> array[player_attnum, entry_date_attnum]::smallint[]
  ) then
    alter table public.rpe_entries
      add constraint rpe_entries_jugador_id_entry_date_key
      unique (jugador_id, entry_date);
  end if;
end;
$$;

commit;
