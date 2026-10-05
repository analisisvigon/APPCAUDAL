import { useState } from 'react';
import { TRAINING_BOARD_TOOL_GROUPS } from '../../utils/trainingTaskBoardElements';

const participantLabels = {
  'team-1': '1',
  'team-2': '2',
  'team-3': '3',
  neutral: 'C',
  goalkeeper: 'P',
  coach: 'DT',
};

function ToolIcon({ tool }) {
  if (participantLabels[tool]) return <span className="text-[10px] font-black">{participantLabels[tool]}</span>;

  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (tool === 'ball') return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" {...common} /><path d="m12 8 3 2-1 3h-4l-1-3 3-2Zm-3 2-4-1m5 4-2 5m6-5 2 5m-1-8 4-1" {...common} /></svg>;
  if (tool === 'cone') return <svg viewBox="0 0 24 24"><path d="m12 5-5 13h10L12 5ZM5 19h14" {...common} /></svg>;
  if (tool === 'pole') return <svg viewBox="0 0 24 24"><path d="M4 12h16M5 9v6m14-6v6" {...common} /></svg>;
  if (tool === 'mannequin') return <svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="2" {...common} /><path d="M8 11c2-2 6-2 8 0l-1 6H9l-1-6Zm-2 8h12" {...common} /></svg>;
  if (tool === 'hoop') return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" {...common} /></svg>;
  if (tool === 'goal' || tool === 'mini_goal') {
    const path = tool === 'goal'
      ? 'M4 18V7h16v11M4 7l4 4h8l4-4M8 11v7m8-7v7'
      : 'M6 18V10h12v8m-12-8 3 3h6l3-3';
    return <svg viewBox="0 0 24 24"><path d={path} {...common} /></svg>;
  }
  if (tool === 'zone') return <svg viewBox="0 0 24 24"><rect x="5" y="6" width="14" height="12" rx="1" fill="currentColor" opacity=".2" /><rect x="5" y="6" width="14" height="12" rx="1" {...common} /></svg>;
  if (tool === 'text') return <svg viewBox="0 0 24 24"><path d="M6 6h12M12 6v13m-4 0h8" {...common} /></svg>;

  const dashed = tool === 'dashed_arrow' || tool === 'dashed_line';
  const arrow = !['line', 'dashed_line'].includes(tool);
  const curved = tool === 'curved_arrow';
  return <svg viewBox="0 0 24 24"><path d={curved ? 'M5 18Q8 6 18 8' : 'M4 17 19 7'} strokeDasharray={dashed ? '3 3' : undefined} {...common} />{arrow ? <path d="m14 6 5 1-1 5" {...common} /> : null}</svg>;
}

export default function TrainingTaskBoardToolbar({ onAdd }) {
  const [activeGroup, setActiveGroup] = useState('participants');
  const group = TRAINING_BOARD_TOOL_GROUPS.find((entry) => entry.key === activeGroup);
  return <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#071526]" aria-label="Herramientas de entrenamiento">
    <div className="flex overflow-x-auto border-b border-white/[0.07] p-1.5">
      {TRAINING_BOARD_TOOL_GROUPS.map((entry) => <button key={entry.key} type="button" aria-pressed={activeGroup === entry.key} onClick={() => setActiveGroup(entry.key)} className={`min-h-10 shrink-0 rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.12em] ${activeGroup === entry.key ? 'bg-caudal-electric text-slate-950' : 'text-slate-400 hover:bg-white/[0.06]'}`}>{entry.label}</button>)}
    </div>
    <div className="flex gap-1.5 overflow-x-auto p-2">
      {group.tools.map(([tool, label]) => <button key={tool} type="button" onClick={() => onAdd(tool)} className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-white/[0.055] px-3 text-[11px] font-bold text-slate-200 hover:bg-caudal-electric/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/20 p-1.5 text-caudal-electric [&>svg]:h-full [&>svg]:w-full" aria-hidden="true"><ToolIcon tool={tool} /></span>{label}</button>)}
    </div>
  </section>;
}
