# Multiclub 04C: base limpia para el ensayo 04B

**Estado: bloqueado hasta recibir los contratos estructurales exactos. No ejecutar
todavía el seed 04B ni crear el segundo club.** El repositorio contiene migraciones incrementales, pero no un
esquema inicial completo y acreditado que permita reconstruir desde cero las
tablas legacy. Crear una versión aproximada daría un ensayo engañoso.

## 1. Qué existe en el repositorio

| Bloque | Archivo local | Dependencia relevante |
| --- | --- | --- |
| Club y membresías | `supabase_club_core_01_tables.sql`, `02_functions.sql`, `03_rls.sql`, `08_player_identity.sql` | 08 exige objetos y una identidad histórica del Caudal |
| Perfiles globales | `supabase_global_players.sql` | Altera tablas legacy ya existentes: `equipos_rivales`, `jugadores`, `jugadores_rivales`, `equipo_rival_alineacion`, `equipo_rival_banquillo`, `partido_alineacion_slots` |
| Temporadas | `supabase_club_core_19_fines_foundation.sql`, `32_season_lifecycle.sql` | 19 exige `jugadores` y helpers de identidad; incluye tablas de multas fuera del ensayo |
| Equipos y CTS | `supabase_club_core_33_club_teams.sql`, `34_club_team_seasons.sql`, `35_club_team_season_permissions.sql` | 33 y 34 exigen filas históricas concretas del Caudal; no sirven para un proyecto vacío con solo clubes ficticios |
| Autorización y plantilla CTS | `supabase_club_core_39b_match_authorization_helpers.sql`, `supabase_sessions_01_club_team_season_players.sql`, `supabase_club_core_40_multiclub_identity.sql`, `supabase_multiclub_02_scoped_reads.sql`, `supabase_multiclub_02_row_scope_prepare.sql`, `supabase_multiclub_03_prepare.sql`, `supabase_multiclub_03_player_create.sql` | Requieren el núcleo anterior, `partidos` y dos RPC legacy de sustituciones que 03A modifica |

`supabase_club_core_37_partidos_team_season.sql` enlaza partidos históricos
con UUID reales: **no usarlo en ensayo**. Tampoco ejecutar 02B de los 24
vínculos reales, 03C, semillas iniciales del Caudal ni cualquier SQL que cree
miembros reales. El seed 04B solo contiene UUID y nombres ficticios propios;
su `DROP INDEX` se limita al índice legacy de un único equipo `own` y ahora
queda condicionado por el marcador 04C y por una base deportiva vacía.

## 2. Paso que debe realizar el propietario ahora

1. En Supabase, abrir **el proyecto de producción solo para leer metadatos**.
   Confirmar visualmente su nombre y project ref.
2. En SQL Editor ejecutar **solo**
   `supabase_multiclub_04c_metadata_readonly.sql`. Sus consultas usan
   `pg_catalog` y `pg_policies`; no devuelven filas deportivas ni usuarios.
3. Guardar las pestañas de resultados estructurales (columnas, restricciones,
   índices, RLS, disparadores y las dos definiciones de RPC de sustituciones).
   Antes de compartirlas, revisar y ocultar cualquier literal sensible que
   aparezca en defaults o en el código de una función. No enviar datos de
   tablas, correos de usuarios, claves ni archivos `.env`.
4. Adjuntar los resultados estructurales de las ocho tablas de esa consulta y
   los de `partido_estadisticas_jugador` de
   `supabase_multiclub_04c_missing_metadata_readonly.sql`. El resumen de
   12/13 columnas, PK, FK y RLS no indica el nombre, tipo, default y resto de
   restricciones de cada columna. Para `competitions`, contrastar el resultado
   con `supabase_match_competition_key.sql`: este archivo local define sus
   doce columnas, pero también actualiza partidos y Storage, así que no debe
   ejecutarse entero como esquema base.
5. Con ese resultado se podrá preparar un **nuevo** SQL base de ensayo que
   reproduzca solo los contratos necesarios, sin filas del Caudal, y variantes
   de arranque para los cambios 08/33/34 que actualmente presuponen esas filas.
   Ese SQL deberá revisarse antes de instalarlo. No editar ni ejecutar los
   scripts históricos para forzar su paso.

