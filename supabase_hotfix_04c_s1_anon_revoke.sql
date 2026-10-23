-- 04C-S1. Instalar MANUALMENTE tras revisar el preflight.
-- Solo ACL de cuatro tablas. No cambia datos, RLS, funciones ni grants de
-- authenticated. Si otro grant deja acceso anon o cualquier otro rol pierde
-- un permiso efectivo, toda la transaccion se revierte.
begin;

do $preconditions$
declare t text; c oid;
begin
  if auth.uid() is not null then
    raise exception 'Ejecutar sin JWT de aplicacion';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
    or not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'Faltan roles estandar de Supabase';
  end if;
  foreach t in array array[
    'jugadores','jugadores_rivales',
    'equipo_rival_alineacion','equipo_rival_banquillo'] loop
    c := to_regclass(format('public.%I', t));
    if c is null or not exists (
      select 1 from pg_class r where r.oid = c
        and r.relkind in ('r','p') and r.relrowsecurity
    ) then
      raise exception 'Tabla ausente o sin RLS: public.%', t;
    end if;
    -- Las concesiones por columna requieren un tratamiento propio; no
    -- declarar cerrado anon dejando alguna de ellas activa.
    if exists (
      select 1 from pg_attribute a
      cross join lateral aclexplode(a.attacl) acl
      where a.attrelid = c and a.attnum > 0 and not a.attisdropped
        and acl.grantee in (0, 'anon'::regrole::oid)
        and acl.privilege_type in ('SELECT','INSERT','UPDATE')
    ) then
      raise exception 'Grant por columna anon/PUBLIC en public.%: revisar', t;
    end if;
  end loop;
end $preconditions$;

-- Captura permisos efectivos ANTES de retirar PUBLIC/anon. Es temporal y
-- desaparece al COMMIT o ROLLBACK; no modifica datos deportivos.
create temporary table hotfix_04c_s1_before on commit drop as
with target(name) as (values
 ('jugadores'), ('jugadores_rivales'),
 ('equipo_rival_alineacion'), ('equipo_rival_banquillo')
), actor(role_oid, role_name) as (
 select oid, rolname from pg_roles where rolname <> 'anon'
),
operation(privilege) as (values
 ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
)
select t.name, a.role_oid, a.role_name, o.privilege,
       has_table_privilege(a.role_oid,
         to_regclass(format('public.%I', t.name))::oid, o.privilege)
         as was_allowed
from target t cross join actor a cross join operation o;

revoke select, insert, update, delete on table
  public.jugadores,
  public.jugadores_rivales,
  public.equipo_rival_alineacion,
  public.equipo_rival_banquillo
from anon, public;

do $postconditions$
declare row_before record; t text; c oid; privilege_name text;
begin
  for row_before in select * from hotfix_04c_s1_before loop
    if has_table_privilege(row_before.role_oid,
        to_regclass(format('public.%I', row_before.name))::oid,
        row_before.privilege)
       is distinct from row_before.was_allowed then
      raise exception 'Permiso efectivo alterado para % en public.%: %',
        row_before.role_name, row_before.name, row_before.privilege;
    end if;
  end loop;
  foreach t in array array[
    'jugadores','jugadores_rivales',
    'equipo_rival_alineacion','equipo_rival_banquillo'] loop
    c := to_regclass(format('public.%I', t));
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('anon', c, privilege_name) then
        raise exception 'Anon conserva % sobre public.%', privilege_name, t;
      end if;
    end loop;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
      if has_any_column_privilege('anon', c, privilege_name) then
        raise exception 'Anon conserva % por columna en public.%', privilege_name, t;
      end if;
    end loop;
    if exists (
      select 1 from pg_class r
      cross join lateral aclexplode(coalesce(r.relacl, acldefault('r', r.relowner))) acl
      where r.oid = c and acl.grantee = 0
        and acl.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
    ) then
      raise exception 'PUBLIC conserva DML sobre public.%', t;
    end if;
  end loop;
end $postconditions$;

commit;
