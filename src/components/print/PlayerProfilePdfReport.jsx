const safeRows = (value) => Array.isArray(value) ? value : [];

function ReportHeader({ report, section }) {
  return (
    <header className="player-pdf-running-header">
      <div className="player-pdf-brand"><i>AC</i><p>APPCAUDAL <span>· Informe individual</span></p></div>
      <strong>{report.identity.name}</strong>
      <span>{section}</span>
    </header>
  );
}

function ReportFooter({ report, page }) {
  return (
    <footer className="player-pdf-footer">
      <span>{report.filters.competition} · {report.filters.venue} · Influencia: {report.filters.influence}</span>
      <span>Página {page} de {report.pagePlan.length}</span>
    </footer>
  );
}

function SectionTitle({ number, children, compact = false }) {
  return <div className={`player-pdf-section-title${compact ? ' compact' : ''}`}>{number ? <span>{number}</span> : null}<h2>{children}</h2></div>;
}

function ZoneGrid({ zones, goal = false }) {
  const available = safeRows(zones).some((zone) => Number(zone.count) > 0);
  if (!available) return null;
  return (
    <div className={`player-pdf-zone-grid ${goal ? 'is-goal' : 'is-pitch'}`} aria-label={goal ? 'Diana de finalización' : 'Mapa de influencia'}>
      {safeRows(zones).map((zone) => (
        <div key={zone.value} className={Number(zone.count) > 0 ? 'has-value' : ''}>
          {Number(zone.count) > 0 ? <><span>{zone.shortLabel || zone.label}</span><strong>{zone.count}</strong></> : null}
        </div>
      ))}
    </div>
  );
}

function HistoryActionLinks({ count, links, type }) {
  const safeLinks = safeRows(links);
  if (!safeLinks.length) return count;
  return (
    <span className="player-pdf-history-links">
      <b>{count}</b>
      {safeLinks.map((url, index) => (
        <a key={`${type}-${url}-${index}`} href={url} target="_blank" rel="noreferrer" aria-label={`${type} ${index + 1}: abrir vídeo`}>
          {safeLinks.length === 1 ? '↗' : `${index + 1}↗`}
        </a>
      ))}
    </span>
  );
}

