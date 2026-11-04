-- NEXO CLUB / Videoanalisis Fase 0.
-- Solo lectura. Ejecutar manualmente en Supabase SQL Editor y exportar el resultado completo.
-- No imprime descripciones, pizarras, nombres de jugadores ni notas privadas.
-- Los hashes son huellas de diagnostico, no copias de seguridad ni pruebas de equivalencia semantica.

with matches as (
  select p.id::text as match_id,
         p.club_team_season_id::text as cts_id,
         cts.club_id::text as club_id,
         cts.team_id::text as team_id,
         cts.season_id::text as season_id,
         ct.id is not null as canonical_team_exists,
         season.id is not null as canonical_season_exists,
         season.status as season_status,
         case when pg_catalog.jsonb_typeof(pg_catalog.to_jsonb(p.pre_ai_analysis)) = 'object'
              then pg_catalog.to_jsonb(p.pre_ai_analysis) else '{}'::jsonb end as analysis,
         pg_catalog.jsonb_typeof(pg_catalog.to_jsonb(p.pre_ai_analysis)) as analysis_type
  from public.partidos p
  left join public.club_team_seasons cts on cts.id = p.club_team_season_id
  left join public.club_teams ct on ct.id = cts.team_id and ct.club_id = cts.club_id
  left join public.club_seasons season on season.id = cts.season_id and season.club_id = cts.club_id
), phase_rows as (
  select m.*, phase.phase, phase.workspace_key,
         m.analysis -> phase.workspace_key as workspace,
         case when pg_catalog.jsonb_typeof(m.analysis -> phase.workspace_key -> 'plays') = 'array'
              then m.analysis -> phase.workspace_key -> 'plays' else '[]'::jsonb end as play_array
  from matches m
  cross join (values
    ('defensive', 'defensivePhaseV1'),
    ('offensive', 'offensivePhaseV1'),
    ('transition', 'transitionPhaseV1'),
    ('set_piece', 'setPiecePhaseV1')
  ) as phase(phase, workspace_key)
), plays as (
  select p.*, item.ordinality::integer as play_order, item.raw_play,
         case when pg_catalog.jsonb_typeof(item.raw_play) = 'object'
              then pg_catalog.btrim(item.raw_play ->> 'id') else null end as play_id
  from phase_rows p
  cross join lateral pg_catalog.jsonb_array_elements(p.play_array)
    with ordinality as item(raw_play, ordinality)
), play_counts as (
  select match_id, phase, count(*) as play_count
  from plays group by match_id, phase
), duplicate_ids as (
  select match_id, play_id, count(*) as occurrences,
         pg_catalog.string_agg(phase || ':' || play_order::text, ', ' order by phase, play_order) as locations
  from plays where play_id is not null and play_id <> ''
  group by match_id, play_id having count(*) > 1
), plan_cards as (
  select m.match_id, plan_phase.key as plan_phase, card.ordinality::integer as card_order,
         pg_catalog.btrim(card.raw_card ->> 'playId') as play_id
  from matches m
  cross join lateral pg_catalog.jsonb_each(
    case when pg_catalog.jsonb_typeof(m.analysis -> 'matchPlanWorkspaceV1' -> 'phases') = 'object'
         then m.analysis -> 'matchPlanWorkspaceV1' -> 'phases' else '{}'::jsonb end
  ) as plan_phase(key, cards)
  cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(plan_phase.cards) = 'array'
         then plan_phase.cards else '[]'::jsonb end
  ) with ordinality as card(raw_card, ordinality)
), plan_refs as (
  select c.*, case c.plan_phase
    when 'with_ball' then 'offensive' when 'without_ball' then 'defensive'
    when 'transition' then 'transition' when 'set_piece' then 'set_piece'
    else null end as expected_phase
  from plan_cards c where c.play_id is not null and c.play_id <> ''
), active_refs as (
  select p.match_id, p.phase, selector_type.selector_key,
         selector.entry_key, pg_catalog.btrim(selector.raw_id #>> '{}') as play_id
  from phase_rows p
  cross join (values ('activePlayIdByContext'), ('activePlayIdBySituation')) as selector_type(selector_key)
  cross join lateral pg_catalog.jsonb_each(
    case when pg_catalog.jsonb_typeof(p.workspace -> selector_type.selector_key) = 'object'
         then p.workspace -> selector_type.selector_key else '{}'::jsonb end
  ) as selector(entry_key, raw_id)
  where selector.raw_id is not null and selector.raw_id <> 'null'::jsonb
), question_refs as (
  select m.match_id, ref.ordinality::integer as ref_order,
         pg_catalog.btrim(ref.raw_id #>> '{}') as play_id
  from matches m
  cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(m.analysis -> 'tacticalQuestion' -> 'tacticalPlayIds') = 'array'
         then m.analysis -> 'tacticalQuestion' -> 'tacticalPlayIds' else '[]'::jsonb end
  ) with ordinality as ref(raw_id, ordinality)
), report as (
  select 'MATCH_CONTEXT'::text as finding,
         case when m.cts_id is null or m.club_id is null
                   or not m.canonical_team_exists or not m.canonical_season_exists
                   or (m.analysis_type is not null and m.analysis_type <> 'object')
              then 'BLOCKED' else 'INFO' end::text as severity,
         m.match_id, m.cts_id, m.club_id, m.team_id, m.season_id,
         null::text as phase, null::integer as item_order, null::text as play_id,
         pg_catalog.jsonb_build_object('analysis_type', m.analysis_type,
           'analysis_md5', pg_catalog.md5(m.analysis::text),
           'cts_missing', m.cts_id is null,
           'canonical_link_missing', m.club_id is null,
           'canonical_team_exists', m.canonical_team_exists,
           'canonical_season_exists', m.canonical_season_exists,
           'season_status', m.season_status,
           'top_level_keys', (select pg_catalog.jsonb_agg(k.key order by k.key)
                              from pg_catalog.jsonb_object_keys(m.analysis) as k(key)),
           'evidence_validation_key_hashes', (select pg_catalog.jsonb_agg(pg_catalog.md5(k.key) order by k.key)
             from pg_catalog.jsonb_object_keys(case
               when pg_catalog.jsonb_typeof(m.analysis -> 'tacticalEvidenceValidationsV1') = 'object'
               then m.analysis -> 'tacticalEvidenceValidationsV1' else '{}'::jsonb end) as k(key))
         ) as details
  from matches m
  union all
  select 'PHASE', case when p.workspace is not null and pg_catalog.jsonb_typeof(p.workspace -> 'plays') is distinct from 'array' then 'BLOCKED' else 'INFO' end,
         p.match_id, p.cts_id, p.club_id, p.team_id, p.season_id, p.phase,
         null, null,
         pg_catalog.jsonb_build_object('workspace_key', p.workspace_key,
           'workspace_type', pg_catalog.jsonb_typeof(p.workspace),
           'plays_type', pg_catalog.jsonb_typeof(p.workspace -> 'plays'),
           'play_count', coalesce(c.play_count, 0),
           'workspace_md5', pg_catalog.md5(coalesce(p.workspace::text, 'null')))
  from phase_rows p left join play_counts c on c.match_id = p.match_id and c.phase = p.phase
  union all
  select 'PLAY', case when p.play_id is null or p.play_id = ''
                        or pg_catalog.jsonb_typeof(p.raw_play) <> 'object' then 'BLOCKED'
                      when d.play_id is not null then 'BLOCKED'
                      when p.play_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'REVIEW'
                      else 'INFO' end,
         p.match_id, p.cts_id, p.club_id, p.team_id, p.season_id,
         p.phase, p.play_order, p.play_id,
         pg_catalog.jsonb_build_object('raw_play_md5', pg_catalog.md5(p.raw_play::text),
           'raw_type', pg_catalog.jsonb_typeof(p.raw_play),
           'source_template_id', p.raw_play ->> 'sourceTemplateId',
           'context', pg_catalog.jsonb_build_object(
             'defensiveSituation', p.raw_play ->> 'defensiveSituation',
             'offensiveSituation', p.raw_play ->> 'offensiveSituation',
             'transitionType', p.raw_play ->> 'transitionType',
             'setPieceType', p.raw_play ->> 'setPieceType',
             'setPieceAction', p.raw_play ->> 'setPieceAction',
             'caudalSystem', p.raw_play ->> 'caudalSystem',
             'rivalSystem', p.raw_play ->> 'rivalSystem'),
           'has_description', coalesce(pg_catalog.length(p.raw_play ->> 'description'), 0) > 0,
           'has_board', p.raw_play ? 'playerPositions' or p.raw_play ? 'arrows',
           'duplicate_locations', d.locations,
           'keys', case when pg_catalog.jsonb_typeof(p.raw_play) = 'object'
              then (select pg_catalog.jsonb_agg(k.key order by k.key)
                    from pg_catalog.jsonb_object_keys(p.raw_play) as k(key)) else '[]'::jsonb end,
           'extra_keys', case when pg_catalog.jsonb_typeof(p.raw_play) = 'object'
              then (select pg_catalog.jsonb_agg(k.key order by k.key)
                    from pg_catalog.jsonb_object_keys(p.raw_play) as k(key)
                    where not (k.key = any(array[
                      'id','phase','name','defensiveSituation','offensiveSituation','playStyle',
                      'transitionType','fieldZone','behaviour','setPieceType','setPieceAction',
                      'rivalSystem','caudalSystem','systemContextVersion','systemContextSource',
                      'playerPositions','responsibilities','arrows','ballStartPosition',
                      'ballVisible','description','category','tags','sourceTemplateId',
                      'createdAt','updatedAt']))) else '[]'::jsonb end)
  from plays p left join duplicate_ids d on d.match_id = p.match_id and d.play_id = p.play_id
  union all
  select 'PLAN_REFERENCE', case when pr.expected_phase is null then 'REVIEW'
    when not exists (select 1 from plays p where p.match_id = pr.match_id and p.phase = pr.expected_phase and p.play_id = pr.play_id) then 'BLOCKED'
    else 'INFO' end,
    pr.match_id, m.cts_id, m.club_id, m.team_id, m.season_id,
    pr.expected_phase, pr.card_order, pr.play_id,
    pg_catalog.jsonb_build_object('plan_phase', pr.plan_phase,
      'matching_plays', (select count(*) from plays p where p.match_id = pr.match_id
        and p.phase = pr.expected_phase and p.play_id = pr.play_id))
  from plan_refs pr join matches m on m.match_id = pr.match_id
  union all
  select 'ACTIVE_PLAY_REFERENCE', case when not exists
    (select 1 from plays p where p.match_id = ar.match_id and p.phase = ar.phase and p.play_id = ar.play_id) then 'REVIEW' else 'INFO' end,
    ar.match_id, m.cts_id, m.club_id, m.team_id, m.season_id,
    ar.phase, null, ar.play_id,
    pg_catalog.jsonb_build_object('selector', ar.selector_key, 'context_key_md5', pg_catalog.md5(ar.entry_key),
      'matching_plays', (select count(*) from plays p where p.match_id = ar.match_id and p.phase = ar.phase and p.play_id = ar.play_id))
  from active_refs ar join matches m on m.match_id = ar.match_id
  union all
  select 'TACTICAL_QUESTION_REFERENCE', case when not exists
    (select 1 from plays p where p.match_id = qr.match_id and p.play_id = qr.play_id) then 'BLOCKED' else 'INFO' end,
    qr.match_id, m.cts_id, m.club_id, m.team_id, m.season_id,
    null, qr.ref_order, qr.play_id,
    pg_catalog.jsonb_build_object('matching_plays', (select count(*) from plays p where p.match_id = qr.match_id and p.play_id = qr.play_id))
  from question_refs qr join matches m on m.match_id = qr.match_id
  union all
  select 'EVIDENCE_VALIDATION', 'REVIEW', m.match_id, m.cts_id, m.club_id, m.team_id, m.season_id,
    null, null, null,
    pg_catalog.jsonb_build_object('evidence_key_md5', pg_catalog.md5(validation.key),
      'evidence_type', pg_catalog.split_part(validation.key, ':', 1),
      'validation_md5', pg_catalog.md5(validation.value::text),
      'note', 'La clave identifica una evidencia derivada; no equivale directamente a playId')
  from matches m
  cross join lateral pg_catalog.jsonb_each(
    case when pg_catalog.jsonb_typeof(m.analysis -> 'tacticalEvidenceValidationsV1') = 'object'
         then m.analysis -> 'tacticalEvidenceValidationsV1' else '{}'::jsonb end
  ) as validation(key, value)
)
select finding, severity, match_id, cts_id, club_id, team_id, season_id,
       phase, item_order, play_id, details
from report
order by match_id, case finding when 'MATCH_CONTEXT' then 1 when 'PHASE' then 2
       when 'PLAY' then 3 when 'PLAN_REFERENCE' then 4
       when 'TACTICAL_QUESTION_REFERENCE' then 5
       when 'ACTIVE_PLAY_REFERENCE' then 6 else 7 end,
       phase nulls first, item_order nulls first;
