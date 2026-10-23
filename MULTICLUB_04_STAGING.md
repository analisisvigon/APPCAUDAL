# Multiclub 04: ensayo y criterios de apertura

El selector se puede probar localmente con `VITE_MULTICLUB_03_CTS_ENABLED=true`
contra un proyecto de Supabase **separado de producción** que tenga las fases
01, 02, 02B, 03A y 03B. No instalar 03C ni reutilizar credenciales o datos de
producción para crear el segundo club. Esta bandera abre `CtsCoreApp`, una
ruta independiente de `App.jsx` que solo consulta Inicio, Plantilla y Partidos
mediante RPC CTS. Inicio calcula sus cifras de esas mismas respuestas.
Todas las escrituras, documentos, estadísticas hijas y demás módulos siguen
cerrados. El modo no constituye todavía seguridad completa de la API porque
las políticas legacy directas continúan vigentes hasta 03C.
Usar una copia local separada y `.env.staging.example` como plantilla para
`.env.staging` (ignorado por Git). Vite también carga `.env.local` en modo
staging: comprobar antes de iniciar que no prevalezca una URL de producción.
Iniciar con `npm run dev -- --mode staging` solo tras comprobar esa URL.

## Casos del selector

1. Propietario con dos CTS autorizados de clubes distintos: aparecen solo
   esos equipos, con escudo, club, temporada y estado. Elegir uno vuelve a
   consultar `my_access_contexts_v1()`; «Cambiar equipo» regresa al selector.
2. Revocar uno de los CTS antes de elegirlo: la selección se rechaza tras la
   nueva consulta. Un UUID manipulado tampoco debe ser aceptado.
3. Staff con un CTS: identidad resuelta sin selector. Su espacio deportivo
   permanece cerrado en esta bandera hasta que las rutas estén aisladas.
4. Staff con varios CTS: acceso ambiguo explícito, sin elección automática.
5. PLAYER: entrada directa al portal actual, sin selector ni datos de staff.
6. Cerrar sesión y entrar con otra cuenta: desaparecen las opciones previas.

## Pendiente antes de abrir `StaffApp` para un segundo club

- Sustituir las cargas globales y guardados de Inicio, Plantilla, Partidos,
  PRE, POST, Dossier, Rendimiento, Análisis, Lito, Sesiones y vistas derivadas
  por consultas/RPC con autorización CTS en el servidor. Verificar también
  importaciones, documentos, estadísticas y tablas hijas de partidos.
- Invalidar todas las cachés y operaciones en curso al cambiar CTS. Las
  comprobaciones de `SportsContextCoordinator` ya cubren algunas rutas,
  pero aún existen cargas globales en `App.jsx`.
- Probar con sesiones autenticadas de dos clubes lecturas y escrituras
  directas, RPC, cambios de CTS y temporadas cerradas. Verificar que PLAYER
  solo ve sus filas y agregados anónimos permitidos.
- Repetir preflight 03 y revisar funciones `SECURITY DEFINER`, vistas y
  políticas permisivas. Solo entonces valorar la instalación manual de 03C.

Con la bandera desactivada, el acceso actual de un solo club sigue usando
el flujo anterior. No activar el segundo club en producción antes de estos
controles.
