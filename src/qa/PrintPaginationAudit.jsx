import React from 'react';
import ReactDOM from 'react-dom/client';
import { createPortal } from 'react-dom';
import '../index.css';
import '../styles/print.css';
import DossierTacticalSheet from '../components/print/DossierTacticalSheet';
import LineupPrintSheet from '../components/print/LineupPrintSheet';
import MatchPlanPrintSheet from '../components/print/MatchPlanPrintSheet';
import SetPieceDiagramPrintSheet from '../components/print/SetPieceDiagramPrintSheet';
import SetPieceTakersPrintSheet from '../components/print/SetPieceTakersPrintSheet';
import { MATCH_PLAN_PHASES, createMatchPlanSituation } from '../utils/matchPlanPrint';
import { setSetPieceTacticalMeta } from '../utils/setPieceProfessional';

const params = new URLSearchParams(window.location.search);
const caseId = String(params.get('case') || '').toUpperCase();
const count = Math.max(1, Number(params.get('count')) || 1);
const preview = params.get('preview') === '1';
const match = { opponent: 'Rival QA', date: '2026-08-10', isHome: true, preCaudalSystem: '4-4-2' };
const players = Array.from({ length: 16 }, (_, index) => ({
  id: `player-${index + 1}`,
  name: `JUGADOR ${index + 1}`,
  shirt_name: `J${index + 1}`,
  number: index + 1,
  position: index === 11 ? 'Portero' : 'Defensa',
}));
const coordinates = Array.from({ length: 11 }, (_, index) => ({ x: 15 + (index % 4) * 23, y: 83 - Math.floor(index / 4) * 27 }));
const takerSections = [
  { id: 'penaltis', label: 'Penaltis' },
  { id: 'faltas_directas', label: 'Faltas directas' },
  { id: 'faltas_laterales', label: 'Faltas laterales' },
  { id: 'corners', label: 'Córners' },
];
const takers = takerSections.map((section, index) => ({ tipo: section.id, orden: 1, jugador_id: players[index].id }));

const planGeometry = [
  { id: 'plan-own-por', type: 'player', x: 50, y: 63, label: '1', roles: ['POR'] },
  { id: 'plan-own-dfc', type: 'player', x: 38, y: 50, label: '4', roles: ['DFC'] },
  { id: 'plan-own-mc', type: 'player', x: 58, y: 40, label: '8', roles: ['MC'] },
  { id: 'plan-own-dc', type: 'player', x: 50, y: 26, label: '9', roles: ['DC'] },
  { id: 'plan-rival-por', type: 'opponent', x: 50, y: 7, label: 'R', roles: ['POR'] },
  { id: 'plan-rival-dfc', type: 'opponent', x: 42, y: 19, label: 'R', roles: ['DFC'] },
  { id: 'plan-rival-mc', type: 'opponent', x: 62, y: 29, label: 'R', roles: ['MC'] },
  { id: 'plan-ball', type: 'ball', x: 50, y: 35 },
  { id: 'plan-arrow', type: 'arrow', x1: 50, y1: 26, x2: 44, y2: 17 },
  { id: 'plan-curve', type: 'curved_arrow', x1: 58, y1: 40, x2: 72, y2: 22, controlX: 78, controlY: 39 },
  { id: 'plan-block', type: 'block', x: 46, y: 20, width: 6, label: 'BLOQUEO' },
  { id: 'plan-zone', type: 'zone', x: 68, y: 12, width: 20, height: 14, label: 'ZONA ALTA' },
  { id: 'plan-text', type: 'text', x: 20, y: 12, label: 'PRESIONAR' },
];

const createPlanSituation = (order, phase) => {
  const situation = createMatchPlanSituation({ order, phase, title: order === 1 ? 'PRESIÓN ALTA' : 'SALIDA CONTROLADA' });
  return {
    ...situation,
    elements: setSetPieceTacticalMeta(planGeometry.map((element) => ({ ...element, id: `${element.id}-${order}`, x: order === 1 || element.x == null ? element.x : 100 - element.x })), {
      displayLayers: { dorsals: false, abbreviations: true, roles: false, chronology: false, zones: true, texts: true },
      objective: order === 1 ? 'Orientar al rival hacia banda.' : 'Superar la primera línea.',
      collectiveInstructions: [{ id: `key-${order}`, text: order === 1 ? 'DC orienta la salida.' : 'MC ofrece apoyo interior.', order: 1 }],
    }),
  };
};

