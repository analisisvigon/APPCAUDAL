import { useEffect, useMemo, useRef, useState } from 'react';
import { getPlayerDisplayName } from '../../utils/playerDisplayName';
import {
  getSetPieceDimensionRange,
  normalizeSetPieceDimensionValue,
  normalizeSetPieceElementDimensions,
} from '../../utils/setPieceElementDimensions';
import { getSetPieceHistoryAction } from '../../utils/setPieceEditorInteractions';
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
      const action = getSetPieceHistoryAction(event);
      if (!action) return;
      event.preventDefault();
      if (action === 'redo') redo();
      else undo();
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
    const normalizedCopy = normalizeSetPieceElementDimensions(copy);
    updateElements([...drawableElements, normalizedCopy]);
    setSelectedId(normalizedCopy.id);
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

  const selectedWidthRange = selectedElement ? getSetPieceDimensionRange(selectedElement, 'width') : null;
  const selectedHeightRange = selectedElement ? getSetPieceDimensionRange(selectedElement, 'height') : null;

  return (
    <div className="space-y-3">
      <SetPieceDiagramToolbar onAdd={addElement} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,0.65fr)] xl:items-start">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/5 bg-white/[0.035] p-2 text-xs font-bold text-white">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="hidden px-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500 sm:inline">Edición</span>
              <button
                type="button"
                title="Vuelve al paso anterior"
                onClick={undo}
                disabled={historyIndex <= 0}
                className="min-h-9 rounded-xl bg-white/10 px-3 py-2 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Deshacer
              </button>
              <button
                type="button"
                title="Recupera el paso deshecho"
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                className="min-h-9 rounded-xl bg-white/10 px-3 py-2 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Rehacer
              </button>
              <button
                type="button"
                aria-pressed={snapEnabled}
                title="Ayuda a colocar elementos en líneas o posiciones cercanas"
                onClick={() => setSnapEnabled((value) => !value)}
                className={`min-h-9 rounded-xl px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 ${snapEnabled ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-white hover:bg-white/15'}`}
              >
                Imán
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex min-h-9 items-center rounded-xl bg-black/20">
                <button
                  type="button"
                  aria-label="Reducir zoom"
                  title="Reducir zoom"
                  disabled={zoom <= 0.75}
                  onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.1).toFixed(1))))}
                  className="h-9 min-w-9 rounded-l-xl px-2 text-base transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  −
                </button>
                <span className="min-w-12 px-1 text-center text-[11px] text-slate-300" aria-live="polite">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  aria-label="Aumentar zoom"
                  title="Aumentar zoom"
                  disabled={zoom >= 1.6}
                  onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(1))))}
                  className="h-9 min-w-9 rounded-r-xl px-2 text-base transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <details className="group relative">
                <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-xl bg-white/10 px-3 py-2 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 [&::-webkit-details-marker]:hidden">
                  Más acciones
                </summary>
                <div className="absolute right-0 top-[calc(100%+0.4rem)] z-30 grid w-56 gap-1.5 rounded-2xl border border-white/10 bg-[#0b1629] p-2 shadow-2xl">
                  <button
                    type="button"
                    onClick={addMovementSequence}
                    className="rounded-xl bg-white/10 px-3 py-2 text-left transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                  >
                    Añadir secuencia 1-2-3
                  </button>
                </div>
              </details>
            </div>
          </div>

          <div className="overflow-auto rounded-3xl border-2 border-white/15 bg-white p-2 text-black shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
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

        <aside className="space-y-4 rounded-3xl border border-white/5 bg-white/[0.045] p-4 xl:sticky xl:top-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">Panel de propiedades</p>
            <p className="mt-1 text-xs text-slate-500">Configura la jugada y el elemento seleccionado.</p>
          </div>

          <section className="space-y-2 border-t border-white/5 pt-4">
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Jugada</span>
              <input
                value={diagram.titulo || ''}
                onChange={(event) => updateDiagram({ titulo: event.target.value })}
                placeholder="Título de la jugada"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
              />
            </label>
          </section>

          <section className="space-y-3 border-t border-white/5 pt-4">
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Consigna</span>
              <textarea
                value={diagram.consigna || ''}
                onChange={(event) => updateDiagram({ consigna: event.target.value })}
                placeholder="Máximo recomendado: 3 líneas"
                rows={3}
                className="min-h-[84px] w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
              />
            </label>
            <details className="rounded-2xl bg-black/15">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-bold text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 [&::-webkit-details-marker]:hidden">
                Añadir consigna rápida
              </summary>
              <div className="flex flex-wrap gap-2 border-t border-white/5 p-3">
                {[...new Set([...favoriteConsignas, ...quickConsignas])].map((phrase) => (
                  <div key={phrase} className="inline-flex overflow-hidden rounded-xl bg-white/10">
                    <button
                      type="button"
                      onClick={() => appendQuickConsigna(phrase)}
                      className="px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                    >
                      {favoriteConsignas.includes(phrase) ? '★ ' : ''}{phrase}
                    </button>
                    <button
                      type="button"
                      aria-label={`${favoriteConsignas.includes(phrase) ? 'Quitar de' : 'Añadir a'} favoritas: ${phrase}`}
                      aria-pressed={favoriteConsignas.includes(phrase)}
                      onClick={() => toggleFavoriteConsigna(phrase)}
                      className="border-l border-white/10 px-2 py-2 text-xs font-black text-slate-400 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                      title="Marcar como favorita"
                    >
                      ★
                    </button>
                  </div>
                ))}
              </div>
            </details>
          </section>

          {selectedElement ? (
            <section className="space-y-3 border-t border-white/5 pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">Elemento seleccionado</p>
                <span className="rounded-lg bg-caudal-electric/10 px-2 py-1 text-[9px] font-black uppercase text-caudal-electric">{selectedElement.type.replaceAll('_', ' ')}</span>
              </div>
              {['player', 'opponent', 'zone', 'text'].includes(selectedElement.type) ? (
                <label className="block space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Etiqueta</span>
                  <input
                    value={selectedElement.label || ''}
                    onChange={(event) => updateSelected({ label: event.target.value })}
                    placeholder="Etiqueta"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                  />
                </label>
              ) : null}
              {isTextBox(selectedElement) ? (
                <label className="block space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Texto</span>
                  <textarea
                    value={selectedElement.label || ''}
                    onChange={(event) => updateSelected({ label: event.target.value })}
                    placeholder="Texto"
                    className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                  />
                </label>
              ) : null}
              {selectedElement.type === 'player' ? (
                <label className="block space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Jugador vinculado</span>
                  <select
                    value={selectedElement.player_id || ''}
                    onChange={(event) => {
                      const player = players.find((item) => item.id === event.target.value);
                      updateSelected({
                        player_id: event.target.value,
                        label: player?.number ? String(player.number) : selectedElement.label,
                        name: player ? '' : selectedElement.name || '',
                      });
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                  >
                    <option value="">Sin jugador vinculado</option>
                    {players.map((player) => <option key={player.id} value={player.id}>{player.number || '-'} · {getPlayerDisplayName(player)}</option>)}
                  </select>
                </label>
              ) : null}
              {['player', 'opponent'].includes(selectedElement.type) ? (
                <div className="space-y-3">
                  <label className="block space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Consigna del jugador</span>
                    <textarea
                      value={selectedElement.note || ''}
                      onChange={(event) => updateSelected({ note: event.target.value })}
                      placeholder="Consigna del jugador"
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                    />
                  </label>
                  <details className="rounded-2xl bg-black/15">
                    <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-bold text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 [&::-webkit-details-marker]:hidden">
                      Añadir consigna al jugador
                    </summary>
                    <div className="flex flex-wrap gap-2 border-t border-white/5 p-3">
                      {[...new Set([...favoriteConsignas, ...quickConsignas])].map((phrase) => (
                        <button
                          key={`${selectedElement.id}-${phrase}`}
                          type="button"
                          onClick={() => {
                            const current = String(selectedElement.note || '').trim();
                            updateSelected({ note: current ? `${current}. ${phrase}` : phrase });
                          }}
                          className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                        >
                          {phrase}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              ) : null}
              {isArrow(selectedElement) ? (
                <label className="block space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Tipo de trayectoria</span>
                  <select
                    value={selectedElement.type}
                    onChange={(event) => updateSelected({ type: event.target.value, dashed: event.target.value === 'dashed_arrow' })}
                    className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                  >
                    <option value="arrow">Continua</option>
                    <option value="dashed_arrow">Discontinua</option>
                    <option value="curved_arrow">Curva</option>
                    <option value="double_arrow">Doble</option>
                  </select>
                </label>
              ) : null}
              {selectedWidthRange || selectedHeightRange ? (
                <div className={`grid gap-3 ${selectedWidthRange && selectedHeightRange ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {selectedWidthRange ? (
                    <label className="space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Ancho</span>
                      <input
                        type="number"
                        min={selectedWidthRange.min}
                        max={selectedWidthRange.max}
                        step="1"
                        value={selectedElement.width ?? selectedWidthRange.defaultValue}
                        onChange={(event) => updateSelected({
                          width: normalizeSetPieceDimensionValue(
                            selectedElement,
                            'width',
                            event.target.value,
                            selectedElement.width
                          ),
                        })}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                      />
                    </label>
                  ) : null}
                  {selectedHeightRange ? (
                    <label className="space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Alto</span>
                      <input
                        type="number"
                        min={selectedHeightRange.min}
                        max={selectedHeightRange.max}
                        step="1"
                        value={selectedElement.height ?? selectedHeightRange.defaultValue}
                        onChange={(event) => updateSelected({
                          height: normalizeSetPieceDimensionValue(
                            selectedElement,
                            'height',
                            event.target.value,
                            selectedElement.height
                          ),
                        })}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                aria-pressed={Boolean(selectedElement.locked)}
                onClick={() => updateSelected({ locked: !selectedElement.locked })}
                className={`w-full rounded-2xl px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 ${selectedElement.locked ? 'bg-amber-300 text-slate-950' : 'bg-white/10 text-white hover:bg-white/15'}`}
              >
                {selectedElement.locked ? 'Desbloquear elemento' : 'Bloquear elemento'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={duplicateSelected}
                  className="rounded-2xl bg-white/10 px-3 py-3 text-xs font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  aria-label="Eliminar elemento"
                  onClick={deleteSelected}
                  className="min-h-11 rounded-2xl bg-red-500/15 px-3 py-3 text-xs font-bold text-red-100 transition hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
                >
                  Eliminar elemento
                </button>
              </div>
            </section>
          ) : (
            <section className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-lg text-slate-500" aria-hidden="true">◇</span>
              <p className="mt-3 text-sm font-bold text-slate-300">Ningún elemento seleccionado</p>
              <p className="mt-1 max-w-64 text-xs leading-5 text-slate-500">Selecciona un jugador, flecha, texto o zona para editar sus propiedades.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
