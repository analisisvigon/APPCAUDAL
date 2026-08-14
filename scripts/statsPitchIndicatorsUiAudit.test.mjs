import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const pitchStart = appSource.indexOf('const renderStatsPitch = () =>');
const pitchEnd = appSource.indexOf('const renderCompleteStatsView = () =>', pitchStart);
const pitchSource = appSource.slice(pitchStart, pitchEnd);

assert.ok(pitchStart >= 0 && pitchEnd > pitchStart, 'debe existir la vista de campo de Estadísticas');
assert.match(appSource, /getPlayerMatchIndicators/);
assert.match(pitchSource, /goalEvents:\s*getStatsGoalEvents\(\)/);
assert.match(pitchSource, /playerStats:\s*stats/);
assert.match(pitchSource, /isCaptain/);
assert.match(pitchSource, /stats-player-identity/);
assert.match(pitchSource, /stats-player-identity flex max-w-\[118px\] flex-wrap/);
assert.match(pitchSource, /stats-match-pitch[^\n]+w-full max-w-\[560px\] min-w-0 overflow-hidden/);
assert.match(pitchSource, /whitespace-nowrap/);
assert.doesNotMatch(pitchSource, /label:\s*['"]CAP['"]/);
assert.doesNotMatch(pitchSource, /availability_status|injuredAlert/);

console.log('stats pitch indicators UI audit passed');
