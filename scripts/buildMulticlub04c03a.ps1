param(
  [string]$SourcePath = (Join-Path $PSScriptRoot '..\supabase_multiclub_03_prepare.sql'),
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\supabase_multiclub_04c_staging_03a_core.sql')
)

$ErrorActionPreference = 'Stop'
$source = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $SourcePath))
$snapshotStart = 'create function public.can_read_match_snapshot_v1(p_snapshot_id uuid)'
$snapshotEnd = 'alter function public.my_cts_jugadores_v1(uuid) owner to postgres;'
$start = $source.IndexOf($snapshotStart, [StringComparison]::Ordinal)
$end = $source.IndexOf($snapshotEnd, [StringComparison]::Ordinal)
if ($start -lt 0 -or $end -le $start -or
    $source.IndexOf($snapshotStart, $start + 1, [StringComparison]::Ordinal) -ge 0) {
  throw 'El bloque de snapshots 03A no coincide con el contrato local.'
}
$source = $source.Remove($start, $end - $start)
$source = [regex]::Replace(
  $source,
  '(?m)^.*(?:alter function|revoke all on function|grant execute on function) public\.(?:can_read_match_snapshot_v1|can_write_match_snapshot_v1|legacy_jugador_in_snapshot_cts_v1)\([^\r\n]*\r?\n',
  ''
)
if ($source.Contains('partido_snapshots_tacticos') -or
    $source.Contains('can_read_match_snapshot_v1') -or
    $source.Contains('can_write_match_snapshot_v1') -or
    $source.Contains('legacy_jugador_in_snapshot_cts_v1') -or
    -not $source.Contains('create function public.my_cts_jugadores_v1') -or
    -not $source.Contains("('mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)', 'can_write_match')")) {
  throw 'La variante 03A conserva una dependencia de snapshots o perdió una dependencia CTS.'
}
$guard = @'
-- SOLO ENSAYO 04C. Derivado de 03A sin los tres helpers de snapshots.
-- NO ejecutar en produccion. No instala 03C ni modifica tablas o filas.
'@
$beginIndex = $source.IndexOf('begin;', [StringComparison]::Ordinal)
if ($beginIndex -lt 0 -or $source.IndexOf('begin;', $beginIndex + 1, [StringComparison]::Ordinal) -ge 0) {
  throw 'El limite transaccional de 03A no coincide con el contrato local.'
}
$stagingPrelude = @'
begin;
do $staging_guard$
begin
  if auth.uid() is not null or current_user <> 'postgres'
    or (select count(*) from auth.users) <> 0
    or to_regclass('public.nexoclub_04c_staging_guard') is not null
    or to_regclass('public.partido_snapshots_tacticos') is not null then
    raise exception '04C 03A exige ensayo vacio sin tabla de snapshots';
  end if;
end $staging_guard$;
'@
$source = $source.Remove($beginIndex, 'begin;'.Length).Insert($beginIndex, $stagingPrelude)
if (@([regex]::Matches($source, 'do \$staging_guard\$')).Count -ne 1) {
  throw 'No se pudo colocar una sola guarda de ensayo.'
}
[System.IO.File]::WriteAllText($OutputPath, $guard + "`n" + $source,
  [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $OutputPath; SQL was not executed."
