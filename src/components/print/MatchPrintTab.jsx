import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import DossierTacticalSheet from './DossierTacticalSheet';
import LineupPrintSheet from './LineupPrintSheet';
import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import SetPieceDiagramEditor from './SetPieceDiagramEditor';
import SetPieceDiagramPrintSheet from './SetPieceDiagramPrintSheet';
import SetPieceTakersPrintSheet from './SetPieceTakersPrintSheet';

const setPieceSections = [
  { id: 'penaltis', label: 'Penaltis' },
  { id: 'faltas_directas', label: 'Faltas directas' },
  { id: 'faltas_laterales', label: 'Faltas laterales' },
  { id: 'corners', label: 'Córners' },
];

const offensiveSetPieceTypes = [
  { id: 'corner_ofensivo', label: 'Córner ofensivo' },
  { id: 'falta_lateral_ofensiva', label: 'Falta lateral ofensiva' },
  { id: 'saque_banda_ofensivo', label: 'Saque de banda ofensivo' },
  { id: 'saque_inicio_ofensivo', label: 'Saque de inicio' },
];

const defensiveSetPieceTypes = [
  { id: 'corner_defensivo', label: 'Córner defensivo' },
  { id: 'falta_lateral_defensiva', label: 'Falta lateral defensiva' },
  { id: 'saque_banda_defensivo', label: 'Saque de banda defensivo' },
];

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
  { id: 'lineup', label: 'Alineacion', group: 'Vestuario', icon: 'XI', use: 'visual y simple' },
  { id: 'talk', label: 'Charla rapida', group: 'Charla', icon: 'CH', use: 'impacto vestuario' },
  { id: 'takers', label: 'Lanzadores', group: 'Banquillo', icon: 'LZ', use: 'consulta rapida' },
  { id: 'offensive', label: 'ABP ofensiva', group: 'Staff', icon: 'AB+', use: 'balon parado' },
  { id: 'defensive', label: 'ABP defensiva', group: 'Staff', icon: 'AB-', use: 'marcas y zonas' },
  { id: 'kickoff', label: 'Saque inicial', group: 'Vestuario', icon: 'SI', use: 'primer minuto' },
  { id: 'pressure', label: 'Plan de presion', group: 'Banquillo', icon: 'PR', use: 'lectura rapida' },
  { id: 'vigilances', label: 'Vigilancias', group: 'Staff', icon: 'VG', use: 'control rival' },
  { id: 'transitions', label: 'Transiciones', group: 'Banquillo', icon: 'TR', use: 'ajustes live' },
  { id: 'halftime', label: 'Descanso', group: 'Banquillo', icon: 'HT', use: 'escribir encima' },
  { id: 'rival', label: 'Resumen rival', group: 'Resumen rival', icon: 'RV', use: 'scouting rapido' },
  { id: 'staff', label: 'Notas de staff', group: 'Staff', icon: 'ST', use: 'denso' },
];

const dossierPresetStorageKey = 'caudal-print-dossier-preset-v2';

const dossierPresets = {
  full_staff: {
    label: 'Dossier staff completo',
    type: 'Staff',
    pages: ['lineup', 'talk', 'rival', 'vigilances', 'pressure', 'transitions', 'takers', 'offensive', 'defensive', 'kickoff', 'halftime', 'staff'],
  },
  dressing_room: {
    label: 'Dossier vestuario',
    type: 'Vestuario',
    pages: ['lineup', 'talk', 'kickoff', 'rival'],
  },
  bench: {
    label: 'Dossier banquillo',
    type: 'Banquillo',
    pages: ['lineup', 'takers', 'pressure', 'transitions', 'vigilances', 'halftime'],
  },
  express: {
    label: 'Dossier express',
    type: 'Banquillo',
    pages: ['lineup', 'talk', 'takers'],
  },
  set_pieces: {
    label: 'Solo ABP',
    type: 'Staff',
    pages: ['takers', 'offensive', 'defensive', 'kickoff'],
  },
  lineup_takers: {
    label: 'Solo alineacion + lanzadores',
    type: 'Vestuario',
    pages: ['lineup', 'takers'],
  },
};

