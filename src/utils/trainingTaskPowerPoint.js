import PptxGenJS from 'pptxgenjs';
import { getSetPieceCurveControlPoint } from './setPieceEditorInteractions.js';
import {
  adaptLegacyTrainingBoardElement,
  getTrainingBoardColor,
  sortTrainingBoardElements,
} from './trainingTaskBoardElements.js';
import { readTrainingTaskEditorPayload } from './trainingTaskEditorPayload.js';
import {
  TRAINING_TASK_PHASES,
  formatTrainingTaskPlayers,
  formatTrainingTaskSpace,
  getTrainingTaskMomentLabel,
  getTrainingTaskStageLabel,
  getTrainingTaskTypeDefinition,
} from './trainingTasks.js';
import { resolveTrainingTaskPlayerRef } from './trainingTaskRoster.js';

const SLIDE_WIDTH = 297 / 25.4;
const SLIDE_HEIGHT = 210 / 25.4;
const BOARD_VIEW_WIDTH = 100;
const BOARD_VIEW_HEIGHT = 72;
const PAGE_MARGIN = 0.36;
const LEFT_COLUMN = Object.freeze({ x: 0.36, y: 1.68, w: 6.12 });
const RIGHT_COLUMN = Object.freeze({ x: 6.75, y: 1.68, w: 4.58 });
const BOARD_RECT = Object.freeze({
  x: RIGHT_COLUMN.x,
  y: 1.96,
  w: RIGHT_COLUMN.w,
  h: RIGHT_COLUMN.w * BOARD_VIEW_HEIGHT / BOARD_VIEW_WIDTH,
});
const PAGE_BOTTOM = SLIDE_HEIGHT - PAGE_MARGIN;
const FONT_FACE = 'Arial';
const COLORS = Object.freeze({
  ink: '152238',
  muted: '64748B',
  line: 'D8E0E8',
  panel: 'F5F8FB',
  pitch: '176B3A',
  pitchStripe: 'FFFFFF',
  pitchLine: 'FFFFFF',
});

const cleanValue = (value) => (
  value === null || value === undefined ? '' : String(value).trim()
);

