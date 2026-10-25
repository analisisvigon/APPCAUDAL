import { jsPDF } from 'jspdf';
import { PDF_THEME, competitionColor } from './pdfTheme.js';
import { individualSectionCount, renderIndividualCompetition,
  renderIndividualGlobal } from './realIndividualPdf.js';
import { renderRealMatchCards } from './realMatchPdf.js';
import { physicalSectionCount, groupSectionCount, renderRealPhysical, renderRealGroup } from './realPerformancePdf.js';

const { page: P, colors: C } = PDF_THEME;
const W = P.width;
const M = P.margin;
const accent = (kind) => competitionColor(kind);
const fmt = (value) => String(value ?? '');
const percent = (value) => `${Math.round(value * 100)}%`;

function block(pdf, x, y, w, h, color, radius = 0) {
  pdf.setFillColor(...color);
  if (radius) pdf.roundedRect(x, y, w, h, radius, radius, 'F');
  else pdf.rect(x, y, w, h, 'F');
}
function ink(pdf, value, x, y, { size = 9, color = C.ink, bold = false, align = 'left' } = {}) {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  pdf.text(fmt(value), x, y, { align });
}
function fitting(pdf, value, x, y, width, options = {}) {
  let size = options.size || 9;
  pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  while (pdf.getTextWidth(fmt(value)) > width && size > 5.5) {
    size -= 0.3;
    pdf.setFontSize(size);
  }
  if (pdf.getTextWidth(fmt(value)) <= width) ink(pdf, value, x, y, { ...options, size });
  else ink(pdf, `${fmt(value).slice(0, 32)}…`, x, y, { ...options, size: 5.5 });
}
function wrapped(pdf, value, x, y, width, options = {}) {
  pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
  pdf.setFontSize(options.size || 8);
  const rows = pdf.splitTextToSize(fmt(value), width);
  rows.forEach((row, index) => ink(pdf, row, x, y + index * (options.leading || 5), options));
  return y + rows.length * (options.leading || 5);
}
function crest(pdf, dataUrl, x, y, w, h) {
  if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('Escudo PNG local requerido.');
  const properties = pdf.getImageProperties(dataUrl);
  const ratio = Math.min(w / properties.width, h / properties.height);
  const dw = properties.width * ratio;
  const dh = properties.height * ratio;
  pdf.addImage(dataUrl, 'PNG', x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, undefined, 'FAST');
}
function chrome(pdf, section, color = C.blue) {
  block(pdf, 0, 0, W, 5, C.navy);
  block(pdf, 0, 5, W, 1, color);
  ink(pdf, 'NEXO CLUB', M, 17, { size: 8, color: C.navy, bold: true });
  ink(pdf, section.toUpperCase(), W - M, 17, { size: 7, color: C.slate, align: 'right' });
  pdf.setDrawColor(...C.line);
  pdf.line(M, 22, W - M, 22);
}
function page(pdf, section, color) {
  pdf.addPage();
  chrome(pdf, section, color);
  return pdf.getNumberOfPages();
}
function heading(pdf, title, sub = '') {
  fitting(pdf, title, M, 42, W - 2 * M, { size: 21, color: C.navy, bold: true });
  if (sub) wrapped(pdf, sub, M, 51, W - 2 * M, { size: 8, color: C.slate });
}
function card(pdf, x, y, w, h, title, value, color = C.blue) {
  block(pdf, x, y, w, h, C.mist, 3);
  block(pdf, x, y, w, 1.6, color);
  fitting(pdf, title.toUpperCase(), x + 4, y + 8, w - 8, { size: 6.4, color: C.slate, bold: true });
  fitting(pdf, value, x + 4, y + h - 5, w - 8, { size: 16, color: C.navy, bold: true });
}
function distribution(pdf, totals, x, y, w) {
  const rows = [['Victorias', totals.wins, C.green], ['Empates', totals.draws, C.amber],
    ['Derrotas', totals.losses, C.red]];
  let at = x;
  rows.forEach(([label, count, color], index) => {
    const width = totals.played ? w * count / totals.played : 0;
    if (width > 0) block(pdf, at, y, width, 7, color);
    at += width;
    const legendX = x + index * (w / 3);
    block(pdf, legendX, y + 14, 3, 3, color, 1);
    ink(pdf, `${label}  ${count}`, legendX + 5, y + 17, { size: 7, color: C.ink });
  });
}

