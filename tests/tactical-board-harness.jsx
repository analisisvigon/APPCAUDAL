import React from 'react';
import ReactDOM from 'react-dom/client';
import TacticalPhaseEditor from '../src/components/tactical/TacticalPhaseEditor';
import '../src/index.css';

const makePlayers = (prefix) => Array.from({ length: 11 }, (_, index) => ({
  id: `${prefix}-${index + 1}`,
  number: index + 1,
  name: `${prefix === 'caudal' ? 'Caudal' : 'Rival'} ${index + 1}`,
}));

const caudalPlayers = makePlayers('caudal');
const rivalPlayers = makePlayers('rival');

function App() {
  return (
    <main className="min-h-screen bg-[#050d1b] p-4 text-white">
      <section className="border border-white/10 bg-[#091428]/82 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">Campo táctico</p>
            <h1 className="mt-1 text-2xl font-black text-white">Pizarra de partido</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['Nombres', 'Zonas', 'Alertas', 'Rival', 'Caudal', 'Conexiones'].map((label) => (
              <button key={label} type="button" className="border border-caudal-electric/25 bg-caudal-electric/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-caudal-electric">{label}</button>
            ))}
          </div>
        </div>
        <TacticalPhaseEditor
          initialBoards={{}}
          players={caudalPlayers}
          rivalPlayers={rivalPlayers}
          caudalSystem="4-4-2"
          rivalSystem="4-3-3"
          opponentKey="visual-contract-rival"
          onSave={() => {}}
        />
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
