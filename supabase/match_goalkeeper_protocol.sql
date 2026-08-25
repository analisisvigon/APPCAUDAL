begin;

alter table public.partidos
  add column if not exists goalkeeper_protocol_primary_player_id uuid null,
  add column if not exists goalkeeper_protocol_secondary_player_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'partidos_goalkeeper_protocol_primary_player_fk'
      and conrelid = 'public.partidos'::regclass
  ) then
    alter table public.partidos
      add constraint partidos_goalkeeper_protocol_primary_player_fk
      foreign key (goalkeeper_protocol_primary_player_id)
      references public.jugadores(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'partidos_goalkeeper_protocol_secondary_player_fk'
      and conrelid = 'public.partidos'::regclass
  ) then
    alter table public.partidos
      add constraint partidos_goalkeeper_protocol_secondary_player_fk
      foreign key (goalkeeper_protocol_secondary_player_id)
      references public.jugadores(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'partidos_goalkeeper_protocol_distinct_players_check'
      and conrelid = 'public.partidos'::regclass
  ) then
    alter table public.partidos
      add constraint partidos_goalkeeper_protocol_distinct_players_check
      check (
        goalkeeper_protocol_primary_player_id is null
        or goalkeeper_protocol_secondary_player_id is null
        or goalkeeper_protocol_primary_player_id <> goalkeeper_protocol_secondary_player_id
      );
  end if;
end $$;

create index if not exists partidos_goalkeeper_protocol_primary_idx
  on public.partidos (goalkeeper_protocol_primary_player_id)
  where goalkeeper_protocol_primary_player_id is not null;

create index if not exists partidos_goalkeeper_protocol_secondary_idx
  on public.partidos (goalkeeper_protocol_secondary_player_id)
  where goalkeeper_protocol_secondary_player_id is not null;

comment on column public.partidos.goalkeeper_protocol_primary_player_id
  is 'Responsable principal del protocolo de salida de 1 minuto por atención al portero, específico del partido.';
comment on column public.partidos.goalkeeper_protocol_secondary_player_id
  is 'Segunda opción del protocolo de salida de 1 minuto por atención al portero, específica del partido.';

commit;
