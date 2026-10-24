import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { SEASON_MEMORY_DEMO } from './demoData.js';
import { buildSeasonMemoryPresentation } from './presentation.js';
import { createSeasonMemoryPdf, drawExternalLink } from './pdf.js';

const model = buildSeasonMemoryPresentation(SEASON_MEMORY_DEMO);
assert.deepEqual(model.totals, {
  played: 30, wins: 17, draws: 7, losses: 6,
  goalsFor: 54, goalsAgainst: 30, goalDifference: 24,
});
assert.equal(model.competitions.length, 3);
assert.throws(() => buildSeasonMemoryPresentation({
  ...SEASON_MEMORY_DEMO,
  competitions: [{ ...SEASON_MEMORY_DEMO.competitions[0], wins: 12 }],
}), /inconsistentes/);

const crest = readFileSync(new URL('../../public/branding/almadina-sc-crest.png', import.meta.url));
const pdf = createSeasonMemoryPdf({
  data: model,
  crestDataUrl: `data:image/png;base64,${crest.toString('base64')}`,
});
assert.equal(pdf.getNumberOfPages(), 3);
assert.equal(Math.round(pdf.internal.pageSize.getWidth()), 210);
assert.equal(Math.round(pdf.internal.pageSize.getHeight()), 297);
const raw = pdf.output();
assert.ok(raw.startsWith('%PDF-'));
assert.ok(!raw.includes('/URI'), 'La demo no debe contener enlaces inventados');

const linkPdf = new jsPDF();
assert.equal(drawExternalLink(linkPdf, 'Ver vídeo', 'https://example.org/video/1', 10, 20, 80), true);
assert.ok(linkPdf.output().includes('https://example.org/video/1'));
assert.equal(drawExternalLink(linkPdf, 'Ver vídeo', 'javascript:alert(1)', 10, 30, 80), false);
console.log('Memoria de Temporada 2A: modelo, tres páginas, escudo y enlaces OK');
