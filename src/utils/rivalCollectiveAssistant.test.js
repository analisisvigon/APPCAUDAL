import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  RIVAL_ASSISTANT_EMPTY_STATES,
  buildRivalCollectiveAssistant,
  getRivalRecommendationListView,
  isRivalRecommendationActionable,
  sortRivalRecommendations,
} from './rivalCollectiveAssistant.js';

const baseInput = {
  rivalName: 'Rival de prueba',
  ownSystem: '4-4-2',
  rivalSystem: '4-3-3',
  collectiveProfile: {
    buildUp: '',
    blockHeight: '',
    pressureType: '',
    attackingRhythm: '',
    preferredAttack: '',
    strengths: [],
    weaknesses: [],
  },
  evidences: [],
  connections: [],
  plays: [],
  reports: [],
  videos: [],
  tacticalEvidenceReport: { contextRows: [] },
};

const profileOnly = buildRivalCollectiveAssistant({
  ...baseInput,
  collectiveProfile: { ...baseInput.collectiveProfile, strengths: ['Centros'] },
});
assert.equal(profileOnly.recommendations.defense.length, 0, 'el perfil sin evidencia concreta no genera recomendaciones');

const systemOnly = buildRivalCollectiveAssistant(baseInput);
assert.equal(systemOnly.recommendations.defense.length, 0, 'el sistema por sí solo no genera recomendaciones defensivas');
assert.equal(systemOnly.recommendations.attack.length, 0, 'el sistema por sí solo no genera recomendaciones ofensivas');

const withEvidence = buildRivalCollectiveAssistant({
  ...baseInput,
  collectiveProfile: { ...baseInput.collectiveProfile, strengths: ['Centros'] },
  evidences: [{ id: 'ev-centros', type: 'Ataque', importance: 'Alta', observation: 'Centros frecuentes buscando el segundo palo.' }],
});
assert.equal(withEvidence.recommendations.defense.length, 1, 'una regla respaldada genera una consigna');
const centerRecommendation = withEvidence.recommendations.defense[0];
assert.match(centerRecommendation.action, /^(Presionar|Cerrar|Evitar|Buscar|Atacar|Obligar|Defender|Provocar|Proteger|Replegar|Orientar|Fijar|Atraer|Saltar|Temporizar)\b/);
assert.ok(centerRecommendation.expectedImpact, 'toda recomendación incluye impacto');
assert.deepEqual(centerRecommendation.sources, ['Perfil', 'Evidencias'], 'solo conserva fuentes utilizadas realmente');
assert.ok(centerRecommendation.evidenceIds.includes('evidence:ev-centros'), 'mantiene trazabilidad hacia la evidencia real');
assert.equal(isRivalRecommendationActionable(centerRecommendation), true, 'la recomendación cumple el contrato accionable');
assert.equal(isRivalRecommendationActionable({ ...centerRecommendation, rationale: '' }), false, 'descarta una recomendación sin justificación');

const ordered = sortRivalRecommendations([
  { id: 'optional', priority: 'Opcional', confidence: 'Alta', sources: ['Perfil'], ruleOrder: 0 },
  { id: 'important-low', priority: 'Importante', confidence: 'Baja', sources: ['Perfil'], ruleOrder: 1 },
  { id: 'critical-low', priority: 'Crítica', confidence: 'Baja', sources: ['Perfil'], ruleOrder: 2 },
  { id: 'critical-high-one', priority: 'Crítica', confidence: 'Alta', sources: ['Perfil'], ruleOrder: 3 },
  { id: 'critical-high-three', priority: 'Crítica', confidence: 'Alta', sources: ['Perfil', 'Evidencias', 'Pizarra'], ruleOrder: 4 },
]);
assert.deepEqual(
  ordered.map((row) => row.id),
  ['critical-high-three', 'critical-high-one', 'critical-low', 'important-low', 'optional'],
  'ordena por prioridad, confianza y número de fuentes'
);

const sixRecommendations = Array.from({ length: 6 }, (_, index) => ({ id: `rec-${index}` }));
assert.equal(getRivalRecommendationListView(sixRecommendations, false).items.length, 5, 'muestra inicialmente un máximo de cinco');
assert.equal(getRivalRecommendationListView(sixRecommendations, false).hiddenCount, 1);
assert.equal(getRivalRecommendationListView(sixRecommendations, true).items.length, 6, 'expandir muestra el resto');
assert.equal(getRivalRecommendationListView(sixRecommendations, true).hiddenCount, 0, 'contraer y expandir mantienen un modelo determinista');

