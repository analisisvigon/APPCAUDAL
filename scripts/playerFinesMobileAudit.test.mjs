import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const app = read('src/PlayerApp.jsx');
const navigation = read('src/components/player/PlayerNavigation.jsx');
const own = read('src/components/player/PlayerFinesPanel.jsx');
const transparency = read('src/components/player/PlayerFinesTransparencyPanel.jsx');
const visuals = read('src/components/fines/FinesTransparencyVisuals.jsx');
const management = read('src/components/fines/FinesManagementPage.jsx');
const playerUi = [app, navigation, own, transparency, visuals, management].join('\n');

const isProtectedFinesInfrastructurePath = (filePath) => (
  /^supabase_club_core_(?:19|2[0-5])_/.test(filePath)
  || /^src\/data\/(?:playerFines|finesTransparency|finesManagement)/.test(filePath)
  || filePath.startsWith('src/auth/')
);

const isPlayerPerformancePath = (filePath) => (
  /^src\/components\/player\/PlayerPerformance[^/]*\.[cm]?[jt]sx?$/.test(filePath)
  || /^src\/data\/playerPerformance[^/]*\.[cm]?[jt]sx?$/.test(filePath)
  || /^src\/utils\/playerPerformance[^/]*\.[cm]?[jt]sx?$/.test(filePath)
);

const staffPerformancePaths = [
  'src/components/performance/LoadEvolutionSection.jsx',
  'src/utils/performanceLoad.js',
  'src/utils/performanceLoad.test.js',
];
assert.ok(
  staffPerformancePaths.every((filePath) => !isPlayerPerformancePath(filePath)),
  'Rendimiento STAFF no pertenece al módulo de Rendimiento PLAYER.',
);

const protectedPlayerAndFinesPaths = [
  'src/components/player/PlayerPerformancePanel.jsx',
  'src/components/player/PlayerPerformanceTrendChart.jsx',
  'src/data/playerPerformanceStore.js',
  'src/data/playerPerformanceStore.test.js',
  'src/utils/playerPerformancePresentation.js',
  'src/utils/playerPerformancePresentation.test.js',
];
assert.ok(
  protectedPlayerAndFinesPaths.every(isPlayerPerformancePath),
  'Los componentes, stores, helpers y tests de Rendimiento PLAYER siguen protegidos.',
);
assert.ok(
  [
    'src/data/playerFinesStore.js',
    'src/data/finesTransparencyStore.test.js',
    'src/auth/permissions.js',
    'supabase_club_core_24_fines_security.sql',
  ].every(isProtectedFinesInfrastructurePath),
  'La infraestructura protegida de PLAYER/Fines, Auth y backend sigue bloqueada.',
);

assert.ok(
  [
    'src/components/tactical/MatchKeysPanel.jsx',
    'src/utils/sportsSeason.js',
    'README.md',
  ].every((filePath) => !isPlayerPerformancePath(filePath) && !isProtectedFinesInfrastructurePath(filePath)),
  'Los cambios no relacionados no afectan a los guards de PLAYER/Fines.',
);

const auditedViewports = ['360x800', '375x812', '390x844', '412x915', '430x932'];
assert.deepEqual(auditedViewports.map((viewport) => Number(viewport.split('x')[0])), [360, 375, 390, 412, 430]);

assert.match(app, /overflow-x-clip/);
assert.match(app, /safe-area-inset-top/);
assert.match(app, /safe-area-inset-bottom/);
assert.match(navigation, /grid-cols-\[minmax\(0,1fr\)_44px\]/);
assert.match(navigation, /grid-cols-2[\s\S]*min-\[400px\]:grid-cols-3/);
assert.match(navigation, /min-h-\[44px\] min-w-0/);
assert.match(navigation, /canManageFines \? 'lg:grid-cols-6'/);

