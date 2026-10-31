export const BOARD_V11_ENABLED = import.meta.env?.VITE_PLANNED_BOARD_V11_ENABLED === 'true';

export const validMetres = (value) => value !== '' && value != null &&
  Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 500;

export const fieldIsMeasured = (field) => validMetres(field?.length_m) && validMetres(field?.width_m);

export const taskZoneMetres = (slot) => {
  const item = slot?.items?.find((entry) => entry.kind === 'library_task' &&
    validMetres(entry.working?.space_length_m ?? entry.snapshot?.source?.space_length_m ?? entry.preview?.space_length_m) &&
    validMetres(entry.working?.space_width_m ?? entry.snapshot?.source?.space_width_m ?? entry.preview?.space_width_m));
  if (!item) return null;
  const source = item.working || {};
  const original = item.snapshot?.source || item.preview || {};
  return { length_m: Number(source.space_length_m ?? original.space_length_m),
    width_m: Number(source.space_width_m ?? original.space_width_m) };
};

export const zoneFromMetres = (zone, field, metres) => {
  if (!fieldIsMeasured(field) || !validMetres(metres?.length_m) || !validMetres(metres?.width_m)) return null;
  const w = Number(metres.width_m) / Number(field.width_m) * 100;
  const h = Number(metres.length_m) / Number(field.length_m) * 100;
  if (w > 100 || h > 100) return null;
  return { ...zone, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10,
    x: Math.max(0, Math.min(zone.x, 100 - w)), y: Math.max(0, Math.min(zone.y, 100 - h)), provisional: false };
};

export const metresFromZone = (zone, field) => fieldIsMeasured(field)
  ? { length_m: Math.round(zone.h * Number(field.length_m) / 100 * 10) / 10,
    width_m: Math.round(zone.w * Number(field.width_m) / 100 * 10) / 10 } : null;

export const seededPlayerLayout = (seed, roster, positions, autoPlayerLayout) => {
  if (!seed?.formation_key || !roster.length) return [];
  const defaultById = new Map((seed.player_layout || []).map((row) => [row.player_id, row]));
  const generated = autoPlayerLayout(roster, positions, seed.formation_key);
  return generated.map((row) => defaultById.get(row.player_id) || row);
};
