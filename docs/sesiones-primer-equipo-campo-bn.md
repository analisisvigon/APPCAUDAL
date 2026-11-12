# Sesiones: primer equipo y campo B/N

El estado `first_team` («Convocado con el primer equipo») se guarda exclusivamente
en la disponibilidad de la sesión. Conserva la plantilla congelada y no modifica
la disponibilidad general. Tiene contador propio y no suma como disponible,
participante, ausente o lesionado. Los cuatro estados anteriores se conservan.
La etiqueta aparece en la ficha y en la impresión individual y conjunta.

El selector «Campo verde / Campo B/N» está en la barra de impresión individual y
en el diálogo de exportación por fechas. Es una preferencia temporal de impresión:
no se escribe en las tareas, sesiones ni snapshots. La exportación conjunta fija
la apariencia elegida al preparar el lote. Se mantiene la plantilla A4 horizontal.

Se reutiliza el SVG de Biblioteca con el modo verde por defecto. B/N cambia fondo
y líneas del terreno; jugadores y zonas conservan sus colores. El material y los
trazos blancos se dibujan oscuros para conservar contraste sobre papel, sin cambiar
sus coordenadas. Los jugadores blancos conservan su relleno con un borde oscuro.
Las distribuciones de jugadores y espacio de la sesión también reciben fondo
blanco y líneas oscuras. No se aplica ningún filtro global de escala de grises.

## SQL obligatorio antes de usar el nuevo estado

Preparados, **sin ejecutar**:

- `supabase_sessions_first_team.sql`: amplía la restricción de estados y la
  validación de `save_planned_session_availability_04b`.
- `supabase_sessions_first_team_verify.sql`: comprueba instalación, nuevo estado,
  bloqueo CTS/revisión, auditoría, RLS y permisos mediante consultas de solo lectura.

La migración preserva el cuerpo de la RPC instalada salvo su lista de estados.
Conserva los bloqueos CTS/CAS, permisos, auditoría, triggers y datos. Si encuentra
una definición inesperada o una instalación parcial, aborta la transacción.
Sin esta migración, Supabase rechazará guardar `first_team`; el modo B/N no necesita SQL.

## Verificación

`npm.cmd run test:session-appearance` comprueba conteos, compatibilidad, guardado y
reapertura mediante cliente simulado, aislamiento de snapshots, renderizado
individual/conjunto y geometría idéntica en campos completo, medio, libre y área.
Genera PDF reales mediante Chrome/Edge en verde y B/N: dos páginas por sesión de
prueba y cuatro por lote de dos sesiones, todas A4 horizontales sin rotación.
También genera vistas previas PNG con jugadores rojos/azules, zonas, porterías,
flechas y anotaciones. No conecta con Supabase.

Limitación detectada: `scripts/plannedSessionsFirstSaveSafety.test.mjs` contiene
una aserción antigua del atributo `disabled` del botón Guardar que también falla
en HEAD anterior a estos cambios. No se ha modificado ese flujo ajeno al encargo.

No se han realizado commit, push, despliegue ni modificaciones de datos reales.
