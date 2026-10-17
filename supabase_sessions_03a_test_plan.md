# APPCAUDAL · Sesiones 03A — plan de pruebas (no ejecutado)

Estos archivos son una propuesta para revisión. No aplicar en producción hasta contrastar el preflight, revisar la migración y superar las pruebas dinámicas en **staging**. Las pruebas de escritura/cierre requieren un entorno de staging aislado y un procedimiento de restauración; nunca se hacen sobre los 14 partidos, jugadores ni sesiones reales. Sesiones 01 permanece intacta y sus pruebas dinámicas pendientes no se consideran superadas.

## Orden de comprobación

1. Ejecutar `supabase_sessions_03a_preflight.sql` en Supabase SQL Editor con el rol administrativo previsto. Exportar su única tabla a CSV. Requerir `GLOBAL=READY_TO_APPLY`; contrastar columnas, FK y el mecanismo efectivo de cierre con las filas de detalle. Guardar `BASELINE_EXISTING_RLS_ACL_HASH`.
2. Aplicar `supabase_sessions_03a.sql` **solo tras autorización expresa**. Una excepción revierte toda la transacción. No repetir a ciegas si el preflight o una postcondición falla.
3. Ejecutar `supabase_sessions_03a_verify.sql`, exportar CSV y requerir `GLOBAL=PASS_STRUCTURAL`. Comparar la huella RLS/ACL y los recuentos antiguos con el preflight; revisar `CONSTRAINT_DDL` y `POLICY_USING` contra la migración. Las huellas de `prosrc` deben coincidir. PASS estructural no certifica equivalencia lógica de todos los CHECK/RLS ni la concurrencia con identidades reales.
4. Ejecutar la matriz dinámica en staging con identidades verificadas. Simular JWT y rol `authenticated` como en los verificadores 35/39B, y comprobar `auth.uid()` en cada caso. No usar `service_role` como prueba de RLS. Cada ensayo mutable debe estar aislado y dejar staging restaurado. Registrar evidencia, UUID de CTS de staging y revisión esperada sin publicar datos personales.

## Contrato de `save_planned_session`

`p_header` es un **PATCH parcial** de nueve campos: clave omitida conserva el valor previo, JSON `null` lo borra y una cadena lo sustituye. `{}` no borra observaciones. `starts_at` se normaliza como `time`: `10:00` y `10:00:00` representan el mismo valor y no deben provocar una revisión artificial. La fecha `p_session_date` y la revisión esperada se envían siempre por separado. `p_slots` es el documento **completo** de franjas/actividades visibles; cada objeto de franja e ítem debe incluir todas sus claves aprobadas (las opcionales pueden valer JSON `null`) y cada fila conservada mantiene su UUID. Para retirar una fila existente no basta con omitirla del documento: su UUID debe figurar además en `p_removed_slot_ids` o `p_removed_item_ids`. Esas listas deben coincidir exactamente con las filas existentes omitidas, sin duplicados ni UUID de otra sesión. Al retirar una franja, sus actividades deben moverse a otra franja o retirarse expresamente también.

Las franjas e ítems conservados se actualizan solo si cambiaron; los nuevos se insertan; se eliminan solo los UUID de retirada expresa, primero ítems y después franjas. Un FK futura `RESTRICT` impedirá la retirada física de una fila referenciada. Si 03C incorpora multimedia/grupos/zonas referenciando ítems o franjas, deberá aprobarse una retirada lógica mínima (por ejemplo `retired_at` y consultas de elementos vigentes) antes de permitir retirar esas filas; **03A no crea esas columnas ni tablas**. La auditoría ligera de 03A registra huellas, no reconstruye versiones anteriores completas.

