# Transición 02: operaciones iniciales y protección del archivo

**Estado:** SQL preparado, no instalado. No designar todavía Libia ni activar
`VITE_MULTICLUB_03_CTS_ENABLED` en producción. Este bloque no ejecuta SQL ni
modifica la rama legacy o PLAYER. Ninguna de las RPC nuevas concede escritura
si el registro operativo está vacío o `writes_enabled=false`.

## Bloque A: preparación reversible, sin CTS operativo

1. Revisar y ejecutar manualmente
   `supabase_transition_02_operational_preflight.sql`.
2. Si coincide el contrato, revisar y ejecutar manualmente
   `supabase_transition_02_operational_prepare.sql`.
3. Revisar y ejecutar manualmente
   `supabase_transition_02_operational_postflight.sql`.
   Debe devolver **cero** filas operativas y `no_writes_enabled=true`.

Estas RPC nuevas son `create_operational_player_v1`,
`edit_operational_player_v1`, `create_operational_match_v1` y
`edit_operational_match_v1`. `my_operational_cts_v1()` devuelve el CTS
designado únicamente a la cuenta owner autorizada para abrirlo por defecto;
si no hay designación, el selector continúa sin preferencia operativa. El alta
de jugador reutiliza la RPC 03B; las
ediciones solo afectan campos locales de una ficha con vínculo exacto. Los
partidos solo admiten alta y edición de campos de agenda de una `Previa`,
con fecha dentro de la temporada del CTS.
Cada RPC bloquea la fila del registro operativo y vuelve a comprobar
`can_write_club_team_season`; el frontend no es su barrera de seguridad.

## Bloque B: corte futuro, aún bloqueado

1. Preparar y verificar respaldo restaurable de base de datos y Storage.
2. Crear y verificar **manualmente** el CTS de Libia y la membresía owner de
   la cuenta personal. No crear ni inferir vínculos del Caudal.
3. Revisar `supabase_transition_02_designate_template.sql` y completar sus
   dos UUID exactos tras verificar el CTS y la cuenta owner. Designa la única
   fila de `operational_cts_v1` con `writes_enabled=false`. El trigger exige
   temporada abierta y activa, equipo propio y membresía owner activa. La plantilla
   original con valores `NULL` falla sin modificar nada.
4. Resolver los requisitos y pruebas negativas de 03C; instalarlo solamente
   cuando su propio preflight y postflight sean correctos. Cerrar también las
   rutas de escritura históricas **fuera** de su perímetro: perfiles globales,
   etapas, equipos, bibliotecas, sesiones, documentos, Storage y cualquier RPC
   `SECURITY DEFINER` que modifique esos datos. La política legacy `ALL true`
   de rivales también requiere decisión específica. Ninguna fila histórica
   debe quedar escribible mediante consultas directas o funciones indirectas.
5. Tras comprobar las cuatro operaciones SQL directas y RPC con cuentas
   authenticated de Libia, Caudal y sin acceso, revisar
   `supabase_transition_02_archive_cutover.sql`. **Actualmente aborta siempre**
   con `ARCHIVE_CUTOVER_BLOCKED_PENDING_INDIRECT_WRITE_PROTECTION`: el corte
   indirecto de los módulos ajenos a 03C no está acreditado. En una revisión
   posterior, una vez cerrado ese perímetro y retirado expresamente el
   interbloqueo, el archivo restringirá el helper común al CTS designado y
   habilitará `writes_enabled` en **la misma transacción**. Verificar con
   `supabase_transition_02_archive_postflight.sql` y repetir las pruebas
   negativas bajo JWT reales, nunca como `postgres` o `service_role`.
6. Solo entonces considerar activar el frontend CTS de producción.

**Detenerse** si una RPC legacy o una tabla hija permite cambiar el Caudal,
si hay políticas permisivas adicionales, si un registro deportivo carece de
CTS exacto o si falla PLAYER. El corte futuro preparado aquí cubre el
perímetro de Plantilla/Partidos de 03C; no certifica los demás módulos.

## Ensayo funcional obligatorio antes del bloque B

Usar un Supabase aislado con dos clubes y usuarios ficticios autenticados:

| Actor / intento | Resultado esperado |
| --- | --- |
| Owner y staff de Libia con CTS operativo abierto: alta de jugador nuevo y partido `Previa`, edición local de ficha y agenda | Éxito; cada fila queda en el CTS operativo y las lecturas RPC la muestran. |
| Repetir alta de jugador con otro UUID pero igual identidad externa | Conflicto; ninguna fila parcial. |
| Repetir alta con el mismo UUID de ficha | Conflicto seguro; no sustituye la ficha. |
| Staff solo del Caudal o usuario sin membresía: llamar las cuatro RPC con UUID de Libia conocido | Denegado y sin cambios. |
| Owner de Libia: editar UUID de ficha o partido del Caudal, o pasar CTS Caudal como parámetro | Denegado y sin cambios. |
| Enviar en JSON `club_team_season_id`, `id`, `status` o claves no permitidas | Denegado; no se altera el CTS ni el resultado. |
| Editar partido ya jugado | Denegado; solo se edita una `Previa`. |
| Crear o mover una previa fuera de las fechas de la temporada del CTS | Denegado; no aparece una fila parcial. |
| Consultas directas y RPC legacy: INSERT, UPDATE y DELETE sobre Caudal y todas las tablas hijas del perímetro 03C | Denegado, también a través de funciones `SECURITY DEFINER`. |
| Temporada cerrada, revocación de membresía y cambio de CTS durante una carga | Sin escritura ni datos retenidos del contexto anterior. |
| PLAYER ficticio y snapshots anteriores de Tareas/ABP | Misma visibilidad y contenido antes y después del corte. |

Ejecutar los intentos bajo sesiones `authenticated` distintas; el SQL Editor
como `postgres` no representa la autorización del usuario. Registrar recuentos
y hashes de las filas históricas antes y después. Si un caso falla, no activar
el registro operativo ni el frontend CTS.

## Bibliotecas y snapshots

`training_library` no contiene propietario personal y su SQL actual concede
`ALL true` a authenticated. `training_tasks` pertenece a un club y su
autorización depende de ese club. Montar sus editores en CTS expondría recursos
de otro club o permitiría escrituras históricas. Permanecen sin montar hasta
una migración personal específica. Las referencias y snapshots ya guardados
en sesiones y partidos no se transforman ni se eliminan en este bloque.
