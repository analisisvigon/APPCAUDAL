const toolGroups = [
  {
    label: 'Elementos',
    actions: [
      ['player', 'Jugador'],
      ['opponent', 'Rival'],
      ['ball', 'Balón'],
    ],
  },
  {
    label: 'Dibujo',
    actions: [
      ['arrow', 'Flecha'],
      ['curved_arrow', 'Flecha curva'],
      ['double_arrow', 'Flecha doble'],
      ['dashed_arrow', 'Discontinua'],
      ['block', 'Bloqueo'],
    ],
  },
  {
    label: 'Anotaciones',
    actions: [
      ['zone', 'Zona'],
      ['text', 'Texto'],
    ],
  },
];

export default function SetPieceDiagramToolbar({ onAdd }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-white/5 bg-white/[0.035] p-2 sm:grid-cols-3">
      {toolGroups.map((group) => (
        <div key={group.label} className="min-w-0 rounded-xl bg-black/15 p-2">
          <p className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{group.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {group.actions.map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => onAdd(type)}
                className="min-h-11 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-bold text-slate-200 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
