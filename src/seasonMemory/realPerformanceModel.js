import { getValidRpeValue, summarizeRpeEntries } from '../utils/performanceRpe.js';
import { buildGroupGoalCoverage, buildGroupGoalTypeRows,
  buildGroupSetPieceSummary } from '../utils/groupAnalysisStats.js';

// La interfaz original no define anonimización para exportaciones. Exigir al
// menos cinco personas distintas por indicador y periodo evita publicar medias
// de grupos pequeños. No se incluyen filas individuales ni textos libres.
export const MIN_PRIVATE_GROUP = 5;
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : null;
const number = (value, min, max) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const average = (rows) => rows.length ? rows.reduce((sum, row) => sum + row.value, 0) / rows.length : null;
const distinctPeople = (rows) => new Set(rows.map((row) => row.jugador_id)).size;
const group = (rows) => distinctPeople(rows) >= MIN_PRIVATE_GROUP
  ? { value: average(rows), responses: rows.length, people: distinctPeople(rows) } : null;
const month = (value) => value.slice(0, 7);
const dedupe = (rows, key) => {
  const ids = new Set();
  const keys = new Map();
  const conflicts = new Set();
  for (const row of rows || []) {
    if (!row?.id || ids.has(row.id)) continue;
    ids.add(row.id);
    const k = key(row);
    if (!k) continue;
    if (keys.has(k)) { keys.set(k, null); conflicts.add(k); } // Omitir duplicados ambiguos.
    else if (conflicts.has(k)) continue;
    else keys.set(k, row);
  }
  return [...keys.values()].filter(Boolean);
};

export const WELLNESS_METRICS = Object.freeze([
  ['health_ratio', 'Bienestar', '0–10', 0, 10],
  ['sleep_hours', 'Sueño', 'h', 0, 24],
  ['sleep_quality', 'Calidad sueño', '1–10', 1, 10],
  ['fatigue', 'Fatiga', '1–10', 1, 10],
  ['muscle_soreness', 'Dolor muscular', '1–10', 1, 10],
  ['stress', 'Estrés', '1–10', 1, 10],
  ['mood', 'Ánimo', '1–10', 1, 10],
]);

export function buildRealPerformanceMemory({ context, source } = {}) {
  if (!context?.teamId || !context?.startsOn || !context?.endsOn || !source) return null;
  const players = new Map((source.players || []).filter((row) => row?.id
    && row.membership_id === row.stage?.id && row.stage.team_id === context.teamId
    && row.stage.player_id === row.global_player_id).map((row) => [row.id, row.stage]));
  const scoped = (row) => {
    const stage = players.get(row.jugador_id);
    const d = date(row.entry_date);
    return stage && d && d >= context.startsOn && d <= context.endsOn
      && (!date(stage.start_date) || d >= stage.start_date)
      && (!date(stage.end_date) || d <= stage.end_date);
  };
  const wellness = dedupe((source.wellness || []).filter(scoped),
    (row) => `${row.jugador_id}|${row.entry_date}`);
  const sessionDates = new Map((source.sessions || []).map((row) => [row.id, row.session_date]));
  const rpe = dedupe((source.rpe || []).filter((row) => scoped(row)
    && sessionDates.get(row.session_id) === row.entry_date),
    (row) => row.session_id ? `${row.jugador_id}|${row.session_id}` : null);
  const rpeValid = rpe.flatMap((row) => {
    const value = getValidRpeValue(row.rpe);
    return value === null ? [] : [{ ...row, value }];
  });
  const rpeGroup = group(rpeValid);
  const rpeSummary = rpeGroup ? summarizeRpeEntries(rpeValid) : null;
  const wellnessGroups = WELLNESS_METRICS.flatMap(([key, label, unit, min, max]) => {
    const valid = wellness.flatMap((row) => {
      const value = number(row[key], min, max);
      return value === null ? [] : [{ ...row, value }];
    });
    const summary = group(valid);
    return summary ? [{ key, label, unit, ...summary }] : [];
  });
  const months = [...new Set([...rpeValid, ...wellness].map((row) => month(row.entry_date)))].sort();
  const monthly = months.map((period) => {
    const rpeRows = rpeValid.filter((row) => month(row.entry_date) === period);
    const wellnessRows = wellness.flatMap((row) => month(row.entry_date) === period
      ? number(row.health_ratio, 0, 10) === null ? []
        : [{ ...row, value: number(row.health_ratio, 0, 10) }] : []);
    return { period, rpe: group(rpeRows), wellness: group(wellnessRows) };
  }).filter((row) => row.rpe || row.wellness);
  if (!rpeGroup && !wellnessGroups.length) return null;
  return { period: `${context.startsOn} / ${context.endsOn}`,
    rpe: rpeGroup ? { ...rpeGroup, distribution: [
      rpeSummary.values.filter((v) => v <= 3).length,
      rpeSummary.values.filter((v) => v >= 4 && v <= 6).length,
      rpeSummary.values.filter((v) => v >= 7).length,
    ] } : null,
    wellness: wellnessGroups, monthly,
    limitations: ['Sin respuestas: no se interpreta como cero.',
      'Solo se muestran grupos con al menos cinco jugadores distintos.',
      'Carga diaria de equipo omitida: training_sessions carece de vínculo CTS/equipo.'] };
}

export function buildRealGroupMemory({ matches = [], source } = {}) {
  const complete = [];
  let completeMatches = 0;
  const scoringMatches = matches.filter((row) => row.result
    && row.result.goalsFor + row.result.goalsAgainst > 0);
  for (const match of scoringMatches) {
    const goals = dedupe((source?.goals || []).filter((row) => row.partido_id === match.id),
      (row) => row.id);
    const forRows = goals.filter((row) => row.type === 'Gol a favor');
    const againstRows = goals.filter((row) => row.type === 'Gol en contra');
    if (forRows.length !== match.result.goalsFor || againstRows.length !== match.result.goalsAgainst) continue;
    completeMatches++;
    complete.push(...goals.filter((row) => ['Gol a favor', 'Gol en contra'].includes(row.type))
      .map((row) => ({ teamSide: row.type === 'Gol a favor' ? 'for' : 'against',
        goalContext: ['Juego combinativo', 'Juego directo', 'Transición', 'ABP']
          .includes(row.phase) ? row.phase : null,
        subphase: row.subphase || null })));
  }
  const coverage = buildGroupGoalCoverage(complete);
  if (!coverage.withContext) return null;
  return { coverage, rows: buildGroupGoalTypeRows(complete),
    setPieces: buildGroupSetPieceSummary(complete),
    verifiedMatches: scoringMatches.length,
    completeMatches };
}
