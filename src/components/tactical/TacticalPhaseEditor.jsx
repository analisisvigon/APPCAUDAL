import { useEffect, useMemo, useRef, useState } from 'react';
import SetPieceDiagramCanvas from '../print/SetPieceDiagramCanvas';

export const TACTICAL_PHASES = [
  ['build_up', 'Fase de iniciación'], ['progression', 'Fase de progresión'],
  ['finishing', 'Fase de finalización'], ['offensive_transition', 'Transición ofensiva'],
  ['high_block', 'Bloque alto'], ['mid_block', 'Bloque medio'], ['low_block', 'Bloque bajo'],
  ['defensive_transition', 'Transición defensiva'], ['offensive_set_piece', 'ABP ofensiva'],
  ['defensive_set_piece', 'ABP defensiva'],
];

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const playerName = (player) => player?.shirt_name || player?.shirtName || player?.shortName || player?.name || '';
const createPlayer = (type, x, y, player, index) => ({ id: makeId(), type, x, y, label: String(player?.number || index + 1), player_id: player?.id || '', name: playerName(player) });

const formationPoints = (rival, system = '4-3-3') => {
  const parsed = String(system).match(/\d+/g)?.map(Number) || [4, 3, 3];
  const lines = parsed.reduce((sum, value) => sum + value, 0) === 10 ? parsed : [4, 3, 3];
  const ys = rival ? [20, 31, 42, 46] : [81, 69, 58, 53];
  const points = [[36, rival ? 7 : 93]];
  lines.forEach((count, line) => {
    const margin = count <= 2 ? 22 : count === 3 ? 16 : 9;
    for (let index = 0; index < count; index += 1) points.push([count === 1 ? 36 : margin + ((72 - margin * 2) * index) / (count - 1), ys[line]]);
  });
  return points;
};

const baseElements = (players, rivals, caudalSystem, rivalSystem) => [
  ...formationPoints(false, caudalSystem).map(([x, y], index) => createPlayer('player', x, y, players[index], index)),
  ...formationPoints(true, rivalSystem).map(([x, y], index) => createPlayer('opponent', x, y, rivals[index], index)),
  { id: makeId(), type: 'ball', x: 39, y: 89 },
];

const emptyBoard = (key, label, elements) => ({
  id: `phase-${key}`, tipo: key, titulo: label, subtitle: '', actions: [], connections: [],
  elements, description: '', visibility: {}, zoom: 1,
});

const isConnectionArrow = (element) => element.type === 'arrow' || element.type === 'dashed_arrow';
const elementLabel = (element) => element?.name || element?.label || 'Punto libre';