const toHex = (value) => String(value || '').replace(/^#/, '').toUpperCase();

const inchPoint = (x, y, board) => ({
  x: board.x + (Number(x) / BOARD_VIEW_WIDTH) * board.w,
  y: board.y + (Number(y) / BOARD_VIEW_HEIGHT) * board.h,
});

const rotatePoint = (point, center, degrees = 0) => {
  const radians = (Number(degrees) || 0) * Math.PI / 180;
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: center.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
};

const addBoardLine = (slide, board, start, end, {
  color = COLORS.pitchLine,
  width = 1.25,
  transparency = 0,
  dashType = 'solid',
  arrow = false,
  doubleArrow = false,
  name = 'Pizarra - línea',
} = {}) => {
  const xDelta = end.x - start.x;
  const yDelta = end.y - start.y;
  const leftToRight = Math.abs(xDelta) > 0.0001 ? xDelta > 0 : yDelta >= 0;
  const sameSlope = Math.abs(xDelta) < 0.0001 || Math.abs(yDelta) < 0.0001 || xDelta * yDelta > 0;
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.max(Math.abs(xDelta), 0.001);
  const h = Math.max(Math.abs(yDelta), 0.001);
  const arrowType = arrow ? 'triangle' : 'none';
  slide.addShape(sameSlope ? 'line' : 'lineInv', {
    x,
    y,
    w,
    h,
    line: {
      color: toHex(color),
      width,
      transparency,
      dashType,
      beginArrowType: doubleArrow ? arrowType : arrow && !leftToRight ? arrowType : 'none',
      endArrowType: doubleArrow ? arrowType : arrow && leftToRight ? arrowType : 'none',
    },
    objectName: name,
  });
};

const addFieldLines = (slide, board, pitchType) => {
  const point = (x, y) => inchPoint(x, y, board);
  slide.addShape('roundRect', {
    x: board.x,
    y: board.y,
    w: board.w,
    h: board.h,
    rectRadius: 0.1,
    fill: { color: COLORS.pitch },
    line: { color: '0F5130', width: 0.6 },
    objectName: 'Pizarra - terreno de juego',
  });

  for (let stripe = 0; stripe < 8; stripe += 1) {
    slide.addShape('rect', {
      ...point(stripe * 12.5, 0),
      w: board.w * 12.5 / BOARD_VIEW_WIDTH,
      h: board.h,
      fill: { color: COLORS.pitchStripe, transparency: stripe % 2 ? 97.5 : 96.5 },
      line: { color: COLORS.pitch, transparency: 100, width: 0 },
      objectName: `Pizarra - franja ${stripe + 1}`,
    });
  }

  if (pitchType === 'blank') return;

  const fieldRect = (x, y, w, h, name) => slide.addShape('rect', {
    ...point(x, y),
    w: board.w * w / BOARD_VIEW_WIDTH,
    h: board.h * h / BOARD_VIEW_HEIGHT,
    fill: { color: COLORS.pitch, transparency: 100 },
    line: { color: COLORS.pitchLine, transparency: 12, width: 0.7 },
    objectName: name,
  });
  const fieldCircle = (x, y, radius, name) => slide.addShape('ellipse', {
    ...point(x - radius, y - radius),
    w: board.w * radius * 2 / BOARD_VIEW_WIDTH,
    h: board.h * radius * 2 / BOARD_VIEW_HEIGHT,
    fill: { color: COLORS.pitch, transparency: 100 },
    line: { color: COLORS.pitchLine, transparency: 12, width: 0.7 },
    objectName: name,
  });

  fieldRect(1, 1, 98, 70, 'Pizarra - límites del campo');
  if (pitchType === 'half') {
    addBoardLine(slide, board, point(1, 1), point(1, 71), { name: 'Pizarra - línea de fondo' });
    fieldRect(79, 17, 20, 38, 'Pizarra - área');
    fieldRect(92, 27, 7, 18, 'Pizarra - área pequeña');
    fieldRect(98, 30, 2, 12, 'Pizarra - portería');
    fieldCircle(87, 36, 0.8, 'Pizarra - punto de penalti');
    addBoardLine(slide, board, point(0.5, 27), point(0.5, 45), { name: 'Pizarra - arco de medio campo' });
    addBoardLine(slide, board, point(79, 29), point(78.2, 31), { name: 'Pizarra - área curva 1' });
    addBoardLine(slide, board, point(78.2, 31), point(78, 36), { name: 'Pizarra - área curva 2' });
    addBoardLine(slide, board, point(78, 36), point(78.2, 41), { name: 'Pizarra - área curva 3' });
    addBoardLine(slide, board, point(78.2, 41), point(79, 43), { name: 'Pizarra - área curva 4' });
    return;
  }

  addBoardLine(slide, board, point(50, 1), point(50, 71), { name: 'Pizarra - línea de medio campo' });
  fieldCircle(50, 36, 9, 'Pizarra - círculo central');
  fieldCircle(50, 36, 0.7, 'Pizarra - punto central');
  fieldRect(1, 17, 19, 38, 'Pizarra - área izquierda');
  fieldRect(1, 27, 7, 18, 'Pizarra - área pequeña izquierda');
  fieldRect(0, 30, 2, 12, 'Pizarra - portería izquierda');
  fieldRect(80, 17, 19, 38, 'Pizarra - área derecha');
  fieldRect(92, 27, 7, 18, 'Pizarra - área pequeña derecha');
  fieldRect(98, 30, 2, 12, 'Pizarra - portería derecha');
  fieldCircle(12, 36, 0.7, 'Pizarra - punto de penalti izquierdo');
  fieldCircle(88, 36, 0.7, 'Pizarra - punto de penalti derecho');
  addBoardLine(slide, board, point(20, 29), point(22, 32), { name: 'Pizarra - área curva izquierda 1' });
  addBoardLine(slide, board, point(22, 32), point(22, 40), { name: 'Pizarra - área curva izquierda 2' });
  addBoardLine(slide, board, point(22, 40), point(20, 43), { name: 'Pizarra - área curva izquierda 3' });
  addBoardLine(slide, board, point(80, 29), point(78, 32), { name: 'Pizarra - área curva derecha 1' });
  addBoardLine(slide, board, point(78, 32), point(78, 40), { name: 'Pizarra - área curva derecha 2' });
  addBoardLine(slide, board, point(78, 40), point(80, 43), { name: 'Pizarra - área curva derecha 3' });
};

const addBoardParticipant = (slide, board, element, players) => {
  const point = inchPoint(element.x, element.y, board);
  const palette = getTrainingBoardColor(element, 'blue');
  const fill = toHex(palette.value);
  const textColor = toHex(palette.contrast);
  const role = element.role || 'player';
  const resolvedPlayer = element.playerRef ? resolveTrainingTaskPlayerRef(element.playerRef, players) : null;
  const label = resolvedPlayer?.display.number || cleanValue(element.label)
    || (role === 'goalkeeper' ? 'P' : role === 'neutral' ? 'C' : '');
  const name = resolvedPlayer?.display.name || label || 'Jugador';
  if (role === 'coach') {
    const w = board.w * 4.2 / BOARD_VIEW_WIDTH;
    const h = board.h * 3.4 / BOARD_VIEW_HEIGHT;
    slide.addShape('rect', {
      x: point.x - w / 2,
      y: point.y - h / 2,
      w,
      h,
      fill: { color: fill },
      line: { color: 'FFFFFF', width: 0.8 },
      objectName: `Pizarra - entrenador ${name}`,
    });
  } else {
    const diameter = board.w * 3.04 / BOARD_VIEW_WIDTH;
    slide.addShape('ellipse', {
      x: point.x - diameter / 2,
      y: point.y - diameter / 2,
      w: diameter,
      h: diameter,
      fill: { color: fill },
      line: { color: 'FFFFFF', width: 0.8 },
      objectName: `Pizarra - jugador ${name}`,
    });
    if (role === 'goalkeeper') {
      const outer = board.w * 3.8 / BOARD_VIEW_WIDTH;
      slide.addShape('ellipse', {
        x: point.x - outer / 2,
        y: point.y - outer / 2,
        w: outer,
        h: outer,
        fill: { color: 'FFFFFF', transparency: 100 },
        line: { color: 'FEF08A', width: 0.8 },
        objectName: `Pizarra - distintivo de portero ${name}`,
      });
    }
  }
  if (!label) return;
  const labelWidth = board.w * 5.4 / BOARD_VIEW_WIDTH;
  const labelHeight = board.h * 3.1 / BOARD_VIEW_HEIGHT;
  slide.addText(label, {
    x: point.x - labelWidth / 2,
    y: point.y - labelHeight / 2,
    w: labelWidth,
    h: labelHeight,
    fontFace: FONT_FACE,
    fontSize: role === 'coach' ? 7 : 6,
    bold: true,
    color: textColor,
    align: 'center',
    valign: 'mid',
    margin: 0,
    fit: 'shrink',
    objectName: `Pizarra - dorsal ${label}`,
  });
};

const addBoardTrace = (slide, board, element, type) => {
  const color = getTrainingBoardColor(element, type === 'text' ? 'white' : 'blue').value;
  const dashed = ['dashed_arrow', 'dashed_line'].includes(type) || Boolean(element.dashed);
  const arrow = !['line', 'dashed_line'].includes(type);
  const doubleArrow = type === 'double_arrow';
  const lineOptions = {
    color,
    width: 1.5,
    dashType: dashed ? 'sysDash' : 'solid',
    arrow,
    doubleArrow,
    name: `Pizarra - ${type}`,
  };

  const toBoardPoint = (x, y) => inchPoint(x, y, board);
  const addSegment = (start, end, options = {}) => addBoardLine(
    slide,
    board,
    toBoardPoint(start.x, start.y),
    toBoardPoint(end.x, end.y),
    { ...lineOptions, ...options },
  );
  const start = { x: Number(element.x1), y: Number(element.y1) };
  const end = { x: Number(element.x2), y: Number(element.y2) };
  if (type !== 'curved_arrow') {
    addSegment(start, end);
    return;
  }

  const control = getSetPieceCurveControlPoint(element);
  const steps = 12;
  let previous = start;
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    const inverse = 1 - ratio;
    const next = {
      x: inverse * inverse * start.x + 2 * inverse * ratio * control.x + ratio * ratio * end.x,
      y: inverse * inverse * start.y + 2 * inverse * ratio * control.y + ratio * ratio * end.y,
    };
    addSegment(previous, next, {
      arrow: index === steps,
      doubleArrow: false,
      name: `Pizarra - curva ${index}/${steps}`,
    });
    previous = next;
  }
};

