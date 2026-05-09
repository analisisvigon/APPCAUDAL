export default function SetPieceDiagramToolbar({ onAdd, onDelete, selectedElement }) {
  const actions = [
    ['player', 'Jugador'],
    ['opponent', 'Rival'],
    ['ball', 'Balón'],
    ['arrow', 'Flecha'],
    ['dashed_arrow', 'Línea discontinua'],
    ['zone', 'Zona'],
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(([type, label]) => (
        <button
          key={type}
          type="button"
          onClick={() => onAdd(type)}
          className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/15"
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={onDelete}
        disabled={!selectedElement}
        className="rounded-2xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Borrar
      </button>
    </div>
  );
}