**Paquete concreto pendiente en este repositorio:** para `equipos_rivales`,
`jugadores`, `partidos`, `jugadores_rivales`, `equipo_rival_alineacion`,
`equipo_rival_banquillo`, `partido_alineacion_slots` y
`partido_eventos_sustitucion`, entregar los resultados de columnas/defaults,
restricciones, índices, RLS/políticas, grants y triggers de
`supabase_multiclub_04c_metadata_readonly.sql`. Para
`partido_estadisticas_jugador`, entregar los mismos apartados de
`supabase_multiclub_04c_missing_metadata_readonly.sql`; para `competitions`,
entregar solo las diferencias con la definición de
`supabase_match_competition_key.sql` y la FK exacta desde `partidos`. También
se necesitan las dos definiciones de RPC de sustituciones si no coinciden con
`supabase_club_core_31_canonical_substitutions.sql`. No hacen falta filas de
ninguna tabla. El verificador 04C ya enumera las diez tablas y las RPC, pero
no puede acreditar equivalencia de columnas hasta recibir este paquete.

Los triggers `project_global_player_shirt_name_on_legacy_insert()` y
`set_club_core_updated_at()` sí tienen definición local reutilizable en
`supabase_players_database_shirt_name.sql` y
`supabase_club_core_01_tables.sql`, respectivamente.

## 3. Orden previsto en el proyecto nuevo de ENSAYO

**No empezar esta secuencia hasta disponer del SQL base 04C revisado.**

1. Crear un proyecto Supabase **nuevo**, con `ENSAYO` en el nombre. Anotar su
   project ref; no restaurar una copia de producción.
2. Instalar manualmente el SQL base 04C revisado y sus variantes de arranque
   derivadas de los metadatos. Este paso debe dejar el deporte vacío y los
   objetos de Club Core, global players, CTS, autorizaciones, CTSP y RPC
   legacy con los contratos requeridos. Cada pieza tendrá preflight propio.
   Separar los DDL reutilizables de las comprobaciones/INSERT que exigen
   UUID históricos del Caudal en 08, 33, 34, Sesiones 01 y 37. Nunca usar
   las 24 correspondencias de 02B en esta base ficticia.
3. Instalar manualmente y por orden las migraciones reutilizables: Multiclub
   01 (`supabase_club_core_40_multiclub_identity.sql`), 02 lecturas
   (`supabase_multiclub_02_scoped_reads.sql`), 02 enlaces
   (`supabase_multiclub_02_row_scope_prepare.sql`), 03A
   (`supabase_multiclub_03_prepare.sql`) y 03B
   (`supabase_multiclub_03_player_create.sql`). Ejecutar sus preflight y
   postflight. Detenerse si cualquiera falla.
4. Ejecutar `supabase_multiclub_04c_staging_schema_verify.sql`. Confirmar los
   diez objetos base, las RPC CTS y de sustituciones, las FK y las políticas
   legacy. Aplicar S1/S2 en ensayo si el contrato base reproduce los grants
   anónimos antiguos, y volver a verificar los cuatro permisos efectivos.
   **No instalar 03C**.
5. Crear manualmente las cinco cuentas ficticias de 04B en Authentication.
   Ejecutar `supabase_multiclub_04c_staging_guard.sql`: solo crea un marcador
   cuando hay exactamente esas cinco cuentas y todas las tablas deportivas
   están vacías. Confirmar antes el project ref en el panel.
6. Ejecutar el preflight, seed y postflight de 04B según
   `MULTICLUB_04B_STAGING.md`; después `npm run dev:staging` desde VS Code.

El guard es defensa adicional, no una identificación criptográfica del
proyecto remoto. SQL Editor no aporta una garantía fiable del project ref al
script; la comprobación visual y el bloqueo de entorno de `dev:staging` siguen
siendo obligatorios.

`competitions.key` conserva su `UNIQUE` global acreditado. Para 04B utilizar
el catálogo compartido o dejar `partidos.competition_id` nulo: el seed actual
usa esta segunda opción. No crear dos filas `league` con el mismo `key` ni
cambiar esa restricción por club en producción. El único índice específico
que se retira en ensayo es `equipos_rivales_one_own_club_uidx`, dentro de la
transacción y guardas de `supabase_multiclub_04b_staging_seed.sql`.

## Límite de seguridad del ensayo

Las RPC CTS pueden ensayarse con usuarios `authenticated`. Las políticas
legacy de `jugadores` y `partidos` siguen permitiendo acceso directo demasiado
amplio hasta 03C. Este ensayo sirve para la navegación del primer espacio
deportivo, **no acredita aislamiento completo de la base**. Mantener 03C
desinstalado y no usar datos personales reales.
