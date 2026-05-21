import { useEffect, useMemo, useRef, useState } from 'react';
import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import SetPieceDiagramToolbar from './SetPieceDiagramToolbar';

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isArrow = (element) => ['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow'].includes(element?.type);
const isTextBox = (element) => ['text_box', 'block'].includes(element?.type);
const cloneElements = (elements) => JSON.parse(JSON.stringify(elements || []));
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

const quickConsignasStorageKey = 'caudal-print-quick-consignas-v2';

const createElement = (type) => {
  if (type === 'ball') return { id: createId(), type, x: 8, y: 8 };
  if (isArrow({ type })) return { id: createId(), type, x1: 20, y1: 46, x2: 44, y2: 26, dashed: type === 'dashed_arrow' };
  if (type === 'zone') return { id: createId(), type, x: 34, y: 18, width: 22, height: 12, label: 'Zona' };
  if (type === 'text') return { id: createId(), type, x: 42, y: 40, label: 'Texto' };
  if (type === 'block') return { id: createId(), type, x: 42, y: 34, width: 18, height: 8, label: 'BLOQUEO' };
  if (type === 'text_box') return { id: createId(), type, x: 58, y: 10, width: 32, height: 24, label: 'TEXTO' };
  if (type === 'opponent') return { id: createId(), type, x: 50, y: 17, label: 'R' };
  return { id: createId(), type: 'player', x: 50, y: 35, label: '1', player_id: '' };
};

