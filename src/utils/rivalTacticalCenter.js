const safeArray = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();
const normalize = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const confidenceRank = { Alta: 0, Media: 1, Baja: 2 };

export const RIVAL_TACTICAL_SUGGESTED_QUESTIONS = Object.freeze([
  '¿Cómo presionamos su salida?',
  '¿Dónde podemos hacerles daño?',
  '¿Cómo defender su juego directo?',
  '¿Qué entrenarías esta semana?',
  '¿Cómo atacamos su bloque medio?',
  '¿Qué riesgos tiene nuestro sistema?',
  '¿Qué cambiarías durante el partido?',
  '¿Qué información me falta?',
]);

export const COACH_MODE_DISCLAIMER = 'Propuesta táctica basada en conocimiento futbolístico. No confirmada mediante evidencias del rival.';

const getCoverage = (model, key) => safeArray(model?.evidenceCoverage).find((row) => row.key === key) || { count: 0, available: false };
const getBehavior = (model, key) => safeArray(model?.behaviors).find((row) => row.key === key) || null;

export const getRivalScoutingMaturity = (model = {}) => {
  const availableSources = safeArray(model.evidenceCoverage).filter((source) => source.available).length;
  const behaviors = safeArray(model.behaviors).filter((behavior) => clean(behavior.summary)).length;
  const recommendations = safeArray(model.recommendations?.defense).length + safeArray(model.recommendations?.attack).length;
  const analyzedMatches = Number(model.summary?.analyzedMatchCount || 0);
  if (analyzedMatches >= 3 && availableSources >= 4 && behaviors >= 3 && recommendations >= 3) {
    return {
      key: 'consolidated',
      label: 'Análisis consolidado',
      detail: `${availableSources} fuentes · ${behaviors} fases descritas · ${analyzedMatches} partidos analizados`,
    };
  }
  if (
    (availableSources >= 2 && (behaviors >= 1 || recommendations >= 1))
    || analyzedMatches >= 2
  ) {
    return {
      key: 'partial',
      label: 'Análisis parcial',
      detail: `${availableSources} fuentes · ${behaviors} fases descritas · ${analyzedMatches} partidos analizados`,
    };
  }
  return {
    key: 'initial',
    label: 'Información inicial',
    detail: `${availableSources} fuentes · ${behaviors} fases descritas · ${analyzedMatches} partidos analizados`,
  };
};

export const buildRivalMissingInformation = (model = {}) => {
  const missing = [];
  const add = (id, text, destination, destinationLabel) => {
    if (!missing.some((item) => item.id === id)) missing.push({ id, text, destination, destinationLabel });
  };
  if (!clean(getBehavior(model, 'build_up')?.summary)) {
    add('build-up', 'No existe información sobre la salida de balón.', 'profile', 'Perfil colectivo');
  }
  if (!clean(getBehavior(model, 'set_piece')?.summary) && !getCoverage(model, 'board').count) {
    add('set-piece', 'No hay jugadas ABP registradas.', 'board:set_piece', 'Pizarra · ABP');
  }
  if (!getCoverage(model, 'connections').count) {
    add('connections', 'No existen conexiones tácticas registradas.', 'board:connections', 'Pizarra · Conexiones');
  }
  if (!getCoverage(model, 'video').count) {
    add('video', 'No hay vídeo asociado.', 'video', 'Vídeo del partido');
  }
  if (!clean(getBehavior(model, 'transition')?.summary)) {
    add('transitions', 'No existen evidencias de transiciones.', 'board:transition', 'Pizarra · Transiciones');
  }
  const analyzedMatchCount = Number(model.summary?.analyzedMatchCount || 0);
  if (analyzedMatchCount === 0) {
    add('matches', 'No existen partidos analizados.', 'evidences', 'Evidencias');
  } else if (analyzedMatchCount === 1) {
    add('matches', 'Solo existe un partido analizado.', 'evidences', 'Evidencias');
  }
  return missing;
};

const mergeSources = (rows) => [...new Set(safeArray(rows).flatMap((row) => safeArray(row?.sources)))];
const mergeEvidenceIds = (rows) => [...new Set(safeArray(rows).flatMap((row) => safeArray(row?.evidenceIds)))];
const confidenceFromRows = (rows) => safeArray(rows)
  .map((row) => row?.confidence)
  .filter(Boolean)
  .sort((left, right) => (confidenceRank[left] ?? 9) - (confidenceRank[right] ?? 9))[0] || 'Baja';

