begin;

-- Sesiones V1.2. No cambia las RPC 03A, 03C, 05 ni la biblioteca.
do $pre$
begin
  if to_regclass('public.planned_session_slots') is null or
     to_regclass('public.planned_training_sessions') is null or
     to_regclass('public.planned_session_distributions') is null or
     to_regclass('public.planned_session_board_seed_v11') is null or
     to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is null or
     to_regprocedure('public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)') is null or
     to_regprocedure('public.can_read_club_team_season(uuid)') is null then
    raise exception 'Sesiones V1.2: falta una dependencia';
  end if;
  if to_regclass('public.planned_session_exercise_dimensions_v12') is not null and
     obj_description(to_regclass('public.planned_session_exercise_dimensions_v12'),'pg_class')
       is distinct from 'NEXO Sesiones V1.2: exercise dimensions' then
    raise exception 'Sesiones V1.2: tabla preexistente incompatible';
  end if;
  if to_regprocedure('public.save_planned_session_exercise_dimensions_v12(uuid,integer,text,jsonb,jsonb,jsonb)') is not null and
     obj_description(to_regprocedure('public.save_planned_session_exercise_dimensions_v12(uuid,integer,text,jsonb,jsonb,jsonb)'),'pg_proc')
       is distinct from 'NEXO Sesiones V1.2: save exercise dimensions and boards' then
    raise exception 'Sesiones V1.2: RPC preexistente incompatible';
  end if;
end $pre$;

