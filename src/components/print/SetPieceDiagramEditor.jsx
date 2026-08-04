import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPlayerDisplayName } from '../../utils/playerDisplayName';
import {
  getSetPieceDimensionRange,
  normalizeSetPieceDimensionValue,
  normalizeSetPieceElementDimensions,
} from '../../utils/setPieceElementDimensions';
import { getSetPieceHistoryAction } from '../../utils/setPieceEditorInteractions';
import {
  SET_PIECE_ROLES,
  SET_PIECE_PRINT_IDENTITY_MODES,
  getDrawableSetPieceElements,
  getSetPieceChronology,
  getSetPieceResponsibilities,
  getSetPieceTacticalMeta,
  setSetPieceTacticalMeta,
} from '../../utils/setPieceProfessional';
import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import SetPieceDiagramPrintSheet from './SetPieceDiagramPrintSheet';
import SetPieceDiagramToolbar from './SetPieceDiagramToolbar';

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone = (value) => JSON.parse(JSON.stringify(value || []));
const isArrow = (element) => ['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow'].includes(element?.type);
const isResizableBox = (element) => ['zone', 'block', 'text_box'].includes(element?.type);

const quickConsignas = [
  'Atacar primer palo',
  'Atacar segundo palo',
  'Bloqueo',
  'Arrastre',
  'Segunda jugada',
  'Rechace',
  'Vigilancia',
  'Barrera',
  'Marca individual',
  'Zona',
];

const createElement = (type) => {
  if (type === 'ball') return { id: createId(), type, x: 8, y: 8 };
  if (isArrow({ type })) return { id: createId(), type, x1: 20, y1: 46, x2: 44, y2: 26, dashed: type === 'dashed_arrow' };
  if (type === 'zone') return { id: createId(), type, x: 34, y: 18, width: 22, height: 12, label: 'Zona' };
  if (type === 'text') return { id: createId(), type, x: 42, y: 40, label: 'Texto' };
  if (type === 'block') return { id: createId(), type, x: 42, y: 34, width: 5, label: 'BLOQUEO' };
  if (type === 'text_box') return { id: createId(), type, x: 58, y: 10, width: 32, height: 24, label: 'TEXTO' };
  if (type === 'opponent') return { id: createId(), type, x: 50, y: 17, label: 'R' };
  return { id: createId(), type: 'player', x: 50, y: 35, label: '1', player_id: '', roles: [], sequenceOrder: null };
};

const fieldClass = 'w-full rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/60 focus:ring-2 focus:ring-caudal-electric/20';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.16em] text-slate-500';
const editorSurfaceClass = 'rounded-[28px] border border-white/[0.08] bg-[#08131f]/95 p-3 shadow-[0_14px_38px_rgba(0,0,0,0.22)]';
const compactMiniButtonClass = 'inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[10px] font-bold text-slate-200 transition hover:border-caudal-electric/50 hover:bg-white/[0.08]';

