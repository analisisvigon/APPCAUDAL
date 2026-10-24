import { PDF_THEME, competitionColor } from './pdfTheme.js';
import { rankIndividuals } from './realIndividualModel.js';

const { page: P, colors: C } = PDF_THEME;
const M = P.margin;
const W = P.width;
const line = (pdf, x1, y1, x2, y2) => { pdf.setDrawColor(...C.line); pdf.line(x1, y1, x2, y2); };
const fill = (pdf, x, y, w, h, color, r = 0) => {
  pdf.setFillColor(...color);
  if (r) pdf.roundedRect(x, y, w, h, r, r, 'F');
  else pdf.rect(x, y, w, h, 'F');
};
const txt = (pdf, value, x, y, size = 8, color = C.ink, bold = false, align = 'left') => {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  pdf.text(String(value ?? ''), x, y, { align });
};
const fit = (pdf, value, x, y, width, size = 8, color = C.ink, bold = false) => {
  let s = size;
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  while (s > 5.5) {
    pdf.setFontSize(s);
    if (pdf.getTextWidth(String(value ?? '')) <= width) break;
    s -= 0.3;
  }
  const rendered = String(value ?? '');
  txt(pdf, pdf.getTextWidth(rendered) <= width ? rendered : `${rendered.slice(0, 24)}…`, x, y, s, color, bold);
};
function newPage(pdf, label, color = C.blue) {
  pdf.addPage();
  fill(pdf, 0, 0, W, 5, C.navy);
  fill(pdf, 0, 5, W, 1, color);
  txt(pdf, 'NEXO CLUB', M, 17, 8, C.navy, true);
  txt(pdf, label.toUpperCase(), W - M, 17, 7, C.slate, false, 'right');
  line(pdf, M, 22, W - M, 22);
  return pdf.getNumberOfPages();
}
function title(pdf, value, sub) {
  fit(pdf, value, M, 42, W - 2 * M, 21, C.navy, true);
  if (sub) fit(pdf, sub, M, 51, W - 2 * M, 8, C.slate);
}
function metricText(metric) {
  if (metric.value !== null) return metric.value.toLocaleString('es-ES');
  return metric.known > 0 ? `${metric.known.toLocaleString('es-ES')}+` : '—';
}
function card(pdf, x, y, width, label, value, color = C.blue) {
  fill(pdf, x, y, width, 32, C.mist, 3);
  fill(pdf, x, y, width, 1.6, color);
  fit(pdf, label.toUpperCase(), x + 4, y + 9, width - 8, 6.5, C.slate, true);
  fit(pdf, value, x + 4, y + 25, width - 8, 17, C.navy, true);
}
function bars(pdf, rows, field, x, y, width, color, limit = 5) {
  const ranked = rankIndividuals(rows, field, limit);
  const top = ranked[0]?.[field].value || 0;
  ranked.forEach((row, i) => {
    const yy = y + i * 15;
    fit(pdf, `${row.number === null || row.number === undefined ? '' : `#${row.number}  `}${row.name}`,
      x, yy, width * .54, 8, C.ink, true);
    txt(pdf, row[field].value, x + width, yy, 8, C.navy, true, 'right');
    fill(pdf, x, yy + 3, width, 2.7, C.mist, 1);
    fill(pdf, x, yy + 3, width * row[field].value / top, 2.7, color, 1);
  });
  return ranked.length;
}
function ranking(pdf, rows, sections, sectionName, color = C.blue) {
  const kinds = [['goals', 'Máximos goleadores', C.green],
    ['assists', 'Máximos asistentes', C.blue], ['minutes', 'Más minutos', C.amber]];
  const available = kinds.filter(([key]) => rankIndividuals(rows, key, 1).length);
  if (!available.length) return;
  sections.push({ name: sectionName, page: newPage(pdf, sectionName, color) });
  title(pdf, sectionName, 'Clasificaciones solo con valores completos y acreditados.');
  let y = 68;
  available.forEach(([key, label, metricColor]) => {
    txt(pdf, label.toUpperCase(), M, y, 9, C.navy, true);
    const count = bars(pdf, rows, key, M, y + 9, W - 2 * M, metricColor, 3);
    y += 18 + count * 15;
  });
}
const HEADERS = [
  ['#', 2], ['JUGADOR', 12], ['POS.', 57], ['PJ', 82], ['T', 94], ['S', 105],
  ['MIN', 118], ['G', 138], ['A', 147], ['TA', 156], ['TR', 169],
];
function rosterTable(pdf, rows, sections, name, subtitle, color = C.blue) {
  if (!rows.length) return;
  for (let offset = 0; offset < rows.length; offset += 21) {
    const number = newPage(pdf, name, color);
    if (offset === 0) sections.push({ name, page: number });
    title(pdf, name, `${subtitle} · ${offset + 1}–${Math.min(offset + 21, rows.length)} de ${rows.length}`);
    fill(pdf, M, 62, W - 2 * M, 10, C.navy, 2);
    HEADERS.forEach(([label, dx]) => txt(pdf, label, M + dx, 69, 6.3, C.paper, true));
    rows.slice(offset, offset + 21).forEach((row, i) => {
      const y = 81 + i * 8.6;
      fill(pdf, M, y - 6, W - 2 * M, 8, i % 2 ? C.paper : C.mist, 1);
      txt(pdf, row.number ?? '—', M + 2, y, 6.5);
      fit(pdf, `${row.name}${row.retired ? ' *' : ''}`, M + 12, y, 42, 7.2, C.ink, true);
      fit(pdf, row.position || '—', M + 57, y, 22, 6.5, C.slate);
      [[row.played, 82], [metricText(row.starts), 94], [metricText(row.bench), 105], [metricText(row.minutes), 118],
        [metricText(row.goals), 138], [metricText(row.assists), 147],
        [metricText(row.yellow), 156], [metricText(row.red), 169]]
        .forEach(([value, dx]) => txt(pdf, value, M + dx, y, 6.9, C.ink));
    });
    txt(pdf, 'T Titular · S Participó desde el banquillo', M, 262, 6.2, C.slate);
    txt(pdf, '* Baja en plantilla.  — Sin dato completo.  1+ Mínimo acreditado.',
      M, 270, 6.2, C.slate);
  }
}
function evolution(pdf, rows, sections) {
  const candidates = rows.map((row) => ({ ...row,
    points: row.contributions.filter((item) => item.minutes !== null)
      .sort((a, b) => a.date.localeCompare(b.date) || a.matchId.localeCompare(b.matchId)) }))
    .filter((row) => row.points.length >= 3).slice(0, 4);
  if (!candidates.length) return;
  sections.push({ name: 'Evolución individual', page: newPage(pdf, 'Evolución individual') });
  title(pdf, 'Evolución individual', 'Minutos registrados o derivados de sustituciones con minuto válido.');
  candidates.forEach((row, index) => {
    const chartHeight = candidates.length === 1 ? 62 : candidates.length === 2 ? 42 : 25;
    const y = 72 + index * (chartHeight + 22);
    fit(pdf, row.name, M, y, 100, 9, C.navy, true);
    txt(pdf, `${row.points.length} partidos con minutos`, W - M, y, 7, C.slate, false, 'right');
    line(pdf, M, y + chartHeight + 7, W - M, y + chartHeight + 7);
    const shown = row.points.slice(-16);
    const step = (W - 2 * M) / shown.length;
    shown.forEach((point, i) => {
      const height = Math.min(chartHeight, point.minutes / 120 * chartHeight);
      fill(pdf, M + i * step + 2, y + chartHeight + 6 - height, Math.max(2, step - 4), height,
        [C.blue, C.green, C.amber, C.violet][index], 1);
      if (shown.length <= 8) txt(pdf, point.date.slice(5), M + i * step + step / 2,
        y + chartHeight + 14, 5.6, C.slate, false, 'center');
    });
  });
}

