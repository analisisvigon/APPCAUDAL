alter table public.partidos
add column if not exists captain_player_id uuid references public.jugadores(id) on delete set null;

create index if not exists partidos_captain_player_id_idx
on public.partidos(captain_player_id);
