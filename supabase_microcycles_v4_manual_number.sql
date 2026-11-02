-- PROPUESTA LOCAL: instalar manualmente tras revisar el preflight. No asigna MC históricos.
begin;

do $pre$
declare v_col pg_attribute%rowtype;
begin
  if to_regclass('public.planned_training_sessions') is null or
     to_regclass('public.planned_session_audit_events') is null or
     to_regclass('public.club_team_seasons') is null or
     to_regprocedure('public.can_write_club_team_season(uuid)') is null or
     to_regprocedure('public.planned_session_state(uuid)') is null then
    raise exception 'Microciclos V4: faltan dependencias de Sesiones';
  end if;
  select * into v_col from pg_catalog.pg_attribute
  where attrelid=to_regclass('public.planned_training_sessions')
    and attname='mc_number' and not attisdropped;
  if found and (v_col.atttypid<>'pg_catalog.int4'::regtype or v_col.attnotnull or
      v_col.atthasdef) then
    raise exception 'Microciclos V4: mc_number preexistente incompatible';
  end if;
  if exists(select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('save_planned_session_mc_v4','guard_planned_session_mc_v4')
      and p.oid not in (
        coalesce(to_regprocedure('public.save_planned_session_mc_v4(uuid,integer,integer)')::oid,'0'::oid),
        coalesce(to_regprocedure('public.guard_planned_session_mc_v4()')::oid,'0'::oid))) then
    raise exception 'Microciclos V4: sobrecarga de función no acreditada';
  end if;
end $pre$;

alter table public.planned_training_sessions
  add column if not exists mc_number integer;

do $constraint$
begin
  if not exists(select 1 from pg_catalog.pg_constraint
      where conrelid=to_regclass('public.planned_training_sessions')
        and conname='planned_sessions_mc_v4_check') then
    alter table public.planned_training_sessions add constraint planned_sessions_mc_v4_check
      check (mc_number is null or mc_number between 1 and 9999);
  elsif not exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.planned_training_sessions')
        and c.conname='planned_sessions_mc_v4_check' and c.contype='c' and c.convalidated
        and pg_catalog.lower(pg_catalog.regexp_replace(
          pg_catalog.pg_get_expr(c.conbin,c.conrelid),'[[:space:]()]','','g'))=
          'mc_numberisnullormc_number>=1andmc_number<=9999') then
    raise exception 'Microciclos V4: CHECK preexistente incompatible';
  end if;
end $constraint$;

create index if not exists planned_sessions_mc_v4_idx
  on public.planned_training_sessions(club_team_season_id,mc_number,session_date)
  where mc_number is not null;

create or replace function public.guard_planned_session_mc_v4()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_monday date;
begin
  if tg_op='DELETE' then return old; end if;
  if new.mc_number is null then return new; end if;
  if new.mc_number<1 or new.mc_number>9999 then
    raise exception 'Número MC fuera de rango' using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'nexo-mc-v4:'||new.club_team_season_id::text,0));
  v_monday:=pg_catalog.date_trunc('week',new.session_date::timestamp)::date;
  if exists(select 1 from public.planned_training_sessions other
      where other.club_team_season_id=new.club_team_season_id and other.id<>new.id
        and other.mc_number is not null
        and other.session_date between v_monday and v_monday+6
        and other.mc_number<>new.mc_number) then
    raise exception 'La semana ya tiene otro número MC' using errcode='23514';
  end if;
  if exists(select 1 from public.planned_training_sessions other
      where other.club_team_season_id=new.club_team_season_id and other.id<>new.id
        and other.mc_number=new.mc_number
        and other.session_date not between v_monday and v_monday+6) then
    raise exception 'El número MC pertenece a otra semana' using errcode='23505';
  end if;
  return new;
end $fn$;
alter function public.guard_planned_session_mc_v4() owner to postgres;
revoke all on function public.guard_planned_session_mc_v4() from public,anon,authenticated,service_role;

