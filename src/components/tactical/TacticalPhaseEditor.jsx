import { useEffect, useMemo, useRef, useState } from 'react';
import SetPieceDiagramCanvas from '../print/SetPieceDiagramCanvas';
import SetPieceDiagramEditor from '../print/SetPieceDiagramEditor';

export const TACTICAL_PHASES = [
  ['build_up', 'Fase de iniciación'],
  ['progression', 'Fase de progresión'],
  ['finishing', 'Fase de finalización'],
  ['offensive_transition', 'Transición ofensiva'],
  ['high_block', 'Bloque alto'],
  ['mid_block', 'Bloque medio'],
  ['low_block', 'Bloque bajo'],
  ['defensive_transition', 'Transición defensiva'],
  ['offensive_set_piece', 'ABP ofensiva'],
  ['defensive_set_piece', 'ABP defensiva'],
];

const phaseOptions = {
  build_up: ['Juego combinativo', 'Juego directo'],
  progression: ['Combinativa', 'Directa'],
  finishing: ['Centros laterales', 'Centros rasos', 'Centros al segundo palo', 'Juego interior', 'Disparo exterior', 'Balón largo al punta', 'Pase al espacio', 'Llegadas de segunda línea'],
  offensive_transition: ['Tras robo en bloque alto', 'Tras robo en bloque bajo'],
  high_block: ['Orientar fuera', 'Cerrar dentro', 'Hombre a hombre'],
  mid_block: ['Bloque compacto', 'Defensa zonal', 'Saltar a banda'],
  low_block: ['Proteger área', 'Defender centros', 'Cerrar pasillos interiores'],
  defensive_transition: ['Presión tras pérdida', 'Repliegue inmediato', 'Falta táctica'],
  offensive_set_piece: ['Córner', 'Falta lateral', 'Falta frontal', 'Saque de banda'],
  defensive_set_piece: ['Zona', 'Individual', 'Mixta', 'Defensa del rechace'],
};

const makeId = () => crypto.randomUUID();
const playerElement = (x, y, label, player = null) => ({ id: makeId(), type: 'player', x, y, label: String(label), player_id: player?.id || '', name: player?.name || '' });
const opponentElement = (x, y, label, player = null) => ({ id: makeId(), type: 'opponent', x, y, label: String(label), player_id: player?.id || '', name: player?.name || '' });

const buildTemplate = (phaseKey, ownPlayers, rivalPlayers) => {
  const ownShape = phaseKey.includes('block')
    ? [[18, 36], [35, 9], [35, 27], [35, 45], [35, 63], [50, 16], [50, 36], [50, 56], [64, 12], [64, 36], [64, 60]]
    : [[7, 36], [20, 9], [20, 27], [20, 45], [20, 63], [36, 16], [36, 36], [36, 56], [51, 12], [51, 36], [51, 60]];
  const rivalShape = [[93, 36], [80, 9], [80, 27], [80, 45], [80, 63], [65, 16], [65, 36], [65, 56], [50, 12], [50, 36], [50, 60]];
  return [
    ...ownShape.map(([x, y], index) => playerElement(x, y, ownPlayers[index]?.number || index + 1, ownPlayers[index])),
    ...rivalShape.map(([x, y], index) => opponentElement(x, y, rivalPlayers[index]?.number || index + 1, rivalPlayers[index])),
    { id: makeId(), type: 'ball', x: ownShape[0][0] + 5, y: ownShape[0][1] },
  ];
};

const emptyBoard = (key, label) => ({
  id: `phase-${key}`,
  tipo: key,
  orden: 0,
  titulo: label,
  subtype: '',
  description: '',
  tags: [],
  elements: [],
});