const addBoardElement = (slide, board, rawElement, players) => {
  const element = adaptLegacyTrainingBoardElement(rawElement);
  const type = element.type;
  if (type === 'participant') {
    addBoardParticipant(slide, board, element, players);
    return;
  }
  if (['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow', 'line', 'dashed_line'].includes(type)) {
    addBoardTrace(slide, board, element, type);
    return;
  }

  const point = inchPoint(element.x, element.y, board);
  const color = toHex(getTrainingBoardColor(element, type === 'text' ? 'white' : 'blue').value);
  const center = { x: Number(element.x), y: Number(element.y) };
  const toPoint = (x, y) => {
    const rotated = rotatePoint({ x, y }, center, element.rotation);
    return inchPoint(rotated.x, rotated.y, board);
  };
  const addRotatedLine = (start, end, options = {}) => addBoardLine(
    slide,
    board,
    toPoint(start.x, start.y),
    toPoint(end.x, end.y),
    { color, width: 1.4, name: `Pizarra - ${type}`, ...options },
  );
  const addCenteredShape = (shape, widthUnits, heightUnits, {
    fill = color,
    fillTransparency = 0,
    lineColor = 'FFFFFF',
    lineWidth = 0.5,
    lineTransparency = 0,
    name = `Pizarra - ${type}`,
  } = {}) => {
    const width = board.w * widthUnits / BOARD_VIEW_WIDTH;
    const height = board.h * heightUnits / BOARD_VIEW_HEIGHT;
    slide.addShape(shape, {
      x: point.x - width / 2,
      y: point.y - height / 2,
      w: width,
      h: height,
      rotate: Number(element.rotation) || 0,
      fill: { color: toHex(fill), transparency: fillTransparency },
      line: { color: toHex(lineColor), width: lineWidth, transparency: lineTransparency },
      objectName: name,
    });
  };

  if (type === 'zone') {
    const widthUnits = Math.max(0.1, Number(element.width) || 22);
    const heightUnits = Math.max(0.1, Number(element.height) || 12);
    const width = board.w * widthUnits / BOARD_VIEW_WIDTH;
    const height = board.h * heightUnits / BOARD_VIEW_HEIGHT;
    const transparency = Math.max(0, Math.min(100, 100 - (Number(element.opacity) || 0.18) * 100));
    slide.addShape('rect', {
      x: point.x,
      y: point.y,
      w: width,
      h: height,
      fill: { color, transparency },
      line: {
        color,
        width: 1,
        dashType: element.borderStyle === 'dashed' ? 'sysDash' : 'solid',
      },
      objectName: `Pizarra - zona${element.label ? ` ${element.label}` : ''}`,
    });
    if (element.label) {
      slide.addText(String(element.label), {
        x: point.x + board.w * 1.4 / BOARD_VIEW_WIDTH,
        y: point.y + board.h * 0.5 / BOARD_VIEW_HEIGHT,
        w: Math.max(0.5, width - board.w * 2 / BOARD_VIEW_WIDTH),
        h: board.h * 4 / BOARD_VIEW_HEIGHT,
        fontFace: FONT_FACE,
        fontSize: 8,
        bold: true,
        color: 'FFFFFF',
        margin: 0,
        fit: 'shrink',
        objectName: `Pizarra - texto de zona ${element.label}`,
      });
    }
    return;
  }

  if (type === 'text' || type === 'text_box') {
    slide.addText(cleanValue(element.label) || 'Texto', {
      x: point.x - board.w * 9 / BOARD_VIEW_WIDTH,
      y: point.y - board.h * 3 / BOARD_VIEW_HEIGHT,
      w: board.w * 18 / BOARD_VIEW_WIDTH,
      h: board.h * 6 / BOARD_VIEW_HEIGHT,
      rotate: Number(element.rotation) || 0,
      fontFace: FONT_FACE,
      fontSize: 9,
      bold: true,
      color,
      align: 'center',
      valign: 'mid',
      margin: 0,
      fit: 'shrink',
      objectName: `Pizarra - anotación ${cleanValue(element.label) || 'texto'}`,
    });
    return;
  }

  if (type === 'ball') {
    addCenteredShape('ellipse', 2.7, 2.7, { fill: 'FFFFFF', lineColor: '111827', lineWidth: 0.8, name: 'Pizarra - balón' });
    addCenteredShape('ellipse', 0.9, 0.9, { fill: '111827', lineColor: '111827', lineWidth: 0, name: 'Pizarra - detalle del balón' });
    return;
  }
  if (type === 'cone') {
    addCenteredShape('triangle', 3.6, 3.1, { name: 'Pizarra - cono' });
    return;
  }
  if (type === 'pole') {
    addRotatedLine({ x: center.x - 3, y: center.y }, { x: center.x + 3, y: center.y }, { width: 2, name: 'Pizarra - pica' });
    return;
  }
  if (type === 'mannequin') {
    const head = toPoint(center.x, center.y - 2.2);
    const headDiameter = board.w * 1.6 / BOARD_VIEW_WIDTH;
    slide.addShape('ellipse', {
      x: head.x - headDiameter / 2,
      y: head.y - headDiameter / 2,
      w: headDiameter,
      h: headDiameter,
      fill: { color: COLORS.panel },
      line: { color, width: 1.1 },
      objectName: 'Pizarra - maniquí (cabeza)',
    });
    addRotatedLine({ x: center.x - 1.5, y: center.y - 0.8 }, { x: center.x + 1.5, y: center.y - 0.8 }, { width: 1.1, name: 'Pizarra - maniquí (hombros)' });
    addRotatedLine({ x: center.x, y: center.y - 1.4 }, { x: center.x, y: center.y + 2 }, { width: 1.1, name: 'Pizarra - maniquí (cuerpo)' });
    addRotatedLine({ x: center.x - 1.5, y: center.y + 2 }, { x: center.x + 1.5, y: center.y + 2 }, { width: 1.1, name: 'Pizarra - maniquí (base)' });
    return;
  }
  if (type === 'hoop') {
    addCenteredShape('ellipse', 4.2, 4.2, { fill: 'FFFFFF', fillTransparency: 100, lineColor: color, lineWidth: 1.5, name: 'Pizarra - aro' });
    return;
  }
  if (type === 'block') {
    addRotatedLine({ x: center.x - 2.2, y: center.y - 2.2 }, { x: center.x + 2.2, y: center.y + 2.2 }, { width: 2.1, name: 'Pizarra - bloque (diagonal)' });
    addRotatedLine({ x: center.x + 2.2, y: center.y - 2.2 }, { x: center.x - 2.2, y: center.y + 2.2 }, { width: 2.1, name: 'Pizarra - bloque (diagonal)' });
    return;
  }
  if (type === 'goal' || type === 'mini_goal') {
    const width = Number(element.width) || (type === 'goal' ? 10 : 6);
    const depth = Number(element.height) || (type === 'goal' ? 4.5 : 3);
    const left = center.x - width / 2;
    const right = center.x + width / 2;
    const front = center.y - depth / 2;
    const back = center.y + depth / 2;
    const inset = Math.min(width * 0.16, 1.4);
    const backLeft = left + inset;
    const backRight = right - inset;
    const lines = [
      [[left, front], [right, front]],
      [[left, front], [backLeft, back]],
      [[backLeft, back], [backRight, back]],
      [[backRight, back], [right, front]],
    ];
    const netRatios = type === 'goal' ? [0.25, 0.5, 0.75] : [0.5];
    netRatios.forEach((ratio) => lines.push([
      [left + width * ratio, front],
      [backLeft + (backRight - backLeft) * ratio, back],
    ]));
    lines.forEach(([start, end], index) => addRotatedLine(
      { x: start[0], y: start[1] },
      { x: end[0], y: end[1] },
      { width: index < 4 ? 1.1 : 0.65, name: `Pizarra - ${type} ${index + 1}` },
    ));
  }
};

