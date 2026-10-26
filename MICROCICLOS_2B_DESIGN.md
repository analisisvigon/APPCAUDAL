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

La propuesta SQL local `supabase_microcycles_2b.sql` simplifica el diseño preliminar a **una sola tabla** `planned_microcycles`: identidad `(club_team_season_id, week_starts_on)` y FK al CTS; no repite `club_id` porque este ya se deriva del CTS validado. `weekly` y `days` son JSONB completos de contrato cerrado, validados por el guard: siete fechas exactas, catálogos, límites de longitud, minutos positivos y ningún dato planificado fuera de las fechas de la temporada. Esto permite guardar la semana atómicamente con una revisión CAS, sin sincronizar dos tablas. Campos de autoría apuntan a memberships activas del mismo club, comprobadas durante la escritura. No almacena resultados, etiquetas MD, sesiones, partidos, RPE, Wellness ni datos individuales.

## Seguridad y contrato

- RLS activo desde la creación. SELECT mediante `can_read_club_team_season(club_team_season_id)`; ninguna política abierta para `anon`, `PUBLIC` o `player`.
- Sin escritura directa desde el cliente. Una RPC autenticada crea o actualiza la semana en una transacción con bloqueo de temporada, revisión CAS, identidad derivada de `auth.uid()`, comprobación `can_write_club_team_season` y rechazo de identidades/fechas incompatibles. La clave única impide duplicados concurrentes.
- El guard `BEFORE INSERT/UPDATE/DELETE` comprueba CTS y `club_seasons.status = 'open'` y rechaza siempre DELETE. Las lecturas históricas autorizadas no dependen de `is_active`.
- Funciones `SECURITY DEFINER` solo si RLS exige ese patrón; `search_path = pg_catalog`, referencias cualificadas, EXECUTE revocado a `PUBLIC` y `anon`, grants explícitos. `service_role` no sirve como prueba de RLS ni se considera una identidad deportiva.
- Lectura por CTS y rango semanal. El frontend debe recibir el CTS verificado del contexto actual: una fecha sola no identifica una planificación. Antes de activar la lectura, comprobar que el Calendario no mezcla varios CTS cuando existan.

## Activación por etapas

1. Inventario manual de producción, preflight de solo lectura, revisión de permisos y del CTS seleccionado en la aplicación.
2. Revisar y autorizar `supabase_microcycles_2b.sql` tras ejecutar manualmente `supabase_microcycles_2b_preflight.sql`; verificar con `supabase_microcycles_2b_verify.sql`. No migrar ni inferir datos antiguos.
3. Probar la RPC de escritura y la lectura RLS con owner, staff asignado/no asignado, player, otro club, temporada cerrada, CAS obsoleto y dos escrituras concurrentes, sin usar `service_role` como simulación de usuario.
4. Solo tras PASS, conectar consulta y guardado en Calendario; confirmar recarga, cancelación y separación de minutos previstos de jornada frente a duración real de sesiones.

El adaptador de frontend pendiente debe convertir `durationMinutes` vacío a JSON `null` y los minutos válidos a número entero (no cadena), enviar los siete días en formato `YYYY-MM-DD` y tratar la revisión `0` como creación. El Calendario actual carga sesiones de todos los CTS visibles del club; antes de enlazar esta RPC debe recibir o determinar inequívocamente el CTS de trabajo ya autorizado, y filtrar sus sesiones por ese CTS. Un `club_id` o una fecha por sí solos no son contexto suficiente. La tabla propuesta usa el CTS existente de Sesiones; no añade un selector multiclub nuevo.

Hasta completar estas etapas, el formulario del Calendario es una vista previa local: **Guardar permanece deshabilitado** y Cancelar descarta los cambios.

## Eliminación de sesiones: decisión pendiente

El esquema local prohíbe `DELETE` de `planned_training_sessions`; auditoría, franjas, actividades, plantilla congelada, disponibilidad, pizarras y token de conciliación referencian la sesión con `ON DELETE RESTRICT`. La auditoría se creó incluso para un borrador vacío, y la numeración confirmada es histórica. Por tanto, no hay borrado físico seguro ni RPC reutilizable. La interfaz muestra menú y confirmación pero deja la acción final inhabilitada.

La alternativa mínima que requiere aprobación expresa es **retirada lógica**: marcar la sesión como retirada sin borrar fila, número, auditoría, snapshot ni contenido dependiente; hacerla invisible en listados y Calendario, y bloquear todas sus escrituras backend. Antes de escribir esa migración se necesita inventario efectivo de producción de FKs, triggers, vistas/RPC y posibles Storage/documentos, además de decidir si se admite retirar sesiones confirmadas o solo borradores. No se debe inferir que las relaciones locales cubren toda producción.
