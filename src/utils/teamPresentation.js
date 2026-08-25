import { getPlayerPositionPresentation } from '../constants/playerPositions.js';

const clean = (value) => String(value || '').trim();

const BENCH_GROUPS = {
  goalkeeper: { label: 'PORTEROS', order: 0 },
  sweeper_keeper: { label: 'PORTEROS', order: 0 },
  centre_back: { label: 'CENTRALES', order: 10 },
  right_centre_back: { label: 'CENTRALES', order: 10 },
  left_centre_back: { label: 'CENTRALES', order: 10 },
  libero: { label: 'CENTRALES', order: 10 },
  right_back: { label: 'LATERALES', order: 20 },
  left_back: { label: 'LATERALES', order: 20 },
  right_wing_back: { label: 'LATERALES', order: 20 },
  left_wing_back: { label: 'LATERALES', order: 20 },
  holding_midfield: { label: 'MEDIOCENTROS', order: 30 },
  defensive_midfield: { label: 'MEDIOCENTROS', order: 30 },
  central_midfield: { label: 'MEDIOCENTROS', order: 30 },
  right_central_midfield: { label: 'MEDIOCENTROS', order: 30 },
  left_central_midfield: { label: 'MEDIOCENTROS', order: 30 },
  attacking_midfield: { label: 'MEDIAPUNTAS', order: 40 },
  second_striker: { label: 'MEDIAPUNTAS', order: 40 },
  right_midfield: { label: 'EXTREMOS', order: 50 },
  left_midfield: { label: 'EXTREMOS', order: 50 },
  right_winger: { label: 'EXTREMOS', order: 50 },
  left_winger: { label: 'EXTREMOS', order: 50 },
  centre_forward: { label: 'DELANTEROS', order: 60 },
  mobile_forward: { label: 'DELANTEROS', order: 60 },
  target_forward: { label: 'DELANTEROS', order: 60 },
};

const NATURAL_BENCH_GROUPS = {
  goalkeeper: { label: 'PORTEROS', order: 0 },
  defender: { label: 'CENTRALES', order: 10 },
  midfielder: { label: 'MEDIOCENTROS', order: 30 },
  forward: { label: 'DELANTEROS', order: 60 },
};

export const getTeamPresentationPlayerName = (player = {}) => clean(player.shirt_name)
  || clean(player.shirtName)
  || clean(player.nombre_camiseta)
  || clean(player.name)
  || 'Jugador';

export const getTeamPresentationVariant = (team = {}) => clean(team.variantSystem)
  || clean(team.variant_system)
  || clean(team.alternativeSystem)
  || clean(team.alternative_system)
  || clean(team.variant)
  || clean(team.variante)
  || 'Sin registrar';

export const getTeamPresentationBenchGroup = (player = {}) => {
  const position = getPlayerPositionPresentation(player);
  return BENCH_GROUPS[position.specificKey]
    || NATURAL_BENCH_GROUPS[position.naturalKey]
    || { label: 'SIN POSICIÓN', order: 999 };
};