const splitTextAtBoundary = (text, maximumLength) => {
  const value = String(text || '');
  if (!value) return [];
  const chunks = [];
  let remaining = value;
  while (remaining.length > maximumLength) {
    let splitAt = remaining.lastIndexOf(' ', maximumLength);
    const newlineAt = remaining.lastIndexOf('\n', maximumLength);
    splitAt = Math.max(splitAt, newlineAt);
    if (splitAt <= 0) splitAt = maximumLength;
    else if (remaining[splitAt] === ' ') splitAt += 1;
    else splitAt += 1;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
};

const estimateTextLines = (text, charactersPerLine) => (
  String(text || '').split(/\r\n|\r|\n/).reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
    0,
  )
);

const splitTextForLayout = (text, maximumLength, maximumLines, charactersPerLine) => {
  const value = String(text || '');
  if (!value) return [];
  const paragraphs = value.match(/[^\n]*\n|[^\n]+$/g) || [value];
  const chunks = [];
  let current = '';
  let lineCount = 0;

  paragraphs.forEach((paragraph) => {
    splitTextAtBoundary(paragraph, maximumLength).forEach((part) => {
      const visiblePart = part.replace(/\r?\n$/, '');
      const partLines = Math.max(1, Math.ceil(visiblePart.length / charactersPerLine));
      if (current && (lineCount + partLines > maximumLines || current.length + part.length > maximumLength)) {
        chunks.push(current);
        current = '';
        lineCount = 0;
      }
      current += part;
      lineCount += partLines;
    });
  });
  if (current) chunks.push(current);
  return chunks;
};

const addBodySlide = (pptx, heading, body) => {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addText(heading, {
    x: 0.55,
    y: 0.42,
    w: 12.2,
    h: 0.55,
    fontFace: FONT_FACE,
    fontSize: 22,
    bold: true,
    color: COLORS.ink,
    margin: 0,
    fit: 'shrink',
    objectName: 'Título de continuación',
  });
  slide.addShape('line', {
    x: 0.55,
    y: 1.08,
    w: 12.2,
    h: 0,
    line: { color: COLORS.line, width: 1 },
    objectName: 'Separador',
  });
  slide.addText(body, {
    x: 0.55,
    y: 1.3,
    w: 12.2,
    h: 5.72,
    fontFace: FONT_FACE,
    fontSize: 15,
    color: COLORS.ink,
    breakLine: false,
    valign: 'top',
    margin: 0,
    fit: 'shrink',
    objectName: 'Texto de continuación editable',
  });
  return slide;
};

const addInformationSlides = (pptx, entries) => {
  if (!entries.length) return;
  const slides = [];
  let pageSections = [];
  let lineBudget = 0;
  const maximumLinesPerPage = 20;

  entries.forEach(([label, rawValue]) => {
    const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
    if (!value.trim()) return;
    const parts = splitTextForLayout(value, 1500, 18, 118);
    parts.forEach((part, index) => {
      const lines = estimateTextLines(part, 118);
      const section = {
        label: index ? `${label} (continuación)` : label,
        value: part,
        lines: lines + 2,
      };
      if (lineBudget && lineBudget + section.lines > maximumLinesPerPage) {
        slides.push(pageSections);
        pageSections = [];
        lineBudget = 0;
      }
      pageSections.push(section);
      lineBudget += section.lines;
    });
  });
  if (pageSections.length) slides.push(pageSections);

  slides.forEach((sections, slideIndex) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(slideIndex ? 'Información complementaria · continuación' : 'Información complementaria', {
      x: 0.55,
      y: 0.42,
      w: 12.2,
      h: 0.55,
      fontFace: FONT_FACE,
      fontSize: 22,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: 'shrink',
      objectName: 'Título de información complementaria',
    });
    slide.addShape('line', {
      x: 0.55,
      y: 1.08,
      w: 12.2,
      h: 0,
      line: { color: COLORS.line, width: 1 },
      objectName: 'Separador de información',
    });

    let y = 1.32;
    sections.forEach((section) => {
      slide.addText(section.label, {
        x: 0.6,
        y,
        w: 12.0,
        h: 0.23,
        fontFace: FONT_FACE,
        fontSize: 11,
        bold: true,
        color: COLORS.muted,
        charSpacing: 0.7,
        margin: 0,
        fit: 'shrink',
        objectName: `Campo - ${section.label}`,
      });
      y += 0.25;
      const height = Math.min(4.5, Math.max(0.28, section.lines * 0.19));
      slide.addText(section.value, {
        x: 0.6,
        y,
        w: 12.0,
        h: height,
        fontFace: FONT_FACE,
        fontSize: 13,
        color: COLORS.ink,
        valign: 'top',
        margin: 0,
        fit: 'shrink',
        objectName: `Contenido - ${section.label}`,
      });
      y += height + 0.15;
    });
  });
};

const getTaskInformation = (task) => {
  const type = getTrainingTaskTypeDefinition(task.taskType);
  const phaseLabel = TRAINING_TASK_PHASES.find((phase) => phase.value === task.gamePhase)?.label
    || cleanValue(task.gamePhase);
  const momentLabel = getTrainingTaskMomentLabel(task.gamePhase, task.gameMoment) || cleanValue(task.gameMoment);
  const stages = Array.isArray(task.stageKeys) ? task.stageKeys.map(getTrainingTaskStageLabel).filter(Boolean).join(', ') : '';
  const duration = cleanValue(task.durationMinutes) ? `${task.durationMinutes} min` : '';
  const series = cleanValue(task.seriesCount) && cleanValue(task.minutesPerSeries)
    ? `${task.seriesCount} × ${task.minutesPerSeries} min` : '';
  const mediaNames = Array.isArray(task.media)
    ? task.media.map((media) => cleanValue(media?.title || media?.fileName || media?.name)).filter(Boolean).join('\n')
    : '';
  const entries = [
    ['Tipo de tarea', type?.label || task.taskType],
    ['Etapas', stages],
    ['Jugadores', formatTrainingTaskPlayers(task)],
    ['Duración', [duration, series].filter(Boolean).join(' · ')],
    ['Espacio', formatTrainingTaskSpace(task)],
    ['Fase del juego', phaseLabel],
    ['Momento / subfase', momentLabel],
    ['Consignas y observaciones', task.observations],
    ['Reglas del ejercicio', task.exerciseRules],
    ['Contenido técnico', task.technicalContent],
    ['Contenido táctico', task.tacticalContent],
    ['Contenido táctico ofensivo', task.tacticalOffensiveContent],
    ['Contenido táctico defensivo', task.tacticalDefensiveContent],
    ['Variantes y progresiones', task.variants],
    ['Material', task.material],
    ['Adjunto', task.attachmentName],
    ['Recursos multimedia', mediaNames],
  ].filter(([, value]) => cleanValue(value));
  return entries;
};

