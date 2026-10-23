param(
  [string]$MetadataDirectory = (Join-Path $PSScriptRoot '..\staging\metadata\04c'),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'

# Genera SQL; nunca abre una conexion ni ejecuta SQL. El paquete es una
# transcripcion revisable de catalogos, no un dump confiable por si solo.
$columns = @(Import-Csv -LiteralPath (Join-Path $MetadataDirectory '01_columnas.csv'))
$constraints = @(Import-Csv -LiteralPath (Join-Path $MetadataDirectory '02_restricciones.tsv') -Delimiter "`t")
$indexes = @(Import-Csv -LiteralPath (Join-Path $MetadataDirectory '03_indices.tsv') -Delimiter "`t")
$policies = @(Import-Csv -LiteralPath (Join-Path $MetadataDirectory '04_politicas.tsv') -Delimiter "`t")
$privileges = @(Import-Csv -LiteralPath (Join-Path $MetadataDirectory '05_permisos.tsv') -Delimiter "`t")

$baseTables = @(
  'equipos_rivales','jugadores','jugadores_rivales','competitions',
  'partidos','partido_estadisticas_jugador','partido_alineacion_slots',
  'equipo_rival_alineacion','equipo_rival_banquillo'
)
$allTables = @($baseTables + 'partido_eventos_sustitucion')
if ($columns.Count -ne 265 -or $constraints.Count -ne 65 -or
    $indexes.Count -ne 28 -or $policies.Count -ne 31 -or
    $privileges.Count -ne 10 -or
    @(($columns | Select-Object -ExpandProperty table_name -Unique) | Sort-Object).Count -ne 10) {
  throw 'Los conteos del paquete 04C no coinciden con el inventario aprobado.'
}
if (@($allTables | Where-Object { $_ -notin @($columns.table_name | Select-Object -Unique) }).Count -ne 0) {
  throw 'Falta una tabla del inventario 04C.'
}

function Assert-Identifier([string]$value) {
  if ($value -cnotmatch '^[a-z][a-z0-9_]*$') { throw "Identificador no esperado: $value" }
}
function Quote-Identifier([string]$value) {
  Assert-Identifier $value
  return '"' + $value + '"'
}
function Get-Default([pscustomobject]$column) {
  $value = $column.default_expression.Trim()
  if ($value -eq '') { return '' }
  $valid = switch ($column.data_type) {
    'uuid' { $value -ceq 'gen_random_uuid()' }
    'boolean' { $value -cin @('true','false') }
    'integer' { $value -cmatch '^-?[0-9]+$' }
    'bigint' { $value -cmatch '^-?[0-9]+$' }
    'text' { $value -cmatch "^'[^']*'::text$" }
    'text[]' { $value -ceq "'{}'::text[]" }
    'jsonb' { $value -cin @("'{}'::jsonb", "'[]'::jsonb") }
    'timestamp with time zone' { $value -ceq 'now()' }
    default { $false }
  }
  if (-not $valid) { throw "Default incompatible o no verificado: $($column.table_name).$($column.column_name) $($column.data_type) DEFAULT $value" }
  return " DEFAULT $value"
}
function Get-Constraint([pscustomobject]$constraint) {
  Assert-Identifier $constraint.constraint_name
  $definition = $constraint.definition.Trim()
  if ($definition -match '[;\r\n]' -or
      $definition -cnotmatch '^(PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)\s*\(') {
    throw "Restriccion no verificable: $($constraint.constraint_name)"
  }
  if ($constraint.type -eq 'f') {
    if ($definition -cnotmatch 'REFERENCES ([a-z][a-z0-9_]*)\(') {
      throw "FK con referencia no reconocida: $($constraint.constraint_name)"
    }
    $referencedTable = $Matches[1]
    $definition = $definition -creplace 'REFERENCES ([a-z][a-z0-9_]*)\(', 'REFERENCES public.$1('
    return @{ Ddl = 'CONSTRAINT ' + (Quote-Identifier $constraint.constraint_name) + ' ' + $definition; Target = $referencedTable }
  }
  return @{ Ddl = 'CONSTRAINT ' + (Quote-Identifier $constraint.constraint_name) + ' ' + $definition; Target = '' }
}

$cleanSheet = @($columns | Where-Object { $_.table_name -eq 'partidos' -and $_.column_name -eq 'clean_sheet' })
if ($cleanSheet.Count -ne 1 -or $cleanSheet[0].data_type -ne 'boolean' -or
    $cleanSheet[0].default_expression -ne 'false' -or $cleanSheet[0].not_null -ne 'false') {
  throw 'La correccion acreditada de partidos.clean_sheet no esta presente.'
}

$header = @'
-- SOLO ENSAYO 04C. Generado desde staging/metadata/04c.
-- NO ejecutar en produccion. No contiene filas deportivas ni usuarios.
-- Verificar visualmente el project ref y usar un proyecto Supabase nuevo.
begin;
do $guard$
begin
  if auth.uid() is not null or current_user <> 'postgres' then
    raise exception '04C exige SQL Editor postgres sin JWT de usuario';
  end if;
  if (select count(*) from auth.users) <> 0 then
    raise exception '04C exige proyecto nuevo sin cuentas';
  end if;
  if to_regclass('public.clubs') is not null
    or to_regclass('public.nexoclub_04c_staging_guard') is not null
    or to_regclass('public.equipos_rivales') is not null
    or to_regclass('public.jugadores') is not null
    or to_regclass('public.partidos') is not null then
    raise exception '04C exige esquema deportivo vacio; revisar proyecto';
  end if;
end $guard$;

'@
$base = [System.Collections.Generic.List[string]]::new()
$base.Add($header)
$deferred = [System.Collections.Generic.List[string]]::new()
$deferred.Add(@'
-- SOLO ENSAYO 04C. Ejecutar despues de crear las tablas canonicas,
-- players_database, player_team_memberships e is_app_staff().
-- Conserva las politicas legacy para reproducir el estado previo a 03C.
begin;
do $guard$
begin
  if auth.uid() is not null or current_user <> 'postgres' then
    raise exception '04C exige SQL Editor postgres sin JWT de usuario';
  end if;
  if (select count(*) from auth.users) <> 0
    or to_regclass('public.nexoclub_04c_staging_guard') is not null
    or to_regprocedure('public.is_app_staff()') is null
    or to_regclass('public.players_database') is null
    or to_regclass('public.player_team_memberships') is null
    or to_regclass('public.club_team_seasons') is null then
    raise exception '04C: falta bootstrap o proyecto ya sembrado';
  end if;
end $guard$;

'@)

foreach ($table in $baseTables) {
  Assert-Identifier $table
  $tableColumns = @($columns | Where-Object { $_.table_name -eq $table } | Sort-Object { [int]$_.ordinal })
  $ordinals = @($tableColumns | ForEach-Object { [int]$_.ordinal })
  if ($ordinals.Count -ne @($ordinals | Select-Object -Unique).Count -or
      $ordinals[0] -ne 1 -or $ordinals[-1] -ne $ordinals.Count) {
    throw "Ordinales incompletos o repetidos: $table"
  }
  $body = [System.Collections.Generic.List[string]]::new()
  foreach ($column in $tableColumns) {
    Assert-Identifier $column.column_name
    if ($column.data_type -cnotin @('uuid','boolean','integer','bigint','text','text[]','jsonb','timestamp with time zone','date','numeric')) {
      throw "Tipo no reconocido: $table.$($column.column_name)"
    }
    if ($column.not_null -cnotin @('true','false')) { throw "Nulabilidad no reconocida: $table.$($column.column_name)" }
    $notNull = if ($column.not_null -eq 'true') { ' NOT NULL' } else { '' }
    $body.Add('  ' + (Quote-Identifier $column.column_name) + ' ' + $column.data_type + $notNull + (Get-Default $column))
  }
  foreach ($constraint in @($constraints | Where-Object { $_.table_name -eq $table })) {
    $checked = Get-Constraint $constraint
    if ($checked.Target -eq '' -or $checked.Target -in $baseTables) {
      $body.Add('  ' + $checked.Ddl)
    } else {
      $deferred.Add('alter table public.' + (Quote-Identifier $table) + ' add ' + $checked.Ddl + ';')
    }
  }
  $base.Add('create table public.' + (Quote-Identifier $table) + " (`n" + ($body -join ",`n") + "`n);")
}

foreach ($index in $indexes) {
  if ($index.table_name -notin $baseTables) { continue }
  Assert-Identifier $index.index_name
  if ($index.index_name -eq 'equipos_rivales_one_own_club_uidx') { continue } # Dos equipos propios solo en ensayo.
  if (@($constraints | Where-Object { $_.constraint_name -eq $index.index_name -and $_.table_name -eq $index.table_name }).Count -gt 0) { continue }
  $definition = $index.index_definition.Trim()
  if ($definition -match '[;\r\n]' -or $definition -cnotmatch '^CREATE (UNIQUE )?INDEX [a-z][a-z0-9_]* ON public\.[a-z][a-z0-9_]* USING btree \(') {
    throw "Indice no verificable: $($index.index_name)"
  }
  $base.Add($definition + ';')
}

foreach ($table in $baseTables) {
  $base.Add('alter table public.' + (Quote-Identifier $table) + ' enable row level security;')
  $base.Add('revoke all on table public.' + (Quote-Identifier $table) + ' from public, anon, authenticated;')
}
$base.Add('commit;')

foreach ($policy in $policies) {
  if ($policy.table_name -notin $baseTables) { continue }
  if ($policy.roles -cnotin @('anon','authenticated') -or
      $policy.command -cnotin @('ALL','SELECT','INSERT','UPDATE','DELETE') -or
      $policy.using_expression -cnotin @('','true','is_app_staff()') -or
      $policy.with_check_expression -cnotin @('','true','is_app_staff()')) {
    throw "Politica no verificable: $($policy.policy_name)"
  }
  # S1/S2 ya estan instalados en produccion. En ensayo se preserva la
  # politica anon legacy, pero ningun grant anon la hace efectiva.
  $text = 'create policy "' + $policy.policy_name.Replace('"','""') + '" on public.' +
          (Quote-Identifier $policy.table_name) + ' for ' + $policy.command.ToLower() +
          ' to ' + $policy.roles
  if ($policy.using_expression -ne '') { $text += ' using (' + $policy.using_expression.Replace('is_app_staff()', 'public.is_app_staff()') + ')' }
  if ($policy.with_check_expression -ne '') { $text += ' with check (' + $policy.with_check_expression.Replace('is_app_staff()', 'public.is_app_staff()') + ')' }
  $deferred.Add($text + ';')
}
foreach ($row in $privileges) {
  if ($row.table_name -notin $baseTables) { continue }
  $granted = @()
  foreach ($verb in @('select','insert','update','delete')) {
    $property = 'auth_' + $verb
    if ($row.$property -eq 'true') { $granted += $verb }
    elseif ($row.$property -ne 'false') { throw "Grant authenticated desconocido: $($row.table_name).$verb" }
  }
  if ($granted.Count -gt 0) { $deferred.Add('grant ' + ($granted -join ', ') + ' on table public.' + (Quote-Identifier $row.table_name) + ' to authenticated;') }
}
$deferred.Add('commit;')

$basePath = Join-Path $OutputDirectory 'supabase_multiclub_04c_staging_legacy_base.sql'
$finalizePath = Join-Path $OutputDirectory 'supabase_multiclub_04c_staging_legacy_finalize.sql'
Set-Content -LiteralPath $basePath -Value ($base -join "`n`n") -Encoding utf8
Set-Content -LiteralPath $finalizePath -Value ($deferred -join "`n`n") -Encoding utf8
Write-Output "Generated $basePath and $finalizePath; SQL was not executed."
