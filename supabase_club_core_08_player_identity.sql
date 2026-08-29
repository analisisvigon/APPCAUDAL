-- APPCAUDAL - Fase 1 - Bloque 1.1
-- Identidad minima PLAYER para public.club_memberships.
--
-- Esta migracion:
--   - permite el role player (no crea captain);
--   - enlaza opcionalmente una membership con public.jugadores(id);
--   - obliga a que solo las memberships player tengan jugador_id;
--   - impide dos cuentas PLAYER activas para el mismo jugador;
--   - endurece el guard de memberships para que solo un owner pueda gestionar
--     identidades PLAYER desde una sesion autenticada;
--   - no crea memberships PLAYER, helpers, grants, RLS ni datos deportivos.
--
-- Debe ejecutarse con contexto administrativo y sin JWT de aplicacion activo.
-- No ha sido ejecutada remotamente.

begin;

-- Evita carreras entre la auditoria, el cambio de constraints y la validacion.
lock table public.club_memberships in access exclusive mode;

do $$
declare
  target_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  total_count integer;
  target_club_count integer;
  active_count integer;
  owner_count integer;
  staff_count integer;
  admin_count integer;
  viewer_count integer;
  player_count integer;
begin
  if auth.uid() is not null then
    raise exception
      'Bloque 1.1 debe ejecutarse sin una identidad JWT de aplicacion activa';
  end if;

  if to_regclass('public.club_memberships') is null
     or to_regclass('public.club_member_permissions') is null
     or to_regclass('public.jugadores') is null
     or to_regclass('public.player_team_memberships') is null then
    raise exception
      'Falta alguna tabla requerida: club_memberships, club_member_permissions, jugadores o player_team_memberships';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.club_memberships'::regclass
      and attribute.attname = 'jugador_id'
      and not attribute.attisdropped
  ) then
    raise exception
      'public.club_memberships.jugador_id ya existe; revise si Bloque 1.1 fue aplicado';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.conname = 'club_memberships_role_check'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
  ) then
    raise exception
      'No existe el CHECK esperado club_memberships_role_check';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_memberships'::regclass
      and trigger_row.tgname = 'guard_club_membership_mutation'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then
    raise exception
      'El trigger guard_club_membership_mutation debe existir y estar activo';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_member_permissions'::regclass
      and trigger_row.tgname = 'guard_club_permission_mutation'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then
    raise exception
      'El trigger guard_club_permission_mutation debe existir y estar activo';
  end if;

  -- jugadores.membership_id es una etapa deportiva. Esta comprobacion evita
  -- reutilizarla accidentalmente como membership de autenticacion.
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = any (constraint_row.conkey)
    where constraint_row.conrelid = 'public.jugadores'::regclass
      and constraint_row.confrelid = 'public.player_team_memberships'::regclass
      and constraint_row.contype = 'f'
      and attribute.attname = 'membership_id'
  ) then
    raise exception
      'jugadores.membership_id no referencia player_team_memberships como se esperaba';
  end if;

  select
    count(*),
    count(*) filter (where club_id = target_club_id),
    count(*) filter (where is_active),
    count(*) filter (where role = 'owner'),
    count(*) filter (where role = 'staff'),
    count(*) filter (where role = 'admin'),
    count(*) filter (where role = 'viewer'),
    count(*) filter (where role = 'player')
  into
    total_count,
    target_club_count,
    active_count,
    owner_count,
    staff_count,
    admin_count,
    viewer_count,
    player_count
  from public.club_memberships;

  if total_count <> 5
     or target_club_count <> 5
     or active_count <> 5
     or owner_count <> 1
     or staff_count <> 4
     or admin_count <> 0
     or viewer_count <> 0
     or player_count <> 0 then
    raise exception using message = format(
      'Inventario previo incompatible: total=%s club=%s activas=%s owner=%s staff=%s admin=%s viewer=%s player=%s',
      total_count, target_club_count, active_count, owner_count, staff_count,
      admin_count, viewer_count, player_count
    );
  end if;
end
$$;

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

