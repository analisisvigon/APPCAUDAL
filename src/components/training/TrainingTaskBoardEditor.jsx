import { useEffect, useState } from 'react';
import SetPieceDiagramCanvas from '../print/SetPieceDiagramCanvas';
import SetPieceDiagramToolbar from '../print/SetPieceDiagramToolbar';
import {
  cloneDiagramElements,
  createDiagramElement,
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

const TASK_TOOL_TYPES = ['player', 'opponent', 'ball', 'arrow', 'curved_arrow', 'dashed_arrow', 'zone', 'text'];
const LABEL_TYPES = new Set(['player', 'opponent', 'zone', 'text']);
const buttonClass = 'min-h-10 rounded-xl bg-white/[0.07] px-3 text-[11px] font-black text-slate-200 outline-none hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-caudal-electric disabled:opacity-35';

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
          <h3 id="training-task-board-title" className="mt-1 text-base font-black text-white">Pizarra de ejercicio</h3>
          <p className="mt-1 text-xs text-slate-500">{readOnly ? 'Vista de la organización guardada.' : 'Opcional. Abrir la pizarra no añade datos hasta que realices un cambio.'}</p>
        </div>
        {!readOnly ? <label className="grid gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Terreno<select value={scene.board.pitchType} onChange={(event) => commitScene({ ...scene, board: { ...scene.board, pitchType: event.target.value } })} className="min-h-10 rounded-xl border border-white/10 bg-white px-3 text-xs font-bold text-slate-950"><option value="full">Campo completo</option><option value="penalty-area">Área</option></select></label> : null}
      </div>

      {!readOnly ? <div className="mt-3"><SetPieceDiagramToolbar onAdd={(type) => { const element = createDiagramElement(type); updateElements([...elements, element]); setSelectedId(element.id); }} ariaLabel="Herramientas de la pizarra de ejercicio" allowedTypes={TASK_TOOL_TYPES} /></div> : null}
      {!readOnly ? <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Acciones de la pizarra">
        <button type="button" className={buttonClass} disabled={history.index <= 0} onClick={() => moveHistory('undo')}>Deshacer</button>
        <button type="button" className={buttonClass} disabled={history.index >= history.entries.length - 1} onClick={() => moveHistory('redo')}>Rehacer</button>
        <button type="button" className={buttonClass} aria-pressed={snap} onClick={() => setSnap((current) => !current)}>Imán</button>
        <button type="button" className={buttonClass} disabled={!selectedElement} onClick={() => { const copy = duplicateDiagramElement(selectedElement); updateElements([...elements, copy]); setSelectedId(copy.id); }}>Duplicar</button>
        <button type="button" className={`${buttonClass} text-amber-100`} disabled={!selectedElement} onClick={deleteSelected}>Borrar</button>
        <button type="button" className={`${buttonClass} text-red-200`} disabled={!elements.length} onClick={() => { updateElements([]); setSelectedId(''); }}>Limpiar</button>
      </div> : null}

      <div className="mt-3 w-full min-w-0 overflow-auto rounded-2xl bg-white p-2 text-slate-950 shadow-inner">
        <div className="min-w-[520px]">
          <SetPieceDiagramCanvas
            elements={elements}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={updateElements}
            readOnly={!editable}
            snap={snap}
            fullField={scene.board.pitchType === 'full'}
            ariaLabel={readOnly ? 'Pizarra de ejercicio' : 'Editor de la pizarra de ejercicio'}
          />
        </div>
      </div>

      {!readOnly && selectedElement && LABEL_TYPES.has(selectedElement.type) ? <label className="mt-3 grid max-w-sm gap-1"><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Etiqueta del elemento seleccionado</span><input value={selectedElement.label || ''} onChange={(event) => updateElements(elements.map((element) => element.id === selectedId ? { ...element, label: event.target.value } : element))} className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-caudal-electric/60" /></label> : null}
      {!readOnly ? <p className={`mt-2 text-right text-[10px] font-bold ${size.exceedsLimit ? 'text-red-200' : 'text-slate-600'}`}>{size.bytes.toLocaleString('es-ES')} / 262.144 bytes</p> : null}
    </section>
  );
}
