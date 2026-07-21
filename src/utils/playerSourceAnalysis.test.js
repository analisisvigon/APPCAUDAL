import assert from 'node:assert/strict';

import { analyzePlayerSourceHtml, extractLaPreferentePlayerPhoto } from '../../supabase/functions/_shared/player-source-parser.js';
import { validatePlayerPhotoBytes } from '../../supabase/functions/_shared/player-image-validator.js';
import {
  classifyPlayerSourceFunctionError,
  isManualPlayerPhoto,
  invokePlayerSourceAnalyzer,
} from './playerSourceFunction.js';

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

const aitorSourceUrl = 'https://www.lapreferente.com/J148655/aitor-ferrero.html';
const aitorPhotoUrl = 'https://www.lapreferente.com/imagenes/jugadores/20202021/148655.jpg?f=1612405277';
const aitorFixture = `<html><head><title>Aitor Ferrero - Ex-Club Siero :: La Web del Fútbol Modesto ::</title><link rel="canonical" href="${aitorSourceUrl}"><meta name="description" content="Aitor Ferrero, Ex-Jugador de Fútbol del Club Siero. Ficha Técnica."><meta property="og:image" content="${aitorPhotoUrl}"></head><body><img src="/publicidad/banner.jpg" width="970" height="250"><h1>Aitor Ferrero</h1></body></html>`;
const aitorPhoto = extractLaPreferentePlayerPhoto({ html: aitorFixture, sourceUrl: aitorSourceUrl });
assert.equal(aitorPhoto.sourceType, 'lapreferente');
assert.equal(aitorPhoto.status, 'photo_found');
assert.equal(aitorPhoto.photo.url, aitorPhotoUrl);
assert.equal(aitorPhoto.photo.selector, 'meta[property="og:image"]');
assert.equal(Object.hasOwn(aitorPhoto.photo, 'value'), false, 'photo_only no devuelve campos del perfil');

const relativePlayerPhoto = extractLaPreferentePlayerPhoto({
  sourceUrl: 'https://www.lapreferente.com/J999999/jugador-prueba.html',
  html: '<html><head><base href="https://www.lapreferente.com/"><title>Jugador Prueba - Ficha</title></head><body><h1>Jugador Prueba</h1><img class="foto-jugador" alt="Jugador Prueba" src="imagenes/jugadores/2026/999999.webp" width="320" height="400"><img src="/imagenes/escudos/club.png" width="300" height="300"></body></html>',
});
assert.equal(relativePlayerPhoto.photo.url, 'https://www.lapreferente.com/imagenes/jugadores/2026/999999.webp');
assert.equal(relativePlayerPhoto.photo.width, 320);

const onlyAds = extractLaPreferentePlayerPhoto({
  sourceUrl: 'https://www.lapreferente.com/J999998/sin-foto.html',
  html: '<html><head><title>Jugador Sin Foto</title><meta property="og:image" content="/publicidad/banner-campana.jpg"></head><body><h1>Jugador Sin Foto</h1><img src="/ads/anuncio.jpg" width="970" height="250"><img src="/imagenes/escudos/club.png" width="300" height="300"><img src="/imagenes/jugadores/sin-foto.gif" width="300" height="300"></body></html>',
});
assert.equal(onlyAds.status, 'no_photo');
assert.equal(onlyAds.photo, null);

const tooSmall = extractLaPreferentePlayerPhoto({
  sourceUrl: 'https://www.lapreferente.com/J999997/foto-mini.html',
  html: '<html><head><title>Jugador Mini</title></head><body><h1>Jugador Mini</h1><img alt="Jugador Mini" src="/imagenes/jugadores/mini.jpg" width="90" height="120"></body></html>',
});
assert.equal(tooSmall.status, 'no_photo');

assert.equal(isManualPlayerPhoto({ imageSource: 'manual_upload' }), true);
assert.equal(isManualPlayerPhoto({ fieldSources: { image: { source: 'manual_url' } } }), true);
assert.equal(isManualPlayerPhoto({ imageSource: 'imported_lapreferente' }), false);
assert.equal(isManualPlayerPhoto({}), false);

const pngBytes = new Uint8Array(24);
pngBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
new DataView(pngBytes.buffer).setUint32(16, 300);
new DataView(pngBytes.buffer).setUint32(20, 300);
assert.deepEqual(validatePlayerPhotoBytes(pngBytes), { ok: true, mimeType: 'image/png', width: 300, height: 300, byteLength: 24 });
new DataView(pngBytes.buffer).setUint32(16, 100);
assert.equal(validatePlayerPhotoBytes(pngBytes).ok, false);

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x2c, 0x01, 0x2c, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
assert.deepEqual(validatePlayerPhotoBytes(jpegBytes), { ok: true, mimeType: 'image/jpeg', width: 300, height: 300, byteLength: 17 });

const webpBytes = new Uint8Array(30);
webpBytes.set([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8X')]);
webpBytes[24] = 0x2b;
webpBytes[25] = 0x01;
webpBytes[27] = 0x2b;
webpBytes[28] = 0x01;
assert.deepEqual(validatePlayerPhotoBytes(webpBytes), { ok: true, mimeType: 'image/webp', width: 300, height: 300, byteLength: 30 });

const missingFunction = await classifyPlayerSourceFunctionError({
  name: 'FunctionsHttpError',
  context: new Response('{"message":"Function not found"}', { status: 404, headers: { 'content-type': 'application/json' } }),
});
assert.equal(missingFunction.code, 'not_deployed');
assert.match(missingFunction.message, /no está desplegada/i);

let invocationOptions;
const successfulClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'session-jwt' } }, error: null }) },
  functions: {
    invoke: async (name, options) => {
      assert.equal(name, 'analyze-player-source');
      invocationOptions = options;
      return { data: { ok: true, status: 'no_data', fields: [] }, error: null };
    },
  },
};
assert.equal((await invokePlayerSourceAnalyzer(successfulClient, 'https://example.test/player')).status, 'no_data');
assert.equal(invocationOptions.headers.Authorization, 'Bearer session-jwt');
assert.equal(invocationOptions.body.url, 'https://example.test/player');
assert.equal(invocationOptions.body.mode, 'full_analysis');

await invokePlayerSourceAnalyzer(successfulClient, aitorSourceUrl, { mode: 'photo_only' });
assert.equal(invocationOptions.body.mode, 'photo_only');
assert.equal(invocationOptions.body.url, aitorSourceUrl);

await invokePlayerSourceAnalyzer(successfulClient, aitorPhotoUrl, { mode: 'store_photo', photoUrl: aitorPhotoUrl, playerId: 'player-id' });
assert.deepEqual(invocationOptions.body, { mode: 'store_photo', photoUrl: aitorPhotoUrl, playerId: 'player-id' });

await assert.rejects(
  invokePlayerSourceAnalyzer({ auth: { getSession: async () => ({ data: { session: null }, error: null }) } }, 'https://example.test/player'),
  (error) => error.code === 'authentication',
);

console.log('playerSourceAnalysis tests passed');
