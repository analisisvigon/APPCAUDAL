import { useState } from 'react';
import {
  TRAINING_BOARD_TOOL_GROUPS,
  TRAINING_CONDITIONAL_MATERIAL_CATEGORIES,
  TRAINING_CONDITIONAL_MATERIALS,
} from '../../utils/trainingTaskBoardElements';
import TrainingTaskConditionalMaterialGraphic from './TrainingTaskConditionalMaterialGraphic';

const participantLabels = {
  'team-1': '1',
  'team-2': '2',
  'team-3': '3',
  neutral: 'C',
  goalkeeper: 'P',
  coach: 'DT',
};

const participantColors = {
  'team-1': '#2563eb',
  'team-2': '#dc2626',
  'team-3': '#facc15',
  neutral: '#16a34a',
  goalkeeper: '#f97316',
  coach: '#111827',
};

function ToolIcon({ tool }) {
  if (participantLabels[tool]) return <span className={`flex h-5 w-5 items-center justify-center rounded-full border border-white/80 text-[8px] font-black ${['team-3', 'goalkeeper'].includes(tool) ? 'text-slate-950' : 'text-white'} ${tool === 'goalkeeper' ? 'ring-1 ring-white/65 ring-offset-1 ring-offset-[#071526]' : ''}`} style={{ backgroundColor: participantColors[tool] }}>{participantLabels[tool]}</span>;

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

export default function TrainingTaskBoardToolbar({ activeTool = 'select', onToolChange }) {
  const [conditionalOpen, setConditionalOpen] = useState(false);
  const [category, setCategory] = useState(TRAINING_CONDITIONAL_MATERIAL_CATEGORIES[0]);
  const toolClass = (active) => `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg outline-none transition ${active ? 'bg-caudal-electric text-slate-950 shadow-[0_0_0_2px_rgba(56,189,248,.2)]' : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'} focus-visible:ring-2 focus-visible:ring-caudal-electric`;
  const chooseTool = (tool) => {
    setConditionalOpen(false);
    onToolChange(tool);
  };
  const activeConditional = activeTool.startsWith('conditional:');
  const filteredMaterials = TRAINING_CONDITIONAL_MATERIALS.filter((material) => material.category === category);
  return <div className="min-w-0">
    <section className="flex max-w-full items-stretch gap-1 overflow-x-auto rounded-xl bg-[#071526]/95 p-1.5 shadow-lg shadow-black/20" aria-label="Herramientas de entrenamiento">
      <button type="button" title="Seleccionar (Escape)" aria-label="Seleccionar" aria-pressed={activeTool === 'select'} onClick={() => chooseTool('select')} className={toolClass(activeTool === 'select')}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="m6 4 12 8-6 1-3 6L6 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
      </button>
      {TRAINING_BOARD_TOOL_GROUPS.map((group) => <div key={group.key} className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-1" aria-label={group.label}>
        <span className="hidden px-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-600 2xl:block">{group.label}</span>
        {group.tools.map(([tool, label]) => <button key={tool} type="button" title={label} aria-label={label} aria-pressed={activeTool === tool} onClick={() => chooseTool(tool)} className={toolClass(activeTool === tool)}><span className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full" aria-hidden="true"><ToolIcon tool={tool} /></span></button>)}
      </div>)}
      <button type="button" title="Material de preparación física" aria-label="CONDICIONAL"
        aria-expanded={conditionalOpen} aria-controls="training-conditional-materials"
        aria-pressed={conditionalOpen || activeConditional}
        onClick={() => setConditionalOpen((open) => !open)}
        className={`${toolClass(conditionalOpen || activeConditional)} w-auto gap-1.5 px-2.5`}>
        <span className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full" aria-hidden="true">
          <TrainingTaskConditionalMaterialGraphic materialKey="kettlebell" color="currentColor" />
        </span>
        <span className="text-[9px] font-black tracking-wide">CONDICIONAL</span>
      </button>
    </section>
    {conditionalOpen ? <div id="training-conditional-materials" role="dialog" aria-label="Material condicional"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          chooseTool('select');
        }
      }}
      className="mt-2 grid max-h-72 gap-2 overflow-y-auto rounded-xl border border-white/10 bg-[#071526]/95 p-2.5 shadow-lg shadow-black/30 sm:grid-cols-[minmax(7rem,auto)_1fr]">
      <div className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible" aria-label="Categorías de material">
        {TRAINING_CONDITIONAL_MATERIAL_CATEGORIES.map((entry) => <button key={entry} type="button"
          aria-pressed={category === entry} onClick={() => setCategory(entry)}
          className={`min-h-8 shrink-0 rounded-lg px-2 text-left text-[9px] font-black tracking-wide ${category === entry ? 'bg-caudal-electric/15 text-caudal-electric' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
          {entry}
        </button>)}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4" aria-label={`Materiales de ${category.toLocaleLowerCase('es')}`}>
        {filteredMaterials.map((material) => {
          const tool = `conditional:${material.id}`;
          return <button key={material.id} type="button" title={`Añadir ${material.name}`}
            aria-label={`Añadir ${material.name}`} aria-pressed={activeTool === tool}
            onClick={() => chooseTool(tool)}
            className={`flex min-h-10 items-center gap-2 rounded-lg border px-2 text-left text-[10px] font-bold ${activeTool === tool ? 'border-caudal-electric/50 bg-caudal-electric/10 text-caudal-electric' : 'border-white/5 text-slate-200 hover:bg-white/[0.06]'}`}>
            <TrainingTaskConditionalMaterialGraphic materialKey={material.id} color="currentColor" className="h-6 w-6 shrink-0" />
            <span>{material.name}</span>
          </button>;
        })}
      </div>
    </div> : null}
  </div>;
}