function ActionsPanel({ board, phaseLabel, onChange, collapsed, onToggle }) {
  const [draft, setDraft] = useState({ title: '', description: '' });
  const actions = board.actions || [];
  const changeAction = (id, fields) => onChange({ ...board, actions: actions.map((action) => action.id === id ? { ...action, ...fields } : action) });
  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= actions.length) return;
    const next = [...actions]; [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...board, actions: next });
  };
  if (collapsed) return <button type="button" onClick={onToggle} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black uppercase text-slate-950">Abrir fase</button>;
  return (
    <aside className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[.18em] text-caudal-electric">Explicación de la fase</p><button type="button" onClick={onToggle} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-black uppercase text-white">Plegar</button></div>
      <input value={board.subtitle || ''} onChange={(event) => onChange({ ...board, subtitle: event.target.value })} placeholder="Subtítulo de captura (p. ej. Combinativa)" className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white" />
      <p className="text-xs font-black uppercase text-slate-300">Acciones observadas · {actions.length}</p>
      <div className="max-h-[45vh] space-y-2 overflow-y-auto">
        {actions.map((action, index) => <details key={action.id} open={index === 0} className="rounded-xl bg-black/20 p-2">
          <summary className="cursor-pointer text-xs font-black text-white">{index + 1}. {action.title || 'Sin título'}</summary>
          <div className="mt-2 space-y-2">
            <input value={action.title || ''} onChange={(event) => changeAction(action.id, { title: event.target.value })} className="w-full rounded-lg bg-white/10 px-2 py-2 text-xs text-white" />
            <textarea value={action.description || ''} onChange={(event) => changeAction(action.id, { description: event.target.value })} rows={3} className="w-full rounded-lg bg-white/10 px-2 py-2 text-xs text-white" />
            <div className="flex gap-1"><button type="button" onClick={() => move(index, -1)} className="rounded bg-white/10 px-2 py-1 text-xs text-white">Subir</button><button type="button" onClick={() => move(index, 1)} className="rounded bg-white/10 px-2 py-1 text-xs text-white">Bajar</button><button type="button" onClick={() => onChange({ ...board, actions: actions.filter((item) => item.id !== action.id) })} className="ml-auto rounded bg-rose-500/15 px-2 py-1 text-xs text-rose-200">Eliminar</button></div>
          </div>
        </details>)}
      </div>
      <div className="space-y-2 border-t border-white/10 pt-3">
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Título corto" className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white" />
        <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Descripción" rows={3} className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white" />
        <button type="button" onClick={() => { if (!draft.title.trim()) return; onChange({ ...board, actions: [...actions, { id: makeId(), ...draft }] }); setDraft({ title: '', description: '' }); }} className="w-full rounded-xl bg-caudal-electric py-2 text-xs font-black uppercase text-slate-950">+ Añadir acción</button>
      </div>
      <p className="sr-only">{phaseLabel}</p>
    </aside>
  );
}