const planOne = [createPlanSituation(1, MATCH_PLAN_PHASES.WITHOUT_BALL)];
const planTwo = [...planOne, createPlanSituation(2, MATCH_PLAN_PHASES.WITH_BALL)];
const abpElements = setSetPieceTacticalMeta([
  { id: 'abp-player', type: 'player', x: 42, y: 38, label: '9', name: 'J9', roles: ['Rematador'], sequenceOrder: 1, note: 'Atacar primer palo' },
  { id: 'abp-opponent', type: 'opponent', x: 50, y: 26, label: 'R' },
  { id: 'abp-ball', type: 'ball', x: 9, y: 9 },
  { id: 'abp-arrow', type: 'curved_arrow', x1: 42, y1: 38, x2: 50, y2: 17, controlX: 60, controlY: 34 },
], { displayLayers: { dorsals: true, abbreviations: true, roles: true, chronology: true, zones: true, texts: true } });
const diagram = (tipo, orden = 1) => ({ id: `${tipo}-${orden}`, tipo, orden, titulo: `QA ${tipo}`, consigna: 'Acción controlada', elements: abpElements });

const offensiveRoles = ['Bloqueo rematador', 'Remate', 'Vigilancia', 'Arrastre', 'Segunda jugada'];
const defensiveRoles = ['Zona 1', 'Zona 2', 'Primer rechace', 'Segundo rechace', 'Marca individual'];
const createDetailedAbp = (tipo, orden, indicationCount, longCopy = false) => {
  const defensiveType = tipo.includes('defensiv');
  const roles = defensiveType ? defensiveRoles : offensiveRoles;
  const tacticalElements = Array.from({ length: indicationCount }, (_, index) => ({
    id: `${tipo}-${orden}-player-${index + 1}`,
    type: 'player',
    x: 12 + (index % 6) * 14,
    y: 16 + Math.floor(index / 6) * 26,
    label: String(players[index].number),
    player_id: players[index].id,
    roles: [roles[index % roles.length]],
    note: longCopy
      ? `Responsabilidad larga del jugador ${index + 1}: temporizar el movimiento, atacar el espacio asignado y asegurar la segunda acción sin perder la vigilancia.`
      : `Responsabilidad específica del dorsal ${players[index].number}.`,
  }));
  tacticalElements.push(
    { id: `${tipo}-${orden}-opponent`, type: 'opponent', x: 52, y: 24, label: 'R' },
    { id: `${tipo}-${orden}-ball`, type: 'ball', x: 8, y: 8 },
    { id: `${tipo}-${orden}-arrow`, type: 'curved_arrow', x1: 24, y1: 42, x2: 63, y2: 16, controlX: 58, controlY: 45 },
    { id: `${tipo}-${orden}-zone`, type: 'zone', x: 64, y: 9, width: 20, height: 13, label: 'ZONA OBJETIVO' },
  );
  return {
    id: `${tipo}-${orden}-${indicationCount}-${longCopy ? 'long' : 'short'}`,
    tipo,
    orden,
    titulo: defensiveType ? `Defensa control ${orden}` : `Ataque control ${orden}`,
    consigna: longCopy
      ? 'Coordinar el inicio con la señal, respetar las alturas y completar cada movimiento sin abandonar la responsabilidad posterior.'
      : 'Coordinar la acción desde la señal.',
    elements: setSetPieceTacticalMeta(tacticalElements, {
      signal: 'MANO ARRIBA',
      objective: defensiveType ? 'Ganar el primer contacto' : 'Atacar el primer palo',
      libraryMarking: defensiveType ? 'Mixto' : '',
      libraryZone: defensiveType ? '' : 'Primer palo',
      deliveryType: defensiveType ? '' : 'open',
      displayLayers: { dorsals: true, abbreviations: true, roles: true, chronology: false, zones: true, texts: true },
    }),
  };
};

const detailedAbpSheet = (key, diagrams) => <SetPieceDiagramPrintSheet key={key} match={match} title="QA dossier ABP" diagrams={diagrams} players={players} />;

