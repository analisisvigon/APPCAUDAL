import { jsPDF } from 'jspdf';
import { PDF_THEME, competitionColor } from './pdfTheme.js';

const { page, colors: C } = PDF_THEME;
const { width: W, height: H, margin: M } = page;

const fill = (pdf, color) => pdf.setFillColor(...color);
const stroke = (pdf, color) => pdf.setDrawColor(...color);

function box(pdf, x, y, width, height, color, radius = 0, style = 'F') {
  fill(pdf, color);
  if (radius) pdf.roundedRect(x, y, width, height, radius, radius, style);
  else pdf.rect(x, y, width, height, style);
}

function line(pdf, x1, y1, x2, y2, color = C.line, width = 0.25) {
  stroke(pdf, color);
  pdf.setLineWidth(width);
  pdf.line(x1, y1, x2, y2);
}

function text(pdf, value, x, y, options = {}) {
  const { size = 9, color = C.ink, bold = false, align = 'left', maxWidth = 0, tracking = 0 } = options;
  const label = String(value ?? '');
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  if (tracking) pdf.setCharSpace(tracking);
  if (maxWidth && pdf.getTextWidth(label) > maxWidth) throw new Error(`Texto fuera de espacio: ${label}`);
  pdf.text(label, x, y, { align });
  if (tracking) pdf.setCharSpace(0);
}

function fitImage(pdf, dataUrl, x, y, width, height) {
  if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('Escudo local PNG requerido');
  const image = pdf.getImageProperties(dataUrl);
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  pdf.addImage(dataUrl, 'PNG', x + (width - drawWidth) / 2, y + (height - drawHeight) / 2,
    drawWidth, drawHeight, undefined, 'FAST');
}

function pageChrome(pdf, pageNumber, section) {
  box(pdf, 0, 0, W, 5, C.navy);
  box(pdf, 0, 5, W / 3, 1, C.green);
  box(pdf, W / 3, 5, W / 3, 1, C.amber);
  box(pdf, (W / 3) * 2, 5, W / 3, 1, C.violet);
  text(pdf, 'NEXO CLUB', M, 17, { size: 8, color: C.navy, bold: true, tracking: 0.5 });
  text(pdf, section.toUpperCase(), W - M, 17, { size: 6.8, color: C.slate, align: 'right', tracking: 0.35 });
  line(pdf, M, 22, W - M, 22);
  line(pdf, M, 279, W - M, 279);
  text(pdf, 'DEMOSTRACIÓN · DATOS FICTICIOS', M, 287, { size: 6.4, color: C.slate, bold: true });
  text(pdf, `AL-MADINA SC SUB-23  ·  2026/27     ${String(pageNumber).padStart(2, '0')} / 03`,
    W - M, 287, { size: 6.3, color: C.slate, align: 'right' });
}

function eyebrow(pdf, value, x, y, color = C.blue) {
  text(pdf, value.toUpperCase(), x, y, { size: 6.8, color, bold: true, tracking: 0.55 });
}

function sectionTitle(pdf, index, title, x, y, width, accent = C.blue) {
  box(pdf, x, y - 5, 6, 6, accent, 1.5);
  text(pdf, index, x + 3, y - 0.6, { size: 5.5, color: C.paper, bold: true, align: 'center' });
  text(pdf, title.toUpperCase(), x + 10, y, { size: 7.4, color: C.ink, bold: true, tracking: 0.15 });
  line(pdf, x, y + 4, x + width, y + 4);
}

function competitionPill(pdf, competition, x, y, width) {
  const color = competitionColor(competition.key);
  box(pdf, x, y, width, 8, color, 4);
  text(pdf, competition.name.toUpperCase(), x + width / 2, y + 5.4,
    { size: 6.3, color: C.paper, bold: true, align: 'center', maxWidth: width - 5 });
}

