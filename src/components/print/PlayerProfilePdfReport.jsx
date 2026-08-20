const safeRows = (value) => Array.isArray(value) ? value : [];

function ReportHeader({ report, section }) {
  return (
    <header className="player-pdf-running-header">
      <div>
        <p>C.D. Caudal de Mieres · Informe individual</p>
        <strong>{report.identity.name}</strong>
      </div>
      <span>{section}</span>
    </header>
  );
}

function ReportFooter({ report, page }) {
  return (
    <footer className="player-pdf-footer">
      <span>{report.filters.competition} · {report.filters.venue}</span>
      <span>Página {page} de {report.pagePlan.length}</span>
    </footer>
  );
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

function SummaryPage({ report }) {
  const initials = String(report.identity.name || '').split(/\s+/).map((part) => part[0]).join('').slice(0, 2);
  return (
    <article className="player-pdf-page player-pdf-summary-page" data-player-pdf-page="summary">
      <ReportHeader report={report} section="Resumen" />
      <section className="player-pdf-identity">
        <div className="player-pdf-photo">
          {report.identity.image ? <img src={report.identity.image} alt={report.identity.name} /> : <span>{initials}</span>}
        </div>
        <div>
          <p className="player-pdf-kicker">Perfil competitivo</p>
          <h1>{report.identity.name}</h1>
          <div className="player-pdf-identity-facts">
            <strong>#{report.identity.number}</strong>
            <span>{report.identity.position}</span>
            <span>{report.identity.age}</span>
            <span>Pie {report.identity.foot}</span>
          </div>
        </div>
        <div className="player-pdf-filter-card">
          <span>Filtro aplicado</span>
          <strong>{report.filters.competition}</strong>
          <p>{report.filters.venue}</p>
        </div>
      </section>

      <section className="player-pdf-section">
        <div className="player-pdf-section-title"><span>01</span><h2>Resumen estadístico</h2></div>
        <div className="player-pdf-metric-grid">
          {report.metrics.map((metric) => (
            <div key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.detail ? <small>{metric.detail}</small> : null}
            </div>
          ))}
        </div>
      </section>

      {report.seasonStages.length ? (
        <section className="player-pdf-section">
          <div className="player-pdf-section-title"><span>02</span><h2>Evolución de temporada</h2></div>
          <div className="player-pdf-season-strip">
            {report.seasonStages.map((stage) => (
              <div key={stage.label}>
                <strong>{stage.label}</strong>
                <span>{stage.minutes}' · {stage.matches} PJ</span>
                <span>Nota {stage.rating} · Impacto {stage.impact}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {report.live ? (
        <section className="player-pdf-live-summary">
          <strong>Registro en vivo</strong>
          <span>{report.live.eventCount} eventos revisados · {report.live.summary}</span>
        </section>
      ) : null}
      <a className="player-pdf-app-link" href="https://appcaudal.vercel.app" target="_blank" rel="noreferrer">Abrir APPCAUDAL</a>
      <ReportFooter report={report} page={1} />
    </article>
  );
}

function ProductionPage({ report }) {
  const hasInfluence = report.influenceZones.some((zone) => Number(zone.count) > 0);
  const hasGoalZones = report.goalZones.some((zone) => Number(zone.count) > 0);
  return (
    <article className="player-pdf-page player-pdf-production-page" data-player-pdf-page="production">
      <ReportHeader report={report} section="Producción y mapa" />
      <div className="player-pdf-production-layout">
        <section className="player-pdf-section player-pdf-map-panel">
          <div className="player-pdf-section-title"><span>03</span><h2>Mapa de influencia</h2></div>
          <p className="player-pdf-section-note">Acciones: {report.filters.influence}</p>
          {hasInfluence ? <ZoneGrid zones={report.influenceZones} /> : <p className="player-pdf-empty-line">Sin zonas de influencia registradas.</p>}
        </section>

        <div className="player-pdf-production-column">
          <section className="player-pdf-section">
            <div className="player-pdf-section-title"><span>04</span><h2>Producción ofensiva</h2></div>
            <div className="player-pdf-production-metrics">
              <div><span>Goles/90</span><strong>{report.production.goalsPer90}</strong></div>
              <div><span>Asistencias/90</span><strong>{report.production.assistsPer90}</strong></div>
              <div><span>Participación directa</span><strong>{report.production.directGoalParticipation}</strong></div>
            </div>
          </section>

          {report.goalPhases.length ? (
            <section className="player-pdf-section player-pdf-phases">
              <div className="player-pdf-section-title compact"><h2>Tipo de gol</h2></div>
              {report.goalPhases.map((phase) => (
                <div key={phase.phase} className="player-pdf-bar-row">
                  <span>{phase.phase}</span><i><b style={{ width: `${phase.percentage}%` }} /></i><strong>{phase.count}</strong>
                </div>
              ))}
            </section>
          ) : null}

          {hasGoalZones ? (
            <section className="player-pdf-section player-pdf-goal-panel">
              <div className="player-pdf-section-title compact"><h2>Diana de finalización</h2></div>
              <ZoneGrid zones={report.goalZones} goal />
            </section>
          ) : null}
        </div>
      </div>

      {report.society.length ? (
        <section className="player-pdf-section player-pdf-society">
          <div className="player-pdf-section-title"><span>05</span><h2>Sociedad ofensiva</h2></div>
          <div className="player-pdf-society-grid">
            {report.society.slice(0, 6).map((row, index) => (
              <div key={row.name}>
                <span>{index === 0 ? 'Mayor asociación' : row.name}</span>
                <strong>{index === 0 ? row.name : row.total}</strong>
                <small>Recibe {row.received} · Asiste {row.given}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <ReportFooter report={report} page={2} />
    </article>
  );
}

function DetailsPage({ report }) {
  return (
    <article className="player-pdf-page player-pdf-details-page" data-player-pdf-page="details">
      <ReportHeader report={report} section="Acciones e historial" />
      {report.timeline.length ? (
        <section className="player-pdf-section player-pdf-timeline-section">
          <div className="player-pdf-section-title"><span>06</span><h2>Impacto en el tiempo</h2></div>
          <div className="player-pdf-timeline">
            {[0, 15, 30, 45, 60, 75, 90].map((minute) => <i key={minute} style={{ left: `${minute / 90 * 100}%` }}><small>{minute}'</small></i>)}
            {report.timeline.map((group) => (
              <span key={group.minute} style={{ left: `${Math.min(100, Number(group.minute) / 90 * 100)}%` }} title={group.events.map((event) => event.type).join(' · ')}>
                {group.events[0]?.label || group.events[0]?.type?.slice(0, 3)}{group.events.length > 1 ? `+${group.events.length - 1}` : ''}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {report.actions.length ? (
        <section className="player-pdf-section player-pdf-actions">
          <div className="player-pdf-section-title"><span>07</span><h2>Videoteca de acciones</h2></div>
          <div className="player-pdf-action-grid">
            {report.actions.map((action) => (
              <article key={action.id || `${action.type}-${action.minute}-${action.opponent}`}>
                <div><strong>{action.type} · {action.minute}'</strong><span>vs {action.opponent} · {action.competition}</span></div>
                {action.description ? <p>{action.description}</p> : null}
                {action.url ? <a href={action.url} target="_blank" rel="noreferrer">Abrir vídeo</a> : <small>Sin enlace registrado</small>}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {report.history.length ? (
        <section className="player-pdf-section player-pdf-history">
          <div className="player-pdf-section-title"><span>08</span><h2>Historial partido a partido</h2></div>
          <table>
            <colgroup><col className="date" /><col className="opponent" /><col className="score" /><col className="competition" /><col className="venue" /><col className="role" /><col className="number" /><col className="number" /><col className="number" /><col className="number" /><col className="cards" /><col className="injury" /></colgroup>
            <thead><tr><th>Fecha</th><th>Rival</th><th>Res.</th><th>Competición</th><th>L/V</th><th>Rol</th><th>Min</th><th>Nota</th><th>G</th><th>A</th><th>Tarj.</th><th>Les.</th></tr></thead>
            <tbody>
              {report.history.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td><td>{row.opponent}</td><td>{row.result}</td><td>{row.competition}</td><td>{row.venue}</td><td>{row.role}</td><td>{row.minutes}</td><td>{row.rating}</td>
                  <td>{row.goalLinks.length ? <a href={row.goalLinks[0]} target="_blank" rel="noreferrer">{row.goals}↗</a> : row.goals}</td>
                  <td>{row.assistLinks.length ? <a href={row.assistLinks[0]} target="_blank" rel="noreferrer">{row.assists}↗</a> : row.assists}</td>
                  <td>{row.cards}</td><td>{row.injury}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
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
        {report.pagePlan.includes('details') ? <DetailsPage report={report} /> : null}
      </div>
    </section>
  );
}
