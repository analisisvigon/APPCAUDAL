import { jsPDF } from 'jspdf';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN = 12;
const CONTENT_WIDTH = A4_WIDTH_MM - PAGE_MARGIN * 2;
const CONTENT_BOTTOM = 282;
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
  const teamSeason = [clean(report.identity?.team), clean(report.identity?.season) ? `Temporada ${report.identity.season}` : ''].filter(Boolean).join(' · ');
  text(pdf, teamSeason || 'Dossier individual', PAGE_MARGIN, 291.7, { size: 5.5, color: COLORS.muted });
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
  const photoSize = 31;
  pdf.setFillColor(...COLORS.paper);
  pdf.setDrawColor(...COLORS.line);
  pdf.roundedRect(PAGE_MARGIN, y, photoSize, photoSize, 1.5, 1.5, 'FD');
  if (!fitImage(pdf, images.player, PAGE_MARGIN + 1, y + 1, photoSize - 2, photoSize - 2)) {
    const initials = clean(identity.name).split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2);
    text(pdf, initials, PAGE_MARGIN + photoSize / 2, y + 19, { size: 16, style: 'bold', color: COLORS.blue, align: 'center' });
  }
  const copyX = PAGE_MARGIN + photoSize + 6;
  text(pdf, 'PERFIL PROFESIONAL DE RENDIMIENTO', copyX, y + 4.5, { size: 5.5, style: 'bold', color: COLORS.electric });
  text(pdf, identity.name || 'Jugador', copyX, y + 12, { size: 15.5, style: 'bold', color: COLORS.navy, maxWidth: 92 });
  const attributes = [identity.number ? `#${identity.number}` : '', identity.position, identity.age, identity.foot ? `Pie ${identity.foot}` : ''].filter(Boolean).join(' · ');
  text(pdf, attributes, copyX, y + 19, { size: 7.2, style: 'bold', color: COLORS.ink, maxWidth: 100 });
  const teamY = y + 27;
  if (images.team) fitImage(pdf, images.team, copyX, teamY - 5, 7, 7);
  text(pdf, identity.team || 'Equipo no registrado', copyX + (images.team ? 9 : 0), teamY, { size: 7, style: 'bold', color: COLORS.blue, maxWidth: 90 });

  const scopeX = 157;
  text(pdf, 'ÁMBITO DEL DOSSIER', scopeX, y + 4.5, { size: 5.2, style: 'bold', color: COLORS.muted });
  text(pdf, identity.season ? `Temporada ${identity.season}` : 'Temporada —', scopeX, y + 11, { size: 7.2, style: 'bold', color: COLORS.navy, maxWidth: 40 });
  text(pdf, report.filters?.competition || 'Todas las competiciones', scopeX, y + 17, { size: 6.2, color: COLORS.ink, maxWidth: 40 });
  if (report.filters?.venue && report.filters.venue !== 'Todos') text(pdf, report.filters.venue, scopeX, y + 23, { size: 6.2, color: COLORS.ink });
  return y + 38;
};

const drawCompetitionTable = (pdf, competitions, y) => {
  const competitionRows = rows(competitions);
  if (!competitionRows.length) return y;
  y = sectionTitle(pdf, 'Rendimiento por competición', y, '02');
  const widths = [66, 20, 20, 20, 20, 20, 20];
  const headers = ['Competición', 'PJ', 'Tit.', 'Min', 'G', 'A', 'G+A'];
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
    const values = [row.label, row.played, row.starts, `${row.minutes}'`, row.goals, row.assists, row.goalContributions];
    x = PAGE_MARGIN;
    values.forEach((value, index) => {
      text(pdf, value, x + (index ? widths[index] / 2 : 2), y + 4.7, { size: 6.1, style: index === 6 ? 'bold' : 'normal', color: COLORS.ink, align: index ? 'center' : 'left', maxWidth: index ? 0 : widths[index] - 4 });
      x += widths[index];
    });
    y += 7.2;
  });
  return y + 5;
};