function cover(pdf, data, crestDataUrl) {
  box(pdf, 0, 0, W, H, C.navy);
  box(pdf, 0, 0, 5, H, C.blue);
  box(pdf, 5, 0, 1.4, 99, C.green);
  box(pdf, 5, 99, 1.4, 99, C.amber);
  box(pdf, 5, 198, 1.4, 99, C.violet);
  stroke(pdf, [28, 52, 77]);
  pdf.setLineWidth(0.35);
  pdf.circle(180, 156, 71, 'S');
  pdf.circle(180, 156, 39, 'S');
  pdf.line(180, 6, 180, 283);
  line(pdf, 109, 156, 210, 156, [28, 52, 77], 0.35);

  text(pdf, 'NEXO', 19, 24, { size: 12, color: C.paper, bold: true, tracking: 0.5 });
  text(pdf, 'CLUB', 54, 24, { size: 12, color: C.cyan, bold: true, tracking: 0.5 });
  text(pdf, 'SPORTS INTELLIGENCE', 19, 32, { size: 6.5, color: C.muted, tracking: 0.8 });
  box(pdf, 19, 49, 45, 9, C.navySoft, 4.5);
  text(pdf, 'EDICIÓN DEMO · 2026/27', 41.5, 55.1,
    { size: 6.4, color: C.cyan, bold: true, align: 'center' });

  text(pdf, 'MEMORIA', 18, 82, { size: 29, color: C.paper, bold: true, tracking: -0.25 });
  text(pdf, 'DE TEMPORADA', 18, 102, { size: 25, color: C.paper, bold: true, tracking: -0.2 });
  box(pdf, 19, 111, 51, 1.1, C.blue);
  text(pdf, 'INFORME DEPORTIVO', 19, 124, { size: 8.5, color: C.muted, bold: true, tracking: 0.45 });
  box(pdf, 119, 54, 66, 82, C.paper, 6);
  box(pdf, 123, 58, 58, 74, C.mist, 4);
  fitImage(pdf, crestDataUrl, 128, 63, 48, 64);

  text(pdf, data.team.toUpperCase(), 19, 169, { size: 15, color: C.paper, bold: true, maxWidth: 100 });
  text(pdf, `TEMPORADA ${data.season}`, 19, 181, { size: 8.5, color: C.cyan, bold: true, tracking: 0.45 });
  text(pdf, 'DOSSIER DE RENDIMIENTO · CUERPO TÉCNICO', 19, 191,
    { size: 6.7, color: C.muted, tracking: 0.25 });
  text(pdf, '26', 188, 222, { size: 55, color: [27, 49, 73], bold: true, align: 'right' });
  text(pdf, '/ 27', 188, 244, { size: 27, color: [52, 78, 103], bold: true, align: 'right' });

  line(pdf, 19, 263, 191, 263, [49, 72, 96], 0.35);
  text(pdf, `GENERADO PARA REVISIÓN VISUAL · ${data.generatedAt.toUpperCase()}`, 19, 274,
    { size: 6.3, color: C.muted, bold: true });
  text(pdf, '01 / 03', 191, 274, { size: 6.3, color: C.muted, align: 'right' });
  text(pdf, 'PROTOTIPO · SIN DATOS REALES', 19, 284, { size: 6.8, color: C.paper, bold: true });
}

function miniKpi(pdf, x, y, width, value, title, accent) {
  box(pdf, x, y, width, 28, C.mist, 3);
  box(pdf, x, y, width, 1.2, accent, 0.5);
  text(pdf, title.toUpperCase(), x + 5, y + 8, { size: 6.2, color: C.slate, bold: true });
  text(pdf, value, x + 5, y + 22, { size: 18, color: C.navy, bold: true });
}

