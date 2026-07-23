import { useEffect, useMemo, useRef, useState } from 'react';
import SetPieceDiagramCanvas from '../print/SetPieceDiagramCanvas';

const BOARD_KEY = 'systems_board';
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

const createBaseElements = (players, rivals, caudalSystem, rivalSystem) => [
  ...formationPoints(false, caudalSystem).map(([x, y], index) => createPlayer('player', x, y, players[index], index)),
  ...formationPoints(true, rivalSystem).map(([x, y], index) => createPlayer('opponent', x, y, rivals[index], index)),
  { id: makeId(), type: 'ball', x: 39, y: 89 },
];

const normalizePositions = (elements) => Object.fromEntries(
  elements.filter((element) => ['player', 'opponent'].includes(element.type)).map((element) => [
    element.id,
    { playerId: element.player_id || null, teamSide: element.type === 'opponent' ? 'rival' : 'caudal', x: Number((element.x / 72).toFixed(5)), y: Number((element.y / 100).toFixed(5)) },
  ])
);

const restorePositions = (elements, positions = {}) => elements.map((element) => {
  const saved = positions[element.id] || Object.values(positions).find((position) => position.playerId && position.playerId === element.player_id && position.teamSide === (element.type === 'opponent' ? 'rival' : 'caudal'));
  return saved ? { ...element, x: saved.x * 72, y: saved.y * 100 } : element;
});

const trimArrow = (connection) => {
  const x1 = connection.originX * 72;
  const y1 = connection.originY * 100;
  const x2 = connection.destinationX * 72;
  const y2 = connection.destinationY * 100;
  const distance = Math.hypot(x2 - x1, y2 - y1) || 1;
  const originRadius = 3.8;
  const destinationRadius = connection.destinationPlayerId ? 4.2 : 0;
  return {
    x1: x1 + ((x2 - x1) / distance) * originRadius,
    y1: y1 + ((y2 - y1) / distance) * originRadius,
    x2: x2 - ((x2 - x1) / distance) * destinationRadius,
    y2: y2 - ((y2 - y1) / distance) * destinationRadius,
  };
};

const emptyBoard = (elements) => ({ id: BOARD_KEY, elements, playerPositions: normalizePositions(elements), connections: [] });
const labelFor = (element) => element?.name || element?.label || 'Espacio libre';

