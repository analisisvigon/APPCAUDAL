const toDateInputValue = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export const createTrainingTaskFeedbackDraft = (date = new Date()) => ({
  usedOn: toDateInputValue(date),
  rating: null,
  post: '',
});

export const normalizeTrainingTaskFeedback = (row = {}) => ({
  ...row,
  usedOn: row.used_on || '',
  rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
  post: row.post_text || '',
});

export const trainingTaskFeedbackToDraft = (feedback) => ({
  usedOn: feedback?.usedOn || feedback?.used_on || toDateInputValue(),
  rating: feedback?.rating === null || feedback?.rating === undefined ? null : Number(feedback.rating),
  post: feedback?.post || feedback?.post_text || '',
});

export const validateTrainingTaskFeedback = (draft = {}) => {
  const errors = {};
  const rating = draft.rating === '' || draft.rating === null || draft.rating === undefined
    ? null
    : Number(draft.rating);
  const post = String(draft.post || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.usedOn || ''))) errors.usedOn = 'Indica una fecha válida.';
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) errors.rating = 'La valoración debe estar entre 1 y 5.';
  if (post.length > 4000) errors.post = 'El POST no puede superar 4000 caracteres.';
  if (rating === null && !post) errors.post = 'Añade una valoración o un comentario.';
  return errors;
};

export const buildTrainingTaskFeedbackPayload = (draft, { taskId, clubId, authorUserId } = {}) => ({
  task_id: taskId,
  club_id: clubId,
  author_user_id: authorUserId,
  used_on: draft.usedOn,
  rating: draft.rating === '' || draft.rating === null || draft.rating === undefined ? null : Number(draft.rating),
  post_text: String(draft.post || '').trim() || null,
});

export const summarizeTrainingTaskRatings = (feedbackRows = []) => {
  const ratings = feedbackRows
    .map((row) => Number(row.rating))
    .filter((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5);
  if (!ratings.length) return { ratingAverage: null, ratingCount: 0 };
  return {
    ratingAverage: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
    ratingCount: ratings.length,
  };
};

export const sortTrainingTaskFeedback = (feedbackRows = []) => [...feedbackRows].sort((left, right) => (
  String(right.usedOn || right.used_on || '').localeCompare(String(left.usedOn || left.used_on || ''))
  || String(right.created_at || '').localeCompare(String(left.created_at || ''))
));
