import { jsPDF } from 'jspdf';
import {
  PLAYER_POSITION_MAP_ORIENTATION,
  buildPlayerPositionMapModel,
} from './playerPositionMap.js';
import { buildPlayerDossierSectionPlan } from './playerProfilePrintReport.js';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN = 12;
const CONTENT_WIDTH = A4_WIDTH_MM - PAGE_MARGIN * 2;
const CONTENT_BOTTOM = 282;
const PROFESSIONAL_CONTACT = 'analisisvigon@gmail.com';
const COLORS = {
  navy: [9, 28, 54],
  blue: [20, 91, 159],
  electric: [32, 191, 234],
  ink: [24, 39, 58],
  muted: [92, 111, 132],
  line: [207, 218, 229],
  paper: [255, 255, 255],
  panel: [247, 250, 252],
  green: [28, 104, 75],
  greenAlt: [35, 119, 87],
  win: [25, 118, 83],
  draw: [153, 106, 18],
  loss: [166, 49, 49],
};

const rows = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const hasValue = (value) => value === 0 || Boolean(clean(value));

const normalizeCompetitionScope = (value) => {
  const label = clean(value);
  return !label || /^(temporada|todos?|todas?|todas las competiciones)$/i.test(label)
    ? 'Todas las competiciones'
    : label;
};

const normalizeVenueScope = (value) => {
  const label = clean(value);
  return !label || /^(todos?|todas?|local\s*\+\s*visitante)$/i.test(label)
    ? 'Local + visitante'
    : label;
};

const normalizeFootLabel = (value) => {
  const label = clean(value).toLocaleLowerCase('es');
  if (!label) return '';
  if (/^(izquierda|izquierdo|zurda|zurdo)$/.test(label)) return 'Pie izquierdo';
  if (/^(derecha|derecho|diestra|diestro)$/.test(label)) return 'Pie derecho';
  if (/^amb/.test(label)) return 'Ambidiestro';
  return `Pie ${label}`;
};

export const getPlayerPdfScope = (report = {}) => ({
  season: clean(report.identity?.season || report.filters?.season),
  competition: normalizeCompetitionScope(report.filters?.competition),
  venue: normalizeVenueScope(report.filters?.venue),
});

const setText = (pdf, { color = COLORS.ink, size = 8, style = 'normal' } = {}) => {
  pdf.setTextColor(...color);
  pdf.setFont('helvetica', style);
  pdf.setFontSize(size);
};

const text = (pdf, value, x, y, options = {}) => {
  const label = clean(value);
  if (!label) return [];
  const { maxWidth = 0, align = 'left', ...font } = options;
  setText(pdf, font);
  const lines = maxWidth ? pdf.splitTextToSize(label, maxWidth) : [label];
  pdf.text(lines, x, y, { align });
  return lines;
};

const singleLineText = (pdf, value, x, y, options = {}) => {
  let label = clean(value);
  if (!label) return '';
  const { maxWidth = 0, align = 'left', minSize = 4.4, size = 8, ...font } = options;
  let fittedSize = size;
  setText(pdf, { ...font, size: fittedSize });
  while (maxWidth && fittedSize > minSize && pdf.getTextWidth(label) > maxWidth) {
    fittedSize = Math.max(minSize, fittedSize - 0.2);
    setText(pdf, { ...font, size: fittedSize });
  }
  if (maxWidth && pdf.getTextWidth(label) > maxWidth) {
    const suffix = '…';
    while (label.length > 1 && pdf.getTextWidth(`${label}${suffix}`) > maxWidth) label = label.slice(0, -1);
    label = `${label.trimEnd()}${suffix}`;
  }
  pdf.text(label, x, y, { align });
  return label;
};

const sectionTitle = (pdf, label, y, eyebrow = '') => {
  if (eyebrow) text(pdf, eyebrow, PAGE_MARGIN, y, { size: 5.5, style: 'bold', color: COLORS.electric });
  text(pdf, label.toUpperCase(), PAGE_MARGIN + (eyebrow ? 9 : 0), y, { size: 8.5, style: 'bold', color: COLORS.navy });
  pdf.setDrawColor(...COLORS.line);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_MARGIN, y + 2.2, A4_WIDTH_MM - PAGE_MARGIN, y + 2.2);
  return y + 7;
};

const fitImage = (pdf, image, x, y, width, height) => {
  if (!image?.data) return false;
  try {
    const properties = pdf.getImageProperties(image.data);
    const ratio = Math.min(width / properties.width, height / properties.height);
    const renderedWidth = properties.width * ratio;
    const renderedHeight = properties.height * ratio;
    pdf.addImage(image.data, image.format, x + (width - renderedWidth) / 2, y + (height - renderedHeight) / 2, renderedWidth, renderedHeight, undefined, 'FAST');
    return true;
  } catch {
    return false;
  }
};

const blobToDataUrl = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return `data:${blob.type || 'image/png'};base64,${globalThis.btoa(binary)}`;
};

const loadPdfImage = async (url, { fetchImpl = globalThis.fetch, documentRef } = {}) => {
  const source = clean(url);
  if (!source || typeof fetchImpl !== 'function') return null;
  try {
    const absolute = source.startsWith('/') && documentRef?.location?.origin ? new URL(source, documentRef.location.origin).href : source;
    const response = await fetchImpl(absolute, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!String(blob.type || '').startsWith('image/')) return null;
    const data = await blobToDataUrl(blob);
    const format = /jpe?g/i.test(blob.type) ? 'JPEG' : /webp/i.test(blob.type) ? 'WEBP' : 'PNG';
    return { data, format };
  } catch {
    return null;
  }
};

const cleanUrl = (value) => {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
};

const bytesToBinary = (bytes) => {
  let result = '';
  const chunkSize = 32768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return result;
};

const extractPdfUriStrings = (binary) => {
  const values = [];
  const marker = /\/URI\s*\(/g;
  let match;
  while ((match = marker.exec(binary))) {
    let cursor = marker.lastIndex;
    let depth = 1;
    let value = '';
    while (cursor < binary.length && depth > 0) {
      const character = binary[cursor];
      if (character === '\\') {
        const escaped = binary[cursor + 1];
        if (/[0-7]/.test(escaped || '')) {
          const octal = binary.slice(cursor + 1).match(/^[0-7]{1,3}/)?.[0] || '';
          value += String.fromCharCode(Number.parseInt(octal, 8));
          cursor += octal.length + 1;
          continue;
        }
        const escapedCharacters = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
        if (escaped === '\r' && binary[cursor + 2] === '\n') cursor += 1;
        else if (escaped !== '\r' && escaped !== '\n') value += escapedCharacters[escaped] ?? escaped ?? '';
        cursor += 2;
        continue;
      }
      if (character === '(') {
        depth += 1;
        value += character;
      } else if (character === ')') {
        depth -= 1;
        if (depth > 0) value += character;
      } else {
        value += character;
      }
      cursor += 1;
    }
    if (depth === 0) values.push(value);
    marker.lastIndex = cursor;
  }
  return values;
};

export const auditPlayerPdfLinkAnnotations = (arrayBuffer, expectedUrls = []) => {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer || 0);
  const binary = bytesToBinary(bytes);
  const urls = extractPdfUriStrings(binary);
  const linkAnnotations = (binary.match(/\/Subtype\s*\/Link\b/g) || []).length;
  const expected = expectedUrls.map(cleanUrl).filter(Boolean);
  const missingUrls = [...new Set(expected)].filter((url) => !urls.includes(url));
  return {
    bytes: bytes.length,
    linkAnnotations,
    uriAnnotations: urls.length,
    urls,
    expectedUrls: expected,
    missingUrls,
    valid: (!expected.length || linkAnnotations > 0) && missingUrls.length === 0,
  };
};

