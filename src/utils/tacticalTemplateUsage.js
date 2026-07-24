const getWorkspacePlays = (analysis, workspaceKey) => {
  const workspace = analysis?.[workspaceKey];
  return Array.isArray(workspace?.plays) ? workspace.plays : [];
};

const getTemplateId = (play) => String(play?.sourceTemplateId || '').trim();

export const calculateTacticalTemplateUsages = (matchRows = []) => {
  const usageByTemplate = {};

  matchRows.forEach((match) => {
    const analysis = match?.pre_ai_analysis && typeof match.pre_ai_analysis === 'object'
      ? match.pre_ai_analysis
      : {};
    const plays = [
      ...getWorkspacePlays(analysis, 'defensivePhaseV1').map((play) => ({ play, phase: 'defensive' })),
      ...getWorkspacePlays(analysis, 'offensivePhaseV1').map((play) => ({ play, phase: 'offensive' })),
      ...getWorkspacePlays(analysis, 'transitionPhaseV1').map((play) => ({ play, phase: 'transition' })),
      ...getWorkspacePlays(analysis, 'setPiecePhaseV1').map((play) => ({ play, phase: 'set_piece' })),
    ];
    plays.forEach(({ play, phase }) => {
      const templateId = getTemplateId(play);
      if (!templateId) return;
      if (!usageByTemplate[templateId]) {
        usageByTemplate[templateId] = {
          playCount: 0,
          matchIds: new Set(),
          rivalKeys: new Set(),
          details: [],
        };
      }
      const usage = usageByTemplate[templateId];
      const matchId = String(match.id || '');
      const opponent = String(match.opponent || 'Rival sin nombre');
      const rivalKey = String(match.equipo_rival_id || opponent).trim().toLowerCase();
      usage.playCount += 1;
      if (matchId) usage.matchIds.add(matchId);
      if (rivalKey) usage.rivalKeys.add(rivalKey);
      usage.details.push({
        matchId,
        opponent,
        date: String(match.date || ''),
        playId: String(play.id || ''),
        playName: String(play.name || 'Jugada'),
        phase,
        situation: String(play.defensiveSituation || play.offensiveSituation || play.transitionType || play.setPieceType || ''),
      });
    });
  });

  return Object.fromEntries(Object.entries(usageByTemplate).map(([templateId, usage]) => [
    templateId,
    {
      playCount: usage.playCount,
      matchCount: usage.matchIds.size,
      rivalCount: usage.rivalKeys.size,
      details: usage.details,
    },
  ]));
};

export const loadTacticalTemplateUsageRows = async (client, pageSize = 1000) => {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from('partidos')
      .select('id, opponent, equipo_rival_id, date, pre_ai_analysis')
      .order('date', { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
};
