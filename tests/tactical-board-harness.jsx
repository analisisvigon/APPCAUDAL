import React from 'react';
import ReactDOM from 'react-dom/client';
import SystemsTacticalBoardSection from '../src/components/tactical/SystemsTacticalBoardSection';
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
      <SystemsTacticalBoardSection
          fieldView={{ layers: { names: true, zones: true, badges: true, rival: true, caudal: true, connections: true } }}
          onToggleFieldLayer={() => {}}
          initialBoards={{}}
          players={caudalPlayers}
          rivalPlayers={rivalPlayers}
          caudalSystem="4-4-2"
          rivalSystem="4-3-3"
          opponentKey="visual-contract-rival"
          onSave={() => {}}
      />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
