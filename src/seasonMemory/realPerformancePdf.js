import { PDF_THEME } from './pdfTheme.js';
import { FIELD_ZONES, GOAL_ZONES } from './realGroupDetails.js';

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

const zoneLabel = (key) => key.replaceAll('_', ' ').replace(/^finalizacion/, 'Finaliz.').replace(/^creacion/, 'Creación');
function zoneGrid(pdf, title, area, catalog, x, y, color) {
  text(pdf, title, x, y, 8, C.navy, true);
  text(pdf, `${area.withZone}/${area.total} goles con zona`, x, y + 8, 6.5, C.slate);
  if (!area.withZone) {
    fill(pdf, x, y + 16, 79, 60, C.mist, 2);
    text(pdf, 'Sin zonas registradas', x + 7, y + 47, 7, C.slate);
    return;
  }
  const cellW = 25, cellH = 18;
  const max = Math.max(1, ...Object.values(area.counts));
  catalog.forEach((key, i) => {
    const cx = x + (i % 3) * (cellW + 2), cy = y + 13 + Math.floor(i / 3) * (cellH + 2);
    fill(pdf, cx, cy, cellW, cellH, C.mist, 2);
    const count = area.counts[key] || 0;
    if (count) fill(pdf, cx, cy, Math.max(2, count / max * cellW), 2, color, 1);
    text(pdf, count, cx + cellW / 2, cy + 8, 9, C.navy, true, 'center');
    fit(pdf, zoneLabel(key).split(' ').slice(-1)[0], cx + 2, cy + 14, cellW - 4, 5.6, C.slate);
  });
}
function setPiecePages(pdf, pieces) {
  if (!pieces.some((piece) => piece.total)) return [];
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.4);
  const pages = [[]];
  let y = 70;
  const nextPage = () => { pages.push([]); y = 70; };
  for (const piece of pieces) {
    const side = piece.side === 'for' ? 'A favor' : 'En contra';
    const heading = (continued = false) => {
      if (y + 14 > 260) nextPage();
      pages.at(-1).push({ kind: 'heading', side, total: piece.total, continued, y });
      y += 14;
    };
    heading();
    const rows = piece.rows.length ? piece.rows : [{ label: 'Sin goles ABP registrados', count: 0 }];
    for (const row of rows) {
      const lines = pdf.splitTextToSize(String(row.label), W - 2 * M - 44);
      for (let offset = 0; offset < lines.length; offset += 32) {
        const part = lines.slice(offset, offset + 32);
        const height = Math.max(10, 5 + part.length * 4.2);
        if (y + height > 260) { nextPage(); heading(true); }
        pages.at(-1).push({ kind: 'row', lines: part, count: offset ? null : row.count, y, height });
        y += height;
      }
    }
    y += 6;
  }
  return pages;
}

