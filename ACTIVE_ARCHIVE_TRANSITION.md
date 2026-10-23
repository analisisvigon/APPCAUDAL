# Equipo operativo y archivo de clubes anteriores

## Decisión de producto

Un solo CTS puede ser el espacio **operativo** de NEXO CLUB. Los CTS anteriores
son archivo de consulta. La misma cuenta personal puede tener membresías en
Libia y en el Caudal. Los miembros del personal solo ven los CTS autorizados
para sus propias membresías. PLAYER continúa por su entrada y sus permisos
actuales.

El CTS operativo debe designarse expresamente en el **backend**. El estado
`club_seasons.is_active` es relativo a cada club y no identifica por sí solo
un único equipo operativo global. `VITE_MULTICLUB_PRIMARY_CTS_ID` es solo una
preferencia de navegación: la app la acepta únicamente si
`my_access_contexts_v1()` devuelve exactamente ese CTS para un propietario,
con temporada abierta y activa, y vuelve a verificarlo al abrirlo. No concede
permiso de lectura ni escritura. Dejarlo vacío conserva el selector existente.

## Qué se reutiliza

| Pieza local | Uso previsto |
| --- | --- |
| Identidad 01, `my_access_contexts_v1()` y selector | Una cuenta con dos membresías y contextos comprobados por servidor. |
| Vínculos exactos 02B, RPC de lectura 02/03A y `App.jsx` | Primera rama CTS de Inicio, Plantilla y Partidos, con nuevo montaje y nueva carga al cambiar de CTS. `CtsCoreApp` queda como prototipo de la previsualización local. |
| `can_write_club_team_season`, `can_write_match`, helpers de fila y 03C | Base del rechazo de escrituras en temporadas cerradas, tras verificar todas sus dependencias. |
| `App.jsx`, componentes deportivos, cálculos, formularios y PLAYER | Reutilizar la interfaz y la lógica deportiva; sustituir su capa de carga/guardado global por operaciones CTS autorizadas. PLAYER conserva su ruta. |

## Estado real hoy

Con `VITE_MULTICLUB_03_CTS_ENABLED=false`, Caudal conserva el acceso legacy.
Con el modo CTS activado localmente, el propietario abre `App.jsx` con su
cabecera, navegación y componentes visuales originales. Solo Inicio, Plantilla
y Partidos consultan datos, mediante las RPC CTS. Esas tres pantallas son de
consulta y todavía no contienen los editores completos de la aplicación
legacy. El nuevo CTS preferido, cuando exista y se configure, se abre primero.
`LegacyApp` permanece dentro del mismo archivo, pero no se monta en modo CTS:
`current_membership()` y sus cargas globales todavía no pueden resolver dos
membresías de forma segura. Cambiar de CTS desmonta el espacio anterior antes
de verificar el nuevo. «Mi historial» muestra otros contextos autorizados,
indicando cuáles aún necesitan cierre, pero su apertura queda bloqueada hasta
impedir las escrituras al archivo en backend. El histórico **aún no es inmutable en la base de datos**: 03C sigue
sin instalarse y hay políticas/RPC legacy. El selector tampoco abre temporadas
cerradas mientras exista este bloqueo.

Biblioteca, Tareas y el laboratorio ABP seguirán visibles como secciones
pendientes en modo CTS; sus componentes no se montan ni hacen consultas.
Deberán convertirse en recursos personales independientes del equipo y la
temporada sin alterar los snapshots guardados en sesiones y partidos. Su
contrato de permisos y de referencias históricas sigue pendiente.

La app deportiva completa contiene cargas iniciales globales de equipos,
competiciones, estadio y formación, además de lecturas/escrituras directas de
`jugadores`, `partidos` y sus tablas hijas. Hay valores de presentación fijados
al Caudal (por ejemplo, el equipo local por defecto y texto de análisis) y
una caché de scouting en `localStorage` con clave global
`caudal-rival-scouting-drafts-v1`. Los stores de scouting, perfiles globales,
sesiones y rendimiento hacen consultas o RPC fuera del perímetro de 03C.
Filtrar sus resultados en React no los aísla. Las importaciones, documentos y
almacenamiento deben seguir el mismo CTS que el registro padre.

