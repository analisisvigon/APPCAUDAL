# Sesiones 01 — plan de pruebas dinámicas

Estado inicial comunicado por el propietario: migración instalada; preflight 13/13, postflight estructural 22/22, tabla nueva vacía y huella fuente igual a `90d8d50c1eb26874bd2f883f2d71ae9e`. **Nada de lo siguiente se ha ejecutado desde Codex. Resultado dinámico global: PENDING.** Esos PASS son estructurales, no sustituyen los casos dinámicos.

Archivos: `runtime_readonly.sql` = diagnóstico de producción; `runtime_transactional.sql` = simulación de lectura en producción; `runtime_staging.sql` = pruebas con escrituras solo en clon/staging, bloqueado intencionadamente hasta revisión del proyecto. En la matriz se abrevian como **RO**, **TX** y **STG**. Todas las filas empiezan `PENDING`; no se anotará `PASS` sin resultado y evidencia de la ejecución correspondiente.

## Orden y seguridad

1. En producción, ejecutar solo **RO** y exportar su única tabla a CSV. Si aparece `BLOCKED`, detenerse. El recuento cero impide probar RLS sobre filas reales.
2. Revisar los tres UUID de usuario previamente comunicados y ejecutar **TX** completo en producción solo si el propietario acepta la **simulación**. El script revalida memberships activas, usa `SET LOCAL ROLE authenticated`, fija `request.jwt.claim.sub` y `request.jwt.claims`, comprueba `auth.uid()` antes de cada caso y termina en `ROLLBACK`. No escribe en tablas. Guardar los `NOTICE`. Si hay error, ejecutar `ROLLBACK` en esa sesión. Una simulación desde SQL Editor privilegiado comprueba la lógica SQL, no la emisión real de tokens ni el acceso desde la aplicación.
3. Crear o identificar un proyecto **staging aislado** con el mismo esquema aprobado y una copia controlada de los datos necesarios. Revisar visualmente la URL/proyecto antes de abrir **STG**. Su primer bloque provoca una excepción deliberada **dentro de `BEGIN`**, por lo que no se puede usar inadvertidamente. Retirarlo solo en la copia; el resto del archivo sigue dentro de la transacción y termina en `ROLLBACK`. Si un caso falla, ejecutar `ROLLBACK` manualmente y no proseguir; los `NOTICE PASS` anteriores no equivalen a un resultado global favorable. Ejecutar después RO en staging y comparar recuentos de tabla, asignaciones y temporada con el preflight.
   La fila final `STATE_ONLY_NOT_SUITE_PASS_COMPARE_ASSIGNMENTS` verifica estado tras el rollback, **no demuestra que la batería haya llegado a ejecutarse**: exigir también todos los `NOTICE` de los bloques y ausencia de excepciones inesperadas.
4. La prueba de concurrencia requiere dos conexiones de staging y coordinación manual. No se puede demostrar con un clic de SQL Editor.
5. Para elevar el resultado a seguridad funcional, repetir los casos principales desde clientes realmente autenticados en staging: owner, staff asignado/no asignado y player. `SET ROLE` + GUC de JWT no valida el servicio de autenticación ni PostgREST.

El guion STG solo lee `jugadores`, `players_database`, `player_team_memberships` y `club_memberships`. Escribe temporalmente en `club_team_season_players`, crea una asignación temporal en `club_team_season_permissions` y cierra **solo la temporada clonada**; el `ROLLBACK` revierte las tres acciones. Antes de escribir verifica tabla vacía, fixture existente, roles, guard exacto y ausencia de triggers ajenos en los objetos escritos. No crea usuarios ni altera fichas o etapas deportivas. Una FK, trigger nuevo o efecto externo añadido posteriormente exige revisar de nuevo este protocolo; el rollback de PostgreSQL no deshace llamadas externas que pudieran añadirse por fuera del diseño auditado.

## Matriz

