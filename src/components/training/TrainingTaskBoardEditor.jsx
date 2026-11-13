import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TrainingTaskDiagramCanvas from './TrainingTaskDiagramCanvas';
import TrainingTaskBoardToolbar from './TrainingTaskBoardToolbar';
import TrainingTaskTeamsPanel, { TrainingTaskRosterToolbar } from './TrainingTaskTeamsPanel';
import {
  cloneDiagramElements,
  createDiagramHistory,
  duplicateDiagramElement,
  moveDiagramHistory,
  pushDiagramHistory,
} from '../../utils/diagramEditorState';
import {
  deleteSetPieceElement,
  getSetPieceDeleteAction,
  getSetPieceHistoryAction,
} from '../../utils/setPieceEditorInteractions';
import {
  createTrainingTaskEditorSceneV1,
  getTrainingTaskEditorPayloadSize,
  readTrainingTaskEditorPayload,
  serializeTrainingTaskEditorScene,
} from '../../utils/trainingTaskEditorPayload';
import {
  adaptLegacyTrainingBoardElement,
  drawTrainingTaskBoardElement,
  getTrainingConditionalMaterial,
  getTrainingBoardColor,
  placeTrainingTaskBoardElement,
  resizeTrainingBoardMaterial,
  rotateTrainingBoardElement,
  PARTICIPANT_ROLES,
  TRAINING_BOARD_PALETTE,
  TRAINING_BOARD_TEAM_OPTIONS,
} from '../../utils/trainingTaskBoardElements';
import {
  assignTrainingTaskPlayer, createTrainingTaskRosterParticipant, getTrainingTaskAssignment,
  getTrainingTaskPlayerRefKey, isTrainingTaskPlayerPlaced, normalizeTrainingTaskAssignments,
  removeTrainingTaskAssignment, removeTrainingTaskPlayerFromBoard, resolveTrainingTaskPlayerRef,
  setTrainingTaskTeamColor, syncTrainingTaskPlacedPlayers,
} from '../../utils/trainingTaskRoster';
import {
  accreditTrainingTaskZone,
  applyTrainingTaskZoneMetres,
  getTrainingTaskSpatialCaption,
  getTrainingTaskSpatialPosition,
  getTrainingTaskZoneMetres,
  readTrainingTaskSpace,
  synchronizeTrainingTaskSpatialMetadata,
} from '../../utils/trainingTaskSpatial';

const buttonClass = 'min-h-10 rounded-xl bg-white/[0.07] px-3 text-[11px] font-black text-slate-200 outline-none hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-caudal-electric disabled:opacity-35';
const inputClass = 'min-h-10 rounded-xl border border-white/10 bg-white px-3 text-xs font-bold text-slate-950 outline-none focus:ring-2 focus:ring-caudal-electric';
const TRACE_TYPES = new Set(['arrow', 'curved_arrow', 'dashed_arrow', 'double_arrow', 'line', 'dashed_line']);
const ROTATABLE_TYPES = new Set(['pole', 'mannequin', 'goal', 'mini_goal', 'conditional_material']);
const COLOR_TYPES = new Set(['participant', 'player', 'opponent', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'conditional_material', 'arrow', 'curved_arrow', 'dashed_arrow', 'double_arrow', 'line', 'dashed_line', 'zone', 'text']);

