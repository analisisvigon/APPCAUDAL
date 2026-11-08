import { createPortal } from 'react-dom';
import { TRAINING_TASK_PHASES, getTrainingTaskMomentLabel, getTrainingTaskTypeDefinition, getTrainingTaskStageLabel } from '../../utils/trainingTasks';
import { readTrainingTaskEditorPayload } from '../../utils/trainingTaskEditorPayload';
import { getPlannedSessionBoardTeams } from '../../utils/plannedSessionBoardTeams';
import { printableMediaUrl } from '../../utils/trainingTaskPrintData';
import TrainingTaskDiagramCanvas from './TrainingTaskDiagramCanvas';
import './trainingTaskBatchPrint.css';

const has = (input) => input !== null && input !== undefined && String(input).trim() !== '';
const date = (input) => {
  if (!input) return '';
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(input) ? input + 'T12:00:00' : input);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(parsed);
};
function PrintText({ label, children }) {
  if (!has(children)) return null;
  return <div className={`task-export-field${label === 'Objetivo principal' ? ' task-export-objective' : ''}`}><h3>{label}</h3><p>{children}</p></div>;
}
export function TrainingTaskPrintSheet({ task, index = 0, total = 1, playerLookup }) {
  const phase = TRAINING_TASK_PHASES.find((entry) => entry.value === task.gamePhase)?.label || task.gamePhase;
  const moment = getTrainingTaskMomentLabel(task.gamePhase, task.gameMoment) || task.gameMoment;
  const parsed = readTrainingTaskEditorPayload(task.editorPayload);
  const pitchType = parsed.kind === 'v1' ? (parsed.scene.board.pitchType === 'penalty-area' ? 'half' : parsed.scene.board.pitchType) : '';
  const spaceRatio = Number(task.spaceWidthM) > 0 && Number(task.spaceLengthM) > 0
    ? Number(task.spaceWidthM) / Number(task.spaceLengthM) : null;
  const boardLayout = spaceRatio && spaceRatio >= 0.82 && spaceRatio <= 1.18 ? 'square'
    : pitchType === 'half' ? 'half' : 'wide';
  const teams = getPlannedSessionBoardTeams(task.editorPayload);
  const content = [
    ['Objetivo principal', task.objective], ['Descripción y desarrollo', task.description],
    ['Reglas del ejercicio', task.exerciseRules], ['Contenido técnico', task.technicalContent],
    ['Contenido táctico ofensivo', task.tacticalOffensiveContent],
    ['Contenido táctico defensivo', task.tacticalDefensiveContent],
    ['Contenido táctico general (heredado)', task.tacticalContent],
    ['Fase y momento del juego', [phase, moment].filter(has).join(' · ')],
    ['Material', task.material], ['Variantes y progresiones', task.variants], ['Observaciones', task.observations],
  ].filter(([, text]) => has(text));
  const organization = [
    ['Formato', task.playersSpec],
    ['Número de jugadores', has(task.playersMin) && has(task.playersMax)
      ? task.playersMin === task.playersMax ? String(task.playersMin) : task.playersMin + '–' + task.playersMax
      : has(task.playersMin) ? 'Desde ' + task.playersMin : has(task.playersMax) ? 'Hasta ' + task.playersMax : ''],
    ['Series', task.seriesCount], ['Minutos por serie', task.minutesPerSeries],
    ['Duración total', has(task.durationMinutes) ? task.durationMinutes + ' min' : ''],
    ['Espacio', [has(task.spaceWidthM) ? 'Ancho ' + task.spaceWidthM + ' m' : '', has(task.spaceLengthM) ? 'Largo ' + task.spaceLengthM + ' m' : ''].filter(has).join(' · ')],
  ].filter(([, text]) => has(text));
  return <article className="task-export-sheet" data-task-id={task.id}>
    <header className="task-export-header">
      <p>NEXO CLUB · Biblioteca de tareas · Ficha {index + 1} de {total}</p>
      <h1>{task.name}</h1>
      <p>{[task.taskCode && 'Código: ' + task.taskCode, task.taskType && getTrainingTaskTypeDefinition(task.taskType).label,
        (task.stageKeys || []).map(getTrainingTaskStageLabel).join(', ')].filter(has).join(' · ')}</p>
      {task.created_at ? <p>Creada {date(task.created_at)}</p> : null}
    </header>
    {organization.length ? <section className="task-export-summary" aria-label="Organización">
      {organization.map(([label, text]) => <PrintText key={label} label={label}>{text}</PrintText>)}
    </section> : null}
    <div className={`task-export-main${parsed.kind === 'empty' && !teams.length ? ' task-export-no-board' : ''}`} data-board-layout={boardLayout}>
    <div className="task-export-visual">
    {parsed.kind === 'v1' ? <section className="task-export-board" data-pitch-type={pitchType}><h2>Diseño de la tarea</h2>
      <TrainingTaskDiagramCanvas elements={parsed.scene.board.elements} pitchType={pitchType}
        players={playerLookup} readOnly renderMode="preview" />
    </section> : parsed.kind !== 'empty' ? <p>Pizarra guardada en un formato no compatible con esta versión.</p> : null}
    {teams.map((team) => <PrintText key={team.key} label={team.teamName + ' · ' + team.colorName}>{team.players.join(', ')}</PrintText>)}
    </div>
    <div className="task-export-content">
    {content.map(([label, text]) => <PrintText key={label} label={label}>{text}</PrintText>)}
    </div>
    </div>
    <footer className="task-export-footer">
    {task.media?.length || task.attachmentName ? <section>
      <h2>Multimedia y archivos</h2>
      {(task.media || []).map((media) => {
        const url = printableMediaUrl(media);
        return <div className="task-export-resource" key={media.id}>
          <h3>{media.title || media.originalName || ({ video: 'Vídeo', image: 'Imagen', document: 'Documento', link: 'Enlace' }[media.kind])}</h3>
          <p>{[media.kind, media.provider, media.mimeType, media.sizeBytes ? Math.ceil(media.sizeBytes / 1024) + ' KB' : '', media.isPrimary ? 'Recurso principal' : ''].filter(has).join(' · ')}</p>
          {media.originalName && media.title ? <p>{media.originalName}</p> : null}
          {media.caption ? <p>{media.caption}</p> : null}
          {url ? <a href={url}>{media.kind === 'video' ? 'Ver vídeo' : 'Ver recurso'}</a> : <p>Consultar este recurso desde Multimedia en NEXO CLUB con una cuenta autorizada.</p>}
        </div>;
      })}
      {task.attachmentName ? <PrintText label="Adjunto anterior">{[task.attachmentName, task.attachmentMime, task.attachmentSize ? Math.ceil(task.attachmentSize / 1024) + ' KB' : '', 'Disponible en la ficha con acceso autorizado.'].filter(has).join(' · ')}</PrintText> : null}
    </section> : null}
    {task.feedback?.length ? <section className="task-export-post"><h2>POST · Evaluación posterior</h2>
      {task.feedback.map((entry, feedbackIndex) => <div className="task-export-feedback" key={entry.id}>
        <h3>Registro {feedbackIndex + 1} · {date(entry.usedOn)}{has(entry.rating) ? ' · Valoración ' + entry.rating + '/5' : ''}</h3>
        {entry.post ? <p>{entry.post}</p> : null}
      </div>)}
    </section> : null}
    </footer>
  </article>;
}
export function TrainingTaskBatchPrintPages({ tasks = [], playerLookup }) {
  return tasks.map((task, index) => <TrainingTaskPrintSheet key={task.id} task={task} index={index} total={tasks.length} playerLookup={playerLookup} />);
}
export default function TrainingTaskBatchPrint({ tasks = [], playerLookup, printRef }) {
  if (!tasks.length || typeof document === 'undefined') return null;
  return createPortal(<div className="task-export-portal" ref={printRef}>
    <TrainingTaskBatchPrintPages tasks={tasks} playerLookup={playerLookup} />
  </div>, document.body);
}
