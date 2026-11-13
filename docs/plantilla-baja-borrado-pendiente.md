# Estado de la revisión de bajas y eliminación de Plantilla

Pendiente de recibir el inventario real de Supabase. Ejecutar únicamente
`supabase_roster_departure_v1_verify.sql`, de solo lectura, y compartir todos
sus resultados. No instalar todavía `supabase_roster_departure_v1.sql`.

La RPC antigua rechaza cualquier trigger DELETE habilitado en su lista de tablas
antes de consultar el jugador. `PLAYER_DELETE_TRIGGER_REVIEW_REQUIRED` es ese
rechazo preventivo, no la prueba de un fallo del trigger ni de historial deportivo.
El nombre del trigger instalado que lo provoca aún no se conoce. La interfaz
deducía ausencia de historial a partir de estadísticas parciales y no enviaba CTS.
La RPC además mezcla baja con borrado y permite roles STAFF sin autorización global
suficiente. El guard canónico prohíbe eliminar pertenencias históricas.

Hay una propuesta local de baja CTS separada: confirma contexto, autorización,
temporada abierta, pertenencia y respuesta; relee el roster antes de actualizarlo.
Solo marca has_departed en la pertenencia exacta. No inventa left_on ni modifica
fichas, perfiles, etapas globales, otras temporadas o snapshots. Añade auditoría
privada e inmutable y propone revocar acceso de clientes a la RPC antigua.
La interfaz ofrece dos opciones explícitas; la definitiva permanece bloqueada.

El borrado definitivo de jugadores de prueba NO está implementado ni validado.
Falta revisar todas las FK y triggers reales, referencias sin FK (JSON/snapshots),
el alcance de las etapas y las excepciones mínimas necesarias a guards históricos.
No sustituir esa revisión por desactivar triggers, borrar historial o permitir
cascadas. La migración de baja tampoco debe instalarse antes de revisar el inventario.

Pruebas locales: test:roster-cts y rosterDeparture.test.js, con mocks y auditoría
estática. No acreditan rollback, permisos ni borrado real en PostgreSQL. Tras
revisar el inventario habrá que completar las pruebas de base de datos en un
entorno de pruebas antes de instalar y publicar. No se ha ejecutado SQL ni datos
reales, y no se ha realizado commit, push ni despliegue.