function cover(pdf, model, crestDataUrl) {
  block(pdf, 0, 0, W, 297, C.navy);
  block(pdf, 0, 0, 5, 297, C.blue);
  block(pdf, 5, 0, 1.4, 99, C.green);
  block(pdf, 5, 99, 1.4, 99, C.amber);
  block(pdf, 5, 198, 1.4, 99, C.violet);
  pdf.setDrawColor(28, 52, 77);
  pdf.circle(180, 156, 71);
  pdf.circle(180, 156, 39);
  ink(pdf, 'NEXO CLUB', 19, 24, { size: 12, color: C.paper, bold: true });
  block(pdf, 19, 49, 83, 9, C.navySoft, 4);
  fitting(pdf, model.selection === 'season' ? 'MEMORIA DE TEMPORADA' : 'INFORME DE COMPETICIÓN',
    24, 55, 73, { size: 6.5, color: C.cyan, bold: true });
  ink(pdf, 'MEMORIA', 18, 82, { size: 29, color: C.paper, bold: true });
  ink(pdf, 'DE TEMPORADA', 18, 102, { size: 25, color: C.paper, bold: true });
  block(pdf, 19, 111, 51, 1.1, C.blue);
  ink(pdf, 'INFORME DEPORTIVO', 19, 124, { size: 8.5, color: C.muted, bold: true });
  block(pdf, 119, 54, 66, 82, C.paper, 6);
  block(pdf, 123, 58, 58, 74, C.mist, 4);
  crest(pdf, crestDataUrl, 128, 63, 48, 64);
  fitting(pdf, (model.context.displayName || model.context.teamName).toUpperCase(), 19, 169, 105,
    { size: 15, color: C.paper, bold: true });
  fitting(pdf, `TEMPORADA ${model.context.seasonLabel}`, 19, 181, 105,
    { size: 8.5, color: C.cyan, bold: true });
  if (model.selection !== 'season') fitting(pdf, `SELECCIÓN PARCIAL · ${model.competitions[0].name}`,
    19, 193, 170, { size: 8, color: C.amber, bold: true });
  else if (model.excludedTotal) fitting(pdf, `COBERTURA PARCIAL · ${model.excludedTotal} REGISTROS EXCLUIDOS`,
    19, 193, 170, { size: 8, color: C.amber, bold: true });
  pdf.setDrawColor(49, 72, 96);
  pdf.line(19, 263, 191, 263);
  ink(pdf, `GENERADO ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(model.generatedAt).toUpperCase()}`,
    19, 274, { size: 6.5, color: C.muted, bold: true });
  ink(pdf, 'DATOS REGISTRADOS EN EL MOMENTO DE GENERACIÓN', 19, 284,
    { size: 6.4, color: C.paper, bold: true });
}

function summary(pdf, model) {
  page(pdf, 'Resumen ejecutivo');
  heading(pdf, model.selection === 'season' && !model.excludedTotal
    ? 'La temporada en cifras' : 'Partidos acreditados', model.selection === 'season'
    ? `${model.context.displayName || model.context.teamName} · ${model.context.seasonLabel}`
    : `Selección parcial · ${model.competitions[0].name}`);
  const t = model.totals;
  block(pdf, M, 63, W - 2 * M, 42, C.navy, 4);
  ink(pdf, 'PARTIDOS DISPUTADOS', M + 8, 75, { size: 7, color: C.cyan, bold: true });
  ink(pdf, t.played, M + 8, 94, { size: 28, color: C.paper, bold: true });
  ink(pdf, `${t.wins} V · ${t.draws} E · ${t.losses} D`, M + 58, 81,
    { size: 13, color: C.paper, bold: true });
  ink(pdf, `${t.goalsFor} GF · ${t.goalsAgainst} GC · ${t.goalDifference >= 0 ? '+' : ''}${t.goalDifference} DIF`,
    M + 58, 96, { size: 9, color: C.cyan, bold: true });
  const cw = (W - 2 * M - 12) / 4;
  [[t.wins, 'Victorias', C.green], [t.draws, 'Empates', C.amber],
    [t.losses, 'Derrotas', C.red], [percent(t.winRate), '% victorias', C.blue]]
    .forEach(([value, label, color], i) => card(pdf, M + i * (cw + 4), 113, cw, 29, label, value, color));
  ink(pdf, 'DISTRIBUCIÓN DE RESULTADOS', M, 155, { size: 8, color: C.navy, bold: true });
  distribution(pdf, t, M, 161, W - 2 * M);
  ink(pdf, `LOCAL ${t.homePlayed} PJ · ${t.homeWins} V     VISITANTE ${t.awayPlayed} PJ · ${t.awayWins} V`,
    M, 194, { size: 6.8, color: C.slate });
  ink(pdf, 'COMPETICIONES INCLUIDAS', M, 205, { size: 8, color: C.navy, bold: true });
  let y = 215;
  model.competitions.slice(0, 6).forEach((comp) => {
    block(pdf, M, y - 4, 3, 5, accent(comp.kind), 1);
    fitting(pdf, comp.name, M + 6, y, 75, { size: 8, bold: true });
    ink(pdf, `${comp.totals.played} PJ · ${comp.totals.wins}-${comp.totals.draws}-${comp.totals.losses}`,
      W - M, y, { size: 7.5, align: 'right', color: C.slate });
    y += 10;
  });
  if (model.competitions.length > 6) ink(pdf, `Y ${model.competitions.length - 6} competiciones más en el índice.`,
    M, 272, { size: 6.3, color: C.slate });
}

