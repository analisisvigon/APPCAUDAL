import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SEASON_MEMORY_DEMO } from '../src/seasonMemory/demoData.js';
import { buildSeasonMemoryPresentation } from '../src/seasonMemory/presentation.js';
import { createSeasonMemoryPdf } from '../src/seasonMemory/pdf.js';

const root = resolve(import.meta.dirname, '..');
const crest = await readFile(resolve(root, 'public/branding/almadina-sc-crest.png'));
const pdf = createSeasonMemoryPdf({
  data: buildSeasonMemoryPresentation(SEASON_MEMORY_DEMO),
  crestDataUrl: `data:image/png;base64,${crest.toString('base64')}`,
});
const destination = resolve(root, 'local-exports/season-memory-demo/NEXO_CLUB_Memoria_Temporada_DEMO.pdf');
await mkdir(resolve(root, 'local-exports/season-memory-demo'), { recursive: true });
await writeFile(destination, Buffer.from(pdf.output('arraybuffer')));
console.log(`${destination} (${pdf.getNumberOfPages()} páginas)`);
