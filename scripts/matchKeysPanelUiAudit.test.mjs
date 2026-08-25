import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../src/components/tactical/MatchKeysPanel.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../src/utils/matchKeys.js', import.meta.url), 'utf8');

assert.match(component, /Claves ofensivas[\s\S]*Claves defensivas/, 'presenta las dos listas independientes');
assert.match(component, /\+ Añadir clave ofensiva[\s\S]*\+ Añadir clave defensiva/, 'cada columna dispone de su alta rápida');
assert.match(component, />Subir<[\s\S]*>Bajar<[\s\S]*>Editar<[\s\S]*>Eliminar</, 'cada tarjeta conserva las cuatro acciones solicitadas');
assert.match(component, /items\.length/, 'cada columna muestra su contador sin límite artificial');
assert.match(component, /createPortal[\s\S]*data-match-keys-capture/, 'Modo Captura aísla la presentación del resto de la navegación');
assert.match(component, /capture \? 'grid-cols-2'/, 'la captura mantiene siempre las dos columnas');
assert.match(component, /padStart\(2, '0'\)/, 'la numeración de captura es automática y visual');
assert.match(component, /break-words[\s\S]*leading-snug/, 'las claves largas hacen wrap en filas compactas');
assert.match(component, /whitespace-normal[\s\S]*\[overflow-wrap:break-word\][\s\S]*\[word-break:normal\]/, 'el texto normal envuelve por palabras sin romperse carácter a carácter');
assert.match(component, /border-t border-white\/\[0\.055\][\s\S]*>Subir<[\s\S]*>Bajar</, 'las acciones normales ocupan una segunda fila independiente del texto');
assert.match(component, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/, 'las dos columnas normales reparten el ancho disponible sin colapsar');
assert.doesNotMatch(component, /truncate/, 'ninguna clave se trunca');
assert.match(component, /!capture && editable/, 'los controles de edición desaparecen en captura');
assert.match(model, /matchKeysOffensive[\s\S]*matchKeysDefensive[\s\S]*matchKeys: flattened/, 'la persistencia tipada conserva el formato plano legado');
assert.match(model, /usesLegacyFallback: true/, 'las claves antiguas se recuperan sin migración destructiva');
assert.match(app, /<MatchKeysPanel[\s\S]*groups=\{matchKeyGroups\}[\s\S]*onChange=\{saveMatchKeyGroups\}/, 'el PRE monta el componente localizado con persistencia por partido');
assert.doesNotMatch(app, /openMatchKeyDraft|isPreKeyDraftOpen|preKeyDraft/, 'se retiró la implementación plana antigua');

console.log('match keys panel UI audit: ok');