const drawPositionUsage = (pdf, usage, y) => {
  const positions = rows(usage?.positions).filter((row) => number(row.minutes) > 0);
  const unknownMinutes = number(usage?.unknownMinutes);
  const formatMinutes = (value) => Math.round(number(value)).toLocaleString('es-ES');
  if (!positions.length) {
    y = sectionTitle(pdf, 'Posiciones utilizadas', y, '03');
    text(pdf, 'Sin información posicional suficiente', PAGE_MARGIN + 2, y + 5.2, { size: 6.4, color: COLORS.muted });
    return y + 10;
  }
  const singlePosition = positions.length === 1 && !unknownMinutes;
  y = sectionTitle(pdf, 'Posiciones utilizadas', y, '03');
  if (singlePosition) {
    const position = positions[0];
    text(pdf, position.position, PAGE_MARGIN + 2, y + 5.2, { size: 7.2, style: 'bold', color: COLORS.ink, maxWidth: 115 });
    text(pdf, `${formatMinutes(position.minutes)}' · ${number(position.percentage)}%`, A4_WIDTH_MM - PAGE_MARGIN, y + 5.2, { size: 7, style: 'bold', color: COLORS.blue, align: 'right' });
    return y + 10;
  }
  const labelWidth = 52;
  const barWidth = 78;
  positions.forEach((position, index) => {
    const rowY = y + index * 7.2;
    text(pdf, position.position, PAGE_MARGIN + 2, rowY + 4.8, { size: 6.1, style: index === 0 ? 'bold' : 'normal', color: COLORS.ink, maxWidth: labelWidth - 3 });
    pdf.setFillColor(229, 237, 244);
    pdf.rect(PAGE_MARGIN + labelWidth, rowY + 2, barWidth, 2.8, 'F');
    pdf.setFillColor(...COLORS.blue);
    pdf.rect(PAGE_MARGIN + labelWidth, rowY + 2, barWidth * Math.min(100, number(position.percentage)) / 100, 2.8, 'F');
    text(pdf, `${number(position.percentage)}% · ${formatMinutes(position.minutes)}'`, A4_WIDTH_MM - PAGE_MARGIN, rowY + 4.8, { size: 5.8, style: 'bold', color: COLORS.ink, align: 'right' });
  });
  const contentHeight = positions.length * 7.2;
  if (unknownMinutes) text(pdf, `${formatMinutes(unknownMinutes)}' sin posición registrada`, PAGE_MARGIN + 2, y + contentHeight + 3.5, { size: 4.8, color: COLORS.muted });
  return y + contentHeight + (unknownMinutes ? 7 : 3);
};

const drawHistoryHeader = (pdf, y) => {
  const widths = [16, 37, 16, 28, 8, 16, 10, 10, 10, 20, 15];
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
  text(pdf, row.opponent || 'Rival', x + (rivalImage ? 8 : 1.5), y + 5.1, { size: 5.5, style: 'bold', color: COLORS.ink, maxWidth: widths[1] - (rivalImage ? 9 : 3) });
  x += widths[1];
  const outcomeColor = row.outcome === 'V' ? COLORS.win : row.outcome === 'D' ? COLORS.loss : row.outcome === 'E' ? COLORS.draw : COLORS.muted;
  center([row.outcome, row.result].filter(Boolean).join(' · '), 2, { style: 'bold', color: outcomeColor });
  x += widths[2];
  text(pdf, row.competition, x + 1.5, y + 5.1, { size: 5.2, color: COLORS.ink, maxWidth: widths[3] - 3 });
  x += widths[3]; center(row.venue, 4); x += widths[4]; center(row.role, 5); x += widths[5]; center(row.minutes, 6, { style: 'bold' }); x += widths[6];
  drawHistoryLinks(pdf, row.goalLinks, row.goals, x, y + 5.3, widths[7]); x += widths[7];
  drawHistoryLinks(pdf, row.assistLinks, row.assists, x, y + 5.3, widths[8]); x += widths[8];
  center(row.cards, 9); x += widths[9]; center(row.injury, 10);
  return y + height;
};

