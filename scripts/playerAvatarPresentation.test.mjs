import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PLAYER_AVATAR_FRAME_CLASS,
  PLAYER_AVATAR_IMAGE_CLASS,
  getPlayerAvatarInitials,
  getPlayerAvatarObjectPosition,
  getPlayerAvatarRadiusClass,
  getPlayerAvatarSource,
} from '../src/utils/playerAvatarPresentation.js';

const component = fs.readFileSync(new URL('../src/components/player/PlayerAvatar.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const delegated = fs.readFileSync(new URL('../src/components/delegated/DelegatedStatsDashboard.jsx', import.meta.url), 'utf8');
const captain = fs.readFileSync(new URL('../src/components/players/CaptainPriorityPanel.jsx', import.meta.url), 'utf8');
const reportComponent = fs.readFileSync(new URL('../src/components/print/PlayerProfilePdfReport.jsx', import.meta.url), 'utf8');
const pdfExporter = fs.readFileSync(new URL('../src/utils/playerProfilePdfExport.js', import.meta.url), 'utf8');
const printCss = fs.readFileSync(new URL('../src/styles/print.css', import.meta.url), 'utf8');

assert.equal(getPlayerAvatarSource({ name: 'Borja Rodríguez', image: 'borja-transparent.png' }), 'borja-transparent.png', 'A/C) un PNG transparente conserva exactamente su URL');
assert.equal(getPlayerAvatarSource({ name: 'Marcos Trabanco', image: 'marcos-white.jpg' }), 'marcos-white.jpg', 'B/D) un JPG con fondo conserva exactamente su URL');
assert.equal(getPlayerAvatarSource({ image: 'vertical.webp' }), 'vertical.webp', 'E) una foto vertical utiliza el mismo contrato');
assert.equal(getPlayerAvatarSource({ image: 'square.jpg' }), 'square.jpg', 'F) una foto cuadrada utiliza el mismo contrato');
assert.equal(getPlayerAvatarSource({ name: 'Sin Foto' }), '', 'G) la ausencia de foto activa el fallback');
assert.equal(getPlayerAvatarInitials({ name: 'Sin Foto' }), 'SF');
assert.equal(getPlayerAvatarObjectPosition({ imageObjectPosition: 'center 18%' }), 'center 18%', 'se conserva una posición personalizada');
assert.equal(getPlayerAvatarObjectPosition({}), 'center');

assert.match(PLAYER_AVATAR_FRAME_CLASS, /overflow-hidden/);
assert.match(PLAYER_AVATAR_FRAME_CLASS, /bg-white/);
assert.equal(getPlayerAvatarRadiusClass('h-full w-full'), 'rounded-[inherit]', 'el avatar hereda el radio cuando el llamador no lo define');
assert.equal(getPlayerAvatarRadiusClass('h-8 w-8 rounded-full'), '', 'un radio explícito del llamador se conserva');
assert.match(PLAYER_AVATAR_IMAGE_CLASS, /h-full w-full/);
assert.match(PLAYER_AVATAR_IMAGE_CLASS, /object-cover object-center/, 'todas las proporciones usan cover centrado sin deformación');
assert.match(component, /data-player-avatar="true"/);
assert.match(component, /onError=\{\(\) => setFailed\(true\)\}/, 'una URL inválida vuelve al fallback dentro del mismo marco');
assert.doesNotMatch(component, /canvas|removeBackground|backgroundRemoval|imageData/i, 'la presentación no procesa ni modifica la imagen');

const profileStart = app.indexOf('<div className="player-dossier-report');
const profileHeader = app.slice(profileStart, app.indexOf('Principales', profileStart));
assert.match(profileHeader, /bg-white[^>]*>[\s\S]*?<PlayerAvatar player=\{selectedPlayerProfile\}/, 'H) la cabecera individual usa el avatar blanco compartido');
assert.doesNotMatch(profileHeader, /<img src=\{selectedPlayerProfile\.image\}/, 'la cabecera ya no evita el componente común');
assert.match(app, /const PlayerPortrait = \(props\) => <PlayerAvatar \{\.\.\.props\} \/>/, 'Plantilla, estadísticas y alineaciones reutilizan PlayerAvatar');
assert.match(delegated, /import PlayerAvatar from '\.\.\/player\/PlayerAvatar'/, 'Registro Delegado reutiliza el mismo avatar');
assert.match(captain, /import PlayerAvatar from '\.\.\/player\/PlayerAvatar'/);

const identityDrawer = pdfExporter.slice(pdfExporter.indexOf('const drawIdentity'), pdfExporter.indexOf('const drawCompetitionTable'));
assert.match(identityDrawer, /setFillColor\(\.\.\.COLORS\.paper\)[\s\S]*?roundedRect/, 'I) el PDF vectorial pinta blanco bajo la foto antes de añadirla');
assert.match(pdfExporter, /const ratio = Math\.min\(width \/ properties\.width, height \/ properties\.height\)/, 'el PDF conserva proporciones sin deformar la foto');
assert.match(pdfExporter, /x \+ \(width - renderedWidth\) \/ 2[\s\S]*?y \+ \(height - renderedHeight\) \/ 2/, 'el PDF centra la imagen');
assert.match(reportComponent, /<PlayerAvatar player=\{\{ name: report\.identity\.name, image: report\.identity\.image \}\}/, 'la previsualización imprimible comparte el avatar');
assert.equal((printCss.match(/\.player-pdf-photo[\s\S]*?background:\s*#fff;/g) || []).length >= 1, true, 'el marco imprimible conserva fondo blanco');

console.log('player avatar presentation tests passed');
