const essentialActions = [
  ['player', 'Jugador'], ['opponent', 'Rival'], ['ball', 'Balón'], ['arrow', 'Flecha'],
  ['pass', 'Pase'], ['long_pass', 'Pase largo'], ['carry', 'Conducción'], ['zone', 'Zona'], ['text', 'Texto'],
];

const moreActions = [
  ['press', 'Presión'], ['cover', 'Cobertura'], ['watch', 'Vigilancia'],
  ['dashed_arrow', 'Línea discontinua'], ['curved_arrow', 'Flecha curva'], ['double_arrow', 'Flecha doble'],
  ['rectangle', 'Rectángulo'], ['circle', 'Círculo'], ['oval', 'Óvalo'],
  ['number', 'Numeración'], ['icon', 'Icono'], ['block', 'Bloqueo'],
];

const icons = {
  player: '●', opponent: '○', ball: '⚽', arrow: '→', pass: '↗', long_pass: '⇢', carry: '〰',
  press: 'P', cover: 'C', watch: 'V', dashed_arrow: '┄', curved_arrow: '↝', double_arrow: '↔',
  zone: '▧', rectangle: '□', circle: '◯', oval: '⬭', text: 'T', number: '1', icon: '!', block: '×',
};

const ToolButton = ({ action, onAdd }) => {
  const [type, label] = action;
  return <button type="button" onClick={() => onAdd(type)} title={label} aria-label={label} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-black text-slate-100 transition hover:bg-caudal-electric hover:text-slate-950">{icons[type] || '·'}</button>;
};

export default function SetPieceDiagramToolbar({ onAdd, onDelete, selectedElement }) {
  return (
    <div className="flex max-w-full items-center gap-1.5 rounded-2xl border border-white/10 bg-[#071225]/95 p-2 shadow-xl">
      <div className="flex min-w-0 gap-1.5 overflow-x-auto">{essentialActions.map((action) => <ToolButton key={action[0]} action={action} onAdd={onAdd} />)}</div>
      <details className="relative shrink-0">
        <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg bg-white/10 px-3 text-[10px] font-black uppercase text-slate-100">Más herramientas</summary>
        <div className="absolute right-0 top-11 z-40 grid w-48 grid-cols-4 gap-1.5 rounded-xl border border-white/10 bg-slate-950 p-2 shadow-2xl">{moreActions.map((action) => <ToolButton key={action[0]} action={action} onAdd={onAdd} />)}</div>
      </details>
      <button type="button" onClick={onDelete} disabled={!selectedElement} title="Borrar elemento" aria-label="Borrar elemento" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-sm font-black text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40">⌫</button>
    </div>
  );
}
