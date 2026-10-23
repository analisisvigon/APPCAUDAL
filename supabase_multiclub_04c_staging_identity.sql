-- SOLO ENSAYO 04C. Extraido de Club Core 08/09 sin inventario historico.
-- Instalar tras 01/02/03, con tablas legacy y cero usuarios. NO PRODUCCION.
begin;
do $guard$
begin
  if auth.uid() is not null or current_user <> 'postgres'
    or (select count(*) from auth.users) <> 0
    or exists (select 1 from public.club_memberships)
    or to_regprocedure('public.current_membership()') is not null then
    raise exception '04C exige esquema nuevo sin miembros ni helpers 09';
  end if;
end $guard$;

alter table public.club_memberships
  add column jugador_id uuid null;

alter table public.club_memberships
  drop constraint club_memberships_role_check,
  add constraint club_memberships_role_check
    check (role in ('owner', 'admin', 'staff', 'viewer', 'player')),
  add constraint club_memberships_jugador_id_fkey
    foreign key (jugador_id)
    references public.jugadores(id)
    on delete restrict
    deferrable initially immediate,
  add constraint club_memberships_role_jugador_check
    check (
      (role = 'player' and jugador_id is not null)
      or
      (role <> 'player' and jugador_id is null)
    );

-- No incluye club_id deliberadamente: una misma fila public.jugadores.id no
-- puede representar dos identidades PLAYER activas aunque aparezcan en clubs
-- distintos. Las filas inactivas se conservan como historial y no bloquean una
-- futura reactivacion unica; cualquier carrera queda resuelta por este indice.
create unique index club_memberships_active_player_jugador_uidx
on public.club_memberships (jugador_id)
where is_active and role = 'player';

comment on column public.club_memberships.jugador_id is
'Identidad deportiva de una membership PLAYER. Siempre se resuelve desde auth.uid() -> club_memberships; nunca desde un UUID confiado al frontend.';

comment on index public.club_memberships_active_player_jugador_uidx is
'Impide que un jugador tenga dos memberships PLAYER activas, incluso en clubs distintos.';

-- Se reemplaza solo la funcion del trigger. El trigger existente conserva su
-- nombre, eventos, estado y privilegios. Las protecciones previas se mantienen.
create or replace function public.guard_club_membership_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  target_club_id uuid := case
    when tg_op = 'DELETE' then old.club_id
    else new.club_id
  end;
  actor_role text;
  other_active_owners integer;
  removes_active_owner boolean := false;
begin
  perform public.lock_club_memberships(target_club_id);

  -- Las operaciones administrativas sin JWT siguen protegidas por CHECK, FK,
  -- unicidad y por la regla transaccional del ultimo owner.
  if actor_id is not null then
    select membership.role
      into actor_role
    from public.club_memberships membership
    where membership.club_id = target_club_id
      and membership.user_id = actor_id
      and membership.is_active;

    -- NOT IN por si solo no rechaza NULL. La comprobacion explicita evita que
    -- un auth.uid() sin membership activa atraviese el guard por logica ternaria.
    if actor_role is null or actor_role not in ('owner', 'admin') then
      raise exception 'No puede gestionar miembros de este club'
        using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if new.user_id = actor_id then
        raise exception 'Un usuario no puede incorporarse por si mismo'
          using errcode = '42501';
      end if;

      if actor_role = 'admin' and new.role not in ('staff', 'viewer') then
        raise exception 'Un admin solo puede incorporar staff o viewer'
          using errcode = '42501';
      end if;

      if new.role = 'player' and actor_role <> 'owner' then
        raise exception 'Solo un owner puede crear una identidad PLAYER'
          using errcode = '42501';
      end if;
    else
      if tg_op = 'UPDATE' then
        if old.club_id <> new.club_id then
          raise exception 'No se puede trasladar una membership entre clubs'
            using errcode = '23514';
        end if;

        if old.user_id <> new.user_id then
          raise exception 'No se puede cambiar el usuario de una membership'
            using errcode = '23514';
        end if;

        -- Cualquier alta, baja o cambio del vinculo deportivo desde cliente
        -- queda reservado al owner. Un PLAYER nunca supera el control de rol
        -- anterior, por lo que tampoco puede cambiar su role o jugador_id.
        if (
          old.role = 'player'
          or new.role = 'player'
          or old.jugador_id is distinct from new.jugador_id
        ) and actor_role <> 'owner' then
          raise exception 'Solo un owner puede modificar una identidad PLAYER'
            using errcode = '42501';
        end if;
      elsif old.role = 'player' and actor_role <> 'owner' then
        raise exception 'Solo un owner puede eliminar una identidad PLAYER'
          using errcode = '42501';
      end if;

      if actor_role = 'admin' then
        if old.role = 'owner' or (tg_op = 'UPDATE' and new.role = 'owner') then
          raise exception 'Un admin no puede gestionar owners'
            using errcode = '42501';
        end if;

        if tg_op = 'UPDATE' and new.role not in ('staff', 'viewer') then
          raise exception 'Un admin no puede crear ni modificar admins u owners'
            using errcode = '42501';
        end if;
      end if;

      if old.user_id = actor_id then
        if actor_role <> 'owner' then
          raise exception 'Un usuario no puede modificar su propia membership'
            using errcode = '42501';
        end if;

        if tg_op = 'UPDATE' and (
          (not old.is_active and new.is_active)
          or (
            case new.role
              when 'owner' then 4
              when 'admin' then 3
              when 'staff' then 2
              when 'viewer' then 1
              when 'player' then 0
              else -1
            end
            >
            case old.role
              when 'owner' then 4
              when 'admin' then 3
              when 'staff' then 2
              when 'viewer' then 1
              when 'player' then 0
              else -1
            end
          )
        ) then
          raise exception 'Un usuario no puede elevarse ni reactivarse'
            using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    removes_active_owner := old.role = 'owner' and old.is_active;
  elsif tg_op = 'UPDATE' then
    removes_active_owner :=
      old.role = 'owner'
      and old.is_active
      and (new.role <> 'owner' or not new.is_active);
  end if;

  if removes_active_owner then
    select count(*)
      into other_active_owners
    from public.club_memberships membership
    where membership.club_id = old.club_id
      and membership.role = 'owner'
      and membership.is_active
      and membership.id <> old.id;

    if other_active_owners = 0 then
      raise exception 'El club debe conservar al menos un owner activo'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


