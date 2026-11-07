import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import TrainingTaskBoardEditor from './TrainingTaskBoardEditor';
import TrainingTaskCardPreview from './TrainingTaskCardPreview';
import TrainingTaskDetail from './TrainingTaskDetail';
import TrainingTaskMediaPanel from './TrainingTaskMediaPanel';
import TrainingTaskBatchPrint from './TrainingTaskBatchPrint';
import { buildTrainingTaskCardPresentation } from '../../utils/trainingTaskCardPresentation';
import { createTrainingTaskPlayerLookup } from '../../utils/trainingTaskRoster';
import { countActiveTrainingTaskAdvancedFilters } from '../../utils/trainingTaskFilterPresentation';
import {
  TRAINING_TASK_MOMENTS,
  TRAINING_TASK_PHASES,
  TRAINING_TASK_STAGES,
  TRAINING_TASK_TYPES,
  createTrainingTaskDraft,
  trainingTaskCalculatedDuration,
  createTrainingTaskFilters,
  filterTrainingTasks,
  getTrainingTaskTypeDefinition,
  trainingTaskToDraft,
  validateTrainingTaskDraft,
} from '../../utils/trainingTasks';
import { duplicateTrainingTask, loadTrainingTasks, shareTrainingTask } from '../../utils/trainingTaskStore';
import {
  listTrainingTasksForExport,
  trainingTaskExportFileName,
} from '../../utils/trainingTaskBatchExport';
import { deleteTrainingTaskWithFiles, saveTrainingTaskWithFile, TRAINING_TASK_BUCKET } from '../../utils/trainingTaskFiles';
import { checkPlannedTaskSeries, checkPlannedTaskContent } from '../../data/plannedSessionsStore';
import {
  createTrainingTaskFeedbackDraft,
  summarizeTrainingTaskRatings,
  trainingTaskFeedbackToDraft,
  validateTrainingTaskFeedback,
} from '../../utils/trainingTaskFeedback';
import {
  createTrainingTaskFeedback,
  deleteTrainingTaskFeedback,
  loadTrainingTaskFeedback,
  updateTrainingTaskFeedback,
} from '../../utils/trainingTaskFeedbackStore';

const BUCKET = TRAINING_TASK_BUCKET;
const formatDate = (value) => value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const formatFileSize = (value) => value ? `${Math.max(1, Math.round(Number(value) / 1024))} KB` : '';
const TASK_SECTIONS = [
  ['information', 'Información'],
  ['organization', 'Organización'],
  ['content', 'Contenido'],
  ['design', 'Diseño'],
  ['media', 'Multimedia'],
  ['post', 'POST'],
];

function Field({ label, children, hint }) {
  return <label className="grid min-w-0 gap-1.5"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>{children}{hint ? <span className="text-[10px] text-slate-600">{hint}</span> : null}</label>;
}

