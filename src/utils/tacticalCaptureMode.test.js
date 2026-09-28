import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildTacticalCapturePresentation,
  getTacticalCaptureVisualIdentity,
} from './tacticalCapturePresentation.js';
import {
  createTacticalBoardViewState,
  updateTacticalBoardViewState,
} from './tacticalBoardViewState.js';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../components/tactical/TacticalCaptureSidebar.jsx', import.meta.url), 'utf8');
const captureStart = appSource.indexOf("if (tacticalCaptureMode && typeof document !== 'undefined')");
const normalViewStart = appSource.indexOf("<div className={isPreTalkMode ? 'space-y-4' : 'space-y-5'}>", captureStart);
const captureViewSource = appSource.slice(captureStart, normalViewStart);
const boardStart = appSource.indexOf('const renderFacingSystemsOverview =');
const boardEnd = appSource.indexOf('\n  const clearSelectedTeamField', boardStart);
const boardSource = appSource.slice(boardStart, boardEnd);

assert.ok(captureStart > 0 && normalViewStart > captureStart, 'existe una única rama visual gobernada por tacticalCaptureMode');
assert.match(captureViewSource, /createPortal\(/, 'captura cubre la navegación general');
assert.match(captureViewSource, /data-tactical-capture="true"/);
assert.match(captureViewSource, /renderFacingSystemsOverview\(true\)/, 'captura reutiliza exactamente el renderer existente');
assert.match(captureViewSource, /<TacticalCaptureSidebar[\s\S]*?phase=\{tacticalGamePhase\}[\s\S]*?transitionType=\{transitionType\}[\s\S]*?presentation=\{capturePresentation\}/);
assert.doesNotMatch(sidebarSource, /presentation\.phase/, 'el supratítulo no depende de la macrofase canónica');
assert.match(sidebarSource, /presentation\.situation/);
assert.match(sidebarSource, /presentation\.playStyle/);
assert.match(sidebarSource, /presentation\.description/);
assert.match(sidebarSource, /tactical-capture-sidebar/);
assert.match(sidebarSource, /tactical-capture-phase-block/);
assert.match(sidebarSource, /tactical-capture-description-block/);
assert.match(captureViewSource, />\s*Salir de captura\s*</);
assert.doesNotMatch(captureViewSource, /caudalSystem|rivalSystem|selectedTacticalPlay\.name/, 'la composición no muestra sistemas ni nombres técnicos de jugada');
assert.doesNotMatch(`${captureViewSource}\n${sidebarSource}`, /<header|tactical-capture-context/, 'no existe una cabecera superior que reste altura al campo');
assert.doesNotMatch(captureViewSource, /playLabel|Jugada\s*[1-9]/i, 'captura nunca presenta una numeración de jugada');
assert.doesNotMatch(captureViewSource, /Sin descripción|textarea|selectDefensiveSituation|createTacticalPlayForEditing|saveActiveTacticalWorkspace/);

const defensiveHigh = buildTacticalCapturePresentation({
  phaseLabel: 'Fase defensiva',
  situationLabel: 'Bloque alto',
  selectedPlay: { id: 'a', description: 'Marcas individuales.' },
});
assert.deepEqual(defensiveHigh, {
  phase: 'Fase defensiva',
  situation: 'Bloque alto',
  playStyle: '',
  description: 'Marcas individuales.',
}, 'fase, situación y descripción comparten el panel derecho');

assert.deepEqual(buildTacticalCapturePresentation({
  phaseLabel: 'Fase ofensiva',
  situationLabel: 'Creación',
  playStyleLabel: 'Juego combinativo',
  selectedPlay: { id: 'style-combinative', description: 'Progresar mediante apoyos.' },
}), {
  phase: 'Fase ofensiva',
  situation: 'Creación',
  playStyle: 'Juego combinativo',
  description: 'Progresar mediante apoyos.',
}, 'la presentación ofensiva incluye el tipo de juego canónico');
assert.equal(buildTacticalCapturePresentation({ playStyleLabel: 'Juego directo' }).playStyle, 'Juego directo');
assert.equal(buildTacticalCapturePresentation({}).playStyle, '', 'una jugada sin tipo no genera una línea vacía');

const defensiveHighIdentity = getTacticalCaptureVisualIdentity({ phase: 'defensive', moment: 'high_block' });
const defensiveMidIdentity = getTacticalCaptureVisualIdentity({ phase: 'defensive', moment: 'mid_block' });
const defensiveLowIdentity = getTacticalCaptureVisualIdentity({ phase: 'defensive', moment: 'low_block' });
assert.equal(defensiveHighIdentity.key, 'defensive');
assert.equal(defensiveHighIdentity.macroLabel, 'DEFENSA');
assert.equal(defensiveHighIdentity.accessibleLabel, 'Fase defensiva');
assert.deepEqual(
  [defensiveHighIdentity.momentAccent, defensiveMidIdentity.momentAccent, defensiveLowIdentity.momentAccent],
  ['125, 211, 252', '56, 189, 248', '2, 132, 199'],
  'los tres bloques defensivos comparten familia azul con intensidades distintas'
);
assert.equal(getTacticalCaptureVisualIdentity({ phase: 'offensive' }).macroLabel, 'ATAQUE');
const transitionDefenseAttackIdentity = getTacticalCaptureVisualIdentity({
  phase: 'transition',
  transitionType: 'offensive_transition',
});
assert.equal(transitionDefenseAttackIdentity.key, 'transition-defense-attack');
assert.equal(transitionDefenseAttackIdentity.directionLabel, 'DEF → ATQ');
const transitionAttackDefenseIdentity = getTacticalCaptureVisualIdentity({
  phase: 'transition',
  transitionType: 'defensive_transition',
});
assert.equal(transitionAttackDefenseIdentity.key, 'transition-attack-defense');
assert.equal(transitionAttackDefenseIdentity.directionLabel, 'ATQ → DEF');
const offensiveAccents = ['build_up', 'creation', 'finishing'].map((moment) => (
  getTacticalCaptureVisualIdentity({ phase: 'offensive', moment }).momentAccent
));
assert.equal(new Set(offensiveAccents).size, 3, 'inicio, creación y finalización tienen variantes ámbar distintas');
assert.equal(
  getTacticalCaptureVisualIdentity({ phase: 'offensive', moment: 'creation', behavior: 'combinative' }).behaviorKey,
  'combinative',
  'el tipo de juego persistido llega al presenter sin heurísticas'
);
assert.notEqual(
  getTacticalCaptureVisualIdentity({ phase: 'transition', transitionType: 'offensive_transition', behavior: 'fast_attack' }).momentAccent,
  getTacticalCaptureVisualIdentity({ phase: 'transition', transitionType: 'offensive_transition', behavior: 'keep_possession' }).momentAccent,
  'los comportamientos de una misma dirección de transición se distinguen tonalmente'
);
assert.equal(
  getTacticalCaptureVisualIdentity({ phase: 'set_piece', moment: 'wide_free_kick', behavior: 'offensive_set_piece' }).momentKey,
  'wide_free_kick',
  'ABP reutiliza su acción persistida como subtipo visual'
);
assert.match(sidebarSource, /aria-label=\{identity\.accessibleLabel\}/, 'las abreviaturas mantienen un nombre completo accesible');
assert.match(sidebarSource, /data-capture-phase=\{identity\.key\}/, 'cada macrofase expone una identidad visual estable');
assert.match(sidebarSource, /data-capture-moment=\{identity\.momentKey\}/, 'cada momento expone una variante visual estable');
assert.match(sidebarSource, /style=\{identity\.cssVariables\}/, 'el presenter centraliza los acentos del panel');
assert.match(sidebarSource, /tactical-capture-eyebrow">FASE DEL JUEGO</, 'todas las macrofases comparten el mismo supratítulo');
assert.doesNotMatch(sidebarSource, /tactical-capture-watermark|identity\.mark/, 'el panel no incluye una marca tipográfica decorativa');
assert.match(appSource, /transitionBehaviourOptions\[transitionType\]\?\.find[\s\S]*?transitionFieldZoneOptions\.find/, 'la transición muestra comportamiento y zona reales como momento');
assert.match(appSource, /tacticalGamePhase === 'offensive' && selectedTacticalPlay\?\.playStyle[\s\S]*?normalizeOffensivePlayStyle\(selectedTacticalPlay\.playStyle\)/, 'combinativo/directo procede de la jugada persistida seleccionada');
assert.match(captureViewSource, /moment=\{captureMoment\}[\s\S]*?behavior=\{captureBehavior\}/, 'el panel recibe momento y comportamiento canónicos');
assert.match(appSource, /className="tactical-abp-information-panel"[\s\S]*?data-capture-moment=\{captureVisualIdentity\.momentKey\}/, 'ABP aplica la misma identidad a su panel informativo existente');

assert.equal(buildTacticalCapturePresentation({
  phaseLabel: 'Fase defensiva',
  situationLabel: 'Bloque medio',
}).situation, 'Bloque medio', 'B: bloque medio');
assert.equal(buildTacticalCapturePresentation({
  phaseLabel: 'Fase ofensiva',
  situationLabel: 'Inicio',
}).phase, 'Fase ofensiva', 'C: fase ofensiva');
assert.deepEqual(buildTacticalCapturePresentation({
  phaseLabel: 'ABP',
  situationLabel: 'Córner ofensivo',
  selectedPlay: { id: 'abp', description: 'Atacar primer palo.' },
}), {
  phase: 'ABP',
  situation: 'Córner ofensivo',
  playStyle: '',
  description: 'Atacar primer palo.',
}, 'D: ABP usa la misma composición y descripción');

let viewState = createTacticalBoardViewState();
viewState = updateTacticalBoardViewState(viewState, { layers: { caudal: false, rival: false } });
assert.equal(viewState.layers.caudal, false, 'E: CAUDAL permanece oculto');
assert.equal(viewState.layers.rival, false, 'F: RIVAL permanece oculto');
assert.match(boardSource, /const fieldView = getFieldViewSettings\(\);/);
assert.match(boardSource, /\{\(layers\.rival \|\| \(tacticalCaptureMode && tacticalGamePhase === 'set_piece'\)\) \? rivalSlots\.map/);
assert.match(boardSource, /\{layers\.caudal && !\(tacticalCaptureMode && tacticalGamePhase === 'set_piece'\) \? caudalCoordinates\.map/);
assert.match(boardSource, /rivalSlot\.player \? displayPlayerName\(rivalSlot\.player\) : rivalSlot\.role/, 'rival prioriza nombre de camiseta mediante el helper común');
assert.match(boardSource, /caudalPlayer \? displayPlayerName\(caudalPlayer\)/, 'Caudal prioriza nombre de camiseta mediante el helper común');

const emptyDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'empty', description: '   ' },
});
assert.equal(emptyDescription.description, '', 'G: la descripción vacía activa el layout de campo completo');
assert.doesNotMatch(captureViewSource, /Sin descripción/);

const singleLineDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'single', description: 'Una sola línea.' },
}).description;
const manualLinesDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'lines', description: '. Puntas con centrales y pivotes\n. Posibilidad de salto de extremo a central.' },
}).description;
const fourLinesDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'four', description: 'Línea 1\nLínea 2\nLínea 3\nLínea 4' },
}).description;
const paragraphsDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'paragraphs', description: 'Primera idea.\n\nSegunda idea.' },
}).description;
const templateDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'template-play', sourceTemplateId: 'template-1', description: 'Línea A\nLínea B' },
}).description;
assert.equal(singleLineDescription, 'Una sola línea.', 'una línea no cambia');
assert.equal(manualLinesDescription, '. Puntas con centrales y pivotes\n. Posibilidad de salto de extremo a central.', 'dos saltos manuales llegan intactos al render');
assert.equal(fourLinesDescription.split('\n').length, 4, 'cuatro líneas conservan su estructura');
assert.equal(paragraphsDescription, 'Primera idea.\n\nSegunda idea.', 'una línea vacía entre párrafos se conserva');
assert.equal(templateDescription, 'Línea A\nLínea B', 'una descripción procedente de plantilla usa el mismo valor de jugada');
assert.equal(buildTacticalCapturePresentation({ selectedPlay: { description: manualLinesDescription } }).description, manualLinesDescription, 'salir y volver a captura no transforma el texto');

