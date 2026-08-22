import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const editorSource = fs.readFileSync(new URL('../src/utils/tacticalDispositionEditor.js', import.meta.url), 'utf8');
const tacticalSnapshotsImport = appSource.match(/import\s*\{([\s\S]*?)\}\s*from '\.\/utils\/tacticalSnapshots';/)?.[1] || '';
const groupSystemUsageSource = appSource.slice(
  appSource.indexOf('const buildSystemUsageRows ='),
  appSource.indexOf('const buildTacticalSlotMinutes ='),
);

assert.match(tacticalSnapshotsImport, /\bparseTacticalMinute\b/, 'Análisis Grupal importa la utilidad temporal que ejecuta');
assert.match(groupSystemUsageSource, /parseTacticalMinute\(goal\.minute\)/, 'la atribución de goles por sistema usa el parser táctico compartido');

assert.match(appSource, /from\("partido_snapshots_tacticos"\)[\s\S]*?eq\("partido_id", partidoId\)/, 'Estadísticas carga los snapshots del partido');
assert.match(appSource, /from\("partido_snapshot_tactico_slots"\)[\s\S]*?in\("snapshot_id"/, 'Estadísticas carga los slots de los snapshots');
assert.match(appSource, /const getMatchTacticalHistory = \(match = \{\}\) =>/, 'existe una única construcción compartida del historial');
assert.match(appSource, /const getMatchInitialTacticalSlots = \(match = \{\}\) =>[\s\S]*?match\.lineupSlots\?\.stats/, 'el snapshot inicial parte de los slots reales guardados en Estadísticas');
assert.match(appSource, /buildGroupSystemSequence[\s\S]*?getMatchTacticalHistory/, 'Sistemas utilizados consume el historial compartido');
assert.match(appSource, /const tacticalHistory = getMatchTacticalHistory\(selectedMatch\)/, 'el campo consume el historial compartido');
assert.match(appSource, /data-testid="tactical-system-history"/, 'el selector principal está encima del mismo campo');
assert.match(appSource, /Tramos de sistema/);
assert.match(appSource, /segment\.fromMinute.*segment\.toMinute/s, 'cada opción muestra el intervalo');
assert.match(appSource, /segment\.system/, 'cada opción muestra el sistema');
assert.match(appSource, /selectedSegment\?\.intervals\.length > 1/, 'los snapshots internos usan un control secundario');
assert.match(appSource, /getTacticalSnapshotFormationSlots\(activeSystem\)/, 'el campo traduce system + slot mediante el catálogo táctico canónico');
assert.match(appSource, /const storedSlot = getTacticalSnapshotFormationSlots\(system\)\[slotIndex\]/, 'Análisis Grupal usa el mismo catálogo canónico para los slots persistidos');
assert.match(appSource, /Disposición no registrada para este tramo/, 'los tramos incompletos no inventan jugadores');
assert.match(appSource, /No se reconstruyen posiciones/, 'la UI explica explícitamente la ausencia');
assert.match(appSource, /Editar disposición/);
assert.match(appSource, /Completar disposición/);
assert.match(appSource, /Pendientes de colocar/, 'un caso no inferible mantiene visibles los jugadores pendientes');
assert.match(appSource, /buildAutomaticSubstitutionSnapshot/, 'las sustituciones nuevas construyen un snapshot desde el historial común');
assert.match(appSource, /persistAutomaticSubstitutionSnapshot/, 'el guardado de estadísticas enlaza la sustitución con su snapshot');
assert.match(appSource, /save_match_system_change_with_snapshot/, 'un cambio de sistema crea una única foto incompleta vinculada en la misma operación');
assert.match(appSource, /save_match_tactical_snapshot/, 'el guardado utiliza la RPC atómica de snapshots');
assert.match(appSource, /const refreshed = await loadMatchStatsData\(editor\.matchId\)/, 'después de guardar se relee el partido');
assert.match(appSource, /tacticalSnapshotMatchesDisposition/, 'la relectura verifica partido, minuto, sistema y slots');
assert.doesNotMatch(appSource, /from\(["']partido_snapshots_tacticos["']\)\.(insert|update|upsert|delete)/, 'la UI no hace escrituras parciales de snapshots');
assert.doesNotMatch(editorSource, /specificPosition|\.position\b|auto.?place/i, 'la reconstrucción no usa posiciones de plantilla ni autocolocación');
assert.match(appSource, /tacticalHistory\.invariant\.overlap/, 'la UI consume el informe de intervalos sin solapamiento');
assert.match(appSource, /data-testid="tactical-coverage-indicator"/, 'Estadísticas muestra cobertura compacta del partido');
assert.match(appSource, /data-testid="season-tactical-coverage-audit"/, 'Análisis Grupal muestra la auditoría compacta de temporada');
assert.doesNotMatch(appSource, /const buildSystemSequence =/, 'no queda una segunda secuencia táctica paralela');
assert.doesNotMatch(appSource, /const getSystemAtMinute =/, 'la atribución temporal de sistemas reutiliza el historial compartido');

console.log('stats tactical history UI audit passed');
