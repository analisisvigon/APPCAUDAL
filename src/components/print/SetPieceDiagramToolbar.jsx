const toolGroups = [
  {
    label: 'OBJETOS',
    actions: [
      ['player', 'Jugador'],
      ['opponent', 'Rival'],
      ['ball', 'Balón'],
    ],
  },
  {
    label: 'TRAZADO',
    actions: [
      ['arrow', 'Flecha'],
      ['curved_arrow', 'Flecha curva'],
      ['double_arrow', 'Flecha doble'],
      ['dashed_arrow', 'Discontinua'],
      ['block', 'Bloqueo'],
    ],
  },
  {
    label: 'ANOTACIONES',
    actions: [
      ['zone', 'Zona'],
      ['text', 'Texto'],
    ],
  },
];

const actionIcons = {
  player: '◉',
  opponent: '◎',
  ball: '⚪',
  arrow: '↗',
  curved_arrow: '⤴',
  double_arrow: '⇄',
  dashed_arrow: '⤳',
  zone: '▭',
  text: 'T',
  block: '✕',
};

export default function SetPieceDiagramToolbar({ onAdd }) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[22px] bg-[#0a1727]/80 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.16)]" aria-label="Herramientas de dibujo ABP">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 md:grid-cols-[0.8fr_1.45fr_0.7fr]">
        {toolGroups.map((group) => (
          <div key={group.label} className="min-w-0 px-1.5 py-1 md:border-r md:border-white/[0.07] md:last:border-r-0">
            <p className="mb-1.5 px-1 text-[8px] font-black uppercase tracking-[0.22em] text-slate-500">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.actions.map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onAdd(type)}
                  aria-label={`Añadir ${label.toLowerCase()}`}
                  title={`Añadir ${label.toLowerCase()}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/[0.055] px-3 py-2 text-[11px] font-bold text-slate-200 transition hover:bg-caudal-electric/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                >
                  <span className="text-[13px] text-caudal-electric">{actionIcons[type]}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
