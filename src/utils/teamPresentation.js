import { getPlayerPositionPresentation } from '../constants/playerPositions.js';

const clean = (value) => String(value || '').trim();

const BENCH_GROUPS = {
  goalkeeper: { label: 'PORTEROS', order: 0 },
  sweeper_keeper: { label: 'PORTEROS', order: 0 },
  centre_back: { label: 'DEFENSAS', order: 10 },
  right_centre_back: { label: 'DEFENSAS', order: 10 },
  left_centre_back: { label: 'DEFENSAS', order: 10 },
  libero: { label: 'DEFENSAS', order: 10 },
  right_back: { label: 'DEFENSAS', order: 10 },
  left_back: { label: 'DEFENSAS', order: 10 },
  right_wing_back: { label: 'DEFENSAS', order: 10 },
  left_wing_back: { label: 'DEFENSAS', order: 10 },
  holding_midfield: { label: 'MEDIOCENTROS', order: 30 },
  defensive_midfield: { label: 'MEDIOCENTROS', order: 30 },
  central_midfield: { label: 'MEDIOCENTROS', order: 30 },
  right_central_midfield: { label: 'MEDIOCENTROS', order: 30 },
  left_central_midfield: { label: 'MEDIOCENTROS', order: 30 },
  attacking_midfield: { label: 'MEDIOCENTROS', order: 30 },
  right_midfield: { label: 'MEDIOCENTROS', order: 30 },
  left_midfield: { label: 'MEDIOCENTROS', order: 30 },
  second_striker: { label: 'ATACANTES', order: 40 },
  right_winger: { label: 'ATACANTES', order: 40 },
  left_winger: { label: 'ATACANTES', order: 40 },
  centre_forward: { label: 'ATACANTES', order: 40 },
  mobile_forward: { label: 'ATACANTES', order: 40 },
  target_forward: { label: 'ATACANTES', order: 40 },
};

const NATURAL_BENCH_GROUPS = {
  goalkeeper: { label: 'PORTEROS', order: 0 },
  defender: { label: 'DEFENSAS', order: 10 },
  midfielder: { label: 'MEDIOCENTROS', order: 30 },
  forward: { label: 'ATACANTES', order: 40 },
};

export const getTeamPresentationPlayerName = (player = {}) => clean(player.shirt_name)
  || clean(player.shirtName)
  || clean(player.nombre_camiseta)
  || clean(player.name)
  || 'Jugador';

export const normalizeTeamTacticalVariants = (value) => {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/);
  return values.reduce((variants, item) => {
    const variant = clean(item);
    if (!variant || variants.some((current) => current.toLocaleLowerCase('es') === variant.toLocaleLowerCase('es'))) return variants;
    return [...variants, variant];
  }, []);
};

export const getTeamPresentationVariants = (team = {}) => {
  const variants = normalizeTeamTacticalVariants([
    ...normalizeTeamTacticalVariants(team.tacticalVariants),
    ...normalizeTeamTacticalVariants(team.tactical_variants),
    ...normalizeTeamTacticalVariants(team.variants),
    ...normalizeTeamTacticalVariants(team.variantSystem),
    ...normalizeTeamTacticalVariants(team.variant_system),
    ...normalizeTeamTacticalVariants(team.alternativeSystem),
    ...normalizeTeamTacticalVariants(team.alternative_system),
    ...normalizeTeamTacticalVariants(team.variant),
    ...normalizeTeamTacticalVariants(team.variante),
  ]);
  const mainSystem = clean(team.system).toLocaleLowerCase('es');
  return variants.filter((variant) => variant.toLocaleLowerCase('es') !== mainSystem);
};

const PRESENTATION_LINE_X = {
  1: [50],
  2: [30, 70],
  3: [18, 50, 82],
  4: [11, 37, 63, 89],
  5: [9, 29.5, 50, 70.5, 91],
};

export const getCollisionSafePresentationCoordinates = (coordinates = []) => {
  const rows = [];
  coordinates.forEach((coordinate, index) => {
    const y = Number(coordinate?.y ?? 50);
    const row = rows.find((candidate) => Math.abs(candidate.averageY - y) <= 6);
    if (row) {
      row.items.push({ index, ...coordinate });
      row.averageY = row.items.reduce((sum, item) => sum + Number(item.y ?? 50), 0) / row.items.length;
    } else {
      rows.push({ averageY: y, items: [{ index, ...coordinate }] });
    }
  });
  rows.sort((left, right) => left.averageY - right.averageY);
  const safeCoordinates = coordinates.map((coordinate) => ({ ...coordinate }));
  rows.forEach((row, rowIndex) => {
    const sorted = [...row.items].sort((left, right) => Number(left.x ?? 50) - Number(right.x ?? 50));
    const safeX = PRESENTATION_LINE_X[Math.min(5, sorted.length)] || PRESENTATION_LINE_X[5];
    const safeY = rows.length === 1 ? 50 : 10 + (80 * rowIndex) / (rows.length - 1);
    sorted.forEach((item, itemIndex) => {
      safeCoordinates[item.index] = { ...safeCoordinates[item.index], x: safeX[itemIndex] ?? item.x, y: safeY };
    });
  });
  return safeCoordinates;
};

export const getTeamPresentationBenchGroup = (player = {}) => {
  const position = getPlayerPositionPresentation(player);
  return BENCH_GROUPS[position.specificKey]
    || NATURAL_BENCH_GROUPS[position.naturalKey]
    || { label: 'SIN POSICIÓN', order: 999 };
};