function evolution(pdf, model, sections) {
  const played = model.matches.filter((match) => match.result);
  const chunks = [];
  for (let i = 0; i < played.length; i += 20) chunks.push(played.slice(i, i + 20));
  if (!chunks.length) chunks.push([]);
  chunks.forEach((rows, pageIndex) => {
    const number = page(pdf, 'Evolución deportiva');
    if (pageIndex === 0) sections.push({ name: 'Evolución deportiva', page: number });
    heading(pdf, 'Evolución deportiva', `Resultados acreditados · ${pageIndex + 1}/${chunks.length}`);
    const startY = 70;
    rows.forEach((match, index) => {
      const y = startY + index * 9.5;
      block(pdf, M, y - 5, W - 2 * M, 8, index % 2 ? C.paper : C.mist, 1);
      block(pdf, M + 1, y - 5, 2, 8,
        match.outcome === 'win' ? C.green : match.outcome === 'draw' ? C.amber : C.red);
      ink(pdf, match.date, M + 6, y, { size: 7, color: C.slate });
      fitting(pdf, match.round || match.opponent, M + 32, y, 49, { size: 7.3, color: C.ink });
      fitting(pdf, match.competition.name, M + 85, y, 49, { size: 7, color: accent(match.competition.kind) });
      ink(pdf, `${match.result.goalsFor}-${match.result.goalsAgainst}`, W - M - 23, y,
        { size: 8, bold: true, color: C.navy, align: 'right' });
      const gw = Math.min(20, match.result.goalsFor * 2.6);
      const aw = Math.min(20, match.result.goalsAgainst * 2.6);
      if (gw) block(pdf, W - M - 20, y - 4, gw, 1.7, C.green);
      if (aw) block(pdf, W - M - 20, y, aw, 1.7, C.red);
    });
    if (!rows.length) ink(pdf, 'Sin partidos disputados con marcador completo.', M, 77,
      { size: 9, color: C.slate });
    ink(pdf, 'VERDE · GOLES A FAVOR     ROJO · GOLES EN CONTRA', M, 268,
      { size: 6.5, color: C.slate });
  });
}

function statisticsCoverageLayout(model) {
  const available = model.metrics.filter((metric) => metric.covered > 0);
  const y = Math.max(105, 69 + available.length * 27);
  const roomForRows = Math.max(0, Math.floor((260 - (y + 10)) / 10) + 1);
  const onFirstPage = Math.min(5, roomForRows, model.competitions.length);
  return { available, y, onFirstPage };
}

function statisticsSectionCount(model) {
  const { onFirstPage } = statisticsCoverageLayout(model);
  return 1 + Math.ceil((model.competitions.length - onFirstPage) / 7);
}

