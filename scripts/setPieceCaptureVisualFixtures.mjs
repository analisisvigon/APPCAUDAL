import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFormationSlotsForSavedLineup } from '../src/utils/formationSlotCoordinates.js';
import { getSetPieceInitialPositions } from '../src/utils/setPiecePositions.js';
import { buildSetPiecePresentationCrop, buildSetPiecePresentationViewport } from '../src/utils/setPiecePresentation.js';
import { getSetPieceBadgePlacement, getSetPieceCaptureMarkerAnchor } from '../src/utils/setPieceBadgePlacement.js';
import { buildSetPieceCaptureResponsibilities } from '../src/utils/setPieceCaptureResponsibilities.js';
import { getSetPieceResponsibilitiesForPhase, getSetPieceResponsibility } from '../src/utils/setPieceResponsibilities.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'dist', 'assets');
const stylesheet = fs.readdirSync(assetRoot).filter((name) => name.endsWith('.css'))
  .map((name) => fs.readFileSync(path.join(assetRoot, name), 'utf8')).join('\n');
const outputRoot = path.join(os.tmpdir(), 'appcaudal-abp-block4-visual-fixtures');
fs.mkdirSync(outputRoot, { recursive: true });

const slots = getFormationSlotsForSavedLineup('4-4-2');
const names = ['BORJA', 'JULIO', 'VICENTE', 'MARIO', 'DANI', 'PABLO', 'ISMA', 'RODRIGO', 'AGUS', 'SAMU', 'IAGO'];
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const roleEntries = (roles) => Object.fromEntries(roles.flatMap((id, index) => id ? [[
  `player-${index}`, { responsibilityId: id, positionKey: `caudal:${index}` },
]] : []));
const xi = Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`caudal:${index}`, `player-${index}`]));
const defensiveRoles = getSetPieceResponsibilitiesForPhase('defensive').map(({ id }) => id);
const offensiveRoles = getSetPieceResponsibilitiesForPhase('offensive').map(({ id }) => id);
const denseCoordinates = [
  [34, 86], [42, 86], [50, 86], [58, 86], [66, 86], [38, 78],
  [48, 78], [58, 78], [42, 94], [52, 94], [62, 94],
];
const cases = {
  defensive_complete: {
    title: 'ABP defensiva', action: 'Córner defensivo', type: 'defensive_set_piece',
    ball: { x: 5, y: 5 },
    roles: [null, ...defensiveRoles.slice(0, 8), 'def_marca', 'def_marca'],
    name: 'Defensa de córner A', description: 'Atacar el balón y asegurar el rechace.',
  },
  offensive_complete: {
    title: 'ABP ofensiva', action: 'Córner ofensivo', type: 'offensive_set_piece',
    ball: { x: 5, y: 95 }, roles: offensiveRoles,
    name: 'Córner ofensivo A', description: 'Lanzamiento al área con rechace preparado.',
  },
  dense_repeatable: {
    title: 'ABP ofensiva', action: 'Córner ofensivo', type: 'offensive_set_piece',
    ball: { x: 5, y: 95 },
    roles: ['off_bloqueo', 'off_bloqueo', 'off_arrastre', 'off_arrastre',
      'off_rematador_1', 'off_rematador_2', 'off_rematador_3', 'off_rematador_4',
      'off_rechace_1', 'off_rechace_2', 'off_se_queda'],
    dense: true, name: 'Ataque denso A', description: 'Bloqueo y arrastre para liberar a los rematadores.',
  },
  empty: {
    title: 'ABP defensiva', action: 'Córner defensivo', type: 'defensive_set_piece',
    ball: { x: 5, y: 5 }, roles: [], name: 'Jugada sin responsabilidades',
    description: 'Mantener distancias y proteger el área.',
  },
  needs_review: {
    title: 'ABP defensiva', action: 'Córner defensivo', type: 'defensive_set_piece',
    ball: { x: 5, y: 5 }, roles: ['def_zona_1', 'def_marca'], staleFirst: true,
    name: 'Defensa pendiente A', description: 'Revisar la asignación antes de enseñar la jugada.',
  },
};

const markerClass = 'absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center tactical-abp-capture-marker';
const badgeClass = 'pointer-events-none inline-flex min-w-6 items-center justify-center rounded-md border border-caudal-electric/45 bg-caudal-950/90 px-1.5 py-0.5 text-[10px] font-black leading-none tracking-[0.03em] text-white shadow-sm tactical-abp-capture-badge';
const placementClass = {
  above: 'absolute bottom-[calc(100%+2px)] left-1/2 -translate-x-1/2',
  left: 'absolute right-[calc(50%+22px)] top-3',
  right: 'absolute left-[calc(50%+22px)] top-3',
};