do $trigger$
begin
  if exists(select 1 from pg_catalog.pg_trigger where
      tgrelid=to_regclass('public.planned_training_sessions')
      and tgname='planned_sessions_mc_v4_guard' and not tgisinternal
      and (tgfoid<>to_regprocedure('public.guard_planned_session_mc_v4()')::oid
        or tgtype<>23 or
        pg_catalog.strpos(pg_catalog.pg_get_triggerdef(oid),
          'UPDATE OF session_date, mc_number')=0)) then
    raise exception 'Microciclos V4: trigger preexistente incompatible';
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where
      tgrelid=to_regclass('public.planned_training_sessions')
      and tgname='planned_sessions_mc_v4_guard' and not tgisinternal) then
    create trigger planned_sessions_mc_v4_guard
      before insert or update of session_date,mc_number
      on public.planned_training_sessions for each row
      execute function public.guard_planned_session_mc_v4();
  end if;
end $trigger$;

create or replace function public.save_planned_session_mc_v4(
  p_session_id uuid,p_expected_revision integer,p_mc_number integer)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_cts uuid; v_club uuid; v_status text;
  v_s public.planned_training_sessions%rowtype; v_actor uuid;
  v_before text; v_after text; v_revision integer;
begin
  if auth.uid() is null or p_session_id is null or p_expected_revision is null or
     (p_mc_number is not null and (p_mc_number<1 or p_mc_number>9999)) then
    raise exception 'Asignación MC no autorizada o inválida' using errcode='42501';
  end if;
  select s.club_team_season_id into v_cts from public.planned_training_sessions s
    where s.id=p_session_id;
  if v_cts is null or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Sesión no autorizada' using errcode='42501';
  end if;
  select cts.club_id,se.status into v_club,v_status
  from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=v_cts for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  select * into v_s from public.planned_training_sessions s
    where s.id=p_session_id for update;
  if not found or v_s.revision<>p_expected_revision then
    raise exception 'Revisión obsoleta' using errcode='40001';
  end if;
  select m.id into v_actor from public.club_memberships m
    where m.club_id=v_club and m.user_id=auth.uid() and m.is_active
      and m.role in ('owner','admin','staff')
    order by m.id limit 1 for share of m;
  if v_actor is null then
    raise exception 'Membresía no autorizada' using errcode='42501';
  end if;
  if exists(select 1 from public.club_memberships m
      where m.id=v_actor and m.role='staff') then
    perform 1 from public.club_team_season_permissions p
      where p.club_id=v_club and p.membership_id=v_actor
        and p.club_team_season_id=v_cts for share of p;
    if not found then raise exception 'Asignación revocada' using errcode='42501'; end if;
  end if;
  if v_s.mc_number is not distinct from p_mc_number then return v_s.revision; end if;
  v_before:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'session',public.planned_session_state(p_session_id),'mc_number',v_s.mc_number)::text);
  update public.planned_training_sessions
    set mc_number=p_mc_number,revision=revision+1
    where id=p_session_id returning revision into v_revision;
  v_after:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'session',public.planned_session_state(p_session_id),'mc_number',p_mc_number)::text);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
  values (p_session_id,v_revision,v_actor,
    case when v_s.planning_state='confirmed' then 'confirmed_saved' else 'draft_saved' end,
    array['microcycle'],v_before,v_after,
    pg_catalog.jsonb_build_object('previous_mc',v_s.mc_number,'next_mc',p_mc_number));
  return v_revision;
