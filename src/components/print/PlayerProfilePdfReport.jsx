import FootballZoneMap from '../visualization/FootballZoneMap';

const safeRows = (value) => Array.isArray(value) ? value : [];
const displayValue = (value, fallback = 'Sin datos') => value === 0 || value ? value : fallback;

function ReportHeader({ report, section }) {
  return (
    <header className="player-pdf-running-header">
      <div className="player-pdf-brand"><i>AC</i><p>APPCAUDAL <span>· Dossier de rendimiento</span></p></div>
      <strong>{report.identity.name}</strong>
      <span>{section}</span>
    </header>
  );
}

function ReportFooter({ report, page }) {
  return (
    <footer className="player-pdf-footer">
      <span>{report.identity.team || 'Sin equipo'} · {report.identity.season || 'Sin temporada'}</span>
      <span>Página {page} de {report.pagePlan.length}</span>
    </footer>
  );
}

function SectionTitle({ eyebrow, children }) {
  return <div className="player-pdf-section-title"><span>{eyebrow}</span><h2>{children}</h2></div>;
}

function PlayerHeader({ report }) {
  const initials = String(report.identity.name || '').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2);
  return (
    <section className="player-pdf-identity">
      <div className="player-pdf-photo">{report.identity.image ? <img src={report.identity.image} alt={report.identity.name} /> : <span>{initials}</span>}</div>
      <div className="player-pdf-identity-copy">
        <p className="player-pdf-kicker">Perfil profesional de rendimiento</p>
        <h1>{report.identity.name}</h1>
        <div className="player-pdf-identity-primary">
          <strong>#{displayValue(report.identity.number)}</strong>
          <span>{displayValue(report.identity.position)}</span>
          <span>{displayValue(report.identity.age)}</span>
          <span>Pie {displayValue(report.identity.foot)}</span>
        </div>
        <div className="player-pdf-club-line"><b>{displayValue(report.identity.team)}</b><span>Temporada {displayValue(report.identity.season)}</span></div>
      </div>
      <div className="player-pdf-scope">
        <span>Ámbito del dossier</span>
        <strong>{displayValue(report.filters.competition)}</strong>
        <p>{displayValue(report.filters.venue)}</p>
      </div>
    </section>
  );
}

function SeasonSummary({ report }) {
  const summary = report.seasonSummary;
  const primary = [
    ['Partidos', summary.played],
    ['Titularidades', summary.starts],
    ['Minutos', `${displayValue(summary.minutes, 0)}'`],
    ['Min/partido', `${displayValue(summary.minutesPerMatch, 0)}'`],
    ['% titularidad', `${displayValue(summary.starterPercentage, 0)}%`],
  ];
  const secondary = [
    ['Goles', summary.goals],
    ['Asistencias', summary.assists],
    ['G+A', summary.goalContributions],
    ['Amarillas', summary.yellow],
    ['Rojas', summary.red],
    ['Lesiones', summary.injuries],
    ['Desde banquillo', summary.benchEntries],
  ];
  return (
    <section className="player-pdf-section player-pdf-season-summary">
      <SectionTitle eyebrow="01">Rendimiento · Temporada {report.identity.season}</SectionTitle>
      <div className="player-pdf-primary-stats">{primary.map(([label, value]) => <div key={label}><strong>{displayValue(value, 0)}</strong><span>{label}</span></div>)}</div>
      <div className="player-pdf-secondary-stats">{secondary.map(([label, value]) => <div key={label}><span>{label}</span><strong>{displayValue(value, 0)}</strong></div>)}</div>
    </section>
  );
}

function CompetitionTable({ rows }) {
  if (!safeRows(rows).length) return null;
  return (
    <section className="player-pdf-section player-pdf-competitions">
      <SectionTitle eyebrow="02">Rendimiento por competición</SectionTitle>
      <table>
        <thead><tr><th>Competición</th><th>PJ</th><th>Tit.</th><th>Min</th><th>G</th><th>A</th><th>G+A</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key || row.label}><td>{row.label}</td><td>{row.played}</td><td>{row.starts}</td><td>{row.minutes}'</td><td>{row.goals}</td><td>{row.assists}</td><td><strong>{row.goalContributions}</strong></td></tr>)}</tbody>
      </table>
    </section>
  );
}