const drawHeader = (pdf, report, section) => {
  pdf.setFillColor(...COLORS.navy);
  pdf.rect(0, 0, A4_WIDTH_MM, 13, 'F');
  text(pdf, 'APPCAUDAL · DOSSIER DE RENDIMIENTO', PAGE_MARGIN, 7.7, { size: 6.5, style: 'bold', color: COLORS.paper });
  text(pdf, report.identity?.name || 'Jugador', A4_WIDTH_MM - PAGE_MARGIN, 5.8, { size: 7, style: 'bold', color: COLORS.paper, align: 'right' });
  text(pdf, section, A4_WIDTH_MM - PAGE_MARGIN, 9.4, { size: 5.2, style: 'normal', color: [196, 214, 231], align: 'right' });
};

const drawFooter = (pdf, report, page, total) => {
  pdf.setDrawColor(...COLORS.line);
  pdf.line(PAGE_MARGIN, 287, A4_WIDTH_MM - PAGE_MARGIN, 287);
  const teamSeasonContact = [clean(report.identity?.team), clean(report.identity?.season), PROFESSIONAL_CONTACT].filter(Boolean).join(' · ');
  text(pdf, teamSeasonContact || `Dossier individual · ${PROFESSIONAL_CONTACT}`, PAGE_MARGIN, 291.7, { size: 5.2, color: COLORS.muted });
  text(pdf, `Página ${page} de ${total}`, A4_WIDTH_MM - PAGE_MARGIN, 291.7, { size: 5.5, style: 'bold', color: COLORS.muted, align: 'right' });
};

const drawKpis = (pdf, report, y) => {
  const summary = report.seasonSummary || {};
  const primary = [
    ['Partidos', summary.played],
    ['Titularidades', summary.starts],
    ['Minutos', `${number(summary.minutes)}'`],
    ['Min/partido', `${number(summary.minutesPerMatch)}'`],
    ['% titularidad', `${number(summary.starterPercentage)}%`],
  ];
  const width = CONTENT_WIDTH / primary.length;
  primary.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + width * index;
    if (index) {
      pdf.setDrawColor(...COLORS.line);
      pdf.line(x, y, x, y + 20);
    }
    text(pdf, value, x + width / 2, y + 9, { size: 17, style: 'bold', color: COLORS.navy, align: 'center' });
    text(pdf, label.toUpperCase(), x + width / 2, y + 15, { size: 5.2, style: 'bold', color: COLORS.muted, align: 'center' });
  });
  const secondary = [
    ['Goles', summary.goals], ['Asistencias', summary.assists], ['G+A', summary.goalContributions],
    ['Amarillas', summary.yellow], ['Rojas', summary.red], ['Lesiones', summary.injuries], ['Desde banquillo', summary.benchEntries],
  ];
  const secondaryWidth = CONTENT_WIDTH / secondary.length;
  secondary.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + secondaryWidth * index;
    pdf.setFillColor(...(index < 3 ? [239, 247, 251] : COLORS.panel));
    pdf.rect(x + 0.5, y + 23, secondaryWidth - 1, 12, 'F');
    text(pdf, hasValue(value) ? value : 0, x + secondaryWidth / 2, y + 28.3, { size: 9.5, style: 'bold', color: index < 3 ? COLORS.blue : COLORS.ink, align: 'center' });
    text(pdf, label.toUpperCase(), x + secondaryWidth / 2, y + 32.6, { size: 4.3, style: 'bold', color: COLORS.muted, align: 'center' });
  });
  return y + 40;
};

const drawIdentity = (pdf, report, images, y) => {
  const identity = report.identity || {};
  const scope = getPlayerPdfScope(report);
  const photoSize = 32;
  pdf.setFillColor(...COLORS.paper);
  pdf.setDrawColor(...COLORS.line);
  pdf.roundedRect(PAGE_MARGIN, y, photoSize, photoSize, 1.5, 1.5, 'FD');
  if (!fitImage(pdf, images.player, PAGE_MARGIN + 1, y + 1, photoSize - 2, photoSize - 2)) {
    const initials = clean(identity.name).split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2);
    text(pdf, initials, PAGE_MARGIN + photoSize / 2, y + 19, { size: 16, style: 'bold', color: COLORS.blue, align: 'center' });
  }
  const copyX = PAGE_MARGIN + photoSize + 6;
  text(pdf, 'PERFIL PROFESIONAL DE RENDIMIENTO', copyX, y + 4.5, { size: 5.5, style: 'bold', color: COLORS.electric });
  singleLineText(pdf, clean(identity.name).toUpperCase() || 'JUGADOR', copyX, y + 11.5, { size: 14.5, minSize: 10.5, style: 'bold', color: COLORS.navy, maxWidth: 99 });
  const attributeColumns = [
    [identity.number ? `#${identity.number}` : '', identity.position],
    [identity.age, normalizeFootLabel(identity.foot)],
  ];
  attributeColumns.forEach((column, columnIndex) => {
    const columnX = copyX + columnIndex * 49;
    singleLineText(pdf, column[0], columnX, y + 17.5, { size: 7.2, minSize: 6, style: 'bold', color: COLORS.ink, maxWidth: 44 });
    singleLineText(pdf, column[1], columnX, y + 22.5, { size: 6.4, minSize: 5.3, color: COLORS.muted, maxWidth: 44 });
  });
  const teamY = y + 29.2;
  const teamCopyX = copyX + (images.team ? 11 : 0);
  if (images.team) {
    pdf.setFillColor(...COLORS.paper);
    pdf.setDrawColor(...COLORS.line);
    pdf.roundedRect(copyX, y + 24, 9, 9, 1, 1, 'FD');
    fitImage(pdf, images.team, copyX + 0.8, y + 24.8, 7.4, 7.4);
  }
  singleLineText(pdf, clean(identity.team).toUpperCase() || 'EQUIPO NO REGISTRADO', teamCopyX, teamY, { size: 6.8, minSize: 5.5, style: 'bold', color: COLORS.blue, maxWidth: images.team ? 82 : 93 });
  text(pdf, scope.season ? `Temporada ${scope.season}` : 'Temporada —', teamCopyX, y + 33.5, { size: 5.3, color: COLORS.muted });

  const scopeX = 157;
  pdf.setDrawColor(...COLORS.line);
  pdf.setLineWidth(0.25);
  pdf.line(scopeX - 4, y + 1, scopeX - 4, y + 33);
  text(pdf, 'ÁMBITO DEL DOSSIER', scopeX, y + 4.5, { size: 5.2, style: 'bold', color: COLORS.muted });
  text(pdf, scope.season ? `Temporada ${scope.season}` : 'Temporada —', scopeX, y + 11, { size: 7.2, style: 'bold', color: COLORS.navy, maxWidth: 40 });
  singleLineText(pdf, scope.competition, scopeX, y + 17.5, { size: 6.2, minSize: 5, color: COLORS.ink, maxWidth: 40 });
  singleLineText(pdf, scope.venue, scopeX, y + 23.5, { size: 6.2, minSize: 5, color: COLORS.ink, maxWidth: 40 });
  return y + 40;
};

