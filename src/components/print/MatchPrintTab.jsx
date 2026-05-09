import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import LineupPrintSheet from './LineupPrintSheet';
import SetPieceDiagramEditor from './SetPieceDiagramEditor';
import SetPieceDiagramPrintSheet from './SetPieceDiagramPrintSheet';
import SetPieceTakersPrintSheet from './SetPieceTakersPrintSheet';

const setPieceSections = [
  { id: 'penaltis', label: 'Penaltis' },
  { id: 'faltas_directas', label: 'Faltas directas' },
  { id: 'faltas_laterales', label: 'Faltas laterales' },
  { id: 'corners', label: 'Córners' },
  { id: 'saques_banda', label: 'Saques de banda' },
  { id: 'rechaces_segunda_jugada', label: 'Rechaces / segunda jugada' },
];

const offensiveSetPieceTypes = [
  { id: 'corner_ofensivo', label: 'Córner ofensivo' },
  { id: 'falta_lateral_ofensiva', label: 'Falta lateral ofensiva' },
  { id: 'saque_banda_ofensivo', label: 'Saque de banda ofensivo' },
];

const defensiveSetPieceTypes = [
  { id: 'corner_defensivo', label: 'Córner defensivo' },
  { id: 'falta_lateral_defensiva', label: 'Falta lateral defensiva' },
  { id: 'saque_banda_defensivo', label: 'Saque de banda defensivo' },
  { id: 'saque_inicio', label: 'Saque de inicio' },
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

export default function MatchPrintTab({ match, players = [], getFormationCoordinates }) {
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
  const sheetRef = useRef(null);

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
        const defaults = [
          ...offensiveSetPieceTypes.flatMap((type) => [1, 2].map((order) => createDefaultDiagram(type.id, order, offensiveSetPieceTypes))),
          ...defensiveSetPieceTypes.flatMap((type) => [1, 2].map((order) => createDefaultDiagram(type.id, order, defensiveSetPieceTypes))),
        ].map((diagram) => {
          const stored = (data || []).find((item) => item.tipo === diagram.tipo && Number(item.orden) === Number(diagram.orden));
          return { ...diagram, ...(stored || {}), partido_id: match.id, elements: Array.isArray(stored?.elements) ? stored.elements : diagram.elements };
        });
        setSetPieceDiagrams(defaults);
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
    const lineupNames = (match?.statsLineup || []).some(Boolean)
      ? match.statsLineup
      : (match?.preCaudalLineup || []).some(Boolean)
        ? match.preCaudalLineup
        : players.slice(0, 11).map((player) => player.name);
    const byName = new Map(players.map((player) => [normalizeText(player.name), player]));
    const starters = Array.from({ length: 11 }, (_, index) => {
      const name = lineupNames[index] || '';
      const player = byName.get(normalizeText(name));
      return toPrintPlayer(player, name || `Puesto ${index + 1}`);
    });
    const starterNames = new Set(starters.map((player) => normalizeText(player.name)));
    const calledPlayers = match?.statsCalledPlayers?.length ? match.statsCalledPlayers : players;
    const bench = calledPlayers
      .filter((player) => !starterNames.has(normalizeText(player.name)))
      .map((player) => toPrintPlayer(byName.get(normalizeText(player.name)) || player, player.name));
    const coordinates = typeof getFormationCoordinates === 'function' ? getFormationCoordinates(system) : [];
    return { system, starters, bench, coordinates };
  }, [match, players, getFormationCoordinates]);

  const handlePreview = () => {
    sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrint = () => {
    window.print();
  };

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

  const getPrintDiagrams = (mode) => {
    const definitions = getDiagramDefinitions(mode);
    const type = getDiagramType(mode);
    return [1, 2].map((order) => (
      setPieceDiagrams.find((diagram) => diagram.tipo === type && Number(diagram.orden) === order) || {
        ...createDefaultDiagram(type, order, definitions),
        partido_id: match?.id || '',
      }
    ));
  };

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
        elements: Array.isArray(diagram.elements) ? diagram.elements : [],
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

  const currentOffensiveNote = getOffensiveNote();
  const currentDefensiveNote = getDefensiveNote();
  const printTitle = printView === 'alineacion' ? 'Alineación' : printView === 'lanzadores' ? 'Lanzadores' : printView === 'abp_ofensiva' ? 'ABP ofensiva' : 'ABP defensiva';

  return (
    <section className="match-print-tab space-y-6">
      <div className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Impresión</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{printTitle}</h3>
            <p className="mt-2 text-sm text-slate-400">Hoja A4 en blanco y negro para el cuerpo técnico.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
            <button
              type="button"
              onClick={() => saveCurrentDiagram('offensive')}
              disabled={diagramSaving}
              className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {diagramSaving ? 'Guardando...' : 'Guardar jugada'}
            </button>
          </div>
          {diagramLoading ? <p className="mt-4 text-sm text-slate-400">Cargando diagramas desde Supabase...</p> : null}
          {diagramError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{diagramError}</p> : null}
          {diagramStatus ? <p className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{diagramStatus}</p> : null}
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
            {[1, 2].map((order) => (
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
          <div className="mt-5">
            <SetPieceDiagramEditor
              diagram={getCurrentDiagram('offensive')}
              players={players}
              onChange={(diagram) => updateCurrentDiagram('offensive', diagram)}
            />
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
            <button
              type="button"
              onClick={() => saveCurrentDiagram('defensive')}
              disabled={diagramSaving}
              className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {diagramSaving ? 'Guardando...' : 'Guardar jugada'}
            </button>
          </div>
          {diagramLoading ? <p className="mt-4 text-sm text-slate-400">Cargando diagramas desde Supabase...</p> : null}
          {diagramError ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{diagramError}</p> : null}
          {diagramStatus ? <p className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{diagramStatus}</p> : null}
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
            {[1, 2].map((order) => (
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
          <div className="mt-5">
            <SetPieceDiagramEditor
              diagram={getCurrentDiagram('defensive')}
              players={players}
              onChange={(diagram) => updateCurrentDiagram('defensive', diagram)}
            />
          </div>
        </div>
      ) : null}

      <div ref={sheetRef} className="print-sheet-frame">
        {printView === 'alineacion' ? (
          <LineupPrintSheet
            match={match}
            starters={printData.starters}
            bench={printData.bench}
            coordinates={printData.coordinates}
            system={printData.system}
            kit={kit}
          />
        ) : printView === 'lanzadores' ? (
          <SetPieceTakersPrintSheet
            match={match}
            sections={setPieceSections}
            takers={setPieceTakers}
            players={players}
          />
        ) : printView === 'abp_ofensiva' ? (
          <SetPieceDiagramPrintSheet
            match={match}
            title={offensiveSetPieceTypes.find((type) => type.id === offensiveType)?.label || 'ABP ofensiva'}
            diagrams={getPrintDiagrams('offensive')}
          />
        ) : (
          <SetPieceDiagramPrintSheet
            match={match}
            title={defensiveSetPieceTypes.find((type) => type.id === defensiveType)?.label || 'ABP defensiva'}
            diagrams={getPrintDiagrams('defensive')}
          />
        )}
      </div>
    </section>
  );
}
