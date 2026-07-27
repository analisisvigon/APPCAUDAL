export const TACTICAL_ATTACK_DIRECTIONS = Object.freeze({
  UP: 'up',
  DOWN: 'down',
});

export const TACTICAL_TEAM_ORIENTATION = Object.freeze({
  caudal: TACTICAL_ATTACK_DIRECTIONS.UP,
  rival: TACTICAL_ATTACK_DIRECTIONS.DOWN,
});

const normalizeRole = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const finiteCoordinate = (value, fallback = 50) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

const normalizeSlots = (formationSlots = []) => formationSlots
  .map((slot, sourceIndex) => ({
    ...slot,
    slot: Number.isInteger(Number(slot?.slot)) ? Number(slot.slot) : sourceIndex,
    x: finiteCoordinate(slot?.x),
    y: finiteCoordinate(slot?.y),
  }))
  .sort((left, right) => left.slot - right.slot)
  .map((slot, sourceIndex) => ({ ...slot, sourceIndex }));

export const getTacticalRoleSide = (role, fallbackX = 50) => {
  const normalized = normalizeRole(role);
  if (
    /izquier/.test(normalized)
    || /(^| )(li|ei|ci)( |$)/.test(normalized)
  ) return 'left';
  if (
    /derech/.test(normalized)
    || /(^| )(ld|ed|cd)( |$)/.test(normalized)
  ) return 'right';
  const x = finiteCoordinate(fallbackX);
  if (x < 42) return 'left';
  if (x > 58) return 'right';
  return 'center';
};

export const getVisualSlotForTacticalRole = ({
  role,
  fallbackX = 50,
  attacksToward = TACTICAL_ATTACK_DIRECTIONS.UP,
}) => {
  const tacticalSide = getTacticalRoleSide(role, fallbackX);
  if (tacticalSide === 'center') return 'visual_center';
  if (attacksToward === TACTICAL_ATTACK_DIRECTIONS.DOWN) {
    return tacticalSide === 'right' ? 'visual_left' : 'visual_right';
  }
  return tacticalSide === 'right' ? 'visual_right' : 'visual_left';
};

const isGoalkeeper = (slot, index) => (
  index === 0 || /portero|goalkeeper/.test(normalizeRole(slot?.role))
);

const groupOutfieldByLine = (slots, threshold = 8) => slots
  .filter((slot, index) => !isGoalkeeper(slot, index))
  .sort((left, right) => right.y - left.y || left.slot - right.slot)
  .reduce((groups, slot) => {
    const group = groups.find((candidate) => Math.abs(candidate.height - slot.y) <= threshold);
    if (group) {
      group.slots.push(slot);
      group.height = group.slots.reduce((total, item) => total + item.y, 0) / group.slots.length;
    } else {
      groups.push({ height: slot.y, slots: [slot] });
    }
    return groups;
  }, []);

const visualSideRank = {
  visual_left: 0,
  visual_center: 1,
  visual_right: 2,
};

const sortSlotsInVisualOrder = (lineSlots, attacksToward) => [...lineSlots].sort((left, right) => {
  const leftSide = getVisualSlotForTacticalRole({
    role: left.role,
    fallbackX: left.x,
    attacksToward,
  });
  const rightSide = getVisualSlotForTacticalRole({
    role: right.role,
    fallbackX: right.x,
    attacksToward,
  });
  const sideDifference = visualSideRank[leftSide] - visualSideRank[rightSide];
  if (sideDifference) return sideDifference;
  const lateralDirection = attacksToward === TACTICAL_ATTACK_DIRECTIONS.DOWN ? -1 : 1;
  return (left.x - right.x) * lateralDirection || left.slot - right.slot;
});

export const getTacticalVisualSlotAssignments = ({
  formationSlots = [],
  attacksToward = TACTICAL_ATTACK_DIRECTIONS.UP,
}) => {
  const slots = normalizeSlots(formationSlots);
  const assignments = new Map();
  const goalkeeper = slots.find(isGoalkeeper);
  if (goalkeeper) {
    assignments.set(goalkeeper.slot, {
      slot: goalkeeper.slot,
      visualSlot: goalkeeper.slot,
      sourceIndex: goalkeeper.sourceIndex,
      visualSourceIndex: goalkeeper.sourceIndex,
      visualSide: 'visual_center',
    });
  }

  groupOutfieldByLine(slots).forEach(({ slots: lineSlots }) => {
    const coordinateDonors = [...lineSlots].sort((left, right) => left.x - right.x || left.slot - right.slot);
    const slotsInVisualOrder = sortSlotsInVisualOrder(lineSlots, attacksToward);

    slotsInVisualOrder.forEach((slot, visualIndex) => {
      const donor = coordinateDonors[visualIndex];
      assignments.set(slot.slot, {
        slot: slot.slot,
        visualSlot: donor.slot,
        sourceIndex: slot.sourceIndex,
        visualSourceIndex: donor.sourceIndex,
        visualSide: getVisualSlotForTacticalRole({
          role: slot.role,
          fallbackX: slot.x,
          attacksToward,
        }),
      });
    });
  });

  return slots.map((slot) => assignments.get(slot.slot) || {
    slot: slot.slot,
    visualSlot: slot.slot,
    sourceIndex: slot.sourceIndex,
    visualSourceIndex: slot.sourceIndex,
    visualSide: 'visual_center',
  });
};

