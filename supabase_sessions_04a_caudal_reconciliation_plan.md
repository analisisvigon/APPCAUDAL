# APPCAUDAL · Sesiones 04A · conciliación del Caudal 2026/2027

Estado: **propuesta para revisión; no ejecutar ni instalar 04A todavía**.

## Evidencia y significado

El propietario comunica el preflight de producción: 11 comprobaciones estructurales
PASS, CTS `961970c8-0fcf-4c45-94d6-787647619c61` abierto, cero pertenencias
canónicas, 24 perfiles canónicos distintos con ficha legacy activa según la
consulta del preflight, 27 etapas deportivas actuales, sesión
confirmada nº 1 (2026-10-25, revisión 4). No conocemos los 24 UUID ni sus
posiciones hasta exportar el inventario. **El recuento DISTINCT de 24 no
demuestra que existan exactamente 24 filas de ficha**, ni equivale a 24
pertenencias válidas**; las tres etapas adicionales tampoco son altas automáticas.

`jugadores` es la ficha de Plantilla. `global_player_id` identifica el
`players_database.id` canónico y `membership_id` identifica la etapa de
`player_team_memberships`; esta etapa referencia por `team_id` el UUID deportivo
de `equipos_rivales` y su `season` legacy puede ser NULL. El CTS enlaza club,
`club_teams.id` y `club_seasons.id`; la FK canónica vincula el mismo UUID de
equipo a `equipos_rivales`, pero no convierte por sí sola una etapa en
pertenencia a 2026/27. `club_team_season_players` es esa pertenencia explícita.

`joined_on = NULL` confirma la temporada elegida, **no** una fecha de alta ni
presencia el 25 de octubre. `left_on` es exclusivo; `has_departed = false` y
`left_on = NULL` significan que no se ha registrado salida, no que el jugador
estuviera disponible todos los días. Disponibilidad (`available`, `absent`,
`injured`, `adapted`) será un hecho por sesión y no se deduce de Plantilla.

## Decisión del propietario

1. Exportar `supabase_sessions_04a_caudal_roster_inventory.sql` a CSV en un
   entorno administrativo. Contiene nombres y UUID; tratarlo como dato personal.
   Deben verse las fichas activas y, por separado, etapas actuales sin ficha
   activa coincidente. Resolver cada hallazgo `BLOCKED_*` antes de seleccionar.
2. Para cada futbolista incluido, comprobar por UUID: ficha, perfil canónico,
   etapa del equipo C.D. Caudal. Confirmar explícitamente que **perteneció al
   Caudal 2026/2027**, sin basarse únicamente en `active_in_squad` o en
   `is_current`. Decidir si se conoce documentalmente `joined_on`; usar NULL
   cuando no se conozca. No retrofechar con 01/07/2026 ni con 25/10/2026.
3. Firmar un manifiesto de cuatro columnas (`ficha_id`, `player_id`, `stage_id`,
   `joined_on`) con una fila por jugador. Registrar aparte las fichas excluidas
   y la razón. Si un futbolista válido solo tiene etapa legacy no actual, o si
   hay duplicados de identidad, detener este procedimiento y diseñar una
   conciliación específica: el template se limita a fichas/etapas actuales.
4. Copiar **exactamente ese manifiesto** al SQL de aplicación y al verificador.
   Revisar el diff y una copia/exportación de seguridad antes de pedir una
   autorización **separada** de ejecución. Esta entrega no la concede.

## Instalación futura en pasos

1. Ejecutar primero inventario, revisar todas las filas y comparar recuentos
   con 24/27/0; detenerse ante cualquier discrepancia no explicada.
2. Confirmar que el owner UUID del template sigue siendo owner activo. El
   template bloquea la temporada y las identidades de origen, verifica guard,
   RLS, permisos CTS y manifiesto, y solo entonces entra como `authenticated`
   con `auth.uid()` controlado. El SQL Editor posee privilegios administrativos:
   esta simulación **no autentica** al usuario real y debe ejecutarla únicamente
   el propietario autorizado. La tabla recibe INSERT por su política y guard,
   no por bypass administrativo. Repetir el template después de un COMMIT
   **falla deliberadamente** si ya hay filas; no usa `ON CONFLICT DO NOTHING`.
3. Ejecutar el verificador de solo lectura con el mismo manifiesto. Exigir
   GLOBAL PASS y cotejar el CSV con el manifiesto firmado. Confirmar que la
   sesión nº 1 mantiene fecha, estado y revisión; comparar además `updated_at`
   con la evidencia del preflight si se dispone de ella.
4. Repetir `supabase_sessions_04a_preflight.sql`; su estado debe reflejar los
   vínculos, no automáticamente una disponibilidad en la fecha de sesión nº 1.
   Revisar después, por separado, la instalación estructural 04A. **No**
   instalarla como consecuencia automática de esta conciliación.

Si alguna sentencia del template falla, la transacción aborta y no debe
confirmarse; `ROLLBACK` limpia el contexto local. Si ya hubo COMMIT, no borrar
ni actualizar directamente las pertenencias: Sesiones 01 conserva historial y
solo permite completar hechos desconocidos; una identidad o fecha acreditada
errónea requiere anulación owner con motivo y nueva alta revisada. No hay
reversión destructiva automática.

## Integración posterior con 04A

La elección de **quién perteneció a la temporada** se realiza una sola vez en
`club_team_season_players`. La futura plantilla congelada de cada sesión
responderá una pregunta distinta: **quién formaba parte de esa sesión en su
fecha concreta**. Debe mostrar candidatos canónicos y pedir confirmación
explícita cuando `joined_on` sea desconocida o exista una baja de fecha
desconocida; no volverá a seleccionar nombres desde tablas legacy. La sesión
nº 1 no se poblará ni cambiará de revisión durante esta conciliación.
La migración 04A actual solo crea tablas vacías; faltan RPC de snapshot y
disponibilidad con CAS/auditoría antes de una interfaz funcional. Sigue pendiente
resolver cómo 03A/03C cambiarían `session_date` cuando haya roster congelado.