function statistics(pdf, model, sections) {
  sections.push({ name: 'Estadísticas colectivas', page: page(pdf, 'Estadísticas colectivas') });
  heading(pdf, 'Indicadores colectivos', 'Promedios solo entre partidos disputados con valor válido.');
  const { available, y, onFirstPage } = statisticsCoverageLayout(model);
  if (!available.length) ink(pdf, 'No hay indicadores colectivos registrados para esta selección.', M, 78,
    { size: 9, color: C.slate });
  available.forEach((metric, index) => {
    const y = 66 + index * 27;
    card(pdf, M, y, 85, 23, metric.label, `${metric.average.toFixed(1)}${metric.unit}`, C.blue);
    ink(pdf, `${metric.covered}/${metric.eligible} partidos con dato`, M + 93, y + 14,
      { size: 8, color: C.slate });
  });
  if (onFirstPage) {
    ink(pdf, 'COBERTURA POR COMPETICIÓN', M, y, { size: 8, color: C.navy, bold: true });
    model.competitions.slice(0, onFirstPage).forEach((comp, index) => {
      const yy = y + 10 + index * 10;
      fitting(pdf, comp.name, M, yy, 65, { size: 7.5, bold: true });
      const labels = comp.metrics.filter((metric) => metric.covered).map((metric) =>
        `${metric.label}: ${metric.covered}/${metric.eligible}`);
      fitting(pdf, labels.join(' · ') || 'Sin indicadores', M + 65, yy, 110,
        { size: 6.5, color: C.slate });
    });
  }
  for (let offset = onFirstPage; offset < model.competitions.length; offset += 7) {
    const rows = model.competitions.slice(offset, offset + 7);
    sections.push({ name: `Estadísticas colectivas · cobertura${offset ? ` · continuación ${Math.floor(offset / 7) + 1}` : ''}`,
      page: page(pdf, 'Estadísticas colectivas') });
    heading(pdf, 'Cobertura por competición', 'Partidos disputados con un valor válido por indicador.');
    rows.forEach((comp, index) => {
      const yy = 70 + index * 28;
      block(pdf, M, yy - 5, W - 2 * M, 25, index % 2 ? C.paper : C.mist, 2);
      fitting(pdf, comp.name, M + 4, yy + 2, W - 2 * M - 8,
        { size: 8, color: C.navy, bold: true });
      const labels = comp.metrics.filter((metric) => metric.covered).map((metric) =>
        `${metric.label}: ${metric.covered}/${metric.eligible}`);
      wrapped(pdf, labels.join(' · ') || 'Sin indicadores', M + 4, yy + 10, W - 2 * M - 8,
        { size: 6.5, color: C.slate, leading: 4 });
    });
  }
}

function competitionPages(pdf, comp, sections) {
  const color = accent(comp.kind);
  sections.push({ name: comp.name, page: page(pdf, comp.name, color) });
  block(pdf, M, 37, W - 2 * M, 49, C.navy, 4);
  block(pdf, M, 37, 3, 49, color);
  fitting(pdf, comp.name.toUpperCase(), M + 10, 58, W - 2 * M - 20,
    { size: 17, color: C.paper, bold: true });
  ink(pdf, `${comp.verified} ${comp.verified === 1 ? 'PARTIDO ACREDITADO' : 'PARTIDOS ACREDITADOS'}`, M + 10, 74,
    { size: 7.5, color: C.muted, bold: true });
  const t = comp.totals;
  const cw = (W - 2 * M - 12) / 4;
  [[t.played, 'Disputados', color], [t.wins, 'Victorias', C.green],
    [t.draws, 'Empates', C.amber], [t.losses, 'Derrotas', C.red]]
    .forEach(([value, label, c], i) => card(pdf, M + i * (cw + 4), 95, cw, 29, label, value, c));
  ink(pdf, `${t.goalsFor} GF  ·  ${t.goalsAgainst} GC  ·  ${t.goalDifference >= 0 ? '+' : ''}${t.goalDifference} DIF`,
    M, 142, { size: 12, color: C.navy, bold: true });
  ink(pdf, `${percent(t.winRate)} victorias entre los disputados`, M, 154,
    { size: 8, color: C.slate });
  distribution(pdf, t, M, 165, W - 2 * M);
  ink(pdf, 'EVOLUCIÓN DE RESULTADOS', M, 211, { size: 8, color: C.navy, bold: true });
  const played = comp.matches.filter((match) => match.result);
  const shown = played.slice(-26);
  const dotWidth = Math.min(5.5, (W - 2 * M) / Math.max(shown.length, 1));
  shown.forEach((match, i) => {
    const x = M + i * dotWidth;
    block(pdf, x, 223, Math.max(2, dotWidth - 1), 7,
      match.outcome === 'win' ? C.green : match.outcome === 'draw' ? C.amber : C.red, 1);
  });
  ink(pdf, `Últimos ${shown.length} resultados en orden cronológico. La relación completa sigue en las páginas siguientes.`,
    M, 241, { size: 7, color: C.slate });

  const rows = comp.matches;
  if (rows.length === 1) {
    const match = rows[0];
    block(pdf, M, 252, W - 2 * M, 13, C.mist, 2);
    ink(pdf, match.date.slice(5), M + 4, 260, { size: 7, color: C.slate });
    fitting(pdf, match.opponent, M + 30, 260, 105, { size: 7.5, bold: true });
    ink(pdf, match.result ? `${match.result.goalsFor}-${match.result.goalsAgainst}` : 'Pendiente',
      W - M - 4, 260, { size: 8, color: C.navy, bold: true, align: 'right' });
    return;
  }
  for (let offset = 0; offset < rows.length; offset += 21) {
    page(pdf, `${comp.name} · partidos`, color);
    heading(pdf, 'Partidos', `${comp.name} · ${offset + 1}-${Math.min(offset + 21, rows.length)} de ${rows.length}`);
    ink(pdf, 'FECHA', M + 3, 67, { size: 7, color: C.slate, bold: true });
    ink(pdf, 'RIVAL / JORNADA', M + 29, 67, { size: 7, color: C.slate, bold: true });
    ink(pdf, 'COND.', M + 123, 67, { size: 7, color: C.slate, bold: true });
    ink(pdf, 'RESULTADO', W - M - 1, 67,
      { size: 7, color: C.slate, bold: true, align: 'right' });
    rows.slice(offset, offset + 21).forEach((match, i) => {
      const y = 79 + i * 9;
      block(pdf, M, y - 5.5, W - 2 * M, 8.5, i % 2 ? C.paper : C.mist, 1);
      ink(pdf, match.date.slice(5), M + 3, y, { size: 7.5 });
      fitting(pdf, match.opponent, M + 29, y, 87, { size: 7.5, bold: true });
      ink(pdf, match.isHome ? 'Local' : 'Visitante', M + 123, y,
        { size: 7, color: C.slate });
      ink(pdf, match.result ? `${match.result.goalsFor}-${match.result.goalsAgainst}` : 'Pendiente',
        W - M - 1, y, { size: 7.5, align: 'right',
          color: match.result ? C.navy : C.slate, bold: Boolean(match.result) });
    });
  }
}

