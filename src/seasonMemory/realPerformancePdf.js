import { PDF_THEME } from './pdfTheme.js';

const { page: P, colors: C } = PDF_THEME;
const M = P.margin;
const W = P.width;
const fill = (pdf, x, y, w, h, color, radius = 0) => {
  pdf.setFillColor(...color);
  if (radius) pdf.roundedRect(x, y, w, h, radius, radius, 'F');
  else pdf.rect(x, y, w, h, 'F');
};
const text = (pdf, value, x, y, size = 8, color = C.ink, bold = false, align = 'left') => {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  pdf.text(String(value), x, y, { align });
};
const fit = (pdf, value, x, y, width, size = 8, color = C.ink, bold = false) => {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  let shown = String(value);
  while (pdf.getTextWidth(shown) > width && shown.length > 1) shown = `${shown.slice(0, -2)}…`;
  text(pdf, shown, x, y, size, color, bold);
};
function page(pdf, section, title, subtitle, color = C.blue) {
  pdf.addPage();
  fill(pdf, 0, 0, W, 5, C.navy);
  fill(pdf, 0, 5, W, 1, color);
  text(pdf, 'NEXO CLUB', M, 17, 8, C.navy, true);
  text(pdf, section.toUpperCase(), W - M, 17, 7, C.slate, false, 'right');
  pdf.setDrawColor(...C.line);
  pdf.line(M, 22, W - M, 22);
  fit(pdf, title, M, 42, W - 2 * M, 20, C.navy, true);
  fit(pdf, subtitle, M, 52, W - 2 * M, 8, C.slate);
  return pdf.getNumberOfPages();
}
function kpi(pdf, x, y, width, label, value, detail, color) {
  fill(pdf, x, y, width, 37, C.mist, 3);
  fill(pdf, x, y, width, 2, color);
  fit(pdf, label.toUpperCase(), x + 5, y + 10, width - 10, 7, C.slate, true);
  text(pdf, value, x + 5, y + 24, 17, C.navy, true);
  fit(pdf, detail, x + 5, y + 33, width - 10, 6.5, C.slate);
}
function chart(pdf, title, rows, key, y, color) {
  text(pdf, title.toUpperCase(), M, y, 8, C.navy, true);
  text(pdf, 'Media mensual · meses sin cobertura omitidos', W - M, y, 6.5, C.slate, false, 'right');
  const x = M + 4;
  const top = y + 11;
  const h = 45;
  pdf.setDrawColor(...C.line);
  pdf.line(x, top + h, W - M, top + h);
  const shown = rows.slice(-12);
  const step = (W - 2 * M - 8) / Math.max(1, shown.length);
  shown.forEach((row, index) => {
    const metric = row[key];
    const cx = x + step * index + step / 2;
    if (metric) {
      const bar = Math.max(1.2, metric.value / 10 * h);
      fill(pdf, cx - Math.min(5, step / 3), top + h - bar,
        Math.min(10, step * .65), bar, color, 1);
      text(pdf, metric.value.toFixed(1), cx, top + h - bar - 3, 6.5, C.ink, true, 'center');
      text(pdf, `${metric.responses} resp.`, cx, top + h + 11, 6, C.slate, false, 'center');
    }
    text(pdf, `${row.period.slice(5)}/${row.period.slice(2, 4)}`, cx,
      top + h + 5, 6.3, C.slate, false, 'center');
  });
  return top + h + 25;
}

export function physicalSectionCount(physical) {
  return physical ? 1 + Number(physical.monthly.length > 1) : 0;
}