function HistoryTable({ rows }) {
  if (!safeRows(rows).length) return null;
  return (
    <table>
      <colgroup><col className="date" /><col className="opponent" /><col className="score" /><col className="competition" /><col className="venue" /><col className="role" /><col className="number" /><col className="number" /><col className="number" /><col className="number" /><col className="cards" /><col className="injury" /></colgroup>
      <thead><tr><th>Fecha</th><th>Rival</th><th>Res.</th><th>Competición</th><th>L/V</th><th>Rol</th><th>Min</th><th>Nota</th><th>G</th><th>A</th><th>Tarj.</th><th>Les.</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.date}</td><td>{row.opponent}</td><td><b className="player-pdf-score">{row.result}</b></td><td>{row.competition}</td><td>{row.venue}</td><td>{row.role}</td><td>{row.minutes}</td><td>{row.rating}</td>
            <td><HistoryActionLinks count={row.goals} links={row.goalLinks} type="Gol" /></td>
            <td><HistoryActionLinks count={row.assists} links={row.assistLinks} type="Asistencia" /></td>
            <td>{row.cards}</td><td>{row.injury}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Timeline({ groups }) {
  if (!safeRows(groups).length) return null;
  return (
    <section className="player-pdf-section player-pdf-timeline-section">
      <SectionTitle number="06">Impacto en el tiempo</SectionTitle>
      <div className="player-pdf-timeline">
        {[0, 15, 30, 45, 60, 75, 90].map((minute) => <i key={minute} style={{ left: `${minute / 90 * 100}%` }}><small>{minute}'</small></i>)}
        {groups.map((group) => (
          <div className="player-pdf-timeline-event-group" key={group.minute} style={{ left: `${Math.min(100, Number(group.minute) / 90 * 100)}%` }}>
            {safeRows(group.events).map((event, index) => {
              const marker = event.label || (event.type === 'Gol' ? 'G' : event.type === 'Asistencia' ? 'A' : event.type?.slice(0, 3));
              return event.url
                ? <a key={event.id || index} href={event.url} target="_blank" rel="noreferrer" title={`${event.type} · ${event.minute}' · abrir vídeo`}>{marker}</a>
                : <span key={event.id || index} title={`${event.type} · ${event.minute}'`}>{marker}</span>;
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionsLibrary({ actions, number = '07' }) {
  if (!safeRows(actions).length) return null;
  return (
    <section className="player-pdf-section player-pdf-actions">
      <SectionTitle number={number}>Videoteca de acciones</SectionTitle>
      <div className="player-pdf-action-grid">
        {actions.map((action) => (
          <article key={action.id || `${action.type}-${action.minute}-${action.opponent}`}>
            <span className="player-pdf-video-icon">▶</span>
            <div><strong>{action.type} <em>· {action.minute}'</em></strong><span>vs {action.opponent}</span><small>{action.competition}</small></div>
            {action.url ? <a href={action.url} target="_blank" rel="noreferrer">Abrir vídeo ↗</a> : <small className="player-pdf-no-video">Sin vídeo</small>}
          </article>
        ))}
      </div>
    </section>
  );
}

function SummaryPage({ report }) {
  const initials = String(report.identity.name || '').split(/\s+/).map((part) => part[0]).join('').slice(0, 2);
  return (
    <article className="player-pdf-page player-pdf-summary-page" data-player-pdf-page="summary">
      <ReportHeader report={report} section="Perfil competitivo" />
      <section className="player-pdf-identity">
        <div className="player-pdf-photo">{report.identity.image ? <img src={report.identity.image} alt={report.identity.name} /> : <span>{initials}</span>}</div>
        <div className="player-pdf-identity-copy"><p className="player-pdf-kicker">Perfil de rendimiento</p><h1>{report.identity.name}</h1><div className="player-pdf-identity-facts"><strong>#{report.identity.number}</strong><span>{report.identity.position}</span><span>{report.identity.age}</span><span>Pie {report.identity.foot}</span></div></div>
        <div className="player-pdf-filter-card"><span>Filtros aplicados</span><strong>{report.filters.competition}</strong><p>{report.filters.venue}</p><p>Influencia · {report.filters.influence}</p></div>
      </section>

      <section className="player-pdf-section player-pdf-summary-metrics">
        <SectionTitle number="01">Resumen estadístico</SectionTitle>
        <div className="player-pdf-metric-grid">{report.metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.detail ? <small>{metric.detail}</small> : null}</div>)}</div>
      </section>

      {report.seasonStages.length ? <section className="player-pdf-section player-pdf-season-section"><SectionTitle number="02">Evolución de temporada</SectionTitle><div className="player-pdf-season-strip">{report.seasonStages.map((stage) => <div key={stage.label}><strong>{stage.label}</strong><b>{stage.minutes}'</b><span>{stage.matches} PJ · Nota {stage.rating} · Impacto {stage.impact}</span></div>)}</div></section> : null}

      {report.summaryHistory.length ? <section className="player-pdf-section player-pdf-history player-pdf-summary-history"><SectionTitle number="03">Historial partido a partido</SectionTitle><HistoryTable rows={report.summaryHistory} /></section> : null}
      {report.live ? <section className="player-pdf-live-summary"><strong>Registro en vivo</strong><span>{report.live.eventCount} eventos · {report.live.summary}</span></section> : null}
      <a className="player-pdf-app-link" href="https://appcaudal.vercel.app" target="_blank" rel="noreferrer">Abrir APPCAUDAL ↗</a>
      <ReportFooter report={report} page={1} />
    </article>
  );
}

function SocietyPanel({ society }) {
  const rows = safeRows(society).filter((row) => Number(row.total) > 0);
  if (!rows.length) return null;
  const maxTotal = Math.max(1, ...rows.map((row) => Number(row.total)));
  const assistants = rows.filter((row) => Number(row.received) > 0).sort((a, b) => Number(b.received) - Number(a.received));
  const recipients = rows.filter((row) => Number(row.given) > 0).sort((a, b) => Number(b.given) - Number(a.given));
  const topAssociation = rows[0];
  return (
    <section className="player-pdf-section player-pdf-society">
      <SectionTitle number="05">Sociedad ofensiva</SectionTitle>
      <div className="player-pdf-society-headlines"><div><span>Mayor asociación</span><strong>{topAssociation.name}</strong><b>{topAssociation.total} conexiones</b></div>{assistants[0] ? <div><span>Más asistencias recibidas</span><strong>{assistants[0].name}</strong><b>{assistants[0].received} asistencias</b></div> : null}</div>
      <div className="player-pdf-society-columns">
        <div><h3>Conexiones principales</h3>{rows.slice(0, 4).map((row) => <div className="player-pdf-society-row" key={row.name}><span>{row.name}</span><i><b style={{ width: `${Number(row.total) / maxTotal * 100}%` }} /></i><strong>{row.total}</strong></div>)}</div>
        {assistants.length ? <div><h3>Principales asistentes</h3>{assistants.slice(0, 3).map((row) => <p key={row.name}><span>{row.name}</span><strong>{row.received}</strong></p>)}</div> : null}
        {recipients.length ? <div><h3>Asistencias dadas a</h3>{recipients.slice(0, 3).map((row) => <p key={row.name}><span>{row.name}</span><strong>{row.given}</strong></p>)}</div> : null}
      </div>
    </section>
  );
}

function ProductionPage({ report }) {
  const hasInfluence = report.influenceZones.some((zone) => Number(zone.count) > 0);
  const hasGoalZones = report.goalZones.some((zone) => Number(zone.count) > 0);
  return (
    <article className="player-pdf-page player-pdf-production-page" data-player-pdf-page="production">
      <ReportHeader report={report} section="Análisis ofensivo" />
      <div className="player-pdf-production-layout">
        <section className="player-pdf-section player-pdf-map-panel"><SectionTitle number="04">Mapa de influencia</SectionTitle><p className="player-pdf-section-note">Acciones · {report.filters.influence}</p>{hasInfluence ? <ZoneGrid zones={report.influenceZones} /> : <p className="player-pdf-empty-line">Sin zonas registradas</p>}</section>
        <div className="player-pdf-production-column">
          <section className="player-pdf-section player-pdf-production-card"><SectionTitle compact>Producción ofensiva</SectionTitle><div className="player-pdf-production-metrics"><div><span>Goles/90</span><strong>{report.production.goalsPer90}</strong></div><div><span>Asistencias/90</span><strong>{report.production.assistsPer90}</strong></div><div><span>Participación directa</span><strong>{report.production.directGoalParticipation}</strong></div></div></section>
          {report.goalPhases.length ? <section className="player-pdf-section player-pdf-phases"><SectionTitle compact>Tipo de gol</SectionTitle>{report.goalPhases.map((phase) => <div key={phase.phase} className="player-pdf-bar-row"><span>{phase.phase}</span><i><b style={{ width: `${phase.percentage}%` }} /></i><strong>{phase.count}</strong></div>)}</section> : null}
          {hasGoalZones ? <section className="player-pdf-section player-pdf-goal-panel"><SectionTitle compact>Diana de finalización</SectionTitle><ZoneGrid zones={report.goalZones} goal /></section> : null}
        </div>
      </div>
      <SocietyPanel society={report.society} />
      <Timeline groups={report.timeline} />
      <ActionsLibrary actions={report.productionActions} />
      <ReportFooter report={report} page={2} />
    </article>
  );
}

function OverflowPage({ report }) {
  return (
    <article className="player-pdf-page player-pdf-overflow-page" data-player-pdf-page="overflow">
      <ReportHeader report={report} section="Archivo de acciones" />
      <ActionsLibrary actions={report.overflowActions} number="08" />
      {report.overflowHistory.length ? <section className="player-pdf-section player-pdf-history"><SectionTitle number="09">Continuación del historial</SectionTitle><HistoryTable rows={report.overflowHistory} /></section> : null}
      <ReportFooter report={report} page={3} />
    </article>
  );
}

export default function PlayerProfilePdfReport({ report }) {
  if (!report) return null;
  return (
    <section className="player-profile-print-portal print-dossier-portal" aria-label={`Informe PDF de ${report.identity.name}`}>
      <div className="player-profile-pdf-report" data-player-pdf-report="true" data-page-count={report.pagePlan.length}>
        <SummaryPage report={report} />
        <ProductionPage report={report} />
        {report.pagePlan.includes('overflow') ? <OverflowPage report={report} /> : null}
      </div>
    </section>
  );
}
