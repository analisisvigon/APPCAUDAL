import { normalizeMicrocycleDay } from '../utils/microcyclePresentation.js';

// Migración 2B instalada y verificador estructural GLOBAL PASS, confirmado por el propietario.
// Las pruebas conectadas con otras identidades siguen pendientes; la RPC/RLS son la autoridad final.
export const MICROCYCLES_2B_BACKEND_VERIFIED = true;

const unwrap = (response) => {
  if (response?.error) throw response.error;
  return response?.data;
};

export const blankMicrocycleDraft = (days) => ({
  objective: '', priorities: [], responsible: '', observations: '',
  days: Object.fromEntries(days.map((day) => [day, {
    type: '', objective: '', focus: '', intensity: '', durationMinutes: '', observations: '',
  }])),
});

const text = (value) => typeof value === 'string' ? value : '';

export const hydrateMicrocycleDraft = (record, days) => {
  if (!record) return blankMicrocycleDraft(days);
  if (!record.weekly || !record.days || !Number.isInteger(record.revision) || record.revision < 1 ||
    days.some((day) => !record.days[day] || typeof record.days[day] !== 'object')) {
    throw new Error('La planificación semanal guardada tiene una estructura incompatible.');
  }
  return {
    objective: text(record.weekly.objective),
    priorities: Array.isArray(record.weekly.priorities) ? [...record.weekly.priorities] : [],
    responsible: text(record.weekly.responsible), observations: text(record.weekly.observations),
    days: Object.fromEntries(days.map((day) => [day, {
      type: text(record.days[day].type), objective: text(record.days[day].objective),
      focus: text(record.days[day].focus), intensity: text(record.days[day].intensity),
      durationMinutes: record.days[day].durationMinutes == null ? '' : String(record.days[day].durationMinutes),
      observations: text(record.days[day].observations),
    }])),
  };
};

export const serializeMicrocycleDraft = (draft, days) => {
  if (days.length !== 7 || new Date(`${days[0]}T12:00:00`).getDay() !== 1 ||
    !days.every((day, index) => {
    const expected = new Date(`${days[0]}T12:00:00`);
    expected.setDate(expected.getDate() + index);
    return !Number.isNaN(expected.getTime()) && day === [expected.getFullYear(),
      String(expected.getMonth() + 1).padStart(2, '0'), String(expected.getDate()).padStart(2, '0')].join('-');
  })) throw new Error('La semana debe contener siete fechas consecutivas.');
  const weekly = { objective: text(draft.objective), priorities: [...draft.priorities],
    responsible: text(draft.responsible), observations: text(draft.observations) };
  const daily = Object.fromEntries(days.map((day) => {
    const source = normalizeMicrocycleDay(draft.days?.[day]);
    if (!source) throw new Error(`Falta la planificación del ${day}.`);
    const rawMinutes = String(source.durationMinutes ?? '').trim();
    if (rawMinutes && (!/^[1-9]\d{0,3}$/.test(rawMinutes) || Number(rawMinutes) > 9999))
      throw new Error(`Duración prevista inválida para el ${day}.`);
    return [day, {
      type: text(source.type), objective: text(source.objective), focus: text(source.focus),
      intensity: text(source.intensity), durationMinutes: rawMinutes ? Number(rawMinutes) : null,
      observations: text(source.observations),
    }];
  }));
  return { weekly, days: daily };
};

export const loadMicrocycle2b = async (client, contextId, monday) => {
  if (!contextId || !monday) throw new Error('Falta equipo, temporada o semana.');
  const row = unwrap(await client.from('planned_microcycles')
    .select('id,club_team_season_id,week_starts_on,weekly,days,revision')
    .eq('club_team_season_id', contextId).eq('week_starts_on', monday).maybeSingle());
  if (row && (row.club_team_season_id !== contextId || row.week_starts_on !== monday))
    throw new Error('La planificación devuelta no corresponde al contexto solicitado.');
  return row || null;
};

export const listSeasonMicrocyclePlans = async (client, contextId) => {
  if (!contextId) return [];
  const rows = unwrap(await client.from('planned_microcycles')
    .select('id,club_team_season_id,week_starts_on,weekly,revision')
    .eq('club_team_season_id', contextId).order('week_starts_on', { ascending: true })) || [];
  if (rows.some((row) => row.club_team_season_id !== contextId))
    throw new Error('La lista de microciclos contiene un equipo-temporada incompatible.');
  return rows;
};

export const buildMicrocycleSaveArgs = (contextId, monday, expectedRevision, draft, days) => {
  if (!contextId || monday !== days[0] || !Number.isInteger(expectedRevision) || expectedRevision < 0)
    throw new Error('Contexto o revisión de planificación inválidos.');
  const payload = serializeMicrocycleDraft(draft, days);
  return {
    p_club_team_season_id: contextId,
    p_week_starts_on: monday,
    p_expected_revision: expectedRevision,
    p_weekly: payload.weekly,
    p_days: payload.days,
  };
};

export const verifyMicrocycleSave = (reply, fresh, contextId, monday, expectedRevision, draft, days) => {
  const expectedDraft = { ...draft, days: Object.fromEntries(days.map((day) =>
    [day, normalizeMicrocycleDay(draft.days?.[day])])) };
  if (!fresh || typeof fresh.id !== 'string' || !fresh.id || fresh.id !== reply?.id ||
    fresh.club_team_season_id !== contextId ||
    fresh.week_starts_on !== monday || fresh.revision !== expectedRevision + 1 ||
    fresh.revision !== reply?.revision ||
    JSON.stringify(hydrateMicrocycleDraft(fresh, days)) !== JSON.stringify(expectedDraft)) {
    throw new Error('El servidor no confirmó la revisión guardada. Recarga antes de continuar.');
  }
  return fresh;
};

export const saveMicrocycle2b = async (client, contextId, monday, expectedRevision, draft, days) => {
  if (!MICROCYCLES_2B_BACKEND_VERIFIED) throw new Error('Backend de microciclos pendiente de verificación.');
  return unwrap(await client.rpc('save_planned_microcycle_2b',
    buildMicrocycleSaveArgs(contextId, monday, expectedRevision, draft, days)));
};
