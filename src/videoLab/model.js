export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function isMp4File(file) {
  return Boolean(file && (file.type === 'video/mp4' ||
    (!file.type && /\.mp4$/i.test(file.name || ''))));
}

export function validRange(start, end, duration) {
  return Number.isFinite(start) && Number.isFinite(end) &&
    Number.isFinite(duration) && duration > 0 &&
    start >= 0 && end <= duration && end - start >= 0.1;
}

export function createClip({ id, sourceId, title, start, end, duration }) {
  if (!id || !sourceId || !String(title || '').trim() ||
      !validRange(start, end, duration)) return null;
  return {
    id,
    sourceId,
    title: String(title).trim(),
    in: start,
    out: end,
    // Prepared for the future canonical-play link and tactical classification.
    tacticalLink: null,
    observations: '',
    annotations: [],
  };
}

export function updateClip(clip, patch, duration) {
  if (!clip) return null;
  const next = { ...clip, ...patch, id: clip.id, sourceId: clip.sourceId };
  if (!String(next.title || '').trim() || !validRange(next.in, next.out, duration)) {
    return null;
  }
  next.title = String(next.title).trim();
  return next;
}

export function containedVideoRect(containerWidth, containerHeight, videoWidth, videoHeight) {
  if (![containerWidth, containerHeight, videoWidth, videoHeight]
    .every((value) => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function normalizedPoint(clientX, clientY, bounds) {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    x: clamp((clientX - bounds.left) / bounds.width, 0, 1),
    y: clamp((clientY - bounds.top) / bounds.height, 0, 1),
  };
}

export function createAnnotation({ id, type, start, end, color, width, clip, at }) {
  if (!id || !clip || !['arrow', 'ellipse'].includes(type) || !start || !end) return null;
  if (![start.x, start.y, end.x, end.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return null;
  if (Math.hypot(end.x - start.x, end.y - start.y) < 0.01) return null;
  return {
    id,
    type,
    geometry: { x1: start.x, y1: start.y, x2: end.x, y2: end.y },
    style: { color, width },
    timing: {
      start: clamp(at, clip.in, clip.out),
      end: clip.out,
      freezeAt: null,
      animation: null,
    },
  };
}

export function annotationVisible(annotation, time) {
  return Number.isFinite(time) && time >= annotation.timing.start - 0.02 &&
    time <= annotation.timing.end + 0.02;
}
