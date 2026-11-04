# Videoanálisis 01A y corte RLS 01: pruebas pendientes en entorno aislado

No ejecutar estas pruebas contra partidos reales. La revisión local de SQL no demuestra el comportamiento por identidad.

## Preparación

En un proyecto aislado con el mismo esquema, crear identidades ficticias para owner, staff asignado, staff sin asignación, staff de otro CTS y usuario sin rol deportivo; crear dos CTS abiertos de distintos equipos, uno cerrado, tres partidos ficticios y datos de alineación, sustituciones y estadísticas suficientes para que la RPC pueda operar. Registrar los UUID y el estado inicial de **ambas** tablas hijas (`partido_eventos_sustitucion` y `partido_estadisticas_jugador`). No usar `service_role` para simular usuarios. Para cada identidad, establecer `ROLE authenticated` y los claims JWT, y comprobar `auth.uid()` antes de llamar a una RPC.

## Casos obligatorios

| Caso | Operación | Resultado esperado |
|---|---|---|
| Owner del CTS abierto | Consultar sustituciones; crear, modificar, retirar y materializar una sustitución válida | Permitido; estadísticas coherentes con el partido |
| Staff asignado al CTS abierto | Las mismas operaciones | Permitido mientras exista asignación y membresía activa |
| Staff de otro CTS | Invocar directamente la RPC con el UUID del partido ajeno; SELECT y UPDATE directos sobre estadísticas ajenas | Denegado o cero filas; ningún cambio |
| Staff sin asignación | Misma prueba directa | Denegado o cero filas; ningún cambio |
| Staff con asignación revocada | Revocar en el proyecto aislado y repetir | Denegado inmediatamente; ningún cambio |
| Temporada cerrada | Consultar sustituciones; intentar cada operación mutante y UPDATE directo | Lectura autorizada, escritura denegada |
| Anónimo | Invocar ambas RPC y consultar las tablas hijas | EXECUTE denegado; sin lectura ni escritura |
| Partido ajeno en `p_partido_id` | Llamar a create/update/delete/materialize | Denegado antes de escribir |
| Evento de otro partido en `p_event_id` | Usar un partido autorizado con UUID de evento ajeno | No modifica ni el evento ajeno ni sus estadísticas |
| JWT sin identidad o claims inconsistentes | Invocar ambas RPC | Denegado; no se acepta solo `SET ROLE` |

Para **cada** caso negativo, comparar antes y después los registros de eventos y estadísticas de todos los partidos ficticios, no solo el recuento. Para verificar rollback, forzar un fallo de validación después de iniciar la operación y comprobar que tampoco quedan cambios parciales. Las pruebas deben ejecutarse en transacciones separadas y terminar en `ROLLBACK`; para probar revocación usar únicamente datos ficticios del proyecto aislado.

## Corte RLS de `partidos`

Tras instalar 01A y verificarla, probar en el proyecto aislado el corte 01. Comprobar SELECT, INSERT, UPDATE y DELETE directos para las mismas identidades; verificar intento de cambiar `club_team_season_id` entre dos CTS autorizados y mediante una actualización que active otros triggers. El trigger debe rechazar ambos. Confirmar que PRE, POST, Sistemas enfrentados, Evidencias y Plan de partido mantienen el comportamiento esperado con datos ficticios.

## Condición de salida

No autorizar producción si 01A no coincide con las huellas y políticas del catálogo desplegado, si las funciones SECURITY DEFINER de escritura relacionadas siguen usando solo `is_app_staff()`, si quedan tablas hijas con políticas directas abiertas, o si alguna prueba de identidad falla. El inventario 01 existente enumera candidatos; la revisión humana de sus cuerpos y permisos EXECUTE sigue siendo necesaria.
