# Eliminar un jugador desde Plantilla

El botón actual de Plantilla conserva su confirmación y llama a
`delete_own_player_atomic_v1(jugador_id)`. El SQL se instala manualmente;
instalarlo no borra ningún jugador. Mantener el modo CTS desactivado.
La revisión local de RPC no encontró otra función que borre `jugadores`;
`supabase_rival_lineup_atomic.sql` borra `jugadores_rivales` y queda fuera
de este cambio. El preflight consulta el catálogo real para detectar FK o
triggers no recogidos en las migraciones del repositorio.

## Antes de instalar

1. Guardar un respaldo verificable de APPCAUDAL. Confirmar en el panel de
   Supabase el proyecto abierto.
2. Ejecutar manualmente
   `supabase_almadina_delete_own_player_preflight_READONLY.sql`. Comparar
   todas las FK y triggers devueltos con la lista de
   `supabase_almadina_delete_own_player_MANUAL.sql`. Detenerse ante cualquier
   dependencia nueva, acción `ON DELETE` distinta o trigger de borrado no
   documentado. Esta consulta solo muestra metadatos.
3. Revisar e instalar manualmente
   `supabase_almadina_delete_own_player_MANUAL.sql` en una única ejecución.
   Si falla una condición, la transacción se revierte. Después ejecutar
   `supabase_almadina_delete_own_player_postflight_READONLY.sql`: todos los
   comprobaciones booleanas de autorización deben ser `true`; la columna
   informativa `service_role_effective_delete` debe coincidir con el preflight.
4. Publicar el cambio de frontend únicamente después de instalar y verificar
   la RPC. Hasta entonces, el botón nuevo mostrará un error porque la RPC
   aún no existe.

## Alcance de la transacción

Solo staff autenticado del único club actual puede borrar una ficha del
equipo propio. Se comprueba la etapa global, la vinculación CTS si existe y
el inventario de FK antes de escribir. La aplicación pierde el permiso de
`DELETE` directo sobre `jugadores`; la RPC de definidor aplica el permiso y
ejecuta todas las operaciones dentro de una transacción.

Se eliminan por UUID las multas **sin pagos** del sujeto jugador, su sujeto
de Multas, tratamientos de Fisio, métricas individuales de carga y filas de
estadísticas individuales de partido. Las FK `ON DELETE CASCADE` ya conocidas
eliminan wellness, RPE, consumos de suspensión, mapeo de migración y vínculo
legacy CTS del jugador. Se cierra su etapa global activa; si el CTS vinculado
tiene temporada abierta, se marca su pertenencia como `has_departed`.

Se conservan partidos, goles, eventos rápidos, alineaciones, snapshots,
sesiones, equipos, incidencias/reglas de Multas, bibliotecas, tareas y ABP.
Sus FK `SET NULL` pueden quitar el UUID del jugador pero los nombres capturados
en snapshots permanecen. Se conserva el perfil global y la pertenencia
canónica CTS, porque pueden respaldar historial y sesiones. También se
conservan archivos de Storage; eliminarlos requiere un flujo independiente.
Las estadísticas antiguas sin `jugador_id` y atribuidas solo por nombre no se
borran: un nombre no identifica inequívocamente a una persona.

La RPC **rechaza sin borrar nada** si la ficha está ligada a una cuenta PLAYER,
si hay pagos de multas, si interviene en sustituciones compartidas, si la
etapa o vinculación CTS es ambigua, o si aparecen nuevas FK o triggers de
DELETE no acreditados. Los pagos tienen un ledger inmutable y una sustitución
pertenece también a otro jugador. No se desactivan esas restricciones.

## Pruebas manuales en un entorno de ensayo aislado

Usar usuarios y jugadores ficticios. No hacer estas pruebas en APPCAUDAL:

1. Con staff autorizado, crear una ficha ficticia con multa sin pagos,
   tratamiento, carga y estadísticas individuales. Anotar los UUID de
   partidos, equipos, sesiones, tareas, biblioteca y ABP. Confirmar el botón:
   desaparecen solo la ficha y sus filas personales. Los UUID anotados deben
   seguir existiendo, y las demás fichas deben permanecer.
2. Repetir con una multa que tenga un pago. Esperar
   `PLAYER_IMMUTABLE_FINE_PAYMENTS_REVIEW_REQUIRED` y comprobar que ficha,
   multa y pago siguen presentes.
3. Repetir con una sustitución que incluya a otro jugador. Esperar
   `PLAYER_SHARED_SUBSTITUTION_REVIEW_REQUIRED`; comprobar ambos jugadores,
   evento y partido.
4. Repetir con una membership PLAYER vinculada. Esperar
   `PLAYER_IDENTITY_LINK_REVIEW_REQUIRED`; comprobar que la cuenta y la ficha
   continúan.
5. Iniciar sesión como viewer, PLAYER y anon: la RPC debe denegar. Intentar
   `DELETE` directo de `jugadores` como authenticated: debe denegar incluso
   para staff. Probar con un UUID de rival o de otro club: debe denegar.
6. Forzar un error posterior al inicio de la RPC en ensayo y verificar que
   ninguna fila personal previa desaparece; PostgREST ejecuta la llamada en
   una sola transacción.

No se ha ejecutado ninguna de estas pruebas contra Supabase desde el
repositorio. Si el preflight muestra una FK o trigger adicional, detener la
instalación y aportar solo ese metadato estructural para ajustar el SQL.
