# Multiclub 02: primer bloqueo de backend

La aplicación actual consulta directamente `jugadores`, `partidos` y tablas
derivadas. Las políticas legacy de esas tablas se basan en `is_app_staff()`;
todavía no aíslan todas las filas por equipo y temporada. Por eso esta etapa
no conecta el nuevo contexto a `App.jsx` ni activa el selector.

## Instalación manual de las lecturas acotadas

1. Ejecutar `supabase_multiclub_02_scoped_reads_preflight.sql` en SQL Editor.
   Todos los objetos deben existir; las dos RPC nuevas deben figurar como
   ausentes. Guardar el hash de `current_membership()` y revisar los contadores
   de partidos sin CTS y fichas activas sin identidad canónica. Los contadores
   revelan cobertura, no autorizan corregirla automáticamente.
2. Si el esquema coincide, instalar manualmente
   `supabase_multiclub_02_scoped_reads.sql`. Crea dos funciones de lectura:
   `my_cts_matches_v1(uuid)` y `my_cts_roster_links_v1(uuid)`. No cambia tablas,
   datos, RLS ni funciones existentes.
3. Ejecutar `supabase_multiclub_02_scoped_reads_postflight.sql`. Deben aparecer
   dos funciones y todos sus indicadores de seguridad en `true`. El hash de
   `current_membership()` debe conservarse.
4. Con sesiones autenticadas de prueba, comprobar que cada RPC devuelve filas
   solo para CTS autorizados, que la revocación retira el acceso, que el staff
   no lee CTS ajenos y que los contextos históricos siguen siendo legibles.
   Comprobar por separado Caudal y PLAYER. Las pruebas locales simuladas no
   sustituyen estas comprobaciones.

`my_cts_roster_links_v1` no escoge una ficha legacy si encuentra cero o varias:
devuelve `legacy_ficha_count` para que esa cobertura se revise. La ficha
actual no demuestra por sí sola la composición histórica de una temporada.

La instalación de estas RPC no completa el aislamiento. Antes de conectar
Plantilla y Partidos faltan rutas de escritura acotadas, la revisión de RLS de
las tablas legacy y sus hijas, y la cobertura canónica de las fichas. No crear
una segunda membresía ni activar el selector en esta etapa.
