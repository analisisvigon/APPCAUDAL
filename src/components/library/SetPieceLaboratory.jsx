import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  SET_PIECE_LAB_MARKINGS,
  SET_PIECE_LAB_MECHANISMS,
  SET_PIECE_LAB_CATEGORY,
  SET_PIECE_LAB_STATUSES,
  SET_PIECE_LAB_TYPES,
  SET_PIECE_LAB_ZONES,
  buildSetPieceLaboratoryPayload,
  createSetPieceLaboratoryDraft,
  duplicateSetPieceLaboratoryItem,
  filterAndSortSetPieceLaboratoryItems,
  getSetPieceLaboratoryMeta,
  getSetPieceLabType,
  prepareSetPieceLaboratoryItem,
  validateSetPieceLaboratoryMeta,
} from '../../utils/setPieceLaboratory';
import {
  getSetPieceChronology,
  getSetPieceTacticalMeta,
  setSetPieceTacticalMeta,
} from '../../utils/setPieceProfessional';
import SetPieceDiagramCanvas from '../print/SetPieceDiagramCanvas';
import SetPieceDiagramEditor from '../print/SetPieceDiagramEditor';

const controlClass = 'min-h-11 w-full rounded-xl border border-white/10 bg-white px-3 py-2.5 text-sm font-bold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric';
const darkControlClass = 'min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-caudal-electric';
const buttonFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#071327]';