const addMainSlide = (pptx, task, players, parsedBoard) => {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  const taskName = cleanValue(task.name) || 'Tarea sin nombre';
  const type = getTrainingTaskTypeDefinition(task.taskType);
  const stages = Array.isArray(task.stageKeys) ? task.stageKeys.map(getTrainingTaskStageLabel).filter(Boolean) : [];
  const meta = [cleanValue(task.taskCode), type?.label, stages.join(' · ')].filter(Boolean).join('  ·  ');
  slide.addText(taskName, {
    x: 0.55,
    y: 0.34,
    w: 12.2,
    h: 0.48,
    fontFace: FONT_FACE,
    fontSize: 25,
    bold: true,
    color: COLORS.ink,
    margin: 0,
    fit: 'shrink',
    objectName: 'Nombre de la tarea',
  });
  if (meta) {
    slide.addText(meta, {
      x: 0.57,
      y: 0.87,
      w: 12.0,
      h: 0.22,
      fontFace: FONT_FACE,
      fontSize: 9,
      bold: true,
      color: COLORS.muted,
      margin: 0,
      fit: 'shrink',
      objectName: 'Datos principales de la tarea',
    });
  }

  const objective = task.objective === null || task.objective === undefined ? '' : String(task.objective);
  const description = task.description === null || task.description === undefined ? '' : String(task.description);
  const objectiveChunks = splitTextForLayout(objective, 220, 4, 52);
  const descriptionChunks = splitTextForLayout(description, 900, 18, 60);
  const objectiveMain = objectiveChunks.shift() || (objective.trim() ? '' : 'Sin objetivo registrado.');
  const descriptionMain = descriptionChunks.shift() || (description.trim() ? '' : 'Sin descripción registrada.');
  const continuation = [];
  if (objectiveChunks.length) continuation.push(['Objetivo principal (continuación)', objectiveChunks.join('')]);
  if (descriptionChunks.length) continuation.push(['Descripción y desarrollo (continuación)', descriptionChunks.join('')]);

  slide.addText('OBJETIVO PRINCIPAL', {
    x: 0.58,
    y: 1.3,
    w: 5.85,
    h: 0.2,
    fontFace: FONT_FACE,
    fontSize: 9,
    bold: true,
    charSpacing: 1.2,
    color: '147D92',
    margin: 0,
  });
  slide.addText(objectiveMain, {
    x: 0.58,
    y: 1.57,
    w: 5.85,
    h: 0.9,
    fontFace: FONT_FACE,
    fontSize: 15,
    bold: true,
    color: COLORS.ink,
    valign: 'top',
    margin: 0,
    fit: 'shrink',
    objectName: 'Objetivo editable',
  });
  slide.addText('DESCRIPCIÓN Y DESARROLLO', {
    x: 0.58,
    y: 2.68,
    w: 5.85,
    h: 0.2,
    fontFace: FONT_FACE,
    fontSize: 9,
    bold: true,
    charSpacing: 1.2,
    color: COLORS.muted,
    margin: 0,
  });
  slide.addText(descriptionMain, {
    x: 0.58,
    y: 2.96,
    w: 5.85,
    h: 3.9,
    fontFace: FONT_FACE,
    fontSize: 12.5,
    color: COLORS.ink,
    valign: 'top',
    breakLine: false,
    margin: 0,
    fit: 'shrink',
    objectName: 'Descripción editable',
  });
  if (continuation.length) {
    slide.addText('Hay texto completo en las diapositivas siguientes.', {
      x: 0.58,
      y: 6.88,
      w: 5.85,
      h: 0.2,
      fontFace: FONT_FACE,
      fontSize: 8,
      italic: true,
      color: COLORS.muted,
      margin: 0,
    });
  }

  const board = { x: 6.82, y: 1.55, w: 5.95, h: 5.95 * BOARD_VIEW_HEIGHT / BOARD_VIEW_WIDTH };
  slide.addText('PIZARRA TÁCTICA', {
    x: board.x,
    y: 1.3,
    w: board.w,
    h: 0.2,
    fontFace: FONT_FACE,
    fontSize: 9,
    bold: true,
    charSpacing: 1.2,
    color: COLORS.muted,
    margin: 0,
  });

  if (parsedBoard.kind === 'v1') {
    addFieldLines(slide, board, parsedBoard.scene.board.pitchType);
    sortTrainingBoardElements(parsedBoard.scene.board.elements)
      .forEach((element) => addBoardElement(slide, board, element, players));
  } else {
    slide.addShape('roundRect', {
      x: board.x,
      y: board.y,
      w: board.w,
      h: board.h,
      rectRadius: 0.1,
      fill: { color: COLORS.panel },
      line: { color: COLORS.line, width: 1 },
      objectName: 'Pizarra no disponible',
    });
    const boardMessage = parsedBoard.kind === 'empty'
      ? 'No hay pizarra táctica guardada.'
      : 'La pizarra no se ha podido representar porque su formato no es compatible.';
    slide.addText(boardMessage, {
      x: board.x + 0.35,
      y: board.y + 1.75,
      w: board.w - 0.7,
      h: 0.6,
      fontFace: FONT_FACE,
      fontSize: 12,
      color: COLORS.muted,
      align: 'center',
      valign: 'mid',
      margin: 0,
      fit: 'shrink',
      objectName: 'Aviso de pizarra',
    });
  }

  const stats = [
    ['DURACIÓN', cleanValue(task.durationMinutes) ? `${task.durationMinutes} min` : ''],
    ['JUGADORES', formatTrainingTaskPlayers(task)],
    ['ESPACIO', formatTrainingTaskSpace(task)],
  ].filter(([, value]) => cleanValue(value));
  const statY = 6.08;
  const statWidth = stats.length ? board.w / stats.length : board.w;
  stats.forEach(([label, value], index) => {
    const x = board.x + statWidth * index;
    slide.addText(label, {
      x,
      y: statY,
      w: statWidth - 0.08,
      h: 0.18,
      fontFace: FONT_FACE,
      fontSize: 7,
      bold: true,
      charSpacing: 0.7,
      color: COLORS.muted,
      margin: 0,
    });
    slide.addText(value, {
      x,
      y: statY + 0.22,
      w: statWidth - 0.08,
      h: 0.42,
      fontFace: FONT_FACE,
      fontSize: 9,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: 'shrink',
      objectName: label,
    });
  });
  return { slide, continuation };
};

