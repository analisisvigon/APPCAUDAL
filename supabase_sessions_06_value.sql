-- APPCAUDAL Sesiones 06: VALOR (0-10). PENDIENTE DE INSTALACIÓN MANUAL.
-- Una única transacción; no cambia RPC 03A/03C/04B/05, RLS ni datos existentes.
begin;

do $pre$
declare v_table oid := to_regclass('public.planned_training_sessions');
  v_constraint record; v_existing oid;
begin
  if v_table is null or to_regclass('public.planned_session_audit_events') is null
     or to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is null
     or to_regprocedure('public.planned_session_04b_state(uuid)') is null then
    raise exception 'Sesiones 06: faltan dependencias 03A/04B';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid=v_table
      and t.tgname='planned_sessions_guard' and not t.tgisinternal and t.tgenabled<>'D'
      and t.tgfoid=to_regprocedure('public.guard_planned_session_row()')) then
    raise exception 'Sesiones 06: falta el guard de sesiones activo';
  end if;
  if not exists (select 1 from pg_proc p where p.oid=
      to_regprocedure('public.planned_session_04b_lock(uuid,integer)')
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[]) then
    raise exception 'Sesiones 06: bloqueo 04B incompatible';
  end if;
  if has_table_privilege('authenticated',v_table,'UPDATE') or
     has_table_privilege('anon',v_table,'UPDATE') then
    raise exception 'Sesiones 06: UPDATE directo de clientes incompatible';
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid=v_table
      and a.attname='session_value' and not a.attisdropped
      and (a.atttypid<>'numeric'::regtype or a.attnotnull)) then
    raise exception 'Sesiones 06: columna VALOR preexistente incompatible';
  end if;
  select c.oid, c.contype, c.convalidated,
    regexp_replace(lower(pg_get_expr(c.conbin,c.conrelid)),
      '(::(numeric|smallint|integer)|[[:space:]()])','','g') as normalized
    into v_constraint from pg_constraint c
    where c.conrelid=v_table and c.conname='planned_sessions_value_check';
  if found then
    if v_constraint.contype<>'c' or not v_constraint.convalidated or
       v_constraint.normalized is distinct from 'session_value>=0andsession_value<=10' then
      raise exception 'Sesiones 06: restricción VALOR preexistente incompatible';
    end if;
  end if;
  select p.oid into v_existing from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='save_planned_session_value_06';
  if found and (to_regprocedure('public.save_planned_session_value_06(uuid,integer,numeric)') is null
      or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='save_planned_session_value_06')<>1
      or obj_description(v_existing,'pg_proc') is distinct from
        'APPCAUDAL Sesiones 06: save_planned_session_value_06') then
    raise exception 'Sesiones 06: función preexistente incompatible';
  end if;
end $pre$;

alter table public.planned_training_sessions
  add column if not exists session_value numeric;
comment on column public.planned_training_sessions.session_value is
  'APPCAUDAL Sesiones 06: VALOR opcional de 0 a 10';

do $constraint$
begin
  if not exists (select 1 from pg_constraint c where c.conrelid=
      to_regclass('public.planned_training_sessions')
      and c.conname='planned_sessions_value_check') then
    alter table public.planned_training_sessions
      add constraint planned_sessions_value_check
      check (session_value >= 0 and session_value <= 10);
  end if;
end $constraint$;

create or replace function public.save_planned_session_value_06(
  p_session_id uuid,p_expected_revision integer,p_value numeric)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ctx record; v_previous numeric; v_revision integer;
  v_before jsonb; v_after jsonb;
begin
  if p_value is not null and (p_value<0 or p_value>10) then
    raise exception 'VALOR debe estar entre 0 y 10' using errcode='22023';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  select session_value into v_previous from public.planned_training_sessions
    where id=p_session_id;
  if v_previous is not distinct from p_value then return p_expected_revision; end if;
  v_before:=jsonb_build_object('state',public.planned_session_04b_state(p_session_id),
    'value',v_previous);
  update public.planned_training_sessions
    set session_value=p_value,revision=revision+1
    where id=p_session_id returning revision into v_revision;
  v_after:=jsonb_build_object('state',public.planned_session_04b_state(p_session_id),
    'value',p_value);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
    values (p_session_id,v_revision,v_ctx.actor_id,
      case when v_ctx.planning_state='draft' then 'draft_saved' else 'confirmed_saved' end,
      array['value'],md5(v_before::text),md5(v_after::text),
      jsonb_build_object('operation','save_value_06'));
  return v_revision;
end $fn$;
comment on function public.save_planned_session_value_06(uuid,integer,numeric) is
  'APPCAUDAL Sesiones 06: save_planned_session_value_06';
alter function public.save_planned_session_value_06(uuid,integer,numeric) owner to postgres;
revoke all on function public.save_planned_session_value_06(uuid,integer,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.save_planned_session_value_06(uuid,integer,numeric)
  to authenticated;

do $post$
declare v_constraint record;
begin
  if not exists (select 1 from pg_attribute a where a.attrelid=
      to_regclass('public.planned_training_sessions') and a.attname='session_value'
      and not a.attisdropped and a.atttypid='numeric'::regtype and not a.attnotnull) then
    raise exception 'Sesiones 06: columna VALOR inválida';
  end if;
  select c.contype,c.convalidated,regexp_replace(lower(pg_get_expr(c.conbin,c.conrelid)),
    '(::(numeric|smallint|integer)|[[:space:]()])','','g') as normalized into v_constraint
    from pg_constraint c where c.conrelid=to_regclass('public.planned_training_sessions')
      and c.conname='planned_sessions_value_check';
  if not found then
    raise exception 'Sesiones 06: falta la restricción VALOR';
  end if;
  if v_constraint.contype<>'c' or not v_constraint.convalidated or
     v_constraint.normalized is distinct from 'session_value>=0andsession_value<=10' then
    raise exception 'Sesiones 06: restricción VALOR inválida';
  end if;
  if not exists (select 1 from pg_proc p where p.oid=
      to_regprocedure('public.save_planned_session_value_06(uuid,integer,numeric)')
      and p.prosecdef and p.provolatile='v'
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_get_userbyid(p.proowner)='postgres')
     or not has_function_privilege('authenticated',
       'public.save_planned_session_value_06(uuid,integer,numeric)','EXECUTE')
     or has_function_privilege('anon',
       'public.save_planned_session_value_06(uuid,integer,numeric)','EXECUTE') then
    raise exception 'Sesiones 06: seguridad o EXECUTE inválidos';
  end if;
  if has_table_privilege('authenticated',
       to_regclass('public.planned_training_sessions'),'UPDATE') or
     has_table_privilege('anon',
       to_regclass('public.planned_training_sessions'),'UPDATE') then
    raise exception 'Sesiones 06: UPDATE directo de clientes inesperado';
  end if;
end $post$;

commit;
