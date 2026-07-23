import { useEffect, useMemo, useRef, useState } from 'react';
import SetPieceDiagramCanvas from '../print/SetPieceDiagramCanvas';
import SetPieceDiagramEditor from '../print/SetPieceDiagramEditor';

export const TACTICAL_PHASES = [
  ['build_up', 'Iniciación'],
  ['progression', 'Progresión'],
  ['finishing', 'Finalización'],
  ['offensive_transition', 'Transición ofensiva'],
  ['high_block', 'Bloque alto'],
  ['mid_block', 'Bloque medio'],
  ['low_block', 'Bloque bajo'],
  ['defensive_transition', 'Transición defensiva'],
  ['offensive_set_piece', 'ABP ofensiva'],
  ['defensive_set_piece', 'ABP defensiva'],
];

const baseOptions = {
  build_up: ['Combinativa', 'Directa', 'Salida de 3', 'Pivote entre centrales', 'Laterales altos', 'Saque largo del portero'],
  progression: ['Juego interior', 'Progresión exterior', 'Tercer hombre', 'Pase al espacio', 'Cambio de orientación', 'Juego directo'],
  finishing: ['Centros laterales', 'Centros rasos', 'Segundo palo', 'Disparo exterior', 'Pase atrás', 'Ataque del área'],
  offensive_transition: ['Robo en bloque alto', 'Robo en bloque medio', 'Robo en bloque bajo', 'Ataque rápido', 'Conducción', 'Pase vertical'],
  high_block: ['Orientar fuera', 'Cerrar dentro', 'Hombre a hombre'],
  mid_block: ['Bloque compacto', 'Defensa zonal', 'Saltar a banda'],
  low_block: ['Proteger área', 'Defender centros', 'Cerrar pasillos interiores'],
  defensive_transition: ['Presión tras pérdida', 'Repliegue inmediato', 'Falta táctica'],
  offensive_set_piece: ['Córner', 'Falta lateral', 'Falta frontal', 'Saque de banda'],
  defensive_set_piece: ['Zona', 'Individual', 'Mixta', 'Defensa del rechace'],
};

const catalogKey = 'caudal-tactical-phase-catalog-v1';
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const playerName = (player) => player?.shirt_name || player?.shirtName || player?.shortName || player?.name || '';
const playerElement = (x, y, label, player) => ({ id: makeId(), type: 'player', x, y, label: String(label), player_id: player?.id || '', name: playerName(player) });
const opponentElement = (x, y, label, player) => ({ id: makeId(), type: 'opponent', x, y, label: String(label), player_id: player?.id || '', name: playerName(player) });

const formationCoordinates = (isRival, phaseKey, system = '4-3-3') => {
  const attackingShift = ['build_up', 'progression', 'finishing', 'offensive_transition'].includes(phaseKey) ? -3 : 0;
  const lines = String(system || '4-3-3').match(/\d+/g)?.map(Number).filter((value) => value > 0) || [4, 3, 3];
  const validLines = lines.reduce((sum, value) => sum + value, 0) === 10 ? lines : [4, 3, 3];
  const lineYs = isRival ? [20, 31, 42, 46] : [81, 69 + attackingShift, 58 + attackingShift, 53 + attackingShift];
  const points = [[36, isRival ? 7 : 93]];
  validLines.forEach((count, lineIndex) => {
    const margin = count <= 2 ? 22 : count === 3 ? 16 : 9;
    for (let index = 0; index < count; index += 1) {
      points.push([count === 1 ? 36 : margin + ((72 - margin * 2) * index) / (count - 1), lineYs[lineIndex] ?? lineYs.at(-1)]);
    }
  });
  return points;
};

const buildTemplate = (phaseKey, ownPlayers, rivalPlayers, caudalSystem, rivalSystem) => {
  const ownShape = formationCoordinates(false, phaseKey, caudalSystem);
  const rivalShape = formationCoordinates(true, phaseKey, rivalSystem);
  return [
    ...ownShape.map(([x, y], index) => playerElement(x, y, ownPlayers[index]?.number || index + 1, ownPlayers[index])),
    ...rivalShape.map(([x, y], index) => opponentElement(x, y, rivalPlayers[index]?.number || index + 1, rivalPlayers[index])),
    { id: makeId(), type: 'ball', x: 39, y: ownShape[0][1] - 4 },
  ];
};