const drawPitch = (pdf, map, x, y, width, height) => {
  pdf.setFillColor(...COLORS.green);
  pdf.roundedRect(x, y, width, height, 1.2, 1.2, 'F');
  pdf.setDrawColor(221, 241, 231);
  pdf.setLineWidth(0.35);
  pdf.rect(x + 2, y + 2, width - 4, height - 4);
  pdf.line(x + 2, y + height / 2, x + width - 2, y + height / 2);
  pdf.circle(x + width / 2, y + height / 2, Math.min(width, height) * 0.11);
  pdf.rect(x + width * 0.23, y + 2, width * 0.54, height * 0.18);
  pdf.rect(x + width * 0.23, y + height * 0.82 - 2, width * 0.54, height * 0.18);
  const zones = rows(map?.zones);
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
    text(pdf, compactPitchZoneLabel(zone, index), cellX + cellWidth / 2, cellY + 4, { size: 3.5, style: 'bold', color: COLORS.paper, align: 'center', maxWidth: cellWidth - 2 });
    if (count > 0) text(pdf, count, cellX + cellWidth / 2, cellY + cellHeight / 2 + 4.5, { size: 8, style: 'bold', color: COLORS.paper, align: 'center' });
  });
  text(pdf, 'ATAQUE', x + width / 2 - 1, y - 2, { size: 4.5, style: 'bold', color: COLORS.green, align: 'center' });
  pdf.setDrawColor(...COLORS.green);
  pdf.setLineWidth(0.45);
  pdf.line(x + width / 2 + 9, y - 1, x + width / 2 + 9, y - 5);
  pdf.line(x + width / 2 + 9, y - 5, x + width / 2 + 7.8, y - 3.7);
  pdf.line(x + width / 2 + 9, y - 5, x + width / 2 + 10.2, y - 3.7);
  const total = zones.reduce((sum, zone) => sum + number(zone.count), 0);
  text(pdf, total ? `${total} ${total === 1 ? 'acción' : 'acciones'} con zona` : 'Sin zonas registradas', x + width / 2, y + height + 4.2, { size: 4.7, color: COLORS.muted, align: 'center' });
};

const drawProductionMaps = (pdf, maps, y) => {
  y = sectionTitle(pdf, 'Zonas de producción', y, '05');
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

const drawProductionMetrics = (pdf, production, y) => {
  y = sectionTitle(pdf, 'Producción ofensiva', y, '06');
  const metrics = [['Goles/90', production?.goalsPer90], ['Asist./90', production?.assistsPer90], ['G+A/90', production?.goalContributionsPer90], ['G+A total', production?.goalContributions]];
  const width = CONTENT_WIDTH / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + width * index;
    if (index) {
      pdf.setDrawColor(...COLORS.line);
      pdf.line(x, y, x, y + 17);
    }
    text(pdf, hasValue(value) ? value : 0, x + width / 2, y + 8, { size: 13, style: 'bold', color: COLORS.blue, align: 'center' });
    text(pdf, label.toUpperCase(), x + width / 2, y + 13.5, { size: 4.8, style: 'bold', color: COLORS.muted, align: 'center' });
  });
  return y + 21;
};

