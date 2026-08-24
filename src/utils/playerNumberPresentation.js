export const getPlayerNumberLabel = (value) => {
  const label = String(value ?? '').trim();
  if (!label || label === '0' || /^(?:null|undefined)$/i.test(label)) return '';
  return label;
};
