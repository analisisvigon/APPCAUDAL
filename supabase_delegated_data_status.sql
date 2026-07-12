alter table public.partidos
add column if not exists delegated_data_status text not null default 'Sin revisar';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'partidos_delegated_data_status_check'
      and conrelid = 'public.partidos'::regclass
  ) then
    alter table public.partidos drop constraint partidos_delegated_data_status_check;
  end if;
end $$;

alter table public.partidos
add constraint partidos_delegated_data_status_check
check (delegated_data_status in ('Sin revisar', 'Revisado', 'Validado', 'Descartado'));

comment on column public.partidos.delegated_data_status is
'Estado por partido del Registro Delegado. Solo Validado puede alimentar acumulados del registro en vivo validados.';