const drawConnections = (pdf, connections, y, limit = Infinity) => {
  const connectionRows = rows(connections).slice(0, limit);
  if (!connectionRows.length) return y;
  y = sectionTitle(pdf, 'Conexiones ofensivas', y, '07');
  connectionRows.forEach((connection) => {
    const direction = connection.direction === 'received' ? 'recibida' : connection.direction === 'given' ? 'dada' : '';
    const countLabel = `${connection.count} ${connection.count === 1 ? 'asistencia' : 'asistencias'}${direction ? ` ${connection.count === 1 ? direction : `${direction}s`}` : ''}`;
    text(pdf, connection.from, PAGE_MARGIN + 2, y + 4.8, { size: 6.3, style: 'bold', color: COLORS.ink, maxWidth: 70 });
    pdf.setDrawColor(...COLORS.electric);
    pdf.setLineWidth(0.6);
    pdf.line(PAGE_MARGIN + 72, y + 3.3, PAGE_MARGIN + 108, y + 3.3);
    pdf.line(PAGE_MARGIN + 105, y + 1.3, PAGE_MARGIN + 108, y + 3.3);
    pdf.line(PAGE_MARGIN + 105, y + 5.3, PAGE_MARGIN + 108, y + 3.3);
    text(pdf, connection.to, PAGE_MARGIN + 111, y + 4.8, { size: 6.3, style: 'bold', color: COLORS.ink, maxWidth: 53 });
    text(pdf, countLabel, A4_WIDTH_MM - PAGE_MARGIN, y + 4.8, { size: 5.5, style: 'bold', color: COLORS.blue, align: 'right' });
    pdf.setDrawColor(...COLORS.line);
    pdf.line(PAGE_MARGIN, y + 7.2, A4_WIDTH_MM - PAGE_MARGIN, y + 7.2);
    y += 9;
  });
  return y + 2;
};

const drawGoalTarget = (pdf, target, x, y, width) => {
  const zones = rows(target?.zones);
  const max = Math.max(1, ...zones.map((zone) => number(zone.count)));
  const cellWidth = width / 3;
  const cellHeight = 10;
  zones.slice(0, 9).forEach((zone, index) => {
    const cellX = x + (index % 3) * cellWidth;
    const cellY = y + Math.floor(index / 3) * cellHeight;
    const count = number(zone.count);
    const shade = count ? Math.round(239 - (count / max) * 45) : 250;
    pdf.setFillColor(shade, shade + (count ? 5 : 2), 252);
    pdf.setDrawColor(...COLORS.line);
    pdf.rect(cellX, cellY, cellWidth, cellHeight, 'FD');
    text(pdf, String(zone.shortLabel || zone.label || '').replace(/\n/g, ' '), cellX + cellWidth / 2, cellY + 3.8, { size: 3.7, style: 'bold', color: COLORS.muted, align: 'center', maxWidth: cellWidth - 1 });
    text(pdf, count, cellX + cellWidth / 2, cellY + 8, { size: 7.5, style: 'bold', color: count ? COLORS.blue : COLORS.muted, align: 'center' });
  });
  text(pdf, `${number(target?.known)} con zona${number(target?.missing) ? ` · ${number(target.missing)} sin registrar` : ''}`, x, y + 34, { size: 4.7, color: COLORS.muted });
};

const drawObjectiveAnalysis = (pdf, analysis, y) => {
  const body = rows(analysis?.bodyParts?.values);
  const types = rows(analysis?.types?.phases);
  const target = analysis?.target || {};
  if (!body.length && !types.length && !number(target.known)) return y;
  y = sectionTitle(pdf, 'Análisis objetivo de finalización', y, '08');
  const gap = 5;
  const width = (CONTENT_WIDTH - gap * 2) / 3;
  const modules = [
    { title: 'Cómo marca', rows: body, total: number(analysis?.bodyParts?.total) },
    { title: 'Tipo de gol', rows: types, total: number(analysis?.types?.total) },
  ];
  modules.forEach((module, index) => {
    const x = PAGE_MARGIN + index * (width + gap);
    text(pdf, module.title.toUpperCase(), x, y + 4, { size: 5.7, style: 'bold', color: COLORS.blue });
    const max = Math.max(1, ...module.rows.map((row) => number(row.count)));
    module.rows.slice(0, 5).forEach((row, rowIndex) => {
      const rowY = y + 9 + rowIndex * 6;
      text(pdf, row.label, x, rowY, { size: 5.2, color: COLORS.ink, maxWidth: width - 18 });
      const barX = x + width - 20;
      pdf.setFillColor(228, 235, 242);
      pdf.rect(barX, rowY - 3, 13, 2.3, 'F');
      pdf.setFillColor(...COLORS.blue);
      pdf.rect(barX, rowY - 3, 13 * (number(row.count) / max), 2.3, 'F');
      const percentage = module.total > 1 ? ` · ${Math.round((number(row.count) / module.total) * 100)}%` : '';
      text(pdf, `${row.count}${percentage}`, x + width, rowY, { size: 5.1, style: 'bold', color: COLORS.ink, align: 'right' });
    });
  });
  const targetX = PAGE_MARGIN + 2 * (width + gap);
  text(pdf, 'DESTINO EN PORTERÍA', targetX, y + 4, { size: 5.7, style: 'bold', color: COLORS.blue });
  if (number(target.known)) drawGoalTarget(pdf, target, targetX, y + 7, width);
  return y + 45;
};