const buildDossierPagesFromPreset = (presetKey = 'bench') => {
  const preset = dossierPresets[presetKey] || dossierPresets.bench;
  const ordered = [
    ...preset.pages.map((id) => dossierPageDefinitions.find((page) => page.id === id)).filter(Boolean),
    ...dossierPageDefinitions.filter((page) => !preset.pages.includes(page.id)),
  ];
  return ordered.map((page) => ({ ...page, active: preset.pages.includes(page.id) }));
};

const createDefaultDiagram = (type, order, definitions) => {
  const definition = definitions.find((item) => item.id === type);
  return {
    partido_id: '',
    tipo: type,
    orden: order,
    titulo: `${definition?.label || 'ABP'} ${order}`,
    consigna: '',
    elements: [
      { id: `${type}-${order}-ball`, type: 'ball', x: 8, y: 8 },
      { id: `${type}-${order}-p1`, type: 'player', x: 46, y: 20, label: '1', player_id: '' },
      { id: `${type}-${order}-p2`, type: 'player', x: 56, y: 22, label: '2', player_id: '' },
      { id: `${type}-${order}-p3`, type: 'player', x: 50, y: 36, label: '3', player_id: '' },
    ],
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
  shirtName: player?.shirtName || player?.shirt_name || player?.shortName || fallbackName || player?.name || '',
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

const getLineupStarters = ({ match, playersByName }) => {
  const lineupNames = (match?.preCaudalLineup || []).some(Boolean)
    ? match.preCaudalLineup
    : (match?.statsLineup || []).some(Boolean)
      ? match.statsLineup
      : [];

  const starters = Array.from({ length: 11 }, (_, index) => {
    const name = lineupNames[index] || '';
    if (!name) return toPrintPlayer(null, `Puesto ${index + 1}`);
    return normalizePrintPlayerEntry(name, playersByName);
  });

  return { lineupNames, starters };
};

const getLineupBench = ({ match, players, starters, playersByName }) => {
  const starterNames = new Set(
    starters
      .map((player) => normalizeText(player.name))
      .filter((name) => name && !name.startsWith('puesto '))
  );
  const rawCalledPlayers = match?.statsCalledPlayers?.length ? match.statsCalledPlayers : players;
  const calledPlayers = rawCalledPlayers
    .map((entry) => normalizePrintPlayerEntry(entry, playersByName))
    .filter((player) => normalizeText(player.name));

  const byName = new Map();
  calledPlayers.forEach((player) => {
    const key = normalizeText(player.name);
    if (!starterNames.has(key) && !byName.has(key)) byName.set(key, player);
  });

  return Array.from(byName.values());
};

export default function MatchPrintTab({ match, matches = [], players = [], getFormationCoordinates }) {
  const [printView, setPrintView] = useState('alineacion');
  const [kit, setKit] = useState('home');
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
  const [libraryModal, setLibraryModal] = useState(null);
  const [libraryItems, setLibraryItems] = useState([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [printMode, setPrintMode] = useState('current');
  const [printValidationStatus, setPrintValidationStatus] = useState('');
  const [dossierPreset, setDossierPreset] = useState(() => {
    if (typeof window === 'undefined') return 'bench';
    return window.localStorage.getItem(dossierPresetStorageKey) || 'bench';
  });
  const [dossierType, setDossierType] = useState(() => (dossierPresets[dossierPreset]?.type || 'Banquillo'));
  const [dossierPages, setDossierPages] = useState(() => buildDossierPagesFromPreset(dossierPreset));
  const [draggedDossierPageId, setDraggedDossierPageId] = useState('');
  const [captainPlayerId, setCaptainPlayerId] = useState(match?.captainPlayerId || '');
  const sheetRef = useRef(null);

  useEffect(() => {
    setCaptainPlayerId(match?.captainPlayerId || '');
  }, [match?.captainPlayerId, match?.id]);

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
    const { starters } = getLineupStarters({ match, playersByName: byName });
    const markedStarters = starters.map((player) => ({ ...player, isCaptain: Boolean(captainPlayerId && player.id === captainPlayerId) }));
    const bench = getLineupBench({ match, players, starters: markedStarters, playersByName: byName })
      .map((player) => ({ ...player, isCaptain: Boolean(captainPlayerId && player.id === captainPlayerId) }));
    const coordinates = typeof getFormationCoordinates === 'function' ? getFormationCoordinates(system) : [];
    return { system, starters: markedStarters, bench, coordinates };
  }, [match, players, getFormationCoordinates, captainPlayerId]);

  const handleCaptainChange = async (nextCaptainId) => {
    if (!match?.id) return;
    setCaptainPlayerId(nextCaptainId);
    const { error } = await supabase
      .from('partidos')
      .update({ captain_player_id: nextCaptainId || null })
      .eq('id', match.id);
    if (error) {
      console.error('Error guardando capitán desde impresión:', error);
      setCaptainPlayerId(match?.captainPlayerId || '');
    }
  };

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

  const applyDossierPreset = (presetKey) => {
    const preset = dossierPresets[presetKey] || dossierPresets.bench;
    setDossierPreset(presetKey);
    setDossierType(preset.type);
    setDossierPages(buildDossierPagesFromPreset(presetKey));
    if (typeof window !== 'undefined') window.localStorage.setItem(dossierPresetStorageKey, presetKey);
  };

  const getShortLines = (value, limit = 6) => String(value || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, limit);

  const getMatchKeys = () => [
    ...getShortLines(match?.planClave, 3),
    ...getShortLines(match?.planObjetivo, 2),
    ...getShortLines(match?.prePlanAdjustment, 2),
  ].filter(Boolean).slice(0, 3);

  const getStaffNotes = () => [
    ...getShortLines(match?.prePlanAvoid, 4),
    ...getShortLines(match?.preKeyMatchupsTable, 4),
    ...getShortLines(match?.planTransiciones, 4),
    ...getShortLines(match?.abpDefensiva, 3),
  ].filter(Boolean).slice(0, 10);

  const getDossierContent = () => {
    const hasLineup = printData.starters.some((player) => player?.name && !String(player.name).startsWith('Puesto '));
    const hasTakers = setPieceTakers.some((entry) => entry.jugador_id || String(entry.nombre_manual || '').trim());
    const offensiveDiagrams = getDiagramsByTypes(offensiveSetPieceTypes.map((type) => type.id));
    const defensiveDiagrams = getDiagramsByTypes(defensiveSetPieceTypes.map((type) => type.id));
    const kickoffDiagrams = getKickoffDiagrams();
    const warnings = [];
    if (isDossierPageActive('lineup') && !hasLineup) warnings.push('Alineacion esta vacia.');
    if (isDossierPageActive('takers') && !hasTakers) warnings.push('Lanzadores esta vacio.');
    if (isDossierPageActive('offensive') && !offensiveDiagrams.length) warnings.push('ABP Ofensiva no tiene jugadas.');
    if (isDossierPageActive('defensive') && !defensiveDiagrams.length) warnings.push('ABP Defensiva no tiene jugadas.');
    if (isDossierPageActive('kickoff') && !kickoffDiagrams.length) warnings.push('Saque de inicio esta marcado pero no existe diagrama.');
    return {
      hasLineup,
      hasTakers,
      offensiveDiagrams,
      defensiveDiagrams,
      kickoffDiagrams,
      warnings,
    };
  };

  const handlePrintDossier = () => {
    const dossierContent = getDossierContent();
    const printableSections = activeDossierPages.filter((page) => {
      if (page.id === 'lineup') return dossierContent.hasLineup;
      if (page.id === 'takers') return dossierContent.hasTakers;
      if (page.id === 'offensive') return dossierContent.offensiveDiagrams.length;
      if (page.id === 'defensive') return dossierContent.defensiveDiagrams.length;
      if (page.id === 'kickoff') return dossierContent.kickoffDiagrams.length;
      return true;
    }).length;
    if (dossierContent.warnings.length) {
      setPrintValidationStatus(dossierContent.warnings.join(' '));
    } else {
      setPrintValidationStatus('');
    }
    if (!printableSections) {
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
        titulo: `${baseTitle} copia`,
        consigna: source.consigna || '',
        elements: JSON.parse(JSON.stringify(cleanDiagramElements(source.elements))),
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
    const definitions = getDiagramDefinitions(mode);
    if (!source?.tipo) return;
    setDiagramSaving(true);
    setDiagramError('');
    setDiagramStatus('');
    try {
      const isPersisted = Boolean(source.id);
      if (match?.id && isPersisted) {
        const { error } = await supabase.from('match_set_piece_diagrams').delete().eq('partido_id', match.id).eq('tipo', type);
        if (error) throw error;
      }
      const remaining = setPieceDiagrams
        .filter((diagram) => !(diagram.tipo === source.tipo && Number(diagram.orden) === Number(source.orden)))
        .sort((a, b) => Number(a.orden) - Number(b.orden));
      const sameType = remaining.filter((diagram) => diagram.tipo === type);
      const otherTypes = remaining.filter((diagram) => diagram.tipo !== type);
      const compacted = sameType.map((diagram, index) => ({
        ...diagram,
        orden: index + 1,
        titulo: diagram.titulo || `${definitions.find((item) => item.id === type)?.label || 'ABP'} ${index + 1}`,
      }));
      if (match?.id && isPersisted && compacted.length) {
        const rows = compacted.map((diagram) => ({
          partido_id: match.id,
          tipo: diagram.tipo,
          orden: Number(diagram.orden) || 1,
          titulo: diagram.titulo || '',
          consigna: diagram.consigna || '',
          elements: cleanDiagramElements(diagram.elements),
        }));
        const { data, error } = await supabase.from('match_set_piece_diagrams').insert(rows).select('*');
        if (error) throw error;
        setSetPieceDiagrams([...otherTypes, ...(data || compacted)]);
      } else {
        setSetPieceDiagrams([...otherTypes, ...compacted]);
      }
      const nextOrder = compacted.length ? Math.min(Number(source.orden) || 1, compacted.length) : 1;
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
      const categories = mode === 'offensive'
        ? ['ABP Ofensiva', 'Estrategia']
        : ['ABP Defensiva', 'Estrategia'];
      const { data, error } = await supabase
        .from('training_library')
        .select('*')
        .in('categoria', categories)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setLibraryItems(data || []);
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
      const category = mode === 'offensive' ? 'ABP Ofensiva' : 'ABP Defensiva';
      const label = getDiagramDefinitions(mode).find((item) => item.id === diagram.tipo)?.label || category;
      const payload = {
        nombre: diagram.titulo || `${label} ${diagram.orden || 1}`,
        tipo: diagram.tipo,
        categoria: category,
        descripcion: diagram.consigna || '',
        objetivo: '',
        variantes: '',
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

  const loadLibraryItemIntoDiagram = (item) => {
    if (!libraryModal) return;
    const current = getCurrentDiagram(libraryModal);
    updateCurrentDiagram(libraryModal, {
      ...current,
      titulo: item.nombre || current.titulo,
      consigna: item.descripcion || item.objetivo || current.consigna || '',
      elements: JSON.parse(JSON.stringify(cleanDiagramElements(item.elements))),
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

  const copyDiagrams = async ({ sourceId, targetId, mode, replace }) => {
    const types = mode === 'offensive'
      ? offensiveSetPieceTypes.map((item) => item.id)
      : mode === 'defensive'
        ? defensiveSetPieceTypes.map((item) => item.id)
        : [...offensiveSetPieceTypes, ...defensiveSetPieceTypes].map((item) => item.id);
    const { data, error } = await supabase.from('match_set_piece_diagrams').select('*').eq('partido_id', sourceId).in('tipo', types).order('orden', { ascending: true });
    if (error) throw error;
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
      return {
        partido_id: targetId,
        tipo: diagram.tipo,
        orden: nextOrder,
        titulo: replace ? diagram.titulo : `${diagram.titulo || 'ABP'} copia`,
        consigna: diagram.consigna || '',
        elements: cleanDiagramElements(diagram.elements),
      };
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
      columns: ['scope', 'slot', 'player_name', 'jugador_id', 'jugador_rival_id', 'player_snapshot'],
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

  const runDuplicateImport = async () => {
    if (!match?.id || !duplicateSourceId || duplicateSourceId === match.id) return;
    const replace = duplicateMode === 'replace';
    setDuplicateBusy(true);
    setDuplicateMessage('');
    setDiagramError('');
    try {
      if (duplicateModal === 'lineup' || duplicateModal === 'all') await copyLineupFromMatch({ sourceId: duplicateSourceId, targetId: match.id, replace: true });
      if (duplicateModal === 'takers' || duplicateModal === 'all') await copyTakersFromMatch({ sourceId: duplicateSourceId, targetId: match.id, replace: true });
      if (duplicateModal === 'offensive' || duplicateModal === 'all') await copyDiagrams({ sourceId: duplicateSourceId, targetId: match.id, mode: 'offensive', replace });
      if (duplicateModal === 'defensive' || duplicateModal === 'all') await copyDiagrams({ sourceId: duplicateSourceId, targetId: match.id, mode: 'defensive', replace });
      setDuplicateMessage('Preparación duplicada correctamente.');
    } catch (error) {
      console.error('Error duplicando preparación desde otro partido:', error);
      setDiagramError(error.message || 'No se pudo duplicar la preparación.');
    } finally {
      setDuplicateBusy(false);
    }
  };

  const currentOffensiveNote = getOffensiveNote();
  const currentDefensiveNote = getDefensiveNote();
  const printTitle = printView === 'alineacion' ? 'Alineación' : printView === 'lanzadores' ? 'Lanzadores' : printView === 'abp_ofensiva' ? 'ABP ofensiva' : 'ABP defensiva';

  const dossierContent = getDossierContent();
  const activeSheetCount = activeDossierPages.reduce((count, page) => {
    if (page.id === 'offensive') return count + Math.max(1, chunkDiagrams(dossierContent.offensiveDiagrams).length);
    if (page.id === 'defensive') return count + Math.max(1, chunkDiagrams(dossierContent.defensiveDiagrams).length);
    if (page.id === 'kickoff') return count + Math.max(1, dossierContent.kickoffDiagrams.length);
    return count + 1;
  }, 0);
  const groupTone = (group) => {
    if (group === 'Vestuario') return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';
    if (group === 'Banquillo') return 'border-caudal-electric/25 bg-caudal-electric/10 text-caudal-electric';
    if (group === 'Charla') return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
    if (group === 'Resumen rival') return 'border-red-300/20 bg-red-300/10 text-red-100';
    return 'border-white/10 bg-white/[0.055] text-slate-300';
  };

  return (
    <section className={`match-print-tab space-y-6 ${printMode === 'dossier' ? 'printing-dossier' : ''}`}>
      <div className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Impresión</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{printTitle}</h3>
            <p className="mt-2 text-sm text-slate-400">Hoja A4 en blanco y negro para el cuerpo técnico.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={() => openDuplicateModal('all')} className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/15">
              Duplicar preparación desde otro partido
            </button>
            <button type="button" onClick={handlePrintDossier} className="rounded-2xl bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-slate-100">
              Imprimir dossier completo
            </button>
            <div className="flex rounded-2xl bg-white/10 p-1">
              {[
                ['alineacion', 'Alineación'],
                ['lanzadores', 'Lanzadores'],
                ['abp_ofensiva', 'ABP ofensiva'],
                ['abp_defensiva', 'ABP defensiva'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPrintView(value)}
                  className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${printView === value ? 'bg-caudal-electric text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {printView === 'alineacion' ? <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Equipación</span>
              <select value={kit} onChange={(event) => setKit(event.target.value)} className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950">
                <option value="home">Titular / blanca</option>
                <option value="away">Suplente / amarilla a rayas</option>
              </select>
            </label> : null}
            {printView === 'alineacion' ? <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Capitán</span>
              <select value={captainPlayerId || ''} onChange={(event) => handleCaptainChange(event.target.value)} className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950">
                <option value="">Sin capitán</option>
                {(match?.statsCalledPlayers?.length ? printData.starters.concat(printData.bench).filter((player) => player.id && !String(player.name || '').startsWith('Puesto ')) : players).map((player) => (
                  <option key={player.id} value={player.id}>{player.number || player.dorsal || '-'} · {player.name}</option>
                ))}
              </select>
            </label> : null}
            <button type="button" onClick={handlePreview} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15">
              Vista previa
            </button>
            <button type="button" onClick={handlePrint} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-[#7aacff]">
              Imprimir {printView === 'alineacion' ? 'alineación' : printView === 'lanzadores' ? 'lanzadores' : printView === 'abp_ofensiva' ? 'ABP ofensiva' : 'ABP defensiva'}
            </button>
            {printView === 'alineacion' ? <button type="button" onClick={handlePrint} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15">
              Guardar PDF
            </button> : null}
          </div>
        </div>
        <div className="mt-5 rounded-3xl border border-white/5 bg-black/20 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Constructor de dossier</p>
              <p className="mt-1 text-sm text-slate-400">Selecciona hojas operativas, ordenalas y adapta la densidad al uso real. {activeDossierPages.length} bloques activos · {activeSheetCount} hojas estimadas.</p>
            </div>
            <label className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              Tipo de hoja
              <select value={dossierType} onChange={(event) => setDossierType(event.target.value)} className="rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-black text-slate-950">
                {['Vestuario', 'Banquillo', 'Staff', 'Charla', 'Resumen rival'].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(dossierPresets).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyDossierPreset(key)}
                className={`rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition ${dossierPreset === key ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15'}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {dossierPages.map((page, index) => (
              <div
                key={page.id}
                draggable
                onDragStart={() => setDraggedDossierPageId(page.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropDossierPage(page.id)}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-xs font-bold transition ${page.active ? 'border-caudal-electric/30 bg-caudal-electric/10 text-white' : 'border-white/10 bg-white/[0.035] text-slate-400'} ${draggedDossierPageId === page.id ? 'opacity-60 ring-2 ring-caudal-electric' : ''}`}
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
                    <span className={`rounded-lg border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${groupTone(page.group)}`}>{page.icon} · {page.group}</span>
                    <span className="rounded-lg bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">Uso recomendado: {page.use}</span>
                  </div>
                </div>
                <button type="button" onClick={() => moveDossierPage(page.id, -1)} disabled={index === 0} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] disabled:opacity-30">Subir</button>
                <button type="button" onClick={() => moveDossierPage(page.id, 1)} disabled={index === dossierPages.length - 1} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] disabled:opacity-30">Bajar</button>
              </div>
            ))}
          </div>
        </div>
        {printValidationStatus ? (
          <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {printValidationStatus}
          </p>
        ) : null}
      </div>

      {printView === 'lanzadores' ? (
        <div className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
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
                          {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
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
        <div className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Editor visual ABP ofensiva</h4>
              <p className="mt-2 text-sm text-slate-400">Diseña la jugada con círculos, balón, flechas, líneas discontinuas y zonas. Se imprimen 2 jugadas por hoja.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addDiagram('offensive')}
                disabled={diagramSaving}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Añadir jugada
              </button>
              <button
                type="button"
                onClick={() => duplicateCurrentDiagram('offensive')}
                disabled={diagramSaving || !getTypeDiagrams('offensive').length}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Duplicar jugada
              </button>
              <button
                type="button"
                onClick={() => mirrorCurrentDiagram('offensive', 'horizontal')}
                disabled={diagramSaving || !getTypeDiagrams('offensive').length}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Espejo H
              </button>
              <button
                type="button"
                onClick={() => mirrorCurrentDiagram('offensive', 'vertical')}
                disabled={diagramSaving || !getTypeDiagrams('offensive').length}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Espejo V
              </button>
              <button
                type="button"
                onClick={() => deleteCurrentDiagram('offensive')}
                disabled={diagramSaving || !getTypeDiagrams('offensive').length}
                className="rounded-2xl bg-red-500/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Eliminar jugada
              </button>
              <button
                type="button"
                onClick={() => saveCurrentDiagramToLibrary('offensive')}
                disabled={diagramSaving || !getTypeDiagrams('offensive').length}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Guardar en biblioteca
              </button>
              <button
                type="button"
                onClick={() => openLibraryModal('offensive')}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15"
              >
                Cargar desde biblioteca
              </button>
              <button
                type="button"
                onClick={() => saveCurrentDiagram('offensive')}
                disabled={diagramSaving || !getTypeDiagrams('offensive').length}
                className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {diagramSaving ? 'Guardando...' : 'Guardar jugada'}
              </button>
            </div>
          </div>
          {diagramLoading ? <p className="mt-4 text-sm text-slate-400">Cargando diagramas desde Supabase...</p> : null}
          {diagramError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{diagramError}</p> : null}
          {diagramStatus ? <p className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{diagramStatus}</p> : null}
          <div className="mt-4">
            <button type="button" onClick={() => openDuplicateModal('offensive')} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15">
              Duplicar ABP OFENSIVA
            </button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {offensiveSetPieceTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setOffensiveType(type.id)}
                className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${offensiveType === type.id ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
              >
                {type.label}
              </button>
            ))}
            {getDiagramOrders('offensive').map((order) => (
              <button
                key={`off-${order}`}
                type="button"
                onClick={() => setOffensiveDiagramOrder(order)}
                className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${offensiveDiagramOrder === order ? 'bg-white text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
              >
                Jugada {order}
              </button>
            ))}
          </div>
          {!getTypeDiagrams('offensive').length ? (
            <p className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-400">Sin jugadas para este tipo. Pulsa Añadir jugada para empezar.</p>
          ) : null}
          <div className="mt-5">
            {getTypeDiagrams('offensive').length ? (
              <SetPieceDiagramEditor
                diagram={getCurrentDiagram('offensive')}
                players={players}
                onChange={(diagram) => updateCurrentDiagram('offensive', diagram)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {printView === 'abp_defensiva' ? (
        <div className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Editor visual ABP defensiva</h4>
              <p className="mt-2 text-sm text-slate-400">Diferencia equipo propio y rival, añade zonas, flechas y trayectorias. Se imprimen 2 jugadas por hoja.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addDiagram('defensive')}
                disabled={diagramSaving}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Añadir jugada
              </button>
              <button
                type="button"
                onClick={() => duplicateCurrentDiagram('defensive')}
                disabled={diagramSaving || !getTypeDiagrams('defensive').length}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Duplicar jugada
              </button>
              <button
                type="button"
                onClick={() => mirrorCurrentDiagram('defensive', 'horizontal')}
                disabled={diagramSaving || !getTypeDiagrams('defensive').length}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Espejo H
              </button>
              <button
                type="button"
                onClick={() => mirrorCurrentDiagram('defensive', 'vertical')}
                disabled={diagramSaving || !getTypeDiagrams('defensive').length}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Espejo V
              </button>
              <button
                type="button"
                onClick={() => deleteCurrentDiagram('defensive')}
                disabled={diagramSaving || !getTypeDiagrams('defensive').length}
                className="rounded-2xl bg-red-500/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Eliminar jugada
              </button>
              <button
                type="button"
                onClick={() => saveCurrentDiagramToLibrary('defensive')}
                disabled={diagramSaving || !getTypeDiagrams('defensive').length}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Guardar en biblioteca
              </button>
              <button
                type="button"
                onClick={() => openLibraryModal('defensive')}
                className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15"
              >
                Cargar desde biblioteca
              </button>
              <button
                type="button"
                onClick={() => saveCurrentDiagram('defensive')}
                disabled={diagramSaving || !getTypeDiagrams('defensive').length}
                className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {diagramSaving ? 'Guardando...' : 'Guardar jugada'}
              </button>
            </div>
          </div>
          {diagramLoading ? <p className="mt-4 text-sm text-slate-400">Cargando diagramas desde Supabase...</p> : null}
          {diagramError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{diagramError}</p> : null}
          {diagramStatus ? <p className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{diagramStatus}</p> : null}
          <div className="mt-4">
            <button type="button" onClick={() => openDuplicateModal('defensive')} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15">
              Duplicar ABP DEFENSIVA
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
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
                className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {defensiveSetPieceTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setDefensiveType(type.id)}
                className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${defensiveType === type.id ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
              >
                {type.label}
              </button>
            ))}
            {getDiagramOrders('defensive').map((order) => (
              <button
                key={`def-${order}`}
                type="button"
                onClick={() => setDefensiveDiagramOrder(order)}
                className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${defensiveDiagramOrder === order ? 'bg-white text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
              >
                Jugada {order}
              </button>
            ))}
          </div>
          {!getTypeDiagrams('defensive').length ? (
            <p className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-400">Sin jugadas para este tipo. Pulsa Añadir jugada para empezar.</p>
          ) : null}
          <div className="mt-5">
            {getTypeDiagrams('defensive').length ? (
              <SetPieceDiagramEditor
                diagram={getCurrentDiagram('defensive')}
                players={players}
                onChange={(diagram) => updateCurrentDiagram('defensive', diagram)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div ref={sheetRef} className="print-sheet-frame print-current-sheet">
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
              captainPlayerId={captainPlayerId}
            />
          </div>
        ) : printView === 'lanzadores' ? (
          <SetPieceTakersPrintSheet
            match={match}
            sections={setPieceSections}
            takers={setPieceTakers}
            players={players}
          />
        ) : printView === 'abp_ofensiva' ? (
          offensiveType === 'saque_inicio_ofensivo' ? (
            getPrintDiagrams('offensive').map((diagram) => (
              <SetPieceDiagramPrintSheet
                key={`kickoff-current-${diagram.id || diagram.orden}`}
                match={match}
                title={offensiveSetPieceTypes.find((type) => type.id === offensiveType)?.label || 'Saque de inicio'}
                diagrams={[diagram]}
                players={players}
                layout="landscape"
              />
            ))
          ) : (
            chunkDiagrams(getPrintDiagrams('offensive')).map((diagrams, index) => (
              <SetPieceDiagramPrintSheet
                key={`offensive-current-${index}`}
                match={match}
                title={offensiveSetPieceTypes.find((type) => type.id === offensiveType)?.label || 'ABP ofensiva'}
                diagrams={diagrams}
                players={players}
              />
            ))
          )
        ) : (
          chunkDiagrams(getPrintDiagrams('defensive')).map((diagrams, index) => (
            <SetPieceDiagramPrintSheet
              key={`defensive-current-${index}`}
              match={match}
              title={defensiveSetPieceTypes.find((type) => type.id === defensiveType)?.label || 'ABP defensiva'}
              diagrams={diagrams}
              players={players}
            />
          ))
        )}
      </div>

      {printMode === 'dossier' ? (
        <div className="print-dossier">
          {activeDossierPages.flatMap((page) => {
            const pageNumber = activeDossierPages.findIndex((item) => item.id === page.id) + 1;
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
                  captainPlayerId={captainPlayerId}
                  matchKeys={getMatchKeys()}
                  staffNotes={getStaffNotes()}
                  dossierType={dossierType}
                  pageNumber={pageNumber}
                  totalPages={activeSheetCount}
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
                <SetPieceDiagramPrintSheet key={`offensive-dossier-${index}`} match={match} title="ABP ofensiva" diagrams={diagrams} players={players} />
              ));
            }
            if (page.id === 'defensive') {
              return chunkDiagrams(dossierContent.defensiveDiagrams).map((diagrams, index) => (
                <SetPieceDiagramPrintSheet key={`defensive-dossier-${index}`} match={match} title="ABP defensiva" diagrams={diagrams} players={players} />
              ));
            }
            if (page.id === 'kickoff') {
              return dossierContent.kickoffDiagrams.map((diagram) => (
                <SetPieceDiagramPrintSheet
                  key={`kickoff-dossier-${diagram.id || diagram.orden}`}
                  match={match}
                  title="Saque de inicio"
                  diagrams={[diagram]}
                  players={players}
                  layout="landscape"
                />
              ));
            }
            return [(
              <DossierTacticalSheet
                key={`${page.id}-dossier`}
                match={match}
                pageId={page.id}
                dossierType={dossierType}
                keys={getMatchKeys()}
                staffNotes={getStaffNotes()}
                pageNumber={pageNumber}
                totalPages={activeSheetCount}
              />
            )];
          })}
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
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {filteredLibraryItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => loadLibraryItemIntoDiagram(item)}
                  className="rounded-3xl border border-white/5 bg-white/5 p-4 text-left transition hover:border-caudal-electric/40 hover:bg-white/10"
                >
                  <div className="grid grid-cols-[120px_1fr] gap-4">
                    <div className="rounded-2xl bg-white p-2 text-black">
                      <SetPieceDiagramCanvas elements={item.elements || []} readOnly />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{item.nombre}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-caudal-electric">{item.categoria || item.tipo}</p>
                      <p className="mt-2 line-clamp-3 text-xs text-slate-400">{item.descripcion || item.objetivo || 'Sin descripción'}</p>
                    </div>
                  </div>
                </button>
              ))}
              {!libraryLoading && !filteredLibraryItems.length ? (
                <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-400 md:col-span-2">No hay jugadas guardadas en esta categoría de biblioteca.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {duplicateModal ? (
        <div className="print-hidden fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-caudal-950 p-6 shadow-glow">
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
              <select value={duplicateSourceId} onChange={(event) => setDuplicateSourceId(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950">
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
            {duplicateMessage ? <p className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{duplicateMessage}</p> : null}
            {diagramError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{diagramError}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDuplicateModal(null)} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white">Cancelar</button>
              <button type="button" onClick={runDuplicateImport} disabled={!duplicateSourceId || duplicateBusy} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">
                {duplicateBusy ? 'Duplicando...' : 'Duplicar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
