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
    name: 'Jairo Cárcaba',
    team: 'C.D. Caudal de Mieres',
    season: '2026/2027',
    number: 14,
    position: 'Delantero',
    age: '34 años',
    foot: 'Derecho',
  },
  filters: { competition: 'Todas las competiciones', venue: 'Local y visitante' },
  seasonSummary: {
    played: 2,
    starts: 2,
    minutes: 180,
    minutesPerMatch: 90,
    starterPercentage: 100,
    goals: 1,
    assists: 0,
    goalContributions: 1,
    yellow: 0,
    red: 0,
    injuries: 0,
    benchEntries: 0,
  },
  competitionBreakdown: [
    { key: 'copa_rfef', label: 'Copa RFEF', played: 2, starts: 2, minutes: 180, goals: 1, assists: 0 },
  ],
  positionUsage: {
    positions: [
      { position: 'Extremo izquierdo', minutes: 90, percentage: 50 },
      { position: 'Delantero', minutes: 90, percentage: 50 },
    ],
    totalMinutes: 180,
    determinedMinutes: 180,
    unknownMinutes: 0,
    valid: true,
  },
  production: { goalsPer90: 0.5, assistsPer90: 0, goalContributionsPer90: 0.5, goalContributions: 1 },
  influenceMaps: [
    { key: 'all', label: 'Todos', zones: [{ value: 'finalizacion_centro', label: 'Finalización centro', count: 1 }] },
    { key: 'goals', label: 'Goles', zones: [{ value: 'finalizacion_centro', label: 'Finalización centro', count: 1 }] },
    { key: 'assists', label: 'Asistencias', zones: [] },
  ],
  goalAnalysis: {
    bodyParts: { values: [{ label: 'Cabeza', count: 1 }], known: 1, missing: 0, total: 1 },
    types: { phases: [{ label: 'Juego directo', count: 1 }], subphases: [], known: 1, missing: 0, total: 1 },
    target: {
      total: 1,
      known: 1,
      missing: 0,
      zones: ['Alta izquierda', 'Alta centro', 'Alta derecha', 'Media izquierda', 'Media centro', 'Media derecha', 'Baja izquierda', 'Baja centro', 'Baja derecha']
        .map((label, index) => ({ value: `target-${index}`, label, shortLabel: label.replace(' ', '\n'), count: index === 1 ? 1 : 0 })),
    },
  },
  society: [{ name: 'Borja Rodríguez', given: 0, received: 1 }],
  history: [{ id: 'jairo-match-1', date: '16/08/2026', opponent: 'CD Praviano', result: '1-0', outcome: 'V', competition: 'Copa RFEF', venue: 'L', role: 'Titular', minutes: "90'", goals: 1, assists: '-', cards: '-', injury: '-', goalLinks: ['https://youtu.be/9HXdIkVodbM'], assistLinks: [] }],
  actions: [{
    id: 'jairo-goal-qa',
    type: 'Gol',
    minute: 10,
    opponent: 'Rival QA',
    competition: 'Liga',
    date: '16/08/2026',
    result: '2-1',
    assistant: 'Borja Rodríguez',
    shotZoneLabel: 'F. Finalización centro',
    goalZoneLabel: 'Alta centro',
    contact: 'Cabeza',
    phase: 'Juego directo',
    subphase: 'Centro al área',
    url: 'https://youtu.be/9HXdIkVodbM',
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
        const result = await createPlayerProfilePdf({ report, documentRef: document });
        if (cancelled) return;
        downloadPlayerProfilePdf({
          arrayBuffer: result.arrayBuffer,
          filename: 'jairo-carcaba-dossier-profesional-qa.pdf',
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
