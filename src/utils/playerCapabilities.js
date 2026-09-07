export const canPlayerManageFines = (identity) => (
  identity?.kind === 'player'
  && identity?.membership?.role === 'player'
  && identity?.capabilities?.canManageFines === true
);

export const guardPlayerSection = (requestedSection, canManageFines) => (
  requestedSection === 'fines-management' && canManageFines !== true
    ? 'home'
    : requestedSection
);
