# Videoanálisis · Fase 0 (diagnóstico, sin migración)

## Qué se ha comprobado en el repositorio

- `src/App.jsx:1241-1244` genera ID con `crypto.randomUUID()` o una cadena legacy.
- `src/App.jsx:1271-1503` normaliza las cuatro familias de jugadas reconstruyendo objetos; claves futuras o desconocidas pueden quedar fuera de esa proyección.
- `src/App.jsx:7923-8004` carga los cuatro workspaces desde `partidos.pre_ai_analysis`.
- `src/App.jsx:10407-10431` guarda campos PRE, incluido `preAiAnalysis`, con `UPDATE partidos` completo para esa columna.
- `src/App.jsx:12427-12454` guarda workspaces con una cola local, pero escribe el JSON completo sin CAS entre clientes.
- `src/App.jsx:15160-15175` reemplaza todo el análisis al generar análisis y lo pone a NULL al extraer el informe rival.
- `src/App.jsx:8420-8424,10776-10782,12219-12224,12640-12658,13112-13151,14435-14443` contiene otras rutas que escriben `preAiAnalysis`.
- `src/App.jsx:25041-25052` lo combina al autocompletar desde el equipo; el guardado final también debe revisarse antes del corte canónico.
- `src/components/tactical/MatchPlanWorkspace.jsx:100-137` y `src/utils/matchPlanWorkspace.js:61` referencian `playId`. Las validaciones de Evidencias (`tacticalEvidenceValidationsV1`) usan claves de evidencias derivadas, no claves foráneas directas a jugadas.
- Las migraciones 35/39B definen `can_read_club_team_season`, `can_write_club_team_season`, `can_read_match` y `can_write_match`. Su existencia no prueba que las políticas efectivas de `partidos` los utilicen.

## Consultas manuales, exclusivamente SELECT

1. Ejecutar `supabase_video_analysis_00_historical_inventory.sql` completo en Supabase SQL Editor. Exportar **todas** las filas a CSV, sin copiar el contenido bruto de `pre_ai_analysis`. La consulta muestra IDs y nombres de claves, nunca textos de jugadas, pizarras o notas. Las huellas MD5 permiten comparar un registro antes/después, pero no sustituyen una copia exacta del JSON. Si el editor limita filas, no interpretar un CSV truncado como inventario completo.
2. Ejecutar `supabase_video_analysis_00_security_inventory.sql`. Exportar todas las filas a CSV. Revisar expresiones `USING`/`WITH CHECK`, políticas PERMISSIVE, privilegios efectivos y funciones SECURITY DEFINER. La búsqueda de palabras es orientativa; ninguna fila `REVIEW` equivale a autorización probada.
3. No ejecutar las consultas desde una cuenta `service_role` para deducir acceso de staff o jugadores. El SQL Editor administrativo no reproduce `auth.uid()` de una sesión autenticada. La verificación por identidad requiere sesiones reales autorizadas en un entorno de pruebas y operaciones de lectura separadas por owner, admin, staff asignado, staff no asignado y player. Comprobar también temporada cerrada y partido sin CTS cuando existan casos reales. Si falta una identidad o caso, el resultado es PENDING.
4. No enviar exportaciones que incluyan datos privados fuera del canal de trabajo aprobado. Los archivos SQL no solicitan claves ni tokens.

## Interpretación y bloqueos

- `BLOCKED` en identidad de partido/CTS, estructura de `plays`, ID vacío o duplicado, o referencia de Plan/consulta táctica sin jugada única: revisar antes de migrar. Un ID no UUID es `REVIEW`, no se convierte automáticamente.
- `extra_keys` y `EVIDENCE_VALIDATION` requieren copia fiel y comparación con el motor de evidencias. Los hashes comprueban integridad del JSON bruto; no demuestran que la UI proyecte todos los campos.
- `ACTIVE_PLAY_REFERENCE` puede señalar un selector antiguo que la UI resuelve mediante fallback; se revisa sin reescribirlo.
- Las políticas permisivas pueden combinarse con OR. Un helper CTS correcto no basta si otra política o RPC permite acceso más amplio.
- El SQL no puede comprobar pérdidas por escrituras concurrentes. Antes del piloto hay que probar dos usuarios autenticados con la misma revisión, un guardado de jugada y otro de Plan/Evidencias, y exigir que el segundo reciba conflicto o preserve ambas modificaciones. Nunca hacerlo sobre PRE reales.

## Pruebas locales y preparación del piloto

`node scripts/videoAnalysisPhase0.test.mjs` usa exclusivamente datos sintéticos. Comprueba preservación exacta de IDs legacy, orden, descripción multilínea, sistemas, situaciones, geometría, ABP, plantilla, campos adicionales, referencias de Plan y consulta táctica. Comprueba detección de ID vacío/repetido, referencias huérfanas y `plays` malformado. Es un **contrato de prueba para el futuro adaptador**, no una prueba de una migración todavía inexistente.

El piloto debe usar un proyecto de pruebas aislado y un PRE sintético creado allí por una cuenta autorizada, con CTS abierto propio. Se captura una copia exacta del JSON antes del cambio; se prueba una sola fase, conservando `(partido, fase, legacy_id, orden)` y el objeto bruto, y se compara byte a byte o mediante JSON canónico tanto el contenido como todas las referencias. Se ejercitan dos usuarios, CAS obsoleto, permisos y temporada cerrada. Para revertir, se vuelve a la ruta de lectura antigua **antes** de aceptar nuevas escrituras canónicas; cualquier cambio hecho después del corte debe exportarse y conciliarse antes de abandonar el piloto. No usar los 14 partidos históricos ni crear un PRE ficticio en producción.

**Criterio de avance:** CSV completo sin bloqueos sin resolver, políticas y RPC verificadas por identidad, equivalencia exacta de datos y referencias, y prueba de concurrencia superada. Hasta entonces la migración de jugadas canónicas permanece bloqueada.
