alter table if exists public.equipos_rivales
  add column if not exists tactical_variants text[] not null default '{}'::text[];

do $$
declare
  legacy_column text;
begin
  foreach legacy_column in array array['variant_system', 'alternative_system', 'variant', 'variante']
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'equipos_rivales'
        and column_name = legacy_column
    ) then
      execute format(
        'update public.equipos_rivales
         set tactical_variants = regexp_split_to_array(trim(%1$I), ''\s*[,;]\s*'')
         where cardinality(tactical_variants) = 0
           and nullif(trim(%1$I), '''') is not null',
        legacy_column
      );
    end if;
  end loop;
end $$;

comment on column public.equipos_rivales.tactical_variants is
'Variantes tacticas habituales del rival. Array ordenado de sistemas; system conserva el sistema principal.';
