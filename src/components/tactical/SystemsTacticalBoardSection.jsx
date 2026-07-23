import TacticalPhaseEditor from './TacticalPhaseEditor';

const fieldLayerControls = [
  ['names', 'Nombres'],
  ['zones', 'Zonas'],
  ['badges', 'Alertas'],
  ['rival', 'Rival'],
  ['caudal', 'Caudal'],
  ['connections', 'Conexiones'],
];

export default function SystemsTacticalBoardSection({
  fieldView,
  onToggleFieldLayer,
  initialBoards,
  players,
  rivalPlayers,
  caudalSystem,
  rivalSystem,
  opponentKey,
  onSave,
  children,
}) {
  return (
    <section className="order-4 border border-white/10 bg-[#091428]/82 p-3 xl:col-span-2 xl:col-start-1">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">Campo táctico</p>
          <h4 className="mt-1 text-2xl font-black text-white">Pizarra de partido</h4>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {fieldLayerControls.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onToggleFieldLayer(key)}
              className={`border px-2.5 py-1.5 text-[10px] font-black uppercase ${fieldView.layers[key] ? 'border-caudal-electric/25 bg-caudal-electric/10 text-caudal-electric' : 'border-white/10 bg-white/[0.035] text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <TacticalPhaseEditor
        initialBoards={initialBoards}
        players={players}
        rivalPlayers={rivalPlayers}
        caudalSystem={caudalSystem}
        rivalSystem={rivalSystem}
        opponentKey={opponentKey}
        onSave={onSave}
      />
      {children}
    </section>
  );
}