const emptyBoard = (key, label) => ({
  id: `phase-${key}`, tipo: key, orden: 0, titulo: label, subtype: '', description: '',
  tags: [], evidences: [], elements: [], zoom: 1, savedCopies: [],
});

function PhasePanel({ board, activeKey, options, onChange, onCatalogChange }) {
  const [newOption, setNewOption] = useState('');
  const [evidence, setEvidence] = useState({ date: '', type: 'Vídeo', description: '' });
  const toggleTag = (tag) => onChange({ ...board, tags: board.tags?.includes(tag) ? board.tags.filter((item) => item !== tag) : [...(board.tags || []), tag] });
  const addOption = () => {
    const label = newOption.trim();
    if (!label) return;
    onCatalogChange([...options, { id: makeId(), label, favorite: false }]);
    setNewOption('');
  };
  const changeOption = (id, fields) => onCatalogChange(options.map((item) => item.id === id ? { ...item, ...fields } : item));
  const removeOption = (item) => {
    const used = board.subtype === item.label || board.tags?.includes(item.label);
    if (used && !window.confirm('Esta opción está usada en la fase. Se conservará el texto histórico, pero dejará de aparecer en el catálogo. ¿Continuar?')) return;
    onCatalogChange(options.filter((option) => option.id !== item.id));
  };
  const moveOption = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= options.length) return;
    const next = [...options];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onCatalogChange(next);
  };
  return (
    <div className="space-y-2">
      <details open className="rounded-xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-slate-300">Configuración</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Tipo
            <select value={board.subtype || ''} onChange={(event) => onChange({ ...board, subtype: event.target.value })} className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-950">
              <option value="">Seleccionar tipo</option>
              {options.map((item) => <option key={item.id} value={item.label}>{item.favorite ? '★ ' : ''}{item.label}</option>)}
            </select>
          </label>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Patrones (Ctrl/Cmd para varios)
            <select multiple value={board.tags || []} onChange={(event) => onChange({ ...board, tags: [...event.target.selectedOptions].map((option) => option.value) })} className="mt-1 h-24 w-full rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-950">
              {options.map((item) => <option key={item.id} value={item.label}>{item.favorite ? '★ ' : ''}{item.label}</option>)}
            </select>
          </label>
          <textarea value={board.description || ''} onChange={(event) => onChange({ ...board, description: event.target.value })} placeholder="Descripción táctica…" rows={4} className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
        </div>
      </details>
      <details className="rounded-xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-slate-300">Catálogo de opciones · {options.length}</summary>
        <div className="mt-3 space-y-2">
          <div className="flex gap-1"><input value={newOption} onChange={(event) => setNewOption(event.target.value)} placeholder="Nueva opción" className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-2 text-xs text-white" /><button type="button" onClick={addOption} className="rounded-lg bg-caudal-electric px-2 text-xs font-black text-slate-950">Añadir</button></div>
          {options.map((item, index) => <div key={item.id} className="flex items-center gap-1">
            <button type="button" title="Favorita" onClick={() => changeOption(item.id, { favorite: !item.favorite })} className={`px-1 ${item.favorite ? 'text-amber-300' : 'text-slate-500'}`}>★</button>
            <input value={item.label} onChange={(event) => changeOption(item.id, { label: event.target.value })} className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-xs text-white" />
            <button type="button" onClick={() => moveOption(index, -1)} className="text-slate-300">↑</button><button type="button" onClick={() => moveOption(index, 1)} className="text-slate-300">↓</button>
            <button type="button" onClick={() => removeOption(item)} className="text-rose-300">×</button>
          </div>)}
        </div>
      </details>
      <details className="rounded-xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-slate-300">Evidencias · {(board.evidences || []).length}</summary>
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2"><input type="date" value={evidence.date} onChange={(event) => setEvidence({ ...evidence, date: event.target.value })} className="rounded-lg bg-white px-2 py-2 text-xs text-slate-950" /><select value={evidence.type} onChange={(event) => setEvidence({ ...evidence, type: event.target.value })} className="rounded-lg bg-white px-2 py-2 text-xs text-slate-950"><option>Vídeo</option><option>Partido</option><option>Nota</option><option>Imagen</option></select></div>
          <textarea value={evidence.description} onChange={(event) => setEvidence({ ...evidence, description: event.target.value })} rows={2} placeholder="Descripción" className="w-full rounded-lg bg-white/10 px-2 py-2 text-xs text-white" />
          <button type="button" onClick={() => { if (!evidence.description.trim()) return; onChange({ ...board, evidences: [...(board.evidences || []), { ...evidence, id: makeId() }] }); setEvidence({ date: '', type: 'Vídeo', description: '' }); }} className="w-full rounded-lg bg-white/10 py-2 text-xs font-black text-white">Añadir evidencia</button>
          {(board.evidences || []).map((item) => <div key={item.id} className="flex justify-between gap-2 rounded-lg bg-white/5 p-2 text-xs text-slate-300"><span><b>{item.type}</b> {item.date}<br />{item.description}</span><button type="button" onClick={() => onChange({ ...board, evidences: board.evidences.filter((entry) => entry.id !== item.id) })} className="text-rose-300">×</button></div>)}
        </div>
      </details>
    </div>
  );
}

