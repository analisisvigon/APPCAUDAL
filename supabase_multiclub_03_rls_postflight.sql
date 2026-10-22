-- Multiclub 03, fase C: SOLO LECTURA. Ejecutar manualmente tras el COMMIT.
with target(table_name, expected_policies) as (values
  ('jugadores', 4), ('partidos', 4),
  ('partido_estadisticas_jugador', 4), ('partido_eventos_gol', 4),
  ('match_quick_events', 4), ('partido_alineacion_slots', 4),
  ('partido_eventos_sistema', 4), ('partido_snapshots_tacticos', 4),
  ('partido_snapshot_tactico_slots', 4), ('partido_eventos_post', 4),
  ('partido_convocados', 4), ('partido_notas_individuales_pre', 4),
  ('partido_eventos_sustitucion', 1),
  ('match_set_piece_takers', 4), ('match_set_piece_notes', 4),
  ('match_set_piece_diagrams', 4)
), checked as (
  select target.table_name, target.expected_policies,
         c.relrowsecurity as rls_enabled,
         count(p.polname) as policy_count,
         count(p.polname) filter (where p.polname like 'multiclub_03_%') as scoped_policy_count,
         count(p.polname) filter (where
           coalesce(pg_get_expr(p.polqual,p.polrelid),'') ~* 'is_app_staff'
           or coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') ~* 'is_app_staff')
           as legacy_staff_policy_count
  from target
  join pg_class c on c.oid = to_regclass('public.' || target.table_name)
  left join pg_policy p on p.polrelid = c.oid
  group by target.table_name, target.expected_policies, c.relrowsecurity
)
select *, (rls_enabled and policy_count = expected_policies
  and scoped_policy_count = expected_policies and legacy_staff_policy_count = 0)
    as policy_boundary_ok
from checked order by table_name;

select tgname as cts_immutability_trigger,
       tgenabled = 'O' as enabled
from pg_trigger where tgrelid = 'public.partidos'::regclass
  and tgname = 'prevent_partido_cts_move_v1';

select count(*) filter (where club_team_season_id is null) as matches_without_cts
from public.partidos;

-- Con sesion autenticada REAL, comprobar ademas el archivo de pruebas
-- negativas. El SQL Editor con rol postgres NO valida RLS de authenticated.
