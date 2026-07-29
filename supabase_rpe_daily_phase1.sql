begin;

lock table public.rpe_entries in share row exclusive mode;

alter table public.rpe_entries
  add column if not exists submitted_at timestamptz;

alter table public.rpe_entries
  add column if not exists duration_minutes integer;

alter table public.rpe_entries
  add column if not exists load numeric;

alter table public.rpe_entries
  alter column session_id drop not null;

alter table public.rpe_entries
  alter column duration_minutes drop not null;

alter table public.rpe_entries
  alter column duration_minutes drop default;

-- Compatibilidad: session_id, su FK, training_sessions, rpe_sync_pending,
-- sus datos y todas las políticas RLS permanecen intactos en esta fase.
-- Los duplicados diarios se archivan antes de consolidarlos.
create table if not exists public.rpe_entries_daily_phase1_backup (
  rpe_entry_id uuid primary key,
  row_data jsonb not null,
  archived_at timestamptz not null default now()
);

alter table public.rpe_entries_daily_phase1_backup enable row level security;
revoke all on table public.rpe_entries_daily_phase1_backup from public, anon, authenticated;
grant all on table public.rpe_entries_daily_phase1_backup to service_role;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rpe_entries'
      and column_name = 'club_id'
  ) then
    execute $sql$
      with ranked as (
        select
          id,
          row_number() over (
            partition by club_id, jugador_id, entry_date
            order by
              coalesce(submitted_at, updated_at, created_at) desc nulls last,
              updated_at desc nulls last,
              created_at desc nulls last,
              id desc
          ) as duplicate_position
        from public.rpe_entries
      ),
      deleted as (
        delete from public.rpe_entries entry
        using ranked
        where entry.id = ranked.id
          and ranked.duplicate_position > 1
        returning entry.*
      )
      insert into public.rpe_entries_daily_phase1_backup (
        rpe_entry_id,
        row_data,
        archived_at
      )
      select
        deleted.id,
        to_jsonb(deleted),
        now()
      from deleted
      on conflict (rpe_entry_id) do update
      set
        row_data = excluded.row_data,
        archived_at = excluded.archived_at
    $sql$;
  else
    execute $sql$
      with ranked as (
        select
          id,
          row_number() over (
            partition by jugador_id, entry_date
            order by
              coalesce(submitted_at, updated_at, created_at) desc nulls last,
              updated_at desc nulls last,
              created_at desc nulls last,
              id desc
          ) as duplicate_position
        from public.rpe_entries
      ),
      deleted as (
        delete from public.rpe_entries entry
        using ranked
        where entry.id = ranked.id
          and ranked.duplicate_position > 1
        returning entry.*
      )
      insert into public.rpe_entries_daily_phase1_backup (
        rpe_entry_id,
        row_data,
        archived_at
      )
      select
        deleted.id,
        to_jsonb(deleted),
        now()
      from deleted
      on conflict (rpe_entry_id) do update
      set
        row_data = excluded.row_data,
        archived_at = excluded.archived_at
    $sql$;
  end if;
end;
$$;

-- Sustituye solo la unicidad funcional antigua. No elimina la FK legacy.
do $$
declare
  unique_constraint_name text;
begin
  for unique_constraint_name in
    select constraint_row.conname
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
  loop
    execute format(
      'alter table public.rpe_entries drop constraint %I',
      unique_constraint_name
    );
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rpe_entries'
      and column_name = 'club_id'
  ) then
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
        ) = array['club_id', 'entry_date', 'jugador_id']::text[]
    ) then
      alter table public.rpe_entries
        add constraint rpe_entries_club_player_entry_date_key
        unique (club_id, jugador_id, entry_date);
    end if;
  else
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
        ) = array['entry_date', 'jugador_id']::text[]
    ) then
      alter table public.rpe_entries
        add constraint rpe_entries_player_entry_date_key
        unique (jugador_id, entry_date);
    end if;
  end if;
end;
$$;

create index if not exists rpe_entries_entry_date_idx
  on public.rpe_entries(entry_date);

create index if not exists rpe_entries_jugador_entry_date_idx
  on public.rpe_entries(jugador_id, entry_date);

commit;
