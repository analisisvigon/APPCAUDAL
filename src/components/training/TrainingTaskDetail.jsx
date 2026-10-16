import TrainingTaskBoardEditor from './TrainingTaskBoardEditor';
import TrainingTaskMediaPanel from './TrainingTaskMediaPanel';
import {
  TRAINING_TASK_PHASES,
  formatTrainingTaskPlayers,
  formatTrainingTaskSpace,
  getTrainingTaskMomentLabel,
  getTrainingTaskStageLabel,
  getTrainingTaskTypeDefinition,
} from '../../utils/trainingTasks';
import { readTrainingTaskEditorPayload } from '../../utils/trainingTaskEditorPayload';

const EMPTY_VALUE = 'Sin completar';

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';
const displayValue = (value) => hasValue(value) ? value : EMPTY_VALUE;

const formatDate = (value) => {
  if (!value) return EMPTY_VALUE;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? EMPTY_VALUE
    : new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(date);
};

const formatFileSize = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return EMPTY_VALUE;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('es-ES')} KB`;
};

function DetailIcon({ kind }) {
  if (kind === 'time') return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  if (kind === 'space') return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></svg>;
  if (kind === 'rating') return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9Z" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M15 15c3 0 5 2 5 5" /></svg>;
}

function Metric({ kind, label, value, detail = '' }) {
  return <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] p-3.5">
    <div className="flex items-center gap-2 text-caudal-electric"><DetailIcon kind={kind} /><p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p></div>
    <p className="mt-2 break-words text-lg font-black text-white">{displayValue(value)}</p>
    {detail ? <p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p> : null}
  </div>;
}

function ContentBlock({ eyebrow, title, children, className = '' }) {
  return <section className={`rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4 sm:p-5 ${className}`}>
    {eyebrow ? <p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">{eyebrow}</p> : null}
    <h3 className="mt-1 text-base font-black text-white">{title}</h3>
    <div className="mt-3 text-sm leading-6 text-slate-300">{children}</div>
  </section>;
}

function LabeledValue({ label, value, className = '' }) {
  return <div className={className}>
    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">{label}</p>
    <p className={`mt-1 whitespace-pre-wrap break-words text-sm leading-6 ${hasValue(value) ? 'text-slate-200' : 'italic text-slate-600'}`}>{displayValue(value)}</p>
  </div>;
}

export default function TrainingTaskDetail({
  task,
  currentUserId = '',
  players = [],
  client,
  feedbackContent = null,
  onEdit,
  onDuplicate,
  onDownload,
  onMediaChange,
  onClose,
}) {
  const canEdit = task.author_user_id === currentUserId;
  const type = getTrainingTaskTypeDefinition(task.taskType);
  const phaseLabel = TRAINING_TASK_PHASES.find((phase) => phase.value === task.gamePhase)?.label || '';
  const momentLabel = getTrainingTaskMomentLabel(task.gamePhase, task.gameMoment) || task.gameMoment || '';
  const stages = Array.isArray(task.stageKeys) ? task.stageKeys.map(getTrainingTaskStageLabel) : [];
  const parsedBoard = readTrainingTaskEditorPayload(task.editorPayload ?? task.editor_payload);
  const assignedPlayers = parsedBoard.kind === 'v1' && Array.isArray(parsedBoard.scene.assignments?.players)
    ? parsedBoard.scene.assignments.players.length
    : 0;
  const playersLabel = formatTrainingTaskPlayers(task);
  const spaceLabel = formatTrainingTaskSpace(task);
  const ratingLabel = Number(task.ratingCount) > 0 && Number.isFinite(Number(task.ratingAverage))
    ? `${Number(task.ratingAverage).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5`
    : EMPTY_VALUE;
  const ownership = canEdit
    ? task.isShared ? 'Tarea propia compartida' : 'Tarea propia privada'
    : 'Compartida contigo';
  const author = canEdit ? 'Tú' : 'Miembro del cuerpo técnico';

  return <article className="min-w-0 overflow-hidden rounded-[1.55rem] border border-caudal-electric/20 bg-[linear-gradient(145deg,rgba(8,24,45,.98),rgba(5,13,25,.98))] shadow-[0_24px_70px_rgba(0,0,0,.32)]" aria-labelledby="training-task-detail-title">
    <header className="border-b border-white/10 bg-[radial-gradient(circle_at_85%_0%,rgba(61,217,255,.11),transparent_40%)] p-4 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: type.color, borderColor: `${type.color}66`, backgroundColor: `${type.color}18` }}>{type.label}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-300">{ownership}</span>
            {!canEdit ? <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">Solo lectura</span> : null}
          </div>
          <h2 id="training-task-detail-title" className="mt-3 break-words text-2xl font-black leading-tight text-white sm:text-3xl">{task.name}</h2>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
            <span><strong className="text-slate-200">Código:</strong> {displayValue(task.taskCode)}</span>
            <span><strong className="text-slate-200">Autor:</strong> {author}</span>
            <span><strong className="text-slate-200">Creada:</strong> {formatDate(task.created_at)}</span>
            <span><strong className="text-slate-200">Actualizada:</strong> {formatDate(task.updated_at)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {stages.length ? stages.map((stage) => <span key={stage} className="rounded-lg bg-caudal-electric/10 px-2.5 py-1 text-[10px] font-black text-caudal-electric">{stage}</span>) : <span className="text-xs italic text-slate-600">Etapas: {EMPTY_VALUE}</span>}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 xl:w-auto xl:justify-end">
          {canEdit ? <button type="button" onClick={() => onEdit?.(task)} className="min-h-11 flex-1 rounded-xl bg-caudal-electric px-4 text-xs font-black text-slate-950 sm:flex-none">Editar tarea</button> : null}
          <button type="button" onClick={() => onDuplicate?.(task)} className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.07] px-4 text-xs font-black text-white sm:flex-none">Duplicar</button>
          {task.attachmentPath ? <button type="button" onClick={() => onDownload?.(task)} className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.07] px-4 text-xs font-black text-caudal-electric sm:flex-none">Descargar adjunto</button> : null}
          <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black text-slate-300 sm:flex-none">Volver</button>
        </div>
      </div>
    </header>

    <div className="space-y-5 p-4 sm:p-6">
      <section aria-label="Resumen de la tarea" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Jugadores" value={playersLabel} detail={assignedPlayers ? `${assignedPlayers} asignados en la pizarra` : ''} />
        <Metric kind="time" label="Duración" value={hasValue(task.durationMinutes) ? `${task.durationMinutes} min` : ''} />
        <Metric kind="space" label="Espacio" value={spaceLabel} detail={spaceLabel ? `${task.spaceWidthM} m de ancho · ${task.spaceLengthM} m de largo` : ''} />
        <Metric kind="rating" label="Valoración POST" value={ratingLabel} detail={Number(task.feedbackCount) > 0 ? `${task.feedbackCount} ${Number(task.feedbackCount) === 1 ? 'experiencia' : 'experiencias'}` : 'Sin experiencias registradas'} />
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(480px,0.95fr)] xl:items-start">
        <div className="grid min-w-0 gap-4">
          <ContentBlock eyebrow="Objetivo principal" title="Qué queremos entrenar">
            <p className={hasValue(task.objective) ? 'whitespace-pre-wrap text-base leading-7 text-white' : 'italic text-slate-600'}>{displayValue(task.objective)}</p>
          </ContentBlock>

          <ContentBlock eyebrow="Desarrollo" title="Descripción de la tarea">
            <p className={hasValue(task.description) ? 'whitespace-pre-wrap' : 'italic text-slate-600'}>{displayValue(task.description)}</p>
          </ContentBlock>

          <ContentBlock eyebrow="Organización" title="Formato, tiempo y espacio">
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledValue label="Formato de jugadores" value={task.playersSpec} />
              <LabeledValue label="Duración" value={hasValue(task.durationMinutes) ? `${task.durationMinutes} min` : ''} />
              <LabeledValue label="Jugadores mínimos" value={task.playersMin} />
              <LabeledValue label="Jugadores máximos" value={task.playersMax} />
              <LabeledValue label="Ancho" value={hasValue(task.spaceWidthM) ? `${task.spaceWidthM} m` : ''} />
              <LabeledValue label="Largo" value={hasValue(task.spaceLengthM) ? `${task.spaceLengthM} m` : ''} />
            </div>
          </ContentBlock>

          <ContentBlock eyebrow="Contenido" title="Información técnica y táctica">
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledValue label="Fase del juego" value={phaseLabel} />
              <LabeledValue label="Momento / subfase" value={momentLabel} />
              <LabeledValue label="Contenido técnico" value={task.technicalContent} />
              <LabeledValue label="Contenido táctico" value={task.tacticalContent} />
            </div>
          </ContentBlock>

          <ContentBlock eyebrow="Aplicación" title="Materiales, observaciones y variantes">
            <div className="grid gap-4">
              <LabeledValue label="Material" value={task.material} />
              <LabeledValue label="Observaciones" value={task.observations} />
              <LabeledValue label="Variantes y progresiones" value={task.variants} />
            </div>
          </ContentBlock>

          <ContentBlock eyebrow="Recurso legacy" title="Archivo adjunto">
            {task.attachmentPath ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-black text-white">{displayValue(task.attachmentName)}</p>
                <p className="mt-1 text-xs text-slate-500">{displayValue(task.attachmentMime)} · {formatFileSize(task.attachmentSize)}</p>
              </div>
              <button type="button" onClick={() => onDownload?.(task)} className="min-h-10 shrink-0 rounded-xl bg-white/10 px-3 text-xs font-black text-caudal-electric">Descargar</button>
            </div> : <p className="italic text-slate-600">{EMPTY_VALUE}</p>}
          </ContentBlock>
        </div>

        <aside className="grid min-w-0 gap-4 xl:sticky xl:top-4">
          <section className="min-w-0 rounded-[1.2rem] border border-caudal-electric/20 bg-[#06111f] p-2 sm:p-3" aria-label="Pizarra táctica de la tarea">
            {parsedBoard.kind === 'empty' ? <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/15 px-5 text-center"><div><p className="text-sm font-black text-white">Pizarra táctica</p><p className="mt-2 text-xs text-slate-500">Sin completar</p></div></div> : <TrainingTaskBoardEditor key={task.id} players={players} payload={task.editorPayload ?? task.editor_payload} readOnly />}
          </section>

          <ContentBlock eyebrow="Recursos" title="Multimedia asociada" className="min-w-0">
            <TrainingTaskMediaPanel key={`media-${task.id}`} client={client} task={task} canManage={false} onChange={onMediaChange} embedded />
          </ContentBlock>
        </aside>
      </div>

      <section className="rounded-[1.2rem] border border-amber-300/15 bg-amber-300/[0.035] p-4 sm:p-5" aria-label="Información POST de la tarea">
        <div className="border-b border-white/10 pb-4">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200">Después de realizarla</p>
          <h3 className="mt-1 text-lg font-black text-white">POST · Evaluación y seguimiento</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Historial separado de la planificación original de la tarea.</p>
        </div>
        {feedbackContent}
      </section>
    </div>
  </article>;
}