for (const [name, scenario] of Object.entries(cases)) {
  const phase = scenario.type === 'defensive_set_piece' ? 'defensive' : 'offensive';
  const positions = getSetPieceInitialPositions({
    setPieceType: scenario.type,
    setPieceAction: 'corner',
    ballStartPosition: scenario.ball,
    rivalFormationSlots: slots,
    caudalFormationSlots: slots,
  });
  if (scenario.dense) denseCoordinates.forEach(([x, y], index) => {
    positions[`caudal:${index}`] = { x, y };
  });
  const currentXi = { ...xi };
  if (scenario.staleFirst) currentXi['caudal:0'] = 'replacement-player';
  const captureResponsibilities = buildSetPieceCaptureResponsibilities(
    roleEntries(scenario.roles), phase, currentXi
  );
  const requiredPlayerPositions = Object.values(captureResponsibilities.visibleByPlayerId)
    .map((item) => positions[item.positionKey]);
  const viewport = buildSetPiecePresentationViewport({
    setPieceAction: 'corner', ballStartPosition: scenario.ball,
    playerPositions: positions, requiredPlayerPositions, labelMargin: 4, captureCompact: true,
  });
  const crop = buildSetPiecePresentationCrop(viewport);
  const caudalPositions = Array.from({ length: 11 }, (_, index) => positions[`caudal:${index}`]);
  const markers = caudalPositions.map((point, index) => {
    const playerId = currentXi[`caudal:${index}`];
    const playerName = scenario.staleFirst && index === 0 ? 'NUEVO' : names[index];
    const responsibilityId = captureResponsibilities.visibleByPlayerId[playerId]?.responsibilityId;
    const definition = getSetPieceResponsibility(responsibilityId);
    const placement = getSetPieceBadgePlacement(index, caudalPositions, viewport);
    const anchor = getSetPieceCaptureMarkerAnchor(point, viewport);
    const badge = definition ? `<span role="img" aria-label="${escapeHtml(definition.label)}" data-abp-responsibility-badge="true" class="${badgeClass} ${placementClass[placement] || ''}">${definition.abbreviation}</span>` : '';
    return `<div class="${markerClass}" style="left:${point.x}%;top:${point.y}%" data-abp-capture-anchor-x="${anchor.horizontal}" data-abp-capture-anchor-y="${anchor.vertical}">
      <span class="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white font-black text-slate-500 shadow-sm">${playerName[0]}</span>
      <span data-abp-capture-name="true" class="max-w-32 truncate rounded-md bg-black/65 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">${playerName}</span>${badge}</div>`;
  }).join('');
  const rivals = Array.from({ length: 11 }, (_, index) => {
    const point = positions[`rival:${index}`];
    return point ? `<div class="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center" style="left:${point.x}%;top:${point.y}%"><span class="flex h-11 w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-500/80 font-black text-white">R${index}</span></div>` : '';
  }).join('');
  const legend = captureResponsibilities.legend.length ? `<section class="tactical-abp-responsibility-legend" aria-label="Responsabilidades utilizadas"><h3>Responsabilidades</h3><ul>${captureResponsibilities.legend.map((item) => `<li><strong>${item.abbreviation}</strong><span>${item.label}</span></li>`).join('')}</ul></section>` : '';
  const warning = captureResponsibilities.hasNeedsReview ? '<p class="tactical-abp-review-warning">Responsabilidades pendientes de revisar</p>' : '';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style></head><body>
  <div class="tactical-abp-presentation-root"><nav class="tactical-abp-presentation-controls"><button>← Anterior</button><select><option>${escapeHtml(scenario.name)}</option></select><button>Siguiente →</button><button>Salir</button></nav>
    <main class="tactical-abp-presentation-frame"><section class="tactical-abp-pitch-pane"><div class="tactical-abp-board-crop" style="--abp-crop-aspect:${crop.aspectRatio}"><div class="tactical-abp-board-host" style="width:${crop.hostStyle.width};left:${crop.hostStyle.left};top:${crop.hostStyle.top}"><div class="facing-tactical-board relative mx-auto aspect-[7/8.4] min-h-[560px] w-full max-w-4xl overflow-hidden rounded-3xl border border-white/15 bg-[#102616] shadow-inner">
      <div class="absolute inset-4 rounded-[28px] border-2 border-white/55"></div><div class="absolute left-4 right-4 top-1/2 h-px bg-white/35"></div><div class="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35"></div><div class="absolute left-1/2 top-4 h-20 w-48 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/35"></div><div class="absolute bottom-4 left-1/2 h-20 w-48 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/35"></div>
      <svg class="pointer-events-none absolute inset-0 z-[25] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M 8 94 Q 32 67 55 84" fill="none" stroke="#60a5fa" stroke-width="0.8" stroke-dasharray="2 1"/></svg>${rivals}${markers}
    </div></div></div></section><aside class="tactical-abp-information-panel"><header class="tactical-abp-heading"><p>${scenario.title}</p><h2>${scenario.action}</h2></header>${warning}${legend}<dl class="tactical-abp-information-list"><div><dt>Nombre</dt><dd>${escapeHtml(scenario.name)}</dd></div><div><dt>Zona del balón</dt><dd>Esquina</dd></div></dl><section class="tactical-abp-description"><h3>Descripción</h3><p>${escapeHtml(scenario.description)}</p></section></aside></main></div></body></html>`;
  fs.writeFileSync(path.join(outputRoot, `${name}.html`), html);
  console.log(`${name}: ${viewport.width}×${viewport.height} viewport, ${captureResponsibilities.legend.length} legend rows`);
}
console.log(`Fixture HTML: ${outputRoot}`);
