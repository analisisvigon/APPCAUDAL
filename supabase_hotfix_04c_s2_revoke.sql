-- 04C-S2. Instalacion MANUAL. Solo TRUNCATE, REFERENCES, TRIGGER y,
-- en PostgreSQL >=17, MAINTAIN de anon/PUBLIC sobre cuatro tablas.
begin;
do $pre$
declare t text; c oid;
begin
 if auth.uid() is not null then raise exception 'Ejecutar sin JWT de aplicacion'; end if;
 if to_regrole('anon') is null or to_regrole('authenticated') is null
   or to_regrole('service_role') is null then
   raise exception 'Faltan roles Supabase';
 end if;
 foreach t in array array['jugadores','jugadores_rivales',
   'equipo_rival_alineacion','equipo_rival_banquillo'] loop
   c:=to_regclass(format('public.%I',t));
   if c is null or not exists(select 1 from pg_class where oid=c
                              and relkind in ('r','p') and relrowsecurity) then
     raise exception 'Tabla ausente o sin RLS: %',t;
   end if;
   -- S1 debe seguir cerrado antes de aplicar S2.
   if has_table_privilege('anon',c,'SELECT')
      or has_table_privilege('anon',c,'INSERT')
      or has_table_privilege('anon',c,'UPDATE')
      or has_table_privilege('anon',c,'DELETE') then
     raise exception 'S1 no permanece cerrado en %',t;
   end if;
 end loop;
end $pre$;

-- Captura todo rol distinto de anon para impedir cambios colaterales por
-- retirar una concesion PUBLIC. La tabla temporal desaparece al terminar.
create temporary table hotfix_04c_s2_before on commit drop as
with target(name) as (values ('jugadores'),('jugadores_rivales'),
 ('equipo_rival_alineacion'),('equipo_rival_banquillo')),
operation(privilege) as (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN'))
select t.name,r.oid as role_oid,r.rolname as role_name,o.privilege,
       has_table_privilege(r.oid,to_regclass(format('public.%I',t.name))::oid,
                           o.privilege) as was_allowed
from target t cross join pg_roles r cross join operation o
where r.rolname<>'anon'
  and (o.privilege<>'MAINTAIN' or current_setting('server_version_num')::integer>=170000);

revoke truncate, references, trigger on table
 public.jugadores,public.jugadores_rivales,
 public.equipo_rival_alineacion,public.equipo_rival_banquillo
from anon, public;

-- SQL dinamico: un servidor anterior a PG17 nunca analiza REVOKE MAINTAIN.
do $maintain$
begin
 if current_setting('server_version_num')::integer>=170000 then
   execute 'revoke maintain on table public.jugadores,public.jugadores_rivales,'||
     'public.equipo_rival_alineacion,public.equipo_rival_banquillo from anon, public';
 end if;
end $maintain$;

do $post$
declare x record; t text; c oid; p text;
begin
 for x in select * from hotfix_04c_s2_before loop
   if has_table_privilege(x.role_oid,to_regclass(format('public.%I',x.name))::oid,
                          x.privilege) is distinct from x.was_allowed then
     raise exception 'Permiso cambiado para % en %: %',x.role_name,x.name,x.privilege;
   end if;
 end loop;
 foreach t in array array['jugadores','jugadores_rivales',
   'equipo_rival_alineacion','equipo_rival_banquillo'] loop
   c:=to_regclass(format('public.%I',t));
   foreach p in array array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
     if p='MAINTAIN' and current_setting('server_version_num')::integer<170000 then
       continue;
     end if;
     if has_table_privilege('anon',c,p) then
       raise exception 'Anon conserva % en %',p,t;
     end if;
     if exists(select 1 from pg_class r
       cross join lateral aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) acl
       where r.oid=c and acl.grantee=0 and acl.privilege_type=p) then
       raise exception 'PUBLIC conserva % en %',p,t;
     end if;
   end loop;
 end loop;
end $post$;
commit;
