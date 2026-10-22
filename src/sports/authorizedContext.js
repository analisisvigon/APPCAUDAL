// Preparacion del contexto deportivo. Las opciones proceden siempre de la RPC
// autenticada; un valor del navegador solo puede solicitar una de ellas.
const VERIFIED_CONTEXT = Symbol('server_verified_sports_context');

export const loadAuthorizedSportsContexts = async (client) => {
  if (!client || typeof client.rpc !== 'function') throw new Error('Cliente de identidad no disponible.');
  const { data, error } = await client.rpc('my_access_contexts_v1');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Respuesta de contextos no válida.');

  const contexts = [];
  const seen = new Set();
  for (const membership of data) {
    if (!membership || membership.is_active !== true || !membership.membership_id
      || !membership.club_id || !Array.isArray(membership.contexts)) {
      throw new Error('Membresía activa incompleta.');
    }
    if (!['owner', 'admin', 'staff'].includes(membership.role)) {
      if (membership.contexts.length) throw new Error('Contextos asignados a un rol no deportivo.');
      continue;
    }
    for (const option of membership.contexts) {
      if (!option || option.club_id !== membership.club_id
        || !option.club_team_season_id || !option.team_id || !option.season_id
        || !['open', 'closed'].includes(option.season_status)
        || seen.has(option.club_team_season_id)) {
        throw new Error('Contexto deportivo ambiguo o incompleto.');
      }
      seen.add(option.club_team_season_id);
      contexts.push(Object.freeze({
        [VERIFIED_CONTEXT]: true,
        id: option.club_team_season_id,
        clubId: option.club_id,
        teamId: option.team_id,
        seasonId: option.season_id,
        clubName: membership.club_name || '',
        teamName: option.team_name || option.team_code || '',
        seasonLabel: option.season_label || '',
        seasonStatus: option.season_status,
        isActiveSeason: option.season_is_active === true,
        membershipId: membership.membership_id,
        role: membership.role,
      }));
    }
  }
  return Object.freeze(contexts);
};

export const verifySportsContext = async (client, requestedId) => {
  const id = String(requestedId || '').trim();
  if (!id) throw new Error('Debe indicarse un equipo y temporada.');
  const contexts = await loadAuthorizedSportsContexts(client);
  const context = contexts.find((option) => option.id === id);
  if (!context) throw new Error('Equipo y temporada no autorizados.');
  return context;
};

export class SportsContextCoordinator {
  #generation = 0;
  #context = null;

  change(context) {
    if (context && context[VERIFIED_CONTEXT] !== true) {
      throw new Error('El contexto no procede de una verificación del servidor.');
    }
    this.#generation += 1;
    this.#context = context || null;
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({ generation: this.#generation, context: this.#context });
  }

  isCurrent(snapshot) {
    return Boolean(snapshot?.context && this.#context
      && snapshot.generation === this.#generation
      && snapshot.context.id === this.#context.id);
  }

  assertWritable(snapshot) {
    if (!this.isCurrent(snapshot)) throw new Error('El equipo o temporada ha cambiado.');
    if (this.#context.seasonStatus !== 'open') throw new Error('Temporada cerrada: solo consulta.');
    // Solo evita guardados locales obsoletos. La escritura debe comprobarse
    // tambien en Supabase mediante can_write_club_team_season/can_write_match.
  }
}