function seasonSummary(pdf, data) {
  pdf.addPage();
  pageChrome(pdf, 2, 'Resumen ejecutivo');
  eyebrow(pdf, '02  /  Resumen ejecutivo', M, 33);
  text(pdf, 'La temporada en cifras', M, 47, { size: 22, color: C.navy, bold: true });
  text(pdf, 'Lectura global y comparativa por competición', M, 55, { size: 8.2, color: C.slate });

  box(pdf, M, 64, W - 2 * M, 43, C.navy, 4);
  text(pdf, data.totals.played, M + 9, 94, { size: 34, color: C.paper, bold: true });
  text(pdf, 'PARTIDOS', M + 10, 75, { size: 6.5, color: C.cyan, bold: true, tracking: 0.7 });
  text(pdf, `${data.totals.wins} V  ·  ${data.totals.draws} E  ·  ${data.totals.losses} D`,
    M + 54, 82, { size: 13, color: C.paper, bold: true });
  text(pdf, 'BALANCE GLOBAL', M + 54, 72, { size: 6.3, color: C.muted, bold: true, tracking: 0.5 });
  text(pdf, `${data.totals.goalsFor} GF`, M + 54, 98, { size: 8.5, color: C.green, bold: true });
  text(pdf, `${data.totals.goalsAgainst} GC`, M + 82, 98, { size: 8.5, color: C.red, bold: true });
  text(pdf, `${data.totals.goalDifference >= 0 ? '+' : ''}${data.totals.goalDifference} DIF.`,
    M + 113, 98, { size: 8.5, color: C.cyan, bold: true });
  text(pdf, `${Math.round(data.totals.wins / data.totals.played * 100)}%`, W - M - 12, 88,
    { size: 22, color: C.paper, bold: true, align: 'center' });
  text(pdf, 'VICTORIAS', W - M - 12, 98, { size: 5.8, color: C.muted, bold: true, align: 'center' });

  const gap = 4;
  const kpiWidth = (W - 2 * M - gap * 3) / 4;
  miniKpi(pdf, M, 114, kpiWidth, data.totals.wins, 'Victorias', C.green);
  miniKpi(pdf, M + kpiWidth + gap, 114, kpiWidth, data.totals.draws, 'Empates', C.amber);
  miniKpi(pdf, M + (kpiWidth + gap) * 2, 114, kpiWidth, data.totals.losses, 'Derrotas', C.red);
  miniKpi(pdf, M + (kpiWidth + gap) * 3, 114, kpiWidth, `+${data.totals.goalDifference}`, 'Diferencia', C.blue);

  sectionTitle(pdf, '01', 'Distribución de resultados', M, 157, W - 2 * M);
  const total = data.totals.played;
  let barX = M;
  [['Victorias', data.totals.wins, C.green], ['Empates', data.totals.draws, C.amber], ['Derrotas', data.totals.losses, C.red]]
    .forEach(([name, count, color], index) => {
      const width = (W - 2 * M) * count / total;
      box(pdf, barX, 168, width, 7, color);
      const legendX = [M, 79, 143][index];
      box(pdf, legendX, 181, 3.2, 3.2, color, 1);
      text(pdf, `${name}  ${count} · ${Math.round(count / total * 100)}%`, legendX + 5, 184,
        { size: 7, color: C.ink });
      barX += width;
    });

  sectionTitle(pdf, '02', 'Rendimiento por competición', M, 202, W - 2 * M);
  const cardGap = 4;
  const cardWidth = (W - 2 * M - cardGap * 2) / 3;
  data.competitions.forEach((competition, index) => {
    const x = M + index * (cardWidth + cardGap);
    const accent = competitionColor(competition.key);
    box(pdf, x, 212, cardWidth, 51, C.mist, 3);
    box(pdf, x, 212, cardWidth, 3, accent, 1.5);
    text(pdf, competition.name.toUpperCase(), x + 5, 224,
      { size: 7, color: accent, bold: true, maxWidth: cardWidth - 10 });
    text(pdf, competition.played, x + 5, 242, { size: 21, color: C.navy, bold: true });
    text(pdf, 'PJ', x + 5, 250, { size: 5.8, color: C.slate, bold: true });
    text(pdf, `${competition.wins}-${competition.draws}-${competition.losses}`, x + cardWidth - 5, 237,
      { size: 8.5, color: C.ink, bold: true, align: 'right' });
    text(pdf, 'V-E-D', x + cardWidth - 5, 244, { size: 5.8, color: C.slate, align: 'right' });
    text(pdf, `${competition.goalsFor}:${competition.goalsAgainst}  ·  ${competition.goalDifference >= 0 ? '+' : ''}${competition.goalDifference}`,
      x + cardWidth - 5, 256, { size: 7.2, color: C.slate, bold: true, align: 'right' });
  });
  text(pdf, 'Las competiciones se presentan por separado; no se agregan puntos entre formatos.',
    M, 272, { size: 6.7, color: C.slate });
}

