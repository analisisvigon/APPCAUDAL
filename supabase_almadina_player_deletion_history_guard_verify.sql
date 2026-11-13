-- SOLO LECTURA / NEXO CLUB.
-- Verificacion de la RPC delete_own_player_atomic_v1(uuid).
-- Comprueba firma, instalacion, security definer, permisos y ausencia de acceso directo DELETE.

select p.oid::regprocedure as signature,
       p.prosecdef as security_definer,
       p.proowner::regrole as owner,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_table_privilege('authenticated', 'public.jugadores', 'DELETE') as authenticated_direct_delete
from pg_proc p
where p.oid = to_regprocedure('public.delete_own_player_atomic_v1(uuid)');

-- Consulta de diagnostico para un jugador especifico. Reemplazar UUID para auditar dependencias.
with target(id) as (
  values ('00000000-0000-0000-0000-000000000000'::uuid)
)
select target.id as jugador_id,
       exists(select 1 from public.jugadores j where j.id = target.id) as ficha_existe,
       (select j.active_in_squad from public.jugadores j where j.id = target.id) as activo_en_plantilla,
       (select stage.is_current from public.jugadores j
        join public.player_team_memberships stage on stage.id = j.membership_id
        where j.id = target.id) as etapa_activa,
       (select count(*) from public.partido_convocados where jugador_id = target.id) as convocatorias,
       (select count(*) from public.partido_alineacion_slots where jugador_id = target.id) as alineaciones,
       (select count(*) from public.partido_estadisticas_jugador where jugador_id = target.id) as estadisticas,
       (select count(*) from public.physio_treatments where player_id = target.id) as fisio,
       (select count(*) from public.fines fine
        join public.fine_subjects s on s.id = fine.subject_id
        where s.jugador_id = target.id) as multas
from target;
