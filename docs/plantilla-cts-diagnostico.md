# Plantilla CTS: diagnóstico y comprobación local

## Causa comprobada en el repositorio

El modo completo de compatibilidad podía llegar al editor global sin `selectedCtsId`.
En esa situación, `createOwnPlayerProfileAtomic` elegía `create_own_player_atomic`:
creaba perfil, etapa, ficha y migración, pero no pertenencia CTS ni binding.
El modo `CtsWorkspace` ya utilizaba `create_operational_player_v1`, que delega en
`create_own_player_atomic_v2` y crea todas las relaciones en una transacción.
También existía ya una comprobación de visibilidad después del alta en ese modo.
La configuración y las funciones instaladas en Supabase no se han verificado en vivo.

La proyección `my_cts_jugadores_v1` excluye anulaciones, pero no bajas CTS.
Por eso una ficha legacy activa no basta para decidir si un jugador pertenece
a la plantilla actual. Además, las posiciones no reconocidas podían sumar en el
contador sin aparecer en los cuatro grupos de tarjetas.

El error `PLAYER_DELETE_TRIGGER_REVIEW_REQUIRED` lo emite la comprobación preventiva
de `delete_own_player_atomic_v1` al detectar triggers de borrado. No demuestra que
un trigger haya fallado. La interfaz seguía ofreciendo esa operación abandonada.

## Correcciones locales

- La plantilla selecciona un CTS autorizado; si hay varios y no existe una
  preferencia operativa autorizada, exige elegirlo. No deduce la temporada por nombre.
- El alta propia exige ese contexto y usa la operación atómica CTS existente.
  Verifica permisos y temporada abierta y confirma ficha, perfil y etapa en la
  lectura posterior antes de cerrar el formulario.
- El intento conserva su UUID. El reintento relee el resultado antes de escribir;
  una confirmación de escritura sin vínculo visible mantiene el error y el formulario.
- La lectura cruza fichas y bindings exactos; excluye bajas, anulaciones y salidas.
  Los contadores y tarjetas usan esa plantilla; las posiciones desconocidas tienen grupo.
- Inicio no sobrescribe la plantilla con una consulta global. Cambiar de contexto
  invalida respuestas anteriores y cierra editores vinculados al contexto anterior.
- Disponibilidad, capitanes y consumo de sanciones comprueban el contexto de Plantilla;
  el consumo automático solo considera partidos del CTS seleccionado.
- Se retira el borrado global de Plantilla y de la base global. Retirar a un jugador
  de una temporada es una operación diferente; no se ha implementado ni ejecutado aquí.

Archivos principales: `src/App.jsx`, `src/sports/ctsSportsData.js`,
`src/utils/globalPlayerStore.js`, `src/utils/rosterGroups.js` y sus pruebas.
`package.json` incorpora `test:roster-cts`.

## Estado de los datos y SQL pendiente

No se han consultado ni modificado datos reales. La evidencia aportada es:

| Perfil | Evidencia disponible | Estado actual |
| --- | --- | --- |
| pepin | Verificador anterior: `READY_RECOVER_EXISTING_ROWS` | Pendiente de nueva lectura |
| pepe | Verificador anterior: `READY_RECOVER_EXISTING_ROWS` | Pendiente de nueva lectura |
| pepin2 | Mismo resultado anterior; tarjeta visible en captura posterior | Posiblemente vinculado; pendiente de confirmar |

Ejecutar manualmente **solo** los verificadores de lectura:

1. `supabase_almadina_roster_diagnostic_readonly.sql`: funciones instaladas,
   definición real de las RPC, conteos del CTS y membresías/asignaciones STAFF.
2. `supabase_almadina_nexo_test_players_cts_verify.sql`: estado individual;
   distingue `ALREADY_LINKED_ACTIVE_NO_ACTION` de `READY_RECOVER_EXISTING_ROWS`.

No se ha ejecutado ni cambiado la propuesta de recuperación
`supabase_almadina_nexo_test_players_cts_proposal.sql`. No ejecutarla por el resultado
antiguo: primero debe comprobarse el estado actual. La corrección React reutiliza
las RPC existentes; los verificadores determinarán si falta alguna en el despliegue.
SQL Editor no simula el acceso STAFF cuando `auth.uid()` es NULL.

Las 24 bajas históricas, el código `caudal`, las etapas con `season = NULL`, los
triggers, RLS y membresías se mantienen intactos. No se han creado migraciones.

## Prueba manual en localhost

1. Ejecutar `npm.cmd run dev`. Entrar en Competición → Plantilla y seleccionar
   Al-Madina SC Sub-23 · 2026/2027. Confirmar el CTS
   `961970c8-0fcf-4c45-94d6-787647619c61` en las llamadas RPC de DevTools.
2. Con un usuario autorizado, crear un jugador de prueba de nombre único.
   Debe aparecer inmediatamente una sola tarjeta, incrementarse el contador en uno
   y mantenerse después de recargar. Comprobar también un jugador sin posición.
   Esta prueba manual sí escribe datos: no la ha ejecutado el agente.
3. En una base de pruebas, simular fallo de la lectura posterior al alta y reintentar
   desde el mismo formulario. El UUID debe conservarse y el total no duplicarse.
4. Seleccionar otro CTS y volver: no deben aparecer tarjetas del contexto anterior.
   Una temporada cerrada no permite altas. Un archivo no disponible permite volver
   al CTS abierto desde el selector.
5. Entrar como STAFF asignado: solo debe listar los CTS autorizados. Probar también
   con un usuario sin esa asignación, sin modificar sus permisos: no debe poder crear
   ni consultar la plantilla objetivo.
6. Confirmar que no aparece Eliminar global y que las 24 bajas siguen fuera de la
   plantilla activa. Comparar con los verificadores sin recuperar ningún registro.

## Comprobaciones automatizadas

`npm.cmd run test:roster-cts`, `npm.cmd run test:global-players`,
`npm.cmd run test:captains`, `npm.cmd run test:player-availability` y
`node src/auth/resolveAppIdentity.test.js`: correctas.
Cubren contexto autorizado, temporadas cerradas, aislamiento, bajas, bindings
incompletos, doble envío, respuesta perdida, confirmación fallida y tarjetas sin posición.
Son pruebas locales con clientes simulados; no acreditan el estado remoto de Supabase.

`npm.cmd run build`: correcto (aviso de Vite por chunks mayores de 500 kB).
`git diff --check`: correcto. No se han hecho commit, push ni despliegue.
