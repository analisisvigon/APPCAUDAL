import { createPortal } from 'react-dom';
import { PlannedSessionPrintPages } from './PlannedSessionPrint';

export function PlannedSessionBatchPrintPages({ sessions, selected, leagueLogoUrl, pitchAppearance = 'green' }) {
  return sessions.map((session) => <PlannedSessionPrintPages key={session.id}
      editor={session.editor} selected={selected} pitchAppearance={pitchAppearance}
      roster={session.roster} availability={session.availability}
      distribution={session.distribution} playerDistribution={session.distribution}
      positionById={session.positionById} leagueLogoUrl={leagueLogoUrl}
      sessionValue={session.sessionValue} fieldDimensions={session.fieldDimensions}
      exerciseDimensions={session.exerciseDimensions} mcNumber={session.mcNumber} />);
}

export default function PlannedSessionBatchPrint({ sessions, selected, leagueLogoUrl, printRef, pitchAppearance = 'green' }) {
  if (!sessions.length || typeof document === 'undefined') return null;
  return createPortal(<div className="planned-print-portal planned-print-batch-portal" ref={printRef}>
    <PlannedSessionBatchPrintPages sessions={sessions} selected={selected} leagueLogoUrl={leagueLogoUrl} pitchAppearance={pitchAppearance} />
  </div>, document.body);
}
