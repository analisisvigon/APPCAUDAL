import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true }, appType: 'custom' });
try {
  const { SessionPlayerDistribution, SessionSpaceDistribution } = await vite.ssrLoadModule(
    '/src/components/training/PlannedSessionDistributionBoards.jsx');
  const roster = Array.from({ length: 24 }, (_, index) => ({ player_id: `id-${index}`,
    player_name_snapshot: `Jugador ${index + 1}` }));
  const positions = new Map(roster.map((row, index) => [row.player_id,
    index < 2 ? 'right_back' : index === 2 ? null : 'central_midfield']));
  const layout = roster.map((row, index) => ({ player_id: row.player_id,
    placement: index === 2 ? 'unplaced' : 'auto',
    x: index < 2 ? 82 : index === 2 ? null : 50,
    y: index < 2 ? 73 : index === 2 ? null : 45 }));
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
  assert.equal((markup.match(/planned-distribution-player-group"/g) || []).length, 2,
    'los laterales derechos comparten grupo');
  assert.equal(markup.includes('<select'), false, 'la vista no editable no imprime controles');
  const space = renderToStaticMarkup(React.createElement(SessionSpaceDistribution, {
    slots: [{ id: 'slot-1', phase: 'main' }],
    zones: [{ slot_id: 'slot-1', x: 12, y: 14, w: 28, h: 20,
      color: 'blue', provisional: true }],
  }));
  assert.match(space, /Parte principal/);
  assert.match(space, /provisional/);
  assert.equal(space.includes('data-resize'), false, 'sin control de tamaño en impresión');
  console.log('planned session distribution boards rendering tests passed');
} finally {
  await vite.close();
}
