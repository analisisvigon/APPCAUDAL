-- NEXO CLUB · Sesiones: retirada lógica y anulación. Ejecutar manualmente tras revisión.
-- No borra sesiones ni modifica sus relaciones, numeración o datos deportivos.
begin;

do $pre$
declare v_name text;
begin
  foreach v_name in array array['planned_training_sessions','planned_session_audit_events',
    'club_team_seasons','club_seasons','club_memberships'] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'Sesiones ciclo de vida: falta public.%',v_name;
    end if;
  end loop;
  if to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is null or
     to_regprocedure('public.planned_session_04b_state(uuid)') is null or
     to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Sesiones ciclo de vida: faltan helpers de autorización o auditoría';
  end if;
  if not exists (select 1 from pg_proc p where p.oid=
      to_regprocedure('public.planned_session_04b_lock(uuid,integer)')
      and p.prosecdef and p.provolatile='v' and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and obj_description(p.oid,'pg_proc')=
        'APPCAUDAL Sesiones 04B: planned_session_04b_lock') or
     not exists (select 1 from pg_proc p where p.oid=
      to_regprocedure('public.can_write_club_team_season(uuid)')
      and p.prosecdef and p.provolatile='s' and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and obj_description(p.oid,'pg_proc')=
        'APPCAUDAL Change 39B: write authorization for an open club team-season.') then
    raise exception 'Sesiones ciclo de vida: helpers de permiso o bloqueo incompatibles';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.planned_training_sessions'::regclass
      and tgname='planned_sessions_guard'
      and tgfoid=to_regprocedure('public.guard_planned_session_row()')
      and not tgisinternal and tgenabled='O') or
     not exists (select 1 from pg_trigger where tgrelid='public.planned_session_audit_events'::regclass
      and tgname='planned_audit_guard'
      and tgfoid=to_regprocedure('public.guard_planned_session_audit()')
      and not tgisinternal and tgenabled='O') then
    raise exception 'Sesiones ciclo de vida: faltan los guards actuales';
  end if;
  -- Los RPC 03A/03C/04B/05 revierten cualquier escritura hija al fallar el
  -- UPDATE de revisión de la sesión retirada. No debe existir escritura directa.
  foreach v_name in array array['planned_session_slots','planned_session_items',
    'planned_session_player_roster','planned_session_player_availability',
    'planned_session_distributions','planned_session_date_change_authorizations',
    'planned_session_audit_events'] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'Sesiones ciclo de vida: falta tabla dependiente public.%',v_name;
    end if;
    if has_table_privilege('authenticated','public.' || v_name,'INSERT,UPDATE,DELETE,TRUNCATE') or
       has_table_privilege('anon','public.' || v_name,'INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Sesiones ciclo de vida: escritura directa incompatible en public.%',v_name;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgrelid='public.planned_session_slots'::regclass
      and tgname='planned_slots_guard' and tgfoid=to_regprocedure('public.guard_planned_session_child()')
      and not tgisinternal and tgenabled='O') or
     not exists (select 1 from pg_trigger where tgrelid='public.planned_session_items'::regclass
      and tgname='planned_items_guard' and tgfoid=to_regprocedure('public.guard_planned_session_child()')
      and not tgisinternal and tgenabled='O') or
     not exists (select 1 from pg_trigger where tgrelid='public.planned_session_player_roster'::regclass
      and tgname='planned_session_player_roster_guard'
      and tgfoid=to_regprocedure('public.guard_planned_session_player_roster()')
      and not tgisinternal and tgenabled='O') or
     not exists (select 1 from pg_trigger where tgrelid='public.planned_session_player_availability'::regclass
      and tgname='planned_session_player_availability_guard'
      and tgfoid=to_regprocedure('public.guard_planned_session_player_availability()')
      and not tgisinternal and tgenabled='O') then
    raise exception 'Sesiones ciclo de vida: guard hijo ausente o deshabilitado';
  end if;
  if has_table_privilege('authenticated','public.planned_training_sessions','UPDATE') or
     has_table_privilege('anon','public.planned_training_sessions','UPDATE') or
     has_table_privilege('authenticated','public.planned_training_sessions','DELETE') or
     has_table_privilege('anon','public.planned_training_sessions','DELETE') or
     has_table_privilege('authenticated','public.planned_training_sessions','TRUNCATE') or
     has_table_privilege('anon','public.planned_training_sessions','TRUNCATE') then
    raise exception 'Sesiones ciclo de vida: privilegios directos incompatibles';
  end if;
  if exists (select 1 from pg_constraint c where c.conrelid='public.planned_training_sessions'::regclass
      and c.conname in ('planned_sessions_retired_by_fk','planned_sessions_cancelled_by_fk',
        'planned_sessions_retirement_check','planned_sessions_cancellation_check')
      and obj_description(c.oid,'pg_constraint') is distinct from
        'NEXO CLUB Sesiones 2C: ' || c.conname) then
    raise exception 'Sesiones ciclo de vida: constraint previo ajeno o incompatible';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
      ('change_planned_session_lifecycle_2c','guard_planned_session_lifecycle_2c')
      and (p.oid not in (
        coalesce(to_regprocedure('public.change_planned_session_lifecycle_2c(uuid,integer,text,text)')::oid,0),
        coalesce(to_regprocedure('public.guard_planned_session_lifecycle_2c()')::oid,0))
        or obj_description(p.oid,'pg_proc') is distinct from
          'NEXO CLUB Sesiones 2C: ' || p.proname or pg_get_userbyid(p.proowner)<>'postgres')) then
    raise exception 'Sesiones ciclo de vida: función previa incompatible';
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid='public.planned_training_sessions'::regclass
      and t.tgname='planned_sessions_lifecycle_2c_guard'
      and (t.tgfoid is distinct from to_regprocedure('public.guard_planned_session_lifecycle_2c()')::oid
        or t.tgenabled<>'O')) then
    raise exception 'Sesiones ciclo de vida: trigger previo incompatible';
  end if;
