import { jsPDF } from 'jspdf';
import {
  PLAYER_POSITION_MAP_ORIENTATION,
  buildPlayerPositionMapModel,
} from './playerPositionMap.js';
import {
  buildPlayerCompetitionProfile,
  buildPlayerDossierSectionPlan,
  buildPlayerProductionMapLayout,
} from './playerProfilePrintReport.js';

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

const IMAGE_FORMAT_BY_MIME = Object.freeze({
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
});

const loadPlayerPdfImageFallback = async (source, directFailure, fallbackLoader) => {
  if (typeof fallbackLoader !== 'function') return directFailure;
  try {
    const fallback = await fallbackLoader(source, directFailure);
    const mimeType = clean(fallback?.mimeType).toLowerCase();
    const format = IMAGE_FORMAT_BY_MIME[mimeType] || '';
    const data = clean(fallback?.data);
    if (!format || !data.startsWith(`data:${mimeType};base64,`)) {
      return { ...directFailure, fallbackAttempted: true, fallbackError: format ? 'invalid_fallback_data' : `unsupported_mime:${mimeType || 'missing'}` };
    }
    return {
      source,
      data,
      format,
      error: '',
      attempted: true,
      httpStatus: Number.isFinite(Number(fallback?.httpStatus)) ? Number(fallback.httpStatus) : 200,
      mimeType,
      acquisition: 'authenticated_server_fallback',
    };
  } catch (error) {
    return { ...directFailure, fallbackAttempted: true, fallbackError: `fallback_failed:${clean(error?.message) || 'unknown'}` };
  }
};

export const loadPlayerPdfImage = async (url, { fetchImpl = globalThis.fetch, documentRef, fallbackLoader } = {}) => {
  const source = clean(url);
  if (!source) return { source: '', data: '', format: '', error: 'missing_source', attempted: false, httpStatus: null, mimeType: '' };
  if (typeof fetchImpl !== 'function') return loadPlayerPdfImageFallback(source, { source, data: '', format: '', error: 'fetch_unavailable', attempted: false, httpStatus: null, mimeType: '' }, fallbackLoader);
  let response;
  try {
    const absolute = source.startsWith('/') && documentRef?.location?.origin ? new URL(source, documentRef.location.origin).href : source;
    response = await fetchImpl(absolute, { mode: 'cors', credentials: 'omit' });
  } catch (error) {
    return loadPlayerPdfImageFallback(source, { source, data: '', format: '', error: `fetch_failed:${clean(error?.message) || 'unknown'}`, attempted: true, httpStatus: null, mimeType: '' }, fallbackLoader);
  }
  const httpStatus = Number.isFinite(Number(response?.status)) ? Number(response.status) : null;
  if (!response?.ok) return loadPlayerPdfImageFallback(source, { source, data: '', format: '', error: `http_${response?.status || 'error'}`, attempted: true, httpStatus, mimeType: '' }, fallbackLoader);
  let blob;
  try {
    blob = await response.blob();
  } catch (error) {
    return loadPlayerPdfImageFallback(source, { source, data: '', format: '', error: `blob_failed:${clean(error?.message) || 'unknown'}`, attempted: true, httpStatus, mimeType: '' }, fallbackLoader);
  }
  const mimeType = String(blob.type || '').toLowerCase();
  if (!IMAGE_FORMAT_BY_MIME[mimeType]) {
    return loadPlayerPdfImageFallback(source, { source, data: '', format: '', error: mimeType ? `unsupported_mime:${mimeType}` : 'missing_mime', attempted: true, httpStatus, mimeType }, fallbackLoader);
  }
  try {
    const data = await blobToDataUrl(blob);
    const format = IMAGE_FORMAT_BY_MIME[mimeType];
    return { source, data, format, error: '', attempted: true, httpStatus, mimeType };
  } catch (error) {
    return loadPlayerPdfImageFallback(source, { source, data: '', format: '', error: `conversion_failed:${clean(error?.message) || 'unknown'}`, attempted: true, httpStatus, mimeType }, fallbackLoader);
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
  const possibleMinutes = number(summary.possibleMinutes);
  const minutesPlayedPercentage = hasValue(summary.minutesPlayedPercentage)
    ? number(summary.minutesPlayedPercentage)
    : possibleMinutes > 0 ? Math.round((number(summary.minutes) / possibleMinutes) * 100) : 0;
  const primary = [
    ['Partidos', summary.played],
    ['Titularidades', summary.starts],
    ['Minutos', `${number(summary.minutes)}'`],
    ['Min/partido', `${number(summary.minutesPerMatch)}'`],
    ['Minutos disputados', `${minutesPlayedPercentage}%`, `${number(summary.minutes)}' de ${possibleMinutes}' posibles`],
  ];
  const width = CONTENT_WIDTH / primary.length;
  primary.forEach(([label, value, detail], index) => {
    const x = PAGE_MARGIN + width * index;
    if (index) {
      pdf.setDrawColor(...COLORS.line);
      pdf.line(x, y, x, y + 22);
    }
    text(pdf, value, x + width / 2, y + 9.4, { size: 18, style: 'bold', color: COLORS.navy, align: 'center' });
    text(pdf, label.toUpperCase(), x + width / 2, y + 15.8, { size: 5.4, style: 'bold', color: COLORS.muted, align: 'center' });
    if (detail) singleLineText(pdf, detail, x + width / 2, y + 20.2, { size: 4.2, minSize: 3.7, color: COLORS.muted, align: 'center', maxWidth: width - 3 });
  });
  const secondary = [
    ['Goles', summary.goals], ['Asistencias', summary.assists], ['G+A', summary.goalContributions],
    ['Amarillas', summary.yellow], ['Rojas', summary.red], ['Lesiones', summary.injuries], ['Desde banquillo', summary.benchEntries],
  ];
  const secondaryWidth = CONTENT_WIDTH / secondary.length;
  secondary.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + secondaryWidth * index;
    pdf.setFillColor(...(index < 3 ? [239, 247, 251] : COLORS.panel));
    pdf.rect(x + 0.5, y + 25, secondaryWidth - 1, 13, 'F');
    text(pdf, hasValue(value) ? value : 0, x + secondaryWidth / 2, y + 30.7, { size: 10.5, style: 'bold', color: index < 3 ? COLORS.blue : COLORS.ink, align: 'center' });
    text(pdf, label.toUpperCase(), x + secondaryWidth / 2, y + 35.5, { size: 4.5, style: 'bold', color: COLORS.muted, align: 'center' });
  });
  return y + 43;
};

