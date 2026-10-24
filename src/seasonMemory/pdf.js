import { jsPDF } from 'jspdf';

const W = 210;
const H = 297;
const M = 17;
const C = {
  navy: [9, 22, 41], ink: [20, 33, 50], slate: [91, 106, 123],
  pale: [244, 247, 250], white: [255, 255, 255], line: [218, 225, 232],
  blue: [45, 126, 194], green: [25, 136, 92], amber: [193, 130, 32],
  violet: [111, 89, 169], red: [162, 66, 72], muted: [151, 166, 182],
};
const COMPETITION_COLOR = { league: C.green, cup: C.amber, friendly: C.violet };

function fill(pdf, color) { pdf.setFillColor(...color); }
function stroke(pdf, color) { pdf.setDrawColor(...color); }
function box(pdf, x, y, w, h, color, radius = 0) {
  fill(pdf, color);
  if (radius) pdf.roundedRect(x, y, w, h, radius, radius, 'F');
  else pdf.rect(x, y, w, h, 'F');
}
function rule(pdf, x1, y, x2, color = C.line) {
  stroke(pdf, color); pdf.setLineWidth(0.24); pdf.line(x1, y, x2, y);
}
function label(pdf, value, x, y, { size = 9, color = C.ink, bold = false, align = 'left', maxWidth } = {}) {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  const string = String(value);
  if (maxWidth && pdf.getTextWidth(string) > maxWidth) {
    throw new Error(`Texto fuera de espacio: ${string}`);
  }
  pdf.text(string, x, y, { align });
}
function fitImage(pdf, dataUrl, x, y, w, h) {
  if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('Escudo local PNG requerido');
  const { width, height } = pdf.getImageProperties(dataUrl);
  const scale = Math.min(w / width, h / height);
  const dw = width * scale; const dh = height * scale;
  pdf.addImage(dataUrl, 'PNG', x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, undefined, 'FAST');
}
function pageHeader(pdf, number, section) {
  box(pdf, 0, 0, W, 7, C.navy);
  label(pdf, 'NEXO CLUB', M, 18, { size: 8, bold: true, color: C.navy });
  label(pdf, section.toUpperCase(), W - M, 18, { size: 7, color: C.slate, align: 'right' });
  rule(pdf, M, 23, W - M);
  label(pdf, 'DEMOSTRACIÓN · DATOS FICTICIOS', M, 286, { size: 6.6, color: C.slate, bold: true });
  label(pdf, `ALMADINA SC SUB-23   /   2026-27                                      ${String(number).padStart(2, '0')} / 03`, W - M, 286,
    { size: 6.5, color: C.slate, align: 'right' });
  rule(pdf, M, 279, W - M);
}
function sectionHeading(pdf, index, heading, x, y, width) {
  label(pdf, index, x, y, { size: 8, bold: true, color: C.blue });
  label(pdf, heading.toUpperCase(), x + 10, y, { size: 8, bold: true, color: C.navy });
  rule(pdf, x, y + 3, x + width);
}
function competitionTag(pdf, text, color, x, y, width) {
  box(pdf, x, y, width, 8, color, 2);
  label(pdf, text.toUpperCase(), x + width / 2, y + 5.4,
    { size: 6.8, color: C.white, bold: true, align: 'center', maxWidth: width - 4 });
}
function kpi(pdf, x, y, width, value, title, note, accent = C.blue) {
  box(pdf, x, y, width, 33, C.pale, 3);
  box(pdf, x, y, 1.2, 33, accent);
  label(pdf, title.toUpperCase(), x + 6, y + 8, { size: 6.9, color: C.slate, bold: true, maxWidth: width - 12 });
  label(pdf, value, x + 6, y + 24, { size: 23, color: C.navy, bold: true });
  if (note) label(pdf, note, x + width - 5, y + 25, { size: 6.6, color: C.slate, align: 'right' });
}
function comparisonBar(pdf, x, y, width, home, away, color = C.blue) {
  const total = home + away;
  const homeWidth = total ? width * home / total : width / 2;
  box(pdf, x, y, width, 2.7, C.line, 1);
  box(pdf, x, y, homeWidth, 2.7, color, 1);
}
function safeExternalUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch { return null; }
}
export function drawExternalLink(pdf, text, url, x, y, width) {
  const target = safeExternalUrl(url);
  label(pdf, target ? text : 'Enlace de prueba no disponible', x, y,
    { size: 7.4, color: target ? C.blue : C.slate, maxWidth: width });
  if (target) {
    rule(pdf, x, y + 0.9, x + pdf.getTextWidth(text), C.blue);
    pdf.link(x, y - 3.5, width, 5, { url: target });
  }
  return Boolean(target);
}
function cover(pdf, data, crest) {
  box(pdf, 0, 0, W, H, C.navy);
  // La geometría evoca una línea de medio campo, sin distraer del escudo.
  stroke(pdf, [33, 56, 79]); pdf.setLineWidth(0.3);
  pdf.circle(184, 155, 74, 'S'); pdf.circle(184, 155, 42, 'S');
  pdf.line(184, 3, 184, 278);
  box(pdf, M, 20, 19, 1.3, C.blue);
  label(pdf, 'NEXO CLUB  /  DEPARTAMENTO DE ANÁLISIS', M, 32,
    { size: 8, bold: true, color: [190, 205, 222] });
  box(pdf, M, 52, 75, 77, C.white, 5);
  fitImage(pdf, crest, M + 8, 57, 59, 67);
  label(pdf, data.club.toUpperCase(), M, 149, { size: 11, bold: true, color: C.white });
  label(pdf, 'SUB-23  /  TEMPORADA ' + data.season, M, 158,
    { size: 8.2, color: [172, 191, 211] });
  box(pdf, M, 170, 63, 0.8, C.blue);
  label(pdf, 'MEMORIA DE', M, 191, { size: 29, bold: true, color: C.white });
  label(pdf, 'TEMPORADA', M, 210, { size: 29, bold: true, color: C.white });
  label(pdf, 'INFORME DEPORTIVO', M, 225, { size: 10, bold: true, color: [172, 191, 211] });
  rule(pdf, M, 263, W - M, [54, 77, 100]);
  label(pdf, `EDICIÓN DE DEMOSTRACIÓN  ·  ${data.generatedAt}`, M, 275,
    { size: 7, color: [172, 191, 211] });
  label(pdf, '01 / 03', W - M, 275, { size: 7, color: [172, 191, 211], align: 'right' });
  label(pdf, 'DATOS FICTICIOS', M, 284, { size: 7, bold: true, color: [172, 191, 211] });
}
function summary(pdf, data) {
  pdf.addPage(); pageHeader(pdf, 2, 'Resumen ejecutivo');
  label(pdf, '02  /  RESUMEN EJECUTIVO', M, 34, { size: 7.4, color: C.blue, bold: true });
  label(pdf, 'La temporada en cifras', M, 49, { size: 23, bold: true, color: C.navy });
  label(pdf, 'Balance global de todas las competiciones disputadas', M, 57, { size: 9, color: C.slate });
  kpi(pdf, M, 67, 75, data.totals.played, 'Partidos disputados', '3 competiciones', C.blue);
  const smallW = 31;
  kpi(pdf, 96, 67, smallW, data.totals.wins, 'Victorias', '', C.green);
  kpi(pdf, 130, 67, smallW, data.totals.draws, 'Empates', '', C.amber);
  kpi(pdf, 164, 67, 29, data.totals.losses, 'Derrotas', '', C.red);
  kpi(pdf, M, 105, 54, data.totals.goalsFor, 'Goles a favor', '', C.green);
  kpi(pdf, 76, 105, 54, data.totals.goalsAgainst, 'Goles en contra', '', C.red);
  kpi(pdf, 135, 105, 58, `+${data.totals.goalDifference}`, 'Diferencia', '', C.blue);

  sectionHeading(pdf, '01', 'Distribución de resultados', M, 152, W - 2 * M);
  const rx = M; const rw = W - 2 * M; const total = data.totals.played;
  let offset = rx;
  [
    ['Victorias', data.totals.wins, C.green],
    ['Empates', data.totals.draws, C.amber],
    ['Derrotas', data.totals.losses, C.red],
  ].forEach(([name, count, color], index) => {
    const segment = rw * count / total;
    box(pdf, offset, 161, segment, 7, color);
    const lx = [M, 86, 146][index];
    box(pdf, lx, 174, 3, 3, color, 1);
    label(pdf, `${name}  ${count}  ·  ${Math.round(100 * count / total)}%`, lx + 5, 177,
      { size: 7.4, color: C.ink });
    offset += segment;
  });

  sectionHeading(pdf, '02', 'Rendimiento por competición', M, 193, W - 2 * M);
  label(pdf, 'COMPETICIÓN', M, 203, { size: 6.6, bold: true, color: C.slate });
  [['PJ', 105], ['G-E-P', 134], ['GF-GC', 161], ['DIF.', 190]].forEach(([t, x]) =>
    label(pdf, t, x, 203, { size: 6.6, bold: true, color: C.slate, align: 'right' }));
  data.competitions.forEach((item, index) => {
    const y = 208 + index * 18;
    if (index % 2 === 0) box(pdf, M, y - 2, W - 2 * M, 17, C.pale, 1.5);
    competitionTag(pdf, item.name, COMPETITION_COLOR[item.key], M + 2, y + 1, 31);
    label(pdf, item.played, 105, y + 7, { size: 9, bold: true, align: 'right' });
    label(pdf, `${item.wins}-${item.draws}-${item.losses}`, 134, y + 7, { size: 8.5, align: 'right' });
    label(pdf, `${item.goalsFor}-${item.goalsAgainst}`, 161, y + 7, { size: 8.5, align: 'right' });
    label(pdf, `+${item.goalDifference}`, 190, y + 7, { size: 8.5, bold: true, align: 'right' });
  });
  label(pdf, 'PJ: partidos jugados · G-E-P: victorias, empates, derrotas', M, 269,
    { size: 7.2, color: C.slate });
  label(pdf, 'Los puntos de Liga no se agregan a Copa ni a amistosos.', M, 275,
    { size: 7.2, color: C.slate });
}
function matchPage(pdf, data, crest) {
  pdf.addPage(); pageHeader(pdf, 3, 'Ficha de partido');
  const match = data.match;
  label(pdf, '03  /  FICHA DE PARTIDO', M, 34, { size: 7.4, color: C.blue, bold: true });
  label(pdf, 'Análisis de partido', M, 45, { size: 20, bold: true, color: C.navy });
  competitionTag(pdf, match.competition, C.green, M, 51, 27);
  label(pdf, `${match.round.toUpperCase()}   ·   ${match.date.toUpperCase()}`, 49, 56,
    { size: 7.3, color: C.slate, bold: true });

  box(pdf, M, 65, W - 2 * M, 35, C.navy, 3);
  box(pdf, M + 6, 69, 26, 27, C.white, 2);
  fitImage(pdf, crest, M + 8, 70, 22, 25);
  label(pdf, 'LOCAL', M + 36, 76, { size: 6.5, color: C.muted, bold: true });
  label(pdf, 'Almadina SC', M + 36, 85, { size: 11, color: C.white, bold: true, maxWidth: 57 });
  label(pdf, 'Sub-23', M + 36, 91, { size: 7.3, color: C.muted });
  label(pdf, `${match.homeGoals} : ${match.awayGoals}`, 130, 87,
    { size: 24, color: C.white, bold: true, align: 'center' });
  stroke(pdf, [119, 139, 159]); pdf.setLineWidth(0.4); pdf.circle(183, 82, 7.2, 'S');
  label(pdf, '—', 183, 84, { size: 11, color: C.muted, align: 'center' });
  label(pdf, 'VISITANTE', 170, 75, { size: 6.5, color: C.muted, bold: true, align: 'right' });
  label(pdf, 'Rival de', 170, 83, { size: 9.2, color: C.white, bold: true, align: 'right' });
  label(pdf, 'demostración', 170, 90, { size: 9.2, color: C.white, bold: true, align: 'right' });

  sectionHeading(pdf, '01', 'Datos comparados', M, 111, 86);
  match.stats.forEach((stat, index) => {
    const y = 121 + index * 13;
    label(pdf, stat.label, M, y, { size: 7.5, color: C.slate });
    label(pdf, `${stat.home}${stat.suffix}`, 77, y, { size: 8, bold: true, align: 'right' });
    label(pdf, `${stat.away}${stat.suffix}`, 103, y, { size: 8, color: C.slate, align: 'right' });
    comparisonBar(pdf, M, y + 2.5, 86, stat.home, stat.away);
  });
  label(pdf, 'AZUL: ALMADINA  /  GRIS: RIVAL', M, 190,
    { size: 6.5, bold: true, color: C.slate });

  sectionHeading(pdf, '02', 'Goles e incidencias', 112, 111, 81);
  stroke(pdf, C.line); pdf.line(119, 121, 119, 154);
  match.events.forEach((event, index) => {
    const y = 124 + index * 13;
    fill(pdf, event.side === 'home' ? C.blue : C.slate);
    pdf.circle(119, y - 1.7, 1.7, 'F');
    label(pdf, event.minute, 125, y, { size: 8, bold: true });
    label(pdf, event.label, 140, y, { size: 7.5, maxWidth: 53 });
  });
  sectionHeading(pdf, '03', 'Vídeos y acciones destacadas', 112, 168, 81);
  match.videos.forEach((video, index) => {
    const y = 179 + index * 12;
    label(pdf, `${video.minute}  ${video.label}`, 112, y, { size: 7.4, bold: true });
    drawExternalLink(pdf, 'Ver vídeo', video.url, 112, y + 5, 78);
  });

  sectionHeading(pdf, '04', 'Once inicial', M, 207, W - 2 * M);
  label(pdf, 'NOMBRES FICTICIOS · DISTRIBUCIÓN ILUSTRATIVA', M, 216,
    { size: 6.5, color: C.slate, bold: true });
  match.lineup.forEach((player, index) => {
    const col = index < 6 ? 0 : 1;
    const row = col === 0 ? index : index - 6;
    const x = col === 0 ? M : 108;
    const y = 226 + row * 8;
    box(pdf, x, y - 4.7, 8, 6.5, C.pale, 1.2);
    label(pdf, player.number, x + 4, y, { size: 7, bold: true, align: 'center' });
    label(pdf, player.name, x + 11, y, { size: 8, color: C.ink });
  });
  label(pdf, 'Esta ficha demuestra la composición; no representa un partido real.', M, 273,
    { size: 6.8, color: C.slate });
}

export function createSeasonMemoryPdf({ data, crestDataUrl }) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({
    title: 'NEXO CLUB · Memoria de Temporada · DEMO',
    subject: 'Prototipo visual con datos ficticios',
    author: 'NEXO CLUB',
    keywords: 'demostración, datos ficticios, temporada',
  });
  cover(pdf, data, crestDataUrl);
  summary(pdf, data);
  matchPage(pdf, data, crestDataUrl);
  if (pdf.getNumberOfPages() !== 3) throw new Error('El prototipo debe tener tres páginas');
  return pdf;
}
