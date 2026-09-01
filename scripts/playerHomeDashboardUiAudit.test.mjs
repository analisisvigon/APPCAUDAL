import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../src/components/player/PlayerHomeDashboard.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/PlayerApp.jsx', import.meta.url), 'utf8');
const store = fs.readFileSync(new URL('../src/data/playerHomeStore.js', import.meta.url), 'utf8');
const presentation = fs.readFileSync(new URL('../src/utils/playerHomePresentation.js', import.meta.url), 'utf8');

assert.match(app, /activeSection === 'home' \? <PlayerHomeDashboard/);
assert.match(app, /activeSection === 'performance' \? <PlayerPerformancePanel client=\{client\} \/>/);
assert.doesNotMatch(app, /view=\{activeSection === 'home'/, 'Inicio ya no reutiliza la portada antigua de Rendimiento.');

for (const text of [
  'Tu espacio de jugador',
  'Mi análisis',
  'Minutos',
  'Partidos',
  'Titularidades',
  'G+A',
  'Último partido',
  'Próximo partido',
  'Último Wellness',
  'Último RPE',
  'Wellness ·',
  'RPE ·',
  'Molestia indicada',
]) assert.equal(home.includes(text), true, `Inicio debe mostrar ${text}.`);

assert.match(home, /target="analysis"/);
assert.match(home, /target="matches"/);
assert.match(home, /target="performance"/);
assert.match(home, /onClick=\{\(\) => onNavigate\(target\)\}/, 'Los CTA usan la navegación interna de PlayerApp.');
assert.doesNotMatch(home, /window\.location|location\.href|<a\s/);

assert.doesNotMatch(home, /PlayerLineChart|PlayerPerformanceTrendChart|Evolución reciente|Ánimo/);
assert.doesNotMatch(home, /getJugadores|loadPlayerProfileData|loadPlayerAnalysisLiveStats|loadPlayerProductionActions|loadPlayerMatchHistoryPage/);
assert.doesNotMatch(home, /timeline|playerName|assistantName|rating|prioridad|ranking|comparaci[oó]n|regla PF|\bPRE\b|\bPOST\b/iu);
assert.doesNotMatch(store, /jugador_id|user_id|membership_id|player_id/i);
assert.match(store, /loadPlayerAnalysisOverview\(client\)/);
assert.match(store, /loadMyPlayerMatches\(client\)/);
assert.match(store, /loadPlayerPerformancePage\(client, \{ limit: PLAYER_HOME_PERFORMANCE_LIMIT \}\)/);
assert.match(store, /Promise\.allSettled/, 'Un dominio temporalmente caído no bloquea los otros resúmenes.');

assert.match(presentation, /match\.matchDate < today/);
assert.match(presentation, /match\.matchDate > today/);
assert.match(home, /getPlayerMatchScorePresentation\(match\)/, 'La portada reutiliza la presentación segura de marcador pendiente.');
assert.doesNotMatch(home, /0\s*[-–]\s*0/);
assert.match(home, /No hay partidos anteriores registrados/);
assert.match(home, /No hay próximo partido registrado/);
assert.match(home, /Aún no hay estadísticas de temporada disponibles/);
assert.match(home, /Sin registros/);
assert.doesNotMatch(home, />\s*(?:undefined|NaN|Invalid Date)\s*</, 'Inicio no renderiza literales técnicos como estado vacío.');

assert.match(home, /grid grid-cols-2 gap-2 sm:grid-cols-4/, 'Los KPI usan 2x2 en móvil y cuatro columnas en desktop.');
assert.match(home, /grid items-start gap-3 lg:grid-cols-2/, 'Último y próximo partido se apilan antes de desktop.');
assert.match(home, /grid grid-cols-2 gap-2 sm:grid-cols-3/, 'Rendimiento mantiene tarjetas compactas sin anchura mínima rígida.');
assert.doesNotMatch(home, /overflow-x-auto|min-w-\[[4-9]\d\dpx\]|<table/);
assert.match(home, /min-h-\[44px\]/, 'Los CTA conservan un objetivo táctil adecuado.');

for (const forbiddenIdentity of [
  'Borja',
  'Jairo',
  '350615a9-b068-450a-b867-da30a59b9082',
  '2e0146e9-e9fc-45ad-b055-edc138a85f7e',
  'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7',
]) assert.equal(`${home}\n${store}\n${presentation}`.includes(forbiddenIdentity), false);

console.log('Player Home dashboard UI audit: resumen, CTA, vacíos, responsive y privacidad validados.');
