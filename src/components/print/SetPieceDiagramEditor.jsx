import { useMemo, useState } from 'react';
import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import SetPieceDiagramToolbar from './SetPieceDiagramToolbar';

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createElement = (type) => {
  if (type === 'ball') return { id: createId(), type, x: 8, y: 8 };
  if (type === 'arrow' || type === 'dashed_arrow') return { id: createId(), type, x1: 20, y1: 46, x2: 44, y2: 26, dashed: type === 'dashed_arrow' };
  if (type === 'zone') return { id: createId(), type, x: 34, y: 18, width: 22, height: 12, label: 'Zona' };
  if (type === 'opponent') return { id: createId(), type, x: 50, y: 17, label: 'R' };
  return { id: createId(), type: 'player', x: 50, y: 35, label: '1', player_id: '' };
};

export default function SetPieceDiagramEditor({ diagram, players = [], onChange }) {
  const [selectedId, setSelectedId] = useState('');
  const selectedElement = useMemo(
    () => (diagram.elements || []).find((element) => element.id === selectedId) || null,
    [diagram.elements, selectedId]
  );

  const updateDiagram = (fields) => onChange({ ...diagram, ...fields });
  const updateElements = (elements) => updateDiagram({ elements });
  const updateSelected = (fields) => {
    if (!selectedElement) return;
    updateElements((diagram.elements || []).map((element) => (element.id === selectedElement.id ? { ...element, ...fields } : element)));
  };

  const addElement = (type) => {
    const element = createElement(type);
    updateElements([...(diagram.elements || []), element]);
    setSelectedId(element.id);
  };

  const deleteSelected = () => {
    if (!selectedElement) return;
    updateElements((diagram.elements || []).filter((element) => element.id !== selectedElement.id));
    setSelectedId('');
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-3">
        <SetPieceDiagramToolbar onAdd={addElement} onDelete={deleteSelected} selectedElement={selectedElement} />
        <div className="rounded-3xl bg-white p-3 text-black">
          <SetPieceDiagramCanvas
            elements={diagram.elements || []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={updateElements}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-3xl bg-white/5 p-4">
        <input
          value={diagram.titulo || ''}
          onChange={(event) => updateDiagram({ titulo: event.target.value })}
          placeholder="Título de la jugada"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
        />
        <textarea
          value={diagram.consigna || ''}
          onChange={(event) => updateDiagram({ consigna: event.target.value })}
          placeholder="Consigna breve"
          className="min-h-[90px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
        />

        {selectedElement ? (
          <div className="space-y-3 rounded-2xl bg-black/20 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">Elemento seleccionado</p>
            {['player', 'opponent', 'zone'].includes(selectedElement.type) ? (
              <input
                value={selectedElement.label || ''}
                onChange={(event) => updateSelected({ label: event.target.value })}
                placeholder="Etiqueta"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
              />
            ) : null}
            {selectedElement.type === 'player' ? (
              <select
                value={selectedElement.player_id || ''}
                onChange={(event) => {
                  const player = players.find((item) => item.id === event.target.value);
                  updateSelected({ player_id: event.target.value, label: player?.number ? String(player.number) : selectedElement.label });
                }}
                className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950"
              >
                <option value="">Vincular jugador</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.number || '-'} · {player.name}</option>)}
              </select>
            ) : null}
            {selectedElement.type === 'zone' ? (
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={selectedElement.width || 18} onChange={(event) => updateSelected({ width: Number(event.target.value) })} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                <input type="number" value={selectedElement.height || 10} onChange={(event) => updateSelected({ height: Number(event.target.value) })} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-black/20 p-4 text-sm text-slate-400">Selecciona un elemento del campo para editarlo.</p>
        )}
      </div>
    </div>
  );
}
