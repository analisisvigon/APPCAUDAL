import React from 'react';
import { getTacticalPositionAbbreviation } from '../../utils/playerPositionUsage';
import { buildMatchPositionSummary, formatPositionSegmentRange } from '../../utils/playerPositionTimelinePresentation';

const PlayerMatchPositionSummary = ({ matchUsage, initialOpen = false }) => {
  const summary = buildMatchPositionSummary(matchUsage);
  if (!summary.hasDetails) return <span className="text-slate-500">—</span>;
  return (
    <details className="group rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1.5" open={initialOpen || undefined}>
      <summary className="cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
        <span className="block text-[11px] font-black text-slate-100">{summary.label}</span>
        <span className="mt-0.5 block text-[9px] font-bold text-slate-500">{summary.systemLabel} · detalle ▾</span>
      </summary>
      <div className="mt-2 space-y-1.5 border-t border-white/[0.07] pt-2" data-player-match-position-details>
        {summary.segments.map((segment, index) => (
          <div key={`${matchUsage?.matchId || 'match'}-${segment.fromMinute}-${segment.toMinute}-${index}`} className="min-w-[185px] text-[9px] leading-4">
            <p className="font-black text-slate-300">{formatPositionSegmentRange(segment)} · {segment.identified ? getTacticalPositionAbbreviation(segment.position) : 'Posición —'}</p>
            <p className="text-slate-500">{segment.system || 'Sistema —'} · {segment.minutes}'</p>
          </div>
        ))}
      </div>
    </details>
  );
};

export default PlayerMatchPositionSummary;