function drawPitch(pdf, lineup, formation, x, y, width, height) {
  box(pdf, x, y, width, height, C.pitch, 4);
  const stripeWidth = width / 6;
  for (let index = 0; index < 6; index += 2) box(pdf, x + index * stripeWidth, y, stripeWidth, height, C.pitchAlt);
  stroke(pdf, [219, 239, 229]);
  pdf.setLineWidth(0.45);
  pdf.roundedRect(x + 4, y + 4, width - 8, height - 8, 1, 1, 'S');
  pdf.line(x + 4, y + height / 2, x + width - 4, y + height / 2);
  pdf.circle(x + width / 2, y + height / 2, 12, 'S');
  pdf.circle(x + width / 2, y + height / 2, 0.8, 'F');
  pdf.rect(x + width * 0.25, y + 4, width * 0.5, 19, 'S');
  pdf.rect(x + width * 0.36, y + 4, width * 0.28, 8, 'S');
  pdf.rect(x + width * 0.25, y + height - 23, width * 0.5, 19, 'S');
  pdf.rect(x + width * 0.36, y + height - 12, width * 0.28, 8, 'S');
  text(pdf, formation, x + width - 7, y + 11, { size: 6.2, color: C.paper, bold: true, align: 'right' });

  lineup.forEach((player) => {
    const playerX = x + 8 + (width - 16) * player.x / 100;
    const playerY = y + 8 + (height - 16) * player.y / 100;
    fill(pdf, C.navy);
    stroke(pdf, C.paper);
    pdf.setLineWidth(0.7);
    pdf.circle(playerX, playerY, 4.2, 'FD');
    text(pdf, player.number, playerX, playerY + 1.7,
      { size: 7, color: C.paper, bold: true, align: 'center' });
    box(pdf, playerX - 9.5, playerY + 5, 19, 5.7, C.paper, 2.2);
    text(pdf, `${player.name} · ${player.role}`, playerX, playerY + 9,
      { size: 4.3, color: C.navy, bold: true, align: 'center', maxWidth: 17 });
  });
}

function statBar(pdf, stat, x, y, width) {
  const total = stat.home + stat.away;
  const homeRatio = total ? stat.home / total : 0.5;
  text(pdf, stat.label, x, y, { size: 6.3, color: C.slate });
  text(pdf, `${stat.home}${stat.suffix}`, x + width - 14, y, { size: 6.8, color: C.navy, bold: true, align: 'right' });
  text(pdf, `${stat.away}${stat.suffix}`, x + width, y, { size: 6.8, color: C.slate, align: 'right' });
  box(pdf, x, y + 2, width, 2.4, C.line, 1.2);
  box(pdf, x, y + 2, width * homeRatio, 2.4, C.blue, 1.2);
}

function safeExternalUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function drawExternalLink(pdf, label, url, x, y, width) {
  const target = safeExternalUrl(url);
  if (!target) {
    text(pdf, 'Sin URL registrada', x, y, { size: 6.3, color: C.slate, maxWidth: width });
    return false;
  }
  text(pdf, label, x, y, { size: 6.5, color: C.blue, bold: true, maxWidth: width });
  line(pdf, x, y + 0.8, x + pdf.getTextWidth(label), y + 0.8, C.blue, 0.2);
  pdf.link(x, y - 3.5, width, 5, { url: target });
  return true;
}

