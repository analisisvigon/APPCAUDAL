import { forwardRef } from 'react';
import {
  DIAGRAM_PITCH_TYPES,
  normalizeDiagramPitchType,
} from '../../utils/diagramScene';

export function DiagramPitch({ pitchType = DIAGRAM_PITCH_TYPES.PENALTY_AREA }) {
  const normalizedPitchType = normalizeDiagramPitchType(pitchType);
  if (normalizedPitchType === DIAGRAM_PITCH_TYPES.FULL) {
    return (
      <>
        <rect x="1" y="1" width="98" height="70" fill="white" stroke="currentColor" strokeWidth="0.8" />
        <line x1="50" y1="1" x2="50" y2="71" stroke="currentColor" strokeWidth="0.55" />
        <circle cx="50" cy="36" r="9" fill="none" stroke="currentColor" strokeWidth="0.55" />
        <rect x="1" y="18" width="18" height="36" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x="1" y="27" width="7" height="18" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x="81" y="18" width="18" height="36" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x="92" y="27" width="7" height="18" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x="0.5" y="31" width="2.5" height="10" fill="none" stroke="currentColor" strokeWidth="0.75" />
        <rect x="97" y="31" width="2.5" height="10" fill="none" stroke="currentColor" strokeWidth="0.75" />
      </>
    );
  }
  return (
    <>
      <rect x="1" y="1" width="98" height="70" fill="white" stroke="currentColor" strokeWidth="0.8" />
      <rect x="22" y="1" width="56" height="21" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <rect x="36" y="1" width="28" height="9" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <rect x="42" y="1" width="16" height="2.5" fill="none" stroke="currentColor" strokeWidth="0.9" />
      <path d="M38 22 Q50 30 62 22" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <path d="M1 1 Q7 7 1 13" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <path d="M99 1 Q93 7 99 13" fill="none" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

const DiagramCanvasSurface = forwardRef(function DiagramCanvasSurface({
  pitchType,
  children,
  ariaLabel = 'Diagrama tactico',
  className = '',
  renderMode = 'default',
  overflow,
  ...svgProps
}, ref) {
  return (
    <svg
      ref={ref}
      className={className}
      data-render-mode={renderMode}
      data-pitch-type={normalizeDiagramPitchType(pitchType)}
      viewBox="0 0 100 72"
      overflow={overflow}
      role="img"
      aria-label={ariaLabel}
      {...svgProps}
    >
      <DiagramPitch pitchType={pitchType} />
      {children}
    </svg>
  );
});

export default DiagramCanvasSurface;

