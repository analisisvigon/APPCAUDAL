export const SET_PIECE_META_TYPE = 'tactical_meta';
export const SET_PIECE_PRINT_IDENTITY_MODES = Object.freeze({
  NUMBER: 'number',
  ABBREVIATION: 'abbreviation',
  NUMBER_AND_ABBREVIATION: 'number-and-abbreviation',
});

export const SET_PIECE_DISPLAY_LAYER_KEYS = Object.freeze([
  'dorsals',
  'abbreviations',
  'roles',
  'chronology',
  'zones',
  'texts',
]);

export const createDefaultSetPieceDisplayLayers = () => ({
  dorsals: true,
  abbreviations: true,
  roles: true,
  chronology: true,
  zones: true,
  texts: true,
});

export const normalizeSetPieceDisplayLayers = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const defaults = createDefaultSetPieceDisplayLayers();
  return Object.fromEntries(SET_PIECE_DISPLAY_LAYER_KEYS.map((key) => {
    const legacyKey = key === 'dorsals' ? 'numbers' : key;
    const candidate = source[key] ?? source[legacyKey];
    return [key, typeof candidate === 'boolean' ? candidate : defaults[key]];
  }));
};

export const SET_PIECE_ROLES = [
  'Lanzador',
  'Rematador',
  'Bloqueador',
  'Arrastre',
  'Pantalla',
  'Rechace',
  'Segundo palo',
  'Primer palo',
  'Cobertura',
  'Vigilancia',
  'Salida transición',
];

export const createDefaultSetPieceTacticalMeta = () => ({
  version: 3,
  objective: '',
  saqueType: '',
  whenToUse: '',
  generalInstruction: '',
  risk: '',
  alternative: '',
  observations: '',
  collectiveInstructions: [],
  rating: 0,
  tags: [],
  lastUsedAt: '',
  printIdentityMode: SET_PIECE_PRINT_IDENTITY_MODES.NUMBER_AND_ABBREVIATION,
  displayLayers: createDefaultSetPieceDisplayLayers(),
  displayLayersBeforeStructure: null,
  libraryId: '',
  libraryVersion: '',
  importedAt: '',
  linkStatus: 'detached',
  libraryZone: '',
  libraryMechanism: '',
  libraryMarking: '',
  libraryStatus: 'draft',
  libraryFavorite: false,
  libraryCreatedAt: '',
  libraryUpdatedAt: '',
});

const cleanString = (value) => String(value || '').trim();

export const normalizeSetPieceTacticalMeta = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const defaults = createDefaultSetPieceTacticalMeta();
  const legacyAlternative = (Array.isArray(source.variants) ? source.variants : [])
    .map((variant) => cleanString(variant?.changes))
    .filter(Boolean)
    .join(' / ');
  const identityMode = Object.values(SET_PIECE_PRINT_IDENTITY_MODES).includes(source.printIdentityMode)
    ? source.printIdentityMode
    : defaults.printIdentityMode;
  const libraryId = cleanString(source.libraryId);
  const displayLayersBeforeStructure = source.displayLayersBeforeStructure
    ? normalizeSetPieceDisplayLayers(source.displayLayersBeforeStructure)
    : null;
  const legacyDisplayLayers = {
    ...createDefaultSetPieceDisplayLayers(),
    dorsals: identityMode !== SET_PIECE_PRINT_IDENTITY_MODES.ABBREVIATION,
    abbreviations: identityMode !== SET_PIECE_PRINT_IDENTITY_MODES.NUMBER,
  };
  return {
    ...defaults,
    version: 3,
    objective: cleanString(source.objective),
    saqueType: cleanString(source.saqueType || source.saque_type || source.typeOfSaque),
    whenToUse: cleanString(source.whenToUse),
    generalInstruction: cleanString(source.generalInstruction),
    risk: cleanString(source.risk),
    alternative: cleanString(source.alternative || source.variation || legacyAlternative),
    observations: cleanString(source.observations),
    collectiveInstructions: (Array.isArray(source.collectiveInstructions) ? source.collectiveInstructions : [])
      .map((instruction, index) => {
        const text = cleanString(typeof instruction === 'string' ? instruction : instruction?.text);
        return {
          id: cleanString(typeof instruction === 'object' ? instruction?.id : '') || `instruction-${index + 1}`,
          text,
          order: Number(typeof instruction === 'object' ? instruction?.order : index + 1) || index + 1,
        };
      })
      .sort((a, b) => a.order - b.order)
      .map((instruction, index) => ({ ...instruction, order: index + 1 })),
    rating: Math.max(0, Math.min(5, Number(source.rating) || 0)),
    tags: (Array.isArray(source.tags) ? source.tags : [])
      .map(cleanString)
      .filter(Boolean)
      .slice(0, 12),
    lastUsedAt: cleanString(source.lastUsedAt),
    printIdentityMode: identityMode,
    displayLayers: normalizeSetPieceDisplayLayers(source.displayLayers || legacyDisplayLayers),
    displayLayersBeforeStructure,
    libraryId,
    libraryVersion: cleanString(source.libraryVersion),
    importedAt: cleanString(source.importedAt),
    linkStatus: libraryId ? cleanString(source.linkStatus) || 'linked' : 'detached',
    libraryZone: cleanString(source.libraryZone),
    libraryMechanism: cleanString(source.libraryMechanism),
    libraryMarking: cleanString(source.libraryMarking),
    libraryStatus: ['draft', 'ready', 'archived'].includes(source.libraryStatus) ? source.libraryStatus : 'draft',
    libraryFavorite: Boolean(source.libraryFavorite),
    libraryCreatedAt: cleanString(source.libraryCreatedAt),
    libraryUpdatedAt: cleanString(source.libraryUpdatedAt),
  };
};