export default function TacticalPhaseEditor({ initialBoards = {}, players = [], rivalPlayers = [], opponentKey = '', caudalSystem = '', rivalSystem = '', onSave }) {
  const [activeKey, setActiveKey] = useState('build_up');
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [drawingTool, setDrawingTool] = useState('');
  const [drawOrigin, setDrawOrigin] = useState(null);
  const [captureMode, setCaptureMode] = useState('');
  const onSaveRef = useRef(onSave);
  const initializedRef = useRef(false);
  const hydrate = (source) => Object.fromEntries(TACTICAL_PHASES.map(([key, label]) => {
    const saved = source[key] || {};
    const existing = Array.isArray(saved.elements) && saved.elements.length ? saved.elements : baseElements(players.slice(0, 11), rivalPlayers.slice(0, 11), caudalSystem, rivalSystem);
    return [key, { ...emptyBoard(key, label, existing), ...saved, actions: saved.actions || [], connections: saved.connections || [] }];
  }));
  const [boards, setBoards] = useState(() => hydrate(initialBoards));
  const board = boards[activeKey];
  const phaseLabel = TACTICAL_PHASES.find(([key]) => key === activeKey)?.[1] || '';
  const allPlayers = useMemo(() => [...players, ...rivalPlayers], [players, rivalPlayers]);

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { setBoards(hydrate(initialBoards)); initializedRef.current = false; }, [opponentKey]);
  useEffect(() => {
    if (!initializedRef.current) { initializedRef.current = true; return undefined; }
    const timeout = window.setTimeout(() => onSaveRef.current?.(boards), 650);
    return () => window.clearTimeout(timeout);
  }, [boards]);

  const updateBoard = (next) => setBoards((current) => ({ ...current, [activeKey]: next }));
  const connectionArrows = (board.connections || []).map((connection) => ({
    id: `connection-${connection.id}`, connectionId: connection.id,
    type: connection.kind === 'movement' ? 'dashed_arrow' : 'arrow',
    x1: connection.x1, y1: connection.y1, x2: connection.x2, y2: connection.y2,
    color: connection.color || '#ef4444', strokeWidth: connection.strokeWidth || 1,
  }));
  const staticElements = (board.elements || []).filter((element) => !element.connectionId && !String(element.id).startsWith('connection-'));
  const visibleElements = [...staticElements, ...connectionArrows];
  const updateCanvas = (nextElements) => {
    const arrows = nextElements.filter((element) => element.connectionId);
    updateBoard({
      ...board,
      elements: nextElements.filter((element) => !element.connectionId),
      connections: (board.connections || []).map((connection) => {
        const arrow = arrows.find((item) => item.connectionId === connection.id);
        return arrow ? { ...connection, x1: arrow.x1, y1: arrow.y1, x2: arrow.x2, y2: arrow.y2 } : connection;
      }),
    });
  };
  const directPoint = ({ element, x, y }) => {
    if (!drawingTool) return;
    if (!drawOrigin) {
      if (!element || !['player', 'opponent'].includes(element.type)) return;
      setDrawOrigin({ element, x, y });
      return;
    }
    if (drawingTool === 'pass' && (!element || !['player', 'opponent'].includes(element.type))) return;
    const connection = {
      id: makeId(), kind: drawingTool, team: drawOrigin.element.type === 'opponent' ? 'rival' : 'caudal',
      origin: elementLabel(drawOrigin.element), destination: elementLabel(element), originId: drawOrigin.element.id,
      destinationId: element?.id || '', x1: drawOrigin.x, y1: drawOrigin.y, x2: x, y2: y,
      type: drawingTool === 'movement' ? 'Movimiento sin balón' : 'Pase', intensity: 'Media', comment: '',
      color: '#ef4444', strokeWidth: 1,
    };
    updateBoard({ ...board, connections: [...(board.connections || []), connection] });
    setDrawOrigin(null);
  };
  const updateConnection = (id, fields) => updateBoard({ ...board, connections: board.connections.map((connection) => connection.id === id ? { ...connection, ...fields } : connection) });
  const removeConnection = (id) => updateBoard({ ...board, connections: board.connections.filter((connection) => connection.id !== id) });

  if (captureMode) return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-[#04110d] p-5">
      <button type="button" onClick={() => setCaptureMode('')} className="fixed right-5 top-5 z-10 rounded-xl bg-white/10 px-4 py-2 text-xs font-black text-white">Salir</button>
      <div className={`mx-auto grid aspect-video max-h-[calc(100vh-2.5rem)] max-w-[calc((100vh-2.5rem)*1.777)] gap-5 bg-[#071a14] p-6 ${captureMode === 'with_text' ? 'grid-cols-[1fr_2.2fr]' : 'grid-cols-1'}`}>
        {captureMode === 'with_text' ? <div className="self-center text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">{phaseLabel}</p><h2 className="mt-2 text-3xl font-black uppercase">{board.subtitle || 'Análisis táctico'}</h2><ol className="mt-6 space-y-4">{(board.actions || []).map((action, index) => <li key={action.id}><b>{index + 1}. {action.title}</b><p className="mt-1 text-sm text-slate-300">{action.description}</p></li>)}</ol></div> : null}
        <div className="min-h-0"><SetPieceDiagramCanvas elements={visibleElements} selectedId="" onSelect={() => {}} onChange={() => {}} players={allPlayers} readOnly fullField verticalPitch rivalSystem={rivalSystem} caudalSystem={caudalSystem} /></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-[240px] text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Fase del juego
          <select value={activeKey} onChange={(event) => { setActiveKey(event.target.value); setDrawOrigin(null); }} className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-950">{TACTICAL_PHASES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setDrawingTool(drawingTool === 'pass' ? '' : 'pass'); setDrawOrigin(null); }} className={`rounded-xl px-3 py-2 text-xs font-black uppercase ${drawingTool === 'pass' ? 'bg-red-500 text-white' : 'bg-white/10 text-white'}`}>Pase</button>
          <button type="button" onClick={() => { setDrawingTool(drawingTool === 'movement' ? '' : 'movement'); setDrawOrigin(null); }} className={`rounded-xl px-3 py-2 text-xs font-black uppercase ${drawingTool === 'movement' ? 'bg-red-500 text-white' : 'bg-white/10 text-white'}`}>Movimiento sin balón</button>
          <button type="button" onClick={() => setCaptureMode('field')} className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black uppercase text-slate-950">Campo completo</button>
          <button type="button" onClick={() => setCaptureMode('with_text')} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black uppercase text-slate-950">Campo + explicación</button>
        </div>
      </div>
      {drawingTool ? <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100">{drawOrigin ? 'Ahora pulsa el destino en un jugador o punto libre del campo.' : 'Pulsa el jugador de origen.'}</p> : null}
      <div className={`grid gap-4 ${panelCollapsed ? 'grid-cols-1' : 'xl:grid-cols-[minmax(230px,1fr)_minmax(0,3fr)]'}`}>
        <ActionsPanel board={board} phaseLabel={phaseLabel} onChange={updateBoard} collapsed={panelCollapsed} onToggle={() => setPanelCollapsed((value) => !value)} />
        <div className="overflow-hidden rounded-3xl bg-[#061d16] p-2 text-white"><SetPieceDiagramCanvas elements={visibleElements} selectedId="" onSelect={() => {}} onChange={updateCanvas} players={allPlayers} fullField verticalPitch rivalSystem={rivalSystem} caudalSystem={caudalSystem} drawingTool={drawingTool} onDirectPoint={directPoint} /></div>
      </div>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <h5 className="text-xs font-black uppercase tracking-[.16em] text-white">Conexiones de {phaseLabel}</h5>
        <div className="mt-3 space-y-2">{(board.connections || []).length ? board.connections.map((connection) => <div key={connection.id} className="grid gap-2 rounded-xl bg-black/20 p-2 md:grid-cols-[90px_1fr_1fr_145px_90px_1fr_44px_90px_80px]">
          <select value={connection.team || 'rival'} onChange={(event) => updateConnection(connection.id, { team: event.target.value })} className="rounded-lg bg-white px-2 text-xs text-slate-950"><option value="rival">Rival</option><option value="caudal">Caudal</option></select>
          <input value={connection.origin || ''} onChange={(event) => updateConnection(connection.id, { origin: event.target.value })} className="rounded-lg bg-white/10 px-2 py-2 text-xs text-white" />
          <input value={connection.destination || ''} onChange={(event) => updateConnection(connection.id, { destination: event.target.value })} className="rounded-lg bg-white/10 px-2 py-2 text-xs text-white" />
          <select value={connection.kind || 'pass'} onChange={(event) => updateConnection(connection.id, { kind: event.target.value, type: event.target.value === 'movement' ? 'Movimiento sin balón' : 'Pase' })} className="rounded-lg bg-white px-2 text-xs text-slate-950"><option value="pass">Pase</option><option value="movement">Movimiento sin balón</option></select>
          <select value={connection.intensity || 'Media'} onChange={(event) => updateConnection(connection.id, { intensity: event.target.value })} className="rounded-lg bg-white px-2 text-xs text-slate-950"><option>Baja</option><option>Media</option><option>Alta</option></select>
          <input value={connection.comment || ''} onChange={(event) => updateConnection(connection.id, { comment: event.target.value })} placeholder="Observación" className="rounded-lg bg-white/10 px-2 py-2 text-xs text-white" />
          <input type="color" value={connection.color || '#ef4444'} onChange={(event) => updateConnection(connection.id, { color: event.target.value })} title="Color" className="h-9 w-11 rounded-lg bg-white/10 p-1" />
          <select value={connection.strokeWidth || 1} onChange={(event) => updateConnection(connection.id, { strokeWidth: Number(event.target.value) })} title="Grosor" className="rounded-lg bg-white px-2 text-xs text-slate-950"><option value=".6">Fino</option><option value="1">Medio</option><option value="1.6">Grueso</option></select>
          <button type="button" onClick={() => removeConnection(connection.id)} className="rounded-lg bg-rose-500/15 px-2 text-xs font-bold text-rose-200">Eliminar</button>
        </div>) : <p className="text-sm text-slate-500">Sin conexiones en esta fase.</p>}</div>
      </section>
      <p className="text-right text-[10px] font-bold uppercase tracking-[.12em] text-emerald-300">Guardado automático por fase</p>
    </div>
  );
}