const lineup = <LineupPrintSheet key="lineup" match={match} starters={players.slice(0, 11)} bench={players.slice(11)} coordinates={coordinates} system="4-4-2" kit="home" />;
const keys = <DossierTacticalSheet key="keys" match={match} pageId="keys" dossierType="Dossier QA" keys={['Presión coordinada', 'Atacar espacios']} pageNumber={1} totalPages={7} />;
const takersSheet = <SetPieceTakersPrintSheet key="takers" match={match} sections={takerSections} takers={takers} players={players} />;
const offensive = <SetPieceDiagramPrintSheet key="offensive" match={match} title="ABP ofensiva" diagrams={[diagram('corner_ofensivo')]} players={players} />;
const defensive = <SetPieceDiagramPrintSheet key="defensive" match={match} title="ABP defensiva" diagrams={[diagram('corner_defensivo')]} players={players} />;
const kickoff = <SetPieceDiagramPrintSheet key="kickoff" match={match} title="Saque de inicio" diagrams={[diagram('saque_inicio_ofensivo')]} players={players} />;

const buildCaseSheets = () => {
  if (caseId === 'A') return [lineup];
  if (caseId === 'B') return [lineup, keys];
  if (caseId === 'C') return [lineup, keys, takersSheet, offensive, defensive, kickoff, <MatchPlanPrintSheet key="plan" match={match} situations={planTwo} />];
  if (caseId === 'D') return [<MatchPlanPrintSheet key="plan" match={match} situations={planOne} />];
  if (caseId === 'E') return [<MatchPlanPrintSheet key="plan" match={match} situations={planTwo} />];
  if (caseId === 'F') return [lineup, <MatchPlanPrintSheet key="plan" match={match} situations={planTwo} />];
  if (caseId === 'G') return [keys];
  if (caseId === 'TAKERS') return [takersSheet];
  if (caseId === 'ABP-A') return [detailedAbpSheet('abp-a', [createDetailedAbp('corner_ofensivo', 1, 3)])];
  if (caseId === 'ABP-B') return [detailedAbpSheet('abp-b', [createDetailedAbp('corner_ofensivo', 1, 5), createDetailedAbp('falta_lateral_ofensiva', 2, 8)])];
  if (caseId === 'ABP-C') return [detailedAbpSheet('abp-c', [createDetailedAbp('corner_defensivo', 1, 4)])];
  if (caseId === 'ABP-D') return [detailedAbpSheet('abp-d', [createDetailedAbp('corner_defensivo', 1, 10), createDetailedAbp('falta_lateral_defensiva', 2, 11)])];
  if (caseId === 'ABP-E') return [detailedAbpSheet('abp-e', [createDetailedAbp('corner_ofensivo', 1, 6), createDetailedAbp('corner_defensivo', 2, 6)])];
  if (caseId === 'ABP-G') return [detailedAbpSheet('abp-g', [createDetailedAbp('corner_ofensivo', 1, 11, true)])];
  if (caseId === 'ABP-H') return [detailedAbpSheet('abp-h', [createDetailedAbp('corner_ofensivo', 1, 10, true), createDetailedAbp('corner_defensivo', 2, 11, true)])];
  if (caseId === 'ABP-J') return [lineup, takersSheet, detailedAbpSheet('abp-j-offensive', [createDetailedAbp('corner_ofensivo', 1, 4)]), detailedAbpSheet('abp-j-defensive', [createDetailedAbp('corner_defensivo', 1, 10)])];
  return Array.from({ length: count }, (_, index) => (
    <DossierTacticalSheet key={index} match={match} pageId="keys" dossierType="Dossier QA" keys={[`Contenido real ${index + 1}`]} pageNumber={index + 1} totalPages={count} />
  ));
};

function Audit() {
  if (preview) {
    return <><style>{'.qa-visible-preview, .qa-visible-preview * { visibility: visible !important; } .qa-visible-preview .print-dossier { display: block !important; }'}</style><main className="qa-visible-preview" style={{ minHeight: '100vh', padding: 24, background: '#d1d5db' }}><div className="print-dossier">{buildCaseSheets()}</div></main></>;
  }
  const dossier = createPortal(
    <section className="printing-dossier print-dossier-portal" aria-label={`Dossier imprimible QA ${caseId || count}`}>
      <div className="print-dossier">{buildCaseSheets()}</div>
    </section>,
    document.body
  );

  return (
    <>
      <div className="min-h-screen bg-slate-950">
        <header className="min-h-[180px]">Cabecera normal de aplicación</header>
        <main className="min-h-screen p-8">
          <section className="match-print-tab space-y-6">
            <div className="print-hidden min-h-[420px]">Controles normales de impresión</div>
            <div className="print-sheet-frame"><div /></div>
            <div className="print-hidden min-h-[320px]">Contenido posterior normal</div>
          </section>
        </main>
        <footer className="min-h-[240px]">Pie normal de aplicación</footer>
      </div>
      {dossier}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Audit />);
