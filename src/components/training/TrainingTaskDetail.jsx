import { useState } from 'react';
import TrainingTaskBoardEditor from './TrainingTaskBoardEditor';
import TrainingTaskMediaPanel, { TrainingTaskFeaturedMedia } from './TrainingTaskMediaPanel';
import TrainingTaskTeamsPanel from './TrainingTaskTeamsPanel';
import {
  TRAINING_TASK_PHASES,
  formatTrainingTaskPlayers,
  formatTrainingTaskSpace,
  getTrainingTaskMomentLabel,
  getTrainingTaskStageLabel,
  getTrainingTaskTypeDefinition,
} from '../../utils/trainingTasks';
import { readTrainingTaskEditorPayload } from '../../utils/trainingTaskEditorPayload';
import { selectTrainingTaskFeaturedMedia } from '../../utils/trainingTaskMedia';

const EMPTY_VALUE = '—';
const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';
const displayValue = (value, emptyValue = EMPTY_VALUE) => hasValue(value) ? value : emptyValue;

const formatDate = (value) => {
  if (!value) return EMPTY_VALUE;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? EMPTY_VALUE : new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(date);
};

const formatFileSize = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return EMPTY_VALUE;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('es-ES')} KB`;
};

function DetailIcon({ kind }) {
  if (kind === 'time') return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  if (kind === 'space') return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></svg>;
  if (kind === 'rating') return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9Z" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M15 15c3 0 5 2 5 5" /></svg>;
}

function Metric({ kind, label, value, detail = '' }) {
  return <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5">
    <span className="shrink-0 text-caudal-electric"><DetailIcon kind={kind} /></span>
    <div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="truncate text-sm font-black text-white" title={String(displayValue(value))}>{displayValue(value)}</p>{detail ? <p className="truncate text-[9px] text-slate-500" title={detail}>{detail}</p> : null}</div>
  </div>;
}

function LabeledValue({ label, value, className = '' }) {
  return <div className={className}><p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">{label}</p><p className={`mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 ${hasValue(value) ? 'text-slate-200' : 'italic text-slate-600'}`}>{displayValue(value, 'Sin definir')}</p></div>;
}

export function TrainingTaskDetailAccordion({ sectionKey, title, summary, isOpen, onToggle, children }) {
  const panelId = `training-task-detail-${sectionKey}`;
  return <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
    <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={onToggle} className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-caudal-electric">
      <span className="min-w-0"><span className="block text-sm font-black text-white">{title}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{summary}</span></span>
      <span aria-hidden="true" className={`shrink-0 text-lg font-black text-caudal-electric transition-transform ${isOpen ? 'rotate-45' : ''}`}>+</span>
    </button>
    {isOpen ? <div id={panelId} role="region" aria-label={title} className="border-t border-white/10 px-4 py-4">{children}</div> : null}
  </section>;
}

export default function TrainingTaskDetail({ task = null, currentUserId = '', players = [], client, feedbackContent = null, onEdit, onDuplicate, onDownload, onMediaChange, onClose }) {
  const [openSections, setOpenSections] = useState({});
  const toggleSection = (sectionKey) => setOpenSections((current) => ({ ...current, [sectionKey]: !current[sectionKey] }));

  if (!task) return <section role="status" className="rounded-2xl border border-white/10 p-5 text-sm text-slate-400">No hay una tarea seleccionada.</section>;

  const canEdit = task.author_user_id === currentUserId;
  const type = getTrainingTaskTypeDefinition(task.taskType);
  const phaseLabel = task.gamePhase ? TRAINING_TASK_PHASES.find((phase) => phase.value === task.gamePhase)?.label || task.gamePhase : '';
  const momentLabel = getTrainingTaskMomentLabel(task.gamePhase, task.gameMoment) || task.gameMoment || '';
  const stages = Array.isArray(task.stageKeys) ? task.stageKeys.map(getTrainingTaskStageLabel) : [];
  const parsedBoard = readTrainingTaskEditorPayload(task.editorPayload ?? task.editor_payload);
  const assignments = parsedBoard.kind === 'v1' && Array.isArray(parsedBoard.scene.assignments?.players) ? parsedBoard.scene.assignments.players : [];
  const assignedTeams = new Set(assignments.map((entry) => entry?.teamKey).filter(Boolean)).size;
  const hasPlayerRange = hasValue(task.playersMin) || hasValue(task.playersMax);
  const playersLabel = hasValue(task.playersMin) && hasValue(task.playersMax)
    ? task.playersMin === task.playersMax ? String(task.playersMin) : `${task.playersMin}–${task.playersMax}`
    : hasValue(task.playersMin) ? `Desde ${task.playersMin}`
      : hasValue(task.playersMax) ? `Hasta ${task.playersMax}` : formatTrainingTaskPlayers(task);
  const spaceLabel = formatTrainingTaskSpace(task);
  const ratingLabel = Number(task.ratingCount) > 0 && Number.isFinite(Number(task.ratingAverage)) ? `${Number(task.ratingAverage).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5` : EMPTY_VALUE;
  const ownership = canEdit ? task.isShared ? 'Tarea propia compartida' : 'Tarea propia privada' : 'Compartida contigo';
  const author = canEdit ? 'Tú' : 'Miembro del cuerpo técnico';
  const mediaCount = Array.isArray(task.media) ? task.media.length : 0;
  const featuredMedia = selectTrainingTaskFeaturedMedia(Array.isArray(task.media) ? task.media : []);
  const hasOrganization = [task.playersSpec, task.playersMin, task.playersMax, task.spaceWidthM, task.spaceLengthM].some(hasValue);
  const hasTechnicalContent = [task.gamePhase, task.gameMoment, task.technicalContent, task.tacticalContent, task.material].some(hasValue);
  const hasOrganizationDetails = assignments.length > 0;
  const hasContentDetails = hasValue(task.variants);
  const mediaSummary = `${mediaCount} ${mediaCount === 1 ? 'recurso' : 'recursos'}${task.attachmentPath ? ' · adjunto legacy' : ''}`;
  const feedbackSummary = Number(task.feedbackCount) > 0 ? `${task.feedbackCount} ${Number(task.feedbackCount) === 1 ? 'experiencia' : 'experiencias'} · ${ratingLabel}` : 'Sin experiencias registradas';

  return <article className="w-full min-w-0 overflow-hidden rounded-[1.35rem] border border-caudal-electric/20 bg-[linear-gradient(145deg,rgba(8,24,45,.98),rgba(5,13,25,.98))] shadow-[0_24px_70px_rgba(0,0,0,.32)] xl:ml-[calc((100%-min(96rem,100vw-4rem))/2)] xl:w-[min(96rem,calc(100vw-4rem))]" aria-labelledby="training-task-detail-title">
    <header className="border-b border-white/10 bg-[radial-gradient(circle_at_85%_0%,rgba(61,217,255,.10),transparent_40%)] px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: type.color, borderColor: `${type.color}66`, backgroundColor: `${type.color}18` }}>{type.label}</span>
            {stages.map((stage) => <span key={stage} className="rounded-full bg-caudal-electric/10 px-2.5 py-1 text-[9px] font-black text-caudal-electric">{stage}</span>)}
            {!stages.length ? <span className="text-[10px] italic text-slate-600">Etapa sin definir</span> : null}
            {!canEdit ? <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">Solo lectura</span> : null}
          </div>
          <h2 id="training-task-detail-title" className="mt-2 break-words text-2xl font-black leading-tight text-white sm:text-[1.7rem]">{displayValue(task.name, 'Tarea sin nombre')}</h2>
          <p className="mt-1 text-[11px] text-slate-500"><span className="font-bold text-slate-300">{displayValue(task.taskCode, 'Sin código')}</span> · {author} · {ownership}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
          {canEdit ? <button type="button" onClick={() => onEdit?.(task)} className="min-h-10 flex-1 rounded-xl bg-caudal-electric px-4 text-xs font-black text-slate-950 sm:flex-none">Editar tarea</button> : null}
          <button type="button" onClick={() => onDuplicate?.(task)} className="min-h-10 flex-1 rounded-xl border border-white/10 bg-white/[0.07] px-4 text-xs font-black text-white sm:flex-none">Duplicar</button>
          <button type="button" onClick={onClose} className="min-h-10 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black text-slate-300 sm:flex-none">Volver</button>
        </div>
      </div>
    </header>

    <div className="space-y-3 p-3.5 sm:p-4">
      <section aria-label="Resumen de la tarea" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Jugadores" value={playersLabel} detail={assignments.length ? `${assignments.length} asignados${assignedTeams ? ` · ${assignedTeams} grupos` : ''}` : ''} />
        <Metric kind="time" label="Duración" value={hasValue(task.durationMinutes) ? `${task.durationMinutes} min` : ''} />
        <Metric kind="space" label="Espacio" value={spaceLabel} />
        <Metric kind="rating" label="Valoración POST" value={ratingLabel} detail={Number(task.feedbackCount) > 0 ? `${task.feedbackCount} ${Number(task.feedbackCount) === 1 ? 'experiencia' : 'experiencias'}` : ''} />
      </section>

      <div className="flex min-w-0 flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,0.43fr)_minmax(0,0.57fr)] lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
          <section className="order-1 min-w-0 rounded-[1.1rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Objetivo principal</p><p className={`mt-1.5 whitespace-pre-wrap text-base leading-6 ${hasValue(task.objective) ? 'font-semibold text-white' : 'italic text-slate-600'}`}>{displayValue(task.objective, 'Sin definir')}</p></div>
            <div className="mt-3 border-t border-white/10 pt-3"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Descripción y desarrollo</p><p className={`mt-1.5 whitespace-pre-wrap text-sm leading-6 ${hasValue(task.description) ? 'text-slate-300' : 'italic text-slate-600'}`}>{displayValue(task.description, 'Sin definir')}</p></div>
            {hasValue(task.observations) ? <div className="mt-3 border-t border-white/10 pt-3"><LabeledValue label="Consignas / observaciones" value={task.observations} /></div> : null}
          </section>

          {hasOrganization ? <section className="order-3 min-w-0 rounded-[1.1rem] border border-white/10 bg-white/[0.03] p-4" aria-label="Organización de la tarea">
            <h3 className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Organización</h3>
            <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
              <LabeledValue label="Formato de jugadores" value={task.playersSpec} />
              <LabeledValue label="Mínimo / máximo" value={hasPlayerRange ? `${displayValue(task.playersMin)} / ${displayValue(task.playersMax)}` : ''} />
              <LabeledValue label="Ancho / largo" value={hasValue(task.spaceWidthM) || hasValue(task.spaceLengthM) ? `${hasValue(task.spaceWidthM) ? `${task.spaceWidthM} m` : EMPTY_VALUE} / ${hasValue(task.spaceLengthM) ? `${task.spaceLengthM} m` : EMPTY_VALUE}` : ''} />
            </div>
          </section> : null}

          {hasTechnicalContent ? <section className="order-4 min-w-0 rounded-[1.1rem] border border-white/10 bg-white/[0.03] p-4" aria-label="Contenido técnico y táctico de la tarea">
            <h3 className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Contenido técnico y táctico</h3>
            <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <LabeledValue label="Fase del juego" value={phaseLabel} />
              <LabeledValue label="Momento / subfase" value={momentLabel} />
              <LabeledValue label="Contenido técnico" value={task.technicalContent} />
              <LabeledValue label="Contenido táctico" value={task.tacticalContent} />
              <LabeledValue label="Material" value={task.material} className="sm:col-span-2" />
            </div>
          </section> : null}

          {featuredMedia ? <div className="order-5 min-w-0 rounded-[1.1rem] border border-white/10 bg-white/[0.03] px-4 pb-4"><TrainingTaskFeaturedMedia client={client} media={featuredMedia} /></div> : null}
        </div>

        <section className="order-2 min-w-0 rounded-[1.1rem] border border-caudal-electric/20 bg-[#06111f] p-1.5 sm:p-2 lg:order-none" aria-label="Pizarra táctica de la tarea">
          {parsedBoard.kind === 'empty' ? <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/15 px-5 text-center"><div><p className="text-sm font-black text-white">Pizarra táctica</p><p className="mt-1 text-xs text-slate-600">Sin diseño guardado</p></div></div> : <TrainingTaskBoardEditor key={task.id} players={players} payload={task.editorPayload ?? task.editor_payload} readOnly />}
        </section>
      </div>

      <div className="grid gap-2">
        {hasOrganizationDetails ? <TrainingTaskDetailAccordion sectionKey="organization" title="Organización detallada" summary={`${assignments.length} jugadores asignados a la pizarra`} isOpen={Boolean(openSections.organization)} onToggle={() => toggleSection('organization')}>
          <TrainingTaskTeamsPanel players={players} assignments={parsedBoard.scene.assignments} elements={parsedBoard.scene.board.elements} readOnly />
        </TrainingTaskDetailAccordion> : null}

        {hasContentDetails ? <TrainingTaskDetailAccordion sectionKey="content" title="Contenido técnico y táctico" summary="Variantes y progresiones" isOpen={Boolean(openSections.content)} onToggle={() => toggleSection('content')}>
          <LabeledValue label="Variantes y progresiones" value={task.variants} />
        </TrainingTaskDetailAccordion> : null}

        <TrainingTaskDetailAccordion sectionKey="media" title="Multimedia y archivos" summary={mediaSummary} isOpen={Boolean(openSections.media)} onToggle={() => toggleSection('media')}>
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.35fr)]">
            <TrainingTaskMediaPanel key={`media-${task.id}`} client={client} task={task} canManage={false} onChange={onMediaChange} embedded />
            <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Adjunto legacy</p>{task.attachmentPath ? <div className="mt-2"><p className="break-words text-sm font-black text-white">{displayValue(task.attachmentName, 'Archivo adjunto')}</p><p className="mt-1 text-[11px] text-slate-500">{displayValue(task.attachmentMime)} · {formatFileSize(task.attachmentSize)}</p><button type="button" onClick={() => onDownload?.(task)} className="mt-3 min-h-9 rounded-lg bg-white/10 px-3 text-[10px] font-black text-caudal-electric">Descargar</button></div> : <p className="mt-2 text-xs italic text-slate-600">Sin adjunto legacy</p>}</div>
          </div>
        </TrainingTaskDetailAccordion>

        <TrainingTaskDetailAccordion sectionKey="post" title="POST — Evaluación y seguimiento" summary={feedbackSummary} isOpen={Boolean(openSections.post)} onToggle={() => toggleSection('post')}>{feedbackContent || <p className="text-xs italic text-slate-600">Sin información POST.</p>}</TrainingTaskDetailAccordion>

        <TrainingTaskDetailAccordion sectionKey="additional" title="Información adicional" summary={`Creada ${formatDate(task.created_at)} · actualizada ${formatDate(task.updated_at)}`} isOpen={Boolean(openSections.additional)} onToggle={() => toggleSection('additional')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><LabeledValue label="Código" value={task.taskCode} /><LabeledValue label="Procedencia" value={ownership} /><LabeledValue label="Fecha de creación" value={formatDate(task.created_at)} /><LabeledValue label="Última actualización" value={formatDate(task.updated_at)} /></div>
        </TrainingTaskDetailAccordion>
      </div>
    </div>
  </article>;
}
