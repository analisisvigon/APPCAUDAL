# APPCAUDAL · Sesiones 03A — plan de pruebas (no ejecutado)

Estos archivos son una propuesta para revisión. No aplicar en producción hasta contrastar el preflight, revisar la migración y superar las pruebas dinámicas en **staging**. Las pruebas de escritura/cierre requieren un entorno de staging aislado y un procedimiento de restauración; nunca se hacen sobre los 14 partidos, jugadores ni sesiones reales. Sesiones 01 permanece intacta y sus pruebas dinámicas pendientes no se consideran superadas.

## Orden de comprobación

1. Ejecutar `supabase_sessions_03a_preflight.sql` en Supabase SQL Editor con el rol administrativo previsto. Exportar su única tabla a CSV. Requerir `GLOBAL=READY_TO_APPLY`; contrastar columnas, FK y el mecanismo efectivo de cierre con las filas de detalle. Guardar `BASELINE_EXISTING_RLS_ACL_HASH`.
2. Aplicar `supabase_sessions_03a.sql` **solo tras autorización expresa**. Una excepción revierte toda la transacción. No repetir a ciegas si el preflight o una postcondición falla.
3. Ejecutar `supabase_sessions_03a_verify.sql`, exportar CSV y requerir `GLOBAL=PASS_STRUCTURAL`. Comparar la huella RLS/ACL y los recuentos antiguos con el preflight. PASS estructural no certifica los helpers ni la concurrencia con identidades reales.
4. Ejecutar la matriz dinámica en staging con identidades verificadas. Simular JWT y rol `authenticated` como en los verificadores 35/39B, y comprobar `auth.uid()` en cada caso. No usar `service_role` como prueba de RLS. Cada ensayo mutable debe estar aislado y dejar staging restaurado. Registrar evidencia, UUID de CTS de staging y revisión esperada sin publicar datos personales.

## Matriz dinámica mínima en staging

| Caso | Resultado esperado |
| --- | --- |
| Owner activo, CTS abierto, fecha entre `starts_on`/`ends_on` | Crea borrador revisión 1, número NULL, un evento `created`. |
| Admin activo cuando exista identidad real | Misma autorización deportiva que owner; sin crear identidad ficticia. Si no existe, PENDING. |
| Staff asignado explícitamente al CTS | Puede crear, guardar, confirmar y leer. Sin asignación, ninguna de esas operaciones escribe o devuelve filas internas. |
| Staff de otro CTS/temporada, player, viewer y anon | Sin lectura ni RPC deportiva autorizada. Casos sin identidades reales = PENDING. |
| Fecha anterior/posterior al intervalo canónico, UUID NULL/inexistente, CTS ajeno | Error/denegación y cero filas nuevas. La fecha no cambia de CTS automáticamente. |
| Borrador sin slots | Confirma con número 1 positivo; las tres fases vacías siguen representables en UI futura. |
| Borrador con slot vacío | Guardado permitido; confirmación denegada íntegramente, sin consumir número. |
| Dos actividades libres en un slot de 15 minutos y otro slot de 10 | Duración total derivada 25 minutos, no 40; actividad individual >15 rechazada. |
| `library_task` o snapshot arbitrario en payload | Rechazo sin persistencia; Biblioteca original no cambia. |
| Confirmación repetida con revisión vigente | Devuelve la misma revisión y número, sin nuevo evento ni consumo del contador. Revisión obsoleta falla. |
| Dos confirmaciones concurrentes de borradores del mismo CTS | Números diferentes y consecutivos; una única asignación por borrador. Probar con dos conexiones. |
| Dos guardados concurrentes partiendo de revisión N | Uno llega a N+1; el segundo falla por conflicto y no sobrescribe. |
| Guardado idéntico con revisión vigente | No incrementa revisión ni añade evento. |
| Cambio de fecha/cabecera/franjas/actividades de confirmada abierta | Estado continúa `confirmed`, una revisión y un evento por operación; fecha fuera de intervalo rechazada. |
| Cambio manual de número a libre y luego a uno ocupado | El primero registra revisión/evento y contador no decrece; el segundo revierte todo. El siguiente número automático supera el máximo histórico. |
| Swap de órdenes de franjas/ítems y payload con UUID duplicados | Swap válido; duplicados rechazados o rollback de constraint, sin estado parcial. |
| DELETE/UPDATE/INSERT REST directo por authenticated, incluso en hijas, contador y auditoría | Privilegios/RLS deniegan; RPC son la única ruta cliente de escritura. |
| Cierre concurrente frente a guardar/confirmar | Si el cierre obtiene primero lock, escritura falla; si el guardado obtiene primero lock, termina antes del cierre. Después, lectura autorizada persiste y toda escritura 03A falla. |
| Revocación de membership o asignación | Operación posterior pierde autorización; no se reactivan asignaciones revocadas automáticamente. Probar coordinación transaccional en staging. |
| Auditoría | Una fila por revisión, actor igual a `auth.uid()`/membership del club, sin datos personales, notas privadas ni copia de pizarras en metadata. |

Para probar cierre, usar únicamente temporada y usuarios de staging diseñados para esta prueba. No cerrar la temporada 2026/2027 de producción. Probar también que un UPDATE administrativo de `club_seasons.status` realmente compite por el mismo bloqueo de fila; si existe una RPC de cierre distinta en staging/producción, auditar su secuencia de locks antes de dar el caso por superado.

## Recuperación y criterios de parada

- Error del preflight, divergencia de esquema, nombre conflictivo, política adicional, hash base distinto, fallo de postflight o prueba dinámica obligatoria: **detener** el despliegue. No relajar RLS ni fabricar una asignación para que pase.
- Si falla la migración antes del COMMIT, PostgreSQL revierte los objetos nuevos. Verificar estado de catálogo y corregir la causa en un archivo revisado, no aplicar fragmentos a mano.
- Si ya hay datos 03A, no hacer `DROP` como reversión: ocultar la futura UI por feature flag, bloquear nuevas escrituras y preparar migración correctiva conservando historia y auditoría. Si las cinco tablas siguen vacías, una retirada de objetos nuevos requeriría autorización separada y comprobación previa de dependencias.
- No avanzar a 03B hasta tener CSV de pre/postflight, comparación de huellas y matriz dinámica en staging sin fallos críticos. Los escenarios sin identidad real se documentan como PENDING.
