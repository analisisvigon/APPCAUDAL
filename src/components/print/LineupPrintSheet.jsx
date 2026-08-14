import FootballPitchPrint from './FootballPitchPrint';
import { buildLineupPrintBenchRows } from '../../utils/lineupPrintBench';
import { getOwnPrintKitForMatch } from '../../utils/printPlayerShirt';

const formatDate = (value) => {
  if (!value) return 'Sin información';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export default function LineupPrintSheet({ match, starters = [], bench = [], coordinates = [], system = '4-4-2', kit, captainPlayerId = null }) {
  const benchRows = buildLineupPrintBenchRows(bench);
  const resolvedKit = kit === 'away' || kit === 'home' ? kit : getOwnPrintKitForMatch(match);

  return (
    <article className="lineup-print-sheet print-sheet-a4 lineup-match-sheet">
      <header className="print-sheet-header">
        <div>
          <h1>C.D. Caudal de Mieres</h1>
        </div>
        <div className="print-sheet-meta">
          <p><strong>Rival:</strong> {match?.opponent || 'Sin información'}</p>
          <p><strong>Fecha:</strong> {formatDate(match?.date)}</p>
          <p><strong>Sistema:</strong> {system}</p>
          <p><strong>Equipación:</strong> {resolvedKit === 'away' ? 'Segunda / negra' : 'Primera / blanca'}</p>
        </div>
      </header>

      <section className="print-lineup-layout">
        <FootballPitchPrint players={starters} coordinates={coordinates} kit={resolvedKit} />
        <aside className="print-bench">
          <h2>Banquillo</h2>
          <div className="print-bench-list">
            {benchRows.length ? benchRows.map((row) => (
              <div key={row.key} className="print-bench-row">
                <span className="print-bench-position-marker" aria-hidden={!row.isGoalkeeper}>
                  {row.isGoalkeeper ? <span className="print-bench-goalkeeper-badge" aria-label="Portero suplente">POR</span> : null}
                </span>
                <strong className="print-bench-number">{row.number}</strong>
                <span className="print-bench-name">{row.name}{row.player?.id === captainPlayerId || row.player?.isCaptain ? ' (C)' : ''}</span>
              </div>
            )) : (
              <p className="print-empty">No hay suplentes seleccionados</p>
            )}
          </div>
        </aside>
      </section>
    </article>
  );
}
