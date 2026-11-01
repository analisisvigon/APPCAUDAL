import { emptyDistribution } from './plannedSessionDistributions.js';

export const BOARD_V11_ENABLED = true;

export const validMetres = (value) => value !== '' && value != null &&
  Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 500 &&
  Number(Number(value).toFixed(2)) === Number(value);

export const fieldIsMeasured = (field) => validMetres(field?.length_m) && validMetres(field?.width_m);

export const initialBoardFromDefaults = (defaults) => {
  const field = { length_m: defaults?.field_length_m, width_m: defaults?.field_width_m };
  return { distribution: { ...emptyDistribution(), formation_key: defaults?.formation_key || null },
    fieldDimensions: fieldIsMeasured(field) ? field : { length_m: '', width_m: '' } };
};

export const applySessionBoardSeed = (distribution, savedRow, seed, roster, positions, autoPlayerLayout) =>
  (!savedRow || !roster.length) && seed?.formation_key && !savedRow?.formation_key
    ? { ...distribution, formation_key: seed.formation_key,
      player_layout: seededPlayerLayout(seed, roster, positions, autoPlayerLayout) }
    : distribution;
export const sameFieldDimensions = (left, right) => ['length_m', 'width_m'].every((key) => {
  const a = left?.[key], b = right?.[key];
  return (a === '' || a == null) && (b === '' || b == null) ||
    validMetres(a) && validMetres(b) && Number(a) === Number(b);
});

export const boardDefaultBlockReason = (kind, source) => {
  if (!source.sessionId) return 'Guarda primero la sesión.';
  if (!source.canEdit) return 'Necesitas una membresía owner o admin activa y una temporada abierta.';
  if (source.busy) return 'Espera a que termine la operación actual.';
  if (source.conflict || source.creationUncertain) return 'Recarga la sesión para comprobar la revisión actual.';
  if (kind === 'players') {
    if (source.boardsError) return 'Recarga la sesión: no se pudieron cargar las pizarras.';
    if (!source.rosterCount) return 'Congela primero la plantilla de esta sesión.';
    if (!source.formationKey) return 'Selecciona un sistema táctico.';
    if (source.playerCount !== source.rosterCount) return 'Completa la ubicación de toda la plantilla.';
    if (!source.playerSourceSaved) return 'Guarda primero la distribución de jugadores.';
    return '';
  }
  if (kind === 'field') {
    if (!fieldIsMeasured(source.fieldDimensions)) return 'Indica un largo y un ancho válidos para el campo.';
    if (!source.fieldSourceSaved) return 'Pulsa «Guardar dimensiones» antes de fijarlas como habituales.';
    return '';
  }
  return 'Configuración desconocida.';
};

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

export const normalizeExerciseDimensions = (rows = []) => Object.fromEntries(rows.map((row) => [row.slot_id,
  { length_m: row.length_m, width_m: row.width_m }]));

export const exerciseDimensionsKey = (dimensions = {}) => JSON.stringify(Object.entries(dimensions)
  .filter(([, value]) => value?.length_m !== '' || value?.width_m !== '')
  .map(([slotId, value]) => [slotId, value?.length_m == null ? '' : String(value.length_m),
    value?.width_m == null ? '' : String(value.width_m)])
  .sort(([left], [right]) => left.localeCompare(right)));

export const exerciseDimensionsPayload = (dimensions = {}, slots = []) => slots.flatMap((slot) => {
  const value = dimensions[slot.id];
  if (!value || (value.length_m === '' && value.width_m === '')) return [];
  if (!validMetres(value.length_m) || !validMetres(value.width_m))
    throw new Error(`Ejercicio ${slots.indexOf(slot) + 1}: indica largo y ancho positivos, hasta 500 m, o deja ambos vacíos.`);
  return [{ slot_id: slot.id, length_m: Number(value.length_m), width_m: Number(value.width_m) }];
});

export const seededPlayerLayout = (seed, roster, positions, autoPlayerLayout) => {
  if (!seed?.formation_key || !roster.length) return [];
  const defaultById = new Map((seed.player_layout || []).map((row) => [row.player_id, row]));
  const generated = autoPlayerLayout(roster, positions, seed.formation_key);
  return generated.map((row) => {
    const saved = defaultById.get(row.player_id);
    return saved ? { ...saved, placement: saved.placement === 'unplaced' ? 'unplaced' : 'manual' } : row;
  });
};
