export const TRAINING_TASK_ADVANCED_FILTER_KEYS = Object.freeze([
  'ratingMin', 'taskCode', 'players', 'objective', 'gamePhase', 'duration',
]);

export const countActiveTrainingTaskAdvancedFilters = (filters = {}) => (
  TRAINING_TASK_ADVANCED_FILTER_KEYS.reduce((count, key) => (
    filters[key] === '' || filters[key] === null || filters[key] === undefined ? count : count + 1
  ), 0)
);
