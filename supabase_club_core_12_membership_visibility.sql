-- BLOQUE 1.5 - Aislamiento de lectura de public.club_memberships.
--
-- Sustituye exclusivamente la SELECT historica, que permitia a cualquier
-- miembro leer todas las memberships del club, por dos contratos explicitos:
--   1. authenticated puede leer su propia membership;
--   2. owner/admin/staff puede leer memberships de su propio club activo.
--
-- No modifica grants, helpers, triggers, estructura ni policies de escritura.

begin;

do $$
declare
  membership_relation oid := pg_catalog.to_regclass(
    'public.club_memberships'
  );
  authenticated_oid oid;
  structure_fingerprint text;
  manager_policy_fingerprint text;
  invalid_manager_policy_count integer;
begin
  if membership_relation is null then
    raise exception
      'Bloque 1.5 abortado: no existe public.club_memberships';
  end if;

  select role.oid
    into authenticated_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'authenticated';

  if authenticated_oid is null then
    raise exception 'Bloque 1.5 abortado: no existe el rol authenticated';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = membership_relation
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
      and not relation.relforcerowsecurity
  ) then
    raise exception
      'Bloque 1.5 abortado: club_memberships no tiene RLS ON / FORCE RLS OFF';
  end if;

  if pg_catalog.to_regprocedure('public.current_membership()') is null
     or pg_catalog.to_regprocedure('public.is_app_staff()') is null then
    raise exception
      'Bloque 1.5 abortado: faltan helpers de identidad del Bloque 1.2';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc proc
    where proc.oid = 'public.current_membership()'::regprocedure
      and proc.prosecdef
      and proc.provolatile = 's'
  ) then
    raise exception
      'Bloque 1.5 abortado: current_membership() no es SECURITY DEFINER STABLE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc proc
    where proc.oid = 'public.is_app_staff()'::regprocedure
      and not proc.prosecdef
      and proc.provolatile = 's'
  ) then
    raise exception
      'Bloque 1.5 abortado: is_app_staff() no es SECURITY INVOKER STABLE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
      and policy.polname = 'Club members can read memberships'
      and policy.polcmd = 'r'
      and policy.polpermissive
      and policy.polroles = array[authenticated_oid]::oid[]
  ) then
    raise exception
      'Bloque 1.5 abortado: falta o difiere la policy SELECT historica';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
      and policy.polname in (
        'Membership users can read own',
        'Membership app staff can read own club'
      )
  ) then
    raise exception
      'Bloque 1.5 abortado: ya existe alguna policy SELECT nueva; audite antes de reemplazarla';
  end if;

  with expected(policy_name, command, needs_using, needs_check) as (
    values
      ('Club managers can insert memberships'::text, 'a'::"char", false, true),
      ('Club managers can update memberships'::text, 'w'::"char", true, true),
      ('Club managers can delete memberships'::text, 'd'::"char", true, false)
  ),
  policies as (
    select
      policy.*,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
            ''
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) as normalized_using,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
            ''
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) as normalized_check
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
  )
  select count(*)::integer
    into invalid_manager_policy_count
  from expected
  left join policies policy on policy.polname = expected.policy_name
  where policy.oid is null
    or not policy.polpermissive
    or policy.polcmd <> expected.command
    or policy.polroles <> array[authenticated_oid]::oid[]
    or case
      when expected.needs_using then
        policy.normalized_using <> 'can_manage_clubclub_id'
      else policy.polqual is not null
    end
    or case
      when expected.needs_check then
        policy.normalized_check <> 'can_manage_clubclub_id'
      else policy.polwithcheck is not null
    end;

  if invalid_manager_policy_count <> 0 then
    raise exception
      'Bloque 1.5 abortado: % policies manager faltan o difieren',
      invalid_manager_policy_count;
  end if;

  -- Huella de todo el contrato de tabla salvo policies, que son el unico
  -- objeto que esta migracion debe cambiar.
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'relation', pg_catalog.jsonb_build_object(
        'owner', relation.relowner,
        'kind', relation.relkind,
        'persistence', relation.relpersistence,
        'rls', relation.relrowsecurity,
        'force_rls', relation.relforcerowsecurity,
        'acl', relation.relacl
      ),
      'columns', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'number', attribute.attnum,
            'name', attribute.attname,
            'type_oid', attribute.atttypid,
            'type_mod', attribute.atttypmod,
            'not_null', attribute.attnotnull,
            'identity', attribute.attidentity,
            'generated', attribute.attgenerated,
            'default', pg_catalog.pg_get_expr(
              attribute_default.adbin,
              attribute_default.adrelid
            )
          ) order by attribute.attnum
        )
        from pg_catalog.pg_attribute attribute
        left join pg_catalog.pg_attrdef attribute_default
          on attribute_default.adrelid = attribute.attrelid
         and attribute_default.adnum = attribute.attnum
        where attribute.attrelid = relation.oid
          and attribute.attnum > 0
          and not attribute.attisdropped
      ), '[]'::jsonb),
      'constraints', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'name', constraint_row.conname,
            'definition', pg_catalog.pg_get_constraintdef(
              constraint_row.oid,
              true
            ),
            'validated', constraint_row.convalidated
          ) order by constraint_row.conname
        )
        from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid = relation.oid
      ), '[]'::jsonb),
      'indexes', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.pg_get_indexdef(index_row.indexrelid)
          order by index_class.relname
        )
        from pg_catalog.pg_index index_row
        join pg_catalog.pg_class index_class
          on index_class.oid = index_row.indexrelid
        where index_row.indrelid = relation.oid
      ), '[]'::jsonb),
      'triggers', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.pg_get_triggerdef(trigger_row.oid, true)
          order by trigger_row.tgname
        )
        from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid = relation.oid
          and not trigger_row.tgisinternal
      ), '[]'::jsonb)
    )::text
  )
    into structure_fingerprint
  from pg_catalog.pg_class relation
  where relation.oid = membership_relation;

  select pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'name', policy.polname,
        'permissive', policy.polpermissive,
        'command', policy.polcmd,
        'roles', policy.polroles,
        'using', pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
        'check', pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
      ) order by policy.polname
    ),
    '[]'::jsonb
  )::text)
    into manager_policy_fingerprint
  from pg_catalog.pg_policy policy
  where policy.polrelid = membership_relation
    and policy.polname in (
      'Club managers can insert memberships',
      'Club managers can update memberships',
      'Club managers can delete memberships'
    );

  perform pg_catalog.set_config(
    'appcaudal.block_1_5_structure_before',
    structure_fingerprint,
    true
  );
  perform pg_catalog.set_config(
    'appcaudal.block_1_5_manager_policies_before',
    manager_policy_fingerprint,
    true
  );
