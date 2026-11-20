-- NEXO CLUB · Sesiones · imágenes privadas de actividades libres V1.
-- Ejecutar una sola vez en Supabase SQL Editor. No migra ni modifica sesiones existentes.
begin;

do $$
begin
  if to_regclass('public.planned_session_items') is null
     or to_regprocedure('public.can_read_club_team_season(uuid)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null
     or to_regprocedure('public.planned_session_delete_contract_v1()') is null then
    raise exception 'Imágenes de actividades requiere Sesiones 03C y helpers CTS instalados';
  end if;
  if public.planned_session_delete_contract_v1() is not true then
    raise exception 'El contrato actual de eliminación de sesiones no es válido; no se instalará la ampliación';
  end if;
  if to_regclass('public.planned_session_activity_images') is not null then
    raise exception 'Imágenes de actividades V1 ya está instalada; no repetir la migración';
  end if;
end $$;

-- Conserva exactamente el inventario que el contrato instalado acaba de validar.
-- No presupone cantidades: guarda firmas completas de FK y triggers DELETE de
-- las diez tablas que ya forman el núcleo transaccional de delete_planned_session_v1.
create table public.planned_session_delete_target_manifest_v1(
  relation_name text primary key
);
insert into public.planned_session_delete_target_manifest_v1(relation_name) values
  ('planned_training_sessions'),('planned_session_slots'),('planned_session_items'),
  ('planned_session_player_roster'),('planned_session_player_availability'),
  ('planned_session_audit_events'),('planned_session_date_change_authorizations'),
  ('planned_session_distributions'),('planned_session_board_seed_v11'),
  ('planned_session_exercise_dimensions_v12');

create table public.planned_session_delete_fk_manifest_v1(
  child_schema text not null,child_name text not null,parent_schema text not null,parent_name text not null,
  child_columns text[] not null,parent_columns text[] not null,
  delete_action text not null,update_action text not null,
  is_validated boolean not null,is_deferrable boolean not null
);
insert into public.planned_session_delete_fk_manifest_v1
select child_ns.nspname,child.relname,parent_ns.nspname,parent.relname,
  array(select a.attname::text from unnest(c.conkey) with ordinality k(num,ord)
    join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord),
  array(select a.attname::text from unnest(c.confkey) with ordinality k(num,ord)
    join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord),
  c.confdeltype::text,c.confupdtype::text,c.convalidated,c.condeferrable
from pg_catalog.pg_constraint c
join pg_catalog.pg_class child on child.oid=c.conrelid
join pg_catalog.pg_class parent on parent.oid=c.confrelid
join pg_catalog.pg_namespace child_ns on child_ns.oid=child.relnamespace
join pg_catalog.pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
where c.contype='f' and c.confrelid in(
  select to_regclass('public.'||relation_name) from public.planned_session_delete_target_manifest_v1);

create table public.planned_session_delete_trigger_manifest_v1(
  relation_schema text not null,relation_name text not null,trigger_name text not null,
  routine_schema text not null,routine_name text not null,identity_arguments text not null,
  trigger_type integer not null,enabled text not null,has_when boolean not null,
  argument_count integer not null,security_definer boolean not null,
  owner_name text not null,config text[]
);
insert into public.planned_session_delete_trigger_manifest_v1
select relation_ns.nspname,relation.relname,t.tgname,routine_ns.nspname,p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid),t.tgtype::integer,t.tgenabled::text,
  t.tgqual is not null,t.tgnargs::integer,p.prosecdef,owner.rolname,p.proconfig
from pg_catalog.pg_trigger t
join pg_catalog.pg_class relation on relation.oid=t.tgrelid
join pg_catalog.pg_namespace relation_ns on relation_ns.oid=relation.relnamespace
join pg_catalog.pg_proc p on p.oid=t.tgfoid
join pg_catalog.pg_namespace routine_ns on routine_ns.oid=p.pronamespace
join pg_catalog.pg_roles owner on owner.oid=p.proowner
where not t.tgisinternal and (t.tgtype&8)<>0 and t.tgrelid in(
  select to_regclass('public.'||relation_name) from public.planned_session_delete_target_manifest_v1);

