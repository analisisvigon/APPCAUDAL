-- Representación canónica de los goles en propia.
-- `type` conserva el sentido del gol; `is_own_goal` describe su autoría.
begin;

alter table if exists public.partido_eventos_gol
  add column if not exists is_own_goal boolean not null default false;

do $$
begin
  if exists (
    select 1
    from public.partido_eventos_gol
    where is_own_goal
      and (
        scorer is not null
        or scorer_id is not null
        or assistant is not null
        or assistant_id is not null
      )
  ) then
    raise exception
      'Preflight own goal: hay goles en propia con participantes; no se modifica ningún dato.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.partido_eventos_gol'::regclass
      and conname = 'partido_eventos_gol_own_goal_participants_null_check'
  ) then
    alter table public.partido_eventos_gol
      add constraint partido_eventos_gol_own_goal_participants_null_check
      check (
        not is_own_goal
        or (
          scorer is null
          and scorer_id is null
          and assistant is null
          and assistant_id is null
        )
      );
  end if;
end $$;

comment on column public.partido_eventos_gol.is_own_goal is
'True identifica un gol en propia. Con type=Gol a favor es propia rival; con type=Gol en contra es propia del Caudal.';

commit;