export const getSetPieceTacticalMeta = (elements) => {
  const metaElement = (Array.isArray(elements) ? elements : []).find((element) => element?.type === SET_PIECE_META_TYPE);
  return normalizeSetPieceTacticalMeta(metaElement?.data);
};

export const getDrawableSetPieceElements = (elements) => (
  (Array.isArray(elements) ? elements : []).filter((element) => (
    element?.type !== 'player_note' && element?.type !== SET_PIECE_META_TYPE
  ))
);

export const setSetPieceTacticalMeta = (elements, nextMeta) => {
  const currentMeta = (Array.isArray(elements) ? elements : []).find((element) => element?.type === SET_PIECE_META_TYPE);
  const drawable = getDrawableSetPieceElements(elements);
  return [
    ...drawable,
    {
      id: currentMeta?.id || createSetPieceEntityId('meta'),
      type: SET_PIECE_META_TYPE,
      data: normalizeSetPieceTacticalMeta(nextMeta),
    },
  ];
};

export const getSetPiecePlayerName = (element, playersById) => {
  const player = playersById?.get?.(element?.player_id);
  return cleanString(
    player?.shirtName
    || player?.shirt_name
    || player?.abbreviation
    || player?.abreviatura
    || player?.shortName
    || player?.short_name
    || player?.name
    || element?.name,
  );
};

const createSetPieceEntityId = (prefix = 'abp') => {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getPreferredPrintIdentity = (element, player, fallbackIndex) => {
  const shirtName = [
    player?.shirtName,
    player?.shirt_name,
    element?.shirtName,
    element?.shirt_name,
  ].map(cleanString).find(Boolean);
  if (shirtName) return shirtName;

  const configuredAbbreviation = [
    player?.abbreviation,
    player?.abreviatura,
    element?.abbreviation,
    element?.abreviatura,
  ].map(cleanString).find(Boolean);
  if (configuredAbbreviation) return configuredAbbreviation;

  const usefulName = [
    player?.shortName,
    player?.short_name,
    element?.shortName,
    element?.short_name,
    player?.name,
    element?.name,
  ].map(cleanString).find(Boolean);
  if (usefulName) return usefulName;

  const dorsal = cleanString(element?.label || player?.number || player?.dorsal);
  if (dorsal) return dorsal;

  return `J${String(fallbackIndex + 1).padStart(2, '0').slice(-2)}`;
};

export const getSetPieceGeometrySnapshot = (elements) => getDrawableSetPieceElements(elements).map((element) => {
  const geometry = { id: element.id, type: element.type };
  ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'curve', 'curvature', 'controlX', 'controlY']
    .forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(element, key)) geometry[key] = element[key];
    });
  return geometry;
});

