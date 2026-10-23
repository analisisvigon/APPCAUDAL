# Hotfix 04C-S2

`TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN` son privilegios de
administración de tablas; las consultas y operaciones del frontend no los
necesitan. Las RPC existentes se ejecutan con sus propios permisos y este
hotfix no cambia funciones. `MAINTAIN` solo se consulta y revoca si PostgreSQL
es 17 o superior; la revocación usa SQL dinámico para que un servidor anterior
no intente analizar ese privilegio.

1. Confirmar el proyecto en Supabase. Ejecutar
   `supabase_hotfix_04c_s2_preflight.sql` y conservar el resultado, incluida la
   versión del servidor, el origen de los grants y la posible herencia de
   `pg_maintain`.
2. Si hay una dependencia administrativa de `anon` o grants a través de otro
   rol, detenerse y revisar ese caso. El código local no contiene operaciones
   anónimas legítimas que requieran estos privilegios.
3. Ejecutar completo `supabase_hotfix_04c_s2_revoke.sql`. Si cambia un permiso
   efectivo de cualquier rol distinto de `anon` o queda acceso anónimo, la
   transacción lanza error y revierte todas las revocaciones.
4. Ejecutar `supabase_hotfix_04c_s2_postflight.sql`: `anon_effective=false` y
   `public_grants=0` para cada privilegio compatible. En PG anterior a 17,
   `MAINTAIN` aparece como `NULL` (no aplicable). Comparar `authenticated` y
   `service_role` con el preflight.

Las políticas RLS, las funciones, los datos y el corte Multiclub 03C quedan
fuera de esta transacción. SQL Editor suele actuar como `postgres`; el
postflight verifica privilegios efectivos por rol sin hacerse pasar por un
usuario de la aplicación.
