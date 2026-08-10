import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import {
  buildMatchPlanPages,
  getMatchPlanInstructions,
  getMatchPlanPhaseLabel,
} from '../../utils/matchPlanPrint';
import { getDrawableSetPieceElements, getSetPieceTacticalMeta } from '../../utils/setPieceProfessional';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

function MatchPlanSituationPrint({ situation }) {
  const meta = getSetPieceTacticalMeta(situation.elements);
  const instructions = getMatchPlanInstructions(situation).filter((instruction) => instruction.text);
  return (
    <section className="match-plan-print-situation" data-situation-id={situation.id} data-has-keys={instructions.length ? 'true' : 'false'}>
      <header>
        <p>{getMatchPlanPhaseLabel(situation)}</p>
        <h2>{situation.titulo || 'Situación táctica'}</h2>
        {meta.objective ? <div className="match-plan-print-objective"><strong>Objetivo</strong><span>{meta.objective}</span></div> : null}
      </header>
      <div className="match-plan-print-pitch" aria-label={`Dibujo táctico: ${situation.titulo || 'situación'}`}>
        <SetPieceDiagramCanvas
          elements={getDrawableSetPieceElements(situation.elements)}
          players={[]}
          fullField
          readOnly
          visibleLayers={meta.displayLayers}
        />
      </div>
      {instructions.length ? (
        <section className="match-plan-print-keys">
          <h3>Claves</h3>
          <ol>{instructions.map((instruction) => <li key={instruction.id}>{instruction.text}</li>)}</ol>
        </section>
      ) : null}
    </section>
  );
}

export default function MatchPlanPrintSheet({ match, situations = [], preview = false }) {
  const pages = buildMatchPlanPages(situations);
  if (!pages.length) return null;
  const opponent = String(match?.opponent || '').trim();
  const matchLabel = opponent ? (match?.isHome ? `C.D. Caudal - ${opponent}` : `${opponent} - C.D. Caudal`) : '';
  return (
    <>
      {pages.map((page) => (
        <article key={`match-plan-${page.pageNumber}`} data-render-model="match-plan-print" className={`lineup-print-sheet print-sheet-a4 match-plan-print-sheet ${preview ? 'match-plan-is-preview' : ''}`}>
          <header className="match-plan-print-page-header">
            <p>C.D. Caudal de Mieres · Plan de partido</p>
            <div>{matchLabel ? <strong>{matchLabel}</strong> : null}{match?.date ? <span>{formatDate(match.date)}</span> : null}</div>
          </header>
          <div className="match-plan-print-situations" data-count={page.situations.length} data-page-number={page.pageNumber}>
            {page.situations.map((situation) => <MatchPlanSituationPrint key={situation.id} situation={situation} />)}
          </div>
        </article>
      ))}
    </>
  );
}
