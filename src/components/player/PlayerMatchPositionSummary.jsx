import React from 'react';
import { getTacticalPositionAbbreviation } from '../../utils/playerPositionUsage';
import { buildMatchPositionSummary, formatPositionSegmentRange } from '../../utils/playerPositionTimelinePresentation';

const PlayerMatchPositionSummary = ({ matchUsage, initialOpen = false }) => {
  const summary = buildMatchPositionSummary(matchUsage);
  if (!summary.visualSegmentCount) return <span className="text-slate-500">—</span>;
  if (!summary.hasDetails) {
    return (
      <div className="min-w-0 py-1" data-player-match-position-compact>
        <span className="block text-[11px] font-black text-slate-100">{summary.label}</span>
        <span className="mt-0.5 block text-[9px] font-bold text-slate-500">{summary.systemLabel}</span>
      </div>
    );
  }
  return (
    <details className="group min-w-0 py-1" open={initialOpen || undefined}>
      <summary className="min-h-9 cursor-pointer list-none select-none py-0.5 [&::-webkit-details-marker]:hidden">
        <span className="block text-[11px] font-black text-slate-100">{summary.label}</span>
        <span className="mt-0.5 block text-[9px] font-bold text-slate-500">{summary.systemLabel}</span>
        <span className="mt-1 block text-[9px] font-bold text-caudal-electric/80">Ver detalle <span className="group-open:hidden">▾</span><span className="hidden group-open:inline">▴</span></span>
      </summary>
      <div className="mt-1.5 space-y-1 border-t border-white/[0.07] pt-1.5" data-player-match-position-details>
        {summary.segments.map((segment, index) => (
          <p key={`${matchUsage?.matchId || 'match'}-${segment.fromMinute}-${segment.toMinute}-${index}`} className="whitespace-nowrap text-[9px] leading-4 text-slate-400">
            <strong className="font-black text-slate-300">{formatPositionSegmentRange(segment)}</strong> · {segment.identified ? getTacticalPositionAbbreviation(segment.position) : '—'} · {segment.system || 'Sistema —'}
          </p>
        ))}
      </div>
    </details>
  );
};

export default PlayerMatchPositionSummary;
