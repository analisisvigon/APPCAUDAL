import { getTacticalRoleSide } from './tacticalOrientation.js';

const SUPPORTED_PHASES = new Set(['defensive', 'offensive']);

const finitePosition = (value) => {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const normalizeRole = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const getLateralRoleFamily = (role) => {
  const normalized = normalizeRole(role);
  if (/lateral|carrilero/.test(normalized)) return 'fullback';
  if (/central/.test(normalized)) return 'centre_back';
  if (/extremo/.test(normalized)) return 'winger';
  if (/interior|mediocentro/.test(normalized)) return 'midfielder';
  if (/delantero/.test(normalized)) return 'forward';
  return '';
};

export const buildDefensiveOffensiveRivalBoard = ({
  phase,
  rivalSlots = [],
  savedPositions = null,
  previewPositions = null,
  getFallbackPosition = (slot) => slot?.coordinates,
}) => {
  if (!SUPPORTED_PHASES.has(phase)) return [];

  return rivalSlots.map((slot, fallbackIndex) => {
    const slotIndex = Number.isInteger(Number(slot?.slot)) ? Number(slot.slot) : fallbackIndex;
    const boardKey = `rival:${slotIndex}`;
    const savedPosition = finitePosition(savedPositions?.[boardKey]);
    const previewPosition = finitePosition(previewPositions?.[boardKey]);
    const fallbackPosition = finitePosition(getFallbackPosition(slot)) || { x: 50, y: 50 };
    const position = savedPosition || previewPosition || fallbackPosition;
    return {
      boardKey,
      slot: slotIndex,
      role: slot?.role || '',
      player: slot?.player || null,
      position,
      positionSource: savedPosition ? 'saved' : previewPosition ? 'preview' : 'fallback',
    };
  });
};

export const getLegacyDefensiveOffensiveOrientation = (boardEntries = []) => {
  const entriesByFamily = boardEntries.reduce((groups, entry) => {
    const normalizedRole = normalizeRole(entry?.role);
    if (!/izquier|derech/.test(normalizedRole)) return groups;
    const family = getLateralRoleFamily(entry?.role);
    const tacticalSide = getTacticalRoleSide(entry?.role, entry?.position?.x);
    if (!family || !['right', 'left'].includes(tacticalSide) || !finitePosition(entry?.position)) return groups;
    groups[family] ||= {};
    groups[family][tacticalSide] = entry;
    return groups;
  }, {});

  return Object.entries(entriesByFamily).flatMap(([family, entries]) => {
    const right = entries.right;
    const left = entries.left;
    if (!right || !left || Number(right.position.x) < Number(left.position.x)) return [];
    return [{
      family,
      right,
      left,
      expected: 'right_role_on_visual_left',
    }];
  });
};

export const hasLegacyDefensiveOffensiveOrientation = (boardEntries = []) => (
  getLegacyDefensiveOffensiveOrientation(boardEntries).length > 0
);
