import React, { useEffect } from 'react';
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
const query = new URLSearchParams(window.location.search);
const caudalSystem = query.get('caudal') || '4-4-2';
const rivalSystem = query.get('rival') || '4-3-3';

function App() {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const svg = document.querySelector('.set-piece-diagram-canvas');
      if (!svg) return;
      const rectToObject = (rect) => ({ width: rect.width, height: rect.height });
      const playerPositions = [...svg.querySelectorAll('g.diagram-draggable')]
        .filter((group) => group.querySelectorAll('text').length >= 1)
        .map((group, index) => {
          const image = group.querySelector(':scope > image');
          const circle = group.querySelector(':scope > circle');
          return {
            index,
            x: image ? Number(image.getAttribute('x')) + 3.2 : Number(circle?.getAttribute('cx')),
            y: image ? Number(image.getAttribute('y')) + 3.2 : Number(circle?.getAttribute('cy')),
          };
        });
      const connectionPositions = [...svg.querySelectorAll('g.diagram-draggable')]
        .map((group) => group.querySelector('path[marker-end]')?.getAttribute('d'))
        .filter(Boolean);
      document.body.dataset.tacticalBoardMetrics = encodeURIComponent(JSON.stringify({
        wrapper: rectToObject(svg.parentElement.getBoundingClientRect()),
        svg: rectToObject(svg.getBoundingClientRect()),
        viewBox: svg.getAttribute('viewBox'),
        playerPositions,
        connectionPositions,
      }));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, []);

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
          initialBoards={{
            systems_board: {
              connections: [
                { id: 'pass-1', type: 'pass', originX: 0.5, originY: 0.2, destinationX: 0.3, destinationY: 0.56, destinationPlayerId: 'caudal-8' },
                { id: 'move-1', type: 'movement', originX: 0.25, originY: 0.65, destinationX: 0.42, destinationY: 0.42, destinationPlayerId: null },
              ],
            },
          }}
          players={caudalPlayers}
          rivalPlayers={rivalPlayers}
          caudalSystem={caudalSystem}
          rivalSystem={rivalSystem}
          opponentKey="visual-contract-rival"
          onSave={() => {}}
        />
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