revoke all on public.planned_session_delete_target_manifest_v1,
  public.planned_session_delete_fk_manifest_v1,
  public.planned_session_delete_trigger_manifest_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.planned_session_delete_target_manifest_v1,
  public.planned_session_delete_fk_manifest_v1,
  public.planned_session_delete_trigger_manifest_v1 to service_role;

-- La FK compuesta necesita un candidato UNIQUE no diferible en el mismo orden.
-- Sesiones 03A ya crea planned_items_id_session_key; este ajuste solo cubre una
-- instalación antigua compatible y no modifica ninguna fila histórica.
do $$
begin
  if not exists(
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.planned_session_items'::regclass
      and c.contype in ('p','u') and c.convalidated and not c.condeferrable
      and array(select a.attname::text from unnest(c.conkey) with ordinality k(num,ord)
        join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num
        order by k.ord)=array['id','session_id']::text[]
  ) then
    if exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid='public.planned_session_items'::regclass
        and c.conname='planned_items_id_session_key') then
      raise exception 'planned_items_id_session_key existe con una definición incompatible';
    end if;
    alter table public.planned_session_items
      add constraint planned_items_id_session_key unique(id,session_id);
  end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('planned-session-activity-images','planned-session-activity-images',false,10485760,
  array['image/jpeg','image/png','image/webp']::text[]);

create table public.planned_session_activity_images(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  item_id uuid not null,
  club_team_season_id uuid not null references public.club_team_seasons(id) on delete restrict,
  club_id uuid not null references public.clubs(id) on delete restrict,
  uploader_user_id uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_session_activity_images_item_fk
    foreign key(item_id,session_id) references public.planned_session_items(id,session_id) on delete cascade,
  constraint planned_session_activity_images_file_check check(
    original_name=btrim(original_name) and char_length(original_name) between 1 and 255
    and mime_type in ('image/jpeg','image/png','image/webp')
    and size_bytes between 1 and 10485760),
  constraint planned_session_activity_images_order_check check(sort_order between 0 and 6),
  constraint planned_session_activity_images_item_order_key unique(item_id,sort_order) deferrable initially deferred
);
create index planned_session_activity_images_item_order_idx
  on public.planned_session_activity_images(item_id,sort_order,created_at,id);

create table public.planned_session_activity_image_cleanup(
  storage_path text primary key,
  session_id uuid not null,
  club_team_season_id uuid not null,
  queued_at timestamptz not null default now()
);
alter table public.planned_session_activity_image_cleanup enable row level security;