function TaskSectionNavigation({ active, onChange, prefix }) {
  return <nav aria-label="Apartados de la tarea" className="mt-4 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-black/20 p-1.5 sm:grid-cols-3 lg:shrink-0 xl:grid-cols-6" role="tablist">
    {TASK_SECTIONS.map(([key, label], index) => <button key={key} id={`${prefix}-tab-${key}`} type="button" role="tab" aria-selected={active === key} aria-controls={`${prefix}-panel-${key}`} onClick={() => onChange(key)} className={`min-h-10 min-w-0 rounded-xl px-2 py-2 text-[10px] font-black uppercase tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric ${active === key ? 'bg-caudal-electric text-slate-950 shadow-sm' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}><span className="mr-1 opacity-60">{index + 1}.</span>{label}</button>)}
  </nav>;
}

function TaskSectionPanel({ active, section, prefix, children, className = '' }) {
  if (active !== section) return null;
  return <div id={`${prefix}-panel-${section}`} role="tabpanel" aria-labelledby={`${prefix}-tab-${section}`} tabIndex="0" className={`mt-4 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/60 ${className}`}>{children}</div>;
}

function SectionHeading({ eyebrow, title, description }) {
  return <div className="mb-4 lg:shrink-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">{eyebrow}</p><h3 className="mt-1 text-lg font-black text-white">{title}</h3>{description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}</div>;
}

function TaskForm({ draft, setDraft, onCancel, onSave, saving, error, isEditing, players, task, onMediaChange, feedback, seriesSupported, contentSupported }) {
  const [activeSection, setActiveSection] = useState('information');
  const moments = TRAINING_TASK_MOMENTS[draft.gamePhase] || [];
  const inputClass = 'min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60';
  return <section className={`rounded-[1.35rem] border border-white/10 bg-[#071327]/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] ${activeSection === 'design' ? 'lg:flex lg:h-[calc(100dvh-2rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden' : ''}`} aria-label={activeSection === 'design' ? 'Diseño de la tarea' : undefined} aria-labelledby={activeSection === 'design' ? undefined : 'training-task-form-title'}>
    <div className={`flex shrink-0 items-start justify-between gap-3 ${activeSection === 'design' ? 'lg:hidden' : ''}`}><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">{isEditing ? 'Editar tarea' : 'Nueva tarea'}</p><h2 id="training-task-form-title" className="mt-1 text-xl font-black text-white">Ficha de entrenamiento</h2></div><button type="button" onClick={onCancel} className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300">Cerrar</button></div>
    {error ? <p role="alert" className="mt-3 rounded-xl border border-red-200/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100">{error}</p> : null}
    <TaskSectionNavigation active={activeSection} onChange={setActiveSection} prefix="task-form" />
    <TaskSectionPanel active={activeSection} section="information" prefix="task-form"><SectionHeading eyebrow="1 · Información" title="Identidad de la tarea" description="Nombre, clasificación y etapas de aplicación." /><div className="grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><Field label="Nombre *"><input className={`${inputClass} min-h-12 text-base font-black`} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Rondo de tercer hombre" /></Field></div><Field label="Código tarea"><input className={inputClass} value={draft.taskCode} maxLength={40} onChange={(event) => setDraft((current) => ({ ...current, taskCode: event.target.value }))} placeholder="Ej. Vigón" /></Field><Field label="Tipo"><select className={inputClass} value={draft.taskType} onChange={(event) => setDraft((current) => ({ ...current, taskType: event.target.value }))}>{isEditing && getTrainingTaskTypeDefinition(draft.taskType).legacy ? <option value={draft.taskType}>{getTrainingTaskTypeDefinition(draft.taskType).label} (tipo anterior)</option> : null}{TRAINING_TASK_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select></Field><fieldset className="grid gap-2 md:col-span-2"><legend className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Etapas</legend><div className="flex flex-wrap gap-2">{TRAINING_TASK_STAGES.map((stage) => { const selected = draft.stageKeys.includes(stage.key); return <button key={stage.key} type="button" aria-pressed={selected} onClick={() => setDraft((current) => ({ ...current, stageKeys: selected ? current.stageKeys.filter((key) => key !== stage.key) : [...current.stageKeys, stage.key] }))} className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-black ${selected ? 'border-caudal-electric bg-caudal-electric/15 text-caudal-electric' : 'border-white/10 bg-black/20 text-slate-400'}`}>{selected ? '✓ ' : ''}{stage.label}</button>; })}</div></fieldset></div></TaskSectionPanel>
    <TaskSectionPanel active={activeSection} section="organization" prefix="task-form">
      <SectionHeading eyebrow="2 · Organización" title="Formato y espacio" description="Jugadores, tiempo y dimensiones de trabajo." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2"><Field label="Número de jugadores" hint="Admite formatos como 4v4+3"><input className={inputClass} value={draft.playersSpec} onChange={(event) => setDraft((current) => ({ ...current, playersSpec: event.target.value }))} placeholder="8v8+2" /></Field></div>
        <Field label="N.º de series"><input type="number" min="1" step="1" inputMode="numeric" className={inputClass} value={draft.seriesCount} disabled={!seriesSupported} onChange={(event) => setDraft((current) => ({ ...current, seriesCount: event.target.value }))} /></Field>
        <Field label="Minutos por serie"><input type="number" min="1" step="1" inputMode="numeric" className={inputClass} value={draft.minutesPerSeries} disabled={!seriesSupported} onChange={(event) => setDraft((current) => ({ ...current, minutesPerSeries: event.target.value }))} /></Field>
        <Field label="Duración total (min)" hint={draft.seriesCount || draft.minutesPerSeries ? 'Calculada como series × minutos.' : 'Si no hay series, introduce una duración simple.'}><input type="number" min="1" step="1" inputMode="numeric" className={inputClass} value={trainingTaskCalculatedDuration(draft) ?? (draft.seriesCount || draft.minutesPerSeries ? '' : draft.durationMinutes)} readOnly={Boolean(draft.seriesCount || draft.minutesPerSeries)} onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value }))} /></Field>
        <Field label="Ancho (m)"><input type="number" min="1" step="1" inputMode="numeric" className={inputClass} value={draft.spaceWidthM} onChange={(event) => setDraft((current) => ({ ...current, spaceWidthM: event.target.value }))} /></Field>
        <Field label="Largo (m)"><input type="number" min="1" step="1" inputMode="numeric" className={inputClass} value={draft.spaceLengthM} onChange={(event) => setDraft((current) => ({ ...current, spaceLengthM: event.target.value }))} /></Field>
      </div>
      {!seriesSupported ? <p className="mt-2 text-xs text-amber-200">Las series estarán disponibles después de instalar y verificar la migración. La duración simple sigue funcionando.</p> : null}
    </TaskSectionPanel>
    <TaskSectionPanel active={activeSection} section="content" prefix="task-form"><SectionHeading eyebrow="3 · Contenido" title="Qué se entrena" description="Objetivo, explicación y contenidos de apoyo." />{!contentSupported ? <p className="mb-3 text-xs text-amber-200">Los tres campos nuevos estarán disponibles tras instalar y verificar su migración.</p> : null}<div className="grid gap-3 md:grid-cols-2"><Field label="Objetivo principal *"><textarea rows="3" className={`${inputClass} min-h-24 resize-y`} value={draft.objective} onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))} placeholder="Qué queremos entrenar" /></Field><Field label="Descripción"><textarea rows="3" className={`${inputClass} min-h-24 resize-y`} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Organización y consignas" /></Field><Field label="Fase del juego"><select className={inputClass} value={draft.gamePhase} onChange={(event) => setDraft((current) => ({ ...current, gamePhase: event.target.value, gameMoment: '' }))}>{TRAINING_TASK_PHASES.map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}</select></Field>{moments.length ? <Field label="Momento / subfase"><select className={inputClass} value={draft.gameMoment} onChange={(event) => setDraft((current) => ({ ...current, gameMoment: event.target.value }))}><option value="">Sin momento</option>{moments.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field> : <div />}<Field label="Contenido técnico"><textarea rows="2" className={`${inputClass} min-h-20 resize-y`} value={draft.technicalContent} onChange={(event) => setDraft((current) => ({ ...current, technicalContent: event.target.value }))} /></Field>{(task?.tacticalContent || task?.tactical_content || draft.tacticalContent) ? <Field label="Contenido táctico general (heredado)"><textarea rows="2" className={`${inputClass} min-h-20 resize-y`} value={draft.tacticalContent} onChange={(event) => setDraft((current) => ({ ...current, tacticalContent: event.target.value }))} /></Field> : null}<Field label="Reglas del ejercicio"><textarea rows="3" maxLength={10000} className={`${inputClass} min-h-24 resize-y`} value={draft.exerciseRules} disabled={!contentSupported} onChange={(event) => setDraft((current) => ({ ...current, exerciseRules: event.target.value }))} /></Field><Field label="Contenido táctico ofensivo"><textarea rows="3" maxLength={10000} className={`${inputClass} min-h-24 resize-y`} value={draft.tacticalOffensiveContent} disabled={!contentSupported} onChange={(event) => setDraft((current) => ({ ...current, tacticalOffensiveContent: event.target.value }))} /></Field><Field label="Contenido táctico defensivo"><textarea rows="3" maxLength={10000} className={`${inputClass} min-h-24 resize-y`} value={draft.tacticalDefensiveContent} disabled={!contentSupported} onChange={(event) => setDraft((current) => ({ ...current, tacticalDefensiveContent: event.target.value }))} /></Field><Field label="Material"><input className={inputClass} value={draft.material} onChange={(event) => setDraft((current) => ({ ...current, material: event.target.value }))} placeholder="Conos, petos..." /></Field><Field label="Observaciones"><textarea rows="2" className={`${inputClass} min-h-16 resize-y`} value={draft.observations} onChange={(event) => setDraft((current) => ({ ...current, observations: event.target.value }))} /></Field><div className="md:col-span-2"><Field label="Variantes"><textarea rows="2" className={`${inputClass} min-h-20 resize-y`} maxLength={10000} value={draft.variants} onChange={(event) => setDraft((current) => ({ ...current, variants: event.target.value }))} placeholder="Modificaciones previstas del ejercicio" /></Field></div>{draft.attachmentName ? <div className="md:col-span-2"><Field label="Adjunto anterior" hint="Se conserva mediante el sistema legacy actual."><span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">{draft.attachmentName} {draft.attachmentSize ? `· ${formatFileSize(draft.attachmentSize)}` : ''}</span></Field></div> : null}</div></TaskSectionPanel>
    <TaskSectionPanel active={activeSection} section="design" prefix="task-form" className="lg:mt-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden"><div className="lg:hidden"><SectionHeading eyebrow="4 · Diseño de la tarea" title="Pizarra, equipos y jugadores" description="Usa el ancho y largo de Organización para acreditar zonas y referencias espaciales." /></div><TrainingTaskBoardEditor viewportFit players={players} payload={draft.editorPayload} spaceWidthM={draft.spaceWidthM} spaceLengthM={draft.spaceLengthM} onPayloadChange={(editorPayload) => setDraft((current) => ({ ...current, editorPayload }))} /></TaskSectionPanel>
    <TaskSectionPanel active={activeSection} section="media" prefix="task-form"><SectionHeading eyebrow="5 · Multimedia" title="Material visual y documentos" description="Imágenes, PDF, vídeos y enlaces de apoyo." />{task ? <TrainingTaskMediaPanel client={supabase} task={task} canManage onChange={onMediaChange} embedded /> : <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-4"><p className="text-sm font-black text-white">Multimedia</p><p className="mt-1 text-xs text-slate-500">Guarda la tarea para añadir contenido multimedia.</p></div>}</TaskSectionPanel>
    <TaskSectionPanel active={activeSection} section="post" prefix="task-form">{task ? <FeedbackPanel {...feedback} /> : <><SectionHeading eyebrow="6 · POST / Experiencia" title="Valoración e historial" /><div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-xs text-slate-500">Guarda la tarea antes de registrar una experiencia.</div></>}</TaskSectionPanel>
    <div className={`sticky bottom-2 z-20 mt-5 flex flex-col-reverse gap-2 rounded-2xl border border-white/10 bg-[#071327]/95 p-2.5 shadow-[0_-10px_35px_rgba(0,0,0,.3)] backdrop-blur sm:flex-row sm:items-center sm:justify-end ${activeSection === 'design' ? 'lg:bottom-0 lg:mt-2 lg:shrink-0' : ''}`}><button type="button" onClick={onCancel} className="min-h-11 rounded-xl bg-white/[0.06] px-4 text-xs font-black text-slate-300">Cancelar</button><button type="button" onClick={onSave} disabled={saving} className="min-h-11 rounded-xl bg-caudal-electric px-5 text-xs font-black text-slate-950 disabled:cursor-wait disabled:opacity-50">{saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear tarea'}</button></div>
  </section>;
}

function RatingStars({ value, onChange = null }) {
  const rating = Number(value) || 0;
  if (!onChange) return <span aria-label={`${rating} de 5 estrellas`} title={`${rating} de 5 estrellas`} className="font-black text-amber-300">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>;
  return <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Valoración de 1 a 5 estrellas">
    {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" aria-label={`${star} de 5 estrellas`} title={`${star} de 5 estrellas`} aria-pressed={rating === star} onClick={() => onChange(star)} className="min-h-11 min-w-11 rounded-lg text-2xl font-black text-amber-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-caudal-electric">{star <= rating ? '★' : '☆'}</button>)}
    <span className="ml-1 text-xs font-bold text-slate-400">{rating ? `${rating}/5` : 'Sin valorar'}</span>
    {rating ? <button type="button" onClick={() => onChange(null)} className="min-h-10 rounded-lg px-2 text-[10px] font-black uppercase text-slate-400 hover:bg-white/10">Quitar</button> : null}
  </div>;
}

function FeedbackPanel({ rows, loading, error, draft, setDraft, editingId, saving, userId, onSave, onEdit, onCancelEdit, onDelete, canManage = true }) {
  const [showForm, setShowForm] = useState(false);
  const summary = summarizeTrainingTaskRatings(rows);
  useEffect(() => { if (editingId) setShowForm(true); }, [editingId]);
  return <section className="mt-5 border-t border-white/10 pt-5" aria-labelledby="training-task-feedback-title">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Historial de uso</p><h3 id="training-task-feedback-title" className="mt-1 text-base font-black text-white">POST · Después de realizarla</h3><p className="mt-1 text-xs text-slate-500">¿Qué funcionó y qué modificarías?</p></div><div className="flex flex-wrap gap-2"><span className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-300">{summary.ratingAverage ? `${summary.ratingAverage.toFixed(1)}/5` : 'Sin valoración'}</span><span className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-400">{rows.length} {rows.length === 1 ? 'registro' : 'registros'}</span>{canManage ? <button type="button" aria-expanded={showForm} onClick={() => setShowForm((current) => !current)} className="min-h-9 rounded-xl bg-caudal-electric px-3 text-xs font-black text-slate-950">{showForm ? 'Ocultar formulario' : '+ Registrar experiencia'}</button> : null}</div></div>
    {canManage && showForm ? <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/15 p-3 md:grid-cols-[160px_1fr]">
      <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Fecha<input type="date" value={draft.usedOn} onChange={(event) => setDraft((current) => ({ ...current, usedOn: event.target.value }))} className="min-h-11 rounded-xl border border-white/10 bg-white px-3 text-sm font-bold text-slate-950" /></label>
      <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Valoración</p><RatingStars value={draft.rating} onChange={(rating) => setDraft((current) => ({ ...current, rating }))} /></div>
      <label className="grid gap-1 md:col-span-2"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">POST</span><textarea maxLength={4000} value={draft.post} onChange={(event) => setDraft((current) => ({ ...current, post: event.target.value }))} placeholder="¿Qué funcionó y qué modificarías?" className="min-h-24 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60" /></label>
      {error ? <p role="alert" className="text-xs font-bold text-red-200 md:col-span-2">{error}</p> : null}
      <div className="flex justify-end gap-2 md:col-span-2">{editingId ? <button type="button" onClick={onCancelEdit} className="min-h-10 rounded-xl bg-white/[0.06] px-3 text-xs font-black text-slate-300">Cancelar edición</button> : null}<button type="button" disabled={saving} onClick={onSave} className="min-h-10 rounded-xl bg-caudal-electric px-4 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar POST'}</button></div>
    </div> : null}
    <div className="mt-4 grid gap-2">{loading ? <p className="text-xs text-slate-500">Cargando historial…</p> : rows.length ? rows.map((entry) => <article key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black text-white">{formatDate(`${entry.usedOn}T00:00:00`)}</p>{entry.rating ? <div className="mt-1 text-sm"><RatingStars value={entry.rating} /> <span className="ml-1 text-xs font-bold text-slate-400">{entry.rating}/5</span></div> : <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">Sin valoración</p>}</div>{canManage && entry.author_user_id === userId ? <div className="flex gap-1"><button type="button" onClick={() => onEdit(entry)} className="min-h-10 rounded-lg px-2 text-[10px] font-black text-slate-300 hover:bg-white/10">Editar</button><button type="button" onClick={() => onDelete(entry)} className="min-h-10 rounded-lg px-2 text-[10px] font-black text-red-200 hover:bg-red-500/10">Eliminar</button></div> : null}</div>{entry.post ? <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-300">{entry.post}</p> : null}</article>) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">Todavía no hay experiencias registradas.</p>}</div>
  </section>;
}

function MetricIcon({ kind }) {
  if (kind === 'time') return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  if (kind === 'space') return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M15 15c3 0 5 2 5 5" /></svg>;
}

function TaskCard({ task, canManage, canDelete, userId, playerLookup, onOpen, onEdit, onDuplicate, onDelete, onShare, onDownload }) {
  const card = buildTrainingTaskCardPresentation(task, userId);
  return <article className="group relative self-start overflow-visible rounded-[1.25rem] border border-white/10 border-t-2 bg-[#091428]/92 shadow-[0_12px_34px_rgba(0,0,0,0.16)] transition duration-200 hover:z-30 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_18px_44px_rgba(0,0,0,.28)] focus-within:z-30" style={{ borderTopColor: card.type.color }}>
    <button type="button" onClick={() => onOpen(task)} aria-label={`Abrir tarea ${task.name}`} className="block w-full overflow-hidden bg-[#081321] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-caudal-electric"><TrainingTaskCardPreview task={task} playerLookup={playerLookup} /></button>
    <div className="p-4"><div className="flex items-start justify-between gap-2"><button type="button" onClick={() => onOpen(task)} className="line-clamp-2 min-w-0 text-left text-xl font-black leading-6 text-white outline-none hover:text-caudal-electric focus-visible:underline">{task.name}</button><details className="relative shrink-0"><summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-base font-black text-slate-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-caudal-electric" aria-label={`Acciones de ${task.name}`}>•••</summary><div className="absolute right-0 z-20 mt-1 grid min-w-36 gap-1 rounded-xl border border-white/10 bg-[#050d18] p-1.5 shadow-2xl"><button type="button" onClick={() => onOpen(task)} className="rounded-lg px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/10">Abrir</button><button type="button" onClick={() => onDuplicate(task)} className="rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-300 hover:bg-white/10">Duplicar</button>{task.attachmentPath ? <button type="button" onClick={() => onDownload(task)} className="rounded-lg px-3 py-2 text-left text-xs font-bold text-caudal-electric hover:bg-white/10">Descargar adjunto</button> : null}{canManage ? <><button type="button" onClick={() => onEdit(task)} className="rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-300 hover:bg-white/10">Editar</button><button type="button" onClick={() => onShare(task)} className="rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-300 hover:bg-white/10">Compartir</button>{canDelete ? <button type="button" onClick={() => onDelete(task)} className="rounded-lg px-3 py-2 text-left text-xs font-bold text-red-200 hover:bg-red-500/10">Eliminar</button> : null}</> : null}</div></details></div>
      <div className="mt-2 flex flex-wrap items-center gap-2"><span className="inline-flex rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: card.type.color, borderColor: `${card.type.color}55`, backgroundColor: `${card.type.color}18` }}>{card.type.label}</span>{card.rating ? <span className="inline-flex items-center gap-1 text-xs font-black text-amber-300" aria-label={`Valoración media ${card.rating}`}><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><path d="m12 2.5 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.1l6.2-.9Z" /></svg>{card.rating}</span> : null}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span className="flex flex-wrap gap-x-2">{task.taskCode ? <span className="text-slate-300">{task.taskCode}</span> : null}{card.stages ? <span>{card.stages}</span> : null}</span><span className="rounded-full bg-white/[0.05] px-2 py-1 normal-case tracking-normal text-slate-400">{card.ownership}</span></div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black text-slate-300">{card.players ? <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1"><MetricIcon />{card.players}</span> : null}{card.duration ? <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1"><MetricIcon kind="time" />{card.duration}</span> : null}{card.space ? <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1"><MetricIcon kind="space" />{card.space}</span> : null}</div>
      {card.summary ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">{card.summary}</p> : null}
      {card.variants || card.feedback ? <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 text-[10px] font-bold text-slate-500">{card.variants ? <span>{card.variants}</span> : null}{card.feedback ? <span>{card.feedback}</span> : null}</div> : null}
    </div>
  </article>;
}

export default function TrainingTasksSection({ membership = null, userId = '', players = [] }) {
  const clubId = membership?.club_id || '';
  const [tasks, setTasks] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [filters, setFilters] = useState(createTrainingTaskFilters);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [deleteReady, setDeleteReady] = useState(false);
  const [seriesSupported, setSeriesSupported] = useState(false);
  const [contentSupported, setContentSupported] = useState(false);
  const [shareTask, setShareTask] = useState(null);
  const [shareIds, setShareIds] = useState([]);
  const [feedbackRows, setFeedbackRows] = useState([]);
  const [feedbackDraft, setFeedbackDraft] = useState(createTrainingTaskFeedbackDraft);
  const [feedbackEditingId, setFeedbackEditingId] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [draftBaseline, setDraftBaseline] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportResult, setExportResult] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportProgress, setExportProgress] = useState('');
  const [batchPrint, setBatchPrint] = useState(null);
  const batchPrintRef = useRef(null);
  const playerLookup = useMemo(() => createTrainingTaskPlayerLookup(players), [players]);

  const refresh = async () => { if (!clubId) return; setLoading(true); setError(''); try { const [loaded, members, deletion] = await Promise.all([loadTrainingTasks(supabase, clubId), supabase.from('club_memberships').select('id,user_id,role,is_active').eq('club_id', clubId).eq('is_active', true).in('role', ['owner', 'admin', 'staff']), supabase.rpc('training_task_delete_ready_v1')]); if (members.error) throw members.error; setTasks(loaded); setMemberships(members.data || []); setDeleteReady(!deletion.error && deletion.data === true); } catch (loadError) { setError(loadError.message || 'No se pudieron cargar las tareas.'); setDeleteReady(false); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, [clubId]);
  useEffect(() => {
    let active = true;
    checkPlannedTaskSeries(supabase).then((ready) => { if (active) setSeriesSupported(ready); })
      .catch(() => { if (active) setSeriesSupported(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!exportOpen || !clubId || !exportFrom || !exportTo || exportFrom > exportTo) {
      setExportResult(null); setExportLoading(false);
      return undefined;
    }
    let cancelled = false;
    setExportResult(null); setExportLoading(true); setExportError(''); setExportProgress('');
    listTrainingTasksForExport(supabase, clubId, exportFrom, exportTo)
      .then((rows) => { if (!cancelled) setExportResult({ clubId, from: exportFrom, to: exportTo, rows }); })
      .catch((cause) => { if (!cancelled) setExportError(cause.message || 'No se pudieron consultar las tareas.'); })
      .finally(() => { if (!cancelled) setExportLoading(false); });
    return () => { cancelled = true; };
  }, [clubId, exportOpen, exportFrom, exportTo]);
  useEffect(() => {
    if (!batchPrint?.tasks.length) return undefined;
    let cancelled = false;
    const previousTitle = document.title;
    const finish = () => {
      if (cancelled) return;
      setBatchPrint(null); setExportBusy(false);
      setExportProgress('Cuadro de impresión cerrado. Si elegiste «Guardar como PDF», comprueba el archivo en tu equipo.');
    };
    const openPrint = async () => {
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      if (document.fonts?.ready) await document.fonts.ready;
      if (cancelled) return;
      const sheets = batchPrintRef.current?.querySelectorAll('.task-export-sheet');
      if (sheets?.length !== batchPrint.tasks.length) throw new Error('No se pudieron preparar todas las fichas para imprimir.');
      document.title = batchPrint.fileName.replace(/\.pdf$/i, '');
      setExportProgress(`Abriendo la impresión de ${sheets.length} fichas. Elige «Guardar como PDF».`);
      window.addEventListener('afterprint', finish, { once: true });
      window.print();
    };
    openPrint().catch((cause) => {
      if (cancelled) return;
      setExportError(`No se generó ningún PDF: ${cause.message || 'error desconocido'}`);
      setExportBusy(false); setBatchPrint(null);
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', finish);
      document.title = previousTitle;
    };
  }, [batchPrint]);
  useEffect(() => {
    let active = true;
    checkPlannedTaskContent(supabase).then((ready) => { if (active) setContentSupported(ready); })
      .catch(() => { if (active) setContentSupported(false); });
    return () => { active = false; };
  }, []);

  const visibleTasks = useMemo(() => filterTrainingTasks(tasks, filters, userId), [tasks, filters, userId]);
  const advancedFilterCount = countActiveTrainingTaskAdvancedFilters(filters);
  const draftDirty = useMemo(() => Boolean(draft && draftBaseline && JSON.stringify(draft) !== JSON.stringify(draftBaseline)), [draft, draftBaseline]);
  const clearFilters = () => { setFilters(createTrainingTaskFilters()); setShowAdvancedFilters(false); };
  const openExportDialog = () => {
    const now = new Date();
    const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setExportFrom(localDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setExportTo(localDate(now));
    setExportResult(null); setExportError(''); setExportProgress(''); setExportOpen(true);
  };
  const exportTasksPdf = () => {
    if (exportBusy || exportLoading || exportResult?.clubId !== clubId ||
        exportResult?.from !== exportFrom || exportResult?.to !== exportTo || !exportResult.rows.length) return;
    setExportBusy(true); setExportError('');
    setExportProgress(`Componiendo ${exportResult.rows.length} fichas A4…`);
    setBatchPrint({ tasks: exportResult.rows, fileName: trainingTaskExportFileName(exportFrom, exportTo) });
  };
  const applyTaskMedia = (taskId, media) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, media } : task));
    setSelected((current) => current?.id === taskId ? { ...current, media } : current);
  };
  const openNew = () => {
    const nextDraft = createTrainingTaskDraft();
    setSelected(null); setFeedbackRows([]); setDraftBaseline(nextDraft); setDraft(nextDraft); setError('');
  };
  const loadFeedback = async (task) => {
    setFeedbackRows([]); setFeedbackDraft(createTrainingTaskFeedbackDraft()); setFeedbackEditingId(null); setFeedbackError(''); setFeedbackLoading(true);
    try { setFeedbackRows(await loadTrainingTaskFeedback(supabase, task.id)); }
    catch (loadError) { setFeedbackError(loadError.message || 'No se pudo cargar el historial POST.'); }
    finally { setFeedbackLoading(false); }
  };
  const openEdit = (task) => {
    if (task.author_user_id !== userId) return;
    const nextDraft = trainingTaskToDraft(task);
    setSelected(task); setDraftBaseline(nextDraft); setDraft(nextDraft); setError(''); loadFeedback(task);
  };
  const closeEditor = () => {
    if (draftDirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    setDraft(null); setDraftBaseline(null); setError('');
    if (!selected) setFeedbackRows([]);
    resetFeedbackDraft();
  };
  useEffect(() => {
    if (!draftDirty) return undefined;
    const warnBeforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [draftDirty]);
  const save = async () => {
    if (!contentSupported && [draft?.exerciseRules, draft?.tacticalOffensiveContent,
      draft?.tacticalDefensiveContent].some(Boolean)) {
      setError('Instala y verifica la migración de contenido antes de guardar estos campos.'); return;
    }
    if (!seriesSupported && (draft?.seriesCount || draft?.minutesPerSeries)) {
      setError('Instala y verifica la migración de series antes de guardar esta tarea.'); return;
    }
    const validation = validateTrainingTaskDraft(draft || {});
    if (Object.keys(validation).length) { setError(Object.values(validation)[0]); return; }
    setSaving(true);
    setError('');
    try {
      const { task: saved, cleanupPending, cleanupError } = await saveTrainingTaskWithFile(
        supabase, draft, { clubId, authorUserId: userId, seriesEnabled: seriesSupported,
          contentEnabled: contentSupported }, selected
      );
      const savedTask = selected
        ? { ...selected, ...saved, media: selected.media || [] }
        : { ...saved, media: [] };
      setTasks((current) => selected
        ? current.map((task) => task.id === saved.id ? savedTask : task)
        : [savedTask, ...current]);
      setSelected(savedTask);
      setDraft(null);
      setDraftBaseline(null);
      setStatus(cleanupPending.length
        ? `Tarea guardada. Limpieza pendiente de ${cleanupPending.join(', ')}: ${cleanupError?.message || 'error desconocido'}.`
        : selected ? 'Tarea actualizada.' : 'Tarea creada. Ya puedes añadir contenido multimedia.');
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la tarea.');
    } finally { setSaving(false); }
  };
  const openTask = async (task) => {
    setDraft(null);
    setDraftBaseline(null);
    setSelected(task);
    await loadFeedback(task);
  };
  const download = async (task) => { const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(task.attachmentPath, 3600, { download: task.attachmentName || true }); if (urlError) { setError(urlError.message); return; } window.open(data.signedUrl, '_blank', 'noopener,noreferrer'); };
  const duplicate = async (task) => { if (!seriesSupported && (task.seriesCount || task.minutesPerSeries)) { setError('No se ha verificado la compatibilidad de series; vuelve a cargar antes de duplicar.'); return; } if (!contentSupported && (task.exerciseRules || task.tacticalOffensiveContent || task.tacticalDefensiveContent)) { setError('No se ha verificado la compatibilidad del contenido nuevo; vuelve a cargar antes de duplicar.'); return; } try { const copy = await duplicateTrainingTask(supabase, task, { clubId, authorUserId: userId, seriesEnabled: seriesSupported, contentEnabled: contentSupported }); setTasks((current) => [copy, ...current]); setStatus('Tarea duplicada en tu biblioteca.'); } catch (duplicateError) { setError(duplicateError.message || 'No se pudo duplicar.'); } };
  const remove = async (task) => {
    if (task.author_user_id !== userId || !window.confirm(`¿Eliminar definitivamente «${task.name}»? Esta acción no se puede deshacer.`)) return;
    setError('');
    setStatus('');
    try {
      const { cleanupPending, cleanupError } = await deleteTrainingTaskWithFiles(supabase, task);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      if (selected?.id === task.id) setSelected(null);
      setStatus(cleanupPending.length
        ? `Tarea eliminada. Quedan ${cleanupPending.length} archivos privados pendientes de limpieza: ${cleanupError?.message || 'Storage no autorizó su borrado'}.`
        : 'Tarea eliminada.');
    } catch (deleteError) {
      setError(deleteError.message || 'No se pudo eliminar la tarea. No se ha confirmado ningún cambio.');
    }
  };
  const startShare = async (task) => { if (task.author_user_id !== userId) return; const { data, error: shareError } = await supabase.from('training_task_shares').select('membership_id').eq('task_id', task.id); if (shareError) { setError(shareError.message); return; } setShareTask(task); setShareIds((data || []).map((row) => row.membership_id)); };
  const saveShare = async () => { try { await shareTrainingTask(supabase, shareTask.id, shareIds, userId); setShareTask(null); await refresh(); setStatus('Compartición actualizada.'); } catch (shareError) { setError(shareError.message || 'No se pudo compartir.'); } };

  const applyFeedbackRows = (taskId, nextRows) => {
    const summary = summarizeTrainingTaskRatings(nextRows);
    setFeedbackRows(nextRows);
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, ...summary } : task));
    setSelected((current) => current?.id === taskId ? { ...current, ...summary } : current);
  };
  const resetFeedbackDraft = () => { setFeedbackDraft(createTrainingTaskFeedbackDraft()); setFeedbackEditingId(null); setFeedbackError(''); };
  const saveFeedback = async () => {
    if (!selected) return;
    const validation = validateTrainingTaskFeedback(feedbackDraft);
    if (Object.keys(validation).length) { setFeedbackError(Object.values(validation)[0]); return; }
    setFeedbackSaving(true);
    setFeedbackError('');
    try {
      const saved = feedbackEditingId
        ? await updateTrainingTaskFeedback(supabase, feedbackEditingId, feedbackDraft)
        : await createTrainingTaskFeedback(supabase, feedbackDraft, { taskId: selected.id, clubId, authorUserId: userId });
      const nextRows = feedbackEditingId
        ? feedbackRows.map((entry) => entry.id === saved.id ? saved : entry)
        : [saved, ...feedbackRows];
      const orderedRows = [...nextRows].sort((left, right) => String(right.usedOn).localeCompare(String(left.usedOn)) || String(right.created_at || '').localeCompare(String(left.created_at || '')));
      applyFeedbackRows(selected.id, orderedRows);
      resetFeedbackDraft();
      setStatus(feedbackEditingId ? 'POST actualizado.' : 'POST añadido al historial.');
    } catch (saveError) { setFeedbackError(saveError.message || 'No se pudo guardar el POST.'); }
    finally { setFeedbackSaving(false); }
  };
  const editFeedback = (entry) => { if (entry.author_user_id !== userId) return; setFeedbackEditingId(entry.id); setFeedbackDraft(trainingTaskFeedbackToDraft(entry)); setFeedbackError(''); };
  const removeFeedback = async (entry) => {
    if (entry.author_user_id !== userId || !window.confirm('¿Eliminar esta entrada POST?')) return;
    try {
      await deleteTrainingTaskFeedback(supabase, entry.id);
      applyFeedbackRows(selected.id, feedbackRows.filter((item) => item.id !== entry.id));
      if (feedbackEditingId === entry.id) resetFeedbackDraft();
      setStatus('POST eliminado.');
    } catch (deleteError) { setFeedbackError(deleteError.message || 'No se pudo eliminar el POST.'); }
  };

  if (!clubId) return <section className="rounded-2xl border border-amber-200/20 bg-amber-200/10 p-5 text-sm text-amber-100">No hay un club activo disponible para cargar Tareas.</section>;
  return <main className="space-y-5">
    {!draft && !selected ? <header className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.16)] sm:p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-caudal-electric">Biblioteca operativa</p><h1 className="mt-1 text-2xl font-black text-white">Tareas</h1><p className="mt-1 text-sm text-slate-400">Biblioteca de tareas de entrenamiento para el cuerpo técnico.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={openExportDialog} disabled={loading || exportBusy} className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs font-black text-slate-200 disabled:opacity-50">Exportar PDF</button><button type="button" onClick={openNew} className="rounded-xl bg-caudal-electric px-4 py-2.5 text-xs font-black text-slate-950">+ Nueva tarea</button></div></div>{status ? <p className="mt-3 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100">{status}</p> : null}{error ? <p role="alert" className="mt-3 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100">{error}</p> : null}</header> : null}
    {exportOpen ? <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !exportBusy) setExportOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="task-export-title" className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1a2d] p-4 text-white shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 id="task-export-title" className="text-lg font-black">Exportar tareas a PDF</h2><p className="mt-1 text-xs text-slate-400">Se incluyen solo las tareas de Biblioteca que puedes consultar, según su fecha real de creación.</p></div><button type="button" disabled={exportBusy} onClick={() => setExportOpen(false)} aria-label="Cerrar exportación" className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300">Cerrar</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-300">Desde<input type="date" value={exportFrom} max={exportTo || undefined} disabled={exportBusy} onChange={(event) => setExportFrom(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-white px-3 text-sm font-bold text-slate-950" /></label>
          <label className="text-xs font-bold text-slate-300">Hasta<input type="date" value={exportTo} min={exportFrom || undefined} disabled={exportBusy} onChange={(event) => setExportTo(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-white px-3 text-sm font-bold text-slate-950" /></label>
        </div>
        {!exportFrom || !exportTo || exportFrom > exportTo ? <p role="alert" className="mt-3 text-sm text-amber-200">Selecciona un intervalo válido.</p>
          : exportLoading ? <p className="mt-3 text-sm text-slate-300" role="status">Consultando tareas autorizadas…</p>
            : exportResult?.clubId === clubId && exportResult.from === exportFrom && exportResult.to === exportTo
              ? <p className={`mt-3 text-sm ${exportResult.rows.length ? 'text-slate-200' : 'text-amber-200'}`} role="status">{exportResult.rows.length} {exportResult.rows.length === 1 ? 'tarea encontrada' : 'tareas encontradas'} (ambas fechas incluidas).{!exportResult.rows.length ? ' No se generará un PDF vacío.' : ''}</p> : null}
        {exportError ? <p role="alert" className="mt-3 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100">{exportError}</p> : null}
        {exportProgress ? <p role="status" className="mt-3 rounded-xl bg-caudal-electric/10 px-3 py-2 text-xs font-bold text-caudal-electric">{exportProgress}</p> : null}
        <p className="mt-3 text-[11px] text-slate-500">En el cuadro de impresión selecciona «Guardar como PDF». Cada tarea comienza en una hoja nueva y el contenido largo puede continuar en las siguientes.</p>
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={exportBusy} onClick={() => setExportOpen(false)} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black text-slate-200">Cancelar</button><button type="button" onClick={exportTasksPdf} disabled={exportBusy || exportLoading || exportResult?.clubId !== clubId || exportResult?.from !== exportFrom || exportResult?.to !== exportTo || !exportResult?.rows.length} className="rounded-xl bg-caudal-electric px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-40">{exportBusy ? 'Preparando…' : 'Generar PDF'}</button></div>
      </section>
    </div> : null}
    {(draft || selected) && status ? <p className="rounded-xl bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100">{status}</p> : null}
    {selected && !draft && error ? <p role="alert" className="rounded-xl bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100">{error}</p> : null}
    {draft ? <TaskForm seriesSupported={seriesSupported} contentSupported={contentSupported} players={players} draft={draft} setDraft={setDraft} task={selected} onMediaChange={(media) => selected && applyTaskMedia(selected.id, media)} feedback={{ rows: feedbackRows, loading: feedbackLoading, error: feedbackError, draft: feedbackDraft, setDraft: setFeedbackDraft, editingId: feedbackEditingId, saving: feedbackSaving, userId, onSave: saveFeedback, onEdit: editFeedback, onCancelEdit: resetFeedbackDraft, onDelete: removeFeedback, canManage: true }} onCancel={closeEditor} onSave={save} saving={saving} error={error} isEditing={Boolean(selected?.id)} /> : null}
    {selected && !draft ? <TrainingTaskDetail
      key={selected.id}
      task={selected}
      currentUserId={userId}
      players={players}
      client={supabase}
      onEdit={openEdit}
      onDuplicate={duplicate}
      onDownload={download}
      onMediaChange={(media) => applyTaskMedia(selected.id, media)}
      onClose={() => { setSelected(null); setFeedbackRows([]); resetFeedbackDraft(); setError(''); }}
      feedbackContent={<FeedbackPanel rows={feedbackRows} loading={feedbackLoading} error={feedbackError} draft={feedbackDraft} setDraft={setFeedbackDraft} editingId={feedbackEditingId} saving={feedbackSaving} userId={userId} onSave={saveFeedback} onEdit={editFeedback} onCancelEdit={resetFeedbackDraft} onDelete={removeFeedback} canManage={false} />}
    /> : null}
    {!draft && !selected ? <><section className="rounded-[1.25rem] border border-white/10 bg-[#091428]/78 p-3">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_160px_180px_auto]">
        <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Buscar en toda la ficha..." aria-label="Buscar tareas" className="min-h-9 rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60" />
        <select value={filters.taskType} onChange={(event) => setFilters((current) => ({ ...current, taskType: event.target.value }))} aria-label="Filtrar por tipo" className="min-h-9 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Todos los tipos</option>{TRAINING_TASK_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select>
        <select value={filters.stage} onChange={(event) => setFilters((current) => ({ ...current, stage: event.target.value }))} aria-label="Filtrar por etapa" className="min-h-9 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Todas las etapas</option>{TRAINING_TASK_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select>
        <select value={filters.scope} onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value }))} aria-label="Filtrar por propiedad" className="min-h-9 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Todas</option><option value="mine">Mías</option><option value="shared">Compartidas</option></select>
        <button type="button" aria-expanded={showAdvancedFilters} onClick={() => setShowAdvancedFilters((current) => !current)} className={`min-h-9 rounded-xl border px-3 text-xs font-black ${advancedFilterCount ? 'border-caudal-electric/40 bg-caudal-electric/10 text-caudal-electric' : 'border-white/10 bg-white/[0.05] text-slate-300'}`}>Más filtros{advancedFilterCount ? ` · ${advancedFilterCount}` : ''}</button>
      </div>
      {showAdvancedFilters ? <div className="mt-2 grid gap-2 border-t border-white/[0.06] pt-2 sm:grid-cols-2 xl:grid-cols-6">
        <select value={filters.ratingMin} onChange={(event) => setFilters((current) => ({ ...current, ratingMin: event.target.value }))} aria-label="Filtrar por valoración mínima" className="min-h-9 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Cualquier valoración</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option><option value="5">5</option></select>
        <input value={filters.taskCode} onChange={(event) => setFilters((current) => ({ ...current, taskCode: event.target.value }))} placeholder="Código tarea" aria-label="Filtrar por código" className="min-h-9 rounded-xl border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60" />
        <input type="number" min="1" step="1" inputMode="numeric" value={filters.players} onChange={(event) => setFilters((current) => ({ ...current, players: event.target.value }))} placeholder="Nº jugadores" aria-label="Filtrar por número de jugadores" className="min-h-9 rounded-xl border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60" />
        <input value={filters.objective} onChange={(event) => setFilters((current) => ({ ...current, objective: event.target.value }))} placeholder="Objetivo" aria-label="Filtrar por objetivo" className="min-h-9 rounded-xl border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60" />
        <select value={filters.gamePhase} onChange={(event) => setFilters((current) => ({ ...current, gamePhase: event.target.value }))} aria-label="Filtrar por fase" className="min-h-9 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Todas las fases</option>{TRAINING_TASK_PHASES.slice(1).map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}</select>
        <select value={filters.duration} onChange={(event) => setFilters((current) => ({ ...current, duration: event.target.value }))} aria-label="Filtrar por duración" className="min-h-9 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Cualquier duración</option><option value="short">Hasta 15 min</option><option value="medium">16–30 min</option><option value="long">Más de 30 min</option></select>
      </div> : null}
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-400">{visibleTasks.length} {visibleTasks.length === 1 ? 'resultado' : 'resultados'}</p><button type="button" onClick={clearFilters} className="rounded-lg bg-white/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/10">Limpiar filtros</button></div>
    </section>
    {loading ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Cargando tareas…</div> : error && !tasks.length ? <div role="alert" className="rounded-2xl border border-red-300/20 bg-red-400/10 p-8 text-center text-sm text-red-100">No se pudieron cargar las tareas.</div> : visibleTasks.length ? <div className="grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">{visibleTasks.map((task) => <TaskCard key={task.id} task={task} userId={userId} playerLookup={playerLookup} canManage={task.author_user_id === userId} canDelete={deleteReady && membership?.is_active && ['owner', 'admin', 'staff'].includes(membership.role) && task.club_id === clubId} onOpen={openTask} onEdit={openEdit} onDuplicate={duplicate} onDelete={remove} onShare={startShare} onDownload={download} />)}</div> : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center"><p className="text-sm font-black text-white">No hay tareas todavía</p><p className="mt-1 text-xs text-slate-500">Crea la primera tarea de entrenamiento para tu biblioteca.</p><button type="button" onClick={openNew} className="mt-4 rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950">+ Nueva tarea</button></div>}
    </> : null}
    {shareTask ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#071327] p-5 shadow-2xl"><h2 className="text-lg font-black text-white">Compartir tarea</h2><p className="mt-1 text-xs text-slate-500">Selecciona miembros STAFF del mismo club. No se comparte con jugadores.</p><div className="mt-4 grid max-h-64 gap-2 overflow-y-auto">{memberships.filter((member) => member.user_id !== userId).map((member) => <label key={member.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={shareIds.includes(member.id)} onChange={(event) => setShareIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} />{member.role.toUpperCase()} · {member.user_id}</label>)}</div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShareTask(null)} className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300">Cancelar</button><button type="button" onClick={saveShare} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black text-slate-950">Guardar compartición</button></div></section></div> : null}
    {batchPrint ? <TrainingTaskBatchPrint tasks={batchPrint.tasks} playerLookup={playerLookup} printRef={batchPrintRef} /> : null}
  </main>;
}
