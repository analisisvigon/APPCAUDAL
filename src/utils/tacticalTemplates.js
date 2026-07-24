import { getFootballRoleFamily } from './rivalTactics.js';

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const parseSystemLines = (system, outfieldCount) => {
  const lines = String(system || '')
    .match(/\d+/g)
    ?.map(Number)
    .filter((value) => Number.isInteger(value) && value > 0);
  if (lines?.reduce((total, value) => total + value, 0) === outfieldCount) return lines;
  return outfieldCount === 10 ? [4, 4, 2] : [outfieldCount];
};

const getRoleSide = (role, x) => {
  const normalized = normalizeText(role);
  if (/izquier|_li$|^li_|_ei$|^ei_/.test(normalized)) return 'left';
  if (/derech|_ld$|^ld_|_ed$|^ed_/.test(normalized)) return 'right';
  if (Number(x) < 42) return 'left';
  if (Number(x) > 58) return 'right';
  return 'center';
};

const getLineName = (lineIndex, lineCount) => {
  if (lineIndex === 0) return 'defensive';
  if (lineIndex === lineCount - 1) return 'attack';
  return 'midfield';
};

export const buildSemanticRoleDescriptors = (team, system, formationSlots = []) => {
  const sortedSlots = [...formationSlots]
    .map((slot, fallbackSlot) => ({
      ...slot,
      slot: Number.isInteger(Number(slot?.slot)) ? Number(slot.slot) : fallbackSlot,
    }))
    .sort((left, right) => Number(left.slot) - Number(right.slot));
  if (!sortedSlots.length) return [];

  const descriptors = [{
    team,
    slot: sortedSlots[0].slot,
    role: normalizeText(sortedSlots[0].role || 'Portero'),
    roleFamily: 'goalkeeper',
    line: 'goalkeeper',
    side: 'center',
    ordinal: 1,
    baseX: Number(sortedSlots[0].x ?? 50),
    baseY: Number(sortedSlots[0].y ?? 89),
  }];
  const outfieldSlots = sortedSlots.slice(1);
  const lines = parseSystemLines(system, outfieldSlots.length);
  let offset = 0;

  lines.forEach((lineSize, lineIndex) => {
    const lineSlots = outfieldSlots
      .slice(offset, offset + lineSize)
      .sort((left, right) => Number(left.x ?? 50) - Number(right.x ?? 50));
    const occurrenceByKey = new Map();
    lineSlots.forEach((slot) => {
      const role = normalizeText(slot.role || 'Jugador');
      const roleFamily = getFootballRoleFamily(slot.role || '');
      const side = getRoleSide(slot.role, slot.x);
      const line = getLineName(lineIndex, lines.length);
      const occurrenceKey = `${role}:${line}:${side}`;
      const ordinal = (occurrenceByKey.get(occurrenceKey) || 0) + 1;
      occurrenceByKey.set(occurrenceKey, ordinal);
      descriptors.push({
        team,
        slot: slot.slot,
        role,
        roleFamily,
        line,
        side,
        ordinal,
        baseX: Number(slot.x ?? 50),
        baseY: Number(slot.y ?? 50),
      });
    });
    offset += lineSize;
  });

  return descriptors;
};

const getPosition = (positions, team, slot, descriptor) => {
  const saved = positions?.[`${team}:${slot}`];
  const x = Number(saved?.x);
  const y = Number(saved?.y);
  return {
    x: Number.isFinite(x) ? x : descriptor.baseX,
    y: Number.isFinite(y) ? y : descriptor.baseY,
  };
};

export const serializeSemanticPlayerPositions = ({
  playerPositions = {},
  rivalSystem,
  caudalSystem,
  rivalFormationSlots = [],
  caudalFormationSlots = [],
}) => {
  const descriptors = [
    ...buildSemanticRoleDescriptors('rival', rivalSystem, rivalFormationSlots),
    ...buildSemanticRoleDescriptors('caudal', caudalSystem, caudalFormationSlots),
  ];
  return {
    version: 1,
    entries: descriptors.map((descriptor) => ({
      team: descriptor.team,
      role: descriptor.role,
      roleFamily: descriptor.roleFamily,
      line: descriptor.line,
      side: descriptor.side,
      ordinal: descriptor.ordinal,
      ...getPosition(playerPositions, descriptor.team, descriptor.slot, descriptor),
    })),
  };
};