| ID | Escenario | Esperado | Entorno / bloque | Estado | Evidencia requerida |
|---|---|---|---|---|---|
| I01 | Owner activo, contexto `auth.uid()` | UID y rol coinciden | Producción TX `owner` | PENDING | NOTICE o error |
| I02 | Owner lee y escribe según helpers | TRUE / TRUE | Producción TX `owner` | PENDING | NOTICE; sin filas no prueba RLS |
| I03 | Staff real sin asignación | FALSE / FALSE | Producción TX `staff_unassigned` | PENDING | NOTICE |
| I04 | Player real | FALSE / FALSE | Producción TX `player` | PENDING | NOTICE |
| I05 | Anon no puede consultar tabla | Permiso denegado | Producción TX `anonymous` | PENDING | NOTICE |
| I06 | Owner ve una fila activa; staff sin asignar no | 1 / 0 | STG `owner_seed`, `staff_unassigned` | PENDING | NOTICE |
| I07 | Staff asignado temporalmente | Helper lectura/escritura TRUE; ve activa | STG `grant_staff`, `staff_assigned` | PENDING | NOTICE |
| I08 | Player no ve fila activa ni inserta | 0; INSERT denegado | STG `player` | PENDING | NOTICE |
| I09 | Anon no lee ni inserta | Ambos denegados | STG `anon` | PENDING | NOTICE |
| D01 | Alta con `joined_on=NULL` | Admitida; fecha histórica no acreditada | STG `owner_seed` | PENDING | NOTICE; interpretación de negocio pendiente de UI |
| D02 | Alta con fecha conocida | Admitida en la temporada | STG `owner_cases` (retorno) | PENDING | NOTICE |
| D03 | Incorporación antes del comienzo | CHECK/guard rechaza | STG `owner_cases` | PENDING | NOTICE |
| D04 | Incorporación después del final | CHECK/guard rechaza | STG `owner_cases` | PENDING | NOTICE |
| D05 | Completar fecha inicialmente NULL | Admitido | STG `owner_seed` | PENDING | NOTICE |
| D06 | Sustituir fecha acreditada | Rechazado | STG `owner_seed` | PENDING | NOTICE |
| D07 | Sin salida registrada | `has_departed=false`, `left_on=NULL` | STG `owner_seed` | PENDING | NOTICE |
| D08 | Salida acreditada sin fecha | `has_departed=true`, `left_on=NULL` | STG `owner_cases` | PENDING | NOTICE |
| D09 | Salida exclusiva | Día anterior incluido, fecha de salida excluida | STG `owner_cases` | PENDING | NOTICE |
| D10 | Salida igual o anterior a llegada | Rechazada | STG `owner_cases` | PENDING | NOTICE |
| D11 | Solapamiento de periodos | GiST rechaza | STG `owner_cases` | PENDING | NOTICE |
| D12 | Periodos contiguos y regreso | Admitidos | STG `owner_cases` | PENDING | NOTICE |
| D13 | Regreso tras salida desconocida | Rechazo conservador | STG `owner_cases` | PENDING | NOTICE |
| D14 | Dos periodos abiertos simultáneos | GiST rechaza | STG `owner_cases` | PENDING | NOTICE |
| D15 | Jugador sin etapa acreditada | Guard rechaza, solo si existe candidato real | STG `owner_cases` | PENDING | NOTICE PASS o PENDING |
| D16 | Límite inicial y salida desconocidos | No se convierte en presencia histórica; solape bloqueado | STG `owner_cases` | PENDING | NOTICE; lectura histórica depende de UI |
| V01 | Motivo inválido | Rechazado | STG `owner_cases` | PENDING | NOTICE |
| V02 | Owner anula con motivo válido | Se fija actor/instante; fila sigue almacenada | STG `owner_cases` | PENDING | NOTICE |
| V03 | Falsificar `voided_at` o actor | UPDATE de columna denegado | STG `owner_cases` | PENDING | NOTICE |
| V04 | Editar o anular otra vez una fila anulada | Rechazado | STG `owner_cases` | PENDING | NOTICE |
| V05 | Sustitución tras anulación | Admitida sin DELETE del original | STG `owner_cases` | PENDING | NOTICE |
| V06 | Staff intenta anular | Rechazado | STG `staff_assigned` | PENDING | NOTICE |
| V07 | Staff no ve anulación; owner sí | 0 / 1 para la fila anulada | STG `owner_cases`, `staff_assigned` | PENDING | NOTICE |
| V08 | Player o staff no autorizado rectifica | INSERT/UPDATE/anulación denegados | STG `staff_unassigned`, `player` | PENDING | NOTICE sobre filas activas |
| V09 | Cliente cambia `player_id` o usa DELETE | Denegado | STG `owner_cases` | PENDING | NOTICE |
| C01 | Owner lee histórico cerrado | TRUE y fila visible | STG `closed` | PENDING | NOTICE |
| C02 | Owner inserta/actualiza/anula cerrado | Tres rechazos | STG `closed` | PENDING | NOTICE |
| C03 | Staff asignado solo lee cerrado | TRUE lectura, FALSE escritura, UPDATE denegado | STG `closed_staff` | PENDING | NOTICE |
| C04 | DELETE o manipulación de auditoría en cerrado | Denegado también por privilegios/guard | STG `closed` | PENDING | NOTICE |
| K01 | Dos altas solapadas concurrentes | Una confirma, otra falla con conflicto GiST | Staging, dos conexiones | PENDING | Tiempos y SQLSTATE |
| K02 | Dos actualizaciones concurrentes de una fecha NULL | Una confirma; segunda reevalúa fila y falla o espera | Staging, dos conexiones | PENDING | Tiempos y SQLSTATE |
| K03 | Alta frente a cierre concurrente | Serialización por bloqueo de `club_seasons`; no alta posterior al cierre | Staging, dos conexiones | PENDING | Orden de commits y estado final |
| K04 | Doble anulación concurrente | Una se confirma; la segunda no cambia el registro | Staging, dos conexiones | PENDING | SQLSTATE / fila final |
| K05 | Reintento tras error previsto | La subtransacción revierte el intento; operaciones posteriores funcionan | STG `owner_cases` | PENDING | NOTICE |
| R01 | Reversión íntegra del fixture | Tabla vacía, temporada abierta, asignaciones como al inicio | Staging STG final + RO | PENDING | SELECT final y CSV comparado |