export const orientFormationSlotsForTacticalBoard = ({
  formationSlots = [],
  team = 'caudal',
  attacksToward = TACTICAL_TEAM_ORIENTATION[team] || TACTICAL_ATTACK_DIRECTIONS.UP,
}) => {
  const slots = normalizeSlots(formationSlots);
  const slotsBySourceIndex = new Map(slots.map((slot) => [slot.sourceIndex, slot]));
  const assignmentBySlot = new Map(getTacticalVisualSlotAssignments({
    formationSlots: slots,
    attacksToward,
  }).map((assignment) => [assignment.slot, assignment]));

  return slots.map((slot) => {
    const assignment = assignmentBySlot.get(slot.slot);
    const visualDonor = slotsBySourceIndex.get(assignment?.visualSourceIndex) || slot;
    return {
      ...slot,
      x: visualDonor.x,
      visualSlot: assignment?.visualSlot ?? slot.slot,
      visualSide: assignment?.visualSide || 'visual_center',
    };
  });
};

export const assignCoordinatesWithTacticalOrientation = ({
  team,
  formationSlots = [],
  coordinates = [],
}) => {
  const slots = normalizeSlots(formationSlots);
  const attacksToward = TACTICAL_TEAM_ORIENTATION[team] || TACTICAL_ATTACK_DIRECTIONS.UP;
  const assignedCoordinates = new Map();
  const goalkeeper = slots.find(isGoalkeeper);
  if (goalkeeper) {
    assignedCoordinates.set(goalkeeper.slot, coordinates[goalkeeper.sourceIndex] || { x: 50, y: 50 });
  }

  groupOutfieldByLine(slots).forEach(({ slots: lineSlots }) => {
    const coordinateDonors = lineSlots
      .map((slot) => ({
        coordinate: coordinates[slot.sourceIndex] || { x: 50, y: 50 },
        sourceIndex: slot.sourceIndex,
      }))
      .sort((left, right) => (
        finiteCoordinate(left.coordinate.x) - finiteCoordinate(right.coordinate.x)
        || left.sourceIndex - right.sourceIndex
      ));
    sortSlotsInVisualOrder(lineSlots, attacksToward).forEach((slot, visualIndex) => {
      assignedCoordinates.set(slot.slot, coordinateDonors[visualIndex]?.coordinate || { x: 50, y: 50 });
    });
  });

  return Object.fromEntries(slots.map((slot) => {
    const coordinate = assignedCoordinates.get(slot.slot) || coordinates[slot.sourceIndex] || { x: 50, y: 50 };
    return [
      `${team}:${slot.slot}`,
      {
        x: finiteCoordinate(coordinate.x),
        y: finiteCoordinate(coordinate.y),
      },
    ];
  }));
};

const reassignTeamPositionsToVisualSlots = ({
  team,
  formationSlots,
  playerPositions,
}) => {
  const slots = normalizeSlots(formationSlots);
  const attacksToward = TACTICAL_TEAM_ORIENTATION[team] || TACTICAL_ATTACK_DIRECTIONS.UP;
  const nextPositions = { ...playerPositions };

  groupOutfieldByLine(slots).forEach(({ slots: lineSlots }) => {
    const positionDonors = lineSlots
      .map((slot) => ({
        position: playerPositions?.[`${team}:${slot.slot}`],
        slot,
      }))
      .filter(({ position }) => (
        Number.isFinite(Number(position?.x))
        && Number.isFinite(Number(position?.y))
      ))
      .sort((left, right) => (
        Number(left.position.x) - Number(right.position.x)
        || left.slot.slot - right.slot.slot
      ));
    const slotsInVisualOrder = sortSlotsInVisualOrder(lineSlots, attacksToward);
    if (positionDonors.length !== slotsInVisualOrder.length) return;
    slotsInVisualOrder.forEach((slot, visualIndex) => {
      nextPositions[`${team}:${slot.slot}`] = {
        x: Number(positionDonors[visualIndex].position.x),
        y: Number(positionDonors[visualIndex].position.y),
      };
    });
  });

  return nextPositions;
};

export const enforceTacticalPlayerPositionOrientation = ({
  playerPositions = {},
  rivalFormationSlots = [],
  caudalFormationSlots = [],
}) => {
  const rivalOriented = reassignTeamPositionsToVisualSlots({
    team: 'rival',
    formationSlots: rivalFormationSlots,
    playerPositions,
  });
  return reassignTeamPositionsToVisualSlots({
    team: 'caudal',
    formationSlots: caudalFormationSlots,
    playerPositions: rivalOriented,
  });
};
