# Hotfix 04C-S1: cerrar DML anónimo en cuatro tablas

## Alcance y dependencia local

`src/main.jsx` monta `AppAuthShell`. Antes de iniciar sesión, el shell muestra
el acceso y no monta `StaffApp` ni `PlayerApp`. Las lecturas y escrituras de
`jugadores_rivales`, `equipo_rival_alineacion` y
`equipo_rival_banquillo` encontradas en `src/App.jsx` pertenecen a la
aplicación de staff y se cargan con una sesión autenticada. `jugadores` también
se consulta desde esa ruta; PLAYER usa su portal y RPC propias. No se ha
encontrado un flujo legítimo del frontend que necesite DML anónimo sobre estas
cuatro tablas. La clave pública de Supabase no equivale a una sesión anónima
autorizada para leerlas.

## Instalación manual

1. Confirmar visualmente el proyecto de producción en Supabase SQL Editor.
   Ejecutar `supabase_hotfix_04c_s1_anon_preflight.sql` y guardar el resultado.
   Revisar especialmente concesiones por columna, políticas y candidatas a
   vistas/RPC ejecutables por `anon`.
2. Si alguna vista o RPC `SECURITY DEFINER` ejecutable por `anon` expone estas
   tablas, inspeccionar su contrato antes de declarar cerrado el acceso
   anónimo. Esa vía **no impide revocar los grants directos**, pero sigue
   siendo un riesgo independiente. No modificarla como parte de este hotfix.
3. Ejecutar completo `supabase_hotfix_04c_s1_anon_revoke.sql`. La transacción
   retira SELECT, INSERT, UPDATE y DELETE de `anon` y `PUBLIC`, sin tocar los
   grants de `authenticated`. Comprueba que los permisos efectivos de todos
   los demás roles no cambien; si hay grants heredados por otro rol o por
   columna que mantengan acceso `anon`, lanza error y revierte todo.
4. Ejecutar `supabase_hotfix_04c_s1_anon_postflight.sql`. Esperar cuatro
   filas con `anon_closed=true`, `public_dml_grants=0`, y todos los permisos
   efectivos anónimos de tabla/columna en `false`. Comparar los permisos de
   `authenticated` y las políticas con el preflight.
5. Con una sesión real de staff, verificar lectura y una operación de edición
   de las vistas afectadas; con cliente sin sesión, confirmar denegación de
   SELECT y escrituras directas. No usar SQL Editor como sustituto de estas
   pruebas de rol: normalmente opera como `postgres`.

Si falla por grants de columna o por un rol heredado, **no ejecutar revocaciones
adicionales a ciegas**: guardar el resultado del preflight y preparar una
corrección específica para ese origen. Si falla por pérdida de permisos de
`authenticated`, revisar primero las concesiones `PUBLIC`; este hotfix no
añade grants a usuarios autenticados.

## Riesgo que permanece

El hotfix no cambia RLS. Las políticas `ALL USING (true)` de las tres tablas
de rivales permanecen; comprobar en el preflight sus roles exactos. Si
alcanzan a `authenticated` (directamente o mediante `PUBLIC`) y ese rol tiene
grants de tabla, seguirán permitiendo operaciones amplias. Tampoco cierra
vistas o funciones `SECURITY DEFINER` expuestas a `anon`; el preflight y el
postflight las listan para revisión manual. `jugadores` conserva sus políticas
basadas en `is_app_staff()`. El aislamiento CTS y el corte 03C son trabajos
separados.
