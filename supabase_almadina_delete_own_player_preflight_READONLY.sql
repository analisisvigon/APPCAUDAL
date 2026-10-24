-- SOLO LECTURA. Revisar manualmente en APPCAUDAL antes de instalar la RPC.
-- No consulta filas de jugadores, multas, partidos ni cuentas.
select name, present from (
  values
    ('current_membership()', to_regprocedure('public.current_membership()') is not null),
    ('is_app_staff()', to_regprocedure('public.is_app_staff()') is not null),
    ('guard_fine_payment_integrity()',
      to_regprocedure('public.guard_fine_payment_integrity()') is not null),
    ('jugadores', to_regclass('public.jugadores') is not null),
    ('fine_subjects', to_regclass('public.fine_subjects') is not null),
    ('fines', to_regclass('public.fines') is not null),
    ('fine_payments', to_regclass('public.fine_payments') is not null),
    ('physio_treatments', to_regclass('public.physio_treatments') is not null),
    ('training_session_load_metrics',
      to_regclass('public.training_session_load_metrics') is not null),
    ('partido_estadisticas_jugador',
      to_regclass('public.partido_estadisticas_jugador') is not null),
    ('partido_eventos_sustitucion',
      to_regclass('public.partido_eventos_sustitucion') is not null),
    ('legacy_jugador_cts_links_v1',
      to_regclass('public.legacy_jugador_cts_links_v1') is not null)
) as checks(name, present) order by name;

select c.oid::regclass as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c where c.oid in (
  to_regclass('public.jugadores'),to_regclass('public.fines'),
  to_regclass('public.fine_subjects'),to_regclass('public.physio_treatments'),
  to_regclass('public.training_session_load_metrics'),
  to_regclass('public.partido_estadisticas_jugador'),
  to_regclass('public.player_team_memberships'),
  to_regclass('public.club_team_season_players')
) order by table_name::text;

-- Se espera la lista documentada en supabase_almadina_delete_own_player_MANUAL.sql.
-- Cualquier fila adicional o accion ON DELETE diferente debe revisarse.
select c.confrelid::regclass as parent_table,
       c.conrelid::regclass as child_table,
       c.conname as fk_name,
       pg_get_constraintdef(c.oid, true) as definition,
       c.confdeltype as delete_action
from pg_constraint c
where c.contype = 'f'
  and c.confrelid in (
    to_regclass('public.jugadores'),
    to_regclass('public.fine_subjects'),
    to_regclass('public.fines')
  )
order by parent_table::text, child_table::text, fk_name;

-- Disparadores de DELETE de las tablas afectadas. El único DELETE trigger
-- esperado entre estas tablas es el guard del ledger, que impide borrar pagos.
select t.tgrelid::regclass as table_name, t.tgname as trigger_name,
       t.tgenabled as enabled, t.tgfoid::regprocedure as function_name,
       (t.tgtype & 8) <> 0 as fires_on_delete
from pg_trigger t
where not t.tgisinternal and t.tgrelid in (
  to_regclass('public.jugadores'),to_regclass('public.fines'),
  to_regclass('public.fine_subjects'),to_regclass('public.fine_payments'),
  to_regclass('public.physio_treatments'),
  to_regclass('public.training_session_load_metrics'),
  to_regclass('public.partido_estadisticas_jugador'),
  to_regclass('public.wellness_entries'),to_regclass('public.rpe_entries'),
  to_regclass('public.rpe_sync_pending'),
  to_regclass('public.jugador_suspension_consumptions'),
  to_regclass('public.legacy_own_player_migration'),
  to_regclass('public.legacy_jugador_cts_links_v1')
)
order by table_name::text, trigger_name;

-- Funciones SECURITY DEFINER que en el servidor mencionan DELETE y
-- jugadores. Devuelve solo firmas: cualquier resultado requiere revision.
select p.oid::regprocedure as routine, p.proowner::regrole as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and p.prosrc ~* 'delete[[:space:]]+from[[:space:]]+(public[.])?jugadores([^[:alnum:]_]|$)'
order by routine::text;

select role_name, has_table_privilege(role_name,'public.jugadores','DELETE')
       as can_direct_delete
from (values ('anon'),('authenticated'),('service_role')) as roles(role_name);