assert.deepEqual(buildTacticalCapturePresentation({
  selectedPlay: { id: 'two', description: '' },
}), { phase: '', situation: '', playStyle: '', description: '' }, 'varias jugadas no añaden metadatos de numeración a captura');

assert.match(boardSource, /selectedDefensivePlay\.arrows \|\| \[\]/, 'J: captura consume los pases y movimientos de la jugada actual');
assert.match(boardSource, /getTacticalBoardArrowPath\(arrow\)/, 'J: conserva flechas rectas y curvas editadas');
assert.match(boardSource, /enableDefensiveEditing && tacticalBallVisible/, 'D y J: conserva el balón actual');
assert.match(boardSource, /!tacticalCaptureMode \? \([\s\S]*?<span>Rival \{rivalSystem\}<\/span>[\s\S]*?<span>Caudal \{caudalSystem\}<\/span>/, 'los sistemas solo permanecen en la vista normal');

assert.match(appSource, /document\.body\.style\.overflow = 'hidden'/);
assert.match(appSource, /document\.documentElement\.style\.overflow = 'hidden'/);
assert.match(appSource, /if \(event\.key === 'Escape'\) setTacticalCaptureMode\(false\)/);
assert.match(appSource, /if \(tacticalCaptureMode \|\| defensiveTool !== 'move'\) return;/, 'captura no puede iniciar ediciones');

assert.match(cssSource, /\.tactical-capture-root\s*\{[\s\S]*position: fixed;[\s\S]*height: 100dvh;[\s\S]*overflow: hidden;/);
assert.match(cssSource, /\.tactical-capture-root\s*\{[\s\S]*display: flex;[\s\S]*padding: 16px;/, 'el portal dedica toda la altura salvo 16 px por borde');
assert.doesNotMatch(cssSource, /\.tactical-capture-context|\.tactical-capture-play\s*\{|stage--with-description|stage--field-only/, 'se eliminaron las reglas del layout anterior');
assert.match(cssSource, /\.tactical-capture-stage\s*\{[\s\S]*display: flex;[\s\S]*height: 100%;/, 'campo y panel forman una única fila a altura completa');
assert.match(cssSource, /\.tactical-capture-board-shell\s*\{[\s\S]*container-type: size;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;/);
assert.match(cssSource, /flex-basis: min\(896px, calc\(\(100dvh - 32px\) \* 0\.833333\)\);/, 'el campo usa toda la altura salvo los dos márgenes de 16 px');
assert.match(cssSource, /width: min\(100cqw, calc\(100cqh \* 0\.833333\)\)/, 'el campo conserva su proporción usando el espacio real del contenedor');
assert.match(cssSource, /\.tactical-capture-sidebar\s*\{[\s\S]*flex: 1 1 0;[\s\S]*align-self: flex-start;[\s\S]*justify-content: flex-start;/, 'fase y descripción comparten un panel compacto');
assert.match(cssSource, /\.tactical-capture-phase\s*\{[\s\S]*font-size: clamp\(44px, 5\.1vw, 92px\)/, 'la macrofase mantiene la jerarquía con una reducción aproximada del 12 %');
assert.match(cssSource, /\.tactical-capture-direction\s*\{[\s\S]*border-left:[\s\S]*font-size: clamp\(34px, 3\.8vw, 66px\)/, 'las transiciones tienen dirección textual y señal gráfica');
assert.match(cssSource, /data-capture-phase\^='transition-'[\s\S]*?\.tactical-capture-situation[\s\S]*?white-space: normal;/, 'los comportamientos largos de transición se muestran completos');
assert.match(cssSource, /--capture-base-accent-rgb:/, 'la macrofase conserva un acento base propio');
assert.match(cssSource, /--capture-moment-accent-rgb:/, 'el segundo nivel dispone de un acento tonal independiente');
assert.match(cssSource, /\.tactical-capture-sidebar::before[\s\S]*?var\(--capture-moment-accent-rgb\)/, 'la línea superior expresa el momento');
assert.match(cssSource, /\.tactical-capture-situation\s*\{[\s\S]*?color: rgb\(var\(--capture-moment-accent-rgb\)\)/, 'el rótulo del momento refuerza su variante');
assert.match(cssSource, /\.tactical-capture-play-style\s*\{[\s\S]*?border:[\s\S]*?background:[\s\S]*?text-transform: uppercase;/, 'combinativo/directo se presenta como descriptor secundario legible');
assert.match(cssSource, /\.tactical-abp-information-panel::before[\s\S]*?var\(--capture-moment-accent-rgb\)/, 'ABP diferencia sus acciones en el panel existente');
assert.doesNotMatch(cssSource, /\.tactical-capture-watermark\s*\{/, 'la marca tipográfica gigante se elimina también de los estilos');
assert.match(cssSource, /\.tactical-capture-description\s*\{[\s\S]*font-size: clamp\(18px,[\s\S]*line-height: 1\.48;/, 'la descripción mantiene tamaño de presentación');
assert.match(cssSource, /\.tactical-capture-description\s*\{[\s\S]*overflow-wrap: anywhere;[\s\S]*white-space: pre-wrap;/, 'captura conserva saltos manuales y mantiene wrap automático');
assert.match(cssSource, /\.tactical-capture-exit\s*\{[\s\S]*position: fixed;[\s\S]*right: 7px;[\s\S]*writing-mode: vertical-rl;/, 'Salir queda en el margen exterior de la composición');

const boardRatio = 7 / 8.4;
[
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1920, 1080],
].forEach(([viewportWidth, viewportHeight]) => {
  const contentWidth = viewportWidth - 32;
  const availableHeight = viewportHeight - 32;
  const boardWidth = Math.min(896, availableHeight * boardRatio);
  const boardHeight = boardWidth / boardRatio;
  assert.ok(boardHeight <= availableHeight + 0.01, `${viewportWidth}x${viewportHeight}: campo completo sin corte vertical`);
  assert.ok(boardWidth <= contentWidth + 0.01, `${viewportWidth}x${viewportHeight}: campo completo sin corte horizontal`);
});

[
  [768, 1024],
  [390, 844],
].forEach(([viewportWidth, viewportHeight]) => {
  const contentWidth = viewportWidth - 44;
  const availableHeight = viewportHeight - 16;
  const panelHeight = Math.min(availableHeight * 0.32, availableHeight);
  const boardHeightLimit = availableHeight - panelHeight - 10;
  const boardWidth = Math.min(contentWidth, boardHeightLimit * boardRatio);
  const boardHeight = boardWidth / boardRatio;
  assert.ok(boardWidth <= contentWidth + 0.01, `${viewportWidth}x${viewportHeight}: campo móvil sin corte horizontal`);
  assert.ok(boardHeight + panelHeight + 10 <= availableHeight + 0.01, `${viewportWidth}x${viewportHeight}: campo y panel móviles caben en vertical`);
});
assert.match(cssSource, /@media \(max-width: 820px\)[\s\S]*?\.tactical-capture-stage\s*\{[\s\S]*?flex-direction: column;/, 'tablet y móvil apilan campo y panel');

const boardWidth1920 = Math.min(896, (1080 - 32) * boardRatio);
const boardWidth1600 = Math.min(896, (900 - 32) * boardRatio);
assert.ok(boardWidth1920 >= 872 && boardWidth1920 <= 874, '1920x1080: el campo crece hasta aproximadamente 873 px de ancho');
assert.ok(boardWidth1600 >= 722 && boardWidth1600 <= 724, '1600x900: el campo crece hasta aproximadamente 723 px de ancho');
assert.equal(Math.round(boardWidth1920 / boardRatio), 1048, '1920x1080: el campo aprovecha 1048 px de altura');
assert.equal(Math.round(boardWidth1600 / boardRatio), 868, '1600x900: el campo aprovecha 868 px de altura');

console.log('tacticalCaptureMode tests passed');
