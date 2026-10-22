-- Solo lectura. Ejecutar manualmente antes de instalar Multiclub 01.
-- Todos los requisitos deben devolver true; la funcion nueva debe devolver false.

select required_object, present
from (
  values
    ('public.clubs', to_regclass('public.clubs') is not null),
    ('public.club_memberships', to_regclass('public.club_memberships') is not null),
    ('public.club_teams', to_regclass('public.club_teams') is not null),
    ('public.club_seasons', to_regclass('public.club_seasons') is not null),
    ('public.club_team_seasons', to_regclass('public.club_team_seasons') is not null),
    ('public.equipos_rivales', to_regclass('public.equipos_rivales') is not null),
    ('public.current_membership()', to_regprocedure('public.current_membership()') is not null),
    ('public.can_read_club_team_season(uuid)',
      to_regprocedure('public.can_read_club_team_season(uuid)') is not null)
) as checks(required_object, present);

select
  to_regprocedure('public.my_access_contexts_v1()') is not null as new_function_already_exists,
  md5(pg_get_functiondef(to_regprocedure('public.current_membership()'))) as legacy_identity_definition_hash;

select
  attrelid::regclass::text as relation_name,
  attname as column_name,
  atttypid::regtype::text as column_type
from pg_attribute
where (attrelid, attname) in (
  (to_regclass('public.club_memberships'), 'jugador_id'),
  (to_regclass('public.club_memberships'), 'is_active'),
  (to_regclass('public.equipos_rivales'), 'crest'),
  (to_regclass('public.club_seasons'), 'status')
)
  and not attisdropped
order by relation_name, column_name;
