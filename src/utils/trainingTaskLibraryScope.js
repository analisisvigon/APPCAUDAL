const PAGE_SIZE = 250;

export const loadTrainingTaskLibraryScope = async (client, clubTeamSeasonId, {
  createdFrom = null,
  createdUntil = null,
} = {}) => {
  if (!clubTeamSeasonId) throw new Error('Selecciona un equipo y temporada autorizados.');
  const rows = [];
  let offset = 0;
  let total = null;

  do {
    const { data, error } = await client.rpc('training_task_library_scope_v1', {
      p_cts_id: clubTeamSeasonId,
      p_created_from: createdFrom,
      p_created_until: createdUntil,
      p_offset: offset,
      p_limit: PAGE_SIZE,
    });
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    if (total === null) total = page.length ? Number(page[0].total_count) : 0;
    rows.push(...page);
    offset += page.length;
    if (!page.length || offset >= total || page.length < PAGE_SIZE) break;
  } while (true);

  const unique = new Map();
  rows.forEach((row) => unique.set(row.task_id, {
    taskId: row.task_id,
    isPersonal: row.is_personal === true,
    isSharedWithTeam: row.is_shared_with_team === true,
  }));
  return [...unique.values()];
};

export const chunkTrainingTaskIds = (ids, size = PAGE_SIZE) => {
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
};