export default function TacticalPhaseEditor({ initialBoards = {}, players = [], rivalPlayers = [], opponentKey = '', caudalSystem = '', rivalSystem = '', onSave }) {
  const [activeKey, setActiveKey] = useState(TACTICAL_PHASES[0][0]);
  const [presentationMode, setPresentationMode] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [loadPrompt, setLoadPrompt] = useState(false);
  const hydrateBoards = (source) => Object.fromEntries(TACTICAL_PHASES.map(([key, label]) => {
    const saved = { ...emptyBoard(key, label), ...(source[key] || {}) };
    return { ...saved, elements: saved.elements?.length ? saved.elements : buildTemplate(key, players.slice(0, 11), rivalPlayers.slice(0, 11), caudalSystem, rivalSystem) };
  }));
  const [boards, setBoards] = useState(() => hydrateBoards(initialBoards));
  const [catalog, setCatalog] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(catalogKey) || '{}');
      return Object.fromEntries(TACTICAL_PHASES.map(([key]) => [key, saved[key] || baseOptions[key].map((label) => ({ id: makeId(), label, favorite: false }))]));
    } catch { return Object.fromEntries(TACTICAL_PHASES.map(([key]) => [key, baseOptions[key].map((label) => ({ id: makeId(), label, favorite: false }))])); }
  });
  const [copySource, setCopySource] = useState(TACTICAL_PHASES[0][0]);
  const [copyParts, setCopyParts] = useState({ players: true, drawings: true, texts: true, config: false });
  const initializedRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const activeLabel = TACTICAL_PHASES.find(([key]) => key === activeKey)?.[1] || '';
  const board = boards[activeKey] || emptyBoard(activeKey, activeLabel);
  const allPlayers = useMemo(() => [...players, ...rivalPlayers], [players, rivalPlayers]);
  const ownEleven = useMemo(() => players.slice(0, 11), [players]);
  const rivalEleven = useMemo(() => rivalPlayers.slice(0, 11), [rivalPlayers]);

  useEffect(() => { setBoards(hydrateBoards(initialBoards)); initializedRef.current = false; }, [opponentKey]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { window.localStorage.setItem(catalogKey, JSON.stringify(catalog)); }, [catalog]);
  useEffect(() => {
    if (!initializedRef.current) { initializedRef.current = true; return undefined; }
    const timeoutId = window.setTimeout(() => onSaveRef.current?.(boards), 650);
    return () => window.clearTimeout(timeoutId);
  }, [boards]);

  const updateBoard = (nextBoard) => setBoards((current) => ({ ...current, [activeKey]: nextBoard }));
  const load22 = (createCopy = false) => {
    updateBoard({ ...board, savedCopies: createCopy ? [...(board.savedCopies || []), { id: makeId(), createdAt: new Date().toISOString(), elements: clone(board.elements || []) }] : board.savedCopies, elements: buildTemplate(activeKey, ownEleven, rivalEleven, caudalSystem, rivalSystem) });
    setLoadPrompt(false);
  };
  const copyPhase = () => {
    const source = boards[copySource] || {};
    const sourceElements = source.elements || [];
    const selected = sourceElements.filter((element) => {
      if (['player', 'opponent', 'ball'].includes(element.type)) return copyParts.players;
      if (['text', 'text_box'].includes(element.type)) return copyParts.texts;
      return copyParts.drawings;
    }).map((element) => ({ ...clone(element), id: makeId() }));
    updateBoard({
      ...board,
      elements: selected,
      ...(copyParts.config ? { subtype: source.subtype || '', tags: clone(source.tags || []), description: source.description || '', evidences: clone(source.evidences || []) } : {}),
    });
  };

  if (presentationMode) return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-[#04110d] p-4">
      <button type="button" onClick={() => setPresentationMode(false)} className="fixed right-5 top-5 z-10 rounded-xl bg-white/10 px-4 py-2 text-xs font-black uppercase text-white">Salir</button>
      <div className="mx-auto flex aspect-video max-h-[calc(100vh-2rem)] max-w-[calc((100vh-2rem)*1.777)] flex-col items-center overflow-hidden bg-[#071a14] p-5 shadow-2xl">
        <h2 className="text-2xl font-black uppercase tracking-[0.16em] text-white">{activeLabel}</h2>
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-emerald-200">{board.subtype || board.tags?.join(' · ') || 'Análisis táctico'}</p>
        <div className="min-h-0 flex-1"><SetPieceDiagramCanvas elements={board.elements || []} selectedId="" onSelect={() => {}} onChange={() => {}} players={allPlayers} readOnly fullField verticalPitch rivalSystem={rivalSystem} caudalSystem={caudalSystem} /></div>
      </div>
    </div>
  );

  const phasePanel = <PhasePanel board={board} activeKey={activeKey} options={catalog[activeKey] || []} onChange={updateBoard} onCatalogChange={(next) => setCatalog((current) => ({ ...current, [activeKey]: next }))} />;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">{TACTICAL_PHASES.map(([key, label]) => <button key={key} type="button" onClick={() => setActiveKey(key)} className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] ${activeKey === key ? 'border-caudal-electric bg-caudal-electric text-slate-950' : 'border-white/10 bg-white/5 text-slate-300'}`}>{label}</button>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Campo táctico · editor por fases</p><h4 className="text-xl font-black text-white">{activeLabel}</h4></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => board.elements?.length ? setLoadPrompt(true) : load22()} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black uppercase text-white">Cargar 22</button>
          <select value={copySource} onChange={(event) => setCopySource(event.target.value)} className="rounded-xl bg-white px-2 py-2 text-xs font-black text-slate-950">{TACTICAL_PHASES.filter(([key]) => key !== activeKey).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <details className="relative"><summary className="cursor-pointer list-none rounded-xl bg-white/10 px-3 py-2 text-xs font-black uppercase text-white">Copiar fase</summary><div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-white/10 bg-slate-950 p-3 shadow-xl">{Object.entries(copyParts).map(([key, value]) => <label key={key} className="flex gap-2 py-1 text-xs text-white"><input type="checkbox" checked={value} onChange={(event) => setCopyParts((current) => ({ ...current, [key]: event.target.checked }))} />{{ players: 'Jugadores', drawings: 'Dibujos', texts: 'Textos', config: 'Configuración' }[key]}</label>)}<button type="button" onClick={copyPhase} className="mt-2 w-full rounded-lg bg-caudal-electric py-2 text-xs font-black text-slate-950">Copiar ahora</button></div></details>
          <button type="button" onClick={() => setPresentationMode(true)} className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black uppercase text-slate-950">Presentación</button>
        </div>
      </div>
      {loadPrompt ? <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-white"><p className="font-bold">Esta fase ya contiene trabajo. ¿Cómo quieres cargar la alineación?</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setLoadPrompt(false)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold">Cancelar</button><button type="button" onClick={() => load22(false)} className="rounded-lg bg-rose-400 px-3 py-2 text-xs font-black text-slate-950">Reemplazar</button><button type="button" onClick={() => load22(true)} className="rounded-lg bg-caudal-electric px-3 py-2 text-xs font-black text-slate-950">Crear copia y reemplazar</button></div></div> : null}
      <SetPieceDiagramEditor diagram={board} players={allPlayers} onChange={updateBoard} verticalPitch rivalSystem={rivalSystem} caudalSystem={caudalSystem} hideQuickConsignas sidePanelTop={phasePanel} panelCollapsed={panelCollapsed} onTogglePanel={() => setPanelCollapsed((value) => !value)} initialZoom={board.zoom || 1} onZoomChange={(zoom) => updateBoard({ ...board, zoom })} />
      <p className="text-right text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">Guardado automático e independiente por fase</p>
    </div>
  );
}
