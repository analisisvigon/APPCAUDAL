import assert from 'node:assert/strict';
import {
  formatMatchCalendarRound,
  getMatchCalendarEventPriority,
  getMatchCalendarGoalVideoUrl,
} from './matchCalendarCard.js';

assert.equal(formatMatchCalendarRound('3'), 'Jornada 3');
assert.equal(formatMatchCalendarRound(1), 'Jornada 1');
assert.equal(formatMatchCalendarRound('Ronda 1'), 'Ronda 1');
assert.equal(formatMatchCalendarRound('Eliminatoria semifinal'), 'Eliminatoria semifinal');
assert.equal(formatMatchCalendarRound(''), '');

assert.equal(getMatchCalendarEventPriority({ key: 'goal_for' }), 1);
assert.equal(getMatchCalendarEventPriority({ key: 'goal_against' }), 1);
assert.equal(getMatchCalendarEventPriority({ key: 'system_change' }), 2);
assert.equal(getMatchCalendarEventPriority({ key: 'red_card' }), 3);
assert.equal(getMatchCalendarEventPriority({ key: 'yellow_card' }), 4);
assert.equal(getMatchCalendarEventPriority({ key: 'injury' }), 5);

const detectVideoProvider = (url) => {
  if (!String(url).startsWith('https://')) return { kind: 'invalid' };
  return {
    kind: url.endsWith('.mp4') ? 'video' : url.includes('youtube') || url.includes('youtu.be') ? 'iframe' : 'external',
    originalUrl: url,
  };
};

const youtubeTimestampUrl = 'https://youtu.be/9HXdIkVodbM?t=10m12s';
assert.equal(
  getMatchCalendarGoalVideoUrl({ videoUrl: youtubeTimestampUrl }, detectVideoProvider),
  youtubeTimestampUrl,
  'A/E: conserva exactamente el clip del gol y su timestamp real'
);
assert.equal(
  getMatchCalendarGoalVideoUrl({ video_url: 'https://video.example/gol-17.mp4' }, detectVideoProvider),
  'https://video.example/gol-17.mp4',
  'F: admite los formatos externos que valida el detector canónico'
);
assert.equal(getMatchCalendarGoalVideoUrl({}, detectVideoProvider), '', 'B: un gol sin vídeo no genera acceso');
assert.equal(getMatchCalendarGoalVideoUrl({ videoUrl: 'url-invalida' }, detectVideoProvider), '', 'G: un enlace inválido no genera un botón roto');
assert.notEqual(
  getMatchCalendarGoalVideoUrl({ videoUrl: 'https://video.example/gol-1' }, detectVideoProvider),
  getMatchCalendarGoalVideoUrl({ videoUrl: 'https://video.example/gol-2' }, detectVideoProvider),
  'H: cada gol conserva su propio enlace'
);

console.log('matchCalendarCard tests passed');
