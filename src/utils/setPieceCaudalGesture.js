const DRAG_THRESHOLD_PX = 6;

export const startSetPieceCaudalGesture = (pointerId, playerKey, clientX, clientY) => ({
  pointerId,
  playerKey,
  startX: clientX,
  startY: clientY,
  dragging: false,
});

export const advanceSetPieceCaudalGesture = (gesture, pointerId, clientX, clientY) => {
  if (!gesture || gesture.pointerId !== pointerId) return { gesture, startedDrag: false };
  const distance = Math.hypot(clientX - gesture.startX, clientY - gesture.startY);
  const dragging = gesture.dragging || distance >= DRAG_THRESHOLD_PX;
  return {
    gesture: dragging === gesture.dragging ? gesture : { ...gesture, dragging },
    startedDrag: dragging && !gesture.dragging,
  };
};

export const wasSetPieceCaudalDrag = (gesture) => Boolean(gesture?.dragging);
