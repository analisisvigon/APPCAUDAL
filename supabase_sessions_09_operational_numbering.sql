-- PROPUESTA MANUAL. NO EJECUTAR AUTOMATICAMENTE.
-- Sesiones 09: secuencia operativa cronologica sin renumerar sesiones realizadas.
-- Requiere 03A/03C, 04B, ciclo de vida 2C y Sesiones 07 verificadas.
begin;
set local search_path = pg_catalog;
set local lock_timeout = '5s';

do $pre$
declare v_state_check text;
begin
  if to_regclass('public.planned_training_sessions') is null
     or to_regclass('public.planned_session_number_state') is null
     or to_regclass('public.planned_session_audit_events') is null
     or to_regclass('public.planned_session_realizations') is null
     or obj_description(to_regclass('public.planned_session_realizations'),'pg_class')
       is distinct from 'NEXO Sesiones 07: explicit session realization'
     or to_regclass('public.club_team_seasons') is null
     or to_regclass('public.club_seasons') is null
     or not exists(select 1 from pg_constraint where conrelid=
       to_regclass('public.planned_training_sessions')
       and conname='planned_sessions_state_check' and contype='c' and convalidated)
     or not exists(select 1 from pg_attribute where attrelid=
       to_regclass('public.planned_training_sessions')
       and attname='cancelled_at' and atttypid='timestamptz'::regtype and not attisdropped)
     or not exists(select 1 from pg_attribute where attrelid=
       to_regclass('public.planned_training_sessions')
       and attname='retired_at' and atttypid='timestamptz'::regtype and not attisdropped)
     or to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is null
     or to_regprocedure('public.planned_session_04b_state(uuid)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null
     or to_regprocedure('public.guard_planned_session_lifecycle_2c()') is null
     or obj_description(to_regprocedure('public.planned_session_04b_lock(uuid,integer)'),'pg_proc')
       is distinct from 'APPCAUDAL Sesiones 04B: planned_session_04b_lock'
     or obj_description(to_regprocedure('public.guard_planned_session_lifecycle_2c()'),'pg_proc')
       is distinct from 'NEXO CLUB Sesiones 2C: guard_planned_session_lifecycle_2c'
     or not exists(select 1 from pg_trigger where tgrelid=
       to_regclass('public.planned_training_sessions')
       and tgname='planned_sessions_lifecycle_2c_guard'
       and tgfoid=to_regprocedure('public.guard_planned_session_lifecycle_2c()')
       and tgenabled='O') then
    raise exception 'Sesiones 09: faltan prerrequisitos 03A/03C/04B/2C/07';
  end if;
  if not exists(select 1 from pg_index i where i.indexrelid=
      to_regclass('public.planned_sessions_number_uidx')
      and i.indrelid=to_regclass('public.planned_training_sessions')
      and i.indisunique and i.indisvalid
      and lower(pg_get_indexdef(i.indexrelid)) like '%(club_team_season_id, session_number)%'
      and lower(pg_get_indexdef(i.indexrelid)) like '%where (session_number is not null)%') then
    raise exception 'Sesiones 09: falta el indice unico parcial de numeracion 03A';
  end if;
  select regexp_replace(replace(lower(pg_get_constraintdef(c.oid)),'::text',''),
      '[[:space:]()]','','g') into v_state_check
    from pg_constraint c
    where c.conrelid=to_regclass('public.planned_training_sessions')
      and c.conname='planned_sessions_state_check' and c.contype='c' and c.convalidated;
  if v_state_check is distinct from
      'checkplanning_state=''draft''andsession_numberisnullandconfirmed_atisnullorplanning_state=''confirmed''andsession_numberisnotnullandconfirmed_atisnotnullandnullif(btrim(team_name_snapshot),'''')isnotnullandnullif(btrim(season_label_snapshot),'''')isnotnull' then
    raise exception 'Sesiones 09: la restriccion de estado no coincide con 03A';
  end if;
  if to_regclass('public.planned_session_number_reindex_authorizations_v1') is not null
     and obj_description(to_regclass('public.planned_session_number_reindex_authorizations_v1'),'pg_class')
       is distinct from 'NEXO Sesiones 09: private token for retired-session number cleanup' then
    raise exception 'Sesiones 09: nombre de autorizacion de numeracion ocupado';
  end if;
  if to_regprocedure('public.set_planned_session_operational_number_v1(uuid,integer,text)') is not null
     and obj_description(to_regprocedure(
       'public.set_planned_session_operational_number_v1(uuid,integer,text)'),'pg_proc')
       is distinct from 'NEXO Sesiones 09: audited operational number change' then
    raise exception 'Sesiones 09: helper de numeracion incompatible';
  end if;
  if to_regprocedure('public.reconcile_planned_session_operational_numbers_v1(uuid,text)') is not null
     and obj_description(to_regprocedure(
       'public.reconcile_planned_session_operational_numbers_v1(uuid,text)'),'pg_proc')
       is distinct from 'NEXO Sesiones 09: chronological session numbering' then
    raise exception 'Sesiones 09: reconciliador de numeracion incompatible';
  end if;
  if to_regprocedure('public.reconcile_planned_session_numbering_v1(uuid)') is not null
     and obj_description(to_regprocedure(
       'public.reconcile_planned_session_numbering_v1(uuid)'),'pg_proc')
       is distinct from 'NEXO Sesiones 09: authorized numbering reconciliation' then
    raise exception 'Sesiones 09: RPC de numeracion incompatible';
  end if;
  if to_regprocedure('public.planned_session_numbering_ready_v1()') is not null
     and obj_description(to_regprocedure(
       'public.planned_session_numbering_ready_v1()'),'pg_proc')
       is distinct from 'NEXO Sesiones 09: operational numbering readiness' then
    raise exception 'Sesiones 09: verificador de numeracion incompatible';
  end if;
  if to_regprocedure('public.guard_planned_session_operational_numbering_v1()') is not null
     and obj_description(to_regprocedure(
       'public.guard_planned_session_operational_numbering_v1()'),'pg_proc')
       is distinct from 'NEXO Sesiones 09: defer reconciliation until transaction commit' then
    raise exception 'Sesiones 09: trigger de numeracion incompatible';
  end if;
  if to_regprocedure('public.seed_planned_session_number_before_reactivate_v1()') is not null
     and obj_description(to_regprocedure(
       'public.seed_planned_session_number_before_reactivate_v1()'),'pg_proc')
       is distinct from 'NEXO Sesiones 09: supply a temporary number before reactivation' then
    raise exception 'Sesiones 09: helper de reactivacion incompatible';
  end if;
  if exists(select 1 from pg_trigger where tgrelid=
      to_regclass('public.planned_training_sessions')
      and tgname='planned_sessions_operational_numbering_v1'
      and tgfoid is distinct from
        to_regprocedure('public.guard_planned_session_operational_numbering_v1()')) then
    raise exception 'Sesiones 09: trigger de numeracion preexistente incompatible';
  end if;
  if exists(select 1 from pg_trigger where tgrelid=
      to_regclass('public.planned_training_sessions')
      and tgname='planned_sessions_reactivate_number_v1'
      and tgfoid is distinct from
        to_regprocedure('public.seed_planned_session_number_before_reactivate_v1()')) then
    raise exception 'Sesiones 09: trigger de reactivacion preexistente incompatible';
  end if;
end
$pre$;

create table if not exists public.planned_session_number_reindex_authorizations_v1 (
  session_id uuid primary key references public.planned_training_sessions(id) on delete cascade,
  expected_revision integer not null check (expected_revision>0),
  expected_number integer not null check (expected_number>0),
  actor_membership_id uuid not null references public.club_memberships(id) on delete restrict,
  transaction_id bigint not null
);
comment on table public.planned_session_number_reindex_authorizations_v1 is
  'NEXO Sesiones 09: private token for retired-session number cleanup';
alter table public.planned_session_number_reindex_authorizations_v1 owner to postgres;
alter table public.planned_session_number_reindex_authorizations_v1 enable row level security;
revoke all on table public.planned_session_number_reindex_authorizations_v1
  from public,anon,authenticated,service_role;

alter table public.planned_training_sessions
  drop constraint planned_sessions_state_check;
alter table public.planned_training_sessions
  add constraint planned_sessions_state_check check (
    (planning_state='draft' and session_number is null and confirmed_at is null)
    or (planning_state='confirmed' and confirmed_at is not null
        and nullif(btrim(team_name_snapshot),'') is not null
        and nullif(btrim(season_label_snapshot),'') is not null
        and (session_number is not null or cancelled_at is not null or retired_at is not null))
  );

-- Retired sessions normally reject every update. Permit only this exact,
-- transaction-bound number release, authorized by the private helper below.
create or replace function public.guard_planned_session_lifecycle_2c()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  if old.retired_at is not null then
    if new.session_number is null and new.session_number is distinct from old.session_number
       and new.revision=old.revision+1
       and (to_jsonb(new)-array['session_number','revision','updated_at'])
         is not distinct from (to_jsonb(old)-array['session_number','revision','updated_at'])
       and exists(select 1
         from public.planned_session_number_reindex_authorizations_v1 a
         where a.session_id=old.id
           and a.expected_revision=old.revision
           and a.expected_number=old.session_number
           and a.actor_membership_id in (
             select m.id from public.club_memberships m
             where m.user_id=auth.uid() and m.is_active
               and m.role in ('owner','admin','staff'))
           and a.transaction_id=txid_current()) then
      return new;
    end if;
    raise exception 'Sesión retirada: edición bloqueada' using errcode='42501';
  end if;
  return new;
end $fn$;
comment on function public.guard_planned_session_lifecycle_2c() is
  'NEXO CLUB Sesiones 2C: guard_planned_session_lifecycle_2c';
alter function public.guard_planned_session_lifecycle_2c() owner to postgres;
revoke all on function public.guard_planned_session_lifecycle_2c()
  from public,anon,authenticated,service_role;

create or replace function public.seed_planned_session_number_before_reactivate_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_number integer:=1;
begin
  if old.cancelled_at is not null and new.cancelled_at is null
     and new.session_number is null then
    if exists(select 1 from public.planned_session_realizations r
        where r.session_id=old.id) then
      raise exception 'Una sesion realizada no puede reactivarse sin su numero historico'
        using errcode='23514';
    end if;
    if auth.uid() is null or
       public.can_write_club_team_season(new.club_team_season_id) is not true then
      raise exception 'Reactivacion de sesion no autorizada' using errcode='42501';
    end if;
    while exists(select 1 from public.planned_training_sessions s
        where s.club_team_season_id=new.club_team_season_id
          and s.session_number=v_number and s.id<>new.id) loop
      if v_number=2147483647 then
        raise exception 'Secuencia de sesiones agotada' using errcode='22003';
      end if;
      v_number:=v_number+1;
    end loop;
    new.session_number:=v_number;
  end if;
  return new;
end $fn$;
comment on function public.seed_planned_session_number_before_reactivate_v1() is
  'NEXO Sesiones 09: supply a temporary number before reactivation';
alter function public.seed_planned_session_number_before_reactivate_v1() owner to postgres;
revoke all on function public.seed_planned_session_number_before_reactivate_v1()
  from public,anon,authenticated,service_role;
drop trigger if exists planned_sessions_reactivate_number_v1
  on public.planned_training_sessions;
create trigger planned_sessions_reactivate_number_v1
  before update of cancelled_at on public.planned_training_sessions
  for each row execute function public.seed_planned_session_number_before_reactivate_v1();

create or replace function public.set_planned_session_operational_number_v1(
  p_session_id uuid,p_new_number integer,p_reason text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_session public.planned_training_sessions%rowtype;
  v_ctx record;
  v_before jsonb;
  v_after jsonb;
  v_revision integer;
begin
  if p_session_id is null or (p_new_number is not null and p_new_number<1)
     or p_reason is null or p_reason not in ('inactive','chronological','temporary') then
    raise exception 'Cambio de numeracion invalido' using errcode='22023';
  end if;
  select * into v_session from public.planned_training_sessions s
    where s.id=p_session_id;
  if not found then return false; end if;
  if v_session.session_number is not distinct from p_new_number then return false; end if;
  select * into v_ctx from public.planned_session_04b_lock(
    p_session_id,v_session.revision);
  if exists(select 1 from public.planned_session_realizations r
      where r.session_id=p_session_id) then
    raise exception 'La numeracion realizada es historica e inmutable'
      using errcode='42501';
  end if;
  if v_session.retired_at is not null and p_new_number is not null then
    raise exception 'Una sesion retirada no puede volver a la secuencia operativa'
      using errcode='42501';
  end if;
  v_before:=public.planned_session_04b_state(p_session_id);
  if v_session.retired_at is not null then
    insert into public.planned_session_number_reindex_authorizations_v1
      (session_id,expected_revision,expected_number,actor_membership_id,transaction_id)
      values (p_session_id,v_session.revision,v_session.session_number,
        v_ctx.actor_id,txid_current());
  end if;
  update public.planned_training_sessions
    set session_number=p_new_number,revision=revision+1
    where id=p_session_id returning revision into v_revision;
  if not found then raise exception 'No se pudo actualizar la numeracion'; end if;
  delete from public.planned_session_number_reindex_authorizations_v1
    where session_id=p_session_id;
  v_after:=public.planned_session_04b_state(p_session_id);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
    values (p_session_id,v_revision,v_ctx.actor_id,'renumbered',array['number'],
      md5(v_before::text),md5(v_after::text),
      jsonb_build_object('operation','operational_numbering_09',
        'from',v_session.session_number,'to',p_new_number,'reason',p_reason));
  return true;
end $fn$;
comment on function public.set_planned_session_operational_number_v1(uuid,integer,text) is
  'NEXO Sesiones 09: audited operational number change';
alter function public.set_planned_session_operational_number_v1(uuid,integer,text) owner to postgres;
revoke all on function public.set_planned_session_operational_number_v1(uuid,integer,text)
  from public,anon,authenticated,service_role;

create or replace function public.reconcile_planned_session_operational_numbers_v1(
  p_club_team_season_id uuid,p_reason text default 'chronological')
returns boolean language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_status text;
  v_actor uuid;
  v_session record;
  v_ids uuid[]:=array[]::uuid[];
  v_current integer[]:=array[]::integer[];
  v_target integer[]:=array[]::integer[];
  v_highest integer;
  v_maximum integer;
  v_next integer:=1;
  v_temporary integer;
  v_index integer;
  v_cycle_index integer;
  v_pending boolean;
  v_progress boolean;
  v_changed boolean:=false;
begin
  if auth.uid() is null or p_club_team_season_id is null or p_reason is null
     or p_reason not in ('bootstrap','chronological','confirm','cancel','reactivate','retire','delete','date') then
    raise exception 'Reconciliacion de numeracion no autorizada'
      using errcode='42501';
  end if;
  if public.can_write_club_team_season(p_club_team_season_id) is not true then
    return false;
  end if;
  select se.status into v_status
    from public.club_team_seasons cts
    join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
    where cts.id=p_club_team_season_id for update of se;
  if not found or v_status is distinct from 'open'
     or public.can_write_club_team_season(p_club_team_season_id) is not true then
    return false;
  end if;
  select m.id into v_actor
    from public.club_memberships m
    join public.club_team_seasons cts on cts.club_id=m.club_id
    where cts.id=p_club_team_season_id and m.user_id=auth.uid() and m.is_active
      and m.role in ('owner','admin','staff')
    order by m.id limit 1 for share of m;
  if v_actor is null then return false; end if;
  perform 1 from public.planned_training_sessions s
    where s.club_team_season_id=p_club_team_season_id
    order by s.id for update;

  for v_session in
    select s.id,s.session_number
    from public.planned_training_sessions s
    where s.club_team_season_id=p_club_team_season_id
      and s.session_number is not null
      and not exists(select 1 from public.planned_session_realizations r
        where r.session_id=s.id)
      and (s.planning_state<>'confirmed' or s.cancelled_at is not null
        or s.retired_at is not null)
    order by s.id
  loop
    v_changed:=public.set_planned_session_operational_number_v1(
      v_session.id,null,'inactive') or v_changed;
  end loop;

  select coalesce(array_agg(s.id order by s.session_date,s.starts_at nulls first,s.id),
      array[]::uuid[]),
    coalesce(array_agg(s.session_number order by s.session_date,s.starts_at nulls first,s.id),
      array[]::integer[])
    into v_ids,v_current
    from public.planned_training_sessions s
    where s.club_team_season_id=p_club_team_season_id
      and s.planning_state='confirmed' and s.cancelled_at is null
      and s.retired_at is null
      and not exists(select 1 from public.planned_session_realizations r
        where r.session_id=s.id);

  if cardinality(v_ids)>0 then
    for v_index in 1..cardinality(v_ids) loop
      while exists(select 1
        from public.planned_training_sessions pinned
        join public.planned_session_realizations r on r.session_id=pinned.id
        where pinned.club_team_season_id=p_club_team_season_id
          and pinned.session_number=v_next) loop
        if v_next=2147483647 then
          raise exception 'Secuencia de sesiones agotada' using errcode='22003';
        end if;
        v_next:=v_next+1;
      end loop;
      v_target:=array_append(v_target,v_next);
      if v_index<cardinality(v_ids) then
        if v_next=2147483647 then
          raise exception 'Secuencia de sesiones agotada' using errcode='22003';
        end if;
        v_next:=v_next+1;
      end if;
    end loop;
  end if;

  loop
    v_pending:=false;
    v_progress:=false;
    for v_index in 1..cardinality(v_ids) loop
      if v_current[v_index] is distinct from v_target[v_index] then
        v_pending:=true;
        if not exists(select 1 from public.planned_training_sessions holder
            where holder.club_team_season_id=p_club_team_season_id
              and holder.session_number=v_target[v_index]
              and holder.id<>v_ids[v_index]) then
          v_changed:=public.set_planned_session_operational_number_v1(
            v_ids[v_index],v_target[v_index],p_reason) or v_changed;
          v_current[v_index]:=v_target[v_index];
          v_progress:=true;
        end if;
      end if;
    end loop;
    exit when not v_pending;
    if not v_progress then
      v_cycle_index:=null;
      for v_index in 1..cardinality(v_ids) loop
        if v_current[v_index] is not null
           and v_current[v_index] is distinct from v_target[v_index] then
          v_cycle_index:=v_index;
          exit;
        end if;
      end loop;
      if v_cycle_index is null then
        raise exception 'No se pudo resolver el ciclo de numeracion'
          using errcode='23514';
      end if;
      v_temporary:=1;
      while v_temporary=any(v_target) or exists(
          select 1 from public.planned_training_sessions occupied
          where occupied.club_team_season_id=p_club_team_season_id
            and occupied.session_number=v_temporary) loop
        if v_temporary=2147483647 then
          raise exception 'Secuencia de sesiones agotada' using errcode='22003';
        end if;
        v_temporary:=v_temporary+1;
      end loop;
      v_changed:=public.set_planned_session_operational_number_v1(
        v_ids[v_cycle_index],v_temporary,'temporary') or v_changed;
      v_current[v_cycle_index]:=v_temporary;
    end if;
  end loop;

  insert into public.planned_session_number_state(club_team_season_id)
    values (p_club_team_season_id) on conflict do nothing;
  select highest_ever_assigned into v_highest
    from public.planned_session_number_state
    where club_team_season_id=p_club_team_season_id for update;
  select coalesce(max(s.session_number),0) into v_maximum
    from public.planned_training_sessions s
    where s.club_team_season_id=p_club_team_season_id;
  if v_maximum>v_highest then
    update public.planned_session_number_state
      set highest_ever_assigned=v_maximum
      where club_team_season_id=p_club_team_season_id;
  end if;
  return v_changed;
end $fn$;
comment on function public.reconcile_planned_session_operational_numbers_v1(uuid,text) is
  'NEXO Sesiones 09: chronological session numbering';
alter function public.reconcile_planned_session_operational_numbers_v1(uuid,text) owner to postgres;
revoke all on function public.reconcile_planned_session_operational_numbers_v1(uuid,text)
  from public,anon,authenticated,service_role;

create or replace function public.reconcile_planned_session_numbering_v1(
  p_club_team_season_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  return public.reconcile_planned_session_operational_numbers_v1(
    p_club_team_season_id,'bootstrap');
end $fn$;
comment on function public.reconcile_planned_session_numbering_v1(uuid) is
  'NEXO Sesiones 09: authorized numbering reconciliation';
alter function public.reconcile_planned_session_numbering_v1(uuid) owner to postgres;
revoke all on function public.reconcile_planned_session_numbering_v1(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.reconcile_planned_session_numbering_v1(uuid)
  to authenticated;

create or replace function public.guard_planned_session_operational_numbering_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_cts uuid;
  v_reason text;
begin
  if tg_op='INSERT' then
    if new.planning_state<>'confirmed' then return null; end if;
    v_cts:=new.club_team_season_id;
    v_reason:='confirm';
  elsif tg_op='DELETE' then
    if old.planning_state<>'confirmed' then return null; end if;
    v_cts:=old.club_team_season_id;
    v_reason:='delete';
  else
    if row(new.planning_state,new.session_date,new.starts_at,new.cancelled_at,new.retired_at)
       is not distinct from
       row(old.planning_state,old.session_date,old.starts_at,old.cancelled_at,old.retired_at) then
      return null;
    end if;
    v_cts:=new.club_team_season_id;
    if old.planning_state is distinct from new.planning_state then
      v_reason:='confirm';
    elsif old.cancelled_at is distinct from new.cancelled_at then
      v_reason:=case when new.cancelled_at is null then 'reactivate' else 'cancel' end;
    elsif old.retired_at is distinct from new.retired_at then
      v_reason:='retire';
    else
      v_reason:='date';
    end if;
  end if;
  perform public.reconcile_planned_session_operational_numbers_v1(v_cts,v_reason);
  return null;
end $fn$;
comment on function public.guard_planned_session_operational_numbering_v1() is
  'NEXO Sesiones 09: defer reconciliation until transaction commit';
alter function public.guard_planned_session_operational_numbering_v1() owner to postgres;
revoke all on function public.guard_planned_session_operational_numbering_v1()
  from public,anon,authenticated,service_role;

do $trigger$
begin
  if not exists(select 1 from pg_trigger where tgrelid=
      'public.planned_training_sessions'::regclass
      and tgname='planned_sessions_operational_numbering_v1') then
    create constraint trigger planned_sessions_operational_numbering_v1
      after insert or update or delete on public.planned_training_sessions
      deferrable initially deferred for each row
      execute function public.guard_planned_session_operational_numbering_v1();
  end if;
end
$trigger$;

create or replace function public.planned_session_numbering_ready_v1()
returns boolean language sql stable security definer set search_path=pg_catalog as $fn$
  select auth.uid() is not null
    and to_regprocedure('public.reconcile_planned_session_numbering_v1(uuid)') is not null
    and to_regprocedure('public.reconcile_planned_session_operational_numbers_v1(uuid,text)') is not null
    and to_regprocedure('public.set_planned_session_operational_number_v1(uuid,integer,text)') is not null
    and exists(select 1 from pg_trigger where tgrelid=
      to_regclass('public.planned_training_sessions')
      and tgname='planned_sessions_operational_numbering_v1' and tgenabled='O')
    and exists(select 1 from pg_class where oid=
      to_regclass('public.planned_session_number_reindex_authorizations_v1')
      and relrowsecurity);
$fn$;
comment on function public.planned_session_numbering_ready_v1() is
  'NEXO Sesiones 09: operational numbering readiness';
alter function public.planned_session_numbering_ready_v1() owner to postgres;
revoke all on function public.planned_session_numbering_ready_v1()
  from public,anon,authenticated,service_role;
grant execute on function public.planned_session_numbering_ready_v1()
  to authenticated;

do $post$
begin
  if not exists(select 1 from pg_trigger where tgrelid=
      'public.planned_training_sessions'::regclass
      and tgname='planned_sessions_operational_numbering_v1'
      and tgenabled='O' and tgdeferrable and tginitdeferred
      and tgfoid=to_regprocedure(
        'public.guard_planned_session_operational_numbering_v1()'))
     or not has_function_privilege('authenticated',
       'public.reconcile_planned_session_numbering_v1(uuid)','EXECUTE')
     or has_function_privilege('anon',
       'public.reconcile_planned_session_numbering_v1(uuid)','EXECUTE')
     or has_table_privilege('authenticated',
       'public.planned_session_number_reindex_authorizations_v1','INSERT,UPDATE,DELETE')
     or not has_table_privilege('authenticated',
       'public.planned_training_sessions','SELECT') then
    raise exception 'Sesiones 09: postcondiciones de permisos o trigger incumplidas';
  end if;
end
$post$;
commit;
