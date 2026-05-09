import FootballPitchPrint from './FootballPitchPrint';
import PlayerShirt from './PlayerShirt';

const formatDate = (value) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export default function LineupPrintSheet({ match, starters = [], bench = [], coordinates = [], system = '4-4-2', kit = 'home' }) {
  return (
    <article className="lineup-print-sheet">
      <header className="print-sheet-header">
        <div>
          <p className="print-sheet-kicker">C.D. Caudal de Mieres</p>
          <h1>{match?.isHome ? `C.D. Caudal - ${match?.opponent || 'Rival'}` : `${match?.opponent || 'Rival'} - C.D. Caudal`}</h1>
        </div>
        <div className="print-sheet-meta">
          <p><strong>Rival:</strong> {match?.opponent || 'Sin rival'}</p>
          <p><strong>Fecha:</strong> {formatDate(match?.date)}</p>
          <p><strong>Sistema:</strong> {system}</p>
          <p><strong>Equipación:</strong> {kit === 'away' ? 'Suplente / amarilla a rayas' : 'Titular / blanca'}</p>
        </div>
      </header>

      <section className="print-lineup-layout">
        <FootballPitchPrint players={starters} coordinates={coordinates} kit={kit} />
        <aside className="print-bench">
          <h2>Banquillo</h2>
          <div className="print-bench-list">
            {bench.length ? bench.map((player) => (
              <div key={player.id || player.name} className="print-bench-row">
                <PlayerShirt player={player} kit={kit} goalkeeper={String(player.position || '').toLowerCase().includes('portero')} compact />
                <span>{player.name}</span>
              </div>
            )) : (
              <p className="print-empty">Sin suplentes definidos.</p>
            )}
          </div>
        </aside>
      </section>

      <section className="print-observations">
        <h2>Observaciones</h2>
        <div className="print-observation-lines">
          {Array.from({ length: 7 }).map((_, index) => <span key={index} />)}
        </div>
      </section>
    </article>
  );
}
