import { preventInitialPositionOverlaps } from './defensiveBlockPositions.js';
import { normalizeBallStartPosition } from './setPieceZones.js';

const clamp = (value) => Math.max(5, Math.min(95, Math.round(value * 100) / 100));

const normalizeSlots = (slots) => [...slots]
  .map((slot, fallbackSlot) => ({
    ...slot,
    slot: Number.isInteger(Number(slot?.slot)) ? Number(slot.slot) : fallbackSlot,
  }))
  .sort((left, right) => left.slot - right.slot);

const assignTeamPositions = (team, slots, coordinates) => Object.fromEntries(
  normalizeSlots(slots).map((slot, index) => [
    `${team}:${slot.slot}`,
    {
      x: clamp(coordinates[index]?.x ?? 50),
      y: clamp(coordinates[index]?.y ?? 50),
    },
  ])
);

const point = (x, y) => ({ x: clamp(x), y: clamp(y) });

const buildSetPieceCoordinates = ({ setPieceType, setPieceAction, ballStartPosition }) => {
  const ball = normalizeBallStartPosition(ballStartPosition);
  const targetY = ball.y >= 50 ? 94 : 6;
  const direction = targetY > 50 ? 1 : -1;
  const oppositeGoalY = targetY > 50 ? 6 : 94;
  const side = ball.x < 50 ? -1 : 1;
  const toGoal = (distance) => clamp(targetY - direction * distance);
  const behindBall = (distance) => clamp(ball.y - direction * distance);
  const inFrontOfBall = (distance) => clamp(ball.y + direction * distance);
  const taker = point(ball.x - side * 1.5, ball.y - direction * 1.5);

  let attackingOutfield;
  let defendingOutfield;

  if (setPieceAction === 'corner') {
    attackingOutfield = [
      taker,
      point(38, toGoal(7)),
      point(46, toGoal(5)),
      point(54, toGoal(8)),
      point(62, toGoal(6)),
      point(50, toGoal(14)),
      point(30, toGoal(18)),
      point(70, toGoal(18)),
      point(40, behindBall(25)),
      point(60, behindBall(28)),
    ];
    defendingOutfield = [
      point(34, toGoal(5)),
      point(42, toGoal(7)),
      point(50, toGoal(5)),
      point(58, toGoal(7)),
      point(66, toGoal(5)),
      point(38, toGoal(13)),
      point(50, toGoal(15)),
      point(62, toGoal(13)),
      point(45, toGoal(22)),
      point(55, toGoal(22)),
    ];
  } else if (setPieceAction === 'wide_free_kick') {
    const distance = Math.max(8, Math.abs(targetY - ball.y));
    attackingOutfield = [
      taker,
      point(36, toGoal(Math.min(9, distance * 0.35))),
      point(44, toGoal(Math.min(7, distance * 0.3))),
      point(52, toGoal(Math.min(11, distance * 0.4))),
      point(60, toGoal(Math.min(8, distance * 0.32))),
      point(68, toGoal(Math.min(13, distance * 0.45))),
      point(50, toGoal(Math.min(19, distance * 0.62))),
      point(30, behindBall(12)),
      point(50, behindBall(18)),
      point(70, behindBall(15)),
    ];
    defendingOutfield = [
      point(32, toGoal(6)),
      point(40, toGoal(8)),
      point(48, toGoal(6)),
      point(56, toGoal(8)),
      point(64, toGoal(6)),
      point(72, toGoal(9)),
      point(42, toGoal(15)),
      point(54, toGoal(16)),
      point(ball.x - side * 7, inFrontOfBall(4)),
      point(ball.x - side * 13, inFrontOfBall(4)),
    ];
  } else if (setPieceAction === 'central_free_kick') {
    attackingOutfield = [
      taker,
      point(ball.x - 7, behindBall(5)),
      point(ball.x + 7, behindBall(5)),
      point(36, toGoal(8)),
      point(44, toGoal(11)),
      point(56, toGoal(11)),
      point(64, toGoal(8)),
      point(32, behindBall(18)),
      point(50, behindBall(22)),
      point(68, behindBall(18)),
    ];
    defendingOutfield = [
      point(ball.x - 12, inFrontOfBall(6)),
      point(ball.x - 4, inFrontOfBall(6)),
      point(ball.x + 4, inFrontOfBall(6)),
      point(ball.x + 12, inFrontOfBall(6)),
      point(34, toGoal(7)),
      point(43, toGoal(9)),
      point(57, toGoal(9)),
      point(66, toGoal(7)),
      point(44, toGoal(17)),
      point(56, toGoal(17)),
    ];
  } else {
    const localY = ball.y;
    attackingOutfield = [
      taker,
      point(ball.x - side * 8, localY - direction * 5),
      point(ball.x - side * 13, localY + direction * 5),
      point(ball.x - side * 20, localY),
      point(35, behindBall(12)),
      point(50, behindBall(16)),
      point(65, behindBall(12)),
      point(28, behindBall(26)),
      point(50, behindBall(31)),
      point(72, behindBall(26)),
    ];
    defendingOutfield = [
      point(ball.x - side * 6, localY),
      point(ball.x - side * 11, localY - direction * 7),
      point(ball.x - side * 12, localY + direction * 7),
      point(32, inFrontOfBall(12)),
      point(50, inFrontOfBall(15)),
      point(68, inFrontOfBall(12)),
      point(30, inFrontOfBall(25)),
      point(45, inFrontOfBall(28)),
      point(60, inFrontOfBall(28)),
      point(75, inFrontOfBall(24)),
    ];
  }

  return {
    attacking: [point(50, oppositeGoalY), ...attackingOutfield],
    defending: [point(50, targetY), ...defendingOutfield],
  };
};

export const getSetPieceInitialPositions = ({
  setPieceType,
  setPieceAction,
  ballStartPosition,
  rivalFormationSlots = [],
  caudalFormationSlots = [],
}) => {
  const coordinates = buildSetPieceCoordinates({
    setPieceType,
    setPieceAction,
    ballStartPosition,
  });
  const attackingTeam = setPieceType === 'defensive_set_piece' ? 'caudal' : 'rival';
  const defendingTeam = attackingTeam === 'rival' ? 'caudal' : 'rival';
  const attackingSlots = attackingTeam === 'rival' ? rivalFormationSlots : caudalFormationSlots;
  const defendingSlots = defendingTeam === 'rival' ? rivalFormationSlots : caudalFormationSlots;

  return preventInitialPositionOverlaps({
    ...assignTeamPositions(attackingTeam, attackingSlots, coordinates.attacking),
    ...assignTeamPositions(defendingTeam, defendingSlots, coordinates.defending),
  });
};
