# Estado de la revisión de bajas y eliminación de Plantilla

## Nuevo encargo: borrado con historial (20 noviembre 2026)

El propietario solicita ahora borrar también los datos individuales históricos.
Las prohibiciones anteriores basadas únicamente en historial dejan de ser el
requisito de producto. La baja CTS permanece intacta y separada.

Se prepara `supabase_player_erasure_inventory_readonly.sql`: inventario único JSON
del esquema instalado, con FK indirectas, CHECK/NOT NULL, índices, RLS, triggers
y sus cuerpos, reglas y columnas potencialmente portadoras de referencias sin FK.
No consulta registros personales ni instala funciones. Este resultado es necesario
antes de escribir las excepciones completas y limitadas de los guards.

Hallazgos concretos que impiden un borrado genérico seguro:

- `partido_eventos_sustitucion` contiene ambos participantes con UUID y nombre
  NOT NULL: borrar la fila destruiría parte de la participación del otro jugador.
  Hay que adaptar su representación para permitir un participante suprimido y
  conservar minuto, evento, partido y el otro participante.
- Plantillas congeladas y disponibilidades de sesiones tienen identidad y FK
  protegidas. Se borran solo las filas del jugador, nunca la sesión ni sus tareas.
- `planned_session_distributions` conserva UUID en arrays JSON. Las auditorías
  de sesiones y `planned_session_deletion_archive_v1` pueden contener copias
  completas. `roster_departure_audit_v1` conserva pertenencias antes/después.
  Deben purgarse exclusivamente los fragmentos del jugador.
- `fine_payments` tiene un guard de ledger inmutable. Hace falta una excepción
  transaccional exclusiva de esta operación, sin liberar UPDATE/DELETE general.
- Existe identidad de portal PLAYER en `club_memberships`: retirar su enlace y
  acceso deportivo sin eliminar una cuenta compartida de propietario/STAFF.
- Fotos/adjuntos pueden estar en Storage: SQL no puede garantizar rollback de un
  borrado externo de archivos. Hay que inventariar sus rutas y acordar la limpieza
  posterior de objetos exclusivos, sin borrar archivos compartidos.

La migración de borrado definitivo NO está escrita ni lista para instalar. No se
ha generado una RPC de borrado parcial ni una sustitución global de UUID/nombres
en JSON. Hace falta el inventario real y revisar las estructuras de cada módulo.
Su diseño será una RPC con autorización de propietario en backend (los roles
actuales son por club: debe acreditar propiedad en todos los clubes afectados),
confirmación ELIMINAR, request_id idempotente, bloqueo de identidades, tratamiento
explícito de cada tabla/JSON, eliminación de identidades al final y auditoría mínima
sin nombres, fotos ni snapshots. Errores revierten todo; un reintento vuelve a
comprobar autorización. No se impedirá el borrado por tener historial.

Preparación local de frontend: `GlobalPlayerDatabase.jsx` exige ELIMINAR y evita
dobles envíos; `globalPlayerErasure.js` define el contrato exclusivo de la futura
RPC, sin fallback legacy ni rechazo por historial. El módulo todavía no está
conectado a App: `canDelete=false` sigue impidiendo anunciar disponible un backend
inexistente. El resto de esta documentación describe la propuesta anterior.

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
