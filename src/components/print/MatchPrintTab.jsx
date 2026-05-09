import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import LineupPrintSheet from './LineupPrintSheet';
import SetPieceTakersPrintSheet from './SetPieceTakersPrintSheet';

const setPieceSections = [
  { id: 'penaltis', label: 'Penaltis' },
  { id: 'faltas_directas', label: 'Faltas directas' },
  { id: 'faltas_laterales', label: 'Faltas laterales' },
  { id: 'corners', label: 'Córners' },
  { id: 'saques_banda', label: 'Saques de banda' },
  { id: 'rechaces_segunda_jugada', label: 'Rechaces / segunda jugada' },
];

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

  return (
    <section className="match-print-tab space-y-6">
      <div className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Impresión</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{printView === 'alineacion' ? 'Alineación' : 'Lanzadores'}</h3>
            <p className="mt-2 text-sm text-slate-400">Hoja A4 en blanco y negro para el cuerpo técnico.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex rounded-2xl bg-white/10 p-1">
              {[
                ['alineacion', 'Alineación'],
                ['lanzadores', 'Lanzadores'],
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
              Imprimir {printView === 'alineacion' ? 'alineación' : 'lanzadores'}
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
        ) : (
          <SetPieceTakersPrintSheet
            match={match}
            sections={setPieceSections}
            takers={setPieceTakers}
            players={players}
          />
        )}
      </div>
    </section>
  );
}
