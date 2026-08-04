export const SET_PIECE_META_TYPE = 'tactical_meta';

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
  version: 1,
  objective: '',
  whenToUse: '',
  generalInstruction: '',
  risk: '',
  variation: '',
  observations: '',
  rating: 0,
  tags: [],
  lastUsedAt: '',
  variants: [
    { id: 'A', name: 'Variante A', changes: '', inherited: true },
    { id: 'B', name: 'Variante B', changes: '', inherited: true },
  ],
});

const cleanString = (value) => String(value || '').trim();

export const normalizeSetPieceTacticalMeta = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const defaults = createDefaultSetPieceTacticalMeta();
  const variantsById = new Map(
    (Array.isArray(source.variants) ? source.variants : [])
      .filter((variant) => variant && ['A', 'B'].includes(String(variant.id)))
      .map((variant) => [String(variant.id), variant])
  );
  return {
    ...defaults,
    version: 1,
    objective: cleanString(source.objective),
    whenToUse: cleanString(source.whenToUse),
    generalInstruction: cleanString(source.generalInstruction),
    risk: cleanString(source.risk),
    variation: cleanString(source.variation),
    observations: cleanString(source.observations),
    rating: Math.max(0, Math.min(5, Number(source.rating) || 0)),
    tags: (Array.isArray(source.tags) ? source.tags : [])
      .map(cleanString)
      .filter(Boolean)
      .slice(0, 12),
    lastUsedAt: cleanString(source.lastUsedAt),
    variants: defaults.variants.map((fallback) => {
      const stored = variantsById.get(fallback.id) || {};
      return {
        ...fallback,
        name: cleanString(stored.name) || fallback.name,
        changes: cleanString(stored.changes),
        inherited: true,
      };
    }),
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
  const drawable = getDrawableSetPieceElements(elements);
  return [
    ...drawable,
    {
      id: 'set-piece-tactical-meta-v1',
      type: SET_PIECE_META_TYPE,
      data: normalizeSetPieceTacticalMeta(nextMeta),
    },
  ];
};

export const getSetPiecePlayerName = (element, playersById) => {
  const player = playersById?.get?.(element?.player_id);
  return cleanString(player?.shirtName || player?.shirt_name || player?.name || element?.name);
};

const getInitials = (value) => {
  const parts = cleanString(value).split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 8);
  return `${parts[0][0]}. ${parts.at(-1)}`.slice(0, 10);
};

const distance = (a, b) => Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));

const pointToSegmentDistance = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
};

export const optimizeSetPieceElementsForPrint = (elements, players = []) => {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const drawable = getDrawableSetPieceElements(elements).map((element) => ({ ...element }));
  const playerElements = drawable.filter((element) => ['player', 'opponent'].includes(element.type));
  const arrows = drawable.filter((element) => ['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow'].includes(element.type));
  const boxes = drawable.filter((element) => ['zone', 'text_box', 'block'].includes(element.type));

  playerElements.forEach((element, index) => {
    const nearby = playerElements.filter((candidate) => candidate.id !== element.id && distance(element, candidate) < 13);
    const fullName = getSetPiecePlayerName(element, playersById);
    element.printName = nearby.length ? getInitials(fullName) : fullName;
    if (nearby.some((candidate) => distance(element, candidate) < 7.5)) {
      element.printName = cleanString(element.label) || getInitials(fullName);
    }
    const direction = index % 4;
    element.printLabelOffsetX = direction === 1 ? 4 : direction === 3 ? -4 : 0;
    element.printLabelOffsetY = direction === 0 ? 0 : direction === 2 ? -9 : -3;
  });

  arrows.forEach((arrow, index) => {
    const start = { x: Number(arrow.x1 || 0), y: Number(arrow.y1 || 0) };
    const end = { x: Number(arrow.x2 || 0), y: Number(arrow.y2 || 0) };
    const crossesPlayer = playerElements.some((player) => (
      distance(player, start) > 4 && distance(player, end) > 4 && pointToSegmentDistance(player, start, end) < 4.6
    ));
    const sharesPath = arrows.slice(0, index).some((candidate) => (
      distance(start, { x: Number(candidate.x1 || 0), y: Number(candidate.y1 || 0) }) < 8
      && distance(end, { x: Number(candidate.x2 || 0), y: Number(candidate.y2 || 0) }) < 8
    ));
    if (crossesPlayer || sharesPath) arrow.printCurve = (index % 2 ? 1 : -1) * (sharesPath ? 12 : 8);
  });

  boxes.forEach((box, index) => {
    const width = Number(box.width || (box.type === 'block' ? 8 : 18));
    const height = Number(box.height || (box.type === 'block' ? 8 : 10));
    const overlapsPlayer = playerElements.some((player) => (
      player.x >= box.x - 3 && player.x <= box.x + width + 3
      && player.y >= box.y - 3 && player.y <= box.y + height + 3
    ));
    if (overlapsPlayer) {
      box.x = Math.max(2, Math.min(98 - width, Number(box.x || 0) + (index % 2 ? -8 : 8)));
      box.y = Math.max(2, Math.min(70 - height, Number(box.y || 0) + 7));
    }
  });

  return drawable;
};

export const getSetPieceChronology = (elements, players = []) => {
  const playersById = new Map(players.map((player) => [player.id, player]));
  return getDrawableSetPieceElements(elements)
    .filter((element) => ['player', 'opponent'].includes(element.type) && Number(element.sequenceOrder) > 0)
    .sort((a, b) => Number(a.sequenceOrder) - Number(b.sequenceOrder))
    .map((element) => ({
      id: element.id,
      order: Number(element.sequenceOrder),
      playerName: getSetPiecePlayerName(element, playersById) || `Jugador ${element.label || ''}`.trim(),
      instruction: cleanString(element.note) || cleanString(element.roles?.[0]) || 'interviene',
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