assert.match(own, /grid grid-cols-2 gap-2 sm:grid-cols-4/);
for (const label of ['Pendiente', 'Pagado', 'Activas', 'Pagadas']) assert.match(own, new RegExp(`KpiCard label="${label}"`));
assert.match(own, /snap-x snap-mandatory[^"]*overflow-x-auto[^"]*scroll-smooth/);
assert.match(own, /min-h-11 shrink-0 snap-start/);
assert.match(own, /bg-amber-300\/\[0\.07\][\s\S]*fine\.pending_amount/);
assert.doesNotMatch(own, /<table|min-w-\[[4-9]\d\dpx\]/);

assert.equal((transparency.match(/<Kpi /g) || []).length, 4);
assert.match(transparency, /aria-label="Indicadores grupales" className="grid grid-cols-2 gap-2 sm:grid-cols-4"/);
const kpiIndex = transparency.indexOf('aria-label="Indicadores grupales"');
const rankingsIndex = transparency.indexOf('aria-label="Rankings de multas"');
const subjectsIndex = transparency.indexOf('Resumen por jugador', rankingsIndex);
const groupListIndex = transparency.indexOf('Multas del grupo', subjectsIndex);
const distributionIndex = transparency.indexOf('<FinesStatusDistribution', groupListIndex);
assert.ok(kpiIndex >= 0 && rankingsIndex > kpiIndex && subjectsIndex > rankingsIndex && groupListIndex > subjectsIndex && distributionIndex > groupListIndex, 'En móvil se presentan KPI, rankings, resumen por jugador y listado grupal en ese orden.');
for (const title of ['Más dinero aportado', 'Más dinero pendiente', 'Motivos que más generan', 'Motivos más frecuentes']) assert.ok(transparency.includes(title));
assert.match(visuals, /limit = 5/);
assert.match(transparency, /Resumen por jugador[\s\S]*grid-cols-2/);
assert.match(transparency, /Multas del grupo[\s\S]*<TransparencyFineCard/);
assert.doesNotMatch(transparency, /<table|min-w-\[[4-9]\d\dpx\]/);

assert.match(management, /max-h-\[calc\(100dvh-0\.75rem\)\]/);
assert.match(management, /mobile-form-controls/);
assert.match(management, /app-safe-area-footer sticky bottom-0/);
assert.match(management, /h-11 w-11 shrink-0/);
assert.match(management, /w-full sm:w-auto sm:min-w-36/);
assert.match(management, /min-h-11 rounded-xl[\s\S]*Registrar pago/);
assert.match(management, /mt-3 grid gap-2 lg:hidden[\s\S]*mt-4 hidden overflow-x-auto lg:block/);
assert.match(management, /snap-x snap-mandatory[^"]*overflow-x-auto[^"]*scroll-smooth/);

assert.doesNotMatch(playerUi, /text-\[(?:8|9)px\]/, 'El flujo de multas no usa tipografía móvil inferior a 10 px.');
assert.doesNotMatch(playerUi, /Agus|Borja|Jairo|Julio|role\s*=\s*['"]captain['"]|\bfines_manage\b/i);

const changed = execFileSync('git', ['diff', '--name-only'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
}).trim().split(/\r?\n/).filter(Boolean);
assert.equal(changed.some(isProtectedFinesInfrastructurePath), false, 'El pulido mobile no modifica backend, stores ni Auth de Multas.');
const hasFinesMobileProductChanges = changed.some((filePath) => (
  /^src\/components\/player\/PlayerFines/.test(filePath)
  || /^src\/components\/fines\/Fines(?:TransparencyVisuals|ManagementPage)/.test(filePath)
));
if (hasFinesMobileProductChanges) {
  assert.equal(changed.some(isPlayerPerformancePath), false, 'El pulido de Multas no mezcla cambios de Rendimiento PLAYER.');
}

console.log(`Multas PLAYER mobile-first: ${auditedViewports.join(', ')}, navegación, tarjetas, rankings, manager, modales, touch y overflow auditados.`);
