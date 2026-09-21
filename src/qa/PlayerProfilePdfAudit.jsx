import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import '../styles/print.css';
import PlayerProfilePdfReport from '../components/print/PlayerProfilePdfReport';
import PlayerPositionUsageSummary from '../components/player/PlayerPositionUsageSummary';
import PlayerMatchPositionSummary from '../components/player/PlayerMatchPositionSummary';
import { buildPlayerProfilePrintReport } from '../utils/playerProfilePrintReport';
import { createPlayerProfilePdf, downloadPlayerProfilePdf } from '../utils/playerProfilePdfExport';

const params = new URLSearchParams(window.location.search);
const shouldExport = params.get('export') === '1';
const appPositionOnly = params.get('appPosition') === '1';
const positionTimelineOnly = params.get('positionTimeline') === '1';
const openTimelinePosition = params.get('openPosition') === '1' ? 'Mediapunta' : '';
const openHistoryDetail = params.get('openHistory') === '1';

const timelineUsage = {
  totalMinutes: 200,
  determinedMinutes: 180,
  identifiedMinutes: 180,
  unknownMinutes: 20,
  unidentifiedMinutes: 20,
  positions: [
    { position: 'Mediapunta', minutes: 150, percentage: 75 },
    { position: 'Extremo derecho', minutes: 30, percentage: 15 },
  ],
  matches: [
    {
      matchId: 'timeline-covadonga', opponent: 'CD Covadonga', date: '2026-09-20', competition: 'Liga', venue: 'Local', result: '2-1', totalMinutes: 90,
      segments: [
        { matchId: 'timeline-covadonga', fromMinute: 0, toMinute: 60, minutes: 60, system: '4-2-3-1', position: 'Mediapunta', identified: true },
        { matchId: 'timeline-covadonga', fromMinute: 60, toMinute: 90, minutes: 30, system: '4-3-3', position: 'Mediapunta', identified: true },
      ],
    },
    {
      matchId: 'timeline-ceares', opponent: 'Unión Club Ceares', date: '2026-09-13', competition: 'Liga', venue: 'Visitante', result: '1-1', totalMinutes: 90,
      segments: [
        { matchId: 'timeline-ceares', fromMinute: 0, toMinute: 30, minutes: 30, system: '4-2-3-1', position: 'Mediapunta', identified: true },
        { matchId: 'timeline-ceares', fromMinute: 30, toMinute: 60, minutes: 30, system: '4-3-3', position: 'Extremo derecho', identified: true },
        { matchId: 'timeline-ceares', fromMinute: 60, toMinute: 90, minutes: 30, system: '4-2-3-1', position: 'Mediapunta', identified: true },
      ],
    },
    {
      matchId: 'timeline-long', opponent: 'Real Sporting de Gijón Atlético', date: '2026-09-06', competition: 'Copa RFEF', venue: 'Local', result: '0-0', totalMinutes: 20,
      segments: [{ matchId: 'timeline-long', fromMinute: 70, toMinute: 90, minutes: 20, system: '4-4-2', position: '', identified: false }],
    },
  ],
};

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
      { position: 'Delantero centro', minutes: 90, percentage: 50 },
      { position: 'Extremo izquierdo', minutes: 90, percentage: 50 },
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

  if (positionTimelineOnly) {
    return (
      <main className="min-h-screen bg-[#06101f] p-4 text-white sm:p-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">Ficha individual · QA temporal</p>
            <h1 className="mt-1 text-xl font-black">Jugador de prueba · Posición y sistema</h1>
          </div>
          <PlayerPositionUsageSummary usage={timelineUsage} initialOpenPosition={openTimelinePosition} />
          <section className="rounded-[1.5rem] border border-white/10 bg-[#091428]/72 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-[0.18em]">Historial partido a partido</h2>
              <span className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-black text-slate-300">3 registros</span>
            </div>
            <div className="mt-4 overflow-x-auto player-history-table">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.16em] text-slate-500"><tr>{['Fecha', 'Rival', 'Resultado', 'Competición', 'Rol', 'Pos./Sist.', 'Min'].map((head) => <th key={head} className="whitespace-nowrap px-3 py-3">{head}</th>)}</tr></thead>
                <tbody>{timelineUsage.matches.map((match, index) => <tr key={match.matchId} className="border-t border-white/10">
                  <td className="whitespace-nowrap px-3 py-4 text-slate-300">{match.date.split('-').reverse().join('/')}</td>
                  <td className="min-w-[220px] px-3 py-4 font-bold">{match.opponent}</td>
                  <td className="px-3 py-4 text-slate-300">{match.result}</td>
                  <td className="px-3 py-4 text-slate-300">{match.competition}</td>
                  <td className="px-3 py-4"><span className="rounded-xl bg-caudal-electric/15 px-2 py-1 text-xs font-black text-caudal-electric">Titular</span></td>
                  <td className="min-w-[132px] px-3 py-3 align-top" data-player-match-position-summary><PlayerMatchPositionSummary matchUsage={match} initialOpen={openHistoryDetail && index === 0} /></td>
                  <td className="px-3 py-4 font-black">{match.totalMinutes}'</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (appPositionOnly) {
    return (
      <main className="min-h-screen bg-[#06101f] p-8 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Ficha individual · Jairo Cárcaba · Copa RFEF</p>
          <PlayerPositionUsageSummary usage={report.positionUsage} />
        </div>
      </main>
    );
  }

  return (
    <main className="player-pdf-qa-preview">
      <style>{'.player-pdf-qa-preview .player-profile-print-portal { position: static; left: auto; margin: 20px auto; } body { margin: 0; background: #cbd5e1; }'}</style>
      <PlayerProfilePdfReport report={report} />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Audit />);
