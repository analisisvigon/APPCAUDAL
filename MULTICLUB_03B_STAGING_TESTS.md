# Multiclub 03B: pruebas en ensayo

Ejecutar solo en un entorno aislado con dos clubes y sesiones `authenticated`
reales. Registrar recuentos e instantaneas de las filas afectadas antes y
despues. No usar `postgres` ni `service_role` para probar autorizacion.

| Caso | Resultado esperado |
| --- | --- |
| Alta nueva en CTS propio abierto, UUID de ficha nuevo | `created`; un perfil global nuevo, una etapa con equipo y `club_seasons.label`, una ficha, un CTSP y un vinculo exacto. Las posiciones, fuentes y rasgos se conservan. Ningun perfil previo cambia. |
| Repetir alta con el mismo UUID de ficha | `OWN_PLAYER_ID_CONFLICT`; los recuentos siguen iguales. El esquema no acredita que sea la misma petición original. |
| Reutilizar el UUID de una ficha ajena, incluso del mismo CTS | `OWN_PLAYER_ID_CONFLICT`; no devuelve datos de la ficha previa ni crea relaciones. |
| Dos altas simultáneas con UUID distintos e igual nombre/fecha | Una crea el perfil; la otra recibe `OWN_PLAYER_COMPATIBLE_GLOBAL_PROFILE_EXISTS`. Solo queda un perfil. |
| Dos altas simultáneas con UUID distintos e igual identidad externa | Una crea el perfil; la otra recibe conflicto por comprobación o índice único. Solo queda un perfil. |
| Invocar el alta dentro de una transacción `repeatable read` | `READ_COMMITTED_REQUIRED`; no se inserta ninguna fila. |
| Alta con `p_player.id` o `globalPlayerId` de un perfil existente | Error de entrada; el perfil existente y sus relaciones no cambian. |
| Alta con nombre/fecha o identidad externa ya existente | Error de duplicado; no se crea perfil, etapa, ficha ni CTSP. |
| Alta en CTS ajeno, cerrado o con equipo contradictorio | Denegada; ningun dato nuevo. |
| Provocar fallo en insercion CTSP de una alta nueva | Transaccion completa revertida, incluidos perfil y metadatos. |
| Vincular perfil con CTSP de origen y destino abiertos, actor owner/admin en ambos, sin etapa actual | `linked`; etapa y CTSP nuevos en destino, sin ficha legacy ni cambios del perfil o de relaciones de origen. |
| Repetir el enlace anterior | `already_linked`; no aparecen duplicados. |
| Vincular UUID inexistente, perfil sin CTSP canonico o ficha legacy sin vinculo exacto | Denegado sin nuevas relaciones. |
| Vincular perfil de otro club sin rol owner/admin en origen, aun con UUID conocido | Denegado; no cambia origen ni destino. |
| Vincular con etapa actual en otro equipo, staff en destino o temporada cerrada | Denegado; ninguna etapa se traslada o modifica. |
| Provocar fallo de CTSP al vincular | Se revierte la etapa nueva. |

Antes de usar las RPC, ejecutar `supabase_multiclub_03_prepare_postflight.sql`
y comprobar todas las columnas de fase B en `true`. Verificar tambien las
politicas RLS sin cambios. Este postflight no sustituye las pruebas con dos
usuarios/clubes ni acredita el aislamiento de toda Plantilla.
