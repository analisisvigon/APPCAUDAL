import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  SET_PIECE_LAB_MARKINGS,
  SET_PIECE_LAB_MECHANISMS,
  SET_PIECE_LAB_BASE_TYPES,
  SET_PIECE_LAB_STATUSES,
  SET_PIECE_LAB_TYPES,
  SET_PIECE_LAB_ZONES,
  SET_PIECE_PHASES,
  buildSetPieceLaboratoryPayload,
  createSetPieceLaboratoryDraft,
  duplicateSetPieceLaboratoryItem,
  filterAndSortSetPieceLaboratoryItems,
  getSetPieceClassificationLabel,
  getSetPiecePhase,
  getSetPieceLaboratoryMeta,
  getSetPieceLabType,
  isSetPieceLibraryItem,
  mergeSetPieceLaboratoryEditorChange,
  prepareSetPieceLaboratoryItem,
  saveSetPieceLaboratoryDraft,
  upsertSetPieceLaboratoryItem,
  validateSetPieceLaboratoryMeta,
} from '../../utils/setPieceLaboratory';
import {
  SET_PIECE_DELIVERY_TYPES,
  getSetPieceDefenseTypeLabel,
  getSetPieceDefensiveStructure,
  getSetPieceDeliveryTypeLabel,
  getSetPieceChronology,
  getSetPieceTacticalMeta,
  setSetPieceTacticalMeta,
} from '../../utils/setPieceProfessional';
import SetPieceDiagramCanvas from '../print/SetPieceDiagramCanvas';
import SetPieceDiagramEditor from '../print/SetPieceDiagramEditor';
import SetPieceDiagramPrintSheet from '../print/SetPieceDiagramPrintSheet';
import { areSetPieceLabelsEquivalent } from '../../utils/setPiecePrintModel';
import { createSetPieceThumbnailLayers } from '../../utils/setPieceRenderLayout';

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
  const classificationLabel = getSetPieceClassificationLabel(item);
  const displayName = areSetPieceLabelsEquivalent(classificationLabel, item.nombre, item.orden) ? '' : item.nombre;
  const defensive = getSetPiecePhase(item) === SET_PIECE_PHASES.DEFENSIVE;
  const defensiveStructure = getSetPieceDefensiveStructure(item.elements);
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
            <h2 id="laboratory-preview-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">{displayName || classificationLabel}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {displayName ? <ClassificationPill>{classificationLabel}</ClassificationPill> : null}
              {defensive ? <ClassificationPill>{getSetPieceDefenseTypeLabel(meta.libraryMarking) ? `Defensa ${getSetPieceDefenseTypeLabel(meta.libraryMarking)}` : ''}</ClassificationPill> : <>
                <ClassificationPill>{meta.libraryZone}</ClassificationPill>
                <ClassificationPill>{meta.libraryMechanism}</ClassificationPill>
                <ClassificationPill>{meta.libraryMarking}</ClassificationPill>
                <ClassificationPill>{getSetPieceDeliveryTypeLabel(meta.deliveryType)}</ClassificationPill>
              </>}
              <ClassificationPill>{statusLabel(meta.libraryStatus)}</ClassificationPill>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className={`min-h-11 rounded-xl bg-white/10 px-5 text-sm font-black text-white ${buttonFocus}`}>Cerrar</button>
        </header>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
          <div className="rounded-3xl bg-white p-3 text-black">
            <SetPieceDiagramCanvas elements={item.elements || []} players={[]} readOnly printOptimized visibleLayers={meta.displayLayers} fullField={String(item.tipo).includes('saque_inicio')} />
          </div>
          <div className="space-y-4 text-sm text-slate-300">
            {meta.signal ? <section className="rounded-2xl border border-caudal-electric/25 bg-caudal-electric/[0.08] p-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-caudal-electric">Señal</h3><p className="mt-2 text-lg font-black text-white">{meta.signal}</p></section> : null}
            {defensiveStructure ? <section className="rounded-2xl bg-white/[0.05] p-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-caudal-electric">Estructura</h3><p className="mt-2 font-black uppercase leading-6 text-white">{defensiveStructure}</p></section> : null}
            <section className="rounded-2xl bg-white/[0.05] p-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-caudal-electric">{defensive ? 'Clave defensiva' : 'Objetivo'}</h3><p className="mt-2 leading-6">{meta.objective || 'Sin definir.'}</p></section>
            <section className="rounded-2xl bg-white/[0.05] p-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-caudal-electric">Consigna</h3><p className="mt-2 leading-6">{meta.generalInstruction || 'Sin consigna definida.'}</p></section>
            {meta.displayLayers.chronology ? <section className="rounded-2xl bg-white/[0.05] p-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-caudal-electric">Cronología</h3>{chronology.length ? <ol className="mt-2 space-y-2">{chronology.map((step) => <li key={step.id} className="grid grid-cols-[28px_1fr] gap-2"><b className="flex h-7 w-7 items-center justify-center rounded-full bg-caudal-electric text-slate-950">{step.order}</b><span><strong className="text-white">{step.playerName}</strong>{meta.displayLayers.roles && step.role ? ` · ${step.role}` : ''}{step.instruction ? ` — ${step.instruction}` : ''}</span></li>)}</ol> : <p className="mt-2 text-slate-500">Sin pasos definidos.</p>}</section> : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function LaboratoryPrintPreview({ items, onClose }) {
  const closeButtonRef = useRef(null);
  const printDiagrams = items.map((item, index) => ({
    ...item,
    titulo: item.titulo || item.nombre,
    consigna: item.consigna ?? getSetPieceLaboratoryMeta(item).generalInstruction,
    orden: Number(item.orden) || index + 1,
  }));
  useEffect(() => {
    closeButtonRef.current?.focus();
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const printPreview = () => {
    document.body.classList.add('printing-set-piece-preview');
    const cleanup = () => document.body.classList.remove('printing-set-piece-preview');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  };
  return createPortal(
    <div className="set-piece-preview-overlay fixed inset-0 z-[140] overflow-auto bg-slate-950/95 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Impresión de jugadas ABP">
      <div className="print-hidden sticky top-0 z-10 mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b1629]/95 p-3 shadow-2xl backdrop-blur">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Impresión ABP</p><p className="mt-1 text-xs text-slate-400">{items.length} {items.length === 1 ? 'jugada' : 'jugadas'} · dos por hoja</p></div>
        <div className="flex gap-2"><button type="button" onClick={printPreview} className={`min-h-11 rounded-xl bg-caudal-electric px-4 text-xs font-black text-slate-950 ${buttonFocus}`}>Imprimir / PDF</button><button ref={closeButtonRef} type="button" onClick={onClose} className={`min-h-11 rounded-xl bg-white/10 px-4 text-xs font-black text-white ${buttonFocus}`}>Cerrar</button></div>
      </div>
      <div className="mx-auto w-fit shadow-2xl"><SetPieceDiagramPrintSheet title="Biblioteca ABP" diagrams={printDiagrams} players={[]} preview /></div>
    </div>,
    document.body
  );
}

export default function SetPieceLaboratory() {
  const [items, setItems] = useState([]);
  const [view, setView] = useState('gallery');
  const [draft, setDraft] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [printPreviewItems, setPrintPreviewItems] = useState([]);
  const [selectedPrintIds, setSelectedPrintIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuItemId, setMenuItemId] = useState('');
  const [controls, setControls] = useState({ search: '', phase: SET_PIECE_PHASES.ALL, types: [], zone: '', mechanism: '', marking: '', status: '', favorites: false, sort: 'updated' });
  const galleryScrollRef = useRef(0);
  const menuRef = useRef(null);

  const loadItems = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase
        .from('training_library')
        .select('*')
        .order('updated_at', { ascending: false });
      if (loadError) throw loadError;
      setItems((data || []).filter(isSetPieceLibraryItem).map(prepareSetPieceLaboratoryItem));
    } catch (loadError) {
      console.error('Error cargando Laboratorio ABP:', loadError);
      setError(loadError.message || 'No se pudo cargar el Laboratorio ABP.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, []);

  useEffect(() => {
    if (!menuItemId) return undefined;
    const closeMenu = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !menuRef.current?.contains(event.target))) setMenuItemId('');
    };
    window.addEventListener('keydown', closeMenu);
    window.addEventListener('pointerdown', closeMenu);
    return () => {
      window.removeEventListener('keydown', closeMenu);
      window.removeEventListener('pointerdown', closeMenu);
    };
  }, [menuItemId]);

  const visibleItems = useMemo(() => filterAndSortSetPieceLaboratoryItems(items, controls), [items, controls]);
  const phaseCounts = useMemo(() => ({
    [SET_PIECE_PHASES.ALL]: items.length,
    [SET_PIECE_PHASES.OFFENSIVE]: items.filter((item) => getSetPiecePhase(item) === SET_PIECE_PHASES.OFFENSIVE).length,
    [SET_PIECE_PHASES.DEFENSIVE]: items.filter((item) => getSetPiecePhase(item) === SET_PIECE_PHASES.DEFENSIVE).length,
  }), [items]);
  const selectedPrintItems = useMemo(() => items.filter((item) => selectedPrintIds.includes(item.id)), [items, selectedPrintIds]);
  const updateControls = (patch) => setControls((current) => ({ ...current, ...patch }));
  const toggleTypeFilter = (type) => setControls((current) => ({
    ...current,
    types: current.types.includes(type) ? current.types.filter((entry) => entry !== type) : [...current.types, type],
  }));
  const activeSecondaryFilterCount = controls.types.length
    + [controls.zone, controls.mechanism, controls.marking, controls.status].filter(Boolean).length
    + Number(controls.favorites);
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
    const missing = validateSetPieceLaboratoryMeta(meta, draft.tipo);
    if (missing.length) {
      setError(`Para marcarla como Lista para usar completa: ${missing.join(', ')}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { inserted, saved } = await saveSetPieceLaboratoryDraft(supabase, draft);
      setItems((current) => upsertSetPieceLaboratoryItem(current, saved, inserted));
      setStatus(inserted ? 'Jugada creada en el Laboratorio ABP.' : 'Jugada actualizada.');
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
      setSelectedPrintIds((current) => current.filter((id) => id !== item.id));
      setStatus('Jugada eliminada.');
    } catch (deleteError) {
      console.error('Error eliminando ABP:', deleteError);
      setError(deleteError.message || 'No se pudo eliminar la jugada.');
    }
  };

  if (view === 'editor' && draft) {
    const meta = getSetPieceLaboratoryMeta(draft);
    const defensive = getSetPiecePhase(draft) === SET_PIECE_PHASES.DEFENSIVE;
    const knownDraftType = SET_PIECE_LAB_TYPES.some((entry) => entry.id === draft.tipo);
    return (
      <section className="set-piece-laboratory-editor space-y-4" aria-labelledby="laboratory-editor-title">
        <header className="rounded-[28px] bg-[#071327]/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur sm:p-5 xl:sticky xl:top-2 xl:z-30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[0.22em] text-caudal-electric">Laboratorio ABP · Editor</p><label className="mt-1 block min-w-0"><span className="sr-only">Nombre de la jugada</span><input id="laboratory-editor-title" value={draft.nombre} onChange={(event) => setDraft((current) => ({ ...current, nombre: event.target.value }))} className="w-full min-w-0 max-w-full border-0 bg-transparent p-0 text-2xl font-black text-white outline-none placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-caudal-electric sm:text-3xl" placeholder={draft.isNew ? 'Nueva jugada' : 'Nombre de la jugada'} /></label><p className="mt-1 text-xs text-slate-500">Plantilla maestra · participantes por roles</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPreviewItem(draft)} className={`min-h-11 rounded-xl bg-white/[0.07] px-4 text-xs font-black text-white ${buttonFocus}`}>Vista previa</button><button type="button" onClick={returnToGallery} className={`min-h-11 rounded-xl bg-white/[0.07] px-4 text-xs font-black text-white ${buttonFocus}`}>Cancelar</button><button type="button" onClick={saveDraft} disabled={saving} className={`min-h-11 rounded-xl bg-caudal-electric px-5 text-xs font-black text-slate-950 disabled:opacity-50 ${buttonFocus}`}>{saving ? 'Guardando…' : 'Guardar y volver'}</button></div>
          </div>
          {error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-100">{error}</p> : null}
          <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-[1.15fr_repeat(4,minmax(0,1fr))_0.85fr_auto]">
            <label className="grid gap-1"><span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Fase · tipo de ABP</span><select value={draft.tipo} onChange={(event) => setDraft((current) => ({ ...current, tipo: event.target.value, categoria: getSetPieceLabType(event.target.value).category }))} className={controlClass}>{!knownDraftType ? <option value={draft.tipo}>Sin clasificar (valor existente)</option> : null}<optgroup label="Ofensivas">{SET_PIECE_LAB_TYPES.filter((entry) => entry.phase === SET_PIECE_PHASES.OFFENSIVE).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup><optgroup label="Defensivas">{SET_PIECE_LAB_TYPES.filter((entry) => entry.phase === SET_PIECE_PHASES.DEFENSIVE).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup></select></label>
            {defensive ? <label className="grid min-w-0 gap-1"><span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Tipo de defensa</span><select value={meta.libraryMarking} onChange={(event) => updateDraftMeta({ libraryMarking: event.target.value })} className={controlClass}><option value="">Sin definir</option><option value="Zonal">Zonal</option><option value="Individual">Individual</option><option value="Mixto">Mixta</option></select></label> : <>
              <label className="grid min-w-0 gap-1"><span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Zona objetivo</span><select value={meta.libraryZone} onChange={(event) => updateDraftMeta({ libraryZone: event.target.value })} className={controlClass}><option value="">Sin definir</option>{SET_PIECE_LAB_ZONES.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="grid min-w-0 gap-1"><span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Mecanismo</span><select value={meta.libraryMechanism} onChange={(event) => updateDraftMeta({ libraryMechanism: event.target.value })} className={controlClass}><option value="">Sin definir</option>{SET_PIECE_LAB_MECHANISMS.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="grid min-w-0 gap-1"><span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Marcaje rival</span><select value={meta.libraryMarking} onChange={(event) => updateDraftMeta({ libraryMarking: event.target.value })} className={controlClass}><option value="">Sin definir</option>{SET_PIECE_LAB_MARKINGS.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="grid min-w-0 gap-1"><span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Tipo de golpeo</span><select value={meta.deliveryType} onChange={(event) => updateDraftMeta({ deliveryType: event.target.value })} className={controlClass}><option value="">Sin definir</option>{SET_PIECE_DELIVERY_TYPES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
            </>}
            <label className="grid gap-1"><span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Estado</span><select value={meta.libraryStatus} onChange={(event) => updateDraftMeta({ libraryStatus: event.target.value })} className={controlClass}>{SET_PIECE_LAB_STATUSES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
            <button type="button" title={meta.libraryFavorite ? 'Quitar de favoritas' : 'Marcar como favorita'} aria-label={meta.libraryFavorite ? 'Quitar de favoritas' : 'Marcar como favorita'} aria-pressed={meta.libraryFavorite} onClick={() => updateDraftMeta({ libraryFavorite: !meta.libraryFavorite })} className={`mt-auto flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black ${meta.libraryFavorite ? 'bg-amber-300 text-slate-950' : 'bg-white/[0.06] text-slate-300'} ${buttonFocus}`}><span aria-hidden="true">★</span><span className="xl:sr-only">Favorita</span></button>
          </div>
        </header>
        <SetPieceDiagramEditor
          diagram={{ ...draft, titulo: draft.nombre, consigna: getSetPieceTacticalMeta(draft.elements).generalInstruction }}
          players={[]}
          roleOnly
          renderMode="abp"
          onChange={(next) => setDraft((current) => mergeSetPieceLaboratoryEditorChange(current, next))}
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
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPrintPreviewItems(selectedPrintItems.length ? selectedPrintItems : visibleItems)} disabled={!visibleItems.length && !selectedPrintItems.length} className={`min-h-11 rounded-2xl bg-white/10 px-5 text-sm font-black text-white disabled:opacity-40 ${buttonFocus}`}>Imprimir {selectedPrintItems.length ? `seleccionadas (${selectedPrintItems.length})` : 'visibles'}</button><button type="button" onClick={startNew} className={`min-h-11 rounded-2xl bg-caudal-electric px-5 text-sm font-black text-slate-950 ${buttonFocus}`}>+ Nueva jugada</button></div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
          <label className="relative"><span className="sr-only">Buscar jugadas</span><input value={controls.search} onChange={(event) => updateControls({ search: event.target.value })} placeholder="Buscar por nombre, objetivo o consigna" className={darkControlClass} /></label>
          <div className="grid min-h-11 grid-cols-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-1" aria-label="Filtrar por fase">
            {[
              { id: SET_PIECE_PHASES.ALL, label: 'Todas' },
              { id: SET_PIECE_PHASES.OFFENSIVE, label: 'Ofensivas' },
              { id: SET_PIECE_PHASES.DEFENSIVE, label: 'Defensivas' },
            ].map((phase) => <button key={phase.id} type="button" aria-pressed={controls.phase === phase.id} onClick={() => updateControls({ phase: phase.id })} className={`min-w-0 rounded-lg px-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition sm:px-3 ${controls.phase === phase.id ? 'bg-caudal-electric text-slate-950' : 'text-slate-300 hover:bg-white/[0.06]'} ${buttonFocus}`}><span>{phase.label}</span><span className="ml-1 opacity-70">{phaseCounts[phase.id]}</span></button>)}
          </div>
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} className={`min-h-11 rounded-xl bg-white/10 px-5 text-sm font-black text-white ${buttonFocus}`}>Filtros{activeSecondaryFilterCount ? ` (${activeSecondaryFilterCount})` : ''}</button>
          <label><span className="sr-only">Ordenar jugadas</span><select value={controls.sort} onChange={(event) => updateControls({ sort: event.target.value })} className={controlClass}><option value="updated">Última modificación</option><option value="name">Nombre</option><option value="type">Tipo</option><option value="favorites">Favoritas</option></select></label>
        </div>
        {filtersOpen ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
            <fieldset><legend className="mb-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Tipo de ABP</legend><div className="flex flex-wrap gap-2">{SET_PIECE_LAB_BASE_TYPES.map((type) => <label key={type.id} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold ${controls.types.includes(type.id) ? 'border-caudal-electric/50 bg-caudal-electric/10 text-white' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}><input type="checkbox" checked={controls.types.includes(type.id)} onChange={() => toggleTypeFilter(type.id)} className="h-4 w-4 accent-[#4f8cff]" />{type.label}</label>)}</div></fieldset>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label><span className="sr-only">Filtrar por zona</span><select value={controls.zone} onChange={(event) => updateControls({ zone: event.target.value })} className={controlClass}><option value="">Todas las zonas</option>{SET_PIECE_LAB_ZONES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className="sr-only">Filtrar por mecanismo</span><select value={controls.mechanism} onChange={(event) => updateControls({ mechanism: event.target.value })} className={controlClass}><option value="">Todos los mecanismos</option>{SET_PIECE_LAB_MECHANISMS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className="sr-only">Filtrar por marcaje</span><select value={controls.marking} onChange={(event) => updateControls({ marking: event.target.value })} className={controlClass}><option value="">Todos los marcajes</option>{SET_PIECE_LAB_MARKINGS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className="sr-only">Filtrar por estado</span><select value={controls.status} onChange={(event) => updateControls({ status: event.target.value })} className={controlClass}><option value="">Todos los estados</option>{SET_PIECE_LAB_STATUSES.map((entry) => <option key={entry.id} value={entry.id}>{entry.id === 'ready' ? 'Lista' : entry.label}</option>)}</select></label>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-bold text-white"><input type="checkbox" checked={controls.favorites} onChange={(event) => updateControls({ favorites: event.target.checked })} className="h-5 w-5 accent-[#4f8cff]" /> Solo favoritas</label>
            </div>
          </div>
        ) : null}
      </header>

      {loading ? <p className="rounded-2xl bg-white/[0.04] p-5 text-sm text-slate-400">Cargando Laboratorio ABP…</p> : null}
      {error ? <p role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</p> : null}
      {status ? <p role="status" className="rounded-2xl bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">{status}</p> : null}

      {!loading && visibleItems.length ? (
        <div className="grid gap-5 md:grid-cols-2" aria-label="Jugadas del Laboratorio ABP">
          {visibleItems.map((item) => {
            const meta = getSetPieceLaboratoryMeta(item);
            const classificationLabel = getSetPieceClassificationLabel(item);
            const displayName = areSetPieceLabelsEquivalent(classificationLabel, item.nombre, item.orden) ? '' : item.nombre;
            const defensive = getSetPiecePhase(item) === SET_PIECE_PHASES.DEFENSIVE;
            const defensiveStructure = getSetPieceDefensiveStructure(item.elements);
            const archived = meta.libraryStatus === 'archived';
            return (
              <article key={item.id} className={`overflow-hidden rounded-[28px] bg-[#091428]/90 shadow-[0_20px_55px_rgba(0,0,0,0.18)] ring-1 ${archived ? 'opacity-75 ring-slate-600/30' : 'ring-white/[0.08]'}`}>
                <div className="relative bg-white p-2 text-black"><SetPieceDiagramCanvas elements={item.elements || []} players={[]} readOnly renderMode="thumbnail" visibleLayers={createSetPieceThumbnailLayers(meta.displayLayers)} fullField={String(item.tipo).includes('saque_inicio')} /><label className="absolute left-3 top-3 flex min-h-11 items-center gap-2 rounded-xl bg-white/95 px-3 text-[10px] font-black text-slate-900 shadow-lg ring-1 ring-slate-200"><input type="checkbox" checked={selectedPrintIds.includes(item.id)} onChange={(event) => setSelectedPrintIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} className="h-4 w-4 accent-[#4f8cff]" />PDF</label><button type="button" aria-label={meta.libraryFavorite ? `Quitar ${item.nombre} de favoritas` : `Marcar ${item.nombre} como favorita`} aria-pressed={meta.libraryFavorite} onClick={() => toggleFavorite(item)} className={`absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-xl shadow-lg ${meta.libraryFavorite ? 'bg-amber-300 text-slate-950' : 'bg-white text-slate-500 ring-1 ring-slate-200'} ${buttonFocus}`}>★</button></div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={`${displayName ? 'text-[10px]' : 'text-lg'} font-black uppercase tracking-[0.16em] text-caudal-electric`}>{classificationLabel}</p>{displayName ? <h3 className="mt-1 truncate text-lg font-black text-white">{displayName}</h3> : null}</div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${meta.libraryStatus === 'ready' ? 'bg-emerald-300/15 text-emerald-200' : archived ? 'bg-slate-400/15 text-slate-300' : 'bg-amber-300/15 text-amber-200'}`}>{statusLabel(meta.libraryStatus)}</span></div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {defensive ? <>
                      <ClassificationPill>{getSetPieceDefenseTypeLabel(meta.libraryMarking) ? `Defensa ${getSetPieceDefenseTypeLabel(meta.libraryMarking)}` : ''}</ClassificationPill>
                      <ClassificationPill>{defensiveStructure}</ClassificationPill>
                    </> : <>
                      <ClassificationPill>{meta.libraryZone}</ClassificationPill>
                      <ClassificationPill>{meta.libraryMechanism}</ClassificationPill>
                      <ClassificationPill>{meta.libraryMarking}</ClassificationPill>
                      <ClassificationPill>{getSetPieceDeliveryTypeLabel(meta.deliveryType)}</ClassificationPill>
                    </>}
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-slate-400">{meta.objective || item.objetivo || meta.generalInstruction || item.descripcion || 'Sin objetivo definido.'}</p>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Actualizada {formatDate(item.updated_at || meta.libraryUpdatedAt)}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <button type="button" onClick={() => editItem(item)} className={`min-h-11 flex-1 rounded-xl bg-caudal-electric px-4 text-xs font-black text-slate-950 ${buttonFocus}`}>Abrir</button>
                    <button type="button" onClick={() => setPreviewItem(item)} className={`min-h-11 rounded-xl bg-white/10 px-4 text-xs font-black text-white ${buttonFocus}`}>Vista previa</button>
                    <div className="relative" ref={menuItemId === item.id ? menuRef : undefined}>
                      <button type="button" aria-label={`Más acciones para ${item.nombre}`} aria-haspopup="menu" aria-expanded={menuItemId === item.id} onClick={() => setMenuItemId((current) => current === item.id ? '' : item.id)} className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-xl font-black text-white ${buttonFocus}`}>⋯</button>
                      {menuItemId === item.id ? <div role="menu" aria-label={`Acciones de ${item.nombre}`} className="absolute bottom-12 right-0 z-20 min-w-44 overflow-hidden rounded-xl bg-[#101d31] p-1.5 shadow-2xl ring-1 ring-white/10"><button type="button" role="menuitem" onClick={() => { setMenuItemId(''); setPrintPreviewItems([item]); }} className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-xs font-bold text-white hover:bg-white/10 ${buttonFocus}`}>Imprimir</button><button type="button" role="menuitem" onClick={() => { setMenuItemId(''); duplicateItem(item); }} disabled={saving} className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50 ${buttonFocus}`}>Duplicar</button><button type="button" role="menuitem" onClick={() => { setMenuItemId(''); toggleArchived(item); }} className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-xs font-bold text-white hover:bg-white/10 ${buttonFocus}`}>{archived ? 'Restaurar' : 'Archivar'}</button><button type="button" role="menuitem" onClick={() => { setMenuItemId(''); deleteItem(item); }} className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-xs font-bold text-red-200 hover:bg-red-500/15 ${buttonFocus}`}>Eliminar</button></div> : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {!loading && !visibleItems.length ? <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center"><p className="text-lg font-black text-white">No hay jugadas que coincidan</p><p className="mt-2 text-sm text-slate-500">Crea la primera jugada o limpia los filtros activos.</p><button type="button" onClick={startNew} className={`mt-5 min-h-11 rounded-xl bg-caudal-electric px-5 text-sm font-black text-slate-950 ${buttonFocus}`}>+ Nueva jugada</button></div> : null}
      {previewItem ? <LaboratoryPreview item={previewItem} onClose={() => setPreviewItem(null)} /> : null}
      {printPreviewItems.length ? <LaboratoryPrintPreview items={printPreviewItems} onClose={() => setPrintPreviewItems([])} /> : null}
    </section>
  );
}
