export default function SetPieceDiagramToolbar({ onAdd, onDelete, selectedElement }) {
  const actions = [
    ['player', 'Jugador'],
    ['opponent', 'Rival'],
    ['ball', 'Balón'],
    ['arrow', 'Flecha'],
    ['pass', 'Pase'],
    ['long_pass', 'Pase largo'],
    ['carry', 'Conducción'],
    ['press', 'Presión'],
    ['cover', 'Cobertura'],
    ['watch', 'Vigilancia'],
    ['dashed_arrow', 'Línea discontinua'],
    ['curved_arrow', 'Flecha curva'],
    ['double_arrow', 'Flecha doble'],
    ['zone', 'Zona'],
    ['rectangle', 'Rectángulo'],
    ['circle', 'Círculo'],
    ['oval', 'Óvalo'],
    ['text', 'Texto'],
    ['number', 'Numeración'],
    ['icon', 'Icono'],
    ['block', 'Bloqueo'],
  ];
  const icons = {
    player: '●', opponent: '○', ball: '⚽', arrow: '→', pass: '↗', long_pass: '⇢', carry: '〰',
    press: 'P', cover: 'C', watch: 'V', dashed_arrow: '┄', curved_arrow: '↝', double_arrow: '↔',
    zone: '▧', rectangle: '□', circle: '◯', oval: '⬭', text: 'T', number: '1', icon: '!', block: '×',
  };

  return (
    <div className="flex max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-[#071225]/95 p-2 shadow-xl">
      {actions.map(([type, label]) => (
        <button
          key={type}
          type="button"
          onClick={() => onAdd(type)}
          title={label}
          aria-label={label}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-black text-slate-100 transition hover:bg-caudal-electric hover:text-slate-950"
        >
          {icons[type] || '·'}
        </button>
      ))}
      <button
        type="button"
        onClick={onDelete}
        disabled={!selectedElement}
        title="Borrar elemento"
        aria-label="Borrar elemento"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-sm font-black text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ⌫
      </button>
    </div>
  );
}