-- Verificacion estructural y del inventario dentro de la misma transaccion.
do $$
declare
  target_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  invalid_staff_count integer;
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_type type_row on type_row.oid = attribute.atttypid
    where attribute.attrelid = 'public.club_memberships'::regclass
      and attribute.attname = 'jugador_id'
      and not attribute.attisdropped
      and not attribute.attnotnull
      and type_row.typname = 'uuid'
  ) then
    raise exception 'jugador_id no existe como uuid nullable';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.conname = 'club_memberships_jugador_id_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.jugadores'::regclass
      and constraint_row.confdeltype = 'r'
      and constraint_row.convalidated
  ) then
    raise exception 'La FK jugador_id -> jugadores(id) ON DELETE RESTRICT no es valida';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.conname = 'club_memberships_role_check'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%player%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%captain%'
  ) then
    raise exception 'El CHECK de role no permite player o permite captain';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.conname = 'club_memberships_role_jugador_check'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
  ) then
    raise exception 'No existe el CHECK role <-> jugador_id';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class index_class
      on index_class.oid = index_row.indexrelid
    where index_row.indrelid = 'public.club_memberships'::regclass
      and index_class.relname = 'club_memberships_active_player_jugador_uidx'
      and index_row.indisunique
      and index_row.indisvalid
      and index_row.indpred is not null
      and pg_catalog.pg_get_indexdef(index_row.indexrelid) like '%(jugador_id)%'
      and pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid) like '%is_active%'
      and pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid) like '%player%'
  ) then
    raise exception 'No existe el indice unico parcial de PLAYER activo';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_memberships'::regclass
      and trigger_row.tgname = 'guard_club_membership_mutation'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
      and trigger_row.tgfoid = 'public.guard_club_membership_mutation()'::regprocedure
  ) then
    raise exception 'El guard de memberships no sigue activo';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_member_permissions'::regclass
      and trigger_row.tgname = 'guard_club_permission_mutation'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then
    raise exception 'El guard de permisos dejo de estar activo';
  end if;

  select count(*)
  into invalid_staff_count
  from (
    values
      ('4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid, 'owner'::text),
      ('e0933d02-76c7-4e71-9765-896593e1ae80'::uuid, 'staff'::text),
      ('535cc04b-c9c5-4964-86eb-cfdf68ea902f'::uuid, 'staff'::text),
      ('e5fe943f-eaff-4935-8909-7def7b7ba362'::uuid, 'staff'::text),
      ('414427ca-2870-4e46-92e7-ca5133e373fc'::uuid, 'staff'::text)
  ) expected(user_id, role)
  left join public.club_memberships membership
    on membership.club_id = target_club_id
   and membership.user_id = expected.user_id
  where membership.id is null
     or membership.role <> expected.role
     or not membership.is_active
     or membership.jugador_id is not null;

  if invalid_staff_count <> 0 then
    raise exception
      '% memberships STAFF fueron alteradas o tienen jugador_id', invalid_staff_count;
  end if;

  if (select count(*) from public.club_memberships) <> 5
     or (select count(*) from public.club_memberships where is_active) <> 5
     or (select count(*) from public.club_memberships where role = 'owner') <> 1
     or (select count(*) from public.club_memberships where role = 'staff') <> 4
     or (select count(*) from public.club_memberships where role = 'player') <> 0
     or exists (
       select 1
       from public.club_memberships
       where role <> 'player' and jugador_id is not null
     ) then
    raise exception 'El inventario posterior no coincide con 1 owner + 4 staff y 0 player';
  end if;
end
$$;

-- Pruebas negativas atomicas. Usan dos auth.users ya existentes y UUID de
-- jugador ficticio con la FK diferida solo dentro de la transaccion. No crean
-- usuarios, no enlazan jugadores reales y no dejan filas de prueba.
create temporary table block_1_1_negative_test_context (
  club_id uuid primary key,
  fake_jugador_id uuid not null
) on commit drop;

insert into block_1_1_negative_test_context (club_id, fake_jugador_id)
values (gen_random_uuid(), gen_random_uuid());

insert into public.clubs (id, name)
select club_id, 'Bloque 1.1 - prueba transaccional'
from block_1_1_negative_test_context;

-- 1. PLAYER sin jugador_id debe fallar por club_memberships_role_jugador_check.
do $$
declare
  violated_constraint text;
begin
  begin
    insert into public.club_memberships (club_id, user_id, role, is_active, jugador_id)
    select
      test.club_id,
      '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid,
      'player',
      true,
      null
    from block_1_1_negative_test_context test;

    raise exception 'TEST 1 fallo: se acepto PLAYER sin jugador_id';
  exception
    when check_violation then
      get stacked diagnostics violated_constraint = constraint_name;
      if violated_constraint <> 'club_memberships_role_jugador_check' then
        raise exception
          'TEST 1 fallo por constraint inesperada: %', violated_constraint;
      end if;
  end;
end
$$;

-- 2. STAFF con jugador_id debe fallar por club_memberships_role_jugador_check.
do $$
declare
  violated_constraint text;
begin
  begin
    insert into public.club_memberships (club_id, user_id, role, is_active, jugador_id)
    select
      test.club_id,
      '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid,
      'staff',
      true,
      test.fake_jugador_id
    from block_1_1_negative_test_context test;

    raise exception 'TEST 2 fallo: se acepto STAFF con jugador_id';
  exception
    when check_violation then
      get stacked diagnostics violated_constraint = constraint_name;
      if violated_constraint <> 'club_memberships_role_jugador_check' then
        raise exception
          'TEST 2 fallo por constraint inesperada: %', violated_constraint;
      end if;
  end;
end
$$;

-- 3. Dos PLAYER activos con el mismo jugador_id deben fallar por el indice.
-- La FK se difiere para utilizar un UUID ficticio; la transaccion nunca llega
-- a persistirlo ni a comprobarlo al commit porque ambas inserciones se revierten
-- juntas al capturar la unique_violation de la segunda.
set constraints club_memberships_jugador_id_fkey deferred;

do $$
declare
  violated_constraint text;
begin
  begin
    insert into public.club_memberships (club_id, user_id, role, is_active, jugador_id)
    select
      test.club_id,
      '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid,
      'player',
      true,
      test.fake_jugador_id
    from block_1_1_negative_test_context test;

    insert into public.club_memberships (club_id, user_id, role, is_active, jugador_id)
    select
      test.club_id,
      'e0933d02-76c7-4e71-9765-896593e1ae80'::uuid,
      'player',
      true,
      test.fake_jugador_id
    from block_1_1_negative_test_context test;

    raise exception 'TEST 3 fallo: se aceptaron dos PLAYER activos para un jugador';
  exception
    when unique_violation then
      get stacked diagnostics violated_constraint = constraint_name;
      if violated_constraint <> 'club_memberships_active_player_jugador_uidx' then
        raise exception
          'TEST 3 fallo por indice inesperado: %', violated_constraint;
      end if;
  end;
end
$$;

set constraints club_memberships_jugador_id_fkey immediate;

-- El club ficticio no tiene memberships: los subbloques con excepcion revierten
-- sus inserciones. Se elimina antes del commit como defensa adicional.
delete from public.clubs
where id = (
  select club_id from block_1_1_negative_test_context
);

-- 4. Las cinco memberships originales siguen intactas y no existe ningun PLAYER.
do $$
begin
  if (select count(*) from public.club_memberships) <> 5
     or (select count(*) from public.club_memberships where is_active) <> 5
     or (select count(*) from public.club_memberships where role = 'owner') <> 1
     or (select count(*) from public.club_memberships where role = 'staff') <> 4
     or (select count(*) from public.club_memberships where role = 'player') <> 0
     or exists (
       select 1 from public.club_memberships where jugador_id is not null
     ) then
    raise exception 'TEST 4 fallo: las memberships originales no siguen intactas';
  end if;
end
$$;

commit;

-- Consultas informativas de verificacion posterior (solo lectura).
select
  count(*) as memberships_total,
  count(*) filter (where is_active) as memberships_activas,
  count(*) filter (where role = 'owner') as owners,
  count(*) filter (where role = 'staff') as staff,
  count(*) filter (where role = 'admin') as admins,
  count(*) filter (where role = 'viewer') as viewers,
  count(*) filter (where role = 'player') as players,
  count(*) filter (where jugador_id is not null) as vinculadas_a_jugador
from public.club_memberships;

select
  membership.id,
  membership.club_id,
  membership.user_id,
  membership.role,
  membership.is_active,
  membership.jugador_id
from public.club_memberships membership
order by membership.role, membership.user_id;

select
  constraint_row.conname,
  constraint_row.contype,
  constraint_row.convalidated,
  pg_catalog.pg_get_constraintdef(constraint_row.oid) as definition
from pg_catalog.pg_constraint constraint_row
where constraint_row.conrelid = 'public.club_memberships'::regclass
  and constraint_row.conname in (
    'club_memberships_role_check',
    'club_memberships_jugador_id_fkey',
    'club_memberships_role_jugador_check'
  )
order by constraint_row.conname;

select
  index_class.relname as index_name,
  index_row.indisunique,
  index_row.indisvalid,
  pg_catalog.pg_get_indexdef(index_row.indexrelid) as definition
from pg_catalog.pg_index index_row
join pg_catalog.pg_class index_class
  on index_class.oid = index_row.indexrelid
where index_row.indrelid = 'public.club_memberships'::regclass
  and index_class.relname = 'club_memberships_active_player_jugador_uidx';

select
  trigger_row.tgname,
  trigger_row.tgenabled,
  trigger_row.tgfoid::regprocedure as function_name
from pg_catalog.pg_trigger trigger_row
where trigger_row.tgrelid in (
    'public.club_memberships'::regclass,
    'public.club_member_permissions'::regclass
  )
  and trigger_row.tgname in (
    'guard_club_membership_mutation',
    'guard_club_permission_mutation'
  )
  and not trigger_row.tgisinternal
order by trigger_row.tgname;
