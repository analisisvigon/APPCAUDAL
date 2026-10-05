import { useEffect, useState } from 'react';
import TrainingTaskDiagramCanvas from './TrainingTaskDiagramCanvas';
import TrainingTaskBoardToolbar from './TrainingTaskBoardToolbar';
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
  createTrainingTaskBoardElement,
  getTrainingBoardColor,
  PARTICIPANT_ROLES,
  TRAINING_BOARD_PALETTE,
  TRAINING_BOARD_TEAM_OPTIONS,
} from '../../utils/trainingTaskBoardElements';

const buttonClass = 'min-h-10 rounded-xl bg-white/[0.07] px-3 text-[11px] font-black text-slate-200 outline-none hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-caudal-electric disabled:opacity-35';
const inputClass = 'min-h-10 rounded-xl border border-white/10 bg-white px-3 text-xs font-bold text-slate-950 outline-none focus:ring-2 focus:ring-caudal-electric';
const TRACE_TYPES = new Set(['arrow', 'curved_arrow', 'dashed_arrow', 'double_arrow', 'line', 'dashed_line']);
const ROTATABLE_TYPES = new Set(['pole', 'mannequin', 'goal', 'mini_goal']);
const COLOR_TYPES = new Set(['participant', 'player', 'opponent', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'arrow', 'curved_arrow', 'dashed_arrow', 'double_arrow', 'line', 'dashed_line', 'zone', 'text']);

