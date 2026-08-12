import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPlayerDisplayName } from '../../utils/playerDisplayName';
import {
  getSetPieceDimensionRange,
  normalizeSetPieceDimensionValue,
  normalizeSetPieceElementDimensions,
} from '../../utils/setPieceElementDimensions';
import {
  applySetPieceArrowStyle,
  ensureSetPieceCurveGeometry,
  getSetPieceArrowStyle,
  getSetPieceDeleteAction,
  getSetPieceHistoryAction,
} from '../../utils/setPieceEditorInteractions';
import {
  SET_PIECE_PRINT_IDENTITY_MODES,
  createDefaultSetPieceDisplayLayers,
  cloneSetPieceElementsWithFreshIds,
  getDrawableSetPieceElements,
  getSetPieceChronology,
  getSetPieceDefenseTypeLabel,
  getSetPieceDefensiveStructure,
  getSetPieceRoleOptions,
  getSetPieceResponsibilities,
  getSetPieceTacticalMeta,
  isDefensiveSetPieceType,
  setSetPieceTacticalMeta,
} from '../../utils/setPieceProfessional';
import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import MatchPlanIdentityLegend from './MatchPlanIdentityLegend';
import SetPieceDiagramPrintSheet from './SetPieceDiagramPrintSheet';
import SetPieceDiagramToolbar from './SetPieceDiagramToolbar';
import { findCrowdedSetPieceParticipants } from '../../utils/setPieceRenderLayout';
import { buildSetPieceLinkedPlayerOptions } from '../../utils/setPieceLinkedPlayers';

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone = (value) => JSON.parse(JSON.stringify(value || []));
const isArrow = (element) => ['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow'].includes(element?.type);
const isResizableBox = (element) => ['zone', 'block', 'text_box'].includes(element?.type);

