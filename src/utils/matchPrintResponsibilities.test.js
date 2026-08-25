import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildGoalkeeperProtocolModel,
  buildMatchResponsibilityPlayers,
  normalizeMatchPrintResponsibilities,
  updateGoalkeeperProtocolSelection,
} from './matchPrintResponsibilities.js';

const guaya = { id: 'guaya-id', name: 'Nombre Guaya', shirt_name: 'GUAYA' };
const lora = { id: 'lora-id', name: 'Nombre Lora', shirtName: 'LORA' };
const quiros = { id: 'quiros-id', name: 'QUIRÓS' };

assert.deepEqual(normalizeMatchPrintResponsibilities({
  goalkeeper_protocol_primary_player_id: guaya.id,
  goalkeeper_protocol_secondary_player_id: lora.id,
}), {
  goalkeeperProtocolPrimaryPlayerId: guaya.id,
  goalkeeperProtocolSecondaryPlayerId: lora.id,
}, 'A/B: la configuración persistida del partido se hidrata con ambos IDs');

const duplicateSecondary = updateGoalkeeperProtocolSelection({
  goalkeeperProtocolPrimaryPlayerId: guaya.id,
  goalkeeperProtocolSecondaryPlayerId: '',
}, 'secondary', guaya.id);
assert.equal(duplicateSecondary.goalkeeperProtocolSecondaryPlayerId, '', 'C: el mismo jugador no puede ser segunda opción');
const duplicatePrimary = updateGoalkeeperProtocolSelection({
  goalkeeperProtocolPrimaryPlayerId: guaya.id,
  goalkeeperProtocolSecondaryPlayerId: lora.id,
}, 'primary', lora.id);
assert.equal(duplicatePrimary.goalkeeperProtocolSecondaryPlayerId, '', 'C: elegir como principal al suplente limpia la incompatibilidad');

const available = buildMatchResponsibilityPlayers([guaya, lora], [guaya, quiros]);
assert.deepEqual(available.map((player) => player.id), [guaya.id, lora.id, quiros.id], 'D: titulares y banquillo forman una convocatoria única por ID');

const model = buildGoalkeeperProtocolModel({
  settings: { goalkeeperProtocolPrimaryPlayerId: guaya.id, goalkeeperProtocolSecondaryPlayerId: lora.id },
  availablePlayers: [lora, guaya],
  allPlayers: [guaya, lora, quiros],
});
assert.equal(model.primaryName, 'GUAYA', 'J: el nombre de camiseta tiene prioridad');
assert.equal(model.secondaryName, 'LORA');
assert.equal(model.primaryIsAvailable, true, 'D: cambiar entre titular y banquillo no invalida al responsable');
assert.equal(buildGoalkeeperProtocolModel({ settings: { goalkeeperProtocolPrimaryPlayerId: quiros.id }, availablePlayers: [quiros], allPlayers: [quiros] }).primaryName, 'QUIRÓS', 'K: sin nombre de camiseta se usa name');
assert.equal(buildGoalkeeperProtocolModel({ settings: {}, availablePlayers: available, allPlayers: available }).show, false, 'F: sin principal no se muestra el protocolo');
const invalidModel = buildGoalkeeperProtocolModel({
  settings: { goalkeeperProtocolPrimaryPlayerId: guaya.id },
  availablePlayers: [lora],
  allPlayers: [guaya, lora],
});
assert.equal(invalidModel.primaryIsAvailable, false, 'un responsable fuera de convocatoria se conserva pero queda marcado como inválido');
assert.equal(invalidModel.show, false, 'una selección inválida no se publica accidentalmente en presentación o PDF');

const tabSource = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const sheetSource = fs.readFileSync(new URL('../components/print/LineupPrintSheet.jsx', import.meta.url), 'utf8');
const shirtSource = fs.readFileSync(new URL('../components/print/PlayerShirt.jsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../supabase/match_goalkeeper_protocol.sql', import.meta.url), 'utf8');
assert.match(tabSource, /goalkeeper_protocol_primary_player_id/, 'A/B/E: IMPRESIÓN guarda el principal por partido');
assert.match(tabSource, /goalkeeper_protocol_secondary_player_id/, 'A/B/E: IMPRESIÓN guarda la segunda opción por partido');
assert.match(sheetSource, /goalkeeperProtocol\.show/, 'F/G/H/I: presentación y PDF ocultan el bloque sin principal y admiten solo principal');
assert.match(shirtSource, /print-protocol-badge/, 'el principal recibe un distintivo independiente del capitán');
assert.match(migration, /references public\.jugadores\(id\) on delete set null/gi, 'los responsables se relacionan por FK con jugadores');
assert.match(migration, /partidos_goalkeeper_protocol_distinct_players_check/, 'la base de datos impide repetir el mismo jugador');

console.log('matchPrintResponsibilities tests passed');
