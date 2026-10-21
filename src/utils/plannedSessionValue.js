export const readPlannedSessionValue = (session) => ({
  supported: Object.prototype.hasOwnProperty.call(session || {}, 'session_value'),
  value: session?.session_value == null ? '' : String(session.session_value),
});

export const parsePlannedSessionValue = (input) => {
  const raw = input == null ? '' : String(input).trim();
  if (!raw) return null;
  const value = Number(raw.replace(',', '.'));
  if (!/^\d+(?:[.,]\d+)?$/.test(raw) || !Number.isFinite(value) || value < 0 || value > 10) {
    const error = new Error('VALOR debe ser un número entre 0 y 10; puedes usar coma o punto decimal.');
    error.code = '22023';
    throw error;
  }
  return value;
};