const drawCompetitionTable = (pdf, competitions, y, sectionNumber) => {
  const competitionRows = rows(competitions);
  if (!competitionRows.length) return y;
  y = sectionTitle(pdf, 'Rendimiento por competición', y, sectionNumber);
  const widths = [58, 16, 16, 22, 22, 16, 16, 20];
  const headers = ['Competición', 'PJ', 'Tit.', 'Min', 'Min/PJ', 'G', 'A', 'G+A'];
  let x = PAGE_MARGIN;
  pdf.setFillColor(...COLORS.navy);
  pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 7, 'F');
  headers.forEach((header, index) => {
    text(pdf, header, x + (index ? widths[index] / 2 : 2), y + 4.6, { size: 5.2, style: 'bold', color: COLORS.paper, align: index ? 'center' : 'left' });
    x += widths[index];
  });
  y += 7;
  competitionRows.forEach((row, rowIndex) => {
    if (rowIndex % 2 === 0) {
      pdf.setFillColor(...COLORS.panel);
      pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 7.2, 'F');
    }
    const minutesPerMatch = hasValue(row.minutesPerMatch)
      ? row.minutesPerMatch
      : number(row.played) > 0 ? Math.round(number(row.minutes) / number(row.played)) : 0;
    const values = [row.label, row.played, row.starts, `${row.minutes}'`, `${minutesPerMatch}'`, row.goals, row.assists, row.goalContributions];
    x = PAGE_MARGIN;
    values.forEach((value, index) => {
      text(pdf, value, x + (index ? widths[index] / 2 : 2), y + 4.7, { size: 6.1, style: index === 6 ? 'bold' : 'normal', color: COLORS.ink, align: index ? 'center' : 'left', maxWidth: index ? 0 : widths[index] - 4 });
      x += widths[index];
    });
    y += 7.2;
  });
  return y + 5;
};

const drawPositionPitch = (pdf, model, x, y, width, height) => {
  pdf.setFillColor(...COLORS.green);
  pdf.setDrawColor(...COLORS.greenAlt);
  pdf.roundedRect(x, y, width, height, 1.6, 1.6, 'FD');
  pdf.setDrawColor(218, 242, 230);
  pdf.setLineWidth(0.35);
  pdf.rect(x + 2, y + 2, width - 4, height - 4);
  pdf.line(x + 2, y + height / 2, x + width - 2, y + height / 2);
  pdf.circle(x + width / 2, y + height / 2, Math.min(width, height) * 0.1);
  pdf.rect(x + width * 0.24, y + 2, width * 0.52, height * 0.16);
  pdf.rect(x + width * 0.24, y + height * 0.84 - 2, width * 0.52, height * 0.16);
  text(pdf, 'ATAQUE', x + width / 2 - 1.5, y - 2, { size: 4.4, style: 'bold', color: COLORS.green, align: 'center' });
  pdf.setDrawColor(...COLORS.green);
  pdf.setLineWidth(0.45);
  pdf.line(x + width / 2 + 7, y - 1, x + width / 2 + 7, y - 5);
  pdf.line(x + width / 2 + 7, y - 5, x + width / 2 + 5.8, y - 3.6);
  pdf.line(x + width / 2 + 7, y - 5, x + width / 2 + 8.2, y - 3.6);
  model.markers.forEach((position) => {
    const markerX = x + 2 + position.coordinates.x * (width - 4);
    const markerY = y + 2 + position.coordinates.y * (height - 4);
    const radius = position.level === 'principal' ? 2.5 : position.level === 'secondary' ? 2.1 : 1.8;
    if (position.level === 'principal') {
      pdf.setFillColor(102, 213, 241);
      pdf.circle(markerX, markerY, 3.7, 'F');
    }
    pdf.setFillColor(...(position.level === 'other' ? [148, 163, 184] : COLORS.electric));
    pdf.setDrawColor(...COLORS.paper);
    pdf.setLineWidth(position.level === 'principal' ? 0.65 : 0.45);
    pdf.circle(markerX, markerY, radius, 'FD');
    text(pdf, position.markerNumber, markerX, markerY + 0.8, { size: 4.1, style: 'bold', color: COLORS.navy, align: 'center' });
  });
};

