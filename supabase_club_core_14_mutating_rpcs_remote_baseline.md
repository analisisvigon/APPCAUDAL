# Bloque 2.1b — baseline remoto de RPC mutadoras

Auditoría remota: 2026-08-30.

Este manifiesto identifica las definiciones funcionales que la migración 14
protege. Para las doce RPC, el `pg_proc.prosrc` remoto, eliminando únicamente
`CR` (`chr(13)`), coincide exactamente con el cuerpo de la definición indicada
en la columna `fuente canónica`, leído como UTF-8.

La migración 14 no despliega una versión deportiva alternativa: obtiene la
definición vigente mediante `pg_get_functiondef()`, inserta el guard STAFF y
comprueba que retirar ese guard recupera este baseline exacto.

| RPC | MD5 remoto canónico | Security | search_path | Fuente canónica |
| --- | --- | --- | --- | --- |
| `set_player_availability(uuid,text,integer)` | `466c8d47470aaa5acee20cf44fa7d502` | DEFINER | `pg_catalog, public` | `supabase_player_availability.sql` |
| `consume_player_suspensions_for_match(uuid)` | `3b02b9eb3bbe11a3a21bfe06cb783e1c` | DEFINER | `pg_catalog, public` | `supabase_player_availability.sql` |
| `apply_rival_tactical_placements(uuid,jsonb)` | `be25e6a1de65150ee8a911eb7a11ccd7` | INVOKER | `public` | `supabase_rival_team_editing.sql` |
| `assign_global_player_to_team(uuid,uuid,text,text,date)` | `fd794865119cc8d26ffe13d6b0b73862` | INVOKER | `public` | `supabase_global_players.sql` |
| `create_own_player_atomic(uuid,jsonb,jsonb,jsonb,jsonb)` | `aad1e4eaf3cd1fa7e30e1d630f641076` | INVOKER | `public` | `supabase_own_player_create_atomic.sql` |
| `merge_global_player_profiles(uuid,uuid)` | `5c5121dbebf1c75b2ec013693c2e5a2e` | INVOKER | `public` | `supabase_global_players.sql` |
| `remove_global_player_from_current_team(uuid,date)` | `0cd47394f23797cdefa3578eb84e2be9` | INVOKER | `public` | `supabase_global_players.sql` |
| `remove_rival_player_from_team_atomic(uuid,uuid,uuid,text)` | `128aa60b5ecf5c96f79a61f821e40bc9` | INVOKER | `public, pg_temp` | `supabase_rival_lineup_atomic.sql` |
| `save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)` | `a638f6ca4d202abbcb562b5261b4b6e4` | INVOKER | `public` | `supabase_global_players.sql` |
| `save_match_squad_lineup_atomic(uuid,text,jsonb,jsonb)` | `63bb815b9ea846b7ec90465ccfc06369` | INVOKER | `pg_catalog, public` | `supabase_match_squad_lineup_atomic.sql` |
| `save_own_captain_priorities(uuid[])` | `ea72384385e286c5df3f71666d3d2581` | INVOKER | `public` | `supabase_own_captain_priority.sql` |
| `save_rival_lineup_atomic(uuid,text,jsonb,jsonb,jsonb,jsonb)` | `cb8a5da84addcf1f34934380a03a725c` | INVOKER | `public, pg_temp` | `supabase_rival_lineup_atomic.sql` |

Todas tienen propietario `postgres`, lenguaje `plpgsql` y volatilidad
`VOLATILE` en el baseline auditado.

## Falsos drifts de codificación corregidos

Seis huellas anteriores se habían calculado leyendo archivos UTF-8 con la
codificación ANSI heredada de Windows PowerShell. Los bytes versionados no
estaban desactualizados y no se ha reescrito ninguna definición histórica.

| RPC | Causa textual |
| --- | --- |
| `assign_global_player_to_team` | Dos mensajes con `á/ó` convertidos a mojibake durante el cálculo local. |
| `create_own_player_atomic` | Clase de normalización `áéíóúüñ` y dos comentarios convertidos a mojibake durante el cálculo local. |
| `remove_rival_player_from_team_atomic` | Dos mensajes con caracteres acentuados convertidos a mojibake durante el cálculo local. |
| `save_global_player_profile` | Un mensaje y dos comentarios convertidos a mojibake durante el cálculo local. |
| `save_match_squad_lineup_atomic` | Tres comentarios con caracteres acentuados convertidos a mojibake durante el cálculo local. |
| `save_rival_lineup_atomic` | Seis mensajes con caracteres acentuados convertidos a mojibake durante el cálculo local. |

El diff funcional entre producción y las fuentes versionadas correctamente
decodificadas es cero. En particular, la expresión de normalización de nombres
de `create_own_player_atomic` conserva correctamente `áéíóúüñ`.
