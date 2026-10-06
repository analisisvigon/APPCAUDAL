import { formatTrainingTaskPlayers, formatTrainingTaskSpace, getTrainingTaskStageLabel, getTrainingTaskTypeDefinition } from './trainingTasks.js';

export const formatTrainingTaskCardStages = (stageKeys = []) => {
  const labels = stageKeys.map(getTrainingTaskStageLabel);
  if (labels.length <= 2) return labels.join(' · ');
  return `${labels.slice(0, 2).join(' · ')} · +${labels.length - 2}`;
};

export const buildTrainingTaskCardPresentation = (task = {}, currentUserId = '') => {
  const players = formatTrainingTaskPlayers(task);
  const duration = Number(task.durationMinutes) > 0 ? `${Number(task.durationMinutes)}'` : '';
  const space = task.spaceWidthM && task.spaceLengthM ? formatTrainingTaskSpace(task) : '';
  const rating = Number(task.ratingCount) > 0 && Number.isFinite(Number(task.ratingAverage))
    ? `${Number(task.ratingAverage).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${Number(task.ratingCount)})`
    : '';
  return {
    type: getTrainingTaskTypeDefinition(task.taskType),
    stages: formatTrainingTaskCardStages(task.stageKeys),
    players: players === 'Sin número específico' ? '' : players,
    duration,
    space,
    summary: String(task.objective || task.description || '').trim(),
    variants: String(task.variants || '').trim() ? 'Con variantes' : '',
    rating,
    feedback: Number(task.feedbackCount) > 0 ? `${Number(task.feedbackCount)} ${Number(task.feedbackCount) === 1 ? 'registro POST' : 'registros POST'}` : '',
    ownership: task.author_user_id === currentUserId ? 'Mía' : 'Compartida conmigo',
  };
};