export default function TacticalPhaseEditor({ initialBoards = {}, players = [], rivalPlayers = [], opponentKey = '', caudalSystem = '', rivalSystem = '', onSave }) {
  const makeInitialBoard = () => {
    const saved = initialBoards[BOARD_KEY] || initialBoards.build_up || {};
    const elements = saved.elements?.length ? saved.elements.filter((element) => !['arrow', 'dashed_arrow'].includes(element.type)) : createBaseElements(players.slice(0, 11), rivalPlayers.slice(0, 11), caudalSystem, rivalSystem);
    const connections = (saved.connections || []).map((connection) => ({
      ...connection,
      type: connection.type === 'movement' || connection.kind === 'movement' ? 'movement' : 'pass',
      originX: connection.originX ?? (connection.x1 ?? 36) / 72,
      originY: connection.originY ?? (connection.y1 ?? 50) / 100,
      destinationX: connection.destinationX ?? (connection.x2 ?? 36) / 72,
      destinationY: connection.destinationY ?? (connection.y2 ?? 50) / 100,
      originLabel: connection.originLabel || connection.origin || 'Origen',
      destinationLabel: connection.destinationLabel || connection.destination || 'Destino',
      frequency: connection.frequency || connection.intensity || 'Media',
      observation: connection.observation || connection.comment || '',
    }));
    return { ...emptyBoard(elements), ...saved, elements: restorePositions(elements, saved.playerPositions), connections };
  };
  const [board, setBoard] = useState(makeInitialBoard);
  const [tool, setTool] = useState('move');
  const [origin, setOrigin] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState([]);
  const saveRef = useRef(onSave);
  const initializedRef = useRef(false);
  const allPlayers = useMemo(() => [...players, ...rivalPlayers], [players, rivalPlayers]);

  useEffect(() => { saveRef.current = onSave; }, [onSave]);
  useEffect(() => { setBoard(makeInitialBoard()); setHistory([]); setOrigin(null); setSelectedId(''); initializedRef.current = false; }, [opponentKey]);
  useEffect(() => {
    if (!initializedRef.current) { initializedRef.current = true; return undefined; }
    const timeout = window.setTimeout(() => saveRef.current?.({ ...initialBoards, [BOARD_KEY]: board }), 500);
    return () => window.clearTimeout(timeout);
  }, [board]);
  useEffect(() => {
    const cancel = (event) => { if (event.key === 'Escape') { setOrigin(null); setSelectedId(''); } };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);

  const snapshot = () => setHistory((current) => [...current.slice(-29), clone(board)]);
  const changeTool = (next) => {
    setTool((current) => current === next && ['pass', 'movement', 'delete'].includes(next) ? 'move' : next);
    setOrigin(null);
    setSelectedId('');
  };
  const undo = () => {
    if (!history.length) return;
    setBoard(history.at(-1));
    setHistory((current) => current.slice(0, -1));
    setOrigin(null);
    setSelectedId('');
  };

  const arrows = (board.connections || []).map((connection) => ({
    id: `connection-${connection.id}`, connectionId: connection.id,
    type: connection.type === 'movement' ? 'dashed_arrow' : 'arrow',
    ...trimArrow(connection), color: '#ef4444', strokeWidth: 1,
  }));
  const visibleElements = [...board.elements, ...arrows];
  const selectedConnection = board.connections.find((connection) => `connection-${connection.id}` === selectedId);

  const canvasChange = (nextElements) => {
    const nextPlayers = nextElements.filter((element) => !element.connectionId);
    setBoard((current) => ({ ...current, elements: nextPlayers, playerPositions: normalizePositions(nextPlayers) }));
  };
  const directPoint = ({ element, x, y }) => {
    if (tool === 'delete') {
      if (!element?.connectionId) return;
      snapshot();
      setBoard((current) => ({ ...current, connections: current.connections.filter((connection) => connection.id !== element.connectionId) }));
      setSelectedId('');
      return;
    }
    if (!['pass', 'movement'].includes(tool)) return;
    if (!origin) {
      if (!element || !['player', 'opponent'].includes(element.type)) return;
      setOrigin({ element, x, y });
      setSelectedId(element.id);
      return;
    }
    if (tool === 'pass' && (!element || !['player', 'opponent'].includes(element.type))) return;
    snapshot();
    const connection = {
      id: makeId(), boardId: BOARD_KEY, teamSide: origin.element.type === 'opponent' ? 'rival' : 'caudal',
      type: tool, originPlayerId: origin.element.player_id || origin.element.id,
      destinationPlayerId: element?.player_id || (element ? element.id : null),
      originX: origin.x / 72, originY: origin.y / 100, destinationX: x / 72, destinationY: y / 100,
      originLabel: labelFor(origin.element), destinationLabel: labelFor(element),
      frequency: 'Media', observation: '', createdAt: new Date().toISOString(),
    };
    setBoard((current) => ({ ...current, connections: [...current.connections, connection] }));
    setOrigin(null);
    setSelectedId('');
  };
  const removeConnection = (id) => {
    snapshot();
    setBoard((current) => ({ ...current, connections: current.connections.filter((connection) => connection.id !== id) }));
    setSelectedId('');
  };
  const updateConnection = (id, fields) => setBoard((current) => ({ ...current, connections: current.connections.map((connection) => connection.id === id ? { ...connection, ...fields } : connection) }));
  const selectFromCanvas = (id) => {
    if (tool === 'select') setSelectedId(id);
  };

  const tools = [['move', 'MOVER'], ['pass', 'PASE'], ['movement', 'MOVIMIENTO'], ['select', 'SELECCIONAR'], ['delete', 'BORRAR']];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#071225]/90 p-2">
        {tools.map(([key, label]) => <button key={key} type="button" onClick={() => changeTool(key)} className={`min-h-11 rounded-xl px-4 py-2 text-xs font-black ${tool === key ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-white'}`}>{label}</button>)}
        <button type="button" onClick={undo} disabled={!history.length} className="min-h-11 rounded-xl bg-white/10 px-4 py-2 text-xs font-black text-white disabled:opacity-35">DESHACER</button>
        {origin ? <button type="button" onClick={() => { setOrigin(null); setSelectedId(''); }} className="min-h-11 rounded-xl bg-rose-500/15 px-4 py-2 text-xs font-black text-rose-100">CANCELAR</button> : null}
      </div>
      {origin ? <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100">{tool === 'pass' ? 'Selecciona el jugador de destino' : 'Selecciona el punto final del movimiento'}</p> : null}
      {selectedConnection && tool === 'select' ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
        <span className="px-2 text-xs font-black text-white">{selectedConnection.originLabel} → {selectedConnection.destinationLabel}</span>
        <button type="button" onClick={() => updateConnection(selectedConnection.id, { type: 'pass' })} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white">Cambiar a pase</button>
        <button type="button" onClick={() => updateConnection(selectedConnection.id, { type: 'movement' })} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white">Cambiar a movimiento</button>
        <button type="button" onClick={() => removeConnection(selectedConnection.id)} className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-100">Eliminar</button>
      </div> : null}
      <div className={`overflow-hidden rounded-3xl bg-[#061d16] p-2 text-white ${tool === 'move' ? '[&_.diagram-draggable]:cursor-move' : ''}`}>
        <SetPieceDiagramCanvas
          elements={visibleElements}
          selectedId={selectedId}
          onSelect={selectFromCanvas}
          onChange={canvasChange}
          onBeforeChange={(element) => { if (tool === 'move' && ['player', 'opponent'].includes(element.type)) snapshot(); }}
          players={allPlayers}
          fullField
          verticalPitch
          rivalSystem={rivalSystem}
          caudalSystem={caudalSystem}
          drawingTool={['pass', 'movement', 'delete'].includes(tool) ? tool : ''}
          onDirectPoint={directPoint}
        />
      </div>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <h5 className="text-xs font-black uppercase tracking-[.16em] text-white">Conexiones tácticas</h5>
        <div className="mt-3 space-y-2">{board.connections.length ? board.connections.map((connection) => <div key={connection.id} className="grid gap-2 rounded-xl bg-black/20 p-2 md:grid-cols-[1fr_1fr_150px_100px_1fr_80px]">
          <input value={connection.originLabel || ''} onChange={(event) => updateConnection(connection.id, { originLabel: event.target.value })} className="rounded-lg bg-white/10 px-2 py-2 text-xs text-white" />
          <input value={connection.destinationLabel || ''} onChange={(event) => updateConnection(connection.id, { destinationLabel: event.target.value })} className="rounded-lg bg-white/10 px-2 py-2 text-xs text-white" />
          <select value={connection.type} onChange={(event) => updateConnection(connection.id, { type: event.target.value })} className="rounded-lg bg-white px-2 text-xs text-slate-950"><option value="pass">Pase</option><option value="movement">Movimiento</option></select>
          <select value={connection.frequency || 'Media'} onChange={(event) => updateConnection(connection.id, { frequency: event.target.value })} className="rounded-lg bg-white px-2 text-xs text-slate-950"><option>Baja</option><option>Media</option><option>Alta</option></select>
          <input value={connection.observation || ''} onChange={(event) => updateConnection(connection.id, { observation: event.target.value })} placeholder="Observación" className="rounded-lg bg-white/10 px-2 py-2 text-xs text-white" />
          <button type="button" onClick={() => removeConnection(connection.id)} className="rounded-lg bg-rose-500/15 px-2 text-xs font-bold text-rose-100">Eliminar</button>
        </div>) : <p className="text-sm text-slate-500">Sin conexiones tácticas.</p>}</div>
      </section>
      <p className="text-right text-[10px] font-bold uppercase tracking-[.12em] text-emerald-300">Posiciones y conexiones guardadas automáticamente en esta pizarra</p>
    </div>
  );
}