const findRecommendations = (model, question) => {
  const q = normalize(question);
  const defense = safeArray(model?.recommendations?.defense);
  const attack = safeArray(model?.recommendations?.attack);
  if (/hacerles dano|donde.*dano|atacamos|bloque medio/.test(q)) return attack;
  if (/juego directo/.test(q)) return defense.filter((row) => /direct|segunda jugada|caida/i.test(`${row.id} ${row.action} ${row.rationale}`));
  if (/presionamos.*salida|presionar.*salida/.test(q)) return [
    ...attack.filter((row) => /salida|construccion|presion/i.test(`${row.id} ${row.action} ${row.rationale}`)),
    ...defense.filter((row) => /salida|interior|pivote/i.test(`${row.id} ${row.action} ${row.rationale}`)),
  ];
  if (/riesgo/.test(q)) return defense;
  if (/entrenarias|esta semana|cambiarias|durante el partido/.test(q)) return [...defense, ...attack];
  return [...defense, ...attack];
};

const evidenceAnswer = ({ question, model, missingInformation }) => {
  const q = normalize(question);
  if (/informacion.*falta/.test(q)) {
    const rows = safeArray(missingInformation);
    return {
      mode: 'evidence',
      reading: rows.length ? rows.map((item) => item.text).join(' ') : 'Las fuentes colectivas principales están registradas.',
      proposal: rows.length ? `Completar primero: ${rows.slice(0, 3).map((item) => item.destinationLabel).join(', ')}.` : 'Mantener actualizadas las evidencias después de cada partido.',
      risks: rows.length ? 'Las conclusiones sobre las áreas sin datos deben mantenerse como hipótesis.' : 'No se detectan vacíos estructurales en las fuentes principales.',
      alternative: 'Usar el modo Criterio del entrenador si necesitas una hipótesis general claramente separada de la evidencia.',
      sources: [],
      confidence: rows.length ? 'Baja' : 'Media',
      evidenceIds: [],
      disclaimer: '',
    };
  }

  const recommendations = findRecommendations(model, question);
  const primary = recommendations[0];
  if (!primary) {
    return {
      mode: 'evidence',
      reading: 'No existen evidencias registradas suficientes para responder a esta pregunta.',
      proposal: 'Completar las fuentes relacionadas antes de convertir una hipótesis en consigna.',
      risks: 'Responder tácticamente sin datos del rival podría producir una conclusión no confirmada.',
      alternative: 'Cambiar al modo Criterio del entrenador para obtener una propuesta general claramente identificada.',
      sources: [],
      confidence: 'Baja',
      evidenceIds: [],
      disclaimer: '',
    };
  }

  const related = recommendations.slice(0, 3);
  const riskDuel = safeArray(model?.duels).find((duel) => (
    duel.type === 'Riesgo' && safeArray(duel.evidenceIds).some((id) => safeArray(primary.evidenceIds).includes(id))
  ));
  const alternative = related[1];
  return {
    mode: 'evidence',
    reading: primary.rationale,
    proposal: related.map((row) => row.action).join(' '),
    risks: riskDuel
      ? `Riesgo colectivo identificado: ${riskDuel.relation}.`
      : 'No existe un riesgo adicional suficientemente respaldado por las evidencias registradas.',
    alternative: alternative
      ? alternative.action
      : 'No existe una alternativa adicional respaldada por evidencias registradas.',
    sources: mergeSources(related),
    confidence: confidenceFromRows(related),
    evidenceIds: mergeEvidenceIds(related),
    disclaimer: '',
  };
};