create function public.current_membership()
returns table (
  membership_id uuid,
  club_id uuid,
  user_id uuid,
  role text,
  jugador_id uuid,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  active_membership_count integer;
begin
  if actor_id is null then
    return;
  end if;

  select count(*)
    into active_membership_count
  from public.club_memberships membership
  where membership.user_id = actor_id
    and membership.is_active;

  if active_membership_count > 1 then
    raise exception
      'Identidad ambigua: auth.uid() tiene % memberships activas',
      active_membership_count
      using errcode = '21000';
  end if;

  return query
  select
    membership.id,
    membership.club_id,
    membership.user_id,
    membership.role,
    membership.jugador_id,
    membership.is_active
  from public.club_memberships membership
  where membership.user_id = actor_id
    and membership.is_active;
end;
$$;

comment on function public.current_membership() is
'Resuelve la unica membership activa de auth.uid(); devuelve 0 filas sin identidad y lanza 21000 si existe ambiguedad.';

-- Los helpers derivados no necesitan privilegios del definidor: solo consumen
-- el resultado ya acotado de current_membership(). Una ausencia produce NULL.
create function public.current_jugador_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select case
    when membership.role = 'player' then membership.jugador_id
    else null::uuid
  end
  from public.current_membership() membership;
$$;

comment on function public.current_jugador_id() is
'Devuelve jugador_id solo para la identidad PLAYER activa derivada de auth.uid(); NULL en cualquier otro caso.';

create function public.is_app_staff()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select membership.role in ('owner', 'admin', 'staff')
      from public.current_membership() membership
    ),
    false
  );
$$;

comment on function public.is_app_staff() is
'True solo para owner, admin o staff con membership activa resuelta desde auth.uid(); no consulta permisos individuales.';

create function public.is_player()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select
        membership.role = 'player'
        and membership.jugador_id is not null
      from public.current_membership() membership
    ),
    false
  );
$$;

comment on function public.is_player() is
'True solo para una membership PLAYER activa y coherente, derivada exclusivamente de auth.uid().';

alter function public.current_membership() owner to postgres;
alter function public.current_jugador_id() owner to postgres;
alter function public.is_app_staff() owner to postgres;
alter function public.is_player() owner to postgres;

-- CREATE FUNCTION concede EXECUTE a PUBLIC por defecto. Se elimina ese acceso,
-- se deniega anon explicitamente y se concede a authenticated. Si los default
-- privileges de Supabase conceden EXECUTE a service_role, se conserva: es un
-- rol backend privilegiado permitido, no una identidad cliente PLAYER.
revoke all on function public.current_membership()
from public, anon, authenticated;
revoke all on function public.current_jugador_id()
from public, anon, authenticated;
revoke all on function public.is_app_staff()
from public, anon, authenticated;
revoke all on function public.is_player()
from public, anon, authenticated;

grant execute on function public.current_membership() to authenticated;
grant execute on function public.current_jugador_id() to authenticated;
grant execute on function public.is_app_staff() to authenticated;
grant execute on function public.is_player() to authenticated;

commit;
