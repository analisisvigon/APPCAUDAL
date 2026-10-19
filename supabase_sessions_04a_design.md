# APPCAUDAL · Sesiones 04A · Diseño para revisión

Estado: **NO AUTORIZADO PARA INSTALAR**. Solo se inspeccionó el repositorio; no se
consultó Supabase ni se ejecutó SQL. Ejecutar primero el preflight y devolver su
CSV, en especial todas las filas `player`, `summary` y `session`. El inventario
anterior «27 etapas / 24 fichas» es histórico, no acredita la población actual
de `club_team_season_players`.

## Hechos del repositorio y límite de conocimiento

- `club_team_seasons` enlaza equipo propio y temporada; Sesiones usa el CTS
  `961970c8-0fcf-4c45-94d6-787647619c61`. El número de jugadores vinculados
  **actualmente en producción es desconocido** desde este repositorio.
- Sesiones 01 creó `club_team_season_players`: `player_id` apunta a
  `players_database`; `joined_on` puede ser NULL; `left_on` es exclusiva;
  `has_departed` y `voided_at` son distintos. Una pertenencia con fecha nula
  acredita temporada, **no presencia en un día**. Su guard exige una etapa
  `player_team_memberships` del mismo equipo al insertar, pero dicha etapa
  legacy no asigna por sí misma jugadores a la temporada.
- La ficha general de Plantilla carga `jugadores` y filtra `active_in_squad`;
  Inicio también consulta `players_database` y `player_team_memberships`.
  Sesiones 03B/03C no carga aún `club_team_season_players`.
- La posición canónica está en `player_positions`. Solo una fila `natural`
  con `is_primary=true` determina grupo: `goalkeeper`, `defender`,
  `midfielder`, `forward`. Sin tal fila: «Sin posición», sin deducción por texto
  legacy, posición específica ni pizarra.
- `planned_training_sessions` tiene CTS, fecha, estado y `revision` CAS; 03A/03C
  escriben cabecera, franjas y actividades mediante RPC. Sus tablas de sesión
  solo tienen SELECT para clientes; la lectura hereda `can_read_club_team_season`.
  `planned_session_state` y los RPC actuales no incluyen plantilla.
- La primera hoja mantiene reservas visuales para Nº jugadores, Lesionados,
  cuatro grupos posicionales y distribución. No se ha cambiado ese frontend.

## Modelo propuesto en la migración local

1. `planned_session_player_roster`: una fila **necesaria para el histórico**
   por futbolista y sesión, con UUID canónico, pertenencia CTS acreditada,
   nombre y grupo posicional congelados. La FK a la pertenencia es RESTRICT.
   El guard del servidor comprueba que sesión, pertenencia y jugador coinciden;
   copia nombre y posición del origen, sin aceptar snapshots enviados por el
   cliente. La fila es inmutable; no se sincroniza con cambios posteriores de
   Plantilla. No se inserta ninguna fila en la migración.
2. `planned_session_player_availability`: solo excepciones y observaciones.
   Falta de fila = `available` y observación vacía. Una fila `available` solo
   tiene sentido cuando existe observación. Estados persistentes: `available`,
   `absent`, `injured`, `adapted`. No escribe en el estado médico/global.
3. RLS de lectura para usuarios autenticados con lectura CTS. Los jugadores
   carecen de acceso por el helper general. No hay grants de escritura a
   clientes ni RPC nuevos todavía. Los guards bloquean escrituras en temporadas
   cerradas incluso ante un grant accidental.

La migración es **preparatoria, no funcional**: deja el esquema vacío. No
inicializa automáticamente la sesión confirmada nº 1 ni altera su revisión.
Tras revisar el inventario habrá que autorizar **otro paso pequeño**: RPC nuevo
que reciba UUID de pertenencias explícitamente confirmadas por el propietario
para congelar la plantilla y RPC nuevo de disponibilidad. Sin esos RPC y su
interfaz, no se deben intentar escrituras directas para «probar» el modelo.

## Reglas para la fase funcional posterior