const drawPositionUsageMap = (pdf, usage, y, sectionNumber) => {
  const model = buildPlayerPositionMapModel(usage);
  const formatMinutes = (value) => Math.round(number(value)).toLocaleString('es-ES');
  y = sectionTitle(pdf, 'Posiciones utilizadas', y, sectionNumber);
  if (model.empty) {
    text(pdf, 'Sin minutos registrados para este filtro.', PAGE_MARGIN + 2, y + 5.2, { size: 6.4, color: COLORS.muted });
    return y + 10;
  }
  if (!model.hasPositionData) {
    text(pdf, 'Sin información posicional suficiente para este filtro.', PAGE_MARGIN + 2, y + 5.2, { size: 6.4, color: COLORS.muted });
    if (model.unknownPositionMinutes) text(pdf, `${formatMinutes(model.unknownPositionMinutes)}' sin posición registrada`, PAGE_MARGIN + 2, y + 10, { size: 4.9, color: COLORS.muted });
    return y + (model.unknownPositionMinutes ? 15 : 10);
  }

  const pitchWidth = 31;
  const pitchHeight = 47;
  const pitchX = PAGE_MARGIN + 2;
  const pitchY = y + 4;
  drawPositionPitch(pdf, model, pitchX, pitchY, pitchWidth, pitchHeight);
  const legendX = pitchX + pitchWidth + 8;
  const legendWidth = Math.min(105, A4_WIDTH_MM - PAGE_MARGIN - legendX);
  const legendRight = legendX + legendWidth;
  text(pdf, 'DISTRIBUCIÓN', legendX, y + 3.5, { size: 4.8, style: 'bold', color: COLORS.muted });
  model.positions.forEach((position, index) => {
    const rowY = y + 7 + index * 8.5;
    const markerColor = position.level === 'other' ? [148, 163, 184] : COLORS.electric;
    pdf.setFillColor(...markerColor);
    pdf.setDrawColor(...COLORS.paper);
    pdf.circle(legendX + 2.2, rowY + 2.2, position.level === 'principal' ? 2.2 : 1.8, 'FD');
    if (position.coordinates) text(pdf, position.markerNumber, legendX + 2.2, rowY + 2.9, { size: 3.7, style: 'bold', color: COLORS.navy, align: 'center' });
    else text(pdf, '—', legendX + 2.2, rowY + 2.9, { size: 4, style: 'bold', color: COLORS.muted, align: 'center' });
    text(pdf, position.levelLabel.toUpperCase(), legendX + 6, rowY, { size: 4.1, style: 'bold', color: position.level === 'principal' ? COLORS.blue : COLORS.muted });
    singleLineText(pdf, position.position, legendX + 6, rowY + 4, { size: 6.2, minSize: 5.2, style: 'bold', color: COLORS.ink, maxWidth: legendWidth - 48 });
    text(pdf, `${formatMinutes(position.minutes)}' · ${position.percentage}%`, legendRight, rowY + 4, { size: 5.8, style: 'bold', color: COLORS.blue, align: 'right' });
    if (index < model.positions.length - 1) {
      pdf.setDrawColor(...COLORS.line);
      pdf.line(legendX + 6, rowY + 6.2, legendRight, rowY + 6.2);
    }
  });
  const contentHeight = Math.max(pitchHeight + 4, 8 + model.positions.length * 8.5);
  if (model.unknownPositionMinutes) text(pdf, `${formatMinutes(model.unknownPositionMinutes)}' sin posición registrada`, PAGE_MARGIN + 2, y + contentHeight + 4, { size: 4.9, style: 'bold', color: COLORS.muted });
  if (model.unmappedPositions.length) text(pdf, 'Las posiciones sin coordenada específica se conservan sin inventar un punto.', legendX, y + contentHeight + 4, { size: 4.2, color: COLORS.muted, maxWidth: legendWidth });
  return y + contentHeight + (model.unknownPositionMinutes || model.unmappedPositions.length ? 8 : 4);
};

const drawHistoryHeader = (pdf, y) => {
  const widths = [16, 46, 16, 28, 7, 14, 9, 8, 8, 18, 16];
  const headers = ['Fecha', 'Rival', 'Resultado', 'Competición', 'L/V', 'Rol', 'Min', 'G', 'A', 'Tarjetas', 'Lesión'];
  pdf.setFillColor(...COLORS.navy);
  pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 7, 'F');
  let x = PAGE_MARGIN;
  headers.forEach((header, index) => {
    text(pdf, header, x + (index === 1 || index === 3 ? 1.5 : widths[index] / 2), y + 4.7, { size: 4.6, style: 'bold', color: COLORS.paper, align: index === 1 || index === 3 ? 'left' : 'center' });
    x += widths[index];
  });
  return { y: y + 7, widths };
};

const drawHistoryLinks = (pdf, links, count, x, y, width) => {
  const urls = rows(links).map(cleanUrl).filter(Boolean);
  if (!urls.length) {
    text(pdf, count, x + width / 2, y, { size: 5.8, color: COLORS.ink, align: 'center' });
    return;
  }
  const itemWidth = Math.min(5.2, (width - 1) / urls.length);
  urls.forEach((url, index) => {
    const itemX = x + (width - itemWidth * urls.length) / 2 + itemWidth * index;
    pdf.setFillColor(223, 244, 251);
    pdf.roundedRect(itemX, y - 4, itemWidth - 0.5, 4.6, 0.7, 0.7, 'F');
    pdf.setFillColor(...COLORS.blue);
    pdf.triangle(itemX + 0.8, y - 3.1, itemX + 0.8, y - 1.2, itemX + 2.2, y - 2.15, 'F');
    text(pdf, urls.length > 1 ? index + 1 : count, itemX + 3.15, y - 0.8, { size: 4.2, style: 'bold', color: COLORS.blue, align: 'center' });
    pdf.link(itemX, y - 4, itemWidth - 0.5, 4.6, { url });
  });
};

const compactPitchZoneLabel = (zone = {}, index = 0) => {
  const source = clean(zone.id || zone.key || zone.label || zone.shortLabel).toLowerCase();
  const band = source.includes('final') ? 'FINAL.' : source.includes('creaci') ? 'CREACIÓN' : source.includes('inicio') ? 'INICIO' : '';
  const side = source.includes('izq') ? 'IZQ' : source.includes('der') ? 'DER' : source.includes('cent') ? 'CENTRO' : ['IZQ', 'CENTRO', 'DER'][index % 3];
  return [band, side].filter(Boolean).join(' ');
};

const drawHistoryRow = (pdf, row, y, widths, rivalImage, rowIndex) => {
  const height = 8.2;
  if (rowIndex % 2 === 0) {
    pdf.setFillColor(...COLORS.panel);
    pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, height, 'F');
  }
  let x = PAGE_MARGIN;
  const center = (value, index, options = {}) => text(pdf, value, x + widths[index] / 2, y + 5.2, { size: 5.3, color: COLORS.ink, align: 'center', ...options });
  center(row.date, 0);
  x += widths[0];
  if (rivalImage) fitImage(pdf, rivalImage, x + 1, y + 1.3, 5.5, 5.5);
  singleLineText(pdf, row.opponent || 'Rival', x + (rivalImage ? 8 : 1.5), y + 5.1, { size: 5.5, minSize: 4.8, style: 'bold', color: COLORS.ink, maxWidth: widths[1] - (rivalImage ? 9 : 3) });
  x += widths[1];
  const outcomeColor = row.outcome === 'V' ? COLORS.win : row.outcome === 'D' ? COLORS.loss : row.outcome === 'E' ? COLORS.draw : COLORS.muted;
  center([row.outcome, row.result].filter(Boolean).join(' · '), 2, { style: 'bold', color: outcomeColor });
  x += widths[2];
  singleLineText(pdf, row.competition, x + 1.5, y + 5.1, { size: 5.2, minSize: 4.6, color: COLORS.ink, maxWidth: widths[3] - 3 });
  x += widths[3]; center(row.venue, 4); x += widths[4]; center(row.role, 5); x += widths[5]; center(row.minutes, 6, { style: 'bold' }); x += widths[6];
  drawHistoryLinks(pdf, row.goalLinks, row.goals, x, y + 5.3, widths[7]); x += widths[7];
  drawHistoryLinks(pdf, row.assistLinks, row.assists, x, y + 5.3, widths[8]); x += widths[8];
  center(row.cards, 9); x += widths[9]; center(row.injury, 10);
  return y + height;
};

