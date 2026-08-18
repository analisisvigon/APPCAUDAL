import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(appSource, /from\("partido_snapshots_tacticos"\)[\s\S]*?eq\("partido_id", partidoId\)/, 'Estadísticas carga los snapshots del partido');
assert.match(appSource, /from\("partido_snapshot_tactico_slots"\)[\s\S]*?in\("snapshot_id"/, 'Estadísticas carga los slots de los snapshots');
assert.match(appSource, /const getMatchTacticalHistory = \(match = \{\}\) =>/, 'existe una única construcción compartida del historial');
assert.match(appSource, /buildGroupSystemSequence[\s\S]*?getMatchTacticalHistory/, 'Sistemas utilizados consume el historial compartido');
assert.match(appSource, /const tacticalHistory = getMatchTacticalHistory\(selectedMatch\)/, 'el campo consume el historial compartido');
assert.match(appSource, /data-testid="tactical-system-history"/, 'el selector principal está encima del mismo campo');
assert.match(appSource, /Tramos de sistema/);
assert.match(appSource, /segment\.fromMinute.*segment\.toMinute/s, 'cada opción muestra el intervalo');
assert.match(appSource, /segment\.system/, 'cada opción muestra el sistema');
assert.match(appSource, /selectedSegment\?\.intervals\.length > 1/, 'los snapshots internos usan un control secundario');
assert.match(appSource, /Disposición no registrada para este tramo/, 'los tramos incompletos no inventan jugadores');
assert.match(appSource, /No se reconstruyen posiciones/, 'la UI explica explícitamente la ausencia');
assert.match(appSource, /tacticalHistory\.invariant\.overlap/, 'la UI consume el informe de intervalos sin solapamiento');
assert.doesNotMatch(appSource, /const buildSystemSequence =/, 'no queda una segunda secuencia táctica paralela');
assert.doesNotMatch(appSource, /const getSystemAtMinute =/, 'la atribución temporal de sistemas reutiliza el historial compartido');

console.log('stats tactical history UI audit passed');