create function public.can_manage_planned_session_activity_cleanup(p_cts uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select auth.uid() is not null and exists(
    select 1 from public.club_team_seasons cts
    join public.club_memberships m on m.club_id=cts.club_id and m.user_id=auth.uid() and m.is_active
    where cts.id=p_cts and (m.role in ('owner','admin') or (m.role='staff' and exists(
      select 1 from public.club_team_season_permissions p
      where p.club_id=cts.club_id and p.membership_id=m.id and p.club_team_season_id=cts.id)))
  );
$$;
alter function public.can_manage_planned_session_activity_cleanup(uuid) owner to postgres;

revoke all on public.planned_session_activity_image_cleanup from public,anon,authenticated;
grant select,insert,update,delete on public.planned_session_activity_image_cleanup to service_role;

create function public.can_delete_planned_session_activity_storage(p_storage_path text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from public.planned_session_activity_image_cleanup q
    where q.storage_path=p_storage_path
      and public.can_manage_planned_session_activity_cleanup(q.club_team_season_id));
$$;
alter function public.can_delete_planned_session_activity_storage(text) owner to postgres;

create function public.list_planned_session_activity_cleanup_v1(p_club_team_season_id uuid,p_session_id uuid default null)
returns table(storage_path text,session_id uuid) language sql stable security definer set search_path=pg_catalog as $$
  select q.storage_path,q.session_id from public.planned_session_activity_image_cleanup q
  where q.club_team_season_id=p_club_team_season_id
    and (p_session_id is null or q.session_id=p_session_id)
    and public.can_manage_planned_session_activity_cleanup(q.club_team_season_id)
  order by q.queued_at,q.storage_path;
$$;
alter function public.list_planned_session_activity_cleanup_v1(uuid,uuid) owner to postgres;

create function public.confirm_planned_session_activity_cleanup_v1(p_storage_path text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_row public.planned_session_activity_image_cleanup%rowtype;
begin
  select * into v_row from public.planned_session_activity_image_cleanup where storage_path=p_storage_path for update;
  if not found then return true; end if;
  if public.can_manage_planned_session_activity_cleanup(v_row.club_team_season_id) is not true then
    raise exception 'Limpieza de imagen no autorizada' using errcode='42501';
  end if;
  if exists(select 1 from storage.objects where bucket_id='planned-session-activity-images' and name=p_storage_path) then
    raise exception 'El objeto Storage todavía existe; no se confirma la limpieza' using errcode='23514';
  end if;
  delete from public.planned_session_activity_image_cleanup where storage_path=p_storage_path;
  return true;
end $$;
alter function public.confirm_planned_session_activity_cleanup_v1(text) owner to postgres;
revoke all on function public.can_manage_planned_session_activity_cleanup(uuid),
  public.can_delete_planned_session_activity_storage(text),
  public.list_planned_session_activity_cleanup_v1(uuid,uuid),
  public.confirm_planned_session_activity_cleanup_v1(text) from public,anon,authenticated;
grant execute on function public.can_manage_planned_session_activity_cleanup(uuid),
  public.can_delete_planned_session_activity_storage(text),
  public.list_planned_session_activity_cleanup_v1(uuid,uuid),
  public.confirm_planned_session_activity_cleanup_v1(text) to authenticated;

create function public.planned_session_activity_image_path_matches(
  p_path text,p_club uuid,p_session uuid,p_item uuid,p_user uuid,p_image uuid)
returns boolean language sql immutable security invoker set search_path=pg_catalog as $$
  select split_part(p_path,'/',1)=p_club::text
    and split_part(p_path,'/',2)=p_session::text
    and split_part(p_path,'/',3)=p_item::text
    and split_part(p_path,'/',4)=p_user::text
    and split_part(p_path,'/',5) ~ ('^image-'||p_image::text||'-[a-z0-9][a-z0-9._-]{0,254}$')
    and array_length(string_to_array(p_path,'/'),1)=5;
$$;
alter function public.planned_session_activity_image_path_matches(text,uuid,uuid,uuid,uuid,uuid) owner to postgres;

create function public.guard_planned_session_activity_image()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_session public.planned_training_sessions%rowtype; v_item public.planned_session_items%rowtype;
begin
  if tg_op='DELETE' then
    if auth.uid() is null or public.can_write_club_team_season(old.club_team_season_id) is not true then
      raise exception 'Imagen de actividad no autorizada' using errcode='42501';
    end if;
    insert into public.planned_session_activity_image_cleanup(storage_path,session_id,club_team_season_id)
      values(old.storage_path,old.session_id,old.club_team_season_id)
      on conflict(storage_path) do update set queued_at=now();
    return old;
  end if;
  select * into v_session from public.planned_training_sessions where id=new.session_id;
  select * into v_item from public.planned_session_items where id=new.item_id and session_id=new.session_id for update;
  if v_session.id is null or v_item.id is null or v_item.kind is distinct from 'free'
     or v_session.club_team_season_id is distinct from new.club_team_season_id then
    raise exception 'La imagen debe pertenecer a una actividad libre de la sesión indicada' using errcode='23514';
  end if;
  if auth.uid() is null or public.can_write_club_team_season(new.club_team_season_id) is not true then
    raise exception 'Imagen de actividad no autorizada' using errcode='42501';
  end if;
  if new.club_id is distinct from (select club_id from public.club_team_seasons where id=new.club_team_season_id)
     or (tg_op='INSERT' and new.uploader_user_id is distinct from auth.uid())
     or public.planned_session_activity_image_path_matches(new.storage_path,new.club_id,new.session_id,new.item_id,new.uploader_user_id,new.id) is not true then
    raise exception 'Identidad o ruta de imagen incoherente' using errcode='23514';
  end if;
  if tg_op='UPDATE' and (new.id,new.session_id,new.item_id,new.club_team_season_id,new.club_id,
      new.uploader_user_id,new.storage_path,new.created_at)
      is distinct from (old.id,old.session_id,old.item_id,old.club_team_season_id,old.club_id,
      old.uploader_user_id,old.storage_path,old.created_at) then
    raise exception 'La identidad y la ruta de una imagen son inmutables' using errcode='23514';
  end if;
  if tg_op='INSERT' and (select count(*) from public.planned_session_activity_images where item_id=new.item_id)>=7 then
    raise exception 'Cada actividad admite como máximo siete imágenes' using errcode='23514';
  end if;
  new.updated_at:=now(); return new;
end $$;
alter function public.guard_planned_session_activity_image() owner to postgres;

create trigger planned_session_activity_images_guard
before insert or update or delete on public.planned_session_activity_images
for each row execute function public.guard_planned_session_activity_image();

create function public.reorder_planned_session_activity_images_v1(p_item_id uuid,p_image_ids uuid[])
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_cts uuid; v_expected uuid[];
begin
  if p_item_id is null or coalesce(cardinality(p_image_ids),0) not between 1 and 7
     or exists(select 1 from unnest(p_image_ids) id group by id having count(*)>1) then
    raise exception 'Orden de imágenes inválido' using errcode='22023';
  end if;
  perform 1 from public.planned_session_activity_images i where i.item_id=p_item_id for update;
  select array_agg(i.id order by i.id) into v_expected
    from public.planned_session_activity_images i where i.item_id=p_item_id;
  select i.club_team_season_id into v_cts from public.planned_session_activity_images i
    where i.item_id=p_item_id limit 1;
  if public.can_write_club_team_season(v_cts) is not true
     or v_expected is distinct from (select array_agg(id order by id) from unnest(p_image_ids) id) then
    raise exception 'Orden incompleto o no autorizado' using errcode='42501';
  end if;
  set constraints planned_session_activity_images_item_order_key deferred;
  update public.planned_session_activity_images i set sort_order=o.ordinality-1
    from unnest(p_image_ids) with ordinality o(id,ordinality)
    where i.id=o.id and i.item_id=p_item_id;
  return true;
end $$;
alter function public.reorder_planned_session_activity_images_v1(uuid,uuid[]) owner to postgres;
revoke all on function public.reorder_planned_session_activity_images_v1(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.reorder_planned_session_activity_images_v1(uuid,uuid[]) to authenticated;

alter table public.planned_session_activity_images enable row level security;
create policy planned_session_activity_images_select on public.planned_session_activity_images
  for select to authenticated using(public.can_read_club_team_season(club_team_season_id));
create policy planned_session_activity_images_insert on public.planned_session_activity_images
  for insert to authenticated with check(public.can_write_club_team_season(club_team_season_id));
create policy planned_session_activity_images_update on public.planned_session_activity_images
  for update to authenticated using(public.can_write_club_team_season(club_team_season_id))
  with check(public.can_write_club_team_season(club_team_season_id));
create policy planned_session_activity_images_delete on public.planned_session_activity_images
  for delete to authenticated using(public.can_write_club_team_season(club_team_season_id));

create policy planned_session_activity_storage_select on storage.objects for select to authenticated
using(bucket_id='planned-session-activity-images' and (
  exists(select 1 from public.planned_session_activity_images i where i.storage_path=name
    and public.can_read_club_team_season(i.club_team_season_id))
  or public.can_delete_planned_session_activity_storage(name)
));
create policy planned_session_activity_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='planned-session-activity-images' and exists(
  select 1 from public.planned_session_activity_images i where i.storage_path=name
    and i.uploader_user_id=auth.uid() and public.can_write_club_team_season(i.club_team_season_id)));
create policy planned_session_activity_storage_update on storage.objects for update to authenticated
using(bucket_id='planned-session-activity-images' and exists(
  select 1 from public.planned_session_activity_images i where i.storage_path=name
    and public.can_write_club_team_season(i.club_team_season_id)))
with check(bucket_id='planned-session-activity-images' and exists(
  select 1 from public.planned_session_activity_images i where i.storage_path=name
    and public.can_write_club_team_season(i.club_team_season_id)));
create policy planned_session_activity_storage_delete on storage.objects for delete to authenticated
using(bucket_id='planned-session-activity-images' and exists(
  select 1 from public.planned_session_activity_images i where i.storage_path=name
    and public.can_write_club_team_season(i.club_team_season_id)) or
  bucket_id='planned-session-activity-images' and exists(
  select 1 where public.can_delete_planned_session_activity_storage(name)));

revoke all on public.planned_session_activity_images from public,anon;
grant select,insert,update,delete on public.planned_session_activity_images to authenticated,service_role;
revoke all on function public.planned_session_activity_image_path_matches(text,uuid,uuid,uuid,uuid,uuid),
  public.guard_planned_session_activity_image() from public,anon,authenticated;


-- Extiende el inventario previamente validado sin olvidar dependencias añadidas
-- por Invitados, Realización, numeración operativa u otros módulos instalados.
create function public.planned_session_delete_contract_diagnostics_v1()
returns table(check_name text,ok boolean,detail text)
language sql stable security definer set search_path=pg_catalog as $diag$
with expected_targets(relation_name) as (
  select relation_name from public.planned_session_delete_target_manifest_v1
  union all select 'planned_session_activity_images'
), target_oids as (
  select relation_name,to_regclass('public.'||relation_name)::oid oid from expected_targets
), expected_fk as (
  select child_schema,child_name,parent_schema,parent_name,child_columns,parent_columns,
    delete_action,update_action,is_validated,is_deferrable
  from public.planned_session_delete_fk_manifest_v1
  union all select 'public','planned_session_activity_images','public','planned_session_items',
    array['item_id','session_id']::text[],array['id','session_id']::text[],'c','a',true,false
), actual_fk as (
  select child_ns.nspname,child.relname,parent_ns.nspname,parent.relname,
    array(select a.attname::text from unnest(c.conkey) with ordinality k(num,ord)
      join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord),
    array(select a.attname::text from unnest(c.confkey) with ordinality k(num,ord)
      join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord),
    c.confdeltype::text,c.confupdtype::text,c.convalidated,c.condeferrable
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class child on child.oid=c.conrelid
  join pg_catalog.pg_class parent on parent.oid=c.confrelid
  join pg_catalog.pg_namespace child_ns on child_ns.oid=child.relnamespace
  join pg_catalog.pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
  where c.contype='f' and c.confrelid in(select oid from target_oids)
), expected_trigger as (
  select relation_schema,relation_name,trigger_name,routine_schema,routine_name,identity_arguments,trigger_type,enabled,
    has_when,argument_count,security_definer,owner_name,config
  from public.planned_session_delete_trigger_manifest_v1
  union all select 'public','planned_session_activity_images','planned_session_activity_images_guard',
    'public','guard_planned_session_activity_image','',31,'O',false,0,true,'postgres',
    array['search_path=pg_catalog']::text[]
), actual_trigger as (
  select relation_ns.nspname,relation.relname,t.tgname,routine_ns.nspname,p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid),
    t.tgtype::integer,t.tgenabled::text,t.tgqual is not null,t.tgnargs::integer,
    p.prosecdef,owner.rolname,p.proconfig
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class relation on relation.oid=t.tgrelid
  join pg_catalog.pg_namespace relation_ns on relation_ns.oid=relation.relnamespace
  join pg_catalog.pg_proc p on p.oid=t.tgfoid
  join pg_catalog.pg_namespace routine_ns on routine_ns.oid=p.pronamespace
  join pg_catalog.pg_roles owner on owner.oid=p.proowner
  where not t.tgisinternal and (t.tgtype&8)<>0 and t.tgrelid in(select oid from target_oids)
), differences(kind,value) as (
  select 'fk_faltante',row_to_json(x)::text from (select * from expected_fk except select * from actual_fk) x
  union all select 'fk_no_revisada',row_to_json(x)::text from (select * from actual_fk except select * from expected_fk) x
  union all select 'trigger_faltante',row_to_json(x)::text from (select * from expected_trigger except select * from actual_trigger) x
  union all select 'trigger_no_revisado',row_to_json(x)::text from (select * from actual_trigger except select * from expected_trigger) x
), checks(check_name,ok,detail) as (
  select 'tablas_objetivo',not exists(select 1 from target_oids t
      left join pg_catalog.pg_class c on c.oid=t.oid
      where t.oid is null or c.relkind<>'r' or c.relhassubclass or not c.relrowsecurity),
    coalesce((select string_agg(relation_name,', ' order by relation_name) from target_oids t
      left join pg_catalog.pg_class c on c.oid=t.oid
      where t.oid is null or c.relkind<>'r' or c.relhassubclass or not c.relrowsecurity),'Tablas, RLS e herencia correctas')
  union all select 'reglas_delete',not exists(select 1 from pg_catalog.pg_rewrite r
      where r.ev_class in(select oid from target_oids) and r.ev_type='4'),
    'No se admiten reglas de reescritura DELETE en tablas objetivo'
  union all select 'foreign_keys',not exists(select 1 from differences where kind like 'fk_%'),
    coalesce((select string_agg(kind||': '||value,E'\n') from differences where kind like 'fk_%'),'Firmas FK exactas')
  union all select 'triggers_delete',not exists(select 1 from differences where kind like 'trigger_%'),
    coalesce((select string_agg(kind||': '||value,E'\n') from differences where kind like 'trigger_%'),'Firmas de triggers exactas')
  union all select 'cola_imagenes',exists(select 1 from pg_catalog.pg_proc
      where oid=to_regprocedure('public.guard_planned_session_activity_image()')
        and position('planned_session_activity_image_cleanup' in prosrc)>0),
    'El trigger de imágenes debe encolar storage_path antes del CASCADE'
  union all select 'rpc_eliminacion',exists(select 1 from pg_catalog.pg_proc
      where oid=to_regprocedure('public.delete_planned_session_v1(uuid,uuid,integer,boolean)')
        and position('planned_session_delete_contract_v1' in prosrc)>0
        and position('planned_session_items' in prosrc)>0),
    'La RPC valida el contrato y borra items; la FK de imágenes aplica CASCADE'
)
select check_name,ok,detail from checks;
$diag$;
alter function public.planned_session_delete_contract_diagnostics_v1() owner to postgres;
revoke all on function public.planned_session_delete_contract_diagnostics_v1() from public,anon,authenticated,service_role;

create or replace function public.planned_session_delete_contract_v1()
returns boolean language sql stable security definer set search_path=pg_catalog as $contract$
  select coalesce(bool_and(ok),false)
  from public.planned_session_delete_contract_diagnostics_v1();
$contract$;
alter function public.planned_session_delete_contract_v1() owner to postgres;
revoke all on function public.planned_session_delete_contract_v1() from public,anon,authenticated,service_role;

do $$
declare v_failed text;
begin
  select string_agg(check_name||': '||coalesce(detail,'sin detalle'),E'\n')
    into v_failed from public.planned_session_delete_contract_diagnostics_v1() where not ok;
  if v_failed is not null then
    raise exception 'El contrato ampliado de eliminación de sesiones no es válido:%',E'\n'||v_failed;
  end if;
end $$;

comment on table public.planned_session_activity_images is
  'Imágenes privadas de actividades libres de Sesiones; nunca modifica Biblioteca ni snapshots.';
comment on table public.planned_session_activity_image_cleanup is
  'Cola privada de rutas Storage: conserva la limpieza tras cascadas o reintentos de borrado de sesión.';
commit;
