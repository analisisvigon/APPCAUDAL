import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import {
  getSetPieceChronology,
  getSetPieceResponsibilities,
  getSetPieceTacticalMeta,
} from '../../utils/setPieceProfessional';

const formatDate = (value) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const splitLines = (value) => String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

function TextBlock({ label, value, fallback = 'Sin definir' }) {
  const lines = splitLines(value);
  return (
    <section className="set-piece-pro-block">
      <h3>{label}</h3>
      {lines.length ? lines.map((line, index) => <p key={`${label}-${index}`}>{line}</p>) : <p className="set-piece-pro-empty">{fallback}</p>}
    </section>
  );
}

export default function SetPieceDiagramPrintSheet({ match, title = 'ABP', diagrams = [], players = [], preview = false }) {
  return (
    <>
      {diagrams.map((diagram, index) => {
        const meta = getSetPieceTacticalMeta(diagram.elements);
        const responsibilities = getSetPieceResponsibilities(diagram.elements, players);
        const chronology = getSetPieceChronology(diagram.elements, players);
        const variantText = meta.variants
          .filter((variant) => variant.changes)
          .map((variant) => `${variant.name}: ${variant.changes}`)
          .join('\n') || meta.variation;
        return (
          <article key={diagram.id || `${diagram.tipo}-${diagram.orden}-${index}`} className={`lineup-print-sheet print-sheet-a4 diagram-print-sheet diagram-print-landscape set-piece-pro-sheet set-piece-preview-sheet ${preview ? 'set-piece-is-preview' : ''}`}>
            <header className="set-piece-pro-header">
              <div>
                <p className="set-piece-pro-kicker">C.D. Caudal de Mieres · Ficha táctica</p>
                <h1>{diagram.titulo || `Jugada ${diagram.orden || index + 1}`}</h1>
              </div>
              <div className="set-piece-pro-meta">
                <strong>{title}</strong>
                <span>{match?.isHome ? `C.D. Caudal - ${match?.opponent || 'Rival'}` : `${match?.opponent || 'Rival'} - C.D. Caudal`}</span>
                <span>{formatDate(match?.date)} · Jugada {diagram.orden || index + 1}</span>
              </div>
            </header>

            <div className="set-piece-pro-objective">
              <span>Objetivo</span>
              <strong>{meta.objective || diagram.consigna || 'Objetivo pendiente de definir'}</strong>
              {meta.tags.length ? <em>{meta.tags.slice(0, 4).join(' · ')}</em> : null}
            </div>

            <div className="set-piece-pro-main">
              <section className="set-piece-pro-pitch" aria-label="Diagrama táctico optimizado para impresión">
                <SetPieceDiagramCanvas
                  elements={diagram.elements}
                  players={players}
                  fullField={String(diagram.tipo || '').includes('saque_inicio')}
                  readOnly
                  printOptimized
                />
              </section>
              <aside className="set-piece-pro-sidebar">
                <TextBlock label="Cuándo utilizarla" value={meta.whenToUse} />
                <section className="set-piece-pro-block set-piece-pro-responsibilities">
                  <h3>Responsables</h3>
                  {responsibilities.length ? responsibilities.slice(0, 9).map((item, itemIndex) => (
                    <div key={`${item.role}-${item.playerName}-${itemIndex}`}>
                      <span>{item.role}</span>
                      <strong>{item.playerName}{item.primary ? ' · P' : ''}</strong>
                    </div>
                  )) : <p className="set-piece-pro-empty">Sin roles asignados</p>}
                </section>
                <TextBlock label="Consigna general" value={diagram.consigna || meta.generalInstruction} />
              </aside>
            </div>

            {chronology.length ? (
              <section className="set-piece-pro-timeline">
                <h3>Cronología</h3>
                <ol>{chronology.slice(0, 10).map((step) => <li key={step.id}><b>{step.order}</b><span><strong>{step.playerName}</strong> {step.instruction}</span></li>)}</ol>
              </section>
            ) : null}

            <div className="set-piece-pro-footer-grid">
              <TextBlock label="Variante" value={variantText} />
              <TextBlock label="Riesgo" value={meta.risk} />
              <TextBlock label="Observaciones" value={meta.observations} fallback="Sin observaciones" />
            </div>
          </article>
        );
      })}
    </>
  );
}
