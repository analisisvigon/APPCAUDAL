import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { autoPlayerLayout } from '../../utils/plannedSessionDistributions.js';

const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true }, appType: 'custom' });
try {
  const { SessionPlayerDistribution, SessionSpaceDistribution } = await vite.ssrLoadModule(
    '/src/components/training/PlannedSessionDistributionBoards.jsx');
  const roster = Array.from({ length: 24 }, (_, index) => ({ player_id: `id-${index}`,
    player_name_snapshot: `Jugador ${index + 1}` }));
  const positions = new Map(roster.map((row, index) => [row.player_id,
    index < 2 ? 'right_back' : index === 2 ? null : 'central_midfield']));
  const layout = autoPlayerLayout(roster, positions, '4-4-2');
  const markup = renderToStaticMarkup(React.createElement(SessionPlayerDistribution, {
    distribution: { formation_key: '4-4-2', player_layout: layout }, roster,
    positionById: positions,
    availability: { 'id-0': { status: 'injured' }, 'id-1': { status: 'adapted' } },
  }));
  assert.match(markup, /Sin ubicación automática/);
  assert.match(markup, /planned-distribution-player-out/);
  assert.match(markup, /planned-distribution-player-adapted/);
  assert.equal((markup.match(/title="Jugador /g) || []).length, 24,
    'los 24 futbolistas permanecen representados');
  assert.equal((markup.match(/class="planned-distribution-player-group(?:\s|\")/g) || []).length, 11,
    'las once demarcaciones son contenedores fijos, incluidas las vacías');
  assert.equal(markup.includes('<select'), false, 'la vista no editable no imprime controles');
  assert.match(markup, /planned-distribution-meta/, 'la fila de sistema reserva la misma altura que la otra pizarra');
  assert.equal((markup.match(/planned-distribution-player-out/g) || []).length, 1,
    'el estado cambia el color sin duplicar etiquetas');
  const space = renderToStaticMarkup(React.createElement(SessionSpaceDistribution, {
    slots: [{ id: 'slot-1', phase: 'main' }],
    zones: [{ slot_id: 'slot-1', x: 12, y: 14, w: 28, h: 20,
      color: 'blue', provisional: true }],
  }));
  assert.match(space, /Parte principal/);
  assert.match(space, /provisional/);
  assert.match(space, /planned-distribution-meta/, 'las dos pizarras comparten la estructura de cabecera');
  assert.match(space, /<span>E1<\/span>/, 'la zona muestra una etiqueta corta');
  assert.match(space, /Parte principal · Ej. 1/, 'la leyenda conserva la identificación completa');
  assert.equal(space.includes('data-resize'), false, 'sin control de tamaño en impresión');
  const documentCss = readFileSync('src/components/training/plannedSessionDocument.css', 'utf8');
  const printCss = readFileSync('src/components/training/plannedSessionPrint.css', 'utf8');
  assert.match(documentCss, /\.planned-sheet-cover-lower \{[^}]*grid-template-columns: 25% 25% 50%/);
  assert.match(printCss, /\.planned-print-cover-lower \{[^}]*grid-template-columns: 25% 25% 50%/);
  const { PlannedSessionPrintPages } = await vite.ssrLoadModule(
    '/src/components/training/PlannedSessionPrint.jsx');
  const printed = renderToStaticMarkup(React.createElement(PlannedSessionPrintPages, {
    editor: { session_date: '2026-10-25', session_number: 1, slots: [],
      header: { staff_observations: 'Revisión posterior', material: 'Conos' } },
    selected: { team_name: 'C.D. Caudal', label: '2026/2027' },
    leagueLogoUrl: 'https://assets.example/liga.png', sessionValue: '8.5',
    pages: [{ kind: 'cover', activation: null }],
  }));
  assert.match(printed, /Observaciones post/);
  assert.match(printed, /Revisión posterior/);
  assert.match(printed, /VALOR \(0–10\)/);
  assert.match(printed, /8\.5/);
  assert.match(printed, /assets\.example\/liga\.png/);
  assert.doesNotMatch(printed, /UA Tom Scale/i);
  const savedPlayerDistribution = { formation_key: '4-4-2',
    player_layout: layout.map((item) => item.player_id === 'id-2'
      ? { ...item, placement: 'manual', x: 82, y: 73 } : item), space_zones: [] };
  const playerPrint = renderToStaticMarkup(React.createElement(PlannedSessionPrintPages, {
    editor: { session_date: '2026-10-25', session_number: 1, slots: [], header: {} },
    selected: { team_name: 'C.D. Caudal', label: '2026/2027' },
    roster, availability: { 'id-0': { status: 'injured' }, 'id-1': { status: 'adapted' } },
    distribution: { formation_key: null, player_layout: [], space_zones: [] },
    playerDistribution: savedPlayerDistribution, positionById: positions,
    pages: [{ kind: 'cover', activation: null }],
  }));
  assert.equal((playerPrint.match(/title="Jugador /g) || []).length, 24,
    'la impresión conserva los 24 jugadores de la distribución guardada');
  assert.match(playerPrint, /planned-distribution-player-out/);
  assert.match(playerPrint, /planned-distribution-player-adapted/);
  assert.doesNotMatch(playerPrint, /<select|Restablecer distribución automática/,
    'la impresión no incorpora controles de edición');
  assert.match(playerPrint, /title="LD · 3 jugadores"[\s\S]*Jugador 3/,
    'la agrupación manual guardada se reconstruye junto al lateral');
  const { default: PlannedSessionDocument } = await vite.ssrLoadModule(
    '/src/components/training/PlannedSessionDocument.jsx');
  const documentProps = {
    editor: { id: 'session-1', revision: 4, session_date: '2026-10-25',
      session_number: 1, header: {}, slots: [] },
    selected: { team_name: 'C.D. Caudal', label: '2026/2027' },
    canEdit: false, busy: false, fieldIssue: () => null,
    roster: [], frozen: true, selectedMembershipIds: [], availability: {},
    distribution: { formation_key: null, player_layout: [], space_zones: [] },
    positionById: new Map(), libraryTasks: [], boardsError: '',
    sessionValue: '9', printedSessionValue: '7', valueSupported: true,
  };
  const closedMarkup = renderToStaticMarkup(React.createElement(PlannedSessionDocument, documentProps));
  assert.match(closedMarkup, /<label>VALOR \(0–10\)<input[^>]*disabled=""[^>]*value="9"/,
    'la temporada cerrada conserva el dato visible sin permitir editarlo');
  console.log('planned session distribution boards rendering tests passed');
} finally {
  await vite.close();
}
