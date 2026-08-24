import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTacticalBoardViewState,
  getTacticalBoardNamesVisibility,
  toggleAllTacticalBoardNames,
  updateTacticalBoardViewState,
} from './tacticalBoardViewState.js';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

let view = createTacticalBoardViewState();
let workspace = { players: {}, arrows: [], ballVisible: false, selectedId: '' };

assert.deepEqual(getTacticalBoardNamesVisibility(view), {
  rival: true,
  caudal: false,
  all: false,
  none: false,
  partial: true,
}, 'por defecto solo se muestran los nombres del rival');

const toggleLayer = (layer) => {
  view = updateTacticalBoardViewState(view, {
    layers: { [layer]: !view.layers[layer] },
  });
};

const interactWithoutChangingView = (label, interaction) => {
  const expectedView = structuredClone(view);
  workspace = interaction(workspace);
  assert.deepEqual(view, expectedView, `${label} no modifica la visualización`);
};

// A-G: CAUDAL apagado sobrevive a todas las familias de interacción táctica.
toggleLayer('caudal');
assert.equal(view.layers.caudal, false, 'CAUDAL se puede ocultar');
interactWithoutChangingView('A: mover un rival', (current) => ({
  ...current,
  players: { ...current.players, 'rival-9': { x: 44, y: 61 } },
}));
interactWithoutChangingView('A: cambiar herramienta', (current) => ({
  ...current,
  activeTool: 'move',
}));
interactWithoutChangingView('B: dibujar un pase', (current) => ({
  ...current,
  arrows: [...current.arrows, { id: 'pass-1', type: 'pass' }],
}));
interactWithoutChangingView('C: dibujar un movimiento', (current) => ({
  ...current,
  arrows: [...current.arrows, { id: 'movement-1', type: 'movement' }],
}));
interactWithoutChangingView('D: añadir o mover el balón', (current) => ({
  ...current,
  ballVisible: !current.ballVisible,
}));
interactWithoutChangingView('E: seleccionar una flecha', (current) => ({
  ...current,
  selectedId: 'pass-1',
}));
interactWithoutChangingView('F: editar una flecha', (current) => ({
  ...current,
  arrows: current.arrows.filter((arrow) => arrow.id !== 'movement-1'),
}));
interactWithoutChangingView('G: deshacer', (current) => ({
  ...current,
  arrows: [...current.arrows, { id: 'movement-1', type: 'movement' }],
}));

const beforeCapture = structuredClone(view);
interactWithoutChangingView('H: entrar en captura', (current) => ({ ...current, capture: true }));
assert.deepEqual(view, beforeCapture);
interactWithoutChangingView('I: salir de captura', (current) => ({ ...current, capture: false }));
assert.deepEqual(view, beforeCapture, 'captura mantiene todas las preferencias visuales');

toggleLayer('caudal');
assert.equal(view.layers.caudal, true, 'J: CAUDAL vuelve a mostrarse solo al pulsarlo');

toggleLayer('rival');
['move', 'pass', 'movement', 'ball', 'select', 'undo'].forEach((action) => {
  interactWithoutChangingView(`K: RIVAL durante ${action}`, (current) => ({
    ...current,
    activeTool: action,
    revision: (current.revision || 0) + 1,
  }));
});
assert.equal(view.layers.rival, false);
assert.equal(view.layers.caudal, true, 'ocultar RIVAL no altera CAUDAL');

view = createTacticalBoardViewState();
view = updateTacticalBoardViewState(view, { layers: { caudalNames: true } });
assert.equal(getTacticalBoardNamesVisibility(view).all, true, 'se pueden mostrar los nombres de ambos equipos');
assert.equal(view.layers.rival, true, 'mostrar u ocultar nombres no cambia los jugadores rivales');
assert.equal(view.layers.caudal, true, 'mostrar u ocultar nombres no cambia los jugadores Caudal');
view = toggleAllTacticalBoardNames(view);
assert.equal(getTacticalBoardNamesVisibility(view).none, true, 'NOMBRES general oculta ambos cuando ambos están visibles');
view = toggleAllTacticalBoardNames(view);
assert.equal(getTacticalBoardNamesVisibility(view).all, true, 'NOMBRES general muestra ambos cuando ambos están ocultos');
view = updateTacticalBoardViewState(view, { layers: { rivalNames: false } });
assert.deepEqual(getTacticalBoardNamesVisibility(view), {
  rival: false,
  caudal: true,
  all: false,
  none: false,
  partial: true,
}, 'también funciona la configuración inversa: solo nombres Caudal');
interactWithoutChangingView('nombres por equipo durante una edición', (current) => ({
  ...current,
  arrows: [...current.arrows, { id: 'names-pass', type: 'pass' }],
}));
view = toggleAllTacticalBoardNames(view);
assert.equal(getTacticalBoardNamesVisibility(view).all, true, 'desde estado parcial NOMBRES general muestra ambos');

