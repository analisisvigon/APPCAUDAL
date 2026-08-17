import assert from 'node:assert/strict';
import {
  formatMatchCalendarRound,
  getMatchCalendarEventPriority,
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

console.log('matchCalendarCard tests passed');