const compactActionZoneLabel = (value) => clean(value)
  .replace(/^F\.?\s*/i, '')
  .replace(/^Finalizaci[oó]n\s*/i, '')
  .replace(/^Creaci[oó]n\s*/i, '')
  .trim();

const actionDetailLines = (action) => action.type === 'Gol'
  ? [
    action.phase,
    action.shotZoneLabel ? `Finalización: ${compactActionZoneLabel(action.shotZoneLabel)}` : '',
    action.contact ? `Superficie: ${action.contact}` : '',
    action.goalZoneLabel ? `Portería: ${action.goalZoneLabel}` : '',
    action.assistant ? `Asistencia: ${action.assistant}` : '',
  ].filter(Boolean)
  : [
    action.assistZoneLabel ? `Origen: ${compactActionZoneLabel(action.assistZoneLabel)}` : '',
    action.phase ? `Tipo de jugada: ${action.phase}` : '',
    action.scorer ? `Asiste a: ${action.scorer}` : '',
  ].filter(Boolean);

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
  const details = actionDetailLines(action);
  const height = Math.max(22, 15 + details.length * 4.2);
  pdf.setFillColor(...COLORS.panel);
  pdf.setDrawColor(...COLORS.line);
  pdf.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, height, 1.2, 1.2, 'FD');
  pdf.setFillColor(...COLORS.blue);
  pdf.circle(PAGE_MARGIN + 4.5, y + 5.5, 1.5, 'F');
  text(pdf, `${action.type.toUpperCase()} · ${action.minute || '—'}'`, PAGE_MARGIN + 9, y + 6.7, { size: 8, style: 'bold', color: COLORS.navy });
  text(pdf, `vs ${action.opponent || 'Rival'}${action.result ? ` · ${action.result}` : ''}`, PAGE_MARGIN + 9, y + 12, { size: 6.2, style: 'bold', color: COLORS.ink });
  text(pdf, [action.competition, action.date].filter(Boolean).join(' · '), PAGE_MARGIN + 9, y + 16.5, { size: 5.3, color: COLORS.muted });
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

const reportHasProduction = (report) => {
  const zoneTotal = rows(report.influenceMaps).flatMap((map) => rows(map.zones)).reduce((sum, zone) => sum + number(zone.count), 0);
  const goalKnown = number(report.goalAnalysis?.bodyParts?.known) + number(report.goalAnalysis?.types?.known) + number(report.goalAnalysis?.target?.known);
  return zoneTotal > 0 || rows(report.offensiveConnections).length > 0 || rows(report.videoActions).length > 0 || goalKnown > 0 || number(report.production?.goalContributions) > 0;
};

