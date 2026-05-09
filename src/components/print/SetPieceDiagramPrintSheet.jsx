import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';

const formatDate = (value) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export default function SetPieceDiagramPrintSheet({ match, title = 'ABP', diagrams = [], players = [], layout = 'portrait' }) {
  const printable = diagrams.slice(0, layout === 'landscape' ? 1 : 2);
  return (
    <article className={`lineup-print-sheet print-sheet-a4 diagram-print-sheet ${layout === 'landscape' ? 'diagram-print-landscape' : ''}`}>
      <header className="diagram-print-header">
        <p>C.D. Caudal de Mieres</p>
        <h1>{title}</h1>
        <div>
          <span>{match?.isHome ? `C.D. Caudal - ${match?.opponent || 'Rival'}` : `${match?.opponent || 'Rival'} - C.D. Caudal`}</span>
          <span>{formatDate(match?.date)}</span>
        </div>
      </header>
      <section className="diagram-print-grid">
        {printable.map((diagram, index) => (
          <div key={diagram.id || `${diagram.tipo}-${diagram.orden}-${index}`} className="diagram-print-card">
            <div className="diagram-print-card-head">
              <h2>{diagram.titulo || `Jugada ${diagram.orden || index + 1}`}</h2>
              <span>{diagram.orden || index + 1}</span>
            </div>
            <SetPieceDiagramCanvas elements={diagram.elements || []} players={players} readOnly />
            <p>{diagram.consigna || 'Consigna pendiente.'}</p>
          </div>
        ))}
      </section>
    </article>
  );
}