## Concurrencia en staging (dos conexiones)

Para K01–K04, preparar primero un clon o fixture controlado y registrar el recuento inicial. Abrir dos conexiones independientes (A/B), cada una autenticada como rol real de staging o con la simulación verificada de `auth.uid()`; `SET ROLE` solo no basta. Usar `BEGIN` en ambas, efectuar A sin `COMMIT`, lanzar B y observar bloqueo/resultado, terminar A y luego B. **Cada conexión debe terminar en `ROLLBACK` salvo en un clon desechable expresamente autorizado para observar el orden de commits.** Un único SQL Editor no demuestra concurrencia. No cerrar la temporada real. La exclusión GiST protege INSERTs solapados; los UPDATEs normales solo completan datos previamente NULL y reducen, no amplían, el intervalo. Para K02, usar dos completados distintos de la misma fecha NULL, no una falsa prueba de expansión del rango.

## Riesgos y criterio de cierre

- La tabla vacía en producción hace que `SELECT 0` no demuestre aislamiento por filas. Las filas STG son necesarias.
- El propietario debe confirmar que anular y sustituir en dos solicitudes de la futura interfaz es aceptable; si exige atomicidad entre ambas, haría falta una operación transaccional específica en fase posterior. No se añade ahora.
- `joined_on=NULL` permite pertenencia estacional, no certifica asistencia a una sesión histórica. El futuro planificador deberá distinguir `CONFIRMADO`, `AUSENTE` y `DESCONOCIDO` y guardar snapshots propios.
- El guion no prueba autenticación real, API/PostgREST, caché de esquema ni permisos de frontend. Deben validarse en staging con clientes reales antes de cargar jugadores.
- No hay evidencia de un defecto funcional en el SQL instalado por mera lectura estática; la anulación por owner se considera **pendiente de prueba**, especialmente la interacción SELECT/UPDATE RLS y el UPDATE de `void_reason`.
- Si cualquier prueba devuelve resultado inesperado, conservar SQLSTATE y `NOTICE`, no corregir la migración instalada en el mismo paso. Diseñar una migración correctiva separada tras diagnosticar la causa.

Enviar para la revisión: CSV completo de RO, `NOTICE` y errores de TX, `NOTICE`/SQLSTATE y SELECT final de STG, comparación de asignaciones antes/después y evidencias de las cuatro pruebas K si se realizan. No enviar nombres ni datos personales de jugadores.