export function renderRealPhysical(pdf, physical, sections) {
  if (!physical) return;
  sections.push({ name: 'Rendimiento físico', page: page(pdf, 'Rendimiento físico',
    'Rendimiento físico · resumen', physical.period, C.violet) });
  let x = M;
  const cards = [];
  if (physical.rpe) cards.push(['RPE grupal', physical.rpe.value.toFixed(1),
    `${physical.rpe.responses} respuestas · ${physical.rpe.people} jugadores`, C.violet]);
  const well = physical.wellness.find((item) => item.key === 'health_ratio');
  if (well) cards.push(['Bienestar grupal', well.value.toFixed(1),
    `${well.responses} respuestas · ${well.people} jugadores`, C.green]);
  const width = cards.length === 1 ? 90 : 87;
  cards.forEach(([label, value, detail, color]) => {
    kpi(pdf, x, 66, width, label, value, detail, color);
    x += width + 5;
  });
  let y = 120;
  if (physical.rpe) {
    text(pdf, 'DISTRIBUCIÓN RPE · RESPUESTAS VÁLIDAS', M, y, 8, C.navy, true);
    y += 9;
    ['1–3', '4–6', '7–10'].forEach((label, i) => {
      const count = physical.rpe.distribution[i];
      const color = [C.green, C.blue, C.violet][i];
      text(pdf, label, M + i * 59, y + 5, 7, C.slate, true);
      fill(pdf, M + i * 59, y + 9, 43, 4, C.mist, 1);
      if (count) fill(pdf, M + i * 59, y + 9,
        43 * count / physical.rpe.responses, 4, color, 1);
      text(pdf, count, M + i * 59, y + 21, 9, C.navy, true);
    });
    y += 30;
  }
  if (physical.wellness.length) {
    text(pdf, 'INDICADORES DE WELLNESS', M, y, 8, C.navy, true);
    y += 11;
    physical.wellness.forEach((item, i) => {
      const yy = y + i * 9.5;
      fill(pdf, M, yy - 6, W - 2 * M, 9, i % 2 ? C.paper : C.mist, 1);
      fit(pdf, item.label, M + 4, yy, 65, 7.5, C.ink, true);
      text(pdf, `${item.value.toFixed(1)} ${item.unit}`, M + 91, yy, 7.5, C.navy, true);
      text(pdf, `${item.responses} respuestas · ${item.people} jugadores`, W - M - 4, yy,
        6.7, C.slate, false, 'right');
    });
    y += physical.wellness.length * 9.5 + 5;
  }
  physical.limitations.forEach((line, i) => {
    if (y + i * 7 < 270) fit(pdf, line, M, y + i * 7, W - 2 * M, 6.8, C.slate);
  });
  if (physical.monthly.length > 1) {
    sections.push({ name: 'Rendimiento físico · evolución', page: page(pdf, 'Rendimiento físico',
      'Evolución de respuestas', physical.period, C.violet) });
    let next = 66;
    if (physical.monthly.some((row) => row.rpe)) next = chart(pdf, 'RPE · escala 1–10',
      physical.monthly, 'rpe', next, C.violet);
    if (physical.monthly.some((row) => row.wellness)) chart(pdf, 'Bienestar · escala 0–10',
      physical.monthly, 'wellness', next + 8, C.green);
  }
}

export function renderRealGroup(pdf, group, sections) {
  if (!group) return;
  sections.push({ name: 'Análisis Grupal · contextos de gol', page: page(pdf, 'Análisis Grupal',
    'Cómo llegaron los goles', 'Solo eventos que cuadran con el marcador del partido.', C.amber) });
  kpi(pdf, M, 67, 55, 'Goles a favor', group.coverage.forGoals,
    'Con evento completo', C.green);
  kpi(pdf, M + 62, 67, 55, 'Goles en contra', group.coverage.againstGoals,
    'Con evento completo', C.red);
  kpi(pdf, M + 124, 67, 55, 'Contexto registrado', group.coverage.withContext,
    `de ${group.coverage.total} goles`, C.amber);
  text(pdf, 'DISTRIBUCIÓN POR CONTEXTO', M, 122, 8, C.navy, true);
  text(pdf, 'A FAVOR', M + 115, 122, 7, C.green, true);
  text(pdf, 'EN CONTRA', M + 149, 122, 7, C.red, true);
  group.rows.forEach((row, i) => {
    const y = 137 + i * 18;
    fill(pdf, M, y - 7, W - 2 * M, 15, i % 2 ? C.paper : C.mist, 2);
    fit(pdf, row.context, M + 5, y + 2, 88, 8, C.ink, true);
    text(pdf, row.forCount, M + 122, y + 2, 10, C.green, true);
    text(pdf, row.againstCount, M + 156, y + 2, 10, C.red, true);
  });
  if (group.setPieces.total) {
    const details = group.setPieces.subtypeRows.filter((row) => row.count)
      .map((row) => `${row.label}: ${row.count}`).join(' · ');
    fit(pdf, `ABP registradas · ${details}`, M, 235, W - 2 * M, 7, C.navy, true);
  }
  text(pdf, `Cobertura: ${group.completeMatches}/${group.verifiedMatches} partidos con goles y eventos concordantes.`,
    M, 251, 7, C.slate);
  text(pdf, 'Sin clasificar = evento sin contexto registrado. No representa una táctica inferida.',
    M, 259, 7, C.slate);
}
