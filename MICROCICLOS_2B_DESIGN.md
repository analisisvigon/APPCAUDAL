# Microciclos 2B — diseño pendiente de aprobación

Estado: propuesta local. No hay migración instalada ni guardado habilitado.

## Evidencia del repositorio

- `club_team_seasons` enlaza equipo propio y temporada mediante `team_id`, `season_id` y `club_id` (Cambio 34).
- `club_seasons.status` distingue temporadas `open` y `closed` (Cambio 32).
- `can_read_club_team_season(uuid)` exige membresía activa del club y, para staff, asignación explícita (Cambio 35). `can_write_club_team_season(uuid)` añade la exigencia de temporada abierta (Cambio 39B).
- `planned_training_sessions` pertenece a un CTS, guarda la etiqueta MD por sesión y tiene sus propias RPC y revisión CAS (Sesiones 03A/03C). No representa una semana.
- `training_sessions.microcycle_label` pertenece al modelo de rendimiento físico/RPE y no acredita una planificación semanal canónica.
- En las migraciones locales revisadas no aparece una tabla de planificación semanal con identidad CTS + lunes. Su ausencia en producción sigue pendiente de verificación manual antes de escribir una migración.

## Propuesta mínima de persistencia

1. `planned_microcycles`: `id` UUID, `club_id` UUID, `club_team_season_id` UUID, `week_starts_on` DATE, `objective` TEXT, `priorities` TEXT[], `staff_observations` TEXT, `responsible_label` TEXT opcional, `revision` INTEGER positivo, campos de autoría y marcas temporales. `UNIQUE (club_team_season_id, week_starts_on)`; el lunes se valida con `EXTRACT(ISODOW FROM week_starts_on) = 1`. FK compuesta `(club_team_season_id, club_id)` hacia `(id, club_id)` del CTS. `club_id` solo se repite para forzar integridad de club también en la autoría por membership.
2. `planned_microcycle_days`: `microcycle_id` UUID, `day_on` DATE, `day_type`, `day_objective`, `focus`, `intensity`, `planned_minutes` INTEGER opcional y `observations`. PK `(microcycle_id, day_on)`; FK al microciclo con `ON DELETE RESTRICT`. Un guard o la RPC valida que `day_on` pertenece a los siete días de la semana padre.
3. Catálogos cerrados para prioridades, tipo, foco e intensidad. Límites de longitud y minutos positivos. No almacenar resultados, etiquetas MD, sesiones, partidos, RPE, Wellness ni datos individuales en estas tablas.

## Seguridad y contrato

- RLS activo desde la creación. SELECT mediante `can_read_club_team_season(club_team_season_id)`; ninguna política abierta para `anon`, `PUBLIC` o `player`.
- Sin escritura directa desde el cliente. Una RPC autenticada crea o actualiza la semana y sus días en una transacción con bloqueo, revisión CAS, identidad derivada de `auth.uid()`, comprobación `can_write_club_team_season` y rechazo de identidades/fechas incompatibles. La clave única impide duplicados concurrentes.
- Guardas `BEFORE INSERT/UPDATE/DELETE` en ambas tablas comprueban CTS y `club_seasons.status = 'open'` para evitar que una ruta directa omita el cierre. No conceder DELETE al cliente. Las lecturas históricas autorizadas no dependen de `is_active`.
- Funciones `SECURITY DEFINER` solo si RLS exige ese patrón; `search_path = pg_catalog`, referencias cualificadas, EXECUTE revocado a `PUBLIC` y `anon`, grants explícitos. `service_role` no sirve como prueba de RLS ni se considera una identidad deportiva.
- Lectura por CTS y rango semanal. El frontend debe recibir el CTS verificado del contexto actual: una fecha sola no identifica una planificación. Antes de activar la lectura, comprobar que el Calendario no mezcla varios CTS cuando existan.

## Activación por etapas

1. Inventario manual de producción, preflight de solo lectura, revisión de permisos y del CTS seleccionado en la aplicación.
2. Migración aditiva de tablas, constraints, índices, RLS y guards; verificador estructural independiente. No migrar ni inferir datos antiguos.
3. RPC de lectura/escritura y pruebas transaccionales con owner, staff asignado/no asignado, player, otro club, temporada cerrada, CAS obsoleto y dos escrituras concurrentes.
4. Solo tras PASS, conectar consulta y guardado en Calendario; confirmar recarga, cancelación y separación de minutos previstos de jornada frente a duración real de sesiones.

Hasta completar estas etapas, el formulario del Calendario es una vista previa local: **Guardar permanece deshabilitado** y Cancelar descarta los cambios.
