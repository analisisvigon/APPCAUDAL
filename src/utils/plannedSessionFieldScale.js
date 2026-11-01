export const BOARD_V11_ENABLED = true;

export const validMetres = (value) => value !== '' && value != null &&
  Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 500 &&
  Number(Number(value).toFixed(2)) === Number(value);

export const fieldIsMeasured = (field) => validMetres(field?.length_m) && validMetres(field?.width_m);

export const taskZoneMetres = (slot) => {
  const valueOf = (item, key) => Object.prototype.hasOwnProperty.call(item.working || {}, key)
    ? item.working[key] : (item.snapshot?.source || item.preview || {})[key];
  const item = slot?.items?.find((entry) => entry.kind === 'library_task' &&
    validMetres(valueOf(entry, 'space_length_m')) && validMetres(valueOf(entry, 'space_width_m')));
  if (!item) return null;
  return { length_m: Number(valueOf(item, 'space_length_m')),
    width_m: Number(valueOf(item, 'space_width_m')) };
};

export const zoneFromMetres = (zone, field, metres) => {
  if (!fieldIsMeasured(field) || !validMetres(metres?.length_m) || !validMetres(metres?.width_m)) return null;
  const w = Math.round(Number(metres.width_m) / Number(field.width_m) * 1000000) / 10000;
  const h = Math.round(Number(metres.length_m) / Number(field.length_m) * 1000000) / 10000;
  if (w <= 0 || h <= 0 || w > 100 || h > 100) return null;
  return { ...zone, w, h,
    x: Math.max(0, Math.min(zone.x, 100 - w)), y: Math.max(0, Math.min(zone.y, 100 - h)), provisional: false };
};

export const metresFromZone = (zone, field) => fieldIsMeasured(field)
  ? { length_m: Math.round(zone.h * Number(field.length_m) / 100 * 100) / 100,
    width_m: Math.round(zone.w * Number(field.width_m) / 100 * 100) / 100 } : null;

export const seededPlayerLayout = (seed, roster, positions, autoPlayerLayout) => {
  if (!seed?.formation_key || !roster.length) return [];
  const defaultById = new Map((seed.player_layout || []).map((row) => [row.player_id, row]));
  const generated = autoPlayerLayout(roster, positions, seed.formation_key);
  return generated.map((row) => {
    const saved = defaultById.get(row.player_id);
    return saved ? { ...saved, placement: saved.placement === 'unplaced' ? 'unplaced' : 'manual' } : row;
  });
};
