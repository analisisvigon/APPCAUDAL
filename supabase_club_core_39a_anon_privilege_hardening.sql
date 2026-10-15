-- APPCAUDAL / Cambio 39A: endurecimiento de privilegios anonimos.
--
-- Alcance exclusivo: ACL de cuatro tablas detectadas por el Cambio 38.
-- No modifica datos, RLS, politicas, funciones, triggers ni el frontend.
--
-- IMPORTANTE:
--   1. Ejecutar antes supabase_club_core_39a_anon_privilege_hardening_verify.sql.
--   2. Continuar solo si el resultado global es READY_TO_APPLY o PASS.
--   3. Conservar el CSV previo: es la unica base segura para una reversion
--      condicionada al estado original.

begin;

do $preflight$
declare
  v_table_name text;
  v_relation_oid oid;
  v_anon_oid oid;
  v_authenticated_oid oid;
  v_service_role_oid oid;
  v_privilege text;
  v_inherited_sources text;
  v_has_non_public_source boolean;
  v_dml_privileges constant text[] := array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE'
  ]::text[];
  v_all_privileges constant text[] := array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE',
    'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]::text[];
  v_dangerous_privileges constant text[] := array[
    'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]::text[];
  v_target_tables constant text[] := array[
    'jugador_suspension_consumptions',
    'match_set_piece_diagrams',
    'match_set_piece_notes',
    'match_set_piece_takers'
  ]::text[];
begin
  select role_row.oid
  into v_anon_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'anon';

  select role_row.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'authenticated';

  select role_row.oid
  into v_service_role_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'service_role';

  if v_anon_oid is null
     or v_authenticated_oid is null
     or v_service_role_oid is null then
    raise exception using
      errcode = '55000',
      message = 'Cambio 39A bloqueado: faltan los roles anon, authenticated o service_role.';
  end if;

  foreach v_table_name in array v_target_tables loop
    v_relation_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_table_name)
    );

    if v_relation_oid is null then
      raise exception using
        errcode = '42P01',
        message = pg_catalog.format(
          'Cambio 39A bloqueado: no existe public.%I.',
          v_table_name
        );
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace
        on namespace.oid = relation.relnamespace
      where relation.oid = v_relation_oid
        and namespace.nspname = 'public'
        and relation.relkind::text in ('r', 'p')
    ) then
      raise exception using
        errcode = '42809',
        message = pg_catalog.format(
          'Cambio 39A bloqueado: public.%I no es una tabla ordinaria o particionada.',
          v_table_name
        );
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class relation
      where relation.oid = v_relation_oid
        and relation.relrowsecurity
    ) then
      raise exception using
        errcode = '55000',
        message = pg_catalog.format(
          'Cambio 39A bloqueado: RLS no esta activa en public.%I.',
          v_table_name
        );
    end if;

    if exists (
      select 1
      from pg_catalog.pg_class relation
      where relation.oid = v_relation_oid
        and relation.relowner = v_anon_oid
    ) then
      raise exception using
        errcode = '55000',
        message = pg_catalog.format(
          'Cambio 39A bloqueado: anon es propietario de public.%I y REVOKE no eliminaria sus capacidades de propietario.',
          v_table_name
        );
    end if;

    if exists (
      select 1
      from pg_catalog.pg_class relation
      where relation.oid = v_relation_oid
        and relation.relowner <> v_anon_oid
        and pg_catalog.pg_has_role(
              v_anon_oid,
              relation.relowner,
              'USAGE'
            )
    ) then
      raise exception using
        errcode = '55000',
        message = pg_catalog.format(
          'Cambio 39A bloqueado: anon hereda el rol propietario de public.%I.',
          v_table_name
        );
    end if;

    select pg_catalog.string_agg(
             distinct pg_catalog.format(
               '%I:%s', inherited_role.rolname, acl.privilege_type
             ),
             ', '
             order by pg_catalog.format(
               '%I:%s', inherited_role.rolname, acl.privilege_type
             )
           )
    into v_inherited_sources
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) acl
    join pg_catalog.pg_roles inherited_role
      on inherited_role.oid = acl.grantee
    where relation.oid = v_relation_oid
      and acl.grantee <> 0::oid
      and acl.grantee <> v_anon_oid
      and pg_catalog.pg_has_role(v_anon_oid, acl.grantee, 'USAGE');

    if v_inherited_sources is not null then
      raise exception using
        errcode = '55000',
        message = pg_catalog.format(
          'Cambio 39A bloqueado: anon hereda privilegios no corregibles con un REVOKE directo en public.%I.',
          v_table_name
        ),
        detail = v_inherited_sources,
        hint = 'Revise la membresia de roles y no aplique esta migracion hasta decidir el alcance de esa herencia.';
    end if;

    -- Retirar PUBLIC no puede reducir ningun DML que authenticated ya posea.
    foreach v_privilege in array v_dml_privileges loop
      if pg_catalog.has_table_privilege(
           v_authenticated_oid,
           v_relation_oid,
           v_privilege
         ) then
        select relation.relowner = v_authenticated_oid
          or exists (
            select 1
            from pg_catalog.aclexplode(
              coalesce(
                relation.relacl,
                pg_catalog.acldefault('r', relation.relowner)
              )
            ) acl
            where acl.privilege_type = v_privilege
              and acl.grantee <> 0::oid
              and (
                acl.grantee = v_authenticated_oid
                or pg_catalog.pg_has_role(
                     v_authenticated_oid,
                     acl.grantee,
                     'USAGE'
                   )
              )
          )
        into v_has_non_public_source
        from pg_catalog.pg_class relation
        where relation.oid = v_relation_oid;

        if not v_has_non_public_source then
          raise exception using
            errcode = '55000',
            message = pg_catalog.format(
              'Cambio 39A bloqueado: authenticated perderia %s sobre public.%I al retirar PUBLIC.',
              v_privilege,
              v_table_name
            ),
            hint = 'No se anaden GRANT en este cambio. Revise el ACL efectivo antes de continuar.';
        end if;
      end if;
    end loop;

    -- El frontend requiere CRUD directo sobre las tablas de estrategia y la
    -- lectura de consumos. Esas capacidades deben existir fuera de PUBLIC.
    foreach v_privilege in array (
      case
        when v_table_name = 'jugador_suspension_consumptions'
          then array['SELECT']::text[]
        else v_dml_privileges
      end
    ) loop
      select relation.relowner = v_authenticated_oid
        or exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(
              relation.relacl,
              pg_catalog.acldefault('r', relation.relowner)
            )
          ) acl
          where acl.privilege_type = v_privilege
            and acl.grantee <> 0::oid
            and (
              acl.grantee = v_authenticated_oid
              or pg_catalog.pg_has_role(
                   v_authenticated_oid,
                   acl.grantee,
                   'USAGE'
                 )
            )
        )
      into v_has_non_public_source
      from pg_catalog.pg_class relation
      where relation.oid = v_relation_oid;

      if not v_has_non_public_source then
        raise exception using
          errcode = '42501',
          message = pg_catalog.format(
            'Cambio 39A bloqueado: falta una fuente no PUBLIC para authenticated:%s sobre public.%I.',
            v_privilege,
            v_table_name
          );
      end if;
    end loop;

    -- service_role no debe perder ninguna capacidad efectiva por retirar PUBLIC.
    foreach v_privilege in array v_all_privileges loop
      if pg_catalog.has_table_privilege(
           v_service_role_oid,
           v_relation_oid,
           v_privilege
         ) then
        select relation.relowner = v_service_role_oid
          or exists (
            select 1
            from pg_catalog.aclexplode(
              coalesce(
                relation.relacl,
                pg_catalog.acldefault('r', relation.relowner)
              )
            ) acl
            where acl.privilege_type = v_privilege
              and acl.grantee <> 0::oid
              and (
                acl.grantee = v_service_role_oid
                or pg_catalog.pg_has_role(
                     v_service_role_oid,
                     acl.grantee,
                     'USAGE'
                   )
              )
          )
        into v_has_non_public_source
        from pg_catalog.pg_class relation
        where relation.oid = v_relation_oid;

        if not v_has_non_public_source then
          raise exception using
            errcode = '55000',
            message = pg_catalog.format(
              'Cambio 39A bloqueado: service_role perderia %s sobre public.%I al retirar PUBLIC.',
              v_privilege,
              v_table_name
            );
        end if;
      end if;
    end loop;

    -- Un privilegio peligroso heredado por authenticated sobreviviria al
    -- REVOKE directo. Se bloquea antes de cambiar nada.
    foreach v_privilege in array v_dangerous_privileges loop
      if exists (
        select 1
        from pg_catalog.pg_class relation
        cross join lateral pg_catalog.aclexplode(
          coalesce(
            relation.relacl,
            pg_catalog.acldefault('r', relation.relowner)
          )
        ) acl
        where relation.oid = v_relation_oid
          and acl.privilege_type = v_privilege
          and acl.grantee not in (0::oid, v_authenticated_oid)
          and pg_catalog.pg_has_role(
                v_authenticated_oid,
                acl.grantee,
                'USAGE'
              )
      ) or exists (
        select 1
        from pg_catalog.pg_class relation
        where relation.oid = v_relation_oid
          and (
            relation.relowner = v_authenticated_oid
            or (
              pg_catalog.pg_has_role(
                v_authenticated_oid,
                relation.relowner,
                'USAGE'
              )
              and pg_catalog.has_table_privilege(
                v_authenticated_oid,
                v_relation_oid,
                v_privilege
              )
            )
          )
      ) then
        raise exception using
          errcode = '55000',
          message = pg_catalog.format(
            'Cambio 39A bloqueado: authenticated conserva %s sobre public.%I mediante propiedad o herencia.',
            v_privilege,
            v_table_name
          );
      end if;
    end loop;
  end loop;
