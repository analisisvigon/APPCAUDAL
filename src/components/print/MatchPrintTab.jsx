import { useMemo, useRef, useState } from 'react';
import LineupPrintSheet from './LineupPrintSheet';

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
  const [kit, setKit] = useState('home');
  const sheetRef = useRef(null);

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

  return (
    <section className="match-print-tab space-y-6">
      <div className="print-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Impresión</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Alineación</h3>
            <p className="mt-2 text-sm text-slate-400">Hoja A4 en blanco y negro para el cuerpo técnico.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Equipación</span>
              <select value={kit} onChange={(event) => setKit(event.target.value)} className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950">
                <option value="home">Titular / blanca</option>
                <option value="away">Suplente / amarilla a rayas</option>
              </select>
            </label>
            <button type="button" onClick={handlePreview} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15">
              Vista previa
            </button>
            <button type="button" onClick={handlePrint} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-[#7aacff]">
              Imprimir
            </button>
            <button type="button" onClick={handlePrint} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15">
              Guardar PDF
            </button>
          </div>
        </div>
      </div>

      <div ref={sheetRef} className="print-sheet-frame">
        <LineupPrintSheet
          match={match}
          starters={printData.starters}
          bench={printData.bench}
          coordinates={printData.coordinates}
          system={printData.system}
          kit={kit}
        />
      </div>
    </section>
  );
}