const createElement = (type) => {
  if (type === 'ball') return { id: createId(), type, x: 8, y: 8 };
  if (isArrow({ type }) || type === 'curved_dashed_arrow') {
    return applySetPieceArrowStyle({ id: createId(), type: 'arrow', x1: 20, y1: 46, x2: 44, y2: 26 }, type);
  }
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
const compactToolButtonClass = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-[11px] font-bold text-slate-200 transition hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric disabled:opacity-35';

const getIdentityModeFromLayers = (layers, fallback) => {
  if (layers.dorsals && layers.abbreviations) return SET_PIECE_PRINT_IDENTITY_MODES.NUMBER_AND_ABBREVIATION;
  if (layers.dorsals) return SET_PIECE_PRINT_IDENTITY_MODES.NUMBER;
  if (layers.abbreviations) return SET_PIECE_PRINT_IDENTITY_MODES.ABBREVIATION;
  return fallback;
};

function TacticalField({ label, value, onChange, placeholder, rows = 0, maxLength }) {
  return (
    <label className="grid gap-1.5">
      <span className={labelClass}>{label}</span>
      {rows ? (
        <textarea
          rows={rows}
          value={value ?? ''}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${fieldClass} min-h-[90px] resize-y leading-5`}
        />
      ) : (
        <input value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={fieldClass} />
      )}
    </label>
  );
}

function EditorAccordion({ id, title, open, onToggle, children }) {
  return (
    <section className="border-b border-white/[0.07] last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-content`}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-1 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-caudal-electric"
      >
        <span>{title}</span>
        <span aria-hidden="true" className={`text-base text-caudal-electric transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open ? <div id={`${id}-content`} className="space-y-3 pb-4 pt-1">{children}</div> : null}
    </section>
  );
}

function PresentationOverlay({ diagram, players, onClose }) {
  const chronology = getSetPieceChronology(diagram.elements, players);
  const tacticalMeta = getSetPieceTacticalMeta(diagram.elements);
  const displayLayers = tacticalMeta.displayLayers;
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
          <SetPieceDiagramCanvas elements={diagram.elements} players={players} readOnly printOptimized visibleLayers={displayLayers} fullField={String(diagram.tipo || '').includes('saque_inicio')} />
        </div>
        {(diagram.consigna || (displayLayers.chronology && chronology.length)) ? (
          <div className="mt-3 grid gap-3 text-white lg:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]">
            <p className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-bold leading-6">{diagram.consigna || 'Sin consigna general.'}</p>
            {displayLayers.chronology ? <ol className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
              {chronology.map((step) => <li key={step.id} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold"><strong className="mr-1 text-caudal-electric">{step.order}</strong>{step.playerName}{displayLayers.roles && step.role ? ` · ${step.role}` : ''}: {step.instruction}</li>)}
            </ol> : null}
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

export default function SetPieceDiagramEditor({
  diagram,
  players = [],
  match,
  suggestions = [],
  printDiagrams = [],
  roleOnly = false,
  editorContext = 'set-piece',
  participantRoleOptions,
  participantRoleMode = 'multiple',
  fullFieldOverride,
  renderMode = 'default',
  onChange,
}) {
  const drawableElements = useMemo(() => getDrawableSetPieceElements(diagram.elements), [diagram.elements]);
  const tacticalMeta = useMemo(() => getSetPieceTacticalMeta(diagram.elements), [diagram.elements]);
  const defensive = isDefensiveSetPieceType(diagram.tipo);
  const defensiveStructure = useMemo(() => getSetPieceDefensiveStructure(diagram.elements), [diagram.elements]);
  const effectiveRoleOptions = participantRoleOptions || getSetPieceRoleOptions(diagram.tipo);
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState([clone(drawableElements)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [panel, setPanel] = useState('tactic');
  const [overlay, setOverlay] = useState('');
  const [openSections, setOpenSections] = useState({
    ficha: true,
    risk: false,
    dossier: false,
    library: false,
    observations: false,
  });
  const historyChangeRef = useRef(false);
  const visibleLayers = tacticalMeta.displayLayers;

  const selectedElement = useMemo(() => drawableElements.find((element) => element.id === selectedId) || null, [drawableElements, selectedId]);
  const linkedPlayerOptions = useMemo(() => buildSetPieceLinkedPlayerOptions({
    match,
    players,
    currentPlayerId: selectedElement?.type === 'player' ? selectedElement.player_id : '',
    currentPlayerFallback: selectedElement?.type === 'player' && selectedElement.player_id
      ? { name: selectedElement.name || `Jugador ${selectedElement.label || ''}`, number: selectedElement.label || '' }
      : null,
  }), [match, players, selectedElement]);
  const chronology = useMemo(() => getSetPieceChronology(diagram.elements, players), [diagram.elements, players]);
  const responsibilities = useMemo(() => getSetPieceResponsibilities(diagram.elements, players), [diagram.elements, players]);
  const crowdedParticipants = useMemo(() => findCrowdedSetPieceParticipants(drawableElements), [drawableElements]);
  const isSelectedPlayer = ['player', 'opponent'].includes(selectedElement?.type);
  const structureOnly = !visibleLayers.dorsals
    && !visibleLayers.abbreviations
    && !visibleLayers.roles
    && !visibleLayers.chronology
    && !visibleLayers.zones
    && !visibleLayers.texts;

  const updateDiagram = (fields) => onChange({ ...diagram, ...fields });
  const updateMeta = (patch) => {
    const next = typeof patch === 'function' ? patch(tacticalMeta) : { ...tacticalMeta, ...patch };
    updateDiagram({ elements: setSetPieceTacticalMeta(diagram.elements, next) });
  };
  const toggleDisplayLayer = (key) => {
    const displayLayers = { ...visibleLayers, [key]: !visibleLayers[key] };
    updateMeta({
      displayLayers,
      printIdentityMode: ['dorsals', 'abbreviations'].includes(key)
        ? getIdentityModeFromLayers(displayLayers, tacticalMeta.printIdentityMode)
        : tacticalMeta.printIdentityMode,
      displayLayersBeforeStructure: null,
    });
  };
  const updateIdentityMode = (printIdentityMode) => updateMeta({
    printIdentityMode,
    displayLayers: {
      ...visibleLayers,
      dorsals: printIdentityMode !== SET_PIECE_PRINT_IDENTITY_MODES.ABBREVIATION,
      abbreviations: printIdentityMode !== SET_PIECE_PRINT_IDENTITY_MODES.NUMBER,
    },
    displayLayersBeforeStructure: null,
  });
  const activateStructureOnly = () => updateMeta({
    displayLayersBeforeStructure: visibleLayers,
    displayLayers: Object.fromEntries(Object.keys(createDefaultSetPieceDisplayLayers()).map((key) => [key, false])),
  });
  const restoreDisplayLayers = () => updateMeta({
    displayLayers: tacticalMeta.displayLayersBeforeStructure || createDefaultSetPieceDisplayLayers(),
    displayLayersBeforeStructure: null,
  });
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
  const toggleSection = (section) => setOpenSections((current) => ({
    ...current,
    [section]: !current[section],
  }));
  const selectElement = (id) => {
    setSelectedId(id);
    const element = drawableElements.find((item) => item.id === id);
    setPanel(['player', 'opponent'].includes(element?.type) ? 'player' : 'tactic');
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
    setOpenSections({ ficha: true, risk: false, dossier: false, library: false, observations: false });
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

  useEffect(() => {
    const onKeyDown = (event) => {
      if (getSetPieceDeleteAction(event, Boolean(selectedElement)) !== 'delete') return;
      event.preventDefault();
      deleteSelected();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedElement, drawableElements]);

  const addElement = (type) => {
    const element = createElement(type);
    if (roleOnly && type === 'player') {
      element.label = String(drawableElements.filter((entry) => entry.type === 'player').length + 1);
    }
    if (editorContext === 'match-plan' && ['player', 'opponent'].includes(type)) {
      const tacticalLabel = type === 'opponent' ? 'DFC' : 'DC';
      element.label = tacticalLabel;
      element.name = tacticalLabel;
      element.roles = [tacticalLabel];
    }
    updateElements([...drawableElements, element]);
    setSelectedId(element.id);
    if (['player', 'opponent'].includes(type)) setPanel('player');
  };
  const duplicateDiagram = () => {
    const nextElements = cloneSetPieceElementsWithFreshIds(drawableElements);
    const nextMeta = {
      ...tacticalMeta,
      libraryId: '',
      libraryVersion: '',
      libraryCreatedAt: '',
      libraryUpdatedAt: '',
      linkStatus: 'detached',
      libraryStatus: 'draft',
      libraryFavorite: false,
    };
    onChange({
      ...diagram,
      titulo: `${diagram.titulo || 'Jugada'} copia`,
      consigna: diagram.consigna || tacticalMeta.generalInstruction || '',
      elements: setSetPieceTacticalMeta(nextElements, nextMeta),
    });
    setSelectedId('');
    setPanel('tactic');
  };
  const clearDiagram = () => {
    updateElements([]);
    setSelectedId('');
    setPanel('tactic');
  };
  const duplicateSelected = () => {
    if (!selectedElement) return;
    const copy = { ...clone([selectedElement])[0], id: createId() };
    if (isArrow(copy)) {
      const curvedCopy = copy.type === 'curved_arrow' ? ensureSetPieceCurveGeometry(copy) : null;
      copy.x1 = Math.min(100, Number(copy.x1 || 0) + 4); copy.y1 = Math.min(72, Number(copy.y1 || 0) + 4);
      copy.x2 = Math.min(100, Number(copy.x2 || 0) + 4); copy.y2 = Math.min(72, Number(copy.y2 || 0) + 4);
      if (curvedCopy) {
        copy.controlX = Math.min(100, Number(curvedCopy.controlX || 0) + 4);
        copy.controlY = Math.min(72, Number(curvedCopy.controlY || 0) + 4);
      }
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
    if (participantRoleMode === 'single') {
      updateSelected({ roles: [role], name: role, label: role });
      return;
    }
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
    { key: 'dorsals', label: 'Dorsales' },
    { key: 'abbreviations', label: 'Abreviaturas' },
    { key: 'roles', label: 'Roles' },
    { key: 'chronology', label: 'Cronología' },
    { key: 'zones', label: 'Zonas' },
    { key: 'texts', label: 'Textos' },
  ];
  const metadataStatus = tacticalMeta.libraryStatus === 'ready' ? 'Lista' : tacticalMeta.libraryStatus === 'archived' ? 'Archivada' : 'Borrador';
  const selectedParticipantName = isSelectedPlayer
    ? editorContext === 'match-plan'
      ? (selectedElement.roles?.[0] || selectedElement.name || 'Posición sin definir')
      : selectedElement.type === 'opponent'
      ? 'Rival'
      : roleOnly
        ? (selectedElement.roles?.[0] || `Participante ${selectedElement.label || ''}`)
        : players.find((player) => player.id === selectedElement.player_id)
          ? getPlayerDisplayName(players.find((player) => player.id === selectedElement.player_id))
          : `Jugador ${selectedElement.label || ''}`
    : '';

  return (
    <div className="set-piece-editor w-full min-w-0 max-w-full space-y-3 overflow-x-hidden">
      {!roleOnly ? <div className={`${editorSurfaceClass} flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between`}>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-caudal-electric">Sistema profesional de preparación ABP</p>
          <input value={diagram.titulo || ''} onChange={(event) => updateDiagram({ titulo: event.target.value })} placeholder="Nombre de la jugada" className="mt-1 w-full border-0 bg-transparent p-0 text-xl font-black text-white outline-none placeholder:text-slate-600" />
          {!defensive ? <label className="mt-3 grid max-w-[260px] gap-1.5">
            <span className={labelClass}>Tipo de saque</span>
            <input value={tacticalMeta.saqueType || ''} onChange={(event) => updateMeta({ saqueType: event.target.value })} placeholder="Saque corto, de banda..." className={fieldClass} />
          </label> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">Tipo · {diagram.tipo || 'Sin tipo'}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">{defensive ? 'Defensa' : 'Clasificación'} · {defensive ? (getSetPieceDefenseTypeLabel(tacticalMeta.libraryMarking) || 'Sin definir') : (tacticalMeta.libraryZone || 'Sin definir')}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">Estado · {metadataStatus}</span>
            <button type="button" className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">★ Favorita</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOverlay('preview')} className="min-h-10 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-xs font-black text-white">Vista previa</button>
          <button type="button" onClick={() => setOverlay('presentation')} className="min-h-10 rounded-2xl bg-white px-4 text-xs font-black text-slate-950">Presentar</button>
        </div>
      </div> : null}

      <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:items-start ${roleOnly ? 'xl:grid-cols-[minmax(0,6.6fr)_minmax(320px,3.4fr)]' : 'xl:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]'}`}>
        <div className="min-w-0 space-y-3">
          <SetPieceDiagramToolbar onAdd={addElement} />
          <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-[#08131f]/90 px-2 py-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.16)]" aria-label="Herramientas de edición">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div className="flex flex-wrap items-center gap-0.5">
                <button type="button" title="Deshacer" aria-label="Deshacer" disabled={historyIndex <= 0} onClick={() => {
                  const nextIndex = Math.max(0, historyIndex - 1); historyChangeRef.current = true; setHistoryIndex(nextIndex); updateElements(clone(history[nextIndex]), { skipHistory: true });
                }} className={compactToolButtonClass}><span aria-hidden="true">↶</span><span className="hidden sm:inline">Deshacer</span></button>
                <button type="button" title="Rehacer" aria-label="Rehacer" disabled={historyIndex >= history.length - 1} onClick={() => {
                  const nextIndex = Math.min(history.length - 1, historyIndex + 1); historyChangeRef.current = true; setHistoryIndex(nextIndex); updateElements(clone(history[nextIndex]), { skipHistory: true });
                }} className={compactToolButtonClass}><span aria-hidden="true">↷</span><span className="hidden sm:inline">Rehacer</span></button>
                <span className="mx-1 h-6 w-px bg-white/10" aria-hidden="true" />
                <button type="button" title="Ajustar a la cuadrícula" aria-label="Activar o desactivar el imán" aria-pressed={snapEnabled} onClick={() => setSnapEnabled((value) => !value)} className={`${compactToolButtonClass} ${snapEnabled ? 'bg-caudal-electric/15 text-caudal-electric' : ''}`}><span aria-hidden="true">⌖</span> Imán</button>
                <button type="button" title="Numerar participantes por orden" aria-label="Numerar participantes por orden" onClick={addSequence} className={compactToolButtonClass}><span aria-hidden="true">①</span> Numerar</button>
              </div>
              <div className="flex flex-wrap items-center gap-0.5">
                <button type="button" title="Duplicar diseño" aria-label="Duplicar diseño" onClick={duplicateDiagram} className={compactToolButtonClass}><span aria-hidden="true">⧉</span><span className="hidden sm:inline">Duplicar</span></button>
                <button type="button" title="Vaciar campo" aria-label="Vaciar campo" onClick={clearDiagram} className={`${compactToolButtonClass} text-red-200 hover:bg-red-500/15`}><span aria-hidden="true">×</span><span className="hidden sm:inline">Vaciar</span></button>
                <div className="ml-1 flex items-center rounded-xl bg-black/20" aria-label="Controles de zoom">
                  <button type="button" title="Reducir zoom" onClick={() => setZoom((value) => Math.max(0.75, value - 0.1))} className="h-11 w-11 rounded-xl text-lg text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-caudal-electric" aria-label="Reducir zoom">−</button>
                  <span className="min-w-12 text-center text-[10px] font-bold text-slate-300" aria-live="polite">{Math.round(zoom * 100)}%</span>
                  <button type="button" title="Aumentar zoom" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))} className="h-11 w-11 rounded-xl text-lg text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-caudal-electric" aria-label="Aumentar zoom">+</button>
                </div>
              </div>
            </div>
          </section>

          <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] px-2.5 py-2" aria-label="Capas de visualización">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Capas</span>
              {layerControls.map((layer) => (
                <button key={layer.key} type="button" title={`${visibleLayers[layer.key] ? 'Ocultar' : 'Mostrar'} ${layer.label.toLowerCase()}`} aria-pressed={visibleLayers[layer.key]} onClick={() => toggleDisplayLayer(layer.key)} className={`min-h-9 rounded-full px-2.5 text-[10px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-caudal-electric ${visibleLayers[layer.key] ? 'bg-white/[0.09] text-white' : 'bg-black/15 text-slate-500 line-through'}`}>
                  {layer.label}
                </button>
              ))}
              <button type="button" title={structureOnly ? 'Restaurar la selección de capas anterior' : 'Ocultar las capas informativas'} aria-pressed={structureOnly} onClick={structureOnly ? restoreDisplayLayers : activateStructureOnly} className={`ml-auto min-h-9 rounded-full px-3 text-[10px] font-black outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric ${structureOnly ? 'bg-caudal-electric text-slate-950' : 'bg-caudal-electric/10 text-caudal-electric'}`}>
                {structureOnly ? 'Restaurar capas' : 'Solo estructura'}
              </button>
            </div>
          </section>
          <p className="flex items-center gap-2 px-1 text-[10px] font-bold text-slate-500 sm:hidden" aria-hidden="true"><span>↔</span> Desliza dentro del campo para recorrerlo</p>
          <div className={`relative mx-auto w-full min-w-0 overflow-auto rounded-[28px] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-2 text-black shadow-[0_24px_70px_rgba(0,0,0,0.24)] ${roleOnly ? 'max-w-[820px]' : 'max-w-[940px]'}`}>
            <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
              <SetPieceDiagramCanvas elements={drawableElements} selectedId={selectedId} onSelect={selectElement} onChange={updateElements} players={players} snap={snapEnabled} fullField={fullFieldOverride ?? String(diagram.tipo || '').includes('saque_inicio')} visibleLayers={visibleLayers} identityConvention={editorContext === 'match-plan' ? 'match-plan' : 'default'} renderMode={renderMode} optimizeLabels={renderMode === 'abp'} />
            </div>
            {!drawableElements.length ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8"><div className="max-w-xs rounded-2xl bg-slate-950/80 px-5 py-4 text-center text-white shadow-xl backdrop-blur-sm"><p className="text-sm font-black">El campo está listo</p><p className="mt-1 text-xs leading-5 text-slate-300">Empieza añadiendo participantes, balón o trazados.</p></div></div> : null}
          </div>
          {renderMode === 'abp' && crowdedParticipants.length ? <p role="status" className="mx-auto w-fit rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-[10px] font-bold text-amber-100">Elementos muy próximos · {crowdedParticipants.length} {crowdedParticipants.length === 1 ? 'pareja' : 'parejas'}. Revisa su separación si no es intencionada.</p> : null}
          {editorContext === 'match-plan' ? <MatchPlanIdentityLegend /> : null}
          {visibleLayers.chronology ? <section className="rounded-[24px] border border-white/[0.07] bg-[#08131f]/75 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className={labelClass}>Cronología</p><span className="text-[10px] text-slate-500">Selecciona un paso para editar su participante</span></div>
            {chronology.length ? <ol className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-stretch" aria-label="Secuencia de la jugada">{chronology.map((step, index) => <li key={step.id} className="relative flex min-w-0 flex-1 items-stretch gap-2 lg:block"><button type="button" aria-label={`Paso ${step.order}: ${step.playerName}`} aria-current={selectedId === step.id ? 'step' : undefined} onClick={() => selectElement(step.id)} className={`flex min-h-14 w-full items-center gap-2 rounded-2xl px-3 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-caudal-electric lg:items-start ${selectedId === step.id ? 'bg-caudal-electric/15 ring-1 ring-caudal-electric/60' : 'bg-black/15 hover:bg-white/[0.06]'}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-caudal-electric text-[11px] font-black text-slate-950">{step.order}</span><span className="min-w-0"><strong className="block truncate text-[11px] text-white">{step.playerName}</strong><span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{step.instruction || 'Sin consigna'}</span></span></button>{index < chronology.length - 1 ? <span className="flex w-5 shrink-0 items-center justify-center text-caudal-electric/50 lg:absolute lg:-right-2.5 lg:top-1/2 lg:z-10 lg:-translate-y-1/2" aria-hidden="true"><span className="lg:hidden">↓</span><span className="hidden lg:inline">›</span></span> : null}</li>)}</ol> : <p className="mt-2 text-xs text-slate-500">Selecciona participantes y asigna su orden de aparición. La secuencia aparecerá aquí.</p>}
          </section> : null}
        </div>

        <aside className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#08131f]/95 shadow-[0_20px_50px_rgba(0,0,0,0.2)] xl:sticky xl:top-4">
          <div className="border-b border-white/[0.07] p-3">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">Panel contextual</p><p className="mt-1 truncate text-xs font-bold text-white">{isSelectedPlayer ? selectedParticipantName : 'Información de la jugada'}</p></div>{isSelectedPlayer ? <span className="rounded-full bg-caudal-electric/15 px-2 py-1 text-[9px] font-black uppercase text-caudal-electric">Seleccionado</span> : null}</div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1" role="tablist" aria-label="Panel de edición">
              {panelTabs.map(([id, label]) => { const disabled = id === 'player' && !isSelectedPlayer; return <button key={id} type="button" role="tab" aria-selected={panel === id} aria-controls={`set-piece-panel-${id}`} disabled={disabled} onClick={() => setPanel(id)} className={`min-h-11 rounded-lg text-[10px] font-black uppercase outline-none transition focus-visible:ring-2 focus-visible:ring-caudal-electric ${panel === id ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35`}>{label}</button>; })}
            </div>
          </div>

          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-3 pb-4" id={`set-piece-panel-${panel}`} role="tabpanel">
            {panel === 'tactic' ? (
              <div>
                {editorContext === 'match-plan' ? (
                  <div className="my-4 rounded-2xl bg-caudal-electric/[0.08] p-4 text-xs leading-5 text-slate-300 ring-1 ring-caudal-electric/20">El objetivo y las claves colectivas se editan en la ficha superior. Este panel se centra en el dibujo táctico y sus elementos.</div>
                ) : <>
                <EditorAccordion id="ficha" title="Ficha" open={openSections.ficha} onToggle={() => toggleSection('ficha')}>
                  <TacticalField label="Señal de la jugada" value={tacticalMeta.signal} onChange={(signal) => updateMeta({ signal })} placeholder="Ej. Mano arriba" />
                  {defensive && !roleOnly ? <label className="grid gap-1.5"><span className={labelClass}>Tipo de defensa</span><select value={tacticalMeta.libraryMarking} onChange={(event) => updateMeta({ libraryMarking: event.target.value })} className={`${fieldClass} bg-white font-bold text-slate-950`}><option value="">Sin definir</option><option value="Zonal">Zonal</option><option value="Individual">Individual</option><option value="Mixto">Mixta</option></select></label> : null}
                  {defensiveStructure ? <section className="rounded-xl border border-caudal-electric/20 bg-caudal-electric/[0.06] p-3"><p className={labelClass}>Estructura defensiva · derivada de roles</p><p className="mt-2 text-sm font-black uppercase leading-5 text-white">{defensiveStructure}</p></section> : null}
                  <TacticalField label={defensive ? 'Clave defensiva' : 'Objetivo'} value={tacticalMeta.objective} onChange={(objective) => updateMeta({ objective })} placeholder={defensive ? 'Ganar 1er contacto' : 'Liberar segundo palo'} />
                  {!defensive ? <TacticalField label="Tipo de saque" value={tacticalMeta.saqueType} onChange={(saqueType) => updateMeta({ saqueType })} placeholder="Saque corto, de banda, de inicio..." /> : null}
                  {!defensive ? <TacticalField label="Cuándo utilizarla" value={tacticalMeta.whenToUse} onChange={(whenToUse) => updateMeta({ whenToUse })} placeholder={'Primeros córners.\nSi el rival marca en zona.'} rows={3} /> : null}
                  <TacticalField label="Consigna general · máx. 3 líneas" value={diagram.consigna || tacticalMeta.generalInstruction} onChange={(generalInstruction) => updateDiagram({ consigna: generalInstruction, elements: setSetPieceTacticalMeta(diagram.elements, { ...tacticalMeta, generalInstruction }) })} placeholder="Mensaje breve para el grupo" rows={3} maxLength={240} />
                  {responsibilities.length ? <div className="rounded-xl bg-black/15 p-3"><p className={labelClass}>Roles asignados</p><div className="mt-2 space-y-1.5">{responsibilities.map((item, index) => <div key={`${item.role}-${item.playerName}-${index}`} className="flex items-center justify-between gap-3 text-[11px]"><span className="text-slate-400">{item.role}</span><strong className="truncate text-white">{item.playerName}{item.primary ? ' · Principal' : ''}</strong></div>)}</div></div> : null}
                </EditorAccordion>
                <EditorAccordion id="risk" title="Riesgo / Alternativa" open={openSections.risk} onToggle={() => toggleSection('risk')}>
                  <TacticalField label="Riesgo" value={tacticalMeta.risk} onChange={(risk) => updateMeta({ risk })} placeholder="Qué ocurre si falla" rows={2} />
                  <TacticalField label="Alternativa" value={tacticalMeta.alternative} onChange={(alternative) => updateMeta({ alternative })} placeholder="Qué hacer si el rival cambia el marcaje" rows={2} />
                </EditorAccordion>
                <EditorAccordion id="dossier" title="Dossier" open={openSections.dossier} onToggle={() => toggleSection('dossier')}>
                  <label className="grid gap-1.5"><span className={labelClass}>Identidad en dossier</span><select value={tacticalMeta.printIdentityMode} onChange={(event) => updateIdentityMode(event.target.value)} className={`${fieldClass} bg-white font-bold text-slate-950`}><option value={SET_PIECE_PRINT_IDENTITY_MODES.NUMBER}>Dorsal</option><option value={SET_PIECE_PRINT_IDENTITY_MODES.ABBREVIATION}>Abreviatura</option><option value={SET_PIECE_PRINT_IDENTITY_MODES.NUMBER_AND_ABBREVIATION}>Dorsal + abreviatura</option></select></label>
                  <TacticalField label="Etiquetas" value={tacticalMeta.tags.join(', ')} onChange={(value) => updateMeta({ tags: value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="segundo palo, zona" />
                  <div><p className={labelClass}>Valoración</p><div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`Valorar con ${rating}`} aria-pressed={tacticalMeta.rating === rating} onClick={() => updateMeta({ rating })} className={`min-h-11 min-w-11 rounded-lg text-lg outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric ${rating <= tacticalMeta.rating ? 'text-amber-300' : 'text-slate-700'}`}>★</button>)}</div></div>
                </EditorAccordion>
                <EditorAccordion id="library" title="Biblioteca" open={openSections.library} onToggle={() => toggleSection('library')}>
                  {tacticalMeta.libraryId ? <section className="rounded-xl bg-emerald-300/[0.06] p-3"><p className={labelClass}>Origen de biblioteca</p><p className="mt-1 text-xs font-bold text-emerald-100">Instancia vinculada · plantilla {tacticalMeta.libraryVersion || 'sin versión'}</p><p className="mt-1 text-[10px] text-slate-500">La instancia del partido es editable y no modifica la plantilla maestra.</p></section> : <p className="text-xs leading-5 text-slate-500">Esta jugada todavía no está vinculada a una plantilla.</p>}
                </EditorAccordion>
                <EditorAccordion id="observations" title="Observaciones" open={openSections.observations} onToggle={() => toggleSection('observations')}>
                  <TacticalField label="Observaciones" value={tacticalMeta.observations} onChange={(observations) => updateMeta({ observations })} placeholder="Notas internas del entrenador" rows={3} />
                  {suggestions.length ? <section className="rounded-xl bg-caudal-electric/[0.07] p-3"><p className={labelClass}>Sugerencias contextuales · nunca automáticas</p><div className="mt-2 space-y-2">{suggestions.slice(0, 4).map((suggestion, index) => <div key={`${suggestion.source}-${index}`} className="rounded-xl bg-black/15 p-2.5"><p className="text-xs font-bold leading-5 text-white">{suggestion.text}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-caudal-electric">{suggestion.source}</p></div>)}</div></section> : null}
                </EditorAccordion>
                </>}
              </div>
            ) : null}

            {panel === 'player' && isSelectedPlayer ? (
              <div className="space-y-4 py-4">
                <div className="rounded-2xl bg-caudal-electric/[0.08] p-3 ring-1 ring-caudal-electric/25"><p className={labelClass}>{roleOnly ? 'Participante por rol' : 'Jugador seleccionado'}</p><p className="mt-1 text-base font-black text-white">{selectedParticipantName}</p><p className="mt-1 text-[10px] text-caudal-electric">Editando el elemento resaltado en el campo</p></div>
                {!roleOnly && selectedElement.type === 'player' ? <label className="grid gap-1.5"><span className={labelClass}>Jugador vinculado</span><select value={selectedElement.player_id || ''} disabled={!linkedPlayerOptions.hasDefinedStarters} onChange={(event) => { const player = players.find((item) => String(item.id) === event.target.value); updateSelected({ player_id: event.target.value, label: player?.number || player?.dorsal ? String(player.number ?? player.dorsal) : selectedElement.label, name: '' }); }} className={`${fieldClass} bg-white font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500`}>
                  {!linkedPlayerOptions.hasDefinedStarters ? <option value="">No hay titulares definidos</option> : <option value="">Sin jugador vinculado</option>}
                  {linkedPlayerOptions.exceptionalOption ? <option value={linkedPlayerOptions.exceptionalOption.id}>{linkedPlayerOptions.exceptionalOption.label}</option> : null}
                  {linkedPlayerOptions.starterOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select></label> : null}
                <div><p className={labelClass}>{participantRoleMode === 'single' ? 'Etiqueta táctica' : 'Roles · selección múltiple'}</p><div className="mt-2 grid grid-cols-2 gap-2">{effectiveRoleOptions.map((role) => { const active = (selectedElement.roles || []).includes(role); return <button key={role} type="button" aria-pressed={active} onClick={() => toggleRole(role)} className={`flex min-h-11 items-center justify-between rounded-xl px-3 text-left text-[10px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-caudal-electric ${active ? 'bg-caudal-electric text-slate-950' : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.09]'}`}><span>{role}</span><span aria-hidden="true">{active ? '✓' : '+'}</span></button>; })}</div></div>
                {editorContext !== 'match-plan' ? <>
                  <TacticalField label="Consigna individual" value={selectedElement.note || ''} onChange={(note) => updateSelected({ note })} placeholder="Fija y ataca el espacio" rows={3} />
                  <label className="grid gap-1.5"><span className={labelClass}>Orden de aparición</span><input type="number" min="1" max="20" value={selectedElement.sequenceOrder || ''} onChange={(event) => updateSelected({ sequenceOrder: event.target.value ? Number(event.target.value) : null })} className={fieldClass} placeholder="1" /></label>
                  <label className={`flex min-h-12 cursor-pointer items-center justify-between rounded-xl p-3 text-xs font-bold transition ${selectedElement.primaryResponsibility ? 'bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/35' : 'bg-white/[0.04] text-white'}`}><span><strong className="block">Responsable principal</strong><span className="mt-0.5 block text-[10px] font-normal text-slate-400">Marca la referencia principal de la acción</span></span><input type="checkbox" checked={Boolean(selectedElement.primaryResponsibility)} onChange={(event) => updateSelected({ primaryResponsibility: event.target.checked })} className="h-5 w-5 accent-[#3dd9ff]" /></label>
                </> : null}
              </div>
            ) : null}

            {selectedElement && !isSelectedPlayer ? (
              <div className="space-y-3 py-4"><div className="rounded-2xl bg-caudal-electric/[0.08] p-3 ring-1 ring-caudal-electric/25"><p className={labelClass}>Elemento seleccionado</p><p className="mt-1 text-sm font-black capitalize text-white">{selectedElement.type.replaceAll('_', ' ')}</p></div>{!isArrow(selectedElement) ? <TacticalField label="Etiqueta / texto" value={selectedElement.label || ''} onChange={(label) => updateSelected({ label })} placeholder="Etiqueta" rows={selectedElement.type === 'text_box' ? 4 : 0} /> : <label className="grid gap-1.5"><span className={labelClass}>Trayectoria</span><select value={getSetPieceArrowStyle(selectedElement)} onChange={(event) => updateSelected(applySetPieceArrowStyle(selectedElement, event.target.value))} className={`${fieldClass} bg-white font-bold text-slate-950`}><option value="arrow">Continua</option><option value="curved_arrow">Curva</option><option value="curved_dashed_arrow">Curva discontinua</option><option value="double_arrow">Doble</option><option value="dashed_arrow">Discontinua</option></select></label>}{isResizableBox(selectedElement) ? <div className="grid grid-cols-2 gap-2">{selectedWidthRange ? <label className="grid gap-1"><span className={labelClass}>Ancho</span><input type="number" value={selectedElement.width ?? selectedWidthRange.defaultValue} onChange={(event) => updateSelected({ width: normalizeSetPieceDimensionValue(selectedElement, 'width', event.target.value, selectedElement.width) })} className={fieldClass} /></label> : null}{selectedHeightRange ? <label className="grid gap-1"><span className={labelClass}>Alto</span><input type="number" value={selectedElement.height ?? selectedHeightRange.defaultValue} onChange={(event) => updateSelected({ height: normalizeSetPieceDimensionValue(selectedElement, 'height', event.target.value, selectedElement.height) })} className={fieldClass} /></label> : null}</div> : null}<div className="grid grid-cols-2 gap-2"><button type="button" onClick={duplicateSelected} className="min-h-11 rounded-xl bg-white/10 px-3 text-xs font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric">Duplicar</button><button type="button" onClick={deleteSelected} className="min-h-11 rounded-xl bg-red-500/15 px-3 text-xs font-bold text-red-100 outline-none focus-visible:ring-2 focus-visible:ring-red-300">Eliminar</button></div></div>
            ) : null}
          </div>
        </aside>
      </div>
      {overlay === 'preview' ? <PreviewOverlay diagrams={printDiagrams.length ? printDiagrams : [diagram]} players={players} match={match} onClose={() => setOverlay('')} /> : null}
      {overlay === 'presentation' ? <PresentationOverlay diagram={diagram} players={players} onClose={() => setOverlay('')} /> : null}
    </div>
  );
}
