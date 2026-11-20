-- NEXO CLUB · Sesiones · imágenes privadas de actividades libres V1.
-- Ejecutar una sola vez en Supabase SQL Editor. No migra ni modifica sesiones existentes.
begin;

do $$
begin
  if to_regclass('public.planned_session_items') is null
     or to_regprocedure('public.can_read_club_team_season(uuid)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Imágenes de actividades requiere Sesiones 03C y helpers CTS instalados';
  end if;
  if to_regclass('public.planned_session_activity_images') is not null then
    raise exception 'Imágenes de actividades V1 ya está instalada; no repetir la migración';
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
  constraint planned_session_activity_images_order_check check(sort_order between 0 and 7)
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
create policy planned_session_activity_cleanup_select on public.planned_session_activity_image_cleanup
  for select to authenticated using(public.can_write_club_team_season(club_team_season_id));
create policy planned_session_activity_cleanup_delete on public.planned_session_activity_image_cleanup
  for delete to authenticated using(public.can_write_club_team_season(club_team_season_id));
revoke all on public.planned_session_activity_image_cleanup from public,anon;
grant select,delete on public.planned_session_activity_image_cleanup to authenticated,service_role;

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
  select * into v_item from public.planned_session_items where id=new.item_id and session_id=new.session_id;
  if v_session.id is null or v_item.id is null or v_item.kind is distinct from 'free'
     or v_session.club_team_season_id is distinct from new.club_team_season_id then
    raise exception 'La imagen debe pertenecer a una actividad libre de la sesión indicada' using errcode='23514';
  end if;
  if auth.uid() is null or public.can_write_club_team_season(new.club_team_season_id) is not true then
    raise exception 'Imagen de actividad no autorizada' using errcode='42501';
  end if;
  if new.club_id is distinct from (select club_id from public.club_team_seasons where id=new.club_team_season_id)
     or new.uploader_user_id is distinct from auth.uid()
     or public.planned_session_activity_image_path_matches(new.storage_path,new.club_id,new.session_id,new.item_id,new.uploader_user_id,new.id) is not true then
    raise exception 'Identidad o ruta de imagen incoherente' using errcode='23514';
  end if;
  if tg_op='UPDATE' and (new.id,new.session_id,new.item_id,new.club_team_season_id,new.club_id,
      new.uploader_user_id,new.storage_path,new.original_name,new.mime_type,new.size_bytes,new.created_at)
      is distinct from (old.id,old.session_id,old.item_id,old.club_team_season_id,old.club_id,
      old.uploader_user_id,old.storage_path,old.original_name,old.mime_type,old.size_bytes,old.created_at) then
    raise exception 'Solo puede modificarse el orden de una imagen' using errcode='23514';
  end if;
  if tg_op='INSERT' and (select count(*) from public.planned_session_activity_images where item_id=new.item_id)>=8 then
    raise exception 'Cada actividad admite como máximo ocho imágenes' using errcode='23514';
  end if;
  new.updated_at:=now(); return new;
end $$;
alter function public.guard_planned_session_activity_image() owner to postgres;

create trigger planned_session_activity_images_guard
before insert or update or delete on public.planned_session_activity_images
for each row execute function public.guard_planned_session_activity_image();

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
using(bucket_id='planned-session-activity-images' and exists(
  select 1 from public.planned_session_activity_images i where i.storage_path=name
    and public.can_read_club_team_season(i.club_team_season_id)));
create policy planned_session_activity_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='planned-session-activity-images' and exists(
  select 1 from public.planned_session_activity_images i where i.storage_path=name
    and i.uploader_user_id=auth.uid() and public.can_write_club_team_season(i.club_team_season_id)));
create policy planned_session_activity_storage_delete on storage.objects for delete to authenticated
using(bucket_id='planned-session-activity-images' and exists(
  select 1 from public.planned_session_activity_images i where i.storage_path=name
    and public.can_write_club_team_season(i.club_team_season_id)) or
  bucket_id='planned-session-activity-images' and exists(
  select 1 from public.planned_session_activity_image_cleanup q where q.storage_path=name
    and public.can_write_club_team_season(q.club_team_season_id)));