const drawCompactPositionPitch = (pdf, model, x, y, width, height) => {
  pdf.setFillColor(...COLORS.green);
  pdf.setDrawColor(...COLORS.greenAlt);
  pdf.roundedRect(x, y, width, height, 1.2, 1.2, 'FD');
  pdf.setDrawColor(218, 242, 230);
  pdf.setLineWidth(0.3);
  pdf.rect(x + 1.4, y + 1.4, width - 2.8, height - 2.8);
  pdf.line(x + width / 2, y + 1.4, x + width / 2, y + height - 1.4);
  pdf.circle(x + width / 2, y + height / 2, Math.min(width, height) * 0.13);
  pdf.rect(x + 1.4, y + height * 0.23, width * 0.18, height * 0.54);
  pdf.rect(x + width * 0.82 - 1.4, y + height * 0.23, width * 0.18, height * 0.54);
  model.markers.forEach((position) => {
    const markerX = x + 1.8 + (1 - position.coordinates.y) * (width - 3.6);
    const markerY = y + 1.8 + position.coordinates.x * (height - 3.6);
    const radius = position.level === 'principal' ? 1.85 : position.level === 'secondary' ? 1.55 : 1.3;
    if (position.level === 'principal') {
      pdf.setFillColor(102, 213, 241);
      pdf.circle(markerX, markerY, 2.65, 'F');
    }
    pdf.setFillColor(...(position.level === 'other' ? [148, 163, 184] : COLORS.electric));
    pdf.setDrawColor(...COLORS.paper);
    pdf.setLineWidth(position.level === 'principal' ? 0.55 : 0.35);
    pdf.circle(markerX, markerY, radius, 'FD');
    text(pdf, position.markerNumber, markerX, markerY + 0.62, { size: 3.2, style: 'bold', color: COLORS.navy, align: 'center' });
  });
  text(pdf, 'ATAQUE', x + width - 5.5, y - 0.8, { size: 3.1, style: 'bold', color: COLORS.muted, align: 'right' });
  pdf.setDrawColor(...COLORS.muted);
  pdf.setLineWidth(0.22);
  pdf.line(x + width - 4.3, y - 1.7, x + width - 0.8, y - 1.7);
  pdf.line(x + width - 0.8, y - 1.7, x + width - 1.9, y - 2.5);
  pdf.line(x + width - 0.8, y - 1.7, x + width - 1.9, y - 0.9);
};

const drawCompactPositionProfile = (pdf, model, competitionProfile, images, scope, x, y, width) => {
  const formatMinutes = (value) => Math.round(number(value)).toLocaleString('es-ES');
  const seasonWidth = 23;
  text(pdf, 'TEMPORADA', x, y + 3.7, { size: 4.1, style: 'bold', color: COLORS.muted });
  singleLineText(pdf, scope.season || '—', x, y + 8.4, { size: 6.6, minSize: 5.2, style: 'bold', color: COLORS.navy, maxWidth: seasonWidth });
  const competitionX = x + seasonWidth + 3;
  text(pdf, 'COMPETICIÓN', competitionX, y + 3.7, { size: 4.1, style: 'bold', color: COLORS.muted });
  const hasCompetitionIdentity = competitionProfile.mode === 'single' && (images.competition || competitionProfile.icon);
  const logoWidth = hasCompetitionIdentity ? 8.5 : 0;
  if (images.competition) fitImage(pdf, images.competition, competitionX, y + 4.4, logoWidth, 8.5);
  else if (competitionProfile.mode === 'single' && competitionProfile.icon) {
    pdf.setFillColor(...COLORS.panel);
    pdf.setDrawColor(...COLORS.line);
    pdf.roundedRect(competitionX, y + 4.4, logoWidth, 8.5, 1, 1, 'FD');
    text(pdf, competitionProfile.icon, competitionX + logoWidth / 2, y + 9.7, { size: 4.5, style: 'bold', color: COLORS.blue, align: 'center' });
  }
  singleLineText(pdf, competitionProfile.label, competitionX + (logoWidth ? 8.5 : 0), y + 9.5, {
    size: 5.7,
    minSize: 4.2,
    style: 'bold',
    color: COLORS.ink,
    maxWidth: width - seasonWidth - 3 - (logoWidth ? 8.5 : 0),
  });

  text(pdf, 'POSICIONES UTILIZADAS', x, y + 16.2, { size: 4.5, style: 'bold', color: COLORS.blue });
  if (model.empty) {
    text(pdf, 'Sin minutos registrados', x, y + 22, { size: 5.2, style: 'bold', color: COLORS.muted });
    return;
  }
  if (!model.hasPositionData) {
    text(pdf, 'Sin posición registrada', x, y + 22, { size: 5.2, style: 'bold', color: COLORS.muted });
    if (model.unknownPositionMinutes) text(pdf, `${formatMinutes(model.unknownPositionMinutes)}' sin posición`, x, y + 27, { size: 4.5, color: COLORS.muted });
    return;
  }

  const pitchWidth = 34;
  const pitchHeight = 21;
  const pitchY = y + 21;
  drawCompactPositionPitch(pdf, model, x, pitchY, pitchWidth, pitchHeight);
  const legendX = x + pitchWidth + 4;
  const legendRight = x + width;
  model.positions.forEach((position, index) => {
    const rowY = pitchY + 2.8 + index * 5.5;
    pdf.setFillColor(...(position.level === 'other' ? [148, 163, 184] : COLORS.electric));
    if (position.level === 'principal') {
      pdf.setFillColor(183, 235, 248);
      pdf.circle(legendX + 1.2, rowY - 0.55, 1.75, 'F');
      pdf.setFillColor(...COLORS.electric);
    }
    pdf.circle(legendX + 1.2, rowY - 0.55, position.level === 'principal' ? 1.3 : 0.9, 'F');
    singleLineText(pdf, position.position, legendX + 3.4, rowY, { size: position.level === 'principal' ? 5.1 : 4.6, minSize: 3.8, style: position.level === 'principal' ? 'bold' : 'normal', color: position.level === 'principal' ? COLORS.navy : COLORS.ink, maxWidth: Math.max(9, width - pitchWidth - 22) });
    text(pdf, `${formatMinutes(position.minutes)}' · ${position.percentage}%`, legendRight, rowY, { size: position.level === 'principal' ? 4.7 : 4.2, style: 'bold', color: position.level === 'principal' ? COLORS.blue : COLORS.muted, align: 'right' });
  });
  if (model.unknownPositionMinutes) {
    text(pdf, `${formatMinutes(model.unknownPositionMinutes)}' sin posición registrada`, legendX, pitchY + 3 + model.positions.length * 5.5, { size: 4.1, color: COLORS.muted, maxWidth: width - pitchWidth - 4 });
  }
};