// L: todos los controles restantes conservan su valor y no alteran las capas vecinas.
['zones', 'badges', 'connections', 'caudal'].forEach((layer) => {
  const before = structuredClone(view.layers);
  toggleLayer(layer);
  interactWithoutChangingView(`L: ${layer}`, (current) => ({
    ...current,
    selectedId: `${layer}-interaction`,
  }));
  assert.equal(view.layers[layer], !before[layer]);
  Object.keys(before).filter((key) => key !== layer).forEach((key) => {
    assert.equal(view.layers[key], before[key], `${layer} no altera ${key}`);
  });
});

view = createTacticalBoardViewState();
assert.deepEqual(view, {
  mode: 'LIMPIO',
  layers: {
    zones: true,
    rivalNames: true,
    caudalNames: false,
    badges: true,
    rival: true,
    caudal: true,
    connections: true,
    microduels: true,
  },
}, 'un partido nuevo recupera los valores por defecto');

const viewUpdaterStart = appSource.indexOf('const updateFieldViewSettings = (patch) =>');
const viewUpdaterEnd = appSource.indexOf('\n  };', viewUpdaterStart) + 5;
const viewUpdaterSource = appSource.slice(viewUpdaterStart, viewUpdaterEnd);
assert.match(appSource, /useState\(createTacticalBoardViewState\)/, 'la visualización tiene estado UI propio');
assert.match(viewUpdaterSource, /setTacticalBoardViewState/, 'los toggles solo actualizan estado de visualización');
assert.doesNotMatch(viewUpdaterSource, /updatePreAiAnalysisPatch|preAiAnalysis|fieldView:/, 'los toggles no guardan datos tácticos');
assert.match(appSource, /setTacticalBoardViewState\(createTacticalBoardViewState\(\)\);[\s\S]*?\}, \[selectedMatch\?\.id\]\);/, 'el estado se reinicia exclusivamente en la carga de otro partido');
assert.match(appSource, /renderFacingSystemsOverview\(true\)/, 'captura reutiliza el renderer y sus capas actuales');
assert.doesNotMatch(appSource, /selectedPreAiAnalysis\?\.fieldView/, 'la vista temporal no se rehidrata desde Supabase');
assert.match(appSource, /\{layers\.rivalNames \? <span/, 'RIVAL controla todo el texto individual, incluido el rol de respaldo');
assert.match(appSource, /\{layers\.caudalNames \? <span/, 'CAUDAL controla todo el texto individual, incluido el rol de respaldo');
assert.doesNotMatch(appSource, /layers\.rivalNames \|\| !rivalSlot\.player\?\.name/, 'un rol rival no fuerza la reaparición de la etiqueta');
assert.doesNotMatch(appSource, /layers\.caudalNames \|\| !caudalLineup\[index\]/, 'un rol Caudal no fuerza la reaparición de la etiqueta');
assert.match(appSource, /rivalSlot\.slot === 0 \? 'P' : rivalSlot\.slot/, 'el dorsal o referencia gráfica rival permanece fuera del label');
assert.match(appSource, /index === 0 \? 'P' : index/, 'el dorsal o referencia gráfica Caudal permanece fuera del label');
assert.match(appSource, /\{layers\.rival \? rivalSlots\.map/, 'ocultar texto no altera la visibilidad de jugadores rivales');
assert.match(appSource, /\{layers\.caudal \? caudalCoordinates\.map/, 'ocultar texto no altera la visibilidad de jugadores Caudal');
assert.match(appSource, /\['rivalNames', 'Rival', names\.rival\]/);
assert.match(appSource, /\['caudalNames', 'Caudal', names\.caudal\]/);
assert.match(appSource, /aria-pressed=\{names\.partial \? 'mixed' : names\.all\}/, 'el botón general representa el estado parcial');
assert.doesNotMatch(appSource, /layers\.names/, 'ya no existe un booleano compartido que mezcle ambos equipos');

console.log('tacticalBoardViewState tests passed');
