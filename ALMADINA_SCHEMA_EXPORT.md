# Exportar solo la estructura de APPCAUDAL para Almadina SC

Este procedimiento **solo lee APPCAUDAL** y guarda un archivo SQL local para
revisión. No instala nada en Almadina. El dump no incluye filas de tablas,
usuarios de Auth, archivos de Storage ni definiciones de roles del servidor.
La contraseña de conexión no se escribe en el dump. Las definiciones SQL
podrían contener literales sensibles, UUID o nombres del Caudal y deben
revisarse antes de compartirlas o instalarlas.

## Lo encontrado en este ordenador

Node.js y npm están instalados. No se ha encontrado Supabase CLI, Docker,
`pg_dump` ni `psql`, tampoco `pg_dump.exe` en las rutas PostgreSQL 16, 17 o 18
habituales. Por eso el camino corto es instalar **solo Command Line Tools de
PostgreSQL**, sin servidor local, pgAdmin ni Docker. La Supabase CLI es opcional
para esta exportación y `supabase db dump` requiere Docker.

## Pasos en VS Code

1. En el panel de Supabase, anotar los **project refs** de APPCAUDAL y
   Almadina SC. Abrir APPCAUDAL > **Connect** y anotar **host, usuario y puerto**
   de la conexión directa. Elegir **Session pooler** si la conexión directa no
   funciona por falta de IPv6 ([modos de conexión de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)). Copiar esos datos desde el panel, no construir
   el host del pooler a mano. La contraseña de base de datos solo se te pedirá
   durante la exportación; no la pegues en VS Code, un chat ni un archivo.
   Si no conoces esa contraseña, detenerte aquí; este procedimiento no cambia
   contraseñas ni configuración de producción.
2. Descargar el instalador Windows desde la [página oficial PostgreSQL](https://www.postgresql.org/download/windows/). En **Select Components**
   dejar **Command Line Tools**; desmarcar Server, pgAdmin y Stack Builder si
   el asistente lo permite. Elegir un cliente `pg_dump` de versión igual o
   posterior a la del servidor APPCAUDAL. Abrir una terminal nueva en VS Code
   y ejecutar solo `pg_dump --version` para comprobar la instalación. Si no
   aparece en PATH, el script pedirá la ruta completa a `pg_dump.exe`.
3. Abrir y revisar `scripts/exportCaudalPublicSchemaForAlmadina.ps1`. En la
   terminal PowerShell de VS Code, desde la raíz de este repositorio, ejecutarlo
   **tú** cuando estés listo:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\exportCaudalPublicSchemaForAlmadina.ps1
   ```

   El cambio de ExecutionPolicy afecta solo a ese proceso, no a la configuración
   permanente de Windows. El script pregunta ambos refs y los datos de **Connect**,
   comprueba que el host/usuario pertenecen a APPCAUDAL, coteja su ref con la
   URL local de `.env.local` cuando está disponible y exige escribir una
   frase de confirmación. Después `pg_dump` pide la contraseña de forma oculta.
   No se escribe en los argumentos del comando ni en PowerShell History.
4. Si todo termina bien, el archivo queda en
   `local-exports/almadina/APPCAUDAL_public_schema_REVIEW.sql`. La carpeta está
   ignorada por Git. Si falla, puede quedar un `.partial.sql`: no usarlo como
   esquema. **No ejecutar** el SQL exportado en Almadina todavía.
5. Revisar primero el archivo con:

   ```powershell
   node .\scripts\checkLibyaSchemaOnly.mjs .\local-exports\almadina\APPCAUDAL_public_schema_REVIEW.sql
   ```

   Este control local marca posibles `INSERT`/`COPY`, referencias al Caudal,
   UUID literales y credenciales sin mostrar el contenido de las líneas. Puede
   señalar `INSERT` dentro del cuerpo de una función; cada hallazgo necesita
   revisión humana. Una salida sin hallazgos tampoco autoriza la instalación.

## Qué entra y qué queda separado

| Grupo | Tratamiento |
| --- | --- |
| `public` | `pg_dump --schema-only --schema=public` incluye tablas, columnas, índices, vistas, funciones, triggers, RLS, políticas y ACL de ese esquema. No incluye filas. |
| Auth | Se excluye el esquema gestionado `auth` y todos sus usuarios. Revisar solo FK y triggers personalizados. En Almadina los usuarios se crearán de nuevo. |
| Storage | Se excluyen `storage.objects` y los archivos. Revisar las políticas de Storage y recrear después únicamente los buckets necesarios, vacíos. |
| Extensiones | Revisar nombre, versión y esquema; el dump parcial puede depender de extensiones fuera de `public`. |
| Caudal | Revisar funciones, defaults, políticas, vistas, comentarios y UUID literales. No instalar inicializadores de equipo, temporada, jugadores ni partidos del Caudal. |
| Auth del panel | Proveedores, URLs de redirección y otros ajustes del panel no forman parte de este dump; configurarlos expresamente para Almadina más adelante. |

Para separar estas dependencias existe
`supabase_almadina_structure_dependencies_readonly.sql`. Se ejecuta
**manualmente en APPCAUDAL** si necesitamos esos metadatos; solo consulta
catálogos de PostgreSQL, no filas de usuarios, jugadores, partidos o archivos.
Las expresiones de política deben revisarse antes de compartirlas. Los nombres
y límites de buckets pueden consultarse en el panel Storage sin descargar sus
objetos. El `public` dump por sí solo no es un instalador completo: Postgres no
incluye automáticamente objetos de otros esquemas de los que dependa.

## Por qué no usar ahora Supabase CLI

La CLI no está instalada y su `db dump` ejecuta `pg_dump` dentro de Docker
([documentación de Supabase](https://supabase.com/docs/guides/self-hosting/restore-from-platform));
Docker tampoco está instalado. Si más adelante la necesitas, instala Docker
Desktop y la CLI en una carpeta de herramientas **fuera de este repositorio**:

```powershell
New-Item -ItemType Directory "$env:USERPROFILE\nexo-cli-tools" -Force
Set-Location "$env:USERPROFILE\nexo-cli-tools"
npm.cmd init -y
npm.cmd install supabase --save-dev
npx.cmd supabase --version
```

Eso no se necesita para la exportación descrita arriba. Para este dump
estructural, instalar solo `pg_dump` evita ambos pasos. No usar los botones de
restauración o clonación de backups para Almadina: copiarían datos y usuarios.

**No se ha ejecutado ninguna conexión ni SQL** al preparar estos archivos.
