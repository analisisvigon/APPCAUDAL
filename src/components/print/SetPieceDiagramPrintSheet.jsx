import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import {
  getSetPieceChronology,
  getSetPieceTacticalMeta,
} from '../../utils/setPieceProfessional';

const formatDate = (value) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const getMatchLabel = (match) => (
  match?.isHome
    ? `C.D. Caudal - ${match?.opponent || 'Rival'}`
    : `${match?.opponent || 'Rival'} - C.D. Caudal`
);

function PrintPlay({ diagram, players, fallbackOrder }) {
  const meta = getSetPieceTacticalMeta(diagram.elements);
  const chronology = getSetPieceChronology(diagram.elements, players);
  const order = Number(diagram.orden) || fallbackOrder;
  const instruction = diagram.consigna || meta.generalInstruction || meta.objective || 'Consigna pendiente de definir';

  return (
    <section className="set-piece-print-play" data-play-order={order}>
      <header className="set-piece-print-play-header">
        <div>
          <p>Jugada {order}</p>
          <h2>{diagram.titulo || `Jugada ${order}`}</h2>
        </div>
        <strong>{meta.objective || instruction}</strong>
      </header>

      <div className="set-piece-print-play-body">
        <div className="set-piece-print-pitch" aria-label={`Geometría táctica de la jugada ${order}`}>
          <SetPieceDiagramCanvas
            elements={diagram.elements}
            players={players}
            fullField={String(diagram.tipo || '').includes('saque_inicio')}
            readOnly
            printOptimized
            identityMode={meta.printIdentityMode}
          />
        </div>

        <div className="set-piece-print-copy">
          <section>
            <h3>Consigna</h3>
            <p className="set-piece-print-instruction">{instruction}</p>
          </section>

          {chronology.length ? (
            <section className="set-piece-print-chronology">
              <h3>Cronología</h3>
              <ol>
                {chronology.map((step) => (
                  <li key={step.id}>
                    <b>{step.order}</b>
                    <span><strong>{step.playerName}</strong> {step.instruction}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {meta.alternative ? (
            <section className="set-piece-print-alternative">
              <h3>Alternativa</h3>
              <p>{meta.alternative}</p>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function SetPieceDiagramPrintSheet({ match, title = 'ABP', diagrams = [], players = [], preview = false }) {
  const pageDiagrams = diagrams.slice(0, 2);
  if (!pageDiagrams.length) return null;

  return (
    <article className={`lineup-print-sheet print-sheet-a4 diagram-print-sheet diagram-print-landscape set-piece-pro-sheet ${preview ? 'set-piece-preview-sheet set-piece-is-preview' : ''}`}>
      <header className="set-piece-print-sheet-header">
        <div>
          <p>C.D. Caudal de Mieres · Dossier ABP</p>
          <h1>{title}</h1>
        </div>
        <div>
          <strong>{getMatchLabel(match)}</strong>
          <span>{formatDate(match?.date)}</span>
        </div>
      </header>

      <div className="set-piece-pro-plays" data-count={pageDiagrams.length}>
        {pageDiagrams.map((diagram, index) => (
          <PrintPlay
            key={diagram.id || `${diagram.tipo}-${diagram.orden}-${index}`}
            diagram={diagram}
            players={players}
            fallbackOrder={index + 1}
          />
        ))}
      </div>
    </article>
  );
}