export function groupSectionCount(group, pdf) {
  if (!group) return 0;
  const d = group.details;
  const field = d.assist.for.withZone || d.assist.against.withZone
    || d.finish.for.withZone || d.finish.against.withZone;
  const mouth = d.mouth.for.withZone || d.mouth.against.withZone;
  return 1 + setPiecePages(pdf, d.setPieces).length + Number(Boolean(field))
    + Number(Boolean(mouth))
    + Math.ceil(Math.max(0, d.systems.length - (mouth ? 7 : 0)) / 15);
}
export function renderRealGroup(pdf, group, sections) {
  if (!group) return;
  const d = group.details;
  sections.push({ name: 'Análisis Grupal · goles y tramos', page: page(pdf, 'Análisis Grupal',
    'Goles y momentos', 'Eventos oficiales concordantes con el marcador.', C.amber) });
  kpi(pdf, M, 63, 55, 'Goles a favor', group.coverage.forGoals,
    'Eventos acreditados', C.green);
  kpi(pdf, M + 62, 63, 55, 'Goles en contra', group.coverage.againstGoals,
    'Eventos acreditados', C.red);
  kpi(pdf, M + 124, 63, 55, 'Contexto conocido', group.coverage.withContext,
    `de ${group.coverage.total} goles`, C.amber);
  text(pdf, 'CONTEXTOS DE GOL', M, 113, 8, C.navy, true);
  text(pdf, 'A FAVOR', M + 126, 113, 6.5, C.green, true);
  text(pdf, 'EN CONTRA', M + 158, 113, 6.5, C.red, true);
  group.rows.forEach((row, i) => {
    const y = 122 + i * 10;
    fill(pdf, M, y - 6, W - 2 * M, 9, i % 2 ? C.paper : C.mist, 1);
    fit(pdf, row.context, M + 4, y, 91, 7, C.ink, true);
    text(pdf, row.forCount, M + 126, y, 8, C.green, true);
    text(pdf, row.againstCount, M + 158, y, 8, C.red, true);
  });
  if (d.withMinute) {
    text(pdf, 'GOLES POR TRAMOS', M, 182, 8, C.navy, true);
    text(pdf, `Minuto acreditado: ${d.withMinute}/${group.coverage.total}`, W - M, 182,
      6.5, C.slate, false, 'right');
    const max = Math.max(1, ...d.intervals.flatMap((row) => [row.forCount, row.againstCount]));
    const knownFor = d.intervals.reduce((sum, row) => sum + row.forCount, 0);
    const knownAgainst = d.intervals.reduce((sum, row) => sum + row.againstCount, 0);
    d.intervals.forEach((row, i) => {
      const x = M + i * 30;
      text(pdf, row.range, x, 194, 6.5, C.slate, true);
      fill(pdf, x, 199, 24, 3, C.mist, 1);
      if (row.forCount) fill(pdf, x, 199, 24 * row.forCount / max, 3, C.green, 1);
      fill(pdf, x, 205, 24, 3, C.mist, 1);
      if (row.againstCount) fill(pdf, x, 205, 24 * row.againstCount / max, 3, C.red, 1);
      text(pdf, `${row.forCount} / ${row.againstCount}`, x, 218, 7, C.navy, true);
      text(pdf, `${knownFor ? Math.round(row.forCount / knownFor * 100) : '—'}% / ${knownAgainst ? Math.round(row.againstCount / knownAgainst * 100) : '—'}%`,
        x, 225, 5.8, C.slate);
    });
    text(pdf, 'Verde: a favor · Rojo: en contra · % sobre goles de cada lado con minuto registrado.',
      M, 233, 6.4, C.slate);
  }
  if (d.trends.length) {
    text(pdf, 'TRAMOS CON MÁS GOLES REGISTRADOS', M, 244, 8, C.navy, true);
    ['for', 'against'].forEach((side, i) => {
      const top = d.trends.filter((row) => row.side === side);
      if (top.length) fit(pdf, `${side === 'for' ? 'A favor' : 'En contra'}: ${top.map((row) => row.range).join(', ')} (${top[0].count} goles por tramo)`,
        M, 253 + i * 8, W - 2 * M, 7, i ? C.red : C.green);
    });
  }
  fit(pdf, `Cobertura: ${group.completeMatches}/${group.verifiedMatches} partidos con goles concordantes. Sin contexto = dato ausente.`,
    M, 271, W - 2 * M, 6.5, C.slate);

  setPiecePages(pdf, d.setPieces).forEach((entries, index) => {
    sections.push({ name: `Análisis Grupal · ABP${index ? ` · continuación ${index + 1}` : ''}`,
      page: page(pdf, 'Análisis Grupal', 'ABP ofensiva y defensiva',
        'Subtipos acreditados en goles concordantes con el marcador.', C.amber) });
    entries.forEach((entry) => {
      if (entry.kind === 'heading') {
        fill(pdf, M, entry.y - 5, W - 2 * M, 9, C.mist, 2);
        text(pdf, `${entry.side.toUpperCase()} · ${entry.total} GOLES ABP${entry.continued ? ' · CONTINUACIÓN' : ''}`,
          M + 4, entry.y + 1, 8, entry.side === 'A favor' ? C.green : C.red, true);
      } else {
        entry.lines.forEach((line, lineIndex) => text(pdf, line, M + 6,
          entry.y + 5 + lineIndex * 4.2, 7.4, C.ink));
        if (entry.count !== null) text(pdf, entry.count, W - M - 5, entry.y + 5,
          8, C.navy, true, 'right');
        pdf.setDrawColor(...C.line);
        pdf.line(M, entry.y + entry.height, W - M, entry.y + entry.height);
      }
    });
  });

  const field = d.assist.for.withZone || d.assist.against.withZone
    || d.finish.for.withZone || d.finish.against.withZone;
  if (field) {
    sections.push({ name: 'Análisis Grupal · zonas de gol', page: page(pdf, 'Análisis Grupal',
      'Dónde se crearon y finalizaron', 'Zonas registradas en el evento, sin inferir posiciones.', C.green) });
    zoneGrid(pdf, 'Origen · asistencias propias', d.assist.for, FIELD_ZONES, M, 67, C.green);
    zoneGrid(pdf, 'Origen · goles rivales', d.assist.against, FIELD_ZONES, M + 95, 67, C.red);
    zoneGrid(pdf, 'Finalización · a favor', d.finish.for, FIELD_ZONES, M, 154, C.green);
    zoneGrid(pdf, 'Finalización · en contra', d.finish.against, FIELD_ZONES, M + 95, 154, C.red);
    text(pdf, 'Filas: finalización, creación e inicio; columnas: izquierda, centro y derecha.',
      M, 251, 6.5, C.slate);
    text(pdf, 'Un espacio sin registro no representa cero acciones en esa zona.', M, 260, 6.5, C.slate);
  }
  if (d.mouth.for.withZone || d.mouth.against.withZone) {
    sections.push({ name: 'Análisis Grupal · portería y sistemas', page: page(pdf, 'Análisis Grupal',
      'Portería y sistemas', 'Solo zonas y formaciones acreditadas.', C.violet) });
    zoneGrid(pdf, 'Portería 3×3 · a favor', d.mouth.for, GOAL_ZONES, M, 68, C.green);
    zoneGrid(pdf, 'Portería 3×3 · en contra', d.mouth.against, GOAL_ZONES, M + 95, 68, C.red);
    if (d.systems.length) {
      text(pdf, 'SISTEMAS CONFIRMADOS', M, 162, 8, C.navy, true);
      d.systems.slice(0, 7).forEach((row, i) => {
        const y = 173 + i * 11;
        fill(pdf, M, y - 6, W - 2 * M, 9, i % 2 ? C.paper : C.mist, 1);
        fit(pdf, row.system, M + 4, y, 70, 8, C.navy, true);
        text(pdf, `${row.played} PJ  ·  ${row.wins} V  ${row.draws} E  ${row.losses} D`,
          M + 89, y, 7.2, C.ink);
      });
      text(pdf, `${d.systemCoverage.verified}/${d.systemCoverage.eligible} partidos disputados con sistema y once acreditados.`,
        M, 263, 6.5, C.slate);
    }
  }
  const firstSystemPage = d.mouth.for.withZone || d.mouth.against.withZone ? 7 : 0;
  for (let offset = firstSystemPage; offset < d.systems.length; offset += 15) {
    const rows = d.systems.slice(offset, offset + 15);
    sections.push({ name: `Análisis Grupal · sistemas${offset ? ` · continuación ${offset / 15 + 1}` : ''}`,
      page: page(pdf, 'Análisis Grupal', 'Sistemas acreditados',
        `${offset + 1}–${offset + rows.length} de ${d.systems.length} formaciones distintas.`, C.violet) });
    rows.forEach((row, i) => {
      const y = 79 + i * 11;
      fill(pdf, M, y - 6, W - 2 * M, 9, i % 2 ? C.paper : C.mist, 1);
      fit(pdf, row.system, M + 4, y, 70, 8, C.navy, true);
      text(pdf, `${row.played} PJ  ·  ${row.wins} V  ${row.draws} E  ${row.losses} D`,
        M + 89, y, 7.2, C.ink);
    });
    text(pdf, `${d.systemCoverage.verified}/${d.systemCoverage.eligible} partidos disputados con sistema y once acreditados.`,
      M, 263, 6.5, C.slate);
  }
}
