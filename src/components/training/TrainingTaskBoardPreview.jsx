import { memo } from 'react';
import { readTrainingTaskEditorPayload } from '../../utils/trainingTaskEditorPayload';
import TrainingTaskDiagramCanvas from './TrainingTaskDiagramCanvas';

function Placeholder({ unavailable = false }) {
  return <div className="flex h-44 w-full items-center justify-center bg-[#0a1726]" aria-hidden="true"><div className="text-center text-slate-500"><svg viewBox="0 0 24 24" className="mx-auto h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16M3 12h18M9 9a3 3 0 1 0 0 6" /></svg><p className="mt-2 text-[10px] font-bold">{unavailable ? 'Diseño no disponible' : 'Sin diseño de pizarra'}</p></div></div>;
}

function TrainingTaskBoardPreview({ payload = {}, playerLookup }) {
  const parsed = readTrainingTaskEditorPayload(payload);
  if (parsed.kind === 'empty') return <Placeholder />;
  if (parsed.kind !== 'v1') return <Placeholder unavailable />;
  return <div className="flex h-44 w-full items-center justify-center overflow-hidden bg-[#0b1e16] [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full" aria-hidden="true"><TrainingTaskDiagramCanvas elements={parsed.scene.board.elements} pitchType={parsed.scene.board.pitchType === 'penalty-area' ? 'half' : parsed.scene.board.pitchType} players={playerLookup} readOnly renderMode="preview" /></div>;
}

export default memo(TrainingTaskBoardPreview);