end $pre$;

alter table public.planned_training_sessions
  add column if not exists retired_at timestamptz,
  add column if not exists retired_by_membership_id uuid,
  add column if not exists retirement_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_membership_id uuid,
  add column if not exists cancellation_reason text;

do $schema$
declare v_column text; v_type oid; v_constraint text;
begin
  foreach v_column in array array['retired_at','retired_by_membership_id','retirement_reason',
      'cancelled_at','cancelled_by_membership_id','cancellation_reason'] loop
    v_type:=case when v_column like '%_at' then 'timestamptz'::regtype::oid
      when v_column like '%_id' then 'uuid'::regtype::oid else 'text'::regtype::oid end;
    if not exists (select 1 from pg_attribute where attrelid='public.planned_training_sessions'::regclass
        and attname=v_column and atttypid=v_type and not attisdropped and not attnotnull
        and not atthasdef) then
      raise exception 'Sesiones ciclo de vida: columna % incompatible',v_column;
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conrelid='public.planned_training_sessions'::regclass
      and conname='planned_sessions_retired_by_fk') then
    alter table public.planned_training_sessions add constraint planned_sessions_retired_by_fk
      foreign key (retired_by_membership_id) references public.club_memberships(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.planned_training_sessions'::regclass
      and conname='planned_sessions_cancelled_by_fk') then
    alter table public.planned_training_sessions add constraint planned_sessions_cancelled_by_fk
      foreign key (cancelled_by_membership_id) references public.club_memberships(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.planned_training_sessions'::regclass
      and conname='planned_sessions_retirement_check') then
    alter table public.planned_training_sessions add constraint planned_sessions_retirement_check
      check ((retired_at is null and retired_by_membership_id is null and retirement_reason is null)
        or (retired_at is not null and retired_by_membership_id is not null
          and (retirement_reason is null or char_length(retirement_reason)<=1000)));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.planned_training_sessions'::regclass
      and conname='planned_sessions_cancellation_check') then
    alter table public.planned_training_sessions add constraint planned_sessions_cancellation_check
      check ((cancelled_at is null and cancelled_by_membership_id is null and cancellation_reason is null)
        or (cancelled_at is not null and cancelled_by_membership_id is not null
          and (cancellation_reason is null or char_length(cancellation_reason)<=1000)));
  end if;
  -- Los nombres existentes no bastan: se comprueban marca, tipo, validación y relación.
  foreach v_constraint in array array['planned_sessions_retired_by_fk','planned_sessions_cancelled_by_fk',
      'planned_sessions_retirement_check','planned_sessions_cancellation_check'] loop
    if not exists (select 1 from pg_constraint c where c.conrelid='public.planned_training_sessions'::regclass
        and c.conname=v_constraint and c.convalidated and
        ((v_constraint='planned_sessions_retired_by_fk' and c.contype='f' and c.confdeltype='r'
          and c.confrelid='public.club_memberships'::regclass and cardinality(c.conkey)=1
          and c.conkey[array_lower(c.conkey,1)]=(select attnum from pg_attribute
            where attrelid=c.conrelid and attname='retired_by_membership_id')
          and cardinality(c.confkey)=1 and c.confkey[array_lower(c.confkey,1)]=(select attnum from pg_attribute
            where attrelid=c.confrelid and attname='id'))
          or (v_constraint='planned_sessions_cancelled_by_fk' and c.contype='f' and c.confdeltype='r'
          and c.confrelid='public.club_memberships'::regclass and cardinality(c.conkey)=1
          and c.conkey[array_lower(c.conkey,1)]=(select attnum from pg_attribute
            where attrelid=c.conrelid and attname='cancelled_by_membership_id')
          and cardinality(c.confkey)=1 and c.confkey[array_lower(c.confkey,1)]=(select attnum from pg_attribute
            where attrelid=c.confrelid and attname='id'))
          or (v_constraint='planned_sessions_retirement_check' and c.contype='c'
          and pg_get_constraintdef(c.oid) like '%retired_at%retired_by_membership_id%retirement_reason%')
          or (v_constraint='planned_sessions_cancellation_check' and c.contype='c'
          and pg_get_constraintdef(c.oid) like '%cancelled_at%cancelled_by_membership_id%cancellation_reason%'))) then
      raise exception 'Sesiones ciclo de vida: constraint % incompatible',v_constraint;
    end if;
  end loop;
