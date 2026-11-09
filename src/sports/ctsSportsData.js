import { loadAuthorizedSportsContexts, loadOperationalPreferredContextId,
  verifySelectableSportsContext, verifySportsContext } from './authorizedContext.js';

// The compatibility workspace must also select an authorized CTS before reading
// or creating roster entries. Never infer it from a team name/code or season dates.
export async function resolveRosterContext(client, requestedId = '', clubId = '') {
  const contexts = (await loadAuthorizedSportsContexts(client))
    .filter((context) => !clubId || context.clubId === clubId);
  const id = requestedId || await loadOperationalPreferredContextId(client, contexts)
    || (contexts.length === 1 ? contexts[0].id : '');
  if (!id) return { contexts, context: null };
  if (!contexts.some((context) => context.id === id)) throw new Error('Equipo y temporada no autorizados.');
  try {
    return { contexts, context: await verifySelectableSportsContext(client, id) };
  } catch (error) {
    // Preserve authorized options so an unavailable archive does not trap the selector.
    throw Object.assign(new Error(error.message), { contexts });
  }
}

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
  const [fichas, links] = await Promise.all([
    client.rpc('my_cts_jugadores_v1', { p_club_team_season_id: context.id }),
    client.rpc('my_cts_roster_links_v1', { p_club_team_season_id: context.id }),
  ]);
  if (fichas.error) throw fichas.error;
  if (links.error) throw links.error;
  if (!coordinator.isCurrent(snapshot)) throw new Error('El equipo o temporada ha cambiado.');
  if (!Array.isArray(fichas.data) || !Array.isArray(links.data)) throw new Error('Respuesta de plantilla incompleta.');
  // my_cts_jugadores returns legacy fields, which do not include the CTS departure.
  // The canonical link decides whether a player still belongs to this roster.
  return fichas.data.filter((player) => player.active_in_squad !== false && links.data.some((link) => (
    link.legacy_jugador_id === player.id && link.player_id === player.global_player_id
    && Number(link.legacy_ficha_count) === 1 && link.has_departed === false
    && !link.voided_at && !link.left_on
  )));
}

// Keep this attempt for the lifetime of the form. A failed read or a lost RPC
// response must not generate another UUID or repeat a confirmed INSERT.
export async function createAndConfirmCtsPlayer(client, coordinator, snapshot, attempt, create) {
  if (!attempt?.playerId || attempt.ctsId !== snapshot?.context?.id) {
    throw new Error('El formulario no pertenece al equipo y temporada seleccionados.');
  }
  if (attempt.busy) throw new Error('El alta ya se está comprobando.');
  attempt.busy = true;
  try {
    await assertCtsCreate(client, coordinator, snapshot);
    if (attempt.started) {
      const roster = await loadCtsRoster(client, coordinator, snapshot);
      const existing = roster.find((row) => row.id === attempt.playerId);
      if (existing) {
        const result = attempt.result || { status: 'created', ownPlayerId: existing.id,
          globalPlayerId: existing.global_player_id, membershipId: existing.membership_id };
        assertCreatedPlayerInCtsRoster(roster, result, attempt.playerId);
        return { result, roster };
      }
      if (attempt.result) {
        assertCreatedPlayerInCtsRoster(roster, attempt.result, attempt.playerId);
      }
    }
    attempt.started = true;
    attempt.result = await create();
    coordinator.assertWritable(snapshot);
    const roster = await loadCtsRoster(client, coordinator, snapshot);
    assertCreatedPlayerInCtsRoster(roster, attempt.result, attempt.playerId);
    return { result: attempt.result, roster };
  } finally { attempt.busy = false; }
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

export function assertCreatedPlayerInCtsRoster(roster, result, requestedPlayerId) {
  const ownPlayerId = String(result?.ownPlayerId || '');
  const globalPlayerId = String(result?.globalPlayerId || '');
  const membershipId = String(result?.membershipId || '');
  if (result?.status !== 'created' || !ownPlayerId || ownPlayerId !== String(requestedPlayerId || '')
    || !globalPlayerId || !membershipId) {
    throw new Error('Supabase no confirmó el alta completa del jugador en el equipo y temporada.');
  }
  const visible = (Array.isArray(roster) ? roster : []).some((player) => (
    String(player?.id || '') === ownPlayerId
    && String(player?.global_player_id || '') === globalPlayerId
    && String(player?.membership_id || '') === membershipId
  ));
  if (!visible) {
    throw new Error('El perfil se creó, pero no se confirmó su vinculación a la plantilla seleccionada. No se completó el alta.');
  }
}

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