function ElementProperties({ element, onChange, onDuplicate, onDelete }) {
  const participant = ['participant', 'player', 'opponent'].includes(element.type);
  const labelEditable = participant || ['zone', 'text', 'text_box'].includes(element.type);
  const selectedColor = getTrainingBoardColor(element, element.type === 'text' ? 'white' : 'blue').key;
  return <aside className="mt-3 rounded-2xl border border-white/[0.08] bg-[#071526] p-3" aria-label="Propiedades del elemento seleccionado">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-caudal-electric">Elemento seleccionado</p><p className="mt-0.5 text-sm font-black capitalize text-white">{element.role || element.type.replaceAll('_', ' ')}</p></div><div className="flex gap-1.5"><button type="button" onClick={onDuplicate} className={buttonClass}>Duplicar</button><button type="button" onClick={onDelete} className={`${buttonClass} text-red-200`}>Borrar</button></div></div>
    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {participant && element.role !== 'coach' && element.role !== 'neutral' ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Equipo<select value={element.teamKey || 'team-1'} onChange={(event) => onChange({ teamKey: event.target.value })} className={inputClass}>{TRAINING_BOARD_TEAM_OPTIONS.map((team) => <option key={team.key} value={team.key}>{team.label}</option>)}</select></label> : null}
      {participant ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Rol<select value={element.role || 'player'} onChange={(event) => onChange({ role: event.target.value })} className={inputClass}>{PARTICIPANT_ROLES.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}</select></label> : null}
      {labelEditable ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Número / etiqueta<input value={element.label || ''} onChange={(event) => onChange({ label: event.target.value })} maxLength={40} className={inputClass} /></label> : null}
      {TRACE_TYPES.has(element.type) ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Trazado<select value={element.type} onChange={(event) => onChange({ type: event.target.value, ...(event.target.value === 'curved_arrow' ? { controlX: element.controlX ?? 45, controlY: element.controlY ?? 20 } : {}) })} className={inputClass}><option value="arrow">Flecha</option><option value="curved_arrow">Curva</option><option value="dashed_arrow">Flecha discontinua</option><option value="line">Línea</option><option value="dashed_line">Línea discontinua</option></select></label> : null}
      {element.type === 'zone' ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Opacidad<select value={element.opacity ?? .22} onChange={(event) => onChange({ opacity: Number(event.target.value) })} className={inputClass}><option value="0.14">Suave</option><option value="0.22">Media</option><option value="0.34">Intensa</option></select></label> : null}
      {ROTATABLE_TYPES.has(element.type) ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Orientación<select value={Number(element.rotation) || 0} onChange={(event) => onChange({ rotation: Number(event.target.value) })} className={inputClass}>{[0, 90, 180, 270].map((rotation) => <option key={rotation} value={rotation}>{rotation}°</option>)}</select></label> : null}
      {['goal', 'mini_goal'].includes(element.type) ? <><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Ancho<input type="number" min="4" max="30" value={element.width || 8} onChange={(event) => onChange({ width: Math.max(4, Math.min(30, Number(event.target.value))) })} className={inputClass} /></label><label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Fondo<input type="number" min="2" max="14" value={element.height || 4} onChange={(event) => onChange({ height: Math.max(2, Math.min(14, Number(event.target.value))) })} className={inputClass} /></label></> : null}
    </div>
    {COLOR_TYPES.has(element.type) ? <div className="mt-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Color</p><div className="mt-1.5 flex flex-wrap gap-2">{Object.values(TRAINING_BOARD_PALETTE).map((color) => <button key={color.key} type="button" title={color.label} aria-label={`Color ${color.label}`} aria-pressed={selectedColor === color.key} onClick={() => onChange({ colorKey: color.key })} className={`h-9 w-9 rounded-full border-2 shadow-sm ${selectedColor === color.key ? 'scale-110 border-caudal-electric ring-2 ring-caudal-electric/30' : 'border-white/40'}`} style={{ backgroundColor: color.value }} />)}</div></div> : null}
  </aside>;
}

const initialEditorState = (payload) => {
  const parsed = readTrainingTaskEditorPayload(payload);
  if (parsed.kind === 'v1') return { parsed, scene: parsed.scene };
  if (parsed.kind === 'empty') return { parsed, scene: createTrainingTaskEditorSceneV1() };
  return { parsed, scene: null };
};

export default function TrainingTaskBoardEditor({ payload = {}, onPayloadChange = null, readOnly = false, showEmpty = true }) {
  const [{ parsed, scene: initialScene }] = useState(() => initialEditorState(payload));
  const [scene, setScene] = useState(initialScene);
  const [hasPayload, setHasPayload] = useState(parsed.kind === 'v1');
  const [selectedId, setSelectedId] = useState('');
  const [snap, setSnap] = useState(false);
  const [history, setHistory] = useState(() => createDiagramHistory(initialScene?.board.elements || []));
  const editable = !readOnly && parsed.kind !== 'unsupported' && parsed.kind !== 'invalid';
  const elements = scene?.board.elements || [];
  const selectedElement = elements.find((element) => element.id === selectedId) || null;
  const selectedView = selectedElement ? adaptLegacyTrainingBoardElement(selectedElement) : null;

  const commitScene = (nextScene, { recordHistory = true } = {}) => {
    const serialized = serializeTrainingTaskEditorScene(nextScene);
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
    updateElements(elements.map((element) => element.id === selectedId ? { ...element, ...fields } : element));
  };

  useEffect(() => {
    if (!editable) return undefined;
    const onKeyDown = (event) => {
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
  return (
    <section className="min-w-0 rounded-[1.25rem] border border-white/10 bg-black/15 p-3" aria-labelledby="training-task-board-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Diseño de la tarea</p>
          <h3 id="training-task-board-title" className="mt-1 text-base font-black text-white">Pizarra profesional de entrenamiento</h3>
          <p className="mt-1 text-xs text-slate-500">{readOnly ? 'Vista de la organización guardada.' : 'Opcional. Abrir la pizarra no añade datos hasta que realices un cambio.'}</p>
        </div>
        {!readOnly ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Terreno<select value={scene.board.pitchType === 'penalty-area' ? 'half' : scene.board.pitchType} onChange={(event) => commitScene({ ...scene, board: { ...scene.board, pitchType: event.target.value } })} className="min-h-10 rounded-xl border border-white/10 bg-white px-3 text-xs font-bold text-slate-950"><option value="full">Campo completo</option><option value="half">Medio campo</option><option value="blank">Terreno sin líneas</option></select></label> : null}
      </div>

      {!readOnly ? <div className="mt-3"><TrainingTaskBoardToolbar onAdd={(tool) => { const element = createTrainingTaskBoardElement(tool); updateElements([...elements, element]); setSelectedId(element.id); }} /></div> : null}
      {!readOnly ? <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Acciones de la pizarra">
        <button type="button" className={buttonClass} disabled={history.index <= 0} onClick={() => moveHistory('undo')}>Deshacer</button>
        <button type="button" className={buttonClass} disabled={history.index >= history.entries.length - 1} onClick={() => moveHistory('redo')}>Rehacer</button>
        <button type="button" className={buttonClass} aria-pressed={snap} onClick={() => setSnap((current) => !current)}>Imán</button>
        <button type="button" className={buttonClass} disabled={!selectedElement} onClick={() => { const copy = duplicateDiagramElement(selectedElement); updateElements([...elements, copy]); setSelectedId(copy.id); }}>Duplicar</button>
        <button type="button" className={`${buttonClass} text-amber-100`} disabled={!selectedElement} onClick={deleteSelected}>Borrar</button>
        <button type="button" className={`${buttonClass} text-red-200`} disabled={!elements.length} onClick={() => { updateElements([]); setSelectedId(''); }}>Limpiar</button>
      </div> : null}

      <div className="mt-3 w-full min-w-0 overflow-auto rounded-[1.35rem] bg-[#0b1e16] p-1.5 shadow-[0_22px_60px_rgba(0,0,0,.28)]">
        <div className="min-w-[520px] overflow-hidden rounded-[1.1rem]">
          <TrainingTaskDiagramCanvas
            elements={elements}
            pitchType={scene.board.pitchType === 'penalty-area' ? 'half' : scene.board.pitchType}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={updateElements}
            readOnly={!editable}
            snap={snap}
          />
        </div>
      </div>

      {!readOnly && selectedView ? <ElementProperties element={selectedView} onChange={updateSelected} onDuplicate={() => { const copy = duplicateDiagramElement(selectedElement); updateElements([...elements, copy]); setSelectedId(copy.id); }} onDelete={deleteSelected} /> : null}
      {!readOnly ? <p className={`mt-2 text-right text-[10px] font-bold ${size.exceedsLimit ? 'text-red-200' : 'text-slate-600'}`}>{size.bytes.toLocaleString('es-ES')} / 262.144 bytes</p> : null}
    </section>
  );
}
