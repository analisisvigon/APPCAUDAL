import { useEffect, useState } from 'react';
import {
  createUrlMedia,
  deleteTaskMedia,
  getTaskMediaSignedUrl,
  listTaskMedia,
  reorderTaskMedia,
  setTaskMediaPrimary,
  updateTaskMediaMetadata,
  uploadTaskMediaFile,
} from '../../utils/trainingTaskMedia';
import { detectVideoProvider, getVideoThumbnailUrl } from '../../utils/videoProvider';
import TrainingTaskMediaVideoPlayer from './TrainingTaskMediaVideoPlayer';

const emptyForm = { title: '', caption: '', url: '' };
const labelFor = (media) => media.title || media.originalName || (media.provider === 'external' ? 'Enlace externo' : 'Contenido multimedia');

function MediaThumbnail({ client, media }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    setUrl('');
    if (media.kind === 'video') {
      setUrl(getVideoThumbnailUrl(detectVideoProvider(media.originalUrl)));
      return () => { active = false; };
    }
    if (media.kind !== 'image') return () => { active = false; };
    getTaskMediaSignedUrl(client, media).then((next) => { if (active) setUrl(next); }).catch(() => {});
    return () => { active = false; };
  }, [client, media.id]);
  if (url) return <img src={url} alt="" className="h-20 w-28 rounded-xl bg-black object-cover" />;
  return <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl bg-black/30 text-center text-[10px] font-black uppercase text-slate-500">{media.kind === 'document' ? 'PDF' : media.provider || media.kind}</div>;
}