end $fn$;
alter function public.save_planned_session_mc_v4(uuid,integer,integer) owner to postgres;
revoke all on function public.save_planned_session_mc_v4(uuid,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.save_planned_session_mc_v4(uuid,integer,integer)
  to authenticated,service_role;

do $post$
begin
  if not exists(select 1 from pg_catalog.pg_attribute where
      attrelid=to_regclass('public.planned_training_sessions') and attname='mc_number'
      and atttypid='pg_catalog.int4'::regtype and not attisdropped) or
     not exists(select 1 from pg_catalog.pg_constraint where
      conrelid=to_regclass('public.planned_training_sessions')
      and conname='planned_sessions_mc_v4_check' and contype='c' and convalidated
      and pg_catalog.lower(pg_catalog.regexp_replace(
        pg_catalog.pg_get_expr(conbin,conrelid),'[[:space:]()]','','g'))=
        'mc_numberisnullormc_number>=1andmc_number<=9999') or
     not exists(select 1 from pg_catalog.pg_trigger where
      tgrelid=to_regclass('public.planned_training_sessions')
      and tgname='planned_sessions_mc_v4_guard' and not tgisinternal
      and tgenabled='O' and tgtype=23
      and tgfoid=to_regprocedure('public.guard_planned_session_mc_v4()')::oid
      and pg_catalog.strpos(pg_catalog.pg_get_triggerdef(oid),
        'UPDATE OF session_date, mc_number')>0) or
     exists(select 1 from public.planned_training_sessions
      where mc_number is not null and (mc_number<1 or mc_number>9999)) then
    raise exception 'Microciclos V4: postflight de estructura fallido';
  end if;
  if not exists(select 1 from pg_catalog.pg_index i
      join pg_catalog.pg_class c on c.oid=i.indexrelid
      where c.oid=to_regclass('public.planned_sessions_mc_v4_idx')
        and i.indrelid=to_regclass('public.planned_training_sessions')
        and i.indisvalid and i.indisready and not i.indisunique
        and i.indnkeyatts=3
        and pg_catalog.pg_get_indexdef(i.indexrelid,1,true)='club_team_season_id'
        and pg_catalog.pg_get_indexdef(i.indexrelid,2,true)='mc_number'
        and pg_catalog.pg_get_indexdef(i.indexrelid,3,true)='session_date'
        and pg_catalog.lower(pg_catalog.regexp_replace(
          pg_catalog.pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g'))=
          'mc_numberisnotnull') then
    raise exception 'Microciclos V4: índice inexistente o incompatible';
  end if;
  if exists(select 1 from public.planned_training_sessions s
      where s.mc_number is not null
        and exists(select 1 from public.planned_training_sessions other
          where other.id<>s.id and other.club_team_season_id=s.club_team_season_id
            and other.mc_number is not null and
            pg_catalog.date_trunc('week',other.session_date::timestamp)=
              pg_catalog.date_trunc('week',s.session_date::timestamp)
            and other.mc_number<>s.mc_number)) or
     exists(select 1 from public.planned_training_sessions s
      where s.mc_number is not null
        and exists(select 1 from public.planned_training_sessions other
          where other.id<>s.id and other.club_team_season_id=s.club_team_season_id
            and other.mc_number=s.mc_number and
            pg_catalog.date_trunc('week',other.session_date::timestamp)<>
              pg_catalog.date_trunc('week',s.session_date::timestamp))) then
    raise exception 'Microciclos V4: asignaciones preexistentes contradictorias';
  end if;
  if pg_catalog.has_function_privilege('anon',
      'public.save_planned_session_mc_v4(uuid,integer,integer)','EXECUTE') or
     exists(select 1 from pg_catalog.pg_proc p,
       lateral pg_catalog.aclexplode(coalesce(p.proacl,
         pg_catalog.acldefault('f',p.proowner))) acl
       where p.oid=to_regprocedure('public.save_planned_session_mc_v4(uuid,integer,integer)')
         and acl.grantee=0 and acl.privilege_type='EXECUTE') or
     not pg_catalog.has_function_privilege('authenticated',
      'public.save_planned_session_mc_v4(uuid,integer,integer)','EXECUTE') then
    raise exception 'Microciclos V4: privilegios EXECUTE incompatibles';
  end if;
end $post$;

commit;
