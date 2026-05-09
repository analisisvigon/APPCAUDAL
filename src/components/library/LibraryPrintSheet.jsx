import SetPieceDiagramCanvas from '../print/SetPieceDiagramCanvas';

export default function LibraryPrintSheet({ items = [], perPage = 2 }) {
  const visible = items.slice(0, perPage);
  return (
    <article className={`lineup-print-sheet library-print-sheet print-sheet-a4 library-print-${perPage}`}>
      <header className="library-print-header">
        <p>C.D. Caudal de Mieres</p>
        <h1>Biblioteca táctica y de entrenamiento</h1>
      </header>
      <section className="library-print-grid">
        {visible.map((item) => (
          <div key={item.id} className="library-print-card">
            <div className="library-print-card-head">
              <h2>{item.nombre}</h2>
              <span>{item.categoria || item.tipo}</span>
            </div>
            <SetPieceDiagramCanvas elements={item.elements || []} readOnly />
            <div className="library-print-info">
              <p><strong>Objetivo:</strong> {item.objetivo || '-'}</p>
              <p><strong>Descripción:</strong> {item.descripcion || '-'}</p>
              <p><strong>Jugadores:</strong> {item.jugadores || '-'} · <strong>Duración:</strong> {item.duracion || '-'}</p>
            </div>
          </div>
        ))}
      </section>
    </article>
  );
}