end $schema$;

comment on constraint planned_sessions_retired_by_fk on public.planned_training_sessions is
  'NEXO CLUB Sesiones 2C: planned_sessions_retired_by_fk';
comment on constraint planned_sessions_cancelled_by_fk on public.planned_training_sessions is
  'NEXO CLUB Sesiones 2C: planned_sessions_cancelled_by_fk';
comment on constraint planned_sessions_retirement_check on public.planned_training_sessions is
  'NEXO CLUB Sesiones 2C: planned_sessions_retirement_check';
comment on constraint planned_sessions_cancellation_check on public.planned_training_sessions is
  'NEXO CLUB Sesiones 2C: planned_sessions_cancellation_check';

create or replace function public.guard_planned_session_lifecycle_2c()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  if old.retired_at is not null then
    raise exception 'Sesión retirada: edición bloqueada' using errcode='42501';
  end if;
  return new;
end $fn$;
comment on function public.guard_planned_session_lifecycle_2c() is
  'NEXO CLUB Sesiones 2C: guard_planned_session_lifecycle_2c';
alter function public.guard_planned_session_lifecycle_2c() owner to postgres;
revoke all on function public.guard_planned_session_lifecycle_2c() from public,anon,authenticated,service_role;
drop trigger if exists planned_sessions_lifecycle_2c_guard on public.planned_training_sessions;
create trigger planned_sessions_lifecycle_2c_guard before update on public.planned_training_sessions
  for each row execute function public.guard_planned_session_lifecycle_2c();

