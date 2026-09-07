const isBlankMinutes = (value) => (
  value === null
  || value === undefined
  || String(value).trim() === ''
);

export const resolveStatsWorkingMinutes = ({
  role = '',
  minutes = '',
  substituteMinutes = 0,
} = {}) => {
  const normalizedSubstituteMinutes = Number(substituteMinutes);
  if (Number.isFinite(normalizedSubstituteMinutes) && normalizedSubstituteMinutes > 0) {
    return {
      value: normalizedSubstituteMinutes,
      isUnconfirmedStarterValue: false,
    };
  }

  if (!isBlankMinutes(minutes)) {
    return {
      value: minutes,
      isUnconfirmedStarterValue: false,
    };
  }

  if (String(role).trim().toLocaleLowerCase('es-ES') === 'titular') {
    return {
      value: 90,
      isUnconfirmedStarterValue: true,
    };
  }

  return {
    value: '',
    isUnconfirmedStarterValue: false,
  };
};