const drawIdentity = (pdf, report, images, positionMapModel, competitionProfile, y) => {
  const identity = report.identity || {};
  const scope = getPlayerPdfScope(report);
  const photoSize = 32;
  const dividerX = 124;
  const positionRows = Math.max(1, positionMapModel.positions.length);
  const headerHeight = Math.max(43, 26 + positionRows * 5.5 + (positionMapModel.unknownPositionMinutes ? 4 : 0));
  pdf.setFillColor(...COLORS.paper);
  pdf.setDrawColor(...COLORS.line);
  pdf.roundedRect(PAGE_MARGIN, y, photoSize, photoSize, 1.5, 1.5, 'FD');
  if (!fitImage(pdf, images.player, PAGE_MARGIN + 1, y + 1, photoSize - 2, photoSize - 2)) {
    const initials = clean(identity.name).split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2);
    text(pdf, initials, PAGE_MARGIN + photoSize / 2, y + 19, { size: 16, style: 'bold', color: COLORS.blue, align: 'center' });
  }
  const copyX = PAGE_MARGIN + photoSize + 6;
  text(pdf, 'PERFIL PROFESIONAL DE RENDIMIENTO', copyX, y + 4.5, { size: 5.5, style: 'bold', color: COLORS.electric });
  singleLineText(pdf, clean(identity.name).toUpperCase() || 'JUGADOR', copyX, y + 11.5, { size: 14.5, minSize: 9.5, style: 'bold', color: COLORS.navy, maxWidth: dividerX - copyX - 4 });
  const attributeColumns = [
    [identity.number ? `#${identity.number}` : '', identity.position],
    [identity.age, normalizeFootLabel(identity.foot)],
  ];
  attributeColumns.forEach((column, columnIndex) => {
    const columnWidth = 35;
    const columnX = copyX + columnIndex * columnWidth;
    singleLineText(pdf, column[0], columnX, y + 17.5, { size: 7.2, minSize: 5.6, style: 'bold', color: COLORS.ink, maxWidth: columnWidth - 3 });
    singleLineText(pdf, column[1], columnX, y + 22.5, { size: 6.4, minSize: 4.8, color: COLORS.muted, maxWidth: columnWidth - 3 });
  });
  const teamY = y + 29.2;
  const teamCopyX = copyX + (images.team ? 11 : 0);
  if (images.team) {
    pdf.setFillColor(...COLORS.paper);
    pdf.setDrawColor(...COLORS.line);
    pdf.roundedRect(copyX, y + 24, 9, 9, 1, 1, 'FD');
    fitImage(pdf, images.team, copyX + 0.8, y + 24.8, 7.4, 7.4);
  }
  singleLineText(pdf, clean(identity.team).toUpperCase() || 'EQUIPO NO REGISTRADO', teamCopyX, teamY, { size: 6.8, minSize: 4.8, style: 'bold', color: COLORS.blue, maxWidth: dividerX - teamCopyX - 4 });

  pdf.setDrawColor(...COLORS.line);
  pdf.setLineWidth(0.25);
  pdf.line(dividerX, y + 1, dividerX, y + headerHeight - 3);
  drawCompactPositionProfile(pdf, positionMapModel, competitionProfile, images, scope, dividerX + 4, y, A4_WIDTH_MM - PAGE_MARGIN - dividerX - 4);
  return y + headerHeight + 3;
};

const drawCompetitionTable = (pdf, competitions, y, sectionNumber, imageMap = new Map()) => {
  const competitionRows = rows(competitions);
  if (!competitionRows.length) return y;
  y = sectionTitle(pdf, 'Rendimiento por competición', y, sectionNumber);
  const widths = [58, 16, 16, 22, 22, 16, 16, 20];
  const headers = ['Competición', 'PJ', 'Tit.', 'Min', 'Min/PJ', 'G', 'A', 'G+A'];
  let x = PAGE_MARGIN;
  pdf.setFillColor(...COLORS.navy);
  pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 7.6, 'F');
  headers.forEach((header, index) => {
    text(pdf, header, x + (index ? widths[index] / 2 : 2), y + 5, { size: 5.5, style: 'bold', color: COLORS.paper, align: index ? 'center' : 'left' });
    x += widths[index];
  });
  y += 7.6;
  competitionRows.forEach((row, rowIndex) => {
    if (rowIndex % 2 === 0) {
      pdf.setFillColor(...COLORS.panel);
      pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 8.2, 'F');
    }
    const minutesPerMatch = hasValue(row.minutesPerMatch)
      ? row.minutesPerMatch
      : number(row.played) > 0 ? Math.round(number(row.minutes) / number(row.played)) : 0;
    const logoSource = clean(row.logoUrl || row.logo_url);
    const logo = imageMap.get(logoSource);
    const logoWidth = fitImage(pdf, logo, PAGE_MARGIN + 1.5, y + 1.2, 5.8, 5.8) ? 7.5 : 0;
    const values = [row.label, row.played, row.starts, `${row.minutes}'`, `${minutesPerMatch}'`, row.goals, row.assists, row.goalContributions];
    x = PAGE_MARGIN;
    values.forEach((value, index) => {
      text(pdf, value, x + (index ? widths[index] / 2 : 2 + logoWidth), y + 5.3, { size: 6.5, style: index === 6 ? 'bold' : 'normal', color: COLORS.ink, align: index ? 'center' : 'left', maxWidth: index ? 0 : widths[index] - 4 - logoWidth });
      x += widths[index];
    });
    y += 8.2;
  });
  return y + 5;
};

