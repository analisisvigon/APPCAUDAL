import { PDF_THEME, competitionColor } from './pdfTheme.js';

const { page: P, colors: C } = PDF_THEME;
const M = P.margin;
const W = P.width;
function fill(pdf, x, y, w, h, color, radius = 0) {
  pdf.setFillColor(...color);
  if (radius) pdf.roundedRect(x, y, w, h, radius, radius, 'F');
  else pdf.rect(x, y, w, h, 'F');
}
function text(pdf, value, x, y, size = 8, color = C.ink, bold = false, align = 'left') {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  pdf.text(String(value ?? ''), x, y, { align });
}
function fit(pdf, value, x, y, width, size = 8, color = C.ink, bold = false, align = 'left') {
  const original = String(value ?? '');
  let current = original;
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  while (pdf.getTextWidth(current) > width && current.length > 1) current = `${current.slice(0, -2)}…`;
  text(pdf, current, x, y, size, color, bold, align);
}
function crest(pdf, data, x, y, w, h) {
  if (!data?.startsWith('data:image/png;base64,')) return;
  try {
    const { width, height } = pdf.getImageProperties(data);
    const ratio = Math.min(w / width, h / height);
    pdf.addImage(data, 'PNG', x + (w - width * ratio) / 2, y + (h - height * ratio) / 2,
      width * ratio, height * ratio, undefined, 'FAST');
  } catch { /* Escudo externo incompatible: dejar el área sin imagen. */ }
}
function header(pdf, card, continuation = false) {
  const color = competitionColor(card.match.competition.kind);
  const home = card.match.isHome ? card.context.teamName : card.match.opponent;
  const away = card.match.isHome ? card.match.opponent : card.context.teamName;
  const score = card.match.result ? (card.match.isHome
    ? `${card.match.result.goalsFor}  :  ${card.match.result.goalsAgainst}`
    : `${card.match.result.goalsAgainst}  :  ${card.match.result.goalsFor}`) : '— : —';
  fill(pdf, 0, 0, W, 6, C.navy);
  fill(pdf, 0, 6, W, 1.2, color);
  text(pdf, 'NEXO CLUB  /  MEMORIA DE TEMPORADA', M, 17, 7, C.navy, true);
  fit(pdf, card.match.competition.name.toUpperCase(), W - M, 17, 75, 7, color, true, 'right');
  fill(pdf, M, 27, W - 2 * M, continuation ? 48 : 57, C.navy, 4);
  fill(pdf, M, 27, 3, continuation ? 48 : 57, color);
  fit(pdf, `${card.match.round || 'PARTIDO'}  ·  ${card.match.date}${continuation ? '  ·  CONTINUACIÓN' : ''}`,
    M + 8, 38, W - 2 * M - 16, 7, C.cyan, true);
  fit(pdf, home, M + 36, 57, 36, 10, C.paper, true);
  fit(pdf, away, W - M - 36, 57, 36, 10, C.paper, true, 'right');
  text(pdf, score, W / 2, 59, 19, C.paper, true, 'center');
  text(pdf, card.match.result ? ({ win: 'VICTORIA', draw: 'EMPATE', loss: 'DERROTA' })[card.match.outcome]
    : 'RESULTADO PENDIENTE', W / 2, 72, 7, color, true, 'center');
  return continuation ? 83 : 94;
}
function section(pdf, label, y, color = C.blue) {
  fill(pdf, M, y - 5, 3, 5, color, 1);
  text(pdf, label.toUpperCase(), M + 6, y, 7.5, C.navy, true);
}
function pitch(pdf, card, y) {
  const x = M, w = 105, h = 93;
  fill(pdf, x, y, w, h, C.pitch, 3);
  for (let i = 1; i < 6; i++) fill(pdf, x, y + i * h / 6, w, h / 12, C.pitchAlt);
  pdf.setDrawColor(230, 245, 237);
  pdf.setLineWidth(.35);
  pdf.rect(x + 4, y + 4, w - 8, h - 8);
  pdf.line(x + 4, y + h / 2, x + w - 4, y + h / 2);
  pdf.circle(x + w / 2, y + h / 2, 8);
  card.positions.forEach(({ x: px, y: py, player }) => {
    const cx = x + 7 + px / 100 * (w - 14);
    const cy = y + 5 + py / 100 * (h - 10);
    pdf.setFillColor(...C.paper);
    pdf.circle(cx, cy, 2.6, 'F');
    text(pdf, player.number ?? '•', cx, cy + .9, 5, C.navy, true, 'center');
    fit(pdf, player.name, cx - 10, cy + 5.8, 20, 5.3, C.paper, true);
  });
  text(pdf, `SISTEMA ${card.formation}`, x + 5, y + h - 4, 6, C.paper, true);
}
function lineups(pdf, card, y) {
  section(pdf, 'Alineación inicial', y);
  y += 8;
  const boxHeight = card.positions.length === 11 ? 93 : Math.max(42, 22 + card.lineup.length * 6);
  const contentHeight = Math.max(boxHeight, card.metrics.length ? 93 : boxHeight);
  if (card.positions.length === 11) pitch(pdf, card, y);
  else {
    fill(pdf, M, y, 105, boxHeight, C.mist, 3);
    text(pdf, 'SISTEMA: NO REGISTRADO CON FIABILIDAD', M + 5, y + 10, 6.5, C.slate, true);
    if (!card.lineup.length) text(pdf, 'Sin titulares atribuibles por UUID.', M + 5, y + 24, 8, C.slate);
    else card.lineup.forEach((row, i) => fit(pdf, `${String(row.slot + 1).padStart(2, '0')}  ${row.player.name}`,
      M + 5, y + 21 + i * 5.8, 94, 7, C.ink, i < 2));
  }
  const sideX = M + 112;
  text(pdf, `${card.lineupCoverage}/11 titulares acreditados`, sideX, y + 6, 7, C.slate, true);
  fill(pdf, sideX, y + 16, 3, 5, C.green, 1);
  text(pdf, 'EQUIPO PROPIO', sideX + 6, y + 21, 7.5, C.navy, true);
  if (!card.metrics.length) text(pdf, 'Sin indicadores colectivos.', sideX, y + 32, 7, C.slate);
  card.metrics.slice(0, 6).forEach((metric, i) => {
    fit(pdf, metric.label, sideX, y + 34 + i * 9, 41, 7, C.slate);
    text(pdf, metric.value, W - M, y + 34 + i * 9, 8, C.navy, true, 'right');
  });
  text(pdf, 'Rival: sin estadísticas comparables.', sideX, y + contentHeight - 3, 6.2, C.slate);
  return y + contentHeight + 9;
}
function detailLabel(item) {
  if (item.kind === 'substitution') return `Sale ${item.outgoing} / Entra ${item.incoming}`;
  if (item.kind === 'card') return `${item.card === 'red' ? 'Tarjeta roja' : 'Tarjeta amarilla'}${item.count > 1 ? ` ×${item.count}` : ''} · ${item.player} (minuto no registrado)`;
  if (item.kind === 'incident') return `${item.team === 'rival' ? 'Rival' : 'Equipo propio'} · ${item.type}${item.player ? ` · ${item.player}` : ''}`;
  return `${item.team === 'own' ? 'Gol a favor' : 'Gol del rival'}${item.ownGoal ? ' (propia puerta)' : ''}`
    + `${item.scorer ? ` · ${item.scorer}` : ''}${item.assistant ? ` · Asist. ${item.assistant}` : ''}`;
}
function detailRows(card) {
  const rows = [];
  card.timeline.forEach((item) => rows.push({ kind: 'event', minute: item.minute,
    label: detailLabel(item) }));
  (card.quickTotals || []).forEach((item) => rows.push({ kind: 'quick',
    label: `${item.team === 'own' ? 'Equipo propio' : 'Rival'} · ${item.type} · ${item.count}` }));
  card.stats.filter((row) => row.bench === 1)
    .forEach((row) => rows.push({ kind: 'stat', label: `${row.player} · ${row.minutes === null ? 'min —' : `${row.minutes} min`}`
    + `${row.knownGoals ? ` · ${row.knownGoals} G${row.goals === null ? '+' : ''}` : ''}${row.knownAssists ? ` · ${row.knownAssists} A${row.assists === null ? '+' : ''}` : ''}`
    + `${row.yellow ? ` · ${row.yellow} TA` : ''}${row.red ? ' · TR' : ''}` }));
  card.videos.forEach((item) => rows.push({ kind: 'video', label: `${item.label}${item.minute === null ? '' : ` · ${item.minute}'`}`, url: item.url }));
  card.notes.forEach((item) => rows.push({ kind: 'note', label: item }));
  return rows;
}
function renderDetails(pdf, card, startY) {
  const rows = detailRows(card);
  const expanded = rows.flatMap((row) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.2);
    const lines = pdf.splitTextToSize(row.label,
      row.kind === 'video' ? W - 2 * M - 65 : W - 2 * M - 25);
    const items = [];
    for (let offset = 0; offset < lines.length; offset += 22) {
      items.push({ ...row, parts: lines.slice(offset, offset + 22),
        url: offset === 0 ? row.url : null });
    }
    return items;
  });
  let y = startY;
  let lastKind = '';
  let overflow = 0;
  if (!rows.length) text(pdf, 'Sin más datos de partido registrados.', M, y + 8, 8, C.slate);
  expanded.forEach((row) => {
    const parts = row.parts;
    const rowHeight = Math.max(7, parts.length * 4.2 + 2.5);
    const height = rowHeight + (row.kind !== lastKind ? 7 : 0);
    if (y + height > 268) {
      pdf.addPage();
      overflow++;
      y = header(pdf, card, true);
      lastKind = '';
    }
    if (row.kind !== lastKind) {
      const label = { event: 'Cronología destacada', quick: 'Acciones frecuentes · totales',
        stat: 'Participación individual', video: 'Vídeos y acciones destacadas',
        note: 'Observaciones registradas' }[row.kind];
      section(pdf, label, y + 5, row.kind === 'video' ? C.violet : C.blue);
      y += 7;
    }
    fill(pdf, M, y + .4, W - 2 * M, Math.max(6.8, parts.length * 4.2 + 2), C.mist, 1);
    if (row.kind === 'event') text(pdf, row.minute === null ? '—' : `${row.minute}'`, M + 3, y + 6.2,
      7.2, C.blue, true);
    else if (row.kind === 'video') {
      pdf.setFillColor(...C.violet);
      pdf.triangle(M + 3, y + 2.1, M + 3, y + 6.1, M + 6.8, y + 4.1, 'F');
    } else text(pdf, '•', M + 3, y + 6.2, 7.2, C.blue, true);
    parts.forEach((part, i) => text(pdf, part, M + 16, y + 6.2 + i * 4.2, 7.2, C.ink));
    if (row.url) {
      fill(pdf, W - M - 35, y + .4, 34, 6.8, C.violet, 1);
      text(pdf, 'Ver vídeo', W - M - 4, y + 6.1, 7, C.paper, true, 'right');
      pdf.link(W - M - 35, y + .4, 34, 6.8, { url: row.url });
    }
    y += rowHeight;
    lastKind = row.kind;
  });
  return overflow;
}
export function renderRealMatchCards(pdf, competition, cards, sections, crestDataUrl, rivalCrests = {}) {
  const selected = cards.filter((card) => card.match.competition.id === competition.id);
  selected.forEach((card) => {
    pdf.addPage();
    sections.push({ name: `Ficha · ${card.match.opponent} · ${card.match.date}`, page: pdf.getNumberOfPages() });
    header(pdf, card);
    crest(pdf, crestDataUrl, card.match.isHome ? M + 7 : W - M - 32, 40, 24, 25);
    crest(pdf, rivalCrests[card.opponentCrest], card.match.isHome ? W - M - 32 : M + 7, 40, 24, 25);
    const y = lineups(pdf, card, 101);
    renderDetails(pdf, card, y);
  });
}