function TacticalField({ label, value, onChange, placeholder, rows = 0, maxLength }) {
  return (
    <label className="grid gap-1.5">
      <span className={labelClass}>{label}</span>
      {rows ? (
        <textarea
          rows={rows}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${fieldClass} resize-y leading-5`}
        />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={fieldClass} />
      )}
    </label>
  );
}

function PresentationOverlay({ diagram, players, onClose }) {
  const chronology = getSetPieceChronology(diagram.elements, players);
  const tacticalMeta = getSetPieceTacticalMeta(diagram.elements);
  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#07150f] p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Modo presentación ABP">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 pb-3 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-caudal-electric">ABP · Presentación</p>
            <h2 className="mt-1 text-xl font-black sm:text-3xl">{diagram.titulo || 'Jugada sin título'}</h2>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-black uppercase text-white">Salir</button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-3xl bg-white p-2 text-black shadow-2xl sm:p-4">
          <SetPieceDiagramCanvas elements={diagram.elements} players={players} readOnly printOptimized identityMode={tacticalMeta.printIdentityMode} fullField={String(diagram.tipo || '').includes('saque_inicio')} />
        </div>
        {(diagram.consigna || chronology.length) ? (
          <div className="mt-3 grid gap-3 text-white lg:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]">
            <p className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-bold leading-6">{diagram.consigna || 'Sin consigna general.'}</p>
            <ol className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
              {chronology.map((step) => <li key={step.id} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold"><strong className="mr-1 text-caudal-electric">{step.order}</strong>{step.playerName}: {step.instruction}</li>)}
            </ol>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function PreviewOverlay({ diagrams, players, match, onClose }) {
  const printPreview = () => {
    document.body.classList.add('printing-set-piece-preview');
    const cleanup = () => document.body.classList.remove('printing-set-piece-preview');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  };
  return createPortal(
    <div className="set-piece-preview-overlay fixed inset-0 z-[120] overflow-auto bg-slate-950/95 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Vista previa de la ficha ABP">
      <div className="print-hidden sticky top-0 z-10 mx-auto mb-4 flex max-w-[297mm] items-center justify-between rounded-2xl border border-white/10 bg-[#0b1629]/95 p-3 shadow-2xl backdrop-blur">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Vista previa exacta</p><p className="mt-1 text-xs text-slate-400">Renderer A4 independiente del editor</p></div>
        <div className="flex gap-2"><button type="button" onClick={printPreview} className="min-h-11 rounded-xl bg-caudal-electric px-4 text-xs font-black text-slate-950">Imprimir / PDF</button><button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-white/10 px-4 text-xs font-black text-white">Cerrar</button></div>
      </div>
      <div className="mx-auto w-fit shadow-2xl"><SetPieceDiagramPrintSheet match={match} title="Ficha táctica ABP" diagrams={diagrams} players={players} preview /></div>
    </div>,
    document.body
  );
}

export default function SetPieceDiagramEditor({ diagram, players = [], match, suggestions = [], printDiagrams = [], roleOnly = false, onChange }) {
  const drawableElements = useMemo(() => getDrawableSetPieceElements(diagram.elements), [diagram.elements]);
  const tacticalMeta = useMemo(() => getSetPieceTacticalMeta(diagram.elements), [diagram.elements]);
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState([clone(drawableElements)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [panel, setPanel] = useState('tactic');
  const [overlay, setOverlay] = useState('');
  const [visibleLayers, setVisibleLayers] = useState({
    numbers: true,
    abbreviations: true,
    roles: true,
    chronology: true,
    zones: true,
    texts: true,
  });
  const historyChangeRef = useRef(false);

  const selectedElement = useMemo(() => drawableElements.find((element) => element.id === selectedId) || null, [drawableElements, selectedId]);
  const chronology = useMemo(() => getSetPieceChronology(diagram.elements, players), [diagram.elements, players]);
  const responsibilities = useMemo(() => getSetPieceResponsibilities(diagram.elements, players), [diagram.elements, players]);
  const isSelectedPlayer = ['player', 'opponent'].includes(selectedElement?.type);

  const updateDiagram = (fields) => onChange({ ...diagram, ...fields });
  const updateMeta = (patch) => {
    const next = typeof patch === 'function' ? patch(tacticalMeta) : { ...tacticalMeta, ...patch };
    updateDiagram({ elements: setSetPieceTacticalMeta(diagram.elements, next) });
  };
  const pushHistory = (elements) => {
    const next = [...history.slice(0, historyIndex + 1), clone(elements)].slice(-50);
    setHistory(next);
    setHistoryIndex(next.length - 1);
  };
  const updateElements = (elements, options = {}) => {
    const metaElement = diagram.elements.find((element) => element.type === 'tactical_meta');
    updateDiagram({ elements: setSetPieceTacticalMeta(metaElement ? [...elements, metaElement] : elements, tacticalMeta) });
    if (!options.skipHistory) pushHistory(elements);
  };
  const updateSelected = (fields) => {
    if (!selectedElement) return;
    updateElements(drawableElements.map((element) => element.id === selectedElement.id ? { ...element, ...fields } : element));
  };

  useEffect(() => {
    if (historyChangeRef.current) {
      historyChangeRef.current = false;
      return;
    }
    setHistory([clone(drawableElements)]);
    setHistoryIndex(0);
    setSelectedId('');
    setPanel('tactic');
  }, [diagram.id, diagram.tipo, diagram.orden]);

  useEffect(() => {
    if (!overlay) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOverlay(''); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [overlay]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const action = getSetPieceHistoryAction(event);
      if (!action) return;
      event.preventDefault();
      const nextIndex = action === 'redo' ? Math.min(history.length - 1, historyIndex + 1) : Math.max(0, historyIndex - 1);
      if (nextIndex === historyIndex) return;
      historyChangeRef.current = true;
      setHistoryIndex(nextIndex);
      updateElements(clone(history[nextIndex]), { skipHistory: true });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const addElement = (type) => {
    const element = createElement(type);
    if (roleOnly && type === 'player') {
      element.label = String(drawableElements.filter((entry) => entry.type === 'player').length + 1);
    }
    updateElements([...drawableElements, element]);
    setSelectedId(element.id);
    if (['player', 'opponent'].includes(type)) setPanel('player');
  };
  const duplicateSelected = () => {
    if (!selectedElement) return;
    const copy = { ...clone([selectedElement])[0], id: createId() };
    if (isArrow(copy)) {
      copy.x1 = Math.min(100, Number(copy.x1 || 0) + 4); copy.y1 = Math.min(72, Number(copy.y1 || 0) + 4);
      copy.x2 = Math.min(100, Number(copy.x2 || 0) + 4); copy.y2 = Math.min(72, Number(copy.y2 || 0) + 4);
    } else { copy.x = Math.min(100, Number(copy.x || 0) + 4); copy.y = Math.min(72, Number(copy.y || 0) + 4); }
    const normalized = normalizeSetPieceElementDimensions(copy);
    updateElements([...drawableElements, normalized]);
    setSelectedId(normalized.id);
  };
  const deleteSelected = () => {
    if (!selectedElement) return;
    updateElements(drawableElements.filter((element) => element.id !== selectedElement.id));
    setSelectedId('');
    setPanel('tactic');
  };
  const addSequence = () => {
    const orderedPlayers = drawableElements.filter((element) => ['player', 'opponent'].includes(element.type));
    updateElements(drawableElements.map((element) => {
      const index = orderedPlayers.findIndex((candidate) => candidate.id === element.id);
      return index >= 0 ? { ...element, sequenceOrder: index + 1 } : element;
    }));
  };
  const toggleRole = (role) => {
    const current = Array.isArray(selectedElement?.roles) ? selectedElement.roles : [];
    updateSelected({ roles: current.includes(role) ? current.filter((item) => item !== role) : [...current, role] });
  };

  const panelTabs = [
    ['tactic', 'Ficha'],
    ['player', roleOnly ? 'Rol' : 'Jugador'],
  ];
  const selectedWidthRange = selectedElement ? getSetPieceDimensionRange(selectedElement, 'width') : null;
  const selectedHeightRange = selectedElement ? getSetPieceDimensionRange(selectedElement, 'height') : null;
  const layerControls = [
    { key: 'numbers', label: 'Dorsales' },
    { key: 'abbreviations', label: 'Abreviaturas' },
    { key: 'roles', label: 'Roles' },
    { key: 'chronology', label: 'Cronología' },
    { key: 'zones', label: 'Zonas' },
    { key: 'texts', label: 'Textos' },
  ];
  const metadataStatus = tacticalMeta.libraryStatus === 'ready' ? 'Lista' : tacticalMeta.libraryStatus === 'archived' ? 'Archivada' : 'Borrador';

  return (
    <div className="set-piece-editor space-y-3">
      <div className={`${editorSurfaceClass} flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between`}>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-caudal-electric">Sistema profesional de preparación ABP</p>
          <input value={diagram.titulo || ''} onChange={(event) => updateDiagram({ titulo: event.target.value })} placeholder="Nombre de la jugada" className="mt-1 w-full border-0 bg-transparent p-0 text-xl font-black text-white outline-none placeholder:text-slate-600" />
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">Tipo · {diagram.tipo || 'Sin tipo'}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">Clasificación · {tacticalMeta.libraryZone || 'Sin definir'}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">Estado · {metadataStatus}</span>
            <button type="button" className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">★ Favorita</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOverlay('preview')} className="min-h-10 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-xs font-black text-white">Vista previa</button>
          <button type="button" onClick={() => setOverlay('presentation')} className="min-h-10 rounded-2xl bg-white px-4 text-xs font-black text-slate-950">Presentar</button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)] xl:items-start">
        <div className="min-w-0 space-y-3">
          <SetPieceDiagramToolbar onAdd={addElement} />
          <div className={`${editorSurfaceClass} flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-white`}>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={historyIndex <= 0} onClick={() => {
                const nextIndex = Math.max(0, historyIndex - 1); historyChangeRef.current = true; setHistoryIndex(nextIndex); updateElements(clone(history[nextIndex]), { skipHistory: true });
              }} className="min-h-10 rounded-full bg-white/[0.08] px-3 disabled:opacity-40">↶</button>
              <button type="button" disabled={historyIndex >= history.length - 1} onClick={() => {
                const nextIndex = Math.min(history.length - 1, historyIndex + 1); historyChangeRef.current = true; setHistoryIndex(nextIndex); updateElements(clone(history[nextIndex]), { skipHistory: true });
              }} className="min-h-10 rounded-full bg-white/[0.08] px-3 disabled:opacity-40">↷</button>
              <button type="button" aria-pressed={snapEnabled} onClick={() => setSnapEnabled((value) => !value)} className={`min-h-10 rounded-full px-3 ${snapEnabled ? 'bg-caudal-electric text-slate-950' : 'bg-white/[0.08]'}`}>🧲</button>
              <button type="button" onClick={addSequence} className="min-h-10 rounded-full bg-white/[0.08] px-3">①</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {layerControls.map((layer) => (
                <button key={layer.key} type="button" aria-pressed={visibleLayers[layer.key]} onClick={() => setVisibleLayers((current) => ({ ...current, [layer.key]: !current[layer.key] }))} className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${visibleLayers[layer.key] ? 'border-caudal-electric/50 bg-caudal-electric/15 text-caudal-electric' : 'border-white/10 bg-white/[0.04] text-slate-400'}`}>
                  {layer.label}
                </button>
              ))}
              <div className="flex items-center rounded-full border border-white/10 bg-black/20">
                <button type="button" onClick={() => setZoom((value) => Math.max(0.75, value - 0.1))} className="h-10 w-10 text-lg" aria-label="Reducir zoom">−</button>
                <span className="min-w-12 text-center text-[11px] text-slate-300">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))} className="h-10 w-10 text-lg" aria-label="Aumentar zoom">+</button>
              </div>
            </div>
          </div>
          <p className="flex items-center gap-2 px-1 text-[10px] font-bold text-slate-500 sm:hidden" aria-hidden="true"><span>↔</span> Desliza dentro del campo para recorrerlo</p>
          <div className="mx-auto max-w-[940px] overflow-auto rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-2 text-black shadow-[0_22px_60px_rgba(0,0,0,0.2)]">
            <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
              <SetPieceDiagramCanvas elements={drawableElements} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); const element = drawableElements.find((item) => item.id === id); if (['player', 'opponent'].includes(element?.type)) setPanel('player'); }} onChange={updateElements} players={players} snap={snapEnabled} fullField={String(diagram.tipo || '').includes('saque_inicio')} visibleLayers={visibleLayers} />
            </div>
          </div>
          <section className={editorSurfaceClass}>
            <div className="flex items-center justify-between"><p className={labelClass}>Cronología</p><span className="text-[10px] text-slate-500">Secuencia visual para el cuerpo técnico</span></div>
            {chronology.length ? <ol className="mt-3 space-y-2">{chronology.map((step, index) => <li key={step.id} className="flex items-start gap-2"><div className="flex flex-col items-center pt-1"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-caudal-electric text-[11px] font-black text-slate-950">{step.order}</div>{index < chronology.length - 1 ? <div className="mt-1 h-5 w-px bg-white/10" /> : null}</div><div className="flex-1 rounded-2xl border border-white/10 bg-black/15 px-3 py-2"><p className="text-[11px] font-black text-white">{step.playerName}</p><p className="mt-1 text-[11px] leading-5 text-slate-400">{step.instruction || 'Sin consigna'}</p></div></li>)}</ol> : <p className="mt-2 text-xs text-slate-500">Selecciona jugadores y asigna su orden de aparición.</p>}
          </section>
        </div>

        <aside className="overflow-hidden rounded-[30px] border border-white/10 bg-[#08131f]/95 xl:sticky xl:top-4">
          <div className="border-b border-white/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">Panel táctico</p>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-black/20 p-1" role="tablist">
              {panelTabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)} className={`min-h-10 rounded-xl text-[10px] font-black uppercase ${panel === id ? 'bg-white text-slate-950' : 'text-slate-400'}`}>{label}</button>)}
            </div>
          </div>

          <div className="max-h-[calc(100vh-10rem)] space-y-2 overflow-y-auto p-3">
            {panel === 'tactic' ? (
              <div className="space-y-2">
                <details open className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                  <summary className="cursor-pointer list-none px-1 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-white">Información táctica</summary>
                  <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                    <TacticalField label="Objetivo" value={tacticalMeta.objective} onChange={(objective) => updateMeta({ objective })} placeholder="Liberar segundo palo" />
                    <TacticalField label="Cuándo utilizarla" value={tacticalMeta.whenToUse} onChange={(whenToUse) => updateMeta({ whenToUse })} placeholder={'Primeros córners.\nSi el rival marca en zona.'} rows={3} />
                    <section className="rounded-2xl border border-white/5 bg-black/15 p-3">
                      <p className={labelClass}>Responsables</p>
                      {responsibilities.length ? <div className="mt-2 space-y-1.5">{responsibilities.map((item, index) => <div key={`${item.role}-${item.playerName}-${index}`} className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-400">{item.role}</span><strong className="truncate text-white">{item.playerName}{item.primary ? ' · Principal' : ''}</strong></div>)}</div> : <p className="mt-2 text-xs leading-5 text-slate-500">Asigna roles desde la pestaña Jugador. No se duplican en otro formulario.</p>}
                    </section>
                  </div>
                </details>
                <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                  <summary className="cursor-pointer list-none px-1 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-white">Consignas</summary>
                  <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                    <TacticalField label="Consigna general · máx. 3 líneas" value={diagram.consigna || tacticalMeta.generalInstruction} onChange={(generalInstruction) => { updateDiagram({ consigna: generalInstruction, elements: setSetPieceTacticalMeta(diagram.elements, { ...tacticalMeta, generalInstruction }) }); }} placeholder="Mensaje breve para el grupo" rows={3} maxLength={240} />
                    <TacticalField label="Riesgo" value={tacticalMeta.risk} onChange={(risk) => updateMeta({ risk })} placeholder="Qué ocurre si falla" rows={2} />
                    <TacticalField label="Alternativa" value={tacticalMeta.alternative} onChange={(alternative) => updateMeta({ alternative })} placeholder="Qué hacer si el rival cambia el marcaje" rows={2} />
                  </div>
                </details>
                <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                  <summary className="cursor-pointer list-none px-1 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-white">Dossier</summary>
                  <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                    <label className="grid gap-1.5">
                      <span className={labelClass}>Identidad en dossier</span>
                      <select value={tacticalMeta.printIdentityMode} onChange={(event) => updateMeta({ printIdentityMode: event.target.value })} className={`${fieldClass} bg-white font-bold text-slate-950`}>
                        <option value={SET_PIECE_PRINT_IDENTITY_MODES.NUMBER}>Dorsal</option>
                        <option value={SET_PIECE_PRINT_IDENTITY_MODES.ABBREVIATION}>Abreviatura</option>
                        <option value={SET_PIECE_PRINT_IDENTITY_MODES.NUMBER_AND_ABBREVIATION}>Dorsal + abreviatura</option>
                      </select>
                    </label>
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <TacticalField label="Etiquetas" value={tacticalMeta.tags.join(', ')} onChange={(value) => updateMeta({ tags: value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="segundo palo, zona" />
                      <div><p className={labelClass}>Valoración</p><div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`Valorar con ${rating}`} aria-pressed={tacticalMeta.rating === rating} onClick={() => updateMeta({ rating })} className={`text-lg ${rating <= tacticalMeta.rating ? 'text-amber-300' : 'text-slate-700'}`}>★</button>)}</div></div>
                    </div>
                  </div>
                </details>
                <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                  <summary className="cursor-pointer list-none px-1 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-white">Biblioteca y observaciones</summary>
                  <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                    {tacticalMeta.libraryId ? (
                      <section className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3">
                        <p className={labelClass}>Origen de biblioteca</p>
                        <p className="mt-1 text-xs font-bold text-emerald-100">Instancia vinculada · plantilla {tacticalMeta.libraryVersion || 'sin versión'}</p>
                        <p className="mt-1 text-[10px] text-slate-500">La instancia del partido es editable y no modifica la plantilla maestra.</p>
                      </section>
                    ) : null}
                    <TacticalField label="Observaciones" value={tacticalMeta.observations} onChange={(observations) => updateMeta({ observations })} placeholder="Notas internas del entrenador" rows={3} />
                    {suggestions.length ? <section className="rounded-2xl border border-caudal-electric/20 bg-caudal-electric/[0.07] p-3"><p className={labelClass}>Sugerencias contextuales · nunca automáticas</p><div className="mt-2 space-y-2">{suggestions.slice(0, 4).map((suggestion, index) => <div key={`${suggestion.source}-${index}`} className="rounded-xl bg-black/15 p-2.5"><p className="text-xs font-bold leading-5 text-white">{suggestion.text}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-caudal-electric">{suggestion.source}</p></div>)}</div></section> : null}
                  </div>
                </details>
              </div>
            ) : null}

            {panel === 'player' ? (
              isSelectedPlayer ? (
                <>
                  <div><p className={labelClass}>{roleOnly ? 'Participante por rol' : 'Jugador seleccionado'}</p><p className="mt-1 text-base font-black text-white">{selectedElement.type === 'opponent' ? 'Rival' : roleOnly ? (selectedElement.roles?.[0] || `Participante ${selectedElement.label || ''}`) : players.find((player) => player.id === selectedElement.player_id) ? getPlayerDisplayName(players.find((player) => player.id === selectedElement.player_id)) : `Jugador ${selectedElement.label || ''}`}</p></div>
                  {!roleOnly && selectedElement.type === 'player' ? <label className="grid gap-1.5"><span className={labelClass}>Jugador vinculado</span><select value={selectedElement.player_id || ''} onChange={(event) => { const player = players.find((item) => item.id === event.target.value); updateSelected({ player_id: event.target.value, label: player?.number ? String(player.number) : selectedElement.label, name: '' }); }} className={`${fieldClass} bg-white font-bold text-slate-950`}><option value="">Sin jugador vinculado</option>{players.map((player) => <option key={player.id} value={player.id}>{player.number || '-'} · {getPlayerDisplayName(player)}</option>)}</select></label> : null}
                  <div><p className={labelClass}>Roles · selección múltiple</p><div className="mt-2 flex flex-wrap gap-1.5">{SET_PIECE_ROLES.map((role) => <button key={role} type="button" aria-pressed={(selectedElement.roles || []).includes(role)} onClick={() => toggleRole(role)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${(selectedElement.roles || []).includes(role) ? 'border-caudal-electric/40 bg-caudal-electric text-slate-950' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}>{role}</button>)}</div></div>
                  <TacticalField label="Consigna individual" value={selectedElement.note || ''} onChange={(note) => updateSelected({ note })} placeholder="Julio fija y ataca el espacio" rows={3} />
                  <label className="grid gap-1.5"><span className={labelClass}>Orden de aparición</span><input type="number" min="1" max="20" value={selectedElement.sequenceOrder || ''} onChange={(event) => updateSelected({ sequenceOrder: event.target.value ? Number(event.target.value) : null })} className={fieldClass} placeholder="1" /></label>
                  <label className="flex min-h-11 items-center justify-between rounded-xl bg-white/[0.04] p-3 text-xs font-bold text-white"><span>Responsable principal</span><input type="checkbox" checked={Boolean(selectedElement.primaryResponsibility)} onChange={(event) => updateSelected({ primaryResponsibility: event.target.checked })} className="h-4 w-4 accent-[#4f8cff]" /></label>
                </>
              ) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center"><p className="text-sm font-black text-white">Selecciona {roleOnly ? 'un participante' : 'un jugador'} en el campo</p><p className="mt-2 text-xs leading-5 text-slate-500">Aquí editarás rol, consigna, orden y responsabilidad principal.</p></div>
            ) : null}

            {selectedElement && !isSelectedPlayer ? (
              <details className="rounded-2xl border border-white/10 bg-black/15" open={panel === 'player'}><summary className="cursor-pointer list-none px-3 py-3 text-xs font-black text-white">Dibujo · {selectedElement.type.replaceAll('_', ' ')}</summary><div className="space-y-3 border-t border-white/10 p-3">{!isArrow(selectedElement) ? <TacticalField label="Etiqueta / texto" value={selectedElement.label || ''} onChange={(label) => updateSelected({ label })} placeholder="Etiqueta" rows={selectedElement.type === 'text_box' ? 4 : 0} /> : <label className="grid gap-1.5"><span className={labelClass}>Trayectoria</span><select value={selectedElement.type} onChange={(event) => updateSelected({ type: event.target.value, dashed: event.target.value === 'dashed_arrow' })} className={`${fieldClass} bg-white font-bold text-slate-950`}><option value="arrow">Continua</option><option value="dashed_arrow">Discontinua</option><option value="curved_arrow">Curva</option><option value="double_arrow">Doble</option></select></label>}{isResizableBox(selectedElement) ? <div className="grid grid-cols-2 gap-2">{selectedWidthRange ? <label className="grid gap-1"><span className={labelClass}>Ancho</span><input type="number" value={selectedElement.width ?? selectedWidthRange.defaultValue} onChange={(event) => updateSelected({ width: normalizeSetPieceDimensionValue(selectedElement, 'width', event.target.value, selectedElement.width) })} className={fieldClass} /></label> : null}{selectedHeightRange ? <label className="grid gap-1"><span className={labelClass}>Alto</span><input type="number" value={selectedElement.height ?? selectedHeightRange.defaultValue} onChange={(event) => updateSelected({ height: normalizeSetPieceDimensionValue(selectedElement, 'height', event.target.value, selectedElement.height) })} className={fieldClass} /></label> : null}</div> : null}<div className="grid grid-cols-2 gap-2"><button type="button" onClick={duplicateSelected} className="rounded-xl bg-white/10 px-3 py-2.5 text-xs font-bold text-white">Duplicar</button><button type="button" onClick={deleteSelected} className="rounded-xl bg-red-500/15 px-3 py-2.5 text-xs font-bold text-red-100">Eliminar</button></div></div></details>
            ) : null}
          </div>
        </aside>
      </div>
      {overlay === 'preview' ? <PreviewOverlay diagrams={printDiagrams.length ? printDiagrams : [diagram]} players={players} match={match} onClose={() => setOverlay('')} /> : null}
      {overlay === 'presentation' ? <PresentationOverlay diagram={diagram} players={players} onClose={() => setOverlay('')} /> : null}
    </div>
  );
}
