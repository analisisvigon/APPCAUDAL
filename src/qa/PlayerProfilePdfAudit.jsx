import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import '../styles/print.css';
import PlayerProfilePdfReport from '../components/print/PlayerProfilePdfReport';
import { buildPlayerProfilePrintReport } from '../utils/playerProfilePrintReport';
import { createPlayerProfilePdf, downloadPlayerProfilePdf } from '../utils/playerProfilePdfExport';

const params = new URLSearchParams(window.location.search);
const shouldExport = params.get('export') === '1';

const report = buildPlayerProfilePrintReport({
  identity: {
    name: 'Borja Rodríguez',
    team: 'C.D. Caudal de Mieres',
    season: '2026/27',
    number: 8,
    position: 'Centrocampista',
    age: '27 años',
    foot: 'Derecho',
  },
  filters: { competition: 'Todas las competiciones', venue: 'Local y visitante' },
  seasonSummary: {
    played: 25,
    starts: 22,
    minutes: 1950,
    minutesPerMatch: 78,
    starterPercentage: 88,
    goals: 2,
    assists: 5,
    goalContributions: 7,
    yellow: 3,
    red: 0,
    injuries: 1,
    benchEntries: 3,
  },
  competitionBreakdown: [
    { key: 'league', label: 'Liga', played: 22, starts: 20, minutes: 1740, goals: 2, assists: 4 },
    { key: 'cup', label: 'Copa RFEF', played: 3, starts: 2, minutes: 210, goals: 0, assists: 1 },
  ],
  production: { goalsPer90: 0.09, assistsPer90: 0.23, goalContributionsPer90: 0.32, goalContributions: 7 },
  influenceMaps: [
    { key: 'all', label: 'Todos', zones: [{ value: 'creacion_derecha', count: 5 }] },
    { key: 'goals', label: 'Goles', zones: [{ value: 'finalizacion_centro', count: 2 }] },
    { key: 'assists', label: 'Asistencias', zones: [{ value: 'creacion_derecha', count: 5 }] },
  ],
  goalAnalysis: {
    bodyParts: { values: [{ label: 'Pie derecho', count: 1 }, { label: 'Cabeza', count: 1 }], known: 2, missing: 0, total: 2 },
    types: { phases: [{ label: 'Juego combinativo', count: 1 }, { label: 'ABP', count: 1 }], subphases: [] },
    target: {
      total: 2,
      known: 1,
      missing: 1,
      zones: ['Alta izquierda', 'Alta centro', 'Alta derecha', 'Media izquierda', 'Media centro', 'Media derecha', 'Baja izquierda', 'Baja centro', 'Baja derecha']
        .map((label, index) => ({ value: `target-${index}`, label, shortLabel: label.replace(' ', '\n'), count: index === 2 ? 1 : 0 })),
    },
  },
  society: [{ name: 'Jairo Cárcaba', given: 1, received: 0 }],
  history: [],
  actions: [{
    id: 'borja-assist-qa',
    type: 'Asistencia',
    minute: 10,
    opponent: 'Rival QA',
    competition: 'Liga',
    date: '16/08/2026',
    result: '2-1',
    scorer: 'Jairo Cárcaba',
    assistZoneLabel: 'F. Creación derecha',
    phase: 'Juego combinativo',
    subphase: 'Dentro del área',
    url: 'https://video.example/borja-assist?t=600',
  }],
});

const inspectConnectionLayout = () => {
  const page = document.querySelector('[data-player-pdf-page="production"]');
  const row = page?.querySelector('.player-pdf-connections > article');
  const route = row?.querySelector('.player-pdf-connection-route');
  const count = row?.querySelector('.player-pdf-connection-count');
  const names = Array.from(route?.querySelectorAll('strong') || []);
  const rowRect = row?.getBoundingClientRect();
  const footerRect = page?.querySelector('.player-pdf-footer')?.getBoundingClientRect();
  const societyRect = page?.querySelector('.player-pdf-society')?.getBoundingClientRect();
  const insideRow = (element) => {
    const rect = element?.getBoundingClientRect();
    return Boolean(rect && rowRect && rect.top >= rowRect.top && rect.bottom <= rowRect.bottom);
  };
  return {
    title: page?.querySelector('.player-pdf-society h2')?.textContent?.trim(),
    origin: names[0]?.textContent?.trim(),
    destination: names[1]?.textContent?.trim(),
    count: count?.textContent?.trim(),
    rowHeight: rowRect?.height || 0,
    routeLineHeight: route ? getComputedStyle(route).lineHeight : '',
    rowOverflow: row ? row.scrollHeight > row.clientHeight || row.scrollWidth > row.clientWidth : true,
    namesInsideRow: names.length === 2 && names.every(insideRow),
    countInsideRow: insideRow(count),
    sectionAboveFooter: Boolean(societyRect && footerRect && societyRect.bottom < footerRect.top),
  };
};

function Audit() {
  useEffect(() => {
    if (!shouldExport) return undefined;
    let cancelled = false;
    window.__PLAYER_PROFILE_PDF_QA__ = { status: 'rendering' };
    const timer = window.setTimeout(async () => {
      try {
        await document.fonts?.ready;
        const layout = inspectConnectionLayout();
        const result = await createPlayerProfilePdf({ documentRef: document, scale: 2 });
        if (cancelled) return;
        downloadPlayerProfilePdf({
          arrayBuffer: result.arrayBuffer,
          filename: 'borja-rodriguez-conexiones-ofensivas-qa.pdf',
          documentRef: document,
        });
        window.__PLAYER_PROFILE_PDF_QA__ = {
          status: 'complete',
          layout,
          pages: result.pages,
          audit: result.audit,
        };
      } catch (error) {
        window.__PLAYER_PROFILE_PDF_QA__ = { status: 'error', message: error instanceof Error ? error.message : String(error) };
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="player-pdf-qa-preview">
      <style>{'.player-pdf-qa-preview .player-profile-print-portal { position: static; left: auto; margin: 20px auto; } body { margin: 0; background: #cbd5e1; }'}</style>
      <PlayerProfilePdfReport report={report} />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Audit />);
