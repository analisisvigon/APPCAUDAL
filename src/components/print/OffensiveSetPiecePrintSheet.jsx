const formatDate = (value) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const getPlayerName = (role) => role?.playerName || role?.manualName || '';

export default function OffensiveSetPiecePrintSheet({ match, note }) {
  const roles = Array.isArray(note?.roles) ? note.roles : [];

  return (
    <article className="lineup-print-sheet print-sheet-a4 offensive-abp-print-sheet">
      <header className="offensive-abp-header">
        <p>C.D. Caudal de Mieres</p>
        <h1>{note?.titulo || 'ABP OFENSIVA'}</h1>
        <div>
          <span>{match?.isHome ? `C.D. Caudal - ${match?.opponent || 'Rival'}` : `${match?.opponent || 'Rival'} - C.D. Caudal`}</span>
          <span>{formatDate(match?.date)}</span>
        </div>
      </header>

      <section className="offensive-abp-layout">
        <div className="offensive-abp-zone">
          <div className="abp-area-box large" />
          <div className="abp-area-box small" />
          <div className="abp-goal" />
          <div className="abp-corner-mark left" />
          <div className="abp-corner-mark right" />
          <div className="abp-ball" />
          <span className="abp-zone-label area">Área</span>
          <span className="abp-zone-label reject">Rechace</span>
          <span className="abp-zone-label safety">Seguridad</span>
        </div>

        <div className="offensive-abp-text">
          <h2>Consigna</h2>
          <p>{note?.descripcion || 'Escribe la explicación de la jugada antes de imprimir.'}</p>
        </div>
      </section>

      <section className="offensive-abp-roles">
        <h2>Roles / jugadores</h2>
        <div className="offensive-role-grid">
          {roles.map((role, index) => (
            <div key={`${role.role}-${index}`} className="offensive-role-row">
              <strong>{role.role || `Rol ${index + 1}`}</strong>
              <span>{getPlayerName(role) || '________________________'}</span>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
