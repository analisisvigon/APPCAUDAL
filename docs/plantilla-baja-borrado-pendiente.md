# Estado de la revisión de bajas y eliminación de Plantilla

La baja CTS queda preparada para revisión e instalación manual. El borrado global
sigue bloqueado por seguridad. Revisar `supabase_roster_departure_v1_verify.sql`
antes de instalar `supabase_roster_departure_v1.sql` en una base de pruebas.

La RPC antigua rechaza cualquier trigger DELETE habilitado en su lista de tablas
antes de consultar el jugador. `PLAYER_DELETE_TRIGGER_REVIEW_REQUIRED` es ese
rechazo preventivo, no la prueba de un fallo del trigger ni de historial deportivo.
El nombre del trigger instalado que lo provoca aún no se conoce. La interfaz
deducía ausencia de historial a partir de estadísticas parciales y no enviaba CTS.
La RPC además mezcla baja con borrado y permite roles STAFF sin autorización global
suficiente. El guard canónico prohíbe eliminar pertenencias históricas.
El usuario ha confirmado además la condición legacy de un solo club y que la RPC
no elimina el perfil global ni la etapa: no sirve como borrado global multiclub.
`remove_global_player_from_current_team` tampoco sirve para una baja CTS porque
modifica etapas de distintos equipos; no se usa en este recorrido.

Los SQL del repositorio contienen `transition_02_ficha_change_guard` en jugadores
y `guard_cts_physical_metric_4b` en cargas, que cumplen el predicado del rechazo.
El verificador incluye ahora una consulta específica que devuelve TODOS los
triggers realmente instalados que lo activan, con sus funciones completas.

Hay una propuesta local de baja CTS separada: confirma contexto, autorización,
temporada abierta, pertenencia y respuesta; relee el roster antes de actualizarlo.
Solo marca has_departed en la pertenencia exacta. No inventa left_on ni modifica
fichas, perfiles, etapas globales, otras temporadas o snapshots. Añade auditoría
privada e inmutable y propone revocar acceso de clientes a la RPC antigua.
La interfaz ofrece dos opciones explícitas; la definitiva permanece bloqueada.
La RPC bloquea temporada, actor/asignación STAFF y pertenencia. El reintento exige
de nuevo autorización. Conserva fechas acreditadas y el guard original sin cambios;
si la actualización altera otros campos de pertenencia, aborta. La auditoría y la
baja se escriben en una sola transacción, sin DELETE. La migración se instala una
vez y comprueba que el guard canónico está habilitado antes de crear la RPC.
La UI bloquea dobles envíos, cierra la confirmación al cambiar CTS y verifica la
lectura posterior antes de actualizar tarjetas y contadores.

El borrado definitivo de jugadores de prueba NO está implementado ni validado.
Falta revisar todas las FK y triggers reales, referencias sin FK (JSON/snapshots),
el alcance de las etapas y las excepciones mínimas necesarias a guards históricos.
No sustituir esa revisión por desactivar triggers, borrar historial o permitir
cascadas. La migración de baja tampoco debe instalarse antes de revisar el inventario.
No se autoriza eliminar ninguna entidad global. Una futura operación deberá
exigir propietario autorizado y perfil exclusivo, sin referencias que deban
conservarse; también deberá ser transaccional y auditable. No se borrarán partidos,
sesiones, estadísticas, tratamientos o multas para hacer pasar la comprobación.

Pruebas locales: test:roster-cts y rosterDeparture.test.js, con mocks y auditoría
estática. No acreditan rollback, permisos ni borrado real en PostgreSQL. Tras
revisar el inventario habrá que completar las pruebas de base de datos en un
entorno de pruebas antes de instalar y publicar. No se ha ejecutado SQL ni datos
reales, y no se ha realizado commit, push ni despliegue.

La suite `npm.cmd run test:roster-cts` incluye ahora `rosterDeparture.test.js` y
la comprobación de recarga: aun existiendo ficha legacy, una baja canónica no
reaparece al crear un coordinador nuevo y no oculta al jugador en otro CTS.
Se comprueban respuestas incorrectas, falta de confirmación, errores, cambios
de contexto, permisos y temporada cerrada con mocks. El build y diff --check
también deben pasar antes de publicar.

Prueba de base de datos pendiente: baja sin historial, baja con historial, jugador
compartido, usuario sin permiso, temporada cerrada, reintento y fallo de auditoría
(debe revertir la baja). Comparar todas las otras pertenencias e historial antes y
después. Revisar los grants con el verificador tras instalar: RPC nueva accesible
solo a authenticated, RPC antigua sin acceso de clientes y archivo privado sin
políticas. Solo entonces publicar el frontend. La baja CTS no depende de habilitar
la eliminación definitiva.
