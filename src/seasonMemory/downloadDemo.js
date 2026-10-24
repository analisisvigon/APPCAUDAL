import { SEASON_MEMORY_DEMO } from './demoData.js';
import { buildSeasonMemoryPresentation } from './presentation.js';
import { createSeasonMemoryPdf } from './pdf.js';

export const SEASON_MEMORY_DEMO_FILENAME = 'NEXO_CLUB_Memoria_Temporada_DEMO.pdf';

export async function downloadSeasonMemoryDemo() {
  if (!import.meta.env.DEV) throw new Error('Vista previa disponible solo en desarrollo');
  // Recurso estático local de la app. El informe no consulta ningún dato remoto.
  const response = await fetch(`${import.meta.env.BASE_URL}branding/almadina-sc-crest.png`);
  if (!response.ok) throw new Error('No se pudo cargar el escudo local');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  const crestDataUrl = `data:image/png;base64,${btoa(binary)}`;
  const data = buildSeasonMemoryPresentation(SEASON_MEMORY_DEMO);
  const pdf = createSeasonMemoryPdf({ data, crestDataUrl });
  const url = URL.createObjectURL(new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = SEASON_MEMORY_DEMO_FILENAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