export default function TacticalPhaseEditor({ initialBoards = {}, players = [], rivalPlayers = [], opponentKey = '', onSave }) {
  const [activeKey, setActiveKey] = useState(TACTICAL_PHASES[0][0]);
  const [presentationMode, setPresentationMode] = useState(false);
  const [boards, setBoards] = useState(() => Object.fromEntries(TACTICAL_PHASES.map(([key, label]) => [key, { ...emptyBoard(key, label), ...(initialBoards[key] || {}) }])));
  const initializedRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const activeLabel = TACTICAL_PHASES.find(([key]) => key === activeKey)?.[1] || '';
  const board = boards[activeKey] || emptyBoard(activeKey, activeLabel);

  useEffect(() => {
    setBoards(Object.fromEntries(TACTICAL_PHASES.map(([key, label]) => [key, { ...emptyBoard(key, label), ...(initialBoards[key] || {}) }])));
    initializedRef.current = false;
  }, [opponentKey]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return undefined;
    }
    const timeoutId = window.setTimeout(() => onSaveRef.current?.(boards), 650);
    return () => window.clearTimeout(timeoutId);
  }, [boards]);

  const updateBoard = (nextBoard) => setBoards((current) => ({ ...current, [activeKey]: nextBoard }));
  const toggleTag = (tag) => updateBoard({ ...board, tags: board.tags?.includes(tag) ? board.tags.filter((item) => item !== tag) : [...(board.tags || []), tag] });
  const templatePlayers = useMemo(() => players.slice(0, 11), [players]);
  const templateRivals = useMemo(() => rivalPlayers.slice(0, 11), [rivalPlayers]);
  const allPlayers = useMemo(() => [...players, ...rivalPlayers], [players, rivalPlayers]);
  const [copySource, setCopySource] = useState(TACTICAL_PHASES[0][0]);

  if (presentationMode) {
    return (
      <div className="fixed inset-0 z-[100] overflow-auto bg-[#061512] p-5 sm:p-8">
        <button type="button" onClick={() => setPresentationMode(false)} className="fixed right-5 top-5 z-10 rounded-xl bg-white/10 px-4 py-2 text-xs font-black uppercase text-white print:hidden">Salir</button>
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 text-center">
            <h2 className="text-3xl font-black uppercase tracking-[0.16em] text-white">{activeLabel}</h2>
            <p className="mt-2 text-lg font-bold uppercase tracking-[0.18em] text-emerald-200">{board.subtype || board.tags?.join(' · ') || 'Análisis táctico'}</p>
          </div>
          <div className="overflow-hidden rounded-[2rem] bg-white p-4 text-black shadow-2xl">
            <SetPieceDiagramCanvas elements={board.elements || []} selectedId="" onSelect={() => {}} onChange={() => {}} players={allPlayers} readOnly fullField />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {TACTICAL_PHASES.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setActiveKey(key)} className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] ${activeKey === key ? 'border-caudal-electric bg-caudal-electric text-slate-950' : 'border-white/10 bg-white/5 text-slate-300'}`}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Editor por fases</p><h4 className="mt-1 text-2xl font-black text-white">{activeLabel}</h4></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => updateBoard({ ...board, elements: buildTemplate(activeKey, templatePlayers, templateRivals) })} className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black uppercase text-white">Cargar 22</button>
          <select value={copySource} onChange={(event) => setCopySource(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950" title="Fase que se quiere copiar">
            {TACTICAL_PHASES.filter(([key]) => key !== activeKey).map(([key, label]) => <option key={key} value={key}>Copiar: {label}</option>)}
          </select>
          <button type="button" onClick={() => updateBoard({ ...board, elements: JSON.parse(JSON.stringify(boards[copySource]?.elements || [])).map((element) => ({ ...element, id: makeId() })) })} className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black uppercase text-white">Duplicar fase</button>
          <button type="button" onClick={() => setPresentationMode(true)} className="rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black uppercase text-slate-950">Modo presentación</button>
        </div>
      </div>
      <details className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-slate-300">Configuración y evidencias de fase</summary>
        <div className="mt-3">
        <div className="flex flex-wrap gap-2">
          {(phaseOptions[activeKey] || []).map((option) => <button key={option} type="button" onClick={() => activeKey === 'finishing' ? toggleTag(option) : updateBoard({ ...board, subtype: option })} className={`rounded-xl border px-3 py-2 text-xs font-bold ${(board.subtype === option || board.tags?.includes(option)) ? 'border-caudal-electric bg-caudal-electric/15 text-caudal-electric' : 'border-white/10 bg-white/5 text-slate-300'}`}>{option}</button>)}
        </div>
        <textarea value={board.description || ''} onChange={(event) => updateBoard({ ...board, description: event.target.value })} placeholder="Descripción táctica de esta fase…" rows={2} className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
        </div>
      </details>
      <SetPieceDiagramEditor diagram={board} players={allPlayers} onChange={updateBoard} />
      <p className="text-right text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">Guardado automático por fase</p>
    </div>
  );
}
