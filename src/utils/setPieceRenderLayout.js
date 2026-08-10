const PARTICIPANT_TYPES = new Set(['player', 'opponent']);

const RENDER_LAYER = Object.freeze({
  zone: 10,
  arrow: 20,
  dashed_arrow: 20,
  curved_arrow: 20,
  double_arrow: 20,
  block: 30,
  ball: 40,
  opponent: 50,
  player: 60,
  text_box: 70,
  text: 80,
});

export const getSetPieceRenderLayer = (element) => RENDER_LAYER[element?.type] ?? 35;

export const sortSetPieceElementsForRender = (elements = []) =>
  (Array.isArray(elements) ? elements : [])
    .map((element, sourceIndex) => ({ element, sourceIndex }))
    .sort((left, right) => getSetPieceRenderLayer(left.element) - getSetPieceRenderLayer(right.element) || left.sourceIndex - right.sourceIndex)
    .map(({ element }) => element);

export const findCrowdedSetPieceParticipants = (elements = [], minimumDistance = 4.2) => {
  const participants = (Array.isArray(elements) ? elements : []).filter((element) => PARTICIPANT_TYPES.has(element?.type));
  const crowded = [];
  for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < participants.length; rightIndex += 1) {
      const left = participants[leftIndex];
      const right = participants[rightIndex];
      const distance = Math.hypot(Number(left.x || 0) - Number(right.x || 0), Number(left.y || 0) - Number(right.y || 0));
      if (distance < minimumDistance) crowded.push({ leftId: left.id, rightId: right.id, distance });
    }
  }
  return crowded;
};

export const createSetPieceThumbnailLayers = (visibleLayers = {}) => ({
  ...visibleLayers,
  dorsals: true,
  abbreviations: false,
  roles: false,
  chronology: false,
  zones: visibleLayers.zones ?? true,
  texts: false,
});
