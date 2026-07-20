import assert from 'node:assert/strict';

import { analyzePlayerSourceHtml } from '../../supabase/functions/_shared/player-source-parser.js';

const profileHtml = `
<!doctype html>
<html><head>
  <meta property="og:type" content="profile">
  <meta property="og:title" content="Saúl García | Perfil">
  <link rel="canonical" href="https://club.example/jugador/saul-garcia">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Person","name":"Saúl García","birthDate":"1996-11-09","height":"1.83 m","jobTitle":"Lateral izquierdo","image":"https://club.example/media/saul-garcia.jpg","affiliation":{"@type":"SportsTeam","name":"C.D. Ejemplo"}}
  </script>
</head><body>
  <h1>Saúl García</h1>
  <dl><dt>Edad</dt><dd>29 años</dd><dt>Posición</dt><dd>Lateral izquierdo</dd><dt>Pie</dt><dd>Izquierda</dd><dt>Dorsal</dt><dd>3</dd></dl>
</body></html>`;

const result = analyzePlayerSourceHtml({ html: profileHtml, sourceUrl: 'https://club.example/jugador/saul-garcia' });
assert.equal(result.status, 'data_found');
assert.equal(result.pageType, 'player_profile');
assert.equal(result.sourceType, 'generic');
assert.equal(result.fields.find((field) => field.field === 'name').value, 'Saúl García');
assert.equal(result.fields.find((field) => field.field === 'dob').value, '1996-11-09');
assert.equal(result.fields.find((field) => field.field === 'height').value, '1,83 m');
assert.equal(result.fields.find((field) => field.field === 'photoUrl').value, 'https://club.example/media/saul-garcia.jpg');
assert.equal(result.fields.every((field) => field.confidence && field.sourceUrl && field.evidence), true);

const articleHtml = '<html><head><meta property="og:type" content="article"><meta property="og:title" content="Saúl decide el partido"></head><body><article><h1>Saúl decide el partido</h1><p>El lateral marcó ayer.</p></article></body></html>';
const articleResult = analyzePlayerSourceHtml({ html: articleHtml, sourceUrl: 'https://news.example/noticias/saul-decide' });
assert.equal(articleResult.status, 'not_player');
assert.equal(articleResult.fields.length, 0);

const teamHtml = '<html><head><script type="application/ld+json">{"@type":"SportsTeam","name":"Club Ejemplo"}</script></head><body><h1>Club Ejemplo</h1></body></html>';
assert.equal(analyzePlayerSourceHtml({ html: teamHtml, sourceUrl: 'https://club.example/equipo/primer-equipo' }).pageType, 'team');

const transfermarktResult = analyzePlayerSourceHtml({ html: profileHtml, sourceUrl: 'https://www.transfermarkt.es/saul/profil/spieler/123' });
assert.equal(transfermarktResult.sourceType, 'transfermarkt');

console.log('playerSourceAnalysis tests passed');