export const createPlayerProfilePdf = async ({
  report,
  documentRef = globalThis.document,
  JsPdfConstructor = jsPDF,
  fetchImpl = globalThis.fetch,
} = {}) => {
  if (!report?.identity?.name) throw new Error('No se puede generar el PDF: falta el modelo normalizado del jugador.');
  if (report.validation?.seasonReason === 'MULTIPLE_SEASONS') throw new Error('No se puede generar el dossier mezclando varias temporadas. Selecciona una temporada concreta.');
  if (report.validation?.production?.valid === false) throw new Error('No se puede generar el dossier: los agregados de producción son contradictorios.');
  if (report.validation?.positionUsage?.valid === false || number(report.positionUsage?.determinedMinutes) > number(report.positionUsage?.totalMinutes)) {
    throw new Error('No se puede generar el dossier: los minutos por posición superan los minutos reales del jugador.');
  }

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
  y = sectionTitle(pdf, `Rendimiento · Temporada ${report.identity.season || '—'}`, y, '01');
  y = drawKpis(pdf, report, y);
  y = drawCompetitionTable(pdf, report.competitionBreakdown, y);
  y = drawPositionUsage(pdf, report.positionUsage, y);

  const history = rows(report.history);
  if (history.length) {
    if (y + 18 > CONTENT_BOTTOM) y = addPage('HISTORIAL · CONTINUACIÓN');
    y = sectionTitle(pdf, 'Historial partido a partido', y, '04');
    let header = drawHistoryHeader(pdf, y);
    y = header.y;
    history.forEach((row, index) => {
      if (y + 9 > CONTENT_BOTTOM) {
        y = addPage('HISTORIAL · CONTINUACIÓN');
        y = sectionTitle(pdf, 'Historial partido a partido · continuación', y, '04');
        header = drawHistoryHeader(pdf, y);
        y = header.y;
      }
      y = drawHistoryRow(pdf, row, y, header.widths, imageMap.get(clean(row.opponentCrest)), index);
    });
  } else {
    y = sectionTitle(pdf, 'Historial partido a partido', y, '04');
    text(pdf, 'Sin partidos registrados en el ámbito seleccionado.', PAGE_MARGIN, y + 3, { size: 6.5, color: COLORS.muted });
  }

  if (reportHasProduction(report)) {
    y = addPage('PRODUCCIÓN, ZONAS Y VÍDEO');
    y = drawProductionMaps(pdf, report.influenceMaps, y);
    y = drawProductionMetrics(pdf, report.production, y);
    const productionConnections = rows(report.offensiveConnections).slice(0, 4);
    if (productionConnections.length) y = drawConnections(pdf, productionConnections, y, 4);
    const hasGoalAnalysis = number(report.goalAnalysis?.bodyParts?.known)
      || number(report.goalAnalysis?.types?.known)
      || number(report.goalAnalysis?.target?.known);
    if (hasGoalAnalysis) {
      if (y + 49 > CONTENT_BOTTOM) y = addPage('ANÁLISIS OBJETIVO DE FINALIZACIÓN');
      y = drawObjectiveAnalysis(pdf, report.goalAnalysis, y);
    }

    const remainingConnections = rows(report.offensiveConnections).slice(4);
    if (remainingConnections.length) {
      for (let index = 0; index < remainingConnections.length; index += 20) {
        y = addPage('CONEXIONES OFENSIVAS · CONTINUACIÓN');
        y = drawConnections(pdf, remainingConnections.slice(index, index + 20), y);
      }
    }

    const videoActions = rows(report.videoActions);
    if (videoActions.length) {
      if (y + 31 > CONTENT_BOTTOM) y = addPage('ACCIONES EN VÍDEO');
      y = sectionTitle(pdf, 'Acciones en vídeo', y, '09');
      videoActions.forEach((action, index) => {
        const detailed = index < 4;
        const estimated = detailed ? Math.max(25, 18 + actionDetailLines(action).length * 4.2) : 10;
        if (y + estimated > CONTENT_BOTTOM) {
          y = addPage('ACCIONES EN VÍDEO · CONTINUACIÓN');
          y = sectionTitle(pdf, 'Acciones en vídeo · continuación', y, '09');
        }
        y = drawVideoAction(pdf, action, y, index >= 4);
      });
    }
  }

  pageSections.forEach((_, index) => {
    pdf.setPage(index + 1);
    drawFooter(pdf, report, index + 1, pageSections.length);
  });

  const expectedVideoUrls = rows(report.videoActions).map((action) => cleanUrl(action.url)).filter(Boolean);
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
      playerPhoto: {
        background: 'white',
        fit: 'contain',
        centered: true,
        imageLoaded: Boolean(images.player?.data),
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
