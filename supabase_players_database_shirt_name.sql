-- Campo global opcional para el nombre deportivo mostrado en la camiseta.
-- No rellena registros existentes: el fallback al nombre completo se resuelve en la aplicación.
begin;

alter table public.players_database
  add column if not exists shirt_name text;

alter table public.jugadores
  add column if not exists shirt_name text;

comment on column public.players_database.shirt_name is
  'Nombre, apodo o abreviatura mostrado en la camiseta. El nombre completo permanece en name.';

create or replace function public.sync_global_player_shirt_name_to_legacy()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.jugadores
  set shirt_name = nullif(trim(new.shirt_name), '')
  where global_player_id = new.id;
  return new;
end;
$$;

drop trigger if exists players_database_sync_shirt_name on public.players_database;
create trigger players_database_sync_shirt_name
after insert or update of shirt_name on public.players_database
for each row execute function public.sync_global_player_shirt_name_to_legacy();

create or replace function public.project_global_player_shirt_name_on_legacy_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.global_player_id is not null then
    new.shirt_name := (
      select nullif(trim(profile.shirt_name), '')
      from public.players_database profile
      where profile.id = new.global_player_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists jugadores_project_global_shirt_name on public.jugadores;
create trigger jugadores_project_global_shirt_name
before insert or update of global_player_id on public.jugadores
for each row execute function public.project_global_player_shirt_name_on_legacy_insert();

commit;