function finalPage(pdf, model, sections) {
  sections.push({ name: 'Balance estadístico', page: page(pdf, 'Balance estadístico') });
  heading(pdf, 'Balance estadístico', 'Síntesis de los registros acreditados en esta exportación.');
  const t = model.totals;
  card(pdf, M, 66, 55, 34, 'Disputados', t.played, C.blue);
  card(pdf, M + 62, 66, 55, 34, '% victorias', percent(t.winRate), C.green);
  card(pdf, M + 124, 66, 55, 34, 'Diferencia goles',
    `${t.goalDifference >= 0 ? '+' : ''}${t.goalDifference}`, C.amber);
  ink(pdf, 'COMPETICIONES INCLUIDAS', M, 119, { size: 8, color: C.navy, bold: true });
  model.competitions.slice(0, 10).forEach((comp, i) => {
    const y = 130 + i * 10;
    block(pdf, M, y - 4, 3, 5, accent(comp.kind));
    fitting(pdf, comp.name, M + 6, y, 90, { size: 8, bold: true });
    ink(pdf, `${comp.totals.played} PJ · ${comp.totals.wins} V`, W - M, y,
      { size: 7.5, color: C.slate, align: 'right' });
  });
  const coverageNote = `${model.allVerified} partidos del CTS; ${model.excludedTotal} excluidos `
    + `(${model.excluded.unlinked} sin CTS, ${model.excluded.teamContradiction} identidad, `
    + `${model.excluded.invalidDate} fecha, ${model.excluded.competitionConflict} competición, `
    + `${model.excluded.duplicate} duplicados). Un dato ausente no equivale a cero. `
    + (model.selection !== 'season' ? 'Rendimiento físico global sin asignación a competición. '
      : model.physical ? '' : model.performanceUnavailable
        ? 'Rendimiento físico omitido: lectura no verificable. '
        : 'Rendimiento físico omitido: cobertura grupal insuficiente. ')
    + (model.groupAnalysis ? '' : 'Análisis Grupal omitido: contextos de gol sin cobertura completa.');
  wrapped(pdf, coverageNote, M, 239, W - 2 * M,
    { size: 6.7, color: C.slate, leading: 4.5 });
  if (model.individualUnavailable) ink(pdf, 'DATOS INDIVIDUALES NO VERIFICADOS EN ESTA LECTURA',
    M, 230, { size: 7, color: C.amber, bold: true });
}

