# Previsualización local: equipo activo y archivo

Desde la terminal de VS Code, situada en la carpeta del proyecto:

```powershell
npm.cmd run dev:preview
```

Abrir **http://127.0.0.1:5179/** en el navegador. Detener el
servidor con `Ctrl+C`. Si `npm.cmd` no está disponible, usar `npm run
dev:preview` en una terminal que permita ejecutar npm.
El comando compila solo la demo y sirve el resultado localmente; para ver
cambios en sus archivos, detenerlo y volver a iniciarlo.

La vista abre directamente el **Equipo de Libia · DEMO**. El botón **Ver
histórico Caudal** muestra un archivo simulado; **Cambiar espacio** abre el
selector compartido con la aplicación. Inicio, Plantilla y Partidos reutilizan
`CtsCoreApp` y reciben solo filas ficticias del CTS elegido. PRE, POST,
Dossier, Rendimiento, Análisis, Lito y Sesiones muestran su lugar en la
navegación y explican por qué siguen pendientes. Las bibliotecas de Tareas y
ABP aparecen en **Mis recursos permanentes**: sus ejemplos no cambian al
elegir otro club, y se pueden abrir para ver su ficha. Esa permanencia es una
propuesta de interfaz: los ejemplos se recrean al recargar la página. La
biblioteca real actual usa `training_library` directamente y necesitará un
contrato de propiedad personal y RLS antes de conectarla a este modelo.

Esta ruta usa un cliente RPC **en memoria** que solo implementa las tres
lecturas de la demo. No importa `App.jsx`, `AppAuthShell`, el cliente Supabase,
`LibrarySection` ni el registro PWA; usa una raíz Vite separada, no carga
`.env.local` y no requiere cuenta ni
conexión de red. No guarda cambios ni representa datos del Caudal real. El
archivo real todavía necesita políticas y RPC de solo lectura en backend.

La aplicación habitual sigue en su entrada normal (`npm run dev`). La
previsualización está en `src/preview/index.html` y usa el puerto 5179 para evitar
interferir con el service worker de la aplicación habitual.