const drawPitch = (pdf, map, x, y, width, height) => {
  const zones = rows(map?.zones);
  const total = zones.reduce((sum, zone) => sum + number(zone.count), 0);
  const empty = total === 0;
  pdf.setFillColor(...(empty ? [226, 236, 232] : COLORS.green));
  pdf.roundedRect(x, y, width, height, 1.2, 1.2, 'F');
  pdf.setDrawColor(...(empty ? [176, 195, 187] : [221, 241, 231]));
  pdf.setLineWidth(0.35);
  pdf.rect(x + 2, y + 2, width - 4, height - 4);
  pdf.line(x + 2, y + height / 2, x + width - 2, y + height / 2);
  pdf.circle(x + width / 2, y + height / 2, Math.min(width, height) * 0.11);
  pdf.rect(x + width * 0.23, y + 2, width * 0.54, height * 0.18);
  pdf.rect(x + width * 0.23, y + height * 0.82 - 2, width * 0.54, height * 0.18);
  const max = Math.max(1, ...zones.map((zone) => number(zone.count)));
  const cellWidth = (width - 4) / 3;
  const cellHeight = (height - 4) / 3;
  zones.slice(0, 9).forEach((zone, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const cellX = x + 2 + column * cellWidth;
    const cellY = y + 2 + row * cellHeight;
    const count = number(zone.count);
    if (count > 0) {
      const intensity = Math.round(68 - (count / max) * 22);
      pdf.setFillColor(20, 91 + intensity, 123 + intensity);
      pdf.rect(cellX + 0.4, cellY + 0.4, cellWidth - 0.8, cellHeight - 0.8, 'F');
    }
    text(pdf, compactPitchZoneLabel(zone, index), cellX + cellWidth / 2, cellY + 4.5, { size: 4.35, style: 'bold', color: empty ? COLORS.muted : COLORS.paper, align: 'center', maxWidth: cellWidth - 2 });
    if (count > 0) text(pdf, count, cellX + cellWidth / 2, cellY + cellHeight / 2 + 4.5, { size: 8, style: 'bold', color: COLORS.paper, align: 'center' });
  });
  text(pdf, 'ATAQUE', x + width / 2 - 1, y - 2, { size: 4.5, style: 'bold', color: COLORS.green, align: 'center' });
  pdf.setDrawColor(...COLORS.green);
  pdf.setLineWidth(0.45);
  pdf.line(x + width / 2 + 9, y - 1, x + width / 2 + 9, y - 5);
  pdf.line(x + width / 2 + 9, y - 5, x + width / 2 + 7.8, y - 3.7);
  pdf.line(x + width / 2 + 9, y - 5, x + width / 2 + 10.2, y - 3.7);
  const emptyLabel = map?.key === 'goals'
    ? 'Sin zonas de gol registradas'
    : map?.key === 'assists' ? 'Sin zonas de asistencia registradas' : 'Sin zonas de acciones registradas';
  text(pdf, total ? `${total} ${total === 1 ? 'acción' : 'acciones'} con zona` : emptyLabel, x + width / 2, y + height + 4.2, { size: 4.7, style: empty ? 'bold' : 'normal', color: COLORS.muted, align: 'center' });
};

const drawProductionMaps = (pdf, maps, y, sectionNumber) => {
  y = sectionTitle(pdf, 'Zonas de producción', y, sectionNumber);
  const gap = 5;
  const width = (CONTENT_WIDTH - gap * 2) / 3;
  const height = 54;
  rows(maps).slice(0, 3).forEach((map, index) => {
    const x = PAGE_MARGIN + index * (width + gap);
    text(pdf, map.key === 'all' ? 'TODAS LAS ACCIONES' : clean(map.label).toUpperCase(), x + width / 2, y + 2, { size: 5.5, style: 'bold', color: COLORS.blue, align: 'center' });
    drawPitch(pdf, map, x, y + 7, width, height);
  });
  return y + height + 16;
};

const drawProductionMetrics = (pdf, production, y, sectionNumber) => {
  y = sectionTitle(pdf, 'Producción ofensiva', y, sectionNumber);
  const metrics = [['Goles/90', production?.goalsPer90], ['Asist./90', production?.assistsPer90], ['G+A/90', production?.goalContributionsPer90], ['G+A total', production?.goalContributions]];
  const width = CONTENT_WIDTH / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + width * index;
    pdf.setFillColor(...(index < 3 ? [242, 248, 252] : COLORS.panel));
    pdf.setDrawColor(...COLORS.line);
    pdf.roundedRect(x + 1, y, width - 2, 17, 1, 1, 'FD');
    text(pdf, hasValue(value) ? value : 0, x + width / 2, y + 8, { size: 13, style: 'bold', color: COLORS.blue, align: 'center' });
    text(pdf, label.toUpperCase(), x + width / 2, y + 13.5, { size: 4.8, style: 'bold', color: COLORS.muted, align: 'center' });
  });
  return y + 21;
};

const sortConnections = (connections) => rows(connections)
  .slice()
  .sort((left, right) => number(right.count) - number(left.count)
    || clean(left.from).localeCompare(clean(right.from), 'es')
    || clean(left.to).localeCompare(clean(right.to), 'es'));

const drawConnections = (pdf, connections, y, sectionNumber, limit = Infinity) => {
  const connectionRows = sortConnections(connections).slice(0, limit);
  if (!connectionRows.length) return y;
  y = sectionTitle(pdf, 'Conexiones ofensivas', y, sectionNumber);
  connectionRows.forEach((connection) => {
    const direction = connection.direction === 'received' ? 'recibida' : connection.direction === 'given' ? 'dada' : '';
    const countLabel = `${connection.count} ${connection.count === 1 ? 'asistencia' : 'asistencias'}${direction ? ` ${connection.count === 1 ? direction : `${direction}s`}` : ''}`;
    const routeX = PAGE_MARGIN + 2;
    const nameWidth = 59;
    const arrowStart = routeX + nameWidth + 4;
    const arrowEnd = arrowStart + 14;
    setText(pdf, { size: 6.3, style: 'bold', color: COLORS.ink });
    const fromLines = pdf.splitTextToSize(clean(connection.from), nameWidth);
    const toLines = pdf.splitTextToSize(clean(connection.to), nameWidth);
    const lineStep = 2.8;
    const rowHeight = Math.max(10, 6 + (Math.max(fromLines.length, toLines.length) - 1) * lineStep);
    const centerY = y + rowHeight / 2;
    pdf.text(fromLines, routeX + nameWidth, centerY - ((fromLines.length - 1) * lineStep) / 2 + 1.2, { align: 'right' });
    pdf.setDrawColor(...COLORS.electric);
    pdf.setLineWidth(0.6);
    pdf.line(arrowStart, centerY, arrowEnd, centerY);
    pdf.line(arrowEnd - 2.5, centerY - 1.9, arrowEnd, centerY);
    pdf.line(arrowEnd - 2.5, centerY + 1.9, arrowEnd, centerY);
    setText(pdf, { size: 6.3, style: 'bold', color: COLORS.ink });
    pdf.text(toLines, arrowEnd + 4, centerY - ((toLines.length - 1) * lineStep) / 2 + 1.2);
    singleLineText(pdf, countLabel, A4_WIDTH_MM - PAGE_MARGIN, centerY + 1.2, { size: 5.5, minSize: 4.7, style: 'bold', color: COLORS.blue, maxWidth: 39, align: 'right' });
    pdf.setDrawColor(...COLORS.line);
    pdf.line(PAGE_MARGIN, y + rowHeight, A4_WIDTH_MM - PAGE_MARGIN, y + rowHeight);
    y += rowHeight + 2;
  });
  return y + 2;
};