const formatDate = (value) => {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const statusLabel = (status) => SET_PIECE_LAB_STATUSES.find((entry) => entry.id === status)?.label || 'Borrador';

function ClassificationPill({ children }) {
  if (!children) return null;
  return <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-slate-300">{children}</span>;
}

function LaboratoryPreview({ item, onClose }) {
  const meta = getSetPieceLaboratoryMeta(item);
  const chronology = getSetPieceChronology(item.elements, []);
  const closeButtonRef = useRef(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', close);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-slate-950/95 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="laboratory-preview-title">
      <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-[#071327] p-4 shadow-2xl sm:p-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-caudal-electric">Vista previa · Laboratorio ABP</p>
            <h2 id="laboratory-preview-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">{item.nombre}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <ClassificationPill>{getSetPieceLabType(item.tipo).label}</ClassificationPill>
              <ClassificationPill>{meta.libraryZone}</ClassificationPill>
              <ClassificationPill>{meta.libraryMechanism}</ClassificationPill>
              <ClassificationPill>{meta.libraryMarking}</ClassificationPill>
              <ClassificationPill>{statusLabel(meta.libraryStatus)}</ClassificationPill>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className={`min-h-11 rounded-xl bg-white/10 px-5 text-sm font-black text-white ${buttonFocus}`}>Cerrar</button>
        </header>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
          <div className="rounded-3xl bg-white p-3 text-black">
            <SetPieceDiagramCanvas elements={item.elements || []} players={[]} readOnly printOptimized fullField={String(item.tipo).includes('saque_inicio')} />
          </div>
          <div className="space-y-4 text-sm text-slate-300">
            <section className="rounded-2xl bg-white/[0.05] p-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-caudal-electric">Objetivo</h3><p className="mt-2 leading-6">{meta.objective || 'Sin objetivo definido.'}</p></section>
            <section className="rounded-2xl bg-white/[0.05] p-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-caudal-electric">Consigna</h3><p className="mt-2 leading-6">{meta.generalInstruction || item.descripcion || 'Sin consigna definida.'}</p></section>
            <section className="rounded-2xl bg-white/[0.05] p-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-caudal-electric">Cronología</h3>{chronology.length ? <ol className="mt-2 space-y-2">{chronology.map((step) => <li key={step.id} className="grid grid-cols-[28px_1fr] gap-2"><b className="flex h-7 w-7 items-center justify-center rounded-full bg-caudal-electric text-slate-950">{step.order}</b><span><strong className="text-white">{step.playerName}</strong> · {step.instruction}</span></li>)}</ol> : <p className="mt-2 text-slate-500">Sin pasos definidos.</p>}</section>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function SetPieceLaboratory() {
  const [items, setItems] = useState([]);
  const [view, setView] = useState('gallery');
  const [draft, setDraft] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [controls, setControls] = useState({ search: '', zone: '', mechanism: '', marking: '', status: '', favorites: false, sort: 'updated' });
  const galleryScrollRef = useRef(0);

  const loadItems = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase
        .from('training_library')
        .select('*')
        .eq('categoria', SET_PIECE_LAB_CATEGORY)
        .order('updated_at', { ascending: false });
      if (loadError) throw loadError;
      setItems((data || []).map(prepareSetPieceLaboratoryItem));
    } catch (loadError) {
      console.error('Error cargando Laboratorio ABP:', loadError);
      setError(loadError.message || 'No se pudo cargar el Laboratorio ABP.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, []);

  const visibleItems = useMemo(() => filterAndSortSetPieceLaboratoryItems(items, controls), [items, controls]);
  const updateControls = (patch) => setControls((current) => ({ ...current, ...patch }));
  const rememberGalleryPosition = () => { galleryScrollRef.current = window.scrollY; };
  const returnToGallery = () => {
    setView('gallery');
    setDraft(null);
    setError('');
    window.setTimeout(() => window.scrollTo({ top: galleryScrollRef.current, behavior: 'auto' }), 0);
  };

  const startNew = () => {
    rememberGalleryPosition();
    setDraft(createSetPieceLaboratoryDraft());
    setError('');
    setStatus('');
    setView('editor');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const editItem = (item) => {
    rememberGalleryPosition();
    setDraft(prepareSetPieceLaboratoryItem(item));
    setError('');
    setStatus('');
    setView('editor');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const updateDraftMeta = (patch) => setDraft((current) => {
    const meta = getSetPieceLaboratoryMeta(current);
    return { ...current, elements: setSetPieceTacticalMeta(current.elements, { ...meta, ...patch }) };
  });

  const saveDraft = async () => {
    if (!draft) return;
    const meta = getSetPieceLaboratoryMeta(draft);
    const missing = validateSetPieceLaboratoryMeta(meta);
    if (missing.length) {
      setError(`Para marcarla como Lista para usar completa: ${missing.join(', ')}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = buildSetPieceLaboratoryPayload(draft);
      const { id, ...fields } = payload;
      const request = draft.isNew
        ? supabase.from('training_library').insert(payload).select('*').single()
        : supabase.from('training_library').update(fields).eq('id', draft.id).select('*').single();
      const { data, error: saveError } = await request;
      if (saveError) throw saveError;
      const saved = prepareSetPieceLaboratoryItem(data);
      setItems((current) => draft.isNew ? [saved, ...current] : current.map((item) => item.id === saved.id ? saved : item));
      setStatus(draft.isNew ? 'Jugada creada en el Laboratorio ABP.' : 'Jugada actualizada.');
      returnToGallery();
    } catch (saveError) {
      console.error('Error guardando jugada del Laboratorio ABP:', saveError);
      setError(saveError.message || 'No se pudo guardar la jugada.');
    } finally {
      setSaving(false);
    }
  };

  const persistMetaPatch = async (item, patch, message) => {
    setError('');
    const now = new Date().toISOString();
    const meta = { ...getSetPieceLaboratoryMeta(item), ...patch, libraryUpdatedAt: now, libraryVersion: now, linkStatus: 'master' };
    const elements = setSetPieceTacticalMeta(item.elements, meta);
    const { data, error: updateError } = await supabase.from('training_library').update({ elements }).eq('id', item.id).select('*').single();
    if (updateError) throw updateError;
    const saved = prepareSetPieceLaboratoryItem(data);
    setItems((current) => current.map((entry) => entry.id === saved.id ? saved : entry));
    setStatus(message);
    return saved;
  };

  const toggleFavorite = async (item) => {
    try {
      const meta = getSetPieceLaboratoryMeta(item);
      await persistMetaPatch(item, { libraryFavorite: !meta.libraryFavorite }, !meta.libraryFavorite ? 'Añadida a favoritas.' : 'Eliminada de favoritas.');
    } catch (favoriteError) {
      console.error('Error actualizando favorita ABP:', favoriteError);
      setError(favoriteError.message || 'No se pudo actualizar la favorita.');
    }
  };

  const toggleArchived = async (item) => {
    try {
      const archived = getSetPieceLaboratoryMeta(item).libraryStatus === 'archived';
      await persistMetaPatch(item, { libraryStatus: archived ? 'draft' : 'archived' }, archived ? 'Jugada restaurada como borrador.' : 'Jugada archivada.');
    } catch (archiveError) {
      console.error('Error archivando ABP:', archiveError);
      setError(archiveError.message || 'No se pudo archivar la jugada.');
    }
  };

  const duplicateItem = async (item) => {
    setSaving(true);
    setError('');
    try {
      const duplicate = duplicateSetPieceLaboratoryItem(item);
      const payload = buildSetPieceLaboratoryPayload(duplicate);
      const { data, error: duplicateError } = await supabase.from('training_library').insert(payload).select('*').single();
      if (duplicateError) throw duplicateError;
      setItems((current) => [prepareSetPieceLaboratoryItem(data), ...current]);
      setStatus('Jugada duplicada con identidad independiente.');
    } catch (duplicateError) {
      console.error('Error duplicando ABP:', duplicateError);
      setError(duplicateError.message || 'No se pudo duplicar la jugada.');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`¿Eliminar definitivamente “${item.nombre}”? Esta acción no se puede deshacer.`)) return;
    setError('');
    try {
      const { error: deleteError } = await supabase.from('training_library').delete().eq('id', item.id);
      if (deleteError) throw deleteError;
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setStatus('Jugada eliminada.');
    } catch (deleteError) {
      console.error('Error eliminando ABP:', deleteError);
      setError(deleteError.message || 'No se pudo eliminar la jugada.');
    }
  };

  if (view === 'editor' && draft) {
    const meta = getSetPieceLaboratoryMeta(draft);
    return (
      <section className="set-piece-laboratory-editor space-y-4" aria-labelledby="laboratory-editor-title">
        <header className="rounded-3xl border border-white/10 bg-[#071327] p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-caudal-electric">Laboratorio ABP · Editor</p><h2 id="laboratory-editor-title" className="mt-2 text-2xl font-black text-white">{draft.isNew ? 'Nueva jugada' : draft.nombre}</h2><p className="mt-2 text-sm text-slate-400">Plantilla maestra del club · participantes definidos exclusivamente por roles.</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPreviewItem(draft)} className={`min-h-11 rounded-xl bg-white/10 px-4 text-sm font-black text-white ${buttonFocus}`}>Vista previa</button><button type="button" onClick={returnToGallery} className={`min-h-11 rounded-xl bg-white/10 px-4 text-sm font-black text-white ${buttonFocus}`}>Cancelar</button><button type="button" onClick={saveDraft} disabled={saving} className={`min-h-11 rounded-xl bg-caudal-electric px-5 text-sm font-black text-slate-950 disabled:opacity-50 ${buttonFocus}`}>{saving ? 'Guardando…' : 'Guardar y volver'}</button></div>
          </div>
          {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-100">{error}</p> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <label className="grid gap-1 xl:col-span-2"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Nombre</span><input value={draft.nombre} onChange={(event) => setDraft((current) => ({ ...current, nombre: event.target.value }))} className={darkControlClass} placeholder="Nombre de la jugada" /></label>
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Tipo</span><select value={draft.tipo} onChange={(event) => setDraft((current) => ({ ...current, tipo: event.target.value, categoria: getSetPieceLabType(event.target.value).category }))} className={controlClass}>{SET_PIECE_LAB_TYPES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Zona objetivo</span><select value={meta.libraryZone} onChange={(event) => updateDraftMeta({ libraryZone: event.target.value })} className={controlClass}><option value="">Sin definir</option>{SET_PIECE_LAB_ZONES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Mecanismo</span><select value={meta.libraryMechanism} onChange={(event) => updateDraftMeta({ libraryMechanism: event.target.value })} className={controlClass}><option value="">Sin definir</option>{SET_PIECE_LAB_MECHANISMS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Marcaje rival</span><select value={meta.libraryMarking} onChange={(event) => updateDraftMeta({ libraryMarking: event.target.value })} className={controlClass}><option value="">Sin definir</option>{SET_PIECE_LAB_MARKINGS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Estado</span><select value={meta.libraryStatus} onChange={(event) => updateDraftMeta({ libraryStatus: event.target.value })} className={controlClass}>{SET_PIECE_LAB_STATUSES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
            <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-bold text-white"><input type="checkbox" checked={meta.libraryFavorite} onChange={(event) => updateDraftMeta({ libraryFavorite: event.target.checked })} className="h-5 w-5 accent-[#4f8cff]" /> Favorita</label>
          </div>
        </header>
        <SetPieceDiagramEditor
          diagram={{ ...draft, titulo: draft.nombre, consigna: getSetPieceTacticalMeta(draft.elements).generalInstruction || draft.descripcion }}
          players={[]}
          roleOnly
          onChange={(next) => setDraft((current) => ({ ...current, nombre: next.titulo ?? current.nombre, descripcion: next.consigna ?? current.descripcion, elements: next.elements || current.elements }))}
        />
        {previewItem ? <LaboratoryPreview item={previewItem} onClose={() => setPreviewItem(null)} /> : null}
      </section>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="set-piece-laboratory-title">
      <header className="rounded-3xl border border-white/10 bg-[#071327] p-5 shadow-glow sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-caudal-electric">Biblioteca · ABP</p><h2 id="set-piece-laboratory-title" className="mt-2 text-3xl font-black text-white">LABORATORIO ABP</h2><p className="mt-2 text-sm text-slate-400">Biblioteca táctica de acciones a balón parado del club.</p></div>
          <button type="button" onClick={startNew} className={`min-h-11 rounded-2xl bg-caudal-electric px-5 text-sm font-black text-slate-950 ${buttonFocus}`}>+ Nueva jugada</button>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto]">
          <label className="relative"><span className="sr-only">Buscar jugadas</span><input value={controls.search} onChange={(event) => updateControls({ search: event.target.value })} placeholder="Buscar por nombre, objetivo o consigna" className={darkControlClass} /></label>
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} className={`min-h-11 rounded-xl bg-white/10 px-5 text-sm font-black text-white ${buttonFocus}`}>Filtros</button>
          <label><span className="sr-only">Ordenar jugadas</span><select value={controls.sort} onChange={(event) => updateControls({ sort: event.target.value })} className={controlClass}><option value="updated">Última modificación</option><option value="name">Nombre</option><option value="type">Tipo</option><option value="favorites">Favoritas</option></select></label>
        </div>
        {filtersOpen ? (
          <div className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-black/15 p-3 sm:grid-cols-2 xl:grid-cols-5">
            <label><span className="sr-only">Filtrar por zona</span><select value={controls.zone} onChange={(event) => updateControls({ zone: event.target.value })} className={controlClass}><option value="">Todas las zonas</option>{SET_PIECE_LAB_ZONES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className="sr-only">Filtrar por mecanismo</span><select value={controls.mechanism} onChange={(event) => updateControls({ mechanism: event.target.value })} className={controlClass}><option value="">Todos los mecanismos</option>{SET_PIECE_LAB_MECHANISMS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className="sr-only">Filtrar por marcaje</span><select value={controls.marking} onChange={(event) => updateControls({ marking: event.target.value })} className={controlClass}><option value="">Todos los marcajes</option>{SET_PIECE_LAB_MARKINGS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className="sr-only">Filtrar por estado</span><select value={controls.status} onChange={(event) => updateControls({ status: event.target.value })} className={controlClass}><option value="">Todos los estados</option>{SET_PIECE_LAB_STATUSES.map((entry) => <option key={entry.id} value={entry.id}>{entry.id === 'ready' ? 'Lista' : entry.label}</option>)}</select></label>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-bold text-white"><input type="checkbox" checked={controls.favorites} onChange={(event) => updateControls({ favorites: event.target.checked })} className="h-5 w-5 accent-[#4f8cff]" /> Solo favoritas</label>
          </div>
        ) : null}
      </header>

      {loading ? <p className="rounded-2xl bg-white/[0.04] p-5 text-sm text-slate-400">Cargando Laboratorio ABP…</p> : null}
      {error ? <p role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</p> : null}
      {status ? <p role="status" className="rounded-2xl bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">{status}</p> : null}

      {!loading && visibleItems.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Jugadas del Laboratorio ABP">
          {visibleItems.map((item) => {
            const meta = getSetPieceLaboratoryMeta(item);
            const archived = meta.libraryStatus === 'archived';
            return (
              <article key={item.id} className={`overflow-hidden rounded-3xl border bg-[#091428]/90 shadow-glow ${archived ? 'border-slate-600/30 opacity-75' : 'border-white/10'}`}>
                <div className="relative bg-white p-3 text-black"><SetPieceDiagramCanvas elements={item.elements || []} players={[]} readOnly fullField={String(item.tipo).includes('saque_inicio')} /><button type="button" aria-label={meta.libraryFavorite ? `Quitar ${item.nombre} de favoritas` : `Marcar ${item.nombre} como favorita`} aria-pressed={meta.libraryFavorite} onClick={() => toggleFavorite(item)} className={`absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border text-xl shadow-lg ${meta.libraryFavorite ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-slate-300 bg-white text-slate-500'} ${buttonFocus}`}>★</button></div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-caudal-electric">{getSetPieceLabType(item.tipo).label}</p><h3 className="mt-1 truncate text-lg font-black text-white">{item.nombre || 'Jugada sin nombre'}</h3></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${meta.libraryStatus === 'ready' ? 'bg-emerald-300/15 text-emerald-200' : archived ? 'bg-slate-400/15 text-slate-300' : 'bg-amber-300/15 text-amber-200'}`}>{statusLabel(meta.libraryStatus)}</span></div>
                  <div className="mt-3 flex flex-wrap gap-1.5"><ClassificationPill>{meta.libraryZone}</ClassificationPill><ClassificationPill>{meta.libraryMechanism}</ClassificationPill><ClassificationPill>{meta.libraryMarking}</ClassificationPill></div>
                  <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-slate-400">{meta.objective || item.objetivo || meta.generalInstruction || item.descripcion || 'Sin objetivo definido.'}</p>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Actualizada {formatDate(item.updated_at || meta.libraryUpdatedAt)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <button type="button" onClick={() => editItem(item)} className={`min-h-11 rounded-xl bg-caudal-electric px-3 text-xs font-black text-slate-950 ${buttonFocus}`}>Abrir</button>
                    <button type="button" onClick={() => setPreviewItem(item)} className={`min-h-11 rounded-xl bg-white/10 px-3 text-xs font-black text-white ${buttonFocus}`}>Vista previa</button>
                    <button type="button" onClick={() => duplicateItem(item)} disabled={saving} className={`min-h-11 rounded-xl bg-white/10 px-3 text-xs font-black text-white disabled:opacity-50 ${buttonFocus}`}>Duplicar</button>
                    <button type="button" onClick={() => toggleArchived(item)} className={`min-h-11 rounded-xl bg-white/10 px-3 text-xs font-black text-white ${buttonFocus}`}>{archived ? 'Restaurar' : 'Archivar'}</button>
                    <button type="button" onClick={() => deleteItem(item)} className={`min-h-11 rounded-xl bg-red-500/15 px-3 text-xs font-black text-red-100 ${buttonFocus}`}>Eliminar</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {!loading && !visibleItems.length ? <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center"><p className="text-lg font-black text-white">No hay jugadas que coincidan</p><p className="mt-2 text-sm text-slate-500">Crea la primera jugada o limpia los filtros activos.</p><button type="button" onClick={startNew} className={`mt-5 min-h-11 rounded-xl bg-caudal-electric px-5 text-sm font-black text-slate-950 ${buttonFocus}`}>+ Nueva jugada</button></div> : null}
      {previewItem ? <LaboratoryPreview item={previewItem} onClose={() => setPreviewItem(null)} /> : null}
    </section>
  );
}