export const trainingTaskPowerPointFileName = (task = {}) => {
  const base = cleanValue(task.taskCode || task.name || task.id || 'Tarea')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 90) || 'Tarea';
  return `Tarea_${base}.pptx`;
};

const hasTaskText = (value) => cleanValue(value) !== '';

const isDisplayValue = (value) => {
  const normalized = cleanValue(value).toLocaleLowerCase('es-ES');
  return normalized !== '' && !['—', '-', 'sin definir', 'undefined'].includes(normalized);
};

const estimateA4TextLines = (value, width, fontSize) => {
  const charactersPerLine = Math.max(12, Math.floor((width * 72) / (fontSize * 0.58)));
  return String(value || '').split(/\r\n|\r|\n/).reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
    0,
  );
};

const measureTextHeight = (value, width, fontSize, leading = 1.3) => (
  Math.max(0.18, estimateA4TextLines(value, width, fontSize) * fontSize * leading / 72 + 0.03)
);

const getTaskPowerPointData = (task) => {
  const type = getTrainingTaskTypeDefinition(task.taskType);
  const stages = Array.isArray(task.stageKeys)
    ? task.stageKeys.map(getTrainingTaskStageLabel).filter(Boolean).join(', ')
    : '';
  const phase = TRAINING_TASK_PHASES.find((entry) => entry.value === task.gamePhase)?.label
    || cleanValue(task.gamePhase);
  const moment = getTrainingTaskMomentLabel(task.gamePhase, task.gameMoment)
    || cleanValue(task.gameMoment);
  const metadata = [
    ['CÓDIGO', task.taskCode],
    ['TIPO', type?.label || task.taskType],
    ['ETAPAS', stages],
    ['FASE', phase],
    ['MOMENTO', moment],
  ].filter(([, value]) => hasTaskText(value)).map(([label, value]) => [label, String(value)]);

  const durationParts = [];
  if (hasTaskText(task.durationMinutes)) durationParts.push(`${task.durationMinutes} min`);
  if (hasTaskText(task.seriesCount) && hasTaskText(task.minutesPerSeries)) {
    durationParts.push(`${task.seriesCount} × ${task.minutesPerSeries} min`);
  }
  const hasPlayerRange = hasTaskText(task.playersMin) || hasTaskText(task.playersMax);
  const players = hasPlayerRange
    ? formatTrainingTaskPlayers({ ...task, playersSpec: '' })
    : cleanValue(task.playersSpec);
  const hasSpace = hasTaskText(task.spaceWidthM) || hasTaskText(task.spaceLengthM);
  const stats = [
    ['DURACIÓN', durationParts.join(' · ')],
    ['JUGADORES', players],
    ['ESPACIO', hasSpace ? formatTrainingTaskSpace(task) : ''],
  ].filter(([, value]) => isDisplayValue(value)).map(([label, value]) => [label, String(value)]);

  const tacticalFields = [
    ['Consignas / observaciones', task.observations],
    ['Contenido técnico', task.technicalContent],
    ['Contenido táctico', task.tacticalContent],
    ['Contenido táctico ofensivo', task.tacticalOffensiveContent],
    ['Contenido táctico defensivo', task.tacticalDefensiveContent],
  ].filter(([, value]) => hasTaskText(value)).map(([label, value]) => [label, String(value)]);

  const mediaNames = Array.isArray(task.media)
    ? task.media.map((media, index) => {
      const title = cleanValue(media?.title || media?.originalName || media?.fileName || media?.name)
        || `Recurso ${index + 1}`;
      const size = Number(media?.sizeBytes);
      const description = [
        media?.kind,
        media?.provider,
        media?.mimeType,
        Number.isFinite(size) && size > 0 ? `${Math.ceil(size / 1024)} KB` : '',
        media?.isPrimary ? 'Recurso principal' : '',
        media?.originalName && media?.title ? media.originalName : '',
        media?.caption,
      ].map(cleanValue).filter(Boolean).join(' · ');
      return [title, description].filter(Boolean).join(' — ');
    })
    : [];
  const attachment = [
    cleanValue(task.attachmentName),
    cleanValue(task.attachmentMime),
    Number(task.attachmentSize) > 0 ? `${Math.ceil(Number(task.attachmentSize) / 1024)} KB` : '',
    task.attachmentPath ? 'Disponible en la ficha' : '',
  ].filter(Boolean).join(' · ');
  const feedback = Array.isArray(task.feedback)
    ? task.feedback.map((entry, index) => {
      const details = [
        entry?.usedOn ? `Fecha: ${entry.usedOn}` : '',
        hasTaskText(entry?.rating) ? `Valoración: ${entry.rating}/5` : '',
        entry?.post,
      ].map(cleanValue).filter(Boolean).join('\n');
      return details ? [`Evaluación POST ${index + 1}`, details] : null;
    }).filter(Boolean)
    : [];
  const detailFields = [
    ['Creada', task.created_at],
    ['Actualizada', task.updated_at],
    ['Formato de jugadores', hasPlayerRange ? task.playersSpec : ''],
    ['Series', hasTaskText(task.seriesCount) && !hasTaskText(task.minutesPerSeries) ? task.seriesCount : ''],
    ['Minutos por serie', hasTaskText(task.minutesPerSeries) && !hasTaskText(task.seriesCount) ? `${task.minutesPerSeries} min` : ''],
    ['Variantes y progresiones', task.variants],
    ['Material', task.material],
    ['Adjunto', attachment || (task.attachmentPath ? 'Adjunto disponible' : '')],
    ['Recursos multimedia', mediaNames.join('\n')],
    ...feedback,
  ].filter(([, value]) => hasTaskText(value)).map(([label, value]) => [label, String(value)]);

  return {
    metadata,
    stats,
    objective: task.objective === null || task.objective === undefined ? '' : String(task.objective),
    description: task.description === null || task.description === undefined ? '' : String(task.description),
    rules: task.exerciseRules === null || task.exerciseRules === undefined ? '' : String(task.exerciseRules),
    tacticalFields,
    detailFields,
  };
};