const drawGoalTarget = (pdf, target, x, y, width) => {
  const zones = rows(target?.zones);
  const max = Math.max(1, ...zones.map((zone) => number(zone.count)));
  const cellWidth = width / 3;
  const cellHeight = 10.5;
  zones.slice(0, 9).forEach((zone, index) => {
    const cellX = x + (index % 3) * cellWidth;
    const cellY = y + Math.floor(index / 3) * cellHeight;
    const count = number(zone.count);
    const shade = count ? Math.round(236 - (count / max) * 44) : 250;
    pdf.setFillColor(shade, Math.min(252, shade + (count ? 7 : 2)), 252);
    pdf.setDrawColor(...COLORS.line);
    pdf.rect(cellX, cellY, cellWidth, cellHeight, 'FD');
    text(pdf, zone.label || String(zone.shortLabel || '').replace(/\n/g, ' '), cellX + cellWidth / 2, cellY + 3.4, { size: 3.25, style: 'bold', color: count ? COLORS.ink : COLORS.muted, align: 'center', maxWidth: cellWidth - 1.2 });
    text(pdf, count, cellX + cellWidth / 2, cellY + 8.9, { size: 7.8, style: 'bold', color: count ? COLORS.blue : COLORS.muted, align: 'center' });
  });
  text(pdf, `${number(target?.known)} con zona${number(target?.missing) ? ` · ${number(target.missing)} sin registrar` : ''}`, x, y + 35, { size: 4.7, color: COLORS.muted });
};

const drawObjectiveAnalysis = (pdf, analysis, y, sectionNumber) => {
  const body = rows(analysis?.bodyParts?.values).filter((row) => number(row.count) > 0);
  const types = rows(analysis?.types?.phases).filter((row) => number(row.count) > 0);
  const target = analysis?.target || {};
  const goalTotal = Math.max(number(analysis?.bodyParts?.total), number(analysis?.types?.total), number(target.total));
  if (!goalTotal) return y;
  y = sectionTitle(pdf, 'Análisis objetivo de finalización', y, sectionNumber);
  const gap = 5;
  const width = (CONTENT_WIDTH - gap * 2) / 3;
  const modules = [
    { title: 'Cómo marca', rows: body, total: number(analysis?.bodyParts?.total) },
    { title: 'Tipo de gol', rows: types, total: number(analysis?.types?.total) },
  ];
  modules.forEach((module, index) => {
    const x = PAGE_MARGIN + index * (width + gap);
    pdf.setFillColor(...COLORS.panel);
    pdf.setDrawColor(...COLORS.line);
    pdf.roundedRect(x, y, width, 47, 1.2, 1.2, 'FD');
    text(pdf, module.title.toUpperCase(), x + 3, y + 5.5, { size: 5.7, style: 'bold', color: COLORS.blue });
    if (!module.rows.length) {
      text(pdf, 'Sin información registrada', x + 3, y + 15, { size: 5.5, style: 'bold', color: COLORS.muted, maxWidth: width - 6 });
    } else {
      const max = Math.max(1, ...module.rows.map((row) => number(row.count)));
      module.rows.slice(0, 5).forEach((row, rowIndex) => {
        const rowY = y + 11 + rowIndex * 6;
        text(pdf, row.label, x + 3, rowY, { size: 5.2, color: COLORS.ink, maxWidth: width - 22 });
        const barX = x + width - 20;
        pdf.setFillColor(228, 235, 242);
        pdf.rect(barX, rowY - 3, 13, 2.3, 'F');
        pdf.setFillColor(...COLORS.blue);
        pdf.rect(barX, rowY - 3, 13 * (number(row.count) / max), 2.3, 'F');
        const percentage = module.total > 0 ? ` · ${Math.round((number(row.count) / module.total) * 100)}%` : '';
        text(pdf, `${row.count}${percentage}`, x + width - 3, rowY, { size: 5.1, style: 'bold', color: COLORS.ink, align: 'right' });
      });
    }
  });
  const targetX = PAGE_MARGIN + 2 * (width + gap);
  pdf.setFillColor(...COLORS.panel);
  pdf.setDrawColor(...COLORS.line);
  pdf.roundedRect(targetX, y, width, 47, 1.2, 1.2, 'FD');
  text(pdf, 'DIANA DE FINALIZACIÓN', targetX + 3, y + 5.5, { size: 5.7, style: 'bold', color: COLORS.blue });
  if (number(target.known)) drawGoalTarget(pdf, target, targetX + 3, y + 8, width - 6);
  else text(pdf, 'Sin zona de portería registrada', targetX + 3, y + 15, { size: 5.5, style: 'bold', color: COLORS.muted, maxWidth: width - 6 });
  return y + 52;
};

const compactActionZoneLabel = (value) => clean(value)
  .replace(/^F\.?\s*/i, '')
  .replace(/^Finalizaci[oó]n\s*/i, '')
  .replace(/^Creaci[oó]n\s*/i, '')
  .trim();

const actionDetailLines = (action) => action.type === 'Gol'
  ? [
    action.phase ? `Tipo de jugada: ${action.phase}` : '',
    action.shotZoneLabel ? `Finalización: ${compactActionZoneLabel(action.shotZoneLabel)}` : '',
    action.contact ? `Golpeo: ${action.contact}` : '',
    action.goalZoneLabel ? `Portería: ${action.goalZoneLabel}` : '',
    action.assistant ? `Asistencia: ${action.assistant}` : '',
  ].filter(Boolean)
  : [
    action.assistZoneLabel ? `Origen: ${compactActionZoneLabel(action.assistZoneLabel)}` : '',
    action.phase ? `Tipo de jugada: ${action.phase}` : '',
    action.scorer ? `Asiste a: ${action.scorer}` : '',
  ].filter(Boolean);

