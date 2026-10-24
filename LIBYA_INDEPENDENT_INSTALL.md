# NEXO CLUB Libia: instalación independiente

## Estado y decisión

La rama legacy de `App.jsx` conserva diseño, navegación y lógica de las nueve
pestañas prioritarias. `AppAuthShell` la abre para staff con CTS desactivado y
mantiene la entrada directa de PLAYER. El proyecto Libia tendrá otra base de
datos, Auth, Storage, dominio y build. El proyecto Caudal queda como archivo
independiente; este plan no instala Transición 02 ni Multiclub 03C.
La misma dirección de correo puede registrarse de nuevo en Libia, pero Supabase
Auth creará otra identidad: una sesión única compartida entre proyectos exige
un proveedor de identidad común y queda fuera de este arranque rápido.

**Primer paso manual:** crear un proyecto Supabase nuevo para Libia, vacío y sin
restaurar ningún backup del Caudal. Anotar los dos project refs desde sus paneles
y verificar que son distintos. No crear todavía jugadores ni partidos.

## Código preparado

1. Copiar `.env.libya.example` a `.env.libya.local` en VS Code. Rellenar el ref
   del proyecto nuevo, el ref del Caudal (solo para comparación), URL y clave
   **pública** del proyecto nuevo. Escribir el nombre real del club/equipo de
   Libia; no se ha supuesto su denominación. El archivo local está ignorado
   por Git. No pegar `service_role`, contraseña ni clave de base de datos.
2. Ejecutar `npm.cmd run dev:libya` en PowerShell (o `npm run dev:libya` en una
   terminal que no bloquee `npm.ps1`). Abrir la URL local que muestre Vite,
   normalmente `http://127.0.0.1:5173/`. La comprobación local rechaza refs
   iguales, URL ajena, CTS activo y la URL de `.env.local`. Antes de iniciar
   sesión, confirmar de nuevo el project ref en el panel.
3. Para generar un artefacto separado, ejecutar `npm.cmd run build:libya`.
   Sale en `dist-libya/`, ignorado por Git. No desplegarlo aún. El dominio,
   redirecciones de Auth y origen del PWA deberán ser exclusivos de Libia.
   `npm.cmd run dev` y `npm.cmd run build` siguen siendo la instalación actual.

La comprobación de configuración evita errores de conexión en el cliente;
**no sustituye las políticas RLS del proyecto nuevo**. El código fuente aún
contiene nombres internos `preCaudal*`: son claves de compatibilidad de los
documentos deportivos y no deben renombrarse sin migración. Algunos textos
secundarios y contratos de módulos pospuestos siguen usando el nombre Caudal;
revisar antes de usar esos módulos en Libia. No usar un build de Libia en el
dominio del Caudal.

## Base nueva: secuencia mínima y bloqueo actual

1. En el **proyecto nuevo**, ejecutar manualmente
   `supabase_libya_00_empty_project_preflight.sql` (solo lectura). Detenerse si
   alguna comprobación es falsa o ya hay cuentas.
2. Obtener **solo esquema**, sin registros ni datos de Auth o Storage, del
   proyecto actual mediante un export estructural realizado por el propietario.
   No ejecutar en Libia los SQL históricos que insertan UUID, jugadores o el
   equipo del Caudal. El paquete 04C contiene solo diez tablas y sirve al
   ensayo parcial; no constituye un baseline de las nueve pestañas.
3. Pasar el archivo de esquema por
   `node scripts/checkLibyaSchemaOnly.mjs ruta/al/esquema.sql`. El revisor
   imprime categorías y líneas sospechosas sin mostrar su contenido. Revisar
   además manualmente DDL, funciones, triggers, vistas, policies, grants,
   defaults, buckets y dependencias de extensiones; separar objetos de
   estructura de cualquier bootstrap histórico. Una salida limpia del script
   **no autoriza** instalar automáticamente.
4. Preparar a partir de ese DDL revisado un baseline estructural de Libia;
   instalarlo manualmente solo en el proyecto nuevo y ejecutar
   `supabase_libya_01_schema_readiness.sql`. Este paso queda **pendiente**:
   el repositorio no acredita todavía el contrato completo de las tablas
   legacy y RPC de nueve pestañas. No se proporciona un instalador ficticio.
5. Crear solo usuarios nuevos de Libia en Auth; otorgarles roles mediante las
   tablas y RPC verificadas del baseline. Crear el equipo propio y temporada
   nueva después de comprobar RLS y la ausencia de datos deportivos. Probar
   con staff y PLAYER de Libia. No reutilizar IDs ni cuentas del Caudal.

El verificador 01 enumera dependencias conocidas, no una certificación de que
todas las rutas funcionen. Antes de desplegar hay que probar lecturas y
escrituras reales de cada pestaña contra el proyecto nuevo, con usuario staff
y usuario sin permiso. También verificar buckets/archivos y RPC indirectas.

## Reutilización y adaptaciones

| Área | Estado en código | Dependencia del proyecto nuevo |
| --- | --- | --- |
| Inicio, Plantilla, Equipos, Partidos | `App.jsx` original y navegación reutilizables | Tablas legacy, perfil global, alineaciones, RLS, RPC de partidos y equipo propio nuevo |
| Biblioteca, Tareas | UI original reutilizable | `training_library`, `training_tasks`, shares, media, bucket `training-task-files` y permisos nuevos |
| Sesiones | UI original reutilizable | `training_sessions`, `planned_training_sessions`, tablas hijas y RPC de sesiones |
| Rendimiento, Análisis Grupal | UI y cálculos reutilizables | RPE, bienestar, estadísticas, eventos, snapshots y sus policies/RPC |

Perfiles, Fisio, Multas y Registro Delegado quedan fuera de la primera puesta
en marcha. Su código puede permanecer en el repositorio, pero las pruebas
de las nueve pestañas no acreditan esos módulos ni el portal PLAYER completo.

## Bibliotecas personales: transferencia controlada

`training_library` es una tabla global sin `owner_id` en su SQL original;
**no copiarla en bloque**. Seleccionar manualmente los ejercicios de autoría
personal y revisar texto, imágenes y adjuntos antes de exportar. `training_tasks`
liga cada tarea a `club_id` y `author_user_id`; sus rutas Storage incluyen ambos
IDs y el ID de la tarea. `tactical_play_templates` liga cada ABP al `owner_id`.
La transferencia necesita crear nuevos IDs en Libia, reasignar al usuario/club
nuevos, copiar los archivos autorizados a rutas nuevas y verificar la vista con
ese usuario. No copiar usuarios, jugadores, partidos, sesiones ni snapshots:
los usos históricos permanecen íntegros en el Caudal. Guardar un manifiesto
privado de origen→destino para comprobar la copia; no subirlo a Git.

No existe aún un exportador/importador automático porque faltan el inventario
concreto de recursos personales y la confirmación del contrato Storage del
baseline nuevo. El proceso será **solo copia**: ninguna sentencia debe
actualizar o borrar la biblioteca original.

## Condiciones de parada

Detenerse ante cualquier coincidencia de project refs/URL, referencias al
Caudal en DDL instalable, datos históricos en un export, fallos de RLS/RPC,
tablas o funciones ausentes, acceso PLAYER excesivo o un impreso de Libia que
muestre identidad Caudal. Mantener disponible la instalación Caudal en su
dominio y proyecto actuales; no desplegar una build nueva sobre ella.
