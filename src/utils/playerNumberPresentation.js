export const getPlayerNumberLabel = (value) => {
  const label = String(value ?? '').trim();
  if (!label || label === '0' || /^(?:null|undefined)$/i.test(label)) return '';
  return label;
};

export const formatPlayerNumberName = (number, name) => {
  const numberLabel = getPlayerNumberLabel(number);
  const nameLabel = String(name || '').trim();
  return numberLabel ? `${numberLabel} · ${nameLabel}` : nameLabel;
};