const wrappedActionDetailLines = (pdf, action) => {
  setText(pdf, { size: 5.5, color: COLORS.ink });
  return actionDetailLines(action).flatMap((line) => pdf.splitTextToSize(line, 61));
};

const drawVideoAction = (pdf, action, y, compact = false) => {
  const url = cleanUrl(action.url);
  if (compact) {
    pdf.setDrawColor(...COLORS.line);
    pdf.line(PAGE_MARGIN, y + 8.5, A4_WIDTH_MM - PAGE_MARGIN, y + 8.5);
    text(pdf, `${action.minute || '—'}'`, PAGE_MARGIN + 1, y + 5.5, { size: 7, style: 'bold', color: COLORS.blue });
    text(pdf, action.type, PAGE_MARGIN + 18, y + 5.5, { size: 6.2, style: 'bold', color: COLORS.ink });
    text(pdf, action.opponent || 'Rival', PAGE_MARGIN + 51, y + 5.5, { size: 6.2, color: COLORS.ink, maxWidth: 70 });
    text(pdf, action.competition, PAGE_MARGIN + 125, y + 5.5, { size: 5.5, color: COLORS.muted, maxWidth: 37 });
    if (url) {
      const iconX = A4_WIDTH_MM - PAGE_MARGIN - 19;
      pdf.setFillColor(...COLORS.blue);
      pdf.triangle(iconX, y + 2.7, iconX, y + 5.7, iconX + 2.2, y + 4.2, 'F');
      text(pdf, 'ABRIR', A4_WIDTH_MM - PAGE_MARGIN, y + 5.5, { size: 5.7, style: 'bold', color: COLORS.blue, align: 'right' });
      pdf.link(A4_WIDTH_MM - PAGE_MARGIN - 22, y + 1, 22, 7, { url });
    }
    return y + 9;
  }
  const details = wrappedActionDetailLines(pdf, action);
  const height = Math.max(22, 15 + details.length * 4.2);
  pdf.setFillColor(...COLORS.panel);
  pdf.setDrawColor(...COLORS.line);
  pdf.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, height, 1.2, 1.2, 'FD');
  pdf.setFillColor(...COLORS.blue);
  pdf.circle(PAGE_MARGIN + 4.5, y + 5.5, 1.5, 'F');
  text(pdf, `${action.type.toUpperCase()} · ${action.minute || '—'}'`, PAGE_MARGIN + 9, y + 6.9, { size: 8.8, style: 'bold', color: COLORS.navy });
  singleLineText(pdf, `vs ${action.opponent || 'Rival'}${action.result ? ` · ${action.result}` : ''}`, PAGE_MARGIN + 9, y + 12, { size: 6.2, minSize: 5.1, style: 'bold', color: COLORS.ink, maxWidth: 74 });
  singleLineText(pdf, [action.competition, action.date].filter(Boolean).join(' · '), PAGE_MARGIN + 9, y + 16.5, { size: 5.3, minSize: 4.5, color: COLORS.muted, maxWidth: 74 });
  details.forEach((line, index) => text(pdf, line, PAGE_MARGIN + 88, y + 6.5 + index * 4.2, { size: 5.5, color: COLORS.ink, maxWidth: 61 }));
  if (url) {
    const buttonX = A4_WIDTH_MM - PAGE_MARGIN - 31;
    const buttonY = y + height / 2 - 4;
    pdf.setFillColor(...COLORS.blue);
    pdf.roundedRect(buttonX, buttonY, 29, 8, 1.2, 1.2, 'F');
    pdf.setFillColor(...COLORS.paper);
    pdf.triangle(buttonX + 3.4, buttonY + 2.4, buttonX + 3.4, buttonY + 5.6, buttonX + 5.8, buttonY + 4, 'F');
    text(pdf, 'ABRIR VÍDEO', buttonX + 17, buttonY + 5.2, { size: 5.2, style: 'bold', color: COLORS.paper, align: 'center' });
    pdf.link(buttonX, buttonY, 29, 8, { url });
  }
  return y + height + 3;
};

