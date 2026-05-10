import { useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';

import { supabase } from './lib/supabase';
import LibrarySection from './components/library/LibrarySection';
import MatchPrintTab from './components/print/MatchPrintTab';
import './styles/print.css';

const clubCrest =
  'https://tmssl.akamaized.net//images/wappen/head/13226.png?lm=1747769013';
const defaultHomePhrase = 'Trabajo, identidad y detalle competitivo para preparar cada partido.';
const homePhraseConfigKey = 'home_hero_phrase';

class SystemsFacingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error cargando Sistemas enfrentados:', error, errorInfo);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-red-100 shadow-glow">
          <h4 className="text-sm font-black uppercase tracking-[0.18em] text-white">Error cargando Sistemas enfrentados</h4>
          <p className="mt-3 break-words text-sm leading-6">
            {this.state.error?.message || String(this.state.error)}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

const positions = [
  'Portero',
  'Lateral derecho',
  'Lateral izquierdo',
  'Defensa central',
  'Central derecho',
  'Central izquierdo',
  'Pivote',
  'Mediocentro',
  'Mediocentro ofensivo',
  'Extremo derecho',
  'Extremo izquierdo',
  'Mediapunta',
  'Delantero centro',
  'Delantero',
];

const footOptions = ['Derecha', 'Izquierda', 'Ambas', 'No indicada'];

const squadGroups = [
  {
    title: 'Porteros',
    positions: ['Portero'],
  },
  {
    title: 'Defensas',
    positions: ['Lateral derecho', 'Lateral izquierdo', 'Defensa central', 'Central derecho', 'Central izquierdo'],
  },
  {
    title: 'Mediocentros',
    positions: ['Pivote', 'Mediocentro', 'Mediocentro ofensivo', 'Mediapunta'],
  },
  {
    title: 'Delanteros',
    positions: ['Extremo derecho', 'Extremo izquierdo', 'Delantero centro', 'Delantero'],
  },
];

const gameSystems = ['4-4-2', '4-2-3-1', '4-3-3', '3-5-2', '3-4-3', '3-4-1-2', '5-3-2', '5-4-1', 'Otro'];
const matchTypes = ['Liga', 'Copa RFEF', 'Play off', 'Amistoso'];
const matchFilters = ['Todos', ...matchTypes];
const eventColorOptions = ['emerald', 'red', 'sky', 'violet', 'amber', 'orange', 'slate'];
const goalPhaseOptions = {
  'Juego combinativo': ['Dentro del área', 'Fuera del área'],
  'Juego directo': ['Centro al área', 'Segunda jugada'],
  Transición: ['Tras robo', 'Tras ABP'],
  ABP: ['Córner', 'Falta directa', 'Falta con remate', 'Saque de banda', 'Penalti', 'Segunda jugada'],
};
const pitchZoneOptions = [
  'F.Finalización izquierda',
  'F.Finalización centro',
  'F.Finalización derecha',
  'F.Creación izquierda',
  'F.Creación centro',
  'F.Creación derecha',
  'F.Inicio izquierda',
  'F.Inicio centro',
  'F.Inicio derecha',
];
const goalZoneOptions = ['Alta izquierda', 'Alta centro', 'Alta derecha', 'Media izquierda', 'Media centro', 'Media derecha', 'Baja izquierda', 'Baja centro', 'Baja derecha'];
const defaultGoalAnalysisDraft = {
  type: 'Gol a favor',
  half: '1ª parte',
  minute: '',
  scorer: '',
  assistant: '',
  phase: 'Juego combinativo',
  subphase: 'Dentro del área',
  shotZone: 'F.Creación centro',
  assistZone: 'F.Creación centro',
  goalZone: 'Media centro',
  contact: 'Pie derecho',
  videoUrl: '',
};

const emptyMatchForm = {
  date: '',
  time: '',
  type: 'Liga',
  round: '',
  stadium: '',
  opponent: '',
  opponentCrest: '',
  homeTeam: 'C.D. Caudal',
  awayTeam: '',
  isHome: true,
  status: 'Previa',
  homeScore: '',
  awayScore: '',
  goalsFor: '',
  goalsAgainst: '',
  shots: '',
  shotsOnTarget: '',
  possession: '',
  corners: '',
  yellowCards: '',
  redCards: '',
  cleanSheet: false,
  statsGoalEvents: [],
  statsSystem: '4-4-2',
  statsLineup: [],
  statsCalledPlayers: [],
  statsPlayerData: {},
  captainPlayerId: null,
  preNotes: '',
  postNotes: '',
  postReality: '',
  postFulfilled: '',
  postNotFulfilled: '',
  postWhy: '',
  postNextAdjustment: '',
  postRepeat: '',
  postImprove: '',
  postTrainWeek: '',
  postIndividualObservations: '',
  postAiAnalysis: null,
  // PRE Partido - Plan de partido
  planConBalon: '',
  planSinBalon: '',
  planTransiciones: '',
  planClave: '',
  planObjetivo: '',
  // PRE Partido - ABP
  abpEnlace: '',
  abpOfensiva: '',
  abpDefensiva: '',
  // PRE Partido - Sistemas enfrentados
  preCanvaLink: '',
  preRivalReportText: '',
  preRivalReportExtraction: null,
  preCaudalSystem: '4-4-2',
  preCaudalLineup: [],
  preRivalSystem: '',
  preRivalLineup: [],
  preRivalManualPlayers: [],
  preRivalStyle: '',
  preRivalStrengths: '',
  preRivalWeaknesses: '',
  preRivalBuildUp: 'Combinativo',
  preRivalDefensiveBlock: 'Medio',
  preRivalPressure: 'Media',
  preRivalTransitions: 'Equilibradas',
  preRivalOffensiveOrganization: '',
  preRivalBaseSystem: '',
  preRivalStartPlay: '',
  preRivalProgression: '',
  preRivalFinishing: '',
  preRivalOffensiveKeyPlayers: '',
  preRivalDangerZones: '',
  preRivalWideAttack: '',
  preRivalBoxOccupation: '',
  preRivalDefensiveOrganization: '',
  preRivalDefensiveSystem: '',
  preRivalBlockHeightDetail: '',
  preRivalPressureType: '',
  preRivalSpacesAllowed: '',
  preRivalDefendsCrosses: '',
  preRivalDefendsBack: '',
  preRivalSecondBallDefense: '',
  preRivalAfterLoss: '',
  preRivalAfterRecovery: '',
  preRivalTransitionLaunchers: '',
  preRivalBestRunningZones: '',
  preRivalCornersFor: '',
  preRivalCornersAgainst: '',
  preRivalWideFreeKicks: '',
  preRivalSetPieceTakers: '',
  preRivalMainHeaders: '',
  preCaudalIntent: '',
  preCaudalBuildPlan: '',
  preCaudalStartPlay: '',
  preCaudalProgressionPlan: '',
  preCaudalAttackZones: '',
  preCaudalPlayersToActivate: '',
  preCaudalSpacesToFind: '',
  preCaudalPressPlan: '',
  preCaudalRivalsToBlock: '',
  preCaudalDefendStrengths: '',
  preCaudalAvoid: '',
  preCaudalAfterLoss: '',
  preCaudalAfterRecovery: '',
  preKeyMatchups: '',
  preSystemReading: null,
  preKeyMatchupsTable: [],
  prePlanTrigger: '',
  prePlanAvoid: '',
  prePlanAdjustment: '',
  preCaudalPlayerToBoost: '',
  preRivalPlayerToWatch: '',
  preImportantDuels: '',
  preAiSupportNotes: '',
  prePlayerNotes: {},
  preRivalPlayerNotes: {},
  preAiAnalysis: null,
  // POST Partido
  postVideoLink: '',
  events: [],
  // PRE Partido - Alineación rival específica
  rivalLineupSystem: '',
  rivalLineupPlayers: [],
};

const emptyTeamForm = {
  name: '',
  sourceUrl: '',
  crest: '',
  stadium: '',
  kitColor: '#ef233c',
  system: '4-4-2',
  squad: [],
};

const emptyLineup = [];
const emptyDepthChart = {};

const normalizeSupabaseJugador = (player) => ({
  id: player.id,
  name: player.name ?? player.nombre ?? '',
  shirtName: player.shirt_name ?? player.nombre_camiseta ?? player.short_name ?? '',
  dob: player.dob ?? player.fecha_nacimiento ?? '',
  number: Number(player.number ?? player.dorsal) || 0,
  position: player.position ?? player.posicion ?? '',
  foot: player.foot ?? player.pierna ?? '',
  image: player.image ?? player.imagen ?? '',
});

async function getJugadores() {
  const { data, error } = await supabase.from("jugadores").select("*")
  if (error) throw error
  return (data || []).map(normalizeSupabaseJugador)
}

const createJugadorPayload = (formState) => ({
  name: formState.name.trim() || 'Jugador sin nombre',
  shirt_name: formState.shirtName.trim(),
  dob: formState.dob,
  number: Number(formState.number) || 0,
  position: formState.position,
  foot: formState.foot,
  image: formState.image.trim(),
});

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

const snakeToCamel = (value) => value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

const mapSnakeRowToCamel = (row) =>
  Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [snakeToCamel(key), value]));

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const safeArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (isPlainObject(value) ? value : {});
const normalizePreAiAnalysis = (value) => {
  if (isPlainObject(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const partidoPreFieldMap = {
  preNotes: 'pre_notes',
  planConBalon: 'plan_con_balon',
  planSinBalon: 'plan_sin_balon',
  planTransiciones: 'plan_transiciones',
  planClave: 'plan_clave',
  planObjetivo: 'plan_objetivo',
  abpEnlace: 'abp_enlace',
  abpOfensiva: 'abp_ofensiva',
  abpDefensiva: 'abp_defensiva',
  preCanvaLink: 'pre_canva_link',
  preRivalReportText: 'pre_rival_report_text',
  preRivalReportExtraction: 'pre_rival_report_extraction',
  preCaudalSystem: 'pre_caudal_system',
  preRivalSystem: 'pre_rival_system',
  preRivalStyle: 'pre_rival_style',
  preRivalStrengths: 'pre_rival_strengths',
  preRivalWeaknesses: 'pre_rival_weaknesses',
  preRivalBuildUp: 'pre_rival_build_up',
  preRivalDefensiveBlock: 'pre_rival_defensive_block',
  preRivalPressure: 'pre_rival_pressure',
  preRivalTransitions: 'pre_rival_transitions',
  preSystemReading: 'pre_system_reading',
  preKeyMatchupsTable: 'pre_key_matchups_table',
  prePlanTrigger: 'pre_plan_trigger',
  prePlanAvoid: 'pre_plan_avoid',
  prePlanAdjustment: 'pre_plan_adjustment',
  preAiAnalysis: 'pre_ai_analysis',
};

const partidoPostFieldMap = {
  postVideoLink: 'post_video_link',
  postNotes: 'post_notes',
  postReality: 'post_reality',
  postFulfilled: 'post_fulfilled',
  postNotFulfilled: 'post_not_fulfilled',
  postWhy: 'post_why',
  postNextAdjustment: 'post_next_adjustment',
  postRepeat: 'post_repeat',
  postImprove: 'post_improve',
  postTrainWeek: 'post_train_week',
  postIndividualObservations: 'post_individual_observations',
  postAiAnalysis: 'post_ai_analysis',
};

const partidoWritableFieldMap = {
  ...partidoPreFieldMap,
  ...partidoPostFieldMap,
};

Object.keys(emptyMatchForm)
  .filter((key) => key.startsWith('preRival') || key.startsWith('preCaudal'))
  .forEach((key) => {
    partidoPreFieldMap[key] = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  });

const normalizeSupabasePartido = (match) =>
  normalizeMatch({
    ...mapSnakeRowToCamel(match),
    id: match.id,
    date: match.date || '',
    time: match.time || '',
    type: match.type || 'Liga',
    round: match.round || '',
    stadium: match.stadium || '',
    opponent: match.opponent || '',
    opponentCrest: match.opponent_crest || '',
    homeTeam: match.home_team || 'C.D. Caudal',
    awayTeam: match.away_team || '',
    isHome: Boolean(match.is_home),
    status: match.status || 'Previa',
    homeScore: match.home_score || '',
    awayScore: match.away_score || '',
    goalsFor: match.goals_for || '',
    goalsAgainst: match.goals_against || '',
    statsSystem: match.stats_system || '4-4-2',
    captainPlayerId: match.captain_player_id || null,
    equipoRivalId: match.equipo_rival_id || null,
  });

const createPartidoPayload = (matchFormState, teams = []) => {
  const selectedTeam = findTeamByDisplayName(teams, matchFormState.opponent);
  const equipoRivalId = isUuid(selectedTeam?.id) ? selectedTeam.id : null;
  return {
    date: matchFormState.date || null,
    time: matchFormState.time || '',
    type: matchFormState.type || 'Liga',
    round: matchFormState.round || '',
    stadium: matchFormState.stadium || '',
    opponent: matchFormState.opponent || '',
    opponent_crest: matchFormState.opponentCrest || '',
    is_home: Boolean(matchFormState.isHome),
    status: matchFormState.status || 'Previa',
    home_team: matchFormState.isHome ? 'C.D. Caudal' : matchFormState.opponent,
    away_team: matchFormState.isHome ? matchFormState.opponent : 'C.D. Caudal',
    home_score: matchFormState.homeScore || '',
    away_score: matchFormState.awayScore || '',
    goals_for: matchFormState.goalsFor || '',
    goals_against: matchFormState.goalsAgainst || '',
    equipo_rival_id: equipoRivalId,
  };
};

const normalizeSupabaseGoalEvent = (event) => ({
  id: event.id,
  partidoId: event.partido_id,
  type: event.type || 'Gol a favor',
  half: event.half || '1ª parte',
  minute: event.minute || '',
  scorer: event.scorer || '',
  assistant: event.assistant || '',
  phase: event.phase || 'Juego combinativo',
  subphase: event.subphase || 'Dentro del área',
  shotZone: event.shot_zone || 'F.Creación centro',
  assistZone: event.assist_zone || 'F.Creación centro',
  goalZone: event.goal_zone || 'Media centro',
  contact: event.contact || 'Pie derecho',
  videoUrl: event.video_url || '',
});

const createGoalEventPayload = (partidoId, draft) => ({
  partido_id: partidoId,
  type: draft.type,
  half: draft.half,
  minute: draft.minute,
  scorer: draft.scorer,
  assistant: draft.assistant,
  phase: draft.phase,
  subphase: draft.subphase,
  shot_zone: draft.shotZone,
  assist_zone: draft.assistZone,
  goal_zone: draft.goalZone,
  contact: draft.contact,
  video_url: draft.videoUrl,
});

const normalizeSupabasePostEventType = (eventType) => ({
  id: eventType.id,
  legacyId: eventType.legacy_id || null,
  name: eventType.name || '',
  color: eventType.color || 'slate',
  isDefault: Boolean(eventType.is_default),
});

const normalizeSupabasePostEvent = (event) => ({
  id: event.id,
  legacyId: event.legacy_id || null,
  tipoEventoId: event.tipo_evento_id || null,
  minute: event.minute || '',
  type: event.type || '',
  description: event.description || '',
  player: event.player || '',
  videoSeconds: Number(event.video_seconds || 0),
});

const delegatedEventDefinitions = [
  { key: 'tiro', tipoEvento: 'tiro', label: 'Tiro', side: 'caudal', needsPlayer: true },
  { key: 'tiro_puerta', tipoEvento: 'tiro_puerta', label: 'Tiro a puerta', side: 'caudal', needsPlayer: true },
  { key: 'corner', tipoEvento: 'corner', label: 'Córner', side: 'caudal', needsPlayer: true },
  { key: 'falta', tipoEvento: 'falta', label: 'Falta', side: 'caudal', needsPlayer: true },
  { key: 'recuperacion', tipoEvento: 'recuperacion', label: 'Recuperación', side: 'caudal', needsPlayer: true },
  { key: 'perdida', tipoEvento: 'perdida', label: 'Pérdida', side: 'caudal', needsPlayer: true },
  { key: 'tiro_rival', tipoEvento: 'tiro_rival', label: 'Tiro rival', side: 'rival', needsPlayer: false },
  { key: 'tiro_puerta_rival', tipoEvento: 'tiro_puerta_rival', label: 'Tiro a puerta rival', side: 'rival', needsPlayer: false },
  { key: 'corner_rival', tipoEvento: 'corner_rival', label: 'Córner rival', side: 'rival', needsPlayer: false },
  { key: 'falta_rival', tipoEvento: 'falta_rival', label: 'Falta rival', side: 'rival', needsPlayer: false },
];

const delegatedCounterPairs = [
  { label: 'Tiros', caudal: 'tiro', rival: 'tiro_rival' },
  { label: 'Tiros puerta', caudal: 'tiro_puerta', rival: 'tiro_puerta_rival' },
  { label: 'Córners', caudal: 'corner', rival: 'corner_rival' },
  { label: 'Faltas', caudal: 'falta', rival: 'falta_rival' },
  { label: 'Recuperaciones', caudal: 'recuperacion', rival: null },
  { label: 'Pérdidas', caudal: 'perdida', rival: null },
];

const quickEventLabelByType = Object.fromEntries(delegatedEventDefinitions.map((definition) => [definition.tipoEvento, definition.label]));

const normalizeSupabaseQuickEvent = (event) => ({
  id: event.id,
  partidoId: event.partido_id,
  jugadorId: event.jugador_id || null,
  equipo: event.equipo || 'caudal',
  tipoEvento: event.tipo_evento || '',
  minute: String(event.minuto ?? ''),
  createdAt: event.created_at || '',
});

const normalizeSupabaseRivalPlayer = (player) => ({
  id: player.id ?? player.legacy_id ?? player.name,
  jugadorRivalId: player.jugador_rival_id ?? player.id ?? null,
  legacyId: player.legacy_id ?? null,
  name: player.name ?? '',
  image: player.image ?? '',
  number: player.number ?? '',
  position: player.position ?? '',
  age: player.age ?? '',
  role: player.role ?? 'Reserva',
  isKey: Boolean(player.is_key ?? player.isKey),
  yellowRisk: Boolean(player.yellow_risk ?? player.yellowRisk),
  suspended: Boolean(player.suspended),
  injured: Boolean(player.injured),
});

const createRivalPlayerPayload = (teamId, player) => ({
  equipo_rival_id: teamId,
  legacy_id: player.legacyId ?? (!isUuid(player.id) ? String(player.id || player.name) : null),
  name: player.name,
  image: player.image || '',
  number: String(player.number || ''),
  position: player.position || '',
  age: String(player.age || ''),
  role: player.role || 'Reserva',
  is_key: Boolean(player.isKey),
  yellow_risk: Boolean(player.yellowRisk),
  suspended: Boolean(player.suspended),
  injured: Boolean(player.injured),
});

const createRivalTeamPayload = (teamFormState, importedData) => ({
  name: cleanTeamDisplayName(teamFormState.name.trim() || importedData?.name || 'Equipo sin nombre'),
  source_url: normalizeSourceUrl(teamFormState.sourceUrl) || '',
  crest: importedData?.crest || teamFormState.crest || '',
  stadium: importedData?.stadium || teamFormState.stadium.trim(),
  kit_color: importedData?.kitColor || teamFormState.kitColor || '#ef233c',
  system: teamFormState.system || '4-4-2',
});

const sanitizeStorageName = (value) =>
  String(value || 'archivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.-]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

const uploadPublicFile = async ({ bucket, file, folder = '' }) => {
  if (!file) return '';
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const baseName = sanitizeStorageName(file.name.replace(/\.[^.]+$/, ''));
  const storagePath = [folder, `${Date.now()}-${baseName}.${extension}`].filter(Boolean).join('/');
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
};

const getDominantImageColor = async (imageUrl) => {
  if (!imageUrl) return '';
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return '';
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const colors = new Map();

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 180) continue;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red > 235 && green > 235 && blue > 235) continue;
      if (red < 20 && green < 20 && blue < 20) continue;
      const bucket = [red, green, blue].map((value) => Math.round(value / 32) * 32).join(',');
      colors.set(bucket, (colors.get(bucket) || 0) + 1);
    }

    bitmap.close?.();
    const dominant = Array.from(colors.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!dominant) return '';
    const [red, green, blue] = dominant.split(',').map(Number);
    return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return '';
  }
};

const formationLayouts = {
  '4-4-2': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Lateral izquierdo', x: 18, y: 73 },
    { role: 'Central izquierdo', x: 39, y: 73 },
    { role: 'Central derecho', x: 61, y: 73 },
    { role: 'Lateral derecho', x: 82, y: 73 },
    { role: 'Extremo izquierdo', x: 18, y: 45 },
    { role: 'Mediocentro', x: 39, y: 45 },
    { role: 'Mediocentro', x: 61, y: 45 },
    { role: 'Extremo derecho', x: 82, y: 45 },
    { role: 'Delantero', x: 42, y: 16 },
    { role: 'Delantero', x: 58, y: 16 },
  ],
  '4-2-3-1': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Lateral izquierdo', x: 18, y: 73 },
    { role: 'Central izquierdo', x: 39, y: 73 },
    { role: 'Central derecho', x: 61, y: 73 },
    { role: 'Lateral derecho', x: 82, y: 73 },
    { role: 'Mediocentro', x: 39, y: 52 },
    { role: 'Mediocentro', x: 61, y: 52 },
    { role: 'Extremo izquierdo', x: 18, y: 32 },
    { role: 'Mediapunta', x: 50, y: 32 },
    { role: 'Extremo derecho', x: 82, y: 32 },
    { role: 'Delantero', x: 50, y: 14 },
  ],
  '4-3-3': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Lateral izquierdo', x: 18, y: 73 },
    { role: 'Central izquierdo', x: 39, y: 73 },
    { role: 'Central derecho', x: 61, y: 73 },
    { role: 'Lateral derecho', x: 82, y: 73 },
    { role: 'Pivote', x: 50, y: 56 },
    { role: 'Interior izquierdo', x: 38, y: 40 },
    { role: 'Interior derecho', x: 62, y: 40 },
    { role: 'Extremo izquierdo', x: 20, y: 18 },
    { role: 'Delantero', x: 50, y: 14 },
    { role: 'Extremo derecho', x: 80, y: 18 },
  ],
  '3-5-2': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Central izquierdo', x: 28, y: 73 },
    { role: 'Central', x: 50, y: 75 },
    { role: 'Central derecho', x: 72, y: 73 },
    { role: 'Pivote', x: 50, y: 56 },
    { role: 'Carrilero izquierdo', x: 14, y: 43 },
    { role: 'Interior izquierdo', x: 38, y: 38 },
    { role: 'Interior derecho', x: 62, y: 38 },
    { role: 'Carrilero derecho', x: 86, y: 43 },
    { role: 'Delantero', x: 42, y: 16 },
    { role: 'Delantero', x: 58, y: 16 },
  ],
  '3-4-3': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Central izquierdo', x: 28, y: 73 },
    { role: 'Central', x: 50, y: 75 },
    { role: 'Central derecho', x: 72, y: 73 },
    { role: 'Carrilero izquierdo', x: 16, y: 48 },
    { role: 'Mediocentro', x: 40, y: 48 },
    { role: 'Mediocentro', x: 60, y: 48 },
    { role: 'Carrilero derecho', x: 84, y: 48 },
    { role: 'Extremo izquierdo', x: 22, y: 18 },
    { role: 'Delantero', x: 50, y: 14 },
    { role: 'Extremo derecho', x: 78, y: 18 },
  ],
  '3-4-1-2': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Central izquierdo', x: 28, y: 73 },
    { role: 'Central', x: 50, y: 75 },
    { role: 'Central derecho', x: 72, y: 73 },
    { role: 'Carrilero izquierdo', x: 16, y: 48 },
    { role: 'Mediocentro', x: 40, y: 50 },
    { role: 'Mediocentro', x: 60, y: 50 },
    { role: 'Carrilero derecho', x: 84, y: 48 },
    { role: 'Mediapunta', x: 50, y: 31 },
    { role: 'Delantero', x: 42, y: 14 },
    { role: 'Delantero', x: 58, y: 14 },
  ],
  '5-3-2': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Carrilero izquierdo', x: 12, y: 73 },
    { role: 'Central izquierdo', x: 32, y: 75 },
    { role: 'Central', x: 50, y: 76 },
    { role: 'Central derecho', x: 68, y: 75 },
    { role: 'Carrilero derecho', x: 88, y: 73 },
    { role: 'Interior izquierdo', x: 34, y: 45 },
    { role: 'Pivote', x: 50, y: 49 },
    { role: 'Interior derecho', x: 66, y: 45 },
    { role: 'Delantero', x: 42, y: 16 },
    { role: 'Delantero', x: 58, y: 16 },
  ],
  '5-4-1': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Carrilero izquierdo', x: 12, y: 73 },
    { role: 'Central izquierdo', x: 32, y: 75 },
    { role: 'Central', x: 50, y: 76 },
    { role: 'Central derecho', x: 68, y: 75 },
    { role: 'Carrilero derecho', x: 88, y: 73 },
    { role: 'Extremo izquierdo', x: 18, y: 45 },
    { role: 'Mediocentro', x: 40, y: 45 },
    { role: 'Mediocentro', x: 60, y: 45 },
    { role: 'Extremo derecho', x: 82, y: 45 },
    { role: 'Delantero', x: 50, y: 14 },
  ],
};

const getFormationLayout = (system) => formationLayouts[system] ?? formationLayouts['4-4-2'];
const getFormationCoordinates = (system) => getFormationLayout(system).map(({ x, y }) => ({ x, y }));
const getFormationRoles = (system) => getFormationLayout(system).map(({ role }) => role);

const getSystemProfile = (system) => {
  const parts = String(system || '4-4-2')
    .split('-')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
  const defenders = parts[0] ?? 4;
  const attackers = parts[parts.length - 1] ?? 2;
  const midfielders = parts.slice(1, -1).reduce((sum, part) => sum + part, 0) || 4;
  return {
    defenders,
    midfielders,
    attackers,
    hasBackFive: defenders >= 5,
    hasBackThree: defenders === 3,
    hasDoublePivot: String(system).includes('2-3') || String(system).includes('2-'),
    hasThreeMidfielders: midfielders >= 3,
    hasWideFrontThree: attackers === 3,
  };
};

const tacticalRoles = getFormationRoles('4-4-2');

const getCaudalPitchNames = (lineup, fallbackPlayers = [], fallbackRoles = tacticalRoles) => {
  const basePlayers = lineup?.length ? lineup : fallbackPlayers;
  return Array.from({ length: 11 }, (_, index) => basePlayers[index] || fallbackRoles[index] || `Jugador ${index + 1}`);
};

const valueOrMissing = (value) => value || 'FALTA DATO';
const formatLineupForPrompt = (system, lineup) =>
  getFormationRoles(system)
    .map((role, index) => `${role}: ${lineup?.[index] || 'FALTA JUGADOR'}`)
    .join('\n');

const getReportLineValue = (text, labels) => {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`^(?:${labelPattern})\\s*[:\\-–]\\s*(.+)$`, 'i');
  const match = lines.map((line) => line.match(regex)).find(Boolean);
  return match?.[1]?.trim() || '';
};

const findReportSentence = (text, keywords) => {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  return String(text || '')
    .split(/[\n.;]+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => normalizedKeywords.some((keyword) => sentence.toLowerCase().includes(keyword))) || '';
};

const detectReportOption = (text, options, fallback = '') => {
  const lower = String(text || '').toLowerCase();
  return options.find((option) => lower.includes(option.toLowerCase())) || fallback;
};

const extractRivalReportData = (text) => {
  const source = String(text || '').trim();
  const systemMatch = source.match(/\b[1-5]-[1-5]-[1-5](?:-[1-5])?\b/);
  const fields = {
    preRivalSystem: getReportLineValue(source, ['sistema rival', 'sistema', 'dibujo', 'formación', 'formacion']) || systemMatch?.[0] || '',
    preRivalBaseSystem: getReportLineValue(source, ['sistema con balón', 'sistema con balon', 'sistema base', 'estructura ofensiva']) || '',
    preRivalStyle: getReportLineValue(source, ['estilo', 'cómo juega', 'como juega', 'modelo rival']) || findReportSentence(source, ['directo', 'combinativo', 'posesión', 'posesion', 'bloque']),
    preRivalStrengths: getReportLineValue(source, ['fortalezas', 'puntos fuertes', 'fuerte en', 'virtudes']) || findReportSentence(source, ['fortaleza', 'punto fuerte', 'destaca', 'peligro']),
    preRivalWeaknesses: getReportLineValue(source, ['debilidades', 'puntos débiles', 'puntos debiles', 'sufre en', 'débil en', 'debil en']) || findReportSentence(source, ['debilidad', 'sufre', 'espacio', 'espalda']),
    preRivalBuildUp: detectReportOption(source, ['Combinativo', 'Directo', 'Mixto'], ''),
    preRivalDefensiveBlock: detectReportOption(source, ['Alto', 'Medio', 'Bajo'], ''),
    preRivalPressure: findReportSentence(source, ['presión alta', 'presion alta']) ? 'Alta' : findReportSentence(source, ['presión baja', 'presion baja']) ? 'Baja' : findReportSentence(source, ['presión media', 'presion media']) ? 'Media' : '',
    preRivalTransitions: detectReportOption(source, ['Directas', 'Equilibradas', 'Pausadas'], ''),
    preRivalOffensiveOrganization: getReportLineValue(source, ['organización ofensiva', 'organizacion ofensiva', 'ataque organizado']) || findReportSentence(source, ['con balón', 'con balon', 'organización ofensiva', 'organizacion ofensiva']),
    preRivalStartPlay: getReportLineValue(source, ['salida', 'inicio de juego', 'cómo inicia', 'como inicia']) || findReportSentence(source, ['salida', 'inicia', 'portero', 'centrales']),
    preRivalProgression: getReportLineValue(source, ['progresión', 'progresion', 'cómo progresa', 'como progresa']) || findReportSentence(source, ['progresa', 'tercer hombre', 'por dentro', 'por fuera']),
    preRivalFinishing: getReportLineValue(source, ['finalización', 'finalizacion', 'cómo finaliza', 'como finaliza']) || findReportSentence(source, ['centro', 'pase atrás', 'pase atras', 'remate', 'finaliza']),
    preRivalOffensiveKeyPlayers: getReportLineValue(source, ['jugadores clave', 'jugadores clave ofensivos', 'amenazas', 'referentes']) || '',
    preRivalDangerZones: getReportLineValue(source, ['zonas de peligro', 'dónde genera peligro', 'donde genera peligro', 'zona fuerte']) || findReportSentence(source, ['banda', 'intervalo', 'frontal', 'espalda']),
    preRivalDefensiveOrganization: getReportLineValue(source, ['organización defensiva', 'organizacion defensiva', 'sin balón', 'sin balon']) || findReportSentence(source, ['sin balón', 'sin balon', 'defiende', 'bloque']),
    preRivalPressureType: getReportLineValue(source, ['tipo de presión', 'tipo de presion', 'presión', 'presion']) || findReportSentence(source, ['hombre a hombre', 'orientada', 'pivote', 'presión']),
    preRivalSpacesAllowed: getReportLineValue(source, ['espacios que deja', 'dónde deja espacios', 'donde deja espacios', 'espacios concedidos']) || findReportSentence(source, ['deja espacio', 'espalda', 'lado débil', 'lado debil', 'entre líneas', 'entre lineas']),
    preRivalDefendsCrosses: getReportLineValue(source, ['defiende centros', 'cómo defiende centros', 'como defiende centros']) || findReportSentence(source, ['centros', 'área', 'area', 'primer palo', 'segundo palo']),
    preRivalDefendsBack: getReportLineValue(source, ['defiende espalda', 'espalda centrales', 'defiende espalda de centrales']) || findReportSentence(source, ['espalda de centrales', 'línea alta', 'linea alta', 'cobertura']),
    preRivalAfterLoss: getReportLineValue(source, ['tras pérdida', 'tras perdida', 'después de perder', 'despues de perder']) || findReportSentence(source, ['tras pérdida', 'tras perdida', 'repliega', 'presiona tras pérdida']),
    preRivalAfterRecovery: getReportLineValue(source, ['tras robo', 'tras recuperación', 'tras recuperacion', 'después de robar', 'despues de robar']) || findReportSentence(source, ['tras robo', 'transición', 'transicion', 'primer pase']),
    preRivalTransitionLaunchers: getReportLineValue(source, ['lanzadores transición', 'lanzadores transicion', 'lanzadores', 'quién corre', 'quien corre']) || '',
    preRivalCornersFor: getReportLineValue(source, ['córners ofensivos', 'corners ofensivos', 'abp ofensiva', 'balón parado ofensivo', 'balon parado ofensivo']) || findReportSentence(source, ['córner ofensivo', 'corner ofensivo', 'abp ofensiva']),
    preRivalCornersAgainst: getReportLineValue(source, ['córners defensivos', 'corners defensivos', 'abp defensiva', 'balón parado defensivo', 'balon parado defensivo']) || findReportSentence(source, ['córner defensivo', 'corner defensivo', 'abp defensiva']),
  };
  const cleanedFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => String(value || '').trim()));
  return {
    fields: cleanedFields,
    detectedCount: Object.keys(cleanedFields).length,
    sourceLength: source.length,
  };
};

const buildTacticalPrompt = ({ match, caudalSystem, rivalSystem, caudalLineup, rivalLineup, questionnaire, playerNotes = {}, rivalNotes = {} }) => {
  const sections = [
    ['Contexto', [
      `Partido: C.D. Caudal vs ${valueOrMissing(match?.opponent)}`,
      `Sistema C.D. Caudal: ${caudalSystem}`,
      `Sistema rival: ${rivalSystem}`,
    ]],
    ['Alineacion C.D. Caudal', [formatLineupForPrompt(caudalSystem, caudalLineup)]],
    ['Alineacion rival', [formatLineupForPrompt(rivalSystem, rivalLineup)]],
    ['Resumen actual', [
      `Como juega el rival: ${valueOrMissing(questionnaire.preRivalStyle)}`,
      `Nuestra intencion para ganar: ${valueOrMissing(questionnaire.preCaudalIntent)}`,
      `Fortalezas rival: ${valueOrMissing(questionnaire.preRivalStrengths)}`,
      `Debilidades rival: ${valueOrMissing(questionnaire.preRivalWeaknesses)}`,
      `Salida rival: ${valueOrMissing(questionnaire.preRivalBuildUp)}`,
      `Bloque defensivo rival: ${valueOrMissing(questionnaire.preRivalDefensiveBlock)}`,
      `Presion rival: ${valueOrMissing(questionnaire.preRivalPressure)}`,
      `Transiciones rival: ${valueOrMissing(questionnaire.preRivalTransitions)}`,
    ]],
    ['Rival con balon', [
      `Organizacion ofensiva: ${valueOrMissing(questionnaire.preRivalOffensiveOrganization)}`,
      `Sistema base: ${valueOrMissing(questionnaire.preRivalBaseSystem)}`,
      `Como inicia: ${valueOrMissing(questionnaire.preRivalStartPlay)}`,
      `Como progresa: ${valueOrMissing(questionnaire.preRivalProgression)}`,
      `Como finaliza: ${valueOrMissing(questionnaire.preRivalFinishing)}`,
      `Jugadores clave ofensivos: ${valueOrMissing(questionnaire.preRivalOffensiveKeyPlayers)}`,
      `Donde genera peligro: ${valueOrMissing(questionnaire.preRivalDangerZones)}`,
      `Como ataca bandas: ${valueOrMissing(questionnaire.preRivalWideAttack)}`,
      `Como ocupa area: ${valueOrMissing(questionnaire.preRivalBoxOccupation)}`,
    ]],
    ['Rival sin balon', [
      `Organizacion defensiva: ${valueOrMissing(questionnaire.preRivalDefensiveOrganization)}`,
      `Sistema defensivo: ${valueOrMissing(questionnaire.preRivalDefensiveSystem)}`,
      `Altura del bloque: ${valueOrMissing(questionnaire.preRivalBlockHeightDetail)}`,
      `Tipo de presion: ${valueOrMissing(questionnaire.preRivalPressureType)}`,
      `Donde deja espacios: ${valueOrMissing(questionnaire.preRivalSpacesAllowed)}`,
      `Como defiende centros: ${valueOrMissing(questionnaire.preRivalDefendsCrosses)}`,
      `Como defiende espalda centrales: ${valueOrMissing(questionnaire.preRivalDefendsBack)}`,
      `Como defiende segunda jugada: ${valueOrMissing(questionnaire.preRivalSecondBallDefense)}`,
    ]],
    ['Transiciones', [
      `Rival tras perdida: ${valueOrMissing(questionnaire.preRivalAfterLoss)}`,
      `Rival tras robo: ${valueOrMissing(questionnaire.preRivalAfterRecovery)}`,
      `Lanzadores transicion rival: ${valueOrMissing(questionnaire.preRivalTransitionLaunchers)}`,
      `Zonas donde corre mejor: ${valueOrMissing(questionnaire.preRivalBestRunningZones)}`,
      `Caudal tras perdida: ${valueOrMissing(questionnaire.preCaudalAfterLoss)}`,
      `Caudal tras robo: ${valueOrMissing(questionnaire.preCaudalAfterRecovery)}`,
    ]],
    ['ABP rival', [
      `Corners ofensivos: ${valueOrMissing(questionnaire.preRivalCornersFor)}`,
      `Corners defensivos: ${valueOrMissing(questionnaire.preRivalCornersAgainst)}`,
      `Faltas laterales: ${valueOrMissing(questionnaire.preRivalWideFreeKicks)}`,
      `Lanzadores: ${valueOrMissing(questionnaire.preRivalSetPieceTakers)}`,
      `Rematadores principales: ${valueOrMissing(questionnaire.preRivalMainHeaders)}`,
    ]],
    ['Nuestro plan', [
      `Plan con balon: ${valueOrMissing(questionnaire.preCaudalBuildPlan)}`,
      `Como iniciar: ${valueOrMissing(questionnaire.preCaudalStartPlay)}`,
      `Por donde progresar: ${valueOrMissing(questionnaire.preCaudalProgressionPlan)}`,
      `Donde atacar: ${valueOrMissing(questionnaire.preCaudalAttackZones)}`,
      `Jugadores a activar: ${valueOrMissing(questionnaire.preCaudalPlayersToActivate)}`,
      `Espacios a buscar: ${valueOrMissing(questionnaire.preCaudalSpacesToFind)}`,
      `Donde presionar: ${valueOrMissing(questionnaire.preCaudalPressPlan)}`,
      `Rivales a tapar: ${valueOrMissing(questionnaire.preCaudalRivalsToBlock)}`,
      `Como defender puntos fuertes: ${valueOrMissing(questionnaire.preCaudalDefendStrengths)}`,
      `Que evitar: ${valueOrMissing(questionnaire.preCaudalAvoid)}`,
    ]],
    ['Duelos individuales', [
      `Emparejamientos clave: ${valueOrMissing(questionnaire.preKeyMatchups)}`,
      `Jugador nuestro a potenciar: ${valueOrMissing(questionnaire.preCaudalPlayerToBoost)}`,
      `Jugador rival a vigilar: ${valueOrMissing(questionnaire.preRivalPlayerToWatch)}`,
      `Duelos importantes: ${valueOrMissing(questionnaire.preImportantDuels)}`,
      `Notas jugadores Caudal: ${JSON.stringify(playerNotes)}`,
      `Caracteristicas jugadores rivales: ${JSON.stringify(rivalNotes)}`,
    ]],
    ['Informacion adicional para la IA', [
      valueOrMissing(questionnaire.preAiSupportNotes),
    ]],
  ];

  return [
    'Actua como analista tactico profesional para el cuerpo tecnico del C.D. Caudal.',
    'Reglas obligatorias:',
    '- No dar respuestas genericas.',
    '- Cada idea debe explicar donde, por que y que hacer.',
    '- Usar lenguaje de entrenador.',
    '- Dar acciones concretas.',
    '- No inventar jugadores si no estan en los datos.',
    '- Si falta informacion, decir que dato falta.',
    '- Cada bloque debe tener exactamente 3 frases verdes de HACER y 3 frases rojas de EVITAR.',
    '- Las frases verdes deben empezar con una accion concreta y las rojas con una alerta concreta.',
    '- Ventajas y riesgos deben comparar el sistema del C.D. Caudal con el sistema rival.',
    '- Como atacar debe dividirse en FASE INICIACION, FASE CREACION y FASE FINALIZACION.',
    '- Como defender debe dividirse en B.BAJO, B.MEDIO y B.ALTO, indicando cual es el bloque mas recomendable.',
    '- Ajustes debe proponer cambios de tipo de juego, alturas de presion o sistema si el partido cambia.',
    '',
    'Devuelve el analisis con esta estructura:',
    '1. LECTURA GENERAL: 3 HACER y 3 EVITAR',
    '2. VENTAJAS: 3 HACER y 3 EVITAR comparando sistemas',
    '3. RIESGOS: 3 HACER y 3 EVITAR comparando sistemas',
    '4. COMO ATACAR: FASE INICIACION, FASE CREACION y FASE FINALIZACION; cada fase con 3 HACER y 3 EVITAR',
    '5. COMO DEFENDER: B.BAJO, B.MEDIO y B.ALTO; cada bloque con 3 HACER y 3 EVITAR e indicar el recomendado',
    '6. TRANSICIONES: 3 HACER y 3 EVITAR',
    '7. DUELOS INDIVIDUALES: 3 HACER y 3 EVITAR',
    '8. PLAN DE PARTIDO: 3 HACER y 3 EVITAR',
    '9. AJUSTES: 3 HACER y 3 EVITAR',
    '',
    ...sections.flatMap(([title, lines]) => [`## ${title}`, ...lines, '']),
  ].join('\n');
};

const buildPlayerAdvice = ({ playerName, playerIndex, caudalSystem, rivalSystem, questionnaire, playerProfile, playerNotes, rivalName, rivalNotes, role }) => {
  const playerRole = role || getFormationRoles(caudalSystem)[playerIndex] || 'Jugador';
  const rivalBlock = questionnaire.preRivalDefensiveBlock || 'Medio';
  const rivalPressure = questionnaire.preRivalPressure || 'Media';
  const rivalWeaknesses = questionnaire.preRivalWeaknesses || 'espacios entre líneas y espalda de laterales';
  const caudalIntent = questionnaire.preCaudalIntent || 'competir con equipo corto y ataques claros';
  const profileText = [playerProfile?.position, playerProfile?.foot ? `pierna ${playerProfile.foot.toLowerCase()}` : '', playerNotes].filter(Boolean).join(', ');

  return [
    `${playerName}: actuar como ${playerRole.toLowerCase()} dentro del ${caudalSystem}, con prioridad en sostener el plan: ${caudalIntent}.`,
    profileText ? `Perfil usado por la IA: ${profileText}.` : 'Añade una nota individual para que la recomendación sea más precisa.',
    rivalName ? `Duelo probable: ${rivalName}${rivalNotes ? ` (${rivalNotes})` : ''}.` : 'Asigna jugadores rivales para que la IA detecte duelos directos.',
    rivalPressure === 'Alta'
      ? 'Primer control orientado y apoyo cercano para superar presión; si no hay pase limpio, jugar a zona de segunda jugada.'
      : `Atraer a su par y acelerar cuando aparezca ${rivalWeaknesses}.`,
    rivalBlock === 'Bajo'
      ? 'Aportar paciencia, amplitud y llegada al área; no precipitar centros sin ocupación de remate.'
      : `Buscar ventajas entre líneas contra el ${rivalSystem} y cerrar rápido tras pérdida.`,
  ];
};

const createTacticalBlock = (up, down) => ({
  up: up.slice(0, 3),
  down: down.slice(0, 3),
});

const createIndividualTacticalBlock = ({ upAttack, upDefense, downAttack, downDefense }) => ({
  upAttack: upAttack.slice(0, 3),
  upDefense: upDefense.slice(0, 3),
  downAttack: downAttack.slice(0, 3),
  downDefense: downDefense.slice(0, 3),
});

const buildPlayerTacticalAdvice = ({ playerName, playerIndex, caudalSystem, rivalSystem, questionnaire, playerProfile, playerNotes, rivalName, rivalNotes, role }) => {
  const playerRole = role || getFormationRoles(caudalSystem)[playerIndex] || playerProfile?.position || 'Jugador';
  const rivalBlock = questionnaire.preRivalDefensiveBlock || 'Medio';
  const rivalWeaknesses = questionnaire.preRivalWeaknesses || 'los espacios entre líneas y la espalda de los laterales';
  const rivalStrengths = questionnaire.preRivalStrengths || 'su orden defensivo y la transición tras robo';
  const likelyZone = questionnaire.preCaudalAttackZones || (/Extremo|Lateral/i.test(playerRole) ? 'el carril exterior y el intervalo lateral-central' : 'la zona interior y la espalda del mediocentro rival');
  const rivalReference = rivalName ? `${rivalName}${rivalNotes ? ` (${rivalNotes})` : ''}` : `el rival de su zona dentro del ${rivalSystem}`;
  const profileDetail = [playerProfile?.foot ? `su pierna ${playerProfile.foot.toLowerCase()}` : '', playerNotes].filter(Boolean).join(' y ');

  return createIndividualTacticalBlock({
    upAttack: [
      `${playerName}: jugar como ${playerRole.toLowerCase()} entendiendo dónde queda libre ${likelyZone} ante el ${rivalSystem}.`,
      rivalBlock === 'Bajo'
        ? 'Recibir con paciencia, fijar a su marca y acelerar solo cuando aparezca pase interior o ruptura clara.'
        : 'Orientar el primer control para superar presión y conectar rápido con el apoyo cercano.',
      profileDetail
        ? `Usar ${profileDetail} para ganar ventaja en el duelo con ${rivalReference}.`
        : `Tomar como referencia a ${rivalReference}: fijarlo, moverlo y atacar su espalda cuando mire balón.`,
    ],
    upDefense: [
      `Tras pérdida, cerrar primero el pase interior de ${rivalReference} y después ajustar la marca.`,
      `Defender perfilado para ver balón y rival; si ${rivalReference} ataca espacio, temporizar hasta la ayuda.`,
      `Comunicar coberturas con el compañero cercano para que el ${rivalSystem} no encuentre superioridad en su zona.`,
    ],
    downAttack: [
      `No recibir parado y de espaldas si no hay descarga cerca, porque el ${rivalSystem} puede encerrarlo.`,
      `No conducir hacia la presión de ${rivalReference}; atraer y soltar antes de quedar encerrado.`,
      `No forzar acciones individuales contra dos rivales si el punto fuerte rival es ${rivalStrengths}.`,
    ],
    downDefense: [
      'No abandonar su zona tras atacar; primero equilibrar y después pensar en una segunda acción ofensiva.',
      `No saltar a ${rivalReference} si el pase interior queda libre a su espalda.`,
      'No mirar solo balón en centros o cambios de orientación; controlar marca, área útil y segunda jugada.',
    ],
  });
};

const buildTacticalAnalysis = ({ caudalSystem, rivalSystem, caudalLineup, rivalLineup = [], questionnaire, playerProfiles = [], playerNotes = {}, rivalProfiles = [], rivalNotes = {} }) => {
  const caudal = getSystemProfile(caudalSystem);
  const rival = getSystemProfile(rivalSystem);
  const caudalWide = caudal.hasWideFrontThree || caudal.midfielders >= 4;
  const rivalWideRisk = rival.hasBackThree || rival.hasBackFive;
  const caudalHasBackFour = caudal.defenders === 4;
  const rivalHasBackFour = rival.defenders === 4;
  const wantsPress = questionnaire.preRivalBuildUp === 'Combinativo' || questionnaire.preRivalPressure === 'Baja';
  const wantsDirect = questionnaire.preRivalTransitions === 'Directas' || /direct|largo|segunda/i.test(questionnaire.preRivalStyle || '');
  const wantsPossession = /posesi|combin|asoci|pausa/i.test(questionnaire.preCaudalIntent || '');
  const caudalRoles = getFormationRoles(caudalSystem);
  const rivalRoles = getFormationRoles(rivalSystem);
  const caudalNames = getCaudalPitchNames(caudalLineup, [], caudalRoles);
  const rivalNames = getCaudalPitchNames(rivalLineup, [], rivalRoles);
  const rivalThreats = rivalNames
    .filter((name) => rivalNotes[name])
    .slice(0, 3)
    .map((name) => `${name}: ${rivalNotes[name]}`);
  const weakness = questionnaire.preRivalWeaknesses || 'los espacios a espalda de sus laterales y el intervalo central-lateral';
  const strength = questionnaire.preRivalStrengths || 'su organización defensiva y salida tras robo';
  const block = questionnaire.preRivalDefensiveBlock || 'Medio';
  const likelyAttackZone = questionnaire.preCaudalAttackZones || (rival.hasBackThree ? 'los costados de sus centrales exteriores' : 'la espalda de sus laterales');
  const playerToActivate = questionnaire.preCaudalPlayersToActivate || caudalNames.find((name, index) => /Extremo|Mediapunta|Delantero|Interior/.test(caudalRoles[index])) || caudalNames[10];
  const rivalToLimit = questionnaire.preCaudalRivalsToBlock || rivalNames.find((name, index) => /Pivote|Mediapunta|Delantero/.test(rivalRoles[index])) || rivalNames[6];
  const dangerZone = questionnaire.preRivalDangerZones || (rival.attackers >= 3 ? 'sus extremos atacando la espalda de nuestros laterales' : 'la zona de segunda jugada alrededor de nuestros centrales');
  const avoidScenario = questionnaire.preCaudalAvoid || 'pérdidas interiores con el equipo abierto';
  const afterLossPlan = questionnaire.preCaudalAfterLoss || 'presión inmediata del jugador más cercano y cierre del pase interior por los mediocentros';
  const afterRecoveryPlan = questionnaire.preCaudalAfterRecovery || 'primer pase vertical si el rival está abierto y pausa si el robo llega en zona baja';
  const transitionLaunchers = questionnaire.preRivalTransitionLaunchers || rivalNames.filter((name, index) => /Pivote|Interior|Mediapunta|Delantero|Extremo/.test(rivalRoles[index])).slice(0, 2).join(' y ');
  const recommendedDefensiveBlock = wantsDirect ? 'B.MEDIO' : wantsPress ? 'B.ALTO' : 'B.MEDIO';
  const caudalMidfieldText = caudal.midfielders >= rival.midfielders ? 'igualdad o superioridad interior' : 'inferioridad interior si no juntamos líneas';
  const widthText = caudalWide || rivalWideRisk ? 'la amplitud y los cambios de orientación' : 'los apoyos interiores antes de activar banda';

  return {
    generalReading: [
      `Partido entre ${caudalSystem} y ${rivalSystem}: la clave será relacionar nuestra estructura con los espacios que deja el rival.`,
      rival.midfielders > caudal.midfielders
        ? 'El rival puede juntar más gente por dentro; conviene atraerle a un lado y salir rápido al lado débil.'
        : 'Tenemos buena base para no quedar partidos por dentro; la diferencia puede estar en activar extremos/laterales con ventaja.',
      caudalHasBackFour && !rivalHasBackFour
        ? 'Nuestra línea de cuatro puede encontrar superioridad en banda si el extremo fija y el lateral llega con timing.'
        : 'El partido pide controlar distancias entre líneas para no conceder recepciones limpias a la espalda de los mediocentros.',
    ],
    winPlan: [
      `La mejor manera de ganar es atacar ${weakness}, pero protegiendo pérdidas porque su punto fuerte es ${strength}.`,
      block === 'Bajo'
        ? 'Moverlos de lado a lado, cargar área con tres alturas y finalizar jugadas para evitar contras.'
        : 'Atraer presión, encontrar hombre libre por dentro y atacar rápido la espalda de la última línea.',
      wantsPress
        ? 'Presión tras pérdida de 5 segundos y saltos coordinados sobre central-lateral-pivote para robar cerca de portería.'
        : 'Bloque medio compacto, orientar fuera y acelerar tras robo con primer pase vertical.',
      rivalThreats.length
        ? `Atención especial a ${rivalThreats.join(' / ')}.`
        : 'Completa características de jugadores rivales para afinar amenazas y emparejamientos.',
    ],
    collective: [
      caudal.midfielders >= rival.midfielders
        ? `Mantener superioridad o igualdad por dentro: ${caudalSystem} puede proteger la zona central ante ${rivalSystem}.`
        : `Compensar inferioridad interior: juntar extremo, lateral y mediocentro para no partir el equipo ante ${rivalSystem}.`,
      caudalWide || rivalWideRisk
        ? 'Atacar cambios de orientación y el intervalo lateral-central; ahí pueden aparecer ventajas antes de que bascule el rival.'
        : 'Progresar con paciencia por dentro y activar bandas cuando el rival cierre el carril central.',
      wantsPress
        ? 'Si la idea es presionar alto, saltar sobre central orientado a banda y cerrar pase interior con el pivote.'
        : 'Bloque medio preparado para robar y correr; no regalar espacios a la espalda de los mediocentros.',
    ],
    individualByPlayer: caudalNames.map((playerName, playerIndex) => {
      const playerProfile = playerProfiles.find((player) => player.name === playerName);
      const rivalName = rivalNames[playerIndex];
      const basePayload = {
        playerName,
        playerIndex,
        caudalSystem,
        rivalSystem,
        questionnaire,
        playerProfile,
        playerNotes: playerNotes[playerName],
        rivalName,
        rivalNotes: rivalNotes[rivalName],
        role: caudalRoles[playerIndex],
      };

      return {
        playerName,
        role: caudalRoles[playerIndex] || 'Jugador',
        advice: buildPlayerAdvice(basePayload),
        tacticalAdvice: buildPlayerTacticalAdvice(basePayload),
      };
    }),
    tacticalBlocks: [
      {
        title: 'Lectura general',
        ...createTacticalBlock(
          [
            `Relacionar nuestro ${caudalSystem} con su ${rivalSystem}: atacar donde aparezca ${weakness}.`,
            block === 'Bajo'
              ? 'Mover el bloque rival con paciencia, cambios de orientación y llegadas desde segunda línea.'
              : 'Atraer la presión rival y acelerar cuando aparezca el hombre libre por dentro.',
            `Cerrar el equipo tras cada ataque para que ${strength} no aparezca en campo abierto.`,
          ],
          [
            `No partir al equipo entre mediocentros y delanteros, porque el ${rivalSystem} puede recibir entre líneas.`,
            `No atacar siempre por el mismo carril; si el rival bascula cómodo, nos obliga a centros forzados.`,
            `No perder por dentro con laterales altos: ahí aparece ${avoidScenario}.`,
          ],
        ),
      },
      {
        title: 'Ventajas',
        ...createTacticalBlock(
          [
            `Usar el ${caudalSystem} para generar ${caudalMidfieldText} ante su ${rivalSystem}.`,
            `Atacar ${likelyAttackZone} cuando su línea defensiva salte tarde o quede abierta.`,
            `Activar a ${playerToActivate} tras atraer en un lado, no desde una recepción aislada.`,
          ],
          [
            `No convertir la ventaja del sistema en posesión plana sin profundidad.`,
            `No dejar solo al receptor entre líneas; necesita apoyo cercano y amenaza a la espalda.`,
            `No permitir que el ${rivalSystem} nos iguale con duelos directos en banda sin cobertura interior.`,
          ],
        ),
      },
      {
        title: 'Riesgos',
        ...createTacticalBlock(
          [
            `Proteger ${dangerZone} antes de que el rival active sus carreras.`,
            `Tapar a ${rivalToLimit} con orientación corporal hacia fuera y ayuda del mediocentro cercano.`,
            `Ajustar la espalda de laterales si nuestro ${caudalSystem} queda abierto al atacar.`,
          ],
          [
            `No regalar una pérdida interior con el equipo ancho ante su ${rivalSystem}.`,
            `No saltar a presionar de uno en uno; el rival puede encontrar al tercer hombre.`,
            `No defender centros mirando solo balón; controlar área, frontal y segunda jugada.`,
          ],
        ),
      },
      {
        title: 'Cómo atacar',
        sections: [
          {
            title: 'Fase iniciación',
            ...createTacticalBlock(
              [
                block === 'Bajo'
                  ? 'Iniciar en corto con centrales abiertos y un mediocentro bajando para atraer su primera línea.'
                  : 'Preparar salida con apoyo cercano al central presionado y tercer hombre por dentro.',
                `Fijar a su primer salto y encontrar al jugador libre que deja el ${rivalSystem}.`,
                'Si aprietan alto, alternar pase corto con envío al intervalo para ganar segunda jugada.',
              ],
              [
                'No conducir hacia dentro si el pase al mediocentro está tapado.',
                'No iniciar con los dos laterales altos a la vez si no hay cobertura del pivote.',
                'No forzar pase vertical si el receptor está de espaldas y sin descarga cercana.',
              ],
            ),
          },
          {
            title: 'Fase creación',
            ...createTacticalBlock(
              [
                `Atraer en un costado y cambiar rápido para explotar ${widthText}.`,
                `Buscar a ${playerToActivate} entre líneas o atacando intervalo cuando el rival bascule.`,
                'Crear triángulos lateral-medio-extremo para progresar sin perder estructura.',
              ],
              [
                'No juntar demasiados jugadores por dentro si el rival ya cerró el carril central.',
                'No jugar de cara al bloque rival sin amenaza de ruptura.',
                'No perder la ocupación del lado débil; ahí puede estar la ventaja final.',
              ],
            ),
          },
          {
            title: 'Fase finalización',
            ...createTacticalBlock(
              [
                'Finalizar ataques con remate o pase atrás para evitar transiciones limpias.',
                'Ocupar primer palo, segundo palo y frontal antes de centrar.',
                `Atacar ${likelyAttackZone} con llegada coordinada, no con centros sin ventaja.`,
              ],
              [
                'No centrar si el área está vacía o con inferioridad clara.',
                'No acabar jugadas con todos por delante del balón.',
                'No precipitar tiros lejanos si existe pase atrás o continuidad por lado débil.',
              ],
            ),
          },
        ],
      },
      {
        title: 'Cómo defender',
        sections: [
          {
            title: 'B.BAJO',
            badge: recommendedDefensiveBlock === 'B.BAJO' ? 'Recomendado' : 'Uso puntual',
            ...createTacticalBlock(
              [
                'Cerrar área con centrales protegidos y mediocentros atentos a la frontal.',
                `Orientar al rival hacia fuera y defender ${dangerZone} con ayudas previas.`,
                'Salir tras robo con primer pase seguro antes de correr.',
              ],
              [
                'No hundir a toda la línea en el área pequeña.',
                'No permitir centros cómodos sin presión al poseedor.',
                'No despejar siempre al mismo carril si no hay jugador para sostener la segunda jugada.',
              ],
            ),
          },
          {
            title: 'B.MEDIO',
            badge: recommendedDefensiveBlock === 'B.MEDIO' ? 'Recomendado' : 'Alternativa',
            ...createTacticalBlock(
              [
                `Mantener bloque medio compacto para tapar a ${rivalToLimit}.`,
                'Orientar la circulación rival hacia banda y saltar cuando el control sea malo.',
                'Tener centrales preparados para anticipar y mediocentros cerca del rechace.',
              ],
              [
                'No dejar distancia grande entre delantero y mediocentros.',
                'No saltar el lateral sin que el extremo cierre línea de pase interior.',
                'No permitir que el rival reciba de cara entre nuestra línea media y defensiva.',
              ],
            ),
          },
          {
            title: 'B.ALTO',
            badge: recommendedDefensiveBlock === 'B.ALTO' ? 'Recomendado' : 'Momento concreto',
            ...createTacticalBlock(
              [
                'Saltar sobre central orientado a banda con extremo y delantero coordinados.',
                'Cerrar pase al pivote rival antes de presionar al poseedor.',
                'Tras robo alto, buscar finalización rápida o pase atrás al frontal.',
              ],
              [
                'No presionar alto si la línea defensiva no acompaña.',
                'No dejar al pivote rival recibir libre a la espalda de la primera presión.',
                'No perseguir marcas hasta desordenar todo el bloque.',
              ],
            ),
          },
        ],
      },
      {
        title: 'Transiciones',
        ...createTacticalBlock(
          [
            `Tras pérdida: ${afterLossPlan}.`,
            `Tras robo: ${afterRecoveryPlan}.`,
            `Vigilar a ${transitionLaunchers || 'pivote e interiores rivales'} como primer lanzador de contraataque.`,
          ],
          [
            'No perder balón con los dos mediocentros por delante de la jugada.',
            'No correr todos hacia delante tras robo si el primer pase no es claro.',
            'No permitir que el rival reciba de cara tras nuestro ataque finalizado mal.',
          ],
        ),
      },
      {
        title: 'Duelos individuales',
        ...createTacticalBlock(
          [
            questionnaire.preKeyMatchups || `${caudalNames[6]} debe imponerse en la zona del mediocentro para controlar ritmo y rechaces.`,
            questionnaire.preCaudalPlayerToBoost ? `Potenciar a ${questionnaire.preCaudalPlayerToBoost} con recepciones orientadas.` : `Potenciar a ${playerToActivate} en la zona de ventaja.`,
            questionnaire.preRivalPlayerToWatch ? `Vigilar a ${questionnaire.preRivalPlayerToWatch} con cobertura cercana.` : `Vigilar a ${rivalToLimit} cuando reciba entre líneas.`,
          ],
          [
            'No dejar al jugador clave rival recibir de cara y con tiempo para levantar cabeza.',
            'No aislar a nuestro jugador a potenciar contra dos rivales.',
            'No defender los duelos sin cobertura; el segundo jugador debe cerrar la continuación.',
          ],
        ),
      },
      {
        title: 'Plan de partido',
        ...createTacticalBlock(
          [
            questionnaire.preCaudalBuildPlan || `Competir con equipo corto, ataques claros y control de ${dangerZone}.`,
            `Atacar ${weakness} sin perder vigilancia sobre ${strength}.`,
            'Priorizar ataques finalizados, presión tras pérdida y cambios de orientación con sentido.',
          ],
          [
            `No entrar en intercambio de golpes si el rival vive de ${strength}.`,
            'No confundir posesión con dominio si no se pisa área.',
            'No abandonar el plan tras una pérdida; ajustar alturas y seguir atacando el punto débil.',
          ],
        ),
      },
      {
        title: 'Ajustes',
        ...createTacticalBlock(
          [
            'Si cuesta progresar, cambiar a salida de tres con un lateral bajo o un mediocentro incrustado.',
            'Si falta profundidad, adelantar un extremo y buscar más rupturas al intervalo central-lateral.',
            'Si el rival domina por dentro, cerrar con un medio más y atacar más directo la segunda jugada.',
          ],
          [
            'No cambiar el sistema sin definir quién protege las pérdidas.',
            'No acumular delanteros si el problema está en llegar con ventaja a zona de finalización.',
            'No sostener presión alta si el equipo queda largo; bajar a bloque medio y juntar líneas.',
          ],
        ),
      },
    ],
    advantages: caudal.midfielders >= rival.midfielders
      ? 'Buena base para controlar mediocampo y orientar ataques con apoyos cercanos.'
      : 'Ventaja posible si se atrae por fuera y se encuentra al hombre libre entre líneas.',
    risks: rival.attackers >= 3
      ? 'Cuidado con pérdidas en salida: el rival puede amenazar con tres jugadores arriba.'
      : 'Riesgo principal en segundas jugadas y rupturas del delantero tras descarga.',
    progress: wantsPossession
      ? 'Progresar con tercer hombre: central, pivote y mediapunta para superar la primera presión.'
      : 'Progresar alternando pase vertical y descarga a banda para ganar metros sin partirse.',
    pressure: wantsDirect
      ? 'Presionar la segunda jugada: centrales preparados para anticipar y mediocentros cerca del rechace.'
      : 'Presionar hacia fuera, cerrar pase al pivote rival y robar cerca de banda.',
    keyMatchups: rivalThreats.length
      ? `${caudalNames[6] || 'Nuestro pivote'} debe dominar la zona del mediocentro. Duelos marcados: ${rivalThreats.join(' / ')}.`
      : `${caudalNames[6] || 'Nuestro pivote'} debe dominar la zona del mediocentro; laterales y extremos deben atacar ${weakness}.`,
    attackPlan: [
      `Atacar ${likelyAttackZone}: fijar por un lado, atraer presión y acelerar el cambio de orientación antes de que el bloque bascule.`,
      `Activar a ${playerToActivate} con ventaja corporal, preferiblemente recibiendo de cara o atacando intervalo, no aislado de espaldas.`,
      questionnaire.preRivalDefendsCrosses
        ? `En centros: aprovechar que el rival defiende así: ${questionnaire.preRivalDefendsCrosses}.`
        : 'En centros, cargar primer palo, segundo palo y frontal; si el área está igualada, priorizar pase atrás sobre centro forzado.',
    ],
    defendPlan: [
      `Tapar a ${rivalToLimit}: orientar su recepción hacia fuera y negar el giro cómodo entre líneas.`,
      `Proteger ${dangerZone}: ajustar coberturas antes del pase, no cuando el rival ya está corriendo.`,
      `Evitar ${avoidScenario}, porque ahí el rival puede correr con el equipo desordenado.`,
    ],
    transitionsPlan: [
      `Tras pérdida: ${afterLossPlan}. La primera reacción debe cerrar pase vertical y zona de robo rival.`,
      `Tras robo: ${afterRecoveryPlan}. Primer pase con intención y ocupación inmediata de carriles.`,
      `Vigilar lanzadores: ${transitionLaunchers || 'pivote e interiores rivales'}. Si reciben de cara, falta táctica o temporización antes de que activen la carrera.`,
    ],
    duelsPlan: [
      questionnaire.preKeyMatchups || `${caudalNames[6]} debe imponerse a ${rivalNames[6]} para que el partido no se parta por dentro.`,
      questionnaire.preCaudalPlayerToBoost ? `Potenciar a ${questionnaire.preCaudalPlayerToBoost}.` : `Potenciar a ${playerToActivate}, porque es el perfil mejor situado para atacar la ventaja estructural.`,
      questionnaire.preRivalPlayerToWatch ? `Vigilar a ${questionnaire.preRivalPlayerToWatch}.` : `Vigilar a ${rivalToLimit}, porque puede conectar la salida rival con la zona de ataque.`,
    ],
    recommendedPlan: questionnaire.preCaudalBuildPlan || 'Plan recomendado: equipo corto, ayudas interiores, cambios de orientación, presión tras pérdida y ataques finalizados.',
    complicationAdjustments: [
      'Si el partido se complica con pérdidas interiores: bajar riesgo en salida y progresar por fuera con apoyo cercano.',
      'Si no generamos ocasiones: cambiar orientación más rápido y añadir llegada desde segunda línea.',
      'Si el rival corre demasiado: finalizar jugadas, temporizar pérdidas y juntar mediocentros.',
    ],
  };
};

const getLineupSlotMap = (lineup) => {
  const usedSlots = new Map();
  lineup.forEach((player) => {
    if (Number.isInteger(player.slot)) usedSlots.set(player.slot, player);
  });
  return usedSlots;
};

const getPlayerMeta = (player) => [player.position, player.age ? `${player.age} años` : ''].filter(Boolean).join(' · ');
const displayPlayerName = (player) => player.name;
const playerReservePlacement = (player) => {
  return 'below';
};
const playerStatusBadges = (player) =>
  [
    player.yellowRisk ? { label: 'A', className: 'bg-yellow-300 text-slate-950', title: 'Amonestado' } : null,
    player.injured ? { label: 'L', className: 'bg-red-500 text-white', title: 'Lesionado' } : null,
    player.suspended ? { label: 'S', className: 'bg-slate-600 text-red-100 ring-1 ring-red-300/40', title: 'Sancionado' } : null,
    player.isKey ? { label: '★', className: 'bg-amber-300 text-blue-950 ring-1 ring-blue-300/50', title: 'Jugador clave' } : null,
  ].filter(Boolean);

const normalizePlayerIdentityName = (value) =>
  cleanTeamDisplayName(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const mergeRivalPlayerData = (base, candidate) => ({
  ...base,
  ...Object.fromEntries(Object.entries(candidate || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined)),
  isKey: Boolean(base?.isKey || candidate?.isKey),
  yellowRisk: Boolean(base?.yellowRisk || candidate?.yellowRisk),
  suspended: Boolean(base?.suspended || candidate?.suspended),
  injured: Boolean(base?.injured || candidate?.injured),
});

const dedupeRivalPlayers = (players) => {
  const deduped = [];
  const seenRivalIds = new Map();
  const seenIds = new Map();
  const seenNames = new Map();

  players.map(normalizeSquadEntry).forEach((player) => {
    if (!player.name) return;
    const rivalId = player.jugadorRivalId || player.jugador_rival_id || null;
    const id = player.id || null;
    const normalizedName = normalizePlayerIdentityName(player.name);
    const existingIndex =
      (rivalId && seenRivalIds.get(rivalId)) ??
      (id && seenIds.get(id)) ??
      seenNames.get(normalizedName);

    if (existingIndex !== undefined) {
      deduped[existingIndex] = mergeRivalPlayerData(deduped[existingIndex], player);
      return;
    }

    const nextIndex = deduped.length;
    deduped.push(player);
    if (rivalId) seenRivalIds.set(rivalId, nextIndex);
    if (id) seenIds.set(id, nextIndex);
    if (normalizedName) seenNames.set(normalizedName, nextIndex);
  });

  return deduped;
};

const getBenchGroups = (squad) =>
  dedupeRivalPlayers(squad)
    .filter((player) => player.role !== 'Titular')
    .reduce((groups, player) => {
      const position = player.position || 'Sin posición';
      return { ...groups, [position]: [...(groups[position] ?? []), player] };
    }, {});

const getBenchForStarter = (starter, benchChart = emptyDepthChart) => {
  const assignedBench = (benchChart[starter.name] ?? []).filter(Boolean).map(normalizeSquadEntry);
  return assignedBench.slice(0, 3);
};

const normalizeSquadEntry = (entry) => {
  if (typeof entry === 'string') {
    return {
      id: entry,
      name: entry,
      image: '',
      number: '',
      position: '',
      age: '',
      role: 'Reserva',
      isKey: false,
      yellowRisk: false,
      suspended: false,
      injured: false,
    };
  }

  const name = entry.name ?? '';
  return {
    id: entry.id ?? name,
    jugadorRivalId: entry.jugadorRivalId ?? entry.jugador_rival_id ?? null,
    name,
    image: entry.image ?? '',
    number: entry.number ?? '',
    position: entry.position ?? '',
    age: entry.age ?? '',
    role: entry.role ?? 'Reserva',
    isKey: Boolean(entry.isKey),
    yellowRisk: Boolean(entry.yellowRisk),
    suspended: Boolean(entry.suspended),
    injured: Boolean(entry.injured),
  };
};

const parseSquadText = (value) =>
  value
    .split('\n')
    .map((line) => {
      const [name, image = '', number = '', position = '', age = '', role = 'Reserva', keyValue = ''] = line.split('|').map((part) => part.trim());
      return name ? { id: name, name, image, number, position, age, role: role || 'Reserva', isKey: /destacado|clave|si|sí|true/i.test(keyValue) } : null;
    })
    .filter(Boolean);

const formatSquadText = (squad) =>
  squad
    .map(normalizeSquadEntry)
    .map((player) =>
      [player.name, player.image, player.number, player.position, player.age, player.role, player.isKey ? 'Destacado' : ''].filter(Boolean).join(' | ')
    )
    .join('\n');

const createBlankTeamPlayer = () => ({
  id: `manual-${Date.now()}`,
  name: '',
  image: '',
  number: '',
  position: '',
  age: '',
  role: 'Reserva',
  isKey: false,
  yellowRisk: false,
  suspended: false,
  injured: false,
});

const normalizeMatch = (match) => {
  const merged = {
    ...emptyMatchForm,
    ...match,
    id: match.id ?? Date.now(),
  };

  return {
    ...merged,
    preAiAnalysis: normalizePreAiAnalysis(merged.preAiAnalysis),
    preCaudalLineup: safeArray(merged.preCaudalLineup),
    preRivalLineup: safeArray(merged.preRivalLineup),
    preRivalLineupPlayers: safeArray(merged.preRivalLineupPlayers),
    preKeyMatchupsTable: safeArray(merged.preKeyMatchupsTable),
    prePlayerNotes: safeObject(merged.prePlayerNotes),
    preRivalPlayerNotes: safeObject(merged.preRivalPlayerNotes),
  };
};

const cleanTeamDisplayName = (name) => name.replace(/^Plantilla\s+/i, '').trim();
const comparableTeamName = (name) =>
  cleanTeamDisplayName(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
const findTeamByDisplayName = (teams, name) => {
  const comparableName = comparableTeamName(name);
  if (!comparableName) return null;
  return teams.find((team) => comparableTeamName(team.name) === comparableName) ?? null;
};

const getMatchResult = (match) => {
  if (match.status !== 'Finalizado') return null;
  const caudalGoals = Number(match.isHome ? match.homeScore : match.awayScore);
  const rivalGoals = Number(match.isHome ? match.awayScore : match.homeScore);
  if (Number.isNaN(caudalGoals) || Number.isNaN(rivalGoals)) return null;
  if (caudalGoals > rivalGoals) return 'W';
  if (caudalGoals < rivalGoals) return 'L';
  return 'D';
};

const matchDisplayDate = (date) => {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  return day && month && year ? `${day}/${month}/${year}` : date;
};

const extractImportedPlayers = (text) => {
  const ignored = new Set([
    'jugador',
    'jugadores',
    'plantilla',
    'equipo',
    'posición',
    'nacionalidad',
    'edad',
    'altura',
    'peso',
    'valor de mercado',
  ]);

  return Array.from(
    new Set(
      text
        .split('\n')
        .map((line) =>
          line
            .replace(/\[|\]|\*|#/g, '')
            .replace(/Image:\s*/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim()
        )
        .filter((line) => {
          const lower = line.toLowerCase();
          return (
            line.length >= 5 &&
            line.length <= 45 &&
            /[a-záéíóúñü]/i.test(line) &&
            !ignored.has(lower) &&
            !lower.includes('http') &&
            !lower.includes('temporada') &&
            !lower.includes('copyright') &&
            !/^\d/.test(line)
          );
        })
        .slice(0, 35)
    )
  ).map((name) => ({ name, image: '' }));
};

const normalizeSourceUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const getReadableUrls = (sourceUrl) => {
  const normalized = normalizeSourceUrl(sourceUrl);
  const noProtocol = normalized.replace(/^https?:\/\//i, '');

  return [
    normalized,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(normalized)}`,
    `https://r.jina.ai/${normalized}`,
    `https://r.jina.ai/http://${noProtocol}`,
  ];
};

const extractTeamName = (doc, fallback) => {
  const heading = doc.querySelector('h1')?.textContent?.trim();
  const title = doc.querySelector('meta[property="og:title"]')?.content || doc.title;
  return heading || title?.replace(/\s*[-|].*$/, '').trim() || fallback;
};

const extractStadium = (doc) => {
  const text = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  const labelMatch = text.match(/(?:Estadio|Campo|Campo de juego)\s*:?\s*([A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9 .'-]{2,70})/i);
  if (labelMatch) return labelMatch[1].replace(/\s+(Aforo|Capacidad|Dirección|Direccion|Ciudad).*$/i, '').trim();

  const tableMatch = Array.from(doc.querySelectorAll('tr, li, p, div'))
    .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '')
    .find((value) => /^(Estadio|Campo|Campo de juego)\b/i.test(value));

  return tableMatch?.replace(/^(Estadio|Campo|Campo de juego)\s*:?\s*/i, '').replace(/\s+(Aforo|Capacidad|Dirección|Direccion|Ciudad).*$/i, '').trim() || '';
};

const extractKitColor = (doc) => {
  const themeColor = doc.querySelector('meta[name="theme-color"]')?.content;
  if (/^#[0-9a-f]{6}$/i.test(themeColor || '')) return themeColor;

  const raw = doc.documentElement?.outerHTML ?? '';
  const colors = raw.match(/#[0-9a-f]{6}\b/gi) || [];
  const ignored = new Set(['#ffffff', '#000000', '#f8fafc', '#f5f5f5', '#eeeeee', '#e5e7eb']);
  return colors.find((color) => !ignored.has(color.toLowerCase())) || '';
};

const resolveAssetUrl = (value, baseUrl) => {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
};

const getImageSource = (img, baseUrl) =>
  resolveAssetUrl(
    img?.getAttribute('data-src') ||
      img?.getAttribute('data-original') ||
      img?.getAttribute('data-lazy') ||
      img?.getAttribute('src') ||
      '',
    baseUrl
  );

const isTransfermarktUrl = (url) => /transfermarkt\./i.test(url);
const isBesoccerUrl = (url) => /besoccer\./i.test(url);

const extractCrest = (doc, baseUrl) => {
  const raw = doc.documentElement?.outerHTML ?? '';

  if (isBesoccerUrl(baseUrl)) {
    const besoccerCrest = raw.match(/https?:\/\/[^"'\s)]+(?:img_data\/escudos|media\/img_data\/escudos|img_data\/equipos|media\/img_data\/equipos|\/escudos\/)[^"'\s)]*/i)?.[0];
    if (besoccerCrest) return besoccerCrest.replace(/&amp;/g, '&');

    const teamName = extractTeamName(doc, '');
    const crest =
      Array.from(doc.querySelectorAll('img')).find((img) => {
        const alt = img.alt?.trim() ?? '';
        const src = img.getAttribute('src') ?? '';
        return alt === teamName || /img_data\/escudos|img_data\/equipos|\/escudos\/|shield|team/i.test(src);
      }) ||
      Array.from(doc.querySelectorAll('img')).find((img) => /escudo|equipo|club|team/i.test(`${img.alt} ${img.src}`));
    const crestUrl = getImageSource(crest, baseUrl);
    if (crestUrl && !/flags|avatar|besoccertv|apuestas/i.test(crestUrl)) return crestUrl;
  }

  if (isTransfermarktUrl(baseUrl)) {
    const crest =
      doc.querySelector('.data-header__profile-container img') ||
      doc.querySelector('.data-header__profile-image') ||
      doc.querySelector('header img[alt]') ||
      Array.from(doc.querySelectorAll('img')).find((img) =>
        /wappen|logo|verein|club|data-header/i.test(`${img.className} ${img.src}`)
      );
    const crestUrl = getImageSource(crest, baseUrl);
    if (crestUrl && !/tm_logo|transfermarkt/i.test(crestUrl)) return crestUrl;
  }

  const metaImage = doc.querySelector('meta[property="og:image"]')?.content;
  const crestImage = Array.from(doc.querySelectorAll('img')).find((img) =>
    /escudo|crest|wappen|logo|equipo|team/i.test(`${img.alt} ${img.src}`)
  );
  return getImageSource(crestImage, baseUrl) || resolveAssetUrl(metaImage || '', baseUrl);
};

const extractTransfermarktPlayers = (doc, baseUrl) => {
  const byName = new Map();
  const rows = Array.from(doc.querySelectorAll('table.items tbody tr'));

  rows.forEach((row) => {
    const nameLink =
      row.querySelector('td.hauptlink a[href*="/profil/spieler/"]') ||
      row.querySelector('td.hauptlink a[href*="/spieler/"]') ||
      row.querySelector('td.hauptlink a');
    const portrait = row.querySelector('img.bilderrahmen-fixed, img[src*="/portrait/"], img[data-src*="/portrait/"]');
    const name = (nameLink?.textContent || portrait?.alt || '').replace(/\s+/g, ' ').trim();
    const image = getImageSource(portrait, baseUrl);
    const number = row.querySelector('.rn_nummer')?.textContent?.replace(/\D/g, '') ?? '';
    const position =
      row.querySelector('td.posrela table tr:nth-child(2) td')?.textContent?.replace(/\s+/g, ' ').trim() ||
      row.querySelector('td:nth-child(2) table tr:nth-child(2) td')?.textContent?.replace(/\s+/g, ' ').trim() ||
      '';

    if (
      name &&
      name.length > 2 &&
      name.length < 45 &&
      !/transfermarkt|laliga|bundesliga|premier|segunda|serie|ligue|deadline|club siero/i.test(name)
    ) {
      byName.set(name, { id: name, name, image, number, position, role: 'Reserva', isKey: false });
    }
  });

  return Array.from(byName.values());
};

const extractBesoccerPlayers = (doc, baseUrl) => {
  const byName = new Map();
  const squadScope =
    doc.querySelector('table') ||
    doc.querySelector('[class*="squad"]') ||
    doc.querySelector('[class*="plantilla"]') ||
    doc.body;
  const playerLinks = Array.from(squadScope.querySelectorAll('a[href*="/jugador/"]'));

  playerLinks.forEach((link) => {
    const name = link.textContent?.replace(/\s+/g, ' ').trim();
    const image = getImageSource(link.querySelector('img') || link.closest('tr')?.querySelector('img'), baseUrl);
    if (name && name.length > 2 && name.length < 45 && !/más|comparar|partidos|trayectoria/i.test(name)) {
      byName.set(name, { id: name, name, image, number: '', position: '', role: 'Reserva', isKey: false });
    }
  });

  return Array.from(byName.values());
};

const cleanImportedName = (value) =>
  value
    .replace(/【\d+†([^】]+)】/g, '$1')
    .replace(/\[|\]|\*|#/g, '')
    .replace(/Image:\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const isLikelyPlayerName = (value) => {
  const lower = value.toLowerCase();
  return (
    value.length >= 3 &&
    value.length <= 45 &&
    /[a-záéíóúñü]/i.test(value) &&
    !/plantilla|porteros|defensas|centrocampistas|delanteros|rendimiento|info|totales|edad|rating|temporada|image:|pj|pt|cm|€|seleccionar|copyright|jugadores destacados|máximo goleador|más sancionado|minutos/i.test(lower) &&
    !/^\d+$/.test(value) &&
    !/^\d+\s*(k|m)?\.?€?$/i.test(value)
  );
};

const extractBesoccerPlayersFromText = (text) => {
  const start = text.search(/#\s*Plantilla|##\s*Plantilla|Plantilla\s+.+\s*\|/i);
  const scoped = start >= 0 ? text.slice(start) : text;
  const end = scoped.search(/\n##\s*(Jugadores destacados|Temporada|Últimos|Noticias|Estadio|Fichajes)|Copyright/i);
  const rosterText = end > 0 ? scoped.slice(0, end) : scoped;
  const byName = new Map();
  let currentPosition = '';
  const positionLabels = {
    Desconocido: '',
    Porteros: 'Portero',
    Defensas: 'Defensa central',
    Centrocampistas: 'Mediocentro',
    Delanteros: 'Delantero centro',
  };

  rosterText.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    const indexedMatch = line.match(
      /^(\d{1,2})?\s*(?:【\d+†\s*】\s*)?【\d+†([^】]+)】.*?(?:Image:\s*[a-z]{2}).*?\s(\d{2}|-)\s(?:\d{2,3}|-)\s(?:[\d.,]+K|-)\s+\d+/i
    );
    if (indexedMatch) {
      const [, number = '', rawName, rawAge = ''] = indexedMatch;
      const name = cleanImportedName(rawName);
      if (isLikelyPlayerName(name)) {
        byName.set(name, {
          id: name,
          name,
          image: '',
          number,
          position: currentPosition,
          age: rawAge === '-' ? '' : rawAge,
          role: 'Reserva',
          isKey: false,
        });
      }
      return;
    }

    if (/^(Desconocido|Porteros|Defensas|Centrocampistas|Delanteros)\s*\|/i.test(line)) {
      const groupName = line.split('|')[0].trim();
      currentPosition = positionLabels[groupName] ?? groupName;
    }
    if (!line.includes('|') || !/Image:| \| \| /i.test(line)) return;
    if (/---|PJ\s*\||PT\s*\||Edad|rating|Temp/i.test(line)) return;

    const cells = line.split('|').map(cleanImportedName).filter(Boolean);
    const number = cells.find((cell) => /^\d{1,2}$/.test(cell)) ?? '';
    const nameCell = cells.find((cell, index) => {
      const previous = cells[index - 1] ?? '';
      return isLikelyPlayerName(cell) && !/^([a-z]{2}|ES|AR|VE|TR|NO)$/i.test(cell) && !isLikelyPlayerName(previous);
    });

    const fallbackName = cells.find(isLikelyPlayerName);
    const name = nameCell || fallbackName;
    const imageIndex = cells.findIndex((cell) => /^Image:/i.test(cell));
    const possibleAge = cells
      .slice(Math.max(imageIndex + 6, 0))
      .find((cell) => /^\d{2}$/.test(cell) && Number(cell) >= 15 && Number(cell) <= 45);
    if (name) byName.set(name, { id: name, name, image: '', number, position: currentPosition, age: possibleAge ?? '', role: 'Reserva', isKey: false });
  });

  return Array.from(byName.values());
};

const extractPlayersFromHtml = (html, baseUrl) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const transfermarktPlayers = isTransfermarktUrl(baseUrl) ? extractTransfermarktPlayers(doc, baseUrl) : [];
  if (transfermarktPlayers.length > 0) return { doc, players: transfermarktPlayers };
  if (isTransfermarktUrl(baseUrl)) return { doc, players: [] };

  const besoccerTextPlayers = isBesoccerUrl(baseUrl) ? extractBesoccerPlayersFromText(doc.body.textContent || html) : [];
  if (besoccerTextPlayers.length > 0) return { doc, players: besoccerTextPlayers };

  const besoccerPlayers = isBesoccerUrl(baseUrl) ? extractBesoccerPlayers(doc, baseUrl) : [];
  if (besoccerPlayers.length > 0) return { doc, players: besoccerPlayers };
  if (isBesoccerUrl(baseUrl)) return { doc, players: [] };

  const candidates = Array.from(doc.querySelectorAll('img'))
    .map((img) => ({
      name: img.alt?.replace(/^Image:\s*/i, '').trim(),
      image: getImageSource(img, baseUrl),
    }))
    .filter((player) => player.name && player.name.length > 3 && player.name.length < 45);

  const byName = new Map();
  candidates.forEach((player) => {
    if (!/escudo|logo|flag|bandera|apuestas|avatar|logout|laliga|bundesliga|premier|segunda|serie|ligue|transfermarkt|deadline|banner/i.test(player.name)) {
      byName.set(player.name, player);
    }
  });

  return {
    doc,
    players: byName.size > 0 ? Array.from(byName.values()).slice(0, 35) : extractImportedPlayers(doc.body.textContent ?? ''),
  };
};

const calculateAge = (dob) => {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  const dayDiff = now.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years;
};

const playerLabel = (dob) => (calculateAge(dob) < 23 ? 'Sub-23' : 'Senior');

const displayDorsal = (number) => (number ? number : '-');

const normalizePitchZone = (zone) =>
  String(zone || '')
    .replace(/^Arriba/i, 'F.Finalización')
    .replace(/^Medio/i, 'F.Creación')
    .replace(/^Bajo/i, 'F.Inicio');

const displayZoneLabel = (zone) =>
  String(zone || '')
    .replace('F.Finalización', 'F.Finalización')
    .replace('F.Creación', 'F.Creación')
    .replace('F.Inicio', 'F.Inicio')
    .replace(' izquierda', '\nIZQ')
    .replace(' centro', '\nCENTRO')
    .replace(' derecha', '\nDER')
    .replace('Alta izquierda', 'Alta\nIZQ')
    .replace('Alta centro', 'Alta\nCENTRO')
    .replace('Alta derecha', 'Alta\nDER')
    .replace('Media izquierda', 'Media\nIZQ')
    .replace('Media centro', 'Media\nCENTRO')
    .replace('Media derecha', 'Media\nDER')
    .replace('Baja izquierda', 'Baja\nIZQ')
    .replace('Baja centro', 'Baja\nCENTRO')
    .replace('Baja derecha', 'Baja\nDER');

const toTacticalItems = (value, fallback) => {
  if (Array.isArray(value)) return value.filter(Boolean).slice(0, 3);
  return value ? [value] : [fallback];
};

const getTacticalBlocksForRender = (analysis) => {
  if (Array.isArray(analysis?.tacticalBlocks) && analysis.tacticalBlocks.length) return analysis.tacticalBlocks;

  return [
    {
      title: 'Lectura general',
      ...createTacticalBlock(
        toTacticalItems(analysis?.generalReading, 'Analiza los sistemas para generar una lectura concreta.'),
        ['Evitar conclusiones genéricas sin relación con el sistema rival.', 'Evitar pérdidas interiores con el equipo abierto.', 'Evitar ataques sin vigilancia tras pérdida.'],
      ),
    },
    {
      title: 'Cómo atacar',
      ...createTacticalBlock(
        toTacticalItems(analysis?.attackPlan, 'Busca ventajas por sistema y concreta la zona de ataque.'),
        ['Evitar centros sin ocupación de área.', 'Evitar progresar sin apoyos cercanos.', 'Evitar atacar siempre por el mismo carril.'],
      ),
    },
    {
      title: 'Cómo defender',
      ...createTacticalBlock(
        toTacticalItems(analysis?.defendPlan, 'Define altura de bloque y emparejamientos defensivos.'),
        ['Evitar saltos individuales sin cobertura.', 'Evitar dejar recibir de cara entre líneas.', 'Evitar defender centros sin controlar frontal.'],
      ),
    },
  ];
};

const getIndividualAdviceForRender = (playerAdvice) => {
  if (playerAdvice?.tacticalAdvice?.upAttack) return playerAdvice.tacticalAdvice;

  const baseItems = toTacticalItems(playerAdvice?.advice, 'Selecciona un jugador y analiza sistemas para generar recomendaciones concretas.');
  return createIndividualTacticalBlock({
    upAttack: baseItems,
    upDefense: ['Cerrar pase interior tras pérdida.', 'Temporizar hasta recibir ayuda.', 'Comunicar cobertura con el compañero cercano.'],
    downAttack: ['No recibir parado si no hay apoyo cercano.', 'No conducir hacia la presión.', 'No forzar el duelo individual si aparece una ayuda rival.'],
    downDefense: ['No perder la posición tras pérdida.', 'No saltar sin cobertura.', 'No mirar solo balón en centros o cambios de orientación.'],
  });
};

const renderIndividualAdviceGroup = ({ title, items, tone, icon }) => {
  const isUp = tone === 'up';
  return (
    <div className={`rounded-2xl border p-4 ${isUp ? 'border-emerald-300/20 bg-emerald-400/10' : 'border-rose-300/20 bg-rose-400/10'}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${isUp ? 'bg-emerald-400 text-slate-950' : 'bg-rose-400 text-white'}`}>
          {icon}
        </span>
        <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${isUp ? 'text-emerald-200' : 'text-rose-200'}`}>{title}</p>
      </div>
      <ul className="space-y-2">
        {(items || []).map((item, index) => (
          <li key={`${title}-${index}-${item}`} className="rounded-xl bg-[#091428]/70 px-3 py-2 text-sm leading-6 text-white">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
};

const renderIndividualTacticalAdvice = (advice) => (
  <div className="mt-4 grid gap-3 2xl:grid-cols-2">
    <div className="rounded-3xl border border-emerald-300/15 bg-emerald-400/5 p-3">
      <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Hacer</p>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-1">
        {renderIndividualAdviceGroup({ title: '3 acciones ofensivas', items: advice.upAttack, tone: 'up', icon: '↑' })}
        {renderIndividualAdviceGroup({ title: '3 acciones defensivas', items: advice.upDefense, tone: 'up', icon: '↑' })}
      </div>
    </div>
    <div className="rounded-3xl border border-rose-300/15 bg-rose-400/5 p-3">
      <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.24em] text-rose-300">Evitar</p>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-1">
        {renderIndividualAdviceGroup({ title: '3 acciones ofensivas', items: advice.downAttack, tone: 'down', icon: '↓' })}
        {renderIndividualAdviceGroup({ title: '3 acciones defensivas', items: advice.downDefense, tone: 'down', icon: '↓' })}
      </div>
    </div>
  </div>
);

const renderTacticalPoint = (item, tone, index) => {
  const isUp = tone === 'up';
  return (
    <li
      key={`${tone}-${index}-${item}`}
      className={`flex gap-3 rounded-2xl border p-3 text-sm leading-6 ${
        isUp
          ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-50'
          : 'border-rose-300/25 bg-rose-400/10 text-rose-50'
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-black ${
          isUp ? 'bg-emerald-400 text-slate-950' : 'bg-rose-400 text-white'
        }`}
      >
        {isUp ? '↑' : '↓'}
      </span>
      <span>{item}</span>
    </li>
  );
};

const renderTacticalChecklist = (block) => (
  <div className="mt-4 grid gap-3 xl:grid-cols-2">
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Hacer</p>
      <ul className="space-y-2">{(block.up || []).map((item, index) => renderTacticalPoint(item, 'up', index))}</ul>
    </div>
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-rose-300">Evitar</p>
      <ul className="space-y-2">{(block.down || []).map((item, index) => renderTacticalPoint(item, 'down', index))}</ul>
    </div>
  </div>
);

const renderTacticalBlock = (block) => (
  <div key={block.title} className="rounded-3xl border border-white/5 bg-[#0f1e38]/80 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white">{block.title}</p>
      {block.badge ? (
        <span className="rounded-full bg-caudal-electric/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">
          {block.badge}
        </span>
      ) : null}
    </div>
    {block.sourceTags?.length ? (
      <div className="mt-3 flex flex-wrap gap-2">
        {block.sourceTags.map((tag) => (
          <span key={`${block.title}-${tag}`} className="rounded-full border border-caudal-electric/20 bg-caudal-electric/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-caudal-electric">
            Basado en: {tag}
          </span>
        ))}
      </div>
    ) : null}
    {block.sections ? (
      <div className="mt-4 space-y-4">
        {block.sections.map((section) => (
          <div key={section.title} className="rounded-2xl border border-white/5 bg-[#091428]/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-300">{section.title}</p>
              {section.badge ? (
                <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-200">
                  {section.badge}
                </span>
              ) : null}
            </div>
            {renderTacticalChecklist(section)}
          </div>
        ))}
      </div>
    ) : (
      renderTacticalChecklist(block)
    )}
  </div>
);

function App() {
  const [activeTab, setActiveTab] = useState('Inicio');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);
  const [playerFormError, setPlayerFormError] = useState('');
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState('');
  const [isUploadingPlayerImage, setIsUploadingPlayerImage] = useState(false);
  const [isUploadingTeamCrest, setIsUploadingTeamCrest] = useState(false);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState('');
  const [homePhrase, setHomePhrase] = useState(defaultHomePhrase);
  const [homePhraseDraft, setHomePhraseDraft] = useState(defaultHomePhrase);
  const [isEditingHomePhrase, setIsEditingHomePhrase] = useState(false);
  const [homePhraseSaving, setHomePhraseSaving] = useState(false);
  const [homePhraseStatus, setHomePhraseStatus] = useState('');
  const [matches, setMatches] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [draggedPlayer, setDraggedPlayer] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(false);
  const [isMatchPanelOpen, setIsMatchPanelOpen] = useState(false);
  const [preLoading, setPreLoading] = useState(false);
  const [preError, setPreError] = useState('');
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [statsViewMode, setStatsViewMode] = useState('completa');
  const [delegatedMinute, setDelegatedMinute] = useState('0');
  const [delegatedEventDraft, setDelegatedEventDraft] = useState(null);
  const [delegatedEventSaving, setDelegatedEventSaving] = useState(false);
  const [delegatedEventFeedback, setDelegatedEventFeedback] = useState('');
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [matchFilter, setMatchFilter] = useState('Todos');
  const [matchSections, setMatchSections] = useState({});
  const [matchView, setMatchView] = useState('lista_partidos');
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [matchViewSection, setMatchViewSection] = useState('PRE');
  const [preSubTab, setPreSubTab] = useState('Informe rival');
  const [isCanvaPreviewOpen, setIsCanvaPreviewOpen] = useState(false);
  const [selectedTacticalPlayerIndex, setSelectedTacticalPlayerIndex] = useState(0);
  const [selectedRivalTacticalPlayerIndex, setSelectedRivalTacticalPlayerIndex] = useState(0);
  const [newRivalManualPlayerName, setNewRivalManualPlayerName] = useState('');
  const [tacticalQuestionMode, setTacticalQuestionMode] = useState('Macro');
  const [tacticalQuestionText, setTacticalQuestionText] = useState('');
  const [openQuestionnaireSections, setOpenQuestionnaireSections] = useState({
    rivalProfile: true,
    rivalAttack: true,
    rivalDefense: true,
    transitionsSetPieces: false,
    caudalPlan: true,
    extraInfo: true,
  });
  const [eventTypes, setEventTypes] = useState([]);
  const [selectedEventType, setSelectedEventType] = useState('');
  const [newEventDraft, setNewEventDraft] = useState({ minute: '', type: '', description: '', player: '' });
  const [newEventTypeDraft, setNewEventTypeDraft] = useState({ name: '', color: 'slate' });
  const [postVideoStartSeconds, setPostVideoStartSeconds] = useState(0);
  const [postCurrentMinute, setPostCurrentMinute] = useState('');
  const [postVideoSaveStatus, setPostVideoSaveStatus] = useState('');
  const [postVideoDuration, setPostVideoDuration] = useState(0);
  const [selectedPostEventId, setSelectedPostEventId] = useState(null);
  const [postYoutubeReady, setPostYoutubeReady] = useState(false);
  const [postClipSaving, setPostClipSaving] = useState(false);
  const [postClipFeedback, setPostClipFeedback] = useState('');
  const [isGoalAnalysisOpen, setIsGoalAnalysisOpen] = useState(false);
  const [goalAnalysisDraft, setGoalAnalysisDraft] = useState(defaultGoalAnalysisDraft);
  const [isStatsCallupPanelOpen, setIsStatsCallupPanelOpen] = useState(false);
  const [selectedStatsCallups, setSelectedStatsCallups] = useState([]);
  const [statsCallupSaving, setStatsCallupSaving] = useState(false);
  const [statsCallupError, setStatsCallupError] = useState('');
  const [selectedPlayerProfileId, setSelectedPlayerProfileId] = useState(null);
  const [playerCompetitionFilter, setPlayerCompetitionFilter] = useState('Todos');
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState('');
  const [performanceStatus, setPerformanceStatus] = useState('');
  const [performanceWeekStart, setPerformanceWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay() || 7;
    today.setDate(today.getDate() - day + 1);
    return today.toISOString().slice(0, 10);
  });
  const [trainingSessions, setTrainingSessions] = useState([]);
  const [wellnessEntries, setWellnessEntries] = useState([]);
  const [rpeEntries, setRpeEntries] = useState([]);
  const [performanceMatchStats, setPerformanceMatchStats] = useState([]);
  const [performanceSessionDraft, setPerformanceSessionDraft] = useState({
    sessionDate: new Date().toISOString().slice(0, 10),
    microcycleLabel: '',
    mdLabel: 'MD-4',
    formCode: '',
    title: '',
    sessionType: 'Entrenamiento',
    plannedDuration: '',
    notes: '',
  });
  const [wellnessDraft, setWellnessDraft] = useState({
    jugadorId: '',
    entryDate: new Date().toISOString().slice(0, 10),
    sleepHours: '',
    sleepQuality: '5',
    fatigue: '5',
    muscleSoreness: '5',
    stress: '5',
    mood: '5',
    weight: '',
    discomfort: '',
    comment: '',
  });
  const [rpeDraft, setRpeDraft] = useState({
    jugadorId: '',
    sessionId: '',
    durationMinutes: '',
    rpe: '5',
    comment: '',
  });
  const [isLitoOpen, setIsLitoOpen] = useState(false);
  const [litoQuestion, setLitoQuestion] = useState('');
  const [litoLoading, setLitoLoading] = useState(false);
  const [litoMessages, setLitoMessages] = useState([
    {
      role: 'assistant',
      text: 'Soy Lito. Pregúntame por partidos, goles, sistemas, tarjetas o minutos guardados en Supabase.',
    },
  ]);
  const [playerVenueFilter, setPlayerVenueFilter] = useState('Todos');
  const [playerInfluenceFilter, setPlayerInfluenceFilter] = useState('Todos');
  const [selectedTimelineAction, setSelectedTimelineAction] = useState(null);
  const [playerReport, setPlayerReport] = useState(null);
  const [playerProfileData, setPlayerProfileData] = useState(null);
  const [playerProfileLoading, setPlayerProfileLoading] = useState(false);
  const [playerProfileError, setPlayerProfileError] = useState('');
  const [groupCompetitionFilter, setGroupCompetitionFilter] = useState('Todos');
  const [groupContextFilter, setGroupContextFilter] = useState('Todos');
  const [groupAssistFilter, setGroupAssistFilter] = useState('Todas');
  const [groupShotFilter, setGroupShotFilter] = useState('Ambos');
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [idealSystem, setIdealSystem] = useState('4-4-2');
  const [formState, setFormState] = useState({
    name: '',
    shirtName: '',
    dob: '',
    number: '',
    position: 'Portero',
    foot: 'Derecha',
    image: '',
  });
  const [teamFormState, setTeamFormState] = useState(emptyTeamForm);
  const [matchFormState, setMatchFormState] = useState(emptyMatchForm);
  const [matchFormSection, setMatchFormSection] = useState('PRE');
  const playerImageInputRef = useRef(null);
  const teamCrestInputRef = useRef(null);
  const preSectionRef = useRef(null);
  const postSectionRef = useRef(null);
  const statsOperationRef = useRef(Promise.resolve());
  const postYoutubeIframeRef = useRef(null);
  const postYoutubePlayerRef = useRef(null);

  const handleAuthFormChange = (event) => {
    const { name, value } = event.target;
    setAuthForm((current) => ({ ...current, [name]: value }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);

    const credentials = {
      email: authForm.email.trim(),
      password: authForm.password,
    };

    const { error: authSubmitError } = await supabase.auth.signInWithPassword(credentials);

    if (authSubmitError) {
      setAuthError(authSubmitError.message || 'No se pudo completar la autenticación.');
    }

    setAuthSubmitting(false);
  };

  const handleSignOut = async () => {
    setAuthError('');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setAuthError(signOutError.message || 'No se pudo cerrar sesión.');
      return;
    }
    setSession(null);
  };

  const handleInstallApp = async () => {
    if (!installPromptEvent) return;

    installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setIsAppInstalled(true);
      setInstallPromptEvent(null);
    }
  };

  const loadTeams = async () => {
    setTeamsLoading(true);
    setTeamsError('');

    try {
      const [teamsResponse, playersResponse, lineupResponse, benchResponse] = await Promise.all([
        supabase.from("equipos_rivales").select("*").order("name", { ascending: true }),
        supabase.from("jugadores_rivales").select("*").order("name", { ascending: true }),
        supabase.from("equipo_rival_alineacion").select("*").order("slot", { ascending: true }),
        supabase.from("equipo_rival_banquillo").select("*").order("slot", { ascending: true }),
      ]);
      const failed = [teamsResponse, playersResponse, lineupResponse, benchResponse].find((response) => response.error);
      if (failed) throw failed.error;

      const playersByTeam = (playersResponse.data || []).reduce((acc, player) => {
        acc[player.equipo_rival_id] = [...(acc[player.equipo_rival_id] || []), normalizeSupabaseRivalPlayer(player)];
        return acc;
      }, {});
      Object.keys(playersByTeam).forEach((teamId) => {
        playersByTeam[teamId] = dedupeRivalPlayers(playersByTeam[teamId]);
      });
      const findLinkedRivalPlayer = (teamId, row) => {
        const teamPlayers = playersByTeam[teamId] || [];
        return (
          teamPlayers.find((player) => row.jugador_rival_id && player.id === row.jugador_rival_id) ||
          teamPlayers.find((player) => row.jugador_rival_id && player.jugadorRivalId === row.jugador_rival_id) ||
          teamPlayers.find((player) => normalizePlayerIdentityName(player.name) === normalizePlayerIdentityName(row.player_name))
        );
      };
      const lineupByTeam = (lineupResponse.data || []).reduce((acc, row) => {
        const snapshotPlayer = normalizeSupabaseRivalPlayer({
          ...(row.player_snapshot || {}),
          id: row.jugador_rival_id || row.player_name,
          jugador_rival_id: row.jugador_rival_id || null,
          name: row.player_name,
          role: row.role || 'Titular',
        });
        const linkedPlayer = findLinkedRivalPlayer(row.equipo_rival_id, row);
        const player = linkedPlayer ? { ...snapshotPlayer, ...linkedPlayer, name: row.player_name || linkedPlayer.name, role: row.role || linkedPlayer.role || 'Titular' } : snapshotPlayer;
        acc[row.equipo_rival_id] = [
          ...(acc[row.equipo_rival_id] || []),
          { ...player, role: row.role || 'Titular', slot: row.slot, x: row.x, y: row.y },
        ];
        return acc;
      }, {});
      const benchByTeam = (benchResponse.data || []).reduce((acc, row) => {
        const slots = [...(acc[row.equipo_rival_id]?.[row.starter_name] || [null, null])];
        while (slots.length < 2) slots.push(null);
        slots[row.slot] = row.player_name
          ? (() => {
              const snapshotPlayer = normalizeSupabaseRivalPlayer({
                ...(row.player_snapshot || {}),
                id: row.jugador_rival_id || row.player_name,
                jugador_rival_id: row.jugador_rival_id || null,
                name: row.player_name,
                role: 'Reserva',
              });
              const linkedPlayer = findLinkedRivalPlayer(row.equipo_rival_id, row);
              return linkedPlayer ? { ...snapshotPlayer, ...linkedPlayer, name: row.player_name || linkedPlayer.name, role: 'Reserva' } : snapshotPlayer;
            })()
          : null;
        acc[row.equipo_rival_id] = { ...(acc[row.equipo_rival_id] || {}), [row.starter_name]: slots };
        return acc;
      }, {});

      const nextTeams = (teamsResponse.data || []).map((team) => ({
        id: team.id,
        legacyId: team.legacy_id ?? null,
        name: team.name || '',
        sourceUrl: team.source_url || '',
        crest: team.crest || '',
        stadium: team.stadium || '',
        kitColor: team.kit_color || '#ef233c',
        system: team.system || '4-4-2',
        squad: playersByTeam[team.id] || [],
        lineup: lineupByTeam[team.id] || emptyLineup,
        benchChart: benchByTeam[team.id] || emptyDepthChart,
      }));

      setTeams(nextTeams);
      return nextTeams;
    } catch (loadError) {
      console.error('Error cargando equipos rivales desde Supabase:', loadError);
      setTeamsError(loadError.message || 'No se pudieron cargar los equipos.');
      return [];
    } finally {
      setTeamsLoading(false);
    }
  };

  const persistTeamLineup = async (teamId, lineup) => {
    const { error: deleteError } = await supabase.from("equipo_rival_alineacion").delete().eq("equipo_rival_id", teamId);
    if (deleteError) throw deleteError;
    const rows = (lineup || []).map((player, index) => ({
      equipo_rival_id: teamId,
      jugador_rival_id: isUuid(player.id) ? player.id : null,
      player_name: player.name,
      slot: Number.isInteger(player.slot) ? player.slot : index,
      role: player.role || 'Titular',
      x: player.x ?? null,
      y: player.y ?? null,
      player_snapshot: normalizeSquadEntry(player),
    }));
    if (!rows.length) return;
    const { error: insertError } = await supabase.from("equipo_rival_alineacion").insert(rows);
    if (insertError) throw insertError;
  };

  const persistTeamBench = async (teamId, benchChart) => {
    const { error: deleteError } = await supabase.from("equipo_rival_banquillo").delete().eq("equipo_rival_id", teamId);
    if (deleteError) throw deleteError;
    const rows = Object.entries(benchChart || {}).flatMap(([starterName, slots]) =>
      (slots || []).map((player, slot) => ({
        equipo_rival_id: teamId,
        starter_name: starterName,
        slot,
        jugador_rival_id: player && isUuid(player.id) ? player.id : null,
        player_name: player?.name || null,
        player_snapshot: player ? normalizeSquadEntry(player) : {},
      }))
    );
    if (!rows.length) return;
    const { error: insertError } = await supabase.from("equipo_rival_banquillo").insert(rows);
    if (insertError) throw insertError;
  };

  const loadPartidos = async () => {
    const { data, error: partidosError } = await supabase
      .from("partidos")
      .select("*")
      .order("date", { ascending: false, nullsFirst: false });
    if (partidosError) throw partidosError;
    const nextMatches = (data || []).map(normalizeSupabasePartido);
    setMatches(nextMatches);
    return nextMatches;
  };

  const loadHomePhrase = async () => {
    const { data, error: configError } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", homePhraseConfigKey)
      .maybeSingle();

    if (configError) {
      console.warn('No se pudo cargar la frase de Inicio desde app_config:', configError);
      setHomePhrase(defaultHomePhrase);
      setHomePhraseDraft(defaultHomePhrase);
      return defaultHomePhrase;
    }

    const nextPhrase = data?.value || defaultHomePhrase;
    setHomePhrase(nextPhrase);
    setHomePhraseDraft(nextPhrase);
    return nextPhrase;
  };

  const loadHomeDashboardData = async () => {
    setHomeLoading(true);
    setHomeError('');

    try {
      const [partidosResponse, jugadoresResponse, equiposResponse, statsResponse, goalsResponse] = await Promise.all([
        supabase.from("partidos").select("*").order("date", { ascending: true, nullsFirst: false }),
        supabase.from("jugadores").select("*").order("name", { ascending: true }),
        supabase.from("equipos_rivales").select("*").order("name", { ascending: true }),
        supabase.from("partido_estadisticas_jugador").select("*"),
        supabase.from("partido_eventos_gol").select("*"),
      ]);
      const failed = [partidosResponse, jugadoresResponse, equiposResponse, statsResponse, goalsResponse].find((response) => response.error);
      if (failed) throw failed.error;

      const nextPlayers = (jugadoresResponse.data || []).map(normalizeSupabaseJugador);
      const statsByMatch = (statsResponse.data || []).reduce((acc, row) => {
        const current = acc[row.partido_id] || {};
        current[row.player_name] = {
          role: row.role || 'Suplente',
          minutes: row.minutes ?? '',
          yellow: Boolean(row.yellow),
          yellowCount: Number(row.yellow_count || 0),
          red: Boolean(row.red),
          injured: Boolean(row.injured),
          rating: row.rating || '',
          replacementName: row.replacement_name || '',
        };
        acc[row.partido_id] = current;
        return acc;
      }, {});
      const eventsByMatch = (goalsResponse.data || []).reduce((acc, event) => {
        acc[event.partido_id] = [...(acc[event.partido_id] || []), normalizeSupabaseGoalEvent(event)];
        return acc;
      }, {});
      const nextMatches = (partidosResponse.data || []).map((match) => ({
        ...normalizeSupabasePartido(match),
        statsGoalEvents: eventsByMatch[match.id] || [],
        statsPlayerData: statsByMatch[match.id] || {},
      }));
      const baseTeams = (equiposResponse.data || []).map((team) => ({
        id: team.id,
        legacyId: team.legacy_id ?? null,
        name: team.name || '',
        sourceUrl: team.source_url || '',
        crest: team.crest || '',
        stadium: team.stadium || '',
        kitColor: team.kit_color || '#ef233c',
        system: team.system || '4-4-2',
      }));

      setPlayers(nextPlayers);
      setEmpty(nextPlayers.length === 0);
      setMatches(nextMatches);
      setTeams((currentTeams) =>
        baseTeams.map((team) => {
          const currentTeam = currentTeams.find((item) => item.id === team.id);
          return {
            ...currentTeam,
            ...team,
            squad: currentTeam?.squad || [],
            lineup: currentTeam?.lineup || emptyLineup,
            benchChart: currentTeam?.benchChart || emptyDepthChart,
          };
        })
      );

      return { players: nextPlayers, matches: nextMatches, teams: baseTeams };
    } catch (dashboardError) {
      console.error('Error cargando Inicio desde Supabase:', dashboardError);
      setHomeError(dashboardError.message || 'No se pudo cargar el dashboard de Inicio.');
      return null;
    } finally {
      setHomeLoading(false);
    }
  };

  const handleSaveHomePhrase = async () => {
    const nextPhrase = homePhraseDraft.trim() || defaultHomePhrase;
    setHomePhraseSaving(true);
    setHomePhraseStatus('');

    const { error: savePhraseError } = await supabase
      .from("app_config")
      .upsert({ key: homePhraseConfigKey, value: nextPhrase }, { onConflict: "key" });

    if (savePhraseError) {
      console.error('Error guardando la frase de Inicio en Supabase:', savePhraseError);
      setHomePhraseStatus(savePhraseError.message || 'No se pudo guardar la frase en Supabase.');
      setHomePhraseSaving(false);
      return;
    }

    setHomePhrase(nextPhrase);
    setHomePhraseDraft(nextPhrase);
    setIsEditingHomePhrase(false);
    setHomePhraseStatus('Frase guardada en Supabase.');
    setHomePhraseSaving(false);
  };

  const loadMatchStatsData = async (partidoId) => {
    setStatsRefreshing(true);
    setStatsError('');
    const [
      partidoResponse,
      convocadosResponse,
      statsResponse,
      goalsResponse,
      slotsResponse,
    ] = await Promise.all([
      supabase.from("partidos").select("*").eq("id", partidoId).single(),
      supabase.from("partido_convocados").select("*").eq("partido_id", partidoId),
      supabase.from("partido_estadisticas_jugador").select("*").eq("partido_id", partidoId),
      supabase.from("partido_eventos_gol").select("*").eq("partido_id", partidoId).order("minute", { ascending: true }),
      supabase.from("partido_alineacion_slots").select("*").eq("partido_id", partidoId).eq("scope", "stats").order("slot", { ascending: true }),
    ]);

    const responses = [partidoResponse, convocadosResponse, statsResponse, goalsResponse, slotsResponse];
    const failed = responses.find((response) => response.error);
    if (failed) {
      console.error('Error refrescando estadísticas desde Supabase después de guardar:', {
        partidoId,
        partidoError: partidoResponse.error,
        convocadosError: convocadosResponse.error,
        statsError: statsResponse.error,
        goalsError: goalsResponse.error,
        slotsError: slotsResponse.error,
      });
      setStatsError(failed.error.message || 'No se pudieron refrescar las estadísticas desde Supabase.');
      setStatsRefreshing(false);
      throw failed.error;
    }

    let quickEvents = [];
    const quickEventsResponse = await supabase
      .from("match_quick_events")
      .select("*")
      .eq("partido_id", partidoId)
      .order("minuto", { ascending: true });
    if (quickEventsResponse.error) {
      console.warn('No se pudieron cargar eventos rápidos; se continúa sin ellos:', {
        partidoId,
        error: quickEventsResponse.error,
      });
    } else {
      quickEvents = (quickEventsResponse.data || []).map(normalizeSupabaseQuickEvent);
    }

    const statsLineup = Array.from({ length: 11 }, () => '');
    (slotsResponse.data || []).forEach((slot) => {
      if (Number.isInteger(slot.slot) && slot.slot >= 0 && slot.slot < 11) statsLineup[slot.slot] = slot.player_name || '';
    });

    const statsPlayerData = {};
    (statsResponse.data || []).forEach((row) => {
      statsPlayerData[row.player_name] = {
        role: row.role || 'Suplente',
        minutes: row.minutes ?? '',
        yellow: Boolean(row.yellow),
        yellowCount: Number(row.yellow_count || 0),
        red: Boolean(row.red),
        injured: Boolean(row.injured),
        rating: row.rating || '',
        replacementName: row.replacement_name || '',
        jugadorId: row.jugador_id || null,
      };
    });

    const detailedMatch = {
      ...normalizeSupabasePartido(partidoResponse.data),
      statsCalledPlayers: (convocadosResponse.data || []).map((row) => row.player_name),
      statsPlayerData,
      statsGoalEvents: (goalsResponse.data || []).map(normalizeSupabaseGoalEvent),
      quickEvents,
      statsLineup,
    };

    setMatches((current) => {
      const exists = current.some((match) => match.id === partidoId);
      if (!exists) return [...current, detailedMatch];
      return current.map((match) => (match.id === partidoId ? { ...match, ...detailedMatch } : match));
    });
    setStatsRefreshing(false);
    return detailedMatch;
  };

  const loadMatchPreData = async (partidoId) => {
    setPreLoading(true);
    setPreError('');

    try {
      const [partidoResponse, convocadosResponse, slotsResponse, notesResponse, rivalPlayersResponse] = await Promise.all([
        supabase.from("partidos").select("*").eq("id", partidoId).single(),
        supabase.from("partido_convocados").select("*").eq("partido_id", partidoId),
        supabase.from("partido_alineacion_slots").select("*").eq("partido_id", partidoId).in("scope", ["pre_caudal", "pre_rival"]).order("slot", { ascending: true }),
        supabase.from("partido_notas_individuales_pre").select("*").eq("partido_id", partidoId),
        supabase.from("jugadores_rivales").select("*"),
      ]);

      const failed = [partidoResponse, convocadosResponse, slotsResponse, notesResponse, rivalPlayersResponse].find((response) => response.error);
      if (failed) throw failed.error;

      const preCaudalLineup = Array.from({ length: 11 }, () => '');
      const preRivalLineup = Array.from({ length: 11 }, () => '');
      const preRivalLineupPlayers = Array.from({ length: 11 }, () => null);
      const rivalPlayersById = new Map((rivalPlayersResponse.data || []).map((player) => [player.id, normalizeSupabaseRivalPlayer(player)]));
      (slotsResponse.data || []).forEach((slot) => {
        if (!Number.isInteger(slot.slot) || slot.slot < 0 || slot.slot > 10) return;
        if (slot.scope === 'pre_caudal') preCaudalLineup[slot.slot] = slot.player_name || '';
        if (slot.scope === 'pre_rival') {
          preRivalLineup[slot.slot] = slot.player_name || '';
          const snapshotPlayer = normalizeSupabaseRivalPlayer({
            ...(slot.player_snapshot || {}),
            id: slot.jugador_rival_id || slot.player_name,
            name: slot.player_name,
            role: 'Titular',
          });
          const linkedPlayer = rivalPlayersById.get(slot.jugador_rival_id);
          preRivalLineupPlayers[slot.slot] = linkedPlayer
            ? { ...snapshotPlayer, ...linkedPlayer, name: slot.player_name || linkedPlayer.name, role: 'Titular' }
            : snapshotPlayer.name
              ? snapshotPlayer
              : null;
        }
      });

      const prePlayerNotes = {};
      const preRivalPlayerNotes = {};
      (notesResponse.data || []).forEach((note) => {
        if (note.scope === 'caudal') prePlayerNotes[note.player_name] = note.note || '';
        if (note.scope === 'rival') preRivalPlayerNotes[note.player_name] = note.note || '';
      });

      const detailedMatch = {
        ...normalizeSupabasePartido(partidoResponse.data),
        statsCalledPlayers: (convocadosResponse.data || []).map((row) => row.player_name),
        preCaudalLineup,
        preRivalLineup,
        preRivalLineupPlayers,
        prePlayerNotes,
        preRivalPlayerNotes,
      };

      setMatches((current) => current.map((match) => (match.id === partidoId ? { ...match, ...detailedMatch } : match)));
      return detailedMatch;
    } catch (loadError) {
      console.error('Error cargando PRE desde Supabase:', loadError);
      setPreError(loadError.message || 'No se pudo cargar el PRE.');
      return null;
    } finally {
      setPreLoading(false);
    }
  };

  const loadMatchPostData = async (partidoId) => {
    setPostLoading(true);
    setPostError('');

    try {
      const [partidoResponse, postEventsResponse, eventTypesResponse, statsResponse, goalsResponse] = await Promise.all([
        supabase.from("partidos").select("*").eq("id", partidoId).single(),
        supabase.from("partido_eventos_post").select("*").eq("partido_id", partidoId).order("minute", { ascending: true }),
        supabase.from("tipos_evento_post").select("*").order("name", { ascending: true }),
        supabase.from("partido_estadisticas_jugador").select("*").eq("partido_id", partidoId),
        supabase.from("partido_eventos_gol").select("*").eq("partido_id", partidoId).order("minute", { ascending: true }),
      ]);

      const failed = [partidoResponse, postEventsResponse, eventTypesResponse, statsResponse, goalsResponse].find((response) => response.error);
      if (failed) throw failed.error;

      const nextEventTypes = (eventTypesResponse.data || []).map(normalizeSupabasePostEventType);
      setEventTypes(nextEventTypes);
      setSelectedEventType((current) => nextEventTypes.some((eventType) => eventType.name === current) ? current : nextEventTypes[0]?.name || '');
      setNewEventDraft((current) => ({
        ...current,
        type: nextEventTypes.some((eventType) => eventType.name === current.type) ? current.type : nextEventTypes[0]?.name || '',
      }));

      const statsPlayerData = {};
      (statsResponse.data || []).forEach((row) => {
        statsPlayerData[row.player_name] = {
          role: row.role || 'Suplente',
          minutes: row.minutes ?? '',
          yellow: Boolean(row.yellow),
          yellowCount: Number(row.yellow_count || 0),
          red: Boolean(row.red),
          injured: Boolean(row.injured),
          rating: row.rating || '',
          replacementName: row.replacement_name || '',
        };
      });

      const detailedMatch = {
        ...normalizeSupabasePartido(partidoResponse.data),
        events: (postEventsResponse.data || []).map(normalizeSupabasePostEvent),
        statsPlayerData,
        statsGoalEvents: (goalsResponse.data || []).map(normalizeSupabaseGoalEvent),
      };

      setMatches((current) => current.map((match) => (match.id === partidoId ? { ...match, ...detailedMatch } : match)));
      return detailedMatch;
    } catch (loadError) {
      console.error('Error cargando POST desde Supabase:', loadError);
      setPostError(loadError.message || 'No se pudo cargar el POST.');
      return null;
    } finally {
      setPostLoading(false);
    }
  };

  const saveMatchLineupSlot = async ({ matchId, scope, slotIndex, playerName, jugadorRivalId = null }) => {
    const player = scope === 'pre_caudal'
      ? players.find((item) => item.name === playerName)
      : getRivalAvailablePlayers().find((item) => item.name === playerName);
    const payload = {
      partido_id: matchId,
      scope,
      slot: slotIndex,
      player_name: playerName,
      jugador_id: scope === 'pre_caudal' && isUuid(player?.id) ? player.id : null,
      jugador_rival_id: scope === 'pre_rival' ? (isUuid(jugadorRivalId) ? jugadorRivalId : isUuid(player?.id) ? player.id : null) : null,
    };
    if (scope === 'pre_rival') payload.player_snapshot = player ? normalizeSquadEntry(player) : {};
    const { error: slotError } = await supabase
      .from("partido_alineacion_slots")
      .upsert(payload, { onConflict: "partido_id,scope,slot" });
    if (slotError) throw slotError;
  };

  const clearMatchLineupSlot = async ({ matchId, scope, slotIndex }) => {
    const { error: slotError } = await supabase
      .from("partido_alineacion_slots")
      .delete()
      .eq("partido_id", matchId)
      .eq("scope", scope)
      .eq("slot", slotIndex);
    if (slotError) throw slotError;
  };

  const loadGroupAnalysisData = async () => {
    setGroupLoading(true);
    setGroupError('');

    try {
      const [partidosResponse, statsResponse, goalsResponse] = await Promise.all([
        supabase.from("partidos").select("*").order("date", { ascending: true, nullsFirst: false }),
        supabase.from("partido_estadisticas_jugador").select("*"),
        supabase.from("partido_eventos_gol").select("*"),
      ]);

      const failed = [partidosResponse, statsResponse, goalsResponse].find((response) => response.error);
      if (failed) throw failed.error;

      let quickEventsRows = [];
      const quickEventsResponse = await supabase.from("match_quick_events").select("*");
      if (quickEventsResponse.error) {
        console.warn('No se pudieron cargar eventos rápidos para Análisis Grupal; se continúa sin ellos:', quickEventsResponse.error);
      } else {
        quickEventsRows = quickEventsResponse.data || [];
      }

      const statsByMatch = (statsResponse.data || []).reduce((acc, row) => {
        const current = acc[row.partido_id] || {};
        current[row.player_name] = {
          role: row.role || 'Suplente',
          minutes: row.minutes ?? '',
          yellow: Boolean(row.yellow),
          yellowCount: Number(row.yellow_count || 0),
          red: Boolean(row.red),
          injured: Boolean(row.injured),
          rating: row.rating || '',
          replacementName: row.replacement_name || '',
        };
        acc[row.partido_id] = current;
        return acc;
      }, {});

      const eventsByMatch = (goalsResponse.data || []).reduce((acc, event) => {
        acc[event.partido_id] = [...(acc[event.partido_id] || []), normalizeSupabaseGoalEvent(event)];
        return acc;
      }, {});

      const quickEventsByMatch = quickEventsRows.reduce((acc, event) => {
        acc[event.partido_id] = [...(acc[event.partido_id] || []), normalizeSupabaseQuickEvent(event)];
        return acc;
      }, {});

      setMatches((partidosResponse.data || []).map((match) => ({
        ...normalizeSupabasePartido(match),
        statsGoalEvents: eventsByMatch[match.id] || [],
        quickEvents: quickEventsByMatch[match.id] || [],
        statsPlayerData: statsByMatch[match.id] || {},
      })));
    } catch (analysisError) {
      console.error('Error cargando análisis grupal desde Supabase:', analysisError);
      setGroupError(analysisError.message || 'No se pudo cargar el análisis grupal.');
    } finally {
      setGroupLoading(false);
    }
  };

  const loadPlayerProfileData = async (player) => {
    if (!player) return null;
    setPlayerProfileLoading(true);
    setPlayerProfileError('');

    try {
      const statsRequests = [
        supabase.from("partido_estadisticas_jugador").select("*").eq("player_name", player.name),
      ];
      if (isUuid(player.id)) {
        statsRequests.push(supabase.from("partido_estadisticas_jugador").select("*").eq("jugador_id", player.id));
      }

      const quickEventRequest = isUuid(player.id)
        ? supabase.from("match_quick_events").select("*").eq("jugador_id", player.id)
        : Promise.resolve({ data: [], error: null });

      const [scoredResponse, assistedResponse, quickEventsResponse, ...statsResponses] = await Promise.all([
        supabase.from("partido_eventos_gol").select("*").eq("scorer", player.name),
        supabase.from("partido_eventos_gol").select("*").eq("assistant", player.name),
        quickEventRequest,
        ...statsRequests,
      ]);

      const failed = [scoredResponse, assistedResponse, ...statsResponses].find((response) => response.error);
      if (failed) throw failed.error;
      if (quickEventsResponse.error) {
        console.warn('No se pudieron cargar eventos rápidos de jugador; se continúa sin ellos:', {
          playerId: player.id,
          error: quickEventsResponse.error,
        });
      }

      const statsByKey = new Map();
      statsResponses.flatMap((response) => response.data || []).forEach((row) => {
        statsByKey.set(`${row.partido_id}-${row.player_name}`, row);
      });
      const statsRows = Array.from(statsByKey.values());

      const goalEventsById = new Map();
      [...(scoredResponse.data || []), ...(assistedResponse.data || [])].forEach((event) => {
        goalEventsById.set(event.id, normalizeSupabaseGoalEvent(event));
      });
      const goalEvents = Array.from(goalEventsById.values());
      const quickEvents = quickEventsResponse.error ? [] : (quickEventsResponse.data || []).map(normalizeSupabaseQuickEvent);

      const partidoIds = Array.from(new Set([
        ...statsRows.map((row) => row.partido_id),
        ...[...(scoredResponse.data || []), ...(assistedResponse.data || [])].map((event) => event.partido_id),
        ...quickEvents.map((event) => event.partidoId),
      ].filter(Boolean)));

      let partidosById = {};
      if (partidoIds.length) {
        const { data: partidoRows, error: partidosError } = await supabase.from("partidos").select("*").in("id", partidoIds);
        if (partidosError) throw partidosError;
        partidosById = Object.fromEntries((partidoRows || []).map((match) => [match.id, normalizeSupabasePartido(match)]));
      }

      const nextProfileData = { statsRows, goalEvents, quickEvents, partidosById };
      setPlayerProfileData(nextProfileData);
      return nextProfileData;
    } catch (profileError) {
      console.error('Error cargando ficha individual desde Supabase:', profileError);
      setPlayerProfileError(profileError.message || 'No se pudo cargar la ficha del jugador.');
      setPlayerProfileData(null);
      return null;
    } finally {
      setPlayerProfileLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      setAuthLoading(true);
      setAuthError('');

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (sessionError) setAuthError(sessionError.message || 'No se pudo cargar la sesión.');
      setSession(data.session ?? null);
      setAuthLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setIsSplashVisible(false), 1100);
    const removeTimer = window.setTimeout(() => setShowSplash(false), 1400);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    const isStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    setIsAppInstalled(isStandalone());

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      if (!isStandalone()) setInstallPromptEvent(event);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadJugadores = async () => {
      setLoading(true);
      setError(null);

      try {
        const jugadores = await getJugadores();
        if (!isMounted) return;
        setPlayers(jugadores);
        setEmpty(jugadores.length === 0);
      } catch (loadError) {
        if (!isMounted) return;
        setPlayers([]);
        setError(loadError.message || 'No se pudieron cargar los jugadores');
        setEmpty(false);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadJugadores();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    loadPartidos().catch((loadError) => {
      console.error('Error cargando partidos desde Supabase:', loadError);
    });
  }, []);

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (activeTab !== 'Inicio') return;
    loadHomeDashboardData();
    loadHomePhrase();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'Análisis Grupal') return;
    loadGroupAnalysisData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'Rendimiento') return;
    loadPerformanceData();
  }, [activeTab, performanceWeekStart]);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams]
  );

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? null,
    [selectedMatchId, matches]
  );

  const selectedPreAiAnalysis = useMemo(
    () => normalizePreAiAnalysis(selectedMatch?.preAiAnalysis),
    [selectedMatch?.preAiAnalysis]
  );

  const selectedPlayerProfile = useMemo(
    () => players.find((player) => player.id === selectedPlayerProfileId) ?? null,
    [selectedPlayerProfileId, players]
  );

  const normalizeLitoText = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[¿?¡!.,;:()[\]{}'"`´]/g, ' ')
      .replace(/\b(vs|versus|contra|frente a|frente al|ante|el|la|los|las|un|una|del|de|al)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const getLitoTokens = (value) =>
    normalizeLitoText(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);

  const formatLitoMatchName = (match) => {
    if (!match) return 'partido no identificado';
    const date = matchDisplayDate(match.date);
    return `${match.opponent || 'Rival sin nombre'}${date && date !== '-' ? ` (${date})` : ''}`;
  };

  const getLitoMatchScore = (match) => {
    if (!match) return 'sin marcador';
    const home = match.home_score ?? match.homeScore ?? '';
    const away = match.away_score ?? match.awayScore ?? '';
    if (home === '' && away === '') return 'sin marcador guardado';
    return `${home || 0}-${away || 0}`;
  };

  const findBestLitoRival = (question, knownRivals = []) => {
    const questionText = normalizeLitoText(question);
    const questionTokens = getLitoTokens(question);
    const scored = knownRivals
      .filter(Boolean)
      .map((rival) => {
        const rivalText = normalizeLitoText(rival);
        const rivalTokens = getLitoTokens(rival);
        let score = 0;
        if (questionText.includes(rivalText) || rivalText.includes(questionText)) score += 8;
        rivalTokens.forEach((token) => {
          if (questionTokens.includes(token)) score += 4;
          else if (questionTokens.some((questionToken) => questionToken.includes(token) || token.includes(questionToken))) score += 2;
        });
        return { rival, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0] : null;
  };

  const loadLitoContext = async () => {
    const [matchesResponse, goalsResponse, statsResponse, teamsResponse, playersResponse] = await Promise.all([
      supabase
        .from('partidos')
        .select('id,date,time,opponent,home_score,away_score,is_home,status,pre_caudal_system,pre_rival_system,rival_lineup_system,stats_system')
        .order('date', { ascending: false, nullsFirst: false })
        .limit(60),
      supabase
        .from('partido_eventos_gol')
        .select('id,partido_id,type,minute,scorer,assistant,phase,subphase,description')
        .limit(300),
      supabase
        .from('partido_estadisticas_jugador')
        .select('partido_id,player_name,minutes,yellow,yellow_count,red,rating,role')
        .limit(500),
      supabase
        .from('equipos_rivales')
        .select('id,name,system')
        .limit(200),
      supabase
        .from('jugadores')
        .select('id,name,position')
        .limit(200),
    ]);

    const failed = [matchesResponse, goalsResponse, statsResponse, teamsResponse, playersResponse].find((response) => response.error);
    if (failed) {
      console.error('Error consultando datos de Lito en Supabase:', failed.error);
      throw failed.error;
    }

    return {
      matches: matchesResponse.data || [],
      goals: goalsResponse.data || [],
      stats: statsResponse.data || [],
      teams: teamsResponse.data || [],
      players: playersResponse.data || [],
    };
  };

  const findLitoMatches = (context, question) => {
    const rivals = context.matches.map((match) => match.opponent).filter(Boolean);
    const best = findBestLitoRival(question, rivals);
    if (!best) return { rival: '', matches: [] };
    const rivalText = normalizeLitoText(best.rival);
    return {
      rival: best.rival,
      matches: context.matches.filter((match) => {
        const opponentText = normalizeLitoText(match.opponent);
        return opponentText.includes(rivalText) || rivalText.includes(opponentText) || getLitoTokens(best.rival).some((token) => opponentText.includes(token));
      }),
    };
  };

  const findLitoMatch = (context, question) => {
    const result = findLitoMatches(context, question);
    return result.matches[0] || null;
  };

  const detectLitoIntent = (question) => {
    const text = normalizeLitoText(question);
    const rawText = normalizeLitoText(String(question || '').replace(/-/g, ' '));
    if ((text.includes('partidos') || text.includes('calendario')) && (text.includes('jugamos') || text.includes('jugado') || text.includes('hasta ahora') || text.includes('ultimos'))) return 'played_matches';
    if ((text.includes('gol') || text.includes('goles') || text.includes('marco') || text.includes('marcaron') || text.includes('metio')) && (text.includes('ultimo partido') || text.includes('ultima partido'))) return 'last_match_goals';
    if (text.includes('gol') || text.includes('goles') || text.includes('marco') || text.includes('marcaron') || text.includes('metio')) return 'goals_vs_rival';
    if (text.includes('como quedo') || text.includes('resultado') || text.includes('ultimo partido')) return 'last_match';
    if (text.includes('sistema') && (text.includes('mas') || text.includes('usamos mas'))) return 'most_used_system';
    if (text.includes('sistema')) return 'system_vs_rival';
    if (text.includes('amarilla') || text.includes('tarjeta')) return 'yellow_cards';
    if (text.includes('minuto')) return 'minutes';
    if (text.includes('rivales') && (rawText.includes('4 4 2') || text.includes('442'))) return 'rivals_442';
    if (text.includes('encaj') && text.includes('transicion')) return 'conceded_transition';
    return 'unknown';
  };

  const answerLitoQuestion = (question, context) => {
    const normalizedQuestion = normalizeLitoText(question);
    const intent = detectLitoIntent(question);
    const rivalResult = findLitoMatches(context, question);
    const notFound = 'No encontré datos suficientes en Supabase para responder eso.';
    const logBase = {
      question,
      normalizedQuestion,
      intent,
      rivalDetected: rivalResult.rival || null,
      matchesFound: rivalResult.matches.length,
    };

    if (intent === 'played_matches') {
      const playedMatches = context.matches.filter((match) => match.status === 'Finalizado' || match.home_score !== null || match.away_score !== null);
      console.log('Lito debug:', { ...logBase, filters: 'played_matches', matchesFound: playedMatches.length, goalsFound: 0 });
      if (!playedMatches.length) return notFound;
      return `Partidos jugados hasta ahora:\n${playedMatches.slice(0, 10).map((match) => `- ${formatLitoMatchName(match)}: ${getLitoMatchScore(match)}`).join('\n')}`;
    }

    if (intent === 'goals_vs_rival' || intent === 'last_match_goals') {
      const matchesForGoals = intent === 'last_match_goals'
        ? [context.matches[0]].filter(Boolean)
        : rivalResult.matches;
      const goals = context.goals.filter((goal) => matchesForGoals.some((match) => match.id === goal.partido_id) && goal.type === 'Gol a favor');
      console.log('Lito debug:', { ...logBase, filters: intent, matchesFound: matchesForGoals.length, goalsFound: goals.length });
      if (!matchesForGoals.length) return notFound;
      if (!goals.length) return 'No encontré goles registrados contra ese rival.';
      const byMatch = matchesForGoals
        .map((match) => {
          const matchGoals = goals.filter((goal) => goal.partido_id === match.id);
          if (!matchGoals.length) return null;
          const details = matchGoals.map((goal) => {
            const how = [goal.phase, goal.subphase, goal.description].filter(Boolean).join(' · ');
            return `${goal.scorer || 'Sin goleador'}${goal.minute ? ` (${goal.minute}')` : ''}${how ? `: ${how}` : ''}`;
          });
          return `${rivalResult.rival ? `Encontré datos para: ${match.opponent}. ` : ''}${formatLitoMatchName(match)}: ${details.join('; ')}`;
        })
        .filter(Boolean);
      return byMatch.join('\n');
    }

    if (intent === 'last_match') {
      const match = context.matches[0];
      console.log('Lito debug:', { ...logBase, filters: 'last_match', matchesFound: match ? 1 : 0, goalsFound: context.goals.filter((goal) => goal.partido_id === match?.id).length });
      if (!match) return notFound;
      const goals = context.goals.filter((goal) => goal.partido_id === match.id);
      const scorers = goals.filter((goal) => goal.type === 'Gol a favor').map((goal) => goal.scorer).filter(Boolean);
      return `El último partido fue contra ${formatLitoMatchName(match)} y quedó ${getLitoMatchScore(match)}. ${scorers.length ? `Goles Caudal: ${scorers.join(', ')}.` : 'No tengo goleadores a favor registrados.'}`;
    }

    if (normalizedQuestion.includes('quien marco') || normalizedQuestion.includes('quién marcó')) {
      const match = normalizedQuestion.includes('ultimo partido') || normalizedQuestion.includes('último partido')
        ? context.matches[0]
        : findLitoMatch(context, question);
      if (!match) return notFound;
      const goals = context.goals.filter((goal) => goal.partido_id === match.id && goal.type === 'Gol a favor');
      if (!goals.length) return `No encontré goles a favor guardados para ${formatLitoMatchName(match)}.`;
      return `Contra ${formatLitoMatchName(match)} marcaron: ${goals.map((goal) => `${goal.scorer || 'Sin goleador'}${goal.minute ? ` (${goal.minute}')` : ''}`).join(', ')}.`;
    }

    if (intent === 'system_vs_rival') {
      const match = rivalResult.matches[0] || findLitoMatch(context, question);
      console.log('Lito debug:', { ...logBase, filters: 'system_vs_rival', matchesFound: match ? 1 : 0, goalsFound: 0 });
      if (!match) return notFound;
      const system = match.stats_system || match.pre_caudal_system || 'sin sistema guardado';
      const rivalSystem = match.pre_rival_system || match.rival_lineup_system || 'sin sistema rival guardado';
      return `Contra ${formatLitoMatchName(match)} usamos ${system}. El sistema rival guardado es ${rivalSystem}.`;
    }

    if (intent === 'yellow_cards') {
      const totals = context.stats.reduce((acc, row) => {
        const name = row.player_name || 'Sin jugador';
        acc[name] = (acc[name] || 0) + Number(row.yellow_count || (row.yellow ? 1 : 0));
        return acc;
      }, {});
      const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
      console.log('Lito debug:', { ...logBase, filters: 'yellow_cards', matchesFound: context.matches.length, goalsFound: 0 });
      if (!top || top[1] <= 0) return notFound;
      return `El jugador con más amarillas registradas es ${top[0]}, con ${top[1]}.`;
    }

    if (intent === 'minutes') {
      const totals = context.stats.reduce((acc, row) => {
        const name = row.player_name || 'Sin jugador';
        acc[name] = (acc[name] || 0) + Number(row.minutes || 0);
        return acc;
      }, {});
      const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
      console.log('Lito debug:', { ...logBase, filters: 'minutes', matchesFound: context.matches.length, goalsFound: 0 });
      if (!top || top[1] <= 0) return notFound;
      return `El jugador con más minutos registrados es ${top[0]}, con ${top[1]} minutos.`;
    }

    if (intent === 'rivals_442') {
      const rivals = context.teams.filter((team) => String(team.system || '').trim() === '4-4-2');
      console.log('Lito debug:', { ...logBase, filters: 'rivals_442', matchesFound: rivals.length, goalsFound: 0 });
      if (!rivals.length) return notFound;
      return `Rivales con 4-4-2 guardado: ${rivals.map((team) => team.name).join(', ')}.`;
    }

    if (intent === 'conceded_transition') {
      const goals = context.goals.filter((goal) => goal.type === 'Gol en contra' && normalizeLitoText(`${goal.phase || ''} ${goal.subphase || ''}`).includes('transicion'));
      console.log('Lito debug:', { ...logBase, filters: 'conceded_transition', matchesFound: context.matches.length, goalsFound: goals.length });
      return `Hay ${goals.length} goles encajados en transición registrados en Supabase.`;
    }

    if (intent === 'most_used_system') {
      const totals = context.matches.reduce((acc, match) => {
        const system = match.stats_system || match.pre_caudal_system;
        if (!system) return acc;
        acc[system] = (acc[system] || 0) + 1;
        return acc;
      }, {});
      const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
      console.log('Lito debug:', { ...logBase, filters: 'most_used_system', matchesFound: context.matches.length, goalsFound: 0 });
      if (!top) return notFound;
      return `El sistema más usado en los partidos guardados es ${top[0]}, con ${top[1]} partidos.`;
    }

    console.log('Lito debug:', { ...logBase, filters: 'unknown', goalsFound: 0 });
    return notFound;
  };

  const handleLitoSubmit = async (event) => {
    event.preventDefault();
    const question = litoQuestion.trim();
    if (!question || litoLoading) return;

    setLitoMessages((current) => [...current, { role: 'user', text: question }]);
    setLitoQuestion('');
    setLitoLoading(true);

    try {
      const context = await loadLitoContext();
      const answer = answerLitoQuestion(question, context);
      setLitoMessages((current) => [...current, { role: 'assistant', text: answer }]);
    } catch (litoError) {
      console.error('Error respondiendo con Lito:', litoError);
      setLitoMessages((current) => [
        ...current,
        { role: 'assistant', text: 'No encontré datos suficientes en Supabase para responder eso.' },
      ]);
    } finally {
      setLitoLoading(false);
    }
  };

  const addDays = (dateString, days) => {
    const date = new Date(`${dateString}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const performanceWeekEnd = addDays(performanceWeekStart, 6);

  const normalizePerformanceNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  const getWellnessScore = (entry) => {
    if (!entry) return null;
    const values = [
      entry.sleep_quality,
      entry.mood,
      11 - normalizePerformanceNumber(entry.fatigue),
      11 - normalizePerformanceNumber(entry.muscle_soreness),
      11 - normalizePerformanceNumber(entry.stress),
    ].map(Number).filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const getPerformancePlayerName = (playerId) =>
    players.find((player) => player.id === playerId)?.name || 'Jugador';

  const loadPerformanceData = async () => {
    setPerformanceLoading(true);
    setPerformanceError('');
    const weekEnd = addDays(performanceWeekStart, 6);

    try {
      const [sessionsResponse, wellnessResponse, rpeResponse, statsResponse] = await Promise.all([
        supabase
          .from('training_sessions')
          .select('*')
          .gte('session_date', performanceWeekStart)
          .lte('session_date', weekEnd)
          .order('session_date', { ascending: true }),
        supabase
          .from('wellness_entries')
          .select('*')
          .gte('entry_date', performanceWeekStart)
          .lte('entry_date', weekEnd)
          .order('entry_date', { ascending: true }),
        supabase
          .from('rpe_entries')
          .select('*')
          .gte('entry_date', performanceWeekStart)
          .lte('entry_date', weekEnd)
          .order('entry_date', { ascending: true }),
        supabase
          .from('partido_estadisticas_jugador')
          .select('player_name,minutes')
      ]);

      const failed = [sessionsResponse, wellnessResponse, rpeResponse, statsResponse].find((response) => response.error);
      if (failed) {
        console.error('Error cargando Rendimiento desde Supabase:', failed.error);
        throw failed.error;
      }

      setTrainingSessions(sessionsResponse.data || []);
      setWellnessEntries(wellnessResponse.data || []);
      setRpeEntries(rpeResponse.data || []);
      setPerformanceMatchStats(statsResponse.data || []);
    } catch (loadError) {
      console.error('Error cargando Rendimiento:', loadError);
      setPerformanceError(loadError.message || 'No se pudo cargar Rendimiento. Revisa que hayas ejecutado supabase_rendimiento.sql.');
    } finally {
      setPerformanceLoading(false);
    }
  };

  const saveTrainingSession = async (event) => {
    event.preventDefault();
    setPerformanceStatus('');
    setPerformanceError('');
    const payload = {
      session_date: performanceSessionDraft.sessionDate,
      microcycle_label: performanceSessionDraft.microcycleLabel || `Semana ${performanceWeekStart}`,
      md_label: performanceSessionDraft.mdLabel,
      form_code: performanceSessionDraft.formCode || null,
      title: performanceSessionDraft.title || performanceSessionDraft.sessionType,
      session_type: performanceSessionDraft.sessionType,
      planned_duration: performanceSessionDraft.plannedDuration ? Number(performanceSessionDraft.plannedDuration) : null,
      notes: performanceSessionDraft.notes || '',
    };
    const { error: sessionError } = await supabase.from('training_sessions').insert(payload);
    if (sessionError) {
      console.error('Error guardando sesión de Rendimiento:', { payload, error: sessionError });
      setPerformanceError(sessionError.message || 'No se pudo guardar la sesión.');
      return;
    }
    setPerformanceStatus('Sesión guardada en Supabase.');
    setPerformanceSessionDraft((current) => ({ ...current, formCode: '', title: '', plannedDuration: '', notes: '' }));
    await loadPerformanceData();
  };

  const saveWellnessEntry = async (event) => {
    event.preventDefault();
    if (!wellnessDraft.jugadorId) {
      setPerformanceError('Selecciona un jugador para guardar wellness.');
      return;
    }
    setPerformanceStatus('');
    setPerformanceError('');
    const payload = {
      jugador_id: wellnessDraft.jugadorId,
      entry_date: wellnessDraft.entryDate,
      sleep_hours: wellnessDraft.sleepHours ? Number(wellnessDraft.sleepHours) : null,
      sleep_quality: Number(wellnessDraft.sleepQuality),
      fatigue: Number(wellnessDraft.fatigue),
      muscle_soreness: Number(wellnessDraft.muscleSoreness),
      stress: Number(wellnessDraft.stress),
      mood: Number(wellnessDraft.mood),
      weight: wellnessDraft.weight ? Number(wellnessDraft.weight) : null,
      discomfort: wellnessDraft.discomfort || '',
      comment: wellnessDraft.comment || '',
    };
    const { error: wellnessError } = await supabase
      .from('wellness_entries')
      .upsert(payload, { onConflict: 'jugador_id,entry_date' });
    if (wellnessError) {
      console.error('Error guardando wellness en Supabase:', { payload, error: wellnessError });
      setPerformanceError(wellnessError.message || 'No se pudo guardar wellness.');
      return;
    }
    setPerformanceStatus('Wellness guardado en Supabase.');
    await loadPerformanceData();
  };

  const saveRpeEntry = async (event) => {
    event.preventDefault();
    if (!rpeDraft.jugadorId || !rpeDraft.sessionId) {
      setPerformanceError('Selecciona jugador y sesión para guardar RPE.');
      return;
    }
    const session = trainingSessions.find((item) => item.id === rpeDraft.sessionId);
    setPerformanceStatus('');
    setPerformanceError('');
    const payload = {
      jugador_id: rpeDraft.jugadorId,
      session_id: rpeDraft.sessionId,
      entry_date: session?.session_date || performanceWeekStart,
      duration_minutes: Number(rpeDraft.durationMinutes || session?.planned_duration || 0),
      rpe: Number(rpeDraft.rpe),
      comment: rpeDraft.comment || '',
    };
    const { error: rpeError } = await supabase
      .from('rpe_entries')
      .upsert(payload, { onConflict: 'jugador_id,session_id' });
    if (rpeError) {
      console.error('Error guardando RPE en Supabase:', { payload, error: rpeError });
      setPerformanceError(rpeError.message || 'No se pudo guardar RPE.');
      return;
    }
    setPerformanceStatus('RPE guardado en Supabase.');
    await loadPerformanceData();
  };

  const getPerformancePlayerRows = () => players.map((player) => {
    const wellness = wellnessEntries.filter((entry) => entry.jugador_id === player.id);
    const rpes = rpeEntries.filter((entry) => entry.jugador_id === player.id);
    const latestWellness = [...wellness].sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)))[0];
    const wellnessScores = wellness.map(getWellnessScore).filter((score) => score !== null);
    const totalLoad = rpes.reduce((sum, entry) => sum + normalizePerformanceNumber(entry.load ?? normalizePerformanceNumber(entry.duration_minutes) * normalizePerformanceNumber(entry.rpe)), 0);
    const totalMinutes = rpes.reduce((sum, entry) => sum + normalizePerformanceNumber(entry.duration_minutes), 0);
    const avgRpe = rpes.length ? rpes.reduce((sum, entry) => sum + normalizePerformanceNumber(entry.rpe), 0) / rpes.length : 0;
    const repeatedHighRpe = rpes.filter((entry) => normalizePerformanceNumber(entry.rpe) >= 8).length >= 2;
    const hasDiscomfort = Boolean([latestWellness?.discomfort, latestWellness?.comment, ...rpes.map((entry) => entry.comment)].join(' ').match(/molest|dolor|carga|tocado|fatiga/i));
    const red = latestWellness && (
      normalizePerformanceNumber(latestWellness.fatigue) >= 8 ||
      normalizePerformanceNumber(latestWellness.muscle_soreness) >= 8 ||
      normalizePerformanceNumber(latestWellness.stress) >= 8 ||
      normalizePerformanceNumber(latestWellness.sleep_quality) <= 2
    );
    const yellow = !red && (
      normalizePerformanceNumber(latestWellness?.sleep_quality) <= 3 ||
      repeatedHighRpe ||
      hasDiscomfort
    );
    const status = red ? 'rojo' : yellow ? 'amarillo' : 'verde';
    const matchMinutes = performanceMatchStats
      .filter((row) => row.player_name === player.name)
      .reduce((sum, row) => sum + normalizePerformanceNumber(row.minutes), 0);

    return {
      player,
      wellness,
      latestWellness,
      wellnessScore: wellnessScores.length ? wellnessScores.reduce((sum, score) => sum + score, 0) / wellnessScores.length : null,
      totalLoad,
      totalMinutes,
      avgRpe,
      status,
      matchMinutes,
      repeatedHighRpe,
      hasDiscomfort,
    };
  });

  const getPerformanceDashboard = () => {
    const rows = getPerformancePlayerRows();
    const totalLoad = rows.reduce((sum, row) => sum + row.totalLoad, 0);
    const totalVolume = rows.reduce((sum, row) => sum + row.totalMinutes, 0);
    const rpeValues = rpeEntries.map((entry) => normalizePerformanceNumber(entry.rpe)).filter(Boolean);
    const wellnessScores = rows.map((row) => row.wellnessScore).filter((score) => score !== null);
    const dailyLoad = trainingSessions.map((session) => {
      const load = rpeEntries
        .filter((entry) => entry.session_id === session.id)
        .reduce((sum, entry) => sum + normalizePerformanceNumber(entry.load ?? normalizePerformanceNumber(entry.duration_minutes) * normalizePerformanceNumber(entry.rpe)), 0);
      return { session, load };
    });
    const peak = [...dailyLoad].sort((a, b) => b.load - a.load)[0];
    const riskRows = rows.filter((row) => row.status !== 'verde');
    return {
      rows,
      totalLoad,
      totalVolume,
      avgRpe: rpeValues.length ? rpeValues.reduce((sum, value) => sum + value, 0) / rpeValues.length : 0,
      avgWellness: wellnessScores.length ? wellnessScores.reduce((sum, value) => sum + value, 0) / wellnessScores.length : null,
      dailyLoad,
      peak,
      topLoad: [...rows].sort((a, b) => b.totalLoad - a.totalLoad).slice(0, 5),
      topFatigue: [...rows].sort((a, b) => normalizePerformanceNumber(b.latestWellness?.fatigue) - normalizePerformanceNumber(a.latestWellness?.fatigue)).slice(0, 5),
      riskRows,
    };
  };

  const getPerformanceReport = () => {
    const dashboard = getPerformanceDashboard();
    const intensity = dashboard.totalLoad > 6000 ? 'alta' : dashboard.totalLoad > 3000 ? 'media-alta' : 'controlada';
    const peakText = dashboard.peak?.load ? ` Pico de carga en ${dashboard.peak.session.md_label || dashboard.peak.session.session_date}.` : '';
    const riskText = dashboard.riskRows.length
      ? ` ${dashboard.riskRows.slice(0, 4).map((row) => row.player.name).join(', ')} presentan indicadores a vigilar.`
      : ' Sin alertas relevantes en el semáforo PF.';
    const wellnessText = dashboard.avgWellness
      ? ` Wellness grupal medio ${dashboard.avgWellness.toFixed(1)}/10.`
      : ' Sin wellness suficiente para valorar tendencia grupal.';
    return `Microciclo con carga ${intensity}.${peakText}${riskText}${wellnessText}`;
  };

  useEffect(() => {
    setMatches((current) =>
      current.map((match) => {
        const rivalTeam = findTeamByDisplayName(teams, match.opponent);
        if (!rivalTeam) return match;
        const nextMatch = {
          ...match,
          opponent: cleanTeamDisplayName(rivalTeam.name),
          opponentCrest: rivalTeam.crest || match.opponentCrest,
          preRivalSystem: match.preRivalSystem || rivalTeam.system,
        };
        return nextMatch.opponent === match.opponent &&
          nextMatch.opponentCrest === match.opponentCrest &&
          nextMatch.preRivalSystem === match.preRivalSystem
          ? match
          : nextMatch;
      })
    );
  }, [teams]);

  useEffect(() => {
    if (!selectedMatch?.postVideoLink || matchView !== 'post_partido') {
      postYoutubePlayerRef.current = null;
      setPostVideoDuration(0);
      setPostYoutubeReady(false);
      return;
    }

    let cancelled = false;
    const initializePlayer = () => {
      if (cancelled || !postYoutubeIframeRef.current || !window.YT?.Player) return;
      try {
        postYoutubePlayerRef.current = new window.YT.Player(postYoutubeIframeRef.current, {
          events: {
            onReady: (event) => {
              if (cancelled) return;
              setPostYoutubeReady(true);
              const duration = Number(event.target.getDuration?.() || 0);
              if (duration > 0) setPostVideoDuration(duration);
            },
            onStateChange: (event) => {
              const duration = Number(event.target.getDuration?.() || 0);
              if (duration > 0) setPostVideoDuration(duration);
            },
          },
        });
      } catch (playerError) {
        console.error('Error inicializando YouTube iframe API para POST:', playerError);
      }
    };

    if (window.YT?.Player) {
      initializePlayer();
    } else {
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        initializePlayer();
      };
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      setPostYoutubeReady(false);
      try {
        postYoutubePlayerRef.current?.destroy?.();
      } catch {
        // YouTube may already have removed the iframe during React unmount.
      }
      postYoutubePlayerRef.current = null;
    };
  }, [selectedMatch?.postVideoLink, matchView]);

  const updateSelectedMatchFields = async (fields) => {
    if (!selectedMatch) return;
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, ...fields } : match)));
    const payload = Object.fromEntries(
      Object.entries(fields)
        .filter(([field]) => partidoWritableFieldMap[field])
        .map(([field, value]) => [partidoWritableFieldMap[field], value])
    );
    if (!Object.keys(payload).length) return;
    const { error: updateError } = await supabase.from("partidos").update(payload).eq("id", selectedMatch.id);
    if (updateError) {
      const isPostUpdate = Object.keys(fields).some((field) => partidoPostFieldMap[field]);
      console.error(`Error guardando campos ${isPostUpdate ? 'POST' : 'PRE'} en Supabase:`, {
        matchId: selectedMatch.id,
        fields,
        payload,
        error: updateError,
      });
      if (isPostUpdate) setPostError(updateError.message || 'No se pudo guardar el POST.');
      else setPreError(updateError.message || 'No se pudo guardar el PRE.');
      return;
    }
    if (Object.keys(fields).some((field) => partidoPostFieldMap[field])) await loadMatchPostData(selectedMatch.id);
    else await loadMatchPreData(selectedMatch.id);
  };

  const handlePostVideoLinkChange = (value) => {
    setPostVideoSaveStatus('');
    setMatches((current) => current.map((match) => (match.id === selectedMatch?.id ? { ...match, postVideoLink: value } : match)));
  };

  const savePostVideoLink = async () => {
    if (!selectedMatch) return;
    const nextVideoLink = selectedMatch.postVideoLink || '';
    setPostVideoSaveStatus('Guardando vídeo...');
    const { error: videoError } = await supabase
      .from("partidos")
      .update({ post_video_link: nextVideoLink })
      .eq("id", selectedMatch.id);
    if (videoError) {
      console.error('Error guardando enlace de vídeo POST en Supabase:', {
        matchId: selectedMatch.id,
        postVideoLink: nextVideoLink,
        error: videoError,
      });
      setPostError(videoError.message || 'No se pudo guardar el enlace de vídeo POST.');
      setPostVideoSaveStatus('Error al guardar vídeo');
      return;
    }
    setPostVideoSaveStatus('Vídeo guardado');
  };

  const parseLineupText = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);
  const formatLineupText = (lineup) => (lineup || []).join('\n');
  const getYouTubeEmbedUrl = (url, startSeconds = 0) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/);
    if (!match) return null;
    const start = Number(startSeconds) > 0 ? `&start=${Math.floor(Number(startSeconds))}` : '';
    return `https://www.youtube.com/embed/${match[1]}?enablejsapi=1${start}`;
  };
  const getCanvaEmbedUrl = (url) => {
    if (!url) return null;
    try {
      const canvaUrl = new URL(url);
      if (!canvaUrl.hostname.includes('canva.com')) return null;
      canvaUrl.searchParams.set('embed', '');
      return canvaUrl.toString();
    } catch {
      return null;
    }
  };

  const eventButtonClass = (typeOrColor) => {
    const color = eventColorOptions.includes(typeOrColor)
      ? typeOrColor
      : eventTypes.find((eventType) => eventType.name === typeOrColor)?.color || 'slate';
    switch (color) {
      case 'emerald':
        return 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30';
      case 'red':
        return 'bg-red-500/20 text-red-300 hover:bg-red-500/30';
      case 'sky':
        return 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30';
      case 'violet':
        return 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30';
      case 'amber':
        return 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30';
      case 'orange':
        return 'bg-amber-700/20 text-amber-200 hover:bg-amber-700/30';
      default:
        return 'bg-white/10 text-slate-200 hover:bg-white/15';
    }
  };

  const getRivalBaseTeam = () => {
    if (!selectedMatch?.opponent) return null;
    return findTeamByDisplayName(teams, selectedMatch.opponent);
  };

  const getCurrentRivalLineup = () => {
    if (selectedMatch?.preRivalLineup?.length) return selectedMatch.preRivalLineup;
    if (selectedMatch?.rivalLineupPlayers?.length) return selectedMatch.rivalLineupPlayers.map((player) => player.name);
    return [];
  };

  const getRivalAvailablePlayers = () => {
    const linkedPlayers = (getRivalBaseTeam()?.squad || []).map(normalizeSquadEntry);
    const manualPlayers = (selectedMatch?.preRivalManualPlayers || []).map((player) =>
      typeof player === 'string' ? { ...createBlankTeamPlayer(), name: player } : normalizeSquadEntry(player)
    );
    const byName = new Map();
    [...linkedPlayers, ...manualPlayers].forEach((player) => {
      if (player.name) byName.set(player.name, player);
    });
    return Array.from(byName.values());
  };

  const getRivalLineupPlayerForSlot = (slotIndex, playerName) => {
    const slotPlayer = selectedMatch?.preRivalLineupPlayers?.[slotIndex];
    if (slotPlayer?.name) return normalizeSquadEntry(slotPlayer);
    return getRivalAvailablePlayers().find((player) => player.name === playerName) || null;
  };

  const getCurrentRivalSystem = () => selectedMatch?.preRivalSystem || selectedMatch?.rivalLineupSystem || '4-4-2';

  const getSystemStructure = (system) => {
    const parts = String(system || '4-4-2').match(/\d+/g)?.map(Number) || [4, 4, 2];
    const defenders = parts[0] || 4;
    const attackers = parts[parts.length - 1] || 2;
    const midfielders = parts.slice(1, -1).reduce((sum, part) => sum + part, 0) || 4;
    return { defenders, midfielders, attackers };
  };

  const buildSystemTacticalReading = (caudalSystem, rivalSystem) => {
    const caudal = getSystemStructure(caudalSystem);
    const rival = getSystemStructure(rivalSystem);
    const midfieldDiff = caudal.midfielders - rival.midfielders;
    const wingBackRival = rival.defenders >= 5;
    const caudalBackFour = caudal.defenders === 4;
    const reading = {
      advantages: [],
      risks: [],
      attackZones: [],
      protectZones: [],
      adjustments: [],
    };

    if (midfieldDiff > 0) {
      reading.advantages.push(`Superioridad interior: ${caudal.midfielders} medios contra ${rival.midfielders}.`);
      reading.attackZones.push('Recibir entre líneas y activar tercer hombre por dentro.');
    } else if (midfieldDiff < 0) {
      reading.risks.push(`Riesgo de inferioridad por dentro: ${caudal.midfielders} medios contra ${rival.midfielders}.`);
      reading.protectZones.push('Cerrar carril central y orientar la presión hacia banda.');
      reading.adjustments.push('Acercar un delantero o extremo al pivote rival cuando progresen por dentro.');
    } else {
      reading.advantages.push('Igualdad interior: decidir por orientación corporal, apoyos cercanos y ritmo de circulación.');
    }

    if (rival.attackers >= 3 && caudalBackFour) {
      reading.risks.push('Sus tres atacantes pueden fijar centrales y atacar espalda de laterales.');
      reading.protectZones.push('Espalda de nuestros laterales y distancia central-lateral.');
      reading.adjustments.push('Extremo del lado débil preparado para cerrar lateral rival y proteger segundo palo.');
    }

    if (wingBackRival) {
      reading.attackZones.push('Espalda de carrileros si saltan alto.');
      reading.protectZones.push('Centros laterales y segundo palo.');
      reading.adjustments.push('Atacar rápido tras robo a la espalda del carrilero alejado.');
    }

    if (caudal.attackers >= 2 && rival.defenders <= 4) {
      reading.advantages.push('Dos puntas pueden fijar centrales y liberar segunda jugada.');
      reading.attackZones.push('Intervalos central-lateral y rechace frontal.');
    }

    if (caudalSystem === '4-4-2' && rivalSystem === '4-3-3') {
      reading.risks.push('Su pivote puede quedar libre si nuestros puntas no coordinan saltos.');
      reading.adjustments.push('Un punta tapa pivote y el otro orienta hacia central menos dominante.');
    }
    if (caudalSystem === '4-2-3-1' && rivalSystem === '4-4-2') {
      reading.advantages.push('El mediapunta puede recibir a la espalda de sus dos medios.');
      reading.attackZones.push('Zona del 10, especialmente tras atraer a sus centrales.');
    }
    if (caudalSystem === '4-3-3' && rivalSystem === '5-3-2') {
      reading.advantages.push('Extremos abiertos pueden fijar carrileros y aislar uno contra uno.');
      reading.risks.push('Si perdemos por dentro, sus dos puntas quedan listos para transición.');
      reading.adjustments.push('Pivote siempre por detrás de balón para cortar primera transición.');
    }

    Object.keys(reading).forEach((key) => {
      if (!reading[key].length) reading[key].push('Sin lectura específica todavía: completar con comportamiento real del rival.');
    });
    return {
      caudalSystem,
      rivalSystem,
      generatedAt: new Date().toISOString(),
      ...reading,
    };
  };

  const defaultSystemMatchups = (caudalSystem, rivalSystem) => [
    {
      zone: 'Carril central',
      duel: `${caudalSystem} vs ${rivalSystem}`,
      reading: 'Controlar superioridades interiores y orientación de la presión.',
      action: 'Ajustar distancia entre puntas, pivote y centrales.',
    },
    {
      zone: 'Bandas',
      duel: 'Lateral/extremo vs banda rival',
      reading: 'Decidir cuándo saltar y cuándo proteger espalda.',
      action: 'Activar ayudas del extremo y vigilar segundo palo.',
    },
  ];

  const generateSystemReading = () => {
    if (!selectedMatch) return;
    const caudalSystem = selectedMatch.preCaudalSystem || '4-4-2';
    const rivalSystem = getCurrentRivalSystem();
    updateSelectedMatchFields({
      preSystemReading: buildSystemTacticalReading(caudalSystem, rivalSystem),
      preKeyMatchupsTable: selectedMatch.preKeyMatchupsTable?.length ? selectedMatch.preKeyMatchupsTable : defaultSystemMatchups(caudalSystem, rivalSystem),
    });
  };

  const updateSystemMatchup = (index, field, value) => {
    const current = selectedMatch?.preKeyMatchupsTable?.length ? selectedMatch.preKeyMatchupsTable : defaultSystemMatchups(selectedMatch?.preCaudalSystem || '4-4-2', getCurrentRivalSystem());
    const next = current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row));
    updateSelectedMatchFields({ preKeyMatchupsTable: next });
  };

  const addSystemMatchup = () => {
    const current = selectedMatch?.preKeyMatchupsTable || [];
    updateSelectedMatchFields({ preKeyMatchupsTable: [...current, { zone: '', duel: '', reading: '', action: '' }] });
  };

  const removeSystemMatchup = (index) => {
    const current = selectedMatch?.preKeyMatchupsTable || [];
    updateSelectedMatchFields({ preKeyMatchupsTable: current.filter((_, rowIndex) => rowIndex !== index) });
  };

  const buildTacticalQuestionAnswer = (mode, question) => {
    const caudalSystem = selectedMatch?.preCaudalSystem || '4-4-2';
    const rivalSystem = getCurrentRivalSystem();
    const caudal = getSystemStructure(caudalSystem);
    const rival = getSystemStructure(rivalSystem);
    const caudalLineup = safeArray(selectedMatch?.preCaudalLineup);
    const rivalLineup = safeArray(selectedMatch?.preRivalLineup);
    const hasCaudalNames = caudalLineup.some(Boolean);
    const hasRivalNames = rivalLineup.some(Boolean);
    const safeQuestion = String(question || '');
    const q = safeQuestion.toLowerCase();

    if (mode === 'Micro' || /jugador|duelo|vigilar|marca/i.test(safeQuestion)) {
      const caudalRefs = hasCaudalNames ? caudalLineup.filter(Boolean).slice(0, 3).join(', ') : 'nuestros jugadores de carril central';
      const rivalRefs = hasRivalNames ? rivalLineup.filter(Boolean).slice(0, 3).join(', ') : 'sus referencias ofensivas';
      return `Lectura micro: relaciona ${caudalRefs} contra ${rivalRefs}. Prioridad: ganar la primera orientación corporal, cerrar pase interior y activar ayuda cercana tras pérdida. Si el duelo está en banda, que nuestro extremo llegue a tiempo para que el lateral no defienda dos alturas.`;
    }

    if (q.includes('bloque') || q.includes('atacamos')) {
      return `Para atacar su ${rivalSystem}, mueve el balón hasta fijar su primera línea y acelera cuando el lado débil quede abierto. Contra ${rival.midfielders} medios rivales, necesitamos apoyos cortos por dentro y una amenaza a espalda para que no puedan saltar todos hacia balón.`;
    }
    if (q.includes('superioridad')) {
      const diff = caudal.midfielders - rival.midfielders;
      return diff >= 0
        ? `La superioridad más clara puede estar por dentro: ${caudal.midfielders} medios nuestros contra ${rival.midfielders} rivales. Hay que atraer a un medio rival y encontrar tercer hombre entre líneas.`
        : `No tenemos superioridad natural por dentro: ${caudal.midfielders} contra ${rival.midfielders}. La ventaja debe buscarse por fuera, con cambios de orientación y atacando la espalda del lateral/carrilero.`;
    }
    if (q.includes('pérdida') || q.includes('perdida') || q.includes('transiciones')) {
      return `Tras pérdida, el riesgo principal es quedar partidos entre nuestra línea de medios y centrales. Primer ajuste: pérdida por dentro exige falta táctica o presión inmediata; pérdida por fuera exige cerrar pase interior y proteger segundo palo.`;
    }
    if (q.includes('vigilar')) {
      return `El jugador rival a vigilar debe ser el que conecte transición y último pase. Si no hay nombre definido, prioriza su punta o extremo del lado fuerte: no permitir que reciba girado ni que ataque la espalda sin contacto previo.`;
    }
    if (q.includes('ajuste') || q.includes('progresamos')) {
      return `Si no progresamos, baja un apoyo entre centrales o acerca el mediapunta al pivote para crear una salida de tres más un hombre libre. Si aun así nos fijan, saltar al lado débil antes de conducir por dentro.`;
    }

    return `Lectura macro: ${caudalSystem} contra ${rivalSystem}. Queremos que el partido se juegue donde podamos juntar pases cortos y activar el lado débil. Evitar pérdidas interiores sin cobertura y ajustar la presión para que el rival no encuentre al hombre libre a espalda de nuestra primera línea.`;
  };

  const askTacticalQuestion = () => {
    if (!selectedMatch) return;
    const question = tacticalQuestionText.trim() || '¿Dónde tenemos superioridad?';
    const answer = buildTacticalQuestionAnswer(tacticalQuestionMode, question);
    updateSelectedMatchFields({
      preAiAnalysis: {
        ...(selectedPreAiAnalysis || {}),
        tacticalQuestion: {
          mode: tacticalQuestionMode,
          question,
          answer,
          createdAt: new Date().toISOString(),
          context: {
            caudalSystem: selectedMatch.preCaudalSystem || '4-4-2',
            rivalSystem: getCurrentRivalSystem(),
            caudalLineup: safeArray(selectedMatch.preCaudalLineup),
            rivalLineup: safeArray(selectedMatch.preRivalLineup),
          },
        },
      },
    });
  };

  const clearTacticalQuestion = () => {
    if (!selectedMatch) return;
    updateSelectedMatchFields({
      preAiAnalysis: {
        ...(selectedPreAiAnalysis || {}),
        tacticalQuestion: null,
      },
    });
    setTacticalQuestionText('');
  };

  const getTacticalQuestionnaire = () => ({
    preRivalStyle: selectedMatch?.preRivalStyle || '',
    preRivalStrengths: selectedMatch?.preRivalStrengths || '',
    preRivalWeaknesses: selectedMatch?.preRivalWeaknesses || '',
    preRivalBuildUp: selectedMatch?.preRivalBuildUp || 'Combinativo',
    preRivalDefensiveBlock: selectedMatch?.preRivalDefensiveBlock || 'Medio',
    preRivalPressure: selectedMatch?.preRivalPressure || 'Media',
    preRivalTransitions: selectedMatch?.preRivalTransitions || 'Equilibradas',
    preRivalOffensiveOrganization: selectedMatch?.preRivalOffensiveOrganization || '',
    preRivalBaseSystem: selectedMatch?.preRivalBaseSystem || '',
    preRivalStartPlay: selectedMatch?.preRivalStartPlay || '',
    preRivalProgression: selectedMatch?.preRivalProgression || '',
    preRivalFinishing: selectedMatch?.preRivalFinishing || '',
    preRivalOffensiveKeyPlayers: selectedMatch?.preRivalOffensiveKeyPlayers || '',
    preRivalDangerZones: selectedMatch?.preRivalDangerZones || '',
    preRivalWideAttack: selectedMatch?.preRivalWideAttack || '',
    preRivalBoxOccupation: selectedMatch?.preRivalBoxOccupation || '',
    preRivalDefensiveOrganization: selectedMatch?.preRivalDefensiveOrganization || '',
    preRivalDefensiveSystem: selectedMatch?.preRivalDefensiveSystem || '',
    preRivalBlockHeightDetail: selectedMatch?.preRivalBlockHeightDetail || '',
    preRivalPressureType: selectedMatch?.preRivalPressureType || '',
    preRivalSpacesAllowed: selectedMatch?.preRivalSpacesAllowed || '',
    preRivalDefendsCrosses: selectedMatch?.preRivalDefendsCrosses || '',
    preRivalDefendsBack: selectedMatch?.preRivalDefendsBack || '',
    preRivalSecondBallDefense: selectedMatch?.preRivalSecondBallDefense || '',
    preRivalAfterLoss: selectedMatch?.preRivalAfterLoss || '',
    preRivalAfterRecovery: selectedMatch?.preRivalAfterRecovery || '',
    preRivalTransitionLaunchers: selectedMatch?.preRivalTransitionLaunchers || '',
    preRivalBestRunningZones: selectedMatch?.preRivalBestRunningZones || '',
    preRivalCornersFor: selectedMatch?.preRivalCornersFor || '',
    preRivalCornersAgainst: selectedMatch?.preRivalCornersAgainst || '',
    preRivalWideFreeKicks: selectedMatch?.preRivalWideFreeKicks || '',
    preRivalSetPieceTakers: selectedMatch?.preRivalSetPieceTakers || '',
    preRivalMainHeaders: selectedMatch?.preRivalMainHeaders || '',
    preCaudalIntent: selectedMatch?.preCaudalIntent || '',
    preCaudalBuildPlan: selectedMatch?.preCaudalBuildPlan || '',
    preCaudalStartPlay: selectedMatch?.preCaudalStartPlay || '',
    preCaudalProgressionPlan: selectedMatch?.preCaudalProgressionPlan || '',
    preCaudalAttackZones: selectedMatch?.preCaudalAttackZones || '',
    preCaudalPlayersToActivate: selectedMatch?.preCaudalPlayersToActivate || '',
    preCaudalSpacesToFind: selectedMatch?.preCaudalSpacesToFind || '',
    preCaudalPressPlan: selectedMatch?.preCaudalPressPlan || '',
    preCaudalRivalsToBlock: selectedMatch?.preCaudalRivalsToBlock || '',
    preCaudalDefendStrengths: selectedMatch?.preCaudalDefendStrengths || '',
    preCaudalAvoid: selectedMatch?.preCaudalAvoid || '',
    preCaudalAfterLoss: selectedMatch?.preCaudalAfterLoss || '',
    preCaudalAfterRecovery: selectedMatch?.preCaudalAfterRecovery || '',
    preKeyMatchups: selectedMatch?.preKeyMatchups || '',
    preCaudalPlayerToBoost: selectedMatch?.preCaudalPlayerToBoost || '',
    preRivalPlayerToWatch: selectedMatch?.preRivalPlayerToWatch || '',
    preImportantDuels: selectedMatch?.preImportantDuels || '',
    preAiSupportNotes: selectedMatch?.preAiSupportNotes || '',
  });

  const getAiInputSummary = () => {
    const questionnaire = getTacticalQuestionnaire();
    const rivalNotes = selectedMatch?.preRivalPlayerNotes || {};
    const caudalNotes = selectedMatch?.prePlayerNotes || {};
    const rivalPlayersWithNotes = Object.entries(rivalNotes).filter(([, value]) => String(value || '').trim());
    const caudalPlayersWithNotes = Object.entries(caudalNotes).filter(([, value]) => String(value || '').trim());
    const hasRivalReportText = Boolean(String(selectedMatch?.preRivalReportText || '').trim());
    const importantInputs = [
      ['Texto informe rival', hasRivalReportText ? 'Disponible como fuente del cuestionario' : ''],
      ['Sistema Caudal', selectedMatch?.preCaudalSystem || '4-4-2'],
      ['Sistema rival', getCurrentRivalSystem()],
      ['Estilo rival', questionnaire.preRivalStyle],
      ['Bloque defensivo rival', questionnaire.preRivalDefensiveBlock],
      ['Presión rival', questionnaire.preRivalPressure],
      ['Tipo de presión', questionnaire.preRivalPressureType],
      ['Fortalezas rival', questionnaire.preRivalStrengths],
      ['Debilidades rival', questionnaire.preRivalWeaknesses],
      ['Dónde genera peligro', questionnaire.preRivalDangerZones],
      ['Espacios que concede', questionnaire.preRivalSpacesAllowed],
      ['Cómo defiende centros', questionnaire.preRivalDefendsCrosses],
      ['Cómo defiende espalda', questionnaire.preRivalDefendsBack],
      ['Plan con balón Caudal', questionnaire.preCaudalBuildPlan],
      ['Zonas a atacar', questionnaire.preCaudalAttackZones],
      ['Jugadores a activar', questionnaire.preCaudalPlayersToActivate],
      ['Rivales a tapar', questionnaire.preCaudalRivalsToBlock],
      ['Qué evitar', questionnaire.preCaudalAvoid],
      ['Información adicional IA', questionnaire.preAiSupportNotes],
    ];
    const filledInputs = importantInputs.filter(([, value]) => String(value || '').trim());
    const tags = [
      selectedMatch?.preCaudalSystem ? `Caudal ${selectedMatch.preCaudalSystem}` : 'Caudal 4-4-2',
      `Rival ${getCurrentRivalSystem()}`,
      questionnaire.preRivalDefensiveBlock ? `bloque ${questionnaire.preRivalDefensiveBlock}` : null,
      questionnaire.preRivalPressure ? `presión ${questionnaire.preRivalPressure}` : null,
      questionnaire.preRivalStrengths ? 'fortaleza rival' : null,
      questionnaire.preRivalWeaknesses ? 'debilidad rival' : null,
      questionnaire.preCaudalAttackZones ? 'zona a atacar' : null,
      questionnaire.preAiSupportNotes ? 'información adicional' : null,
      hasRivalReportText ? 'texto informe rival' : null,
      rivalPlayersWithNotes.length ? `${rivalPlayersWithNotes.length} rivales con característica` : null,
      caudalPlayersWithNotes.length ? `${caudalPlayersWithNotes.length} notas Caudal` : null,
    ].filter(Boolean);
    const score = filledInputs.length + rivalPlayersWithNotes.length + caudalPlayersWithNotes.length;
    const confidence = score >= 12 ? 'Alta' : score >= 7 ? 'Media' : 'Baja';

    return {
      confidence,
      filledInputs,
      missingInputs: importantInputs.filter(([, value]) => !String(value || '').trim()).slice(0, 6),
      rivalPlayersWithNotes,
      caudalPlayersWithNotes,
      tags,
    };
  };

  const runAiAnalysis = () => {
    if (!selectedMatch) return;
    const questionnaire = getTacticalQuestionnaire();
    const inputSummary = getAiInputSummary();
    const caudalSystem = selectedMatch.preCaudalSystem || '4-4-2';
    const rivalSystem = getCurrentRivalSystem();
    const caudalLineup = selectedMatch.preCaudalLineup?.length ? selectedMatch.preCaudalLineup : players.slice(0, 11).map((player) => player.name);
    const rivalLineup = selectedMatch.preRivalLineup?.length ? selectedMatch.preRivalLineup : getCurrentRivalLineup();
    const prompt = buildTacticalPrompt({
      match: selectedMatch,
      caudalSystem,
      rivalSystem,
      caudalLineup,
      rivalLineup,
      questionnaire,
      playerNotes: selectedMatch.prePlayerNotes || {},
      rivalNotes: selectedMatch.preRivalPlayerNotes || {},
    });
    const analysis = buildTacticalAnalysis({
      caudalSystem,
      rivalSystem,
      caudalLineup,
      rivalLineup,
      questionnaire,
      playerProfiles: players,
      playerNotes: selectedMatch.prePlayerNotes || {},
      rivalProfiles: getRivalAvailablePlayers(),
      rivalNotes: selectedMatch.preRivalPlayerNotes || {},
    });
    updateSelectedMatchFields({
      preAiAnalysis: { ...analysis, prompt, inputSummary },
    });
  };

  const extractRivalReportToQuestionnaire = () => {
    if (!selectedMatch) return;
    const extraction = extractRivalReportData(selectedMatch.preRivalReportText || selectedMatch.preNotes || '');
    updateSelectedMatchFields({
      ...extraction.fields,
      preRivalReportExtraction: {
        ...extraction,
        extractedAt: new Date().toISOString(),
      },
      preAiAnalysis: null,
    });
  };

  const handleEventDraftChange = (field, value) => {
    setNewEventDraft((prev) => ({ ...prev, [field]: value }));
  };

  const getPostVideoCurrentSeconds = () => {
    if (!postYoutubeReady || !postYoutubePlayerRef.current?.getCurrentTime) return null;
    try {
      const currentTime = postYoutubePlayerRef.current?.getCurrentTime?.();
      if (Number.isFinite(Number(currentTime))) return Math.max(0, Math.round(Number(currentTime)));
    } catch (playerError) {
      console.error('Error leyendo segundo actual del vídeo POST:', playerError);
    }
    return null;
  };

  const markPostClip = async (eventType) => {
    if (!selectedMatch || !eventType) return;
    const seconds = getPostVideoCurrentSeconds();
    if (seconds === null) {
      setPostError('El vídeo todavía no está listo. Reproduce el vídeo y vuelve a pulsar el botón.');
      return;
    }

    setPostClipSaving(true);
    setPostError('');
    const payload = {
      partido_id: selectedMatch.id,
      tipo_evento_id: eventType.id || null,
      type: eventType.name,
      video_seconds: seconds,
      minute: String(Math.floor(seconds / 60)),
      description: '',
      player: '',
    };

    const { data: savedClip, error: clipError } = await supabase
      .from("partido_eventos_post")
      .insert(payload)
      .select("id")
      .single();

    if (clipError) {
      console.error('Error marcando clip POST en Supabase:', { matchId: selectedMatch.id, payload, error: clipError });
      setPostError(clipError.message || 'No se pudo guardar el clip POST.');
      setPostClipSaving(false);
      return;
    }

    setSelectedPostEventId(savedClip?.id || null);
    setPostClipFeedback(`Clip guardado ${formatVideoSeconds(seconds)} · ${eventType.name}`);
    await loadMatchPostData(selectedMatch.id);
    setPostClipSaving(false);
  };

  const updatePostEventLocal = (eventId, fields) => {
    setMatches((current) =>
      current.map((match) => {
        if (match.id !== selectedMatch?.id) return match;
        return {
          ...match,
          events: (match.events || []).map((event) => (event.id === eventId ? { ...event, ...fields } : event)),
        };
      })
    );
  };

  const savePostEventInline = async (event) => {
    if (!selectedMatch || !event?.id) return;
    const selectedType = eventTypes.find((eventType) => eventType.name === event.type);
    const payload = {
      tipo_evento_id: selectedType?.id || event.tipoEventoId || null,
      minute: event.minute || String(Math.floor(Number(event.videoSeconds || 0) / 60)),
      type: event.type || selectedType?.name || '',
      description: event.description || '',
      player: event.player || '',
      video_seconds: Math.max(0, Math.round(Number(event.videoSeconds || 0))),
    };
    const { error: eventError } = await supabase.from("partido_eventos_post").update(payload).eq("id", event.id);
    if (eventError) {
      console.error('Error actualizando clip POST en Supabase:', { eventId: event.id, payload, error: eventError });
      setPostError(eventError.message || 'No se pudo actualizar el clip POST.');
      return;
    }
    await loadMatchPostData(selectedMatch.id);
  };

  const savePostEventInlineById = async (eventId) => {
    const event = matches.find((match) => match.id === selectedMatch?.id)?.events?.find((item) => item.id === eventId);
    if (event) await savePostEventInline(event);
  };

  const syncDraftWithCurrentVideoTime = () => {
    const currentSeconds = getPostVideoCurrentSeconds();
    if (currentSeconds === null) return null;
    const currentMinute = String(Math.floor(currentSeconds / 60));
    setPostCurrentMinute(currentMinute);
    setNewEventDraft((prev) => ({ ...prev, minute: currentMinute, videoSeconds: currentSeconds }));
    return currentSeconds;
  };

  const addNewEvent = async () => {
    if (!selectedMatch) return;
    const currentVideoSeconds = getPostVideoCurrentSeconds();
    const minute = newEventDraft.minute || postCurrentMinute || (currentVideoSeconds !== null ? String(Math.floor(currentVideoSeconds / 60)) : '');
    if (!minute || !newEventDraft.description) return;
    const effectiveType = newEventDraft.type || selectedEventType;
    const selectedType = eventTypes.find((eventType) => eventType.name === effectiveType);
    if (!effectiveType) {
      setPostError('Carga o crea un tipo de evento POST antes de guardar.');
      return;
    }
    const nextVideoSeconds = currentVideoSeconds !== null
      ? currentVideoSeconds
      : Number.isFinite(Number(newEventDraft.videoSeconds))
      ? Math.max(0, Math.round(Number(newEventDraft.videoSeconds)))
      : postVideoStartSeconds > 0
        ? Math.max(0, Math.round(Number(postVideoStartSeconds)))
        : Math.max(0, Math.round(Number(minute) * 60));
    const payload = {
      partido_id: selectedMatch.id,
      tipo_evento_id: selectedType?.id || null,
      minute,
      type: effectiveType,
      description: newEventDraft.description,
      player: newEventDraft.player,
      video_seconds: nextVideoSeconds,
    };
    const request = newEventDraft.id
      ? supabase.from("partido_eventos_post").update(payload).eq("id", newEventDraft.id).select("id").single()
      : supabase.from("partido_eventos_post").insert(payload).select("id").single();
    const { data: savedEvent, error: eventError } = await request;
    if (eventError) {
      console.error('Error guardando evento POST en Supabase:', {
        matchId: selectedMatch.id,
        eventId: newEventDraft.id || null,
        payload,
        error: eventError,
      });
      setPostError(eventError.message || 'No se pudo guardar el evento POST.');
      return;
    }
    setSelectedPostEventId(savedEvent?.id || newEventDraft.id || null);
    setNewEventDraft({ minute: '', type: selectedEventType, description: '', player: '' });
    await loadMatchPostData(selectedMatch.id);
  };

  const addEventType = async () => {
    const name = newEventTypeDraft.name.trim();
    if (!name) return;
    const { data, error: typeError } = await supabase
      .from("tipos_evento_post")
      .insert({ legacy_id: `custom-${Date.now()}`, name, color: newEventTypeDraft.color, is_default: false })
      .select("*")
      .single();
    if (typeError) {
      console.error('Error creando tipo de evento POST en Supabase:', { draft: newEventTypeDraft, error: typeError });
      setPostError(typeError.message || 'No se pudo crear el tipo de evento.');
      return;
    }
    const nextType = normalizeSupabasePostEventType(data);
    setEventTypes((current) => [...current, nextType]);
    setSelectedEventType(name);
    setNewEventDraft((prev) => ({ ...prev, type: name }));
    setNewEventTypeDraft({ name: '', color: 'slate' });
  };

  const updateEventType = async (id, fields) => {
    const payload = {};
    if (fields.name !== undefined) payload.name = fields.name;
    if (fields.color !== undefined) payload.color = fields.color;
    const { error: typeError } = await supabase.from("tipos_evento_post").update(payload).eq("id", id);
    if (typeError) {
      console.error('Error actualizando tipo de evento POST en Supabase:', { id, payload, error: typeError });
      setPostError(typeError.message || 'No se pudo actualizar el tipo de evento.');
      return;
    }
    setEventTypes((current) =>
      current.map((eventType) => {
        if (eventType.id !== id) return eventType;
        const nextType = { ...eventType, ...fields };
        if (selectedEventType === eventType.name && fields.name) {
          setSelectedEventType(fields.name);
          setNewEventDraft((prev) => ({ ...prev, type: fields.name }));
        }
        return nextType;
      })
    );
  };

  const removeEventType = async (id) => {
    const { error: typeError } = await supabase.from("tipos_evento_post").delete().eq("id", id);
    if (typeError) {
      console.error('Error borrando tipo de evento POST en Supabase:', { id, error: typeError });
      setPostError(typeError.message || 'No se pudo borrar el tipo de evento.');
      return;
    }
    setEventTypes((current) => {
      const nextTypes = current.filter((eventType) => eventType.id !== id);
      const fallback = nextTypes[0]?.name || '';
      if (!nextTypes.some((eventType) => eventType.name === selectedEventType)) {
        setSelectedEventType(fallback);
        setNewEventDraft((prev) => ({ ...prev, type: fallback }));
      }
      return nextTypes;
    });
  };

  const seekPostVideoToEvent = (event) => {
    const seconds = Number(event.videoSeconds) || Math.max(0, Math.round(Number(event.minute || 0) * 60));
    setSelectedPostEventId(event.id);
    setPostVideoStartSeconds(seconds);
    setPostCurrentMinute(event.minute || '');
    try {
      if (postYoutubePlayerRef.current?.seekTo) {
        postYoutubePlayerRef.current.seekTo(seconds, true);
        postYoutubePlayerRef.current.playVideo?.();
      }
    } catch (playerError) {
      console.error('Error saltando a evento POST en YouTube:', { event, seconds, error: playerError });
    }
  };

  const editPostEvent = (event) => {
    setSelectedEventType(event.type);
    setPostCurrentMinute(event.minute || '');
    setNewEventDraft({
      id: event.id,
      minute: event.minute || '',
      type: event.type || selectedEventType,
      description: event.description || '',
      player: event.player || '',
      videoSeconds: Number(event.videoSeconds || 0),
    });
  };

  const deletePostEvent = async (eventId) => {
    if (!selectedMatch) return;
    const { error: deleteError } = await supabase.from("partido_eventos_post").delete().eq("id", eventId);
    if (deleteError) {
      console.error('Error borrando evento POST en Supabase:', { eventId, error: deleteError });
      setPostError(deleteError.message || 'No se pudo borrar el evento POST.');
      return;
    }
    await loadMatchPostData(selectedMatch.id);
  };

  const runPostAiAnalysis = () => {
    if (!selectedMatch) return;
    const events = selectedMatch.events || [];
    const losses = events.filter((event) => /pérdida|perdida/i.test(event.type)).length;
    const recoveries = events.filter((event) => /recuper/i.test(event.type)).length;
    const chances = events.filter((event) => /ocas/i.test(event.type)).length;
    updateSelectedMatchFields({
      postAiAnalysis: {
        worked: [
          selectedMatch.postFulfilled || 'Las fases que generaron continuidad y ocasiones deben revisarse en vídeo para repetir patrones.',
          recoveries ? `Se registraron ${recoveries} recuperaciones: revisar si llegaron en las zonas previstas del plan PRE.` : 'Valorar si la presión permitió recuperar cerca de portería rival.',
        ],
        notWorked: [
          selectedMatch.postNotFulfilled || 'Comparar el plan PRE con los eventos negativos para localizar qué comportamientos no aparecieron.',
          losses ? `Hubo ${losses} pérdidas registradas: analizar zona, perfil corporal y apoyos cercanos.` : 'Revisar si hubo pérdidas no registradas en salida o progresión.',
        ],
        why: selectedMatch.postWhy || 'Cruzar vídeo, eventos y resultado para separar problema táctico, técnico o de toma de decisión.',
        repeat: selectedMatch.postRepeat || selectedMatch.planConBalon || 'Repetir las acciones que permitieron progresar con control y finalizar jugadas.',
        correct: selectedMatch.postImprove || 'Corregir distancias entre líneas, reacción tras pérdida y ocupación de área.',
        train: selectedMatch.postTrainWeek || 'Entrenar presión tras pérdida, salida bajo presión y finalización tras centro o pase atrás.',
        review: selectedMatch.postIndividualObservations || `Revisar jugadores implicados en ${chances} ocasiones, pérdidas y recuperaciones clave.`,
      },
    });
  };

  const getStatsGoalEvents = () => selectedMatch?.statsGoalEvents || [];
  const getStatsScore = () => {
    const eventCaudalGoals = getStatsGoalEvents().filter((event) => event.type === 'Gol a favor').length;
    const eventRivalGoals = getStatsGoalEvents().filter((event) => event.type === 'Gol en contra').length;
    const caudalGoals = eventCaudalGoals || Number(selectedMatch?.goalsFor) || Number(selectedMatch?.isHome ? selectedMatch?.homeScore : selectedMatch?.awayScore) || 0;
    const rivalGoals = eventRivalGoals || Number(selectedMatch?.goalsAgainst) || Number(selectedMatch?.isHome ? selectedMatch?.awayScore : selectedMatch?.homeScore) || 0;
    return selectedMatch?.isHome
      ? { home: caudalGoals, away: rivalGoals, caudal: caudalGoals, rival: rivalGoals }
      : { home: rivalGoals, away: caudalGoals, caudal: caudalGoals, rival: rivalGoals };
  };

  const getStatsPlayerTotals = (playerName) => {
    const events = getStatsGoalEvents();
    return {
      goals: events.filter((event) => event.type === 'Gol a favor' && event.scorer === playerName).length,
      assists: events.filter((event) => event.type === 'Gol a favor' && event.assistant === playerName).length,
    };
  };

  const getStatsCalledPlayerNames = () => {
    return selectedMatch?.statsCalledPlayers || [];
  };

  const getStatsCalledPlayers = () => {
    const calledNames = getStatsCalledPlayerNames();
    return players.filter((player) => calledNames.includes(player.name));
  };

  const refreshStatsFromSupabase = async (partidoId, reason = 'estadísticas') => {
    try {
      return await loadMatchStatsData(partidoId);
    } catch (refreshError) {
      console.error(`Error haciendo fetch real de ${reason} desde Supabase:`, {
        partidoId,
        reason,
        error: refreshError,
      });
      setStatsError(refreshError.message || 'No se pudieron refrescar las estadísticas desde Supabase.');
      return null;
    }
  };

  const eventColorDotClass = (typeOrColor) => {
    const color = eventColorOptions.includes(typeOrColor)
      ? typeOrColor
      : eventTypes.find((eventType) => eventType.name === typeOrColor)?.color || 'slate';
    switch (color) {
      case 'emerald':
        return 'bg-emerald-400 ring-emerald-200/50';
      case 'red':
        return 'bg-red-400 ring-red-200/50';
      case 'sky':
        return 'bg-sky-400 ring-sky-200/50';
      case 'violet':
        return 'bg-violet-400 ring-violet-200/50';
      case 'amber':
        return 'bg-amber-300 ring-amber-100/50';
      case 'orange':
        return 'bg-orange-400 ring-orange-100/50';
      default:
        return 'bg-slate-300 ring-white/40';
    }
  };

  const getPostEventTimelinePosition = (event, index, events) => {
    const seconds = Number(event.videoSeconds || 0);
    if (!postVideoDuration || seconds <= 0) return null;
    const nearbyBefore = events.slice(0, index).filter((item) => Math.abs(Number(item.videoSeconds || 0) - seconds) <= 8).length;
    return {
      left: `${Math.max(1, Math.min(99, (seconds / postVideoDuration) * 100))}%`,
      top: `${Math.min(28, nearbyBefore * 10)}px`,
    };
  };

  const formatVideoSeconds = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds || 0)));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  };

  const runStatsOperation = async (reason, operation) => {
    const currentMatchId = selectedMatch?.id;
    if (!currentMatchId) return null;
    const operationPromise = statsOperationRef.current.catch(() => null).then(async () => {
      await operation();
      return refreshStatsFromSupabase(currentMatchId, reason);
    });
    statsOperationRef.current = operationPromise.catch(() => null);
    return operationPromise;
  };

  const getAvailableStatsCallupPlayers = () => {
    const calledNames = new Set(getStatsCalledPlayerNames());
    return players.filter((player) => !calledNames.has(player.name));
  };

  const openStatsCallupPanel = async () => {
    if (!selectedMatch) return;
    setStatsCallupError('');
    setSelectedStatsCallups([]);
    try {
      const jugadores = await getJugadores();
      setPlayers(jugadores);
      setEmpty(jugadores.length === 0);
    } catch (loadPlayersError) {
      console.error('Error cargando plantilla para convocatoria masiva:', loadPlayersError);
      setStatsCallupError(loadPlayersError.message || 'No se pudo cargar la plantilla desde Supabase.');
    }
    setIsStatsCallupPanelOpen(true);
  };

  const toggleStatsCallupSelection = (playerName) => {
    setSelectedStatsCallups((current) =>
      current.includes(playerName) ? current.filter((name) => name !== playerName) : [...current, playerName]
    );
  };

  const removeStatsCalledPlayer = async (playerName) => {
    if (!selectedMatch) return;
    const [{ error: convocadoError }, { error: statsError }, { error: slotsError }] = await Promise.all([
      supabase.from("partido_convocados").delete().eq("partido_id", selectedMatch.id).eq("player_name", playerName),
      supabase.from("partido_estadisticas_jugador").delete().eq("partido_id", selectedMatch.id).eq("player_name", playerName),
      supabase.from("partido_alineacion_slots").delete().eq("partido_id", selectedMatch.id).eq("scope", "stats").eq("player_name", playerName),
    ]);
    const deleteError = convocadoError || statsError || slotsError;
    if (deleteError) {
      console.error('Error borrando convocado en Supabase:', deleteError);
      return;
    }
    await refreshStatsFromSupabase(selectedMatch.id, 'borrado de convocado');
  };

  const addStatsCalledPlayersBulk = async (playerNames) => {
    if (!selectedMatch) return;
    const currentCalled = new Set(getStatsCalledPlayerNames());
    const uniqueNames = Array.from(new Set(playerNames)).filter((playerName) => playerName && !currentCalled.has(playerName));
    if (!uniqueNames.length) {
      setIsStatsCallupPanelOpen(false);
      setSelectedStatsCallups([]);
      return;
    }

    const playersByName = new Map(players.map((player) => [player.name, player]));
    const convocadoRows = uniqueNames.map((playerName) => {
      const player = playersByName.get(playerName);
      return {
        partido_id: selectedMatch.id,
        jugador_id: isUuid(player?.id) ? player.id : null,
        player_name: playerName,
      };
    });
    const statsRows = uniqueNames.map((playerName) => {
      const player = playersByName.get(playerName);
      return {
        partido_id: selectedMatch.id,
        jugador_id: isUuid(player?.id) ? player.id : null,
        player_name: playerName,
        role: 'Suplente',
        minutes: '0',
        yellow: false,
        yellow_count: 0,
        red: false,
        injured: false,
        rating: '',
        replacement_name: '',
      };
    });

    const [{ error: convocadosError }, { error: statsError }] = await Promise.all([
      supabase.from("partido_convocados").upsert(convocadoRows, { onConflict: "partido_id,player_name" }),
      supabase.from("partido_estadisticas_jugador").upsert(statsRows, { onConflict: "partido_id,player_name" }),
    ]);
    const bulkError = convocadosError || statsError;
    if (bulkError) throw bulkError;
  };

  const handleAddSelectedStatsCallups = async () => {
    if (!selectedMatch) return;
    setStatsCallupSaving(true);
    setStatsCallupError('');
    try {
      await addStatsCalledPlayersBulk(selectedStatsCallups);
      await refreshStatsFromSupabase(selectedMatch.id, 'convocatoria masiva');
      setSelectedStatsCallups([]);
      setIsStatsCallupPanelOpen(false);
    } catch (bulkError) {
      console.error('Error añadiendo convocados en lote:', bulkError);
      setStatsCallupError(bulkError.message || 'No se pudieron añadir los convocados seleccionados.');
    } finally {
      setStatsCallupSaving(false);
    }
  };

  const addStatsCalledPlayer = async (playerName) => {
    if (!selectedMatch) return;
    const currentCalled = getStatsCalledPlayerNames();
    if (currentCalled.includes(playerName)) return;
    const player = players.find((item) => item.name === playerName);
    const jugadorId = isUuid(player?.id) ? player.id : null;
    const { error: convocadoError } = await supabase.from("partido_convocados").upsert(
      {
        partido_id: selectedMatch.id,
        jugador_id: jugadorId,
        player_name: playerName,
      },
      { onConflict: "partido_id,player_name" }
    );
    if (convocadoError) {
      console.error('Error guardando convocado en Supabase:', convocadoError);
      return;
    }

    const { error: statsError } = await supabase.from("partido_estadisticas_jugador").upsert(
      {
        partido_id: selectedMatch.id,
        jugador_id: jugadorId,
        player_name: playerName,
        role: 'Suplente',
        minutes: '0',
        yellow: false,
        yellow_count: 0,
        red: false,
        injured: false,
        rating: '',
        replacement_name: '',
      },
      { onConflict: "partido_id,player_name" }
    );
    if (statsError) {
      console.error('Error inicializando rendimiento del convocado en Supabase:', statsError);
      return;
    }
    await refreshStatsFromSupabase(selectedMatch.id, 'alta de convocado');
  };

  const markAllStatsCalledAsSubstitutes = async () => {
    if (!selectedMatch) return;
    const calledPlayers = getStatsCalledPlayers();
    if (!calledPlayers.length) return;
    const rows = calledPlayers.map((player) => {
      const current = getStatsPlayerData(player.name);
      return {
        partido_id: selectedMatch.id,
        jugador_id: isUuid(player.id) ? player.id : null,
        player_name: player.name,
        role: 'Suplente',
        minutes: '0',
        yellow: Boolean(current.yellow),
        yellow_count: Number(current.yellowCount || 0),
        red: Boolean(current.red),
        injured: Boolean(current.injured),
        rating: String(current.rating || ''),
        replacement_name: '',
      };
    });
    const [{ error: slotsError }, { error: statsError }] = await Promise.all([
      supabase.from("partido_alineacion_slots").delete().eq("partido_id", selectedMatch.id).eq("scope", "stats"),
      supabase.from("partido_estadisticas_jugador").upsert(rows, { onConflict: "partido_id,player_name" }),
    ]);
    const markError = slotsError || statsError;
    if (markError) {
      console.error('Error marcando convocados como suplentes en Supabase:', markError);
      return;
    }
    await refreshStatsFromSupabase(selectedMatch.id, 'marcar todos como suplentes');
  };

  const markStatsLineupAsStarters = async () => {
    if (!selectedMatch) return;
    const starterNames = Array.from(new Set((selectedMatch.statsLineup || []).filter(Boolean)));
    if (!starterNames.length) return;
    await addStatsCalledPlayersBulk(starterNames);
    const playersByName = new Map(players.map((player) => [player.name, player]));
    const rows = starterNames.map((playerName) => {
      const current = getStatsPlayerData(playerName);
      const player = playersByName.get(playerName);
      return {
        partido_id: selectedMatch.id,
        jugador_id: isUuid(player?.id) ? player.id : null,
        player_name: playerName,
        role: 'Titular',
        minutes: String(current.minutes && current.minutes !== '0' ? current.minutes : '90'),
        yellow: Boolean(current.yellow),
        yellow_count: Number(current.yellowCount || 0),
        red: Boolean(current.red),
        injured: Boolean(current.injured),
        rating: String(current.rating || ''),
        replacement_name: current.replacementName || '',
      };
    });
    const { error: statsError } = await supabase.from("partido_estadisticas_jugador").upsert(rows, { onConflict: "partido_id,player_name" });
    if (statsError) {
      console.error('Error marcando once inicial en Supabase:', statsError);
      return;
    }
    await refreshStatsFromSupabase(selectedMatch.id, 'marcar once inicial');
  };

  const getStatsPlayerData = (playerName) => {
    const lineup = selectedMatch?.statsLineup || [];
    const stored = selectedMatch?.statsPlayerData?.[playerName] || {};
    const isStarter = lineup.includes(playerName);
    const totals = getStatsPlayerTotals(playerName);
    const yellowCount = Number(stored.yellowCount ?? (stored.yellow ? 1 : 0)) || 0;
    return {
      role: isStarter ? 'Titular' : 'Suplente',
      minutes: stored.minutes ?? (isStarter ? 90 : 0),
      yellow: yellowCount > 0,
      yellowCount,
      red: stored.red || false,
      injured: stored.injured || false,
      rating: stored.rating || '',
      replacementName: stored.replacementName || '',
      goals: totals.goals,
      assists: totals.assists,
    };
  };

  const getStatsReplacementInfo = (starterName) => {
    const stats = getStatsPlayerData(starterName);
    const minutes = Number(stats.minutes || 0);
    if (stats.role !== 'Titular' || minutes <= 0 || minutes >= 90 || !stats.replacementName) return null;
    const replacement = players.find((player) => player.name === stats.replacementName);
    return {
      replacementName: stats.replacementName,
      replacement,
      minute: minutes,
      substituteMinutes: 90 - minutes,
    };
  };

  const getStatsSubstituteMinutes = (playerName) => {
    const starter = getStatsCalledPlayers().find((calledPlayer) => {
      const stats = getStatsPlayerData(calledPlayer.name);
      const minutes = Number(stats.minutes || 0);
      return stats.role === 'Titular' && minutes > 0 && minutes < 90 && stats.replacementName === playerName;
    });
    if (!starter) return 0;
    return 90 - Number(getStatsPlayerData(starter.name).minutes || 0);
  };

  const getStatsReplacementOptions = (starterName) => {
    const calledPlayers = getStatsCalledPlayers();
    const substitutes = calledPlayers.filter((player) => getStatsPlayerData(player.name).role !== 'Titular' && player.name !== starterName);
    return substitutes.length ? substitutes : calledPlayers.filter((player) => player.name !== starterName);
  };

  const updateStatsPlayerData = async (playerName, fields) => {
    if (!selectedMatch) return;
    await runStatsOperation('rendimiento individual', async () => {
      const current = getStatsPlayerData(playerName);
      const player = players.find((item) => item.name === playerName);
      const jugadorId = isUuid(player?.id) ? player.id : null;
      const next = { ...current, ...fields };
      const payload = {
        partido_id: selectedMatch.id,
        jugador_id: jugadorId,
        player_name: playerName,
        role: next.role,
        minutes: String(next.minutes ?? ''),
        yellow: Boolean(next.yellow),
        yellow_count: Number(next.yellowCount || 0),
        red: Boolean(next.red),
        injured: Boolean(next.injured),
        rating: String(next.rating || ''),
        replacement_name: next.replacementName || '',
      };
      const { error: statsError } = await supabase.from("partido_estadisticas_jugador").upsert(payload, { onConflict: "partido_id,player_name" });
      if (statsError) {
        console.error('Error guardando rendimiento individual en Supabase:', { playerName, payload, error: statsError });
        throw statsError;
      }
    });
  };

  const updateStatsLineupSlot = async (slotIndex, playerName) => {
    if (!selectedMatch || !playerName) return;
    const player = players.find((item) => item.name === playerName);
    const jugadorId = isUuid(player?.id) ? player.id : null;
    const calledNames = getStatsCalledPlayerNames();
    if (!calledNames.includes(playerName)) await addStatsCalledPlayer(playerName);

    const repeatedSlots = (selectedMatch.statsLineup || [])
      .map((name, index) => ({ name, index }))
      .filter((entry) => entry.name === playerName && entry.index !== slotIndex);
    if (repeatedSlots.length) {
      const { error: repeatedError } = await supabase
        .from("partido_alineacion_slots")
        .delete()
        .eq("partido_id", selectedMatch.id)
        .eq("scope", "stats")
        .in("slot", repeatedSlots.map((entry) => entry.index));
      if (repeatedError) {
        console.error('Error limpiando slots repetidos en Supabase:', repeatedError);
        return;
      }
    }

    const { error: slotError } = await supabase.from("partido_alineacion_slots").upsert(
      {
        partido_id: selectedMatch.id,
        scope: 'stats',
        slot: slotIndex,
        player_name: playerName,
        jugador_id: jugadorId,
      },
      { onConflict: "partido_id,scope,slot" }
    );
    if (slotError) {
      console.error('Error guardando slot de alineación en Supabase:', slotError);
      return;
    }

    const nextStats = { ...getStatsPlayerData(playerName), role: 'Titular', minutes: String(getStatsPlayerData(playerName).minutes || '90') };
    await supabase.from("partido_estadisticas_jugador").upsert(
      {
        partido_id: selectedMatch.id,
        jugador_id: jugadorId,
        player_name: playerName,
        role: 'Titular',
        minutes: nextStats.minutes === '0' ? '90' : nextStats.minutes,
        yellow: Boolean(nextStats.yellow),
        yellow_count: Number(nextStats.yellowCount || 0),
        red: Boolean(nextStats.red),
        injured: Boolean(nextStats.injured),
        rating: String(nextStats.rating || ''),
        replacement_name: nextStats.replacementName || '',
      },
      { onConflict: "partido_id,player_name" }
    );
    await refreshStatsFromSupabase(selectedMatch.id, 'alineación de estadísticas');
  };

  const updateStatsSystem = async (system) => {
    if (!selectedMatch) return;
    const { error: systemError } = await supabase.from("partidos").update({ stats_system: system }).eq("id", selectedMatch.id);
    if (systemError) {
      console.error('Error guardando sistema de estadísticas en Supabase:', systemError);
      return;
    }
    await refreshStatsFromSupabase(selectedMatch.id, 'sistema de estadísticas');
  };

  const updateMatchCaptain = async (captainPlayerId) => {
    if (!selectedMatch) return;
    const nextCaptainId = captainPlayerId || null;
    const { error: captainError } = await supabase
      .from("partidos")
      .update({ captain_player_id: nextCaptainId })
      .eq("id", selectedMatch.id);
    if (captainError) {
      console.error('Error guardando capitán del partido en Supabase:', captainError);
      setStatsError(captainError.message || 'No se pudo guardar el capitán.');
      return;
    }
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, captainPlayerId: nextCaptainId } : match)));
  };

  const handleDropOnStatsLineupSlot = (slotIndex) => {
    if (!draggedPlayer) return;
    updateStatsLineupSlot(slotIndex, normalizeSquadEntry(draggedPlayer).name);
    setDraggedPlayer(null);
  };

  const getDelegatedEvents = () => selectedMatch?.quickEvents || [];

  const getDelegatedCount = (tipoEvento) => {
    if (!tipoEvento) return 0;
    return getDelegatedEvents().filter((event) => event.tipoEvento === tipoEvento).length;
  };

  const openDelegatedEventModal = (definition) => {
    setStatsError('');
    setDelegatedEventFeedback('');
    setDelegatedEventDraft({
      ...definition,
      minute: delegatedMinute || '0',
      jugadorId: '',
    });
  };

  const updateDelegatedMinute = (value) => {
    const nextMinute = Math.max(0, Math.min(130, Number(value) || 0));
    setDelegatedMinute(String(nextMinute));
    setDelegatedEventDraft((current) => (current ? { ...current, minute: String(nextMinute) } : current));
  };

  const saveDelegatedEvent = async () => {
    if (!selectedMatch || !delegatedEventDraft) return;
    setDelegatedEventSaving(true);
    setStatsError('');
    setDelegatedEventFeedback('');
    try {
      const minute = Math.max(0, Math.min(130, Number(delegatedEventDraft.minute) || 0));
      const selectedPlayer = players.find((player) => player.id === delegatedEventDraft.jugadorId);
      const payload = {
        partido_id: selectedMatch.id,
        jugador_id: delegatedEventDraft.side === 'caudal' && isUuid(delegatedEventDraft.jugadorId) ? delegatedEventDraft.jugadorId : null,
        equipo: delegatedEventDraft.side,
        tipo_evento: delegatedEventDraft.tipoEvento,
        minuto: minute,
      };
      const { error } = await supabase.from("match_quick_events").insert(payload);
      if (error) throw error;
      setDelegatedMinute(String(minute));
      setDelegatedEventDraft(null);
      setDelegatedEventFeedback(`${delegatedEventDraft.label} guardado en el ${minute}'${selectedPlayer ? ` · ${selectedPlayer.name}` : ''}`);
      await refreshStatsFromSupabase(selectedMatch.id, 'evento de Modo Delegado');
    } catch (error) {
      console.error('Error guardando evento de Modo Delegado en Supabase:', {
        matchId: selectedMatch?.id,
        draft: delegatedEventDraft,
        error,
      });
      setStatsError(error.message || 'No se pudo guardar el evento del Modo Delegado.');
    } finally {
      setDelegatedEventSaving(false);
    }
  };

  const openGoalAnalysisModal = () => {
    setGoalAnalysisDraft({
      ...defaultGoalAnalysisDraft,
      scorer: players[0]?.name || '',
      assistant: '',
    });
    setIsGoalAnalysisOpen(true);
  };

  const updateGoalAnalysisDraft = (field, value) => {
    setGoalAnalysisDraft((prev) => {
      if (field === 'phase') {
        return { ...prev, phase: value, subphase: goalPhaseOptions[value]?.[0] || '' };
      }
      if (field === 'type' && value === 'Gol en contra') {
        return { ...prev, type: value, scorer: '', assistant: '' };
      }
      return { ...prev, [field]: value };
    });
  };

  const saveGoalAnalysisEvent = async () => {
    if (!selectedMatch || !goalAnalysisDraft.minute) return;
    const { error: goalError } = await supabase
      .from("partido_eventos_gol")
      .insert(createGoalEventPayload(selectedMatch.id, goalAnalysisDraft));
    if (goalError) {
      console.error('Error guardando análisis de gol en Supabase:', goalError);
      return;
    }

    const { data: goalRows, error: goalsFetchError } = await supabase
      .from("partido_eventos_gol")
      .select("*")
      .eq("partido_id", selectedMatch.id);
    if (goalsFetchError) {
      console.error('Error recalculando marcador desde Supabase:', goalsFetchError);
      return;
    }

    const nextEvents = (goalRows || []).map(normalizeSupabaseGoalEvent);
    const caudalGoals = nextEvents.filter((event) => event.type === 'Gol a favor').length;
    const rivalGoals = nextEvents.filter((event) => event.type === 'Gol en contra').length;
    const scorePayload = {
      goals_for: String(caudalGoals),
      goals_against: String(rivalGoals),
      home_score: selectedMatch.isHome ? String(caudalGoals) : String(rivalGoals),
      away_score: selectedMatch.isHome ? String(rivalGoals) : String(caudalGoals),
    };
    const { error: matchScoreError } = await supabase.from("partidos").update(scorePayload).eq("id", selectedMatch.id);
    if (matchScoreError) {
      console.error('Error actualizando marcador del partido en Supabase:', matchScoreError);
      return;
    }

    setIsGoalAnalysisOpen(false);
    await loadPartidos();
    await refreshStatsFromSupabase(selectedMatch.id, 'análisis de goles y marcador');
  };

  const renderZoneGrid = ({ value, onChange, zones = pitchZoneOptions, goal = false }) => (
    <div className={`relative w-full overflow-hidden rounded-3xl border-4 border-white/70 ${goal ? 'aspect-[4/3] min-h-[220px] bg-[#111827]' : 'aspect-[7/10] min-h-[260px] bg-[repeating-linear-gradient(90deg,#075f43_0,#075f43_16.6%,#08694a_16.6%,#08694a_33.3%)]'}`}>
      {goal ? (
        <>
          <div className="absolute inset-x-6 top-5 bottom-5 rounded-t-2xl border-4 border-white/60 border-b-0" />
          <div className="absolute inset-x-9 top-8 bottom-6 bg-[linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:22px_22px]" />
          <div className="absolute bottom-5 left-6 right-6 h-1 bg-white/70" />
        </>
      ) : (
        <>
          <div className="absolute inset-4 rounded-[1.4rem] border-2 border-white/60" />
          <div className="absolute left-4 right-4 top-1/2 h-px bg-white/40" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
          <div className="absolute left-1/2 top-4 h-20 w-40 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/45" />
          <div className="absolute bottom-4 left-1/2 h-20 w-40 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/45" />
        </>
      )}
      <div className={`${goal ? 'absolute inset-x-6 bottom-8 top-10' : 'absolute inset-4'} grid grid-cols-3 grid-rows-3`}>
        {zones.map((zone) => {
          const selected = goal ? value === zone : normalizePitchZone(value) === zone;
          return (
            <button
              key={zone}
              type="button"
              onClick={() => onChange(zone)}
              className={`whitespace-pre-line break-words border border-white/15 px-1 text-center font-black uppercase transition ${goal ? 'text-[8px] leading-none' : 'text-[9px] leading-tight'} ${selected ? 'bg-caudal-electric/85 text-slate-950 shadow-[0_0_35px_rgba(79,140,255,0.45)]' : goal ? 'bg-black/15 text-slate-200 hover:bg-white/10' : 'bg-black/10 text-white hover:bg-emerald-400/20'}`}
            >
              {displayZoneLabel(zone)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderDelegatedStatsMode = () => {
    const caudalEvents = delegatedEventDefinitions.filter((definition) => definition.side === 'caudal');
    const rivalEvents = delegatedEventDefinitions.filter((definition) => definition.side === 'rival');
    const calledPlayers = getStatsCalledPlayers();
    const recentEvents = getDelegatedEvents()
      .slice()
      .sort((a, b) => Number(b.minute || 0) - Number(a.minute || 0))
      .slice(0, 8);
    const playersById = new Map(players.map((player) => [player.id, player]));

    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/5 bg-[#091428]/90 p-4 shadow-glow sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-caudal-electric">Modo Delegado</p>
              <h3 className="mt-1 text-xl font-black text-white">Registro rápido de partido</h3>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-black/25 p-2">
              <button type="button" onClick={() => updateDelegatedMinute(Number(delegatedMinute || 0) - 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-xl font-black text-white">-</button>
              <label className="flex flex-col items-center">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Min</span>
                <input
                  type="number"
                  min="0"
                  max="130"
                  value={delegatedMinute}
                  onChange={(event) => updateDelegatedMinute(event.target.value)}
                  className="w-16 rounded-xl bg-white px-2 py-2 text-center text-lg font-black text-slate-950"
                />
              </label>
              <button type="button" onClick={() => updateDelegatedMinute(Number(delegatedMinute || 0) + 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-caudal-electric text-xl font-black text-slate-950">+</button>
            </div>
          </div>

          {delegatedEventFeedback ? (
            <div className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
              {delegatedEventFeedback}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {delegatedCounterPairs.map((counter) => (
              <div key={counter.label} className="rounded-2xl bg-white/5 p-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{counter.label}</p>
                <p className="mt-1 text-2xl font-black text-white">
                  {getDelegatedCount(counter.caudal)}
                  {counter.rival ? <span className="text-slate-500"> - {getDelegatedCount(counter.rival)}</span> : null}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/5 bg-[#091428]/90 p-4 shadow-glow sm:p-6">
            <h4 className="text-sm font-black uppercase tracking-[0.18em] text-white">Nuestro equipo</h4>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {caudalEvents.map((definition) => (
                <button
                  key={definition.key}
                  type="button"
                  onClick={() => openDelegatedEventModal(definition)}
                  className="min-h-[92px] rounded-3xl bg-caudal-electric px-4 py-5 text-left text-lg font-black text-slate-950 shadow-glow transition active:scale-[0.98]"
                >
                  {definition.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/5 bg-[#091428]/90 p-4 shadow-glow sm:p-6">
            <h4 className="text-sm font-black uppercase tracking-[0.18em] text-white">Rival</h4>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {rivalEvents.map((definition) => (
                <button
                  key={definition.key}
                  type="button"
                  onClick={() => openDelegatedEventModal(definition)}
                  className="min-h-[92px] rounded-3xl bg-red-500 px-4 py-5 text-left text-lg font-black text-white shadow-glow transition active:scale-[0.98]"
                >
                  {definition.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/5 bg-[#091428]/90 p-4 shadow-glow sm:p-6">
          <h4 className="text-sm font-black uppercase tracking-[0.18em] text-white">Últimos eventos</h4>
          <div className="mt-4 space-y-2">
            {recentEvents.length ? recentEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3 text-sm">
                <span className="font-black text-white">{event.minute}' · {quickEventLabelByType[event.tipoEvento] || event.tipoEvento}</span>
                <span className="truncate text-right text-slate-400">{playersById.get(event.jugadorId)?.name || selectedMatch?.opponent || 'Rival'}</span>
              </div>
            )) : (
              <p className="rounded-2xl bg-white/5 px-4 py-4 text-sm text-slate-400">Todavía no hay eventos rápidos registrados.</p>
            )}
          </div>
        </div>

        {delegatedEventDraft ? (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 px-4 py-4 sm:items-center">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-caudal-950 p-5 shadow-glow">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Guardar evento</p>
                  <h3 className="mt-1 text-2xl font-black text-white">{delegatedEventDraft.label}</h3>
                </div>
                <button type="button" onClick={() => setDelegatedEventDraft(null)} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold text-white">Cerrar</button>
              </div>
              <label className="mt-5 block space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Minuto</span>
                <input
                  type="number"
                  min="0"
                  max="130"
                  value={delegatedEventDraft.minute}
                  onChange={(event) => setDelegatedEventDraft((current) => ({ ...current, minute: event.target.value }))}
                  className="w-full rounded-2xl bg-white px-4 py-4 text-xl font-black text-slate-950"
                />
              </label>
              {delegatedEventDraft.needsPlayer ? (
                <label className="mt-4 block space-y-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Jugador</span>
                  <select
                    value={delegatedEventDraft.jugadorId}
                    onChange={(event) => setDelegatedEventDraft((current) => ({ ...current, jugadorId: event.target.value }))}
                    className="w-full rounded-2xl bg-white px-4 py-4 text-base font-black text-slate-950"
                  >
                    <option value="">Sin jugador</option>
                    {calledPlayers.map((player) => (
                      <option key={player.id} value={player.id}>{player.number || '-'} · {player.name}</option>
                    ))}
                  </select>
                  {!calledPlayers.length ? <p className="text-xs text-amber-100">Añade convocados para poder asociar jugadores rápido.</p> : null}
                </label>
              ) : null}
              <button
                type="button"
                onClick={saveDelegatedEvent}
                disabled={delegatedEventSaving}
                className="mt-5 flex min-h-[58px] w-full items-center justify-center rounded-2xl bg-caudal-electric px-5 py-4 text-base font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {delegatedEventSaving ? 'Guardando...' : 'Guardar evento'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderStatsPitch = () => {
    if (!selectedMatch) return null;
    const coordinates = getFormationCoordinates(selectedMatch.statsSystem || '4-4-2');
    return (
      <div className="relative aspect-[7/8.9] min-h-[560px] overflow-hidden rounded-3xl border border-white/20 bg-[#102616] shadow-inner">
        <div className="absolute inset-4 rounded-[28px] border-2 border-white/60" />
        <div className="absolute left-4 right-4 top-1/2 h-px bg-white/45" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/45" />
        <div className="absolute left-1/2 top-4 h-24 w-56 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/45" />
        <div className="absolute bottom-4 left-1/2 h-24 w-56 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/45" />
        {coordinates.map((slot, slotIndex) => {
          const playerName = selectedMatch.statsLineup?.[slotIndex] || '';
          const player = players.find((item) => item.name === playerName);
          const stats = playerName ? getStatsPlayerData(playerName) : null;
          const replacementInfo = playerName ? getStatsReplacementInfo(playerName) : null;
          return (
            <div
              key={`stats-slot-${slotIndex}`}
              draggable={Boolean(player)}
              onDragStart={() => player && setDraggedPlayer(player)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.stopPropagation();
                handleDropOnStatsLineupSlot(slotIndex);
              }}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center ${player ? 'cursor-grab' : ''}`}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              <div className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 text-sm font-black shadow-glow ${playerName ? 'border-white bg-caudal-950 text-white' : 'border-dashed border-white/40 bg-white/10 text-white/70'}`}>
                {player?.image ? (
                  <img src={player.image} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span>{player?.number || playerName?.slice(0, 2).toUpperCase() || slotIndex + 1}</span>
                )}
                {playerName ? (
                  <span className="absolute -bottom-2 left-1/2 flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full bg-black px-1 text-xs font-black text-white">
                    {player?.number || slotIndex + 1}
                  </span>
                ) : null}
                {stats?.rating ? (
                  <span className="absolute -right-3 top-0 rounded-full bg-caudal-electric px-1.5 py-0.5 text-[10px] font-black text-white">
                    {stats.rating}
                  </span>
                ) : null}
                {replacementInfo ? (
                  <span className="absolute -left-5 top-8 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white" title="Sale">
                    {replacementInfo.minute}' ↓
                  </span>
                ) : null}
              </div>
              <div className="max-w-[92px] truncate rounded-xl bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
                {playerName || getFormationRoles(selectedMatch.statsSystem || '4-4-2')[slotIndex]}
              </div>
              {replacementInfo ? (
                <div className="max-w-[108px] truncate rounded-xl bg-emerald-500 px-2 py-1 text-[10px] font-black text-white" title={`Entra ${replacementInfo.replacementName}`}>
                  ↑ {replacementInfo.replacementName} · {replacementInfo.substituteMinutes}'
                </div>
              ) : null}
              {stats ? (
                <div className="flex flex-wrap justify-center gap-1 text-[10px]">
                  {stats.goals ? <span title="Gol">⚽{stats.goals > 1 ? stats.goals : ''}</span> : null}
                  {stats.assists ? <span title="Asistencia">👟{stats.assists > 1 ? stats.assists : ''}</span> : null}
                  {stats.yellow ? <span title="Amarilla">🟨{stats.yellowCount > 1 ? stats.yellowCount : ''}</span> : null}
                  {stats.red ? <span title="Roja">🟥</span> : null}
                  {stats.injured ? <span title="Lesión">🚑</span> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const getPlayerMatchRows = (player) => {
    if (!player) return [];
    const statsRows = playerProfileData?.statsRows || [];
    const goalEvents = playerProfileData?.goalEvents || [];
    const partidosById = playerProfileData?.partidosById || {};

    return statsRows
      .map((stats) => {
        const match = partidosById[stats.partido_id];
        if (!match) return null;
        const matchEvents = goalEvents.filter((event) => event.partidoId === stats.partido_id);
        const yellowCount = Number(stats.yellow_count || 0) || (stats.yellow ? 1 : 0);
        const cardActions = [
          ...Array.from({ length: yellowCount }, (_, index) => ({ minute: stats.minutes || 90, type: `Tarjeta amarilla${yellowCount > 1 ? ` ${index + 1}` : ''}` })),
          ...(stats.red ? [{ minute: stats.minutes || 90, type: 'Tarjeta roja' }] : []),
        ];
        return {
          match,
          isCalled: true,
          role: stats.role || 'Suplente',
          minutes: Number(stats.minutes || 0) || 0,
          goals: matchEvents.filter((event) => event.scorer === player.name),
          assists: matchEvents.filter((event) => event.assistant === player.name),
          yellow: yellowCount,
          red: Boolean(stats.red),
          injured: Boolean(stats.injured),
          rating: stats.rating || '',
          cardActions,
        };
      })
      .filter(Boolean)
      .filter((row) =>
        playerCompetitionFilter === 'Todos' ||
        row.match.type === playerCompetitionFilter ||
        (playerCompetitionFilter === 'Playoff' && row.match.type === 'Play off')
      )
      .filter((row) => playerVenueFilter === 'Todos' || (playerVenueFilter === 'Local' ? row.match.isHome : !row.match.isHome));
  };

  const getQuickEventCount = (events, tipoEvento) =>
    events.filter((event) => event.tipoEvento === tipoEvento).length;

  const getQuickEventRate = (part, total) =>
    total ? `${Math.round((part / total) * 100)}%` : '0%';

  const getQuickEventSummary = (events = []) => {
    const shots = getQuickEventCount(events, 'tiro');
    const shotsOnTarget = getQuickEventCount(events, 'tiro_puerta');
    const rivalShots = getQuickEventCount(events, 'tiro_rival');
    const rivalShotsOnTarget = getQuickEventCount(events, 'tiro_puerta_rival');
    const recoveries = getQuickEventCount(events, 'recuperacion');
    const losses = getQuickEventCount(events, 'perdida');
    return {
      shots,
      shotsOnTarget,
      rivalShots,
      rivalShotsOnTarget,
      corners: getQuickEventCount(events, 'corner'),
      rivalCorners: getQuickEventCount(events, 'corner_rival'),
      fouls: getQuickEventCount(events, 'falta'),
      rivalFouls: getQuickEventCount(events, 'falta_rival'),
      recoveries,
      losses,
      recoveryLossBalance: recoveries - losses,
      shotAccuracy: getQuickEventRate(shotsOnTarget, shots),
      concededDanger: getQuickEventRate(rivalShotsOnTarget, rivalShots),
    };
  };

  const getQuickEventsByMinuteRange = (events) => {
    const ranges = ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'];
    return ranges.map((range) => {
      const [from, to] = range.split('-').map(Number);
      const isLastRange = to === 90;
      const scoped = events.filter((event) => Number(event.minute) >= from && (isLastRange ? Number(event.minute) <= to : Number(event.minute) < to));
      return {
        range,
        caudal: scoped.filter((event) => event.equipo === 'caudal').length,
        rival: scoped.filter((event) => event.equipo === 'rival').length,
      };
    });
  };

  const getPlayerQuickSummary = (player) => {
    const quickEvents = (playerProfileData?.quickEvents || [])
      .map((event) => ({ ...event, match: playerProfileData?.partidosById?.[event.partidoId] }))
      .filter((event) => event.match)
      .filter((event) =>
        playerCompetitionFilter === 'Todos' ||
        event.match.type === playerCompetitionFilter ||
        (playerCompetitionFilter === 'Playoff' && event.match.type === 'Play off')
      )
      .filter((event) => playerVenueFilter === 'Todos' || (playerVenueFilter === 'Local' ? event.match.isHome : !event.match.isHome));
    const summary = getQuickEventSummary(quickEvents);
    const recent = quickEvents
      .slice()
      .sort((a, b) => new Date(b.match.date || 0) - new Date(a.match.date || 0) || Number(b.minute || 0) - Number(a.minute || 0));
    return {
      ...summary,
      events: quickEvents,
      recent,
      alerts: [
        summary.losses >= 5 ? 'Jugador con muchas pérdidas en el filtro actual' : null,
        summary.recoveries >= 5 ? 'Jugador con alto volumen de recuperaciones' : null,
        summary.shots >= 4 && Number(summary.shotAccuracy.replace('%', '')) < 35 ? 'Baja eficacia de tiro a puerta' : null,
        summary.recoveryLossBalance < -2 ? 'Balance recuperación/pérdida negativo' : null,
      ].filter(Boolean),
    };
  };

  const getPlayerAggregate = (player) => {
    const rows = getPlayerMatchRows(player);
    const played = rows.filter((row) => row.minutes > 0 || row.role === 'Titular').length;
    const starts = rows.filter((row) => row.role === 'Titular').length;
    const subs = Math.max(0, played - starts);
    const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
    const goals = rows.reduce((sum, row) => sum + row.goals.length, 0);
    const assists = rows.reduce((sum, row) => sum + row.assists.length, 0);
    const yellow = rows.reduce((sum, row) => sum + Number(row.yellow || 0), 0);
    const red = rows.filter((row) => row.red).length;
    const injured = rows.filter((row) => row.injured).length;
    const possibleMinutes = rows.length * 90;
    const quick = getPlayerQuickSummary(player);
    return {
      rows,
      played,
      starts,
      subs,
      minutes,
      participation: possibleMinutes ? Math.round((minutes / possibleMinutes) * 100) : 0,
      goals,
      assists,
      yellow,
      red,
      injured,
      goalsPer90: minutes ? (goals / minutes * 90).toFixed(2) : '0.00',
      assistsPer90: minutes ? (assists / minutes * 90).toFixed(2) : '0.00',
      directGoalParticipation: goals + assists,
      quick,
    };
  };

  const countValues = (values) =>
    values.reduce((acc, value) => {
      if (!value) return acc;
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});

  const countPitchZones = (values) =>
    values.reduce((acc, value) => {
      if (!value) return acc;
      const normalized = normalizePitchZone(value);
      acc[normalized] = (acc[normalized] || 0) + 1;
      return acc;
    }, {});

  const renderReadOnlyZoneGrid = ({ counts, zones = pitchZoneOptions, goal = false }) => (
    <div className={`relative overflow-hidden rounded-3xl border-4 border-white/70 ${goal ? 'aspect-[16/9] min-h-[180px] bg-[#111827]' : 'aspect-[7/10] bg-[repeating-linear-gradient(90deg,#075f43_0,#075f43_16.6%,#08694a_16.6%,#08694a_33.3%)]'}`}>
      {goal ? (
        <>
          <div className="absolute inset-x-6 top-5 bottom-5 rounded-t-2xl border-4 border-white/60 border-b-0" />
          <div className="absolute inset-x-10 top-9 bottom-5 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute bottom-5 left-6 right-6 h-1 bg-white/70" />
        </>
      ) : (
        <>
          <div className="absolute inset-4 rounded-[1.4rem] border-2 border-white/60" />
          <div className="absolute left-4 right-4 top-1/2 h-px bg-white/40" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
          <div className="absolute left-1/2 top-4 h-20 w-40 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/45" />
          <div className="absolute bottom-4 left-1/2 h-20 w-40 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/45" />
          <div className="absolute left-1/2 top-[11%] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/70" />
          <div className="absolute bottom-[11%] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/70" />
        </>
      )}
      <div className="absolute inset-4 grid grid-cols-3 grid-rows-3">
        {zones.map((zone) => {
          const count = counts[zone] || 0;
          return (
          <div key={zone} className={`flex flex-col items-center justify-center border border-white/15 px-1 text-center ${count ? 'bg-caudal-electric/75 text-slate-950 shadow-[0_0_35px_rgba(79,140,255,0.45)]' : 'bg-black/10 text-slate-200'}`}>
            <span className={`${goal ? 'text-[9px]' : 'text-[10px]'} whitespace-pre-line font-black uppercase leading-tight drop-shadow`}>{displayZoneLabel(zone)}</span>
            <strong className={`${goal ? 'mt-0 text-lg' : 'mt-1 text-xl'}`}>{count}</strong>
          </div>
          );
        })}
      </div>
    </div>
  );

  const generatePlayerReport = (player, aggregate) => {
    setPlayerReport({
      general: `${player.name} acumula ${aggregate.played} partidos, ${aggregate.minutes}' y ${aggregate.directGoalParticipation} participaciones directas de gol en el filtro actual. En eventos rápidos: ${aggregate.quick.shots} tiros, ${aggregate.quick.recoveries} recuperaciones y ${aggregate.quick.losses} pérdidas.`,
      strengths: aggregate.quick.recoveries > aggregate.quick.losses ? 'Buen balance presión/pérdida: recupera más de lo que pierde en los eventos registrados.' : aggregate.goals || aggregate.assists ? 'Aporta producción ofensiva medible: revisar sus acciones de gol/asistencia para repetir zonas y sociedades.' : 'Sin producción ofensiva registrada: valorar influencia sin balón, continuidad y ocupación de zonas.',
      improve: aggregate.quick.losses >= 5 ? 'Acumula pérdidas: revisar zonas, apoyos y perfil corporal en últimos partidos.' : aggregate.yellow || aggregate.red ? 'Controlar acciones disciplinarias y momentos de riesgo competitivo.' : 'Aumentar presencia en acciones decisivas si su rol lo permite.',
      trend: aggregate.quick.recent.slice(0, 3).length ? `Últimos eventos rápidos: ${aggregate.quick.recent.slice(0, 3).map((event) => `${quickEventLabelByType[event.tipoEvento] || event.tipoEvento} vs ${event.match.opponent}`).join(', ')}.` : aggregate.rows.slice(-3).length ? `Últimos ${aggregate.rows.slice(-3).length} partidos registrados: ${aggregate.rows.slice(-3).reduce((sum, row) => sum + row.minutes, 0)} minutos.` : 'Sin tendencia reciente registrada.',
    });
  };

  const getMatchScoreData = (match) => {
    const events = match.statsGoalEvents || [];
    const caudalGoals = events.filter((event) => event.type === 'Gol a favor').length || Number(match.goalsFor) || Number(match.isHome ? match.homeScore : match.awayScore) || 0;
    const rivalGoals = events.filter((event) => event.type === 'Gol en contra').length || Number(match.goalsAgainst) || Number(match.isHome ? match.awayScore : match.homeScore) || 0;
    return { caudalGoals, rivalGoals };
  };

  const getMatchScoreLabel = (match) => {
    const score = getMatchScoreData(match);
    return match.isHome ? `C.D. Caudal ${score.caudalGoals}-${score.rivalGoals} ${match.opponent}` : `${match.opponent} ${score.rivalGoals}-${score.caudalGoals} C.D. Caudal`;
  };

  const getGroupScopedMatches = () => {
    let scoped = matches
      .filter((match) => match.status === 'Finalizado' || (match.statsGoalEvents || []).length > 0)
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    if (groupCompetitionFilter === 'Liga') scoped = scoped.filter((match) => match.type === 'Liga');
    if (groupCompetitionFilter === 'Copa') scoped = scoped.filter((match) => /copa/i.test(match.type));
    if (groupCompetitionFilter === 'Copa RFEF') scoped = scoped.filter((match) => match.type === 'Copa RFEF');
    if (groupCompetitionFilter === 'Playoff') scoped = scoped.filter((match) => match.type === 'Play off');
    if (groupCompetitionFilter === 'Amistoso') scoped = scoped.filter((match) => match.type === 'Amistoso');
    if (groupContextFilter === 'Local') scoped = scoped.filter((match) => match.isHome);
    if (groupContextFilter === 'Visitante') scoped = scoped.filter((match) => !match.isHome);
    if (groupContextFilter === 'Victorias') scoped = scoped.filter((match) => {
      const score = getMatchScoreData(match);
      return score.caudalGoals > score.rivalGoals;
    });
    if (groupContextFilter === 'Empates') scoped = scoped.filter((match) => {
      const score = getMatchScoreData(match);
      return score.caudalGoals === score.rivalGoals;
    });
    if (groupContextFilter === 'Derrotas') scoped = scoped.filter((match) => {
      const score = getMatchScoreData(match);
      return score.caudalGoals < score.rivalGoals;
    });
    if (groupContextFilter === 'Últimos 5 partidos') scoped = scoped.slice(-5);
    return scoped;
  };

  const getGroupAnalysisData = () => {
    const scoped = getGroupScopedMatches();
    const results = scoped.reduce((acc, match) => {
      const score = getMatchScoreData(match);
      if (score.caudalGoals > score.rivalGoals) acc.wins += 1;
      else if (score.caudalGoals === score.rivalGoals) acc.draws += 1;
      else acc.losses += 1;
      acc.goalsFor += score.caudalGoals;
      acc.goalsAgainst += score.rivalGoals;
      if (score.rivalGoals === 0) acc.cleanSheets += 1;
      return acc;
    }, { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 });
    const allGoalEvents = scoped.flatMap((match) => (match.statsGoalEvents || []).map((event) => ({ ...event, match })));
    const quickEvents = scoped.flatMap((match) => (match.quickEvents || []).map((event) => ({ ...event, match })));
    const goalForEvents = allGoalEvents.filter((event) => event.type === 'Gol a favor');
    const goalAgainstEvents = allGoalEvents.filter((event) => event.type === 'Gol en contra');
    const points = results.wins * 3 + results.draws;
    return {
      scoped,
      allGoalEvents,
      quickEvents,
      quickSummary: getQuickEventSummary(quickEvents),
      goalForEvents,
      goalAgainstEvents,
      played: scoped.length,
      ...results,
      goalDiff: results.goalsFor - results.goalsAgainst,
      pointsPerGame: scoped.length ? (points / scoped.length).toFixed(2) : '0.00',
    };
  };

  const groupEventsByMinuteRange = (events) => {
    const ranges = ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'];
    return ranges.map((range) => {
      const [from, to] = range.split('-').map(Number);
      const isLastRange = to === 90;
      return {
        range,
        count: events.filter((event) => Number(event.minute) >= from && (isLastRange ? Number(event.minute) <= to : Number(event.minute) < to)).length,
      };
    });
  };

  const countPhases = (events) => ['Juego combinativo', 'Juego directo', 'Transición', 'ABP'].map((phase) => ({
    phase,
    count: events.filter((event) => event.phase === phase).length,
  }));

  const getSetPieceSummary = (events) => {
    const abp = events.filter((event) => event.phase === 'ABP');
    const get = (subphase) => abp.filter((event) => event.subphase === subphase).length;
    return {
      total: abp.length,
      corner: get('Córner'),
      directFreeKick: get('Falta directa'),
      freeKickHeader: get('Falta con remate'),
      penalty: get('Penalti'),
      secondBall: get('Segunda jugada'),
    };
  };

  const summarizeGroupMatches = (scopedMatches) => {
    const summary = scopedMatches.reduce((acc, match) => {
      const score = getMatchScoreData(match);
      if (score.caudalGoals > score.rivalGoals) acc.wins += 1;
      else if (score.caudalGoals === score.rivalGoals) acc.draws += 1;
      else acc.losses += 1;
      acc.played += 1;
      acc.goalsFor += score.caudalGoals;
      acc.goalsAgainst += score.rivalGoals;
      acc.cleanSheets += score.rivalGoals === 0 ? 1 : 0;
      return acc;
    }, { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 });
    const points = summary.wins * 3 + summary.draws;
    return {
      ...summary,
      goalDiff: summary.goalsFor - summary.goalsAgainst,
      pointsPerGame: summary.played ? (points / summary.played).toFixed(2) : '0.00',
    };
  };

  const filterAssistEventsByGroupMode = (events) => {
    if (groupAssistFilter === 'Juego') return events.filter((event) => ['Juego combinativo', 'Juego directo'].includes(event.phase));
    if (groupAssistFilter === 'Transición') return events.filter((event) => event.phase === 'Transición');
    if (groupAssistFilter === 'ABP') return events.filter((event) => event.phase === 'ABP');
    return events;
  };

  const getGroupRankings = (scopedMatches) => {
    const possibleMinutes = Math.max(1, scopedMatches.length * 90);
    const byPlayer = new Map(players.map((player) => [player.name, {
      player,
      goals: 0,
      assists: 0,
      yellow: 0,
      red: 0,
      injured: 0,
      minutes: 0,
      starts: 0,
      ratingTotal: 0,
      ratingCount: 0,
      roleMinutes: {},
    }]));

    scopedMatches.forEach((match) => {
      const lineup = match.statsLineup || [];
      const roles = getFormationRoles(match.statsSystem || '4-4-2');
      (match.statsGoalEvents || []).forEach((event) => {
        if (event.type !== 'Gol a favor') return;
        if (event.scorer && byPlayer.has(event.scorer)) byPlayer.get(event.scorer).goals += 1;
        if (event.assistant && byPlayer.has(event.assistant)) byPlayer.get(event.assistant).assists += 1;
      });
      players.forEach((player) => {
        const stored = match.statsPlayerData?.[player.name] || {};
        const slotIndex = lineup.indexOf(player.name);
        const isStarter = slotIndex >= 0;
        const minutes = Number(stored.minutes ?? (isStarter ? 90 : 0)) || 0;
        const row = byPlayer.get(player.name);
        row.minutes += minutes;
        row.starts += isStarter ? 1 : 0;
        if (isStarter && minutes > 0) {
          const role = roles[slotIndex] || player.position || 'Sin posicion';
          row.roleMinutes[role] = (row.roleMinutes[role] || 0) + minutes;
        }
        row.yellow += Number(stored.yellowCount ?? (stored.yellow ? 1 : 0)) || 0;
        row.red += stored.red ? 1 : 0;
        row.injured += stored.injured ? 1 : 0;
        if (stored.rating) {
          row.ratingTotal += Number(stored.rating) || 0;
          row.ratingCount += 1;
        }
      });
      lineup.forEach((starterName, slotIndex) => {
        if (!starterName) return;
        const stored = match.statsPlayerData?.[starterName] || {};
        const starterMinutes = Number(stored.minutes ?? 90) || 0;
        if (starterMinutes <= 0 || starterMinutes >= 90 || !stored.replacementName || !byPlayer.has(stored.replacementName)) return;
        const replacementStored = match.statsPlayerData?.[stored.replacementName] || {};
        if (Number(replacementStored.minutes || 0) > 0) return;
        const role = roles[slotIndex] || 'Sin posicion';
        const subMinutes = 90 - starterMinutes;
        const replacementRow = byPlayer.get(stored.replacementName);
        replacementRow.minutes += subMinutes;
        replacementRow.roleMinutes[role] = (replacementRow.roleMinutes[role] || 0) + subMinutes;
      });
    });

    const rows = Array.from(byPlayer.values()).map((row) => ({
      ...row,
      goalParticipation: row.goals + row.assists,
      cards: row.yellow + row.red,
      minutePct: Math.round((row.minutes / possibleMinutes) * 100),
      avgRating: row.ratingCount ? row.ratingTotal / row.ratingCount : 0,
      primaryRole: getMostPlayedRole(row.roleMinutes, row.player.position),
      idealScore: row.minutes * 0.03 + row.starts * 6 + row.goals * 8 + row.assists * 6 + (row.ratingCount ? (row.ratingTotal / row.ratingCount) * 4 : 0),
    }));
    const top = (key) => rows.filter((row) => row[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 5);
    return {
      rows,
      scorers: top('goals'),
      assistants: top('assists'),
      booked: rows.filter((row) => row.cards > 0).sort((a, b) => b.cards - a.cards).slice(0, 5),
      injured: top('injured'),
      minutes: top('minutes'),
      participations: top('goalParticipation'),
      idealRows: rows.filter((row) => row.idealScore > 0),
    };
  };

  const getMostPlayedRole = (roleMinutes, fallbackRole) => {
    const entries = Object.entries(roleMinutes || {}).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] || fallbackRole || 'Sin posicion';
  };

  const normalizeIdealRole = (role) => {
    const value = String(role || '').toLowerCase();
    if (value.includes('portero')) return 'portero';
    if (value.includes('lateral') || value.includes('carrilero')) return value.includes('izquier') ? 'banda-izquierda-def' : value.includes('derech') ? 'banda-derecha-def' : 'defensa';
    if (value.includes('central') || value.includes('defensa')) return 'central';
    if (value.includes('pivote') || value.includes('mediocentro') || value.includes('interior') || value.includes('mediapunta')) return 'medio';
    if (value.includes('extremo')) return value.includes('izquier') ? 'banda-izquierda-atq' : value.includes('derech') ? 'banda-derecha-atq' : 'ataque';
    if (value.includes('delantero')) return 'delantero';
    return value;
  };

  const roleFitsSlot = (playerRole, slotRole) => {
    const playerKey = normalizeIdealRole(playerRole);
    const slotKey = normalizeIdealRole(slotRole);
    if (playerKey === slotKey) return true;
    if (slotKey === 'central') return ['central', 'defensa'].includes(playerKey);
    if (slotKey === 'medio') return playerKey === 'medio';
    if (slotKey === 'delantero') return ['delantero', 'ataque'].includes(playerKey);
    if (slotKey.includes('banda-izquierda')) return playerKey.includes('banda-izquierda') || playerKey === 'medio';
    if (slotKey.includes('banda-derecha')) return playerKey.includes('banda-derecha') || playerKey === 'medio';
    return false;
  };

  const buildIdealElevenForSystem = (idealRows, system) => {
    const roles = getFormationRoles(system);
    const available = [...idealRows].sort((a, b) => b.idealScore - a.idealScore);
    const used = new Set();
    return roles.map((slotRole) => {
      const exact = available.find((row) => !used.has(row.player.name) && roleFitsSlot(row.primaryRole, slotRole));
      const fallback = exact || available.find((row) => !used.has(row.player.name));
      if (!fallback) return null;
      used.add(fallback.player.name);
      return fallback;
    });
  };

  const getGroupTendency = (scopedMatches) =>
    scopedMatches.slice(-5).reverse().map((match) => {
      const score = getMatchScoreData(match);
      const cards = Object.values(match.statsPlayerData || {}).reduce((sum, row) => sum + (Number(row.yellowCount ?? (row.yellow ? 1 : 0)) || 0) + (row.red ? 1 : 0), 0);
      const quick = getQuickEventSummary(match.quickEvents || []);
      return {
        match,
        goalsFor: score.caudalGoals,
        goalsAgainst: score.rivalGoals,
        cleanSheet: score.rivalGoals === 0,
        cards,
        quick,
      };
    });

  const getPlayerGroupStats = (playerName, scopedMatches) => {
    return scopedMatches.reduce((acc, match) => {
      const events = match.statsGoalEvents || [];
      const stored = match.statsPlayerData?.[playerName] || {};
      const isStarter = (match.statsLineup || []).includes(playerName);
      const minutes = Number(stored.minutes ?? (isStarter ? 90 : 0)) || 0;
      const goals = events.filter((event) => event.type === 'Gol a favor' && event.scorer === playerName).length;
      const assists = events.filter((event) => event.type === 'Gol a favor' && event.assistant === playerName).length;
      acc.minutes += minutes;
      acc.starts += isStarter ? 1 : 0;
      acc.goals += goals;
      acc.assists += assists;
      acc.yellow += Number(stored.yellowCount ?? (stored.yellow ? 1 : 0)) || 0;
      acc.red += stored.red ? 1 : 0;
      acc.rating += Number(stored.rating) || 0;
      acc.rated += stored.rating ? 1 : 0;
      return acc;
    }, { playerName, minutes: 0, starts: 0, goals: 0, assists: 0, yellow: 0, red: 0, rating: 0, rated: 0 });
  };

  const getGroupSubphaseRanking = (events) =>
    Object.entries(countValues(events.map((event) => event.subphase)))
      .filter(([subphase]) => subphase)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

  const getGroupGoalZoneCounts = (events) => countValues(events.map((event) => event.goalZone));

  const getGroupAlerts = (groupData, rankings, localSummary, awaySummary) => {
    if (groupData.played < 3) return ['sin datos suficientes'];
    const alerts = [];
    const quickSummary = groupData.quickSummary || getQuickEventSummary([]);
    const secondHalfAgainst = groupData.goalAgainstEvents.filter((event) => Number(event.minute) >= 45).length;
    const firstHalfAgainst = groupData.goalAgainstEvents.length - secondHalfAgainst;
    const abpFor = groupData.goalForEvents.filter((event) => event.phase === 'ABP').length;
    const cardsLast = getGroupTendency(groupData.scoped).reduce((sum, row) => sum + row.cards, 0);
    const topMinutes = rankings.minutes[0];

    if (secondHalfAgainst > firstHalfAgainst) alerts.push('Encajamos más en la segunda parte');
    if (abpFor >= Math.max(2, groupData.goalsFor * 0.35)) alerts.push('Marcamos más en ABP');
    if (awaySummary.played >= 2 && Number(awaySummary.pointsPerGame) < Number(localSummary.pointsPerGame)) alerts.push('Sufrimos más como visitantes');
    if (topMinutes && topMinutes.minutePct >= 80) alerts.push(`Alta carga de minutos en ${topMinutes.player.name}`);
    if (cardsLast >= 8) alerts.push('Muchas tarjetas en últimos partidos');
    if (quickSummary.rivalShots >= 10 && Number(quickSummary.concededDanger.replace('%', '')) >= 45) alerts.push('Equipo concede muchos tiros a puerta');
    if (quickSummary.shots >= 10 && Number(quickSummary.shotAccuracy.replace('%', '')) < 35) alerts.push('Baja eficacia de tiro a puerta');
    if (quickSummary.losses > quickSummary.recoveries) alerts.push('Aumentan las pérdidas: revisar salida y apoyos cercanos');
    if (quickSummary.recoveries >= quickSummary.losses + 5) alerts.push('Mejora la presión: más recuperaciones que pérdidas');

    return alerts.length ? alerts : ['sin datos suficientes'];
  };

  const getGroupAutomaticReadings = (groupData) => {
    const quickEvents = groupData.quickEvents || [];
    const quickSummary = groupData.quickSummary || getQuickEventSummary([]);
    if (!quickEvents.length) return ['No hay suficientes datos de eventos rápidos para generar lecturas avanzadas.'];

    const readings = [];
    const shotAccuracyValue = Number(quickSummary.shotAccuracy.replace('%', '')) || 0;
    const concededDangerValue = Number(quickSummary.concededDanger.replace('%', '')) || 0;

    if (quickSummary.shots >= 8 && shotAccuracyValue < 35) {
      readings.push('El equipo genera volumen de tiro, pero necesita mejorar precisión a puerta.');
    } else if (quickSummary.shotsOnTarget >= Math.max(3, quickSummary.shots * 0.45)) {
      readings.push('Buena eficacia ofensiva: una parte alta de los tiros acaba entre palos.');
    } else if (quickSummary.shots > quickSummary.rivalShots) {
      readings.push('El equipo está produciendo más tiros que el rival en el filtro actual.');
    }

    if (quickSummary.rivalShots >= 8 && concededDangerValue >= 40) {
      readings.push('El rival está generando demasiados tiros a puerta: conviene revisar protección de área y presión al poseedor.');
    } else if (quickSummary.rivalShotsOnTarget <= Math.max(1, quickSummary.rivalShots * 0.25)) {
      readings.push('Solidez defensiva correcta: se están reduciendo los tiros claros del rival.');
    }

    if (quickSummary.corners >= quickSummary.rivalCorners + 3) {
      readings.push('El equipo carga bastante el balón parado ofensivo y fuerza más córners que el rival.');
    } else if (quickSummary.rivalCorners >= quickSummary.corners + 3) {
      readings.push('El rival está acumulando córners: revisar defensa de banda y despejes hacia zonas seguras.');
    }

    if (quickSummary.recoveries > quickSummary.losses) {
      readings.push('Buen balance de presión: hay más recuperaciones que pérdidas.');
    } else if (quickSummary.losses > quickSummary.recoveries) {
      readings.push('Las pérdidas superan a las recuperaciones: revisar apoyos cercanos y seguridad en salida.');
    }

    const scopedWithQuick = (groupData.scoped || []).filter((match) => (match.quickEvents || []).length);
    if (scopedWithQuick.length >= 6) {
      const previous = scopedWithQuick.slice(0, -3);
      const recent = scopedWithQuick.slice(-3);
      const previousSummary = getQuickEventSummary(previous.flatMap((match) => match.quickEvents || []));
      const recentSummary = getQuickEventSummary(recent.flatMap((match) => match.quickEvents || []));
      const previousPerMatch = previous.length ? previousSummary.shots / previous.length : 0;
      const recentPerMatch = recent.length ? recentSummary.shots / recent.length : 0;
      const previousLosses = previous.length ? previousSummary.losses / previous.length : 0;
      const recentLosses = recent.length ? recentSummary.losses / recent.length : 0;
      const previousRecoveries = previous.length ? previousSummary.recoveries / previous.length : 0;
      const recentRecoveries = recent.length ? recentSummary.recoveries / recent.length : 0;

      if (recentPerMatch >= previousPerMatch + 2) readings.push('Tendencia positiva: en los últimos 3 partidos aumenta el volumen de tiro.');
      if (recentLosses >= previousLosses + 2) readings.push('Tendencia a vigilar: aumentan las pérdidas en los últimos 3 partidos.');
      if (recentRecoveries >= previousRecoveries + 2) readings.push('Mejora la presión reciente: suben las recuperaciones en los últimos 3 partidos.');
    }

    const ranges = getQuickEventsByMinuteRange(quickEvents);
    const ownShotTypes = new Set(['tiro', 'tiro_puerta']);
    const rivalShotTypes = new Set(['tiro_rival', 'tiro_puerta_rival']);
    const rangeDetails = ranges.map((range) => {
      const [from, to] = range.range.split('-').map(Number);
      const isLastRange = to === 90;
      const scoped = quickEvents.filter((event) => Number(event.minute) >= from && (isLastRange ? Number(event.minute) <= to : Number(event.minute) < to));
      return {
        range: range.range,
        ownShots: scoped.filter((event) => ownShotTypes.has(event.tipoEvento)).length,
        rivalShots: scoped.filter((event) => rivalShotTypes.has(event.tipoEvento)).length,
        losses: scoped.filter((event) => event.tipoEvento === 'perdida').length,
      };
    });
    const topOwnShotRange = rangeDetails.slice().sort((a, b) => b.ownShots - a.ownShots)[0];
    const topRivalShotRange = rangeDetails.slice().sort((a, b) => b.rivalShots - a.rivalShots)[0];
    const topLossRange = rangeDetails.slice().sort((a, b) => b.losses - a.losses)[0];
    if (topOwnShotRange?.ownShots > 0) readings.push(`El tramo con más tiros propios es ${topOwnShotRange.range}'.`);
    if (topRivalShotRange?.rivalShots > 0) readings.push(`El tramo con más tiros rivales es ${topRivalShotRange.range}': controlar ese momento del partido.`);
    if (topLossRange?.losses >= 2) readings.push(`El tramo con más pérdidas es ${topLossRange.range}': revisar gestión de balón en esa fase.`);

    const homeMatches = (groupData.scoped || []).filter((match) => match.isHome && (match.quickEvents || []).length);
    const awayMatches = (groupData.scoped || []).filter((match) => !match.isHome && (match.quickEvents || []).length);
    if (homeMatches.length && awayMatches.length) {
      const homeSummary = getQuickEventSummary(homeMatches.flatMap((match) => match.quickEvents || []));
      const awaySummary = getQuickEventSummary(awayMatches.flatMap((match) => match.quickEvents || []));
      const homeShots = homeSummary.shots / homeMatches.length;
      const awayShots = awaySummary.shots / awayMatches.length;
      const homeRivalShots = homeSummary.rivalShots / homeMatches.length;
      const awayRivalShots = awaySummary.rivalShots / awayMatches.length;
      if (homeShots >= awayShots + 2) readings.push('Como local se genera más volumen de tiro que fuera de casa.');
      if (awayRivalShots >= homeRivalShots + 2) readings.push('Como visitante se conceden más tiros: ajustar bloque y vigilancia tras pérdida.');
    }

    return readings.slice(0, 8);
  };

  const renderGroupMiniPitch = ({ counts, title }) => (
    <div className="rounded-3xl border border-white/10 bg-[#0f1e38]/80 p-5">
      <h4 className="text-sm font-black uppercase tracking-[0.18em] text-white">{title}</h4>
      <div className="mt-4">{renderReadOnlyZoneGrid({ counts })}</div>
    </div>
  );

  const renderIdealElevenPitch = (idealRows) => {
    const coordinates = getFormationCoordinates(idealSystem);
    const roles = getFormationRoles(idealSystem);
    return (
      <div className="relative mx-auto aspect-[7/8.9] min-h-[620px] max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-[#102616] shadow-inner">
        <div className="absolute inset-4 rounded-[28px] border-2 border-white/55" />
        <div className="absolute left-4 right-4 top-1/2 h-px bg-white/35" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
        <div className="absolute left-1/2 top-4 h-24 w-56 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/35" />
        <div className="absolute bottom-4 left-1/2 h-24 w-56 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/35" />
        {coordinates.map((slot, index) => {
          const row = idealRows[index];
          const player = row?.player;
          return (
            <div key={`${roles[index]}-${index}`} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-2 border-caudal-electric/60 bg-caudal-950/80 text-xs font-black text-white">
                {player?.image ? <img src={player.image} alt="" className="h-full w-full object-cover" /> : player?.number || index + 1}
              </div>
              <span className="max-w-[90px] truncate rounded-xl bg-black/60 px-2 py-1 text-[10px] font-black text-white">{player?.name || roles[index]}</span>
              {row?.primaryRole ? (
                <span className="max-w-[96px] truncate rounded-xl bg-caudal-electric/90 px-2 py-0.5 text-[9px] font-black text-slate-950" title={`Rol más jugado: ${row.primaryRole}`}>
                  {row.primaryRole}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    if (activeTab !== 'Partidos') {
      setMatchView('lista_partidos');
      setSelectedMatchId(null);
      setMatchViewSection('PRE');
    }
  }, [activeTab]);

  useEffect(() => {
    setSelectedTimelineAction(null);
  }, [selectedPlayerProfileId, playerCompetitionFilter, playerVenueFilter]);

  useEffect(() => {
    setPlayerReport(null);
    setSelectedTimelineAction(null);
    if (!selectedPlayerProfile) {
      setPlayerProfileData(null);
      setPlayerProfileError('');
      return;
    }
    loadPlayerProfileData(selectedPlayerProfile);
  }, [selectedPlayerProfileId]);

  const openMatchPage = async (match, section) => {
    setSelectedMatchId(match.id);
    setMatchView(section === 'PRE' ? 'pre_partido' : section === 'ESTADÍSTICAS' ? 'estadisticas_partido' : section === 'IMPRESIÓN' ? 'impresion_partido' : 'post_partido');
    setMatchViewSection(section);
    if (section === 'PRE') {
      setPreSubTab('Informe rival');
      await loadMatchPreData(match.id);
    }
    if (section === 'ESTADÍSTICAS') {
      try {
        await loadMatchStatsData(match.id);
      } catch (loadError) {
        console.error('Error cargando estadísticas del partido desde Supabase:', loadError);
      }
    }
    if (section === 'POST') {
      await loadMatchPostData(match.id);
    }
    if (section === 'IMPRESIÓN') {
      await loadMatchPreData(match.id);
      try {
        await loadMatchStatsData(match.id);
      } catch (loadError) {
        console.error('Error cargando datos de impresión del partido desde Supabase:', loadError);
      }
    }
  };

  const closeMatchPage = async () => {
    if (selectedMatchId && matchView === 'estadisticas_partido') {
      await statsOperationRef.current;
      const refreshed = await refreshStatsFromSupabase(selectedMatchId, 'salida de Estadísticas');
      if (!refreshed) return;
    }
    setMatchView('lista_partidos');
    setSelectedMatchId(null);
    setMatchViewSection('PRE');
  };

  useEffect(() => {
    if (!isMatchPanelOpen) return;
    if (matchFormSection === 'PRE' && preSectionRef.current) {
      preSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (matchFormSection === 'POST' && postSectionRef.current) {
      postSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isMatchPanelOpen, matchFormSection]);

  const groupedPlayers = useMemo(
    () =>
      squadGroups.map((group) => ({
        ...group,
        players: players.filter((player) => group.positions.includes(player.position)),
      })),
    [players]
  );

  const filteredMatches = useMemo(
    () => (matchFilter === 'Todos' ? matches : matches.filter((match) => match.type === matchFilter)),
    [matchFilter, matches]
  );

  const matchStats = useMemo(() => {
    const scopedMatches = matchFilter === 'Todos' ? matches : matches.filter((match) => match.type === matchFilter);
    const finished = scopedMatches.filter((match) => match.status === 'Finalizado' || (match.statsGoalEvents || []).length > 0);
    const wins = finished.filter((match) => getMatchResult(match) === 'W').length;
    const goalsFor = finished.reduce((sum, match) => {
      const statGoals = (match.statsGoalEvents || []).filter((event) => event.type === 'Gol a favor').length;
      return sum + (statGoals || Number(match.goalsFor) || Number(match.isHome ? match.homeScore : match.awayScore) || 0);
    }, 0);
    const goalsAgainst = finished.reduce((sum, match) => {
      const statGoals = (match.statsGoalEvents || []).filter((event) => event.type === 'Gol en contra').length;
      return sum + (statGoals || Number(match.goalsAgainst) || Number(match.isHome ? match.awayScore : match.homeScore) || 0);
    }, 0);
    const cleanSheets = finished.filter((match) => match.cleanSheet || Number(match.goalsAgainst) === 0).length;
    const recent = finished.slice(-3).map(getMatchResult).filter(Boolean);

    return { total: scopedMatches.length, finished: finished.length, wins, goalsFor, goalsAgainst, cleanSheets, recent };
  }, [matches, matchFilter]);

  const homeDashboard = useMemo(() => {
    const scopedMatches = matchFilter === 'Todos' ? matches : matches.filter((match) => match.type === matchFilter);
    const sortedMatches = [...scopedMatches].sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });
    const todayKey = new Date().toISOString().slice(0, 10);
    const hasPlayedData = (match) => {
      const score = getMatchScoreData(match);
      return match.status === 'Finalizado' || (match.statsGoalEvents || []).length > 0 || score.caudalGoals > 0 || score.rivalGoals > 0;
    };
    const finished = sortedMatches.filter(hasPlayedData);
    const nextMatch =
      sortedMatches.find((match) => !hasPlayedData(match) && (!match.date || match.date >= todayKey)) ||
      sortedMatches.find((match) => !hasPlayedData(match)) ||
      null;
    const lastMatch = finished[finished.length - 1] || null;
    const balance = summarizeGroupMatches(finished);
    const recent = finished.slice(-5).map((match) => {
      const score = getMatchScoreData(match);
      return {
        id: match.id,
        label: score.caudalGoals > score.rivalGoals ? 'V' : score.caudalGoals < score.rivalGoals ? 'D' : 'E',
        match,
      };
    });
    const weeklyMatches = finished.slice(-5);
    const weeklyStats = weeklyMatches.reduce(
      (acc, match) => {
        Object.values(match.statsPlayerData || {}).forEach((stats) => {
          acc.injured += stats.injured ? 1 : 0;
          acc.yellow += Number(stats.yellowCount ?? (stats.yellow ? 1 : 0)) || 0;
          acc.red += stats.red ? 1 : 0;
        });
        return acc;
      },
      { injured: 0, yellow: 0, red: 0 }
    );
    const recentPoints = recent.reduce((sum, result) => sum + (result.label === 'V' ? 3 : result.label === 'E' ? 1 : 0), 0);
    const tendency =
      recent.length < 2
        ? 'Sin muestra'
        : recentPoints >= recent.length * 2
          ? 'Positiva'
          : recentPoints >= recent.length
            ? 'Estable'
            : 'A corregir';
    const nextOpponentTeam = nextMatch ? findTeamByDisplayName(teams, nextMatch.opponent) : null;

    return {
      scopedMatches,
      nextMatch,
      nextOpponentTeam,
      lastMatch,
      balance,
      recent,
      weeklyStats,
      tendency,
      playerCount: players.length,
      sub23Count: players.filter((player) => calculateAge(player.dob) < 23).length,
      rivalCount: teams.length,
    };
  }, [matches, players, teams, matchFilter]);

  const openForm = (player = null) => {
    setPlayerFormError('');
    setIsSavingPlayer(false);
    if (player) {
      setEditingId(player.id);
      setFormState({
        name: player.name,
        shirtName: player.shirtName || player.name,
        dob: player.dob,
        number: player.number,
        position: player.position,
        foot: player.foot,
        image: player.image,
      });
    } else {
      setEditingId(null);
      setFormState({
        name: '',
        shirtName: '',
        dob: '',
        number: '',
        position: 'Portero',
        foot: 'Derecha',
        image: '',
      });
    }
    setIsPanelOpen(true);
  };

  const closeForm = () => {
    setIsPanelOpen(false);
    setEditingId(null);
    setPlayerFormError('');
    setIsSavingPlayer(false);
  };

  const openTeamForm = (team = null) => {
    if (team) {
      setEditingTeamId(team.id);
      setTeamFormState({
        name: team.name,
        sourceUrl: team.sourceUrl ?? '',
        crest: team.crest ?? '',
        stadium: team.stadium ?? '',
        kitColor: team.kitColor ?? '#ef233c',
        system: team.system,
        squad: team.squad.map(normalizeSquadEntry),
      });
    } else {
      setEditingTeamId(null);
      setTeamFormState(emptyTeamForm);
    }
    setImportStatus('');
    setIsTeamPanelOpen(true);
  };

  const closeTeamForm = () => {
    setIsTeamPanelOpen(false);
    setEditingTeamId(null);
    setImportStatus('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handlePlayerImageFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploadingPlayerImage(true);
    setPlayerFormError('');
    try {
      const publicUrl = await uploadPublicFile({ bucket: 'jugadores', file, folder: sanitizeStorageName(formState.name || 'jugador') });
      setFormState((prev) => ({ ...prev, image: publicUrl }));
      if (editingId) {
        const { error: updateError } = await supabase.from("jugadores").update({ image: publicUrl }).eq("id", editingId);
        if (updateError) throw updateError;
        const jugadores = await getJugadores();
        setPlayers(jugadores);
        setEmpty(jugadores.length === 0);
      }
    } catch (uploadError) {
      console.error('Error subiendo foto de jugador a Supabase Storage:', uploadError);
      setPlayerFormError(uploadError.message || 'No se pudo subir la foto del jugador.');
    } finally {
      setIsUploadingPlayerImage(false);
      event.target.value = '';
    }
  };

  const handleTeamChange = (event) => {
    const { name, value } = event.target;
    setTeamFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleTeamCrestFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploadingTeamCrest(true);
    setImportStatus('');
    try {
      const publicUrl = await uploadPublicFile({ bucket: 'escudos', file, folder: sanitizeStorageName(teamFormState.name || 'equipo') });
      setTeamFormState((prev) => ({ ...prev, crest: publicUrl }));
      if (editingTeamId) {
        const { error: updateError } = await supabase.from("equipos_rivales").update({ crest: publicUrl }).eq("id", editingTeamId);
        if (updateError) throw updateError;
        await loadTeams();
      }
      setImportStatus('Escudo subido a Supabase Storage.');
    } catch (uploadError) {
      console.error('Error subiendo escudo a Supabase Storage:', uploadError);
      setImportStatus(uploadError.message || 'No se pudo subir el escudo.');
    } finally {
      setIsUploadingTeamCrest(false);
      event.target.value = '';
    }
  };

  const handleTeamPlayerChange = (index, field, value) => {
    setTeamFormState((prev) => ({
      ...prev,
      squad: prev.squad.map((player, playerIndex) =>
        playerIndex === index ? { ...normalizeSquadEntry(player), [field]: value } : normalizeSquadEntry(player)
      ),
    }));
  };

  const handleSelectedTeamPlayerChange = async (playerName, field, value) => {
    if (!selectedTeam) return;
    const currentPlayer = selectedTeam.squad.map(normalizeSquadEntry).find((player) => player.name === playerName);
    if (!currentPlayer) return;
    const nextPlayer = { ...currentPlayer, [field]: value };
    const { error: updateError } = await supabase
      .from("jugadores_rivales")
      .update(createRivalPlayerPayload(selectedTeam.id, nextPlayer))
      .eq("equipo_rival_id", selectedTeam.id)
      .eq("name", playerName);
    if (updateError) {
      console.error('Error actualizando jugador rival en Supabase:', updateError);
      return;
    }
    await loadTeams();
  };

  const handleAddTeamPlayer = () => {
    setTeamFormState((prev) => ({ ...prev, squad: [...prev.squad.map(normalizeSquadEntry), createBlankTeamPlayer()] }));
  };

  const handleRemoveTeamPlayer = (index) => {
    setTeamFormState((prev) => ({ ...prev, squad: prev.squad.filter((_, playerIndex) => playerIndex !== index) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setIsSavingPlayer(true);
    setPlayerFormError('');

    try {
      const payload = createJugadorPayload(formState);
      const request = editingId
        ? supabase.from("jugadores").update(payload).eq("id", editingId)
        : supabase.from("jugadores").insert(payload);
      const { error: saveError } = await request;
      if (saveError) throw saveError;

      const jugadores = await getJugadores();
      setPlayers(jugadores);
      setEmpty(jugadores.length === 0);
      setError(null);
      closeForm();
    } catch (saveError) {
      setPlayerFormError(saveError.message || 'No se pudo guardar el jugador');
    } finally {
      setIsSavingPlayer(false);
    }
  };

  const handleDelete = async (player) => {
    const confirmed = window.confirm(`¿Eliminar a ${player.name}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase.from("jugadores").delete().eq("id", player.id);
      if (deleteError) throw deleteError;
      const jugadores = await getJugadores();
      setPlayers(jugadores);
      setEmpty(jugadores.length === 0);
      if (selectedPlayerProfileId === player.id) setSelectedPlayerProfileId(null);
    } catch (deleteError) {
      console.error('Error eliminando jugador en Supabase:', deleteError);
      setError(deleteError.message || 'No se pudo eliminar el jugador.');
    } finally {
      setLoading(false);
    }
  };

  const importTeamFromSource = async (sourceUrl) => {
    let imported = null;
    let lastError = null;

    for (const url of getReadableUrls(sourceUrl)) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('No se pudo leer el enlace.');
        const text = await response.text();
        const { doc, players } = extractPlayersFromHtml(text, sourceUrl);
        if (players.length === 0) throw new Error('No se detectaron jugadores.');
        imported = {
          name: extractTeamName(doc, teamFormState.name),
          crest: extractCrest(doc, sourceUrl),
          stadium: extractStadium(doc),
          kitColor: extractKitColor(doc),
          players,
        };
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!imported) throw lastError ?? new Error('No se pudo importar.');
    if (!imported.kitColor && imported.crest) imported.kitColor = await getDominantImageColor(imported.crest);
    return imported;
  };

  const handleTeamSubmit = async (event) => {
    event.preventDefault();
    let squad = dedupeRivalPlayers(teamFormState.squad).filter((player) => player.name.trim());
    let importedData = null;

    if (teamFormState.sourceUrl.trim()) {
      setImportStatus('Importando datos del equipo...');
      try {
        importedData = await importTeamFromSource(normalizeSourceUrl(teamFormState.sourceUrl));
        if (squad.length === 0) squad = importedData.players;
      } catch (error) {
        if (squad.length === 0) {
          setImportStatus('No pude importar ese enlace. Pega la plantilla manualmente o prueba otro enlace de plantilla.');
          return;
        }
        setImportStatus('No pude importar los datos del enlace, pero guardaré la información que has escrito.');
      }
    }

    const currentTeam = teams.find((team) => team.id === editingTeamId);
    const payload = {
      ...createRivalTeamPayload(teamFormState, importedData),
      crest: importedData?.crest || teamFormState.crest || currentTeam?.crest || '',
    };

    try {
      const request = editingTeamId
        ? supabase.from("equipos_rivales").update(payload).eq("id", editingTeamId).select("id").single()
        : supabase.from("equipos_rivales").insert(payload).select("id").single();
      const { data, error: teamError } = await request;
      if (teamError) throw teamError;
      const teamId = editingTeamId || data.id;

      const { error: deletePlayersError } = await supabase.from("jugadores_rivales").delete().eq("equipo_rival_id", teamId);
      if (deletePlayersError) throw deletePlayersError;

      const playerRows = squad.map((player) => createRivalPlayerPayload(teamId, normalizeSquadEntry(player)));
      if (playerRows.length) {
        const { error: playersError } = await supabase.from("jugadores_rivales").insert(playerRows);
        if (playersError) throw playersError;
      }

      await loadTeams();
      setSelectedTeamId(teamId);
      closeTeamForm();
    } catch (saveError) {
      console.error('Error guardando equipo rival en Supabase:', saveError);
      setImportStatus(saveError.message || 'No se pudo guardar el equipo.');
    }
  };

  const handleTeamDelete = async (team) => {
    const confirmed = window.confirm(`¿Eliminar a ${team.name}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from("equipos_rivales").delete().eq("id", team.id);
    if (deleteError) {
      console.error('Error eliminando equipo rival en Supabase:', deleteError);
      setSaveStatus(deleteError.message || 'No se pudo eliminar el equipo.');
      return;
    }
    await loadTeams();
    if (selectedTeamId === team.id) setSelectedTeamId(null);
  };

  const handleSaveTeams = () => {
    loadTeams().catch((loadError) => {
      console.error('Error refrescando equipos rivales desde Supabase:', loadError);
      setSaveStatus(loadError.message || 'No se pudieron cargar los equipos.');
    });
  };

  const openMatchForm = (match = null, section = 'PRE') => {
    if (match) {
      setEditingMatchId(match.id);
      setMatchFormState(normalizeMatch(match));
    } else {
      setEditingMatchId(null);
      setMatchFormState(emptyMatchForm);
    }
    setMatchFormSection(section);
    setIsMatchPanelOpen(true);
  };

  const closeMatchForm = () => {
    setIsMatchPanelOpen(false);
    setEditingMatchId(null);
  };

  const handleMatchChange = (event) => {
    const { name, value, type, checked } = event.target;
    if (name === 'opponent') {
      const selectedTeam = findTeamByDisplayName(teams, value);
      setMatchFormState((prev) => ({
        ...prev,
        opponent: cleanTeamDisplayName(selectedTeam?.name || value),
        opponentCrest: selectedTeam?.crest ?? prev.opponentCrest,
        preRivalSystem: prev.preRivalSystem || selectedTeam?.system || '',
      }));
      return;
    }
    setMatchFormState((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleMatchSubmit = async (event) => {
    event.preventDefault();

    try {
      const payload = createPartidoPayload(matchFormState, teams);
      const request = editingMatchId
        ? supabase.from("partidos").update(payload).eq("id", editingMatchId)
        : supabase.from("partidos").insert(payload);
      const { error: saveError } = await request;
      if (saveError) throw saveError;

      await loadPartidos();
      closeMatchForm();
    } catch (saveError) {
      console.error('Error guardando partido en Supabase:', saveError);
      setSaveStatus(saveError.message || 'No se pudo guardar el partido.');
    }
  };

  const handleMatchDelete = async (match) => {
    const confirmed = window.confirm(`¿Eliminar el partido contra ${match.opponent}?`);
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from("partidos").delete().eq("id", match.id);
    if (deleteError) {
      console.error('Error eliminando partido en Supabase:', deleteError);
      return;
    }
    await loadPartidos();
  };

  const handleSaveMatches = () => {
    loadPartidos().catch((loadError) => {
      console.error('Error refrescando partidos desde Supabase:', loadError);
      setSaveStatus(loadError.message || 'No se pudieron cargar los partidos.');
    });
  };

  const handleImportSquad = async () => {
    const sourceUrl = normalizeSourceUrl(teamFormState.sourceUrl);
    if (!sourceUrl) {
      setImportStatus('Añade un enlace de BeSoccer o Transfermarkt para importar.');
      return;
    }

    setImportStatus('Importando datos...');
    try {
      const imported = await importTeamFromSource(sourceUrl);

      setTeamFormState((prev) => ({
        ...prev,
        name: cleanTeamDisplayName(imported.name || prev.name),
        sourceUrl,
        crest: imported.crest || prev.crest,
        stadium: imported.stadium || prev.stadium,
        kitColor: imported.kitColor || prev.kitColor,
        squad: imported.players.map(normalizeSquadEntry),
      }));

      if (editingTeamId) {
        const { error: teamUpdateError } = await supabase
          .from("equipos_rivales")
          .update({
            crest: imported.crest || teamFormState.crest || '',
            stadium: imported.stadium || teamFormState.stadium || '',
            kit_color: imported.kitColor || teamFormState.kitColor || '#ef233c',
          })
          .eq("id", editingTeamId);
        if (teamUpdateError) console.error('Error actualizando equipo rival en Supabase:', teamUpdateError);
        await loadTeams();
      }

      setImportStatus(`Plantilla importada: ${imported.players.length} jugadores detectados.`);
    } catch (error) {
      setImportStatus('No pude importar ese enlace porque la web bloquea la lectura automática. Prueba con el enlace de plantilla exacto o pega la plantilla.');
    }
  };

  const updateTeamLineup = async (teamId, updater) => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    const nextLineup = updater(team.lineup ?? emptyLineup);
    setTeams((current) =>
      current.map((item) => (item.id === teamId ? { ...item, lineup: nextLineup } : item))
    );
    try {
      await persistTeamLineup(teamId, nextLineup);
      const titularNames = nextLineup.map((player) => player.name).filter(Boolean);
      await supabase.from("jugadores_rivales").update({ role: 'Reserva' }).eq("equipo_rival_id", teamId);
      if (titularNames.length) {
        await supabase.from("jugadores_rivales").update({ role: 'Titular' }).eq("equipo_rival_id", teamId).in("name", titularNames);
      }
      await loadTeams();
    } catch (lineupError) {
      console.error('Error guardando alineación rival en Supabase:', lineupError);
      setSaveStatus(lineupError.message || 'No se pudo guardar la alineación.');
    }
  };

  const handleDropOnField = (event) => {
    event.preventDefault();
    if (!selectedTeam || !draggedPlayer) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(4, Math.min(88, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(4, Math.min(96, ((event.clientY - rect.top) / rect.height) * 100));

    updateTeamLineup(selectedTeam.id, (lineup) => {
      const playerName = draggedPlayer.name;
      const existing = lineup.find((item) => item.name === playerName);
      if (existing) {
        return lineup.map((item) => (item.name === playerName ? { ...item, x, y } : item));
      }
      return [...lineup.filter((item) => item.name !== playerName), { ...normalizeSquadEntry(draggedPlayer), role: 'Titular', x, y }];
    });
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === draggedPlayer.name ? { ...player, role: 'Titular' } : player;
              }),
            }
          : team
      )
    );
    setDraggedPlayer(null);
  };

  const removeFromLineup = (playerName) => {
    if (!selectedTeam) return;
    updateTeamLineup(selectedTeam.id, (lineup) => lineup.filter((item) => item.name !== playerName));
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === playerName ? { ...player, role: 'Reserva' } : player;
              }),
            }
          : team
      )
    );
  };

  const arrangeSelectedTeam = () => {
    if (!selectedTeam) return;
    const squad = selectedTeam.squad.map(normalizeSquadEntry);
    const starters = squad.filter((player) => player.role === 'Titular');
    const prioritized = starters.length > 0 ? starters : squad.slice(0, 11);
    const fieldCoordinates = getFormationCoordinates(selectedTeam.system);
    const lineup = prioritized.slice(0, 11).map((player, index) => ({ ...player, role: 'Titular', slot: index, ...fieldCoordinates[index] }));

    updateTeamLineup(selectedTeam.id, () => lineup);
  };

  const handleDropOnLineupSlot = (slotIndex) => {
    if (!selectedTeam || !draggedPlayer) return;
    const coordinates = getFormationCoordinates(selectedTeam.system)[slotIndex];
    const droppedPlayer = { ...normalizeSquadEntry(draggedPlayer), role: 'Titular', slot: slotIndex, ...coordinates };

    updateTeamLineup(selectedTeam.id, (lineup) => [
      ...lineup.filter((player) => player.name !== droppedPlayer.name && player.slot !== slotIndex),
      droppedPlayer,
    ]);
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === droppedPlayer.name ? { ...player, role: 'Titular' } : player;
              }),
            }
          : team
      )
    );
    setDraggedPlayer(null);
  };

  const updateSelectedTeamSystem = async (system) => {
    if (!selectedTeam) return;
    const coordinates = getFormationCoordinates(system);
    const nextLineup = (selectedTeam.lineup ?? emptyLineup)
      .slice(0, 11)
      .map((player, index) => ({ ...player, slot: player.slot ?? index, ...coordinates[player.slot ?? index] }));
    const { error: systemError } = await supabase.from("equipos_rivales").update({ system }).eq("id", selectedTeam.id);
    if (systemError) {
      console.error('Error guardando sistema rival en Supabase:', systemError);
      setSaveStatus(systemError.message || 'No se pudo guardar el sistema.');
      return;
    }
    try {
      await persistTeamLineup(selectedTeam.id, nextLineup);
      await loadTeams();
    } catch (lineupError) {
      console.error('Error reajustando alineación rival en Supabase:', lineupError);
    }
  };

  const setSelectedTeamPlayerRole = async (playerName, role) => {
    if (!selectedTeam) return;
    const { error: roleError } = await supabase
      .from("jugadores_rivales")
      .update({ role })
      .eq("equipo_rival_id", selectedTeam.id)
      .eq("name", playerName);
    if (roleError) {
      console.error('Error actualizando rol del jugador rival en Supabase:', roleError);
      return;
    }
    if (role === 'Reserva') {
      await updateTeamLineup(selectedTeam.id, (lineup) => lineup.filter((player) => player.name !== playerName));
    } else {
      await loadTeams();
    }
  };

  const toggleSelectedTeamKeyPlayer = async (playerName) => {
    if (!selectedTeam) return;
    const currentPlayer = selectedTeam.squad.map(normalizeSquadEntry).find((player) => player.name === playerName);
    const nextIsKey = !currentPlayer?.isKey;
    const { error: keyError } = await supabase
      .from("jugadores_rivales")
      .update({ is_key: nextIsKey })
      .eq("equipo_rival_id", selectedTeam.id)
      .eq("name", playerName);
    if (keyError) {
      console.error('Error marcando jugador clave rival en Supabase:', keyError);
      return;
    }
    await loadTeams();
  };

  const handleDropOnBenchSlot = async (starterName, slotIndex) => {
    if (!selectedTeam || !draggedPlayer) return;
    const droppedPlayer = { ...normalizeSquadEntry(draggedPlayer), role: 'Reserva' };
    const nextBenchChart = Object.fromEntries(
      Object.entries(selectedTeam.benchChart ?? emptyDepthChart).map(([chartStarter, slots]) => [
        chartStarter,
        slots.map((player) => (player?.name === droppedPlayer.name ? null : player)),
      ])
    );
    const slots = [...(nextBenchChart[starterName] ?? [null, null])].slice(0, 2);
    while (slots.length < 2) slots.push(null);
    slots[slotIndex] = droppedPlayer;
    nextBenchChart[starterName] = slots;

    try {
      await persistTeamBench(selectedTeam.id, nextBenchChart);
      await updateTeamLineup(selectedTeam.id, (lineup) => lineup.filter((player) => player.name !== droppedPlayer.name));
      await supabase.from("jugadores_rivales").update({ role: 'Reserva' }).eq("equipo_rival_id", selectedTeam.id).eq("name", droppedPlayer.name);
      await loadTeams();
    } catch (benchError) {
      console.error('Error guardando banquillo rival en Supabase:', benchError);
      setSaveStatus(benchError.message || 'No se pudo guardar el banquillo.');
    }
    setDraggedPlayer(null);
  };

  const clearBenchSlot = async (starterName, slotIndex) => {
    if (!selectedTeam) return;
    const slots = [...(selectedTeam.benchChart?.[starterName] ?? [null, null])].slice(0, 2);
    while (slots.length < 2) slots.push(null);
    slots[slotIndex] = null;
    const nextBenchChart = { ...(selectedTeam.benchChart ?? emptyDepthChart), [starterName]: slots };
    try {
      await persistTeamBench(selectedTeam.id, nextBenchChart);
      await loadTeams();
    } catch (benchError) {
      console.error('Error limpiando banquillo rival en Supabase:', benchError);
    }
  };

  const getSelectedLineupName = () => {
    if (!selectedMatch) return '';
    return selectedMatch.preCaudalLineup?.[selectedTacticalPlayerIndex] || '';
  };

  const getSelectedRivalLineupName = () => {
    if (!selectedMatch) return '';
    return selectedMatch.preRivalLineup?.[selectedRivalTacticalPlayerIndex] || '';
  };

  const updateCaudalLineupSlot = async (slotIndex, playerName) => {
    if (!selectedMatch) return;
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preCaudalLineup?.[index] || '');
    const repeatedIndex = nextLineup.findIndex((name, index) => name === playerName && index !== slotIndex);
    if (repeatedIndex >= 0) nextLineup[repeatedIndex] = '';
    nextLineup[slotIndex] = playerName;
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, preCaudalLineup: nextLineup } : match)));
    try {
      if (repeatedIndex >= 0) await clearMatchLineupSlot({ matchId: selectedMatch.id, scope: 'pre_caudal', slotIndex: repeatedIndex });
      await saveMatchLineupSlot({ matchId: selectedMatch.id, scope: 'pre_caudal', slotIndex, playerName });
      const player = players.find((item) => item.name === playerName);
      await supabase.from("partido_convocados").upsert(
        {
          partido_id: selectedMatch.id,
          jugador_id: isUuid(player?.id) ? player.id : null,
          player_name: playerName,
        },
        { onConflict: "partido_id,player_name" }
      );
      await loadMatchPreData(selectedMatch.id);
    } catch (slotError) {
      console.error('Error guardando once PRE Caudal en Supabase:', slotError);
      setPreError(slotError.message || 'No se pudo guardar la alineación PRE.');
    }
  };

  const updateRivalLineupSlot = async (slotIndex, playerName) => {
    if (!selectedMatch) return;
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preRivalLineup?.[index] || '');
    const repeatedIndex = nextLineup.findIndex((name, index) => name === playerName && index !== slotIndex);
    if (repeatedIndex >= 0) nextLineup[repeatedIndex] = '';
    nextLineup[slotIndex] = playerName;
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, preRivalLineup: nextLineup } : match)));
    try {
      if (repeatedIndex >= 0) await clearMatchLineupSlot({ matchId: selectedMatch.id, scope: 'pre_rival', slotIndex: repeatedIndex });
      await saveMatchLineupSlot({ matchId: selectedMatch.id, scope: 'pre_rival', slotIndex, playerName });
      await loadMatchPreData(selectedMatch.id);
    } catch (slotError) {
      console.error('Error guardando once PRE rival en Supabase:', slotError);
      setPreError(slotError.message || 'No se pudo guardar la alineación rival.');
    }
  };

  const clearCaudalLineupSlot = async (slotIndex) => {
    if (!selectedMatch) return;
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preCaudalLineup?.[index] || '');
    nextLineup[slotIndex] = '';
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, preCaudalLineup: nextLineup } : match)));
    try {
      await clearMatchLineupSlot({ matchId: selectedMatch.id, scope: 'pre_caudal', slotIndex });
      await loadMatchPreData(selectedMatch.id);
    } catch (slotError) {
      console.error('Error limpiando once PRE Caudal en Supabase:', slotError);
      setPreError(slotError.message || 'No se pudo limpiar la alineación PRE.');
    }
  };

  const clearRivalLineupSlot = async (slotIndex) => {
    if (!selectedMatch) return;
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preRivalLineup?.[index] || '');
    nextLineup[slotIndex] = '';
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, preRivalLineup: nextLineup } : match)));
    try {
      await clearMatchLineupSlot({ matchId: selectedMatch.id, scope: 'pre_rival', slotIndex });
      await loadMatchPreData(selectedMatch.id);
    } catch (slotError) {
      console.error('Error limpiando once PRE rival en Supabase:', slotError);
      setPreError(slotError.message || 'No se pudo limpiar la alineación rival.');
    }
  };

  const loadSuggestedCaudalLineup = async () => {
    if (!selectedMatch) return;
    const nextLineup = Array.from({ length: 11 }, (_, index) => players[index]?.name || '');
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, preCaudalLineup: nextLineup } : match)));
    try {
      await supabase.from("partido_alineacion_slots").delete().eq("partido_id", selectedMatch.id).eq("scope", "pre_caudal");
      const rows = nextLineup
        .map((playerName, slot) => ({ playerName, slot }))
        .filter((row) => row.playerName);
      for (const row of rows) {
        await saveMatchLineupSlot({ matchId: selectedMatch.id, scope: 'pre_caudal', slotIndex: row.slot, playerName: row.playerName });
        const player = players.find((item) => item.name === row.playerName);
        await supabase.from("partido_convocados").upsert(
          { partido_id: selectedMatch.id, jugador_id: isUuid(player?.id) ? player.id : null, player_name: row.playerName },
          { onConflict: "partido_id,player_name" }
        );
      }
      await loadMatchPreData(selectedMatch.id);
    } catch (lineupError) {
      console.error('Error cargando once sugerido Caudal en Supabase:', lineupError);
      setPreError(lineupError.message || 'No se pudo guardar el once sugerido.');
    }
    setSelectedTacticalPlayerIndex(0);
  };

  const loadSuggestedRivalLineup = async () => {
    if (!selectedMatch) return;
    const rivalTeam = getRivalBaseTeam();
    const nextSystem = rivalTeam?.system || getCurrentRivalSystem();
    const nextLineup = Array.from({ length: 11 }, (_, index) => getRivalAvailablePlayers()[index]?.name || '');
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, preRivalSystem: nextSystem, preRivalLineup: nextLineup } : match)));
    try {
      await updateSelectedMatchFields({ preRivalSystem: nextSystem });
      await supabase.from("partido_alineacion_slots").delete().eq("partido_id", selectedMatch.id).eq("scope", "pre_rival");
      const rows = nextLineup
        .map((playerName, slot) => ({ playerName, slot }))
        .filter((row) => row.playerName);
      for (const row of rows) {
        await saveMatchLineupSlot({ matchId: selectedMatch.id, scope: 'pre_rival', slotIndex: row.slot, playerName: row.playerName });
      }
      await loadMatchPreData(selectedMatch.id);
    } catch (lineupError) {
      console.error('Error cargando once sugerido rival en Supabase:', lineupError);
      setPreError(lineupError.message || 'No se pudo guardar el once rival.');
    }
    setSelectedRivalTacticalPlayerIndex(0);
  };

  const ensureManualRivalPlayer = async (player) => {
    const rivalTeam = getRivalBaseTeam();
    if (!rivalTeam?.id || !isUuid(rivalTeam.id)) return null;

    const { data: existingRows, error: existingError } = await supabase
      .from("jugadores_rivales")
      .select("*")
      .eq("equipo_rival_id", rivalTeam.id);
    if (existingError) throw existingError;
    const existingPlayer = (existingRows || []).find((row) => normalizePlayerIdentityName(row.name) === normalizePlayerIdentityName(player.name));
    if (existingPlayer) return normalizeSupabaseRivalPlayer(existingPlayer);

    const { data: insertedPlayer, error: insertError } = await supabase
      .from("jugadores_rivales")
      .insert(createRivalPlayerPayload(rivalTeam.id, { ...createBlankTeamPlayer(), ...player, role: 'Titular' }))
      .select("*")
      .single();
    if (insertError) throw insertError;
    await loadTeams();
    return normalizeSupabaseRivalPlayer(insertedPlayer);
  };

  const addManualRivalPlayer = async () => {
    const playerName = newRivalManualPlayerName.trim();
    if (!selectedMatch || !playerName) return;
    const rivalRoles = getFormationRoles(getCurrentRivalSystem());
    const manualPlayer = { ...createBlankTeamPlayer(), name: playerName, number: '', position: rivalRoles[selectedRivalTacticalPlayerIndex] || '' };
    const exists = getRivalAvailablePlayers().some((player) => cleanTeamDisplayName(player.name).toLowerCase() === cleanTeamDisplayName(playerName).toLowerCase());
    const nextManualPlayers = exists
      ? selectedMatch.preRivalManualPlayers || []
      : [...(selectedMatch.preRivalManualPlayers || []), manualPlayer];
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preRivalLineup?.[index] || '');
    nextLineup[selectedRivalTacticalPlayerIndex] = playerName;
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, preRivalManualPlayers: nextManualPlayers, preRivalLineup: nextLineup } : match)));
    try {
      const storedPlayer = exists ? getRivalAvailablePlayers().find((player) => cleanTeamDisplayName(player.name).toLowerCase() === cleanTeamDisplayName(playerName).toLowerCase()) : await ensureManualRivalPlayer(manualPlayer);
      await saveMatchLineupSlot({
        matchId: selectedMatch.id,
        scope: 'pre_rival',
        slotIndex: selectedRivalTacticalPlayerIndex,
        playerName,
        jugadorRivalId: storedPlayer?.id || null,
      });
      await loadMatchPreData(selectedMatch.id);
    } catch (slotError) {
      console.error('Error guardando jugador rival manual en PRE:', slotError);
      setPreError(slotError.message || 'No se pudo guardar el jugador rival manual.');
    }
    setNewRivalManualPlayerName('');
  };

  const updateSelectedPlayerNote = async (note) => {
    if (!selectedMatch) return;
    const playerName = getSelectedLineupName();
    if (!playerName) return;
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? {
      ...match,
      prePlayerNotes: { ...(match.prePlayerNotes || {}), [playerName]: note },
    } : match)));
    const { error: noteError } = await supabase.from("partido_notas_individuales_pre").upsert(
      {
        partido_id: selectedMatch.id,
        scope: 'caudal',
        player_name: playerName,
        note,
      },
      { onConflict: "partido_id,scope,player_name" }
    );
    if (noteError) {
      console.error('Error guardando nota individual PRE Caudal en Supabase:', noteError);
      setPreError(noteError.message || 'No se pudo guardar la nota individual.');
      return;
    }
    await loadMatchPreData(selectedMatch.id);
  };

  const updateSelectedRivalPlayerNote = async (note) => {
    if (!selectedMatch) return;
    const playerName = getSelectedRivalLineupName();
    if (!playerName) return;
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? {
      ...match,
      preRivalPlayerNotes: { ...(match.preRivalPlayerNotes || {}), [playerName]: note },
    } : match)));
    const { error: noteError } = await supabase.from("partido_notas_individuales_pre").upsert(
      {
        partido_id: selectedMatch.id,
        scope: 'rival',
        player_name: playerName,
        note,
      },
      { onConflict: "partido_id,scope,player_name" }
    );
    if (noteError) {
      console.error('Error guardando nota individual PRE rival en Supabase:', noteError);
      setPreError(noteError.message || 'No se pudo guardar la nota rival.');
      return;
    }
    await loadMatchPreData(selectedMatch.id);
  };

  const renderQuestionnaireField = ({ label, field, placeholder, type = 'textarea', options = [], multiple = false, wide = false }) => {
    const selectedValues = String(selectedMatch[field] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const optionValue = (option) => (typeof option === 'string' ? option : option.value);
    const optionLabel = (option) => (typeof option === 'string' ? option : option.label);
    const toggleChip = (value) => {
      if (!multiple) {
        updateSelectedMatchFields({ [field]: selectedMatch[field] === value ? '' : value });
        return;
      }
      const nextValues = selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value];
      updateSelectedMatchFields({ [field]: nextValues.join(', ') });
    };

    return (
    <label key={field} className={`space-y-2 text-sm text-slate-300 ${wide ? 'md:col-span-2' : ''}`}>
      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {type === 'chips' ? (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const value = optionValue(option);
            const isSelected = multiple ? selectedValues.includes(value) : selectedMatch[field] === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleChip(value)}
                className={`rounded-2xl px-3 py-2 text-xs font-black uppercase tracking-[0.1em] transition ${
                  isSelected
                    ? 'bg-emerald-300 text-slate-950 shadow-[0_0_20px_rgba(110,231,183,0.18)]'
                    : 'bg-white/8 text-slate-300 ring-1 ring-white/10 hover:bg-white/15 hover:text-white'
                }`}
              >
                {optionLabel(option)}
              </button>
            );
          })}
        </div>
      ) : type === 'select' ? (
        <select
          value={selectedMatch[field] || options[0] || ''}
          onChange={(event) => updateSelectedMatchFields({ [field]: event.target.value })}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
        >
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <textarea
          value={selectedMatch[field] || ''}
          onChange={(event) => updateSelectedMatchFields({ [field]: event.target.value })}
          placeholder={placeholder}
          className="min-h-[86px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
        />
      )}
    </label>
    );
  };

  const renderQuestionnaireSection = ({ id, title, description, fields }) => {
    const isOpen = openQuestionnaireSections[id];
    const completed = fields.filter((field) => selectedMatch[field.field]).length;
    return (
      <div key={id} className="overflow-hidden rounded-3xl border border-white/10 bg-[#0f1e38]/80">
        <button
          type="button"
          onClick={() => setOpenQuestionnaireSections((prev) => ({ ...prev, [id]: !prev[id] }))}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <span>
            <span className="block text-sm font-bold uppercase tracking-[0.18em] text-white">{title}</span>
            <span className="mt-1 block text-sm text-slate-400">{description}</span>
          </span>
          <span className="shrink-0 rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-300">
            {completed}/{fields.length} {isOpen ? 'Cerrar' : 'Abrir'}
          </span>
        </button>
        {isOpen ? (
          <div className="grid gap-4 border-t border-white/10 px-5 py-5 md:grid-cols-2">
            {fields.map(renderQuestionnaireField)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderSystemsPitch = () => {
    if (!selectedMatch) return null;
    const toCaudalHalf = (position) => ({ x: 10 + position.x * 0.8, y: 50 + position.y * 0.44 });
    const toRivalHalf = (position) => ({ x: 10 + position.x * 0.8, y: 50 - position.y * 0.44 });
    const caudalCoordinates = getFormationCoordinates(selectedMatch.preCaudalSystem || '4-4-2').map(toCaudalHalf);
    const rivalCoordinates = getFormationCoordinates(getCurrentRivalSystem()).map(toRivalHalf);
    const caudalRoles = getFormationRoles(selectedMatch.preCaudalSystem || '4-4-2');
    const rivalRoles = getFormationRoles(getCurrentRivalSystem());
    const caudalLineup = getCaudalPitchNames(selectedMatch.preCaudalLineup || [], [], caudalRoles);
    const rivalLineup = getCaudalPitchNames(selectedMatch.preRivalLineup || [], rivalRoles, rivalRoles);
    const renderPlayer = (position, index, team, lineup) => {
      const isCaudal = team === 'caudal';
      const isRival = team === 'rival';
      const isSelected = (isCaudal && selectedTacticalPlayerIndex === index) || (isRival && selectedRivalTacticalPlayerIndex === index);
      const playerName = lineup[index] || `${isCaudal ? 'Jugador' : 'Rol'} ${index + 1}`;
      const statusPlayer = isRival ? getRivalLineupPlayerForSlot(index, playerName) : null;
      const statusBadges = statusPlayer ? playerStatusBadges(statusPlayer) : [];
      const PlayerTag = isCaudal || isRival ? 'button' : 'div';
      return (
        <PlayerTag
          key={`${team}-${index}`}
          type={isCaudal || isRival ? 'button' : undefined}
          onClick={isCaudal ? () => setSelectedTacticalPlayerIndex(index) : isRival ? () => setSelectedRivalTacticalPlayerIndex(index) : undefined}
          className={`absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 ${isCaudal ? 'text-caudal-electric' : 'text-rose-200'} ${isCaudal || isRival ? 'cursor-pointer' : ''}`}
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
        >
          <span className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-black shadow-lg ${isCaudal ? 'border-caudal-electric bg-caudal-950' : 'border-rose-300 bg-rose-950'} ${isSelected ? 'ring-4 ring-caudal-electric/30' : ''}`}>
            {index === 0 ? 'P' : index}
            {statusBadges.length ? (
              <span className="absolute -right-3 -top-2 flex max-w-14 flex-wrap justify-end gap-0.5">
                {statusBadges.map((badge) => (
                  <span key={badge.title} title={badge.title} className={`inline-flex h-3 min-w-3 items-center justify-center rounded-sm px-0.5 text-[8px] font-black leading-none ${badge.className}`}>
                    {badge.label}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
          <span className={`max-w-16 truncate rounded-md px-1 py-0.5 text-[8px] font-semibold leading-none ${isSelected ? (isCaudal ? 'bg-caudal-electric text-slate-950' : 'bg-rose-300 text-rose-950') : 'bg-black/55 text-white'}`}>
            {playerName}
          </span>
        </PlayerTag>
      );
    };

    return (
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b5b3f] p-3 shadow-inner">
        <div className="relative mx-auto aspect-[7/10] min-h-[620px] max-w-[560px] overflow-hidden rounded-2xl border-2 border-white/60 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_50%,transparent_50%),linear-gradient(0deg,rgba(255,255,255,0.05)_50%,transparent_50%)] bg-[length:20%_100%,100%_14.2%]">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/60" />
          <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60" />
          <div className="absolute left-1/2 top-0 h-24 w-48 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/60" />
          <div className="absolute bottom-0 left-1/2 h-24 w-48 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/60" />
          <div className="absolute left-1/2 top-0 h-12 w-24 -translate-x-1/2 rounded-b-2xl border-x-2 border-b-2 border-white/45" />
          <div className="absolute bottom-0 left-1/2 h-12 w-24 -translate-x-1/2 rounded-t-2xl border-x-2 border-t-2 border-white/45" />
          <div className="absolute left-4 top-4 rounded-xl bg-rose-950/75 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white">
            Rival · {getCurrentRivalSystem()}
          </div>
          <div className="absolute bottom-4 left-4 rounded-xl bg-caudal-950/75 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white">
            C.D. Caudal · {selectedMatch.preCaudalSystem || '4-4-2'}
          </div>
          {caudalCoordinates.map((position, index) => renderPlayer(position, index, 'caudal', caudalLineup))}
          {rivalCoordinates.map((position, index) => renderPlayer(position, index, 'rival', rivalLineup))}
        </div>
      </div>
    );
  };

  const renderFacingSystemsOverview = () => {
    if (!selectedMatch) {
      return (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
          Selecciona un partido para ver la pizarra táctica.
        </div>
      );
    }
    const caudalSystem = selectedMatch.preCaudalSystem || '4-4-2';
    const rivalSystem = getCurrentRivalSystem();
    const toOverviewCaudalHalf = (slot) => ({ x: Number(slot?.x || 0), y: 50 + Number(slot?.y || 0) * 0.42 });
    const toOverviewRivalHalf = (slot) => ({ x: 100 - Number(slot?.x || 0), y: 50 - Number(slot?.y || 0) * 0.42 });
    const caudalCoordinates = safeArray(getFormationCoordinates(caudalSystem)).map(toOverviewCaudalHalf);
    const rivalCoordinates = safeArray(getFormationCoordinates(rivalSystem)).map(toOverviewRivalHalf);
    const caudalRoles = safeArray(getFormationRoles(caudalSystem));
    const rivalRoles = safeArray(getFormationRoles(rivalSystem));
    const caudalLineup = safeArray(selectedMatch.preCaudalLineup);
    const rivalLineup = safeArray(selectedMatch.preRivalLineup);
    return (
      <div className="relative mx-auto aspect-[7/8.4] min-h-[420px] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/15 bg-[#102616] shadow-inner">
        <div className="absolute inset-4 rounded-[28px] border-2 border-white/55" />
        <div className="absolute left-4 right-4 top-1/2 h-px bg-white/35" />
        <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
        <div className="absolute left-1/2 top-4 h-20 w-48 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/35" />
        <div className="absolute bottom-4 left-1/2 h-20 w-48 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/35" />
        <div className="absolute left-0 right-0 top-1/2 flex -translate-y-1/2 justify-between px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
          <span>Rival {rivalSystem}</span>
          <span>Caudal {caudalSystem}</span>
        </div>
        {rivalCoordinates.map((slot, index) => (
          <div key={`rival-overview-${index}`} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-500/80 text-[10px] font-black text-white shadow-lg">{index === 0 ? 'P' : index}</span>
            <span className="max-w-20 truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[8px] font-semibold text-white">
              {rivalLineup[index] || rivalRoles[index] || `R${index + 1}`}
            </span>
          </div>
        ))}
        {caudalCoordinates.map((slot, index) => (
          <div key={`caudal-overview-${index}`} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-caudal-electric bg-caudal-950 text-[10px] font-black text-caudal-electric shadow-lg">{index === 0 ? 'P' : index}</span>
            <span className="max-w-20 truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[8px] font-semibold text-white">
              {caudalLineup[index] || caudalRoles[index] || `C${index + 1}`}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderPerformanceSection = () => {
    const dashboard = getPerformanceDashboard();
    const statusClass = {
      verde: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200',
      amarillo: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
      rojo: 'border-red-300/25 bg-red-500/10 text-red-100',
    };
    const mdOptions = ['MD+1', 'MD-4', 'MD-3', 'MD-2', 'MD-1', 'MD'];
    const playerMapRows = players.map((player) => ({
      form_name: player.name,
      jugador_id: player.id,
      name: player.name,
    }));
    const playerMapClipboardText = [
      'form_name\tjugador_id\tname',
      ...playerMapRows.map((row) => `${row.form_name}\t${row.jugador_id}\t${row.name}`),
    ].join('\n');
    const copyPlayersMap = async () => {
      try {
        await navigator.clipboard.writeText(playerMapClipboardText);
        setPerformanceStatus('Mapa de jugadores copiado. Pégalo directamente en Google Sheets.');
        setPerformanceError('');
      } catch (copyError) {
        console.error('Error copiando mapa de jugadores:', copyError);
        setPerformanceError('No se pudo copiar el mapa de jugadores desde el navegador.');
      }
    };

    return (
      <section className="space-y-6">
        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Rendimiento</p>
              <h2 className="mt-2 text-3xl font-semibold text-white">Control PF del microciclo</h2>
              <p className="mt-2 text-sm text-slate-400">Wellness, RPE, carga interna y alertas simples sincronizadas con Supabase.</p>
            </div>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Inicio semana</span>
              <input type="date" value={performanceWeekStart} onChange={(event) => setPerformanceWeekStart(event.target.value)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
            </label>
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">{performanceWeekStart} / {performanceWeekEnd}</p>
        </div>

        {performanceError ? <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-100">{performanceError}</div> : null}
        {performanceStatus ? <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-sm text-emerald-100">{performanceStatus}</div> : null}
        {performanceLoading ? <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 text-sm text-slate-400">Cargando Rendimiento desde Supabase...</div> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Carga semanal', Math.round(dashboard.totalLoad), 'UA'],
            ['RPE medio', dashboard.avgRpe ? dashboard.avgRpe.toFixed(1) : '-', '/10'],
            ['Wellness medio', dashboard.avgWellness ? dashboard.avgWellness.toFixed(1) : '-', '/10'],
            ['Volumen total', Math.round(dashboard.totalVolume), 'min'],
          ].map(([label, value, suffix]) => (
            <div key={label} className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <p className="mt-3 text-3xl font-black text-white">{value} <span className="text-sm text-slate-500">{suffix}</span></p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <form onSubmit={saveTrainingSession} className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Crear sesión</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <input type="date" value={performanceSessionDraft.sessionDate} onChange={(event) => setPerformanceSessionDraft((current) => ({ ...current, sessionDate: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
              <select value={performanceSessionDraft.mdLabel} onChange={(event) => setPerformanceSessionDraft((current) => ({ ...current, mdLabel: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                {mdOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <input value={performanceSessionDraft.formCode} onChange={(event) => setPerformanceSessionDraft((current) => ({ ...current, formCode: event.target.value }))} placeholder="RPE-2026-05-08-MD3" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
              <input value={performanceSessionDraft.title} onChange={(event) => setPerformanceSessionDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Título sesión" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
              <input type="number" min="0" value={performanceSessionDraft.plannedDuration} onChange={(event) => setPerformanceSessionDraft((current) => ({ ...current, plannedDuration: event.target.value }))} placeholder="Duración planificada" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            </div>
            <p className="mt-3 rounded-2xl bg-white/5 px-4 py-3 text-xs text-slate-400">
              Código para Google Forms RPE: <span className="font-bold text-white">{performanceSessionDraft.formCode || 'RPE-YYYY-MM-DD-MD3'}</span>
            </p>
            <textarea value={performanceSessionDraft.notes} onChange={(event) => setPerformanceSessionDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Notas de la sesión" className="mt-4 min-h-[90px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <button type="submit" className="mt-4 w-full rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950">Guardar sesión</button>
          </form>

          <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Resumen por día</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mdOptions.map((md) => {
                const sessions = trainingSessions.filter((session) => session.md_label === md);
                const load = sessions.reduce((sum, session) => sum + dashboard.dailyLoad.filter((item) => item.session.id === session.id).reduce((acc, item) => acc + item.load, 0), 0);
                return (
                  <div key={md} className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">{md}</p>
                    <p className="mt-2 text-2xl font-black text-white">{Math.round(load)}</p>
                    <p className="mt-1 text-xs text-slate-500">{sessions.length} sesiones</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Exportar mapa jugadores</h3>
              <p className="mt-2 text-sm text-slate-400">Tabla lista para pegar en la hoja jugadores_map de Google Sheets.</p>
            </div>
            <button type="button" onClick={copyPlayersMap} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950">
              Copiar mapa jugadores
            </button>
          </div>
          <div className="mt-5 max-h-72 overflow-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  {['form_name', 'jugador_id', 'name'].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}
                </tr>
              </thead>
              <tbody>
                {playerMapRows.map((row) => (
                  <tr key={row.jugador_id} className="border-t border-white/10">
                    <td className="px-4 py-3 font-semibold text-white">{row.form_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{row.jugador_id}</td>
                    <td className="px-4 py-3 text-slate-300">{row.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={saveWellnessEntry} className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Wellness diario</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <select value={wellnessDraft.jugadorId} onChange={(event) => setWellnessDraft((current) => ({ ...current, jugadorId: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                <option value="">Jugador</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
              </select>
              <input type="date" value={wellnessDraft.entryDate} onChange={(event) => setWellnessDraft((current) => ({ ...current, entryDate: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
              {[
                ['Sueño calidad', 'sleepQuality'],
                ['Fatiga', 'fatigue'],
                ['Dolor muscular', 'muscleSoreness'],
                ['Estrés', 'stress'],
                ['Ánimo', 'mood'],
                ['Peso', 'weight'],
              ].map(([label, field]) => (
                <label key={field} className="space-y-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <span>{label}</span>
                  <input type="number" min={field === 'weight' ? undefined : 1} max={field === 'weight' ? undefined : 10} step={field === 'weight' ? '0.1' : '1'} value={wellnessDraft[field]} onChange={(event) => setWellnessDraft((current) => ({ ...current, [field]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                </label>
              ))}
            </div>
            <input value={wellnessDraft.discomfort} onChange={(event) => setWellnessDraft((current) => ({ ...current, discomfort: event.target.value }))} placeholder="Molestias" className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <textarea value={wellnessDraft.comment} onChange={(event) => setWellnessDraft((current) => ({ ...current, comment: event.target.value }))} placeholder="Comentario libre" className="mt-4 min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <button type="submit" className="mt-4 w-full rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950">Guardar wellness</button>
          </form>

          <form onSubmit={saveRpeEntry} className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">RPE post-entrenamiento</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <select value={rpeDraft.jugadorId} onChange={(event) => setRpeDraft((current) => ({ ...current, jugadorId: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                <option value="">Jugador</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
              </select>
              <select value={rpeDraft.sessionId} onChange={(event) => setRpeDraft((current) => ({ ...current, sessionId: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                <option value="">Sesión</option>
                {trainingSessions.map((session) => <option key={session.id} value={session.id}>{session.md_label || session.session_date} · {session.title || session.session_type}</option>)}
              </select>
              <input type="number" min="0" value={rpeDraft.durationMinutes} onChange={(event) => setRpeDraft((current) => ({ ...current, durationMinutes: event.target.value }))} placeholder="Duración minutos" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
              <input type="number" min="1" max="10" value={rpeDraft.rpe} onChange={(event) => setRpeDraft((current) => ({ ...current, rpe: event.target.value }))} placeholder="RPE 1-10" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            </div>
            <p className="mt-3 rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-300">Carga automática: <span className="font-black text-white">{normalizePerformanceNumber(rpeDraft.durationMinutes) * normalizePerformanceNumber(rpeDraft.rpe)}</span></p>
            <textarea value={rpeDraft.comment} onChange={(event) => setRpeDraft((current) => ({ ...current, comment: event.target.value }))} placeholder="Comentario libre" className="mt-4 min-h-[90px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <button type="submit" className="mt-4 w-full rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950">Guardar RPE</button>
          </form>
        </div>

        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
          <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Semáforo PF y evolución individual</h3>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>{['Jugador', 'Estado', 'Carga', 'RPE medio', 'Wellness', 'Peso', 'Min partido', 'Molestias'].map((head) => <th key={head} className="px-3 py-3">{head}</th>)}</tr>
              </thead>
              <tbody>
                {dashboard.rows.map((row) => (
                  <tr key={row.player.id} className="border-t border-white/10">
                    <td className="px-3 py-4 font-bold text-white">{row.player.name}</td>
                    <td className="px-3 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass[row.status]}`}>{row.status}</span></td>
                    <td className="px-3 py-4 text-white">{Math.round(row.totalLoad)}</td>
                    <td className="px-3 py-4 text-white">{row.avgRpe ? row.avgRpe.toFixed(1) : '-'}</td>
                    <td className="px-3 py-4 text-white">{row.wellnessScore ? row.wellnessScore.toFixed(1) : '-'}</td>
                    <td className="px-3 py-4 text-white">{row.latestWellness?.weight || '-'}</td>
                    <td className="px-3 py-4 text-white">{row.matchMinutes}</td>
                    <td className="px-3 py-4 text-slate-300">{row.latestWellness?.discomfort || row.latestWellness?.comment || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
          <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Informe semanal PF</h3>
          <p className="mt-4 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm leading-7 text-slate-200">{getPerformanceReport()}</p>
        </div>
      </section>
    );
  };

  const authUser = session?.user ?? null;
  const splashScreen = showSplash ? (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#111111] text-white transition-opacity duration-300 ${
        isSplashVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <img src="/pwa-192x192.png" alt="Escudo del C.D. Caudal" className="h-28 w-28 object-contain" />
      <p className="mt-5 text-lg font-semibold tracking-wide">App Caudal</p>
    </div>
  ) : null;

  if (!authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-caudal-950 via-caudal-900 to-[#05101f] text-slate-100">
        {splashScreen}
        <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
          <section className="w-full rounded-3xl border border-white/5 bg-white/5 p-8 shadow-glow backdrop-blur-md sm:p-10">
            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-white p-3 shadow-sm">
              <img src={clubCrest} alt="Escudo del C.D. Caudal" className="h-full w-full object-contain" />
            </div>
            <p className="mt-8 text-xs uppercase tracking-[0.34em] text-slate-400">Entrenador</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">C.D. Caudal de Mieres</h1>
            <p className="mt-3 text-sm text-slate-400">Mieres, Asturias</p>
            {authError ? <p className="mx-auto mt-6 max-w-md text-sm text-red-200">{authError}</p> : null}
            <form onSubmit={handleAuthSubmit} className="mx-auto mt-8 grid max-w-md gap-4 text-left">
              <label className="space-y-2 text-sm text-slate-300">
                <span>Email</span>
                <input
                  required
                  type="email"
                  name="email"
                  value={authForm.email}
                  onChange={handleAuthFormChange}
                  autoComplete="email"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                  placeholder="tu@email.com"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Contraseña</span>
                <input
                  required
                  type="password"
                  name="password"
                  value={authForm.password}
                  onChange={handleAuthFormChange}
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                  placeholder="Tu contraseña"
                />
              </label>
              <button
                type="submit"
                disabled={authLoading || authSubmitting}
                className="mt-2 inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {authSubmitting ? 'Enviando...' : 'Iniciar sesión'}
              </button>
            </form>
            <p className="mx-auto mt-5 max-w-md text-sm text-slate-400">
              Acceso privado para usuarios autorizados del cuerpo técnico.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-caudal-950 via-caudal-900 to-[#05101f] text-slate-100">
      {splashScreen}
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/5 bg-white/5 p-5 shadow-glow backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-slate-400">Entrenador</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">C.D. Caudal de Mieres</h1>
            <p className="mt-1 text-sm text-slate-400">Mieres, Asturias</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
            <div className="flex w-full flex-col gap-3 rounded-2xl border border-white/10 bg-caudal-950/40 p-3 sm:w-auto sm:min-w-72 sm:flex-row sm:items-center sm:justify-end">
              <div className="min-w-0 text-sm text-slate-300 sm:text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Sesión iniciada</p>
                <p className="truncate font-semibold text-white">{authUser.email}</p>
              </div>
              {installPromptEvent && !isAppInstalled ? (
                <button
                  type="button"
                  onClick={handleInstallApp}
                  className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-caudal-electric/50 bg-white/5 px-4 py-2 text-sm font-semibold text-caudal-electric transition hover:bg-white/10"
                >
                  Instalar app
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-caudal-electric px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
              >
                Cerrar sesión
              </button>
            </div>
            <nav className="flex flex-wrap gap-3 sm:justify-end">
              {['Inicio', 'Plantilla', 'Equipos', 'Partidos', 'Biblioteca', 'Rendimiento', 'Análisis Grupal'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab
                      ? 'bg-caudal-electric text-slate-950 shadow-[0_15px_35px_rgba(79,140,255,0.22)]'
                      : 'bg-white/10 text-slate-200 hover:bg-white/15'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
            {authError ? <p className="max-w-sm text-sm text-red-200">{authError}</p> : null}
          </div>
        </header>

        {activeTab === 'Inicio' ? (
          <main className="space-y-5 pb-8">
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111111] shadow-glow">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,0,0,0.24),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_44%)]" />
              <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] bg-white p-3 shadow-[0_20px_50px_rgba(0,0,0,0.35)] sm:mx-0 sm:h-32 sm:w-32">
                  <img src={clubCrest} alt="Escudo del C.D. Caudal" className="h-full w-full object-contain" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-red-200">Cuerpo técnico</p>
                  <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">C.D. Caudal de Mieres</h2>
                  <div className="mt-4 max-w-3xl">
                    {isEditingHomePhrase ? (
                      <div className="space-y-3">
                        <textarea
                          value={homePhraseDraft}
                          onChange={(event) => setHomePhraseDraft(event.target.value)}
                          rows={2}
                          maxLength={180}
                          className="w-full resize-none rounded-2xl border border-white/15 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-red-400"
                        />
                        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                          <button
                            type="button"
                            onClick={handleSaveHomePhrase}
                            disabled={homePhraseSaving}
                            className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {homePhraseSaving ? 'Guardando...' : 'Guardar frase'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHomePhraseDraft(homePhrase);
                              setIsEditingHomePhrase(false);
                              setHomePhraseStatus('');
                            }}
                            className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <p className="text-base font-medium leading-relaxed text-slate-200 sm:text-lg">{homePhrase}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setHomePhraseDraft(homePhrase);
                            setIsEditingHomePhrase(true);
                            setHomePhraseStatus('');
                          }}
                          className="mx-auto inline-flex shrink-0 items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 sm:mx-0"
                        >
                          Editar
                        </button>
                      </div>
                    )}
                    {homePhraseStatus ? <p className="mt-2 text-xs text-slate-300">{homePhraseStatus}</p> : null}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-3xl border border-white/10 bg-black/25 p-3 text-center">
                  <div>
                    <p className="text-2xl font-black text-white">{homeDashboard.playerCount}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Plantilla</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">{homeDashboard.rivalCount}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Rivales</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">{homeDashboard.balance.pointsPerGame}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Pts/part</p>
                  </div>
                </div>
              </div>
            </section>

            {homeLoading ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm text-slate-300">
                Cargando Inicio desde Supabase...
              </div>
            ) : null}
            {homeError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                {homeError}
              </div>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                {
                  tab: 'Plantilla',
                  title: 'Plantilla',
                  copy: `${homeDashboard.playerCount} jugadores`,
                  accent: 'from-red-600/25 to-white/5',
                  icon: (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
                      <path d="M8 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M16.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M3.5 19.5c.55-3.35 2.05-5.25 4.5-5.25s3.95 1.9 4.5 5.25" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                      <path d="M13.5 15c2.65.15 4.4 1.65 5 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                    </svg>
                  ),
                },
                {
                  tab: 'Equipos',
                  title: 'Equipos',
                  copy: `${homeDashboard.rivalCount} rivales`,
                  accent: 'from-yellow-400/20 to-white/5',
                  icon: (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
                      <path d="M12 3.5 19 6v5.2c0 4.15-2.55 7.35-7 9.3-4.45-1.95-7-5.15-7-9.3V6l7-2.5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
                      <path d="M8.5 12h7M12 8.5v7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                    </svg>
                  ),
                },
                {
                  tab: 'Partidos',
                  title: 'Partidos',
                  copy: homeDashboard.nextMatch ? 'Preparar siguiente' : 'Crear calendario',
                  accent: 'from-sky-500/22 to-white/5',
                  icon: (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
                      <path d="M7 4v3M17 4v3M5 8h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                      <path d="M6.5 5.5h11A2.5 2.5 0 0 1 20 8v9.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5V8a2.5 2.5 0 0 1 2.5-2.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8 13h3M8 16h7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                    </svg>
                  ),
                },
                {
                  tab: 'Biblioteca',
                  title: 'Biblioteca',
                  copy: 'Tareas y ABP',
                  accent: 'from-violet-400/18 to-white/5',
                  icon: (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
                      <path d="M5.5 5.5h13v13h-13z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                      <path d="m17.5 4.5 2 2M4.5 17.5l2 2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                    </svg>
                  ),
                },
                {
                  tab: 'Rendimiento',
                  title: 'Rendimiento',
                  copy: 'Wellness y carga',
                  accent: 'from-cyan-400/20 to-white/5',
                  icon: (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
                      <path d="M4 13h4l2-6 4 12 2-6h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      <path d="M5 20h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                    </svg>
                  ),
                },
                {
                  tab: 'Análisis Grupal',
                  title: 'Análisis Grupal',
                  copy: `${homeDashboard.balance.played} partidos analizados`,
                  accent: 'from-emerald-500/20 to-white/5',
                  icon: (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
                      <path d="M5 19V5M5 19h15" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                      <path d="M8.5 15.5v-4M12.5 15.5v-7M16.5 15.5v-10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                      <path d="m8 8.5 3.5 2 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                    </svg>
                  ),
                },
              ].map((item) => (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => setActiveTab(item.tab)}
                  className={`group min-h-32 rounded-3xl border border-white/10 bg-gradient-to-br ${item.accent} p-5 text-left shadow-glow transition duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:shadow-[0_20px_55px_rgba(96,165,250,0.16)] active:translate-y-0`}
                >
                  <span className="inline-flex text-sky-100 drop-shadow-[0_0_18px_rgba(147,197,253,0.35)] transition duration-200 group-hover:scale-105 group-hover:text-white">
                    {item.icon}
                  </span>
                  <p className="mt-5 text-xl font-black text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-300">{item.copy}</p>
                </button>
              ))}
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-glow">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Próximo partido</p>
                    <h3 className="mt-2 text-2xl font-black text-white">
                      {homeDashboard.nextMatch?.opponent || 'Sin partido programado'}
                    </h3>
                  </div>
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white p-2">
                    <img
                      src={homeDashboard.nextMatch?.opponentCrest || homeDashboard.nextOpponentTeam?.crest || clubCrest}
                      alt={homeDashboard.nextMatch?.opponent || 'Escudo rival'}
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-black/25 p-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Fecha</p>
                    <p className="mt-2 text-sm font-bold text-white">{homeDashboard.nextMatch ? matchDisplayDate(homeDashboard.nextMatch.date) : '-'}</p>
                  </div>
                  <div className="rounded-2xl bg-black/25 p-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Hora</p>
                    <p className="mt-2 text-sm font-bold text-white">{homeDashboard.nextMatch?.time || '-'}</p>
                  </div>
                  <div className="rounded-2xl bg-black/25 p-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Condición</p>
                    <p className="mt-2 text-sm font-bold text-white">{homeDashboard.nextMatch ? (homeDashboard.nextMatch.isHome ? 'Local' : 'Visitante') : '-'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('Partidos')}
                  className="mt-5 w-full rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white transition hover:bg-red-500 sm:w-auto"
                >
                  Ir a partidos
                </button>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#091428]/90 p-5 shadow-glow">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Estado semanal</p>
                    <h3 className="mt-2 text-xl font-black text-white">{homeDashboard.tendency}</h3>
                  </div>
                  <span className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-200">
                    Últimos 5
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-red-500/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-red-200">Lesionados</p>
                    <p className="mt-2 text-3xl font-black text-white">{homeDashboard.weeklyStats.injured}</p>
                  </div>
                  <div className="rounded-2xl bg-yellow-300/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-yellow-100">Amonest.</p>
                    <p className="mt-2 text-3xl font-black text-white">{homeDashboard.weeklyStats.yellow}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl bg-black/25 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Últimos resultados</p>
                    <p className="text-xs font-semibold text-slate-300">
                      {homeDashboard.balance.wins}-{homeDashboard.balance.draws}-{homeDashboard.balance.losses}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {homeDashboard.recent.length ? homeDashboard.recent.map((result) => (
                      <span
                        key={`${result.id}-${result.label}`}
                        className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black ${
                          result.label === 'V' ? 'bg-emerald-400 text-slate-950' : result.label === 'D' ? 'bg-red-400 text-slate-950' : 'bg-amber-300 text-slate-950'
                        }`}
                        title={`${result.match.opponent} · ${matchDisplayDate(result.match.date)}`}
                      >
                        {result.label}
                      </span>
                    )) : <span className="text-sm text-slate-500">Sin datos cerrados</span>}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              {[
                ['Goles', `${homeDashboard.balance.goalsFor}-${homeDashboard.balance.goalsAgainst}`],
                ['Porterías a cero', homeDashboard.balance.cleanSheets],
                ['Sub-23', homeDashboard.sub23Count],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-black text-white">{value}</p>
                </div>
              ))}
            </section>
          </main>
        ) : null}

        {activeTab === 'Plantilla' ? (
          <main className="space-y-6">
            {selectedPlayerProfile ? (() => {
              if (playerProfileLoading) {
                return (
                  <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 text-sm text-slate-400 shadow-glow">
                    Cargando ficha del jugador...
                  </section>
                );
              }
              if (playerProfileError) {
                return (
                  <section className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-100 shadow-glow">
                    {playerProfileError}
                  </section>
                );
              }
              const aggregate = getPlayerAggregate(selectedPlayerProfile);
              const quick = aggregate.quick;
              const visibleMatchIds = new Set(aggregate.rows.map((row) => row.match.id));
              const allGoalActions = (playerProfileData?.goalEvents || [])
                .filter((event) => event.scorer === selectedPlayerProfile.name && visibleMatchIds.has(event.partidoId))
                .map((event) => ({ ...event, match: playerProfileData.partidosById[event.partidoId], action: 'Gol' }))
                .filter((event) => event.match);
              const allAssistActions = (playerProfileData?.goalEvents || [])
                .filter((event) => event.assistant === selectedPlayerProfile.name && visibleMatchIds.has(event.partidoId))
                .map((event) => ({ ...event, match: playerProfileData.partidosById[event.partidoId], action: 'Asistencia' }))
                .filter((event) => event.match);
              const influenceActions = playerInfluenceFilter === 'Goles' ? allGoalActions : playerInfluenceFilter === 'Asistencias' ? allAssistActions : [...allGoalActions, ...allAssistActions];
              const shotZoneCounts = countPitchZones(influenceActions.map((event) => event.action === 'Gol' ? event.shotZone : event.assistZone));
              const goalZoneCounts = countValues(allGoalActions.map((event) => event.goalZone));
              const playerGoalPhaseCounts = countPhases(allGoalActions);
              const maxPlayerGoalPhase = Math.max(1, ...playerGoalPhaseCounts.map((row) => row.count));
              const timelineActions = [
                ...allGoalActions.map((event) => ({ minute: event.minute, label: '⚽', type: 'Gol', match: event.match, videoUrl: event.videoUrl, actionKey: `goal-${event.match.id}-${event.id}`, title: `Gol · ${getMatchScoreLabel(event.match)}` })),
                ...allAssistActions.map((event) => ({ minute: event.minute, label: '👟', type: 'Asistencia', match: event.match, videoUrl: event.videoUrl, actionKey: `assist-${event.match.id}-${event.id}`, title: `Asistencia · ${getMatchScoreLabel(event.match)}` })),
                ...quick.events.map((event) => ({ minute: event.minute, label: quickEventLabelByType[event.tipoEvento]?.slice(0, 1) || 'E', type: quickEventLabelByType[event.tipoEvento] || event.tipoEvento, match: event.match, actionKey: `quick-${event.match.id}-${event.id}`, title: `${quickEventLabelByType[event.tipoEvento] || event.tipoEvento} · ${getMatchScoreLabel(event.match)}` })),
                ...aggregate.rows.flatMap((row) => row.cardActions.map((event, cardIndex) => ({ minute: event.minute, label: event.type.includes('roja') ? 'R' : 'A', type: event.type, match: row.match, actionKey: `card-${row.match.id}-${cardIndex}`, title: `${event.type} · ${getMatchScoreLabel(row.match)}` }))),
              ].filter((event) => event.minute !== '');
              const assistantsToPlayer = countValues(allGoalActions.map((event) => event.assistant));
              const assistedByPlayer = countValues(allAssistActions.map((event) => event.scorer));
              const assistantRows = Object.entries(assistantsToPlayer).filter(([name]) => name);
              const assistedRows = Object.entries(assistedByPlayer).filter(([name]) => name);
              const maxSocietyCount = Math.max(1, ...assistantRows.map(([, count]) => count), ...assistedRows.map(([, count]) => count));
              const videoActions = [...allGoalActions, ...allAssistActions].filter((event) => event.videoUrl);
              return (
                <>
                  <section className="rounded-3xl border border-white/5 bg-[#07111f] p-6 shadow-glow">
                    <button onClick={() => setSelectedPlayerProfileId(null)} className="mb-5 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white">Volver a plantilla</button>
                    <div className="grid gap-6 lg:grid-cols-[160px_1fr]">
                      <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-[2rem] border-8 border-white/5 bg-slate-900 text-3xl font-black text-white">
                        {selectedPlayerProfile.image ? <img src={selectedPlayerProfile.image} alt={selectedPlayerProfile.name} className="h-full w-full object-cover" /> : selectedPlayerProfile.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-2xl bg-caudal-electric px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-950">{selectedPlayerProfile.position}</span>
                          <span className="text-sm font-semibold text-slate-400">#{displayDorsal(selectedPlayerProfile.number)}</span>
                          <span className="text-sm font-semibold text-slate-400">{calculateAge(selectedPlayerProfile.dob)} años</span>
                          {playerLabel(selectedPlayerProfile.dob) === 'Sub-23' ? <span className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold uppercase text-caudal-electric">Sub-23</span> : null}
                        </div>
                        <h2 className="mt-4 text-5xl font-black uppercase tracking-tight text-white">{selectedPlayerProfile.name}</h2>
                        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          {[
                            ['Partidos', aggregate.played],
                            ['Titularidades', aggregate.starts],
                            ['Suplencias', aggregate.subs],
                            ['Minutos', `${aggregate.minutes}'`],
                            ['Participación', `${aggregate.participation}%`],
                            ['Goles', aggregate.goals],
                            ['Asistencias', aggregate.assists],
                            ['Amarillas', aggregate.yellow],
                            ['Rojas', aggregate.red],
                            ['Lesiones', aggregate.injured],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
                              <p className="mt-2 text-2xl font-black text-white">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="flex flex-col gap-4 rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {['Todos', 'Liga', 'Copa RFEF', 'Playoff', 'Amistoso'].map((filter) => (
                        <button key={filter} onClick={() => setPlayerCompetitionFilter(filter)} className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${playerCompetitionFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['Todos', 'Local', 'Visitante'].map((filter) => (
                        <button key={filter} onClick={() => setPlayerVenueFilter(filter)} className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${playerVenueFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                      ))}
                      <button onClick={() => generatePlayerReport(selectedPlayerProfile, aggregate)} className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white">Generar reporte</button>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Eventos rápidos del delegado</h3>
                        <p className="mt-2 text-sm text-slate-400">Datos registrados en partido desde móvil y vinculados a este jugador.</p>
                      </div>
                      {quick.alerts.length ? (
                        <div className="flex flex-wrap gap-2">
                          {quick.alerts.map((alert) => (
                            <span key={alert} className="rounded-2xl bg-amber-300/15 px-3 py-2 text-xs font-bold text-amber-100">{alert}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                      {[
                        ['Tiros', quick.shots],
                        ['A puerta', quick.shotsOnTarget],
                        ['% puerta', quick.shotAccuracy],
                        ['Faltas', quick.fouls],
                        ['Recuperaciones', quick.recoveries],
                        ['Pérdidas', quick.losses],
                        ['Balance', quick.recoveryLossBalance],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-3xl border border-white/5 bg-white/5 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
                          <p className="mt-2 text-2xl font-black text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {quick.recent.slice(0, 4).length ? quick.recent.slice(0, 4).map((event) => (
                        <div key={event.id} className="rounded-2xl bg-white/5 p-4 text-sm">
                          <p className="font-black text-white">{event.minute}' · {quickEventLabelByType[event.tipoEvento] || event.tipoEvento}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{event.match.opponent} · {matchDisplayDate(event.match.date)}</p>
                        </div>
                      )) : <p className="rounded-2xl bg-white/5 p-4 text-sm italic text-slate-500">Sin eventos rápidos registrados para este jugador.</p>}
                    </div>
                  </section>

                  <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Análisis de influencia táctica</h3>
                        <div className="flex gap-2">
                          {['Todos', 'Goles', 'Asistencias'].map((filter) => (
                            <button key={filter} onClick={() => setPlayerInfluenceFilter(filter)} className={`rounded-xl px-3 py-2 text-xs font-bold ${playerInfluenceFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-6 grid gap-6 lg:grid-cols-2">
                        {renderReadOnlyZoneGrid({ counts: shotZoneCounts })}
                        <div className="space-y-5">
                          <div className="rounded-3xl border border-caudal-electric/20 bg-[#0f1e38] p-5 text-slate-100">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Análisis ofensivo</p>
                            <div className="mt-4 grid gap-3">
                              {[
                                ['Goles/90', aggregate.goalsPer90, 'text-emerald-300'],
                                ['Asistencias/90', aggregate.assistsPer90, 'text-caudal-electric'],
                                ['Participación directa', aggregate.directGoalParticipation, 'text-white'],
                              ].map(([label, value, color]) => (
                                <div key={label} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
                                  <strong className={`text-xl ${color}`}>{value}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-white">Tipo de gol</p>
                            <div className="mt-4 space-y-3">
                              {playerGoalPhaseCounts.map((row) => (
                                <div key={row.phase}>
                                  <div className="flex justify-between text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                                    <span>{row.phase}</span>
                                    <span>{row.count}</span>
                                  </div>
                                  <div className="mt-2 h-2 rounded-full bg-white/10">
                                    <div className="h-full rounded-full bg-emerald-300" style={{ width: `${(row.count / maxPlayerGoalPhase) * 100}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-white">Diana de finalización</p>
                            <div className="mt-3 max-w-md">{renderReadOnlyZoneGrid({ counts: goalZoneCounts, zones: goalZoneOptions, goal: true })}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Sociedad ofensiva</h3>
                        <div className="mt-5 space-y-6 text-sm text-slate-300">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Principales asistentes</p>
                            {assistantRows.length ? assistantRows.map(([name, count]) => (
                              <div key={name} className="mt-3 rounded-2xl bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate font-bold text-white">{name}</span>
                                  <strong className="text-caudal-electric">{count}</strong>
                                </div>
                                <div className="mt-2 h-2 rounded-full bg-white/10">
                                  <div className="h-full rounded-full bg-caudal-electric" style={{ width: `${(count / maxSocietyCount) * 100}%` }} />
                                </div>
                              </div>
                            )) : <p className="mt-2 italic text-slate-500">Sin datos registrados</p>}
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Asistencias dadas a...</p>
                            {assistedRows.length ? assistedRows.map(([name, count]) => (
                              <div key={name} className="mt-3 rounded-2xl bg-emerald-400/10 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate font-bold text-white">{name}</span>
                                  <strong className="text-emerald-300">{count}</strong>
                                </div>
                                <div className="mt-2 h-2 rounded-full bg-white/10">
                                  <div className="h-full rounded-full bg-emerald-300" style={{ width: `${(count / maxSocietyCount) * 100}%` }} />
                                </div>
                              </div>
                            )) : <p className="mt-2 italic text-slate-500">Sin datos registrados</p>}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Videoteca de acciones</h3>
                        <div className="mt-5 space-y-3">
                          {videoActions.length ? videoActions.map((event) => (
                            <div key={`${event.id}-${event.action}`} className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
                              <p className="font-bold text-white">{event.action} · {event.minute}' vs {event.match.opponent}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{event.match.type}</p>
                              <button type="button" onClick={() => window.open(event.videoUrl, '_blank')} className="mt-3 rounded-xl bg-caudal-electric px-3 py-2 text-xs font-bold text-slate-950">Ver vídeo</button>
                            </div>
                          )) : <p className="text-sm italic text-slate-500">Sin vídeos registrados</p>}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Impacto en el tiempo (0' - 90')</h3>
                    <div className="relative mt-12 h-20 rounded-2xl bg-white/5">
                      <div className="absolute left-4 right-4 top-1/2 h-1 -translate-y-1/2 rounded bg-white/10" />
                      {[0, 15, 30, 45, 60, 75, 90].map((minute) => <span key={minute} className="absolute top-2 text-[10px] font-bold text-slate-500" style={{ left: `${minute / 90 * 100}%` }}>{minute}'</span>)}
                      {timelineActions.map((event, index) => (
                        <button
                          type="button"
                          key={`${event.title}-${index}`}
                          title={event.title}
                          onClick={() =>
                            setSelectedTimelineAction((current) =>
                              current?.actionKey === event.actionKey ? null : event
                            )
                          }
                          className="absolute top-9 -translate-x-1/2 rounded-full bg-caudal-electric px-2 py-1 text-xs font-black text-slate-950 transition hover:bg-white"
                          style={{ left: `${Math.min(100, Number(event.minute) / 90 * 100)}%` }}
                        >
                          {event.label}
                        </button>
                      ))}
                    </div>
                    {selectedTimelineAction ? (
                      <div className="mt-5 rounded-2xl border border-caudal-electric/30 bg-caudal-electric/10 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-caudal-electric">{selectedTimelineAction.type} · minuto {selectedTimelineAction.minute}'</p>
                        <p className="mt-2 text-sm font-bold text-white">{getMatchScoreLabel(selectedTimelineAction.match)}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                          {matchDisplayDate(selectedTimelineAction.match.date)} · {selectedTimelineAction.match.type} · {selectedTimelineAction.match.isHome ? 'Local' : 'Visitante'}
                        </p>
                        {selectedTimelineAction.videoUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(selectedTimelineAction.videoUrl, '_blank')}
                            className="mt-3 rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950"
                          >
                            Ver vídeo
                          </button>
                        ) : (
                          <p className="mt-3 text-xs italic text-slate-500">Sin vídeo registrado en esta acción.</p>
                        )}
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Historial partido a partido</h3>
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          <tr>{['Fecha', 'Rival', 'L/V', 'Competición', 'Rol', 'Min', 'G', 'A', '🟨', '🟥', '🚑'].map((head) => <th key={head} className="px-3 py-3">{head}</th>)}</tr>
                        </thead>
                        <tbody>
                          {aggregate.rows.length ? aggregate.rows.map((row) => (
                            <tr key={row.match.id} className="border-t border-white/10">
                              <td className="px-3 py-4 text-slate-300">{matchDisplayDate(row.match.date)}</td>
                              <td className="px-3 py-4 font-bold text-white">{row.match.opponent}</td>
                              <td className="px-3 py-4 text-slate-300">{row.match.isHome ? 'Local' : 'Visitante'}</td>
                              <td className="px-3 py-4 text-slate-300">{row.match.type}</td>
                              <td className="px-3 py-4 text-caudal-electric">{row.role}</td>
                              <td className="px-3 py-4 text-white">{row.minutes}</td>
                              <td className="px-3 py-4 text-white">{row.goals.length}</td>
                              <td className="px-3 py-4 text-white">{row.assists.length}</td>
                              <td className="px-3 py-4">{row.yellow ? `🟨${row.yellow > 1 ? row.yellow : ''}` : '-'}</td>
                              <td className="px-3 py-4">{row.red ? '🟥' : '-'}</td>
                              <td className="px-3 py-4">{row.injured ? '🚑' : '-'}</td>
                            </tr>
                          )) : <tr><td colSpan="11" className="px-3 py-6 text-center text-slate-500">Sin datos registrados</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {playerReport ? (
                    <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Informe automático</h3>
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {Object.entries(playerReport).map(([title, text]) => (
                          <div key={title} className="rounded-3xl bg-[#0f1e38]/80 p-5">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
                            <p className="mt-3 text-sm leading-7 text-slate-300">{text}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              );
            })() : (
            <>
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Plantilla</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Gestión de jugadores</h2>
                </div>
                <button
                  onClick={() => openForm(null)}
                  className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                >
                  Nuevo jugador
                </button>
              </div>
            </section>

            {loading ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
                Cargando jugadores...
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-red-500/20 bg-red-500/10 px-5 py-6 text-sm text-red-100">
                {error}
              </div>
            ) : empty ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
                No hay jugadores aún
              </div>
            ) : (
            <div className="space-y-6">
              {groupedPlayers.map((group) => (
                <section key={group.title} className="space-y-4">
                  <div className="flex items-end justify-between border-b border-white/10 pb-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Demarcación</p>
                      <h3 className="mt-1 text-xl font-semibold text-white">{group.title}</h3>
                    </div>
                    <span className="rounded-2xl bg-white/10 px-3 py-1 text-sm font-semibold text-slate-200">
                      {group.players.length}
                    </span>
                  </div>

                  {group.players.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.players.map((player) => (
                        <article key={player.id} onClick={() => setSelectedPlayerProfileId(player.id)} className="group cursor-pointer rounded-3xl border border-white/5 bg-[#091428]/80 p-4 shadow-glow transition hover:-translate-y-1 hover:border-caudal-electric/40">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-slate-800 text-lg font-bold text-slate-200">
                      {player.image ? (
                        <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                      ) : (
                        <span>{player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">#{displayDorsal(player.number)}</p>
                      <h3 className="truncate text-lg font-semibold text-white">{player.name}</h3>
                      <p className="text-sm text-slate-400">{player.position}</p>
                      <p className="mt-1 truncate text-xs font-bold uppercase tracking-[0.14em] text-caudal-electric">{player.shirtName || player.name}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>Dorsal</span>
                              <strong className="text-white">{displayDorsal(player.number)}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Pierna</span>
                      <strong className="text-white">{player.foot}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Nombre camiseta</span>
                      <strong className="truncate text-white">{player.shirtName || player.name}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Edad</span>
                      <strong className="text-white">{calculateAge(player.dob)} años</strong>
                    </div>
                    {playerLabel(player.dob) === 'Sub-23' ? (
                      <div className="flex items-center justify-between rounded-2xl bg-[#10254d] px-3 py-2 text-xs uppercase tracking-[0.25em] text-caudal-electric">
                        <span>Sub-23</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        openForm(player);
                      }}
                      className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                    >
                      Editar
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(player);
                      }}
                      className="rounded-2xl bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
                    >
                      Eliminar
                    </button>
                  </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
                      No hay jugadores en este grupo.
                    </div>
                  )}
                </section>
              ))}
            </div>
            )}
            </>
            )}
          </main>
        ) : null}

        {activeTab === 'Equipos' ? (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Equipos</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Rivales de competición</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSaveTeams}
                    className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/25"
                  >
                    Guardar equipos
                  </button>
                  <button
                    onClick={() => openTeamForm(null)}
                    className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                  >
                    Nuevo equipo
                  </button>
                </div>
              </div>
              {saveStatus ? <p className="mt-3 text-sm text-caudal-electric">{saveStatus}</p> : null}
              {teamsLoading ? <p className="mt-3 text-sm text-slate-400">Cargando equipos...</p> : null}
              {teamsError ? <p className="mt-3 text-sm text-red-200">{teamsError}</p> : null}
            </section>

            {selectedTeam ? (
              <section className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    onClick={() => setSelectedTeamId(null)}
                    className="inline-flex w-fit items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    Volver a equipos
                  </button>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => openTeamForm(selectedTeam)}
                      className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                    >
                      Editar equipo
                    </button>
                    <button
                      onClick={arrangeSelectedTeam}
                      className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                    >
                      Colocar por sistema
                    </button>
                    <select
                      value={selectedTeam.system}
                      onChange={(event) => updateSelectedTeamSystem(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
                    >
                      {gameSystems.map((system) => (
                        <option key={system} value={system}>
                          {system}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[0.34fr_0.66fr]">
                  <aside className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 text-sm font-bold text-caudal-950">
                        {selectedTeam.crest ? (
                          <img src={selectedTeam.crest} alt={`Escudo de ${selectedTeam.name}`} className="h-full w-full object-contain" />
                        ) : (
                          <span>{selectedTeam.name.split(' ').map((part) => part[0]).join('').slice(0, 3)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Alineación</p>
                        <h3 className="truncate text-lg font-semibold text-white">{selectedTeam.name}</h3>
                      </div>
                    </div>

                    <div className="mt-5 space-y-5">
                      {dedupeRivalPlayers(selectedTeam.squad).length > 0 ? (
                        ['Titular', 'Reserva'].map((role) => (
                          <div key={role} className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{role === 'Titular' ? 'Titulares' : 'Reservas'}</p>
                            {dedupeRivalPlayers(selectedTeam.squad)
                              .filter((player) => player.role === role)
                              .map((player) => (
                                <div
                                  key={player.jugadorRivalId || player.id || normalizePlayerIdentityName(player.name)}
                                  draggable
                                  onDragStart={() => setDraggedPlayer(player)}
                                  onClick={() => openTeamForm(selectedTeam)}
                                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/20 ${
                                    player.isKey ? 'border border-amber-300/80 bg-amber-300/10' : 'bg-white/10'
                                  }`}
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-800 text-xs font-bold">
                                    {player.image ? (
                                      <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                                    ) : (
                                      player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)
                                    )}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1">
                                      <span className="block truncate">{displayPlayerName(player)}</span>
                                      {playerStatusBadges(player).map((badge) => (
                                        <span key={badge.title} title={badge.title} className={`inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[10px] font-bold ${badge.className}`}>
                                          {badge.label}
                                        </span>
                                      ))}
                                    </span>
                                    {getPlayerMeta(player) ? <span className="block truncate text-xs text-slate-400">{getPlayerMeta(player)}</span> : null}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedTeamPlayerRole(player.name, role === 'Titular' ? 'Reserva' : 'Titular');
                                    }}
                                    className="rounded-xl bg-caudal-950/80 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-caudal-900"
                                  >
                                    {role === 'Titular' ? 'A reserva' : 'Hacer titular'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openTeamForm(selectedTeam);
                                    }}
                                    className="rounded-xl bg-white/10 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-white/20"
                                  >
                                    Editar
                                  </button>
                                </div>
                              ))}
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
                          Añade jugadores en la ficha del equipo.
                        </p>
                      )}
                    </div>
                  </aside>

                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropOnField}
                    className="relative mx-auto aspect-[7/8.9] max-h-[760px] min-h-[620px] w-full max-w-[800px] overflow-hidden rounded-3xl border border-caudal-electric/25 bg-[radial-gradient(circle_at_center,rgba(79,140,255,0.22),transparent_34%),linear-gradient(180deg,rgba(8,32,75,0.96),rgba(5,18,46,0.98))] shadow-glow"
                  >
                    <div className="absolute inset-4 rounded-[28px] border-2 border-white/40" />
                    <div className="absolute left-4 right-4 top-1/2 h-px bg-white/35" />
                    <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
                    <div className="absolute left-1/2 top-4 h-24 w-56 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/35" />
                    <div className="absolute bottom-4 left-1/2 h-24 w-56 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/35" />
                    {getFormationCoordinates(selectedTeam.system).map((slot, slotIndex) => {
                      const slotPlayer = getLineupSlotMap(selectedTeam.lineup ?? emptyLineup).get(slotIndex);
                      return (
                        <div
                          key={`${selectedTeam.system}-${slotIndex}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.stopPropagation();
                            handleDropOnLineupSlot(slotIndex);
                          }}
                          className={`absolute flex h-16 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border text-xs font-semibold ${
                            slotPlayer
                              ? 'border-transparent text-transparent'
                              : 'border-dashed border-white/35 bg-white/10 text-white/80'
                          }`}
                          style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                        >
                          {slotPlayer ? '' : slotIndex + 1}
                        </div>
                      );
                    })}
                    {(selectedTeam.lineup ?? emptyLineup).map((player) => (
                      <button
                        key={player.name}
                        draggable
                        onDragStart={() => setDraggedPlayer(player)}
                        onDoubleClick={() => removeFromLineup(player.name)}
                        onClick={() => toggleSelectedTeamKeyPlayer(player.name)}
                        className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
                        style={{ left: `${player.x}%`, top: `${player.y}%` }}
                        title="Arrastra para mover. Clic marca destacado. Doble clic quita del campo."
                      >
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            removeFromLineup(player.name);
                          }}
                          className="absolute right-2 top-2 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/80 text-[9px] font-bold text-white opacity-70 shadow transition hover:opacity-100"
                          title="Quitar del once"
                        >
                          X
                        </span>
                        <span
                          className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-2 bg-caudal-950/70 shadow-glow ${
                            player.isKey ? 'border-amber-300' : 'border-caudal-electric/60'
                          }`}
                        >
                          {player.number ? (
                            <span className="absolute left-1 top-1 z-10 rounded-md bg-caudal-electric px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-950">
                              {player.number}
                            </span>
                          ) : null}
                          {playerStatusBadges(player).length ? (
                            <span className="absolute right-0 top-0 z-10 flex max-w-16 flex-wrap justify-end gap-0.5 p-0.5">
                              {playerStatusBadges(player).map((badge) => (
                                <span key={badge.title} title={badge.title} className={`inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[9px] font-black leading-none ${badge.className}`}>
                                  {badge.label}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {player.image ? (
                            <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                          ) : (
                            player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)
                          )}
                        </span>
                        <span className="mt-1 flex max-w-24 items-center gap-1 text-xs font-semibold leading-tight text-white drop-shadow">
                          <span className="truncate">{displayPlayerName(player)}</span>
                          {playerStatusBadges(player).map((badge) => (
                            <span key={badge.title} title={badge.title} className={`inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[10px] font-bold ${badge.className}`}>
                              {badge.label}
                            </span>
                          ))}
                        </span>
                        <div
                          className="absolute top-full mt-1 flex w-24 flex-col gap-1"
                        >
                          {[0, 1].map((benchSlotIndex) => {
                            const benchPlayer = getBenchForStarter(player, selectedTeam.benchChart)[benchSlotIndex];
                            return (
                              <span
                                key={`${player.name}-bench-${benchSlotIndex}`}
                                draggable={Boolean(benchPlayer)}
                                onDragStart={(event) => {
                                  if (!benchPlayer) return;
                                  event.stopPropagation();
                                  setDraggedPlayer(benchPlayer);
                                }}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.stopPropagation();
                                  handleDropOnBenchSlot(player.name, benchSlotIndex);
                                }}
                                onDoubleClick={(event) => {
                                  event.stopPropagation();
                                  clearBenchSlot(player.name, benchSlotIndex);
                                }}
                                className={`relative block min-h-4 max-w-24 truncate rounded-lg px-2 py-0.5 pr-4 text-[11px] leading-tight drop-shadow ${
                                  benchPlayer ? 'bg-caudal-950/70 text-slate-200' : 'border border-dashed border-white/25 text-white/45'
                                }`}
                                title={benchPlayer ? getPlayerMeta(benchPlayer) : 'Arrastra un reserva aquí'}
                              >
                                {benchPlayer ? (
                                  <span className="flex items-center gap-1">
                                    <span className="truncate">{displayPlayerName(benchPlayer)}</span>
                                    {playerStatusBadges(benchPlayer).map((badge) => (
                                      <span key={badge.title} title={badge.title} className={`inline-flex h-3 min-w-3 items-center justify-center rounded-sm px-0.5 text-[9px] font-bold ${badge.className}`}>
                                        {badge.label}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  `Reserva ${benchSlotIndex + 1}`
                                )}
                                {benchPlayer ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      clearBenchSlot(player.name, benchSlotIndex);
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-300 hover:text-red-100"
                                    title="Quitar reserva"
                                  >
                                    X
                                  </button>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            ) : teams.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {teams.map((team) => (
                  <article
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className="group relative min-h-72 cursor-pointer overflow-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-8 text-center shadow-glow transition hover:-translate-y-1 hover:border-caudal-electric/40"
                  >
                    <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white/10 p-2 ring-8 ring-white/5">
                      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-white p-3 text-lg font-bold text-caudal-950">
                        {team.crest ? (
                          <img src={team.crest} alt={`Escudo de ${team.name}`} className="h-full w-full object-contain" />
                        ) : (
                          <span>{team.name.split(' ').map((part) => part[0]).join('').slice(0, 3)}</span>
                        )}
                      </div>
                    </div>
                    <h3 className="mt-7 truncate text-xl font-black uppercase text-white">{cleanTeamDisplayName(team.name)}</h3>
                    <p className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">{team.stadium || 'Estadio sin definir'}</p>
                    <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-caudal-electric">Sistema: {team.system}</p>
                    <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundColor: team.kitColor ?? '#ef233c' }} />

                    <div className="mt-8 flex justify-center gap-3 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openTeamForm(team);
                        }}
                        className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                      >
                        Editar
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleTeamDelete(team);
                        }}
                        className="rounded-2xl bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
                      >
                        Eliminar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-sm text-slate-400">
                Todavía no hay equipos cargados.
              </section>
            )}
          </main>
        ) : null}

        {activeTab === 'Biblioteca' ? (
          <LibrarySection players={players} />
        ) : null}

        {activeTab === 'Rendimiento' ? (
          <main>{renderPerformanceSection()}</main>
        ) : null}

        {activeTab === 'Análisis Grupal' ? (() => {
          const groupData = getGroupAnalysisData();
          const scopedMatches = groupData.scoped;
          const hasData = groupData.played > 0;
          const minuteFor = groupEventsByMinuteRange(groupData.goalForEvents);
          const minuteAgainst = groupEventsByMinuteRange(groupData.goalAgainstEvents);
          const maxMinuteGoals = Math.max(1, ...minuteFor.map((row) => row.count), ...minuteAgainst.map((row) => row.count));
          const phaseFor = countPhases(groupData.goalForEvents);
          const phaseAgainst = countPhases(groupData.goalAgainstEvents);
          const assistZoneCounts = countPitchZones(filterAssistEventsByGroupMode(groupData.goalForEvents).map((event) => event.assistZone));
          const shotSourceEvents = groupShotFilter === 'Goles a favor'
            ? groupData.goalForEvents
            : groupShotFilter === 'Goles en contra'
              ? groupData.goalAgainstEvents
              : [...groupData.goalForEvents, ...groupData.goalAgainstEvents];
          const shotZoneCounts = countPitchZones(shotSourceEvents.map((event) => event.shotZone));
          const abpFor = getSetPieceSummary(groupData.goalForEvents);
          const abpAgainst = getSetPieceSummary(groupData.goalAgainstEvents);
          const localSummary = summarizeGroupMatches(scopedMatches.filter((match) => match.isHome));
          const awaySummary = summarizeGroupMatches(scopedMatches.filter((match) => !match.isHome));
          const trend = getGroupTendency(scopedMatches);
          const rankings = getGroupRankings(scopedMatches);
          const subphaseForRows = getGroupSubphaseRanking(groupData.goalForEvents);
          const subphaseAgainstRows = getGroupSubphaseRanking(groupData.goalAgainstEvents);
          const goalZoneForCounts = getGroupGoalZoneCounts(groupData.goalForEvents);
          const goalZoneAgainstCounts = getGroupGoalZoneCounts(groupData.goalAgainstEvents);
          const quickSummary = groupData.quickSummary || getQuickEventSummary([]);
          const quickMinuteRanges = getQuickEventsByMinuteRange(groupData.quickEvents || []);
          const maxQuickRange = Math.max(1, ...quickMinuteRanges.flatMap((row) => [row.caudal, row.rival]));
          const quickEvolution = scopedMatches.map((match) => ({
            match,
            summary: getQuickEventSummary(match.quickEvents || []),
          }));
          const automaticAlerts = getGroupAlerts(groupData, rankings, localSummary, awaySummary);
          const automaticReadings = getGroupAutomaticReadings(groupData);
          const resultDonut = `conic-gradient(#34d399 0 ${groupData.played ? (groupData.wins / groupData.played) * 100 : 0}%, #facc15 ${groupData.played ? (groupData.wins / groupData.played) * 100 : 0}% ${groupData.played ? ((groupData.wins + groupData.draws) / groupData.played) * 100 : 0}%, #f87171 ${groupData.played ? ((groupData.wins + groupData.draws) / groupData.played) * 100 : 0}% 100%)`;
          const abpReading = (forGoals, againstGoals) => {
            if (!forGoals && !againstGoals) return 'neutro';
            if (forGoals >= againstGoals + 2) return 'fuerte';
            if (againstGoals >= forGoals + 2) return 'vulnerable';
            return 'neutro';
          };
          const abpGlobalReading = abpReading(abpFor.total, abpAgainst.total);
          const rankingList = (rows, valueKey, empty = 'sin datos suficientes') => (
            rows.length ? rows.map((row) => (
              <div key={row.player.name} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
                <span className="truncate text-sm font-bold text-white">{row.player.name}</span>
                <strong className="text-caudal-electric">
                  {row[valueKey]}{valueKey === 'minutes' ? ` · ${row.minutePct}%` : ''}
                </strong>
              </div>
            )) : <p className="rounded-2xl bg-white/5 p-4 text-sm italic text-slate-500">{empty}</p>
          );

          return (
            <main className="space-y-6">
              {groupLoading ? (
                <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 text-sm text-slate-400 shadow-glow">
                  Cargando análisis grupal...
                </section>
              ) : null}
              {groupError ? (
                <section className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-100 shadow-glow">
                  {groupError}
                </section>
              ) : null}
              <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#091428]/90 shadow-glow backdrop-blur-md">
                <div className="grid gap-0 xl:grid-cols-[0.9fr_1.35fr]">
                  <div className="border-b border-white/10 p-6 xl:border-b-0 xl:border-r">
                    <p className="text-xs font-black uppercase tracking-[0.34em] text-caudal-electric">Análisis grupal</p>
                    <h2 className="mt-3 max-w-md text-3xl font-black uppercase leading-tight text-white sm:text-4xl">
                      Métricas colectivas del equipo
                    </h2>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Filtro actual</p>
                        <p className="mt-1 text-sm font-bold text-white">{hasData ? `${groupData.played} partidos` : 'Sin datos'}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Competición</p>
                        <p className="mt-1 text-sm font-bold text-white">{groupCompetitionFilter}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Contexto</p>
                        <p className="mt-1 text-sm font-bold text-white">{groupContextFilter}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 p-6">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Competición</p>
                        <span className="hidden h-px flex-1 bg-white/10 sm:block" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Todos', 'Liga', 'Copa', 'Amistoso'].map((filter) => (
                          <button
                            key={filter}
                            type="button"
                            onClick={() => setGroupCompetitionFilter(filter)}
                            className={`rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition ${
                              groupCompetitionFilter === filter
                                ? 'bg-caudal-electric text-slate-950 shadow-[0_0_26px_rgba(79,140,255,0.28)]'
                                : 'bg-white/8 text-slate-300 ring-1 ring-white/10 hover:bg-white/15 hover:text-white'
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Vista del rendimiento</p>
                        <span className="hidden h-px flex-1 bg-white/10 sm:block" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Todos', 'Local', 'Visitante', 'Últimos 5 partidos', 'Victorias', 'Empates', 'Derrotas'].map((filter) => (
                          <button
                            key={filter}
                            type="button"
                            onClick={() => setGroupContextFilter(filter)}
                            className={`rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition ${
                              groupContextFilter === filter
                                ? 'bg-emerald-300 text-slate-950 shadow-[0_0_26px_rgba(110,231,183,0.25)]'
                                : 'bg-white/8 text-slate-300 ring-1 ring-white/10 hover:bg-white/15 hover:text-white'
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Resumen competitivo</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    ['Partidos jugados', groupData.played],
                    ['Victorias', groupData.wins],
                    ['Empates', groupData.draws],
                    ['Derrotas', groupData.losses],
                    ['Goles a favor', groupData.goalsFor],
                    ['Goles en contra', groupData.goalsAgainst],
                    ['Diferencia goles', groupData.goalDiff],
                    ['Puntos/partido', groupData.pointsPerGame],
                    ['Porterías a cero', groupData.cleanSheets],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-3xl border border-white/5 bg-white/5 p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
                      <p className="mt-3 text-3xl font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Eventos rápidos del Modo Delegado</h3>
                    <p className="mt-2 text-sm text-slate-400">Agregado desde `match_quick_events`: acciones a favor, en contra, eficacia y tramos.</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 px-4 py-3 text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Balance rec/pérd</p>
                    <p className={`mt-1 text-2xl font-black ${quickSummary.recoveryLossBalance >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{quickSummary.recoveryLossBalance}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  {[
                    ['Tiros', `${quickSummary.shots} - ${quickSummary.rivalShots}`],
                    ['Tiros puerta', `${quickSummary.shotsOnTarget} - ${quickSummary.rivalShotsOnTarget}`],
                    ['Córners', `${quickSummary.corners} - ${quickSummary.rivalCorners}`],
                    ['Faltas', `${quickSummary.fouls} - ${quickSummary.rivalFouls}`],
                    ['Eficacia tiro', quickSummary.shotAccuracy],
                    ['Peligro concedido', quickSummary.concededDanger],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-3xl border border-white/5 bg-white/5 p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
                      <p className="mt-3 text-3xl font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.15fr]">
                  <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                    <h4 className="text-xs font-black uppercase tracking-[0.18em] text-white">Tramos de partido</h4>
                    <div className="mt-6 grid h-52 grid-cols-6 items-end gap-2 border-b border-white/10 pb-3">
                      {quickMinuteRanges.map((row) => (
                        <div key={row.range} className="flex h-full flex-col items-center justify-end gap-2">
                          <div className="flex h-40 w-full items-end justify-center gap-1">
                            <div className="w-4 rounded-t-lg bg-caudal-electric" style={{ height: `${(row.caudal / maxQuickRange) * 100}%` }} title={`Caudal: ${row.caudal}`} />
                            <div className="w-4 rounded-t-lg bg-red-400" style={{ height: `${(row.rival / maxQuickRange) * 100}%` }} title={`Rival: ${row.rival}`} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500">{row.range}'</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex gap-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      <span className="text-caudal-electric">Caudal</span>
                      <span className="text-red-300">Rival</span>
                    </div>
                  </div>
                  <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                    <h4 className="text-xs font-black uppercase tracking-[0.18em] text-white">Evolución por partido</h4>
                    <div className="mt-4 space-y-3">
                      {quickEvolution.length ? quickEvolution.slice(-6).reverse().map(({ match, summary }) => (
                        <div key={match.id} className="rounded-2xl bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-white">{match.opponent}</p>
                              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{matchDisplayDate(match.date)} · {match.isHome ? 'Local' : 'Visitante'}</p>
                            </div>
                            <p className="text-sm font-black text-caudal-electric">T {summary.shots}-{summary.rivalShots}</p>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                            <span className="rounded-xl bg-white/5 px-2 py-2 text-slate-300">Puerta {summary.shotsOnTarget}-{summary.rivalShotsOnTarget}</span>
                            <span className="rounded-xl bg-white/5 px-2 py-2 text-slate-300">Córners {summary.corners}-{summary.rivalCorners}</span>
                            <span className={`rounded-xl px-2 py-2 ${summary.recoveryLossBalance >= 0 ? 'bg-emerald-400/10 text-emerald-200' : 'bg-red-400/10 text-red-200'}`}>Rec/Pér {summary.recoveryLossBalance}</span>
                          </div>
                        </div>
                      )) : <p className="rounded-2xl bg-white/5 p-4 text-sm italic text-slate-500">Sin eventos rápidos registrados.</p>}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Lecturas automáticas</h3>
                    <p className="mt-2 text-sm text-slate-400">Interpretación rápida basada en partidos, goles, estadísticas y eventos del Modo Delegado.</p>
                  </div>
                  <span className="rounded-2xl bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    Máx. 8 lecturas
                  </span>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {automaticReadings.map((reading, index) => (
                    <div key={`${reading}-${index}`} className="rounded-3xl border border-caudal-electric/15 bg-caudal-electric/10 p-4 text-sm font-semibold leading-6 text-white">
                      {reading}
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[0.85fr_1.4fr]">
                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Distribución de resultados</h3>
                  <div className="mx-auto mt-8 flex h-48 w-48 items-center justify-center rounded-full" style={{ background: resultDonut }}>
                    <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#091428] text-sm font-black uppercase text-slate-300">
                      {hasData ? `${groupData.played} PJ` : 'sin datos'}
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                    {[
                      ['Victorias', groupData.wins, 'text-emerald-300'],
                      ['Empates', groupData.draws, 'text-amber-300'],
                      ['Derrotas', groupData.losses, 'text-red-300'],
                    ].map(([label, value, color]) => (
                      <div key={label} className="rounded-2xl bg-white/5 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
                        <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Goles por tramos</h3>
                    <div className="flex gap-4 text-xs font-bold uppercase text-slate-400">
                      <span className="text-caudal-electric">Favor</span>
                      <span className="text-red-300">Contra</span>
                    </div>
                  </div>
                  <div className="mt-8 grid h-72 grid-cols-6 items-end gap-3 border-b border-white/10 pb-4">
                    {minuteFor.map((row, index) => (
                      <div key={row.range} className="flex h-full flex-col items-center justify-end gap-2">
                        <div className="flex h-56 w-full items-end justify-center gap-1">
                          <div className="w-5 rounded-t-lg bg-caudal-electric" style={{ height: `${(row.count / maxMinuteGoals) * 100}%` }} title={`Favor: ${row.count}`} />
                          <div className="w-5 rounded-t-lg bg-red-400" style={{ height: `${(minuteAgainst[index].count / maxMinuteGoals) * 100}%` }} title={`Contra: ${minuteAgainst[index].count}`} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{row.range}'</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                {[
                  ['Cómo marcamos', phaseFor, 'bg-caudal-electric'],
                  ['Cómo encajamos', phaseAgainst, 'bg-red-400'],
                ].map(([title, rows, colorClass]) => {
                  const maxPhase = Math.max(1, ...rows.map((row) => row.count));
                  return (
                    <div key={title} className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">{title}</h3>
                      <div className="mt-6 space-y-4">
                        {rows.map((row) => (
                          <div key={row.phase}>
                            <div className="flex justify-between text-xs font-bold uppercase text-slate-400">
                              <span>{row.phase}</span>
                              <span>{row.count}</span>
                            </div>
                            <div className="mt-2 h-3 rounded-full bg-white/10">
                              <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${(row.count / maxPhase) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Origen de asistencias</h3>
                    <div className="flex flex-wrap gap-2">
                      {['Todas', 'Juego', 'Transición', 'ABP'].map((filter) => (
                        <button key={filter} onClick={() => setGroupAssistFilter(filter)} className={`rounded-xl px-3 py-2 text-xs font-bold uppercase ${groupAssistFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5">{renderReadOnlyZoneGrid({ counts: assistZoneCounts })}</div>
                </div>

                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Zonas de remate / finalización</h3>
                    <div className="flex flex-wrap gap-2">
                      {['Goles a favor', 'Goles en contra', 'Ambos'].map((filter) => (
                        <button key={filter} onClick={() => setGroupShotFilter(filter)} className={`rounded-xl px-3 py-2 text-xs font-bold uppercase ${groupShotFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5">{renderReadOnlyZoneGrid({ counts: shotZoneCounts })}</div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Subfases más repetidas</h3>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {[
                      ['A favor', subphaseForRows, 'text-caudal-electric'],
                      ['En contra', subphaseAgainstRows, 'text-red-300'],
                    ].map(([title, rows, color]) => (
                      <div key={title}>
                        <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{title}</p>
                        {rows.length ? rows.map(([subphase, count]) => (
                          <div key={subphase} className="mb-2 flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
                            <span className="truncate text-sm font-bold text-white">{subphase}</span>
                            <strong className={color}>{count}</strong>
                          </div>
                        )) : <p className="rounded-2xl bg-white/5 p-4 text-sm italic text-slate-500">sin datos suficientes</p>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Portería 3x3</h3>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Goles marcados</p>
                      {renderReadOnlyZoneGrid({ counts: goalZoneForCounts, zones: goalZoneOptions, goal: true })}
                    </div>
                    <div>
                      <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Goles encajados</p>
                      {renderReadOnlyZoneGrid({ counts: goalZoneAgainstCounts, zones: goalZoneOptions, goal: true })}
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                {[
                  ['ABP ofensiva', abpFor, 'Eficacia ABP', abpFor.total ? `${Math.round((abpFor.total / Math.max(1, groupData.goalsFor)) * 100)}%` : 'sin datos', groupData.goalsFor, 'bg-caudal-electric', 'text-caudal-electric'],
                  ['ABP defensiva', abpAgainst, 'Vulnerabilidad ABP', abpAgainst.total ? `${Math.round((abpAgainst.total / Math.max(1, groupData.goalsAgainst)) * 100)}%` : 'sin datos', groupData.goalsAgainst, 'bg-red-400', 'text-red-300'],
                ].map(([title, summary, metric, value, totalGoals, barClass, textClass]) => {
                  const rows = [
                    ['Córner', summary.corner],
                    ['Falta directa', summary.directFreeKick],
                    ['Falta con remate', summary.freeKickHeader],
                    ['Penalti', summary.penalty],
                    ['Segunda jugada', summary.secondBall],
                  ];
                  const maxAbp = Math.max(1, ...rows.map(([, count]) => count));
                  const share = Math.round((summary.total / Math.max(1, totalGoals)) * 100);

                  return (
                  <div key={title} className="overflow-hidden rounded-3xl border border-white/5 bg-[#091428]/80 shadow-glow">
                    <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">{title}</h3>
                        <p className="mt-2 text-sm text-slate-400">{metric}</p>
                      </div>
                      <div className="text-right">
                        <span className={`rounded-2xl px-3 py-2 text-xs font-black uppercase ${abpGlobalReading === 'fuerte' ? 'bg-emerald-400/15 text-emerald-300' : abpGlobalReading === 'vulnerable' ? 'bg-red-400/15 text-red-300' : 'bg-white/10 text-slate-300'}`}>
                          {abpGlobalReading}
                        </span>
                        <p className={`mt-3 text-4xl font-black ${textClass}`}>{summary.total}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">goles ABP</p>
                      </div>
                    </div>

                    <div className="grid gap-6 p-6 lg:grid-cols-[1fr_160px]">
                      <div className="space-y-4">
                        {rows.map(([label, count]) => (
                          <div key={label}>
                            <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.12em]">
                              <span className="text-slate-400">{label}</span>
                              <span className="text-white">{count}</span>
                            </div>
                            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
                              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${(count / maxAbp) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-col items-center justify-center rounded-3xl bg-white/5 p-4">
                        <div className="relative flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `conic-gradient(${title === 'ABP ofensiva' ? '#4f8cff' : '#f87171'} 0 ${share}%, rgba(255,255,255,0.1) ${share}% 100%)` }}>
                          <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-[#091428]">
                            <span className="text-2xl font-black text-white">{value}</span>
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">del total</span>
                          </div>
                        </div>
                        <p className="mt-4 text-center text-xs font-bold leading-5 text-slate-400">
                          {summary.total ? `${summary.total} de ${Math.max(1, totalGoals)} goles` : 'Sin acciones registradas'}
                        </p>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Local vs visitante</h3>
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        <tr>{['Contexto', 'PJ', 'V', 'E', 'D', 'GF', 'GC', 'PPG', 'PC'].map((head) => <th key={head} className="px-3 py-3">{head}</th>)}</tr>
                      </thead>
                      <tbody>
                        {[
                          ['Local', localSummary],
                          ['Visitante', awaySummary],
                        ].map(([label, row]) => (
                          <tr key={label} className="border-t border-white/10">
                            <td className="px-3 py-4 font-bold text-white">{label}</td>
                            <td className="px-3 py-4 text-slate-300">{row.played}</td>
                            <td className="px-3 py-4 text-emerald-300">{row.wins}</td>
                            <td className="px-3 py-4 text-amber-300">{row.draws}</td>
                            <td className="px-3 py-4 text-red-300">{row.losses}</td>
                            <td className="px-3 py-4 text-white">{row.goalsFor}</td>
                            <td className="px-3 py-4 text-white">{row.goalsAgainst}</td>
                            <td className="px-3 py-4 text-caudal-electric">{row.pointsPerGame}</td>
                            <td className="px-3 py-4 text-white">{row.cleanSheets}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Tendencia últimos partidos</h3>
                  <div className="mt-5 space-y-3">
                    {trend.length ? trend.map((row) => (
                      <div key={row.match.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-white/5 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">{row.match.opponent}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{matchDisplayDate(row.match.date)} · {row.match.type} · {row.match.isHome ? 'Local' : 'Visitante'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black text-white">{row.goalsFor}-{row.goalsAgainst}</p>
                          <p className="text-xs text-slate-400">{row.cleanSheet ? 'Portería a cero' : 'Encajado'} · {row.cards} tarjetas</p>
                        </div>
                      </div>
                    )) : <p className="rounded-2xl bg-white/5 p-4 text-sm italic text-slate-500">sin datos suficientes</p>}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Ranking individual</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Máximos goleadores</p>
                    {rankingList(rankings.scorers, 'goals')}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Máximos asistentes</p>
                    {rankingList(rankings.assistants, 'assists')}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Más amonestados</p>
                    {rankingList(rankings.booked, 'cards')}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Más lesiones</p>
                    {rankingList(rankings.injured, 'injured')}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Más minutos</p>
                    {rankingList(rankings.minutes, 'minutes')}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Participaciones de gol</p>
                    {rankingList(rankings.participations, 'goalParticipation')}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Once ideal</h3>
                    <p className="mt-2 text-sm text-slate-500">Calculado por minutos, titularidades, goles, asistencias y valoración registrada.</p>
                  </div>
                  <select value={idealSystem} onChange={(event) => setIdealSystem(event.target.value)} className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-black text-slate-950">
                    {['4-4-2', '4-2-3-1', '4-3-3', '5-3-2'].map((system) => <option key={system}>{system}</option>)}
                  </select>
                </div>
                <div className="mt-6">
                  {rankings.idealRows.length ? renderIdealElevenPitch(buildIdealElevenForSystem(rankings.idealRows, idealSystem)) : <p className="rounded-2xl bg-white/5 p-6 text-center text-sm italic text-slate-500">sin datos suficientes</p>}
                </div>
              </section>

              <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Alertas automáticas</h3>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {automaticAlerts.map((alert) => (
                    <div key={alert} className="rounded-3xl border border-caudal-electric/15 bg-caudal-electric/10 p-4 text-sm font-bold text-white">
                      {alert}
                    </div>
                  ))}
                </div>
              </section>
            </main>
          );
        })() : null}

        {activeTab === 'Partidos' ? (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Partidos</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Calendario y análisis</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleSaveMatches} className="rounded-2xl bg-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/25">
                    Guardar partidos
                  </button>
                  <button onClick={() => openMatchForm(null)} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]">
                    Nuevo partido
                  </button>
                </div>
              </div>
              {saveStatus ? <p className="mt-3 text-sm text-caudal-electric">{saveStatus}</p> : null}
            </section>

            {matchView === 'lista_partidos' ? (
              <>
                <div className="flex flex-wrap gap-3">
              {matchFilters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setMatchFilter(filter)}
                  className={`rounded-2xl px-5 py-2 text-sm font-semibold uppercase tracking-[0.12em] transition ${
                    matchFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <button onClick={() => openMatchForm(null)} className="min-h-40 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-left transition hover:border-caudal-electric/60">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-caudal-electric/15 text-3xl text-caudal-electric">+</span>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Nuevo partido</p>
              </button>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Partidos totales</p>
                <p className="mt-4 text-4xl font-semibold text-white">{matchStats.total}</p>
                {matchFilter === 'Todos' ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs uppercase text-slate-400">
                    {matchTypes.map((type) => (
                      <div key={type} className="rounded-xl bg-white/5 px-2 py-1">
                        <span className="block truncate">{type}</span>
                        <strong className="text-white">{matches.filter((match) => match.type === type).length}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-caudal-electric">{matchFilter}</p>
                )}
              </div>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Efectividad</p>
                <p className="mt-4 text-3xl font-semibold text-emerald-400">{matchStats.wins} Victorias</p>
                <div className="mt-4 h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${matchStats.finished ? (matchStats.wins / matchStats.finished) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Balance de goles</p>
                <p className="mt-4 text-3xl font-semibold text-white">{matchStats.goalsFor} - {matchStats.goalsAgainst}</p>
                <p className="mt-2 text-xs uppercase text-slate-500">Favor / Contra</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Forma reciente</p>
                <div className="mt-5 flex gap-2">
                  {(matchStats.recent.length ? matchStats.recent : ['-', '-', '-']).map((result, index) => (
                    <span key={`${result}-${index}`} className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/60 text-sm font-bold text-emerald-300">{result}</span>
                  ))}
                </div>
                <p className="mt-5 text-xs uppercase text-slate-500">Porterías a cero: {matchStats.cleanSheets}</p>
              </div>
            </div>

            <section className="space-y-4">
              <h3 className="border-l-4 border-caudal-electric pl-3 text-sm font-bold uppercase tracking-[0.25em] text-white">Calendario general</h3>
              {filteredMatches.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredMatches.map((match) => {
                    const activeSection = matchSections[match.id] ?? 'PRE';
                    const caudalIsHome = match.isHome;
                    const statsEvents = match.statsGoalEvents || [];
                    const statsCaudalGoals = statsEvents.filter((event) => event.type === 'Gol a favor').length;
                    const statsRivalGoals = statsEvents.filter((event) => event.type === 'Gol en contra').length;
                    const hasStatsScore = statsEvents.length > 0;
                    const cardHomeScore = hasStatsScore ? (match.isHome ? statsCaudalGoals : statsRivalGoals) : match.homeScore || 0;
                    const cardAwayScore = hasStatsScore ? (match.isHome ? statsRivalGoals : statsCaudalGoals) : match.awayScore || 0;
                    const played = hasStatsScore || match.status === 'Finalizado';
                    const caudalResultGoals = hasStatsScore ? statsCaudalGoals : Number(match.goalsFor || (match.isHome ? match.homeScore : match.awayScore) || 0);
                    const rivalResultGoals = hasStatsScore ? statsRivalGoals : Number(match.goalsAgainst || (match.isHome ? match.awayScore : match.homeScore) || 0);
                    const resultStripeClass = !played
                      ? 'bg-slate-400'
                      : caudalResultGoals > rivalResultGoals
                        ? 'bg-emerald-400'
                        : caudalResultGoals < rivalResultGoals
                          ? 'bg-red-500'
                          : 'bg-amber-300';
                    const cardPlayerRows = Object.entries(match.statsPlayerData || {})
                      .filter(([, stats]) => stats.yellow || stats.red || stats.injured)
                      .map(([name, stats]) => ({ name, stats }));
                    return (
                      <article key={match.id} className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#091428]/80 shadow-glow">
                        <div className={`h-2 w-full ${resultStripeClass}`} />
                        <div className="absolute right-4 top-4 z-10 flex gap-2">
                          <button onClick={() => openMatchForm(match)} className="rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">Editar</button>
                          <button onClick={() => handleMatchDelete(match)} className="rounded-xl bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/25">Eliminar</button>
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-5">
                          <div className="text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2">
                              <img src={caudalIsHome ? clubCrest : match.opponentCrest || clubCrest} alt="" className="h-full w-full object-contain" />
                            </div>
                            <p className="mt-2 text-sm font-bold text-white">{caudalIsHome ? 'C.D. Caudal' : match.opponent}</p>
                          </div>
                          <div className="text-center">
                            <p className="rounded-xl bg-caudal-950 px-3 py-1 text-xs text-slate-400">{matchDisplayDate(match.date)}</p>
                            <p className="mt-3 text-4xl font-bold text-white">{played ? `${cardHomeScore} - ${cardAwayScore}` : 'vs'}</p>
                            <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{match.type} {match.round}</p>
                            {match.stadium ? <p className="mt-1 text-xs font-semibold text-slate-400">{match.stadium}</p> : null}
                            {hasStatsScore || cardPlayerRows.length ? (
                              <div className="mt-2 text-xs leading-5 text-slate-400">
                                {statsEvents.filter((event) => event.type === 'Gol a favor').map((event) => (
                                  <p key={event.id}>⚽ {event.scorer || 'Caudal'} {event.minute}'{event.assistant ? ` · 👟 ${event.assistant}` : ''}</p>
                                ))}
                                {statsEvents.filter((event) => event.type === 'Gol en contra').map((event) => (
                                  <p key={event.id}>⚽ {match.opponent || 'Rival'} {event.minute}'</p>
                                ))}
                                {cardPlayerRows.map(({ name, stats }) => (
                                  <p key={name}>{name} {stats.yellow ? '🟨' : ''}{stats.red ? ' 🟥' : ''}{stats.injured ? ' 🚑' : ''}</p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 p-2 text-lg font-bold text-white">
                              {caudalIsHome ? (match.opponentCrest ? <img src={match.opponentCrest} alt="" className="h-full w-full object-contain" /> : match.opponent.slice(0, 2).toUpperCase()) : <img src={clubCrest} alt="" className="h-full w-full object-contain" />}
                            </div>
                            <p className="mt-2 text-sm font-bold text-white">{caudalIsHome ? match.opponent : 'C.D. Caudal'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 border-t border-white/10">
                          {['PRE', 'ESTADÍSTICAS', 'POST', 'IMPRESIÓN'].map((section) => (
                            <button
                              key={section}
                              onClick={() => {
                                setMatchSections((prev) => ({ ...prev, [match.id]: section }));
                                openMatchPage(match, section);
                              }}
                              className={`px-3 py-3 text-xs font-bold uppercase tracking-[0.12em] ${activeSection === section ? 'bg-caudal-electric text-slate-950' : 'bg-white/[0.03] text-slate-500 hover:text-white'}`}>
                              {section}
                            </button>
                          ))}
                        </div>
                        <div className="p-3 text-sm text-slate-300"></div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-sm text-slate-400">No hay partidos en este filtro.</div>
              )}
            </section>
              </>
            ) : selectedMatch ? (
              <section className="space-y-6">
                <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <button
                        onClick={closeMatchPage}
                        disabled={statsRefreshing}
                        className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {statsRefreshing ? 'Actualizando...' : '← Volver a partidos'}
                      </button>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{matchView === 'pre_partido' ? 'Pre partido' : matchView === 'estadisticas_partido' ? 'Estadísticas' : matchView === 'impresion_partido' ? 'Impresión' : 'Post partido'}</p>
                      <h2 className="mt-2 text-3xl font-semibold text-white">{matchView === 'pre_partido' ? 'PRE partido' : matchView === 'estadisticas_partido' ? 'Estadísticas del partido' : matchView === 'impresion_partido' ? 'IMPRESIÓN' : 'POST partido'}</h2>
                      <p className="mt-2 text-sm text-slate-400">{matchDisplayDate(selectedMatch.date)} · {selectedMatch.type} · {selectedMatch.round}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl bg-[#091428]/90 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Rival</p>
                        <p className="mt-3 text-xl font-semibold text-white">{selectedMatch.opponent || 'Sin rival'}</p>
                        {selectedMatch.stadium ? <p className="mt-2 text-sm text-slate-400">Estadio: {selectedMatch.stadium}</p> : null}
                      </div>
                      <div className="rounded-3xl bg-[#091428]/90 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Resultado</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{selectedMatch.status === 'Finalizado' ? `${selectedMatch.homeScore || 0} - ${selectedMatch.awayScore || 0}` : 'Pendiente'}</p>
                        <p className="mt-2 text-sm uppercase tracking-[0.2em] text-slate-400">{selectedMatch.status}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {['PRE', 'ESTADÍSTICAS', 'POST', 'IMPRESIÓN'].map((section) => (
                      <button
                        key={section}
                        onClick={() => openMatchPage(selectedMatch, section)}
                        className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] ${matchViewSection === section ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}>
                        {section}
                      </button>
                    ))}
                  </div>
                </div>

                {matchView === 'pre_partido' ? (
                  <section className="space-y-6">
                    {preLoading ? (
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 text-sm text-slate-400 shadow-glow">
                        Cargando PRE desde Supabase...
                      </div>
                    ) : null}
                    {preError ? (
                      <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-100 shadow-glow">
                        {preError}
                      </div>
                    ) : null}
                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">PRE partido</p>
                          <h3 className="mt-2 text-2xl font-semibold text-white">Preparación táctica</h3>
                          <p className="mt-2 text-sm text-slate-400">Gestiona el informe rival y los sistemas enfrentados.</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {['Informe rival', 'Sistemas enfrentados'].map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setPreSubTab(tab)}
                              className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] ${preSubTab === tab ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}>
                              {tab}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {preSubTab === 'Informe rival' ? (
                      <div className="space-y-6">
                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                            <label className="space-y-2 text-sm text-slate-300">
                              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Enlace del informe Canva</span>
                              <input
                                type="url"
                                value={selectedMatch.preCanvaLink || ''}
                                onChange={(event) => updateSelectedMatchFields({ preCanvaLink: event.target.value })}
                                placeholder="https://www.canva.com/..."
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                              />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!getCanvaEmbedUrl(selectedMatch.preCanvaLink)}
                                onClick={() => setIsCanvaPreviewOpen(true)}
                                className="h-fit rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff] disabled:cursor-not-allowed disabled:bg-slate-600/40"
                              >
                                Ampliar informe
                              </button>
                              <button
                                type="button"
                                disabled={!selectedMatch.preCanvaLink}
                                onClick={() => window.open(selectedMatch.preCanvaLink, '_blank', 'noopener,noreferrer')}
                                className="h-fit rounded-2xl bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:bg-slate-600/40 disabled:text-slate-400"
                              >
                                Abrir enlace
                              </button>
                            </div>
                          </div>
                          {selectedMatch.preCanvaLink ? (
                            getCanvaEmbedUrl(selectedMatch.preCanvaLink) ? (
                              <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0f1e38]/80">
                                <iframe
                                  title="Informe Canva"
                                  src={getCanvaEmbedUrl(selectedMatch.preCanvaLink)}
                                  className="h-[70vh] min-h-[520px] w-full"
                                  allowFullScreen
                                />
                              </div>
                            ) : (
                              <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm text-slate-400">
                                Este enlace no parece ser de Canva. Usa un enlace de Canva para verlo dentro de la app.
                              </div>
                            )
                          ) : (
                            <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm text-slate-400">
                              Pega un enlace de Canva para visualizar el informe aquí.
                            </div>
                          )}
                        </div>

                      </div>
                    ) : (
                      <SystemsFacingErrorBoundary resetKey={`${selectedMatch?.id || 'sin-partido'}-${preSubTab}`}>
                      <div className="space-y-6">
                        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                          <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                            <div className="mb-5">
                              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Pizarra táctica</h4>
                              <p className="mt-2 text-sm text-slate-400">Un único campo con Caudal y rival enfrentados. Si hay alineaciones, aparecen los nombres; si no, los roles.</p>
                            </div>
                            {renderFacingSystemsOverview()}
                          </div>

                          <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                            <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Pregunta táctica a la IA</h4>
                            <div className="mt-5 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1">
                              {['Macro', 'Micro'].map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setTacticalQuestionMode(mode)}
                                  className={`rounded-xl px-4 py-2 text-sm font-bold ${tacticalQuestionMode === mode ? 'bg-caudal-electric text-slate-950' : 'text-slate-300'}`}
                                >
                                  {mode === 'Macro' ? 'Macro: estructuras' : 'Micro: jugadores/duelos'}
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={tacticalQuestionText}
                              onChange={(event) => setTacticalQuestionText(event.target.value)}
                              placeholder="Pregunta libre sobre cómo atacar, defender, ajustar o vigilar duelos..."
                              className="mt-4 min-h-[120px] w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                            />
                            <div className="mt-4 flex flex-wrap gap-2">
                              {[
                                '¿Cómo atacamos su bloque?',
                                '¿Dónde tenemos superioridad?',
                                '¿Qué riesgos tenemos tras pérdida?',
                                '¿Qué jugador rival debemos vigilar?',
                                '¿Qué ajuste harías si no progresamos?',
                                '¿Cómo defender sus transiciones?',
                              ].map((question) => (
                                <button
                                  key={question}
                                  type="button"
                                  onClick={() => setTacticalQuestionText(question)}
                                  className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/15"
                                >
                                  {question}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={askTacticalQuestion}
                              className="mt-4 w-full rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 hover:bg-[#7aacff]"
                            >
                              Preguntar
                            </button>
                            {selectedPreAiAnalysis?.tacticalQuestion?.answer ? (
                              <div className="mt-5 rounded-3xl border border-caudal-electric/20 bg-caudal-electric/10 p-5">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">{selectedPreAiAnalysis.tacticalQuestion.mode || 'Macro'} · respuesta guardada</p>
                                <p className="mt-3 text-sm leading-7 text-slate-100">{selectedPreAiAnalysis.tacticalQuestion.answer}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateSelectedMatchFields({ preAiSupportNotes: selectedPreAiAnalysis.tacticalQuestion.answer })}
                                    className="rounded-2xl bg-caudal-electric/20 px-3 py-2 text-xs font-bold text-caudal-electric hover:bg-caudal-electric/30"
                                  >
                                    Guardar como nota PRE
                                  </button>
                                  {[
                                    ['Copiar a plan con balón', 'planConBalon'],
                                    ['Copiar a plan sin balón', 'planSinBalon'],
                                    ['Copiar a transiciones', 'planTransiciones'],
                                  ].map(([label, field]) => (
                                    <button
                                      key={field}
                                      type="button"
                                      onClick={() => updateSelectedMatchFields({ [field]: selectedPreAiAnalysis.tacticalQuestion.answer })}
                                      className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {false ? (
                        <>
                        <div className="hidden">
                        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                          <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                            <div className="mb-5">
                              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Visualización táctica</h4>
                              <p className="mt-2 text-sm text-slate-400">Ambos dibujos enfrentados en el mismo campo para ver alturas, emparejamientos y espacios.</p>
                            </div>
                            {renderFacingSystemsOverview()}
                          </div>
                          <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Lectura táctica automática</h4>
                                <p className="mt-2 text-sm text-slate-400">Reglas simples según sistemas. Puedes ajustar el plan en las notas manuales.</p>
                              </div>
                            </div>
                            <div className="mt-5 grid gap-3">
                              {[
                                ['Ventajas para Caudal', selectedMatch.preSystemReading?.advantages, 'text-emerald-300'],
                                ['Riesgos para Caudal', selectedMatch.preSystemReading?.risks, 'text-red-300'],
                                ['Zonas a atacar', selectedMatch.preSystemReading?.attackZones, 'text-caudal-electric'],
                                ['Zonas a proteger', selectedMatch.preSystemReading?.protectZones, 'text-amber-200'],
                                ['Ajustes recomendados', selectedMatch.preSystemReading?.adjustments, 'text-white'],
                              ].map(([title, items, color]) => (
                                <div key={title} className="rounded-2xl bg-white/5 p-4">
                                  <p className={`text-xs font-black uppercase tracking-[0.16em] ${color}`}>{title}</p>
                                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                                    {(items?.length ? items : ['Pulsa "Generar lectura" para crear una propuesta.']).map((item) => (
                                      <li key={item}>• {item}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Matchups clave</h4>
                              <p className="mt-2 text-sm text-slate-400">Duelos y acciones concretas para trasladar la lectura al partido.</p>
                            </div>
                            <button type="button" onClick={addSystemMatchup} className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white hover:bg-white/15">
                              Añadir matchup
                            </button>
                          </div>
                          <div className="space-y-3">
                            {(selectedMatch.preKeyMatchupsTable?.length ? selectedMatch.preKeyMatchupsTable : defaultSystemMatchups(selectedMatch.preCaudalSystem || '4-4-2', getCurrentRivalSystem())).map((row, index) => (
                              <div key={`matchup-${index}`} className="grid gap-3 rounded-3xl bg-white/5 p-4 lg:grid-cols-[0.7fr_1fr_1.2fr_1.2fr_auto]">
                                {[
                                  ['Zona', 'zone'],
                                  ['Duelo', 'duel'],
                                  ['Lectura', 'reading'],
                                  ['Acción recomendada', 'action'],
                                ].map(([label, field]) => (
                                  <label key={field} className="space-y-1 text-xs text-slate-400">
                                    <span className="uppercase tracking-[0.14em] text-slate-500">{label}</span>
                                    <textarea
                                      rows={2}
                                      value={row[field] || ''}
                                      onChange={(event) => updateSystemMatchup(index, field, event.target.value)}
                                      className="min-h-[64px] w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                                    />
                                  </label>
                                ))}
                                <button type="button" onClick={() => removeSystemMatchup(index)} className="h-fit self-end rounded-2xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-100 hover:bg-red-500/25">
                                  Borrar
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                          {[
                            ['Qué queremos provocar', 'prePlanTrigger', 'Ej. saltos del lateral rival, pase interior forzado, juego directo incómodo...'],
                            ['Qué queremos evitar', 'prePlanAvoid', 'Ej. pérdidas interiores, centros laterales sin presión, transiciones tras córner...'],
                            ['Ajuste si no funciona', 'prePlanAdjustment', 'Ej. pasar a bloque medio, liberar mediapunta, cambiar orientación antes...'],
                          ].map(([label, field, placeholder]) => (
                            <label key={field} className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 text-sm text-slate-300 shadow-glow">
                              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
                              <textarea
                                value={selectedMatch[field] || ''}
                                onChange={(event) => updateSelectedMatchFields({ [field]: event.target.value })}
                                placeholder={placeholder}
                                className="mt-3 min-h-[130px] w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                              />
                            </label>
                          ))}
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="mb-5">
                            <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Cuestionario para análisis IA</h4>
                            <p className="mt-2 text-sm text-slate-400">Marca rápido lo que ves en el Canva. La IA usará este checklist y la información adicional como apoyo.</p>
                          </div>
                          <div className="space-y-3">
                            {[
                              {
                                id: 'rivalProfile',
                                title: '1. Identidad táctica del rival',
                                description: 'Modelo general, salida y ritmo de partido.',
                                fields: [
                                  { label: 'Cómo juega', field: 'preRivalStyle', type: 'chips', options: ['Directo', 'Combinativo', 'Mixto', 'Ataque rápido', 'Posicional', 'Mucho ABP'], multiple: true },
                                  { label: 'Salida rival', field: 'preRivalBuildUp', type: 'chips', options: ['Combinativo', 'Directo', 'Mixto'] },
                                  { label: 'Transiciones', field: 'preRivalTransitions', type: 'chips', options: ['Directas', 'Equilibradas', 'Pausadas'] },
                                  { label: 'Sistema con balón si cambia', field: 'preRivalBaseSystem', placeholder: 'Ej. 3-2-5, lateral dentro, doble pivote...' },
                                ],
                              },
                              {
                                id: 'rivalAttack',
                                title: '2. Rival con balón',
                                description: 'Cómo progresa y dónde hace daño.',
                                fields: [
                                  { label: 'Inicia juego', field: 'preRivalStartPlay', type: 'chips', options: ['Portero corto', 'Portero largo', 'Centrales abiertos', 'Pivote baja', 'Lateral alto', 'Busca punta'], multiple: true },
                                  { label: 'Progresa', field: 'preRivalProgression', type: 'chips', options: ['Por dentro', 'Por fuera', 'Lado débil', 'Tercer hombre', 'Balón directo', 'Conducciones'], multiple: true },
                                  { label: 'Finaliza', field: 'preRivalFinishing', type: 'chips', options: ['Centros', 'Pase atrás', 'Tiro frontal', 'Ruptura espalda', 'Segundo palo', 'ABP'], multiple: true },
                                  { label: 'Zonas de peligro', field: 'preRivalDangerZones', type: 'chips', options: ['Banda izquierda', 'Banda derecha', 'Intervalo lateral-central', 'Entre líneas', 'Frontal', 'Área pequeña'], multiple: true },
                                  { label: 'Jugadores clave ofensivos', field: 'preRivalOffensiveKeyPlayers', placeholder: 'Nombres y amenaza principal...', wide: true },
                                ],
                              },
                              {
                                id: 'rivalDefense',
                                title: '3. Rival sin balón',
                                description: 'Bloque, presión, espacios que concede y puntos fuertes/débiles.',
                                fields: [
                                  { label: 'Bloque defensivo', field: 'preRivalDefensiveBlock', type: 'chips', options: ['Alto', 'Medio', 'Bajo'] },
                                  { label: 'Presión', field: 'preRivalPressure', type: 'chips', options: ['Alta', 'Media', 'Baja'] },
                                  { label: 'Tipo de presión', field: 'preRivalPressureType', type: 'chips', options: ['Hombre a hombre', 'Orientada a banda', 'Sobre pivote', 'Salta central', 'Repliega', 'Tras pérdida'], multiple: true },
                                  { label: 'Deja espacios', field: 'preRivalSpacesAllowed', type: 'chips', options: ['Espalda lateral', 'Entre líneas', 'Lado débil', 'Frontal', 'Espalda centrales', 'Segundo palo'], multiple: true },
                                  { label: 'Defiende centros', field: 'preRivalDefendsCrosses', type: 'chips', options: ['Zona', 'Hombre', 'Sufre segundo palo', 'Sufre rechace', 'Defiende área fuerte'], multiple: true },
                                  { label: 'Defiende espalda', field: 'preRivalDefendsBack', type: 'chips', options: ['Línea alta', 'Línea baja', 'Centrales lentos', 'Buenas coberturas', 'Sufre rupturas'], multiple: true },
                                  { label: 'Fortalezas', field: 'preRivalStrengths', placeholder: 'Qué hace muy bien...', wide: true },
                                  { label: 'Debilidades', field: 'preRivalWeaknesses', placeholder: 'Dónde sufre más...', wide: true },
                                ],
                              },
                              {
                                id: 'transitionsSetPieces',
                                title: '4. Transiciones y ABP',
                                description: 'Dos apartados rápidos para no dejar lo importante fuera.',
                                fields: [
                                  { label: 'Tras pérdida rival', field: 'preRivalAfterLoss', type: 'chips', options: ['Presiona', 'Repliega', 'Falta táctica', 'Queda partido', 'Salta desordenado'], multiple: true },
                                  { label: 'Tras robo rival', field: 'preRivalAfterRecovery', type: 'chips', options: ['Primer pase vertical', 'Busca punta', 'Corre bandas', 'Temporiza', 'Ataca espalda'], multiple: true },
                                  { label: 'Nuestro tras pérdida', field: 'preCaudalAfterLoss', type: 'chips', options: ['Presión inmediata', 'Cerrar dentro', 'Temporizar', 'Falta táctica', 'Replegar bloque medio'], multiple: true },
                                  { label: 'Nuestro tras robo', field: 'preCaudalAfterRecovery', type: 'chips', options: ['Primer pase vertical', 'Atacar espalda', 'Cambiar orientación', 'Asegurar posesión', 'Buscar delantero'], multiple: true },
                                  { label: 'ABP rival', field: 'preRivalCornersFor', type: 'chips', options: ['Córner cerrado', 'Córner abierto', 'Bloqueos', 'Primer palo', 'Segundo palo', 'Rechace frontal'], multiple: true },
                                  { label: 'ABP a atacar', field: 'preRivalCornersAgainst', type: 'chips', options: ['Sufre zona', 'Sufre hombre', 'Deja rechace', 'Mal segundo palo', 'Portero no sale'], multiple: true },
                                ],
                              },
                              {
                                id: 'caudalPlan',
                                title: '5. Plan rápido Caudal',
                                description: 'Qué queremos hacer y qué debemos evitar.',
                                fields: [
                                  { label: 'Intención', field: 'preCaudalIntent', type: 'chips', options: ['Presionar alto', 'Bloque medio', 'Atacar espalda', 'Dominar balón', 'Ser directo', 'Proteger área'], multiple: true },
                                  { label: 'Iniciar', field: 'preCaudalStartPlay', type: 'chips', options: ['Salida corta', 'Salida de tres', 'Atraer y saltar', 'Jugar directo', 'Buscar segunda jugada'], multiple: true },
                                  { label: 'Progresar', field: 'preCaudalProgressionPlan', type: 'chips', options: ['Por dentro', 'Por fuera', 'Lado débil', 'Tercer hombre', 'Cambio orientación'], multiple: true },
                                  { label: 'Atacar', field: 'preCaudalAttackZones', type: 'chips', options: ['Espalda lateral', 'Intervalo central-lateral', 'Entre líneas', 'Frontal', 'Segundo palo', 'Centros laterales'], multiple: true },
                                  { label: 'Presionar', field: 'preCaudalPressPlan', type: 'chips', options: ['Central', 'Lateral', 'Pivote', 'Pase atrás', 'Saque de banda', 'Tras control malo'], multiple: true },
                                  { label: 'Evitar', field: 'preCaudalAvoid', type: 'chips', options: ['Pérdidas interiores', 'Faltas laterales', 'Partido ida y vuelta', 'Centros sin área', 'Saltar sin cobertura'], multiple: true },
                                  { label: 'Jugadores a activar', field: 'preCaudalPlayersToActivate', placeholder: 'Nombres propios si los hay...' },
                                  { label: 'Rivales a tapar', field: 'preCaudalRivalsToBlock', placeholder: 'Nombres propios si los hay...' },
                                ],
                              },
                              {
                                id: 'extraInfo',
                                title: '6. Información adicional para IA',
                                description: 'Notas grupales o individuales que no encajan en el checklist.',
                                fields: [
                                  { label: 'Jugador nuestro a potenciar', field: 'preCaudalPlayerToBoost', placeholder: 'Nombre, zona y por qué...' },
                                  { label: 'Jugador rival a vigilar', field: 'preRivalPlayerToWatch', placeholder: 'Nombre, amenaza y cómo reducirle...' },
                                  { label: 'Duelos importantes', field: 'preImportantDuels', placeholder: 'Duelos físicos, velocidad, juego aéreo, segunda jugada...', wide: true },
                                  { label: 'Información adicional grupal o individual', field: 'preAiSupportNotes', placeholder: 'Ej. nuestro lateral llega tocado, su extremo no defiende, queremos proteger a un juvenil, el campo está pesado...', wide: true },
                                ],
                              },
                            ].map(renderQuestionnaireSection)}
                          </div>
                        </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Sistemas sobre campo</h4>
                              <p className="mt-2 text-sm text-slate-400">Pincha un puesto del Caudal y asigna un jugador de la plantilla.</p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={loadSuggestedCaudalLineup}
                                className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-white/15"
                              >
                                Once Caudal
                              </button>
                              <button
                                type="button"
                                onClick={() => clearCaudalLineupSlot(selectedTacticalPlayerIndex)}
                                className="rounded-2xl bg-red-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-100 hover:bg-red-500/25"
                              >
                                Limpiar Caudal
                              </button>
                              <button
                                type="button"
                                onClick={loadSuggestedRivalLineup}
                                className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-white/15"
                              >
                                Once rival
                              </button>
                              <button
                                type="button"
                                onClick={() => clearRivalLineupSlot(selectedRivalTacticalPlayerIndex)}
                                className="rounded-2xl bg-red-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-100 hover:bg-red-500/25"
                              >
                                Limpiar rival
                              </button>
                            </div>
                          </div>
                          <div className="grid min-w-0 gap-5 2xl:grid-cols-[240px_minmax(0,1fr)_240px]">
                            <div className="min-w-0 rounded-3xl bg-[#0f1e38]/80 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Plantilla Caudal</p>
                              <p className="mt-2 text-sm text-slate-400">
                                Puesto seleccionado: <span className="font-semibold text-white">{getFormationRoles(selectedMatch.preCaudalSystem || '4-4-2')[selectedTacticalPlayerIndex]}</span>
                              </p>
                              <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                                {players.map((player) => {
                                  const isAssigned = selectedMatch.preCaudalLineup?.includes(player.name);
                                  const isCurrent = getSelectedLineupName() === player.name;
                                  return (
                                    <button
                                      key={player.id}
                                      type="button"
                                      onClick={() => updateCaudalLineupSlot(selectedTacticalPlayerIndex, player.name)}
                                      className={`w-full min-w-0 rounded-2xl px-3 py-3 text-left text-sm transition ${isCurrent ? 'bg-caudal-electric text-slate-950' : isAssigned ? 'bg-white/10 text-slate-300' : 'bg-white/5 text-white hover:bg-white/10'}`}
                                    >
                                      <span className="block truncate font-semibold">{player.name}</span>
                                      <span className={`mt-1 block text-xs ${isCurrent ? 'text-slate-800' : 'text-slate-500'}`}>
                                        {[player.position, player.foot].filter(Boolean).join(' · ')}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            {renderSystemsPitch()}
                            <div className="min-w-0 rounded-3xl bg-[#0f1e38]/80 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Plantilla rival</p>
                              <p className="mt-2 text-sm text-slate-400">
                                Puesto seleccionado: <span className="font-semibold text-white">{getFormationRoles(getCurrentRivalSystem())[selectedRivalTacticalPlayerIndex]}</span>
                              </p>
                              <div className="mt-4 grid gap-2">
                                <input
                                  value={newRivalManualPlayerName}
                                  onChange={(event) => setNewRivalManualPlayerName(event.target.value)}
                                  placeholder="Jugador manual"
                                  className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                />
                                <button
                                  type="button"
                                  onClick={addManualRivalPlayer}
                                  className="w-full rounded-2xl bg-rose-300 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-rose-950"
                                >
                                  Añadir
                                </button>
                              </div>
                              <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                                {getRivalAvailablePlayers().length ? (
                                  getRivalAvailablePlayers().map((player) => {
                                    const isAssigned = selectedMatch.preRivalLineup?.includes(player.name);
                                    const isCurrent = getSelectedRivalLineupName() === player.name;
                                    return (
                                      <button
                                        key={player.name}
                                        type="button"
                                        onClick={() => updateRivalLineupSlot(selectedRivalTacticalPlayerIndex, player.name)}
                                        className={`w-full min-w-0 rounded-2xl px-3 py-3 text-left text-sm transition ${isCurrent ? 'bg-rose-300 text-rose-950' : isAssigned ? 'bg-white/10 text-slate-300' : 'bg-white/5 text-white hover:bg-white/10'}`}
                                      >
                                        <span className="block truncate font-semibold">{player.name}</span>
                                        <span className={`mt-1 block text-xs ${isCurrent ? 'text-rose-900' : 'text-slate-500'}`}>
                                          {[player.position, player.foot].filter(Boolean).join(' · ') || 'Sin perfil'}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
                                    Vincula el partido a un equipo rival o añade jugadores manuales.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-[#0f1e38]/80">
                            <div className="border-b border-white/10 px-5 py-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-white">Aportaciones individuales seleccionadas</p>
                              <p className="mt-1 text-sm text-slate-400">Compara al jugador del Caudal con su rival directo y separa acciones ofensivas y defensivas.</p>
                            </div>
                            <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)]">
                              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                              <label className="space-y-2 text-sm text-slate-300">
                                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Nota jugador Caudal</span>
                                <textarea
                                  value={(selectedMatch.prePlayerNotes || {})[getSelectedLineupName()] || ''}
                                  onChange={(event) => updateSelectedPlayerNote(event.target.value)}
                                  disabled={!getSelectedLineupName()}
                                  placeholder="Ej. llega justo físicamente, atacar su banda, buen golpeo, ayudar al lateral..."
                                  className="min-h-[150px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </label>
                              <label className="space-y-2 text-sm text-slate-300">
                                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Característica rival</span>
                                <textarea
                                  value={(selectedMatch.preRivalPlayerNotes || {})[getSelectedRivalLineupName()] || ''}
                                  onChange={(event) => updateSelectedRivalPlayerNote(event.target.value)}
                                  disabled={!getSelectedRivalLineupName()}
                                  placeholder="Ej. muy rápido al espacio, zurdo cerrado, sufre defendiendo centros..."
                                  className="min-h-[150px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </label>
                              </div>
                              <div className="min-w-0 rounded-3xl bg-[#091428]/70 p-4">
                            {selectedPreAiAnalysis?.individualByPlayer?.[selectedTacticalPlayerIndex] ? (
                              (() => {
                                const playerAdvice = selectedPreAiAnalysis.individualByPlayer[selectedTacticalPlayerIndex];
                                const tacticalAdvice = getIndividualAdviceForRender(playerAdvice);
                                return (
                                  <div>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <h5 className="text-xl font-black text-white">{playerAdvice.playerName}</h5>
                                        <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-caudal-electric">{playerAdvice.role}</p>
                                      </div>
                                      {getSelectedRivalLineupName() ? (
                                        <div className="rounded-2xl bg-rose-300/10 px-4 py-3 text-right">
                                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Rival seleccionado</p>
                                          <p className="mt-1 text-sm font-bold text-white">{getSelectedRivalLineupName()}</p>
                                        </div>
                                      ) : (
                                        <div className="rounded-2xl bg-white/5 px-4 py-3 text-right">
                                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Sin marca específica</p>
                                          <p className="mt-1 text-sm font-bold text-slate-300">Rol + sistema rival</p>
                                        </div>
                                      )}
                                    </div>
                                    {renderIndividualTacticalAdvice(tacticalAdvice)}
                                  </div>
                                );
                              })()
                            ) : (
                              <p className="mt-3 text-sm text-slate-400">Pulsa "Analizar sistemas" y después selecciona un jugador del Caudal en el campo.</p>
                            )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Análisis táctico IA</h4>
                              <p className="mt-2 text-sm text-slate-400">El sistema compara las dos formaciones previstas y muestra los puntos clave.</p>
                            </div>
                            <button
                              type="button"
                              onClick={runAiAnalysis}
                              className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                            >
                              Analizar sistemas
                            </button>
                          </div>
                          {(() => {
                            const inputSummary = {
                              tags: [],
                              filledInputs: [],
                              rivalPlayersWithNotes: [],
                              missingInputs: [],
                              confidence: 'Baja',
                              ...safeObject(selectedPreAiAnalysis?.inputSummary || getAiInputSummary()),
                            };
                            inputSummary.tags = safeArray(inputSummary.tags);
                            inputSummary.filledInputs = safeArray(inputSummary.filledInputs);
                            inputSummary.rivalPlayersWithNotes = safeArray(inputSummary.rivalPlayersWithNotes);
                            inputSummary.missingInputs = safeArray(inputSummary.missingInputs);
                            const confidenceClass = inputSummary.confidence === 'Alta'
                              ? 'bg-emerald-400/15 text-emerald-300'
                              : inputSummary.confidence === 'Media'
                                ? 'bg-amber-300/15 text-amber-200'
                                : 'bg-rose-400/15 text-rose-200';

                            return (
                              <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-[#0f1e38]/80">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                                  <div>
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-white">Datos usados por la IA</p>
                                    <p className="mt-1 text-sm text-slate-400">Esto es lo que entra al análisis cuando pulsas el botón.</p>
                                  </div>
                                  <span className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.16em] ${confidenceClass}`}>
                                    Confianza {inputSummary.confidence}
                                  </span>
                                </div>
                                <div className="grid gap-4 p-5 xl:grid-cols-[1fr_0.75fr]">
                                  <div>
                                    <div className="flex flex-wrap gap-2">
                                      {inputSummary.tags.map((tag) => (
                                        <span key={tag} className="rounded-full bg-caudal-electric/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-caudal-electric">
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                                      {inputSummary.filledInputs.slice(0, 10).map(([label, value]) => (
                                        <div key={label} className="rounded-2xl bg-white/5 p-3">
                                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
                                          <p className="mt-1 line-clamp-2 text-sm font-semibold text-white">{value}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="rounded-2xl bg-white/5 p-4">
                                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Rivales con características</p>
                                      {inputSummary.rivalPlayersWithNotes.length ? (
                                        <div className="mt-3 space-y-2">
                                          {inputSummary.rivalPlayersWithNotes.slice(0, 5).map(([name, note]) => (
                                            <p key={name} className="text-sm text-slate-300"><span className="font-bold text-white">{name}:</span> {note}</p>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="mt-2 text-sm text-slate-400">Aún no hay características individuales del rival.</p>
                                      )}
                                    </div>
                                    {inputSummary.missingInputs.length ? (
                                      <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">Para hacerlo más real</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          {inputSummary.missingInputs.map(([label]) => (
                                            <span key={label} className="rounded-full bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-100">{label}</span>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                          {selectedPreAiAnalysis ? (
                            <div className="mt-6 space-y-4">
                              <div className="grid gap-4">
                                {getTacticalBlocksForRender(selectedPreAiAnalysis).map((block) => renderTacticalBlock({
                                  ...block,
                                  sourceTags: block.sourceTags || safeArray(selectedPreAiAnalysis.inputSummary?.tags).slice(0, 4),
                                }))}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm text-slate-400">Pulsa "Analizar sistemas" para obtener una previsión automática.</div>
                          )}
                        </div>
                        </>
                        ) : null}
                      </div>
                      </SystemsFacingErrorBoundary>
                    )}
                  </section>
                ) : matchView === 'estadisticas_partido' ? (
                  <section className="space-y-6">
                    {statsError ? (
                      <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-100 shadow-glow">
                        {statsError}
                      </div>
                    ) : null}
                    {statsRefreshing ? (
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 text-sm text-slate-400 shadow-glow">
                        Actualizando estadísticas desde Supabase...
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2 rounded-3xl border border-white/5 bg-[#091428]/80 p-3 shadow-glow">
                      <button
                        type="button"
                        onClick={() => setStatsViewMode('completa')}
                        className={`rounded-2xl px-5 py-3 text-sm font-black uppercase tracking-[0.12em] transition ${statsViewMode === 'completa' ? 'bg-white text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
                      >
                        Estadísticas
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatsViewMode('delegado')}
                        className={`rounded-2xl px-5 py-3 text-sm font-black uppercase tracking-[0.12em] transition ${statsViewMode === 'delegado' ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
                      >
                        Modo Delegado
                      </button>
                    </div>
                    {statsViewMode === 'delegado' ? renderDelegatedStatsMode() : (
                    <>
                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Resumen de marcador</h3>
                      <div className="mt-6 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
                        <div className="text-center">
                          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white p-3 shadow-glow">
                            <img src={clubCrest} alt="" className="h-full w-full object-contain" />
                          </div>
                          <p className="mt-3 text-sm font-bold text-white">C.D. Caudal</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Resultado</p>
                          <p className="mt-2 text-6xl font-black text-white">{getStatsScore().home} - {getStatsScore().away}</p>
                        </div>
                        <div className="text-center">
                          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 p-3 shadow-glow">
                            {selectedMatch.opponentCrest ? <img src={selectedMatch.opponentCrest} alt="" className="h-full w-full object-contain" /> : <span className="text-xl font-black text-white">{selectedMatch.opponent?.slice(0, 2).toUpperCase()}</span>}
                          </div>
                          <p className="mt-3 text-sm font-bold text-white">{selectedMatch.opponent || 'Rival'}</p>
                        </div>
                      </div>
                      <div className="mt-6 grid gap-4 lg:grid-cols-3">
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Goles Caudal</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            {getStatsGoalEvents().filter((event) => event.type === 'Gol a favor').length ? getStatsGoalEvents().filter((event) => event.type === 'Gol a favor').map((event) => (
                              <p key={event.id}>{event.minute}' ⚽ {event.scorer || 'Sin goleador'} · {event.subphase}{event.assistant ? ` · 👟 ${event.assistant}` : ''}</p>
                            )) : <p>Sin goles registrados.</p>}
                          </div>
                        </div>
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Goles rivales</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            {getStatsGoalEvents().filter((event) => event.type === 'Gol en contra').length ? getStatsGoalEvents().filter((event) => event.type === 'Gol en contra').map((event) => (
                              <p key={event.id}>{event.minute}' · {event.phase} · {event.subphase}</p>
                            )) : <p>Sin goles rivales registrados.</p>}
                          </div>
                        </div>
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Disciplina y lesiones</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            {getStatsCalledPlayers().filter((player) => getStatsPlayerData(player.name).yellow || getStatsPlayerData(player.name).red || getStatsPlayerData(player.name).injured).length ? (
                              getStatsCalledPlayers().filter((player) => getStatsPlayerData(player.name).yellow || getStatsPlayerData(player.name).red || getStatsPlayerData(player.name).injured).map((player) => {
                                const stats = getStatsPlayerData(player.name);
                                return (
                                  <p key={player.id}>
                                    {player.name} {stats.yellow ? `🟨${stats.yellowCount > 1 ? stats.yellowCount : ''}` : ''}{stats.red ? ' 🟥' : ''}{stats.injured ? ' 🚑' : ''}
                                  </p>
                                );
                              })
                            ) : (
                              <p>Sin tarjetas ni lesiones.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Eventos clave</h3>
                          <p className="mt-2 text-sm text-slate-400">Análisis de goles con fase, subfase y mapas visuales.</p>
                        </div>
                        <button type="button" onClick={openGoalAnalysisModal} className="rounded-2xl bg-red-500 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white">
                          Añadir análisis de gol
                        </button>
                      </div>
                      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {getStatsGoalEvents().length ? getStatsGoalEvents().map((event) => (
                          <div key={event.id} className="rounded-3xl bg-[#0f1e38]/80 p-5">
                            <p className="text-sm font-black text-caudal-electric">{event.minute}' · {event.type}</p>
                            <p className="mt-2 text-sm font-semibold text-white">{event.type === 'Gol a favor' ? event.scorer || 'Sin goleador' : selectedMatch.opponent || 'Rival'}</p>
                            {event.assistant ? <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">Asist. {event.assistant}</p> : null}
                            <p className="mt-3 text-sm text-slate-300">{event.phase} · {event.subphase}</p>
                            <p className="mt-1 text-xs text-slate-500">Remate: {normalizePitchZone(event.shotZone)} · Asistencia: {normalizePitchZone(event.assistZone)} · Portería: {event.goalZone}</p>
                          </div>
                        )) : <div className="rounded-3xl bg-[#0f1e38]/80 p-6 text-sm text-slate-400">No hay eventos clave todavía.</div>}
                      </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.75fr]">
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Disposición táctica</h3>
                            <p className="mt-2 text-sm text-slate-400">Arrastra convocados al campo y modifica posiciones por sistema.</p>
                          </div>
                          <select value={selectedMatch.statsSystem || '4-4-2'} onChange={(event) => updateStatsSystem(event.target.value)} className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-black text-slate-950">
                            {gameSystems.map((system) => <option key={system} value={system}>{system}</option>)}
                          </select>
                        </div>
                        <label className="mt-5 block space-y-2 text-sm text-slate-300">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Capitán</span>
                          <select
                            value={selectedMatch.captainPlayerId || ''}
                            onChange={(event) => updateMatchCaptain(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-black text-slate-950"
                          >
                            <option value="">Sin capitán</option>
                            {(getStatsCalledPlayers().length ? getStatsCalledPlayers() : players).map((player) => (
                              <option key={player.id} value={player.id}>{player.number || '-'} · {player.name}</option>
                            ))}
                          </select>
                        </label>
                        <div className="mt-5">{renderStatsPitch()}</div>
                      </div>
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Convocados disponibles</h3>
                            <p className="mt-2 text-sm text-slate-400">Arrastra al campo o edita su rol en la tabla inferior.</p>
                          </div>
                          <button
                            type="button"
                            onClick={openStatsCallupPanel}
                            className="rounded-2xl bg-caudal-electric px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-[#7aacff]"
                          >
                            Añadir convocados
                          </button>
                        </div>
                        {getStatsCalledPlayers().length ? (
                          <>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={markAllStatsCalledAsSubstitutes}
                                className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/15"
                              >
                                Marcar todos como suplentes
                              </button>
                              {(selectedMatch.statsLineup || []).some(Boolean) ? (
                                <button
                                  type="button"
                                  onClick={markStatsLineupAsStarters}
                                  className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-caudal-electric transition hover:bg-white/15"
                                >
                                  Marcar once inicial
                                </button>
                              ) : null}
                            </div>
                            <div className="mt-5 max-h-[620px] space-y-3 overflow-y-auto pr-1">
                              {getStatsCalledPlayers().map((player) => {
                                const stats = getStatsPlayerData(player.name);
                                return (
                                  <div key={player.id} draggable onDragStart={() => setDraggedPlayer(player)} className={`rounded-3xl px-4 py-3 ${stats.role === 'Titular' ? 'bg-caudal-electric/20 text-white' : 'bg-white/5 text-slate-300'}`}>
                                    <div className="flex items-center gap-3">
                                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-sm font-black text-white">{player.number || '-'}</span>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold">{player.name}</p>
                                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{stats.role}</p>
                                      </div>
                                      <button type="button" onClick={() => removeStatsCalledPlayer(player.name)} className="rounded-xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-100">
                                        Borrar
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                            <p className="text-sm font-semibold text-white">Todavía no hay convocados para este partido.</p>
                            <p className="mt-2 text-sm text-slate-400">Añade varios jugadores de una vez desde la plantilla de Supabase.</p>
                            <button
                              type="button"
                              onClick={openStatsCallupPanel}
                              className="mt-5 rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-[#7aacff]"
                            >
                              Añadir convocados
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Rendimiento individual</h3>
                          <p className="mt-2 text-sm text-slate-400">Minutos, rol, tarjetas, lesión y valoración se guardan en Supabase.</p>
                        </div>
                        {getStatsCalledPlayers().length ? (
                          <button
                            type="button"
                            onClick={markAllStatsCalledAsSubstitutes}
                            className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/15"
                          >
                            Todos suplentes
                          </button>
                        ) : null}
                      </div>
                      {getStatsCalledPlayers().length ? (
                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left text-sm">
                          <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            <tr>
                              {['Jugador', 'Rol', 'Minutos', 'Cambio por', 'Goles', 'Asistencias', 'Amarilla', 'Roja', 'Lesión', 'Valoración'].map((head) => <th key={head} className="px-3 py-3">{head}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {[...getStatsCalledPlayers()].sort((a, b) => (getStatsPlayerData(a.name).role === 'Titular' ? -1 : 1) - (getStatsPlayerData(b.name).role === 'Titular' ? -1 : 1)).map((player) => {
                              const stats = getStatsPlayerData(player.name);
                              const minutes = Number(stats.minutes || 0);
                              const canReplace = stats.role === 'Titular' && minutes > 0 && minutes < 90;
                              const substituteMinutes = stats.role === 'Suplente' ? getStatsSubstituteMinutes(player.name) : 0;
                              const displayedMinutes = substituteMinutes || stats.minutes;
                              return (
                                <tr key={player.id} className={`border-t border-white/10 ${stats.role === 'Titular' ? 'bg-caudal-electric/10' : 'bg-white/[0.02]'}`}>
                                  <td className="px-3 py-4 font-bold text-white">{player.name}</td>
                                  <td className="px-3 py-4 text-xs uppercase tracking-[0.14em] text-caudal-electric">{stats.role}</td>
                                  <td className="px-3 py-4"><input type="number" min="0" max="90" value={displayedMinutes} onChange={(event) => updateStatsPlayerData(player.name, { minutes: event.target.value, replacementName: Number(event.target.value) >= 90 ? '' : stats.replacementName })} className="w-20 rounded-xl bg-white px-3 py-2 font-bold text-slate-950" /></td>
                                  <td className="px-3 py-4">
                                    <select
                                      value={stats.replacementName}
                                      disabled={!canReplace}
                                      onChange={(event) => updateStatsPlayerData(player.name, { replacementName: event.target.value })}
                                      className="w-52 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                                    >
                                      <option value="">{canReplace ? 'Seleccionar suplente' : 'Sin cambio'}</option>
                                      {getStatsReplacementOptions(player.name).map((replacement) => (
                                        <option key={replacement.id} value={replacement.name}>{replacement.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-4 text-white">{stats.goals}</td>
                                  <td className="px-3 py-4 text-white">{stats.assists}</td>
                                  <td className="px-3 py-4">
                                    <div className="flex gap-1">
                                      {[1, 2].map((cardNumber) => {
                                        const active = stats.yellowCount >= cardNumber;
                                        return (
                                          <button
                                            key={cardNumber}
                                            type="button"
                                            onClick={() => {
                                              const nextCount = active && stats.yellowCount === cardNumber ? cardNumber - 1 : cardNumber;
                                              updateStatsPlayerData(player.name, { yellowCount: nextCount, yellow: nextCount > 0 });
                                            }}
                                            className={`flex h-7 w-7 items-center justify-center rounded-md border text-[10px] font-black transition ${active ? 'border-yellow-200 bg-yellow-300 text-slate-950 shadow-[0_0_18px_rgba(253,224,71,0.35)]' : 'border-white/20 bg-white/10 text-slate-500 hover:bg-white/15'}`}
                                            title={`${cardNumber} amarilla${cardNumber > 1 ? 's' : ''}`}
                                          >
                                            {cardNumber}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td className="px-3 py-4">
                                    <button
                                      type="button"
                                      onClick={() => updateStatsPlayerData(player.name, { red: !stats.red })}
                                      className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-black transition ${stats.red ? 'border-red-200 bg-red-500 text-white shadow-[0_0_18px_rgba(239,68,68,0.35)]' : 'border-white/20 bg-white/10 text-slate-500 hover:bg-white/15'}`}
                                      title="Roja"
                                    >
                                      R
                                    </button>
                                  </td>
                                  <td className="px-3 py-4"><button type="button" onClick={() => updateStatsPlayerData(player.name, { injured: !stats.injured })} className={`rounded-xl px-3 py-2 text-sm font-black ${stats.injured ? 'bg-red-100 text-red-700' : 'bg-white/10 text-slate-300'}`}>+</button></td>
                                  <td className="px-3 py-4">
                                    <select
                                      value={stats.rating}
                                      onChange={(event) => updateStatsPlayerData(player.name, { rating: event.target.value })}
                                      className={`w-16 rounded-xl px-2 py-2 text-center text-sm font-black outline-none transition ${stats.rating ? 'bg-emerald-300 text-slate-950' : 'bg-emerald-50 text-slate-400'}`}
                                    >
                                      <option value="">-</option>
                                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                                        <option key={rating} value={rating}>{rating}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      ) : (
                        <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                          <p className="text-sm text-slate-400">La tabla aparecerá cuando añadas convocados.</p>
                        </div>
                      )}
                    </div>
                    </>
                    )}
                  </section>
                ) : matchView === 'impresion_partido' ? (
                  <MatchPrintTab
                    match={selectedMatch}
                    matches={matches}
                    players={players}
                    getFormationCoordinates={getFormationCoordinates}
                  />
                ) : (
                  <section className="space-y-6">
                    {postLoading ? (
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 text-sm text-slate-400 shadow-glow">
                        Cargando POST desde Supabase...
                      </div>
                    ) : null}
                    {postError ? (
                      <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-100 shadow-glow">
                        {postError}
                      </div>
                    ) : null}
                    <div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">POST partido</p>
                            <h3 className="mt-2 text-2xl font-semibold text-white">Vídeo y análisis de partido</h3>
                            <p className="mt-2 text-sm text-slate-400">Revisa acciones, salta a eventos y compara el plan con lo que ocurrió.</p>
                          </div>
                          <label className="w-full space-y-2 text-sm text-slate-300 lg:max-w-md">
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Enlace YouTube</span>
                            <input
                              value={selectedMatch.postVideoLink || ''}
                              onChange={(event) => handlePostVideoLinkChange(event.target.value)}
                              onBlur={savePostVideoLink}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                event.currentTarget.blur();
                              }}
                              placeholder="https://www.youtube.com/watch?v=..."
                              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                            />
                            {postVideoSaveStatus ? <span className="text-xs text-slate-500">{postVideoSaveStatus}</span> : null}
                          </label>
                        </div>
                        <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-3">
                          {getYouTubeEmbedUrl(selectedMatch.postVideoLink, postVideoStartSeconds) ? (
                            <>
                              <div className="relative overflow-hidden rounded-3xl bg-black shadow-inner" style={{ paddingTop: '56.25%' }}>
                                <iframe
                                  ref={postYoutubeIframeRef}
                                  key={selectedMatch.postVideoLink}
                                  src={getYouTubeEmbedUrl(selectedMatch.postVideoLink, 0)}
                                  title="Post partido video"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  className="absolute inset-0 h-full w-full"
                                />
                              </div>
                              <div className="mt-4 rounded-3xl border border-white/10 bg-black/25 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Timeline de clips</p>
                                  <p className="text-xs text-slate-400">
                                    {postVideoDuration ? `${Math.round(postVideoDuration / 60)} min` : 'Duración no disponible'}
                                  </p>
                                </div>
                                {postVideoDuration ? (
                                  <div className="relative mt-4 h-16 rounded-full bg-white/10">
                                    <div className="absolute left-3 right-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20" />
                                    {[...(selectedMatch.events || [])]
                                      .sort((a, b) => Number(a.videoSeconds || 0) - Number(b.videoSeconds || 0))
                                      .map((event, index, events) => {
                                        const position = getPostEventTimelinePosition(event, index, events);
                                        if (!position) return null;
                                        const selected = selectedPostEventId === event.id;
                                        return (
                                          <button
                                            key={event.id}
                                            type="button"
                                            onClick={() => seekPostVideoToEvent(event)}
                                            className={`absolute top-1/2 z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-4 transition hover:scale-110 ${eventColorDotClass(event.type)} ${selected ? 'scale-125 shadow-[0_0_22px_rgba(255,255,255,0.45)]' : ''}`}
                                            style={{ left: position.left, marginTop: position.top }}
                                            title={`${event.minute}' · ${event.type}${event.description ? ` · ${event.description}` : ''}`}
                                          >
                                            <span className="h-2 w-2 rounded-full bg-white/90" />
                                          </button>
                                        );
                                      })}
                                  </div>
                                ) : (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    {(selectedMatch.events || []).length ? (
                                      [...(selectedMatch.events || [])]
                                        .sort((a, b) => Number(a.videoSeconds || 0) - Number(b.videoSeconds || 0))
                                        .map((event) => (
                                          <button
                                            key={event.id}
                                            type="button"
                                            onClick={() => seekPostVideoToEvent(event)}
                                            className={`rounded-2xl px-3 py-2 text-xs font-bold transition ${selectedPostEventId === event.id ? 'ring-2 ring-caudal-electric' : ''} ${eventButtonClass(event.type)}`}
                                            title={event.description}
                                          >
                                            {event.minute}' · {event.type}
                                          </button>
                                        ))
                                    ) : (
                                      <p className="text-sm text-slate-500">Guarda eventos para crear clips del vídeo.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="mt-4 rounded-3xl border border-white/5 bg-[#091428]/80 p-5">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Clips del vídeo</h4>
                                    <p className="mt-2 text-sm text-slate-400">Edita jugador y descripción, o salta directamente al momento del vídeo.</p>
                                  </div>
                                  <span className="rounded-2xl bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">{(selectedMatch.events || []).length} eventos</span>
                                </div>
                                <div className="mt-5 space-y-3">
                                  {(selectedMatch.events || []).length > 0 ? (
                                    [...(selectedMatch.events || [])]
                                      .sort((a, b) => Number(a.videoSeconds || 0) - Number(b.videoSeconds || 0))
                                      .map((event) => (
                                      <div key={event.id} className={`rounded-3xl border p-4 transition ${selectedPostEventId === event.id ? 'border-caudal-electric/60 bg-caudal-electric/10' : 'border-white/5 bg-[#0f1e38]/80'}`}>
                                        <div className="grid gap-3 lg:grid-cols-[90px_150px_1fr_auto] lg:items-center">
                                          <label className="space-y-1 text-xs text-slate-500">
                                            <span className="uppercase tracking-[0.14em]">Minuto</span>
                                            <input
                                              value={event.minute || ''}
                                              onChange={(changeEvent) => updatePostEventLocal(event.id, { minute: changeEvent.target.value })}
                                              onBlur={(blurEvent) => savePostEventInline({ ...event, minute: blurEvent.target.value })}
                                              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white"
                                            />
                                          </label>
                                          <label className="space-y-1 text-xs text-slate-500">
                                            <span className="uppercase tracking-[0.14em]">Tipo</span>
                                            <select
                                              value={event.type || ''}
                                              onChange={(changeEvent) => {
                                                updatePostEventLocal(event.id, { type: changeEvent.target.value });
                                                const selectedType = eventTypes.find((eventType) => eventType.name === changeEvent.target.value);
                                                savePostEventInline({ ...event, type: changeEvent.target.value, tipoEventoId: selectedType?.id || null });
                                              }}
                                              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white"
                                            >
                                              {eventTypes.map((eventType) => <option key={eventType.id} value={eventType.name}>{eventType.name}</option>)}
                                            </select>
                                          </label>
                                          <label className="space-y-1 text-xs text-slate-500">
                                            <span className="uppercase tracking-[0.14em]">Descripción</span>
                                            <input
                                              value={event.description || ''}
                                              onChange={(changeEvent) => updatePostEventLocal(event.id, { description: changeEvent.target.value })}
                                              onBlur={(blurEvent) => savePostEventInline({ ...event, description: blurEvent.target.value })}
                                              placeholder="Añadir detalle del clip"
                                              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                            />
                                          </label>
                                          <div className="flex flex-wrap gap-2 lg:justify-end">
                                            <button type="button" onClick={() => seekPostVideoToEvent(event)} className={`rounded-xl px-3 py-2 text-xs font-bold ${eventButtonClass(event.type)}`}>
                                              Ir {formatVideoSeconds(event.videoSeconds)}
                                            </button>
                                            <button type="button" onClick={() => deletePostEvent(event.id)} className="rounded-xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-100">
                                              Eliminar
                                            </button>
                                          </div>
                                        </div>
                                        <label className="mt-3 block space-y-1 text-xs text-slate-500">
                                          <span className="uppercase tracking-[0.14em]">Jugador</span>
                                          <input
                                            value={event.player || ''}
                                            onChange={(changeEvent) => updatePostEventLocal(event.id, { player: changeEvent.target.value })}
                                            onBlur={(blurEvent) => savePostEventInline({ ...event, player: blurEvent.target.value })}
                                            placeholder="Opcional"
                                            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                          />
                                        </label>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="rounded-3xl bg-[#0f1e38]/80 p-6 text-sm text-slate-400">No se han marcado clips todavía.</div>
                                  )}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/20 text-center text-sm text-slate-400">
                              Sin vídeo asignado
                            </div>
                          )}
                        </div>
                      </div>

                      <aside className="space-y-6">
                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Marcar clips</h4>
                          <p className="mt-2 text-sm text-slate-400">Pulsa un botón mientras ves la acción. Se guarda el clip en el segundo actual.</p>
                          {postClipFeedback ? (
                            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
                              {postClipFeedback}
                            </div>
                          ) : null}
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {eventTypes.length ? eventTypes.map((eventType) => (
                              <button
                                key={eventType.id}
                                type="button"
                                onClick={() => markPostClip(eventType)}
                                disabled={!postYoutubeReady || postClipSaving}
                                className={`rounded-3xl px-4 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${eventButtonClass(eventType.color)}`}>
                                {eventType.name}
                              </button>
                            )) : (
                              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-400 sm:col-span-2">
                                Sin tipos cargados desde Supabase.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Configurar botones</h4>
                          <p className="mt-2 text-sm text-slate-400">Edita los tipos que aparecen en la botonera de marcado.</p>
                          <div className="mt-5 space-y-3">
                            {eventTypes.map((eventType) => (
                              <div key={`edit-${eventType.id}`} className="grid gap-2 rounded-2xl bg-white/5 p-3 sm:grid-cols-[1fr_110px_auto]">
                                <input
                                  value={eventType.name}
                                  onChange={(event) => updateEventType(eventType.id, { name: event.target.value })}
                                  className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                                />
                                <select
                                  value={eventType.color}
                                  onChange={(event) => updateEventType(eventType.id, { color: event.target.value })}
                                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                                >
                                  {eventColorOptions.map((color) => (
                                    <option key={color} value={color}>{color}</option>
                                  ))}
                                </select>
                                <button type="button" onClick={() => removeEventType(eventType.id)} className="rounded-xl bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-100">
                                  Eliminar
                                </button>
                              </div>
                            ))}
                            <div className="grid gap-2 rounded-2xl bg-white/5 p-3 sm:grid-cols-[1fr_110px_auto]">
                              <input
                                value={newEventTypeDraft.name}
                                onChange={(event) => setNewEventTypeDraft((prev) => ({ ...prev, name: event.target.value }))}
                                placeholder="Nuevo evento"
                                className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500"
                              />
                              <select
                                value={newEventTypeDraft.color}
                                onChange={(event) => setNewEventTypeDraft((prev) => ({ ...prev, color: event.target.value }))}
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                              >
                                {eventColorOptions.map((color) => (
                                  <option key={color} value={color}>{color}</option>
                                ))}
                              </select>
                              <button type="button" onClick={addEventType} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-semibold text-slate-950">
                                Añadir
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Registrar evento</h4>
                          <div className="mt-5 space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <label className="space-y-2 text-sm text-slate-300">
                                <span>Minuto actual</span>
                                <input
                                  value={postCurrentMinute}
                                  onChange={(event) => {
                                    setPostCurrentMinute(event.target.value);
                                    handleEventDraftChange('minute', event.target.value);
                                  }}
                                  placeholder="Ej. 72"
                                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                                />
                              </label>
                              <label className="space-y-2 text-sm text-slate-300">
                                <span>Jugador</span>
                                <input
                                  value={newEventDraft.player}
                                  onChange={(event) => handleEventDraftChange('player', event.target.value)}
                                  placeholder="Opcional"
                                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                                />
                              </label>
                            </div>
                            <label className="space-y-2 text-sm text-slate-300">
                              <span>Descripción breve</span>
                              <textarea
                                value={newEventDraft.description}
                                onChange={(event) => handleEventDraftChange('description', event.target.value)}
                                placeholder="Qué ocurrió y por qué importa..."
                                className="min-h-[110px] w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white placeholder:text-slate-500"
                              />
                            </label>
                            <button type="button" onClick={addNewEvent} className="w-full rounded-3xl bg-caudal-electric px-5 py-4 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]">
                              {newEventDraft.id ? 'Actualizar evento' : 'Guardar evento'}
                            </button>
                          </div>
                        </div>
                      </aside>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Lectura POST del partido</h4>
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {[
                          { label: 'Qué ocurrió realmente', field: 'postReality' },
                          { label: 'Qué se cumplió', field: 'postFulfilled' },
                          { label: 'Qué no se cumplió', field: 'postNotFulfilled' },
                          { label: 'Por qué', field: 'postWhy' },
                          { label: 'Ajuste para próximos partidos', field: 'postNextAdjustment' },
                          { label: 'Notas POST', field: 'postNotes' },
                        ].map((item) => (
                          <label key={item.field} className="space-y-2 text-sm text-slate-300">
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</span>
                            <textarea
                              value={selectedMatch[item.field] || ''}
                              onChange={(event) => updateSelectedMatchFields({ [item.field]: event.target.value })}
                              className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Conclusiones finales</h4>
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {[
                          { label: 'Qué repetir', field: 'postRepeat' },
                          { label: 'Qué mejorar', field: 'postImprove' },
                          { label: 'Qué entrenar esta semana', field: 'postTrainWeek' },
                          { label: 'Observaciones individuales', field: 'postIndividualObservations' },
                        ].map((item) => (
                          <label key={item.field} className="space-y-2 text-sm text-slate-300">
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</span>
                            <textarea
                              value={selectedMatch[item.field] || ''}
                              onChange={(event) => updateSelectedMatchFields({ [item.field]: event.target.value })}
                              className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </section>
                )}
              </section>
            ) : (
              <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-sm text-slate-400">Partido no encontrado.</section>
            )}
          </main>
        ) : null}
      </div>

      {authUser ? (
        <>
          <button
            type="button"
            onClick={() => setIsLitoOpen(true)}
            className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full border border-caudal-electric/30 bg-[#091428] px-5 py-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 hover:border-caudal-electric/60 hover:bg-[#0f1e38]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-caudal-electric text-sm font-black text-slate-950">Li</span>
            Lito
          </button>

          {isLitoOpen ? (
            <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm">
              <button
                type="button"
                aria-label="Cerrar Lito"
                onClick={() => setIsLitoOpen(false)}
                className="hidden flex-1 sm:block"
              />
              <aside className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#071224] shadow-[0_0_60px_rgba(0,0,0,0.55)] sm:rounded-l-3xl">
                <div className="border-b border-white/10 px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-caudal-electric">Asistente</p>
                      <h3 className="mt-1 text-2xl font-black text-white">Lito</h3>
                      <p className="mt-2 text-sm text-slate-400">Consulta datos reales guardados en Supabase.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLitoOpen(false)}
                      className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
                  {litoMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`rounded-3xl px-4 py-3 text-sm leading-6 ${
                        message.role === 'user'
                          ? 'ml-8 bg-caudal-electric text-slate-950'
                          : 'mr-8 border border-white/10 bg-white/[0.06] text-slate-100'
                      }`}
                    >
                      {message.text}
                    </div>
                  ))}
                  {litoLoading ? (
                    <div className="mr-8 rounded-3xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-300">
                      Consultando Supabase...
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-white/10 px-5 py-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {[
                      '¿Quién marcó en el último partido?',
                      '¿Qué jugador tiene más amarillas?',
                      '¿Qué rivales juegan 4-4-2?',
                    ].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setLitoQuestion(example)}
                        className="rounded-full bg-white/10 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-white/15"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={handleLitoSubmit} className="flex gap-2">
                    <input
                      value={litoQuestion}
                      onChange={(event) => setLitoQuestion(event.target.value)}
                      placeholder="Pregunta a Lito..."
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={!litoQuestion.trim() || litoLoading}
                      className="rounded-2xl bg-caudal-electric px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Enviar
                    </button>
                  </form>
                </div>
              </aside>
            </div>
          ) : null}
        </>
      ) : null}

      {isCanvaPreviewOpen && selectedMatch && getCanvaEmbedUrl(selectedMatch.preCanvaLink) ? (
        <div className="fixed inset-0 z-50 bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">PRE partido</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Previsualización informe Canva</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCanvaPreviewOpen(false)}
                className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                Cerrar
              </button>
            </div>
            <iframe
              title="Informe Canva ampliado"
              src={getCanvaEmbedUrl(selectedMatch.preCanvaLink)}
              className="min-h-0 flex-1 bg-white"
              allowFullScreen
            />
          </div>
        </div>
      ) : null}

      {isGoalAnalysisOpen && selectedMatch ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-[#111b2a] shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500 text-xl font-black text-white">+</span>
                <h3 className="text-lg font-black uppercase tracking-[0.18em] text-white">Añadir análisis del gol</h3>
              </div>
              <button type="button" onClick={() => setIsGoalAnalysisOpen(false)} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200">Cerrar</button>
            </div>
            <div className="space-y-6 px-6 py-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="grid grid-cols-2 rounded-3xl border border-white/10 bg-white/5 p-1">
                  {['Gol a favor', 'Gol en contra'].map((type) => (
                    <button key={type} type="button" onClick={() => updateGoalAnalysisDraft('type', type)} className={`rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] ${goalAnalysisDraft.type === type ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>{type}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 rounded-3xl border border-white/10 bg-white/5 p-1">
                  {['1ª parte', '2ª parte'].map((half) => (
                    <button key={half} type="button" onClick={() => updateGoalAnalysisDraft('half', half)} className={`rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] ${goalAnalysisDraft.half === half ? 'bg-caudal-electric text-slate-950' : 'text-slate-400'}`}>{half}</button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Minuto</span>
                  <input value={goalAnalysisDraft.minute} onChange={(event) => updateGoalAnalysisDraft('minute', event.target.value)} placeholder="Min" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                </label>
                {goalAnalysisDraft.type === 'Gol a favor' ? (
                  <>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Goleador</span>
                      <select value={goalAnalysisDraft.scorer} onChange={(event) => updateGoalAnalysisDraft('scorer', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                        <option value="">Seleccionar...</option>
                        {players.map((player) => <option key={player.id} value={player.name}>{player.name}</option>)}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Asistente</span>
                      <select value={goalAnalysisDraft.assistant} onChange={(event) => updateGoalAnalysisDraft('assistant', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                        <option value="">Sin asistencia</option>
                        {players.map((player) => <option key={player.id} value={player.name}>{player.name}</option>)}
                      </select>
                    </label>
                  </>
                ) : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Fase del juego</span>
                  <select value={goalAnalysisDraft.phase} onChange={(event) => updateGoalAnalysisDraft('phase', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                    {Object.keys(goalPhaseOptions).map((phase) => <option key={phase} value={phase}>{phase}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Subfase</span>
                  <select value={goalAnalysisDraft.subphase} onChange={(event) => updateGoalAnalysisDraft('subphase', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                    {(goalPhaseOptions[goalAnalysisDraft.phase] || []).map((subphase) => <option key={subphase} value={subphase}>{subphase}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div>
                  <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Zona de remate</p>
                  {renderZoneGrid({ value: goalAnalysisDraft.shotZone, onChange: (zone) => updateGoalAnalysisDraft('shotZone', zone) })}
                </div>
                <div>
                  <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Zona de asistencia</p>
                  {renderZoneGrid({ value: goalAnalysisDraft.assistZone, onChange: (zone) => updateGoalAnalysisDraft('assistZone', zone) })}
                </div>
                <div>
                  <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Zona portería</p>
                  {renderZoneGrid({ value: goalAnalysisDraft.goalZone, onChange: (zone) => updateGoalAnalysisDraft('goalZone', zone), zones: goalZoneOptions, goal: true })}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Superficie de contacto</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {['Pie derecho', 'Pie izquierdo', 'Cabeza', 'Otro'].map((contact) => (
                      <button key={contact} type="button" onClick={() => updateGoalAnalysisDraft('contact', contact)} className={`rounded-2xl px-4 py-3 text-sm font-bold ${goalAnalysisDraft.contact === contact ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{contact}</button>
                    ))}
                  </div>
                </div>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">URL del vídeo opcional</span>
                  <input value={goalAnalysisDraft.videoUrl} onChange={(event) => updateGoalAnalysisDraft('videoUrl', event.target.value)} placeholder="https://..." className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                </label>
              </div>

              <button type="button" onClick={saveGoalAnalysisEvent} className="w-full rounded-3xl bg-caudal-electric px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-slate-950">
                Guardar análisis de gol
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isStatsCallupPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Estadísticas</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Añadir convocados</h3>
                <p className="mt-2 text-sm text-slate-400">Selecciona jugadores de la plantilla y se crearán sus registros de convocatoria y rendimiento.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsStatsCallupPanelOpen(false);
                  setSelectedStatsCallups([]);
                  setStatsCallupError('');
                }}
                disabled={statsCallupSaving}
                className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cerrar
              </button>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={() => setSelectedStatsCallups(getAvailableStatsCallupPlayers().map((player) => player.name))}
                disabled={!getAvailableStatsCallupPlayers().length || statsCallupSaving}
                className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Seleccionar todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatsCallups([])}
                disabled={!selectedStatsCallups.length || statsCallupSaving}
                className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Deseleccionar todos
              </button>
              <span className="ml-auto rounded-2xl bg-caudal-electric/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-caudal-electric">
                {selectedStatsCallups.length} seleccionados
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {statsCallupError ? (
                <div className="mb-4 rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {statsCallupError}
                </div>
              ) : null}
              {getAvailableStatsCallupPlayers().length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {getAvailableStatsCallupPlayers().map((player) => {
                    const checked = selectedStatsCallups.includes(player.name);
                    return (
                      <label
                        key={player.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-3xl border px-4 py-3 transition ${
                          checked ? 'border-caudal-electric/60 bg-caudal-electric/15 text-white' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStatsCallupSelection(player.name)}
                          disabled={statsCallupSaving}
                          className="h-5 w-5 accent-caudal-electric"
                        />
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/10 text-xs font-black text-white">
                          {player.image ? <img src={player.image} alt="" className="h-full w-full object-cover" /> : player.number || '-'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{player.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{player.position || 'Sin posición'}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
                  <p className="text-sm font-semibold text-white">No quedan jugadores sin convocar.</p>
                  <p className="mt-2 text-sm text-slate-400">Todos los jugadores de plantilla ya están en este partido.</p>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsStatsCallupPanelOpen(false);
                  setSelectedStatsCallups([]);
                  setStatsCallupError('');
                }}
                disabled={statsCallupSaving}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddSelectedStatsCallups}
                disabled={!selectedStatsCallups.length || statsCallupSaving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-[#7aacff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {statsCallupSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" /> : null}
                {statsCallupSaving ? 'Añadiendo...' : 'Añadir seleccionados'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{editingId ? 'Editar jugador' : 'Nuevo jugador'}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Formulario de jugador</h3>
              </div>
              <button onClick={closeForm} disabled={isSavingPlayer} className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60">
                Cerrar
              </button>
            </div>
            <form onSubmit={handleSubmit} className="min-h-0 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              {playerFormError ? (
                <div className="rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {playerFormError}
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Nombre completo</span>
                  <input
                    required
                    name="name"
                    value={formState.name}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Ej. Pablo Núñez"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Nombre camiseta</span>
                  <input
                    name="shirtName"
                    value={formState.shirtName}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Ej. PABLO NÚÑEZ"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Fecha de nacimiento</span>
                  <input
                    required
                    type="date"
                    name="dob"
                    value={formState.dob}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Dorsal</span>
                  <input
                    required
                    type="number"
                    name="number"
                    min="1"
                    value={formState.number}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                    placeholder="7"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Posición</span>
                  <select
                    required
                    name="position"
                    value={formState.position}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {positions.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Pierna hábil</span>
                  <select
                    required
                    name="foot"
                    value={formState.foot}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {footOptions.map((foot) => (
                      <option key={foot} value={foot}>
                        {foot}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-300">
                <span>URL de imagen</span>
                <input
                  name="image"
                  type="url"
                  value={formState.image}
                  onChange={handleChange}
                  className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  placeholder="https://..."
                />
              </label>
              <div className="space-y-2 text-sm text-slate-300">
                <span>Subir imagen</span>
                <input
                  ref={playerImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePlayerImageFileChange}
                  disabled={isUploadingPlayerImage || isSavingPlayer}
                  className="hidden"
                />
                <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => playerImageInputRef.current?.click()}
                    disabled={isUploadingPlayerImage || isSavingPlayer}
                    className="inline-flex w-fit items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUploadingPlayerImage ? 'Subiendo...' : 'Subir imagen'}
                  </button>
                  {formState.image ? (
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 overflow-hidden rounded-2xl bg-white/10">
                        <img src={formState.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <span className="text-xs text-slate-400">Preview actualizada</span>
                    </div>
                  ) : null}
                </div>
                {isUploadingPlayerImage ? <span className="text-xs text-caudal-electric">Subiendo foto...</span> : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isSavingPlayer}
                  className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingPlayer}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSavingPlayer ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                  ) : null}
                  {isSavingPlayer ? 'Guardando...' : 'Guardar jugador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isTeamPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{editingTeamId ? 'Editar equipo' : 'Nuevo equipo'}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Ficha del rival</h3>
              </div>
              <button onClick={closeTeamForm} className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                Cerrar
              </button>
            </div>

            <form onSubmit={handleTeamSubmit} noValidate className="min-h-0 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Enlace del equipo</span>
                  <input
                    name="sourceUrl"
                    value={teamFormState.sourceUrl}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Opcional: https://es.besoccer.com/equipo/plantilla/..."
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Nombre del equipo</span>
                  <input
                    name="name"
                    value={teamFormState.name}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Se rellena al importar"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>URL escudo</span>
                  <input
                    name="crest"
                    value={teamFormState.crest}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Se rellena al importar"
                  />
                </label>
                <div className="space-y-2 text-sm text-slate-300">
                  <span>Subir imagen</span>
                  <input
                    ref={teamCrestInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleTeamCrestFileChange}
                    disabled={isUploadingTeamCrest}
                    className="hidden"
                  />
                  <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3">
                    <button
                      type="button"
                      onClick={() => teamCrestInputRef.current?.click()}
                      disabled={isUploadingTeamCrest}
                      className="inline-flex w-fit items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUploadingTeamCrest ? 'Subiendo...' : 'Subir imagen'}
                    </button>
                    {teamFormState.crest ? (
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 overflow-hidden rounded-2xl bg-white/10 p-1">
                          <img src={teamFormState.crest} alt="" className="h-full w-full object-contain" />
                        </div>
                        <span className="text-xs text-slate-400">Preview actualizada</span>
                      </div>
                    ) : null}
                  </div>
                  {isUploadingTeamCrest ? <span className="text-xs text-caudal-electric">Subiendo escudo...</span> : null}
                </div>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Estadio</span>
                  <input
                    name="stadium"
                    value={teamFormState.stadium}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Ej. El Bayu"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Color camiseta</span>
                  <input
                    name="kitColor"
                    type="color"
                    value={teamFormState.kitColor}
                    onChange={handleTeamChange}
                    className="h-[46px] w-full rounded-3xl border border-white/10 bg-white/5 px-3 py-2 shadow-inner"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Sistema habitual</span>
                  <select
                    required
                    name="system"
                    value={teamFormState.system}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {gameSystems.map((system) => (
                      <option key={system} value={system}>
                        {system}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">
                  El importador intenta rellenar nombre, escudo, estadio, color, jugadores y fotos desde el enlace.
                </p>
                <button
                  type="button"
                  onClick={handleImportSquad}
                  className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                >
                  Importar datos
                </button>
              </div>
              {importStatus ? <p className="text-sm text-caudal-electric">{importStatus}</p> : null}

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-slate-200">Plantilla</p>
                  <button
                    type="button"
                    onClick={handleAddTeamPlayer}
                    className="inline-flex w-fit items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                  >
                    Añadir jugador
                  </button>
                </div>

                <div className="space-y-3">
                  {teamFormState.squad.length > 0 ? (
                    teamFormState.squad.map((entry, index) => {
                      const player = normalizeSquadEntry(entry);
                      return (
                        <div key={`${player.id}-${index}`} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="grid gap-3">
                            <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.45fr]">
                              <input
                                value={player.name}
                                onChange={(event) => handleTeamPlayerChange(index, 'name', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="Nombre"
                              />
                              <input
                                value={player.image}
                                onChange={(event) => handleTeamPlayerChange(index, 'image', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="URL foto"
                              />
                              <input
                                value={player.number}
                                onChange={(event) => handleTeamPlayerChange(index, 'number', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="Dorsal"
                              />
                            </div>
                            <div className="grid gap-3 md:grid-cols-[1fr_0.45fr_0.7fr_auto]">
                              <select
                                value={player.position}
                                onChange={(event) => handleTeamPlayerChange(index, 'position', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner"
                              >
                                <option value="">Posición</option>
                                {positions.map((position) => (
                                  <option key={position} value={position}>
                                    {position}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={player.age}
                                onChange={(event) => handleTeamPlayerChange(index, 'age', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="Edad"
                              />
                              <select
                                value={player.role}
                                onChange={(event) => handleTeamPlayerChange(index, 'role', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner"
                              >
                                <option value="Titular">Titular</option>
                                <option value="Reserva">Reserva</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveTeamPlayer(index)}
                                className="rounded-2xl bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
                              >
                                Quitar
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-200">
                              <input
                                type="checkbox"
                                checked={player.isKey}
                                onChange={(event) => handleTeamPlayerChange(index, 'isKey', event.target.checked)}
                                className="h-4 w-4 accent-[#4f8cff]"
                              />
                              Destacado
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                              <input
                                type="checkbox"
                                checked={player.yellowRisk}
                                onChange={(event) => handleTeamPlayerChange(index, 'yellowRisk', event.target.checked)}
                                className="h-4 w-4 accent-yellow-300"
                              />
                              Amarilla
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-100">
                              <input
                                type="checkbox"
                                checked={player.suspended}
                                onChange={(event) => handleTeamPlayerChange(index, 'suspended', event.target.checked)}
                                className="h-4 w-4 accent-red-500"
                              />
                              Roja
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-100">
                              <input
                                type="checkbox"
                                checked={player.injured}
                                onChange={(event) => handleTeamPlayerChange(index, 'injured', event.target.checked)}
                                className="h-4 w-4 accent-red-500"
                              />
                              Cruz
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/10 px-5 py-6 text-sm text-slate-400">
                      Importa desde el enlace o añade jugadores manualmente.
                    </div>
                  )}
                </div>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeTeamForm}
                  className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                >
                  Guardar equipo
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isMatchPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <h3 className="text-xl font-black uppercase tracking-[0.18em] text-white">{editingMatchId ? 'Editar partido' : 'Nuevo partido'}</h3>
              </div>
              <button onClick={closeMatchForm} className="text-3xl leading-none text-slate-500 hover:text-white">
                ×
              </button>
            </div>

            <form onSubmit={handleMatchSubmit} className="min-h-0 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Rival</span>
                  <input
                    required
                    list="opponent-teams"
                    name="opponent"
                    value={matchFormState.opponent}
                    onChange={handleMatchChange}
                    placeholder="Escribe o selecciona..."
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                  />
                  <datalist id="opponent-teams">
                    {teams.map((team) => (
                      <option key={team.id} value={cleanTeamDisplayName(team.name)} />
                    ))}
                  </datalist>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Competición</span>
                  <select name="type" value={matchFormState.type} onChange={handleMatchChange} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white">
                    {matchTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Jornada</span>
                  <input name="round" value={matchFormState.round} onChange={handleMatchChange} placeholder="0" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Fecha</span>
                  <input type="date" name="date" value={matchFormState.date} onChange={handleMatchChange} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Condición</span>
                  <select name="isHome" value={matchFormState.isHome ? 'true' : 'false'} onChange={(event) => setMatchFormState((prev) => ({ ...prev, isHome: event.target.value === 'true' }))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white">
                    <option value="true">Local</option>
                    <option value="false">Visitante</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Jugado</span>
                  <span className="flex h-[46px] items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMatchFormState((prev) => ({ ...prev, status: prev.status === 'Finalizado' ? 'Previa' : 'Finalizado' }))}
                      className={`relative h-7 w-14 rounded-full transition ${matchFormState.status === 'Finalizado' ? 'bg-caudal-electric' : 'bg-white/15'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${matchFormState.status === 'Finalizado' ? 'left-8' : 'left-1'}`} />
                    </button>
                    <span className="text-xs font-bold uppercase text-slate-500">{matchFormState.status === 'Finalizado' ? 'Sí' : 'No'}</span>
                  </span>
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Estadio</span>
                <input name="stadium" value={matchFormState.stadium} onChange={handleMatchChange} placeholder="Ej. Hermanos Antuña" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
              </label>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeMatchForm} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200">Cancelar</button>
                <button type="submit" className="rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950">Guardar encuentro</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
