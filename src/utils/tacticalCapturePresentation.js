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

const TACTICAL_CAPTURE_VISUAL_IDENTITIES = {
  defensive: {
    key: 'defensive',
    macroLabel: 'DEFENSA',
    accessibleLabel: 'Fase defensiva',
  },
  offensive: {
    key: 'offensive',
    macroLabel: 'ATAQUE',
    accessibleLabel: 'Fase ofensiva',
  },
  transitionDefenseAttack: {
    key: 'transition-defense-attack',
    macroLabel: 'TRANSICIÓN',
    directionLabel: 'DEF → ATQ',
    accessibleLabel: 'Transición defensa a ataque',
  },
  transitionAttackDefense: {
    key: 'transition-attack-defense',
    macroLabel: 'TRANSICIÓN',
    directionLabel: 'ATQ → DEF',
    accessibleLabel: 'Transición ataque a defensa',
  },
};

export const getTacticalCaptureVisualIdentity = ({ phase = '', transitionType = '' } = {}) => {
  if (phase === 'defensive') return TACTICAL_CAPTURE_VISUAL_IDENTITIES.defensive;
  if (phase === 'offensive') return TACTICAL_CAPTURE_VISUAL_IDENTITIES.offensive;
  if (phase === 'transition' && transitionType === 'defensive_transition') {
    return TACTICAL_CAPTURE_VISUAL_IDENTITIES.transitionAttackDefense;
  }
  if (phase === 'transition') return TACTICAL_CAPTURE_VISUAL_IDENTITIES.transitionDefenseAttack;
  return {
    key: 'neutral',
    macroLabel: 'FASE DE JUEGO',
    accessibleLabel: 'Fase del juego',
  };
};
