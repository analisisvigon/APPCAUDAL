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
esos bloqueos. La revisión de Supabase comunicada por el usuario confirma las diez
FK previstas y que los guards de hijos y disponibilidades permiten DELETE autorizado.
No se han leído directamente los cuerpos instalados: el verificador final compara
sus definiciones y la instalación aborta si alguno de los tres guards a sustituir
difiere del original revisado.

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
   perdida reconoce el mismo comprobante sin repetir el borrado. También en ese
   reintento exige temporada abierta, membresía activa y asignación STAFF vigente,
   bloqueadas durante la transacción. El comprobante debe corresponder al mismo
   usuario, sesión, CTS y revisión; no devuelve el contenido del archivo.

## SQL necesario (no ejecutado)

- `supabase_sessions_delete_v1.sql`: migración transaccional nueva. Añade RPC,
  comprobación de disponibilidad y archivo de auditoría privado con RLS y sin
  privilegios para clientes, incluido `service_role`. Sustituye explícitamente las
  definiciones completas de tres guards con una única excepción inicial: DELETE
  acreditado por el archivo de la misma sesión, usuario y transacción, después de
  verificar permisos. El cuerpo restante de cada guard se conserva íntegro.
  No usa parcheo dinámico. Antes de sustituirlos exige el hash de los cuerpos
  originales 03A/04A (normaliza CRLF y espacios de los bordes), propietario
  `postgres`, retorno trigger, SECURITY DEFINER y search_path cerrado.
- `supabase_sessions_delete_v1_verify.sql`: inventario de solo lectura de funciones,
  dependencias recursivas, triggers, RLS y grants. Compara los hashes de las tres
  funciones antes y después, muestra sus definiciones completas, verifica la
  privacidad del archivo y evalúa el mismo contrato de catálogo que la RPC.
  Se puede ejecutar antes y después de instalar; no invoca ninguna eliminación
  ni lee el contenido de las instantáneas.

No se deshabilita ningún trigger ni RLS, no se cambia ninguna FK, no se añade
CASCADE ni se concede DELETE directo. La RPC aborta si encuentra dependencias
externas, incluso FK nuevas entre tablas conocidas, o triggers de borrado
desconocidos/deshabilitados. El contrato exige exactamente las diez FK por tabla,
columnas ordenadas y acciones, y los seis triggers DELETE por tabla, nombre,
función, eventos y metadatos. También rechaza reglas DELETE y tablas con herencia
descendente. Se verifica al instalar, al consultar disponibilidad y antes de
archivar/borrar; la RPC bloquea las tablas durante esa comprobación y el borrado.
Cualquier error revierte también el archivo: no hay borrados parciales.

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
La revisión final añade comparación exacta de los tres cuerpos originales con los
finales, hashes antes/después, autorización previa a los reintentos, contrato de
FK/triggers y coincidencia entre el contrato de la migración y el del verificador.

Estas pruebas **no ejecutan PostgreSQL** ni acreditan la instalación o el borrado
real en Supabase. La corrección está preparada, no declarada resuelta en producción.

Antes de habilitarla, revisar el verificador en el entorno objetivo y probar la
migración en una base de pruebas. Allí comprobar los seis casos: sesión vacía,
con jugadores, con disponibilidades (`first_team` incluido), con tareas, temporada
cerrada y usuario sin permiso. Los cuatro primeros deben desaparecer de las tablas
operativas y conservar su archivo; los dos últimos deben conservar todas sus filas.
Añadir reintento autorizado, revisión obsoleta y dependencia inesperada: deben ser
idempotente, conflicto y rollback completo respectivamente. Un reintento tras
cierre de temporada, revocación de permisos o de otro usuario debe rechazarse.
SQL Editor sin JWT no simula STAFF.

## Condiciones y riesgos pendientes de instalación

- Ejecutar el verificador como administrador antes de instalar: los tres guards
  deben indicar `ORIGINAL_REVISADO`, metadatos correctos y contrato `true`. Un hash
  distinto exige comparar la definición completa: no quitar el preflight ni forzar
  la sustitución. Incluso cambios de formato internos producen rechazo seguro.
- La migración se instala **una sola vez**, completa, como `postgres` sin JWT de
  aplicación. Está dentro de `BEGIN`/`COMMIT`, con comprobación final del contrato;
  una instalación previa/parcial se rechaza, no se sobrescribe.
- Después, el verificador debe indicar `DELETE_V1_REVISADO`, contrato `true` y
  archivo con RLS, propietario `postgres`, cero políticas y ningún acceso de
  clientes/PUBLIC. El archivo conserva la fila de sesión, todas las filas de las
  nueve tablas hijas (incluida auditoría), usuario/membresía, CTS, revisión, fecha
  y transacción. Es archivo administrativo; un administrador PostgreSQL conserva
  acceso privilegiado. Los clientes solo reciben un comprobante mínimo.
- Las diez FK incluyen las extensiones 05, V11 y V12 revisadas. Una evolución del
  esquema exige revisar el contrato antes de volver a habilitar el borrado.
- Los bloqueos de tablas durante el borrado pueden esperar o interferir brevemente
  con guardados concurrentes; validar concurrencia y tiempos en la base de pruebas.
  Las pruebas estáticas no sustituyen comprobar triggers, rollback y permisos con
  identidades reales de prueba en PostgreSQL. No se ha ejecutado SQL en esta revisión.

Archivos de aplicación: `PlannedSessionsSection.jsx` y `plannedSessionDeletionStore.js`.
Pruebas: `plannedSessionDeletionStore.test.js`, `plannedSessionDeletionSqlAudit.test.mjs`
y comando de `package.json`. No se han modificado datos reales, ni realizado commit,
push o despliegue.