const coachTemplates = [
  {
    pattern: /presionamos.*salida|presionar.*salida/,
    reading: 'Una presión sobre la salida debe decidir qué pase concede y qué recepción quiere impedir.',
    proposal: 'Orientar la primera construcción hacia banda, cerrar el apoyo interior y saltar cuando el receptor reciba de espaldas.',
    risks: 'Saltar sin cobertura puede liberar al tercer hombre o dejar espacio detrás de la primera línea.',
    alternative: 'Replegar a bloque medio si superan la primera presión y volver a activar el salto ante un pase hacia atrás.',
  },
  {
    pattern: /hacerles dano|donde.*dano/,
    reading: 'El plan ofensivo debe crear una ventaja concreta antes de acelerar la jugada.',
    proposal: 'Atraer por dentro, fijar la última línea y buscar el cambio de orientación hacia un atacante preparado para el uno contra uno.',
    risks: 'Perder el balón con demasiados jugadores por delante puede exponer la transición defensiva.',
    alternative: 'Temporizar y reiniciar por el lado contrario si no aparece una recepción limpia tras la atracción.',
  },
  {
    pattern: /juego directo/,
    reading: 'El juego directo exige defender el envío, la zona de caída y la acción posterior como una misma secuencia.',
    proposal: 'Proteger el duelo aéreo, cerrar al posible receptor de la prolongación y preparar al mediocampo para la segunda jugada.',
    risks: 'Hundir demasiados jugadores alrededor del primer duelo puede conceder el rechace frontal.',
    alternative: 'Temporizar con la línea defensiva y priorizar la segunda jugada cuando no sea posible disputar el primer balón con ventaja.',
  },
  {
    pattern: /entrenarias|esta semana/,
    reading: 'La semana debe traducir el plan de partido en comportamientos repetibles y medibles.',
    proposal: 'Entrenar la presión inicial, la respuesta tras superar esa presión y una tarea específica de transición con las distancias previstas para competir.',
    risks: 'Acumular demasiadas consignas reduce la claridad y dificulta reconocer los desencadenantes durante el partido.',
    alternative: 'Reducir el plan a una consigna con balón, una sin balón y una de transición si el tiempo de entrenamiento es limitado.',
  },
  {
    pattern: /bloque medio/,
    reading: 'Un bloque medio suele exigir mover al rival antes de intentar progresar entre líneas.',
    proposal: 'Fijar por dentro, dar amplitud real y buscar al tercer hombre cuando una línea rival abandone su zona.',
    risks: 'Circular sin profundidad permite que el bloque bascule sin perder sus distancias.',
    alternative: 'Buscar una secuencia más directa sobre un apoyo avanzado si el rival no abandona su estructura.',
  },
  {
    pattern: /riesgo.*sistema/,
    reading: 'Los riesgos de un sistema dependen de las alturas, las distancias y los roles reales, no solo de su dibujo nominal.',
    proposal: 'Revisar qué jugadores protegen la pérdida, quién equilibra la amplitud y qué línea queda expuesta cuando el equipo presiona.',
    risks: 'Atribuir comportamientos automáticos al dibujo puede ocultar el problema real de coordinación.',
    alternative: 'Comparar dos escenarios de altura y ocupación manteniendo el mismo sistema de partida.',
  },
  {
    pattern: /cambiarias|durante el partido/,
    reading: 'Un cambio durante el partido debe responder a un comportamiento observado y no únicamente al resultado.',
    proposal: 'Definir un ajuste de presión, otro de ocupación ofensiva y el indicador concreto que activaría cada cambio.',
    risks: 'Modificar estructura y comportamientos a la vez puede dificultar identificar qué ajuste funcionó.',
    alternative: 'Mantener el sistema y cambiar primero una altura, una orientación o una responsabilidad individual.',
  },
  {
    pattern: /informacion.*falta/,
    reading: 'La calidad del plan depende de conocer comportamientos repetidos, no solo datos aislados.',
    proposal: 'Priorizar información sobre salida, transiciones, defensa del área, ABP y conexiones recurrentes.',
    risks: 'Completar campos sin observación real puede crear una falsa sensación de certeza.',
    alternative: 'Registrar una hipótesis como pendiente y validarla durante el primer tramo del siguiente partido observado.',
  },
];

const coachAnswer = (question) => {
  const template = coachTemplates.find((item) => item.pattern.test(normalize(question))) || {
    reading: 'La pregunta requiere separar el comportamiento que se quiere provocar de la zona que debe protegerse.',
    proposal: 'Definir una consigna observable, el momento exacto para ejecutarla y la cobertura necesaria si no funciona.',
    risks: 'Una propuesta demasiado general puede ser difícil de reconocer y corregir durante el partido.',
    alternative: 'Preparar una segunda respuesta más conservadora basada en reducir espacios y recuperar la estructura.',
  };
  return {
    mode: 'coach',
    ...template,
    sources: [],
    confidence: 'Baja',
    evidenceIds: [],
    disclaimer: COACH_MODE_DISCLAIMER,
  };
};

export const answerRivalTacticalQuestion = ({
  question,
  mode = 'evidence',
  model = {},
  missingInformation = [],
} = {}) => {
  const safeQuestion = clean(question);
  if (!safeQuestion) return null;
  return mode === 'coach'
    ? coachAnswer(safeQuestion)
    : evidenceAnswer({ question: safeQuestion, model, missingInformation });
};