const getTaskPowerPointLayout = (task = {}) => {
  const data = getTaskPowerPointData(task);
  const metadataCells = [];
  const detailFields = [...data.detailFields];
  const metadataCellWidth = (SLIDE_WIDTH - PAGE_MARGIN * 2) / Math.max(data.metadata.length, 1);
  data.metadata.forEach(([label, value]) => {
    if (estimateA4TextLines(value, metadataCellWidth - 0.14, 8.2) > 1) {
      detailFields.unshift([label, value]);
    } else {
      metadataCells.push([label, value]);
    }
  });

  const stats = [];
  const statCellWidth = (SLIDE_WIDTH - PAGE_MARGIN * 2) / 3;
  data.stats.forEach(([label, value]) => {
    if (estimateA4TextLines(value, statCellWidth - 0.2, 10.2) > 1) {
      detailFields.unshift([label, value]);
    } else {
      stats.push([label, value]);
    }
  });

  const leftSections = [
    data.objective.trim() ? { title: 'OBJETIVO', value: data.objective, fontSize: 14.2, bold: true } : null,
    data.description.trim() ? { title: 'DESCRIPCIÓN Y DESARROLLO', value: data.description, fontSize: 12.2 } : null,
    data.rules.trim() ? { title: 'REGLAS DEL EJERCICIO', value: data.rules, fontSize: 10.8 } : null,
    data.tacticalFields.length ? { title: 'CONSIGNAS / CONTENIDOS TÁCTICOS', items: data.tacticalFields } : null,
  ].filter(Boolean);

  let leftY = LEFT_COLUMN.y;
  const plannedLeftSections = leftSections.map((section, index) => {
    const planned = { ...section, x: LEFT_COLUMN.x, y: leftY, w: LEFT_COLUMN.w, headingH: 0.17 };
    leftY += planned.headingH + 0.035;
    if (section.items) {
      planned.items = section.items.map(([label, value]) => {
        const item = {
          label,
          value,
          labelY: leftY,
          labelH: 0.14,
          fontSize: 10.2,
          valueY: leftY + 0.15,
        };
        item.valueH = measureTextHeight(value, LEFT_COLUMN.w - 0.1, item.fontSize);
        leftY = item.valueY + item.valueH + 0.035;
        return item;
      });
    } else {
      planned.valueY = leftY;
      planned.valueH = measureTextHeight(section.value, LEFT_COLUMN.w - 0.04, section.fontSize);
      leftY = planned.valueY + planned.valueH;
    }
    planned.bottom = leftY;
    if (index < leftSections.length - 1) leftY += 0.13;
    return planned;
  });

  const boardBottom = BOARD_RECT.y + BOARD_RECT.h;
  const rightHeadingY = boardBottom + 0.12;
  const rightHeadingH = 0.16;
  let rightY = rightHeadingY + rightHeadingH + 0.04;
  const plannedRightFields = detailFields.map(([label, value]) => {
    const field = { label, value, x: RIGHT_COLUMN.x, w: RIGHT_COLUMN.w, labelY: rightY, labelH: 0.13 };
    field.valueY = field.labelY + field.labelH + 0.015;
    field.valueH = measureTextHeight(value, RIGHT_COLUMN.w - 0.04, 9.2, 1.27);
    field.bottom = field.valueY + field.valueH;
    rightY = field.bottom + 0.035;
    return field;
  });

  const title = cleanValue(task.name) || 'Tarea sin nombre';
  const titleWidth = SLIDE_WIDTH - PAGE_MARGIN * 2;
  let titleFontSize = 23;
  while (titleFontSize > 17 && estimateA4TextLines(title, titleWidth, titleFontSize) > 1) {
    titleFontSize -= 0.5;
  }
  const overflowAreas = [];
  if (estimateA4TextLines(title, titleWidth, titleFontSize) > 1) overflowAreas.push('el nombre');
  if (leftY + (plannedLeftSections.length ? 0.035 : 0) > PAGE_BOTTOM) {
    overflowAreas.push('la columna de explicaciones');
  }
  if (rightY > PAGE_BOTTOM) overflowAreas.push('los datos complementarios');

  if (overflowAreas.length) {
    throw new Error(
      `Esta tarea no cabe completa y legiblemente en una diapositiva A4 horizontal (${overflowAreas.join(' y ')}). No se generó el PowerPoint ni se dividió en diapositivas. Revisa el contenido y vuelve a intentarlo.`,
    );
  }

  return {
    title,
    titleFontSize,
    stats,
    metadataCells,
    metadataCellWidth,
    leftSections: plannedLeftSections,
    detailFields: plannedRightFields,
    rightHeadingY,
    rightHeadingH,
  };
};

export const inspectTrainingTaskPowerPointLayout = (task = {}) => {
  const layout = getTaskPowerPointLayout(task);
  return {
    page: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
    leftSections: layout.leftSections,
    board: BOARD_RECT,
    rightFields: layout.detailFields,
    pageBottom: PAGE_BOTTOM,
  };
};