const getLabelPlacement = ({ element, text, players, occupied }) => {
  const width = Math.max(5.5, Math.min(19, text.length * 1.55));
  const height = 3.4;
  const radialCandidates = [
    [0, 5.4], [0, -4.3], [width / 2 + 3, 1], [-(width / 2 + 3), 1],
    [width / 2 + 3, 5.4], [-(width / 2 + 3), 5.4], [width / 2 + 3, -4.3], [-(width / 2 + 3), -4.3],
    [0, 9], [0, -8], [width / 2 + 6, 3], [-(width / 2 + 6), 3],
  ];
  const candidates = radialCandidates.map(([dx, dy]) => {
    const centerX = Math.max(width / 2 + 1, Math.min(99 - width / 2, Number(element.x || 0) + dx));
    const baselineY = Math.max(height + 1, Math.min(70, Number(element.y || 0) + dy));
    const box = { left: centerX - width / 2, right: centerX + width / 2, top: baselineY - height, bottom: baselineY + 0.5 };
    const labelCollisions = occupied.filter((other) => !(
      box.right + 0.8 < other.left || box.left - 0.8 > other.right || box.bottom + 0.6 < other.top || box.top - 0.6 > other.bottom
    )).length;
    const playerCollisions = players.filter((player) => player.id !== element.id && (
      Number(player.x) >= box.left - 2.5 && Number(player.x) <= box.right + 2.5
      && Number(player.y) >= box.top - 2.5 && Number(player.y) <= box.bottom + 2.5
    )).length;
    const displacement = Math.hypot(centerX - Number(element.x || 0), baselineY - Number(element.y || 0));
    return { centerX, baselineY, box, score: labelCollisions * 100 + playerCollisions * 18 + displacement };
  });
  return candidates.sort((a, b) => a.score - b.score)[0];
};

export const optimizeSetPieceElementsForPrint = (elements, players = []) => {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const drawable = getDrawableSetPieceElements(elements).map((element) => ({ ...element }));
  const playerElements = drawable.filter((element) => ['player', 'opponent'].includes(element.type));
  const abbreviationCounts = new Map();
  const abbreviations = playerElements.map((element, index) => {
    const player = playersById.get(element.player_id);
    const base = getPreferredPrintIdentity(element, player, index);
    const key = base.toLocaleLowerCase('es');
    abbreviationCounts.set(key, (abbreviationCounts.get(key) || 0) + 1);
    return base;
  });
  const usedAbbreviations = new Set();
  const labelBoxes = [];

  playerElements.forEach((element, index) => {
    const base = abbreviations[index];
    const duplicate = abbreviationCounts.get(base.toLocaleLowerCase('es')) > 1;
    const dorsal = cleanString(element.label);
    let uniqueAbbreviation = duplicate ? `${base}${dorsal && dorsal.toLocaleLowerCase('es') !== base.toLocaleLowerCase('es') ? ` · ${dorsal}` : ` ${index + 1}`}` : base;
    let fallbackIndex = index + 1;
    while (usedAbbreviations.has(uniqueAbbreviation.toLocaleLowerCase('es'))) {
      uniqueAbbreviation = `${base}${dorsal && dorsal.toLocaleLowerCase('es') !== base.toLocaleLowerCase('es') ? ` · ${dorsal}` : ''} ${fallbackIndex}`;
      fallbackIndex += 1;
    }
    usedAbbreviations.add(uniqueAbbreviation.toLocaleLowerCase('es'));
    element.printName = uniqueAbbreviation;
    const placement = getLabelPlacement({ element, text: uniqueAbbreviation, players: playerElements, occupied: labelBoxes });
    element.printLabelX = placement.centerX;
    element.printLabelY = placement.baselineY;
    element.printLabelLeader = Math.hypot(placement.centerX - Number(element.x || 0), placement.baselineY - Number(element.y || 0)) > 6;
    labelBoxes.push(placement.box);
  });

  drawable
    .filter((element) => ['text', 'text_box', 'zone'].includes(element.type) && cleanString(element.label))
    .forEach((element) => {
      const lines = cleanString(element.label).split(/\r?\n/).filter(Boolean);
      const longestLine = lines.sort((a, b) => b.length - a.length)[0] || '';
      const isBox = ['text_box', 'zone'].includes(element.type);
      const originalLabelX = isBox
        ? Number(element.x || 0) + Math.min(Number(element.width || 18) / 2, 9)
        : Number(element.x || 0);
      const originalLabelY = isBox ? Number(element.y || 0) + 4 : Number(element.y || 0);
      const placement = getLabelPlacement({
        element: { ...element, x: originalLabelX, y: originalLabelY - 5.4 },
        text: longestLine,
        players: playerElements,
        occupied: labelBoxes,
      });
      element.printLabelX = placement.centerX;
      element.printLabelY = placement.baselineY;
      element.printLabelLeader = Math.hypot(
        placement.centerX - originalLabelX,
        placement.baselineY - originalLabelY,
      ) > 5;
      labelBoxes.push(placement.box);
    });

  return drawable;
};

