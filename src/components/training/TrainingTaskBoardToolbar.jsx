import { useState } from 'react';
import { TRAINING_BOARD_TOOL_GROUPS } from '../../utils/trainingTaskBoardElements';

const icons = {
  'team-1': 'E1', 'team-2': 'E2', 'team-3': 'E3', neutral: 'C', goalkeeper: 'P', coach: 'DT',
  ball: '●', cone: '△', pole: '│', mannequin: '♙', hoop: '○', goal: '▱', mini_goal: '⌑',
  arrow: '↗', curved_arrow: '⤴', dashed_arrow: '⇢', line: '╱', dashed_line: '┄', zone: '▭', text: 'T',
};

export default function TrainingTaskBoardToolbar({ onAdd }) {
  const [activeGroup, setActiveGroup] = useState('participants');
  const group = TRAINING_BOARD_TOOL_GROUPS.find((entry) => entry.key === activeGroup);
  return <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#071526]" aria-label="Herramientas de entrenamiento">
    <div className="flex overflow-x-auto border-b border-white/[0.07] p-1.5">
      {TRAINING_BOARD_TOOL_GROUPS.map((entry) => <button key={entry.key} type="button" aria-pressed={activeGroup === entry.key} onClick={() => setActiveGroup(entry.key)} className={`min-h-10 shrink-0 rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.12em] ${activeGroup === entry.key ? 'bg-caudal-electric text-slate-950' : 'text-slate-400 hover:bg-white/[0.06]'}`}>{entry.label}</button>)}
    </div>
    <div className="flex gap-1.5 overflow-x-auto p-2">
      {group.tools.map(([tool, label]) => <button key={tool} type="button" onClick={() => onAdd(tool)} className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-white/[0.055] px-3 text-[11px] font-bold text-slate-200 hover:bg-caudal-electric/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric"><span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-black/20 px-1 font-black text-caudal-electric" aria-hidden="true">{icons[tool]}</span>{label}</button>)}
    </div>
  </section>;
}

