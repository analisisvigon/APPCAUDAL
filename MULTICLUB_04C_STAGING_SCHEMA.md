# Multiclub 04C: base limpia para el ensayo 04B

**Estado: pendiente de metadatos. No ejecutar todavía el seed 04B ni crear el
segundo club.** El repositorio contiene migraciones incrementales, pero no un
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
4. Con ese resultado se podrá preparar un **nuevo** SQL base de ensayo que
   reproduzca solo los contratos necesarios, sin filas del Caudal, y variantes
   de arranque para los cambios 08/33/34 que actualmente presuponen esas filas.
   Ese SQL deberá revisarse antes de instalarlo. No editar ni ejecutar los
   scripts históricos para forzar su paso.

Faltan principalmente definiciones iniciales exactas de `jugadores`,
`partidos`, `equipos_rivales` y varias tablas auxiliares que
`supabase_global_players.sql` altera. Se necesitan también sus FK, índices,
triggers, políticas y permisos efectivos. El verificador del esquema no puede
acreditar equivalencia con producción mientras no se conozca ese contrato.

## 3. Orden previsto en el proyecto nuevo de ENSAYO

**No empezar esta secuencia hasta disponer del SQL base 04C revisado.**

1. Crear un proyecto Supabase **nuevo**, con `ENSAYO` en el nombre. Anotar su
   project ref; no restaurar una copia de producción.
2. Instalar manualmente el SQL base 04C revisado y sus variantes de arranque
   derivadas de los metadatos. Este paso debe dejar el deporte vacío y los
   objetos de Club Core, global players, CTS, autorizaciones, CTSP y RPC
   legacy con los contratos requeridos. Cada pieza tendrá preflight propio.
3. Instalar manualmente y por orden las migraciones reutilizables: Multiclub
   01 (`supabase_club_core_40_multiclub_identity.sql`), 02 lecturas
   (`supabase_multiclub_02_scoped_reads.sql`), 02 enlaces
   (`supabase_multiclub_02_row_scope_prepare.sql`), 03A
   (`supabase_multiclub_03_prepare.sql`) y 03B
   (`supabase_multiclub_03_player_create.sql`). Ejecutar sus preflight y
   postflight. Detenerse si cualquiera falla.
4. Ejecutar `supabase_multiclub_04c_staging_schema_verify.sql`. Confirmar los
   objetos y las políticas legacy. **No instalar 03C**.
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

## Límite de seguridad del ensayo

Las RPC CTS pueden ensayarse con usuarios `authenticated`. Las políticas
legacy de `jugadores` y `partidos` siguen permitiendo acceso directo demasiado
amplio hasta 03C. Este ensayo sirve para la navegación del primer espacio
deportivo, **no acredita aislamiento completo de la base**. Mantener 03C
desinstalado y no usar datos personales reales.