const highConfidence = buildRivalCollectiveAssistant({
  ...baseInput,
  collectiveProfile: { ...baseInput.collectiveProfile, weaknesses: ['Espalda lateral'] },
  evidences: [{ id: 'ev-back', type: 'Defensa', importance: 'Alta', observation: 'Espacio repetido a la espalda lateral.' }],
  connections: [{ id: 'cx-back', team: 'rival', type: 'Pase habitual', origin: 'Central', destination: 'Lateral', intensity: 'Alta', comment: 'El lateral salta y libera su espalda.' }],
});
assert.equal(highConfidence.recommendations.attack[0].confidence, 'Alta', 'la confianza alta exige varias fuentes independientes');
assert.deepEqual(highConfidence.recommendations.attack[0].sources, ['Perfil', 'Evidencias', 'Conexiones']);
assert.ok(highConfidence.duels.every((duel) => !/\b(?:Juan|Pedro|Carlos|Jugador)\b/i.test(duel.relation)), 'los duelos son colectivos y no contienen jugadores individuales');

const empty = buildRivalCollectiveAssistant(baseInput);
assert.equal(empty.summary.emptyMessage, RIVAL_ASSISTANT_EMPTY_STATES.profile);
assert.ok(empty.behaviors.every((behavior) => behavior.emptyMessage === RIVAL_ASSISTANT_EMPTY_STATES.behavior));
assert.equal(empty.recommendations.defenseEmptyMessage, RIVAL_ASSISTANT_EMPTY_STATES.defense);
assert.equal(empty.recommendations.attackEmptyMessage, RIVAL_ASSISTANT_EMPTY_STATES.attack);
assert.equal(empty.duelsEmptyMessage, RIVAL_ASSISTANT_EMPTY_STATES.duels);
assert.equal(empty.evidenceEmptyMessage, RIVAL_ASSISTANT_EMPTY_STATES.sources);
assert.ok(empty.evidenceCoverage.every((source) => !source.available), 'no crea chips de fuentes ficticias');

const componentSource = fs.readFileSync(new URL('../components/tactical/RivalCollectiveAssistant.jsx', import.meta.url), 'utf8');
const editorSource = fs.readFileSync(new URL('../components/tactical/CollectiveProfileEditorModal.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.match(componentSource, /lg:grid-cols-2/, 'las recomendaciones se adaptan a dos columnas sin scroll horizontal');
assert.match(componentSource, /flex-wrap/, 'los chips permiten wrap responsive');
assert.match(componentSource, /aria-expanded=\{expanded\}/, 'los desplegables exponen aria-expanded');
assert.match(componentSource, /aria-controls=\{detailsId\}/, 'la explicación está asociada a su control');
assert.match(componentSource, /focus-visible:ring-2/, 'los controles mantienen foco visible');
assert.ok(!/supabase|updateSelectedMatchFields|updateObservedCollectiveProfile|persistRival/i.test(componentSource), 'el componente de lectura no modifica datos guardados');
assert.match(componentSource, /Editar perfil colectivo/, 'el resumen ofrece un acceso visible y discreto al editor');
assert.match(editorSource, /role="dialog"/, 'el editor recuperado utiliza un diálogo semántico');
assert.match(editorSource, /aria-modal="true"/, 'el editor comunica su modalidad a tecnologías de asistencia');
assert.match(editorSource, /createPortal\(/, 'el editor no queda recortado por la vista Rival');
assert.match(editorSource, /\['Salida de balón', 'buildUp'/, 'recupera el campo de salida existente');
assert.match(editorSource, /\['Altura del bloque', 'blockHeight'/, 'recupera el campo de bloque existente');
assert.match(editorSource, /\['Tipo de presión', 'pressureType'/, 'recupera el campo de presión existente');
assert.match(editorSource, /\['Debilidades', 'weaknesses'/, 'recupera las debilidades existentes');
assert.match(editorSource, /aria-pressed=\{active\}/, 'fortalezas y debilidades son operables con teclado y tacto');
assert.match(editorSource, />\s*Cancelar\s*</, 'el editor permite cancelar el borrador');
assert.match(editorSource, /onSave\(createCollectiveProfileDraft\(draft\)\)/, 'solo Guardar entrega el borrador a persistencia');
assert.match(editorSource, /sm:max-w-3xl/, 'el modal se adapta a móvil, tablet y escritorio');
assert.match(appSource, /updateSelectedRivalObservedScouting\(\{\s*collective:/, 'guardar reutiliza el estado y persistencia existentes');
assert.match(appSource, /setIsCollectiveProfileEditorOpen\(false\)/, 'guardar o cancelar cierra el editor');
assert.match(appSource, /\['PIZARRA', 'RIVAL', 'JUGADORES', 'PLAN DE PARTIDO', 'EVIDENCIAS'\]/, 'la navegación entre pestañas permanece intacta');
assert.match(appSource, /facingSystemsView === 'PIZARRA' \? \(/, 'la pestaña Pizarra permanece independiente y se monta de forma exclusiva');

console.log('rivalCollectiveAssistant tests: ok');
