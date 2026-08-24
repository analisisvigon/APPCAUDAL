export const buildTacticalCapturePresentation = ({
  phaseLabel = '',
  situationLabel = '',
  playStyleLabel = '',
  selectedPlay = null,
} = {}) => {
  return {
    phase: String(phaseLabel || '').trim(),
    situation: String(situationLabel || '').trim(),
    playStyle: String(playStyleLabel || '').trim(),
    description: String(selectedPlay?.description || '').trim(),
  };
};
