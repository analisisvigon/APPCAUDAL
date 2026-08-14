import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const pitchStart = appSource.indexOf('const renderStatsPitch = () =>');
const pitchEnd = appSource.indexOf('const renderCompleteStatsView = () =>', pitchStart);
const pitchSource = appSource.slice(pitchStart, pitchEnd);

assert.ok(pitchStart >= 0 && pitchEnd > pitchStart, 'debe existir la vista de campo de Estadísticas');
assert.match(appSource, /getPlayerMatchIndicators/);
assert.match(pitchSource, /goalEvents:\s*getStatsGoalEvents\(\)/);
assert.match(pitchSource, /playerStats:\s*stats/);
assert.match(pitchSource, /isCaptain/);
assert.match(pitchSource, /stats-player-identity/);
assert.match(pitchSource, /captainIndicator = indicators\.find/);
assert.match(pitchSource, /incidentIndicators = indicators\.filter/);
assert.match(pitchSource, /stats-player-incidents/);
assert.match(pitchSource, /stats-player-identity[^\n]+h-5 w-full min-w-0/);
assert.match(pitchSource, /stats-player-change/);
assert.match(pitchSource, /relative z-40 mx-auto flex h-16 w-16/);
assert.match(pitchSource, /stats-player-incidents[^\n]+z-20/);
assert.match(pitchSource, /stats-player-identity[^\n]+z-30/);
assert.match(pitchSource, /stats-player-change[^\n]+z-10/);
assert.match(pitchSource, /↕ \{replacementInfo\.minute\}'/);
assert.match(pitchSource, /Minuto \$\{replacementInfo\.minute\}\\nSale:/);
assert.match(pitchSource, /Entra: \$\{replacementInfo\.replacementDisplayName\}/);
assert.match(pitchSource, /stats-match-pitch[^\n]+w-full max-w-\[560px\] min-w-0 overflow-hidden/);
assert.match(pitchSource, /\[container-type:inline-size\]/);
assert.match(cssSource, /\.stats-player-slot\s*\{[^}]*width:\s*min\(104px, 20cqw\)/s);
assert.match(pitchSource, /whitespace-nowrap/);
assert.doesNotMatch(pitchSource, /replacementPitchName/);
assert.doesNotMatch(pitchSource, /↑ \{replacementInfo\.replacementPitchName\}/);
assert.doesNotMatch(pitchSource, /label:\s*['"]CAP['"]/);
assert.doesNotMatch(pitchSource, /availability_status|injuredAlert/);

console.log('stats pitch indicators UI audit passed');
