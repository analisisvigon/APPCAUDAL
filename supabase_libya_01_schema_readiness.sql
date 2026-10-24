-- LIBIA / SOLO LECTURA. Ejecutar manualmente DESPUÉS de importar un baseline
-- estructural revisado. El archivo no instala tablas ni declara éxito global:
-- devuelve las dependencias conocidas de las nueve pestañas que falten.
with required(name, kind) as (values
  ('clubs','table'), ('club_memberships','table'),
  ('equipos_rivales','table'), ('jugadores','table'),
  ('jugadores_rivales','table'), ('equipo_rival_alineacion','table'),
  ('equipo_rival_banquillo','table'), ('partidos','table'),
  ('partido_alineacion_slots','table'), ('partido_estadisticas_jugador','table'),
  ('players_database','table'), ('player_team_memberships','table'),
  ('player_positions','table'), ('player_sources','table'),
  ('training_library','table'), ('training_tasks','table'),
  ('training_task_shares','table'), ('training_task_media','table'),
  ('training_task_feedback','table'), ('tactical_play_templates','table'),
  ('training_sessions','table'), ('planned_training_sessions','table'),
  ('planned_session_items','table'), ('planned_session_slots','table'),
  ('planned_session_distributions','table'),
  ('planned_session_player_roster','table'),
  ('planned_session_player_availability','table'),
  ('rpe_entries','table'), ('wellness_entries','table'),
  ('match_quick_events','table'), ('match_set_piece_diagrams','table'),
  ('match_set_piece_notes','table'), ('match_set_piece_takers','table'),
  ('competitions','table')
)
select name, to_regclass(format('public.%I', name)) is not null as present
from required order by name;

with required(signature) as (values
  ('public.current_membership()'),
  ('public.can_edit_club_data(uuid)'),
  ('public.is_app_staff()')
)
select signature, to_regprocedure(signature) is not null as present
from required order by signature;

select 'training-task-files' as bucket,
       exists (select 1 from storage.buckets where id = 'training-task-files') as present;

select name, case when to_regclass(format('public.%I', name)) is null then false
  else not has_table_privilege('anon', to_regclass(format('public.%I', name)),
    'SELECT,INSERT,UPDATE,DELETE') end as anon_dml_absent
from (values ('jugadores'), ('jugadores_rivales'),
  ('equipo_rival_alineacion'), ('equipo_rival_banquillo')) target(name)
order by name;

-- La rama original depende de RLS y de estas políticas; presencia no basta
-- para declarar seguro el nuevo proyecto. Revisar el resultado manualmente.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname in ('public','storage')
  and tablename in ('jugadores','partidos','training_library',
    'training_tasks','tactical_play_templates','objects')
order by schemaname, tablename, policyname;
