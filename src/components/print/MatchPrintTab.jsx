import { Children, cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import DossierTacticalSheet from './DossierTacticalSheet';
import LineupPrintSheet from './LineupPrintSheet';
import MatchPlanEditor from './MatchPlanEditor';
import MatchPlanPrintSheet from './MatchPlanPrintSheet';
import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import SetPieceDiagramEditor from './SetPieceDiagramEditor';
import SetPieceDiagramPrintSheet from './SetPieceDiagramPrintSheet';
import SetPieceTakersPrintSheet from './SetPieceTakersPrintSheet';
import { getPlayerDisplayName } from '../../utils/playerDisplayName';
import { resolveMatchCaptain } from '../../utils/matchCaptain';
import { getOwnPrintKitForMatch } from '../../utils/printPlayerShirt';
import { getFormationCoordinatesForSavedLineup } from '../../utils/formationSlotCoordinates';
import {
  cloneSetPieceElementsWithFreshIds,
  createDefaultSetPieceTacticalMeta,
  getSetPieceTacticalMeta,
  setSetPieceTacticalMeta,
} from '../../utils/setPieceProfessional';
import {
  MATCH_PLAN_TYPE_VALUES,
  buildMatchPrintPlanSnapshot,
  normalizeMatchPlanSituations,
} from '../../utils/matchPlanPrint';
import {
  getDossierPageContribution,
  getDossierStartPageNumber,
  getDossierTotalPages,
} from '../../utils/printDossierPagination';
import {
  SET_PIECE_PHASES,
  getSetPieceClassificationLabel,
  getSetPieceLabType,
  getSetPiecePhase,
  getSetPieceTypesForPhase,
  isSetPieceLibraryItem,
} from '../../utils/setPieceLaboratory';
import {
  applySetPieceLineupAdaptation,
  buildSetPieceLineupAdaptation,
} from '../../utils/setPieceLineupAdaptation';
import { duplicateMatchSetPiece } from '../../utils/setPieceMatchDuplication';
import { SET_PIECE_HEADER_MENUS, transitionSetPieceHeaderMenu } from '../../utils/setPieceHeaderMenu';
import { areSetPieceLabelsEquivalent } from '../../utils/setPiecePrintModel';

const setPieceSections = [
  { id: 'penaltis', label: 'Penaltis' },
  { id: 'faltas_directas', label: 'Faltas directas' },
  { id: 'faltas_laterales', label: 'Faltas laterales' },
  { id: 'corners', label: 'Córners' },
];

const offensiveSetPieceTypes = getSetPieceTypesForPhase(SET_PIECE_PHASES.OFFENSIVE);
const defensiveSetPieceTypes = getSetPieceTypesForPhase(SET_PIECE_PHASES.DEFENSIVE);

const defaultOffensiveRoles = [
  'Lanzador',
  'Primer palo',
  'Segundo palo',
  'Zona de remate',
  'Rechace',
  'Seguridad',
];

const defaultDefensiveRoles = [
  'Marca individual',
  'Zona 1',
  'Zona 2',
  'Rechace',
  'Corta',
  'Barrera',
  'Vigilancia',
  'Posible rematador rival',
  'Segunda jugada',
];

const createDefaultSetPieceNote = (type, definitions, roles) => {
  const definition = definitions.find((item) => item.id === type);
  return {
    partido_id: '',
    tipo: type,
    titulo: definition?.label || 'ABP',
    descripcion: '',
    roles: roles.map((role) => ({ role, jugadorId: '', playerName: '', manualName: '' })),
  };
};

const createDefaultOffensiveNote = (type) => createDefaultSetPieceNote(type, offensiveSetPieceTypes, defaultOffensiveRoles);
const createDefaultDefensiveNote = (type) => createDefaultSetPieceNote(type, defensiveSetPieceTypes, defaultDefensiveRoles);

const dossierPageDefinitions = [
  { id: 'lineup', label: 'Alineacion', icon: 'XI', use: 'once y banquillo' },
  { id: 'keys', label: 'Claves del partido', icon: 'CL', use: '4-6 ideas de vestuario' },
  { id: 'takers', label: 'Lanzadores', icon: 'LZ', use: 'balon parado rapido' },
  { id: 'offensive', label: 'ABP ofensiva', icon: 'AB+', use: 'jugadas a favor' },
  { id: 'defensive', label: 'ABP defensiva', icon: 'AB-', use: 'marcas y zonas' },
  { id: 'kickoff', label: 'Saque inicial', icon: 'SI', use: 'primer minuto' },
  { id: 'match_plan', label: 'Plan de partido', icon: 'PP', use: 'comportamientos colectivos con y sin balón' },
];

const dossierPresets = {
  matchday: {
    label: 'Dossier partido',
    pages: ['lineup', 'keys', 'takers', 'offensive', 'defensive', 'kickoff', 'match_plan'],
  },
};

const buildDossierPagesFromPreset = (presetKey = 'matchday') => {
  const preset = dossierPresets[presetKey] || dossierPresets.matchday;
  const ordered = [
    ...preset.pages.map((id) => dossierPageDefinitions.find((page) => page.id === id)).filter(Boolean),
    ...dossierPageDefinitions.filter((page) => !preset.pages.includes(page.id)),
  ];
  return ordered.map((page) => ({ ...page, active: preset.pages.includes(page.id) }));
};

function SetPieceActionsMenu({ id, label, openMenu, onToggle, onSelect, children }) {
  const open = openMenu === id;
  const panelId = `set-piece-header-menu-${id}`;
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? panelId : undefined}
        onClick={() => onToggle(id)}
        className="flex min-h-11 items-center rounded-2xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
      >
        {label}
      </button>
      {open ? (
        <div id={panelId} role="menu" aria-label={label} className="absolute right-0 top-[calc(100%+0.5rem)] z-40 grid w-60 max-w-[calc(100vw-2rem)] gap-1.5 rounded-2xl border border-white/10 bg-[#0b1629] p-2 shadow-2xl">
          {Children.map(children, (child) => isValidElement(child) ? cloneElement(child, {
            role: 'menuitem',
            onClick: (event) => {
              onSelect();
              child.props.onClick?.(event);
            },
          }) : child)}
        </div>
      ) : null}
    </div>
  );
}

