# Multiclub 03 · Instalación manual por fases

## Estado del código

El módulo `src/sports/ctsSportsData.js` prepara lecturas y verificaciones de
escritura por CTS. Con `VITE_MULTICLUB_03_CTS_ENABLED=true` y exactamente un
CTS autorizado, la aplicación ya lo usa para las cargas principales de
Plantilla y Partidos, sus eventos principales, el contexto de Lito, las
evidencias competitivas y el alta de partidos/jugadores.
La variable está desactivada por defecto. La aplicación **todavía no lo invoca
desde todas sus pestañas**, así que el corte RLS de la fase C **no está
autorizado para instalación** con este frontend. El Caudal sigue usando el
flujo existente.

## Orden

1. Ejecutar `supabase_multiclub_03_preflight.sql` en el SQL Editor. Revisar
   objetos, filas sin CTS/vínculo, FK, políticas, RPC SECURITY DEFINER y vistas.
   Incluye las tres tablas del plan de partido, cuyas políticas actuales
   permiten acceso a cualquier usuario autenticado.
   No interpretar ausencia de filas como prueba con usuarios reales.
2. Si coincide el contrato, instalar `supabase_multiclub_03_prepare.sql`.
   Ejecutar `supabase_multiclub_03_prepare_postflight.sql` (7 funciones de fase A)
   y confirmar que los
   guards de sustituciones usan `can_read_match`/`can_write_match` y que las
   políticas legacy siguen iguales.
3. Instalar `supabase_multiclub_03_player_create.sql` y repetir el postflight
   (9 funciones: alta v2 y enlace canónico de perfil existente). En el bloque
   de contratos de fase B todas las columnas deben ser `true`. La etapa nueva
   usa `club_seasons.label`; una fecha de inicio enviada debe quedar dentro
   de la temporada y ninguna fecha se inventa.
   Probar `create_own_player_atomic_v2` en un **entorno de ensayo separado de
   producción** con un CTS autorizado abierto, otro denegado y una temporada
   cerrada. La función antigua no se reemplaza. Probar por separado el enlace
   de perfil existente: solo owner/admin de origen y destino, sin etapa actual
   en otro equipo; crea CTSP sin ficha legacy ni fecha de incorporación.
4. Antes del corte, conectar TODAS las cargas y guardados de Plantilla,
   Partidos, hijos (incluido el plan de partido), importaciones y vistas
   derivadas al contexto autorizado.
  El código actual mantiene consultas globales en otras vistas derivadas. Cerrar además el acceso
   indirecto por perfil global, catálogos/vistas y cualquier RPC del preflight
   que permita saltar `can_read/write_match` o las reglas PLAYER.
5. Ejecutar de nuevo el preflight. Solo tras pruebas reales en entorno de
   ensayo con dos clubes y la aplicación CTS completa, instalar
   `supabase_multiclub_03_rls_cutover.sql` y ejecutar
   `supabase_multiclub_03_rls_postflight.sql`.
6. Ejecutar la matriz de `supabase_multiclub_03_negative_tests.sql` usando
   sesiones `authenticated` reales. El SQL Editor como `postgres` elude RLS.

## Bloqueos concretos antes de la fase C

- `App.jsx` mantiene consultas globales en Inicio, perfiles, Dossier y análisis;
  sus cachés y guardados derivados aún no están completamente separados.
  El selector visual sigue pendiente. Con más de un CTS, el modo nuevo bloquea
  la entrada hasta que exista una selección explícita.
- El alta de partidos ya incluye CTS y revalida la autorización en el modo
  nuevo. El alta de Plantilla puede invocar la RPC v2; la ruta legacy sigue
  activa con el modo nuevo deshabilitado.
- El enlace de un perfil global existente genera solo la pertenencia canónica.
  Falta proyectarlo en Plantilla con un editor CTS aislado. Un jugador con una
  etapa global todavía activa requiere un flujo de traslado explícito; la RPC
  devuelve error y no cambia esa etapa ni la ficha de otro club.
- `save_global_player_profile` y `assign_global_player_to_team` pueden operar
  sobre fichas/perfiles globales y carecen de CTS explícito. Revisar las rutas
  usadas por el editor de Plantilla y la importación antes de segundo club.
  Con el modo CTS, el cliente bloquea temporalmente edición, vinculación,
  cambio de equipo, baja, fusión y eliminación globales; conserva esas
  operaciones en el modo actual del Caudal. El alta propia usa la RPC v2.
- Las vistas/RPC SECURITY DEFINER devueltas por el preflight requieren
  verificación de autorización fila a fila. No se presupone que una política
  RLS proteja una función SECURITY DEFINER. El corte aborta si detecta una
  función expuesta que aún combine estas tablas con `is_app_staff()`.
- `competitions`, rivales y otros catálogos globales permanecen fuera de este
  corte. Deben clasificarse como compartidos o recibir un CTS antes de mostrar
  datos de un segundo club.

No instalar la fase C para "probar" el frontend actual: denegará el INSERT
directo en `jugadores` y las rutas derivadas globales aún pueden mezclar datos.
No crear la segunda membresía
hasta superar las pruebas reales de aislamiento.