const formatSeasonMetric = (value, format = 'ratio') => {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
  const numeric = Number(value);
  if (format === 'percent') return `${numeric.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;
  return numeric.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPdfMatchDate = (value) => {
  const source = clean(value);
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : source;
};

const drawLiveSeason = (pdf, liveSeason, y, sectionNumber) => {
  y = sectionTitle(pdf, 'Registro en vivo · Temporada completa', y, sectionNumber);
  if (!liveSeason?.hasData || number(liveSeason.matchesWithEvents) <= 0) {
    text(pdf, 'Sin información suficiente', PAGE_MARGIN + 2, y + 5.2, { size: 6.4, style: 'bold', color: COLORS.muted });
    return y + 12;
  }
  text(pdf, 'Eventos del Modo Delegado · Todos los registros', PAGE_MARGIN, y + 3.8, { size: 5.7, style: 'bold', color: COLORS.blue });
  text(pdf, 'No forman parte de la estadística oficial salvo partidos validados.', PAGE_MARGIN, y + 8, { size: 5.1, color: COLORS.muted });
  y += 12;
  const metricValues = new Map(rows(liveSeason.metricGroups)
    .flatMap((group) => rows(group.metrics))
    .map((metric) => [metric.key, metric]));
  const cards = [
    { label: 'Partidos con eventos', value: number(liveSeason.matchesWithEvents), format: 'count' },
    { ...metricValues.get('shotsPerMatch'), label: 'Tiros / partido' },
    { ...metricValues.get('shotsOnTargetPerMatch'), label: 'Tiros a puerta / partido' },
    { ...metricValues.get('shotAccuracyPercentage'), label: '% tiros a puerta' },
    { ...metricValues.get('crossesPerMatch'), label: 'Centros / partido' },
    { ...metricValues.get('turnoversPerMatch'), label: 'Pérdidas / partido' },
    { ...metricValues.get('stealsPerMatch'), label: 'Robos / partido' },
    { ...metricValues.get('foulsCommittedPerMatch'), label: 'Faltas realizadas / partido' },
    { ...metricValues.get('foulsReceivedPerMatch'), label: 'Faltas recibidas / partido' },
  ];
  const columns = 3;
  const gap = 3;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const height = 15.5;
  const rowGap = 2.2;
  cards.forEach((card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = PAGE_MARGIN + column * (width + gap);
    const cardY = y + row * (height + rowGap);
    pdf.setFillColor(...COLORS.panel);
    pdf.setDrawColor(...COLORS.line);
    pdf.roundedRect(x, cardY, width, height, 1.2, 1.2, 'FD');
    text(pdf, clean(card.label).toUpperCase(), x + 3, cardY + 4.5, { size: 4.7, style: 'bold', color: COLORS.muted, maxWidth: width - 6 });
    const displayValue = card.format === 'count'
      ? number(card.value).toLocaleString('es-ES')
      : formatSeasonMetric(card.value, card.format);
    singleLineText(pdf, displayValue, x + 3, cardY + 12.5, { size: 12.5, minSize: 10, style: 'bold', color: COLORS.navy, maxWidth: width - 6 });
  });
  return y + height * 3 + rowGap * 2 + 7;
};

const drawSeasonMaximums = (pdf, maximums, y, sectionNumber, imageMap, addPage) => {
  const items = rows(maximums);
  const gap = 3;
  const cardHeight = 31;
  const rowGap = 3;
  if (y + 7 + cardHeight > CONTENT_BOTTOM) y = addPage('MÁXIMOS DE LA TEMPORADA');
  y = sectionTitle(pdf, 'Máximos de la temporada', y, sectionNumber);
  if (!items.length) {
    text(pdf, 'Sin registros superiores a cero en esta temporada.', PAGE_MARGIN + 2, y + 5.2, { size: 6.4, color: COLORS.muted });
    return { y: y + 12, layout: { columns: 0, rowColumns: [], cardHeight, cards: 0, cardSplit: false } };
  }
  text(pdf, 'Temporada completa · Todos los registros.', PAGE_MARGIN, y + 3.8, { size: 5.5, color: COLORS.muted });
  y += 7;
  const cardRows = items.length > 4 ? [items.slice(0, 4), items.slice(4)] : [items];
  cardRows.forEach((rowItems) => {
    if (y + cardHeight > CONTENT_BOTTOM) {
      y = addPage('MÁXIMOS DE LA TEMPORADA · CONTINUACIÓN');
      y = sectionTitle(pdf, 'Máximos de la temporada · continuación', y, sectionNumber);
    }
    const columns = rowItems.length;
    const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
    rowItems.forEach((item, columnIndex) => {
      const x = PAGE_MARGIN + columnIndex * (cardWidth + gap);
      const match = item.match || {};
      const crestSource = clean(match.opponentCrest);
      const crest = imageMap.get(crestSource);
      pdf.setFillColor(...COLORS.panel);
      pdf.setDrawColor(...COLORS.line);
      pdf.roundedRect(x, y, cardWidth, cardHeight, 1.2, 1.2, 'FD');
      singleLineText(pdf, clean(item.metric?.maximumLabel).toUpperCase(), x + 3, y + 5.4, { size: 5.2, minSize: 4.2, style: 'bold', color: COLORS.blue, maxWidth: cardWidth - 6 });
      singleLineText(pdf, item.value, x + 3, y + 14, { size: 13, minSize: 10, style: 'bold', color: COLORS.navy, maxWidth: cardWidth - 6 });
      pdf.setDrawColor(...COLORS.line);
      pdf.line(x + 3, y + 17, x + cardWidth - 3, y + 17);
      const crestLoaded = fitImage(pdf, crest, x + 3, y + 19.3, 7.2, 7.2);
      const opponentX = x + (crestLoaded ? 12 : 3);
      singleLineText(pdf, match.opponent || 'Rival', opponentX, y + 22.8, { size: 5.5, minSize: 4.2, style: 'bold', color: COLORS.ink, maxWidth: cardWidth - (opponentX - x) - 3 });
      singleLineText(pdf, [match.sequenceLabel, formatPdfMatchDate(match.matchDate)].filter(Boolean).join(' · '), opponentX, y + 27.4, { size: 4.8, minSize: 4.1, color: COLORS.muted, maxWidth: cardWidth - (opponentX - x) - 3 });
    });
    y += cardHeight + rowGap;
  });
  const rowColumns = cardRows.map((rowItems) => rowItems.length);
  return {
    y: y + 2,
    layout: {
      columns: Math.max(...rowColumns),
      rowColumns,
      cardHeight,
      cards: items.length,
      cardSplit: false,
    },
  };
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
  const widths = [14, 36, 14, 23, 6, 11, 28, 8, 6, 6, 18, 16];
  const headers = ['Fecha', 'Rival', 'Resultado', 'Competición', 'L/V', 'Rol', 'POS./SIST.', 'Min', 'G', 'A', 'Tarjetas', 'Lesión'];
  pdf.setFillColor(...COLORS.navy);
  pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 7.6, 'F');
  let x = PAGE_MARGIN;
  headers.forEach((header, index) => {
    text(pdf, header, x + ([1, 3, 6].includes(index) ? 1.5 : widths[index] / 2), y + 5, { size: 4.9, style: 'bold', color: COLORS.paper, align: [1, 3, 6].includes(index) ? 'left' : 'center' });
    x += widths[index];
  });
  return { y: y + 7.6, widths };
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

const getHistoryPositionSystemLines = (row = {}) => {
  const lines = rows(row.positionSystemLines).map(clean).filter(Boolean);
  return lines.length ? lines : ['—'];
};

const getHistoryRowHeight = (row = {}) => Math.max(8.4, 4.8 + getHistoryPositionSystemLines(row).length * 3.6);

const drawHistoryRow = (pdf, row, y, widths, rivalImage, rowIndex) => {
  const height = getHistoryRowHeight(row);
  if (rowIndex % 2 === 0) {
    pdf.setFillColor(...COLORS.panel);
    pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, height, 'F');
  }
  let x = PAGE_MARGIN;
  const baseline = y + height / 2 + 1.8;
  const center = (value, index, options = {}) => text(pdf, value, x + widths[index] / 2, baseline, { size: 5.6, color: COLORS.ink, align: 'center', ...options });
  center(row.date, 0);
  x += widths[0];
  const rivalImageDrawn = fitImage(pdf, rivalImage, x + 1, y + (height - 6.5) / 2, 6.5, 6.5);
  if (!rivalImageDrawn) {
    const initials = clean(row.opponent).split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'R';
    pdf.setFillColor(226, 232, 240);
    pdf.circle(x + 4.25, y + height / 2, 3.1, 'F');
    text(pdf, initials, x + 4.25, y + height / 2 + 1.2, { size: 4, style: 'bold', color: COLORS.muted, align: 'center' });
  }
  singleLineText(pdf, row.opponent || 'Rival', x + 8.5, baseline, { size: 5.8, minSize: 4.5, style: 'bold', color: COLORS.ink, maxWidth: widths[1] - 9.5 });
  x += widths[1];
  const outcomeColor = row.outcome === 'V' ? COLORS.win : row.outcome === 'D' ? COLORS.loss : row.outcome === 'E' ? COLORS.draw : COLORS.muted;
  center([row.outcome, row.result].filter(Boolean).join(' · '), 2, { style: 'bold', color: outcomeColor });
  x += widths[2];
  singleLineText(pdf, row.competition, x + 1.5, baseline, { size: 5.5, minSize: 4.5, color: COLORS.ink, maxWidth: widths[3] - 3 });
  x += widths[3]; center(row.venue, 4); x += widths[4]; center(row.role, 5); x += widths[5];
  const positionSystemLines = getHistoryPositionSystemLines(row);
  const firstLineY = y + height / 2 - ((positionSystemLines.length - 1) * 3.8) / 2 + 1.3;
  positionSystemLines.forEach((line, index) => singleLineText(pdf, line, x + 1.5, firstLineY + index * 3.8, { size: 5.1, minSize: 4.3, style: 'bold', color: COLORS.ink, maxWidth: widths[6] - 3 }));
  x += widths[6]; center(row.minutes, 7, { style: 'bold' }); x += widths[7];
  drawHistoryLinks(pdf, row.goalLinks, row.goals, x, baseline + 0.1, widths[8]); x += widths[8];
  drawHistoryLinks(pdf, row.assistLinks, row.assists, x, baseline + 0.1, widths[9]); x += widths[9];
  center(row.cards, 10); x += widths[10]; center(row.injury, 11);
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
  pdf.rect(x + width * 0.35, y + 2, width * 0.3, height * 0.08);
  pdf.rect(x + width * 0.35, y + height * 0.92 - 2, width * 0.3, height * 0.08);
  pdf.line(x + width * 0.43, y + 1.1, x + width * 0.57, y + 1.1);
  pdf.line(x + width * 0.43, y + height - 1.1, x + width * 0.57, y + height - 1.1);
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
  text(pdf, 'ATAQUE', x + width / 2 - 1.2, y - 0.9, { size: 3.2, style: 'bold', color: COLORS.muted, align: 'center' });
  pdf.setDrawColor(...COLORS.muted);
  pdf.setLineWidth(0.22);
  pdf.line(x + width / 2 + 6.2, y - 0.5, x + width / 2 + 6.2, y - 2.6);
  pdf.line(x + width / 2 + 6.2, y - 2.6, x + width / 2 + 5.5, y - 1.8);
  pdf.line(x + width / 2 + 6.2, y - 2.6, x + width / 2 + 6.9, y - 1.8);
  const emptyLabel = map?.key === 'goals'
    ? 'Sin zonas de gol registradas'
    : map?.key === 'assists' ? 'Sin zonas de asistencia registradas' : 'Sin zonas de acciones registradas';
  text(pdf, total ? `${total} ${total === 1 ? 'acción' : 'acciones'} con zona` : emptyLabel, x + width / 2, y + height + 4.2, { size: 4.7, style: empty ? 'bold' : 'normal', color: COLORS.muted, align: 'center' });
};

const getProductionPitchSize = (columns) => {
  if (!columns) return { width: 0, height: 0, aspectRatio: 1.26 };
  const gap = 5;
  const columnWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const width = Math.min(82, columnWidth - 2);
  return { width, height: width / 1.26, aspectRatio: 1.26 };
};

const drawProductionMaps = (pdf, layout, y, sectionNumber) => {
  const maps = rows(layout?.maps).slice(0, 3);
  if (!maps.length) return y;
  y = sectionTitle(pdf, 'Zonas de producción', y, sectionNumber);
  const gap = 5;
  const columns = Math.max(1, maps.length);
  const columnWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const { width, height } = getProductionPitchSize(columns);
  maps.forEach((map, index) => {
    const columnX = PAGE_MARGIN + index * (columnWidth + gap);
    const x = columnX + (columnWidth - width) / 2;
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
    pdf.roundedRect(x + 1, y, width - 2, 19, 1, 1, 'FD');
    text(pdf, hasValue(value) ? value : 0, x + width / 2, y + 8.8, { size: 14, style: 'bold', color: COLORS.blue, align: 'center' });
    text(pdf, label.toUpperCase(), x + width / 2, y + 15, { size: 5, style: 'bold', color: COLORS.muted, align: 'center' });
  });
  return y + 23;
};

const sortConnections = (connections) => rows(connections)
  .slice()
  .sort((left, right) => number(right.count) - number(left.count)
    || clean(left.from).localeCompare(clean(right.from), 'es')
    || clean(left.to).localeCompare(clean(right.to), 'es'));

const connectionInitials = (value) => clean(value).split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'JG';

const drawConnectionAvatar = (pdf, image, name, x, y, size) => {
  pdf.setFillColor(...COLORS.paper);
  pdf.setDrawColor(...COLORS.line);
  pdf.roundedRect(x, y, size, size, 1.2, 1.2, 'FD');
  if (fitImage(pdf, image, x + 0.6, y + 0.6, size - 1.2, size - 1.2)) return true;
  pdf.setFillColor(231, 243, 249);
  pdf.roundedRect(x + 0.6, y + 0.6, size - 1.2, size - 1.2, 1, 1, 'F');
  text(pdf, connectionInitials(name), x + size / 2, y + size / 2 + 1.6, { size: 5.8, style: 'bold', color: COLORS.blue, align: 'center' });
  return false;
};

const drawConnectionName = (pdf, name, centerX, y, width) => {
  setText(pdf, { size: 5.2, style: 'bold', color: COLORS.ink });
  const lines = pdf.splitTextToSize(clean(name), width).slice(0, 2);
  pdf.text(lines, centerX, y, { align: 'center' });
};

const getConnectionGridMetrics = (count) => {
  const columns = count === 1 ? 1 : 2;
  const gap = 5;
  const cardWidth = columns === 1 ? 126 : (CONTENT_WIDTH - gap) / 2;
  const rowsCount = Math.ceil(count / columns);
  const cardHeight = count === 1 ? 24 : 32;
  return { columns, gap, cardWidth, cardHeight, rowsCount, height: 7 + rowsCount * cardHeight + Math.max(0, rowsCount - 1) * gap + 3 };
};

const drawConnections = (pdf, connections, y, sectionNumber, imageMap, limit = Infinity) => {
  const connectionRows = sortConnections(connections).slice(0, limit);
  if (!connectionRows.length) return y;
  y = sectionTitle(pdf, 'Conexiones ofensivas', y, sectionNumber);
  const grid = getConnectionGridMetrics(connectionRows.length);
  const gridWidth = grid.columns * grid.cardWidth + (grid.columns - 1) * grid.gap;
  const gridX = PAGE_MARGIN + (CONTENT_WIDTH - gridWidth) / 2;
  connectionRows.forEach((connection, index) => {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    const x = gridX + column * (grid.cardWidth + grid.gap);
    const cardY = y + row * (grid.cardHeight + grid.gap);
    const fromCenter = x + grid.cardWidth * 0.24;
    const toCenter = x + grid.cardWidth * 0.76;
    const avatarSize = grid.cardHeight === 24 ? 8.5 : 10;
    const avatarY = cardY + 2.2;
    pdf.setFillColor(...COLORS.panel);
    pdf.setDrawColor(...COLORS.line);
    pdf.roundedRect(x, cardY, grid.cardWidth, grid.cardHeight, 1.4, 1.4, 'FD');
    drawConnectionAvatar(pdf, imageMap.get(clean(connection.fromImage)), connection.from, fromCenter - avatarSize / 2, avatarY, avatarSize);
    drawConnectionAvatar(pdf, imageMap.get(clean(connection.toImage)), connection.to, toCenter - avatarSize / 2, avatarY, avatarSize);
    drawConnectionName(pdf, connection.from, fromCenter, avatarY + avatarSize + 3.2, grid.cardWidth * 0.38);
    drawConnectionName(pdf, connection.to, toCenter, avatarY + avatarSize + 3.2, grid.cardWidth * 0.38);

    const arrowStart = x + grid.cardWidth * 0.43;
    const arrowEnd = x + grid.cardWidth * 0.57;
    const arrowY = avatarY + avatarSize / 2;
    pdf.setDrawColor(...COLORS.electric);
    pdf.setLineWidth(0.55);
    pdf.line(arrowStart, arrowY, arrowEnd, arrowY);
    pdf.line(arrowEnd - 1.8, arrowY - 1.3, arrowEnd, arrowY);
    pdf.line(arrowEnd - 1.8, arrowY + 1.3, arrowEnd, arrowY);

    const directionLabel = connection.direction === 'given'
      ? (number(connection.count) === 1 ? 'ASISTENCIA DADA' : 'ASISTENCIAS DADAS')
      : connection.direction === 'received'
        ? (number(connection.count) === 1 ? 'ASISTENCIA RECIBIDA' : 'ASISTENCIAS RECIBIDAS')
        : (number(connection.count) === 1 ? 'PARTICIPACIÓN' : 'PARTICIPACIONES');
    const countY = cardY + grid.cardHeight - 3;
    text(pdf, connection.count, x + grid.cardWidth / 2 - 1.5, countY, { size: grid.cardHeight === 24 ? 7.2 : 8.2, style: 'bold', color: COLORS.blue, align: 'right' });
    text(pdf, directionLabel, x + grid.cardWidth / 2 + 1, countY, { size: 4.4, style: 'bold', color: COLORS.muted });
  });
  return y + grid.rowsCount * grid.cardHeight + Math.max(0, grid.rowsCount - 1) * grid.gap + 4;
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

export const getObjectiveMetricRowLayout = ({ x = 0, width = 0, valueTextWidth = 0 } = {}) => {
  const padding = 3;
  const gap = 1.8;
  const contentWidth = Math.max(0, Number(width) - padding * 2);
  const labelWidth = Math.max(14, Math.min(22, contentWidth * 0.4));
  const valueWidthLimit = Math.max(0, contentWidth - labelWidth - gap * 2 - 4);
  const valueWidth = Math.min(valueWidthLimit, Math.max(13, Number(valueTextWidth) + 1.5));
  const labelX = Number(x) + padding;
  const barX = labelX + labelWidth + gap;
  const valueX = Number(x) + Number(width) - padding;
  const valueLeft = valueX - valueWidth;
  const barWidth = Math.max(0, valueLeft - gap - barX);
  return { labelX, labelWidth, barX, barWidth, valueLeft, valueWidth, valueX, gap };
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
        const percentage = module.total > 0 ? ` · ${Math.round((number(row.count) / module.total) * 100)}%` : '';
        const value = `${row.count}${percentage}`;
        setText(pdf, { size: 5.1, style: 'bold', color: COLORS.ink });
        const layout = getObjectiveMetricRowLayout({ x, width, valueTextWidth: pdf.getTextWidth(value) });
        singleLineText(pdf, row.label, layout.labelX, rowY, { size: 5.2, minSize: 4.2, color: COLORS.ink, maxWidth: layout.labelWidth });
        pdf.setFillColor(228, 235, 242);
        pdf.rect(layout.barX, rowY - 3, layout.barWidth, 2.3, 'F');
        pdf.setFillColor(...COLORS.blue);
        pdf.rect(layout.barX, rowY - 3, layout.barWidth * Math.min(1, number(row.count) / max), 2.3, 'F');
        singleLineText(pdf, value, layout.valueLeft, rowY, { size: 5.1, minSize: 4.3, style: 'bold', color: COLORS.ink, maxWidth: layout.valueWidth });
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

export const createPlayerProfilePdf = async ({
  report,
  documentRef = globalThis.document,
  JsPdfConstructor = jsPDF,
  fetchImpl = globalThis.fetch,
  imageFallbackLoader,
} = {}) => {
  if (!report?.identity?.name) throw new Error('No se puede generar el PDF: falta el modelo normalizado del jugador.');
  const positionMapModel = buildPlayerPositionMapModel(report.positionUsage);
  if (report.validation?.seasonReason === 'MULTIPLE_SEASONS') throw new Error('No se puede generar el dossier mezclando varias temporadas. Selecciona una temporada concreta.');
  if (report.validation?.production?.valid === false) throw new Error('No se puede generar el dossier: los agregados de producción son contradictorios.');
  if (report.validation?.positionUsage?.valid === false || positionMapModel.totalIdentifiedMinutes > positionMapModel.officialMinutes || number(report.positionUsage?.determinedMinutes) > number(report.positionUsage?.totalMinutes)) {
    throw new Error('No se puede generar el dossier: los minutos por posición superan los minutos reales del jugador.');
  }
  if (!positionMapModel.valid) throw new Error('No se puede generar el dossier: minutos identificados y sin posición no coinciden con los minutos oficiales.');
  const competitionProfile = report.competitionProfile || buildPlayerCompetitionProfile(report.competitionBreakdown);
  const influenceMapLayout = report.influenceMapLayout || buildPlayerProductionMapLayout({ maps: report.influenceMaps, seasonSummary: report.seasonSummary });
  const sectionPlan = buildPlayerDossierSectionPlan(report);
  const sectionNumbers = Object.fromEntries(sectionPlan.map((section) => [section.key, section.number]));

  const imageUrls = new Set([
    report.identity?.image,
    report.identity?.teamCrest,
    competitionProfile.logoUrl,
    ...rows(report.competitionBreakdown).map((competition) => competition.logoUrl || competition.logo_url),
    ...rows(report.offensiveConnections).flatMap((connection) => [connection.fromImage, connection.toImage]),
    ...rows(report.history).map((row) => row.opponentCrest),
    ...rows(report.seasonMaximums).map((maximum) => maximum.match?.opponentCrest),
  ].map(clean).filter(Boolean));
  const imageEntries = await Promise.all([...imageUrls].map(async (url) => [url, await loadPlayerPdfImage(url, { fetchImpl, documentRef, fallbackLoader: imageFallbackLoader })]));
  const imageMap = new Map(imageEntries);
  const images = {
    player: imageMap.get(clean(report.identity?.image)),
    team: imageMap.get(clean(report.identity?.teamCrest)),
    competition: imageMap.get(clean(competitionProfile.logoUrl)),
  };
  const pdf = new JsPdfConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  const pageSections = [];
  const addPage = (section) => {
    if (pageSections.length) pdf.addPage('a4', 'portrait');
    pageSections.push(section);
    drawHeader(pdf, report, section);
    return 20;
  };

  let y = addPage('PERFIL Y RENDIMIENTO COMPETITIVO');
  y = drawIdentity(pdf, report, images, positionMapModel, competitionProfile, y);
  y = sectionTitle(pdf, `Rendimiento · Temporada ${report.identity.season || '—'}`, y, sectionNumbers.performance);
  y = drawKpis(pdf, report, y);
  y = drawCompetitionTable(pdf, report.competitionBreakdown, y, sectionNumbers.competitions, imageMap);

  const history = rows(report.history);
  if (history.length) {
    if (y + 18 > CONTENT_BOTTOM) y = addPage('HISTORIAL · CONTINUACIÓN');
    y = sectionTitle(pdf, 'Historial partido a partido', y, sectionNumbers.history);
    let header = drawHistoryHeader(pdf, y);
    y = header.y;
    history.forEach((row, index) => {
      if (y + getHistoryRowHeight(row) > CONTENT_BOTTOM) {
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

  let maximumsLayout = { columns: 0, rowColumns: [], cardHeight: 31, cards: 0, cardSplit: false };
  if (report.liveSeason || Array.isArray(report.seasonMaximums)) {
    y = addPage('REGISTRO EN VIVO · TEMPORADA COMPLETA');
    if (report.liveSeason) y = drawLiveSeason(pdf, report.liveSeason, y, sectionNumbers.liveSeason);
    if (Array.isArray(report.seasonMaximums)) {
      const maximumsResult = drawSeasonMaximums(pdf, report.seasonMaximums, y, sectionNumbers.seasonMaximums, imageMap, addPage);
      y = maximumsResult.y;
      maximumsLayout = maximumsResult.layout;
    }
  }

  if (sectionPlan.some((section) => ['zones', 'production', 'connections', 'goalAnalysis'].includes(section.key))) {
    y = addPage('PRODUCCIÓN Y ZONAS');
    if (sectionNumbers.zones) y = drawProductionMaps(pdf, influenceMapLayout, y, sectionNumbers.zones);
    if (sectionNumbers.production) y = drawProductionMetrics(pdf, report.production, y, sectionNumbers.production);
    const sortedOffensiveConnections = sortConnections(report.offensiveConnections);
    const productionConnections = sortedOffensiveConnections.slice(0, 5);
    if (productionConnections.length) {
      if (y + getConnectionGridMetrics(productionConnections.length).height > CONTENT_BOTTOM) y = addPage('CONEXIONES OFENSIVAS');
      y = drawConnections(pdf, productionConnections, y, sectionNumbers.connections, imageMap, 5);
    }
    const hasGoalAnalysis = number(report.goalAnalysis?.bodyParts?.total)
      || number(report.goalAnalysis?.types?.total)
      || number(report.goalAnalysis?.target?.total);
    if (hasGoalAnalysis) {
      if (y + 49 > CONTENT_BOTTOM) y = addPage('ANÁLISIS OBJETIVO DE FINALIZACIÓN');
      y = drawObjectiveAnalysis(pdf, report.goalAnalysis, y, sectionNumbers.goalAnalysis);
    }

  }

  pageSections.forEach((_, index) => {
    pdf.setPage(index + 1);
    drawFooter(pdf, report, index + 1, pageSections.length);
  });

  const expectedVideoUrls = rows(report.history)
    .flatMap((row) => [...rows(row.goalLinks), ...rows(row.assistLinks)].map(cleanUrl))
    .filter(Boolean);
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
      competitionProfile: {
        mode: competitionProfile.mode,
        label: competitionProfile.label,
        logoSource: clean(competitionProfile.logoUrl),
        logoLoaded: Boolean(images.competition?.data),
        fallbackIcon: clean(competitionProfile.icon),
        logoFrameMm: 8.5,
      },
      competitionLogos: rows(report.competitionBreakdown).map((competition) => {
        const source = clean(competition.logoUrl || competition.logo_url);
        const loaded = source ? imageMap.get(source) : null;
        return {
          key: clean(competition.key),
          label: clean(competition.label),
          source,
          loaded: Boolean(loaded?.data),
          error: source ? clean(loaded?.error) : 'missing_source',
          placeholder: false,
        };
      }),
      liveSeason: report.liveSeason ? {
        window: clean(report.liveSeason.window) || 'full_scope',
        registryScope: clean(report.liveSeason.registryScope) || 'validated',
        matchesWithEvents: number(report.liveSeason.matchesWithEvents),
        hasData: Boolean(report.liveSeason.hasData),
        layout: {
          columns: 3,
          rows: 3,
          cards: 9,
          visibleMetricKeys: [
            'matchesWithEvents',
            'shotsPerMatch',
            'shotsOnTargetPerMatch',
            'shotAccuracyPercentage',
            'crossesPerMatch',
            'turnoversPerMatch',
            'stealsPerMatch',
            'foulsCommittedPerMatch',
            'foulsReceivedPerMatch',
          ],
        },
        metrics: rows(report.liveSeason.metricGroups).flatMap((group) => rows(group.metrics).map((metric) => ({
          key: clean(metric.key),
          value: metric.value ?? null,
        }))),
      } : null,
      seasonMaximums: rows(report.seasonMaximums).map((maximum) => {
        const source = clean(maximum.match?.opponentCrest);
        const loaded = source ? imageMap.get(source) : null;
        return {
          metric: clean(maximum.metric?.key),
          value: maximum.value,
          matchId: clean(maximum.match?.matchId),
          opponent: clean(maximum.match?.opponent),
          matchDate: clean(maximum.match?.matchDate),
          crestSource: source,
          crestLoaded: Boolean(loaded?.data),
          crestError: source ? clean(loaded?.error) : 'missing_source',
        };
      }),
      maximumsLayout,
      playerPhoto: {
        background: 'white',
        fit: 'contain',
        centered: true,
        imageLoaded: Boolean(images.player?.data),
        source: clean(report.identity?.image),
      },
      minutesPlayed: {
        minutes: number(report.seasonSummary?.minutes),
        possibleMinutes: number(report.seasonSummary?.possibleMinutes),
        percentage: hasValue(report.seasonSummary?.minutesPlayedPercentage)
          ? number(report.seasonSummary?.minutesPlayedPercentage)
          : number(report.seasonSummary?.possibleMinutes) > 0
            ? Math.round((number(report.seasonSummary?.minutes) / number(report.seasonSummary?.possibleMinutes)) * 100)
            : 0,
      },
      positions: positionMapModel.positions.map((position) => ({
        position: position.position,
        minutes: position.minutes,
        percentage: position.percentage,
      })),
      opponentCrests: rows(report.history).map((row) => {
        const source = clean(row.opponentCrest);
        const loaded = source ? imageMap.get(source) : null;
        return {
          matchId: clean(row.id || row.matchId),
          opponent: clean(row.opponent),
          teamId: clean(row.opponentTeamId),
          source,
          resolutionSource: clean(row.opponentCrestSource),
          loaded: Boolean(loaded?.data),
          error: source ? clean(loaded?.error) : 'missing_source',
          placeholder: !loaded?.data,
        };
      }),
      positionMap: {
        vector: true,
        location: 'header',
        fieldMm: { width: 34, height: 21 },
        orientation: PLAYER_POSITION_MAP_ORIENTATION,
        renderOrientation: { attack: 'right', horizontal: 'player-perspective' },
        orientationIndicator: { secondary: true, fontSize: 3.1, lineWidth: 0.22 },
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
      productionMaps: {
        columns: influenceMapLayout.columns,
        fieldMm: getProductionPitchSize(influenceMapLayout.columns),
        orientationIndicator: { secondary: true, fontSize: 3.2, lineWidth: 0.22 },
        visibleKeys: influenceMapLayout.maps.map((map) => map.key),
        hiddenKeys: influenceMapLayout.hiddenKeys,
        maps: influenceMapLayout.maps.map((map) => ({
          key: map.key,
          zoneActions: rows(map.zones).reduce((sum, zone) => sum + number(zone.count), 0),
        })),
      },
      connections: sortConnections(report.offensiveConnections).map((connection) => ({
        from: clean(connection.from),
        to: clean(connection.to),
        count: number(connection.count),
        fromImageSource: clean(connection.fromImage),
        toImageSource: clean(connection.toImage),
        fromImageLoaded: Boolean(imageMap.get(clean(connection.fromImage))?.data),
        toImageLoaded: Boolean(imageMap.get(clean(connection.toImage))?.data),
      })),
      connectionLayout: rows(report.offensiveConnections).length
        ? getConnectionGridMetrics(Math.min(5, rows(report.offensiveConnections).length))
        : null,
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
