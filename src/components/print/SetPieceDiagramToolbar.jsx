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
      ['curved_arrow', 'Curva'],
      ['double_arrow', 'Doble'],
      ['dashed_arrow', 'Discontinua'],
    ],
  },
  {
    label: 'ANOTACIONES',
    actions: [
      ['zone', 'Zona'],
      ['text', 'Texto'],
      ['block', 'Bloqueo'],
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
    <div className="rounded-[26px] border border-white/10 bg-[#08131f]/90 p-2 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Herramientas</p>
        <span className="text-[10px] text-slate-600">Diseño rápido</span>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {toolGroups.map((group) => (
          <div key={group.label} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
            <p className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.actions.map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onAdd(type)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/10 bg-[#0f1b2f] px-2.5 py-2 text-[11px] font-semibold text-slate-200 transition hover:border-caudal-electric/60 hover:bg-[#14233d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
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