export default function SetPieceDiagramEditor({ diagram, players = [], onChange }) {
  const drawableElements = useMemo(
    () => (Array.isArray(diagram.elements) ? diagram.elements : []).filter((element) => element.type !== 'player_note'),
    [diagram.elements]
  );
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState([cloneElements(drawableElements)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [movementMode, setMovementMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [favoriteConsignas, setFavoriteConsignas] = useState(() => {
    if (typeof window === 'undefined') return ['Atacar primer palo', 'Vigilancia', 'Segunda jugada'];
    try {
      return JSON.parse(window.localStorage.getItem(quickConsignasStorageKey) || '[]').slice(0, 8);
    } catch {
      return ['Atacar primer palo', 'Vigilancia', 'Segunda jugada'];
    }
  });
  const historyChangeRef = useRef(false);

  const selectedElement = useMemo(
    () => drawableElements.find((element) => element.id === selectedId) || null,
    [drawableElements, selectedId]
  );

  const updateDiagram = (fields) => onChange({ ...diagram, ...fields });
  const appendQuickConsigna = (phrase) => {
    const current = String(diagram.consigna || '').trim();
    const next = current ? `${current}.\n${phrase}` : phrase;
    updateDiagram({ consigna: next });
  };

  const toggleFavoriteConsigna = (phrase) => {
    setFavoriteConsignas((current) => {
      const next = current.includes(phrase)
        ? current.filter((item) => item !== phrase)
        : [phrase, ...current].slice(0, 8);
      if (typeof window !== 'undefined') window.localStorage.setItem(quickConsignasStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const pushHistory = (elements) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(cloneElements(elements));
    const trimmed = nextHistory.slice(-50);
    setHistory(trimmed);
    setHistoryIndex(trimmed.length - 1);
  };

  const updateElements = (elements, options = {}) => {
    updateDiagram({ elements });
    if (!options.skipHistory) pushHistory(elements);
  };

  useEffect(() => {
    if (historyChangeRef.current) {
      historyChangeRef.current = false;
      return;
    }
    setHistory([cloneElements(drawableElements)]);
    setHistoryIndex(0);
    setSelectedId('');
  }, [diagram.id, diagram.tipo, diagram.orden]);

  const updateSelected = (fields) => {
    if (!selectedElement) return;
    updateElements(drawableElements.map((element) => (element.id === selectedElement.id ? { ...element, ...fields } : element)));
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    historyChangeRef.current = true;
    setHistoryIndex(nextIndex);
    updateElements(cloneElements(history[nextIndex]), { skipHistory: true });
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    historyChangeRef.current = true;
    setHistoryIndex(nextIndex);
    updateElements(cloneElements(history[nextIndex]), { skipHistory: true });
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (key === 'z') {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const addElement = (type) => {
    const element = createElement(type);
    updateElements([...drawableElements, element]);
    setSelectedId(element.id);
  };

  const deleteSelected = () => {
    if (!selectedElement) return;
    updateElements(drawableElements.filter((element) => element.id !== selectedElement.id));
    setSelectedId('');
  };

  const duplicateSelected = () => {
    if (!selectedElement) return;
    const copy = { ...cloneElements([selectedElement])[0], id: createId() };
    if (isArrow(copy)) {
      copy.x1 = Math.min(100, (copy.x1 || 0) + 4);
      copy.y1 = Math.min(72, (copy.y1 || 0) + 4);
      copy.x2 = Math.min(100, (copy.x2 || 0) + 4);
      copy.y2 = Math.min(72, (copy.y2 || 0) + 4);
    } else {
      copy.x = Math.min(100, (copy.x || 0) + 4);
      copy.y = Math.min(72, (copy.y || 0) + 4);
    }
    updateElements([...drawableElements, copy]);
    setSelectedId(copy.id);
  };

  const addMovementSequence = () => {
    const sequence = [
      { id: createId(), type: 'text', x: 24, y: 18, label: '1' },
      { id: createId(), type: 'arrow', x1: 28, y1: 20, x2: 42, y2: 24 },
      { id: createId(), type: 'text', x: 46, y: 26, label: '2' },
      { id: createId(), type: 'arrow', x1: 50, y1: 28, x2: 60, y2: 36, dashed: true },
      { id: createId(), type: 'text', x: 64, y: 38, label: '3' },
    ];
    updateElements([...drawableElements, ...sequence]);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.7fr)]">
        <div className="space-y-3">
          <SetPieceDiagramToolbar onAdd={addElement} onDelete={deleteSelected} selectedElement={selectedElement} />
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/5 p-3 text-xs font-bold text-white">
            <button type="button" title="Vuelve al paso anterior" onClick={undo} disabled={historyIndex <= 0} className="rounded-xl bg-white/10 px-3 py-2 disabled:opacity-40">Deshacer</button>
            <button type="button" title="Recupera el paso deshecho" onClick={redo} disabled={historyIndex >= history.length - 1} className="rounded-xl bg-white/10 px-3 py-2 disabled:opacity-40">Rehacer</button>
            <button type="button" onClick={duplicateSelected} disabled={!selectedElement} className="rounded-xl bg-white/10 px-3 py-2 disabled:opacity-40">Duplicar elemento</button>
            <button type="button" title="Ayuda a colocar elementos en líneas o posiciones cercanas" onClick={() => setSnapEnabled((value) => !value)} className={`rounded-xl px-3 py-2 ${snapEnabled ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-white'}`}>Alinear / Imán</button>
            <button type="button" title="Modo para construir secuencias simples de movimiento" onClick={() => setMovementMode((value) => !value)} className={`rounded-xl px-3 py-2 ${movementMode ? 'bg-emerald-300 text-slate-950' : 'bg-white/10 text-white'}`}>Modo movimiento</button>
            <button type="button" onClick={addMovementSequence} className="rounded-xl bg-white/10 px-3 py-2">Secuencia 1-2-3</button>
            <button type="button" onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.1).toFixed(1))))} className="rounded-xl bg-white/10 px-3 py-2">-</button>
            <span className="px-1 text-slate-300">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(1))))} className="rounded-xl bg-white/10 px-3 py-2">+</button>
          </div>
          <div className="overflow-auto rounded-3xl bg-white p-3 text-black">
            <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
              <SetPieceDiagramCanvas
                elements={drawableElements}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChange={updateElements}
                players={players}
                snap={snapEnabled}
                fullField={String(diagram.tipo || '').includes('saque_inicio')}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl bg-white/5 p-4">
          <input
            value={diagram.titulo || ''}
            onChange={(event) => updateDiagram({ titulo: event.target.value })}
            placeholder="Titulo de la jugada"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
          />
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Consigna rápida</span>
              <textarea
                value={diagram.consigna || ''}
                onChange={(event) => updateDiagram({ consigna: event.target.value })}
                placeholder="Máximo recomendado: 3 líneas"
                rows={3}
                className="min-h-[84px] w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {[...new Set([...favoriteConsignas, ...quickConsignas])].map((phrase) => (
                <div key={phrase} className="inline-flex overflow-hidden rounded-xl bg-white/10">
                  <button
                    type="button"
                    onClick={() => appendQuickConsigna(phrase)}
                    className="px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/15"
                  >
                    {favoriteConsignas.includes(phrase) ? '★ ' : ''}{phrase}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavoriteConsigna(phrase)}
                    className="border-l border-white/10 px-2 py-2 text-xs font-black text-slate-400 hover:text-amber-200"
                    title="Marcar como favorita"
                  >
                    ★
                  </button>
                </div>
              ))}
            </div>
          </div>

          {selectedElement ? (
            <div className="space-y-3 rounded-2xl bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">Elemento seleccionado</p>
              {['player', 'opponent', 'zone', 'text'].includes(selectedElement.type) ? (
                <input
                  value={selectedElement.label || ''}
                  onChange={(event) => updateSelected({ label: event.target.value })}
                  placeholder="Etiqueta"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                />
              ) : null}
              {isTextBox(selectedElement) ? (
                <textarea
                  value={selectedElement.label || ''}
                  onChange={(event) => updateSelected({ label: event.target.value })}
                  placeholder="Texto"
                  className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                />
              ) : null}
              {selectedElement.type === 'player' ? (
                <select
                  value={selectedElement.player_id || ''}
                  onChange={(event) => {
                    const player = players.find((item) => item.id === event.target.value);
                    updateSelected({
                      player_id: event.target.value,
                      label: player?.number ? String(player.number) : selectedElement.label,
                      name: player?.shirt_name || player?.shirtName || player?.shortName || player?.name || selectedElement.name || '',
                    });
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950"
                >
                  <option value="">Vincular jugador</option>
                  {players.map((player) => <option key={player.id} value={player.id}>{player.number || '-'} · {player.name}</option>)}
                </select>
              ) : null}
              {['player', 'opponent'].includes(selectedElement.type) ? (
                <div className="space-y-3">
                  <textarea
                    value={selectedElement.note || ''}
                    onChange={(event) => updateSelected({ note: event.target.value })}
                    placeholder="Consigna del jugador"
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[...new Set([...favoriteConsignas, ...quickConsignas])].map((phrase) => (
                      <button
                        key={`${selectedElement.id}-${phrase}`}
                        type="button"
                        onClick={() => {
                          const current = String(selectedElement.note || '').trim();
                          updateSelected({ note: current ? `${current}. ${phrase}` : phrase });
                        }}
                        className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/15"
                      >
                        {phrase}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {isArrow(selectedElement) ? (
                <select
                  value={selectedElement.type}
                  onChange={(event) => updateSelected({ type: event.target.value, dashed: event.target.value === 'dashed_arrow' })}
                  className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950"
                >
                  <option value="arrow">Continua</option>
                  <option value="dashed_arrow">Discontinua</option>
                  <option value="curved_arrow">Curva</option>
                  <option value="double_arrow">Doble</option>
                </select>
              ) : null}
              {['zone', 'block', 'text_box'].includes(selectedElement.type) ? (
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" value={selectedElement.width || 18} onChange={(event) => updateSelected({ width: Number(event.target.value) })} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                  <input type="number" value={selectedElement.height || 10} onChange={(event) => updateSelected({ height: Number(event.target.value) })} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => updateSelected({ locked: !selectedElement.locked })}
                className={`w-full rounded-2xl px-4 py-3 text-sm font-bold ${selectedElement.locked ? 'bg-amber-300 text-slate-950' : 'bg-white/10 text-white'}`}
              >
                {selectedElement.locked ? 'Desbloquear elemento' : 'Bloquear elemento'}
              </button>
            </div>
          ) : (
            <p className="rounded-2xl bg-black/20 p-4 text-sm text-slate-400">Selecciona un elemento del campo para editarlo.</p>
          )}
        </div>
      </div>
    </div>
  );
}