const addSingleTaskSlide = (pptx, task, players, parsedBoard, layout) => {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addText(layout.title, {
    x: PAGE_MARGIN,
    y: 0.24,
    w: SLIDE_WIDTH - PAGE_MARGIN * 2,
    h: 0.43,
    fontFace: FONT_FACE,
    fontSize: layout.titleFontSize,
    bold: true,
    color: COLORS.ink,
    margin: 0,
    fit: 'shrink',
    objectName: 'Nombre de la tarea',
  });

  const statWidth = (SLIDE_WIDTH - PAGE_MARGIN * 2) / 3;
  layout.stats.forEach(([label, value], index) => {
    slide.addText([
      { text: `${label}  `, options: { bold: true, color: COLORS.muted } },
      { text: value, options: { bold: true, color: COLORS.ink } },
    ], {
      x: PAGE_MARGIN + statWidth * index,
      y: 0.75,
      w: statWidth - 0.1,
      h: 0.25,
      fontFace: FONT_FACE,
      fontSize: 10.2,
      margin: 0,
      fit: 'shrink',
      objectName: `Dato principal - ${label}`,
    });
  });

  const metadataY = 1.08;
  const metadataH = 0.44;
  slide.addShape('roundRect', {
    x: PAGE_MARGIN,
    y: metadataY,
    w: SLIDE_WIDTH - PAGE_MARGIN * 2,
    h: metadataH,
    rectRadius: 0.04,
    fill: { color: COLORS.panel },
    line: { color: COLORS.line, width: 0.5 },
    objectName: 'Franja de metadatos',
  });
  layout.metadataCells.forEach(([label, value], index) => {
    const cellX = PAGE_MARGIN + layout.metadataCellWidth * index;
    slide.addText(label, {
      x: cellX + 0.07,
      y: metadataY + 0.045,
      w: layout.metadataCellWidth - 0.14,
      h: 0.1,
      fontFace: FONT_FACE,
      fontSize: 7,
      bold: true,
      charSpacing: 0.6,
      color: COLORS.muted,
      margin: 0,
    });
    slide.addText(value, {
      x: cellX + 0.07,
      y: metadataY + 0.17,
      w: layout.metadataCellWidth - 0.14,
      h: 0.2,
      fontFace: FONT_FACE,
      fontSize: 8.2,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: 'shrink',
      objectName: `Metadato - ${label}`,
    });
  });

  layout.leftSections.forEach((section) => {
    slide.addText(section.title, {
      x: section.x,
      y: section.y,
      w: section.w,
      h: section.headingH,
      fontFace: FONT_FACE,
      fontSize: 9,
      bold: true,
      charSpacing: 0.9,
      color: '147D92',
      margin: 0,
    });
    if (section.items) {
      section.items.forEach((item) => {
        slide.addText(item.label, {
          x: section.x,
          y: item.labelY,
          w: section.w,
          h: item.labelH,
          fontFace: FONT_FACE,
          fontSize: 9,
          bold: true,
          color: COLORS.ink,
          margin: 0,
        });
        slide.addText(item.value, {
          x: section.x,
          y: item.valueY,
          w: section.w - 0.1,
          h: item.valueH,
          fontFace: FONT_FACE,
          fontSize: item.fontSize,
          color: COLORS.ink,
          valign: 'top',
          margin: 0,
          fit: 'shrink',
          objectName: `Contenido - ${item.label}`,
        });
      });
    } else {
      slide.addText(section.value, {
        x: section.x,
        y: section.valueY,
        w: section.w - 0.04,
        h: section.valueH,
        fontFace: FONT_FACE,
        fontSize: section.fontSize,
        bold: Boolean(section.bold),
        color: COLORS.ink,
        valign: 'top',
        margin: 0,
        fit: 'shrink',
        objectName: `Contenido - ${section.title}`,
      });
    }
    slide.addShape('line', {
      x: section.x,
      y: section.bottom + 0.035,
      w: section.w,
      h: 0,
      line: { color: COLORS.line, width: 0.55 },
      objectName: `Separador - ${section.title}`,
    });
  });

  slide.addText('PIZARRA TÁCTICA', {
    x: RIGHT_COLUMN.x,
    y: 1.7,
    w: RIGHT_COLUMN.w,
    h: 0.17,
    fontFace: FONT_FACE,
    fontSize: 9,
    bold: true,
    charSpacing: 0.9,
    color: COLORS.muted,
    margin: 0,
  });
  if (parsedBoard.kind === 'v1') {
    addFieldLines(slide, BOARD_RECT, parsedBoard.scene.board.pitchType);
    sortTrainingBoardElements(parsedBoard.scene.board.elements)
      .forEach((element) => addBoardElement(slide, BOARD_RECT, element, players));
  } else {
    slide.addShape('roundRect', {
      x: BOARD_RECT.x,
      y: BOARD_RECT.y,
      w: BOARD_RECT.w,
      h: BOARD_RECT.h,
      rectRadius: 0.1,
      fill: { color: COLORS.panel },
      line: { color: COLORS.line, width: 1 },
      objectName: 'Pizarra no disponible',
    });
    const boardMessage = parsedBoard.kind === 'empty'
      ? 'No hay pizarra táctica guardada.'
      : 'La pizarra no se ha podido representar porque su formato no es compatible.';
    slide.addText(boardMessage, {
      x: BOARD_RECT.x + 0.25,
      y: BOARD_RECT.y + BOARD_RECT.h / 2 - 0.28,
      w: BOARD_RECT.w - 0.5,
      h: 0.56,
      fontFace: FONT_FACE,
      fontSize: 11,
      color: COLORS.muted,
      align: 'center',
      valign: 'mid',
      margin: 0,
      fit: 'shrink',
      objectName: 'Aviso de pizarra',
    });
  }

  slide.addText('DATOS COMPLEMENTARIOS', {
    x: RIGHT_COLUMN.x,
    y: layout.rightHeadingY,
    w: RIGHT_COLUMN.w,
    h: layout.rightHeadingH,
    fontFace: FONT_FACE,
    fontSize: 8.5,
    bold: true,
    charSpacing: 0.8,
    color: COLORS.muted,
    margin: 0,
  });
  layout.detailFields.forEach((field) => {
    slide.addText(field.label, {
      x: field.x,
      y: field.labelY,
      w: field.w,
      h: field.labelH,
      fontFace: FONT_FACE,
      fontSize: 7.7,
      bold: true,
      color: COLORS.muted,
      charSpacing: 0.35,
      margin: 0,
    });
    slide.addText(field.value, {
      x: field.x,
      y: field.valueY,
      w: field.w - 0.04,
      h: field.valueH,
      fontFace: FONT_FACE,
      fontSize: 9.2,
      color: COLORS.ink,
      valign: 'top',
      margin: 0,
      fit: 'shrink',
      objectName: `Dato complementario - ${field.label}`,
    });
    slide.addShape('line', {
      x: field.x,
      y: field.bottom + 0.02,
      w: field.w,
      h: 0,
      line: { color: COLORS.line, width: 0.45 },
      objectName: `Separador - ${field.label}`,
    });
  });
  return slide;
};

export const createTrainingTaskPowerPoint = (task = {}, players = []) => {
  const layout = getTaskPowerPointLayout(task);
  const pptx = new PptxGenJS();
  pptx.defineLayout({
    name: 'NEXO_A4_LANDSCAPE',
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
  });
  pptx.layout = 'NEXO_A4_LANDSCAPE';
  pptx.author = 'NEXO CLUB';
  pptx.subject = 'Tarea de entrenamiento';
  pptx.title = cleanValue(task.name) || 'Tarea de entrenamiento';
  pptx.company = 'NEXO CLUB';
  pptx.lang = 'es-ES';
  pptx.theme = {
    headFontFace: FONT_FACE,
    bodyFontFace: FONT_FACE,
    lang: 'es-ES',
  };

  const parsedBoard = readTrainingTaskEditorPayload(task.editorPayload ?? task.editor_payload);
  addSingleTaskSlide(pptx, task, players, parsedBoard, layout);
  return pptx;
};

export const exportTrainingTaskPowerPoint = async (task, players = []) => {
  const pptx = createTrainingTaskPowerPoint(task, players);
  await pptx.writeFile({ fileName: trainingTaskPowerPointFileName(task) });
};
