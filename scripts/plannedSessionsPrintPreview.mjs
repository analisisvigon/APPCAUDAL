// Local, synthetic print fixtures. No application data or Supabase access.
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, logLevel: 'silent', plugins: [react()],
  optimizeDeps: { disabled: true },
  server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: PlannedSessionDocument } = await vite.ssrLoadModule('/src/components/training/PlannedSessionDocument.jsx');
  const assetDir = resolve('dist/assets');
  const cssFiles = (await readdir(assetDir)).filter((name) => /^(App|index)-.*\.css$/.test(name));
  if (cssFiles.length !== 2) throw new Error('Ejecuta npm run build antes de generar las pruebas de impresión.');
  const builtCss = (await Promise.all(cssFiles.map((name) => readFile(join(assetDir, name), 'utf8')))).join('\n');
  const css = process.env.PRINT_METRICS === '1'
    ? builtCss.replace(/@media print\s*\{/g, '@media all{') : builtCss;
  const outDir = await mkdtemp(join(tmpdir(), 'appcaudal-session-print-'));
  const noop = () => {};
  const free = (id, description) => ({ id, kind: 'free', title: `Tarea ${id}`,
    description, comments: '', url: '', minutes: '' });
  const board = { schemaVersion: 1, board: { pitchType: 'full', elements: [] },
    assignments: { teamColors: { 'team-1': 'blue', 'team-2': 'red' }, players: [
      { playerRef: { globalPlayerId: 'fixture-a', snapshot: { name: 'Jugador A' } }, teamKey: 'team-1' },
      { playerRef: { globalPlayerId: 'fixture-b', snapshot: { name: 'Jugador B' } }, teamKey: 'team-2' },
    ] } };
  const library = { id: 'library-fixture', kind: 'library_task', sourceTaskId: 'task-fixture',
    snapshot: { source: { name: 'Juego posicional', description: 'Circulación y apoyos.',
      material: 'Conos y balones', editor_payload: board, space_width_m: 30, space_length_m: 20 } },
    working: {}, minutes: '15' };
  const slot = (id, phase, items) => ({ id, phase, duration: '20', items });
  const short = 'Conservar apoyos y ajustar la orientación corporal.';
  const long = Array.from({ length: 35 }, (_, i) => `${i + 1}. ${short}`).join('\n');
  const extreme = Array.from({ length: 100 }, (_, i) => `${i + 1}. ${short}`).join('\n');
  const scenarios = {
    breve: [slot('a', 'activation', [free('a', short)])],
    medio_80: [slot('a', 'activation', [free('a', 'Trabajo de orientación corporal y apoyos con circulación continua en espacio reducido.')])],
    medio_160: [slot('a', 'activation', [free('a', `${short} ${short} ${short}`)])],
    largo: [slot('a', 'activation', [free('a', long)])],
    extremo: [slot('a', 'activation', [free('a', extreme)])],
    pizarra: [slot('a', 'activation', [library])],
    simultaneas: [slot('a', 'activation', [free('a', short), library])],
    varias_hojas: [slot('a', 'activation', [free('a', short)]),
      ...Array.from({ length: 8 }, (_, i) => slot(`m${i}`, 'main', [free(`m${i}`, short)]))],
  };
  for (const [name, slots] of Object.entries(scenarios)) {
    const editor = { id: `fixture-${name}`, revision: 1, session_date: '2026-10-19',
      session_number: 1, header: { starts_at: '10:00', location: 'Campo de prueba',
        period_label: '', morphology_pattern: '', next_opponent_label: '', objectives: 'Trabajo colectivo',
        notes: '', material: '', staff_observations: '' }, slots };
    const html = renderToStaticMarkup(createElement(PlannedSessionDocument, {
      editor, selected: { team_id: 'fixture-team', team_name: 'Equipo de prueba', label: '2026/2027' },
      canEdit: true, busy: false, fieldIssue: () => null, updateEditor: noop, updateSlot: noop,
      updateTask: noop, moveSlot: noop, moveItem: noop, moveItemToSlot: noop,
      addExercise: noop, addTask: noop, removeTask: noop, removeSlot: noop,
      changePhase: noop, libraryTasks: [], libraryLoading: false, libraryError: '',
      selectLibraryTask: noop, switchToFreeTask: noop,
    }));
    await writeFile(join(outDir, `${name}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root">${html}</div><pre id="print-metrics" style="display:none"></pre><script>addEventListener('load',()=>{document.querySelector('#print-metrics').textContent='PRINTMETRICS'+JSON.stringify([...document.querySelectorAll('.planned-session-sheet')].map(e=>({sheet:e.getBoundingClientRect().height,children:[...e.children].map(c=>[c.className,c.getBoundingClientRect().height]),exercises:[...e.querySelectorAll('.planned-sheet-exercise')].map(x=>({height:x.getBoundingClientRect().height,children:[...x.children].map(c=>[c.className,c.getBoundingClientRect().height]),tasks:[...x.querySelectorAll('.planned-sheet-task')].map(t=>[...t.children].map(c=>[c.className,c.getBoundingClientRect().height]))}))})))})</script></body></html>`);
  }
  process.stdout.write(`${outDir}\n`);
} finally {
  await vite.close();
}
