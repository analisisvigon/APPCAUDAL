# Eliminación de Sesiones: diagnóstico y corrección preparada

## Causa comprobada en el repositorio

El botón «Eliminar sesión» seleccionaba `retire` y abría una confirmación de
retirada lógica. Tanto el botón de confirmación como `performLifecycle` y
`changePlannedSessionLifecycle` estaban bloqueados por
`SESSION_RETIREMENT_BACKEND_VERIFIED = false`. Por ese recorrido no se enviaba
ninguna petición de borrado a Supabase. La RPC prevista, `change_planned_session_lifecycle_2c`,
solo actualiza el estado: tampoco borra dependencias.

Esto es independiente de `first_team`. Su migración solo amplía la lista de
estados de disponibilidad; no modifica claves foráneas ni el flujo de eliminación.

La FK `planned_session_player_availability_roster_fkey` sí usa `ON DELETE RESTRICT`.
Un DELETE de plantilla antes de disponibilidades fallaría por ella. No obstante,
hay además tres protecciones anteriores: los guards de sesión, plantilla congelada
y auditoría rechazan DELETE. Eliminar primero las disponibilidades no resuelve
esos bloqueos. No se ha verificado qué versiones están instaladas en producción;
no se atribuye un error remoto concreto sin su respuesta y el inventario real.

## Recorrido preparado

1. El menú separa eliminación de anulación/reactivación; estas últimas conservan
   su bloqueo anterior. No se activa globalmente la retirada histórica.
2. La interfaz consulta la disponibilidad de la nueva RPC y el permiso
   `can_write_club_team_season` del CTS seleccionado. STAFF necesita la asignación
   reconocida por ese helper; no se conceden permisos nuevos.
3. El usuario confirma expresamente. El frontend bloquea dobles envíos y cambios
   pendientes, y envía UUID de sesión, CTS y revisión a `delete_planned_session_v1`.
4. La RPC verifica confirmación, JWT, CTS y temporada abierta. Reutiliza
   `planned_session_04b_lock`, que serializa temporada/sesión, comprueba revisión
   y bloquea membresía/asignación STAFF para impedir carreras con revocaciones.
5. Guarda en un archivo interno inmutable la sesión y todas sus filas dependientes,
   incluida la auditoría, para conservar trazabilidad e instantáneas históricas.
6. Elimina únicamente las filas operativas de esa sesión, en este orden:
   disponibilidades, plantilla congelada, medidas de ejercicios, copias de tareas,
   distribuciones, configuración de campo de la sesión, autorizaciones de fecha,
   franjas, auditoría operativa y sesión. Cada paso comprueba que no quedaron filas.
7. Devuelve un comprobante con identidad/revisión; el frontend lo valida y consulta
   la ausencia de la sesión antes de quitar la tarjeta y cerrar el editor.
   Un fallo mantiene el diálogo y no anuncia éxito. Un reintento tras respuesta
   perdida reconoce el mismo comprobante sin repetir el borrado.

## SQL necesario (no ejecutado)

- `supabase_sessions_delete_v1.sql`: migración transaccional nueva. Añade RPC,
  comprobación de disponibilidad y archivo de auditoría privado con RLS y sin
  privilegios para clientes. Amplía tres guards con una única excepción: DELETE
  acreditado por el archivo de la misma sesión, usuario y transacción, después de
  verificar permisos. El cuerpo restante de cada guard se conserva íntegro.
- `supabase_sessions_delete_v1_verify.sql`: inventario de solo lectura de funciones,
  dependencias recursivas, triggers, RLS y grants. No invoca ninguna eliminación.

No se deshabilita ningún trigger ni RLS, no se cambia ninguna FK, no se añade
CASCADE ni se concede DELETE directo. La RPC aborta si encuentra dependencias
externas o triggers de borrado desconocidos/deshabilitados. Cualquier error
revierte también el archivo: no hay borrados parciales.

No toca `players_database`, `club_team_season_players`, `training_tasks`, la
configuración habitual del CTS ni el contador histórico de numeración. Las
sesiones de temporada cerrada y las ya retiradas históricamente se protegen.

## Validación realizada y límites

`npm.cmd run test:session-deletion` ejecuta pruebas del contrato RPC y lectura
posterior con clientes simulados, aislamiento CTS, confirmación obligatoria,
respuesta incorrecta, backend ausente, revisión y permisos rechazados. También
audita SQL/UI y simula las dependencias RESTRICT usando el orden real de la
migración para sesiones vacías, con plantilla, con `first_team` y con tareas.
Verifica conservación de otras sesiones, jugadores globales, Biblioteca y archivo.

Estas pruebas **no ejecutan PostgreSQL** ni acreditan la instalación o el borrado
real en Supabase. La corrección está preparada, no declarada resuelta en producción.

Antes de habilitarla, revisar el verificador en el entorno objetivo y probar la
migración en una base de pruebas. Allí comprobar los seis casos: sesión vacía,
con jugadores, con disponibilidades (`first_team` incluido), con tareas, temporada
cerrada y usuario sin permiso. Los cuatro primeros deben desaparecer de las tablas
operativas y conservar su archivo; los dos últimos deben conservar todas sus filas.
Añadir reintento, revisión obsoleta y dependencia inesperada: deben ser idempotente,
conflicto y rollback completo respectivamente. SQL Editor sin JWT no simula STAFF.

Archivos de aplicación: `PlannedSessionsSection.jsx` y `plannedSessionDeletionStore.js`.
Pruebas: `plannedSessionDeletionStore.test.js`, `plannedSessionDeletionSqlAudit.test.mjs`
y comando de `package.json`. No se han modificado datos reales, ni realizado commit,
push o despliegue.