end;
$preflight$;

-- anon no tiene un uso legitimo de estas tablas. PUBLIC se retira porque sus
-- concesiones alcanzan implicitamente a anon y al resto de roles.
revoke all privileges on table
  public.jugador_suspension_consumptions,
  public.match_set_piece_diagrams,
  public.match_set_piece_notes,
  public.match_set_piece_takers
from anon, public;

-- Estas capacidades no son necesarias para las consultas ni el CRUD de la app
-- y no estan protegidas por las expresiones RLS de fila.
revoke truncate, references, trigger on table
  public.jugador_suspension_consumptions,
  public.match_set_piece_diagrams,
  public.match_set_piece_notes,
  public.match_set_piece_takers
from authenticated;

do $postconditions$
declare
  v_table_name text;
  v_relation_oid oid;
  v_anon_oid oid;
  v_authenticated_oid oid;
  v_privilege text;
  v_required_privilege text;
  v_all_privileges constant text[] := array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE',
    'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]::text[];
  v_dangerous_privileges constant text[] := array[
    'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]::text[];
  v_target_tables constant text[] := array[
    'jugador_suspension_consumptions',
    'match_set_piece_diagrams',
    'match_set_piece_notes',
    'match_set_piece_takers'
  ]::text[];
begin
  select role_row.oid
  into strict v_anon_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'anon';

  select role_row.oid
  into strict v_authenticated_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'authenticated';

  foreach v_table_name in array v_target_tables loop
    v_relation_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_table_name)
    );

    foreach v_privilege in array v_all_privileges loop
      if pg_catalog.has_table_privilege(
           v_anon_oid,
           v_relation_oid,
           v_privilege
         ) then
        raise exception using
          errcode = '55000',
          message = pg_catalog.format(
            'Cambio 39A revertido: anon aun conserva %s sobre public.%I.',
            v_privilege,
            v_table_name
          );
      end if;
    end loop;

    if exists (
      select 1
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) acl
      where relation.oid = v_relation_oid
        and acl.grantee = 0::oid
    ) then
      raise exception using
        errcode = '55000',
        message = pg_catalog.format(
          'Cambio 39A revertido: PUBLIC aun conserva ACL sobre public.%I.',
          v_table_name
        );
    end if;

    foreach v_privilege in array v_dangerous_privileges loop
      if pg_catalog.has_table_privilege(
           v_authenticated_oid,
           v_relation_oid,
           v_privilege
         ) then
        raise exception using
          errcode = '55000',
          message = pg_catalog.format(
            'Cambio 39A revertido: authenticated aun conserva %s sobre public.%I.',
            v_privilege,
            v_table_name
          );
      end if;
    end loop;

    foreach v_required_privilege in array (
      case
        when v_table_name = 'jugador_suspension_consumptions'
          then array['SELECT']::text[]
        else array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
      end
    ) loop
      if not pg_catalog.has_table_privilege(
        v_authenticated_oid,
        v_relation_oid,
        v_required_privilege
      ) then
        raise exception using
          errcode = '55000',
          message = pg_catalog.format(
            'Cambio 39A revertido: authenticated ha perdido %s sobre public.%I.',
            v_required_privilege,
            v_table_name
          );
      end if;
    end loop;
  end loop;
end;
$postconditions$;

commit;
