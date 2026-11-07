import { createPortal } from 'react-dom';
import { OWN_CLUB_IDENTITY } from '../../constants/clubIdentity';
import {
  TRAINING_TASK_PHASES,
  formatTrainingTaskPlayers,
  formatTrainingTaskSpace,
  getTrainingTaskMomentLabel,
} from '../../utils/trainingTasks';
import TrainingTaskBoardPreview from './TrainingTaskBoardPreview';
import './trainingTaskBatchPrint.css';

const value = (input) => String(input ?? '').trim();
const shown = (input) => value(input) || '—';
const formatDate = (input) => {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(date);
};

function PrintText({ label, children, wide = false }) {
  return <div className={`task-export-field${wide ? ' task-export-field-wide' : ''}`}>
    <h3>{label}</h3><p>{shown(children)}</p>
  </div>;
}

function TaskSheet({ task, index, total, playerLookup }) {
  const phase = TRAINING_TASK_PHASES.find((entry) => entry.value === task.gamePhase)?.label || task.gamePhase;
  const moment = getTrainingTaskMomentLabel(task.gamePhase, task.gameMoment) || task.gameMoment;
  const hasBoard = Boolean(task.editorPayload && Object.keys(task.editorPayload).length);
  const duration = task.seriesCount !== '' && task.minutesPerSeries !== ''
    ? `${task.seriesCount} series × ${task.minutesPerSeries} min · ${shown(task.durationMinutes)} min totales`
    : task.durationMinutes !== '' ? `${task.durationMinutes} min` : '—';
  const playersNumber = task.playersMin !== '' || task.playersMax !== ''
    ? `${shown(task.playersMin)}–${shown(task.playersMax)}` : formatTrainingTaskPlayers(task);
  const dimensions = task.spaceWidthM !== '' || task.spaceLengthM !== ''
    ? `${shown(task.spaceWidthM)} × ${shown(task.spaceLengthM)} m` : formatTrainingTaskSpace(task);
  return <article className="task-export-sheet">
    <header className="task-export-header">
      <div><p>{OWN_CLUB_IDENTITY.name} · Biblioteca de tareas</p><h1>{shown(task.name)}</h1></div>
      <div className="task-export-page"><strong>{index + 1}/{total}</strong><span>Creada {formatDate(task.created_at)}</span></div>
    </header>
    <section className="task-export-summary">
      <PrintText label="Organización / formato">{task.playersSpec}</PrintText>
      <PrintText label="Número de jugadores">{playersNumber}</PrintText>
      <PrintText label="Series y duración">{duration}</PrintText>
      <PrintText label="Dimensiones">{dimensions}</PrintText>
    </section>
    <section className="task-export-content">
      <PrintText label="Objetivo" wide>{task.objective}</PrintText>
      <PrintText label="Descripción" wide>{task.description}</PrintText>
      <PrintText label="Reglas" wide>{task.exerciseRules}</PrintText>
      <PrintText label="Contenido técnico">{task.technicalContent}</PrintText>
      <PrintText label="Contenido táctico general (heredado)">{task.tacticalContent}</PrintText>
      <PrintText label="Contenido táctico ofensivo">{task.tacticalOffensiveContent}</PrintText>
      <PrintText label="Contenido táctico defensivo">{task.tacticalDefensiveContent}</PrintText>
      <PrintText label="Fase y momento">{[phase, moment].filter(value).join(' · ')}</PrintText>
      <PrintText label="Material">{task.material}</PrintText>
      <PrintText label="Observaciones" wide>{task.observations}</PrintText>
    </section>
    <section className="task-export-board" aria-label="Pizarra de la tarea">
      <h2>Pizarra</h2>
      {hasBoard ? <TrainingTaskBoardPreview payload={task.editorPayload} playerLookup={playerLookup} />
        : <div className="task-export-board-empty">Sin diseño de pizarra</div>}
    </section>
  </article>;
}

export function TrainingTaskBatchPrintPages({ tasks = [], playerLookup }) {
  return tasks.map((task, index) => <TaskSheet key={task.id} task={task} index={index} total={tasks.length} playerLookup={playerLookup} />);
}

export default function TrainingTaskBatchPrint({ tasks = [], playerLookup, printRef }) {
  if (!tasks.length || typeof document === 'undefined') return null;
  return createPortal(<div className="task-export-portal" ref={printRef}>
    <style media="print">{'@page { size: A4 portrait; margin: 0; }'}</style>
    <TrainingTaskBatchPrintPages tasks={tasks} playerLookup={playerLookup} />
  </div>, document.body);
}