## Camino mínimo hacia Libia operativo

1. **Respaldo y línea base, manuales.** Antes de cualquier migración de
   producción, crear y comprobar un respaldo restaurable de base de datos y
   Storage; conservar los hashes de funciones/políticas y los recuentos de
   Caudal, incluidos los 24 vínculos 02B. Detenerse si no hay restauración
   verificable o si cambian esos vínculos.
2. **Contrato de un solo equipo operativo.** Preparar una migración pequeña,
   revisable, para designar en backend un CTS operativo único y otro estado de
   archivo, sin inferirlo de nombres ni de `is_active`. Resolver antes la
   restricción global de un solo equipo propio en `equipos_rivales` y la clave
   única global de `competitions.key` para que Libia tenga identidad propia.
   No crear aún el equipo ni sobrescribir filas del Caudal.
3. **Escrituras cerradas por fila.** Adaptar las rutas de `App.jsx` por grupos:
   Plantilla y Partidos con sus hijos/RPC; después PRE/POST, Dossier,
   Rendimiento, Análisis, Lito y Sesiones. Cada lectura debe tener autorización
   de CTS en backend. Cada escritura, importación, documento y operación
   derivada debe comprobar el CTS del registro concreto y el estado operativo;
   una petición que cambie su CTS no debe poder trasladar datos. Resolver las
   políticas permisivas adicionales y las funciones `SECURITY DEFINER` de
   cada grupo antes de abrirlo. Partir de 03C, sin instalarlo hasta completar
   sus dependencias de snapshots y el inventario de políticas/RPC que exige
   su preflight. 03C cubre un perímetro deportivo, no todas las tablas del app.
4. **Archivo en backend.** Cerrar la escritura de *todas* las filas del Caudal
   mediante RLS y comprobaciones de RPC/Storage, manteniendo SELECT autorizado
   para la cuenta personal y el staff que corresponda. Los registros sin CTS
   exacto o con asociación ambigua se bloquean para escritura y se revisan;
   no se asignan automáticamente. La interfaz de archivo puede ampliar sus
   vistas conforme cada lectura quede aislada.
5. **Ensayo de la transición y corte.** Probar en un proyecto aislado con datos
   ficticios mínimos y cuentas autenticadas de Libia, Caudal, sin acceso y PLAYER:
   lecturas positivas, escrituras positivas
   solo en Libia, y denegación de SELECT/INSERT/UPDATE/DELETE directos y por
   RPC sobre Caudal y otro club. Probar cambio de CTS, cachés, importaciones,
   documentos, temporadas cerradas y restauración del respaldo. Solo entonces
   considerar instalar 03C y activar el modo CTS en producción; después crear
   el CTS de Libia, comprobar su autorización real y configurar la preferencia
   de navegación con su UUID. Para el ensayo, usar una rama aislada o una copia
   **solo de esquema** con filas ficticias; no copiar registros ni cuentas de
   producción. El paquete 04B/04C para crear todo el esquema desde cero queda
   fuera de este camino mientras exista esa opción.

**Condiciones de parada:** cualquier consulta global autenticada que devuelva
datos de otro club, cualquier escritura que altere Caudal, una RPC definidora
sin guarda de fila, un documento accesible por URL/Storage sin permiso CTS,
dependencias ausentes de 03C, diferencias en recuentos históricos o una prueba
PLAYER fallida. Mantener desactivado el modo CTS y sin crear Libia hasta
resolver la condición. No continuar el esquema de ensayo 04B/04C para este
objetivo; sus artefactos quedan disponibles, pero no forman parte del camino
directo.