La huella del estado 03A ya incluye `source_task_uuid_snapshot` y `task_snapshot`, aunque la RPC 03A rechaza `library_task`. En 03C habrá que ampliar de forma autorizada la validación y el UPDATE diferencial del ítem para editar snapshots y añadir a la huella las nuevas relaciones de multimedia/grupos/zonas; no se debe volver al borrado/recreación general ni confiar en que el hash de 03A cubra tablas que todavía no existen.

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
| Guardar `p_header={}` en sesión con objetivos y observaciones | Ambos valores permanecen; mismo estado = misma revisión y sin evento. |
| Guardar `starts_at` como `10:00` cuando ya vale `10:00:00` | Mismo estado normalizado; no crea revisión ni evento. Un cambio real de hora sí crea uno. |
| Guardar PATCH de solo `objectives` | Cambia únicamente objetivos; observaciones y restantes campos se conservan. |
| Guardar `{"staff_observations":null}` | Borra únicamente ese campo; una revisión y un evento. Un objeto/array donde se espera cadena o null se rechaza. |
| Editar una sola actividad entre varias | Solo esa fila cambia `updated_at`; UUID y `created_at` de todas las filas conservadas permanecen. Un evento/revisión. |
| Reordenar dos actividades de la misma franja o dos franjas | Los UUID y referencias permanecen; unicidad diferida permite el intercambio y el orden final es único. |
| Mover una actividad de una franja a otra | Conserva UUID y `created_at`, cambia `slot_id`; cualquier referencia por ID permanece. Duración válida en la franja de destino. |
| Añadir franja/actividad y retirar una actividad con su UUID en la lista explícita | Solo nuevas filas se insertan y solo la señalada se retira; una revisión/evento. |
| Omitir una actividad/franja existente sin incluirla en la lista de retiradas | Se rechaza todo el guardado; ningún borrado accidental ni revisión nueva. |
| Omitir `free_comments` u otra clave del documento completo de un ítem | Rechazo; el cliente debe enviar `null` expresamente para borrarla. |
| Intentar retirar UUID ajeno, inexistente, repetido o todavía incluido en `p_slots` | Rechazo completo; no filtra detalles de otra sesión. |
| Retirar franja con actividad no movida ni retirada expresamente | Rechazo; no queda hijo huérfano. |
| `library_task` o snapshot arbitrario en payload | Rechazo sin persistencia; Biblioteca original no cambia. |
| Confirmación repetida con revisión vigente | Devuelve la misma revisión y número, sin nuevo evento ni consumo del contador. Revisión obsoleta falla. |
| Dos confirmaciones concurrentes de borradores del mismo CTS | Números diferentes y consecutivos; una única asignación por borrador. Probar con dos conexiones. |
| Dos guardados concurrentes partiendo de revisión N | Uno llega a N+1; el segundo falla por conflicto y no sobrescribe. |
| Guardado idéntico con revisión vigente | No incrementa revisión ni añade evento. |
| Cambio de fecha/cabecera/franjas/actividades de confirmada abierta | Estado continúa `confirmed`, una revisión y un evento por operación; fecha fuera de intervalo rechazada. |
| Editar confirmada dejando un slot sin actividad o una actividad más larga que su franja | Rechazo íntegro; sesión sigue confirmada en su revisión anterior. Fases totalmente vacías siguen permitidas. |
| Cambio manual de número a libre y luego a uno ocupado | El primero registra revisión/evento y contador no decrece; el segundo revierte todo. El siguiente número automático supera el máximo histórico. |
| Swap de órdenes de franjas/ítems y payload con UUID duplicados | Swap válido; duplicados rechazados o rollback de constraint, sin estado parcial. |
| DELETE/UPDATE/INSERT REST directo por authenticated, incluso en hijas, contador y auditoría | Privilegios/RLS deniegan; RPC son la única ruta cliente de escritura. |
| Cierre concurrente frente a guardar/confirmar | Si el cierre obtiene primero lock, escritura falla; si el guardado obtiene primero lock, termina antes del cierre. Después, lectura autorizada persiste y toda escritura 03A falla. |
| Revocación de membership o asignación | Operación posterior pierde autorización; no se reactivan asignaciones revocadas automáticamente. Probar dos transacciones con revocación durante un guardado y el orden membership→asignación. |
| Fallo tras reservar número (p. ej., constraint o auditoría) | Rollback de número, contador, revisión y evento; el siguiente intento válido no pierde un número. |
| Auditoría | Una fila por revisión, actor igual a `auth.uid()`/membership del club, sin datos personales, notas privadas ni copia de pizarras en metadata. |

Para probar cierre, usar únicamente temporada y usuarios de staging diseñados para esta prueba. No cerrar la temporada 2026/2027 de producción. Probar también que un UPDATE administrativo de `club_seasons.status` realmente compite por el mismo bloqueo de fila; si existe una RPC de cierre distinta en staging/producción, auditar su secuencia de locks antes de dar el caso por superado. El orden previsto en las RPC es temporada → sesión → membership → asignación staff → contador → hijas/auditoría; los triggers vuelven a comprobar la temporada ya bloqueada. Verificarlo con dos conexiones y `lock_timeout` acotado: el mero `FOR UPDATE` no demuestra ausencia de interbloqueos. Las escrituras administrativas directas con privilegios fuera de las RPC pueden tener otro orden y no forman parte del contrato cliente.

## Recuperación y criterios de parada

- Error del preflight, divergencia de esquema, nombre conflictivo, política adicional, hash base distinto, fallo de postflight o prueba dinámica obligatoria: **detener** el despliegue. No relajar RLS ni fabricar una asignación para que pase.
- Si falla la migración antes del COMMIT, PostgreSQL revierte los objetos nuevos. Verificar estado de catálogo y corregir la causa en un archivo revisado, no aplicar fragmentos a mano.
- Si ya hay datos 03A, no hacer `DROP` como reversión: ocultar la futura UI por feature flag, bloquear nuevas escrituras y preparar migración correctiva conservando historia y auditoría. Si las cinco tablas siguen vacías, una retirada de objetos nuevos requeriría autorización separada y comprobación previa de dependencias.
- No avanzar a 03B hasta tener CSV de pre/postflight, comparación de huellas y matriz dinámica en staging sin fallos críticos. Los escenarios sin identidad real se documentan como PENDING.