export default function TrainingTaskMediaPanel({ client, task, canManage, onChange, embedded = false }) {
  const [rows, setRows] = useState(task.media || []);
  const [mode, setMode] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState(null);

  const apply = (next) => { setRows(next); onChange?.(next); };
  useEffect(() => {
    let active = true;
    setRows(task.media || []);
    listTaskMedia(client, task.id).then((loaded) => { if (active) apply(loaded); }).catch((failure) => { if (active) setError(failure.message || 'No se pudo cargar Multimedia.'); });
    return () => { active = false; };
  }, [client, task.id]);

  const run = async (operation) => {
    setBusy(true); setError('');
    try { await operation(); } catch (failure) { setError(failure.message || 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };
  const resetForm = () => { setMode(''); setEditingId(''); setForm(emptyForm); setFile(null); };
  const addUpload = () => run(async () => {
    if (!file) throw new Error('Selecciona una imagen o PDF.');
    const created = await uploadTaskMediaFile(client, task, file, { ...form, sortOrder: rows.length });
    apply([...rows, created]); resetForm();
  });
  const addUrl = () => run(async () => {
    const created = await createUrlMedia(client, task, { ...form, sortOrder: rows.length });
    apply([...rows, created]); resetForm();
  });
  const saveMetadata = (media) => run(async () => {
    const updated = await updateTaskMediaMetadata(client, media.id, form);
    apply(rows.map((row) => row.id === updated.id ? updated : row)); resetForm();
  });
  const markPrimary = (media) => run(async () => {
    await setTaskMediaPrimary(client, task.id, media.id, rows);
    apply(rows.map((row) => ({ ...row, isPrimary: row.id === media.id, is_primary: row.id === media.id })));
  });
  const move = (index, direction) => run(async () => apply(await reorderTaskMedia(client, rows, index, index + direction)));
  const remove = (media) => run(async () => {
    if (!window.confirm(`¿Eliminar “${labelFor(media)}”?`)) return;
    await deleteTaskMedia(client, media);
    apply(rows.filter((row) => row.id !== media.id));
  });
  const open = (media, download = false) => run(async () => {
    if (media.source === 'upload') {
      const signedUrl = await getTaskMediaSignedUrl(client, media, download);
      if (media.kind === 'image' && !download) setViewer({ media, url: signedUrl });
      else window.open(signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (media.kind === 'video') setViewer({ media, url: media.originalUrl });
    else window.open(media.originalUrl, '_blank', 'noopener,noreferrer');
  });

  return <section className={embedded ? 'min-w-0' : 'mt-5 border-t border-white/10 pt-5'} aria-labelledby={`media-${task.id}`}>
    <div className={`flex flex-wrap gap-3 ${embedded ? 'justify-end' : 'items-start justify-between'}`}><div className={embedded ? 'sr-only' : ''}><p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Material de apoyo</p><h3 id={`media-${task.id}`} className="mt-1 text-base font-black text-white">Multimedia</h3></div>{canManage ? <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { resetForm(); setMode('upload'); }} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white">Subir archivo</button><button type="button" disabled={busy} onClick={() => { resetForm(); setMode('url'); }} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black text-slate-950">Pegar enlace</button></div> : null}</div>
    {error ? <p role="alert" className="mt-3 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100">{error}</p> : null}
    {canManage && mode ? <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-2">{mode === 'url' ? <input type="url" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://…" aria-label="URL multimedia" className="min-h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white sm:col-span-2" /> : <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} className="min-h-10 text-xs text-slate-300 sm:col-span-2" />}<input value={form.title} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Título opcional" className="min-h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white" /><input value={form.caption} maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))} placeholder="Nota opcional" className="min-h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white" /><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={resetForm} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-slate-300">Cancelar</button><button type="button" disabled={busy} onClick={mode === 'url' ? addUrl : addUpload} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{busy ? 'Guardando…' : 'Añadir'}</button></div></div> : null}
    <div className="mt-4 grid gap-3">{rows.length ? rows.map((media, index) => <article key={media.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><div className="flex gap-3"><MediaThumbnail client={client} media={media} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black text-white">{labelFor(media)}</p>{media.isPrimary ? <span className="rounded-full bg-caudal-electric/15 px-2 py-1 text-[9px] font-black uppercase text-caudal-electric">Principal</span> : null}</div><p className="mt-1 text-[10px] font-bold uppercase text-slate-500">{media.source === 'upload' ? media.mimeType : media.provider}</p>{media.caption ? <p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{media.caption}</p> : null}</div></div>{editingId === media.id ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={form.title} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="rounded-xl bg-black/30 px-3 py-2 text-sm text-white" placeholder="Título" /><input value={form.caption} maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))} className="rounded-xl bg-black/30 px-3 py-2 text-sm text-white" placeholder="Nota" /><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={resetForm} className="px-3 py-2 text-xs text-slate-400">Cancelar</button><button type="button" onClick={() => saveMetadata(media)} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black text-slate-950">Guardar</button></div></div> : <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => open(media)} className="rounded-lg bg-white/10 px-2.5 py-2 text-[10px] font-black text-white">Abrir</button>{media.source === 'upload' ? <button type="button" onClick={() => open(media, true)} className="rounded-lg bg-white/10 px-2.5 py-2 text-[10px] font-black text-caudal-electric">Descargar</button> : null}{canManage ? <><button type="button" onClick={() => { setEditingId(media.id); setMode(''); setForm({ ...emptyForm, title: media.title || '', caption: media.caption || '' }); }} className="rounded-lg px-2.5 py-2 text-[10px] font-black text-slate-300">Editar texto</button>{!media.isPrimary ? <button type="button" onClick={() => markPrimary(media)} className="rounded-lg px-2.5 py-2 text-[10px] font-black text-slate-300">Marcar principal</button> : null}<button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded-lg px-2.5 py-2 text-[10px] font-black text-slate-300 disabled:opacity-30">Subir</button><button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)} className="rounded-lg px-2.5 py-2 text-[10px] font-black text-slate-300 disabled:opacity-30">Bajar</button><button type="button" onClick={() => remove(media)} className="rounded-lg px-2.5 py-2 text-[10px] font-black text-red-200">Eliminar</button></> : null}</div>}</article>) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">Sin contenido multimedia.</p>}</div>
    {viewer ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#071327] p-4"><div className="mb-3 flex items-center justify-between gap-3"><h4 className="font-black text-white">{labelFor(viewer.media)}</h4><button type="button" onClick={() => setViewer(null)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white">Cerrar</button></div>{viewer.media.kind === 'image' ? <img src={viewer.url} alt={viewer.media.title || viewer.media.originalName || 'Imagen de la tarea'} className="max-h-[75vh] w-full object-contain" /> : <TrainingTaskMediaVideoPlayer url={viewer.url} title={labelFor(viewer.media)} />}</div></div> : null}
  </section>;
}
