// Lectura de solo lectura. La ficha legacy y su etapa canónica acreditan el
// equipo; las fechas del CTS y de la etapa acotan cada respuesta.
const unwrap = (response) => {
  if (response?.error || !Array.isArray(response?.data)) throw new Error('Rendimiento no verificable.');
  return response.data;
};

async function pages(makeQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const part = unwrap(await makeQuery().range(offset, offset + 499));
    rows.push(...part);
    if (part.length < 500) return rows;
    if (offset > 20000) throw new Error('Rendimiento: paginación excedida.');
  }
}

async function byPlayers(client, table, columns, ids, context) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const slice = ids.slice(offset, offset + 100);
    rows.push(...await pages(() => client.from(table).select(columns)
      .in('jugador_id', slice).gte('entry_date', context.startsOn)
      .lte('entry_date', context.endsOn).order('id', { ascending: true })));
  }
  return rows;
}

export async function loadRealPerformanceSnapshot(client, context, players = []) {
  if (!context?.id || !context?.teamId || !context?.startsOn || !context?.endsOn) {
    throw new Error('CTS no acreditado para Rendimiento.');
  }
  const valid = players.filter((row) => row.id && row.membership_id === row.stage?.id
    && row.stage.team_id === context.teamId && row.stage.player_id === row.global_player_id);
  const ids = [...new Set(valid.map((row) => row.id))];
  if (!ids.length) return { players: [], wellness: [], rpe: [], sessions: [] };
  const [wellness, rpe] = await Promise.all([
    byPlayers(client, 'wellness_entries',
      'id,jugador_id,entry_date,sleep_hours,sleep_quality,fatigue,muscle_soreness,stress,mood,health_ratio', ids, context),
    byPlayers(client, 'rpe_entries',
      'id,jugador_id,session_id,entry_date,rpe,duration_minutes,load', ids, context),
  ]);
  const sessionIds = [...new Set(rpe.map((row) => row.session_id).filter(Boolean))];
  const sessions = [];
  for (let offset = 0; offset < sessionIds.length; offset += 100) {
    const slice = sessionIds.slice(offset, offset + 100);
    sessions.push(...await pages(() => client.from('training_sessions')
      .select('id,session_date').in('id', slice).order('id', { ascending: true })));
  }
  return { players: valid, wellness, rpe, sessions };
}
