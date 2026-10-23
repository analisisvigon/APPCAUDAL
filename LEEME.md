# NEXO CLUB — paquete de metadatos Multiclub 04C

**Origen:** resultados de consultas manuales de catálogos de Supabase compartidos por el usuario en esta conversación el 23 de octubre de 2026. No se ha conectado a Supabase para crear este paquete. **No contiene filas deportivas ni claves de acceso.**

## Archivos

- `01_columnas.csv`: 265 columnas de 10 tablas, tipos, nulabilidad y defaults. Los valores vacíos de `default_expression` representan `NULL` en el resultado, no un valor por defecto `''`.
- `02_restricciones.tsv`: 65 restricciones (todas reportadas con `convalidated=true`), incluidas FK y CHECK.
- `03_indices.tsv`: índices recuperados de las diez tablas.
- `04_politicas.tsv`: políticas RLS reportadas (todas `PERMISSIVE`). Se corresponden con el estado antes de los hotfixes de ACL; los hotfixes **no cambian RLS**.
- `05_permisos.tsv`: permisos efectivos conocidos, anotando en qué momento se midieron y dónde falta la medición.
- `06_triggers_y_funciones.sql`: DDL de las dos funciones trigger y la definición de sus triggers reportados. **Referencia documental: no ejecutar en producción.**
- `RPC_sustituciones_original.csv`: texto íntegro aportado previamente por el usuario con las definiciones de `get_match_substitution_events(uuid)` y `mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)`; incluye código de funciones, no registros de partidos.

## Estado de los datos y limitaciones que Codex NO debe rellenar por conjetura

1. Este paquete reproduce los resultados compartidos en el chat, transcritos a archivos tabulares; **no es un dump oficial directo de PostgreSQL**. Conviene contrastar el SQL generado con las migraciones del repositorio y con este material antes de ejecutar.
2. Para las diez tablas sí se han aportado columnas, restricciones, índices, políticas y triggers. Faltan algunas casillas de permisos de `anon` sobre `competitions` y `partido_estadisticas_jugador` distintas de SELECT; se marcan `UNKNOWN` y NO se deben presumir falsas.
3. En `competitions`, `UNIQUE(key)` es global, aunque hay `club_id`; hay que resolverlo **solo en staging** si ambos clubes necesitan la misma `key`.
4. En `equipos_rivales`, el índice `equipos_rivales_one_own_club_uidx` impide más de un `team_kind='own'`; **solo staging** puede alterarlo, previo análisis del seed.
5. `partidos.home_team` tiene default literal `'C.D. Caudal'` y `partido_alineacion_slots.scope` admite `pre_caudal`; son contratos legacy reales, no valores neutrales multiclub.
6. Los hotfixes 04C-S1 y 04C-S2 fueron reportados como aplicados/verificados: `anon` perdió SELECT/INSERT/UPDATE/DELETE y TRUNCATE/REFERENCES/TRIGGER/MAINTAIN sobre cuatro tablas (`jugadores`, `jugadores_rivales`, `equipo_rival_alineacion`, `equipo_rival_banquillo`); `authenticated` conservó esos permisos. **Las políticas RLS ALL true de los rivales permanecen y no acreditan aislamiento entre clubes.**
7. Las migraciones históricas 08, 33 y 34 presuponen filas del Caudal: no ejecutarlas en staging vacío sin separar la parte estructural de las vinculaciones históricas.
8. **Faltan por verificar dependencias de esquema de otras tablas y funciones creadas por migraciones incrementales** (`clubs`, `club_*`, `players_database`, etc.). Las diez tablas aquí documentadas no constituyen por sí solas una instalación completa.
9. No instalar 03C en producción, no activar CTS allí, no insertar un segundo club real ni datos personales en staging.
10. Las definiciones de RPC y funciones trigger pueden contener SQL sensible para la arquitectura; revisar antes de compartir públicamente, aunque no contienen registros de usuarios.

## Conteos del inventario

- Columnas: 265 en diez tablas.
- Restricciones: 65 en diez tablas.
- Los metadatos se han recompuesto de mensajes del usuario, no validado ejecutando SQL en una base de datos.
