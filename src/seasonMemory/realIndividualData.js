// Lectura aislada: solo partidos del CTS elegido y fichas enlazadas al equipo propio.
const unwrap = (response, label) => {
  if (response?.error || !Array.isArray(response?.data)) throw new Error(`No se pudieron leer ${label}.`);
  return response.data;
};

async function readPages(makeQuery, label) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = unwrap(await makeQuery().range(offset, offset + 499), label);
    rows.push(...page);
    if (page.length < 500) return rows;
    if (offset > 20000) throw new Error(`Demasiados registros en ${label}.`);
  }
}

async function readByIds(client, table, columns, key, ids, label, filter) {
  const result = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const part = ids.slice(offset, offset + 100);
    result.push(...await readPages(() => {
      let query = client.from(table).select(columns).in(key, part).order('id', { ascending: true });
      if (filter) query = query.eq(filter.key, filter.value);
      return query;
    }, label));
  }
  return result;
}

export async function loadRealIndividualSnapshot(client, context, matches) {
  if (!context?.id || !context?.teamId) throw new Error('Equipo no acreditado.');
  const matchIds = [...new Set(matches.filter((row) => row.club_team_season_id === context.id)
    .map((row) => row.id).filter(Boolean))];
  if (!matchIds.length) return { players: [], stats: [], slots: [], substitutions: [], goals: [], quickEvents: [], postEvents: [] };
  const stages = await readPages(() => client.from('player_team_memberships')
    .select('id,player_id,team_id,start_date,end_date').eq('team_id', context.teamId).order('id', { ascending: true }),
  'pertenencias del equipo');
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const [players, stats, slots, substitutions, goals, quickEvents, postEvents] = await Promise.all([
    readByIds(client, 'jugadores', 'id,name,number,position,global_player_id,membership_id,active_in_squad',
      'membership_id', [...stageById.keys()], 'fichas de jugadores'),
    readByIds(client, 'partido_estadisticas_jugador',
      'id,partido_id,jugador_id,role,minutes,yellow,yellow_count,red', 'partido_id', matchIds,
      'estadísticas individuales'),
    readByIds(client, 'partido_alineacion_slots',
      'id,partido_id,scope,slot,jugador_id', 'partido_id', matchIds,
      'alineaciones', { key: 'scope', value: 'stats' }),
    readByIds(client, 'partido_eventos_sustitucion',
      'id,partido_id,minute,outgoing_jugador_id,incoming_jugador_id', 'partido_id', matchIds,
      'sustituciones'),
    readByIds(client, 'partido_eventos_gol',
      'id,partido_id,type,minute,scorer,scorer_id,assistant,assistant_id,is_own_goal,video_url,phase,subphase', 'partido_id', matchIds,
      'eventos de gol'),
    readByIds(client, 'match_quick_events',
      'id,partido_id,jugador_id,equipo,tipo_evento,minuto,reviewed', 'partido_id', matchIds,
      'incidencias revisadas'),
    readByIds(client, 'partido_eventos_post',
      'id,partido_id,minute,type,description,jugador_id,video_seconds', 'partido_id', matchIds,
      'marcadores del vídeo POST'),
  ]);
  // La pertenencia al equipo se comprueba de nuevo en el modelo puro.
  return { players: players.map((player) => ({ ...player, stage: stageById.get(player.membership_id) || null })),
    stats, slots, substitutions, goals, quickEvents, postEvents };
}
