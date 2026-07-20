const normalizePositionText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const NATURAL_POSITION_OPTIONS = [
  { value: 'goalkeeper', label: 'Portero' },
  { value: 'defender', label: 'Defensa' },
  { value: 'midfielder', label: 'Mediocentro' },
  { value: 'forward', label: 'Delantero' },
];

export const SPECIFIC_POSITION_CATALOG = {
  goalkeeper: [
    { value: 'goalkeeper', label: 'Portero' },
    { value: 'sweeper_keeper', label: 'Portero-líbero' },
  ],
  defender: [
    { value: 'right_back', label: 'Lateral derecho' },
    { value: 'left_back', label: 'Lateral izquierdo' },
    { value: 'right_wing_back', label: 'Carrilero derecho' },
    { value: 'left_wing_back', label: 'Carrilero izquierdo' },
    { value: 'centre_back', label: 'Defensa central' },
    { value: 'right_centre_back', label: 'Central derecho' },
    { value: 'left_centre_back', label: 'Central izquierdo' },
    { value: 'libero', label: 'Líbero' },
  ],
  midfielder: [
    { value: 'holding_midfield', label: 'Pivote' },
    { value: 'defensive_midfield', label: 'Mediocentro defensivo' },
    { value: 'central_midfield', label: 'Mediocentro' },
    { value: 'right_central_midfield', label: 'Interior derecho' },
    { value: 'left_central_midfield', label: 'Interior izquierdo' },
    { value: 'attacking_midfield', label: 'Mediapunta' },
    { value: 'right_midfield', label: 'Centrocampista de banda derecha' },
    { value: 'left_midfield', label: 'Centrocampista de banda izquierda' },
  ],
  forward: [
    { value: 'right_winger', label: 'Extremo derecho' },
    { value: 'left_winger', label: 'Extremo izquierdo' },
    { value: 'second_striker', label: 'Segundo delantero' },
    { value: 'centre_forward', label: 'Delantero centro' },
    { value: 'mobile_forward', label: 'Delantero móvil' },
    { value: 'target_forward', label: 'Referencia ofensiva' },
  ],
};

export const ALL_SPECIFIC_POSITION_OPTIONS = Object.values(SPECIFIC_POSITION_CATALOG).flat();

const naturalLabelByKey = new Map(NATURAL_POSITION_OPTIONS.map((item) => [item.value, item.label]));
const specificLabelByKey = new Map(ALL_SPECIFIC_POSITION_OPTIONS.map((item) => [item.value, item.label]));
const naturalBySpecific = new Map(Object.entries(SPECIFIC_POSITION_CATALOG)
  .flatMap(([natural, items]) => items.map((item) => [item.value, natural])));

const exactAliases = new Map([
  ['portero', 'goalkeeper'], ['arquero', 'goalkeeper'], ['guardameta', 'goalkeeper'], ['goalkeeper', 'goalkeeper'], ['gk', 'goalkeeper'], ['por', 'goalkeeper'],
  ['portero libero', 'sweeper_keeper'], ['sweeper keeper', 'sweeper_keeper'],
  ['lateral derecho', 'right_back'], ['right back', 'right_back'], ['ld', 'right_back'], ['rb', 'right_back'],
  ['lateral izquierdo', 'left_back'], ['left back', 'left_back'], ['li', 'left_back'], ['lb', 'left_back'],
  ['carrilero derecho', 'right_wing_back'], ['right wing back', 'right_wing_back'],
  ['carrilero izquierdo', 'left_wing_back'], ['left wing back', 'left_wing_back'],
  ['defensa central', 'centre_back'], ['central', 'centre_back'], ['centre back', 'centre_back'], ['center back', 'centre_back'], ['dfc', 'centre_back'], ['cb', 'centre_back'],
  ['central derecho', 'right_centre_back'], ['central izquierdo', 'left_centre_back'], ['libero', 'libero'],
  ['pivote', 'holding_midfield'], ['mediocentro defensivo', 'defensive_midfield'], ['medio defensivo', 'defensive_midfield'], ['defensive midfield', 'defensive_midfield'], ['mcd', 'defensive_midfield'], ['dm', 'defensive_midfield'],
  ['mediocentro', 'central_midfield'], ['centrocampista', 'central_midfield'], ['medio centro', 'central_midfield'], ['central midfield', 'central_midfield'], ['mc', 'central_midfield'], ['cm', 'central_midfield'],
  ['interior derecho', 'right_central_midfield'], ['interior izquierdo', 'left_central_midfield'],
  ['mediapunta', 'attacking_midfield'], ['mediocentro ofensivo', 'attacking_midfield'], ['attacking midfield', 'attacking_midfield'], ['mco', 'attacking_midfield'], ['mp', 'attacking_midfield'], ['am', 'attacking_midfield'],
  ['centrocampista de banda derecha', 'right_midfield'], ['right midfield', 'right_midfield'],
  ['centrocampista de banda izquierda', 'left_midfield'], ['left midfield', 'left_midfield'],
  ['extremo derecho', 'right_winger'], ['right winger', 'right_winger'], ['ed', 'right_winger'], ['rw', 'right_winger'],
  ['extremo izquierdo', 'left_winger'], ['left winger', 'left_winger'], ['ei', 'left_winger'], ['lw', 'left_winger'],
  ['segundo delantero', 'second_striker'], ['second striker', 'second_striker'],
  ['delantero centro', 'centre_forward'], ['centre forward', 'centre_forward'], ['center forward', 'centre_forward'], ['delantero', 'centre_forward'], ['punta', 'centre_forward'], ['striker', 'centre_forward'], ['dc', 'centre_forward'], ['cf', 'centre_forward'], ['st', 'centre_forward'],
  ['delantero movil', 'mobile_forward'], ['referencia ofensiva', 'target_forward'],
]);