function matchReport(pdf, data, crestDataUrl) {
  pdf.addPage();
  pageChrome(pdf, 3, 'Ficha de partido');
  const match = data.match;
  const competition = match.competitionPresentation;
  const accent = competitionColor(competition.key);

  eyebrow(pdf, '03  /  Ficha de partido', M, 33, accent);
  text(pdf, 'Match report', M, 46, { size: 21, color: C.navy, bold: true });
  competitionPill(pdf, competition, M, 52, 38);
  text(pdf, `${match.round.toUpperCase()}  ·  ${match.date.toUpperCase()}`, 58, 57.3,
    { size: 6.8, color: C.slate, bold: true });
  text(pdf, match.context.toUpperCase(), W - M, 57.3,
    { size: 6.2, color: C.slate, bold: true, align: 'right' });

  box(pdf, M, 66, W - 2 * M, 34, C.navy, 4);
  box(pdf, M + 6, 70, 25, 26, C.paper, 3);
  fitImage(pdf, crestDataUrl, M + 9, 72, 19, 22);
  text(pdf, 'LOCAL', M + 36, 76, { size: 5.7, color: C.muted, bold: true });
  text(pdf, 'Al-Madina SC', M + 36, 86, { size: 10.5, color: C.paper, bold: true });
  text(pdf, 'SUB-23', M + 36, 93, { size: 6, color: C.muted });
  text(pdf, `${match.homeGoals}`, 102, 90, { size: 26, color: C.paper, bold: true, align: 'center' });
  text(pdf, '—', 112, 88, { size: 13, color: C.muted, align: 'center' });
  text(pdf, `${match.awayGoals}`, 122, 90, { size: 26, color: C.paper, bold: true, align: 'center' });
  text(pdf, 'VISITANTE', W - M - 15, 76, { size: 5.7, color: C.muted, bold: true, align: 'right' });
  text(pdf, match.away, W - M - 15, 87, { size: 8.5, color: C.paper, bold: true, align: 'right', maxWidth: 46 });
  stroke(pdf, C.muted); pdf.setLineWidth(0.35); pdf.circle(W - M - 5, 83, 6, 'S');
  text(pdf, '—', W - M - 5, 85, { size: 8, color: C.muted, align: 'center' });

  sectionTitle(pdf, '01', `Once inicial · ${match.formation}`, M, 112, 111, accent);
  drawPitch(pdf, match.lineup, match.formation, M, 121, 111, 143);

  const rightX = 134;
  const rightWidth = W - M - rightX;
  sectionTitle(pdf, '02', 'Datos comparados', rightX, 112, rightWidth, accent);
  match.stats.forEach((stat, index) => statBar(pdf, stat, rightX, 124 + index * 11, rightWidth));
  text(pdf, 'AZUL: AL-MADINA  ·  GRIS: RIVAL', rightX, 180,
    { size: 5.5, color: C.slate, bold: true });

  sectionTitle(pdf, '03', 'Cronología', rightX, 193, rightWidth, accent);
  line(pdf, rightX + 3, 202, rightX + 3, 226, C.line, 0.5);
  match.events.forEach((event, index) => {
    const y = 204 + index * 10;
    fill(pdf, event.side === 'home' ? accent : C.neutral);
    pdf.circle(rightX + 3, y - 1.6, 1.6, 'F');
    text(pdf, event.minute, rightX + 8, y, { size: 6.5, color: C.ink, bold: true });
    text(pdf, event.label, rightX + 20, y, { size: 6.2, color: C.slate, maxWidth: rightWidth - 20 });
  });

  sectionTitle(pdf, '04', 'Vídeos de goles', rightX, 240, rightWidth, accent);
  match.videos.forEach((video, index) => {
    const y = 250 + index * 11;
    text(pdf, `${video.minute}  ${video.label}`, rightX, y, { size: 6.3, color: C.ink, bold: true });
    drawExternalLink(pdf, 'Abrir vídeo', video.url, rightX, y + 5, rightWidth);
  });
  text(pdf, 'Alineación y nombres ficticios · Distribución ilustrativa', M, 273,
    { size: 6.2, color: C.slate });
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
  seasonSummary(pdf, data);
  matchReport(pdf, data, crestDataUrl);
  if (pdf.getNumberOfPages() !== 3) throw new Error('El prototipo debe tener tres páginas');
  return pdf;
}