export function individualSectionCount(individual) {
  if (!individual?.rows?.length) return 0;
  const rankable = ['goals', 'assists', 'minutes'].some((key) => rankIndividuals(individual.rows, key, 1).length);
  const hasEvolution = individual.rows.some((row) => row.contributions.filter((item) => item.minutes !== null).length >= 3);
  return 2 + Number(rankable) + Number(hasEvolution)
    + individual.byCompetition.filter((comp) => comp.rows.length).length
    + individual.byCompetition.filter((comp) => comp.rows.length >= 3
      && new Set(comp.rows.flatMap((row) => row.contributions.map((item) => item.matchId))).size >= 2
      && ['goals', 'assists', 'minutes'].some((key) => rankIndividuals(comp.rows, key, 1).length)).length;
}

export function renderIndividualGlobal(pdf, individual, sections) {
  if (!individual?.rows?.length) return;
  sections.push({ name: 'La plantilla en cifras', page: newPage(pdf, 'La plantilla en cifras') });
  title(pdf, 'La plantilla en cifras', 'Participación individual verificada por UUID en partidos disputados.');
  fill(pdf, M, 63, W - 2 * M, 47, C.navy, 4);
  txt(pdf, 'JUGADORES CON PARTICIPACIÓN', M + 8, 76, 7, C.cyan, true);
  txt(pdf, individual.totals.players, M + 8, 99, 30, C.paper, true);
  txt(pdf, `AL MENOS ${individual.totals.starts} TITULARIDADES`, M + 80, 86, 10, C.paper, true);
  txt(pdf, `${individual.playedMatches} PARTIDOS DISPUTADOS`, M + 80, 99, 7, C.muted, true);
  const width = (W - 2 * M - 8) / 3;
  card(pdf, M, 120, width, 'Minutos acreditados', individual.totals.minutes.toLocaleString('es-ES'), C.blue);
  card(pdf, M + width + 4, 120, width, 'Goles atribuidos', individual.totals.attributedGoals, C.green);
  card(pdf, M + 2 * (width + 4), 120, width, 'Asistencias atribuidas', individual.totals.attributedAssists, C.amber);
  txt(pdf, 'DISTRIBUCIÓN DE MINUTOS ACREDITADOS', M, 169, 8, C.navy, true);
  const counted = bars(pdf, individual.rows.filter((row) => row.minutes.known > 0)
    .map((row) => ({ ...row, minutes: { value: row.minutes.known } })),
  'minutes', M, 181, W - 2 * M, C.blue);
  if (!counted) txt(pdf, 'No hay minutos individuales verificables.', M, 190, 8, C.slate);
  const c = individual.coverage;
  txt(pdf, `Cobertura: ${c.unattributedStats} stats sin UUID · ${c.conflictingStats} duplicadas · ${c.minuteConflicts} min. discrepantes`,
    M, 261, 6.4, C.slate);
  txt(pdf, `${c.incompleteGoalMatches} partidos con goles sin registro completo · ${c.unattributedGoals} contribuciones sin UUID`,
    M, 269, 6.4, C.slate);
  ranking(pdf, individual.rows, sections, 'Rankings de plantilla');
  rosterTable(pdf, individual.rows, sections, 'Plantilla completa',
    'Todas las competiciones incluidas');
  evolution(pdf, individual.rows, sections);
}

export function renderIndividualCompetition(pdf, competition, individual, sections) {
  const group = individual?.byCompetition?.find((item) => item.id === competition.id);
  if (!group?.rows.length) return;
  const color = competitionColor(competition.kind);
  if (group.rows.length >= 3
    && new Set(group.rows.flatMap((row) => row.contributions.map((item) => item.matchId))).size >= 2) {
    ranking(pdf, group.rows, sections, `Rankings · ${competition.name}`, color);
  }
  rosterTable(pdf, group.rows, sections, `Plantilla · ${competition.name}`,
    `${group.rows.length} jugadores con participación`, color);
}