const naturalAliases = new Map([
  ['portero', 'goalkeeper'], ['goalkeeper', 'goalkeeper'],
  ['defensa', 'defender'], ['defender', 'defender'],
  ['mediocentro', 'midfielder'], ['centrocampista', 'midfielder'], ['midfielder', 'midfielder'],
  ['delantero', 'forward'], ['atacante', 'forward'], ['forward', 'forward'],
]);

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

export const getNaturalPositionLabel = (key) => naturalLabelByKey.get(key) || '';
export const getSpecificPositionLabel = (key) => specificLabelByKey.get(key) || '';
export const getNaturalPositionForSpecific = (key) => naturalBySpecific.get(key) || '';

export const mapExternalPositionToPlayerPositions = (rawPosition) => {
  const values = Array.isArray(rawPosition)
    ? rawPosition
    : String(rawPosition || '').split(/[\n,;/|]+/);
  const specificPositions = unique(values.map((value) => {
    const normalized = normalizePositionText(value);
    if (!normalized) return '';
    if (specificLabelByKey.has(value)) return value;
    if (exactAliases.has(normalized)) return exactAliases.get(normalized);
    const alias = Array.from(exactAliases.entries()).find(([candidate]) => normalized.includes(candidate));
    return alias?.[1] || '';
  }));
  const naturalPositions = unique(specificPositions.map(getNaturalPositionForSpecific));
  if (!specificPositions.length) {
    const natural = naturalAliases.get(normalizePositionText(values[0])) || '';
    if (natural) naturalPositions.push(natural);
  }
  const primaryNaturalPosition = naturalPositions[0] || '';
  const primarySpecificPosition = specificPositions[0] || '';
  return {
    primaryNaturalPosition,
    secondaryNaturalPositions: naturalPositions.slice(1),
    primarySpecificPosition,
    secondarySpecificPositions: specificPositions.slice(1),
    naturalPositions,
    specificPositions,
    position: getNaturalPositionLabel(primaryNaturalPosition),
    specificPosition: getSpecificPositionLabel(primarySpecificPosition) || String(values[0] || '').trim(),
  };
};

export const getPlayerPositionModel = (player = {}) => {
  const legacy = mapExternalPositionToPlayerPositions([player.specificPosition || player.specific_position, player.position].filter(Boolean));
  const primaryNaturalPosition = player.primaryNaturalPosition || player.primary_natural_position || legacy.primaryNaturalPosition || '';
  const secondaryNaturalPositions = unique([
    ...(player.secondaryNaturalPositions || player.secondary_natural_positions || []),
    ...legacy.secondaryNaturalPositions,
  ]).filter((key) => key !== primaryNaturalPosition);
  const primarySpecificPosition = player.primarySpecificPosition || player.primary_specific_position || legacy.primarySpecificPosition || '';
  const secondarySpecificPositions = unique([
    ...(player.secondarySpecificPositions || player.secondary_specific_positions || []),
    ...legacy.secondarySpecificPositions,
  ]).filter((key) => key !== primarySpecificPosition);
  return { primaryNaturalPosition, secondaryNaturalPositions, primarySpecificPosition, secondarySpecificPositions };
};

const equivalentSpecificGroups = [
  ['goalkeeper', 'sweeper_keeper'],
  ['right_back', 'right_wing_back'], ['left_back', 'left_wing_back'],
  ['centre_back', 'right_centre_back', 'left_centre_back', 'libero'],
  ['holding_midfield', 'defensive_midfield', 'central_midfield'],
  ['right_central_midfield', 'right_midfield'], ['left_central_midfield', 'left_midfield'],
  ['attacking_midfield', 'second_striker'],
  ['right_midfield', 'right_winger'], ['left_midfield', 'left_winger'],
  ['centre_forward', 'mobile_forward', 'target_forward', 'second_striker'],
];

const areEquivalentSpecificPositions = (left, right) => equivalentSpecificGroups.some((group) => group.includes(left) && group.includes(right));

export const getPlayerSlotCompatibility = (player, tacticalSlot) => {
  const model = getPlayerPositionModel(player);
  const slotModel = typeof tacticalSlot === 'string'
    ? mapExternalPositionToPlayerPositions(tacticalSlot)
    : tacticalSlot || {};
  const targetSpecific = slotModel.primarySpecificPosition || slotModel.primary_specific_position || '';
  const targetNatural = slotModel.primaryNaturalPosition || slotModel.primary_natural_position || getNaturalPositionForSpecific(targetSpecific);
  if (!targetSpecific && !targetNatural) return 0;
  if (targetSpecific && model.primarySpecificPosition === targetSpecific) return 100;
  if (targetSpecific && model.secondarySpecificPositions.includes(targetSpecific)) return 85;
  if (targetSpecific && [model.primarySpecificPosition, ...model.secondarySpecificPositions].some((key) => areEquivalentSpecificPositions(key, targetSpecific))) return 65;
  if (targetNatural && [model.primaryNaturalPosition, ...model.secondaryNaturalPositions].includes(targetNatural)) return 40;
  return 0;
};

export const getSpecificOptionsForNaturalPositions = (naturalPositions = []) => unique(naturalPositions)
  .flatMap((key) => SPECIFIC_POSITION_CATALOG[key] || []);

