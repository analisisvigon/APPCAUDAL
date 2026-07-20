export const PLAYER_TRAIT_CATEGORIES = [
  { value: 'strength', label: 'Fortalezas' },
  { value: 'vulnerability', label: 'Vulnerabilidades' },
  { value: 'trend', label: 'Tendencias' },
];

export const PLAYER_SCOUTING_TRAITS = {
  goalkeeper: {
    strength: ['Buen juego aéreo', 'Fuerte en 1 contra 1', 'Buen juego de pies'],
    vulnerability: ['Dificultad bajo presión', 'Rechaza hacia zona central', 'Poco dominio aéreo', 'Lento en desplazamiento lateral'],
    trend: ['Sale lejos del área', 'Busca envío largo', 'Inicia en corto'],
  },
  centre_back: {
    strength: ['Dominante en duelo aéreo', 'Defiende bien el área', 'Sale conduciendo', 'Busca pase vertical', 'Fuerte en contacto', 'Buen perfil corporal'],
    vulnerability: ['Sufre a la espalda', 'Lento en espacios amplios', 'Se precipita al saltar', 'Débil con pierna no dominante'],
    trend: ['Agresivo hacia delante', 'Abusa del envío largo', 'Sigue al delantero fuera de zona', 'Defiende mirando balón'],
  },
  fullback: {
    strength: ['Profundo', 'Buen centro', 'Fuerte en duelo defensivo', 'Cierra bien segundo palo'],
    vulnerability: ['Sufre a la espalda', 'Débil en 1 contra 1 defensivo'],
    trend: ['Se incorpora constantemente', 'Ataca espacio exterior', 'Juega por dentro', 'Presiona alto', 'Ayuda al lateral'],
  },
  midfielder: {
    strength: ['Organiza el juego', 'Gira bajo presión', 'Cambia orientación', 'Rompe líneas con pase', 'Fuerte en segunda jugada', 'Buen posicionamiento defensivo'],
    vulnerability: ['Pierde balones interiores', 'Lento en transición defensiva'],
    trend: ['Juega a uno o dos toques', 'Se ofrece entre centrales', 'Conduce para progresar', 'Salta demasiado a presión', 'Conduce antes de pasar'],
  },
  winger: {
    strength: ['Ataca profundidad', 'Buen 1 contra 1', 'Buen centro', 'Finaliza con frecuencia'],
    vulnerability: ['Poco retorno defensivo', 'Pierde muchos balones'],
    trend: ['Recibe al pie', 'Encara por fuera', 'Conduce hacia dentro', 'Ataca segundo palo', 'Ayuda al lateral', 'Busca pierna dominante'],
  },
  forward: {
    strength: ['Juego de espaldas', 'Ataca profundidad', 'Fija centrales', 'Descarga de cara', 'Dominante en juego aéreo', 'Buen rematador', 'Genera faltas'],
    vulnerability: ['Necesita muchas ocasiones', 'Poco trabajo defensivo', 'Sufre en apoyos'],
    trend: ['Cae a bandas', 'Ataca primer palo', 'Ataca segundo palo', 'Presiona centrales', 'Siempre viene al apoyo', 'Ataca intervalo lateral-central', 'Ataca segundo balón'],
  },
};

const specificFamily = {
  goalkeeper: 'goalkeeper', sweeper_keeper: 'goalkeeper',
  centre_back: 'centre_back', right_centre_back: 'centre_back', left_centre_back: 'centre_back', libero: 'centre_back',
  right_back: 'fullback', left_back: 'fullback', right_wing_back: 'fullback', left_wing_back: 'fullback',
  holding_midfield: 'midfielder', defensive_midfield: 'midfielder', central_midfield: 'midfielder', right_central_midfield: 'midfielder', left_central_midfield: 'midfielder', attacking_midfield: 'midfielder', right_midfield: 'midfielder', left_midfield: 'midfielder',
  right_winger: 'winger', left_winger: 'winger',
  second_striker: 'forward', centre_forward: 'forward', mobile_forward: 'forward', target_forward: 'forward',
};

export const getScoutingTraitFamily = (specificPosition, naturalPosition) => specificFamily[specificPosition]
  || (naturalPosition === 'goalkeeper' ? 'goalkeeper' : naturalPosition === 'defender' ? 'centre_back' : naturalPosition === 'midfielder' ? 'midfielder' : naturalPosition === 'forward' ? 'forward' : 'midfielder');

export const getPlayerTraitOptions = ({ specificPosition, naturalPosition, category }) => {
  const family = getScoutingTraitFamily(specificPosition, naturalPosition);
  return PLAYER_SCOUTING_TRAITS[family]?.[category] || [];
};