export const cloneSetPieceElementsWithFreshIds = (elements) => {
  const source = JSON.parse(JSON.stringify(Array.isArray(elements) ? elements : []));
  const idMap = new Map();
  const collectIds = (value) => {
    if (Array.isArray(value)) return value.forEach(collectIds);
    if (!value || typeof value !== 'object') return;
    Object.entries(value).forEach(([key, entry]) => {
      if (key === 'id' && typeof entry === 'string' && entry) idMap.set(entry, createSetPieceEntityId('copy'));
      collectIds(entry);
    });
  };
  const replaceIds = (value) => {
    if (Array.isArray(value)) return value.map(replaceIds);
    if (typeof value === 'string') return idMap.get(value) || value;
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceIds(entry)]));
  };
  collectIds(source);
  return replaceIds(source);
};

export const getSetPieceChronology = (elements, players = []) => {
  const playersById = new Map(players.map((player) => [player.id, player]));
  return getDrawableSetPieceElements(elements)
    .filter((element) => ['player', 'opponent'].includes(element.type) && Number(element.sequenceOrder) > 0)
    .sort((a, b) => Number(a.sequenceOrder) - Number(b.sequenceOrder))
    .map((element) => ({
      id: element.id,
      order: Number(element.sequenceOrder),
      playerName: getSetPiecePlayerName(element, playersById) || cleanString(element.roles?.[0]) || `Jugador ${element.label || ''}`.trim(),
      role: cleanString(element.roles?.[0]),
      instruction: cleanString(element.note),
    }));
};

export const getSetPieceIndividualInstructions = (elements, players = []) => {
  const playersById = new Map(players.map((player) => [player.id, player]));
  return getDrawableSetPieceElements(elements)
    .map((element, sourceIndex) => ({ element, sourceIndex }))
    .filter(({ element }) => ['player', 'opponent'].includes(element.type) && cleanString(element.note))
    .sort((left, right) => {
      const leftOrder = Number(left.element.sequenceOrder) > 0 ? Number(left.element.sequenceOrder) : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number(right.element.sequenceOrder) > 0 ? Number(right.element.sequenceOrder) : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.sourceIndex - right.sourceIndex;
    })
    .map(({ element }) => ({
      id: element.id,
      playerName: getSetPiecePlayerName(element, playersById) || cleanString(element.roles?.[0]) || `Jugador ${element.label || ''}`.trim(),
      role: cleanString(element.roles?.[0]),
      instruction: cleanString(element.note),
    }));
};

export const getSetPieceResponsibilities = (elements, players = []) => {
  const playersById = new Map(players.map((player) => [player.id, player]));
  return getDrawableSetPieceElements(elements)
    .filter((element) => ['player', 'opponent'].includes(element.type) && Array.isArray(element.roles) && element.roles.length)
    .flatMap((element) => element.roles.map((role) => ({
      role,
      playerName: getSetPiecePlayerName(element, playersById) || `Jugador ${element.label || ''}`.trim(),
      primary: Boolean(element.primaryResponsibility),
    })))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.role.localeCompare(b.role, 'es'));
};
