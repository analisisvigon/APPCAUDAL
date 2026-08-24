export const buildTacticalCapturePresentation = ({
  phaseLabel = '',
  situationLabel = '',
  plays = [],
  selectedPlay = null,
} = {}) => {
  const normalizedPlays = Array.isArray(plays) ? plays : [];
  const selectedPlayIndex = selectedPlay?.id
    ? normalizedPlays.findIndex((play) => play?.id === selectedPlay.id)
    : -1;

  return {
    phase: String(phaseLabel || '').trim(),
    situation: String(situationLabel || '').trim(),
    description: String(selectedPlay?.description || '').trim(),
    playLabel: normalizedPlays.length > 1 && selectedPlayIndex >= 0
      ? `Jugada ${selectedPlayIndex + 1}`
      : '',
  };
};
