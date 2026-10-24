# Ejecutar MANUALMENTE en VS Code solo para exportar estructura de APPCAUDAL.
# Nunca conecta con Almadina ni ejecuta migraciones. No guardar contrasenas.
$ErrorActionPreference = 'Stop'

$sourceRef = (Read-Host 'Project ref de APPCAUDAL, copiado de su panel').Trim()
$targetRef = (Read-Host 'Project ref de Almadina SC, copiado de su panel').Trim()
if ($sourceRef -cnotmatch '^[a-z0-9]{20}$' -or $targetRef -cnotmatch '^[a-z0-9]{20}$' -or $sourceRef -eq $targetRef) {
  throw 'Refs invalidos o coincidentes. No se ha conectado a Supabase.'
}
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localEnvPath = Join-Path $repoRoot '.env.local'
if (Test-Path -LiteralPath $localEnvPath) {
  $localUrlLine = Get-Content -LiteralPath $localEnvPath | Where-Object { $_ -match '^VITE_SUPABASE_URL\s*=' } | Select-Object -First 1
  if ($localUrlLine -match 'https://([a-z0-9]{20})\.supabase\.co' -and $matches[1] -ne $sourceRef) {
    throw 'El ref de origen no coincide con la URL local de APPCAUDAL. No se ha conectado.'
  }
}

$databaseHost = (Read-Host 'Host de APPCAUDAL en Dashboard > Connect (sin puerto)').Trim()
$databaseUser = (Read-Host 'Usuario de esa misma conexion (sin contrasena)').Trim()
if ($databaseHost -eq "db.$sourceRef.supabase.co") {
  if ($databaseUser -ne 'postgres') { throw 'Usuario de conexion directa inesperado.' }
} elseif ($databaseHost -match '^[a-z0-9-]+\.pooler\.supabase\.com$') {
  if ($databaseUser -ne "postgres.$sourceRef") {
    throw 'El usuario del pooler no pertenece al ref de APPCAUDAL.'
  }
} else {
  throw 'Host no reconocido como conexion directa o session pooler de Supabase.'
}

$pgDumpCommand = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
$pgDumpPath = if ($pgDumpCommand) { $pgDumpCommand.Source }
  else { (Read-Host 'Ruta completa de pg_dump.exe, por ejemplo C:\Program Files\PostgreSQL\18\bin\pg_dump.exe').Trim().Trim('"') }
if (-not (Test-Path -LiteralPath $pgDumpPath -PathType Leaf)) {
  throw 'pg_dump.exe no existe en esa ruta. No se ha conectado a Supabase.'
}

$exportRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'local-exports\almadina'))
if (-not $exportRoot.StartsWith($repoRoot + [System.IO.Path]::DirectorySeparatorChar,
  [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Ruta de salida fuera del repositorio.'
}
$partialPath = Join-Path $exportRoot 'APPCAUDAL_public_schema.partial.sql'
$finalPath = Join-Path $exportRoot 'APPCAUDAL_public_schema_REVIEW.sql'
if ((Test-Path -LiteralPath $partialPath) -or (Test-Path -LiteralPath $finalPath)) {
  throw 'Ya existe un archivo de exportacion: revisarlo antes de repetir.'
}

Write-Host 'Se leera SOLO el esquema public de APPCAUDAL. Ninguna tabla de datos, Auth ni Storage se exportara.'
$confirmation = Read-Host 'Escribe EXPORTAR ESTRUCTURA APPCAUDAL para continuar'
if ($confirmation -cne 'EXPORTAR ESTRUCTURA APPCAUDAL') {
  throw 'Cancelado antes de conectar.'
}

New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null
$previousSslMode = [Environment]::GetEnvironmentVariable('PGSSLMODE', 'Process')
try {
  [Environment]::SetEnvironmentVariable('PGSSLMODE', 'require', 'Process')
  # --password muestra un prompt sin escribir el secreto en la linea de
  # comandos, historial de PowerShell ni archivo de salida.
  & $pgDumpPath "--host=$databaseHost" '--port=5432' "--username=$databaseUser" `
    '--dbname=postgres' '--password' '--schema-only' '--schema=public' `
    '--no-owner' '--no-subscriptions' '--format=plain' '--lock-wait-timeout=10000' `
    "--file=$partialPath"
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump termino con codigo $LASTEXITCODE. Archivo parcial conservado para revision."
  }
  if (-not (Test-Path -LiteralPath $partialPath -PathType Leaf) -or (Get-Item -LiteralPath $partialPath).Length -eq 0) {
    throw 'No se genero un archivo de esquema valido.'
  }
  Move-Item -LiteralPath $partialPath -Destination $finalPath
  Write-Host "Archivo estructural creado para revision local: $finalPath"
  Write-Host 'No ejecutar este SQL. Revisar funciones, defaults, ACL y referencias al Caudal.'
} finally {
  [Environment]::SetEnvironmentVariable('PGSSLMODE', $previousSslMode, 'Process')
}