revoke all on public.planned_session_activity_images from public,anon;
grant select,insert,update,delete on public.planned_session_activity_images to authenticated,service_role;
revoke all on function public.planned_session_activity_image_path_matches(text,uuid,uuid,uuid,uuid,uuid),
  public.guard_planned_session_activity_image() from public,anon,authenticated;

-- La RPC de borrado mantiene su lógica y reconoce la nueva FK y su guarda.
create or replace function public.planned_session_delete_contract_v1()
returns boolean language sql stable security definer set search_path=pg_catalog as $fn$
  with expected_fk(child,parent,child_columns,parent_columns,delete_action) as (values
    ('planned_session_slots','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_items','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_items','planned_session_slots',array['slot_id','session_id'],array['id','session_id'],'r'),
    ('planned_session_player_roster','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_player_availability','planned_session_player_roster',array['session_id','player_id'],array['session_id','player_id'],'r'),
    ('planned_session_audit_events','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_date_change_authorizations','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_distributions','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_board_seed_v11','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_exercise_dimensions_v12','planned_session_slots',array['slot_id','session_id'],array['id','session_id'],'c'),
    ('planned_session_activity_images','planned_session_items',array['item_id','session_id'],array['id','session_id'],'c')
  ), target_tables as (
    select to_regclass('public.'||child)::oid oid from expected_fk
    union select to_regclass('public.planned_training_sessions')::oid
  ), actual_fk as (
    select c.*,array(select a.attname::text from unnest(c.conkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord) child_columns,
      array(select a.attname::text from unnest(c.confkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord) parent_columns
    from pg_constraint c where c.contype='f' and c.confrelid in(select oid from target_tables)
  ), expected_trigger(relation,name,routine) as (values
    ('planned_training_sessions','planned_sessions_guard','guard_planned_session_row()'),
    ('planned_session_slots','planned_slots_guard','guard_planned_session_child()'),
    ('planned_session_items','planned_items_guard','guard_planned_session_child()'),
    ('planned_session_player_roster','planned_session_player_roster_guard','guard_planned_session_player_roster()'),
    ('planned_session_player_availability','planned_session_player_availability_guard','guard_planned_session_player_availability()'),
    ('planned_session_audit_events','planned_audit_guard','guard_planned_session_audit()'),
    ('planned_session_activity_images','planned_session_activity_images_guard','guard_planned_session_activity_image()')
  ), actual_trigger as (
    select * from pg_trigger where not tgisinternal and (tgtype&8)<>0 and tgrelid in(select oid from target_tables)
  )
  select (select count(*)=11 from target_tables)
    and (select count(*)=11 from pg_class c where c.oid in(select oid from target_tables)
      and c.relkind='r' and not c.relhassubclass and c.relrowsecurity)
    and not exists(select 1 from pg_rewrite r where r.ev_class in(select oid from target_tables) and r.ev_type='4')
    and (select count(*)=11 from actual_fk)
    and not exists(select 1 from expected_fk e where not exists(select 1 from actual_fk c
      where c.conrelid=to_regclass('public.'||e.child) and c.confrelid=to_regclass('public.'||e.parent)
        and c.child_columns=e.child_columns and c.parent_columns=e.parent_columns
        and c.confdeltype::text=e.delete_action and c.confupdtype='a' and c.convalidated and not c.condeferrable))
    and (select count(*)=7 from actual_trigger)
    and not exists(select 1 from expected_trigger e where not exists(select 1 from actual_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid=to_regclass('public.'||e.relation) and t.tgname=e.name
        and t.tgfoid=to_regprocedure('public.'||e.routine) and t.tgtype=31 and t.tgenabled in('O','A')
        and t.tgqual is null and t.tgnargs=0 and p.prosecdef and p.proowner='postgres'::regrole
        and p.proconfig=array['search_path=pg_catalog']::text[]));
$fn$;
alter function public.planned_session_delete_contract_v1() owner to postgres;
revoke all on function public.planned_session_delete_contract_v1() from public,anon,authenticated,service_role;

comment on table public.planned_session_activity_images is
  'Imágenes privadas de actividades libres de Sesiones; nunca modifica Biblioteca ni snapshots.';
comment on table public.planned_session_activity_image_cleanup is
  'Cola privada de rutas Storage: conserva la limpieza tras cascadas o reintentos de borrado de sesión.';
commit;
