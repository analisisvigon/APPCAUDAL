const cleanId = (value) => String(value || '').trim();

export const normalizeCaptainOrderIds = (ids = []) => [...new Set(ids.map(cleanId).filter(Boolean))];

export const moveCaptainOrderId = (ids = [], index, offset) => {
  const order = normalizeCaptainOrderIds(ids);
  const target = Number(index) + Number(offset);
  if (!Number.isInteger(target) || index < 0 || index >= order.length || target < 0 || target >= order.length) return order;
  [order[index], order[target]] = [order[target], order[index]];
  return order;
};

export const removeCaptainOrderId = (ids = [], index) => normalizeCaptainOrderIds(ids)
  .filter((_, currentIndex) => currentIndex !== Number(index));

export const replaceCaptainOrderId = (ids = [], index, playerId) => {
  const order = normalizeCaptainOrderIds(ids);
  const nextId = cleanId(playerId);
  if (!nextId || index < 0 || index >= order.length) return order;
  const existingIndex = order.indexOf(nextId);
  if (existingIndex >= 0 && existingIndex !== index) return order;
  order[index] = nextId;
  return normalizeCaptainOrderIds(order);
};

export const appendCaptainOrderId = (ids = [], playerId) => normalizeCaptainOrderIds([...ids, playerId]);
