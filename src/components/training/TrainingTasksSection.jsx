import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  TRAINING_TASK_MOMENTS,
  TRAINING_TASK_PHASES,
  TRAINING_TASK_STAGES,
  TRAINING_TASK_TYPES,
  createTrainingTaskDraft,
  createTrainingTaskFilters,
  filterTrainingTasks,
  formatTrainingTaskPlayers,
  formatTrainingTaskSpace,
  getTrainingTaskMomentLabel,
  getTrainingTaskStageLabel,
  getTrainingTaskTypeDefinition,
  trainingTaskToDraft,
  validateTrainingTaskDraft,
} from '../../utils/trainingTasks';
import { duplicateTrainingTask, loadTrainingTasks, shareTrainingTask } from '../../utils/trainingTaskStore';
import { deleteTrainingTaskWithFiles, saveTrainingTaskWithFile, TRAINING_TASK_BUCKET } from '../../utils/trainingTaskFiles';
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

function Field({ label, children, hint }) {
  return <label className="grid min-w-0 gap-1.5"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>{children}{hint ? <span className="text-[10px] text-slate-600">{hint}</span> : null}</label>;
}

function TaskForm({ draft, setDraft, onCancel, onSave, saving, error, isEditing }) {
  const moments = TRAINING_TASK_MOMENTS[draft.gamePhase] || [];
  const inputClass = 'min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60';
  return <section className="rounded-[1.35rem] border border-white/10 bg-[#071327]/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]" aria-labelledby="training-task-form-title">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">{isEditing ? 'Editar tarea' : 'Nueva tarea'}</p><h2 id="training-task-form-title" className="mt-1 text-xl font-black text-white">Ficha de entrenamiento</h2></div><button type="button" onClick={onCancel} className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300">Cerrar</button></div>
    {error ? <p role="alert" className="mt-3 rounded-xl border border-red-200/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100">{error}</p> : null}
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <Field label="Nombre *"><input className={inputClass} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Rondo de tercer hombre" /></Field>
      <Field label="Tipo"><select className={inputClass} value={draft.taskType} onChange={(event) => setDraft((current) => ({ ...current, taskType: event.target.value }))}>{isEditing && getTrainingTaskTypeDefinition(draft.taskType).legacy ? <option value={draft.taskType}>{getTrainingTaskTypeDefinition(draft.taskType).label} (tipo anterior)</option> : null}{TRAINING_TASK_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select></Field>
      <Field label="Código tarea"><input className={inputClass} value={draft.taskCode} maxLength={40} onChange={(event) => setDraft((current) => ({ ...current, taskCode: event.target.value }))} placeholder="Ej. Vigón" /></Field>
      <Field label="Objetivo principal *"><textarea className={`${inputClass} min-h-20`} value={draft.objective} onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))} placeholder="Qué queremos entrenar" /></Field>
      <Field label="Descripción"><textarea className={`${inputClass} min-h-20`} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Organización y consignas" /></Field>
      <Field label="Jugadores" hint="Admite formatos como 4v4+3"><input className={inputClass} value={draft.playersSpec} onChange={(event) => setDraft((current) => ({ ...current, playersSpec: event.target.value }))} placeholder="8v8+2" /></Field>
      <div className="grid grid-cols-3 gap-2"><Field label="Mín."><input type="number" min="0" className={inputClass} value={draft.playersMin} onChange={(event) => setDraft((current) => ({ ...current, playersMin: event.target.value }))} /></Field><Field label="Máx."><input type="number" min="0" className={inputClass} value={draft.playersMax} onChange={(event) => setDraft((current) => ({ ...current, playersMax: event.target.value }))} /></Field><Field label="Minutos"><input type="number" min="1" className={inputClass} value={draft.durationMinutes} onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value }))} /></Field></div>
      <div className="grid grid-cols-2 gap-2"><Field label="Ancho (m)"><input type="number" min="1" step="1" inputMode="numeric" className={inputClass} value={draft.spaceWidthM} onChange={(event) => setDraft((current) => ({ ...current, spaceWidthM: event.target.value }))} /></Field><Field label="Largo (m)"><input type="number" min="1" step="1" inputMode="numeric" className={inputClass} value={draft.spaceLengthM} onChange={(event) => setDraft((current) => ({ ...current, spaceLengthM: event.target.value }))} /></Field></div>
      <Field label="Material"><input className={inputClass} value={draft.material} onChange={(event) => setDraft((current) => ({ ...current, material: event.target.value }))} placeholder="Conos, petos..." /></Field>
      <Field label="Fase del juego"><select className={inputClass} value={draft.gamePhase} onChange={(event) => setDraft((current) => ({ ...current, gamePhase: event.target.value, gameMoment: '' }))}>{TRAINING_TASK_PHASES.map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}</select></Field>
      {moments.length ? <Field label="Momento / subfase"><select className={inputClass} value={draft.gameMoment} onChange={(event) => setDraft((current) => ({ ...current, gameMoment: event.target.value }))}><option value="">Sin momento</option>{moments.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field> : null}
      <Field label="Contenido técnico"><textarea className={`${inputClass} min-h-20`} value={draft.technicalContent} onChange={(event) => setDraft((current) => ({ ...current, technicalContent: event.target.value }))} /></Field>
      <Field label="Contenido táctico"><textarea className={`${inputClass} min-h-20`} value={draft.tacticalContent} onChange={(event) => setDraft((current) => ({ ...current, tacticalContent: event.target.value }))} /></Field>
      <Field label="Observaciones"><textarea className={`${inputClass} min-h-16`} value={draft.observations} onChange={(event) => setDraft((current) => ({ ...current, observations: event.target.value }))} /></Field>
      <fieldset className="grid gap-2 md:col-span-2"><legend className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Etapa</legend><div className="flex flex-wrap gap-2">{TRAINING_TASK_STAGES.map((stage) => { const selected = draft.stageKeys.includes(stage.key); return <button key={stage.key} type="button" aria-pressed={selected} onClick={() => setDraft((current) => ({ ...current, stageKeys: selected ? current.stageKeys.filter((key) => key !== stage.key) : [...current.stageKeys, stage.key] }))} className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-black ${selected ? 'border-caudal-electric bg-caudal-electric/15 text-caudal-electric' : 'border-white/10 bg-black/20 text-slate-400'}`}>{selected ? '✓ ' : ''}{stage.label}</button>; })}</div></fieldset>
      <Field label="Variantes"><textarea className={`${inputClass} min-h-28`} maxLength={10000} value={draft.variants} onChange={(event) => setDraft((current) => ({ ...current, variants: event.target.value }))} placeholder="Modificaciones previstas del ejercicio" /></Field>
      <Field label="Archivo / imagen" hint="JPG, PNG, WEBP o PDF · máximo 10 MB"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="min-h-10 w-full rounded-xl border border-dashed border-white/15 bg-black/20 px-3 py-2 text-xs text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-caudal-electric file:px-2 file:py-1 file:text-[10px] file:font-black" onChange={(event) => setDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))} />{draft.attachmentName ? <span className="text-[10px] text-slate-500">Actual: {draft.attachmentName} {draft.attachmentSize ? `· ${formatFileSize(draft.attachmentSize)}` : ''}</span> : null}</Field>
    </div>
    <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl bg-white/[0.06] px-4 py-2.5 text-xs font-black text-slate-300">Cancelar</button><button type="button" onClick={onSave} disabled={saving} className="rounded-xl bg-caudal-electric px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear tarea'}</button></div>
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

function FeedbackPanel({ rows, loading, error, draft, setDraft, editingId, saving, userId, onSave, onEdit, onCancelEdit, onDelete }) {
  return <section className="mt-5 border-t border-white/10 pt-5" aria-labelledby="training-task-feedback-title">
    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Historial de uso</p><h3 id="training-task-feedback-title" className="mt-1 text-base font-black text-white">POST · Después de realizarla</h3><p className="mt-1 text-xs text-slate-500">¿Qué funcionó y qué modificarías?</p></div>
    <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/15 p-3 md:grid-cols-[160px_1fr]">
      <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Fecha<input type="date" value={draft.usedOn} onChange={(event) => setDraft((current) => ({ ...current, usedOn: event.target.value }))} className="min-h-11 rounded-xl border border-white/10 bg-white px-3 text-sm font-bold text-slate-950" /></label>
      <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Valoración</p><RatingStars value={draft.rating} onChange={(rating) => setDraft((current) => ({ ...current, rating }))} /></div>
      <label className="grid gap-1 md:col-span-2"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">POST</span><textarea maxLength={4000} value={draft.post} onChange={(event) => setDraft((current) => ({ ...current, post: event.target.value }))} placeholder="¿Qué funcionó y qué modificarías?" className="min-h-24 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60" /></label>
      {error ? <p role="alert" className="text-xs font-bold text-red-200 md:col-span-2">{error}</p> : null}
      <div className="flex justify-end gap-2 md:col-span-2">{editingId ? <button type="button" onClick={onCancelEdit} className="min-h-10 rounded-xl bg-white/[0.06] px-3 text-xs font-black text-slate-300">Cancelar edición</button> : null}<button type="button" disabled={saving} onClick={onSave} className="min-h-10 rounded-xl bg-caudal-electric px-4 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar POST'}</button></div>
    </div>
    <div className="mt-4 grid gap-2">{loading ? <p className="text-xs text-slate-500">Cargando historial…</p> : rows.length ? rows.map((entry) => <article key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black text-white">{formatDate(`${entry.usedOn}T00:00:00`)}</p>{entry.rating ? <div className="mt-1 text-sm"><RatingStars value={entry.rating} /> <span className="ml-1 text-xs font-bold text-slate-400">{entry.rating}/5</span></div> : <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">Sin valoración</p>}</div>{entry.author_user_id === userId ? <div className="flex gap-1"><button type="button" onClick={() => onEdit(entry)} className="min-h-10 rounded-lg px-2 text-[10px] font-black text-slate-300 hover:bg-white/10">Editar</button><button type="button" onClick={() => onDelete(entry)} className="min-h-10 rounded-lg px-2 text-[10px] font-black text-red-200 hover:bg-red-500/10">Eliminar</button></div> : null}</div>{entry.post ? <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-300">{entry.post}</p> : null}</article>) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">Todavía no hay experiencias registradas.</p>}</div>
  </section>;
}

function TaskCard({ task, canManage, onOpen, onEdit, onDuplicate, onDelete, onShare, onDownload }) {
  const type = getTrainingTaskTypeDefinition(task.taskType);
  return <article className="group overflow-hidden rounded-[1.25rem] border border-white/10 border-t-2 bg-[#091428]/88 shadow-[0_12px_34px_rgba(0,0,0,0.16)] transition hover:bg-[#0d192c]" style={{ borderTopColor: type.color }}>
    <button type="button" onClick={() => onOpen(task)} className="block w-full text-left"><div className="flex h-32 items-center justify-center text-4xl font-black" style={{ color: type.color, background: `linear-gradient(135deg, ${type.color}22, rgba(255,255,255,0.035), rgba(212,0,0,0.08))` }}>{task.previewUrl ? <img src={task.previewUrl} alt="" className="h-full w-full object-cover" /> : 'TA'}</div><div className="p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-base font-black text-white">{task.name}</h3><span className="mt-1 inline-flex rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: type.color, borderColor: `${type.color}55`, backgroundColor: `${type.color}18` }}>{type.label}</span>{task.taskCode ? <p className="mt-2 truncate text-xs font-bold text-slate-300">Código: {task.taskCode}</p> : null}</div>{task.isShared ? <span className="shrink-0 rounded-lg border border-emerald-200/20 bg-emerald-200/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-100">Compartida</span> : null}</div><div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-300">{formatTrainingTaskPlayers(task) !== 'Sin número específico' ? <span className="rounded-lg bg-white/[0.06] px-2 py-1">{formatTrainingTaskPlayers(task)}</span> : null}{task.durationMinutes ? <span className="rounded-lg bg-white/[0.06] px-2 py-1">{task.durationMinutes} min</span> : null}{formatTrainingTaskSpace(task) ? <span className="rounded-lg bg-white/[0.06] px-2 py-1">{formatTrainingTaskSpace(task)}</span> : null}</div>{task.stageKeys?.length ? <p className="mt-2 truncate text-[10px] font-black uppercase tracking-wide text-slate-400">{task.stageKeys.map(getTrainingTaskStageLabel).join(' · ')}</p> : null}{task.ratingCount > 0 ? <p className="mt-2 text-xs font-black text-amber-300" aria-label={`Valoración media ${task.ratingAverage.toFixed(1)} de 5`}>★ {task.ratingAverage.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p> : null}<p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">{task.objective || task.description}</p></div></button>
    <div className="flex flex-wrap gap-1 border-t border-white/10 px-3 py-2"><button type="button" onClick={() => onOpen(task)} className="rounded-lg px-2 py-1 text-[10px] font-black text-white hover:bg-white/10">Ver</button><button type="button" onClick={() => onDuplicate(task)} className="rounded-lg px-2 py-1 text-[10px] font-black text-slate-300 hover:bg-white/10">Duplicar</button>{task.attachmentPath ? <button type="button" onClick={() => onDownload(task)} className="rounded-lg px-2 py-1 text-[10px] font-black text-caudal-electric hover:bg-white/10">Descargar</button> : null}{canManage ? <><button type="button" onClick={() => onEdit(task)} className="ml-auto rounded-lg px-2 py-1 text-[10px] font-black text-slate-300 hover:bg-white/10">Editar</button><button type="button" onClick={() => onShare(task)} className="rounded-lg px-2 py-1 text-[10px] font-black text-slate-300 hover:bg-white/10">Compartir</button><button type="button" onClick={() => onDelete(task)} className="rounded-lg px-2 py-1 text-[10px] font-black text-red-200 hover:bg-red-500/10">Eliminar</button></> : null}</div>
  </article>;
}

export default function TrainingTasksSection({ membership = null, userId = '' }) {
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
  const [shareTask, setShareTask] = useState(null);
  const [shareIds, setShareIds] = useState([]);
  const [feedbackRows, setFeedbackRows] = useState([]);
  const [feedbackDraft, setFeedbackDraft] = useState(createTrainingTaskFeedbackDraft);
  const [feedbackEditingId, setFeedbackEditingId] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const refresh = async () => { if (!clubId) return; setLoading(true); setError(''); try { const [loaded, members] = await Promise.all([loadTrainingTasks(supabase, clubId), supabase.from('club_memberships').select('id,user_id,role,is_active').eq('club_id', clubId).eq('is_active', true).in('role', ['owner', 'admin', 'staff'])]); if (members.error) throw members.error; setTasks(loaded); setMemberships(members.data || []); } catch (loadError) { setError(loadError.message || 'No se pudieron cargar las tareas.'); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, [clubId]);

  const visibleTasks = useMemo(() => filterTrainingTasks(tasks, filters, userId), [tasks, filters, userId]);
  const clearFilters = () => setFilters(createTrainingTaskFilters());
  const openNew = () => { setSelected(null); setFeedbackRows([]); setDraft(createTrainingTaskDraft()); setError(''); };
  const openEdit = (task) => { if (task.author_user_id !== userId) return; setSelected(task); setDraft(trainingTaskToDraft(task)); setError(''); };
  const save = async () => {
    const validation = validateTrainingTaskDraft(draft || {});
    if (Object.keys(validation).length) { setError(Object.values(validation)[0]); return; }
    setSaving(true);
    setError('');
    try {
      const { task: saved, cleanupPending, cleanupError } = await saveTrainingTaskWithFile(
        supabase, draft, { clubId, authorUserId: userId }, selected
      );
      setTasks((current) => selected
        ? current.map((task) => task.id === saved.id ? { ...task, ...saved, previewUrl: '' } : task)
        : [saved, ...current]);
      setDraft(null);
      setSelected(null);
      setStatus(cleanupPending.length
        ? `Tarea guardada. Limpieza pendiente de ${cleanupPending.join(', ')}: ${cleanupError?.message || 'error desconocido'}.`
        : selected ? 'Tarea actualizada.' : 'Tarea creada.');
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la tarea.');
    } finally { setSaving(false); }
  };
  const openTask = async (task) => {
    setSelected(task);
    setFeedbackRows([]);
    setFeedbackDraft(createTrainingTaskFeedbackDraft());
    setFeedbackEditingId(null);
    setFeedbackError('');
    setFeedbackLoading(true);
    try {
      setFeedbackRows(await loadTrainingTaskFeedback(supabase, task.id));
    } catch (loadError) {
      setFeedbackError(loadError.message || 'No se pudo cargar el historial POST.');
    } finally { setFeedbackLoading(false); }
    if (task.previewPath && !task.previewUrl) { const { data } = await supabase.storage.from(BUCKET).createSignedUrl(task.previewPath, 3600); setTasks((current) => current.map((item) => item.id === task.id ? { ...item, previewUrl: data?.signedUrl || '' } : item)); setSelected((current) => current?.id === task.id ? { ...current, previewUrl: data?.signedUrl || '' } : current); }
  };
  const download = async (task) => { const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(task.attachmentPath || task.previewPath, 3600, { download: task.attachmentName || true }); if (urlError) { setError(urlError.message); return; } window.open(data.signedUrl, '_blank', 'noopener,noreferrer'); };
  const duplicate = async (task) => { try { const copy = await duplicateTrainingTask(supabase, task, { clubId, authorUserId: userId }); setTasks((current) => [copy, ...current]); setStatus('Tarea duplicada en tu biblioteca.'); } catch (duplicateError) { setError(duplicateError.message || 'No se pudo duplicar.'); } };
  const remove = async (task) => { if (task.author_user_id !== userId || !window.confirm('¿Eliminar esta tarea? Esta acción no se puede deshacer.')) return; try { await deleteTrainingTaskWithFiles(supabase, task); setTasks((current) => current.filter((item) => item.id !== task.id)); if (selected?.id === task.id) setSelected(null); setStatus('Tarea eliminada.'); } catch (deleteError) { setError(deleteError.message || 'No se pudo eliminar la tarea.'); } };
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
    <header className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.16)] sm:p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-caudal-electric">Biblioteca operativa</p><h1 className="mt-1 text-2xl font-black text-white">Tareas</h1><p className="mt-1 text-sm text-slate-400">Biblioteca de tareas de entrenamiento para el cuerpo técnico.</p></div><button type="button" onClick={openNew} className="rounded-xl bg-caudal-electric px-4 py-2.5 text-xs font-black text-slate-950">+ Nueva tarea</button></div>{status ? <p className="mt-3 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100">{status}</p> : null}{error && !draft ? <p role="alert" className="mt-3 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100">{error}</p> : null}</header>
    {draft ? <TaskForm draft={draft} setDraft={setDraft} onCancel={() => { setDraft(null); setSelected(null); setFeedbackRows([]); resetFeedbackDraft(); }} onSave={save} saving={saving} error={error} isEditing={Boolean(selected?.id)} /> : null}
    <section className="rounded-[1.25rem] border border-white/10 bg-[#091428]/78 p-3 sm:p-4">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <select value={filters.stage} onChange={(event) => setFilters((current) => ({ ...current, stage: event.target.value }))} aria-label="Filtrar por etapa" className="min-h-10 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Todas las etapas</option>{TRAINING_TASK_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select>
        <select value={filters.ratingMin} onChange={(event) => setFilters((current) => ({ ...current, ratingMin: event.target.value }))} aria-label="Filtrar por valoración mínima" className="min-h-10 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Cualquier valoración</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option><option value="5">5</option></select>
        <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Buscar en toda la ficha..." aria-label="Buscar tareas" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60 md:col-span-2" />
        <select value={filters.taskType} onChange={(event) => setFilters((current) => ({ ...current, taskType: event.target.value }))} aria-label="Filtrar por tipo" className="min-h-10 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Todos los tipos</option>{TRAINING_TASK_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select>
        <input value={filters.taskCode} onChange={(event) => setFilters((current) => ({ ...current, taskCode: event.target.value }))} placeholder="Código tarea" aria-label="Filtrar por código" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60" />
        <input type="number" min="1" step="1" inputMode="numeric" value={filters.players} onChange={(event) => setFilters((current) => ({ ...current, players: event.target.value }))} placeholder="Nº jugadores" aria-label="Filtrar por número de jugadores" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60" />
        <input value={filters.objective} onChange={(event) => setFilters((current) => ({ ...current, objective: event.target.value }))} placeholder="Objetivo" aria-label="Filtrar por objetivo" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60" />
        <select value={filters.gamePhase} onChange={(event) => setFilters((current) => ({ ...current, gamePhase: event.target.value }))} aria-label="Filtrar por fase" className="min-h-10 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Todas las fases</option>{TRAINING_TASK_PHASES.slice(1).map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}</select>
        <select value={filters.duration} onChange={(event) => setFilters((current) => ({ ...current, duration: event.target.value }))} aria-label="Filtrar por duración" className="min-h-10 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Cualquier duración</option><option value="short">Hasta 15 min</option><option value="medium">16–30 min</option><option value="long">Más de 30 min</option></select>
        <select value={filters.scope} onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value }))} aria-label="Filtrar por propiedad" className="min-h-10 rounded-xl border border-white/10 bg-white px-2 text-xs font-bold text-slate-950"><option value="">Todas</option><option value="mine">Mías</option><option value="shared">Compartidas</option></select>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-400">{visibleTasks.length} {visibleTasks.length === 1 ? 'resultado' : 'resultados'}</p><button type="button" onClick={clearFilters} className="rounded-lg bg-white/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/10">Limpiar filtros</button></div>
    </section>
    {loading ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Cargando tareas…</div> : error && !tasks.length ? <div role="alert" className="rounded-2xl border border-red-300/20 bg-red-400/10 p-8 text-center text-sm text-red-100">No se pudieron cargar las tareas.</div> : visibleTasks.length ? <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{visibleTasks.map((task) => <TaskCard key={task.id} task={task} canManage={task.author_user_id === userId} onOpen={openTask} onEdit={openEdit} onDuplicate={duplicate} onDelete={remove} onShare={startShare} onDownload={download} />)}</div> : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center"><p className="text-sm font-black text-white">No hay tareas todavía</p><p className="mt-1 text-xs text-slate-500">Crea la primera tarea de entrenamiento para tu biblioteca.</p><button type="button" onClick={openNew} className="mt-4 rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950">+ Nueva tarea</button></div>}
    {selected && !draft ? <section className="rounded-[1.35rem] border border-caudal-electric/20 bg-[#071327]/95 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Detalle de tarea</p><h2 className="mt-1 text-xl font-black text-white">{selected.name}</h2>{selected.taskCode ? <p className="mt-1 text-xs font-bold text-slate-300">Código: {selected.taskCode}</p> : null}<p className="mt-1 text-xs text-slate-500">Creada {formatDate(selected.created_at)} · actualizada {formatDate(selected.updated_at)}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300">Cerrar</button></div><div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]"><div className="flex min-h-40 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.04] text-4xl font-black text-caudal-electric">{selected.previewUrl ? <img src={selected.previewUrl} alt="" className="h-full max-h-64 w-full object-contain" /> : 'TA'}</div><div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Objetivo</p><p className="mt-1">{selected.objective}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Organización</p><p className="mt-1">{getTrainingTaskTypeDefinition(selected.taskType).label} · {formatTrainingTaskPlayers(selected)}{selected.durationMinutes ? ` · ${selected.durationMinutes} min` : ''}{formatTrainingTaskSpace(selected) ? ` · ${formatTrainingTaskSpace(selected)}` : ''}</p></div><div className="sm:col-span-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Descripción</p><p className="mt-1 whitespace-pre-wrap">{selected.description || 'Sin descripción.'}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Técnico</p><p className="mt-1 whitespace-pre-wrap">{selected.technicalContent || '—'}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Táctico / fase</p><p className="mt-1 whitespace-pre-wrap">{selected.tacticalContent || '—'}{selected.gameMoment ? ` · ${getTrainingTaskMomentLabel(selected.gamePhase, selected.gameMoment) || selected.gameMoment}` : ''}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Material</p><p className="mt-1">{selected.material || '—'}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Adjunto</p>{selected.attachmentPath ? <button type="button" onClick={() => download(selected)} className="mt-1 text-left text-caudal-electric underline">{selected.attachmentName || 'Descargar archivo'}</button> : <p className="mt-1">Sin archivo.</p>}</div></div></div></section> : null}
    {shareTask ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#071327] p-5 shadow-2xl"><h2 className="text-lg font-black text-white">Compartir tarea</h2><p className="mt-1 text-xs text-slate-500">Selecciona miembros STAFF del mismo club. No se comparte con jugadores.</p><div className="mt-4 grid max-h-64 gap-2 overflow-y-auto">{memberships.filter((member) => member.user_id !== userId).map((member) => <label key={member.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={shareIds.includes(member.id)} onChange={(event) => setShareIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} />{member.role.toUpperCase()} · {member.user_id}</label>)}</div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShareTask(null)} className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300">Cancelar</button><button type="button" onClick={saveShare} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black text-slate-950">Guardar compartición</button></div></section></div> : null}
    {selected && !draft ? <section className="rounded-[1.35rem] border border-white/10 bg-[#071327]/95 p-4 sm:p-5"><div className="grid gap-4 text-sm text-slate-300 sm:grid-cols-2"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Etapa</p><p className="mt-1">{selected.stageKeys?.length ? selected.stageKeys.map(getTrainingTaskStageLabel).join(' · ') : 'Sin etapa'}</p></div><div className="sm:col-span-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Variantes</p><p className="mt-1 whitespace-pre-wrap">{selected.variants || 'Sin variantes.'}</p></div></div><FeedbackPanel rows={feedbackRows} loading={feedbackLoading} error={feedbackError} draft={feedbackDraft} setDraft={setFeedbackDraft} editingId={feedbackEditingId} saving={feedbackSaving} userId={userId} onSave={saveFeedback} onEdit={editFeedback} onCancelEdit={resetFeedbackDraft} onDelete={removeFeedback} /></section> : null}
  </main>;
}
