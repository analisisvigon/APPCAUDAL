const formatDate = (value) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const getTakerName = (entry, playersById) => {
  if (entry?.nombre_manual) return entry.nombre_manual;
  const player = playersById.get(entry?.jugador_id);
  return player?.shirtName || player?.name || '';
};

export default function SetPieceTakersPrintSheet({ match, sections = [], takers = [], players = [] }) {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const takersByType = takers.reduce((acc, entry) => {
    if (!acc[entry.tipo]) acc[entry.tipo] = [];
    acc[entry.tipo].push(entry);
    return acc;
  }, {});

  return (
    <article className="lineup-print-sheet print-sheet-a4 set-piece-print-sheet">
      <header className="set-piece-header">
        <p>C.D. Caudal de Mieres</p>
        <h1>LANZADORES</h1>
        <div>
          <span>{match?.isHome ? `C.D. Caudal - ${match?.opponent || 'Rival'}` : `${match?.opponent || 'Rival'} - C.D. Caudal`}</span>
          <span>{formatDate(match?.date)}</span>
        </div>
      </header>

      <section className="set-piece-grid">
        {sections.map((section) => {
          const rows = [...(takersByType[section.id] || [])].sort((a, b) => Number(a.orden) - Number(b.orden));
          return (
            <div key={section.id} className="set-piece-box">
              <h2>{section.label}</h2>
              {[1, 2, 3].map((order) => {
                const entry = rows.find((item) => Number(item.orden) === order);
                return (
                  <div key={`${section.id}-${order}`} className="set-piece-row">
                    <strong>{order}º</strong>
                    <span>{getTakerName(entry, playersById) || '________________________'}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>
    </article>
  );
}