export const createPlayerProfilePdf = async ({
  report,
  documentRef = globalThis.document,
  JsPdfConstructor = jsPDF,
  fetchImpl = globalThis.fetch,
} = {}) => {
  if (!report?.identity?.name) throw new Error('No se puede generar el PDF: falta el modelo normalizado del jugador.');
  const positionMapModel = buildPlayerPositionMapModel(report.positionUsage);
  if (report.validation?.seasonReason === 'MULTIPLE_SEASONS') throw new Error('No se puede generar el dossier mezclando varias temporadas. Selecciona una temporada concreta.');
  if (report.validation?.production?.valid === false) throw new Error('No se puede generar el dossier: los agregados de producción son contradictorios.');
  if (report.validation?.positionUsage?.valid === false || positionMapModel.totalIdentifiedMinutes > positionMapModel.officialMinutes || number(report.positionUsage?.determinedMinutes) > number(report.positionUsage?.totalMinutes)) {
    throw new Error('No se puede generar el dossier: los minutos por posición superan los minutos reales del jugador.');
  }
  if (!positionMapModel.valid) throw new Error('No se puede generar el dossier: minutos identificados y sin posición no coinciden con los minutos oficiales.');
  const sectionPlan = buildPlayerDossierSectionPlan(report);
  const sectionNumbers = Object.fromEntries(sectionPlan.map((section) => [section.key, section.number]));

  const imageUrls = new Set([
    report.identity?.image,
    report.identity?.teamCrest,
    ...rows(report.history).map((row) => row.opponentCrest),
  ].map(clean).filter(Boolean));
  const imageEntries = await Promise.all([...imageUrls].map(async (url) => [url, await loadPdfImage(url, { fetchImpl, documentRef })]));
  const imageMap = new Map(imageEntries);
  const images = { player: imageMap.get(clean(report.identity?.image)), team: imageMap.get(clean(report.identity?.teamCrest)) };

  const pdf = new JsPdfConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  const pageSections = [];
  const addPage = (section) => {
    if (pageSections.length) pdf.addPage('a4', 'portrait');
    pageSections.push(section);
    drawHeader(pdf, report, section);
    return 20;
  };

  let y = addPage('PERFIL Y RENDIMIENTO COMPETITIVO');
  y = drawIdentity(pdf, report, images, y);
  y = sectionTitle(pdf, `Rendimiento · Temporada ${report.identity.season || '—'}`, y, sectionNumbers.performance);
  y = drawKpis(pdf, report, y);
  y = drawCompetitionTable(pdf, report.competitionBreakdown, y, sectionNumbers.competitions);
  const positionMapHeight = positionMapModel.empty
    ? 17
    : 7 + Math.max(51, 8 + positionMapModel.positions.length * 8.5) + (positionMapModel.unknownPositionMinutes || positionMapModel.unmappedPositions.length ? 8 : 4);
  if (y + positionMapHeight > CONTENT_BOTTOM) y = addPage('POSICIONES UTILIZADAS · CONTINUACIÓN');
  y = drawPositionUsageMap(pdf, report.positionUsage, y, sectionNumbers.positions);

  const history = rows(report.history);
  if (history.length) {
    if (y + 18 > CONTENT_BOTTOM) y = addPage('HISTORIAL · CONTINUACIÓN');
    y = sectionTitle(pdf, 'Historial partido a partido', y, sectionNumbers.history);
    let header = drawHistoryHeader(pdf, y);
    y = header.y;
    history.forEach((row, index) => {
      if (y + 9 > CONTENT_BOTTOM) {
        y = addPage('HISTORIAL · CONTINUACIÓN');
        y = sectionTitle(pdf, 'Historial partido a partido · continuación', y, sectionNumbers.history);
        header = drawHistoryHeader(pdf, y);
        y = header.y;
      }
      y = drawHistoryRow(pdf, row, y, header.widths, imageMap.get(clean(row.opponentCrest)), index);
    });
  } else {
    y = sectionTitle(pdf, 'Historial partido a partido', y, sectionNumbers.history);
    text(pdf, 'Sin partidos registrados en el ámbito seleccionado.', PAGE_MARGIN, y + 3, { size: 6.5, color: COLORS.muted });
  }

  if (sectionPlan.some((section) => ['zones', 'production', 'connections', 'goalAnalysis', 'videos'].includes(section.key))) {
    y = addPage('PRODUCCIÓN, ZONAS Y VÍDEO');
    if (sectionNumbers.zones) y = drawProductionMaps(pdf, report.influenceMaps, y, sectionNumbers.zones);
    if (sectionNumbers.production) y = drawProductionMetrics(pdf, report.production, y, sectionNumbers.production);
    const sortedOffensiveConnections = sortConnections(report.offensiveConnections);
    const productionConnections = sortedOffensiveConnections.slice(0, 5);
    if (productionConnections.length) {
      if (y + 69 > CONTENT_BOTTOM) y = addPage('CONEXIONES OFENSIVAS');
      y = drawConnections(pdf, productionConnections, y, sectionNumbers.connections, 5);
    }
    const hasGoalAnalysis = number(report.goalAnalysis?.bodyParts?.total)
      || number(report.goalAnalysis?.types?.total)
      || number(report.goalAnalysis?.target?.total);
    if (hasGoalAnalysis) {
      if (y + 49 > CONTENT_BOTTOM) y = addPage('ANÁLISIS OBJETIVO DE FINALIZACIÓN');
      y = drawObjectiveAnalysis(pdf, report.goalAnalysis, y, sectionNumbers.goalAnalysis);
    }

    const videoActions = rows(report.videoActions);
    if (videoActions.length) {
      if (y + 31 > CONTENT_BOTTOM) y = addPage('ACCIONES EN VÍDEO');
      y = sectionTitle(pdf, 'Acciones en vídeo', y, sectionNumbers.videos);
      videoActions.forEach((action) => {
        const estimated = Math.max(25, 18 + wrappedActionDetailLines(pdf, action).length * 4.2);
        if (y + estimated > CONTENT_BOTTOM) {
          y = addPage('ACCIONES EN VÍDEO · CONTINUACIÓN');
          y = sectionTitle(pdf, 'Acciones en vídeo · continuación', y, sectionNumbers.videos);
        }
        y = drawVideoAction(pdf, action, y);
      });
    }
  }

  pageSections.forEach((_, index) => {
    pdf.setPage(index + 1);
    drawFooter(pdf, report, index + 1, pageSections.length);
  });

  const expectedVideoUrls = [
    ...rows(report.videoActions).map((action) => cleanUrl(action.url)),
    ...rows(report.history).flatMap((row) => [...rows(row.goalLinks), ...rows(row.assistLinks)].map(cleanUrl)),
  ].filter(Boolean);
  const arrayBuffer = pdf.output('arraybuffer');
  const audit = auditPlayerPdfLinkAnnotations(arrayBuffer, expectedVideoUrls);
  if (!audit.valid) throw new Error(`El PDF generado no conserva todos los enlaces de vídeo (${audit.linkAnnotations} anotaciones; ${audit.missingUrls.length} URL ausentes).`);
  return {
    arrayBuffer,
    audit,
    pages: pageSections.length,
    pageSections,
    vector: true,
    presentationAudit: {
      clubIdentity: {
        name: clean(report.identity?.team),
        crestSource: clean(report.identity?.teamCrest),
        crestLoaded: Boolean(images.team?.data),
        season: getPlayerPdfScope(report).season,
      },
      scope: getPlayerPdfScope(report),
      playerPhoto: {
        background: 'white',
        fit: 'contain',
        centered: true,
        imageLoaded: Boolean(images.player?.data),
        source: clean(report.identity?.image),
      },
      positions: positionMapModel.positions.map((position) => ({
        position: position.position,
        minutes: position.minutes,
        percentage: position.percentage,
      })),
      positionMap: {
        vector: true,
        orientation: PLAYER_POSITION_MAP_ORIENTATION,
        officialMinutes: positionMapModel.officialMinutes,
        identifiedMinutes: positionMapModel.totalIdentifiedMinutes,
        unknownMinutes: positionMapModel.unknownPositionMinutes,
        markers: positionMapModel.markers.map((position) => ({
          position: position.position,
          level: position.level,
          x: position.coordinates.x,
          y: position.coordinates.y,
        })),
        unmappedPositions: positionMapModel.unmappedPositions.map((position) => position.position),
      },
      connections: sortConnections(report.offensiveConnections).map((connection) => ({
        from: clean(connection.from),
        to: clean(connection.to),
        count: number(connection.count),
      })),
      sectionPlan,
      visibleConnections: sortConnections(report.offensiveConnections).slice(0, 5).map((connection) => ({
        from: clean(connection.from),
        to: clean(connection.to),
        count: number(connection.count),
      })),
      footer: {
        contact: PROFESSIONAL_CONTACT,
        pages: pageSections.length,
      },
    },
  };
};

export const downloadPlayerProfilePdf = ({ arrayBuffer, filename = 'informe-individual.pdf', documentRef = document, urlApi = URL } = {}) => {
  const blobUrl = urlApi.createObjectURL(new Blob([arrayBuffer], { type: 'application/pdf' }));
  const link = documentRef.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.style.display = 'none';
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => urlApi.revokeObjectURL(blobUrl), 1000);
};

export const exportPlayerProfilePdf = async (options = {}) => {
  const result = await createPlayerProfilePdf(options);
  downloadPlayerProfilePdf({ ...options, arrayBuffer: result.arrayBuffer });
  return result;
};