- Crear nueva sesión: consultar `club_team_season_players` no anuladas del CTS;
  si hay fechas desconocidas o una salida sin fecha, pedir revisión explícita.
  **No** usar `jugadores.active_in_squad`, fechas o nombres para autorrellenar.
  La congelación del roster debe ser una operación atómica antes de presentar
  los contadores como definitivos. El usuario ha de distinguir «pendiente de
  conciliar» de «cero jugadores».
- Altas/bajas a mitad de temporada: una nueva pertenencia acreditada puede
  añadirse de forma explícita a sesiones futuras; sesiones anteriores retienen
  su snapshot. Una salida no borra filas históricas ni cambia disponibilidad
  retrospectivamente. Corregir una pertenencia requiere los mecanismos de
  anulación/reemplazo de Sesiones 01; una sesión ya congelada no se reescribe
  automáticamente.
- Nº jugadores en cabecera = `available + adapted` (participación posible).
  Mostrar aparte `total`, `available`, `absent`, `injured`, `adapted`.
  Una sola fila de roster por `session_id,player_id`; cada jugador pertenece a
  exactamente un estado efectivo: override o `available` implícito.
- El RPC futuro debe bloquear **temporada → sesión → pertenencias**, revalidar
  `can_write_club_team_season`, comparar `p_expected_revision`, escribir la
  instantánea o los overrides y aumentar `planned_training_sessions.revision`
  exactamente una vez. Registrar `changed_sections=['players']` en
  `planned_session_audit_events` con hash de antes/después que incluya plantilla
  y disponibilidad. Cualquier fallo debe revertir toda la transacción. No
  cambiar 03A/03C; esos RPC conservarán las nuevas tablas y detectarán CAS
  obsoleto cuando otro cliente haya guardado disponibilidad.
- Temporada cerrada: SELECT histórico según CTS, ninguna mutación. Sesión
  confirmada en temporada abierta: editable con la misma revisión CAS.

## Interfaz futura (no implementada)

En los cuatro recuadros de la primera hoja, nombre del snapshot y un selector
compacto de estado solo en edición; «Sin posición» debe mostrarse aparte sin
forzarlo a una de las cuatro categorías. Cabecera con cinco contadores y
lesionados/ausentes identificados; observación por jugador en desplegable
pequeño. La impresión oculta controles y mantiene nombres/estados/contadores,
sin tocar activación, ejercicios ni pizarras. Antes de cerrar la distribución
hay que probar 24–30 nombres largos en A4: si no caben legibles en dos hojas,
mostrar aviso de desbordamiento, nunca recortar ni reducir excesivamente letra.

## Pruebas exigidas antes de pasar a interfaz

1. Preflight: confirmar columnas, FK, RLS, población CTS exacta, fechas
   desconocidas, duplicados y posición natural principal de cada UUID. Resolver
   manualmente toda identidad dudosa; no cargar filas desde legacy por heurística.
2. Postflight estructural: tablas, FK RESTRICT, guards, RLS, ausencia de grants
   de escritura, session nº 1 y recuentos de tablas nuevas. Comparar
   `session_date`, `revision` y `updated_at` de esa sesión con el CSV previo.
3. Identidades reales `authenticated`: owner y staff autorizado leen, staff
   no asignado y player no leen, anon no tiene SELECT/EXECUTE. Service role
   **no** demuestra aislamiento RLS.
4. Paso RPC futuro: temporada abierta/cerrada, CTS ajeno, pertenencia anulada,
   jugador ajeno, UUID duplicado, dos pertenencias del mismo jugador, CAS
   obsoleto, cambio de plantilla posterior, sesión confirmada nº 1, hash y
   auditoría. Probar rollback íntegro ante cada error.
5. Reversión de esta preparación, si sigue sin datos: retirar primero sus dos
   tablas y guards en una transacción revisada. Si ya hay instantáneas, **no
   borrar**; deshabilitar la futura interfaz/RPC y diseñar recuperación de
   datos. No existe reversión automática segura una vez poblado.

Bloqueo actual: no se puede afirmar qué jugadores están realmente vinculados
ni qué fechas son inequívocas sin ejecutar el preflight en producción. La
migración local no está autorizada por este documento.