function ElementProperties({ element, players = [], space = null, onChange, onDuplicate, onDelete }) {
  const participant = ['participant', 'player', 'opponent'].includes(element.type);
  const labelEditable = participant || ['zone', 'text', 'text_box'].includes(element.type);
  const selectedColor = getTrainingBoardColor(element, element.type === 'text' ? 'white' : 'blue').key;
  const conditionalMaterial = element.type === 'conditional_material'
    ? getTrainingConditionalMaterial(element.materialKey) : null;
  const realPlayer = element.playerRef ? resolveTrainingTaskPlayerRef(element.playerRef, players) : null;
  const zoneMetres = getTrainingTaskZoneMetres(element, space);
  const materialPosition = getTrainingTaskSpatialPosition(element, space);
  return <aside className="mt-2 w-full shrink-0 rounded-xl bg-[#071526]/90 p-3 xl:mt-0 xl:w-72" aria-label="Propiedades del elemento seleccionado">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-caudal-electric">Elemento seleccionado</p><p className="mt-0.5 text-sm font-black capitalize text-white">{element.role || conditionalMaterial?.name || element.type.replaceAll('_', ' ')}</p></div><div className="flex gap-1.5"><button type="button" disabled={!onDuplicate} onClick={onDuplicate} className={buttonClass}>Duplicar</button><button type="button" onClick={onDelete} className={`${buttonClass} text-red-200`}>Borrar</button></div></div>
    {realPlayer ? <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2">{realPlayer.display.image ? <img src={realPlayer.display.image} alt="" className="h-10 w-10 rounded-full object-cover" /> : null}<div className="min-w-0"><p className="truncate text-xs font-black text-white">{realPlayer.display.name}</p><p className="truncate text-[10px] text-slate-500">{realPlayer.display.number ? `#${realPlayer.display.number} · ` : ''}{realPlayer.display.specificPosition || realPlayer.display.position}{realPlayer.unavailable ? ' · no disponible' : ''}</p></div></div> : null}
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      {participant && element.role !== 'coach' && element.role !== 'neutral' ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Equipo<select value={element.teamKey || 'team-1'} onChange={(event) => onChange({ teamKey: event.target.value })} className={inputClass}>{TRAINING_BOARD_TEAM_OPTIONS.map((team) => <option key={team.key} value={team.key}>{team.label}</option>)}</select></label> : null}
      {participant ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Rol<select value={element.role || 'player'} onChange={(event) => onChange({ role: event.target.value })} className={inputClass}>{PARTICIPANT_ROLES.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}</select></label> : null}
      {labelEditable ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Número / etiqueta<input value={element.label || ''} onChange={(event) => onChange({ label: event.target.value })} maxLength={40} className={inputClass} /></label> : null}
      {TRACE_TYPES.has(element.type) ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Trazado<select value={element.type} onChange={(event) => onChange({ type: event.target.value, ...(event.target.value === 'curved_arrow' ? { controlX: element.controlX ?? 45, controlY: element.controlY ?? 20 } : {}) })} className={inputClass}><option value="arrow">Flecha</option><option value="curved_arrow">Curva</option><option value="dashed_arrow">Flecha discontinua</option><option value="line">Línea</option><option value="dashed_line">Línea discontinua</option></select></label> : null}
      {element.type === 'zone' ? <><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Opacidad<select value={element.opacity ?? .18} onChange={(event) => onChange({ opacity: Number(event.target.value) })} className={inputClass}><option value="0.1">10%</option><option value="0.18">18%</option><option value="0.28">28%</option></select></label><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Borde<select value={element.borderStyle || 'solid'} onChange={(event) => onChange({ borderStyle: event.target.value })} className={inputClass}><option value="solid">Continuo</option><option value="dashed">Discontinuo</option></select></label></> : null}
      {ROTATABLE_TYPES.has(element.type) ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Orientación<select value={Number(element.rotation) || 0} onChange={(event) => onChange({ rotation: Number(event.target.value) })} className={inputClass}>{[0, 90, 180, 270].map((rotation) => <option key={rotation} value={rotation}>{rotation}°</option>)}</select></label> : null}
      {['goal', 'mini_goal'].includes(element.type) ? <button type="button" onClick={() => onChange(rotateTrainingBoardElement(element))} className={buttonClass}>Rotar 90°</button> : null}
      {element.type === 'conditional_material' ? <><button type="button" onClick={() => onChange({ rotation: rotateTrainingBoardElement(element).rotation })} className={buttonClass}>Rotar 90°</button><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Tamaño · ancho<input type="number" min="3" max="28" value={element.width || conditionalMaterial?.geometry.width || 10} onChange={(event) => onChange(resizeTrainingBoardMaterial(element, { width: event.target.value }))} className={inputClass} /></label><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Tamaño · alto<input type="number" min="3" max="24" value={element.height || conditionalMaterial?.geometry.height || 8} onChange={(event) => onChange(resizeTrainingBoardMaterial(element, { height: event.target.value }))} className={inputClass} /></label></> : null}
      {['goal', 'mini_goal'].includes(element.type) ? <><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Ancho<input type="number" min="4" max="30" value={element.width || (element.type === 'goal' ? 10 : 6)} onChange={(event) => onChange({ width: Math.max(4, Math.min(30, Number(event.target.value))) })} className={inputClass} /></label><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Fondo<input type="number" min="2" max="14" value={element.height || (element.type === 'goal' ? 4.5 : 3)} onChange={(event) => onChange({ height: Math.max(2, Math.min(14, Number(event.target.value))) })} className={inputClass} /></label></> : null}
    </div>
    {element.type === 'zone' ? <div className="mt-3 rounded-xl border border-caudal-electric/20 bg-caudal-electric/[0.06] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-wider text-caudal-electric">Escala espacial</p><p className="mt-0.5 text-[10px] text-slate-400">{space ? element.spatialMode === 'measured' ? 'Medidas acreditadas para esta tarea.' : 'Zona visual/provisional.' : 'Añade ancho y largo en Organización para acreditar medidas.'}</p></div>{space ? <button type="button" onClick={() => onChange(accreditTrainingTaskZone(element, space))} className={buttonClass}>{element.spatialMode === 'measured' ? 'Recalcular' : 'Acreditar medidas'}</button> : null}</div>
      {space && zoneMetres ? <div className="mt-2 grid grid-cols-2 gap-2"><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Ancho · m<input type="number" min="0.1" step="0.1" value={element.spatialMode === 'measured' ? element.zoneWidthM ?? zoneMetres.widthM : zoneMetres.widthM} onChange={(event) => onChange(applyTrainingTaskZoneMetres(element, space, { widthM: event.target.value, lengthM: element.zoneLengthM ?? zoneMetres.lengthM }))} className={inputClass} /></label><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Largo · m<input type="number" min="0.1" step="0.1" value={element.spatialMode === 'measured' ? element.zoneLengthM ?? zoneMetres.lengthM : zoneMetres.lengthM} onChange={(event) => onChange(applyTrainingTaskZoneMetres(element, space, { widthM: element.zoneWidthM ?? zoneMetres.widthM, lengthM: event.target.value }))} className={inputClass} /></label></div> : null}
    </div> : null}
    {materialPosition ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-2.5"><p className="text-[9px] font-black uppercase tracking-wider text-caudal-electric">Referencia espacial</p><p className="mt-0.5 text-[11px] text-slate-300">{materialPosition.widthM} m de ancho · {materialPosition.lengthM} m de largo</p><p className="mt-1 text-[10px] leading-4 text-slate-500">La posición se guarda proporcionalmente al espacio de la tarea.</p></div> : null}
    {COLOR_TYPES.has(element.type) ? <div className="mt-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Color</p><div className="mt-1.5 flex flex-wrap gap-2">{Object.values(TRAINING_BOARD_PALETTE).map((color) => <button key={color.key} type="button" title={color.label} aria-label={`Color ${color.label}`} aria-pressed={selectedColor === color.key} onClick={() => onChange({ colorKey: color.key })} className={`h-9 w-9 rounded-full border-2 shadow-sm ${selectedColor === color.key ? 'scale-110 border-caudal-electric ring-2 ring-caudal-electric/30' : 'border-white/40'}`} style={{ backgroundColor: color.value }} />)}</div></div> : null}
  </aside>;
}

const initialEditorState = (payload) => {
  const parsed = readTrainingTaskEditorPayload(payload);
  if (parsed.kind === 'v1') return { parsed, scene: parsed.scene };
  if (parsed.kind === 'empty') return { parsed, scene: createTrainingTaskEditorSceneV1() };
  return { parsed, scene: null };
};

export default function TrainingTaskBoardEditor({ payload = {}, onPayloadChange = null, readOnly = false, showEmpty = true, players = [], spaceWidthM = null, spaceLengthM = null, compact = false, viewportFit = false }) {
  const [{ parsed, scene: initialScene }] = useState(() => initialEditorState(payload));
  const [scene, setScene] = useState(initialScene);
  const [hasPayload, setHasPayload] = useState(parsed.kind === 'v1');
  const [selectedId, setSelectedId] = useState('');
  const [snap, setSnap] = useState(false);
  const [activeTool, setActiveTool] = useState('select');
  const [expanded, setExpanded] = useState(false);
  const boardRef = useRef(null);
  const [view, setView] = useState('board');
  const [history, setHistory] = useState(() => createDiagramHistory(initialScene?.board.elements || []));
  const editable = !readOnly && parsed.kind !== 'unsupported' && parsed.kind !== 'invalid';
  const elements = scene?.board.elements || [];
  const assignments = normalizeTrainingTaskAssignments(scene?.assignments);
  const selectedElement = elements.find((element) => element.id === selectedId) || null;
  const selectedView = selectedElement ? adaptLegacyTrainingBoardElement(selectedElement) : null;
  const space = readTrainingTaskSpace(spaceWidthM, spaceLengthM);

  const commitScene = (nextScene, { recordHistory = true } = {}) => {
    const serialized = serializeTrainingTaskEditorScene({ ...nextScene, board: { ...nextScene.board, elements: synchronizeTrainingTaskSpatialMetadata(nextScene.board.elements, space) } });
    setScene(serialized);
    setHasPayload(true);
    if (recordHistory) setHistory((current) => pushDiagramHistory(current, serialized.board.elements));
    onPayloadChange?.(serialized);
  };

  const updateElements = (nextElements, options = {}) => {
    if (!editable || !scene) return;
    commitScene({
      ...scene,
      board: { ...scene.board, elements: cloneDiagramElements(nextElements) },
    }, options);
  };

  const moveHistory = (direction) => {
    const movement = moveDiagramHistory(history, direction);
    if (!movement.changed) return;
    setHistory(movement.history);
    updateElements(movement.elements, { recordHistory: false });
    setSelectedId('');
  };

  const deleteSelected = () => {
    if (!selectedElement) return;
    updateElements(deleteSetPieceElement(elements, selectedId));
    setSelectedId('');
  };

  const updateSelected = (fields) => {
    if (!selectedElement) return;
    let nextAssignments = assignments;
    let nextFields = fields;
    if (selectedElement.playerRef) {
      const current = getTrainingTaskAssignment(assignments, selectedElement.playerRef);
      if (current) {
        const teamKey = fields.teamKey || current.teamKey;
        const colorKey = fields.colorKey || assignments.teamColors[teamKey] || current.colorKey;
        nextAssignments = { ...assignments, players: assignments.players.map((entry) => entry === current ? { ...entry, ...fields, teamKey, colorKey } : entry) };
        nextFields = { ...fields, colorKey };
      }
    }
    commitScene({ ...scene, assignments: nextAssignments, board: { ...scene.board, elements: elements.map((element) => element.id === selectedId ? { ...element, ...nextFields } : element) } });
  };

  const insertElement = (tool, geometry) => {
    if (!editable) return;
    if (tool.startsWith('roster:')) {
      const key = tool.slice(7);
      const assignment = assignments.players.find((entry) => getTrainingTaskPlayerRefKey(entry.playerRef) === key);
      if (!assignment) return;
      const existing = elements.find((element) => element.playerRef && getTrainingTaskPlayerRefKey(element.playerRef) === key);
      if (existing) { setSelectedId(existing.id); setActiveTool('select'); return; }
      const rosterElement = createTrainingTaskRosterParticipant(assignment, geometry?.point);
      updateElements([...elements, rosterElement]);
      setSelectedId(rosterElement.id); setActiveTool('select'); return;
    }
    const element = geometry?.point
      ? placeTrainingTaskBoardElement(tool, geometry.point)
      : drawTrainingTaskBoardElement(tool, geometry?.start, geometry?.end);
    updateElements([...elements, element]);
    setSelectedId(element.id);
  };

  const updateAssignments = (nextAssignments) => commitScene({ ...scene, assignments: nextAssignments, board: { ...scene.board, elements: syncTrainingTaskPlacedPlayers(elements, nextAssignments) } });
  const assignPlayer = (player, teamKey) => updateAssignments(assignTrainingTaskPlayer(assignments, player, teamKey));
  const removeAssignment = (assignment) => {
    if (isTrainingTaskPlayerPlaced(elements, assignment.playerRef) && !window.confirm('Este jugador está colocado en el campo. Al desasignarlo también se quitará su ficha. ¿Continuar?')) return;
    const nextAssignments = removeTrainingTaskAssignment(assignments, assignment.playerRef);
    commitScene({ ...scene, assignments: nextAssignments, board: { ...scene.board, elements: removeTrainingTaskPlayerFromBoard(elements, assignment.playerRef) } });
    if (selectedElement?.playerRef && getTrainingTaskPlayerRefKey(selectedElement.playerRef) === getTrainingTaskPlayerRefKey(assignment.playerRef)) setSelectedId('');
  };
  const changeTeamColor = (teamKey, colorKey) => updateAssignments(setTrainingTaskTeamColor(assignments, teamKey, colorKey));

  useEffect(() => {
    if (!expanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    boardRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => boardRef.current?.querySelector('button')?.focus());
    };
  }, [expanded]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Tab' && expanded && boardRef.current) {
        const focusable = [...boardRef.current.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]')];
        if (focusable.length && event.shiftKey && (document.activeElement === focusable[0] || document.activeElement === boardRef.current)) {
          event.preventDefault();
          focusable.at(-1).focus();
        } else if (focusable.length && !event.shiftKey && document.activeElement === focusable.at(-1)) {
          event.preventDefault();
          focusable[0].focus();
        }
        return;
      }
      if (event.key === 'Escape' && expanded) {
        event.preventDefault();
        setExpanded(false);
        return;
      }
      if (!editable) return;
      if (event.key === 'Escape' && activeTool !== 'select') {
        event.preventDefault();
        setActiveTool('select');
        return;
      }
      if (event.key === 'Escape' && selectedElement) {
        event.preventDefault();
        setSelectedId('');
        return;
      }
      const historyAction = getSetPieceHistoryAction(event);
      if (historyAction) {
        event.preventDefault();
        moveHistory(historyAction);
        return;
      }
      if (getSetPieceDeleteAction(event, Boolean(selectedElement)) === 'delete') {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (parsed.kind === 'unsupported' || parsed.kind === 'invalid') {
    return (
      <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-4" aria-label="Estado de la pizarra">
        <p className="text-sm font-black text-amber-100">Pizarra no editable con esta versión</p>
        <p className="mt-1 text-xs leading-5 text-amber-100/75">
          {parsed.kind === 'unsupported'
            ? 'Fue creada con una versión del editor que esta aplicación no reconoce. Se conservará sin cambios.'
            : `Los datos de la pizarra no son válidos para el editor actual. Se conservarán sin cambios${parsed.error ? `: ${parsed.error}` : '.'}`}
        </p>
      </section>
    );
  }

  if (readOnly && parsed.kind === 'empty' && !showEmpty) return null;

  const size = getTrainingTaskEditorPayloadSize(hasPayload ? scene : {});
  const board = (
    <section ref={boardRef} tabIndex={expanded ? -1 : undefined} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? 'true' : undefined} className={`min-w-0 ${compact ? 'p-1.5' : 'p-2 sm:p-3'} ${expanded ? 'fixed inset-0 z-[2147483647] flex h-[100dvh] flex-col overflow-hidden bg-[#050d18] shadow-2xl' : `rounded-[1.25rem] bg-black/15 ${viewportFit ? 'lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden' : ''}`}`} aria-labelledby="training-task-board-title">
      <div className={viewportFit && !readOnly && !expanded ? 'lg:flex lg:shrink-0 lg:items-center lg:gap-3' : ''}>
      {!compact ? <div className={`flex shrink-0 flex-wrap items-start justify-between gap-3 ${viewportFit && !readOnly && !expanded ? 'lg:min-w-0 lg:flex-1' : ''}`}>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Diseño de la tarea</p>
          <h3 id="training-task-board-title" className="mt-1 text-base font-black text-white">Pizarra profesional de entrenamiento</h3>
          <p className={`mt-1 text-xs text-slate-500 ${viewportFit && !expanded ? 'lg:hidden' : ''}`}>{readOnly ? 'Vista de la organización guardada.' : 'Opcional. Abrir la pizarra no añade datos hasta que realices un cambio.'}</p>
        </div>
        <div className="flex items-end gap-2">{!readOnly ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Terreno<select value={scene.board.pitchType === 'penalty-area' ? 'half' : scene.board.pitchType} onChange={(event) => commitScene({ ...scene, board: { ...scene.board, pitchType: event.target.value } })} className="min-h-10 rounded-xl border border-white/10 bg-white px-3 text-xs font-bold text-slate-950"><option value="full">Campo completo</option><option value="half">Medio campo</option><option value="blank">Terreno sin líneas</option></select></label> : null}<button type="button" className={buttonClass} onClick={() => setExpanded((current) => !current)}>{expanded ? 'Cerrar vista' : 'Ampliar pizarra'}</button></div>
      </div> : <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-1"><p id="training-task-board-title" className="text-[10px] font-black uppercase tracking-[0.14em] text-caudal-electric">Pizarra · {getTrainingTaskSpatialCaption(space)}</p><button type="button" className={buttonClass} onClick={() => setExpanded((current) => !current)}>{expanded ? 'Cerrar vista' : 'Ampliar pizarra'}</button></div>}

      {!compact ? <div className={`mt-3 flex shrink-0 gap-1 rounded-xl bg-black/20 p-1 ${viewportFit && !expanded ? 'lg:mt-0 lg:w-64' : ''}`} role="tablist" aria-label="Vista del diseño"><button type="button" role="tab" aria-selected={view === 'board'} onClick={() => setView('board')} className={`${buttonClass} flex-1 ${view === 'board' ? 'bg-caudal-electric text-slate-950' : ''}`}>Pizarra</button><button type="button" role="tab" aria-selected={view === 'teams'} onClick={() => setView('teams')} className={`${buttonClass} flex-1 ${view === 'teams' ? 'bg-caudal-electric text-slate-950' : ''}`}>Equipos · {assignments.players.length}</button></div> : null}
      </div>
      {view === 'teams' ? <div className={expanded ? 'min-h-0 flex-1 overflow-y-auto' : viewportFit ? 'lg:min-h-0 lg:flex-1 lg:overflow-y-auto' : ''}><TrainingTaskTeamsPanel players={players} assignments={assignments} elements={elements} readOnly={readOnly} onAssign={assignPlayer} onRemove={removeAssignment} onTeamColor={changeTeamColor} /></div> : null}
      {view === 'board' && !readOnly ? <div className={`mt-2 shrink-0 ${viewportFit && !expanded ? 'lg:flex lg:items-center lg:gap-2' : ''}`}>
        <div className={viewportFit && !expanded ? 'min-w-0 lg:flex-1' : ''}><TrainingTaskBoardToolbar activeTool={activeTool} onToolChange={(tool) => { setActiveTool(tool); if (tool !== 'select') setSelectedId(''); }} /><TrainingTaskRosterToolbar assignments={assignments} players={players} elements={elements} activeTool={activeTool} onToolChange={(tool) => { setActiveTool(tool); setSelectedId(''); }} /></div>
        <div className={`mt-2 flex shrink-0 flex-wrap items-center gap-1.5 ${viewportFit && !expanded ? 'lg:mt-0' : ''}`} aria-label="Acciones de la pizarra">
        <button type="button" className={buttonClass} disabled={history.index <= 0} onClick={() => moveHistory('undo')}>Deshacer</button>
        <button type="button" className={buttonClass} disabled={history.index >= history.entries.length - 1} onClick={() => moveHistory('redo')}>Rehacer</button>
        <button type="button" className={buttonClass} aria-pressed={snap} onClick={() => setSnap((current) => !current)}>Imán</button>
        <button type="button" className={buttonClass} disabled={!selectedElement || Boolean(selectedElement?.playerRef)} onClick={() => { const copy = duplicateDiagramElement(selectedElement); updateElements([...elements, copy]); setSelectedId(copy.id); }}>Duplicar</button>
        <button type="button" className={`${buttonClass} text-amber-100`} disabled={!selectedElement} onClick={deleteSelected}>Borrar</button>
        <button type="button" className={`${buttonClass} text-red-200`} disabled={!elements.length} onClick={() => { updateElements([]); setSelectedId(''); }}>Limpiar</button>
        </div>
      </div> : null}

      {view === 'board' && !readOnly && activeTool !== 'select' ? <p className="mt-1.5 text-center text-[10px] font-bold text-caudal-electric">{activeTool === 'zone' || TRACE_TYPES.has(activeTool) ? 'Arrastra sobre el campo para dibujar' : 'Haz clic en el campo para colocar · Escape para seleccionar'}</p> : null}
      {view === 'board' ? <div className={`${compact ? 'mt-1' : 'mt-2'} min-w-0 gap-2 ${expanded ? 'flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row' : viewportFit ? 'lg:flex lg:min-h-0 lg:flex-1 lg:overflow-hidden' : 'xl:flex'}`}>
        <div className={`w-full min-w-0 flex-1 rounded-xl bg-[#0b1e16] p-1 shadow-[0_18px_45px_rgba(0,0,0,.25)] ${expanded ? 'flex min-h-0 items-center justify-center overflow-hidden' : viewportFit ? 'overflow-hidden lg:flex lg:min-h-0 lg:items-center lg:justify-center' : 'overflow-auto'}`}>
          <div className={`${readOnly || expanded || viewportFit ? 'min-w-0' : 'min-w-[520px]'} overflow-hidden rounded-lg ${expanded ? 'flex h-full max-h-full w-full items-center justify-center' : viewportFit ? 'lg:flex lg:h-full lg:max-h-full lg:w-full lg:items-center lg:justify-center' : ''}`}>
          <TrainingTaskDiagramCanvas
            elements={elements}
            pitchType={scene.board.pitchType === 'penalty-area' ? 'half' : scene.board.pitchType}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={updateElements}
            activeTool={activeTool}
            onInsert={insertElement}
            readOnly={!editable}
            snap={snap}
            players={players}
            fitViewport={expanded ? 'all' : viewportFit ? 'desktop' : false}
          />
          </div>
        </div>
        {!readOnly && selectedView ? <div className={expanded ? 'max-h-[28dvh] min-h-0 overflow-y-auto lg:max-h-none lg:w-60 lg:shrink-0 xl:w-72' : viewportFit ? 'lg:min-h-0 lg:w-60 lg:shrink-0 lg:overflow-y-auto xl:w-72' : ''}><ElementProperties element={selectedView} players={players} space={space} onChange={updateSelected} onDuplicate={selectedElement.playerRef ? null : () => { const copy = duplicateDiagramElement(selectedElement); updateElements([...elements, copy]); setSelectedId(copy.id); }} onDelete={deleteSelected} /></div> : null}
      </div> : null}
      {!readOnly ? <p className={`mt-2 text-right text-[10px] font-bold ${size.exceedsLimit ? 'text-red-200' : 'text-slate-600'}`}>{size.bytes.toLocaleString('es-ES')} / 262.144 bytes</p> : null}
    </section>
  );
  return expanded ? createPortal(board, document.body) : board;
}