function HistoryActionLinks({ count, links, type }) {
  const safeLinks = safeRows(links);
  if (!safeLinks.length) return count;
  const allActionsLinked = Number(count) === safeLinks.length;
  return (
    <span className="player-pdf-history-links">
      {!allActionsLinked ? <b>{count}</b> : null}
      {safeLinks.map((url, index) => (
        <a data-player-video-link="history" key={`${type}-${url}-${index}`} href={url} target="_blank" rel="noreferrer" aria-label={`${type} ${index + 1}: abrir vídeo`}>
          ▶{safeLinks.length === 1 ? ` ${count}` : index + 1}
        </a>
      ))}
    </span>
  );
}

function RivalIdentity({ row }) {
  const initials = String(row.opponent || '').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2);
  return <span className="player-pdf-rival">{row.opponentCrest ? <img src={row.opponentCrest} alt="" /> : <i>{initials || 'R'}</i>}<b>{row.opponent}</b></span>;
}

function HistoryTable({ rows }) {
  if (!safeRows(rows).length) return <p className="player-pdf-empty-line">Sin partidos registrados en el ámbito seleccionado.</p>;
  return (
    <table>
      <colgroup><col className="date" /><col className="opponent" /><col className="score" /><col className="competition" /><col className="venue" /><col className="role" /><col className="minutes" /><col className="action" /><col className="action" /><col className="cards" /><col className="injury" /></colgroup>
      <thead><tr><th>Fecha</th><th>Rival</th><th>Resultado</th><th>Competición</th><th>L/V</th><th>Rol</th><th>Min</th><th>Goles</th><th>Asist.</th><th>Tarjetas</th><th>Lesión</th></tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.id}>
          <td>{row.date}</td><td><RivalIdentity row={row} /></td><td><b className="player-pdf-score">{row.result}</b></td><td>{row.competition}</td><td>{row.venue}</td><td>{row.role}</td><td>{row.minutes}</td>
          <td><HistoryActionLinks count={row.goals} links={row.goalLinks} type="Gol" /></td>
          <td><HistoryActionLinks count={row.assists} links={row.assistLinks} type="Asistencia" /></td>
          <td>{row.cards}</td><td>{row.injury}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function InfluenceMaps({ maps }) {
  return (
    <section className="player-pdf-section player-pdf-map-panel">
      <SectionTitle eyebrow="04">Zonas de producción</SectionTitle>
      <div className="player-pdf-map-grid">{safeRows(maps).map((map) => (
        <article key={map.key} aria-label={`Mapa ${map.label}`}>
          <h3>{map.key === 'all' ? 'Todas las acciones' : map.label}</h3>
          <FootballZoneMap zones={map.zones} variant="print" emptyLabel="Sin acciones registradas" />
        </article>
      ))}</div>
    </section>
  );
}

function ProductionSummary({ production }) {
  const metrics = [
    ['Goles/90', production.goalsPer90],
    ['Asistencias/90', production.assistsPer90],
    ['G+A/90', production.goalContributionsPer90],
    ['Goles + asistencias', production.goalContributions],
  ];
  return (
    <section className="player-pdf-section player-pdf-production-card">
      <SectionTitle eyebrow="05">Producción ofensiva</SectionTitle>
      <div className="player-pdf-production-metrics">{metrics.map(([label, value]) => <div key={label}><strong>{displayValue(value, 0)}</strong><span>{label}</span></div>)}</div>
    </section>
  );
}

function OffensiveConnections({ connections, continuation = false }) {
  if (!safeRows(connections).length) return null;
  return (
    <section className={`player-pdf-section player-pdf-society${continuation ? ' player-pdf-connections-page' : ''}`}>
      <SectionTitle eyebrow="06">Conexiones ofensivas{continuation ? ' · continuación' : ''}</SectionTitle>
      <div className="player-pdf-connections">{connections.map((connection) => (
        <article key={connection.id}>
          <p className="player-pdf-connection-route"><strong>{connection.from}</strong><span aria-hidden="true">→</span><strong>{connection.to}</strong></p>
          <p className="player-pdf-connection-count"><b>{connection.count}</b> {connection.count === 1 ? 'asistencia' : 'asistencias'}</p>
        </article>
      ))}</div>
    </section>
  );
}

function ActionsLibrary({ actions, eyebrow = '07' }) {
  return (
    <section className="player-pdf-section player-pdf-actions">
      <SectionTitle eyebrow={eyebrow}>Acciones en vídeo</SectionTitle>
      {safeRows(actions).length ? <div className="player-pdf-action-grid">{actions.map((action) => (
        <article key={action.id || `${action.type}-${action.minute}-${action.opponent}`}>
          <span className="player-pdf-video-icon">▶</span>
          <div><strong>{action.type} <em>· {action.minute}'</em></strong><span>vs {action.opponent}</span><small>{action.competition}{action.date ? ` · ${action.date}` : ''}</small></div>
          <a href={action.url} data-player-video-link="library" target="_blank" rel="noreferrer">Abrir vídeo ↗</a>
        </article>
      ))}</div> : <p className="player-pdf-empty-line">Sin acciones en vídeo registradas.</p>}
    </section>
  );
}

function SummaryPage({ report }) {
  return (
    <article className="player-pdf-page player-pdf-summary-page" data-player-pdf-page="summary">
      <ReportHeader report={report} section="Perfil y rendimiento competitivo" />
      <PlayerHeader report={report} />
      <SeasonSummary report={report} />
      <CompetitionTable rows={report.competitionBreakdown} />
      <section className="player-pdf-section player-pdf-history player-pdf-summary-history"><SectionTitle eyebrow="03">Historial partido a partido</SectionTitle><HistoryTable rows={report.summaryHistory} /></section>
      <ReportFooter report={report} page={1} />
    </article>
  );
}

function ProductionPage({ report }) {
  const hasOffensiveConnections = safeRows(report.offensiveConnections).length > 0;
  return (
    <article className="player-pdf-page player-pdf-production-page" data-player-pdf-page="production">
      <ReportHeader report={report} section="Producción, zonas y vídeo" />
      <InfluenceMaps maps={report.influenceMaps} />
      <div className="player-pdf-production-row"><ProductionSummary production={report.production} /><OffensiveConnections connections={report.productionConnections} /></div>
      <ActionsLibrary actions={report.productionActions} eyebrow={hasOffensiveConnections ? '07' : '06'} />
      <ReportFooter report={report} page={2} />
    </article>
  );
}

function ConnectionsContinuationPage({ report, connections, page }) {
  return (
    <article className="player-pdf-page player-pdf-overflow-page" data-player-pdf-page={`connections-${page}`}>
      <ReportHeader report={report} section="Conexiones ofensivas · continuación" />
      <OffensiveConnections connections={connections} continuation />
      <ReportFooter report={report} page={page} />
    </article>
  );
}

function HistoryContinuationPage({ report, rows, page }) {
  return (
    <article className="player-pdf-page player-pdf-overflow-page" data-player-pdf-page={`history-${page}`}>
      <ReportHeader report={report} section="Historial · continuación" />
      <section className="player-pdf-section player-pdf-history"><SectionTitle eyebrow="03">Historial partido a partido · continuación</SectionTitle><HistoryTable rows={rows} /></section>
      <ReportFooter report={report} page={page} />
    </article>
  );
}

function VideoContinuationPage({ report, actions, page }) {
  const hasOffensiveConnections = safeRows(report.offensiveConnections).length > 0;
  return (
    <article className="player-pdf-page player-pdf-overflow-page" data-player-pdf-page={`video-${page}`}>
      <ReportHeader report={report} section="Acciones en vídeo · continuación" />
      <ActionsLibrary actions={actions} eyebrow={hasOffensiveConnections ? '07' : '06'} />
      <ReportFooter report={report} page={page} />
    </article>
  );
}

export default function PlayerProfilePdfReport({ report }) {
  if (!report) return null;
  const connectionPageCount = report.connectionOverflow.length;
  const historyPageCount = report.historyOverflow.length;
  return (
    <section className="player-profile-print-portal print-dossier-portal" aria-label={`Dossier PDF de ${report.identity.name}`}>
      <div className="player-profile-pdf-report" data-player-pdf-report="true" data-page-count={report.pagePlan.length}>
        <SummaryPage report={report} />
        <ProductionPage report={report} />
        {report.connectionOverflow.map((connections, index) => <ConnectionsContinuationPage key={`connections-${index}`} report={report} connections={connections} page={index + 3} />)}
        {report.historyOverflow.map((rows, index) => <HistoryContinuationPage key={`history-${index}`} report={report} rows={rows} page={index + connectionPageCount + 3} />)}
        {report.actionOverflow.map((actions, index) => <VideoContinuationPage key={`video-${index}`} report={report} actions={actions} page={index + connectionPageCount + historyPageCount + 3} />)}
      </div>
    </section>
  );
}