const compatibleFamilies = {
  goalkeeper: new Set(['goalkeeper']),
  centerback: new Set(['centerback', 'defender', 'fullback', 'pivot']),
  fullback: new Set(['fullback', 'wingback', 'defender', 'centerback', 'winger']),
  wingback: new Set(['wingback', 'fullback', 'winger', 'defender']),
  pivot: new Set(['pivot', 'midfielder', 'centerback']),
  midfielder: new Set(['midfielder', 'pivot', 'attacking_midfielder']),
  attacking_midfielder: new Set(['attacking_midfielder', 'midfielder', 'winger', 'striker']),
  winger: new Set(['winger', 'attacking_midfielder', 'wingback', 'striker']),
  striker: new Set(['striker', 'attacker', 'winger', 'attacking_midfielder']),
};

const areFamiliesCompatible = (source, target) => (
  source === target
  || compatibleFamilies[source]?.has(target)
  || compatibleFamilies[target]?.has(source)
);

const getMatchTier = (source, target) => {
  if (source.role === target.role && source.side === target.side) return 1;
  if (source.roleFamily === target.roleFamily && source.side === target.side) return 2;
  if (source.line === target.line && areFamiliesCompatible(source.roleFamily, target.roleFamily)) return 3;
  return 4;
};

const coordinateDistance = (source, target) => (
  Math.hypot(Number(source.x ?? 50) - target.baseX, Number(source.y ?? 50) - target.baseY)
);

export const adaptSemanticPlayerPositions = ({
  semanticPositions,
  rivalSystem,
  caudalSystem,
  rivalFormationSlots = [],
  caudalFormationSlots = [],
}) => {
  const entries = Array.isArray(semanticPositions?.entries) ? semanticPositions.entries : [];
  const targetsByTeam = {
    rival: buildSemanticRoleDescriptors('rival', rivalSystem, rivalFormationSlots),
    caudal: buildSemanticRoleDescriptors('caudal', caudalSystem, caudalFormationSlots),
  };
  const usedSlots = { rival: new Set(), caudal: new Set() };
  const playerPositions = {};
  const warnings = [];

  entries.forEach((entry) => {
    const team = entry?.team === 'caudal' ? 'caudal' : entry?.team === 'rival' ? 'rival' : '';
    if (!team) {
      warnings.push('Se omitió una posición sin equipo táctico válido.');
      return;
    }
    const candidates = targetsByTeam[team]
      .filter((target) => !usedSlots[team].has(target.slot))
      .map((target) => ({
        target,
        tier: getMatchTier(entry, target),
        distance: coordinateDistance(entry, target),
      }))
      .sort((left, right) => left.tier - right.tier || left.distance - right.distance);
    const selected = candidates[0];
    if (!selected) {
      warnings.push(`No hay un puesto disponible para ${team} · ${entry.role || entry.roleFamily || 'rol sin identificar'}.`);
      return;
    }
    usedSlots[team].add(selected.target.slot);
    playerPositions[`${team}:${selected.target.slot}`] = {
      x: Number(entry.x),
      y: Number(entry.y),
    };
    if (selected.tier === 4) {
      warnings.push(
        `${team === 'rival' ? 'Rival' : 'Caudal'}: ${entry.role || entry.roleFamily || 'rol'} se asignó por proximidad estructural a ${selected.target.role}.`
      );
    }
  });

  Object.entries(targetsByTeam).forEach(([team, targets]) => {
    targets.forEach((target) => {
      if (usedSlots[team].has(target.slot)) return;
      playerPositions[`${team}:${target.slot}`] = {
        x: target.baseX,
        y: target.baseY,
      };
      warnings.push(
        `${team === 'rival' ? 'Rival' : 'Caudal'}: ${target.role} no tenía equivalencia y queda disponible para ajuste manual.`
      );
    });
  });

  return { playerPositions, warnings: Array.from(new Set(warnings)) };
};

export const serializeTemplateArrows = (arrows = []) => (
  arrows
    .filter((arrow) => arrow && ['pass', 'movement'].includes(arrow.type) && arrow.start && arrow.end)
    .map((arrow) => ({
      type: arrow.type,
      start: { x: Number(arrow.start.x), y: Number(arrow.start.y) },
      end: { x: Number(arrow.end.x), y: Number(arrow.end.y) },
    }))
    .filter((arrow) => [arrow.start.x, arrow.start.y, arrow.end.x, arrow.end.y].every(Number.isFinite))
);

export const instantiateTemplateArrows = (arrows = [], createId) => (
  serializeTemplateArrows(arrows).map((arrow) => ({
    ...arrow,
    id: createId(),
    start: { ...arrow.start },
    end: { ...arrow.end },
  }))
);
