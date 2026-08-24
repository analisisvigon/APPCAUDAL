export const buildTacticalCapturePresentation = ({
  phaseLabel = '',
  situationLabel = '',
  selectedPlay = null,
} = {}) => {
  return {
    phase: String(phaseLabel || '').trim(),
    situation: String(situationLabel || '').trim(),
    description: String(selectedPlay?.description || '').trim(),
  };
};
