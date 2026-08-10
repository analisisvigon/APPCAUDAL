import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import { buildSetPiecePrintPages } from '../../utils/setPiecePrintModel';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).trim();
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const getMatchLabel = (match) => {
  const opponent = String(match?.opponent || '').trim();
  if (!opponent) return '';
  return match?.isHome ? `C.D. Caudal - ${opponent}` : `${opponent} - C.D. Caudal`;
};

function PrintDetail({ label, value, className = '' }) {
  if (!value) return null;
  return <section className={className}><h3>{label}</h3><p>{value}</p></section>;
}

function PrintPlay({ play }) {
  const hasChronology = play.chronology.length > 0;
  const chronologyIds = new Set(play.chronology.map((step) => step.id));
  const indications = play.displayLayers.chronology
    ? play.individualInstructions.filter((item) => !chronologyIds.has(item.id))
    : play.individualInstructions;
  const hasIndications = indications.length > 0;
  const hasOperationalDetails = Boolean(play.objective || play.whenToUse || play.risk || play.alternative || play.observations);
  const hasCopy = Boolean(play.instruction || hasChronology || hasIndications || hasOperationalDetails);
  const bodyClassName = [
    'set-piece-print-play-body',
    !play.instruction && !hasChronology ? 'set-piece-print-play-body--field-forward' : '',
    !hasCopy ? 'set-piece-print-play-body--field-only' : '',
  ].filter(Boolean).join(' ');
  return (
    <section className="set-piece-print-play" data-play-order={play.order} data-play-id={play.id || ''} data-has-chronology={hasChronology ? 'true' : 'false'}>
      <header className="set-piece-print-play-header">
        <div className="set-piece-print-play-heading">
          <div className="set-piece-print-play-kicker"><strong>{play.typeLabel}</strong><span>Jugada {play.order}</span></div>
          <h2>{play.title}</h2>
          {play.headerFacts.length ? <div className="set-piece-print-header-facts">{play.headerFacts.map((fact) => <span key={fact.id}><b>{fact.label}:</b><strong>{fact.value}</strong></span>)}</div> : null}
        </div>
      </header>

      <div className={bodyClassName}>
        <div className="set-piece-print-pitch" aria-label={`Geometría táctica de la jugada ${play.order}`}>
          <SetPieceDiagramCanvas
            elements={play.elements}
            players={[]}
            fullField={play.fullField}
            readOnly
            printOptimized
            preparedForPrint
            visibleLayers={play.displayLayers}
          />
        </div>

        {hasCopy ? <aside className="set-piece-print-copy" aria-label={`Información operativa de la jugada ${play.order}`}>
          {play.instruction ? <section className="set-piece-print-consigna"><h3>Consigna</h3><p>{play.instruction}</p></section> : null}

          {play.chronology.length ? (
            <section className="set-piece-print-chronology">
              <h3>Secuencia</h3>
              <ol>
                {play.chronology.map((step) => (
                  <li key={step.id}>
                    <b>{step.order}</b>
                    <div>
                      <p className="set-piece-print-step-identity">{step.identity ? <strong>{step.identity}</strong> : null}{step.role ? <span>{step.identity ? ' · ' : ''}{step.role}</span> : null}{step.instruction ? <span className="set-piece-print-step-instruction">{step.identity || step.role ? ' — ' : ''}{step.instruction}</span> : null}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {hasIndications ? (
            <section className="set-piece-print-indications">
              <h3>Indicaciones</h3>
              <ul>
                {indications.map((item) => (
                  <li key={item.id}>
                    {item.identity ? <strong>{item.identity}</strong> : null}
                    {item.role ? <span className="set-piece-print-indication-role">{item.identity ? ' · ' : ''}{item.role}</span> : null}
                    {item.instruction ? <span className="set-piece-print-indication-text">{item.identity || item.role ? ' — ' : ''}{item.instruction}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasOperationalDetails ? <div className="set-piece-print-operational-details">
            <PrintDetail label="Clave" value={play.objective} />
            <PrintDetail label="Cuándo" value={play.whenToUse} />
            <PrintDetail label="Riesgo" value={play.risk} className="set-piece-print-risk" />
            <PrintDetail label="Alternativa" value={play.alternative} />
            <PrintDetail label="Observaciones" value={play.observations} />
          </div> : null}
        </aside> : null}
      </div>
    </section>
  );
}

export default function SetPieceDiagramPrintSheet({ match, title = 'ABP', diagrams = [], players = [], preview = false }) {
  const pages = buildSetPiecePrintPages(diagrams, players);
  if (!pages.length) return null;
  const matchLabel = getMatchLabel(match);
  const matchDate = formatDate(match?.date);

  return (
    <>
      {pages.map((page) => {
        const pageKey = `${title}-${page.pageNumber}-${page.plays.map((play) => play.id || `${play.typeLabel}-${play.order}`).join('-')}`;
        return (
          <article key={pageKey} data-render-model="set-piece-print" className={`lineup-print-sheet print-sheet-a4 diagram-print-sheet diagram-print-landscape set-piece-pro-sheet abp-print-page ${preview ? 'set-piece-preview-sheet set-piece-is-preview' : ''}`}>
            <header className="set-piece-print-sheet-header">
              <p>C.D. Caudal de Mieres · Dossier ABP</p>
              {(matchLabel || matchDate) ? <div>{matchLabel ? <strong>{matchLabel}</strong> : null}{matchDate ? <span>{matchDate}</span> : null}</div> : null}
            </header>

            <div className="set-piece-pro-plays" data-count={page.plays.length} data-page-number={page.pageNumber}>
              {page.plays.map((play) => <PrintPlay key={play.id || `${play.typeLabel}-${play.order}`} play={play} />)}
            </div>
          </article>
        );
      })}
    </>
  );
}