end
$$;

drop policy "Club members can read memberships"
on public.club_memberships;

create policy "Membership users can read own"
on public.club_memberships
for select
to authenticated
using (user_id = auth.uid());

create policy "Membership app staff can read own club"
on public.club_memberships
for select
to authenticated
using (
  public.is_app_staff()
  and club_id = (
    select actor_membership.club_id
    from public.current_membership() actor_membership
  )
);

do $$
declare
  membership_relation oid := 'public.club_memberships'::regclass;
  authenticated_oid oid;
  structure_fingerprint text;
  manager_policy_fingerprint text;
  invalid_select_policy_count integer;
  invalid_manager_policy_count integer;
  open_policy_count integer;
begin
  select role.oid
    into authenticated_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'authenticated';

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = membership_relation
      and relation.relrowsecurity
      and not relation.relforcerowsecurity
  ) then
    raise exception
      'Bloque 1.5 abortado: RLS dejo de estar ON / FORCE RLS OFF';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
      and policy.polname = 'Club members can read memberships'
  ) then
    raise exception
      'Bloque 1.5 abortado: sigue existiendo la policy SELECT historica';
  end if;

  with policies as (
    select
      policy.*,
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
        as using_expression,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
            ''
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) as normalized_using
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
      and policy.polcmd = 'r'
  ),
  expected(policy_name) as (
    values
      ('Membership users can read own'::text),
      ('Membership app staff can read own club'::text)
  )
  select count(*)::integer
    into invalid_select_policy_count
  from expected
  left join policies policy on policy.polname = expected.policy_name
  where policy.oid is null
    or not policy.polpermissive
    or policy.polroles <> array[authenticated_oid]::oid[]
    or policy.polwithcheck is not null
    or case expected.policy_name
      when 'Membership users can read own' then
        policy.normalized_using <> 'user_id=auth.uid'
      when 'Membership app staff can read own club' then
        policy.normalized_using not like
          'is_app_staffandclub_id=select%club_idfromcurrent_membership%'
        or policy.using_expression ~*
          '(^|[^a-z_])or([^a-z_]|$)'
        or policy.normalized_using like '%true%'
      else true
    end;

  if invalid_select_policy_count <> 0
     or (
       select count(*)
       from pg_catalog.pg_policy policy
       where policy.polrelid = membership_relation
         and policy.polcmd in ('r', '*')
     ) <> 2 then
    raise exception
      'Bloque 1.5 abortado: el contrato SELECT final no contiene exactamente autolectura + staff del club';
  end if;

  with expected(policy_name, command, needs_using, needs_check) as (
    values
      ('Club managers can insert memberships'::text, 'a'::"char", false, true),
      ('Club managers can update memberships'::text, 'w'::"char", true, true),
      ('Club managers can delete memberships'::text, 'd'::"char", true, false)
  ),
  policies as (
    select
      policy.*,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
            ''
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) as normalized_using,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
            ''
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) as normalized_check
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
  )
  select count(*)::integer
    into invalid_manager_policy_count
  from expected
  left join policies policy on policy.polname = expected.policy_name
  where policy.oid is null
    or not policy.polpermissive
    or policy.polcmd <> expected.command
    or policy.polroles <> array[authenticated_oid]::oid[]
    or case
      when expected.needs_using then
        policy.normalized_using <> 'can_manage_clubclub_id'
      else policy.polqual is not null
    end
    or case
      when expected.needs_check then
        policy.normalized_check <> 'can_manage_clubclub_id'
      else policy.polwithcheck is not null
    end;

  if invalid_manager_policy_count <> 0 then
    raise exception
      'Bloque 1.5 abortado: alguna policy manager fue modificada';
  end if;

  select count(*)::integer
    into open_policy_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = membership_relation
    and (
      pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(
          pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
          ''
        )),
        '[[:space:]()]',
        '',
        'g'
      ) = 'true'
      or pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
          ''
        )),
        '[[:space:]()]',
        '',
        'g'
      ) = 'true'
    );

  if open_policy_count <> 0 then
    raise exception
      'Bloque 1.5 abortado: existe alguna policy USING(true)/WITH CHECK(true)';
  end if;

  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'relation', pg_catalog.jsonb_build_object(
        'owner', relation.relowner,
        'kind', relation.relkind,
        'persistence', relation.relpersistence,
        'rls', relation.relrowsecurity,
        'force_rls', relation.relforcerowsecurity,
        'acl', relation.relacl
      ),
      'columns', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'number', attribute.attnum,
            'name', attribute.attname,
            'type_oid', attribute.atttypid,
            'type_mod', attribute.atttypmod,
            'not_null', attribute.attnotnull,
            'identity', attribute.attidentity,
            'generated', attribute.attgenerated,
            'default', pg_catalog.pg_get_expr(
              attribute_default.adbin,
              attribute_default.adrelid
            )
          ) order by attribute.attnum
        )
        from pg_catalog.pg_attribute attribute
        left join pg_catalog.pg_attrdef attribute_default
          on attribute_default.adrelid = attribute.attrelid
         and attribute_default.adnum = attribute.attnum
        where attribute.attrelid = relation.oid
          and attribute.attnum > 0
          and not attribute.attisdropped
      ), '[]'::jsonb),
      'constraints', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'name', constraint_row.conname,
            'definition', pg_catalog.pg_get_constraintdef(
              constraint_row.oid,
              true
            ),
            'validated', constraint_row.convalidated
          ) order by constraint_row.conname
        )
        from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid = relation.oid
      ), '[]'::jsonb),
      'indexes', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.pg_get_indexdef(index_row.indexrelid)
          order by index_class.relname
        )
        from pg_catalog.pg_index index_row
        join pg_catalog.pg_class index_class
          on index_class.oid = index_row.indexrelid
        where index_row.indrelid = relation.oid
      ), '[]'::jsonb),
      'triggers', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.pg_get_triggerdef(trigger_row.oid, true)
          order by trigger_row.tgname
        )
        from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid = relation.oid
          and not trigger_row.tgisinternal
      ), '[]'::jsonb)
    )::text
  )
    into structure_fingerprint
  from pg_catalog.pg_class relation
  where relation.oid = membership_relation;

  if structure_fingerprint is distinct from pg_catalog.current_setting(
    'appcaudal.block_1_5_structure_before',
    true
  ) then
    raise exception
      'Bloque 1.5 abortado: cambio la estructura, ACL, RLS o triggers de club_memberships';
  end if;

  select pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'name', policy.polname,
        'permissive', policy.polpermissive,
        'command', policy.polcmd,
        'roles', policy.polroles,
        'using', pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
        'check', pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
      ) order by policy.polname
    ),
    '[]'::jsonb
  )::text)
    into manager_policy_fingerprint
  from pg_catalog.pg_policy policy
  where policy.polrelid = membership_relation
    and policy.polname in (
      'Club managers can insert memberships',
      'Club managers can update memberships',
      'Club managers can delete memberships'
    );

  if manager_policy_fingerprint is distinct from pg_catalog.current_setting(
    'appcaudal.block_1_5_manager_policies_before',
    true
  ) then
    raise exception
      'Bloque 1.5 abortado: cambiaron las policies manager';
  end if;
end
$$;

commit;