create or replace function public.change_planned_session_lifecycle_2c(
  p_session_id uuid,p_expected_revision integer,p_action text,p_reason text default null)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ctx record; v_session public.planned_training_sessions%rowtype;
  v_before jsonb; v_after jsonb; v_revision integer; v_reason text;
begin
  if p_action not in ('retire','cancel','reactivate') or p_action is null then
    raise exception 'Acción no admitida' using errcode='22023';
  end if;
  v_reason:=nullif(btrim(p_reason),'');
  if char_length(v_reason)>1000 or (p_action='reactivate' and v_reason is not null) then
    raise exception 'Motivo no válido' using errcode='22023';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  select * into v_session from public.planned_training_sessions where id=p_session_id;
  if v_session.retired_at is not null then
    raise exception 'Sesión retirada' using errcode='23514';
  end if;
  if (p_action='cancel' and v_session.cancelled_at is not null) or
     (p_action='reactivate' and v_session.cancelled_at is null) then
    raise exception 'Estado de anulación incompatible' using errcode='23514';
  end if;
  v_before:=jsonb_build_object('session',public.planned_session_04b_state(p_session_id),
    'retired_at',v_session.retired_at,'retired_by',v_session.retired_by_membership_id,
    'cancelled_at',v_session.cancelled_at,'cancelled_by',v_session.cancelled_by_membership_id,
    'retirement_reason',v_session.retirement_reason,'cancellation_reason',v_session.cancellation_reason);
  if p_action='retire' then
    update public.planned_training_sessions set retired_at=now(),
      retired_by_membership_id=v_ctx.actor_id,retirement_reason=v_reason,revision=revision+1
      where id=p_session_id returning * into v_session;
  elsif p_action='cancel' then
    update public.planned_training_sessions set cancelled_at=now(),
      cancelled_by_membership_id=v_ctx.actor_id,cancellation_reason=v_reason,revision=revision+1
      where id=p_session_id returning * into v_session;
  else
    update public.planned_training_sessions set cancelled_at=null,
      cancelled_by_membership_id=null,cancellation_reason=null,revision=revision+1
      where id=p_session_id returning * into v_session;
  end if;
  v_revision:=v_session.revision;
  v_after:=jsonb_build_object('session',public.planned_session_04b_state(p_session_id),
    'retired_at',v_session.retired_at,'retired_by',v_session.retired_by_membership_id,
    'cancelled_at',v_session.cancelled_at,'cancelled_by',v_session.cancelled_by_membership_id,
    'retirement_reason',v_session.retirement_reason,'cancellation_reason',v_session.cancellation_reason);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,before_hash,after_hash,metadata)
  values (p_session_id,v_revision,v_ctx.actor_id,
    case when v_ctx.planning_state='draft' then 'draft_saved' else 'confirmed_saved' end,
    array['lifecycle'],md5(v_before::text),md5(v_after::text),
    jsonb_build_object('operation',p_action || '_2c','reason',v_reason));
  return v_revision;
end $fn$;
comment on function public.change_planned_session_lifecycle_2c(uuid,integer,text,text) is
  'NEXO CLUB Sesiones 2C: change_planned_session_lifecycle_2c';
alter function public.change_planned_session_lifecycle_2c(uuid,integer,text,text) owner to postgres;
revoke all on function public.change_planned_session_lifecycle_2c(uuid,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.change_planned_session_lifecycle_2c(uuid,integer,text,text)
  to authenticated;

do $post$
begin
  if not has_function_privilege('authenticated',
      'public.change_planned_session_lifecycle_2c(uuid,integer,text,text)','EXECUTE') or
     has_function_privilege('anon',
      'public.change_planned_session_lifecycle_2c(uuid,integer,text,text)','EXECUTE') or
     has_table_privilege('authenticated','public.planned_training_sessions','UPDATE') or
     not exists (select 1 from pg_trigger where tgrelid='public.planned_training_sessions'::regclass
       and tgname='planned_sessions_lifecycle_2c_guard' and tgenabled='O') then
    raise exception 'Sesiones ciclo de vida: postcondiciones de seguridad incumplidas';
  end if;
end $post$;
commit;