create table if not exists public.planned_session_exercise_dimensions_v12 (
  session_id uuid not null,
  slot_id uuid not null,
  length_m numeric(6,2) not null,
  width_m numeric(6,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_session_exercise_dimensions_v12_pkey primary key (session_id,slot_id),
  constraint planned_session_exercise_dimensions_v12_slot_fk
    foreign key (slot_id,session_id) references public.planned_session_slots(id,session_id)
    on delete cascade,
  constraint planned_session_exercise_dimensions_v12_positive_ck
    check (length_m>0 and length_m<=500 and width_m>0 and width_m<=500)
);
comment on table public.planned_session_exercise_dimensions_v12 is
  'NEXO Sesiones V1.2: exercise dimensions';
alter table public.planned_session_exercise_dimensions_v12 owner to postgres;
alter table public.planned_session_exercise_dimensions_v12 enable row level security;
revoke all on table public.planned_session_exercise_dimensions_v12
  from public,anon,authenticated,service_role;
grant select on table public.planned_session_exercise_dimensions_v12 to authenticated,service_role;
do $policy$
begin
  if not exists (select 1 from pg_policy where
    polrelid='public.planned_session_exercise_dimensions_v12'::regclass and
    polname='planned_session_exercise_dimensions_v12_read') then
    create policy planned_session_exercise_dimensions_v12_read
      on public.planned_session_exercise_dimensions_v12 for select to authenticated
      using (exists (select 1 from public.planned_training_sessions s
        where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
end $policy$;
alter policy planned_session_exercise_dimensions_v12_read
  on public.planned_session_exercise_dimensions_v12 to authenticated
  using (exists (select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));

create or replace function public.save_planned_session_exercise_dimensions_v12(
  p_session_id uuid,p_expected_revision integer,p_formation_key text,
  p_player_layout jsonb,p_space_zones jsonb,p_dimensions jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ctx record; v_item jsonb; v_id uuid; v_seen uuid[]:='{}'::uuid[];
  v_length numeric; v_width numeric; v_field_length numeric; v_field_width numeric;
  v_zone jsonb; v_old jsonb; v_new jsonb; v_revision integer;
begin
  if auth.uid() is null or jsonb_typeof(p_dimensions) is distinct from 'array' or
     octet_length(p_dimensions::text)>65536 or jsonb_array_length(p_dimensions)>100 or
     jsonb_typeof(p_space_zones) is distinct from 'array' then
    raise exception 'Medidas de ejercicios invalidas' using errcode='22023';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  select field_length_m,field_width_m into v_field_length,v_field_width
    from public.planned_session_board_seed_v11 where session_id=p_session_id for share;
  for v_item in select value from jsonb_array_elements(p_dimensions) loop
    if jsonb_typeof(v_item) is distinct from 'object' or
       not (v_item ?& array['slot_id','length_m','width_m']) or
       (select count(*) from jsonb_object_keys(v_item))<>3 or
       jsonb_typeof(v_item->'slot_id') is distinct from 'string' or
       jsonb_typeof(v_item->'length_m') is distinct from 'number' or
       jsonb_typeof(v_item->'width_m') is distinct from 'number' then
      raise exception 'Medidas de ejercicio invalidas' using errcode='22023';
    end if;
    v_id:=(v_item->>'slot_id')::uuid;
    v_length:=(v_item->>'length_m')::numeric;
    v_width:=(v_item->>'width_m')::numeric;
    if v_id=any(v_seen) or v_length<=0 or v_length>500 or
       v_width<=0 or v_width>500 or v_length<>round(v_length,2) or
       v_width<>round(v_width,2) or not exists (
         select 1 from public.planned_session_slots sl
         where sl.id=v_id and sl.session_id=p_session_id) then
      raise exception 'Ejercicio ajeno, duplicado o con medidas invalidas' using errcode='23514';
    end if;
    v_seen:=array_append(v_seen,v_id);
    if v_field_length is not null and v_field_width is not null then
      select z.value into v_zone from jsonb_array_elements(p_space_zones) as z(value)
        where z.value->>'slot_id'=v_id::text;
      if v_length>v_field_length or v_width>v_field_width or
         v_zone is null or (v_zone->>'provisional')::boolean is distinct from false or
         abs((v_zone->>'h')::numeric - v_length/v_field_length*100)>0.02 or
         abs((v_zone->>'w')::numeric - v_width/v_field_width*100)>0.02 then
        raise exception 'Medidas y zona del ejercicio no coinciden con el campo'
          using errcode='23514';
      end if;
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('slot_id',d.slot_id,
    'length_m',d.length_m,'width_m',d.width_m) order by d.slot_id),'[]'::jsonb)
    into v_old from public.planned_session_exercise_dimensions_v12 d
    where d.session_id=p_session_id;
  select coalesce(jsonb_agg(value order by value->>'slot_id'),'[]'::jsonb)
    into v_new from jsonb_array_elements(p_dimensions) as e(value);
  v_revision:=public.save_planned_session_distributions_05(p_session_id,p_expected_revision,
    p_formation_key,p_player_layout,p_space_zones);
  if v_old=v_new then return v_revision; end if;
  delete from public.planned_session_exercise_dimensions_v12 d
    where d.session_id=p_session_id and not (d.slot_id=any(v_seen));
  for v_item in select value from jsonb_array_elements(v_new) loop
    insert into public.planned_session_exercise_dimensions_v12
      (session_id,slot_id,length_m,width_m)
    values (p_session_id,(v_item->>'slot_id')::uuid,
      (v_item->>'length_m')::numeric,(v_item->>'width_m')::numeric)
    on conflict (session_id,slot_id) do update set
      length_m=excluded.length_m,width_m=excluded.width_m,updated_at=now();
  end loop;
  update public.planned_training_sessions set revision=revision+1
    where id=p_session_id returning revision into v_revision;
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
  values (p_session_id,v_revision,v_ctx.actor_id,
    case when v_ctx.planning_state='confirmed' then 'confirmed_saved' else 'draft_saved' end,
    array['distributions'],md5(v_old::text),md5(v_new::text),
    jsonb_build_object('operation','save_exercise_dimensions_v12',
      'exercises',jsonb_array_length(v_new)));
  return v_revision;
end $fn$;
comment on function public.save_planned_session_exercise_dimensions_v12(uuid,integer,text,jsonb,jsonb,jsonb)
  is 'NEXO Sesiones V1.2: save exercise dimensions and boards';
alter function public.save_planned_session_exercise_dimensions_v12(uuid,integer,text,jsonb,jsonb,jsonb)
  owner to postgres;
revoke all on function public.save_planned_session_exercise_dimensions_v12(uuid,integer,text,jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.save_planned_session_exercise_dimensions_v12(uuid,integer,text,jsonb,jsonb,jsonb)
  to authenticated;

do $post$
begin
  if not (select relrowsecurity from pg_class where oid='public.planned_session_exercise_dimensions_v12'::regclass) or
     (select count(*) from pg_constraint where
      conrelid='public.planned_session_exercise_dimensions_v12'::regclass and convalidated)<>3 or
     has_table_privilege('authenticated','public.planned_session_exercise_dimensions_v12','INSERT,UPDATE,DELETE') or
     has_function_privilege('anon',
      'public.save_planned_session_exercise_dimensions_v12(uuid,integer,text,jsonb,jsonb,jsonb)','EXECUTE') or
     not has_function_privilege('authenticated',
      'public.save_planned_session_exercise_dimensions_v12(uuid,integer,text,jsonb,jsonb,jsonb)','EXECUTE') then
    raise exception 'Sesiones V1.2: postflight fallido';
  end if;
end $post$;
commit;
