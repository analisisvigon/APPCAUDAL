const splitLines = (value, limit = 6) =>
  String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);

const formatDate = (value) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const pageLabels = {
  keys: 'Claves del partido',
};

const sheetProfiles = {
  Dossier: { label: 'Partido', density: 'large' },
};

export default function DossierTacticalSheet({ match, pageId, dossierType = 'Dossier', keys = [], staffNotes = [], pageNumber = 1, totalPages = 1 }) {
  const profile = sheetProfiles[dossierType] || sheetProfiles.Dossier;
  const title = pageLabels[pageId] || 'Hoja tactica';
  const rival = match?.opponent || 'Rival';

  const pageContent = {
    keys: [
      { title: 'Claves del partido', items: (keys.length ? keys : splitLines(`${match?.planClave || ''}\n${match?.planObjetivo || ''}\n${match?.planConBalon || ''}\n${match?.planSinBalon || ''}\n${match?.planTransiciones || ''}`, 6)).slice(0, 6) },
    ],
  }[pageId] || [];

  return (
    <article className={`lineup-print-sheet print-sheet-a4 operational-print-sheet dossier-${profile.density}`}>
      <header className="operational-print-header">
        <div>
          <p className="print-sheet-kicker">DOSSIER - {profile.label}</p>
          <h1>{title}</h1>
        </div>
        <div className="print-sheet-meta">
          <p><strong>Partido:</strong> C.D. Caudal - {rival}</p>
          <p><strong>Fecha:</strong> {formatDate(match?.date)}</p>
          <p><strong>Sistema:</strong> {match?.preCaudalSystem || match?.statsSystem || 'Pendiente'}</p>
          <p><strong>Rival:</strong> {match?.preRivalSystem || 'Pendiente'}</p>
        </div>
      </header>

      <section className="operational-key-strip">
        {(keys.length ? keys : ['Clave pendiente', 'Ajuste pendiente', 'Riesgo pendiente']).slice(0, 3).map((key, index) => (
          <div key={`${key}-${index}`}>
            <span>{index + 1}</span>
            <p>{key}</p>
          </div>
        ))}
      </section>

      <section className={`operational-grid operational-grid-${pageId}`}>
        {pageContent.map((block) => (
          <div key={block.title} className="operational-box">
            <h2>{block.title}</h2>
            <ul>
              {(block.items.length ? block.items : ['', '', '']).map((item, index) => (
                <li key={`${block.title}-${index}`} className={!item ? 'blank-line' : ''}>{item || ' '}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <footer className="operational-print-footer">
        <span>C.D. Caudal · {rival}</span>
        <strong>{pageNumber}/{totalPages}</strong>
      </footer>
    </article>
  );
}
