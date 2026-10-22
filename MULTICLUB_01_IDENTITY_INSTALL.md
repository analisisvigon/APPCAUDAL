# Multiclub 01: identidad (instalacion manual)

Esta fase prepara la identidad. No activa el selector ni habilita el uso de dos
clubes en las pestañas deportivas. `current_membership()` y sus dependencias
permanecen intactas.

1. En Supabase SQL Editor, revisar y ejecutar
   `supabase_club_core_40_multiclub_identity_preflight.sql`. Confirmar que los
   objetos requeridos existen, que `my_access_contexts_v1()` no existe y que
   están las cuatro columnas indicadas. Guardar el hash de
   `current_membership()`.
2. Si el preflight coincide con el esquema esperado, instalar manualmente
   `supabase_club_core_40_multiclub_identity.sql`. Crea solo la función nueva;
   no cambia tablas, permisos RLS ni datos.
3. Ejecutar `supabase_club_core_40_multiclub_identity_postflight.sql` y exigir
   todos los indicadores de seguridad en `true`. El hash de
   `current_membership()` debe ser idéntico al del preflight.
4. Con cuentas reales de prueba y el cliente autenticado (nunca con
   `service_role`), comprobar que la RPC devuelve solo membresías activas del
   usuario; que un owner ve únicamente contextos de sus clubes; que staff ve
   únicamente equipos/temporadas con permiso explícito; que los contextos
   cerrados aparecen como `closed`; y que PLAYER devuelve `contexts: []`.
   Verificar también que la revocación elimina el acceso en la siguiente
   consulta. Revisar el inicio de sesión actual de owner, staff y PLAYER.
5. Distribuir el frontend preparado solo después de completar esas
   comprobaciones. La RPC ausente mantiene el flujo anterior para una cuenta
   con una sola membresía; errores distintos de RPC ausente cierran el acceso.
   Con varias membresías se muestra un estado explícito y no se abre ninguna
   pestaña deportiva.

No crear una segunda membresía real hasta completar y verificar el selector,
el aislamiento de todas las consultas y la autorización de sus escrituras.
Los helpers legacy que dependen de `current_membership()` siguen rechazando
varias membresías activas, por diseño de la transición.
