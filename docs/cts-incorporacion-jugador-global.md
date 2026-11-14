# Incorporación de un perfil global a Plantilla CTS

## Causa

`PlayerDatabaseForm` usaba la etapa global actual para decidir «Ya vinculado»
y llamaba `linkExistingGlobalPlayerToTeam` con `replace`. En compatibilidad, este
invocaba `assign_global_player_to_team`, que NO crea `club_team_season_players`
ni `legacy_jugador_cts_links_v1`. En modo CTS, el handler rechaza antes la llamada.
La lectura canónica de Plantilla exige esos vínculos: recargar no corrige el alta.
Es la misma clase de incoherencia que las altas legacy sin pertenencia CTS.

La RPC legacy no cambia `players_database`, pero puede cerrar TODAS las etapas
actuales (`is_current=false`, `end_date`), reasignar fichas propias y registros de
migración, y desactivar fichas rivales y posiciones tácticas. Si una llamada anterior
terminó correctamente, esas alteraciones son posibles. No se ha consultado el jugador
real ni se afirma que hayan ocurrido. No se recuperan datos automáticamente.

La RPC 03B `link_existing_global_player_to_cts_v1` tampoco resuelve este flujo:
rechaza etapas globales activas y no crea ficha ni binding legacy completos.

## Cambio preparado

La acción pasa a llamarse «Incorporar a esta plantilla CTS»: no promete trasladar
el equipo global. Se conserva el origen íntegro, incluso si su temporada está
cerrada. Se exige un destino propio y CTS autorizado abierto; un destino rival
no utiliza como alternativa el traslado global legacy.

El frontend llama a `incorporate_global_player_cts_v1`, valida el comprobante,
relee Plantilla y solo entonces actualiza tarjetas y contadores. El reintento
reutiliza el vínculo comprobado. «Ya vinculado» no se deduce del equipo global.
Los cambios de contexto invalidan el resultado y un ref bloquea envíos duplicados.

La nueva RPC no actualiza ni elimina ninguna fila existente:

- Conserva `players_database`, posiciones y fuentes globales.
- Reutiliza una etapa compatible del destino o crea una nueva para su temporada.
  Si ya existe equipo global activo, la nueva relación usa `is_current=false` para
  respetar el índice de equipo global único; la pertenencia CTS es la autoridad
  de Plantilla. No cierra ni cambia fechas de etapas anteriores.
- Crea ficha `jugadores`, pertenencia CTS, binding y registro legacy en una misma
  transacción. El actor de la pertenencia aporta la procedencia canónica.
- Bloquea temporada y perfil, valida membresía/asignación y usa el mismo advisory
  lock que 03B. Los errores, incluidos guards diferidos, revierten toda la llamada.
- No reactiva bajas ni repara vínculos incompletos/ambiguos. Devuelve un motivo.
- Exige acceso a los CTS de origen. Los perfiles de scouting deben tener etapa
  rival acreditada; perfiles sin procedencia y fichas propias huérfanas requieren
  revisión. No se eluden guards operativos, RLS ni restricciones históricas.

El vínculo resultante es el que utiliza `depart_roster_player_v1`, sin modificar
esa RPC. La eliminación definitiva sigue bloqueada.

## SQL pendiente, no ejecutado

1. Revisar `supabase_cts_player_incorporation_v1_verify.sql`: funciones, triggers,
   índices y permisos. Su último SELECT admite un UUID global para inspeccionar
   etapas y vínculos; con NULL no devuelve jugadores. Para saber si se alteró
   previamente el origen, comparar fechas con auditoría/backups: un end_date no
   demuestra por sí solo un error.
2. Revisar e instalar `supabase_cts_player_incorporation_v1.sql` en una base de
   pruebas. Es una función nueva, sin cambios a las RPC legacy ni al esquema de
   identidad. Los guards existentes deben admitir la operación completa.
3. Probar con datos ficticios y después instalar manualmente en producción antes
   de publicar el frontend. Si falta la RPC, la UI informa y no usa fallback.

## Pruebas

`test:roster-cts` incluye incorporación, respuesta idempotente, lectura posterior,
recarga, destino incorrecto, permiso denegado, temporada cerrada y errores de
vinculación/baja. `test:global-players` cubre regresiones del store. La auditoría
estática comprueba que el nuevo SQL no actualiza/elimina filas existentes.
Son pruebas simuladas y estáticas: no acreditan ejecución SQL ni rollback real.

En una base de pruebas: incorporar un perfil rival ficticio a CTS abierto,
comprobar una ficha y un binding, contar tarjetas tras recargar y reintentar.
Comparar exactamente todas las filas del origen antes/después. Probar permiso
denegado, temporada cerrada, concurrencia y fallo al insertar binding (debe
revertir también etapa/ficha/CTS). Finalmente dar de baja con la RPC instalada y
comprobar que conserva el perfil, origen e historial. No usar jugadores reales.

Sin SQL ejecutado, commit, push ni despliegue.