function indexPage(pdf, sections, model, indexPages) {
  const capacity = 16;
  for (let index = 0; index < indexPages; index++) {
    pdf.setPage(3 + index);
    chrome(pdf, 'Índice');
    heading(pdf, 'Índice', model.selection === 'season'
      ? model.excludedTotal ? 'Informe del CTS con registros excluidos' : 'Memoria completa del CTS seleccionado'
      : `Selección parcial · ${model.competitions[0].name}`);
    let y = 69;
    sections.slice(index * capacity, (index + 1) * capacity).forEach((section) => {
      if (section.matchData) {
        fitting(pdf, `Ficha · ${section.matchData.competition}`,
          M, y - 1.5, 102, { size: 7, color: C.slate, bold: true });
        ink(pdf, section.matchData.date, M + 108, y - 1.5,
          { size: 7, color: C.slate, bold: true });
        fitting(pdf, section.matchData.opponent, M, y + 3.2, 146,
          { size: 7.5, color: C.ink, bold: true });
      } else fitting(pdf, section.name, M, y, 146,
        { size: 8.5, color: C.ink, bold: true });
      ink(pdf, String(section.page).padStart(2, '0'), W - M, y,
        { size: 8.5, color: C.blue, bold: true, align: 'right' });
      pdf.setDrawColor(...C.line);
      pdf.line(M, y + 5, W - M, y + 5);
      pdf.link(M, y - 5, W - 2 * M, 10, { pageNumber: section.page });
      y += 12;
    });
  }
}

export function createRealSeasonMemoryPdf({ model, crestDataUrl, rivalCrests = {}, syntheticQa = false }) {
  if (!model?.context?.id || !model?.matches?.length || !model?.competitions?.length) {
    throw new Error('No hay partidos acreditados para generar el informe.');
  }
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: `Memoria de Temporada · ${model.context.teamName} · ${model.context.seasonLabel}`,
    subject: 'Informe deportivo de partidos acreditados', author: 'NEXO CLUB' });
  cover(pdf, model, crestDataUrl);
  summary(pdf, model);
  const indexPages = Math.max(1, Math.ceil((model.competitions.length + model.matchCards.length + 4
    + statisticsSectionCount(model)
    + individualSectionCount(model.individual) + physicalSectionCount(model.physical)
    + groupSectionCount(model.groupAnalysis, pdf)) / 16));
  for (let i = 0; i < indexPages; i++) page(pdf, 'Índice');
  const sections = [{ name: 'Resumen ejecutivo', page: 2 }, { name: 'Índice', page: 3 }];
  evolution(pdf, model, sections);
  statistics(pdf, model, sections);
  renderIndividualGlobal(pdf, model.individual, sections);
  renderRealPhysical(pdf, model.physical, sections);
  renderRealGroup(pdf, model.groupAnalysis, sections);
  model.competitions.forEach((comp) => {
    competitionPages(pdf, comp, sections);
    renderIndividualCompetition(pdf, comp, model.individual, sections);
    renderRealMatchCards(pdf, comp, model.matchCards, sections, crestDataUrl, rivalCrests);
  });
  finalPage(pdf, model, sections);
  if (sections.length > indexPages * 16) throw new Error('Índice sin espacio suficiente.');
  indexPage(pdf, sections, model, indexPages);
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    if (syntheticQa) {
      if (i === 1) {
        block(pdf, 18, 208, 174, 20, C.amber, 3);
        ink(pdf, 'DATOS FICTICIOS / PRUEBA', W / 2, 221,
          { size: 17, color: C.navy, bold: true, align: 'center' });
      } else {
        block(pdf, 61, 274, 88, 4.5, C.amber, 1);
        ink(pdf, 'DATOS FICTICIOS / PRUEBA', W / 2, 277.4,
          { size: 7, color: C.navy, bold: true, align: 'center' });
      }
    }
    if (i > 1) {
      pdf.setDrawColor(...C.line);
      pdf.line(M, 279, W - M, 279);
      ink(pdf, `${model.context.displayName || model.context.teamName} · ${model.context.seasonLabel}`, M, 287,
        { size: 6.5, color: C.slate });
      ink(pdf, `${String(i).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
        W - M, 287, { size: 6.5, color: C.slate, align: 'right' });
    } else ink(pdf, `01 / ${String(total).padStart(2, '0')}`, W - M, 284,
      { size: 6.5, color: C.muted, align: 'right' });
  }
  return pdf;
}
