import { verifySportsContext } from './authorizedContext.js';

// El identificador del navegador solo solicita un contexto: la RPC de identidad
// vuelve a autorizarlo en cada operación. RLS es la barrera definitiva.
export async function authorizedSnapshot(client, coordinator, snapshot, { write = false } = {}) {
  if (!coordinator.isCurrent(snapshot)) throw new Error('El equipo o temporada ha cambiado.');
  const fresh = await verifySportsContext(client, snapshot.context.id);
  if (!coordinator.isCurrent(snapshot) || fresh.clubId !== snapshot.context.clubId
    || fresh.teamId !== snapshot.context.teamId || fresh.seasonId !== snapshot.context.seasonId) {
    throw new Error('El contexto deportivo ha cambiado o se ha revocado.');
  }
  if (write && fresh.seasonStatus !== 'open') throw new Error('Temporada cerrada: solo consulta.');
  return fresh;
}

export async function loadCtsRoster(client, coordinator, snapshot) {
  const context = await authorizedSnapshot(client, coordinator, snapshot);
  const { data, error } = await client.rpc('my_cts_jugadores_v1', {
    p_club_team_season_id: context.id,
  });
  if (error) throw error;
  if (!coordinator.isCurrent(snapshot)) throw new Error('El equipo o temporada ha cambiado.');
  return data || [];
}

export async function loadCtsMatches(client, coordinator, snapshot) {
  const context = await authorizedSnapshot(client, coordinator, snapshot);
  const { data, error } = await client.rpc('my_cts_matches_v1', {
    p_club_team_season_id: context.id,
  });
  if (error) throw error;
  if (!coordinator.isCurrent(snapshot)) throw new Error('El equipo o temporada ha cambiado.');
  if ((data || []).some((row) => row.club_team_season_id !== context.id)) {
    throw new Error('La respuesta de partidos contiene otro equipo o temporada.');
  }
  return data || [];
}

// La capacidad solo controla la interfaz. Cada RPC de mutacion vuelve a
// comprobar el registro operativo y los permisos en la misma transaccion.
export async function canWriteOperationalCts(client, coordinator, snapshot) {
  const context = await authorizedSnapshot(client, coordinator, snapshot);
  if (context.seasonStatus !== 'open') return false;
  const { data, error } = await client.rpc('can_write_operational_cts_v1', {
    target_cts_id: context.id,
  });
  if (error) throw error;
  return coordinator.isCurrent(snapshot) && data === true;
}

async function operationalMutation(client, coordinator, snapshot, name, args) {
  const context = await authorizedSnapshot(client, coordinator, snapshot, { write: true });
  const { data, error } = await client.rpc(name, { p_cts_id: context.id, ...args });
  if (error) throw error;
  if (!coordinator.isCurrent(snapshot)) throw new Error('El equipo o temporada ha cambiado.');
  return data;
}

export const createOperationalPlayer = (client, coordinator, snapshot, playerId, player, positions) =>
  operationalMutation(client, coordinator, snapshot, 'create_operational_player_v1', {
    p_jugador_id: playerId, p_player: player, p_positions: positions,
  });

export const editOperationalPlayer = (client, coordinator, snapshot, playerId, patch) =>
  operationalMutation(client, coordinator, snapshot, 'edit_operational_player_v1', {
    p_jugador_id: playerId, p_patch: patch,
  });

export const createOperationalMatch = (client, coordinator, snapshot, match) =>
  operationalMutation(client, coordinator, snapshot, 'create_operational_match_v1', {
    p_match: match,
  });

export const editOperationalMatch = (client, coordinator, snapshot, matchId, patch) =>
  operationalMutation(client, coordinator, snapshot, 'edit_operational_match_v1', {
    p_partido_id: matchId, p_patch: patch,
  });

export async function assertCtsMatchWrite(client, coordinator, snapshot, matchId) {
  const context = await authorizedSnapshot(client, coordinator, snapshot, { write: true });
  const { data: allowed, error: permissionError } = await client.rpc('can_write_match', {
    target_partido_id: matchId,
  });
  if (permissionError) throw permissionError;
  if (allowed !== true) throw new Error('No hay permiso de escritura sobre este partido.');
  const { data: match, error } = await client.from('partidos')
    .select('id,club_team_season_id').eq('id', matchId).maybeSingle();
  if (error) throw error;
  if (!coordinator.isCurrent(snapshot) || match?.club_team_season_id !== context.id) {
    throw new Error('El partido no pertenece al equipo y temporada seleccionados.');
  }
  return context;
}

export async function assertCtsCreate(client, coordinator, snapshot) {
  const context = await authorizedSnapshot(client, coordinator, snapshot, { write: true });
  const { data: allowed, error } = await client.rpc('can_write_club_team_season', {
    target_club_team_season_id: context.id,
  });
  if (error) throw error;
  if (!coordinator.isCurrent(snapshot) || allowed !== true) {
    throw new Error('No hay permiso de escritura sobre este equipo y temporada.');
  }
  return context;
}
