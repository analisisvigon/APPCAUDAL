begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rpe_entries'
      and column_name = 'session_id'
      and is_nullable = 'NO'
  ) then
    alter table public.rpe_entries
      alter column session_id drop not null;
  end if;
end;
$$;

commit;
