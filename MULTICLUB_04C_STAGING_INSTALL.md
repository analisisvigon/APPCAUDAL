# Instalar Multiclub 04C en Supabase de ensayo

Estos archivos son **solo para un proyecto Supabase nuevo y vacío de ENSAYO**.
No se ha ejecutado SQL desde este repositorio. No usar en producción ni copiar
jugadores, partidos, cuentas o claves reales. Confirmar el **project ref** en el
panel antes de cada bloque; SQL Editor no puede certificar por sí solo qué
proyecto está abierto.

## Contrato utilizado

`staging/metadata/04c/` conserva el paquete estructural aportado: 265 columnas,
65 restricciones y 28 índices de diez tablas. La transcripción errónea de
`partidos.clean_sheet` se corrigió con confirmación expresa del usuario:
`boolean`, nullable, default `false`. Una comprobación local del resto de
tipos/defaults no encontró otra combinación incompatible. El script
`scripts/buildMulticlub04cLegacySchema.ps1` genera los dos SQL de tablas
legacy desde ese paquete; genera archivos, **no ejecuta SQL**.

## Pasos manuales, en orden

1. Crear un proyecto Supabase **nuevo**, con `ENSAYO` en el nombre, sin restaurar
   un backup. Ejecutar `supabase_multiclub_04c_staging_preflight.sql`. Todos los
   valores deben ser `true`. Se requiere PostgreSQL 17 o superior y el esquema
   `extensions`. Todavía no crear las cinco cuentas ficticias.
2. Ejecutar `supabase_multiclub_04c_staging_legacy_base.sql`. Crea nueve tablas
   legacy vacías con columnas, PK, CHECK, UNIQUE, índices y RLS activo. Las FK
   a tablas canónicas se instalan después.
3. Ejecutar `supabase_club_core_01_tables.sql`,
   `supabase_club_core_02_functions.sql` y `supabase_club_core_03_rls.sql`.
4. Ejecutar `supabase_multiclub_04c_staging_identity.sql`: DDL estructural de
   08/09 sin inventario histórico de cinco miembros del Caudal.
5. Ejecutar `supabase_multiclub_04c_staging_globals.sql` y
   `supabase_players_database_shirt_name.sql`. No se crea ni migra ninguna
   persona real.
6. Ejecutar `supabase_multiclub_04c_staging_club_foundation.sql`: temporadas,
   equipos propios canónicos y CTS, con claves compuestas del mismo club.
7. Ejecutar `supabase_multiclub_04c_staging_legacy_finalize.sql`: FK aplazadas,
   políticas legacy y privilegios authenticated. Ejecutar después
   `supabase_club_core_15_my_player_profile.sql` para permitir la entrada
   mínima del PLAYER ficticio mediante su identidad autorizada.
8. Ejecutar `supabase_club_core_35_club_team_season_permissions.sql` y luego
   `supabase_club_core_39b_match_authorization_helpers.sql`.
9. Ejecutar `supabase_multiclub_04c_staging_ctsp.sql` y después
   `supabase_club_core_31_canonical_substitutions.sql`.
10. Ejecutar, en orden, `supabase_club_core_40_multiclub_identity.sql`,
    `supabase_multiclub_02_scoped_reads.sql`,
    `supabase_multiclub_02_row_scope_prepare.sql`,
    `supabase_multiclub_04c_staging_03a_core.sql` y
    `supabase_multiclub_03_player_create.sql`. **No ejecutar 02B**: contiene
    pares UUID reales del Caudal. La variante 04C de 03A adapta las RPC de
    sustituciones al CTS y omite tres helpers de snapshots cuya tabla no está
    acreditada para este ensayo.
11. Ejecutar los hotfixes `supabase_hotfix_04c_s1_anon_revoke.sql` y
    `supabase_hotfix_04c_s2_revoke.sql` solo en ENSAYO. Reconfirman la ausencia
    de privilegios anon en cuatro tablas; no cambian RLS.
12. Ejecutar `supabase_multiclub_04c_staging_schema_verify.sql`. Comprobar
    tablas, RPC, FK, recuentos de columnas y restricciones, default corregido
    de `clean_sheet` y privilegios anon efectivos.
13. Crear las cinco cuentas ficticias indicadas en `MULTICLUB_04B_STAGING.md`.
    Después ejecutar `supabase_multiclub_04c_staging_guard.sql`,
    `supabase_multiclub_04b_staging_preflight.sql`,
    `supabase_multiclub_04b_staging_seed.sql` y
    `supabase_multiclub_04b_staging_postflight.sql`. Confirmar los permisos
    CTS individuales del staff y los nombres ficticios de los partidos.
14. Seguir las pruebas manuales de `MULTICLUB_04B_STAGING.md`; abrir la app
    solo con `npm run dev:staging` y credenciales públicas del proyecto ENSAYO.

**Detenerse si falla cualquier paso.** Cada archivo de instalación usa una
transacción. No ejecutar el siguiente archivo para ocultar un error anterior.

## Separación de migraciones históricas

No ejecutar en este proyecto vacío los archivos originales 08/09, 19, 32,
33, 34, 37, Sesiones 01, 03A completo ni `supabase_global_players.sql` completo: incluyen
comprobaciones o inserciones del Caudal. Sus variantes 04C usan las definiciones
locales necesarias y omiten esas filas. El preflight general 03 consulta otras
tablas deportivas que este ensayo no construye; usar las guardas de 03A/03B y
el verificador específico 04C. `supabase_multiclub_04c_staging_03a_core.sql`
se regenera desde 03A con `scripts/buildMulticlub04c03a.ps1`; nunca ejecutar
ambas versiones en el mismo proyecto. Los tres helpers de snapshots y 03C
requieren el contrato de `partido_snapshots_tacticos` y las demás tablas
deportivas fuera de este primer espacio.

El índice `equipos_rivales_one_own_club_uidx` se omite **solo en ENSAYO** para
admitir dos equipos propios. `competitions.key` conserva su UNIQUE global; el
seed no crea competiciones y deja `competition_id` nulo. El default legacy de
`partidos.home_team` menciona al Caudal; el seed fija los dos nombres ficticios
expresamente. Los grants anon no medidos de `competitions` y
`partido_estadisticas_jugador` se dejan revocados en ENSAYO.

## Límite de seguridad

**No instalar 03C.** Las RPC CTS permiten ensayar el selector y las tres vistas
de solo lectura. Las políticas legacy de tablas deportivas siguen permitiendo
acceso authenticated demasiado amplio mediante consultas directas hasta el
corte RLS. Las políticas `ALL true` de rivales permanecen para authenticated.
Este ensayo prueba navegación y limpieza de contexto; no acredita todavía el
aislamiento completo de la base de datos.

El PLAYER ficticio puede probar el acceso directo y su perfil mínimo mediante
`get_my_player_profile()`. Las secciones de análisis, partidos personales,
rendimiento y multas dependen de otras tablas y RPC fuera del esquema 04C;
pueden mostrar estados de error. No tomar este ensayo limitado como una
regresión completa del portal PLAYER.
