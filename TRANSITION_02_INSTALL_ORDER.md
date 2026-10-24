# Transición 02: preparación y corte del archivo histórico

**Estado: SQL local, sin instalar.** La rama legacy y PLAYER conservan su
comportamiento mientras no se active el modo CTS. No crear todavía Libia ni
activar 03C con esta guía: el corte futuro permanece bloqueado expresamente.

## Bloque A: preparación sin activar escrituras

1. Revisar y ejecutar manualmente `supabase_transition_02_operational_preflight.sql`.
2. Revisar y ejecutar manualmente `supabase_transition_02_operational_prepare.sql`.
3. Ejecutar `supabase_transition_02_operational_postflight.sql` (solo lectura).
   Debe mostrar registro y marcador vacíos y `no_writes_enabled=true`.

La preparación añade las cuatro RPC operativas, pero el registro de un único
CTS sigue vacío. Un `UPDATE writes_enabled=true` aislado tampoco es válido:
requiere una fila de versión 1 en `operational_guard_versions_v1`, protegida
por FK, CHECK, RLS y ACL. Esta es una condición estructural de habilitación;
no inspecciona texto de funciones. No instalar un marcador de forma separada.

## Bloque B: guardas de fila, todavía sin activar

1. Confirmar el contrato de las 16 tablas del perímetro 03C y las tablas
   canónicas. Revisar y ejecutar manualmente
   `supabase_transition_02_row_guards_prepare.sql`.
2. Ejecutar `supabase_transition_02_row_guards_postflight.sql` (solo lectura).
   Todas las guardas deben figurar activas, y `active_writes_false=true`.
3. Antes de considerar el corte, ensayar con `writes_enabled=false` la creación
   y edición legacy del Caudal y el acceso PLAYER; el marcador debe seguir
   ausente y estas guardas no deben cambiar el resultado funcional.

Estas guardas permanecen inertes solo antes del marcador de corte. Después del
corte, `writes_enabled=false` bloquea todo DML protegido. Con escrituras
habilitadas, rechazarán DML en fichas, partidos, hijos de partidos, etapas, vínculos
CTS y perfiles globales fuera del CTS operativo. La inserción de perfil, etapa
y ficha usa triggers diferidos porque 03B inserta sus vínculos después.
`equipos_rivales`, las tres tablas de rivales y `competitions` se congelan
por completo al activar: todavía no tienen una clave CTS segura para editarse.
Las RPC `SECURITY DEFINER` tampoco pueden eludir un trigger de fila habilitado.
Esto protege el perímetro documentado; funciones que escriban otras tablas,
Storage o documentos requieren cobertura adicional.

## Bloque C: corte futuro, bloqueado

1. Preparar un respaldo restaurable de base de datos y Storage. Resolver la
   restricción de equipo propio y crear/verificar manualmente el CTS de Libia,
   temporada abierta y membresía owner de la cuenta personal.
2. Revisar `supabase_transition_02_designate_template.sql`, completar solo los
   UUID verificados y designar un único CTS con `writes_enabled=false`.
3. Completar las dependencias y pruebas de 03C. Revisar todas las escrituras
   directas e indirectas fuera de Plantilla y Partidos, incluida PLAYER; cerrar
   sus vías históricas y comprobar las bibliotecas de Tareas/ABP y snapshots.
   `supabase_transition_02_write_paths_readonly.sql` ayuda a localizar RPC y
   triggers adicionales en el catálogo del proyecto de ensayo; devuelve solo
   metadatos y sus coincidencias no acreditan seguridad por sí solas.
4. Ensayar el corte en un Supabase aislado con usuarios ficticios. Ejecutar
   las pruebas negativas de `scripts/transition02NegativeStaging.mjs` tras
   preparar sus fixtures; complementar con la matriz de la sección siguiente.
5. Revisar `supabase_transition_02_archive_cutover.sql`. **Ahora aborta siempre**
   con `ARCHIVE_CUTOVER_BLOCKED_PENDING_INDIRECT_WRITE_PROTECTION`. Solo una
   revisión posterior, con pruebas completas, puede retirar esa línea. En una
   única transacción futura restringirá el helper compartido al CTS designado,
   quitará DML directo authenticated de tablas canónicas, revocará `TRUNCATE`
   en el perímetro protegido, insertará el marcador de guard y habilitará
   `writes_enabled`. Si falla una comprobación, revierte.
6. Verificar con `supabase_transition_02_archive_postflight.sql` y repetir las
   pruebas bajo JWT authenticated, nunca como postgres ni service_role.

## Matriz mínima de ensayo autenticado

| Ruta | Activo autorizado | Caudal histórico / ajeno |
| --- | --- | --- |
| RPC 03B directa: alta y enlace global | Solo CTS operativo, respetando origen | Denegada |
| RPC legacy `create_own_player_atomic` | Revisar según flujo legacy | Denegada después del corte |
| RPC operativas: alta/edición ficha y partido | Éxito en temporada abierta | Denegadas |
| `mutate_match_substitution_atomic` y otras RPC de hijos | Solo con guard CTS | Denegadas |
| DML directo en jugadores, partidos y 14 tablas hijas | Solo si RLS y guard lo permiten | Denegado |
| DML directo en perfiles, etapas, CTSP y vínculos | Revocado a authenticated | Denegado |
| DML en equipos, rivales y competiciones | Pendiente de API CTS | Denegado |
| Pausar `writes_enabled` tras el corte (solo en ensayo) | Todo DML protegido denegado | Denegado |
| PLAYER y documentos / snapshots históricos | Datos autorizados, sin regresión | Inmutables |

El script de ensayo exige `.env.staging`, referencias distintas de producción,
un proyecto ficticio desechable, cuatro usuarios ficticios y los UUID de una
ficha, un partido y **una fila por cada una de las 14 tablas hijas** del mismo
partido histórico. `T02_ARCHIVE_CHILD_IDS_JSON` es un objeto JSON cuyas claves
son los nombres de tabla de `scripts/transition02NegativeStaging.mjs` y cuyos
valores son UUID ficticios. Si una RPC falta o una tabla hija no tiene fixture,
el script se detiene sin declarar éxito. Ejemplo de ejecución manual **solo tras
preparar el ensayo**:

```powershell
$env:T02_STAGING_ACK='SOLO_ENSAYO_FICTICIO'
# Definir T02_ACTIVE_CTS_ID, T02_ARCHIVE_CTS_ID, T02_ARCHIVE_JUGADOR_ID,
# T02_ARCHIVE_PARTIDO_ID, T02_ARCHIVE_CHILD_IDS_JSON y credenciales T02_*
# de los cuatro usuarios ficticios.
node scripts/transition02NegativeStaging.mjs
```

Si una prueba falla, detenerse y restaurar el seed ficticio: las pruebas
intentaron escribir y una protección ausente podría haber cambiado filas.
Registrar recuentos y hashes de datos históricos antes y después. El SQL Editor
como postgres no prueba permisos de usuarios.

## Condiciones pendientes antes de Libia en producción

Resolver la restricción legacy de un equipo propio, verificar todas las tablas
y RPC de otros módulos, 03C, políticas permisivas adicionales, documentos y
Storage, permisos de PLAYER y bibliotecas personales de Tareas/ABP. Su esquema
actual no demuestra propiedad personal atemporal y no se modifica aquí. Los
snapshots históricos de sesiones y partidos no se transforman en este bloque.
Hasta entonces no activar `writes_enabled` ni el frontend CTS en producción.
