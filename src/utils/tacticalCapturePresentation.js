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

const TACTICAL_CAPTURE_PLAY_STYLE_LABELS = Object.freeze({
  combinative: 'Juego combinativo',
  direct: 'Juego directo',
});

export const getTacticalCapturePlayStyleLabel = (playStyle) => (
  typeof playStyle === 'string' && Object.hasOwn(TACTICAL_CAPTURE_PLAY_STYLE_LABELS, playStyle)
    ? TACTICAL_CAPTURE_PLAY_STYLE_LABELS[playStyle]
    : ''
);

const TACTICAL_CAPTURE_VISUAL_IDENTITIES = {
  defensive: {
    key: 'defensive',
    macroLabel: 'DEFENSA',
    accessibleLabel: 'Fase defensiva',
    baseAccent: '56, 189, 248',
    defaultMoment: 'mid_block',
    moments: {
      high_block: { momentAccent: '125, 211, 252', panelGlow: '14, 165, 233' },
      mid_block: { momentAccent: '56, 189, 248', panelGlow: '14, 116, 144' },
      low_block: { momentAccent: '2, 132, 199', panelGlow: '7, 89, 133' },
    },
  },
  offensive: {
    key: 'offensive',
    macroLabel: 'ATAQUE',
    accessibleLabel: 'Fase ofensiva',
    baseAccent: '251, 191, 36',
    defaultMoment: 'creation',
    moments: {
      build_up: { momentAccent: '253, 224, 71', panelGlow: '202, 138, 4' },
      creation: { momentAccent: '251, 191, 36', panelGlow: '180, 83, 9' },
      finishing: { momentAccent: '249, 115, 22', panelGlow: '194, 65, 12' },
    },
  },
  transitionDefenseAttack: {
    key: 'transition-defense-attack',
    macroLabel: 'TRANSICIÓN',
    directionLabel: 'DEF → ATQ',
    accessibleLabel: 'Transición defensa a ataque',
    baseAccent: '52, 211, 153',
    defaultMoment: 'fast_attack',
    moments: {
      fast_attack: { momentAccent: '110, 231, 183', panelGlow: '5, 150, 105' },
      keep_possession: { momentAccent: '16, 185, 129', panelGlow: '4, 120, 87' },
    },
  },
  transitionAttackDefense: {
    key: 'transition-attack-defense',
    macroLabel: 'TRANSICIÓN',
    directionLabel: 'ATQ → DEF',
    accessibleLabel: 'Transición ataque a defensa',
    baseAccent: '251, 113, 133',
    defaultMoment: 'counterpress',
    moments: {
      counterpress: { momentAccent: '253, 164, 175', panelGlow: '225, 29, 72' },
      retreat: { momentAccent: '225, 29, 72', panelGlow: '159, 18, 57' },
    },
  },
  setPiece: {
    key: 'set-piece',
    macroLabel: 'ABP',
    accessibleLabel: 'Acción a balón parado',
    baseAccent: '96, 165, 250',
    defaultMoment: 'corner',
    moments: {
      corner: { momentAccent: '147, 197, 253', panelGlow: '37, 99, 235' },
      wide_free_kick: { momentAccent: '56, 189, 248', panelGlow: '14, 116, 144' },
      central_free_kick: { momentAccent: '59, 130, 246', panelGlow: '29, 78, 216' },
      throw_in: { momentAccent: '34, 211, 238', panelGlow: '8, 145, 178' },
    },
  },
};

const NEUTRAL_CAPTURE_IDENTITY = {
  key: 'neutral',
  macroLabel: 'FASE DE JUEGO',
  accessibleLabel: 'Fase del juego',
  baseAccent: '96, 165, 250',
  defaultMoment: 'neutral',
  moments: {
    neutral: { momentAccent: '96, 165, 250', panelGlow: '30, 64, 175' },
  },
};

const resolveTacticalCaptureIdentity = (phase, transitionType) => {
  if (phase === 'defensive') return TACTICAL_CAPTURE_VISUAL_IDENTITIES.defensive;
  if (phase === 'offensive') return TACTICAL_CAPTURE_VISUAL_IDENTITIES.offensive;
  if (phase === 'transition' && transitionType === 'defensive_transition') {
    return TACTICAL_CAPTURE_VISUAL_IDENTITIES.transitionAttackDefense;
  }
  if (phase === 'transition') return TACTICAL_CAPTURE_VISUAL_IDENTITIES.transitionDefenseAttack;
  if (phase === 'set_piece') return TACTICAL_CAPTURE_VISUAL_IDENTITIES.setPiece;
  return NEUTRAL_CAPTURE_IDENTITY;
};

export const getTacticalCaptureVisualIdentity = ({
  phase = '',
  transitionType = '',
  moment = '',
  behavior = '',
} = {}) => {
  const phaseIdentity = resolveTacticalCaptureIdentity(phase, transitionType);
  const requestedMoment = phase === 'transition' ? behavior || moment : moment;
  const momentKey = Object.hasOwn(phaseIdentity.moments, requestedMoment)
    ? requestedMoment
    : phaseIdentity.defaultMoment;
  const momentIdentity = phaseIdentity.moments[momentKey];

  return {
    key: phaseIdentity.key,
    macroLabel: phaseIdentity.macroLabel,
    ...(phaseIdentity.directionLabel ? { directionLabel: phaseIdentity.directionLabel } : {}),
    accessibleLabel: phaseIdentity.accessibleLabel,
    momentKey,
    behaviorKey: String(behavior || ''),
    baseAccent: phaseIdentity.baseAccent,
    momentAccent: momentIdentity.momentAccent,
    panelGlow: momentIdentity.panelGlow,
    cssVariables: {
      '--capture-base-accent-rgb': phaseIdentity.baseAccent,
      '--capture-moment-accent-rgb': momentIdentity.momentAccent,
      '--capture-panel-glow-rgb': momentIdentity.panelGlow,
    },
  };
};
