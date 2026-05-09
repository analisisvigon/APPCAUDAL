const formatDate = (value) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const getPlayerName = (role) => role?.playerName || role?.manualName || '';

export default function DefensiveSetPiecePrintSheet({ match, note }) {
  const roles = Array.isArray(note?.roles) ? note.roles : [];

  return (
    <article className="lineup-print-sheet print-sheet-a4 defensive-abp-print-sheet">
      <header className="offensive-abp-header">
        <p>C.D. Caudal de Mieres</p>
        <h1>{note?.titulo || 'ABP DEFENSIVA'}</h1>
        <div>
          <span>{match?.isHome ? `C.D. Caudal - ${match?.opponent || 'Rival'}` : `${match?.opponent || 'Rival'} - C.D. Caudal`}</span>
          <span>{formatDate(match?.date)}</span>
        </div>
      </header>

      <section className="offensive-abp-layout">
        <div className="defensive-abp-zone">
          <div className="abp-area-box large" />
          <div className="abp-area-box small" />
          <div className="abp-goal" />
          <div className="defensive-zone-line one" />
          <div className="defensive-zone-line two" />
          <div className="defensive-barrier" />
          <span className="abp-zone-label area">Área propia</span>
          <span className="abp-zone-label reject">Rechace</span>
          <span className="abp-zone-label safety">Vigilancia</span>
        </div>

        <div className="offensive-abp-text">
          <h2>Consigna</h2>
          <p>{note?.descripcion || 'Escribe la organización defensiva antes de imprimir.'}</p>
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