function SetPieceEditorHeader({
  title,
  description,
  saving,
  hasDiagrams,
  onAdd,
  onSave,
  onDuplicate,
  onDuplicateFromMatch,
  onDelete,
  onMirrorHorizontal,
  onMirrorVertical,
  onSaveToLibrary,
  onLoadFromLibrary,
  contextKey,
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const menuRegionRef = useRef(null);
  const menuActionClass = 'rounded-xl bg-white/10 px-3 py-2.5 text-left text-xs font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 disabled:cursor-not-allowed disabled:opacity-40';

  const closeMenu = () => setOpenMenu((current) => transitionSetPieceHeaderMenu(current, { type: 'select' }));
  const toggleMenu = (menu) => setOpenMenu((current) => transitionSetPieceHeaderMenu(current, { type: 'toggle', menu }));

  useEffect(() => {
    setOpenMenu((current) => transitionSetPieceHeaderMenu(current, { type: 'context-change' }));
  }, [contextKey]);

  useEffect(() => {
    if (!openMenu) return undefined;
    const handlePointerDown = (event) => {
      const inside = Boolean(menuRegionRef.current?.contains(event.target));
      setOpenMenu((current) => transitionSetPieceHeaderMenu(current, { type: 'pointerdown', inside }));
    };
    const handleKeyDown = (event) => {
      setOpenMenu((current) => transitionSetPieceHeaderMenu(current, { type: 'keydown', key: event.key }));
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  return (
    <div className="rounded-2xl border border-white/5 bg-black/15 p-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">{title}</h4>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAdd}
            disabled={saving}
            className="min-h-11 rounded-2xl bg-white px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Añadir jugada
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !hasDiagrams}
            className="min-h-11 rounded-2xl bg-caudal-electric px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-[#7aacff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar jugada'}
          </button>
          <div ref={menuRegionRef} className="contents">
            <SetPieceActionsMenu id={SET_PIECE_HEADER_MENUS.MANAGE} label="Gestionar" openMenu={openMenu} onToggle={toggleMenu} onSelect={closeMenu}>
              <button type="button" onClick={onDuplicate} disabled={saving || !hasDiagrams} className={menuActionClass}>Duplicar jugada actual</button>
              <button type="button" onClick={onDuplicateFromMatch} className={menuActionClass}>Copiar desde otro partido</button>
              <button type="button" onClick={onDelete} disabled={saving || !hasDiagrams} className="rounded-xl bg-red-500/15 px-3 py-2.5 text-left text-xs font-bold text-red-100 transition hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:cursor-not-allowed disabled:opacity-40">Eliminar jugada</button>
            </SetPieceActionsMenu>
            <SetPieceActionsMenu id={SET_PIECE_HEADER_MENUS.LIBRARY} label="Biblioteca" openMenu={openMenu} onToggle={toggleMenu} onSelect={closeMenu}>
              <button type="button" onClick={onSaveToLibrary} disabled={saving || !hasDiagrams} className={menuActionClass}>Guardar en biblioteca</button>
              <button type="button" onClick={onLoadFromLibrary} className={menuActionClass}>Cargar desde biblioteca</button>
            </SetPieceActionsMenu>
            <SetPieceActionsMenu id={SET_PIECE_HEADER_MENUS.TRANSFORM} label="Transformar" openMenu={openMenu} onToggle={toggleMenu} onSelect={closeMenu}>
              <button type="button" onClick={onMirrorHorizontal} disabled={saving || !hasDiagrams} className={menuActionClass}>Espejo horizontal</button>
              <button type="button" onClick={onMirrorVertical} disabled={saving || !hasDiagrams} className={menuActionClass}>Espejo vertical</button>
            </SetPieceActionsMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetPiecePlaySelector({ mode, orders, selectedOrder, onSelect }) {
  if (orders.length <= 1) return null;
  return (
    <div>
      <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Jugadas</p>
      <div className="flex flex-wrap gap-2">
        {orders.map((order) => (
          <button
            key={`${mode}-${order}`}
            type="button"
            onClick={() => onSelect(order)}
            className={`min-h-9 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 ${selectedOrder === order ? 'bg-white text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
          >
            Jugada {order}
          </button>
        ))}
      </div>
    </div>
  );
}

const createDefaultDiagram = (type, order, definitions) => {
  const definition = definitions.find((item) => item.id === type);
  const drawableElements = [
    { id: `${type}-${order}-ball`, type: 'ball', x: 8, y: 8 },
    { id: `${type}-${order}-p1`, type: 'player', x: 46, y: 20, label: '1', player_id: '', roles: [], sequenceOrder: 1 },
    { id: `${type}-${order}-p2`, type: 'player', x: 56, y: 22, label: '2', player_id: '', roles: [], sequenceOrder: 2 },
    { id: `${type}-${order}-p3`, type: 'player', x: 50, y: 36, label: '3', player_id: '', roles: [], sequenceOrder: 3 },
  ];
  return {
    partido_id: '',
    tipo: type,
    orden: order,
    titulo: `${definition?.label || 'ABP'} ${order}`,
    consigna: '',
    elements: setSetPieceTacticalMeta(drawableElements, createDefaultSetPieceTacticalMeta()),
  };
};

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const toPrintPlayer = (player, fallbackName = '') => ({
  ...(player || {}),
  name: player?.name || fallbackName,
  shirtName: player ? getPlayerDisplayName(player) : fallbackName,
});

const getPlayerNameFromEntry = (entry) => {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return entry.name || entry.player_name || entry.fullName || '';
};

const normalizePrintPlayerEntry = (entry, playersByName) => {
  const name = getPlayerNameFromEntry(entry);
  const linked = playersByName.get(normalizeText(name));
  if (typeof entry === 'string') return toPrintPlayer(linked, entry);
  return toPrintPlayer(linked || entry, name);
};

const getLineupStarters = ({ match, playersByName, playersById }) => {
  const statsSlots = Array.isArray(match?.lineupSlots?.stats) ? match.lineupSlots.stats : [];
  const statsSlotsByIndex = new Map(statsSlots.map((slot) => [Number(slot.slot), slot]));
  const hasStatsLineup = statsSlots.some((slot) => slot?.jugadorId || slot?.jugador_id || slot?.playerName || slot?.player_name)
    || (match?.statsLineup || []).some(Boolean);
  const lineupNames = hasStatsLineup
    ? match?.statsLineup || []
    : (match?.preCaudalLineup || []).some(Boolean)
      ? match.preCaudalLineup
      : [];

  const starters = Array.from({ length: 11 }, (_, index) => {
    const storedSlot = hasStatsLineup ? statsSlotsByIndex.get(index) : null;
    const storedPlayerId = storedSlot?.jugadorId ?? storedSlot?.jugador_id;
    const linkedById = storedPlayerId ? playersById.get(String(storedPlayerId)) : null;
    const name = storedSlot?.playerName ?? storedSlot?.player_name ?? lineupNames[index] ?? '';
    if (linkedById) return toPrintPlayer(linkedById, name);
    if (!name) return toPrintPlayer(null, 'Sin jugador asignado');
    return normalizePrintPlayerEntry(name, playersByName);
  });

  return { lineupNames, starters };
};

const getLineupBench = ({ match, players, starters, playersByName, playersById }) => {
  const starterNames = new Set(
    starters
      .map((player) => normalizeText(player.name))
      .filter((name) => name && !name.startsWith('puesto ') && name !== 'sin jugador asignado')
  );
  const rawCalledPlayers = match?.statsCalledPlayers?.length ? match.statsCalledPlayers : players;
  const calledPlayerIdsByName = new Map(Object.entries(match?.statsCalledPlayerIds || {})
    .map(([name, playerId]) => [normalizeText(name), playerId]));
  const calledPlayers = rawCalledPlayers
    .map((entry) => {
      const name = getPlayerNameFromEntry(entry);
      const entryPlayerId = typeof entry === 'object'
        ? entry?.jugadorId || entry?.jugador_id || entry?.playerId || entry?.player_id
        : '';
      const storedPlayerId = entryPlayerId || calledPlayerIdsByName.get(normalizeText(name));
      const linkedById = storedPlayerId ? playersById.get(String(storedPlayerId)) : null;
      return linkedById ? toPrintPlayer(linkedById, name) : normalizePrintPlayerEntry(entry, playersByName);
    })
    .filter((player) => normalizeText(player.name));

  const byName = new Map();
  calledPlayers.forEach((player) => {
    const key = normalizeText(player.name);
    if (!starterNames.has(key) && !byName.has(key)) byName.set(key, player);
  });

  return Array.from(byName.values());
};

export default function MatchPrintTab({
  match,
  matches = [],
  players = [],
  captainPriorities = [],
  onNavigateMatchSection,
  onMatchPlanDirtyChange,
  onMatchPlanNavigationGuardReady,
}) {
  const [printView, setPrintView] = useState('alineacion');
  const kit = getOwnPrintKitForMatch(match);
  const [setPieceTakers, setSetPieceTakers] = useState([]);
  const [setPieceLoading, setSetPieceLoading] = useState(false);
  const [setPieceSaving, setSetPieceSaving] = useState(false);
  const [setPieceError, setSetPieceError] = useState('');
  const [setPieceStatus, setSetPieceStatus] = useState('');
  const [offensiveType, setOffensiveType] = useState('corner_ofensivo');
  const [offensiveNotes, setOffensiveNotes] = useState([]);
  const [offensiveLoading, setOffensiveLoading] = useState(false);
  const [offensiveSaving, setOffensiveSaving] = useState(false);
  const [offensiveError, setOffensiveError] = useState('');
  const [offensiveStatus, setOffensiveStatus] = useState('');
  const [defensiveType, setDefensiveType] = useState('corner_defensivo');
  const [defensiveNotes, setDefensiveNotes] = useState([]);
  const [defensiveLoading, setDefensiveLoading] = useState(false);
  const [defensiveSaving, setDefensiveSaving] = useState(false);
  const [defensiveError, setDefensiveError] = useState('');
  const [defensiveStatus, setDefensiveStatus] = useState('');
  const [offensiveDiagramOrder, setOffensiveDiagramOrder] = useState(1);
  const [defensiveDiagramOrder, setDefensiveDiagramOrder] = useState(1);
  const [setPieceDiagrams, setSetPieceDiagrams] = useState([]);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [diagramSaving, setDiagramSaving] = useState(false);
  const [diagramError, setDiagramError] = useState('');
  const [diagramStatus, setDiagramStatus] = useState('');
  const [duplicateModal, setDuplicateModal] = useState(null);
  const [duplicateSourceId, setDuplicateSourceId] = useState('');
  const [duplicateMode, setDuplicateMode] = useState('add');
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState('');
  const [duplicateAdaptPlayers, setDuplicateAdaptPlayers] = useState(true);
  const [duplicateAnalysis, setDuplicateAnalysis] = useState(null);
  const [duplicateAnalysisLoading, setDuplicateAnalysisLoading] = useState(false);
  const [duplicateAnalysisError, setDuplicateAnalysisError] = useState('');
  const [libraryModal, setLibraryModal] = useState(null);
  const [libraryItems, setLibraryItems] = useState([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [printMode, setPrintMode] = useState('current');
  const [printValidationStatus, setPrintValidationStatus] = useState('');
  const [dossierPages, setDossierPages] = useState(() => buildDossierPagesFromPreset('matchday'));
  const [draggedDossierPageId, setDraggedDossierPageId] = useState('');
  const [matchPlanSituations, setMatchPlanSituations] = useState([]);
  const [selectedMatchPlanId, setSelectedMatchPlanId] = useState('');
  const [matchPlanLoading, setMatchPlanLoading] = useState(false);
  const [matchPlanSaving, setMatchPlanSaving] = useState(false);
  const [matchPlanError, setMatchPlanError] = useState('');
  const [matchPlanStatus, setMatchPlanStatus] = useState('');
  const [matchPlanDirty, setMatchPlanDirty] = useState(false);
  const sheetRef = useRef(null);
  const matchPlanEditVersionRef = useRef(0);
  const matchPlanSaveInFlightRef = useRef(null);
  const matchPlanMatchIdRef = useRef(match?.id || '');
  const matchPlanSituationsRef = useRef(matchPlanSituations);
  const matchPlanDirtyRef = useRef(matchPlanDirty);
  matchPlanMatchIdRef.current = match?.id || '';
  matchPlanSituationsRef.current = matchPlanSituations;
  matchPlanDirtyRef.current = matchPlanDirty;

  useEffect(() => {
    onMatchPlanDirtyChange?.(matchPlanDirty);
    return () => onMatchPlanDirtyChange?.(false);
  }, [matchPlanDirty, onMatchPlanDirtyChange]);
  useEffect(() => () => onMatchPlanNavigationGuardReady?.(null), [onMatchPlanNavigationGuardReady]);

  useEffect(() => {
    const includesSetPieces = ['all', 'offensive', 'defensive'].includes(duplicateModal);
    if (!includesSetPieces || !duplicateSourceId || !match?.id || duplicateSourceId === match.id) {
      setDuplicateAnalysis(null);
      setDuplicateAnalysisLoading(false);
      setDuplicateAnalysisError('');
      return undefined;
    }

    let cancelled = false;
    const analyzeDuplicate = async () => {
      setDuplicateAnalysis(null);
      setDuplicateAnalysisLoading(true);
      setDuplicateAnalysisError('');
      const types = duplicateModal === 'offensive'
        ? offensiveSetPieceTypes.map((item) => item.id)
        : duplicateModal === 'defensive'
          ? defensiveSetPieceTypes.map((item) => item.id)
          : [...offensiveSetPieceTypes, ...defensiveSetPieceTypes].map((item) => item.id);
      try {
        const [diagramsResponse, slotsResponse, matchesResponse] = await Promise.all([
          supabase.from('match_set_piece_diagrams').select('*').eq('partido_id', duplicateSourceId).in('tipo', types).order('orden', { ascending: true }),
          supabase.from('partido_alineacion_slots').select('partido_id,scope,slot,jugador_id,player_name').in('partido_id', [duplicateSourceId, match.id]).eq('scope', 'stats').order('slot', { ascending: true }),
          supabase.from('partidos').select('id,stats_system').in('id', [duplicateSourceId, match.id]),
        ]);
        const failed = [diagramsResponse, slotsResponse, matchesResponse].find((response) => response.error);
        if (failed?.error) throw failed.error;
        const slotRows = slotsResponse.data || [];
        const playerIds = [...new Set(slotRows.map((row) => row.jugador_id).filter(Boolean))];
        let storedPlayers = [];
        if (playerIds.length) {
          const { data, error } = await supabase.from('jugadores').select('*').in('id', playerIds);
          if (error) throw error;
          storedPlayers = data || [];
        }
        if (cancelled) return;
        const sourceMatch = (matchesResponse.data || []).find((item) => item.id === duplicateSourceId);
        const currentMatch = (matchesResponse.data || []).find((item) => item.id === match.id);
        const adaptationPlayers = [...players, ...storedPlayers];
        const analysis = buildSetPieceLineupAdaptation({
          diagrams: diagramsResponse.data || [],
          sourceSlots: slotRows.filter((row) => row.partido_id === duplicateSourceId),
          currentSlots: slotRows.filter((row) => row.partido_id === match.id),
          sourceSystem: sourceMatch?.stats_system || '',
          currentSystem: currentMatch?.stats_system || '',
          players: adaptationPlayers,
        });
        setDuplicateAnalysis({
          ...analysis,
          sourceId: duplicateSourceId,
          diagrams: diagramsResponse.data || [],
          players: adaptationPlayers,
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Error analizando la adaptación ABP al XI actual:', error);
        setDuplicateAnalysisError(error.message || 'No se pudo analizar la adaptación al XI actual.');
      } finally {
        if (!cancelled) setDuplicateAnalysisLoading(false);
      }
    };
    analyzeDuplicate();
    return () => { cancelled = true; };
  }, [duplicateModal, duplicateSourceId, match?.id, players]);

  useEffect(() => {
    if (!diagramStatus) return undefined;
    const timeoutId = window.setTimeout(() => setDiagramStatus(''), 3600);
    return () => window.clearTimeout(timeoutId);
  }, [diagramStatus]);

  useEffect(() => {
    const loadSetPieceTakers = async () => {
      if (!match?.id) return;
      setSetPieceLoading(true);
      setSetPieceError('');
      try {
        const { data, error } = await supabase
          .from('match_set_piece_takers')
          .select('*')
          .eq('partido_id', match.id)
          .order('tipo', { ascending: true })
          .order('orden', { ascending: true });
        if (error) throw error;
        setSetPieceTakers(data || []);
      } catch (loadError) {
        console.error('Error cargando lanzadores desde Supabase:', loadError);
        setSetPieceError(loadError.message || 'No se pudieron cargar los lanzadores.');
      } finally {
        setSetPieceLoading(false);
      }
    };
    loadSetPieceTakers();
  }, [match?.id]);

  useEffect(() => {
    const loadDiagrams = async () => {
      if (!match?.id) return;
      setDiagramLoading(true);
      setDiagramError('');
      try {
        const allTypes = [...offensiveSetPieceTypes, ...defensiveSetPieceTypes].map((item) => item.id);
        const { data, error } = await supabase
          .from('match_set_piece_diagrams')
          .select('*')
          .eq('partido_id', match.id)
          .in('tipo', allTypes)
          .order('tipo', { ascending: true })
          .order('orden', { ascending: true });
        if (error) throw error;
        setSetPieceDiagrams((data || []).map((diagram) => ({
          ...diagram,
          partido_id: match.id,
          elements: Array.isArray(diagram.elements) ? diagram.elements.filter((element) => element.type !== 'player_note') : [],
        })));
      } catch (loadError) {
        console.error('Error cargando diagramas ABP desde Supabase:', loadError);
        setDiagramError(loadError.message || 'No se pudieron cargar los diagramas ABP.');
      } finally {
        setDiagramLoading(false);
      }
    };
    loadDiagrams();
  }, [match?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadMatchId = match?.id;
    const loadMatchPlan = async () => {
      if (!loadMatchId) return;
      setMatchPlanLoading(true);
      setMatchPlanError('');
      setMatchPlanStatus('');
      setMatchPlanDirty(false);
      matchPlanDirtyRef.current = false;
      matchPlanEditVersionRef.current = 0;
      try {
        const { data, error } = await supabase
          .from('match_set_piece_diagrams')
          .select('*')
          .eq('partido_id', loadMatchId)
          .in('tipo', MATCH_PLAN_TYPE_VALUES)
          .order('orden', { ascending: true });
        if (error) throw error;
        if (cancelled || matchPlanMatchIdRef.current !== loadMatchId) return;
        const normalized = normalizeMatchPlanSituations((data || []).map((situation) => ({ ...situation, persisted: true })), loadMatchId);
        setMatchPlanSituations(normalized);
        setSelectedMatchPlanId(normalized[0]?.id || '');
      } catch (loadError) {
        if (cancelled || matchPlanMatchIdRef.current !== loadMatchId) return;
        console.error('Error cargando Plan de partido desde Supabase:', loadError);
        setMatchPlanError(loadError.message || 'No se pudo cargar el Plan de partido.');
      } finally {
        if (!cancelled && matchPlanMatchIdRef.current === loadMatchId) setMatchPlanLoading(false);
      }
    };
    loadMatchPlan();
    return () => { cancelled = true; };
  }, [match?.id]);

  useEffect(() => {
    const loadDefensiveNotes = async () => {
      if (!match?.id) return;
      setDefensiveLoading(true);
      setDefensiveError('');
      try {
        const { data, error } = await supabase
          .from('match_set_piece_notes')
          .select('*')
          .eq('partido_id', match.id)
          .in('tipo', defensiveSetPieceTypes.map((item) => item.id))
          .order('tipo', { ascending: true });
        if (error) throw error;
        const nextNotes = defensiveSetPieceTypes.map((type) => {
          const stored = (data || []).find((item) => item.tipo === type.id);
          const fallback = createDefaultDefensiveNote(type.id);
          return {
            ...fallback,
            ...(stored || {}),
            partido_id: match.id,
            roles: Array.isArray(stored?.roles) && stored.roles.length ? stored.roles : fallback.roles,
          };
        });
        setDefensiveNotes(nextNotes);
      } catch (loadError) {
        console.error('Error cargando ABP defensiva desde Supabase:', loadError);
        setDefensiveError(loadError.message || 'No se pudieron cargar las ABP defensivas.');
        setDefensiveNotes(defensiveSetPieceTypes.map((type) => ({ ...createDefaultDefensiveNote(type.id), partido_id: match.id })));
      } finally {
        setDefensiveLoading(false);
      }
    };
    loadDefensiveNotes();
  }, [match?.id]);

  useEffect(() => {
    const loadOffensiveNotes = async () => {
      if (!match?.id) return;
      setOffensiveLoading(true);
      setOffensiveError('');
      try {
        const { data, error } = await supabase
          .from('match_set_piece_notes')
          .select('*')
          .eq('partido_id', match.id)
          .in('tipo', offensiveSetPieceTypes.map((item) => item.id))
          .order('tipo', { ascending: true });
        if (error) throw error;
        const nextNotes = offensiveSetPieceTypes.map((type) => {
          const stored = (data || []).find((item) => item.tipo === type.id);
          const fallback = createDefaultOffensiveNote(type.id);
          return {
            ...fallback,
            ...(stored || {}),
            partido_id: match.id,
            roles: Array.isArray(stored?.roles) && stored.roles.length ? stored.roles : fallback.roles,
          };
        });
        setOffensiveNotes(nextNotes);
      } catch (loadError) {
        console.error('Error cargando ABP ofensiva desde Supabase:', loadError);
        setOffensiveError(loadError.message || 'No se pudieron cargar las ABP ofensivas.');
        setOffensiveNotes(offensiveSetPieceTypes.map((type) => ({ ...createDefaultOffensiveNote(type.id), partido_id: match.id })));
      } finally {
        setOffensiveLoading(false);
      }
    };
    loadOffensiveNotes();
  }, [match?.id]);

  const printData = useMemo(() => {
    const system = match?.statsSystem || match?.preCaudalSystem || '4-4-2';
    const byName = new Map(players.map((player) => [normalizeText(player.name), player]));
    const byId = new Map(players.map((player) => [String(player.id), player]));
    const { starters } = getLineupStarters({ match, playersByName: byName, playersById: byId });
    const captainResolution = resolveMatchCaptain({ match, players, captainPriorities });
    const printableCaptainPlayerId = captainResolution.isStarter ? captainResolution.playerId : '';
    const markedStarters = starters.map((player) => ({ ...player, isCaptain: Boolean(printableCaptainPlayerId && String(player.id) === String(printableCaptainPlayerId)) }));
    const bench = getLineupBench({ match, players, starters: markedStarters, playersByName: byName, playersById: byId })
      .map((player) => ({ ...player, isCaptain: false }));
    const coordinates = getFormationCoordinatesForSavedLineup(system);
    return { system, starters: markedStarters, bench, coordinates, captainPlayerId: printableCaptainPlayerId };
  }, [match, players, captainPriorities]);

  const professionalSetPieceSuggestions = useMemo(() => {
    const suggestions = [];
    const add = (text, source) => {
      const normalized = String(text || '').trim();
      if (normalized && !suggestions.some((item) => item.text === normalized)) suggestions.push({ text: normalized, source });
    };
    const rivalCornerEvidence = String(match?.preRivalCornersAgainst || '').trim();
    if (/zona/i.test(rivalCornerEvidence)) {
      add('El informe indica defensa zonal: valora fijar una zona y atacar la espalda del segundo escalón.', 'Informe rival · córners defensivos');
    } else if (/segundo palo/i.test(rivalCornerEvidence)) {
      add('El segundo palo aparece en el informe rival: valora una llegada liberada a esa zona.', 'Informe rival · córners defensivos');
    } else if (rivalCornerEvidence) {
      add(`Contrasta esta jugada con el dato registrado: ${rivalCornerEvidence}`, 'Informe rival · córners defensivos');
    }
    const planText = String(match?.abpOfensiva || match?.abpDefensiva || '').trim();
    if (planText) add(`Alinea la ficha con el plan de partido: ${planText}`, 'Plan de partido · ABP');
    const confirmedTaker = setPieceTakers
      .filter((entry) => entry.jugador_id || String(entry.nombre_manual || '').trim())
      .sort((a, b) => Number(a.orden) - Number(b.orden))[0];
    if (confirmedTaker) {
      const linkedPlayer = players.find((player) => player.id === confirmedTaker.jugador_id);
      const takerName = linkedPlayer ? getPlayerDisplayName(linkedPlayer) : confirmedTaker.nombre_manual;
      add(`${takerName} figura como lanzador prioritario; revisa si debe ser responsable principal de esta jugada.`, 'Lanzadores del partido');
    }
    const riskText = String(match?.prePlanAvoid || '').trim();
    if (riskText) add(`Ten en cuenta el riesgo global registrado: ${riskText}`, 'Plan de partido · evitar');
    return suggestions.slice(0, 4);
  }, [match, players, setPieceTakers]);

  const handlePreview = () => {
    sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrint = () => {
    setPrintMode('current');
    window.print();
  };

  const getDossierPage = (id) => dossierPages.find((page) => page.id === id);
  const isDossierPageActive = (id) => Boolean(getDossierPage(id)?.active);
  const activeDossierPages = dossierPages.filter((page) => page.active);

  const updateDossierPage = (id, fields) => {
    setDossierPages((current) => current.map((page) => (page.id === id ? { ...page, ...fields } : page)));
  };

  const moveDossierPage = (id, direction) => {
    setDossierPages((current) => {
      const index = current.findIndex((page) => page.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [page] = next.splice(index, 1);
      next.splice(nextIndex, 0, page);
      return next;
    });
  };

  const dropDossierPage = (targetId) => {
    if (!draggedDossierPageId || draggedDossierPageId === targetId) return;
    setDossierPages((current) => {
      const sourceIndex = current.findIndex((page) => page.id === draggedDossierPageId);
      const targetIndex = current.findIndex((page) => page.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [page] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, page);
      return next;
    });
    setDraggedDossierPageId('');
  };

  const getShortLines = (value, limit = 6) => String(value || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, limit);

  const getMatchKeys = () => [
    ...getShortLines(match?.planClave, 3),
    ...getShortLines(match?.planObjetivo, 2),
    ...getShortLines(match?.prePlanAdjustment, 2),
  ].filter(Boolean).slice(0, 3);

  const getMatchDayKeys = () => [
    ...getShortLines(match?.planClave, 3),
    ...getShortLines(match?.planObjetivo, 2),
    ...getShortLines(match?.planConBalon, 2),
    ...getShortLines(match?.planSinBalon, 2),
    ...getShortLines(match?.planTransiciones, 2),
    ...getShortLines(match?.prePlanAvoid, 2),
    ...getShortLines(match?.preKeyMatchupsTable, 2),
  ].filter(Boolean).slice(0, 6);

  const getStaffNotes = () => [
    ...getShortLines(match?.prePlanAvoid, 4),
    ...getShortLines(match?.preKeyMatchupsTable, 4),
    ...getShortLines(match?.planTransiciones, 4),
    ...getShortLines(match?.abpDefensiva, 3),
  ].filter(Boolean).slice(0, 10);

  const saveMatchPlanSituations = (situations) => {
    if (matchPlanSaveInFlightRef.current) return matchPlanSaveInFlightRef.current;
    const saveMatchId = match?.id;
    if (!saveMatchId) return Promise.resolve({ ok: false, error: new Error('No hay partido seleccionado.') });
    const saveVersion = matchPlanEditVersionRef.current;
    const snapshot = buildMatchPrintPlanSnapshot(situations || matchPlanSituationsRef.current, saveMatchId);
    setMatchPlanSaving(true);
    setMatchPlanError('');
    setMatchPlanStatus('');

    const operation = (async () => {
      const { data, error } = await supabase.rpc('save_match_print_plan_atomic', snapshot);
      if (error) throw error;
      if (matchPlanMatchIdRef.current !== saveMatchId) return { ok: true, stale: true };
      const next = normalizeMatchPlanSituations(
        (Array.isArray(data) ? data : []).map((situation) => ({ ...situation, persisted: true })),
        saveMatchId
      );
      if (matchPlanEditVersionRef.current === saveVersion) {
        setMatchPlanSituations(next);
        setSelectedMatchPlanId((current) => next.some((situation) => situation.id === current) ? current : next[0]?.id || '');
        setMatchPlanDirty(false);
        matchPlanDirtyRef.current = false;
        setMatchPlanStatus('Plan de partido guardado.');
      } else {
        setMatchPlanDirty(true);
        matchPlanDirtyRef.current = true;
        setMatchPlanStatus('Cambios pendientes.');
      }
      return { ok: true };
    })().catch((saveError) => {
      if (matchPlanMatchIdRef.current === saveMatchId) {
        console.error('Error guardando Plan de partido en Supabase:', saveError);
        setMatchPlanDirty(true);
        matchPlanDirtyRef.current = true;
        setMatchPlanError(saveError.message || 'No se pudo guardar el Plan de partido.');
      }
      return { ok: false, error: saveError };
    }).finally(() => {
      if (matchPlanSaveInFlightRef.current === operation) {
        matchPlanSaveInFlightRef.current = null;
        if (matchPlanMatchIdRef.current === saveMatchId) setMatchPlanSaving(false);
      }
    });
    matchPlanSaveInFlightRef.current = operation;
    return operation;
  };

  const updateMatchPlanSituations = (situations) => {
    matchPlanEditVersionRef.current += 1;
    setMatchPlanSituations(situations);
    setMatchPlanDirty(true);
    matchPlanDirtyRef.current = true;
    setMatchPlanError('');
    setMatchPlanStatus('');
  };

  const deleteMatchPlanSituation = (situation) => {
    if (!window.confirm(`¿Eliminar ${situation.titulo || 'esta situación táctica'}?`)) return;
    const next = normalizeMatchPlanSituations(matchPlanSituations.filter((item) => item.id !== situation.id), match.id);
    updateMatchPlanSituations(next);
    setSelectedMatchPlanId(next[0]?.id || '');
  };

  onMatchPlanNavigationGuardReady?.({
    hasPending: () => matchPlanDirtyRef.current || Boolean(matchPlanSaveInFlightRef.current),
    flush: async () => {
      while (matchPlanSaveInFlightRef.current || matchPlanDirtyRef.current) {
        const result = await (matchPlanSaveInFlightRef.current || saveMatchPlanSituations(matchPlanSituationsRef.current));
        if (!result.ok) return result;
      }
      return { ok: true };
    },
  });

  const getDossierContent = () => {
    const hasLineup = printData.starters.some((player) => player?.name && !String(player.name).startsWith('Puesto '));
    const hasTakers = setPieceTakers.some((entry) => entry.jugador_id || String(entry.nombre_manual || '').trim());
    const offensiveDiagrams = getDiagramsByTypes(offensiveSetPieceTypes.map((type) => type.id));
    const defensiveDiagrams = getDiagramsByTypes(defensiveSetPieceTypes.map((type) => type.id));
    const kickoffDiagrams = getKickoffDiagrams();
    const warnings = [];
    if (isDossierPageActive('lineup') && !hasLineup) warnings.push('Alineacion esta vacia.');
    if (isDossierPageActive('keys') && !getMatchDayKeys().length) warnings.push('Claves del partido esta vacio.');
    if (isDossierPageActive('takers') && !hasTakers) warnings.push('Lanzadores esta vacio.');
    if (isDossierPageActive('offensive') && !offensiveDiagrams.length) warnings.push('ABP Ofensiva no tiene jugadas.');
    if (isDossierPageActive('defensive') && !defensiveDiagrams.length) warnings.push('ABP Defensiva no tiene jugadas.');
    if (isDossierPageActive('kickoff') && !kickoffDiagrams.length) warnings.push('Saque de inicio esta marcado pero no existe diagrama.');
    if (isDossierPageActive('match_plan') && !matchPlanSituations.length) warnings.push('Plan de partido no tiene situaciones tácticas.');
    return {
      hasLineup,
      hasTakers,
      offensiveDiagrams,
      defensiveDiagrams,
      kickoffDiagrams,
      matchPlanSituations,
      warnings,
    };
  };

  const handlePrintDossier = () => {
    const dossierContent = getDossierContent();
    const printablePages = getDossierTotalPages(activeDossierPages, dossierContent);
    if (dossierContent.warnings.length) {
      setPrintValidationStatus(dossierContent.warnings.join(' '));
    } else {
      setPrintValidationStatus('');
    }
    if (!printablePages) {
      setPrintValidationStatus('No hay contenido real para imprimir en el dossier.');
      return;
    }
    setPrintMode('dossier');
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => setPrintMode('current'), 300);
    }, 80);
  };

  const mirrorDiagramElements = (elements, axis = 'horizontal') =>
    cleanDiagramElements(elements).map((element) => {
      if (element.type === 'tactical_meta') return element;
      if (['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow'].includes(element.type)) {
        return axis === 'horizontal'
          ? { ...element, x1: 100 - Number(element.x1 || 0), x2: 100 - Number(element.x2 || 0) }
          : { ...element, y1: 72 - Number(element.y1 || 0), y2: 72 - Number(element.y2 || 0) };
      }
      if (axis === 'horizontal') {
        const width = ['zone', 'text_box'].includes(element.type) ? Number(element.width || 0) : 0;
        return { ...element, x: Math.max(0, 100 - Number(element.x || 0) - width) };
      }
      const height = ['zone', 'text_box'].includes(element.type) ? Number(element.height || 0) : 0;
      return { ...element, y: Math.max(0, 72 - Number(element.y || 0) - height) };
    });

  const getTakerEntry = (type, order) =>
    setPieceTakers.find((entry) => entry.tipo === type && Number(entry.orden) === order) || {
      partido_id: match?.id,
      tipo: type,
      orden: order,
      jugador_id: '',
      nombre_manual: '',
    };

  const updateTakerEntry = (type, order, fields) => {
    setSetPieceStatus('');
    setSetPieceError('');
    setSetPieceTakers((current) => {
      const exists = current.some((entry) => entry.tipo === type && Number(entry.orden) === order);
      if (exists) {
        return current.map((entry) => (
          entry.tipo === type && Number(entry.orden) === order ? { ...entry, ...fields } : entry
        ));
      }
      return [...current, { partido_id: match?.id, tipo: type, orden: order, jugador_id: '', nombre_manual: '', ...fields }];
    });
  };

  const saveSetPieceTakers = async () => {
    if (!match?.id) return;
    setSetPieceSaving(true);
    setSetPieceError('');
    setSetPieceStatus('');
    try {
      const payload = setPieceSections.flatMap((section) => [1, 2, 3].map((order) => {
        const entry = getTakerEntry(section.id, order);
        return {
          partido_id: match.id,
          tipo: section.id,
          orden: order,
          jugador_id: entry.jugador_id || null,
          nombre_manual: entry.nombre_manual || null,
        };
      }));
      const { data, error } = await supabase
        .from('match_set_piece_takers')
        .upsert(payload, { onConflict: 'partido_id,tipo,orden' })
        .select('*');
      if (error) throw error;
      setSetPieceTakers(data || payload);
      setSetPieceStatus('Lanzadores guardados en Supabase.');
    } catch (saveError) {
      console.error('Error guardando lanzadores en Supabase:', saveError);
      setSetPieceError(saveError.message || 'No se pudieron guardar los lanzadores.');
    } finally {
      setSetPieceSaving(false);
    }
  };

  const getOffensiveNote = () =>
    offensiveNotes.find((note) => note.tipo === offensiveType) || {
      ...createDefaultOffensiveNote(offensiveType),
      partido_id: match?.id || '',
    };

  const updateOffensiveNote = (fields) => {
    setOffensiveStatus('');
    setOffensiveError('');
    setOffensiveNotes((current) => {
      const exists = current.some((note) => note.tipo === offensiveType);
      if (exists) {
        return current.map((note) => (note.tipo === offensiveType ? { ...note, ...fields } : note));
      }
      return [...current, { ...createDefaultOffensiveNote(offensiveType), partido_id: match?.id || '', ...fields }];
    });
  };

  const updateOffensiveRole = (index, fields) => {
    const note = getOffensiveNote();
    const roles = Array.isArray(note.roles) && note.roles.length ? note.roles : createDefaultOffensiveNote(offensiveType).roles;
    updateOffensiveNote({
      roles: roles.map((role, roleIndex) => (roleIndex === index ? { ...role, ...fields } : role)),
    });
  };

  const saveOffensiveNote = async () => {
    if (!match?.id) return;
    setOffensiveSaving(true);
    setOffensiveError('');
    setOffensiveStatus('');
    try {
      const note = getOffensiveNote();
      const payload = {
        partido_id: match.id,
        tipo: note.tipo,
        titulo: note.titulo || offensiveSetPieceTypes.find((item) => item.id === note.tipo)?.label || 'ABP ofensiva',
        descripcion: note.descripcion || '',
        roles: Array.isArray(note.roles) ? note.roles : [],
      };
      const { data, error } = await supabase
        .from('match_set_piece_notes')
        .upsert(payload, { onConflict: 'partido_id,tipo' })
        .select('*')
        .single();
      if (error) throw error;
      setOffensiveNotes((current) => {
        const exists = current.some((item) => item.tipo === data.tipo);
        return exists ? current.map((item) => (item.tipo === data.tipo ? data : item)) : [...current, data];
      });
      setOffensiveStatus('ABP ofensiva guardada en Supabase.');
    } catch (saveError) {
      console.error('Error guardando ABP ofensiva en Supabase:', saveError);
      setOffensiveError(saveError.message || 'No se pudo guardar la ABP ofensiva.');
    } finally {
      setOffensiveSaving(false);
    }
  };

  const getDefensiveNote = () =>
    defensiveNotes.find((note) => note.tipo === defensiveType) || {
      ...createDefaultDefensiveNote(defensiveType),
      partido_id: match?.id || '',
    };

  const updateDefensiveNote = (fields) => {
    setDefensiveStatus('');
    setDefensiveError('');
    setDefensiveNotes((current) => {
      const exists = current.some((note) => note.tipo === defensiveType);
      if (exists) {
        return current.map((note) => (note.tipo === defensiveType ? { ...note, ...fields } : note));
      }
      return [...current, { ...createDefaultDefensiveNote(defensiveType), partido_id: match?.id || '', ...fields }];
    });
  };

  const updateDefensiveRole = (index, fields) => {
    const note = getDefensiveNote();
    const roles = Array.isArray(note.roles) && note.roles.length ? note.roles : createDefaultDefensiveNote(defensiveType).roles;
    updateDefensiveNote({
      roles: roles.map((role, roleIndex) => (roleIndex === index ? { ...role, ...fields } : role)),
    });
  };

  const saveDefensiveNote = async () => {
    if (!match?.id) return;
    setDefensiveSaving(true);
    setDefensiveError('');
    setDefensiveStatus('');
    try {
      const note = getDefensiveNote();
      const payload = {
        partido_id: match.id,
        tipo: note.tipo,
        titulo: note.titulo || defensiveSetPieceTypes.find((item) => item.id === note.tipo)?.label || 'ABP defensiva',
        descripcion: note.descripcion || '',
        roles: Array.isArray(note.roles) ? note.roles : [],
      };
      const { data, error } = await supabase
        .from('match_set_piece_notes')
        .upsert(payload, { onConflict: 'partido_id,tipo' })
        .select('*')
        .single();
      if (error) throw error;
      setDefensiveNotes((current) => {
        const exists = current.some((item) => item.tipo === data.tipo);
        return exists ? current.map((item) => (item.tipo === data.tipo ? data : item)) : [...current, data];
      });
      setDefensiveStatus('ABP defensiva guardada en Supabase.');
    } catch (saveError) {
      console.error('Error guardando ABP defensiva en Supabase:', saveError);
      setDefensiveError(saveError.message || 'No se pudo guardar la ABP defensiva.');
    } finally {
      setDefensiveSaving(false);
    }
  };

  const getDiagramDefinitions = (mode) => (mode === 'offensive' ? offensiveSetPieceTypes : defensiveSetPieceTypes);
  const getDiagramType = (mode) => (mode === 'offensive' ? offensiveType : defensiveType);
  const getDiagramOrder = (mode) => (mode === 'offensive' ? offensiveDiagramOrder : defensiveDiagramOrder);

  const getCurrentDiagram = (mode) => {
    const definitions = getDiagramDefinitions(mode);
    const type = getDiagramType(mode);
    const order = getDiagramOrder(mode);
    return setPieceDiagrams.find((diagram) => diagram.tipo === type && Number(diagram.orden) === Number(order)) || {
      ...createDefaultDiagram(type, order, definitions),
      partido_id: match?.id || '',
    };
  };

  const getTypeDiagrams = (mode) => {
    const type = getDiagramType(mode);
    return setPieceDiagrams
      .filter((diagram) => diagram.tipo === type)
      .sort((a, b) => Number(a.orden) - Number(b.orden));
  };

  const getDiagramOrders = (mode) => getTypeDiagrams(mode).map((diagram) => Number(diagram.orden)).filter((order) => Number.isFinite(order));

  const getPrintDiagrams = (mode) => {
    return getTypeDiagrams(mode);
  };

  const getCurrentPrintPageDiagrams = (mode) => {
    const diagrams = getPrintDiagrams(mode);
    const order = getDiagramOrder(mode);
    const currentIndex = Math.max(0, diagrams.findIndex((diagram) => Number(diagram.orden) === Number(order)));
    const pageStart = Math.floor(currentIndex / 2) * 2;
    return diagrams.slice(pageStart, pageStart + 2);
  };

  const addDiagram = (mode) => {
    const definitions = getDiagramDefinitions(mode);
    const type = getDiagramType(mode);
    const nextOrder = Math.max(0, ...getDiagramOrders(mode)) + 1;
    const nextDiagram = { ...createDefaultDiagram(type, nextOrder, definitions), partido_id: match?.id || '' };
    setSetPieceDiagrams((current) => [...current, nextDiagram]);
    if (mode === 'offensive') setOffensiveDiagramOrder(nextOrder);
    else setDefensiveDiagramOrder(nextOrder);
  };

  const getDiagramsByTypes = (types) =>
    setPieceDiagrams
      .filter((diagram) => types.includes(diagram.tipo) && diagram.tipo !== 'saque_inicio_ofensivo')
      .sort((a, b) => String(a.tipo).localeCompare(String(b.tipo)) || Number(a.orden) - Number(b.orden));

  const getKickoffDiagrams = () =>
    setPieceDiagrams
      .filter((diagram) => diagram.tipo === 'saque_inicio_ofensivo')
      .sort((a, b) => Number(a.orden) - Number(b.orden));

  const chunkDiagrams = (diagrams, size = 2) => {
    const chunks = [];
    for (let index = 0; index < diagrams.length; index += size) chunks.push(diagrams.slice(index, index + size));
    return chunks;
  };

  const cleanDiagramElements = (elements) =>
    (Array.isArray(elements) ? elements : []).filter((element) => element.type !== 'player_note');

  const updateCurrentDiagram = (mode, nextDiagram) => {
    setDiagramStatus('');
    setDiagramError('');
    const type = getDiagramType(mode);
    const order = getDiagramOrder(mode);
    setSetPieceDiagrams((current) => {
      const exists = current.some((diagram) => diagram.tipo === type && Number(diagram.orden) === Number(order));
      const normalized = { ...nextDiagram, partido_id: match?.id || '', tipo: type, orden: order };
      return exists
        ? current.map((diagram) => (diagram.tipo === type && Number(diagram.orden) === Number(order) ? normalized : diagram))
        : [...current, normalized];
    });
  };

  const saveCurrentDiagram = async (mode) => {
    if (!match?.id) return;
    setDiagramSaving(true);
    setDiagramError('');
    setDiagramStatus('');
    try {
      const diagram = getCurrentDiagram(mode);
      const payload = {
        partido_id: match.id,
        tipo: diagram.tipo,
        orden: Number(diagram.orden) || 1,
        titulo: diagram.titulo || '',
        consigna: diagram.consigna || '',
        elements: cleanDiagramElements(diagram.elements),
      };
      const { data, error } = await supabase
        .from('match_set_piece_diagrams')
        .upsert(payload, { onConflict: 'partido_id,tipo,orden' })
        .select('*')
        .single();
      if (error) throw error;
      setSetPieceDiagrams((current) => {
        const exists = current.some((item) => item.tipo === data.tipo && Number(item.orden) === Number(data.orden));
        return exists
          ? current.map((item) => (item.tipo === data.tipo && Number(item.orden) === Number(data.orden) ? data : item))
          : [...current, data];
      });
      setDiagramStatus('Diagrama ABP guardado en Supabase.');
    } catch (saveError) {
      console.error('Error guardando diagrama ABP en Supabase:', saveError);
      setDiagramError(saveError.message || 'No se pudo guardar el diagrama ABP.');
    } finally {
      setDiagramSaving(false);
    }
  };

  const duplicateCurrentDiagram = async (mode) => {
    if (!match?.id) return;
    setDiagramSaving(true);
    setDiagramError('');
    setDiagramStatus('');
    try {
      const source = getCurrentDiagram(mode);
      const type = getDiagramType(mode);
      const definitions = getDiagramDefinitions(mode);
      const usedOrders = setPieceDiagrams
        .filter((diagram) => diagram.tipo === type)
        .map((diagram) => Number(diagram.orden))
        .filter((order) => Number.isFinite(order));
      const nextOrder = Math.max(0, ...usedOrders) + 1;
      const baseTitle = source.titulo || definitions.find((item) => item.id === type)?.label || 'ABP';
      const payload = {
        partido_id: match.id,
        tipo: type,
        orden: nextOrder,
        titulo: baseTitle,
        consigna: source.consigna || '',
        elements: cloneSetPieceElementsWithFreshIds(cleanDiagramElements(source.elements)),
      };
      const { data, error } = await supabase
        .from('match_set_piece_diagrams')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      setSetPieceDiagrams((current) => [...current, data]);
      if (mode === 'offensive') setOffensiveDiagramOrder(Number(data.orden));
      else setDefensiveDiagramOrder(Number(data.orden));
      setDiagramStatus(`Jugada duplicada como ${data.titulo || `Jugada ${data.orden}`}.`);
    } catch (duplicateError) {
      console.error('Error duplicando diagrama ABP en Supabase:', duplicateError);
      setDiagramError(duplicateError.message || 'No se pudo duplicar la jugada.');
    } finally {
      setDiagramSaving(false);
    }
  };

  const mirrorCurrentDiagram = (mode, axis) => {
    const current = getCurrentDiagram(mode);
    if (!current) return;
    updateCurrentDiagram(mode, {
      ...current,
      elements: mirrorDiagramElements(current.elements, axis),
      consigna: current.consigna || (axis === 'horizontal' ? 'Jugada espejada horizontalmente.' : 'Jugada espejada verticalmente.'),
    });
    setDiagramStatus(axis === 'horizontal' ? 'Jugada espejada horizontalmente. Pulsa Guardar jugada para sincronizar.' : 'Jugada espejada verticalmente. Pulsa Guardar jugada para sincronizar.');
  };

  const deleteCurrentDiagram = async (mode) => {
    const source = getCurrentDiagram(mode);
    const type = getDiagramType(mode);
    if (!source?.tipo) return;
    setDiagramSaving(true);
    setDiagramError('');
    setDiagramStatus('');
    try {
      const isPersisted = Boolean(source.id);
      if (match?.id && isPersisted) {
        const { error } = await supabase
          .from('match_set_piece_diagrams')
          .delete()
          .eq('id', source.id)
          .eq('partido_id', match.id);
        if (error) throw error;
      }
      const remaining = setPieceDiagrams
        .filter((diagram) => !(diagram.tipo === source.tipo && Number(diagram.orden) === Number(source.orden)))
        .sort((a, b) => Number(a.orden) - Number(b.orden));
      const sameType = remaining.filter((diagram) => diagram.tipo === type);
      setSetPieceDiagrams(remaining);
      const nextOrder = sameType.find((diagram) => Number(diagram.orden) > Number(source.orden))?.orden
        || sameType.at(-1)?.orden
        || 1;
      if (mode === 'offensive') setOffensiveDiagramOrder(nextOrder);
      else setDefensiveDiagramOrder(nextOrder);
      setDiagramStatus('Jugada eliminada.');
    } catch (error) {
      console.error('Error eliminando jugada ABP:', error);
      setDiagramError(error.message || 'No se pudo eliminar la jugada.');
    } finally {
      setDiagramSaving(false);
    }
  };

  const openLibraryModal = async (mode) => {
    setLibraryModal(mode);
    setLibrarySearch('');
    setLibraryError('');
    setLibraryLoading(true);
    try {
      const { data, error } = await supabase
        .from('training_library')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const phase = mode === 'offensive' ? SET_PIECE_PHASES.OFFENSIVE : SET_PIECE_PHASES.DEFENSIVE;
      setLibraryItems((data || []).filter(isSetPieceLibraryItem).filter((item) => getSetPiecePhase(item) === phase));
    } catch (error) {
      console.error('Error cargando biblioteca desde Supabase:', error);
      setLibraryError(error.message || 'No se pudo cargar la biblioteca.');
      setLibraryItems([]);
    } finally {
      setLibraryLoading(false);
    }
  };

  const saveCurrentDiagramToLibrary = async (mode) => {
    setDiagramSaving(true);
    setDiagramError('');
    setDiagramStatus('');
    try {
      const diagram = getCurrentDiagram(mode);
      const tacticalMeta = getSetPieceTacticalMeta(diagram.elements);
      const category = mode === 'offensive' ? 'ABP Ofensiva' : 'ABP Defensiva';
      const label = getDiagramDefinitions(mode).find((item) => item.id === diagram.tipo)?.label || category;
      const payload = {
        nombre: diagram.titulo || `${label} ${diagram.orden || 1}`,
        tipo: diagram.tipo,
        categoria: category,
        descripcion: tacticalMeta.generalInstruction || diagram.consigna || '',
        objetivo: tacticalMeta.objective || '',
        variantes: tacticalMeta.alternative || '',
        dimensiones: '',
        jugadores: '',
        duracion: '',
        material: '',
        elements: cleanDiagramElements(diagram.elements),
      };
      const { error } = await supabase.from('training_library').insert(payload);
      if (error) throw error;
      setDiagramStatus('Jugada guardada en biblioteca.');
    } catch (error) {
      console.error('Error guardando jugada en biblioteca:', error);
      setDiagramError(error.message || 'No se pudo guardar en biblioteca.');
    } finally {
      setDiagramSaving(false);
    }
  };

  const loadLibraryItemIntoDiagram = async (item) => {
    if (!libraryModal) return;
    const current = getCurrentDiagram(libraryModal);
    const storedMeta = getSetPieceTacticalMeta(item.elements);
    const lastUsedAt = new Date().toISOString();
    const importedMeta = {
      ...storedMeta,
      objective: storedMeta.objective || item.objetivo || '',
      generalInstruction: storedMeta.generalInstruction || item.descripcion || '',
      alternative: storedMeta.alternative || item.variantes || '',
      lastUsedAt,
      libraryId: String(item.id || ''),
      libraryVersion: String(item.updated_at || item.version || '1'),
      importedAt: lastUsedAt,
      linkStatus: 'linked',
    };
    const libraryElements = setSetPieceTacticalMeta(
      cloneSetPieceElementsWithFreshIds(cleanDiagramElements(item.elements)),
      importedMeta
    );
    const storedClassification = getSetPieceLabType(item.tipo);
    const expectedPhase = libraryModal === 'offensive' ? SET_PIECE_PHASES.OFFENSIVE : SET_PIECE_PHASES.DEFENSIVE;
    updateCurrentDiagram(libraryModal, {
      ...current,
      tipo: storedClassification.phase === expectedPhase ? storedClassification.id : current.tipo,
      titulo: item.nombre || current.titulo,
      consigna: item.descripcion || item.objetivo || current.consigna || '',
      elements: libraryElements,
    });
    setDiagramStatus(`Cargado desde biblioteca: ${item.nombre}. Guarda la jugada para sincronizarla con el partido.`);
    setLibraryModal(null);
  };

  const addDefensiveQuickElement = (label) => {
    const current = getCurrentDiagram('defensive');
    const presets = {
      marca_individual: {
        type: 'text_box',
        x: 60,
        y: 8,
        width: 34,
        height: 34,
        label: 'MARCA INDIVIDUAL:\nALBUQUERQUE:\nM. NOYA:\nAGUS PORTO:\nTRABANCO:\nO. OLADIPUPO:\n*BORJA RGUEZ*:',
      },
      posibles_rematadores: {
        type: 'text_box',
        x: 60,
        y: 44,
        width: 28,
        height: 22,
        label: 'POSIBLES REMATADORES\nSAID\nDIEGO\nMUNDAKA\nMARISCAL',
      },
      rechace: { type: 'text_box', x: 62, y: 42, width: 24, height: 12, label: 'RECHACE' },
      rechace_corto: { type: 'text_box', x: 58, y: 38, width: 30, height: 14, label: 'RECHACE Y CORTO' },
      marca_rechace: { type: 'text_box', x: 58, y: 24, width: 30, height: 14, label: 'MARCA Y RECHACE' },
      zona_defensiva: { type: 'zone', x: 34, y: 18, width: 28, height: 16, label: 'ZONA DEFENSIVA' },
    };
    const preset = presets[label] || { type: 'text_box', x: 50, y: 18, width: 24, height: 12, label: label.toUpperCase() };
    const nextElements = [
      ...cleanDiagramElements(current.elements),
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...preset,
      },
    ];
    updateCurrentDiagram('defensive', { ...current, elements: nextElements });
  };

  const filteredLibraryItems = libraryItems.filter((item) => {
    const query = librarySearch.trim().toLowerCase();
    if (!query) return true;
    return [item.nombre, item.categoria, item.tipo, item.descripcion, item.objetivo]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  const openDuplicateModal = (kind) => {
    setDuplicateModal(kind);
    setDuplicateSourceId('');
    setDuplicateMode(kind === 'lineup' || kind === 'takers' ? 'replace' : 'add');
    setDuplicateMessage('');
    setDuplicateAdaptPlayers(true);
    setDuplicateAnalysis(null);
    setDuplicateAnalysisError('');
    setDiagramError('');
  };

  const copyRows = async ({ table, sourceId, targetId, columns, conflict, replace = false, filter }) => {
    let query = supabase.from(table).select('*').eq('partido_id', sourceId);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw error;
    if (replace) {
      let deleteQuery = supabase.from(table).delete().eq('partido_id', targetId);
      if (filter) deleteQuery = filter(deleteQuery);
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;
    }
    if (!data?.length) return [];
    const rows = data.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))).map((row) => ({ ...row, partido_id: targetId }));
    const request = conflict
      ? supabase.from(table).upsert(rows, { onConflict: conflict }).select('*')
      : supabase.from(table).insert(rows).select('*');
    const { data: inserted, error: insertError } = await request;
    if (insertError) throw insertError;
    return inserted || rows;
  };

  const copyDiagrams = async ({ sourceId, targetId, mode, replace, sourceDiagrams = null, adaptation = null }) => {
    const types = mode === 'offensive'
      ? offensiveSetPieceTypes.map((item) => item.id)
      : mode === 'defensive'
        ? defensiveSetPieceTypes.map((item) => item.id)
        : [...offensiveSetPieceTypes, ...defensiveSetPieceTypes].map((item) => item.id);
    let data = Array.isArray(sourceDiagrams) ? sourceDiagrams.filter((diagram) => types.includes(diagram.tipo)) : sourceDiagrams;
    if (!Array.isArray(data)) {
      const response = await supabase.from('match_set_piece_diagrams').select('*').eq('partido_id', sourceId).in('tipo', types).order('orden', { ascending: true });
      if (response.error) throw response.error;
      data = response.data;
    }
    if (replace) {
      const { error: deleteError } = await supabase.from('match_set_piece_diagrams').delete().eq('partido_id', targetId).in('tipo', types);
      if (deleteError) throw deleteError;
    }
    if (!data?.length) return [];
    const existing = replace ? [] : (setPieceDiagrams.filter((diagram) => types.includes(diagram.tipo)) || []);
    const nextByType = new Map();
    existing.forEach((diagram) => {
      nextByType.set(diagram.tipo, Math.max(nextByType.get(diagram.tipo) || 0, Number(diagram.orden) || 0));
    });
    const rows = data.map((diagram) => {
      const nextOrder = replace ? Number(diagram.orden) || 1 : (nextByType.get(diagram.tipo) || 0) + 1;
      nextByType.set(diagram.tipo, nextOrder);
      return duplicateMatchSetPiece({
        source: diagram,
        targetMatchId: targetId,
        order: nextOrder,
        elements: adaptation?.canAdapt
          ? applySetPieceLineupAdaptation(diagram.elements, adaptation, adaptation.players || players)
          : cleanDiagramElements(diagram.elements),
      });
    });
    const { data: inserted, error: insertError } = await supabase.from('match_set_piece_diagrams').upsert(rows, { onConflict: 'partido_id,tipo,orden' }).select('*');
    if (insertError) throw insertError;
    setSetPieceDiagrams((current) => replace
      ? [...current.filter((diagram) => !types.includes(diagram.tipo)), ...(inserted || rows)]
      : [...current, ...(inserted || rows)]);
    return inserted || rows;
  };

  const copyLineupFromMatch = async ({ sourceId, targetId, replace }) => {
    const { data: sourceMatch, error: matchError } = await supabase
      .from('partidos')
      .select('pre_caudal_system,stats_system')
      .eq('id', sourceId)
      .single();
    if (matchError) throw matchError;
    const { error: updateError } = await supabase
      .from('partidos')
      .update({ pre_caudal_system: sourceMatch.pre_caudal_system || '4-4-2', stats_system: sourceMatch.stats_system || sourceMatch.pre_caudal_system || '4-4-2' })
      .eq('id', targetId);
    if (updateError) throw updateError;
    await copyRows({
      table: 'partido_alineacion_slots',
      sourceId,
      targetId,
      columns: ['scope', 'slot', 'player_name', 'jugador_id', 'jugador_rival_id'],
      conflict: 'partido_id,scope,slot',
      replace,
      filter: (query) => query.in('scope', ['pre_caudal', 'stats']),
    });
    await copyRows({
      table: 'partido_convocados',
      sourceId,
      targetId,
      columns: ['jugador_id', 'player_name'],
      conflict: 'partido_id,player_name',
      replace,
    });
  };

  const copyTakersFromMatch = async ({ sourceId, targetId, replace }) => {
    const rows = await copyRows({
      table: 'match_set_piece_takers',
      sourceId,
      targetId,
      columns: ['tipo', 'orden', 'jugador_id', 'nombre_manual'],
      conflict: 'partido_id,tipo,orden',
      replace,
    });
    setSetPieceTakers(rows);
  };

  const runDuplicateImport = async ({ adaptPlayers = duplicateAdaptPlayers } = {}) => {
    if (!match?.id || !duplicateSourceId || duplicateSourceId === match.id) return;
    const includesSetPieces = ['all', 'offensive', 'defensive'].includes(duplicateModal);
    if (adaptPlayers && includesSetPieces && (duplicateAnalysisLoading || !duplicateAnalysis || duplicateAnalysis.sourceId !== duplicateSourceId)) return;
    const replace = duplicateMode === 'replace';
    setDuplicateBusy(true);
    setDuplicateMessage('');
    setDiagramError('');
    try {
      const preserveCurrentRealLineup = adaptPlayers && includesSetPieces;
      if (duplicateModal === 'lineup' || (duplicateModal === 'all' && !preserveCurrentRealLineup)) await copyLineupFromMatch({ sourceId: duplicateSourceId, targetId: match.id, replace: true });
      if (duplicateModal === 'takers' || duplicateModal === 'all') await copyTakersFromMatch({ sourceId: duplicateSourceId, targetId: match.id, replace: true });
      const sourceDiagrams = duplicateAnalysis?.sourceId === duplicateSourceId ? duplicateAnalysis.diagrams : null;
      const adaptation = adaptPlayers && duplicateAnalysis?.sourceId === duplicateSourceId ? duplicateAnalysis : null;
      if (duplicateModal === 'offensive' || duplicateModal === 'all') await copyDiagrams({ sourceId: duplicateSourceId, targetId: match.id, mode: 'offensive', replace, sourceDiagrams, adaptation });
      if (duplicateModal === 'defensive' || duplicateModal === 'all') await copyDiagrams({ sourceId: duplicateSourceId, targetId: match.id, mode: 'defensive', replace, sourceDiagrams, adaptation });
      if (adaptPlayers && includesSetPieces && !duplicateAnalysis.canAdapt) {
        setDuplicateMessage(`Preparación duplicada sin sustituciones. ${duplicateAnalysis.message}`);
      } else if (adaptPlayers && includesSetPieces) {
        const reviewText = duplicateAnalysis.manualReviewCount ? ` ${duplicateAnalysis.manualReviewCount} jugador(es) quedan para revisión manual.` : '';
        const lineupText = duplicateModal === 'all' ? ' Se ha conservado el XI real del partido actual.' : '';
        setDuplicateMessage(`Preparación duplicada y adaptada.${reviewText}${lineupText}`);
      } else {
        setDuplicateMessage('Preparación duplicada correctamente.');
      }
    } catch (error) {
      console.error('Error duplicando preparación desde otro partido:', error);
      setDiagramError(error.message || 'No se pudo duplicar la preparación.');
    } finally {
      setDuplicateBusy(false);
    }
  };

  const currentOffensiveNote = getOffensiveNote();
  const currentDefensiveNote = getDefensiveNote();
  const printTitle = printView === 'alineacion' ? 'Alineación' : printView === 'lanzadores' ? 'Lanzadores' : printView === 'abp_ofensiva' ? 'ABP ofensiva' : printView === 'plan_partido' ? 'Plan de partido' : 'ABP defensiva';

  const dossierContent = getDossierContent();
  const activeSheetCount = getDossierTotalPages(activeDossierPages, dossierContent);
  const activeReadMinutes = Math.max(1, Math.ceil(activeSheetCount * 1.3));
  const dossierDensity = activeSheetCount >= 9 ? 'dossier denso' : activeSheetCount >= 5 ? 'dossier operativo' : 'dossier express';
  const densityAdvice = activeSheetCount >= 9 ? 'lectura rapida no recomendada' : activeSheetCount >= 5 ? 'listo para staff' : 'ideal para charla corta';
  const formatLastEdit = (value) => {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';
    const diffHours = Math.max(0, Math.round((Date.now() - date.getTime()) / 36e5));
    if (diffHours < 1) return 'editado hace menos de 1h';
    if (diffHours < 24) return `editado hace ${diffHours}h`;
    const diffDays = Math.round(diffHours / 24);
    return diffDays === 1 ? 'editado ayer' : `editado hace ${diffDays} dias`;
  };

  const latestTimestamp = (items = []) => {
    const timestamps = items
      .map((item) => item?.updated_at || item?.created_at || item?.updatedAt || item?.createdAt)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));
    if (!timestamps.length) return match?.updated_at || match?.updatedAt || match?.date || '';
    return new Date(Math.max(...timestamps)).toISOString();
  };

  const getPageSheetCount = (page) => {
    return getDossierPageContribution(page.id, dossierContent);
  };

  const getDossierPageStatus = (page) => {
    const lineCount = (value, limit = 20) => getShortLines(value, limit).length;
    const realStarters = printData.starters.filter((player) => player?.name && !String(player.name).startsWith('Puesto ')).length;
    const takers = setPieceTakers.filter((entry) => entry.jugador_id || String(entry.nombre_manual || '').trim()).length;
    const pressureLines = lineCount(match?.prePlanTrigger) + lineCount(match?.planSinBalon) + lineCount(match?.preRivalPressure);
    const vigilanceLines = lineCount(match?.preKeyMatchupsTable) + lineCount(match?.prePlanAvoid) + lineCount(match?.preRivalStrengths);
    const transitionLines = lineCount(match?.planTransiciones) + lineCount(match?.planConBalon);
    const talkLines = getMatchKeys().length + getStaffNotes().length;
    const staffLines = getStaffNotes().length;
    const rivalFields = [match?.preRivalSystem, match?.preRivalDefensiveBlock, match?.preRivalPressure, match?.preRivalStrengths, match?.preRivalWeaknesses].filter(Boolean).length;
    const kickoffCount = dossierContent.kickoffDiagrams.length;
    const offensiveCount = dossierContent.offensiveDiagrams.length;
    const defensiveCount = dossierContent.defensiveDiagrams.length;
    const matchPlanCount = dossierContent.matchPlanSituations.length;
    const config = {
      lineup: { count: realStarters, target: 11, noun: `${realStarters}/11 jugadores`, last: match?.updated_at || match?.updatedAt || match?.date },
      keys: { count: getMatchDayKeys().length, target: 4, noun: `${getMatchDayKeys().length} claves`, last: match?.updated_at || match?.updatedAt || match?.date },
      talk: { count: talkLines, target: 5, noun: `${Math.min(talkLines, 5)} claves/notas`, last: match?.updated_at || match?.updatedAt || match?.date },
      takers: { count: takers, target: 4, noun: `${takers} lanzadores`, last: latestTimestamp(setPieceTakers) },
      offensive: { count: offensiveCount, target: 1, noun: `${offensiveCount} jugadas`, last: latestTimestamp(dossierContent.offensiveDiagrams) },
      defensive: { count: defensiveCount, target: 1, noun: `${defensiveCount} jugadas`, last: latestTimestamp(dossierContent.defensiveDiagrams) },
      kickoff: { count: kickoffCount, target: 1, noun: `${kickoffCount} jugadas`, last: latestTimestamp(dossierContent.kickoffDiagrams) },
      match_plan: { count: matchPlanCount, target: 2, noun: `${matchPlanCount} situaciones`, last: latestTimestamp(dossierContent.matchPlanSituations) },
      pressure: { count: pressureLines, target: 3, noun: `${pressureLines} apuntes`, last: match?.updated_at || match?.updatedAt || match?.date },
      vigilances: { count: vigilanceLines, target: 3, noun: `${vigilanceLines} vigilancias`, last: match?.updated_at || match?.updatedAt || match?.date },
      transitions: { count: transitionLines, target: 2, noun: `${transitionLines} consignas`, last: match?.updated_at || match?.updatedAt || match?.date },
      halftime: { count: 1, target: 1, noun: 'plantilla preparada', last: match?.updated_at || match?.updatedAt || match?.date },
      rival: { count: rivalFields, target: 4, noun: `${rivalFields} datos scouting`, last: match?.updated_at || match?.updatedAt || match?.date },
      staff: { count: staffLines, target: 4, noun: `${staffLines} notas`, last: match?.updated_at || match?.updatedAt || match?.date },
    }[page.id] || { count: 0, target: 1, noun: 'Sin contenido todavia', last: '' };
    const completion = Math.max(0, Math.min(100, Math.round((config.count / Math.max(1, config.target)) * 100)));
    const empty = config.count <= 0;
    return {
      ...config,
      completion,
      empty,
      label: empty ? 'Sin contenido todavia' : config.noun,
      status: empty ? 'Pendiente' : completion >= 100 ? 'Listo' : 'Parcial',
      pages: getPageSheetCount(page),
      lastEdited: formatLastEdit(config.last),
    };
  };

  const getPageTargetView = (pageId) => {
    if (pageId === 'takers') return 'lanzadores';
    if (pageId === 'offensive' || pageId === 'kickoff') return 'abp_ofensiva';
    if (pageId === 'defensive') return 'abp_defensiva';
    if (pageId === 'match_plan') return 'plan_partido';
    return 'alineacion';
  };

  const scrollToPrintWorkspace = () => {
    window.setTimeout(() => {
      document.querySelector('[data-print-workspace="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const handleDossierPageAction = (page, action) => {
    updateDossierPage(page.id, { active: true });
    if (action === 'preview') {
      handlePreview();
      return;
    }
    if (page.id === 'kickoff') setOffensiveType('saque_inicio_ofensivo');
    if (['lineup', 'takers', 'offensive', 'defensive', 'kickoff', 'match_plan'].includes(page.id)) {
      setPrintView(getPageTargetView(page.id));
      scrollToPrintWorkspace();
      return;
    }
    if (page.id === 'halftime') {
      onNavigateMatchSection?.('POST');
      return;
    }
    onNavigateMatchSection?.('PRE');
  };

  const dossierSheets = activeDossierPages.flatMap((page) => {
    const pageNumber = getDossierStartPageNumber(activeDossierPages, page.id, dossierContent);
    if (page.id === 'lineup') {
      return dossierContent.hasLineup ? [(
        <LineupPrintSheet
          key="lineup-dossier"
          match={match}
          starters={printData.starters}
          bench={printData.bench}
          coordinates={printData.coordinates}
          system={printData.system}
          kit={kit}
          captainPlayerId={printData.captainPlayerId}
        />
      )] : [];
    }
    if (page.id === 'takers') {
      return dossierContent.hasTakers ? [(
        <SetPieceTakersPrintSheet key="takers-dossier" match={match} sections={setPieceSections} takers={setPieceTakers} players={players} />
      )] : [];
    }
    if (page.id === 'offensive') {
      return chunkDiagrams(dossierContent.offensiveDiagrams).map((diagrams, index) => (
        <SetPieceDiagramPrintSheet key={`offensive-dossier-${index}`} match={match} title="ABP ofensiva" diagrams={diagrams} players={players} totalPlayCount={dossierContent.offensiveDiagrams.length} />
      ));
    }
    if (page.id === 'defensive') {
      return chunkDiagrams(dossierContent.defensiveDiagrams).map((diagrams, index) => (
        <SetPieceDiagramPrintSheet key={`defensive-dossier-${index}`} match={match} title="ABP defensiva" diagrams={diagrams} players={players} totalPlayCount={dossierContent.defensiveDiagrams.length} />
      ));
    }
    if (page.id === 'kickoff') {
      return chunkDiagrams(dossierContent.kickoffDiagrams).map((diagrams, index) => (
        <SetPieceDiagramPrintSheet key={`kickoff-dossier-${index}`} match={match} title="Saque de inicio" diagrams={diagrams} players={players} totalPlayCount={dossierContent.kickoffDiagrams.length} />
      ));
    }
    if (page.id === 'match_plan') {
      return dossierContent.matchPlanSituations.length ? [(
        <MatchPlanPrintSheet key="match-plan-dossier" match={match} situations={dossierContent.matchPlanSituations} />
      )] : [];
    }
    return [(
      <DossierTacticalSheet
        key={`${page.id}-dossier`}
        match={match}
        pageId={page.id}
        dossierType="Dossier"
        keys={page.id === 'keys' ? getMatchDayKeys() : getMatchKeys()}
        staffNotes={getStaffNotes()}
        pageNumber={pageNumber}
        totalPages={activeSheetCount}
      />
    )];
  });

  const dossierPrintPortal = printMode === 'dossier' && typeof document !== 'undefined'
    ? createPortal(
      <section className="printing-dossier print-dossier-portal" aria-label="Dossier imprimible">
        <div className="print-dossier">{dossierSheets}</div>
      </section>,
      document.body
    )
    : null;

  return (
    <section className="match-print-tab space-y-6">
      <div className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Impresión</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Dossier de partido</h3>
            <p className="mt-2 text-sm text-slate-400">Selecciona lo importante y genera un PDF limpio en 30 segundos.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={() => openDuplicateModal('all')} className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/15">
              Duplicar preparación desde otro partido
            </button>
            <button type="button" onClick={handlePreview} className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/15">
              Vista previa
            </button>
            <button type="button" onClick={handlePrintDossier} className="rounded-2xl bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-slate-100">
              Imprimir PDF
            </button>
          </div>
        </div>
        <div className="mt-5 rounded-3xl border border-white/5 bg-black/20 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Hojas para imprimir</p>
              <p className="mt-1 text-sm text-slate-400">Activa, ordena y edita solo lo necesario. {activeDossierPages.length} bloques activos · {activeSheetCount} hojas · {activeReadMinutes} min lectura.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white">{activeSheetCount} hojas · {dossierDensity}</p>
              <p className={`mt-1 text-xs font-semibold ${activeSheetCount >= 9 ? 'text-amber-100' : 'text-slate-400'}`}>{densityAdvice}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dossierPages.map((page, index) => {
              const pageStatus = getDossierPageStatus(page);
              return (
              <div
                key={page.id}
                draggable
                onDragStart={() => setDraggedDossierPageId(page.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropDossierPage(page.id)}
                className={`rounded-2xl border p-3 text-xs font-bold transition ${page.active ? 'border-caudal-electric/30 bg-caudal-electric/10 text-white' : 'border-white/10 bg-white/[0.035] text-slate-400'} ${draggedDossierPageId === page.id ? 'opacity-60 ring-2 ring-caudal-electric' : ''}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-black/25 text-[10px] font-black text-white">{index + 1}</span>
                <input
                  type="checkbox"
                  checked={Boolean(page.active)}
                  onChange={(event) => updateDossierPage(page.id, { active: event.target.checked })}
                  className="h-4 w-4 accent-caudal-electric"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black uppercase tracking-[0.08em]">{page.label}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="rounded-lg border border-caudal-electric/20 bg-caudal-electric/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-caudal-electric">{page.icon}</span>
                    <span className="rounded-lg bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">Uso recomendado: {page.use}</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="rounded-xl bg-black/20 px-2 py-2">
                    <p className="font-black text-white">{pageStatus.pages}</p>
                    <p className="mt-0.5 text-slate-500">paginas</p>
                  </div>
                  <div className="rounded-xl bg-black/20 px-2 py-2">
                    <p className="font-black text-white">{pageStatus.completion}%</p>
                    <p className="mt-0.5 text-slate-500">completo</p>
                  </div>
                  <div className="rounded-xl bg-black/20 px-2 py-2">
                    <p className="truncate font-black text-white">{pageStatus.lastEdited}</p>
                    <p className="mt-0.5 text-slate-500">edicion</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase ${pageStatus.empty ? 'bg-amber-300/10 text-amber-100' : 'bg-emerald-300/10 text-emerald-100'}`}>{pageStatus.status}</span>
                  <span className="rounded-lg border border-white/5 bg-white/[0.035] px-2 py-1 text-[11px] text-slate-300">{pageStatus.empty ? 'Sin contenido todavia' : pageStatus.label}</span>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                  <button type="button" onClick={() => handleDossierPageAction(page, 'edit')} className="rounded-xl bg-caudal-electric px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-950 transition hover:bg-[#7aacff]">Editar</button>
                  <button type="button" onClick={() => moveDossierPage(page.id, -1)} disabled={index === 0} className="rounded-xl bg-white/10 px-2 py-2 text-[10px] font-black uppercase text-white disabled:opacity-30">Subir</button>
                  <button type="button" onClick={() => moveDossierPage(page.id, 1)} disabled={index === dossierPages.length - 1} className="rounded-xl bg-white/10 px-2 py-2 text-[10px] font-black uppercase text-white disabled:opacity-30">Bajar</button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
        {printValidationStatus ? (
          <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {printValidationStatus}
          </p>
        ) : null}
      </div>

      {printView === 'plan_partido' ? (
        <MatchPlanEditor
          situations={matchPlanSituations}
          selectedId={selectedMatchPlanId}
          onSelectedIdChange={setSelectedMatchPlanId}
          onChange={updateMatchPlanSituations}
          onSave={saveMatchPlanSituations}
          onDelete={deleteMatchPlanSituation}
          saving={matchPlanSaving}
          loading={matchPlanLoading}
          error={matchPlanError}
          status={matchPlanStatus}
          dirty={matchPlanDirty}
        />
      ) : printView === 'lanzadores' ? (
        <div data-print-workspace="true" className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Configurar lanzadores</h4>
              <p className="mt-2 text-sm text-slate-400">Selecciona 1º, 2º y 3º lanzador por acción. También puedes escribir un nombre manual.</p>
            </div>
            <button
              type="button"
              onClick={saveSetPieceTakers}
              disabled={setPieceSaving}
              className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {setPieceSaving ? 'Guardando...' : 'Guardar lanzadores'}
            </button>
          </div>
          {setPieceLoading ? <p className="mt-4 text-sm text-slate-400">Cargando lanzadores desde Supabase...</p> : null}
          {setPieceError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{setPieceError}</p> : null}
          {setPieceStatus ? <p className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{setPieceStatus}</p> : null}
          <div className="mt-4">
            <button type="button" onClick={() => openDuplicateModal('takers')} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15">
              Duplicar lanzadores desde otro partido
            </button>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {setPieceSections.map((section) => (
              <div key={section.id} className="rounded-3xl bg-white/5 p-4">
                <h5 className="text-xs font-black uppercase tracking-[0.16em] text-white">{section.label}</h5>
                <div className="mt-4 space-y-3">
                  {[1, 2, 3].map((order) => {
                    const entry = getTakerEntry(section.id, order);
                    return (
                      <div key={`${section.id}-${order}`} className="grid gap-3 sm:grid-cols-[64px_1fr_1fr]">
                        <span className="rounded-2xl bg-black/20 px-3 py-3 text-center text-sm font-black text-white">{order}º</span>
                        <select
                          value={entry.jugador_id || ''}
                          onChange={(event) => updateTakerEntry(section.id, order, { jugador_id: event.target.value, nombre_manual: '' })}
                          className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950"
                        >
                          <option value="">Jugador plantilla</option>
                          {players.map((player) => <option key={player.id} value={player.id}>{getPlayerDisplayName(player)}</option>)}
                        </select>
                        <input
                          value={entry.nombre_manual || ''}
                          onChange={(event) => updateTakerEntry(section.id, order, { nombre_manual: event.target.value, jugador_id: '' })}
                          placeholder="Nombre manual"
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {printView === 'abp_ofensiva' ? (
        <div data-print-workspace="true" className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-3 shadow-glow sm:p-6">
          <SetPieceEditorHeader
            title="Preparación profesional de ABP ofensiva"
            description="Construye una ficha táctica completa. Editor, vista previa y renderer A4 funcionan como modos independientes."
            saving={diagramSaving}
            hasDiagrams={Boolean(getTypeDiagrams('offensive').length)}
            onAdd={() => addDiagram('offensive')}
            onSave={() => saveCurrentDiagram('offensive')}
            onDuplicate={() => duplicateCurrentDiagram('offensive')}
            onDuplicateFromMatch={() => openDuplicateModal('offensive')}
            onDelete={() => deleteCurrentDiagram('offensive')}
            onMirrorHorizontal={() => mirrorCurrentDiagram('offensive', 'horizontal')}
            onMirrorVertical={() => mirrorCurrentDiagram('offensive', 'vertical')}
            onSaveToLibrary={() => saveCurrentDiagramToLibrary('offensive')}
            onLoadFromLibrary={() => openLibraryModal('offensive')}
            contextKey={`${match?.id || ''}:offensive:${offensiveType}:${offensiveDiagramOrder}`}
          />
          {diagramLoading ? <p className="mt-4 text-sm text-slate-400">Cargando diagramas desde Supabase...</p> : null}
          {diagramError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{diagramError}</p> : null}
          <div className="mt-4 grid gap-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Tipo de ABP</p>
              <div className="flex flex-wrap gap-2">
                {offensiveSetPieceTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setOffensiveType(type.id)}
                    className={`min-h-9 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 ${offensiveType === type.id ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
            <SetPiecePlaySelector mode="offensive" orders={getDiagramOrders('offensive')} selectedOrder={offensiveDiagramOrder} onSelect={setOffensiveDiagramOrder} />
          </div>
          {!getTypeDiagrams('offensive').length ? (
            <p className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-400">Sin jugadas para este tipo. Pulsa Añadir jugada para empezar.</p>
          ) : null}
          <div className="mt-5">
            {getTypeDiagrams('offensive').length ? (
              <SetPieceDiagramEditor
                diagram={getCurrentDiagram('offensive')}
                players={players}
                match={match}
                suggestions={professionalSetPieceSuggestions}
                printDiagrams={getCurrentPrintPageDiagrams('offensive')}
                totalPrintPlayCount={getTypeDiagrams('offensive').length}
                onChange={(diagram) => updateCurrentDiagram('offensive', diagram)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {printView === 'abp_defensiva' ? (
        <div data-print-workspace="true" className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-3 shadow-glow sm:p-6">
          <SetPieceEditorHeader
            title="Preparación profesional de ABP defensiva"
            description="Organiza marcas, zonas, responsabilidades y riesgos en una ficha lista para presentar e imprimir."
            saving={diagramSaving}
            hasDiagrams={Boolean(getTypeDiagrams('defensive').length)}
            onAdd={() => addDiagram('defensive')}
            onSave={() => saveCurrentDiagram('defensive')}
            onDuplicate={() => duplicateCurrentDiagram('defensive')}
            onDuplicateFromMatch={() => openDuplicateModal('defensive')}
            onDelete={() => deleteCurrentDiagram('defensive')}
            onMirrorHorizontal={() => mirrorCurrentDiagram('defensive', 'horizontal')}
            onMirrorVertical={() => mirrorCurrentDiagram('defensive', 'vertical')}
            onSaveToLibrary={() => saveCurrentDiagramToLibrary('defensive')}
            onLoadFromLibrary={() => openLibraryModal('defensive')}
            contextKey={`${match?.id || ''}:defensive:${defensiveType}:${defensiveDiagramOrder}`}
          />
          {diagramLoading ? <p className="mt-4 text-sm text-slate-400">Cargando diagramas desde Supabase...</p> : null}
          {diagramError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{diagramError}</p> : null}
          <div className="mt-4 grid gap-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Tipo de ABP</p>
              <div className="flex flex-wrap gap-2">
                {defensiveSetPieceTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setDefensiveType(type.id)}
                    className={`min-h-9 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 ${defensiveType === type.id ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
            <SetPiecePlaySelector mode="defensive" orders={getDiagramOrders('defensive')} selectedOrder={defensiveDiagramOrder} onSelect={setDefensiveDiagramOrder} />
          </div>
          <details className="mt-3 rounded-2xl border border-white/5 bg-white/[0.025]">
            <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 [&::-webkit-details-marker]:hidden">
              Añadir organización defensiva
            </summary>
            <div className="flex flex-wrap gap-2 border-t border-white/5 p-3">
              {[
                ['marca_individual', 'Marca individual'],
                ['posibles_rematadores', 'Posibles rematadores'],
                ['rechace', 'Rechace'],
                ['rechace_corto', 'Rechace y corto'],
                ['marca_rechace', 'Marca y rechace'],
                ['zona_defensiva', 'Zona defensiva'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => addDefensiveQuickElement(id)}
                  disabled={!getTypeDiagrams('defensive').length}
                  className="min-h-9 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
          </details>
          {!getTypeDiagrams('defensive').length ? (
            <p className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-400">Sin jugadas para este tipo. Pulsa Añadir jugada para empezar.</p>
          ) : null}
          <div className="mt-5">
            {getTypeDiagrams('defensive').length ? (
              <SetPieceDiagramEditor
                diagram={getCurrentDiagram('defensive')}
                players={players}
                match={match}
                suggestions={professionalSetPieceSuggestions}
                printDiagrams={getCurrentPrintPageDiagrams('defensive')}
                totalPrintPlayCount={getTypeDiagrams('defensive').length}
                onChange={(diagram) => updateCurrentDiagram('defensive', diagram)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div ref={sheetRef} className={`print-sheet-frame print-current-sheet ${['abp_ofensiva', 'abp_defensiva', 'plan_partido'].includes(printView) ? 'print-sheet-frame-landscape' : ''}`}>
        {printView === 'alineacion' ? (
          <div>
            <div className="print-hidden mb-4 flex justify-center">
              <button type="button" onClick={() => openDuplicateModal('lineup')} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15">
                Copiar alineación desde otro partido
              </button>
            </div>
            <LineupPrintSheet
              match={match}
              starters={printData.starters}
              bench={printData.bench}
              coordinates={printData.coordinates}
              system={printData.system}
              kit={kit}
              captainPlayerId={printData.captainPlayerId}
            />
          </div>
        ) : printView === 'plan_partido' ? (
          <MatchPlanPrintSheet match={match} situations={matchPlanSituations} preview />
        ) : printView === 'lanzadores' ? (
          <SetPieceTakersPrintSheet
            match={match}
            sections={setPieceSections}
            takers={setPieceTakers}
            players={players}
          />
        ) : printView === 'abp_ofensiva' ? (
          chunkDiagrams(getPrintDiagrams('offensive')).map((diagrams, index) => (
            <SetPieceDiagramPrintSheet
              key={`offensive-current-${index}`}
              match={match}
              title={offensiveSetPieceTypes.find((type) => type.id === offensiveType)?.label || 'ABP ofensiva'}
              diagrams={diagrams}
              players={players}
              totalPlayCount={getPrintDiagrams('offensive').length}
            />
          ))
        ) : (
          chunkDiagrams(getPrintDiagrams('defensive')).map((diagrams, index) => (
            <SetPieceDiagramPrintSheet
              key={`defensive-current-${index}`}
              match={match}
              title={defensiveSetPieceTypes.find((type) => type.id === defensiveType)?.label || 'ABP defensiva'}
              diagrams={diagrams}
              players={players}
              totalPlayCount={getPrintDiagrams('defensive').length}
            />
          ))
        )}
      </div>

      {dossierPrintPortal}

      {diagramStatus ? (
        <div className="print-hidden fixed bottom-5 right-5 z-[90] max-w-sm rounded-2xl border border-emerald-300/20 bg-[#10241f] px-4 py-3 text-sm font-semibold text-emerald-100 shadow-2xl" role="status" aria-live="polite">
          {diagramStatus}
        </div>
      ) : null}

      {libraryModal ? (
        <div className="print-hidden fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-caudal-950 p-6 shadow-glow">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Biblioteca</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Cargar jugada desde biblioteca</h3>
                <p className="mt-2 text-sm text-slate-400">El dibujo se copia en la jugada actual. Después pulsa Guardar jugada para asociarlo al partido.</p>
              </div>
              <button type="button" onClick={() => setLibraryModal(null)} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold text-white">Cerrar</button>
            </div>
            <input
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder="Buscar en biblioteca"
              className="mt-5 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
            />
            {libraryLoading ? <p className="mt-4 text-sm text-slate-400">Cargando biblioteca desde Supabase...</p> : null}
            {libraryError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{libraryError}</p> : null}
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredLibraryItems.map((item) => {
                const libraryMeta = getSetPieceTacticalMeta(item.elements);
                const classificationLabel = getSetPieceClassificationLabel(item);
                const displayName = areSetPieceLabelsEquivalent(classificationLabel, item.nombre, item.orden) ? '' : item.nombre;
                const objective = libraryMeta.objective || item.objetivo || item.descripcion || 'Objetivo pendiente';
                const updatedAt = libraryMeta.lastUsedAt || item.updated_at || item.created_at;
                const formattedUpdatedAt = updatedAt
                  ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(updatedAt))
                  : 'Sin uso registrado';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadLibraryItemIntoDiagram(item)}
                    className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] text-left transition hover:-translate-y-0.5 hover:border-caudal-electric/45 hover:bg-white/[0.075] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                  >
                    <div className="aspect-[16/10] bg-white p-2 text-black">
                      <SetPieceDiagramCanvas elements={item.elements || []} readOnly printOptimized />
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">{displayName ? <p className="truncate text-sm font-black text-white">{displayName}</p> : null}<p className={`${displayName ? 'mt-1 text-[9px]' : 'text-sm'} font-black uppercase tracking-[0.15em] text-caudal-electric`}>{classificationLabel}</p></div>
                        <span className="shrink-0 text-xs tracking-[-0.08em] text-amber-300">{Array.from({ length: 5 }, (_, index) => index < libraryMeta.rating ? '★' : '·').join('')}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 min-h-10 text-xs font-semibold leading-5 text-slate-300">{objective}</p>
                      {libraryMeta.tags.length ? <div className="mt-3 flex flex-wrap gap-1">{libraryMeta.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold text-slate-300">{tag}</span>)}</div> : null}
                      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500"><span>Último uso</span><span>{formattedUpdatedAt}</span></div>
                    </div>
                  </button>
                );
              })}
              {!libraryLoading && !filteredLibraryItems.length ? (
                <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-400 md:col-span-2">No hay jugadas guardadas en esta categoría de biblioteca.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {duplicateModal ? (
        <div className="print-hidden fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-caudal-950 p-6 shadow-glow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Duplicar</p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {duplicateModal === 'all' ? 'Preparación completa' : duplicateModal === 'lineup' ? 'Alineación' : duplicateModal === 'takers' ? 'Lanzadores' : duplicateModal === 'offensive' ? 'ABP ofensiva' : 'ABP defensiva'}
                </h3>
              </div>
              <button type="button" onClick={() => setDuplicateModal(null)} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold text-white">Cerrar</button>
            </div>
            <label className="mt-5 block space-y-2 text-sm text-slate-300">
              <span>Partido origen</span>
              <select value={duplicateSourceId} onChange={(event) => { setDuplicateSourceId(event.target.value); setDuplicateMessage(''); setDuplicateAnalysis(null); setDuplicateAnalysisLoading(Boolean(event.target.value)); setDuplicateAnalysisError(''); }} className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950">
                <option value="">Selecciona partido</option>
                {matches.filter((item) => item.id !== match?.id).map((item) => (
                  <option key={item.id} value={item.id}>{item.date || ''} · {item.opponent || 'Sin rival'}</option>
                ))}
              </select>
            </label>
            {(duplicateModal === 'offensive' || duplicateModal === 'defensive' || duplicateModal === 'all') ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ['add', 'Añadir como nuevas jugadas'],
                  ['replace', 'Reemplazar datos existentes'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDuplicateMode(value)}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold ${duplicateMode === value ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-2xl bg-amber-300/10 p-4 text-sm text-amber-100">Esta acción reemplaza la información actual de esta sección para evitar duplicados.</p>
            )}
            {(duplicateModal === 'offensive' || duplicateModal === 'defensive' || duplicateModal === 'all') ? (
              <>
                <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white">
                  <input type="checkbox" checked={duplicateAdaptPlayers} onChange={(event) => setDuplicateAdaptPlayers(event.target.checked)} className="h-4 w-4 accent-caudal-electric" />
                  Adaptar jugadores al XI titular actual
                </label>
                {duplicateAdaptPlayers && duplicateSourceId ? (
                  <section className="mt-4 rounded-2xl border border-caudal-electric/20 bg-caudal-electric/[0.06] p-4" aria-live="polite">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">Adaptación al XI actual</p>
                    {duplicateAnalysisLoading ? <p className="mt-3 text-sm text-slate-300">Analizando jugadas y titulares…</p> : null}
                    {duplicateAnalysisError ? <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-100">{duplicateAnalysisError}</p> : null}
                    {!duplicateAnalysisLoading && duplicateAnalysis ? (
                      <>
                        {duplicateAnalysis.message ? <p className="mt-3 rounded-xl bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{duplicateAnalysis.message}</p> : null}
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-black/20 px-2 py-3"><strong className="block text-lg text-white">{duplicateAnalysis.changeOccurrenceCount}</strong><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cambios</span></div>
                          <div className="rounded-xl bg-black/20 px-2 py-3"><strong className="block text-lg text-white">{duplicateAnalysis.unchangedPlayCount}</strong><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sin cambios</span></div>
                          <div className="rounded-xl bg-black/20 px-2 py-3"><strong className="block text-lg text-white">{duplicateAnalysis.manualReviewCount}</strong><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Revisar</span></div>
                        </div>
                        <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1">
                          {duplicateAnalysis.changesByPlay.filter((play) => play.changes.length || play.manual.length).map((play) => (
                            <div key={play.id} className="rounded-xl bg-black/20 px-3 py-2.5">
                              <p className="text-xs font-black text-white">{play.title}</p>
                              {play.changes.map((change) => <p key={`${play.id}-${change.oldId}`} className="mt-1 text-xs text-emerald-100">{change.oldName} → {change.newName}</p>)}
                              {play.manual.map((item) => <p key={`${play.id}-${item.oldId}`} className="mt-1 text-xs text-amber-100">{item.oldName} → Jugador por asignar · {item.reasonLabel}</p>)}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </section>
                ) : null}
              </>
            ) : null}
            {duplicateMessage ? <p className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{duplicateMessage}</p> : null}
            {diagramError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{diagramError}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              {(duplicateModal === 'offensive' || duplicateModal === 'defensive' || duplicateModal === 'all') ? (
                <>
                  <button type="button" onClick={() => runDuplicateImport({ adaptPlayers: true })} disabled={!duplicateSourceId || duplicateBusy || !duplicateAdaptPlayers || duplicateAnalysisLoading || !duplicateAnalysis || Boolean(duplicateAnalysisError)} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">
                    {duplicateBusy ? 'Duplicando...' : 'Duplicar y adaptar'}
                  </button>
                  <button type="button" onClick={() => runDuplicateImport({ adaptPlayers: false })} disabled={!duplicateSourceId || duplicateBusy} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">Duplicar sin adaptar</button>
                </>
              ) : (
                <button type="button" onClick={() => runDuplicateImport({ adaptPlayers: false })} disabled={!duplicateSourceId || duplicateBusy} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">
                  {duplicateBusy ? 'Duplicando...' : 'Duplicar'}
                </button>
              )}
              <button type="button" onClick={() => setDuplicateModal(null)} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white">Cancelar</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
